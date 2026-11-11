/**
 * Arenas (docs/COMBAT.md, 4.1 and 4.3): a handful of mats drawn by hand, each a kind of place with its named zones and
 * its props, picked by what the stop is and mirrored by the seed. The world's model may rename the props, the zones and
 * the foes; the numbers stay the templates'. Your side comes in from the west edge, theirs from the east.
 *
 * In the rows: `#` wall, `=` cover, `.` floor, `o` a hazard (water, a pit, a drop), `^` a height, and the props:
 * `T` toppler, `H` hanging, `S` spill, `F` fire, `C` cover to flip, `D` a door or gate, `t` throwables, `P` a prize.
 */
import { seededRng } from "./dice.js";
import type { Ground, Prop, PropTemplate, Zone } from "./battle.js";
import type { Mat, Pos, Tile } from "./grid.js";

export type ArenaId = "tavern" | "street" | "woods" | "bridge" | "hall" | "cave" | "camp" | "ruin";
export const ARENA_IDS: readonly ArenaId[] = ["tavern", "street", "woods", "bridge", "hall", "cave", "camp", "ruin"];

interface ArenaTemplate {
  id: ArenaId;
  /** What the place is, in words a stop might use. */
  words: RegExp;
  rows: string[];
  /** Names for the props, by their letter, and for the hazard and the height. */
  names: Partial<Record<string, string>>;
  zones: { name: string; rect: [number, number, number, number] }[];
}

const T = (id: ArenaId, words: RegExp, rows: string[], names: ArenaTemplate["names"], zones: ArenaTemplate["zones"]): ArenaTemplate => ({ id, words, rows, names, zones });

export const ARENAS: readonly ArenaTemplate[] = [
  T(
    "tavern",
    /tavern|inn\b|alehouse|saloon|\bbar\b|taproom|brothel|club|lounge|parlou?r|bathhouse|kitchen|cellar/i,
    ["#####DD#####", "...==t.==...", "............", "..T.....H...", "......F.....", "............", "..S......=..", "...C........", "############"],
    { T: "the cask rack", H: "the chandelier", S: "the ale barrels", F: "the hearth", C: "a long table", D: "the front door", t: "bottles on the bar" },
    [
      { name: "the bar", rect: [3, 1, 8, 2] },
      { name: "the door", rect: [5, 0, 6, 1] },
      { name: "the hearth", rect: [5, 3, 7, 5] },
      { name: "the west tables", rect: [0, 3, 3, 7] },
      { name: "the east tables", rect: [8, 5, 11, 7] },
      { name: "under the chandelier", rect: [8, 3, 9, 4] },
    ],
  ),
  T(
    "street",
    /street|alley|market|square|town|city|village|dock|wharf|harbou?r|plaza|lane|road|gate/i,
    ["##..###..###", "....=....H..", "..C.....^^^.", "........^^^.", ".....F......", "..T.........", "......S.=...", "....=.......", "###..####D##"],
    { T: "a stack of crates", H: "a hanging sign", S: "barrels of lamp oil", F: "a brazier", C: "a hand-cart", D: "the yard gate", "^": "the steps up to a balcony" },
    [
      { name: "the cart", rect: [1, 1, 3, 3] },
      { name: "the balcony", rect: [8, 2, 10, 3] },
      { name: "the brazier", rect: [4, 3, 6, 5] },
      { name: "the crates", rect: [1, 4, 3, 6] },
      { name: "the alley mouth", rect: [2, 7, 4, 8] },
      { name: "the middle of the street", rect: [4, 4, 8, 6] },
    ],
  ),
  T(
    "woods",
    /wood|forest|grove|glade|thicket|jungle|marsh|swamp|meadow|field|orchard|garden|wild/i,
    ["...#.....#..", "..=...T.....", "......^^....", "#.....^^..=.", "...t......#.", ".=....oo....", "......oo..=.", "..#.......#.", "....=..#...."],
    { T: "a dead tree", t: "loose stones", "^": "a rocky rise", o: "a sinkhole" },
    [
      { name: "the dead tree", rect: [5, 0, 7, 2] },
      { name: "the rise", rect: [6, 2, 7, 3] },
      { name: "the sinkhole", rect: [5, 4, 8, 7] },
      { name: "the west trees", rect: [0, 0, 3, 8] },
      { name: "the east trees", rect: [9, 0, 11, 8] },
    ],
  ),
  T(
    "bridge",
    /bridge|river|ford|crossing|ferry|ship|deck|boat|cliff|ledge|chasm|canyon|gorge/i,
    ["oooooooooooo", "oooooooooooo", "..==....=...", "....T...H...", "............", "...t....S...", "..=.....=...", "oooooooooooo", "oooooooooooo"],
    { T: "a stack of cargo", H: "a crane load", S: "a tar barrel", t: "loose planks", o: "the water below" },
    [
      { name: "the west end", rect: [0, 2, 2, 6] },
      { name: "the middle of the bridge", rect: [4, 2, 7, 6] },
      { name: "the east end", rect: [9, 2, 11, 6] },
      { name: "the cargo", rect: [3, 2, 5, 4] },
      { name: "the edge", rect: [0, 1, 11, 1] },
    ],
  ),
  T(
    "hall",
    /hall|temple|church|chapel|shrine|castle|keep|manor|palace|throne|court|cathedral|library|mansion|ballroom|tower|chamber|bedroom|boudoir/i,
    ["############", "..#..^^..#..", ".....^^.....", "..F.T...H...", "............", "..F......=..", ".....==.....", "..#.....t#..", "############"],
    { F: "a brazier", T: "a statue", H: "the chandelier", t: "candlesticks", "^": "the dais" },
    [
      { name: "the dais", rect: [5, 1, 6, 2] },
      { name: "the braziers", rect: [1, 3, 3, 5] },
      { name: "the statue", rect: [3, 2, 5, 4] },
      { name: "the pews", rect: [4, 5, 7, 7] },
      { name: "under the chandelier", rect: [8, 3, 9, 4] },
    ],
  ),
  T(
    "cave",
    /cave|cavern|mine|tunnel|crypt|tomb|catacomb|dungeon|sewer|lair|den|burrow|pit|underground|vault|prison|cell/i,
    ["####..######", "#....=....##", "...T.....H..", "......oo....", "..=...oo..S.", "....F.......", "#..t....=...", "##.......###", "#####..#####"],
    { T: "a rotten support beam", H: "loose stalactites", S: "a seep of black oil", F: "a torch in a sconce", t: "loose rocks", o: "a deep pit" },
    [
      { name: "the pit", rect: [5, 2, 8, 5] },
      { name: "the stalactites", rect: [9, 2, 10, 3] },
      { name: "the torch", rect: [3, 4, 5, 6] },
      { name: "the narrows", rect: [4, 0, 5, 1] },
      { name: "the back of the cave", rect: [9, 4, 11, 7] },
    ],
  ),
  T(
    "camp",
    /camp|tent|bivouac|outpost|fort|barracks|siege|wagon|caravan|stockade|palisade/i,
    ["..##....##..", "..##..C.##..", "............", "...S..F..T..", "............", "..=.....t...", "..##....##..", "..##.=..##..", "............"],
    { S: "the water barrels", F: "the campfire", T: "a weapon rack", C: "a supply wagon", t: "firewood" },
    [
      { name: "the campfire", rect: [5, 2, 7, 4] },
      { name: "the west tents", rect: [2, 0, 3, 1] },
      { name: "the east tents", rect: [8, 0, 9, 1] },
      { name: "the wagon", rect: [5, 0, 7, 1] },
      { name: "the south tents", rect: [2, 6, 9, 7] },
    ],
  ),
  T(
    "ruin",
    /ruin|roof|rooftop|tower top|battlement|wall walk|rampart|courtyard|arena|colosseum|pit fight|amphitheat/i,
    ["............", "..=..^^^....", ".....^^^..o.", "..T.......o.", "......=.....", ".o....H.....", ".o.......T..", "....t...=...", "............"],
    { T: "a cracked column", H: "a hanging beam", t: "broken masonry", "^": "a fallen wall to climb", o: "a hole in the floor" },
    [
      { name: "the high wall", rect: [5, 1, 7, 2] },
      { name: "the columns", rect: [1, 2, 3, 4] },
      { name: "the holes", rect: [9, 2, 11, 3] },
      { name: "the middle", rect: [4, 3, 7, 6] },
    ],
  ),
];

const TEMPLATE_OF: Record<string, PropTemplate> = { T: "toppler", H: "hanging", S: "spill", F: "fire", C: "cover", D: "choke", t: "throwable", P: "prize" };
const ON_COVER = new Set(["T", "S", "F", "t", "P"]);

export interface Arena {
  id: ArenaId;
  mat: Mat;
  props: Prop[];
  zones: Zone[];
  ground: Record<string, { g: Ground; until: number }>;
}

/** The arena a stop calls for, by its words; else one by the seed. */
export function arenaFor(text: string, seed: string): ArenaId {
  const hit = ARENAS.find((a) => a.words.test(text));
  if (hit) return hit.id;
  const rng = seededRng(`arena:${seed}`);
  return ARENA_IDS[Math.floor(rng() * ARENA_IDS.length)]!;
}

/** An arena laid out: tiles, props, zones and ground, mirrored top to bottom when the seed says so. */
export function buildArena(id: ArenaId, seed: string, names: Partial<Record<string, string>> = {}): Arena {
  const a = ARENAS.find((x) => x.id === id) ?? ARENAS[0]!;
  const flip = seededRng(`flip:${seed}`)() < 0.5;
  const rows = flip ? [...a.rows].reverse() : a.rows;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const fy = (y: number) => (flip ? h - 1 - y : y);
  const tiles: Tile[][] = [];
  const props: Prop[] = [];
  const ground: Arena["ground"] = {};
  const height: Pos[] = [];
  const hazard: Pos[] = [];
  const counts: Record<string, number> = {};
  rows.forEach((r, y) => {
    const row: Tile[] = [];
    [...r.padEnd(w, ".")].forEach((c, x) => {
      row.push(c === "#" ? "wall" : c === "=" || ON_COVER.has(c) ? "cover" : "floor");
      if (c === "o") {
        hazard.push([x, y]);
        ground[`${x},${y}`] = { g: "hazard", until: Infinity };
      }
      if (c === "^") height.push([x, y]);
      const tpl = TEMPLATE_OF[c];
      if (tpl) {
        const n = (counts[c] = (counts[c] ?? 0) + 1);
        const name = names[c] ?? a.names[c] ?? tpl;
        props.push({ id: `${tpl}${n > 1 ? n : ""}`, name: n > 1 ? `${name} (${n})` : name, template: tpl, at: [x, y], ...(tpl === "throwable" ? { uses: 3 } : {}), ...(tpl === "hanging" ? { area: hang([x, y], w, h, flip) } : {}) });
      }
    });
    tiles.push(row);
  });
  if (height.length) props.push({ id: "height", name: names["^"] ?? a.names["^"] ?? "the high ground", template: "height", at: height[0]!, area: height });
  if (hazard.length) props.push({ id: "hazard", name: names.o ?? a.names.o ?? "the drop", template: "hazard", at: hazard[0]!, area: hazard });
  const zones: Zone[] = a.zones.map((z) => {
    const [x0, y0, x1, y1] = z.rect;
    const out: Pos[] = [];
    for (let x = x0; x <= x1; x++) for (let y = Math.min(fy(y0), fy(y1)); y <= Math.max(fy(y0), fy(y1)); y++) out.push([x, y]);
    return { name: names[`zone:${z.name}`] ?? z.name, tiles: out };
  });
  return { id: a.id, mat: { w, h, tiles }, props, zones, ground };
}

/** Where a hanging thing falls: the 2×2 below and to the east of it (south, unless the mat is mirrored). */
function hang(at: Pos, w: number, h: number, flip: boolean): Pos[] {
  const dy = flip ? -1 : 1;
  return [at, [at[0] + 1, at[1]], [at[0], at[1] + dy], [at[0] + 1, at[1] + dy]].filter((q) => q[0] >= 0 && q[1] >= 0 && q[0] < w && q[1] < h) as Pos[];
}

/** The letters the world's model may rename, and what each stands for, for its prompt. */
export function arenaNames(id: ArenaId): { key: string; template: string; name: string }[] {
  const a = ARENAS.find((x) => x.id === id) ?? ARENAS[0]!;
  return Object.entries(a.names).map(([k, name]) => ({ key: k, template: k === "^" ? "height" : k === "o" ? "hazard" : TEMPLATE_OF[k] ?? k, name: name! }));
}
