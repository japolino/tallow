/**
 * Effect and position (docs/MOONSHOT.md, 2): who you are decides what a try can do; the die decides how it goes.
 * All names here are made up for the tests.
 */
import { describe, expect, test } from "bun:test";
import { beatenDial, notchesFor, playRound, startContest } from "../src/engine/contest.js";
import {
  costByPosition,
  couldInstead,
  effectAfter,
  effectOf,
  gapOf,
  hurtsUsed,
  positionOf,
  sureHands,
  traded,
  tradeOf,
  type Foe,
} from "../src/engine/effect.js";

const lich: Foe = { name: "the lich", ratings: { force: 6, talk: 4 }, hurtBy: ["holy", "fire"] };

describe("the gap", () => {
  test("is your side less theirs, or null when they are not rated at it", () => {
    expect(gapOf({ stat: 3 }, lich, "force")).toBe(-3);
    expect(gapOf({ stat: 3, gear: 1, edges: 1, help: true }, lich, "force")).toBe(0);
    expect(gapOf({ stat: 3 }, lich, "sneak")).toBeNull();
    expect(gapOf({ stat: 3 }, null, "force")).toBeNull();
  });

  test("counts scale a step at a time", () => {
    const army: Foe = { ratings: { force: 1 }, scale: "army" };
    expect(gapOf({ stat: 3 }, army, "force")).toBe(3 - 1 - 4);
    expect(gapOf({ stat: 3, scale: "army" }, army, "force")).toBe(2);
  });

  test("gives the effect ladder", () => {
    expect([-5, -3, -2, -1, 0, 1, 2, 3, 6].map(effectOf)).toEqual(["none", "none", "limited", "standard", "standard", "standard", "great", "overwhelming", "overwhelming"]);
    expect(effectOf(null)).toBe("standard");
  });

  test("the naked man with a pan on his head does nothing to the knight, however well he throws", () => {
    const knight: Foe = { name: "the knight", ratings: { force: 5 } };
    const gap = gapOf({ stat: 1, gear: -1 }, knight, "force");
    expect(effectOf(gap)).toBe("none");
    expect(effectAfter("none", "crit_success")).toBe("none");
  });
});

describe("a 20, and trades", () => {
  test("a 20 raises effect one step, never from none", () => {
    expect(effectAfter("limited", "crit_success")).toBe("standard");
    expect(effectAfter("great", "crit_success")).toBe("overwhelming");
    expect(effectAfter("standard", "success")).toBe("standard");
  });

  test("bold trades position for effect, careful the reverse, and never a trade that cannot be paid", () => {
    expect(traded("standard", "risky", "bold")).toEqual({ effect: "great", position: "desperate", traded: "bold" });
    expect(traded("standard", "risky", "careful")).toEqual({ effect: "limited", position: "controlled", traded: "careful" });
    expect(traded("standard", "desperate", "bold").traded).toBeNull();
    expect(traded("limited", "risky", "careful").traded).toBeNull();
    expect(traded("none", "risky", "bold").traded).toBeNull();
  });

  test("the words of a line pick the trade", () => {
    expect(tradeOf("I go all out at him")).toBe("bold");
    expect(tradeOf("I carefully pick the lock")).toBe("careful");
    expect(tradeOf("I pick the lock")).toBeNull();
  });
});

describe("position", () => {
  test("comes from the gap, an ambush, or the stop", () => {
    expect(positionOf(-2)).toBe("desperate");
    expect(positionOf(0)).toBe("risky");
    expect(positionOf(2)).toBe("controlled");
    expect(positionOf(-4, undefined, true)).toBe("controlled");
    expect(positionOf(3, "desperate")).toBe("desperate");
  });

  test("makes a cost lighter or worse, but never touches a try that works", () => {
    expect(costByPosition(2, "fail", "controlled")).toBe(1);
    expect(costByPosition(1, "fail", "controlled")).toBe(1);
    expect(costByPosition(1, "partial", "controlled")).toBe(0);
    expect(costByPosition(1, "fail", "desperate")).toBe(2);
    expect(costByPosition(1, "success", "desperate")).toBe(1);
  });
});

describe("sure hands and weaknesses", () => {
  test("three in a stat is sure hands", () => {
    expect(sureHands(2)).toBe(false);
    expect(sureHands(3)).toBe(true);
  });

  test("a weakness counts only when the line uses it and the foe has it", () => {
    expect(hurtsUsed("I hold up the abbey's relic and pray", lich)).toEqual(["holy"]);
    expect(hurtsUsed("I throw the lamp oil and set it alight with a torch", lich)).toEqual(["fire"]);
    expect(hurtsUsed("I hit it with silver", lich)).toEqual([]);
    expect(hurtsUsed("signal the others", lich)).toEqual([]);
  });

  test("none always says what would change it", () => {
    const could = couldInstead(lich, ["talk", "sneak"]);
    expect(could[0]).toContain("holy");
    expect(could.length).toBeGreaterThan(1);
  });
});

describe("in a contest", () => {
  test("effect decides the notches a try that works puts on", () => {
    expect(notchesFor("success", undefined, "limited")).toBe(1);
    expect(notchesFor("success", undefined, "standard")).toBe(2);
    expect(notchesFor("success", undefined, "great")).toBe(3);
    expect(notchesFor("success", undefined, "none")).toBe(0);
  });

  test("a foe that breaks gives up before its dial is full", () => {
    const c = startContest({ kind: "fight", name: "the ford", holds: 2, foe: { ratings: { force: 2 }, breaks: 0.5 } });
    const f = c.foes[0]!;
    expect(f.breaksAt).toBe(Math.ceil(f.notches / 2));
    const { contest } = playRound(c, "success", undefined, null, undefined, "standard");
    expect(contest.foes.every(beatenDial)).toBe(true);
  });

  test("overwhelming effect fills what is left", () => {
    const c = startContest({ kind: "fight", name: "the ford", holds: 3 });
    const { contest } = playRound(c, "success", undefined, null, undefined, "overwhelming");
    expect(contest.foes.every(beatenDial)).toBe(true);
  });
});
