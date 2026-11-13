/**
 * The cards on the table (docs/DESIGN.md, 1.7). They are the narrator's: it deals the road face down onto the map,
 * turns a stop's card when you get there, takes it away when you are past, lays two out when the road splits, and
 * deals what you gain to your side of the table, face up. You never play a card; you touch one to pick a road, or to
 * pick up one on your side and hold it up to read what is written on it.
 *
 * Every card moves in the narrator's fingers: the hand reaches it, closes, carries it, lets go. With motion reduced
 * the moves take no time.
 */
import { sound } from "./sound.js";
import { BoxGeometry, CanvasTexture, CylinderGeometry, Euler, Group, Mesh, MeshStandardMaterial, Quaternion, SRGBColorSpace, Vector3, type Material, type PerspectiveCamera } from "three";
import { cardKind, type CardFamily } from "../engine/cards.js";
import { cardBack, cardFace } from "./cardart.js";
import { ease, Held, type Reacher, type Step, type Tracks } from "./track.js";

/** Size of a card in the room, in metres: a little over two inches by three and a half. */
export const CARD_W = 0.052;
export const CARD_H = 0.086;
const CARD_T = 0.0011;
/** Cards on your side are a little larger, so their names can be read from your seat. */
const SIDE_SCALE = 1.3;

type Hands = Reacher & {
  close?(arm: number, on?: "pinch" | "grasp"): void;
  release?(arm: number): void;
  /** Shape a hand for shuffling ("cards_hold", "cards_riffle", "cards_square"), where the hands have such movements. */
  pose?(arm: number, clip: string, fade?: number, then?: string[]): boolean;
};

export interface CardHost {
  narrator: Hands;
  /** Your eyes: a card you pick up to read is held up in front of them. */
  camera: PerspectiveCamera;
  tracks: Tracks;
  /** Where a stop is on the map, in the room. */
  stop(id: string): Vector3 | undefined;
  /** The room's time, for the narrator's eyes. */
  now(): number;
  /** Turn your head toward a place for a while: until `settled`, and `hold` seconds more. */
  glance(eye: Vector3, look: Vector3, fov: number, settled: Promise<void>, hold?: number): void;
}

interface Pose {
  p: Vector3;
  q: Quaternion;
}

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const Q = (pitch: number, yaw: number, roll = 0) => new Quaternion().setFromEuler(new Euler(pitch, yaw, roll, "YXZ"));
/** Lying flat: face up (the picture's top away from you), or face down (turned over along its length). */
const UP = (yaw = 0) => Q(0, yaw, 0);
const DOWN = (yaw = 0) => Q(0, yaw, Math.PI);

/** The deck, in front of the narrator. */
const DECK = V(0.0, 0, -0.655);
const DECK_N = 14;
/** Shuffling: how far each half's middle lies from the deck's, end to end across the table, their inner ends overlapping. */
const RIFFLE_APART = CARD_H / 2 - 0.009;
/** How high the thumbs draw the inner ends of the halves before letting the cards go. */
const RIFFLE_ARCH = 0.026;
/** And how high the cards stand in the bridge that ends a shuffle: bowed up between the hands, to fall flat one on another. */
const BRIDGE_ARCH = 0.042;
/** Where the two cards of a fork are laid, in front of the narrator, for you to pick from. */
const FORK = [V(-0.075, 0.0012, -0.555), V(0.075, 0.0012, -0.555)];
/** Where the rival's card lies: on the narrator's side, by its left hand as you see it, between its die tray and the map. */
const RIVAL = V(-0.325, 0.0012, -0.543);
/** Your side: a short row in front of the map, between the counters and the pile of pages. */
const SIDE = V(0.005, 0.0012, 0.31);
const SIDE_STEP = 0.028;
/** How far in front of your eyes a card is held up to be read (nearer than your drawn hands, 0.42), and how much of the view's height it fills. */
const EYE_D = 0.3;
const EYE_FILL = 0.8;

export interface CardSpec {
  id: string;
  /** Its kind (cards.ts). */
  kind: string;
  /** A name written on its face. */
  name?: string;
  /** The title on its ribbon, when it is not its kind's own. */
  title?: string;
  /** What is written on it under the picture: what it is and what it does. */
  text?: string;
}

/**
 * One card of the deck while it is being shuffled. It lies with its inner end (its own +z) toward the other half,
 * and bends: the inner end is drawn up by a thumb, the rest held down on the table.
 */
class Leaf {
  readonly mesh: Mesh;
  private flat: Float32Array;
  private bent = 0;
  private bentFrom = 0;
  /** Which half it is in (0 the one on your left, 1 on your right), its place in that half from the bottom, and its place in the whole deck once the halves are riffled together. */
  half = 0;
  j = 0;
  k = 0;

  constructor(mats: Material[]) {
    const g = new BoxGeometry(CARD_W, CARD_T, CARD_H, 1, 1, 8);
    this.flat = Float32Array.from(g.attributes.position!.array);
    this.mesh = new Mesh(g, mats);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
  }

  /**
   * Raise the inner end by `lift`: the card curves up to it from where the fingers hold it down (`from`, 0 its outer
   * end and 1 its inner one), and draws back a little as it does.
   */
  bend(lift: number, from = 0.3): void {
    if (lift === this.bent && from === this.bentFrom) return;
    this.bent = lift;
    this.bentFrom = from;
    const pos = this.mesh.geometry.attributes.position!;
    const back = Math.min(0.012, (lift * lift) / (CARD_H * (1 - from)) * 0.9);
    for (let i = 0; i < pos.count; i++) {
      const z = this.flat[i * 3 + 2]!;
      const c = Math.max(0, z / CARD_H + 0.5 - from) / (1 - from);
      pos.setY(i, this.flat[i * 3 + 1]! + lift * c * c);
      pos.setZ(i, z - back * c * c);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

class Card {
  readonly mesh: Mesh;
  readonly family: CardFamily;
  faceUp = false;
  private textures: CanvasTexture[] = [];
  private mats: Material[] = [];

  constructor(readonly spec: CardSpec, edge: Material) {
    this.family = cardKind(spec.kind).family;
    const tex = (c: HTMLCanvasElement | OffscreenCanvas): CanvasTexture => {
      const t = new CanvasTexture(c as HTMLCanvasElement);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      this.textures.push(t);
      return t;
    };
    const face = tex(cardFace(spec.kind, spec.name, spec.text, spec.title));
    const back = tex(cardBack(this.family));
    // A card gives back a little of its own light, so it can be made out in a dark room.
    const m = (t: CanvasTexture): MeshStandardMaterial => {
      const mat = new MeshStandardMaterial({ map: t, roughness: 0.7, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.06 });
      this.mats.push(mat);
      return mat;
    };
    // The faces of a box: +x, -x, +y (the face), -y (the back), +z, -z.
    this.mesh = new Mesh(new BoxGeometry(CARD_W, CARD_T, CARD_H), [edge, edge, m(face), m(back), edge, edge]);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  set glow(k: number) {
    for (const m of this.mats) (m as MeshStandardMaterial).emissiveIntensity = 0.06 + k;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    for (const t of this.textures) t.dispose();
    for (const m of this.mats) m.dispose();
  }
}

export class TableCards {
  readonly group = new Group();
  /** While a fork is laid out: called with 0 (left) or 1 (right) when you touch one. */
  choosing: ((i: number) => void) | null = null;
  /** Which of the two laid-out cards the pointer is over, or -1. */
  hover = -1;

  private edge = new MeshStandardMaterial({ color: 0xd9ccaa, roughness: 0.8 });
  private deck: Mesh;
  private deckMats: Material[] = [];
  /** The deck's materials, face by face, for the half of it that is cut off in a shuffle. */
  private deckFaces: Material[] = [];
  /** Settled when the card of a fork has been picked. */
  private picked: Promise<void> = Promise.resolve();
  private pickedDone: () => void = () => {};
  private deckTex: CanvasTexture;
  /** The road's cards, by stop. */
  private road = new Map<string, Card>();
  /** Your side, in the order dealt. */
  private side: Card[] = [];
  private rivalCard: Card | null = null;
  private seals: Mesh[] = [];
  private sealGeo = new CylinderGeometry(0.0075, 0.0075, 0.003, 16);
  private sealMat = new MeshStandardMaterial({ color: 0x2a0d0b, roughness: 0.45, metalness: 0.1 });
  /** The two cards of a fork while they are laid out. */
  private fork: Card[] = [];
  /** True while the narrator's hand is at the deck, so the other waits its turn. */
  private atDeck = false;
  private hoverK = [0, 0];
  /** Which card on your side the pointer is over, or -1: it brightens, to show it can be picked up. */
  sideHover = -1;
  /** The card on your side held up to your eyes to be read, and whether it is on its way up or down. */
  private eyed: Card | null = null;
  private eyeBusy: Promise<void> = Promise.resolve();

  constructor(private h: CardHost) {
    const back = cardBack("place");
    this.deckTex = new CanvasTexture(back as HTMLCanvasElement);
    this.deckTex.colorSpace = SRGBColorSpace;
    const top = new MeshStandardMaterial({ map: this.deckTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: this.deckTex, emissiveIntensity: 0.05 });
    const sides = new MeshStandardMaterial({ color: 0xcfc2a0, roughness: 0.85 });
    this.deckMats.push(top, sides);
    this.deckFaces = [sides, sides, top, sides, sides, sides];
    this.deck = new Mesh(new BoxGeometry(CARD_W, CARD_T * DECK_N, CARD_H), this.deckFaces);
    this.deck.position.copy(DECK).setY((CARD_T * DECK_N) / 2);
    this.deck.rotation.y = 0.05;
    this.deck.castShadow = this.deck.receiveShadow = true;
    this.group.add(this.deck);
  }

  /** The top of the deck, where a card is taken from. */
  private deckTop(): Vector3 {
    return DECK.clone().setY(CARD_T * DECK_N + 0.001);
  }

  /** Where a stop's card lies: beyond the stop on the map, so the pieces stand at its near edge. */
  private onMap(id: string): Pose | null {
    const s = this.h.stop(id);
    if (!s) return null;
    return { p: s.clone().add(V(0, 0.0012, -CARD_H / 2 - 0.019)), q: DOWN((((id.length * 37) % 7) - 3) * 0.02) };
  }

  /* ----------------------------------- moves ---------------------------------- */

  /** @param arm the narrator's hand that has it, if one does: the card then goes where those fingers go (track.ts, Held). */
  private fly(obj: Mesh | Group, to: () => Pose, dur: number, lift = 0, also?: (u: number) => void, arm?: number, pat = true): Step {
    const p0 = V(0, 0, 0), q0 = new Quaternion();
    let dst: Pose;
    let landed = false;
    const held = arm === undefined ? null : new Held(this.h.narrator, arm, obj, () => this.h.tracks.now);
    return {
      dur,
      until: held ? () => held.there : undefined,
      patience: 0.9,
      begin: () => {
        p0.copy(obj.position);
        q0.copy(obj.quaternion);
        dst = to();
        landed = false;
        held?.take();
        sound.play("deal", { x: (p0.x + dst.p.x) / 2, gain: 0.6 + Math.min(0.6, p0.distanceTo(dst.p)) });
      },
      tick: (u) => {
        const e = ease(u);
        obj.position.lerpVectors(p0, dst.p, e);
        obj.position.y += Math.sin(Math.PI * u) * lift;
        obj.quaternion.slerpQuaternions(q0, dst.q, e);
        held?.follow();
        also?.(u);
        if (u >= 1 && !landed && (held?.there ?? true)) {
          landed = true;
          // Held up to be looked at is not laid down.
          if (pat && dst.p.y < 0.05) sound.play("pat", { x: dst.p.x });
        }
      },
    };
  }

  /** The narrator's hand goes to a card, takes it, carries it to a pose, and lets go. */
  private carry(card: Mesh | Group, arm: number, to: () => Pose, dur: number, lift: number, o: { from?: () => Vector3; turn?: boolean } = {}): Step[] {
    const n = this.h.narrator;
    const at = o.from ?? (() => card.position);
    return [
      { dur: 0.15, tick: () => n.reach(arm, at()), until: () => n.reached(arm) > 0.8 && n.fingertips(arm).distanceTo(at()) < 0.06, patience: 1.4 },
      { dur: 0.16, begin: () => n.close?.(arm, "pinch") },
      this.fly(card, to, dur, lift, undefined, arm),
      { dur: 0.14, begin: () => n.release?.(arm) },
    ];
  }

  /** Deal the road: every stop's card, face down on the map. Both hands deal, taking turns at the deck. */
  async deal(stops: { id: string; kind: string }[]): Promise<void> {
    const n = this.h.narrator;
    const queues: Step[][] = [[], []];
    // Which hands this deal has taken up. A hand that is still setting a piece down finishes that first: it does not
    // deal with a piece in it.
    const mine = [false, false];
    for (const s of stops) {
      const to = this.onMap(s.id);
      if (!to || this.road.has(s.id)) continue;
      const card = new Card({ id: s.id, kind: s.kind }, this.edge);
      this.road.set(s.id, card);
      const arm = n.armFor(to.p);
      card.mesh.visible = false;
      card.mesh.position.copy(this.deckTop());
      card.mesh.quaternion.copy(DOWN(this.deck.rotation.y));
      this.group.add(card.mesh);
      queues[arm]!.push(
        // Wait for the other hand to be clear of the deck, and for this one to be free.
        { dur: 0, until: () => !this.atDeck && (mine[arm]! || !n.busy?.(arm)), patience: 8 },
        {
          dur: 0,
          begin: () => {
            this.atDeck = true;
            mine[arm] = true;
          },
        },
        { dur: 0.12, tick: () => n.reach(arm, this.deckTop()), until: () => n.reached(arm) > 0.8 && n.fingertips(arm).distanceTo(this.deckTop()) < 0.06, patience: 1.4 },
        { dur: 0.14, begin: () => n.close?.(arm, "pinch") },
        {
          dur: 0,
          begin: () => {
            card.mesh.visible = true;
            card.mesh.position.copy(this.deckTop());
          },
        },
        this.fly(card.mesh, () => to, 0.5, 0.06, (u) => {
          if (u > 0.25) this.atDeck = false;
        }, arm),
        { dur: 0.1, begin: () => n.release?.(arm) },
      );
    }
    for (const [arm, q] of queues.entries()) if (q.length) q.push({ dur: 0, begin: () => n.reach(arm, null) });
    n.watch(DECK, 2, this.h.now());
    await Promise.all(queues.map((q) => this.h.tracks.run(q)));
  }

  /** Turn a stop's card face up where it lies, and look at it. */
  async turn(id: string): Promise<void> {
    const card = this.road.get(id);
    const at = this.onMap(id);
    if (!card || !at || card.faceUp) return;
    const n = this.h.narrator;
    const arm = n.armFor(at.p);
    const up: Pose = { p: at.p, q: UP(0) };
    // The hand lifts the card by its far edge, turns it over toward you, and lays it down.
    const done = this.h.tracks.run([
      ...this.carry(card.mesh, arm, () => up, 0.55, 0.07, { from: () => card.mesh.position.clone().add(V(0, 0, -CARD_H / 2)) }),
      { dur: 0, begin: () => n.reach(arm, null) },
    ]);
    card.faceUp = true;
    n.watch(at.p, 2.5, this.h.now());
    this.h.glance(V(at.p.x * 0.6, 0.46, at.p.z + 0.5), at.p.clone().add(V(0, 0, 0.01)), 26, done, 1.6);
    await done;
  }

  /** A stop is behind you: its card goes back under the deck. */
  async clear(id: string): Promise<void> {
    const card = this.road.get(id);
    if (!card) return;
    this.road.delete(id);
    const n = this.h.narrator;
    const arm = n.armFor(card.mesh.position);
    await this.h.tracks.run([
      ...this.carry(card.mesh, arm, () => ({ p: this.deckTop(), q: DOWN(this.deck.rotation.y) }), 0.6, 0.05),
      {
        dur: 0,
        begin: () => {
          this.group.remove(card.mesh);
          card.dispose();
          n.reach(arm, null);
        },
      },
    ]);
  }

  /**
   * The road splits: the narrator lifts the two cards from the map, one in each hand, holds them up to you, and lays
   * them side by side in front of it, face down, the first on your left. Resolves when they are down.
   */
  async lay(ids: string[]): Promise<void> {
    const n = this.h.narrator;
    const cards = ids.map((id) => this.road.get(id)).filter((c): c is Card => !!c).slice(0, 2);
    this.fork = cards;
    // The card on your left goes in the hand on your left.
    const runs = cards.map((card, i) => {
      const arm = i;
      const shown: Pose = { p: V(i ? 0.07 : -0.07, 0.24, -0.62), q: Q(Math.PI / 2 - 0.35, 0, Math.PI) };
      const down: Pose = { p: FORK[i]!.clone(), q: DOWN(i ? 0.06 : -0.06) };
      return this.h.tracks.run([
        ...this.carry(card.mesh, arm, () => shown, 0.7, 0.04).slice(0, 3),
        // Held up a moment for you to see the colour of its back.
        { dur: 0.9, tick: () => n.reach(arm, card.mesh.position) },
        this.fly(card.mesh, () => down, 0.55, 0.02, undefined, arm),
        { dur: 0.12, begin: () => n.release?.(arm) },
        { dur: 0, begin: () => n.reach(arm, null) },
      ]);
    });
    const down = Promise.all(runs).then(() => undefined);
    // You look at them until you have picked one.
    this.picked = new Promise<void>((r) => (this.pickedDone = r));
    this.h.glance(V(0, 0.42, 0.42), V(0, 0.16, -0.58), 30, this.picked, 0.2);
    await down;
  }

  /** The card you picked is pushed a little toward you, and both go back where they lay on the map. */
  async unlay(picked: number): Promise<void> {
    const n = this.h.narrator;
    const cards = this.fork;
    this.fork = [];
    this.choosing = null;
    this.hover = -1;
    this.pickedDone();
    const chosen = cards[picked];
    if (chosen) await this.h.tracks.run([this.fly(chosen.mesh, () => ({ p: chosen.mesh.position.clone().add(V(0, 0.004, 0.035)), q: chosen.mesh.quaternion.clone() }), 0.35, 0.01)]);
    await Promise.all(
      cards.map((card, i) => {
        const home = this.onMap(card.spec.id);
        if (!home) return Promise.resolve();
        return this.h.tracks.run([...this.carry(card.mesh, i, () => home, 0.55, 0.05), { dur: 0, begin: () => n.reach(i, null) }]);
      }),
    );
    for (const c of cards) c.glow = 0;
  }

  /**
   * Something to become (a level-up): the narrator deals two cards face up in front of it, the first on your left, one
   * hand after the other, and you look at them until you have picked one. Resolves when they are down.
   */
  async offer(specs: CardSpec[]): Promise<void> {
    const n = this.h.narrator;
    const cards = specs.slice(0, 2).map((s) => new Card(s, this.edge));
    this.fork = cards;
    const runs = cards.map((card, i) => {
      card.mesh.position.copy(this.deckTop());
      card.mesh.quaternion.copy(DOWN(this.deck.rotation.y));
      card.mesh.visible = false;
      this.group.add(card.mesh);
      const down: Pose = { p: FORK[i]!.clone(), q: UP(i ? -0.05 : 0.05) };
      return this.h.tracks.run([
        // One hand after the other, so they do not meet over the deck.
        { dur: i * 0.75 },
        { dur: 0.12, tick: () => n.reach(i, this.deckTop()), until: () => n.reached(i) > 0.8 && n.fingertips(i).distanceTo(this.deckTop()) < 0.06, patience: 1.4 },
        { dur: 0.14, begin: () => n.close?.(i, "pinch") },
        { dur: 0, begin: () => (card.mesh.visible = true) },
        // Turned face up in the air on the way down.
        this.fly(card.mesh, () => down, 0.6, 0.07, undefined, i),
        { dur: 0.1, begin: () => n.release?.(i) },
        { dur: 0, begin: () => n.reach(i, null) },
      ]);
    });
    this.picked = new Promise<void>((r) => (this.pickedDone = r));
    this.h.glance(V(0, 0.42, 0.42), V(0, 0.16, -0.58), 30, this.picked, 0.2);
    await Promise.all(runs);
    for (const c of cards) c.faceUp = true;
  }

  /** The card you picked slides over to your side and stays; the other goes back on the deck. */
  async unoffer(picked: number): Promise<void> {
    const n = this.h.narrator;
    const cards = this.fork;
    this.fork = [];
    this.choosing = null;
    this.hover = -1;
    this.pickedDone();
    const chosen = cards[picked];
    const other = cards[1 - picked];
    const jobs: Promise<unknown>[] = [];
    if (chosen) {
      const to = this.sideSlot(this.side.length);
      this.side.push(chosen);
      jobs.push(this.h.tracks.run([this.fly(chosen.mesh, () => to, 0.75, 0.03, (u) => chosen.mesh.scale.setScalar(1 + (SIDE_SCALE - 1) * ease(u)))]));
    }
    if (other) {
      const arm = 1 - picked;
      jobs.push(
        this.h.tracks.run([
          ...this.carry(other.mesh, arm, () => ({ p: this.deckTop(), q: DOWN(this.deck.rotation.y) }), 0.55, 0.06),
          {
            dur: 0,
            begin: () => {
              this.group.remove(other.mesh);
              other.dispose();
              n.reach(arm, null);
            },
          },
        ]),
      );
    }
    await Promise.all(jobs);
    for (const c of cards) c.glow = 0;
  }

  /** Where the i-th card on your side lies. */
  private sideSlot(i: number): Pose {
    return { p: SIDE.clone().add(V(i * SIDE_STEP, i * 0.0004, ((i * 7) % 3) * 0.003)), q: UP((((i * 5) % 5) - 2) * 0.04) };
  }

  /** Where each card on your side is, for the pointer. */
  sideAt(): Vector3[] {
    return this.side.filter((c) => c !== this.eyed).map((c) => c.mesh.getWorldPosition(new Vector3()));
  }

  /** True while a card is held up to your eyes. */
  get looking(): boolean {
    return !!this.eyed;
  }

  /** Which card on your side is held up to your eyes, or -1. */
  get lookingAt(): number {
    return this.eyed ? this.side.indexOf(this.eyed) : -1;
  }

  /** Where a card is held up to be read, in your eyes' own space: upright, as large as the view allows. */
  private eyePose(): { pose: Pose; scale: number } {
    const cam = this.h.camera;
    const half = Math.tan((cam.fov * Math.PI) / 360);
    const scale = Math.min((EYE_FILL * 2 * EYE_D * half) / CARD_H, (0.86 * 2 * EYE_D * half * cam.aspect) / CARD_W);
    // Face toward you, the top of its picture up, leaning back a little.
    return { pose: { p: V(0, -0.004, -EYE_D), q: Q(Math.PI / 2 - 0.06, 0, 0) }, scale };
  }

  /**
   * Pick up the i-th card on your side and hold it up to your eyes, large enough to read what is written on it; with
   * another card up, that one goes back first. Asking for the one already up leaves it there.
   */
  look(i: number): Promise<void> {
    this.eyeBusy = this.eyeBusy.then(async () => {
      const card = this.side[Math.max(0, Math.min(this.side.length - 1, i))];
      if (!card) return;
      if (this.eyed === card) return;
      if (this.eyed) await this.down();
      this.eyed = card;
      this.sideHover = -1;
      const s0 = card.mesh.scale.x;
      this.h.camera.attach(card.mesh);
      const { pose, scale } = this.eyePose();
      await this.h.tracks.run([this.fly(card.mesh, () => pose, 0.45, 0, (u) => card.mesh.scale.setScalar(s0 + (scale - s0) * ease(u)), undefined, false)]);
    });
    return this.eyeBusy;
  }

  /** Put the card held up to your eyes back where it lay on your side. */
  unlook(): Promise<void> {
    if (!this.eyed) return this.eyeBusy;
    this.eyeBusy = this.eyeBusy.then(() => this.down());
    return this.eyeBusy;
  }

  private async down(): Promise<void> {
    const card = this.eyed;
    if (!card) return;
    this.eyed = null;
    const i = this.side.indexOf(card);
    this.group.attach(card.mesh);
    const s0 = card.mesh.scale.x;
    const to = i >= 0 ? this.sideSlot(i) : { p: this.deckTop(), q: DOWN(this.deck.rotation.y) };
    await this.h.tracks.run([this.fly(card.mesh, () => to, 0.4, 0.02, (u) => card.mesh.scale.setScalar(s0 + (SIDE_SCALE - s0) * ease(u)))]);
  }

  /** Where a laid-out card is, for the pointer. */
  laid(i: number): Vector3 | null {
    return this.fork[i]?.mesh.position ?? null;
  }

  /** A card dealt face up to your side (or, for a rival, to the narrator's side). */
  async give(spec: CardSpec, rival = false): Promise<void> {
    const n = this.h.narrator;
    const card = new Card(spec, this.edge);
    const i = this.side.length;
    const to: Pose = rival ? { p: RIVAL.clone(), q: UP(0.12) } : this.sideSlot(i);
    if (rival) this.rivalCard = card;
    else this.side.push(card);
    card.mesh.position.copy(this.deckTop());
    card.mesh.quaternion.copy(DOWN(this.deck.rotation.y));
    card.mesh.visible = false;
    this.group.add(card.mesh);
    const arm = rival ? 0 : 1;
    // Far across the table, the narrator's hand lets go over your side and the card slides the rest of the way.
    const handTo: Pose = rival ? to : { p: V(to.p.x * 0.6, 0.0012, -0.08), q: UP(to.q.y) };
    await this.h.tracks.run([
      { dur: 0.12, tick: () => n.reach(arm, this.deckTop()), until: () => n.reached(arm) > 0.8 && n.fingertips(arm).distanceTo(this.deckTop()) < 0.06, patience: 1.4 },
      { dur: 0.14, begin: () => n.close?.(arm, "pinch") },
      { dur: 0, begin: () => (card.mesh.visible = true) },
      // Turned face up in the air.
      this.fly(card.mesh, () => handTo, 0.6, 0.08, () => n.reach(arm, card.mesh.position)),
      { dur: 0.1, begin: () => n.release?.(arm) },
      { dur: 0, begin: () => n.reach(arm, null) },
      ...(rival ? [] : [this.fly(card.mesh, () => to, 0.45, 0.004, (u) => card.mesh.scale.setScalar(1 + (SIDE_SCALE - 1) * ease(u)))]),
    ]);
    card.faceUp = true;
  }

  /** A card on your side goes back to the narrator. */
  async take(id: string): Promise<void> {
    await this.unlook();
    const i = this.side.findIndex((c) => c.spec.id === id);
    if (i < 0) return;
    const card = this.side[i]!;
    this.side.splice(i, 1);
    const n = this.h.narrator;
    const arm = 1;
    const reachAt: Pose = { p: V(card.mesh.position.x * 0.6, 0.0012, -0.08), q: card.mesh.quaternion.clone() };
    await this.h.tracks.run([
      // It is drawn back across the table to where the narrator can reach it.
      this.fly(card.mesh, () => reachAt, 0.5, 0.004),
      ...this.carry(card.mesh, arm, () => ({ p: this.deckTop(), q: DOWN(this.deck.rotation.y) }), 0.55, 0.06),
      {
        dur: 0,
        begin: () => {
          this.group.remove(card.mesh);
          card.dispose();
          n.reach(arm, null);
        },
      },
    ]);
    // The rest close up.
    await this.h.tracks.run([
      {
        dur: 0.4,
        tick: (u) =>
          this.side.forEach((c, j) => {
            const x = SIDE.x + j * SIDE_STEP;
            c.mesh.position.x += (x - c.mesh.position.x) * ease(u);
          }),
      },
    ]);
  }

  /** The rival's dark seals: one more is pressed onto its card, up to `n`. */
  async rival(count: number, max: number): Promise<void> {
    const card = this.rivalCard;
    if (!card) return;
    const nar = this.h.narrator;
    const at = (i: number): Vector3 => {
      const along = max > 1 ? (i / (max - 1) - 0.5) * (CARD_H * 0.62) : 0;
      return card.mesh.localToWorld(V(CARD_W * 0.3, CARD_T / 2 + 0.0016, along)).clone();
    };
    while (this.seals.length < count) {
      const i = this.seals.length;
      const seal = new Mesh(this.sealGeo, this.sealMat);
      seal.castShadow = true;
      const spot = at(i);
      seal.position.copy(spot).add(V(0, 0.05, 0));
      seal.visible = false;
      this.group.add(seal);
      this.seals.push(seal);
      await this.h.tracks.run([
        { dur: 0.2, tick: () => nar.reach(0, spot.clone().add(V(0, 0.05, 0))), until: () => nar.reached(0) > 0.8, patience: 1.2 },
        { dur: 0, begin: () => (seal.visible = true) },
        this.fly(seal, () => ({ p: spot, q: new Quaternion() }), 0.22, 0, () => nar.reach(0, seal.position.clone().add(V(0, 0.01, 0)))),
        { dur: 0.25, tick: (u) => nar.reach(0, spot.clone().add(V(0, 0.004 + Math.sin(Math.PI * u) * 0.004, 0))) },
        { dur: 0, begin: () => nar.reach(0, null) },
      ]);
    }
  }

  /**
   * A story is over: the narrator gathers every card on the table back into the deck, the map's, yours and the rival's
   * with its seals, one after another, so the table is bare for the next story.
   */
  async sweep(): Promise<void> {
    await this.unlook();
    const cards = [...this.road.values(), ...this.side, ...(this.rivalCard ? [this.rivalCard] : [])];
    const seals = this.seals;
    this.road.clear();
    this.side = [];
    this.rivalCard = null;
    this.seals = [];
    const n = this.h.narrator;
    // The seals come off first, into the narrator's hand.
    for (const s of seals) this.group.remove(s);
    await Promise.all(
      cards.map((card, i) =>
        this.h.tracks.run([
          { dur: i * 0.12 },
          { dur: 0, begin: () => n.reach(i % 2, card.mesh.position) },
          this.fly(card.mesh, () => ({ p: this.deckTop(), q: DOWN(this.deck.rotation.y) }), 0.55, 0.05, () => n.reach(i % 2, card.mesh.position)),
          {
            dur: 0,
            begin: () => {
              this.group.remove(card.mesh);
              card.dispose();
              if (i >= cards.length - 2) n.reach(i % 2, null);
            },
          },
        ]),
      ),
    );
    n.reach(0, null);
    n.reach(1, null);
  }

  /**
   * While something is being worked out before the road can be dealt: the narrator shuffles the deck, for as long as
   * it takes. It turns the deck across the table, cuts it, sets the halves end to end, draws their inner ends up
   * under its thumbs and lets the cards fall into each other, one from each half in turn; then pushes the halves
   * together and squares them. A riffle always finishes before it stops.
   */
  async shuffle(until: Promise<unknown>): Promise<void> {
    let done = false;
    void until.then(
      () => (done = true),
      () => (done = true),
    );
    await Promise.resolve();
    if (done) return;
    const n = this.h.narrator;
    const run = (steps: Step[]): Promise<void> => this.h.tracks.run(steps);
    const HALF = DECK_N / 2;
    const ACROSS = Math.PI / 2;
    const leaves = Array.from({ length: DECK_N }, () => new Leaf(this.deckFaces));
    // The two halves: 0 on your left, 1 on your right (the narrator's hands are numbered the same way).
    const halves = [new Group(), new Group()];
    for (const g of halves) {
      g.visible = false;
      this.group.add(g);
    }
    /** Lay the cards as they lie in the squared deck: the lower half, and the upper half resting on it, ready to be cut off. */
    const stack = (): void => {
      leaves.forEach((l, i) => {
        l.half = i < HALF ? 0 : 1;
        l.j = i % HALF;
        l.k = 2 * l.j + l.half;
        halves[l.half]!.add(l.mesh);
        l.mesh.position.set(0, CARD_T * (l.j + 0.5), 0);
        l.mesh.rotation.set(0, l.half ? -ACROSS : ACROSS, 0);
        l.bend(0);
      });
      halves[0]!.position.copy(DECK).setY(0);
      halves[1]!.position.copy(DECK).setY(CARD_T * HALF);
      for (const g of halves) g.rotation.set(0, 0, 0);
    };
    const sign = (h: number): number => (h ? 1 : -1);
    /** Where a hand is sent to hold its half: it stands on the half's outer end, and leaves the inner end in the open. */
    const hold = (h: number): Vector3 => V(DECK.x + sign(h) * Math.max(0.075, Math.abs(halves[h]!.position.x - DECK.x) + 0.058), 0.024, DECK.z - 0.03);
    const both = (at: (h: number) => Vector3): void => (n.reach(0, at(0)), n.reach(1, at(1)));
    const there = (): boolean => n.reached(0) > 0.8 && n.reached(1) > 0.8;
    /** How high a card's inner end is drawn: the upper cards a little more, so the half fans open under the thumb. */
    const arch = (l: Leaf): number => RIFFLE_ARCH + l.j * 0.0009;
    /** How high its inner end rests once it has fallen between the other half's cards. */
    const rest = (l: Leaf): number => CARD_T * (l.k - l.j);
    const over = (h: number): Vector3 => DECK.clone().add(V(sign(h) * 0.062, 0.03, -0.03));

    n.watch(DECK, 3, this.h.now());
    try {
      // Both hands to the deck, and turn it across the table.
      await run([
        { dur: 0.2, tick: () => both(over), until: there, patience: 1.4 },
        {
          dur: 0.34,
          begin: () => sound.play("slide", { x: DECK.x, gain: 0.5 }),
          tick: (u) => {
            this.deck.rotation.y = 0.05 + (ACROSS - 0.05) * ease(u);
            both(over);
          },
        },
        {
          dur: 0,
          begin: () => {
            stack();
            this.deck.visible = false;
            for (const g of halves) g.visible = true;
          },
        },
      ]);
      while (!done) {
        const L = halves[0]!, R = halves[1]!;
        // The cut: one hand lifts the upper half off and sets it down beyond the end of the lower, which the other draws aside.
        await Promise.all([
          run(this.carry(R, 1, () => ({ p: DECK.clone().add(V(RIFFLE_APART, 0, 0)), q: UP(-0.035) }), 0.4, 0.03, { from: () => R.position.clone().add(V(0.014, 0.004, 0)) })),
          run([
            { dur: 0.15, tick: () => n.reach(0, hold(0)), until: () => n.reached(0) > 0.8, patience: 1.4 },
            { dur: 0.22 },
            {
              dur: 0.32,
              tick: (u) => {
                L.position.x = DECK.x - RIFFLE_APART * ease(u);
                L.rotation.y = 0.035 * ease(u);
                n.reach(0, hold(0));
              },
            },
          ]),
        ]);
        /** The halves that far apart (1 as they were cut, 0 one deck), every card that far up to its place in the riffled deck. */
        const close = (apart: number, risen: number): void => {
          L.position.x = DECK.x - RIFFLE_APART * apart;
          R.position.x = DECK.x + RIFFLE_APART * apart;
          L.rotation.y = 0.035 * apart;
          R.rotation.y = -0.035 * apart;
          for (const l of leaves) l.mesh.position.y = CARD_T * (l.j + (l.k - l.j) * risen + 0.5);
        };
        /** How far a card has fallen, the cards going from the bottom up over the length of a step. */
        const fallen = (l: Leaf, u: number): number => {
          const f = Math.max(0, Math.min(1, (u - (l.k / DECK_N) * 0.86) / 0.12));
          return f * f;
        };
        await run([
          // Both hands take hold of the outer ends: fingers down the far edge, thumbs behind.
          { dur: 0.3, begin: () => (n.pose?.(0, "cards_hold"), n.pose?.(1, "cards_hold")), tick: () => both(hold), until: there, patience: 1 },
          // The inner ends are drawn up, facing each other.
          {
            dur: 0.26,
            begin: () => (n.pose?.(0, "cards_riffle", 0.1), n.pose?.(1, "cards_riffle", 0.1)),
            tick: (u) => {
              for (const l of leaves) l.bend(arch(l) * ease(u));
              both(hold);
            },
          },
          // And let go from the bottom, one card from each half in turn: each falls flat onto the last.
          {
            dur: 0.6,
            begin: () => sound.play("riffle", { x: DECK.x }),
            tick: (u) => {
              for (const l of leaves) l.bend(arch(l) + (rest(l) - arch(l)) * fallen(l, u));
              both(hold);
            },
          },
          // The bridge: the hands press the ends in, and the woven cards bow up between them.
          {
            dur: 0.34,
            begin: () => (n.pose?.(0, "cards_riffle", 0.12), n.pose?.(1, "cards_riffle", 0.12)),
            tick: (u) => {
              const e = ease(u);
              close(1 - 0.3 * e, 0);
              for (const l of leaves) l.bend(rest(l) + (BRIDGE_ARCH + l.k * 0.0006 - rest(l)) * e, 0.3 - 0.16 * e);
              both(hold);
            },
          },
          // It comes down from the bottom, the cards running into each other, and the halves are one deck.
          {
            dur: 0.62,
            begin: () => sound.play("riffle", { x: DECK.x, gain: 0.7 }),
            tick: (u) => {
              const e = ease(u);
              close(0.7 * (1 - e), e);
              for (const l of leaves) {
                const high = BRIDGE_ARCH + l.k * 0.0006;
                l.bend(high + (rest(l) * (1 - e) - high) * fallen(l, u), 0.14);
              }
              both(hold);
            },
          },
          // Squared: tapped once, and it is one deck again, in its new order.
          {
            dur: 0.22,
            begin: () => {
              sound.play("pat", { x: DECK.x });
              leaves.sort((x, y) => x.k - y.k);
              stack();
            },
            tick: () => both(hold),
          },
        ]);
      }
      // Turned back the way it lay.
      for (const g of halves) g.visible = false;
      this.deck.visible = true;
      await run([
        { dur: 0.16, begin: () => (n.pose?.(0, "release", 0.2, ["reach"]), n.pose?.(1, "release", 0.2, ["reach"])), tick: () => both(over) },
        {
          dur: 0.34,
          begin: () => sound.play("slide", { x: DECK.x, gain: 0.5 }),
          tick: (u) => {
            this.deck.rotation.y = ACROSS + (0.05 - ACROSS) * ease(u);
            both(over);
          },
        },
      ]);
    } finally {
      this.deck.visible = true;
      this.deck.rotation.set(0, 0.05, 0);
      n.reach(0, null);
      n.reach(1, null);
      for (const g of halves) this.group.remove(g);
      for (const l of leaves) l.mesh.geometry.dispose();
    }
  }

  update(dt: number, reduced: boolean): void {
    // A card on your side under the pointer brightens; the one held up to be read is lit to be read.
    this.side.forEach((c, i) => (c.glow = c === this.eyed ? 0.5 : i === this.sideHover ? 0.22 : 0));
    // The laid-out card under the pointer lifts a little and brightens.
    this.fork.forEach((c, i) => {
      const want = this.choosing && this.hover === i ? 1 : 0;
      const k = reduced ? want : this.hoverK[i]! + (want - this.hoverK[i]!) * Math.min(1, dt * 10);
      const was = this.hoverK[i]!;
      this.hoverK[i] = k;
      if (Math.abs(k - was) > 1e-4 || k > 0) {
        c.mesh.position.y = FORK[i]!.y + k * 0.008;
        c.glow = k * 0.25;
      }
    });
  }

  dispose(): void {
    for (const c of [...this.road.values(), ...this.side, ...(this.rivalCard ? [this.rivalCard] : [])]) c.dispose();
    this.deck.geometry.dispose();
    this.deckTex.dispose();
    for (const m of this.deckMats) m.dispose();
    this.edge.dispose();
    this.sealGeo.dispose();
    this.sealMat.dispose();
  }
}
