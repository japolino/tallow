/**
 * A save (docs/SYSTEMS.md, 7): something comes at you that you did not answer with a try of your own (a stone that
 * slips, the danger in a contest arriving). You throw the die plus your best fitting stat; reach SAVE_TARGET and you
 * keep it off you. A 20 always keeps it off, a 1 never does.
 *
 * Pure and seeded: the face is decided here, before the die is thrown in the room.
 */
import { rollD20, seededRng } from "./dice.js";
import { STAT_MAX, type Sheet, type Stat } from "./moment.js";

/** What a save must reach: a middling throw. */
export const SAVE_TARGET = 12;

export interface Save {
  stat: Stat;
  /** The stat's number, added to the die. */
  add: number;
  target: number;
  /** The face the die shows. */
  natural: number;
  /** It is kept off you. */
  kept: boolean;
}

/** Throw a save with the best of `stats` on this sheet. */
export function throwSave(sheet: Sheet, stats: readonly Stat[], seed: string): Save {
  const stat = [...stats].sort((a, b) => (sheet.stats[b] ?? 0) - (sheet.stats[a] ?? 0))[0]!;
  const add = Math.max(0, Math.min(STAT_MAX + 2, Math.round(sheet.stats[stat] ?? 0)));
  const natural = rollD20(seededRng(seed));
  const kept = natural >= 20 || (natural > 1 && natural + add >= SAVE_TARGET);
  return { stat, add, target: SAVE_TARGET, natural, kept };
}

/** The chance a save keeps it off, for a stat of `add`: counted face by face. */
export function saveOdds(add: number): number {
  let ok = 1;
  for (let f = 2; f <= 19; f++) if (f + add >= SAVE_TARGET) ok++;
  return ok / 20;
}
