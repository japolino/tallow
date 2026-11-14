/**
 * Upkeep: the calendar and the needs that run down (the rules; game/systems/upkeep.ts asks the models).
 *
 * The run counts minutes (engine/run.ts). From the hour the story opens at, code keeps the clock: the day, and the
 * time of day. A run may also have up to three needs (hunger, rest, blood: what suits the world) that run down as
 * minutes pass, at rates fixed here, are filled by what the story shows, and hurt a little when they are critical.
 * A few dated things the story sets up ("the festival in three days") are kept on the calendar and come due.
 *
 * Pure and seeded: nothing here asks a model or reads a clock. A model chooses among what is allowed here (a need's
 * pace, how fully a meal met it); it never sets a number the game keeps.
 */
import { clean, hurt, same, type Modifier, type Run, type Sheet } from "./run.js";

/* ------------------------------------------------- the clock ------------------------------------------------- */

export const DAY = 1440;
/** The hour a story opens at when its opening gives no sign: nine in the morning. */
export const DEFAULT_START = 9 * 60;

export const PHASES = ["dawn", "morning", "noon", "afternoon", "dusk", "night"] as const;
export type Phase = (typeof PHASES)[number];

/** Where each stretch of the day begins, in minutes from midnight; night runs from the last until the first. */
const PHASE_FROM: readonly [Phase, number][] = [["dawn", 5 * 60], ["morning", 7 * 60], ["noon", 11 * 60], ["afternoon", 14 * 60], ["dusk", 17 * 60 + 30], ["night", 20 * 60]];

export function phaseOf(minuteOfDay: number): Phase {
  const m = ((Math.floor(minuteOfDay) % DAY) + DAY) % DAY;
  let at: Phase = "night";
  for (const [p, from] of PHASE_FROM) if (m >= from) at = p;
  return at;
}

/**
 * How many minutes on from an absolute minute the story must be for it to be this time of day: nothing when it already
 * is, otherwise as far as a little way into the next such stretch. The clock never runs back: an evening the story has
 * reached while the count of minutes still says morning is this evening. When that stretch of the day is only a few
 * hours behind the clock, the count of minutes ran a little ahead of the story, and nothing is added.
 */
export const CATCH_UP_MOST = 16 * 60;
export function minutesUntil(abs: number, phase: Phase): number {
  const a = Math.max(0, Math.floor(abs));
  if (phaseOf(a % DAY) === phase) return 0;
  const from = PHASE_FROM.find(([p]) => p === phase)![1] + 30;
  const on = (((from - (a % DAY)) % DAY) + DAY) % DAY;
  return on > CATCH_UP_MOST ? 0 : on;
}

export interface Clock {
  /** Day 1 is the day the story opens on. */
  day: number;
  /** Minutes since midnight. */
  minute: number;
  phase: Phase;
}

/** The clock at an absolute minute (minutes since midnight of day 1). Never before day 1. */
export function clockOf(abs: number): Clock {
  const a = Math.max(0, Math.floor(Number.isFinite(abs) ? abs : 0));
  const minute = a % DAY;
  return { day: Math.floor(a / DAY) + 1, minute, phase: phaseOf(minute) };
}

/** Whole minutes of a day from "HH:MM" (24-hour), or null when it is not a time. */
export function parseTime(v: unknown): number | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(typeof v === "string" ? v : "");
  if (!m) return null;
  const h = Number(m[1]), min = m[2] === undefined ? 0 : Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

const HOUR_WORDS = ["twelve", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];

/** A time of day as it is said aloud: "about half past five in the evening". */
export function clockWords(minute: number): string {
  // To the nearest quarter of an hour.
  const q = Math.round((((Math.floor(minute) % DAY) + DAY) % DAY) / 15) * 15 % DAY;
  if (q === 0) return "about midnight";
  if (q === 12 * 60) return "about noon";
  const h = Math.floor(q / 60), m = q % 60;
  const of = (hh: number): string => HOUR_WORDS[hh % 12]!;
  const part = (hh: number): string => (hh < 5 ? "at night" : hh < 12 ? "in the morning" : hh < 17 ? "in the afternoon" : hh < 20 ? "in the evening" : "at night");
  if (m === 0) return `about ${of(h)} ${part(h)}`;
  if (m === 15) return `about a quarter past ${of(h)} ${part(h)}`;
  if (m === 30) return `about half past ${of(h)} ${part(h)}`;
  return `about a quarter to ${of(h + 1)} ${part(h)}`;
}

/** What the time of day means for the world, as a plain fact for every model. */
export const LIGHT_SAYS: Record<Phase, string> = {
  dawn: "The light is only just coming, and most places have not opened yet.",
  morning: "It is daylight, and ordinary places are open.",
  noon: "It is full daylight, and ordinary places are open.",
  afternoon: "It is daylight, and ordinary places are open.",
  dusk: "The light is going, and ordinary shops are closing for the day.",
  night: "It is dark, ordinary shops, offices and gates are shut, and few people are about.",
};

/** A stretch of minutes as it is said aloud: "in about three hours", "tomorrow". */
export function spanWords(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 50) return `in about ${Math.max(5, Math.round(m / 5) * 5)} minutes`;
  if (m < 36 * 60) {
    const h = Math.max(1, Math.round(m / 60));
    return `in about ${h === 1 ? "an hour" : `${h} hours`}`;
  }
  const d = Math.round(m / DAY);
  return `in about ${d} days`;
}

/* ------------------------------------------------- needs ------------------------------------------------- */

export const NEEDS_MOST = 3;
export const NEED_MAX = 100;
export const PACES = ["quick", "steady", "slow"] as const;
export type Pace = (typeof PACES)[number];
/** Points lost an hour: a quick need is empty in about a day, a steady one in two, a slow one in four. */
export const RATE: Record<Pace, number> = { quick: 4, steady: 2, slow: 1 };
export const STARTS = { well: 85, fair: 60, poor: 35 } as const;
export type Start = keyof typeof STARTS;

/** At or under this a need is low and is said so; under CRITICAL it is critical and hurts. */
export const LOW = 30;
export const CRITICAL = 10;
/** The most of a passage that runs a need down: a skip of weeks drains no more than this many hours' worth. */
export const DRAIN_HOURS = 12;
/** A passage this long is a skip: the character is taken to have eaten and slept unless the story says otherwise. */
export const SKIP_MINUTES = 8 * 60;
/** What a skip leaves a looked-after need at, at least; and the lowest a skip alone can run a need down to. */
export const SKIP_KEPT = 65;
export const SKIP_FLOOR = CRITICAL;

/** How fully a passage met a need (or ran it down), as steps a model may name, and the points each is worth. */
export const STEP_POINTS: Record<number, number> = { [-2]: -30, [-1]: -12, 0: 0, 1: 15, 2: 35, 3: 70 };

/** A critical need costs health each turn: one point, two when it is quite empty, and never more than this in all. */
export const COST_TURN = 4;
/** Needs alone never take the character below this much health: they weaken, and only the story brings anyone down. */
export const HEALTH_FLOOR = 10;
/** The most a run of critical needs takes from a roll (hundredths): each takes five. */
export const PENALTY_EACH = 5;
export const PENALTY_MOST = 10;

export interface Need {
  /** What the need is called, as a bar: "Food". */
  name: string;
  /** One word for being short of it: "Hungry". */
  low: string;
  /** What fills it, in a few words. */
  feeds: string;
  pace: Pace;
  /** 0 empty to 100 full. */
  value: number;
}

export type Band = "fine" | "low" | "critical";
export const bandOf = (n: Need): Band => (n.value < CRITICAL ? "critical" : n.value <= LOW ? "low" : "fine");

const round1 = (n: number): number => Math.round(n * 10) / 10;
const clampNeed = (n: number): number => round1(Math.max(0, Math.min(NEED_MAX, n)));

/** A need as a model described it, checked: null when it cannot be kept. */
export function makeNeed(d: { name: unknown; low: unknown; feeds: unknown; pace: unknown; starts: unknown }): Need | null {
  const name = clean(d.name, 24), low = clean(d.low, 20), feeds = clean(d.feeds, 60);
  const pace = String(d.pace).toLowerCase().trim() as Pace;
  const starts = String(d.starts).toLowerCase().trim() as Start;
  if (!name || !low || !feeds || /[<>{}]/.test(name + low + feeds) || low.split(" ").length > 2 || name.split(" ").length > 3) return null;
  if (!PACES.includes(pace) || !(starts in STARTS)) return null;
  return { name: name[0]!.toUpperCase() + name.slice(1), low: low[0]!.toUpperCase() + low.slice(1), feeds, pace, value: STARTS[starts] };
}

/** Run a need down by the minutes that passed (at most DRAIN_HOURS' worth). Returns the points lost. */
export function drain(n: Need, minutes: number, skip = false): number {
  const hours = Math.min(Math.max(0, minutes), DRAIN_HOURS * 60) / 60;
  if (hours <= 0) return 0;
  const before = n.value;
  // A skip alone never runs a need below the edge of critical (unless it was lower already).
  const floor = skip ? Math.min(before, SKIP_FLOOR) : 0;
  n.value = clampNeed(Math.max(floor, before - RATE[n.pace] * hours));
  return round1(before - n.value);
}

/** The story met a need (or ran it down) by a step. Returns the points moved. */
export function feed(n: Need, step: number): number {
  const s = Math.max(-2, Math.min(3, Math.round(Number(step) || 0)));
  const before = n.value;
  n.value = clampNeed(before + (STEP_POINTS[s] ?? 0));
  return round1(n.value - before);
}

/** A skip is taken to have looked after a need that the story did not say was neglected. */
export function keepAfterSkip(n: Need): void {
  if (n.value < SKIP_KEPT) n.value = SKIP_KEPT;
}

/** What each critical need takes from the character's health this turn, in order, never more than COST_TURN in all. */
export function costs(needs: readonly Need[]): { need: Need; cost: number }[] {
  const out: { need: Need; cost: number }[] = [];
  let left = COST_TURN;
  for (const n of needs) {
    if (bandOf(n) !== "critical" || left <= 0) continue;
    const cost = Math.min(left, n.value <= 0 ? 2 : 1);
    out.push({ need: n, cost });
    left -= cost;
  }
  return out;
}

/** Take the health costs from a sheet, never below HEALTH_FLOOR. Returns what each really took. */
export function takeCosts(s: Sheet, needs: readonly Need[]): { need: Need; took: number }[] {
  const out: { need: Need; took: number }[] = [];
  for (const { need, cost } of costs(needs)) {
    const room = s.hp - HEALTH_FLOOR;
    if (room <= 0) break;
    const took = -hurt(s, -Math.min(cost, room));
    if (took > 0) out.push({ need, took });
  }
  return out;
}

/** What critical needs take from a roll (they are small, and never more than PENALTY_MOST in all). */
export function penalties(needs: readonly Need[]): Modifier[] {
  const crit = needs.filter((n) => bandOf(n) === "critical");
  const out: Modifier[] = [];
  let total = 0;
  for (const n of crit) {
    const by = Math.min(PENALTY_EACH, PENALTY_MOST - total);
    if (by <= 0) break;
    out.push({ what: n.low.toLowerCase(), by: -by, why: `${n.name} is nearly gone` });
    total += by;
  }
  return out;
}

/* ------------------------------------------------- dated things ------------------------------------------------- */

export const DATES_MOST = 6;
/** A thing set further off than this is not kept. */
export const DATE_REACH = 120 * DAY;
/** A thing begins to be spoken of this long before it starts, and is held missed for a day once an hour has gone by. */
export const SOON = 16 * 60;
export const GRACE = 60;
export const MISSED_FOR = DAY;

export interface Dated {
  name: string;
  /** Absolute minute it begins at. */
  due: number;
  /** Minutes it lasts. */
  lasts: number;
  place: string;
  /** Attended, finished or called off. */
  done: boolean;
}

export type Standing = "far" | "soon" | "now" | "missed" | "over";

/** Where a dated thing stands at an absolute minute. */
export function standing(d: Dated, now: number): Standing {
  if (d.done) return "over";
  if (now < d.due) return d.due - now <= SOON ? "soon" : "far";
  if (now < d.due + d.lasts) return "now";
  if (now < d.due + d.lasts + GRACE) return "over";
  return now < d.due + d.lasts + MISSED_FOR ? "missed" : "over";
}

const STOP = new Set(["the", "a", "an", "of", "at", "in", "to", "for", "and", "with", "on", "by"]);
const words = (s: string): string[] => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter((w) => w && !STOP.has(w));

/** Whether two names are plainly the same dated thing: the same words, or nearly, or one inside the other on the same day. */
export function alike(a: Dated, b: { name: string; due: number }): boolean {
  if (same(a.name, b.name)) return true;
  const x = new Set(words(a.name)), y = new Set(words(b.name));
  if (!x.size || !y.size) return false;
  const both = [...x].filter((w) => y.has(w)).length;
  if (both / (x.size + y.size - both) >= 0.6) return true;
  return both === Math.min(x.size, y.size) && Math.abs(a.due - b.due) <= DAY;
}

/**
 * Set a dated thing down: added, or moved when the story means one already kept. Nothing in the past, nothing too far
 * off, no more than DATES_MOST kept. Returns what was done, or null.
 */
export function setDate(list: Dated[], now: number, d: { name: string; due: number; lasts: number; place?: string }): "added" | "moved" | null {
  const name = clean(d.name, 60);
  if (!name || /[<>{}]/.test(name) || !Number.isFinite(d.due) || d.due < now || d.due > now + DATE_REACH) return null;
  const have = list.find((x) => !x.done && alike(x, { name, due: d.due }));
  if (have) {
    if (have.due === d.due) return null;
    have.due = d.due;
    return "moved";
  }
  if (list.filter((x) => !x.done && standing(x, now) !== "over").length >= DATES_MOST) return null;
  list.push({ name: name[0]!.toUpperCase() + name.slice(1), due: d.due, lasts: Math.max(30, Math.min(DAY, Math.round(d.lasts) || 120)), place: clean(d.place, 60), done: false });
  list.sort((p, q) => p.due - q.due);
  return "added";
}

/** The absolute minute of "in `days` days at `time`" counted from the day `today` is on. */
export function dueOf(today: number, days: number, time: number): number {
  const d = Math.max(0, Math.min(365, Math.floor(Number(days) || 0)));
  return (clockOf(today).day - 1 + d) * DAY + time;
}

/** Done with, and long gone: dropped, so the list stays short. */
export function tidy(list: Dated[], now: number): Dated[] {
  return list.filter((d) => now < d.due + d.lasts + MISSED_FOR);
}

/* ------------------------------------------------- state ------------------------------------------------- */

export interface Upkeep {
  v: 1;
  /** Minutes since midnight at the moment the run began (run.minutes = 0). */
  start: number;
  needs: Need[];
  dated: Dated[];
  /** The run's minutes already run through the needs. */
  seen: number;
}

export function freshUpkeep(minutes = 0): Upkeep {
  return { v: 1, start: DEFAULT_START, needs: [], dated: [], seen: minutes };
}

/** The absolute minute of the run now. */
export const nowOf = (u: Upkeep, r: Run): number => u.start + Math.max(0, r.minutes);

/**
 * The hour a run stands at, counted on from midnight of its first day (so it only ever goes forward: 33 is nine in the
 * morning of the second day), for whatever shows the time of day. A run that keeps no calendar began in the morning.
 */
export function hourOf(r: Run): number {
  const u = r.sys?.upkeep as Partial<Upkeep> | undefined;
  const start = typeof u?.start === "number" && Number.isFinite(u.start) ? u.start : DEFAULT_START;
  return (start + Math.max(0, r.minutes)) / 60;
}

/**
 * Read a saved state, with a default for everything: a run saved by an older build, or half written, still loads.
 * Returns the same object, repaired.
 */
export function mend(u: Upkeep, r: Run): Upkeep {
  u.v = 1;
  if (!Number.isFinite(u.start) || u.start < 0 || u.start >= DAY) u.start = DEFAULT_START;
  if (!Array.isArray(u.needs)) u.needs = [];
  if (!Array.isArray(u.dated)) u.dated = [];
  if (!Number.isFinite(u.seen) || u.seen < 0 || u.seen > r.minutes) u.seen = Math.max(0, r.minutes);
  u.needs = u.needs.filter((n) => n && typeof n.name === "string" && Number.isFinite(n.value)).slice(0, NEEDS_MOST);
  return u;
}

/** A passage of `delta` minutes runs every need down (a skip is held to a gentler floor). */
export function pass(u: Upkeep, delta: number): void {
  const skip = delta >= SKIP_MINUTES;
  for (const n of u.needs) drain(n, delta, skip);
}

/** When a dated thing begins, as it is said aloud, from where the clock stands: "tomorrow, about ten in the morning". */
export function whenWords(due: number, now: number): string {
  const a = clockOf(due), b = clockOf(now);
  const gap = a.day - b.day;
  const day = gap <= 0 ? "today" : gap === 1 ? "tomorrow" : `in ${gap} days`;
  return `${day}, ${clockWords(a.minute)}`;
}
