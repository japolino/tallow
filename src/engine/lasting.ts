/**
 * What a try can win that stays won (docs/DESIGN.md, 3.3). Most tries in a story of scenes are after the scene: getting
 * through it, or getting loose of what is closing. But a player can be after something of their own that is still true
 * when the scene is over: someone who comes with them, someone won to their side, a promise or a debt, a thing that is
 * theirs now, something in the world or between people changed. This file is the rules of that.
 *
 * Who decides what:
 * - The reader model says what the player is really after (the change, in the story's words), how big an ask it is, a
 *   lesser version of it, what failing costs with them, and the catch: what comes with it by the nature of who or what
 *   is involved. The dragon is still a dragon; the one who says she is good now has her own reasons.
 * - Code prices it: a bigger ask is harder and takes more landed tries, and how the person stands with you makes it
 *   easier or harder. Every landing brings it nearer and leaves them thinking better of you; a landing at a cost wins
 *   the lesser version; a failure costs you with them. What is won is kept on the hand, told as true in every telling
 *   after, and its catch comes due at the next scene, at code's price. A model only tells what that looks like.
 * - Whoever is won to go with you is a card on your side, leaned on once a scene like a thing in it, and gone at the
 *   start of a scene when they have come to think too little of you (turned on you, if they are set against you).
 *
 * The game never says no to an ask: it prices it and attaches what comes with it. Pure: a trip in, the next trip out.
 */
import { copySheet, overClock, type Trip } from "./adventure.js";
import { bandOf, checkSceneLine, enterScene, GAIN, GRIP_MAX, lastScene, pay, price, sceneNow, sceneStop, spend, STAKES, STEP, type Band, type Entered, type HandState, type Loss, type Priced, type Risk, type Scene, type SceneLine, type SceneTry, type Spent, type TradeKind } from "./hand.js";
import { TARGETS, type CostKind } from "./moment.js";

/* ------------------------------ the numbers ------------------------------ */

/** What a try can win: someone comes with you, someone is won to your side, a promise or debt, a thing, a fact changed. */
export type ChangeKind = "join" | "side" | "bond" | "take" | "fact";
export const CHANGE_KINDS: readonly ChangeKind[] = ["join", "side", "bond", "take", "fact"];

/** How big an ask is, judged by the reader from who is asked and what: a favour, a change of life or loyalty, or against their nature. */
export type AskSize = "small" | "large" | "huge";
export const ASK_SIZES: readonly AskSize[] = ["small", "large", "huge"];
/** Steps harder an ask is than the scene, by its size. */
export const ASK_STEPS: Record<AskSize, number> = { small: 0, large: 1, huge: 2 };
/** Steps of landed tries an ask takes to win (a slight risk lands 1, a real one 2, a grave one 3). */
export const ASK_NEED: Record<AskSize, number> = { small: 1, large: 2, huge: 4 };

/** How someone stands with you: from set against you to bound to you. Each step of it is a step easier (or harder) to ask of them. */
export const STANDING_MIN = -2;
export const STANDING_MAX = 2;
/** Someone who goes with you and stands with you below this leaves at the start of the next scene. */
export const STAYS_AT = 1;

/** What a catch costs when it comes due, in whatever it costs, and how far it closes the scene it comes due in. */
export const CATCH_COST: Record<AskSize, number> = { small: 1, large: 1, huge: 2 };
export const CATCH_GRIP: Record<AskSize, number> = { small: 0, large: 1, huge: 1 };
/** How far walking away from a scene closes the next one on you, over all that had closed on you here. */
export const WALK_GRIP = 1;

const ASKS_KEPT = 6;

/* ------------------------------ what is kept ------------------------------ */

/** What a try is after, beyond the scene, as the reader made it out. Checked by `checkOwn`. */
export interface OwnRead {
  kind: ChangeKind;
  /** Who or what it is about: the person, the creature, the thing, the place. */
  who: string;
  /** What becomes true and stays true if it lands, in the story's words. */
  change: string;
  size: AskSize;
  /** What is true instead if it lands only at a cost: less of it, for less long, or twisted. */
  lesser?: string;
  /** What comes with it, by the nature of who or what is involved. */
  catch: string;
  /** What failing costs with them, how they take it. */
  against: string;
  /** What the catch costs when it comes due (code says how much and when). */
  costs: CostKind;
  /** An ask already under way that this goes on with. */
  ask?: string;
}

/** An ask under way: what it would make true, and how far landed tries have brought it. */
export interface Ask extends Omit<OwnRead, "ask"> {
  id: string;
  filled: number;
  need: number;
  /** The scene it was begun in. */
  scene: number;
}

/** Something won that stays true (or someone set against you by a try that went wrong). */
export interface Change {
  id: string;
  kind: ChangeKind | "sour";
  who: string;
  /** What is true now, in the story's words: the lesser version when it was won at a cost. */
  said: string;
  form: "full" | "lesser";
  size: AskSize;
  catch: string;
  costs: CostKind;
  /** The scene it was won in, and the story's title. */
  scene: number;
  story?: string;
  /** The scene its catch comes due at (the next one; past the last, when it was won there, and then in the next story); null once it has. */
  due: number | null;
}

/** Someone who goes with you: won by a change of kind "join". */
export interface Comrade {
  id: string;
  name: string;
  /** What they are, in a line. */
  who: string;
  /** The change that won them. */
  change: string;
  /** Gone: left you, or turned on you. */
  gone?: "left" | "turned";
}

export interface Lasting {
  changes: Change[];
  asks: Ask[];
  /** How each person met stands with you, by their name in lower case. */
  people: Record<string, { name: string; standing: number }>;
  company: Comrade[];
  /** For ids. */
  n: number;
}

const EMPTY: Lasting = { changes: [], asks: [], people: {}, company: [], n: 0 };

/** What is kept on a hand, or nothing yet. */
export const lastingOf = (h: Pick<HandState, "lasting"> | null | undefined): Lasting => h?.lasting ?? EMPTY;
const copyLasting = (l: Lasting): Lasting => ({ changes: l.changes.map((c) => ({ ...c })), asks: l.asks.map((a) => ({ ...a })), people: Object.fromEntries(Object.entries(l.people).map(([k, v]) => [k, { ...v }])), company: l.company.map((c) => ({ ...c })), n: l.n });

/** A name as people are known by: lower case, letters and figures only. */
export const nameKey = (name: string): string => name.toLowerCase().replace(/^(the|a|an)\s+/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const clampStanding = (n: number): number => Math.max(STANDING_MIN, Math.min(STANDING_MAX, n));

/**
 * Whether two names are the same person: the same, or one is the other with more after it ("Vesna" and "Vesna of the
 * Locks"), since a reader names someone as the line or the scene does.
 */
export function samePerson(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  return !!x && !!y && (x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `));
}

/** The key someone is kept by: the one already kept for the same person, or their own name's. */
const keyOf = (l: Lasting, who: string): string => Object.keys(l.people).find((k) => samePerson(k, who)) ?? nameKey(who);

/** How someone stands with you: 0 for anyone you have done nothing with. */
export const standingOf = (t: Pick<Trip, "hand">, who: string): number => {
  const l = lastingOf(t.hand);
  return l.people[keyOf(l, who)]?.standing ?? 0;
};

/** Who goes with you now. */
export const companyNow = (t: Pick<Trip, "hand">): Comrade[] => lastingOf(t.hand).company.filter((c) => !c.gone);

/* ------------------------------ reading what a try is after ------------------------------ */

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
/** Words a model wrote, as they are (hand.ts, `plain`): refused only when missing, a placeholder, or a runaway. */
const words = (v: unknown, max: number, min = 2): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/[*_#`]+/g, "").replace(/\s+/g, " ").trim();
  return s.length >= min && s.length <= max && !/[{}<>]/.test(s) ? s : null;
};

/**
 * What a try is after, as the reader wrote it, checked: who it is about, what it would make true and what comes with it
 * must be there, in words of the reader's own. A size or a kind that is not one of the game's is read as the middle one
 * (a large ask, a fact), not refused. An ask already under way goes on: named by its id, or about the same person in the
 * same way, and then its size is the one it had (an ask cannot be made smaller by putting it another way). An ask named
 * by its id is taken only when it is about the one this try is about: the "who" given, or with none, someone the try
 * names (`attempt`); a real reader once went on with an ask of one person in a try at another. `why` is told what was
 * missing or not taken.
 */
export function checkOwn(raw: unknown, t: Pick<Trip, "hand">, stake: CostKind, why?: (reason: string) => void, attempt?: string): OwnRead | null {
  const o = obj(raw);
  const l = lastingOf(t.hand);
  if (!o) return (why?.("what the try is after is not an object"), null);
  const byId = typeof o.ask === "string" ? l.asks.find((a) => a.id === o.ask) : undefined;
  const said = words(o.who, 120);
  const named = byId && (said ? samePerson(byId.who, said) : namedIn(attempt ?? "", byId.who)) ? byId : undefined;
  if (byId && !named) why?.(`the ask under way it named (${byId.id}) is of ${byId.who}, not of who this try is about`);
  const who = words(o.who, 120) ?? named?.who ?? null;
  const change = words(o.change, 600, 6) ?? named?.change ?? null;
  const caught = words(o.catch, 600, 4) ?? named?.catch ?? null;
  if (!who || !change || !caught) {
    why?.(`what the try is after has no ${!who ? '"who"' : !change ? '"change"' : '"catch"'}`);
    return null;
  }
  const kind = CHANGE_KINDS.find((k) => k === o.kind) ?? named?.kind ?? "fact";
  const under = named ?? l.asks.find((a) => a.kind === kind && samePerson(a.who, who));
  const size = under?.size ?? ASK_SIZES.find((s) => s === o.size) ?? "large";
  const lesser = words(o.lesser, 600, 4) ?? under?.lesser;
  const against = words(o.against, 600, 4) ?? under?.against ?? "";
  const costs = STAKES.find((k) => k === o.costs) ?? under?.costs ?? stake;
  return { kind, who, change, size, ...(lesser ? { lesser } : {}), catch: caught, against, costs, ...(under ? { ask: under.id } : {}) };
}

/** Whether a try's words name someone: a word of their name (not "the" or a title's small words) is in it. */
function namedIn(text: string, who: string): boolean {
  const said = ` ${nameKey(text)} `;
  return nameKey(who).split(" ").some((w) => w.length >= 3 && !["the", "and", "of"].includes(w) && said.includes(` ${w} `));
}

/**
 * A reader's whole answer to a line in a story of scenes: the line as `checkSceneLine` checks it, and for a try whose
 * aim is "own", what it is after (`checkOwn`). A try said to be after something of its own that does not say what is
 * played as a try at the scene, and `why` is told so: the line is still the player's, and still a try.
 */
export function checkReading(raw: unknown, t: Trip, pending: boolean, why?: (reason: string) => void): SceneLine | null {
  const line = checkSceneLine(raw, t, pending);
  if (!line || line.kind !== "try") return line;
  if (line.aim !== "own") return { ...line, own: null };
  const own = checkOwn(obj(raw)?.own, t, line.stake, why, line.attempt);
  return own ? { ...line, own } : { ...line, aim: "through", own: null };
}

/* ------------------------------ pricing an ask ------------------------------ */

/** An ask as it stands for a try: the one under way it goes on with, or a new one. */
export function askOf(t: Pick<Trip, "hand">, own: OwnRead): { id: string | null; filled: number; need: number; size: AskSize } {
  const a = own.ask ? lastingOf(t.hand).asks.find((x) => x.id === own.ask) : undefined;
  return a ? { id: a.id, filled: a.filled, need: a.need, size: a.size } : { id: null, filled: 0, need: ASK_NEED[own.size], size: own.size };
}

/** The steps a try at an ask is harder than the scene: its size, less how well the one asked thinks of you. */
export const askSteps = (t: Pick<Trip, "hand">, own: OwnRead): number => ASK_STEPS[askOf(t, own).size] - standingOf(t, own.who);

/**
 * The numbers of a try (hand.ts, `price`), and for a try at something of the player's own, the ask's: a step harder for
 * a large ask and two for a huge one, a step easier for each step the one asked stands with you, a step harder for each
 * against you. What each die would come to is said at that target.
 */
export function priceTry(t: Trip, r: SceneTry): Priced | null {
  const p = price(t, r);
  if (!p || p.aim !== "own" || !p.own) return p;
  const target = Math.max(TARGETS[0] - STEP, p.target + STEP * askSteps(t, p.own));
  return { ...p, target, bands: (t.hand?.dice ?? []).map((d) => bandOf(d, p.add, target)) };
}

/**
 * Whether a try at an ask also counts toward getting through the scene: when it is to win over the one in the way here
 * (to come along, or to take the player's side). Won over, they are no longer in the way, so a landing moves the scene
 * as a try at it would. Anything else asked of them (a promise, a thing, a fact) is the player's own, and the scene
 * still has to be got through.
 */
export function countsThrough(t: Trip, own: Pick<OwnRead, "kind" | "who">): boolean {
  const person = sceneNow(t)?.person;
  return (own.kind === "join" || own.kind === "side") && !!person && samePerson(person.name, own.who);
}

/**
 * What a band comes to for an ask: steps nearer it (as many as the scene's would be), and how the one asked comes to
 * think of you. A landing at a cost wins only the lesser version, if it is the landing that wins it.
 */
export function askComesTo(risk: Risk, band: Band): { steps: number; standing: number; lesser: boolean } {
  const g = GAIN[risk];
  if (band === "crit") return { steps: g + 1, standing: 1, lesser: false };
  if (band === "clean") return { steps: g, standing: 1, lesser: false };
  if (band === "cost") return { steps: Math.max(1, g - 1), standing: 0, lesser: true };
  return { steps: 0, standing: band === "botch" ? -2 : -1, lesser: false };
}

/* ------------------------------ a die spent on it ------------------------------ */

/** What a try at an ask came to. */
export interface Settled {
  /** The ask as it stands after the try. */
  ask: Ask;
  steps: number;
  standing: { before: number; after: number };
  /** What became true, if this try won it. */
  won: Change | null;
  /** Who now goes with you, if that is what was won. */
  joined: Comrade | null;
  /** The one asked, set against you by it. */
  soured: Change | null;
}

/** A die spent, with what it came to for an ask, and for whoever was leaned on. */
export interface SpentTry extends Spent {
  own: Settled | null;
  /** Someone with you leaned on, and let down: they think less of you. */
  leaned: { comrade: Comrade; before: number; after: number } | null;
}

/**
 * Spend a die on a try (hand.ts, `spend`): the scene's dials, the cost and the clock as ever. A try at an ask moves no
 * step through the scene, unless it is to win over the one in the way here (`countsThrough`): it moves the ask, and how
 * the one asked stands with you. Someone with you who is leaned on in
 * a try that falls short thinks less of you for it.
 */
export function spendTry(t: Trip, p: Priced, die: number, trade: TradeKind | null = null): SpentTry | null {
  // An ask of the one in the way here moves the scene too, at the ask's own price (`countsThrough`).
  const s = spend(t, p.aim === "own" && p.own && countsThrough(t, p.own) ? { ...p, aim: "through" } : p, die, trade);
  if (!s) return null;
  let trip = s.trip;
  let own: Settled | null = null;
  if (p.aim === "own" && p.own) ({ trip, own } = settle(trip, p.own, p.risk, s.band));
  let leaned: SpentTry["leaned"] = null;
  const comrade = p.using?.id.startsWith("with:") ? lastingOf(trip.hand).company.find((c) => `with:${c.id}` === p.using!.id) : undefined;
  if (comrade && (s.band === "fail" || s.band === "botch") && trip.hand) {
    const l = copyLasting(lastingOf(trip.hand));
    const k = keyOf(l, comrade.name);
    const before = l.people[k]?.standing ?? 0;
    const after = clampStanding(before - 1);
    l.people[k] = { name: comrade.name, standing: after };
    trip = { ...trip, hand: { ...trip.hand, lasting: l } };
    leaned = { comrade, before, after };
  }
  return { ...s, trip, own, leaned };
}

/** The ask moved by a band: nearer, won, or set back with the one asked. */
function settle(t: Trip, own: OwnRead, risk: Risk, band: Band): { trip: Trip; own: Settled } {
  const h = t.hand!;
  const l = copyLasting(lastingOf(h));
  const e = askComesTo(risk, band);
  const k = keyOf(l, own.who);
  const before = l.people[k]?.standing ?? 0;
  let after = clampStanding(before + e.standing);
  const under = own.ask ? l.asks.find((a) => a.id === own.ask) : undefined;
  const { ask: _id, ...said } = own;
  let ask: Ask = under ? { ...under, ...said, size: under.size, need: under.need } : { ...said, id: `a${++l.n}`, filled: 0, need: ASK_NEED[own.size], scene: h.scene };
  ask = { ...ask, filled: Math.min(ask.need, ask.filled + e.steps) };
  let won: Change | null = null;
  let joined: Comrade | null = null;
  let soured: Change | null = null;
  l.asks = l.asks.filter((a) => a.id !== ask.id);
  if (e.steps && ask.filled >= ask.need) {
    const lesser = e.lesser;
    won = { id: `c${++l.n}`, kind: ask.kind, who: ask.who, said: lesser && ask.lesser ? ask.lesser : ask.change, form: lesser ? "lesser" : "full", size: ask.size, catch: ask.catch, costs: ask.costs, scene: h.scene, story: t.adv.title, due: h.scene + 1 };
    l.changes.push(won);
    // Won over in full, someone who comes with you or takes your side thinks well enough of you to stay. Won only at a
    // cost, they think of you as they did: unless that was well, they will not stay past this scene.
    if (!lesser && (ask.kind === "join" || ask.kind === "side")) after = Math.max(after, STAYS_AT);
    if (ask.kind === "join" && !l.company.some((c) => !c.gone && samePerson(c.name, ask.who))) {
      const scene = sceneNow(t);
      const who = scene?.person && samePerson(scene.person.name, ask.who) ? scene.person.who : won.said;
      joined = { id: `w${++l.n}`, name: ask.who, who, change: won.id };
      l.company.push(joined);
    }
  } else {
    l.asks = [...l.asks, ask].slice(-ASKS_KEPT);
    // Set against you, by this: it stays true, and they are hard to ask anything of again.
    if (after <= STANDING_MIN && before > STANDING_MIN) {
      soured = { id: `c${++l.n}`, kind: "sour", who: own.who, said: own.against || `${own.who} is set against you.`, form: "full", size: ask.size, catch: "", costs: ask.costs, scene: h.scene, story: t.adv.title, due: null };
      l.changes.push(soured);
    }
  }
  l.people[k] = { name: own.who, standing: after };
  return { trip: { ...t, hand: { ...h, lasting: l } }, own: { ask, steps: e.steps, standing: { before, after }, won, joined, soured } };
}

/* ------------------------------ what comes due ------------------------------ */

/** A catch come due as a scene opens: what it cost, how far it closed the scene, and whoever went because of it. */
export interface Due {
  change: Change | null;
  losses: Loss[];
  closed: number;
  goes: Comrade | null;
  how?: "left" | "turned";
}

/**
 * At the start of a scene: whoever goes with you and has come to think too little of you goes (turning on you, when
 * they are set against you, which closes the scene on you a step), and what they came with comes due if it has not;
 * then every catch due at this scene comes due, at its price. Nothing that comes due closes a scene before you act in it.
 */
export function comeDue(t: Trip): { trip: Trip; due: Due[] } {
  const h = t.hand;
  if (!h?.lasting) return { trip: t, due: [] };
  const l = copyLasting(h.lasting);
  let sheet = copySheet(t.sheet);
  const due: Due[] = [];
  const charge = (c: Change | undefined): Loss[] => {
    if (!c || c.due === null) return [];
    c.due = null;
    const paid = pay(sheet, c.costs, CATCH_COST[c.size]);
    sheet = paid.sheet;
    return paid.losses;
  };
  for (const c of l.company) {
    if (c.gone) continue;
    const st = l.people[keyOf(l, c.name)]?.standing ?? 0;
    if (st >= STAYS_AT) continue;
    c.gone = st <= STANDING_MIN ? "turned" : "left";
    const change = l.changes.find((x) => x.id === c.change);
    due.push({ change: change ?? null, losses: charge(change), closed: c.gone === "turned" ? 1 : 0, goes: c, how: c.gone });
  }
  for (const c of l.changes) if (c.due !== null && c.due <= h.scene) due.push({ change: c, closed: CATCH_GRIP[c.size], losses: charge(c), goes: null });
  if (!due.length) return { trip: t, due };
  const grip = Math.min(GRIP_MAX - 1, h.grip + due.reduce((n, d) => n + d.closed, 0));
  return { trip: overClock({ ...t, sheet, hand: { ...h, grip, lasting: l } }), due };
}

/** Come to the scene in play (hand.ts, `enterScene`), and whatever is due there comes due. */
export function enterDue(t: Trip): (Entered & { due: Due[] }) | null {
  const e = enterScene(t);
  if (!e) return null;
  const { trip, due } = comeDue(e.trip);
  return { ...e, trip, due };
}

/* ------------------------------ walking away ------------------------------ */

export interface Walked {
  trip: Trip;
  scene: Scene;
  last: boolean;
  /** How far the next scene starts closed on you. */
  follows: number;
}

/**
 * Walk away from the scene in play. It is left undone and goes the other side's way: what it would have taken from you
 * is not taken, but what it was for is lost, it leaves you nothing, and all that had closed on you follows you, and a
 * step more. Walking away from the last scene gives up the story.
 */
export function walkAway(t: Trip): Walked | null {
  const h = t.hand;
  const scene = sceneNow(t);
  if (!h || !scene || t.over || !h.opened) return null;
  const last = lastScene(t);
  const lost = [...h.lost, `You walked away from ${scene.name}, and this was never done: ${scene.through}`];
  if (last) return { trip: { ...t, over: "taken", hand: { ...h, lost, walked: true } }, scene, last, follows: 0 };
  const follows = Math.min(GRIP_MAX - 1, h.grip + WALK_GRIP);
  return { trip: overClock({ ...t, hand: { ...h, scene: h.scene + 1, through: 0, grip: follows, used: [], lost, opened: false } }), scene, last, follows };
}

/* ------------------------------ scenes written again ------------------------------ */

/** The scenes not yet come to, which may still be written again to fit what has become true. */
export const scenesAhead = (t: Pick<Trip, "hand">): number => (t.hand ? (t.hand.opened ? t.hand.scene + 1 : t.hand.scene) : 0);

/**
 * Scenes written again to fit what is now true, put in the story in place of the ones not yet come to. Each keeps its
 * id, its name (the map has it), and its difficulty: only who and what is in it changes, never how hard it is. A scene
 * already come to, or one the new writing does not have, stays as it was.
 */
export function reviseTrip(t: Trip, scenes: readonly Scene[]): Trip {
  const story = t.adv.scenes;
  if (!story || !t.hand) return t;
  const from = scenesAhead(t);
  const next = story.scenes.map((s, i) => {
    const r = i >= from ? scenes.find((x) => x.id === s.id) : undefined;
    return r ? { ...r, id: s.id, name: s.name, difficulty: s.difficulty, things: r.things.map((x, j) => ({ id: `${s.id}-t${j + 1}`, name: x.name })) } : s;
  });
  const n = next.length;
  const stops = t.adv.stops.map((st) => {
    const i = next.findIndex((s) => s.id === st.id);
    return i >= from && next[i] !== story.scenes[i] ? sceneStop(next[i]!, i === n - 1) : st;
  });
  return { ...t, adv: { ...t.adv, scenes: { ...story, scenes: next }, stops } };
}

/* ------------------------------ what stands, for anything else that wants to know ------------------------------ */

export interface Stands {
  /** Who goes with the hero now: what they are, how they stand with the hero, what came with them and whether it is still to come. */
  with: { name: string; who: string; standing: number; said: string; catch: string; owed: boolean }[];
  /** Everyone the hero has done something with, and how they stand with the hero (-2 set against, 2 bound). */
  people: { name: string; standing: number }[];
  /** What tries have won that is still true, in the story's words, and who has been set against the hero. */
  changes: { kind: Change["kind"]; who: string; said: string; form: Change["form"]; story?: string }[];
  /** Who went with the hero for a while and has gone. */
  gone: { name: string; how: "left" | "turned" }[];
}

/**
 * Who is with the hero and what now stands between the hero and the people they have met, as plain records: the one
 * thing another part of the game (a later story, a book of what happened) should read to know it.
 */
export function whatStands(t: Pick<Trip, "hand">): Stands {
  const l = lastingOf(t.hand);
  const standing = (name: string): number => l.people[keyOf(l, name)]?.standing ?? 0;
  return {
    with: l.company.filter((c) => !c.gone).map((c) => {
      const ch = l.changes.find((x) => x.id === c.change);
      return { name: c.name, who: c.who, standing: standing(c.name), said: ch?.said ?? "", catch: ch?.catch ?? "", owed: ch?.due !== null && ch?.due !== undefined };
    }),
    people: Object.values(l.people).map((p) => ({ ...p })),
    changes: l.changes.filter((c) => !(c.kind === "join" && l.company.some((x) => x.change === c.id && x.gone))).map((c) => ({ kind: c.kind, who: c.who, said: c.said, form: c.form, ...(c.story ? { story: c.story } : {}) })),
    gone: l.company.filter((c) => c.gone).map((c) => ({ name: c.name, how: c.gone! })),
  };
}

/* ------------------------------ from one story to the next ------------------------------ */

/** Someone who goes with you, kept from one story to the next, with what came with them if it has not yet come due. */
export interface Carried {
  name: string;
  who: string;
  standing: number;
  said: string;
  catch: string;
  costs: CostKind;
  size: AskSize;
  /** What came with them is still to come due: at the first scene of the next story. */
  owed: boolean;
  story?: string;
}

/** Who still goes with you at the end of a story, to be with you in the next. */
export function companyKept(t: Pick<Trip, "hand">): Carried[] {
  const l = lastingOf(t.hand);
  return l.company.filter((c) => !c.gone).map((c) => {
    const ch = l.changes.find((x) => x.id === c.change);
    // A catch not yet come due (won at the last scene) comes due in the next story.
    return { name: c.name, who: c.who, standing: l.people[keyOf(l, c.name)]?.standing ?? STAYS_AT, said: ch?.said ?? `${c.name} goes with you.`, catch: ch?.catch ?? "", costs: ch?.costs ?? "goodwill", size: ch?.size ?? "small", owed: !!ch && ch.due !== null && !!ch.catch, ...(ch?.story ? { story: ch.story } : {}) };
  });
}

/** A new story begun with the company kept from the last: with you from its first scene, as they stood. */
export function withCompany(t: Trip, carried: readonly Carried[]): Trip {
  if (!t.hand || !carried.length) return t;
  const l = copyLasting(lastingOf(t.hand));
  for (const c of carried) {
    const change: Change = { id: `c${++l.n}`, kind: "join", who: c.name, said: c.said, form: "full", size: c.size, catch: c.catch, costs: c.costs, scene: -1, ...(c.story ? { story: c.story } : {}), due: c.owed && c.catch ? 0 : null };
    l.changes.push(change);
    l.company.push({ id: `w${++l.n}`, name: c.name, who: c.who, change: change.id });
    l.people[nameKey(c.name)] = { name: c.name, standing: clampStanding(c.standing) };
  }
  return { ...t, hand: { ...t.hand, lasting: l } };
}
