/**
 * The faction rack's side of the factions system: the ladder it draws, the "standing" Show, the help a group gives
 * (written by the strong model, needs and rests owned by code), calling on it from a line, and the lesson. Models faked.
 */
import { describe, expect, test } from "bun:test";
import { find, readState, type Factions } from "../src/engine/factions.js";
import type { Run } from "../src/engine/run.js";
import type { Message, Role } from "../src/game/ask.js";
import { begin, lessonOf, turn } from "../src/game/runturn.js";
import type { RunDeps } from "../src/game/system.js";
import { AID_NEEDS, aidRest, factions, LADDER, mayCall, RACK_LESSON, RACK_WORDS, standingShow, stepOf } from "../src/game/systems/factions.js";

const JUDGE = {
  kind: "action", act: "call on the Ash Guild for help", target: null, item: null, item_named: false, needs_item: null, ability: null, ability_named: false,
  verdict: "trivial", reason: "", attribute: "charisma", skill: "Persuasion", for: [], against: [], scores: { physical: 0, likelihood: 0, item: null, ability: null, other: null },
};

interface Fake {
  groups?: unknown;
  aid?: unknown;
  call?: unknown;
  judge?: unknown;
}
function deps(f: Fake): RunDeps & { told: Message[][]; aidAsks: Message[][]; callAsks: Message[][] } {
  const told: Message[][] = [], aidAsks: Message[][] = [], callAsks: Message[][] = [];
  return {
    told,
    aidAsks,
    callAsks,
    systems: [factions],
    log: () => {},
    ask: async (messages: Message[], role: Role) => {
      const sys = messages[0]!.content;
      if (role === "builder") {
        if (sys.includes("write down the groups")) return JSON.stringify(f.groups ?? { groups: [] });
        if (sys.includes("what a group of its world would do")) return (aidAsks.push(messages), typeof f.aid === "string" ? f.aid : JSON.stringify(f.aid ?? {}));
        return JSON.stringify({ place: { name: "Forest road", text: "Damp." }, calling: "Clerk", attributes: ["strength", "cunning", "charisma"], skills: ["Persuasion", "Running", "Lying", "Hiding"].map((name) => ({ name, level: 2 })), abilities: [], items: [], money: 5, coin: "bronze", people: [{ name: "Marta", text: "A smith.", power: 3, hostile: false }], opening: "It begins on a damp road." });
      }
      if (role === "teller") return (told.push(messages), "Word goes out along the road.");
      if (sys.includes("calls on a group")) return (callAsks.push(messages), typeof f.call === "string" ? f.call : JSON.stringify(f.call ?? { group: null, aid: null }));
      if (sys.includes("groups in a text adventure")) return JSON.stringify({ changes: [], members: [], new: null });
      if (sys.includes("referee")) return JSON.stringify(f.judge ?? JUDGE);
      if (sys.includes("records")) return JSON.stringify({ minutes: 3 });
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
  };
}

const CARD = { world: "The Ash Guild of smiths rules Marrow. The Salt Court hates strangers.", who: "a clerk", name: "Jay" };
const ASH_AID = [
  { name: "A word with the smiths", text: "The guild has a smith speak for you." },
  { name: "A forged pass", text: "The guild forges you a pass to the inner town." },
  { name: "The guild's hammers", text: "The guild's smiths march out to stand with you." },
];
const GROUPS = {
  groups: [
    { name: "Ash Guild", text: "Smiths who rule the town of Marrow.", stands: 1, holds: ["Marrow"], members: ["Marta"], aid: ASH_AID },
    // Two kinds of help is not three: it keeps none.
    { name: "Salt Court", text: "Judges who distrust strangers.", stands: -1, holds: [], members: [], aid: ASH_AID.slice(0, 2) },
  ],
};

const seeded = (f: Fake = {}): Promise<Run> => begin(deps({ groups: GROUPS, ...f }), CARD, 3);
const groupsOf = (r: Run): Factions => readState(r.sys!.factions as Factions);
const aidOf = (r: Run, name: string): { name: string; text: string; ready: number }[] => (find(groupsOf(r), name) as unknown as { aid?: { name: string; text: string; ready: number }[] }).aid ?? [];
const facts = (d: ReturnType<typeof deps>): string => d.told.at(-1)!.map((m) => m.content).join("\n");

describe("the ladder", () => {
  test("nine steps on the original's thresholds, a standing rounded first", () => {
    expect(LADDER).toHaveLength(9);
    expect(LADDER.map((l) => l.from)).toEqual([-100, -69, -29, -9, 11, 26, 41, 61, 81]);
    const at = [-100, -70, -69, -30, -29, -10, -9, 10, 11, 25, 26, 40, 41, 60, 61, 80, 81, 100];
    expect(at.map(stepOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8]);
    expect(stepOf(10.4)).toBe(3);
    expect(stepOf(10.6)).toBe(4);
  });

  test("help needs 25, 60 and 80, and rests by its place and the standing (the original's cooldowns)", () => {
    expect([...AID_NEEDS]).toEqual([25, 60, 80]);
    expect([85, 65, 45, 30].map((n) => aidRest(0, n))).toEqual([4, 8, 12, 16]);
    expect([aidRest(1, 80), aidRest(1, 79)]).toEqual([8, 12]);
    expect([aidRest(2, 100), aidRest(2, 80)]).toEqual([16, 16]);
  });
});

describe("the standing show", () => {
  test("no groups, no show and no lesson", async () => {
    const r = await begin(deps({ groups: { groups: [] } }), CARD, 3);
    expect(standingShow(r)).toBeNull();
    expect(factions.shows!(r)).toEqual([]);
    expect(factions.teach!(r)).toEqual([]);
  });

  test("each group with its step, its tone, its help and the line each writes", async () => {
    const r = await seeded();
    const show = standingShow(r)!;
    expect(show.kind).toBe("standing");
    expect(show.ladder.map((l) => l.name)).toEqual(LADDER.map((l) => l.name));
    const [ash, salt] = show.groups;
    expect(ash).toMatchObject({ id: "ash-guild", name: "Ash Guild", standing: 35, least: -100, most: 100, step: 5, label: "trusted", tone: "for", holds: ["Marrow"] });
    expect(ash!.notes).toContain(RACK_WORDS.holds(["Marrow"]));
    expect(ash!.aid.map((a) => [a.say, a.need, a.state, a.open])).toEqual([
      ["A word with the smiths", 25, "ready", true],
      ["A forged pass", 60, "at standing 60", false],
      ["The guild's hammers", 80, "at standing 80", false],
    ]);
    expect(ash!.aid[0]!.line).toBe("I call on Ash Guild for their help: A word with the smiths.");
    expect(salt).toMatchObject({ id: "salt-court", standing: -35, step: 1, label: "shunned", tone: "against", aid: [] });
  });

  test("two groups whose names make the same id are told apart", async () => {
    const r = await begin(deps({ groups: { groups: [{ name: "The Watch", stands: 0 }, { name: "Watch of Marrow", stands: 0 }] } }), CARD, 3);
    const ids = standingShow(r)!.groups.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the lesson is the rack's, said once", async () => {
    const r = await seeded();
    expect(factions.teach!(r)).toEqual([RACK_LESSON]);
    expect(RACK_LESSON.key).toBe("standing");
    const d = deps({});
    expect(lessonOf(d, r)?.key).toBe("standing");
    expect(lessonOf(d, r)).toBeNull();
  });
});

describe("a group's help, written once", () => {
  test("a group with no help yet is given it after a turn; an answer that does not check gives none", async () => {
    const r = await seeded();
    // As an older save, or a group the story brought in: not yet asked.
    delete (find(groupsOf(r), "Salt Court") as unknown as { aid?: unknown }).aid;
    const d = deps({ aid: { groups: [{ name: "Salt Court", aid: [{ name: "A quiet hearing", text: "A judge hears you out." }, { name: "A sealed writ", text: "The court seals a writ." }, { name: "Pardon", text: "The court pardons you." }] }] } });
    const t = await turn(d, r, "I wait.");
    expect(d.aidAsks).toHaveLength(1);
    expect(d.aidAsks[0]!.at(-1)!.content).toContain("- Salt Court:");
    expect(d.aidAsks[0]!.at(-1)!.content).not.toContain("- Ash Guild:");
    expect(aidOf(t.run, "Salt Court").map((a) => a.name)).toEqual(["A quiet hearing", "A sealed writ", "Pardon"]);
    // Asked once: the next turn asks nothing.
    const d2 = deps({});
    await turn(d2, t.run, "I wait.");
    expect(d2.aidAsks).toHaveLength(0);

    const r2 = await seeded();
    delete (find(groupsOf(r2), "Salt Court") as unknown as { aid?: unknown }).aid;
    const t2 = await turn(deps({ aid: "no json" }), r2, "I wait.");
    expect(aidOf(t2.run, "Salt Court")).toEqual([]);
  });
});

describe("calling on a group", () => {
  test("a line that names no group, none of its people and none of its help is not asked about", async () => {
    const r = await seeded();
    const s = groupsOf(r);
    expect(mayCall(r, s, "I wait by the road.")).toBe(false);
    expect(mayCall(r, s, "I send word to the Ash Guild.")).toBe(true);
    expect(mayCall(r, s, "I ask for a forged pass.")).toBe(true);
    const d = deps({});
    await turn(d, r, "I wait by the road.");
    expect(d.callAsks).toHaveLength(0);
  });

  test("a call the group will answer goes through, rests, and is told", async () => {
    const r = await seeded();
    const line = RACK_WORDS.callLine("Ash Guild", "A word with the smiths");
    const d = deps({ call: { group: "Ash Guild", aid: 1 } });
    const t = await turn(d, r, line);
    expect(d.callAsks).toHaveLength(1);
    expect(d.callAsks[0]!.at(-1)!.content).toContain("1. A word with the smiths");
    expect(facts(d)).toContain("Ash Guild answers Jay's call and gives this help: A word with the smiths");
    expect(t.report.changes).toContain(`Ash Guild answers your call (A word with the smiths). It can be called on for that again in ${aidRest(0, 35)} turns.`);
    expect(aidOf(t.run, "Ash Guild")[0]!.ready).toBe(t.run.turn + aidRest(0, 35));
    const shown = standingShow(t.run)!.groups[0]!.aid[0]!;
    expect(shown.open).toBe(false);
    expect(shown.state).toBe(RACK_WORDS.rests(aidRest(0, 35)));

    // Called again at once: it rests, and the story is held to it not coming.
    const d2 = deps({ call: { group: "Ash Guild", aid: 1 } });
    const t2 = await turn(d2, t.run, line);
    expect(facts(d2)).toContain("does not give it again yet");
    expect(t2.report.changes.some((c) => c.startsWith("Ash Guild will not do that again yet (A word with the smiths)"))).toBe(true);
    expect(aidOf(t2.run, "Ash Guild")[0]!.ready).toBe(aidOf(t.run, "Ash Guild")[0]!.ready);
  });

  test("a call the group will answer is not thrown for, whatever the judge made of it; one it will not answer is judged as usual", async () => {
    const doubt = { ...JUDGE, verdict: "challenge", reason: "They may not come." };
    const t = await turn(deps({ call: { group: "Ash Guild", aid: 1 }, judge: doubt }), await seeded(), RACK_WORDS.callLine("Ash Guild", "A word with the smiths"));
    expect(t.report.verdict).toBe("trivial");
    expect(t.report.roll).toBeNull();
    expect(t.report.changes.some((c) => c.startsWith("Ash Guild answers your call"))).toBe(true);
    const short = await turn(deps({ call: { group: "Ash Guild", aid: 2 }, judge: doubt }), await seeded(), RACK_WORDS.callLine("Ash Guild", "A forged pass"));
    expect(short.report.verdict).toBe("challenge");
    expect(short.report.roll).not.toBeNull();
  });

  test("a call the group does not think well enough of you for is never blocked: the story is told it does not come", async () => {
    const r = await seeded();
    const d = deps({ call: { group: "Ash Guild", aid: 2 } });
    const t = await turn(d, r, RACK_WORDS.callLine("Ash Guild", "A forged pass"));
    expect(t.story).toBe("Word goes out along the road.");
    expect(facts(d)).toContain("Ash Guild does not give Jay this help (A forged pass)");
    expect(t.report.changes).toContain("Ash Guild will not do that for you yet (A forged pass): it needs your standing with them at 60 or more, and it is 35.");
    expect(aidOf(t.run, "Ash Guild")[1]!.ready).toBe(0);
  });

  test("a line taken as what happens (the player as co-author) is followed as written, short or not", async () => {
    const r = await seeded();
    const d = deps({ call: { group: "Ash Guild", aid: 3 }, judge: { ...JUDGE, kind: "story" } });
    const t = await turn(d, r, "The Ash Guild's hammers march out to stand with me.");
    expect(facts(d)).not.toContain("does not give");
    expect(t.report.changes.some((c) => c.includes("will not do that"))).toBe(false);
  });

  test("an answer naming a group not kept, help it has not, or no call changes nothing", async () => {
    for (const call of [{ group: "Imaginary Folk", aid: 1 }, { group: "Salt Court", aid: 1 }, { group: "Ash Guild", aid: 7 }, { group: null, aid: null }, "no json"]) {
      const r = await seeded();
      const d = deps({ call });
      const t = await turn(d, r, "I send word to the Ash Guild.");
      expect(facts(d)).not.toContain("answers Jay's call");
      expect(t.report.changes.some((c) => c.includes("call") || c.includes("will not do that"))).toBe(false);
      expect(aidOf(t.run, "Ash Guild").every((a) => a.ready === 0)).toBe(true);
    }
  });
});
