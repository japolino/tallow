/**
 * A page from your notebook: a real sheet in the room with writing on it.
 * Your own line is at the top in pencil, in a hand that looks written; what
 * the narrator writes under it is in ink, in an upright hand. A turn is one
 * page, and the pages you have set down are the record of the game.
 *
 * The sheet's own space: its top edge (the binder's edge) lies along x
 * through the origin, and the page runs away from it along +z. The written
 * side faces +y.
 */
import { AlwaysDepth, BackSide, CanvasTexture, FrontSide, Group, Mesh, LessEqualDepth, MeshStandardMaterial, PlaneGeometry, ReplaceStencilOp, SRGBColorSpace } from "three";
import { mk, rng } from "./textures.js";

/** Size of a page in the room, in metres. */
export const PAGE_W = 0.13;
export const PAGE_H = 0.19;

const PX_W = 640;
const PX_H = 936;
const SIDE = 44;
const TOP = 62;
/** Clear of the thumbs that hold the page up. */
const BOTTOM = 118;
/** How much of the foot of the page is left bare for the thumbs, in metres. */
export const PAGE_FOOT = (BOTTOM / PX_H) * PAGE_H;
/** What the page in your hands marks the picture with wherever it is drawn, so the hands behind it can be left out there (drawnhands.ts). */
export const HELD_MARK = 1;

const MINE_FONT = '"Segoe Print", "Ink Free", "Bradley Hand", "Comic Sans MS", cursive';
const HIS_FONT = 'Georgia, "Palatino Linotype", "Book Antiqua", serif';
const PENCIL = "#34353b";
const INK = "#1d0e08";
const PAPER = "#e6dcc0";
/** The one size your own line is written at while you write, however long it grows. */
const WRITE_SIZE = 34;
/** The most room your line is given on a page the narrator writes under. */
const MINE_ROOM = 390;
/** The sizes a transcript is written at: your line in pencil, the narrator's in ink. */
const NOTE_MINE = 27;
const NOTE_HIS = 27;
/** The foot left bare on a transcript, which is never held up by its corners: room for the number of the leaf. */
const NOTE_FOOT = 64;

/** Rows cut into leaves no taller than `room`. A row's gap is the space before it, and is left out at the top of a leaf. */
export function leavesOf<T extends { h: number; gap?: number }>(rows: readonly T[], room: number): T[][] {
  const leaves: T[][] = [[]];
  let tall = 0;
  for (const row of rows) {
    const leaf = leaves[leaves.length - 1]!;
    const need = row.h + (leaf.length ? (row.gap ?? 0) : 0);
    if (leaf.length && tall + need > room) {
      leaves.push([row]);
      tall = row.h;
    } else {
      leaf.push(row);
      tall += need;
    }
  }
  return leaves;
}

/** Break text into lines no wider than `width`, at spaces where it can and inside a word where it must. */
export function wrapText(measure: (s: string) => number, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      // A word longer than a whole line starts a line of its own and is cut where it stops fitting.
      while (measure(w) > width && w.length > 1) {
        if (line) {
          lines.push(line);
          line = "";
        }
        let n = w.length - 1;
        while (n > 1 && measure(w.slice(0, n)) > width) n--;
        lines.push(w.slice(0, n));
        w = w.slice(n);
      }
      const next = line ? `${line} ${w}` : w;
      if (measure(next) > width) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

export interface PageWriting {
  /** Your line, in pencil. */
  mine: string;
  /** A short heading over the narrator's writing (what the try was), if any. */
  heading?: string;
  /** The narrator's writing: one entry a paragraph. */
  his: string[];
  /** Pencil notes in the margin, in your hero's hand (docs/MOONSHOT.md, 3.2): "SENSE — ...". */
  margin?: string[];
}

export class Page {
  /** The sheet. Its origin is the middle of its top edge. */
  readonly group = new Group();
  readonly writing: PageWriting = { mine: "", his: [] };
  /** Where the pencil is: the end of your writing, on the sheet, in metres from the origin (x across, z down the page). */
  readonly caret = { x: -PAGE_W / 2 + (SIDE / PX_W) * PAGE_W, z: (TOP / PX_H) * PAGE_H };
  /**
   * How the page is laid out. "turn": your line fitted at the top, and the narrator's writing under it. "draft": your
   * line alone, at one size, on as many leaves as it takes (the page on the pad while you write). "notes": a
   * transcript at one size, on as many leaves as it takes.
   */
  mode: "turn" | "draft" | "notes" = "turn";
  /** Which leaf is shown (draft and notes); drawing brings it within what there is, so anything large shows the last. */
  leaf = 0;
  /** How many leaves the writing took when it was last drawn. */
  leaves = 1;
  private g: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private front: MeshStandardMaterial;
  private back: MeshStandardMaterial;
  private geo: PlaneGeometry;
  private flat: Float32Array;
  private bent = 0;
  private seed: number;

  /** @param sheet one of your sheets (desk.ts): card-stock ruled round its edge, with no binder holes. */
  constructor(seed = 1, private sheet = false) {
    this.seed = seed;
    const [c, g] = mk(PX_W, PX_H);
    this.g = g;
    this.tex = new CanvasTexture(c);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.geo = new PlaneGeometry(PAGE_W, PAGE_H, 4, 12);
    this.geo.rotateX(-Math.PI / 2);
    this.geo.translate(0, 0, PAGE_H / 2);
    this.flat = new Float32Array(this.geo.attributes.position!.array as Float32Array);
    // Paper gives a little of its own light back, so writing can be read in a dark room.
    this.front = new MeshStandardMaterial({ map: this.tex, roughness: 0.95, side: FrontSide, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.04 });
    this.back = new MeshStandardMaterial({ color: 0xcfc4a6, roughness: 0.95, side: BackSide, emissive: 0xcfc4a6, emissiveIntensity: 0.03 });
    for (const mat of [this.front, this.back]) {
      const m = new Mesh(this.geo, mat);
      m.castShadow = mat === this.front;
      m.receiveShadow = true;
      this.group.add(m);
    }
    this.draw();
  }

  /** How much of its own light the page gives: about 0.04 lying on the table, more held up to be read. */
  get glow(): number {
    return this.front.emissiveIntensity;
  }

  set glow(k: number) {
    this.front.emissiveIntensity = k;
    this.back.emissiveIntensity = k * 0.6;
  }

  /** Draw the page in front of everything else in the room (while it is in your hands), or as an ordinary thing in it. */
  set inFront(on: boolean) {
    for (const m of this.group.children as Mesh[]) m.renderOrder = on ? 18 : 0;
    // It still writes its own depth, so nothing in the air behind it (dust, light, the narrator's eyes) shows through.
    this.front.depthFunc = this.back.depthFunc = on ? AlwaysDepth : LessEqualDepth;
    // And it marks where it is, so that the hands holding it are not drawn over it: only their thumbs are.
    for (const mat of [this.front, this.back]) {
      mat.stencilWrite = on;
      mat.stencilRef = HELD_MARK;
      mat.stencilZPass = ReplaceStencilOp;
    }
  }

  /** The order it is drawn in while it is in your hands with others (desk.ts): the highest lies over the rest. */
  set order(n: number) {
    for (const m of this.group.children as Mesh[]) m.renderOrder = n;
  }

  /**
   * Bend the sheet: 0 lies flat; above 0 the free end lifts and the page bows, as it does when it is peeled from the
   * binder or carried by one corner.
   */
  curl(k: number): void {
    if (Math.abs(k - this.bent) < 0.002) return;
    this.bent = k;
    const p = this.geo.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const x = this.flat[i * 3]!, z = this.flat[i * 3 + 2]!;
      const s = z / PAGE_H;
      p.setY(i, k * (s * s * 0.045 + Math.sin(s * Math.PI) * 0.012 + (x / PAGE_W) * (x / PAGE_W) * 0.02 * s));
    }
    p.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  /** Paint the sheet from `writing`. */
  draw(): void {
    const g = this.g;
    const r = rng(900 + this.seed * 31);
    g.fillStyle = this.sheet ? "#d6bd88" : PAPER;
    g.fillRect(0, 0, PX_W, PX_H);
    // Age: darker toward the edges, and a few foxed spots.
    const edge = g.createRadialGradient(PX_W / 2, PX_H / 2, PX_H * 0.3, PX_W / 2, PX_H / 2, PX_H * 0.72);
    edge.addColorStop(0, "rgba(120,90,40,0)");
    edge.addColorStop(1, "rgba(120,90,40,0.22)");
    g.fillStyle = edge;
    g.fillRect(0, 0, PX_W, PX_H);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = `rgba(130,96,50,${0.05 + r() * 0.07})`;
      g.beginPath();
      g.arc(r() * PX_W, r() * PX_H, 3 + r() * 9, 0, Math.PI * 2);
      g.fill();
    }
    if (this.sheet) {
      // A sheet: ruled round in red ink, a thick rule and a thin.
      g.strokeStyle = "rgba(120,30,20,0.7)";
      g.lineWidth = 4;
      g.strokeRect(18, 18, PX_W - 36, PX_H - 36);
      g.lineWidth = 1.5;
      g.strokeRect(27, 27, PX_W - 54, PX_H - 54);
    } else {
      // The holes the binder's rings went through.
      g.fillStyle = "rgba(40,28,16,0.55)";
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.ellipse(PX_W * (0.1 + i * 0.1), 20, 9, 7, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    const width = PX_W - SIDE * 2;
    g.textBaseline = "alphabetic";
    let y = TOP;
    const w = this.writing;
    if (this.mode === "notes") {
      this.drawNotes();
      this.tex.needsUpdate = true;
      return;
    }
    const draft = this.mode === "draft";
    if (!draft) {
      this.leaf = 0;
      this.leaves = 1;
    }

    if (w.mine) {
      let size = WRITE_SIZE, lines: string[] = [];
      if (draft) {
        // While you write: one size, and a leaf for every pageful. The page shows one leaf of it.
        g.font = `${size}px ${MINE_FONT}`;
        const all = wrapText((s) => g.measureText(s).width, w.mine, width);
        const per = Math.max(1, Math.floor((PX_H - TOP - BOTTOM) / (size * 1.24)));
        this.leaves = Math.max(1, Math.ceil(all.length / per));
        this.leaf = Math.max(0, Math.min(this.leaves - 1, this.leaf));
        lines = all.slice(this.leaf * per, (this.leaf + 1) * per);
      } else {
        // Under it the narrator will write: your line is fitted into the top of the page, and cut short if it cannot be.
        for (size of [WRITE_SIZE, 30, 26]) {
          g.font = `${size}px ${MINE_FONT}`;
          lines = wrapText((s) => g.measureText(s).width, w.mine, width);
          if (lines.length * size * 1.24 <= MINE_ROOM) break;
        }
        const most = Math.max(1, Math.floor(MINE_ROOM / (size * 1.24)));
        if (lines.length > most) {
          lines = lines.slice(0, most);
          let last = lines[most - 1]!;
          while (last.length > 1 && g.measureText(`${last} …`).width > width) last = last.slice(0, -1);
          lines[most - 1] = `${last} …`;
        }
      }
      const lh = size * 1.24;
      g.fillStyle = PENCIL;
      g.globalAlpha = 0.92;
      lines.forEach((line, i) => {
        // Written by hand: no line sits quite level or starts quite where the last did.
        g.save();
        g.translate(SIDE + (r() - 0.5) * 5, y + size + i * lh);
        g.rotate((r() - 0.5) * 0.012);
        g.fillText(line, 0, 0);
        g.restore();
      });
      g.globalAlpha = 1;
      const last = lines[lines.length - 1] ?? "";
      // A space just typed moves the pencil on, though it leaves no mark.
      const gap = /\s$/.test(w.mine) ? g.measureText(" ").width : 0;
      this.caret.x = -PAGE_W / 2 + ((SIDE + Math.min(width, g.measureText(last).width + gap) + 6) / PX_W) * PAGE_W;
      this.caret.z = ((y + size * 0.9 + (lines.length - 1) * lh) / PX_H) * PAGE_H;
      y += lines.length * lh + 26;
      // Past the first leaf, each is numbered at its foot, so you know how far on you are.
      if (draft && this.leaves > 1) {
        g.font = `22px ${MINE_FONT}`;
        g.globalAlpha = 0.6;
        g.textAlign = "center";
        g.fillText(String(this.leaf + 1), PX_W / 2, PX_H - 34);
        g.textAlign = "left";
        g.globalAlpha = 1;
      }
    } else {
      this.leaf = 0;
      this.leaves = 1;
      this.caret.x = -PAGE_W / 2 + ((SIDE + 6) / PX_W) * PAGE_W;
      this.caret.z = ((TOP + 40) / PX_H) * PAGE_H;
    }

    if (w.his.length || w.heading) {
      if (w.mine) {
        // A stroke of the narrator's pen under your line.
        g.strokeStyle = INK;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(SIDE, y - 8);
        g.bezierCurveTo(SIDE + width * 0.3, y - 13, SIDE + width * 0.6, y - 3, SIDE + width * 0.86, y - 9);
        g.stroke();
        y += 14;
      }
      const room = PX_H - BOTTOM - y;
      let size = 34, laid: { text: string; gap: boolean }[] = [], headSize = 0, head: string[] = [];
      for (size of [34, 31, 28, 25, 23, 21, 19]) {
        headSize = Math.round(size * 0.86);
        laid = [];
        g.font = `bold ${headSize}px ${HIS_FONT}`;
        head = w.heading ? wrapText((s) => g.measureText(s).width, w.heading, width) : [];
        g.font = `${size}px ${HIS_FONT}`;
        for (const para of w.his) {
          const lines = wrapText((s) => g.measureText(s).width, para, width);
          lines.forEach((text, i) => laid.push({ text, gap: i === 0 && laid.length > 0 }));
        }
        const tall = laid.reduce((sum, l) => sum + size * 1.3 + (l.gap ? size * 0.5 : 0), head.length ? head.length * headSize * 1.25 + headSize * 0.45 : 0);
        if (tall <= room) break;
      }
      g.fillStyle = INK;
      if (head.length) {
        g.font = `bold ${headSize}px ${HIS_FONT}`;
        // A sheet's heading is set in the middle, in red ink, with a rule under it.
        if (this.sheet) {
          g.fillStyle = "#7a1e14";
          g.textAlign = "center";
        }
        for (const line of head) {
          g.fillText(line, this.sheet ? PX_W / 2 : SIDE, y + headSize);
          y += headSize * 1.25;
        }
        if (this.sheet) {
          g.textAlign = "left";
          g.fillStyle = INK;
          g.strokeStyle = "rgba(120,30,20,0.6)";
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(PX_W * 0.3, y + 4);
          g.lineTo(PX_W * 0.7, y + 4);
          g.stroke();
          y += 10;
        }
        y += headSize * 0.45;
      }
      g.font = `${size}px ${HIS_FONT}`;
      for (const l of laid) {
        if (l.gap) y += size * 0.5;
        if (y + size > PX_H - BOTTOM + size * 0.4) break;
        g.fillText(l.text, SIDE, y + size);
        y += size * 1.3;
      }
    }
    if (w.margin?.length) this.drawMargin(w.margin, r);
    this.tex.needsUpdate = true;
  }

  /**
   * A transcript: your line in pencil, a stroke under it, then a heading and the narrator's writing in ink, all at one
   * size, on as many leaves as it takes. One leaf of it is painted, with its number at the foot when there are more.
   */
  private drawNotes(): void {
    const g = this.g;
    const w = this.writing;
    const width = PX_W - SIDE * 2;
    const r = rng(900 + this.seed * 31);
    type Row = { h: number; gap?: number; text?: string; font?: "mine" | "head" | "his" };
    const rows: Row[] = [];
    const measure = (s: string): number => g.measureText(s).width;
    const head = Math.round(NOTE_HIS * 1.05);
    const fonts = { mine: `${NOTE_MINE}px ${MINE_FONT}`, head: `bold ${head}px ${HIS_FONT}`, his: `${NOTE_HIS}px ${HIS_FONT}` };
    if (w.mine) {
      g.font = fonts.mine;
      for (const text of wrapText(measure, w.mine, width)) rows.push({ h: NOTE_MINE * 1.24, text, font: "mine" });
      // The stroke under your line.
      if (w.his.length || w.heading) rows.push({ h: 26 });
    }
    if (w.heading) {
      g.font = fonts.head;
      wrapText(measure, w.heading, width).forEach((text, i) => rows.push({ h: head * 1.25, text, font: "head", gap: i === 0 && rows.length > 0 && !!rows[rows.length - 1]!.text ? NOTE_HIS * 0.5 : 0 }));
    }
    g.font = fonts.his;
    w.his.forEach((para, n) => wrapText(measure, para, width).forEach((text, i) => rows.push({ h: NOTE_HIS * 1.3, text, font: "his", gap: i === 0 && (n > 0 || !!w.heading) ? NOTE_HIS * 0.5 : 0 })));
    const leaves = leavesOf(rows, PX_H - TOP - NOTE_FOOT);
    this.leaves = leaves.length;
    this.leaf = Math.max(0, Math.min(this.leaves - 1, this.leaf));
    let y = TOP;
    leaves[this.leaf]!.forEach((row, i) => {
      if (i && row.gap) y += row.gap;
      if (!row.text) {
        g.strokeStyle = INK;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(SIDE, y + 8);
        g.bezierCurveTo(SIDE + width * 0.3, y + 3, SIDE + width * 0.6, y + 13, SIDE + width * 0.86, y + 7);
        g.stroke();
      } else if (row.font === "mine") {
        g.font = fonts.mine;
        g.fillStyle = PENCIL;
        g.globalAlpha = 0.92;
        g.save();
        g.translate(SIDE + (r() - 0.5) * 4, y + NOTE_MINE);
        g.rotate((r() - 0.5) * 0.01);
        g.fillText(row.text, 0, 0);
        g.restore();
        g.globalAlpha = 1;
      } else {
        g.font = fonts[row.font ?? "his"];
        g.fillStyle = INK;
        g.fillText(row.text, SIDE, y + (row.font === "head" ? head : NOTE_HIS));
      }
      y += row.h;
    });
    if (this.leaves > 1) {
      g.font = `22px ${HIS_FONT}`;
      g.fillStyle = INK;
      g.globalAlpha = 0.65;
      g.textAlign = "center";
      g.fillText(`${this.leaf + 1} of ${this.leaves}`, PX_W / 2, PX_H - 26);
      g.textAlign = "left";
      g.globalAlpha = 1;
    }
  }

  /** The margin: small pencil notes up from the foot of the page, the stat in capitals before each, a little askew. */
  private drawMargin(notes: string[], r: () => number): void {
    const g = this.g;
    const width = PX_W - SIDE * 2;
    let size = 24, laid: string[][] = [];
    for (size of [24, 21, 19, 17]) {
      g.font = `${size}px ${MINE_FONT}`;
      laid = notes.map((n) => wrapText((s) => g.measureText(s).width, n, width - 16));
      if (laid.flat().length * size * 1.2 <= BOTTOM + 120) break;
    }
    const lh = size * 1.2;
    let y = PX_H - 18 - laid.flat().length * lh;
    // A pencil rule across, the way a margin is marked off.
    g.strokeStyle = PENCIL;
    g.globalAlpha = 0.35;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(SIDE, y - 6);
    g.lineTo(SIDE + width * 0.4, y - 7);
    g.stroke();
    g.globalAlpha = 0.85;
    g.fillStyle = PENCIL;
    for (const lines of laid) {
      lines.forEach((line, i) => {
        g.save();
        g.translate(SIDE + 8 + (i ? 18 : 0) + (r() - 0.5) * 4, y + size);
        g.rotate((r() - 0.5) * 0.02);
        g.fillText(line, 0, 0);
        g.restore();
        y += lh;
      });
    }
    g.globalAlpha = 1;
  }

  dispose(): void {
    this.tex.dispose();
    this.front.dispose();
    this.back.dispose();
    this.geo.dispose();
  }
}
