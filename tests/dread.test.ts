/**
 * The narrator's side (docs/SYSTEMS.md, 5): dread from what goes wrong, the moves it is spent on, and the fault the
 * narrator offers. Every name here is made up.
 */
import { describe, expect, test } from "bun:test";
import { COURIER, RESCUE } from "../src/content/adventures.js";
import { storeAt } from "../src/engine/abilities.js";
import { arrive, attempt, startTrip, type Trip } from "../src/engine/adventure.js";
import { rollD20, seededRng } from "../src/engine/dice.js";
import { applyMove, DREAD_SPEND, dreadFrom, giveIn, movesHere, narratorTurn, pickMove, refuse, TEMPT_MAX, tempting, type MoveKind } from "../src/engine/dread.js";
import { WAYS } from "../src/engine/moment.js";
import { dreadSaid, faultSaid, moveNote, moveRule, temptRead, temptSaid, turnSaid } from "../src/engine/tell-adventure.js";
import { moveMessages } from "../src/game/prompts.js";

function withFace(t: Trip, face: number): Trip {
  const m = t.facing!.moment;
  for (let i = 0; i < 5000; i++) {
    const seed = `s${i}`;
    if (rollD20(seededRng(`${seed}:${m.stop.id}:try:${m.tries}`)) === face) return { ...t, facing: { ...t.facing!, moment: { ...m, seed } } };
  }
  throw new Error(`no seed for ${face}`);
}
const atMill = (seed = "dr"): Trip => arrive(startTrip(RESCUE, COURIER, seed), "mill")!.trip;
const open = (t: Trip) => WAYS.filter((w) => t.facing!.moment.stop.ways[w] && !t.facing!.moment.closed.includes(w));

describe("dread", () => {
  test("a try that costs or fails puts stones in the bowl; one that works cleanly does not", () => {
    expect([dreadFrom("crit_success"), dreadFrom("success"), dreadFrom("partial"), dreadFrom("fail"), dreadFrom("crit_fail")]).toEqual([0, 0, 1, 1, 2]);
    const t = atMill();
    const failed = attempt(withFace(t, 2), { way: "force", stat: "brawn", lever: null })!;
    expect(failed.dread).toBe(1);
    expect(failed.trip.dread).toBe(1);
    expect(turnSaid(failed).some((l) => l.includes("black stone"))).toBe(true);
    expect(attempt(withFace(t, 1), { way: "force", stat: "brawn", lever: null })!.trip.dread).toBe(2);
    expect(attempt(withFace(t, 20), { way: "talk", stat: "charm", lever: null })!.dread).toBe(0);
  });

  test("the narrator says when the bowl is nearly full, and when it is", () => {
    expect(dreadSaid(1, 2)).toContain("One more");
    expect(dreadSaid(2, 3)).toContain("two black stones");
    expect(dreadSaid(1, 3)).toContain("at the next place");
  });

  test("with enough stones, coming to a place spends them on a move there", () => {
    const t = { ...atMill(), dread: DREAD_SPEND };
    const nt = narratorTurn(t)!;
    expect(nt.spent).toBe(DREAD_SPEND);
    expect(nt.trip.dread).toBe(0);
    expect(nt.trip).not.toEqual(t);
    expect(narratorTurn({ ...atMill(), dread: DREAD_SPEND - 1 })).toBeNull();
  });

  test("the moves are seeded: the same story gives the same move", () => {
    const t = { ...atMill("same"), dread: DREAD_SPEND };
    expect(narratorTurn(t)!.move).toEqual(narratorTurn(t)!.move);
  });
});

describe("the narrator's moves", () => {
  test("each does what it says, and no more", () => {
    const t = { ...atMill(), marks: [{ id: "mark:x", way: "talk" as const, name: "a good word from the ferryman", words: ["ferryman"], mark: true }] };
    const m = t.facing!.moment;
    expect(applyMove(t, { kind: "trouble" }).facing!.moment.trouble).toBe(m.trouble + 1);
    expect(applyMove(t, { kind: "shut", way: "talk" }).facing!.moment.closed).toContain("talk");
    const late = applyMove(t, { kind: "delay" });
    expect(late.sheet.hour).toBe(t.sheet.hour + 0.5);
    expect(late.facing!.moment.sheet.hour).toBe(t.sheet.hour + 0.5);
    expect(applyMove(t, { kind: "hurt" }).sheet.health).toBe(t.sheet.health - 1);
    expect(applyMove(t, { kind: "cold" }).facing!.moment.sheet.goodwill).toBe(t.sheet.goodwill - 1);
    const cart = m.stop.levers.find((l) => l.id === "cart")!;
    expect(applyMove(t, { kind: "spoil", lever: cart }).facing!.moment.spent).toContain("cart");
    const soured = applyMove(t, { kind: "sour", lever: t.marks[0]! });
    expect(soured.marks).toEqual([]);
    for (const k of ["trouble", "delay", "hurt", "cold"] as MoveKind[]) expect(moveRule({ kind: k }).length).toBeGreaterThan(10);
    expect(moveRule({ kind: "spoil", lever: cart })).toContain("Her cart");
    expect(moveNote({ kind: "shut", way: "sneak" })).toContain("go unseen");
  });

  test("never one that would finish you: no hurt when hurt already, no shutting the last ways, no delay near the end", () => {
    const t = atMill();
    const hurt = { ...t, sheet: { ...t.sheet, health: 2 } };
    expect(movesHere(hurt).some(([k]) => k === "hurt")).toBe(false);
    const late = { ...t, sheet: { ...t.sheet, hour: RESCUE.deadline.hour - 1.2 } };
    expect(movesHere(late).some(([k]) => k === "delay")).toBe(false);
    const two = { ...t, facing: { ...t.facing!, moment: { ...t.facing!.moment, closed: ["force" as const, "pay" as const] } } };
    expect(open(two).length).toBe(2);
    expect(movesHere(two).some(([k]) => k === "shut")).toBe(false);
    // Over many seeds, a move never leaves fewer than two ways open.
    for (let i = 0; i < 200; i++) {
      const mv = pickMove({ ...t, seed: `p${i}` }, "x")!;
      expect(open(applyMove(t, mv)).length).toBeGreaterThanOrEqual(2);
    }
  });

  test("the model is told what happens, and only that", () => {
    const m = atMill().facing!.moment;
    const [sys, user] = moveMessages(m, moveNote({ kind: "delay" }));
    expect(sys!.content).toContain("already decided");
    expect(user!.content).toContain("holds the player up");
    expect(user!.content).toContain(m.stop.name);
  });
});

describe("temptation", () => {
  const FAULT = "cannot resist an audience";

  test("offered now and again, never at the last place, never with a full store, at most twice a story", () => {
    const low = (t: Trip): Trip => ({ ...t, sheet: { ...t.sheet, store: 0 } });
    const offered = Array.from({ length: 60 }, (_, i) => tempting(low(atMill(`t${i}`)), FAULT)).filter(Boolean).length;
    expect(offered).toBeGreaterThan(5);
    expect(offered).toBeLessThan(40);
    const some = Array.from({ length: 60 }, (_, i) => low(atMill(`t${i}`))).find((t) => tempting(t, FAULT))!;
    expect(tempting({ ...some, sheet: { ...some.sheet, store: storeAt(some.level) } }, FAULT)).toBe(false);
    expect(tempting({ ...some, tempted: TEMPT_MAX }, FAULT)).toBe(false);
    expect(tempting(some, undefined)).toBe(false);
  });

  test("giving in gives back one of the store, and the fault makes things worse here", () => {
    const t = { ...atMill(), sheet: { ...atMill().sheet, store: 1 } };
    const g = giveIn(t)!;
    expect(g.trip.sheet.store).toBe(2);
    expect(g.trip.facing!.moment.sheet.store).toBe(2);
    expect(["shut", "trouble", "cold", "delay"]).toContain(g.move.kind);
    expect(g.trip.tempted).toBe(1);
    expect(refuse(t).tempted).toBe(1);
  });

  test("the offer and the answer, in words", () => {
    expect(faultSaid("cannot resist an audience")).toBe("you cannot resist an audience");
    expect(faultSaid("You never stay to finish what you start.")).toBe("you never stay to finish what you start");
    expect(faultSaid("Stubborn as iron")).toBe("stubborn as iron");
    expect(temptSaid(FAULT, "nerve")[0]).toBe("I know you: you cannot resist an audience.");
    expect(temptSaid(FAULT, "nerve")[1]).toContain("1 of your nerve");
    expect(temptRead("yes, let it")).toBe(true);
    expect(temptRead("no, I hold my tongue")).toBe(false);
    expect(temptRead("hmm")).toBeNull();
  });
});
