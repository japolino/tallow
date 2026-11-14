/**
 * What the table says about a check and the hour (game/runsit.ts, engine/upkeep.ts): the die read out in one measure,
 * and the room's clock following the story.
 */
import { describe, expect, test } from "bun:test";
import { newRun, outcomeOf, thresholds, type Outcome, type Roll } from "../src/engine/run.js";
import { hourOf } from "../src/engine/upkeep.js";
import { checkSaid, faceOf, needOf, rollSaid } from "../src/game/runsit.js";
import type { Judging } from "../src/game/runturn.js";

/** A roll of `raw` with these changes, read against charisma 3 and Persuasion 2. */
function rolled(raw: number, modifiers: Roll["modifiers"], skill = "Persuasion"): Roll {
  const total = Math.round((raw + modifiers.reduce((n, m) => n + m.by, 0) * 0.01) * 100) / 100;
  const at = thresholds(3, false), st = thresholds(2, true);
  const a = outcomeOf(total, at), s = skill ? outcomeOf(total, st) : a;
  return { raw, modifiers, total, attribute: { name: "charisma", level: 3, thresholds: at, outcome: a }, skill: { name: skill, level: 2, thresholds: st, outcome: s, fresh: false }, coin: false, outcome: Math.round((a + s) / 2) as Outcome };
}
const WOLF = [{ what: "how likely it is to work", by: -5 }, { what: "The grey wolf is stronger than you", by: -20 }];

describe("the die read out", () => {
  test("what the die must show is said as a face of the die, with everything for and against counted in", () => {
    const plain = needOf(rolled(0.5, []));
    const hard = needOf(rolled(0.5, WOLF));
    expect(plain).toBeGreaterThan(1);
    expect(plain).toBeLessThanOrEqual(20);
    // A quarter of the roll against you is five faces of the die.
    expect(hard - plain).toBe(5);
    // Thrown at that face it succeeds; a face under it does not, for certain.
    for (const mods of [[], WOLF]) {
      const need = needOf(rolled(0.5, mods));
      const at = rolled((need - 0.5) / 20, mods), under = rolled((need - 1.5) / 20, mods);
      expect(at.attribute.outcome + at.skill.outcome).toBeGreaterThanOrEqual(2);
      // One face lower, the two readings no longer both say success: at best a coin decides it.
      expect(under.attribute.outcome + under.skill.outcome).toBeLessThan(2);
    }
  });
  test("the throw is read out against that face, never against a number in another measure", () => {
    const roll = rolled(0.45, WOLF);
    expect(faceOf(roll)).toBe(9);
    expect(rollSaid(roll)).toBe(`9 on the die, needing about ${needOf(roll)}: ${["critical failure", "major failure", "minor failure", "mixed"][roll.outcome + 3]}.`);
    expect(rollSaid(roll)).not.toContain("25");
    expect(rollSaid(roll)).not.toContain("against you");
  });
  test("when no throw could do it, or any would, no face is named", () => {
    const hopeless = rolled(0.5, [{ what: "how possible it is", by: -90 }]);
    expect(needOf(hopeless)).toBe(21);
    expect(rollSaid(hopeless)).toMatch(/^10 on the die: /);
    const sure = rolled(0.5, [{ what: "how likely it is to work", by: 90 }]);
    expect(needOf(sure)).toBe(1);
    expect(rollSaid(sure)).toMatch(/^10 on the die: /);
  });
  test("before the die, what the rules count is said beside what the judge saw, and what the die must show", () => {
    const roll = rolled(0.45, [...WOLF, { what: "Silver Tongue", by: 5 }]);
    const said = checkSaid({ report: { kind: "action", act: "Talk the wolf down.", verdict: "challenge", reason: "", pro: ["you keep your voice low"], con: ["it is hungry"], second: "", roll, changes: [], ms: { judge: 0, tell: 0, read: 0 } } } as unknown as Judging);
    expect(said[0]).toBe("I take it you mean to talk the wolf down.");
    expect(said).toContain("For you: you keep your voice low; Silver Tongue.");
    // The judge's own reading ("how likely it is to work") is what its words already say; it is not listed again.
    expect(said).toContain("Against you: it is hungry; The grey wolf is stronger than you.");
    expect(said.at(-1)).toBe(`It goes on your charisma, and on Persuasion. With all that counted, you need about ${needOf(roll)} on the die.`);
  });
});

describe("the hour the room shows", () => {
  test("a run begins in the morning and its hour goes forward with its minutes, past midnight without turning back", () => {
    const r = newRun(1, "a world", "a hero", "Ash");
    expect(hourOf(r)).toBe(9);
    r.minutes = 150;
    expect(hourOf(r)).toBe(11.5);
    r.minutes = 16 * 60;
    expect(hourOf(r)).toBe(25);
  });
  test("it follows the run's own calendar when it keeps one", () => {
    const r = newRun(1, "a world", "a hero", "Ash");
    r.sys = { upkeep: { v: 1, start: 20 * 60, needs: [], dated: [], seen: 0 } };
    r.minutes = 90;
    expect(hourOf(r)).toBe(21.5);
  });
});
