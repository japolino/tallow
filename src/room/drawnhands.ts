/**
 * Your hands when they are not holding the die: flat, in the same manner as
 * the hand in hand.ts and the narrator's eyes (pale shapes, each part with
 * its own ink outline).
 *
 * They are pictures of a real 3D hand (models/player_hand.py builds it in
 * each pose and renders it flat with an ink line; handsheets.ts holds the
 * pictures).
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
 *           in front of the paper, and what is behind the paper is left out
 *           of the picture.
 *
 * Each pose has one point the room places it by (`anchor`): the pinch of finger
 * and thumb, or the pad of the thumb. The sheet is
 * three times as tall as it is wide: the forearm in its sleeve runs the whole
 * way down it, so that however far the hand reaches the arm goes off the
 * bottom of the picture and never ends in mid air.
 */
import { DoubleSide, Group, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Texture, TextureLoader, Vector3 } from "three";
import { HAND_SHEETS } from "./handsheets.js";

export type Pose = "pencil" | "pinch" | "thumb";

const S = 512;
const H = 1536;
/** Width of the sheet, in metres, at the distance the room holds it (the same as the hand with the die). */
export const SHEET = 0.28;

type Pt = [number, number];
/** The pencil's lean on the sheet as the room measures it (up is positive): the hand is turned until the real pencil lies along this. */
export const GRIP_LEAN = (-5 * Math.PI) / 180;
/** Where each pose is held by, on the sheet: where models/player_hand.py put the pinch of finger and thumb, and the pad of the thumb. */
const ANCHOR: Record<Pose, Pt> = { pencil: [202.4, 242.3], pinch: [202.4, 242.3], thumb: [250, 278] };

interface Layer {
  sheet: Mesh;
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
  /** The pictures this hand has needed so far. */
  private sheets = new Map<string, Texture>();

  /** @param mirror show it as a left hand */
  constructor(_reduced: boolean, private mirror = false) {
    for (const order of [DrawnHand.ORDER, DrawnHand.ORDER + 2]) {
      // Nothing in the room is nearer the eye than your hands, so they are simply drawn last.
      const mat = new MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false, side: DoubleSide });
      const sheet = new Mesh(new PlaneGeometry(SHEET, (SHEET * H) / S), mat);
      sheet.renderOrder = order;
      sheet.frustumCulled = false;
      // Not seen until it has its picture.
      sheet.visible = false;
      if (mirror) sheet.scale.x = -1;
      this.group.add(sheet);
      this.layers.push({ sheet, mat });
    }
    this.group.visible = false;
  }

  /** Where the pose's own point is, measured from the middle of the sheet, in metres. */
  anchor(out = new Vector3()): Vector3 {
    const [x, y] = ANCHOR[this.pose];
    return out.set((x / S - 0.5) * SHEET * (this.mirror ? -1 : 1), ((0.5 - y / H) * SHEET * H) / S, 0);
  }

  /** A picture from handsheets.ts, loaded the first time this hand needs it. */
  private picture(url: string): Texture {
    let tex = this.sheets.get(url);
    if (!tex) {
      tex = new TextureLoader().load(url);
      tex.colorSpace = SRGBColorSpace;
      tex.magFilter = LinearFilter;
      tex.minFilter = LinearMipmapLinearFilter;
      this.sheets.set(url, tex);
    }
    return tex;
  }

  /** @param brightness how lit the hand is, so it does not glow in a dark room */
  update(_t: number, brightness: number): void {
    if (!this.group.visible) return;
    // The hand that holds a page up is one picture: there is nothing of it in front of its own thumb.
    const maps = this.pose === "thumb" ? [this.picture(HAND_SHEETS.thumb), null] : [this.picture(HAND_SHEETS.back), this.picture(HAND_SHEETS.front)];
    this.layers.forEach((l, i) => {
      const map = maps[i] ?? null;
      l.sheet.visible = !!map;
      if (map && l.mat.map !== map) {
        if (!l.mat.map) l.mat.needsUpdate = true;
        l.mat.map = map;
      }
      l.mat.color.setScalar(brightness * 0.72);
    });
  }

  dispose(): void {
    for (const tex of this.sheets.values()) tex.dispose();
    for (const l of this.layers) l.mat.dispose();
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
  }
}
