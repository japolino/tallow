/**
 * How hard the game is (src/engine/rules.ts): the dice a roll is thrown with, what is added to every roll, what a fall
 * costs, whether a save takes a killing blow, and whether what cannot work is refused. The usual rules are the game as
 * it was before there was anything to choose, so a run kept from then plays as it did.
 */
import { describe, expect, test } from "bun:test";
import { DICE, readRules, USUAL, type Dice, type Rules } from "../src/engine/rules.js";
import { attributesFrom, draw, fall, meet, newRun, rawRoll, ruleModifiers, rulesOf, take, type Judged, type Run } from "../src/engine/run.js";
import type { Message, Role } from "../src/game/ask.js";
import { OVER_SAYS, showsOf, turn, type RunDeps } from "../src/game/runturn.js";
import type { Told } from "../src/game/system.js";
import { fight } from "../src/game/systems/fight.js";

const run = (rules?: Partial<Rules>): Run => {
  const r = newRun(7, "a world", "a hero", "Jay");
  r.sheet.attributes = attributesFrom(["dexterity", "cunning"]);
  r.sheet.skills.push({ name: "Stealth", xp: 300, level: 3 });
  r.opening = "A goblin rummages in a sack.";
  r.place = { name: "Forest road", text: "" };
  meet(r, { name: "Goblin", power: 2 });
  if (rules) r.rules = { ...USUAL, ...rules };
  return r;
};
const JUDGED: Judged = { attribute: "dexterity", skill: "Stealth", scores: { physical: 0, likelihood: 0 } };

describe("the rules as they are kept", () => {
  test("anything that is not one of the choices is the usual one", () => {
    expect(readRules(null)).toEqual(USUAL);
    expect(readRules("harsh")).toEqual(USUAL);
    expect(readRules({ dice: "3d6", hardship: "cruel", fall: 2, saves: "no", refuse: null })).toEqual(USUAL);
    expect(readRules({ dice: "1d100", hardship: "harsh", fall: "end", saves: false, refuse: false })).toEqual({ dice: "1d100", hardship: "harsh", fall: "end", saves: false, refuse: false });
    expect(readRules({ fall: "lose" })).toEqual({ ...USUAL, fall: "lose" });
  });

  test("a run with no rules of its own plays by the usual ones", () => {
    expect(rulesOf(run())).toEqual(USUAL);
    expect(rulesOf(run({ dice: "50d2" })).dice).toBe("50d2");
  });
});

describe("the dice", () => {
  test("the usual roll is what it always was: four draws, a quarter each", () => {
    const a = run(), b = run(), c = run();
    let sum = 0;
    for (let i = 0; i < 4; i++) sum += draw(c) * 0.25;
    const old = Math.round(sum * 100) / 100;
    expect(rawRoll(a)).toBe(old);
    expect(rawRoll(b, "4d25")).toBe(old);
    expect(a.n).toBe(4);
  });

  test("with no luck every roll is the middle, and no die is drawn", () => {
    const r = run({ dice: "none" });
    expect([rawRoll(r), rawRoll(r), rawRoll(r)]).toEqual([0.5, 0.5, 0.5]);
    expect(r.n).toBe(0);
  });

  test("more dice is less luck: the rolls keep to 0..1 and spread less with every step", () => {
    const spread = (dice: Dice): { sd: number; lo: number; hi: number } => {
      const r = run();
      const xs = Array.from({ length: 4000 }, () => rawRoll(r, dice));
      const mean = xs.reduce((n, x) => n + x, 0) / xs.length;
      expect(Math.abs(mean - 0.5)).toBeLessThan(0.03);
      return { sd: Math.sqrt(xs.reduce((n, x) => n + (x - mean) ** 2, 0) / xs.length), lo: Math.min(...xs), hi: Math.max(...xs) };
    };
    const all = DICE.filter((d) => d !== "none").map(spread);
    for (const s of all) expect(s.lo >= 0 && s.hi <= 1).toBe(true);
    for (let i = 1; i < all.length; i++) expect(all[i]!.sd).toBeLessThan(all[i - 1]!.sd);
    // One die reaches both ends; fifty coins never leave the middle.
    expect(all[0]!.lo).toBeLessThan(0.03);
    expect(all[0]!.hi).toBeGreaterThan(0.97);
    expect(all.at(-1)!.lo).toBeGreaterThan(0.3);
    expect(all.at(-1)!.hi).toBeLessThan(0.7);
  });
});

describe("what is added to every roll", () => {
  test("nothing as the game is usually played; +20 at a kind table, -15 at a harsh one", () => {
    expect(ruleModifiers(run(), JUDGED)).toEqual([]);
    expect(ruleModifiers(run({ hardship: "kind" }), JUDGED)).toEqual([{ what: "a kind table", by: 20 }]);
    expect(ruleModifiers(run({ hardship: "harsh" }), JUDGED)).toEqual([{ what: "a harsh table", by: -15 }]);
  });
});

describe("what a fall costs", () => {
  const carrying = (rules?: Partial<Rules>): Run => {
    const r = run(rules);
    for (const name of ["Rope", "Lantern", "Bread", "Chalk"]) take(r.sheet, { name, text: "", quality: "common", qty: name === "Bread" ? 3 : 1 });
    take(r.sheet, { name: "Travel cloak", text: "", quality: "common", qty: 1 });
    r.sheet.items.find((i) => i.name === "Travel cloak")!.worn = true;
    r.sheet.hp = 0;
    return r;
  };

  test("usually: you come round with a third of your health and all you had", () => {
    const r = carrying();
    expect(fall(r)).toEqual([]);
    expect(r.sheet.hp).toBe(30);
    expect(r.sheet.items).toHaveLength(5);
    expect(r.downs).toBe(1);
    expect(r.over).toBeUndefined();
  });

  test("set to cost what you carry: seven in ten of what is not worn is gone, by the run's own dice", () => {
    const a = carrying({ fall: "lose" }), b = carrying({ fall: "lose" });
    const lost = fall(a);
    expect(lost).toHaveLength(3);
    expect(a.sheet.items).toHaveLength(2);
    expect(a.sheet.items.some((i) => i.name === "Travel cloak")).toBe(true);
    expect(a.sheet.hp).toBe(30);
    // The same seed loses the same things.
    expect(fall(b)).toEqual(lost);
    // With nothing loose, nothing is lost.
    const bare = run({ fall: "lose" });
    expect(fall(bare)).toEqual([]);
  });

  test("set to end the story: it is over, and nothing more is played", async () => {
    const r = carrying({ fall: "end" });
    expect(fall(r)).toEqual([]);
    expect(r.over).toBe(true);
    expect(r.sheet.hp).toBe(0);
    const d = deps({ judge: JUDGE });
    const t = await turn(d, r, "I get up and run.");
    expect(t.story).toBe(OVER_SAYS);
    expect(t.run.turn).toBe(r.turn);
    expect(d.asked).toHaveLength(0);
  });
});

/* ------------------------------------------------- at the turn ------------------------------------------------- */

interface Fake {
  judge?: Record<string, unknown>;
  back?: Record<string, unknown>;
  rules?: unknown;
  systems?: RunDeps["systems"];
}
function deps(f: Fake): RunDeps & { asked: { role: Role; messages: Message[] }[] } {
  const asked: { role: Role; messages: Message[] }[] = [];
  return {
    asked,
    systems: f.systems ?? [],
    ...(f.rules !== undefined ? { rules: () => f.rules } : {}),
    ask: async (messages, role) => {
      asked.push({ role, messages });
      const sys = messages[0]!.content;
      if (role === "teller") return "The story goes on.";
      if (sys.includes("referee")) return JSON.stringify(f.judge ?? {});
      if (sys.includes("records")) return JSON.stringify(f.back ?? {});
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
  };
}
const JUDGE = {
  kind: "action", act: "choke the goblin from behind", target: "Goblin", item: null, item_named: false, needs_item: null, ability: null, ability_named: false,
  verdict: "challenge", reason: "It may wake.", attribute: "dexterity", skill: "Stealth", for: ["its back is turned"], against: ["it smells you"],
  scores: { physical: 0, likelihood: 0, item: null, ability: null, other: null },
};

describe("the rules at the turn", () => {
  test("the rules the player has set are read at every line and written into the run", async () => {
    const t = await turn(deps({ judge: JUDGE, rules: { dice: "none", hardship: "kind" } }), run(), "I choke it.");
    expect(t.run.rules).toEqual({ ...USUAL, dice: "none", hardship: "kind" });
    expect(t.report.roll!.raw).toBe(0.5);
    expect(t.report.roll!.total).toBe(0.7);
    expect(t.report.roll!.modifiers.some((m) => m.what === "a kind table" && m.by === 20)).toBe(true);
    // Changed back in the drawer: the next line is thrown as usual.
    const u = await turn(deps({ judge: JUDGE, rules: {} }), t.run, "I choke it again.");
    expect(u.run.rules).toEqual(USUAL);
    expect(u.report.roll!.modifiers.some((m) => m.what === "a kind table")).toBe(false);
  });

  test("what cannot work is refused as usual, and thrown for where nothing is refused", async () => {
    const no = { ...JUDGE, verdict: "implausible", reason: "It is far too quick." };
    const usual = await turn(deps({ judge: no }), run(), "I catch the arrow in my teeth.");
    expect(usual.report.verdict).toBe("implausible");
    expect(usual.report.roll).toBeNull();
    const open = await turn(deps({ judge: no, rules: { refuse: false } }), run(), "I catch the arrow in my teeth.");
    expect(open.report.verdict).toBe("challenge");
    expect(open.report.roll).not.toBeNull();
  });

  test("a thing you lack is refused as usual, and thrown for where nothing is refused", async () => {
    const lacks = { ...JUDGE, needs_item: "a rope" };
    const usual = await turn(deps({ judge: lacks }), run(), "I lower myself on a rope.");
    expect(usual.report.verdict).toBe("missing");
    const open = await turn(deps({ judge: lacks, rules: { refuse: false } }), run(), "I lower myself on a rope.");
    expect(open.report.verdict).toBe("challenge");
    expect(open.report.roll).not.toBeNull();
  });

  test("a blow that brings you down ends the story where a fall is set to, and the next line is told so", async () => {
    const d = deps({ judge: JUDGE, back: { hp: [{ who: "player", delta: -100 }] }, rules: { fall: "end" } });
    const t = await turn(d, run(), "I charge.");
    expect(t.run.over).toBe(true);
    expect(t.report.changes).toContain("You are brought down, and this story ends here.");
    expect(d.asked.at(-1)!.messages.at(-1)!.content).toContain("this is the end of their story");
    const after = await turn(d, t.run, "I stand up.");
    expect(after.story).toBe(OVER_SAYS);
  });
});

describe("saves from a killing blow", () => {
  const told = (r: Run): Told => ({ line: "", kind: "action", act: "", verdict: "challenge", target: null, item: null, ability: null, attribute: "strength", skill: "", roll: null, outcome: -2, before: structuredClone(r), story: "", core: null, minutes: 0 });

  test("usually one takes the blow; with none, nothing does, and none is laid on the table", () => {
    const a = run();
    const before = told(a);
    a.sheet.hp = 0;
    expect(fight.spare!(a, before)).not.toBeNull();
    expect(a.sheet.hp).toBe(80);
    expect(showsOf(deps({ systems: [fight] }), a).some((s) => s.kind === "tokens")).toBe(true);

    const b = run({ saves: false });
    const then = told(b);
    b.sheet.hp = 0;
    expect(fight.spare!(b, then)).toBeNull();
    expect(b.sheet.hp).toBe(0);
    expect(showsOf(deps({ systems: [fight] }), b).some((s) => s.kind === "tokens")).toBe(false);
    expect(fight.pages!(b).flatMap((p) => p.his).some((l) => l.includes("Saves from a killing blow"))).toBe(false);
  });
});
