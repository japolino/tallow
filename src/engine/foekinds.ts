/**
 * How foes move (docs/COMBAT.md, 5 and 11.4): each kind has a way of choosing whom to go for, where to stand, and what
 * to chalk. A foe moves in the open and shows its blow before it lands, so the board can be read and answered: step
 * out of the chalk, put something between you, knock it down before it swings. Pure and deterministic; no dice here.
 */
import type { Battle, Intent, Piece, Rail, WeaponKind } from "./battle.js";
import { alliesOf, clearShot, foesOf, has, holding, inCharm, movesFor, standing, stateOf } from "./battle.js";
import { covered, dist, key, line, onEdge, onMat, open, same, sees, type Pos } from "./grid.js";

export type FoeKind = "brute" | "shooter" | "swarm" | "skirmisher" | "caster" | "guardian" | "leader" | "pack" | "lurker" | "ensnarer" | "charmer" | "captor" | "flock";
export const FOE_KIND_IDS: readonly FoeKind[] = ["brute", "shooter", "swarm", "skirmisher", "caster", "guardian", "leader", "pack", "lurker", "ensnarer", "charmer", "captor", "flock"];
export type Rank = "minion" | "soldier" | "elite" | "boss";
export const RANK_IDS: readonly Rank[] = ["minion", "soldier", "elite", "boss"];
/** The figure a kind stands as on the mat (7). */
export type Shape = "humanoid" | "big" | "beast" | "swarm" | "caster" | "flyer";

export interface KindData {
  armor: number;
  speed: number;
  weapon: WeaponKind;
  damage: number;
  /** What it does, in a line, for the router, the narrator and a "learn". */
  says: string;
  /** What comes off a charm that lands on it; added to its Poise. */
  will?: number;
  poise?: number;
  /** Its blows wear Composure, not Stamina. */
  rail?: Rail;
  /** Offered only where the content settings let it (11.5): a charmer's heat, a captor's or an ensnarer's hold. */
  gate?: "charm" | "restraint";
  /** The letter its pieces go by, and a plain name by rank when the world names none. */
  letter: string;
  names: Record<Rank, string>;
  shape: Shape;
  /** What a minion of it is called, when one is summoned. */
  pawn?: string;
}

/** What a kind carries and how it moves, before its rank is added. */
export const FOE_KINDS: Record<FoeKind, KindData> = {
  brute: { armor: 1, speed: 4, weapon: "heavy", damage: 3, letter: "b", shape: "big", says: "goes for whoever hurt it last; charges across open ground; cleaves when two of you stand together", names: { minion: "Thug", soldier: "Brute", elite: "Ogre", boss: "Warlord" } },
  shooter: { armor: 0, speed: 3, weapon: "ranged", damage: 2, letter: "a", shape: "humanoid", says: "keeps its distance and a clear line; backs off when you close; picks whoever stands in the open", names: { minion: "Slinger", soldier: "Archer", elite: "Marksman", boss: "Huntmaster" } },
  swarm: { armor: 0, speed: 5, weapon: "light", damage: 1, letter: "w", shape: "swarm", pawn: "spawn", says: "fast and weak; comes for the nearest and gets round them", names: { minion: "Rat", soldier: "Hound", elite: "Stalker", boss: "Brood-mother" } },
  skirmisher: { armor: 0, speed: 5, weapon: "blade", damage: 2, letter: "k", shape: "humanoid", says: "goes for whoever is already engaged, from the flank; hits and backs off", names: { minion: "Cutpurse", soldier: "Skirmisher", elite: "Duelist", boss: "Blademaster" } },
  caster: { armor: 0, speed: 4, weapon: "ranged", damage: 2, letter: "c", shape: "caster", will: 1, says: "keeps behind its own; blasts where two of you stand close; hexes the rest; calls help when hurt", names: { minion: "Acolyte", soldier: "Hexer", elite: "Sorcerer", boss: "Archmage" } },
  guardian: { armor: 2, speed: 3, weapon: "blade", damage: 2, letter: "g", shape: "big", will: 1, says: "stands between you and the one it guards; strikes whoever comes close", names: { minion: "Shieldbearer", soldier: "Guardian", elite: "Sentinel", boss: "Bulwark" } },
  leader: { armor: 1, speed: 4, weapon: "ranged", damage: 2, letter: "l", shape: "humanoid", will: 1, poise: 1, says: "stays back, rallies its own, and runs when hurt; the side breaks when it falls", names: { minion: "Sergeant", soldier: "Captain", elite: "Commander", boss: "Overlord" } },
  pack: { armor: 0, speed: 5, weapon: "blade", damage: 2, letter: "p", shape: "beast", says: "goes for whoever stands alone; pounces from three tiles and knocks you down", names: { minion: "Jackal", soldier: "Wolf", elite: "Dire wolf", boss: "Pack-lord" } },
  lurker: { armor: 0, speed: 4, weapon: "blade", damage: 2, letter: "u", shape: "humanoid", says: "hides, comes out behind the shooters and the hurt, and strikes unseen", names: { minion: "Sneak", soldier: "Lurker", elite: "Assassin", boss: "Nightmare" } },
  ensnarer: { armor: 1, speed: 3, weapon: "light", damage: 2, letter: "e", shape: "big", gate: "restraint", says: "slow; webs or coils whoever is alone, then squeezes, a rung tighter each round", names: { minion: "Creeper", soldier: "Ensnarer", elite: "Coil-queen", boss: "Matriarch" } },
  charmer: { armor: 0, speed: 4, weapon: "light", damage: 2, letter: "m", shape: "humanoid", rail: "composure", will: 1, poise: 2, gate: "charm", says: "keeps two to four tiles off and works on whoever has the least Poise; a kiss up close", names: { minion: "Tempter", soldier: "Charmer", elite: "Siren", boss: "Enchantress" } },
  captor: { armor: 1, speed: 4, weapon: "light", damage: 1, letter: "t", shape: "big", gate: "restraint", says: "grabs the hero first and makes for the edge with them; carried off is taken", names: { minion: "Snatcher", soldier: "Captor", elite: "Slaver", boss: "Warden" } },
  flock: { armor: 0, speed: 6, weapon: "light", damage: 1, letter: "f", shape: "flyer", says: "flies over everything at shooters and the light; leaves you flustered", names: { minion: "Harpy", soldier: "Raptor", elite: "Wyvern", boss: "Roc" } },
};

export interface FoePlan {
  path: Pos[];
  intent: Intent | null;
  /** How it goes: a flyer or a blink skips the ground. */
  style?: "walk" | "fly";
}

type Ways = Map<string, Pos[]>;
const stay = (p: Piece, intent: Intent | null = null): FoePlan => ({ path: [p.at], intent });
const strike = (p: Piece, t: Piece): Intent => ({ by: p.id, kind: "strike", tiles: [t.at], target: t.id });
const end = (w: Pos[]): Pos => w[w.length - 1]!;

/** The nearest of a list, by steps, then by Stamina left, then by id: always the same answer. */
function nearest(p: Pos, of: Piece[]): Piece | undefined {
  return [...of].sort((a, b) => dist(p, a.at) - dist(p, b.at) || a.stamina - b.stamina || a.id.localeCompare(b.id))[0];
}

/** Whom it may go for: the one who taunted it, else any of your side it can see (5.3). An enthralled foe turns on its own. */
export function marks(b: Battle, p: Piece): Piece[] {
  if (has(p, "enthralled")) return alliesOf(b, p);
  const taunt = stateOf(p, "taunted");
  const t = taunt?.by ? b.pieces.find((q) => q.id === taunt.by) : undefined;
  if (t && standing(t) && !has(t, "hidden")) return [t];
  return foesOf(b, p).filter((q) => !has(q, "hidden"));
}

/** The way to the tile that best suits `score` (lower is better), a shorter way winning a tie. */
function bestWay(ways: Ways, score: (at: Pos) => number): Pos[] | undefined {
  let best: Pos[] | undefined;
  let bestScore = Infinity;
  for (const way of ways.values()) {
    const s = score(end(way)) + way.length * 0.01;
    if (s < bestScore) {
      bestScore = s;
      best = way;
    }
  }
  return best;
}

const besideOf = (ways: Ways, t: Pos): Ways => new Map([...ways].filter(([, w]) => dist(end(w), t) === 1));

/** As close to `t` as it can get this turn, and nothing chalked. */
function approach(p: Piece, ways: Ways, t: Piece): FoePlan {
  return { path: bestWay(ways, (at) => dist(at, t.at)) ?? [p.at], intent: null };
}

/** The tiles a wide swing from `at` toward `t` covers: t's tile and the tiles beside it that `at` also touches. */
export function arc(at: Pos, t: Pos): Pos[] {
  const out: Pos[] = [t];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const q: Pos = [t[0] + dx, t[1] + dy];
      if (!same(q, t) && !same(q, at) && dist(q, at) === 1 && dist(q, t) === 1 && (dx === 0 || dy === 0)) out.push(q);
    }
  return out;
}

/** The chalk of a shot: the line to its mark and on past it, as far as it carries. */
function shotLine(b: Battle, from: Pos, to: Pos, range: number): Pos[] {
  const past = line(to, [2 * to[0] - from[0], 2 * to[1] - from[1]]).slice(1);
  return [...line(from, to), ...past].filter((q, i) => i === 0 || (onMat(b.mat, q) && dist(from, q) <= range));
}

/** A clear run along a line: nothing standing in it, nothing in the way. */
const clearRun = (b: Battle, from: Pos, to: Pos): boolean =>
  line(from, to)
    .slice(1, -1)
    .every((q) => open(b.mat, q) && !b.pieces.some((x) => standing(x) && same(x.at, q)));

/* ------------------------------ the brute ------------------------------ */

function brute(b: Battle, p: Piece, steps: number): FoePlan {
  const yours = marks(b, p);
  const last = yours.find((q) => q.id === p.hitBy);
  const t = last ?? nearest(p.at, yours);
  if (!t) return stay(p);
  const ways = movesFor(b, p, steps);
  // Where it could stand next to its mark: the nearest such tile.
  const beside = bestWay(besideOf(ways, t.at), () => 0);
  if (beside) {
    const at = end(beside);
    const swing = arc(at, t.at);
    const caught = yours.filter((q) => swing.some((s) => same(s, q.at)));
    const intent: Intent = caught.length >= 2 ? { by: p.id, kind: "cleave", tiles: swing, target: t.id } : strike(p, t);
    return { path: beside, intent };
  }
  // Too far to walk to: a charge, along a clear line, if the mark is within twice its move.
  const run = line(p.at, t.at);
  if (steps > 0 && run.length - 1 <= steps * 2 && clearRun(b, p.at, t.at)) return stay(p, { by: p.id, kind: "charge", tiles: run, target: t.id });
  return approach(p, ways, t);
}

/* ------------------------------ the shooter ------------------------------ */

function shooter(b: Battle, p: Piece, steps: number, kind: "shot" | "web" = "shot", range = p.weapon.range): FoePlan {
  const yours = marks(b, p);
  const all = foesOf(b, p);
  if (!yours.length) return stay(p);
  const ways = movesFor(b, p, steps);
  let best: { way: Pos[]; t: Piece; score: number } | undefined;
  for (const way of ways.values()) {
    const at = end(way);
    const close = Math.min(...all.map((q) => dist(q.at, at)));
    // Standing next to one of you spoils the shot; keep three tiles off when it can.
    const room = close <= 1 ? -6 : Math.min(close, 4) * 1.5;
    for (const t of yours) {
      const d = dist(at, t.at);
      if (d < 2 || d > range || !clearShot(b, at, t.at, t.id)) continue;
      const score = 10 + room - (covered(b.mat, at, t.at) ? 4 : 0) - t.stamina * 0.3 - way.length * 0.05;
      if (!best || score > best.score || (score === best.score && t.id < best.t.id)) best = { way, t, score };
    }
  }
  if (best) {
    const at = end(best.way);
    return { path: best.way, intent: { by: p.id, kind, tiles: shotLine(b, at, best.t.at, range), target: best.t.id } };
  }
  // No shot from anywhere it can reach: get nearer, but not into reach of a blade.
  const t = nearest(p.at, yours)!;
  return { path: bestWay(ways, (at) => (all.some((q) => dist(q.at, at) <= 1) ? 50 : 0) + dist(at, t.at)) ?? [p.at], intent: null };
}

/* ------------------------------ the swarm and the skirmisher ------------------------------ */

function swarm(b: Battle, p: Piece, steps: number, prefer?: (q: Piece) => number): FoePlan {
  const yours = marks(b, p);
  const t = prefer ? [...yours].sort((x, y) => prefer(x) - prefer(y) || dist(p.at, x.at) - dist(p.at, y.at) || x.id.localeCompare(y.id))[0] : nearest(p.at, yours);
  if (!t) return stay(p);
  const ways = movesFor(b, p, steps);
  const kin = alliesOf(b, p);
  // Next to the mark, on the far side from one of its own if it can (a flank), else anywhere beside it.
  const flankTiles = new Set(kin.filter((k) => dist(k.at, t.at) === 1).map((k) => key([2 * t.at[0] - k.at[0], 2 * t.at[1] - k.at[1]])));
  const way = bestWay(besideOf(ways, t.at), (at) => (flankTiles.has(key(at)) ? 0 : 1));
  if (way) return { path: way, intent: strike(p, t) };
  return approach(p, ways, t);
}

/** A skirmisher picks the one already engaged by its own (and leaves the rest), and backs off after (land does that). */
const skirmisher = (b: Battle, p: Piece, steps: number): FoePlan => swarm(b, p, steps, (q) => (alliesOf(b, p).some((k) => dist(k.at, q.at) === 1) ? 0 : 3) + dist(p.at, q.at) * 0.2);

/* ------------------------------ the caster ------------------------------ */

function caster(b: Battle, p: Piece, steps: number): FoePlan {
  const yours = marks(b, p);
  if (!yours.length) return stay(p);
  const ways = movesFor(b, p, steps, { through: true });
  const all = foesOf(b, p);
  // Hurt and alone: it calls up help, once.
  if (!p.summoned && p.stamina * 2 <= p.staminaMax) {
    const back = bestWay(ways, (at) => -Math.min(...all.map((q) => dist(q.at, at))));
    return { path: back ?? [p.at], intent: { by: p.id, kind: "summon", tiles: [], target: "" }, style: "fly" };
  }
  let best: { way: Pos[]; intent: Intent; score: number } | undefined;
  for (const way of ways.values()) {
    const at = end(way);
    const close = Math.min(...all.map((q) => dist(q.at, at)));
    if (close <= 1) continue;
    const room = Math.min(close, 4);
    for (const t of yours) {
      if (dist(at, t.at) > 5 || !sees(b.mat, at, t.at)) continue;
      const ring = [t.at, ...[-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => [t.at[0] + dx, t.at[1] + dy] as Pos))].filter((q, i, a) => a.findIndex((r) => same(r, q)) === i && onMat(b.mat, q));
      const caught = yours.filter((q) => ring.some((r) => same(r, q.at))).length;
      const intent: Intent = caught >= 2 ? { by: p.id, kind: "blast", tiles: ring, target: t.id } : { by: p.id, kind: "hex", tiles: [t.at], target: t.id };
      const score = room + caught * 3 - t.poise * 0.1 - way.length * 0.05;
      if (!best || score > best.score) best = { way, intent, score };
    }
  }
  if (best) return { path: best.way, intent: best.intent, style: "fly" };
  return { ...approach(p, ways, nearest(p.at, yours)!), style: "fly" };
}

/* ------------------------------ the guardian ------------------------------ */

function guardian(b: Battle, p: Piece, steps: number): FoePlan & { guard?: string } {
  const kin = alliesOf(b, p).filter((k) => k.kind !== "guardian");
  const yours = marks(b, p);
  const charge = [...kin].sort((x, y) => (y.leader ? 1 : 0) - (x.leader ? 1 : 0) || x.stamina / x.staminaMax - y.stamina / y.staminaMax || x.id.localeCompare(y.id))[0];
  if (!charge) return brute(b, p, steps);
  const threat = nearest(charge.at, yours);
  if (!threat) return stay(p);
  const ways = movesFor(b, p, steps);
  // Beside its charge, as near the threat as it can be: between them.
  const way = bestWay(besideOf(ways, charge.at), (at) => dist(at, threat.at)) ?? bestWay(ways, (at) => dist(at, charge.at));
  const at = way ? end(way) : p.at;
  const near = yours.filter((q) => dist(q.at, at) === 1).sort((x, y) => (x.id === threat.id ? -1 : y.id === threat.id ? 1 : x.id.localeCompare(y.id)))[0];
  return { path: way ?? [p.at], intent: near ? strike(p, near) : null, ...(dist(at, charge.at) === 1 ? { guard: charge.id } : {}) };
}

/* ------------------------------ the leader ------------------------------ */

function leader(b: Battle, p: Piece, steps: number): FoePlan {
  const shot = shooter(b, p, steps);
  if (shot.intent) return shot;
  const short = b.resolve !== undefined && b.resolveMax !== undefined && b.resolve < b.resolveMax;
  return { path: shot.path, intent: short ? { by: p.id, kind: "rally", tiles: [], target: "" } : null };
}

/* ------------------------------ the pack ------------------------------ */

function pack(b: Battle, p: Piece, steps: number): FoePlan {
  const yours = marks(b, p);
  // Whoever stands alone: fewest of their own within two.
  const alone = (q: Piece) => b.pieces.filter((x) => standing(x) && x.side === q.side && x.id !== q.id && dist(x.at, q.at) <= 2).length;
  const t = [...yours].sort((x, y) => alone(x) - alone(y) || dist(p.at, x.at) - dist(p.at, y.at) || x.id.localeCompare(y.id))[0];
  if (!t) return stay(p);
  if (dist(p.at, t.at) >= 2 && dist(p.at, t.at) <= 3 && clearRun(b, p.at, t.at) && steps > 0) return stay(p, { by: p.id, kind: "pounce", tiles: line(p.at, t.at), target: t.id });
  return swarm(b, p, steps, (q) => (q.id === t.id ? 0 : 5));
}

/* ------------------------------ the lurker ------------------------------ */

function lurker(b: Battle, p: Piece, steps: number): FoePlan {
  const yours = marks(b, p);
  if (!yours.length) return stay(p);
  const soft = (q: Piece) => (q.weapon.kind === "ranged" ? 0 : 2) + (q.stamina / q.staminaMax) * 3 + dist(p.at, q.at) * 0.3;
  const t = [...yours].sort((x, y) => soft(x) - soft(y) || x.id.localeCompare(y.id))[0]!;
  const ways = movesFor(b, p, steps);
  // Behind it: as far from its friends as a tile beside it can be.
  const friends = b.pieces.filter((x) => standing(x) && x.side === t.side && x.id !== t.id);
  const way = bestWay(besideOf(ways, t.at), (at) => -Math.min(9, ...friends.map((f) => dist(f.at, at))));
  if (way) return { path: way, intent: strike(p, t) };
  // Not yet: closer, keeping out of everyone's reach while hidden.
  const all = foesOf(b, p);
  return { path: bestWay(ways, (at) => (all.some((q) => dist(q.at, at) <= 1) ? 20 : 0) + dist(at, t.at)) ?? [p.at], intent: null };
}

/* ------------------------------ the ensnarer ------------------------------ */

function ensnarer(b: Battle, p: Piece, steps: number): FoePlan {
  const held = holding(b, p)[0];
  if (held) return stay(p, { by: p.id, kind: "squeeze", tiles: [held.at], target: held.id });
  const yours = marks(b, p);
  const weak = (q: Piece) => b.pieces.filter((x) => standing(x) && x.side === q.side && x.id !== q.id && dist(x.at, q.at) <= 2).length + q.stamina / q.staminaMax;
  const t = [...yours].sort((x, y) => weak(x) - weak(y) || dist(p.at, x.at) - dist(p.at, y.at) || x.id.localeCompare(y.id))[0];
  if (!t) return stay(p);
  const ways = movesFor(b, p, steps);
  const beside = bestWay(besideOf(ways, t.at), () => 0);
  if (beside) return { path: beside, intent: { by: p.id, kind: "grab", tiles: [t.at], target: t.id } };
  if (dist(p.at, t.at) <= 4 && clearShot(b, p.at, t.at, t.id)) return stay(p, { by: p.id, kind: "web", tiles: shotLine(b, p.at, t.at, 4), target: t.id });
  return approach(p, ways, t);
}

/* ------------------------------ the charmer ------------------------------ */

function charmer(b: Battle, p: Piece, steps: number): FoePlan {
  const yours = marks(b, p);
  if (!yours.length) return stay(p);
  const t = [...yours].sort((x, y) => x.poise - y.poise || x.composure - y.composure || dist(p.at, x.at) - dist(p.at, y.at) || x.id.localeCompare(y.id))[0]!;
  const all = foesOf(b, p);
  const ways = movesFor(b, p, steps);
  // A kiss when the mark is already close and entranced; else two to four off, in sight.
  if (dist(p.at, t.at) === 1 && has(t, "entranced")) return stay(p, { by: p.id, kind: "charm", tiles: [t.at], target: t.id });
  const way = bestWay(ways, (at) => {
    const d = dist(at, t.at);
    const close = Math.min(...all.map((q) => dist(q.at, at)));
    return (d >= 2 && d <= 4 ? Math.abs(d - 3) : 10 + d) + (close <= 1 ? 6 : 0) + (sees(b.mat, at, t.at) ? 0 : 20);
  });
  const at = way ? end(way) : p.at;
  const there = { ...p, at };
  return { path: way ?? [p.at], intent: inCharm(b, there, t) ? { by: p.id, kind: "charm", tiles: [t.at], target: t.id } : null };
}

/* ------------------------------ the captor ------------------------------ */

function captor(b: Battle, p: Piece, steps: number): FoePlan {
  const held = holding(b, p)[0];
  if (held) {
    if (onEdge(b.mat, p.at)) return stay(p, { by: p.id, kind: "carry", tiles: [p.at], target: held.id });
    // Dragging slows it.
    const ways = movesFor(b, p, Math.max(1, steps - 2));
    const edgeD = (q: Pos) => Math.min(q[0], q[1], b.mat.w - 1 - q[0], b.mat.h - 1 - q[1]);
    const way = bestWay(ways, (at) => edgeD(at) * 2 + (dist(at, held.at) > 2 ? 9 : 0));
    const at = way ? end(way) : p.at;
    return { path: way ?? [p.at], intent: onEdge(b.mat, at) ? { by: p.id, kind: "carry", tiles: [at], target: held.id } : { by: p.id, kind: "squeeze", tiles: [held.at], target: held.id } };
  }
  const yours = marks(b, p);
  const t = yours.find((q) => q.hero) ?? nearest(p.at, yours);
  if (!t) return stay(p);
  const ways = movesFor(b, p, steps);
  const beside = bestWay(besideOf(ways, t.at), () => 0);
  if (beside) return { path: beside, intent: { by: p.id, kind: "grab", tiles: [t.at], target: t.id } };
  return approach(p, ways, t);
}

/* ------------------------------ the flock ------------------------------ */

function flock(b: Battle, p: Piece, steps: number): FoePlan {
  const yours = marks(b, p);
  const t = [...yours].sort((x, y) => (x.weapon.kind === "ranged" ? 0 : 1) - (y.weapon.kind === "ranged" ? 0 : 1) || x.defense - y.defense || dist(p.at, x.at) - dist(p.at, y.at) || x.id.localeCompare(y.id))[0];
  if (!t) return stay(p);
  const ways = movesFor(b, p, steps, { fly: true });
  const way = bestWay(besideOf(ways, t.at), () => 0);
  if (way) return { path: way, intent: strike(p, t), style: "fly" };
  return { ...approach(p, ways, t), style: "fly" };
}

/** What a foe does on its move: where it goes, and what it chalks. */
export function foePlan(b: Battle, p: Piece, steps: number): FoePlan & { guard?: string } {
  if (has(p, "enthralled")) return swarm(b, p, steps);
  switch (p.kind) {
    case "shooter":
      return shooter(b, p, steps);
    case "swarm":
      return swarm(b, p, steps);
    case "skirmisher":
      return skirmisher(b, p, steps);
    case "caster":
      return caster(b, p, steps);
    case "guardian":
      return guardian(b, p, steps);
    case "leader":
      return leader(b, p, steps);
    case "pack":
      return pack(b, p, steps);
    case "lurker":
      return lurker(b, p, steps);
    case "ensnarer":
      return ensnarer(b, p, steps);
    case "charmer":
      return charmer(b, p, steps);
    case "captor":
      return captor(b, p, steps);
    case "flock":
      return flock(b, p, steps);
    default:
      return brute(b, p, steps);
  }
}
