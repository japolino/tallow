/**
 * A check on the scale. The table shows a check with no numbers: the narrator
 * loads one pan for how hard the thing is, weights go in your pan for the
 * stat you are leaning on and for anything in the scene your line uses, and
 * the way the beam tips is your chance.
 *
 * The weights say why; the tilt says how much. The tilt is taken from the
 * real odds (src/engine/moment.ts), never from counting the weights, so the
 * scale cannot promise something the die will not keep.
 */
import type { Check } from "./moment.js";

export interface Weighing {
  /** The narrator's weights: one for easy, up to four for very hard, and one more that the thing you use cancels. */
  his: number;
  /** Your small weights: one for each point of the stat being tested. */
  yours: number;
  /** True when something in the scene is on your side: one large weight in your pan. */
  lever: boolean;
  /**
   * Which way the beam tips, -1 to 1. Above 0 your pan is the heavy one: you are more likely than not to get
   * past cleanly. Below 0 the narrator's is. 0 is an even chance.
   */
  lean: number;
}

/**
 * The chance the scale shows: getting past cleanly counts in full, getting past at a cost counts as half.
 * Exported so the tests can hold the tilt to it.
 */
export const fairChance = (c: Check): number => c.odds.success + c.odds.partial / 2;

export function weigh(c: Check): Weighing {
  const lever = !!c.lever;
  return {
    his: c.difficulty + 1 + (lever ? 1 : 0),
    yours: c.add,
    lever,
    lean: Math.max(-1, Math.min(1, (fairChance(c) - 0.5) * 2)),
  };
}
