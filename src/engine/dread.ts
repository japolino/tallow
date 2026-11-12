/**
 * The narrator's side (docs/SYSTEMS.md, 5): dread, its moves, and temptation.
 *
 * Dread. A try that works at a cost, or fails, puts a black stone in the narrator's bowl (two for a try that goes
 * badly wrong). When you come to a place and there are DREAD_SPEND stones in it, the narrator takes them out and makes
 * one of its moves there. So a failure is never only a cost now: it comes back later.
 *
 * The moves are a short fixed list. Code says which can happen here (never one that cannot, or that would finish you)
 * and a model chooses among them from the scene (who is here, what they would do); the seeded pick by weight is only
 * the fallback when no model answers. The model then tells it.
 *
 * Temptation. Once or twice a story, the narrator offers you your calling's fault: let it have its way here, and you
 * take back 1 of your store, but the fault makes things worse at this place (a move, with no dread spent).
 *
 * Pure: a trip in, a trip out. Seeded, so the same story played the same way gives the same moves.
 */
import { storeAt } from "./abilities.js";
import { GOODWILL_MAX } from "./moment.js";
import { seededRng } from "./dice.js";
import { WAYS, type Against, type Lever, type Moment, type Sheet, type Tier, type Way } from "./moment.js";
import { throwSave, type Save } from "./save.js";
import type { Trip } from "./adventure.js";

/** Stones the narrator spends on a move. */
export const DREAD_SPEND = 3;
/** The most the bowl holds. */
export const DREAD_MAX = 9;
/** How many times a story the narrator offers you your fault. */
export const TEMPT_MAX = 2;
/** How likely the narrator is to offer it at a place, when it still may. */
export const TEMPT_CHANCE = 0.35;
/** The time a delay costs. */
export const DELAY_HOURS = 0.5;
/** The most marks against you at once. */
export const AGAINST_MAX = 2;

/** What the narrator writes on a slip against you, by the way it is against, when no model words it. */
export const AGAINST_NAME: Record<Way, string> = {
  talk: "word of you has gone ahead",
  sneak: "they are watching for you",
  force: "they are ready for you",
  pay: "they know how badly you need this",
};

/** The stones a try's result puts in the bowl. */
export const dreadFrom = (tier: Tier): number => (tier === "crit_fail" ? 2 : tier === "fail" || tier === "partial" ? 1 : 0);

export type MoveKind = "trouble" | "shut" | "delay" | "hurt" | "spoil" | "sour" | "cold" | "brand";

/** A move of the narrator's, as code picked it: what it is, and what it touches. */
export interface Move {
  kind: MoveKind;
  /** The way shut ("shut"). */
  way?: Way;
  /** The thing here made no use ("spoil"), or the mark you carried that is lost ("sour"). */
  lever?: Lever;
  /** The mark against you the narrator writes ("brand"). */
  against?: Against;
  /** The save you threw to keep it off you ("hurt"). Kept, the move does nothing. */
  save?: Save;
}

/** How likely each move is at each kind of place: people turn cold and shut doors, things delay and hurt. */
const WEIGHT: Record<"person" | "obstacle" | "fight", Record<MoveKind, number>> = {
  person: { trouble: 2, shut: 2, cold: 2, brand: 1.5, spoil: 1, sour: 1, delay: 1, hurt: 0.5 },
  obstacle: { trouble: 2, delay: 2, hurt: 1.5, brand: 1, spoil: 1, shut: 1, sour: 0.5, cold: 0 },
  fight: { trouble: 2, hurt: 2, brand: 1.5, delay: 1, spoil: 1, shut: 0, sour: 0.5, cold: 0.5 },
};

const openWays = (m: Moment): Way[] => WAYS.filter((w) => m.stop.ways[w] && !m.closed.includes(w));

/** The open ways here that no mark against you is on yet, easiest first: the one the narrator would mark. */
const unmarked = (t: Trip, m: Moment): Way[] => [...openWays(m)].filter((w) => !(t.against ?? []).some((a) => a.way === w)).sort((a, b) => m.stop.ways[a]!.difficulty - m.stop.ways[b]!.difficulty);

/** The things at this place you could still use: not what you carry, not your marks. */
function spoilable(t: Trip, m: Moment): Lever[] {
  return m.stop.levers.filter((l) => !l.mark && !t.kept.includes(l.id) && !m.spent.includes(l.id) && openWays(m).includes(l.way));
}

/** The moves that can happen at the place in your way now, each with its weight. Never one that would finish you. */
export function movesHere(t: Trip, allowed?: readonly MoveKind[]): [MoveKind, number][] {
  const f = t.facing;
  if (!f || t.over) return [];
  const m = f.moment;
  const s = t.sheet;
  const can: Record<MoveKind, boolean> = {
    trouble: m.trouble < 2,
    // A way is shut only while two others stay open.
    shut: openWays(m).length >= 3,
    delay: s.hour + DELAY_HOURS < t.adv.deadline.hour - 1,
    hurt: s.health >= 3,
    spoil: spoilable(t, m).length > 0,
    sour: t.marks.length > 0,
    cold: s.goodwill >= 1,
    brand: (t.against ?? []).length < AGAINST_MAX && unmarked(t, m).length > 0,
  };
  const w = WEIGHT[f.stop.kind] ?? WEIGHT.obstacle;
  return (Object.keys(can) as MoveKind[]).filter((k) => can[k] && w[k] > 0 && (!allowed || allowed.includes(k))).map((k) => [k, w[k]]);
}

/** What each move is, for a model choosing one from the scene. */
export const MOVE_SAID: Record<MoveKind, string> = {
  trouble: "trouble: things here get worse; what stands here grows harder to get past",
  shut: "shut: one way past is closed off here (the easiest still open)",
  delay: "delay: something holds the player up and costs them time",
  hurt: "hurt: something here hurts the player, unless they save against it",
  spoil: "spoil: a thing here they could have used is lost, broken or taken",
  sour: "sour: a mark they earned earlier turns out to be no good here",
  cold: "cold: word of them goes round and people think less of them",
  brand: "brand: those here are warned, and ready for one way the player might try",
};

/**
 * A move for the place in your way: the kind a model chose from the scene, when it is one that can happen here, else
 * one picked by weight, seeded. What it touches (which way, which thing) is code's. Null when none can happen.
 */
export function pickMove(t: Trip, salt: string, allowed?: readonly MoveKind[], chosen?: MoveKind | null): Move | null {
  const f = t.facing;
  const options = movesHere(t, allowed);
  if (!f || !options.length) return null;
  const rng = seededRng(`${t.seed}:dread:${f.stop.id}:${salt}`);
  let r = rng() * options.reduce((n, [, w]) => n + w, 0);
  let kind = options[0]![0];
  for (const [k, w] of options) {
    if ((r -= w) <= 0) {
      kind = k;
      break;
    }
  }
  if (chosen && options.some(([k]) => k === chosen)) kind = chosen;
  const m = f.moment;
  if (kind === "shut") {
    // The way the narrator shuts is the one you would most like: the easiest still open.
    const way = [...openWays(m)].sort((a, b) => m.stop.ways[a]!.difficulty - m.stop.ways[b]!.difficulty)[0]!;
    return { kind, way };
  }
  if (kind === "spoil") {
    const all = spoilable(t, m);
    return { kind, lever: all[Math.floor(rng() * all.length)]! };
  }
  if (kind === "sour") return { kind, lever: t.marks[0]! };
  if (kind === "brand") {
    // Against the way you would most like here: the easiest one still open and not already marked.
    const way = unmarked(t, m)[0]!;
    return { kind, against: { id: `against:${f.stop.id}:${salt}`, way, name: AGAINST_NAME[way] } };
  }
  if (kind === "hurt") return { kind, save: throwSave(m.sheet, ["brawn", "wits"], `${t.seed}:hurt:${f.stop.id}:${salt}`) };
  return { kind };
}

/** A trip with the moment in your way changed, and its sheet kept in step with the trip's own. */
function withMoment(t: Trip, change: (m: Moment) => Moment, sheet?: (s: Sheet) => Sheet): Trip {
  const f = t.facing!;
  const m = change(f.moment);
  if (!sheet) return { ...t, facing: { ...f, moment: m } };
  return { ...t, sheet: sheet({ ...t.sheet, stats: { ...t.sheet.stats } }), facing: { ...f, moment: { ...m, sheet: sheet({ ...m.sheet, stats: { ...m.sheet.stats } }) } } };
}

/** Make a move at the place in your way. */
export function applyMove(t: Trip, mv: Move): Trip {
  if (!t.facing) return t;
  switch (mv.kind) {
    case "trouble":
      return withMoment(t, (m) => ({ ...m, trouble: m.trouble + 1 }));
    case "shut":
      return withMoment(t, (m) => ({ ...m, closed: m.closed.includes(mv.way!) ? m.closed : [...m.closed, mv.way!] }));
    case "delay":
      return withMoment(t, (m) => m, (s) => ({ ...s, hour: s.hour + DELAY_HOURS }));
    case "hurt":
      // Kept off by a save, it does nothing.
      if (mv.save?.kept) return t;
      return withMoment(t, (m) => m, (s) => ({ ...s, health: Math.max(1, s.health - 1) }));
    case "brand": {
      const a = mv.against!;
      return withMoment({ ...t, against: [...(t.against ?? []), a] }, (m) => ({ ...m, against: [...(m.against ?? []), a] }));
    }
    case "cold":
      return withMoment(t, (m) => m, (s) => ({ ...s, goodwill: Math.max(0, Math.min(GOODWILL_MAX, s.goodwill - 1)) }));
    case "spoil": {
      const l = mv.lever!;
      return withMoment(t, (m) => ({ ...m, spent: [...m.spent, ...Array.from({ length: l.uses ?? 1 }, () => l.id)] }));
    }
    case "sour": {
      const l = mv.lever!;
      const gone = { ...t, marks: t.marks.filter((x) => x.id !== l.id) };
      return withMoment(gone, (m) => ({ ...m, stop: { ...m.stop, levers: m.stop.levers.filter((x) => x.id !== l.id) } }));
    }
  }
}

export interface NarratorTurn {
  trip: Trip;
  move: Move;
  /** Stones taken out of the bowl. */
  spent: number;
}

/** On coming to a place: if the bowl holds enough, the narrator takes the stones out and makes a move here. */
export function narratorTurn(t: Trip, chosen?: MoveKind | null): NarratorTurn | null {
  if ((t.dread ?? 0) < DREAD_SPEND || !t.facing || t.over) return null;
  const move = pickMove(t, `turn:${t.visited.length}:${t.dread}`, undefined, chosen);
  if (!move) return null;
  return { trip: { ...applyMove(t, move), dread: (t.dread ?? 0) - DREAD_SPEND }, move, spent: DREAD_SPEND };
}

/** Whether the narrator offers your fault at the place in your way: not at the last one, not when your store is full. */
export function tempting(t: Trip, fault: string | undefined): boolean {
  const f = t.facing;
  if (!f || t.over || !fault || f.stop.climax) return false;
  if ((t.tempted ?? 0) >= TEMPT_MAX || (t.sheet.store ?? 0) >= storeAt(t.level)) return false;
  if (!movesHere(t, TEMPT_MOVES).length) return false;
  return seededRng(`${t.seed}:tempt:${f.stop.id}`)() < TEMPT_CHANCE;
}

/** What a fault can do when you let it have its way: shut a door, make things worse, sour someone, cost you time. */
export const TEMPT_MOVES: readonly MoveKind[] = ["shut", "trouble", "cold", "delay", "brand"];

export interface GaveIn {
  trip: Trip;
  move: Move;
}

/** You let your fault have its way here: 1 back to your store, and the fault makes things worse at this place. */
export function giveIn(t: Trip, chosen?: MoveKind | null): GaveIn | null {
  const move = pickMove(t, `tempt:${t.tempted ?? 0}`, TEMPT_MOVES, chosen);
  if (!move) return null;
  const moved = applyMove(t, move);
  const store = Math.min(storeAt(t.level), (moved.sheet.store ?? 0) + 1);
  const trip = withMoment({ ...moved, tempted: (t.tempted ?? 0) + 1 }, (m) => m, (s) => ({ ...s, store }));
  return { trip, move };
}

/** You did not: the offer is spent all the same, so it is not made again here. */
export const refuse = (t: Trip): Trip => ({ ...t, tempted: (t.tempted ?? 0) + 1 });
