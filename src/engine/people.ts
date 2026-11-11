/**
 * People (docs/LOOP.md, 3; docs/MOONSHOT.md, 3.3): rapport you can build, patience that runs out, what they know and
 * when they tell it, and lies told both ways.
 *
 * Every person is a short record. Code holds the numbers; a model writes the words (their voice, what they want and
 * fear) and reads a line into what kind of line it is and which of their likes it touches. Code checks that reading
 * against the person's own lists, so a line cannot be argued into a bonus.
 *
 * Pure: facts in, an answer out.
 */
import { rollD20, seededRng } from "./dice.js";
import { TARGETS, type Difficulty } from "./moment.js";
import type { AgeBand } from "./content.js";

/** How they feel about you, on five steps. Most start wary. */
export type Attitude = "hostile" | "cold" | "wary" | "friendly" | "close";
export const ATTITUDES: readonly Attitude[] = ["hostile", "cold", "wary", "friendly", "close"];

/** The fixed list a person's likes and dislikes are picked from. */
export type Like = "flattery" | "honesty" | "coin" | "story" | "trade" | "music" | "solitude" | "threats" | "pity" | "gossip" | "food" | "faith" | "courage" | "wit";
export const LIKES: readonly Like[] = ["flattery", "honesty", "coin", "story", "trade", "music", "solitude", "threats", "pity", "gossip", "food", "faith", "courage", "wit"];

/** What kind of line it is, said to a person. */
export type LineKind = "smalltalk" | "praise" | "offer" | "question" | "threat" | "lie" | "plea" | "gift";
export const LINE_KINDS: readonly LineKind[] = ["smalltalk", "praise", "offer", "question", "threat", "lie", "plea", "gift"];

/** How far they must trust you before they tell a thing: wary, friendly, close, or never without pressing or proof. */
export type Threshold = "open" | "guarded" | "secret" | "never";
const THRESHOLD_AT: Record<Threshold, number> = { open: 2, guarded: 3, secret: 4, never: 99 };


/** A thing a person knows: a clue's id, and how far they must trust you to tell it. */
export interface Known {
  clue: string;
  at: Threshold;
}

/** A person in a story. */
export interface Person {
  id: string;
  name: string;
  /** How they speak, in a line ("clipped and dry, calls everyone 'friend'"). */
  voice?: string;
  look?: string;
  /** One thing they want now, in words, and the slip of a favour it opens. */
  wants?: string;
  /** One thing they are afraid of. */
  fears?: string;
  likes: Like[];
  dislikes: Like[];
  attitude: Attitude;
  /** How hard they are to push past what they would freely do. */
  resolve: Difficulty;
  knows: Known[];
  /** At most one thing they lie about: the false clue, how good they are at lying (0 to 4), and why. */
  lie?: { clue: string; truth?: string; skill: number; why?: string };
  /** How hard they are to lie to: their Sense, 0 to 4. */
  sense?: number;
  /** Read by code from their own words (content.ts): only a clear adult is ever in a scene with heat or dark themes. */
  age?: AgeBand;
  /** Whose lie of yours they have seen through, kept: they play along, believe nothing, and act on it later. */
  doubts?: boolean;
  /** You did what they wanted. */
  helped?: boolean;
}

/** One visit with a person: lines heard, the bonuses already counted this visit, and whether they have had enough. */
export interface Visit {
  person: string;
  heard: number;
  counted: string[];
  ended: boolean;
}

export const newVisit = (person: string): Visit => ({ person, heard: 0, counted: [], ended: false });

export const attitudeIndex = (a: Attitude): number => ATTITUDES.indexOf(a);
/** One or more steps of attitude, never past its ends. */
export const moveAttitude = (a: Attitude, by: number): Attitude => ATTITUDES[Math.max(0, Math.min(ATTITUDES.length - 1, attitudeIndex(a) + by))]!;

/** Steps harder (or easier, below 0) that talking them round is, by attitude. */
export const ATTITUDE_STEP: Record<Attitude, number> = { hostile: 2, cold: 1, wary: 0, friendly: -1, close: -2 };

/** How many lines they will hear in a visit: three, one more if friendly, two more if close, fewer if they dislike you. */
export const PATIENCE: Record<Attitude, number> = { hostile: 1, cold: 2, wary: 3, friendly: 4, close: 5 };

/** What code has read from a line said to a person, before it is checked against who they are. */
export interface LineRead {
  kind: LineKind;
  /** Likes or dislikes the line seems to touch, by the reader. Only those on the person's own lists count. */
  touches?: Like[];
  /** It touches what they want. */
  wants?: boolean;
  /** What a gift was, if it was one. */
  gift?: Like;
}

/** What hearing a line did. */
export interface Heard {
  person: Person;
  visit: Visit;
  /** Steps of attitude it moved them. */
  moved: number;
  /** Why, one entry a reason, for the narrator: "likes:food", "dislikes:flattery", "wants", "gift:coin", "threat". */
  why: string[];
  /** It used up a line of their patience. */
  tired: boolean;
}

/**
 * A line said to a person (docs/LOOP.md, 3.1). Each kind of bonus counts at most once per visit, so nothing can be
 * repeated for profit; a threat always costs. A line that moves them or that they will answer does not use their
 * patience; any other does, and when it runs out they end the visit.
 */
export function hearLine(p: Person, v: Visit, line: LineRead, answers = false): Heard {
  const counted = [...v.counted];
  const why: string[] = [];
  let moved = 0;
  const once = (key: string, by: number): void => {
    if (counted.includes(key)) return;
    counted.push(key);
    why.push(key);
    moved += by;
  };
  for (const t of new Set(line.touches ?? [])) {
    if (p.likes.includes(t)) once(`likes:${t}`, 1);
    else if (p.dislikes.includes(t)) once(`dislikes:${t}`, -1);
  }
  if (line.wants && p.wants) once("wants", 1);
  if (line.kind === "gift" && line.gift) {
    if (p.likes.includes(line.gift)) once(`gift:${line.gift}`, 1);
    else if (p.dislikes.includes(line.gift)) once(`gift-unwanted:${line.gift}`, -1);
  }
  if (line.kind === "threat" && !p.likes.includes("threats")) {
    why.push("threat");
    moved -= 1;
  }
  const attitude = moveAttitude(p.attitude, moved);
  const tired = moved <= 0 && !answers;
  const heard = v.heard + (tired ? 1 : 0);
  const person = { ...p, attitude };
  return { person, visit: { ...v, heard, counted, ended: v.ended || heard >= PATIENCE[attitude] }, moved, why, tired };
}

/** What they will tell you freely now: every clue at or under where they stand (the lie among them, if they lie). */
export function released(p: Person): string[] {
  const at = attitudeIndex(p.attitude);
  return p.knows.filter((k) => at >= THRESHOLD_AT[k.at]).map((k) => k.clue);
}

/** What they hold back that pressing might get: clues above where they stand. */
export const heldBack = (p: Person): string[] => p.knows.filter((k) => attitudeIndex(p.attitude) < THRESHOLD_AT[k.at]).map((k) => k.clue);

/** How hard pressing them is: their resolve, shifted by attitude, so rapport makes it easier. */
export function pressDifficulty(p: Person): Difficulty {
  return Math.max(0, Math.min(3, p.resolve + ATTITUDE_STEP[p.attitude])) as Difficulty;
}

/**
 * What a press that works gets (docs/LOOP.md, 3.3): the first thing held back. Frightening them (Brawn) works now and
 * costs a step of attitude when it is over.
 */
export function pressed(p: Person, frightened: boolean): { person: Person; clue: string | null } {
  const clue = heldBack(p)[0] ?? null;
  return { person: frightened ? { ...p, attitude: moveAttitude(p.attitude, -1) } : p, clue };
}

/** A hunch, with no die (docs/LOOP.md, 3.4): your Sense is at least their skill at lying. */
export const hunch = (sense: number, p: Person): boolean => !!p.lie && sense >= p.lie.skill;

/** Whether a clue they gave you is their lie. Code knows; the player does not. */
export const isLie = (p: Person, clue: string): boolean => p.lie?.clue === clue;

/**
 * Reading them (docs/LOOP.md, 3.4): a throw on Sense against their skill at lying. Works: you are told plainly whether
 * that last thing was true. Fails: "you cannot tell". Never a false answer.
 */
export function readThem(p: Person, clue: string, sense: number, seed: string): { natural: number; told: "true" | "false" | "unsure" } {
  const natural = rollD20(seededRng(seed));
  const target = TARGETS[Math.max(0, Math.min(3, p.lie?.skill ?? 1)) as Difficulty];
  const works = natural === 20 || (natural > 1 && natural + sense >= target);
  return { natural, told: works ? (isLie(p, clue) ? "false" : "true") : "unsure" };
}

/** Caught in a lie by proof: they give up the truth at once, and think less of you unless you let them save face. */
export function caught(p: Person, saveFace: boolean): { person: Person; truth: string | null } {
  return { person: { ...p, attitude: saveFace ? p.attitude : moveAttitude(p.attitude, -1), lie: undefined }, truth: p.lie?.truth ?? null };
}

/**
 * Lying to them (docs/MOONSHOT.md, 3.3): a throw behind the narrator's hand, your Guile against their Sense. You are
 * not told how it went. One who sees through you plays along, believes nothing, and acts on it later.
 */
export function lieTo(p: Person, guile: number, seed: string): { natural: number; believed: boolean; person: Person } {
  const natural = rollD20(seededRng(`lie:${seed}`));
  const believed = natural === 20 || (natural > 1 && natural + guile >= 10 + (p.sense ?? 1));
  return { natural, believed, person: believed ? p : { ...p, doubts: true } };
}

/** A lie of yours comes to light: two steps, at once and for good. */
export const lieFound = (p: Person): Person => ({ ...p, attitude: moveAttitude(p.attitude, -2), doubts: true });

/** You did what they wanted (docs/LOOP.md, 3.5): they are close, and close people do things for you. */
export const favourDone = (p: Person): Person => ({ ...p, attitude: "close", helped: true });

// ---- Reading a line without a model ----

const W = (list: string): RegExp => new RegExp(`\\b(${list})\\b`, "i");
const KIND_WORDS: readonly [RegExp, LineKind][] = [
  [W("or else|i will hurt|i'll hurt|threaten|threatens|or i will|or i'll|you'll regret|you will regret|break your"), "threat"],
  [W("here, take|i give|i hand|a gift|for you|i offer you|i buy you|i buy her|i buy him"), "gift"],
  [W("please|i beg|i'm begging|help me|have pity|i need your help"), "plea"],
  [W("i can help|i could help|i'll help|i will help|i can get|i could get|in return|a deal|i'll pay|i will pay"), "offer"],
  [W("beautiful|lovely|finest|best i've|best i have|wonderful|admire|well made|you're good|you are good|impressive|splendid|delicious"), "praise"],
];
export function lineKind(line: string, lying = false): LineKind {
  if (lying) return "lie";
  for (const [re, k] of KIND_WORDS) if (re.test(line)) return k;
  return /\?\s*$/.test(line.trim()) || W("who|what|where|when|why|how|tell me|do you know").test(line) ? "question" : "smalltalk";
}

const LIKE_WORDS: Record<Like, RegExp> = {
  flattery: W("beautiful|lovely|handsome|finest|wonderful|admire|splendid|gorgeous|clever you"),
  honesty: W("honestly|truth is|to be honest|plainly|straight with you|i won't lie|i will not lie"),
  coin: W("coin|coins|silver|gold|pay|paid|money|reward|crowns|credits"),
  story: W("story|stories|tale|tales|once upon|have you heard|let me tell you"),
  trade: W("your trade|your craft|your work|well made|fine work|your stew|your ale|your forge|your shop|your ship"),
  music: W("song|songs|sing|music|tune|lute|fiddle|play for"),
  solitude: W("leave you be|leave you alone|i'll be quick|i will be quick|won't keep you|will not keep you"),
  threats: W("or else|threaten|hurt you|regret it"),
  pity: W("poor|alone|lost everything|starving|hungry|cold|sick"),
  gossip: W("heard that|rumour|rumor|they say|word is|did you hear|between us"),
  food: W("stew|bread|pie|food|meal|cook|cooking|soup|roast|cake|breakfast"),
  faith: W("god|gods|pray|prayer|blessed|temple|saint|faith|holy"),
  courage: W("brave|bravery|courage|fearless|bold|stood up"),
  wit: W("joke|jest|riddle|clever|witty|funny"),
};
/** The likes a line seems to touch, by its words. Only those on a person's own lists will count. */
export const likesTouched = (line: string): Like[] => LIKES.filter((l) => LIKE_WORDS[l].test(line));

const STOP = ["with", "from", "that", "them", "their", "this", "they", "have", "what", "want", "wants", "some", "back", "more", "into", "your"];
/** Whether a line touches what they want, by the words of their want. */
export function touchesWant(line: string, p: Person): boolean {
  if (!p.wants) return false;
  const l = line.toLowerCase();
  const words = (p.wants.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.includes(w));
  return words.some((w) => l.includes(w));
}

/** A line read into a LineRead by its words alone. */
export function rulesLine(line: string, p: Person, lying = false): LineRead {
  const kind = lineKind(line, lying);
  const touches = likesTouched(line);
  const gift = kind === "gift" ? touches.find((t) => ["coin", "food", "music", "story"].includes(t)) : undefined;
  return { kind, touches, wants: touchesWant(line, p), ...(gift ? { gift } : {}) };
}

/** What a person is told to say, for the model that speaks for them: who they are, how they feel, and only what code released. */
export function personBrief(p: Person, facts: readonly string[]): string {
  const parts = [`${p.name}${p.look ? `, ${p.look}` : ""}.`];
  if (p.voice) parts.push(`Speaks: ${p.voice}.`);
  parts.push(`Feels ${p.attitude} toward the player.`);
  if (p.wants) parts.push(`Wants: ${p.wants}.`);
  if (p.fears) parts.push(`Fears: ${p.fears}.`);
  parts.push(facts.length ? `May say only these facts, and nothing else that matters: ${facts.join(" | ")}.` : "Has nothing to tell that matters; says so in their own way.");
  if (p.doubts) parts.push("Has seen through the player's lie: plays along, believes nothing.");
  return parts.join(" ");
}
