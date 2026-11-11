/**
 * The margin (docs/MOONSHOT.md, 3): every stat is a way of noticing, and your fault speaks now and then.
 * All names here are made up for the tests.
 */
import { describe, expect, test } from "bun:test";
import { faultDue, FAULT_MAX, foeNotices, marginFor, marginLine, MARGIN_MAX, type Notice } from "../src/engine/margin.js";
import type { Stats } from "../src/engine/moment.js";

const keen: { stats: Stats } = { stats: { brawn: 0, grace: 1, charm: 1, guile: 3, wits: 1, sense: 2 } };
const dull: { stats: Stats } = { stats: { brawn: 4, grace: 1, charm: 1, guile: 0, wits: 1, sense: 1 } };
const tavern: Notice[] = [
  { id: "boots", stat: "sense", at: 2, says: "wet boots on a dry night." },
  { id: "bins", stat: "guile", at: 3, says: 'the barkeep\'s "nothing back there but bins" came too fast.' },
  { id: "stair", stat: "grace", at: 2, says: "the back stair is not barred." },
];

describe("what your hero notices", () => {
  test("only what you are good enough to see, the hardest finds first", () => {
    expect(marginFor(keen, tavern).map((n) => n.id)).toEqual(["bins", "boots"]);
    expect(marginFor(dull, tavern)).toEqual([]);
  });

  test("two heroes in the same tavern see different taverns", () => {
    const strong = { stats: { ...dull.stats, grace: 2 } };
    expect(marginFor(strong, tavern).map((n) => n.id)).toEqual(["stair"]);
  });

  test("nothing is written twice, and never more than the margin holds", () => {
    expect(marginFor(keen, tavern, ["bins"]).map((n) => n.id)).toEqual(["boots"]);
    const many = Array.from({ length: 8 }, (_, i): Notice => ({ id: `n${i}`, stat: "guile", at: 1, says: "x" }));
    expect(marginFor(keen, many)).toHaveLength(MARGIN_MAX);
  });

  test("a note is written with the stat in capitals; the seventh goes by the world's name", () => {
    expect(marginLine({ id: "a", stat: "sense", says: "wet boots." })).toBe("SENSE — wet boots.");
    expect(marginLine({ id: "a", stat: "power", says: "a ward on the door." }, "Arcana")).toBe("ARCANA — a ward on the door.");
  });
});

describe("the fault", () => {
  test("speaks behind your best stat, in your own hand", () => {
    const notes = marginFor(dull, [], [], { due: true, seed: "s" });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.fault).toBe(true);
    expect(notes[0]!.stat).toBe("brawn");
  });

  test("never more than twice a story, and not at every place", () => {
    expect(faultDue(FAULT_MAX, "anything")).toBe(false);
    const due = Array.from({ length: 200 }, (_, i) => faultDue(0, `seed${i}`)).filter(Boolean).length;
    expect(due).toBeGreaterThan(20);
    expect(due).toBeLessThan(90);
  });
});

describe("what a foe gives away", () => {
  test("brawn judges it, sense sees what it fears, wits knows a second weakness, guile knows when it breaks", () => {
    const notices = foeNotices({ name: "the lich", ratings: { force: 6 }, hurtBy: ["holy", "fire"], breaks: 0.5 }, "lich");
    expect(notices.map((n) => n.stat)).toEqual(["brawn", "sense", "wits", "guile"]);
    expect(notices[0]!.says).toContain("Not head on");
    expect(foeNotices(null)).toEqual([]);
  });
});
