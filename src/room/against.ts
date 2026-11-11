/**
 * The narrator's slips against you (docs/SYSTEMS.md, 7, "two dice, keep the worse"): when it makes a thing turn against
 * you ("they are watching for you"), it writes that on a paper slip in dark red ink and lays it on its side of the table,
 * by the bowl of dread. Your next try by that way throws two dice and keeps the worse; then the narrator takes the slip back.
 * The slip is folded once and stood up like a little tent, leaning back, so its words can be read from your
 * chair. It is only shown: you never click it.
 */
import { sound } from "./sound.js";
import { CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from "three";
import type { Against } from "../engine/moment.js";
import { mk } from "./textures.js";
import { ease, Held, type Reacher, type Step, type Tracks } from "./track.js";

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const SERIF = `"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif`;

/**
 * Where the first slip lies: on the narrator's side, right of the way blocks and left of the bowl of dread, where the
 * balance cannot hide it from your seat. The next lies nearer you.
 */
const AT = V(0.5, 0, -0.7);
const STEP = V(-0.008, 0, 0.115);
/** A face of the folded slip, and how far it leans back from upright. */
const W = 0.15, D = 0.037, LEAN = 0.42;

/** A slip of old paper with the words in dark red. */
function paper(name: string): HTMLCanvasElement {
  const [c, g] = mk(512, 136);
  g.fillStyle = "#cdbd98";
  g.fillRect(0, 0, 512, 136);
  // Torn, not cut: a ragged right edge, and the paper darker toward it.
  const fade = g.createLinearGradient(0, 0, 512, 0);
  fade.addColorStop(0, "rgba(80,50,20,0)");
  fade.addColorStop(1, "rgba(80,50,20,0.22)");
  g.fillStyle = fade;
  g.fillRect(0, 0, 512, 136);
  g.fillStyle = "#cdbd98";
  g.beginPath();
  g.moveTo(498, 0);
  for (let y = 0; y <= 136; y += 8) g.lineTo(498 + ((y * 37) % 13) - 4, y);
  g.lineTo(512, 136);
  g.lineTo(512, 0);
  g.closePath();
  g.globalCompositeOperation = "destination-out";
  g.fill();
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "#6e1010";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const text = name.charAt(0).toUpperCase() + name.slice(1);
  let size = 52;
  do {
    g.font = `italic ${size}px ${SERIF}`;
    size -= 3;
  } while (g.measureText(text).width > 450 && size > 24);
  g.fillText(text, 250, 70);
  return c as HTMLCanvasElement;
}

interface SlipView {
  id: string;
  mesh: Group;
  tex: CanvasTexture;
  mat: MeshStandardMaterial;
}

export class AgainstSlips {
  readonly group = new Group();
  private slips: SlipView[] = [];
  private geo = new PlaneGeometry(W, D);
  private backMat = new MeshStandardMaterial({ color: 0xb5a47f, roughness: 0.95 });

  constructor(private narrator: Reacher, private tracks: Tracks, private reduced: boolean) {}

  /** The ids of the slips on the table now. */
  get ids(): string[] {
    return this.slips.map((s) => s.id);
  }

  private spot(i: number): Vector3 {
    return AT.clone().add(STEP.clone().multiplyScalar(i));
  }

  private make(a: Against): SlipView {
    const tex = new CanvasTexture(paper(a.name));
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.92, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.05 });
    // Folded along the top: the face with the words leans back, toward you; the plain back faces the dark.
    const mesh = new Group();
    const front = new Mesh(this.geo, mat);
    front.rotation.x = -LEAN;
    front.position.set(0, (Math.cos(LEAN) * D) / 2, (Math.sin(LEAN) * D) / 2);
    const back = new Mesh(this.geo, this.backMat);
    back.rotation.x = Math.PI + LEAN;
    back.position.set(0, (Math.cos(LEAN) * D) / 2, -(Math.sin(LEAN) * D) / 2);
    front.castShadow = back.castShadow = true;
    front.receiveShadow = true;
    mesh.add(front, back);
    mesh.rotation.y = 0.05;
    this.group.add(mesh);
    return { id: a.id, mesh, tex, mat };
  }

  private drop(s: SlipView): void {
    this.group.remove(s.mesh);
    s.tex.dispose();
    s.mat.dispose();
  }

  /** Lay out the slips to match `list`: ones gone are taken back by the narrator's hand, new ones laid down by it. */
  show(list: readonly Against[]): Promise<void> {
    const gone = this.slips.filter((s) => !list.some((a) => a.id === s.id));
    const fresh = list.filter((a) => !this.slips.some((s) => s.id === a.id));
    if (this.reduced) {
      for (const s of gone) this.drop(s);
      this.slips = this.slips.filter((s) => !gone.includes(s));
      for (const a of fresh) this.slips.push(this.make(a));
      this.slips.forEach((s, i) => s.mesh.position.copy(this.spot(i)));
      return Promise.resolve();
    }
    const n = this.narrator;
    const steps: Step[] = [];
    for (const s of gone) {
      const arm = n.armFor(s.mesh.position);
      const above = (h: number): Vector3 => this.group.localToWorld(s.mesh.position.clone().setY(h));
      steps.push(
        { dur: 0.2, tick: () => n.reach(arm, above(0.1)), until: () => n.reached(arm) > 0.8 && n.fingertips(arm).distanceTo(above(0.1)) < 0.05, patience: 1.4 },
        { dur: 0.2, tick: (u) => n.reach(arm, above(0.1 - 0.045 * ease(u))) },
        // Picked up, and gone back to the narrator's side of the dark.
        {
          dur: 0.35,
          tick: (u) => {
            n.reach(arm, above(0.055 + 0.1 * ease(u)).add(V(0, 0, -0.08 * u)));
            s.mesh.position.copy(this.group.worldToLocal(n.fingertips(arm).clone()).add(V(0, -D, 0)));
          },
        },
        {
          dur: 0.04,
          begin: () => {
            this.drop(s);
            this.slips = this.slips.filter((x) => x !== s);
            n.reach(arm, null);
            sound.play("swish", { x: AT.x, gain: 0.6 });
          },
        },
      );
    }
    // The ones left close up, then each new one is laid down in the next place.
    steps.push({
      dur: 0.25,
      begin: () => {
        this.slips.forEach((s) => s.mesh.userData.from = s.mesh.position.clone());
      },
      tick: (u) => this.slips.forEach((s, i) => s.mesh.position.lerpVectors(s.mesh.userData.from as Vector3, this.spot(i), ease(u))),
    });
    for (const a of fresh) {
      let s: SlipView;
      let i = 0;
      let start = V(0, 0, 0);
      let held: Held;
      const arm = n.armFor(this.group.localToWorld(this.spot(this.slips.length + fresh.indexOf(a))));
      steps.push(
        {
          dur: 0.25,
          tick: () => n.reach(arm, this.group.localToWorld(this.spot(this.slips.length).add(V(0, 0.06, -0.05)))),
          until: () => n.reached(arm) > 0.8,
          patience: 1.4,
        },
        {
          dur: 0.04,
          begin: () => {
            i = this.slips.length;
            s = this.make(a);
            this.slips.push(s);
            start = this.group.worldToLocal(n.fingertips(arm).clone()).add(V(0, -D, 0));
            s.mesh.position.copy(start);
            // Held by its top edge all the way down (track.ts).
            held = new Held(n, arm, s.mesh, () => this.tracks.now, (out) => this.group.localToWorld(out.copy(s.mesh.position).add(V(0, D, 0))));
            held.take();
          },
        },
        {
          dur: 0.4,
          until: () => held.there,
          patience: 0.8,
          tick: (u) => {
            const to = this.spot(i);
            s.mesh.position.lerpVectors(start, to, ease(u));
            held.follow();
            if (u >= 1 && held.there && !s.mesh.userData.heard) {
              s.mesh.userData.heard = true;
              sound.play("pat", { x: AT.x, gain: 0.7, rate: 1.2 });
            }
          },
        },
        { dur: 0.15 },
        { dur: 0.05, begin: () => n.reach(arm, null) },
      );
    }
    return this.tracks.run(steps);
  }

  dispose(): void {
    for (const s of this.slips) this.drop(s);
    this.slips = [];
    this.geo.dispose();
    this.backMat.dispose();
  }
}
