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
import { d20Odds, d20Tier, rollD20, seededRng } from "./dice.js";

/** The four ways past a stop. */
export type Way = "talk" | "sneak" | "force" | "pay";
/** What a character is good at. Each is a number from 0 to STAT_MAX, added to the die. */
export type Stat = "brawn" | "cunning" | "charm" | "wits";
/** What a way puts at risk. */
export type CostKind = "goodwill" | "hours" | "health" | "supplies";
export type Tier = "crit_success" | "success" | "partial" | "fail" | "crit_fail";
/** 0 easy, 1 fair, 2 hard, 3 very hard. */
export type Difficulty = 0 | 1 | 2 | 3;

export const WAYS: readonly Way[] = ["talk", "sneak", "force", "pay"];
export const STATS: readonly Stat[] = ["brawn", "cunning", "charm", "wits"];
export const STAT_MAX = 4;

/** The stats each way can lean on. The first is the usual one; the others are for a line that plainly goes about it differently. */
export const WAY_STATS: Record<Way, readonly Stat[]> = {
  talk: ["charm", "brawn", "cunning", "wits"],
  sneak: ["cunning", "wits"],
  force: ["brawn"],
  pay: ["wits", "charm"],
};

/** What each way puts at risk. */
export const WAY_COST: Record<Way, CostKind> = { talk: "goodwill", sneak: "hours", force: "health", pay: "supplies" };

/** What the die plus the stat must reach, by difficulty. */
export const TARGETS = [8, 11, 14, 17] as const;
/** Falling short by this much or less still works, at a cost. */
export const PARTIAL = 3;
/** Every try takes this long, whatever comes of it. */
export const TRY_HOURS = 0.5;
export const GOODWILL_MAX = 5;

/** Something in the situation that a line can use. Using one makes its way a step easier, once. */
export interface Lever {
  id: string;
  way: Way;
  /** What it is, in a few words, as the player would call it. */
  name: string;
  /** Words in a line that mean this thing, for reading a line without a model. */
  words?: readonly string[];
}

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
}

/** What the player carries from stop to stop. */
export interface Sheet {
  stats: Record<Stat, number>;
  health: number;
  supplies: number;
  goodwill: number;
  /** Hour of the game's day; it runs past 24 into the next day. */
  hour: number;
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
}

/** What a reader makes of a written line. Anything out of range is put right by `nameCheck`. */
export interface Read {
  way: Way;
  stat?: Stat | null;
  /** The id of a lever the line uses, if any. */
  lever?: string | null;
  /** What is being attempted, in a few words. */
  attempt?: string;
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
const statOf = (sheet: Sheet, stat: Stat): number => Math.max(0, Math.min(STAT_MAX, Math.round(sheet.stats[stat] ?? 0)));

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
}

/**
 * Name the check for a read of a line. The stop says how hard each way is; trouble adds a step for each
 * earlier failure; a lever takes one off. Null when that way cannot be tried.
 */
export function nameCheck(m: Moment, read: Read): Check | null {
  if (m.over || !WAYS.includes(read.way) || shut(m, read.way)) return null;
  const here = m.stop.ways[read.way]!;
  const allowed = WAY_STATS[read.way];
  const stat = read.stat && allowed.includes(read.stat) ? read.stat : allowed[0]!;
  const lever = m.stop.levers.find((l) => l.id === read.lever && l.way === read.way && !m.spent.includes(l.id)) ?? null;
  const cold = read.way === "talk" && m.sheet.goodwill <= 0;
  const difficulty = clampDifficulty(here.difficulty + m.trouble - (lever ? 1 : 0) + (cold ? 1 : 0));
  const add = statOf(m.sheet, stat);
  const target = TARGETS[difficulty];
  const o = d20Odds(add, target, PARTIAL);
  return {
    way: read.way,
    stat,
    add,
    lever,
    difficulty,
    target,
    odds: { success: o.success, partial: o.partial, fail: 1 - o.success - o.partial },
    costs: WAY_COST[read.way],
    price: read.way === "pay" ? Math.max(0, Math.round(here.price ?? 0)) : 0,
    ...(cold ? { cold } : {}),
    attempt: clip(read.attempt ?? "", ATTEMPT_MAX),
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
}

/**
 * Throw the die for a read of a line and say what comes of it. The die is seeded by the moment's seed and
 * how many times it has been thrown, so the same moment played the same way gives the same faces.
 */
export function resolve(m: Moment, read: Read): Outcome | null {
  const check = nameCheck(m, read);
  if (!check) return null;
  const natural = rollD20(seededRng(`${m.seed}:${m.stop.id}:try:${m.tries}`));
  const tier = d20Tier(natural, check.add, check.target, PARTIAL);
  const past = tier === "crit_success" || tier === "success" || tier === "partial";
  const amount = costOf(tier, check.price);

  const sheet: Sheet = { ...m.sheet, stats: { ...m.sheet.stats } };
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

  const closed = past || m.stubborn ? m.closed : [...m.closed, check.way];
  const after: Moment = {
    ...m,
    sheet,
    closed,
    spent: check.lever ? [...m.spent, check.lever.id] : m.spent,
    trouble: past ? m.trouble : m.trouble + 1,
    tries: m.tries + 1,
    over: past ? "past" : null,
  };
  const turnedBack = !past && WAYS.every((w) => shut(after, w));
  const next: Moment = turnedBack ? { ...after, over: "turned_back" } : after;
  return { check, natural, total: natural + check.add, tier, past, cost: { kind: check.costs, amount, lost }, goodwillWon, hours, closed: past || m.stubborn ? null : check.way, turnedBack, next };
}
