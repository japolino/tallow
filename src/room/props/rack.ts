/**
 * The faction rack (game/system.ts, Show "standing"): the groups of the world that know you, and how each stands with you.
 *
 * Closed, it is a small wooden rack: a crossbar between two posts on a plank, and from the bar a pennant hangs on its
 * own cord for each group, each its own colour with its own device, chosen from the group's id (never from what its
 * name means). The better a group thinks of you the higher its pennant hangs; the post at the left is notched and
 * painted with the nine steps of the ladder the game gives, so a height reads as a standing. A group that is against
 * you hangs its pennant upside down, edged in soot; one that is for you has brass knobs on its rod; one whose people
 * are here has a brass bead on its cord. When a standing changes, its pennant slides up or down its cord and swings.
 *
 * Open, touch a pennant and it swings forward as a banner, with the group's name, the step it stands on, what it is,
 * what it holds and who of it is here, and under that what it would do for a friend who calls on it, pencilled, each
 * with the standing it needs or how long it rests. Touching one writes the line that calls on the group for it, ready
 * or not: the game answers a call the group will not yet heed in the story. More than six groups are turned to with
 * the tag on the right post.
 *
 * Nothing here knows what any group is: every word and line is the game's.
 */
import { CanvasTexture, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, SphereGeometry, Vector3, type Material } from "three";
import type { Show } from "../../game/system.js";
import { sound } from "../sound.js";
import { mk, rng, woodCanvas, type Canvas } from "../textures.js";
import { ease } from "../track.js";
import { Choices, fitName, fitText, INK, INK_FONT, Label, PALETTE, paper, PENCIL, PENCIL_FONT, PropBase, QUALITY_WAX, type Lay, type Part, type PropHost } from "./base.js";

type StandingShow = Extract<Show, { kind: "standing" }>;
type GroupShow = StandingShow["groups"][number];

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const hex = (n: number): string => `#${n.toString(16).padStart(6, "0")}`;

/** The most pennants on the rack at once; more are turned to page by page. */
export const RACK_PAGE = 6;

/*
 * Where things are on the rack, in its own space (metres). It stands in the right of its home: from the chair on a wide
 * screen the brass candlestick (room.ts, never moved) stands in front of the left of the home, its candle across it
 * and its dish across the middle height. So the notched post is where the candle hides it, the pennants hang to the
 * right of it, and they hang high enough to be seen over the dish.
 */
const PLANK_X0 = -0.052;
const PLANK_X1 = 0.108;
const MID_X = (PLANK_X0 + PLANK_X1) / 2;
const POST_X = -0.039;
const POST2_X = 0.1;
const BAR_Y = 0.152;
/** Where a pennant's rod hangs at the least standing and at the most. */
const LOW_Y = 0.094;
const HIGH_Y = 0.142;
const SLOT_X0 = -0.026;
const SLOT_X1 = 0.093;
const PEN_W = 0.0165;
const PEN_H = 0.043;
/** The tag that turns the page, tied to the right post. */
const MORE_X = POST2_X - 0.004;
const MORE_Y = 0.052;
/** How far the open card is turned toward a wide screen's eye, which looks from the right of the candlestick. */
const CARD_TURN = 0.3;
/** The pennant's canvas, in pixels: tall and narrow, with its tail cut at the foot. */
const CH = 330, CW = Math.round((CH * PEN_W) / PEN_H);

/** The dyes a pennant may be: the room's own colours and the sealing waxes. */
const DYES: string[] = [hex(PALETTE.oxblood), hex(PALETTE.ink), hex(PALETTE.moss), hex(PALETTE.ember), hex(PALETTE.brass), hex(PALETTE.night), hex(PALETTE.hideDark), QUALITY_WAX.uncommon!, QUALITY_WAX.rare!, QUALITY_WAX.epic!];
const DEVICES = ["sun", "moon", "star", "chevron", "saltire", "cross", "tower", "key", "tree", "wheel", "eye", "crown"] as const;
type Device = (typeof DEVICES)[number];

/** A number from a text, the same every time: a group's colour and device come from its id and nothing else. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function heraldry(id: string): { dye: string; device: Device; seed: number } {
  const r = rng(hash(id));
  return { dye: DYES[Math.floor(r() * DYES.length)]!, device: DEVICES[Math.floor(r() * DEVICES.length)]!, seed: r() };
}

/** Where a pennant's rod hangs for a standing. */
const heightOf = (g: { standing: number; least: number; most: number }): number => LOW_Y + ((Math.max(g.least, Math.min(g.most, g.standing)) - g.least) / (g.most - g.least || 1)) * (HIGH_Y - LOW_Y);

/** Draw a device in the middle of a square of side `s` at (cx, cy). */
function drawDevice(g: CanvasRenderingContext2D, d: Device, cx: number, cy: number, s: number, ink: string): void {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = ink;
  g.strokeStyle = ink;
  g.lineJoin = "round";
  g.lineCap = "round";
  const r = s / 2;
  g.beginPath();
  switch (d) {
    case "sun":
      g.arc(0, 0, r * 0.42, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = r * 0.11;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.moveTo(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58);
        g.lineTo(Math.cos(a) * r * (i % 2 ? 0.8 : 0.95), Math.sin(a) * r * (i % 2 ? 0.8 : 0.95));
      }
      g.stroke();
      break;
    case "moon":
      g.arc(0, 0, r * 0.8, Math.PI * 0.25, Math.PI * 1.75);
      g.arc(r * 0.32, 0, r * 0.62, Math.PI * 1.62, Math.PI * 0.38, true);
      g.fill();
      break;
    case "star":
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, k = i % 2 ? 0.4 : 0.92;
        g.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
      }
      g.fill();
      break;
    case "chevron":
      g.moveTo(-r * 0.9, r * 0.45);
      g.lineTo(0, -r * 0.5);
      g.lineTo(r * 0.9, r * 0.45);
      g.lineTo(r * 0.9, r * 0.85);
      g.lineTo(0, -r * 0.1);
      g.lineTo(-r * 0.9, r * 0.85);
      g.fill();
      break;
    case "saltire":
      g.lineWidth = r * 0.32;
      g.moveTo(-r * 0.75, -r * 0.75);
      g.lineTo(r * 0.75, r * 0.75);
      g.moveTo(r * 0.75, -r * 0.75);
      g.lineTo(-r * 0.75, r * 0.75);
      g.stroke();
      break;
    case "cross":
      g.lineWidth = r * 0.3;
      g.moveTo(0, -r * 0.88);
      g.lineTo(0, r * 0.88);
      g.moveTo(-r * 0.62, -r * 0.22);
      g.lineTo(r * 0.62, -r * 0.22);
      g.stroke();
      break;
    case "tower":
      g.moveTo(-r * 0.5, r * 0.85);
      g.lineTo(-r * 0.5, -r * 0.5);
      for (let i = 0; i < 5; i++) {
        const x = -r * 0.5 + (i / 4) * r;
        g.lineTo(x, i % 2 ? -r * 0.5 : -r * 0.82);
        if (i < 4) g.lineTo(x + r * 0.25, i % 2 ? -r * 0.5 : -r * 0.82);
      }
      g.lineTo(r * 0.5, r * 0.85);
      g.fill();
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.beginPath();
      g.arc(0, r * 0.62, r * 0.17, Math.PI, 0);
      g.lineTo(r * 0.17, r * 0.85);
      g.lineTo(-r * 0.17, r * 0.85);
      g.fill();
      break;
    case "key":
      g.lineWidth = r * 0.17;
      g.arc(0, -r * 0.5, r * 0.3, 0, Math.PI * 2);
      g.moveTo(0, -r * 0.2);
      g.lineTo(0, r * 0.88);
      g.moveTo(0, r * 0.55);
      g.lineTo(r * 0.32, r * 0.55);
      g.moveTo(0, r * 0.8);
      g.lineTo(r * 0.26, r * 0.8);
      g.stroke();
      break;
    case "tree":
      g.moveTo(0, -r * 0.92);
      g.lineTo(r * 0.68, r * 0.35);
      g.lineTo(-r * 0.68, r * 0.35);
      g.fill();
      g.fillRect(-r * 0.12, r * 0.3, r * 0.24, r * 0.58);
      break;
    case "wheel":
      g.lineWidth = r * 0.14;
      g.arc(0, 0, r * 0.72, 0, Math.PI * 2);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        g.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
        g.lineTo(-Math.cos(a) * r * 0.72, -Math.sin(a) * r * 0.72);
      }
      g.stroke();
      g.beginPath();
      g.arc(0, 0, r * 0.2, 0, Math.PI * 2);
      g.fill();
      break;
    case "eye":
      g.moveTo(-r * 0.92, 0);
      g.quadraticCurveTo(0, -r * 0.85, r * 0.92, 0);
      g.quadraticCurveTo(0, r * 0.85, -r * 0.92, 0);
      g.fill();
      g.fillStyle = "rgba(0,0,0,0.7)";
      g.beginPath();
      g.arc(0, 0, r * 0.26, 0, Math.PI * 2);
      g.fill();
      break;
    case "crown":
      g.moveTo(-r * 0.8, r * 0.55);
      g.lineTo(-r * 0.8, -r * 0.45);
      g.lineTo(-r * 0.4, r * 0.05);
      g.lineTo(0, -r * 0.7);
      g.lineTo(r * 0.4, r * 0.05);
      g.lineTo(r * 0.8, -r * 0.45);
      g.lineTo(r * 0.8, r * 0.55);
      g.fill();
      break;
  }
  g.restore();
}

/** A pennant on the rack, for one group. */
interface Pen {
  g: GroupShow;
  hold: Group;
  /** The cloth turns about the rod; it is hung upside down for a group that is against you. */
  cloth: Mesh;
  mat: MeshStandardMaterial;
  tex: CanvasTexture;
  canvas: Canvas;
  cord: Mesh;
  rod: Mesh;
  knobs: Mesh[];
  bead: Mesh;
  drawn: string;
  /** Where its rod hangs now and where it is going; across, now and to come. */
  y: number;
  wantY: number;
  x: number;
  wantX: number;
  /** Its width now. */
  w: number;
  wantW: number;
  /** How far it is on the rack, 0 to 1; whether it is going. */
  k: number;
  leaving: boolean;
  /** How much it is swinging from a change, and how far it is lifted by the pointer. */
  swing: number;
  lift: number;
  /** How far it is swung forward, picked. */
  fwd: number;
  seed: number;
}

export class Rack extends PropBase {
  readonly key = "rack";
  readonly name = "Where you stand";

  private data: StandingShow | null = null;
  private pens = new Map<string, Pen>();
  private order: string[] = [];
  private page = 0;
  private pages = 1;
  private picked: string | null = null;
  private over: string | null = null;

  private clothGeo: PlaneGeometry;
  private cordGeo: CylinderGeometry;
  private rodGeo: CylinderGeometry;
  private knobGeo: SphereGeometry;
  private oak: MeshStandardMaterial;
  private brass: MeshStandardMaterial;
  private cordMat: MeshStandardMaterial;
  private ladder: Label;
  private ladderKey = "";
  private more: Label;
  private moreHold = new Group();

  /* What swings forward when a pennant is touched. */
  private card = new Group();
  private banner: Mesh;
  private head: Label;
  private slip: Choices;
  private cardK = 0;
  private cardKey = "";
  private bannerW = 0.042;
  private bannerH = 0.08;

  constructor(h: PropHost) {
    super(h);
    const k = this.kit;
    const woodSkin = k.skin(woodCanvas(256, 64, { planks: 2, seed: 71, dark: [70, 42, 22], light: [150, 100, 58] }), { rough: 0.7 });
    const darkWood = k.skin(woodCanvas(128, 64, { planks: 1, seed: 73, dark: [48, 28, 15], light: [104, 66, 36] }), { rough: 0.72 });
    this.oak = k.paint(PALETTE.oakLight, 0.62);
    this.brass = k.metal(PALETTE.brass, 0.4);
    this.cordMat = k.paint(PALETTE.cord, 0.9);
    this.clothGeo = k.geo(new PlaneGeometry(1, 1, 4, 8));
    this.clothGeo.translate(0, -0.5, 0);
    // The cloth hangs a little full: bowed toward you across, and billowing at its foot.
    const p = this.clothGeo.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5, v = -p.getY(i);
      p.setZ(i, Math.sin(Math.PI * u) * 0.0018 + v * v * 0.0035 + Math.sin(v * 5 + u * 2) * 0.0007);
    }
    p.needsUpdate = true;
    this.clothGeo.computeVertexNormals();
    this.cordGeo = k.geo(new CylinderGeometry(0.0006, 0.0006, 1, 5));
    this.cordGeo.translate(0, -0.5, 0);
    this.rodGeo = k.geo(new CylinderGeometry(0.0016, 0.0016, 1, 6));
    this.rodGeo.rotateZ(Math.PI / 2);
    this.knobGeo = k.geo(new SphereGeometry(0.0028, 8, 6));

    // The plank it stands on, with a lip along its front.
    const plank = k.crook(k.box(PLANK_X1 - PLANK_X0, 0.013, 0.07, woodSkin, 0.004), 5, 0.0006);
    plank.position.set(MID_X, 0.0065, 0);
    const lip = k.box(PLANK_X1 - PLANK_X0 - 0.012, 0.004, 0.006, darkWood, 0.0015);
    lip.position.set(MID_X, 0.015, 0.029);
    this.group.add(plank, lip);
    // The notched post at the left, painted with the ladder.
    const post = k.crook(k.box(0.017, 0.152, 0.017, darkWood, 0.003), 9, 0.0004);
    post.position.set(POST_X, 0.013 + 0.076, 0);
    this.group.add(post);
    const cap = k.lathe([[0, 0], [0.011, 0], [0.012, 0.004], [0.007, 0.007], [0.006, 0.012], [0.0035, 0.017], [0, 0.019]], this.brass, 10);
    cap.position.set(POST_X, 0.165, 0);
    this.group.add(cap);
    this.ladder = new Label(0.0135, HIGH_Y - LOW_Y + 0.016, { px: 3200 });
    this.ladder.glow = 0.16;
    this.ladder.mesh.position.set(POST_X, (LOW_Y + HIGH_Y) / 2, 0.0088);
    this.group.add(this.ladder.mesh);
    // The other post, plain, with a turned top.
    const post2 = k.crook(k.box(0.011, 0.152, 0.012, darkWood, 0.0025), 10, 0.0004);
    post2.position.set(POST2_X, 0.013 + 0.076, 0);
    this.group.add(post2);
    const cap2 = k.lathe([[0, 0], [0.0075, 0], [0.008, 0.003], [0.0045, 0.006], [0.006, 0.01], [0, 0.014]], this.oak, 10);
    cap2.position.set(POST2_X, 0.165, 0);
    this.group.add(cap2);
    // The bar the pennants hang from.
    const bar = k.cast(new Mesh(k.geo(new CylinderGeometry(0.0038, 0.0038, POST2_X - POST_X + 0.008, 10)), this.oak));
    bar.rotation.z = Math.PI / 2;
    bar.position.set((POST_X + POST2_X) / 2, BAR_Y, 0);
    this.group.add(bar);
    // The tag for more groups than the rack holds, tied to the right post.
    this.more = new Label(0.03, 0.017, { px: 3000 });
    this.more.glow = 0.16;
    this.more.mesh.castShadow = true;
    this.moreHold.position.set(MORE_X, MORE_Y, 0.0075);
    this.more.mesh.position.set(0, -0.012, 0.001);
    const string = new Mesh(this.cordGeo, this.cordMat);
    string.scale.y = 0.004;
    this.moreHold.add(this.more.mesh, string);
    this.moreHold.visible = false;
    this.group.add(this.moreHold);

    // The banner, its heading and its slip.
    this.banner = new Mesh(this.clothGeo, this.oak);
    this.head = new Label(0.15, 0.05, { px: 2600 });
    this.head.glow = 0.16;
    this.slip = new Choices(0.2);
    this.card.add(this.banner, this.head.mesh, this.slip.group);
    this.card.visible = false;
    this.spread.add(this.card);
  }

  /* ------------------------------------------------- what the game shows ------------------------------------------------- */

  show(shows: readonly Show[]): boolean {
    const next = shows.find((s): s is StandingShow => s.kind === "standing") ?? null;
    const first = !this.data;
    this.data = next;
    const groups = next?.groups ?? [];
    for (const [id, pen] of this.pens) if (!groups.some((g) => g.id === id)) pen.leaving = true;
    let moved = false;
    for (const g of groups) {
      let pen = this.pens.get(g.id);
      if (!pen || pen.leaving) {
        if (pen) this.drop(pen);
        pen = this.make(g, first);
        this.pens.set(g.id, pen);
      } else if (heightOf(pen.g) !== heightOf(g) || pen.g.tone !== g.tone) {
        // Its standing has changed: it slides along its cord, and swings.
        pen.swing = 1;
        moved = true;
      }
      pen.g = g;
      pen.wantY = heightOf(g);
      this.paint(pen);
    }
    this.order = groups.map((g) => g.id);
    if (this.picked && !groups.some((g) => g.id === this.picked)) this.picked = null;
    if (moved && !first) sound.play("slide", { x: this.group.position.x, gain: 0.45, rate: 0.8 });
    this.arrange();
    return groups.length > 0;
  }

  private make(g: GroupShow, first: boolean): Pen {
    const { seed } = heraldry(g.id);
    const [canvas] = mk(CW, CH);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new MeshStandardMaterial({ map: tex, roughness: 0.92, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.11, alphaTest: 0.5, side: DoubleSide });
    const hold = new Group();
    const cloth = this.kit.cast(new Mesh(this.clothGeo, mat));
    const rod = this.kit.cast(new Mesh(this.rodGeo, this.oak));
    const knobs = [new Mesh(this.knobGeo, this.oak), new Mesh(this.knobGeo, this.oak)];
    const bead = this.kit.cast(new Mesh(this.knobGeo, this.brass));
    const cord = new Mesh(this.cordGeo, this.cordMat);
    cord.castShadow = true;
    hold.add(cloth, rod, ...knobs, bead);
    this.group.add(hold, cord);
    const y = heightOf(g);
    // A group the run has just come to know drops in from the bar; those there at the start are simply hung.
    return { g, hold, cloth, mat, tex, canvas, cord, rod, knobs, bead, drawn: "", y: first ? y : BAR_Y - 0.004, wantY: y, x: 0, wantX: 0, w: 0, wantW: 0, k: first ? 1 : 0, leaving: false, swing: first ? 0 : 0.8, lift: 0, fwd: 0, seed };
  }

  private drop(pen: Pen): void {
    this.group.remove(pen.hold, pen.cord);
    pen.tex.dispose();
    pen.mat.dispose();
  }

  /** The pennant's cloth: its dye, its device, and the group's name written down it; soot-edged when it is against you. */
  private paint(pen: Pen): void {
    const g = pen.g;
    const key = `${g.name}|${g.tone}`;
    if (key === pen.drawn) return;
    pen.drawn = key;
    const { dye, device } = heraldry(g.id);
    const c = pen.canvas.getContext("2d")!;
    c.clearRect(0, 0, CW, CH);
    const tail = CH * 0.16;
    const outline = (): void => {
      c.beginPath();
      c.moveTo(3, 3);
      c.lineTo(CW - 3, 3);
      c.lineTo(CW - 3, CH - 3);
      c.lineTo(CW / 2, CH - 3 - tail);
      c.lineTo(3, CH - 3);
      c.closePath();
    };
    c.save();
    outline();
    c.clip();
    c.fillStyle = dye;
    c.fillRect(0, 0, CW, CH);
    // The weave and the wear of old cloth.
    const r = rng(hash(g.id) + 5);
    for (let y = 0; y < CH; y += 2) {
      c.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,240,210"},${0.03 + r() * 0.05})`;
      c.fillRect(0, y, CW, 1);
    }
    const shade = c.createLinearGradient(0, 0, CW, 0);
    shade.addColorStop(0, "rgba(0,0,0,0.22)");
    shade.addColorStop(0.5, "rgba(255,240,210,0.08)");
    shade.addColorStop(1, "rgba(0,0,0,0.22)");
    c.fillStyle = shade;
    c.fillRect(0, 0, CW, CH);
    // A band of the lighter colour at the head, where it is sewn over the rod.
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.fillRect(0, 0, CW, CH * 0.05);
    const light = dye === hex(PALETTE.brass) ? hex(PALETTE.soot) : hex(PALETTE.wax);
    drawDevice(c, device, CW / 2, CH * 0.25, CW * 0.72, light);
    // The name, written down the cloth.
    c.save();
    c.translate(CW / 2, CH * 0.405);
    c.rotate(Math.PI / 2);
    c.fillStyle = light;
    c.textAlign = "left";
    fitName(c, g.name, 0, 0, CH * 0.43, CW * 0.4, CW * 0.15, "italic 700");
    c.restore();
    c.restore();
    // Its hem: soot for a group against you, a stitched line for the rest.
    outline();
    c.lineWidth = g.tone === "against" ? 16 : 5;
    c.strokeStyle = g.tone === "against" ? "rgba(14,10,8,0.92)" : "rgba(20,12,6,0.55)";
    c.stroke();
    if (g.tone !== "against") {
      c.save();
      c.setLineDash([7, 6]);
      c.lineWidth = 2;
      c.strokeStyle = "rgba(240,225,190,0.45)";
      c.translate(CW * 0.04, CH * 0.02);
      c.scale(0.92, 0.95);
      outline();
      c.stroke();
      c.restore();
    }
    pen.tex.needsUpdate = true;
  }

  /** The ladder painted down the post: a band for each step, red below, pale in the middle, green above, a notch between. */
  private drawLadder(): void {
    const d = this.data;
    if (!d) return;
    const key = d.ladder.map((l) => l.from).join(",");
    if (key === this.ladderKey) return;
    this.ladderKey = key;
    const span = HIGH_Y - LOW_Y, pad = 0.008, tall = span + pad * 2;
    const least = d.groups[0]?.least ?? -100, most = d.groups[0]?.most ?? 100;
    const yOf = (n: number): number => 1 - (pad + ((n - least) / (most - least)) * span) / tall;
    const neutral = d.ladder.findIndex((l) => l.from <= 0 && (d.ladder[d.ladder.indexOf(l) + 1]?.from ?? 999) > 0);
    this.ladder.draw((g, w, h) => {
      g.fillStyle = "#2a1a0e";
      g.fillRect(0, 0, w, h);
      d.ladder.forEach((l, i) => {
        const top = yOf(d.ladder[i + 1]?.from ?? most) * h, foot = yOf(l.from) * h;
        const off = i - neutral;
        // Darker the further from the middle: oxblood toward the foot, moss toward the top.
        const k = Math.min(1, Math.abs(off) / 4);
        g.fillStyle = off < 0 ? `rgb(${120 - k * 30},${40 - k * 12},${30 - k * 8})` : off > 0 ? `rgb(${60 - k * 20},${96 + k * 10},${62 - k * 10})` : "#cdbb8c";
        g.fillRect(w * 0.14, top + 2, w * 0.72, foot - top - 4);
        // The notch between steps.
        g.fillStyle = "#120b06";
        g.fillRect(0, foot - 3, w, 6);
      });
    });
  }

  /* ------------------------------------------------- laying it out ------------------------------------------------- */

  place(lay: Lay, narrow: boolean): void {
    super.place(lay, narrow);
    this.card.remove(this.slip.group);
    this.slip.dispose();
    this.slip = narrow ? new Choices(0.19, 0.0112) : new Choices(0.2, 0.0082);
    this.card.add(this.slip.group);
    this.cardKey = "";
    this.arrange();
  }

  /** Where each pennant of this page hangs, and the banner and its slip when one is picked. */
  private arrange(): void {
    const d = this.data;
    if (!d) return;
    this.drawLadder();
    const ids = this.order;
    this.pages = Math.max(1, Math.ceil(ids.length / RACK_PAGE));
    this.page = Math.max(0, Math.min(this.pages - 1, this.page));
    const on = ids.slice(this.page * RACK_PAGE, (this.page + 1) * RACK_PAGE);
    const pitch = (SLOT_X1 - SLOT_X0) / Math.max(on.length, 3);
    const span = pitch * on.length;
    const x0 = (SLOT_X0 + SLOT_X1) / 2 - span / 2;
    for (const [id, pen] of this.pens) {
      const i = on.indexOf(id);
      if (i < 0) continue;
      pen.wantX = x0 + pitch * (i + 0.5);
      pen.wantW = Math.min(PEN_W, pitch * 0.82);
      if (!pen.w) {
        pen.x = pen.wantX;
        pen.w = pen.wantW;
      }
    }
    this.moreHold.visible = this.pages > 1;
    if (this.pages > 1)
      this.more.draw((g, w, h) => {
        paper(g, w, h, 37);
        g.fillStyle = PENCIL;
        g.textAlign = "center";
        fitText(g, `${this.page + 1}/${this.pages} ›`, w / 2, h * 0.72, w - 8, h * 0.66, h * 0.4, "700", PENCIL_FONT);
      });
    this.layCard();
  }

  /** The banner of the group picked, with its heading, and under them its slip. */
  private layCard(): void {
    const pen = this.picked ? this.pens.get(this.picked) : undefined;
    if (!pen) return;
    const g = pen.g;
    const narrow = this.narrow;
    const sw = this.slip.w;
    this.bannerW = narrow ? 0.031 : 0.028;
    this.bannerH = this.bannerW * (CH / CW);
    const hw = sw - this.bannerW - 0.006, hh = this.bannerH * 0.62;
    this.slip.set("", g.text, g.notes.join(" "), g.aid.map((a) => `${a.say} · ${a.state}`));
    const key = `${g.id}|${g.name}|${g.label}|${g.standing}|${g.step}|${narrow}`;
    if (key !== this.cardKey) {
      this.cardKey = key;
      if (Math.abs(this.head.w - hw) > 1e-6 || Math.abs(this.head.h - hh) > 1e-6) {
        this.card.remove(this.head.mesh);
        this.head.dispose();
        this.head = new Label(hw, hh, { px: 2600 });
        this.head.glow = 0.16;
        this.card.add(this.head.mesh);
      }
      this.drawHead(g);
    }
    this.banner.material = pen.mat;
    // The banner hangs upside down for a group against you, as its pennant does.
    const against = g.tone === "against";
    this.banner.scale.set(this.bannerW, this.bannerH, 1.6);
    this.banner.rotation.z = against ? Math.PI : 0;
    // From the top: the banner and its heading side by side, the slip under them; standing on the wood in front of the rack.
    const top = this.bannerH + 0.006 + this.slip.deep + 0.008;
    const left = -sw / 2;
    this.banner.position.set(left + this.bannerW / 2, against ? top - this.bannerH : top, 0.002);
    this.head.mesh.position.set(left + this.bannerW + 0.006 + hw / 2, top - hh / 2 - 0.004, 0.001);
    this.slip.group.rotation.x = Math.PI / 2;
    this.slip.group.position.set(0, top - this.bannerH - 0.006 - this.slip.deep / 2, 0);
    // On a wide screen you look at it from the right, past the candlestick, so the card is turned a little toward you.
    const s = this.lay?.home.scale ?? 1;
    this.card.rotation.order = "YXZ";
    this.card.rotation.y = narrow ? 0 : CARD_TURN;
    this.card.position.set(0, 0, narrow ? 0.052 * s + 0.012 : 0.07);
  }

  /** The heading: the group's name, the step it stands on and its standing, and the ladder with its place marked. */
  private drawHead(g: GroupShow): void {
    const d = this.data!;
    this.head.draw((c, w, h) => {
      paper(c, w, h, 83);
      c.fillStyle = INK;
      c.textAlign = "left";
      fitName(c, g.name, w * 0.05, h * 0.27, w * 0.9, h * 0.3, h * 0.17, "italic 700");
      const sign = g.standing > 0 ? "+" : "";
      c.fillStyle = g.tone === "against" ? "#6a1e14" : g.tone === "for" ? "#24452c" : INK;
      fitText(c, `${g.label}  ${sign}${g.standing}`, w * 0.05, h * 0.66, w * 0.9, h * 0.22, h * 0.13, "italic 700");
      // The nine steps in a row, the one it is on filled.
      const n = d.ladder.length, x0 = w * 0.05, x1 = w * 0.95, y = h * 0.8, cell = (x1 - x0) / n;
      d.ladder.forEach((_, i) => {
        c.fillStyle = i === g.step ? (g.tone === "against" ? "#7a2418" : g.tone === "for" ? "#2f5e3a" : "#3a2a18") : "rgba(36,22,12,0.18)";
        c.fillRect(x0 + i * cell + 2, y, cell - 4, h * 0.1);
      });
    });
  }

  /* ------------------------------------------------- opening and closing ------------------------------------------------- */

  open(): void {
    super.open();
    this.picked = null;
    this.arrange();
    sound.play("pat", { x: this.group.position.x, gain: 0.4 });
    const d = this.data;
    if (d) this.h.tell(`${this.name}, open. ${d.groups.map((g) => `${g.name}: ${g.label}, ${g.standing}`).join("; ")}.`);
  }

  close(): void {
    if (!this.isOpen) return;
    super.close();
    this.picked = null;
    this.over = null;
  }

  /* ------------------------------------------------- touching ------------------------------------------------- */

  parts(): Part[] {
    if (!this.isOpen || !this.data) return [];
    const out: Part[] = [];
    if (this.picked) {
      if (this.cardK < 0.6) return [];
      out.push(...this.slip.parts());
      const b = this.banner.position;
      out.push(this.partAt("banner", b.x, b.y - this.bannerH / 2, b.z, this.bannerW * 0.7, this.card));
      out.push({ ...this.partAt("back", 0, 0.08, 0, 0.2, this.card), under: true });
      return out;
    }
    for (const id of this.order.slice(this.page * RACK_PAGE, (this.page + 1) * RACK_PAGE)) {
      const pen = this.pens.get(id);
      if (!pen || pen.leaving) continue;
      out.push(this.partAt(`pennant:${id}`, pen.wantX, pen.wantY - PEN_H * 0.45, 0, Math.max(0.016, pen.wantW * 0.62), this.group));
    }
    if (this.pages > 1) out.push(this.partAt("more", MORE_X, MORE_Y - 0.012, 0.009, 0.016, this.group));
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
    if (id.startsWith("pennant:")) {
      const pen = this.pens.get(id.slice(8));
      if (!pen) return;
      this.picked = pen.g.id;
      this.cardKey = "";
      sound.play("swish", { x, gain: 0.4, rate: 1.2 });
      this.layCard();
      const g = pen.g;
      this.h.tell(`${g.name}: ${g.label}, ${g.standing}. ${g.text} ${g.notes.join(" ")} ${g.aid.length ? `It would: ${g.aid.map((a) => `${a.say}, ${a.state}`).join("; ")}.` : ""}`);
      return;
    }
    if (id.startsWith("choice:")) {
      const pen = this.picked ? this.pens.get(this.picked) : undefined;
      const aid = pen?.g.aid[Number(id.slice(7))];
      if (aid) this.h.write(aid.line);
      return;
    }
    if (id === "banner" || id === "back") {
      this.picked = null;
      sound.play("swish", { x, gain: 0.3, rate: 0.9 });
      return;
    }
    if (id === "more") {
      this.page = (this.page + 1) % this.pages;
      this.picked = null;
      sound.play("slide", { x, gain: 0.4, rate: 1.25 });
      this.arrange();
    }
  }

  /** For checks: what hangs where. */
  get state(): { open: boolean; shown: string[]; heights: Record<string, number>; picked: string | null; page: number; pages: number; choices: number } {
    const shown = this.order.slice(this.page * RACK_PAGE, (this.page + 1) * RACK_PAGE);
    return { open: this.isOpen, shown, heights: Object.fromEntries(shown.map((id) => [id, Math.round((this.pens.get(id)?.wantY ?? 0) * 1000) / 1000])), picked: this.picked, page: this.page, pages: this.pages, choices: this.picked ? this.slip.count : 0 };
  }

  /* ------------------------------------------------- every frame ------------------------------------------------- */

  update(dt: number, t: number): void {
    const still = this.h.reduced;
    const to = (now: number, want: number, rate: number): number => (still || Math.abs(want - now) < 0.0004 ? want : now + (want - now) * Math.min(1, dt * rate));
    const on = new Set(this.order.slice(this.page * RACK_PAGE, (this.page + 1) * RACK_PAGE));
    for (const [id, pen] of [...this.pens]) {
      const shown = on.has(id) && !pen.leaving;
      pen.k = to(pen.k, shown ? 1 : 0, shown ? 4 : 6);
      if (pen.leaving && pen.k <= 0.001) {
        this.drop(pen);
        this.pens.delete(id);
        continue;
      }
      pen.hold.visible = pen.cord.visible = pen.k > 0.01;
      if (!pen.hold.visible) continue;
      pen.y = to(pen.y, pen.wantY, 2.6);
      pen.x = to(pen.x, pen.wantX, 7);
      pen.w = to(pen.w, pen.wantW, 7);
      pen.swing = still ? 0 : Math.max(0, pen.swing - dt * 0.7);
      const pointed = this.isOpen && !this.picked && this.over === `pennant:${id}`;
      pen.lift = to(pen.lift, pointed ? 1 : 0, 10);
      pen.fwd = to(pen.fwd, this.isOpen && this.picked === id ? 1 : 0, 7);
      const k = ease(pen.k);
      const y = pen.y + (1 - k) * 0.01;
      pen.hold.position.set(pen.x, y, 0.0005 * pen.lift);
      pen.hold.scale.set(1, k, 1);
      const sway = still ? 0 : Math.sin(t * 1.1 + pen.seed * 40) * 0.025 + Math.sin(t * 6.5 + pen.seed * 9) * 0.18 * pen.swing * pen.swing;
      pen.hold.rotation.set(-pen.lift * 0.32 - ease(pen.fwd) * 1.25, 0, sway);
      const w = pen.w, against = pen.g.tone === "against";
      pen.cloth.scale.set(w, PEN_H, 1);
      pen.cloth.rotation.z = against ? Math.PI : 0;
      pen.cloth.position.y = against ? -PEN_H : 0;
      pen.mat.emissiveIntensity = 0.11 + pen.lift * 0.12;
      pen.rod.scale.set(w + 0.006, 1, 1);
      const forYou = pen.g.tone === "for";
      pen.knobs.forEach((knob, i) => {
        knob.material = forYou ? this.brass : this.oak;
        knob.position.set((i ? 1 : -1) * (w / 2 + 0.003), 0, 0);
        knob.scale.setScalar(forYou ? 1.15 : 0.85);
      });
      // A bead on the cord when its people are here.
      pen.bead.visible = pen.g.here.length > 0;
      pen.bead.position.set(0, 0.006, 0);
      pen.bead.scale.setScalar(0.8);
      pen.cord.position.set(pen.x, BAR_Y, 0);
      pen.cord.scale.set(1, Math.max(0.001, BAR_Y - y), 1);
    }
    this.moreHold.rotation.z = still ? 0 : Math.sin(t * 0.9) * 0.04;
    this.more.glow = this.over === "more" ? 0.32 : 0.16;
    // The banner swings up from lying forward, and is put back the same way.
    this.cardK = to(this.cardK, this.isOpen && this.picked ? 1 : 0, 7);
    this.card.visible = this.cardK > 0.01;
    if (this.card.visible) {
      const e = ease(this.cardK);
      this.card.scale.setScalar(0.55 + 0.45 * e);
      this.card.rotation.x = -0.22 - (1 - e) * 1.1;
      this.head.glow = 0.16;
      (this.banner.material as Material & { emissiveIntensity?: number }).emissiveIntensity = this.over === "banner" ? 0.24 : 0.14;
    }
  }

  dispose(): void {
    for (const pen of this.pens.values()) this.drop(pen);
    this.ladder.dispose();
    this.more.dispose();
    this.head.dispose();
    this.slip.dispose();
    super.dispose();
  }
}
