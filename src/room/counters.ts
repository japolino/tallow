/**
 * What you carry and how a check stands, as things on the table instead of
 * numbers on a panel.
 *
 * Three small piles on your side: red stones for health, coins for supplies,
 * pale seals for goodwill. When you lose one the narrator reaches over and
 * takes it; when you gain one it sets one down; when you pay, your own
 * counters slide across to it.
 *
 * A balance stands at the narrator's right hand. For each check it loads its
 * own pan with dark weights for how hard the thing is; small pale weights go
 * in your pan for the stat you lean on, and one large brass one for anything
 * in the scene your line uses. The beam tips toward the likelier end. The
 * tilt is the real chance (src/engine/weigh.ts); the weights only say why.
 */
import { CylinderGeometry, Group, LatheGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector2, Vector3, type Material, type Object3D } from "three";
import { rng } from "./textures.js";
import { ease, type Reacher, type Step, type Tracks } from "./track.js";

export type Carried = "health" | "supplies" | "goodwill";
export const CARRIED: readonly Carried[] = ["health", "supplies", "goodwill"];

/** What the scale is asked to show. The same shape as the engine's `Weighing`. */
export interface Load {
  his: number;
  yours: number;
  lever: boolean;
  /** -1 (the narrator's pan is right down) to 1 (yours is). */
  lean: number;
}

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/**
 * How far the beam is drawn tipped for a lean, as a share of its full tilt (-1 to 1). A chance a little off even
 * is drawn larger than it is, or it could not be seen at all. The side that sinks and the order of chances never
 * change: a better chance always tips the beam further your way.
 */
export const tipShown = (lean: number): number => Math.sign(lean) * Math.pow(Math.min(1, Math.abs(lean)), 0.55);

/** Where each pile lies on your side of the table: the first counter of each. */
const PILE: Record<Carried, Vector3> = { health: V(-0.3, 0, 0.292), supplies: V(-0.185, 0, 0.292), goodwill: V(-0.07, 0, 0.292) };
/** Where counters you pay with are pushed to, for the narrator to take. */
const PAID = V(-0.2, 0, -0.5);
const TOKEN_Y: Record<Carried, number> = { health: 0.0066, supplies: 0.002, goodwill: 0.003 };

/** The balance: where it stands, how it is turned, and its measures. */
const SCALE_AT = V(-0.66, 0, -0.2);
const SCALE_YAW = 0.2;
const BEAM_Y = 0.205;
const ARM = 0.13;
const DROP = 0.105;
const TILT = 0.42;

export class Counters {
  readonly group = new Group();
  private mats: Material[] = [];
  private piles: Record<Carried, Mesh[]> = { health: [], supplies: [], goodwill: [] };
  private rnd = rng(4711);
  private scale = new Group();
  private beam = new Group();
  private pans: [Group, Group] = [new Group(), new Group()];
  private angle = 0;
  private swing = 0;
  private want = 0;
  private his: Mesh[] = [];
  private small: Mesh[] = [];
  private brass: Mesh;
  private load: Load = { his: 0, yours: 0, lever: false, lean: 0 };
  private tokenGeo: Record<Carried, CylinderGeometry | SphereGeometry>;
  private tokenMat: Record<Carried, Material>;
  private iron: MeshStandardMaterial;
  private hisGeo = new CylinderGeometry(0.019, 0.021, 0.011, 16);

  constructor(private narrator: Reacher, private tracks: Tracks, private reduced: boolean) {
    const mat = <T extends Material>(m: T): T => {
      this.mats.push(m);
      return m;
    };
    this.tokenGeo = { health: new SphereGeometry(0.012, 14, 10), supplies: new CylinderGeometry(0.0125, 0.0125, 0.004, 18), goodwill: new CylinderGeometry(0.012, 0.0128, 0.006, 16) };
    this.tokenMat = {
      health: mat(new MeshPhysicalMaterial({ color: 0x8c1014, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.2, emissive: 0x2a0204 })),
      supplies: mat(new MeshStandardMaterial({ color: 0xb08a34, roughness: 0.3, metalness: 1 })),
      goodwill: mat(new MeshStandardMaterial({ color: 0xcdd6d2, roughness: 0.45, emissive: 0x1a1e1d })),
    };
    this.iron = mat(new MeshStandardMaterial({ color: 0x17181b, roughness: 0.55, metalness: 0.85 }));
    const bone = mat(new MeshStandardMaterial({ color: 0xcfc3a2, roughness: 0.6 }));
    const brass = mat(new MeshStandardMaterial({ color: 0x9a7630, roughness: 0.3, metalness: 0.95 }));
    const cord = mat(new MeshStandardMaterial({ color: 0x2a211a, roughness: 0.9 }));

    // The balance: an iron foot and post, a beam of bone, two iron dishes on cords.
    const foot = new Mesh(new LatheGeometry([[0, 0], [0.052, 0], [0.055, 0.006], [0.03, 0.014], [0.012, 0.022], [0.0075, 0.03], [0.0075, BEAM_Y - 0.012], [0.012, BEAM_Y - 0.006], [0, BEAM_Y]].map(([r, y]) => new Vector2(r, y)), 20), this.iron);
    const ring = new Mesh(new TorusGeometry(0.014, 0.0035, 8, 18), this.iron);
    ring.position.y = BEAM_Y + 0.018;
    this.scale.add(foot, ring);
    const bar = new Mesh(new CylinderGeometry(0.0055, 0.0055, ARM * 2 + 0.02, 10), bone);
    bar.rotation.z = Math.PI / 2;
    this.beam.add(bar);
    for (const sx of [-1, 1]) {
      const knob = new Mesh(new SphereGeometry(0.0095, 12, 8), bone);
      knob.position.x = sx * (ARM + 0.012);
      this.beam.add(knob);
    }
    // A pointer hanging from the middle of the beam, so a small tilt can still be read against the post.
    const needle = new Mesh(new CylinderGeometry(0.0012, 0.0035, 0.07, 6), bone);
    needle.position.y = -0.04;
    this.beam.add(needle);
    this.beam.position.y = BEAM_Y;
    this.scale.add(this.beam);
    this.pans.forEach((pan) => {
      const dish = new Mesh(new LatheGeometry([[0, 0], [0.034, 0.001], [0.046, 0.008], [0.048, 0.012], [0.044, 0.011], [0.033, 0.004], [0, 0.003]].map(([r, y]) => new Vector2(r, y)), 22), this.iron);
      dish.position.y = -DROP;
      pan.add(dish);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        const from = V(Math.cos(a) * 0.045, -DROP + 0.011, Math.sin(a) * 0.045);
        const line = new Mesh(new CylinderGeometry(0.0009, 0.0009, from.length(), 4), cord);
        line.position.copy(from).multiplyScalar(0.5);
        line.quaternion.setFromUnitVectors(V(0, 1, 0), from.clone().normalize());
        pan.add(line);
      }
      this.scale.add(pan);
    });
    // Your weights wait in a row at the balance's foot, on your side of it.
    const smallGeo = new CylinderGeometry(0.0105, 0.0115, 0.0065, 14);
    for (let i = 0; i < 4; i++) {
      const w = new Mesh(smallGeo, bone);
      this.small.push(w);
      this.scale.add(w);
    }
    this.brass = new Mesh(new CylinderGeometry(0.015, 0.018, 0.016, 16), brass);
    this.scale.add(this.brass);
    this.restYours();
    this.scale.position.copy(SCALE_AT);
    this.scale.rotation.y = SCALE_YAW;
    this.scale.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    this.group.add(this.scale);
    this.poseScale();
  }

  /* ------------------------------ what you carry ------------------------------ */

  /** Where the `i`th counter of a pile lies. They are laid out flat, three to a row, so they can be counted at a glance. */
  private slot(kind: Carried, i: number): Vector3 {
    const r = rng(kind.length * 97 + i * 13);
    return PILE[kind].clone().add(V((i % 3) * 0.03 + (r() - 0.5) * 0.006, TOKEN_Y[kind], Math.floor(i / 3) * 0.031 + (r() - 0.5) * 0.006));
  }

  private token(kind: Carried): Mesh {
    const m = new Mesh(this.tokenGeo[kind], this.tokenMat[kind]);
    if (kind === "health") m.scale.y = 0.55;
    m.rotation.y = this.rnd() * 3;
    m.castShadow = m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  count(kind: Carried): number {
    return this.piles[kind].length;
  }

  /** Lay the piles out as they stand, at once (the start of a game, or with motion reduced). */
  set(counts: Record<Carried, number>): void {
    for (const kind of CARRIED) {
      const pile = this.piles[kind];
      const n = Math.max(0, Math.round(counts[kind]));
      while (pile.length > n) this.group.remove(pile.pop()!);
      while (pile.length < n) pile.push(this.token(kind));
      pile.forEach((m, i) => m.position.copy(this.slot(kind, i)));
    }
  }

  /**
   * Bring a pile to `to` counters. Fewer: the narrator reaches over and takes them, or (`paid`) they slide across
   * the table to it first. More: the narrator sets new ones down. Resolves when the table shows the new count.
   */
  change(kind: Carried, to: number, paid = false): Promise<void> {
    const pile = this.piles[kind];
    const n = Math.max(0, Math.round(to));
    if (n === pile.length) return Promise.resolve();
    const arm = this.narrator.armFor(PILE[kind]);
    if (n < pile.length) {
      const gone = pile.splice(n);
      const steps: Step[] = [];
      let from = gone[0]!.position.clone();
      if (paid) {
        // Pushed across the table, a little apart, by your own hand (which is not drawn doing it).
        const starts = gone.map((m) => m.position.clone());
        const ends = gone.map((_, i) => PAID.clone().add(V((i - (gone.length - 1) / 2) * 0.03, TOKEN_Y[kind], (i % 2) * 0.012)));
        steps.push({
          dur: 0.9,
          tick: (u) => gone.forEach((m, i) => m.position.lerpVectors(starts[i]!, ends[i]!, ease(Math.max(0, Math.min(1, u * 1.15 - i * 0.07))))),
        });
        from = PAID.clone().setY(TOKEN_Y[kind]);
      }
      steps.push(...this.carry(arm, gone, () => (paid ? from : gone[0]!.position.clone()), () => this.narrator.sleeve(arm), { vanish: true }));
      steps.push({ dur: 0, begin: () => gone.forEach((m) => this.group.remove(m)) });
      return this.tracks.run(steps);
    }
    const fresh: Mesh[] = [];
    const first = pile.length;
    for (let i = first; i < n; i++) {
      const m = this.token(kind);
      m.visible = false;
      fresh.push(m);
      pile.push(m);
    }
    const to0 = this.slot(kind, first);
    return this.tracks.run([
      ...this.carry(arm, fresh, () => this.narrator.sleeve(arm), () => to0, { appear: true }),
      { dur: 0.25, tick: (u) => fresh.forEach((m, i) => m.position.lerp(this.slot(kind, first + i), u)) },
    ]);
  }

  /**
   * The narrator's hand goes to a thing, takes it, carries it somewhere and lets go. Several things go together,
   * keeping their places beside each other. `appear`: they come out of its sleeve. `vanish`: they go into it.
   */
  private carry(arm: number, things: Object3D[], from: () => Vector3, to: () => Vector3, o: { appear?: boolean; vanish?: boolean; lift?: number } = {}): Step[] {
    const n = this.narrator;
    const a = V(0, 0, 0), b = V(0, 0, 0), at = V(0, 0, 0);
    const offs: Vector3[] = [];
    const lead = things[0]!;
    const world = (obj: Object3D) => obj.getWorldPosition(V(0, 0, 0));
    const place = (obj: Object3D, w: Vector3) => obj.position.copy(obj.parent ? obj.parent.worldToLocal(w.clone()) : w);
    return [
      {
        dur: 0.25,
        begin: () => {
          a.copy(from());
          n.watch(lead.position, 2.4, this.tracks.now);
        },
        tick: () => n.reach(arm, o.appear ? a : a.clone().add(V(0, 0.012, 0))),
        until: () => n.reached(arm) > 0.9 && n.fingertips(arm).distanceTo(a) < 0.035,
        patience: 1.5,
      },
      {
        dur: 0.3,
        begin: () => {
          b.copy(to());
          const lw = world(lead);
          things.forEach((t) => offs.push(world(t).sub(lw)));
        },
      },
      {
        dur: 0.95,
        begin: () => {
          b.copy(to());
        },
        tick: (u) => {
          const e = ease(u);
          at.lerpVectors(a, b, e);
          at.y += Math.sin(Math.PI * u) * (o.lift ?? 0.07);
          n.reach(arm, at);
          // Held under the fingertips, and never through the table.
          const tips = n.fingertips(arm);
          things.forEach((t, i) => {
            const w = tips.clone().add(offs[i]!).add(V(0, -0.012, 0));
            if (!o.appear && !o.vanish) w.y = Math.max(w.y, 0.002);
            place(t, w);
            t.visible = o.appear ? u > 0.22 : o.vanish ? u < 0.8 : true;
          });
        },
        until: () => n.fingertips(arm).distanceTo(b) < 0.03,
        patience: 0.6,
      },
      { dur: 0.12, begin: () => n.reach(arm, null) },
    ];
  }

  /* --------------------------------- the scale -------------------------------- */

  /** Where your weights wait, in the balance's own space. */
  private rest(i: number): Vector3 {
    return i < 0 ? V(-0.035, 0.008, 0.09) : V(0.005 + i * 0.027, 0.00325, 0.09 + (i % 2) * 0.006);
  }

  private restYours(): void {
    this.small.forEach((w, i) => {
      this.scale.add(w);
      w.position.copy(this.rest(i));
    });
    this.scale.add(this.brass);
    this.brass.position.copy(this.rest(-1));
  }

  /** Where a weight sits in a pan, in the pan's own space. */
  private inPan(mine: boolean, i: number): Vector3 {
    const floor = -DROP + 0.004;
    if (!mine) return V(0, floor + 0.0055 + i * 0.0112, 0);
    return i < 0 ? V(-0.018, floor + 0.008, 0.004) : V(0.016, floor + 0.00325 + i * 0.0067, -0.004);
  }

  /** Where the pans hang for the beam's present tilt. */
  private poseScale(): void {
    this.beam.rotation.z = this.angle;
    this.pans.forEach((pan, i) => {
      const sx = i ? 1 : -1;
      pan.position.set(Math.cos(this.angle) * ARM * sx, BEAM_Y + Math.sin(this.angle) * ARM * sx, 0);
    });
  }

  /** The tilt the weights now in the pans call for. Your pan is the one on +x: heavy, it sinks, and the beam turns the other way. */
  private settle(yoursIn: number): void {
    const L = this.load;
    const mine = L.yours + (L.lever ? 1 : 0);
    if (!L.his && !mine) this.want = 0;
    else {
      // With only the narrator's weights in, its pan is right down; each of yours brings the beam toward where it will rest.
      const k = mine ? yoursIn / mine : 1;
      this.want = TILT * (1 - k) + -tipShown(L.lean) * TILT * k;
    }
  }

  /**
   * Load the scale for a check, or (null) clear your pan and leave the narrator's as it stands. The narrator brings
   * or takes its own weights by hand; yours hop in from where they wait. Resolves when the beam has its weights.
   */
  weigh(load: Load | null): Promise<void> {
    const next: Load = load ?? { his: this.load.his, yours: 0, lever: false, lean: 0 };
    const steps: Step[] = [];
    const [panHis, panMine] = this.pans;

    // Yours from the last check go back to where they wait.
    const back = this.small.filter((w) => w.parent === panMine);
    const brassBack = this.brass.parent === panMine;
    if (back.length || brassBack) {
      const moving = [...back, ...(brassBack ? [this.brass] : [])];
      const starts: Vector3[] = [];
      steps.push({
        dur: 0.5,
        begin: () => {
          this.load = { ...this.load, yours: 0, lever: false };
          for (const w of moving) {
            const at = w.position.clone().add(panMine.position);
            this.scale.add(w);
            w.position.copy(at);
            starts.push(at);
          }
          this.settle(0);
          if (!load) this.want = this.load.his ? TILT * 0.5 : 0;
        },
        tick: (u) =>
          moving.forEach((w, i) => {
            const to = this.rest(w === this.brass ? -1 : this.small.indexOf(w));
            w.position.lerpVectors(starts[i]!, to, ease(u));
            w.position.y += Math.sin(Math.PI * u) * 0.05;
          }),
      });
    }

    // The narrator's pan: it adds what is missing or takes what is too many, in one go.
    const arm = this.narrator.armFor(this.scale.localToWorld(panHis.position.clone()));
    const panTop = (n: number) => panHis.localToWorld(this.inPan(false, n));
    if (next.his > this.his.length) {
      const first = this.his.length;
      const fresh: Mesh[] = [];
      for (let i = first; i < next.his; i++) {
        const w = new Mesh(this.hisGeo, this.iron);
        w.castShadow = w.receiveShadow = true;
        w.visible = false;
        this.group.add(w);
        w.position.copy(this.narrator.sleeve(arm)).add(V(0, (i - first) * 0.0112, 0));
        fresh.push(w);
      }
      steps.push(...this.carry(arm, fresh, () => this.narrator.sleeve(arm), () => panTop(first).add(V(0, 0.02, 0)), { appear: true, lift: 0.05 }));
      steps.push({
        dur: 0.12,
        begin: () => {
          fresh.forEach((w, i) => {
            panHis.add(w);
            w.position.copy(this.inPan(false, first + i));
            this.his.push(w);
          });
          this.load = { ...this.load, his: next.his };
          this.settle(0);
          this.swing += 0.9;
        },
      });
    } else if (next.his < this.his.length) {
      const gone = this.his.splice(next.his);
      steps.push({
        dur: 0,
        begin: () =>
          gone.forEach((w) => {
            const at = w.getWorldPosition(V(0, 0, 0));
            this.group.add(w);
            w.position.copy(at);
          }),
      });
      steps.push(...this.carry(arm, gone, () => gone[0]!.getWorldPosition(V(0, 0, 0)), () => this.narrator.sleeve(arm), { vanish: true, lift: 0.05 }));
      steps.push({
        dur: 0,
        begin: () => {
          gone.forEach((w) => this.group.remove(w));
          this.load = { ...this.load, his: next.his };
          this.settle(0);
        },
      });
    }

    // Yours: one small weight for each point of the stat, then the brass one for what you are using.
    const mine: (Mesh | null)[] = load ? [...this.small.slice(0, Math.min(this.small.length, next.yours)), ...(next.lever ? [this.brass] : [])] : [];
    mine.forEach((w, i) => {
      if (!w) return;
      const from = V(0, 0, 0), to = V(0, 0, 0);
      const slot = w === this.brass ? -1 : i;
      steps.push({
        dur: 0.42,
        begin: () => {
          from.copy(w.position);
          this.load = { ...next, his: this.load.his };
        },
        tick: (u) => {
          to.copy(this.inPan(true, slot)).add(panMine.position);
          w.position.lerpVectors(from, to, ease(u));
          w.position.y += Math.sin(Math.PI * u) * 0.06;
          if (u >= 1 && w.parent !== panMine) {
            panMine.add(w);
            w.position.copy(this.inPan(true, slot));
            this.settle(i + 1);
            this.swing -= w === this.brass ? 1.1 : 0.5;
          }
        },
      });
    });
    steps.push({
      dur: 0.5,
      begin: () => {
        this.load = { ...next, his: this.load.his };
        this.settle(mine.length);
      },
    });
    return this.tracks.run(steps);
  }

  /** The beam's tilt as it is drawn, for checks: below 0 your pan is down. */
  get tilt(): number {
    return this.angle;
  }

  update(dt: number): void {
    if (this.reduced) {
      this.angle = this.want;
      this.swing = 0;
    } else {
      // The beam swings to its rest like a real one: a spring with a little drag.
      const h = Math.min(dt, 1 / 30);
      this.swing += ((this.want - this.angle) * 26 - this.swing * 3.1) * h;
      this.angle = Math.max(-TILT * 1.25, Math.min(TILT * 1.25, this.angle + this.swing * h));
    }
    this.poseScale();
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
    for (const g of Object.values(this.tokenGeo)) g.dispose();
    this.hisGeo.dispose();
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
  }
}
