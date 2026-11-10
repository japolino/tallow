/**
 * Weather you can see (docs/DESIGN.md, 8): snow, rain and blown leaves past
 * the windows, fog that comes in over the sills, and, when the room is cold,
 * breath that fogs in front of you and in the dark of the narrator's hood.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  LineSegments,
  NormalBlending,
  Points,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import { puffCanvas, rng } from "./textures.js";

interface Box {
  min: Vector3;
  max: Vector3;
}

function scatter(count: number, box: Box, seed: number): { pos: Float32Array; seeds: Float32Array } {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = box.min.x + r() * (box.max.x - box.min.x);
    pos[i * 3 + 1] = box.min.y + r() * (box.max.y - box.min.y);
    pos[i * 3 + 2] = box.min.z + r() * (box.max.z - box.min.z);
    seeds[i] = r();
  }
  return { pos, seeds };
}

/**
 * A box of drifting specks: snow outside, leaves on the wind, or dust in the
 * light inside. Each speck moves with the box's own drift plus whatever push
 * it is given (the wind), and comes back in on the far side when it leaves.
 */
export class Drift {
  readonly points: Points;
  private mat: ShaderMaterial;
  private offset = new Vector3();
  private vel: Vector3;

  /**
   * @param o.vel metres per second the specks move by themselves
   * @param o.crisp 0 for a soft glow, toward 1 for a hard-edged speck
   * @param o.leaf draw each speck as a thin leaf that turns over as it flies, instead of a round dot
   */
  constructor(o: Box & { count: number; size: number; vel: Vector3; sway: number; seed: number; additive?: boolean; crisp?: number; leaf?: boolean }) {
    const { pos, seeds } = scatter(o.count, o, o.seed);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("seed", new BufferAttribute(seeds, 1));
    this.vel = o.vel.clone();
    this.mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmount: { value: 0 },
        uColor: { value: new Color(1, 1, 1) },
        uMin: { value: o.min.clone() },
        uSpan: { value: o.max.clone().sub(o.min) },
        uOffset: { value: this.offset },
        uSway: { value: o.sway },
        uSize: { value: o.size },
        uScale: { value: 600 },
        uCrisp: { value: o.crisp ?? 0 },
        uLeaf: { value: o.leaf ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime, uSway, uSize, uScale;
        uniform vec3 uMin, uSpan, uOffset;
        varying float vFade, vSeed;
        void main() {
          vSeed = seed;
          vec3 p = uMin + mod(position - uMin + uOffset * (0.6 + seed * 0.8), uSpan);
          p.x += sin(uTime * (0.4 + seed) + seed * 40.0) * uSway;
          p.z += cos(uTime * (0.3 + seed * 0.7) + seed * 17.0) * uSway;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.0, uSize * (0.6 + seed * 0.8) * uScale / max(0.1, -mv.z));
          vFade = 0.55 + 0.45 * seed;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uAmount, uCrisp, uLeaf, uTime;
        varying float vFade, vSeed;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          if (uLeaf > 0.5) {
            // A leaf: a thin oval, lying at its own angle and turning over as it flies.
            float ang = vSeed * 40.0 + uTime * (1.5 + vSeed * 4.0);
            float c = cos(ang), s = sin(ang);
            q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
            q.y *= 2.6 + 1.4 * sin(uTime * (2.0 + vSeed * 3.0) + vSeed * 9.0);
          }
          float d = length(q) * 2.0;
          float soft = pow(max(0.0, 1.0 - d), 2.2);
          float hard = 1.0 - smoothstep(0.55, 1.0, d);
          float a = min(1.0, mix(soft, hard, uCrisp) * uAmount * vFade);
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: o.additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** Move the specks on by `dt` seconds, with an extra push (the wind) in metres per second. */
  advance(dt: number, push?: Vector3): void {
    this.offset.addScaledVector(this.vel, dt);
    if (push) this.offset.addScaledVector(push, dt);
  }

  /** @param amount 0 hides the specks entirely. */
  set(time: number, amount: number, color: Color, viewHeight: number): void {
    const u = this.mat.uniforms;
    u.uTime!.value = time;
    u.uAmount!.value = amount;
    (u.uColor!.value as Color).copy(color);
    u.uScale!.value = viewHeight;
    this.points.visible = amount > 0.004;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

/** Rain: a box of short falling streaks, slanted by the wind. */
export class Rain {
  readonly lines: LineSegments;
  private mat: ShaderMaterial;
  private offset = new Vector3();
  private dir = new Vector3(0, -1, 0);

  constructor(o: Box & { count: number; seed: number }) {
    const { pos, seeds } = scatter(o.count, o, o.seed);
    const p2 = new Float32Array(o.count * 6);
    const s2 = new Float32Array(o.count * 2);
    const tip = new Float32Array(o.count * 2);
    for (let i = 0; i < o.count; i++) {
      for (let k = 0; k < 2; k++) {
        p2.set(pos.subarray(i * 3, i * 3 + 3), (i * 2 + k) * 3);
        s2[i * 2 + k] = seeds[i]!;
        tip[i * 2 + k] = k;
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(p2, 3));
    geo.setAttribute("seed", new BufferAttribute(s2, 1));
    geo.setAttribute("tip", new BufferAttribute(tip, 1));
    this.mat = new ShaderMaterial({
      uniforms: {
        uAmount: { value: 0 },
        uColor: { value: new Color(1, 1, 1) },
        uMin: { value: o.min.clone() },
        uSpan: { value: o.max.clone().sub(o.min) },
        uOffset: { value: this.offset },
        uDir: { value: this.dir },
      },
      vertexShader: /* glsl */ `
        attribute float seed, tip;
        uniform vec3 uMin, uSpan, uOffset, uDir;
        varying float vA;
        void main() {
          vec3 p = uMin + mod(position - uMin + uOffset * (0.75 + seed * 0.5), uSpan);
          // The tail of the streak trails behind the drop.
          p -= uDir * (0.16 + seed * 0.22) * tip;
          vA = (1.0 - tip) * (0.35 + 0.65 * seed);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uAmount;
        varying float vA;
        void main() { gl_FragColor = vec4(uColor, min(1.0, vA * uAmount)); }`,
      transparent: true,
      depthWrite: false,
    });
    this.lines = new LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
  }

  /** @param wind sideways metres per second */
  advance(dt: number, wind: Vector3): void {
    this.dir.set(wind.x, -9, wind.z);
    this.offset.addScaledVector(this.dir, dt);
    this.dir.normalize();
  }

  set(amount: number, color: Color): void {
    this.mat.uniforms.uAmount!.value = amount;
    (this.mat.uniforms.uColor!.value as Color).copy(color);
    this.lines.visible = amount > 0.004;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.mat.dispose();
  }
}

interface Wisp {
  sprite: Sprite;
  home: Vector3;
  span: number;
  speed: number;
  size: number;
  phase: number;
}

/** Fog that has come in: slow, low wisps that cross the room near the windows and over the far end of the table. */
export class Mist {
  readonly group = new Group();
  private wisps: Wisp[] = [];
  private tex: CanvasTexture;

  constructor(places: { at: Vector3; span: number; size: number }[], seed = 31) {
    this.tex = new CanvasTexture(puffCanvas(seed));
    const r = rng(seed);
    for (const p of places) {
      const sprite = new Sprite(new SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0, fog: false }));
      sprite.material.rotation = r() * 6;
      sprite.visible = false;
      this.group.add(sprite);
      this.wisps.push({ sprite, home: p.at.clone(), span: p.span, speed: 0.02 + r() * 0.03, size: p.size, phase: r() * 40 });
    }
  }

  /** @param still with reduced motion the wisps hang where they are. */
  update(t: number, amount: number, tint: Color, still: boolean): void {
    for (const w of this.wisps) {
      w.sprite.visible = amount > 0.01;
      if (!w.sprite.visible) continue;
      const tt = still ? 0 : t;
      const x = ((w.phase + tt * w.speed) % 1) * 2 - 1;
      w.sprite.position.set(w.home.x + x * w.span, w.home.y + Math.sin(tt * 0.21 + w.phase) * 0.04, w.home.z + Math.cos(tt * 0.13 + w.phase) * 0.1);
      const s = w.size * (1 + 0.12 * Math.sin(tt * 0.3 + w.phase * 2));
      w.sprite.scale.set(s * 1.7, s, 1);
      // Thin where it enters and leaves, so nothing pops.
      w.sprite.material.opacity = amount * 0.16 * (1 - x * x);
      w.sprite.material.color.copy(tint);
    }
  }

  dispose(): void {
    this.tex.dispose();
    for (const w of this.wisps) w.sprite.material.dispose();
  }
}

/**
 * When lightning strikes, pure and seeded so it can be checked: `flash(t)`
 * gives how bright the sky is lit at a time, 0..1, and `rumble(t)` how hard
 * the thunder shakes the room a moment later.
 */
export class Lightning {
  private strikes: { at: number; double: boolean; side: number }[] = [];
  private r: () => number;
  private until = 0;

  constructor(seed = 97) {
    this.r = rng(seed);
  }

  private plan(t: number): void {
    while (this.until < t + 30) {
      this.until += 5 + this.r() * 11;
      this.strikes.push({ at: this.until, double: this.r() < 0.65, side: this.r() * 2 - 1 });
    }
    while (this.strikes.length > 12 && this.strikes[0]!.at < t - 8) this.strikes.shift();
  }

  /** How brightly the sky is lit at `t`, and from which side of the back window (-1..1). */
  flash(t: number): { k: number; side: number } {
    this.plan(t);
    let k = 0, side = 0;
    for (const s of this.strikes) {
      const u = t - s.at;
      if (u < 0 || u > 0.7) continue;
      // A hard first stroke, and often a second, longer one right after.
      let v = u < 0.05 ? u / 0.05 : Math.exp(-(u - 0.05) * 22);
      if (s.double && u > 0.16) v = Math.max(v, (u < 0.2 ? (u - 0.16) / 0.04 : Math.exp(-(u - 0.2) * 9)) * 0.8);
      if (v > k) {
        k = v;
        side = s.side;
      }
    }
    return { k: Math.min(1, k), side };
  }

  /** Thunder: a shake that starts a little after the flash and dies away. */
  rumble(t: number): number {
    this.plan(t);
    let k = 0;
    for (const s of this.strikes) {
      const u = t - s.at - 0.55;
      if (u < 0 || u > 2.2) continue;
      k = Math.max(k, Math.min(1, u * 8) * Math.exp(-u * 2.1));
    }
    return k;
  }
}

interface Puff {
  sprite: Sprite;
  born: number;
  life: number;
  vel: Vector3;
  size: number;
  peak: number;
}

/** Breath in the cold: soft puffs that leave the mouth, swell, drift and thin out. */
export class Breath {
  readonly group = new Group();
  private pool: Puff[] = [];
  private tex: CanvasTexture;
  private next = 0;

  constructor(count = 10) {
    this.tex = new CanvasTexture(puffCanvas(5));
    for (let i = 0; i < count; i++) {
      const sprite = new Sprite(new SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0, fog: false }));
      sprite.visible = false;
      this.group.add(sprite);
      this.pool.push({ sprite, born: -99, life: 1, vel: new Vector3(), size: 0.1, peak: 0.3 });
    }
  }

  /** Let one puff go from `from`, moving along `vel` (metres per second). */
  puff(from: Vector3, vel: Vector3, now: number, size: number, peak: number, life = 2.4): void {
    const p = this.pool[this.next++ % this.pool.length]!;
    p.sprite.position.copy(from);
    p.vel.copy(vel);
    p.born = now;
    p.life = life;
    p.size = size;
    p.peak = peak;
    p.sprite.material.rotation = now * 7.3;
    p.sprite.visible = true;
  }

  /** @param still with reduced motion a puff does not drift, it only fades. */
  update(now: number, dt: number, tint: Color, still: boolean): void {
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      const u = (now - p.born) / p.life;
      if (u >= 1) {
        p.sprite.visible = false;
        continue;
      }
      if (!still) {
        p.sprite.position.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(1 - dt * 0.9);
        p.vel.y += dt * 0.02;
      }
      const s = p.size * (0.35 + 1.5 * Math.sqrt(u));
      p.sprite.scale.set(s, s, 1);
      p.sprite.material.opacity = p.peak * Math.sin(Math.min(1, u * 5) * Math.PI * 0.5) * (1 - u) * (1 - u);
      p.sprite.material.color.copy(tint);
    }
  }

  dispose(): void {
    this.tex.dispose();
    for (const p of this.pool) p.sprite.material.dispose();
  }
}
