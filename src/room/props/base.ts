/**
 * What a prop of the table is, and what every prop is built with, so that all of them look and behave alike.
 *
 * THE GRAMMAR, the same for every prop:
 *   - A prop is one recognisable thing with a fixed home on the table (layout.ts). It is on the table only while the
 *     game has something of its kind to show; it comes and goes with a small move and a sound.
 *   - Closed, it reads at a glance from the chair. Pointing at it lifts and warms it a little and shows its name on a
 *     small tag (a phone has no pointing: nothing may depend on it).
 *   - Touching it opens it: you lean over its spread and it unfolds there. One prop is open at a time. Escape, a touch
 *     outside it, starting to write, a die taken or a page handed to you closes it and you sit back.
 *   - Open, its parts can be touched. A touch shows more about the part with a few pencilled choices, or writes a line
 *     in the notebook. Writing a line closes the prop and puts you at the notebook to finish or send it.
 *   - NOTHING HERE EVER SENDS A LINE OR MAKES THE GAME WAIT. A prop shows what the game gave it and writes lines the
 *     game wrote. It judges nothing about what a name or a text means.
 *
 * HOW TO BUILD ONE (your own file in this folder; ring.ts and the rest are stubs to fill in):
 *   1. `class Ring extends PropBase` with `key` and `name` ("The fight"). Build the closed body in the constructor,
 *      into `this.group`, in the prop's own space: the middle of its foot at the origin, y up from the table, +z toward
 *      whoever looks at it, inside the room your home gives you (layout.ts, Home: w across, d deep, h tall). The
 *      manager puts the group at its home, turns and sizes it, and moves it as it arrives, leaves and is pointed at.
 *      Use `this.kit` for every material, shape and texture (they are then disposed with the prop, and warmed when it
 *      is pointed at), and the palette below for every colour.
 *   2. `show(shows)`: you are given the whole list of what the game shows, every time it changes. Take what is yours
 *      (`shows.find((s) => s.kind === "fight")`), change what you show to match it, and return whether there is
 *      anything of yours: that alone decides whether you are on the table. Something gained or lost may be shown on the
 *      closed prop with a small move here.
 *   3. `open()` and `close()`: unfold and fold. What is laid out while open goes into `this.spread`, a group the
 *      manager puts on the patch of table that is yours to unfold onto (layout.ts, Spread): x from -w/2 at the left of
 *      the screen to w/2, z from -h/2 at the top to h/2 at the bottom, y up. `place(lay, narrow)` tells you the patch
 *      and whether the view is upright (a phone), at the start and whenever the picture changes shape: lay things out
 *      to fit the w and h you are given. The manager moves the camera; you only move your own things.
 *   4. `parts()`: while open, the things that can be touched, each with an id, its middle in the room and how far from
 *      it a touch still counts (metres; use `this.partAt`). `hover(id)` is called as the pointer moves, `touch(id)`
 *      when one is touched. When a part offers pencilled choices, give them the ids "choice:0", "choice:1" and so on
 *      (the Choices slip below does), so scripts can pick one by its number.
 *   5. To write a line, call `this.h.write(line)`: the prop is closed and the line is on the pad. `this.h.keep(line)`
 *      keeps a line up to date on the pad while the prop stays open (a making that is still being put together),
 *      `this.h.kept()` says whether that line still stands there (the player may have rubbed it out), and
 *      `this.h.notebook()` goes to the notebook as it stands. `this.h.tell(text)` says something to a screen reader.
 *      Every line and every word of a choice comes from the game (game/system.ts, the Show you are given): a prop
 *      writes none of its own, and decides nothing about what can be done with what.
 *   6. Every move runs on the room's clock: a run of steps on `this.h.tracks` (track.ts), or easing by the `dt` given
 *      to `update(dt, t)`. Never a timer, never the wall clock: the room is wound on by hand when it is filmed, and
 *      with reduced motion (`this.h.reduced`) every step takes no time. Sounds are the room's (sound.ts).
 *   7. Add your sample data to preview/propsamples.ts and look: `bun scripts/prop-shots.ts ring` (see that file for
 *      what it takes: closed from the chair and from close by, pointed at, open, a part touched, a choice touched, the
 *      same on a phone, with 1, 6 or 20 things, and `all` for every prop out at once). To look by hand:
 *      `PORT=4191 bun scripts/preview.ts`, then http://localhost:4191/props?props=ring&fill=6&open=ring&rest=1.
 *   8. Have the narrator explain it the first time it comes up: give the system that shows it a `teach(r)` (game/
 *      system.ts) that returns one Lesson, with a key of its own and two or three short lines in the narrator's voice,
 *      while the run has something of that kind. The sitting says one lesson at a time, each once in a run
 *      (game/runturn.ts, lessonOf; game/runsit.ts). systems/goods.ts, PACK_LESSON, is the one to copy.
 *
 * pack.ts (the satchel) is a whole prop built this way, with its Show given by systems/goods.ts, packShow.
 *
 * The manager is index.ts (TableProps): it owns which prop is open, the lean, the name tags, arriving and leaving,
 * pointing and touching, and it can be driven from a script (open, close, touch, choose, screenOf).
 */
import { CanvasTexture, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace, Vector2, Vector3, type BufferGeometry, type Material, type Object3D, type Shape, type PerspectiveCamera, type Texture } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Show } from "../../game/system.js";
import { wrapText } from "../paper.js";
import { mk, rng, type Canvas } from "../textures.js";
import type { Reacher, Tracks } from "../track.js";
import type { Lay, PropKey } from "./layout.js";

export type { Lay, PropKey } from "./layout.js";

/* ------------------------------------------------- what a prop is ------------------------------------------------- */

/** Something of an open prop that can be touched. */
export interface Part {
  id: string;
  /** Its middle, in the room. */
  at: Vector3;
  /** How far from its middle a touch still finds it, in metres on the table. */
  reach: number;
  /** Lies under the others: found only where no other part is (a cloth under the things on it). */
  under?: boolean;
}

/** What a prop is given to work with. */
export interface PropHost {
  /** Runs of steps on the room's clock (track.ts). */
  readonly tracks: Tracks;
  /** Reduced motion: every step takes no time, and nothing sways. */
  readonly reduced: boolean;
  readonly camera: PerspectiveCamera;
  /** The narrator's hands and eyes, for a prop the narrator lays out or tends. */
  readonly narrator: Reacher;
  /** The room's clock, in seconds. */
  now(): number;
  /** True in an upright view (a phone). */
  narrow(): boolean;
  /**
   * Write a line in the notebook for the player to finish, change or send: the open prop closes and they are at the
   * notebook. A line that ends in a space is left unfinished, the pencil after it. It is never sent from here.
   */
  write(line: string): void;
  /**
   * Keep one line up to date on the pad while the prop stays open: it takes the place of the line kept before, and
   * "" takes it off again. The notebook is not opened.
   */
  keep(line: string): void;
  /** Whether the line last kept still stands on the pad (the player may have gone on from it, but has not rubbed it out). */
  kept(): boolean;
  /** Close the prop and go to the notebook as it stands. */
  notebook(): void;
  /** Close the open prop and sit back. */
  close(): void;
  /** For a screen reader: what is now shown. */
  tell(text: string): void;
}

export interface TableProp {
  readonly key: PropKey;
  /** The name written on its tag when it is pointed at: "Your satchel". */
  readonly name: string;
  /** The prop itself, in its own space; the manager puts it at its home. */
  readonly group: Group;
  /** What it lays out while open, in its spread's space; the manager puts it on the spread. */
  readonly spread: Group;
  /** The whole list of what the game shows, every time it changes. Returns whether any of it is this prop's. */
  show(shows: readonly Show[]): boolean;
  /** Its home and spread, and whether the view is upright: at the start and whenever the picture changes shape. */
  place(lay: Lay, narrow: boolean): void;
  /** Unfold: you are being leaned over it. */
  open(): void;
  /** Fold up again. */
  close(): void;
  /** While open, what can be touched. */
  parts(): Part[];
  /** The pointer is over this part of it; null when over none. */
  hover(id: string | null): void;
  /** A part was touched. */
  touch(id: string): void;
  /** Pointed at while closed: 0 not, 1 fully. */
  warm(k: number): void;
  /** The player's line has gone to the narrator: forget anything kept for it (things set aside for a making). */
  sent?(): void;
  /** Every frame, on the room's clock. */
  update(dt: number, t: number): void;
  dispose(): void;
}

/* ------------------------------------------------- the palette (docs/ART.md, Part 2) ------------------------------------------------- */

/** The room's colours. Every prop takes its colours from here, so the table is of one hand. */
export const PALETTE = {
  soot: 0x16110e,
  oakDark: 0x3a2416,
  oakMid: 0x6b4527,
  oakLight: 0x9c6b3f,
  wax: 0xe3d3ae,
  parchment: 0xc9a877,
  oxblood: 0x5a1f18,
  brass: 0x8a6a2c,
  pewter: 0x5a5c5e,
  ember: 0xc2541e,
  moss: 0x1c2a22,
  ink: 0x1f2e4a,
  night: 0x202838,
  /** Hide and cloth the palette's families give by their worn-edge swatches. */
  hide: 0x7a4a28,
  hideDark: 0x4a2a16,
  linen: 0x8f7d5c,
  cord: 0xb89a6a,
  chalk: 0xd9d2c0,
} as const;

/** Sealing wax for each quality a thing can be (engine/run.ts, QUALITIES), poorest first: a dot of it marks a tag. */
export const QUALITY_WAX: Record<string, string> = {
  trash: "#5b5148",
  mundane: "#8c7a5e",
  common: "#c9b98f",
  uncommon: "#4f7a45",
  rare: "#3d5f9a",
  epic: "#7a3f8f",
  legendary: "#c2541e",
};

/** The narrator's hand in ink, and yours in pencil: the two hands everything on the table is written in. */
export const INK_FONT = `Georgia, "Palatino Linotype", "Book Antiqua", serif`;
export const PENCIL_FONT = `"Segoe Print", "Ink Free", "Bradley Hand", "Comic Sans MS", cursive`;
export const INK = "#24160c";
export const PENCIL = "#34353b";
export const PAPER = "#dccfae";

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/* ------------------------------------------------- shapes and paint ------------------------------------------------- */

/**
 * A prop's own stock of materials, shapes and textures: made through here, they are disposed with the prop, and the
 * painted ones warm a little when the prop is pointed at.
 */
/**
 * How much a painted surface shows of its own colour with no light on it. The table is lit from the narrator's side,
 * so the side of a prop that faces your chair is in its own shadow: without this it is a black shape from where you sit.
 */
const GLOW = 0.085;

export class Kit {
  private mats: Material[] = [];
  private geos: BufferGeometry[] = [];
  private texs: Texture[] = [];
  private warmed: { m: MeshStandardMaterial; base: number }[] = [];

  /** A matte painted surface of one of the palette's colours. */
  paint(color: number, rough = 0.82): MeshStandardMaterial {
    const m = new MeshStandardMaterial({ color, roughness: rough, emissive: color, emissiveIntensity: GLOW });
    this.mats.push(m);
    this.warmed.push({ m, base: GLOW });
    return m;
  }

  /** Dull aged metal: brass or pewter. */
  metal(color: number, rough = 0.45): MeshStandardMaterial {
    // Not wholly metal: with nothing bright in the room to mirror, a true metal is a black shape by candlelight.
    const m = new MeshStandardMaterial({ color, roughness: rough, metalness: 0.7, emissive: color, emissiveIntensity: GLOW });
    this.mats.push(m);
    this.warmed.push({ m, base: GLOW });
    return m;
  }

  /** A surface painted on a canvas (textures.ts, or your own), tinted by `color`. */
  skin(canvas: Canvas, o: { rough?: number; color?: number; repeat?: [number, number] } = {}): MeshStandardMaterial {
    const map = this.tex(canvas);
    if (o.repeat) {
      map.wrapS = map.wrapT = RepeatWrapping;
      map.repeat.set(o.repeat[0], o.repeat[1]);
    }
    const m = new MeshStandardMaterial({ map, color: o.color ?? 0xffffff, roughness: o.rough ?? 0.85, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: GLOW });
    this.mats.push(m);
    this.warmed.push({ m, base: GLOW });
    return m;
  }

  tex(canvas: Canvas): CanvasTexture {
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    this.texs.push(t);
    return t;
  }

  /** Any other material, kept to be disposed with the prop. */
  mat<T extends Material>(m: T): T {
    this.mats.push(m);
    return m;
  }

  geo<T extends BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  /** A box with soft, wide bevels that catch the flame. Its middle is its own origin. */
  box(w: number, h: number, d: number, mat: Material, bevel = Math.min(w, h, d) * 0.22): Mesh {
    return this.cast(new Mesh(this.geo(new RoundedBoxGeometry(w, h, d, 2, Math.min(bevel, Math.min(w, h, d) / 2 - 1e-5))), mat));
  }

  /**
   * A flat plate cut to an outline, `thick` through, its edges eased: a flap, a strap end, a shield. It stands in the
   * outline's own plane (x across, y up), its back at z = 0 and its face toward +z.
   */
  plate(outline: Shape, thick: number, mat: Material): Mesh {
    const b = Math.min(0.0015, thick * 0.3);
    const g = this.geo(new ExtrudeGeometry(outline, { depth: thick - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 8 }));
    g.translate(0, 0, b);
    // An outline is measured in metres, and so is what is painted on it: without this a whole texture would cover a metre.
    const uv = g.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 6);
    return this.cast(new Mesh(g, mat));
  }

  /**
   * Draw a shape in toward its middle as it rises, so it stands on a wide foot like something soft or heavy: at its
   * top it is narrower by the shares `x` and `z` (0.2 is a fifth). Its foot stays as it is.
   */
  taper(mesh: Mesh, x: number, z: number): Mesh {
    const g = mesh.geometry;
    g.computeBoundingBox();
    const lo = g.boundingBox!.min.y, tall = g.boundingBox!.max.y - lo || 1;
    const p = g.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const up = (p.getY(i) - lo) / tall;
      p.setXYZ(i, p.getX(i) * (1 - x * up), p.getY(i), p.getZ(i) * (1 - z * up));
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    return mesh;
  }

  /** A turned thing, from a profile of [radius, height] pairs, with few enough sides to look carved. */
  lathe(profile: readonly (readonly [number, number])[], mat: Material, sides = 14): Mesh {
    return this.cast(new Mesh(this.geo(new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), sides)), mat));
  }

  /** A disc or a peg standing on its foot. */
  disc(r: number, h: number, mat: Material, sides = 14, top = r): Mesh {
    const g = this.geo(new CylinderGeometry(top, r, h, sides));
    g.translate(0, h / 2, 0);
    return this.cast(new Mesh(g, mat));
  }

  /** Nothing made by hand is true: move a shape's points about by up to `by` metres, the same way every time. */
  crook(mesh: Mesh, seed: number, by = 0.0012): Mesh {
    const p = mesh.geometry.attributes.position!;
    const at = new Map<string, [number, number, number]>();
    const r = rng(seed);
    for (let i = 0; i < p.count; i++) {
      // Points that share a place move together, so no seam opens.
      const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
      let d = at.get(key);
      if (!d) at.set(key, (d = [(r() - 0.5) * 2 * by, (r() - 0.5) * 2 * by, (r() - 0.5) * 2 * by]));
      p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
    }
    p.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    return mesh;
  }

  /** It throws a shadow and takes one, like everything on the table. */
  cast<T extends Object3D>(o: T): T {
    o.traverse((x) => {
      x.castShadow = x.receiveShadow = true;
    });
    return o;
  }

  /** Warm the painted surfaces: 0 as they are, 1 pointed at. */
  warm(k: number): void {
    for (const w of this.warmed) w.m.emissiveIntensity = w.base + k * 0.1;
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
    for (const g of this.geos) g.dispose();
    for (const t of this.texs) t.dispose();
  }
}

/* ------------------------------------------------- written things ------------------------------------------------- */

/** Old paper, for a slip or a tag. */
export function paper(g: CanvasRenderingContext2D, w: number, h: number, seed: number, base: string = PAPER): void {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < Math.round((w * h) / 2600); i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "255,245,215" : "60,35,10"},${0.03 + r() * 0.05})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
  }
  const edge = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.65);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(60,30,5,0.3)");
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
}

/** Write one line as large as fits `width`, down to `least`; past that it is cut and ends with an ellipsis. */
export function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, least: number, style = "italic 600", font = INK_FONT): number {
  let s = size;
  for (; s > least; s -= 1) {
    g.font = `${style} ${s}px ${font}`;
    if (g.measureText(text).width <= width) break;
  }
  g.font = `${style} ${s}px ${font}`;
  let t = text;
  if (g.measureText(t).width > width) {
    while (t.length > 1 && g.measureText(`${t}…`).width > width) t = t.slice(0, -1);
    t = `${t.trimEnd()}…`;
  }
  g.fillText(t, x, y);
  return s;
}

/**
 * Write a name where there is room for two lines: on one line as large as fits, down to `least`; and when even that
 * would have to be cut, on two smaller lines (only then cut, with an ellipsis). `y` is the middle of the room it has.
 */
export function fitName(g: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, least: number, style = "italic 600", font = INK_FONT): void {
  let s = Math.round(size);
  for (; s > least; s -= 1) {
    g.font = `${style} ${s}px ${font}`;
    if (g.measureText(text).width <= width) break;
  }
  g.font = `${style} ${s}px ${font}`;
  if (g.measureText(text).width <= width) {
    g.fillText(text, x, y + s * 0.34);
    return;
  }
  // Two lines, as large as lets every word stay whole.
  const words = text.split(/\s+/);
  let two = Math.round(Math.min(size * 0.78, least * 1.15));
  for (; two > least * 0.72; two -= 1) {
    g.font = `${style} ${two}px ${font}`;
    if (words.every((w) => g.measureText(w).width <= width) && wrapText((t) => g.measureText(t).width, text, width).filter((l) => l).length <= 2) break;
  }
  g.font = `${style} ${two}px ${font}`;
  const lines = wrapLines(g, text, width, 2);
  lines.forEach((line, i) => g.fillText(line, x, y + (i - (lines.length - 1) / 2) * two * 1.08 + two * 0.34));
}

/** Text broken into lines no wider than `width` in the font now set, and no more than `most` of them (the last then ends with an ellipsis). */
export function wrapLines(g: CanvasRenderingContext2D, text: string, width: number, most = Infinity): string[] {
  const lines = wrapText((s) => g.measureText(s).width, text, width).filter((l) => l);
  if (lines.length <= most) return lines;
  const kept = lines.slice(0, most);
  let last = kept[most - 1]!;
  while (last.length > 1 && g.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  kept[most - 1] = `${last.trimEnd()}…`;
  return kept;
}

/**
 * Something written: a piece of paper (or of nothing, for chalk on cloth) with a canvas to draw on. Lying flat it is
 * read from its +z side, its top toward -z; standing it faces +z. Its middle is its own origin.
 */
export class Label {
  readonly mesh: Mesh;
  readonly canvas: Canvas;
  readonly mat: MeshStandardMaterial;
  /** Its size in pixels. */
  readonly pw: number;
  readonly ph: number;
  readonly tex: CanvasTexture;
  private geo: PlaneGeometry;

  /**
   * @param w across, in metres @param h tall (or deep, lying flat)
   * @param o flat: lying on the table; clear: cut to what is drawn, with nothing where the canvas is left bare; px: pixels to a metre (2600 reads well from a lean)
   */
  constructor(readonly w: number, readonly h: number, o: { flat?: boolean; clear?: boolean; px?: number } = {}) {
    const px = o.px ?? 2600;
    this.pw = Math.max(8, Math.round(w * px));
    this.ph = Math.max(8, Math.round(h * px));
    [this.canvas] = mk(this.pw, this.ph);
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mat = new MeshStandardMaterial({ map: this.tex, roughness: 0.92, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.1, alphaTest: o.clear ? 0.5 : 0 });
    this.geo = new PlaneGeometry(w, h);
    if (o.flat) this.geo.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.receiveShadow = true;
  }

  /** Draw it again: the canvas is wiped, and `fn` draws on it in pixels. */
  draw(fn: (g: CanvasRenderingContext2D, w: number, h: number) => void): void {
    const g = this.canvas.getContext("2d")!;
    g.clearRect(0, 0, this.pw, this.ph);
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    fn(g, this.pw, this.ph);
    this.tex.needsUpdate = true;
  }

  /** How much of its own light it gives, so it can be read in a dark room: 0.1 as made. */
  set glow(k: number) {
    this.mat.emissiveIntensity = k;
  }

  dispose(): void {
    this.tex.dispose();
    this.mat.dispose();
    this.geo.dispose();
  }
}

/**
 * A slip that says more about something and offers a few pencilled choices under it: a heading and a few lines in
 * ink, then each choice on its own line in pencil. It lies flat, its middle at its group's origin, read from +z. The
 * choices are parts with the ids "choice:0", "choice:1", ...; the owner says what touching one does.
 */
export class Choices {
  readonly group = new Group();
  private label: Label | null = null;
  private rows: { z: number; say: string }[] = [];
  private head = "";
  private text = "";
  private note = "";
  private over = -1;
  /** Its depth as it is now drawn, in metres. */
  deep = 0;

  /** @param w across, in metres @param size how tall its writing is, in metres */
  constructor(readonly w: number, readonly size = 0.0085) {}

  /** What it says, and the choices under it (five at most). Drawn again only when it changes. */
  set(head: string, text: string, note: string, choices: readonly string[]): void {
    const says = choices.slice(0, 5);
    if (head === this.head && text === this.text && note === this.note && says.join("\n") === this.rows.map((r) => r.say).join("\n")) return;
    this.head = head;
    this.text = text;
    this.note = note;
    this.rows = says.map((say) => ({ z: 0, say }));
    this.over = -1;
    this.redraw();
  }

  private redraw(): void {
    const px = 2600;
    const pw = Math.round(this.w * px);
    const s = this.size * px;
    const pad = s * 0.9;
    // Measured first, so the paper is cut to what is written on it.
    const [, m] = mk(8, 8);
    m.font = `${Math.round(s * 0.92)}px ${INK_FONT}`;
    const body = this.text ? wrapLines(m, this.text, pw - pad * 2, 5) : [];
    const lh = s * 1.32;
    const headH = this.head ? s * 1.75 : 0;
    const noteH = this.note ? lh : 0;
    const rowH = s * 1.9;
    const ph = Math.round(pad + headH + body.length * lh + noteH + (this.rows.length ? s * 0.7 + this.rows.length * rowH : 0) + pad * 0.7);
    this.deep = ph / px;
    if (this.label) {
      this.group.remove(this.label.mesh);
      this.label.dispose();
    }
    const label = (this.label = new Label(this.w, this.deep, { flat: true, px }));
    label.glow = 0.16;
    this.group.add(label.mesh);
    label.draw((g, w, h) => {
      paper(g, w, h, 53);
      let y = pad;
      g.fillStyle = INK;
      if (this.head) {
        fitText(g, this.head, pad, y + s * 1.15, w - pad * 2, s * 1.3, s * 0.8, "italic 700");
        y += headH;
      }
      g.font = `${Math.round(s * 0.92)}px ${INK_FONT}`;
      for (const line of body) {
        g.fillText(line, pad, y + s * 0.95);
        y += lh;
      }
      if (this.note) {
        g.fillStyle = "rgba(36,22,12,0.72)";
        fitText(g, this.note, pad, y + s * 0.95, w - pad * 2, s * 0.86, s * 0.6, "italic 500");
        y += noteH;
      }
      if (!this.rows.length) return;
      y += s * 0.35;
      g.strokeStyle = "rgba(36,22,12,0.35)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(pad, y);
      g.lineTo(w - pad, y);
      g.stroke();
      y += s * 0.35;
      this.rows.forEach((row, i) => {
        const on = i === this.over;
        if (on) {
          g.fillStyle = "rgba(60,35,10,0.14)";
          g.fillRect(pad * 0.4, y + rowH * 0.06, w - pad * 0.8, rowH * 0.88);
        }
        g.fillStyle = PENCIL;
        // A pencilled mark before each, so it reads as something to touch.
        g.font = `${Math.round(s * 1.05)}px ${PENCIL_FONT}`;
        g.fillText("›", pad, y + rowH * 0.68);
        fitText(g, row.say, pad + s * 1.1, y + rowH * 0.68, w - pad * 2 - s * 1.1, s * 1.08, s * 0.7, on ? "700" : "500", PENCIL_FONT);
        row.z = (y + rowH / 2) / px - this.deep / 2;
        y += rowH;
      });
    });
  }

  /** The choices as parts, where they are in the room now. */
  parts(): Part[] {
    this.group.updateWorldMatrix(true, false);
    const s = this.group.getWorldScale(V(0, 0, 0)).x;
    return this.rows.map((row, i) => ({ id: `choice:${i}`, at: this.group.localToWorld(V(0, 0.002, row.z)), reach: Math.max(this.w * 0.42, this.size * 1.4) * s }));
  }

  /** Which choice the pointer is over, by its part's id; anything else is none. */
  hover(id: string | null): void {
    const i = id?.startsWith("choice:") ? Number(id.slice(7)) : -1;
    if (i === this.over) return;
    this.over = i;
    if (this.rows.length) this.redraw();
  }

  get count(): number {
    return this.rows.length;
  }

  dispose(): void {
    this.label?.dispose();
  }
}

/* ------------------------------------------------- the base of every prop ------------------------------------------------- */

/** What every prop starts from: its groups, its kit, and doing nothing where it has nothing to do. */
export abstract class PropBase implements TableProp {
  abstract readonly key: PropKey;
  abstract readonly name: string;
  readonly group = new Group();
  readonly spread = new Group();
  protected kit = new Kit();
  /** Its home and spread as last told, and whether the view is upright. */
  protected lay: Lay | null = null;
  protected narrow = false;
  /** True while it is open. */
  protected isOpen = false;

  constructor(protected h: PropHost) {}

  abstract show(shows: readonly Show[]): boolean;

  place(lay: Lay, narrow: boolean): void {
    this.lay = lay;
    this.narrow = narrow;
  }

  open(): void {
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
  }

  parts(): Part[] {
    return [];
  }

  hover(_id: string | null): void {}

  touch(_id: string): void {}

  warm(k: number): void {
    this.kit.warm(k);
  }

  update(_dt: number, _t: number): void {}

  /** A part at a place given in a group's own space (the spread's, unless another is named). */
  protected partAt(id: string, x: number, y: number, z: number, reach: number, of: Object3D = this.spread): Part {
    of.updateWorldMatrix(true, false);
    return { id, at: of.localToWorld(V(x, y, z)), reach: reach * of.getWorldScale(V(0, 0, 0)).x };
  }

  dispose(): void {
    this.kit.dispose();
  }
}
