/**
 * Your side of the table, with nothing on the screen but the room.
 *
 * A notebook lies by your left hand. Open it (click it, or just start
 * typing) and you lean in over it; your hand takes up the pencil and writes
 * what you type. The hand is drawn; the pencil is a real thing on the table.
 * Enter tears the page off and holds it out, and the narrator takes it. When
 * the narrator has dealt with your turn it writes under your line and hands
 * the page back; you hold it up to read, and setting it down adds it to the
 * pile by your right hand, which you can pick up again and leaf through.
 *
 * What the narrator says is its voice (voice.ts). What you carry and how a
 * check stands are counters and a balance (counters.ts). The keys really go
 * into a text field nobody sees, so phones, dictation and screen readers
 * work as they do anywhere else.
 */
import { sound } from "./sound.js";
import { BoxGeometry, CylinderGeometry, Euler, Group, Mesh, MeshStandardMaterial, Quaternion, TorusGeometry, Vector3, type Material, type Object3D, type PerspectiveCamera, type Scene } from "three";
import { Counters } from "./counters.js";
import { DreadBowl } from "./dread.js";
import { HandDice } from "./handdice.js";
import { LuckTray } from "./luck.js";
import { Roster } from "./roster.js";
import { DrawnHand, GRIP_LEAN, THUMB_REACH, THUMB_TURN } from "./drawnhands.js";
import { Page, PAGE_FOOT, PAGE_H, PAGE_W, type PageWriting } from "./paper.js";
import { TableCards } from "./tablecards.js";
import { ease, Held, Tracks, type Reacher, type Step } from "./track.js";
import { Voice } from "./voice.js";

/** The narrator's hands as the desk uses them: reaching, and (where the hands can) closing on a thing and letting go. */
export type Hands = Reacher & {
  close?(arm: number, on?: "pinch" | "grasp"): void;
  release?(arm: number): void;
  /** One of the small things it does with its hands while it thinks (narrator.ts). False if its hands are busy. */
  gesture?(name: "drum" | "tap" | "steeple"): boolean;
};

export interface DeskHost {
  scene: Scene;
  camera: PerspectiveCamera;
  /** The element the room is drawn in: the voice and the unseen text field go in it. */
  host: HTMLElement;
  narrator: Hands;
  reduced: boolean;
  /** Sit back from the map (the notebook is not read from over the map). */
  /** Where the dice box stands. */
  box: Vector3;
  sitBack(): void;
  /** Where each stop is on the map, in the room, for the cards laid on it. */
  stops?: ReadonlyMap<string, Vector3>;
}

/** What you are doing with your hands. */
export type DeskMode = "idle" | "writing" | "busy" | "holding" | "reading";

interface Pose {
  p: Vector3;
  q: Quaternion;
}

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const pose = (x: number, y: number, z: number, pitch = 0, yaw = 0): Pose => ({ p: V(x, y, z), q: new Quaternion().setFromEuler(new Euler(pitch, yaw, 0, "YXZ")) });

/** The notebook: the middle of its ringed edge, which is the far one. The pad runs from there toward you. */
const BOOK = V(-0.47, 0, 0.27);
const BOOK_YAW = 0.1;
/** Where the top sheet lies, in the notebook's own space. */
const SHEET = V(0, 0.0115, 0.003);
/** How you look at the notebook while you write. */
const WRITE_EYE = BOOK.clone().add(V(0.05, 0.43, 0.36));
const WRITE_LOOK = BOOK.clone().add(V(0, 0, 0.1));
/** Held out over the table for the narrator to take: by its top edge, its face turned up toward you. */
const OFFERED = pose(-0.2, 0.2, 0.12, 0.9, 0.1);
/** How the narrator's page is turned, for it to read. */
const HIS_YAW = Math.PI + 0.05;
/**
 * Lying in front of the narrator: on the bare wood beyond the map, between the candles and its die tray, where
 * nothing else on the table is ever put (a page lying through a tray or a block looks wrong at once).
 */
const HIS = pose(-0.495, 0.006, -0.5, 0, HIS_YAW);
/**
 * The pages the narrator has done with lie in a loose heap under that one: how high the lowest lies, how much
 * higher each lies than the one before, and how many are kept (the oldest is taken from underneath).
 */
const HEAP_Y = 0.0012, HEAP_STEP = 0.0007, HEAP_MAX = 6;
/** How far each page of the heap is turned from the one on top, in turn: enough to show, never as far as the tray or the candles. */
const HEAP_SKEW = [0.12, -0.08, 0.1, -0.12, 0.07];
/** Held out to you by the narrator. */
const RETURNED = pose(-0.12, 0.2, 0.22, 0.9, 0);
/** Held up to the candlelight by the narrator while it reads your line: upright, its face turned to it. */
const READ: Pose = { p: V(-0.3, 0.37, -0.8), q: new Quaternion().setFromEuler(new Euler(-Math.PI / 2 + 0.35, Math.PI + 0.25, 0, "XYZ")) };
/** Where the narrator looks when a thing takes it long to think over: out of the window on your left. */
const WINDOW = V(-2.3, 0.95, -0.35);
/** The pile of pages you have read, by your right hand. */
const PILE = V(0.2, 0.004, 0.225);
/** Your sheets (who you are, what you can do, who walks with you, what you carry): a second stack, by your left hand. */
const SHEAF = V(-0.175, 0.004, 0.215);
const SHEAF_YAW = -0.13;
/** How many pages of a stack in your hands can be seen behind the one in front. */
const DEEP = 5;
/** The order the page in front of a stack in your hands is drawn in (paper.ts, inFront); those behind it come before. */
const HELD_ORDER = 18;
/** How far, as a share of its width, a page is drawn aside when it is put to the back of the stack or brought from there. */
const ASIDE = 0.66;
/** How far in front of the eye your drawn hands hang (the same as the hand with the die). */
const HAND_D = 0.42;
/**
 * How large your right hand is drawn: this over how far from your eye the thing it holds is, so that it is the size
 * of a hand beside the notebook, and smaller when it reaches out across the table.
 */
const PEN_SIZE = 0.32;
/** Where on a page in your hands the pad of each thumb lies: this far in from its side, and this far up from its foot. */
const THUMB_IN = 0.01;
const THUMB_UP = 0.006;
/**
 * How much of its own light a page gives while it lies on the narrator's side of the table: next to none. It is too
 * far off to be read there, and anything more makes it stand out white in a room lit by one candle.
 */
const AWAY = 0.02;
const MOST = 400;

export class Desk {
  readonly group = new Group();
  readonly counters: Counters;
  /** The narrator's bowl of dread, a black stone for every try that went wrong (dread.ts). */
  readonly dread: DreadBowl;
  /** The narrator's own die, in its tray (luck.ts). */
  readonly luck: LuckTray;
  /** Your hand of dice, lying on the map to be spent (handdice.ts). */
  readonly dice: HandDice;
  /** The paper of who you may be, your personas with a box each (roster.ts). */
  readonly roster: Roster;
  readonly voice: Voice;
  readonly tracks: Tracks;
  /** Where the view should go (`k` of the way) while you write. The room blends it in. */
  readonly focus = { eye: WRITE_EYE.clone(), look: WRITE_LOOK.clone(), fov: 30, k: 0 };
  /**
   * Where the view goes (`k` of the way) while a check is being weighed: a turn of the head toward the balance,
   * near enough to count the weights and read the tilt. The room blends it in, under the writing view.
   */
  readonly glance = { eye: V(-0.3, 0.34, 0.58), look: V(-0.64, 0.12, -0.2), fov: 32, k: 0 };
  /** The cards: the road dealt on the map, a fork laid out, and what is dealt to your side. */
  readonly cards: TableCards;
  private glanceFov = 32;
  /** Called when you reach for the dice box (set by the game while a throw is wanted). */
  onDie: (() => void) | null = null;
  mode: DeskMode = "idle";

  private mats: Material[] = [];
  private book = new Group();
  private cover = new Group();
  /** The pencil: a real thing, lying on the notebook or held with its point on the page. Its own origin is its point. */
  private pencil = new Group();
  private pencilMats: MeshStandardMaterial[] = [];
  private restAt = V(0, 0, 0);
  private restQ = new Quaternion();
  /** How it leans in the hand: back over the web of the thumb, toward your right shoulder. */
  private holdQ = new Quaternion().setFromUnitVectors(V(0, 1, 0), V(0.6, 0.66, 0.45).normalize());
  private inkWant = false;
  private inkK = 0;
  private tipAt = V(0, 0, 0);
  private gripAt = V(0, 0, 0);
  private tmp2 = V(0, 0, 0);
  private tmp3 = V(0, 0, 0);
  private coverK = 0;
  private focusWant = 0;
  private glanceWant = 0;
  /** When the glance at the balance ends, in the room's time; and which glance that is, so an old one cannot end a new one. */
  private glanceEnd = Infinity;
  private glanceTurn = 0;
  private now = 0;
  /** The page on the pad, the page the narrator has, the page in your hands, and the pile. */
  private sheet: Page | null = null;
  private his: Page | null = null;
  private held: Page | null = null;
  private pile: Page[] = [];
  /** Your sheets, the first on top. */
  private sheaf: Page[] = [];
  /** Your sheets as they now stand, waiting for the stack to be out of your hands to be written out. */
  private sheetsWant: { heading: string; his: string[] }[] | null = null;
  /** The stack up in your hands (the pile or your sheets), and its pages there in order: the one in front first. */
  private upStack: Page[] | null = null;
  private hand: Page[] = [];
  /** Where your right thumb is while it draws a page aside, instead of on the corner of the page in front. */
  private rightAt: Vector3 | null = null;
  /** The pages the narrator has done with, lowest first, and how many it has ever put there. */
  private heap: Page[] = [];
  private shoved = 0;
  /** Pages that have left the pad and are giving up the light they had while you wrote on them. */
  private dimming: Page[] = [];
  private readAt = -1;
  private made = 0;

  private pen: DrawnHand;
  private thumbs: [DrawnHand, DrawnHand];
  /** What the pencil hand is following, and how far it has come up into view. */
  private penOn: (() => Vector3) | null = null;
  private penK = 0;
  private penAt = V(0, 0, 0);
  private thumbK = 0;
  private scribble = 0;

  private field: HTMLTextAreaElement;
  private read: HTMLDivElement;
  private wanted: ((got: { line: string; given: Promise<void> }) => void) | null = null;
  private downs: (() => void)[] = [];
  private t = 0;
  private tmp = V(0, 0, 0);

  constructor(private h: DeskHost) {
    this.tracks = new Tracks(h.reduced);
    this.counters = new Counters(h.narrator, this.tracks, h.reduced);
    this.voice = new Voice(h.host, h.reduced);
    this.group.add(this.counters.group);
    this.dread = new DreadBowl(h.narrator, this.tracks, h.reduced);
    this.group.add(this.dread.group);
    this.luck = new LuckTray(h.narrator, this.tracks, h.reduced);
    this.group.add(this.luck.group);
    this.dice = new HandDice(this.tracks, h.reduced);
    this.group.add(this.dice.group);
    this.roster = new Roster(h.narrator, this.tracks, h.reduced, h.camera);
    this.group.add(this.roster.group);
    this.cards = new TableCards({
      narrator: h.narrator,
      tracks: this.tracks,
      camera: h.camera,
      stop: (id) => h.stops?.get(id),
      now: () => this.t,
      glance: (eye, look, fov, settled, hold) => this.lookAt(eye, look, fov, settled, hold),
    });
    this.group.add(this.cards.group);

    const mat = <T extends Material>(m: T): T => {
      this.mats.push(m);
      return m;
    };
    const board = mat(new MeshStandardMaterial({ color: 0x2a211a, roughness: 0.85 }));
    const paper = mat(new MeshStandardMaterial({ color: 0xd8cdb0, roughness: 0.95, emissive: 0xd8cdb0, emissiveIntensity: 0.03 }));
    const hide = mat(new MeshStandardMaterial({ color: 0x8c5a32, roughness: 0.6, emissive: 0x8c5a32, emissiveIntensity: 0.07 }));
    const wire = mat(new MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.35, metalness: 0.9 }));
    const back = new Mesh(new BoxGeometry(PAGE_W + 0.012, 0.004, PAGE_H + 0.012), board);
    back.position.set(0, 0.002, PAGE_H / 2 + 0.002);
    const pad = new Mesh(new BoxGeometry(PAGE_W, 0.007, PAGE_H), paper);
    pad.position.set(0, 0.0075, PAGE_H / 2 + 0.003);
    this.book.add(back, pad);
    for (let i = 0; i < 9; i++) {
      const ring = new Mesh(new TorusGeometry(0.0062, 0.0011, 6, 14), wire);
      ring.rotation.y = Math.PI / 2;
      ring.position.set((i - 4) * 0.014, 0.008, 0.003);
      this.book.add(ring);
    }
    // The cover hangs from the rings: closed it lies on the pad, open it lies turned right over behind it.
    const lid = new Mesh(new BoxGeometry(PAGE_W + 0.01, 0.003, PAGE_H + 0.008), hide);
    lid.position.set(0, 0.002, PAGE_H / 2 + 0.002);
    // A pale label on it, so a shut notebook can be told from the table in a dark room.
    const label = new Mesh(new BoxGeometry(0.07, 0.0006, 0.032), paper);
    label.position.set(0, 0.0036, 0.06);
    this.cover.add(lid, label);
    this.cover.position.set(0, 0.0125, 0.003);
    this.book.add(this.cover);
    this.book.position.copy(BOOK);
    this.book.rotation.y = BOOK_YAW;
    this.book.traverse((o) => {
      o.castShadow = o.receiveShadow = true;
    });
    this.group.add(this.book);
    h.scene.add(this.group);

    // The pencil, lying on the cover until you take it up.
    const part = (top: number, foot: number, from: number, to: number, color: number): void => {
      const m = new MeshStandardMaterial({ color, roughness: 0.55, emissive: color, emissiveIntensity: 0.12 });
      this.pencilMats.push(mat(m));
      const mesh = new Mesh(new CylinderGeometry(top, foot, to - from, 6), m);
      mesh.position.y = (from + to) / 2;
      mesh.castShadow = true;
      this.pencil.add(mesh);
    };
    part(0.0015, 0.0001, 0, 0.0065, 0x1b1a1c);
    part(0.005, 0.0015, 0.0065, 0.022, 0xe4cc9e);
    part(0.005, 0.005, 0.022, 0.14, 0xc9962f);
    part(0.0053, 0.0053, 0.14, 0.152, 0x7a2f1e);
    this.group.updateMatrixWorld(true);
    this.restAt.copy(this.book.localToWorld(V(-0.03, 0.0214, 0.045)));
    this.restQ.setFromUnitVectors(V(0, 1, 0), V(0.42, 0, 0.9).normalize().applyAxisAngle(V(0, 1, 0), BOOK_YAW));
    this.pencil.position.copy(this.restAt);
    this.pencil.quaternion.copy(this.restQ);
    this.tipAt.copy(this.restAt);
    this.group.add(this.pencil);

    this.pen = new DrawnHand(h.reduced);
    this.thumbs = [new DrawnHand(h.reduced, true), new DrawnHand(h.reduced)];
    for (const hand of this.thumbs) hand.pose = "thumb";
    h.camera.add(this.pen.group, ...this.thumbs.map((x) => x.group));

    // The real text field. Nobody sees it; it is where the typing goes.
    this.field = document.createElement("textarea");
    this.field.maxLength = MOST;
    this.field.setAttribute("aria-label", "What you do, in your own words. Enter hands it to the narrator.");
    this.field.autocapitalize = "sentences";
    Object.assign(this.field.style, { position: "absolute", left: "0", bottom: "0", width: "60%", height: "2.5em", opacity: "0", pointerEvents: "none", fontSize: "16px", border: "0", padding: "0", resize: "none" });
    this.field.tabIndex = -1;
    this.field.addEventListener("input", this.onInput);
    this.field.addEventListener("keydown", this.onFieldKey);
    this.read = document.createElement("div");
    this.read.setAttribute("aria-live", "polite");
    Object.assign(this.read.style, { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clipPath: "inset(50%)" });
    h.host.append(this.field, this.read);
    window.addEventListener("keydown", this.onKey);
  }

  /* --------------------------------- the game's side -------------------------------- */

  /** Say something in the narrator's voice. Resolves when the last word is out. */
  say(lines: string | string[]): Promise<void> {
    return this.voice.say(lines);
  }

  /** True while there is a page on the pad with something written on it. */
  get draft(): string {
    return this.sheet?.writing.mine ?? "";
  }

  /** Pages in the pile, oldest first. */
  get pages(): readonly PageWriting[] {
    return this.pile.map((p) => p.writing);
  }

  /**
   * Let the player write. Resolves the moment they press Enter, with their line; the page is then on its way to the
   * narrator, and `given` resolves when the narrator has it. So the game can work out the turn while the page is
   * in the air.
   */
  write(): Promise<{ line: string; given: Promise<void> }> {
    return new Promise((got) => (this.wanted = got));
  }

  /** True while a page is up in your hands to be read: the room then draws itself as finely as it can (room.ts). */
  get pageUp(): boolean {
    return !!this.held || this.cards.looking;
  }

  /** True while the game is waiting for a line. */
  get inviting(): boolean {
    return !!this.wanted;
  }

  /** Stop waiting for a line (a throw has been made instead). The notebook closes; what was written stays on the pad. */
  noLine(): void {
    this.wanted = null;
    if (this.mode === "writing") this.close();
  }

  /**
   * The narrator writes under your line on the page it has (or, with none, on a page of its own) and hands it to
   * you. Resolves when you have read it and set it down.
   */
  async handBack(w: { heading?: string; his: string[] }): Promise<void> {
    await this.calm();
    const n = this.h.narrator;
    const fresh = !this.his;
    const page = this.his ?? this.newPage(HIS);
    this.his = null;
    const arm = n.armFor(HIS.p);
    const steps: Step[] = [];
    const put = (): void => {
      page.writing.heading = w.heading;
      page.writing.his = w.his;
      page.draw();
    };
    if (fresh) put();
    else {
      // Its hand goes over the page, line by line, and the writing is there when it lifts.
      const at = V(0, 0, 0);
      steps.push({
        dur: 1.5,
        begin: () => n.watch(page.group.position, 2.5, this.t),
        tick: (u) => {
          at.set(Math.sin(u * 19) * 0.04, 0.012, 0.07 + u * 0.09);
          n.reach(arm, page.group.localToWorld(at));
          // Its pen on the paper, in bursts like words.
          if (Math.sin(u * 31) > 0.1) sound.write(HIS.p.x);
          if (u > 0.55 && page.writing.his !== w.his) put();
        },
      });
    }
    steps.push(...this.carried(page, arm, RETURNED, 1.0, 0.05));
    steps.push({
      dur: 0,
      begin: () => {
        n.mood("player", 2, this.t);
        this.take(page);
        // What it was saying goes quiet as the page comes up between you.
        this.voice.hush();
      },
    });
    steps.push(this.fly(page.group, () => this.holdPose(), 0.6));
    // Only once it is up in your hands can it be set down: a key pressed while it is still coming up does nothing.
    steps.push({ dur: 0, begin: () => (this.mode = "holding") });
    // Listened for before it is handed over, so a set-down can never come before anyone is waiting for it.
    const down = new Promise<void>((done) => this.downs.push(done));
    this.mode = "busy";
    await this.tracks.run(steps);
    this.tell(page);
    await down;
  }

  /** The narrator shoves the page it has out of true, onto the heap of those it is done with: a line it could not use. */
  pushAside(): Promise<void> {
    const page = this.his;
    this.his = null;
    return page ? this.aside(page) : Promise.resolve();
  }

  private async aside(page: Page): Promise<void> {
    const n = this.h.narrator;
    const arm = n.armFor(HIS.p);
    this.heap.push(page);
    // It stays where it lay, turned askew and dropped onto the others: the next page is laid squarely on top.
    const top = Math.min(this.heap.length, HEAP_MAX) - 1;
    const to = pose(HIS.p.x, HEAP_Y + top * HEAP_STEP, HIS.p.z, 0, HIS_YAW + HEAP_SKEW[this.shoved++ % HEAP_SKEW.length]!);
    await this.tracks.run([
      { dur: 0.2, tick: () => n.reach(arm, page.group.position), until: () => n.reached(arm) > 0.8, patience: 1.2 },
      this.fly(page.group, () => to, 0.5, 0, undefined, arm),
      { dur: 0.1, begin: () => n.reach(arm, null) },
    ]);
    while (this.heap.length > HEAP_MAX) {
      const old = this.heap.shift()!;
      this.group.remove(old.group);
      old.dispose();
    }
    this.heap.forEach((p, i) => (p.group.position.y = HEAP_Y + i * HEAP_STEP));
  }

  /* ----------------------------------- pages ---------------------------------- */

  private newPage(at: Pose | null): Page {
    const page = new Page(++this.made);
    if (at) {
      page.group.position.copy(at.p);
      page.group.quaternion.copy(at.q);
      this.group.add(page.group);
      // One of the narrator's own, lying over on its side.
      page.glow = AWAY;
    }
    return page;
  }

  /** Move a thing from where it is to a pose in its parent's space, turning as it goes. */
  /** @param arm the narrator's hand that has it, if one does: the thing then goes where those fingers go (track.ts, Held). */
  private fly(obj: Object3D, to: () => Pose, dur: number, lift = 0, also?: (u: number) => void, arm?: number): Step {
    const p0 = V(0, 0, 0), q0 = new Quaternion();
    let dst: Pose;
    const held = arm === undefined ? null : new Held(this.h.narrator, arm, obj, () => this.t);
    return {
      dur,
      until: held ? () => held.there : undefined,
      patience: 0.9,
      begin: () => {
        p0.copy(obj.position);
        q0.copy(obj.quaternion);
        dst = to();
        held?.take();
        // Paper going through the air, or over the table.
        sound.play("slide", { x: (p0.x + dst.p.x) / 2, gain: 0.5 + lift * 6 });
      },
      tick: (u) => {
        const e = ease(u);
        obj.position.lerpVectors(p0, dst.p, e);
        obj.position.y += Math.sin(Math.PI * u) * lift;
        obj.quaternion.slerpQuaternions(q0, dst.q, e);
        held?.follow();
        also?.(u);
      },
    };
  }

  /** The narrator takes a page by its top edge, carries it to a pose on or over the table, and lets go. */
  private carried(page: Page, arm: number, to: Pose, dur: number, lift: number): Step[] {
    const n = this.h.narrator;
    const g = page.group;
    return [
      { dur: 0.2, tick: () => n.reach(arm, g.position), until: () => n.reached(arm) > 0.85 && n.fingertips(arm).distanceTo(g.position) < 0.05, patience: 1.6 },
      { dur: 0.22, begin: () => n.close?.(arm, "pinch") },
      // The edge stays in its fingers on the way, and comes to rest exactly where it should.
      this.fly(g, () => to, dur, lift, (u) => page.curl(Math.sin(Math.PI * u) * 0.5), arm),
      { dur: 0.2, begin: () => n.release?.(arm) },
      { dur: 0, begin: () => n.reach(arm, null) },
    ];
  }

  /** Where a page is held to be read: upright in front of you, as large as the view allows. */
  private holdPose(): Pose {
    const cam = this.h.camera;
    const half = Math.tan((cam.fov * Math.PI) / 360);
    const d = Math.max(0.24, PAGE_H / 2 / 0.86 / half, PAGE_W / 2 / 0.8 / (half * cam.aspect));
    return pose(0, PAGE_H / 2 - 0.004, -d, Math.PI / 2 - 0.1, 0);
  }

  /** A page comes into your hands: from now on it goes where your eyes go. */
  private take(page: Page): void {
    this.h.camera.attach(page.group);
    page.inFront = true;
    page.curl(0);
    this.held = page;
    this.thumbK = Math.min(this.thumbK, 0.01);
  }

  /** Put the page for a screen reader to read. */
  private tell(page: Page): void {
    const w = page.writing;
    this.read.textContent = [w.mine && `You wrote: ${w.mine}`, w.heading, ...w.his].filter(Boolean).join(" ");
  }

  /** Where the i-th page of a stack lies on the table: the pile of what you have read, its newest on top, or your sheets, the first on top. */
  private slot(i: number, stack: Page[] = this.pile): Pose {
    if (stack === this.sheaf) {
      const up = Math.max(0, this.sheaf.length - 1 - i);
      return pose(SHEAF.x + ((i * 3) % 2) * 0.003, SHEAF.y + up * 0.0007, SHEAF.z, 0, SHEAF_YAW + (((i * 29) % 5) - 2) * 0.012);
    }
    return pose(PILE.x + ((i * 5) % 3) * 0.004, PILE.y + i * 0.0007, PILE.z, 0, -0.06 + (((i * 37) % 7) - 3) * 0.014);
  }

  /** Where the k-th page from the front of a stack in your hands is: a little higher, a little askew, behind the one before. */
  private deep(k: number): Pose {
    const at = this.holdPose();
    const d = Math.min(k, DEEP);
    at.p.add(V(k ? (((k * 7) % 3) - 1) * 0.0028 : 0, d * 0.0026, -d * 0.0012));
    // Turned a little in its own plane, the way loose sheets never quite square up.
    if (k) at.q.multiply(new Quaternion().setFromAxisAngle(V(0, 1, 0), (((k * 5) % 5) - 2) * 0.014));
    return at;
  }

  /** Draw the pages in your hands in their order, the one in front over the rest, and only as many as can be seen. */
  private order(): void {
    this.hand.forEach((p, k) => {
      p.order = HELD_ORDER - Math.min(k, DEEP + 1);
      p.group.visible = k <= DEEP;
    });
  }

  /** Move pages together, each from where it is to its own pose in its parent's space. */
  private flyAll(pages: Page[], to: (k: number) => Pose, dur: number, lift = 0): Step {
    const from: Pose[] = [];
    let dst: Pose[] = [];
    return {
      dur,
      begin: () => {
        pages.forEach((p, k) => (from[k] = { p: p.group.position.clone(), q: p.group.quaternion.clone() }));
        dst = pages.map((_, k) => to(k));
        sound.play("slide", { x: PILE.x, gain: 0.6 + lift * 6 });
      },
      tick: (u) => {
        const e = ease(u);
        pages.forEach((p, k) => {
          p.group.position.lerpVectors(from[k]!.p, dst[k]!.p, e);
          p.group.position.y += Math.sin(Math.PI * u) * lift;
          p.group.quaternion.slerpQuaternions(from[k]!.q, dst[k]!.q, e);
        });
      },
    };
  }

  /** Set down what is in your hands: a page just handed to you goes on top of the pile, a stack goes back where it lay. */
  setDown(): Promise<void> {
    const page = this.held;
    if (!page || (this.mode !== "holding" && this.mode !== "reading")) return Promise.resolve();
    const done = (): void => {
      this.readAt = -1;
      this.mode = "idle";
      this.read.textContent = "";
      for (const down of this.downs.splice(0)) down();
      this.applySheets();
    };
    if (this.mode === "reading" && this.upStack) {
      const stack = this.upStack;
      const pages = this.hand;
      this.mode = "busy";
      this.held = null;
      this.hand = [];
      this.rightAt = null;
      for (const p of pages) {
        this.group.attach(p.group);
        p.inFront = false;
        p.group.visible = true;
      }
      return this.tracks.run([this.flyAll(pages, (k) => this.slot(stack.indexOf(pages[k]!), stack), 0.55, 0.03)]).then(() => {
        for (const p of pages) p.glow = 0.05;
        this.upStack = null;
        done();
      });
    }
    const i = this.pile.length;
    this.mode = "busy";
    this.group.attach(page.group);
    page.inFront = false;
    this.held = null;
    this.hand = [];
    return this.tracks.run([this.fly(page.group, () => this.slot(i), 0.55, 0.03)]).then(() => {
      this.pile.push(page);
      page.glow = 0.05;
      done();
    });
  }

  /**
   * Pick up a stack whole, to leaf through: the pile of what you have read, its newest page in front unless told
   * otherwise, or your sheets, the first in front.
   */
  pickUp(i?: number, stack: Page[] = this.pile): Promise<void> {
    if (!stack.length || this.mode !== "idle") return Promise.resolve();
    void this.cards.unlook();
    const at = Math.max(0, Math.min(stack.length - 1, i ?? (stack === this.pile ? stack.length - 1 : 0)));
    this.mode = "busy";
    this.upStack = stack;
    this.readAt = at;
    // In your hands the page you read is in front, the ones before it behind it in turn, and the ones after it at the back.
    this.hand = [...stack.slice(0, at + 1).reverse(), ...stack.slice(at + 1).reverse()];
    for (const p of this.hand) {
      this.h.camera.attach(p.group);
      p.inFront = true;
      p.curl(0);
    }
    this.order();
    for (const p of this.hand) p.group.visible = true;
    this.held = this.hand[0]!;
    this.thumbK = Math.min(this.thumbK, 0.01);
    return this.tracks.run([this.flyAll(this.hand, (k) => this.deep(k), 0.55)]).then(() => {
      this.order();
      this.mode = "reading";
      this.tell(this.held!);
    });
  }

  /**
   * Turn to the page before (-1) or after (+1) the one in front: the one in front is drawn aside and put to the back
   * of the stack, or the one at the back is drawn out and laid in front. Your right hand goes with the page.
   */
  async leaf(by: number): Promise<void> {
    const stack = this.upStack;
    if (this.mode !== "reading" || !stack || !stack[this.readAt + by]) return;
    this.mode = "busy";
    const n = this.hand.length;
    const back = by < 0;
    const moving = this.hand[back ? 0 : n - 1]!;
    const rest = this.hand.filter((p) => p !== moving);
    const next = back ? [...rest, moving] : [moving, ...rest];
    const from = new Map(this.hand.map((p) => [p, { p: p.group.position.clone(), q: p.group.quaternion.clone() }]));
    const to = new Map(next.map((p, k) => [p, this.deep(k)]));
    // Aside: drawn off to the right and a little down, turned as the thumb drags it.
    const aside = this.deep(0);
    aside.p.add(V(PAGE_W * ASIDE, -0.012, 0));
    aside.q.multiply(new Quaternion().setFromAxisAngle(V(0, 1, 0), -0.14));
    const corner = (p: Page): Vector3 => p.group.localToWorld(V(PAGE_W / 2 - THUMB_IN, 0, PAGE_H - THUMB_UP));
    const top = HELD_ORDER + 1, bottom = HELD_ORDER - DEEP - 2;
    const was = this.held!;
    let swapped = false;
    await this.tracks.run([
      {
        dur: 0.62,
        begin: () => {
          sound.play("slide", { x: 0.1, gain: 0.7 });
          moving.order = back ? top : bottom;
          moving.group.visible = true;
        },
        tick: (u) => {
          // The others close up or make room, each to its new place.
          const all = ease(u);
          for (const p of rest) {
            const a = from.get(p)!, b = to.get(p)!;
            p.group.position.lerpVectors(a.p, b.p, all);
            p.group.quaternion.slerpQuaternions(a.q, b.q, all);
          }
          // The page that moves: out to the side in the first half, in to its new place in the second.
          const a = from.get(moving)!, b = to.get(moving)!;
          const half = u < 0.5;
          const e = ease(half ? u * 2 : (u - 0.5) * 2);
          if (half) {
            moving.group.position.lerpVectors(a.p, aside.p, e);
            moving.group.quaternion.slerpQuaternions(a.q, aside.q, e);
          } else {
            if (!swapped) {
              swapped = true;
              // Past the edge of the stack it goes behind it, or comes over it.
              moving.order = back ? bottom : top;
              this.hand = next;
              this.held = next[0]!;
              rest.forEach((p) => (p.order = HELD_ORDER - Math.min(next.indexOf(p), DEEP + 1)));
            }
            moving.group.position.lerpVectors(aside.p, b.p, e);
            moving.group.quaternion.slerpQuaternions(aside.q, b.q, e);
          }
          // Your right thumb: on the page as it goes out (or out to meet it), then back to the one in front (or in with it).
          if (back) this.rightAt = half ? corner(moving) : corner(moving).lerp(corner(next[0]!), e);
          else this.rightAt = half ? corner(was).lerp(corner(moving), e) : corner(moving);
        },
      },
    ]);
    this.hand = next;
    this.held = next[0]!;
    this.rightAt = null;
    this.readAt += by;
    this.order();
    this.mode = "reading";
    this.tell(this.held);
  }

  /** Your sheets as they now stand (tell-adventure.ts, sheetPages): written out at once, or when they are out of your hands. */
  sheets(pages: { heading: string; his: string[] }[]): void {
    this.sheetsWant = pages;
    this.applySheets();
  }

  private applySheets(): void {
    const want = this.sheetsWant;
    if (!want || this.upStack === this.sheaf) return;
    this.sheetsWant = null;
    while (this.sheaf.length > want.length) {
      const p = this.sheaf.pop()!;
      this.group.remove(p.group);
      p.dispose();
    }
    want.forEach((w, i) => {
      let p = this.sheaf[i];
      if (!p) {
        p = new Page(++this.made, true);
        p.glow = 0.05;
        this.group.add(p.group);
        this.sheaf.push(p);
      }
      if (p.writing.heading !== w.heading || p.writing.his.join("\n") !== w.his.join("\n")) {
        p.writing.heading = w.heading;
        p.writing.his = [...w.his];
        p.draw();
      }
    });
    this.sheaf.forEach((p, i) => {
      const at = this.slot(i, this.sheaf);
      p.group.position.copy(at.p);
      p.group.quaternion.copy(at.q);
    });
  }

  /** Put down whatever you have picked up to look at, and shut the notebook, before the narrator hands you something. */
  private async calm(): Promise<void> {
    await this.cards.unlook();
    if (this.mode === "writing") this.close();
    if (this.mode === "reading") await this.setDown();
  }

  /* ---------------------------------- writing --------------------------------- */

  /**
   * Turn to the balance while a check is weighed: until the weights are in (`settled`) and a moment more, so the
   * tilt can be read. Then back to the table, where the dice box is.
   */
  watchBalance(settled: Promise<void>): void {
    this.lookAt(V(-0.3, 0.34, 0.58), V(-0.64, 0.12, -0.2), 32, settled);
  }

  /** Look down at the paper of who you may be until a box is ticked (`settled`). */
  watchRoster(settled: Promise<void>): void {
    const at = this.roster.middle;
    this.lookAt(V(at.x, 0.44, at.z + 0.34), at.clone().add(V(0, 0, 0.01)), 30, settled, 0.2);
  }

  /** Turn your head toward something (a card being turned, say) until `settled`, and `hold` seconds more. */
  lookAt(eye: Vector3, look: Vector3, fov: number, settled: Promise<void>, hold = 1.5): void {
    this.glance.eye.copy(eye);
    this.glance.look.copy(look);
    this.glanceFov = fov;
    const mine = ++this.glanceTurn;
    this.glanceWant = 1;
    this.glanceEnd = Infinity;
    void settled.then(() => {
      if (mine === this.glanceTurn) this.glanceEnd = this.now + hold;
    });
  }

  /* ------------------------------ waiting on a model ------------------------------ */

  /** True at once if the work is already done, so a wait that is not needed is never begun. */
  private async already(work: Promise<unknown>): Promise<{ done: boolean }> {
    const state = { done: false };
    void work.then(
      () => (state.done = true),
      () => (state.done = true),
    );
    await Promise.resolve();
    await Promise.resolve();
    return state;
  }

  /**
   * While your line is being read: the narrator lifts your page and holds it up to the candlelight, its eyes going
   * along the lines, for as long as it takes. The moment the reading is done it lays the page down again where it
   * was. If it was done before the page arrived, nothing of this is shown.
   */
  async reading<T>(work: Promise<T>): Promise<T> {
    const state = await this.already(work);
    const page = this.his;
    if (state.done || !page) return work;
    const n = this.h.narrator;
    const arm = n.armFor(HIS.p);
    const g = page.group;
    const line = V(0, 0.01, 0);
    let nextLine = 0;
    await this.tracks.run([
      ...this.carried(page, arm, READ, 0.75, 0.04).slice(0, 3),
      {
        dur: 0.4,
        until: () => state.done,
        patience: Infinity,
        tick: () => {
          // A slow sway, and its eyes go along the lines and down the page.
          const t = this.t;
          g.position.set(READ.p.x + Math.sin(t * 0.7) * 0.004, READ.p.y + Math.sin(t * 1.1) * 0.003, READ.p.z);
          n.reach(arm, g.position);
          if (t >= nextLine) {
            nextLine = t + 0.55;
            const k = (t * 0.9) % 1;
            line.set((k - 0.5) * PAGE_W * 0.7, 0.01, PAGE_H * (0.2 + (Math.floor(t * 0.9) % 4) * 0.15));
            n.watch(g.localToWorld(line.clone()), 0.8, t);
          }
        },
      },
      this.fly(g, () => HIS, 0.5, 0.02, (u) => page.curl(Math.sin(Math.PI * u) * 0.3), arm),
      { dur: 0.15, begin: () => n.release?.(arm) },
      { dur: 0, begin: () => n.reach(arm, null) },
    ]);
    return work;
  }

  /**
   * While what happened is being put into words: the narrator thinks it over, with the small things its hands do
   * (a steeple, a drum of the fingers, one slow tap), and if it goes on long it looks out of the window a while.
   * It ends the moment the words are ready.
   */
  async musing<T>(work: Promise<T>): Promise<T> {
    const state = await this.already(work);
    if (state.done) return work;
    const n = this.h.narrator;
    const moves = ["steeple", "drum", "tap"] as const;
    const t0 = this.t;
    for (let i = 0; !state.done; i++) {
      if (this.t - t0 > 6 && i % 3 === 2) n.watch(WINDOW, 3.2, this.t);
      else if (!n.gesture?.(moves[i % 3]!)) n.mood("narrow", 2, this.t);
      const end = this.t + 2.8;
      await this.tracks.run([{ dur: 0, until: () => state.done || this.t >= end, patience: Infinity }]);
    }
    n.mood("player", 1.5, this.t);
    return work;
  }

  /** Look back from the balance now. */
  lookBack(): void {
    this.glanceTurn++;
    this.glanceWant = 0;
  }

  /**
   * Your hero writes in the margin of the page on the pad (docs/MOONSHOT.md, 3.2): what you notice here, in pencil.
   * The notes stay on that page when you tear it off; the next page starts with a clean margin.
   */
  margin(notes: string[]): void {
    this.marginNotes = notes.slice(0, 4);
    if (!this.sheet) {
      this.sheet = this.newPage(null);
      this.sheet.group.position.copy(SHEET);
      this.book.add(this.sheet.group);
    }
    this.sheet.writing.margin = [...this.marginNotes];
    this.sheet.draw();
  }
  private marginNotes: string[] = [];

  /** Open the notebook and lean in over it. */
  open(): void {
    if (this.mode !== "idle" || !this.wanted) return;
    this.h.sitBack();
    this.voice.hush();
    // A card held up to be read goes back down: the notebook needs both eyes.
    void this.cards.unlook();
    this.mode = "writing";
    if (!this.sheet) {
      this.sheet = this.newPage(null);
      this.sheet.group.position.copy(SHEET);
      this.book.add(this.sheet.group);
      this.field.value = "";
    }
    this.focusWant = 1;
    this.pen.pose = "pencil";
    this.inkWant = true;
    // The hand goes to the pencil where it lies, and then goes where the pencil goes.
    this.penOn = () => this.gripAt.set(0, 0.038, 0).applyQuaternion(this.pencil.quaternion).add(this.pencil.position);
    this.field.tabIndex = 0;
    this.field.focus({ preventScroll: true });
  }

  /** Shut the notebook without handing anything over. What is written stays on the pad. */
  close(): void {
    if (this.mode !== "writing") return;
    this.mode = "idle";
    this.focusWant = 0;
    // The pencil is laid back on the notebook; the hand goes when it is down.
    this.inkWant = false;
    this.field.blur();
    this.field.tabIndex = -1;
  }

  private onInput = (): void => {
    const sheet = this.sheet;
    if (!sheet || this.mode !== "writing") return;
    const before = sheet.writing.mine;
    sheet.writing.mine = this.field.value.replace(/\n/g, " ");
    sheet.draw();
    if (sheet.full) {
      // The page is full: the last thing typed does not go on it.
      sheet.writing.mine = this.field.value = before;
      sheet.draw();
    } else {
      this.scribble = 1;
      sound.write(this.pencil.position.x);
    }
  };

  private onFieldKey = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.submit();
    } else if (e.key === "Escape") this.close();
  };

  /** Tear the page off and hold it out. */
  submit(): void {
    const sheet = this.sheet;
    const line = this.field.value.replace(/\s+/g, " ").trim();
    if (!sheet || this.mode !== "writing" || !line || !this.wanted) return;
    const got = this.wanted;
    this.wanted = null;
    sheet.writing.mine = line;
    sheet.draw();
    this.sheet = null;
    // It was lit to be written on; on the table it is lit by the room alone, like everything else there.
    this.dimming.push(sheet);
    this.marginNotes = [];
    this.field.value = "";
    this.field.blur();
    this.field.tabIndex = -1;
    this.mode = "busy";
    this.focusWant = 0;
    const n = this.h.narrator;
    const arm = n.armFor(OFFERED.p);
    const g = sheet.group;
    // Your hand takes the page by its near corner and goes with it.
    this.inkWant = false;
    this.pen.pose = "pinch";
    this.penOn = () => g.localToWorld(this.tmp.set(PAGE_W / 2 - 0.012, 0, PAGE_H - 0.02));
    const steps: Step[] = [
      { dur: 0.3, begin: () => sound.play("tear", { x: g.position.x }), tick: (u) => sheet.curl(ease(u) * 0.7) },
      { dur: 0, begin: () => this.group.attach(g) },
      this.fly(g, () => OFFERED, 0.7, 0.03, (u) => sheet.curl(0.7 - ease(u) * 0.45)),
      { dur: 0.15, begin: () => n.watch(g.position, 3, this.t) },
      { dur: 0.2, tick: () => n.reach(arm, g.position), until: () => n.reached(arm) > 0.85 && n.fingertips(arm).distanceTo(g.position) < 0.05, patience: 1.8 },
      { dur: 0.22, begin: () => n.close?.(arm, "pinch") },
      // It has it: your hand lets go and comes back.
      { dur: 0, begin: () => (this.penOn = null) },
      ...this.carried(sheet, arm, HIS, 0.95, 0.06).slice(2),
      { dur: 0.3, begin: () => n.watch(g.position, 2.2, this.t) },
    ];
    // A page it still has from the line before (you wrote again instead of throwing) goes onto its heap, under this one.
    if (this.his) void this.aside(this.his);
    this.his = sheet;
    const given = this.tracks.run(steps).then(() => {
      sheet.curl(0);
      this.mode = "idle";
    });
    got({ line, given });
  }

  /* ---------------------------------- pointer --------------------------------- */

  /** How many pixels from the pointer a place in the room is drawn, as a share of the picture's height. */
  private far(e: { clientX: number; clientY: number }, world: Vector3): number {
    const r = this.h.host.getBoundingClientRect();
    const p = this.tmp.copy(world).project(this.h.camera);
    if (p.z > 1) return Infinity;
    return Math.hypot(((p.x + 1) / 2) * r.width - (e.clientX - r.left), ((1 - p.y) / 2) * r.height - (e.clientY - r.top)) / r.height;
  }

  /** Where the middle of a thing you can click is, in the room: the notebook, the pile of pages, your sheets, the dice box. */
  where(what: "book" | "pile" | "sheaf" | "box"): Vector3 {
    if (what === "book") return this.book.localToWorld(V(0, 0, PAGE_H / 2));
    if (what === "sheaf") return V(SHEAF.x + Math.sin(SHEAF_YAW) * PAGE_H * 0.5, 0, SHEAF.z + Math.cos(SHEAF_YAW) * PAGE_H * 0.5);
    return what === "pile" ? V(PILE.x, 0, PILE.z + PAGE_H / 2) : this.h.box.clone().setY(0.02);
  }

  /** Which card on your side the pointer is over, or -1. */
  private sideCard(e: { clientX: number; clientY: number }): number {
    let best = -1, near = 0.045;
    this.cards.sideAt().forEach((at, i) => {
      const d = this.far(e, at);
      if (d < near) {
        near = d;
        best = i;
      }
    });
    return best;
  }

  /** Which die of your hand the pointer is over, while one may be spent, or -1. */
  private dieAt(e: { clientX: number; clientY: number }): number {
    if (!this.dice.choosing) return -1;
    let best = -1, near = 0.05;
    this.dice.at().forEach((at, i) => {
      const d = this.far(e, at);
      if (d < near) {
        near = d;
        best = i;
      }
    });
    return best;
  }

  /** What the pointer is over that a click would use. */
  private over(e: { clientX: number; clientY: number }): "book" | "pile" | "sheaf" | "box" | "card0" | "card1" | null {
    if (this.cards.choosing) {
      const near = [0, 1].map((i) => {
        const at = this.cards.laid(i);
        return at ? this.far(e, at) : Infinity;
      });
      const i = near[0]! <= near[1]! ? 0 : 1;
      if (near[i]! < 0.09) return i ? "card1" : "card0";
    }
    if (this.wanted && this.far(e, this.where("book")) < 0.13) return "book";
    const pile = this.pile.length ? this.far(e, this.where("pile")) : Infinity;
    const sheaf = this.sheaf.length ? this.far(e, this.where("sheaf")) : Infinity;
    if (Math.min(pile, sheaf) < 0.12) return pile <= sheaf ? "pile" : "sheaf";
    if (this.onDie && this.far(e, this.where("box")) < 0.14) return "box";
    return null;
  }

  /** True where a click would do something of the desk's, so the room can show it. */
  hot(e: { clientX: number; clientY: number }): boolean {
    // A line of the paper of who you may be, while a box can be ticked.
    if (this.roster.choosing) {
      const i = this.roster.lineAt(e, this.h.host);
      this.roster.hover = i;
      if (i >= 0) return true;
    }
    // A die of your hand, while one may be spent.
    this.dice.hover = this.cards.looking ? -1 : this.dieAt(e);
    if (this.dice.hover >= 0) return true;
    const on = this.over(e);
    this.cards.hover = on === "card0" ? 0 : on === "card1" ? 1 : -1;
    if (on === "card0" || on === "card1") return true;
    // A card on your side can be picked up to be read, whenever your hands are free.
    const free = this.mode === "idle" || this.mode === "writing";
    this.cards.sideHover = free ? this.sideCard(e) : -1;
    if (this.cards.sideHover >= 0 || this.cards.looking) return true;
    return this.mode === "holding" || this.mode === "reading" || this.voice.speaking || this.glanceWant > 0 || (this.mode === "idle" && !!on);
  }

  /** A click in the room. Returns true if the desk used it. */
  click(e: { clientX: number; clientY: number }): boolean {
    // Touching a line of the paper of who you may be ticks its box.
    if (this.roster.choosing) {
      const i = this.roster.lineAt(e, this.h.host);
      if (i >= 0) {
        this.roster.choosing(i);
        return true;
      }
    }
    // Touching one of the two cards of a fork picks that road, whatever else is going on.
    const pick = this.cards.choosing ? this.over(e) : null;
    if (pick === "card0" || pick === "card1") {
      this.cards.choosing?.(pick === "card0" ? 0 : 1);
      return true;
    }
    // A card held up to your eyes: touching another card on your side shows that one instead; anywhere else puts it back.
    if (this.cards.looking) {
      const i = this.sideCard(e);
      void (i >= 0 && i !== this.cards.lookingAt ? this.cards.look(i) : this.cards.unlook());
      return true;
    }
    // Touching a die of your hand spends it, with the notebook open or shut.
    const die = this.dieAt(e);
    if (die >= 0) {
      this.dice.pick(die);
      return true;
    }
    if ((this.mode === "idle" || this.mode === "writing") && !this.voice.speaking) {
      const i = this.sideCard(e);
      if (i >= 0) {
        void this.cards.look(i);
        return true;
      }
    }
    if (this.voice.hurry()) return true;
    // Turned to the balance, the dice box and the notebook are out of sight: a click turns you back to them.
    if (this.glanceWant) {
      this.lookBack();
      return true;
    }
    if (this.mode === "busy") return true;
    if (this.mode === "holding") {
      void this.setDown();
      return true;
    }
    if (this.mode === "reading") {
      // The left and right of the picture turn to the page before and the page after; the middle sets it down.
      const r = this.h.host.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (x < 0.3 && this.pile[this.readAt - 1]) void this.leaf(-1);
      else if (x > 0.7 && this.pile[this.readAt + 1]) void this.leaf(1);
      else void this.setDown();
      return true;
    }
    const on = this.over(e);
    if (this.mode === "writing") {
      if (on === "book") this.field.focus({ preventScroll: true });
      else this.close();
      return true;
    }
    if (on === "book") this.open();
    else if (on === "pile") void this.pickUp();
    else if (on === "sheaf") void this.pickUp(undefined, this.sheaf);
    else if (on === "box") this.onDie?.();
    return !!on;
  }

  private onKey = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName ?? "";
    if (["INPUT", "BUTTON", "TEXTAREA", "SELECT", "A", "SUMMARY"].includes(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
    const go = e.key === "Enter" || e.key === " ";
    let used = true;
    const looking = this.cards.lookingAt;
    if (looking >= 0 && (e.key === "ArrowLeft" || e.key === "ArrowUp")) void this.cards.look(Math.max(0, looking - 1));
    else if (looking >= 0 && (e.key === "ArrowRight" || e.key === "ArrowDown")) void this.cards.look(looking + 1);
    else if (looking >= 0 && (go || e.key === "Escape")) void this.cards.unlook();
    else if (go && this.voice.hurry()) used = true;
    else if (this.mode === "holding" && (go || e.key === "Escape")) void this.setDown();
    else if (this.mode === "reading" && (e.key === "ArrowLeft" || e.key === "ArrowUp")) void this.leaf(-1);
    else if (this.mode === "reading" && (e.key === "ArrowRight" || e.key === "ArrowDown")) void this.leaf(1);
    else if (this.mode === "reading" && (go || e.key === "Escape")) void this.setDown();
    else if (this.mode === "idle" && e.key === "Enter" && this.onDie) this.onDie();
    else if (this.mode === "idle" && this.wanted && (e.key.length === 1 || e.key === "Enter") && e.key !== " ") {
      // Starting to type opens the notebook; the letter goes into it.
      this.open();
      used = e.key === "Enter";
    } else if (this.mode === "idle" && e.key === "ArrowUp" && this.pile.length) void this.pickUp();
    else used = false;
    if (used) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  /* ----------------------------------- frame ---------------------------------- */

  /**
   * Hang a hand that holds the page so that the pad of its thumb lies over a place on it, turned by `turn`, and no
   * larger than lets its thumb end inside the bare foot of the page: it must never lie over the writing.
   */
  private hang(hand: DrawnHand, world: Vector3, drop: number, turn: number): void {
    const p = this.h.camera.worldToLocal(this.tmp.copy(world));
    const k = HAND_D / -p.z;
    p.multiplyScalar(k);
    const size = Math.max(0.7, Math.min(1, ((PAGE_FOOT - THUMB_UP - 0.002) * k) / THUMB_REACH));
    const a = hand.anchor().multiplyScalar(size);
    const c = Math.cos(turn), s = Math.sin(turn);
    hand.group.scale.setScalar(size);
    hand.group.rotation.z = turn;
    hand.group.position.set(p.x - (a.x * c - a.y * s), p.y - (a.x * s + a.y * c) - drop, -HAND_D);
  }

  /** @param bright how lit your hands are */
  update(t: number, dt: number, bright: number): void {
    this.t = t;
    const still = this.h.reduced;
    const to = (now: number, want: number, rate: number): number => (still || Math.abs(want - now) < 0.002 ? want : now + (want - now) * Math.min(1, dt * rate));
    this.tracks.update(t);
    this.luck.update(t);
    this.dice.update(t);
    this.counters.update(dt);
    this.voice.update(t, dt);

    const writing = this.mode === "writing";
    this.focus.k = to(this.focus.k, this.focusWant, 3.4);
    this.focus.fov = this.h.camera.aspect < 1 ? 48 : 30;
    // The glance at the balance ends by itself, and at once if you take up anything else.
    this.now = t;
    if (this.glanceWant && (t >= this.glanceEnd || this.mode !== "idle")) this.lookBack();
    this.glance.k = to(this.glance.k, this.glanceWant, this.glanceWant ? 2.6 : 3);
    this.glance.fov = this.h.camera.aspect < 1 ? this.glanceFov + 18 : this.glanceFov;
    this.cards.update(dt, still);
    // The cover is turned back once the pencil is off it.
    this.coverK = to(this.coverK, this.focusWant && this.inkK > 0.2 ? 1 : 0, 5);
    this.cover.rotation.x = -ease(this.coverK) * (Math.PI - 0.05);
    if (this.sheet) this.sheet.glow = 0.05 + this.focus.k * 0.3;
    this.dimming = this.dimming.filter((p) => p !== this.held && (p.glow = to(p.glow, AWAY, 2.5)) > AWAY + 0.001);

    // The pencil: lying on the notebook, or in your hand with its point where the next letter goes.
    const sheet = this.sheet;
    if (writing && sheet) {
      const caret = sheet.group.localToWorld(this.tmp.set(sheet.caret.x, 0.003, sheet.caret.z));
      if (this.inkK < 0.05 || still) this.tipAt.copy(caret);
      else this.tipAt.lerp(caret, Math.min(1, dt * 16));
    }
    this.penK = to(this.penK, this.penOn ? 1 : 0, this.penOn ? 6 : 4);
    this.inkK = to(this.inkK, this.inkWant && this.penK > 0.6 ? 1 : 0, 4.5);
    const holds = this.pen.pose === "pencil";
    if (!this.inkWant && holds && this.inkK < 0.03) this.penOn = null;
    this.scribble = Math.max(0, this.scribble - dt * 5);
    const ik = ease(this.inkK);
    const wob = still ? 0 : this.scribble * 0.0016;
    this.pencil.position.lerpVectors(this.restAt, this.tipAt, ik);
    this.pencil.position.x += Math.sin(t * 43) * wob;
    this.pencil.position.y += Math.sin(Math.PI * ik) * 0.035;
    this.pencil.position.z += Math.cos(t * 37) * wob;
    this.pencil.quaternion.slerpQuaternions(this.restQ, this.holdQ, ik);
    // In the hand it is drawn between the back of the hand and the finger and thumb that hold it.
    const inHand = holds && this.penK > 0.01;
    if (inHand !== this.pencilMats[0]!.transparent) {
      for (const m of this.pencilMats) {
        m.transparent = inHand;
        m.needsUpdate = true;
      }
      for (const o of this.pencil.children) o.renderOrder = inHand ? DrawnHand.ORDER + 1 : 0;
    }

    // Your right hand: up from below when there is something for it to do, and back down after.
    this.pen.group.visible = this.penK > 0.01;
    if (this.pen.group.visible) {
      const cam = this.h.camera;
      const flat = (v: Vector3): Vector3 => cam.worldToLocal(v).multiplyScalar(HAND_D / -v.z);
      if (this.penOn) this.penAt.copy(this.penOn());
      let turn = 0;
      if (holds) {
        // Turned so that the drawn grip lies along the pencil as you see it.
        const tip = flat(this.tmp2.copy(this.pencil.position));
        const end = flat(this.tmp3.set(0, 0.1, 0).applyQuaternion(this.pencil.quaternion).add(this.pencil.position));
        turn = Math.max(-0.7, Math.min(0.7, Math.atan2(end.y - tip.y, end.x - tip.x) - GRIP_LEAN));
      }
      const far = -cam.worldToLocal(this.tmp.copy(this.penAt)).z;
      const size = Math.max(0.3, Math.min(0.95, PEN_SIZE / Math.max(0.1, far)));
      this.pen.group.scale.setScalar(size);
      const p = flat(this.tmp.copy(this.penAt));
      const a = this.pen.anchor().multiplyScalar(size);
      const c = Math.cos(turn), s = Math.sin(turn);
      this.pen.group.rotation.z = turn;
      this.pen.group.position.set(p.x - (a.x * c - a.y * s), p.y - (a.x * s + a.y * c) - (1 - ease(this.penK)) * 0.3, -HAND_D);
      this.pen.update(t, bright);
    }

    // The hands that hold a page up, one at each lower corner.
    const page = this.held;
    this.thumbK = to(this.thumbK, page ? 1 : 0, page ? 5 : 7);
    const show = this.thumbK > 0.01 && !!page;
    this.thumbs.forEach((hand, i) => {
      hand.group.visible = show;
      if (!show || !page) return;
      const corner = i && this.rightAt ? this.rightAt : page.group.localToWorld(V((i ? 1 : -1) * (PAGE_W / 2 - THUMB_IN), 0, PAGE_H - THUMB_UP));
      this.hang(hand, corner, (1 - ease(this.thumbK)) * 0.25, (i ? 1 : -1) * THUMB_TURN);
      hand.update(t, bright);
    });
    if (page) page.glow = 0.12 + ease(this.thumbK) * 0.5;
    // The pages behind it in a stack are lit as it is, a little less.
    for (const p of this.hand) if (p !== page) p.glow = 0.1 + ease(this.thumbK) * 0.38;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKey);
    this.field.remove();
    this.read.remove();
    this.voice.dispose();
    this.counters.dispose();
    this.dread.dispose();
    this.luck.dispose();
    this.dice.dispose();
    this.roster.dispose();
    this.cards.dispose();
    this.pen.dispose();
    for (const hand of this.thumbs) hand.dispose();
    for (const page of new Set([this.sheet, this.his, this.held, ...this.pile, ...this.heap, ...this.sheaf])) page?.dispose();
    for (const m of this.mats) m.dispose();
  }
}
