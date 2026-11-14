/**
 * Places: every place the story goes to or names, where each stands among the others, the ways between them, and
 * who was last seen where. Pure and seeded: nothing here asks a model (game/systems/places.ts does).
 *
 * A place is kept with a name, a sentence, what sort of place it is, how big it is (0 a room, 5 a realm) and how
 * dangerous (0 safe, 5 deadly). It stands inside another place, or at the top when nothing larger is known. Ways join
 * a place to the place it is in and to places beside it, each with how many minutes it takes; how long a journey takes
 * is the shortest road along them. Sizes keep the map honest: a place is never put inside one smaller than itself, so
 * a kingdom does not end up inside a tavern, and a room is never a land of its own.
 *
 * Who was where is kept by the person's name as the run had it when last seen, and always looked up through the run
 * (engine/run.ts, person), so a person who has since been renamed is still found.
 */
import { clean, person, same, type Run } from "./run.js";

/** The most places kept. Past it, the oldest the character never went to fall away first. */
export const MAX_PLACES = 40;
/** How deep places may sit inside each other before no more are made inside (a room in a house in a town in a land). */
export const MAX_DEPTH = 4;
/** Fixed things kept on one place. */
export const MAX_THINGS = 4;
/** Other wordings kept for one place. */
export const MAX_WAS = 6;
/** How long a way may be said to take: thirty days. */
export const MAX_WAY = 60 * 24 * 30;

export const SIZES = ["a room or smaller", "a building, a ship, a cave", "a site: a village, a castle, a ruin, a district", "a town or city, a forest, a valley", "a region, a land", "a realm, a continent, a world"] as const;
export const DANGERS = ["safe", "slight", "moderate", "significant", "high", "extreme"] as const;

/** How far a place is, as a model may say it; code turns each into minutes. */
export const WAYS = ["next door", "short walk", "an hour", "half a day", "a day", "days"] as const;
export type WayBand = (typeof WAYS)[number];
const WAY_MINUTES: Record<WayBand, number> = { "next door": 2, "short walk": 15, "an hour": 60, "half a day": 360, "a day": 1440, days: 4320 };
export const wayMinutes = (band: string): number | null => (WAYS.includes(band as WayBand) ? WAY_MINUTES[band as WayBand] : null);

/** Where a place stands among the known: the same as one under another wording, inside one, around one, beside one, far off, or not known yet. */
export const PLACEMENTS = ["same", "inside", "holds", "beside", "far", "unplaced"] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** A fixed thing of a place that other systems may read: a station to make things at, a counter to trade at, something to keep things in. */
export const USES = ["craft", "trade", "keep", "other"] as const;
export interface Thing {
  name: string;
  use: (typeof USES)[number];
}

export interface Spot {
  id: string;
  name: string;
  text: string;
  kind: string;
  /** 0 a room or smaller ... 5 a realm (SIZES). */
  size: number;
  /** 0 safe ... 5 extreme (DANGERS). */
  danger: number;
  /** Someone's home or private rooms. */
  private: boolean;
  /** The place it stands inside, or null at the top. */
  within: string | null;
  visited: boolean;
  /** Its own people and things have been written, once, on the first visit. */
  peopled: boolean;
  /** The turn it became known, and the last turn it was gone to or named. */
  first: number;
  last: number;
  things: Thing[];
  /** An inanimate hazard barring the way into it, or "". */
  blocker: string;
  /** Other wordings the story has used for it. */
  was: string[];
}

export interface Way {
  a: string;
  b: string;
  minutes: number;
}

export interface Places {
  list: Spot[];
  ways: Way[];
  /** Where the character is now. */
  at: string;
  /** Where they were before the last move, and a place arrived at that is still to be placed. */
  from: string;
  pending: string;
  /** A place first set foot in this turn, still to have its own people written. */
  fresh: string;
  next: number;
  /** Where each person was last seen, by the name they had then. */
  seen: Record<string, string>;
  /** Names this system has written for people of places lately, so the same are not written again. */
  made: string[];
}

export const emptyPlaces = (): Places => ({ list: [], ways: [], at: "", from: "", pending: "", fresh: "", next: 1, seen: {}, made: [] });

const num = (v: unknown, lo: number, hi: number, otherwise: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : otherwise;
};

/** What a run has, read with every field given a default (a run saved before a field existed has none of it). */
export function readPlaces(raw: unknown): Places {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<Places>;
  s.list = Array.isArray(s.list) ? s.list : [];
  for (const p of s.list) {
    p.text ??= "";
    p.kind ??= "";
    p.size = num(p.size, 0, 5, 1);
    p.danger = num(p.danger, 0, 5, 1);
    p.private = p.private === true;
    p.within ??= null;
    p.visited = p.visited === true;
    p.peopled = p.peopled === true;
    p.first = num(p.first, 0, 1e9, 0);
    p.last = num(p.last, 0, 1e9, p.first);
    p.things = Array.isArray(p.things) ? p.things : [];
    p.blocker ??= "";
    p.was = Array.isArray(p.was) ? p.was : [];
  }
  s.ways = Array.isArray(s.ways) ? s.ways : [];
  s.at ??= "";
  s.from ??= "";
  s.pending ??= "";
  s.fresh ??= "";
  s.next = num(s.next, 1, 1e9, s.list.length + 1);
  s.seen = s.seen && typeof s.seen === "object" ? s.seen : {};
  s.made = Array.isArray(s.made) ? s.made : [];
  return s as Places;
}

/* ------------------------------------------------- finding ------------------------------------------------- */

export const byId = (st: Places, id: string | null | undefined): Spot | undefined => (id ? st.list.find((p) => p.id === id) : undefined);
/** A place known by this name or one of its other wordings. */
export const find = (st: Places, name: string): Spot | undefined => (clean(name, 80) ? st.list.find((p) => same(p.name, name) || p.was.some((w) => same(w, name))) : undefined);
export const here = (st: Places): Spot | undefined => byId(st, st.at);

const words = (s: string): string[] => s.toLowerCase().replace(/^(the|a|an)\s+/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
/** Whether one name sits whole inside the other ("Kell" and "Port Kell"): too close to take as a new place on its own word. */
export function alike(a: string, b: string): boolean {
  const x = words(a).join(" "), y = words(b).join(" ");
  if (!x || !y) return false;
  return x === y || ` ${y} `.includes(` ${x} `) || ` ${x} `.includes(` ${y} `);
}

/** A place and those it stands inside, out to the top. */
export function chain(st: Places, id: string): Spot[] {
  const out: Spot[] = [];
  for (let p = byId(st, id); p && !out.includes(p) && out.length < 12; p = byId(st, p.within)) out.push(p);
  return out;
}
export const depth = (st: Places, id: string): number => chain(st, id).length;
/** "the Cellar, in the Rusty Anchor, in Port Kell". */
export const pathText = (st: Places, id: string): string => chain(st, id).map((p) => p.name).join(", in ");

/* ------------------------------------------------- the ways ------------------------------------------------- */

/**
 * Minutes from the heart of a place to something inside it, by the size of the place around: half of going between two
 * things inside it, so a way through the place around is never shorter than a way between neighbours.
 */
export const intoMinutes = (container: number): number => [1, 1, 3, 10, 120, 720][num(container, 0, 5, 3)]!;
/** Join a place to the one around it, if any. */
function inward(st: Places, p: Spot, minutes: number | null = null): void {
  const around = byId(st, p.within);
  if (around) connect(st, p.id, around.id, minutes ?? intoMinutes(around.size));
}
/** Minutes between two places beside each other, by the size of what they stand in (or their own, at the top). */
export function besideMinutes(size: number, container: number | null): number {
  if (container !== null) return [1, 1, 5, 20, 240, 1440][num(container, 0, 5, 2)]!;
  return [5, 5, 30, 240, 1440, 4320][num(size, 0, 5, 2)]!;
}

export function connect(st: Places, a: string, b: string, minutes: number): void {
  if (!a || !b || a === b || !byId(st, a) || !byId(st, b)) return;
  const m = num(minutes, 1, MAX_WAY, 15);
  const w = st.ways.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (w) w.minutes = Math.min(w.minutes, m);
  else st.ways.push({ a, b, minutes: m });
}

/** The shortest journey between two places along the known ways, in minutes; null when no way is known. */
export function minutesBetween(st: Places, from: string, to: string): number | null {
  if (from === to) return 0;
  const best = new Map<string, number>([[from, 0]]);
  const open = new Set([from]);
  while (open.size) {
    let at = "", d = Infinity;
    for (const id of open) if (best.get(id)! < d) (at = id), (d = best.get(id)!);
    open.delete(at);
    if (at === to) return d;
    for (const w of st.ways) {
      const next = w.a === at ? w.b : w.b === at ? w.a : "";
      if (!next || d + w.minutes >= (best.get(next) ?? Infinity)) continue;
      best.set(next, d + w.minutes);
      open.add(next);
    }
  }
  return null;
}

/** The places one step away, nearest first. */
export function exits(st: Places, id: string): { spot: Spot; minutes: number }[] {
  return st.ways
    .filter((w) => w.a === id || w.b === id)
    .map((w) => ({ spot: byId(st, w.a === id ? w.b : w.a)!, minutes: w.minutes }))
    .filter((x) => x.spot)
    .sort((x, y) => x.minutes - y.minutes);
}

/** A number of minutes as a journey is spoken of. */
export function durationText(m: number): string {
  if (m <= 2) return "a moment away";
  if (m < 10) return "a few minutes away";
  if (m < 50) return `about ${Math.round(m / 5) * 5} minutes away`;
  if (m < 90) return "about an hour away";
  if (m < 300) return `about ${Math.round(m / 60)} hours away`;
  if (m < 600) return "about half a day away";
  if (m < 2160) return "about a day away";
  return `about ${Math.round(m / 1440)} days away`;
}

/* ------------------------------------------------- danger ------------------------------------------------- */

/**
 * The danger a place holds for this character: the seasoned feel it less, the green more. A safe place stays safe,
 * and anything dangerous at all stays between 1 and 5.
 */
export function feltDanger(danger: number, level: number): number {
  const d = num(danger, 0, 5, 1);
  if (d === 0) return 0;
  const by = level >= 18 ? -2 : level >= 12 ? -1 : level <= 3 ? 1 : 0;
  return Math.max(1, Math.min(5, d + by));
}

/* ------------------------------------------------- making and placing ------------------------------------------------- */

export interface Described {
  name: string;
  text?: string;
  kind?: string;
  size?: number;
  danger?: number;
  private?: boolean;
}

/** The nearest place, from `start` outward, big enough to hold something of this size; null for the top. */
function holderFor(st: Places, start: Spot | undefined, size: number): string | null {
  for (const p of start ? chain(st, start.id) : []) if (p.size > size) return p.id;
  return null;
}

/**
 * A new place, standing where `placement` says relative to `of` (the current place when none is named). Returns the
 * place it is, or null when it cannot be kept: no name, or one already known (then that place is returned by find, and
 * the new wording is kept on it). `minutes` is how far it is when the story says; else the sizes decide.
 */
export function add(st: Places, turn: number, d: Described, placement: Placement, of: Spot | undefined, minutes: number | null = null): Spot | null {
  const name = clean(d.name, 60);
  if (!name || /[<>{}]/.test(name) || words(name).length === 0) return null;
  const known = find(st, name);
  if (known) return (known.last = Math.max(known.last, turn)), known;
  if (placement === "same") {
    if (!of) return null;
    if (of.was.length < MAX_WAS && !same(of.name, name)) of.was.push(name);
    of.last = Math.max(of.last, turn);
    return of;
  }
  const p: Spot = {
    id: `p${st.next++}`, name, text: clean(d.text, 240), kind: clean(d.kind, 40), size: num(d.size, 0, 5, 1), danger: num(d.danger, 0, 5, 1), private: d.private === true,
    within: null, visited: false, peopled: false, first: turn, last: turn, things: [], blocker: "", was: [],
  };
  st.list.push(p);
  put(st, p, placement, of, minutes);
  return p;
}

/** Stand a place where `placement` says relative to `of` (the current place when none is given), with its ways. */
export function put(st: Places, p: Spot, placement: Placement, of: Spot | undefined, minutes: number | null = null): void {
  const size = p.size;
  const base = of && of !== p ? of : here(st) !== p ? here(st) : undefined;
  if (placement === "inside" && base) {
    // Never inside something smaller: then it goes inside the nearest place around that is big enough.
    p.within = holderFor(st, base, size);
    inward(st, p, minutes);
    if (p.within !== base.id) connect(st, p.id, base.id, minutes ?? besideMinutes(size, byId(st, p.within)?.size ?? null));
  } else if (placement === "holds" && base && size > base.size) {
    // A larger place around a known one: it holds that one, or the largest place around it that is still smaller.
    let held = base;
    for (const up of chain(st, base.id).slice(1)) {
      if (up.size >= size) break;
      held = up;
    }
    p.within = holderFor(st, byId(st, held.within), size);
    held.within = p.id;
    inward(st, held);
    inward(st, p);
  } else if ((placement === "beside" || placement === "holds") && base) {
    // Beside it, in what it stands in; but a journey longer than crossing that place leaves it, for the place around.
    let around = byId(st, base.within);
    if (minutes !== null) while (around && minutes > 2 * besideMinutes(size, around.size)) around = byId(st, around.within);
    p.within = holderFor(st, around, size);
    connect(st, p.id, base.id, minutes ?? besideMinutes(Math.min(size, base.size), byId(st, p.within)?.size ?? null));
    inward(st, p);
  } else if (placement === "far" && base) {
    connect(st, p.id, base.id, minutes ?? WAY_MINUTES["a day"]);
  }
}

/** One place found to be another under a different name: everything of `from` goes to `into`. */
export function merge(st: Places, from: Spot, into: Spot): void {
  if (from === into) return;
  for (const n of [from.name, ...from.was]) if (into.was.length < MAX_WAS && !same(n, into.name) && !into.was.some((w) => same(w, n))) into.was.push(n);
  if (into.within === from.id) into.within = from.within === into.id ? null : from.within;
  for (const p of st.list) if (p !== into && p.within === from.id) p.within = into.id;
  const ways = st.ways;
  st.ways = [];
  for (const w of ways) {
    const a = w.a === from.id ? into.id : w.a, b = w.b === from.id ? into.id : w.b;
    connect(st, a, b, w.minutes);
  }
  for (const [k, v] of Object.entries(st.seen)) if (v === from.id) st.seen[k] = into.id;
  for (const k of ["at", "from", "pending", "fresh"] as const) if (st[k] === from.id) st[k] = into.id;
  into.visited ||= from.visited;
  into.peopled ||= from.peopled;
  into.text ||= from.text;
  into.kind ||= from.kind;
  into.blocker ||= from.blocker;
  into.last = Math.max(into.last, from.last);
  into.first = Math.min(into.first, from.first);
  for (const t of from.things) if (into.things.length < MAX_THINGS && !into.things.some((x) => same(x.name, t.name))) into.things.push(t);
  st.list = st.list.filter((p) => p !== from);
  untangle(st);
}

/** No place may end up inside itself, however far round: where a ring is found, the place is put at the top. */
export function untangle(st: Places): void {
  for (const p of st.list) {
    const met = new Set<string>([p.id]);
    for (let up = byId(st, p.within); up; up = byId(st, up.within)) {
      if (met.has(up.id)) {
        p.within = null;
        break;
      }
      met.add(up.id);
    }
  }
}

/* ------------------------------------------------- arriving, and who is where ------------------------------------------------- */

/**
 * The character is now at `p`. It is marked visited, whatever barred the way into it is gone (they are in, after all),
 * and everyone last seen here who is alive and not already with them is here again. Returns the names found again.
 */
export function arrive(st: Places, r: Run, p: Spot): string[] {
  if (st.at !== p.id) st.from = st.at;
  st.at = p.id;
  if (!p.visited) st.fresh = p.id;
  p.visited = true;
  p.last = r.turn;
  p.blocker = "";
  const back: string[] = [];
  for (const [name, at] of Object.entries(st.seen)) {
    if (at !== p.id) continue;
    const who = person(r, name);
    if (!who || who.dead || who.here || who.follows) continue;
    who.here = true;
    back.push(who.name);
  }
  return back;
}

/**
 * Write down where everyone is: those here are at the character's place; those who left the scene (`gone`) or died
 * are no longer anywhere known. Every entry is kept under the person's name as it is now.
 */
export function remember(st: Places, r: Run, gone: readonly string[]): void {
  const seen: Record<string, string> = {};
  for (const [name, at] of Object.entries(st.seen)) {
    const p = person(r, name);
    if (p && !p.dead && byId(st, at)) seen[p.name] = at;
  }
  for (const n of gone) {
    const p = person(r, n);
    if (p && !p.here) delete seen[p.name];
  }
  if (byId(st, st.at)) for (const p of r.people) if (p.here && !p.dead) seen[p.name] = st.at;
  st.seen = seen;
}

/** Those last seen at a place, as the run names them now, who are not with the character. */
export function seenAt(st: Places, r: Run, id: string): string[] {
  return Object.entries(st.seen)
    .filter(([, at]) => at === id)
    .map(([name]) => person(r, name))
    .filter((p) => p && !p.dead && !p.follows)
    .map((p) => p!.name);
}

/* ------------------------------------------------- forgetting ------------------------------------------------- */

/**
 * Keep at most MAX_PLACES: the places the character never went to fall away first, oldest first; never where they
 * are, where they are headed, or any place around them. What stood inside a forgotten place moves out to what was
 * around it. Places once visited are kept.
 */
export function prune(st: Places): string[] {
  const dropped: string[] = [];
  const keep = new Set([...chain(st, st.at).map((p) => p.id), st.pending, st.from]);
  while (st.list.length > MAX_PLACES) {
    const old = st.list.filter((p) => !p.visited && !keep.has(p.id)).sort((a, b) => a.last - b.last || a.first - b.first)[0];
    if (!old) break;
    for (const p of st.list) if (p.within === old.id) p.within = old.within;
    st.ways = st.ways.filter((w) => w.a !== old.id && w.b !== old.id);
    st.list = st.list.filter((p) => p !== old);
    for (const [k, v] of Object.entries(st.seen)) if (v === old.id) delete st.seen[k];
    dropped.push(old.name);
  }
  return dropped;
}
