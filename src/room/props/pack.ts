/**
 * Your satchel and its purse (game/system.ts, Show "pack"): what you carry, your coin, and what can be written with
 * a thing: using it, leaving it behind, selling it while a seller is here, making something out of it and others.
 *
 * Closed, it is a leather satchel with its flap buckled, a roll of linen laid in front of it and a coin purse beside
 * it, the purse as full as your coin and a small slip on it with the count. A thing gained or lost lifts the flap for
 * a moment as a tag goes in or comes out.
 *
 * Open, the flap is thrown back and the linen is unrolled toward you. Each thing you carry lies on it as a paper tag
 * tied with string: its name, how many, and a dot of sealing wax in the colour of its quality; what is worn lies
 * under a chalk line of its own. Your coin is stacked on the cloth with the sum written beside it. A chalk ring on the
 * cloth is for making.
 *
 * Touch a tag and it is picked up over a slip that says what the thing is, with the same few pencilled choices for
 * every thing; each writes a line in the notebook for you to finish. The last of them, on a thing that can go into a
 * making, puts the tag in the chalk ring (which holds as many as the game says a making takes).
 * While anything lies in the ring a line that makes something out of those things is kept up to date on the pad;
 * touching the ring (or the pencilled "write it" under it) takes you to the notebook to say what you make. Touching a
 * tag in the ring takes it out again. More things than the cloth holds are turned to with the pencilled "more".
 *
 * Nothing here knows what any thing is: the choices and every word of every line are the game's.
 */
import { Group, Mesh, Shape, TorusGeometry, Vector3, type MeshStandardMaterial } from "three";
import { makingLine, type PackItem, type Show } from "../../game/system.js";
import { sound } from "../sound.js";
import { leatherCanvas, rng } from "../textures.js";
import { ease } from "../track.js";
import { Choices, fitName, fitText, INK, INK_FONT, Label, PALETTE, paper, PENCIL, PENCIL_FONT, PropBase, QUALITY_WAX, wrapLines, type Lay, type Part, type PropHost } from "./base.js";

type PackShow = Extract<Show, { kind: "pack" }>;

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** A tag's height over its width; how far one lies above the cloth; and how much smaller one is in the chalk ring. */
const TAG_SHAPE = 0.31;
const TAG_Y = 0.0022;
const RINGED = 0.6;
/** How deep the pencilled slips are ("more", "write it"). */
const MORE_H = 0.022;

/** The words of the satchel's own marks: what is chalked on the cloth and pencilled on its slips. */
export const PACK_SAYS = {
  worn: "worn",
  making: "Making",
  write: "write it",
  more: "more",
  empty: "Nothing but your coin.",
  ringHead: "Making",
  ringText: "Things can be made out of other things. Touch a thing and choose to make something with it: it goes in this ring. Then touch the ring and write what you are making, or leave that to chance.",
  ringFull: "The ring holds no more.",
} as const;

/** How a sum is written small: whole up to 9999, then in thousands. */
export const shortSum = (n: number): string => (n < 10000 ? String(Math.round(n)) : `${Math.round(n / 1000)}k`);

interface Tag {
  item: PackItem;
  label: Label;
  /** What moves: the tag lies in it. */
  hold: Group;
  /** What was last drawn on it, and at what width. */
  drawn: string;
  w: number;
  /** Where it is going, in the spread's space, how large and how turned. */
  to: Vector3;
  size: number;
  turn: number;
  /** On the cloth now (on this page, or in the ring, or picked up). */
  on: boolean;
  /** How far along the unrolling its place is: it shows once the cloth has got there. */
  along: number;
  seed: number;
}

export class Pack extends PropBase {
  readonly key = "pack";
  readonly name = "Your satchel";

  private data: PackShow | null = null;
  private tags = new Map<string, Tag>();
  /** The things in the chalk ring, by id, in the order they were put there. */
  private ringed: string[] = [];
  /** The tag picked up to be read, or "ring" for the slip that says what the ring is for. */
  private picked: string | null = null;
  private page = 0;
  private pages = 1;
  private over: string | null = null;

  /* The closed satchel. */
  private flap = new Group();
  private flapK = 0;
  /** A moment of the flap lifting by itself: something has gone in or come out. */
  private stir = 0;
  private bundle: Mesh;
  private purse = new Group();
  private purseHop = 0;
  private count: Label;
  private loose: Mesh[] = [];
  private body = new Group();

  /* The cloth and what lies on it. */
  private cloth: Label | null = null;
  private clothKey = "";
  private pivot = new Group();
  private roll: Mesh;
  private unrollK = 0;
  private slip: Choices;
  private slipK = 0;
  private stack = new Group();
  private stackN = -1;
  private sum: Label;
  private sumKey = "";
  private more: Label;
  private write: Label;
  private gold: MeshStandardMaterial;
  /** Where things are on the cloth, in the spread's space: worked out by `arrange`. */
  private ringAt = V(0, 0, 0);
  private ringR = 0.045;
  private coinAt = V(0, 0, 0);
  private moreAt = V(0, 0, 0);
  private wornAt: { z: number } | null = null;
  private tagW = 0.098;

  constructor(h: PropHost) {
    super(h);
    const k = this.kit;
    const hide = k.skin(leatherCanvas(31, [156, 104, 60]), { rough: 0.72 });
    const dark = k.skin(leatherCanvas(32, [98, 58, 32]), { rough: 0.7 });
    const oxblood = k.skin(leatherCanvas(33, [98, 38, 28]), { rough: 0.72 });
    const brass = k.metal(PALETTE.brass, 0.42);
    const linen = k.paint(PALETTE.linen, 0.95);
    const cord = k.paint(PALETTE.cord, 0.9);
    this.gold = k.metal(0x9a7a34, 0.4);

    // The satchel: a soft body that stands on a wide foot, a flap over its top that hangs down its front with a round
    // lower edge, a strap and buckle down the middle, and a shoulder strap standing in a slack arch behind it.
    const sx = -0.05;
    const bag = k.crook(k.taper(k.box(0.176, 0.072, 0.082, hide, 0.024), 0.06, 0.34), 7, 0.0022);
    bag.position.set(0, 0.036, 0);
    this.body.add(bag);
    // The flap turns on the top of the back.
    this.flap.position.set(0, 0.0705, -0.025);
    const top = k.crook(k.box(0.172, 0.009, 0.058, dark, 0.004), 11, 0.001);
    top.position.set(0, 0.003, 0.027);
    const outline = new Shape();
    const fw = 0.087, fh = 0.06, fr = 0.036;
    outline.moveTo(-fw, 0);
    outline.lineTo(fw, 0);
    outline.lineTo(fw, -fh + fr);
    outline.quadraticCurveTo(fw, -fh, fw - fr, -fh);
    outline.lineTo(-fw + fr, -fh);
    outline.quadraticCurveTo(-fw, -fh, -fw, -fh + fr);
    outline.closePath();
    const front = new Group();
    // It hangs clear of the body, which is fuller toward its foot.
    front.position.set(0, 0.006, 0.056);
    front.rotation.x = -0.22;
    const panel = k.plate(outline, 0.007, dark);
    const strap = k.box(0.024, 0.066, 0.005, hide, 0.002);
    strap.position.set(0, -0.031, 0.0085);
    const tongue = k.box(0.032, 0.018, 0.006, brass, 0.002);
    tongue.position.set(0, -0.047, 0.0115);
    front.add(panel, strap, tongue);
    for (const x of [-0.066, 0.066]) {
      const stud = k.disc(0.0042, 0.003, brass, 8);
      stud.rotation.x = Math.PI / 2;
      stud.position.set(x, -0.014, 0.007);
      front.add(stud);
    }
    this.flap.add(top, front);
    this.body.add(this.flap);
    // The shoulder strap: up from one end of the bag and down to the other, fallen back a little.
    const sling = k.cast(new Mesh(k.geo(new TorusGeometry(0.084, 0.0042, 5, 22, Math.PI)), hide));
    sling.scale.set(1, 0.62, 2.4);
    sling.rotation.x = -0.5;
    sling.position.set(0, 0.05, -0.018);
    this.body.add(sling);
    for (const x of [-0.084, 0.084]) {
      const ring = k.cast(new Mesh(k.geo(new TorusGeometry(0.007, 0.0018, 4, 10)), brass));
      ring.rotation.y = Math.PI / 2;
      ring.position.set(x * 0.985, 0.05, -0.018);
      this.body.add(ring);
    }
    this.body.position.set(sx, 0, -0.012);
    this.body.rotation.y = 0.05;
    this.group.add(this.body);

    // The linen, rolled and tied, in front of the satchel: it is what is unrolled when the satchel is opened.
    this.bundle = k.crook(k.disc(0.0125, 0.15, linen, 10), 15, 0.001);
    this.bundle.rotation.z = Math.PI / 2;
    this.bundle.position.set(sx + 0.078, 0.0125, 0.062);
    for (const at of [0.03, 0.118]) {
      const tie = k.disc(0.0135, 0.006, cord, 10);
      tie.position.y = at;
      this.bundle.add(tie);
    }
    this.group.add(this.bundle);

    // The purse: a small drawn-up pouch, with a slip against it for the count and a coin or two beside it.
    const pouch = k.crook(
      k.lathe([[0, 0], [0.019, 0.001], [0.028, 0.011], [0.03, 0.024], [0.024, 0.036], [0.012, 0.044], [0.013, 0.048], [0.019, 0.056], [0.013, 0.057], [0, 0.05]], oxblood, 11),
      21,
      0.0016,
    );
    const neck = k.cast(new Mesh(k.geo(new TorusGeometry(0.0135, 0.0028, 5, 12)), cord));
    neck.rotation.x = Math.PI / 2;
    neck.position.y = 0.046;
    this.purse.add(pouch, neck);
    this.purse.position.set(0.108, 0, 0.012);
    this.group.add(this.purse);
    this.count = new Label(0.05, 0.024, { px: 2000 });
    this.count.mesh.rotation.x = -0.9;
    this.count.mesh.position.set(0.106, 0.011, 0.052);
    this.count.mesh.castShadow = true;
    this.count.glow = 0.14;
    this.group.add(this.count.mesh);
    for (const [x, z, turn] of [[0.146, 0.04, 0.4], [0.151, 0.012, 1.9], [0.07, 0.058, 2.6]] as const) {
      const coin = k.disc(0.0105, 0.0026, this.gold, 12);
      coin.position.set(x, 0, z);
      coin.rotation.y = turn;
      coin.visible = false;
      this.loose.push(coin);
      this.group.add(coin);
    }

    // What lies on the cloth while it is open.
    this.spread.add(this.pivot);
    this.roll = k.disc(1, 1, linen, 10);
    this.roll.rotation.z = Math.PI / 2;
    this.spread.add(this.roll);
    this.slip = new Choices(0.2);
    this.slip.group.visible = false;
    this.spread.add(this.slip.group);
    this.spread.add(this.stack);
    this.sum = new Label(0.1, 0.05, { flat: true });
    this.more = new Label(0.09, MORE_H, { flat: true });
    this.write = new Label(0.09, MORE_H, { flat: true });
    for (const l of [this.sum, this.more, this.write]) {
      l.glow = 0.14;
      l.mesh.visible = false;
      this.spread.add(l.mesh);
    }
    this.spread.visible = false;
  }

  /* ------------------------------------------------- what the game shows ------------------------------------------------- */

  show(shows: readonly Show[]): boolean {
    const next = shows.find((s): s is PackShow => s.kind === "pack") ?? null;
    const before = this.data;
    this.data = next;
    if (!next) {
      for (const tag of this.tags.values()) this.dropTag(tag);
      this.tags.clear();
      this.ringed = [];
      this.picked = null;
      return false;
    }
    // What has come and what has gone since last time, shown on the satchel as it lies closed.
    if (before) {
      const had = new Map(before.items.map((i) => [i.id, i.qty]));
      const has = new Map(next.items.map((i) => [i.id, i.qty]));
      const came = next.items.some((i) => (had.get(i.id) ?? 0) < i.qty);
      const went = before.items.some((i) => (has.get(i.id) ?? 0) < i.qty);
      if (came || went) this.stirred(came);
      if (before.money !== next.money) this.clink();
    }
    for (const [id, tag] of this.tags) {
      if (next.items.some((i) => i.id === id)) continue;
      this.dropTag(tag);
      this.tags.delete(id);
    }
    next.items.forEach((item, n) => {
      let tag = this.tags.get(item.id);
      if (!tag) {
        const hold = new Group();
        hold.visible = false;
        this.spread.add(hold);
        // Each tag is a little out of true, the same way every time.
        const r = rng(1000 + n * 37 + item.id.length * 11);
        tag = { item, label: null as unknown as Label, hold, drawn: "", w: 0, to: V(0, TAG_Y, 0), size: 1, turn: 0, on: false, along: 0, seed: (r() - 0.5) * 0.09 };
        this.tags.set(item.id, tag);
      }
      tag.item = item;
    });
    const ringed = this.ringed.filter((id) => this.tags.has(id));
    const changed = ringed.length !== this.ringed.length;
    this.ringed = ringed;
    if (this.picked && this.picked !== "ring" && !this.tags.has(this.picked)) this.picked = null;
    if (changed) this.keepLine();
    this.drawCount();
    this.arrange();
    return next.items.length > 0 || next.money > 0;
  }

  /** The player's line has gone to the narrator: what was set aside for a making is no longer waiting. */
  sent(): void {
    if (!this.ringed.length) return;
    this.ringed = [];
    this.arrange();
  }

  private dropTag(tag: Tag): void {
    this.spread.remove(tag.hold);
    tag.label?.dispose();
  }

  /** The flap lifts for a moment as a thing goes in or comes out. */
  private stirred(came: boolean): void {
    if (this.isOpen) return;
    const x = this.group.position.x;
    void this.h.tracks.run([
      { dur: 0.22, begin: () => sound.play(came ? "pat" : "slide", { x, gain: 0.5, rate: came ? 0.9 : 1.2 }), tick: (u) => (this.stir = ease(u)) },
      { dur: 0.4, tick: (u) => (this.stir = 1 - ease(u)) },
    ]);
  }

  /** The purse hops as coin goes in or out. */
  private clink(): void {
    const x = this.group.position.x;
    void this.h.tracks.run([{ dur: 0.45, begin: () => sound.play("token", { x, gain: 0.6 }), tick: (u) => (this.purseHop = Math.sin(Math.PI * u)) }]);
  }

  /** The count on the purse's slip, how full the purse is, and the coins beside it. */
  private drawCount(): void {
    const d = this.data;
    if (!d) return;
    const full = d.money <= 0 ? 0 : Math.min(1, Math.log10(d.money + 1) / 3);
    this.purse.scale.set(0.82 + full * 0.33, d.money > 0 ? 0.86 + full * 0.22 : 0.55, 0.82 + full * 0.33);
    this.loose.forEach((c, i) => (c.visible = d.money > [0, 20, 200][i]!));
    const key = `${d.money}`;
    if (key === this.sumKey.split("|")[0]) return;
    this.count.draw((g, w, h) => {
      paper(g, w, h, 23);
      g.fillStyle = INK;
      g.textAlign = "center";
      fitText(g, shortSum(d.money), w / 2, h * 0.76, w - 10, h * 0.78, h * 0.4, "700");
    });
  }

  /* ------------------------------------------------- opening and closing ------------------------------------------------- */

  place(lay: Lay, narrow: boolean): void {
    super.place(lay, narrow);
    // The writing is larger where the whole patch is drawn smaller.
    this.spread.remove(this.slip.group);
    this.slip.dispose();
    this.slip = new Choices(narrow ? Math.min(0.28, lay.spread.w - 0.016) : 0.2, narrow ? 0.0135 : 0.0085);
    this.slip.group.visible = false;
    this.spread.add(this.slip.group);
    this.clothKey = "";
    this.arrange();
  }

  open(): void {
    super.open();
    this.page = Math.min(this.page, this.pages - 1);
    this.picked = null;
    // A making whose line has been rubbed off the pad is given up: its things lie with the rest again.
    if (this.ringed.length && !this.h.kept()) this.ringed = [];
    this.arrange();
    sound.play("unroll", { x: this.group.position.x, gain: 0.5 });
    const d = this.data;
    if (d) this.h.tell(`${this.name}, open. ${d.items.length ? `You carry: ${d.items.map((i) => `${i.name}${i.qty > 1 ? `, ${i.qty}` : ""}${i.worn ? `, ${PACK_SAYS.worn}` : ""}`).join("; ")}.` : PACK_SAYS.empty} ${d.money} ${d.coin}.`);
  }

  close(): void {
    if (!this.isOpen) return;
    super.close();
    this.picked = null;
    this.over = null;
    this.arrange();
    sound.play("rollup", { x: this.group.position.x, gain: 0.35, rate: 1.3 });
  }

  /* ------------------------------------------------- laying it out ------------------------------------------------- */

  /**
   * Work out where everything lies on the cloth: the tags in rows, what is worn under its own chalk line, the chalk
   * ring with what is in it, your coin and its sum, and the tag that is picked up over its slip.
   */
  private arrange(): void {
    const lay = this.lay, d = this.data;
    if (!lay || !d) return;
    const W = lay.spread.w, H = lay.spread.h, m = 0.014;
    const narrow = this.narrow;
    // Tags fill the patch but for a panel that holds the ring and the coin: at the right, or along the foot when upright.
    const panel = narrow ? 0.142 : 0.112;
    const gx0 = -W / 2 + m, gx1 = narrow ? W / 2 - m : W / 2 - m - panel;
    const gz0 = -H / 2 + m, gzEnd = narrow ? H / 2 - m - panel : H / 2 - m;
    this.ringR = narrow ? 0.046 : 0.043;
    if (narrow) {
      // The ring under its chalked word at the left of the panel, the coin and its sum at the right.
      this.ringAt.set(-W / 4 + 0.006, 0, H / 2 - m - this.ringR - 0.026);
      this.coinAt.set(W / 4 - 0.002, 0, H / 2 - m - 0.03);
    } else {
      this.ringAt.set(W / 2 - m - panel / 2, 0, -H / 2 + m + 0.021 + this.ringR);
      this.coinAt.set(W / 2 - m - panel / 2, 0, H / 2 - m - 0.075);
    }
    const gap = 0.006;
    // The tags in the order they are carried, then a chalk line and what is worn; pages of as many rows as fit.
    const loose = d.items.filter((i) => !i.worn && !this.ringed.includes(i.id));
    const worn = d.items.filter((i) => i.worn && !this.ringed.includes(i.id));
    // As large as shows everything at once: fewer across while it all still fits, down to the smallest that reads.
    const most = Math.max(1, Math.floor((gx1 - gx0 + gap) / ((narrow ? 0.125 : 0.092) + gap)));
    const widest = narrow ? 0.2 : 0.142;
    const sized = (c: number, gz1: number): { tw: number; rows: number } => {
      const w = Math.min(widest, (gx1 - gx0 - (c - 1) * gap) / c);
      return { tw: w, rows: Math.max(1, Math.floor((gz1 - gz0 + gap) / (w * TAG_SHAPE + gap))) };
    };
    let cols = most, gz1 = gzEnd;
    // Counted with what is in the ring, so the tags keep their size as things go in and out of it.
    const wornAll = d.items.filter((i) => i.worn).length, looseAll = d.items.length - wornAll;
    const fits = (c: number): boolean => Math.ceil(looseAll / c) + Math.ceil(wornAll / c) + (wornAll ? 0.55 : 0) <= sized(c, gz1).rows;
    for (let c = 1; c <= most; c++) {
      if (fits(c)) {
        cols = c;
        break;
      }
    }
    // More than the cloth holds: the foot of the tags is kept for the pencilled "more".
    if (!fits(cols)) gz1 -= MORE_H + gap;
    this.moreAt.set(gx1 - 0.045, 0.003, gz1 + gap + MORE_H / 2);
    const tw = sized(cols, gz1).tw;
    const th = tw * TAG_SHAPE;
    const pitch = th + gap;
    this.tagW = tw;
    const rowsMost = sized(cols, gz1).rows;
    type Row = { ids: string[]; line?: boolean };
    const rows: Row[] = [];
    for (let i = 0; i < loose.length; i += cols) rows.push({ ids: loose.slice(i, i + cols).map((x) => x.id) });
    for (let i = 0; i < worn.length; i += cols) rows.push({ ids: worn.slice(i, i + cols).map((x) => x.id), line: i === 0 });
    // The chalk line takes half a row above the first row of what is worn.
    const lineH = pitch * 0.55;
    const pages: Row[][] = [[]];
    let tall = 0;
    for (const row of rows) {
      const need = pitch + (row.line ? lineH : 0);
      if (tall + need > rowsMost * pitch + 1e-6 && pages[pages.length - 1]!.length) {
        pages.push([]);
        tall = 0;
      }
      pages[pages.length - 1]!.push(row);
      tall += need;
    }
    this.pages = pages.length;
    this.page = Math.max(0, Math.min(this.pages - 1, this.page));
    for (const tag of this.tags.values()) tag.on = false;
    this.wornAt = null;
    let z = gz0;
    for (const row of pages[this.page]!) {
      if (row.line) {
        this.wornAt = { z: z + lineH * 0.5 };
        z += lineH;
      }
      row.ids.forEach((id, c) => {
        const tag = this.tags.get(id)!;
        tag.on = true;
        tag.to.set(gx0 + tw / 2 + c * (tw + gap), TAG_Y, z + th / 2);
        tag.size = 1;
        tag.turn = tag.seed;
      });
      z += pitch;
    }
    // What is in the ring lies there, fanned, smaller.
    this.ringed.forEach((id, i) => {
      const tag = this.tags.get(id);
      if (!tag) return;
      const n = this.ringed.length;
      tag.on = true;
      // One under the other, each whole, a little out of line.
      const size = Math.min(RINGED, (this.ringR * 1.62) / tw);
      const step = Math.min(tw * TAG_SHAPE * size * 1.06, (this.ringR * 1.7) / n);
      tag.to.set(this.ringAt.x + (n > 1 ? (i - (n - 1) / 2) * 0.003 : 0), TAG_Y + 0.0012 * (i + 1), this.ringAt.z + (i - (n - 1) / 2) * step);
      tag.size = size;
      tag.turn = (i - (n - 1) / 2) * 0.07 + tag.seed;
    });
    // The tag picked up lies over the top of its slip, in the middle of the tags, nearer your eye.
    const picked = this.picked && this.picked !== "ring" ? this.tags.get(this.picked) : undefined;
    const d0 = this.data!;
    if (picked) {
      const it = picked.item;
      this.slip.set("", it.text, it.note ?? "", [...it.choices.map((c) => c.say), ...(this.canMake(it) ? [d0.making!.say] : [])]);
    } else if (this.picked === "ring") this.slip.set(PACK_SAYS.ringHead, PACK_SAYS.ringText, d0.making?.at ?? "", []);
    if (this.picked) {
      const big = picked ? Math.min(1.45, (this.slip.w * 0.92) / tw) : 0;
      const head = picked ? th * big : 0;
      const cx = Math.max(-W / 2 + this.slip.w / 2 + 0.004, Math.min(W / 2 - this.slip.w / 2 - 0.004, picked ? (gx0 + gx1) / 2 : this.ringAt.x - (narrow ? 0 : 0.07)));
      const top = Math.max(-H / 2 + 0.004, Math.min(H / 2 - 0.004 - head - this.slip.deep, -(head + this.slip.deep) / 2 - (narrow ? 0.03 : 0)));
      this.slip.group.position.set(cx, 0.03, top + head - 0.003 + this.slip.deep / 2);
      if (picked) {
        picked.on = true;
        picked.to.set(cx, 0.0315, top + head / 2);
        picked.size = big;
        picked.turn = 0;
      }
    }
    for (const tag of this.tags.values()) {
      tag.along = narrow ? (tag.to.z + H / 2) / H : (tag.to.x + W / 2) / W;
      if (tag.on) this.drawTag(tag, tw);
    }
    this.drawCloth(W, H);
    this.drawSum();
    this.drawMarks();
  }

  /** A tag: a paper label cut at one end and tied with string, the thing's name on it, how many, and its dot of wax. */
  private drawTag(tag: Tag, w: number): void {
    const it = tag.item;
    const key = `${it.name}|${it.qty}|${it.quality}|${w.toFixed(4)}`;
    if (key === tag.drawn) return;
    if (!tag.label || Math.abs(tag.w - w) > 1e-5) {
      if (tag.label) {
        tag.hold.remove(tag.label.mesh);
        tag.label.dispose();
      }
      tag.label = new Label(w, w * TAG_SHAPE, { flat: true, clear: true });
      tag.label.glow = 0.12;
      tag.hold.add(tag.label.mesh);
      tag.w = w;
    }
    tag.drawn = key;
    tag.label.draw((g, pw, ph) => {
      const cut = ph * 0.3, x0 = ph * 0.34;
      // The string, looped through the hole and trailing off the end.
      g.strokeStyle = "#7a5a34";
      g.lineWidth = Math.max(2, ph * 0.045);
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(x0 + ph * 0.2, ph * 0.5);
      g.bezierCurveTo(x0 * 0.5, ph * 0.2, x0 * 0.1, ph * 0.35, 3, ph * 0.22);
      g.moveTo(x0 + ph * 0.2, ph * 0.5);
      g.bezierCurveTo(x0 * 0.5, ph * 0.8, x0 * 0.2, ph * 0.6, 5, ph * 0.82);
      g.stroke();
      // The tag itself.
      g.save();
      g.beginPath();
      g.moveTo(x0 + cut, 2);
      g.lineTo(pw - 3, 2);
      g.lineTo(pw - 3, ph - 2);
      g.lineTo(x0 + cut, ph - 2);
      g.lineTo(x0, ph - cut);
      g.lineTo(x0, cut);
      g.closePath();
      g.clip();
      paper(g, pw, ph, 40 + it.name.length * 7, "#e2d6b4");
      g.restore();
      g.strokeStyle = "rgba(36,22,12,0.55)";
      g.lineWidth = 2;
      g.stroke();
      // The hole, with the string through it.
      g.fillStyle = "#3a2a1a";
      g.beginPath();
      g.arc(x0 + ph * 0.2, ph * 0.5, ph * 0.075, 0, Math.PI * 2);
      g.fill();
      // The wax, at the far end: a dot in the colour of how good the thing is.
      const wr = ph * 0.2, wx = pw - 3 - wr - ph * 0.12, wy = ph * 0.5;
      g.fillStyle = QUALITY_WAX[it.quality] ?? QUALITY_WAX.common!;
      g.beginPath();
      for (let a = 0; a <= 12; a++) {
        const t = (a / 12) * Math.PI * 2;
        const r = wr * (1 + 0.1 * Math.sin(t * 3 + it.name.length));
        g.lineTo(wx + Math.cos(t) * r, wy + Math.sin(t) * r);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(20,10,5,0.5)";
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = "rgba(255,240,220,0.3)";
      g.beginPath();
      g.arc(wx - wr * 0.3, wy - wr * 0.3, wr * 0.3, 0, Math.PI * 2);
      g.fill();
      // How many, before the wax; then the name in what is left.
      const left = x0 + ph * 0.42;
      let right = wx - wr - ph * 0.14;
      g.fillStyle = INK;
      if (it.qty > 1) {
        g.font = `600 ${Math.round(ph * 0.34)}px ${INK_FONT}`;
        const many = `×${it.qty}`;
        right -= g.measureText(many).width;
        g.fillText(many, right, ph * 0.63);
        right -= ph * 0.12;
      }
      fitName(g, it.name, left, ph * 0.5, right - left, ph * 0.42, ph * 0.27, "italic 700");
    });
  }

  /** The cloth: woven linen with a stitched hem, and chalked on it the ring for making and the line over what is worn. */
  private drawCloth(W: number, H: number): void {
    const d = this.data!;
    const key = `${W}|${H}|${this.ringAt.x.toFixed(3)},${this.ringAt.z.toFixed(3)}|${this.wornAt?.z.toFixed(4) ?? ""}|${d.making?.at ?? (d.making ? "-" : "none")}`;
    if (key === this.clothKey && this.cloth) return;
    this.clothKey = key;
    const cw = W - 0.006, ch = H - 0.006;
    if (!this.cloth || Math.abs(this.cloth.w - cw) > 1e-6 || Math.abs(this.cloth.h - ch) > 1e-6) {
      if (this.cloth) {
        this.pivot.remove(this.cloth.mesh);
        this.cloth.dispose();
      }
      this.cloth = new Label(cw, ch, { flat: true, px: 1700 });
      this.cloth.glow = 0.05;
      this.cloth.mat.roughness = 1;
      this.pivot.add(this.cloth.mesh);
    }
    const narrow = this.narrow;
    // The cloth is unrolled from the edge nearest the satchel: its left, or its top when the view is upright.
    this.pivot.position.set(narrow ? 0 : -cw / 2, 0, narrow ? -ch / 2 : 0);
    this.cloth.mesh.position.set(narrow ? 0 : cw / 2, 0, narrow ? ch / 2 : 0);
    this.cloth.draw((g, pw, ph) => {
      const px = pw / cw;
      g.fillStyle = "#75654a";
      g.fillRect(0, 0, pw, ph);
      // The weave: threads both ways, uneven.
      const r = rng(91);
      for (let y = 0; y < ph; y += 3) {
        g.fillStyle = `rgba(${r() < 0.5 ? "30,20,10" : "200,180,140"},${0.05 + r() * 0.07})`;
        g.fillRect(0, y, pw, 1 + (r() < 0.3 ? 1 : 0));
      }
      for (let x = 0; x < pw; x += 3) {
        g.fillStyle = `rgba(${r() < 0.5 ? "30,20,10" : "200,180,140"},${0.04 + r() * 0.06})`;
        g.fillRect(x, 0, 1 + (r() < 0.3 ? 1 : 0), ph);
      }
      for (let i = 0; i < 14; i++) {
        g.fillStyle = `rgba(40,25,10,${0.03 + r() * 0.05})`;
        g.beginPath();
        g.ellipse(r() * pw, r() * ph, 20 + r() * 90, 14 + r() * 60, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      // The hem: a darker edge and a line of stitches.
      g.strokeStyle = "rgba(30,18,8,0.5)";
      g.lineWidth = 10;
      g.strokeRect(0, 0, pw, ph);
      g.strokeStyle = "rgba(215,195,150,0.5)";
      g.lineWidth = 2.5;
      g.setLineDash([9, 7]);
      g.strokeRect(11, 11, pw - 22, ph - 22);
      g.setLineDash([]);
      const at = (x: number, z: number): [number, number] => [(x + cw / 2) * px, (z + ch / 2) * px];
      const chalk = "rgba(232,224,204,0.82)";
      // The chalk ring, drawn round twice by an unsteady hand, and what it is for.
      if (d.making) {
        const [cx, cy] = at(this.ringAt.x, this.ringAt.z);
        g.strokeStyle = chalk;
        g.lineCap = "round";
        for (let pass = 0; pass < 2; pass++) {
          g.lineWidth = 3.2 - pass;
          g.beginPath();
          for (let a = 0; a <= 40; a++) {
            const t = (a / 40) * Math.PI * 2 + pass * 0.4;
            const rr = this.ringR * px * (1 + 0.035 * Math.sin(t * 3 + pass * 2) + (pass ? 0.03 : 0));
            g.lineTo(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr);
          }
          g.stroke();
        }
        g.fillStyle = chalk;
        g.textAlign = "center";
        // What the ring is for, and where it is done when the place has somewhere: "Making at the forge".
        const cap = this.ringR * px * 0.4;
        fitText(g, d.making.at ? `${PACK_SAYS.making} ${d.making.at}` : PACK_SAYS.making, cx, cy - this.ringR * px - cap * 0.42, this.ringR * px * 2.5, cap, cap * 0.45, "italic 600");
        g.textAlign = "left";
      }
      // The line over what is worn.
      if (this.wornAt) {
        const [x0, y0] = at(-W / 2 + 0.014, this.wornAt.z);
        const size = this.tagW * TAG_SHAPE * px * 0.42;
        g.fillStyle = chalk;
        g.font = `italic 600 ${Math.round(size)}px ${INK_FONT}`;
        g.fillText(PACK_SAYS.worn, x0 + 4, y0 + size * 0.35);
        const from = x0 + g.measureText(PACK_SAYS.worn).width + 14;
        const to = at(this.narrow ? W / 2 - 0.014 : W / 2 - 0.014 - 0.118, 0)[0];
        g.strokeStyle = chalk;
        g.lineWidth = 2.5;
        g.setLineDash([14, 9]);
        g.beginPath();
        g.moveTo(from, y0);
        g.lineTo(to, y0 + 2);
        g.stroke();
        g.setLineDash([]);
      }
    });
  }

  /** Your coin: a stack or two on the cloth, and a slip beside it with the sum and what is written about it. */
  private drawSum(): void {
    const d = this.data!;
    // A coin for each doubling: a few for a little, two stacks for a great deal; never a count to be read.
    const n = d.money <= 0 ? 0 : Math.min(14, 1 + Math.floor(Math.log2(d.money + 1) * 1.1));
    if (n !== this.stackN) {
      this.stackN = n;
      this.stack.clear();
      for (let i = 0; i < n; i++) {
        const coin = this.kit.disc(0.0105, 0.0026, this.gold, 12);
        const second = i >= 8;
        const j = second ? i - 8 : i;
        coin.position.set((second ? 0.027 : 0) + Math.sin(j * 2.1) * 0.0012, j * 0.0027, (second ? 0.006 : 0) + Math.cos(j * 1.7) * 0.0012);
        coin.rotation.y = j * 1.3;
        this.stack.add(coin);
      }
    }
    const key = `${d.money}|${d.coin}|${d.notes.join("|")}`;
    if (key === this.sumKey) return;
    this.sumKey = key;
    this.sum.draw((g, w, h) => {
      paper(g, w, h, 61);
      g.fillStyle = INK;
      const big = h * 0.3;
      fitText(g, `${d.money} ${d.coin}`, 12, big * 1.1, w - 24, big, big * 0.5, "italic 700");
      g.fillStyle = PENCIL;
      const small = Math.round(h * 0.15);
      g.font = `${small}px ${PENCIL_FONT}`;
      let y = big * 1.1 + small * 1.5;
      for (const line of wrapLines(g, d.notes.join(" "), w - 24, 3)) {
        g.fillText(line, 12, y);
        y += small * 1.25;
      }
    });
  }

  /** The pencilled marks: "more" when there is more than the cloth holds, "write it" under a ring with something in it. */
  private drawMarks(): void {
    const mark = (label: Label, text: string): void =>
      label.draw((g, w, h) => {
        paper(g, w, h, 71);
        g.fillStyle = PENCIL;
        g.textAlign = "center";
        fitText(g, text, w / 2, h * 0.72, w - 14, h * 0.62, h * 0.35, "600", PENCIL_FONT);
      });
    mark(this.more, `${PACK_SAYS.more} (${this.page + 1} of ${this.pages}) ›`);
    mark(this.write, `${PACK_SAYS.write} ›`);
  }

  /* ------------------------------------------------- touching ------------------------------------------------- */

  parts(): Part[] {
    const lay = this.lay, d = this.data;
    if (!this.isOpen || !lay || !d || this.unrollK < 0.6) return [];
    const out: Part[] = [];
    if (this.picked) out.push(...this.slip.parts());
    // A tag under the slip cannot be touched through it.
    const s = this.slip.group.position, half = this.slip.w / 2 + 0.004, deep = this.slip.deep / 2 + 0.004;
    const covered = (to: Vector3): boolean => !!this.picked && Math.abs(to.x - s.x) < half && to.z > s.z - deep - this.tagW * TAG_SHAPE * 1.5 && to.z < s.z + deep;
    for (const [id, tag] of this.tags) {
      if (!tag.on || id === this.picked) continue;
      if (!this.ringed.includes(id) && covered(tag.to)) continue;
      out.push(this.partAt(`tag:${id}`, tag.to.x, tag.to.y, tag.to.z, this.tagW * tag.size * 0.5));
    }
    if (d.making) {
      out.push(this.partAt("ring", this.ringAt.x, 0.002, this.ringAt.z, this.ringR, this.spread));
      if (this.ringed.length) out.push(this.partAt("write", this.write.mesh.position.x, 0.003, this.write.mesh.position.z, 0.045));
    }
    if (this.pages > 1) out.push(this.partAt("more", this.moreAt.x, 0.003, this.moreAt.z, 0.045));
    // The cloth itself, under everything: a touch on it puts down what is picked up.
    if (this.picked) out.push({ ...this.partAt("cloth", 0, 0, 0, Math.max(lay.spread.w, lay.spread.h) * 0.5), under: true });
    return out;
  }

  hover(id: string | null): void {
    this.over = id;
    this.slip.hover(id);
  }

  touch(id: string): void {
    const d = this.data;
    if (!d) return;
    const x = this.group.position.x;
    if (id.startsWith("choice:")) {
      const tag = this.picked ? this.tags.get(this.picked) : undefined;
      if (!tag) return;
      const i = Number(id.slice(7));
      const choice = tag.item.choices[i];
      if (choice) {
        this.h.write(choice.line);
        return;
      }
      // The last choice sets it in the chalk ring, with the others to be made into something.
      if (this.canMake(tag.item) && i === tag.item.choices.length) {
        if (this.ringed.length >= d.making!.most) {
          this.h.tell(PACK_SAYS.ringFull);
          return;
        }
        this.ringed.push(tag.item.id);
        this.picked = null;
        sound.play("slide", { x, gain: 0.45, rate: 1.1 });
        this.keepLine();
        this.arrange();
      }
      return;
    }
    if (id.startsWith("tag:")) {
      const key = id.slice(4);
      const tag = this.tags.get(key);
      if (!tag) return;
      if (this.ringed.includes(key)) {
        // Out of the ring again, back among the rest.
        this.ringed = this.ringed.filter((r) => r !== key);
        this.picked = null;
        sound.play("slide", { x, gain: 0.4, rate: 0.9 });
        this.keepLine();
        this.arrange();
        return;
      }
      this.picked = key;
      sound.play("pat", { x, gain: 0.5 });
      this.arrange();
      const it = tag.item;
      this.h.tell(`${it.name}${it.qty > 1 ? `, ${it.qty}` : ""}. ${it.text} ${it.note ?? ""} You can: ${[...it.choices.map((c) => c.say), ...(this.canMake(it) ? [d.making!.say] : [])].join("; ")}.`);
      return;
    }
    if (id === "ring" || id === "write") {
      if (this.ringed.length) {
        this.h.notebook();
        return;
      }
      this.picked = this.picked === "ring" ? null : "ring";
      this.arrange();
      if (this.picked) this.h.tell(`${PACK_SAYS.ringHead}. ${PACK_SAYS.ringText}`);
      return;
    }
    if (id === "more") {
      this.page = (this.page + 1) % this.pages;
      this.picked = null;
      sound.play("slide", { x, gain: 0.4, rate: 1.25 });
      this.arrange();
      return;
    }
    if (id === "cloth") {
      this.picked = null;
      this.arrange();
    }
  }

  /** Whether a thing can be set in the chalk ring: the game says which can and how many; one already there cannot again. */
  private canMake(it: PackItem): boolean {
    const making = this.data?.making;
    return !!making && it.makes && !this.ringed.includes(it.id) && this.ringed.length < making.most;
  }

  /** The line that makes something out of what is in the ring, kept up to date on the pad; taken off when the ring is empty. */
  private keepLine(): void {
    const d = this.data;
    const called = this.ringed.flatMap((id) => (this.tags.get(id) ? [this.tags.get(id)!.item.called] : []));
    this.h.keep(d?.making ? makingLine(d.making, called) : "");
  }

  /** For checks: what lies where. */
  get state(): { open: boolean; tags: string[]; ringed: string[]; picked: string | null; page: number; pages: number; choices: number } {
    return { open: this.isOpen, tags: [...this.tags.values()].filter((t) => t.on).map((t) => t.item.id), ringed: [...this.ringed], picked: this.picked, page: this.page, pages: this.pages, choices: this.picked ? this.slip.count : 0 };
  }

  /* ------------------------------------------------- every frame ------------------------------------------------- */

  update(dt: number, _t: number): void {
    const still = this.h.reduced;
    const to = (now: number, want: number, rate: number): number => (still || Math.abs(want - now) < 0.003 ? want : now + (want - now) * Math.min(1, dt * rate));
    // The flap: thrown back while open, lifted a little while something goes in or out.
    this.flapK = to(this.flapK, this.isOpen ? 1 : 0, this.isOpen ? 6 : 5);
    this.flap.rotation.x = -(ease(this.flapK) * 2.05 + this.stir * 0.5);
    this.body.position.y = this.stir * 0.004;
    this.purse.position.y = this.purseHop * 0.012;
    this.purse.rotation.z = this.purseHop * 0.12;
    // The linen: rolled in front of the satchel, or unrolled over its patch.
    this.unrollK = to(this.unrollK, this.isOpen ? 1 : 0, this.isOpen ? 3.6 : 6.5);
    const k = ease(this.unrollK);
    this.bundle.visible = this.unrollK < 0.02;
    this.spread.visible = this.unrollK > 0.01;
    if (!this.spread.visible) return;
    const lay = this.lay, cloth = this.cloth;
    if (!lay || !cloth) return;
    const W = lay.spread.w, H = lay.spread.h, narrow = this.narrow;
    const s = Math.max(0.001, k);
    // Only as much of the cloth as is unrolled is there, drawn at its own size.
    this.pivot.scale.set(narrow ? 1 : s, 1, narrow ? s : 1);
    if (narrow) {
      cloth.tex.repeat.set(1, s);
      cloth.tex.offset.set(0, 1 - s);
    } else {
      cloth.tex.repeat.set(s, 1);
      cloth.tex.offset.set(0, 0);
    }
    // What is still rolled goes ahead of it, thinner as it runs out.
    const r = 0.003 + 0.012 * (1 - k);
    this.roll.visible = k < 0.985;
    this.roll.scale.set(r, (narrow ? W : H) - 0.006, r);
    this.roll.rotation.set(narrow ? 0 : Math.PI / 2, 0, narrow ? Math.PI / 2 : 0);
    if (narrow) this.roll.position.set(-(W - 0.006) / 2, r, -H / 2 + 0.003 + (H - 0.006) * k);
    else this.roll.position.set(-W / 2 + 0.003 + (W - 0.006) * k, r, (H - 0.006) / 2);
    const reached = (along: number): boolean => along < k - 0.02;

    // The tags go to their places; one that is pointed at lifts a little.
    for (const [id, tag] of this.tags) {
      const shown = tag.on && reached(tag.along) && this.isOpen;
      if (!shown) {
        tag.hold.visible = false;
        continue;
      }
      const fresh = !tag.hold.visible;
      tag.hold.visible = true;
      const lift = this.over === `tag:${id}` && id !== this.picked ? 0.004 : 0;
      const rate = fresh ? 1e9 : 11;
      tag.hold.position.x = to(tag.hold.position.x, tag.to.x, rate);
      tag.hold.position.y = to(tag.hold.position.y, tag.to.y + lift, rate);
      tag.hold.position.z = to(tag.hold.position.z, tag.to.z, rate);
      tag.hold.scale.setScalar(to(tag.hold.scale.x, tag.size, rate));
      tag.hold.rotation.y = to(tag.hold.rotation.y, tag.turn, rate);
      if (tag.label) tag.label.glow = 0.12 + (lift ? 0.1 : 0) + (id === this.picked ? 0.08 : 0);
    }
    // The slip under the tag picked up.
    this.slipK = to(this.slipK, this.picked && this.isOpen ? 1 : 0, 10);
    this.slip.group.visible = this.slipK > 0.02;
    this.slip.group.scale.setScalar(0.7 + 0.3 * ease(this.slipK));
    // Your coin and its sum; the pencilled marks.
    const d = this.data;
    const coinOn = reached(narrow ? (this.coinAt.z + H / 2) / H : (this.coinAt.x + W / 2) / W);
    this.stack.visible = coinOn;
    this.stack.position.set(this.coinAt.x - 0.036, 0.002, this.coinAt.z - 0.045);
    this.sum.mesh.visible = coinOn;
    this.sum.mesh.position.set(this.coinAt.x, 0.0022, this.coinAt.z + 0.006);
    this.sum.mesh.rotation.y = -0.04;
    this.more.mesh.visible = coinOn && this.pages > 1;
    this.more.mesh.position.copy(this.moreAt);
    this.more.glow = this.over === "more" ? 0.3 : 0.14;
    this.write.mesh.visible = coinOn && !!d?.making && this.ringed.length > 0;
    this.write.mesh.position.set(this.ringAt.x, 0.0032, this.ringAt.z + this.ringR + (narrow ? 0.013 : 0.017));
    this.write.glow = this.over === "write" || this.over === "ring" ? 0.3 : 0.14;
  }

  dispose(): void {
    for (const tag of this.tags.values()) tag.label?.dispose();
    this.cloth?.dispose();
    this.slip.dispose();
    for (const l of [this.count, this.sum, this.more, this.write]) l.dispose();
    super.dispose();
  }
}
