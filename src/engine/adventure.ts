/**
 * The rules of a whole adventure (docs/DESIGN.md, 1.2 and 1.4): a road of stops between you and a goal, with forks,
 * a clock that runs against you, resting, running out, companions, things kept, and the last stop where it comes to a
 * head. Each stop is played with the rules of one moment (moment.ts); this file only joins them up.
 *
 * Code decides every number here, from seeded dice. Nothing a model says changes any of it. A trip is never changed
 * in place: every step returns the next one.
 */
import type { FreeWorld } from "./free.js";
import { DANGER_SAVE, isContest, playRound, startContest, type Contest, type Moves, type Round } from "./contest.js";
import { throwSave } from "./save.js";
import { DREAD_MAX, dreadFrom } from "./dread.js";
import type { MapSheet } from "../room/mapsheet.js";
import { fromOldKnack, passive, storeAt, type Ability } from "./abilities.js";
import type { Casebook, Clue, StoryKind } from "./clues.js";
import type { ContentSettings } from "./content.js";
import type { WorldKit } from "./kit.js";
import type { Person as Npc, Visit } from "./people.js";
import type { Payoff, Project } from "./project.js";
import type { Appointment, Schedule } from "./schedule.js";
import type { Fellow } from "./seats.js";
import { LEVEL_EVERY } from "./hero.js";
import { abilityFor, canUse, GOODWILL_MAX, leverLeft, resolve, STAT_MAX, startMoment, WAYS, type CostKind, type Grade, type Lever, type Moment, type Outcome, type Read, type Sheet, type Stat, type Stop, type Way, type Against } from "./moment.js";

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

/** The weather outside the room's windows (the room shows each kind, src/room/daylight.ts). */
export type Sky = "clear" | "rain" | "storm" | "fog" | "wind" | "snow";

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
  /** The weather while you are there, when it is not the adventure's own. */
  weather?: Sky;
  /** Someone here with a mind of their own (people.ts): what they want, how they feel, what they know and will say. */
  person?: Npc;
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
  /** How old the builder said they are written as (adult, elder, young-adult or minor); read with their words (content.ts ageFrom). */
  age?: string;
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
  /** The kind of story: "rescue" or "courtship" for the made-up adventures, else the story's id (content/tropes.ts). */
  trope: string;
  /** The family of story it is (content/tropes.ts), for a road laid out from a recipe. */
  family?: string;
  /** Whether the card's own character walks with you ("friend") or is the one you court ("courted"). */
  part?: "friend" | "courted";
  /** The story in a line, as the builder tells a model. */
  brief?: string;
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
  /**
   * A hub map: the start is a place you go out from and come back to. Its places are visited in any order (the going
   * from one to another is back through the hub), and the end opens once `needs` of them are done.
   */
  hub?: { needs: number };
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
  /** The weather on the road, between stops (clear when not said). */
  weather?: Sky;
  /** The world's kit (kit.ts): its era, its power if any, its gear, what you risk. */
  kit?: WorldKit;
  /** What the game allows in this story (content.ts). */
  content?: ContentSettings;
  /** The kind of story, for its three keys (clues.ts). */
  kind?: StoryKind;
  /** What there is to find out (clues.ts): every key with at least three clues. */
  clues?: Clue[];
  /** The other side's clock (schedule.ts): what happens, where and when, whether you are there or not. */
  appointments?: Appointment[];
  /** The other players at the table (seats.ts). */
  fellows?: Fellow[];
  /** The last story of a campaign (campaign.ts, 6.1): the big bad itself waits at the end, and the keys you carried are your edges against it. */
  finale?: { name: string; edges: number };
  /** Free form (free.ts): no story, only the world, the places you know and the threads in the air. */
  free?: FreeWorld;
}

/** Whether the card's own character walks with you or is courted, for a made-up adventure too. */
export const partOf = (adv: Adventure): "friend" | "courted" => adv.part ?? (adv.courted ? "courted" : "friend");

/** How a story ended: won; out of time; the rival got there first; no way left at the last place; taken out in the last contest; or you gave in at it. */
export type Ending = "won" | "deadline" | "rival" | "turned_back" | "taken" | "yielded";

/** Where you are in an adventure. */
export interface Trip {
  /**
   * The line just said, as a model read it for the person here (game/hear.ts), so the world's rows hear it by meaning
   * rather than by its words. Only for that line: any other line is read by its words (people.ts, rulesLine).
   */
  heard?: { line: string; read: import("./people.js").LineRead };
  adv: Adventure;
  seed: string;
  /** What you carry. Its stats are your own, without your companions' help. */
  sheet: Sheet;
  /** The last place you reached: where you set out, or a stop you got past or went round. */
  at: string;
  /** Stops you have reached, in order. */
  visited: string[];
  /** Margin notes already written (margin.ts), so none is written twice. */
  noticed?: string[];
  /** How often your fault has spoken in the margin this story. */
  faults?: number;
  /** The stop in your way, how many good tries it still takes, and, when it is a contest (contest.ts), the dials. */
  facing: { stop: RoadStop; moment: Moment; holds: number; contest?: Contest; battle?: import("./battletrip.js").BattleSeat } | null;
  party: string[];
  kept: string[];
  /** Your abilities (abilities.ts). */
  abilities: Ability[];
  /** Abilities used that are once a story. */
  storyUsed: string[];
  /** Marks you made at earlier stops that you can still lean on (docs/SYSTEMS.md, 4). */
  marks: Lever[];
  /** The narrator's marks against you (dread.ts): each makes your next try by its way throw two dice and keep the worse. */
  against?: Against[];
  /** Your level: it sets how big your store is. */
  level: number;
  /** What your store is called in your calling: heat, nerve, breath. */
  storeName?: string;
  /** What you did, in a few words each, for the abilities written for you at a level-up. */
  deeds: string[];
  /** The old knacks, in a trip kept from before abilities (read into abilities by `tripNow`). */
  perks?: string[];
  /** Black stones in the narrator's bowl: what has gone wrong, waiting to come back (dread.ts). */
  dread?: number;
  /** How many times the narrator has offered you your fault this story. */
  tempted?: number;
  /** How many stops you have got past (not gone round): every LEVEL_EVERY of them, you level up. */
  passed: number;
  /** How far the rival has got. */
  rival: number;
  /** Set by resting: word of you has gone ahead, and the next stop starts a step harder. */
  warned: number;
  over: Ending | null;
  /** Your slips and the map they ink (clues.ts). */
  book?: Casebook;
  /** The other side's clock as it stands (schedule.ts). */
  schedule?: Schedule;
  /** The people you have met, as they feel now, by id (people.ts). */
  people?: Record<string, Npc>;
  /** Your visit with the person at each place, by stop id. */
  visits?: Record<string, Visit>;
  /** Goals of your own (project.ts). */
  projects?: Project[];
  /** The other players as they stand (seats.ts). */
  fellows?: Fellow[];
  /** Lines you have written, for the spotlight. */
  turn?: number;
  /** What the table said before a big move (seats.ts, talkItOver), at a stop: each player's way, and the way a vote chose. */
  proposals?: { stop: string; list: { id: string; way: Way }[]; decided?: Way };
  /** What your finished projects pay off (project.ts): kept from story to story. */
  payoffs?: Payoff[];
  /** A weapon of yours (a project's payoff) already brought to a fight this story. */
  armed?: boolean;
}

export function mapOf(adv: Adventure): MapSheet {
  const climax = new Set(adv.stops.filter((s) => s.climax).map((s) => s.id));
  // A hub is drawn as it is walked: a path out to each of its places, and one to the end.
  const paths: [string, string][] = adv.hub ? adv.roads.filter(([a]) => a === adv.start).map(([a, b]) => [a, b]) : adv.roads.map(([a, b]) => [a, b]);
  return { title: adv.title, seed: adv.seed, stops: adv.places.map((p) => ({ ...p, ...(climax.has(p.id) ? { climax: true } : {}) })), paths };
}

export const stopOf = (adv: Adventure, id: string): RoadStop | undefined => adv.stops.find((s) => s.id === id);
export const placeName = (adv: Adventure, id: string): string => adv.places.find((p) => p.id === id)?.name ?? id;
export const placeOf = (adv: Adventure, id: string): Place | undefined => adv.places.find((p) => p.id === id);
export const companionOf = (adv: Adventure, id: string): Companion | undefined => adv.companions.find((c) => c.id === id);
export const lootOf = (adv: Adventure, id: string): Loot | undefined => adv.loot.find((l) => l.id === id);

export const copySheet = (s: Sheet): Sheet => ({ ...s, stats: { ...s.stats } });

export function startTrip(adv: Adventure, sheet: Sheet, seed: string, abilities: readonly Ability[] = [], level = 1): Trip {
  const party = (adv.party ?? []).filter((id) => companionOf(adv, id));
  return {
    adv,
    seed,
    sheet: { ...copySheet(sheet), hour: adv.startHour, store: storeAt(level) },
    at: adv.start,
    visited: [],
    facing: null,
    party,
    kept: [],
    abilities: abilities.map((a) => ({ ...a })),
    storyUsed: [],
    marks: [],
    level,
    deeds: [],
    dread: 0,
    tempted: 0,
    passed: 0,
    rival: 0,
    warned: 0,
    over: null,
  };
}

/** A trip kept from before abilities were made: its knacks become the abilities they always were. */
export function tripNow(t: Trip): Trip {
  if (Array.isArray(t.abilities)) return t;
  const abilities = (t.perks ?? []).map(fromOldKnack).filter((a): a is Ability => !!a);
  const level = Math.max(1, abilities.length);
  const { perks: _old, ...rest } = t;
  return { ...rest, abilities, storyUsed: [], marks: [], level, deeds: [], sheet: { ...t.sheet, store: t.sheet.store ?? storeAt(level) } };
}

/** Take an ability at a level-up. It counts from the next stop on, and the store grows by one. */
export function takeAbility(t: Trip, a: Ability): Trip {
  if (t.abilities.some((x) => x.id === a.id)) return t;
  const level = t.level + 1;
  return { ...t, abilities: [...t.abilities, { ...a }], level, sheet: { ...t.sheet, store: Math.min(storeAt(level), (t.sheet.store ?? 0) + 1) } };
}

/** The stops you can go on to from where you are: one, or two at a fork. */
export function ahead(t: Trip): RoadStop[] {
  if (t.over || t.facing) return [];
  return t.adv.roads.filter(([a, b]) => a === t.at && !t.visited.includes(b) && opened(t, b)).map(([, b]) => stopOf(t.adv, b)!).filter(Boolean);
}

/** How many of a hub's places are done: the ones gone to, not counting its end. */
export const hubDone = (t: Pick<Trip, "adv" | "visited">): number => t.visited.filter((id) => !stopOf(t.adv, id)?.climax && id !== t.adv.start).length;

/** Whether a place can be gone to yet: a hub's end only once enough of its places are done; anything else, always. */
export function opened(t: Pick<Trip, "adv" | "visited">, id: string): boolean {
  if (!t.adv.hub || !stopOf(t.adv, id)?.climax) return true;
  return hubDone(t) >= t.adv.hub.needs;
}

/** The stops not reached yet: the cards still face down on the map. */
export const unturned = (t: Trip): RoadStop[] => t.adv.stops.filter((s) => !t.visited.includes(s.id));

/** How long the road from where you are to a stop takes. */
export function hoursTo(t: Trip, stopId: string): number {
  return t.adv.roads.find(([a, b]) => a === t.at && b === stopId)?.[2] ?? 0;
}

/** The companions at your side: those in the party who have not gone off on their own (docs/MOONSHOT.md, 4.3). */
export const withParty = (t: Pick<Trip, "party" | "fellows">): string[] => t.party.filter((id) => !(t.fellows ?? []).some((f) => f.id === id && f.at));

/** An ability's name after "your": "A Good Eye" is "your good eye". */
const bare = (name: string): string => name.toLowerCase().replace(/^(a|an|the)\s+/, "");

/** The sheet a moment is played with: your own, with each companion at your side's help added. */
function helped(t: Trip, sheet: Sheet): Sheet {
  const s = copySheet(sheet);
  for (const id of withParty(t)) {
    const c = companionOf(t.adv, id);
    if (c) s.stats[c.stat] = Math.min(STAT_MAX, (s.stats[c.stat] ?? 0) + 1);
  }
  return s;
}

/** The stop as it is played: with the things you keep, and the marks you made earlier, added to what is there to use. */
function withKept(t: Trip, stop: RoadStop): Stop {
  const kept: Lever[] = t.kept.map((id) => lootOf(t.adv, id)!).filter(Boolean).map((l) => ({ id: l.id, way: l.way, name: l.name, words: l.words }));
  return { ...stop, levers: [...stop.levers, ...kept, ...t.marks.map((l) => ({ ...l }))] };
}

/**
 * A try that names no ability leans on one that works by itself (docs/SYSTEMS.md, 3.2: a knack), if one applies to
 * its way and can still be used here: the strongest. A named lever that is gone or for another way is let go.
 */
export function withAbility(m: Moment, read: Read): Read {
  const lever = read.lever && m.stop.levers.some((l) => l.id === read.lever && l.way === read.way && leverLeft(m, l)) ? read.lever : null;
  const r = { ...read, lever };
  if (abilityFor(m, r)) return r;
  const auto = (m.abilities ?? []).filter((a) => passive(a) && !a.tags.length && (!a.ways.length || a.ways.includes(read.way)) && abilityFor(m, { ...r, ability: a.id })).sort((a, b) => b.much - a.much)[0];
  return { ...r, ability: auto?.id ?? null };
}

export function overClock(t: Trip): Trip {
  return !t.over && t.sheet.hour >= t.adv.deadline.hour ? { ...t, over: "deadline" } : t;
}

/**
 * The trip's sheet is the one that counts: the moment in your way takes everything from it but the stats it throws with
 * (yours, or another player's when the try was handed to them), so health, supplies, goodwill, the store, gear and the
 * hour changed on the trip while you stood there (a payoff's income, a wait) are not lost to the next try.
 */
export function sheetKept(t: Trip): Trip {
  const f = t.facing;
  if (!f) return t;
  const { powerName: _yours, ...rest } = t.sheet;
  const ms = f.moment.sheet;
  const sheet: Sheet = { ...rest, stats: ms.stats, ...(ms.powerName ? { powerName: ms.powerName } : {}) };
  return { ...t, facing: { ...f, moment: { ...f.moment, sheet } } };
}

/**
 * The one way the story's clock is set outside the road and a try: the trip's hour and the hour of the moment in your
 * way move together, and time past the deadline loses the job, however it was spent.
 */
export function clockTo(t: Trip, hour: number): Trip {
  const f = t.facing;
  const trip: Trip = { ...t, sheet: { ...t.sheet, hour }, ...(f ? { facing: { ...f, moment: { ...f.moment, sheet: { ...f.moment.sheet, hour } } } } : {}) };
  return overClock(trip);
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
  const moment: Moment = {
    ...startMoment(withKept(t, stop), helped(t, sheet), `${t.seed}:${stop.id}`),
    trouble: t.warned,
    ...((stop.holds ?? 1) > 1 ? { stubborn: true } : {}),
    abilities: t.abilities.filter((a) => !t.storyUsed.includes(a.id)),
    used: [],
    against: t.against ?? [],
    company: withParty(t).length,
  };
  const facing = { stop, moment, holds: Math.max(1, stop.holds ?? 1), ...(isContest(stop) ? { contest: startContest(stop) } : {}) };
  const trip = overClock({ ...t, sheet, visited: [...t.visited, stop.id], facing, warned: 0 });
  return { trip, stop, hours };
}

/** A contest set out for the stop in your way, if it is one and has none yet (a sitting kept from before contests). */
export function withContest(t: Trip): Trip {
  const f = t.facing;
  if (!f || f.contest || !isContest(f.stop)) return t;
  return { ...t, facing: { ...f, contest: startContest(f.stop) } };
}

/** Taken out of a contest at an ordinary place, you come to this many hours later, beyond it, with nothing to show. */
export const TAKEN_HOURS = 2;
/** Giving in takes this long. */
export const YIELD_HOURS = 0.5;

/**
 * You give in, in the contest in your way: you come out of it whole but with nothing (no reward), which is still
 * better than being taken out. At the last place, giving in loses the story. Null when there is no contest in your way.
 */
export function yieldContest(t: Trip): Trip | null {
  const f = t.facing;
  if (t.over || !f?.contest) return null;
  if (f.stop.climax) return { ...t, facing: null, over: "yielded" };
  const sheet = { ...copySheet(t.sheet), hour: t.sheet.hour + YIELD_HOURS };
  return overClock({ ...t, sheet, facing: null, at: f.stop.id });
}

export interface Rested {
  trip: Trip;
  healed: number;
  ate: boolean;
}

/** Rest before going on. It heals you, but it takes hours, and word of you goes ahead. Not with something in your way. */
/** Whether a rest would do you good: you are hurt, or your store is not full. */
export const weary = (t: Trip): boolean => t.sheet.health < HEALTH_MAX || (t.sheet.store ?? storeAt(t.level)) < storeAt(t.level);

export function rest(t: Trip): Rested | null {
  if (t.over || t.facing) return null;
  const sheet = copySheet(t.sheet);
  const ate = sheet.supplies > 0;
  if (ate) sheet.supplies -= 1;
  const healed = Math.min(ate ? REST_HEALS : 1, HEALTH_MAX - sheet.health);
  sheet.health += healed;
  // Resting fills the store again.
  sheet.store = storeAt(t.level);
  sheet.hour += REST_HOURS;
  return { trip: overClock({ ...t, sheet, warned: 1 }), healed, ate };
}

/** A question to the narrator, or a look round, takes this long: no die, but the clock still runs. */
export const ASK_HOURS = 0.25;

/** Ask something, or look round, at the stop in your way: it costs a quarter of an hour, and changes nothing else. */
export function ponder(t: Trip): Trip | null {
  const f = t.facing;
  if (t.over || !f) return null;
  const sheet = { ...copySheet(t.sheet), hour: t.sheet.hour + ASK_HOURS };
  const moment = { ...f.moment, sheet: { ...f.moment.sheet, stats: { ...f.moment.sheet.stats }, hour: sheet.hour } };
  return overClock({ ...t, sheet, facing: { ...f, moment } });
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
  /** You got past enough stops to level up: the table offers two abilities. */
  levelUp: boolean;
  /** A mark the try left, to lean on at a later stop (docs/SYSTEMS.md, 4). */
  marked: Lever | null;
  /** A mark you made earlier, used up on this try. */
  markUsed: Lever | null;
  /** A mark against you, used up on this try (it threw two dice and kept the worse). */
  againstUsed: Against | null;
  /** Black stones the try put in the narrator's bowl. */
  dread: number;
  /** In a contest: what the round came to on the dials. */
  round: Round | null;
  /** In a contest: the dials as the round left them, even when it ended the contest. */
  contest: Contest | null;
  /** Taken out of a contest: what it cost you at an ordinary place, or "end" at the last one. */
  taken: { hours: number; supplies: number } | "end" | null;
}

/** A try that works with limited effect, outside a contest, takes this much longer: you only half managed it. */
export const LIMITED_HOURS = 0.5;

/** The most marks you carry from stop to stop; the oldest goes when another is made. */
export const MARKS_MAX = 3;

const DEFAULT_MARK: Record<Way, string> = { talk: "a good word about you", sneak: "a way you know past them", force: "a name for not backing down", pay: "a fair trade remembered" };

/** Words in a mark's name that a line would use to lean on it, for reading a line without a model. */
export const markWords = (name: string): string[] => [...new Set(name.toLowerCase().split(/[^\p{L}']+/u).filter((w) => w.length >= 4 && !/^(your|their|about|with|from|that|this|they|them|have|will|what|when|where|which|past|know|good|word|name|over|here|there|made|left|some)$/.test(w)))];

/** The mark a try leaves: a try that went better than hoped always leaves one; one that worked does when its line used what was there. */
export function markLeft(o: Outcome, grade: Grade | undefined, words: string | undefined, stop: RoadStop): Lever | null {
  const well = o.tier === "crit_success" || (o.tier === "success" && (grade === "grounded" || grade === "inspired"));
  if (!well) return null;
  const said = (words ?? "").replace(/\s+/g, " ").trim().replace(/[.!]+$/, "").slice(0, 60);
  const name = said.length >= 6 ? said.charAt(0).toLowerCase() + said.slice(1) : `${DEFAULT_MARK[o.check.way]} at ${stop.name}`;
  return { id: `mark:${stop.id}:${o.next.tries}`, way: o.check.way, name, words: markWords(name), mark: true };
}

/** Throw the die at the stop in your way, for a reading of the line the player wrote. Null when that way cannot be tried. */
export function attempt(t0: Trip, read: Read): Turn | null {
  const t = sheetKept(t0);
  const f = t.facing;
  if (t.over || !f) return null;
  const o = resolve(f.moment, withAbility(f.moment, read));
  if (!o) return null;
  const adv = t.adv;
  const sheet: Sheet = { ...o.next.sheet, stats: { ...t.sheet.stats } };
  let trip: Trip = { ...t, sheet };
  const ab = o.check.ability;
  if (ab?.often === "story") trip.storyUsed = [...t.storyUsed, ab.id];
  // A mark you made earlier is used up by a try it helped that works, like a thing you keep.
  const markUsed = o.past && o.check.lever ? t.marks.find((l) => l.id === o.check.lever!.id) ?? null : null;
  if (markUsed) trip.marks = t.marks.filter((l) => l.id !== markUsed.id);
  const againstUsed = o.check.bane;
  if (againstUsed) trip.against = (t.against ?? []).filter((a) => a.id !== againstUsed.id);
  // Outside a contest, effect says how much a try that works did (docs/MOONSHOT.md, 2.2): a limited one took longer;
  // a great one leaves something behind, as a try better than hoped does.
  const marked = markLeft(o, o.effect === "great" || o.effect === "overwhelming" ? "grounded" : read.grade, read.mark, f.stop);
  if (!f.contest && o.past && o.effect === "limited") {
    sheet.hour += LIMITED_HOURS;
    trip.sheet = sheet;
  }
  if (marked) trip.marks = [...trip.marks, marked].slice(-MARKS_MAX);
  const dread = Math.min(DREAD_MAX, (t.dread ?? 0) + dreadFrom(o.tier)) - (t.dread ?? 0);
  if (dread) trip.dread = (t.dread ?? 0) + dread;
  if (o.past) trip.deeds = [...t.deeds, `${o.check.attempt || o.check.way} at ${f.stop.name}`].slice(-8);
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
  let round: Round | null = null, taken: Turn["taken"] = null;
  const opinions: Opinion[] = [];
  // A contest: the try is a round on the dials, and only filling them all gets you past.
  // The save against the danger is thrown every round, and counts only in the round it arrives.
  const save = f.contest?.danger ? throwSave(f.moment.sheet, DANGER_SAVE[f.contest.kind], `${t.seed}:${f.stop.id}:save:${f.contest.round}`) : undefined;
  const played = f.contest ? playRound(f.contest, o.tier, read.grade, read.target ?? null, save, o.effect, o.check.position, movesOf(o.check.ability)) : null;
  if (played) round = played.round;
  const past = played ? played.round.won : o.past;
  if (played && !played.round.won && (played.round.taken || fell)) {
    // Taken out: at the last place the story is lost; anywhere else you come to beyond it, with nothing.
    trip.facing = null;
    if (f.stop.climax) {
      trip.over = "taken";
      taken = "end";
    } else {
      const supplies = Math.min(1, sheet.supplies);
      const hours = fell ? 0 : TAKEN_HOURS;
      sheet.supplies -= supplies;
      sheet.hour += hours;
      taken = { hours: hours + fell, supplies };
      trip.at = f.stop.id;
      trip.warned = 1;
    }
  } else if (played && !played.round.won) {
    more = played.round.hit > 0;
    const trouble = o.next.trouble + (played.round.danger?.came ? 1 : 0);
    trip.facing = { ...f, contest: played.contest, moment: { ...o.next, over: null, trouble, sheet: helped(trip, sheet) } };
  } else if (!played && o.past && f.holds > 1) {
    more = true;
    trip.facing = { ...f, holds: f.holds - 1, moment: { ...o.next, over: null, sheet: helped(trip, sheet) } };
  } else if (past) {
    cleared = true;
    trip.facing = null;
    trip.at = f.stop.id;
    trip.passed = t.passed + 1;
    for (const id of withParty(t)) {
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
  return { outcome: o, trip, more, cleared, reward, opinions, used, fell, longWay, rivalGained, levelUp, marked, markUsed, againstUsed, dread, round, taken, contest: played?.contest ?? null };
}

/* ------------------------------ an ability used without a try ------------------------------ */

/** A line that uses an ability to set something up, rather than to get past (docs/SYSTEMS.md, 3.2 and 4). */
export interface Use {
  use: string;
  /** The way past that it helps, if it helps one. */
  way: Way | null;
  grade?: Grade;
  /** What it leaves true, in a few words. */
  mark?: string;
}

export interface Used {
  trip: Trip;
  ability: Ability;
  /** What came of it: a mark laid in the scene, something got back, a person warmed, nothing in the rules, an ability that is for a try, or one used up. */
  effect: "mark" | "mend" | "warm" | "nothing" | "try" | "spent";
  mark?: Lever;
  mended?: { kind: CostKind; amount: number };
}

/** Lay a mark in the scene you are at. It is for this stop only. */
function markHere(t: Trip, lever: Lever): Trip {
  const f = t.facing!;
  return { ...t, facing: { ...f, moment: { ...f.moment, stop: { ...f.moment.stop, levers: [...f.moment.stop.levers, lever] } } } };
}

/** The easiest way still open here: where a thing learned helps when the line does not say. */
function easiestWay(m: Moment): Way {
  const open = WAYS.filter((w) => m.stop.ways[w] && !m.closed.includes(w));
  return [...open].sort((a, b) => m.stop.ways[a]!.difficulty - m.stop.ways[b]!.difficulty)[0] ?? "talk";
}

/** The verbs that only work on a try with the die. */
const TRY_ONLY = new Set(["ease", "edge", "open", "ward", "slip", "aid"]);

/**
 * Use an ability without a die, at the stop in your way: a trick, a thing learned, a mark, a mend, a sway. It takes a
 * quarter of an hour, like a question. A trick changes no rule by itself; used well towards the goal (a grounded line
 * that says which way it helps), it leaves a mark here, once a stop. Null when there is no such ability here.
 */
export function useAbility(t: Trip, u: Use): Used | null {
  const f = t.facing;
  if (t.over || !f) return null;
  const m = f.moment;
  const a = (m.abilities ?? []).find((x) => x.id === u.use);
  if (!a) return null;
  if (TRY_ONLY.has(a.does)) return { trip: t, ability: a, effect: "try" };
  if (a.does !== "flourish" && !canUse(m, a)) return { trip: t, ability: a, effect: "spent" };
  let trip = ponder(t)!;
  const spend = (x: Trip): Trip => {
    const fm = x.facing!;
    const store = a.store ? Math.max(0, (fm.moment.sheet.store ?? 0) - 1) : fm.moment.sheet.store;
    const sheet = { ...x.sheet, store: a.store ? Math.max(0, (x.sheet.store ?? 0) - 1) : x.sheet.store };
    const used = a.often !== "always" || a.does === "flourish" ? [...(fm.moment.used ?? []), a.id] : fm.moment.used ?? [];
    return { ...x, sheet, storyUsed: a.often === "story" ? [...x.storyUsed, a.id] : x.storyUsed, facing: { ...fm, moment: { ...fm.moment, used, sheet: { ...fm.moment.sheet, stats: { ...fm.moment.sheet.stats }, store } } } };
  };
  const said = (u.mark ?? "").replace(/\s+/g, " ").trim().replace(/[.!]+$/, "").slice(0, 60);
  const lay = (way: Way, uses: number, fallback: string): Lever => {
    const name = said.length >= 6 ? said.charAt(0).toLowerCase() + said.slice(1) : fallback;
    return { id: `mark:${f.stop.id}:${a.id}:${m.tries}:${m.spent.length}:${(m.used ?? []).length}`, way, name, words: markWords(name), uses, mark: true };
  };
  if (a.does === "flourish") {
    // A trick earns a mark only when it was used well, towards a way past, and only once at each stop.
    if (!u.way || !(u.grade === "grounded" || u.grade === "inspired") || (m.used ?? []).includes(a.id) || !m.stop.ways[u.way] || m.closed.includes(u.way)) return { trip, ability: a, effect: "nothing" };
    const mark = lay(u.way, 1, `what your ${bare(a.name)} did`);
    return { trip: markHere(spend(trip), mark), ability: a, effect: "mark", mark };
  }
  if (a.does === "learn" || a.does === "mark") {
    const way = u.way && m.stop.ways[u.way] && !m.closed.includes(u.way) ? u.way : a.ways.find((w) => m.stop.ways[w] && !m.closed.includes(w)) ?? easiestWay(m);
    const mark = lay(way, a.does === "mark" ? a.much : 1, a.does === "learn" ? `what your ${bare(a.name)} showed you` : `what your ${bare(a.name)} set up`);
    return { trip: markHere(spend(trip), mark), ability: a, effect: "mark", mark };
  }
  if (a.does === "mend") {
    const kind = a.of ?? "health";
    const cap = kind === "health" ? HEALTH_MAX : kind === "goodwill" ? GOODWILL_MAX : 99;
    trip = spend(trip);
    const amount = Math.max(0, Math.min(a.much, cap - trip.sheet[kind]));
    const sheet = { ...trip.sheet, [kind]: trip.sheet[kind] + amount };
    const fm = trip.facing!;
    trip = { ...trip, sheet, facing: { ...fm, moment: { ...fm.moment, sheet: { ...fm.moment.sheet, stats: { ...fm.moment.sheet.stats }, [kind]: fm.moment.sheet[kind] + amount } } } };
    return { trip, ability: a, effect: "mend", mended: { kind, amount } };
  }
  // A sway, used without a try: the person is warmer to you for the rest of the stop.
  trip = spend(trip);
  const fm = trip.facing!;
  trip = { ...trip, facing: { ...fm, moment: { ...fm.moment, warm: (fm.moment.warm ?? 0) + a.much } } };
  return { trip, ability: a, effect: "warm" };
}

/** Which of two stops at a fork a companion would rather take: the one where the way they like is easiest. */
export function prefers(c: Companion, stops: RoadStop[]): RoadStop | null {
  const score = (s: RoadStop): number => (s.ways[c.likes] ? 4 - s.ways[c.likes]!.difficulty : -1);
  const [a, b] = stops;
  if (!a || !b || score(a) === score(b)) return null;
  return score(a) > score(b) ? a : b;
}

/** The fight verbs an ability played on a try brings to a contest round (docs/MOONSHOT.md, 7.4). */
function movesOf(a: Ability | null | undefined): Moves {
  if (!a) return {};
  return a.does === "reach" ? { reach: true } : a.does === "bind" ? { bind: true } : a.does === "sweep" ? { sweep: true } : a.does === "drain" ? { drain: true } : {};
}
