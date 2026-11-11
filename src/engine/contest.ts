/**
 * Contests (docs/SYSTEMS.md, 6): any back-and-forth, played on a dark leather cloth the narrator unrolls over the map.
 * A fight, an argument before a crowd, a chase or a climb against the clock: the same rules, only the words change.
 *
 * Every stop that takes more than one good try is a contest. Who you are up against are dials: wooden rings with a
 * notch for every bit of them still standing. A try that works puts notches on a dial; fill them all and you have won.
 * Each round the narrator first shows what is coming at you. A try that works keeps it off you; one that costs you or
 * fails, and it lands on your own dial. Fill that, and you are taken out. A danger is a dial too, that fills a notch
 * every round on its own; when it is full, it is here. You may give in at any round.
 *
 * Code decides every number. A model may name the foes and the danger and say what is coming, and nothing more.
 * Pure: a contest in, a contest out.
 */
import { cardKind } from "./cards.js";
import type { Grade, Stat, Stop, Tier } from "./moment.js";
import type { Save } from "./save.js";
import { costByPosition, EFFECT_NOTCHES, type Effect, type Foe, type Position } from "./effect.js";

export type ContestKind = "fight" | "words" | "struggle";

/** A wooden ring with `notches` notches, `filled` of them marked. */
export interface Dial {
  id: string;
  name: string;
  notches: number;
  filled: number;
  /** A foe breaks (runs, gives up, withdraws) once this many notches are filled: docs/MOONSHOT.md, 2.5. All of them when not said. */
  breaksAt?: number;
}

export interface Contest {
  kind: ContestKind;
  /** Who you are up against, each a dial. A foe is beaten when its dial is full. */
  foes: Dial[];
  /** Something coming, that fills a notch every round: null when there is none, or it has come. */
  danger: Dial | null;
  /** How much you can take. Full, and you are taken out. */
  you: Dial;
  /** Rounds played. */
  round: number;
}

/** Notches on your own dial at an ordinary contest: four blows and you are taken out. A longer contest gives you as many as all the foes have together. */
export const YOU_NOTCHES = 4;
/** A danger's dial is this much longer than all the foes' together, so a contest fought well is over before it comes. */
export const DANGER_MORE = 1;
/** The most foes on the leather. */
export const FOES_MAX = 2;
/** The longest a foe's or a danger's name is kept, in letters. */
const NAME_MAX = 40;

/** Whether a stop is played as a contest: when it takes more than one good try. */
export const isContest = (s: Pick<Stop, "kind"> & { holds?: number }): boolean => (s.holds ?? 1) > 1;

/** What kind of back-and-forth a stop is: a fight, a war of words with a person, or a struggle with a thing. */
export const contestKind = (s: Pick<Stop, "kind">): ContestKind => (s.kind === "fight" ? "fight" : s.kind === "person" ? "words" : "struggle");

/** The stat a save against the danger arriving leans on: holding your ground, keeping your head before a crowd, or your wits. */
export const DANGER_SAVE: Record<ContestKind, Stat[]> = { fight: ["brawn", "wits"], words: ["charm", "wits"], struggle: ["wits", "brawn"] };

const DANGER: Record<ContestKind, string> = { fight: "more of them coming", words: "the room turning against you", struggle: "time running out" };
const YOU: Record<ContestKind, string> = { fight: "how much you can take", words: "your nerve", struggle: "your strength" };

/** Who you are up against when no model names them: what the stop's card shows, or, in a war of words at a place, its people. */
function foeFallback(s: Pick<Stop, "kind"> & { card?: string; name: string }): string {
  const k = s.card ? cardKind(s.card) : null;
  if (s.kind === "person" && k?.family !== "person") return "the people here";
  if (s.kind === "fight" && k?.family === "place") return "the ones who hold it";
  return k ? `the ${k.title.replace(/^the\s+/i, "").toLowerCase()}` : s.name;
}

/** A name fit to write on a slip: one line, no quotes, not too long. */
function cleanName(s: unknown): string {
  if (typeof s !== "string") return "";
  const t = s.replace(/["“”*_#`]/g, "").replace(/\s+/g, " ").trim().replace(/[.!,;:]+$/, "");
  return t.length > NAME_MAX ? t.slice(0, NAME_MAX).replace(/\s+\S*$/, "") : t;
}

/** Names for a contest, written by a model: up to two foes, and a danger. Anything missing or unfit is left to code. */
export interface ContestNames {
  foes?: unknown;
  danger?: unknown;
}

/**
 * Set out a contest for a stop. The foes' dials hold two notches for every good try the stop takes, shared out when
 * there are two foes (the second always 2). The danger fills one notch a round.
 */
export function startContest(stop: Pick<Stop, "kind" | "name"> & { card?: string; holds?: number; foe?: Foe }, names: ContestNames = {}): Contest {
  const kind = contestKind(stop);
  const total = 2 * Math.max(2, stop.holds ?? 2);
  const base: Contest = {
    kind,
    foes: foeDials([foeFallback(stop)], total, stop.foe?.breaks),
    danger: { id: "danger", name: DANGER[kind], notches: total + DANGER_MORE, filled: 0 },
    you: { id: "you", name: YOU[kind], notches: Math.max(YOU_NOTCHES, total), filled: 0 },
    round: 0,
  };
  return renamed(base, names);
}

/** Up to two foes' names, cleaned, with no two the same. */
function foeNames(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : []).map(cleanName).filter((n, i, all) => n.length >= 2 && all.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i).slice(0, FOES_MAX);
}

/** Foes' dials sharing `total` notches: the second, when there is one, always 2. A foe that breaks early breaks at its share. */
function foeDials(names: string[], total: number, breaks?: number): Dial[] {
  const share = names.length > 1 ? [total - 2, 2] : [total];
  return names.map((name, i) => {
    const notches = share[i]!;
    const at = breaks && breaks > 0 && breaks < 1 ? Math.max(1, Math.ceil(notches * breaks)) : 0;
    return { id: `foe${i}`, name, notches, filled: 0, ...(at && at < notches ? { breaksAt: at } : {}) };
  });
}

/** The same contest with the names a model wrote, before the first round. How many notches there are never changes. */
export function renamed(c: Contest, names: ContestNames): Contest {
  if (c.round) return c;
  const given = foeNames(names.foes);
  const danger = cleanName(names.danger);
  return {
    ...c,
    foes: given.length ? foeDials(given, c.foes.reduce((n, f) => n + f.notches, 0), breakShare(c.foes[0])) : c.foes,
    danger: c.danger && danger.length >= 3 ? { ...c.danger, name: danger } : c.danger,
  };
}

/** The share of its dial at which a foe breaks, read back from the dial. */
const breakShare = (d: Dial | undefined): number | undefined => (d?.breaksAt ? d.breaksAt / d.notches : undefined);

/** Whether a foe is done: its dial full, or filled as far as it breaks. */
export const beatenDial = (f: Dial): boolean => f.filled >= (f.breaksAt ?? f.notches);

/** The foes still standing. */
export const standing = (c: Contest): Dial[] => c.foes.filter((f) => !beatenDial(f));

/** The foe whose blow is coming this round: the one with the most left in it. */
export function coming(c: Contest): Dial | null {
  return [...standing(c)].sort((a, b) => b.notches - b.filled - (a.notches - a.filled))[0] ?? null;
}

const nameWords = (s: string): string[] => s.toLowerCase().split(/[^\p{L}']+/u).filter((w) => w.length >= 3 && !/^(the|and|his|her|their|its|one|two|with|from)$/.test(w));

/** Which standing foe a line goes for, by a word of its name; null when it names none of them. */
export function foeNamed(line: string, c: Contest): string | null {
  const said = new Set(nameWords(line));
  const hits = standing(c).map((f) => ({ f, n: nameWords(f.name).filter((w) => said.has(w)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  return hits[0]?.f.id ?? null;
}

/**
 * Notches a try puts on a dial: 2 when it works, at a cost or not (a cost is the blow landing, not fewer notches); 3
 * when it goes better than hoped; one more when its line used what was there; none when it failed.
 */
export function notchesFor(tier: Tier, grade?: Grade, effect?: Effect): number {
  if (effect === "none") return 0;
  const works = tier === "crit_success" || tier === "success" || tier === "partial";
  // With an effect (effect.ts), a try that works puts on what its effect allows; the effect already counts a 20.
  const base = !works ? 0 : effect ? EFFECT_NOTCHES[effect] : tier === "crit_success" ? 3 : 2;
  return base && (grade === "grounded" || grade === "inspired") ? base + 1 : base;
}

/** Notches the blow coming at you puts on your dial: none if the try worked, one if it cost you or failed, two if it went badly wrong; lighter when controlled, worse when desperate. */
export const blowFor = (tier: Tier, position: Position = "risky"): number => costByPosition(tier === "crit_fail" ? 2 : tier === "partial" || tier === "fail" ? 1 : 0, tier, position);

/** What a round came to. */
export interface Round {
  /** The foe the try went for. */
  target: Dial;
  /** Notches put on foes' dials (what was more than the target had left goes on to the next one). */
  hit: number;
  /** Each dial notched, as it stands after, with how many went on it. */
  hits: (Dial & { n: number })[];
  /** Foes beaten this round. */
  beaten: Dial[];
  /** Notches the blow put on your dial. */
  landed: number;
  /** The danger ticked on (its dial as it stands), and whether it came; when it came, the save you threw against it. */
  danger: { dial: Dial; came: boolean; save?: Save } | null;
  /** Every foe is beaten. */
  won: boolean;
  /** Your dial is full: you are taken out. */
  taken: boolean;
}

/**
 * Play a round: the try's result put on the dials, the blow, and the danger. `target` is a foe's id, or null for the
 * one coming. `save` is the save thrown against the danger, used only if it arrives this round: kept, it puts no notch
 * on your dial.
 */
/** Fight verbs played on a try (abilities.ts, docs/MOONSHOT.md, 7.4). */
export interface Moves {
  /** Out of their reach: the blow back is one lighter. */
  reach?: boolean;
  /** The next blow does not come. */
  bind?: boolean;
  /** What the try does goes on every foe. */
  sweep?: boolean;
  /** What the try takes off them comes back off your dial. */
  drain?: boolean;
}

export function playRound(c: Contest, tier: Tier, grade: Grade | undefined, target: string | null = null, save?: Save, effect?: Effect, position: Position = "risky", moves: Moves = {}): { contest: Contest; round: Round } {
  const foes = c.foes.map((f) => ({ ...f }));
  const up = foes.filter((f) => !beatenDial(f));
  const first = up.find((f) => f.id === target) ?? up.find((f) => f.id === coming(c)?.id) ?? up[0] ?? foes[0]!;
  // The try goes at its target first; whatever is more than it had left goes on to the others.
  const each = notchesFor(tier, grade, effect);
  let left = each;
  let hit = 0;
  const beaten: Dial[] = [];
  const hits: Round["hits"] = [];
  for (const f of [first, ...up.filter((x) => x !== first)]) {
    // A sweep puts the whole of it on every foe; otherwise what is more than the target had left goes on to the next.
    if (moves.sweep) left = each;
    if (!left) break;
    const n = Math.min(left, (f.breaksAt ?? f.notches) - f.filled);
    f.filled += n;
    left -= n;
    hit += n;
    if (n) hits.push({ ...f, n });
    if (n && beatenDial(f)) beaten.push({ ...f });
  }
  let landed = moves.bind ? 0 : Math.max(0, blowFor(tier, position) - (moves.reach ? 1 : 0));
  let danger: Round["danger"] = null;
  let nextDanger: Dial | null = c.danger;
  const won = foes.every(beatenDial);
  if (c.danger && !won) {
    const d = { ...c.danger, filled: Math.min(c.danger.notches, c.danger.filled + 1) };
    const came = d.filled >= d.notches;
    if (came && !save?.kept) landed += 1;
    danger = { dial: d, came, ...(came && save ? { save } : {}) };
    nextDanger = came ? null : d;
  }
  const drained = moves.drain ? Math.min(hit, c.you.filled) : 0;
  const you = { ...c.you, filled: Math.max(0, Math.min(c.you.notches, c.you.filled - drained + (won ? 0 : landed))) };
  const taken = !won && you.filled >= you.notches;
  return {
    contest: { ...c, foes, danger: nextDanger, you, round: c.round + 1 },
    round: { target: { ...first }, hit, hits, beaten, landed: won ? 0 : landed, danger, won, taken },
  };
}

/** Whether a line gives in, by its words. A line that only talks of someone else giving in does not. */
export function yieldRead(line: string): boolean {
  const l = ` ${line.toLowerCase().replace(/[’]/g, "'")} `;
  if (/\b(won't|will not|never|don't|do not|refuse to|not)\s+(give in|give up|yield|surrender|back down)\b/.test(l)) return false;
  return /\b(i|we)\s+(give in|give up|yield|surrender|concede|submit|back down|stand down|throw in the towel)\b/.test(l) || /^\s*(give in|give up|yield|surrender|i'm done|enough|i quit)\b/.test(l);
}
