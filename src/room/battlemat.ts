/**
 * The battle mat (docs/COMBAT.md, 7): the dark leather the narrator unrolls over the map for a fight, inked with the
 * squares of the place (walls, cover, the things on it, the ground as it burns or runs slick), and the chalk of what
 * each foe is about to do. Your pieces are pale wood, the hero's with a red band; theirs are dark, the big ones bigger.
 * What happened in a step is played out on it: pieces slide along their paths (the narrator's hand moves his own),
 * a hit piece wobbles, a downed one is laid flat, one out of the fight is swept off. Then the leather is drawn again as
 * the battle stands. It is only shown: you never click it.
 */
import { CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3, type Material } from "three";
import type { Battle, BattleEvent, Piece } from "../engine/battle.js";
import { FOE_KINDS } from "../engine/foekinds.js";
import type { Pos } from "../engine/grid.js";
import { sound } from "./sound.js";
import { mk, noise2 } from "./textures.js";
import { ease, type Reacher, type Step, type Tracks } from "./track.js";

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const SERIF = `"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif`;

/** The leather: where the contest board lies, over the middle of the map. */
const W = 0.8, D = 0.44;
const AT = V(0, 0.0086, -0.13);
const TEX_W = 1024, TEX_H = 564;
const MARGIN = 0.03;

type Shape = "big" | "small" | "plain";

interface PieceView {
  id: string;
  group: Group;
  laid: boolean;
}

/** Where a square's middle is on the leather, in the mat's own space, for a board `w`×`h`. */
function square(p: Pos, w: number, h: number): Vector3 {
  const t = tileSize(w, h);
  const x0 = -(w * t) / 2, z0 = -(h * t) / 2;
  return V(x0 + (p[0] + 0.5) * t, 0, z0 + (p[1] + 0.5) * t);
}
const tileSize = (w: number, h: number): number => Math.min((W - 2 * MARGIN) / w, (D - 2 * MARGIN) / h);

/** The same square on the leather's texture, in pixels. */
function texSquare(p: Pos, w: number, h: number): [number, number, number] {
  const t = tileSize(w, h);
  const px = TEX_W / W;
  const s = t * px;
  const x0 = TEX_W / 2 - (w * s) / 2, y0 = TEX_H / 2 - (h * s) / 2;
  return [x0 + p[0] * s, y0 + p[1] * s, s];
}

let grain: HTMLCanvasElement | null = null;
/** The leather's face without ink: dark and grained, with a stitched border. Made once. */
function hide(): HTMLCanvasElement {
  if (grain) return grain;
  const [c, g] = mk(TEX_W, TEX_H);
  const n = noise2(23);
  const img = g.createImageData(TEX_W, TEX_H);
  for (let y = 0; y < TEX_H; y++)
    for (let x = 0; x < TEX_W; x++) {
      const v = 0.7 * n(x / 9, y / 9) + 0.3 * n(x / 2.5, y / 2.5);
      const i = (y * TEX_W + x) * 4;
      img.data[i] = 44 + v * 22;
      img.data[i + 1] = 28 + v * 13;
      img.data[i + 2] = 20 + v * 8;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  g.strokeStyle = "rgba(10,5,3,0.55)";
  g.lineWidth = 30;
  g.strokeRect(0, 0, TEX_W, TEX_H);
  g.strokeStyle = "rgba(196,160,110,0.6)";
  g.lineWidth = 3;
  g.setLineDash([14, 10]);
  g.strokeRect(24, 24, TEX_W - 48, TEX_H - 48);
  g.setLineDash([]);
  grain = c as HTMLCanvasElement;
  return grain;
}

const GROUND_INK: Record<string, string> = { slick: "rgba(70,110,150,0.45)", burning: "rgba(230,110,30,0.55)", rubble: "rgba(120,100,80,0.5)", smoke: "rgba(160,160,160,0.45)", hazard: "rgba(5,3,2,0.85)" };
const PROP_MARK: Record<string, string> = { toppler: "T", hanging: "H", spill: "S", fire: "F", cover: "C", choke: "D", throwable: "R", hazard: "", height: "^", prize: "★" };

/** Ink the leather as the battle stands: the squares, the walls and cover, the ground, the things, the zones, the chalk. */
export function inkMat(g: CanvasRenderingContext2D, b: Battle): void {
  g.drawImage(hide(), 0, 0);
  const { w, h } = b.mat;
  const at = (p: Pos) => texSquare(p, w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [px, py, s] = at([x, y]);
      const tile = b.mat.tiles[y]![x];
      if (tile === "wall") {
        g.fillStyle = "rgba(12,7,4,0.85)";
        g.fillRect(px, py, s, s);
      } else if (tile === "cover") {
        g.fillStyle = "rgba(90,60,35,0.55)";
        g.fillRect(px + 2, py + 2, s - 4, s - 4);
        g.strokeStyle = "rgba(200,170,120,0.35)";
        g.lineWidth = 1.5;
        for (let k = -s; k < s; k += 8) {
          g.beginPath();
          g.moveTo(px + Math.max(0, k), py + Math.max(0, -k));
          g.lineTo(px + Math.min(s, s + k), py + Math.min(s, s - k));
          g.stroke();
        }
      }
      const gr = b.ground?.[`${x},${y}`];
      if (gr) {
        g.fillStyle = GROUND_INK[gr.g] ?? "rgba(0,0,0,0.3)";
        g.fillRect(px + 1, py + 1, s - 2, s - 2);
      }
    }
  // The squares, faintly.
  g.strokeStyle = "rgba(196,160,110,0.16)";
  g.lineWidth = 1;
  const [x0, y0, s] = at([0, 0]);
  for (let x = 0; x <= w; x++) {
    g.beginPath();
    g.moveTo(x0 + x * s, y0);
    g.lineTo(x0 + x * s, y0 + h * s);
    g.stroke();
  }
  for (let y = 0; y <= h; y++) {
    g.beginPath();
    g.moveTo(x0, y0 + y * s);
    g.lineTo(x0 + w * s, y0 + y * s);
    g.stroke();
  }
  // The places, in faint ink at their first square.
  g.font = `italic ${Math.round(s * 0.32)}px ${SERIF}`;
  g.fillStyle = "rgba(210,185,140,0.32)";
  g.textBaseline = "top";
  for (const z of b.zones ?? []) {
    const first = z.tiles.reduce((a, q) => (q[1] < a[1] || (q[1] === a[1] && q[0] < a[0]) ? q : a), z.tiles[0]!);
    if (!first) continue;
    const [px, py] = at(first);
    g.fillText(z.name, px + 3, py + 2);
  }
  // The things on the mat: a ring with a letter, crossed out once used.
  for (const x of b.props ?? []) {
    if (x.template === "hazard" || x.template === "height") continue;
    const [px, py, ss] = at(x.at);
    g.strokeStyle = x.used ? "rgba(150,120,90,0.35)" : "rgba(226,196,140,0.85)";
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(px + ss / 2, py + ss / 2, ss * 0.36, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = g.strokeStyle;
    g.font = `bold ${Math.round(ss * 0.4)}px ${SERIF}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(PROP_MARK[x.template] ?? "?", px + ss / 2, py + ss / 2 + 1);
    g.textAlign = "start";
    if (x.used) {
      g.beginPath();
      g.moveTo(px + ss * 0.2, py + ss * 0.2);
      g.lineTo(px + ss * 0.8, py + ss * 0.8);
      g.stroke();
    }
  }
  // The high ground: a ridge of little strokes.
  const height = b.props?.find((x) => x.template === "height");
  for (const q of height?.area ?? []) {
    const [px, py, ss] = at(q);
    g.strokeStyle = "rgba(226,196,140,0.4)";
    g.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(px + ss * (0.2 + k * 0.25), py + ss * 0.7);
      g.lineTo(px + ss * (0.32 + k * 0.25), py + ss * 0.45);
      g.lineTo(px + ss * (0.44 + k * 0.25), py + ss * 0.7);
      g.stroke();
    }
  }
  chalk(g, b);
}

/** The chalk: from each foe to what it means to do, a dashed line with a head, and a ring for a blast or a rally. */
function chalk(g: CanvasRenderingContext2D, b: Battle): void {
  const { w, h } = b.mat;
  const mid = (p: Pos): [number, number] => {
    const [px, py, s] = texSquare(p, w, h);
    return [px + s / 2, py + s / 2];
  };
  g.strokeStyle = "rgba(240,236,224,0.82)";
  g.fillStyle = "rgba(240,236,224,0.82)";
  g.lineWidth = 3;
  g.lineCap = "round";
  for (const i of b.intents) {
    const by = b.pieces.find((p) => p.id === i.by);
    if (!by) continue;
    const [ax, ay] = mid(by.at);
    const target = i.target ? b.pieces.find((p) => p.id === i.target) : undefined;
    const to = target?.at ?? i.tiles?.[i.tiles.length - 1];
    if (!to || i.kind === "rally" || i.kind === "summon") {
      g.setLineDash([]);
      g.beginPath();
      g.arc(ax, ay, texSquare([0, 0], w, h)[2] * 0.55, 0, Math.PI * 2);
      g.stroke();
      continue;
    }
    const [bx, by2] = mid(to);
    g.setLineDash(i.kind === "shot" || i.kind === "hex" || i.kind === "charm" ? [4, 9] : [12, 7]);
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by2);
    g.stroke();
    g.setLineDash([]);
    const a = Math.atan2(by2 - ay, bx - ax);
    const hl = 12;
    g.beginPath();
    g.moveTo(bx, by2);
    g.lineTo(bx - hl * Math.cos(a - 0.45), by2 - hl * Math.sin(a - 0.45));
    g.lineTo(bx - hl * Math.cos(a + 0.45), by2 - hl * Math.sin(a + 0.45));
    g.closePath();
    g.fill();
    if (i.kind === "blast" || i.kind === "cleave") {
      const s = texSquare([0, 0], w, h)[2];
      g.beginPath();
      g.arc(bx, by2, s * (i.kind === "blast" ? 0.9 : 0.6), 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.lineCap = "butt";
}

const shapeOf = (p: Piece): Shape => {
  if (p.rank === "boss" || p.rank === "elite") return "big";
  const s = p.kind ? FOE_KINDS[p.kind].shape : undefined;
  return s === "big" ? "big" : s === "swarm" || p.rank === "minion" ? "small" : "plain";
};

export class BattleMat {
  readonly group = new Group();
  private sheet: Mesh;
  private tex: CanvasTexture;
  private canvas: HTMLCanvasElement;
  private mats: Material[] = [];
  private pieces = new Map<string, PieceView>();
  private yours: MeshStandardMaterial;
  private theirs: MeshStandardMaterial;
  private band: MeshStandardMaterial;
  private body = new CylinderGeometry(0.008, 0.012, 0.03, 14);
  private head = new SphereGeometry(0.0085, 14, 10);
  private ring = new TorusGeometry(0.0115, 0.0022, 6, 18);
  private open = false;
  private board: { w: number; h: number } = { w: 12, h: 9 };

  constructor(private narrator: Reacher, private tracks: Tracks, private reduced: boolean) {
    const [c] = mk(TEX_W, TEX_H);
    this.canvas = c as HTMLCanvasElement;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    const leather = new MeshStandardMaterial({ map: this.tex, roughness: 0.82 });
    this.yours = new MeshStandardMaterial({ color: 0xc9a77a, roughness: 0.55 });
    this.theirs = new MeshStandardMaterial({ color: 0x18110d, roughness: 0.5 });
    this.band = new MeshStandardMaterial({ color: 0xb3261c, roughness: 0.45, emissive: 0x3a0806, emissiveIntensity: 0.4 });
    this.mats.push(leather, this.yours, this.theirs, this.band);
    const geo = new PlaneGeometry(W, D);
    geo.rotateX(-Math.PI / 2);
    this.sheet = new Mesh(geo, leather);
    this.sheet.receiveShadow = true;
    this.group.add(this.sheet);
    this.group.position.copy(AT);
    this.group.visible = false;
  }

  private makePiece(p: Piece): PieceView {
    const g = new Group();
    const mat = p.side === "you" ? this.yours : this.theirs;
    const b = new Mesh(this.body, mat);
    b.position.y = 0.015;
    const hd = new Mesh(this.head, mat);
    hd.position.y = 0.037;
    b.castShadow = hd.castShadow = true;
    g.add(b, hd);
    if (p.hero) {
      const r = new Mesh(this.ring, this.band);
      r.rotation.x = Math.PI / 2;
      r.position.y = 0.012;
      g.add(r);
    }
    const shape = p.side === "them" ? shapeOf(p) : "plain";
    g.scale.setScalar(shape === "big" ? 1.3 : shape === "small" ? 0.75 : 1);
    g.position.copy(square(p.at, this.board.w, this.board.h));
    this.group.add(g);
    const v = { id: p.id, group: g, laid: false };
    this.pieces.set(p.id, v);
    return v;
  }

  private dropPiece(id: string): void {
    const v = this.pieces.get(id);
    if (!v) return;
    this.group.remove(v.group);
    this.pieces.delete(id);
  }

  private lay(v: PieceView, k: number): void {
    v.group.rotation.z = k * (Math.PI / 2);
    v.group.position.y = k * 0.009;
  }

  private ink(b: Battle): void {
    const g = this.canvas.getContext("2d")!;
    inkMat(g, b);
    this.tex.needsUpdate = true;
  }

  /** The pieces set to stand as the battle has them, at once. */
  private sync(b: Battle): void {
    for (const p of b.pieces) {
      const gone = p.out || p.fled || p.carried || (p.side === "them" && (p.down || p.overcome));
      const v = this.pieces.get(p.id);
      if (gone) {
        if (v) this.dropPiece(p.id);
        continue;
      }
      const view = v ?? this.makePiece(p);
      view.group.position.x = square(p.at, this.board.w, this.board.h).x;
      view.group.position.z = square(p.at, this.board.w, this.board.h).z;
      const laid = !!(p.down || p.overcome || p.states.some((s) => s.id === "prone"));
      view.laid = laid;
      this.lay(view, laid ? 1 : 0);
      view.group.visible = !p.states.some((s) => s.id === "hidden") || p.side === "you";
    }
    for (const id of [...this.pieces.keys()]) if (!b.pieces.some((p) => p.id === id)) this.dropPiece(id);
  }

  /** A piece slides along its path, square by square; the narrator's hand goes with his own. */
  private slide(id: string, path: readonly Pos[], theirs: boolean): Step[] {
    const steps: Step[] = [];
    const n = this.narrator;
    let arm = 0;
    let from = V(0, 0, 0);
    const world = (p: Pos) => this.group.localToWorld(square(p, this.board.w, this.board.h).add(V(0, 0.05, 0)));
    if (theirs && path.length > 1) {
      steps.push({ dur: 0.12, begin: () => (arm = n.armFor(world(path[0]!))), tick: () => n.reach(arm, world(path[0]!)), until: () => n.reached(arm) > 0.7, patience: 0.6 });
    }
    for (let i = 1; i < path.length; i++) {
      const to = square(path[i]!, this.board.w, this.board.h);
      steps.push({
        dur: 0.09,
        begin: () => {
          const v = this.pieces.get(id);
          if (v) from = v.group.position.clone();
        },
        tick: (u) => {
          const v = this.pieces.get(id);
          if (!v) return;
          v.group.position.x = from.x + (to.x - from.x) * ease(u);
          v.group.position.z = from.z + (to.z - from.z) * ease(u);
          v.group.position.y = (v.laid ? 0.009 : 0) + Math.sin(u * Math.PI) * 0.006;
          if (theirs) n.reach(arm, v.group.localToWorld(V(0, 0, 0)).add(V(0, 0.05, 0)), true);
        },
      });
    }
    if (path.length > 1) steps.push({ dur: 0.02, begin: () => sound.play("token", { x: this.group.position.x, gain: 0.5, rate: 0.9 }) });
    if (theirs && path.length > 1) steps.push({ dur: 0.03, begin: () => n.reach(arm, null) });
    return steps;
  }

  /** A hit piece wobbles. */
  private wobble(id: string): Step {
    return {
      dur: 0.22,
      tick: (u) => {
        const v = this.pieces.get(id);
        if (v && !v.laid) v.group.rotation.x = Math.sin(u * Math.PI * 3) * 0.25 * (1 - u);
      },
    };
  }

  /** A piece laid down, or stood up again. */
  private fall(id: string, down: boolean): Step {
    return {
      dur: 0.3,
      tick: (u) => {
        const v = this.pieces.get(id);
        if (!v) return;
        this.lay(v, down ? ease(u) : 1 - ease(u));
        if (u >= 1) {
          v.laid = down;
          if (down) sound.play("knock", { x: this.group.position.x, gain: 0.6 });
        }
      },
    };
  }

  /** A piece swept off the mat into the narrator's cloak. */
  private sweep(id: string): Step {
    return {
      dur: 0.3,
      tick: (u) => {
        const v = this.pieces.get(id);
        if (!v) return;
        v.group.position.z -= 0.004 * u;
        v.group.scale.multiplyScalar(1 - 0.12 * u);
        if (u >= 1) this.dropPiece(id);
      },
    };
  }

  /**
   * Unroll the leather and set the pieces out, play out what just happened (`events`) and draw it again as it stands,
   * or roll it all up (null). Resolves when the table shows it.
   */
  show(b: Battle | null, events: readonly BattleEvent[] = []): Promise<void> {
    if (!b) {
      if (!this.open) return Promise.resolve();
      this.open = false;
      const close = () => {
        for (const id of [...this.pieces.keys()]) this.dropPiece(id);
        this.group.visible = false;
        this.sheet.scale.x = 1;
      };
      if (this.reduced) return close(), Promise.resolve();
      return this.tracks.run([
        { dur: 0.15, begin: () => [...this.pieces.keys()].forEach((id) => this.dropPiece(id)) },
        { dur: 0.45, begin: () => sound.play("rollup", { x: 0 }), tick: (u) => ((this.sheet.scale.x = Math.max(0.001, 1 - ease(u))), (this.sheet.position.x = (-W / 2) * ease(u))) },
        { dur: 0, begin: () => ((this.sheet.position.x = 0), close()) },
      ]);
    }
    this.board = { w: b.mat.w, h: b.mat.h };
    const steps: Step[] = [];
    if (!this.open) {
      this.open = true;
      this.ink(b);
      if (this.reduced) {
        this.group.visible = true;
        this.sync(b);
        return Promise.resolve();
      }
      steps.push(
        { dur: 0.02, begin: () => ((this.group.visible = true), (this.sheet.scale.x = 0.001), (this.sheet.position.x = -W / 2)) },
        { dur: 0.6, begin: () => sound.play("unroll", { x: 0 }), tick: (u) => ((this.sheet.scale.x = Math.max(0.001, ease(u))), (this.sheet.position.x = (-W / 2) * (1 - ease(u)))) },
        { dur: 0.25, begin: () => this.sync(b) },
      );
      return this.tracks.run(steps);
    }
    if (this.reduced) {
      this.ink(b);
      this.sync(b);
      return Promise.resolve();
    }
    const side = (id: string) => b.pieces.find((p) => p.id === id)?.side;
    for (const e of events) {
      if (e.e === "move") {
        if (!this.pieces.has(e.piece)) continue;
        if (e.style === "stand") steps.push(this.fall(e.piece, false));
        else steps.push(...this.slide(e.piece, e.path, side(e.piece) === "them"));
      } else if (e.e === "hit") steps.push(this.wobble(e.piece));
      else if (e.e === "state" && e.state === "prone") steps.push(this.fall(e.piece, e.on));
      else if (e.e === "down" || e.e === "overcome") steps.push(side(e.piece) === "them" ? this.sweep(e.piece) : this.fall(e.piece, true));
      else if (e.e === "out" || e.e === "fled" || e.e === "carried") steps.push(this.sweep(e.piece));
      else if (e.e === "pushed") steps.push(...this.slide(e.piece, [b.pieces.find((p) => p.id === e.piece)?.at ?? e.to, e.to], false));
      else if (e.e === "arrive") steps.push({ dur: 0.2, begin: () => this.sync(b) });
    }
    steps.push({ dur: 0.05, begin: () => (this.ink(b), this.sync(b)) });
    return this.tracks.run(steps);
  }

  /** How the mat stands now, for a look from outside (tests, the preview). */
  get state(): { open: boolean; pieces: string[] } {
    return { open: this.open, pieces: [...this.pieces.keys()] };
  }

  dispose(): void {
    for (const id of [...this.pieces.keys()]) this.dropPiece(id);
    this.tex.dispose();
    this.sheet.geometry.dispose();
    for (const g of [this.body, this.head, this.ring]) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
