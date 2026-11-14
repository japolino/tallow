/**
 * How hard the game is, as the player sets it (Tallow's drawer tab). Chosen once and kept for every story; a change
 * counts from the next line written. The usual rules are the game as it was before there was anything to choose.
 *
 *   dice      how the one roll of a judged action is drawn: more dice summed is less luck, so who the character is
 *             and how the line was judged count for more. "none" is no luck at all: every roll is the middle.
 *   hardship  added to every roll: kind +20, even nothing, harsh -15 (in hundredths of the roll).
 *   fall      what being brought down costs: you come round hurt; you come round and most of what you carried is
 *             gone; or the story ends there.
 *   saves     whether a blow that would bring you down is taken by a save from a killing blow first.
 *   refuse    whether a thing that cannot work, or that needs what you do not have, is refused. When not, it is
 *             rolled like any other try, with the judge's doubts counted against it.
 *
 * Nothing here is a model's to decide: these are numbers and rules.
 */
export const DICE = ["1d100", "2d50", "4d25", "10d10", "25d4", "50d2", "none"] as const;
export type Dice = (typeof DICE)[number];
export const HARDSHIPS = ["kind", "even", "harsh"] as const;
export type Hardship = (typeof HARDSHIPS)[number];
export const FALLS = ["wake", "lose", "end"] as const;
export type Fall = (typeof FALLS)[number];

export interface Rules {
  dice: Dice;
  hardship: Hardship;
  fall: Fall;
  saves: boolean;
  refuse: boolean;
}

export const USUAL: Rules = { dice: "4d25", hardship: "even", fall: "wake", saves: true, refuse: true };

/** Rules from anything kept or sent: whatever is not one of the choices is the usual one. */
export function readRules(v: unknown): Rules {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const one = <T extends string>(all: readonly T[], x: unknown, usual: T): T => (all.includes(x as T) ? (x as T) : usual);
  return {
    dice: one(DICE, o.dice, USUAL.dice),
    hardship: one(HARDSHIPS, o.hardship, USUAL.hardship),
    fall: one(FALLS, o.fall, USUAL.fall),
    saves: typeof o.saves === "boolean" ? o.saves : USUAL.saves,
    refuse: typeof o.refuse === "boolean" ? o.refuse : USUAL.refuse,
  };
}

/** How many draws make a roll and what each is worth at most; none for no luck. */
export function drawsOf(d: Dice): { n: number; each: number } {
  if (d === "none") return { n: 0, each: 0 };
  const n = Number(d.slice(0, d.indexOf("d")));
  return { n, each: 1 / n };
}

/** What each hardship adds to every roll, in hundredths. */
export const HARDSHIP_BY: Record<Hardship, number> = { kind: 20, even: 0, harsh: -15 };

/** The share of what is carried (not worn) that is gone after a fall, when a fall costs that. */
export const LOST_SHARE = 0.7;
