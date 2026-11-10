/**
 * Your hands when they are not holding the die: drawn flat, in the same
 * manner as the hand in hand.ts and the narrator's eyes (pale shapes, each
 * part with its own ink outline, redrawn a few times a second).
 *
 *   pencil  your right hand as you see it when you write: the forearm coming
 *           up from below, the back of the hand below and to the right of the
 *           pencil's point (so it never lies over what is already written),
 *           the first finger hooked over and the thumb coming up to meet it. The pencil itself is a real
 *           thing in the room (desk.ts): the back of the hand is drawn behind
 *           it and the finger and thumb in front of it, as the die sits in
 *           the other hand.
 *   pinch   the same hand with nothing in it but the corner of a page.
 *   thumb   a hand holding a sheet up by its lower corner: only the thumb is
 *           in front of the paper, with the ball of the thumb below it.
 *
 * Each pose has one point the room places it by (`anchor`): the pinch of finger
 * and thumb, or the pad of the thumb. The sheet is
 * three times as tall as it is wide: the forearm in its sleeve runs the whole
 * way down it, so that however far the hand reaches the arm goes off the
 * bottom of the picture and never ends in mid air.
 */
import { CanvasTexture, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from "three";
import { mk, rng } from "./textures.js";

export type Pose = "pencil" | "pinch" | "thumb";

const S = 512;
const H = 1536;
/** Width of the drawn sheet, in metres, at the distance the room holds it (the same as the hand with the die). */
export const SHEET = 0.28;

const PALE = "#efe4c6";
const SHADE = "#cbbd9b";
const INK = "#0a0705";
const NAIL = "#f8f1de";
const LINE = 5.5;

type Pt = [number, number];
/**
 * The hand that writes is laid out with the pencil running up and to the right from its point (TIP, at LEAN), and
 * then the whole hand is turned about the point by TURN and moved up the sheet by RISE, so that the pencil runs
 * to the right and a little down, the hand hangs below it, and the forearm comes straight up the sheet.
 */
const TIP: Pt = [150, 300];
const LEAN = -Math.PI / 6;
const TURN = (35 * Math.PI) / 180;
const RISE = 70;
/** A point of that layout, where it ends up on the sheet. */
const turned = (p: Pt): Pt => {
  const x = p[0] - TIP[0], y = p[1] - TIP[1];
  return [TIP[0] + x * Math.cos(TURN) - y * Math.sin(TURN), TIP[1] - RISE + x * Math.sin(TURN) + y * Math.cos(TURN)];
};
/** The pencil's lean on the sheet as the room measures it (up is positive): the hand is turned until the real pencil lies along this. */
export const GRIP_LEAN = -LEAN - TURN;
const ANCHOR: Record<Pose, Pt> = { pencil: turned([200, 280]), pinch: turned([200, 280]), thumb: [250, 278] };

interface Layer {
  g: CanvasRenderingContext2D;
  tex: CanvasTexture;
  mat: MeshBasicMaterial;
}

export class DrawnHand {
  /** Hang this on the camera. */
  readonly group = new Group();
  pose: Pose = "pencil";
  /** The drawing order of the back of the hand. What it holds is drawn at ORDER + 1, the finger and thumb at ORDER + 2. */
  static readonly ORDER = 24;
  /** Behind what is held, and in front of it. */
  private layers: Layer[] = [];
  private drawn = "";

  /** @param mirror draw it as a left hand */
  constructor(private reduced: boolean, private mirror = false) {
    for (const order of [DrawnHand.ORDER, DrawnHand.ORDER + 2]) {
      const [c, g] = mk(S, H);
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      tex.minFilter = tex.magFilter = LinearFilter;
      tex.generateMipmaps = false;
      // Nothing in the room is nearer the eye than your hands, so they are simply drawn last.
      const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false, side: DoubleSide });
      const sheet = new Mesh(new PlaneGeometry(SHEET, (SHEET * H) / S), mat);
      sheet.renderOrder = order;
      sheet.frustumCulled = false;
      if (mirror) sheet.scale.x = -1;
      this.group.add(sheet);
      this.layers.push({ g, tex, mat });
    }
    this.group.visible = false;
  }

  /** Where the pose's own point is, measured from the middle of the sheet, in metres. */
  anchor(out = new Vector3()): Vector3 {
    const [x, y] = ANCHOR[this.pose];
    return out.set((x / S - 0.5) * SHEET * (this.mirror ? -1 : 1), ((0.5 - y / H) * SHEET * H) / S, 0);
  }

  /** @param brightness how lit the hand is, so it does not glow in a dark room */
  update(t: number, brightness: number): void {
    if (!this.group.visible) return;
    const step = this.reduced ? 0 : Math.floor(t * 9);
    const key = `${this.pose}:${step}`;
    if (key !== this.drawn) {
      this.drawn = key;
      this.draw(step);
    }
    for (const l of this.layers) l.mat.color.setScalar(brightness * 0.72);
  }

  private draw(step: number): void {
    let g = this.layers[0]!.g;
    const r = rng(700 + step * 17);
    const j = (k = 1.2) => (r() - 0.5) * k;
    const jp = (p: Pt, k = 1.2): Pt => [p[0] + j(k), p[1] + j(k)];
    for (const l of this.layers) {
      l.g.clearRect(0, 0, S, H);
      l.g.lineJoin = l.g.lineCap = "round";
      l.tex.needsUpdate = true;
    }

    /**
     * A limb: a smooth run through points with a width at each, inked round its edge and filled pale.
     * A rooted one grows out of the shape its first point lies in: no ink across that end.
     */
    const limb = (pts: Pt[], widths: number[], rooted = false, fill = PALE) => {
      const fine: { p: Pt; w: number }[] = [];
      const n = pts.length - 1;
      for (let i = 0; i < n; i++) {
        // Rounded at the joints: each stretch is bent toward the points on either side of it.
        const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(n, i + 2)]!;
        for (let k = 0; k < 8; k++) {
          const u = k / 8, u2 = u * u, u3 = u2 * u;
          const at = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (3 * b - a - 3 * c + d) * u3);
          fine.push({ p: [at(p0[0], p1[0], p2[0], p3[0]), at(p0[1], p1[1], p2[1], p3[1])], w: widths[i]! + (widths[i + 1]! - widths[i]!) * u });
        }
      }
      fine.push({ p: pts[n]!, w: widths[n]! });
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
      if (rooted) {
        g.fillStyle = fill;
        g.beginPath();
        g.arc(pts[0]![0], pts[0]![1], widths[0]! / 2 + LINE + 0.5, 0, Math.PI * 2);
        g.fill();
      }
    };
    /** A fingernail at the end of a finger that points along `a`: small, and flat across its base. */
    const nail = (tip: Pt, a: number, w: number) => {
      g.save();
      g.translate(tip[0] - Math.cos(a) * w * 0.2, tip[1] - Math.sin(a) * w * 0.2);
      g.rotate(a);
      g.beginPath();
      g.moveTo(-w * 0.3, -w * 0.26);
      g.quadraticCurveTo(w * 0.42, -w * 0.3, w * 0.42, 0);
      g.quadraticCurveTo(w * 0.42, w * 0.3, -w * 0.3, w * 0.26);
      g.closePath();
      g.fillStyle = NAIL;
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 2.2;
      g.stroke();
      g.restore();
    };
    /** A thin ink line through four points. */
    const ink = (w: number, p: number[]) => {
      g.strokeStyle = INK;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(p[0]! + j(), p[1]! + j());
      g.bezierCurveTo(p[2]! + j(), p[3]! + j(), p[4]! + j(), p[5]! + j(), p[6]! + j(), p[7]! + j());
      g.stroke();
    };
    /** A closed, rounded shape through these points, inked and filled. */
    const blob = (pts: Pt[], fill = PALE) => {
      const q = pts.map((p) => jp(p));
      const mid = (a: Pt, c: Pt): Pt => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      const start = mid(q[q.length - 1]!, q[0]!);
      g.beginPath();
      g.moveTo(start[0], start[1]);
      for (let i = 0; i < q.length; i++) {
        const m = mid(q[i]!, q[(i + 1) % q.length]!);
        g.quadraticCurveTo(q[i]![0], q[i]![1], m[0], m[1]);
      }
      g.closePath();
      g.strokeStyle = INK;
      g.lineWidth = LINE * 2;
      g.stroke();
      g.fillStyle = fill;
      g.fill();
    };
    /**
     * The forearm in its sleeve, from a wrist down off the bottom of the sheet, and the wrist that comes out of it.
     * It leaves the wrist toward `elbow` and then runs straight down, keeping inside the sheet.
     */
    const arm = (wrist: Pt, hand: Pt, cuff: Pt, elbow: Pt, w: number) => {
      limb([jp(cuff), jp(hand)], [w, w * 1.08]);
      for (const [color, width] of [[PALE, w * 1.5 + 9], [INK, w * 1.5]] as const) {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.lineCap = "butt";
        g.beginPath();
        g.moveTo(wrist[0], wrist[1]);
        g.quadraticCurveTo(elbow[0], elbow[1], elbow[0], elbow[1] + 260);
        g.lineTo(elbow[0], H + 20);
        g.stroke();
        g.lineCap = "round";
      }
    };

    if (this.pose === "thumb") {
      arm([368, 566], [352, 470], [366, 560], [398, 760], 76);
      // The ball of the thumb, below the edge of the paper; the fingers are behind the sheet.
      blob([[296, 356], [346, 344], [392, 372], [408, 430], [394, 490], [348, 512], [304, 494], [284, 432]]);
      g.fillStyle = SHADE;
      g.beginPath();
      g.ellipse(346 + j(), 436 + j(), 26, 40, -0.35, 0, Math.PI * 2);
      g.fill();
      // The thumb, across the front of the page.
      const a: Pt = jp([322, 392]), b: Pt = jp([280, 326]), c: Pt = jp([244, 264]);
      limb([a, b, c], [46, 39, 31], true);
      nail(c, Math.atan2(c[1] - b[1], c[0] - b[0]), 31);
      ink(2.4, [296, 318, 286, 327, 275, 332, 264, 333]);
      return;
    }

    const ux = Math.cos(LEAN), uy = Math.sin(LEAN);
    /** A point `d` along the pencil from its tip and `off` to the near side of it (toward the hand). */
    const at = (d: number, off: number): Pt => [TIP[0] + ux * d - uy * off, TIP[1] + uy * d + ux * off];
    const writing = this.pose === "pencil";

    const wrist = turned([398, 506]);
    arm(wrist, turned([352, 392]), turned([392, 492]), [wrist[0] + 46, wrist[1] + 220], 78);
    for (const l of this.layers) {
      l.g.save();
      l.g.translate(TIP[0], TIP[1] - RISE);
      l.g.rotate(TURN);
      l.g.translate(-TIP[0], -TIP[1]);
    }
    // The other fingers, curled under the hand: one rounded shape, with a line between each.
    blob([[268, 318], [240, 338], [228, 376], [244, 412], [284, 428], [330, 416], [330, 340]]);
    ink(2.4, [232, 364, 244, 366, 256, 369, 268, 374]);
    ink(2.4, [240, 398, 252, 398, 264, 400, 276, 405]);
    // The back of the hand.
    blob([[274, 198], [334, 190], [384, 236], [402, 306], [388, 374], [348, 412], [302, 418], [270, 388], [260, 330], [260, 262]]);
    // The knuckles.
    ink(2.8, [346, 226, 356, 224, 364, 230, 368, 242]);
    ink(2.8, [366, 270, 375, 270, 381, 277, 383, 290]);
    ink(2.8, [374, 320, 381, 322, 385, 330, 385, 342]);
    // From here on the drawing lies over what the hand holds: the finger and thumb that hold it.
    g = this.layers[1]!.g;
    // The first finger, lying along the top of the pencil with its end near the point.
    const i0 = at(176, 20), i1 = jp(at(114, -14)), i2 = jp(writing ? at(52, -4) : at(56, 6));
    limb([i0, i1, i2], [36, 30, 24], true);
    nail(i2, Math.atan2(i2[1] - i1[1], i2[0] - i1[0]), 21);
    ink(2.2, [...at(118, -27), ...at(113, -20), ...at(110, -12), ...at(109, -4)]);
    // The thumb, from the near side, pressing against it.
    const t0: Pt = [326, 350], t1 = jp([266, 330]), t2 = jp([208, 290]);
    limb([t0, t1, t2], [45, 38, 29], true);
    nail(t2, Math.atan2(t2[1] - t1[1], t2[0] - t1[0]), 26);
    ink(2.4, [276, 316, 268, 322, 262, 331, 259, 341]);
    for (const l of this.layers) l.g.restore();
  }

  dispose(): void {
    for (const l of this.layers) {
      l.tex.dispose();
      l.mat.dispose();
    }
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
  }
}
