/**
 * The battle mat (docs/COMBAT.md, 3 to 5): the numbers on a piece, the chalk and how to answer it, the four states,
 * the three kinds, and that it all replays the same from a seed. All names here are made up for the tests.
 */
import { describe, expect, test } from "bun:test";
import {
  boardText,
  defenseAgainst,
  flanked,
  foePiece,
  FOE_DEFENSE,
  piece,
  playRound,
  ROUND_LIMIT,
  HERO_DOWN_ROUNDS,
  startBattle,
  theirTurn,
  withState,
  yourPiece,
  yourTurn,
  type Battle,
  type BattleEvent,
  type Piece,
} from "../src/engine/battle.js";
import { encounter, matFrom, plainMat } from "../src/engine/encounter.js";
import { arc } from "../src/engine/foekinds.js";
import { dist, line, open, same, type Pos } from "../src/engine/grid.js";
import { plainOrder, readOrder } from "../src/engine/tactics.js";
import type { Stats } from "../src/engine/moment.js";

const STATS: Stats = { brawn: 2, grace: 2, charm: 0, guile: 0, wits: 1, sense: 1 };
const OPEN = matFrom(Array.from({ length: 7 }, () => ".........."));
const hero = (at: Pos, o: Partial<Parameters<typeof yourPiece>[0]> = {}) => yourPiece({ id: "hero", name: "Wren", stats: STATS, at, hero: true, armor: 1, ...o });
const ally = (at: Pos) => yourPiece({ id: "kai", name: "Kai", stats: STATS, at });
const foe = (id: string, kind: "brute" | "shooter" | "swarm", at: Pos, rank: "minion" | "soldier" | "elite" = "soldier") => foePiece({ id, name: id, kind, rank, difficulty: 1, at });
const start = (pieces: Piece[], mat = OPEN, seed = "t") => startBattle({ seed, mat, pieces }).battle;
const rollsBy = (ev: BattleEvent[], by: string) => ev.filter((e): e is Extract<BattleEvent, { e: "roll" }> => e.e === "roll" && e.by === by);
const intentOf = (b: Battle, id: string) => b.intents.find((i) => i.by === id);
const setPiece = (b: Battle, id: string, o: Partial<Piece>): Battle => ({ ...b, pieces: b.pieces.map((p) => (p.id === id ? { ...p, ...o } : p)) });

describe("the pieces", () => {
  test("your side: Stamina 4 + 2 brawn + level, Defense 10 + grace, speed 5 from grace 3", () => {
    const p = yourPiece({ id: "a", name: "A", stats: { ...STATS, brawn: 3, grace: 3 }, at: [0, 0], level: 2, shield: true, armor: 5 });
    expect(p.staminaMax).toBe(4 + 6 + 2);
    expect(p.defense).toBe(10 + 3 + 1);
    expect(p.speed).toBe(5);
    expect(p.armor).toBe(2);
    expect(hero([0, 0]).speed).toBe(4);
  });

  test("foes: Defense by difficulty and rank, a minion falls to one blow", () => {
    expect(foe("s", "brute", [0, 0]).defense).toBe(FOE_DEFENSE[1]);
    const m = foe("m", "swarm", [0, 0], "minion");
    expect(m.staminaMax).toBe(1);
    expect(m.defense).toBeLessThan(FOE_DEFENSE[1]);
    expect(foe("e", "brute", [0, 0], "elite").staminaMax).toBeGreaterThan(foe("s", "brute", [0, 0]).staminaMax);
  });
});

describe("the chalk", () => {
  test("a fight opens with their move shown: every foe has chalked one blow", () => {
    const b = start([hero([1, 3]), foe("b1", "brute", [4, 3]), foe("a1", "shooter", [8, 1])]);
    expect(b.round).toBe(1);
    expect(b.intents.map((i) => i.by).sort()).toEqual(["a1", "b1"]);
  });

  test("stepping off a shot's line makes it miss", () => {
    const b = start([hero([2, 3]), foe("a1", "shooter", [8, 3])]);
    const shot = intentOf(b, "a1")!;
    expect(shot.kind).toBe("shot");
    const to = ([[2, 6], [2, 0], [3, 6], [1, 6]] as Pos[]).find((q) => !shot.tiles.some((t) => same(t, q)))!;
    const a = yourTurn(b, [{ piece: "hero", to }]);
    const c = theirTurn(a.battle);
    expect(rollsBy(c.events, "a1")).toHaveLength(0);
    expect(piece(c.battle, "hero")!.stamina).toBe(piece(b, "hero")!.staminaMax);
  });

  test("a strike follows its mark while it stays in reach", () => {
    const b = start([hero([4, 3]), foe("b1", "brute", [5, 3])]);
    expect(intentOf(b, "b1")!.kind).toBe("strike");
    const a = yourTurn(b, [{ piece: "hero", to: [4, 2] }]);
    expect(rollsBy(theirTurn(a.battle).events, "b1").map((r) => r.at)).toEqual(["hero"]);
  });

  test("getting out of reach of a foe you stand next to is breaking off: it takes your act", () => {
    const b = start([hero([4, 3]), foe("b1", "brute", [5, 3])]);
    const a = yourTurn(b, [{ piece: "hero", to: [1, 3], act: { act: "strike", target: "b1" } }]);
    expect(a.events.some((e) => e.e === "cant" && e.why.includes("breaking off"))).toBe(true);
    expect(rollsBy(a.events, "hero")).toHaveLength(0);
    expect(rollsBy(theirTurn(a.battle).events, "b1")).toHaveLength(0);
  });

  test("a shot lands on the first piece on its line, whoever it is", () => {
    let b = start([hero([2, 3]), ally([5, 3]), foe("a1", "shooter", [8, 3])]);
    b = setPiece(b, "a1", { at: [8, 3] });
    b = { ...b, intents: [{ by: "a1", kind: "shot", tiles: line([8, 3], [2, 3]), target: "hero" }] };
    expect(rollsBy(theirTurn(b).events, "a1")[0]!.at).toBe("kai");
  });

  test("a brute charges across open ground; step off the line and it runs past", () => {
    const b = start([hero([1, 3]), foe("b1", "brute", [9, 3])]);
    const charge = intentOf(b, "b1")!;
    expect(charge.kind).toBe("charge");
    const stayed = theirTurn(b);
    expect(rollsBy(stayed.events, "b1")[0]?.what).toBe("charge");
    const moved = theirTurn(yourTurn(b, [{ piece: "hero", to: [1, 5] }]).battle);
    expect(rollsBy(moved.events, "b1")).toHaveLength(0);
    const run = moved.events.find((e): e is Extract<BattleEvent, { e: "move" }> => e.e === "move" && e.style === "charge");
    expect(run!.path.at(-1)).toEqual([1, 3]);
  });

  test("a brute cleaves when two of you stand together", () => {
    const b = start([hero([4, 3]), ally([4, 4]), foe("b1", "brute", [5, 3])]);
    const i = intentOf(b, "b1")!;
    expect(i.kind).toBe("cleave");
    expect(i.tiles).toEqual(arc([5, 3], [4, 3]));
    expect(rollsBy(theirTurn(b).events, "b1").map((r) => r.at).sort()).toEqual(["hero", "kai"]);
  });
});

describe("the states", () => {
  test("Staggered (and Prone) wipe what a foe chalked", () => {
    const b = start([hero([4, 3]), foe("b1", "brute", [5, 3])]);
    const s = withState(b, "b1", "staggered", b.round);
    expect(intentOf(s, "b1")).toBeUndefined();
    expect(rollsBy(theirTurn(s).events, "b1")).toHaveLength(0);
    expect(intentOf(withState(b, "b1", "prone", Infinity), "b1")).toBeUndefined();
  });

  test("Prone: -2 Defense against anyone next to it, not against a shot from afar", () => {
    const b = withState(start([hero([4, 3]), foe("b1", "brute", [5, 3])]), "b1", "prone", Infinity);
    const t = piece(b, "b1")!;
    expect(defenseAgainst(b, [4, 3], t, false).defense).toBe(t.defense - 2);
    expect(defenseAgainst(b, [0, 3], t, true).defense).toBe(t.defense);
  });

  test("Burning bites at the end of the round, through armor", () => {
    let b = start([hero([0, 0]), foe("a1", "shooter", [9, 6])]);
    b = withState({ ...b, intents: [] }, "hero", "burning", 99);
    const c = theirTurn(b);
    expect(c.events.some((e) => e.e === "burn" && e.piece === "hero")).toBe(true);
    expect(piece(c.battle, "hero")!.stamina).toBe(piece(b, "hero")!.staminaMax - 1);
  });

  test("Exposed gives the next attack edge, once", () => {
    const b = withState(start([hero([4, 3]), foe("b1", "brute", [5, 3])]), "b1", "exposed", 9);
    const a = yourTurn(b, [{ piece: "hero", act: { act: "strike", target: "b1" } }]);
    const r = rollsBy(a.events, "hero")[0]!;
    expect(r.edge).toBe(true);
    expect(piece(a.battle, "b1")!.states.some((s) => s.id === "exposed")).toBe(false);
  });
});

describe("the board's edges", () => {
  test("an ally on the far side flanks", () => {
    const b = start([hero([3, 3]), ally([5, 3]), foe("b1", "brute", [4, 3])]);
    expect(flanked(b, piece(b, "hero")!, piece(b, "b1")!)).toBe(true);
    const c = start([hero([3, 3]), ally([4, 5]), foe("b1", "brute", [4, 3])]);
    expect(flanked(c, piece(c, "hero")!, piece(c, "b1")!)).toBe(false);
  });

  test("cover gives +2 Defense against a shot over it", () => {
    const mat = matFrom(["..........", "..........", "..........", "....=.....", "..........", "..........", ".........."]);
    const b = start([hero([2, 3]), foe("b1", "brute", [6, 3])], mat);
    const t = piece(b, "b1")!;
    expect(defenseAgainst(b, [2, 3], { ...t, at: [6, 3] }, true).defense).toBe(t.defense + 2);
    expect(defenseAgainst(b, [2, 3], { ...t, at: [6, 3] }, false).defense).toBe(t.defense);
  });

  test("he's ready for that: the same plain strike at the same foe two rounds running has bane", () => {
    const b = start([hero([4, 3]), foe("b1", "brute", [5, 3], "elite")]);
    const strike = { piece: "hero", act: { act: "strike" as const, target: "b1", plain: true } };
    const r1 = playRound(b, [strike]);
    const r2 = yourTurn(r1.battle, [strike]);
    expect(rollsBy(r2.events, "hero")[0]!.why).toContain("bane: he's ready for that");
    const off = yourTurn({ ...r1.battle, readyForThat: false }, [strike]);
    expect(rollsBy(off.events, "hero")[0]!.why).not.toContain("bane: he's ready for that");
    const said = yourTurn(r1.battle, [{ piece: "hero", act: { act: "strike", target: "b1" } }]);
    expect(rollsBy(said.events, "hero")[0]!.why).not.toContain("bane: he's ready for that");
  });
});

describe("how the kinds move", () => {
  test("a shooter backs off from whoever stands next to it, and still chalks a shot", () => {
    const b = start([hero([4, 3]), foe("a1", "shooter", [5, 3])]);
    expect(dist(piece(b, "a1")!.at, [4, 3])).toBeGreaterThanOrEqual(2);
    expect(intentOf(b, "a1")!.kind).toBe("shot");
  });

  test("a swarm gets round its mark, onto the far side from its own", () => {
    const b = start([hero([4, 3]), foe("w1", "swarm", [3, 3]), foe("w2", "swarm", [8, 3])]);
    expect(piece(b, "w2")!.at).toEqual([5, 3]);
    expect(intentOf(b, "w2")!.target).toBe("hero");
  });

  test("a brute turns on whoever hurt it last", () => {
    let b = start([hero([1, 1]), ally([1, 5]), foe("b1", "brute", [6, 3])]);
    b = setPiece(b, "b1", { hitBy: "kai" });
    b = theirTurn({ ...b, intents: [] }).battle;
    expect(intentOf(b, "b1")!.target).toBe("kai");
  });
});

describe("the end of a fight", () => {
  test("Down: the hero at 0 Stamina loses a red stone; all of you Down is taken", () => {
    let b = start([hero([0, 0]), foe("a1", "shooter", [9, 6])]);
    b = withState(setPiece({ ...b, intents: [] }, "hero", { stamina: 1 }), "hero", "burning", 99);
    const c = theirTurn(b);
    expect(piece(c.battle, "hero")!.down).toBe(true);
    expect(c.battle.wounds).toBe(1);
    expect(c.battle.over).toBe("taken");
  });

  test("every foe out is won", () => {
    let b = start([hero([0, 0]), foe("w1", "swarm", [9, 6], "minion")]);
    b = withState({ ...b, intents: [] }, "w1", "burning", 99);
    const c = theirTurn(b);
    expect(piece(c.battle, "w1")!.out).toBe(true);
    expect(c.battle.over).toBe("won");
  });

  test("breaking away off the edge, all of you, is fled", () => {
    const b = start([hero([0, 3]), foe("b1", "brute", [9, 3])]);
    const a = yourTurn(b, [{ piece: "hero", act: { act: "breakaway" } }]);
    expect(a.battle.over).toBe("fled");
  });

  test("a fight that drags to the round limit is worn out: the side with more left carries it", () => {
    const b = start([hero([0, 3]), foe("b1", "brute", [9, 3])]);
    const late = { ...b, round: ROUND_LIMIT, intents: [] };
    const fresh = theirTurn(late);
    expect(fresh.battle.over).toBe("won");
    expect(fresh.battle.overHow).toBe("worn down");
    const hurt = theirTurn(setPiece(late, "hero", { stamina: 1 }));
    expect(hurt.battle.over).toBe("taken");
    expect(theirTurn({ ...late, round: ROUND_LIMIT - 1 }).battle.over).toBeFalsy();
  });

  test("with the hero down, the rest of the side has a few rounds before they drag the hero clear", () => {
    const b = start([hero([0, 3]), yourPiece({ id: "f1", name: "Friend", stats: { brawn: 2, grace: 2, charm: 1, guile: 1, wits: 1, sense: 1 }, at: [0, 5] }), foe("b1", "brute", [9, 3])]);
    let c = { ...setPiece(b, "hero", { down: true }), intents: [] } as Battle;
    for (let i = 0; i < HERO_DOWN_ROUNDS; i++) {
      c = { ...theirTurn(c).battle, intents: [] };
      expect(c.over).toBeFalsy();
    }
    const end = theirTurn(c).battle;
    expect(end.over).toBe("taken");
    expect(end.overHow).toBe("dragged clear");
  });
});

describe("seeded", () => {
  test("the same fight and the same orders give the same dice and the same board", () => {
    const spec = encounter({ seed: "same", difficulty: 1, side: [{ id: "hero", name: "Wren", stats: STATS, hero: true }] });
    const play = () => {
      let { battle: b } = startBattle(spec);
      const log: BattleEvent[] = [];
      for (let i = 0; i < 6 && !b.over; i++) {
        const r = playRound(b, [readOrder(b, "hero")]);
        b = r.battle;
        log.push(...r.events);
      }
      return JSON.stringify({ b, log });
    };
    expect(play()).toBe(play());
  });

  test("an encounter puts every piece on open floor, each on its own tile", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const spec = encounter({ seed, difficulty: 2, side: [{ id: "hero", name: "Wren", stats: STATS, hero: true }, { id: "kai", name: "Kai", stats: STATS }] });
      expect(spec.pieces.every((p) => open(spec.mat, p.at))).toBe(true);
      expect(new Set(spec.pieces.map((p) => p.at.join())).size).toBe(spec.pieces.length);
      expect(JSON.stringify(plainMat(seed))).toBe(JSON.stringify(plainMat(seed)));
    }
  });

  test("reading the board beats walking up and hitting the nearest one", () => {
    const side = [{ id: "hero", name: "Wren", stats: { ...STATS, brawn: 3 }, hero: true, armor: 1 }];
    let read = 0;
    let plain = 0;
    for (let i = 0; i < 30; i++) {
      for (const [play, add] of [
        [readOrder, () => read++],
        [plainOrder, () => plain++],
      ] as const) {
        let { battle: b } = startBattle(encounter({ seed: `r${i}`, difficulty: 2, side }));
        while (!b.over && b.round <= 20) b = playRound(b, [play(b, "hero")]).battle;
        if (b.over === "won") add();
      }
    }
    expect(read).toBeGreaterThan(plain);
  });

  test("the plain board shows pieces, walls, cover and chalk", () => {
    const mat = matFrom(["#.........", "....=.....", "..........", "..........", "..........", "..........", ".........."]);
    const text = boardText(start([hero([1, 3]), foe("b1", "brute", [4, 3])], mat));
    expect(text.split("\n")[0]![0]).toBe("#");
    expect(text).toContain("=");
    expect(text).toContain("H");
    expect(text).toContain("b");
  });
});
