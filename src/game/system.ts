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
 *   sure      what was planned simply happens, so the line is not thrown for (a group's help, called on when it
 *             stands ready).
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
 *   teach     what the narrator explains the first time it comes up.
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
  /** How hard the game is, as the player has it set now (engine/rules.ts): read at every line. The usual rules when not given. */
  rules?: () => unknown;
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
  found: { name: string; text: string; quality: string; qty: number; worn?: boolean; wearable?: boolean }[];
  lost: { name: string; qty: number }[];
  /** Things from Carrying put on or taken in hand ready (on), or taken off or put away (off), in this passage. */
  wear?: { name: string; on: boolean }[];
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

/**
 * A pencilled choice on something of the table: a few words that say what it does, and the line it writes in the
 * notebook. A line that ends in a space is unfinished, for the player to go on with ("I use the rope "). The system
 * writes every line; the room only ever puts it on the pad, and never sends it.
 */
export interface Choice {
  say: string;
  line: string;
}

/*
 * The shapes below are what the table's props are given (room/props). Each carries what the matching screen of the
 * game this one follows shows and lets you do, as far as a system here keeps it; what no system keeps is left out
 * rather than made up, and each shape says so. A prop only ever shows these and writes their lines on the pad.
 */

/** One thing carried, as the satchel lays it out (Show "pack"). */
export interface PackItem {
  /** Stable while the thing is carried: the same thing keeps its tag. */
  id: string;
  name: string;
  /** What it is, in a sentence; "" when nothing is written of it. */
  text: string;
  /** One of engine/run.ts QUALITIES: the room has a colour of wax for each. */
  quality: string;
  qty: number;
  /** Worn or kept ready in hand: set apart from the rest. */
  worn: boolean;
  /** More about it, in a few words, when the game knows it: what it is worth. */
  note?: string;
  /** How it is named inside a line: "the rope". */
  called: string;
  /**
   * What can be written with it. They follow the item menu of the game this one follows, as far as a rule is kept
   * here: use it; put it on (only a thing the model called wearable when it came into being, engine/run.ts
   * Item.wearable) or take it off (any worn thing), neither during a fight, the turn's read-back saying when it is done
   * (src/game/runturn.ts, `wear`); leave it behind; and, while a seller is here, sell it. A worn
   * thing cannot be left behind. (That menu also has salvage: no rule is kept here for taking a thing apart, so
   * nothing offers it.)
   */
  choices: Choice[];
  /** Whether it can be set aside for a making: a thing carried can, a thing worn cannot. */
  makes: boolean;
}

/**
 * How a making is written (Show "pack"): the things set aside for it are named by their `called`, joined by `between`
 * and, before the last, by `last`, with `before` in front and `after` behind, and the line is left unfinished for the
 * player to say what they make: "Out of " + "the rope" + " and " + "the hook" + " I make ". Left as it is and sent, it
 * leaves what comes of them to the game; named, it asks for that thing, and the game judges whether these would make
 * it (systems/goods.ts). (The game this follows also has recipes, and a cost in coin for a free making at some
 * difficulties: neither is kept here.)
 */
export interface Making {
  /** The pencilled choice on a thing that sets it aside with the others to be made into something. */
  say: string;
  before: string;
  between: string;
  last: string;
  after: string;
  /** The most things one making takes. */
  most: number;
  /** Where it is made, when the place you are in has something made for making: "at the forge". */
  at?: string;
}

/** The line a making writes on the pad for these things, by how they are called: "" for none. */
export function makingLine(m: Making, called: readonly string[]): string {
  if (!called.length) return "";
  const names = called.length === 1 ? called[0]! : `${called.slice(0, -1).join(m.between)}${m.last}${called[called.length - 1]!}`;
  return `${m.before}${names}${m.after}`;
}

/** One thing a seller has (Show "stall"). */
export interface StallWare {
  /** Stable while the seller has it: the same ware keeps its place on the cloth. */
  id: string;
  name: string;
  text: string;
  /** One of engine/run.ts QUALITIES: the room has a colour of wax for each. */
  quality: string;
  /** How many are left. */
  qty: number;
  /** What one costs you now, in the world's coin. */
  price: number;
  /** How many of it your coin pays for now, at most as many as are left: 0 when you cannot afford one. */
  can: number;
  /** One line the game writes about it: the price against your coin (how a haggle goes is in the haggle choice's words). */
  note: string;
  /**
   * What can be written to buy it: one; where there are several, a line left for the player to finish with how many
   * (the screen this follows asks how many); and a haggle over it. Offered whether or not it can be afforded.
   */
  choices: Choice[];
}

/**
 * Someone fighting you (Show "fight"): here and able to fight, or brought down in this fight and lying where they fell.
 */
export interface FightFoe {
  /** Stable while they are in the fight: the same foe keeps their piece. */
  id: string;
  name: string;
  /** What is known of them, in a sentence; "" when nothing is. */
  text: string;
  hp: number;
  max: number;
  /** Their power, 1 (a weakling) to 7 (among the strongest there are). */
  tier: number;
  /** How strong they are against you, -3 (far weaker) to 3 (far stronger). */
  step: number;
  /** How they stand, in a line: their health, their power and how it compares with yours; or that they are beaten or dead. */
  odds: string;
  /** Brought down in this fight: beaten or dead, with no health left. */
  down: boolean;
  /**
   * What can be written with them: the same few for every foe, none for one brought down. They follow what the game
   * this one follows lets you do with someone in an encounter: attack them, speak to them, use something on them.
   * Each line is left open for the player to finish. (The older screen of that game also had a button to run away;
   * its present one has none, so nothing here offers it: the player writes it.)
   */
  choices: Choice[];
}

/** Someone else on the mat who is not fighting you (Show "fight"): on one of a contest's sides, or going with you. */
export interface FightOther {
  id: string;
  name: string;
  text: string;
  /** The side they are on, by its name; "" when the fight has no sides. */
  side: string;
  /** With you, against you (though not fighting you), or neither. */
  stance: "yours" | "against" | "other";
  tier: number;
  step: number;
  /** Where they stand, in a line: whose side, their power and how it compares with yours. */
  odds: string;
  /** What can be written with them: speak to them, use something on them. */
  choices: Choice[];
}

/** One meter of a contest (Show "fight"): where it stands, which way is good for you, and what its ends mean. */
export interface FightMeasure {
  id: string;
  name: string;
  value: number;
  max: number;
  good: "up" | "down";
  /** What it means for you when it fills, and when it empties. */
  atFull: "win" | "lose" | "none";
  atEmpty: "win" | "lose" | "none";
  /** Where it stands and what its ends mean, in a few words: "4 of 12. Full, you win. Empty, you lose." */
  note: string;
}

/** One task of a quest (Show "quests"). */
export interface QuestTask {
  id: string;
  /** What to do. */
  text: string;
  /**
   * Where it stands (engine/quests.ts, status): "open" it can be tried now; "waiting" tasks it waits on are still to do,
   * though nothing stops the story doing it outright; "blocked" it is out of reach until enough of them are done;
   * "done"; "closed" made pointless or impossible.
   */
  state: "open" | "waiting" | "blocked" | "done" | "closed";
  /** Where it stands, in words, as the game this follows labels each task of a quest ("can be done now"). */
  note: string;
  /** The aim of the whole quest. */
  main: boolean;
  /** How far along it is, for a task that is counted: "2 of 5". */
  progress?: string;
  /** Why it was closed. */
  why?: string;
  /** The ids of the tasks it waits on: the ones that come before it, shown beneath it. */
  needs: string[];
  /** Lines that take it up, when it can be taken up (none for a task done or closed): for the player to change or send. */
  choices: Choice[];
}

/**
 * One kind of help a group gives a friend who calls on it (Show "standing"), after the faction actions of the game this
 * one follows: what it is called, what it does, the standing it needs, and the line that calls for it. `state` says in
 * a few words where it stands ("ready", "at standing 60", "ready in 3 turns"); `open` is true when it is ready and the
 * standing is there. The line is offered whatever the state: a call the group will not answer yet is answered by the story.
 */
export interface GroupAid {
  say: string;
  text: string;
  need: number;
  state: string;
  open: boolean;
  line: string;
}

/**
 * One perk of a perk tree, as the character board shows it (Show "self"). A tree's perks come with its first perk
 * first and each after the one above it (`parent`, by id; null for the first), `depth` counting how far down it sits.
 * `state`: "learned"; "reach", it could be learned now if there is a point for it; "far", the one above it is not
 * learned yet. `active` is true for a learned perk that is in use. `note` says where it stands in a sentence, and
 * `choices` hold the one line that can be written with it now: to learn it (a perk within reach, while there is a
 * point), to make it active (a learned one, while fewer than the most are), or to make it inactive (an active one).
 */
export interface SelfPerk {
  id: string;
  name: string;
  text: string;
  parent: string | null;
  depth: number;
  state: "learned" | "reach" | "far";
  active: boolean;
  note: string;
  choices: Choice[];
}

/** Something a system puts on the table in the room (game/table.ts shows them; a table that cannot simply does not). */
export type Show =
  /** Known places and the ways between them, and where you are. */
  | { kind: "map"; title: string; places: { id: string; name: string; note?: string; danger?: number; seen: boolean }[]; ways: [string, string][]; at: string }
  /** A card laid on your side to pick up and read: a one-off choice, a contest's line, a perk on offer. `line` is what touching it writes for you. */
  | { kind: "card"; id: string; group: string; title: string; text: string; line?: string; /** Which of the deck's pictures it is drawn with (engine/cards.ts, a kind's id), where the game picked one; otherwise its group's own. */ face?: string }
  /** A meter with a name: an encounter's bar, a need. */
  | { kind: "bar"; id: string; group: string; name: string; value: number; max: number; good: "up" | "down" | "none"; note?: string }
  /** A few counters of one kind: days, favours. */
  | { kind: "tokens"; id: string; name: string; count: number; max?: number }
  /**
   * What you carry and your coin: your satchel and its purse (room/props/pack.ts; the goods system gives it).
   * `money` of `coin` ("silver") is in the purse; `notes` are written by it (what a coin buys, what you owe).
   * `making` is there when things can be made out of other things; `sellTo` names a seller who is here.
   */
  | { kind: "pack"; items: PackItem[]; money: number; coin: string; notes: string[]; making?: Making; sellTo?: string }
  /**
   * A seller who is here, and what they have: the seller's cloth, laid out on the narrator's side (room/props/stall.ts).
   * One for each seller who will deal. `text` is who the seller is. `coin` names the world's coin and `money` is what
   * you have of it; `purse` is what the seller has on hand to buy from you with; `restock` is how many minutes of the
   * story are left until they have their full stock and purse again; `about` says the purse and the restock in the
   * game's words. Buying is a ware's own choices; selling them something of yours is done from the satchel (Show
   * "pack", sellTo). (The screen this follows has no bargaining; this game's goods system lets a price be haggled over,
   * by the throw, and a ware offers it, as a deliberate difference.)
   */
  | { kind: "stall"; id: string; seller: string; text: string; wares: StallWare[]; coin: string; money: number; purse: number; restock: number; about: string }
  /**
   * A fight or any other contest that is on: the ring (room/props/ring.ts; the fight system gives it, ringShow).
   * `name` is the contest's own name, or what a plain fight is called; `text` says how it stands in a sentence or two
   * (how hard a contest is for you, and who is on which side). `foes` are those fighting you, each with their health,
   * and those of them brought down in this fight; `others` are everyone else on the mat: the rest of a contest's
   * sides and anyone who goes with you. `sides` are a contest's parties by name (at most four, five to a side), each
   * yours, against you, or neither; your own character is not listed among the members. `measures` are its meters
   * (at most three). `lines` are a few ways to go about it that the game offers, at most five and never needed: a
   * contest's own, then the line that attacks each foe. `you` is your own health, with a line about it; `saves` are
   * your saves from a killing blow, where the rules have them. (The screen this follows shows no health for each foe
   * and has no button to flee: a foe's health is kept here and was always shown, so it stays; fleeing is something
   * the player writes. Its bars can also carry a named state past a threshold, and an encounter can have end states of
   * several bars at once: neither is kept here.)
   */
  | {
      kind: "fight";
      name: string;
      text: string;
      foes: FightFoe[];
      others: FightOther[];
      sides: { name: string; stance: "yours" | "against" | "other"; members: string[] }[];
      measures: FightMeasure[];
      lines: Choice[];
      you: { name: string; hp: number; max: number; text: string };
      saves?: { count: number; max: number };
    }
  /**
   * Your quests, each with its tasks: the quest board (room/props/board.ts). Those still open come first, then the
   * ones that have ended, the latest first, with how in words (`end`) and no tasks. `from` says who asked it ("asked
   * by Maren"), "" when nobody did; `fresh` is a quest begun on the turn just played. An open quest's tasks come as a
   * tree read from the top: the task done last first, then each task's `needs` (the ones that come before it) after
   * it, depth first; what lay beneath a task done or closed is left out. `own` is the line that sets yourself a quest
   * of your own (the screen this follows has a button that adds one). (That screen also sorts quests into main and
   * side, lets one be followed at a time, and deletes one: none of that is kept here.)
   */
  | {
      kind: "quests";
      quests: { id: string; title: string; text: string; from: string; state: "open" | "done" | "lost" | "dropped"; end?: string; fresh: boolean; tasks: QuestTask[] }[];
      own: Choice;
    }
  /**
   * Who you are: the character board (room/props/self.ts; the perks system gives it, selfShow). `xp` is what you have
   * toward the next level and what it takes. `points` are attribute points still to place, with `toPlace` saying so;
   * while there are any, each attribute's `choices` hold the line that puts one there and its `note` says how many
   * there are and that a point placed is not taken back. `text` says what an attribute is for. A skill's `xp` is what it has toward its next level and what that
   * takes ([0, 0] at the most a skill can be), and `note` says the same in words. An ability's `rank` is basic, strong,
   * epic or learned; it rests for `wait` more turns after use (0 when ready), `note` says which, and while it is ready
   * `choices` hold a line begun that calls on it. `perks` are the perk trees (SelfPerk): `points` to spend, how many
   * are `active` of the `most` that may be, `note` saying both (or that the trees are not written yet, when `trees`
   * is empty), and `old`, the perks of the kind that was offered before the trees, in a run that still holds some.
   * (The screens this follows also show damage and protection as numbers, points to spend on skills, a way to drop a
   * skill, the odds an attribute or a skill gives, and for the perks a way to undo them all or have them written
   * again for a currency: none of that is kept here.)
   */
  | {
      kind: "self";
      name: string;
      calling: string;
      level: number;
      xp: [number, number];
      hp: [number, number];
      attributes: { id: string; name: string; score: number; text: string; note: string; choices: Choice[] }[];
      points: number;
      toPlace?: string;
      skills: { name: string; level: number; most: number; xp: [number, number]; note: string }[];
      abilities: { name: string; text: string; rank: string; wait: number; note: string; choices: Choice[] }[];
      perks: { points: number; active: number; most: number; note: string; trees: { id: string; name: string; perks: SelfPerk[] }[]; old: { name: string; text: string; note: string }[] };
    }
  /**
   * The groups you are known to and how you stand with each: the faction rack (room/props/rack.ts). `ladder` is the
   * nine steps of standing from the foot up, each with the least standing on it; a group's `standing` runs from `least`
   * to `most`, `step` is the step of the ladder it is on and `label` that step's name; `tone` is whether it is for you,
   * against you or neither. `holds` are the places it holds, `here` names its people who are with you now, and `notes`
   * say both (and anything more) in a line each. `aid` is what it gives a friend who calls on it, the least first
   * (none when none was written). (The screen this follows also shows an icon and colour chosen for each group, which
   * the rack picks from the group's id, and a picture made for it, which is not kept here.)
   */
  | {
      kind: "standing";
      ladder: { name: string; from: number }[];
      groups: {
        id: string;
        name: string;
        text: string;
        standing: number;
        least: number;
        most: number;
        step: number;
        label: string;
        tone: "for" | "against" | "neutral";
        notes: string[];
        holds: string[];
        here: string[];
        aid: GroupAid[];
      }[];
    };

/** One thing a system can teach, said once in a run by the narrator the first time it comes up (System.teach). */
export interface Lesson {
  /** What it is about, by a short name: taught once under it (the run keeps the names: engine/run.ts, taught). */
  key: string;
  /** Two or three short lines in the narrator's voice. */
  lines: string[];
}

export interface System<P = unknown, R = unknown> {
  readonly name: string;
  seed?(d: RunDeps, r: Run, card: Card): Promise<void>;
  scene?(r: Run): string[];
  plan?(d: RunDeps, r: Run, line: string): Promise<P | null>;
  claims?(r: Run, plan: P | null): boolean;
  sure?(r: Run, plan: P | null): boolean;
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
  /**
   * What could be taught now, as the run stands: a mechanic that has come up (something is carried, a fight is on).
   * Fixed words. The sitting says at most one lesson after a turn, each once in a run (game/runturn.ts, lessonOf).
   */
  teach?(r: Run): Lesson[];
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
/** A short text as a sentence of its own: closed with a full stop when it has no ending of its own; "" stays "". */
export const sentence = (s: string): string => {
  const t = s.trim();
  return !t || /[.!?…"')\]]$/.test(t) ? t : `${t}.`;
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
