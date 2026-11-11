/**
 * The four ways past a place, as four small wooden blocks standing at the far edge of the table, in front of the
 * narrator, each with its word cut on the face toward you: Talk, Sneak, Force, Pay (docs/DESIGN.md, 1.5).
 *
 * When you come to a place, the narrator stands up the blocks for the ways there are; a way the place does not have
 * stays lying face down. When a way fails and is closed to you, the narrator tips its block over. When the place is
 * behind you, they are all laid down again. So a glance across the table says what is still open, with nothing on
 * the screen but the room. They are only shown: you never click them.
 */
import { sound } from "./sound.js";
import { BoxGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial, SRGBColorSpace, Vector3, type Material } from "three";
import type { Way } from "../engine/moment.js";
import { mk } from "./textures.js";
import { ease, type Reacher, type Step, type Tracks } from "./track.js";

export type WayState = "open" | "closed" | "none";

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const ORDER: readonly Way[] = ["talk", "sneak", "force", "pay"];
const WORD: Record<Way, string> = { talk: "Talk", sneak: "Sneak", force: "Force", pay: "Pay" };
const SERIF = `"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif`;

/**
 * A block's measures, and where the row stands: just beyond the far edge of the map (z -0.484), in front of the
 * narrator's hands and to the right of the deck, so it never hides the deck. Big enough that its word can be read from
 * your seat, nearly two arm's lengths away; lying down, a block just reaches the edge of the map.
 */
const W = 0.092, H = 0.044, D = 0.022;
const ROW = V(0.2, 0, -0.535);
const STEP = 0.1;

interface Block {
  pivot: Group;
  /** 1 standing, 0 lying face down. */
  k: number;
  state: WayState;
}

/** The face of a block: its word, cut and darkened, on pale wood. */
function face(word: string): HTMLCanvasElement | OffscreenCanvas {
  const [c, g] = mk(256, 118);
  const grad = g.createLinearGradient(0, 0, 0, 118);
  grad.addColorStop(0, "#d9c79c");
  grad.addColorStop(1, "#b9a172");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 118);
  g.strokeStyle = "rgba(60,36,14,0.55)";
  g.lineWidth = 5;
  g.strokeRect(9, 9, 238, 100);
  g.fillStyle = "#2a1a0c";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `bold 64px ${SERIF}`;
  g.fillText(word.toUpperCase(), 128, 64);
  return c;
}

export class WayBlocks {
  readonly group = new Group();
  private blocks = new Map<Way, Block>();
  private mats: Material[] = [];
  private textures: CanvasTexture[] = [];
  private geo = new BoxGeometry(W, H, D);

  constructor(private narrator: Reacher, private tracks: Tracks, private reduced: boolean) {
    const wood = new MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.75 });
    this.mats.push(wood);
    ORDER.forEach((way, i) => {
      const t = new CanvasTexture(face(WORD[way]) as HTMLCanvasElement);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      this.textures.push(t);
      // It gives back a little light of its own, so its word can be read across a dark table.
      const front = new MeshStandardMaterial({ map: t, roughness: 0.7, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.1 });
      this.mats.push(front);
      // The faces of a box: +x, -x, +y, -y, +z (toward you: the word), -z.
      const mesh = new Mesh(this.geo, [wood, wood, wood, wood, front, wood]);
      mesh.castShadow = mesh.receiveShadow = true;
      // The pivot is the block's bottom front edge, so it tips over toward you, face down.
      mesh.position.set(0, H / 2, -D / 2);
      const pivot = new Group();
      pivot.add(mesh);
      pivot.position.copy(ROW).add(V(i * STEP, 0, (i % 2) * 0.006));
      pivot.rotation.y = -0.06 + i * 0.03;
      this.group.add(pivot);
      const b: Block = { pivot, k: 0, state: "none" };
      this.blocks.set(way, b);
      this.pose(b);
    });
  }

  private pose(b: Block): void {
    b.pivot.rotation.x = (1 - b.k) * (Math.PI / 2);
  }

  /** The top of a block as it stands now, where the narrator's fingers go. */
  private top(b: Block): Vector3 {
    const a = (1 - b.k) * (Math.PI / 2);
    return b.pivot.position.clone().add(V(0, Math.cos(a) * H + 0.004, Math.sin(a) * H - D / 2));
  }

  /** What each block says, as it stands. */
  get states(): Record<Way, WayState> {
    return Object.fromEntries(ORDER.map((w) => [w, this.blocks.get(w)!.state])) as Record<Way, WayState>;
  }

  /**
   * Stand up the blocks of the ways that are open and tip over the rest, one by one with the narrator's hand. With no
   * states, every block is laid down. Resolves when the table shows it.
   */
  show(states: Partial<Record<Way, WayState>> | null): Promise<void> {
    const steps: Step[] = [];
    const n = this.narrator;
    for (const way of ORDER) {
      const b = this.blocks.get(way)!;
      const state = states?.[way] ?? "none";
      const want = state === "open" ? 1 : 0;
      b.state = state;
      if (Math.abs(b.k - want) < 1e-3) continue;
      if (this.reduced) {
        b.k = want;
        this.pose(b);
        continue;
      }
      const arm = n.armFor(b.pivot.position);
      let from = 0;
      steps.push(
        { dur: 0.12, tick: () => n.reach(arm, this.top(b)), until: () => n.reached(arm) > 0.8 && n.fingertips(arm).distanceTo(this.top(b)) < 0.05, patience: 1.2 },
        {
          dur: 0.24,
          begin: () => (from = b.k),
          tick: (u) => {
            b.k = from + (want - from) * ease(u);
            this.pose(b);
            n.reach(arm, this.top(b));
            // A block tipped over, or stood up again, lands on the wood.
            if (u >= 1) sound.play("knock", { x: b.pivot.position.x, gain: 0.55, rate: want ? 1.15 : 0.95 });
          },
        },
        { dur: 0.06, begin: () => n.reach(arm, null) },
      );
    }
    return this.tracks.run(steps);
  }

  dispose(): void {
    this.geo.dispose();
    for (const t of this.textures) t.dispose();
    for (const m of this.mats) m.dispose();
  }
}
