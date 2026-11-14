import { describe, expect, test } from "bun:test";
import type { DecisionAnswer } from "lumiverse-spindle-types";
import { attributesFrom, meet, newRun, take, type Run } from "../src/engine/run.js";
import type { Message, Role } from "../src/game/ask.js";
import { apply, begin, readReadback, reportText, turn, type RunDeps } from "../src/game/runturn.js";

const SETUP = {
  place: { name: "Forest road", text: "A damp road between old trees." },
  calling: "Reincarnated clerk",
  attributes: ["cunning", "intelligence", "dexterity", "charisma", "strength"],
  skills: [
    { name: "Observation", level: 4 }, { name: "Stealth", level: 4 }, { name: "Negotiation", level: 3 }, { name: "Deception", level: 3 }, { name: "Composure", level: 3 },
    { name: "Foraging", level: 1 }, { name: "Strength", level: 2 }, { name: "A very long skill name", level: 2 },
  ],
  abilities: [{ name: "Monster Charm", text: "Turns a beaten monster friendly.", tier: 2 }, { name: "Tongues", text: "Speaks every language.", tier: 1 }, { name: "<2 to 4 words>", text: "x", tier: 0 }],
  items: [{ name: "Travel clothes", text: "Plain.", quality: "legendary", qty: 1, worn: true }, { name: "Coin pouch", text: "Small.", quality: "common", qty: 1 }],
  money: 50,
  coin: "bronze",
  people: [{ name: "Goblin", text: "Rummaging in a sack.", power: 2, hostile: false }, { name: "Jay", text: "the player", power: 3, hostile: false }],
};

interface Fake {
  judge?: Record<string, unknown> | string;
  story?: string;
  back?: Record<string, unknown> | string;
  setup?: Record<string, unknown> | string;
  decide?: (what: string) => Record<string, DecisionAnswer | undefined> | null;
}
const choice = (c: string, p = 0.9): DecisionAnswer => ({ type: "choice", choice: c, probabilities: { [c]: p } }) as unknown as DecisionAnswer;

function deps(f: Fake): RunDeps & { asked: { role: Role; messages: Message[] }[] } {
  const asked: { role: Role; messages: Message[] }[] = [];
  const text = (v: Record<string, unknown> | string | undefined): string => (typeof v === "string" ? v : JSON.stringify(v ?? {}));
  return {
    asked,
    // The turn alone: the game's further systems have tests of their own (tests/systems.test.ts, and one each).
    systems: [],
    ask: async (messages, role) => {
      asked.push({ role, messages });
      const sys = messages[0]!.content;
      if (role === "builder") return text(f.setup ?? SETUP);
      if (role === "teller") return f.story ?? "The story goes on.";
      if (sys.includes("referee")) return text(f.judge);
      if (sys.includes("records")) return text(f.back);
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
    ...(f.decide ? { decide: async (what: string) => f.decide!(what) } : {}),
  };
}

const JUDGE = {
  kind: "action", act: "choke the goblin from behind", target: "Goblin", item: null, item_named: false, needs_item: null, ability: null, ability_named: false,
  verdict: "challenge", reason: "It may wake.", attribute: "dexterity", skill: "Stealth", for: ["its back is turned"], against: ["it smells you"],
  scores: { physical: 0, likelihood: 2, item: null, ability: null, other: { what: "the mist", score: 1 } },
};

const start = (): Run => {
  const r = newRun(7, "a world", "a hero", "Jay");
  r.sheet.attributes = attributesFrom(["dexterity", "cunning"]);
  r.sheet.skills.push({ name: "Stealth", xp: 300, level: 3 });
  r.opening = "A goblin rummages in a sack.";
  r.place = { name: "Forest road", text: "" };
  meet(r, { name: "Goblin", power: 2 });
  return r;
};

describe("setting up", () => {
  test("a sheet is written from the builder's answer, held to the game's limits", async () => {
    const r = await begin(deps({}), { world: "w", who: "h", name: "Jay", first: "It begins." }, 3);
    const s = r.sheet;
    expect(r.opening).toBe("It begins.");
    expect(s.attributes).toEqual({ cunning: 6, intelligence: 5, dexterity: 4, charisma: 3, strength: 2 });
    expect(s.skills.filter((k) => k.level === 4)).toHaveLength(1);
    expect(s.skills.filter((k) => k.level === 3)).toHaveLength(2);
    expect(s.skills.some((k) => k.name === "Strength" || k.name.startsWith("A very"))).toBe(false);
    expect(s.abilities.map((a) => [a.name, a.tier])).toEqual([["Monster Charm", 1], ["Tongues", 0]]);
    expect(s.items[0]).toMatchObject({ name: "Travel clothes", quality: "rare", worn: true });
    expect(s.money).toBe(50);
    expect(r.people.map((p) => p.name)).toEqual(["Goblin"]);
  });
  test("a builder that cannot be read leaves a plain sheet, asked twice", async () => {
    const d = deps({ setup: "I cannot do that." });
    const r = await begin(d, { world: "w", who: "h", name: "Jay" }, 3);
    expect(d.asked).toHaveLength(2);
    expect(r.sheet.skills).toEqual([]);
    expect(r.opening).toBe("The story begins.");
  });
});

describe("a turn", () => {
  test("a challenge is rolled, told to its outcome, and practises the skill", async () => {
    const d = deps({ judge: JUDGE, story: "You creep up.", back: {} });
    const before = start();
    const t = await turn(d, before, "I sneak up and choke it.");
    expect(t.report.verdict).toBe("challenge");
    expect(t.report.roll!.modifiers.map((m) => m.by)).toEqual([10, 5]);
    expect(t.report.roll!.skill.name).toBe("Stealth");
    expect(t.run.sheet.skills[0]!.xp).toBe(345);
    expect(t.run.turn).toBe(1);
    expect(before.turn).toBe(0);
    expect(t.run.beats).toEqual([{ you: "I sneak up and choke it.", story: "You creep up." }]);
    const note = d.asked.find((a) => a.role === "teller")!.messages.at(-1)!.content;
    expect(note).toContain("choke the goblin from behind");
    expect(note).toMatch(/success|works|short|fails|does not work/);
    expect(reportText(t.report)).toContain("For you: its back is turned.");
  });
  test("a trivial act and a story line are not rolled", async () => {
    const a = await turn(deps({ judge: { ...JUDGE, verdict: "trivial" }, back: {} }), start(), "I look around.");
    expect(a.report.roll).toBeNull();
    expect(a.report.verdict).toBe("trivial");
    const b = await turn(deps({ judge: { kind: "story" }, back: {} }), start(), "Three days pass.");
    expect(b.report.kind).toBe("story");
    expect(b.report.roll).toBeNull();
    expect(reportText(b.report)).toContain("Taken as written");
  });
  test("an implausible act fails without a roll, and the reason goes to the storyteller only as background", async () => {
    const d = deps({ judge: { ...JUDGE, verdict: "implausible", reason: "There is no magic in a shout." }, back: {} });
    const t = await turn(d, start(), "I shout SLEEP.");
    expect(t.report.roll).toBeNull();
    expect(d.asked.find((a) => a.role === "teller")!.messages.at(-1)!.content).toContain("never state it");
  });
  test("an act that needs a thing the character lacks comes up short", async () => {
    const t = await turn(deps({ judge: { ...JUDGE, needs_item: "a bow" }, back: {} }), start(), "I shoot it.");
    expect(t.report.verdict).toBe("missing");
    expect(t.report.roll).toBeNull();
  });
  test("where the second look disagrees, it is rolled", async () => {
    const t = await turn(deps({ judge: { ...JUDGE, verdict: "trivial" }, back: {}, decide: () => ({ verdict: choice("challenge") }) }), start(), "I choke it.");
    expect(t.report.verdict).toBe("challenge");
    expect(t.report.roll).not.toBeNull();
    const u = await turn(deps({ judge: { ...JUDGE, verdict: "trivial" }, back: {}, decide: () => ({ verdict: choice("challenge", 0.4) }) }), start(), "I look.");
    expect(u.report.verdict).toBe("trivial");
  });
  test("a line in which their own character attempts nothing is followed as written, though the judge called it impossible", async () => {
    // "A merchant pulls up his cart" is the player writing the world, not their character conjuring a merchant.
    const d = deps({ judge: { ...JUDGE, verdict: "implausible", act: "summon a travelling merchant" }, back: {}, decide: () => ({ verdict: choice("none") }) });
    const t = await turn(d, start(), "A travelling merchant pulls his cart up beside me.");
    expect(t.report.kind).toBe("story");
    expect(t.report.verdict).toBeNull();
    expect(t.report.roll).toBeNull();
    expect(d.asked.find((x) => x.role === "teller")!.messages.at(-1)!.content).toContain("Take all of it as true");
    // A second look that is not sure leaves the judge's reading alone.
    const u = await turn(deps({ judge: { ...JUDGE, verdict: "implausible" }, back: {}, decide: () => ({ verdict: choice("none", 0.4) }) }), start(), "I fly.");
    expect(u.report.kind).toBe("action");
    expect(u.report.verdict).toBe("implausible");
  });
  test("the judge and its second look are both told that going somewhere first is no reason to refuse", async () => {
    // "I find the nearest inn and ask the innkeeper": they get there, and the asking is judged as done there.
    const d = deps({ judge: { ...JUDGE, verdict: "trivial" }, back: {} });
    let criteria = "";
    d.decide = async (_what, _state, questions) => ((criteria ||= JSON.stringify(questions)), { verdict: choice("trivial") });
    await turn(d, start(), "I walk into town and ask the smith what a knife costs.");
    const judge = d.asked.find((x) => x.messages[0]!.content.includes("referee"))!.messages.at(-1)!.content;
    expect(judge).toContain("the going is not the act and is not judged");
    expect(judge).toContain("Nor because the character is not yet where it is done");
    expect(criteria).toContain("Nor because the character is not yet where it is done");
  });
  test("a thing the player did not name is dropped when the second look says it does not fit", async () => {
    const r = start();
    take(r.sheet, { name: "Rope" });
    const j = { ...JUDGE, item: "Rope", item_named: false, scores: { ...JUDGE.scores, item: 3 } };
    const kept = await turn(deps({ judge: j, back: {} }), r, "I choke it.");
    expect(kept.report.roll!.modifiers.some((m) => m.what === "what is used")).toBe(true);
    const dropped = await turn(deps({ judge: j, back: {}, decide: (what) => (what === "fit" ? { item: choice("no") } : { verdict: choice("challenge") }) }), r, "I choke it.");
    expect(dropped.report.roll!.modifiers.some((m) => m.what === "what is used")).toBe(false);
  });
  test("a judge that cannot be read is asked again, then the line is taken as written", async () => {
    const d = deps({ judge: "nonsense", back: {} });
    const t = await turn(d, start(), "I do something.");
    expect(d.asked.filter((a) => a.messages[0]!.content.includes("referee"))).toHaveLength(2);
    expect(t.report.kind).toBe("story");
  });
  test("brought to nothing, the character comes round with a third of their health", async () => {
    const t = await turn(deps({ judge: JUDGE, back: { hp: [{ who: "player", delta: -100 }] } }), start(), "I charge.");
    expect(t.run.sheet.hp).toBe(30);
    expect(t.run.downs).toBe(1);
  });
  test("an ability or a death the second look will not swear to is not written down", async () => {
    const back = { ability: { name: "Ember Palm", text: "A burning strike." }, dead: ["Goblin"] };
    const t = await turn(deps({ judge: JUDGE, back, decide: (what) => (what === "confirm" ? { ability: choice("no"), dead0: choice("no") } : { verdict: choice("challenge") }) }), start(), "I choke it.");
    expect(t.run.sheet.abilities).toEqual([]);
    expect(t.run.people[0]).toMatchObject({ dead: false, hp: 0 });
  });
});

describe("reading back", () => {
  const back = (j: Record<string, unknown>) => readReadback(j);
  test("unfilled notes and empty answers are nothing", () => {
    const b = back({ new: [{ name: "<name>", text: "x" }], ability: { name: "null", text: "" }, place: null, xp: { size: 9 }, hp: [{ who: "player", delta: 0 }] });
    expect(b.fresh).toEqual([]);
    expect(b.ability).toBeNull();
    expect(b.place).toBeNull();
    expect(b.xp).toBe(5);
    expect(b.hp).toEqual([]);
  });
  test("only what is known can change, and only within bounds", () => {
    const r = start();
    take(r.sheet, { name: "Dagger" });
    r.sheet.money = 10;
    const told = apply(r, back({
      hp: [{ who: "Jay", delta: -30 }, { who: "A stranger", delta: -50 }, { who: "Goblin", delta: -40 }],
      feelings: [{ who: "Goblin", delta: -10 }, { who: "Nobody known", delta: 5 }],
      found: [{ name: "Dagger", qty: 1 }, { name: "Crown of Ages", quality: "legendary", qty: 1 }],
      lost: [{ name: "A thing never held", qty: 1 }],
      money: -500,
      xp: { size: 3 },
      minutes: 30,
    }), -1);
    expect(r.sheet.hp).toBe(70);
    expect(r.people[0]!.hp).toBe(60);
    expect(r.people[0]!.feeling).toBe(-10);
    expect(r.sheet.items.map((i) => [i.name, i.quality, i.qty])).toEqual([["Dagger", "common", 1], ["Crown of Ages", "rare", 1]]);
    expect(r.sheet.money).toBe(0);
    expect(r.sheet.xp).toBe(8);
    expect(r.minutes).toBe(30);
    expect(told.some((l) => l.includes("stranger"))).toBe(false);
  });
  test("a new name, a true name, a follower and a new place", () => {
    const r = start();
    const told = apply(r, back({ renamed: [{ from: "Goblin", to: "Grik" }], new: [{ name: "Evelyn", text: "Keeps the tavern.", power: 3, hostile: false }, { name: "you" }], follows: ["Grik"], place: { name: "Brestone village", text: "Smoke and thatch." } }), null);
    expect(r.people.map((p) => [p.name, p.here, p.follows])).toEqual([["Grik", true, true], ["Evelyn", true, false]]);
    expect(r.people[0]!.was).toEqual(["Goblin"]);
    expect(r.place.name).toBe("Brestone village");
    expect(told).toContain("You are now at Brestone village.");
    apply(r, back({ place: { name: "The road north", text: "" } }), null);
    expect(r.people.map((p) => p.here)).toEqual([true, false]);
  });
  test("the dead take no more harm and feel nothing", () => {
    const r = start();
    apply(r, back({ dead: ["Goblin"] }), null);
    const told = apply(r, back({ hp: [{ who: "Goblin", delta: -10 }], feelings: [{ who: "Goblin", delta: 5 }], hostile: ["Goblin"] }), null);
    expect(told).toEqual([]);
  });
});
