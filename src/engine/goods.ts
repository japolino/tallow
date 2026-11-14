/**
 * Goods: what things are worth, buying and selling, merchants' stock, and making things (game/systems/goods.ts plays it).
 *
 * Every number here is code's. A model says what kind of thing an item is (one rung of a fixed ladder of everyday
 * prices), whether it is precious, and how good it is; it never says what anything costs. What one of the world's coins
 * is worth is asked once, as one rung of a second fixed ladder, so prices come out sane whatever the setting.
 *
 * The formulas follow AI Roguelite where it has them: the quality factor is its crafting tier raised to 0.6 and a
 * precious thing is worth three and a half times as much (Utils.GetItemGoldVal); buying and selling prices move with
 * charisma and how the seller feels about you (Utils.GetItemGoldValForBuying, GetItemGoldValForSelling); a seller's purse
 * limits what they can pay; stock is restocked every eight hours (GameCharacter.CalculateSecsUntilRestock); and the
 * quality of a made thing comes from the qualities of what went into it (GameplayManager.RunNonStoryCraft).
 *
 * Pure and seeded: nothing here asks a model or reads a clock. Randomness comes from the run's own dice (draw).
 */
import { draw, QUALITIES, same, type Outcome, type Quality, type Run } from "./run.js";

/* ------------------------------------------------- the two ladders ------------------------------------------------- */

/**
 * What kind of thing something is, as a rung of everyday prices. Each is worth `ref`, in a unit of about one of today's
 * dollars (the original asks every world's coin to be about a dollar, so worlds compare; here the coin keeps its own
 * worth and this ladder is the common measure).
 */
export const KINDS = [
  { ref: 1, says: "a trifle (a candle, an apple, a sheet of paper, a cup of water)" },
  { ref: 5, says: "a small useful thing (a loaf, a torch, a bundle of herbs, a plain meal, a mug of ale)" },
  { ref: 25, says: "an everyday thing (a knife, a shirt, a coil of rope, a cooking pot, a night's plain lodging)" },
  { ref: 120, says: "a good piece of gear (a sword, a pair of boots, a lantern, a bow, a warm coat)" },
  { ref: 600, says: "a costly thing (armour, a fine weapon, a musical instrument, a saddle)" },
  { ref: 5000, says: "a great purchase (a horse, a cart, a suit of fine armour)" },
  { ref: 50000, says: "a fortune (a house, a ship, a famous jewel)" },
] as const;

/** What one of the world's coins is worth, in the same unit, as a few rungs to choose from. */
export const COINS = [
  { ref: 0.01, says: "small change, like a cent: it takes a great many to buy anything" },
  { ref: 0.1, says: "a small coin, like a dime: a handful buys a bread roll" },
  { ref: 1, says: "about a bread roll or a candle" },
  { ref: 10, says: "about a plain meal at an inn" },
  { ref: 100, says: "about a good pair of boots, or a labourer's week of work" },
  { ref: 1000, says: "about a month's wages for a skilled worker" },
] as const;

/**
 * What a character who begins with any money at all begins with at least, and at most: about a week of plain food at what a buyer pays, and
 * about a good horse. The sheet's money is written before the coin's worth is known, so it is brought inside this once
 * the coin is known. Someone who begins with nothing keeps nothing.
 */
export const PURSE_LEAST = 60;
export const PURSE_MOST = 5000;
export const startingMoney = (money: number, coin: number): number =>
  money <= 0 ? 0 : Math.max(Math.ceil(PURSE_LEAST / COINS[coin - 1]!.ref), Math.min(Math.round(PURSE_MOST / COINS[coin - 1]!.ref), Math.round(money)));

export const kindOk = (n: unknown): number | null => {
  const k = Math.round(Number(n));
  return Number.isFinite(k) && k >= 1 && k <= KINDS.length ? k : null;
};
export const coinOk = (n: unknown): number | null => {
  const k = Math.round(Number(n));
  return Number.isFinite(k) && k >= 1 && k <= COINS.length ? k : null;
};

/** What a coin buys, in a few words, for the scene and the sheet. */
export const coinSays = (coin: number, name: string): string => `One ${singular(name)} is worth ${COINS[coin - 1]!.says}.`;
const singular = (name: string): string => name.replace(/(?<=\w)s$/i, "");

/* ------------------------------------------------- worth ------------------------------------------------- */

export const qualityOf = (q: unknown): Quality => (QUALITIES.includes(String(q).toLowerCase().trim() as Quality) ? (String(q).toLowerCase().trim() as Quality) : "common");

/**
 * How much more a thing of a quality is worth than a common one. Rare and up are the original's crafting tier (rare 2,
 * epic 3, legendary 4) raised to 0.6; it prices everything below rare as tier 1, so the three steps below common and the
 * one above it are this game's own, kept small and in order.
 */
export function qualityFactor(q: Quality): number {
  switch (q) {
    case "trash": return 0.2;
    case "mundane": return 0.6;
    case "common": return 1;
    case "uncommon": return 1.25;
    case "rare": return Math.pow(2, 0.6);
    case "epic": return Math.pow(3, 0.6);
    case "legendary": return Math.pow(4, 0.6);
  }
}
/** A precious thing (gold, jewels, fine art) is worth this much more: the original's "valuable" factor. */
export const PRECIOUS = 3.5;

export interface Kind {
  kind: number;
  precious: boolean;
}

/** What one of a thing is worth, in the common unit. */
export const worthRef = (k: Kind, q: Quality): number => KINDS[Math.max(1, Math.min(KINDS.length, k.kind)) - 1]!.ref * qualityFactor(q) * (k.precious ? PRECIOUS : 1);

/** A price as people say it: whole, and to two figures once it is big. */
export function nice(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 20) return Math.round(n);
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

/** A worth in the common unit as the world's coins; never less than one coin. */
export const inCoins = (ref: number, coin: number): number => Math.max(1, nice(ref / COINS[coin - 1]!.ref));

/* ------------------------------------------------- buying and selling ------------------------------------------------- */

/** Charisma as the price formulas use it: a seller who likes you counts five points a step (Utils.ModCharismaByDifficulty). */
export const sway = (charisma: number, standing: number): number => Math.max(0, charisma) + Math.max(0, standing) * 5;
/** What a seller asks, as a share of the worth: between twice the worth and the worth itself. */
export const buyShare = (charisma: number, standing: number): number => Math.pow(1.03, -sway(charisma, standing)) + 1;
/** What a buyer pays, as a share of the worth: from a sixth up to five sixths of it. */
export const sellShare = (charisma: number, standing: number): number => (5 / 6) * (1.2 - Math.pow(1.03, -sway(charisma, standing)));

/** How a haggle that was rolled moves the price, by outcome (-3 to 3): the band is bounded either way. */
const HAGGLE_BUY = [1.2, 1.1, 1.05, 1, 0.93, 0.85, 0.75];
const HAGGLE_SELL = [0.8, 0.9, 0.95, 1, 1.08, 1.18, 1.3];
export const haggled = (side: "buy" | "sell", outcome: Outcome | null): number => (outcome === null ? 1 : (side === "buy" ? HAGGLE_BUY : HAGGLE_SELL)[outcome + 3]!);

/** The price of one, bought: never less than one coin. */
export const buyPrice = (ref: number, coin: number, charisma: number, standing: number, outcome: Outcome | null = null): number =>
  Math.max(1, nice((ref * buyShare(charisma, standing) * haggled("buy", outcome)) / COINS[coin - 1]!.ref));

/**
 * The price of one, sold: 0 when it is worth too little to fetch a coin; never as much as buying it back would cost,
 * even bought back at the best haggle there is, so no run of haggles can turn buying and selling into a money mill.
 */
export function sellPrice(ref: number, coin: number, charisma: number, standing: number, outcome: Outcome | null = null): number {
  const raw = (ref * sellShare(charisma, standing) * haggled("sell", outcome)) / COINS[coin - 1]!.ref;
  if (raw < 0.5) return 0;
  const cheapest = buyPrice(ref, coin, charisma, standing, 3);
  if (cheapest <= 1) return 0;
  return Math.max(1, Math.min(nice(raw), cheapest - 1));
}

/** How many can be had for the money, at a price: whole, never below none. */
export const affordable = (money: number, unit: number): number => (unit <= 0 ? 0 : Math.max(0, Math.floor(money / unit)));

/* ------------------------------------------------- merchants ------------------------------------------------- */

export interface Ware extends Kind {
  name: string;
  text: string;
  quality: Quality;
  qty: number;
  /** How many there were when stocked: a restock brings it back to this. */
  stocked: number;
}

export interface Merchant {
  /** The seller's name as the run's people have it. */
  name: string;
  /** Plainly out of the ordinary: a master, a dealer in rare things. Lets them sell finer goods. */
  special: boolean;
  wares: Ware[];
  /** Coins on hand to buy with, and what it is refilled to. */
  purse: number;
  full: number;
  /** The run's minutes when they were last stocked. */
  stockedAt: number;
}

export const MOST_WARES = 8;
export const MOST_QTY = 99;
export const MOST_STOCK = 20;
/** Eight hours of the story's time between restocks (the original's 28,800 seconds). */
export const RESTOCK_MINUTES = 8 * 60;

/**
 * The finest quality a seller may offer. An ordinary seller keeps to uncommon (the original caps merchant stock at about
 * common or uncommon unless the seller is plainly special); a special one may go to rare, and to epic only for a
 * character well past a beginner. Legendary things are never for sale.
 */
export function finestForSale(special: boolean, level: number): Quality {
  if (!special) return "uncommon";
  return level >= 12 ? "epic" : "rare";
}
export const capQuality = (q: Quality, most: Quality): Quality => (QUALITIES.indexOf(q) > QUALITIES.indexOf(most) ? most : q);

/** A purse for someone who buys from the player: a merchant has a good deal on hand, anyone else a little. */
export function purseFor(r: Run, merchant: boolean, coin: number): number {
  const ref = merchant ? 1500 + Math.floor(draw(r) * 13501) : Math.floor(draw(r) * 201);
  return Math.max(merchant ? 20 : 0, Math.round(ref / COINS[coin - 1]!.ref));
}

/** A merchant whose time is up is restocked: every ware back to what it was stocked with, the purse refilled. */
export function restock(m: Merchant, minutes: number): boolean {
  if (minutes - m.stockedAt < RESTOCK_MINUTES) return false;
  for (const w of m.wares) w.qty = Math.max(w.qty, w.stocked);
  m.purse = Math.max(m.purse, m.full);
  m.stockedAt = minutes;
  return true;
}

/** A thing sold to a merchant joins their wares (merged with the same thing), so it can be bought back. */
export function intoStock(m: Merchant, w: Omit<Ware, "stocked">): void {
  const have = m.wares.find((x) => same(x.name, w.name));
  if (have) {
    have.qty = Math.min(MOST_QTY, have.qty + w.qty);
    return;
  }
  m.wares.push({ ...w, stocked: 0 });
}

/* ------------------------------------------------- names ------------------------------------------------- */

const LITTLE = new Set(["a", "an", "the", "of", "and", "with", "some", "pair", "set", "few", "my", "your", "his", "her", "their"]);
const words = (s: string): string[] => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter((w) => w && !LITTLE.has(w)).map((w) => (w.length > 3 ? w.replace(/(es|s)$/, "") : w));

/**
 * Whether two names plainly mean the same thing: the same once case and articles are set aside, or every word of one is
 * in the other ("bread loaf" and "loaf of bread"; "rope" and "coil of rope"). "Iron sword" and "iron helmet" are not.
 */
export function alike(a: string, b: string): boolean {
  if (same(a, b)) return true;
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  const [small, big] = x.length <= y.length ? [x, y] : [y, x];
  return small.every((w) => big.includes(w));
}

/** The key a thing's kind is kept under. */
export const keyOf = (name: string): string => words(name).join(" ");

/* ------------------------------------------------- making things ------------------------------------------------- */

export type Plausibility = "plausible" | "barely" | "implausible";
export const PLAUSIBILITIES: readonly Plausibility[] = ["plausible", "barely", "implausible"];

/** Which of the three possible results is made: 0 the thing named, 1 a closely related thing, 2 one only loosely like it. */
export function madeStep(p: Plausibility, outcome: Outcome | null, impossible: boolean): 0 | 1 | 2 {
  if (impossible) return 2;
  let step = PLAUSIBILITIES.indexOf(p);
  // A fine roll can carry a stretch through; a poor one falls back a step. Nothing makes the implausible work.
  if (outcome !== null && outcome >= 2 && step === 1) step = 0;
  if (outcome !== null && outcome <= -1) step = Math.min(2, step + 1);
  return step as 0 | 1 | 2;
}

/** The original's quality numbers: trash -2, mundane -1, then common 1 up to legendary 5. */
const RANK = [-2, -1, 1, 2, 3, 4, 5];
const rankOf = (q: Quality): number => RANK[QUALITIES.indexOf(q)]!;
const qualityAt = (rank: number): Quality => QUALITIES[RANK.indexOf(rank)] ?? "common";

/**
 * The quality of a made thing. Several things together: each counts three times the one below it, and the result is the
 * quality whose single worth that adds up to, the part left over decided by the dice, kept between common and
 * legendary. One thing alone keeps its own quality. Then the roll: a striking success lifts it a step, a failure lowers it
 * one, a bad failure two. As with a thing found, the finest things come only from a turn that went well.
 */
export function madeQuality(r: Run, from: readonly Quality[], outcome: Outcome | null): Quality {
  if (!from.length) return "mundane";
  let q: Quality;
  const best = Math.max(...from.map((x) => QUALITIES.indexOf(x)));
  if (from.length === 1) q = from[0]!;
  // Plain and shoddy things together make nothing better than the best of them (the original's formula would lift
  // them to common, since its ranks stop there).
  else if (best < QUALITIES.indexOf("common")) q = QUALITIES[best]!;
  else {
    const sum = from.reduce((n, x) => n + Math.pow(3, rankOf(x) - 1), 0);
    const at = Math.log(sum) / Math.log(3) + 1;
    let rank = Math.floor(at) + (draw(r) < at % 1 ? 1 : 0);
    rank = Math.max(1, Math.min(5, rank));
    // Never more than one step above the best thing that went in.
    q = QUALITIES[Math.min(QUALITIES.indexOf(qualityAt(rank)), best + 1)]!;
  }
  const shift = outcome === null ? 0 : outcome >= 3 ? 1 : outcome <= -3 ? -2 : outcome <= -1 ? -1 : 0;
  let i = Math.max(0, Math.min(QUALITIES.length - 1, QUALITIES.indexOf(q) + shift));
  if (i >= 5 && outcome !== null && outcome < 1) i = 4;
  return QUALITIES[i]!;
}

/** How many a making yields: at least one, at most five for each thing put in, and never more than twenty. */
export const madeQty = (asked: number, units: number): number => Math.max(1, Math.min(MOST_STOCK, Math.max(1, units) * 5, Math.round(Number(asked) || 1)));
