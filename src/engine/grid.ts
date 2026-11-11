/**
 * The battle mat's geometry (docs/COMBAT.md, 4): squares, eight ways round, a piece "next to" another when they touch
 * at a side or a corner. Walls block moving and seeing; cover blocks moving and gives half cover to whoever is behind
 * it, but can be seen and shot over. Pure.
 */

export type Tile = "floor" | "wall" | "cover";
export type Pos = readonly [number, number];

export interface Mat {
  w: number;
  h: number;
  /** Row by row, `tiles[y][x]`. */
  tiles: Tile[][];
}

export const key = (p: Pos): string => `${p[0]},${p[1]}`;
export const same = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1];
export const onMat = (m: Mat, p: Pos): boolean => p[0] >= 0 && p[1] >= 0 && p[0] < m.w && p[1] < m.h;
export const tileAt = (m: Mat, p: Pos): Tile => (onMat(m, p) ? m.tiles[p[1]]![p[0]]! : "wall");
/** Steps between two tiles, a diagonal counting as one: next to is 1. */
export const dist = (a: Pos, b: Pos): number => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
export const DIRS: readonly Pos[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
export const around = (p: Pos): Pos[] => DIRS.map((d) => [p[0] + d[0], p[1] + d[1]] as Pos);
/** Whether a piece may stand on a tile, leaving aside who is there. */
export const open = (m: Mat, p: Pos): boolean => tileAt(m, p) === "floor";
/** Tiles on the mat's edge, where a side can break away. */
export const onEdge = (m: Mat, p: Pos): boolean => p[0] === 0 || p[1] === 0 || p[0] === m.w - 1 || p[1] === m.h - 1;

/** The tiles a straight line crosses from a to b, both ends included (Bresenham). */
export function line(a: Pos, b: Pos): Pos[] {
  const out: Pos[] = [];
  let [x, y] = a;
  const dx = Math.abs(b[0] - x);
  const dy = -Math.abs(b[1] - y);
  const sx = x < b[0] ? 1 : -1;
  const sy = y < b[1] ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x, y]);
    if (x === b[0] && y === b[1]) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** Whether b can be seen from a: no wall between them (cover can be seen over). */
export function sees(m: Mat, a: Pos, b: Pos): boolean {
  return line(a, b)
    .slice(1, -1)
    .every((p) => tileAt(m, p) !== "wall");
}

/** Whether cover stands between a shooter and its mark, so the mark is in half cover. */
export function covered(m: Mat, from: Pos, to: Pos): boolean {
  return line(from, to)
    .slice(1, -1)
    .some((p) => tileAt(m, p) === "cover");
}

/**
 * Every tile a piece can reach in `steps`, and the way there: through open floor, past the tiles in `through` (its
 * own side), never through the tiles in `blocked` (the other side). Tiles anyone stands on can be passed, not ended on.
 */
export function reach(m: Mat, from: Pos, steps: number, blocked: ReadonlySet<string>, taken: ReadonlySet<string>): Map<string, Pos[]> {
  const ways = new Map<string, Pos[]>([[key(from), [from]]]);
  let edge: Pos[] = [from];
  for (let s = 0; s < steps && edge.length; s++) {
    const next: Pos[] = [];
    for (const p of edge) {
      for (const q of around(p)) {
        const k = key(q);
        if (ways.has(k) || !open(m, q) || blocked.has(k)) continue;
        ways.set(k, [...ways.get(key(p))!, q]);
        next.push(q);
      }
    }
    edge = next;
  }
  // Somewhere to stop: not where anyone else stands.
  for (const k of [...ways.keys()]) if (k !== key(from) && taken.has(k)) ways.delete(k);
  return ways;
}
