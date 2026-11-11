/**
 * A fight on the battle mat (docs/COMBAT.md): pieces with Defense, Armor and Stamina (and Poise, Will and Composure, the
 * second rail of 11.1), a move and an act each, foes that move by their kind and chalk what they will do, and blows
 * that land on whoever stands where the chalk says. Props, ground that burns or slicks, holds that tighten, a side's
 * Resolve, an aim beyond "beat them all". Pure and seeded: the same battle and the same orders give the same dice, so a
 * fight can be replayed, tested and balanced. Models never touch a number here; they only say what a line means (6).
 *
 * A round: their move, shown (`theirMove`); your side's orders (`yourTurn`); their blows land and the round ends
 * (`theirTurn`, which shows their next move). `startBattle` opens with their first move shown.
 */
import { d20Tier, rollD20, seededRng } from "./dice.js";
import { around, covered, dist, key, line, onEdge, onMat, open, reach, same, sees, tileAt, type Mat, type Pos, type Tile } from "./grid.js";
import type { Stat, Stats, Tier } from "./moment.js";
import type { Verb } from "./abilities.js";
import { foePlan, FOE_KINDS, type FoeKind, type Rank } from "./foekinds.js";

export type Side = "you" | "them";
export type StateId =
  | "prone"
  | "staggered"
  | "exposed"
  | "burning"
  | "marked"
  | "held"
  | "grabbed"
  | "pinned"
  | "overwhelmed"
  | "frightened"
  | "blinded"
  | "hidden"
  | "guarded"
  | "inspired"
  | "flustered"
  | "entranced"
  | "enthralled"
  | "warded"
  | "watching"
  | "taunted";
/** The rungs of the restraint ladder (11.3), loosest first. */
export const HOLDS = ["grabbed", "pinned", "overwhelmed"] as const;
/** A fight that drags this many rounds is worn out: whichever side has more left, by its share of stamina, carries it. */
export const ROUND_LIMIT = 20;
/** Rounds the rest of your side fights on with the hero Down before they drag the hero clear and the fight is lost. */
export const HERO_DOWN_ROUNDS = 3;
export type Hold = (typeof HOLDS)[number];

/** A state on a piece, with the round at whose end it goes (prone and the holds last until undone), and who set it. */
export interface PieceState {
  id: StateId;
  until: number;
  /** Who holds it, guards it, taunted it, frightens it or charmed it. */
  by?: string;
}

/** Which pool a blow wears down: bones and blood, or the will to resist (11.1). */
export type Rail = "stamina" | "composure";

export type WeaponKind = "light" | "blade" | "heavy" | "reach" | "ranged";
export interface Weapon {
  kind: WeaponKind;
  damage: number;
  /** Added to the roll to hit: light +1, heavy −1. */
  hit: number;
  /** How far it strikes: 1 next to you, 2 for reach, 6 for ranged. */
  range: number;
}
export const WEAPONS: Record<WeaponKind, Weapon> = {
  light: { kind: "light", damage: 1, hit: 1, range: 1 },
  blade: { kind: "blade", damage: 2, hit: 0, range: 1 },
  heavy: { kind: "heavy", damage: 3, hit: -1, range: 1 },
  reach: { kind: "reach", damage: 2, hit: 0, range: 2 },
  ranged: { kind: "ranged", damage: 2, hit: 0, range: 6 },
};

export interface Piece {
  id: string;
  name: string;
  side: Side;
  at: Pos;
  /** The hero: what happens to them is what the story keeps. */
  hero?: boolean;
  /** A foe's kind (foekinds.ts). */
  kind?: FoeKind;
  rank?: Rank;
  stats?: Stats;
  stamina: number;
  staminaMax: number;
  defense: number;
  armor: number;
  /** The second rail (11.1): Composure, the Poise a charm must beat, and the Will that comes off each one that lands. */
  composure: number;
  composureMax: number;
  poise: number;
  will: number;
  speed: number;
  /** A foe's bonus to its die; your side rolls a stat instead. */
  attack: number;
  weapon: Weapon;
  /** Which rail a foe's blows wear: a charmer's are Composure. */
  rail?: Rail;
  states: PieceState[];
  /** Your side at 0 Stamina: Down, prone, out of the fight until raised. */
  down?: boolean;
  /** Their side at 0 Stamina: out of the fight. */
  out?: boolean;
  /** At 0 Composure: Overcome, the Composure side of Down (yours) or of out (theirs: it yields). */
  overcome?: boolean;
  /** Broke away off the mat's edge (or, theirs, ran when the side broke). */
  fled?: boolean;
  /** Carried off the board by a captor (11.4): taken, unless the story gets it back. */
  carried?: boolean;
  /** Who last landed a blow on it: a brute turns on them. */
  hitBy?: string;
  /** What it did last, and to whom: the same plain move at the same foe the next round meets "he's ready for that". */
  lastMove?: { act: "strike" | "shove"; target: string; round: number; plain: boolean };
  /** A leader: when it falls, the side's Resolve takes the blow of it. */
  leader?: boolean;
  /** A boss's phase: 0, then 1 at half its Stamina, 2 at a quarter. */
  phase?: number;
  /** A caster that has called up its help already. */
  summoned?: boolean;
  /** The prize it carries (an aim of "grab"). */
  carrying?: string;
  /** Someone to keep safe, who doesn't fight (an aim of "protect"). */
  ward?: boolean;
}

export type IntentKind = "strike" | "cleave" | "charge" | "shot" | "grab" | "squeeze" | "charm" | "blast" | "hex" | "pounce" | "web" | "carry" | "rally" | "summon";

/** What a foe has chalked for the coming blows. */
export interface Intent {
  by: string;
  kind: IntentKind;
  /** The tiles the chalk covers; a blow lands on whoever stands there when it comes. */
  tiles: Pos[];
  /** Who it was meant for, when it was chalked. */
  target: string;
}

export type Ground = "slick" | "burning" | "rubble" | "smoke" | "hazard";
export type PropTemplate = "toppler" | "hanging" | "spill" | "fire" | "cover" | "choke" | "throwable" | "hazard" | "height" | "prize";

/** A thing on the mat with fixed rules, named by the world (docs/COMBAT.md, 4.3). */
export interface Prop {
  id: string;
  /** What the world calls it: "the chandelier", "a shorted power cell". */
  name: string;
  template: PropTemplate;
  /** Where it stands. */
  at: Pos;
  /** The tiles it covers, for a hazard or a height (and where a hanging thing falls). */
  area?: Pos[];
  used?: boolean;
  /** Throws left, for a throwable. */
  uses?: number;
  /** A door or gate: open (floor) or barred (wall). */
  shut?: boolean;
}

/** A named place on the mat: lines and the router speak in these, never in squares (4.1). */
export interface Zone {
  name: string;
  tiles: Pos[];
}

/** The other side's aim, or yours, beyond beating them all (4.4). */
export type Objective =
  | { kind: "escape"; need: number }
  | { kind: "hold"; rounds: number }
  | { kind: "protect"; piece: string }
  | { kind: "grab"; prop: string }
  | { kind: "stop"; prop: string; rounds: number };

/** An ability as the board uses it (3.9). */
export interface BattleAbility {
  id: string;
  name: string;
  does: Verb;
  much: number;
  tags: string[];
  store: boolean;
  often: "always" | "stop" | "story";
}

export type Result = "won" | "taken" | "fled" | "yielded" | "parley";

export interface Battle {
  seed: string;
  mat: Mat;
  pieces: Piece[];
  intents: Intent[];
  round: number;
  /** Dice thrown so far: every throw has a seed of its own. */
  thrown: number;
  /** Red stones the hero has lost: one when Down or Overcome, one for each crit taken. */
  wounds: number;
  /** The round the hero went Down or was Overcome, while they stay so: the rest of the side has HERO_DOWN_ROUNDS to win or raise them. */
  heroDown?: number;
  over?: Result;
  /** How it ended, in a word: "broken", "surrender", "carried", "escaped", "held", "stopped", "lost", "too late". */
  overHow?: string;
  /** The "he's ready for that" bane on a repeated plain strike (docs/COMBAT.md, 9.5): on unless set false. */
  readyForThat?: boolean;
  /** 0 easy to 3 very hard: sets what talk and props have to beat. */
  difficulty?: number;
  zones?: Zone[];
  props?: Prop[];
  /** Ground with something on it, by tile, until a round's end. */
  ground?: Record<string, { g: Ground; until: number }>;
  /** Their side's nerve: it breaks at 0, unless a boss still stands. */
  resolve?: number;
  resolveMax?: number;
  broken?: boolean;
  /** Half their side has fallen already (the Resolve check is spent). */
  halfDown?: boolean;
  objective?: Objective;
  /** More of them, on the danger clock: they come at the end of that round. */
  clock?: { round: number; foes: Piece[] };
  /** The hero's store, for abilities that cost it, and what was used this fight. */
  store?: number;
  used?: string[];
  /** Parley can stop the fight (the story allows it). */
  parley?: boolean;
  /** Scratch: the events of the step being played, for the rolls. Never kept. */
  events?: BattleEvent[];
  /** Scratch: who may slip through foes this turn. */
  slip?: string;
  /** Scratch: who an aid lets act again this turn. */
  again?: string;
}

/** What a roll was for. */
export type RollWhat = "strike" | "shot" | "shove" | "cleave" | "charge" | "charm" | "grapple" | "struggle" | "talk" | "hide" | "prop" | "grab" | "squeeze" | "blast" | "hex" | "pounce" | "web" | "slick" | "watch";

/** What happened, in order: for the narrator to tell and the table to show. */
export type BattleEvent =
  | { e: "move"; piece: string; path: Pos[]; style: "walk" | "charge" | "stand" | "drag" | "fly" | "pounce" | "run" }
  | { e: "intent"; intent: Intent }
  | { e: "wiped"; piece: string; why: "staggered" | "prone" | "moved" | "out" | "held" | "frightened" | "broken" }
  | { e: "roll"; by: string; at: string; what: RollWhat; natural: number; add: number; target: number; tier: Tier; edge: boolean; bane: boolean; why: string[] }
  | { e: "hit"; piece: string; by: string; damage: number; stamina: number; rail: Rail; left: number }
  | { e: "miss"; piece: string; by: string }
  | { e: "state"; piece: string; state: StateId; on: boolean; by?: string }
  | { e: "pushed"; piece: string; to: Pos }
  | { e: "wound"; piece: string }
  | { e: "down"; piece: string }
  | { e: "overcome"; piece: string }
  | { e: "out"; piece: string }
  | { e: "fled"; piece: string }
  | { e: "carried"; piece: string; by: string }
  | { e: "burn"; piece: string; damage: number }
  | { e: "heal"; piece: string; amount: number; rail: Rail }
  | { e: "prop"; prop: string; by: string; tiles: Pos[] }
  | { e: "ground"; ground: Ground; tiles: Pos[]; on: boolean }
  | { e: "resolve"; left: number; by: number }
  | { e: "broken" }
  | { e: "phase"; piece: string; phase: number }
  | { e: "arrive"; pieces: string[] }
  | { e: "learn"; piece: string; says: string }
  | { e: "talk"; by: string; kind: "taunt" | "intimidate" | "demand" | "parley"; at?: string }
  | { e: "ability"; by: string; ability: string; does: Verb; at?: string }
  | { e: "cant"; piece: string; why: string }
  | { e: "over"; result: Result; how?: string };

/* ------------------------------ the pieces ------------------------------ */

const best = (s: Stats, of: readonly Stat[]): Stat => of.reduce((a, b) => ((s[b] ?? -9) > (s[a] ?? -9) ? b : a));
const statOf = (s: Stats | undefined, k: Stat): number => s?.[k] ?? 0;

/** A piece of your side from a sheet or a companion's stats (docs/COMBAT.md, 3.2 and 11.1). */
export function yourPiece(o: {
  id: string;
  name: string;
  stats: Stats;
  at: Pos;
  hero?: boolean;
  level?: number;
  armor?: number;
  weapon?: WeaponKind;
  shield?: boolean;
  /** What comes off each charm that lands: a relic, a ring (0 to 2). */
  will?: number;
  /** The stat that sets Defense, when the kit says so (KitContest.defend): grace, or reflexes as grace. */
  defend?: Stat;
  /** A creature of the power (Allure) sets its Poise by it. */
  poiseBy?: Stat;
  ward?: boolean;
}): Piece {
  const grace = statOf(o.stats, o.defend ?? "grace");
  const level = o.level ?? 1;
  const stamina = 4 + 2 * Math.max(0, statOf(o.stats, "brawn")) + level;
  const composure = 4 + 2 * Math.max(0, statOf(o.stats, "sense")) + level;
  return {
    id: o.id,
    name: o.name,
    side: "you",
    at: o.at,
    ...(o.hero ? { hero: true } : {}),
    ...(o.ward ? { ward: true } : {}),
    stats: o.stats,
    stamina,
    staminaMax: stamina,
    defense: 10 + grace + (o.shield ? 1 : 0),
    armor: Math.max(0, Math.min(2, o.armor ?? 0)),
    composure,
    composureMax: composure,
    poise: 10 + Math.max(statOf(o.stats, "sense"), o.poiseBy ? statOf(o.stats, o.poiseBy) : -9),
    will: Math.max(0, Math.min(2, o.will ?? 0)),
    speed: statOf(o.stats, "grace") >= 3 ? 5 : 4,
    attack: 0,
    weapon: WEAPONS[o.weapon ?? "blade"],
    states: [],
  };
}

/** A foe of a kind and a rank, at a difficulty (0 easy to 3 very hard). */
export function foePiece(o: { id: string; name: string; kind: FoeKind; rank: Rank; difficulty: number; at: Pos; leader?: boolean }): Piece {
  const k = FOE_KINDS[o.kind];
  const r = RANKS[o.rank];
  const d = Math.max(0, Math.min(3, o.difficulty));
  const leader = o.leader || o.kind === "leader";
  return {
    id: o.id,
    name: o.name,
    side: "them",
    at: o.at,
    kind: o.kind,
    rank: o.rank,
    stamina: r.stamina,
    staminaMax: r.stamina,
    defense: FOE_DEFENSE[d]! + r.defense,
    armor: k.armor + r.armor,
    composure: r.composure,
    composureMax: r.composure,
    poise: FOE_DEFENSE[d]! + r.defense + (k.poise ?? 0),
    will: k.will ?? 0,
    speed: k.speed,
    attack: 1 + d + r.attack,
    weapon: { ...WEAPONS[k.weapon], damage: k.damage },
    ...(k.rail === "composure" ? { rail: "composure" as Rail } : {}),
    states: o.kind === "lurker" ? [{ id: "hidden", until: Infinity }] : [],
    ...(leader ? { leader: true } : {}),
    ...(o.rank === "boss" ? { phase: 0 } : {}),
  };
}

/**
 * A soldier's Defense by difficulty. Lower than the checks' 9/12/15/18: a fight is many rolls, not one, and at those
 * numbers a very hard fight ran past fifteen rounds in the sim. These keep it to about five to eight.
 */
export const FOE_DEFENSE = [9, 11, 13, 15] as const;

/** What a rank adds: a minion falls to one blow; an elite takes a fight of its own; a boss has phases. */
export const RANKS: Record<Rank, { stamina: number; composure: number; defense: number; armor: number; attack: number; threat: number }> = {
  minion: { stamina: 1, composure: 2, defense: -3, armor: 0, attack: -1, threat: 1 },
  soldier: { stamina: 4, composure: 4, defense: 0, armor: 0, attack: 0, threat: 2 },
  elite: { stamina: 9, composure: 7, defense: 1, armor: 0, attack: 1, threat: 4 },
  boss: { stamina: 16, composure: 12, defense: 2, armor: 0, attack: 2, threat: 8 },
};

/* ------------------------------ reading the board ------------------------------ */

export const standing = (p: Piece): boolean => !p.down && !p.out && !p.fled && !p.overcome && !p.carried;
export const piece = (b: Battle, id: string): Piece | undefined => b.pieces.find((p) => p.id === id);
export const has = (p: Piece, s: StateId): boolean => p.states.some((x) => x.id === s);
export const stateOf = (p: Piece, s: StateId): PieceState | undefined => p.states.find((x) => x.id === s);
export const pieceAt = (b: Battle, at: Pos): Piece | undefined => b.pieces.find((p) => standing(p) && same(p.at, at));
/** Who fights on the other side: a ward that doesn't fight is never a mark. */
export const foesOf = (b: Battle, p: Piece): Piece[] => b.pieces.filter((q) => standing(q) && q.side !== p.side);
export const alliesOf = (b: Battle, p: Piece): Piece[] => b.pieces.filter((q) => standing(q) && q.side === p.side && q.id !== p.id);
export const groundAt = (b: Battle, at: Pos): Ground | undefined => b.ground?.[key(at)]?.g;
/** The rung of the ladder a piece is held at, and by whom. */
export function holdOn(p: Piece): { hold: Hold; by: string } | undefined {
  for (const h of [...HOLDS].reverse()) {
    const s = stateOf(p, h);
    if (s) return { hold: h, by: s.by ?? "" };
  }
  return undefined;
}
/** Whether a piece can't move: held, or anywhere on the ladder. */
export const rooted = (p: Piece): boolean => has(p, "held") || !!holdOn(p);
/** Who `p` holds on the ladder. */
export const holding = (b: Battle, p: Piece): Piece[] => b.pieces.filter((q) => standing(q) && holdOn(q)?.by === p.id);
export const propAt = (b: Battle, at: Pos): Prop | undefined => b.props?.find((x) => !x.used && same(x.at, at));
export const prop = (b: Battle, id: string): Prop | undefined => b.props?.find((x) => x.id === id);
/** On high ground: a height's tiles. */
export const onHeight = (b: Battle, at: Pos): boolean => !!b.props?.some((x) => x.template === "height" && (x.area ?? [x.at]).some((q) => same(q, at)));
/** The zone a tile is in, by name. */
export const zoneOf = (b: Battle, at: Pos): string | undefined => b.zones?.find((z) => z.tiles.some((q) => same(q, at)))?.name;

/** Where a piece could move this turn, and the way there: past its own side, never through the other. */
export function movesFor(b: Battle, p: Piece, steps = p.speed, o: { through?: boolean; fly?: boolean } = {}): Map<string, Pos[]> {
  const blocked = new Set(o.through || o.fly ? [] : foesOf(b, p).map((q) => key(q.at)));
  // Nobody walks into a pit; their side paths round fire, except a brute (5.3).
  for (const [k, g] of Object.entries(b.ground ?? {})) if (g.g === "hazard" || (g.g === "burning" && p.side === "them" && p.kind !== "brute" && !o.fly)) blocked.add(k);
  const taken = new Set(b.pieces.filter((q) => standing(q) && q.id !== p.id).map((q) => key(q.at)));
  return reach(b.mat, p.at, steps, blocked, taken);
}

/** Whether a foe's blow can still find `t`: next to it, or two away with a reach weapon and nothing in between. */
export function reaches(b: Battle, p: Piece, t: Piece): boolean {
  const d = dist(p.at, t.at);
  return d === 1 || (d === 2 && p.weapon.range >= 2 && p.weapon.kind !== "ranged" && sees(b.mat, p.at, t.at));
}

/** Whether moving `p` to `to` takes it out of reach of a foe it stands next to now. */
export function breaksOff(b: Battle, p: Piece, to: Pos): boolean {
  return foesOf(b, p).some((f) => dist(f.at, p.at) === 1 && dist(f.at, to) > 1);
}

/**
 * "He's ready for that" (docs/COMBAT.md, 3.6): the same plain move at the same foe two rounds running has bane. A shove
 * is always the same move; a strike only when the line said nothing more than "I hit him" (the battle router's `plain`).
 */
export function readyFor(b: Battle, p: Piece, act: "strike" | "shove", target: string, plain: boolean): boolean {
  const l = p.lastMove;
  return b.readyForThat !== false && plain && !!l && l.plain && l.act === act && l.target === target && l.round === b.round - 1;
}

/** Whether `p`, where it stands, can strike or shoot `t` with what it carries (`range` for a reach ability). */
export function inReach(b: Battle, p: Piece, t: Piece, range = p.weapon.range): boolean {
  const d = dist(p.at, t.at);
  if (d > range) return false;
  if (has(t, "hidden")) return false;
  if (p.weapon.kind === "ranged") return d >= 1 && clearShot(b, p.at, t.at, t.id);
  return d === 1 || (d === 2 && range >= 2 && sees(b.mat, p.at, t.at));
}

/** A shot needs a line with no wall, no smoke and nobody else in it (cover is shot over). */
export function clearShot(b: Battle, from: Pos, to: Pos, target: string): boolean {
  return line(from, to)
    .slice(1, -1)
    .every((q) => tileAt(b.mat, q) !== "wall" && groundAt(b, q) !== "smoke" && !b.pieces.some((x) => standing(x) && x.id !== target && same(x.at, q)));
}

/** Whether a charm can find `t` from where `p` stands: in sight, five tiles at most. */
export function inCharm(b: Battle, p: Piece, t: Piece): boolean {
  return !has(t, "hidden") && dist(p.at, t.at) <= 5 && sees(b.mat, p.at, t.at);
}

/** The tile on the far side of `t` from `p`: an ally of p's there flanks it. */
const farSide = (p: Pos, t: Pos): Pos => [2 * t[0] - p[0], 2 * t[1] - p[1]];
export function flanked(b: Battle, p: Piece, t: Piece): boolean {
  if (dist(p.at, t.at) !== 1) return false;
  const q = pieceAt(b, farSide(p.at, t.at));
  return !!q && q.side === p.side && q.id !== p.id && !q.ward;
}

/** The Defense (or, on the Composure rail, the Poise) `t` has against a blow from `p`, and why (3.2, 3.5, 11.1). */
export function defenseAgainst(b: Battle, p: Pos, t: Piece, ranged: boolean, rail: Rail = "stamina"): { defense: number; why: string[] } {
  let d = rail === "composure" ? t.poise : t.defense;
  const why: string[] = [];
  if (rail === "stamina" && ranged && covered(b.mat, p, t.at)) {
    d += 2;
    why.push("cover");
  }
  if (rail === "stamina" && has(t, "prone") && dist(p, t.at) === 1) {
    d -= 2;
    why.push("prone");
  }
  if (holdOn(t)?.hold === "pinned" || holdOn(t)?.hold === "overwhelmed") {
    d -= 2;
    why.push("pinned");
  }
  return { defense: d, why };
}

/* ------------------------------ dice and harm ------------------------------ */

type Draft = Battle;
const clone = (b: Battle): Draft => ({
  ...b,
  pieces: b.pieces.map((p) => ({ ...p, states: [...p.states] })),
  intents: [...b.intents],
  ...(b.props ? { props: b.props.map((x) => ({ ...x })) } : {}),
  ...(b.ground ? { ground: { ...b.ground } } : {}),
  ...(b.used ? { used: [...b.used] } : {}),
});
const mut = (b: Draft, id: string): Piece => b.pieces.find((p) => p.id === id)!;
/** Changes a tile, copying the mat first: battles are values. */
function setTile(b: Draft, at: Pos, t: Tile): void {
  if (!onMat(b.mat, at)) return;
  b.mat = { ...b.mat, tiles: b.mat.tiles.map((r) => [...r]) };
  b.mat.tiles[at[1]]![at[0]] = t;
}
function setGround(b: Draft, tiles: Pos[], g: Ground, until: number, ev: BattleEvent[]): void {
  const on = tiles.filter((q) => onMat(b.mat, q) && tileAt(b.mat, q) !== "wall");
  if (!on.length) return;
  b.ground = { ...(b.ground ?? {}) };
  for (const q of on) b.ground[key(q)] = { g, until };
  ev.push({ e: "ground", ground: g, tiles: on, on: true });
}

/** One d20, with edge or bane (two dice, the better or the worse); they cancel. */
function throwD20(b: Draft, edge: boolean, bane: boolean): number {
  const rng = seededRng(`battle:${b.seed}:${b.round}:${b.thrown++}`);
  const a = rollD20(rng);
  if (edge === bane) return a;
  const c = rollD20(rng);
  return edge ? Math.max(a, c) : Math.min(a, c);
}

function setState(b: Draft, p: Piece, id: StateId, until: number, ev: BattleEvent[], by?: string): void {
  const had = stateOf(p, id);
  p.states = [...p.states.filter((s) => s.id !== id), { id, until, ...(by ? { by } : {}) }];
  if (!had || had.by !== by) ev.push({ e: "state", piece: p.id, state: id, on: true, ...(by ? { by } : {}) });
  // Knocked down, staggered or pinned: whatever it chalked is wiped (docs/COMBAT.md, 3.5).
  if (id === "prone" || id === "staggered") wipe(b, p, id, ev);
  if (id === "pinned" || id === "overwhelmed") wipe(b, p, "held", ev);
  // A hold, whatever its rung, is the only one on the piece.
  if ((HOLDS as readonly StateId[]).includes(id)) for (const h of HOLDS) if (h !== id) dropState(p, h, ev, true);
}
function dropState(p: Piece, id: StateId, ev: BattleEvent[], quiet = false): void {
  if (!has(p, id)) return;
  p.states = p.states.filter((s) => s.id !== id);
  if (!quiet) ev.push({ e: "state", piece: p.id, state: id, on: false });
}
function wipe(b: Draft, p: Piece, why: Extract<BattleEvent, { e: "wiped" }>["why"], ev: BattleEvent[]): void {
  if (!b.intents.some((i) => i.by === p.id)) return;
  b.intents = b.intents.filter((i) => i.by !== p.id);
  ev.push({ e: "wiped", piece: p.id, why });
}
/** Lets go of whatever a piece holds: it fell, ran or was thrown off. */
function letGo(b: Draft, p: Piece, ev: BattleEvent[]): void {
  for (const q of holding(b, p)) for (const h of HOLDS) dropState(q, h, ev);
}

/** What the side's nerve loses when one of them falls: its threat, and a leader's more. */
function fallen(b: Draft, t: Piece, ev: BattleEvent[]): void {
  if (t.side !== "them" || b.resolve === undefined) return;
  const by = Math.min(3, RANKS[t.rank ?? "soldier"].threat) + (t.leader ? 3 : 0);
  shake(b, by, ev);
  const theirs = b.pieces.filter((p) => p.side === "them" && !p.ward);
  if (!b.halfDown && theirs.filter((p) => !standing(p)).length * 2 >= theirs.length) {
    b.halfDown = true;
    shake(b, Math.ceil((b.resolveMax ?? 4) / 4), ev);
  }
}

/** Their side's Resolve takes a blow; at 0 the side breaks and runs, unless a boss still stands (4.4, 5.3). */
function shake(b: Draft, by: number, ev: BattleEvent[]): void {
  if (b.resolve === undefined || b.broken || by <= 0) return;
  b.resolve = Math.max(0, b.resolve - by);
  ev.push({ e: "resolve", left: b.resolve, by });
  if (b.resolve > 0) return;
  if (b.pieces.some((p) => p.side === "them" && standing(p) && p.rank === "boss")) return;
  b.broken = true;
  ev.push({ e: "broken" });
  for (const p of b.pieces) if (p.side === "them" && standing(p)) wipe(b, p, "broken", ev);
}

/** Harm on a piece, on a rail: off its pool; at 0, Down or Overcome (yours, and a red stone for the hero) or out (theirs). */
function harm(b: Draft, t: Piece, damage: number, by: string, ev: BattleEvent[], crit = false, rail: Rail = "stamina"): void {
  if (damage <= 0 || !standing(t)) return;
  if (has(t, "warded")) damage = Math.max(1, damage - 1);
  if (rail === "composure") t.composure = Math.max(0, t.composure - damage);
  else t.stamina = Math.max(0, t.stamina - damage);
  t.hitBy = by;
  ev.push({ e: "hit", piece: t.id, by, damage, stamina: t.stamina, rail, left: rail === "composure" ? t.composure : t.stamina });
  if (crit && t.hero) {
    b.wounds++;
    ev.push({ e: "wound", piece: t.id });
  }
  if (t.rank === "boss" && rail === "stamina") phaseCheck(b, t, ev);
  if ((rail === "composure" ? t.composure : t.stamina) > 0) return;
  letGo(b, t, ev);
  wipe(b, t, "out", ev);
  t.states = [];
  if (rail === "composure") {
    t.overcome = true;
    ev.push({ e: "overcome", piece: t.id });
  } else if (t.side === "you") {
    t.down = true;
    ev.push({ e: "down", piece: t.id });
  } else {
    t.out = true;
    ev.push({ e: "out", piece: t.id });
  }
  if (t.side === "you" && t.hero) {
    b.wounds++;
    ev.push({ e: "wound", piece: t.id });
  }
  fallen(b, t, ev);
}

/** A boss at half its Stamina, then at a quarter: a new phase (5.1). It shakes off what holds it and comes on harder. */
function phaseCheck(b: Draft, t: Piece, ev: BattleEvent[]): void {
  const want = t.stamina <= t.staminaMax / 4 ? 2 : t.stamina <= t.staminaMax / 2 ? 1 : 0;
  while ((t.phase ?? 0) < want && t.stamina > 0) {
    t.phase = (t.phase ?? 0) + 1;
    ev.push({ e: "phase", piece: t.id, phase: t.phase });
    for (const s of ["prone", "staggered", "held", "marked", "flustered", "entranced", "frightened", ...HOLDS] as StateId[]) dropState(t, s, ev);
    t.attack += 1;
    t.speed += 1;
    if (t.phase === 1) summon(b, t, 2, ev);
    else for (const q of foesOf(b, t).filter((q) => dist(q.at, t.at) === 1)) push(b, q, [Math.sign(q.at[0] - t.at[0]), Math.sign(q.at[1] - t.at[1])], 1, t.id, ev);
  }
}

/** Two minions of a swarm come to a foe's side (a caster's summoning, a boss's call). */
function summon(b: Draft, p: Piece, n: number, ev: BattleEvent[]): void {
  const free = around(p.at).filter((q) => open(b.mat, q) && !pieceAt(b, q) && groundAt(b, q) !== "hazard");
  const ids: string[] = [];
  const d = b.difficulty ?? 1;
  for (let i = 0; i < n && i < free.length; i++) {
    const id = `${p.id}s${b.pieces.filter((x) => x.id.startsWith(`${p.id}s`)).length + 1}`;
    b.pieces.push(foePiece({ id, name: `${p.name}'s ${FOE_KINDS.swarm.pawn ?? "pawn"} ${i + 1}`, kind: "swarm", rank: "minion", difficulty: d, at: free[i]! }));
    ids.push(id);
  }
  if (ids.length) ev.push({ e: "arrive", pieces: ids });
  if (b.resolve !== undefined) {
    b.resolve += ids.length;
    b.resolveMax = (b.resolveMax ?? 0) + ids.length;
  }
}

/** Damage for a tier: the weapon's on a success, 2 more on a crit; Armor (or Will) off, but a blow that lands always tells (1). */
function damageFor(tier: Tier, weapon: number, armor: number): number {
  if (tier === "crit_success") return Math.max(1, weapon + 2 - armor);
  if (tier === "success") return Math.max(1, weapon - armor);
  if (tier === "partial") return 1;
  return 0;
}

/** Edges and banes every roll of a piece carries, whatever it is for (3.5). */
function ownEdges(b: Draft, p: Piece, edge: string[], bane: string[]): void {
  if (has(p, "inspired")) edge.push("inspired");
  if (has(p, "prone")) bane.push(p.side === "you" ? "you are down" : "it is down");
  if (has(p, "flustered")) bane.push("flustered");
  if (has(p, "blinded") || groundAt(b, p.at) === "smoke") bane.push("can't see");
}

/**
 * A roll of any kind, either side's: the die against a target, the edges and banes said aloud, the event pushed. An
 * Inspired piece spends it here. A hidden attacker crits on 19 too.
 */
function roll(b: Draft, p: Piece, o: { at: string; what: RollWhat; add: number; target: number; edge?: string[]; bane?: string[]; why?: string[]; crit19?: boolean }): Tier {
  const edge = [...(o.edge ?? [])];
  const bane = [...(o.bane ?? [])];
  ownEdges(b, p, edge, bane);
  const natural = throwD20(b, edge.length > 0, bane.length > 0);
  let tier = d20Tier(natural, o.add, o.target, 3);
  if (o.crit19 && natural === 19) tier = "crit_success";
  b.events?.push({ e: "roll", by: p.id, at: o.at, what: o.what, natural, add: o.add, target: o.target, tier, edge: edge.length > 0, bane: bane.length > 0, why: [...(o.why ?? []), ...edge.map((w) => `edge: ${w}`), ...bane.map((w) => `bane: ${w}`)] });
  if (edge.includes("inspired")) dropState(p, "inspired", b.events ?? []);
  return tier;
}

/** A piece's best stat of some, and what it adds. */
function stat(p: Piece, of: readonly Stat[], said?: Stat): { stat: Stat; add: number } {
  const s = said && (said !== "power" || typeof p.stats?.power === "number") ? said : best(p.stats ?? ({} as Stats), of);
  return { stat: s, add: statOf(p.stats, s) };
}

/**
 * One attack, either side's, on either rail: the die against the target's Defense or Poise, edges from the board, and
 * what each tier does. Your side: a partial or a fail leaves you Exposed, a crit fail drops you. Their side: a crit
 * fail leaves them Exposed. A crit staggers what it hits (a heavy crit or a charge knocks it down); a charm that crits
 * entrances it, and one that crits on the entranced enthralls it.
 */
function attack(
  b: Draft,
  p: Piece,
  t: Piece,
  what: "strike" | "shot" | "cleave" | "charge" | "charm" | "pounce" | "watch",
  ev: BattleEvent[],
  o: { stat?: Stat; extra?: number; ready?: boolean; rail?: Rail; edge?: string[]; bane?: string[] } = {},
): { tier: Tier; damage: number } {
  const ranged = what === "shot";
  const rail: Rail = o.rail ?? (what === "charm" ? "composure" : "stamina");
  // Guarded: the one standing guard by it takes the first blow meant for it (3.5).
  const g = stateOf(t, "guarded");
  const guard = g?.by && p.side !== t.side ? piece(b, g.by) : undefined;
  if (guard && standing(guard) && dist(guard.at, t.at) === 1 && guard.id !== p.id) {
    dropState(t, "guarded", ev);
    t = guard;
  }
  const { defense, why } = defenseAgainst(b, p.at, t, ranged, rail);
  const edgeWhy = [...(o.edge ?? [])];
  const baneWhy = [...(o.bane ?? [])];
  if (rail === "stamina" && flanked(b, p, t)) edgeWhy.push("flanked");
  if (has(t, "exposed")) edgeWhy.push("exposed");
  if (has(t, "marked")) edgeWhy.push("marked");
  if (rail === "composure" && dist(p.at, t.at) === 1) edgeWhy.push("close enough to touch");
  if (rail === "composure" && has(t, "entranced")) edgeWhy.push("entranced");
  if (onHeight(b, p.at) && !onHeight(b, t.at)) edgeWhy.push("high ground");
  const hidden = has(p, "hidden");
  if (hidden) edgeWhy.push("unseen");
  if (o.ready) baneWhy.push("he's ready for that");
  if (ranged && foesOf(b, p).some((q) => dist(q.at, p.at) === 1)) baneWhy.push("a foe next to the shooter");
  const hold = holdOn(p);
  if ((hold || has(p, "held")) && hold?.by !== t.id) baneWhy.push("held");
  const fear = stateOf(p, "frightened");
  if (fear && fear.by === t.id) baneWhy.push("afraid of it");
  const trance = stateOf(p, "entranced");
  if (trance && trance.by === t.id && rail === "stamina") baneWhy.push("entranced by it");
  const st = p.side === "you" ? stat(p, rail === "composure" ? ["charm", "power"] : ranged ? ["grace"] : ["brawn", "grace"], o.stat) : undefined;
  const add = (p.side === "you" ? st!.add : p.attack) + (rail === "stamina" ? p.weapon.hit : 0);
  b.events = ev;
  const tier = roll(b, p, { at: t.id, what, add, target: defense, edge: edgeWhy, bane: baneWhy, why, crit19: hidden });
  if (hidden) dropState(p, "hidden", ev);
  if (edgeWhy.includes("exposed")) dropState(t, "exposed", ev);
  const base = rail === "composure" ? (p.side === "you" ? 2 : p.weapon.damage) : p.weapon.damage;
  const dmg = damageFor(tier, base + (o.extra ?? 0), rail === "composure" ? t.will : t.armor);
  if (dmg > 0) harm(b, t, dmg, p.id, ev, tier === "crit_success" && rail === "stamina", rail);
  else ev.push({ e: "miss", piece: t.id, by: p.id });
  if (tier === "crit_success" && standing(t)) {
    if (rail === "composure") {
      if (has(t, "entranced")) setState(b, t, "enthralled", b.round + 1, ev, p.id);
      else setState(b, t, "entranced", b.round + 1, ev, p.id);
    } else {
      setState(b, t, "staggered", b.round, ev);
      if (p.weapon.kind === "heavy" || what === "charge" || what === "pounce") setState(b, t, "prone", Infinity, ev);
    }
  }
  if (p.side === "you" && (tier === "partial" || tier === "fail" || tier === "crit_fail")) setState(b, p, "exposed", b.round, ev);
  if (p.side === "you" && tier === "crit_fail") setState(b, p, "prone", Infinity, ev);
  if (p.side === "them" && tier === "crit_fail") setState(b, p, "exposed", b.round + 1, ev);
  return { tier, damage: dmg };
}

/* ------------------------------ your side's turn ------------------------------ */

export type TalkKind = "taunt" | "intimidate" | "demand" | "parley";
export type Act =
  /** `plain`: the line said nothing but "I hit him" (the battle router says so); twice running at one foe, it has bane. */
  | { act: "strike"; target: string; stat?: Stat; plain?: boolean; weakness?: boolean }
  /** A look, a word, a touch: charm or the power against its Poise, on the Composure rail (11.2). */
  | { act: "charm"; target: string; stat?: Stat }
  | { act: "shove"; target: string }
  /** Brawn: Grabbed on a success, Pinned on a crit; again on one already held, a rung tighter (11.3). */
  | { act: "grapple"; target: string }
  /** Brawn or grace against what holds you: a rung looser, or free and it Prone on a crit. */
  | { act: "struggle"; stat?: Stat }
  | { act: "prop"; prop: string; target?: string }
  | { act: "guard"; ally: string }
  | { act: "watch" }
  | { act: "aid"; ally: string }
  | { act: "talk"; kind: TalkKind; target?: string; stat?: Stat }
  | { act: "hide" }
  | { act: "ability"; ability: string; target?: string }
  | { act: "dash" }
  | { act: "wait" }
  | { act: "breakaway" }
  | { act: "giveIn" };

/** One piece's part of a turn: where it moves, and what it does, before or after moving. */
export interface Order {
  piece: string;
  to?: Pos;
  act?: Act;
  /** Act first, then move (strike and step back). Moving first is the default. */
  actFirst?: boolean;
}

/** What a hold has to beat: 10 and the holder's grip. */
const gripOf = (h: Piece): number => 10 + (h.side === "them" ? h.attack : Math.max(statOf(h.stats, "brawn"), 0));

/** Moves a piece of your side along the way to a tile it can reach; standing up first costs half its move. */
function moveYours(b: Draft, p: Piece, to: Pos, steps: number, ev: BattleEvent[], through = false): boolean {
  if (same(p.at, to)) return true;
  if (rooted(p)) {
    ev.push({ e: "cant", piece: p.id, why: has(p, "held") ? "held fast: you can't move" : "held: struggle free first" });
    return false;
  }
  let left = steps;
  if (has(p, "prone")) {
    dropState(p, "prone", ev);
    ev.push({ e: "move", piece: p.id, path: [p.at], style: "stand" });
    left = Math.floor(steps / 2);
  }
  const trance = stateOf(p, "entranced");
  const charmer = trance?.by ? piece(b, trance.by) : undefined;
  if (charmer && standing(charmer) && dist(to, charmer.at) > dist(p.at, charmer.at)) {
    ev.push({ e: "cant", piece: p.id, why: `entranced: you can't make yourself walk away from ${charmer.name}` });
    return false;
  }
  const way = movesFor(b, p, left, { through }).get(key(to));
  if (!way) {
    ev.push({ e: "cant", piece: p.id, why: `can't get there this turn` });
    return false;
  }
  walk(b, p, way, "walk", ev);
  return true;
}

/** A piece goes along a way: slick ground may throw it down where it stands, fire catches it, a pit swallows it. */
function walk(b: Draft, p: Piece, way: Pos[], style: Extract<BattleEvent, { e: "move" }>["style"], ev: BattleEvent[]): void {
  const path: Pos[] = [way[0]!];
  let fell = false;
  for (const q of way.slice(1)) {
    path.push(q);
    const g = groundAt(b, q);
    if (g === "burning" && style !== "fly") setState(b, p, "burning", b.round + 1, ev);
    if (g === "slick" && style !== "fly") {
      b.events = ev;
      const tier = roll(b, p, { at: p.id, what: "slick", add: p.side === "you" ? statOf(p.stats, "grace") : p.attack - 1, target: 10, why: ["slick ground"] });
      if (tier === "fail" || tier === "crit_fail") {
        fell = true;
        break;
      }
    }
  }
  p.at = path[path.length - 1]!;
  if (path.length > 1) ev.push({ e: "move", piece: p.id, path, style });
  if (fell) setState(b, p, "prone", Infinity, ev);
  // Whoever it held on the ladder comes with it, a tile behind (a captor's drag), or the hold breaks.
  for (const q of holding(b, p)) {
    if (dist(q.at, p.at) <= 1) continue;
    const behind = path.length > 1 ? path[path.length - 2]! : undefined;
    if (behind && !pieceAt(b, behind)) {
      q.at = behind;
      ev.push({ e: "move", piece: q.id, path: [behind], style: "drag" });
    } else for (const h of HOLDS) dropState(q, h, ev);
  }
}

const isFoe = (p: Piece, t: Piece | undefined): t is Piece => !!t && standing(t) && t.side !== p.side;

function actYours(b: Draft, p: Piece, a: Act, ev: BattleEvent[], ab: (id: string) => BattleAbility | undefined): void {
  b.events = ev;
  const hold = holdOn(p);
  // Pinned: only struggle, talk, charm or an ability; Overwhelmed: only struggle (11.3).
  if (hold?.hold === "overwhelmed" && !["struggle", "wait", "giveIn"].includes(a.act)) return void ev.push({ e: "cant", piece: p.id, why: "overwhelmed: all you can do is struggle" });
  if (hold?.hold === "pinned" && !["struggle", "talk", "charm", "ability", "wait", "giveIn"].includes(a.act)) return void ev.push({ e: "cant", piece: p.id, why: "pinned: you can struggle, talk or use an ability" });
  switch (a.act) {
    case "wait":
    case "dash":
      return;
    case "giveIn":
      b.over = "yielded";
      ev.push({ e: "over", result: "yielded" });
      return;
    case "breakaway": {
      if (!onEdge(b.mat, p.at)) return void ev.push({ e: "cant", piece: p.id, why: "not at the edge of the mat" });
      if (rooted(p)) return void ev.push({ e: "cant", piece: p.id, why: "held: you can't get away" });
      letGo(b, p, ev);
      p.fled = true;
      ev.push({ e: "fled", piece: p.id });
      return;
    }
    case "strike": {
      const t = piece(b, a.target);
      if (!isFoe(p, t)) return void ev.push({ e: "cant", piece: p.id, why: "nobody to strike there" });
      if (!inReach(b, p, t)) return void ev.push({ e: "cant", piece: p.id, why: has(t, "hidden") ? `you can't see ${t.name}` : p.weapon.kind === "ranged" ? `no clear shot at ${t.name}` : `${t.name} is out of reach` });
      const ready = readyFor(b, p, "strike", t.id, !!a.plain);
      attack(b, p, t, p.weapon.kind === "ranged" ? "shot" : "strike", ev, { ...(a.stat ? { stat: a.stat } : {}), ...(ready ? { ready } : {}), ...(a.weakness ? { edge: ["a weakness named"] } : {}) });
      p.lastMove = { act: "strike", target: t.id, round: b.round, plain: !!a.plain };
      return;
    }
    case "charm": {
      const t = piece(b, a.target);
      if (!isFoe(p, t)) return void ev.push({ e: "cant", piece: p.id, why: "nobody there to charm" });
      if (!inCharm(b, p, t)) return void ev.push({ e: "cant", piece: p.id, why: `${t.name} is too far to reach with a look or a word` });
      attack(b, p, t, "charm", ev, { ...(a.stat ? { stat: a.stat } : {}), rail: "composure" });
      return;
    }
    case "shove": {
      const t = piece(b, a.target);
      if (!isFoe(p, t)) return void ev.push({ e: "cant", piece: p.id, why: "nobody to shove there" });
      if (dist(p.at, t.at) !== 1) return void ev.push({ e: "cant", piece: p.id, why: `${t.name} is not next to you` });
      const { defense, why } = defenseAgainst(b, p.at, t, false);
      const edge = has(t, "exposed") ? ["exposed"] : [];
      const ready = readyFor(b, p, "shove", t.id, true);
      const tier = roll(b, p, { at: t.id, what: "shove", add: statOf(p.stats, "brawn"), target: defense, edge, bane: ready ? ["he's ready for that"] : [], why });
      p.lastMove = { act: "shove", target: t.id, round: b.round, plain: true };
      if (edge.length) dropState(t, "exposed", ev);
      if (tier === "fail" || tier === "crit_fail") {
        setState(b, p, "exposed", b.round, ev);
        if (tier === "crit_fail") setState(b, p, "prone", Infinity, ev);
        return;
      }
      if (tier === "partial") setState(b, p, "exposed", b.round, ev);
      letGo(b, t, ev);
      push(b, t, [t.at[0] - p.at[0], t.at[1] - p.at[1]], tier === "crit_success" ? 2 : 1, p.id, ev);
      return;
    }
    case "grapple": {
      const t = piece(b, a.target);
      if (!isFoe(p, t)) return void ev.push({ e: "cant", piece: p.id, why: "nobody to grab there" });
      if (dist(p.at, t.at) !== 1) return void ev.push({ e: "cant", piece: p.id, why: `${t.name} is not next to you` });
      const { defense, why } = defenseAgainst(b, p.at, t, false);
      const tier = roll(b, p, { at: t.id, what: "grapple", add: statOf(p.stats, "brawn"), target: defense, edge: has(t, "exposed") ? ["exposed"] : [], why });
      dropState(t, "exposed", ev);
      if (tier === "fail" || tier === "crit_fail" || tier === "partial") return void setState(b, p, "exposed", b.round, ev);
      tighten(b, t, p.id, tier === "crit_success" ? 2 : 1, ev);
      return;
    }
    case "struggle": {
      const h = holdOn(p);
      const holder = h ? piece(b, h.by) : undefined;
      if (!h && has(p, "held")) {
        const tier = roll(b, p, { at: p.id, what: "struggle", ...stat(p, ["brawn", "grace"], a.stat), target: 11 });
        if (tier === "success" || tier === "crit_success") dropState(p, "held", ev);
        return;
      }
      if (!h || !holder) return void ev.push({ e: "cant", piece: p.id, why: "nothing is holding you" });
      const tier = roll(b, p, { at: holder.id, what: "struggle", ...stat(p, ["brawn", "grace"], a.stat), target: gripOf(holder), why: [h.hold] });
      if (tier === "crit_success") {
        for (const x of HOLDS) dropState(p, x, ev);
        setState(b, holder, "prone", Infinity, ev);
      } else if (tier === "success") loosen(b, p, ev);
      else if (tier !== "partial") setState(b, p, "exposed", b.round, ev);
      return;
    }
    case "guard": {
      const t = piece(b, a.ally);
      if (!t || !standing(t) || t.side !== p.side || t.id === p.id) return void ev.push({ e: "cant", piece: p.id, why: "nobody of yours there to guard" });
      if (dist(t.at, p.at) !== 1) return void ev.push({ e: "cant", piece: p.id, why: `you're not beside ${t.name}` });
      setState(b, t, "guarded", b.round, ev, p.id);
      return;
    }
    case "watch":
      setState(b, p, "watching", b.round + 1, ev);
      return;
    case "aid": {
      const t = piece(b, a.ally);
      if (!t || !standing(t) || t.side !== p.side || t.id === p.id) return void ev.push({ e: "cant", piece: p.id, why: "nobody of yours there to help" });
      setState(b, t, "inspired", b.round + 1, ev);
      return;
    }
    case "hide": {
      if (foesOf(b, p).some((q) => dist(q.at, p.at) === 1)) return void ev.push({ e: "cant", piece: p.id, why: "not with a foe right beside you" });
      const shelter = groundAt(b, p.at) === "smoke" || around(p.at).some((q) => tileAt(b.mat, q) === "cover" || groundAt(b, q) === "smoke");
      if (!shelter) return void ev.push({ e: "cant", piece: p.id, why: "nothing to hide behind here" });
      const seek = 10 + Math.max(0, ...foesOf(b, p).map((q) => q.attack));
      const tier = roll(b, p, { at: p.id, what: "hide", ...stat(p, ["grace", "guile"]), target: seek });
      if (tier === "success" || tier === "crit_success") {
        setState(b, p, "hidden", Infinity, ev);
        b.intents = b.intents.map((i) => (i.target === p.id && (i.kind === "shot" || i.kind === "charm" || i.kind === "hex") ? { ...i, target: "" } : i));
      }
      return;
    }
    case "talk":
      return talk(b, p, a, ev);
    case "prop":
      return useProp(b, p, a.prop, a.target, ev);
    case "ability": {
      const x = ab(a.ability);
      if (!x) return void ev.push({ e: "cant", piece: p.id, why: "you don't have that" });
      return useAbility(b, p, x, a.target, ev);
    }
  }
}

/** A hold a rung tighter (or two, on a crit), from `by`. */
function tighten(b: Draft, t: Piece, by: string, steps: number, ev: BattleEvent[]): void {
  const h = holdOn(t);
  const at = h && h.by === by ? HOLDS.indexOf(h.hold) + steps : steps - 1;
  setState(b, t, HOLDS[Math.min(HOLDS.length - 1, at)]!, Infinity, ev, by);
}
/** A rung looser; off the bottom rung, free. */
function loosen(b: Draft, t: Piece, ev: BattleEvent[]): void {
  const h = holdOn(t);
  if (!h) return;
  const at = HOLDS.indexOf(h.hold) - 1;
  if (at < 0) dropState(t, h.hold, ev);
  else setState(b, t, HOLDS[at]!, Infinity, ev, h.by);
}

/** Talking on the board (3.7): taunt, intimidate, demand surrender, parley. */
function talk(b: Draft, p: Piece, a: Extract<Act, { act: "talk" }>, ev: BattleEvent[]): void {
  const d = b.difficulty ?? 1;
  const t = a.target ? piece(b, a.target) : undefined;
  ev.push({ e: "talk", by: p.id, kind: a.kind, ...(t ? { at: t.id } : {}) });
  if (a.kind === "taunt") {
    const mark = isFoe(p, t) ? t : foesOf(b, p).sort((x, y) => dist(x.at, p.at) - dist(y.at, p.at))[0];
    if (!mark) return void ev.push({ e: "cant", piece: p.id, why: "nobody to taunt" });
    const tier = roll(b, p, { at: mark.id, what: "talk", ...stat(p, ["charm", "guile"], a.stat), target: mark.poise });
    if (tier === "success" || tier === "crit_success") setState(b, mark, "taunted", b.round + 1, ev, p.id);
    if (tier === "crit_success") setState(b, mark, "flustered", b.round + 1, ev);
    if (tier === "fail" || tier === "crit_fail") setState(b, p, "exposed", b.round, ev);
    return;
  }
  if (a.kind === "intimidate") {
    const tier = roll(b, p, { at: t?.id ?? "them", what: "talk", ...stat(p, ["brawn", "charm"], a.stat), target: FOE_DEFENSE[d]! + 1 });
    if (tier === "success") shake(b, 2, ev);
    if (tier === "crit_success") {
      shake(b, 3, ev);
      if (isFoe(p, t) && t.rank !== "boss") setState(b, t, "frightened", b.round + 1, ev, p.id);
    }
    if (tier === "partial") shake(b, 1, ev);
    return;
  }
  if (a.kind === "demand") {
    const ripe = b.broken || (b.resolve !== undefined && b.resolveMax !== undefined && b.resolve * 3 <= b.resolveMax);
    if (!ripe) {
      const tier = roll(b, p, { at: "them", what: "talk", ...stat(p, ["charm", "brawn"], a.stat), target: FOE_DEFENSE[d]! + 4, why: ["they aren't beaten yet"] });
      if (tier === "success" || tier === "crit_success") shake(b, 1, ev);
      return;
    }
    const tier = roll(b, p, { at: "them", what: "talk", ...stat(p, ["charm", "brawn"], a.stat), target: 10 });
    if (tier === "success" || tier === "crit_success") {
      for (const q of b.pieces) if (q.side === "them" && standing(q)) q.out = true;
      b.over = "won";
      b.overHow = "surrender";
      b.intents = [];
      ev.push({ e: "over", result: "won", how: "surrender" });
    }
    return;
  }
  // Parley: it stops the fight, if the story allows it.
  if (b.parley === false) return void ev.push({ e: "cant", piece: p.id, why: "they won't parley" });
  const keen = b.resolve !== undefined && b.resolveMax !== undefined && b.resolve * 2 > b.resolveMax ? 2 : 0;
  const tier = roll(b, p, { at: "them", what: "talk", ...stat(p, ["charm", "guile", "wits"], a.stat), target: FOE_DEFENSE[d]! + 2 + keen, ...(keen ? { why: ["they still think they'll win"] } : {}) });
  if (tier === "success" || tier === "crit_success") {
    b.over = "parley";
    b.intents = [];
    ev.push({ e: "over", result: "parley" });
  } else if (tier !== "partial") setState(b, p, "exposed", b.round, ev);
}

/** Pushes a piece along a direction; it stops at a wall, cover or another piece, and both are hurt by 1. It loses its chalk. */
function push(b: Draft, t: Piece, d: Pos, n: number, by: string, ev: BattleEvent[]): void {
  wipe(b, t, "moved", ev);
  for (let i = 0; i < n; i++) {
    const to: Pos = [t.at[0] + d[0], t.at[1] + d[1]];
    const there = pieceAt(b, to);
    if (!onMat(b.mat, to) || !open(b.mat, to) || there) {
      harm(b, t, 1, by, ev);
      if (there) harm(b, there, 1, by, ev);
      if (standing(t)) setState(b, t, "prone", Infinity, ev);
      return;
    }
    t.at = to;
    ev.push({ e: "pushed", piece: t.id, to });
    const g = groundAt(b, to);
    if (g === "hazard") return intoHazard(b, t, by, ev);
    if (g === "burning") setState(b, t, "burning", b.round + 1, ev);
  }
}

/** Shoved into a pit, deep water, off a cliff: a minion is gone, anyone else takes 3 and is down (4.3). */
function intoHazard(b: Draft, t: Piece, by: string, ev: BattleEvent[]): void {
  if (t.rank === "minion") return harm(b, t, t.stamina, by, ev);
  harm(b, t, 3, by, ev);
  if (standing(t)) setState(b, t, "prone", Infinity, ev);
  // Out of the pit, onto the nearest tile that isn't one.
  const out = around(t.at).find((q) => open(b.mat, q) && !pieceAt(b, q) && groundAt(b, q) !== "hazard");
  if (out) t.at = out;
}

/* ------------------------------ props ------------------------------ */

/** What a prop asks of the one who uses it (4.3). */
export const PROP_USE: Record<PropTemplate, { stat: Stat[]; target: number; reach: "next" | "shot" | "throw"; says: string }> = {
  toppler: { stat: ["brawn"], target: 11, reach: "next", says: "shove it over: it falls in a line of 3, 2 damage and Prone to all there, and leaves rubble" },
  hanging: { stat: ["grace"], target: 11, reach: "shot", says: "cut it or shoot it down: it drops on 2×2, 3 damage and Held" },
  spill: { stat: ["brawn", "grace"], target: 9, reach: "shot", says: "kick it or shoot it: the ground goes slick; fire sets it alight" },
  fire: { stat: ["grace"], target: 10, reach: "throw", says: "throw or kick it: the ground there burns" },
  cover: { stat: ["brawn"], target: 9, reach: "next", says: "flip it: half cover where it stands" },
  choke: { stat: ["brawn"], target: 10, reach: "next", says: "bar it or open it: changes who can get where" },
  throwable: { stat: ["grace", "brawn"], target: 0, reach: "throw", says: "throw it: 1 damage, staggers on a crit" },
  hazard: { stat: ["brawn"], target: 0, reach: "next", says: "shove someone in: a minion is gone, others take 3 and are Prone" },
  height: { stat: ["grace"], target: 0, reach: "next", says: "climb it: high ground, edge on whoever is below" },
  prize: { stat: ["wits", "grace"], target: 11, reach: "next", says: "take it, or act on it" },
};

function useProp(b: Draft, p: Piece, id: string, target: string | undefined, ev: BattleEvent[]): void {
  const x = prop(b, id);
  if (!x || (x.used && x.template !== "choke")) return void ev.push({ e: "cant", piece: p.id, why: "that's spent or not here" });
  const rule = PROP_USE[x.template];
  const near = dist(p.at, x.at) <= 1;
  const shot = rule.reach === "shot" && p.weapon.kind === "ranged" && dist(p.at, x.at) <= p.weapon.range && sees(b.mat, p.at, x.at);
  const thrown = rule.reach === "throw" && near;
  if (!near && !shot && !thrown) return void ev.push({ e: "cant", piece: p.id, why: `${x.name} is out of your reach` });
  const t = target ? piece(b, target) : undefined;
  const d = b.difficulty ?? 1;
  b.events = ev;
  if (x.template === "throwable") {
    if (!isFoe(p, t) || dist(p.at, t.at) > 4 || !sees(b.mat, p.at, t.at)) return void ev.push({ e: "cant", piece: p.id, why: "nobody to throw it at" });
    const { defense, why } = defenseAgainst(b, p.at, t, true);
    const tier = roll(b, p, { at: t.id, what: "prop", ...stat(p, rule.stat), target: defense, why });
    ev.push({ e: "prop", prop: x.id, by: p.id, tiles: [t.at] });
    x.uses = (x.uses ?? 3) - 1;
    if (x.uses <= 0) x.used = true;
    if (tier === "success" || tier === "crit_success") harm(b, t, 1, p.id, ev);
    if (tier === "crit_success" && standing(t)) setState(b, t, "staggered", b.round, ev);
    if (tier === "fail" || tier === "crit_fail") setState(b, p, "exposed", b.round, ev);
    return;
  }
  if (x.template === "height") return void ev.push({ e: "cant", piece: p.id, why: `climb onto ${x.name} with your move` });
  if (x.template === "hazard") return void ev.push({ e: "cant", piece: p.id, why: `shove someone into ${x.name}` });
  if (x.template === "prize" && b.objective?.kind === "grab" && b.objective.prop === x.id) {
    p.carrying = x.id;
    x.used = true;
    ev.push({ e: "prop", prop: x.id, by: p.id, tiles: [x.at] });
    return;
  }
  const tier = roll(b, p, { at: x.id, what: "prop", ...stat(p, rule.stat), target: rule.target + Math.max(0, d - 1) });
  if (tier === "fail" || tier === "crit_fail") {
    setState(b, p, "exposed", b.round, ev);
    if (tier === "crit_fail") setState(b, p, "prone", Infinity, ev);
    return;
  }
  if (tier === "partial") setState(b, p, "exposed", b.round, ev);
  const away: Pos = [Math.sign(x.at[0] - p.at[0]) || 1, Math.sign(x.at[1] - p.at[1])];
  const toward = (n: number): Pos[] => Array.from({ length: n }, (_, i) => [x.at[0] + away[0] * (i + 1), x.at[1] + away[1] * (i + 1)] as Pos).filter((q) => onMat(b.mat, q));
  const square = (c: Pos, r = 1): Pos[] => {
    const out: Pos[] = [];
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (onMat(b.mat, [c[0] + dx, c[1] + dy])) out.push([c[0] + dx, c[1] + dy]);
    return out;
  };
  x.used = true;
  switch (x.template) {
    case "toppler": {
      const tiles = toward(3).filter((q) => tileAt(b.mat, q) !== "wall");
      ev.push({ e: "prop", prop: x.id, by: p.id, tiles });
      for (const q of tiles) {
        const there = pieceAt(b, q);
        if (there && there.id !== p.id) {
          harm(b, there, 2, p.id, ev);
          if (standing(there)) setState(b, there, "prone", Infinity, ev);
        }
      }
      setTile(b, x.at, "floor");
      const rubble = tiles.find((q) => !pieceAt(b, q));
      if (rubble) {
        setTile(b, rubble, "cover");
        setGround(b, [rubble], "rubble", Infinity, ev);
      }
      return;
    }
    case "hanging": {
      const tiles = x.area ?? [x.at, [x.at[0] + 1, x.at[1]], [x.at[0], x.at[1] + 1], [x.at[0] + 1, x.at[1] + 1]];
      ev.push({ e: "prop", prop: x.id, by: p.id, tiles });
      for (const q of tiles) {
        const there = pieceAt(b, q);
        if (!there) continue;
        harm(b, there, 3, p.id, ev);
        if (standing(there)) setState(b, there, "held", b.round + 1, ev);
      }
      return;
    }
    case "spill": {
      const c = isFoe(p, t) && dist(t.at, x.at) <= 3 ? t.at : toward(2).at(-1) ?? x.at;
      const tiles = square(c);
      ev.push({ e: "prop", prop: x.id, by: p.id, tiles });
      const lit = tiles.some((q) => groundAt(b, q) === "burning");
      setGround(b, tiles, lit ? "burning" : "slick", lit ? b.round + 2 : Infinity, ev);
      if (lit) for (const q of tiles) burnOn(b, q, ev);
      setTile(b, x.at, "floor");
      return;
    }
    case "fire": {
      const c = isFoe(p, t) && dist(t.at, p.at) <= 3 ? t.at : toward(2).at(-1) ?? x.at;
      const tiles = [c, ...around(c).filter((q) => q[0] === c[0] || q[1] === c[1])].filter((q) => onMat(b.mat, q));
      // Fire on slick ground runs along all of it.
      const slick = Object.entries(b.ground ?? {}).filter(([, g]) => g.g === "slick").map(([k]) => k.split(",").map(Number) as unknown as Pos);
      const catches = slick.some((q) => tiles.some((r) => dist(q, r) <= 1)) ? slick : [];
      const all = [...tiles, ...catches];
      ev.push({ e: "prop", prop: x.id, by: p.id, tiles: all });
      setGround(b, all, "burning", b.round + 2, ev);
      for (const q of all) burnOn(b, q, ev);
      return;
    }
    case "cover": {
      if (pieceAt(b, x.at)) return void ev.push({ e: "cant", piece: p.id, why: `someone stands on ${x.name}` });
      setTile(b, x.at, "cover");
      ev.push({ e: "prop", prop: x.id, by: p.id, tiles: [x.at] });
      return;
    }
    case "choke": {
      x.used = false;
      if (!x.shut && pieceAt(b, x.at)) return void ev.push({ e: "cant", piece: p.id, why: `someone stands in ${x.name}` });
      x.shut = !x.shut;
      setTile(b, x.at, x.shut ? "wall" : "floor");
      ev.push({ e: "prop", prop: x.id, by: p.id, tiles: [x.at] });
      return;
    }
    case "prize": {
      ev.push({ e: "prop", prop: x.id, by: p.id, tiles: [x.at] });
      if (b.objective?.kind === "stop" && b.objective.prop === x.id) {
        b.over = "won";
        b.overHow = "stopped";
        b.intents = [];
        ev.push({ e: "over", result: "won", how: "stopped" });
      }
      return;
    }
  }
}

function burnOn(b: Draft, q: Pos, ev: BattleEvent[]): void {
  const there = pieceAt(b, q);
  if (there) setState(b, there, "burning", b.round + 1, ev);
}

/* ------------------------------ abilities ------------------------------ */

/** What an ability does on the board (3.9). The store pays for those that cost it; the rest are once a fight, or always. */
export function canUse(b: Battle, a: BattleAbility): string | null {
  if (a.store && (b.store ?? 0) <= 0) return "your store is spent";
  if (!a.store && a.often !== "always" && a.does !== "flourish" && (b.used ?? []).includes(a.id)) return "used already this fight";
  return null;
}

function useAbility(b: Draft, p: Piece, a: BattleAbility, target: string | undefined, ev: BattleEvent[]): void {
  const no = canUse(b, a);
  if (no) return void ev.push({ e: "cant", piece: p.id, why: `${a.name}: ${no}` });
  const t = target ? piece(b, target) : undefined;
  const pay = () => {
    if (a.store) b.store = Math.max(0, (b.store ?? 0) - 1);
    else b.used = [...(b.used ?? []), a.id];
    ev.push({ e: "ability", by: p.id, ability: a.id, does: a.does, ...(t ? { at: t.id } : {}) });
  };
  const foe = isFoe(p, t) ? t : undefined;
  const mate = t && standing(t) && t.side === p.side ? t : undefined;
  const needFoe = (range = p.weapon.range): Piece | undefined => {
    if (!foe) ev.push({ e: "cant", piece: p.id, why: `${a.name}: on whom?` });
    else if (!inReach(b, p, foe, range)) ev.push({ e: "cant", piece: p.id, why: `${a.name}: ${foe.name} is out of reach` });
    else return foe;
    return undefined;
  };
  const charmy = a.tags.some((x) => /charm|allure|kiss|desire|seduc|beguil|glamour/i.test(x));
  switch (a.does) {
    case "reach": {
      const f = needFoe(Math.max(2, p.weapon.range));
      if (!f) return;
      pay();
      const r = attack(b, p, f, p.weapon.kind === "ranged" ? "shot" : "strike", ev);
      if (r.damage > 0 && standing(f) && dist(p.at, f.at) === 2) {
        const to: Pos = [f.at[0] - Math.sign(f.at[0] - p.at[0]), f.at[1] - Math.sign(f.at[1] - p.at[1])];
        if (open(b.mat, to) && !pieceAt(b, to)) {
          f.at = to;
          wipe(b, f, "moved", ev);
          ev.push({ e: "pushed", piece: f.id, to });
        }
      }
      return;
    }
    case "bind": {
      const f = needFoe();
      if (!f) return;
      pay();
      const r = attack(b, p, f, p.weapon.kind === "ranged" ? "shot" : "strike", ev);
      if (r.damage > 0 && standing(f)) setState(b, f, "held", b.round + 1, ev);
      return;
    }
    case "sweep": {
      const all = foesOf(b, p).filter((q) => dist(q.at, p.at) === 1);
      if (!all.length) return void ev.push({ e: "cant", piece: p.id, why: `${a.name}: nobody next to you` });
      pay();
      for (const q of all) if (standing(q) && standing(p)) attack(b, p, q, "strike", ev);
      return;
    }
    case "drain": {
      const charm = charmy || (p.stats?.power !== undefined && foe && foe.rail === undefined && p.composureMax > 0 && a.tags.includes("composure"));
      const f = charm ? (foe && inCharm(b, p, foe) ? foe : undefined) : needFoe();
      if (!f) {
        if (charm) ev.push({ e: "cant", piece: p.id, why: `${a.name}: nobody in reach` });
        return;
      }
      pay();
      const r = attack(b, p, f, charm ? "charm" : p.weapon.kind === "ranged" ? "shot" : "strike", ev, charm ? { rail: "composure" } : {});
      if (r.damage > 0) heal(p, r.damage, "stamina", ev);
      return;
    }
    case "ward": {
      const w = mate ?? p;
      pay();
      setState(b, w, "warded", b.round, ev);
      if (w.id !== p.id && dist(w.at, p.at) === 1) setState(b, w, "guarded", b.round, ev, p.id);
      return;
    }
    case "edge":
    case "ease": {
      const f = needFoe();
      if (!f) return;
      pay();
      attack(b, p, f, p.weapon.kind === "ranged" ? "shot" : "strike", ev, { edge: [a.name] });
      return;
    }
    case "mark": {
      if (!foe) return void ev.push({ e: "cant", piece: p.id, why: `${a.name}: on whom?` });
      pay();
      setState(b, foe, "marked", b.round + 1, ev, p.id);
      return;
    }
    case "sway": {
      if (!foe || !inCharm(b, p, foe)) return void ev.push({ e: "cant", piece: p.id, why: `${a.name}: nobody in reach of it` });
      pay();
      b.events = ev;
      const tier = roll(b, p, { at: foe.id, what: "talk", ...stat(p, ["charm", "power", "guile"]), target: foe.poise, edge: [a.name] });
      if (tier !== "success" && tier !== "crit_success") return;
      const fear = a.tags.some((x) => /fear|dread|terr|menace|threat/i.test(x));
      if (fear && foe.rank !== "boss") setState(b, foe, "frightened", b.round + 1, ev, p.id);
      else if (charmy || p.stats?.power !== undefined) setState(b, foe, tier === "crit_success" && has(foe, "entranced") ? "enthralled" : "entranced", b.round + 1, ev, p.id);
      else setState(b, foe, "taunted", b.round + 1, ev, p.id);
      return;
    }
    case "mend": {
      const w = t && t.side === p.side ? t : p;
      if (dist(w.at, p.at) > 1) return void ev.push({ e: "cant", piece: p.id, why: `${a.name}: you're not beside ${w.name}` });
      pay();
      if (w.down) {
        w.down = false;
        w.stamina = 2;
        setState(b, w, "prone", Infinity, ev);
        ev.push({ e: "heal", piece: w.id, amount: 2, rail: "stamina" });
      } else heal(w, 2 + Math.max(0, a.much - 1), "stamina", ev);
      return;
    }
    case "aid": {
      if (!mate || mate.id === p.id) return void ev.push({ e: "cant", piece: p.id, why: `${a.name}: help whom?` });
      pay();
      setState(b, mate, "inspired", b.round + 1, ev);
      b.again = mate.id;
      return;
    }
    case "open": {
      if (!foe) return void ev.push({ e: "cant", piece: p.id, why: `${a.name}: on whom?` });
      pay();
      foe.armor = Math.max(0, foe.armor - 2);
      foe.will = Math.max(0, foe.will - 1);
      setState(b, foe, "exposed", b.round + 1, ev);
      return;
    }
    case "slip": {
      pay();
      dropState(p, "held", ev);
      for (const h of HOLDS) dropState(p, h, ev);
      b.slip = p.id;
      return;
    }
    case "learn": {
      if (!foe) return void ev.push({ e: "cant", piece: p.id, why: `${a.name}: on whom?` });
      pay();
      setState(b, foe, "marked", b.round + 1, ev, p.id);
      ev.push({ e: "learn", piece: foe.id, says: FOE_KINDS[foe.kind ?? "brute"].says });
      return;
    }
    case "flourish": {
      pay();
      setState(b, p, "inspired", b.round + 1, ev);
      const seen = foesOf(b, p).filter((q) => sees(b.mat, q.at, p.at) && dist(q.at, p.at) <= 6);
      shake(b, Math.min(2, seen.length), ev);
      if (charmy || p.stats?.power !== undefined) for (const q of seen.slice(0, 3)) harm(b, q, 1, p.id, ev, false, "composure");
      return;
    }
  }
}

function heal(p: Piece, n: number, rail: Rail, ev: BattleEvent[]): void {
  const before = rail === "composure" ? p.composure : p.stamina;
  if (rail === "composure") p.composure = Math.min(p.composureMax, p.composure + n);
  else p.stamina = Math.min(p.staminaMax, p.stamina + n);
  const got = (rail === "composure" ? p.composure : p.stamina) - before;
  if (got > 0) ev.push({ e: "heal", piece: p.id, amount: got, rail });
}

/** Your side's turn: each order in the order given. Orders for pieces that can't act are said and skipped. */
export function yourTurn(b0: Battle, orders: readonly Order[], abilities: readonly BattleAbility[] = []): { battle: Battle; events: BattleEvent[] } {
  const b = clone(b0);
  const ev: BattleEvent[] = [];
  if (b.over) return { battle: strip(b), events: ev };
  const done = new Set<string>();
  const ab = (id: string) => abilities.find((a) => a.id === id);
  for (const o of orders) {
    const p = piece(b, o.piece);
    if (!p || p.side !== "you" || !standing(p) || p.ward) continue;
    if (done.has(p.id) && b.again !== p.id) continue;
    if (done.has(p.id)) delete b.again;
    done.add(p.id);
    const steps = o.act?.act === "dash" ? p.speed * 2 : p.speed;
    // Engaged: getting out of reach of a foe you stand next to is breaking off, and it takes your act.
    let act = o.act;
    const leaves = (x: Act | undefined) => !!x && !["dash", "wait", "breakaway", "giveIn", "watch", "hide", "guard"].includes(x.act);
    if (act && o.to && leaves(act) && breaksOff(b, p, o.to) && b.slip !== p.id) {
      ev.push({ e: "cant", piece: p.id, why: "breaking off from a foe takes your act" });
      act = undefined;
    }
    if (act && o.actFirst) actYours(b, p, act, ev, ab);
    if (b.over) break;
    if (o.to && standing(p)) moveYours(b, p, o.to, steps, ev, b.slip === p.id);
    if (act && !o.actFirst && standing(p)) actYours(b, p, act, ev, ab);
    holdsCheck(b, ev);
    spot(b, ev);
    if (ended(b, ev)) break;
  }
  delete b.slip;
  delete b.again;
  return { battle: strip(b), events: ev };
}

/** The scratch fields a turn uses, gone before the battle is handed back. */
function strip(b: Draft): Battle {
  delete b.events;
  delete b.slip;
  delete b.again;
  return b;
}

/** A hidden foe with one of yours right beside it is found (a lurker can't hide in your elbow). */
function spot(b: Draft, ev: BattleEvent[]): void {
  for (const q of b.pieces) if (q.side === "them" && standing(q) && has(q, "hidden") && foesOf(b, q).some((f) => dist(f.at, q.at) === 1)) dropState(q, "hidden", ev);
}

/** Holds come apart when the holder is gone or no longer beside what it held. */
function holdsCheck(b: Draft, ev: BattleEvent[]): void {
  for (const q of b.pieces) {
    const h = holdOn(q);
    if (!h) continue;
    const by = piece(b, h.by);
    if (!by || !standing(by) || dist(by.at, q.at) > 1 || !standing(q)) for (const x of HOLDS) dropState(q, x, ev);
  }
}

/* ------------------------------ their side ------------------------------ */

/** Their blows land, the round ends, and their next move is shown. */
export function theirTurn(b0: Battle): { battle: Battle; events: BattleEvent[] } {
  const b = clone(b0);
  const ev: BattleEvent[] = [];
  if (b.over) return { battle: strip(b), events: ev };
  for (const i of [...b.intents].sort((x, y) => x.by.localeCompare(y.by))) {
    if (!b.intents.includes(i)) continue;
    const p = piece(b, i.by);
    if (!p || !standing(p)) continue;
    land(b, p, i, ev);
    holdsCheck(b, ev);
    if (ended(b, ev)) return { battle: strip(b), events: ev };
  }
  b.intents = [];
  roundEnd(b, ev);
  if (ended(b, ev)) return { battle: strip(b), events: ev };
  const hero = b.pieces.find((p) => p.hero);
  if (hero && !standing(hero)) {
    b.heroDown ??= b.round;
    if (b.round - b.heroDown >= HERO_DOWN_ROUNDS) {
      finish(b, "taken", "dragged clear", ev);
      return { battle: strip(b), events: ev };
    }
  } else delete b.heroDown;
  if (b.round >= ROUND_LIMIT) {
    finish(b, worn(b, "you") >= worn(b, "them") ? "won" : "taken", "worn down", ev);
    return { battle: strip(b), events: ev };
  }
  b.round++;
  const shown = theirMove(b);
  return { battle: shown.battle, events: [...ev, ...shown.events] };
}

/** What a side has left, as a share of its stamina (pieces down count as none). */
function worn(b: Draft, side: Piece["side"]): number {
  const ps = b.pieces.filter((p) => p.side === side && !p.ward);
  const max = ps.reduce((n, p) => n + p.staminaMax, 0);
  return max ? ps.reduce((n, p) => n + (standing(p) ? p.stamina : 0), 0) / max : 0;
}

/** The first piece standing along tiles, and the way up to it (a charge, a pounce, a web). */
function along(b: Draft, p: Piece, tiles: Pos[]): { path: Pos[]; hit?: Piece } {
  const path: Pos[] = [p.at];
  for (const q of tiles.slice(1)) {
    const there = pieceAt(b, q);
    if (there && there.id !== p.id) return { path, hit: there };
    if (!open(b.mat, q)) break;
    path.push(q);
  }
  return { path };
}

/** A chalked blow comes due, on whoever stands there now. */
function land(b: Draft, p: Piece, i: Intent, ev: BattleEvent[]): void {
  b.events = ev;
  const mark = piece(b, i.target);
  const rail: Rail = p.rail ?? "stamina";
  switch (i.kind) {
    case "rally": {
      if (b.resolve !== undefined && b.resolveMax !== undefined && !b.broken) {
        const by = Math.min(2, b.resolveMax - b.resolve);
        b.resolve += by;
        if (by > 0) ev.push({ e: "resolve", left: b.resolve, by: -by });
      }
      return;
    }
    case "summon":
      p.summoned = true;
      return summon(b, p, 2, ev);
    case "carry": {
      // Off the edge with what it holds: carried off the board (11.4).
      const held = holding(b, p);
      if (!onEdge(b.mat, p.at) || !held.length) return void ev.push({ e: "miss", piece: i.target, by: p.id });
      for (const q of held) {
        q.carried = true;
        q.states = [];
        ev.push({ e: "carried", piece: q.id, by: p.id });
        if (q.hero) {
          b.over = "taken";
          b.overHow = "carried";
        }
      }
      p.fled = true;
      ev.push({ e: "fled", piece: p.id });
      if (b.over) {
        b.intents = [];
        ev.push({ e: "over", result: b.over, how: b.overHow });
      }
      return;
    }
    case "charge":
    case "pounce": {
      const { path, hit } = along(b, p, i.tiles);
      if (path.length > 1) walk(b, p, path, i.kind === "pounce" ? "pounce" : "charge", ev);
      if (!standing(p) || has(p, "prone")) return;
      if (!hit) return void ev.push({ e: "miss", piece: i.target, by: p.id });
      const r = attack(b, p, hit, i.kind, ev, { extra: i.kind === "charge" ? 1 : 0, rail });
      if ((r.tier === "success" || r.tier === "crit_success") && standing(hit)) {
        if (i.kind === "charge") push(b, hit, [Math.sign(hit.at[0] - p.at[0]), Math.sign(hit.at[1] - p.at[1])], 1, p.id, ev);
        else setState(b, hit, "prone", Infinity, ev);
      }
      return;
    }
    case "shot":
    case "web": {
      // The first piece on the chalked line takes it, whoever it is; a wall or smoke stops it.
      for (const q of i.tiles.slice(1)) {
        if (tileAt(b.mat, q) === "wall" || groundAt(b, q) === "smoke") return void ev.push({ e: "miss", piece: i.target, by: p.id });
        const there = pieceAt(b, q);
        if (!there || has(there, "hidden")) continue;
        const r = attack(b, p, there, "shot", ev, { rail });
        if (i.kind === "web" && r.damage > 0 && standing(there)) {
          setState(b, there, "held", b.round + 1, ev);
          // Reeled in two tiles.
          const way = line(there.at, p.at).slice(1, 3).filter((x) => open(b.mat, x) && !pieceAt(b, x));
          if (way.length) {
            there.at = way[way.length - 1]!;
            ev.push({ e: "pushed", piece: there.id, to: there.at });
          }
        }
        return;
      }
      return void ev.push({ e: "miss", piece: i.target, by: p.id });
    }
    case "blast": {
      // A circle of tiles: everyone standing there, either side, takes it.
      const on = i.tiles.map((q) => pieceAt(b, q)).filter((x): x is Piece => !!x && x.id !== p.id);
      if (!on.length) return void ev.push({ e: "miss", piece: i.target, by: p.id });
      for (const t of on) if (standing(p) && standing(t)) attack(b, p, t, "shot", ev, { rail, extra: -1 });
      return;
    }
    case "charm":
    case "hex": {
      if (!mark || !standing(mark) || !inCharm(b, p, mark)) return void ev.push({ e: "miss", piece: i.target, by: p.id });
      if (i.kind === "charm") return void attack(b, p, mark, "charm", ev, { rail: "composure" });
      const tier = roll(b, p, { at: mark.id, what: "hex", add: p.attack, target: mark.poise });
      if (tier === "success" || tier === "crit_success") {
        setState(b, mark, "marked", b.round + 1, ev, p.id);
        if (tier === "crit_success") setState(b, mark, "frightened", b.round + 1, ev, p.id);
      }
      return;
    }
    case "grab": {
      if (!mark || !standing(mark) || dist(mark.at, p.at) !== 1) return void ev.push({ e: "miss", piece: i.target, by: p.id });
      const { defense, why } = defenseAgainst(b, p.at, mark, false);
      const tier = roll(b, p, { at: mark.id, what: "grab", add: p.attack, target: defense, why, edge: has(mark, "exposed") ? ["exposed"] : [] });
      dropState(mark, "exposed", ev);
      if (tier === "success" || tier === "crit_success") tighten(b, mark, p.id, tier === "crit_success" ? 2 : 1, ev);
      else ev.push({ e: "miss", piece: mark.id, by: p.id });
      return;
    }
    case "squeeze": {
      // Wearing down what it holds (11.3): Overwhelmed takes it with no roll; else a roll, and the hold a rung tighter.
      const h = mark ? holdOn(mark) : undefined;
      if (!mark || !standing(mark) || h?.by !== p.id) return void ev.push({ e: "miss", piece: i.target, by: p.id });
      if (h.hold === "overwhelmed") return harm(b, mark, 2, p.id, ev, false, rail);
      const target = rail === "composure" ? mark.poise : mark.defense;
      const tier = roll(b, p, { at: mark.id, what: "squeeze", add: p.attack, target, why: [h.hold] });
      if (tier === "success" || tier === "crit_success") {
        harm(b, mark, tier === "crit_success" ? 3 : 1, p.id, ev, false, rail);
        if (standing(mark)) tighten(b, mark, p.id, 1, ev);
      } else if (tier === "partial") harm(b, mark, 1, p.id, ev, false, rail);
      else ev.push({ e: "miss", piece: mark.id, by: p.id });
      return;
    }
    default: {
      // A strike follows its mark while the mark is still in reach; a cleave does too, and takes in whoever stands in its
      // arc. Out of reach, it falls on whoever stands on the chalk instead, any side but its own self.
      const followed = mark && standing(mark) && !has(mark, "hidden") && reaches(b, p, mark) ? [mark] : [];
      const onChalk = i.tiles.map((q) => pieceAt(b, q)).filter((x): x is Piece => !!x && x.id !== p.id && !has(x, "hidden"));
      const on = [...new Set([...followed, ...(i.kind === "cleave" || !followed.length ? onChalk : [])])];
      if (!on.length) return void ev.push({ e: "miss", piece: i.target, by: p.id });
      for (const t of on) if (standing(p) && standing(t)) {
        const r = attack(b, p, t, i.kind === "cleave" ? "cleave" : "strike", ev, { rail });
        // A flock's strike that lands leaves you flustered; a skirmisher hits and backs off (5.1, 11.4).
        if (p.kind === "flock" && r.damage > 0 && standing(t)) setState(b, t, "flustered", b.round + 1, ev);
      }
      if (p.kind === "skirmisher" && standing(p) && followed[0]) {
        const t = followed[0];
        const back = [...movesFor(b, p, 2).values()].map((w) => w[w.length - 1]!).filter((q) => dist(q, t.at) >= 2).sort((x, y) => dist(y, t.at) - dist(x, t.at))[0];
        if (back) walk(b, p, movesFor(b, p, 2).get(key(back))!, "walk", ev);
      }
    }
  }
}

/** The end of a round: burning bites, holds wear, states and ground run out, more of them come, an aim comes due. */
function roundEnd(b: Draft, ev: BattleEvent[]): void {
  for (const p of b.pieces) {
    if (!standing(p)) continue;
    if (groundAt(b, p.at) === "burning") setState(b, p, "burning", b.round + 1, ev);
    if (has(p, "burning")) {
      ev.push({ e: "burn", piece: p.id, damage: 1 });
      harm(b, p, 1, "fire", ev);
    }
    // Your hold on one of theirs wears it, Overwhelmed, without a roll.
    const h = holdOn(p);
    if (p.side === "them" && h?.hold === "overwhelmed") harm(b, p, 1, h.by, ev, false, piece(b, h.by)?.stats?.power !== undefined ? "composure" : "stamina");
    if (!standing(p)) continue;
    for (const s of p.states) if (s.until <= b.round) dropState(p, s.id, ev);
  }
  if (b.ground)
    for (const [k, g] of Object.entries(b.ground))
      if (g.until <= b.round) {
        const q = k.split(",").map(Number) as unknown as Pos;
        b.ground = { ...b.ground };
        delete b.ground[k];
        ev.push({ e: "ground", ground: g.g, tiles: [q], on: false });
      }
  if (b.clock && b.clock.round <= b.round) {
    const free = edgeSpots(b, b.clock.foes.length);
    const came: string[] = [];
    b.clock.foes.forEach((f, i) => {
      if (!free[i]) return;
      b.pieces.push({ ...f, at: free[i]!, states: [...f.states] });
      came.push(f.id);
      if (b.resolve !== undefined) {
        const t = Math.min(3, RANKS[f.rank ?? "soldier"].threat);
        b.resolve += t;
        b.resolveMax = (b.resolveMax ?? 0) + t;
      }
    });
    if (came.length) ev.push({ e: "arrive", pieces: came });
    delete b.clock;
  }
  const o = b.objective;
  if (o?.kind === "hold" && b.round >= o.rounds) finish(b, "won", "held", ev);
  if (o?.kind === "stop" && b.round >= o.rounds) finish(b, "taken", "too late", ev);
}

/** Free floor down the east edge, from the middle out: where help for them comes in. */
function edgeSpots(b: Battle, n: number): Pos[] {
  const out: Pos[] = [];
  const mid = Math.floor(b.mat.h / 2);
  for (let x = b.mat.w - 1; x >= b.mat.w - 3 && out.length < n; x--)
    for (let i = 0; i < b.mat.h && out.length < n; i++) {
      const y = mid + (i % 2 ? -1 : 1) * Math.ceil(i / 2);
      if (y >= 0 && y < b.mat.h && open(b.mat, [x, y]) && !pieceAt(b, [x, y])) out.push([x, y]);
    }
  return out;
}

function finish(b: Draft, result: Result, how: string, ev: BattleEvent[]): void {
  if (b.over) return;
  b.over = result;
  b.overHow = how;
  b.intents = [];
  ev.push({ e: "over", result, how });
}

/** Their move, shown: every foe moves by its kind and chalks what it will do (foekinds.ts). */
export function theirMove(b0: Battle): { battle: Battle; events: BattleEvent[] } {
  const b = clone(b0);
  const ev: BattleEvent[] = [];
  b.intents = [];
  b.events = ev;
  for (const p of b.pieces.filter((x) => x.side === "them" && standing(x)).sort((x, y) => x.id.localeCompare(y.id))) {
    if (!standing(p)) continue;
    // A broken side, a leader hurt past half, or a frightened foe: it runs for the edge, and off it.
    const fear = stateOf(p, "frightened");
    if (b.broken || (p.leader && p.kind === "leader" && p.stamina * 2 <= p.staminaMax)) {
      run(b, p, ev);
      continue;
    }
    // Held on your ladder: it fights the hold instead of moving.
    const h = holdOn(p);
    if (h) {
      const holder = piece(b, h.by)!;
      const tier = roll(b, p, { at: holder.id, what: "struggle", add: p.attack, target: gripOf(holder), why: [h.hold] });
      if (tier === "crit_success") for (const x of HOLDS) dropState(p, x, ev);
      else if (tier === "success") loosen(b, p, ev);
      if (holdOn(p) && holdOn(p)!.hold !== "grabbed") continue;
    }
    let steps = rooted(p) ? 0 : p.speed;
    if (has(p, "prone")) {
      dropState(p, "prone", ev);
      ev.push({ e: "move", piece: p.id, path: [p.at], style: "stand" });
      // Getting up costs half the move.
      steps = Math.floor(steps / 2);
    }
    if (fear?.by) {
      const from = piece(b, fear.by);
      if (from && standing(from)) {
        const away = [...movesFor(b, p, steps).values()].sort((x, y) => dist(y[y.length - 1]!, from.at) - dist(x[x.length - 1]!, from.at))[0];
        if (away && away.length > 1) walk(b, p, away, "run", ev);
        continue;
      }
    }
    const plan = foePlan(b, p, steps);
    apply(b, p, plan, ev);
  }
  // A hidden piece of yours with one of them right beside it is found.
  for (const q of b.pieces) if (q.side === "you" && has(q, "hidden") && foesOf(b, q).some((f) => dist(f.at, q.at) === 1)) dropState(q, "hidden", ev);
  return { battle: strip(b), events: ev };
}

/** Off toward the nearest edge, away from your side; on the edge, gone. */
function run(b: Draft, p: Piece, ev: BattleEvent[]): void {
  if (onEdge(b.mat, p.at) && !rooted(p)) {
    letGo(b, p, ev);
    p.fled = true;
    ev.push({ e: "fled", piece: p.id });
    return;
  }
  const yours = foesOf(b, p);
  const edgeD = (q: Pos) => Math.min(q[0], q[1], b.mat.w - 1 - q[0], b.mat.h - 1 - q[1]);
  const way = [...movesFor(b, p, rooted(p) ? 0 : p.speed).values()].sort((x, y) => {
    const a = x[x.length - 1]!;
    const c = y[y.length - 1]!;
    const near = (q: Pos) => Math.min(9, ...yours.map((f) => dist(f.at, q)));
    return edgeD(a) - edgeD(c) || near(c) - near(a);
  })[0];
  if (way && way.length > 1) walk(b, p, way, "run", ev);
}

function apply(b: Draft, p: Piece, plan: { path: Pos[]; intent: Intent | null; style?: "walk" | "fly"; guard?: string }, ev: BattleEvent[]): void {
  if (plan.path.length > 1) walk(b, p, plan.path, plan.style ?? "walk", ev);
  if (!standing(p)) return;
  const charge = plan.guard ? piece(b, plan.guard) : undefined;
  if (charge && standing(charge)) setState(b, charge, "guarded", b.round, ev, p.id);
  // A watcher strikes the first foe that comes next to it, before that foe's blow is chalked (3.7).
  const w = b.pieces.find((q) => q.side === "you" && standing(q) && has(q, "watching") && dist(q.at, p.at) === 1);
  if (w && plan.path.length > 1) {
    dropState(w, "watching", ev);
    attack(b, w, p, "watch", ev);
    if (!standing(p) || has(p, "staggered") || has(p, "prone")) return;
  }
  if (plan.intent && !has(p, "staggered")) {
    b.intents.push(plan.intent);
    ev.push({ e: "intent", intent: plan.intent });
  }
}

/** Whether the fight is over: their side all out, yours all Down or Overcome, or yours all gone off the mat. */
function ended(b: Draft, ev: BattleEvent[]): boolean {
  if (b.over) return true;
  const yours = b.pieces.filter((p) => p.side === "you" && !p.ward);
  const theirs = b.pieces.filter((p) => p.side === "them");
  const o = b.objective;
  if (o?.kind === "protect") {
    const w = piece(b, o.piece);
    if (w && (w.down || w.carried || w.overcome)) return finish(b, "taken", "lost", ev), true;
  }
  // A prize carried off an edge.
  if (o?.kind === "grab" && yours.some((p) => p.fled && p.carrying === o.prop)) return finish(b, "won", "grabbed", ev), true;
  if (theirs.every((p) => !standing(p))) return finish(b, "won", theirs.some((p) => p.fled) ? "broken" : theirs.every((p) => p.overcome) ? "overcome" : "beaten", ev), true;
  if (yours.every((p) => !standing(p))) {
    const fled = yours.filter((p) => p.fled).length;
    if (o?.kind === "escape" && fled >= o.need) return finish(b, "won", "escaped", ev), true;
    const hero = yours.find((p) => p.hero);
    if (fled && (!hero || hero.fled)) return finish(b, "fled", "fled", ev), true;
    return finish(b, "taken", hero?.carried ? "carried" : hero?.overcome ? "overcome" : "beaten", ev), true;
  }
  return false;
}

/* ------------------------------ opening a fight ------------------------------ */

export interface BattleSpec {
  seed: string;
  mat: Mat;
  pieces: Piece[];
  /** Off when the player turned the "he's ready for that" bane off. */
  readyForThat?: boolean;
  difficulty?: number;
  zones?: Zone[];
  props?: Prop[];
  ground?: Battle["ground"];
  objective?: Objective;
  clock?: Battle["clock"];
  store?: number;
  parley?: boolean;
}

/** A fight opens with their first move shown. Their side's Resolve is what they're worth: the last of them run. */
export function startBattle(spec: BattleSpec): { battle: Battle; events: BattleEvent[] } {
  const worth = spec.pieces.filter((p) => p.side === "them").reduce((n, p) => n + Math.min(3, RANKS[p.rank ?? "soldier"].threat), 0);
  const b: Battle = {
    seed: spec.seed,
    mat: spec.mat,
    pieces: spec.pieces.map((p) => ({ ...p, states: [...p.states] })),
    intents: [],
    round: 1,
    thrown: 0,
    wounds: 0,
    resolve: worth,
    resolveMax: worth,
    ...(spec.readyForThat === false ? { readyForThat: false } : {}),
    ...(spec.difficulty !== undefined ? { difficulty: spec.difficulty } : {}),
    ...(spec.zones ? { zones: spec.zones } : {}),
    ...(spec.props ? { props: spec.props.map((x) => ({ ...x })) } : {}),
    ...(spec.ground ? { ground: { ...spec.ground } } : {}),
    ...(spec.objective ? { objective: spec.objective } : {}),
    ...(spec.clock ? { clock: spec.clock } : {}),
    ...(spec.store !== undefined ? { store: spec.store } : {}),
    ...(spec.parley !== undefined ? { parley: spec.parley } : {}),
  };
  return theirMove(b);
}

/** A whole round from your side's orders: your turn, then their blows and their next move. */
export function playRound(b: Battle, orders: readonly Order[], abilities: readonly BattleAbility[] = []): { battle: Battle; events: BattleEvent[] } {
  const a = yourTurn(b, orders, abilities);
  if (a.battle.over) return a;
  const c = theirTurn(a.battle);
  return { battle: c.battle, events: [...a.events, ...c.events] };
}

/** Sets a state on a piece from outside the rules (the tests, a story beat). */
export function withState(b0: Battle, id: string, s: StateId, until: number, by?: string): Battle {
  const b = clone(b0);
  setState(b, mut(b, id), s, until, [], by);
  return strip(b);
}

/* ------------------------------ a plain board ------------------------------ */

/**
 * The mat as text, for the sims and the tests: `#` wall, `=` cover, `.` floor, `*` chalk, `~` slick, `^` burning, `o`
 * a pit, `+` a prop; your side in capitals and theirs in small letters, by the first letter of the id; downed is `_`.
 */
export function boardText(b: Battle): string {
  const chalk = new Set(b.intents.flatMap((i) => i.tiles.map(key)));
  const rows: string[] = [];
  for (let y = 0; y < b.mat.h; y++) {
    let r = "";
    for (let x = 0; x < b.mat.w; x++) {
      const p = b.pieces.find((q) => same(q.at, [x, y]) && !q.out && !q.fled && !q.carried && !(q.overcome && q.side === "them"));
      const t = b.mat.tiles[y]![x]!;
      const g = groundAt(b, [x, y]);
      const pr = propAt(b, [x, y]);
      r += p
        ? p.down || p.overcome
          ? "_"
          : p.side === "you"
            ? p.id[0]!.toUpperCase()
            : p.id[0]!.toLowerCase()
        : t === "wall"
          ? "#"
          : pr
            ? "+"
            : t === "cover"
              ? "="
              : g === "hazard"
                ? "o"
                : g === "burning"
                  ? "^"
                  : g === "slick"
                    ? "~"
                    : chalk.has(`${x},${y}`)
                      ? "*"
                      : ".";
    }
    rows.push(r);
  }
  return rows.join("\n");
}

export { around, dist };
