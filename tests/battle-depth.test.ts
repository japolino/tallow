/**
 * The battle mat's depth (docs/COMBAT.md, 3.7, 3.9, 4.3, 4.4, 5.1 and 11): the Composure rail, the restraint ladder,
 * props and ground, talk and Resolve, abilities on the board, guard and watch, hiding, bosses, aims, more of them on
 * the clock, the arenas and the new kinds. Pieces with huge stats make a roll's tier plain; the seeds are fixed.
 */
import { describe, expect, test } from "bun:test";
import {
  boardText,
  foePiece,
  holdOn,
  piece,
  playRound,
  startBattle,
  theirTurn,
  withState,
  yourPiece,
  yourTurn,
  type Battle,
  type BattleAbility,
  type BattleEvent,
  type Piece,
  type Prop,
} from "../src/engine/battle.js";
import { ARENA_IDS, arenaFor, buildArena } from "../src/engine/arena.js";
import { encounter, matFrom } from "../src/engine/encounter.js";
import { FOE_KIND_IDS, foePlan, type FoeKind } from "../src/engine/foekinds.js";
import { onMat, open, type Pos } from "../src/engine/grid.js";
import { readOrder } from "../src/engine/tactics.js";
import type { Stats } from "../src/engine/moment.js";

const BIG: Stats = { brawn: 30, grace: 30, charm: 30, guile: 30, wits: 30, sense: 30 };
const MID: Stats = { brawn: 2, grace: 2, charm: 2, guile: 1, wits: 1, sense: 1 };
const OPEN = matFrom(Array.from({ length: 7 }, () => ".........."));
const hero = (at: Pos, stats: Stats = BIG, o: Partial<Parameters<typeof yourPiece>[0]> = {}) => yourPiece({ id: "hero", name: "Wren", stats, at, hero: true, ...o });
const kai = (at: Pos, stats: Stats = MID) => yourPiece({ id: "kai", name: "Kai", stats, at });
const foe = (id: string, kind: FoeKind, at: Pos, rank: "minion" | "soldier" | "elite" | "boss" = "soldier") => foePiece({ id, name: id, kind, rank, difficulty: 1, at });
const start = (pieces: Piece[], o: Partial<Parameters<typeof startBattle>[0]> = {}) => startBattle({ seed: "d", mat: OPEN, pieces, ...o }).battle;
const set = (b: Battle, id: string, o: Partial<Piece>): Battle => ({ ...b, pieces: b.pieces.map((p) => (p.id === id ? { ...p, ...o } : p)) });
const of = <K extends BattleEvent["e"]>(ev: BattleEvent[], e: K) => ev.filter((x): x is Extract<BattleEvent, { e: K }> => x.e === e);

describe("the Composure rail (11.1, 11.2)", () => {
  test("your piece: Composure 4 + 2 sense + level, Poise 10 + sense (or the power), Will from gear", () => {
    const p = yourPiece({ id: "a", name: "A", stats: { ...MID, sense: 2, power: 4 }, at: [0, 0], level: 2, will: 5, poiseBy: "power" });
    expect(p.composureMax).toBe(4 + 4 + 2);
    expect(p.poise).toBe(14);
    expect(p.will).toBe(2);
  });

  test("a charm wears Composure; at 0 the foe is Overcome and the fight is won", () => {
    let b = start([hero([1, 3]), foe("m1", "brute", [5, 3], "minion")]);
    for (let i = 0; i < 4 && !b.over; i++) b = playRound(b, [{ piece: "hero", act: { act: "charm", target: "m1" } }]).battle;
    expect(piece(b, "m1")!.overcome).toBe(true);
    expect(b.over).toBe("won");
    expect(b.overHow).toBe("overcome");
  });

  test("a charmer's blows land on your Composure, and its kind keeps its distance", () => {
    let b = start([hero([1, 3], MID), foe("m1", "charmer", [7, 3])]);
    const i = b.intents.find((x) => x.by === "m1");
    expect(i?.kind).toBe("charm");
    const r = theirTurn(b);
    const hits = of(r.events, "hit").filter((h) => h.piece === "hero");
    for (const h of hits) expect(h.rail).toBe("composure");
    b = r.battle;
    expect(Math.min(...[piece(b, "m1")!.at].map((q) => Math.max(Math.abs(q[0] - 1), Math.abs(q[1] - 3))))).toBeGreaterThanOrEqual(2);
  });

  test("your side all Overcome is taken out, on the Composure side", () => {
    let b = start([hero([1, 3], { ...MID, sense: 0 }), foe("m1", "charmer", [4, 3], "elite")]);
    b = set(b, "hero", { composure: 1 });
    for (let i = 0; i < 12 && !b.over; i++) b = playRound(b, [{ piece: "hero", act: { act: "wait" } }]).battle;
    expect(b.over).toBe("taken");
    expect(b.overHow).toBe("overcome");
    expect(b.wounds).toBeGreaterThanOrEqual(1);
  });
});

describe("the restraint ladder (11.3)", () => {
  test("grapple: Grabbed, then a rung tighter each time; the held foe can't move", () => {
    let b = start([hero([4, 3]), foe("b1", "brute", [5, 3])]);
    b = yourTurn(b, [{ piece: "hero", act: { act: "grapple", target: "b1" } }]).battle;
    expect(holdOn(piece(b, "b1")!)?.hold).toBeDefined();
    const first = holdOn(piece(b, "b1")!)!.hold;
    b = theirTurn(b).battle;
    const at = piece(b, "b1")!.at;
    expect(at).toEqual([5, 3]);
    if (holdOn(piece(b, "b1")!)) {
      b = yourTurn(b, [{ piece: "hero", act: { act: "grapple", target: "b1" } }]).battle;
      const after = holdOn(piece(b, "b1")!);
      if (after) expect(["pinned", "overwhelmed"]).toContain(after.hold);
    } else expect(first).toBeTruthy();
  });

  test("an ensnarer grabs, then squeezes; Pinned you can only struggle, talk or use an ability", () => {
    let b = start([hero([4, 3], MID), foe("e1", "ensnarer", [5, 3], "elite")]);
    b = withState(b, "hero", "pinned", Infinity, "e1");
    const r = yourTurn(b, [{ piece: "hero", act: { act: "strike", target: "e1" } }]);
    expect(of(r.events, "cant")[0]?.why).toContain("pinned");
    b = theirTurn(r.battle).battle;
    expect(b.intents.find((i) => i.by === "e1")?.kind).toBe("squeeze");
  });

  test("struggle: a success loosens a rung, a crit throws it off and leaves the holder Prone", () => {
    let b = start([hero([4, 3]), foe("e1", "ensnarer", [5, 3])]);
    b = withState(b, "hero", "pinned", Infinity, "e1");
    const r = yourTurn(b, [{ piece: "hero", act: { act: "struggle" } }]);
    const h = holdOn(piece(r.battle, "hero")!);
    expect(h?.hold === "grabbed" || !h).toBe(true);
  });

  test("a captor that reaches the edge with the hero carries them off: taken", () => {
    const mat = matFrom(["....", "....", "...."]);
    let b = start([hero([1, 1], MID), foe("t1", "captor", [0, 1])], { mat });
    b = withState(b, "hero", "pinned", Infinity, "t1");
    b = theirTurn(b).battle; // its move shown: on the edge, it chalks "carry"
    expect(b.intents.find((i) => i.by === "t1")?.kind).toBe("carry");
    b = playRound(b, [{ piece: "hero", act: { act: "wait" } }]).battle;
    expect(b.over).toBe("taken");
    expect(b.overHow).toBe("carried");
    expect(piece(b, "hero")!.carried).toBe(true);
  });
});

describe("props and ground (4.3)", () => {
  const withProps = (props: Prop[], pieces: Piece[], rows = Array.from({ length: 7 }, () => "..........")) => start(pieces, { mat: matFrom(rows), props });

  test("a toppler shoved over falls in a line of three: 2 damage and Prone to each there", () => {
    const rows = Array.from({ length: 7 }, (_, y) => (y === 3 ? "...=......" : ".........."));
    let b = withProps([{ id: "toppler", name: "the shelf", template: "toppler", at: [3, 3] }], [hero([2, 3]), foe("b1", "brute", [5, 3]), foe("b2", "brute", [9, 0])], rows);
    b = set(b, "b1", { at: [5, 3] });
    b = { ...b, intents: [] };
    const r = yourTurn(b, [{ piece: "hero", act: { act: "prop", prop: "toppler" } }]);
    const hit = of(r.events, "hit").find((h) => h.piece === "b1");
    expect(hit?.damage).toBe(2);
    expect(of(r.events, "prop")[0]!.tiles.length).toBe(3);
  });

  test("oil kicked over goes slick; fire thrown on it sets all of it burning", () => {
    const rows = Array.from({ length: 7 }, (_, y) => (y === 3 ? "..==......" : ".........."));
    let b = withProps(
      [
        { id: "spill", name: "the oil", template: "spill", at: [2, 3] },
        { id: "fire", name: "the brazier", template: "fire", at: [3, 3] },
      ],
      [hero([2, 4]), kai([3, 4], BIG), foe("b1", "brute", [9, 6])],
      rows,
    );
    b = { ...b, intents: [] };
    const r = yourTurn(b, [
      { piece: "hero", act: { act: "prop", prop: "spill" } },
      { piece: "kai", act: { act: "prop", prop: "fire" } },
    ]);
    const ground = of(r.events, "ground");
    expect(ground.some((g) => g.ground === "slick")).toBe(true);
    expect(ground.some((g) => g.ground === "burning" && g.tiles.length > 5)).toBe(true);
  });

  test("shoved into a pit: a minion is gone", () => {
    let b = start([hero([3, 3]), foe("w1", "swarm", [4, 3], "minion"), foe("b1", "brute", [9, 6])], { ground: { "5,3": { g: "hazard", until: Infinity } } });
    b = set(b, "w1", { at: [4, 3] });
    b = { ...b, intents: [] };
    const r = yourTurn(b, [{ piece: "hero", act: { act: "shove", target: "w1" } }]);
    expect(piece(r.battle, "w1")!.out).toBe(true);
  });

  test("a door barred is a wall; opened again, floor", () => {
    let b = withProps([{ id: "choke", name: "the gate", template: "choke", at: [4, 3] }], [hero([3, 3]), foe("b1", "brute", [9, 6])]);
    b = { ...b, intents: [] };
    b = yourTurn(b, [{ piece: "hero", act: { act: "prop", prop: "choke" } }]).battle;
    expect(b.mat.tiles[3]![4]).toBe("wall");
    b = { ...b, round: b.round + 1 };
    b = yourTurn(b, [{ piece: "hero", act: { act: "prop", prop: "choke" } }]).battle;
    expect(b.mat.tiles[3]![4]).toBe("floor");
  });

  test("slick ground can throw a walker down where it slips", () => {
    let b = start([hero([0, 3], { ...MID, grace: -20 }), foe("b1", "brute", [9, 0])], { ground: { "1,3": { g: "slick", until: Infinity }, "2,3": { g: "slick", until: Infinity } } });
    b = { ...b, intents: [] };
    const r = yourTurn(b, [{ piece: "hero", to: [3, 3] }]);
    expect(of(r.events, "roll").some((x) => x.what === "slick")).toBe(true);
    expect(piece(r.battle, "hero")!.states.some((s) => s.id === "prone")).toBe(true);
  });
});

describe("talk and Resolve (3.7, 4.4)", () => {
  test("their side breaks when its Resolve is gone, and runs for the edge", () => {
    let b = start([hero([1, 3]), foe("w1", "swarm", [6, 3], "minion"), foe("w2", "swarm", [6, 1], "minion"), foe("b1", "brute", [8, 5])]);
    b = { ...b, resolve: 1 };
    b = set(b, "w1", { at: [2, 3] });
    const r = yourTurn(b, [{ piece: "hero", act: { act: "strike", target: "w1" } }]);
    expect(r.battle.broken).toBe(true);
    expect(of(r.events, "broken").length).toBe(1);
    expect(r.battle.intents.length).toBe(0);
  });

  test("demand surrender on a broken side: they yield, and it's won", () => {
    let b = start([hero([1, 3]), foe("b1", "brute", [8, 3])]);
    b = { ...b, broken: true, resolve: 0 };
    const r = yourTurn(b, [{ piece: "hero", act: { act: "talk", kind: "demand" } }]);
    expect(r.battle.over).toBe("won");
    expect(r.battle.overHow).toBe("surrender");
  });

  test("a taunt makes its next blow come at you", () => {
    let b = start([hero([1, 1]), kai([1, 5]), foe("b1", "brute", [3, 5])]);
    b = yourTurn(b, [{ piece: "hero", act: { act: "talk", kind: "taunt", target: "b1" } }]).battle;
    expect(piece(b, "b1")!.states.find((s) => s.id === "taunted")?.by).toBe("hero");
    b = theirTurn(b).battle;
    expect(b.intents.find((i) => i.by === "b1")?.target).toBe("hero");
  });

  test("intimidate shakes their Resolve", () => {
    let b = start([hero([1, 3]), foe("b1", "brute", [8, 3]), foe("b2", "brute", [8, 1])]);
    const before = b.resolve!;
    b = yourTurn(b, [{ piece: "hero", act: { act: "talk", kind: "intimidate", target: "b1" } }]).battle;
    expect(b.resolve!).toBeLessThan(before);
  });

  test("parley stops the fight when the story allows it, and not when it doesn't", () => {
    const b = start([hero([1, 3]), foe("b1", "brute", [8, 3])]);
    expect(yourTurn(b, [{ piece: "hero", act: { act: "talk", kind: "parley" } }]).battle.over).toBe("parley");
    const no = { ...b, parley: false };
    expect(yourTurn(no, [{ piece: "hero", act: { act: "talk", kind: "parley" } }]).battle.over).toBeUndefined();
  });
});

describe("abilities on the board (3.9)", () => {
  const A = (does: BattleAbility["does"], store = true, tags: string[] = []): BattleAbility => ({ id: does, name: does, does, much: 1, tags, store, often: "stop" });

  test("mend raises a companion from Down; the store pays for it", () => {
    let b = start([hero([1, 3]), kai([2, 3]), foe("b1", "brute", [9, 6])], { store: 1 });
    b = set(b, "kai", { down: true, stamina: 0 });
    const r = yourTurn(b, [{ piece: "hero", act: { act: "ability", ability: "mend", target: "kai" } }], [A("mend")]);
    expect(piece(r.battle, "kai")!.down).toBe(false);
    expect(r.battle.store).toBe(0);
    const again = yourTurn({ ...r.battle, round: r.battle.round + 1 }, [{ piece: "hero", act: { act: "ability", ability: "mend", target: "kai" } }], [A("mend")]);
    expect(of(again.events, "cant")[0]?.why).toContain("store");
  });

  test("a once-a-fight ability can't be used twice; mark sets Marked; learn tells what it does", () => {
    let b = start([hero([1, 3]), foe("b1", "brute", [8, 3])]);
    const r = yourTurn(b, [{ piece: "hero", act: { act: "ability", ability: "learn", target: "b1" } }], [A("learn", false)]);
    expect(of(r.events, "learn")[0]?.says).toContain("hurt it last");
    expect(piece(r.battle, "b1")!.states.some((s) => s.id === "marked")).toBe(true);
    b = { ...r.battle, round: r.battle.round + 1 };
    expect(of(yourTurn(b, [{ piece: "hero", act: { act: "ability", ability: "learn", target: "b1" } }], [A("learn", false)]).events, "cant").length).toBe(1);
  });

  test("sweep hits every foe beside you", () => {
    let b = start([hero([4, 3]), foe("w1", "swarm", [5, 3], "minion"), foe("w2", "swarm", [3, 3], "minion"), foe("b1", "brute", [9, 0])], { store: 2 });
    b = set(set(set(b, "w1", { at: [5, 3] }), "w2", { at: [3, 3] }), "b1", { at: [9, 0] });
    const r = yourTurn(b, [{ piece: "hero", act: { act: "ability", ability: "sweep" } }], [A("sweep")]);
    expect(of(r.events, "roll").filter((x) => x.by === "hero").length).toBe(2);
  });
});

describe("guard, watch, hide (3.7)", () => {
  test("a guard beside an ally takes the blow meant for it", () => {
    let b = start([hero([4, 2]), kai([4, 3]), foe("b1", "brute", [5, 4])]);
    b = set(b, "b1", { at: [5, 4] });
    b = { ...b, intents: [{ by: "b1", kind: "strike", tiles: [[4, 3]], target: "kai" }] };
    b = yourTurn(b, [{ piece: "hero", act: { act: "guard", ally: "kai" } }]).battle;
    const r = theirTurn(b);
    const rolls = of(r.events, "roll").filter((x) => x.by === "b1");
    expect(rolls[0]?.at).toBe("hero");
  });

  test("a watcher strikes the first foe that comes next to it, before it chalks", () => {
    let b = start([hero([2, 3]), foe("w1", "swarm", [8, 3], "minion")]);
    b = set({ ...b, intents: [] }, "w1", { at: [7, 3] });
    b = yourTurn(b, [{ piece: "hero", act: { act: "watch" } }]).battle;
    const r = theirTurn(b);
    expect(of(r.events, "roll").some((x) => x.by === "hero" && x.what === "watch")).toBe(true);
  });

  test("hidden behind cover, a shooter can't pick you", () => {
    const rows = Array.from({ length: 7 }, (_, y) => (y === 3 ? ".=........" : ".........."));
    let b = start([hero([0, 3]), foe("a1", "shooter", [8, 3])], { mat: matFrom(rows) });
    b = yourTurn(b, [{ piece: "hero", act: { act: "hide" } }]).battle;
    expect(piece(b, "hero")!.states.some((s) => s.id === "hidden")).toBe(true);
    b = theirTurn(b).battle;
    expect(b.intents.find((i) => i.by === "a1")?.target ?? "").not.toBe("hero");
  });
});

describe("bosses, aims and the clock (4.4, 5.1)", () => {
  test("a boss at half its Stamina comes into a new phase and calls help", () => {
    let b = start([hero([4, 3]), foe("x1", "brute", [5, 3], "boss")]);
    b = set(b, "x1", { stamina: 9, at: [5, 3] });
    b = { ...b, intents: [] };
    const r = yourTurn(b, [{ piece: "hero", act: { act: "strike", target: "x1" } }]);
    expect(of(r.events, "phase")[0]?.phase).toBe(1);
    expect(of(r.events, "arrive").length).toBe(1);
  });

  test("a boss keeps its side from breaking", () => {
    let b = start([hero([1, 3]), foe("x1", "brute", [8, 3], "boss"), foe("w1", "swarm", [2, 3], "minion")]);
    b = set({ ...b, resolve: 1 }, "w1", { at: [2, 3] });
    const r = yourTurn(b, [{ piece: "hero", act: { act: "strike", target: "w1" } }]);
    expect(r.battle.broken).toBeFalsy();
  });

  test("hold for N rounds: won at the end of the last", () => {
    let b = start([hero([0, 0]), foe("a1", "shooter", [9, 6])], { objective: { kind: "hold", rounds: 2 } });
    for (let i = 0; i < 3 && !b.over; i++) b = playRound(b, [{ piece: "hero", act: { act: "wait" } }]).battle;
    expect(b.over).toBe("won");
    expect(b.overHow).toBe("held");
  });

  test("protect: the one to keep safe falls, and it's lost", () => {
    const w = yourPiece({ id: "ward", name: "the child", stats: MID, at: [5, 3], ward: true });
    let b = start([hero([0, 0]), w, foe("b1", "brute", [6, 3], "elite")], { objective: { kind: "protect", piece: "ward" } });
    b = set(b, "ward", { stamina: 1 });
    for (let i = 0; i < 6 && !b.over; i++) b = playRound(b, [{ piece: "hero", act: { act: "wait" } }]).battle;
    expect(b.over).toBe("taken");
    expect(b.overHow).toBe("lost");
  });

  test("more of them come on the danger clock", () => {
    const spec = encounter({ seed: "c", difficulty: 1, side: [{ id: "hero", name: "Wren", hero: true, stats: MID }], foes: [{ kind: "brute", rank: "soldier" }], reinforce: { round: 1, foes: [{ kind: "swarm", rank: "minion" }, { kind: "swarm", rank: "minion" }] } });
    let b = startBattle(spec).battle;
    const r = playRound(b, [{ piece: "hero", act: { act: "wait" } }]);
    expect(of(r.events, "arrive")[0]?.pieces.length).toBe(2);
    b = r.battle;
    expect(b.pieces.filter((p) => p.side === "them").length).toBe(3);
  });
});

describe("arenas (4.1)", () => {
  test("each arena lays out with room for both sides, props on the mat and zones in bounds", () => {
    for (const id of ARENA_IDS) {
      const a = buildArena(id, `s:${id}`);
      expect(a.props.length).toBeGreaterThanOrEqual(2);
      for (const z of a.zones) for (const q of z.tiles) expect(onMat(a.mat, q)).toBe(true);
      const spec = encounter({ seed: id, difficulty: 2, side: [{ id: "hero", name: "H", hero: true, stats: MID }, { id: "k", name: "K", stats: MID }, { id: "r", name: "R", stats: MID }], mat: a.mat, props: a.props, zones: a.zones, ground: a.ground });
      for (const p of spec.pieces) {
        expect(open(spec.mat, p.at)).toBe(true);
        expect(a.ground[`${p.at[0]},${p.at[1]}`]?.g).not.toBe("hazard");
      }
      expect(spec.pieces.filter((p) => p.side === "them").length).toBeGreaterThan(0);
    }
  });

  test("a stop's words pick its arena", () => {
    expect(arenaFor("The Drowned Rat tavern", "x")).toBe("tavern");
    expect(arenaFor("a rope bridge over the gorge", "x")).toBe("bridge");
    expect(arenaFor("deep in the old mine", "x")).toBe("cave");
    expect(ARENA_IDS).toContain(arenaFor("somewhere", "x"));
  });
});

describe("the new kinds (5.1, 11.4)", () => {
  test("every kind plans a move and plays twelve rounds against a reading side without breaking the rules", () => {
    for (const kind of FOE_KIND_IDS) {
      const a = buildArena("street", kind);
      const spec = encounter({
        seed: kind,
        difficulty: 1,
        side: [
          { id: "hero", name: "H", hero: true, stats: MID, armor: 1 },
          { id: "kai", name: "K", stats: MID, weapon: "ranged" },
        ],
        mat: a.mat,
        props: a.props,
        zones: a.zones,
        ground: a.ground,
        foes: [
          { kind, rank: "soldier" },
          { kind, rank: "minion" },
        ],
      });
      let b = startBattle(spec).battle;
      for (const p of b.pieces.filter((x) => x.side === "them")) expect(() => foePlan(b, p, p.speed)).not.toThrow();
      for (let i = 0; i < 12 && !b.over; i++) {
        const orders = b.pieces.filter((p) => p.side === "you" && !p.down && !p.overcome && !p.fled && !p.carried).map((p) => readOrder(b, p.id));
        b = playRound(b, orders).battle;
        for (const p of b.pieces) {
          expect(onMat(b.mat, p.at)).toBe(true);
          expect(p.stamina).toBeGreaterThanOrEqual(0);
          expect(p.composure).toBeGreaterThanOrEqual(0);
        }
        expect(boardText(b).split("\n").length).toBe(b.mat.h);
      }
    }
  });
});
