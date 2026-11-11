/**
 * Building your character (docs/DESIGN.md, 6), and what you become as you go (1.3).
 *
 * You are one of a few kinds of person (a "class": what you are good at, in a word), with a calling written for you
 * and three abilities (docs/SYSTEMS.md, 2 and 3). Every number comes from here and from abilities.ts, inside fixed
 * limits:
 *   - the six stats always add up to STAT_BUDGET (one more, POWER_BUDGET, with the seventh in a world that has it),
 *     and each is 0 to STAT_MAX;
 *   - health, supplies and goodwill start the same for everyone, and the store by level;
 *   - abilities are priced, and mended to keep to the budget at your level.
 *
 * A model may read who you say you are into a kind, a name, a different spread of the same points, a calling and
 * abilities of your own. Code checks all of it, and keeps the kind's own where it does not. Nothing a model says can
 * make you stronger than the budget.
 *
 * Levelling up: every LEVEL_EVERY stops you get past, and when you win a story, two abilities are dealt face up and you
 * keep one.
 */
import { fitHand, fromOldKnack, STOCK_CALLINGS, storeAt, type Ability, type Calling } from "./abilities.js";
import { STAT_MAX, STATS, type CoreStat, type Sheet, type Stats } from "./moment.js";

/** What the six stats add up to, for everyone. */
export const STAT_BUDGET = 8;
/** What the seven add up to, in a world with the seventh (docs/MOONSHOT.md, 7.3). */
export const POWER_BUDGET = 9;
/** Get past this many stops and you level up. */
export const LEVEL_EVERY = 3;

/** A kind of person you can be. */
export interface HeroClass {
  id: string;
  name: string;
  /** What they are like, in a line, for the first page. */
  is: string;
  stats: Record<CoreStat, number>;
  /** Words in a line that mean this kind, for reading who you are without a model. */
  words: readonly string[];
}

export const CLASSES: readonly HeroClass[] = [
  {
    id: "courier",
    name: "Courier",
    is: "light on your feet and easy to like, no great fighter and hopeless with sums",
    stats: { brawn: 1, grace: 3, charm: 1, guile: 2, wits: 0, sense: 1 },
    words: ["courier", "messenger", "thief", "rogue", "scout", "runner", "sneak", "pickpocket", "spy", "burglar", "quiet", "nimble"],
  },
  {
    id: "sellsword",
    name: "Sellsword",
    is: "strong and steady, more at home with a blade than a speech",
    stats: { brawn: 3, grace: 2, charm: 1, guile: 0, wits: 1, sense: 1 },
    words: ["sellsword", "soldier", "warrior", "fighter", "guard", "mercenary", "knight", "brawler", "sword", "strong", "blacksmith", "smith", "hunter", "barbarian"],
  },
  {
    id: "player",
    name: "Player",
    is: "a voice people listen to and a face people trust, with soft hands",
    stats: { brawn: 0, grace: 1, charm: 3, guile: 2, wits: 2, sense: 0 },
    words: ["player", "bard", "actor", "singer", "minstrel", "poet", "noble", "courtier", "charming", "diplomat", "performer", "dancer", "priest", "priestess"],
  },
  {
    id: "scholar",
    name: "Scholar",
    is: "quick with figures and a better judge of a bargain than of a fight",
    stats: { brawn: 0, grace: 1, charm: 1, guile: 1, wits: 3, sense: 2 },
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
  /** What you are, in a word and a line, with your store's name and your fault (docs/SYSTEMS.md, 2.1). */
  calling: Calling;
  /** What you can do (abilities.ts), priced to the budget at your level. */
  abilities: Ability[];
  /** 1 to begin with, and 1 more for each ability taken at a level-up. */
  level: number;
  /** The old knacks, from before abilities: read once into abilities (`heroNow`). */
  perks?: string[];
}

/** Everyone starts with this much of what they carry. */
export const START = { health: 5, supplies: 4, goodwill: 2 } as const;

/**
 * A spread of stats if it keeps to the budget and the limits; null if it does not. With `power`, the world has the
 * seventh stat: it must be there, and the seven add up to POWER_BUDGET. Without it, a seventh is not allowed.
 */
export function checkSpread(stats: Partial<Record<string, unknown>> | null | undefined, power = false): Stats | null {
  if (!stats) return null;
  const out = {} as Stats;
  let sum = 0;
  const ok = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= STAT_MAX;
  for (const s of STATS) {
    const v = stats[s];
    if (!ok(v)) return null;
    out[s] = v;
    sum += v;
  }
  if (power) {
    if (!ok(stats.power)) return null;
    out.power = stats.power;
    sum += stats.power;
  } else if (stats.power !== undefined && stats.power !== null && stats.power !== 0) return null;
  return sum === (power ? POWER_BUDGET : STAT_BUDGET) ? out : null;
}

/**
 * Any spread put right to the budget: each stat held to its limits, then the highest trimmed or the lowest raised a
 * point at a time until they add up. Old heroes (four stats: brawn, cunning, charm, wits) are read into the six first:
 * cunning was quiet feet and a straight face, so it becomes Grace and, a step less, Guile; wits was noticing too, so
 * Sense starts at half of it.
 */
export function fitSpread(raw: Partial<Record<string, unknown>> | null | undefined, power = false): Stats {
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(STAT_MAX, Math.round(v))) : 0);
  const r = raw ?? {};
  const old = r.cunning !== undefined && r.grace === undefined;
  const out: Stats = {
    brawn: n(r.brawn),
    grace: old ? n(r.cunning) : n(r.grace),
    charm: n(r.charm),
    guile: old ? Math.max(0, n(r.cunning) - 1) : n(r.guile),
    wits: n(r.wits),
    sense: old ? Math.floor(n(r.wits) / 2) : n(r.sense),
  };
  const keys: (keyof Stats)[] = [...STATS];
  if (power) (out.power = n(r.power)), keys.push("power");
  const budget = power ? POWER_BUDGET : STAT_BUDGET;
  const sum = (): number => keys.reduce((t, k) => t + (out[k] ?? 0), 0);
  for (let guard = 0; sum() > budget && guard < 50; guard++) {
    const k = keys.reduce((a, b) => ((out[b] ?? 0) >= (out[a] ?? 0) ? b : a));
    out[k] = (out[k] ?? 0) - 1;
  }
  for (let guard = 0; sum() < budget && guard < 50; guard++) {
    const k = keys.reduce((a, b) => ((out[b] ?? 0) < (out[a] ?? 0) ? b : a));
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Whether a spread is the six of now (an old hero has four). */
export const spreadNow = (stats: Partial<Record<string, unknown>>): boolean => STATS.every((s) => typeof stats[s] === "number");

/** Make a hero of a kind, with a name and words of your own and, if it keeps to the budget, a spread of your own. */
export function makeHero(clsId: string, o: { name?: string; who?: string; stats?: Partial<Record<string, unknown>> | null; hour?: number; calling?: Calling; abilities?: Ability[]; power?: string } = {}): Hero {
  const cls = classOf(clsId) ?? CLASSES[0]!;
  // In a world with the seventh stat, the kind's own spread gets one point there (POWER_BUDGET is one more).
  const stats = checkSpread(o.stats, !!o.power) ?? (o.power ? { ...cls.stats, power: 1 } : { ...cls.stats });
  const name = clean(o.name, 40) || "the traveller";
  const who = clean(o.who, 240) || `You are a ${cls.name.toLowerCase()}: ${cls.is}.`;
  const stock = STOCK_CALLINGS[cls.id] ?? STOCK_CALLINGS.courier!;
  const hand = fitHand(o.abilities?.length ? o.abilities : stock.hand.map((a) => ({ ...a })), 1);
  return { name, cls: cls.id, who, sheet: { stats, ...(o.power ? { powerName: o.power } : {}), ...START, store: storeAt(1), hour: o.hour ?? 12 }, calling: o.calling ?? { ...stock.calling }, abilities: hand.length ? hand : stock.hand.map((a) => ({ ...a })), level: 1 };
}

/**
 * A hero kept from before abilities were made (they had knacks, and no calling): given the calling of their kind and
 * their knacks as the abilities they always were. A hero of now is returned as it is.
 */
export function heroNow(h: Hero): Hero {
  if (!spreadNow(h.sheet.stats)) h = { ...h, sheet: { ...h.sheet, stats: fitSpread(h.sheet.stats, typeof h.sheet.stats.power === "number") } };
  if (Array.isArray(h.abilities) && h.calling) return h;
  const stock = STOCK_CALLINGS[h.cls] ?? STOCK_CALLINGS.courier!;
  const old = (h.perks ?? []).map(fromOldKnack).filter((a): a is Ability => !!a);
  const trick = stock.hand.find((a) => a.does === "flourish")!;
  const abilities = [{ ...trick }, ...old.filter((a, i, all) => all.findIndex((x) => x.id === a.id) === i)];
  const level = Math.max(1, old.length);
  const { perks: _old, ...rest } = h;
  return { ...rest, calling: { ...stock.calling }, abilities: fitHand(abilities, level), level, sheet: { ...h.sheet, store: storeAt(level) } };
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
