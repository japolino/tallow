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
import { AlwaysDepth, BackSide, CanvasTexture, FrontSide, Group, Mesh, LessEqualDepth, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from "three";
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

const MINE_FONT = '"Segoe Print", "Ink Free", "Bradley Hand", "Comic Sans MS", cursive';
const HIS_FONT = 'Georgia, "Palatino Linotype", "Book Antiqua", serif';
const PENCIL = "#34353b";
const INK = "#1d0e08";
const PAPER = "#e6dcc0";

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
  /** True when the last thing typed did not fit on the page. */
  full = false;
  private g: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private front: MeshStandardMaterial;
  private back: MeshStandardMaterial;
  private geo: PlaneGeometry;
  private flat: Float32Array;
  private bent = 0;
  private seed: number;

  constructor(seed = 1) {
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
  set glow(k: number) {
    this.front.emissiveIntensity = k;
    this.back.emissiveIntensity = k * 0.6;
  }

  /** Draw the page in front of everything else in the room (while it is in your hands), or as an ordinary thing in it. */
  set inFront(on: boolean) {
    for (const m of this.group.children as Mesh[]) m.renderOrder = on ? 18 : 0;
    // It still writes its own depth, so nothing in the air behind it (dust, light, the narrator's eyes) shows through.
    this.front.depthFunc = this.back.depthFunc = on ? AlwaysDepth : LessEqualDepth;
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
    g.fillStyle = PAPER;
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
    // The holes the binder's rings went through.
    g.fillStyle = "rgba(40,28,16,0.55)";
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.ellipse(PX_W * (0.1 + i * 0.1), 20, 9, 7, 0, 0, Math.PI * 2);
      g.fill();
    }

    const width = PX_W - SIDE * 2;
    g.textBaseline = "alphabetic";
    let y = TOP;
    const w = this.writing;
    this.full = false;

    if (w.mine) {
      let size = 46, lines: string[] = [];
      for (size of [46, 40, 35, 30, 26]) {
        g.font = `${size}px ${MINE_FONT}`;
        lines = wrapText((s) => g.measureText(s).width, w.mine, width);
        if (lines.length * size * 1.24 <= 390) break;
      }
      const lh = size * 1.24;
      const most = Math.floor((PX_H - TOP - BOTTOM) / lh);
      if (lines.length > most) {
        lines = lines.slice(0, most);
        this.full = true;
      }
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
    } else {
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
        for (const line of head) {
          g.fillText(line, SIDE, y + headSize);
          y += headSize * 1.25;
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
