import { describe, expect, test } from "bun:test";
import { attributesFrom, meet, newRun, sceneText, take, type Run } from "../src/engine/run.js";
import { addSeat, HOST, partyShare, reseat, seatFirst, seatOf, settled, sit } from "../src/engine/seats.js";
import type { Message, Role } from "../src/game/ask.js";
import { afterRound, idle, join, judgeRound, round, tellingOfRound } from "../src/game/partyturn.js";
import type { RunDeps } from "../src/game/runturn.js";

const SHEET = {
  name: "Tom", calling: "Hedge knight",
  attributes: ["strength", "charisma", "dexterity", "cunning", "intelligence"],
  skills: [{ name: "Swordplay", level: 4 }, { name: "Riding", level: 3 }, { name: "Brawling", level: 3 }, { name: "Courtesy", level: 2 }, { name: "Tracking", level: 1 }],
  abilities: [{ name: "Stand Fast", text: "Cannot be moved for a breath.", tier: 1 }],
  items: [{ name: "Longsword", text: "Notched.", quality: "common", qty: 1, worn: true }],
  money: 12,
};

const judgeOf = (act: string, attribute: string, verdict = "challenge"): Record<string, unknown> => ({
  kind: "action", act, target: null, item: null, item_named: false, needs_item: null, ability: null, ability_named: false, verdict, reason: "It could go either way.",
  attribute, skill: attribute === "strength" ? "Swordplay" : "Stealth", for: [], against: [], scores: { physical: 0, likelihood: 0, item: null, ability: null, other: null },
});

interface Fake {
  /** The judge's answer for a line, by a word in it. */
  judge: (line: string) => Record<string, unknown>;
  /** The read-back for a character, by their name. */
  back?: (name: string) => Record<string, unknown>;
  story?: string;
}

function deps(f: Fake): RunDeps & { asked: { role: Role; messages: Message[] }[] } {
  const asked: { role: Role; messages: Message[] }[] = [];
  return {
    asked,
    systems: [],
    ask: async (messages, role) => {
      asked.push({ role, messages });
      const sys = messages[0]!.content, user = messages[1]?.content ?? "";
      if (role === "builder") return JSON.stringify(SHEET);
      if (role === "teller") return f.story ?? "Both of them act, and the road answers.";
      if (sys.includes("referee")) return JSON.stringify(f.judge(/THE PLAYER WROTE:\s*"""\s*([\s\S]*?)"""/.exec(user)?.[1] ?? ""));
      if (sys.includes("records")) return JSON.stringify(f.back?.(/The player's character: ([^.]+)\./.exec(user)?.[1] ?? "") ?? {});
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
  };
}

const start = (): Run => {
  const r = newRun(7, "a world", "Mira, a thief.", "Mira");
  r.sheet.attributes = attributesFrom(["dexterity", "cunning"]);
  r.sheet.skills.push({ name: "Stealth", xp: 300, level: 3 });
  take(r.sheet, { name: "Lockpicks" });
  r.opening = "A goblin rummages in a sack.";
  r.place = { name: "Forest road", text: "" };
  meet(r, { name: "Goblin", power: 2 });
  return r;
};

async function two(d: RunDeps): Promise<Run> {
  const r = start();
  seatFirst(r, HOST, "Ana");
  await join(d, r, { id: "p2", player: "Ben", name: "Tom", page: "Tom, a hedge knight." });
  return r;
}

describe("seats", () => {
  test("a run for one is untouched until someone is seated", () => {
    const r = start();
    expect(r.seats).toBeUndefined();
    expect(sceneText(r)).not.toContain("another player's character");
  });

  test("the chair holds one character at a time, and each keeps their own", async () => {
    const r = await two(deps({ judge: () => ({}) }));
    expect(r.seats!.map((s) => s.sheet.name)).toEqual(["Mira", "Tom"]);
    expect(r.chair).toBe(HOST);
    expect(r.sheet.name).toBe("Mira");
    r.people[0]!.feeling = 40;
    r.sheet.hp = 55;
    sit(r, "p2");
    expect(r.sheet.name).toBe("Tom");
    expect(r.sheet.hp).toBe(100);
    expect(r.who).toBe("Tom, a hedge knight.");
    // The goblin has no cause to feel anything about Tom yet.
    expect(r.people[0]!.feeling).toBe(0);
    r.people[0]!.feeling = -30;
    sit(r, HOST);
    expect(r.sheet.hp).toBe(55);
    expect(r.people[0]!.feeling).toBe(40);
    expect(r.people[0]!.feels).toEqual({ host: 40, p2: -30 });
  });

  test("a save read back is whole: the chair's own things are in its seat", async () => {
    const r = await two(deps({ judge: () => ({}) }));
    r.sheet.money = 99;
    const read = JSON.parse(JSON.stringify(settled(r))) as Run;
    expect(seatOf(read, HOST)!.sheet.money).toBe(99);
    sit(read, "p2");
    sit(read, HOST);
    expect(read.sheet.money).toBe(99);
  });

  test("the scene names the other players' characters, and the story cannot bring them in as strangers", async () => {
    const r = await two(deps({ judge: () => ({}) }));
    expect(sceneText(r)).toContain("Tom (another player's character)");
    expect(meet(r, { name: "Tom" })).toBeNull();
    sit(r, "p2");
    expect(sceneText(r)).toContain("Mira (another player's character)");
  });

  test("a guest who comes back under a new id keeps their seat", async () => {
    const r = await two(deps({ judge: () => ({}) }));
    // The chair's own feeling is the one that counts for its seat.
    r.people[0]!.feeling = 5;
    r.people[0]!.feels = { p2: -20 };
    reseat(r, "p2", "p9");
    expect(seatOf(r, "p9")!.sheet.name).toBe("Tom");
    expect(r.people[0]!.feels).toEqual({ host: 5, p9: -20 });
  });

  test("a second character of the same name is told apart", async () => {
    const d = deps({ judge: () => ({}) });
    const r = await two(d);
    const third = await join(d, r, { id: "p3", player: "Cy", name: "Tom", page: "" });
    expect(third.sheet.name).toBe("Tom (Cy)");
  });

  test("a deed shared is worth less to each", () => {
    expect(partyShare(1)).toBe(1);
    expect(partyShare(2)).toBeCloseTo(0.85, 2);
    expect(partyShare(3)).toBeCloseTo(0.75, 2);
  });
});

describe("a round", () => {
  test("each line is rolled on its own player's character", async () => {
    const d = deps({ judge: (line) => (line.includes("sneak") ? judgeOf("sneak past the goblin", "dexterity") : judgeOf("cut the goblin down", "strength")) });
    const r = await two(d);
    const x = await judgeRound(d, r, [{ seat: HOST, line: "I sneak past it." }, { seat: "p2", line: "I cut it down." }]);
    const [mira, tom] = x.parts;
    expect(mira!.report!.roll!.attribute).toMatchObject({ name: "dexterity", level: 6 });
    expect(tom!.report!.roll!.attribute).toMatchObject({ name: "strength", level: 6 });
    // Tom's skill is his own: Mira has no Swordplay.
    expect(tom!.report!.roll!.skill).toMatchObject({ name: "Swordplay", level: 4, fresh: false });
    // The round is one turn, however many wrote.
    expect(x.run.turn).toBe(r.turn + 1);
    // The run given is not changed.
    expect(r.turn).toBe(0);
    expect(x.lead).toBe(0);
  });

  test("the storyteller is given every line with who wrote it, every result, and every sheet", async () => {
    const d = deps({ judge: (line) => (line.includes("sneak") ? judgeOf("sneak past the goblin", "dexterity") : judgeOf("cut the goblin down", "strength")) });
    const r = await two(d);
    const x = await judgeRound(d, r, [{ seat: HOST, line: "I sneak past it." }, { seat: "p2", line: "I cut it down." }]);
    const m = tellingOfRound(d, x);
    const all = m.map((y) => y.content).join("\n");
    expect(m[0]!.content).toContain("played by 2 players");
    expect(m[0]!.content).toContain("Mira and Tom");
    expect(all).toContain("Mira: I sneak past it.");
    expect(all).toContain("Tom: I cut it down.");
    expect(all).toMatch(/- Mira attempts this: sneak past the goblin|- Mira does this: sneak past the goblin/);
    expect(all).toMatch(/- Tom attempts this: cut the goblin down|- Tom does this: cut the goblin down/);
    expect(all).toContain("Longsword");
    expect(all).toContain("Lockpicks");
    // Only the host's character leads the party elsewhere.
    expect(all).toContain("only its host's character leads it to another place");
  });

  test("what the passage changed is written down for the character it happened to", async () => {
    const d = deps({
      judge: (line) => (line.includes("sneak") ? judgeOf("sneak past the goblin", "dexterity") : judgeOf("cut the goblin down", "strength")),
      back: (name) => (name === "Mira" ? { found: [{ name: "Goblin's key", text: "Iron.", quality: "common", qty: 1 }], feelings: [{ who: "Goblin", delta: 6 }], minutes: 5, xp: { size: 3 } } : { hp: [{ who: "player", delta: -12 }], feelings: [{ who: "Goblin", delta: -9 }], minutes: 5, dead: ["Goblin"], xp: { size: 3 } }),
    });
    const r = await two(d);
    const t = await round(d, r, [{ seat: HOST, line: "I sneak past it." }, { seat: "p2", line: "I cut it down." }]);
    const mira = seatOf(t.run, HOST)!, tom = seatOf(t.run, "p2")!;
    expect(mira.sheet.items.map((i) => i.name)).toContain("Goblin's key");
    expect(tom.sheet.items.map((i) => i.name)).not.toContain("Goblin's key");
    expect(mira.sheet.hp).toBe(100);
    expect(tom.sheet.hp).toBe(88);
    // The goblin feels differently about each of them.
    expect(t.run.people[0]!.feels).toMatchObject({ host: 6, p2: -9 });
    // What is the whole table's is written down once, from the lead's read-back: Tom's cannot kill the goblin again.
    expect(t.run.people[0]!.dead).toBe(false);
    expect(t.run.minutes).toBe(5);
    expect(t.run.beats.at(-1)!.you).toBe("Mira: I sneak past it.\n\nTom: I cut it down.");
    // A deed shared: each earns less than alone, and both earn.
    expect(mira.sheet.xp).toBeGreaterThan(0);
    expect(tom.sheet.xp).toBe(mira.sheet.xp);
    expect(t.parts.find((p) => p.seat === "p2")!.changes.join(" ")).toContain("Health -12");
    expect(t.run.chair).toBe(HOST);
  });

  test("someone who wrote nothing can still be hurt", async () => {
    const d = deps({ judge: () => judgeOf("cut the goblin down", "strength"), back: (name) => (name === "Mira" ? { hp: [{ who: "player", delta: -20 }] } : {}) });
    const r = await two(d);
    const t = await round(d, r, [{ seat: "p2", line: "I cut it down." }]);
    expect(seatOf(t.run, HOST)!.sheet.hp).toBe(80);
    expect(t.parts.some((p) => p.seat === HOST && p.changes.join(" ").includes("Health -20"))).toBe(true);
  });

  test("a new player's arrival is told, and nothing is rolled for it", async () => {
    const d = deps({ judge: () => judgeOf("sneak past the goblin", "dexterity") });
    const r = start();
    seatFirst(r, HOST, "Ana");
    await join(d, r, { id: "p2", player: "Ben", name: "Tom", page: "Tom, a hedge knight." });
    const x = await judgeRound(d, r, [{ seat: "p2", line: "(sits down)" }], ["p2"]);
    expect(idle(x)).toBe(false);
    expect(x.parts[0]!.how).toBe("joined");
    expect(x.result).toContain("Bring Tom into the scene now");
    const t = await afterRound(d, x, "A knight rides up.");
    expect(t.run.beats.at(-1)!.story).toBe("A knight rides up.");
    expect(t.run.turn).toBe(1);
  });

  test("a character brought down for good is out, and the others go on", async () => {
    const d = { ...deps({ judge: () => judgeOf("cut the goblin down", "strength"), back: (name) => (name === "Tom" ? { hp: [{ who: "player", delta: -100 }] } : {}) }), rules: () => ({ fall: "end" }) };
    const r = await two(d);
    const t = await round(d, r, [{ seat: HOST, line: "I sneak." }, { seat: "p2", line: "I cut it down." }]);
    expect(seatOf(t.run, "p2")!.out).toBe(true);
    expect(t.run.over).toBeFalsy();
    const next = await judgeRound(d, t.run, [{ seat: "p2", line: "I get up." }]);
    expect(next.parts[0]!.how).toBe("answered");
    expect(idle(next)).toBe(true);
  });

  test("with only the host seated, a round is the turn it always was", async () => {
    const d = deps({ judge: () => judgeOf("sneak past the goblin", "dexterity") });
    const r = start();
    seatFirst(r, HOST, "Ana");
    const x = await judgeRound(d, r, [{ seat: HOST, line: "I sneak past it." }]);
    expect(x.line).toBe("I sneak past it.");
    expect(tellingOfRound(d, x)[0]!.content).toContain("every character except the player's own, Mira");
  });

  test("an added seat does not take the chair", () => {
    const r = start();
    seatFirst(r, HOST, "Ana");
    addSeat(r, { id: "p2", player: "Ben", who: "x", sheet: { ...newRun(1, "", "", "Tom").sheet } });
    expect(r.chair).toBe(HOST);
    expect(r.sheet.name).toBe("Mira");
  });
});
