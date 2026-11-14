/**
 * How hard the game is (engine/rules.ts), as the player set it in Tallow's drawer tab: kept in this browser, for every
 * story, and read again at every line, so a change counts from the next one written.
 */
import { readRules, type Rules } from "../engine/rules.js";

const KEY = "tallow:rules";

export function loadRules(): Rules {
  try {
    return readRules(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return readRules(null);
  }
}

export function saveRules(r: Rules): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* Not kept: the next visit plays by the usual rules. */
  }
}
