/**
 * The reads moved from words to meaning (docs/model-audit.md): each asks a model first and keeps its word rule for when
 * no model can tell. These check the answers are read safely, and that a model's answer wins over the words.
 */
import { describe, expect, test } from "bun:test";
import type { DecisionAnswer } from "lumiverse-spindle-types";
import { ageFrom } from "../src/engine/content.js";
import { courtable, type CardInfo } from "../src/game/card.js";
import { parseContentChange, parsePick } from "../src/game/decisions.js";
import { hearFromAnswers, parseHear } from "../src/game/hear.js";
import { contentBy, handedToBy, waitBy } from "../src/game/meaning.js";
import { standIns, type Minds } from "../src/game/minds.js";
import { DEFAULT_CONTENT } from "../src/engine/content.js";
import type { Person } from "../src/engine/people.js";
import type { Fellow } from "../src/engine/seats.js";

const choice = (c: string, p = 0.9): DecisionAnswer => ({ type: "choice", choice: c, probabilities: { [c]: p }, confidence: p });
const picking = (answer: string | null): Minds => ({ ...standIns(0), pick: async () => answer });

describe("who is a minor", () => {
  test("a model's 'minor' always wins; the words still block when a model says adult", () => {
    expect(ageFrom("minor", "Hilde, a blacksmith of forty")).toBe("minor");
    expect(ageFrom("adult", "a girl of 14")).toBe("minor");
    expect(ageFrom("adult", "Sable, a first-year at the academy")).toBe("adult");
    expect(ageFrom(undefined, "a woman of thirty")).toBe("adult");
    expect(ageFrom("nonsense", "someone")).toBe("unclear");
  });

  test("a card a model read as a minor is never courted, whatever its words", () => {
    const card: CardInfo = { name: "Pip", description: "Pip is a first-year at the academy, small for their year." };
    expect(courtable(card)).toBe(true);
    expect(courtable({ ...card, minor: true })).toBe(false);
    // The words still block when they plainly say so, even if a model said adult.
    expect(courtable({ name: "Ann", description: "Ann is a 15-year-old schoolgirl.", minor: false })).toBe(false);
  });
});

describe("how a line lands with a person", () => {
  const p = { name: "Hesk", likes: ["food", "story"], dislikes: ["flattery"], wants: "a new anvil" } as unknown as Person;
  test("from the Decision model: the kind when sure, likes only from their own lists", () => {
    expect(hearFromAnswers({ kind: choice("threat"), touches: choice("food"), wants: choice("no"), gift: choice("none") }, p)).toEqual({ kind: "threat", touches: ["food"], wants: false });
    expect(hearFromAnswers({ kind: choice("gift"), touches: choice("coin"), wants: choice("yes"), gift: choice("food") }, p)).toEqual({ kind: "gift", touches: [], wants: true, gift: "food" });
    expect(hearFromAnswers({ kind: choice("threat", 0.3) }, p)).toBeNull();
  });
  test("from the reader: JSON checked the same way", () => {
    expect(parseHear('{"kind": "praise", "touches": ["flattery", "music"], "wants": true}', p)).toEqual({ kind: "praise", touches: ["flattery"], wants: true });
    expect(parseHear('{"kind": "dance"}', p)).toBeNull();
    expect(parseHear("no idea", p)).toBeNull();
  });
});

describe("small reads by meaning", () => {
  test("a pick from the reader names one of the options, or nothing", () => {
    const o = { rest: "rest", on: "press on" };
    expect(parsePick('{"pick": "Rest"}', o)).toBe("rest");
    expect(parsePick('{"pick": "unclear"}', o)).toBeNull();
    expect(parsePick("on", o)).toBe("on");
  });

  test("a try handed to a fellow by meaning, by the words when no model can tell", async () => {
    const mira = { id: "f1", name: "Mira" } as Fellow;
    expect((await handedToBy(picking("f1"), "Mira, your knives are quicker than mine", [mira]))?.id).toBe("f1");
    expect(await handedToBy(picking("me"), "let Mira watch while I climb", [mira])).toBeNull();
    expect((await handedToBy(standIns(0), "let Mira pick it", [mira]))?.id).toBe("f1");
  });

  test("a wait named by meaning, by the words when no model can tell", async () => {
    expect(await waitBy(picking("for-3"), "I bide a while", 10)).toEqual({ hours: 3 });
    expect(await waitBy(picking("until-dawn"), "till the cock crows", 22)).toEqual({ until: 30 });
    expect(await waitBy(standIns(0), "I wait two hours", 10)).toEqual({ hours: 2 });
  });

  test("content set at the table: a model's change, 'same' for none, and the words with no model", async () => {
    expect(parseContentChange('{"changes": true, "heat": false, "addVeils": ["Torture"]}', DEFAULT_CONTENT)).toEqual({ ...DEFAULT_CONTENT, heat: false, veils: ["torture"] });
    expect(parseContentChange('{"changes": false}', DEFAULT_CONTENT)).toBe("same");
    const m = { ...standIns(0), content: async () => "same" as const };
    expect(await contentBy(m, "something with dragons, please", DEFAULT_CONTENT)).toBeNull();
    expect((await contentBy(standIns(0), "lines: gore", DEFAULT_CONTENT))?.lines).toEqual(["gore"]);
  });
});
