/**
 * People (docs/LOOP.md, 3; docs/MOONSHOT.md, 3.3): rapport, patience, what they know, lies both ways.
 * All names here are made up for the tests.
 */
import { describe, expect, test } from "bun:test";
import {
  caught,
  favourDone,
  hearLine,
  heldBack,
  hunch,
  lieFound,
  lieTo,
  lineKind,
  likesTouched,
  newVisit,
  personBrief,
  pressDifficulty,
  pressed,
  readThem,
  released,
  rulesLine,
  type Person,
} from "../src/engine/people.js";

const marta: Person = {
  id: "marta",
  name: "Marta",
  voice: "clipped and dry, calls everyone 'friend'",
  wants: "the debt on the inn forgiven",
  likes: ["food", "trade"],
  dislikes: ["flattery", "threats"],
  attitude: "wary",
  resolve: 2,
  knows: [
    { clue: "masks", at: "open" },
    { clue: "cellar", at: "guarded" },
    { clue: "brother", at: "secret" },
    { clue: "ledger", at: "never" },
  ],
  lie: { clue: "masks", truth: "masks-true", skill: 2, why: "protects her brother" },
  sense: 2,
};

describe("rapport", () => {
  test("a line that fits what they like warms them, once a visit", () => {
    const h = hearLine(marta, newVisit("marta"), { kind: "praise", touches: ["food"] });
    expect(h.person.attitude).toBe("friendly");
    expect(h.why).toContain("likes:food");
    const again = hearLine(h.person, h.visit, { kind: "praise", touches: ["food"] });
    expect(again.moved).toBe(0);
  });

  test("flattery to someone who dislikes it costs, and a threat always does", () => {
    expect(hearLine(marta, newVisit("marta"), { kind: "praise", touches: ["flattery"] }).person.attitude).toBe("cold");
    expect(hearLine(marta, newVisit("marta"), { kind: "threat" }).person.attitude).toBe("cold");
  });

  test("only what is on their own list counts, whatever the reader says", () => {
    expect(hearLine(marta, newVisit("marta"), { kind: "smalltalk", touches: ["music", "gossip"] }).moved).toBe(0);
  });

  test("touching what they want warms them", () => {
    expect(hearLine(marta, newVisit("marta"), { kind: "offer", wants: true }).person.attitude).toBe("friendly");
  });
});

describe("patience", () => {
  test("lines that move them or that they answer are free; idle ones wear them out", () => {
    let v = newVisit("marta");
    let p = marta;
    for (let i = 0; i < 3; i++) ({ person: p, visit: v } = hearLine(p, v, { kind: "smalltalk" }));
    expect(v.ended).toBe(true);
    const free = hearLine(marta, newVisit("marta"), { kind: "question" }, true);
    expect(free.tired).toBe(false);
  });
});

describe("what they know", () => {
  test("they tell what fits where they stand", () => {
    expect(released(marta)).toEqual(["masks"]);
    expect(released({ ...marta, attitude: "friendly" })).toEqual(["masks", "cellar"]);
    expect(released({ ...marta, attitude: "close" })).toEqual(["masks", "cellar", "brother"]);
    expect(released({ ...marta, attitude: "cold" })).toEqual([]);
    expect(heldBack({ ...marta, attitude: "close" })).toEqual(["ledger"]);
  });

  test("pressing is easier the more they like you, and frightening them costs", () => {
    expect(pressDifficulty(marta)).toBe(2);
    expect(pressDifficulty({ ...marta, attitude: "close" })).toBe(0);
    expect(pressDifficulty({ ...marta, attitude: "hostile" })).toBe(3);
    const p = pressed(marta, true);
    expect(p.clue).toBe("cellar");
    expect(p.person.attitude).toBe("cold");
  });
});

describe("lies, both ways", () => {
  test("a hunch needs Sense at least their skill at lying", () => {
    expect(hunch(1, marta)).toBe(false);
    expect(hunch(2, marta)).toBe(true);
  });

  test("reading them is never a false answer", () => {
    for (let i = 0; i < 40; i++) {
      const r = readThem(marta, "masks", 2, `s${i}`);
      expect(["false", "unsure"]).toContain(r.told);
      const t = readThem(marta, "cellar", 2, `s${i}`);
      expect(["true", "unsure"]).toContain(t.told);
    }
  });

  test("caught with proof, they give up the truth and think less of you unless they save face", () => {
    expect(caught(marta, false)).toMatchObject({ truth: "masks-true", person: { attitude: "cold" } });
    expect(caught(marta, true).person.attitude).toBe("wary");
  });

  test("your lie is thrown behind the narrator's hand; one seen through leaves them doubting you", () => {
    const tries = Array.from({ length: 60 }, (_, i) => lieTo(marta, 2, `x${i}`));
    expect(tries.some((t) => t.believed)).toBe(true);
    expect(tries.some((t) => !t.believed && t.person.doubts)).toBe(true);
    expect(lieFound(marta).attitude).toBe("hostile");
  });

  test("a favour done makes them close", () => {
    expect(favourDone(marta)).toMatchObject({ attitude: "close", helped: true });
  });
});

describe("reading a line without a model", () => {
  test("kinds and likes by their words", () => {
    expect(lineKind("Tell me who wore the masks?")).toBe("question");
    expect(lineKind("Talk, or else")).toBe("threat");
    expect(lineKind("This stew is the finest I've had")).toBe("praise");
    expect(likesTouched("This stew is the finest I've had")).toEqual(expect.arrayContaining(["food", "flattery"]));
    expect(rulesLine("I could help with the debt on the inn", marta)).toMatchObject({ kind: "offer", wants: true });
  });

  test("what the model is told holds only what code released", () => {
    const b = personBrief(marta, ["Three masked men came at midnight."]);
    expect(b).toContain("clipped and dry");
    expect(b).toContain("Three masked men came at midnight.");
    expect(b).toContain("wary");
  });
});
