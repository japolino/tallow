/**
 * The jobs a model does in the game (docs/DESIGN.md, 2): reading what the player wrote, telling what happened, and
 * answering a question about the scene. None of them decides anything. This file holds the stand-ins used when there
 * is no model: a list of plain words for the reading, fixed lines for the telling, the things in the scene for an
 * answer, and a delay that can be made long on purpose so the table's waits can be looked at.
 */
import type { RouteContext, Routed } from "./route.js";
import type { StoryContext, StoryRouted } from "./storyroute.js";
import type { Ability } from "../engine/abilities.js";
import type { RoadStop, Trip, Use } from "../engine/adventure.js";
import type { Contest, ContestKind, ContestNames, Dial } from "../engine/contest.js";
import type { Moment, Outcome, Read, Tier, Way } from "../engine/moment.js";
import { lookSaid } from "../engine/tell.js";
import type { LineRead, Person } from "../engine/people.js";
import type { ContentSettings } from "../engine/content.js";
import { askLike, rulesReading } from "../meaning/read.js";

/**
 * What a written line comes to: a try (a read), an ability used without a try (a use), a question or a look that
 * tries nothing ("none"), or nothing that can be told (null).
 */
export type Reading = Read | Use | "none" | null;

export const isUse = (r: Reading): r is Use => !!r && typeof r === "object" && "use" in r;

export interface Minds {
  /** What a written line attempts: a read, "none" for a question or a look, or null when it cannot be told. */
  read(line: string, m: Moment): Promise<Reading>;
  /**
   * Tell what happened, in a sentence or three. `note` is what must be true (narratorNote); `more` says the stop is
   * not finished with yet, though this try worked.
   */
  tell(o: Outcome, stop: RoadStop, note: string, more: boolean): Promise<string>;
  /** Answer a question about the scene, or say what a look round finds. It never gets the player past anything. */
  answer(line: string, m: Moment, note?: string): Promise<string>;
  /** When a story is over: what became of everyone afterwards, or null to say nothing more. */
  epilogue?(t: Trip): Promise<string | null>;
  /**
   * Two abilities to choose between at a level-up, written from what the hero did (deeds) and fitted to `room`; an
   * empty list when they cannot be written, and the stock abilities are offered instead.
   */
  offer?(hero: { who: string; calling?: { name: string; line: string } }, have: readonly Ability[], deeds: readonly string[], level: number, room: number, world?: string): Promise<Ability[]>;
  /** Show one of the narrator's moves happening at a place (engine/dread.ts); `note` says what. Empty to say only the rule. */
  move?(m: Moment, note: string): Promise<string>;
  /** Names for a contest (engine/contest.ts): who the player is up against, and a danger. Empty to keep code's names. */
  contest?(m: Moment, kind: ContestKind): Promise<ContestNames>;
  /**
   * Whether a question is one for the narrator's die (engine/luck.ts): what would be so on a yes, and the way it would
   * help. Null when it is not, and the rules (luckRead) are asked instead.
   */
  luck?(line: string, m: Moment): Promise<{ fact: string; way: Way } | null>;
  /** What `foe` is about to do to the player this round of a contest, in a sentence. Empty to say code's line. */
  blow?(m: Moment, c: Contest, foe: Dial): Promise<string>;
  /** Who is at the table, for the telling: told by the director whenever it changes. `content` is what the game allows (content.ts), in a line or two. */
  know?(who: string, company: string[], content?: string): void;
  /** One of the other players speaks (seats.ts): `brief` says who they are and what code chose for them to say. Empty to use code's words. */
  fellow?(brief: string, m: Moment): Promise<string>;
  /**
   * Which of a few answers a text gives to a question (option id to what it means), by meaning, or null when it cannot
   * be told or there is nothing to ask. Missing when there is no model that can say; the rules answer then. `task`
   * says what kind of text it is, when it is not a line written in answer.
   */
  pick?(question: string, text: string, options: Record<string, string>, task?: string): Promise<string | null>;
  /**
   * Free form (engine/free.ts): what happens when the player does something ordinary in the world, or what a place is
   * like when they come to it (`note` says which, and what must be shown). It may bring in small things and people
   * that belong there; it never decides how something risky turns out. Empty when it cannot be written.
   */
  roam?(line: string, m: Moment, note?: string): Promise<string>;
  /**
   * Free form: whether a line calls for the die, because it is risky or opposed (asked of the Decision model when
   * there is one, else the reader model). Null when it cannot be told, and the rules (riskyWords) answer.
   */
  risky?(line: string, m: Moment): Promise<boolean | null>;
  /**
   * Free form: what kind of line it is (game/route.ts): said, a try, going somewhere, a rest, a wait, a goal, work at
   * one, taking on a matter, the notebook, or stopping. The Decision model, else the reader model; null when neither
   * is there or sure, and the word rules decide.
   */
  route?(line: string, ctx: RouteContext): Promise<Routed | null>;
  /**
   * In a story, at the place in your way: what kind of line it is (game/storyroute.ts): a try, said, words to the
   * person here, a look, a question for luck, pressing or reading them, a wait, a goal, the table, giving in. The
   * Decision model, else the reader model; null when neither is there or sure, and the word rows decide.
   */
  storyRoute?(line: string, ctx: StoryContext): Promise<StoryRouted | null>;
  /**
   * How a line said to a person lands (game/hear.ts): its kind, the likes it touches, whether it touches what they
   * want. Null when no model can tell, and the words decide (people.ts, rulesLine).
   */
  hear?(line: string, p: Person): Promise<LineRead | null>;
  /**
   * Whether a line set at the table changes what the story may contain (engine/content.ts), read by meaning: the new
   * settings, "same" when it changes nothing, or null when no model can tell and the words decide (contentFromLine).
   */
  content?(line: string, s: ContentSettings): Promise<ContentSettings | "same" | null>;
}

/**
 * A question answered by meaning first (`minds.pick`), and by the rules when that cannot tell. `wait` hides the
 * wait in the room (the narrator reads what you wrote).
 */
export async function pickBy<K extends string>(minds: Minds, question: string, line: string, options: Record<K, string>, rules: () => NoInfer<K> | null, wait?: <T>(p: Promise<T>) => Promise<T>): Promise<K | null> {
  if (minds.pick) {
    const asked = minds.pick(question, line, options).catch(() => null);
    const got = await (wait ? wait(asked) : asked);
    if (got && got in options) return got as K;
  }
  return rules();
}

const after = <T>(ms: number, v: T): Promise<T> => (ms > 0 ? new Promise((done) => setTimeout(() => done(v), ms)) : Promise.resolve(v));

type Said = "won" | "more" | "cost" | "fail" | "bad";
const KIND: Record<Tier, Said> = { crit_success: "won", success: "won", partial: "cost", fail: "fail", crit_fail: "bad" };

/** Plain lines for each way and result, for when no model tells it. `{at}` is the stop's name. */
const LINES: Record<Said, Record<string, string>> = {
  won: {
    talk: "Your words land. At {at}, the way opens for you.",
    sneak: "Nobody sees you go. {at} is behind you before anyone thinks to look.",
    force: "You go straight at it, and it gives. {at} is behind you.",
    pay: "The price is taken, and the way at {at} opens.",
  },
  more: {
    talk: "That lands, and it buys you ground. It is not over yet.",
    sneak: "You get that far unseen. There is further to go.",
    force: "That one goes down. It is not over.",
    pay: "That much is accepted. More is wanted.",
  },
  cost: {
    talk: "You are let by, but not gladly, and it will be remembered.",
    sneak: "You get by, but slowly, a hand's breadth at a time.",
    force: "You get through, and you are hurt doing it.",
    pay: "It costs more than it should have, but you are through.",
  },
  fail: {
    talk: "It does not land. Nobody here will listen to you that way again.",
    sneak: "You are seen. That way is shut now, and they are watching.",
    force: "It holds, and you come off worse.",
    pay: "What you offer is taken in part and the rest refused.",
  },
  bad: {
    talk: "It goes badly wrong. You have made an enemy here.",
    sneak: "You are caught in the open. It costs you dearly.",
    force: "It goes very badly. You are hurt, and they are angry.",
    pay: "You are cheated outright, and laughed at for it.",
  },
};

/** The plain-words reading of a line: a question is a question even when it has a verb of talking in it. */
export function plainReading(line: string, m: Moment): Reading {
  const l = line.trim();
  // "Can I slip past while he looks away?" asks to try it: read as the try it names, if it names one.
  if (/\?\s*$/.test(l) && /^(can|could|may|should|shall)\s+(i|we)\b/i.test(l)) return rulesReading(line, m) ?? "none";
  if (/\?\s*$/.test(l) && !/^(i|i'll|i'm|we)\b/i.test(l)) return "none";
  return rulesReading(line, m) ?? (askLike(line) ? "none" : null);
}

/** Stand-ins for every job. `slowMs` is how long each takes, to look at the waits. */
export function standIns(slowMs = 0): Minds {
  return {
    read: (line, m) => after(slowMs, plainReading(line, m)),
    tell: (o, stop, _note, more) => {
      const kind = more && o.past ? "more" : KIND[o.tier];
      return after(slowMs, LINES[kind][o.check.way]!.replace("{at}", stop.name));
    },
    answer: (_line, m, note) => after(slowMs, note ? "" : lookSaid(m)),
  };
}
