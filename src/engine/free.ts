/**
 * Free form (docs/DESIGN.md 3.2, docs/MOONSHOT.md, free form): no story and no goal, only the world and whatever you do
 * in it. Theatre of the mind: no map is laid and no road is dealt; the narrator holds the places in its notebook.
 *
 * It is played with what the stories are played with. The place you are at is a stop in your way that never stands in
 * your way: every way is open at it, and a try is thrown only when what you do could go wrong. After a try the place is
 * as it was, a fresh moment, so each risky thing is its own (the die, your stats, the prices and the clock are the
 * same as ever). Your goals, waits and work are the world's rows (world.ts), as in a story.
 *
 * What is new is the threads: two or three things in the air, each on a clock of its own. Leave one, and every few
 * hours it takes a step without you; at its last step it is gone. Pull on one, and it becomes a story of its kind
 * (content/tropes.ts), played out on its own road, after which you are back where you were.
 *
 * Everything here is code: nothing a model says moves a clock or opens a thread.
 */
import type { Adventure, Companion, RoadStop, Trip } from "./adventure.js";
import { seededRng } from "./dice.js";
import { startMoment, WAYS, type Way } from "./moment.js";
import type { ContentSettings } from "./content.js";
import type { WorldKit } from "./kit.js";
import { hourSaid } from "./schedule.js";
import type { Family } from "../content/tropes.js";

/** The trope an adventure in free form carries (adventure.ts, `trope`), so a sitting kept in it is taken up as one. */
export const FREE_TROPE = "free";

/** A place you have been to in free form, as the narrator's notebook keeps it. */
export interface FreePlace {
  id: string;
  name: string;
  /** What it is like, as it was first told. */
  said: string;
}

/** Something in the air: on a clock of its own, and a story of its kind if you pull on it. */
export interface Thread {
  id: string;
  family: Family;
  /** What it is, as the narrator says it. */
  said: string;
  /** Words in a line that pull on it. */
  words: string;
  /** What happens if it is left, one step at a time; the last step, and it is gone. */
  steps: string[];
  /** Steps taken so far. */
  step: number;
  /** Hours between its steps. */
  every: number;
  /** The hour its last step (or the start) was at. */
  since: number;
  /** Played out as a story, or gone by while you were elsewhere. */
  done?: "played" | "gone";
}

/** The world of free form, kept on its adventure (adventure.ts, `free`). */
export interface FreeWorld {
  /** The id of the place you are at. */
  here: string;
  places: FreePlace[];
  threads: Thread[];
  /** The last few things that happened, so the narrator remembers them (newest last). */
  log: string[];
  /** The world it is all in, from the card, in a few lines: so the narrator says every place as part of it. */
  setting?: string;
}

/** How many things that happened the narrator keeps in mind. */
export const LOG_MAX = 6;
/** Going from one place to another, in free form, takes this long. */
export const GO_HOURS = 0.5;
/** The free clock never runs out: no deadline is ever reached. */
export const NO_DEADLINE = 1e6;

/** The stock threads, one for each kind of story that can be in the air (romance is played, not left to a clock). */
const STOCK: Record<Exclude<Family, "romance">, { said: string; words: string; steps: string[] }[]> = {
  rescue: [
    { said: "Someone has gone missing, and nobody whose job it is will look for them.", words: "missing|gone|taken|kidnap|look for", steps: ["A second person has gone missing, from the same streets.", "Someone saw them taken, and says where they were taken to.", "Whoever took them has moved on, and taken them along. The trail is cold."] },
    { said: "A debtor's child is to be handed over at the end of the week, to settle what is owed.", words: "debt|child|handed over|owed", steps: ["The day is fixed, and the buyer named.", "The family has tried to run, and been brought back.", "The child has been handed over. It is done."] },
  ],
  heist: [
    { said: "Something worth a great deal is to change hands soon, under guard.", words: "worth|change hands|guard|valuable|shipment", steps: ["The guard on it has been doubled.", "The day it moves has been brought forward.", "It has changed hands, and it is out of reach now."] },
    { said: "Someone was robbed of the one thing they cared about, and wants it back.", words: "robbed|stolen|want it back|took it", steps: ["The thief is boasting of it.", "It is to be sold on, to someone far away.", "It has been sold, and carried off."] },
  ],
  mystery: [
    { said: "A death nobody can explain, and the talk about it will not die down.", words: "death|died|dead|murder|explain|body", steps: ["A second death, the same as the first.", "Someone is taken up for it, and they did not do it.", "The one taken up hangs for it. The talk stops."] },
    { said: "Lights and voices where there should be nobody, every night now.", words: "lights|voices|nobody|haunt|every night", steps: ["Someone who went to look has not come back right.", "The lights are nearer the houses each night.", "Whatever it was has done what it came for, and gone quiet."] },
  ],
  journey: [
    { said: "A letter has to get through to someone a long way off, and the roads are watched.", words: "letter|message|get through|deliver|road", steps: ["The one who wrote it has been taken in for questioning.", "The roads are closed to anyone without papers.", "The one it was for has heard nothing, and acted without it."] },
    { said: "A family has to be got out before the people hunting them arrive.", words: "family|got out|hunting|escape|flee", steps: ["The hunters are a day away.", "The hunters are in the next town.", "The hunters have found them."] },
  ],
  hunt: [
    { said: "Something has been killing at the edge of the settled land, a little closer each time.", words: "killing|beast|creature|edge|hunt", steps: ["It has killed again, nearer than before.", "It has been seen in daylight.", "It has killed in the middle of everyone, and gone back to the wild."] },
    { said: "There is a price on someone's head, and everyone knows where they drink.", words: "price|bounty|head|wanted|reward", steps: ["Others have heard of the price, and are asking.", "Someone else has gone after them.", "Someone else has collected."] },
  ],
  survival: [
    { said: "A storm is coming, the worst in years, and not everyone has a roof that will hold.", words: "storm|weather|roof|shelter", steps: ["The sky has gone the wrong colour.", "The wind has started, and the first roofs are going.", "The storm has come and gone, and taken what it took."] },
    { said: "Food is running short, and the stores are kept locked by the few who have them.", words: "food|hungry|stores|starv|locked", steps: ["The price of bread has doubled.", "There has been a fight at the doors of the stores.", "The stores have been broken open, and blood spilled over them."] },
  ],
};

const THREAD_FAMILIES = Object.keys(STOCK) as Exclude<Family, "romance">[];

/** Two threads for a world: different kinds, drawn by the seed, each on a clock of its own. */
export function stockThreads(seed: string, hour: number, n = 2): Thread[] {
  const rng = seededRng(`${seed}:threads`);
  const pool = [...THREAD_FAMILIES];
  const threads: Thread[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const family = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
    const kinds = STOCK[family];
    const k = kinds[Math.floor(rng() * kinds.length)]!;
    // One quick and one slow: something to do tonight, and something that can wait a day or so.
    threads.push({ id: `thread-${i + 1}`, family, said: k.said, words: k.words, steps: [...k.steps], step: 0, every: i === 0 ? 6 : 10, since: hour });
  }
  return threads;
}

/** What a model wrote for a night of free form, before code checks it (prompts.ts, freeWorldMessages). */
export interface FreeDraft {
  place?: { name: string; said: string };
  threads: Thread[];
}

/** The name the start place has until something better is known. */
export const START_NAME = "the place you started";

const clean = (x: unknown, min: number, max: number): string | null => {
  if (typeof x !== "string") return null;
  const t = x.replace(/[*_#`]+/g, "").replace(/\s+/g, " ").trim();
  return t.length >= min && t.length <= max ? t : null;
};
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A model's night of free form, checked: the place you start at (a short name, and what it is like), and two threads
 * of different kinds, each with words that pull on it and three steps it takes if left. Whatever does not check is
 * left out, and the stock threads make up the two; the clocks are code's, one quick and one slow.
 */
export function checkFreeWorld(raw: unknown, seed: string, hour: number): FreeDraft {
  const stock = stockThreads(seed, hour, 3);
  const j = (raw && typeof raw === "object" ? raw : {}) as { place?: { name?: unknown; said?: unknown }; threads?: unknown };
  const name = clean(j.place?.name, 2, 60);
  const said = clean(j.place?.said, 10, 400);
  const place = name && said && name.split(/\s+/).length <= 8 ? { name: placeSaid(name.replace(/[.!]+$/, "")), said } : undefined;
  const drafts: Omit<Thread, "id" | "every" | "since" | "step">[] = [];
  for (const t of Array.isArray(j.threads) ? j.threads : []) {
    const x = (t && typeof t === "object" ? t : {}) as { kind?: unknown; family?: unknown; said?: unknown; words?: unknown; steps?: unknown };
    const family = String(x.kind ?? x.family ?? "").toLowerCase() as Exclude<Family, "romance">;
    if (!THREAD_FAMILIES.includes(family) || drafts.some((d) => d.family === family)) continue;
    const tsaid = clean(x.said, 10, 240);
    const steps = Array.isArray(x.steps) ? x.steps.map((s) => clean(s, 5, 200)).filter((s): s is string => !!s) : [];
    const words = (Array.isArray(x.words) ? x.words : [])
      .map((w) => (typeof w === "string" ? w.toLowerCase().replace(/[^\p{L}\p{N} '-]/gu, "").replace(/\s+/g, " ").trim() : ""))
      .filter((w) => w.length >= 3 && w.length <= 30)
      .slice(0, 8);
    if (!tsaid || steps.length < 3 || !words.length) continue;
    drafts.push({ family, said: tsaid, words: words.map(escapeRe).join("|"), steps: steps.slice(0, 3) });
    if (drafts.length === 2) break;
  }
  for (const s of stock) {
    if (drafts.length >= 2) break;
    if (!drafts.some((d) => d.family === s.family)) drafts.push({ family: s.family, said: s.said, words: s.words, steps: s.steps });
  }
  const threads = drafts.slice(0, 2).map((d, i) => ({ ...d, id: `thread-${i + 1}`, step: 0, every: i === 0 ? 6 : 10, since: hour }));
  return { ...(place ? { place } : {}), threads };
}

const NAMED_PLACE = /\b(?:at|in|inside|into|outside|beneath|under|on|aboard|of|from|near|by|behind)\s+(the\s+[A-Z][\p{L}'’-]+(?:\s+(?:of\s+(?:the\s+)?)?[A-Z][\p{L}'’-]+){0,3})/u;

/** A place named in what the narrator said ("…the back room of the Gilded Eel…" → "the Gilded Eel"), or null. */
export function placeIn(text: string): string | null {
  const m = NAMED_PLACE.exec(text);
  return m ? m[1]!.replace(/\s+/g, " ").replace(/^The\s/, "the ") : null;
}

/** The start place named, when it still has only the name it began with. */
export function nameStart(t: Trip, name: string): Trip {
  const w = freeOf(t);
  if (!w || !name) return t;
  const first = w.places[0];
  if (!first || first.name !== START_NAME) return t;
  const places = w.places.map((p) => (p.id === first.id ? { ...p, name } : p));
  const adv = { ...t.adv, places: t.adv.places.map((p) => (p.id === first.id ? { ...p, name } : p)), free: { ...w, places } };
  return faceScene({ ...t, adv });
}

/** The place you are at. */
export const hereOf = (w: FreeWorld): FreePlace => w.places.find((p) => p.id === w.here) ?? w.places[0]!;

/** What the narrator has in mind at a place: what it is like, and what has just happened there. */
export function sceneSituation(w: FreeWorld): string {
  const p = hereOf(w);
  const lately = w.log.length ? ` What has just happened: ${w.log.join(" ")}` : "";
  // The place first, so a prompt that cuts the situation short still has it; the world it is in after.
  const world = w.setting ? ` The world it is in: ${w.setting}` : "";
  return `Here: ${p.said} Nothing here stands in the player's way: they are free to do as they like, and only something that could go wrong is a try.${lately}${world}`;
}

/** The place you are at, as a stop: every way open at it, none of them hard, and nothing to get past. */
export function sceneStop(w: FreeWorld): RoadStop {
  const p = hereOf(w);
  const ways = Object.fromEntries(WAYS.map((x) => [x, x === "pay" ? { difficulty: 1, price: 1 } : { difficulty: 1 }])) as RoadStop["ways"];
  return { id: p.id, name: p.name, kind: "obstacle", card: "crossing", teaser: "", situation: sceneSituation(w), ways, levers: [] };
}

/** The free world on a trip. */
export const freeOf = (t: Trip): FreeWorld | null => t.adv.free ?? null;

/** The trip with a new free world on it. */
export const withFree = (t: Trip, w: FreeWorld): Trip => ({ ...t, adv: { ...t.adv, free: w } });

/**
 * The place you are at, standing before you as a fresh moment: what failed a moment ago is not shut now, and nothing
 * has grown harder, but your sheet, your marks against you and your abilities are as they are.
 */
export function faceScene(t: Trip): Trip {
  const w = freeOf(t);
  if (!w) return t;
  const stop = sceneStop(w);
  const moment = {
    ...startMoment(stop, { ...t.sheet, stats: { ...t.sheet.stats } }, `${t.seed}:${stop.id}:${t.sheet.hour.toFixed(2)}`),
    abilities: t.abilities.filter((a) => !t.storyUsed.includes(a.id)),
    used: [],
    against: t.against ?? [],
    company: t.party.length,
  };
  return { ...t, at: stop.id, facing: { stop, moment, holds: 1 } };
}

/** An adventure that is no story: only the world, the place you start at, and the threads in the air. */
export function freeAdventure(o: { seed: string; who: string; world: string; start: { name: string; said: string }; startHour: number; kit?: WorldKit; content?: ContentSettings; companion?: Companion; threads?: Thread[]; setting?: string }): Adventure {
  const start: FreePlace = { id: "place-1", name: o.start.name, said: o.start.said };
  const seedNum = [...o.seed].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  return {
    id: `free-${o.seed}`,
    title: `Free in ${o.world}`,
    trope: FREE_TROPE,
    goal: "There is no job tonight: only the world, and whatever you do in it.",
    who: o.who,
    seed: seedNum,
    places: [{ id: start.id, name: start.name, u: 0.5, v: 0.5 }],
    start: start.id,
    roads: [],
    stops: [],
    startHour: o.startHour,
    deadline: { hour: NO_DEADLINE, name: "never", lost: "" },
    companions: o.companion ? [o.companion] : [],
    ...(o.companion ? { party: [o.companion.id] } : {}),
    loot: [],
    won: "",
    ...(o.kit ? { kit: o.kit } : {}),
    ...(o.content ? { content: o.content } : {}),
    free: { here: start.id, places: [start], threads: o.threads ?? stockThreads(o.seed, o.startHour), log: [], ...(o.setting ? { setting: o.setting } : {}) },
  };
}

/* ------------------------------ reading a line ------------------------------ */

const GO = /\b(?:i|we)\s+(?:'ll\s+|will\s+|should\s+|want to\s+|wanna\s+)?(?:go|head|walk|ride|drive|run|make (?:my|our) way|set off|travel|return|get|take (?:a|the) (?:cab|taxi|train|bus|boat|ship|ferry|carriage|coach)|move on)\s+(?:back\s+)?(?:(?:over|out|down|up|across|along|off|on)\s+)?(?:to|towards?|into|for)\s+(.+)$/i;
const LEAVE_HERE = /\b(?:i|we)\s+(?:leave|walk out(?: of)?|get out of|step out(?: of)?)\b/i;

/** The place a line goes to ("I head to the docks", "we go back to the inn"), in a few words; null when it goes nowhere. */
export function placeNamed(line: string): string | null {
  const m = GO.exec(line.split(/[.;!?]/)[0] ?? "");
  if (!m) return null;
  const name = m[1]!
    .replace(/\s*(?:,|\band\b|\bto (?:see|find|ask|get|look|meet|buy|talk)\b|\bwith\b|\bfor (?:a|an|some)\b).*$/i, "")
    .replace(/[.!?,;:]+$/, "")
    .trim();
  if (!name || name.split(/\s+/).length > 7 || /^(it|him|her|them|bed|sleep|work|this|that)$/i.test(name)) return null;
  return name;
}

/** Whether a line leaves the place you are at without saying where to (then the narrator asks where). */
export const leavesHere = (line: string): boolean => LEAVE_HERE.test(line) && !placeNamed(line);

const norm = (s: string): string => s.toLowerCase().replace(/^(the|a|an)\s+/, "").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

/** A place you have been to before, by its name in a line. */
export function knownPlace(w: FreeWorld, name: string): FreePlace | null {
  const n = norm(name);
  return w.places.find((p) => norm(p.name) === n) ?? w.places.find((p) => n.length >= 4 && (norm(p.name).includes(n) || n.includes(norm(p.name)))) ?? null;
}

/** A name as the narrator says it: "the docks", "Mara's house", "Kettle Street". */
export function placeSaid(name: string): string {
  const n = name.replace(/^(?:my|our)\s+/i, "your ").trim();
  if (/^(the|a|an|your)\s/i.test(n) || /^[A-Z]/.test(n)) return n.replace(/^(The|A|An)\s/, (x) => x.toLowerCase());
  return `the ${n}`;
}

/**
 * Go to a place: one you have been to, or a new one (with what it is like, when that is known). The going takes
 * half an hour; the place stands before you as a fresh moment.
 */
export function goneTo(t: Trip, name: string, said?: string): { trip: Trip; place: FreePlace; known: boolean } {
  const w = freeOf(t)!;
  const old = knownPlace(w, name);
  const place: FreePlace = old ?? { id: `place-${w.places.length + 1}`, name: placeSaid(name), said: said ?? `${placeSaid(name).replace(/^./, (c) => c.toUpperCase())}.` };
  const places = old ? w.places : [...w.places, place];
  const adv = { ...t.adv, places: old ? t.adv.places : [...t.adv.places, { id: place.id, name: place.name, u: 0.5, v: 0.5 }], free: { ...w, here: place.id, places, log: [] } };
  const moved: Trip = { ...t, adv, sheet: { ...t.sheet, hour: t.sheet.hour + GO_HOURS } };
  return { trip: faceScene(moved), place, known: !!old };
}

/** What a new place is like, told once, kept in the notebook. */
export function describe(t: Trip, id: string, said: string): Trip {
  const w = freeOf(t)!;
  const text = said.replace(/\s+/g, " ").trim().slice(0, 400);
  if (!text) return t;
  return faceScene(withFree(t, { ...w, places: w.places.map((p) => (p.id === id ? { ...p, said: text } : p)) }));
}

/** Something that happened, kept in mind (the last few only), and the place standing as it now is. */
export function remember(t: Trip, line: string, said: string): Trip {
  const w = freeOf(t);
  if (!w) return t;
  const clip = (s: string, n: number): string => {
    const x = s.replace(/\s+/g, " ").trim();
    return x.length > n ? `${x.slice(0, n).replace(/\s+\S*$/, "")}…` : x;
  };
  const entry = `The player: ${clip(line, 140)}${said ? ` Then: ${clip(said, 180)}` : ""}`;
  const log = [...w.log, entry].slice(-LOG_MAX);
  const next = withFree(t, { ...w, log });
  return next.facing ? { ...next, facing: { ...next.facing, stop: { ...next.facing.stop, situation: sceneSituation({ ...w, log }) }, moment: { ...next.facing.moment, stop: { ...next.facing.moment.stop, situation: sceneSituation({ ...w, log }) } } } } : next;
}

/* ------------------------------ the threads ------------------------------ */

/** The threads still in the air. */
export const openThreads = (w: FreeWorld): Thread[] => w.threads.filter((x) => !x.done);

/**
 * The clock has moved on: every thread left alone takes the steps its hours allow, said as word reaching you; at its
 * last step it is gone.
 */
export function threadsRun(t: Trip): { trip: Trip; lines: string[] } {
  const w = freeOf(t);
  if (!w) return { trip: t, lines: [] };
  const lines: string[] = [];
  const threads = w.threads.map((x) => {
    if (x.done) return x;
    let th = { ...x };
    while (!th.done && t.sheet.hour - th.since >= th.every) {
      const said = th.steps[th.step];
      th = { ...th, step: th.step + 1, since: th.since + th.every };
      if (said) lines.push(th.step >= th.steps.length ? `Word reaches you: ${said} That is over now, whatever you might have done.` : `Word reaches you: ${said}`);
      if (th.step >= th.steps.length) th = { ...th, done: "gone" };
    }
    return th;
  });
  return { trip: withFree(t, { ...w, threads }), lines };
}

const PULL = /\b(look into|looking into|follow(?:ing)? up|take (?:it|this|that|the job) on|take on|get involved|help (?:with|them|her|him)|deal with|go after|find out|track|chase|investigate|do something about|i'?ll (?:do|take) it|pull on)\b/i;

/** The thread a line pulls on: one it names by number ("the first thread", "thread 2") or by its words, with a will to act. */
export function threadPulled(t: Trip, line: string): Thread | null {
  const w = freeOf(t);
  if (!w) return null;
  const open = openThreads(w);
  const num = /\b(?:thread|rumou?r|story)\s*(?:number\s*)?(\d)\b|\b(first|second|third)\s+(?:thread|rumou?r|one)\b/i.exec(line);
  if (num) {
    const i = num[1] ? Number(num[1]) - 1 : ["first", "second", "third"].indexOf(num[2]!.toLowerCase());
    const byNumber = w.threads[i];
    if (byNumber && !byNumber.done) return byNumber;
  }
  if (!PULL.test(line)) return null;
  const hits = open.filter((x) => new RegExp(`\\b(${x.words})`, "i").test(line));
  return hits.length === 1 ? hits[0]! : null;
}

/** A thread played out as a story: it is done, whatever came of it. */
export function threadPlayed(t: Trip, id: string): Trip {
  const w = freeOf(t);
  if (!w) return t;
  return withFree(t, { ...w, threads: w.threads.map((x) => (x.id === id ? { ...x, done: "played" as const } : x)) });
}

/** How the threads are put to you when free form begins. */
export function threadsSaid(w: FreeWorld): string {
  const open = openThreads(w);
  if (!open.length) return "Nothing much is in the air tonight.";
  const nth = ["First", "Second", "Third"];
  return `There ${open.length === 1 ? "is one thing" : `are ${open.length === 2 ? "two" : "three"} things`} in the air. ${open.map((x, i) => `${nth[i] ?? "And"}: ${x.said}`).join(" ")} Pull on one and it becomes a story; leave it, and it will not wait for you.`;
}

/** Asked when you pull on a thread. */
export const pullAsk = (x: Thread): string => `That is a story of its own: ${x.said.replace(/[.]+$/, "")}. Shall we play it out now? Write yes, or that you would rather not yet.`;

/* ------------------------------ the notebook ------------------------------ */

/** The narrator's notebook, in place of a map: where you are, the places you know, the threads, the hour. */
export function notebookPage(t: Trip): { heading: string; his: string[] } {
  const w = freeOf(t)!;
  const here = hereOf(w);
  const others = w.places.filter((p) => p.id !== here.id).map((p) => p.name);
  const threads = w.threads.map((x, i) => `${i + 1}. ${x.said}${x.done === "played" ? " (played out)" : x.done === "gone" ? " (gone by)" : x.step ? ` (it has moved ${x.step === 1 ? "once" : `${x.step} times`})` : ""}`);
  return {
    heading: "The narrator's notebook",
    his: [`You are at ${here.name}. It is ${hourSaid(t.sheet.hour)}.`, ...(others.length ? [`Places you know: ${others.join(", ")}.`] : []), ...(threads.length ? ["In the air:", ...threads] : [])],
  };
}

/* ------------------------------ risk ------------------------------ */

/**
 * Asking someone for what they could refuse ("I ask the bouncer to let me in", "I get the clerk to show me the
 * ledger"): opposed, even when no word of it is a fight or a trick.
 */
const OPPOSED = /\b(?:ask|beg|tell|order|get|make|talk|plead with|urge)\s+(?:[\w'’-]+\s+){0,4}(?:to|into)\s+(?:let|give|allow|open|lend|hand|show|sell|spare|forgive|drop|stand aside|step aside|back off|tell me|look the other way|take me|keep quiet)\b|\b(?:get|slip|talk (?:my|our) way|sweet[- ]talk (?:my|our) way)\s+(?:past|in|inside|through)\b|\b(?:demand|insist|negotiat|plead|beg)\w*|\b(?:try|attempt)(?:ing)?\s+to\b|\bwithout (?:being|getting) (?:seen|noticed|caught|heard)\b/i;
const RISK = /\b(sneak|steal|pickpocket|pick (?:the|a|his|her) (?:lock|pocket)|lie|lying|bluff|trick|con|persuade|convince|threaten|intimidate|fight|attack|punch|hit|stab|shoot|kill|wrestle|tackle|climb|leap|jump|chase|run (?:from|after)|escape|flee|hide|break (?:in|into|down|open|free)|force|bribe|haggle|bargain|seduce|charm|forge|smuggle|grab|snatch|cast|spell|hack|duel|swim|dodge|ambush|follow (?:him|her|them) without|spy|eavesdrop)\w*/i;

/** Whether a line does something that could go wrong, by its words alone: only then is a die called for. */
export const riskyWords = (line: string): boolean => RISK.test(line) || OPPOSED.test(line);

/** The question put to the Decision model, for whether a line calls for the die. */
export const RISK_QUESTION = "In a free roleplay, does what the player does here call for a dice roll: is it risky or opposed, so it could go wrong in a way that matters?";
export const RISK_OPTIONS = { yes: "yes: risky, opposed or uncertain, and failing would cost something", no: "no: ordinary, safe, or just talk, a look or a question" } as const;

/** The ways open at a free scene, for anything that names one. */
export const FREE_WAYS: readonly Way[] = WAYS;

/** A card's words as plain lines for the narrator: no markup, no macros, one paragraph, at most `max` letters. */
export function plainCard(text: string, max: number): string {
  const t = text.replace(/<[^>]*>/g, " ").replace(/\{\{[^}]*\}\}/g, "").replace(/[#*_`>]+/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/** The hour, said, for lines in free form. */
export const nowSaid = (t: Trip): string => `It is ${hourSaid(t.sheet.hour)}.`;
