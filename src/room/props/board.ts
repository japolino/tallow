/**
 * The quest board (game/system.ts, Show "quests"; the quests system gives it, systems/quests.ts boardShow): what you
 * have taken on, what is left to do in each, what is out of reach and why, and lines that set about a task.
 *
 * Closed, it is a small cork board in an oak frame standing on two feet, leaning back a little, at the left of the
 * narrator's hands. A paper slip is pinned on it for each quest, the open ones first and bright, those that have ended
 * after them on older paper: an achieved quest's slip is sealed with wax, a lost one is torn and hangs crooked, one given
 * up is struck through. Each open slip has a row of small marks along its foot, one for each task, ticked when done. A
 * quest just begun has a red pin and a red band along its top, and stirs on its pin, until you have looked at it. A new slip is pinned up
 * with a small drop, a task done shakes its slip as the tick goes on, and a quest ended is sealed, torn or struck there.
 * Along the board's foot are a blank slip for a quest of your own and, when there are more slips than the board holds,
 * a pencilled "more".
 *
 * Open, touch a slip and it comes off the board toward you: its title, who asked it, what it is, and its tasks as a
 * small tree joined by red thread, the task done last at the top and what must come before it beneath it, each with
 * where it stands in words and how far along it is when it is counted. Touch a task and a pencilled slip says where it
 * stands, with the lines that set about it; touching one writes it on your pad. Touch anywhere else and the slip goes
 * back on the board.
 *
 * Nothing here judges anything: every word on a slip and every line is the game's.
 */
import { Group, Mesh, Vector3, type MeshStandardMaterial } from "three";
import type { QuestTask, Show } from "../../game/system.js";
import { sound } from "../sound.js";
import { mk, rng, woodCanvas, type Canvas } from "../textures.js";
import { ease } from "../track.js";
import { Choices, fitName, fitText, INK, INK_FONT, Label, PALETTE, paper, PENCIL, PENCIL_FONT, PropBase, wrapLines, type Lay, type Part, type PropHost } from "./base.js";

type BoardShow = Extract<Show, { kind: "quests" }>;
type Quest = BoardShow["quests"][number];

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** The words of the board's own marks: what is pencilled on the slips along its foot. */
export const BOARD_SAYS = {
  more: (page: number, pages: number): string => `more (${page} of ${pages}) ›`,
  own: (say: string): string => `+ ${say}`,
} as const;

/* The board, in its face's own space: x across, y up the face from its foot, z out of it toward you. */
const FACE_W = 0.2;
const FACE_H = 0.16;
const RAIL = 0.011;
/** The wide rail along its foot, where the slip for a quest of your own and the pencilled "more" are pinned. */
const FOOT = 0.03;
const CORK_TOP = FACE_H - RAIL;
const SLIP_W = 0.082;
const SLIP_H = 0.034;
const PER_PAGE = 6;
/** How far the board leans back, and where its face stands on its feet (in the board's own space). */
const LEAN = 0.2;
const FACE_AT = V(0, 0.009, 0.008);
/** Where a slip's pin is, below the top of the slip. */
const PIN_DOWN = 0.0032;
const TAB_W = 0.084;
const TAB_H = 0.02;

/** Inks for where a task stands, after the colours the game this follows gives each state (green done, grey failed, orange blocked, yellow open). */
const STATE_INK: Record<QuestTask["state"], string> = { open: "#5c4710", waiting: "#5c4710", blocked: "#a1501a", done: "#2f6a29", closed: "#7b756b" };
const END_INK: Record<Quest["state"], string> = { open: INK, done: "#2f6a29", lost: "#6a2016", dropped: "#5f5a52" };
const THREAD = "#8a2c20";

/** Where the slip at this place on a page has its pin, in the face's space. */
function slotAt(i: number): Vector3 {
  const c = i % 2, r = Math.floor(i / 2);
  return V((c ? 1 : -1) * 0.0445, CORK_TOP - 0.0045 - r * (SLIP_H + 0.004) - PIN_DOWN, 0.0016);
}

interface Slip {
  q: Quest;
  /** At the pin: where it is going, on the face. */
  hold: Group;
  /** Swings about the pin. */
  sheet: Group;
  label: Label;
  pin: Mesh;
  seal: Group;
  drawn: string;
  /** Whether it was last drawn with the red band of a quest not yet looked at. */
  drawnFresh: boolean;
  seed: number;
  /** How far it hangs askew now (it eases to its seed, or further when torn). */
  tilt: number;
  at: Vector3;
  /** On the page now. */
  on: boolean;
  /** Moves of its own: held up before it is pinned (1 to 0), shaken, sealed (0 to 1). */
  drop: number;
  shake: number;
  stamp: number;
  /** Shown with a red pin and a red band along its top: begun and not yet looked at. */
  fresh: boolean;
}

interface Row {
  id: string;
  /** Its middle and how tall it is, in metres from the top of the slip. */
  mid: number;
  h: number;
}

export class Board extends PropBase {
  readonly key = "board";
  readonly name = "Your quests";

  private data: BoardShow | null = null;
  private slips = new Map<string, Slip>();
  /** Every quest the board has shown, and those it has been looked at with. */
  private known = new Set<string>();
  private seen = new Set<string>();
  private first = true;
  private page = 0;
  private pages = 1;
  private over: string | null = null;

  private face = new Group();
  private brass: MeshStandardMaterial;
  private red: MeshStandardMaterial;
  private wax: MeshStandardMaterial;
  private waxLight: MeshStandardMaterial;
  private own: Label;
  private more: Label;
  private tabsKey = "";

  /* The slip brought forward to be read, and the pencilled slip for a task on it. */
  private picked: string | null = null;
  private task: string | null = null;
  /** The quest whose slip is off the board (it may be on its way back). */
  private lifted: string | null = null;
  private pickK = 0;
  private card: Label | null = null;
  private cardKey = "";
  private cardHold = new Group();
  private rows: Row[] = [];
  private cardW = 0.165;
  private cardS = 0.0066;
  private cardDeep = 0.1;
  /** The most a forward slip may be tall, how far toward you it comes and how far it leans back to face you. */
  private bandH = 0.2;
  private forwardZ = 0.07;
  private tilt = 0.34;
  private cardX = 0;
  private chooser: Choices;
  private chooserK = 0;

  constructor(h: PropHost) {
    super(h);
    const k = this.kit;
    const oak = k.skin(woodCanvas(256, 48, { planks: 1, seed: 141, dark: [58, 34, 18], light: [128, 84, 46] }), { rough: 0.7 });
    const oakDark = k.skin(woodCanvas(128, 48, { planks: 1, seed: 143, dark: [40, 24, 13], light: [92, 60, 34] }), { rough: 0.75 });
    const cork = k.skin(corkCanvas(151), { rough: 0.95 });
    this.brass = k.metal(PALETTE.brass, 0.38);
    this.red = k.paint(0xb4321e, 0.5);
    this.red.emissiveIntensity = 0.3;
    this.wax = k.paint(0x7a2116, 0.42);
    this.waxLight = k.paint(0x9a3220, 0.4);

    // The face: a cork panel in a frame, a wide rail along its foot.
    this.face.position.copy(FACE_AT);
    this.face.rotation.x = -LEAN;
    const corkPanel = k.box(FACE_W - RAIL * 1.6, CORK_TOP - FOOT + 0.004, 0.006, cork, 0.001);
    corkPanel.position.set(0, (CORK_TOP + FOOT) / 2, -0.002);
    this.face.add(corkPanel);
    for (const x of [-1, 1]) {
      const stile = k.crook(k.box(RAIL, FACE_H, 0.014, oak, 0.0025), 5 + x, 0.0006);
      stile.position.set(x * (FACE_W / 2 - RAIL / 2), FACE_H / 2, 0);
      this.face.add(stile);
    }
    const top = k.crook(k.box(FACE_W + 0.006, RAIL, 0.016, oak, 0.003), 9, 0.0006);
    top.position.set(0, FACE_H - RAIL / 2, 0);
    const foot = k.crook(k.box(FACE_W, FOOT, 0.015, oak, 0.003), 11, 0.0006);
    foot.position.set(0, FOOT / 2, 0);
    this.face.add(top, foot);
    // Brass caps on the top rail's ends.
    for (const x of [-1, 1]) {
      const cap = k.disc(0.0042, 0.003, this.brass, 10);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(x * (FACE_W / 2 - RAIL / 2), FACE_H - RAIL / 2, 0.008);
      this.face.add(cap);
    }
    this.group.add(this.face);

    // Two feet it stands in, and a pencil left on the table before it.
    for (const x of [-1, 1]) {
      const f = k.crook(k.taper(k.box(0.02, 0.016, 0.085, oakDark, 0.004), 0.25, 0.3), 21 + x, 0.0008);
      f.position.set(x * (FACE_W / 2 - RAIL / 2), 0.008, -0.004);
      this.group.add(f);
    }
    const pencil = new Group();
    const shaft = k.disc(0.0027, 0.068, k.paint(0x6e4a22, 0.6), 6);
    const tip = k.disc(0.0027, 0.011, k.paint(PALETTE.oakLight, 0.8), 6, 0.0006);
    tip.position.y = 0.068;
    const lead = k.disc(0.0007, 0.003, k.paint(0x2a2a2e, 0.5), 6, 0.0001);
    lead.position.y = 0.0785;
    pencil.add(shaft, tip, lead);
    pencil.rotation.set(0, 0, -Math.PI / 2);
    pencil.position.set(-0.03, 0.0027, 0.034);
    const pencilTurn = new Group();
    pencilTurn.rotation.y = 0.32;
    pencilTurn.add(pencil);
    this.group.add(pencilTurn);

    // The slips along the foot: one for a quest of your own, and the pencilled "more".
    this.own = new Label(TAB_W, TAB_H, { px: 3000, clear: true });
    this.more = new Label(TAB_W, TAB_H, { px: 3000, clear: true });
    for (const [l, x] of [[this.own, -0.049], [this.more, 0.049]] as const) {
      l.glow = 0.14;
      l.mesh.castShadow = true;
      l.mesh.position.set(x, FOOT / 2, 0.0082);
      this.face.add(l.mesh);
    }

    // The slip brought forward, and the pencilled slip for a task on it.
    this.cardHold.visible = false;
    this.group.add(this.cardHold);
    this.chooser = new Choices(0.14, 0.0066);
    this.chooser.group.visible = false;
    this.group.add(this.chooser.group);
  }

  /* ------------------------------------------------- what the game shows ------------------------------------------------- */

  show(shows: readonly Show[]): boolean {
    const next = shows.find((s): s is BoardShow => s.kind === "quests") ?? null;
    const before = this.data;
    this.data = next;
    if (!next || !next.quests.length) {
      for (const slip of this.slips.values()) this.dropSlip(slip);
      this.slips.clear();
      this.picked = this.task = this.lifted = null;
      this.data = null;
      return false;
    }
    const had = new Map((before?.quests ?? []).map((q) => [q.id, q]));
    for (const [id, slip] of this.slips) {
      if (next.quests.some((q) => q.id === id)) continue;
      this.dropSlip(slip);
      this.slips.delete(id);
    }
    let stagger = 0;
    next.quests.forEach((q) => {
      let slip = this.slips.get(q.id);
      if (!slip) slip = this.makeSlip(q);
      const was = had.get(q.id);
      slip.q = q;
      // A quest the board has not shown before is new, and so is one just begun when the board first comes out.
      const isNew = !this.known.has(q.id) && (!this.first || q.fresh);
      this.known.add(q.id);
      if (isNew) slip.fresh = true;
      if (q.state !== "open") slip.fresh = false;
      if (!this.first && !was && isNew) this.pinned(slip, stagger++);
      else if (was) {
        if (was.state === "open" && q.state !== "open") this.ended(slip, q.state, stagger++);
        else if (doneOf(q) > doneOf(was)) this.ticked(slip, stagger++);
      }
      if (q.state === "done" && (!was || was.state === "done")) slip.stamp = 1;
    });
    this.first = false;
    if (this.picked && !this.slips.has(this.picked)) this.picked = this.task = null;
    if (this.lifted && !this.slips.has(this.lifted)) this.lifted = null;
    if (this.task && !this.pickedQuest()?.tasks.some((t) => t.id === this.task)) this.task = null;
    this.arrange();
    return true;
  }

  private makeSlip(q: Quest): Slip {
    const k = this.kit;
    const hold = new Group();
    const sheet = new Group();
    const label = new Label(SLIP_W, SLIP_H, { px: 3000, clear: true });
    label.glow = 0.13;
    label.mesh.castShadow = true;
    label.mesh.position.set(0, -SLIP_H / 2 + PIN_DOWN, 0);
    sheet.add(label.mesh);
    const pin = k.lathe([[0, 0], [0.0012, 0], [0.0012, 0.0016], [0.0032, 0.0022], [0.0034, 0.0034], [0.0022, 0.0046], [0, 0.0048]], this.brass, 10);
    pin.rotation.x = Math.PI / 2;
    pin.position.z = 0.0002;
    // The wax seal of a quest achieved, at the slip's lower right.
    const seal = new Group();
    const blob = k.crook(k.lathe([[0, 0], [0.0078, 0], [0.0084, 0.0008], [0.0076, 0.0016], [0.0052, 0.002], [0, 0.0021]], this.wax, 12), q.id.length + 3, 0.0005);
    const ring = k.lathe([[0.0036, 0.0019], [0.0046, 0.0024], [0.0036, 0.0029]], this.waxLight, 12);
    seal.add(blob, ring);
    seal.rotation.x = Math.PI / 2;
    seal.position.set(SLIP_W / 2 - 0.0115, -SLIP_H + PIN_DOWN + 0.0115, 0.0004);
    seal.visible = false;
    sheet.add(seal);
    hold.add(sheet, pin);
    hold.visible = false;
    this.face.add(hold);
    const r = rng(500 + [...q.id].reduce((n, c) => n * 31 + c.charCodeAt(0), 7) % 9973);
    const seed = (r() - 0.5) * 0.1;
    const slip: Slip = { q, hold, sheet, label, pin, seal, drawn: "", drawnFresh: false, seed, tilt: seed, at: V(0, 0, 0), on: false, drop: 0, shake: 0, stamp: 0, fresh: false };
    this.slips.set(q.id, slip);
    return slip;
  }

  private dropSlip(slip: Slip): void {
    this.face.remove(slip.hold);
    slip.label.dispose();
  }

  /** A new quest's slip is pinned up: it comes down onto the board and the pin goes in. */
  private pinned(slip: Slip, n: number): void {
    slip.drop = 1;
    const x = this.group.position.x;
    void this.h.tracks.run([
      { dur: n * 0.18 },
      { dur: 0.42, begin: () => sound.play("slide", { x, gain: 0.3, rate: 1.3 }), tick: (u) => (slip.drop = 1 - ease(u)) },
      { dur: 0, begin: () => sound.play("tap", { x, gain: 0.5 }) },
    ]);
  }

  /** A task done: the slip shakes as its tick goes on. */
  private ticked(slip: Slip, n: number): void {
    const x = this.group.position.x;
    void this.h.tracks.run([{ dur: n * 0.18 }, { dur: 0.55, begin: () => sound.play("scratch", { x, gain: 0.5, rate: 1.2 }), tick: (u) => (slip.shake = Math.sin(u * Math.PI * 4) * (1 - u)) }]);
  }

  /** A quest ended: sealed with wax when achieved, torn when lost, struck through when given up. */
  private ended(slip: Slip, state: Quest["state"], n: number): void {
    const x = this.group.position.x;
    if (state === "done") {
      slip.stamp = 0;
      void this.h.tracks.run([{ dur: n * 0.18 + 0.15 }, { dur: 0.32, tick: (u) => (slip.stamp = ease(u)) }, { dur: 0.3, begin: () => sound.play("knock", { x, gain: 0.55, rate: 1.15 }), tick: (u) => (slip.shake = Math.sin(u * Math.PI * 2) * (1 - u) * 0.6) }]);
    } else {
      const torn = state === "lost";
      void this.h.tracks.run([{ dur: n * 0.18 }, { dur: 0.6, begin: () => sound.play(torn ? "tear" : "scratch", { x, gain: 0.55 }), tick: (u) => (slip.shake = Math.sin(u * Math.PI * 3) * (1 - u) * (torn ? 1.4 : 0.7)) }]);
    }
  }

  /* ------------------------------------------------- opening and closing ------------------------------------------------- */

  place(lay: Lay, narrow: boolean): void {
    super.place(lay, narrow);
    // The forward slip is drawn larger where the whole picture is smaller, and an upright view has more height for it.
    this.cardW = narrow ? 0.19 : 0.165;
    this.cardS = narrow ? 0.0098 : 0.0066;
    this.bandH = narrow ? 0.3 : 0.205;
    this.forwardZ = narrow ? 0.085 : 0.07;
    this.tilt = narrow ? 0.38 : 0.34;
    this.group.remove(this.chooser.group);
    this.chooser.dispose();
    this.chooser = new Choices(narrow ? 0.16 : 0.12, narrow ? 0.0085 : 0.0066);
    this.chooser.group.visible = false;
    this.group.add(this.chooser.group);
    this.cardKey = "";
    this.arrange();
  }

  open(): void {
    super.open();
    this.page = 0;
    this.picked = this.task = null;
    this.arrange();
    sound.play("pat", { x: this.group.position.x, gain: 0.4, rate: 0.85 });
    const d = this.data;
    if (d) this.h.tell(`${this.name}, open. ${d.quests.map((q) => `${q.title}${q.state === "open" ? "" : `, ${q.end ?? ""}`}`).join("; ")}.`);
  }

  close(): void {
    if (!this.isOpen) return;
    super.close();
    this.picked = this.task = null;
    this.over = null;
    // Looked at: what was new is new no longer.
    for (const slip of this.slips.values()) {
      if (slip.on && slip.fresh) this.seen.add(slip.q.id);
      if (this.seen.has(slip.q.id)) slip.fresh = false;
    }
    this.page = 0;
    this.arrange();
    sound.play("pat", { x: this.group.position.x, gain: 0.3, rate: 1.1 });
  }

  /* ------------------------------------------------- laying it out ------------------------------------------------- */

  private pickedQuest(): Quest | undefined {
    return this.picked ? this.slips.get(this.picked)?.q : undefined;
  }

  /** Which slips are on the board now, each slip drawn as it stands, the forward slip and the pencilled one. */
  private arrange(): void {
    const d = this.data;
    if (!d) return;
    const order = d.quests;
    this.pages = Math.max(1, Math.ceil(order.length / PER_PAGE));
    this.page = Math.max(0, Math.min(this.pages - 1, this.page));
    order.forEach((q, i) => {
      const slip = this.slips.get(q.id)!;
      slip.on = Math.floor(i / PER_PAGE) === this.page;
      slip.at.copy(slotAt(i % PER_PAGE));
      this.drawSlip(slip);
    });
    this.drawTabs();
    const q = this.pickedQuest();
    if (q) {
      this.lifted = q.id;
      this.drawCard(q);
    }
    const t = q && this.task ? q.tasks.find((x) => x.id === this.task) : undefined;
    if (t) this.chooser.set(t.text, t.note, t.progress ?? "", t.choices.map((c) => c.say));
    this.cardX = this.narrow || !t ? 0 : -0.07;
  }

  /** A slip on the board: its title, and a mark for each task, or how it ended. */
  private drawSlip(slip: Slip): void {
    const q = slip.q;
    const fresh = slip.fresh;
    const key = `${q.title}|${q.state}|${q.end ?? ""}|${q.tasks.map((t) => t.state[0]).join("")}|${this.over === `slip:${q.id}` ? 1 : 0}|${fresh ? 1 : 0}`;
    if (key === slip.drawn) return;
    slip.drawn = key;
    slip.drawnFresh = fresh;
    const ended = q.state !== "open";
    const lit = this.over === `slip:${q.id}`;
    slip.label.draw((g, w, h) => {
      const pad = h * 0.13;
      g.save();
      g.beginPath();
      if (q.state === "lost") {
        // Torn off below its words, ragged: what is left hangs crooked from its pin.
        const r = rng(q.id.length * 17 + 3);
        g.moveTo(1, 1);
        g.lineTo(w - 1, 1);
        g.lineTo(w - 1, h * 0.8);
        for (let i = 1; i <= 12; i++) g.lineTo(w - 1 - (w * i) / 12, h * (0.8 + i * 0.012) + (r() - 0.5) * h * 0.09);
        g.lineTo(1, h * 0.97);
      } else g.rect(1, 1, w - 2, h - 2);
      g.closePath();
      g.clip();
      paper(g, w, h, 300 + q.id.length * 13, ended ? "#c7b28a" : lit ? "#ece2c4" : "#e2d6b4");
      // A quest not yet looked at has a red band along its top.
      if (fresh) {
        g.fillStyle = "rgba(170,40,24,0.9)";
        g.fillRect(0, 0, w, h * 0.1);
      }
      g.restore();
      g.strokeStyle = "rgba(36,22,12,0.4)";
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = ended ? "rgba(36,22,12,0.82)" : INK;
      fitName(g, q.title, pad, h * 0.36, w - pad * 2, h * 0.3, h * 0.17, "italic 700");
      if (q.state === "dropped") {
        // Struck through in pencil.
        g.strokeStyle = "rgba(52,53,59,0.85)";
        g.lineWidth = Math.max(2, h * 0.035);
        g.beginPath();
        g.moveTo(pad * 0.6, h * 0.42);
        g.lineTo(w - pad * 0.6, h * 0.3);
        g.stroke();
      }
      if (ended) {
        g.fillStyle = END_INK[q.state];
        fitText(g, q.end ?? "", pad, q.state === "lost" ? h * 0.7 : h * 0.8, w - pad * 2 - (q.state === "done" ? h * 0.55 : 0), h * 0.17, h * 0.11, "italic 600");
        return;
      }
      // A mark for each task: ticked when done, crossed when closed, barred when out of reach.
      const n = Math.min(q.tasks.length, 11);
      const step = Math.min(h * 0.24, (w - pad * 2) / Math.max(1, n));
      q.tasks.slice(0, n).forEach((t, i) => mark(g, t.state, pad + step * (i + 0.5), h * 0.78, h * 0.085, false));
    });
  }

  /** The two slips along the foot: a quest of your own, and "more" when there are more slips than the board holds. */
  private drawTabs(): void {
    const d = this.data!;
    const key = `${d.own.say}|${this.page}|${this.pages}|${this.over}`;
    if (key === this.tabsKey) return;
    this.tabsKey = key;
    const tab = (l: Label, text: string, lit: boolean, seed: number): void =>
      l.draw((g, w, h) => {
        g.save();
        g.beginPath();
        g.rect(2, 2, w - 4, h - 4);
        g.clip();
        paper(g, w, h, seed, lit ? "#efe6c9" : "#ddd0ac");
        g.restore();
        g.strokeStyle = "rgba(36,22,12,0.35)";
        g.lineWidth = 2;
        g.strokeRect(2, 2, w - 4, h - 4);
        g.fillStyle = PENCIL;
        g.textAlign = "center";
        fitText(g, text, w / 2, h * 0.7, w - 16, h * 0.56, h * 0.32, lit ? "700" : "600", PENCIL_FONT);
      });
    tab(this.own, BOARD_SAYS.own(d.own.say), this.over === "own", 77);
    tab(this.more, BOARD_SAYS.more(this.page + 1, this.pages), this.over === "more", 79);
    this.more.mesh.visible = this.pages > 1;
  }

  /**
   * The slip brought forward: its title, who asked it, what it is, and its tasks as a tree joined by thread, or how it
   * ended. Its rows are measured as it is drawn, to be touched.
   */
  /** How tall the forward slip may be: on an upright view, less while a task's pencilled slip is out below it. */
  private band(): number {
    return this.narrow && this.task ? this.bandH - 0.05 : this.bandH;
  }

  private drawCard(q: Quest): void {
    const key = `${JSON.stringify(q)}|${this.cardW}|${this.cardS}|${this.over}|${this.task}`;
    if (key === this.cardKey && this.card) return;
    this.cardKey = key;
    const px = 3000;
    const W = Math.round(this.cardW * px);
    // As large as lets the whole slip be seen at once; smaller, and then shorter, when there is much on it.
    let s = this.cardS * px;
    let compact = false;
    const band = this.band();
    let laid = layCard(null, q, W, s, compact, null, null);
    for (let i = 0; i < 8 && laid.h > band * px; i++) {
      s *= 0.94;
      laid = layCard(null, q, W, s, compact, null, null);
    }
    if (laid.h > band * px) {
      compact = true;
      laid = layCard(null, q, W, s, compact, null, null);
    }
    const deep = Math.min(band, laid.h / px);
    if (!this.card || Math.abs(this.card.h - deep) > 1e-6 || Math.abs(this.card.w - this.cardW) > 1e-6) {
      if (this.card) {
        this.cardHold.remove(this.card.mesh);
        this.card.dispose();
      }
      this.card = new Label(this.cardW, deep, { px, clear: true });
      this.card.glow = 0.17;
      this.card.mesh.castShadow = true;
      this.cardHold.add(this.card.mesh);
    }
    this.cardDeep = deep;
    let rows: Row[] = [];
    this.card.draw((g) => {
      rows = layCard(g, q, W, s, compact, this.over?.startsWith("task:") ? this.over.slice(5) : null, this.task).rows;
    });
    this.rows = rows.map((r) => ({ id: r.id, mid: r.mid / px, h: r.h / px }));
  }

  /* ------------------------------------------------- touching ------------------------------------------------- */

  parts(): Part[] {
    const d = this.data;
    if (!this.isOpen || !d) return [];
    const out: Part[] = [];
    if (this.picked) {
      if (this.pickK < 0.6) return [];
      if (this.task) out.push(...this.chooser.parts());
      for (const r of this.rows) out.push(this.partAt(`task:${r.id}`, 0, this.cardDeep / 2 - r.mid, 0.001, Math.max(r.h * 0.55, this.cardW * 0.46), this.cardHold));
      // Anywhere else puts it back.
      out.push({ ...this.partAt("back", 0, 0, 0, 0.5, this.cardHold), under: true });
      return out;
    }
    for (const slip of this.slips.values()) {
      if (!slip.on) continue;
      out.push(this.partAt(`slip:${slip.q.id}`, slip.at.x, slip.at.y - SLIP_H / 2 + PIN_DOWN, 0.003, SLIP_W * 0.5, this.face));
    }
    out.push(this.partAt("own", this.own.mesh.position.x, this.own.mesh.position.y, 0.009, TAB_W * 0.5, this.face));
    if (this.pages > 1) out.push(this.partAt("more", this.more.mesh.position.x, this.more.mesh.position.y, 0.009, TAB_W * 0.5, this.face));
    return out;
  }

  hover(id: string | null): void {
    if (id === this.over) return;
    this.over = id;
    this.chooser.hover(id);
    this.arrange();
  }

  touch(id: string): void {
    const d = this.data;
    if (!d) return;
    const x = this.group.position.x;
    if (id.startsWith("choice:")) {
      const t = this.pickedQuest()?.tasks.find((t) => t.id === this.task);
      const c = t?.choices[Number(id.slice(7))];
      if (c) this.h.write(c.line);
      return;
    }
    if (id.startsWith("slip:")) {
      const slip = this.slips.get(id.slice(5));
      if (!slip?.on) return;
      this.picked = slip.q.id;
      this.task = null;
      this.seen.add(slip.q.id);
      slip.fresh = false;
      sound.play("pat", { x, gain: 0.5, rate: 1.05 });
      this.arrange();
      const q = slip.q;
      this.h.tell(`${q.title}. ${q.from ? `${q.from}. ` : ""}${q.text} ${q.end ?? ""} ${q.tasks.map((t) => `${t.text}: ${t.note}${t.progress ? ` ${t.progress}` : ""}`).join(" ")}`);
      return;
    }
    if (id.startsWith("task:")) {
      const key = id.slice(5);
      const t = this.pickedQuest()?.tasks.find((x) => x.id === key);
      if (!t) return;
      this.task = this.task === key ? null : key;
      sound.play("pat", { x, gain: 0.4, rate: 1.2 });
      this.arrange();
      if (this.task) this.h.tell(`${t.text}. ${t.note} ${t.progress ?? ""}${t.choices.length ? ` You can: ${t.choices.map((c) => c.say).join("; ")}.` : ""}`);
      return;
    }
    if (id === "back") {
      if (this.task) this.task = null;
      else this.picked = null;
      this.arrange();
      return;
    }
    if (id === "own") {
      this.h.write(d.own.line);
      return;
    }
    if (id === "more") {
      this.page = (this.page + 1) % this.pages;
      sound.play("slide", { x, gain: 0.35, rate: 1.3 });
      this.arrange();
    }
  }

  /** For checks: what is on the board and what is brought forward. */
  get state(): { open: boolean; slips: string[]; fresh: string[]; page: number; pages: number; picked: string | null; task: string | null; rows: string[]; choices: number } {
    const on = (this.data?.quests ?? []).map((q) => this.slips.get(q.id)!).filter((s) => s?.on);
    return { open: this.isOpen, slips: on.map((s) => s.q.id), fresh: on.filter((s) => s.fresh).map((s) => s.q.id), page: this.page, pages: this.pages, picked: this.picked, task: this.task, rows: this.picked ? this.rows.map((r) => r.id) : [], choices: this.task ? this.chooser.count : 0 };
  }

  /* ------------------------------------------------- every frame ------------------------------------------------- */

  update(dt: number, t: number): void {
    const still = this.h.reduced;
    const to = (now: number, want: number, rate: number): number => (still || Math.abs(want - now) < 0.0004 ? want : now + (want - now) * Math.min(1, dt * rate));
    // The slips go to their places on the board and hang from their pins.
    for (const [id, slip] of this.slips) {
      const away = id === this.lifted && this.pickK > 0.02;
      const shown = slip.on && !away;
      const fresh = !slip.hold.visible;
      slip.hold.visible = shown;
      if (!shown) continue;
      // Lifted off the cork when pointed at, and while it moves to another place, so slips crossing pass over each other.
      const moving = Math.min(0.006, Math.hypot(slip.hold.position.x - slip.at.x, slip.hold.position.y - slip.at.y) * 0.25);
      const pointed = this.over === `slip:${id}`;
      const lift = (pointed ? 0.004 : 0) + (fresh ? 0 : moving * (0.5 + (slip.seed + 0.05) * 10));
      const rate = fresh ? 1e9 : 9;
      slip.hold.position.x = to(slip.hold.position.x, slip.at.x, rate);
      slip.hold.position.y = to(slip.hold.position.y, slip.at.y + slip.drop * 0.035, rate);
      slip.hold.position.z = to(slip.hold.position.z, slip.at.z + lift + slip.drop * 0.03, rate);
      slip.hold.scale.setScalar(1 + slip.drop * 0.18);
      const crooked = slip.q.state === "lost" ? 0.26 * (slip.seed < 0 ? -1 : 1) : 0;
      // A new slip stirs a little on its pin, as if in a draught, so it is seen from the chair.
      const stir = slip.fresh && !still ? Math.sin(t * 2.3 + slip.seed * 40) * 0.04 : 0;
      slip.tilt = to(slip.tilt, slip.seed + crooked, 6);
      slip.sheet.rotation.z = slip.tilt + slip.shake * 0.14 + stir;
      if (slip.drawnFresh !== slip.fresh) this.drawSlip(slip);
      slip.pin.material = slip.fresh ? this.red : this.brass;
      slip.label.glow = 0.13 + (pointed ? 0.1 : 0) + (slip.fresh ? 0.04 : 0);
      const sealed = slip.q.state === "done";
      slip.seal.visible = sealed && slip.stamp > 0.01;
      if (sealed) {
        const k = ease(Math.min(1, slip.stamp));
        slip.seal.scale.setScalar(1.9 - 0.9 * k);
        slip.seal.position.z = 0.0004 + (1 - k) * 0.02;
      }
    }
    // The slip brought forward, from its place on the board.
    this.pickK = to(this.pickK, this.picked && this.isOpen ? 1 : 0, this.picked ? 7 : 9);
    if (this.pickK <= 0.02 && !this.picked) this.lifted = null;
    const lifted = this.lifted ? this.slips.get(this.lifted) : undefined;
    this.cardHold.visible = !!lifted && !!this.card && this.pickK > 0.02;
    if (this.cardHold.visible && lifted) {
      const k = ease(this.pickK);
      // Where its slip hangs on the board, in the board's space.
      const c = lifted.at.clone().add(V(0, -SLIP_H / 2 + PIN_DOWN, 0.002));
      const from = V(FACE_AT.x + c.x, FACE_AT.y + c.y * Math.cos(LEAN) + c.z * Math.sin(LEAN), FACE_AT.z - c.y * Math.sin(LEAN) + c.z * Math.cos(LEAN));
      // Brought toward you and up into the middle of what you see, its foot clear of the table.
      const cosT = Math.cos(this.tilt);
      // On an upright view its top stays where it is, so the pencilled slip for a task has the room below it.
      const yc = this.narrow ? 0.008 + this.bandH * cosT - (this.cardDeep * cosT) / 2 : 0.008 + (this.cardDeep * cosT) / 2 + ((this.bandH - this.cardDeep) * cosT) / 2;
      const want = V(this.cardX, yc, this.forwardZ);
      this.cardHold.position.set(from.x + (want.x - from.x) * k, from.y + (want.y - from.y) * k + Math.sin(Math.PI * k) * 0.012, from.z + (want.z - from.z) * k + Math.sin(Math.PI * k) * 0.015);
      this.cardHold.rotation.set(-LEAN + (LEAN - this.tilt) * k, 0, lifted.seed * (1 - k));
      // It is drawn at its own size forward; at the board it is the size of its slip.
      this.cardHold.scale.setScalar(SLIP_W / this.cardW + (1 - SLIP_W / this.cardW) * k);
    }
    // The pencilled slip for a task: beside the forward slip, or over its foot on an upright view.
    this.chooserK = to(this.chooserK, this.task && this.picked && this.isOpen ? 1 : 0, 10);
    this.chooser.group.visible = this.chooserK > 0.02 && this.cardHold.visible;
    if (this.chooser.group.visible) {
      const cosT = Math.cos(this.tilt);
      const cardTop = this.cardHold.position.y + (this.cardDeep / 2) * cosT;
      const deep = this.chooser.deep;
      let yc: number, x: number, z: number, lean: number;
      if (this.narrow) {
        // On an upright view, nearer you than the forward slip and low, leaning back further: it is seen under it.
        lean = 0.75;
        yc = 0.012 + (deep / 2) * Math.cos(lean);
        x = 0;
        z = this.forwardZ + 0.13;
      } else {
        // Up over the right half of the cork beside the forward slip, level with its top: clear of the narrator's hand
        // and the table's edge, which stand lower in the picture.
        lean = this.tilt;
        yc = cardTop + 0.006 - (deep / 2) * cosT;
        x = this.cardHold.position.x + this.cardW / 2 + 0.006 + this.chooser.w / 2;
        z = this.forwardZ + 0.006;
      }
      this.chooser.group.position.set(x, yc, z);
      this.chooser.group.rotation.set(Math.PI / 2 - lean, 0, 0);
      this.chooser.group.scale.setScalar(0.75 + 0.25 * ease(this.chooserK));
    }
    // The pencilled slips along the foot lift when pointed at.
    this.own.mesh.position.z = to(this.own.mesh.position.z, 0.0082 + (this.over === "own" ? 0.003 : 0), 10);
    this.more.mesh.position.z = to(this.more.mesh.position.z, 0.0082 + (this.over === "more" ? 0.003 : 0), 10);
  }

  dispose(): void {
    for (const slip of this.slips.values()) slip.label.dispose();
    this.card?.dispose();
    this.chooser.dispose();
    this.own.dispose();
    this.more.dispose();
    super.dispose();
  }
}

/* ------------------------------------------------- drawing ------------------------------------------------- */

/** Tasks done in a quest. */
const doneOf = (q: Quest): number => q.tasks.filter((t) => t.state === "done").length;

/** Cork: warm brown, flecked light and dark, pricked by old pins. */
function corkCanvas(seed: number): Canvas {
  const [c, g] = mk(512, 384);
  g.fillStyle = "#8c6239";
  g.fillRect(0, 0, 512, 384);
  const r = rng(seed);
  for (let i = 0; i < 9000; i++) {
    const light = r() < 0.45;
    g.fillStyle = light ? `rgba(214,170,112,${0.18 + r() * 0.3})` : `rgba(52,30,14,${0.15 + r() * 0.3})`;
    const s = 1 + r() * 2.6;
    g.fillRect(r() * 512, r() * 384, s, s * (0.6 + r() * 0.8));
  }
  for (let i = 0; i < 70; i++) {
    g.fillStyle = "rgba(30,16,6,0.6)";
    g.beginPath();
    g.arc(r() * 512, r() * 384, 1.3 + r() * 1.2, 0, Math.PI * 2);
    g.fill();
  }
  const edge = g.createRadialGradient(256, 192, 120, 256, 192, 330);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(40,20,5,0.35)");
  g.fillStyle = edge;
  g.fillRect(0, 0, 512, 384);
  return c;
}

/** The mark for where a task stands: a ring to do, ticked done, crossed closed, barred out of reach. */
function mark(g: CanvasRenderingContext2D, state: QuestTask["state"], x: number, y: number, r: number, bold: boolean): void {
  g.strokeStyle = STATE_INK[state];
  g.fillStyle = STATE_INK[state];
  g.lineWidth = Math.max(1.5, r * (bold ? 0.36 : 0.28));
  g.lineCap = "round";
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  if (state === "done") {
    g.lineWidth = Math.max(2, r * 0.42);
    g.moveTo(x - r * 0.55, y + r * 0.05);
    g.lineTo(x - r * 0.1, y + r * 0.5);
    g.lineTo(x + r * 0.95, y - r * 0.85);
    g.stroke();
  } else if (state === "closed") {
    g.moveTo(x - r * 0.55, y - r * 0.55);
    g.lineTo(x + r * 0.55, y + r * 0.55);
    g.moveTo(x + r * 0.55, y - r * 0.55);
    g.lineTo(x - r * 0.55, y + r * 0.55);
    g.stroke();
  } else if (state === "blocked") {
    g.moveTo(x - r * 0.6, y);
    g.lineTo(x + r * 0.6, y);
    g.stroke();
  } else if (state === "waiting") {
    g.arc(x, y, r * 0.3, 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * Lay out (and, given a pen, draw) the slip brought forward, `w` pixels across with writing `s` pixels tall: returns
 * how tall it is and where each task's row is. Drawn with `over` lit and `chosen` marked.
 */
function layCard(g0: CanvasRenderingContext2D | null, q: Quest, w: number, s: number, compact: boolean, over: string | null, chosen: string | null): { h: number; rows: { id: string; mid: number; h: number }[] } {
  const g = g0 ?? mk(8, 8)[1];
  const draw = !!g0;
  const pad = s * 1.05;
  const width = w - pad * 2;
  const ended = q.state !== "open";
  const H = g0 ? g0.canvas.height : 0;
  if (draw) {
    g.save();
    g.beginPath();
    if (q.state === "lost") {
      const r = rng(q.id.length * 17 + 3);
      g.moveTo(1, 1);
      g.lineTo(w - 1, 1);
      g.lineTo(w - 1, H * 0.8);
      for (let i = 1; i <= 16; i++) g.lineTo(w - 1 - (w * i) / 16, H * (0.8 + i * 0.011) + (r() - 0.5) * s * 0.9);
      g.lineTo(1, H - 1);
    } else g.rect(1, 1, w - 2, H - 2);
    g.closePath();
    g.clip();
    paper(g, w, H, 400 + q.id.length * 11, ended ? "#d2bf98" : "#e6dbbc");
    g.restore();
    g.strokeStyle = "rgba(36,22,12,0.45)";
    g.lineWidth = 2.5;
    g.stroke();
    // The pin hole it came off by.
    g.fillStyle = "rgba(40,25,12,0.55)";
    g.beginPath();
    g.arc(w / 2, s * 0.55, s * 0.16, 0, Math.PI * 2);
    g.fill();
  }
  let y = pad;
  // The title, on one line or two.
  g.font = `italic 700 ${Math.round(s * 1.0)}px ${INK_FONT}`;
  const two = g.measureText(q.title).width > width;
  const titleH = two ? s * 2.5 : s * 1.75;
  if (draw) {
    g.fillStyle = ended ? "rgba(36,22,12,0.85)" : INK;
    fitName(g, q.title, pad, y + titleH / 2 - s * 0.1, width, s * 1.45, s * 1.0, "italic 700");
    if (q.state === "dropped") {
      g.strokeStyle = "rgba(52,53,59,0.85)";
      g.lineWidth = Math.max(2, s * 0.14);
      g.beginPath();
      g.moveTo(pad * 0.7, y + titleH * 0.62);
      g.lineTo(w - pad * 0.7, y + titleH * 0.4);
      g.stroke();
    }
  }
  y += titleH;
  if (q.from) {
    if (draw) {
      g.fillStyle = "rgba(36,22,12,0.7)";
      fitText(g, q.from, pad, y + s * 0.8, width, s * 0.86, s * 0.6, "italic 500");
    }
    y += s * 1.2;
  }
  g.font = `${Math.round(s * 0.9)}px ${INK_FONT}`;
  const goal = wrapLines(g, q.text, width, compact ? 1 : 3);
  for (const line of goal) {
    if (draw) {
      g.fillStyle = INK;
      g.fillText(line, pad, y + s * 0.95);
    }
    y += s * 1.25;
  }
  if (ended) {
    y += s * 0.4;
    g.font = `italic 700 ${Math.round(s * 1.02)}px ${INK_FONT}`;
    const sealRoom = q.state === "done" ? s * 3.2 : 0;
    const end = wrapLines(g, q.end ?? "", width - sealRoom, 2);
    const top = y;
    for (const line of end) {
      if (draw) {
        g.fillStyle = END_INK[q.state];
        g.fillText(line, pad, y + s * 1.0);
      }
      y += s * 1.32;
    }
    if (draw && q.state === "done") {
      // The seal pressed into it.
      const cx = w - pad - s * 1.4, cy = Math.max(top + s * 0.9, y - s * 0.9);
      g.fillStyle = "#7a2116";
      g.beginPath();
      for (let a = 0; a <= 18; a++) {
        const t = (a / 18) * Math.PI * 2;
        const rr = s * 1.25 * (1 + 0.08 * Math.sin(t * 5 + q.id.length));
        g.lineTo(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(220,140,110,0.5)";
      g.lineWidth = s * 0.12;
      g.beginPath();
      g.arc(cx, cy, s * 0.7, 0, Math.PI * 2);
      g.stroke();
    }
    return { h: Math.round(Math.max(y + pad * 0.8, s * 4)), rows: [] };
  }
  if (!q.tasks.length) return { h: Math.round(y + pad * 0.8), rows: [] };
  // A rule under the heading, then the tasks.
  y += s * 0.35;
  if (draw) {
    g.strokeStyle = "rgba(36,22,12,0.3)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(pad, y);
    g.lineTo(w - pad, y);
    g.stroke();
  }
  y += s * 0.45;
  // How deep each task lies: the tasks come from the top, each followed by those it needs.
  const depth = new Map<string, number>();
  const parent = new Map<string, string>();
  for (const t of q.tasks) {
    const d = depth.get(t.id) ?? 0;
    depth.set(t.id, d);
    for (const n of t.needs) {
      depth.set(n, d + 1);
      parent.set(n, t.id);
    }
  }
  const rows: { id: string; mid: number; h: number; mx: number; my: number; r: number }[] = [];
  const r = s * 0.42;
  for (const t of q.tasks) {
    const ind = Math.min(4, depth.get(t.id) ?? 0) * s * 1.45;
    const mx = pad + ind + r + 2, tx = mx + r + s * 0.5;
    const tw = w - pad - tx;
    g.font = `${t.main ? "700" : "500"} ${Math.round(s * 0.92)}px ${INK_FONT}`;
    const lines = wrapLines(g, t.text, tw, compact ? 1 : 2);
    const lh = s * 1.12;
    const top = y;
    // Where it stands, in words, under it: on two lines when it will not go on one.
    g.font = `italic 600 ${Math.round(s * 0.78)}px ${INK_FONT}`;
    const note = wrapLines(g, `${t.note}${t.progress ? `  ${t.progress}` : ""}`, tw, compact ? 1 : 2);
    const nh = s * 0.92;
    const rowH = lines.length * lh + note.length * nh + s * 0.35;
    g.font = `${t.main ? "700" : "500"} ${Math.round(s * 0.92)}px ${INK_FONT}`;
    const lit = t.id === over || t.id === chosen;
    if (draw) {
      if (lit) {
        g.fillStyle = t.id === chosen ? "rgba(60,35,10,0.16)" : "rgba(60,35,10,0.1)";
        g.fillRect(pad * 0.4, top - s * 0.1, w - pad * 0.8, rowH - s * 0.1);
      }
      g.fillStyle = t.state === "closed" ? "rgba(36,22,12,0.55)" : INK;
      lines.forEach((line, i) => {
        g.fillText(line, tx, top + s * 0.9 + i * lh);
        if (t.state === "closed") {
          g.strokeStyle = "rgba(36,22,12,0.5)";
          g.lineWidth = Math.max(1.5, s * 0.08);
          g.beginPath();
          g.moveTo(tx, top + s * 0.6 + i * lh);
          g.lineTo(tx + g.measureText(line).width, top + s * 0.6 + i * lh);
          g.stroke();
        }
      });
      g.fillStyle = STATE_INK[t.state];
      g.font = `italic 600 ${Math.round(s * 0.78)}px ${INK_FONT}`;
      note.forEach((line, i) => g.fillText(line, tx, top + lines.length * lh + s * 0.62 + i * nh));
    }
    rows.push({ id: t.id, mid: top + rowH / 2 - s * 0.1, h: rowH, mx, my: top + s * 0.58, r });
    y += rowH;
  }
  if (draw) {
    // The red thread from each task to those that come before it, and a pin where it is tied.
    g.strokeStyle = THREAD;
    g.lineWidth = Math.max(2, s * 0.13);
    g.lineCap = "round";
    for (const row of rows) {
      const up = parent.get(row.id);
      const from = up ? rows.find((x) => x.id === up) : undefined;
      if (!from) continue;
      g.beginPath();
      g.moveTo(from.mx, from.my + from.r + 1);
      g.lineTo(from.mx, row.my - r * 0.9);
      g.quadraticCurveTo(from.mx, row.my, from.mx + r * 0.9, row.my);
      g.lineTo(row.mx - row.r - 1, row.my);
      g.stroke();
    }
    for (const row of rows) {
      const t = q.tasks.find((x) => x.id === row.id)!;
      g.fillStyle = "#efe6cc";
      g.beginPath();
      g.arc(row.mx, row.my, row.r * 1.05, 0, Math.PI * 2);
      g.fill();
      mark(g, t.state, row.mx, row.my, row.r, t.main);
    }
  }
  return { h: Math.round(y + pad * 0.6), rows: rows.map(({ id, mid, h }) => ({ id, mid, h })) };
}
