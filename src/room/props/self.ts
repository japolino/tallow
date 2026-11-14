/**
 * The character board (game/system.ts, Show "self"): who you are. The perks system gives it (systems/perks.ts, selfShow).
 *
 * Closed, it is an oak peg board lying at your left hand. Along its back stand five turned pegs, one for each
 * attribute, each as high as its score. In front of them are a brass dial that shows your level, a slot whose red
 * strip is your health, and a wire of ten beads that are slid across as your experience grows. Along its near edge is
 * a row of small sockets, one for every perk of your three trees, with a bead in each that is learned (a bright one
 * when it is active). Pegs lying loose in front of the board are attribute points you have not placed, and loose brass beads
 * are perk points: so the board says by itself that you have something to spend. A peg rises when a point is placed,
 * the dial turns on a level, the beads slide, and a bead drops into its socket when a perk is learned.
 *
 * Open, the board is put away under three leaves of pale wood that swing out over it, as the three screens of the
 * game this follows:
 *
 *   You     your name, what you are and your level; your experience and health; your attributes, each a row of peg
 *           holes with its peg at the score (and a pencilled "+" while points remain); your abilities, each with a
 *           seal of wax that is red while it is ready and grey, with the turns left, while it rests.
 *   Skills  every skill by name, its level as tally marks, and a thin line for how far it is toward the next.
 *   Perks   the three trees, each a cord that branches, with a bead for every perk: a learned one is a red bead (and
 *           ringed in brass and marked when active), one within reach a pale bead, the rest dim. A bead that can be
 *           learned now stirs a little.
 *
 * In a wide view the three lie side by side. In an upright one (a phone) you look along the board from its end and one
 * leaf lies there at a time, with three tabs over it to turn to another. A leaf that holds more than fits has a
 * pencilled "more" at its foot.
 *
 * Touch a row and a slip is laid by it that says what the thing is and where it stands, with the pencilled choice the
 * game gives it, if it gives one: to put a point into an attribute, to call on an ability, to learn a perk, to make
 * one active or inactive. A choice writes its line in the notebook. Nothing here knows any rule: every word of a slip
 * and every line is the game's.
 */
import { Group, Mesh, SphereGeometry, TorusGeometry, Vector3, type Material } from "three";
import type { Choice, Show } from "../../game/system.js";
import { sound } from "../sound.js";
import { rng, woodCanvas } from "../textures.js";
import { ease } from "../track.js";
import { Choices, fitText, INK_FONT, INK, Label, PALETTE, PENCIL, PENCIL_FONT, PropBase, wrapLines, type Lay, type Part, type PropHost } from "./base.js";

type SelfShow = Extract<Show, { kind: "self" }>;
type LeafKey = "you" | "skills" | "perks";
const LEAVES: readonly LeafKey[] = ["you", "skills", "perks"];

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** The words of the board's own marks: the headings of its leaves and what is pencilled on them. */
export const SELF_SAYS = {
  you: "You",
  skills: "Skills",
  perks: "Perks",
  level: (n: number): string => `Level ${n}`,
  experience: "Experience",
  health: "Health",
  of: (a: number, b: number): string => `${a} of ${b}`,
  attributes: "Attributes",
  abilities: "Abilities",
  noSkills: "None yet.",
  noAbilities: "None.",
  active: "active",
  before: "From before",
  more: "more",
} as const;

/* The closed board, in its home's own space (metres). */
const BX = 0.03, BZ = -0.022, BW = 0.176, BD = 0.118, BH = 0.014;
/** The health slot and the bead wire: where they begin across the board, and how long they are. */
const SX = BX - 0.026, SLEN = 0.104;
/** The pegs: the first one's place across the board, and the step to the next. */
const PEG0 = -0.068, PEG_STEP = 0.034;
/** How high a peg stands for a score: a little for each point, and no higher than the home allows. */
const pegHigh = (score: number): number => 0.0065 + Math.min(14, Math.max(0, score)) * 0.0026;

/*
 * A leaf is drawn in units, so many across whatever its size on the table: as few as hold all it has to say on one
 * page (so its writing is as large as it can be), and where even the most do not, a middling count and more pages.
 */
const UNITS = [256, 288, 320] as const;
const UNITS_PAGED = 288;
/** A leaf's canvas, in pixels across. */
const LEAF_PX = 640;
const HOLES = 14;
const MORE_H = 24;
const ink = (a = 1): string => `rgba(36,22,12,${a})`;

/** What a touch on a row lays out on the slip. */
interface Slip {
  head: string;
  text: string;
  note: string;
  choices: Choice[];
}

/** What a page of a leaf is drawn with: where the beads drawn so far lie, for the cords between them. */
interface Page {
  beads: Map<string, { x: number; y: number }>;
  knot: { x: number; y: number } | null;
}

/** One row of a leaf. */
interface Row {
  /** The id of its part, when it can be touched. */
  id?: string;
  /** Its height, in units. */
  h: number;
  /** Rows of one block are kept on one page where they fit. */
  block: number;
  draw(g: CanvasRenderingContext2D, y: number, hot: boolean, page: Page): void;
  slip?: Slip;
  /** A peg standing on it, by where it stands across the row. */
  peg?: number;
  /** A bead lying on it. */
  bead?: { x: number; kind: "learned" | "active" | "reach" | "open" | "far" };
  /** For a screen reader. */
  says?: string;
}

interface Leaf {
  key: LeafKey;
  hinge: Group;
  holder: Group;
  slab: Mesh | null;
  label: Label | null;
  /** The pegs and beads standing on it. */
  things: Group;
  rows: Row[];
  pages: Row[][];
  page: number;
  /** How many units it is drawn in across. */
  uw: number;
  /** Where each touchable row of the page shown lies: its top and height, in units. */
  at: Map<string, { y: number; h: number; row: Row }>;
}

export class Self extends PropBase {
  readonly key = "self";
  readonly name = "Who you are";

  private data: SelfShow | null = null;

  /* The closed board. */
  private body = new Group();
  /** The board itself and all that stands on it; what is loose lies beside it, in the body. */
  private plank = new Group();
  private pegs: { shaft: Mesh; head: Mesh; high: number; want: number }[] = [];
  private marks: Label;
  private marksKey = "";
  private dial = new Group();
  private dialTurn = 0;
  private cap: Label;
  private capKey = "";
  private strip: Mesh;
  private hpK = 1;
  private beads: { mesh: Mesh; x: number }[] = [];
  private loosePegs: { mesh: Mesh; k: number }[] = [];
  private looseBeads: { mesh: Mesh; k: number }[] = [];
  private sockets = new Group();
  private socketKey = "";
  /** The beads in the sockets, by perk id: how far each has dropped in (0 not there, 1 seated). */
  private seated = new Map<string, { mesh: Mesh; k: number; want: number }>();
  private mats: Record<"bone" | "brass" | "soot" | "ox" | "ember" | "dim" | "pale" | "slab", Material>;
  private ball: SphereGeometry;

  /* The open board. */
  private face = new Group();
  private leaves: Leaf[];
  private tabs: { key: LeafKey; label: Label; drawn: string }[] = [];
  private current: LeafKey = "you";
  private slip: Choices;
  /** How much smaller the slip lies than it is written, so its writing stays sharp from close by. */
  private slipSmall = 1;
  private slipK = 0;
  private slipAt = V(0, 0, 0);
  private picked: string | null = null;
  private over: string | null = null;
  private openK = 0;
  /** The patch as you see it: across and down the picture, and a leaf's size. */
  private W = 0.28;
  private H = 0.19;
  private leafW = 0.09;
  private leafH = 0.186;
  /** The units across the leaf being laid out or drawn now. */
  private uw = 320;
  private stir: Mesh[] = [];

  constructor(h: PropHost) {
    super(h);
    const k = this.kit;
    const oak = k.skin(woodCanvas(256, 256, { planks: 1, seed: 41, dark: [70, 44, 24], light: [150, 104, 60] }), { rough: 0.68 });
    const rim = k.paint(PALETTE.oakDark, 0.75);
    this.mats = {
      bone: k.paint(PALETTE.wax, 0.55),
      brass: k.metal(0xa8843a, 0.36),
      soot: k.paint(PALETTE.soot, 0.95),
      ox: k.paint(0x9a3024, 0.45),
      ember: k.paint(PALETTE.ember, 0.4),
      dim: k.paint(0x4a3220, 0.9),
      pale: k.paint(0xd8c9a4, 0.6),
      slab: k.paint(0x8a6238, 0.8),
    };
    const m = this.mats;
    this.ball = k.geo(new SphereGeometry(1, 12, 9));

    // The board: a slab of oak with a darker rim and a brass stud at each corner.
    const on = this.plank;
    on.position.z = BZ;
    const board = k.box(BW, BH, BD, oak, 0.004);
    board.position.set(BX, BH / 2, 0);
    const edge = k.box(BW + 0.006, BH * 0.55, BD + 0.006, rim, 0.003);
    edge.position.set(BX, BH * 0.275, 0);
    on.add(edge, board);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const stud = k.disc(0.0034, 0.0016, m.brass, 8);
      stud.position.set(BX + sx * (BW / 2 - 0.008), BH, sz * (BD / 2 - 0.008));
      on.add(stud);
    }

    // The five pegs along the back, each in a brass-ringed hole, with its attribute's first letters cut in front of it.
    for (let i = 0; i < 5; i++) {
      const x = BX + PEG0 + i * PEG_STEP, z = -0.036;
      const ring = k.cast(new Mesh(k.geo(new TorusGeometry(0.0058, 0.0013, 5, 14)), m.brass));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, BH + 0.0006, z);
      const shaft = k.disc(0.0042, 1, m.bone, 10, 0.0037);
      shaft.position.set(x, BH, z);
      const head = k.lathe([[0, 0], [0.0052, 0.0006], [0.0064, 0.0034], [0.0052, 0.0066], [0.0022, 0.0082], [0, 0.0084]], m.bone, 10);
      head.position.set(x, BH, z);
      on.add(ring, shaft, head);
      this.pegs.push({ shaft, head, high: pegHigh(2), want: pegHigh(2) });
    }
    this.marks = new Label(BW - 0.012, 0.013, { flat: true, clear: true, px: 3200 });
    this.marks.mesh.position.set(BX, BH + 0.0006, -0.019);
    this.marks.glow = 0.3;
    on.add(this.marks.mesh);

    // The level dial: a brass disc that turns a twentieth for each level, under a fixed pointer, with the level on its cap.
    const dx = BX - 0.06, dz = 0.016;
    const seat = k.disc(0.0215, 0.0022, m.brass, 20);
    seat.position.set(dx, BH, dz);
    const ringed = new Label(0.04, 0.04, { flat: true, clear: true, px: 4200 });
    ringed.draw((g, w) => {
      const c = w / 2;
      g.fillStyle = "#b8944a";
      g.beginPath();
      g.arc(c, c, c - 2, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(40,24,8,0.85)";
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2 - Math.PI / 2;
        const long = i % 5 === 0;
        g.lineWidth = long ? 4 : 2;
        g.beginPath();
        g.moveTo(c + Math.cos(a) * (c - 5), c + Math.sin(a) * (c - 5));
        g.lineTo(c + Math.cos(a) * (c - (long ? 26 : 17)), c + Math.sin(a) * (c - (long ? 26 : 17)));
        g.stroke();
      }
    });
    ringed.glow = 0.16;
    ringed.mesh.position.y = 0.0001;
    this.dial.add(ringed.mesh);
    this.dial.position.set(dx, BH + 0.0023, dz);
    this.dialLabel = ringed;
    const hub = k.disc(0.0125, 0.003, m.brass, 16, 0.0115);
    hub.position.set(dx, BH + 0.0022, dz);
    this.cap = new Label(0.021, 0.021, { flat: true, clear: true, px: 5200 });
    this.cap.mesh.position.set(dx, BH + 0.0054, dz);
    this.cap.glow = 0.3;
    const pointer = k.box(0.0036, 0.0022, 0.009, m.ox, 0.0008);
    pointer.position.set(dx, BH + 0.0034, dz + 0.0235);
    on.add(seat, this.dial, hub, this.cap.mesh, pointer);

    // Health: a slot with a red strip in it, as long as your health.
    const left = SX, len = SLEN;
    const slot = k.box(len + 0.006, 0.0032, 0.0125, m.soot, 0.001);
    slot.position.set(left + len / 2, BH + 0.0006, 0.006);
    this.strip = k.box(len, 0.0046, 0.0078, m.ox, 0.0012);
    this.strip.position.set(left + len / 2, BH + 0.0026, 0.006);
    for (const x of [left - 0.0045, left + len + 0.0045]) {
      const end = k.box(0.0036, 0.0058, 0.0145, m.brass, 0.001);
      end.position.set(x, BH + 0.0026, 0.006);
      on.add(end);
    }
    on.add(slot, this.strip);

    // Experience: ten beads on a wire between two posts, slid to the left as it grows.
    const wire = k.box(len + 0.004, 0.0014, 0.0014, m.brass, 0.0004);
    wire.position.set(left + len / 2, BH + 0.0062, 0.028);
    on.add(wire);
    for (const x of [left - 0.004, left + len + 0.004]) {
      const post = k.disc(0.0022, 0.0085, m.brass, 8);
      post.position.set(x, BH, 0.028);
      on.add(post);
    }
    for (let i = 0; i < 10; i++) {
      const bead = k.cast(new Mesh(this.ball, m.bone));
      bead.scale.setScalar(0.0039);
      bead.position.set(0, BH + 0.0062, 0.028);
      this.beads.push({ mesh: bead, x: this.beadAt(i, 0) });
      bead.position.x = this.beadAt(i, 0);
      on.add(bead);
    }
    on.add(this.sockets);

    // What is still to spend lies loose in front of the board: pegs for attribute points, brass beads for perk points.
    const r = rng(77);
    for (let i = 0; i < 6; i++) {
      const peg = new Group() as unknown as Mesh;
      const lying = k.disc(0.0037, 0.026, m.bone, 8, 0.0032);
      const knob = k.lathe([[0, 0], [0.0048, 0.0006], [0.0058, 0.003], [0.0046, 0.006], [0, 0.0074]], m.bone, 8);
      knob.position.y = 0.026;
      const stick = new Group();
      stick.add(lying, knob);
      stick.position.y = -0.016;
      const turn = new Group();
      turn.rotation.x = Math.PI / 2;
      turn.add(stick);
      peg.add(turn);
      peg.position.set(BX - 0.076 + i * 0.0145 + (r() - 0.5) * 0.002, 0.0045, 0.062 + (r() - 0.5) * 0.006);
      peg.rotation.y = (r() - 0.5) * 0.5;
      peg.visible = false;
      this.loosePegs.push({ mesh: peg, k: 0 });
      this.body.add(peg);
    }
    for (let i = 0; i < 3; i++) {
      const bead = k.cast(new Mesh(this.ball, m.brass));
      bead.scale.setScalar(0.0052);
      bead.position.set(BX + 0.036 + i * 0.0125 + (r() - 0.5) * 0.002, 0.0052, 0.058 + (r() - 0.5) * 0.008);
      bead.visible = false;
      this.looseBeads.push({ mesh: bead, k: 0 });
      this.body.add(bead);
    }
    this.body.add(this.plank);
    this.group.add(this.body);

    // The leaves that lie over it while it is open, and the slip.
    this.leaves = LEAVES.map((key) => {
      const hinge = new Group(), holder = new Group(), things = new Group();
      holder.add(things);
      hinge.add(holder);
      this.face.add(hinge);
      return { key, hinge, holder, slab: null, label: null, things, rows: [], pages: [[]], page: 0, uw: 320, at: new Map() };
    });
    for (const key of LEAVES) {
      const label = new Label(0.044, 0.02, { flat: true, px: 5600 });
      label.glow = 0.16;
      label.mesh.visible = false;
      this.face.add(label.mesh);
      this.tabs.push({ key, label, drawn: "" });
    }
    this.slip = new Choices(0.1);
    this.slip.group.visible = false;
    this.face.add(this.slip.group);
    this.spread.add(this.face);
    this.spread.visible = false;
  }

  private dialLabel: Label;

  /** Where the i-th bead of the wire lies when `n` of the ten are slid across. */
  private beadAt(i: number, n: number): number {
    const d = 0.0079;
    return i < n ? SX + 0.0042 + i * d : SX + SLEN - 0.0042 - (9 - i) * d;
  }

  /* ------------------------------------------------- what the game shows ------------------------------------------------- */

  show(shows: readonly Show[]): boolean {
    const next = shows.find((s): s is SelfShow => s.kind === "self") ?? null;
    const before = this.data;
    this.data = next;
    if (!next) {
      this.picked = null;
      return false;
    }
    const x = this.group.position.x;
    const quiet = !before || this.isOpen;
    // The pegs stand as high as the scores: one that has grown rises, with a knock.
    next.attributes.slice(0, 5).forEach((a, i) => {
      const peg = this.pegs[i]!;
      peg.want = pegHigh(a.score);
      if (!before) peg.high = peg.want;
      else if (!quiet && (before.attributes[i]?.score ?? a.score) < a.score) sound.play("peg", { x, gain: 0.6, delay: 0.15 + i * 0.05 });
    });
    if (before && !quiet && before.level !== next.level) sound.play("tink", { x, gain: 0.5 });
    if (!before) {
      this.dialTurn = this.dialWant();
      this.hpK = next.hp[1] ? next.hp[0] / next.hp[1] : 0;
      this.beads.forEach((b, i) => (b.x = this.beadAt(i, this.slid())));
    }
    this.drawMarks();
    this.drawCap();
    this.socketsFor(next, before, quiet);
    if (before && !quiet && (next.points > before.points || next.perks.points > before.perks.points)) sound.play("token", { x, gain: 0.45 });
    // A row that is gone cannot stay picked up.
    this.arrange();
    if (this.picked && !this.rowOf(this.picked)) this.picked = null;
    this.layPicked();
    return true;
  }

  private dialWant(): number {
    return this.data ? -((this.data.level - 1) / 20) * Math.PI * 2 : 0;
  }

  /** How many of the ten beads are slid across: your experience toward the next level, in tenths. */
  private slid(): number {
    const d = this.data;
    return d && d.xp[1] > 0 ? Math.max(0, Math.min(10, Math.round((d.xp[0] / d.xp[1]) * 10))) : 0;
  }

  /** The first letters of each attribute, cut in front of its peg. */
  private drawMarks(): void {
    const d = this.data;
    if (!d) return;
    const key = d.attributes.map((a) => a.name).join("|");
    if (key === this.marksKey) return;
    this.marksKey = key;
    this.marks.draw((g, w, h) => {
      g.fillStyle = "#e6cf96";
      g.textAlign = "center";
      const px = w / (BW - 0.012);
      d.attributes.slice(0, 5).forEach((a, i) => {
        const x = w / 2 + (PEG0 + i * PEG_STEP) * px;
        fitText(g, a.name.slice(0, 3).toUpperCase(), x, h * 0.8, 0.03 * px, h * 0.82, h * 0.4, "700");
      });
    });
  }

  /** Your level, on the cap of the dial. */
  private drawCap(): void {
    const d = this.data;
    if (!d || `${d.level}` === this.capKey) return;
    this.capKey = `${d.level}`;
    this.cap.draw((g, w, h) => {
      g.fillStyle = "#e9d7a6";
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = INK;
      g.textAlign = "center";
      fitText(g, String(d.level), w / 2, h * 0.72, w * 0.78, h * 0.66, h * 0.3, "700");
    });
  }

  /** The row of sockets along the near edge, one for each perk of each tree, and the beads in those that are learned. */
  private socketsFor(d: SelfShow, before: SelfShow | null, quiet: boolean): void {
    const k = this.kit, m = this.mats;
    const trees = d.perks.trees;
    const key = trees.map((t) => t.perks.map((p) => p.id).join(",")).join("|");
    if (key !== this.socketKey) {
      this.socketKey = key;
      this.sockets.clear();
      this.seated.clear();
      const n = trees.reduce((sum, t) => sum + t.perks.length, 0);
      const gap = 0.007, step = n ? Math.min(0.0076, (BW - 0.03 - gap * Math.max(0, trees.length - 1)) / n) : 0;
      let x = BX - (n * step + gap * Math.max(0, trees.length - 1)) / 2 + step / 2;
      for (const t of trees) {
        for (const p of t.perks) {
          const dimple = k.disc(step * 0.36, 0.0007, m.soot, 8);
          dimple.position.set(x, BH, 0.051);
          const bead = k.cast(new Mesh(this.ball, m.ox));
          bead.scale.setScalar(step * 0.42);
          bead.position.set(x, BH + step * 0.3, 0.051);
          bead.visible = false;
          this.sockets.add(dimple, bead);
          this.seated.set(p.id, { mesh: bead, k: 0, want: 0 });
          x += step;
        }
        x += gap;
      }
    }
    const had = new Set(before?.perks.trees.flatMap((t) => t.perks.filter((p) => p.state === "learned").map((p) => p.id)) ?? []);
    let fresh = 0;
    for (const p of trees.flatMap((t) => t.perks)) {
      const seat = this.seated.get(p.id);
      if (!seat) continue;
      seat.want = p.state === "learned" ? 1 : 0;
      seat.mesh.material = p.active ? m.ember : m.ox;
      if (!before || quiet) seat.k = seat.want;
      else if (seat.want && !had.has(p.id)) {
        seat.k = 0;
        fresh++;
      }
    }
    if (fresh) sound.play("tink", { x: this.group.position.x, gain: 0.55, delay: 0.35 });
  }

  /* ------------------------------------------------- opening and closing ------------------------------------------------- */

  place(lay: Lay, narrow: boolean): void {
    super.place(lay, narrow);
    // In an upright view you look along the board from its end: across the picture is the patch's depth.
    this.face.rotation.y = narrow ? Math.PI / 2 : 0;
    this.W = narrow ? lay.spread.h : lay.spread.w;
    this.H = narrow ? lay.spread.w : lay.spread.h;
    const gap = 0.004;
    this.leafW = narrow ? this.W - gap : (this.W - gap * 2) / 3;
    this.leafH = narrow ? this.H - 0.024 : this.H - gap;
    for (const leaf of this.leaves) {
      if (leaf.label) {
        leaf.holder.remove(leaf.label.mesh);
        leaf.label.dispose();
      }
      if (leaf.slab) leaf.holder.remove(leaf.slab);
      leaf.label = new Label(this.leafW, this.leafH, { flat: true, px: LEAF_PX / this.leafW });
      leaf.label.glow = 0.15;
      leaf.label.mesh.position.y = 0.0002;
      leaf.slab = this.kit.box(this.leafW + 0.002, 0.0028, this.leafH + 0.002, this.mats.slab, 0.001);
      leaf.slab.position.y = -0.0014;
      leaf.holder.add(leaf.slab, leaf.label.mesh);
      leaf.page = 0;
    }
    // The leaves: side by side, the outer two hinged on the middle one; or one over the other where only one shows.
    this.leaves.forEach((leaf, i) => {
      if (narrow) {
        leaf.hinge.position.set(0, 0, 0.011);
        leaf.holder.position.set(0, 0, 0);
      } else {
        const side = i - 1;
        leaf.hinge.position.set(side * (this.leafW + gap) * 0.5, 0, 0);
        leaf.holder.position.set(side * (this.leafW + gap) * 0.5, 0, 0);
      }
    });
    const tabW = (this.W - 0.004) / 3;
    this.tabs.forEach((tab, i) => {
      this.face.remove(tab.label.mesh);
      tab.label.dispose();
      tab.label = new Label(tabW - 0.002, 0.019, { flat: true, px: 4800 });
      tab.label.glow = 0.16;
      tab.label.mesh.position.set((i - 1) * tabW, 0.0006, -this.H / 2 + 0.0105);
      tab.label.mesh.visible = false;
      tab.drawn = "";
      this.face.add(tab.label.mesh);
    });
    // The slip is written larger than it lies, so it is sharp from this close.
    this.face.remove(this.slip.group);
    this.slip.dispose();
    this.slipSmall = narrow ? 0.8 : 0.6;
    this.slip = new Choices((narrow ? Math.min(0.132, this.W - 0.006) : Math.min(0.104, this.leafW + 0.003)) / this.slipSmall, (narrow ? 0.0064 : 0.0052) / this.slipSmall);
    this.slip.group.visible = false;
    this.face.add(this.slip.group);
    this.picked = null;
    this.arrange();
  }

  open(): void {
    super.open();
    this.picked = null;
    this.over = null;
    for (const leaf of this.leaves) leaf.page = Math.min(leaf.page, leaf.pages.length - 1);
    this.arrange();
    sound.play("slide", { x: this.group.position.x, gain: 0.45, rate: 0.8 });
    const d = this.data;
    if (!d) return;
    this.h.tell(
      `${this.name}, open. ${d.name}${d.calling ? `, ${d.calling}` : ""}. ${SELF_SAYS.level(d.level)}. ${SELF_SAYS.experience} ${SELF_SAYS.of(d.xp[0], d.xp[1])}. ${SELF_SAYS.health} ${SELF_SAYS.of(d.hp[0], d.hp[1])}. ` +
        `${d.attributes.map((a) => `${a.name} ${a.score}`).join(", ")}. ${d.toPlace ?? ""} ${SELF_SAYS.perks}: ${d.perks.note}`,
    );
  }

  close(): void {
    if (!this.isOpen) return;
    super.close();
    this.picked = null;
    this.over = null;
    this.layPicked();
    sound.play("slide", { x: this.group.position.x, gain: 0.35, rate: 1.2 });
  }

  /* ------------------------------------------------- the rows of each leaf ------------------------------------------------- */

  private hot(g: CanvasRenderingContext2D, y: number, h: number, on: boolean, picked: boolean): void {
    if (!on && !picked) return;
    g.fillStyle = picked ? "rgba(120,60,20,0.2)" : "rgba(60,35,10,0.12)";
    g.fillRect(5, y + 1, this.uw - 10, h - 2);
  }

  private title(text: string, block: number): Row {
    return {
      h: 36,
      block,
      draw: (g, y) => {
        g.fillStyle = INK;
        fitText(g, text, 12, y + 27, this.uw - 24, 22, 12, "italic 700");
      },
    };
  }

  private heading(text: string, note: string, block: number): Row {
    return {
      h: 30,
      block,
      draw: (g, y) => {
        g.fillStyle = INK;
        g.font = `italic 700 15px ${INK_FONT}`;
        g.fillText(text, 12, y + 21);
        const used = g.measureText(text).width;
        g.strokeStyle = ink(0.32);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(12, y + 26.5);
        g.lineTo(this.uw - 12, y + 26.5);
        g.stroke();
        if (!note) return;
        g.fillStyle = PENCIL;
        g.textAlign = "right";
        fitText(g, note, this.uw - 12, y + 20, this.uw - 36 - used, 13, 8.5, "600", PENCIL_FONT);
        g.textAlign = "left";
      },
    };
  }

  /** Some lines of writing, as many as it takes. */
  private para(text: string, block: number, font = `13px ${PENCIL_FONT}`, color: string = PENCIL): Row {
    const [g] = [this.measure()];
    g.font = font;
    const lines = wrapLines(g, text, this.uw - 24, 5);
    return {
      h: lines.length * 17 + 5,
      block,
      draw: (c, y) => {
        c.fillStyle = color;
        c.font = font;
        lines.forEach((line, i) => c.fillText(line, 12, y + 13 + i * 17));
      },
    };
  }

  private ctx: CanvasRenderingContext2D | null = null;
  private measure(): CanvasRenderingContext2D {
    return (this.ctx ??= document.createElement("canvas").getContext("2d")!);
  }

  private rowsOf(key: LeafKey): Row[] {
    const d = this.data;
    if (!d) return [];
    const rows: Row[] = [];
    if (key === "you") {
      rows.push(this.title(d.name, 0));
      rows.push({
        h: 22,
        block: 0,
        draw: (g, y) => {
          g.fillStyle = INK;
          g.textAlign = "right";
          g.font = `700 14.5px ${INK_FONT}`;
          const level = SELF_SAYS.level(d.level);
          g.fillText(level, this.uw - 12, y + 14);
          const used = g.measureText(level).width;
          g.textAlign = "left";
          g.fillStyle = ink(0.82);
          fitText(g, d.calling, 12, y + 14, this.uw - 36 - used, 13.5, 9, "italic 500");
        },
      });
      const meter = (name: string, now: number, most: number, beads: boolean): Row => ({
        h: 23,
        block: 0,
        draw: (g, y) => {
          g.fillStyle = ink(0.85);
          g.font = `italic 500 12.5px ${INK_FONT}`;
          g.fillText(name, 12, y + 15);
          g.fillStyle = INK;
          g.textAlign = "right";
          fitText(g, SELF_SAYS.of(now, most), this.uw - 12, y + 15, 66, 12.5, 8.5, "600");
          g.textAlign = "left";
          const x0 = 92, x1 = this.uw - 88, step = (x1 - x0) / 10, share = most > 0 ? Math.max(0, Math.min(1, now / most)) : 0;
          if (beads) {
            g.strokeStyle = ink(0.45);
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(x0, y + 11.5);
            g.lineTo(x1, y + 11.5);
            g.stroke();
            const n = Math.round(share * 10);
            for (let i = 0; i < 10; i++) {
              g.beginPath();
              g.arc(x0 + step / 2 + i * step, y + 11.5, Math.min(4.6, step * 0.36), 0, Math.PI * 2);
              g.fillStyle = i < n ? "#6b4527" : "#e6d9b8";
              g.fill();
              g.strokeStyle = ink(0.6);
              g.stroke();
            }
          } else {
            g.fillStyle = ink(0.16);
            g.fillRect(x0, y + 6.5, x1 - x0, 10);
            g.fillStyle = "#8a2e22";
            g.fillRect(x0, y + 6.5, (x1 - x0) * share, 10);
            g.strokeStyle = ink(0.6);
            g.lineWidth = 1;
            g.strokeRect(x0, y + 6.5, x1 - x0, 10);
          }
        },
      });
      rows.push(meter(SELF_SAYS.experience, d.xp[0], d.xp[1], true), meter(SELF_SAYS.health, d.hp[0], d.hp[1], false));
      rows.push(this.heading(SELF_SAYS.attributes, d.toPlace ?? "", 1));
      for (const a of d.attributes) {
        const at = Math.max(1, Math.min(HOLES, a.score));
        const id = `attr:${a.id}`;
        // The row of holes, between the name and the score.
        const hole0 = 100, holeStep = (this.uw - 52 - hole0) / HOLES;
        rows.push({
          id,
          h: 27,
          block: 1,
          peg: hole0 + at * holeStep,
          slip: { head: `${a.name} ${a.score}`, text: a.text, note: a.note, choices: a.choices },
          says: `${a.name} ${a.score}. ${a.text} ${a.note}`,
          draw: (g, y, hot) => {
            this.hot(g, y, 27, hot, this.picked === id);
            g.fillStyle = INK;
            fitText(g, a.name, 12, y + 19, 88, 15, 10, "700");
            for (let i = 1; i <= HOLES; i++) {
              g.beginPath();
              g.arc(hole0 + i * holeStep, y + 13.5, i === at ? 3.6 : 2.1, 0, Math.PI * 2);
              if (i <= at) {
                g.fillStyle = i === at ? "#2c1a0c" : ink(0.5);
                g.fill();
              } else {
                g.strokeStyle = ink(0.42);
                g.lineWidth = 0.9;
                g.stroke();
              }
            }
            g.fillStyle = INK;
            g.textAlign = "right";
            fitText(g, String(a.score), this.uw - 24, y + 19.5, 30, 16.5, 11, "700");
            g.textAlign = "left";
            if (!a.choices.length) return;
            g.fillStyle = PENCIL;
            g.font = `700 18px ${PENCIL_FONT}`;
            g.fillText("+", this.uw - 21, y + 20);
          },
        });
      }
      rows.push(this.heading(SELF_SAYS.abilities, "", 2));
      if (!d.abilities.length) rows.push(this.para(SELF_SAYS.noAbilities, 2, `italic 13px ${INK_FONT}`, ink(0.7)));
      d.abilities.forEach((a, i) => {
        const id = `ability:${i}`;
        rows.push({
          id,
          h: 25,
          block: 2,
          slip: { head: a.name, text: a.text, note: `${a.rank[0]?.toUpperCase() ?? ""}${a.rank.slice(1)}. ${a.note}`, choices: a.choices },
          says: `${a.name}. ${a.text} ${a.note}`,
          draw: (g, y, hot) => {
            this.hot(g, y, 25, hot, this.picked === id);
            // A seal of wax: red while it is ready, grey with the turns left while it rests.
            const cx = 21, cy = y + 12.5;
            g.beginPath();
            for (let k = 0; k <= 14; k++) {
              const t = (k / 14) * Math.PI * 2;
              const r = 7.6 * (1 + 0.08 * Math.sin(t * 3 + i * 2));
              g.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
            }
            g.closePath();
            g.fillStyle = a.wait > 0 ? "#8d877a" : "#8a2e22";
            g.fill();
            g.strokeStyle = ink(0.55);
            g.lineWidth = 0.9;
            g.stroke();
            if (a.wait > 0) {
              g.fillStyle = "#f1e9d2";
              g.textAlign = "center";
              g.font = `700 10.5px ${INK_FONT}`;
              g.fillText(String(a.wait), cx, cy + 3.8);
              g.textAlign = "left";
            } else {
              g.fillStyle = "rgba(255,235,215,0.35)";
              g.beginPath();
              g.arc(cx - 2.4, cy - 2.4, 2.2, 0, Math.PI * 2);
              g.fill();
            }
            g.fillStyle = ink(0.72);
            g.textAlign = "right";
            g.font = `italic 500 11.5px ${INK_FONT}`;
            g.fillText(a.rank, this.uw - 12, y + 17);
            const used = g.measureText(a.rank).width;
            g.textAlign = "left";
            g.fillStyle = a.wait > 0 ? ink(0.62) : INK;
            fitText(g, a.name, 36, y + 17.5, this.uw - 36 - 20 - used, 14, 9.5, "600");
          },
        });
      });
    } else if (key === "skills") {
      rows.push(this.title(SELF_SAYS.skills, 0));
      if (!d.skills.length) rows.push(this.para(SELF_SAYS.noSkills, 0, `italic 13px ${INK_FONT}`, ink(0.7)));
      d.skills.forEach((k, i) => {
        const id = `skill:${i}`;
        rows.push({
          id,
          h: 22,
          block: 1 + i,
          slip: { head: k.name, text: k.note, note: "", choices: [] },
          says: `${k.name}. ${k.note}`,
          draw: (g, y, hot) => {
            this.hot(g, y, 22, hot, this.picked === id);
            g.fillStyle = INK;
            const tx = this.uw - 96;
            fitText(g, k.name, 12, y + 16, tx - 22, 14, 9.5, "600");
            // Its level in tally marks, four upright and the fifth across them.
            g.strokeStyle = INK;
            g.lineWidth = 1.5;
            g.lineCap = "round";
            for (let n = 0; n < Math.min(k.level, k.most); n++) {
              const x0 = tx + Math.floor(n / 5) * 33, at = n % 5;
              g.beginPath();
              if (at < 4) {
                g.moveTo(x0 + at * 5.4 + ((n * 7) % 3) * 0.4, y + 5);
                g.lineTo(x0 + at * 5.4, y + 15.5);
              } else {
                g.moveTo(x0 - 3, y + 13.5);
                g.lineTo(x0 + 19.5, y + 6.5);
              }
              g.stroke();
            }
            // How far it is toward the next level.
            if (k.xp[1] > 0) {
              g.fillStyle = ink(0.17);
              g.fillRect(tx - 2, y + 18.6, 58, 1.8);
              g.fillStyle = "#6b4527";
              g.fillRect(tx - 2, y + 18.6, 58 * Math.max(0, Math.min(1, k.xp[0] / k.xp[1])), 1.8);
            }
            g.fillStyle = INK;
            g.textAlign = "right";
            g.font = `700 14.5px ${INK_FONT}`;
            g.fillText(String(k.level), this.uw - 12, y + 16.5);
            g.textAlign = "left";
          },
        });
      });
    } else {
      const p = d.perks;
      rows.push(this.title(SELF_SAYS.perks, 0));
      rows.push(this.para(p.note, 0));
      p.trees.forEach((tree, t) => {
        rows.push({
          h: 27,
          block: 1 + t,
          draw: (g, y, _hot, page) => {
            // The knot the cord hangs from, and the tree's name.
            g.fillStyle = "#7a5a34";
            g.beginPath();
            g.moveTo(20, y + 8);
            g.lineTo(25.5, y + 13.5);
            g.lineTo(20, y + 19);
            g.lineTo(14.5, y + 13.5);
            g.closePath();
            g.fill();
            page.knot = { x: 20, y: y + 19 };
            g.fillStyle = INK;
            fitText(g, tree.name, 34, y + 19, this.uw - 46, 15, 10, "italic 700");
          },
        });
        for (const perk of tree.perks) {
          const id = `perk:${perk.id}`;
          const bx = 20 + Math.min(perk.depth, 5) * 15;
          const can = perk.choices.length > 0;
          const kind = perk.state === "learned" ? (perk.active ? "active" : "learned") : perk.state === "reach" ? (can ? "open" : "reach") : "far";
          rows.push({
            id,
            h: 22,
            block: 1 + t,
            bead: { x: bx, kind },
            slip: { head: perk.name, text: perk.text, note: perk.note, choices: perk.choices },
            says: `${perk.name}. ${perk.text} ${perk.note}`,
            draw: (g, y, hot, page) => {
              this.hot(g, y, 22, hot, this.picked === id);
              const cy = y + 11;
              const up = perk.parent ? page.beads.get(perk.parent) : null;
              g.strokeStyle = perk.state === "far" ? "rgba(122,90,52,0.55)" : "#7a5a34";
              g.lineWidth = 1.7;
              g.lineCap = "round";
              g.lineJoin = "round";
              g.beginPath();
              if (up) {
                g.moveTo(up.x, up.y + 6.5);
                g.lineTo(up.x, cy);
                g.lineTo(bx - 6.5, cy);
              } else if (perk.parent) {
                // The one above it lies on another page: the cord comes down from the top of this one.
                g.moveTo(bx - 15, y - 2);
                g.lineTo(bx - 15, cy);
                g.lineTo(bx - 6.5, cy);
              } else if (page.knot) {
                g.moveTo(page.knot.x, page.knot.y);
                g.lineTo(bx, cy - 6.5);
              }
              g.stroke();
              page.beads.set(perk.id, { x: bx, y: cy });
              // Where the bead lies: a ring of brass round one that is active.
              g.beginPath();
              g.arc(bx, cy, 5.6, 0, Math.PI * 2);
              g.fillStyle = perk.state === "far" ? "rgba(60,40,22,0.35)" : "rgba(60,40,22,0.5)";
              g.fill();
              if (perk.active) {
                g.strokeStyle = "#a8843a";
                g.lineWidth = 2.2;
                g.beginPath();
                g.arc(bx, cy, 8.3, 0, Math.PI * 2);
                g.stroke();
              }
              let right = this.uw - 12;
              if (perk.active) {
                g.fillStyle = "#7a5516";
                g.textAlign = "right";
                g.font = `italic 600 11px ${INK_FONT}`;
                g.fillText(SELF_SAYS.active, right, y + 15);
                right -= g.measureText(SELF_SAYS.active).width + 6;
                g.textAlign = "left";
              } else if (can && perk.state === "reach") {
                g.fillStyle = PENCIL;
                g.font = `700 17px ${PENCIL_FONT}`;
                g.fillText("+", right - 9, y + 16.5);
                right -= 15;
              }
              g.fillStyle = perk.state === "far" ? ink(0.5) : INK;
              fitText(g, perk.name, bx + 12, y + 15.5, right - bx - 12, 13.8, 8.5, perk.state === "learned" ? "700" : "500");
            },
          });
        }
      });
      if (p.old.length) {
        const block = 1 + p.trees.length;
        rows.push({
          h: 27,
          block,
          draw: (g, y) => {
            g.fillStyle = INK;
            fitText(g, SELF_SAYS.before, 12, y + 19, this.uw - 24, 15, 10, "italic 700");
          },
        });
        p.old.forEach((old, i) => {
          const id = `old:${i}`;
          rows.push({
            id,
            h: 22,
            block,
            bead: { x: 20, kind: "learned" },
            slip: { head: old.name, text: old.text, note: old.note, choices: [] },
            says: `${old.name}. ${old.text} ${old.note}`,
            draw: (g, y, hot) => {
              this.hot(g, y, 22, hot, this.picked === id);
              g.beginPath();
              g.arc(20, y + 11, 5.6, 0, Math.PI * 2);
              g.fillStyle = "rgba(60,40,22,0.5)";
              g.fill();
              g.fillStyle = INK;
              fitText(g, old.name, 32, y + 15.5, this.uw - 44, 13.8, 8.5, "700");
            },
          });
        });
      }
    }
    return rows;
  }

  /** Rows as pages of a leaf: a block is kept whole where it fits, and a leaf of more than one page keeps its foot for the pencilled "more". */
  private paged(rows: Row[], room: number): Row[][] {
    if (rows.reduce((n, r) => n + r.h, 0) <= room) return [rows];
    const fit = room - MORE_H;
    const pages: Row[][] = [[]];
    let used = 0;
    const turn = (): void => {
      pages.push([]);
      used = 0;
    };
    for (let i = 0; i < rows.length; ) {
      let j = i, tall = 0;
      while (j < rows.length && rows[j]!.block === rows[i]!.block) tall += rows[j++]!.h;
      if (used + tall > fit && tall <= fit && used > 0) turn();
      for (; i < j; i++) {
        const row = rows[i]!;
        if (used + row.h > fit && used > 0) turn();
        pages[pages.length - 1]!.push(row);
        used += row.h;
      }
    }
    return pages;
  }

  private rowOf(id: string): { leaf: Leaf; y: number; h: number; row: Row } | null {
    for (const leaf of this.shown()) {
      const at = leaf.at.get(id);
      if (at) return { leaf, ...at };
    }
    return null;
  }

  /** The leaves that are laid out now: all three, or the one turned to. */
  private shown(): Leaf[] {
    return this.narrow ? this.leaves.filter((l) => l.key === this.current) : this.leaves;
  }

  /** Lay every leaf out again from what the game shows: its rows, its pages, its writing, and what stands on it. */
  private arrange(): void {
    if (!this.data || !this.lay) return;
    for (const leaf of this.leaves) {
      // As few units across as hold it all on one page; else a middling count, and pages.
      for (const uw of [...UNITS, UNITS_PAGED]) {
        this.uw = leaf.uw = uw;
        leaf.rows = this.rowsOf(leaf.key);
        leaf.pages = this.paged(leaf.rows, (this.leafH / this.leafW) * uw - 10);
        if (leaf.pages.length === 1) break;
      }
      leaf.page = Math.max(0, Math.min(leaf.pages.length - 1, leaf.page));
      this.drawLeaf(leaf);
      this.dress(leaf);
    }
    this.drawTabs();
  }

  private drawLeaf(leaf: Leaf): void {
    const label = leaf.label;
    if (!label) return;
    this.uw = leaf.uw;
    const room = (this.leafH / this.leafW) * leaf.uw;
    leaf.at.clear();
    label.draw((g) => {
      g.save();
      g.scale(LEAF_PX / this.uw, LEAF_PX / this.uw);
      // Pale wood, its grain running across, with a ruled border and a brass pin at each corner.
      g.fillStyle = "#dccba6";
      g.fillRect(0, 0, this.uw, room);
      const r = rng(11 + leaf.key.length * 7);
      for (let i = 0; i < 110; i++) {
        g.fillStyle = `rgba(${r() < 0.6 ? "120,84,44" : "255,244,214"},${0.03 + r() * 0.06})`;
        g.fillRect(r() * this.uw * 0.4 - 20, r() * room, this.uw * (0.5 + r() * 0.7), 0.5 + r() * 1.3);
      }
      const shade = g.createLinearGradient(0, 0, 0, room);
      shade.addColorStop(0, "rgba(70,40,10,0.1)");
      shade.addColorStop(0.12, "rgba(70,40,10,0)");
      shade.addColorStop(0.9, "rgba(70,40,10,0)");
      shade.addColorStop(1, "rgba(70,40,10,0.14)");
      g.fillStyle = shade;
      g.fillRect(0, 0, this.uw, room);
      g.strokeStyle = "rgba(60,35,12,0.6)";
      g.lineWidth = 1.6;
      g.strokeRect(3.5, 3.5, this.uw - 7, room - 7);
      for (const [px, py] of [[8, 8], [this.uw - 8, 8], [8, room - 8], [this.uw - 8, room - 8]] as const) {
        g.fillStyle = "#8a6a2c";
        g.beginPath();
        g.arc(px, py, 2.3, 0, Math.PI * 2);
        g.fill();
      }
      const page: Page = { beads: new Map(), knot: null };
      let y = 4;
      for (const row of leaf.pages[leaf.page] ?? []) {
        g.textAlign = "left";
        row.draw(g, y, !!row.id && row.id === this.over, page);
        if (row.id) leaf.at.set(row.id, { y, h: row.h, row });
        y += row.h;
      }
      if (leaf.pages.length > 1) {
        const id = `more:${leaf.key}`, my = room - MORE_H - 6;
        this.hot(g, my, MORE_H, this.over === id, false);
        g.fillStyle = PENCIL;
        g.textAlign = "center";
        g.font = `600 13.5px ${PENCIL_FONT}`;
        g.fillText(`${SELF_SAYS.more} (${SELF_SAYS.of(leaf.page + 1, leaf.pages.length)}) ›`, this.uw / 2, my + 16.5);
        g.textAlign = "left";
        leaf.at.set(id, { y: my, h: MORE_H, row: { h: MORE_H, block: -1, draw: () => undefined } });
      }
      g.restore();
    });
  }

  /** What stands on a leaf: the peg of each attribute at its score, and a bead for each perk. */
  private dress(leaf: Leaf): void {
    const m = this.mats, u = this.leafW / leaf.uw;
    this.uw = leaf.uw;
    leaf.things.clear();
    this.stir = this.stir.filter((b) => b.parent && b.parent !== leaf.things);
    const at = (x: number, y: number): [number, number] => [(x - this.uw / 2) * u, y * u - this.leafH / 2];
    let y = 4;
    for (const row of leaf.pages[leaf.page] ?? []) {
      const cy = y + row.h / 2;
      y += row.h;
      if (row.peg !== undefined) {
        const [x, z] = at(row.peg, cy);
        const peg = this.kit.disc(3.1 * u, 8 * u, m.bone, 8, 2.6 * u);
        const knob = this.kit.cast(new Mesh(this.ball, m.bone));
        knob.scale.set(3.7 * u, 2.6 * u, 3.7 * u);
        knob.position.y = 8.6 * u;
        peg.add(knob);
        peg.position.set(x, 0.0003, z);
        leaf.things.add(peg);
      }
      if (row.bead) {
        const [x, z] = at(row.bead.x, cy);
        const kind = row.bead.kind;
        const r = (kind === "far" ? 3.6 : 5.2) * u;
        const bead = this.kit.cast(new Mesh(this.ball, kind === "active" ? m.ember : kind === "learned" ? m.ox : kind === "far" ? m.dim : m.pale));
        bead.scale.set(r, r * 0.82, r);
        bead.position.set(x, r * 0.8, z);
        leaf.things.add(bead);
        if (kind === "open") this.stir.push(bead);
        if (kind === "active") {
          const ring = this.kit.cast(new Mesh(this.kit.geo(new TorusGeometry(8.3 * u, 1.1 * u, 5, 16)), m.brass));
          ring.rotation.x = Math.PI / 2;
          ring.position.set(x, 1.1 * u, z);
          leaf.things.add(ring);
        }
      }
    }
  }

  /** The tabs over the leaf in an upright view: one for each leaf, the one turned to brightest, and a mark on one with something to spend. */
  private drawTabs(): void {
    const d = this.data;
    if (!d) return;
    for (const tab of this.tabs) {
      const on = tab.key === this.current, spend = tab.key === "you" ? d.points > 0 : tab.key === "perks" ? d.perks.points > 0 : false;
      const key = `${on}|${spend}|${this.over === `tab:${tab.key}`}`;
      if (key === tab.drawn) continue;
      tab.drawn = key;
      tab.label.draw((g, w, h) => {
        g.fillStyle = on ? "#e3d3ae" : "#b79f76";
        g.fillRect(0, 0, w, h);
        g.strokeStyle = "rgba(50,30,10,0.7)";
        g.lineWidth = 4;
        g.strokeRect(2, 2, w - 4, h - 4);
        if (this.over === `tab:${tab.key}` && !on) {
          g.fillStyle = "rgba(255,245,215,0.25)";
          g.fillRect(0, 0, w, h);
        }
        g.fillStyle = on ? INK : ink(0.75);
        g.textAlign = "center";
        fitText(g, SELF_SAYS[tab.key], w / 2, h * 0.7, w - h * 0.7, h * 0.56, h * 0.24, on ? "italic 700" : "italic 600");
        if (spend) {
          g.fillStyle = "#b0582a";
          g.beginPath();
          g.arc(w - h * 0.24, h * 0.25, h * 0.11, 0, Math.PI * 2);
          g.fill();
        }
      });
    }
  }

  /* ------------------------------------------------- touching ------------------------------------------------- */

  /** The middle of a row, in the face's own space. */
  private middle(leaf: Leaf, y: number, h: number): Vector3 {
    const c = leaf.holder.position.clone().add(leaf.hinge.position);
    return V(c.x, 0.003, c.z - this.leafH / 2 + (y + h / 2) * (this.leafW / leaf.uw));
  }

  /** Lay the slip by the row that is picked up: beside its leaf where there is room, else under or over the row. */
  private layPicked(): void {
    const got = this.picked ? this.rowOf(this.picked) : null;
    if (!got || !got.row.slip) {
      this.picked = null;
      return;
    }
    const s = got.row.slip;
    this.slip.set(s.head, s.text, s.note, s.choices.map((c) => c.say));
    const w = this.slip.w * this.slipSmall, deep = this.slip.deep * this.slipSmall;
    const at = this.middle(got.leaf, got.y, got.h);
    const rowH = got.h * (this.leafW / got.leaf.uw);
    let x: number, z: number;
    if (this.narrow) {
      x = 0;
      // Under the row while there is room for it there; else over it. It lies a little above the leaf, and so looks
      // nearer the top of the picture than it is: it is put that much lower, to leave its row clear.
      const under = at.z + rowH / 2 + deep / 2 + 0.009, over = at.z - rowH / 2 - deep / 2 - 0.003;
      z = under + deep / 2 <= this.H / 2 - 0.002 ? under : over - deep / 2 >= -this.H / 2 + 0.002 ? over : Math.min(this.H / 2 - deep / 2 - 0.002, under);
    } else {
      // Over the next leaf, clear of the one the row is on: to the right of the first two, to the left of the last.
      const side = got.leaf.key === "perks" ? -1 : 1;
      x = at.x + side * (this.leafW / 2 + 0.003 + w / 2);
      z = at.z;
    }
    x = Math.max(-this.W / 2 + w / 2 + 0.002, Math.min(this.W / 2 - w / 2 - 0.002, x));
    z = Math.max(-this.H / 2 + deep / 2 + 0.002, Math.min(this.H / 2 - deep / 2 - 0.002, z));
    this.slipAt.set(x, 0.014, z);
  }

  parts(): Part[] {
    if (!this.isOpen || !this.data || this.openK < 0.75) return [];
    const out: Part[] = [];
    if (this.picked) out.push(...this.slip.parts());
    const w = this.slip.w * this.slipSmall / 2 + 0.002, deep = this.slip.deep * this.slipSmall / 2 + 0.002;
    const under = (p: Vector3): boolean => !!this.picked && Math.abs(p.x - this.slipAt.x) < w && Math.abs(p.z - this.slipAt.z) < deep;
    if (this.narrow) {
      const tabW = (this.W - 0.004) / 3;
      this.tabs.forEach((tab, i) => out.push(this.partAt(`tab:${tab.key}`, (i - 1) * tabW, 0.002, -this.H / 2 + 0.0105, tabW * 0.5, this.face)));
    }
    for (const leaf of this.shown()) {
      for (const [id, at] of leaf.at) {
        if (id === this.picked) continue;
        const mid = this.middle(leaf, at.y, at.h);
        if (under(mid)) continue;
        out.push(this.partAt(id, mid.x, mid.y, mid.z, this.leafW * 0.47, this.face));
      }
    }
    // The board itself, under everything: a touch on it puts down what is picked up.
    if (this.picked) out.push({ ...this.partAt("leaf", 0, 0, 0, Math.max(this.W, this.H) * 0.5, this.face), under: true });
    return out;
  }

  hover(id: string | null): void {
    if (id === this.over) return;
    const was = this.over;
    this.over = id;
    this.slip.hover(id);
    for (const leaf of this.shown()) if ([was, id].some((x) => x && leaf.at.has(x))) this.drawLeaf(leaf);
    if ([was, id].some((x) => x?.startsWith("tab:"))) this.drawTabs();
  }

  touch(id: string): void {
    const d = this.data;
    if (!d) return;
    const x = this.group.position.x;
    if (id.startsWith("choice:")) {
      const choice = (this.picked ? this.rowOf(this.picked)?.row.slip : undefined)?.choices[Number(id.slice(7))];
      if (choice) this.h.write(choice.line);
      return;
    }
    if (id.startsWith("tab:")) {
      this.current = id.slice(4) as LeafKey;
      this.picked = null;
      sound.play("pat", { x, gain: 0.45, rate: 1.2 });
      this.arrange();
      this.h.tell(SELF_SAYS[this.current]);
      return;
    }
    if (id.startsWith("more:")) {
      const leaf = this.leaves.find((l) => l.key === id.slice(5));
      if (!leaf) return;
      leaf.page = (leaf.page + 1) % leaf.pages.length;
      this.picked = null;
      sound.play("slide", { x, gain: 0.35, rate: 1.3 });
      this.drawLeaf(leaf);
      this.dress(leaf);
      return;
    }
    const was = this.picked;
    const got = id === "leaf" ? null : this.rowOf(id);
    this.picked = got?.row.slip && was !== id ? id : null;
    if (this.picked) {
      sound.play("pat", { x, gain: 0.45 });
      const s = got!.row.slip!;
      this.h.tell(`${got!.row.says ?? s.head}${s.choices.length ? ` You can: ${s.choices.map((c) => c.say).join("; ")}.` : ""}`);
    }
    this.layPicked();
    for (const leaf of this.shown()) if ([was, this.picked].some((p) => p && leaf.at.has(p))) this.drawLeaf(leaf);
  }

  /** For checks: what is laid out. */
  get state(): { open: boolean; leaf: LeafKey; picked: string | null; pages: Record<LeafKey, number>; choices: number } {
    const pages = Object.fromEntries(this.leaves.map((l) => [l.key, l.pages.length])) as Record<LeafKey, number>;
    return { open: this.isOpen, leaf: this.current, picked: this.picked, pages, choices: this.picked ? this.slip.count : 0 };
  }

  /* ------------------------------------------------- every frame ------------------------------------------------- */

  update(dt: number, t: number): void {
    const still = this.h.reduced;
    const to = (now: number, want: number, rate: number): number => (still || Math.abs(want - now) < 0.002 ? want : now + (want - now) * Math.min(1, dt * rate));
    this.openK = to(this.openK, this.isOpen ? 1 : 0, this.isOpen ? 4.2 : 7);
    // The board is put away under the leaves: its pegs and all sink as they come over it.
    const up = 1 - ease(Math.min(1, this.openK * 2.6));
    this.body.visible = up > 0.01;
    this.body.scale.y = Math.max(0.001, up);

    const d = this.data;
    if (d && this.body.visible) {
      this.pegs.forEach((peg) => {
        peg.high = to(peg.high, peg.want, 5);
        peg.shaft.scale.y = peg.high;
        peg.head.position.y = BH + peg.high;
      });
      this.dialTurn = to(this.dialTurn, this.dialWant(), 4);
      this.dial.rotation.y = this.dialTurn;
      this.hpK = to(this.hpK, d.hp[1] ? Math.max(0, Math.min(1, d.hp[0] / d.hp[1])) : 0, 4);
      this.strip.scale.x = Math.max(0.002, this.hpK);
      this.strip.position.x = SX + (SLEN * this.hpK) / 2;
      this.strip.visible = this.hpK > 0.004;
      const slid = this.slid();
      this.beads.forEach((b, i) => {
        b.x = to(b.x, this.beadAt(i, slid), 6);
        b.mesh.position.x = b.x;
      });
      // What is still to spend lies beside it: each piece hops down as it comes.
      const loose = (list: { mesh: Mesh; k: number }[], n: number, rest: number): void =>
        list.forEach((p, i) => {
          p.k = to(p.k, i < n ? 1 : 0, i < n ? 5 : 9);
          p.mesh.visible = p.k > 0.02;
          p.mesh.position.y = rest + (1 - ease(p.k)) * 0.03;
        });
      loose(this.loosePegs, d.points, 0.0045);
      loose(this.looseBeads, d.perks.points, 0.0052);
      for (const seat of this.seated.values()) {
        seat.k = to(seat.k, seat.want, seat.want ? 4 : 9);
        seat.mesh.visible = seat.k > 0.02;
        const rest = BH + seat.mesh.scale.x * 0.72;
        seat.mesh.position.y = rest + (1 - ease(seat.k)) * 0.024;
      }
    }

    this.spread.visible = this.openK > 0.01;
    if (!this.spread.visible) return;
    this.face.position.y = 0.002 + 0.017 * up;
    // The outer leaves swing out from over the middle one; where only one shows, it comes up with its tabs.
    const out = ease(Math.max(0, Math.min(1, (this.openK - 0.18) / 0.82)));
    this.leaves.forEach((leaf, i) => {
      const side = i - 1;
      const on = !this.narrow || leaf.key === this.current;
      leaf.hinge.visible = on;
      if (this.narrow) {
        leaf.hinge.rotation.z = 0;
        leaf.hinge.position.y = 0;
        leaf.holder.scale.setScalar(0.72 + 0.28 * ease(this.openK));
      } else {
        leaf.hinge.rotation.z = side * Math.PI * (1 - out);
        leaf.hinge.position.y = (1 - out) * (side < 0 ? 0.0045 : side > 0 ? 0.009 : 0);
        leaf.holder.scale.setScalar(1);
      }
      if (leaf.label) leaf.label.glow = 0.15;
    });
    for (const tab of this.tabs) {
      tab.label.mesh.visible = this.narrow && this.openK > 0.4;
      tab.label.mesh.scale.setScalar(0.6 + 0.4 * ease(this.openK));
    }
    // A bead that can be learned now stirs a little.
    this.stir.forEach((bead, i) => {
      const k = still ? 0 : 0.5 + 0.5 * Math.sin(t * 3.2 + i * 1.1);
      bead.position.y = bead.scale.x * 0.8 + k * bead.scale.x * 0.55;
    });
    this.slipK = to(this.slipK, this.picked && this.isOpen ? 1 : 0, 11);
    this.slip.group.visible = this.slipK > 0.02;
    this.slip.group.position.copy(this.slipAt);
    this.slip.group.scale.setScalar(this.slipSmall * (0.7 + 0.3 * ease(this.slipK)));
  }

  dispose(): void {
    for (const leaf of this.leaves) leaf.label?.dispose();
    for (const tab of this.tabs) tab.label.dispose();
    for (const l of [this.marks, this.cap, this.dialLabel]) l.dispose();
    this.slip.dispose();
    super.dispose();
  }
}
