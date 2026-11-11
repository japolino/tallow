/**
 * Effect and position (docs/MOONSHOT.md, 2): who you are decides what a try can do; the die decides how it goes.
 *
 * Every try has two answers. The die says how it goes (works better than hoped, works, works at a cost, fails). The
 * *effect* says how much a try that works can do, and comes from the story: the gap between your side (the stat the
 * try leans on, your gear, the edges you have, a friend's help) and theirs (their rating at this kind of thing, and how
 * much bigger they are). The *position* says how bad it is if it goes wrong.
 *
 * Two rules keep it honest:
 *   - A 20 raises the effect one step, but never up from none: a perfect throw can make a good try brilliant, never an
 *     impossible one possible.
 *   - None is never a dead end. There is no throw; the narrator says what would change the gap.
 *
 * Code decides all of it. A model only names what a foe is good at and hurt by, from fixed lists, and words it.
 * Pure: facts in, an answer out.
 */
import type { Tier, Way } from "./moment.js";

/** How much a try that works can do. */
export type Effect = "none" | "limited" | "standard" | "great" | "overwhelming";
export const EFFECTS: readonly Effect[] = ["none", "limited", "standard", "great", "overwhelming"];

/** How bad it is if it goes wrong. */
export type Position = "controlled" | "risky" | "desperate";
export const POSITIONS: readonly Position[] = ["controlled", "risky", "desperate"];

/** How big a side is: each step of scale between you and what you face is one on the gap (docs/MOONSHOT.md, 7.4). */
export type Scale = "person" | "squad" | "vehicle" | "ship" | "army";
export const SCALES: readonly Scale[] = ["person", "squad", "vehicle", "ship", "army"];

/** The most a rating can be: a foe's rating at one kind of thing, 0 (helpless) to 6 (the best there is). */
export const RATING_MAX = 6;

/**
 * Who stands against you at a place, as a short record (docs/MOONSHOT.md, 2.5). A stop with no foe has standard effect
 * on every try, as it always had.
 */
export interface Foe {
  name?: string;
  /** How good they are at each kind of thing tried against them, 0 to RATING_MAX. A way not given is not rated: standard. */
  ratings: Partial<Record<Way, number>>;
  /** The kinds of thing they are hurt by, as short tags ("fire", "holy", "flanking"): each one a line uses is an edge. */
  hurtBy?: readonly string[];
  /** How big they are. A person when not said. */
  scale?: Scale;
  /** In a contest, the share of their dial at which they break: run, give up, withdraw. 1 (fight to the end) when not said. */
  breaks?: number;
}

/** Gear on the ladder (docs/MOONSHOT.md, 7.4): nothing fit for it, plain, made for it, and (rare, with a price) the best there is. */
export type Gear = -1 | 0 | 1 | 2;
export const GEAR_MAX = 2;

/** Everything on your side of the gap, as code has counted it. */
export interface Side {
  /** The stat the try leans on, with any companion's help already in it. */
  stat: number;
  /** Your gear for this try. Plain when not said. */
  gear?: Gear;
  /** Edges you have: a lever made into an edge, a weakness you know, the high ground, a key. Each is +1. */
  edges?: number;
  /** Another player or a companion sets it up: +1. */
  help?: boolean;
  /** How big you are. A person when not said. */
  scale?: Scale;
}

/** The gap: your side less theirs. Null when the foe is not rated at this kind of thing (standard effect). */
export function gapOf(side: Side, foe: Foe | null | undefined, way: Way): number | null {
  const rating = foe?.ratings[way];
  if (rating === undefined || rating === null || !Number.isFinite(rating)) return null;
  const theirs = Math.max(0, Math.min(RATING_MAX, Math.round(rating)));
  const gear = Math.max(-1, Math.min(GEAR_MAX, Math.round(side.gear ?? 0)));
  const scale = SCALES.indexOf(side.scale ?? "person") - SCALES.indexOf(foe?.scale ?? "person");
  return Math.round(side.stat) + gear + Math.max(0, Math.round(side.edges ?? 0)) + (side.help ? 1 : 0) + scale - theirs;
}

/** The effect a gap gives: −3 or worse none, −2 limited, −1 to +1 standard, +2 great, +3 or more overwhelming. */
export function effectOf(gap: number | null): Effect {
  if (gap === null) return "standard";
  if (gap <= -3) return "none";
  if (gap === -2) return "limited";
  if (gap <= 1) return "standard";
  return gap === 2 ? "great" : "overwhelming";
}

/** One step up or down the ladder of effect, never past its ends. */
export const shiftEffect = (e: Effect, by: number): Effect => EFFECTS[Math.max(0, Math.min(EFFECTS.length - 1, EFFECTS.indexOf(e) + by))]!;
export const shiftPosition = (p: Position, by: number): Position => POSITIONS[Math.max(0, Math.min(POSITIONS.length - 1, POSITIONS.indexOf(p) + by))]!;

/**
 * Trading one for the other (docs/MOONSHOT.md, 2.3). "bold": a step worse position for a step better effect. "careful":
 * the reverse. Never up from none, and never a trade that cannot be paid (bold when already desperate, careful when
 * already controlled, or careful when it would leave the effect at none).
 */
export type Trade = "bold" | "careful";
export function traded(effect: Effect, position: Position, trade: Trade | null | undefined): { effect: Effect; position: Position; traded: Trade | null } {
  if (!trade || effect === "none") return { effect, position, traded: null };
  if (trade === "bold" && position !== "desperate" && effect !== "overwhelming") return { effect: shiftEffect(effect, 1), position: shiftPosition(position, 1), traded: "bold" };
  if (trade === "careful" && position !== "controlled" && effect !== "limited") return { effect: shiftEffect(effect, -1), position: shiftPosition(position, -1), traded: "careful" };
  return { effect, position, traded: null };
}

/** The effect after the die: a 20 raises it one step, but never up from none. */
export function effectAfter(effect: Effect, tier: Tier): Effect {
  return tier === "crit_success" && effect !== "none" ? shiftEffect(effect, 1) : effect;
}

/** Notches a try that works puts on a dial, by its effect (docs/MOONSHOT.md, 2.2). Overwhelming fills whatever is left. */
export const EFFECT_NOTCHES: Record<Effect, number> = { none: 0, limited: 1, standard: 2, great: 3, overwhelming: 99 };

/**
 * The position a try starts in, before any trade: desperate when badly outmatched, controlled when you hold the upper
 * hand (a gap of +2 or better, or an ambush laid), risky otherwise. A stop may set its own.
 */
export function positionOf(gap: number | null, set?: Position, ambush = false): Position {
  if (set) return set;
  if (ambush) return "controlled";
  if (gap === null) return "risky";
  if (gap <= -2) return "desperate";
  return gap >= 2 ? "controlled" : "risky";
}

/** How much worse (or lighter) a cost or a blow is by position: one lighter when controlled, one worse when desperate. */
export const POSITION_COST: Record<Position, number> = { controlled: -1, risky: 0, desperate: 1 };

/** A cost or a blow, by position. A controlled position never makes a cost that was asked into nothing on a failure. */
export function costByPosition(amount: number, tier: Tier, position: Position): number {
  if (tier === "crit_success" || tier === "success") return amount;
  const by = POSITION_COST[position];
  const floor = tier === "partial" ? 0 : 1;
  return Math.max(amount > 0 ? Math.min(amount, floor) : 0, amount + by);
}

/** Sure hands (docs/MOONSHOT.md, 2.4): with this much in the stat a try leans on, a plain failure works at a cost instead. */
export const SURE_HANDS = 3;
export const sureHands = (stat: number): boolean => Math.round(stat) >= SURE_HANDS;

/** Words a line might use for the kinds of thing a foe can be hurt by, so code can check what a line really uses. */
export const HURT_WORDS: Record<string, readonly string[]> = {
  fire: ["fire", "flame", "flames", "burn", "burning", "torch", "lamp", "oil", "brand", "blaze"],
  holy: ["holy", "blessed", "prayer", "pray", "sacred", "relic", "sign", "abbey", "saint", "god"],
  silver: ["silver"],
  iron: ["iron", "cold iron"],
  water: ["water", "river", "flood", "drown", "rain"],
  light: ["light", "sun", "sunlight", "dawn", "mirror"],
  noise: ["noise", "bell", "drum", "shout", "horn", "scream"],
  height: ["high ground", "above", "roof", "balcony", "ledge", "stairs"],
  numbers: ["together", "all of us", "surround", "flank", "flanking", "both of us"],
  name: ["true name", "name"],
  ion: ["ion", "emp", "pulse"],
  praise: ["praise", "compliment", "admire", "flatter", "beautiful"],
};

/** Which of a foe's weaknesses a line uses, by its words. Only those the foe has count. */
export function hurtsUsed(line: string, foe: Foe | null | undefined): string[] {
  const l = ` ${line.toLowerCase()} `;
  return (foe?.hurtBy ?? []).filter((tag) => {
    const words = HURT_WORDS[tag] ?? [tag];
    return words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(l));
  });
}

/** The rating a road's foe gets at a way, from how hard that way is there: forcing a foe is harder to do well than slipping by it. */
export function ratingFor(way: Way, difficulty: number): number {
  return Math.max(0, Math.min(RATING_MAX, Math.round(difficulty) + (way === "force" ? 1 : 0)));
}

/**
 * Two or three things that would change the gap, for "you can't, but you could" (docs/MOONSHOT.md, 2.2). Code picks;
 * the narrator says them. `ways` are the other ways still open here, best first.
 */
export function couldInstead(foe: Foe | null | undefined, ways: readonly Way[]): string[] {
  const out: string[] = [];
  const hurt = foe?.hurtBy?.[0];
  if (hurt) out.push(`use something it fears (${hurt})`);
  out.push("get help, or better gear");
  const other = ways.find((w) => w !== "force");
  if (other) out.push(other === "talk" ? "talk instead" : other === "sneak" ? "slip past instead" : "pay your way instead");
  return out.slice(0, 3);
}

/** The words that trade position for effect, read by code from the player's line (docs/MOONSHOT.md, 2.3). */
const BOLD = /\b(all out|go for broke|recklessly|reckless|boldly|whatever it takes|no matter the cost|everything at once|throw caution|full tilt|headlong|all in)\b/;
const CAREFUL = /\b(carefully|careful|cautiously|slowly|patiently|take my time|take our time|play it safe|step by step|bit by bit|quietly test|feel it out)\b/;
export function tradeOf(line: string): Trade | null {
  const l = line.toLowerCase();
  if (BOLD.test(l)) return "bold";
  return CAREFUL.test(l) ? "careful" : null;
}
