/**
 * Your own hand: a flat drawing in the same manner as the narrator's eyes,
 * pale shapes with dark ink lines, redrawn a few times a second so it lives
 * like an animated drawing. It comes up from the lower right holding the die;
 * the room moves it with the pointer and lets go on a click.
 *
 * It is a right hand seen by its owner, palm up and cupped. Every part has
 * its own ink outline, so it reads at a glance: a dark sleeve in the corner,
 * the wrist coming out of it, the palm, four fingers standing up from the
 * palm's far edge and curling back over the die, and the thumb closing on it
 * from the right. While the hand is closed the ends of the fingers show their
 * nails, as your own do when you look down at something held in your palm.
 *
 * The drawing is in two sheets: the palm behind the die, and the ends of the
 * fingers and thumb in front of it, so the die really sits in the hand.
 */
import { CanvasTexture, Group, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three";
import { mk, rng } from "./textures.js";

const S = 512;
/** Width and height of the drawn sheet in the room, in metres, at the distance the room holds it. */
export const HAND_SIZE = 0.28;

const PALE = "#efe4c6";
const SHADE = "#c9bb98";
const INK = "#0a0705";
const NAIL = "#fbf5e4";
const LINE = 5.5;
/** The hollow of the palm on the drawing, where the die lies. */
const HOLLOW = { x: 250, y: 300 };

type Pt = [number, number];

/**
 * Each finger, little finger first: where it leaves the palm, which way it points when straight (radians; -PI/2 is
 * up the sheet), the length of its first bone and of the rest, its width, and where its tip rests when cupped.
 */
const FINGERS: { base: Pt; a: number; l1: number; l2: number; w: number; rest: Pt }[] = [
  { base: [182, 232], a: -1.98, l1: 54, l2: 62, w: 33, rest: [204, 284] },
  { base: [228, 210], a: -1.74, l1: 66, l2: 76, w: 36, rest: [234, 280] },
  { base: [278, 204], a: -1.54, l1: 70, l2: 80, w: 37, rest: [266, 278] },
  { base: [326, 214], a: -1.33, l1: 62, l2: 72, w: 35, rest: [298, 284] },
];

export class PlayerHand {
  /** Hang this on the camera. */
  readonly group = new Group();
  /** The hollow of the palm, where the die lies. */
  readonly palm = new Group();
  private back: { g: CanvasRenderingContext2D; tex: CanvasTexture; mat: MeshBasicMaterial };
  private front: { g: CanvasRenderingContext2D; tex: CanvasTexture; mat: MeshBasicMaterial };
  private drawn = "";
  private shown = 0;
  private lastT = 0;
  /** 0 is cupped round the die; 1 is flung open, letting go. */
  open = 0;
  /** 0..1: how hard the hand is being shaken. The fingers ease off the die a little so it can rattle. */
  loose = 0;

  constructor(private reduced: boolean) {
    const layer = (order: number) => {
      const [c, g] = mk(S, S);
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      tex.minFilter = tex.magFilter = LinearFilter;
      tex.generateMipmaps = false;
      // Nothing in the room is nearer the eye than the hand, so it is simply drawn last, in order: palm, die, fingers.
      const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false });
      const sheet = new Mesh(new PlaneGeometry(HAND_SIZE, HAND_SIZE), mat);
      sheet.renderOrder = order;
      sheet.frustumCulled = false;
      this.group.add(sheet);
      return { g, tex, mat };
    };
    this.back = layer(PlayerHand.ORDER);
    this.front = layer(PlayerHand.ORDER + 2);
    this.group.add(this.palm);
    this.palm.position.set((HOLLOW.x / S - 0.5) * HAND_SIZE, (0.5 - HOLLOW.y / S) * HAND_SIZE, 0.034);
    this.group.visible = false;
  }

  /** The palm is drawn at this order, whatever lies in it at the next, the fingers over it at the one after. */
  static readonly ORDER = 20;

  /** @param brightness how lit the hand is, so it does not glow in a dark room */
  update(t: number, brightness: number): void {
    if (!this.group.visible) return;
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const want = Math.min(1, this.open + this.loose * 0.22 * (1 - this.open));
    this.shown = this.reduced ? want : this.shown + (want - this.shown) * Math.min(1, dt * 16);
    const step = this.reduced ? 0 : Math.floor(t * 9);
    const key = `${step}:${Math.round(this.shown * 12)}`;
    if (key !== this.drawn) {
      this.drawn = key;
      this.draw(step, Math.round(this.shown * 12) / 12);
    }
    this.back.mat.color.setScalar(brightness * 0.72);
    this.front.mat.color.setScalar(brightness * 0.72);
  }

  private draw(step: number, o: number): void {
    const b = this.back.g, f = this.front.g;
    const r = rng(500 + step * 13);
    const j = (k = 1.6) => (r() - 0.5) * k;
    const jp = (p: Pt, k = 1.6): Pt => [p[0] + j(k), p[1] + j(k)];
    for (const g of [b, f]) {
      g.clearRect(0, 0, S, S);
      g.lineJoin = g.lineCap = "round";
    }

    /** A limb: a run of points with a width at each, inked round its whole edge and filled pale. */
    const limb = (g: CanvasRenderingContext2D, pts: Pt[], widths: number[], fill = PALE) => {
      const fine: { p: Pt; w: number }[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        for (let k = 0; k < 5; k++) {
          const u = k / 5;
          fine.push({ p: [pts[i]![0] + (pts[i + 1]![0] - pts[i]![0]) * u, pts[i]![1] + (pts[i + 1]![1] - pts[i]![1]) * u], w: widths[i]! + (widths[i + 1]! - widths[i]!) * u });
        }
      }
      fine.push({ p: pts[pts.length - 1]!, w: widths[widths.length - 1]! });
      for (const [color, extra] of [[INK, LINE * 2], [fill, 0]] as const) {
        g.strokeStyle = color;
        for (let i = 0; i < fine.length - 1; i++) {
          g.lineWidth = (fine[i]!.w + fine[i + 1]!.w) / 2 + extra;
          g.beginPath();
          g.moveTo(fine[i]!.p[0], fine[i]!.p[1]);
          g.lineTo(fine[i + 1]!.p[0], fine[i + 1]!.p[1]);
          g.stroke();
        }
      }
    };
    /** A fingernail at the end of a finger that points along `a`: seen only while the finger is folded over. */
    const nail = (g: CanvasRenderingContext2D, tip: Pt, a: number, w: number, shown: number) => {
      if (shown <= 0.05) return;
      g.save();
      g.globalAlpha = Math.min(1, shown);
      g.translate(tip[0] - Math.cos(a) * w * 0.3, tip[1] - Math.sin(a) * w * 0.3);
      g.rotate(a);
      g.beginPath();
      g.ellipse(0, 0, w * 0.4, w * 0.27, 0, 0, Math.PI * 2);
      g.fillStyle = NAIL;
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 2.6;
      g.stroke();
      g.restore();
    };
    /** A thin ink line through four points. */
    const ink = (g: CanvasRenderingContext2D, w: number, p: number[]) => {
      g.strokeStyle = INK;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(p[0]! + j(), p[1]! + j());
      g.bezierCurveTo(p[2]! + j(), p[3]! + j(), p[4]! + j(), p[5]! + j(), p[6]! + j(), p[7]! + j());
      g.stroke();
    };

    // The sleeve, in the corner: dark cloth with a pale edge, so it shows in a dark room.
    b.strokeStyle = PALE;
    b.lineWidth = 142;
    b.beginPath();
    b.moveTo(392 + j(), 500 + j());
    b.lineTo(520, 660);
    b.stroke();
    b.strokeStyle = INK;
    b.lineWidth = 132;
    b.beginPath();
    b.moveTo(393, 501);
    b.lineTo(520, 660);
    b.stroke();
    ink(b, 3, [356, 512, 384, 486, 420, 470, 452, 474]);

    // The wrist, out of the sleeve, widening into the heel of the hand.
    limb(b, [jp([366, 468]), jp([318, 408])], [88, 104]);

    // The palm: one broad shape. Its far edge, where the fingers stand, runs from the little finger up to the first.
    const palm: Pt[] = [[160, 240], [212, 210], [280, 200], [338, 214], [362, 268], [368, 330], [352, 396], [300, 432], [226, 414], [176, 366], [154, 300]];
    const outline = () => {
      b.beginPath();
      const q = palm.map((p) => jp(p));
      const mid = (a: Pt, c: Pt): Pt => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      const start = mid(q[q.length - 1]!, q[0]!);
      b.moveTo(start[0], start[1]);
      for (let i = 0; i < q.length; i++) {
        const m = mid(q[i]!, q[(i + 1) % q.length]!);
        b.quadraticCurveTo(q[i]![0], q[i]![1], m[0], m[1]);
      }
      b.closePath();
    };
    outline();
    b.strokeStyle = INK;
    b.lineWidth = LINE * 2;
    b.stroke();
    b.fillStyle = PALE;
    b.fill();
    // The heel of the thumb, a little darker, and the two long creases of the palm.
    b.fillStyle = SHADE;
    b.beginPath();
    b.ellipse(326 + j(), 356 + j(), 34, 52, -0.35, 0, Math.PI * 2);
    b.fill();
    ink(b, 3.4, [322, 236, 276, 268, 262, 340, 300, 420]);
    ink(b, 3.4, [176, 286, 222, 262, 268, 262, 316, 238]);

    // The thumb: from its heel on the right, up, and in onto the die. Let go, it swings out.
    const tm: Pt = [356, 326];
    const tk: Pt = [384 + o * 22, 262 + o * 10];
    const tt: Pt = [300 + o * 158, 290 - o * 80];
    limb(b, [jp(tm), jp(tk)], [50, 42]);
    limb(f, [jp(tk), jp(tt)], [40, 31]);
    nail(f, tt, Math.atan2(tt[1] - tk[1], tt[0] - tk[0]), 33, 1 - o * 2.5);

    // The fingers. Cupped, each stands up from the palm and folds back down onto the die; let go, it flings straight.
    for (const fg of FINGERS) {
      // Let go, the fingers also spread a little.
      const a = fg.a + (fg.a + Math.PI / 2) * o * 0.35;
      const l1 = fg.l1 * (0.52 + 0.48 * o);
      const knuckle: Pt = [fg.base[0] + Math.cos(a) * l1, fg.base[1] + Math.sin(a) * l1];
      // The folded end points at where the tip rests; straightened, it carries on the way the finger points.
      const cup = Math.atan2(fg.rest[1] - knuckle[1], fg.rest[0] - knuckle[0]);
      let turn = cup - a;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      const a2 = a + turn * (1 - o);
      const cupLen = Math.hypot(fg.rest[0] - knuckle[0], fg.rest[1] - knuckle[1]);
      const l2 = cupLen + (fg.l2 - cupLen) * o;
      const mid: Pt = [knuckle[0] + Math.cos(a2) * l2 * 0.52, knuckle[1] + Math.sin(a2) * l2 * 0.52];
      const tip: Pt = [knuckle[0] + Math.cos(a2) * l2, knuckle[1] + Math.sin(a2) * l2];
      limb(b, [fg.base, jp(knuckle)], [fg.w, fg.w * 0.94]);
      limb(f, [jp(knuckle), jp(mid), jp(tip)], [fg.w * 0.94, fg.w * 0.86, fg.w * 0.74]);
      nail(f, tip, a2, fg.w * 0.8, 1 - o * 2.5);
      // The crease of the last joint, across the finger.
      const nx = -Math.sin(a2), ny = Math.cos(a2);
      f.strokeStyle = INK;
      f.lineWidth = 3;
      f.beginPath();
      f.moveTo(mid[0] - nx * fg.w * 0.26, mid[1] - ny * fg.w * 0.26);
      f.lineTo(mid[0] + nx * fg.w * 0.26, mid[1] + ny * fg.w * 0.26);
      f.stroke();
    }
    this.back.tex.needsUpdate = true;
    this.front.tex.needsUpdate = true;
  }

  dispose(): void {
    for (const l of [this.back, this.front]) {
      l.tex.dispose();
      l.mat.dispose();
    }
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
  }
}
