/**
 * What a system of the run is (game/systems/*.ts), and what the turn (game/runturn.ts) gives each of them.
 *
 * The turn itself judges a line, rolls, tells the story and reads it back for the sheet and the people. Everything
 * else the game keeps (places, fights, quests, factions, goods, upkeep, events, perks) is a system: it keeps its own
 * state under its own name in the run (engine/run.ts, stateOf), and is given the same few moments of every turn:
 *
 *   seed      a run begins: set up from the card, beside the sheet.
 *   scene     lines added to the scene every model is shown.
 *   plan      beside the judge: read the player's line for what must be settled before the story is told.
 *   claims    what was planned makes the line part of the story (a perk taken, a line that only waits), so it is
 *             told even when the judge took it for a remark to the game.
 *   modifiers the rules' own changes to the roll.
 *   settle    the line is judged and rolled: settle what is this system's (it may change the run) and say what the
 *             storyteller must hold to.
 *   hint      things the storyteller may use this turn if they fit, and may leave.
 *   read      beside the read-back: read the passage for what changed that is this system's.
 *   amend     the turn's own read-back, before it is written down: strike from it what this system already settled
 *             (a thing bought and paid for in `settle` must not be gained and paid for again).
 *   apply     write it down, after the turn's own changes are in. Says what to tell the player.
 *   follow    after that, one system at a time: more may be asked, built, or told (More.narrate).
 *   spare     the character would be brought down: a system may spare them.
 *   pages     the player's own sheets.
 *   shows     what it puts on the table in the room.
 *
 * The same rules hold in every one of them. Code owns every number and every rule; a model reads meaning, chooses
 * among what code allows, and writes; every answer is checked, and one that does not check is asked for once more and
 * then done without. Nothing the player writes is refused: what they write about the world, other people and time is
 * followed, and only what their own character attempts is judged. A system that fails never costs the turn its story.
 *
 * Nothing here imports the turn, so a system can be built and tried on its own.
 */
import { clean, type Judged, type Modifier, type Outcome, type Roll, type Run } from "../engine/run.js";
import { firstJson, type Ask, type Message } from "./ask.js";
import type { Decide } from "./decide.js";

export interface RunDeps {
  ask: Ask;
  decide?: Decide;
  log?: (m: string) => void;
  /** The systems played with; all of them (game/systems/index.ts) when not given. */
  systems?: readonly System[];
}

/** What a run is set up from: a card, the player's character page, and how the card opens (when it says). */
export interface Card {
  world: string;
  who: string;
  name: string;
  first?: string;
  /** The opening is written afresh and short, from the card's own when it has one: for a table where it is said aloud. */
  retell?: boolean;
}

export type Verdict = "trivial" | "challenge" | "implausible" | "missing";

/** A page of the player's sheets. */
export interface Page {
  heading: string;
  his: string[];
}

/** What the read-back of a passage reports for the sheet and the people (game/runturn.ts reads and applies it). */
export interface Readback {
  renamed: { from: string; to: string }[];
  fresh: { name: string; text: string; power: number; hostile: boolean }[];
  hp: { who: string; delta: number }[];
  feelings: { who: string; delta: number }[];
  follows: string[];
  hostile: string[];
  calmed: string[];
  gone: string[];
  /** People known from elsewhere who are in the scene again. */
  back?: string[];
  beaten: string[];
  dead: string[];
  found: { name: string; text: string; quality: string; qty: number; worn?: boolean }[];
  lost: { name: string; qty: number }[];
  money: number;
  ability: { name: string; text: string } | null;
  xp: number;
  place: { name: string; text: string } | null;
  minutes: number;
  /** The time of day the passage ends at, when it says: dawn, morning, noon, afternoon, dusk or night. */
  when?: string;
}

/** A turn once its line is judged and rolled, before the story is told. */
export interface Settling {
  /** What the player wrote. */
  line: string;
  /** "action": their own character attempts something. "story": they only wrote what happens around them. */
  kind: "action" | "story";
  /** The one thing judged, as a short clause; empty for "story". */
  act: string;
  verdict: Verdict | null;
  /** Names as the run has them, or null. */
  target: string | null;
  item: string | null;
  ability: string | null;
  attribute: string;
  skill: string;
  roll: Roll | null;
  /** The outcome rolled, -3 to 3; null when nothing was rolled. */
  outcome: Outcome | null;
}

/** A turn once its story is told. */
export interface Told extends Settling {
  /** The run as it stood before this turn: compare it with the run now to see what the turn changed. */
  before: Run;
  /** The passage told this turn. */
  story: string;
  /** The turn's own read-back, as it was written down; null when the passage could not be read. Not there yet in `read`. */
  core: Readback | null;
  /** Minutes the passage took, as read back; 0 in `read`. */
  minutes: number;
}

/** What `follow` may do besides asking a model itself. */
export interface More {
  /**
   * Have the storyteller tell one more short passage, to a result given the way a turn's result is ("X does this..."):
   * what someone other than the player's character does now. It is added to the turn's story, read back for wounds and
   * the like, and written down. Returns the passage and what changed, or null when no passage came.
   */
  narrate(result: string, words?: string): Promise<{ passage: string; changes: string[] } | null>;
}

/** Something a system puts on the table in the room (game/table.ts shows them; a table that cannot simply does not). */
export type Show =
  /** Known places and the ways between them, and where you are. */
  | { kind: "map"; title: string; places: { id: string; name: string; note?: string; danger?: number; seen: boolean }[]; ways: [string, string][]; at: string }
  /** A card laid on your side to pick up and read: a quest, a ware, a perk, a choice. `line` is what touching it writes for you. */
  | { kind: "card"; id: string; group: string; title: string; text: string; line?: string }
  /** A meter with a name: an encounter's bar, a need, a foe's health. */
  | { kind: "bar"; id: string; group: string; name: string; value: number; max: number; good: "up" | "down" | "none"; note?: string }
  /** A few counters of one kind: saves from a killing blow, days, favours. */
  | { kind: "tokens"; id: string; name: string; count: number; max?: number };

export interface System<P = unknown, R = unknown> {
  readonly name: string;
  seed?(d: RunDeps, r: Run, card: Card): Promise<void>;
  scene?(r: Run): string[];
  plan?(d: RunDeps, r: Run, line: string): Promise<P | null>;
  claims?(r: Run, plan: P | null): boolean;
  modifiers?(r: Run, j: Judged, plan: P | null): Modifier[];
  settle?(r: Run, t: Settling, plan: P | null): string[];
  hint?(r: Run, t: Settling, plan: P | null): string[];
  read?(d: RunDeps, r: Run, t: Told, plan: P | null): Promise<R | null>;
  amend?(r: Run, back: Readback, t: Told, plan: P | null): void;
  apply?(r: Run, read: R | null, t: Told, plan: P | null): string[];
  follow?(d: RunDeps, r: Run, t: Told, more: More, plan: P | null): Promise<string[]>;
  spare?(r: Run, t: Told): string[] | null;
  pages?(r: Run): Page[];
  shows?(r: Run): Show[];
}

/* ------------------------------------------------- reading a model's answer ------------------------------------------------- */

export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** A model's text for a field: a note left unfilled, or anything with markup in it, is no answer. */
export const said = (v: unknown, most: number): string => {
  const t = clean(v, most);
  return /[<>{}]/.test(t) || /^(null|none|n\/a|nothing|nobody|no one)$/i.test(t) ? "" : t;
};
export const int = (v: unknown, lo: number, hi: number, otherwise = 0): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : otherwise;
};
/** A long text cut to its end, or to its start. */
export const tail = (s: string, most: number): string => (s.length > most ? `[…] ${s.slice(-most)}` : s);
export const head = (s: string, most: number): string => (s.length > most ? `${s.slice(0, most)} […]` : s);

/** Ask for JSON and check it; one more try when it cannot be read or does not check. Null when no usable answer comes. */
export async function asked<T>(d: RunDeps, messages: Message[], role: "builder" | "reader", check: (j: Record<string, unknown>) => T | null, what: string): Promise<T | null> {
  for (let i = 0; i < 2; i++) {
    try {
      const j = firstJson(await d.ask(messages, role));
      const got = j ? check(obj(j)) : null;
      if (got) return got;
      d.log?.(`${what}: the answer did not check${i ? "" : ", asking again"}`);
    } catch (e) {
      d.log?.(`${what}: ${(e as Error).message}${i ? "" : ", asking again"}`);
    }
  }
  return null;
}

/** The last of the story, for a system's own questions: the beats kept word for word, newest last. */
export function recentStory(r: Run, beats: number, each: number): string {
  const last = r.beats.slice(-beats).map((b) => `${r.sheet.name}: ${tail(b.you, 700)}\n\nThe story: ${tail(b.story, each)}`);
  return last.length ? last.join("\n\n") : `The story: ${tail(r.opening, each)}`;
}
