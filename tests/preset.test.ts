/**
 * The player's preset, kept for a story (src/game/preset.ts, docs/DESIGN.md 11, item 27): what is left out by
 * structure, how a model's judgement of the rest is read back whole or not at all, and what the snapshot holds.
 */
import { describe, expect, test } from "bun:test";
import type { PromptBlockSnapshotDTO } from "lumiverse-spindle-types";
import { cleanParameters, filled, judged, judgeMessages, parseJudge, readSnapshot, snapshotOf, sortBlocks } from "../src/game/preset.js";

const block = (id: string, over: Partial<PromptBlockSnapshotDTO> = {}): PromptBlockSnapshotDTO => ({
  id,
  name: id,
  content: `Words of ${id}.`,
  role: "system",
  enabled: true,
  position: "pre_history",
  depth: 0,
  marker: null,
  isLocked: false,
  color: null,
  injectionTrigger: [],
  group: null,
  ...over,
});

/** A preset as players have them: a main prompt, the card, style, a permission block, the chat, and what follows it. */
const ORDER: PromptBlockSnapshotDTO[] = [
  block("head", { marker: "category", content: "" }),
  block("main", { marker: "main_prompt", content: "Write vivid, sensory prose. {{char}} is played by you." }),
  block("card", { marker: "char_description", content: "" }),
  block("persona", { marker: "persona_description", content: "" }),
  block("lore", { marker: "world_info_before", content: "" }),
  block("style", { content: "Four paragraphs at least. Past tense, third person." }),
  block("allow", { marker: "jailbreak", content: "Nothing is off the table in this fiction; dark outcomes are written in full." }),
  block("off", { content: "A block the player switched off.", enabled: false }),
  block("history", { marker: "chat_history", content: "" }),
  block("panel", { content: "End every reply with a status panel: HP, location, time.", position: "post_history" }),
  block("recall", { content: "The last thing said was: {{lastMessage}}", position: "post_history" }),
  block("nudge", { content: "Continue the reply.", position: "post_history", injectionTrigger: ["continue"] }),
  block("prefill", { content: "Understood. Here is the reply:", role: "assistant", position: "post_history" }),
  block("depth", { content: "Keep to the style above.", position: "in_history", depth: 2, role: "user_append" }),
  block("locked", { content: "(sealed)", sealed: true }),
];

describe("what is left out by structure", () => {
  const sorted = sortBlocks(ORDER);
  const ids = sorted.kept.map((k) => k.id);

  test("writing blocks, the permission block and the card are kept, in the preset's order", () => {
    expect(ids).toEqual(["main", "card", "style", "allow", "panel", "depth"]);
  });

  test("the slots the game fills, other kinds of reply, a prefill, the live chat and sealed blocks are left out, each with its reason", () => {
    expect(Object.fromEntries(sorted.dropped.map((d) => [d.name, d.why]))).toEqual({ persona: "slot", lore: "slot", recall: "chat", nudge: "trigger", prefill: "prefill", locked: "sealed" });
  });

  test("a block switched off, an empty heading and the chat's own place are simply not there", () => {
    for (const id of ["off", "head", "history"]) {
      expect(ids).not.toContain(id);
      expect(sorted.dropped.map((d) => d.name)).not.toContain(id);
    }
  });

  test("the chat's switches come before the preset's own", () => {
    const s = sortBlocks(ORDER, { off: true, style: false });
    expect(s.kept.map((k) => k.id)).toContain("off");
    expect(s.kept.map((k) => k.id)).not.toContain("style");
  });

  test("what stood after the chat stays after the story; an append is its plain role", () => {
    const by = Object.fromEntries(sorted.kept.map((k) => [k.id, k]));
    expect(by.main!.where).toBe("before");
    expect(by.panel!.where).toBe("after");
    expect(by.depth).toMatchObject({ where: "after", role: "user" });
  });

  test("the host is given plain blocks to fill: on, before any history, and the card's slot as its macro", () => {
    for (const b of sorted.blocks) expect(b).toMatchObject({ enabled: true, position: "pre_history", marker: null, injectionTrigger: [] });
    expect(sorted.blocks.find((b) => b.id === "card")!.content).toBe("{{description}}");
    expect(sorted.blocks.find((b) => b.id === "depth")!.role).toBe("user");
  });
});

describe("what the host made of the blocks", () => {
  test("only blocks count, by their id, and one that came to nothing is absent", () => {
    const text = filled([
      { type: "block", blockId: "main", content: " Write vivid prose. " },
      { type: "block", blockId: "card", content: "   " },
      { type: "chat_history", content: "the whole chat" },
      { type: "block", content: "no id" },
    ]);
    expect(text).toEqual({ main: "Write vivid prose." });
  });
});

describe("the judgement of a model is kept whole or not at all", () => {
  const sorted = sortBlocks(ORDER);
  const text = Object.fromEntries(sorted.kept.map((k) => [k.id, `Text of ${k.id}.`]));
  const asked = judged(sorted.kept, text);

  test("the model is shown every kept block under a short key, and the fixed reasons", () => {
    expect(asked.map((a) => a.key)).toEqual(["b1", "b2", "b3", "b4", "b5", "b6"]);
    const [system, user] = judgeMessages(asked);
    expect(system!.content).toContain("- panel:");
    expect(system!.content).toContain("- plays_player:");
    expect(user!.content).toContain("[b5] panel");
    // The host's ids mean nothing to a model, and are not shown to it.
    expect(user!.content).not.toContain("[panel]");
  });

  test("a good answer names blocks by key and reasons from the list", () => {
    expect(parseJudge('```json\n{"drop": {"b5": "panel"}}\n```', asked)).toEqual({ panel: "panel" });
    expect(parseJudge('{"drop": {}}', asked)).toEqual({});
  });

  test("an unknown key, a reason not on the list, or no JSON, and the whole answer is thrown away", () => {
    expect(parseJudge('{"drop": {"b9": "panel"}}', asked)).toBeNull();
    expect(parseJudge('{"drop": {"b5": "too long", "b1": "panel"}}', asked)).toBeNull();
    expect(parseJudge("I would keep them all.", asked)).toBeNull();
    expect(parseJudge('{"drop": ["b5"]}', asked)).toBeNull();
  });

  test("an answer that would drop everything is not believed", () => {
    const all = Object.fromEntries(asked.map((a) => [a.key, "role"]));
    expect(parseJudge(JSON.stringify({ drop: all }), asked)).toBeNull();
  });
});

describe("the snapshot", () => {
  const sorted = sortBlocks(ORDER);
  const text = { main: "Write vivid prose.", card: "Mira, a smuggler.", style: "Four paragraphs.", allow: "Nothing is off the table.", panel: "End with a status panel.", depth: "Keep to the style." };
  const preset = { id: "p1", name: "Mine", parameters: { temperature: 0.9, max_tokens: 900, model: "another-model", stop: ["\n"], reasoning_effort: "high", top_p: null } };

  test("kept blocks become messages before and after the story; neighbours of one role are joined", () => {
    const s = snapshotOf(preset, sorted, text, { panel: "panel" })!;
    expect(s.before).toEqual([{ role: "system", content: "Write vivid prose.\n\nMira, a smuggler.\n\nFour paragraphs.\n\nNothing is off the table." }]);
    expect(s.after).toEqual([{ role: "user", content: "Keep to the style." }]);
    expect(s.judged).toBe(true);
  });

  test("what a model dropped is listed with what structure dropped, and why", () => {
    const s = snapshotOf(preset, sorted, text, { panel: "panel" })!;
    expect(s.dropped).toContainEqual({ name: "panel", why: "panel" });
    expect(s.dropped).toContainEqual({ name: "prefill", why: "prefill" });
  });

  test("with no model's judgement every kept block stays: the game's own rules still come last", () => {
    const s = snapshotOf(preset, sorted, text, null)!;
    expect(s.after.map((m) => m.content).join(" ")).toContain("status panel");
    expect(s.judged).toBe(false);
  });

  test("the preset's settings go along, without what the game decides for itself", () => {
    expect(snapshotOf(preset, sorted, text, {})!.parameters).toEqual({ temperature: 0.9, max_tokens: 900 });
    expect(cleanParameters({ model: "x" })).toBeUndefined();
    expect(cleanParameters("temperature=1")).toBeUndefined();
  });

  test("nothing left to keep is no snapshot", () => {
    expect(snapshotOf(preset, sorted, {}, {})).toBeNull();
  });

  test("it reads back whole, or not at all", () => {
    const s = snapshotOf(preset, sorted, text, { panel: "panel" })!;
    expect(readSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(readSnapshot({ ...s, before: [{ role: "tool", content: "x" }] })).toBeNull();
    expect(readSnapshot({ ...s, v: 2 })).toBeNull();
    expect(readSnapshot(null)).toBeNull();
  });
});
