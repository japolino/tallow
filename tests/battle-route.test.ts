/**
 * From prose to orders on the battle mat (game/battleroute.ts) and the fight stop on the trip (engine/battletrip.ts):
 * the words read a line, the anchors become tiles, companions act by their style, and the end of a fight is the trip's.
 */
import { describe, expect, test } from "bun:test";
import { COURIER, RESCUE } from "../src/content/adventures.js";
import { arrive, attempt, startTrip, type Trip } from "../src/engine/adventure.js";
import { foePiece, piece, startBattle, yourPiece, yourTurn, type Battle } from "../src/engine/battle.js";
import { battleEnd, fightHours, HERO_ID, namesWanted, onTheMat, openBattle, planBattle, poolFor, withBattle } from "../src/engine/battletrip.js";
import { DEFAULT_CONTENT } from "../src/engine/content.js";
import { dist } from "../src/engine/grid.js";
import { plainMat } from "../src/engine/encounter.js";
import { STOCK_KITS as KITS } from "../src/engine/kit.js";
import { rollD20, seededRng } from "../src/engine/dice.js";
import { readOrder } from "../src/engine/tactics.js";
import { youSaid } from "../src/engine/tell-battle.js";
import { actsFor, battleContext, battleRouteWords, lineFor, orderFor, ordersFrom, parseBattleNames, parseBattleRoute, styleOf, styleOrder } from "../src/game/battleroute.js";

const stats = { brawn: 2, grace: 2, charm: 1, guile: 1, wits: 1, sense: 1 };

/** A small board: you and a friend at the west, a brute and an archer at the east. */
function board(): Battle {
  const mat = plainMat("route", 10, 7);
  for (const row of mat.tiles) row.fill("floor");
  mat.tiles[3]![5] = "cover";
  const pieces = [
    yourPiece({ id: "you", name: "you", stats, at: [1, 3], hero: true }),
    yourPiece({ id: "vy", name: "Vypra", stats: { ...stats, charm: 3 }, at: [1, 4] }),
    foePiece({ id: "b1", name: "the drover", kind: "brute", rank: "soldier", difficulty: 1, at: [8, 3] }),
    foePiece({ id: "a1", name: "a bandit archer", kind: "shooter", rank: "soldier", difficulty: 1, at: [9, 1] }),
  ];
  return startBattle({ seed: "route", mat, pieces, props: [{ id: "spill", name: "the oil barrel", template: "spill", at: [6, 3] }] }).battle;
}

const ctxOf = (b: Battle, last?: string) => battleContext(b, { hero: "you", styles: { vy: "talker" }, ...(last ? { last } : {}), charm: true });

describe("the words read a line", () => {
  test("an act, a target by name, a place by name", () => {
    const b = board();
    const ctx = ctxOf(b);
    const r = battleRouteWords("I attack the drover", ctx);
    expect(r.route).toBe("act");
    expect(r.hero).toMatchObject({ act: "strike", target: "b1", plain: true });
    expect(battleRouteWords("I shove the archer back", ctx).hero).toMatchObject({ act: "shove", target: "a1" });
    expect(battleRouteWords("I kick over the oil barrel", ctx).hero).toMatchObject({ act: "prop", target: "spill" });
    expect(battleRouteWords("I taunt the drover so he comes for me", ctx).hero).toMatchObject({ act: "taunt", target: "b1" });
    expect(battleRouteWords("I smile at the archer and work my charm", ctx).hero?.act).toBe("charm");
  });

  test("giving in, a question, and 'again'", () => {
    const b = board();
    expect(battleRouteWords("Enough. I yield.", ctxOf(b)).route).toBe("yield");
    expect(battleRouteWords("How hurt is the drover?", ctxOf(b)).route).toBe("ask");
    expect(battleRouteWords("again", ctxOf(b, "a1")).hero).toMatchObject({ act: "strike", target: "a1" });
  });

  test("struggling is only on offer when you are held, charming only when it can be", () => {
    const b = board();
    expect(actsFor(ctxOf(b))).not.toContain("struggle");
    expect(battleRouteWords("I struggle free", ctxOf(b)).hero?.act).toBe("strike");
    const off = battleContext(b, { hero: "you", charm: false });
    expect(actsFor(off)).not.toContain("charm");
  });

  test("a reader's JSON is checked: unknown targets and acts fall away", () => {
    const b = board();
    const ctx = ctxOf(b);
    const r = parseBattleRoute('{"route":"act","hero":{"act":"strike","target":"z9","move":"behind:b1"},"others":{"Vypra":{"act":"taunt","target":"b1"},"nobody":{"act":"strike"}}}', ctx);
    expect(r?.hero).toEqual({ act: "strike", move: "behind:b1" });
    expect(r?.others).toEqual({ vy: { act: "taunt", target: "b1" } });
    expect(parseBattleRoute('{"route":"act","hero":{"act":"teleport"}}', ctx)?.hero).toEqual({ act: "wait" });
    expect(parseBattleRoute("no json", ctx)).toBeNull();
  });

  test("names for a world are words only, short, and without numbers", () => {
    const n = parseBattleNames('{"foes":{"f1":"the big drover","f2":"rider 2"},"props":{"=":"the bar","T":"a very long name for a simple barrel here"}}');
    expect(n.foes).toEqual({ f1: "the big drover" });
    expect(n.props).toEqual({ "=": "the bar" });
  });
});

describe("intents become orders", () => {
  test("out of reach, a strike moves up as far as it can and says it can't reach", () => {
    const b0 = board();
    const b = { ...b0, pieces: b0.pieces.map((p) => (p.id === "b1" ? { ...p, at: [9, 6] as [number, number] } : p)), intents: [] };
    const got = orderFor(b, "you", { act: "strike", target: "b1" });
    expect(got.order.act).toBeUndefined();
    expect(got.note).toContain("can't");
    expect(dist(got.order.to!, [9, 6])).toBeLessThan(dist([1, 3], [9, 6]));
  });

  test("next to a foe, the strike is kept and the tile is one that reaches", () => {
    const b = board();
    const near = { ...b, pieces: b.pieces.map((p) => (p.id === "b1" ? { ...p, at: [4, 3] as [number, number] } : p)), intents: [] };
    const got = orderFor(near, "you", { act: "strike", target: "b1" });
    expect(got.order.act).toMatchObject({ act: "strike", target: "b1" });
    expect(dist(got.order.to ?? [1, 3], [4, 3])).toBe(1);
  });

  test("'behind' an anchor puts a wall between you and that foe", () => {
    const b = board();
    const got = orderFor(b, "you", { act: "wait", move: "behind:a1" });
    expect(got.order.to).toBeDefined();
  });

  test("companions the line doesn't name act by their style; the line's own orders come first", () => {
    const b = board();
    const r = battleRouteWords("I attack the drover", ctxOf(b));
    const { orders } = ordersFrom(b, r, { hero: "you", styles: { vy: "talker" } });
    expect(orders.map((o) => o.piece)).toEqual(["you", "vy"]);
    expect(styleOf("charm")).toBe("talker");
    expect(styleOf("wits")).toBe("planner");
    expect(styleOf("brawn")).toBe("brawler");
    // A talker taunts whoever has chalked at the hero, when anyone has.
    const atHero = b.intents.find((i) => i.target === "you");
    if (atHero) expect(styleOrder(b, "vy", "talker").act).toMatchObject({ act: "talk", kind: "taunt" });
  });

  test("an order said back as a line reads back to the same act", () => {
    const b = board();
    const o = readOrder(b, "you");
    const line = lineFor(b, o);
    const back = battleRouteWords(line, ctxOf(b));
    expect(back.route).toBe("act");
    if (o.act?.act === "strike") expect(back.hero).toMatchObject({ act: "strike", target: o.act.target });
  });

  test("a blow with no name in it goes at whoever chalked at you, else the nearest foe; sneaking is hiding", () => {
    const b = board();
    const near = { ...b, pieces: b.pieces.map((p) => (p.id === "b1" ? { ...p, at: [2, 3] as [number, number] } : p)), intents: [] };
    const got = orderFor(near, "you", { act: "strike" });
    expect(got.order.act).toMatchObject({ act: "strike", target: "b1" });
    const both = { ...near, pieces: near.pieces.map((p) => (p.id === "a1" ? { ...p, at: [1, 2] as [number, number] } : p)) };
    const chalked = { ...both, intents: [{ by: "a1", kind: "strike", target: "you", tiles: [[1, 3]] } as Battle["intents"][number]] };
    expect(orderFor(chalked, "you", { act: "strike" }).order.act).toMatchObject({ act: "strike", target: "a1" });
    expect(battleRouteWords("I creep past quietly", ctxOf(b)).hero?.act).toBe("hide");
  });

  test("lines about you are in the second person", () => {
    expect(youSaid("you strikes at the drover.")).toBe("You strike at the drover.");
    expect(youSaid("you is no longer prone.")).toBe("You are no longer prone.");
    expect(youSaid("you's blow is wiped (moved).")).toBe("Your blow is wiped (moved).");
    expect(youSaid("you pushes the barrel.")).toBe("You push the barrel.");
    expect(youSaid("the drover strikes at you.")).toBe("The drover strikes at you.");
  });
});

/** The trip with its stop's next throw showing `face`. */
function withFace(t: Trip, face: number): Trip {
  const m = t.facing!.moment;
  for (let i = 0; i < 5000; i++) {
    const seed = `s${i}`;
    if (rollD20(seededRng(`${seed}:${m.stop.id}:try:${m.tries}`)) === face) return { ...t, facing: { ...t.facing!, moment: { ...m, seed } } };
  }
  throw new Error(`no seed for ${face}`);
}
const atFord = (): Trip => {
  const t = arrive(startTrip(RESCUE, COURIER, "test"), "mill")!.trip;
  return arrive(attempt(withFace(t, 18), { way: "sneak" })!.trip, "crossing")!.trip;
};

describe("a fight stop on the trip", () => {
  test("a fight is fought on the mat; your side is you and the companions with you", () => {
    const t = atFord();
    expect(onTheMat(t.facing!.stop)).toBe(true);
    const plan = planBattle(t);
    expect(plan.side[0]).toMatchObject({ id: HERO_ID, hero: true });
    expect(plan.side.length).toBe(1 + t.party.length);
    expect(plan.foes.length).toBeGreaterThan(0);
    const want = namesWanted(plan);
    expect(want.foes.map((f) => f.id)).toEqual(plan.foes.map((_, i) => `f${i + 1}`));
    const { trip } = openBattle(t, plan, { foes: { f1: "the Warden's rider" } });
    const seat = trip.facing!.battle!;
    expect(seat.battle.store).toBe(t.sheet.store);
    expect(seat.battle.pieces.some((p) => p.name.startsWith("the Warden's rider"))).toBe(true);
    // The same trip opens the same fight.
    expect(openBattle(t, planBattle(t)).trip.facing!.battle!.battle).toEqual(openBattle(t, planBattle(t)).trip.facing!.battle!.battle);
  });

  test("winning is getting past: the reward, a place passed, the hours it took", () => {
    const t = atFord();
    const opened = openBattle(t, planBattle(t)).trip;
    const b = opened.facing!.battle!.battle;
    const won = withBattle(opened, { ...b, over: "won", wounds: 1 });
    const end = battleEnd(won)!;
    expect(end.cleared).toBe(true);
    expect(end.trip.facing).toBeNull();
    expect(end.trip.at).toBe("crossing");
    expect(end.trip.passed).toBe(t.passed + 1);
    expect(end.trip.sheet.health).toBe(t.sheet.health - 1);
    expect(end.trip.sheet.hour).toBeCloseTo(t.sheet.hour + fightHours(b.round));
  });

  test("taken out at an ordinary place: beyond it, with less; giving in: out of it whole, with nothing", () => {
    const t = atFord();
    const opened = openBattle(t, planBattle(t)).trip;
    const b = opened.facing!.battle!.battle;
    const taken = battleEnd(withBattle(opened, { ...b, over: "taken" }))!;
    expect(taken.cleared).toBe(false);
    expect(taken.taken).toMatchObject({ supplies: 1 });
    expect(taken.trip.warned).toBe(1);
    const given = battleEnd(withBattle(opened, yourTurn(b, [{ piece: HERO_ID, act: { act: "giveIn" } }]).battle))!;
    expect(given.gaveIn).toBe(true);
    expect(given.trip.at).toBe("crossing");
    expect(given.trip.over).toBeNull();
  });

  test("the kinds follow the world, the place and the content settings", () => {
    const romance = poolFor(KITS["monster-romance"], DEFAULT_CONTENT, "a lamia in the woods");
    expect(romance).toContain("charmer");
    const prim = poolFor(KITS["monster-romance"], { ...DEFAULT_CONTENT, heat: false, dark: false }, "a lamia in the woods");
    expect(prim).not.toContain("charmer");
    expect(prim).not.toContain("captor");
    const riders = poolFor(KITS.medieval, DEFAULT_CONTENT, "two riders at the ford going through his packs");
    expect(riders).not.toContain("swarm");
    expect(poolFor(KITS.medieval, DEFAULT_CONTENT, "wolves at the ford")).toContain("pack");
  });
});
