/**
 * A full table (docs/MOONSHOT.md, 4): two other players at their own seats, and the spotlight.
 *
 * Each other seat is a player, not a companion: a hero with stats, a fault, a want and a secret of their own, and a
 * way of playing. The card's character can be one of them. Others who tried AI players at a table found the same
 * failure: every player speaks every turn, says much the same thing, and drifts from who they are. So code decides
 * who speaks, not the model: after each of your lines, code scores each other player, and at most one speaks, often
 * nobody. They are told only facts code holds about themselves.
 *
 * Pure: facts in, an answer out.
 */
import { seededRng } from "./dice.js";
import type { AgeBand } from "./content.js";
import { marginFor, type Notice } from "./margin.js";
import { statOf, WAY_STATS, type Stat, type Stats, type Way } from "./moment.js";
import { moveAttitude, type Attitude } from "./people.js";

/** A way of playing (4.1). */
export type Style = "planner" | "brawler" | "talker" | "joker" | "treasure";
export const STYLES: readonly Style[] = ["planner", "brawler", "talker", "joker", "treasure"];

/** How much each way of playing likes to talk, 0 to 1. */
export const STYLE_TALK: Record<Style, number> = { planner: 0.5, brawler: 0.3, talker: 0.9, joker: 0.7, treasure: 0.4 };
/** The way each would rather get past things. */
export const STYLE_WAY: Record<Style, Way> = { planner: "sneak", brawler: "force", talker: "talk", joker: "talk", treasure: "pay" };

/** Another player at the table. */
export interface Fellow {
  id: string;
  name: string;
  /** Who they are, in a line. */
  who: string;
  style: Style;
  stats: Stats;
  powerName?: string;
  /** Their fault, in their calling's words: it can make trouble, and they may refuse what goes against it. */
  fault?: string;
  /** What they want, in words, and the words that tell a scene touches it. */
  want: string;
  wantWords: string[];
  /** A secret of their own, which can become a story. */
  secret?: string;
  /** How they feel about you, and about the other players by id. */
  attitude: Attitude;
  toward: Record<string, Attitude>;
  /** The turn they last spoke on; -1 if never. */
  lastSpoke: number;
  /** How many times in a row you have overruled them. */
  overruled: number;
  age?: AgeBand;
  /** Where they are when the party splits up; with you when not said. */
  at?: string;
  /** The card's own character (4.1). */
  fromCard?: boolean;
}

/** What code knows of the moment, for scoring and choosing what they say. */
export interface Moment2 {
  /** The turn number: one more after each of your lines. */
  turn: number;
  /** The words of the scene and your line, for what touches them. */
  text: string;
  /** The way your line tries, if it tries one. */
  way?: Way;
  /** You asked the table ("what do you two think?"). */
  asked?: boolean;
  /** A big decision is coming (the ambush, the crypt, a deal). */
  big?: boolean;
  /** Your line throws caution away. */
  bold?: boolean;
  seed: string;
}

/** The score above which a player speaks unasked. */
export const SPEAK_AT = 2.2;

/** Their best stat. */
export const bestOf = (f: Pick<Fellow, "stats">): Stat => (["brawn", "grace", "charm", "guile", "wits", "sense", "power"] as Stat[]).reduce((a, b) => (statOf(f, b) > statOf(f, a) ? b : a));

/** Whether the words touch something: any of a list of words, as whole words. */
const touches = (text: string, words: readonly string[]): boolean => words.some((w) => w.length > 2 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text));
const faultWords = (fault?: string): string[] => (fault?.toLowerCase().match(/[a-z]{5,}/g) ?? []).slice(0, 6);

/**
 * How much a player wants to speak (4.2): whether the scene touches them (their want, their best stat, their fault),
 * how long since they last spoke, how talkative their way of playing is, and a little seeded chance.
 */
export function wantsToSpeak(f: Fellow, m: Moment2): number {
  let touch = 0;
  if (touches(m.text, f.wantWords)) touch += 1.5;
  if (m.way && WAY_STATS[m.way][0] === bestOf(f)) touch += 1;
  if (touches(m.text, faultWords(f.fault))) touch += 0.7;
  if (m.way && STYLE_WAY[f.style] !== m.way && (f.style === "planner" ? m.bold : f.style === "brawler" ? m.way === "talk" : false)) touch += 0.8;
  const since = Math.min(2, (m.turn - (f.lastSpoke < 0 ? m.turn - 3 : f.lastSpoke)) * 0.4);
  const chance = seededRng(`speak:${m.seed}:${f.id}:${m.turn}`)() * 0.6;
  return touch + since + STYLE_TALK[f.style] + chance;
}

/**
 * Who speaks after a line: at most one, the keenest, and only if keen enough; often nobody. Everyone, keenest first,
 * when you ask the table or before a big decision. Nobody who is somewhere else.
 */
export function spotlight(fellows: readonly Fellow[], m: Moment2, here?: string): string[] {
  const near = fellows.filter((f) => !f.at || f.at === here);
  const scored = near.map((f) => ({ id: f.id, s: wantsToSpeak(f, m) })).sort((a, b) => b.s - a.s);
  if (m.asked || m.big) return scored.map((x) => x.id);
  const top = scored[0];
  return top && top.s >= SPEAK_AT ? [top.id] : [];
}

/** A player has spoken this turn. */
export const spoke = (f: Fellow, turn: number): Fellow => ({ ...f, lastSpoke: turn });

/** What a player says, chosen by code; the model words it. */
export type SayKind = "notice" | "advise" | "refuse" | "offer" | "alone" | "banter";
export interface Said {
  kind: SayKind;
  /** The fact code chose, for the model to word in their voice. */
  fact: string;
  /** A notice they made that you did not, to lay down as yours once said aloud. */
  notice?: Notice;
}

/**
 * What a player says (4.3), in order: something they notice that you did not (their own margin, aloud); a refusal, if
 * your line goes against their fault or they are cold to you; advice, if they caught a lie; an offer to help, if the
 * try is theirs by their best stat; going off alone, now and then, for a planner or the treasure-hunter; else banter.
 */
export function whatTheySay(f: Fellow, m: Moment2, o: { notices?: readonly Notice[]; yours?: readonly string[]; lie?: { by: number; who: string }; places?: readonly string[] } = {}): Said {
  const seen = marginFor(f, o.notices ?? [], o.yours ?? []).filter((n) => !n.fault)[0];
  if (seen) {
    const notice = o.notices!.find((n) => n.id === seen.id)!;
    return { kind: "notice", fact: seen.says, notice };
  }
  const against = touches(m.text, faultWords(f.fault)) || (/\b(burn|kill|murder|torture|poison)\b/i.test(m.text) && f.style !== "brawler");
  if (against && (f.attitude === "hostile" || f.attitude === "cold" || f.attitude === "wary")) return { kind: "refuse", fact: `will not go along with it: ${f.fault ?? "it goes against who they are"}` };
  if (o.lie && statOf(f, "sense") >= o.lie.by) return { kind: "advise", fact: `${o.lie.who} is lying, and not well` };
  if (m.way && WAY_STATS[m.way].includes(bestOf(f)) && statOf(f, bestOf(f)) >= 3) return { kind: "offer", fact: `offers to set it up, or to do it themselves: this is what they are good at` };
  const r = seededRng(`alone:${m.seed}:${f.id}:${m.turn}`)();
  if ((f.style === "planner" || f.style === "treasure") && o.places?.length && r < 0.2) return { kind: "alone", fact: `wants to go on alone to ${o.places[0]} while you are here` };
  return { kind: "banter", fact: f.style === "joker" ? "makes light of it" : `says what they think, as ${f.style === "planner" ? "the one who plans" : f.style === "brawler" ? "the one who kicks doors in" : f.style === "talker" ? "the one who talks to everyone" : "the one who wants the treasure"}` };
}

/**
 * Talk it over (4.4): before a big move, each player says which way they would go, by their way of playing and what
 * they are good at. You decide, or put it to a vote.
 */
export function talkItOver(fellows: readonly Fellow[], open: readonly Way[]): { id: string; way: Way }[] {
  return fellows.map((f) => {
    const mine = STYLE_WAY[f.style];
    const good = (Object.keys(WAY_STATS) as Way[]).find((w) => WAY_STATS[w][0] === bestOf(f));
    const way = open.includes(mine) ? mine : good && open.includes(good) ? good : open[0] ?? mine;
    return { id: f.id, way };
  });
}

/** A vote: the way most of the table wants, yours breaking a tie. */
export function vote(yours: Way, theirs: readonly { way: Way }[]): Way {
  const count = new Map<Way, number>([[yours, 1.5]]);
  for (const t of theirs) count.set(t.way, (count.get(t.way) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

/**
 * How they feel about what you did (4.5): overrule them every time and they go cold (a step down at the third in a
 * row); back them when it costs you and they go a step closer; go with them and the count starts again.
 */
export function feel(f: Fellow, what: "overruled" | "followed" | "backed"): Fellow {
  if (what === "overruled") {
    const n = f.overruled + 1;
    return n >= 3 ? { ...f, overruled: 0, attitude: moveAttitude(f.attitude, -1) } : { ...f, overruled: n };
  }
  if (what === "backed") return { ...f, overruled: 0, attitude: moveAttitude(f.attitude, 1) };
  return { ...f, overruled: 0 };
}

/** Two players fall out, or grow close. */
export const between = (f: Fellow, other: string, by: number): Fellow => ({ ...f, toward: { ...f.toward, [other]: moveAttitude(f.toward[other] ?? "wary", by) } });

/**
 * Handing a try over (4.3): "Mira, you do the talking". The try is thrown on their stats, not yours. Their failures
 * are theirs to throw and yours to deal with.
 */
export const handOver = (f: Fellow): { stats: Stats; powerName?: string } => ({ stats: { ...f.stats }, ...(f.powerName ? { powerName: f.powerName } : {}) });

/** Whether a line hands the try to a player, by their name. */
export function handedTo(line: string, fellows: readonly Fellow[]): Fellow | null {
  const l = line.toLowerCase();
  for (const f of fellows) {
    const n = f.name.toLowerCase().split(/\s+/)[0]!;
    // "Let Mira try", "have Mira pick it", "get Mira to talk": the name, then a verb. Never "I have Mira's rope".
    if (new RegExp(`\\b${n}\\b[^.]*\\b(you do|you try|you go|your turn|take this|handle|talk to|deal with|you talk|you climb|you pick)\\b|\\b(let|have|get)\\s+${n}\\s+(to\\s+)?(?!and\\b|or\\b|with\\b|too\\b|here\\b|now\\b)[a-z]{2,}`).test(l)) return f;
  }
  return null;
}

/**
 * Whether a line asks the table what they think: the one reader for talking it over, a vote, and every player having
 * their say (world.ts). "What do you think?" alone is said to whoever is in front of you, not to the table.
 */
export const asksTable = (line: string): boolean => /\b(talk (it|this) over|what do you (two|both|all|guys|lot) think|what does everyone think|what (should|do|shall) we do|any ideas|what say you|let's vote|we vote)\b|\bthoughts\?/i.test(line);

/** Words that tell a way of playing from a card's own description, when there is no model. */
const STYLE_WORDS: Record<Style, RegExp> = {
  planner: /\b(careful|cautious|clever|scholar|strategist|tactician|calculating|methodical|wise|patient)\b/i,
  brawler: /\b(brawler|fighter|warrior|strong|reckless|hothead|barbarian|soldier|knight|brash)\b/i,
  talker: /\b(charming|bard|talker|diplomat|friendly|social|flirt|courtier|noble|kind)\b/i,
  joker: /\b(joker|jester|playful|mischievous|cheeky|trickster|prankster|witty|teasing)\b/i,
  treasure: /\b(greedy|thief|rogue|merchant|treasure|gold|mercenary|pirate|smuggler|collector)\b/i,
};

export function styleFromWords(text: string): Style {
  let best: Style = "talker", score = 0;
  for (const s of STYLES) {
    const n = (text.match(new RegExp(STYLE_WORDS[s].source, "gi")) ?? []).length;
    if (n > score) (best = s), (score = n);
  }
  return best;
}

/** What the model speaking for a player is told: only facts code holds about them, and what code chose they say. */
export function fellowBrief(f: Fellow, said: Said, youName = "the player"): string {
  const lines = [`${f.name}: ${f.who}. Plays as ${f.style === "planner" ? "the careful planner" : f.style === "brawler" ? "the one who kicks doors in" : f.style === "talker" ? "the one who talks to everyone" : f.style === "joker" ? "the joker" : "the one who wants the treasure"}.`];
  lines.push(`Wants: ${f.want}. Feels ${f.attitude} toward ${youName}.`);
  if (f.fault) lines.push(`Their fault: ${f.fault}.`);
  lines.push(`Says one or two short lines, in their own voice: ${said.fact}.`);
  lines.push("They know only what is said here; they invent no clue, no fact that matters, and never speak for anyone else.");
  return lines.join(" ");
}
