/**
 * Candles that burn down (docs/DESIGN.md, 8): the light is the clock, and so
 * is the wax. A candle is set out and lit new in the evening and is a stub by morning:
 * it gets shorter, its rim melts ragged, runs of wax creep down its side and
 * pool at its foot. How far it has burnt is a number the room is given
 * (`burn`, from the hour); nothing here keeps time by itself.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  type Texture,
} from "three";
import { mk, rng } from "./textures.js";

/** What every candle in the room shares. */
export interface CandleKit {
  wax: MeshStandardMaterial;
  /** Wax that has run and set: the runs down the side and the pool at the foot. */
  run: MeshStandardMaterial;
  /** The top of the wax, which the flame shines through. */
  rim: MeshStandardMaterial;
  wick: MeshBasicMaterial;
  flame: Texture;
  halo: Texture;
}

/** Wax lit from within near the flame: dark below, warm at the top. Used as the glow map of the candle's side. */
function waxGlow(): CanvasTexture {
  const [c, g] = mk(4, 64);
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, "#ffb060");
  gr.addColorStop(0.16, "#7a3a12");
  gr.addColorStop(0.45, "#1c0a03");
  gr.addColorStop(1, "#000000");
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function candleKit(flame: Texture, halo: Texture): CandleKit & { dispose(): void } {
  const glow = waxGlow();
  const wax = new MeshStandardMaterial({ color: 0xe3d3ae, roughness: 0.6, emissive: new Color(0xffffff), emissiveMap: glow, emissiveIntensity: 0 });
  const run = new MeshStandardMaterial({ color: 0xd8c9a4, roughness: 0.55 });
  const rim = new MeshStandardMaterial({ color: 0xeee2c4, roughness: 0.55, emissive: new Color(0xff9a48), emissiveIntensity: 0 });
  const wick = new MeshBasicMaterial({ color: 0x0a0806 });
  return {
    wax, run, rim, wick, flame, halo,
    dispose() {
      glow.dispose();
      wax.dispose();
      run.dispose();
      rim.dispose();
      wick.dispose();
    },
  };
}

interface Run {
  mesh: Mesh;
  angle: number;
  /** How far the candle has to have burnt before this run starts. */
  from: number;
  speed: number;
  thick: number;
}

export interface CandleState {
  /** How big the flame is, 0 (out) to 1; a little over 1 for the moment it catches. */
  level: number;
  /** How much the flame glows into the air round it, 0..1. In daylight a flame hardly glows. Defaults to `level`. */
  glow?: number;
  /** How far burnt down, 0 (new) to 1 (a stub). */
  burn: number;
  /** A draught across the flame, -1..1: it leans and thins. */
  draught: number;
  /** With reduced motion nothing flickers. */
  still: boolean;
}

export class Candle {
  readonly group = new Group();
  /** Height of the top of the wax above the candle's foot, as it stands now. */
  top: number;
  private body: Mesh;
  private crown: Mesh;
  private pool: Mesh;
  private wick: Mesh;
  private flame: Sprite;
  private halo: Sprite;
  private runs: Run[] = [];
  private phase: number;
  private shown = -1;
  /** Notches cut in the wax (docs/MOONSHOT.md, 5.3), each at the burn where its hour falls. */
  private marks: { mesh: Mesh; burn: number }[] = [];

  /**
   * @param o.h height when new, o.r radius, in metres
   * @param o.burns how much of its height is gone by morning, 0..1
   */
  constructor(private o: { h: number; r: number; burns: number; seed: number }, kit: CandleKit) {
    const { h, r } = o;
    const rnd = rng(o.seed);
    this.phase = rnd() * 20;
    this.top = h;

    // The side: turned one unit tall, then stretched to the height it has now.
    const side = [[r * 1.04, 0], [r * 1.0, 0.25], [r * 1.02, 0.7], [r * 0.985, 1]].map(([x, y]) => new Vector2(x, y));
    this.body = new Mesh(new LatheGeometry(side, 24), kit.wax);
    this.body.castShadow = true;
    this.group.add(this.body);

    // The top: a rim the flame has eaten unevenly, round a little well of melted wax.
    const lip = [[r * 0.985, 0], [r * 1.0, 0.0022], [r * 0.9, 0.0048], [r * 0.7, 0.0026], [r * 0.4, -0.0012], [0, -0.0026]].map(([x, y]) => new Vector2(x, y));
    const crownGeo = new LatheGeometry(lip, 24);
    const cp = crownGeo.attributes.position!;
    const a1 = rnd() * 6, a2 = rnd() * 6;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), z = cp.getZ(i);
      const rad = Math.hypot(x, z);
      if (rad < r * 0.6) continue;
      const a = Math.atan2(z, x);
      // One side is always lower: that is where the wax runs over.
      cp.setY(i, cp.getY(i) + (Math.sin(a * 2 + a1) * 0.6 + Math.sin(a * 5 + a2) * 0.4) * 0.0032 * ((rad - r * 0.6) / (r * 0.4)));
    }
    crownGeo.computeVertexNormals();
    this.crown = new Mesh(crownGeo, kit.rim);
    this.crown.castShadow = true;
    this.group.add(this.crown);

    // Runs of wax down the side. Each starts at a different hour of the night.
    const count = 5;
    for (let k = 0; k < count; k++) {
      const thick = r * (0.2 + rnd() * 0.12);
      const mesh = new Mesh(new SphereGeometry(1, 8, 8), kit.run);
      mesh.castShadow = true;
      mesh.visible = false;
      this.group.add(mesh);
      this.runs.push({ mesh, angle: rnd() * Math.PI * 2, from: k === 0 ? -0.08 : (k / count) * 0.8 + rnd() * 0.08, speed: 0.6 + rnd() * 0.7, thick });
    }

    // What has run all the way down: a ragged pool round the foot.
    const poolGeo = new LatheGeometry([[0, 0.0045], [0.6, 0.0042], [0.9, 0.003], [1, 0.0008], [1, 0]].map(([x, y]) => new Vector2(x, y)), 28);
    const pp = poolGeo.attributes.position!;
    const b1 = rnd() * 6, b2 = rnd() * 6;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i), z = pp.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.16 * Math.sin(a * 3 + b1) + 0.1 * Math.sin(a * 7 + b2);
      pp.setX(i, x * k);
      pp.setZ(i, z * k);
    }
    poolGeo.computeVertexNormals();
    this.pool = new Mesh(poolGeo, kit.run);
    this.pool.receiveShadow = true;
    this.pool.visible = false;
    this.group.add(this.pool);

    this.wick = new Mesh(new CylinderGeometry(0.0011, 0.0013, 0.011, 5), kit.wick);
    this.wick.rotation.z = (rnd() - 0.5) * 0.5;
    this.group.add(this.wick);
    this.flame = new Sprite(new SpriteMaterial({ map: kit.flame, transparent: true, depthWrite: false, blending: AdditiveBlending, color: new Color(2.4, 2, 1.5) }));
    this.flame.center.set(0.5, 0.06);
    this.halo = new Sprite(new SpriteMaterial({ map: kit.halo, transparent: true, depthWrite: false, blending: AdditiveBlending, color: new Color(1, 0.55, 0.2) }));
    this.group.add(this.flame, this.halo);
    this.shape(0);
  }

  get radius(): number {
    return this.o.r;
  }

  /** The height the candle has left after burning this far. */
  heightAt(burn: number): number {
    return Math.max(0.011, this.o.h * (1 - this.o.burns * Math.max(0, Math.min(1, burn))));
  }

  /** Set the wax to how far the candle has burnt. */
  private shape(burn: number): void {
    const { r } = this.o;
    const top = (this.top = this.heightAt(burn));
    this.body.scale.y = top;
    this.crown.position.y = top;
    // The rim gets more ragged as the night goes on.
    this.crown.scale.y = 0.7 + burn * 1.5;
    for (const run of this.runs) {
      const grown = (burn - run.from) * run.speed * this.o.h;
      run.mesh.visible = grown > 0.002;
      if (!run.mesh.visible) continue;
      // A run hangs from the rim and stops at the foot, where it feeds the pool.
      const len = Math.min(grown, top);
      const half = len / 2;
      run.mesh.scale.set(run.thick, half + run.thick * 0.6, run.thick);
      run.mesh.position.set(Math.cos(run.angle) * r * 0.98, top - half + 0.001, Math.sin(run.angle) * r * 0.98);
    }
    this.pool.visible = burn > 0.04;
    const spread = r * (1.15 + 1.5 * burn);
    this.pool.scale.set(spread, 0.5 + burn * 1.3, spread);
    this.wick.position.y = top + 0.0035;
    this.flame.position.y = top + 0.006;
    this.halo.position.y = top + 0.034;
    // A notch the flame has reached is gone with the wax.
    for (const m of this.marks) m.mesh.visible = m.burn > burn + 0.002;
  }

  /**
   * Cut notches in the wax at these burns (docs/MOONSHOT.md, 5.3): the flame creeps down to each, and when it gets there
   * the thing it marks happens. A burn outside 0..1 (an hour the candle is not burning) is not cut.
   */
  notch(burns: readonly number[], mat: MeshBasicMaterial | MeshStandardMaterial): void {
    for (const m of this.marks) {
      this.group.remove(m.mesh);
      m.mesh.geometry.dispose();
    }
    this.marks = [];
    const { r } = this.o;
    for (const b of burns) {
      if (!(b > 0 && b < 1)) continue;
      // A small wedge cut into the side that faces you.
      const mesh = new Mesh(new BoxGeometry(r * 0.95, 0.0026, r * 0.5), mat);
      mesh.position.set(0, this.heightAt(b), r * 0.82);
      this.group.add(mesh);
      this.marks.push({ mesh, burn: b });
    }
    this.shown = -1;
  }

  update(t: number, s: CandleState): void {
    // Wax only moves a little at a time, so it is reshaped in small steps.
    const step = Math.round(s.burn * 400);
    if (step !== this.shown) {
      this.shown = step;
      this.shape(step / 400);
    }
    const lv = s.level;
    this.flame.visible = this.halo.visible = lv > 0.03;
    if (!this.flame.visible) return;
    const p = this.phase;
    const lean = s.draught;
    // A stub gutters: a low flame that jumps about.
    const low = Math.max(0, (s.burn - 0.9) / 0.1);
    const jump = s.still ? 0 : 1 + low * 1.4 + Math.abs(lean) * 1.6;
    const f = s.still ? 1 : 0.9 + (0.12 * Math.sin(t * 12 + p) + 0.07 * Math.sin(t * 27 + p * 3) + 0.05 * Math.sin(t * 43 + p * 5)) * jump;
    const tall = (0.05 + this.o.r * 0.6) * (1 - low * 0.3) * (1 - Math.abs(lean) * 0.35);
    this.flame.scale.set(0.024 * lv * (1 + Math.abs(lean) * 0.25), Math.max(0.01, tall * f * lv), 1);
    this.flame.material.rotation = s.still ? 0 : Math.sin(t * 5 + p) * 0.07 - lean * 0.75;
    const gl = s.glow ?? lv;
    const hs = 0.26 * Math.min(1.3, lv) * (0.9 + 0.1 * f) * (1 - low * 0.2);
    this.halo.scale.set(hs, hs, 1);
    this.halo.material.opacity = 0.5 * Math.min(1, gl);
  }

  dispose(): void {
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
    this.flame.material.dispose();
    this.halo.material.dispose();
  }
}
