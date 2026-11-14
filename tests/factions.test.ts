/**
 * Factions: the rules of the numbers (src/engine/factions.ts) and each moment of the system (src/game/systems/factions.ts),
 * with the models faked.
 */
import { describe, expect, test } from "bun:test";
import {
  add, consider, emptyFactions, feed, find, groupOf, join, keepNames, labelOf, MAX_FACTIONS, mentions, nudge, onGround, pageLine, readState, rollBy, sameGroup, stand, startRep, stepPoints,
  listed, FADES_AFTER, type Factions,
} from "../src/engine/factions.js";
import { attributesFrom, meet, newRun, person, stateOf, type Run } from "../src/engine/run.js";
import type { Message, Role } from "../src/game/ask.js";
import { begin, pagesOf, sceneOf, turn } from "../src/game/runturn.js";
import type { RunDeps } from "../src/game/system.js";
import { factions, worthAsking } from "../src/game/systems/factions.js";

const world = (): Run => {
  const r = newRun(7, "a world", "a hero", "Jay");
  r.sheet.attributes = attributesFrom(["strength"]);
  r.opening = "A goblin stands in the road.";
  r.place = { name: "Forest road", text: "" };
  return r;
};
const fresh = (): { r: Run; s: Factions } => {
  const r = world();
  return { r, s: readState(stateOf(r, "factions", emptyFactions)) };
};

describe("the ladder", () => {
  test("a number is a label, and the rungs are where they should be", () => {
    const f = add(fresh().s, world(), { name: "Ash Guild" })!;
    const at = (rep: number): string => ((f.rep = rep), labelOf(f));
    expect(at(-100)).toBe("very unfavourable");
    expect(at(-60)).toBe("very unfavourable");
    expect(at(-59)).toBe("somewhat unfavourable");
    expect(at(-20)).toBe("somewhat unfavourable");
    expect(at(-19)).toBe("neutral");
    expect(at(19)).toBe("neutral");
    expect(at(20)).toBe("somewhat favourable");
    expect(at(59)).toBe("somewhat favourable");
    expect(at(60)).toBe("very favourable");
    expect([-100, -30, 0, 30, 100].map(stand)).toEqual([-2, -1, 0, 1, 2]);
  });

  test("a start from the card or the passage is the middle of a rung, and is clamped", () => {
    expect([-2, -1, 0, 1, 2].map((n) => stand(startRep(n)))).toEqual([-2, -1, 0, 1, 2]);
    expect(startRep(9)).toBe(startRep(2));
    expect(startRep(-9)).toBe(startRep(-2));
    expect(startRep(Number.NaN)).toBe(0);
  });

  test("a step is a small bounded change, and a group never leaves -100..100", () => {
    expect([-5, -3, -2, -1, 0, 1, 2, 3, 40].map(stepPoints)).toEqual([-15, -15, -10, -5, 0, 5, 10, 15, 15]);
    const f = add(fresh().s, world(), { name: "Ash Guild" })!;
    f.rep = 95;
    expect(nudge(f, 15)).toBe(5);
    expect(f.rep).toBe(100);
    f.rep = -98;
    expect(nudge(f, -15)).toBe(-2);
    expect(f.rep).toBe(-100);
  });

  test("a group pulled both ways and standing in the middle is ambiguous, one pulled one way is not", () => {
    const f = add(fresh().s, world(), { name: "Ash Guild" })!;
    nudge(f, 15);
    nudge(f, 15);
    nudge(f, -15);
    nudge(f, -15);
    expect(f.rep).toBe(0);
    expect(labelOf(f)).toBe("ambiguous");
    nudge(f, 15);
    nudge(f, 15);
    expect(labelOf(f)).toBe("somewhat favourable");
    const g = add(fresh().s, world(), { name: "Salt Court" })!;
    nudge(g, 10);
    expect(labelOf(g)).toBe("neutral");
  });

  test("what a member's feeling does to the group is a tenth, and half that against", () => {
    expect(feed(10)).toBeCloseTo(1);
    expect(feed(-10)).toBeCloseTo(-0.5);
    expect(feed(0)).toBe(0);
  });
});

describe("keeping groups", () => {
  test("one group is never kept twice under two wordings", () => {
    const { r, s } = fresh();
    expect(add(s, r, { name: "The Ash Guild", text: "Smiths." })).not.toBeNull();
    expect(add(s, r, { name: "ash guild" })).toBeNull();
    expect(add(s, r, { name: "Ash Guilds" })).toBeNull();
    expect(add(s, r, { name: "The Ash Guild of Marrow" })).toBeNull();
    expect(find(s, "the ash guild of marrow")?.name).toBe("The Ash Guild");
    expect(add(s, r, { name: "Salt Court" })).not.toBeNull();
    expect(s.list).toHaveLength(2);
  });

  test("a single shared word does not make two groups one", () => {
    expect(sameGroup("Thieves Guild", "Merchant Guild")).toBe(false);
    expect(sameGroup("Guild", "Thieves Guild")).toBe(false);
    expect(sameGroup("Ash Guild", "Ash Guild of Marrow")).toBe(true);
    expect(sameGroup("Ash Guild", "Ash Court")).toBe(false);
  });

  test("names that cannot stand are refused: the character, a pronoun, a person, nothing", () => {
    const { r, s } = fresh();
    meet(r, { name: "Marta" });
    for (const name of ["Jay", "they", "Marta", "", "<the name>", " "]) expect(add(s, r, { name })).toBeNull();
  });

  test("the most kept is capped", () => {
    const { r, s } = fresh();
    for (let i = 0; i < MAX_FACTIONS + 3; i++) add(s, r, { name: `Order of the ${["Ox", "Elk", "Fox", "Owl", "Bee", "Cat", "Eel", "Ram", "Yak", "Hen", "Jay-bird", "Wolf", "Boar"][i]}` });
    expect(s.list).toHaveLength(MAX_FACTIONS);
    expect(consider(s, r, { name: "Brand New Brotherhood" }, true)).toBe("no");
  });

  test("a mention waits; it is kept on a later sign of it, or at once if it plainly matters", () => {
    const { r, s } = fresh();
    expect(consider(s, r, { name: "Grey Brotherhood" }, false)).toBe("waits");
    expect(s.list).toHaveLength(0);
    // The same turn again is not a second sign.
    expect(consider(s, r, { name: "the grey brotherhood" }, false)).toBe("waits");
    r.turn = 3;
    expect(consider(s, r, { name: "The Grey Brotherhood", text: "Monks." }, false)).toBe("kept");
    expect(find(s, "Grey Brotherhood")?.text).toBe("Monks.");
    expect(s.maybe).toHaveLength(0);
    expect(consider(s, r, { name: "Red Hand", stands: -2 }, true)).toBe("kept");
    expect(find(s, "Red Hand")!.rep).toBe(startRep(-2));
  });

  test("a mention waits only so long, and only so many wait", () => {
    const { r, s } = fresh();
    consider(s, r, { name: "Grey Brotherhood" }, false);
    r.turn = 100;
    expect(consider(s, r, { name: "Grey Brotherhood" }, false)).toBe("waits");
    expect(s.list).toHaveLength(0);
    for (let i = 0; i < 9; i++) consider(s, r, { name: `Waiting Band ${["A", "B", "C", "D", "E", "F", "G", "H", "I"][i]}` }, false);
    expect(s.maybe.length).toBeLessThanOrEqual(6);
  });

  test("an old save has no fields and still reads", () => {
    const s = readState({ list: [{ name: "Ash Guild", text: "", rep: 10 } as never] });
    expect(s.list[0]!.members).toEqual([]);
    expect(s.leaned).toEqual([]);
    expect(s.maybe).toEqual([]);
    expect(readState(undefined).list).toEqual([]);
  });
});

describe("who belongs", () => {
  test("a member first met leans toward the group's standing, once", () => {
    const { r, s } = fresh();
    const f = add(s, r, { name: "Ash Guild", stands: -2 })!;
    const a = meet(r, { name: "Marta" })!;
    expect(join(s, r, f, a, true)).toBe("leaned");
    expect(a.feeling).toBe(-30);
    // Leaving and joining again does not lean twice.
    f.members = [];
    expect(join(s, r, f, a, true)).toBe("joined");
    expect(a.feeling).toBe(-30);
  });

  test("a person already met does not lean, and one group a person", () => {
    const { r, s } = fresh();
    const f = add(s, r, { name: "Ash Guild", stands: 2 })!;
    const g = add(s, r, { name: "Salt Court", stands: -2 })!;
    const a = meet(r, { name: "Marta" })!;
    expect(join(s, r, f, a, false)).toBe("joined");
    expect(a.feeling).toBe(0);
    expect(join(s, r, g, a, true)).toBe("no");
    expect(groupOf(s, r, a)?.name).toBe("Ash Guild");
  });

  test("the dead do not join; a favourable group lifts and a neutral one leaves alone", () => {
    const { r, s } = fresh();
    const f = add(s, r, { name: "Ash Guild", stands: 1 })!;
    const dead = meet(r, { name: "Old Tam" })!;
    dead.dead = true;
    expect(join(s, r, f, dead, true)).toBe("no");
    const a = meet(r, { name: "Marta" })!;
    join(s, r, f, a, true);
    expect(a.feeling).toBe(10);
    const n = add(s, r, { name: "Salt Court" })!;
    const b = meet(r, { name: "Ned" })!;
    expect(join(s, r, n, b, true)).toBe("joined");
    expect(b.feeling).toBe(0);
  });

  test("a member who is renamed is still a member", () => {
    const { r, s } = fresh();
    const f = add(s, r, { name: "Ash Guild" })!;
    const a = meet(r, { name: "the hooded woman" })!;
    join(s, r, f, a, true);
    a.was.push(a.name);
    a.name = "Sela";
    expect(groupOf(s, r, a)?.name).toBe("Ash Guild");
    keepNames(s, r);
    expect(f.members).toEqual(["Sela"]);
    expect(s.leaned).toEqual(["Sela"]);
    expect(person(r, "the hooded woman")).toBe(a);
  });

  test("ground is found by name, either one inside the other", () => {
    const f = add(fresh().s, world(), { name: "Ash Guild", holds: ["Marrow", "the Ash Hall"] })!;
    expect(onGround(f, "Marrow")).toBe(true);
    expect(onGround(f, "The market of Marrow")).toBe(true);
    expect(onGround(f, "Ash Hall")).toBe(true);
    expect(onGround(f, "Forest road")).toBe(false);
    expect(onGround(f, "")).toBe(false);
  });

  test("a group with no one and no mention for long falls off the page, and keeps what it feels", () => {
    const { r, s } = fresh();
    const f = add(s, r, { name: "Ash Guild", stands: -1 })!;
    expect(listed(s, r, f)).toBe(true);
    r.turn = FADES_AFTER + 5;
    expect(listed(s, r, f)).toBe(false);
    expect(f.rep).toBe(startRep(-1));
    const m = meet(r, { name: "Marta" })!;
    join(s, r, f, m, true);
    expect(listed(s, r, f)).toBe(true);
    m.here = false;
    expect(listed(s, r, f)).toBe(false);
    expect(pageLine(s, r, f)).toContain("somewhat unfavourable");
  });

  test("mentioning a group is by its whole name", () => {
    expect(mentions("The Ash Guild's hall was shut.", "Ash Guild")).toBe(true);
    expect(mentions("An ash-guild man", "Ash Guild")).toBe(true);
    expect(mentions("Ash and the guildsmen", "Ash Guild")).toBe(false);
  });
});

describe("what standing does to a roll", () => {
  test("goodwill helps a little, hostility hurts a little, very much more than somewhat, both bounded", () => {
    const { r, s } = fresh();
    const f = add(s, r, { name: "Ash Guild" })!;
    const p = meet(r, { name: "Marta" })!;
    const at = (rep: number): number | undefined => ((f.rep = rep), rollBy(f, p)?.by);
    expect(at(0)).toBeUndefined();
    expect(at(30)).toBe(2);
    expect(at(80)).toBe(5);
    expect(at(-30)).toBe(-2);
    expect(at(-80)).toBe(-5);
  });

  test("a member who is fighting you is not helped by good will, and is still backed by ill will", () => {
    const { r, s } = fresh();
    const f = add(s, r, { name: "Ash Guild" })!;
    const p = meet(r, { name: "Marta", hostile: true })!;
    f.rep = 80;
    expect(rollBy(f, p)).toBeNull();
    f.rep = -80;
    expect(rollBy(f, p)?.by).toBe(-5);
  });
});

/* ------------------------------------------------- the hooks ------------------------------------------------- */

const JUDGE = {
  kind: "action", act: "ask the smith for a favour", target: "Marta", item: null, item_named: false, needs_item: null, ability: null, ability_named: false,
  verdict: "challenge", reason: "She may refuse.", attribute: "charisma", skill: "Persuasion", for: [], against: [], scores: { physical: 0, likelihood: 0, item: null, ability: null, other: null },
};

interface Fake {
  groups?: unknown;
  read?: unknown;
  story?: string;
  judge?: unknown;
}
function deps(f: Fake): RunDeps & { told: Message[][]; groupAsks: Message[][]; logged: string[] } {
  const told: Message[][] = [], groupAsks: Message[][] = [], logged: string[] = [];
  return {
    told,
    groupAsks,
    logged,
    systems: [factions],
    log: (m) => void logged.push(m),
    ask: async (messages: Message[], role: Role) => {
      const sys = messages[0]!.content;
      if (role === "builder") {
        if (sys.includes("write down the groups")) return (groupAsks.push(messages), typeof f.groups === "string" ? f.groups : JSON.stringify(f.groups ?? { groups: [] }));
        return JSON.stringify({ place: { name: "Forest road", text: "Damp." }, calling: "Clerk", attributes: ["strength", "cunning", "dexterity"], skills: ["Shoving", "Running", "Lying", "Hiding"].map((name) => ({ name, level: 2 })), abilities: [], items: [], money: 5, coin: "bronze", people: [{ name: "Marta", text: "A smith.", power: 3, hostile: false }, { name: "Orrin", text: "A stranger.", power: 3, hostile: false }], opening: "It begins on a damp road." });
      }
      if (role === "teller") return (told.push(messages), f.story ?? "Marta wipes her hands on her apron.");
      if (sys.includes("groups in a text adventure")) return (groupAsks.push(messages), typeof f.read === "string" ? f.read : JSON.stringify(f.read ?? {}));
      if (sys.includes("referee")) return JSON.stringify(f.judge ?? JUDGE);
      if (sys.includes("records")) return JSON.stringify({ minutes: 3 });
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
  };
}

const CARD = { world: "The Ash Guild of smiths rules Marrow. The Salt Court hates strangers.", who: "a clerk", name: "Jay" };
const GROUPS = {
  groups: [
    { name: "Ash Guild", text: "Smiths who rule the town of Marrow.", stands: 1, holds: ["Marrow"], members: ["Marta", "Nobody Known", "Jay"] },
    { name: "Salt Court", text: "Judges who distrust strangers.", stands: -1, holds: [], members: [] },
    { name: "ash guild", text: "A copy.", stands: 2 },
    { name: "Jay", text: "A person, not a group." },
  ],
};

describe("seed", () => {
  test("the card's groups are written down, each with a start, and the members found by name", async () => {
    const r = await begin(deps({ groups: GROUPS }), CARD, 3);
    const s = readState(r.sys!.factions as Factions);
    expect(s.list.map((f) => f.name)).toEqual(["Ash Guild", "Salt Court"]);
    expect(labelOf(s.list[0]!)).toBe("somewhat favourable");
    expect(labelOf(s.list[1]!)).toBe("somewhat unfavourable");
    expect(s.list[0]!.holds).toEqual(["Marrow"]);
    expect(s.list[0]!.members).toEqual(["Marta"]);
    expect(person(r, "Marta")!.feeling).toBe(10);
    expect(person(r, "Orrin")!.feeling).toBe(0);
  });

  test("a card with no groups keeps none, and an unreadable answer keeps none", async () => {
    const none = await begin(deps({ groups: { groups: [] } }), CARD, 3);
    expect(readState(none.sys!.factions as Factions).list).toEqual([]);
    const d = deps({ groups: "no json here" });
    const bad = await begin(d, CARD, 3);
    expect(readState(bad.sys?.factions as Factions).list).toEqual([]);
    expect(d.groupAsks).toHaveLength(2);
    expect(bad.place.name).toBe("Forest road");
  });

  test("no more than a handful are kept", async () => {
    const many = { groups: Array.from({ length: 9 }, (_, i) => ({ name: `Brotherhood of ${["Ox", "Elk", "Fox", "Owl", "Bee", "Cat", "Eel", "Ram", "Yak"][i]}` })) };
    const r = await begin(deps({ groups: many }), CARD, 3);
    expect(readState(r.sys!.factions as Factions).list).toHaveLength(6);
  });
});

const seeded = async (): Promise<Run> => begin(deps({ groups: GROUPS }), CARD, 3);

describe("the scene, the page, the roll", () => {
  test("the scene tells who stands how, for groups whose people are here or whose ground this is, and not for the rest", async () => {
    const r = await seeded();
    const d = deps({});
    const text = sceneOf(d, r);
    expect(text).toContain("Ash Guild");
    expect(text).toContain("somewhat favourable toward Jay");
    expect(text).toContain("Of it, here: Marta");
    expect(text).not.toContain("Salt Court");
    r.place.name = "Forest road";
    person(r, "Marta")!.here = false;
    expect(sceneOf(d, r)).not.toContain("Ash Guild");
    r.place.name = "The market in Marrow";
    expect(sceneOf(d, r)).toContain("Ash Guild");
  });

  test("a run with no groups adds nothing to the scene and nothing to the page", () => {
    const r = world();
    expect(sceneOf(deps({}), r)).not.toContain("GROUPS");
    expect(pagesOf(deps({}), r)).toEqual([]);
    expect(r.sys).toBeUndefined();
  });

  test("the page lists the known groups and how each stands", async () => {
    const r = await seeded();
    const pages = pagesOf(deps({}), r);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.heading).toBe("Groups");
    expect(pages[0]!.his[0]).toContain("Ash Guild: somewhat favourable.");
    expect(pages[0]!.his[1]).toContain("Salt Court: somewhat unfavourable.");
  });

  test("dealing with a member of a group that thinks ill of you changes the roll, and says why", async () => {
    const r = await seeded();
    const s = readState(r.sys!.factions as Factions);
    find(s, "Ash Guild")!.rep = -80;
    const t = await turn(deps({}), r, "I ask Marta for a favour.");
    expect(t.report.roll!.modifiers).toContainEqual(expect.objectContaining({ what: "Ash Guild thinks ill of you", by: -5 }));
  });

  test("no change to the roll for someone of no group", async () => {
    const r = await seeded();
    const t = await turn(deps({ judge: { ...JUDGE, target: "Orrin" } }), r, "I ask Orrin for a favour.");
    expect(t.report.roll!.modifiers.some((m) => m.what.includes("thinks"))).toBe(false);
  });
});

describe("reading a passage", () => {
  test("a deed the group saw moves it by a bounded step, and the label is told when it changes", async () => {
    const r = await seeded();
    find(readState(r.sys!.factions as Factions), "Ash Guild")!.rep = 22;
    const d = deps({ read: { changes: [{ group: "The Ash Guild", step: -3, why: "she was robbed in the hall" }], members: [], new: null }, story: "The Ash Guild hall goes quiet." });
    const t = await turn(d, r, "I rob the Ash Guild hall.");
    const s = readState(t.run.sys!.factions as Factions);
    const f = find(s, "Ash Guild")!;
    expect(f.rep).toBe(22 - 15);
    expect(t.report.changes.join("\n")).toContain("Ash Guild thinks worse of you: now neutral");
    // The reader was shown the exact known name and the rules.
    const asked = d.groupAsks.at(-1)!.at(-1)!.content;
    expect(asked).toContain("- Ash Guild:");
    expect(asked).toContain("A deed nobody of the group saw");
  });

  test("a name the run does not hold, a zero step, and a second change for one group are dropped", async () => {
    const r = await seeded();
    const read = { changes: [{ group: "Imaginary Folk", step: 3 }, { group: "Salt Court", step: 0 }, { group: "Ash Guild", step: 1 }, { group: "ash guild", step: 3 }], members: [], new: null };
    const t = await turn(deps({ read, story: "The Ash Guild hall nods." }), r, "I greet the Ash Guild.");
    const s = readState(t.run.sys!.factions as Factions);
    expect(find(s, "Ash Guild")!.rep).toBe(35 + 5);
    expect(find(s, "Salt Court")!.rep).toBe(-35);
  });

  test("no usable answer changes nothing and costs nothing", async () => {
    const r = await seeded();
    const d = deps({ read: "I cannot say.", story: "The Ash Guild hall nods." });
    const t = await turn(d, r, "I greet the Ash Guild.");
    expect(t.story).toContain("Ash Guild");
    expect(find(readState(t.run.sys!.factions as Factions), "Ash Guild")!.rep).toBe(35);
    expect(d.logged.some((m) => m.includes("factions, reading the passage: the answer did not check"))).toBe(true);
  });

  test("a note left unfilled is no answer", async () => {
    const r = await seeded();
    const t = await turn(deps({ read: { changes: [{ group: "<group name>", step: 3 }], members: [{ person: "<name>", group: "<group>" }], new: { name: "<the group's name>" } }, story: "The Ash Guild hall nods." }), r, "I greet the Ash Guild.");
    const s = readState(t.run.sys!.factions as Factions);
    expect(s.list).toHaveLength(2);
    expect(find(s, "Ash Guild")!.rep).toBe(35);
  });

  test("the reader is not asked when no group is known and the passage cannot have named one", async () => {
    const r = await begin(deps({ groups: { groups: [] } }), CARD, 3);
    const d = deps({ story: "Marta wipes her hands on her apron." });
    await turn(d, r, "I wave to Marta.");
    expect(d.groupAsks).toHaveLength(0);
    const d2 = deps({ story: "A guild man in grey steps out of the forge.", read: { changes: [], members: [], new: null } });
    await turn(d2, r, "I wave.");
    expect(d2.groupAsks).toHaveLength(1);
  });

  test("with groups known, a passage that touches none of them is not asked about", () => {
    const { r, s } = fresh();
    add(s, r, { name: "Ash Guild", holds: ["Marrow"] });
    expect(worthAsking(r, s, "I walk on.", "The road is quiet and the trees drip.")).toBe(false);
    expect(worthAsking(r, s, "I walk on.", "Smoke rises over the Ash Guild roofs.")).toBe(true);
    r.place.name = "Marrow";
    expect(worthAsking(r, s, "I walk on.", "The road is quiet.")).toBe(true);
  });

  test("a group that plainly matters is kept at once, a bare mention waits and is kept the second time", async () => {
    const r = await seeded();
    const matters = { changes: [], members: [], new: { name: "Grey Brotherhood", text: "Monks who sell cures.", stands: 1, holds: ["the Grey Cloister"], matters: true } };
    const t1 = await turn(deps({ read: matters, story: "Three monks of the Grey Brotherhood bar the door." }), r, "I knock.");
    const s1 = readState(t1.run.sys!.factions as Factions);
    expect(find(s1, "Grey Brotherhood")?.rep).toBe(startRep(1));
    expect(t1.report.changes.join("\n")).toContain("A new group enters the story: Grey Brotherhood");

    const mention = { changes: [], members: [], new: { name: "Red Hand", text: "A gang.", stands: 0, holds: [], matters: false } };
    const t2 = await turn(deps({ read: mention, story: "Someone says the Red Hand gang is in town." }), t1.run, "I listen.");
    expect(find(readState(t2.run.sys!.factions as Factions), "Red Hand")).toBeUndefined();
    const t3 = await turn(deps({ read: mention, story: "A Red Hand gang scout watches you." }), t2.run, "I look back.");
    expect(find(readState(t3.run.sys!.factions as Factions), "Red Hand")).toBeDefined();
  });

  test("the same group under another wording is never made twice", async () => {
    const r = await seeded();
    const again = { changes: [], members: [], new: { name: "The Ash Guild of Marrow", text: "Smiths.", stands: -2, holds: [], matters: true } };
    const t = await turn(deps({ read: again, story: "The Ash Guild of Marrow rings its bell." }), r, "I listen.");
    const s = readState(t.run.sys!.factions as Factions);
    expect(s.list.filter((f) => f.name.includes("Ash"))).toHaveLength(1);
    expect(find(s, "Ash Guild")!.rep).toBe(35);
  });

  test("a person who is plainly of a group joins it, and a new person leans from the group's standing once", async () => {
    const r = await seeded();
    const salt = { changes: [], members: [{ person: "the Salt Court clerk", group: "Salt Court" }, { person: "Orrin", group: "Salt Court" }], new: null };
    const back = { minutes: 2, new: [{ name: "the Salt Court clerk", text: "A clerk.", power: 2, hostile: false }] };
    const d = deps({ read: salt, story: "A Salt Court clerk steps in, and Orrin is with him." });
    const base = d.ask;
    d.ask = async (m, role) => (m[0]!.content.includes("records of a text adventure") && role === "reader" ? JSON.stringify(back) : base(m, role));
    const t = await turn(d, r, "I wait.");
    const clerk = person(t.run, "the Salt Court clerk")!;
    // New this turn: leans toward the group (-15). Already met: no lean.
    expect(clerk.feeling).toBe(-15);
    expect(person(t.run, "Orrin")!.feeling).toBe(0);
    const s = readState(t.run.sys!.factions as Factions);
    expect(find(s, "Salt Court")!.members.sort()).toEqual(["Orrin", "the Salt Court clerk"]);
    // A second saying changes neither.
    const t2 = await turn(d, t.run, "I wait.");
    expect(person(t2.run, "the Salt Court clerk")!.feeling).toBe(-15);
  });

  test("what a member feels moves their group a little, and not when the reader already moved the group", async () => {
    const r = await seeded();
    const d = deps({ read: { changes: [], members: [], new: null }, story: "Marta smiles at you across the Ash Guild forge." });
    const base = d.ask;
    d.ask = async (m, role) => (m[0]!.content.includes("records of a text adventure") && role === "reader" ? JSON.stringify({ minutes: 1, feelings: [{ who: "Marta", delta: 10 }] }) : base(m, role));
    const t = await turn(d, r, "I thank her.");
    expect(find(readState(t.run.sys!.factions as Factions), "Ash Guild")!.rep).toBe(36);
    const d2 = deps({ read: { changes: [{ group: "Ash Guild", step: 1 }], members: [], new: null }, story: "Marta smiles at you across the Ash Guild forge." });
    const base2 = d2.ask;
    d2.ask = async (m, role) => (m[0]!.content.includes("records of a text adventure") && role === "reader" ? JSON.stringify({ minutes: 1, feelings: [{ who: "Marta", delta: 10 }] }) : base2(m, role));
    const t2 = await turn(d2, r, "I thank her.");
    expect(find(readState(t2.run.sys!.factions as Factions), "Ash Guild")!.rep).toBe(40);
  });

  test("a system that gets nothing back from the reader still counts a member's presence as the group being seen", async () => {
    const r = await seeded();
    const t = await turn(deps({ read: "no", story: "Marta wipes her hands." }), r, "I wait.");
    expect(find(readState(t.run.sys!.factions as Factions), "Ash Guild")!.seen).toBe(1);
  });
});
