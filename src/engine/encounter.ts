/**
 * A plain fight to play the rules on (docs/COMBAT.md, 10, step 1): a seeded mat with a few walls and some cover, your
 * side at the west edge and theirs at the east, and foes bought from a threat budget by difficulty. The mats drawn from
 * a scene (props, templates) come later; this one is enough for the tests and the balance sim.
 */
import { seededRng } from "./dice.js";
import { foePiece, RANKS, yourPiece, type BattleSpec, type Ground, type Objective, type Piece, type Prop, type Rail, type WeaponKind, type Zone } from "./battle.js";
import { FOE_KINDS, type FoeKind, type Rank } from "./foekinds.js";
import type { Stat } from "./moment.js";
import type { Mat, Pos, Tile } from "./grid.js";
import type { Stats } from "./moment.js";

/** A mat of floor with walls and cover written in: `#` wall, `=` cover, anything else floor. */
export function matFrom(rows: readonly string[]): Mat {
  const tiles: Tile[][] = rows.map((r) => [...r].map((c) => (c === "#" ? "wall" : c === "=" ? "cover" : "floor")));
  return { w: Math.max(...rows.map((r) => r.length)), h: rows.length, tiles };
}

/** A seeded mat: open at both ends, a few short walls and some cover in between. */
export function plainMat(seed: string, w = 12, h = 9): Mat {
  const rng = seededRng(`mat:${seed}`);
  const tiles: Tile[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => "floor" as Tile));
  const mid = (): Pos => [3 + Math.floor(rng() * (w - 6)), 1 + Math.floor(rng() * (h - 2))];
  const walls = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < walls; i++) {
    const [x, y] = mid();
    const across = rng() < 0.5;
    const len = 2 + Math.floor(rng() * 2);
    for (let j = 0; j < len; j++) {
      const [tx, ty] = across ? [x + j, y] : [x, y + j];
      if (tx >= 3 && tx < w - 3 && ty >= 0 && ty < h) tiles[ty]![tx] = "wall";
    }
  }
  const cover = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < cover; i++) {
    const [x, y] = mid();
    if (tiles[y]![x] === "floor") tiles[y]![x] = "cover";
  }
  return { w, h, tiles };
}

export interface Side {
  id: string;
  name: string;
  stats: Stats;
  hero?: boolean;
  level?: number;
  armor?: number;
  weapon?: WeaponKind;
  shield?: boolean;
  will?: number;
  defend?: Stat;
  poiseBy?: Stat;
  ward?: boolean;
}

/** A foe as the encounter is asked for it: a kind and a rank, and a name and a rail when the world gives them. */
export interface FoeSpec {
  kind: FoeKind;
  rank: Rank;
  name?: string;
  rail?: Rail;
  leader?: boolean;
}

/** What a fight of a difficulty costs, for a side this big: minion 1, soldier 2, elite 4. */
export const threatBudget = (difficulty: number, sideSize: number): number => Math.round(sideSize * (1.5 + 0.75 * difficulty)) + 1;

/**
 * Foes bought from the budget, seeded: at most one elite, minions mostly of the small kinds in the pool. A climax with
 * budget for it gets a boss (8) and the rest in its train.
 */
export function foesFor(seed: string, difficulty: number, sideSize: number, pool: readonly FoeKind[] = ["brute", "shooter", "swarm"], boss = false): FoeSpec[] {
  const rng = seededRng(`foes:${seed}`);
  let left = threatBudget(difficulty, sideSize) + (boss ? 4 : 0);
  const out: FoeSpec[] = [];
  const kinds = pool.length ? pool : (["brute", "shooter", "swarm"] as FoeKind[]);
  const small = kinds.filter((k) => k === "swarm" || k === "pack" || k === "flock" || k === "skirmisher");
  if (boss && left >= 8) {
    out.push({ kind: kinds.find((k) => k !== "swarm" && k !== "flock" && k !== "leader") ?? kinds[0]!, rank: "boss" });
    left -= RANKS.boss.threat;
  }
  while (left > 0) {
    const r = rng();
    const rank: Rank = left >= 4 && difficulty >= 1 && !out.some((f) => f.rank === "elite" || f.rank === "boss") && r < 0.3 ? "elite" : left >= 2 && r < 0.75 ? "soldier" : "minion";
    const kind: FoeKind = rank === "minion" && small.length && rng() < 0.6 ? small[Math.floor(rng() * small.length)]! : kinds[Math.floor(rng() * kinds.length)]!;
    // One leader at most.
    out.push({ kind: kind === "leader" && out.some((f) => f.kind === "leader") ? (kinds.find((k) => k !== "leader") ?? "brute") : kind, rank });
    left -= RANKS[rank].threat;
  }
  return out;
}

/** Tiles down an edge column, spread from the middle out, that are floor. */
function spots(m: Mat, x0: number, x1: number, n: number, ground: Record<string, { g: Ground }> = {}): Pos[] {
  const out: Pos[] = [];
  const mid = Math.floor(m.h / 2);
  const rows = Array.from({ length: m.h }, (_, i) => mid + (i % 2 ? -1 : 1) * Math.ceil(i / 2)).filter((y) => y >= 0 && y < m.h);
  for (let x = x0; x !== x1 + Math.sign(x1 - x0 || 1) && out.length < n; x += Math.sign(x1 - x0 || 1))
    for (const y of rows) if (out.length < n && m.tiles[y]![x] === "floor" && ground[`${x},${y}`]?.g !== "hazard") out.push([x, y]);
  return out;
}

/** The foe pieces for a list of specs, at the tiles given: ids by kind letter, names by the world or by rank. */
export function foePieces(foes: readonly FoeSpec[], difficulty: number, at: readonly Pos[], taken: readonly string[] = []): Piece[] {
  const count: Record<string, number> = {};
  const out: Piece[] = [];
  foes.forEach((f, i) => {
    if (!at[i]) return;
    const letter = FOE_KINDS[f.kind].letter;
    let n = (count[letter] = (count[letter] ?? 0) + 1);
    while (taken.includes(`${letter}${n}`)) n = count[letter] = n + 1;
    const twins = foes.filter((g) => g.kind === f.kind && (g.name ?? "") === (f.name ?? "")).length > 1;
    const alike = foes.filter((g) => !g.name && g.kind === f.kind && g.rank === f.rank).length > 1;
    const name = f.name ? (twins ? `${f.name} ${n}` : f.name) : alike ? `${FOE_KINDS[f.kind].names[f.rank]} ${n}` : FOE_KINDS[f.kind].names[f.rank];
    const p = foePiece({ id: `${letter}${n}`, name, kind: f.kind, rank: f.rank, difficulty, at: at[i]!, ...(f.leader ? { leader: true } : {}) });
    out.push(f.rail ? { ...p, rail: f.rail } : p);
  });
  return out;
}

/** A whole fight: the mat (plain, or an arena's), your side at the west, foes at the east. */
export function encounter(o: {
  seed: string;
  difficulty: number;
  side: readonly Side[];
  mat?: Mat;
  foes?: FoeSpec[];
  props?: Prop[];
  zones?: Zone[];
  ground?: Record<string, { g: Ground; until: number }>;
  objective?: Objective;
  pool?: readonly FoeKind[];
  boss?: boolean;
  /** More of them on the danger clock, at the end of this round. */
  reinforce?: { round: number; foes: FoeSpec[] };
  store?: number;
  parley?: boolean;
  readyForThat?: boolean;
}): BattleSpec {
  const mat = o.mat ?? plainMat(o.seed);
  const ground = o.ground ?? {};
  const foes = o.foes ?? foesFor(o.seed, o.difficulty, o.side.filter((s) => !s.ward).length, o.pool, o.boss);
  const west = spots(mat, 0, 2, o.side.length, ground);
  const east = spots(mat, mat.w - 1, mat.w - 3, foes.length, ground);
  const pieces: Piece[] = o.side.filter((_, i) => west[i]).map((s, i) => yourPiece({ ...s, at: west[i]! }));
  pieces.push(...foePieces(foes, o.difficulty, east));
  const more = o.reinforce ? foePieces(o.reinforce.foes, o.difficulty, o.reinforce.foes.map(() => [mat.w - 1, 0] as Pos), pieces.map((p) => p.id)) : [];
  return {
    seed: o.seed,
    mat,
    pieces,
    difficulty: o.difficulty,
    ...(o.props ? { props: o.props } : {}),
    ...(o.zones ? { zones: o.zones } : {}),
    ...(Object.keys(ground).length ? { ground } : {}),
    ...(o.objective ? { objective: o.objective } : {}),
    ...(more.length ? { clock: { round: o.reinforce!.round, foes: more } } : {}),
    ...(o.store !== undefined ? { store: o.store } : {}),
    ...(o.parley !== undefined ? { parley: o.parley } : {}),
    ...(o.readyForThat === false ? { readyForThat: false } : {}),
  };
}
