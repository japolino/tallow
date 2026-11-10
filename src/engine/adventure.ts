/**
 * The rules of a whole adventure (docs/DESIGN.md, 1.2 and 1.4): a road of stops between you and a goal, with forks,
 * a clock that runs against you, resting, running out, companions, things kept, and the last stop where it comes to a
 * head. Each stop is played with the rules of one moment (moment.ts); this file only joins them up.
 *
 * Code decides every number here, from seeded dice. Nothing a model says changes any of it. A trip is never changed
 * in place: every step returns the next one.
 */
import type { MapSheet } from "../room/mapsheet.js";
import { isPerkLever, LEVEL_EVERY, perkLever, perkOf } from "./hero.js";
import { GOODWILL_MAX, resolve, STAT_MAX, startMoment, type Lever, type Moment, type Outcome, type Read, type Sheet, type Stat, type Stop, type Way } from "./moment.js";

/** The most health you can have. Resting heals you back toward it. */
export const HEALTH_MAX = 5;
/** Resting takes this long, and heals this much (one supply is eaten; with none left it heals 1). */
export const REST_HOURS = 3;
export const REST_HEALS = 2;
/** Going down with no health left: you come to this many hours later, with 1 health. */
export const FALL_HOURS = 4;
/** Turned back at an ordinary stop, you go the long way round it: this many hours and 1 supply. */
export const LONG_WAY_HOURS = 2;

/** A named place on the map. */
export interface Place {
  id: string;
  name: string;
  /** Position on the map sheet, 0..1 across and 0..1 down (0 is the far edge). */
  u: number;
  v: number;
}

/** What getting past a stop gives you, said by the narrator as it is given. */
export interface Reward {
  /** A thing you keep (its id in the adventure's `loot`). */
  loot?: string;
  /** Someone who walks on with you (an id in the adventure's `companions`). */
  joins?: string;
  says: string;
}

/** A stop on the road: the moment's stop, and what the table shows of it. */
export interface RoadStop extends Stop {
  /** Its card's kind (cards.ts). */
  card: string;
  /** How many good tries it takes to get past: 1 unless said otherwise. A fight or the last stop may take more. */
  holds?: number;
  /** A line about it the narrator says at a fork, before the card is turned. */
  teaser: string;
  climax?: boolean;
  reward?: Reward;
}

/** Someone who can walk with you. They are good at one thing, and they have opinions. */
export interface Companion {
  id: string;
  name: string;
  card: string;
  /** Who they are, in a line. */
  who: string;
  /** While they are with you this stat counts one higher (never past the most a stat can be). */
  stat: Stat;
  /** Getting past a stop this way pleases them, and they speak well of you: 1 goodwill. */
  likes: Way;
  /** Getting past a stop this way they hold against you, and say so: 1 goodwill lost. */
  dislikes: Way;
}

/** A thing you keep. Using it later makes one way one step easier, once, at any stop. */
export interface Loot {
  id: string;
  name: string;
  card: string;
  way: Way;
  /** Words in a written line that mean it is being used. */
  words: readonly string[];
}

/** A person on the card, as the table shows them. */
export interface Person {
  name: string;
  card: string;
  who: string;
}

export interface Adventure {
  id: string;
  title: string;
  trope: "rescue" | "courtship";
  /** What the narrator says the job is, at the start. */
  goal: string;
  /** Who you are, written on the first page. */
  who: string;
  seed: number;
  places: Place[];
  /** Where you set out from. It is not a stop: nothing stands in your way there. */
  start: string;
  /** The roads, one way only, toward the goal: from, to, and how many hours the going takes. */
  roads: [string, string, number][];
  stops: RoadStop[];
  /** The hour of the day it starts at. */
  startHour: number;
  /** The clock: past this hour (it runs past 24 into the next day) the job is lost. */
  deadline: { hour: number; name: string; lost: string };
  /** Someone you are courting, who lies face up by you from the start. */
  courted?: Person;
  /** Someone who gains ground on every try that fails. When they have `max`, the job is lost. */
  rival?: Person & { max: number; lost: string };
  companions: Companion[];
  /** Companions who walk with you from the start (ids in `companions`): the card's own character, in a rescue. */
  party?: string[];
  loot: Loot[];
  /** Said when you are past the last stop. */
  won: string;
}

export type Ending = "won" | "deadline" | "rival" | "turned_back";

/** Where you are in an adventure. */
export interface Trip {
  adv: Adventure;
  seed: string;
  /** What you carry. Its stats are your own, without your companions' help. */
  sheet: Sheet;
  /** The last place you reached: where you set out, or a stop you got past or went round. */
  at: string;
  /** Stops you have reached, in order. */
  visited: string[];
  /** The stop in your way, and how many good tries it still takes. */
  facing: { stop: RoadStop; moment: Moment; holds: number } | null;
  party: string[];
  kept: string[];
  /** Your knacks (hero.ts). */
  perks: string[];
  /** How many stops you have got past (not gone round): every LEVEL_EVERY of them, you level up. */
  passed: number;
  /** How far the rival has got. */
  rival: number;
  /** Set by resting: word of you has gone ahead, and the next stop starts a step harder. */
  warned: number;
  over: Ending | null;
}

export function mapOf(adv: Adventure): MapSheet {
  const climax = new Set(adv.stops.filter((s) => s.climax).map((s) => s.id));
  const paths: [string, string][] = adv.roads.map(([a, b]) => [a, b]);
  return { title: adv.title, seed: adv.seed, stops: adv.places.map((p) => ({ ...p, ...(climax.has(p.id) ? { climax: true } : {}) })), paths };
}

export const stopOf = (adv: Adventure, id: string): RoadStop | undefined => adv.stops.find((s) => s.id === id);
export const placeName = (adv: Adventure, id: string): string => adv.places.find((p) => p.id === id)?.name ?? id;
export const placeOf = (adv: Adventure, id: string): Place | undefined => adv.places.find((p) => p.id === id);
export const companionOf = (adv: Adventure, id: string): Companion | undefined => adv.companions.find((c) => c.id === id);
export const lootOf = (adv: Adventure, id: string): Loot | undefined => adv.loot.find((l) => l.id === id);

const copySheet = (s: Sheet): Sheet => ({ ...s, stats: { ...s.stats } });

export function startTrip(adv: Adventure, sheet: Sheet, seed: string, perks: readonly string[] = []): Trip {
  const party = (adv.party ?? []).filter((id) => companionOf(adv, id));
  return { adv, seed, sheet: { ...copySheet(sheet), hour: adv.startHour }, at: adv.start, visited: [], facing: null, party, kept: [], perks: [...perks], passed: 0, rival: 0, warned: 0, over: null };
}

/** Take a knack at a level-up. It counts from the next stop on. */
export function takePerk(t: Trip, id: string): Trip {
  return perkOf(id) && !t.perks.includes(id) ? { ...t, perks: [...t.perks, id] } : t;
}

/** The stops you can go on to from where you are: one, or two at a fork. */
export function ahead(t: Trip): RoadStop[] {
  if (t.over || t.facing) return [];
  return t.adv.roads.filter(([a, b]) => a === t.at && !t.visited.includes(b)).map(([, b]) => stopOf(t.adv, b)!).filter(Boolean);
}

/** The stops not reached yet: the cards still face down on the map. */
export const unturned = (t: Trip): RoadStop[] => t.adv.stops.filter((s) => !t.visited.includes(s.id));

/** How long the road from where you are to a stop takes. */
export function hoursTo(t: Trip, stopId: string): number {
  return t.adv.roads.find(([a, b]) => a === t.at && b === stopId)?.[2] ?? 0;
}

/** The sheet a moment is played with: your own, with each companion's help added. */
function helped(t: Trip, sheet: Sheet): Sheet {
  const s = copySheet(sheet);
  for (const id of t.party) {
    const c = companionOf(t.adv, id);
    if (c) s.stats[c.stat] = Math.min(STAT_MAX, s.stats[c.stat] + 1);
  }
  return s;
}

/** The stop as it is played: with the things you keep, and your knacks, added to what is there to use. */
function withKept(t: Trip, stop: RoadStop): Stop {
  const kept: Lever[] = t.kept.map((id) => lootOf(t.adv, id)!).filter(Boolean).map((l) => ({ id: l.id, way: l.way, name: l.name, words: l.words }));
  const knacks: Lever[] = t.perks.map((id) => perkOf(id)).filter((p) => !!p).map((p) => perkLever(p!));
  return { ...stop, levers: [...stop.levers, ...kept, ...knacks] };
}

/** A try that uses nothing in the scene leans on a knack for its way, if there is one not used yet at this stop. */
export function withKnack(m: Moment, read: Read): Read {
  const named = read.lever ? m.stop.levers.find((l) => l.id === read.lever && l.way === read.way && !m.spent.includes(l.id)) : undefined;
  if (named && !isPerkLever(named.id)) return read;
  const knack = m.stop.levers.find((l) => isPerkLever(l.id) && l.way === read.way && !m.spent.includes(l.id));
  return knack ? { ...read, lever: knack.id } : named ? read : { ...read, lever: null };
}

function overClock(t: Trip): Trip {
  return !t.over && t.sheet.hour >= t.adv.deadline.hour ? { ...t, over: "deadline" } : t;
}

export interface Arrival {
  trip: Trip;
  stop: RoadStop;
  hours: number;
}

/** Go on to a stop: the road takes its hours, the card is turned, and the stop stands in your way. */
export function arrive(t: Trip, stopId: string): Arrival | null {
  const stop = ahead(t).find((s) => s.id === stopId);
  if (!stop) return null;
  const hours = hoursTo(t, stopId);
  const sheet = copySheet(t.sheet);
  sheet.hour += hours;
  const moment = { ...startMoment(withKept(t, stop), helped(t, sheet), `${t.seed}:${stop.id}`), trouble: t.warned, ...((stop.holds ?? 1) > 1 ? { stubborn: true } : {}) };
  const trip = overClock({ ...t, sheet, visited: [...t.visited, stop.id], facing: { stop, moment, holds: Math.max(1, stop.holds ?? 1) }, warned: 0 });
  return { trip, stop, hours };
}

export interface Rested {
  trip: Trip;
  healed: number;
  ate: boolean;
}

/** Rest before going on. It heals you, but it takes hours, and word of you goes ahead. Not with something in your way. */
export function rest(t: Trip): Rested | null {
  if (t.over || t.facing) return null;
  const sheet = copySheet(t.sheet);
  const ate = sheet.supplies > 0;
  if (ate) sheet.supplies -= 1;
  const healed = Math.min(ate ? REST_HEALS : 1, HEALTH_MAX - sheet.health);
  sheet.health += healed;
  sheet.hour += REST_HOURS;
  return { trip: overClock({ ...t, sheet, warned: 1 }), healed, ate };
}

/** What a companion thought of how you got past. */
export interface Opinion {
  companion: Companion;
  liked: boolean;
  /** Goodwill it came to (+1, -1, or 0 when there was none to gain or lose). */
  goodwill: number;
}

/** One throw at the stop in your way, and everything it led to. */
export interface Turn {
  outcome: Outcome;
  trip: Trip;
  /** A good try that did not finish it: it takes more. */
  more: boolean;
  /** You are past the stop. */
  cleared: boolean;
  reward: Reward | null;
  opinions: Opinion[];
  /** A thing you kept was used up on this try. */
  used: Loot | null;
  /** You had no health left and went down: you came to this many hours later. */
  fell: number;
  /** Turned back, you went the long way round: what it took. */
  longWay: { hours: number; supplies: number } | null;
  /** The rival gained ground. */
  rivalGained: boolean;
  /** You got past enough stops to level up: the table offers two knacks (hero.ts perkOffer). */
  levelUp: boolean;
}

/** Throw the die at the stop in your way, for a reading of the line the player wrote. Null when that way cannot be tried. */
export function attempt(t: Trip, read: Read): Turn | null {
  const f = t.facing;
  if (t.over || !f) return null;
  const o = resolve(f.moment, withKnack(f.moment, read));
  if (!o) return null;
  const adv = t.adv;
  const sheet: Sheet = { ...o.next.sheet, stats: { ...t.sheet.stats } };
  let trip: Trip = { ...t, sheet };
  let fell = 0;
  if (sheet.health <= 0) {
    fell = FALL_HOURS;
    sheet.health = 1;
    sheet.hour += FALL_HOURS;
  }
  // A thing you kept is used up when the try it helped works; one that failed you, you still have.
  const used = o.past && o.check.lever && t.kept.includes(o.check.lever.id) ? lootOf(adv, o.check.lever.id)! : null;
  if (used) trip.kept = trip.kept.filter((id) => id !== used.id);
  const rivalGained = !!adv.rival && !o.past;
  if (rivalGained) trip.rival = t.rival + 1;

  let more = false, cleared = false, reward: Reward | null = null, longWay: Turn["longWay"] = null;
  const opinions: Opinion[] = [];
  if (o.past && f.holds > 1) {
    more = true;
    trip.facing = { ...f, holds: f.holds - 1, moment: { ...o.next, over: null, sheet: helped(trip, sheet) } };
  } else if (o.past) {
    cleared = true;
    trip.facing = null;
    trip.at = f.stop.id;
    trip.passed = t.passed + 1;
    for (const id of t.party) {
      const c = companionOf(adv, id)!;
      const liked = o.check.way === c.likes ? true : o.check.way === c.dislikes ? false : null;
      if (liked === null) continue;
      const before = sheet.goodwill;
      sheet.goodwill = Math.max(0, Math.min(GOODWILL_MAX, sheet.goodwill + (liked ? 1 : -1)));
      opinions.push({ companion: c, liked, goodwill: sheet.goodwill - before });
    }
    reward = f.stop.reward ?? null;
    if (reward?.loot && !trip.kept.includes(reward.loot)) trip.kept = [...trip.kept, reward.loot];
    if (reward?.joins && !trip.party.includes(reward.joins)) trip.party = [...trip.party, reward.joins];
    if (f.stop.climax) trip.over = "won";
  } else if (o.turnedBack) {
    trip.facing = null;
    if (f.stop.climax) trip.over = "turned_back";
    else {
      const supplies = Math.min(1, sheet.supplies);
      sheet.supplies -= supplies;
      sheet.hour += LONG_WAY_HOURS;
      longWay = { hours: LONG_WAY_HOURS, supplies };
      trip.at = f.stop.id;
    }
  } else {
    trip.facing = { ...f, moment: { ...o.next, sheet: helped(trip, sheet) } };
  }
  if (!trip.over && adv.rival && trip.rival >= adv.rival.max) trip.over = "rival";
  // A try begun before the deadline still counts if it wins.
  if (trip.over !== "won") trip = overClock(trip);
  const levelUp = cleared && !trip.over && trip.passed % LEVEL_EVERY === 0;
  return { outcome: o, trip, more, cleared, reward, opinions, used, fell, longWay, rivalGained, levelUp };
}

/** Which of two stops at a fork a companion would rather take: the one where the way they like is easiest. */
export function prefers(c: Companion, stops: RoadStop[]): RoadStop | null {
  const score = (s: RoadStop): number => (s.ways[c.likes] ? 4 - s.ways[c.likes]!.difficulty : -1);
  const [a, b] = stops;
  if (!a || !b || score(a) === score(b)) return null;
  return score(a) > score(b) ? a : b;
}
