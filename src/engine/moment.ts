/**
 * One moment of the loop (docs/DESIGN.md, 1.1): something stands in your way
 * at a stop, you say how you go at it, one die rolls, and the situation
 * changes.
 *
 * Everything here is code. A model (or, in the preview, a list of plain
 * words) only reads what a written line attempts: which way through it is,
 * which stat it leans on, and whether it uses something that is there. It
 * never says whether the line works, and nothing in the line can grant
 * anything: "and she lets me pass" is an attempt, like any other.
 *
 * The two rules of a moment are kept here:
 *   - A failed roll changes the situation. It costs something, closes the
 *     way that was tried, and makes every way that is left harder.
 *   - How you try matters. Each way through tests a different stat, has its
 *     own odds at each stop, and puts something different at risk.
 */
import type { Ability } from "./abilities.js";
import { d20Odds, d20OddsBest, d20OddsWorst, d20Tier, rollD20, seededRng } from "./dice.js";
import type { Notice } from "./margin.js";
import { costByPosition, effectAfter, effectOf, gapOf, hurtsUsed, positionOf, sureHands, traded, type Effect, type Foe, type Gear, type Position, type Trade } from "./effect.js";

/** The four ways past a stop. */
export type Way = "talk" | "sneak" | "force" | "pay";
/**
 * What a character is good at (docs/MOONSHOT.md, 3). Each is a number from 0 to STAT_MAX, added to the die. Six for
 * everyone; a seventh, "power", only in a world that has that kind of power (a world kit names it: Arcana, Tech, Faith,
 * Psi, Allure).
 */
export type CoreStat = "brawn" | "grace" | "charm" | "guile" | "wits" | "sense";
export type Stat = CoreStat | "power";
/** A hero's stats: the six, and the seventh where the world has it. */
export type Stats = Record<CoreStat, number> & { power?: number };
/** What a way puts at risk. */
export type CostKind = "goodwill" | "hours" | "health" | "supplies";
export type Tier = "crit_success" | "success" | "partial" | "fail" | "crit_fail";
/** 0 easy, 1 fair, 2 hard, 3 very hard. */
export type Difficulty = 0 | 1 | 2 | 3;

export const WAYS: readonly Way[] = ["talk", "sneak", "force", "pay"];
export const STATS: readonly CoreStat[] = ["brawn", "grace", "charm", "guile", "wits", "sense"];
/** Every stat, the seventh last. */
export const ALL_STATS: readonly Stat[] = [...STATS, "power"];
export const STAT_MAX = 4;

/** The stats each way can lean on. The first is the usual one; the others are for a line that plainly goes about it differently. */
export const WAY_STATS: Record<Way, readonly Stat[]> = {
  talk: ["charm", "brawn", "guile", "wits", "power"],
  sneak: ["grace", "guile", "wits", "sense", "power"],
  force: ["brawn", "grace", "power"],
  pay: ["wits", "charm"],
};

/** What each way puts at risk. */
export const WAY_COST: Record<Way, CostKind> = { talk: "goodwill", sneak: "hours", force: "health", pay: "supplies" };

/** What the die plus the stat must reach, by difficulty. */
export const TARGETS = [9, 12, 15, 18] as const;
/** Falling short by this much or less still works, at a cost. */
export const PARTIAL = 3;
/** Every try takes this long, whatever comes of it. */
export const TRY_HOURS = 0.5;
export const GOODWILL_MAX = 5;

/**
 * Something in the situation that a line can use. Using one makes its way a step easier, once (or `uses` times). A
 * mark (docs/SYSTEMS.md, 4) is a lever made in play: by a trick used well, by a line that used what was there, or by a
 * try that went better than hoped.
 */
export interface Lever {
  id: string;
  way: Way;
  /** What it is, in a few words, as the player would call it. */
  name: string;
  /** Words in a line that mean this thing, for reading a line without a model. */
  words?: readonly string[];
  /** How many times it can be leaned on; 1 when not said. */
  uses?: number;
  /** Made in play, not dealt with the stop. */
  mark?: boolean;
  /** An edge (docs/MOONSHOT.md, 2.2): leaning on it also counts +1 on your side of the gap against a foe. */
  edge?: boolean;
}

/**
 * A mark against you (docs/SYSTEMS.md, 4): a short true fact the narrator writes on a slip, against one way ("the watch
 * knows your face"). Your next try that way throws two dice and keeps the worse; then it is used up.
 */
export interface Against {
  id: string;
  way: Way;
  name: string;
}

/** How well a line uses what is there (docs/SYSTEMS.md, 4.1). Graded by a reader, checked by code. */
export type Grade = "plain" | "grounded" | "inspired";
export const GRADES: readonly Grade[] = ["plain", "grounded", "inspired"];

/** How many times a lever has been leaned on at a moment. */
export const leaned = (m: Pick<Moment, "spent">, id: string): number => m.spent.filter((s) => s === id).length;
/** Whether a lever can still be leaned on. */
export const leverLeft = (m: Pick<Moment, "spent">, l: Lever): boolean => leaned(m, l.id) < (l.uses ?? 1);

/** One marked place on the map and what stands in the way there. Fixed before play; nothing a model says changes it. */
export interface Stop {
  id: string;
  name: string;
  kind: "person" | "obstacle" | "fight";
  /** What the narrator sets before you. */
  situation: string;
  /** The ways through that exist here. A way left out cannot be tried at this stop. `price` is what paying asks, in supplies. */
  ways: Partial<Record<Way, { difficulty: Difficulty; price?: number }>>;
  levers: readonly Lever[];
  /** Who stands against you here (effect.ts): what a try can do against them. With none, every try has standard effect. */
  foe?: Foe;
  /** The position every try here starts in, when the place sets one (effect.ts). */
  position?: Position;
  /** Hidden things here, each seen by a hero good enough at one stat (margin.ts). */
  notices?: Notice[];
}

/** What the player carries from stop to stop. */
export interface Sheet {
  stats: Stats;
  /** What the seventh stat is called in this world, when it has one ("Arcana", "Tech"). */
  powerName?: string;
  health: number;
  supplies: number;
  goodwill: number;
  /** Hour of the game's day; it runs past 24 into the next day. */
  hour: number;
  /** The hero's store (docs/SYSTEMS.md, 2.2): spent on gifts and on pushing a try. */
  store?: number;
  /** Your gear for each way, on the ladder (effect.ts): plain when not said. */
  gear?: Partial<Record<Way, Gear>>;
}

/** A moment as it stands. Never changed in place: `resolve` returns the next one. */
export interface Moment {
  seed: string;
  stop: Stop;
  sheet: Sheet;
  /** Ways that failed here and cannot be tried again. */
  closed: readonly Way[];
  /** Levers already used. */
  spent: readonly string[];
  /** How much worse things have got here: each step makes every way one step harder. */
  trouble: number;
  /** How many times the die has been thrown here. */
  tries: number;
  over: null | "past" | "turned_back";
  /** At a stop that takes more than one good try (a fight, the last stand), a way that fails stays open: it only gets harder. */
  stubborn?: boolean;
  /** The hero's abilities that can still be used in this story. */
  abilities?: readonly Ability[];
  /** Abilities used at this stop that cannot be used again here (once a stop, once a story), and tricks that left a mark. */
  used?: readonly string[];
  /** Steps a sway has made talking easier here. */
  warm?: number;
  /** Edges on your side of the gap for every try here, from outside the scene: the keys you hold at the end of a story (clues.ts). */
  edges?: number;
  /** The stats a fight is won with in this world (kit.ts, kitFight): force leans on these instead of Brawn. */
  attack?: readonly Stat[];
  /** An inspired line has already made a try easier here (only once a stop). */
  inspired?: boolean;
  /** How many companions are with you. */
  company?: number;
  /** Marks against you (docs/SYSTEMS.md, 4): a try by a way one is against throws two dice and keeps the worse. */
  against?: readonly Against[];
  /** The narrator has already thrown its own die for a question here (luck.ts): once a stop. */
  lucked?: boolean;
  /** An ambush laid or the upper hand won here: tries start controlled (effect.ts). */
  ambush?: boolean;
}

/** What a reader makes of a written line. Anything out of range is put right by `nameCheck`. */
export interface Read {
  way: Way;
  stat?: Stat | null;
  /** The id of a lever the line uses, if any. */
  lever?: string | null;
  /** What is being attempted, in a few words. */
  attempt?: string;
  /** The id of an ability the line uses, if any. */
  ability?: string | null;
  /** The line spends from the store to make the try a step easier. */
  push?: boolean;
  /** How well the line uses what is there, once code has checked it. */
  grade?: Grade;
  /** If it works, what it leaves true, in a few words: the mark it may leave. */
  mark?: string;
  /** In a contest (contest.ts), the id of the foe the line goes for; the one coming at you when not said. */
  target?: string | null;
  /** "bold" (worse position, better effect) or "careful" (the reverse): docs/MOONSHOT.md, 2.3. */
  trade?: Trade | null;
  /** The line as written, so code can check which of a foe's weaknesses it really uses. */
  line?: string;
  /** A companion or another player sets the try up: +1 on the gap, when someone is with you. */
  help?: boolean;
}

/** Whether an ability can be used now: not used up here or in this story, and the store can pay for it. */
export function canUse(m: Moment, a: Ability, storeAfter = 0): boolean {
  if (!(m.abilities ?? []).some((x) => x.id === a.id)) return false;
  if (a.often !== "always" && (m.used ?? []).includes(a.id)) return false;
  return !a.store || (m.sheet.store ?? 0) - storeAfter >= 1;
}

/** The ability a read names, if it can be played on this try. */
export function abilityFor(m: Moment, read: Read): Ability | null {
  const a = read.ability ? (m.abilities ?? []).find((x) => x.id === read.ability) : undefined;
  if (!a || !canUse(m, a)) return null;
  if (!["ease", "edge", "open", "ward", "slip", "aid", "sway"].includes(a.does)) return null;
  if (a.ways.length && !a.ways.includes(read.way)) return null;
  if (a.does === "aid" && !m.company) return null;
  return a;
}

/** The longest an attempt is kept, in letters. */
export const ATTEMPT_MAX = 160;

/** Cut a line to at most `max` letters, at the end of a word, never mid-word. */
export function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const end = cut.lastIndexOf(" ");
  return (end > max / 2 ? cut.slice(0, end) : t.slice(0, max)).replace(/[\s,;:.-]+$/, "");
}

export function startMoment(stop: Stop, sheet: Sheet, seed: string): Moment {
  return { seed, stop, sheet, closed: [], spent: [], trouble: 0, tries: 0, over: null };
}

const clampDifficulty = (n: number): Difficulty => Math.max(0, Math.min(3, Math.round(n))) as Difficulty;
export const statOf = (sheet: Pick<Sheet, "stats">, stat: Stat): number => Math.max(0, Math.min(STAT_MAX, Math.round(sheet.stats[stat] ?? 0)));
/** Whether the hero's world gives them the seventh stat. */
export const hasPower = (sheet: Pick<Sheet, "stats">): boolean => typeof sheet.stats.power === "number";

/** Why a way can be shut: not possible at this stop, failed here already, the price cannot be met, or nobody will hear you out. */
export type Shut = "not_here" | "closed" | "cannot_pay" | "unheard";

/** Why a way cannot be tried now, or null when it can. With no goodwill left, nobody will be talked round by you. */
export function shut(m: Moment, way: Way): null | Shut {
  const here = m.stop.ways[way];
  if (!here) return "not_here";
  if (m.closed.includes(way)) return "closed";
  if (way === "pay" && m.sheet.supplies < (here.price ?? 0)) return "cannot_pay";
  return null;
}

/** The check a way would be, named in full: what the screen shows before the die is touched. */
export interface Check {
  way: Way;
  stat: Stat;
  /** The stat's number: what is added to the die. */
  add: number;
  /** The lever the line uses, when it has not been used before. */
  lever: Lever | null;
  difficulty: Difficulty;
  /** What the die plus `add` must reach. */
  target: number;
  /** The real chances, counted face by face. */
  odds: { success: number; partial: number; fail: number };
  /** What this way puts at risk. */
  costs: CostKind;
  /** What paying asks, in supplies. 0 for the other ways. */
  price: number;
  /** Talking with no goodwill left: nobody wants to hear you out, so it is a step harder. */
  cold?: boolean;
  attempt: string;
  /** The ability played on this try. */
  ability: Ability | null;
  /** Two dice, keep the better. */
  edge: boolean;
  /** A mark against you on this way: two dice, keep the worse. With an edge too, they cancel and one die is thrown. */
  bane: Against | null;
  /** How much of the cost an ability keeps off. */
  ward: number;
  /** A failure works at a cost instead. */
  slip: boolean;
  /** A way that was shut, opened by an ability for this try. */
  opened: boolean;
  /** Spending from the store made it a step easier. */
  pushed: boolean;
  /** An inspired line made it a step easier. */
  inspired: boolean;
  /** Steps easier from a sway made earlier here. */
  warm: number;
  /** What it takes from the store. */
  storeCost: number;
  /** Your side less theirs (effect.ts); null when nothing here is rated against this way. */
  gap: number | null;
  /** How much a try that works can do. "none": there is no throw. */
  effect: Effect;
  /** How bad it is if it goes wrong. */
  position: Position;
  /** The trade the line made, if it could be made. */
  traded: Trade | null;
  /** The foe's weaknesses the line uses, each an edge. */
  hurts: string[];
  /** Sure hands: a plain failure works at a cost instead. */
  sure: boolean;
  /** What the seventh stat is called, when the check leans on it. */
  statName?: string;
}

/**
 * Name the check for a read of a line. The stop says how hard each way is; trouble adds a step for each
 * earlier failure; a lever takes one off. Null when that way cannot be tried.
 */
export function nameCheck(m: Moment, read: Read): Check | null {
  if (m.over || !WAYS.includes(read.way)) return null;
  const ability = abilityFor(m, read);
  const why = shut(m, read.way);
  // An ability that opens a way can open one that failed here, or one the stop never offered; never one you cannot pay for.
  const opened = !!why && ability?.does === "open" && (why === "closed" || why === "not_here");
  if (why && !opened) return null;
  const here = m.stop.ways[read.way] ?? { difficulty: 2 as Difficulty, price: read.way === "pay" ? 2 : 0 };
  const allowed = (read.way === "force" && m.attack?.length ? m.attack : WAY_STATS[read.way]).filter((s) => s !== "power" || hasPower(m.sheet));
  const stat = read.stat && allowed.includes(read.stat) ? read.stat : allowed[0]!;
  const lever = m.stop.levers.find((l) => l.id === read.lever && l.way === read.way && leverLeft(m, l)) ?? null;
  const cold = read.way === "talk" && m.sheet.goodwill <= 0;
  const abilityStore = ability?.store ? 1 : 0;
  const pushed = !!read.push && (m.sheet.store ?? 0) >= abilityStore + 1;
  const inspired = read.grade === "inspired" && !m.inspired;
  const warm = read.way === "talk" ? (m.warm ?? 0) : 0;
  const eased = ability && (ability.does === "ease" || ability.does === "sway") ? ability.much : 0;
  const difficulty = clampDifficulty(here.difficulty + m.trouble - (lever ? 1 : 0) + (cold ? 1 : 0) - eased - warm - (pushed ? 1 : 0) - (inspired ? 1 : 0));
  const aid = ability?.does === "aid" ? ability.much : 0;
  const add = Math.min(STAT_MAX + 2, statOf(m.sheet, stat) + aid);
  const target = TARGETS[difficulty];
  const edge = ability?.does === "edge";
  const bane = (m.against ?? []).find((a) => a.way === read.way) ?? null;
  const o = edge && !bane ? d20OddsBest(add, target, PARTIAL) : bane && !edge ? d20OddsWorst(add, target, PARTIAL) : d20Odds(add, target, PARTIAL);
  // Effect and position (effect.ts): what a try that works can do, and how bad it is if it goes wrong.
  const foe = m.stop.foe;
  const hurts = foe && read.line ? hurtsUsed(read.line, foe) : [];
  const edges = hurts.length + (lever?.edge ? 1 : 0) + (m.edges ?? 0);
  const gap = gapOf({ stat: add, gear: m.sheet.gear?.[read.way] ?? 0, edges, help: !!read.help && (m.company ?? 0) > 0 }, foe, read.way);
  const start = positionOf(gap, m.stop.position, !!m.ambush);
  const t = traded(effectOf(gap), start, read.trade);
  const sure = sureHands(statOf(m.sheet, stat));
  // With sure hands only a 1 still fails; every other failure works at a cost.
  const ones = edge && !bane ? 1 / 400 : bane && !edge ? 39 / 400 : 1 / 20;
  const partial = sure ? Math.max(o.partial, 1 - o.success - ones) : o.partial;
  return {
    way: read.way,
    stat,
    add,
    lever,
    difficulty,
    target,
    odds: { success: o.success, partial, fail: Math.max(0, 1 - o.success - partial) },
    costs: WAY_COST[read.way],
    price: read.way === "pay" ? Math.max(0, Math.round(here.price ?? 0)) : 0,
    ...(cold ? { cold } : {}),
    attempt: clip(read.attempt ?? "", ATTEMPT_MAX),
    ability,
    edge,
    bane,
    ward: ability?.does === "ward" ? ability.much : 0,
    slip: ability?.does === "slip",
    opened,
    pushed,
    inspired,
    warm,
    storeCost: abilityStore + (pushed ? 1 : 0),
    gap,
    effect: t.effect,
    position: t.position,
    traded: t.traded,
    hurts,
    sure,
    ...(stat === "power" && m.sheet.powerName ? { statName: m.sheet.powerName } : {}),
  };
}


/** Every way, as it stands now, for the table of ways the screen shows. */
export function options(m: Moment): { way: Way; shut: ReturnType<typeof shut>; check: Check | null }[] {
  return WAYS.map((way) => ({ way, shut: shut(m, way), check: nameCheck(m, { way }) }));
}

/** What a result costs. Paying costs its price when it works; any way costs more when it only half works, and costs something when it fails. */
export function costOf(tier: Tier, price: number): number {
  if (tier === "crit_success") return Math.max(0, price - 1);
  if (tier === "success") return price;
  if (tier === "partial") return price + 1;
  return tier === "fail" ? 1 : 2;
}

export interface Outcome {
  check: Check;
  /** The face the die shows, 1 to 20. Decided here, before the throw is seen. */
  natural: number;
  total: number;
  tier: Tier;
  /** True when you are past the stop. */
  past: boolean;
  /** What was lost, in the way's own kind. `amount` is what the result asks; `lost` is what there was to lose. */
  cost: { kind: CostKind; amount: number; lost: number };
  /** Goodwill won by a result better than anyone hoped for. */
  goodwillWon: number;
  /** Hours that passed: the try itself, and any time the result cost. */
  hours: number;
  /** The way that closed, on a failure. */
  closed: Way | null;
  /** True when no way is left and you are turned back. */
  turnedBack: boolean;
  /** The moment as it stands afterwards. */
  next: Moment;
  /** Both faces, when two dice were thrown (the better kept for an edge, the worse for a mark against you). */
  naturals?: [number, number];
  /** A failure that an ability turned into working at a cost. */
  slipped?: boolean;
  /** How much of the cost an ability kept off. */
  warded?: number;
  /** A failure that sure hands turned into working at a cost. */
  steady?: boolean;
  /** What the try could do, after the die: a 20 raises it a step, never up from none. */
  effect: Effect;
}

/**
 * Throw the die for a read of a line and say what comes of it. The die is seeded by the moment's seed and
 * how many times it has been thrown, so the same moment played the same way gives the same faces.
 */
export function resolve(m: Moment, read: Read): Outcome | null {
  const check = nameCheck(m, read);
  // Effect none: there is no throw (docs/MOONSHOT.md, 2.2). The narrator says what would change the gap instead.
  if (!check || check.effect === "none") return null;
  const first = rollD20(seededRng(`${m.seed}:${m.stop.id}:try:${m.tries}`));
  // An edge keeps the better of two dice, a mark against you the worse; both at once cancel, and one die is thrown.
  const two = check.edge !== !!check.bane;
  const second = two ? rollD20(seededRng(`${m.seed}:${m.stop.id}:try:${m.tries}:edge`)) : 0;
  const natural = !two ? first : check.edge ? Math.max(first, second) : Math.min(first, second);
  const thrown = d20Tier(natural, check.add, check.target, PARTIAL);
  const slipped = check.slip && (thrown === "fail" || thrown === "crit_fail");
  // Sure hands: what you are good at, you do not flub. Only a 1 still fails.
  const steady = !slipped && check.sure && thrown === "fail";
  const tier: Tier = slipped || steady ? "partial" : thrown;
  const past = tier === "crit_success" || tier === "success" || tier === "partial";
  const asked = costByPosition(costOf(tier, check.price), tier, check.position);
  const warded = Math.min(asked, check.ward);
  const amount = asked - warded;

  const sheet: Sheet = { ...m.sheet, stats: { ...m.sheet.stats } };
  if (check.storeCost) sheet.store = Math.max(0, (sheet.store ?? 0) - check.storeCost);
  let lost = amount;
  let hours = TRY_HOURS;
  if (check.costs === "hours") hours += amount;
  else {
    lost = Math.min(sheet[check.costs], amount);
    sheet[check.costs] -= lost;
  }
  sheet.hour += hours;
  const goodwillWon = tier === "crit_success" ? Math.min(1, GOODWILL_MAX - sheet.goodwill) : 0;
  sheet.goodwill += goodwillWon;

  const closed = past || m.stubborn || !m.stop.ways[check.way] ? m.closed : [...m.closed, check.way];
  const after: Moment = {
    ...m,
    sheet,
    closed,
    spent: check.lever ? [...m.spent, check.lever.id] : m.spent,
    trouble: past ? m.trouble : m.trouble + 1,
    tries: m.tries + 1,
    over: past ? "past" : null,
    used: check.ability && check.ability.often !== "always" ? [...(m.used ?? []), check.ability.id] : m.used ?? [],
    warm: (m.warm ?? 0) + (check.ability?.does === "sway" ? check.ability.much : 0),
    inspired: !!m.inspired || check.inspired,
    ...(check.bane ? { against: (m.against ?? []).filter((a) => a.id !== check.bane!.id) } : {}),
  };
  // A way opened by an ability for one try, that failed, is closed again like any other.
  const turnedBack = !past && WAYS.every((w) => shut(after, w));
  const next: Moment = turnedBack ? { ...after, over: "turned_back" } : after;
  return {
    check,
    natural,
    total: natural + check.add,
    tier,
    past,
    cost: { kind: check.costs, amount, lost },
    goodwillWon,
    hours,
    closed: past || m.stubborn || !m.stop.ways[check.way] ? null : check.way,
    turnedBack,
    next,
    ...(two ? { naturals: [first, second] as [number, number] } : {}),
    ...(slipped ? { slipped } : {}),
    ...(steady ? { steady } : {}),
    ...(warded ? { warded } : {}),
    effect: effectAfter(check.effect, tier),
  };
}

/** What the table shows of each way at a moment: open, closed by a failure here, or not there at all ("none"). */
export function wayStates(m: Moment): Record<Way, "open" | "closed" | "none"> {
  return Object.fromEntries(WAYS.map((w) => [w, !m.stop.ways[w] ? "none" : m.closed.includes(w) ? "closed" : "open"])) as Record<Way, "open" | "closed" | "none">;
}
