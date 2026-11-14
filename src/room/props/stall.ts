/**
 * The seller's cloth (game/system.ts, Show "stall"): someone here who will trade, what they sell and at what price,
 * how much coin you have and how much they have, laid out by the narrator on its own side of the table.
 *
 * It follows the original's merchant screen (MerchantInventory, ItemSlot, ItemTooltip): the seller's name, their gold,
 * when they restock, and a grid of their wares, each with its price, how good it is and how many there are; a ware is
 * bought by touching it. Here a touch only writes the line that buys it, for the player to finish, change or send.
 *
 * Closed, it is a trader's cloth unrolled on the table: a small shaped token for each ware laid on it in rows (the
 * shapes are a seeded pick from the ware's id, never a guess at what its name means), each with a paper price tag on a
 * string and a dot of sealing wax for its quality, as the satchel's tags have; at the right end the seller's strongbox,
 * its lid up and their coin inside, with the sum on a slip; at the left a slate with the seller's name chalked on it
 * and how many wares there are. A ware bought out is lifted off the cloth; a restock lays new ones; the strongbox hops
 * when coin goes in or out.
 *
 * Open, the tags stand up toward you. Touch a ware and it is lifted over a slip that says what it is, its price
 * against the coin you have and how many there are, with the game's own pencilled choices: buy it (one, or a line to
 * finish with how many) and haggle. A ware you cannot afford has its price inked in red on its tag, and its lines are
 * offered all the same. Touch the strongbox to read what the seller can pay for what you sell them and when they
 * restock; touch the slate to read who they are (and, with more than one seller here, to turn to the next). More wares
 * than the cloth holds are turned to with the pencilled "more".
 *
 * Nothing here knows what any ware is: every line and every word of a choice is the game's.
 */
import { DoubleSide, Group, Mesh, PlaneGeometry, Vector3, type MeshStandardMaterial } from "three";
import type { Show } from "../../game/system.js";
import { sound } from "../sound.js";
import { leatherCanvas, mk, rng, woodCanvas } from "../textures.js";
import { ease } from "../track.js";
import { Choices, fitName, fitText, INK, INK_FONT, Label, PALETTE, paper, PENCIL, PENCIL_FONT, PropBase, QUALITY_WAX, type Lay, type Part, type PropHost } from "./base.js";

type StallShow = Extract<Show, { kind: "stall" }>;
type Ware = StallShow["wares"][number];

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** The cloth's own marks: what the prop chalks and pencils besides what the game writes. */
export const STALL_SAYS = {
  wares: (n: number): string => (n === 1 ? "1 ware" : `${n} wares`),
  nothing: "Nothing left to sell.",
  more: "more",
  purseHead: "The strongbox",
  each: (price: number, coin: string, qty: number): string => `${price} ${coin} each, ${qty} left`,
  one: (price: number, coin: string): string => `${price} ${coin}, the last one`,
  of: (i: number, n: number): string => `${i} of ${n} sellers here`,
} as const;

/** The quality of a thing in a word, for the slip (engine/run.ts, QUALITIES; the original names it on its tooltip). */
const QUALITY_WORD: Record<string, string> = { trash: "Shoddy", mundane: "Plain", common: "Common", uncommon: "Well made", rare: "Rare", epic: "Exceptional", legendary: "Legendary" };

/* The cloth, in the prop's own space (home units): the strongbox and the slate stand on its ends. */
const CLOTH_W = 0.392, CLOTH_D = 0.182;
const BOX_X = 0.158, SLATE_X = -0.158;
/** Where the wares lie: between the slate and the strongbox. */
const GRID_X0 = -0.118, GRID_X1 = 0.118, GRID_Z0 = -0.082, GRID_Z1 = 0.084;
const MORE_W = 0.062, MORE_H = 0.017;

/** A number from a ware's id, the same every time: what picks its token's shape and colour. */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface WareView {
  ware: Ware;
  hold: Group;
  token: Group;
  tag: Label;
  /** What was last drawn on the tag. */
  drawn: string;
  /** Where it lies on the cloth, in the prop's space. */
  to: Vector3;
  /** On the cloth now (this page, still sold). */
  on: boolean;
  /** Gone from the seller's wares: it is lifted away, then dropped. */
  gone: boolean;
  /** How far it is on the cloth, 0 above it to 1 lying there; and how long it waits before it comes. */
  k: number;
  wait: number;
  /** A small hop when some of it is bought. */
  hop: number;
  turn: number;
}

export class Stall extends PropBase {
  readonly key = "stall";
  readonly name = "The seller's cloth";

  private all: StallShow[] = [];
  private data: StallShow | null = null;
  /** The seller shown, by id, when more than one is here. */
  private at = "";
  private views = new Map<string, WareView>();
  /** "ware:<id>", "purse" or "slate" while its slip is out. */
  private picked: string | null = null;
  private over: string | null = null;
  private page = 0;
  private pages = 1;
  private cols = 4;
  private rows = 2;
  private cellW = 0.06;
  private cellD = 0.08;

  private cloth: Mesh;
  private boxLid = new Group();
  private box = new Group();
  private boxHop = 0;
  private coins = new Group();
  private coinN = -1;
  private sum: Label;
  private sumKey = "";
  private slate = new Group();
  private board: Label;
  private boardKey = "";
  private more: Label;
  private moreAt = V(0, 0, 0);
  private slip: Choices;
  private slipK = 0;
  private openK = 0;
  private gold: MeshStandardMaterial;
  private mats: Record<string, MeshStandardMaterial[]>;
  private cord: MeshStandardMaterial;

  constructor(h: PropHost) {
    super(h);
    const k = this.kit;
    // The cloth: a trader's rug, a red-brown weave with a dark border and a band of diamonds, fringed at both ends.
    const [cc, g] = mk(1024, 480);
    this.weave(g, 1024, 480);
    const rug = k.skin(cc, { rough: 0.95 });
    rug.alphaTest = 0.5;
    rug.side = DoubleSide;
    const geo = k.geo(new PlaneGeometry(CLOTH_W, CLOTH_D, 32, 14));
    geo.rotateX(-Math.PI / 2);
    // It lies a little rumpled, highest at a fold near each end where it was unrolled.
    const p = geo.attributes.position!;
    const rr = rng(77);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const fold = Math.exp(-(((x - 0.13) / 0.012) ** 2)) * 0.0022 + Math.exp(-(((x + 0.12) / 0.016) ** 2)) * 0.0016;
      p.setY(i, 0.0012 + fold + Math.sin(z * 60 + x * 9) * 0.0004 + (rr() - 0.5) * 0.0003);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
    this.cloth = k.cast(new Mesh(geo, rug));
    this.cloth.castShadow = false;
    this.group.add(this.cloth);

    this.gold = k.metal(0x9a7a34, 0.4);
    this.cord = k.paint(PALETTE.cord, 0.9);
    const brass = k.metal(PALETTE.brass, 0.42);
    const oak = k.skin(woodCanvas(256, 256, { planks: 3, seed: 41, dark: [70, 42, 22], light: [128, 84, 48], seam: 0.3 }), { rough: 0.7 });
    const darkOak = k.skin(woodCanvas(256, 256, { planks: 2, seed: 43, dark: [48, 28, 14], light: [92, 58, 32] }), { rough: 0.72 });

    // The strongbox: an open tray of oak with brass corners, its lid hinged up at the back, coin inside.
    const bw = 0.062, bh = 0.03, bd = 0.05, t = 0.004;
    const floor = k.box(bw, t, bd, oak, 0.0015);
    floor.position.y = t / 2;
    const front = k.box(bw, bh, t, oak, 0.0015);
    front.position.set(0, bh / 2, bd / 2 - t / 2);
    const back = k.box(bw, bh, t, oak, 0.0015);
    back.position.set(0, bh / 2, -bd / 2 + t / 2);
    const left = k.box(t, bh, bd, oak, 0.0015);
    left.position.set(-bw / 2 + t / 2, bh / 2, 0);
    const right = k.box(t, bh, bd, oak, 0.0015);
    right.position.set(bw / 2 - t / 2, bh / 2, 0);
    this.box.add(floor, front, back, left, right);
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const corner = k.box(0.007, bh + 0.001, 0.007, brass, 0.0015);
      corner.position.set(x * (bw / 2 - 0.0025), bh / 2, z * (bd / 2 - 0.0025));
      this.box.add(corner);
    }
    const lid = k.box(bw + 0.003, 0.007, bd + 0.003, darkOak, 0.002);
    lid.position.set(0, 0.0035, bd / 2);
    const hasp = k.box(0.012, 0.003, 0.009, brass, 0.001);
    hasp.position.set(0, 0.006, bd + 0.001);
    this.boxLid.add(lid, hasp);
    this.boxLid.position.set(0, bh, -bd / 2);
    this.box.add(this.boxLid);
    this.coins.position.set(0, t, 0);
    this.box.add(this.coins);
    this.box.position.set(BOX_X, 0.0016, -0.012);
    this.box.rotation.y = -0.12;
    this.group.add(this.box);
    // The sum, on a slip tucked against the front of the box.
    this.sum = new Label(0.056, 0.022, { px: 2400 });
    this.sum.glow = 0.16;
    this.sum.mesh.position.set(BOX_X + 0.003, 0.014, -0.012 + bd / 2 + 0.004);
    this.sum.mesh.rotation.set(-0.18, -0.12, 0);
    this.group.add(this.sum.mesh);

    // The slate: a small board in an oak frame, propped up on a strut, the seller's name chalked on it.
    const fw = 0.074, fh = 0.054;
    const frame = k.box(fw, fh, 0.005, oak, 0.0018);
    frame.position.set(0, fh / 2, 0);
    this.board = new Label(fw - 0.008, fh - 0.008, { px: 2600 });
    this.board.glow = 0.12;
    this.board.mesh.position.set(0, fh / 2, 0.0027);
    const strut = k.box(0.006, 0.05, 0.004, darkOak, 0.0015);
    strut.position.set(0, 0.022, -0.016);
    strut.rotation.x = 0.55;
    this.slate.add(frame, this.board.mesh, strut);
    this.slate.position.set(SLATE_X, 0.0016, -0.018);
    this.slate.rotation.set(-0.3, 0.12, 0);
    this.group.add(this.slate);

    // The materials the tokens are made of, a few of each kind, picked by a ware's seed.
    const clay = k.skin(leatherCanvas(51, [150, 92, 58]), { rough: 0.8 });
    const hide = k.skin(leatherCanvas(52, [120, 76, 42]), { rough: 0.75 });
    this.mats = {
      clay: [clay, k.paint(0x8a5a3a, 0.75), k.paint(0x6e6a5a, 0.8)],
      glass: [k.paint(0x3c5a3a, 0.3), k.paint(0x5a3a22, 0.3), k.paint(0x40506a, 0.3)],
      cloth: [k.paint(PALETTE.linen, 0.95), k.paint(0x6a3a2a, 0.95), k.paint(0x3a4a5a, 0.95), k.paint(0x7a6a3a, 0.95)],
      metal: [k.metal(PALETTE.pewter, 0.5), brass, k.metal(0x7a4a2a, 0.45)],
      hide: [hide, k.skin(leatherCanvas(53, [90, 52, 30]), { rough: 0.75 }), k.paint(PALETTE.oxblood, 0.8)],
      wood: [oak, darkOak],
    };

    this.more = new Label(MORE_W, MORE_H, { flat: true });
    this.more.glow = 0.16;
    this.more.mesh.visible = false;
    this.group.add(this.more.mesh);

    this.slip = new Choices(0.2);
    this.slip.group.visible = false;
    this.spread.add(this.slip.group);
  }

  /** The rug itself: weave, border, diamonds, fringe. */
  private weave(g: CanvasRenderingContext2D, w: number, h: number): void {
    const fringe = 26;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#6a2a1c";
    g.fillRect(fringe, 0, w - fringe * 2, h);
    const r = rng(19);
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = `rgba(${r() < 0.5 ? "20,8,4" : "210,150,110"},${0.04 + r() * 0.06})`;
      g.fillRect(fringe, y, w - fringe * 2, 1 + (r() < 0.3 ? 1 : 0));
    }
    // The border: a dark band, a thin ochre line, and a running band of diamonds in it.
    const x0 = fringe, x1 = w - fringe;
    const band = 34;
    g.fillStyle = "#2a1410";
    g.fillRect(x0, 0, x1 - x0, band);
    g.fillRect(x0, h - band, x1 - x0, band);
    g.fillRect(x0, 0, band, h);
    g.fillRect(x1 - band, 0, band, h);
    g.strokeStyle = "rgba(196,150,70,0.8)";
    g.lineWidth = 3;
    g.strokeRect(x0 + band + 5, band + 5, x1 - x0 - band * 2 - 10, h - band * 2 - 10);
    g.fillStyle = "rgba(196,150,70,0.75)";
    const diamond = (cx: number, cy: number, s: number): void => {
      g.beginPath();
      g.moveTo(cx, cy - s);
      g.lineTo(cx + s, cy);
      g.lineTo(cx, cy + s);
      g.lineTo(cx - s, cy);
      g.closePath();
      g.fill();
    };
    for (let x = x0 + band + 14; x < x1 - band; x += 28) {
      diamond(x, band / 2, 8);
      diamond(x, h - band / 2, 8);
    }
    for (let y = band + 14; y < h - band; y += 28) {
      diamond(x0 + band / 2, y, 8);
      diamond(x1 - band / 2, y, 8);
    }
    // A faint field of larger diamonds, worn.
    g.strokeStyle = "rgba(220,170,110,0.1)";
    g.lineWidth = 4;
    for (let x = x0 + 90; x < x1 - 60; x += 120) for (let y = 110; y < h - 80; y += 130) {
      g.beginPath();
      g.moveTo(x, y - 40);
      g.lineTo(x + 40, y);
      g.lineTo(x, y + 40);
      g.lineTo(x - 40, y);
      g.closePath();
      g.stroke();
    }
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(20,8,4,${0.04 + r() * 0.06})`;
      g.beginPath();
      g.ellipse(fringe + r() * (w - fringe * 2), r() * h, 20 + r() * 80, 14 + r() * 50, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // The fringe: knotted threads off both ends.
    g.strokeStyle = "#c9a877";
    g.lineCap = "round";
    for (const side of [0, 1]) {
      for (let y = 6; y < h - 4; y += 9) {
        g.lineWidth = 3 + r() * 1.5;
        g.beginPath();
        const xa = side ? x1 : x0;
        g.moveTo(xa, y);
        g.lineTo(side ? xa + fringe - 2 - r() * 6 : xa - fringe + 2 + r() * 6, y + (r() - 0.5) * 5);
        g.stroke();
      }
    }
  }

  /* ------------------------------------------------- what the game shows ------------------------------------------------- */

  show(shows: readonly Show[]): boolean {
    this.all = shows.filter((s): s is StallShow => s.kind === "stall");
    const next = this.all.find((s) => s.id === this.at) ?? this.all[0] ?? null;
    const before = this.data && next && this.data.id === next.id ? this.data : null;
    this.data = next;
    if (!next) {
      for (const v of this.views.values()) this.dropView(v);
      this.views.clear();
      this.picked = null;
      this.at = "";
      return false;
    }
    if (this.at !== next.id) {
      // Another seller's cloth: what lay there before is taken off, and theirs is laid.
      for (const v of this.views.values()) this.dropView(v);
      this.views.clear();
      this.picked = null;
      this.page = 0;
      this.at = next.id;
    }
    const x = this.group.position.x;
    if (before && before.purse !== next.purse) this.clink();
    let laid = 0;
    for (const [id, v] of this.views) {
      const w = next.wares.find((x) => x.id === id);
      if (!w) {
        if (!v.gone) {
          v.gone = true;
          sound.play("pat", { x, gain: 0.45, rate: 1.25 });
        }
        continue;
      }
      if (w.qty < v.ware.qty) v.hop = 1;
      v.ware = w;
    }
    next.wares.forEach((w) => {
      if (this.views.has(w.id) && !this.views.get(w.id)!.gone) return;
      const old = this.views.get(w.id);
      if (old) this.dropView(old);
      this.views.set(w.id, this.makeView(w, laid++));
    });
    if (this.picked?.startsWith("ware:") && !next.wares.some((w) => `ware:${w.id}` === this.picked)) this.picked = null;
    this.drawBoard();
    this.drawSum();
    this.arrange();
    return true;
  }

  /** A ware's token and its tag, made for it. */
  private makeView(ware: Ware, n: number): WareView {
    const hold = new Group();
    const token = this.token(ware.id);
    const tag = new Label(0.058, 0.034, { flat: true, clear: true });
    tag.glow = 0.13;
    hold.add(token, tag.mesh);
    this.group.add(hold);
    const r = rng(seedOf(ware.id) + 7);
    return { ware, hold, token, tag, drawn: "", to: V(0, 0, 0), on: false, gone: false, k: 0, wait: n * 0.07, hop: 0, turn: (r() - 0.5) * 0.5 };
  }

  private dropView(v: WareView): void {
    this.group.remove(v.hold);
    v.tag.dispose();
  }

  /**
   * A token for a ware: one of a few honest shapes, picked by a seeded draw from its id (a jar, a stoppered bottle, a
   * corded bundle, a round tin, a folded length of cloth, a drawn-up pouch, a little crate), in one of a few colours.
   * Its foot is at its origin.
   */
  private token(id: string): Group {
    const k = this.kit, r = rng(seedOf(id));
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
    const g = new Group();
    const shape = Math.floor(r() * 7);
    if (shape === 0) {
      const jar = k.crook(k.lathe([[0, 0], [0.0105, 0], [0.0128, 0.006], [0.0128, 0.015], [0.0085, 0.02], [0.0085, 0.023], [0.0105, 0.0245], [0, 0.0245]], pick(this.mats.clay!), 12), seedOf(id) % 97, 0.0005);
      const cap = k.disc(0.011, 0.003, pick(this.mats.cloth!), 10);
      cap.position.y = 0.023;
      g.add(jar, cap);
    } else if (shape === 1) {
      const bottle = k.lathe([[0, 0], [0.0085, 0], [0.0095, 0.004], [0.0095, 0.019], [0.0045, 0.026], [0.0035, 0.034], [0, 0.034]], pick(this.mats.glass!), 12);
      const cork = k.disc(0.0038, 0.005, this.mats.wood![0]!, 8);
      cork.position.y = 0.032;
      g.add(bottle, cork);
    } else if (shape === 2) {
      const bundle = k.crook(k.taper(k.box(0.032, 0.016, 0.022, pick(this.mats.cloth!), 0.006), 0.12, 0.2), seedOf(id) % 89, 0.0008);
      bundle.position.y = 0.008;
      const band = k.box(0.005, 0.0172, 0.0232, this.cord, 0.0015);
      band.position.y = 0.0082;
      g.add(bundle, band);
    } else if (shape === 3) {
      const m = pick(this.mats.metal!);
      const tin = k.disc(0.0125, 0.011, m, 16);
      const lid = k.disc(0.0132, 0.0035, m, 16);
      lid.position.y = 0.0105;
      g.add(tin, lid);
    } else if (shape === 4) {
      const m = pick(this.mats.cloth!), m2 = pick(this.mats.cloth!);
      for (let i = 0; i < 3; i++) {
        const fold = k.box(0.036 - i * 0.002, 0.0045, 0.024 - i * 0.001, i === 1 ? m2 : m, 0.0018);
        fold.position.set((i - 1) * 0.0012, 0.00225 + i * 0.0044, (i - 1) * -0.001);
        g.add(fold);
      }
    } else if (shape === 5) {
      const pouch = k.crook(k.lathe([[0, 0], [0.008, 0.0005], [0.0125, 0.006], [0.013, 0.013], [0.009, 0.019], [0.005, 0.022], [0.006, 0.025], [0.009, 0.028], [0, 0.026]], pick(this.mats.hide!), 11), seedOf(id) % 83, 0.0009);
      const tie = k.disc(0.0058, 0.0025, this.cord, 8);
      tie.position.y = 0.021;
      g.add(pouch, tie);
    } else {
      const m = pick(this.mats.wood!);
      const crate = k.box(0.03, 0.018, 0.022, m, 0.002);
      crate.position.y = 0.009;
      const slat = k.box(0.031, 0.003, 0.0225, this.mats.wood![1]!, 0.001);
      slat.position.y = 0.0185;
      g.add(crate, slat);
    }
    g.rotation.y = (r() - 0.5) * 0.8;
    return g;
  }

  /** The strongbox hops as coin goes in or out. */
  private clink(): void {
    const x = this.group.position.x;
    void this.h.tracks.run([{ dur: 0.45, begin: () => sound.play("token", { x, gain: 0.55 }), tick: (u) => (this.boxHop = Math.sin(Math.PI * u)) }]);
  }

  /** The slate: the seller's name in chalk, how many wares, and which of several sellers this is. */
  private drawBoard(): void {
    const d = this.data;
    if (!d) return;
    const n = this.all.length, i = this.all.findIndex((s) => s.id === d.id) + 1;
    const key = `${d.seller}|${d.wares.length}|${i}/${n}`;
    if (key === this.boardKey) return;
    this.boardKey = key;
    this.board.draw((g, w, h) => {
      g.fillStyle = "#23272a";
      g.fillRect(0, 0, w, h);
      const r = rng(5);
      for (let j = 0; j < 40; j++) {
        g.fillStyle = `rgba(220,220,210,${0.02 + r() * 0.04})`;
        g.beginPath();
        g.ellipse(r() * w, r() * h, 8 + r() * 30, 3 + r() * 10, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "rgba(236,232,220,0.92)";
      g.textAlign = "center";
      fitName(g, d.seller, w / 2, h * 0.4, w - 14, h * 0.34, h * 0.17, "italic 600");
      g.fillStyle = "rgba(236,232,220,0.7)";
      const small = n > 1 ? `${STALL_SAYS.wares(d.wares.length)} · ${i}/${n}` : STALL_SAYS.wares(d.wares.length);
      fitText(g, d.wares.length ? small : STALL_SAYS.nothing, w / 2, h * 0.86, w - 14, h * 0.2, h * 0.12, "500", PENCIL_FONT);
    });
  }

  /** The coin in the strongbox (more for more, never a count to be read), and the sum on its slip. */
  private drawSum(): void {
    const d = this.data;
    if (!d) return;
    const n = d.purse <= 0 ? 0 : Math.min(16, 2 + Math.floor(Math.log2(d.purse + 1) * 1.1));
    if (n !== this.coinN) {
      this.coinN = n;
      this.coins.clear();
      const r = rng(13);
      for (let i = 0; i < n; i++) {
        const coin = this.kit.disc(0.0085, 0.0022, this.gold, 12);
        // A heap: low and wide at first, higher in the middle as it grows.
        const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.017;
        coin.position.set(Math.cos(a) * rad, Math.floor(i / 6) * 0.0024 + (0.017 - rad) * 0.12, Math.sin(a) * rad * 0.85);
        coin.rotation.set((r() - 0.5) * 0.4, r() * 3, (r() - 0.5) * 0.4);
        this.coins.add(coin);
      }
    }
    const key = `${d.purse}|${d.coin}`;
    if (key === this.sumKey) return;
    this.sumKey = key;
    this.sum.draw((g, w, h) => {
      paper(g, w, h, 29);
      g.fillStyle = INK;
      g.textAlign = "center";
      fitText(g, String(d.purse), w / 2, h * 0.74, w - 12, h * 0.72, h * 0.36, "700");
    });
  }

  /* ------------------------------------------------- opening and closing ------------------------------------------------- */

  place(lay: Lay, narrow: boolean): void {
    super.place(lay, narrow);
    this.spread.remove(this.slip.group);
    this.slip.dispose();
    this.slip = new Choices(narrow ? Math.min(0.27, lay.spread.w - 0.02) : 0.215, narrow ? 0.0128 : 0.0082);
    this.slip.group.visible = false;
    this.spread.add(this.slip.group);
    this.arrange();
  }

  open(): void {
    super.open();
    this.picked = null;
    this.arrange();
    sound.play("unroll", { x: this.group.position.x, gain: 0.35, rate: 1.2 });
    const d = this.data;
    if (d) this.h.tell(`${this.name}, open. ${d.seller} sells: ${d.wares.map((w) => `${w.name}, ${w.price} ${d.coin}${w.qty > 1 ? `, ${w.qty} left` : ""}`).join("; ") || STALL_SAYS.nothing} You have ${d.money} ${d.coin}.`);
  }

  close(): void {
    if (!this.isOpen) return;
    super.close();
    this.picked = null;
    this.over = null;
    this.arrange();
  }

  /* ------------------------------------------------- laying it out ------------------------------------------------- */

  /** Where each ware lies on the cloth, in rows, a page at a time; and the slip of what is picked up. */
  private arrange(): void {
    const d = this.data, lay = this.lay;
    if (!d || !lay) return;
    this.cols = this.narrow ? 3 : 4;
    this.rows = 2;
    const per = this.cols * this.rows;
    const live = d.wares;
    this.pages = Math.max(1, Math.ceil(live.length / per));
    // Closed, the first of them lie out; open, the page turned to.
    if (!this.isOpen) this.page = 0;
    this.page = Math.min(this.page, this.pages - 1);
    const z1 = this.pages > 1 ? GRID_Z1 - MORE_H - 0.004 : GRID_Z1;
    this.cellW = (GRID_X1 - GRID_X0) / this.cols;
    this.cellD = (z1 - GRID_Z0) / this.rows;
    const shown = live.slice(this.page * per, this.page * per + per);
    for (const v of this.views.values()) v.on = false;
    shown.forEach((w, i) => {
      const v = this.views.get(w.id);
      if (!v || v.gone) return;
      const c = i % this.cols, row = Math.floor(i / this.cols);
      // Each a little out of line, the same way every time.
      const r = rng(seedOf(w.id) + 3);
      v.to.set(GRID_X0 + this.cellW * (c + 0.5) + (r() - 0.5) * 0.006, 0.002, GRID_Z0 + this.cellD * (row + 0.5) + (r() - 0.5) * 0.004);
      v.on = true;
      this.drawTag(v);
    });
    this.moreAt.set(GRID_X1 - MORE_W / 2, 0.0035, GRID_Z1 - MORE_H / 2 + 0.002);
    this.more.draw((g, w, h) => {
      paper(g, w, h, 71);
      g.fillStyle = PENCIL;
      g.textAlign = "center";
      fitText(g, `${STALL_SAYS.more} (${this.page + 1} of ${this.pages}) ›`, w / 2, h * 0.72, w - 12, h * 0.62, h * 0.35, "600", PENCIL_FONT);
    });
    // The slip of what is picked up: over the half of the cloth away from it.
    const W = lay.spread.w, H = lay.spread.h, s = lay.home.scale;
    if (this.picked) {
      const what = this.pickedAt();
      if (this.picked.startsWith("ware:")) {
        const v = this.views.get(this.picked.slice(5));
        if (v) {
          const w = v.ware;
          // What it is as the text; what your coin buys of it on its own line; the price and how many are on its tag.
          this.slip.set(w.name, `${QUALITY_WORD[w.quality] ?? ""}${QUALITY_WORD[w.quality] && w.text ? ". " : ""}${w.text}`.trim(), w.note, w.choices.map((c) => c.say));
        }
      } else if (this.picked === "purse") this.slip.set(STALL_SAYS.purseHead, d.about, `${d.purse} ${d.coin}`, []);
      else this.slip.set(d.seller, d.text, this.all.length > 1 ? STALL_SAYS.of(this.all.findIndex((x) => x.id === d.id) + 1, this.all.length) : "", []);
      const half = this.slip.w / 2 + 0.006;
      const cx = what.x * s < 0 ? Math.min(W / 2 - half + 0.004, what.x * s + half + 0.02) : Math.max(-W / 2 + half - 0.004, what.x * s - half - 0.02);
      const cz = Math.max(-H / 2 - 0.01 + this.slip.deep / 2, Math.min(H / 2 + 0.01 - this.slip.deep / 2, 0));
      this.slip.group.position.set(this.narrow ? 0 : cx, 0.075, this.narrow ? H / 2 + this.slip.deep / 2 - 0.02 : cz);
    }
  }

  /** Where the thing picked up lies, in the prop's space. */
  private pickedAt(): Vector3 {
    if (this.picked === "purse") return this.box.position;
    if (this.picked === "slate") return this.slate.position;
    return this.views.get(this.picked?.slice(5) ?? "")?.to ?? V(0, 0, 0);
  }

  /** A tag: a paper label cut at one end and tied with string, the price large, how many and the wax of its quality. */
  private drawTag(v: WareView): void {
    const w = v.ware, d = this.data!;
    const short = w.can <= 0;
    const key = `${w.name}|${w.qty}|${w.quality}|${w.price}|${short}|${this.narrow}`;
    if (key === v.drawn) return;
    v.drawn = key;
    v.tag.draw((g, pw, ph) => {
      const x0 = ph * 0.22, cut = ph * 0.28;
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
      paper(g, pw, ph, 40 + w.name.length * 7, short ? "#cdbf9e" : "#e4d8b6");
      g.restore();
      g.strokeStyle = "rgba(36,22,12,0.55)";
      g.lineWidth = 2;
      g.stroke();
      // The hole the string goes through.
      g.fillStyle = "#3a2a1a";
      g.beginPath();
      g.arc(x0 + ph * 0.17, ph * 0.5, ph * 0.065, 0, Math.PI * 2);
      g.fill();
      // The name across the top, on two lines where one will not hold it.
      const left = x0 + ph * 0.3, right = pw - 9;
      g.fillStyle = INK;
      g.textAlign = "center";
      fitName(g, w.name, (left + right) / 2, ph * 0.27, right - left, ph * 0.26, ph * 0.17, "italic 600");
      // The wax: a dot in the colour of how good it is, at the foot on the right, how many beside it.
      const wr = ph * 0.11, wx = pw - 4 - wr - ph * 0.04, wy = ph * 0.72;
      g.fillStyle = QUALITY_WAX[w.quality] ?? QUALITY_WAX.common!;
      g.beginPath();
      for (let a = 0; a <= 12; a++) {
        const t = (a / 12) * Math.PI * 2;
        const r = wr * (1 + 0.1 * Math.sin(t * 3 + w.name.length));
        g.lineTo(wx + Math.cos(t) * r, wy + Math.sin(t) * r);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(20,10,5,0.5)";
      g.lineWidth = 1.5;
      g.stroke();
      let end = wx - wr - ph * 0.05;
      if (w.qty > 1) {
        g.fillStyle = INK;
        g.textAlign = "right";
        g.font = `600 ${Math.round(ph * 0.2)}px ${INK_FONT}`;
        g.fillText(`×${w.qty}`, end, ph * 0.82);
        end -= g.measureText(`×${w.qty}`).width + ph * 0.05;
      }
      // The price, large; in red ink, underlined, when your coin does not pay for one.
      g.textAlign = "left";
      g.fillStyle = short ? "#8a2a1a" : INK;
      const s = fitText(g, `${w.price}`, left, ph * 0.88, end - left, ph * 0.46, ph * 0.2, "700");
      if (short) {
        g.font = `700 ${s}px ${INK_FONT}`;
        const pw2 = Math.min(end - left, g.measureText(`${w.price}`).width);
        g.strokeStyle = "rgba(138,42,26,0.75)";
        g.lineWidth = 2.5;
        g.setLineDash([5, 4]);
        g.beginPath();
        g.moveTo(left, ph * 0.93);
        g.lineTo(left + pw2, ph * 0.93);
        g.stroke();
        g.setLineDash([]);
      }
      void d;
    });
  }

  /* ------------------------------------------------- touching ------------------------------------------------- */

  parts(): Part[] {
    const d = this.data, lay = this.lay;
    if (!this.isOpen || !d || !lay || this.openK < 0.6) return [];
    const out: Part[] = [];
    if (this.picked) out.push(...this.slip.parts());
    // What lies under the slip cannot be touched through it.
    const s = lay.home.scale, sp = this.slip.group.position;
    const covered = (x: number, z: number): boolean => !!this.picked && Math.abs(x * s - sp.x) < this.slip.w / 2 + 0.004 && Math.abs(z * s - sp.z) < this.slip.deep / 2 + 0.004;
    for (const [id, v] of this.views) {
      if (!v.on || v.gone || `ware:${id}` === this.picked || covered(v.to.x, v.to.z)) continue;
      out.push(this.partAt(`ware:${id}`, v.to.x, 0.012, v.to.z, Math.min(this.cellW, this.cellD) * 0.5, this.group));
    }
    if (!covered(this.box.position.x, this.box.position.z) && this.picked !== "purse") out.push(this.partAt("purse", this.box.position.x, 0.02, this.box.position.z, 0.036, this.group));
    if (!covered(this.slate.position.x, this.slate.position.z) && (this.picked !== "slate" || this.all.length > 1)) out.push(this.partAt("slate", this.slate.position.x, 0.025, this.slate.position.z, 0.036, this.group));
    if (this.pages > 1 && !covered(this.moreAt.x, this.moreAt.z)) out.push(this.partAt("more", this.moreAt.x, 0.004, this.moreAt.z, 0.03, this.group));
    if (this.picked) out.push({ ...this.partAt("cloth", 0, 0, 0, Math.max(lay.spread.w, lay.spread.h) * 0.6), under: true });
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
      const v = this.picked?.startsWith("ware:") ? this.views.get(this.picked.slice(5)) : undefined;
      const choice = v?.ware.choices[Number(id.slice(7))];
      if (choice) this.h.write(choice.line);
      return;
    }
    if (id.startsWith("ware:")) {
      const v = this.views.get(id.slice(5));
      if (!v) return;
      this.picked = id;
      sound.play("pat", { x, gain: 0.5 });
      this.arrange();
      const w = v.ware;
      this.h.tell(`${w.name}. ${w.text} ${w.note} ${w.qty > 1 ? STALL_SAYS.each(w.price, d.coin, w.qty) : STALL_SAYS.one(w.price, d.coin)}. You can: ${w.choices.map((c) => c.say).join("; ")}.`);
      return;
    }
    if (id === "purse") {
      this.picked = "purse";
      sound.play("token", { x, gain: 0.4, rate: 1.2 });
      this.boxHop = 0.6;
      this.arrange();
      this.h.tell(`${STALL_SAYS.purseHead}. ${d.about}`);
      return;
    }
    if (id === "slate") {
      // With several sellers here, each touch of the slate turns to the next of them (it says which of how many).
      if (this.all.length > 1) {
        const i = this.all.findIndex((s) => s.id === d.id);
        this.at = this.all[(i + 1) % this.all.length]!.id;
        this.show(this.all);
      }
      this.picked = "slate";
      sound.play("tap", { x, gain: 0.4 });
      this.arrange();
      const now = this.data!;
      this.h.tell(`${now.seller}. ${now.text}`);
      return;
    }
    if (id === "more") {
      this.page = (this.page + 1) % this.pages;
      this.picked = null;
      sound.play("slide", { x, gain: 0.4, rate: 1.25 });
      for (const v of this.views.values()) v.wait = 0;
      this.arrange();
      return;
    }
    if (id === "cloth") {
      this.picked = null;
      this.arrange();
    }
  }

  /** For checks: what lies where. */
  get state(): { open: boolean; seller: string; wares: string[]; picked: string | null; page: number; pages: number; choices: number } {
    return { open: this.isOpen, seller: this.data?.seller ?? "", wares: [...this.views.values()].filter((v) => v.on && !v.gone).map((v) => v.ware.id), picked: this.picked, page: this.page, pages: this.pages, choices: this.picked ? this.slip.count : 0 };
  }

  /* ------------------------------------------------- every frame ------------------------------------------------- */

  update(dt: number, _t: number): void {
    const still = this.h.reduced;
    const to = (now: number, want: number, rate: number): number => (still || Math.abs(want - now) < 0.002 ? want : now + (want - now) * Math.min(1, dt * rate));
    this.openK = to(this.openK, this.isOpen ? 1 : 0, 5);
    const o = ease(this.openK);
    // The lid goes up a little further and the slate tips toward you while you lean over it.
    this.boxLid.rotation.x = -(1.75 + o * 0.25) + this.boxHop * 0.25;
    this.box.position.y = 0.0016 + this.boxHop * 0.006;
    this.boxHop = to(this.boxHop, 0, 3);
    this.slate.rotation.x = -0.3 - o * 0.22;
    this.sum.glow = 0.14 + o * 0.06 + (this.over === "purse" ? 0.12 : 0);
    this.board.glow = 0.12 + (this.over === "slate" ? 0.12 : 0);
    for (const [id, v] of this.views) {
      const present = v.on && !v.gone;
      if (present && v.k < 1 && v.wait > 0) {
        v.wait = still ? 0 : v.wait - dt;
        v.hold.visible = false;
        continue;
      }
      const was = v.k;
      v.k = to(v.k, present ? 1 : 0, present ? 6 : 4);
      if (present && was < 0.85 && v.k >= 0.85) sound.play("knock", { x: this.group.position.x, gain: 0.18, rate: 1.4 + (seedOf(id) % 5) * 0.08 });
      if (v.gone && v.k <= 0.001) {
        this.dropView(v);
        this.views.delete(id);
        continue;
      }
      v.hold.visible = v.k > 0.01;
      if (!v.hold.visible) continue;
      v.hop = to(v.hop, 0, 4);
      const picked = this.picked === `ware:${id}` && this.isOpen;
      const lift = picked ? 0.034 : this.over === `ware:${id}` && this.isOpen ? 0.006 : 0;
      const e = ease(v.k);
      // It comes down onto the cloth from above, and is lifted off it the same way.
      v.hold.position.set(v.to.x, v.to.y + (1 - e) * (v.gone ? 0.07 : 0.05) + lift + Math.sin(Math.PI * v.hop) * 0.008, v.to.z);
      v.hold.scale.setScalar(0.5 + 0.5 * e);
      v.hold.rotation.y = v.turn * 0.15;
      // The token at the back of its place, its tag in front, standing up toward you while you lean over it.
      const tw = Math.min(this.cellW * 0.92, 0.072), th = tw * 0.59;
      const tagScale = tw / 0.058;
      v.token.position.set(0, 0, -this.cellD * 0.24);
      v.token.rotation.y = picked ? v.token.rotation.y + dt * 1.4 : v.token.rotation.y;
      v.tag.mesh.scale.set(tagScale, 1, tagScale);
      v.tag.mesh.position.set(0, 0.002 + o * th * 0.3, this.cellD * 0.2);
      v.tag.mesh.rotation.x = o * 0.55;
      v.tag.glow = 0.13 + (lift ? 0.1 : 0) + o * 0.04;
    }
    this.slipK = to(this.slipK, this.picked && this.isOpen ? 1 : 0, 10);
    this.slip.group.visible = this.slipK > 0.02;
    this.slip.group.scale.setScalar(0.7 + 0.3 * ease(this.slipK));
    this.more.mesh.visible = this.isOpen && this.pages > 1 && o > 0.5;
    this.more.mesh.position.copy(this.moreAt);
    this.more.glow = this.over === "more" ? 0.3 : 0.16;
  }

  dispose(): void {
    for (const v of this.views.values()) v.tag.dispose();
    this.sum.dispose();
    this.board.dispose();
    this.more.dispose();
    this.slip.dispose();
    super.dispose();
  }
}

