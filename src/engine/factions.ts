/**
 * Factions: the groups of a world (a guild, a kingdom, a gang, a household, a people) and how each stands with the
 * player's character. Pure and seeded: nothing here asks a model (game/systems/factions.ts does).
 *
 * Each group keeps a number from -100 to 100 that only code moves, and shows a label made from it. A model says which
 * groups a passage moved and which way and how strongly; code turns that into a small step. Who belongs to which group
 * is kept here by the person's name, and a person's name may change (Person.was), so it is always looked up through the
 * run and never compared by hand.
 */
import { clean, nameOk, person, same, type Person, type Run } from "./run.js";

/** The most groups kept. A crowd of small ones is noise, and the reader is not asked for more at the top. */
export const MAX_FACTIONS = 10;
/** A group nobody has met, named or stood on the ground of for this many turns drops off the page; what it feels is kept. */
export const FADES_AFTER = 30;
/** A group the story only mentioned once waits this many turns for a second sign of it, and no more than this many wait. */
export const WAITS_FOR = 40;
export const WAITS_MOST = 6;

export interface Faction {
  name: string;
  text: string;
  /** How it stands with the character, -100 to 100. */
  rep: number;
  /** Places it holds, as the world calls them. */
  holds: string[];
  /** Its people, by the name the run knew them by when they joined. */
  members: string[];
  /** Everything it has gained and lost since the start, so a group pulled both ways can be called unclear. */
  up: number;
  down: number;
  /** The last turn it was in the story: a member there, its ground, its name, or a change. */
  seen: number;
}

/** A group the story mentioned and that has not yet proved it matters. */
export interface Maybe {
  name: string;
  text: string;
  stands: number;
  holds: string[];
  turn: number;
}

export interface Factions {
  list: Faction[];
  /** Names of people who have had their starting lean from their group, once. */
  leaned: string[];
  maybe: Maybe[];
}

export const emptyFactions = (): Factions => ({ list: [], leaned: [], maybe: [] });

/** What a run has, read with every field given a default (a run saved before a field existed has none of it). */
export function readState(raw: Partial<Factions> | undefined | null): Factions {
  const s = (raw ?? {}) as Partial<Factions>;
  s.list = Array.isArray(s.list) ? s.list : [];
  s.leaned = Array.isArray(s.leaned) ? s.leaned : [];
  s.maybe = Array.isArray(s.maybe) ? s.maybe : [];
  for (const f of s.list) {
    f.holds = Array.isArray(f.holds) ? f.holds : [];
    f.members = Array.isArray(f.members) ? f.members : [];
    f.up = Number.isFinite(f.up) ? f.up : 0;
    f.down = Number.isFinite(f.down) ? f.down : 0;
    f.seen = Number.isFinite(f.seen) ? f.seen : 0;
    f.rep = Number.isFinite(f.rep) ? f.rep : 0;
  }
  return s as Factions;
}

/* ------------------------------------------------- the ladder ------------------------------------------------- */

/** The ladder, from the foot up: how a group stands with the character, as a step from -2 to 2. */
export function stand(rep: number): -2 | -1 | 0 | 1 | 2 {
  return rep <= -60 ? -2 : rep <= -20 ? -1 : rep < 20 ? 0 : rep < 60 ? 1 : 2;
}
export const LABELS = ["very unfavourable", "somewhat unfavourable", "neutral", "somewhat favourable", "very favourable"] as const;

/** A group pulled hard both ways and sitting near the middle is unclear rather than neutral. */
const MIXED_BY = 25;
export const mixed = (f: Faction): boolean => stand(f.rep) === 0 && f.up >= MIXED_BY && f.down >= MIXED_BY;

export const labelOf = (f: Faction): string => (mixed(f) ? "ambiguous" : LABELS[stand(f.rep) + 2]!);

/** Where a group starts, given the step the card or the passage gives it, -2 to 2: the middle of that rung of the ladder. */
export const START_REP = [-65, -35, 0, 35, 65] as const;
export const startRep = (stands: number): number => START_REP[Math.max(-2, Math.min(2, Math.round(Number(stands) || 0))) + 2]!;

/** What a reader's step of -3 to 3 moves a group by: small, clear, deep. */
export const STEP_BY = [0, 5, 10, 15] as const;
/** The most a group may move in one turn, whatever is reported. */
export const MOST_A_TURN = 15;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const tenth = (n: number): number => Math.round(n * 10) / 10;

/** Move a group by a number of points; never past the ends. Returns the change made. */
export function nudge(f: Faction, by: number): number {
  const before = f.rep;
  f.rep = tenth(clamp(f.rep + (Number(by) || 0), -100, 100));
  const made = tenth(f.rep - before);
  if (made > 0) f.up = tenth(f.up + made);
  if (made < 0) f.down = tenth(f.down - made);
  return made;
}

/** A reader's step, -3 to 3, as points. */
export const stepPoints = (step: number): number => {
  const n = Math.max(-3, Math.min(3, Math.round(Number(step) || 0)));
  return Math.sign(n) * STEP_BY[Math.abs(n)]!;
};

/**
 * What a member's change of heart toward the character moves their group: a tenth of it, and half as much when it is
 * against. It is a small, steady lean, kept small because the group may not have heard of the thing at all.
 */
export const feed = (delta: number): number => (delta < 0 ? delta * 0.05 : delta * 0.1);

/** How far a member first met leans toward the character from their group's standing (the middle of a rung is not used: the rung is). */
export const LEAN = [-30, -15, 0, 10, 25] as const;
export const leanOf = (f: Faction): number => LEAN[stand(f.rep) + 2]!;

/* ------------------------------------------------- names ------------------------------------------------- */

const key = (s: string): string => s.toLowerCase().replace(/^(the|a|an)\s+/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const stem = (w: string): string => w.replace(/s$/, "");
const words = (s: string): string[] => key(s).split(" ").filter(Boolean).map(stem);

/**
 * Whether two names are the same group written two ways: alike once case, "the" and plurals are set aside, or one
 * is the other with more words (two at least) added ("Ash Guild" and "The Ash Guild of Marrow").
 */
export function sameGroup(a: string, b: string): boolean {
  if (same(a, b)) return true;
  const x = new Set(words(a)), y = new Set(words(b));
  if (!x.size || !y.size) return false;
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  if ([...small].some((w) => !big.has(w))) return false;
  return small.size === big.size || small.size >= 2;
}

export const find = (s: Factions, name: string): Faction | undefined => {
  const n = clean(name, 80);
  return n ? s.list.find((f) => same(f.name, n)) ?? s.list.find((f) => sameGroup(f.name, n)) : undefined;
};

/** Whether a text speaks of a group by name (the whole name, set aside case and punctuation). */
export function mentions(text: string, name: string): boolean {
  const k = key(name);
  return k.length >= 3 && ` ${key(text)} `.includes(` ${k} `);
}

/* ------------------------------------------------- making groups ------------------------------------------------- */

const listOf = (v: unknown, most: number, each: number): string[] => (Array.isArray(v) ? v : []).map((x) => clean(x, each)).filter((x) => x && !/[<>{}]/.test(x)).slice(0, most);

/** A group brought in. Null when the name cannot stand, a group like it is already kept, or the most is reached. */
export function add(s: Factions, r: Run, d: { name: string; text?: string; stands?: number; holds?: unknown }): Faction | null {
  const name = clean(d.name, 60);
  if (s.list.length >= MAX_FACTIONS || !nameOk(r, name) || find(s, name)) return null;
  const f: Faction = { name, text: clean(d.text, 220), rep: startRep(d.stands ?? 0), holds: listOf(d.holds, 3, 60), members: [], up: 0, down: 0, seen: r.turn };
  s.list.push(f);
  s.maybe = s.maybe.filter((m) => !sameGroup(m.name, name));
  return f;
}

/**
 * A group the passage brought in. One that plainly matters is kept at once; a bare mention waits, and is kept when it
 * comes up again on a later turn. Returns what became of it.
 */
export function consider(s: Factions, r: Run, d: { name: string; text?: string; stands?: number; holds?: unknown }, matters: boolean): "kept" | "waits" | "no" {
  s.maybe = s.maybe.filter((m) => r.turn - m.turn <= WAITS_FOR);
  const name = clean(d.name, 60);
  if (s.list.length >= MAX_FACTIONS || !nameOk(r, name) || find(s, name)) return "no";
  const before = s.maybe.find((m) => sameGroup(m.name, name));
  if (matters || (before && before.turn < r.turn)) return add(s, r, d) ? "kept" : "no";
  if (before) return "waits";
  s.maybe.push({ name, text: clean(d.text, 220), stands: Math.max(-2, Math.min(2, Math.round(Number(d.stands) || 0))), holds: listOf(d.holds, 3, 60), turn: r.turn });
  if (s.maybe.length > WAITS_MOST) s.maybe.shift();
  return "waits";
}

/* ------------------------------------------------- who belongs ------------------------------------------------- */

/** The person a member's name stands for now, whatever they have been called since. */
export const memberPerson = (r: Run, name: string): Person | undefined => person(r, name);

/** The group a person belongs to, if any. */
export function groupOf(s: Factions, r: Run, p: Person): Faction | undefined {
  return s.list.find((f) => f.members.some((n) => memberPerson(r, n) === p));
}

/** Everyone of a group the run knows, living or not. */
export const peopleOf = (s: Factions, r: Run, f: Faction): Person[] => [...new Set(f.members.map((n) => memberPerson(r, n)).filter((p): p is Person => !!p))];

/** The group's people who are here and alive. */
export const hereOf = (s: Factions, r: Run, f: Faction): Person[] => peopleOf(s, r, f).filter((p) => p.here && !p.dead);

/** Whether a person has had their start from their group already. */
const hasLeaned = (s: Factions, p: Person): boolean => s.leaned.some((n) => same(n, p.name) || p.was.some((w) => same(w, n)));

/**
 * A person joins a group (one group a person: the first they were put in stays). When this is the first meeting
 * (`first`), they lean toward the character the way their group stands, once and never again. Returns what became of it.
 */
export function join(s: Factions, r: Run, f: Faction, p: Person, first: boolean): "joined" | "leaned" | "no" {
  if (p.dead || groupOf(s, r, p)) return "no";
  f.members.push(p.name);
  if (hasLeaned(s, p)) return "joined";
  s.leaned.push(p.name);
  if (!first) return "joined";
  const by = leanOf(f);
  if (!by) return "joined";
  p.feeling = clamp(p.feeling + by, -100, 100);
  return "leaned";
}

/** A member renamed keeps the group; the list is written afresh with the names as the run has them now. */
export function keepNames(s: Factions, r: Run): void {
  for (const f of s.list) f.members = [...new Set(f.members.map((n) => memberPerson(r, n)?.name ?? n))];
  s.leaned = [...new Set(s.leaned.map((n) => memberPerson(r, n)?.name ?? n))];
}

/* ------------------------------------------------- ground and presence ------------------------------------------------- */

/** Whether a place is on a group's ground: a place it holds, by name, or one named inside the other. */
export function onGround(f: Faction, place: string): boolean {
  const k = key(place);
  return k.length >= 3 && f.holds.some((h) => {
    const x = key(h);
    return x.length >= 3 && (x === k || ` ${k} `.includes(` ${x} `) || ` ${x} `.includes(` ${k} `));
  });
}

/** The groups the story is with now: one of their people here, or the character on their ground. */
export const activeNow = (s: Factions, r: Run): Faction[] => s.list.filter((f) => hereOf(s, r, f).length > 0 || onGround(f, r.place.name));

/** Whether a group is still worth a line on the page: seen lately, or has a living member. */
export const listed = (s: Factions, r: Run, f: Faction): boolean => r.turn - f.seen <= FADES_AFTER || peopleOf(s, r, f).some((p) => !p.dead && p.here);

/* ------------------------------------------------- what standing does ------------------------------------------------- */

/** What dealing with a group's member changes in a roll, in hundredths: its goodwill helps a little, its hostility hurts a little. */
export const MOST_FROM_STANDING = 5;
export function rollBy(f: Faction, member: Person): { by: number; what: string } | null {
  const st = stand(f.rep);
  if (!st || mixed(f)) return null;
  // A member who is fighting you is not helped by their group's good will, and is still backed by its ill will.
  if (st > 0 && member.hostile) return null;
  const by = (st > 0 ? 1 : -1) * (Math.abs(st) === 2 ? MOST_FROM_STANDING : 2);
  return { by, what: st > 0 ? `${f.name} thinks well of you` : `${f.name} thinks ill of you` };
}

/** A group's line for the models: what it is, how it stands with the character, and who of it is here. */
export function lineOf(s: Factions, r: Run, f: Faction): string {
  const here = hereOf(s, r, f).map((p) => p.name);
  const sentence = `${f.name}${f.text ? ` (${f.text.replace(/\.$/, "")})` : ""} stands ${labelOf(f)} toward ${r.sheet.name}${mixed(f) ? ": it has been pulled both ways, and its people are of two minds" : ""}.`;
  const people = here.length ? ` Of it, here: ${here.join(", ")}. They lean the way the group does and show it in small ways, but are still their own people, and what they have not seen or heard of they do not hold against anyone.` : "";
  return `${sentence}${people}`;
}

/** A group's line for the player's page. */
export function pageLine(s: Factions, r: Run, f: Faction): string {
  const folk = peopleOf(s, r, f).filter((p) => !p.dead).map((p) => p.name);
  return `${f.name}: ${labelOf(f)}.${f.text ? ` ${f.text.replace(/\.$/, "")}.` : ""}${folk.length ? ` People you know of: ${folk.join(", ")}.` : ""}`;
}
