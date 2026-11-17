/**
 * The other players at a table for several, seen from your chair: each sits at a side of the table as a cloaked
 * figure with a picture for a face and their character's name under it. You see them by looking to that side
 * (room.ts turns the view); at their own tables, they see you the same way.
 *
 * The pictures are stand-ins (assets/seats, bundled by scripts/embed.ts): which one a seat gets is decided by the
 * game from the seat's place at the table, so every player sees the same picture for the same person.
 */
import { CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Texture, Vector3 } from "three";
import { SEAT_PICTURES } from "../embedded/seats.js";

export interface PlayerSeat {
  id: string;
  /** Their character's name. */
  name: string;
  /** Which stand-in picture: any whole number; it wraps around the pictures there are. */
  picture: number;
  /** Their character's story has ended: they sit on, dimmed. */
  out?: boolean;
}

const FILES = Object.keys(SEAT_PICTURES).sort();

/** Where the others sit, nearest first, a side at a time in turn: -1 is your left. The table's edge is at x = 0.95. */
const SPOTS: { side: -1 | 1; x: number; z: number }[] = [
  { side: -1, x: -1.28, z: 0.3 },
  { side: 1, x: 1.28, z: 0.3 },
  { side: -1, x: -1.28, z: -0.3 },
  { side: 1, x: 1.28, z: -0.3 },
  { side: -1, x: -1.28, z: 0.88 },
  { side: 1, x: 1.28, z: 0.88 },
  { side: -1, x: -1.2, z: -0.85 },
  { side: 1, x: 1.2, z: -0.85 },
];
/** Head height of a seated figure, and the size of the picture that is its face. */
const HEAD_Y = 0.44, FACE = 0.4;
/** What a figure turns its face toward: the middle of the table, a little toward you. */
const FACING = new Vector3(0, HEAD_Y, 0.55);

interface Figure {
  seat: PlayerSeat;
  group: Group;
  face: MeshStandardMaterial;
  plate: Mesh;
  plateText: string;
  phase: number;
  side: -1 | 1;
}

export class Players {
  readonly group = new Group();
  private figures: Figure[] = [];
  private textures = new Map<number, Texture>();
  private made: { dispose(): void }[] = [];

  /** The stand-in picture for a number, decoded once. */
  private picture(n: number): Texture | null {
    if (!FILES.length) return null;
    const i = ((n % FILES.length) + FILES.length) % FILES.length;
    let t = this.textures.get(i);
    if (!t) {
      const img = new Image();
      t = new Texture(img);
      t.colorSpace = SRGBColorSpace;
      const tex = t;
      img.onload = () => (tex.needsUpdate = true);
      img.src = `data:image/webp;base64,${SEAT_PICTURES[FILES[i]!]}`;
      this.textures.set(i, t);
      this.made.push(t);
    }
    return t;
  }

  private nameplate(name: string): CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 96;
    const g = c.getContext("2d")!;
    g.fillStyle = "#e9dfc8";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "rgba(60,40,24,.55)";
    g.lineWidth = 6;
    g.strokeRect(5, 5, c.width - 10, c.height - 10);
    g.fillStyle = "#2a1c12";
    g.textAlign = "center";
    g.textBaseline = "middle";
    let size = 54;
    do {
      g.font = `${size}px Georgia, 'Times New Roman', serif`;
      size -= 3;
    } while (size > 20 && g.measureText(name).width > c.width - 44);
    g.fillText(name, c.width / 2, c.height / 2 + 3);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    this.made.push(t);
    return t;
  }

  /** Everyone else at the table, in the table's order: the whole list every time. */
  set(seats: readonly PlayerSeat[]): void {
    const same = seats.length === this.figures.length && seats.every((s, i) => this.figures[i]!.seat.id === s.id && this.figures[i]!.seat.picture === s.picture);
    if (!same) {
      for (const f of this.figures) this.group.remove(f.group);
      this.figures = seats.slice(0, SPOTS.length).map((seat, i) => this.figure(seat, SPOTS[i]!));
    }
    this.figures.forEach((f, i) => {
      const seat = seats[i]!;
      f.seat = seat;
      if (f.plateText !== seat.name) {
        (f.plate.material as MeshStandardMaterial).map = this.nameplate(seat.name);
        (f.plate.material as MeshStandardMaterial).needsUpdate = true;
        f.plateText = seat.name;
      }
      // Someone whose story has ended sits on in shadow.
      f.face.color.set(seat.out ? 0x3a3530 : 0xffffff);
      f.face.emissiveIntensity = seat.out ? 0.04 : 0.28;
    });
  }

  private figure(seat: PlayerSeat, spot: (typeof SPOTS)[number]): Figure {
    const group = new Group();
    group.position.set(spot.x, 0, spot.z);
    // Turned toward the table, and a little toward you.
    group.rotation.y = Math.atan2(FACING.x - spot.x, FACING.z - spot.z);
    const cloth = new MeshStandardMaterial({ color: new Color(0x17100b), roughness: 1 });
    // Shoulders under the picture, widening down into the dark below the table's edge.
    const body = new Mesh(new CylinderGeometry(0.2, 0.31, 0.9, 16, 1, false), cloth);
    body.position.y = HEAD_Y - FACE / 2 - 0.03 - 0.45;
    const map = this.picture(seat.picture);
    const face = new MeshStandardMaterial({ map, emissive: new Color(0xffffff), emissiveMap: map, emissiveIntensity: 0.28, roughness: 0.9, side: DoubleSide });
    const head = new Mesh(new PlaneGeometry(FACE, FACE), face);
    head.position.set(0, HEAD_Y, 0.02);
    // The back of the picture, so it is not seen through from behind.
    const back = new Mesh(new PlaneGeometry(FACE + 0.02, FACE + 0.02), cloth);
    back.position.set(0, HEAD_Y, 0.012);
    const plate = new Mesh(new PlaneGeometry(FACE, FACE * 0.19), new MeshStandardMaterial({ map: this.nameplate(seat.name), emissive: new Color(0xffffff), emissiveIntensity: 0.06, roughness: 0.9 }));
    // The name, worn on the chest.
    plate.position.set(0, HEAD_Y - FACE / 2 - 0.12, 0.225);
    group.add(body, back, head, plate);
    this.made.push(cloth, face, body.geometry, head.geometry, back.geometry, plate.geometry, plate.material as MeshStandardMaterial);
    this.group.add(group);
    return { seat, group, face, plate, plateText: seat.name, phase: spot.x * 3.1 + spot.z * 1.7, side: spot.side };
  }

  /** Whether anyone sits on that side (-1 your left, 1 your right). */
  has(side: -1 | 1): boolean {
    return this.figures.some((f) => f.side === side);
  }

  /** Where to look to see who sits on that side: between their faces. Null when nobody does. */
  look(side: -1 | 1): Vector3 | null {
    const there = this.figures.filter((f) => f.side === side);
    if (!there.length) return null;
    const at = new Vector3();
    for (const f of there) at.add(new Vector3(f.group.position.x, HEAD_Y - 0.05, f.group.position.z));
    return at.multiplyScalar(1 / there.length);
  }

  /** A little life: each sways slightly in their seat. */
  update(t: number, still: boolean): void {
    if (still) return;
    for (const f of this.figures) {
      f.group.position.y = Math.sin(t * 0.7 + f.phase) * 0.006;
      f.group.rotation.z = Math.sin(t * 0.45 + f.phase * 1.3) * 0.012;
    }
  }

  dispose(): void {
    for (const m of this.made.splice(0)) m.dispose();
    this.figures = [];
    this.textures.clear();
  }
}
