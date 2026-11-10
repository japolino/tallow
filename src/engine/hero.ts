/**
 * Building your character (docs/DESIGN.md, 6), and what you become as you go (1.3).
 *
 * You are one of a few kinds of person (a "class": what you are good at, in a word). Each kind starts with its four
 * stats set, and with one knack (a "perk"). Every number comes from here, inside fixed limits:
 *   - the four stats always add up to STAT_BUDGET, and each is 0 to STAT_MAX;
 *   - health, supplies and goodwill start the same for everyone;
 *   - a perk only ever makes one way one step easier, once at each stop.
 *
 * A model may read who you say you are into a kind, a name and a different spread of the same points. Code checks the
 * spread and keeps the kind's own if it does not add up. Nothing a model says can make you stronger than the budget.
 *
 * Levelling up: every LEVEL_EVERY stops you get past, the narrator offers two knacks you do not have, and you pick one.
 */
import { seededRng } from "./dice.js";
import { STAT_MAX, STATS, type Lever, type Sheet, type Stat, type Way } from "./moment.js";

/** What the four stats add up to, for everyone. */
export const STAT_BUDGET = 6;
/** Get past this many stops and you level up. */
export const LEVEL_EVERY = 3;

/** A knack: one way that is a step easier once at each stop, without having to use anything in the scene. */
export interface Perk {
  id: string;
  name: string;
  /** Its card's kind (cards.ts). */
  card: string;
  way: Way;
  /** What it is, in plain words, as the narrator says it when it is offered. */
  says: string;
}

export const PERKS: readonly Perk[] = [
  { id: "silver", name: "Silver Tongue", card: "token", way: "talk", says: "people want to agree with you" },
  { id: "kindly", name: "Kind Face", card: "beloved", way: "talk", says: "strangers take you for a friend" },
  { id: "light", name: "Light Feet", card: "lantern", way: "sneak", says: "you make no sound when it matters" },
  { id: "shadow", name: "Shadow Sense", card: "climb", way: "sneak", says: "you always see the way round" },
  { id: "shoulder", name: "Hard Shoulder", card: "gate", way: "force", says: "doors and men give way to you" },
  { id: "scars", name: "Old Scars", card: "hound", way: "force", says: "you have been hurt before and kept going" },
  { id: "haggle", name: "Sharp Bargain", card: "purse", way: "pay", says: "you never pay the first price" },
  { id: "deep", name: "Deep Pockets", card: "key", way: "pay", says: "you always have a little more put by" },
];

export const perkOf = (id: string): Perk | undefined => PERKS.find((p) => p.id === id);

/** A perk as something a line can lean on at a stop (moment.ts treats it like anything else there to use). */
export const perkLever = (p: Perk): Lever => ({ id: `perk:${p.id}`, way: p.way, name: `your ${p.name.toLowerCase()}`, words: [] });
export const isPerkLever = (id: string | null | undefined): boolean => !!id && id.startsWith("perk:");

/** A kind of person you can be. */
export interface HeroClass {
  id: string;
  name: string;
  /** What they are like, in a line, for the first page. */
  is: string;
  stats: Record<Stat, number>;
  perk: string;
  /** Words in a line that mean this kind, for reading who you are without a model. */
  words: readonly string[];
}

export const CLASSES: readonly HeroClass[] = [
  {
    id: "courier",
    name: "Courier",
    is: "light on your feet and easy to like, no great fighter and hopeless with sums",
    stats: { brawn: 1, cunning: 3, charm: 2, wits: 0 },
    perk: "light",
    words: ["courier", "messenger", "thief", "rogue", "scout", "runner", "sneak", "pickpocket", "spy", "burglar", "quiet", "nimble"],
  },
  {
    id: "sellsword",
    name: "Sellsword",
    is: "strong and steady, more at home with a blade than a speech",
    stats: { brawn: 3, cunning: 1, charm: 1, wits: 1 },
    perk: "shoulder",
    words: ["sellsword", "soldier", "warrior", "fighter", "guard", "mercenary", "knight", "brawler", "sword", "strong", "blacksmith", "smith", "hunter", "barbarian"],
  },
  {
    id: "player",
    name: "Player",
    is: "a voice people listen to and a face people trust, with soft hands",
    stats: { brawn: 0, cunning: 1, charm: 3, wits: 2 },
    perk: "silver",
    words: ["player", "bard", "actor", "singer", "minstrel", "poet", "noble", "courtier", "charming", "diplomat", "performer", "dancer", "priest", "priestess"],
  },
  {
    id: "scholar",
    name: "Scholar",
    is: "quick with figures and a better judge of a bargain than of a fight",
    stats: { brawn: 0, cunning: 2, charm: 1, wits: 3 },
    perk: "haggle",
    words: ["scholar", "clerk", "merchant", "trader", "healer", "doctor", "alchemist", "wizard", "mage", "scribe", "student", "clever", "inventor", "witch"],
  },
];

export const classOf = (id: string): HeroClass | undefined => CLASSES.find((c) => c.id === id);

/** Who you are at the table. */
export interface Hero {
  name: string;
  cls: string;
  /** Who you are, in your own words (or the kind's), for the first page. */
  who: string;
  sheet: Sheet;
  perks: string[];
}

/** Everyone starts with this much of what they carry. */
export const START = { health: 5, supplies: 4, goodwill: 2 } as const;

/** A spread of stats if it keeps to the budget and the limits; null if it does not. */
export function checkSpread(stats: Partial<Record<Stat, unknown>> | null | undefined): Record<Stat, number> | null {
  if (!stats) return null;
  const out = {} as Record<Stat, number>;
  let sum = 0;
  for (const s of STATS) {
    const v = stats[s];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > STAT_MAX) return null;
    out[s] = v;
    sum += v;
  }
  return sum === STAT_BUDGET ? out : null;
}

/** Make a hero of a kind, with a name and words of your own and, if it keeps to the budget, a spread of your own. */
export function makeHero(clsId: string, o: { name?: string; who?: string; stats?: Partial<Record<Stat, unknown>> | null; hour?: number } = {}): Hero {
  const cls = classOf(clsId) ?? CLASSES[0]!;
  const stats = checkSpread(o.stats) ?? { ...cls.stats };
  const name = clean(o.name, 40) || "the traveller";
  const who = clean(o.who, 240) || `You are a ${cls.name.toLowerCase()}: ${cls.is}.`;
  return { name, cls: cls.id, who, sheet: { stats, ...START, hour: o.hour ?? 12 }, perks: [cls.perk] };
}

const clean = (s: unknown, max: number): string => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Read who you say you are without a model: the kind whose words come up most, a courier if none do. */
export function rulesHero(line: string, hour?: number): Hero {
  const t = ` ${line.toLowerCase()} `;
  let best = CLASSES[0]!, score = 0;
  for (const c of CLASSES) {
    const n = c.words.filter((w) => new RegExp(`\\b${w}`).test(t)).length;
    if (n > score) (best = c), (score = n);
  }
  const named = /\b(?:[Ii] am|[Ii]'m|[Mm]y name is|[Cc]all me|[Nn]ame's)\s+([A-Z][\p{L}'-]{1,20})/u.exec(line)?.[1];
  const who = line.trim() ? `You are ${line.trim().replace(/^i am |^i'm /i, "").replace(/[.!]+$/, "")}.` : undefined;
  return makeHero(best.id, { name: named, who, hour });
}

/** The two knacks offered at a level-up: ones you do not have, chosen by the seed, preferring ways you have none for. */
export function perkOffer(have: readonly string[], seed: string): Perk[] {
  const ways = new Set(have.map((id) => perkOf(id)?.way));
  const free = PERKS.filter((p) => !have.includes(p.id));
  const rng = seededRng(`${seed}:perks:${have.length}`);
  const shuffled = free.map((p) => ({ p, k: rng() + (ways.has(p.way) ? 1 : 0) })).sort((a, b) => a.k - b.k).map((x) => x.p);
  // Two different ways if there are two.
  const first = shuffled[0];
  const second = shuffled.find((p) => p !== first && p.way !== first?.way) ?? shuffled[1];
  return [first, second].filter((p): p is Perk => !!p);
}
