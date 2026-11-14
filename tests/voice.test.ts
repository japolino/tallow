/**
 * The narrator's voice for a story (src/game/voice.ts, docs/DESIGN.md 11, item 27): a narration under a preset is one
 * conversation that only grows at its end, each story keeps the preset it began with, and the minds write under it.
 */
import { describe, expect, test } from "bun:test";
import type { PresetSnapshot } from "../src/game/preset.js";
import type { Ask, Message } from "../src/game/ask.js";
import { FRAME, grown, laid, LOG_KEPT, LOG_MAX, recordOf, voiceKeeper, type KeptVoices, type Turn } from "../src/game/voice.js";

const snap = (name = "Mine"): PresetSnapshot => ({
  v: 1,
  presetId: "p1",
  name,
  before: [{ role: "system", content: `STYLE of ${name}: long, sensory, past tense.` }],
  after: [{ role: "system", content: "Stay in the scene." }],
  parameters: { temperature: 0.9 },
  dropped: [],
  judged: true,
});
const JOB: Message[] = [
  { role: "system", content: "This turn's rules." },
  { role: "user", content: "What must be true: the gate is shut." },
];

describe("a narration under a story's voice", () => {
  const log: Turn[] = [{ you: "At the mill.", narrator: "The wheel turns." }];

  test("preset, frame, the story so far, the preset's after blocks, and the turn's own rules and facts last", () => {
    const m = laid({ snapshot: snap(), log }, JOB);
    expect(m.map((x) => x.role)).toEqual(["system", "system", "user", "assistant", "system", "system", "user"]);
    expect(m[1]!.content).toBe(FRAME);
    expect(m.slice(-2)).toEqual(JOB);
  });

  test("the next turn only adds to the end of what came before: the front is the same bytes", () => {
    const s = snap();
    const one = laid({ snapshot: s, log }, JOB);
    const two = laid({ snapshot: s, log: grown(log, { you: "At the mill.\nThe player wrote: \"I wait.\"", narrator: "Nothing stirs." }) }, [JOB[0]!, { role: "user", content: "Something else." }]);
    // Everything up to and including the last told turn of the first call is the start of the second.
    const front = JSON.stringify(one.slice(0, 4)).slice(0, -1);
    expect(JSON.stringify(two).startsWith(front)).toBe(true);
  });

  test("the story so far is cut rarely, and by a lot", () => {
    let l: Turn[] = [];
    const turn = { you: "y".repeat(500), narrator: "n".repeat(1500) };
    let cuts = 0;
    for (let i = 0; i < 100; i++) {
      const next = grown(l, turn);
      if (next.length <= l.length) cuts++;
      l = next;
      expect(l.reduce((n, t) => n + t.you.length + t.narrator.length, 0)).toBeLessThanOrEqual(LOG_MAX);
    }
    expect(cuts).toBeGreaterThan(0);
    expect(cuts).toBeLessThan(100 / ((LOG_MAX - LOG_KEPT) / 2000) + 2);
  });

  test("a place is described the first time it is come to, and only named after", () => {
    const at = { name: "the Mill", situation: "A miller blocks the door." };
    expect(recordOf({ at, wrote: 'I say "hello"', must: "They are not past." })).toBe('At the Mill: A miller blocks the door.\nThe player wrote: "I say \'hello\'"\nThe game: They are not past.');
    expect(recordOf({ at, wrote: "I wait" }, "the Mill")).toBe('At the Mill.\nThe player wrote: "I wait"');
    expect(recordOf({})).toBe("(The story goes on.)");
  });
});

describe("each story keeps the preset it began with", () => {
  const setup = (kept?: unknown, resume?: string) => {
    let taken = 0;
    let stored: KeptVoices | null = null;
    const k = voiceKeeper({ take: async () => snap(`take ${++taken}`), ...(kept !== undefined ? { kept } : {}), keep: (v) => (stored = v), ...(resume ? { resume } : {}) });
    return { k, taken: () => taken, stored: () => stored };
  };

  test("the snapshot is taken once, and is the same to the story's end however the preset changes", async () => {
    const { k, taken } = setup();
    k.ahead();
    k.story("a");
    const first = await k.now();
    k.said({ wrote: "I go in" }, "You go in.");
    k.story("a");
    const again = await k.now();
    expect(taken()).toBe(1);
    expect(again!.snapshot).toBe(first!.snapshot);
    expect(again!.log).toEqual([{ you: 'The player wrote: "I go in"', narrator: "You go in." }]);
  });

  test("a story's ending is told under its own voice; the next story takes the preset anew, with nothing of the last", async () => {
    const { k, taken } = setup();
    k.story("a");
    await k.now();
    k.said({}, "It begins.");
    k.story(null);
    expect((await k.now())!.snapshot.name).toBe("take 1");
    k.ahead();
    k.story("b");
    const b = await k.now();
    expect(b!.snapshot.name).toBe("take 2");
    expect(b!.log).toEqual([]);
    expect(taken()).toBe(2);
  });

  test("a story begun inside a night of free form has its own voice, and the night's is there to come back to", async () => {
    const { k, taken } = setup();
    k.story("night");
    await k.now();
    k.said({}, "The night is young.");
    k.ahead(); // the story is built: the night is not over, so nothing is taken yet
    expect(taken()).toBe(1);
    k.story("thread");
    expect((await k.now())!.snapshot.name).toBe("take 2");
    k.story(null);
    k.story("night");
    const back = await k.now();
    expect(back!.snapshot.name).toBe("take 1");
    expect(back!.log).toHaveLength(1);
  });

  test("what is kept is taken up again at the next sitting; a story that is over is not kept", async () => {
    const one = setup();
    one.k.story("a");
    await one.k.now();
    one.k.said({ wrote: "I knock" }, "Nobody answers.");
    const two = setup(JSON.parse(JSON.stringify(one.stored())), "a");
    const v = await two.k.now();
    expect(two.taken()).toBe(0);
    expect(v!.snapshot.name).toBe("take 1");
    expect(v!.log).toHaveLength(1);
    two.k.story(null);
    expect(two.stored()!.voices).toEqual([]);
  });

  test("with no preset to take, there is no voice, and nothing is kept of it", async () => {
    let stored: KeptVoices | null = null;
    const k = voiceKeeper({ take: async () => null, keep: (v) => (stored = v) });
    k.story("a");
    expect(await k.now()).toBeNull();
    k.said({}, "Said in the game's own voice.");
    expect(stored!.voices).toEqual([]);
    const failing = voiceKeeper({ take: async () => Promise.reject(new Error("no permission")) });
    expect(await failing.now()).toBeNull();
  });
});