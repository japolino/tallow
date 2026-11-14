/**
 * The user's models, used as fully as they will go: each job on its own connection and reasoning, the Decision model
 * reading lines and small choices first, and the card's lorebook picked by meaning. No real model is asked; the
 * Decision model and the ordinary one are pretended.
 */
import { describe, expect, test } from "bun:test";
import type { DecisionAnswer } from "lumiverse-spindle-types";
import { sureChoice, type Decide } from "../src/game/decide.js";
import { pickLore, LORE_MAX, type LoreEntry } from "../src/game/lore.js";
import type { Ask } from "../src/game/ask.js";
import { attemptsFor, cosine, normalizeSettings, patchSettings, pickDecision, pickEmbedding, reasoningOverride, type LlmConn } from "../src/meaning/models.js";
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