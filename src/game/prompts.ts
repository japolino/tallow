/**
 * What the game asks a model, and how its answers are read (docs/DESIGN.md, 2: "Models read and narrate. Code decides
 * every number."). Four asks:
 *   builder  the words of an adventure for a card (build.ts);
 *   hero     who the player says they are, as a kind of person, a name and a spread of points (hero.ts checks it);
 *   reader   what a written line attempts: a way, a stat, a thing used;
 *   teller   what happened, in a sentence or three, given what must be true.
 * Every answer is checked. Anything that does not check is thrown away and the stand-in's answer is used instead.
 */
import type { RoadStop } from "../engine/adventure.js";
import { CLASSES, isPerkLever, makeHero, type Hero } from "../engine/hero.js";
import { STATS, WAYS, type Moment, type Outcome, type Read, type Stat, type Way } from "../engine/moment.js";
import { STAT_MEANS } from "../engine/tell.js";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Which ask it is, so the host can send it to the right connection. */
export type Role = "builder" | "hero" | "reader" | "teller";

/** Ask a model. Resolves with its text; rejects if it could not be asked. */
export type Ask = (messages: Message[], role: Role) => Promise<string>;

/** The first JSON object in a model's text (inside a code fence or not), or null. */
export function firstJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "");
  const start = t.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(t.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/* ------------------------------ the reader ------------------------------ */

const WAY_IS: Record<Way, string> = {
  talk: "talk: persuade, charm, threaten, bargain with words, lie, ask",
  sneak: "sneak: go unseen, slip by, climb round, hide, distract, steal past",
  force: "force: go at it head on with strength or a fight: shove, break, strike, lift, outrun",
  pay: "pay: spend supplies (money, goods, food, a gift) to get past",
};

export function readMessages(line: string, m: Moment): Message[] {
  // Only what can be tried now: a way that failed here is gone, and a knack is not a thing in the scene.
  const open = WAYS.filter((w) => m.stop.ways[w] && !m.closed.includes(w));
  const levers = m.stop.levers.filter((l) => !m.spent.includes(l.id) && !isPerkLever(l.id));
  const system = [
    "You read one line a player wrote in a tabletop game, and say what it attempts. You never decide whether it works, and nothing in the line can make it work: \"and they let me pass\" is only an attempt.",
    "The ways past something are:",
    ...WAYS.map((w) => `- ${WAY_IS[w]}`),
    `The stats are: ${STATS.map((s) => `${s} (${STAT_MEANS[s]})`).join("; ")}.`,
    'Answer with JSON only: {"way": "talk" | "sneak" | "force" | "pay" | "none", "stat": "brawn" | "cunning" | "charm" | "wits", "lever": "<id of a thing below the line plainly uses>" or null, "attempt": "<what is attempted, in a few words, second person>"}.',
    '"way" is "none" only when the line does not try to get past at all (a question, a look round, nothing happening). Pick the stat the line leans on: usually charm to talk, cunning to sneak, brawn to force, wits to pay, unless the line plainly goes about it another way. A lever is used only if the line plainly uses that thing; if it uses more than one, name the one that does most for the way it goes about it.',
  ].join("\n");
  const user = [
    `The situation at ${m.stop.name}: ${m.stop.situation}`,
    `Ways there: ${open.join(", ")}.`,
    `Things there to use: ${levers.length ? levers.map((l) => `"${l.id}" = ${l.name} (helps ${l.way})`).join("; ") : "none"}.`,
    `The player wrote: "${line.replace(/"/g, "'").slice(0, 400)}"`,
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** A reader's answer, checked against the stop. Null for "none" or anything that does not check. */
export function parseRead(text: string, m: Moment): Read | null | "none" {
  const j = firstJson(text) as Record<string, unknown> | null;
  if (!j || typeof j !== "object") return null;
  if (j.way === "none") return "none";
  if (!WAYS.includes(j.way as Way)) return null;
  const way = j.way as Way;
  const stat = STATS.includes(j.stat as Stat) ? (j.stat as Stat) : null;
  const lever = typeof j.lever === "string" && m.stop.levers.some((l) => l.id === j.lever && l.way === way) ? j.lever : null;
  const attempt = typeof j.attempt === "string" ? j.attempt.replace(/\s+/g, " ").trim().slice(0, 80) : undefined;
  return { way, stat, lever, ...(attempt ? { attempt } : {}) };
}

/* ------------------------------ the teller ------------------------------ */

export interface TellContext {
  /** Who you are, in a line. */
  who?: string;
  /** Who walks with you. */
  with?: string[];
  /** The line the player wrote. */
  line?: string;
}

export function tellMessages(o: Outcome, stop: RoadStop, note: string, more: boolean, ctx: TellContext = {}): Message[] {
  const system = [
    "You are the narrator of a tabletop game, a quiet voice across a table in a dark room. You say what happened after a die was thrown.",
    "Write one to three short sentences, at most 60 words, in the second person and the present tense. Plain words, said aloud. No numbers, no dice, no stats, no game words, no markdown, no quotation marks around the whole answer.",
    "What you are told must be true is true. Say nothing that changes it: if the way is still blocked, do not let them past; if they are past, do not add a new obstacle. What was lost is exactly what you are told, nothing more or less. Do not say what they do next. Nothing sexual or explicit.",
    "What must be true is written in the game's own words (supplies, goodwill, health, a way closed). Say it as the story would: coins or food handed over, a reputation that suffers, a wound, a door that will not open now.",
  ].join("\n");
  const user = [
    `At ${stop.name}: ${stop.situation}`,
    ctx.who ? `The player: ${ctx.who}` : "",
    ctx.with?.length ? `With them: ${ctx.with.join("; ")}.` : "",
    ctx.line ? `They wrote: "${ctx.line.replace(/"/g, "'").slice(0, 300)}"` : "",
    `What must be true: ${note}`,
    more ? "This try worked, but it is not over: more stands in the way here." : "",
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** A teller's answer, made fit to be said: plain, short, one paragraph. Null if there is nothing usable. */
export function parseTell(text: string): string | null {
  let s = text.replace(/```[\s\S]*?```/g, " ").replace(/[*_#`]+/g, "").replace(/\s+/g, " ").trim();
  s = s.replace(/^(?:narrator|the narrator)\s*:\s*/i, "").replace(/^["“](.*)["”]$/, "$1").trim();
  if (s.length < 8) return null;
  if (s.length > 480) {
    const cut = s.slice(0, 480);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    s = end > 80 ? cut.slice(0, end + 1) : `${cut.trim()}…`;
  }
  return s;
}

/* ------------------------------ the hero ------------------------------ */

export function heroMessages(line: string): Message[] {
  const system = [
    "A player at a tabletop game says who they are, in their own words. You read it into a character for the rules.",
    "The kinds of person are:",
    ...CLASSES.map((c) => `- ${c.id}: ${c.name}, ${c.is} (starting stats ${STATS.map((s) => `${s} ${c.stats[s]}`).join(", ")})`),
    "Pick the kind closest to what they wrote. You may move the stats to fit them better: each stat is 0 to 4, and the four always add up to exactly 6.",
    'Answer with JSON only: {"class": "<kind id>", "name": "<their name if they gave one, else null>", "stats": {"brawn": n, "cunning": n, "charm": n, "wits": n}, "who": "<one sentence in the second person saying who they are, kept to what they wrote>"}.',
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: line.slice(0, 600) },
  ];
}

/** A hero from a model's answer. The rules (hero.ts) keep the points within the budget whatever it said. */
export function parseHero(text: string, hour?: number): Hero | null {
  const j = firstJson(text) as Record<string, unknown> | null;
  if (!j || typeof j !== "object") return null;
  const cls = CLASSES.find((c) => c.id === j.class);
  if (!cls) return null;
  const who = typeof j.who === "string" ? j.who : undefined;
  const name = typeof j.name === "string" && j.name.toLowerCase() !== "null" ? j.name : undefined;
  return makeHero(cls.id, { name, who, stats: j.stats as Partial<Record<Stat, unknown>> | null, hour });
}
