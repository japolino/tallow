/**
 * A campaign (docs/MOONSHOT.md, 6): one long threat across many stories, after Apocalypse World's fronts.
 *
 * The big bad is a short record: what it wants, its steps in plain sight, its hands for each chapter, its weakness in
 * three keys, and when it acts. Each story is a chapter built from the campaign. On the table, a black candle at the
 * narrator's right hand with six rings scored on it is lit only when the big bad takes a step, and burns down one ring
 * each time. When it is out, it is the longest night.
 *
 * And the narrator is a GM: it brings back what was set up and not used, and anyone made up who matters gets a record.
 *
 * Pure: facts in, an answer out.
 */
import type { Adventure } from "./adventure.js";
import { RATING_MAX } from "./effect.js";

export const RINGS = 6;

export interface Front {
  /** Who or what it is: the lich, the plague, the usurper. */
  name: string;
  /** What it wants. */
  wants: string;
  /** Its steps, in plain sight, one a ring: the graves are opened, the bishop is bought, ... */
  steps: string[];
  /** Its hands for each chapter: a lieutenant or a cult. */
  hands: string[];
  /** Its weakness, as three keys spread over the chapters. */
  keys: [string, string, string];
}

export interface Campaign {
  front: Front;
  /** Rings burned: steps it has taken. RINGS is the end. */
  burned: number;
  /** The chapter you are on, from 0. */
  chapter: number;
  /** Which of the three keys you hold, carried from chapter to chapter. */
  keys: boolean[];
  /** What carries on: people won over, people who hate you, by name. */
  friends: string[];
  enemies: string[];
  /** Details set up and not used yet: a name dropped, a locked drawer, a promise. */
  threads: string[];
  /** Things the players said were so, kept and true. */
  facts: string[];
}

export function startCampaign(front: Front): Campaign {
  const steps = [...front.steps].slice(0, RINGS);
  while (steps.length < RINGS) steps.push(steps.length === RINGS - 1 ? "the end comes" : "it moves closer");
  return { front: { ...front, steps }, burned: 0, chapter: 0, keys: [false, false, false], friends: [], enemies: [], threads: [], facts: [] };
}

/** How a chapter ended, for what the big bad does after. */
export interface ChapterEnd {
  /** You set it back: stopped one of its steps, beat its hand, or found a key. */
  setBack: boolean;
  /** You failed badly near it. */
  failedNear: boolean;
  /** Keys found this chapter (0, 1 or 2). */
  found: (0 | 1 | 2)[];
  friends?: string[];
  enemies?: string[];
}

/**
 * The end of a chapter (6.1): it takes one step after every story you do not set it back, and another when you failed
 * badly near it. Each step burns a ring of the black candle. Keys and people carry on.
 */
export function endChapter(c: Campaign, e: ChapterEnd): { campaign: Campaign; steps: string[]; over: boolean } {
  const n = (e.setBack ? 0 : 1) + (e.failedNear ? 1 : 0);
  const burned = Math.min(RINGS, c.burned + n);
  const steps = c.front.steps.slice(c.burned, burned);
  const keys = c.keys.map((k, i) => k || e.found.includes(i as 0 | 1 | 2));
  const campaign = { ...c, burned, chapter: c.chapter + 1, keys, friends: [...new Set([...c.friends, ...(e.friends ?? [])])], enemies: [...new Set([...c.enemies, ...(e.enemies ?? [])])] };
  return { campaign, steps, over: burned >= RINGS };
}

/** The hand the big bad sends in this chapter. */
export const handFor = (c: Campaign): string => c.front.hands[c.chapter % Math.max(1, c.front.hands.length)] ?? `the servants of ${c.front.name}`;

/** Which key this chapter hides, so every chapter moves you toward the end even when it goes badly. */
export const keyFor = (c: Campaign): 0 | 1 | 2 | null => {
  const missing = c.keys.findIndex((k) => !k);
  return missing < 0 ? null : (missing as 0 | 1 | 2);
};

/**
 * The finale (6.1): the big bad itself, under effect and position. Each key held is an edge; with all three the gap is
 * fair; with none, there is no throw against it, and the only way out is to run.
 */
export function finaleEdges(c: Campaign): number {
  return c.keys.filter(Boolean).length;
}

/** The black candle, for the room: rings burned of RINGS, and whether it is lit (only while it takes a step). */
export const candleOf = (c: Campaign): { rings: number; burned: number } => ({ rings: RINGS, burned: c.burned });

// ---- The narrator as a GM (6.2) ----

/** Something set up and not used: kept, to be brought back when there is a chance. */
export const setUp = (c: Campaign, thread: string): Campaign => (c.threads.includes(thread) ? c : { ...c, threads: [...c.threads, thread].slice(-12) });

/** A thread to bring back now, oldest first, and the campaign without it. */
export function bringBack(c: Campaign): { thread: string | null; campaign: Campaign } {
  const [thread, ...rest] = c.threads;
  return { thread: thread ?? null, campaign: { ...c, threads: rest } };
}

/** The players said it was so: kept, and true from now on. */
export const sayItsSo = (c: Campaign, fact: string): Campaign => ({ ...c, facts: [...c.facts, fact.replace(/\s+/g, " ").trim().slice(0, 200)].slice(-30) });

/** What the narrator is told of the campaign each chapter: what it wants, where the candle stands, and what carries on. */
export function campaignBrief(c: Campaign): string {
  const parts = [`${c.front.name} wants ${c.front.wants}.`, `It has taken ${c.burned} of ${RINGS} steps${c.burned ? `: last, ${c.front.steps[c.burned - 1]}` : ""}.`, `Its hand in this chapter: ${handFor(c)}.`];
  const held = c.front.keys.filter((_, i) => c.keys[i]);
  if (held.length) parts.push(`The players know: ${held.join("; ")}.`);
  if (c.friends.length) parts.push(`Friends: ${c.friends.join(", ")}.`);
  if (c.enemies.length) parts.push(`Enemies: ${c.enemies.join(", ")}.`);
  if (c.facts.length) parts.push(`True because the players said so: ${c.facts.slice(-5).join("; ")}.`);
  return parts.join(" ");
}

/** Stock big bads for a campaign begun with no model to write one (6.1): each with six steps, its hands, three keys. */
export const STOCK_FRONTS: readonly Front[] = [
  {
    name: "the lich under the abbey",
    wants: "to rise as the undying king on the longest night",
    steps: ["the old graves are opened", "the bishop is bought", "the grave-knights ride at night", "the river runs black", "the city falls silent", "the longest night"],
    hands: ["the masked four", "the bought bishop", "the grave-knights"],
    keys: ["where its heart is kept", "its true name", "the rite that unbinds it"],
  },
  {
    name: "the syndicate behind the glass towers",
    wants: "to own every vote in the city by the election",
    steps: ["the first councillor is bought", "the papers are silenced", "a rival boss disappears", "the police look away", "the ballots are counted by its people", "election night"],
    hands: ["the fixer and her crew", "the police captain", "the tower's security"],
    keys: ["the ledger of who was paid", "the witness who saw the disappearance", "the vault where the ballots go"],
  },
  {
    name: "the hunger in the deep wood",
    wants: "to swallow the valley before the harvest moon",
    steps: ["the herds go missing", "the hunters do not come back", "the wells turn sour", "the village elders make a bargain", "the wood moves closer", "the harvest moon"],
    hands: ["the elders' bargain-keepers", "the hollow hunters", "the wood's beasts"],
    keys: ["what it was promised", "the place where it sleeps", "the thing it fears"],
  },
];

/** A stock front for a world: of our own day, or not; the seed picks among the rest. */
export function stockFront(seed: number, modern: boolean): Front {
  if (modern) return STOCK_FRONTS[1]!;
  const old = STOCK_FRONTS.filter((_, i) => i !== 1);
  return old[Math.abs(seed) % old.length]!;
}

/** The black candle and what the big bad did, in plain lines, after a chapter. */
export function chapterSaid(c: Campaign, steps: readonly string[], over: boolean): string[] {
  const lines = steps.length ? [`The black candle at my right hand is lit. ${cap(c.front.name)} takes ${steps.length > 1 ? "two steps" : "a step"}: ${steps.join("; then ")}. ${RINGS - c.burned} ring${RINGS - c.burned === 1 ? "" : "s"} left on it.`] : [`The black candle stays dark. You set ${c.front.name} back this time.`];
  const held = c.front.keys.filter((_, i) => c.keys[i]);
  if (held.length) lines.push(`You know ${held.join(", and ")}.`);
  if (over) lines.push(`The candle is out. It is ${c.front.steps[RINGS - 1]}: the last story is against ${c.front.name} itself.`);
  return lines;
}
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// ---- The finale, and a big bad written by a model ----

/** Whether the last story is due: the candle is out, or you hold all three keys and can go after it. */
export const finaleDue = (c: Campaign): boolean => c.burned >= RINGS || c.keys.every(Boolean);

/**
 * The last story of a campaign (6.1): the road as laid, with the big bad itself waiting at its end, rated at the top of
 * the scale at everything, so that only the keys you carried (each an edge) make the gap fair. With none there is no
 * throw against it.
 */
export function finaleRoad(adv: Adventure, c: Campaign): Adventure {
  const who = cap(c.front.name);
  const all = { talk: RATING_MAX, sneak: RATING_MAX, force: RATING_MAX, pay: RATING_MAX };
  const stops = adv.stops.map((s) => (s.climax ? { ...s, name: who, situation: `${who} itself, at the end of all its steps. It wants ${c.front.wants}.`, foe: { ...(s.foe ?? {}), name: c.front.name, ratings: all } } : s));
  return { ...adv, title: `The longest night: ${c.front.name}`, goal: `stand against ${c.front.name} itself`, stops, finale: { name: c.front.name, edges: finaleEdges(c) } };
}

/** How the finale ended, said; the campaign is over either way. */
export function finaleSaid(c: Campaign, won: boolean): string[] {
  return won
    ? [`${cap(c.front.name)} is beaten. I take the black candle from my right hand and snap it in two. The campaign is over, and it was yours.`]
    : [`${cap(c.front.name)} has its longest night. I let the black candle burn down to nothing. The campaign is over.`];
}

const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, n: number, max: number): string[] => (Array.isArray(v) ? v.map((x) => clean(x, max)).filter((x) => x.length >= 3).slice(0, n) : []);

/**
 * A big bad a model wrote (6.1), checked by code: a name, what it wants, six steps, its hands, three keys. Whatever is
 * missing or unfit comes from the stock one given, so a campaign always has a whole front.
 */
export function checkFront(raw: unknown, stock: Front): Front {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = clean(r.name, 60);
  const wants = clean(r.wants, 160);
  const steps = list(r.steps, RINGS, 120);
  const hands = list(r.hands, 4, 80);
  const keys = list(r.keys, 3, 120);
  return {
    name: name.length >= 3 ? name : stock.name,
    wants: wants.length >= 6 ? wants : stock.wants,
    steps: steps.length === RINGS ? steps : stock.steps,
    hands: hands.length ? hands : stock.hands,
    keys: keys.length === 3 ? [keys[0]!, keys[1]!, keys[2]!] : stock.keys,
  };
}
