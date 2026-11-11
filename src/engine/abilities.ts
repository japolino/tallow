/**
 * Abilities: one skeleton for every world (docs/SYSTEMS.md, 3).
 *
 * Code owns a short list of verbs: what an ability does at the table, how often, at what price. A model owns the
 * words: its name, what it looks like, when it applies. Every record is priced here against a point budget and mended
 * until it fits, so nothing a model writes can make a hero stronger than the budget allows, and a teleport is only
 * ever what its verb says it is.
 *
 * The shape (trick, knack, gift, rite) is never taken from a model: it follows from the verb and the usage.
 */
import { seededRng } from "./dice.js";
import { ALL_STATS, STATS, WAYS, type Stat, type Way } from "./moment.js";

/** What an ability does, in the rules. */
/** reach, bind, sweep and drain are fight verbs (docs/MOONSHOT.md, 7.4): they do something only in a contest. */
export type Verb = "flourish" | "learn" | "ease" | "mark" | "sway" | "mend" | "aid" | "ward" | "edge" | "open" | "slip" | "reach" | "bind" | "sweep" | "drain";
/** How often it can be used: whenever it applies, once at each stop, or once a story. */
export type Often = "always" | "stop" | "story";
/** What kind of card it is, which follows from what it does and how often. */
export type Shape = "trick" | "knack" | "gift" | "rite";

export const VERBS: readonly Verb[] = ["flourish", "learn", "ease", "mark", "sway", "mend", "aid", "ward", "edge", "open", "slip", "reach", "bind", "sweep", "drain"];
/** The fight verbs: played on a try in a contest. */
export const FIGHT_VERBS: ReadonlySet<Verb> = new Set(["reach", "bind", "sweep", "drain"]);

/** The price of each verb at a strength of 1 (docs/SYSTEMS.md, 3.3). */
export const VERB_PRICE: Record<Verb, number> = { flourish: 0, learn: 1, ease: 1, mark: 1, sway: 1, mend: 1, aid: 1, ward: 2, edge: 2, open: 2, slip: 3, reach: 1, bind: 2, sweep: 3, drain: 3 };
/** The most strength each verb can have. */
export const VERB_MAX: Record<Verb, number> = { flourish: 0, learn: 1, ease: 3, mark: 2, sway: 2, mend: 2, aid: 2, ward: 2, edge: 1, open: 1, slip: 1, reach: 1, bind: 1, sweep: 1, drain: 1 };
/** Verbs played on a try (with the die); the rest are used without one (a "setup"). */
export const ON_A_TRY: ReadonlySet<Verb> = new Set(["ease", "edge", "open", "ward", "slip", "aid", "sway", "reach", "bind", "sweep", "drain"]);

/** What each verb does, said plainly: for the narrator, for the model that tells, and for the first page. */
export const VERB_SAYS: Record<Verb, string> = {
  flourish: "it happens in the story and changes no rule by itself; used cleverly towards the goal, it can leave something to lean on",
  learn: "the narrator tells you one true, useful thing, which you can lean on once",
  ease: "a try is a step easier",
  mark: "it puts something in the scene that you can lean on",
  sway: "one person here is warmer to you: talking to them is a step easier for the rest of the stop",
  mend: "you get some back of what you have lost",
  aid: "a companion's help counts for more",
  ward: "a cost you would pay is not paid",
  edge: "you throw two dice and keep the better",
  open: "a way that is shut here, or was never offered, is open for one try",
  slip: "a try that fails works at a cost instead",
  reach: "in a fight, you strike from out of their reach: the blow back is one lighter",
  bind: "in a fight, the next blow coming at you does not come",
  sweep: "in a fight, what your try does goes on every foe, not only one",
  drain: "in a fight, what your try takes off them comes back off your own dial",
};

export interface Ability {
  id: string;
  /** Two to four words of our own. */
  name: string;
  /** What it looks like in the story, in a sentence. */
  looks: string;
  does: Verb;
  /** How strong: steps, uses, or points, by verb. 0 for a flourish. */
  much: number;
  /** The ways it helps; empty for any way. */
  ways: Way[];
  /** Words that say when it applies (a narrow situation); empty for whenever its ways are tried. */
  tags: string[];
  often: Often;
  /** It costs 1 of the store each time. */
  store: boolean;
  /** What it gives back, for a mend. */
  of?: "health" | "supplies" | "goodwill";
  /** A limit in words ("only food you have touched"). */
  limit?: string;
  /** Its card's kind (cards.ts). */
  card: string;
}

/** What a hero is, in a word and a line: written for the hero by a model, or one of the stock ones. */
export interface Calling {
  name: string;
  line: string;
  /** The two stats it leans on. */
  leans: Stat[];
  /** The store's name in this calling: heat, nerve, favours, breath. */
  store: string;
  /** The flaw that can make trouble. */
  fault: string;
}

export const shapeOf = (a: Ability): Shape => (a.does === "flourish" ? "trick" : a.store ? "gift" : a.often === "story" ? "rite" : "knack");
export const SHAPE_NAME: Record<Shape, string> = { trick: "trick", knack: "knack", gift: "gift", rite: "rite" };

/** The store a hero has at a level: 3, and 1 more for each level after the first. */
export const storeAt = (level: number): number => 2 + Math.max(1, Math.round(level));
/** What all a hero's abilities may cost together, at a level. */
export const budgetAt = (level: number): number => 6 + 2 * (Math.max(1, Math.round(level)) - 1);
/** The most one ability may cost, at a level. */
export const capAt = (level: number): number => 3 + Math.floor(Math.max(1, Math.round(level)) / 2);

/** What an ability costs (docs/SYSTEMS.md, 3.3): multiply first, then add and take off, then round up. */
export function priceOf(a: Ability): number {
  if (a.does === "flourish") return 0;
  const mult = a.store ? 1 : a.often === "always" ? 2 : a.often === "stop" ? 1 : 0.5;
  let p = VERB_PRICE[a.does] * Math.max(1, a.much) * mult;
  if (a.tags.length) p -= 1;
  else if (!a.ways.length) p += 2;
  if (a.limit) p -= 1;
  return Math.max(1, Math.ceil(p - 1e-9));
}

/** The card an ability lies on, by what it does. */
const VERB_CARD: Record<Verb, string> = { flourish: "lantern", learn: "key", ease: "token", mark: "purse", sway: "beloved", mend: "fire", aid: "companion", ward: "guardian", edge: "contest", open: "gate", slip: "climb", reach: "contest", bind: "guardian", sweep: "contest", drain: "beloved" };

/** A string as given, its spaces tidied, cut at a word (never mid-word) to at most `max` letters. */
const clean = (s: unknown, max: number): string => {
  if (typeof s !== "string") return "";
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1).replace(/\s+\S*$/, "");
  return (cut || t.slice(0, max)).replace(/[\s,;:-]+$/, "");
};
/** A tag, cut short at a word and with no small word left hanging at its end ("a crowd turning against" is "a crowd turning"). */
const tagOf = (t: unknown): string => {
  let s = clean(t, 24).toLowerCase();
  while (/\s(for|against|of|to|with|at|on|the|a|an|and|or|about|from|in|into|by|you|your)$/.test(s)) s = s.replace(/\s\S+$/, "");
  return s;
};
const words = (s: string): string[] => s.toLowerCase().split(/[^\p{L}']+/u).filter(Boolean);

/**
 * Names that belong to existing games and are kept out (docs/SYSTEMS.md, 3.4): a short list of the best known. A
 * model that uses one gets its ability renamed.
 */
const NOT_OURS = /\b(prestidigitation|thaumaturgy|druidcraft|eldritch blast|magic missile|fireball|cure wounds|healing word|vicious mockery|sneak attack|second wind|action surge|wild shape|lay on hands|divine smite|bardic inspiration|cunning action|channel divinity|mage hand|minor illusion|thunderwave|shillelagh|counterspell)\b/i;

/** Words a "looks like" must not have: it says what the ability is, not that it wins. */
const CLAIMS = /\b(you win|always succeeds?|automatically|instantly (?:defeat|kill|win)|kills? (?:anyone|everyone)|cannot fail|no matter what)\b/i;

/**
 * An ability from a model's answer, cleaned: unknown verbs and usages are refused, strengths and words are clamped,
 * and a name from another game is replaced. Null when it cannot be read. It is not priced here; `fitAbility` does that.
 */
export function readAbility(raw: unknown, id: string): Ability | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const does = VERBS.includes(o.does as Verb) ? (o.does as Verb) : null;
  if (!does) return null;
  let name = clean(o.name, 40).replace(/[.!?]+$/, "");
  if (!name || words(name).length > 4) return null;
  if (NOT_OURS.test(name)) name = "";
  let looks = clean(o.looks, 200);
  if (!looks || CLAIMS.test(looks)) looks = "";
  if (!name || !looks) return null;
  const ways = Array.isArray(o.ways) ? [...new Set(o.ways.filter((w): w is Way => WAYS.includes(w as Way)))] : [];
  // A tag that would match nearly every line is no narrow situation.
  const tags = Array.isArray(o.tags) ? [...new Set(o.tags.map((t) => tagOf(t)).filter((t) => t.length >= 3 && !/^(the|and|you|any|all|thing|things|people|someone|anyone|place|time)$/.test(t)))].slice(0, 6) : [];
  const often: Often = o.often === "story" ? "story" : o.often === "stop" ? "stop" : "always";
  const store = o.store === true && does !== "flourish";
  const much = does === "flourish" ? 0 : Math.max(1, Math.min(VERB_MAX[does], Math.round(Number(o.much) || 1)));
  const of: Ability["of"] = does === "mend" ? (["health", "supplies", "goodwill"].includes(o.of as string) ? (o.of as Ability["of"]) : "health") : undefined;
  const limit = clean(o.limit, 120) || undefined;
  return {
    id,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    looks,
    does,
    much,
    ways: does === "flourish" ? [] : does === "sway" ? ["talk"] : ways,
    tags,
    often: does === "flourish" ? "always" : often,
    store,
    ...(of ? { of } : {}),
    ...(limit ? { limit } : {}),
    card: VERB_CARD[does],
  };
}

/**
 * An ability made to cost no more than `cap` (docs/SYSTEMS.md, 3.3), mended in this order until it does: narrow how
 * often, then make it cost the store, then lower its strength. Null if it still cannot fit.
 */
export function fitAbility(a: Ability, cap: number): Ability | null {
  let b = { ...a, ways: [...a.ways], tags: [...a.tags] };
  if (b.does === "flourish") return { ...b, much: 0, often: "always", store: false, ways: [] };
  const steps: ((x: Ability) => Ability | null)[] = [
    (x) => (x.often === "always" && !x.store ? { ...x, often: "stop" } : null),
    (x) => (x.often === "stop" && !x.store ? { ...x, often: "story" } : null),
    (x) => (!x.store && x.often !== "story" ? { ...x, store: true } : null),
    (x) => (x.much > 1 ? { ...x, much: x.much - 1 } : null),
    (x) => (!x.tags.length && !x.ways.length ? { ...x, ways: [WAYS[0]!] } : null),
  ];
  for (let guard = 0; priceOf(b) > cap && guard < 12; guard++) {
    const next = steps.map((s) => s(b)).find((x): x is Ability => !!x);
    if (!next) return null;
    b = next;
  }
  return priceOf(b) <= cap ? b : null;
}

/** What a hand of abilities costs together. Tricks are free. */
export const handPrice = (hand: readonly Ability[]): number => hand.reduce((n, a) => n + priceOf(a), 0);

/**
 * A hero's abilities made to keep to the budget at their level: each to the cap for one, then the whole hand to the
 * budget, the dearest mended first. At most two tricks are kept.
 */
export function fitHand(hand: readonly Ability[], level: number): Ability[] {
  const cap = capAt(level), budget = budgetAt(level);
  let tricks = 0;
  const out: Ability[] = [];
  for (const a of hand) {
    if (a.does === "flourish" && ++tricks > 2) continue;
    const f = fitAbility(a, cap);
    if (f && !out.some((x) => x.id === f.id)) out.push(f);
  }
  for (let guard = 0; handPrice(out) > budget && guard < 20; guard++) {
    const dearest = [...out].sort((x, y) => priceOf(y) - priceOf(x))[0]!;
    const cheaper = fitAbility(dearest, priceOf(dearest) - 1);
    const i = out.indexOf(dearest);
    if (cheaper && priceOf(cheaper) < priceOf(dearest)) out[i] = cheaper;
    else out.splice(i, 1);
  }
  return out;
}

/** A calling from a model's answer, cleaned; the kind's own words where it says nothing usable. */
export function readCalling(raw: unknown, fallback: Calling): Calling {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const leans = Array.isArray(o.leans) ? [...new Set(o.leans.filter((s): s is Stat => ALL_STATS.includes(s as Stat)))].slice(0, 2) : [];
  const name = clean(o.name, 32);
  return {
    name: name && words(name).length <= 3 && !NOT_OURS.test(name) ? name : fallback.name,
    line: clean(o.line, 200) || fallback.line,
    leans: leans.length === 2 ? leans : fallback.leans,
    store: clean(o.store, 16).toLowerCase().replace(/[^\p{L} ]/gu, "") || fallback.store,
    fault: clean(o.fault, 80) || fallback.fault,
  };
}

/* ------------------------------ when an ability applies ------------------------------ */

const STOP = new Set(["the", "a", "an", "of", "and", "my", "your", "to", "in", "on", "at", "with", "for", "from", "it", "is", "as"]);

/** The words in a line that would mean an ability is being used: its name's own words, and its tags. */
export function abilityWords(a: Ability): string[] {
  return [...new Set([...words(a.name).filter((w) => w.length >= 4 && !STOP.has(w)), ...a.tags])];
}

const esc = (w: string): string => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether a line names an ability: its whole name, two of its name's own words, the one word of a one-word name, or
 * one of its words said as yours ("my whistle"). One common word alone ("good" in "A Good Eye") is not enough.
 */
export function named(line: string, a: Ability): boolean {
  const t = ` ${line.toLowerCase().replace(/[^\p{L}']+/gu, " ")} `;
  const whole = words(a.name).filter((w) => !STOP.has(w)).join(" ");
  if (whole.length >= 4 && t.includes(` ${whole}`)) return true;
  const own = words(a.name).filter((w) => w.length >= 4 && !STOP.has(w));
  const found = own.filter((w) => new RegExp(`\\b${esc(w)}`).test(t));
  if (found.length >= 2 || (own.length === 1 && found.length === 1)) return true;
  return own.some((w) => new RegExp(`\\b(?:my|your)(?: \\w+)? ${esc(w)}`).test(t));
}

/** Whether an ability works by itself, without being named: an always-on knack or one for a narrow situation. */
export const passive = (a: Ability): boolean => a.does !== "flourish" && !a.store && a.often !== "story" && ON_A_TRY.has(a.does) && a.does !== "open" && a.does !== "slip";

/* ------------------------------ the stock ------------------------------ */

const A = (id: string, name: string, looks: string, does: Verb, much: number, ways: Way[], tags: string[], often: Often, store = false, extra: Partial<Ability> = {}): Ability => ({ id, name, looks, does, much, ways, tags, often, store, card: VERB_CARD[does], ...extra });

/** The callings used when there is no model, one for each kind of person (hero.ts), with their first abilities. */
export const STOCK_CALLINGS: Record<string, { calling: Calling; hand: Ability[] }> = {
  courier: {
    calling: { name: "Road-runner", line: "You carry what others will not, by roads they do not know.", leans: ["grace", "charm"], store: "breath", fault: "never stay to finish what you start" },
    hand: [
      A("s-whistle", "Two-note Whistle", "a whistle that anyone who has heard it once turns to look for", "flourish", 0, [], [], "always"),
      A("s-light", "Light Feet", "you make no sound when it matters", "ease", 1, ["sneak"], [], "stop"),
      A("s-short", "The Short Way", "you spend your breath and find a way nobody else saw", "open", 1, ["sneak"], [], "always", true),
    ],
  },
  sellsword: {
    calling: { name: "Hired Blade", line: "You are paid to stand between trouble and the people who pay you.", leans: ["brawn", "wits"], store: "grit", fault: "will not back down once a blade is out" },
    hand: [
      A("s-stare", "Long Stare", "a look that makes a room go quiet and drunks find their seats", "flourish", 0, [], [], "always"),
      A("s-shoulder", "Hard Shoulder", "doors and men give way to you", "ease", 1, ["force"], [], "stop"),
      A("s-scars", "Old Scars", "you grit your teeth and take a blow that should have floored you", "ward", 1, ["force"], [], "always", true),
    ],
  },
  player: {
    calling: { name: "Wandering Player", line: "You live on applause, and on what people tell a friendly face.", leans: ["charm", "wits"], store: "nerve", fault: "cannot resist an audience" },
    hand: [
      A("s-hush", "Hush", "when you start to sing, a room goes quiet and looks at you", "flourish", 0, [], [], "always"),
      A("s-silver", "Silver Tongue", "people want to agree with you", "ease", 1, ["talk"], [], "stop"),
      A("s-warm", "Warm Word", "you spend your nerve on a smile that makes one person your friend", "sway", 1, ["talk"], [], "always", true),
    ],
  },
  scholar: {
    calling: { name: "Learned Hand", line: "You have read what others never thought to, and you remember it.", leans: ["wits", "sense"], store: "ink", fault: "must know, even when knowing is dangerous" },
    hand: [
      A("s-spark", "Pocket Spark", "a pinch of powder that lights a pipe, a lamp or a wick with a snap", "flourish", 0, [], [], "always"),
      A("s-haggle", "Sharp Bargain", "you never pay the first price", "ease", 1, ["pay"], [], "stop"),
      A("s-read", "I Have Read of This", "you spend your ink and remember exactly the thing that matters here", "learn", 1, [], [], "always", true),
    ],
  },
};

/** Abilities offered at a level-up when there is no model to write new ones. */
export const STOCK_POOL: readonly Ability[] = [
  A("p-kind", "Kind Face", "strangers take you for a friend", "ease", 1, ["talk"], [], "stop"),
  A("p-shadow", "Shadow Sense", "you always see the way round", "ease", 1, ["sneak"], [], "stop"),
  A("p-deep", "Deep Pockets", "you always have a little more put by", "ward", 1, ["pay"], [], "always", true),
  A("p-second", "Second Breath", "you rest a moment and stand up straighter", "mend", 1, [], [], "stop", false, { of: "health" }),
  A("p-luck", "Fool's Luck", "once a story, the thing that should have gone wrong does not", "slip", 1, [], [], "story"),
  A("p-eye", "A Good Eye", "you look a place over and see what will help", "learn", 1, [], [], "stop"),
  A("p-sure", "Sure Hands", "you spend yourself on a try and it is twice as likely to go your way", "edge", 1, [], [], "always", true),
  A("p-friend", "Old Friends", "you know someone here, or someone who knows someone", "mark", 1, ["talk"], [], "stop"),
  A("p-crowbar", "Bar and Lever", "you have the right tool for a lock, a hinge or a beam", "ease", 1, ["force"], ["door", "gate", "lock", "bar", "chain", "wall"], "always"),
  A("p-scent", "Kitchen Charm", "food you hum over tastes and smells however you like for an hour", "flourish", 0, [], [], "always"),
  A("p-mimic", "Borrowed Voice", "you can sound like anyone you have heard speak", "flourish", 0, [], [], "always"),
  A("p-ear", "Big Ears", "in a crowd you hear the thing nobody meant you to", "learn", 1, [], ["crowd", "tavern", "market", "inn", "feast"], "always"),
];

/** Every stock ability, by id, for a kept hero whose abilities name one. */
export const STOCK: readonly Ability[] = [...Object.values(STOCK_CALLINGS).flatMap((c) => c.hand), ...STOCK_POOL];

/** The old knacks (before abilities), as the abilities they always were: a step easier for a way, once at each stop. */
const OLD_KNACKS: Record<string, string> = { silver: "s-silver", kindly: "p-kind", light: "s-light", shadow: "p-shadow", shoulder: "s-shoulder", scars: "s-scars", haggle: "s-haggle", deep: "p-deep" };
export function fromOldKnack(id: string): Ability | null {
  const s = STOCK.find((a) => a.id === OLD_KNACKS[id]);
  return s ? { ...s } : null;
}

/**
 * Two abilities offered at a level-up from the stock: ones the hero does not have, preferring the ways the story was
 * won by, and never two tricks. Each fits what the budget leaves at the next level.
 */
/** The most a new ability may cost at a level-up from `level`: what is left of the next level's budget, and never more than its cap. */
export const offerRoom = (have: readonly Ability[], level: number): number => Math.min(capAt(level + 1), Math.max(1, budgetAt(level + 1) - handPrice(have)));

export function stockOffer(have: readonly Ability[], level: number, seed: string, ways: readonly Way[] = []): Ability[] {
  const cap = offerRoom(have, level);
  const rng = seededRng(`${seed}:offer:${have.length}`);
  const names = new Set(have.map((a) => a.name.toLowerCase()));
  const free = STOCK_POOL.filter((a) => !names.has(a.name.toLowerCase()) && !have.some((h) => h.id === a.id));
  const ranked = free.map((a) => ({ a, k: rng() - (a.ways.some((w) => ways.includes(w)) ? 0.5 : 0) })).sort((x, y) => x.k - y.k).map((x) => x.a);
  const out: Ability[] = [];
  for (const a of ranked) {
    if (out.length >= 2) break;
    if (a.does === "flourish" && out.some((x) => x.does === "flourish")) continue;
    const f = fitAbility(a, cap);
    if (f) out.push(f);
  }
  return out;
}
