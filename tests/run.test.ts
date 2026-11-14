import { describe, expect, test } from "bun:test";
import {
  attributesFrom, draw, fall, feel, gainXp, hurt, judgedModifiers, learn, lose, meet, nameOk, newRun, outcomeOf, pass, person, practise, rawRoll, resolve, restOf,
  ruleModifiers, same, skillLevelAt, skillXpFor, spend, standing, take, thresholds, tierOf, xpBase, xpToNext, type Judged, type Run,
} from "../src/engine/run.js";

const run = (seed = 7): Run => {
  const r = newRun(seed, "a world", "a hero", "Jay");
  r.sheet.attributes = attributesFrom(["dexterity", "cunning", "strength", "charisma", "intelligence"]);
  return r;
};
const judged = (over: Partial<Judged> = {}): Judged => ({ attribute: "dexterity", skill: "Stealth", scores: { physical: 0, likelihood: 0 }, ...over });

describe("dice", () => {
  test("the same seed rolls the same, and rolls stay between 0 and 1", () => {
    const a = run(3), b = run(3);
    for (let i = 0; i < 200; i++) {
      const x = rawRoll(a);
      expect(x).toBe(rawRoll(b));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });
  test("four dice bunch in the middle", () => {
    const r = run(11);
    let mid = 0;
    for (let i = 0; i < 4000; i++) {
      const x = rawRoll(r);
      if (x >= 0.3 && x <= 0.7) mid++;
    }
    expect(mid / 4000).toBeGreaterThan(0.75);
  });
  test("draw is in [0, 1)", () => {
    const r = run(5);
    for (let i = 0; i < 500; i++) {
      const x = draw(r);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("thresholds", () => {
  test("at what is expected they are 0.10, 0.25, 0.43, 0.57, 0.75, 0.90", () => {
    expect(thresholds(6.4, false)).toEqual([0.1, 0.25, 0.43, 0.57, 0.75, 0.9]);
    expect(thresholds(1.8, true)).toEqual([0.1, 0.25, 0.43, 0.57, 0.75, 0.9]);
  });
  test("a higher level lowers every threshold, a lower one raises them", () => {
    const low = thresholds(2, false), mid = thresholds(6, false), high = thresholds(12, false);
    for (let i = 0; i < 6; i++) {
      expect(low[i]!).toBeGreaterThanOrEqual(mid[i]!);
      expect(mid[i]!).toBeGreaterThanOrEqual(high[i]!);
    }
    expect(low[5]!).toBeGreaterThan(high[5]!);
  });
  test("thresholds rise from first to last", () => {
    for (const lvl of [1, 2, 4, 6, 9, 14]) {
      const t = thresholds(lvl, false);
      for (let i = 1; i < 6; i++) expect(t[i]!).toBeGreaterThanOrEqual(t[i - 1]!);
    }
  });
  test("a roll is read as one of seven outcomes", () => {
    const t = [0.1, 0.25, 0.43, 0.57, 0.75, 0.9];
    expect(outcomeOf(0.05, t)).toBe(-3);
    expect(outcomeOf(0.1, t)).toBe(-2);
    expect(outcomeOf(0.3, t)).toBe(-1);
    expect(outcomeOf(0.5, t)).toBe(0);
    expect(outcomeOf(0.6, t)).toBe(1);
    expect(outcomeOf(0.8, t)).toBe(2);
    expect(outcomeOf(0.95, t)).toBe(3);
    expect(outcomeOf(1.4, t)).toBe(3);
    expect(outcomeOf(-0.2, t)).toBe(-3);
  });
});

describe("modifiers", () => {
  test("what cannot be done counts harder than ease counts for", () => {
    expect(judgedModifiers({ physical: -2, likelihood: 0 })).toEqual([{ what: "how possible it is", by: -10 }]);
    expect(judgedModifiers({ physical: 2, likelihood: 0 })).toEqual([{ what: "how possible it is", by: 6 }]);
  });
  test("scores are kept between -3 and 3, and nothing is said of a zero", () => {
    expect(judgedModifiers({ physical: 0, likelihood: 9 })).toEqual([{ what: "how likely it is to work", by: 15 }]);
    expect(judgedModifiers({ physical: 0, likelihood: 0, item: 0, ability: null, other: null })).toEqual([]);
  });
  test("a thing used, an ability and one more thing each count", () => {
    const m = judgedModifiers({ physical: 0, likelihood: 1, item: 2, ability: -1, other: { what: "the guard is half asleep", score: 3 } });
    expect(m.map((x) => x.by)).toEqual([5, 10, -5, 15]);
    expect(m[3]!.what).toBe("the guard is half asleep");
  });
  test("a level stands on the seven steps of power", () => {
    expect(tierOf(1)).toBe(2);
    expect(tierOf(5)).toBe(3);
    expect(tierOf(20)).toBe(7);
    expect(tierOf(3)).toBeCloseTo(2.5);
  });
  test("a strong ability helps; a hostile foe much stronger than you tells against you", () => {
    const r = run();
    r.sheet.abilities.push({ name: "Shadow Step", text: "", tier: 2, kind: "innate", wait: 0 }, { name: "Quick Hands", text: "", tier: 0, kind: "innate", wait: 0 }, { name: "Old Trick", text: "", tier: 0, kind: "learned", wait: 0 });
    expect(ruleModifiers(r, judged({ ability: "shadow step" }))).toEqual([{ what: "Shadow Step", by: 15 }]);
    expect(ruleModifiers(r, judged({ ability: "Quick Hands" }))).toEqual([]);
    expect(ruleModifiers(r, judged({ ability: "Old Trick" }))).toEqual([{ what: "Old Trick", by: 5 }]);
    meet(r, { name: "The Ogre", power: 5, hostile: true });
    meet(r, { name: "Mira", power: 6 });
    expect(ruleModifiers(r, judged({ target: "ogre" }))).toEqual([{ what: "The Ogre is stronger than you", by: -30 }]);
    expect(ruleModifiers(r, judged({ target: "Mira" }))).toEqual([]);
  });
});

describe("resolving", () => {
  test("the outcome is the middle of the attribute's reading and the skill's", () => {
    for (let seed = 1; seed < 60; seed++) {
      const r = run(seed);
      r.sheet.skills.push({ name: "Stealth", xp: skillXpFor(4), level: 4 });
      const x = resolve(r, judged());
      const mid = (x.attribute.outcome + x.skill.outcome) / 2;
      expect(Math.abs(x.outcome - mid)).toBeLessThanOrEqual(0.5);
      expect(x.coin).toBe((x.attribute.outcome + x.skill.outcome) % 2 !== 0);
      expect(Number.isInteger(x.outcome)).toBe(true);
      expect(x.total).toBeCloseTo(x.raw, 5);
    }
  });
  test("with no skill named, the attribute alone is read", () => {
    const r = run(9);
    const x = resolve(r, judged({ skill: "" }));
    expect(x.outcome).toBe(x.attribute.outcome);
    expect(x.coin).toBe(false);
  });
  test("good scores make good outcomes likelier", () => {
    let good = 0, bad = 0;
    for (let seed = 1; seed <= 300; seed++) {
      good += resolve(run(seed), judged({ scores: { physical: 2, likelihood: 3 } })).outcome;
      bad += resolve(run(seed), judged({ scores: { physical: -2, likelihood: -3 } })).outcome;
    }
    expect(good).toBeGreaterThan(bad + 300);
  });
});

describe("names", () => {
  test("the same thing under another spelling", () => {
    expect(same("The Rusty Key", "rusty key")).toBe(true);
    expect(same("Mira", "Mira's")).toBe(false);
    expect(same("", "")).toBe(false);
  });
  test("a new name must be a real one, not the player's and not already known", () => {
    const r = run();
    r.sheet.name = "Jay Carter";
    meet(r, { name: "Mira" });
    expect(nameOk(r, "you")).toBe(false);
    expect(nameOk(r, "Jay")).toBe(false);
    expect(nameOk(r, "jay carter")).toBe(false);
    expect(nameOk(r, "Mira")).toBe(false);
    expect(nameOk(r, "<name>")).toBe(false);
    expect(nameOk(r, "The scarred ferryman")).toBe(true);
  });
  test("an old name still finds someone", () => {
    const r = run();
    const p = meet(r, { name: "The hooded woman" })!;
    p.was.push(p.name);
    p.name = "Sela";
    expect(person(r, "hooded woman")).toBe(p);
    expect(person(r, "Sela")).toBe(p);
  });
});

describe("growing", () => {
  test("skill levels and the experience they take agree", () => {
    for (let l = 1; l <= 10; l++) expect(skillLevelAt(skillXpFor(l))).toBe(l);
    expect(skillXpFor(2)).toBe(100);
  });
  test("a new skill is written down at level 1 and grows from its next use", () => {
    const s = run().sheet;
    expect(practise(s, "grappling")).toBe("A new skill: Grappling.");
    expect(s.skills[0]).toEqual({ name: "Grappling", xp: 0, level: 1 });
    expect(practise(s, "Grappling")).toBeNull();
    expect(s.skills[0]!.xp).toBe(45);
    practise(s, "Grappling");
    expect(practise(s, "Grappling")).toBe("Grappling is now level 2.");
  });
  test("an attribute is never a skill", () => {
    const s = run().sheet;
    expect(practise(s, "Strength")).toBeNull();
    expect(s.skills).toEqual([]);
  });
  test("levels cost 100, 130, 169, 217", () => {
    expect([1, 2, 3, 4].map(xpToNext)).toEqual([100, 130, 169, 217]);
  });
  test("deeds are worth 8, 14 and 20 at level 1, and small ones nothing", () => {
    expect(xpBase(1)).toBe(10);
    for (const [size, got] of [[1, 0], [2, 0], [3, 8], [4, 14], [5, 20]] as const) {
      const s = run().sheet;
      gainXp(s, size);
      expect(s.xp).toBe(got);
    }
  });
  test("a level gained brings three points, spent one at a time", () => {
    const s = run().sheet;
    s.xp = 95;
    const said = gainXp(s, 5);
    expect(s.level).toBe(2);
    expect(s.xp).toBe(15);
    expect(s.points).toBe(3);
    expect(said.length).toBe(2);
    expect(spend(s, "strength")).toBe(true);
    expect(s.attributes.strength).toBe(5);
    s.points = 0;
    expect(spend(s, "strength")).toBe(false);
  });
  test("attributes start at 20 points in all", () => {
    const a = attributesFrom(["cunning", "nonsense", "strength"]);
    expect(Object.values(a).reduce((n, x) => n + x, 0)).toBe(20);
    expect(a.cunning).toBe(6);
    expect(a.strength).toBe(5);
  });
});

describe("what the story changes", () => {
  test("health stays between nothing and full", () => {
    const s = run().sheet;
    expect(hurt(s, -30)).toBe(-30);
    expect(hurt(s, 500)).toBe(30);
    expect(hurt(s, -500)).toBe(-100);
    expect(s.hp).toBe(0);
  });
  test("being brought down leaves a third of your health", () => {
    const r = run();
    r.sheet.hp = 0;
    fall(r);
    expect(r.sheet.hp).toBe(30);
    expect(r.downs).toBe(1);
  });
  test("feelings move a step at most, and name a standing", () => {
    const r = run();
    const p = meet(r, { name: "Mira" })!;
    expect(feel(p, 40)).toBe(10);
    expect(feel(p, 7)).toBe(7);
    expect(standing(p.feeling)).toBe(1);
    const foe = meet(r, { name: "Brakk", hostile: true })!;
    expect(foe.feeling).toBe(-15);
    expect(standing(foe.feeling)).toBe(-1);
  });
  test("things are gained, piled and lost", () => {
    const s = run().sheet;
    take(s, { name: "Healing herb", qty: 2 });
    take(s, { name: "healing herb" });
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.qty).toBe(3);
    expect(lose(s, "Healing Herb", 5)).toBe(3);
    expect(s.items).toEqual([]);
    expect(lose(s, "nothing")).toBe(0);
    expect(take(s, { name: "<thing>" })).toBeNull();
  });
  test("an ability is learned once, and rests after use", () => {
    const r = run();
    const a = learn(r.sheet, "Ember Palm", "A burning strike.")!;
    expect(learn(r.sheet, "ember palm", "again")).toBeNull();
    expect(restOf(a)).toBe(4);
    a.wait = restOf(a);
    pass(r);
    expect(a.wait).toBe(3);
    expect(r.turn).toBe(1);
  });
});
