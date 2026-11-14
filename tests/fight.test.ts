/**
 * Fights and contests (src/engine/fight.ts, src/game/systems/fight.ts): the other side's own move, how lopsided a fight
 * is, contests with their measures and endings, and the saves from a killing blow. The models are faked.
 */
import { describe, expect, test } from "bun:test";
import {
  addXp, chooseMove, contestGap, contestWords, contestXp, deedXp, drawFromBag, endOf, foeWords, fightOf, freshFight, gapModifier, guardChance, makeContest, moveMeasure,
  moveSide, SAVE_COST, spend, stepOf, viewFight, YOU, type Draft, type FightState,
} from "../src/engine/fight.js";
import { attributesFrom, meet, newRun, take, tierOf, xpToNext, type Run } from "../src/engine/run.js";
import type { Message, Role } from "../src/game/ask.js";
import { pagesOf, sceneOf, showsOf, turn } from "../src/game/runturn.js";
import type { Readback, RunDeps, Told } from "../src/game/system.js";
import { fight, readDraft, readPassage } from "../src/game/systems/fight.js";

const start = (): Run => {
  const r = newRun(7, "a world", "a hero", "Jay");
  r.sheet.attributes = attributesFrom(["strength"]);
  r.opening = "A goblin stands in the road.";
  r.place = { name: "Forest road", text: "" };
  meet(r, { name: "Goblin", power: 2, hostile: true });
  return r;
};

const DRAFT = (over: Partial<Draft> = {}): Draft => ({
  name: "The chase through the market",
  rating: 3,
  sides: [{ name: "Jay", against: false, members: [YOU] }, { name: "The thieves", against: true, members: ["Goblin"] }],
  measures: [
    { name: "Jay's lead", length: "short", start: "middle", atFull: "win", atEmpty: "lose", good: "up" },
    { name: "The crowd", length: "medium", start: "middle", atFull: "none", atEmpty: "none", good: "down" },
  ],
  lines: ["I run harder", "I cut through a stall", "I hide"],
  ...over,
});

const line = (o: Partial<{ kind: "action" | "story"; verdict: string | null; outcome: number | null; target: string | null }> = {}) => ({ kind: "action" as const, verdict: "challenge", outcome: 0, target: "Goblin", ...o });

/* ------------------------------------------------- the engine ------------------------------------------------- */

describe("how lopsided a fight is", () => {
  test("a gap in power falls on seven steps, at the game's own thresholds", () => {
    expect([3, 2.6, 2.5, 1.6, 1.5, 0.6, 0.5, 0, -0.5, -0.6, -1.5, -1.6, -2.5, -2.6].map(stepOf)).toEqual([3, 3, 2, 2, 1, 1, 0, 0, 0, -1, -1, -2, -2, -3]);
  });

  test("each step has its own sentence, for a foe and for a contest", () => {
    const foe = new Set([-3, -2, -1, 0, 1, 2, 3].map((s) => foeWords("Goblin", "Jay", s)));
    const contest = new Set([-3, -2, -1, 0, 1, 2, 3].map((s) => contestWords("Jay", s)));
    expect(foe.size).toBe(7);
    expect(contest.size).toBe(7);
    expect(foeWords("Goblin", "Jay", 9)).toBe(foeWords("Goblin", "Jay", 3));
  });

  test("the roll changes by a tenth for each step, only past a fifth of one", () => {
    expect(gapModifier(0.2)).toBe(0);
    expect(gapModifier(1)).toBe(-10);
    expect(gapModifier(-1.5)).toBe(15);
  });

  test("a contest's gap is half its rating and half the strength of the sides", () => {
    const r = start();
    const tier = tierOf(r.sheet.level);
    const c = makeContest(r, DRAFT({ sides: [{ name: "Jay", against: false, members: [YOU] }] }))!;
    expect(contestGap(r, c)).toBe(0.5 * (3 - tier));
    const vs = makeContest(r, DRAFT())!;
    // One goblin at the character's own step against the character alone: the sides are even.
    expect(contestGap(r, vs)).toBeCloseTo(0.5 * (3 - tier) + 0.5 * Math.log2(Math.pow(2, 2 - tier) / 1));
  });
});

describe("the other side's own move", () => {
  test("worn things turn a blow by their quality", () => {
    expect(guardChance("legendary", 0, 0)).toBe(0.75);
    expect(guardChance("legendary", 1, 0)).toBe(0.95);
    expect(guardChance("rare", 0.5, 0)).toBeCloseTo(0.35);
    expect(guardChance("common", 0, 0.1)).toBe(0.01);
    expect(guardChance("common", 0, 0.5)).toBe(0);
    expect(guardChance("mundane", 1, 0)).toBe(0);
  });

  test("never on a line that only tells the story, or writes the fight as left behind, or with no answer read", () => {
    const r = start();
    const st = freshFight(r);
    expect(chooseMove(r, st, line({ kind: "story" }), { flee: false, over: false })).toBeNull();
    expect(chooseMove(r, st, line(), { flee: false, over: true })).toBeNull();
    expect(chooseMove(r, st, line(), null)).toBeNull();
  });

  test("the other side holds when the line was read as one it would hold for", () => {
    const r = start();
    expect(chooseMove(r, freshFight(r), line({ outcome: -1 }), { flee: false, over: false, press: false })).toBeNull();
    expect(chooseMove(r, freshFight(r), line({ outcome: -1 }), { flee: false, over: false, press: true })?.actor).toBe("Goblin");
  });

  test("a failed or empty attempt always gives the foe its turn; a clean escape never does", () => {
    const r = start();
    const st = freshFight(r);
    expect(chooseMove(r, st, line({ outcome: -1 }), { flee: false, over: false })?.actor).toBe("Goblin");
    expect(chooseMove(r, st, line({ verdict: "implausible", outcome: null }), { flee: false, over: false })?.actor).toBe("Goblin");
    expect(chooseMove(r, st, line({ outcome: -2 }), { flee: true, over: false })?.actor).toBe("Goblin");
    expect(chooseMove(r, st, line({ outcome: 1 }), { flee: true, over: false })).toBeNull();
    expect(chooseMove(r, st, line({ verdict: "trivial", outcome: null }), { flee: true, over: false })).toBeNull();
  });

  test("a narrow success gives it about half a chance", () => {
    const r = start();
    let acts = 0;
    for (let i = 0; i < 400; i++) if (chooseMove(r, freshFight(r), line({ outcome: 1, target: null }), { flee: false, over: false })) acts++;
    expect(acts).toBeGreaterThan(150);
    expect(acts).toBeLessThan(250);
  });

  test("nobody beaten, dead, gone or calmed acts, and a clear success spares the one it was done to", () => {
    const r = start();
    meet(r, { name: "Ogre", power: 3, hostile: true });
    const [g, o] = r.people;
    const st = freshFight(r);
    for (let i = 0; i < 40; i++) {
      const m = chooseMove(r, st, line({ outcome: 3, target: "Goblin" }), { flee: false, over: false });
      if (m) expect(m.actor).toBe("Ogre");
    }
    for (const knock of [() => (o!.hp = 0), () => (o!.dead = true), () => (o!.here = false), () => (o!.hostile = false)]) {
      o!.hp = 100; o!.dead = false; o!.here = true; o!.hostile = true;
      g!.hp = 0;
      knock();
      expect(chooseMove(r, freshFight(r), line({ outcome: -1 }), { flee: false, over: false })).toBeNull();
    }
  });

  test("a bag gives each their turn before anyone has a second", () => {
    const r = start();
    const bag: string[] = [];
    const names = ["A", "B", "C"];
    const got = Array.from({ length: 6 }, () => drawFromBag(r, bag, names));
    expect(new Set(got.slice(0, 3)).size).toBe(3);
    expect(new Set(got.slice(3)).size).toBe(3);
    // Someone gone is taken out of the bag.
    const bag2 = ["A", "B"];
    expect(drawFromBag(r, bag2, ["B"])).toBe("B");
    expect(drawFromBag(r, [], [])).toBeNull();
  });

  test("a contest with nobody left on the other side may still turn against the character by itself", () => {
    const r = start();
    r.people[0]!.hostile = false;
    const st = freshFight(r);
    st.contest = makeContest(r, DRAFT({ sides: [{ name: "Jay", against: false, members: [YOU] }] }));
    const m = chooseMove(r, st, line({ outcome: -1 }), { flee: false, over: false });
    expect(m).toEqual({ turn: r.turn, actor: "", hostile: false, stopped: null });
  });

  test("someone on the other side of a contest who is not fighting presses their side, with no blow to turn", () => {
    const r = start();
    r.people[0]!.hostile = false;
    const st = freshFight(r);
    st.contest = makeContest(r, DRAFT());
    expect(chooseMove(r, st, line({ outcome: -1 }), { flee: false, over: false })).toEqual({ turn: r.turn, actor: "Goblin", hostile: false, stopped: null });
  });
});

describe("a contest", () => {
  test("is built within the game's limits", () => {
    const r = start();
    meet(r, { name: "Ogre", power: 3 });
    const c = makeContest(r, DRAFT({
      sides: [
        { name: "The thieves", against: true, members: ["Goblin", YOU, "Nobody known"] },
        { name: "Jay", against: false, members: [YOU, "Goblin", "Ogre"] },
        { name: "Jay", against: false, members: ["Ogre"] },
      ],
      measures: [
        { name: "A", length: "short", start: "high", atFull: "win", atEmpty: "none", good: "down" },
        { name: "B", length: "long", start: "low", atFull: "none", atEmpty: "lose", good: "up" },
        { name: "C", length: "medium", start: "middle", atFull: "win", atEmpty: "none", good: "up" },
        { name: "D", length: "medium", start: "middle", atFull: "none", atEmpty: "none", good: "up" },
      ],
      lines: ["a", "b", "c", "d"],
    }))!;
    // The character only on their own side, everyone once, unknown names dropped, a side named twice once.
    expect(c.sides).toEqual([
      { name: "The thieves", against: true, you: false, members: ["Goblin"] },
      { name: "Jay", against: false, you: true, members: ["Ogre"] },
    ]);
    expect(c.measures.map((m) => m.name)).toEqual(["A", "B", "C"]);
    // At most two may end it; the third only colours it.
    expect(c.measures[2]).toMatchObject({ atFull: "none", atEmpty: "none" });
    // Which way is good follows from what ends it.
    expect(c.measures[0]!.good).toBe("up");
    expect(c.measures[0]!.max).toBe(5);
    expect(c.measures[1]!.max).toBe(25);
    expect(c.lines).toHaveLength(3);
    expect(c.most).toBe(24);
  });

  test("a measure never starts at an end that would end it at once", () => {
    const r = start();
    const c = makeContest(r, DRAFT({ measures: [{ name: "Lead", length: "short", start: "low", atFull: "none", atEmpty: "lose", good: "up" }] }))!;
    expect(c.measures[0]!.value).toBe(1);
    // A short measure's high start rounds to its top: moved to the middle.
    const d = makeContest(r, DRAFT({ measures: [{ name: "Lead", length: "short", start: "high", atFull: "win", atEmpty: "none", good: "up" }] }))!;
    expect(d.measures[0]!.value).toBe(4);
    const e = makeContest(r, DRAFT({ measures: [{ name: "Lead", length: "medium", start: "high", atFull: "win", atEmpty: "none", good: "up" }] }))!;
    expect(e.measures[0]!.value).toBe(9);
  });

  test("the character is put on a side of their own when the builder left them out; no measures is no contest", () => {
    const r = start();
    const c = makeContest(r, DRAFT({ sides: [{ name: "The thieves", against: true, members: ["Goblin"] }] }))!;
    expect(c.sides[0]).toEqual({ name: "Jay's side", against: false, you: true, members: [] });
    expect(makeContest(r, DRAFT({ measures: [] }))).toBeNull();
  });

  test("a measure moves at most three a beat and stays within its bounds", () => {
    const r = start();
    const m = makeContest(r, DRAFT())!.measures[1]!;
    expect(moveMeasure(m, 9)).toBe(3);
    expect(m.value).toBe(9);
    expect(moveMeasure(m, 3)).toBe(3);
    expect(moveMeasure(m, 3)).toBe(0);
    expect(m.value).toBe(12);
    expect(moveMeasure(m, -40)).toBe(-3);
  });

  test("people change sides, start a new one while there is room, and leave", () => {
    const r = start();
    meet(r, { name: "Guard", power: 3 });
    const c = makeContest(r, DRAFT())!;
    expect(moveSide(r, c, "Goblin", "Jay", false)).toContain("on your side");
    expect(c.sides[1]!.members).toEqual([]);
    expect(moveSide(r, c, "Guard", "The watch", true)).toContain("against you");
    expect(c.sides).toHaveLength(3);
    expect(moveSide(r, c, "Guard", "none", false)).toContain("out of");
    expect(c.sides.flatMap((s) => s.members)).toEqual(["Goblin"]);
    expect(moveSide(r, c, "Nobody", "Jay", false)).toBeNull();
  });

  test("it ends by its measures, by nobody being left to fight, or by running too long", () => {
    const r = start();
    const c = makeContest(r, DRAFT({ rating: 7 }))!;
    expect(endOf(r, c)).toBeNull();
    c.measures[0]!.value = 5;
    expect(endOf(r, c)).toMatchObject({ size: 5, told: false });
    c.measures[0]!.value = 0;
    expect(endOf(r, c)).toMatchObject({ size: 0 });
    c.measures[0]!.value = 2;
    c.beats = c.most;
    expect(endOf(r, c)).toMatchObject({ size: 0, told: false });
    // A plain fight between sides ends when nobody against the character is left standing.
    const f = makeContest(r, DRAFT({ measures: [{ name: "Ground", length: "medium", start: "middle", atFull: "none", atEmpty: "none", good: "up" }] }))!;
    expect(f.most).toBe(12);
    expect(endOf(r, f)).toBeNull();
    r.people[0]!.hp = 0;
    expect(endOf(r, f)).toMatchObject({ told: true, size: 3 });
  });

  test("experience goes by how it ended, and the deed already counted is known", () => {
    expect(contestXp(1, 0)).toBe(0);
    expect(contestXp(1, 5)).toBeGreaterThan(contestXp(1, 3));
    for (let s = 1; s <= 5; s++) expect(contestXp(4, s)).toBeGreaterThanOrEqual(deedXp(4, s));
    expect(deedXp(4, 2)).toBe(0);
    const r = start();
    const said = addXp(r.sheet, xpToNext(1) + 1);
    expect(r.sheet.level).toBe(2);
    expect(r.sheet.points).toBe(3);
    expect(said.at(-1)).toContain("Level 2");
  });
});

describe("saves from a killing blow", () => {
  test("a save costs a flat twenty from the health held before the blow, and is kept when that cannot hold", () => {
    const r = start();
    const st = freshFight(r);
    expect(spend(st, 70)).toBe(70 - SAVE_COST);
    expect(st.saves).toBe(1);
    expect(spend(st, 15)).toBeNull();
    expect(st.saves).toBe(1);
    expect(spend(st, 100)).toBe(80);
    expect(spend(st, 100)).toBeNull();
  });
});

describe("old runs", () => {
  test("a run with no state, or state from before a field came, is read with defaults and not written to", () => {
    const r = start();
    expect(viewFight(r)).toEqual(freshFight(r));
    expect(r.sys?.fight).toBeUndefined();
    r.sys = { fight: { saves: 1, contest: null } };
    const v = viewFight(r);
    expect(v.saves).toBe(1);
    expect(v.savesMost).toBe(2);
    expect(v.bag).toEqual([]);
    expect(v.spared).toBe(-1);
    fightOf(r);
    expect((r.sys.fight as FightState).ended).toEqual([]);
  });
});

/* ------------------------------------------------- reading the models' answers ------------------------------------------------- */

describe("the models' answers are checked", () => {
  test("a passage read with no contest under way reports a contest begun only when it is named and rated", () => {
    const r = start();
    expect(readPassage(r, { got_away: true, begun: { name: "A chase through the market", difficulty: 4 } }, null, null, true)).toMatchObject({ away: true, begun: { name: "A chase through the market", rating: 4 } });
    expect(readPassage(r, { begun: { name: "<a name>", difficulty: 4 } }, null, null, true)!.begun).toBeNull();
    expect(readPassage(r, { begun: { name: "A chase" } }, null, null, true)!.begun).toBeNull();
    // The settled move must be answered for.
    const m = { turn: 1, actor: "Goblin", hostile: true, stopped: null };
    expect(readPassage(r, {}, null, m, true)).toBeNull();
    expect(readPassage(r, { acted: false }, null, m, true)!.acted).toBe(false);
  });

  test("a beat read while a contest is on keeps only known measures, steps within three, and a real state", () => {
    const r = start();
    const c = makeContest(r, DRAFT())!;
    expect(readPassage(r, { state: "maybe" }, c, null, true)).toBeNull();
    const p = readPassage(r, { state: "on", measures: [{ name: "jay's lead", by: 7 }, { name: "The weather", by: 1 }, { name: "Jay's lead", by: -1 }, { name: "The crowd", by: 0 }], sides: [{ who: "Goblin", side: "Jay", against: false }, { who: "Stranger", side: "Jay" }] }, c, null, true)!;
    expect(p.moves).toEqual([{ name: "Jay's lead", by: 3 }]);
    expect(p.sides).toEqual([{ who: "Goblin", side: "Jay", against: false }]);
    // A replacement with nothing named in its place is no replacement.
    expect(readPassage(r, { state: "replaced", replaced_by: null }, c, null, true)!.state).toBe("on");
    expect(readPassage(r, { state: "ended", reason: "" }, c, null, true)!.reason).toBe("it is over");
  });

  test("a builder's contest is accepted whole or not at all", () => {
    const r = start();
    const b = { name: "The chase", rating: 3 };
    const ok = readDraft(r, {
      sides: [{ name: "Jay", against: false, members: ["player"] }, { name: "Thieves", against: true, members: ["Goblin"] }],
      measures: [{ name: "Lead", length: "short", start: "middle", at_full: "win", at_empty: "lose", good: "up" }, { name: "Crowd", length: "MEDIUM", start: "odd", at_full: "none", at_empty: "none", good: "down" }],
      lines: ["I run", "<a line>"],
    }, b)!;
    expect(ok.sides[0]!.you).toBe(true);
    expect(ok.measures[1]).toMatchObject({ length: "medium", value: 6, good: "down" });
    expect(ok.lines).toEqual(["I run"]);
    expect(readDraft(r, { sides: [{ name: "Jay", members: ["PLAYER"] }], measures: [{ name: "Lead", length: "forever" }, { name: "Crowd", length: "short" }] }, b)).toBeNull();
    expect(readDraft(r, { sides: [], measures: [] }, b)).toBeNull();
  });
});

/* ------------------------------------------------- the hooks, in a turn ------------------------------------------------- */

const JUDGE = {
  kind: "action", act: "swing at the goblin", target: "Goblin", item: null, item_named: false, needs_item: null, ability: null, ability_named: false,
  verdict: "implausible", reason: "It is too quick.", attribute: "strength", skill: "Swords", for: [], against: [], scores: { physical: 0, likelihood: 0, item: null, ability: null, other: null },
};

interface Fake {
  judge?: unknown;
  back?: unknown | ((n: number) => unknown);
  plan?: unknown;
  read?: unknown | ((n: number) => unknown);
  build?: unknown;
}

function deps(o: Fake = {}): RunDeps & { told: Message[][]; asked: Record<string, number> } {
  const told: Message[][] = [];
  const asked: Record<string, number> = { plan: 0, read: 0, build: 0, back: 0 };
  return {
    told,
    asked,
    systems: [fight],
    ask: async (messages: Message[], role: Role) => {
      const sys = messages[0]!.content;
      if (role === "teller") return (told.push(messages), told.length === 1 ? "You swing and miss." : "The goblin lunges at you.");
      if (sys.includes("You read one line a player wrote")) return (asked.plan!++, JSON.stringify(o.plan ?? { flee: false, over: false }));
      if (sys.includes("You keep the record of fights")) {
        const n = asked.read!++;
        return JSON.stringify(typeof o.read === "function" ? o.read(n) : (o.read ?? { acted: true, got_away: false, begun: null }));
      }
      if (sys.includes("You set up a drawn-out contest")) return (asked.build!++, JSON.stringify(o.build ?? {}));
      if (sys.includes("referee")) return JSON.stringify(o.judge ?? JUDGE);
      if (sys.includes("records")) {
        const n = asked.back!++;
        return JSON.stringify(typeof o.back === "function" ? o.back(n) : (o.back ?? { minutes: 2 }));
      }
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
  };
}

const BUILT = {
  sides: [{ name: "Jay", against: false, members: ["PLAYER"] }, { name: "The thieves", against: true, members: ["Goblin"] }],
  measures: [{ name: "Jay's lead", length: "short", start: "middle", at_full: "win", at_empty: "lose", good: "up" }, { name: "The crowd", length: "medium", start: "middle", at_full: "none", at_empty: "none", good: "down" }],
  lines: ["I run harder", "I duck into an alley"],
};

describe("the fight, in a turn", () => {
  test("the foe takes its own turn in the same passage, and nothing more is told when the passage showed it", async () => {
    const d = deps();
    const t = await turn(d, start(), "I swing at the goblin.");
    expect(d.told).toHaveLength(1);
    const asked = d.told[0]!.at(-1)!.content;
    expect(asked).toContain("Goblin does not wait");
    // How lopsided it is, in words, for every model.
    expect(sceneOf(d, t.run)).toContain("FIGHT: Jay is fighting Goblin.");
    expect(d.asked.plan).toBe(1);
  });

  test("a move the passage left out is told after it, once; not for a foe the passage beat", async () => {
    const missed = deps({ read: { acted: false, got_away: false, begun: null } });
    const t = await turn(missed, start(), "I swing at the goblin.");
    expect(missed.told).toHaveLength(2);
    expect(missed.told[1]!.at(-1)!.content).toContain("Goblin does this");
    expect(t.story).toBe("You swing and miss.\n\nThe goblin lunges at you.");
    const beaten = deps({ read: { acted: false, got_away: false, begun: null }, back: { beaten: ["Goblin"], minutes: 2 } });
    const b = await turn(beaten, start(), "I swing at the goblin.");
    expect(beaten.told).toHaveLength(1);
    // And nobody beaten acts afterwards.
    await turn(beaten, b.run, "I look around.");
    expect(beaten.told[1]!.at(-1)!.content).not.toContain("does not wait");
  });

  test("a line that only tells the story, or writes the fight as over, gives the foe no turn", async () => {
    const story = deps({ judge: { ...JUDGE, kind: "story" } });
    await turn(story, start(), "The goblin trips over a root.");
    expect(story.told[0]!.at(-1)!.content).not.toContain("does not wait");
    const over = deps({ plan: { flee: false, over: true } });
    await turn(over, start(), "Days later, I reach the city.");
    expect(over.told[0]!.at(-1)!.content).not.toContain("does not wait");
  });

  test("with nobody to fight the line is not read; a broken answer costs nothing", async () => {
    const r = start();
    r.people[0]!.hostile = false;
    const d = deps({ read: { nonsense: true } });
    const t = await turn(d, r, "I wave at the goblin.");
    expect(d.asked.plan).toBe(0);
    expect(t.story).toBe("You swing and miss.");
    expect(viewFight(t.run).contest).toBeNull();
  });

  test("getting clean away leaves the foe behind; an hour of story ends a plain fight", async () => {
    const away = await turn(deps({ read: { acted: true, got_away: true, begun: null } }), start(), "I run for it.");
    expect(away.run.people[0]!.here).toBe(false);
    const later = await turn(deps({ back: { minutes: 120 } }), start(), "I swing at the goblin.");
    expect(later.run.people[0]!.hostile).toBe(false);
  });

  test("a contest begun is built once, shown, moved by small steps, ended by its measure and told", async () => {
    const d = deps({
      read: (n: number) => (n === 0 ? { acted: true, got_away: false, begun: { name: "A chase through the market", difficulty: 3 } } : { acted: true, got_away: false, state: "on", reason: "", replaced_by: null, measures: [{ name: "Jay's lead", by: 3 }], sides: [] }),
      build: BUILT,
    });
    const a = await turn(d, start(), "I chase the goblin.");
    expect(d.asked.build).toBe(1);
    const c = viewFight(a.run).contest!;
    expect(c.name).toBe("A chase through the market");
    expect(c.measures[0]).toMatchObject({ value: 3, max: 5 });
    expect(sceneOf(d, a.run)).toContain("UNDER WAY: A chase through the market.");
    const shows = showsOf(d, a.run);
    expect(shows.filter((s) => s.kind === "bar").map((s) => s.name)).toEqual(["Goblin", "Jay's lead", "The crowd"]);
    expect(shows.filter((s) => s.kind === "card").map((s) => (s as { line?: string }).line)).toEqual(["I run harder", "I duck into an alley"]);
    expect(shows.find((s) => s.kind === "tokens")).toMatchObject({ count: 2, max: 2 });
    expect(pagesOf(d, a.run)[0]!.heading).toBe("A chase through the market");
    const xp = a.run.sheet.xp;
    const b = await turn(d, a.run, "I run harder.");
    // Three, from three to five: full, and won.
    expect(viewFight(b.run).contest).toBeNull();
    expect(b.run.sheet.xp).toBeGreaterThan(xp);
    expect(b.report.changes.join(" ")).toContain("A chase through the market is over");
    expect(d.told.at(-1)!.at(-1)!.content).toContain("comes to its end now");
    expect(d.asked.build).toBe(1);
    expect(sceneOf(d, b.run)).not.toContain("UNDER WAY");
  });

  test("a contest the story ends is not told again, and is worth more than the deed alone", async () => {
    const r = start();
    const st = fightOf(r);
    st.contest = makeContest(r, DRAFT());
    const d = deps({ read: { acted: true, got_away: false, state: "ended", reason: "the thieves give up", replaced_by: null, measures: [], sides: [] }, back: { xp: { why: "won", size: 4 }, minutes: 2 } });
    const plain = deps({ back: { xp: { why: "won", size: 4 }, minutes: 2 } });
    const t = await turn(d, r, "I corner the thief.");
    const u = await turn(plain, start(), "I corner the thief.");
    expect(viewFight(t.run).contest).toBeNull();
    expect(viewFight(t.run).ended.at(-1)!.how).toBe("the thieves give up");
    expect(d.told).toHaveLength(1);
    expect(t.run.sheet.xp).toBeGreaterThan(u.run.sheet.xp);
  });

  test("a contest never runs past its cap, and the aftermath of one is not a new one", async () => {
    const r = start();
    const st = fightOf(r);
    st.contest = makeContest(r, DRAFT())!;
    st.contest.beats = st.contest.most - 1;
    const d = deps({ read: { acted: true, got_away: false, state: "on", reason: "", replaced_by: null, measures: [], sides: [] }, build: BUILT });
    const t = await turn(d, r, "I keep running.");
    expect(viewFight(t.run).contest).toBeNull();
    expect(t.report.changes.join(" ")).toContain("no clear winner");
    const again = deps({ read: { acted: true, got_away: false, begun: { name: "Another chase begins here", difficulty: 3 } }, build: BUILT });
    const u = await turn(again, t.run, "I catch my breath.");
    expect(again.asked.build).toBe(0);
    expect(viewFight(u.run).contest).toBeNull();
  });

  test("a killing blow costs a save instead, the storyteller is told so next turn, and healing fills the saves", async () => {
    const d = deps({ back: (n: number) => (n === 0 ? { hp: [{ who: "player", delta: -200 }], minutes: 2 } : n === 1 ? { hp: [{ who: "player", delta: 10 }], minutes: 2 } : { minutes: 2 }) });
    const a = await turn(d, start(), "I swing at the goblin.");
    expect(a.run.downs).toBe(0);
    expect(a.run.sheet.hp).toBe(80);
    expect(viewFight(a.run).saves).toBe(1);
    const b = await turn(d, a.run, "I swing again.");
    expect(d.told.at(-1)!.at(-1)!.content).toContain("did not");
    expect(viewFight(b.run).saves).toBe(2);
  });

  test("with no saves left the character falls, and the contest under way is lost with them", async () => {
    const r = start();
    const st = fightOf(r);
    st.saves = 0;
    st.contest = makeContest(r, DRAFT());
    const d = deps({ back: { hp: [{ who: "player", delta: -200 }], minutes: 2 }, read: { acted: true, got_away: false, state: "on", reason: "", replaced_by: null, measures: [], sides: [] } });
    const a = await turn(d, r, "I swing at the goblin.");
    expect(a.run.downs).toBe(1);
    expect(sceneOf(d, a.run)).not.toContain("UNDER WAY");
    const b = await turn(deps({ read: { acted: true, got_away: false, begun: null } }), a.run, "I get up.");
    expect(viewFight(b.run).contest).toBeNull();
    expect(viewFight(b.run).ended.at(-1)!.how).toContain("brought down");
  });

  test("a blow a worn thing turned leaves no wound, unless the character's own attempt went badly", () => {
    const r = start();
    r.turn = 3;
    const shield = take(r.sheet, { name: "Shield", quality: "legendary" })!;
    shield.worn = true;
    fightOf(r).move = { turn: 3, actor: "Goblin", hostile: true, stopped: "Shield" };
    const back = (): Readback => ({ renamed: [], fresh: [], hp: [{ who: "player", delta: -12 }, { who: "Goblin", delta: -5 }], feelings: [], follows: [], hostile: [], calmed: [], gone: [], beaten: [], dead: [], found: [], lost: [], money: 0, ability: null, xp: 0, place: null, minutes: 1 });
    const told = (outcome: Told["outcome"]): Told => ({ line: "", kind: "action", act: "", verdict: "challenge", target: null, item: null, ability: null, attribute: "strength", skill: "", roll: null, outcome, before: r, story: "", core: null, minutes: 0 });
    const a = back();
    fight.amend!(r, a, told(1), null);
    expect(a.hp).toEqual([{ who: "Goblin", delta: -5 }]);
    const b = back();
    fight.amend!(r, b, told(-2), null);
    expect(b.hp).toHaveLength(2);
  });

  test("a run saved before the system existed plays on", async () => {
    const r = start();
    delete r.sys;
    const t = await turn(deps(), r, "I swing at the goblin.");
    expect(viewFight(t.run).saves).toBe(2);
  });

  test("a player who writes the fight as over is followed: the contest ends and nobody fights on", async () => {
    const r = start();
    fightOf(r).contest = makeContest(r, DRAFT());
    const d = deps({ judge: { ...JUDGE, kind: "story" }, plan: { flee: false, over: true }, read: { acted: true, got_away: false, state: "on", reason: "", replaced_by: null, measures: [], sides: [] } });
    const t = await turn(d, r, "Hours later, I walk into an inn.");
    expect(viewFight(t.run).contest).toBeNull();
    expect(t.run.people[0]!.hostile).toBe(false);
    expect(d.told).toHaveLength(1);
  });

  test("a fight begun in the passage is marked, though the turn's own read-back missed it; not for someone beaten in it", async () => {
    const calm = (): Run => {
      const r = start();
      r.people[0]!.hostile = false;
      return r;
    };
    const d = deps({ read: { fighting: ["goblin", "Nobody"], begun: null } });
    const t = await turn(d, calm(), "I kick the goblin.");
    expect(t.run.people[0]!.hostile).toBe(true);
    expect(t.report.changes).toContain("Goblin is fighting you.");
    const beaten = await turn(deps({ read: { fighting: ["Goblin"], begun: null }, back: { beaten: ["Goblin"], minutes: 1 } }), calm(), "I kick the goblin.");
    expect(beaten.run.people[0]!.hostile).toBe(false);
  });

  test("running somewhere new does not shake off a foe, unless the passage shows the character got clear away", async () => {
    const chased = await turn(deps({ back: { place: { name: "Open fields", text: "" }, minutes: 3 } }), start(), "I run into the fields.");
    expect(chased.run.place.name).toBe("Open fields");
    expect(chased.run.people[0]!.here).toBe(true);
    const lost = await turn(deps({ back: { place: { name: "Open fields", text: "" }, minutes: 3 }, read: { acted: true, got_away: true, begun: null } }), start(), "I run into the fields.");
    expect(lost.run.people[0]!.here).toBe(false);
    const left = await turn(deps({ back: { place: { name: "Open fields", text: "" }, gone: ["Goblin"], minutes: 3 } }), start(), "I run into the fields.");
    expect(left.run.people[0]!.here).toBe(false);
  });
});
