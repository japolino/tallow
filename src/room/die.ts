/**
 * The die on the table: a twenty-sided die that tumbles and comes to rest
 * showing the number the code already rolled. The throw is only a showing;
 * it never decides anything (docs/DESIGN.md, 2).
 */
import { sound } from "./sound.js";
import {
  BufferAttribute,
  CanvasTexture,
  IcosahedronGeometry,
  Mesh,
  MeshPhysicalMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
} from "three";
import { mk } from "./textures.js";

const UP = new Vector3(0, 1, 0);

export interface D20Faces {
  /** Outward unit normal of each of the 20 faces, in geometry order. */
  normals: Vector3[];
  /** The number painted on each face, 1..20. Opposite faces add up to 21. */
  numbers: number[];
  /** For each face, the direction (in the die's own space) from its centre to the top of its numeral. */
  tops: Vector3[];
}

/** Lay out the numbers on an icosahedron (non-indexed: three vertices per face). */
export function d20Faces(geo: BufferGeometry): D20Faces {
  const pos = geo.getAttribute("position");
  const normals: Vector3[] = [];
  const tops: Vector3[] = [];
  for (let f = 0; f < 20; f++) {
    const a = new Vector3().fromBufferAttribute(pos, f * 3);
    const b = new Vector3().fromBufferAttribute(pos, f * 3 + 1);
    const c = new Vector3().fromBufferAttribute(pos, f * 3 + 2);
    const centre = a.clone().add(b).add(c).divideScalar(3);
    normals.push(centre.clone().normalize());
    tops.push(a.clone().sub(centre).normalize());
  }
  const numbers = new Array<number>(20).fill(0);
  let next = 1;
  for (let f = 0; f < 20; f++) {
    if (numbers[f]) continue;
    let opp = -1, best = 0;
    for (let k = 0; k < 20; k++) {
      const d = -normals[f]!.dot(normals[k]!);
      if (d > best) {
        best = d;
        opp = k;
      }
    }
    numbers[f] = next;
    numbers[opp] = 21 - next;
    next++;
  }
  return { normals, numbers, tops };
}

/**
 * How the die must be turned to rest with `value` facing up, its numeral
 * upright for someone looking along `readFrom` (a direction on the table,
 * from the reader toward the die).
 */
export function restingTurn(faces: D20Faces, value: number, readFrom: Vector3): Quaternion {
  const f = faces.numbers.indexOf(value);
  if (f < 0) throw new Error(`a d20 has no face ${value}`);
  const up = new Quaternion().setFromUnitVectors(faces.normals[f]!, UP);
  const top = faces.tops[f]!.clone().applyQuaternion(up);
  top.y = 0;
  top.normalize();
  const want = readFrom.clone().setY(0).normalize();
  // Turn about the vertical so the numeral's top points away from the reader.
  const phi = (v: Vector3) => Math.atan2(-v.z, v.x);
  const yaw = new Quaternion().setFromAxisAngle(UP, phi(want) - phi(top));
  return yaw.multiply(up);
}

/** The colours of a die: the player's is dark red with gold numbers, the narrator's old bone with dark ones. */
export type DieLook = "player" | "narrator";
const LOOKS: Record<DieLook, { ground: string; face: [string, string, string]; ink: string }> = {
  player: { ground: "#3a0d10", face: ["#7a1a1c", "#5a1216", "#2c080b"], ink: "#f0d08a" },
  narrator: { ground: "#5c5446", face: ["#e2d8c0", "#c9bc9c", "#6e6450"], ink: "#1c120c" },
};

/** The numerals, one triangle per number, on a 5 by 4 sheet. */
function atlas(look: DieLook = "player"): CanvasTexture {
  const L = LOOKS[look];
  const W = 1024, H = 1024, cw = W / 5, ch = H / 4, R = 96;
  const [c, g] = mk(W, H);
  g.fillStyle = L.ground;
  g.fillRect(0, 0, W, H);
  for (let n = 1; n <= 20; n++) {
    const cx = ((n - 1) % 5) * cw + cw / 2;
    const cy = Math.floor((n - 1) / 5) * ch + ch / 2 + 12;
    // A slightly lighter face inside a dark edge, so each facet reads.
    const gr = g.createRadialGradient(cx, cy, 6, cx, cy, R * 1.05);
    gr.addColorStop(0, L.face[0]);
    gr.addColorStop(0.75, L.face[1]);
    gr.addColorStop(1, L.face[2]);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(cx, cy - R);
    g.lineTo(cx - R * 0.866, cy + R * 0.5);
    g.lineTo(cx + R * 0.866, cy + R * 0.5);
    g.closePath();
    g.fill();
    g.fillStyle = L.ink;
    g.font = `700 ${n >= 10 ? 74 : 86}px Georgia, "Times New Roman", serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), cx, cy + 6);
    if (n === 6 || n === 9) g.fillRect(cx - 20, cy + 42, 40, 5);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const DIE_RADIUS = 0.03;
/** Height of the die's centre above the table when it rests on a face. */
export const DIE_REST = DIE_RADIUS * 0.7947;

export class Die {
  readonly mesh: Mesh;
  private faces: D20Faces;
  private roll: { t0: number; dur: number; from: Vector3; to: Vector3; end: Quaternion; axisA: Vector3; axisB: Vector3; done: () => void; hits: number } | null = null;
  private readonly look: DieLook;
  /** The number showing, or null before the first roll. */
  showing: number | null = null;

  constructor(look: DieLook = "player") {
    this.look = look;
    const geo = new IcosahedronGeometry(DIE_RADIUS, 0);
    this.faces = d20Faces(geo);
    const uv = new Float32Array(60 * 2);
    const cw = 1 / 5, ch = 1 / 4, Ru = 96 / 1024;
    for (let f = 0; f < 20; f++) {
      const n = this.faces.numbers[f]!;
      const cx = ((n - 1) % 5) * cw + cw / 2;
      const cy = Math.floor((n - 1) / 5) * ch + ch / 2 + 12 / 1024;
      // Canvas y runs down, texture v runs up.
      uv.set([cx, 1 - (cy - Ru), cx - Ru * 0.866, 1 - (cy + Ru * 0.5), cx + Ru * 0.866, 1 - (cy + Ru * 0.5)], f * 6);
    }
    geo.setAttribute("uv", new BufferAttribute(uv, 2));
    const tex = atlas(look);
    this.mesh = new Mesh(geo, new MeshPhysicalMaterial({ map: tex, roughness: 0.28, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.18, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 }));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
  }

  /** Light the die a little from within (0..1), so it can be read in the hand in a dark room. */
  set glow(v: number) {
    (this.mesh.material as MeshPhysicalMaterial).emissiveIntensity = v;
  }

  /**
   * In the player's drawn hand the die has to be drawn between the palm and the fingers, which are flat sheets drawn
   * last of all. `order` is its place in that drawing order; null puts it back among the solid things of the room.
   */
  inHand(order: number | null): void {
    const m = this.mesh.material as MeshPhysicalMaterial;
    m.transparent = order !== null;
    m.needsUpdate = true;
    this.mesh.renderOrder = order ?? 0;
  }

  /** Lay the die down somewhere, showing nothing in particular. */
  place(at: Vector3): void {
    this.roll = null;
    this.showing = null;
    this.mesh.visible = true;
    this.mesh.position.copy(at);
  }

  get rolling(): boolean {
    return this.roll !== null;
  }

  /**
   * Throw the die from `from` to rest at `to` showing `value`.
   * @param now the room's clock in seconds
   * @param still with reduced motion: no tumble, the die is simply there
   */
  throw(value: number, from: Vector3, to: Vector3, readFrom: Vector3, now: number, still: boolean): Promise<void> {
    const end = restingTurn(this.faces, value, readFrom);
    this.mesh.visible = true;
    this.showing = null;
    if (still) {
      this.roll = null;
      this.mesh.position.copy(to).setY(to.y + DIE_REST);
      this.mesh.quaternion.copy(end);
      this.showing = value;
      return Promise.resolve();
    }
    const travel = to.clone().sub(from).setY(0).normalize();
    return new Promise((done) => {
      this.roll = {
        t0: now, dur: 1.7, from: from.clone(), to: to.clone(), end, hits: 0,
        // Rolling: about the horizontal axis across the direction of travel. Plus a slower skew, so it tumbles rather than wheels.
        axisA: new Vector3(travel.z, 0, -travel.x),
        axisB: new Vector3(0.3, 1, 0.2).normalize(),
        done: () => {
          this.showing = value;
          done();
        },
      };
    });
  }

  update(now: number): void {
    const r = this.roll;
    if (!r) return;
    const u = Math.min(1, (now - r.t0) / r.dur);
    // Fast at first, slowing as it loses its throw.
    const e = 1 - Math.pow(1 - u, 2.6);
    const p = r.from.clone().lerp(r.to, e);
    // Three bounces, each lower than the last, the last ending exactly at rest.
    const hop = Math.abs(Math.sin(Math.PI * 3 * Math.pow(u, 0.75))) * (1 - u) * (1 - u);
    // A clack each time it comes down, at the foot of each bounce, softer each time.
    const hit = Math.floor(3 * Math.pow(u, 0.75) + 1e-6);
    if (hit > r.hits) {
      r.hits = hit;
      // The first landing plays the whole recorded tumble; the made stand-in clacks at each bounce instead.
      const rate = this.look === "narrator" ? 0.88 : 1;
      if (hit === 1) sound.play("throw", { x: p.x, rate, gain: this.look === "narrator" ? 0.75 : 1 });
      else sound.play("clack", { x: p.x, gain: [0, 1, 0.6, 0.3][hit] ?? 0.3, rate });
    }
    p.y = r.to.y + DIE_REST + r.from.y * (1 - e) * (1 - e) + hop * 0.09;
    this.mesh.position.copy(p);
    const left = 1 - e;
    const spin = new Quaternion().setFromAxisAngle(r.axisA, left * 21).multiply(new Quaternion().setFromAxisAngle(r.axisB, left * left * 7));
    this.mesh.quaternion.copy(spin.multiply(r.end));
    if (u >= 1) {
      this.mesh.quaternion.copy(r.end);
      this.roll = null;
      r.done();
    }
  }

  dispose(): void {
    const m = this.mesh.material as MeshPhysicalMaterial;
    m.map?.dispose();
    m.dispose();
    this.mesh.geometry.dispose();
  }
}
