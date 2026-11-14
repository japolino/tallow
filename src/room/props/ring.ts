/**
 * The fight ring (game/system.ts, Show "fight"; the fight system gives it, systems/fight.ts ringShow): who stands
 * against you, how each side is doing, and what could be tried, while a fight or a contest is on.
 *
 * Closed, it is a round fighting mat of dark hide inside a rope, stretched as the head of a low laced drum so that it
 * stands clear of what lies nearer on the table, with a chalk line scratched across its middle. A turned piece stands
 * on the far half for everyone against you, and a pale one on the near half is yours, with
 * anyone who is with you beside it; those on neither side stand on the line between. A piece that is fighting wears
 * its health as a glowing band up its middle, which sinks as the health goes; one much stronger than you is larger,
 * darker and crowned, one much weaker small and light (from the game's own step of power, never guessed here). A hit
 * rocks a piece, and one brought down topples and stays lying. A contest's measures are posts standing at the drum's
 * left, a bead riding each: the end where it is won is capped large in gold, the end where it is lost in red. Your saves
 * from a killing blow are brass tokens standing at the rim before your piece; one spent is knocked flat and goes dull.
 *
 * Open, you lean over it. Touch a piece and a slip is held up beside the mat with what is known of them, how they
 * stand, and a few pencilled choices; touch your own piece (or its tokens) for your health and the ways to go about
 * it that the game offers; touch a post to read what it measures and what its ends mean; touch the name plate leaning
 * against the drum to read who is on which side. Every choice writes a line in the notebook, to finish, change or leave.
 *
 * Nothing here knows who anyone is or what can be done to them: every word and every line is the game's.
 */
import { Color, ConeGeometry, CircleGeometry, CylinderGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector2, Vector3, type BufferGeometry, type Material } from "three";
import type { Choice, FightFoe, FightMeasure, FightOther, Show } from "../../game/system.js";
import { sound } from "../sound.js";
import { leatherCanvas, mk, rng } from "../textures.js";
import { ease } from "../track.js";
import { Choices, fitName, INK, INK_FONT, Label, PALETTE, paper, PropBase, wrapLines, type Lay, type Part, type PropHost } from "./base.js";

type FightShow = Extract<Show, { kind: "fight" }>;

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/* The mat, in the prop's own space: its middle at the origin, the far half toward -z. */
const MAT_R = 0.084;
/** The mat is the head of a low drum, so the fight is seen from the chair over what stands nearer on the table. */
const MAT_Y = 0.031;
const ROPE_R = 0.086, ROPE_T = 0.0042;
/** Feet stay inside this on the far half, and inside the lesser on the near half, which keeps the rim for the tokens. */
const FAR_R = 0.076, NEAR_R = 0.066;
/** How far apart two pieces stand, and how tall one of ordinary strength is. */
const PITCH = 0.03;
const PIECE_H = 0.042;
/** The health band of a piece: where it starts and how tall it is at full. */
const BAND_Y = 0.004, BAND_H = 0.0216;
/** How much larger a piece is for each step it is stronger than you. */
const GROW = 0.11;
/** Where the measures' posts stand, and how tall one is. */
const POST_X = -0.108, POST_H = 0.08;
const BEAD_LOW = 0.016, BEAD_HIGH = 0.072;
/** How steeply the name plate leans against the drum, and how deep it is on a wide table and an upright one. */
const PLATE_LEAN = 0.9, PLATE_D = 0.019, PLATE_D_NARROW = 0.026;
/** How deep a name's slip is, lying before its piece. */
const PLAQUE_D = 0.02;
/** How far from the middle of the mat your tokens stand, and the angle between two of them. */
const TOKEN_R = 0.0725, TOKEN_GAP = 0.3;

type Stance = "you" | "against" | "yours" | "other";

interface Piece {
  /** Its part's id: "you", "foe:<id>" or "other:<id>". */
  id: string;
  name: string;
  stance: Stance;
  step: number;
  /** What it looks like was made for: remade when this changes. */
  look: string;
  /** Moves about the mat and is sized; `turn` faces the way it will fall; `tip` rocks and topples about its foot. */
  hold: Group;
  turn: Group;
  tip: Group;
  /** The health band: the glowing part and the part burnt out above it. Null for one who is not fighting. */
  lit: Mesh | null;
  spent: Mesh | null;
  /** Health shown, 0..1, and where it is going. */
  hp: number;
  hpTo: number;
  down: boolean;
  /** How far it has toppled, 0 standing to 1 lying. */
  fall: number;
  /** A rocking that dies away: how strong it is now, and how far through its swing. */
  rock: number;
  swing: number;
  /** Where it stands on the mat and how large, and where it is going. */
  to: Vector3;
  size: number;
  /** How far it has arrived (0 not yet, 1 standing there); leaving, it goes back to 0 and is taken off. */
  k: number;
  leaving: boolean;
  /** Its name on a slip of paper lying before it, while the ring is open and there is room. */
  plaque: Label | null;
  plaqueKey: string;
  plaqueAt: Vector3;
  plaqueW: number;
  seed: number;
}

interface Post {
  m: FightMeasure;
  hold: Group;
  bead: Mesh;
  /** How full it is shown, 0..1. */
  k: number;
  /** A moment of the bead swelling: it has just moved. */
  bump: number;
}

interface Token {
  hold: Group;
  disc: Mesh;
  /** 0 standing and bright, 1 knocked flat and dull. */
  k: number;
}

/** Where pieces stand on one half of the mat: rows going out from the line, each centred. Null when they do not fit at this size. */
function seats(n: number, s: number, first: number, R: number): { x: number; z: number; gap: number; row: number }[] | null {
  if (!n) return [];
  const p = PITCH * s, foot = 0.0115 * s;
  const rows: { z: number; cap: number; hw: number }[] = [];
  for (let z = first; z < R - foot; z += p * 0.93) {
    const hw = Math.sqrt(R * R - z * z) - foot;
    if (hw < 0) break;
    rows.push({ z, cap: Math.floor((2 * hw) / p + 1e-6) + 1, hw });
  }
  if (rows.reduce((a, r) => a + r.cap, 0) < n) return null;
  const out: { x: number; z: number; gap: number; row: number }[] = [];
  let left = n;
  rows.forEach((r, i) => {
    const m = Math.min(r.cap, left);
    left -= m;
    // A few stand well apart; a full row as close as it must.
    const gap = m > 1 ? Math.min(0.044 * s, (2 * r.hw) / (m - 1)) : Math.min(0.05, 2 * r.hw);
    for (let j = 0; j < m; j++) out.push({ x: (j - (m - 1) / 2) * gap, z: r.z, gap, row: i });
  });
  return out;
}

/** Where those on neither side stand: on the line itself, from its two ends inward. Null when they do not fit at this size. */
function flanks(n: number, s: number): { x: number; z: number; gap: number; row: number }[] | null {
  const p = PITCH * s, end = FAR_R - 0.0115 * s;
  if (n > Math.floor((2 * end) / p + 1e-6) + 1) return null;
  return Array.from({ length: n }, (_, k) => ({ x: (k % 2 ? -1 : 1) * (end - Math.floor(k / 2) * p), z: 0, gap: n > 2 ? p : 0.05, row: 0 }));
}

export class Ring extends PropBase {
  readonly key = "ring";
  readonly name = "The fight";

  private data: FightShow | null = null;
  private pieces = new Map<string, Piece>();
  private posts: Post[] = [];
  private postsKey = "";
  private tokens: Token[] = [];
  /** What is picked up to be read: a piece's id, "measure:<id>", "name"; null when nothing is. */
  private picked: string | null = null;
  private over: string | null = null;
  /** How far it is opened, 0 closed to 1 leaned over. */
  private openK = 0;

  /** Everything of the mat: it is drawn aside a little while open on a wide table, to leave room for the slip. */
  private body = new Group();
  private shift = 0;
  private drop = 0;
  private grow = 1;
  private plate: Label;
  private plateKey = "";
  private plateAt = V(0, 0, 0);
  private slip: Choices;
  private slipK = 0;
  private slipAt = V(0, 0, 0);
  private slipTilt = 0;
  /** Whether names lie before the pieces while open: only where each has room to be read. */
  /** Where on the near rim your tokens stand, as an angle from straight before you. */
  private tokenAt = 0;
  private named = false;

  /* Shapes and paints shared by every piece, post and token. */
  private g: { foot: BufferGeometry; band: BufferGeometry; notch: BufferGeometry; head: BufferGeometry; crown: BufferGeometry; spike: BufferGeometry; rod: BufferGeometry; base: BufferGeometry; ball: BufferGeometry; coin: BufferGeometry };
  private tones = new Map<string, MeshStandardMaterial>();
  private ember: MeshStandardMaterial;
  private white: MeshStandardMaterial;
  private char: MeshStandardMaterial;
  private brass: MeshStandardMaterial;
  private gilt: MeshStandardMaterial;
  private red: MeshStandardMaterial;
  private wood: MeshStandardMaterial;
  private dull: MeshStandardMaterial;
  private beadMat: MeshStandardMaterial;
  private clock = 0;

  constructor(h: PropHost) {
    super(h);
    const k = this.kit;
    this.brass = k.metal(0xa5843c, 0.4);
    this.gilt = k.paint(0xd0a648, 0.45);
    this.red = k.paint(0x8a2a1e, 0.6);
    this.wood = k.paint(PALETTE.oakDark, 0.7);
    this.dull = k.metal(0x4a4640, 0.7);
    // What glows gives its own light, so it reads from the chair in a dark room.
    this.ember = k.mat(new MeshStandardMaterial({ color: 0xd9682a, roughness: 0.6, emissive: 0xd4551c, emissiveIntensity: 0.75 }));
    this.white = k.mat(new MeshStandardMaterial({ color: 0xf2e6c4, roughness: 0.6, emissive: 0xf0dca8, emissiveIntensity: 0.6 }));
    this.beadMat = k.mat(new MeshStandardMaterial({ color: 0xf2e6c4, roughness: 0.5, emissive: 0xf0dca8, emissiveIntensity: 0.55 }));
    this.char = k.paint(0x2c221c, 0.95);
    const lathe = (pts: [number, number][], sides: number): BufferGeometry => k.geo(new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), sides));
    const unit = (r: number, sides: number, top = r): BufferGeometry => {
      const geo = new CylinderGeometry(top, r, 1, sides);
      geo.translate(0, 0.5, 0);
      return k.geo(geo);
    };
    this.g = {
      foot: lathe([[0, 0], [0.0108, 0], [0.0108, 0.0018], [0.0082, 0.0034], [0.0064, BAND_Y], [0, BAND_Y]], 14),
      band: unit(0.0058, 12),
      notch: unit(0.0064, 12),
      head: lathe([[0, BAND_Y + BAND_H], [0.0058, BAND_Y + BAND_H], [0.0088, 0.0268], [0.0088, 0.0282], [0.0048, 0.03], [0.0036, 0.0316], [0.0062, 0.034], [0.0072, 0.037], [0.0062, 0.0398], [0.003, 0.0414], [0, PIECE_H]], 14),
      crown: k.geo(new TorusGeometry(0.0062, 0.0011, 5, 14)),
      spike: k.geo(new ConeGeometry(0.0014, 0.0052, 5)),
      rod: unit(0.0015, 6),
      base: lathe([[0, 0], [0.0066, 0], [0.0066, 0.002], [0.004, 0.0045], [0, 0.0045]], 10),
      ball: k.geo(new SphereGeometry(1, 12, 8)),
      coin: unit(0.0062, 16),
    };

    // The drum: a low hoop of dark wood laced with cord, its head a disc of hide, scuffed and chalked, inside a ring of rope.
    const shell = k.cast(new Mesh(k.geo(new CylinderGeometry(MAT_R + 0.001, MAT_R + 0.0025, MAT_Y, 48, 1, true)), k.skin(this.shellCanvas(), { rough: 0.8 })));
    shell.position.y = MAT_Y / 2;
    const head = k.cast(new Mesh(k.geo(new CircleGeometry(MAT_R + 0.001, 48)), k.skin(this.matCanvas(), { rough: 0.9 })));
    head.rotation.x = -Math.PI / 2;
    head.position.y = MAT_Y;
    head.castShadow = false;
    const cord = k.paint(PALETTE.cord, 0.95);
    const rope = k.cast(new Mesh(k.geo(new TorusGeometry(ROPE_R, ROPE_T, 6, 44)), cord));
    rope.rotation.x = Math.PI / 2;
    rope.position.y = MAT_Y - ROPE_T * 0.2;
    const hoop = k.cast(new Mesh(k.geo(new TorusGeometry(MAT_R + 0.0028, 0.0026, 5, 44)), k.paint(PALETTE.oakDark, 0.7)));
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = 0.0026;
    this.body.add(shell, head, rope, hoop);
    this.group.add(this.body);

    // What is laid out while it is open: the name plate under the mat, and the slip held up beside it.
    this.plate = new Label(0.12, PLATE_D, { flat: true });
    this.spread.add(this.plate.mesh);
    this.slip = new Choices(0.126, 0.0062);
    this.slip.group.visible = false;
    this.spread.add(this.slip.group);
    this.spread.visible = false;
  }

  /** The side of the drum: dark staves, and a cord laced up and down between its two hoops. */
  private shellCanvas(): HTMLCanvasElement {
    const w = 1024, h = 64;
    const [c, g] = mk(w, h);
    g.fillStyle = "#4a2c18";
    g.fillRect(0, 0, w, h);
    const r = rng(88);
    for (let x = 0; x < w; x += 2) {
      g.fillStyle = `rgba(${r() < 0.5 ? "20,10,4" : "150,100,60"},${0.05 + r() * 0.12})`;
      g.fillRect(x, 0, 1 + (r() < 0.3 ? 1 : 0), h);
    }
    // The staves' joints.
    g.fillStyle = "rgba(15,7,3,0.55)";
    for (let i = 0; i < 16; i++) g.fillRect((i / 16) * w, 0, 2, h);
    // The lacing: a cord up and down all the way round.
    g.strokeStyle = "#c9ab78";
    g.lineWidth = 4;
    g.lineJoin = "round";
    g.beginPath();
    const n = 24;
    for (let i = 0; i <= n * 2; i++) g.lineTo((i / (n * 2)) * w, i % 2 ? h * 0.2 : h * 0.84);
    g.stroke();
    g.strokeStyle = "rgba(60,35,12,0.5)";
    g.lineWidth = 1.5;
    g.stroke();
    return c;
  }

  /** The top of the mat: worn hide, a stitched edge, a chalk line across the middle and a chalk mark at its heart. */
  private matCanvas(): HTMLCanvasElement {
    const n = 512;
    const [c, g] = mk(n, n);
    g.drawImage(leatherCanvas(43, [98, 50, 32]), 0, 0, n, n);
    const r = rng(77);
    // Worn paler where feet have been, darker toward the rope.
    const wear = g.createRadialGradient(n / 2, n / 2, n * 0.05, n / 2, n / 2, n / 2);
    wear.addColorStop(0, "rgba(190,140,100,0.2)");
    wear.addColorStop(0.6, "rgba(120,70,40,0.05)");
    wear.addColorStop(1, "rgba(20,8,4,0.5)");
    g.fillStyle = wear;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * n * 0.42;
      const x = n / 2 + Math.cos(a) * d, y = n / 2 + Math.sin(a) * d, t = r() * Math.PI;
      g.strokeStyle = `rgba(${r() < 0.6 ? "215,180,140" : "30,12,6"},${0.08 + r() * 0.14})`;
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(t) * (6 + r() * 26), y + Math.sin(t) * (6 + r() * 26));
      g.stroke();
    }
    // The stitching near the edge.
    g.strokeStyle = "rgba(205,180,130,0.55)";
    g.lineWidth = 3;
    g.setLineDash([9, 8]);
    g.beginPath();
    g.arc(n / 2, n / 2, n * 0.455, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    // The line the two sides toe, chalked twice by an unsteady hand, and a ring at its middle.
    g.strokeStyle = "rgba(236,228,206,0.8)";
    g.lineCap = "round";
    for (let pass = 0; pass < 2; pass++) {
      g.lineWidth = 5 - pass * 2;
      g.beginPath();
      for (let x = n * 0.07; x <= n * 0.93; x += n * 0.043) g.lineTo(x, n / 2 + Math.sin(x * 0.03 + pass * 2) * 2.5 + (pass ? 3 : 0));
      g.stroke();
    }
    g.lineWidth = 3;
    g.beginPath();
    for (let a = 0; a <= 30; a++) {
      const t = (a / 30) * Math.PI * 2.08;
      g.lineTo(n / 2 + Math.cos(t) * n * 0.062 * (1 + 0.05 * Math.sin(t * 3)), n / 2 + Math.sin(t) * n * 0.062 * (1 + 0.05 * Math.sin(t * 3)));
    }
    g.stroke();
    return c;
  }

  /* ------------------------------------------------- what the game shows ------------------------------------------------- */

  show(shows: readonly Show[]): boolean {
    const next = shows.find((s): s is FightShow => s.kind === "fight") ?? null;
    const before = this.data;
    this.data = next;
    if (!next) {
      // It leaves the table as it stands: what is on it goes with it, and is cleared once it is off.
      this.picked = null;
      return false;
    }
    const x = this.group.position.x;
    const fresh = !before;
    // A ring that comes to the table anew starts clean: nothing of the last fight is on it.
    if (fresh) {
      for (const p of this.pieces.values()) this.dropPiece(p);
      this.pieces.clear();
    }
    // Your own piece, then everyone the game lists; whoever is no longer listed leaves the mat.
    const want = new Map<string, { name: string; stance: Stance; step: number; hp: number | null; down: boolean }>();
    want.set("you", { name: next.you.name, stance: "you", step: 0, hp: next.you.max > 0 ? next.you.hp / next.you.max : 0, down: false });
    for (const f of next.foes) want.set(`foe:${f.id}`, { name: f.name, stance: "against", step: f.step, hp: f.max > 0 ? f.hp / f.max : 0, down: f.down });
    for (const o of next.others) want.set(`other:${o.id}`, { name: o.name, stance: o.stance, step: o.step, hp: null, down: false });
    for (const [id, p] of this.pieces) if (!want.has(id)) p.leaving = true;
    let n = 0, came = false;
    for (const [id, w] of want) {
      const look = `${w.stance}|${w.step}|${w.hp === null ? "-" : "hp"}`;
      let p = this.pieces.get(id);
      if (p && p.look !== look) {
        this.dropPiece(p);
        this.pieces.delete(id);
        p = undefined;
      }
      if (!p) {
        p = this.makePiece(id, w.stance, w.step, w.hp !== null, look, 500 + n * 31 + id.length * 7);
        // One brought in already down lies there from the start; so does everything when the ring first comes to the table.
        p.hp = w.hp ?? 1;
        p.fall = w.down ? 1 : 0;
        p.k = fresh ? 1 : 0;
        if (!fresh && !came) sound.play("knock", { x, gain: 0.3, rate: 1.2 });
        came = true;
        this.pieces.set(id, p);
      } else {
        // A blow rocks it; one that brings it down topples it.
        if (w.down && !p.down) sound.play("clack", { x, gain: 0.55, rate: 0.8 });
        else if (w.hp !== null && w.hp < p.hpTo - 0.001) {
          p.rock = Math.min(1, 0.45 + (p.hpTo - w.hp) * 2.2);
          p.swing = 0;
          sound.play("knock", { x, gain: 0.4, rate: id === "you" ? 0.7 : 1 });
        }
      }
      p.leaving = false;
      p.name = w.name;
      p.hpTo = w.hp ?? 1;
      p.down = w.down;
      n++;
    }
    this.setPosts(next.measures, fresh);
    this.setTokens(next.saves ?? null, fresh);
    if (this.picked && this.picked !== "name" && !this.picked.startsWith("measure:") && !want.has(this.picked)) this.picked = null;
    if (this.picked?.startsWith("measure:") && !next.measures.some((m) => `measure:${m.id}` === this.picked)) this.picked = null;
    this.arrange();
    return true;
  }

  private dropPiece(p: Piece): void {
    this.body.remove(p.hold);
    if (p.plaque) {
      this.body.remove(p.plaque.mesh);
      p.plaque.dispose();
      p.plaque = null;
    }
  }

  /** The paint of a piece's body: yours pale, those with you linen, those on neither side pewter, those against you red, darker the stronger. */
  private tone(stance: Stance, step: number): MeshStandardMaterial {
    const key = stance === "against" ? `against${step}` : stance;
    let m = this.tones.get(key);
    if (m) return m;
    if (stance === "against") {
      const c = step <= 0 ? new Color(0x8e3526).lerp(new Color(0xb9764a), -step / 3) : new Color(0x8e3526).lerp(new Color(0x4a1c16), step / 3);
      m = this.kit.paint(c.getHex(), 0.6);
    } else m = this.kit.paint(stance === "you" ? PALETTE.wax : stance === "yours" ? 0xa89468 : 0x7e8286, 0.6);
    this.tones.set(key, m);
    return m;
  }

  /** A turned piece: a wide foot, a band up its middle (its health, if it is fighting), a collar and a round head; a crown on one far stronger than you. */
  private makePiece(id: string, stance: Stance, step: number, fights: boolean, look: string, seed: number): Piece {
    const k = this.kit;
    const body = this.tone(stance, step);
    const hold = new Group(), turn = new Group(), tip = new Group();
    hold.add(turn);
    turn.add(tip);
    const add = (geo: BufferGeometry, mat: Material): Mesh => {
      const mesh = k.cast(new Mesh(geo, mat));
      tip.add(mesh);
      return mesh;
    };
    add(this.g.foot, body);
    add(this.g.head, body);
    let lit: Mesh | null = null, spent: Mesh | null = null;
    if (fights) {
      lit = add(this.g.band, stance === "you" ? this.white : this.ember);
      spent = add(this.g.band, this.char);
      lit.position.y = BAND_Y;
      // Notched in quarters, to be counted from close by.
      for (const q of [0.25, 0.5, 0.75]) {
        const notch = add(this.g.notch, this.char);
        notch.scale.y = 0.0007;
        notch.position.y = BAND_Y + BAND_H * q;
      }
    } else {
      const band = add(this.g.band, body);
      band.position.y = BAND_Y;
      band.scale.y = BAND_H;
    }
    if (stance === "against" && step >= 2) {
      const crown = add(this.g.crown, this.brass);
      crown.rotation.x = Math.PI / 2;
      crown.position.y = 0.0392;
      for (let i = 0; i < (step >= 3 ? 6 : 4); i++) {
        const a = (i / (step >= 3 ? 6 : 4)) * Math.PI * 2;
        const spike = add(this.g.spike, this.brass);
        spike.position.set(Math.cos(a) * 0.0062, 0.0418, Math.sin(a) * 0.0062);
        spike.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      }
    }
    const r = rng(seed);
    // It falls away from the line, a little to one side.
    turn.rotation.y = (r() - 0.5) * 1.5;
    hold.visible = false;
    this.body.add(hold);
    return { id, name: "", stance, step, look, hold, turn, tip, lit, spent, hp: 1, hpTo: 1, down: false, fall: 0, rock: 0, swing: 0, to: V(0, MAT_Y, 0), size: 1, k: 0, leaving: false, plaque: null, plaqueKey: "", plaqueAt: V(0, 0, 0), plaqueW: 0.04, seed: r() };
  }

  /** The measures' posts: a rod on a foot at the mat's left, a bead riding it, and a cap at each end for what that end means. */
  private setPosts(measures: readonly FightMeasure[], fresh: boolean): void {
    const key = measures.map((m) => `${m.id}|${m.atFull}|${m.atEmpty}|${m.good}`).join(";");
    if (key !== this.postsKey) {
      this.postsKey = key;
      for (const p of this.posts) this.body.remove(p.hold);
      const n = measures.length;
      this.posts = measures.map((m, i) => {
        const hold = new Group();
        const k = this.kit;
        const add = (geo: BufferGeometry, mat: Material, y: number, sx: number, sy = sx): Mesh => {
          const mesh = k.cast(new Mesh(geo, mat));
          mesh.position.y = y;
          mesh.scale.set(sx, sy, sx);
          hold.add(mesh);
          return mesh;
        };
        add(this.g.base, this.wood, 0, 1);
        add(this.g.rod, this.brass, 0.004, 1.15, POST_H - 0.004);
        // The end that is good for you is brass and the other red; an end that ends it is capped large, one that only colours it small.
        const cap = (end: FightMeasure["atFull"], up: boolean): [Material, number] => [end === "win" || (end === "none" && (m.good === "up") === up) ? this.gilt : this.red, end === "none" ? 0.0024 : 0.0048];
        const [topMat, topR] = cap(m.atFull, true), [footMat, footR] = cap(m.atEmpty, false);
        add(this.g.ball, topMat, POST_H + topR * 0.6, topR);
        add(this.g.ball, footMat, 0.0068, footR, footR * 0.7);
        const bead = add(this.g.ball, this.beadMat, BEAD_LOW, 0.0042);
        hold.position.set(POST_X, 0, (i - (n - 1) / 2) * 0.048);
        this.body.add(hold);
        const old = this.posts.find((p) => p.m.id === m.id);
        return { m, hold, bead, k: old ? old.k : m.max > 0 ? m.value / m.max : 0, bump: 0 };
      });
    }
    measures.forEach((m, i) => {
      const p = this.posts[i]!;
      if (!fresh && p.m.value !== m.value) {
        p.bump = 1;
        sound.play("peg", { x: this.group.position.x, gain: 0.4 });
      }
      p.m = m;
    });
  }

  /** Your saves: brass tokens standing at the near rim; one spent is knocked flat. */
  private setTokens(saves: { count: number; max: number } | null, fresh: boolean): void {
    const max = Math.max(0, Math.min(6, saves?.max ?? 0));
    if (max !== this.tokens.length) {
      for (const t of this.tokens) this.body.remove(t.hold);
      this.tokens = Array.from({ length: max }, (_, i) => {
        const hold = new Group();
        const disc = this.kit.cast(new Mesh(this.g.coin, this.brass));
        disc.scale.y = 0.002;
        disc.position.y = -0.001;
        // Stood on edge, facing you.
        const face = new Group();
        face.rotation.x = Math.PI / 2;
        face.add(disc);
        hold.add(face);
        this.body.add(hold);
        return { hold, disc, k: -1 };
      });
    }
    this.tokens.forEach((t, i) => {
      const spent = i >= (saves?.count ?? 0);
      if (t.k < 0 || fresh) t.k = spent ? 1 : 0;
      else if (spent && t.disc.material !== this.dull) sound.play("token", { x: this.group.position.x, gain: 0.6, rate: 0.8 });
      else if (!spent && t.disc.material === this.dull) sound.play("tink", { x: this.group.position.x, gain: 0.4 });
      t.disc.material = spent ? this.dull : this.brass;
    });
  }

  /* ------------------------------------------------- opening and closing ------------------------------------------------- */

  place(lay: Lay, narrow: boolean): void {
    super.place(lay, narrow);
    const W = lay.spread.w, H = lay.spread.h, scale = lay.home.scale;
    // On a wide table the mat is drawn to the left of its patch and the slip is held up at its right; on an upright
    // one there is no room beside it, and the slip is held up over the near half of the mat.
    this.spread.remove(this.slip.group);
    this.slip.dispose();
    const left = -POST_X + 0.0075, rim = ROPE_R + ROPE_T;
    this.spread.remove(this.plate.mesh);
    this.plate.dispose();
    if (narrow) {
      // Leaned over, the mat is seen larger: as large as leaves the plate its place under it. It lies in the middle
      // of the patch from its posts to its far rim.
      const foot = PLATE_D_NARROW * Math.cos(PLATE_LEAN);
      this.grow = Math.max(1, Math.min((W - 0.008) / ((left + rim) * scale), (H - foot - 0.008) / (2 * rim * scale)));
      this.shift = ((left - rim) / 2) * this.grow;
      this.drop = (-H / 2 + 0.003 + rim * scale * this.grow) / scale;
      this.slip = new Choices(Math.min(0.2, W - 0.02), 0.0082);
      this.slipTilt = 0.3;
      this.plate = new Label(Math.min(0.2, W - 0.02), PLATE_D_NARROW, { flat: true });
      this.plateAt.set(0, 0.001 + (PLATE_D_NARROW / 2) * Math.sin(PLATE_LEAN), this.drop * scale + rim * scale * this.grow + 0.002 + foot / 2);
    } else {
      this.grow = 1;
      this.shift = -(W / 2 - 0.004 - left * scale) / scale;
      this.drop = 0;
      this.slip = new Choices(Math.max(0.1, W / 2 - 0.006 - (this.shift + rim) * scale), 0.0062);
      this.slipTilt = 0.6;
      this.plate = new Label(0.12, PLATE_D, { flat: true });
      this.plateAt.set(this.shift * scale, 0.001 + (PLATE_D / 2) * Math.sin(PLATE_LEAN), rim * scale + 0.002 + (PLATE_D / 2) * Math.cos(PLATE_LEAN));
    }
    this.plate.glow = 0.14;
    this.spread.add(this.plate.mesh);
    this.slip.group.visible = false;
    this.spread.add(this.slip.group);
    this.plateKey = "";
    this.arrange();
  }

  open(): void {
    super.open();
    // On a wide table your own slip is held up at once, with what the game offers; an upright one shows the mat first.
    this.picked = this.narrow ? null : "you";
    this.arrange();
    sound.play("slide", { x: this.group.position.x, gain: 0.35, rate: 1.15 });
    const d = this.data;
    if (d) {
      const foes = d.foes.map((f) => `${f.name}: ${f.odds}`).join(" ");
      const others = d.others.map((o) => `${o.name}: ${o.odds}`).join(" ");
      const measures = d.measures.map((m) => `${m.name}: ${m.note}`).join(" ");
      this.h.tell(`${d.name}. ${d.text} ${foes} ${others} ${measures} ${d.you.name}: ${d.you.text}`.replace(/\s+/g, " ").trim());
    }
  }

  close(): void {
    if (!this.isOpen) return;
    super.close();
    this.picked = null;
    this.over = null;
    this.arrange();
    sound.play("slide", { x: this.group.position.x, gain: 0.3, rate: 0.9 });
  }

  /* ------------------------------------------------- laying it out ------------------------------------------------- */

  /** Where every piece stands, what the plate and the slip say, and where the slip is held. */
  private arrange(): void {
    const d = this.data, lay = this.lay;
    if (!d) return;
    const live = [...this.pieces.values()].filter((p) => !p.leaving);
    const far = live.filter((p) => p.stance === "against");
    const near = live.filter((p) => p.stance === "yours");
    const mid = live.filter((p) => p.stance === "other");
    const you = this.pieces.get("you");
    // As large as lets everyone stand: the same size for all, less for a crowd. Those on neither side take the line
    // itself, and the two halves then stand back from it.
    let s = 1, a: ReturnType<typeof seats> = null, b: ReturnType<typeof seats> = null, c: ReturnType<typeof seats> = null;
    for (; s > 0.3; s -= 0.05) {
      const first = (mid.length ? 0.046 : 0.036) * Math.max(0.8, s);
      a = seats(far.length, s, first, FAR_R);
      b = seats(near.length + 1, s, first, NEAR_R);
      c = flanks(mid.length, s);
      if (a && b && c) break;
    }
    if (!a || !b || !c) return;
    const sized = (p: Piece): number => s * (1 + GROW * p.step);
    // Names lie before the pieces only where every one has room for it: a single row on each half.
    this.named = !this.narrow && !a.some((x) => x.row > 0) && !b.some((x) => x.row > 0);
    const put = (p: Piece, at: { x: number; z: number; gap: number }, sign: number): void => {
      p.to.set(at.x, MAT_Y, at.z * sign);
      p.size = sized(p);
      p.plaqueW = Math.max(0.03, Math.min(0.05, at.gap * 0.95));
      const pz = at.z * sign + 0.0115 * s + 0.002 + PLAQUE_D / 2;
      const room = Math.sqrt(Math.max(0, (MAT_R - 0.006) ** 2 - (Math.abs(pz) + PLAQUE_D / 2) ** 2)) - p.plaqueW / 2;
      p.plaqueAt.set(Math.max(-room, Math.min(room, at.x)), MAT_Y + 0.0006, pz);
    };
    far.forEach((p, i) => put(p, a![i]!, -1));
    // Your own piece takes the middle of the near row, and those with you stand to either side.
    const mine = b.filter((x) => x.row === 0);
    const centre = b.indexOf(mine[Math.floor((mine.length - 1) / 2)]!);
    if (you) put(you, b[centre]!, 1);
    // Your tokens stand at the rim before your own piece.
    this.tokenAt = Math.asin(Math.max(-0.9, Math.min(0.9, b[centre]!.x / TOKEN_R)));
    near.forEach((p, i) => put(p, b[i < centre ? i : i + 1]!, 1));
    // Those on neither side take the line from its ends inward.
    mid.forEach((p, i) => put(p, c![i]!, 1));
    if (lay) this.drawPlate();
    this.setSlip();
  }

  /** The name plate: the fight's own name on a strip of paper under the mat. */
  private drawPlate(): void {
    const d = this.data!;
    if (d.name === this.plateKey) return;
    this.plateKey = d.name;
    this.plate.draw((g, w, h) => {
      paper(g, w, h, 29);
      g.strokeStyle = "rgba(36,22,12,0.5)";
      g.lineWidth = 2;
      g.strokeRect(3, 3, w - 6, h - 6);
      g.fillStyle = INK;
      g.textAlign = "center";
      fitName(g, d.name, w / 2, h / 2, w - 18, h * 0.6, h * 0.36, "italic 700");
    });
  }

  /** A piece's name on a slip lying before it. */
  private drawPlaque(p: Piece): void {
    const key = `${p.name}|${p.plaqueW.toFixed(4)}`;
    if (key === p.plaqueKey && p.plaque) return;
    if (p.plaque) {
      this.body.remove(p.plaque.mesh);
      p.plaque.dispose();
    }
    p.plaqueKey = key;
    const label = (p.plaque = new Label(p.plaqueW, PLAQUE_D, { flat: true, px: 3200 }));
    label.glow = 0.13;
    label.mesh.visible = false;
    this.body.add(label.mesh);
    label.draw((g, w, h) => {
      paper(g, w, h, 31 + p.name.length);
      g.fillStyle = INK;
      g.textAlign = "center";
      // As large as lets the whole name stand in three lines at most, every word whole.
      const words = p.name.split(/\s+/);
      let size = Math.round(h * 0.42), lines: string[] = [];
      for (; size > 9; size -= 1) {
        g.font = `600 ${size}px ${INK_FONT}`;
        lines = wrapLines(g, p.name, w - 8);
        if (lines.length * size * 1.08 <= h - 6 && words.every((word) => g.measureText(word).width <= w - 8)) break;
      }
      g.font = `600 ${size}px ${INK_FONT}`;
      lines = wrapLines(g, p.name, w - 8, Math.max(1, Math.floor((h - 6) / (size * 1.08))));
      lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.08 + size * 0.34));
    });
  }

  /** What the slip says of what is picked up, and where it is held. */
  private setSlip(): void {
    const d = this.data, lay = this.lay;
    if (!d || !lay) return;
    const what = this.pickedWhat();
    if (!what) return;
    this.slip.set(what.head, what.text, what.note, what.choices.map((c) => c.say));
    const W = lay.spread.w, H = lay.spread.h;
    const tilt = this.slipTilt, half = this.slip.deep / 2;
    if (this.narrow) {
      // Over the near half of the mat, above the pieces, its foot at the foot of the patch.
      const tallest = Math.max(0.6, ...[...this.pieces.values()].filter((p) => !p.leaving && p.stance !== "against" && !p.down).map((p) => p.size));
      this.slipAt.set(0, (MAT_Y + PIECE_H * tallest) * lay.home.scale * this.grow + 0.006 + half * Math.sin(tilt), H / 2 - 0.004 - half * Math.cos(tilt));
    } else {
      // Beside the mat, held up toward you.
      this.slipAt.set(W / 2 - 0.004 - this.slip.w / 2, 0.012 + half * Math.sin(tilt), Math.min(H / 2 - 0.006 - half * Math.cos(tilt), 0.012));
    }
  }

  /** What is picked up, as a heading, what is written of it, and its choices; null when nothing is. */
  private pickedWhat(): { head: string; text: string; note: string; choices: readonly Choice[] } | null {
    const d = this.data, id = this.picked;
    if (!d || !id) return null;
    if (id === "you") return { head: d.you.name, text: d.you.text, note: "", choices: d.lines };
    if (id === "name") return { head: d.name, text: d.text, note: "", choices: [] };
    if (id.startsWith("measure:")) {
      const m = d.measures.find((x) => `measure:${x.id}` === id);
      return m ? { head: m.name, text: m.note, note: "", choices: [] } : null;
    }
    const who: FightFoe | FightOther | undefined = id.startsWith("foe:") ? d.foes.find((f) => `foe:${f.id}` === id) : d.others.find((o) => `other:${o.id}` === id);
    return who ? { head: who.name, text: who.text, note: who.odds, choices: who.choices } : null;
  }

  /* ------------------------------------------------- touching ------------------------------------------------- */

  parts(): Part[] {
    const d = this.data, lay = this.lay;
    if (!this.isOpen || !d || !lay || this.openK < 0.6) return [];
    const out: Part[] = [];
    if (this.picked) out.push(...this.slip.parts());
    for (const p of this.pieces.values()) {
      if (p.leaving || p.k < 0.5) continue;
      const tall = PIECE_H * p.size;
      out.push(this.partAt(p.id, p.to.x, MAT_Y + (p.down ? 0.006 : tall * 0.5), p.to.z, Math.max(0.012, PITCH * 0.5 * (p.size / (1 + GROW * p.step))), this.body));
    }
    // The tokens are your own: touching them is touching your piece.
    if (this.tokens.length) out.push(this.partAt("saves", Math.sin(this.tokenAt) * TOKEN_R, MAT_Y + 0.006, Math.cos(this.tokenAt) * TOKEN_R, 0.02, this.body));
    this.posts.forEach((p) => out.push(this.partAt(`measure:${p.m.id}`, p.hold.position.x, POST_H * 0.5, p.hold.position.z, 0.014, this.body)));
    out.push(this.partAt("name", this.plateAt.x, this.plateAt.y, this.plateAt.z, 0.05));
    // The mat itself, under everything: a touch on it puts down what is picked up.
    if (this.picked) out.push({ ...this.partAt("mat", 0, MAT_Y, 0, MAT_R, this.body), under: true });
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
      const choice = this.pickedWhat()?.choices[Number(id.slice(7))];
      if (choice) this.h.write(choice.line);
      return;
    }
    if (id === "mat") {
      this.picked = null;
      this.arrange();
      return;
    }
    // Touched again, it is put down.
    const what0 = id === "saves" ? "you" : id;
    this.picked = this.picked === what0 ? null : what0;
    sound.play(id.startsWith("measure:") ? "tink" : id === "name" ? "slide" : "knock", { x, gain: 0.4, rate: 1.3 });
    this.arrange();
    const what = this.pickedWhat();
    if (what) this.h.tell(`${what.head}. ${what.text} ${what.note}${what.choices.length ? ` You can: ${what.choices.map((c) => c.say).join("; ")}.` : ""}`.replace(/\s+/g, " ").trim());
  }

  /** For checks: what stands where. */
  get state(): { open: boolean; pieces: string[]; down: string[]; posts: string[]; saves: number; picked: string | null; choices: number; named: boolean } {
    const live = [...this.pieces.values()].filter((p) => !p.leaving);
    return {
      open: this.isOpen,
      pieces: live.map((p) => p.id),
      down: live.filter((p) => p.down).map((p) => p.id),
      posts: this.posts.map((p) => p.m.id),
      saves: this.tokens.filter((t) => t.disc.material === this.brass).length,
      picked: this.picked,
      choices: this.picked ? this.slip.count : 0,
      named: this.named,
    };
  }

  /* ------------------------------------------------- every frame ------------------------------------------------- */

  update(dt: number, _t: number): void {
    const still = this.h.reduced;
    const to = (now: number, want: number, rate: number): number => (still || Math.abs(want - now) < 0.0015 ? want : now + (want - now) * Math.min(1, dt * rate));
    this.clock += dt;
    this.openK = to(this.openK, this.isOpen ? 1 : 0, this.isOpen ? 5 : 7);
    const open = ease(this.openK);
    this.body.position.x = this.shift * open;
    this.body.position.z = this.drop * open;
    this.body.scale.setScalar(1 + (this.grow - 1) * open);
    // The glow breathes a little, like embers.
    this.ember.emissiveIntensity = 0.75 + (still ? 0 : Math.sin(this.clock * 2.3) * 0.07);

    for (const [id, p] of this.pieces) {
      // Arriving and leaving: set down on the mat, or taken off it.
      p.k = to(p.k, p.leaving ? 0 : 1, p.leaving ? 6 : 7);
      if (p.leaving && p.k <= 0.02) {
        this.dropPiece(p);
        this.pieces.delete(id);
        continue;
      }
      const fresh = !p.hold.visible;
      p.hold.visible = true;
      const rate = fresh ? 1e9 : 8;
      const pointed = this.isOpen && this.over === id;
      const held = this.isOpen && this.picked === id;
      p.hold.position.x = to(p.hold.position.x, p.to.x, rate);
      p.hold.position.z = to(p.hold.position.z, p.to.z, rate);
      const lift = (1 - ease(p.k)) * 0.03 + (pointed ? 0.004 : 0) + (held ? 0.006 : 0);
      p.hold.position.y = to(p.hold.position.y, p.to.y + lift, fresh ? 1e9 : 14);
      p.hold.scale.setScalar(to(p.hold.scale.x, p.size * (0.6 + 0.4 * ease(p.k)) * (held ? 1.08 : 1), rate));
      // The health band sinks to where the health is; what is above it is burnt out.
      p.hp = to(p.hp, p.hpTo, 5);
      if (p.lit && p.spent) {
        const lit = Math.max(0, Math.min(1, p.hp)) * BAND_H;
        p.lit.visible = lit > 0.0004;
        p.lit.scale.set(1, Math.max(0.0004, lit), 1);
        p.spent.visible = BAND_H - lit > 0.0004;
        p.spent.scale.set(0.86, Math.max(0.0004, BAND_H - lit), 0.86);
        p.spent.position.y = BAND_Y + lit;
      }
      // A blow rocks it about its foot, less each swing; brought down, it topples and lies.
      p.fall = still ? (p.down ? 1 : 0) : Math.max(0, Math.min(1, p.fall + (p.down ? 1 : -1) * dt * 2.4));
      if (p.rock > 0.01 && !still) {
        p.swing += dt * 21;
        p.rock *= Math.exp(-dt * 3.4);
      } else p.rock = 0;
      // It goes over slowly at first, strikes the mat, and comes to rest after one small bounce.
      const over = Math.min(1, p.fall / 0.7), after = Math.max(0, (p.fall - 0.7) / 0.3);
      const lying = over * over;
      const bounce = Math.sin(after * Math.PI) * 0.1;
      p.tip.rotation.x = -(lying * (Math.PI / 2 - 0.04) - bounce) + Math.sin(p.swing) * p.rock * 0.42;
      p.tip.rotation.z = Math.cos(p.swing * 0.8) * p.rock * 0.16;
      p.tip.position.y = Math.sin(lying * Math.PI * 0.5) * 0.0068;
      // Its name, lying before it while the ring is open.
      const named = this.named && this.isOpen && !p.leaving && id !== "you";
      if (named) this.drawPlaque(p);
      if (p.plaque) {
        p.plaque.mesh.visible = named && open > 0.5;
        p.plaque.mesh.position.copy(p.plaqueAt);
        p.plaque.glow = pointed || held ? 0.3 : 0.13;
      }
    }

    for (const p of this.posts) {
      p.k = to(p.k, p.m.max > 0 ? Math.max(0, Math.min(1, p.m.value / p.m.max)) : 0, 4);
      p.bump = to(p.bump, 0, 3);
      const on = this.isOpen && (this.over === `measure:${p.m.id}` || this.picked === `measure:${p.m.id}`);
      p.bead.position.y = BEAD_LOW + (BEAD_HIGH - BEAD_LOW) * p.k;
      p.bead.scale.setScalar(0.0042 * (1 + p.bump * 0.5 + (on ? 0.25 : 0)));
    }
    this.tokens.forEach((t, i) => {
      const spent = t.disc.material === this.dull;
      const a = this.tokenAt + (i - (this.tokens.length - 1) / 2) * TOKEN_GAP;
      t.hold.position.x = Math.sin(a) * TOKEN_R;
      t.hold.position.z = Math.cos(a) * TOKEN_R;
      t.hold.rotation.y = a;
      t.k = to(t.k, spent ? 1 : 0, 7);
      const e = ease(Math.max(0, t.k));
      // Standing a little back on its edge; knocked flat on its back.
      t.hold.rotation.x = -0.22 - e * (Math.PI / 2 - 0.22);
      t.hold.position.y = MAT_Y + 0.0062 * (1 - e) + 0.001 * e;
      const mine = this.isOpen && (this.over === "you" || this.picked === "you");
      t.hold.scale.setScalar(mine && !spent ? 1.15 : 1);
    });

    // What is laid out while open: the plate under the mat, and the slip held up.
    this.spread.visible = this.openK > 0.02;
    if (!this.spread.visible) return;
    this.plate.mesh.position.set(this.plateAt.x * open, this.plateAt.y, this.plateAt.z);
    this.plate.mesh.visible = open > 0.3;
    this.plate.mesh.scale.setScalar(0.6 + 0.4 * open);
    this.plate.mesh.rotation.x = PLATE_LEAN;
    this.plate.glow = this.over === "name" || this.picked === "name" ? 0.36 : 0.2;
    this.slipK = to(this.slipK, this.picked && this.isOpen ? 1 : 0, 10);
    this.slip.group.visible = this.slipK > 0.02;
    const up = ease(this.slipK);
    this.slip.group.position.set(this.slipAt.x, this.slipAt.y * (0.4 + 0.6 * up), this.slipAt.z);
    this.slip.group.rotation.x = this.slipTilt * up;
    this.slip.group.scale.setScalar(0.75 + 0.25 * up);
  }

  dispose(): void {
    for (const p of this.pieces.values()) p.plaque?.dispose();
    this.plate.dispose();
    this.slip.dispose();
    super.dispose();
  }
}
