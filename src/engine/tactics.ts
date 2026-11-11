/**
 * How a piece of your side might play its turn, without anyone telling it: the balance sim plays with these, and a
 * companion with no word from the player can fall back on them (docs/COMBAT.md, 10, step 2). `readOrder` reads the
 * board the way a player who looks at it would (out of the chalk, onto the flank, finish the hurt, shove the one about
 * to swing); `plainOrder` is "I attack the nearest one", every turn.
 */
import {
  breaksOff,
  defenseAgainst,
  flanked,
  foesOf,
  has,
  inReach,
  movesFor,
  piece,
  reaches,
  readyFor,
  standing,
  type Battle,
  type Intent,
  type Order,
  type Piece,
} from "./battle.js";
import { dist, same, type Pos } from "./grid.js";
import type { Stat } from "./moment.js";

const statOf = (p: Piece, k: Stat): number => p.stats?.[k] ?? 0;
const hitStat = (p: Piece): number => (p.weapon.kind === "ranged" ? statOf(p, "grace") : Math.max(statOf(p, "brawn"), statOf(p, "grace")));
/** The chance a d20 + add meets a target, near enough: a 20 always lands, a 1 never does. */
const chance = (add: number, target: number, edge = false, bane = false): number => {
  const one = Math.min(0.95, Math.max(0.05, (21 - (target - add)) / 20));
  if (edge && !bane) return 1 - (1 - one) ** 2;
  if (bane && !edge) return one ** 2;
  return one;
};

/** What the blows chalked now would do to `p` if it stood at `at` when they land. */
export function dangerAt(b: Battle, p: Piece, at: Pos): number {
  let d = 0;
  for (const i of b.intents) {
    const f = piece(b, i.by);
    if (!f || !standing(f)) continue;
    if (hits(b, i, f, p, at)) d += Math.max(1, f.weapon.damage + (i.kind === "charge" ? 1 : 0) - p.armor) * chance(f.attack + f.weapon.hit, p.defense);
  }
  return d;
}

function hits(b: Battle, i: Intent, f: Piece, p: Piece, at: Pos): boolean {
  const onChalk = i.tiles.slice(i.kind === "shot" || i.kind === "charge" ? 1 : 0).some((q) => same(q, at));
  if (i.kind === "shot" || i.kind === "charge") return onChalk;
  const follows = i.target === p.id && reaches(b, f, { ...p, at });
  return follows || (i.kind === "cleave" && onChalk) || (!follows && onChalk && i.target !== p.id);
}

/** What striking `t` from `at` is worth: the hurt expected, more when it finishes it or stops a blow. */
function strikeWorth(b: Battle, p: Piece, at: Pos, t: Piece): number {
  const me = { ...p, at };
  if (!inReach(b, me, t)) return -Infinity;
  const { defense } = defenseAgainst(b, at, t, p.weapon.kind === "ranged");
  const edge = flanked(b, me, t) || has(t, "exposed");
  const bane = has(p, "prone") || (p.weapon.kind === "ranged" && foesOf(b, p).some((q) => dist(q.at, at) === 1));
  const c = chance(hitStat(p) + p.weapon.hit, defense, edge, bane);
  const dmg = Math.max(1, p.weapon.damage - t.armor);
  const finishes = dmg >= t.stamina;
  const stops = b.intents.find((i) => i.by === t.id);
  const stopWorth = stops ? 1.5 : 0;
  // Hurt dealt counts for more than hurt dodged: every peg off them is a round less of their blows.
  return c * (Math.min(dmg, t.stamina) * 1.5 + (finishes ? 2 + stopWorth : 0)) + 0.4 * (1 - t.stamina / t.staminaMax);
}

/** What shoving `t` from `at` is worth: it wipes the blow it chalked, and hurts it against a wall. */
function shoveWorth(b: Battle, p: Piece, at: Pos, t: Piece): number {
  if (dist(at, t.at) !== 1) return -Infinity;
  const i = b.intents.find((x) => x.by === t.id);
  if (!i) return -Infinity;
  const { defense } = defenseAgainst(b, at, t, false);
  const c = chance(statOf(p, "brawn"), defense, has(t, "exposed"), has(p, "prone") || readyFor(b, p, "shove", t.id, true));
  return c * (Math.max(1, t.weapon.damage - p.armor) * chance(t.attack + t.weapon.hit, p.defense) + 0.3);
}

/** A turn read off the board: the best place to stand and the best thing to do from it. */
export function readOrder(b: Battle, id: string): Order {
  const p = piece(b, id)!;
  const foes = foesOf(b, p);
  let best: { order: Order; score: number } = { order: { piece: id }, score: -Infinity };
  for (const way of movesFor(b, p).values()) {
    const to = way[way.length - 1]!;
    const danger = dangerAt(b, p, to);
    const off = breaksOff(b, p, to);
    const near = foes.length ? Math.min(...foes.map((f) => dist(f.at, to))) : 0;
    // Closing in matters only while nothing is in reach; a shooter likes a little room.
    const want = p.weapon.kind === "ranged" ? Math.abs(near - 4) : near;
    const base = -danger - want * 0.3 - way.length * 0.01;
    const consider = (order: Order, worth: number) => {
      if (base + worth > best.score) best = { order, score: base + worth };
    };
    consider({ piece: id, ...(same(to, p.at) ? {} : { to }) }, 0);
    if (off) continue;
    for (const t of foes) {
      consider({ piece: id, ...(same(to, p.at) ? {} : { to }), act: { act: "strike", target: t.id } }, strikeWorth(b, p, to, t));
      consider({ piece: id, ...(same(to, p.at) ? {} : { to }), act: { act: "shove", target: t.id } }, shoveWorth(b, p, to, t));
      // Strike first from where it stands, then step somewhere safer (never out of a foe's reach: that is breaking off).
      if (!same(to, p.at)) consider({ piece: id, to, act: { act: "strike", target: t.id }, actFirst: true }, strikeWorth(b, p, p.at, t));
    }
  }
  return best.order;
}

/** "I attack the nearest one": walk up to it and hit it, every turn, the same plain way. */
export function plainOrder(b: Battle, id: string): Order {
  const p = piece(b, id)!;
  const t = [...foesOf(b, p)].sort((x, y) => dist(p.at, x.at) - dist(p.at, y.at) || x.id.localeCompare(y.id))[0];
  if (!t) return { piece: id };
  if (inReach(b, p, t)) return { piece: id, act: { act: "strike", target: t.id, plain: true } };
  let best: Pos | undefined;
  let bestD = Infinity;
  for (const way of movesFor(b, p).values()) {
    const to = way[way.length - 1]!;
    const d = inReach(b, { ...p, at: to }, t) ? 0 : dist(to, t.at);
    if (d < bestD) {
      bestD = d;
      best = to;
    }
  }
  return { piece: id, ...(best && !same(best, p.at) ? { to: best } : {}), act: { act: "strike", target: t.id, plain: true } };
}
