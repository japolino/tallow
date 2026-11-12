/**
 * A story played with a hand of dice (docs/DESIGN.md, 3.3): no road of gates and no fixed ways through them. A story
 * is a few scenes, written whole by a model for this card and this player. In each scene two clocks run: how far you
 * have got through it, and how far it has closed on you.
 *
 * Three dice are thrown before you act and lie on the table. Anything you write that could go wrong takes one of them,
 * and you choose which, knowing what each would come to: the die plus the stat the line leans on, against the scene's
 * difficulty. What is at stake is said before you choose. A line that risks nothing takes no die and no time.
 *
 * Who decides what:
 * - A model writes the scenes, and reads each line: whether it is a try, the stat, the thing it uses, how much it
 *   risks (slight, real, grave) and what happens to you if it goes wrong.
 * - Code owns every number here: the dice, the targets, how far a clock moves, what a failure costs, the price of a
 *   trade, the hours. A line cannot argue itself a bonus; the only way to lift a die is to give something up, at a
 *   price set here.
 *
 * Pure: a trip in, the next trip out. Nothing is changed in place.
 */
import type { Ability } from "./abilities.js";
import { copySheet, FALL_HOURS, HEALTH_MAX, overClock, REST_HEALS, REST_HOURS, type Adventure, type Place, type RoadStop, type Trip } from "./adventure.js";
import { CARD_KINDS } from "./cards.js";
import { ageFrom, type ContentSettings } from "./content.js";
import type { Contest } from "./contest.js";
import { d20Tier, rollD20, seededRng } from "./dice.js";
import type { WorldKit } from "./kit.js";
import { PARTIAL, TARGETS, TRY_HOURS, WAYS, type CostKind, type Difficulty, type Sheet, type Stat } from "./moment.js";

/* ------------------------------ the numbers ------------------------------ */

/** Dice in a hand. A new hand is thrown only when every die of the last is spent, or after a rest. */
export const HAND_SIZE = 3;
/** Steps to get through a scene, and steps until it has closed on you. */
export const THROUGH_MAX = 5;
export const GRIP_MAX = 4;
/** Scenes in a story, and how hard each is (moment.ts, TARGETS). */
export const SCENES = 3;
export const SCENE_DIFFICULTY: readonly Difficulty[] = [1, 1, 2];
/** The going from one scene to the next. */
export const SCENE_ROAD_HOURS = 1;
/** How long a story has, from its first hour. */
export const STORY_HOURS = 12;
/** One step: what using a thing takes off the target, and what a trade adds to a die. */
export const STEP = 3;

/** How much a try puts at risk, judged by the reader from the line and the scene. More risked, more gained. */
export type Risk = "slight" | "real" | "grave";
export const RISKS: readonly Risk[] = ["slight", "real", "grave"];
/** What a try is for: getting through the scene, or getting loose of what is closing on you. */
export type Aim = "through" | "loose";
export const AIMS: readonly Aim[] = ["through", "loose"];
/** What a failure can cost (moment.ts). */
export const STAKES: readonly CostKind[] = ["health", "supplies", "goodwill", "hours"];

/** Steps a try gains when it lands, by what it risked. */
export const GAIN: Record<Risk, number> = { slight: 1, real: 2, grave: 3 };

/** How a spent die came out. */
export type Band = "crit" | "clean" | "cost" | "fail" | "botch";
const RANK: Record<Band, number> = { botch: 0, fail: 1, cost: 2, clean: 3, crit: 4 };

/** What a band comes to at a risk: steps gained, steps the scene closes (or opens, below nought), and how much is lost. */
export function comesTo(risk: Risk, band: Band): { gain: number; grip: number; cost: number } {
  const g = GAIN[risk];
  if (band === "crit") return { gain: g, grip: -1, cost: 0 };
  if (band === "clean") return { gain: g, grip: 0, cost: 0 };
  if (band === "cost") return { gain: Math.max(1, g - 1), grip: 1, cost: risk === "grave" ? 1 : 0 };
  const fail = { gain: 0, grip: risk === "grave" ? 2 : 1, cost: risk === "slight" ? 0 : risk === "real" ? 1 : 2 };
  return band === "botch" ? { ...fail, grip: fail.grip + 1 } : fail;
}

/** The band of a die: a 20 is always the best, a 1 always the worst, else the die and the stat against the target. */
export function bandOf(natural: number, add: number, target: number): Band {
  const t = d20Tier(natural, add, target, PARTIAL);
  return t === "crit_success" ? "crit" : t === "success" ? "clean" : t === "partial" ? "cost" : t === "fail" ? "fail" : "botch";
}

/* ------------------------------ a story of scenes ------------------------------ */

/** Something in a scene, or carried into it, that a line can use: one step easier, once. */
export interface SceneThing {
  id: string;
  name: string;
}

/** One scene, as the builder wrote it. Its difficulty is the code's. */
export interface Scene {
  id: string;
  name: string;
  /** The picture on its card (cards.ts), and the title written under it for this world. */
  card: string;
  face: string;
  /** What is going on here, as the narrator knows it: who is here, what they are doing, what is in the way. */
  situation: string;
  person?: { name: string; who: string; wants: string; age?: string };
  /** What getting through this scene means, in the story. */
  through: string;
  /** What closes on you here as it goes wrong. */
  closing: string;
  /** What happens to you if it closes altogether. */
  taken: string;
  /** Two or three things here a line can use. */
  things: SceneThing[];
  /** What getting through leaves you with, to use once later. */
  boon: string;
  difficulty: Difficulty;
}

export interface SceneStory {
  title: string;
  goal: string;
  won: string;
  lost: string;
  /** What the clock runs to, in the world's words ("the dawn bell"). */
  by: string;
  scenes: Scene[];
}

/** The hand and the clocks, as they stand. Kept on the trip; set only here. */
export interface HandState {
  /** The dice lying on the table, not yet spent. */
  dice: number[];
  /** Hands thrown so far this story. */
  rolled: number;
  /** The scene in play (an index into the story's scenes). */
  scene: number;
  through: number;
  grip: number;
  /** Things used in this scene (scene things, abilities): each once a scene. */
  used: string[];
  /** What earlier scenes left you with, each to use once. */
  boons: SceneThing[];
  /** What scenes have taken from you, in the story's words, for the telling. */
  lost: string[];
  /** Whether the scene in play has been come to. False between scenes. */
  opened: boolean;
}

const plain = (v: unknown, max: number, min = 2): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/[*_#`]+/g, "").replace(/\s+/g, " ").trim();
  return s.length >= min && s.length <= max && !/[{}<>]/.test(s) ? s : null;
};
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** The pictures a scene's card can have: a person, a thing in the way, a fight or a place. */
export const SCENE_CARDS: readonly string[] = CARD_KINDS.filter((k) => k.family !== "thing").map((k) => k.id);

/**
 * A story as a model wrote it, checked whole: every scene has every part, in words of its own (no placeholder left
 * in), or the whole story is null and is asked for again. Code gives the ids and the difficulties.
 */
export function checkSceneStory(raw: unknown): SceneStory | null {
  const o = obj(raw);
  if (!o || !Array.isArray(o.scenes) || o.scenes.length !== SCENES) return null;
  const title = plain(o.title, 70);
  const goal = plain(o.goal, 320, 12);
  const won = plain(o.won, 320, 8);
  const lost = plain(o.lost, 320, 8);
  const by = plain(o.by, 60);
  if (!title || !goal || !won || !lost || !by) return null;
  const scenes: Scene[] = [];
  for (const [i, rawScene] of o.scenes.entries()) {
    const s = obj(rawScene);
    if (!s) return null;
    const id = `s${i + 1}`;
    const name = plain(s.name, 48);
    const card = typeof s.card === "string" && SCENE_CARDS.includes(s.card) ? s.card : null;
    const face = plain(s.face, 36);
    const situation = plain(s.situation, 900, 40);
    const through = plain(s.through, 200, 6);
    const closing = plain(s.closing, 200, 6);
    const taken = plain(s.taken, 240, 6);
    const boon = plain(s.boon, 60);
    const things = Array.isArray(s.things) ? s.things.map((t) => plain(t, 60)) : [];
    if (!name || !card || !face || !situation || !through || !closing || !taken || !boon) return null;
    if (things.length < 2 || things.length > 3 || things.some((t) => !t)) return null;
    let person: Scene["person"];
    if (s.person !== undefined && s.person !== null) {
      const p = obj(s.person);
      const pn = plain(p?.name, 48);
      const who = plain(p?.who, 220, 4);
      const wants = plain(p?.wants, 220, 4);
      if (!p || !pn || !who || !wants) return null;
      person = { name: pn, who, wants, ...(typeof p.age === "string" ? { age: p.age.slice(0, 20) } : {}) };
    }
    scenes.push({ id, name, card, face, situation, ...(person ? { person } : {}), through, closing, taken, things: things.map((t, j) => ({ id: `${id}-t${j + 1}`, name: t! })), boon, difficulty: SCENE_DIFFICULTY[i] ?? 1 });
  }
  if (new Set(scenes.map((s) => s.name.toLowerCase())).size !== scenes.length) return null;
  return { title, goal, won, lost, by, scenes };
}

/** A scene as a stop: what the map, the card and the content rules need of it. Nothing is played by its ways. */
function sceneStop(s: Scene, last: boolean): RoadStop {
  const ways = Object.fromEntries(WAYS.map((w) => [w, w === "pay" ? { difficulty: s.difficulty, price: 1 } : { difficulty: s.difficulty }])) as RoadStop["ways"];
  return {
    id: s.id,
    name: s.name,
    kind: s.person ? "person" : "obstacle",
    card: s.card,
    face: s.face,
    teaser: "",
    situation: s.situation,
    ways,
    levers: [],
    ...(last ? { climax: true } : {}),
    ...(s.person ? { person: { id: `p-${s.id}`, name: s.person.name, wants: s.person.wants, likes: [], dislikes: [], attitude: "wary" as const, resolve: s.difficulty, knows: [], age: ageFrom(s.person.age, s.person.who, s.person.name) } } : {}),
  };
}

/** A story of scenes as an adventure: its scenes in a line on the map, its clock, and the story itself kept on it. */
export function sceneAdventure(story: SceneStory, o: { seed: string; who: string; startHour?: number; content?: ContentSettings; kit?: WorldKit }): Adventure {
  const n = story.scenes.length;
  const startHour = o.startHour ?? 19;
  const seedNum = [...o.seed].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7);
  const places: Place[] = [{ id: "start", name: "Where it begins", u: 0.12, v: 0.56 }, ...story.scenes.map((s, i) => ({ id: s.id, name: s.name, u: 0.12 + (0.76 * (i + 1)) / n, v: 0.5 + (i % 2 ? -0.14 : 0.1) }))];
  const roads: [string, string, number][] = story.scenes.map((s, i) => [i ? story.scenes[i - 1]!.id : "start", s.id, i ? SCENE_ROAD_HOURS : 0]);
  return {
    id: `scenes-${o.seed}`,
    title: story.title,
    trope: "scenes",
    goal: story.goal,
    who: o.who,
    seed: seedNum,
    places,
    start: "start",
    roads,
    stops: story.scenes.map((s, i) => sceneStop(s, i === n - 1)),
    startHour,
    deadline: { hour: startHour + STORY_HOURS, name: story.by, lost: story.lost },
    companions: [],
    loot: [],
    won: story.won,
    ...(o.kit ? { kit: o.kit } : {}),
    ...(o.content ? { content: o.content } : {}),
    scenes: story,
  };
}

/* ------------------------------ the hand ------------------------------ */

/** A hand of dice: thrown from the story's seed, so a story kept and taken up again has the same dice. */
export function rollHand(seed: string, n: number): number[] {
  const rng = seededRng(`${seed}:hand:${n}`);
  return Array.from({ length: HAND_SIZE }, () => rollD20(rng));
}

/** The first hand of a story, thrown before anything is tried. */
export function startHand(t: Trip): Trip {
  return { ...t, hand: { dice: rollHand(t.seed, 0), rolled: 1, scene: 0, through: 0, grip: 0, used: [], boons: [], lost: [], opened: false } };
}

export const sceneNow = (t: Pick<Trip, "adv" | "hand">): Scene | null => t.adv.scenes?.scenes[t.hand?.scene ?? 0] ?? null;
export const lastScene = (t: Pick<Trip, "adv" | "hand">): boolean => (t.hand?.scene ?? 0) >= (t.adv.scenes?.scenes.length ?? 1) - 1;

const abilityThing = (a: Ability): SceneThing => ({ id: `ability:${a.id}`, name: a.name });

/** What a line can use now: what is in the scene, what earlier scenes left you, and what you can do, each not yet used here. */
export function thingsNow(t: Trip): SceneThing[] {
  const h = t.hand;
  const s = sceneNow(t);
  if (!h || !s) return [];
  return [...s.things, ...h.boons, ...t.abilities.map(abilityThing)].filter((x) => !h.used.includes(x.id));
}

/** The stats a hero has: the six, and the seventh where their sheet has it. */
export const statsOf = (sheet: Sheet): Stat[] => (Object.keys(sheet.stats) as Stat[]).filter((k) => typeof sheet.stats[k] === "number");

/** A try, as a reader made it out. Checked by `checkSceneLine` before it is priced. */
export interface SceneTry {
  /** What is being tried, in a few words. */
  attempt: string;
  stat: Stat;
  risk: Risk;
  /** What it costs if it goes wrong, and what happens to you, in a few words. */
  stake: CostKind;
  threat: string;
  aim: Aim;
  /** The id of a thing the line uses (thingsNow), if any. */
  thing?: string | null;
}

/** What a written line is: a try, a line that risks nothing, one of the dice named for a try that waits, or stopping for tonight. */
export type SceneLine = ({ kind: "try" } & SceneTry) | { kind: "free" } | { kind: "die"; die: number } | { kind: "stop" };

/**
 * A reader's answer, checked against the table as it stands: the stat is one the hero has, the thing is there and
 * unused, the die is one that lies on the table while a try waits for it. Anything else is null, and is asked again.
 */
export function checkSceneLine(raw: unknown, t: Trip, pending: boolean): SceneLine | null {
  const o = obj(raw);
  const h = t.hand;
  if (!o || !h) return null;
  if (o.kind === "free" || o.kind === "stop") return { kind: o.kind };
  if (o.kind === "die") return pending && typeof o.die === "number" && h.dice.includes(o.die) ? { kind: "die", die: o.die } : null;
  if (o.kind !== "try") return null;
  const stat = statsOf(t.sheet).find((s) => s === o.stat);
  const risk = RISKS.find((r) => r === o.risk);
  const stake = STAKES.find((k) => k === o.stake);
  const aim = AIMS.find((a) => a === o.aim) ?? "through";
  const threat = plain(o.threat, 200, 4);
  const attempt = plain(o.attempt, 200) ?? "";
  if (!stat || !risk || !stake || !threat) return null;
  const thing = typeof o.thing === "string" && o.thing ? o.thing : null;
  if (thing && !thingsNow(t).some((x) => x.id === thing)) return null;
  return { kind: "try", attempt, stat, risk, stake, threat, aim, thing };
}

/** A try with its numbers: what the die must show, and what each die on the table would come to. */
export interface Priced extends SceneTry {
  add: number;
  target: number;
  /** The thing it uses, which makes it a step easier. */
  using: SceneThing | null;
  /** What each die in the hand would come to, in the hand's order. */
  bands: Band[];
}

/** The numbers of a try: the scene's difficulty, a step easier with a thing, against the stat the line leans on. */
export function price(t: Trip, r: SceneTry): Priced | null {
  const h = t.hand;
  const s = sceneNow(t);
  if (!h || !s || t.over) return null;
  const stat: Stat = typeof t.sheet.stats[r.stat] === "number" ? r.stat : "wits";
  const add = t.sheet.stats[stat] ?? 0;
  const using = r.thing ? (thingsNow(t).find((x) => x.id === r.thing) ?? null) : null;
  const target = TARGETS[s.difficulty] - (using ? STEP : 0);
  // Getting loose means something only when something has closed.
  const aim: Aim = r.aim === "loose" && h.grip > 0 ? "loose" : "through";
  return { ...r, stat, aim, thing: using?.id ?? null, add, target, using, bands: h.dice.map((d) => bandOf(d, add, target)) };
}

/** What can be given up to lift a die one step: a wound, or supplies. */
export type TradeKind = "health" | "supplies";
export const TRADE_PRICE: Record<TradeKind, number> = { health: 1, supplies: 2 };

/**
 * The trades open for a die on a try: only when a step would make it come to more, never for a 1 or a 20, and never
 * a wound that would take you out.
 */
export function trades(t: Trip, p: Priced, die: number): TradeKind[] {
  const natural = t.hand?.dice[die];
  if (natural === undefined || natural <= 1 || natural >= 20) return [];
  if (RANK[bandOf(natural, p.add + STEP, p.target)] <= RANK[bandOf(natural, p.add, p.target)]) return [];
  return [...(t.sheet.health > TRADE_PRICE.health ? ["health" as const] : []), ...(t.sheet.supplies >= TRADE_PRICE.supplies ? ["supplies" as const] : [])];
}

/** Something lost: by a failure, or given up in a trade. */
export interface Loss {
  kind: CostKind;
  amount: number;
}

/** Take a cost off a sheet. Supplies or goodwill you have none left of come off your health instead. */
function pay(sheet: Sheet, kind: CostKind, n: number): { sheet: Sheet; losses: Loss[] } {
  const s = copySheet(sheet);
  const losses: Loss[] = [];
  if (n <= 0) return { sheet: s, losses };
  if (kind === "hours") {
    s.hour += n;
    return { sheet: s, losses: [{ kind, amount: n }] };
  }
  const take = kind === "health" ? n : Math.min(s[kind], n);
  if (kind !== "health" && take) {
    s[kind] -= take;
    losses.push({ kind, amount: take });
  }
  const hurt = kind === "health" ? n : n - take;
  if (hurt) {
    const lost = Math.min(s.health, hurt);
    s.health -= lost;
    if (lost) losses.push({ kind: "health", amount: lost });
  }
  return { sheet: s, losses };
}

/** A die spent on a try, and what came of it. */
export interface Spent {
  trip: Trip;
  try: Priced;
  natural: number;
  band: Band;
  /** What was given up to lift the die a step, if anything. */
  traded: TradeKind | null;
  /** Steps gained (through, or loose of the grip), and steps the scene closed. */
  gain: number;
  closed: number;
  losses: Loss[];
  /** A new hand, when the last die of the old one was spent. */
  fresh: number[] | null;
  /** Where the scene stands: still on, got through, or closed on you. */
  scene: "on" | "won" | "taken";
}

/**
 * Spend a die of the hand on a try. The die leaves the table; the clocks move by what it came to; the try takes its
 * half hour. When the hand is empty a new one is thrown.
 */
export function spend(t: Trip, p: Priced, die: number, trade: TradeKind | null = null): Spent | null {
  const h = t.hand;
  const natural = h?.dice[die];
  if (!h || natural === undefined || t.over || !sceneNow(t)) return null;
  const traded = trade && trades(t, p, die).includes(trade) ? trade : null;
  let sheet = traded ? pay(t.sheet, traded, TRADE_PRICE[traded]).sheet : copySheet(t.sheet);
  const band = bandOf(natural, p.add + (traded ? STEP : 0), p.target);
  const e = comesTo(p.risk, band);
  const paid = pay(sheet, p.stake, e.cost);
  sheet = paid.sheet;
  sheet.hour += TRY_HOURS;
  const through = p.aim === "through" ? Math.min(THROUGH_MAX, h.through + e.gain) : h.through;
  const grip = Math.max(0, Math.min(GRIP_MAX, h.grip + e.grip - (p.aim === "loose" ? e.gain : 0)));
  const left = h.dice.filter((_, i) => i !== die);
  const fresh = left.length ? null : rollHand(t.seed, h.rolled);
  // A boon is spent for good; a scene's thing or an ability, for this scene.
  const boons = p.using ? h.boons.filter((b) => b.id !== p.using!.id) : h.boons;
  const used = p.using && !p.using.id.startsWith("boon:") ? [...h.used, p.using.id] : h.used;
  const landed = band === "clean" || band === "crit";
  const hand: HandState = { ...h, dice: fresh ?? left, rolled: h.rolled + (fresh ? 1 : 0), through, grip, used, boons };
  const trip: Trip = { ...t, sheet, hand, ...(landed && p.attempt ? { deeds: [...t.deeds, p.attempt].slice(-12) } : {}) };
  const scene = through >= THROUGH_MAX ? "won" : grip >= GRIP_MAX || sheet.health <= 0 ? "taken" : "on";
  return { trip: scene === "on" ? overClock(trip) : trip, try: p, natural, band, traded, gain: e.gain, closed: grip - h.grip, losses: paid.losses, fresh, scene };
}

/** Whether there is time left for even one try. */
export const outOfTime = (t: Trip): boolean => t.adv.deadline.hour - t.sheet.hour < TRY_HOURS - 1e-9;

/* ------------------------------ from scene to scene ------------------------------ */

export interface Entered {
  trip: Trip;
  scene: Scene;
  hours: number;
  index: number;
  total: number;
}

/** Come to the scene in play: the going takes its time, and the scene stands before you. */
export function enterScene(t: Trip): Entered | null {
  const h = t.hand;
  const scene = sceneNow(t);
  if (!h || !scene || t.over || h.opened) return null;
  const hours = h.scene ? SCENE_ROAD_HOURS : 0;
  const sheet = { ...copySheet(t.sheet), hour: t.sheet.hour + hours };
  const trip = overClock({ ...t, sheet, at: scene.id, visited: [...t.visited, scene.id], hand: { ...h, opened: true } });
  return { trip, scene, hours, index: h.scene, total: t.adv.scenes?.scenes.length ?? 1 };
}

/** A scene left behind: got through, or closed on you. */
export interface Left {
  trip: Trip;
  scene: Scene;
  how: "won" | "taken";
  /** What getting through left you with. */
  boon: SceneThing | null;
  losses: Loss[];
  hours: number;
  /** How much of what had closed on you follows you into the next scene. */
  follows: number;
  last: boolean;
}

/**
 * Leave the scene in play. Got through: you keep what it leaves you. Closed on you: you come to hours later, hurt,
 * with nothing from it; at the last scene the story is lost. Either way, half of what had closed on you follows you.
 */
export function leaveScene(t: Trip, how: "won" | "taken"): Left | null {
  const h = t.hand;
  const scene = sceneNow(t);
  if (!h || !scene || t.over) return null;
  const last = lastScene(t);
  const follows = Math.floor(h.grip / 2);
  if (how === "won") {
    const boon: SceneThing = { id: `boon:${scene.id}`, name: scene.boon };
    const hand: HandState = { ...h, scene: last ? h.scene : h.scene + 1, through: last ? h.through : 0, grip: last ? h.grip : follows, used: [], boons: last ? h.boons : [...h.boons, boon], opened: last };
    return { trip: { ...t, hand, passed: t.passed + 1, ...(last ? { over: "won" as const } : {}) }, scene, how, boon: last ? null : boon, losses: [], hours: 0, follows: last ? 0 : follows, last };
  }
  if (last) return { trip: { ...t, over: "taken", hand: { ...h, lost: [...h.lost, scene.taken] } }, scene, how, boon: null, losses: [], hours: 0, follows: 0, last };
  const sheet = copySheet(t.sheet);
  const before = sheet.health;
  sheet.health = Math.max(1, sheet.health - 1);
  sheet.hour += FALL_HOURS;
  const losses: Loss[] = before > sheet.health ? [{ kind: "health", amount: before - sheet.health }] : [];
  const hand: HandState = { ...h, scene: h.scene + 1, through: 0, grip: follows, used: [], lost: [...h.lost, scene.taken], opened: false };
  return { trip: overClock({ ...t, sheet, hand }), scene, how, boon: null, losses, hours: FALL_HOURS, follows, last };
}

/** Whether a rest between scenes would do anything: you are hurt, or the hand is not a whole one. */
export const worthRest = (t: Trip): boolean => !!t.hand && !t.hand.opened && !t.over && (t.sheet.health < HEALTH_MAX || t.hand.dice.length < HAND_SIZE);

export interface HandRest {
  trip: Trip;
  healed: number;
  ate: boolean;
  dice: number[];
}

/** Rest between scenes: it heals you and eats a supply, the dice left on the table are swept up and a new hand thrown, and it takes hours. */
export function restHand(t: Trip): HandRest | null {
  const h = t.hand;
  if (!h || h.opened || t.over) return null;
  const sheet = copySheet(t.sheet);
  const ate = sheet.supplies > 0;
  if (ate) sheet.supplies -= 1;
  const healed = Math.min(ate ? REST_HEALS : 1, HEALTH_MAX - sheet.health);
  sheet.health += healed;
  sheet.hour += REST_HOURS;
  const dice = rollHand(t.seed, h.rolled);
  return { trip: overClock({ ...t, sheet, hand: { ...h, dice, rolled: h.rolled + 1 } }), healed, ate, dice };
}

/** The two clocks as the room's dials (contest.ts): how far through on the narrator's side, how far closed on yours. */
export function handDials(t: Trip): Contest | null {
  const h = t.hand;
  const s = sceneNow(t);
  if (!h || !s) return null;
  return { kind: s.person ? "words" : "struggle", foes: [{ id: "through", name: "Getting through", notches: THROUGH_MAX, filled: h.through }], danger: null, you: { id: "you", name: "Closing on you", notches: GRIP_MAX, filled: h.grip }, round: 0 };
}
