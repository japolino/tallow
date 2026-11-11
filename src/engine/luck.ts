/**
 * The narrator's die (docs/SYSTEMS.md, 7): pure luck, no stat. When you ask whether something is there or is so ("is
 * there a boat at the jetty?"), and nothing at the place already settles it, the narrator throws its own die: LUCK_YES
 * or more is yes. A yes is a fact laid on the table at this place, to lean on once (a step easier for the way it
 * helps); a no is only a no. Once a place, so asking again and again cannot fish for a yes.
 *
 * Whether a question is one for luck, and what it would be if so, is read by a model or by the rules below. Code
 * throws the die and decides what a yes is worth. Pure and seeded.
 */
import { rollD20, seededRng } from "./dice.js";
import { WAYS, type Lever, type Way } from "./moment.js";
import { markWords, type Trip } from "./adventure.js";

/** The narrator's die says yes on this or more: one throw in two. */
export const LUCK_YES = 11;
/** The longest a fact is kept, in letters. */
const FACT_MAX = 60;

/** A question for luck, as read: what would be so if the answer is yes, and which way it would help. */
export interface LuckAsk {
  fact: string;
  way: Way;
}

export interface Luck {
  natural: number;
  yes: boolean;
  /** The fact laid on the table, on a yes. */
  mark: Lever | null;
}

/** A fact fit to write on a slip: one line, no quotes, lower case first, not too long. */
export function cleanFact(s: unknown): string {
  if (typeof s !== "string") return "";
  const t = s.replace(/["“”*_#`?]/g, "").replace(/\s+/g, " ").trim().replace(/[.!,;:]+$/, "");
  const c = t.length > FACT_MAX ? t.slice(0, FACT_MAX).replace(/\s+\S*$/, "") : t;
  return c.charAt(0).toLowerCase() + c.slice(1);
}

/** Whether the narrator may still throw its die at the place in your way: once a place, and only with a way still open. */
export function canLuck(t: Trip): boolean {
  const m = t.facing?.moment;
  return !!m && !t.over && !m.lucked && WAYS.some((w) => m.stop.ways[w] && !m.closed.includes(w));
}

/**
 * The narrator throws its die for a question. A yes puts the fact on the table here, for the way it helps (or, if
 * that way is shut here, the easiest one open). Null when it may not throw here.
 */
export function throwLuck(t: Trip, ask: LuckAsk): { trip: Trip; luck: Luck } | null {
  const f = t.facing;
  if (!f || !canLuck(t)) return null;
  const m = f.moment;
  const natural = rollD20(seededRng(`${t.seed}:luck:${f.stop.id}`));
  const yes = natural >= LUCK_YES;
  const open = WAYS.filter((w) => m.stop.ways[w] && !m.closed.includes(w)).sort((a, b) => m.stop.ways[a]!.difficulty - m.stop.ways[b]!.difficulty);
  const way = open.includes(ask.way) ? ask.way : open[0]!;
  const name = cleanFact(ask.fact) || "a stroke of luck";
  const mark: Lever | null = yes ? { id: `luck:${f.stop.id}`, way, name, words: markWords(name), mark: true } : null;
  const moment = { ...m, lucked: true, ...(mark ? { stop: { ...m.stop, levers: [...m.stop.levers, mark] } } : {}) };
  return { trip: { ...t, facing: { ...f, moment } }, luck: { natural, yes, mark } };
}

/**
 * Whether a line asks luck something, read by rules: "is there a boat at the jetty?", "are there any guards asleep?",
 * "could there be a back door?". The fact is what would be so. Null for any other line.
 */
export function luckRead(line: string): string | null {
  const l = line.trim().replace(/\s+/g, " ");
  const m = /^(?:(?:and|so|but|well),?\s+)?(?:is there|are there|was there|were there|could there be|might there be|would there be|maybe there(?:'s| is| are))\s+(.+?)\s*\??$/i.exec(l);
  if (!m) return null;
  const fact = cleanFact(m[1]!.replace(/^any\s+/i, "some "));
  return fact.length >= 3 ? fact : null;
}
