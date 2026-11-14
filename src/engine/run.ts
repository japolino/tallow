/**
 * A run: a text adventure played one typed action at a time (game/runturn.ts tells it; scripts/run-play.ts plays it).
 *
 * The player types anything. A model judges what the action is, what it uses and how plausible it is; code rolls
 * against the character's attribute and skill and names one of seven outcomes; the story is told to that outcome;
 * then the story is read back for what really changed (health, belongings, people, experience) and code applies it.
 * Code owns every number here. The numbers follow a formula that is known to play well; the notes on where each
 * comes from are kept outside the repo.
 *
 * Pure and seeded: nothing here asks a model or reads a clock.
 */

import { drawsOf, HARDSHIP_BY, LOST_SHARE, readRules, USUAL, type Dice, type Rules } from "./rules.js";

/* ------------------------------------------------- the sheet ------------------------------------------------- */

export const ATTRIBUTES = ["strength", "dexterity", "intelligence", "charisma", "cunning"] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

export const QUALITIES = ["trash", "mundane", "common", "uncommon", "rare", "epic", "legendary"] as const;
export type Quality = (typeof QUALITIES)[number];

export interface Skill {
  name: string;
  xp: number;
  level: number;
}

/** tier 0 basic, 1 strong, 2 epic. A learned ability is one the story taught; it counts as tier 0 with a small edge. */
export interface Ability {
  name: string;
  text: string;
  tier: 0 | 1 | 2;
  kind: "innate" | "learned";
  /** Turns until it can be used again; 0 when ready. */
  wait: number;
}

export interface Item {
  name: string;
  text: string;
  quality: Quality;
  qty: number;
  worn?: boolean;
}

export interface Person {
  name: string;
  text: string;
  /** 1 a weakling, 3 an ordinary capable adult, 5 far above that, 7 among the strongest there are. */
  power: number;
  hp: number;
  /** How they feel about the player's character, -100 to 100. */
  feeling: number;
  hostile: boolean;
  follows: boolean;
  here: boolean;
  dead: boolean;
  /** Names they went by before, so an old name still finds them. */
  was: string[];
}

export interface Sheet {
  name: string;
  calling: string;
  level: number;
  xp: number;
  hp: number;
  attributes: Record<Attribute, number>;
  /** Attribute points not yet spent. */
  points: number;
  skills: Skill[];
  abilities: Ability[];
  items: Item[];
  money: number;
  coin: string;
}

export interface Beat {
  /** What the player wrote. */
  you: string;
  /** What the story answered. */
  story: string;
}

export interface Run {
  v: 1;
  seed: number;
  /** How many random numbers have been drawn: the run is its own dice bag. */
  n: number;
  world: string;
  who: string;
  sheet: Sheet;
  place: { name: string; text: string };
  people: Person[];
  /** The opening scene, then every beat since; the oldest are folded into `summary`. */
  opening: string;
  beats: Beat[];
  summary: string;
  minutes: number;
  turn: number;
  downs: number;
  /** What each further system of the game keeps (game/systems), under its own name; see stateOf. */
  sys?: Record<string, unknown>;
  /** How hard the game is, as the player last set it (engine/rules.ts); the usual rules when there is none. */
  rules?: Rules;
  /** True once the story has ended: the character was brought down where a fall ends it. */
  over?: boolean;
}

/** The rules a run is played by. */
export const rulesOf = (r: Run): Rules => (r.rules ? readRules(r.rules) : USUAL);

/** A system's own state in a run, made the first time it is asked for (a run begun before the system existed has none). */
export function stateOf<T>(r: Run, name: string, make: () => T): T {
  const sys = (r.sys ??= {});
  if (sys[name] === undefined || sys[name] === null) sys[name] = make();
  return sys[name] as T;
}

export const MAX_HP = 100;
export const LEVEL_CAP = 20;
export const SKILL_CAP = 10;
export const SKILLS_MOST = 40;

/* ------------------------------------------------- dice ------------------------------------------------- */

/** The next random number in [0, 1) of a run. */
export function draw(r: Run): number {
  let t = (r.seed + 0x6d2b79f5 * ++r.n) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * A roll from 0 to 1 as the sum of some dice: four as the game is usually played, so that middling rolls are common
 * and extremes rare. More dice is less luck, one is the most, and with none every roll is the middle (engine/rules.ts).
 */
export function rawRoll(r: Run, dice: Dice = rulesOf(r).dice): number {
  const { n, each } = drawsOf(dice);
  if (!n) return 0.5;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += draw(r) * each;
  return Math.round(sum * 100) / 100;
}

export const OUTCOMES = ["critical failure", "major failure", "minor failure", "mixed", "minor success", "major success", "critical success"] as const;
export type Outcome = -3 | -2 | -1 | 0 | 1 | 2 | 3;
export const outcomeName = (o: Outcome): string => OUTCOMES[o + 3]!;

/** What an attribute and a skill are expected to be: a character at these is as likely to do well as badly. */
const EXPECTED_ATTRIBUTE = 6.4;
const EXPECTED_SKILL = 1.8;

/** The chance of each step, read from the top down, at [far below, exactly at, far above] what is expected. */
const STEPS: readonly (readonly [number, number, number])[] = [
  [0.01, 0.1, 0.3],
  [0.05, 0.166666667, 0.35],
  [0.1, 0.24, 0.45],
  [0.1, 0.245614035, 0.5],
  [0.2, 0.41860465116, 0.6],
  [0.25, 0.6, 0.75],
];

function chanceAt(step: readonly [number, number, number], over: number, forSkill: boolean): number {
  const [low, mid, high] = step;
  const spread = forSkill ? 3 : 6;
  if (over === 0) return mid;
  return over > 0 ? mid + (high - mid) * (1 - Math.pow(1.5, -over / spread)) : low + (mid - low) * Math.pow(1.5, over / spread);
}

/**
 * The six thresholds a roll is read against, lowest first, for an attribute or a skill at `level`. A roll under the
 * first is a critical failure; at or over the last, a critical success. At exactly the expected level they are
 * 0.10, 0.25, 0.43, 0.57, 0.75, 0.90; a higher level lowers them all.
 */
export function thresholds(level: number, forSkill: boolean): number[] {
  const over = level - (forSkill ? EXPECTED_SKILL : EXPECTED_ATTRIBUTE);
  const t = new Array<number>(6);
  let above = 1;
  for (let i = 5; i >= 0; i--) {
    above = Math.round((above - above * chanceAt(STEPS[5 - i]!, over, forSkill)) * 100) / 100;
    t[i] = above;
  }
  return t;
}

export function outcomeOf(roll: number, t: readonly number[]): Outcome {
  return (t.filter((x) => roll >= x).length - 3) as Outcome;
}

/* ------------------------------------------------- what a model judged ------------------------------------------------- */

/** Each score is -3 (works against it) to 3 (works for it); 0 is neither. */
export interface Scores {
  /** Could it be done at all, here, by this character? */
  physical: number;
  /** How likely is it to work, done this way, in this situation? */
  likelihood: number;
  /** How well the thing used suits the action, when a thing is used. */
  item?: number | null;
  /** How well the ability used suits the action, when one is used. */
  ability?: number | null;
  /** One more thing about this moment that bears on it, named by the judge. */
  other?: { what: string; score: number } | null;
}

export interface Judged {
  attribute: Attribute;
  skill: string;
  scores: Scores;
  item?: string | null;
  ability?: string | null;
  target?: string | null;
}

export interface Modifier {
  what: string;
  /** In hundredths of the roll: +15 moves a roll of 0.50 to 0.65. */
  by: number;
  why?: string;
}

const score = (v: unknown): number => Math.max(-3, Math.min(3, Math.round(Number(v) || 0)));

/** A judge's scores as changes to the roll. What cannot be done counts against a roll more than ease counts for it. */
export function judgedModifiers(s: Scores): Modifier[] {
  const out: Modifier[] = [];
  const p = score(s.physical);
  out.push({ what: "how possible it is", by: p < 0 ? p * 5 : p * 3 });
  out.push({ what: "how likely it is to work", by: score(s.likelihood) * 5 });
  if (s.item !== undefined && s.item !== null) out.push({ what: "what is used", by: score(s.item) * 5 });
  if (s.ability !== undefined && s.ability !== null) out.push({ what: "the ability used", by: score(s.ability) * 5 });
  if (s.other && typeof s.other === "object" && clean(s.other.what, 60)) out.push({ what: clean(s.other.what, 60), by: score(s.other.score) * 5 });
  return out.filter((m) => m.by !== 0);
}

/** How far up the seven steps of power a character of this level stands (level 1 is 2, level 20 is 7). */
export function tierOf(level: number): number {
  const at = [-1, 1, 5, 9, 13, 17, 20];
  if (level >= 20) return 7;
  for (let i = 1; i < at.length; i++) if (level < at[i]!) return i + (level - at[i - 1]!) / (at[i]! - at[i - 1]!);
  return 7;
}

/** The rules' own changes to a roll: a strong ability helps, and a foe much stronger or weaker than you tells. */
export function ruleModifiers(r: Run, j: Judged): Modifier[] {
  const out: Modifier[] = [];
  const a = j.ability ? r.sheet.abilities.find((x) => same(x.name, j.ability!)) : undefined;
  if (a) {
    const by = a.tier === 2 ? 15 : a.tier === 1 ? 5 : a.kind === "learned" ? 5 : 0;
    if (by) out.push({ what: `${a.name}`, by });
  }
  const t = j.target ? person(r, j.target) : undefined;
  if (t && t.hostile && !t.dead) {
    const apart = t.power - tierOf(r.sheet.level);
    if (Math.abs(apart) > 0.2) out.push({ what: apart > 0 ? `${t.name} is stronger than you` : `${t.name} is weaker than you`, by: Math.round(-apart * 10) });
  }
  // How hard the player has set the game: the same on every roll.
  const hardship = HARDSHIP_BY[rulesOf(r).hardship];
  if (hardship) out.push({ what: hardship > 0 ? "a kind table" : "a harsh table", by: hardship });
  return out;
}

export interface Roll {
  raw: number;
  modifiers: Modifier[];
  total: number;
  attribute: { name: Attribute; level: number; thresholds: number[]; outcome: Outcome };
  skill: { name: string; level: number; thresholds: number[]; outcome: Outcome; fresh: boolean };
  /** True when the attribute and the skill disagreed by an odd step and a coin settled it. */
  coin: boolean;
  outcome: Outcome;
}

/**
 * One roll for one judged action. The same roll is read twice, once against the attribute and once against the skill,
 * and the outcome is the middle of the two readings (a coin settles a half step). `more` are the changes the game's
 * further systems make to the roll.
 */
export function resolve(r: Run, j: Judged, more: readonly Modifier[] = []): Roll {
  const raw = rawRoll(r);
  const modifiers = [...judgedModifiers(j.scores), ...ruleModifiers(r, j), ...more.filter((m) => m.by !== 0)];
  const total = Math.round((raw + modifiers.reduce((n, m) => n + m.by, 0) * 0.01) * 100) / 100;
  const attrLevel = r.sheet.attributes[j.attribute] ?? 2;
  const at = thresholds(attrLevel, false);
  const known = skillOf(r.sheet, j.skill);
  const skLevel = known?.level ?? 1;
  const st = thresholds(skLevel, true);
  const a = outcomeOf(total, at);
  // An action no skill was named for is read against the attribute alone.
  const s = known || tidy(j.skill) ? outcomeOf(total, st) : a;
  let sum = a + s;
  const coin = sum % 2 !== 0;
  if (coin) sum += draw(r) < 0.5 ? -1 : 1;
  const outcome = Math.max(-3, Math.min(3, sum / 2)) as Outcome;
  return { raw, modifiers, total, attribute: { name: j.attribute, level: attrLevel, thresholds: at, outcome: a }, skill: { name: known?.name ?? tidy(j.skill), level: skLevel, thresholds: st, outcome: s, fresh: !known }, coin, outcome };
}

/* ------------------------------------------------- names ------------------------------------------------- */

export const clean = (v: unknown, most: number): string => (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, most);
const tidy = (s: string): string => {
  const t = clean(s, 40).toLowerCase();
  return t ? t[0]!.toUpperCase() + t.slice(1) : "";
};
const key = (s: string): string => s.toLowerCase().replace(/^(the|a|an)\s+/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Whether two names are plainly the same thing: alike once case, a leading article and punctuation are set aside. */
export function same(a: string, b: string): boolean {
  const x = key(a), y = key(b);
  return !!x && x === y;
}

const NOT_NAMES = new Set(["you", "player", "i", "me", "he", "she", "they", "it", "him", "her", "them", "someone", "somebody", "nobody", "none", "n a", "unknown"]);

/** Whether a new name can be kept: not empty, not a pronoun, not the player's own, not something already known. */
export function nameOk(r: Run, name: string): boolean {
  const k = key(name);
  if (!k || k.length < 2 || NOT_NAMES.has(k) || /[<>{}]/.test(name)) return false;
  if (same(name, r.sheet.name) || key(r.sheet.name).split(" ").includes(k)) return false;
  return !person(r, name);
}

export function person(r: Run, name: string): Person | undefined {
  return r.people.find((p) => same(p.name, name) || p.was.some((w) => same(w, name)));
}
export const skillOf = (s: Sheet, name: string): Skill | undefined => s.skills.find((k) => same(k.name, name));
export const itemOf = (s: Sheet, name: string): Item | undefined => s.items.find((i) => same(i.name, name));
export const isPlayer = (r: Run, who: string): boolean => /^player$/i.test(who.trim()) || same(who, r.sheet.name);

/* ------------------------------------------------- growing ------------------------------------------------- */

export const skillLevelAt = (xp: number): number => Math.min(SKILL_CAP, Math.floor(Math.pow(xp / 100, 0.8) + 1));
export const skillXpFor = (level: number): number => Math.ceil(100 * Math.pow(level - 1, 1.25));
const SKILL_USE = 45;

/**
 * A skill was rolled on: it is practised, whatever came of it. A skill first named this turn is written down at
 * level 1 and begins to grow from its next use. Returns what to tell, or nothing.
 */
export function practise(s: Sheet, name: string): string | null {
  const known = skillOf(s, name);
  if (!known) {
    const fresh = tidy(name);
    if (!fresh || s.skills.length >= SKILLS_MOST || ATTRIBUTES.includes(fresh.toLowerCase() as Attribute)) return null;
    s.skills.push({ name: fresh, xp: 0, level: 1 });
    return `A new skill: ${fresh}.`;
  }
  if (known.level >= SKILL_CAP) return null;
  const before = known.level;
  known.xp = Math.max(known.xp, skillXpFor(known.level)) + SKILL_USE;
  known.level = Math.max(before, skillLevelAt(known.xp));
  return known.level > before ? `${known.name} is now level ${known.level}.` : null;
}

const stepGrowth = (i: number): number => Math.pow(0.98, i - 1) * 0.28 + 1.02;
/** How much more everything costs at a level than at level 1. */
export function growth(level: number): number {
  let g = 1;
  for (let i = 1; i < level; i++) g *= stepGrowth(i);
  return g;
}
/** The experience it takes to go from `level` to the next: 100, 130, 169, 217 and so on. */
export const xpToNext = (level: number): number => Math.ceil(growth(level) * 100);

/** What one worthwhile deed is worth at a level, before its size is counted. */
export function xpBase(level: number): number {
  return Math.max(1, Math.floor(Math.ceil(xpToNext(level) / 10) * (1.285 / Math.sqrt(level) - 0.285)));
}

/** A deed's size, 1 to 5, as a share of the base: the two smallest are worth nothing. */
const XP_SIZE = [0, 0, 0, 0.75, 1.4, 2.0];

/** Experience for a deed of a size. Returns what to tell; a level gained brings three attribute points. */
export function gainXp(s: Sheet, size: number): string[] {
  const n = Math.max(0, Math.min(5, Math.round(size)));
  if (s.level >= LEVEL_CAP || !XP_SIZE[n]) return [];
  const got = Math.ceil(xpBase(s.level) * XP_SIZE[n]!);
  s.xp += got;
  const said = [`${got} experience.`];
  while (s.level < LEVEL_CAP && s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level++;
    s.points += 3;
    said.push(`Level ${s.level}: three points to put into attributes.`);
  }
  return said;
}

/** Spend an unspent point on an attribute. */
export function spend(s: Sheet, a: Attribute): boolean {
  if (s.points < 1 || !ATTRIBUTES.includes(a)) return false;
  s.points--;
  s.attributes[a]++;
  return true;
}

/* ------------------------------------------------- what the story changed ------------------------------------------------- */

/** Health gained or lost by the player's character, kept between 0 and the most there is. Returns the change made. */
export function hurt(s: Sheet, delta: number): number {
  const before = s.hp;
  s.hp = Math.max(0, Math.min(MAX_HP, s.hp + Math.round(delta)));
  return s.hp - before;
}

export const FEELING_STEP = 10;
/** How someone feels, as a step from -3 (hates) to 3 (devoted). */
export function standing(feeling: number): number {
  return feeling <= -75 ? -3 : feeling <= -45 ? -2 : feeling <= -15 ? -1 : feeling < 15 ? 0 : feeling < 45 ? 1 : feeling < 75 ? 2 : 3;
}
export const STANDINGS = ["hates you", "dislikes you", "is cool toward you", "is neutral toward you", "is warm toward you", "likes you", "is devoted to you"] as const;
export const standingWord = (feeling: number): string => STANDINGS[standing(feeling) + 3]!;

/** A change in how someone feels: at most a step a turn, and never past the ends. */
export function feel(p: Person, delta: number): number {
  const d = Math.max(-FEELING_STEP, Math.min(FEELING_STEP, Math.round(Number(delta) || 0)));
  const before = p.feeling;
  p.feeling = Math.max(-100, Math.min(100, p.feeling + d));
  return p.feeling - before;
}

/** Someone the story has brought in. Null when the name cannot be kept. */
export function meet(r: Run, d: { name: string; text?: string; power?: number; hostile?: boolean }): Person | null {
  const name = clean(d.name, 60);
  if (!nameOk(r, name)) return null;
  const hostile = !!d.hostile;
  const p: Person = { name, text: clean(d.text, 240), power: Math.max(1, Math.min(7, Math.round(Number(d.power) || 3))), hp: MAX_HP, feeling: hostile ? -15 : 0, hostile, follows: false, here: true, dead: false, was: [] };
  r.people.push(p);
  return p;
}

const quality = (q: unknown): Quality => (QUALITIES.includes(String(q).toLowerCase() as Quality) ? (String(q).toLowerCase() as Quality) : "common");

/** A thing gained: added to what is carried, or to the pile of the same thing. */
export function take(s: Sheet, d: { name: string; text?: string; quality?: unknown; qty?: number }): Item | null {
  const name = clean(d.name, 60);
  if (!key(name) || /[<>{}]/.test(name)) return null;
  const qty = Math.max(1, Math.min(99, Math.round(Number(d.qty) || 1)));
  const have = itemOf(s, name);
  if (have) {
    have.qty += qty;
    return have;
  }
  const it: Item = { name, text: clean(d.text, 200), quality: quality(d.quality), qty };
  s.items.push(it);
  return it;
}

/** A thing lost for good: as many as are carried, at most. Returns how many went. */
export function lose(s: Sheet, name: string, qty = 1): number {
  const have = itemOf(s, name);
  if (!have) return 0;
  const n = Math.min(have.qty, Math.max(1, Math.round(Number(qty) || 1)));
  have.qty -= n;
  if (have.qty <= 0) s.items = s.items.filter((i) => i !== have);
  return n;
}

/** An ability the story taught. Null when it is already known or has no name. */
export function learn(s: Sheet, name: string, text: string): Ability | null {
  const n = clean(name, 50);
  if (!key(n) || s.abilities.some((a) => same(a.name, n))) return null;
  const a: Ability = { name: n, text: clean(text, 200), tier: 0, kind: "learned", wait: 0 };
  s.abilities.push(a);
  return a;
}

/** How long an ability rests after use, in turns. */
export const restOf = (a: Ability): number => (a.kind === "learned" ? 4 : a.tier === 2 ? 8 : a.tier === 1 ? 4 : 2);

/** A turn passes: abilities come nearer to ready. */
export function pass(r: Run): void {
  r.turn++;
  for (const a of r.sheet.abilities) if (a.wait > 0) a.wait--;
}

/**
 * The character is brought down, and it is counted. As the game is usually played they come round with a third of
 * their health. The player may have set a fall to cost more (engine/rules.ts): most of what they carried and do not
 * wear is gone too, drawn from the run's own dice, or the story ends there. Returns what was lost.
 */
export function fall(r: Run): string[] {
  r.downs++;
  const how = rulesOf(r).fall;
  if (how === "end") {
    r.sheet.hp = 0;
    r.over = true;
    return [];
  }
  r.sheet.hp = Math.round(MAX_HP * 0.3);
  if (how !== "lose") return [];
  const loose = r.sheet.items.filter((i) => !i.worn);
  const lost: Item[] = [];
  for (let n = Math.ceil(loose.length * LOST_SHARE); n > 0; n--) lost.push(...loose.splice(Math.min(loose.length - 1, Math.floor(draw(r) * loose.length)), 1));
  r.sheet.items = r.sheet.items.filter((i) => !lost.includes(i));
  return lost.map((i) => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ""}`);
}

/* ------------------------------------------------- a new run ------------------------------------------------- */

/** Attributes from an order of strongest to weakest: everyone has 2 in each, and ten more shared out 4, 3, 2, 1, 0. */
export function attributesFrom(order: readonly string[]): Record<Attribute, number> {
  const ranked = [...new Set(order.map((a) => String(a).toLowerCase()).filter((a): a is Attribute => ATTRIBUTES.includes(a as Attribute)))];
  for (const a of ATTRIBUTES) if (!ranked.includes(a)) ranked.push(a);
  const out = {} as Record<Attribute, number>;
  ranked.forEach((a, i) => (out[a] = 2 + [4, 3, 2, 1, 0][i]!));
  return out;
}

export function newRun(seed: number, world: string, who: string, name: string): Run {
  return {
    v: 1,
    seed: seed >>> 0,
    n: 0,
    world,
    who,
    sheet: { name: clean(name, 60) || "The traveller", calling: "", level: 1, xp: 0, hp: MAX_HP, attributes: attributesFrom([]), points: 0, skills: [], abilities: [], items: [], money: 0, coin: "coins" },
    place: { name: "", text: "" },
    people: [],
    opening: "",
    beats: [],
    summary: "",
    minutes: 0,
    turn: 0,
    downs: 0,
  };
}

/* ------------------------------------------------- as text ------------------------------------------------- */

const cap = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** The character sheet, for the player and for every model. */
export function sheetText(r: Run): string {
  const s = r.sheet;
  const lines = [
    `${s.name}${s.calling ? `, ${s.calling}` : ""}. Level ${s.level} (${s.xp} of ${xpToNext(s.level)} experience). Health ${s.hp} of ${MAX_HP}.${s.points ? ` ${s.points} attribute point${s.points === 1 ? "" : "s"} to spend.` : ""}`,
    `Attributes: ${ATTRIBUTES.map((a) => `${cap(a)} ${s.attributes[a]}`).join(", ")}.`,
    `Skills: ${[...s.skills].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)).map((k) => `${k.name} ${k.level}`).join(", ") || "none yet"}.`,
    `Abilities: ${s.abilities.map((a) => `${a.name} (${a.kind === "learned" ? "learned" : ["basic", "strong", "epic"][a.tier]}${a.wait ? `, ready in ${a.wait}` : ""}): ${a.text.replace(/\.$/, "")}`).join(" | ") || "none"}.`,
    `Carrying: ${s.items.map((i) => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ""}${i.quality !== "common" && i.quality !== "mundane" ? ` [${i.quality}]` : ""}${i.worn ? " (worn)" : ""}`).join(", ") || "nothing"}. ${s.money} ${s.coin}.`,
  ];
  return lines.join("\n");
}

/** Where the character is and who is there. */
export function sceneText(r: Run): string {
  const here = r.people.filter((p) => p.here && !p.dead);
  const who = here.map((p) => `- ${p.name}${p.hostile ? " (hostile)" : ""}${p.follows ? " (with you)" : ""}: ${p.text || "no more is known"} Power ${p.power} of 7, ${p.hp > 0 ? `health ${p.hp}` : "beaten: they can do no more"}. ${cap(standingWord(p.feeling))} (${p.feeling}).`);
  const away = r.people.filter((p) => !p.here && !p.dead).slice(-6).map((p) => p.name);
  return [`PLACE: ${r.place.name || "unknown"}${r.place.text ? `. ${r.place.text}` : ""}`, `HERE:\n${who.join("\n") || "- nobody else"}`, away.length ? `ELSEWHERE: ${away.join(", ")}` : ""].filter(Boolean).join("\n");
}

/** A roll as the player is shown it. */
export function rollText(x: Roll): string {
  const pct = (n: number): string => `${Math.round(n * 100)}`;
  const mods = x.modifiers.map((m) => `${m.by > 0 ? "+" : ""}${m.by} ${m.what}`).join(", ");
  const skill = x.skill.name ? ` ${x.skill.name} ${x.skill.level}${x.skill.fresh ? " (new)" : ""}: ${outcomeName(x.skill.outcome)}.` : "";
  return `Rolled ${pct(x.raw)}${mods ? `, ${mods}` : ""} = ${pct(x.total)}. ${cap(x.attribute.name)} ${x.attribute.level}: ${outcomeName(x.attribute.outcome)}.${skill}${x.coin ? " A coin settled it." : ""} ${cap(outcomeName(x.outcome))}.`;
}
