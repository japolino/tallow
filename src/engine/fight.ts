/**
 * Fights and contests: the numbers and the rules (game/systems/fight.ts asks the models and plays them).
 *
 * A fight is anyone hostile who is here and able. While one is on, the other side takes its own turn: whether it does,
 * who it is, and whether something the character wears turns the blow are all settled here, before the story is told.
 * A contest is a drawn-out struggle with sides and two or three measures (a chase's lead, a crowd's mood); each beat
 * moves them a small step, and it ends by its measures, by the story, by being replaced, or by running too long. How
 * one ended sets the experience it brings. A blow that would bring the character down may cost a save instead.
 *
 * Pure and seeded: nothing here asks a model or reads a clock. Randomness comes from the run's own dice (draw).
 */
import { draw, LEVEL_CAP, MAX_HP, person, same, tierOf, xpBase, xpToNext, type Item, type Person, type Quality, type Run, type Sheet } from "./run.js";

/* ------------------------------------------------- the numbers ------------------------------------------------- */

/** Saves from a killing blow a character holds when full. */
export const SAVES_MOST = 2;
/** What a save costs instead of the blow that would have brought the character down. */
export const SAVE_COST = 20;

export type End = "win" | "lose" | "none";
export type Length = "short" | "medium" | "long";
export const LENGTHS: readonly Length[] = ["short", "medium", "long"];
/** How full a measure can get, by how long the contest should run. */
export const CAPACITY: Record<Length, number> = { short: 5, medium: 12, long: 25 };
/** The most beats a contest may run, by its longest measure that can end it: after that it runs out of force. */
export const BEATS_MOST: Record<Length, number> = { short: 8, medium: 14, long: 24 };
/** The most beats for a contest that only beating the other side can end. */
export const FIGHT_BEATS_MOST = 12;
/** The most a measure moves in one beat, either way. */
export const STEP_MOST = 3;
export const SIDES_MOST = 4;
export const MEMBERS_MOST = 5;
export const MEASURES_MOST = 3;
export const ENDING_MOST = 2;
export const LINES_MOST = 3;
/** A turn whose passage takes at least this many minutes has moved past any plain fight. */
export const FIGHT_MINUTES_MOST = 60;

/** Experience for a contest ended, by how it went (1 to 5), as a share of what one worthwhile deed is worth. */
const CONTEST_XP = [0, 0.65, 1.0, 1.7, 2.7, 3.7];
/** What the turn's own read-back gives for a deed of each size (engine/run.ts, gainXp): kept in step with it. */
const DEED_XP = [0, 0, 0, 0.75, 1.4, 2.0];

/* ------------------------------------------------- the state ------------------------------------------------- */

export interface Measure {
  name: string;
  value: number;
  max: number;
  length: Length;
  /** What it means for the player's character when the measure fills, and when it empties. */
  atFull: End;
  atEmpty: End;
  /** Which way is better for the player's character. */
  good: "up" | "down";
}

export interface Side {
  name: string;
  /** Against the player's character. */
  against: boolean;
  /** The player's character is on this side. */
  you: boolean;
  /** Names of people in the run. */
  members: string[];
}

export interface Contest {
  name: string;
  /** How hard it is, 1 (trivial) to 7 (extremely hard). */
  rating: number;
  sides: Side[];
  measures: Measure[];
  /** Lines the player might write next: offered on the table, never needed. */
  lines: string[];
  /** The turn it was built, the beats it has run, and the most it may run. */
  began: number;
  beats: number;
  most: number;
}

/** The other side's own move, settled before the story of a turn is told. */
export interface Move {
  turn: number;
  /** Who acts; empty when it is the situation itself that turns against the character. */
  actor: string;
  /** Whether the one acting is fighting the character (so it is an attack, and worn things may turn it). */
  hostile: boolean;
  /** The worn thing that turns the blow, or null. */
  stopped: string | null;
}

/** What `follow` is left to do by `apply` in the same turn. */
export interface After {
  turn: number;
  /** The other side's move, which the passage did not show. */
  move: Move | null;
  /** A contest's ending, to be told. */
  tell: { name: string; how: string } | null;
  /** A contest that has begun, to be built. */
  build: { name: string; rating: number } | null;
}

export interface FightState {
  saves: number;
  savesMost: number;
  contest: Contest | null;
  /** Who of the other side has their turn next: a bag drawn from until empty, so each gets a turn. */
  bag: string[];
  move: Move | null;
  after: After | null;
  /** Contests that have ended lately, newest last. */
  ended: { name: string; how: string; turn: number }[];
  /** How many times the character had been brought down when last looked; a fall ends a contest. */
  downs: number;
  /** The turn a save was last spent, or -1. */
  spared: number;
}

export const freshFight = (r: Run): FightState => ({ saves: SAVES_MOST, savesMost: SAVES_MOST, contest: null, bag: [], move: null, after: null, ended: [], downs: r.downs, spared: -1 });

/** The state as it stands, without writing anything into the run (a run saved before this system has none). */
export function viewFight(r: Run): FightState {
  const f = freshFight(r);
  const k = r.sys?.fight as Partial<FightState> | undefined;
  if (!k || typeof k !== "object") return f;
  const n = (v: unknown, otherwise: number): number => (typeof v === "number" && Number.isFinite(v) ? v : otherwise);
  return {
    saves: n(k.saves, f.saves),
    savesMost: n(k.savesMost, f.savesMost),
    contest: k.contest ?? null,
    bag: Array.isArray(k.bag) ? k.bag : [],
    move: k.move ?? null,
    after: k.after ?? null,
    ended: Array.isArray(k.ended) ? k.ended : [],
    downs: n(k.downs, f.downs),
    spared: n(k.spared, f.spared),
  };
}

/** The state to change: made the first time, and filled out where a field came later. */
export function fightOf(r: Run): FightState {
  const st = viewFight(r);
  (r.sys ??= {}).fight = st;
  return st;
}

/* ------------------------------------------------- who is fighting ------------------------------------------------- */

/** Someone fighting the character who can still act. */
export const able = (p: Person): boolean => p.here && !p.dead && p.hp > 0 && p.hostile;
export const foesOf = (r: Run): Person[] => r.people.filter(able);

/** How far above the character someone stands on the seven steps of power (below is negative). */
export const gapOf = (r: Run, power: number): number => power - tierOf(r.sheet.level);

/** A gap in power as one of seven steps, -3 (vastly weaker) to 3 (overwhelming). */
export function stepOf(gap: number): number {
  if (gap > 2.5) return 3;
  if (gap > 1.5) return 2;
  if (gap > 0.5) return 1;
  if (gap >= -0.5) return 0;
  if (gap >= -1.5) return -1;
  if (gap >= -2.5) return -2;
  return -3;
}

/** How lopsided a fight with one foe is, as one sentence for every model. */
export function foeWords(foe: string, you: string, step: number): string {
  const says: Record<number, string> = {
    [-3]: `${foe} is far beneath ${you}: they can hardly trouble ${you}, who should make short work of them.`,
    [-2]: `${foe} is much weaker than ${you}: it should be an easy fight.`,
    [-1]: `${foe} is somewhat weaker than ${you}, who has the upper hand.`,
    0: `${foe} is about a match for ${you}: a long, even struggle in which neither side is easily finished.`,
    1: `${foe} is somewhat stronger than ${you}: a hard fight.`,
    2: `${foe} is much stronger than ${you}: a very hard fight, in which most of what ${you} tries is shrugged off.`,
    3: `${foe} is overwhelmingly stronger than ${you}: almost nothing ${you} tries will work.`,
  };
  return says[Math.max(-3, Math.min(3, step))]!;
}

/** How hard a contest is for the character, as one sentence for every model. */
export function contestWords(you: string, step: number): string {
  const says: Record<number, string> = {
    [-3]: `It is very easy for ${you}: it should be no trouble to come through.`,
    [-2]: `It is easy for ${you}, who should prevail without much trouble.`,
    [-1]: `It is somewhat easy for ${you}, who has the upper hand.`,
    0: `It is a fair test for ${you}: drawn out, with no easy wins and no sudden losses.`,
    1: `It is hard for ${you}: an uphill struggle.`,
    2: `It is very hard for ${you}, and will take a great deal to come through.`,
    3: `It is overwhelming for ${you}: almost nothing ${you} tries will work.`,
  };
  return says[Math.max(-3, Math.min(3, step))]!;
}

/** The people on the sides against the character who are here and can still act. */
export function opposing(r: Run, c: Contest): Person[] {
  const out: Person[] = [];
  for (const s of c.sides) if (s.against) for (const m of s.members) {
    const p = person(r, m);
    if (p && p.here && !p.dead && p.hp > 0 && !out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * How far a contest stands above the character: half its rating against their step of power, and half the strength of
 * the sides against them against their own side (each counted as 2 to the power of their step above the character).
 */
export function contestGap(r: Run, c: Contest): number {
  const tier = tierOf(r.sheet.level);
  const byRating = c.rating - tier;
  const strength = (ps: Person[]): number => ps.reduce((n, p) => n + Math.pow(2, p.power - tier), 0);
  const against = c.sides.filter((s) => s.against).flatMap((s) => s.members).map((m) => person(r, m)).filter((p): p is Person => !!p && !p.dead);
  // With nobody against them, the sides weigh nothing either way.
  if (!against.length) return 0.5 * byRating;
  const withYou = c.sides.filter((s) => s.you && !s.against).flatMap((s) => s.members).map((m) => person(r, m)).filter((p): p is Person => !!p && !p.dead);
  // The character counts as one at their own step.
  const bySides = Math.log2(strength(against) / (strength(withYou) + 1));
  return 0.5 * byRating + 0.5 * bySides;
}

/** A change to a roll for a gap in power: a tenth of the roll for each step, when the gap is more than a fifth of a step. */
export const gapModifier = (gap: number): number => (Math.abs(gap) > 0.2 ? Math.round(-gap * 10) : 0);

/* ------------------------------------------------- the other side's move ------------------------------------------------- */

/** What the player's line was, as far as the other side's move needs to know. */
export interface Line {
  kind: "action" | "story";
  verdict: string | null;
  outcome: number | null;
  target: string | null;
}

/** What the player's line was read for: trying to get away, and writing the fight as left behind. */
export interface Reading {
  flee: boolean;
  over: boolean;
  /** Whether the other side would take its own turn after this line; when not read, it does. */
  press?: boolean;
}

/** One name from a bag that gives each a turn before anyone has a second; the bag is refilled, shuffled, when empty. */
export function drawFromBag(r: Run, bag: string[], names: readonly string[]): string | null {
  if (!names.length) return null;
  const left = bag.filter((n) => names.some((x) => same(x, n)));
  bag.length = 0;
  bag.push(...left);
  if (!bag.length) {
    const fresh = [...names];
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(draw(r) * (i + 1));
      [fresh[i], fresh[j]] = [fresh[j]!, fresh[i]!];
    }
    bag.push(...fresh);
  }
  return bag.shift() ?? null;
}

/** The chance that a worn thing of a quality turns a blow, from two rolls of the dice. */
export function guardChance(q: Quality, a: number, b: number): number {
  const within = (lo: number, hi: number): number => lo + (hi - lo) * a;
  switch (q) {
    case "legendary": return within(0.75, 0.95);
    case "epic": return within(0.5, 0.7);
    case "rare": return within(0.25, 0.45);
    case "uncommon": return within(0.1, 0.15);
    // Only about one common thing in three has any knack for it, and then a small one.
    case "common": return b < 0.35 ? within(0.01, 0.05) : 0;
    default: return 0;
  }
}

/** Whether something the character wears turns a blow: one worn thing, at random, has its chance. Returns its name or null. */
export function gearStops(r: Run): string | null {
  const worn: Item[] = r.sheet.items.filter((i) => i.worn);
  if (!worn.length) return null;
  const it = worn[Math.floor(draw(r) * worn.length)]!;
  const chance = guardChance(it.quality, draw(r), draw(r));
  return chance > 0 && draw(r) < chance ? it.name : null;
}

/**
 * Whether the other side takes its own turn this time, and who. Never when the player only wrote what happens around
 * them, or wrote the fight as left behind, or got clean away, or wrote a line the other side would hold for; never by anyone beaten, dead, gone or calmed. A line that
 * fails or does nothing to the fight gives the other side its chance; one that goes narrowly well gives it half a
 * chance; one that goes clearly well gives half a chance to someone other than the one it was done to.
 */
export function chooseMove(r: Run, st: FightState, t: Line, read: Reading | null): Move | null {
  // The other side holds when the line gives it reason to (the player yields, or is being heard out): a reader says so.
  if (t.kind !== "action" || !read || read.over || read.press === false) return null;
  const foes = foesOf(r);
  const c = st.contest;
  const others = c ? opposing(r, c).filter((p) => !foes.includes(p)) : [];
  if (!foes.length && !c) return null;
  const o = t.outcome;
  if (read.flee && (t.verdict === "trivial" || (o !== null && o >= 1))) return null;
  if (o !== null && o >= 1 && draw(r) >= 0.5) return null;
  const spare = o !== null && o >= 2 && t.target ? t.target : null;
  const pool = [...foes, ...others].filter((p) => !spare || !same(p.name, spare));
  if (!pool.length) {
    // A contest with nobody left to act for the other side may still turn against the character by itself.
    if (!c || foes.length) return null;
    return { turn: r.turn, actor: "", hostile: false, stopped: null };
  }
  const name = drawFromBag(r, st.bag, pool.map((p) => p.name))!;
  const p = pool.find((x) => same(x.name, name))!;
  return { turn: r.turn, actor: p.name, hostile: p.hostile, stopped: p.hostile ? gearStops(r) : null };
}

/* ------------------------------------------------- a contest ------------------------------------------------- */

/** A contest as a builder wrote it, once each name has been looked up. */
export interface Draft {
  name: string;
  rating: number;
  sides: { name: string; against: boolean; members: string[] }[];
  measures: { name: string; length: Length; start: "low" | "middle" | "high"; atFull: End; atEmpty: End; good: "up" | "down" }[];
  lines: string[];
}

/** The player's character, as a builder names them among a side's members. */
export const YOU = "PLAYER";

/**
 * A contest from a draft, with the game's limits: at most four sides of five, everyone on one side only, the player's
 * character on exactly one side and never against themselves; two or three measures, at most two of them able to end
 * it, none starting at an end that would end it. Null when what is left cannot make a contest.
 */
export function makeContest(r: Run, d: Draft): Contest | null {
  const placed = new Set<Person>();
  let youPlaced = false;
  const sides: Side[] = [];
  for (const s of d.sides.slice(0, SIDES_MOST)) {
    const name = s.name.trim();
    if (!name || sides.some((x) => same(x.name, name))) continue;
    const members: string[] = [];
    let you = false;
    for (const m of s.members.slice(0, MEMBERS_MOST)) {
      if (m.trim().toUpperCase() === YOU || same(m, r.sheet.name)) {
        if (youPlaced || s.against) continue;
        you = youPlaced = true;
        continue;
      }
      const p = person(r, m);
      if (!p || p.dead || !p.here || placed.has(p)) continue;
      placed.add(p);
      members.push(p.name);
    }
    if (members.length || you) sides.push({ name, against: s.against, you, members });
  }
  if (!youPlaced) sides.unshift({ name: `${r.sheet.name}'s side`, against: false, you: true, members: [] });
  if (sides.length > SIDES_MOST) sides.length = SIDES_MOST;
  const measures: Measure[] = [];
  let ending = 0;
  for (const m of d.measures) {
    if (measures.length >= MEASURES_MOST) break;
    const name = m.name.trim();
    if (!name || measures.some((x) => same(x.name, name))) continue;
    let atFull = m.atFull, atEmpty = m.atEmpty;
    if (atFull !== "none" || atEmpty !== "none") {
      if (ending >= ENDING_MOST) atFull = atEmpty = "none";
      else ending++;
    }
    const max = CAPACITY[m.length];
    let value = m.start === "low" ? Math.round(max * 0.25) : m.start === "high" ? Math.round(max * 0.75) : Math.round(max / 2);
    if ((atFull !== "none" && value >= max) || (atEmpty !== "none" && value <= 0)) value = Math.round(max / 2);
    const good = atFull === "win" || atEmpty === "lose" ? "up" : atFull === "lose" || atEmpty === "win" ? "down" : m.good;
    measures.push({ name, value, max, length: m.length, atFull, atEmpty, good });
  }
  if (!measures.length) return null;
  const endings = measures.filter((m) => m.atFull !== "none" || m.atEmpty !== "none");
  const most = endings.length ? Math.max(...endings.map((m) => BEATS_MOST[m.length])) : FIGHT_BEATS_MOST;
  return { name: d.name, rating: Math.max(1, Math.min(7, Math.round(d.rating))), sides, measures, lines: d.lines.slice(0, LINES_MOST), began: r.turn, beats: 0, most };
}

/** A measure moved by a step of at most three, kept within its bounds. Returns the change made. */
export function moveMeasure(m: Measure, by: number): number {
  const step = Math.max(-STEP_MOST, Math.min(STEP_MOST, Math.round(Number(by) || 0)));
  const before = m.value;
  m.value = Math.max(0, Math.min(m.max, m.value + step));
  return m.value - before;
}

/** A change to who stands where: a person joins a side (a new one if it is not there and there is room), or leaves. */
export function moveSide(r: Run, c: Contest, who: string, side: string, against: boolean): string | null {
  const p = person(r, who);
  if (!p || p.dead) return null;
  for (const s of c.sides) s.members = s.members.filter((m) => !same(m, p.name));
  if (/^none$/i.test(side.trim())) return `${p.name} is out of ${c.name}.`;
  let to = c.sides.find((s) => same(s.name, side));
  if (!to) {
    if (c.sides.length >= SIDES_MOST) return null;
    to = { name: side.trim(), against, you: false, members: [] };
    c.sides.push(to);
  }
  if (to.members.length >= MEMBERS_MOST) return null;
  to.members.push(p.name);
  return `${p.name} is now with ${to.name}${to.against ? ", against you" : to.you ? ", on your side" : ""}.`;
}

/** How a contest ended, and how well it went for the character (0 to 5), for the experience it brings. */
export interface Ending {
  how: string;
  /** 0 nothing; 1 to 5 by CONTEST_XP. */
  size: number;
  /** Whether the passage already told it (so it need not be told again). */
  told: boolean;
}

/**
 * Whether a contest has ended by its own measures, by nobody being left to fight on, or by running too long. The first
 * measure at an end that means something ends it: a win is worth its rating (1 to 5), a loss nothing.
 */
export function endOf(r: Run, c: Contest): Ending | null {
  const you = r.sheet.name;
  for (const m of c.measures) {
    const end = m.value >= m.max ? m.atFull : m.value <= 0 ? m.atEmpty : "none";
    if (end === "none") continue;
    const at = m.value >= m.max ? "is at its fullest" : "has run out";
    return end === "win"
      ? { how: `${m.name} ${at}, and ${you} wins it`, size: Math.max(1, Math.min(5, c.rating)), told: false }
      : { how: `${m.name} ${at}, and ${you} loses it`, size: 0, told: false };
  }
  // A fight that only beating the other side can end is over when nobody against the character is here and able.
  const endings = c.measures.some((m) => m.atFull !== "none" || m.atEmpty !== "none");
  const against = c.sides.some((s) => s.against && s.members.length);
  if (!endings && against && !opposing(r, c).length) return { how: `nobody is left to fight ${you}`, size: Math.max(1, Math.min(5, c.rating)), told: true };
  if (c.beats >= c.most) return { how: "it has dragged on until it runs out of force: it ends with no clear winner, and both sides draw back", size: 0, told: false };
  return null;
}

/* ------------------------------------------------- experience ------------------------------------------------- */

/** Experience for a contest that went this well (1 to 5), at a level. */
export const contestXp = (level: number, size: number): number => (size >= 1 && size <= 5 ? Math.ceil(xpBase(level) * CONTEST_XP[size]!) : 0);
/** What the turn's own read-back gave for a deed of this size, at a level. */
export const deedXp = (level: number, size: number): number => (DEED_XP[size] ? Math.ceil(xpBase(level) * DEED_XP[size]!) : 0);

/** Experience added to the sheet; a level gained brings three attribute points. Returns what to tell. */
export function addXp(s: Sheet, amount: number): string[] {
  const n = Math.max(0, Math.round(amount));
  if (!n || s.level >= LEVEL_CAP) return [];
  s.xp += n;
  const said = [`${n} experience.`];
  while (s.level < LEVEL_CAP && s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level++;
    s.points += 3;
    said.push(`Level ${s.level}: three points to put into attributes.`);
  }
  return said;
}

/* ------------------------------------------------- saves from a killing blow ------------------------------------------------- */

/**
 * The character would be brought down: a save, if one is left, takes the blow for a flat cost from the health they had
 * before it. When that cost would bring them down too, the save cannot hold it and is kept. Returns the health left, or null.
 */
export function spend(st: FightState, hpBefore: number): number | null {
  if (st.saves < 1) return null;
  const left = Math.min(MAX_HP, hpBefore) - SAVE_COST;
  if (left <= 0) return null;
  st.saves--;
  return left;
}
