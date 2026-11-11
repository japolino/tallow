/**
 * Your own hand: flat, in the same manner as the narrator's eyes, pale
 * shapes with dark ink lines. It comes up from the lower right holding the
 * die; the room moves it with the pointer and lets go on a click.
 *
 * It is a right hand seen by its owner, palm up and cupped: a dark sleeve in
 * the corner, the wrist coming out of it, the palm, four fingers standing up
 * from the palm's far edge and curling back over the die, and the thumb
 * closing on it from the right. While the hand is closed the ends of the
 * fingers show their nails, as your own do when you look down at something
 * held in your palm.
 *
 * It is a picture of a real 3D hand (models/player_hand.py builds it and
 * renders it flat with an ink line; handsheets.ts holds the pictures), once
 * for each stage of letting go. Each stage is two sheets: the palm behind the
 * die, and the ends of the fingers and thumb in front of it, so the die
 * really sits in the hand.
 */
import { Group, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Texture, TextureLoader } from "three";
import { DIE_OPEN, HAND_SHEETS } from "./handsheets.js";

const S = 512;
/** Width and height of the sheet in the room, in metres, at the distance the room holds it. */
export const HAND_SIZE = 0.28;
/** The hollow of the palm on the sheet, where the die lies (models/player_hand.py puts the die there). */
const HOLLOW = { x: 250, y: 300 };

interface Layer {
  sheet: Mesh;
  mat: MeshBasicMaterial;
}

export class PlayerHand {
  /** Hang this on the camera. */
  readonly group = new Group();
  /** The hollow of the palm, where the die lies. */
  readonly palm = new Group();
  private back: Layer;
  private front: Layer;
  /** The pictures of each stage, once the hand has been needed. */
  private sheets: { back: Texture; front: Texture }[] | null = null;
  private stage = -1;
  private shown = 0;
  private lastT = 0;
  /** 0 is cupped round the die; 1 is flung open, letting go. */
  open = 0;
  /** 0..1: how hard the hand is being shaken. The fingers ease off the die a little so it can rattle. */
  loose = 0;

  constructor(private reduced: boolean) {
    const layer = (order: number): Layer => {
      // Nothing in the room is nearer the eye than the hand, so it is simply drawn last, in order: palm, die, fingers.
      const mat = new MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false });
      const sheet = new Mesh(new PlaneGeometry(HAND_SIZE, HAND_SIZE), mat);
      sheet.renderOrder = order;
      sheet.frustumCulled = false;
      // Not seen until it has its picture.
      sheet.visible = false;
      this.group.add(sheet);
      return { sheet, mat };
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

    if (!this.sheets) {
      const loader = new TextureLoader();
      const load = (url: string) => {
        const tex = loader.load(url);
        tex.colorSpace = SRGBColorSpace;
        tex.magFilter = LinearFilter;
        tex.minFilter = LinearMipmapLinearFilter;
        return tex;
      };
      this.sheets = HAND_SHEETS.die.map((d) => ({ back: load(d.back), front: load(d.front) }));
    }
    // The picture nearest to how far open the hand is.
    let stage = 0;
    for (let i = 1; i < DIE_OPEN.length; i++) if (Math.abs(DIE_OPEN[i]! - this.shown) < Math.abs(DIE_OPEN[stage]! - this.shown)) stage = i;
    if (stage !== this.stage) {
      this.stage = stage;
      const s = this.sheets[stage]!;
      for (const [l, map] of [[this.back, s.back], [this.front, s.front]] as const) {
        if (!l.mat.map) l.mat.needsUpdate = true;
        l.mat.map = map;
        l.sheet.visible = true;
      }
    }
    this.back.mat.color.setScalar(brightness * 0.72);
    this.front.mat.color.setScalar(brightness * 0.72);
  }

  dispose(): void {
    for (const s of this.sheets ?? []) {
      s.back.dispose();
      s.front.dispose();
    }
    for (const l of [this.back, this.front]) l.mat.dispose();
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
  }
}
