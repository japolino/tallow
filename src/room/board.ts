/**
 * The contest board (docs/SYSTEMS.md, 6.1): a dark leather cloth the narrator unrolls over the middle of the map when
 * it comes to a contest, and the wooden dials it sets on it. On its side, a dial for each foe, with a small dark piece
 * standing by it, and a dial for the danger that is coming; on yours, your own dial. Each dial is a turned wooden disc
 * with a ring of holes; the narrator drops a painted peg in a hole for every notch marked. A paper slip by each dial
 * says whose it is. When the contest is over the dials are taken away and the leather rolled up again.
 * It is only shown: you never click it.
 */
import { sound } from "./sound.js";
import { CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace, Vector3, type Material } from "three";
import type { Contest, Dial } from "../engine/contest.js";
import { mk, noise2 } from "./textures.js";
import { ease, type Reacher, type Step, type Tracks } from "./track.js";

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const SERIF = `"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif`;

/** The leather: over the middle of the map (which runs from z -0.484 to 0.244), clear of the way blocks and the notebook. */
const W = 0.8, D = 0.44;
const AT = V(0, 0.0085, -0.13);
const ROLL_R = 0.012;
/** Where the dials stand on the leather: the narrator's side far, yours near. */
const FAR = -0.095, NEAR = 0.095;
const DIAL_H = 0.008;
const PEG_H = 0.012;

const radius = (notches: number): number => 0.036 + 0.0035 * notches;

/** A hole's place on a dial of `n` notches, from the far side round to your right, as a clock goes seen from above. */
function hole(i: number, n: number, r: number): Vector3 {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return V(Math.cos(a) * r * 0.74, DIAL_H, Math.sin(a) * r * 0.74);
}

/** The leather's face: dark, grained, with a stitched border. */
function leather(): HTMLCanvasElement {
  const [c, g] = mk(1024, 564);
  const n = noise2(11);
  const img = g.createImageData(1024, 564);
  for (let y = 0; y < 564; y++)
    for (let x = 0; x < 1024; x++) {
      const v = 0.7 * n(x / 9, y / 9) + 0.3 * n(x / 2.5, y / 2.5);
      const i = (y * 1024 + x) * 4;
      img.data[i] = 46 + v * 22;
      img.data[i + 1] = 27 + v * 13;
      img.data[i + 2] = 18 + v * 8;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  // A darker band round the edge, and the stitching inside it.
  g.strokeStyle = "rgba(10,5,3,0.55)";
  g.lineWidth = 34;
  g.strokeRect(0, 0, 1024, 564);
  g.strokeStyle = "rgba(196,160,110,0.65)";
  g.lineWidth = 3;
  g.setLineDash([14, 10]);
  g.strokeRect(30, 30, 964, 504);
  g.setLineDash([]);
  // A faint line across the middle: their side and yours.
  g.strokeStyle = "rgba(196,160,110,0.18)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(60, 300);
  g.lineTo(964, 300);
  g.stroke();
  return c as HTMLCanvasElement;
}

/** A paper slip with a name written on it. */
function slip(name: string): HTMLCanvasElement {
  const [c, g] = mk(512, 128);
  g.fillStyle = "#d9ccaa";
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = "rgba(90,60,30,0.35)";
  g.lineWidth = 4;
  g.strokeRect(4, 4, 504, 120);
  g.fillStyle = "#2a1a0c";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const text = name.charAt(0).toUpperCase() + name.slice(1);
  let size = 64;
  do {
    g.font = `italic ${size}px ${SERIF}`;
    size -= 4;
  } while (g.measureText(text).width > 470 && size > 28);
  g.fillText(text, 256, 68);
  return c as HTMLCanvasElement;
}

interface DialView {
  id: string;
  group: Group;
  notches: number;
  pegs: Mesh[];
  label: { mesh: Mesh; tex: CanvasTexture; mat: MeshStandardMaterial; name: string };
  disc: CylinderGeometry;
  /** A foe's standing piece; null for the danger and for you. */
  piece: Group | null;
}

/** A foe's piece laid on its side (`k` 1) or standing (0). */
function lay(piece: Group | null, k: number): void {
  if (!piece) return;
  piece.rotation.x = -k * (Math.PI / 2);
  piece.position.y = k * 0.008;
}

export class Board {
  readonly group = new Group();
  private sheet: Mesh;
  private roll: Mesh;
  private sheetTex: CanvasTexture;
  private mats: Material[] = [];
  private geos: (CylinderGeometry | PlaneGeometry | SphereGeometry)[] = [];
  private dials = new Map<string, DialView>();
  private wood: MeshStandardMaterial;
  private dangerWood: MeshStandardMaterial;
  private paleWood: MeshStandardMaterial;
  private pegMat: MeshStandardMaterial;
  private holeMat: MeshStandardMaterial;
  private pieceMat: MeshStandardMaterial;
  private pegGeo = new CylinderGeometry(0.0042, 0.0046, PEG_H, 10);
  private holeGeo = new CylinderGeometry(0.0044, 0.0044, 0.0008, 10);
  private pieceBody = new CylinderGeometry(0.008, 0.012, 0.03, 14);
  private pieceHead = new SphereGeometry(0.0085, 14, 10);
  private slipGeo = new PlaneGeometry(0.14, 0.035);
  /** How far the leather is unrolled, 0 to 1. */
  private k = 0;
  private open = false;

  constructor(private narrator: Reacher, private tracks: Tracks, private reduced: boolean) {
    this.sheetTex = new CanvasTexture(leather());
    this.sheetTex.colorSpace = SRGBColorSpace;
    this.sheetTex.anisotropy = 4;
    const hide = new MeshStandardMaterial({ map: this.sheetTex, roughness: 0.82 });
    const rollMat = new MeshStandardMaterial({ color: 0x2a1810, roughness: 0.8 });
    this.wood = new MeshStandardMaterial({ color: 0x7a5434, roughness: 0.6 });
    this.dangerWood = new MeshStandardMaterial({ color: 0x4a1c14, roughness: 0.6 });
    this.paleWood = new MeshStandardMaterial({ color: 0xb08a5c, roughness: 0.6 });
    this.pegMat = new MeshStandardMaterial({ color: 0xb3261c, roughness: 0.45, emissive: 0x3a0806, emissiveIntensity: 0.4 });
    this.holeMat = new MeshStandardMaterial({ color: 0x120a06, roughness: 0.9 });
    this.pieceMat = new MeshStandardMaterial({ color: 0x15100d, roughness: 0.5 });
    this.mats.push(hide, rollMat, this.wood, this.dangerWood, this.paleWood, this.pegMat, this.holeMat, this.pieceMat);

    // The sheet grows from its left edge as it is unrolled.
    const sheetGeo = new PlaneGeometry(W, D);
    sheetGeo.rotateX(-Math.PI / 2);
    sheetGeo.translate(W / 2, 0, 0);
    this.sheet = new Mesh(sheetGeo, hide);
    this.sheet.position.set(-W / 2, 0, 0);
    this.sheet.receiveShadow = true;
    const rollGeo = new CylinderGeometry(ROLL_R, ROLL_R, D + 0.01, 18);
    rollGeo.rotateX(Math.PI / 2);
    this.roll = new Mesh(rollGeo, rollMat);
    this.roll.castShadow = true;
    this.geos.push(sheetGeo, rollGeo);
    this.group.add(this.sheet, this.roll);
    this.group.position.copy(AT);
    this.pose();
    this.group.visible = false;
  }

  /** The sheet and its roll as far unrolled as `k`. */
  private pose(): void {
    const k = Math.max(0.001, this.k);
    this.sheet.scale.x = k;
    // The roll gets thinner as it gives out leather, and sits on the table at the sheet's edge.
    const r = ROLL_R * (0.55 + 0.45 * (1 - this.k));
    this.roll.scale.set(r / ROLL_R, 1, r / ROLL_R);
    this.roll.position.set(-W / 2 + this.k * W, r - 0.002, 0);
  }

  /** The world point over the roll's far end with the leather `k` unrolled, where the narrator's fingers push it from its own side of the table. */
  private rollTop(k = this.k): Vector3 {
    return this.group.localToWorld(V(-W / 2 + k * W, ROLL_R + 0.02, -D / 2 + 0.06));
  }

  /**
   * The narrator's hand goes to the roll and pushes it across to `to` (1 unrolled, 0 rolled up). The hand leads and the
   * leather follows it, so the roll never runs ahead of the fingers that move it.
   */
  private push(to: 0 | 1): Step[] {
    const n = this.narrator;
    const arm = n.armFor(this.rollTop());
    const follow = () => {
      const x = this.group.worldToLocal(n.fingertips(arm).clone()).x;
      const k = Math.min(1, Math.max(0, (x + W / 2) / W));
      this.k = to ? Math.max(this.k, k) : Math.min(this.k, k);
      this.pose();
    };
    let from = 0;
    return [
      { dur: 0.3, tick: () => n.reach(arm, this.rollTop()), until: () => n.reached(arm) > 0.92, patience: 1.6 },
      { dur: 0.6, begin: () => sound.play(to ? "unroll" : "rollup", { x: this.group.position.x }), tick: () => (n.reach(arm, this.rollTop(to)), follow()), until: () => Math.abs(this.k - to) < 0.015, patience: 2.5 },
      {
        dur: 0.12,
        begin: () => (from = this.k),
        tick: (u) => {
          this.k = from + (to - from) * u;
          this.pose();
        },
      },
      { dur: 0.05, begin: () => n.reach(arm, null) },
    ];
  }

  private place(id: string, c: Contest): Vector3 {
    if (id === "you") return V(0, 0, NEAR);
    if (id === "danger") return V(0.25, 0, FAR);
    const i = c.foes.findIndex((f) => f.id === id);
    const n = c.foes.length;
    const x = n === 1 ? -0.08 : -0.22 + i * 0.22;
    return V(x, 0, FAR);
  }

  private makeDial(d: Dial, at: Vector3, kind: "foe" | "danger" | "you"): DialView {
    const g = new Group();
    const r = radius(d.notches);
    const disc = new CylinderGeometry(r, r * 1.04, DIAL_H, 36);
    disc.translate(0, DIAL_H / 2, 0);
    const body = new Mesh(disc, kind === "danger" ? this.dangerWood : kind === "you" ? this.paleWood : this.wood);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    for (let i = 0; i < d.notches; i++) {
      const h = new Mesh(this.holeGeo, this.holeMat);
      h.position.copy(hole(i, d.notches, r)).add(V(0, 0.0002, 0));
      g.add(h);
    }
    let piece: Group | null = null;
    if (kind === "foe") {
      // A small dark piece standing behind the dial, for who it is. It is laid down when they are beaten.
      piece = new Group();
      const body2 = new Mesh(this.pieceBody, this.pieceMat);
      body2.position.set(0, 0.015, 0);
      const head = new Mesh(this.pieceHead, this.pieceMat);
      head.position.set(0, 0.037, 0);
      body2.castShadow = head.castShadow = true;
      piece.add(body2, head);
      piece.position.set(0, 0, -r - 0.018);
      g.add(piece);
    }
    const tex = new CanvasTexture(slip(kind === "you" ? `You: ${d.name}` : d.name));
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.06 });
    const label = new Mesh(this.slipGeo, mat);
    label.rotation.x = -Math.PI / 2;
    label.position.set(0, 0.0012, r + 0.022);
    label.receiveShadow = true;
    g.add(label);
    g.position.copy(at);
    this.group.add(g);
    return { id: d.id, group: g, notches: d.notches, pegs: [], label: { mesh: label, tex, mat, name: d.name }, disc, piece };
  }

  private dropDial(v: DialView): void {
    this.group.remove(v.group);
    v.disc.dispose();
    v.label.tex.dispose();
    v.label.mat.dispose();
    this.dials.delete(v.id);
  }

  private peg(v: DialView, i: number): Mesh {
    const p = new Mesh(this.pegGeo, this.pegMat);
    p.castShadow = true;
    p.position.copy(hole(i, v.notches, radius(v.notches))).add(V(0, PEG_H / 2, 0));
    return p;
  }

  /** Over a dial, where the narrator's fingers go. */
  private over(v: DialView): Vector3 {
    return this.group.localToWorld(v.group.position.clone().add(V(0, 0.07, 0)));
  }

  /** Every dial the contest has, by id, with what kind it is. */
  private wanted(c: Contest): [Dial, "foe" | "danger" | "you"][] {
    return [...c.foes.map((f) => [f, "foe"] as [Dial, "foe"]), ...(c.danger ? [[c.danger, "danger"] as [Dial, "danger"]] : []), [c.you, "you"]];
  }

  /**
   * Unroll the leather and set out the dials, mark their notches to match, or roll it all up (null). Resolves when the
   * table shows it.
   */
  show(c: Contest | null): Promise<void> {
    if (this.reduced) return this.showNow(c);
    const steps: Step[] = [];
    const n = this.narrator;
    if (!c) {
      if (!this.open) return Promise.resolve();
      this.open = false;
      steps.push({ dur: 0.3, begin: () => [...this.dials.values()].forEach((v) => this.dropDial(v)) }, ...this.push(0), { dur: 0, begin: () => (this.group.visible = false) });
      return this.tracks.run(steps);
    }
    if (!this.open) {
      this.open = true;
      // The roll is set down at the left of the map and pushed across, the leather coming off it.
      this.k = 0;
      this.pose();
      steps.push({ dur: 0.05, begin: () => (this.group.visible = true) }, ...this.push(1));
    }
    // Dials no longer wanted (a danger that has come) are taken away; new ones are set down, one by one.
    for (const v of [...this.dials.values()]) if (!this.wanted(c).some(([d]) => d.id === v.id)) steps.push({ dur: 0.2, begin: () => this.dropDial(v) });
    for (const [d, kind] of this.wanted(c)) {
      const have = this.dials.get(d.id);
      if (have && (have.label.name !== d.name || have.notches !== d.notches)) steps.push({ dur: 0.01, begin: () => this.dropDial(have) });
      if (!have || have.label.name !== d.name || have.notches !== d.notches) {
        let v: DialView;
        const at = this.place(d.id, c);
        const arm = n.armFor(this.group.localToWorld(at.clone()));
        steps.push(
          { dur: 0.12, tick: () => n.reach(arm, this.group.localToWorld(at.clone().add(V(0, 0.06, 0)))), until: () => n.reached(arm) > 0.75, patience: 0.9 },
          {
            dur: 0.22,
            begin: () => {
              v = this.makeDial(d, at, kind);
              this.dials.set(d.id, v);
              sound.play("token", { x: this.group.localToWorld(at.clone()).x, gain: 0.6, rate: 0.8 });
            },
            tick: (u) => v.group.scale.setScalar(0.6 + 0.4 * ease(u)),
          },
          { dur: 0.04, begin: () => n.reach(arm, null) },
        );
      }
    }
    // The pegs: dropped in from the narrator's fingers, one notch at a time.
    for (const [d] of this.wanted(c)) {
      steps.push({
        dur: 0,
        begin: () => {
          const v = this.dials.get(d.id);
          if (!v) return;
          while (v.pegs.length > d.filled) v.group.remove(v.pegs.pop()!);
        },
      });
      const want = Math.min(d.filled, d.notches);
      // How many pegs the dial will have by the time these steps run: those it has now, or none if it is new.
      const from = () => this.dials.get(d.id)?.pegs.length ?? 0;
      let arm = 0;
      // A step with nothing to do takes no time: its length is read after it begins.
      const go: Step = {
        dur: 0.12,
        begin: () => {
          const v = this.dials.get(d.id);
          arm = v ? n.armFor(this.over(v)) : 0;
          if (!v || from() >= want) go.dur = 0;
        },
        tick: () => {
          const v = this.dials.get(d.id);
          if (v && from() < want) n.reach(arm, this.over(v));
        },
        until: () => from() >= want || n.reached(arm) > 0.75,
        patience: 0.9,
      };
      steps.push(go);
      for (let i = 0; i < want; i++) {
        let p: Mesh | null = null;
        let start = V(0, 0, 0);
        const drop: Step = {
          dur: 0.2,
          begin: () => {
            const v = this.dials.get(d.id);
            if (!v || v.pegs.length !== i) {
              drop.dur = 0;
              return;
            }
            p = this.peg(v, i);
            const to = p.position.clone();
            start = v.group.worldToLocal(n.fingertips(arm).clone());
            p.userData.to = to;
            p.position.copy(start);
            v.pegs.push(p);
            v.group.add(p);
          },
          tick: (u) => {
            if (p) p.position.lerpVectors(start, p.userData.to as Vector3, u * u);
            if (p && u >= 1 && !p.userData.heard) {
              p.userData.heard = true;
              sound.play("peg", { x: p.getWorldPosition(V(0, 0, 0)).x });
            }
          },
        };
        steps.push(drop);
      }
      steps.push({ dur: 0.04, begin: () => n.reach(arm, null) });
      // A foe whose dial is full is laid down; one that is not stands.
      const down = d.filled >= d.notches ? 1 : 0;
      const fall: Step = {
        dur: 0.35,
        begin: () => {
          const v = this.dials.get(d.id);
          if (!v?.piece || Math.abs(-v.piece.rotation.x / (Math.PI / 2) - down) < 0.01) fall.dur = 0;
        },
        tick: (u) => {
          const p = this.dials.get(d.id)?.piece ?? null;
          if (p && fall.dur) lay(p, down ? ease(u) : 1 - ease(u));
          if (p && fall.dur && u >= 1) sound.play("knock", { x: p.getWorldPosition(V(0, 0, 0)).x, gain: 0.6 });
        },
      };
      steps.push(fall);
    }
    return this.tracks.run(steps);
  }

  /** The same, at once: with motion reduced. */
  private showNow(c: Contest | null): Promise<void> {
    if (!c) {
      for (const v of [...this.dials.values()]) this.dropDial(v);
      this.open = false;
      this.k = 0;
      this.pose();
      this.group.visible = false;
      return Promise.resolve();
    }
    this.open = true;
    this.k = 1;
    this.pose();
    this.group.visible = true;
    for (const v of [...this.dials.values()]) if (!this.wanted(c).some(([d]) => d.id === v.id)) this.dropDial(v);
    for (const [d, kind] of this.wanted(c)) {
      let v = this.dials.get(d.id);
      if (v && (v.label.name !== d.name || v.notches !== d.notches)) {
        this.dropDial(v);
        v = undefined;
      }
      if (!v) {
        v = this.makeDial(d, this.place(d.id, c), kind);
        this.dials.set(d.id, v);
      }
      while (v.pegs.length > d.filled) v.group.remove(v.pegs.pop()!);
      while (v.pegs.length < Math.min(d.filled, d.notches)) {
        const p = this.peg(v, v.pegs.length);
        v.pegs.push(p);
        v.group.add(p);
      }
      lay(v.piece, d.filled >= d.notches ? 1 : 0);
    }
    return Promise.resolve();
  }

  /** How the board stands now, for a look from outside (tests, the preview). */
  get state(): { open: boolean; dials: Record<string, number> } {
    return { open: this.open, dials: Object.fromEntries([...this.dials.values()].map((v) => [v.id, v.pegs.length])) };
  }

  dispose(): void {
    for (const v of [...this.dials.values()]) this.dropDial(v);
    this.sheetTex.dispose();
    for (const g of [...this.geos, this.pegGeo, this.holeGeo, this.pieceBody, this.pieceHead, this.slipGeo]) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
