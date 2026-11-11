/**
 * The user's models, used as fully as they will go: each job on its own connection and reasoning, the Decision model
 * reading lines and small choices first, and the card's lorebook picked by meaning. No real model is asked; the
 * Decision model and the ordinary one are pretended.
 */
import { describe, expect, test } from "bun:test";
import type { DecisionAnswer } from "lumiverse-spindle-types";
import { COURIER, RESCUE } from "../src/content/adventures.js";
import { startMoment } from "../src/engine/moment.js";
import { pickFromAnswers, pickQuestions, readFromAnswers, readQuestions, sureChoice, type Decide } from "../src/game/decisions.js";
import { pickLore, LORE_MAX, type LoreEntry } from "../src/game/lore.js";
import { pickBy, standIns } from "../src/game/minds.js";
import { modelMinds } from "../src/game/modelminds.js";
import type { Ask } from "../src/game/prompts.js";
import { attemptsFor, cosine, normalizeSettings, patchSettings, pickDecision, pickEmbedding, reasoningOverride, type LlmConn } from "../src/meaning/models.js";

const mill = () => startMoment(RESCUE.stops.find((s) => s.id === "mill")!, COURIER, "q");
const choice = (c: string, p = 0.9): DecisionAnswer => ({ type: "choice", choice: c, confidence: p, probabilities: { [c]: p } });

describe("each job on its own connection", () => {
  const conns: LlmConn[] = [
    { id: "a", model: "claude-sonnet-5-5", isDefault: true, boundReasoning: null },
    { id: "b", model: "small-fast-1", isDefault: false, boundReasoning: null },
  ];
  const none = normalizeSettings({});

  test("the builder thinks when its model can; the jobs asked while you wait never do", () => {
    expect(attemptsFor(none, "builder", conns)).toEqual([
      { reasoning: true, key: "default" },
      { reasoning: false, key: "default" },
    ]);
    for (const role of ["reader", "teller", "hero"] as const) expect(attemptsFor(none, role, conns)).toEqual([{ reasoning: false, key: "default" }]);
  });

  test("a model that cannot think is not asked to, and one that refused once is not asked again", () => {
    const plain: LlmConn[] = [{ id: "a", model: "small-fast-1", isDefault: true, boundReasoning: null }];
    expect(attemptsFor(none, "builder", plain)).toEqual([{ reasoning: false, key: "default" }]);
    expect(attemptsFor(none, "builder", conns, new Set(["default"]))).toEqual([{ reasoning: false, key: "default" }]);
  });

  test("a role given its own connection tries it first, then the default", () => {
    const s = normalizeSettings({ roles: { teller: { connectionId: "b" } } });
    expect(attemptsFor(s, "teller", conns)).toEqual([
      { connectionId: "b", reasoning: false, key: "b" },
      { reasoning: false, key: "default" },
    ]);
  });

  test("the drawer's choices are kept, and choosing auto or default clears them", () => {
    let s = patchSettings(none, { role: "teller", connectionId: "b" });
    s = patchSettings(s, { role: "builder", reasoning: "off" });
    s = patchSettings(s, { decision: "d2", embedding: "off" });
    expect(s).toEqual({ roles: { teller: { connectionId: "b" }, builder: { reasoning: "off" } }, decision: "d2", embedding: "off" });
    s = patchSettings(s, { role: "teller", connectionId: null });
    s = patchSettings(s, { decision: "auto" });
    expect(s).toEqual({ roles: { builder: { reasoning: "off" } }, embedding: "off" });
    expect(attemptsFor(s, "builder", conns)).toEqual([{ reasoning: false, key: "default" }]);
  });

  test("reasoning off is said to the host; a bound setting is kept when thinking", () => {
    expect(reasoningOverride({ reasoning: false, key: "default" })).toEqual({ source: "off" });
    expect(reasoningOverride({ reasoning: true, key: "default" }, { id: "a", model: "x", isDefault: true, boundReasoning: true })).toEqual({ source: "inherit" });
  });

  test("the Decision connection: a TypeSafe one first, none without a key, off when told", () => {
    const list = [
      { id: "d1", provider: "openai", model: "gpt", isDefault: true, hasKey: true },
      { id: "d2", provider: "typesafe", model: "jev-1", isDefault: false, hasKey: true },
      { id: "d3", provider: "typesafe", model: "jev-2", isDefault: false, hasKey: false },
    ];
    expect(pickDecision(undefined, list)).toEqual({ use: true, id: "d2" });
    expect(pickDecision(undefined, [list[2]!])).toEqual({ use: false });
    expect(pickDecision("off", list)).toEqual({ use: false });
    expect(pickDecision(undefined, null)).toEqual({ use: false });
  });

  test("the embedding connection is the primary one that is on", () => {
    const list = [
      { id: "e1", model: "m", dimensions: null, enabled: true, primary: false },
      { id: "e2", model: "m", dimensions: null, enabled: true, primary: true },
    ];
    expect(pickEmbedding(undefined, list)?.id).toBe("e2");
    expect(pickEmbedding("off", list)).toBeNull();
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("the Decision model reads a line", () => {
  test("it is asked only what can be tried: open ways, things still there, and 'none'", () => {
    const m = mill();
    const { questions, state } = readQuestions("I help her fix the cart", m);
    const way = questions.way!;
    expect(way.type === "choice" && Object.keys(way.criteria)).toEqual(["talk", "sneak", "force", "pay", "none"]);
    const lever = questions.lever!;
    expect(lever.type === "choice" && Object.keys(lever.criteria)).toEqual(["cart", "race", "none"]);
    expect((state as { line: string }).line).toBe("I help her fix the cart");
  });

  test("a sure answer is a read; an unsure way goes on to the next reader", () => {
    const m = mill();
    expect(readFromAnswers({ way: choice("talk"), stat: choice("charm"), lever: choice("cart") }, m)).toEqual({ way: "talk", stat: "charm", lever: "cart" });
    expect(readFromAnswers({ way: choice("talk", 0.4) }, m)).toBeUndefined();
    expect(readFromAnswers(null, m)).toBeUndefined();
    expect(readFromAnswers({ way: choice("none") }, m)).toBe("none");
  });

  test("nothing it says can open a way that is shut, or use a thing for the wrong way", () => {
    const m = { ...mill(), closed: ["talk" as const] };
    expect(readFromAnswers({ way: choice("talk") }, m)).toBeUndefined();
    // The cart helps talking, not sneaking: the way stands, the thing is dropped.
    expect(readFromAnswers({ way: choice("sneak"), lever: choice("cart"), stat: choice("grace", 0.3) }, mill())).toEqual({ way: "sneak", stat: null, lever: null });
  });

  test("a pick is taken only when sure, and never 'unclear'", () => {
    const options = { rest: "rest here", on: "press on" };
    expect(pickQuestions("Rest or press on?", "I sit down", options).questions.pick!.type).toBe("choice");
    expect(pickFromAnswers({ pick: choice("rest") }, options)).toBe("rest");
    expect(pickFromAnswers({ pick: choice("unclear") }, options)).toBeNull();
    expect(pickFromAnswers({ pick: choice("rest", 0.5) }, options)).toBeNull();
    expect(pickFromAnswers({ pick: choice("sleep") }, options)).toBeNull();
    expect(sureChoice({ type: "noul", noul: 1 })).toBeNull();
  });
});

describe("the minds use the Decision model first", () => {
  const asked: string[] = [];
  const ask: Ask = async (_m, role) => {
    asked.push(role);
    return '{"way": "sneak", "stat": "grace", "lever": "race", "attempt": "slip along the race"}';
  };

  test("a sure Decision read is used, and the reader model is not asked", async () => {
    asked.length = 0;
    const decide: Decide = async (what) => (what === "reader" ? { way: choice("talk"), stat: choice("charm"), lever: choice("cart") } : null);
    const minds = modelMinds(ask, { decide });
    expect(await minds.read("I offer to help with her cart", mill())).toEqual({ way: "talk", stat: "charm", lever: "cart" });
    expect(asked).toEqual([]);
  });

  test("when it is not sure, or there is none, the reader model reads", async () => {
    asked.length = 0;
    const unsure: Decide = async () => ({ way: choice("talk", 0.3) });
    expect((await modelMinds(ask, { decide: unsure }).read("hmm", mill())) as object).toMatchObject({ way: "sneak", lever: "race" });
    const gone: Decide = async () => null;
    expect((await modelMinds(ask, { decide: gone }).read("hmm", mill())) as object).toMatchObject({ way: "sneak" });
    expect(asked).toEqual(["reader", "reader"]);
  });

  test("a Decision model that hangs does not hold up the turn", async () => {
    asked.length = 0;
    const hangs: Decide = () => new Promise(() => {});
    const r = await modelMinds(ask, { decide: hangs, decideMs: 20 }).read("hmm", mill());
    expect(r as object).toMatchObject({ way: "sneak" });
  });

  test("picking by meaning: the Decision model, else the reader model, and the rules when neither can tell", async () => {
    // With no Decision model the reader answers in JSON.
    const reader = modelMinds(async () => '{"pick": "rest"}');
    expect(await pickBy(reader, "Rest or press on?", "let my wounds close a while", { rest: "rest here", on: "press on" }, () => "on")).toBe("rest");
    const muddled = modelMinds(async () => "I am not sure.");
    expect(await pickBy(muddled, "Rest or press on?", "eh", { rest: "rest here", on: "press on" }, () => "on")).toBe("on");
    const decide: Decide = async (_w, _s, q) => (q.pick ? { pick: choice("rest") } : null);
    const minds = modelMinds(ask, { decide });
    const options = { rest: "rest here", on: "press on" };
    // "Let my wounds close a while" has none of the rules' words for resting: the meaning reads it.
    expect(await pickBy(minds, "Rest or press on?", "let my wounds close a while", options, () => "on")).toBe("rest");
    const blank = modelMinds(ask, { decide: async () => ({ pick: choice("unclear") }) });
    expect(await pickBy(blank, "Rest or press on?", "eh", options, () => "on")).toBe("on");
    expect(await pickBy(standIns(), "Rest or press on?", "eh", options, () => "on")).toBe("on");
  });
});

describe("the card's lore, picked for the builder", () => {
  const e = (title: string, more: Partial<LoreEntry> = {}): LoreEntry => ({ title, keys: [], content: `${title} is part of this world.`, constant: false, order: 0, ...more });

  test("always-on entries and ones the card names come first; the rest are left out", () => {
    const got = pickLore([e("Weather"), e("The Guild", { keys: ["guild"] }), e("Old Law", { constant: true }), e("Moons")], "Mira runs errands for the Guild.");
    expect(got.map((t) => t.split(":")[0])).toEqual(["Old Law", "The Guild"]);
  });

  test("by meaning, the nearest entries are kept even when the card does not name them", () => {
    const got = pickLore([e("Weather"), e("The Harbour"), e("Moons")], "Mira.", [0.1, 0.8, 0.3]);
    expect(got[0]!.startsWith("The Harbour")).toBe(true);
    expect(got.length).toBe(3);
  });

  test("at most a few entries, each cut short; a book with nothing to go on gives its first three", () => {
    const many = Array.from({ length: 20 }, (_, i) => e(`Entry ${i}`, { constant: true, content: "x".repeat(2000) }));
    const got = pickLore(many, "");
    expect(got.length).toBe(LORE_MAX);
    expect(got.every((t) => t.length <= 600)).toBe(true);
    expect(pickLore([e("A"), e("B"), e("C"), e("D")], "").length).toBe(3);
  });
});
