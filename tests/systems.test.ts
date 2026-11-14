/**
 * The frame the game's systems plug into (src/game/system.ts, src/game/runturn.ts): each moment of a turn reaches a
 * system in order, with what it is promised, and a system that fails costs the turn nothing.
 */
import { describe, expect, test } from "bun:test";
import { attributesFrom, meet, newRun, stateOf, type Run } from "../src/engine/run.js";
import type { Message, Role } from "../src/game/ask.js";
import { begin, pagesOf, sceneOf, showsOf, turn } from "../src/game/runturn.js";
import type { RunDeps, Show, System } from "../src/game/system.js";
import { SYSTEMS, systemsNamed } from "../src/game/systems/index.js";

const JUDGE = {
  kind: "action", act: "shove the goblin off the road", target: "Goblin", item: null, item_named: false, needs_item: null, ability: null, ability_named: false,
  verdict: "challenge", reason: "It may dodge.", attribute: "strength", skill: "Shoving", for: [], against: [], scores: { physical: 0, likelihood: 0, item: null, ability: null, other: null },
};
const BACK = { hp: [{ who: "player", delta: -200 }], minutes: 3 };

function deps(systems: System<any, any>[], over: { judge?: unknown; back?: unknown } = {}): RunDeps & { told: Message[][]; logged: string[] } {
  const told: Message[][] = [], logged: string[] = [];
  return {
    told,
    logged,
    systems,
    log: (m) => void logged.push(m),
    ask: async (messages: Message[], role: Role) => {
      const sys = messages[0]!.content;
      if (role === "builder") return JSON.stringify({ place: { name: "Forest road", text: "Damp." }, calling: "Clerk", attributes: ["strength", "cunning", "dexterity"], skills: ["Shoving", "Running", "Lying", "Hiding"].map((name) => ({ name, level: 2 })), abilities: [], items: [], money: 5, coin: "bronze", people: [], opening: "It begins on a damp road." });
      if (role === "teller") return (told.push(messages), told.length === 1 ? "You shove it." : "The goblin shoves back.");
      if (sys.includes("referee")) return JSON.stringify(over.judge ?? JUDGE);
      if (sys.includes("records")) return JSON.stringify(over.back ?? { minutes: 3 });
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
  };
}

const start = (): Run => {
  const r = newRun(7, "a world", "a hero", "Jay");
  r.sheet.attributes = attributesFrom(["strength"]);
  r.opening = "A goblin stands in the road.";
  r.place = { name: "Forest road", text: "" };
  meet(r, { name: "Goblin", power: 2 });
  return r;
};

describe("the frame of a turn", () => {
  test("every moment reaches a system, in order, with what it is promised", async () => {
    const seen: string[] = [];
    const probe: System<{ n: number }, { m: number }> = {
      name: "probe",
      scene: () => ["PROBE: a line every model is shown"],
      plan: async (_d, r, line) => (seen.push(`plan ${r.turn} ${line}`), { n: 1 }),
      modifiers: (_r, j, plan) => (seen.push(`modifiers ${j.attribute} ${plan?.n}`), [{ what: "the probe", by: 7 }]),
      settle: (r, t, plan) => {
        seen.push(`settle ${t.kind} ${t.verdict} ${t.target} ${t.outcome !== null} ${plan?.n}`);
        stateOf(r, "probe", () => ({ settled: 0 })).settled++;
        return ["A fixed thing the storyteller must show."];
      },
      hint: (_r, t) => (seen.push(`hint ${t.act}`), ["A thing the storyteller may use."]),
      amend: (_r, back, t) => (seen.push(`amend ${back.minutes} ${t.story}`), void (back.minutes = 9)),
      read: async (_d, r, t, plan) => (seen.push(`read ${t.story} core=${t.core} settled=${(r.sys?.probe as { settled: number }).settled} ${plan?.n}`), { m: 2 }),
      apply: (r, read, t) => (seen.push(`apply ${read?.m} minutes=${t.minutes} before=${t.before.turn} now=${r.turn}`), ["Probe applied."]),
      follow: async (_d, _r, _t, more) => {
        const got = await more.narrate("The goblin does this: shove back.");
        seen.push(`follow ${got?.passage}`);
        return ["Probe followed."];
      },
      pages: () => [{ heading: "Probe", his: ["a page"] }],
      shows: () => [{ kind: "tokens", id: "p", name: "Probes", count: 2 }],
    };
    const d = deps([probe]);
    const t = await turn(d, start(), "I shove the goblin.");
    expect(seen).toEqual([
      "plan 0 I shove the goblin.",
      "modifiers strength 1",
      "settle action challenge Goblin true 1",
      "hint shove the goblin off the road",
      "read You shove it. core=null settled=1 1",
      "amend 3 You shove it.",
      "apply 2 minutes=9 before=0 now=1",
      "follow The goblin shoves back.",
    ]);
    expect(t.report.roll!.modifiers).toContainEqual({ what: "the probe", by: 7 });
    expect(t.report.changes).toEqual(expect.arrayContaining(["Probe applied.", "Probe followed."]));
    // What was settled is put to the storyteller, and the scene line is in what it is shown.
    const last = d.told[0]!.at(-1)!.content;
    expect(last).toContain("A fixed thing the storyteller must show.");
    expect(last).toContain("A thing the storyteller may use.");
    // The amended nine minutes of the turn's passage, and three more read from the passage told afterwards.
    expect(t.run.minutes).toBe(12);
    expect(last).toContain("PROBE: a line every model is shown");
    // The passage told afterwards is part of the turn's story and of the beat kept.
    expect(t.story).toBe("You shove it.\n\nThe goblin shoves back.");
    expect(t.run.beats.at(-1)!.story).toBe(t.story);
    expect(sceneOf(d, t.run)).toContain("PROBE:");
    expect(pagesOf(d, t.run)).toEqual([{ heading: "Probe", his: ["a page"] }]);
    expect(showsOf(d, t.run)).toHaveLength(1);
  });

  test("a system that throws at every moment is logged, and the turn is told all the same", async () => {
    const boom = (): never => {
      throw new Error("boom");
    };
    const broken: System = { name: "broken", scene: boom, plan: boom, modifiers: boom, settle: boom, hint: boom, read: boom, amend: boom, apply: boom, follow: boom, spare: boom, pages: boom, shows: boom, seed: boom };
    const d = deps([broken]);
    const t = await turn(d, start(), "I shove the goblin.");
    expect(t.story).toBe("You shove it.");
    expect(t.run.turn).toBe(1);
    expect(d.logged.filter((m) => m.startsWith("broken, ")).length).toBeGreaterThanOrEqual(6);
    expect((await begin(d, { world: "w", who: "h", name: "Jay" }, 3)).place.name).toBe("Forest road");
    expect(pagesOf(d, t.run)).toEqual([]);
  });

  test("a line a system claims is told as story, though the judge took it for a remark to the game", async () => {
    const ooc = { ...JUDGE, kind: "ooc" };
    const taker: System<{ take: boolean }> = { name: "taker", plan: async () => ({ take: true }), claims: (_r, plan) => !!plan?.take, settle: () => ["The thing taken."] };
    const d = deps([taker], { judge: ooc });
    const t = await turn(d, start(), "I will take the second one.");
    expect(t.report.kind).toBe("story");
    expect(t.story).toBe("You shove it.");
    expect(d.told[0]!.at(-1)!.content).toContain("The thing taken.");
    // With nobody claiming it, the same line is answered from outside the story and nothing is told.
    const plain = deps([{ name: "quiet", plan: async () => null, claims: (_r, plan) => !!plan }], { judge: ooc });
    await turn(plain, start(), "How much health do I have?");
    expect(plain.told).toHaveLength(0);
  });

  test("a system may spare a character who would be brought down", async () => {
    const guard: System = {
      name: "guard",
      spare: (r) => ((r.sheet.hp = 20), ["Spared, this once."]),
    };
    const spared = await turn(deps([guard], { back: BACK }), start(), "I shove the goblin.");
    expect(spared.run.downs).toBe(0);
    expect(spared.run.sheet.hp).toBe(20);
    expect(spared.report.changes).toContain("Spared, this once.");
    const fell = await turn(deps([], { back: BACK }), start(), "I shove the goblin.");
    expect(fell.run.downs).toBe(1);
  });

  test("a run begun seeds every system, each in its own state", async () => {
    const a: System = { name: "a", seed: async (_d, r) => void (stateOf(r, "a", () => ({ n: 0 })).n = 1) };
    const b: System = { name: "b", seed: async (_d, r) => void (stateOf(r, "b", () => ({ n: 0 })).n = 2) };
    const r = await begin(deps([a, b]), { world: "w", who: "h", name: "Jay" }, 3);
    expect(r.sys).toEqual({ a: { n: 1 }, b: { n: 2 } });
  });

  test("the list of systems has each by its own name, once", () => {
    const names = SYSTEMS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(["places", "factions", "fight", "quests", "goods", "upkeep", "events", "perks"]);
    expect(systemsNamed(["quests", "places", "nothing"]).map((s) => s.name)).toEqual(["places", "quests"]);
  });
});

describe("what the table is given to lay out", () => {
  test("the most pressing cards come first, a few of each kind, and the rest after them", async () => {
    const { inOrder } = await import("../src/game/runsit.js");
    const card = (group: string, id: string): Show => ({ kind: "card", id, group, title: id, text: "" });
    const shows: Show[] = [
      { kind: "tokens", id: "s", name: "Saves", count: 2 },
      card("quests", "q1"), card("quests", "q2"), card("quests", "q3"),
      card("choices", "c1"), card("choices", "c2"),
      card("perks", "p1"), card("perks", "p2"), card("perks", "p3"),
    ];
    expect(inOrder(shows).map((s) => (s.kind === "map" ? "map" : s.id))).toEqual(["s", "p1", "p2", "p3", "c1", "c2", "q1", "q2", "q3"]);
  });
});
