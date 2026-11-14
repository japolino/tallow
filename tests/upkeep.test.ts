/**
 * Upkeep: the clock, the needs that run down, and the dated things (engine/upkeep.ts, game/systems/upkeep.ts).
 */
import { describe, expect, test } from "bun:test";
import { MAX_HP, newRun, type Run } from "../src/engine/run.js";
import {
  alike, bandOf, clockOf, clockWords, costs, CRITICAL, dueOf, drain, feed, freshUpkeep, HEALTH_FLOOR, keepAfterSkip, makeNeed, mend, parseTime, penalties, phaseOf, RATE, setDate, SKIP_FLOOR, SKIP_KEPT,
  standing, takeCosts, tidy, whenWords, DAY, DRAIN_HOURS, type Dated, type Need, type Upkeep,
} from "../src/engine/upkeep.js";
import type { Message, Role } from "../src/game/ask.js";
import { begin, pagesOf, sceneOf, showsOf, turn } from "../src/game/runturn.js";
import type { RunDeps, Told } from "../src/game/system.js";
import { upkeep } from "../src/game/systems/upkeep.js";

const need = (over: Partial<Need> = {}): Need => ({ name: "Food", low: "Hungry", feeds: "a meal", pace: "steady", value: 80, ...over });

describe("the clock", () => {
  test("the stretches of the day, and day and minute from an absolute minute", () => {
    expect(phaseOf(4 * 60 + 59)).toBe("night");
    expect(phaseOf(5 * 60)).toBe("dawn");
    expect(phaseOf(7 * 60)).toBe("morning");
    expect(phaseOf(12 * 60)).toBe("noon");
    expect(phaseOf(15 * 60)).toBe("afternoon");
    expect(phaseOf(18 * 60)).toBe("dusk");
    expect(phaseOf(23 * 60)).toBe("night");
    expect(phaseOf(0)).toBe("night");
    expect(clockOf(9 * 60)).toEqual({ day: 1, minute: 540, phase: "morning" });
    expect(clockOf(DAY + 30)).toEqual({ day: 2, minute: 30, phase: "night" });
    // What cannot be a clock is day one, midnight.
    expect(clockOf(-50).day).toBe(1);
    expect(clockOf(NaN).day).toBe(1);
  });

  test("the day and the hour never run backwards as minutes grow", () => {
    let last = clockOf(0);
    for (let m = 0; m < 3 * DAY; m += 37) {
      const c = clockOf(9 * 60 + m);
      expect(c.day * DAY + c.minute).toBeGreaterThanOrEqual(last.day * DAY + last.minute);
      last = c;
    }
  });

  test("times are read as 24-hour clock or not at all", () => {
    expect(parseTime("18:30")).toBe(1110);
    expect(parseTime("7")).toBe(420);
    expect(parseTime(" 07:05 ")).toBe(425);
    for (const bad of ["24:00", "12:60", "noon", "", null, undefined, 12, "6pm"]) expect(parseTime(bad)).toBeNull();
  });

  test("a time is said aloud to the nearest quarter hour", () => {
    expect(clockWords(0)).toBe("about midnight");
    expect(clockWords(12 * 60 + 5)).toBe("about noon");
    expect(clockWords(17 * 60 + 30)).toBe("about half past five in the evening");
    expect(clockWords(8 * 60 + 14)).toBe("about a quarter past eight in the morning");
    expect(clockWords(9 * 60 + 58)).toBe("about ten in the morning");
    expect(clockWords(22 * 60 + 40)).toBe("about a quarter to eleven at night");
    expect(whenWords(2 * DAY + 600, DAY / 2)).toBe("in 2 days, about ten in the morning");
    expect(whenWords(DAY + 600, DAY / 2)).toBe("tomorrow, about ten in the morning");
  });
});

describe("needs", () => {
  test("a need a model describes is kept whole or not at all", () => {
    const ok = { name: "food", low: "hungry", feeds: "a meal", pace: "Steady", starts: "fair" };
    expect(makeNeed(ok)).toEqual({ name: "Food", low: "Hungry", feeds: "a meal", pace: "steady", value: 60 });
    expect(makeNeed({ ...ok, pace: "fast" })).toBeNull();
    expect(makeNeed({ ...ok, starts: "full" })).toBeNull();
    expect(makeNeed({ ...ok, name: "<one or two words>" })).toBeNull();
    expect(makeNeed({ ...ok, low: "" })).toBeNull();
    expect(makeNeed({ ...ok, low: "very very hungry" })).toBeNull();
  });

  test("a need runs down at its pace, by the hour, and never below nothing", () => {
    const n = need({ value: 80 });
    expect(drain(n, 60)).toBe(RATE.steady);
    expect(n.value).toBe(78);
    const q = need({ pace: "quick", value: 50 });
    drain(q, 30);
    expect(q.value).toBe(48);
    const s = need({ pace: "slow", value: 3 });
    drain(s, 600);
    expect(s.value).toBe(0);
  });

  test("a passage of no minutes drains nothing", () => {
    const n = need();
    expect(drain(n, 0)).toBe(0);
    expect(drain(n, -30)).toBe(0);
    expect(n.value).toBe(80);
  });

  test("one passage drains no more than half a day's worth, however long it is", () => {
    const n = need({ pace: "quick", value: 100 });
    drain(n, 60 * 24 * 30);
    expect(n.value).toBe(100 - RATE.quick * DRAIN_HOURS);
  });

  test("a skip alone never runs a need below the edge of critical, and keeps what was lower already", () => {
    const n = need({ pace: "quick", value: 40 });
    drain(n, 60 * 24 * 7, true);
    expect(n.value).toBe(SKIP_FLOOR);
    expect(bandOf(n)).toBe("low");
    const low = need({ value: 4 });
    drain(low, 60 * 24, true);
    expect(low.value).toBe(4);
  });

  test("steps of a meal, and of a worse state, move a need by fixed amounts and stay inside the bar", () => {
    const n = need({ value: 20 });
    expect(feed(n, 1)).toBe(15);
    expect(feed(n, 2)).toBe(35);
    expect(n.value).toBe(70);
    expect(feed(n, 3)).toBe(30);
    expect(n.value).toBe(100);
    expect(feed(n, -2)).toBe(-30);
    expect(feed(n, -1)).toBe(-12);
    expect(n.value).toBe(58);
    // A step outside the range is held to it; one that is not a number is nothing.
    expect(feed(n, 9)).toBe(42);
    const m = need({ value: 50 });
    expect(feed(m, Number.NaN)).toBe(0);
    expect(feed(m, 0)).toBe(0);
    const z = need({ value: 5 });
    expect(feed(z, -2)).toBe(-5);
  });

  test("a skip lifts a need to what a looked-after one stands at, and no higher", () => {
    const n = need({ value: 20 });
    keepAfterSkip(n);
    expect(n.value).toBe(SKIP_KEPT);
    const full = need({ value: 90 });
    keepAfterSkip(full);
    expect(full.value).toBe(90);
  });

  test("bands: low at thirty, critical under ten", () => {
    expect(bandOf(need({ value: 31 }))).toBe("fine");
    expect(bandOf(need({ value: 30 }))).toBe("low");
    expect(bandOf(need({ value: CRITICAL }))).toBe("low");
    expect(bandOf(need({ value: 9.9 }))).toBe("critical");
  });

  test("a critical need takes a little health, and never more than four a turn in all", () => {
    const three = [need({ name: "A", value: 0 }), need({ name: "B", value: 0 }), need({ name: "C", value: 5 })];
    expect(costs(three).map((c) => c.cost)).toEqual([2, 2]);
    expect(costs([need({ value: 5 })])).toHaveLength(1);
    expect(costs([need({ value: 5 })])[0]!.cost).toBe(1);
    expect(costs([need({ value: 50 }), need({ name: "Low", value: 20 })])).toEqual([]);
  });

  test("needs alone never take the character from full health in one stroke, nor below the floor", () => {
    const r = newRun(1, "w", "h", "Jay");
    const bad = [need({ name: "A", value: 0 }), need({ name: "B", value: 0 }), need({ name: "C", value: 0 })];
    const took = takeCosts(r.sheet, bad);
    expect(MAX_HP - r.sheet.hp).toBeLessThanOrEqual(4);
    expect(took.reduce((n, t) => n + t.took, 0)).toBe(MAX_HP - r.sheet.hp);
    r.sheet.hp = HEALTH_FLOOR + 1;
    expect(takeCosts(r.sheet, bad).reduce((n, t) => n + t.took, 0)).toBe(1);
    expect(r.sheet.hp).toBe(HEALTH_FLOOR);
    expect(takeCosts(r.sheet, bad)).toEqual([]);
    expect(r.sheet.hp).toBe(HEALTH_FLOOR);
  });

  test("critical needs take five hundredths each from a roll, ten at most", () => {
    expect(penalties([need({ value: 50 }), need({ value: 20 })])).toEqual([]);
    const two = penalties([need({ name: "A", value: 1 }), need({ name: "B", value: 1 })]);
    expect(two.map((m) => m.by)).toEqual([-5, -5]);
    expect(two[0]!.what).toBe("hungry");
    expect(penalties([need({ value: 1 }), need({ name: "B", value: 1 }), need({ name: "C", value: 1 })]).reduce((n, m) => n + m.by, 0)).toBe(-10);
  });
});

describe("dated things", () => {
  const mk = (name: string, due: number, over: Partial<Dated> = {}): Dated => ({ name, due, lasts: 120, place: "", done: false, ...over });

  test("a thing is set down once, in the future, within reach, and a list stays short", () => {
    const list: Dated[] = [];
    const now = 9 * 60;
    expect(setDate(list, now, { name: "The festival", due: now + 3 * DAY, lasts: 600 })).toBe("added");
    expect(setDate(list, now, { name: "Too late", due: now - 1, lasts: 60 })).toBeNull();
    expect(setDate(list, now, { name: "Too far", due: now + 200 * DAY, lasts: 60 })).toBeNull();
    expect(setDate(list, now, { name: "<name>", due: now + 60, lasts: 60 })).toBeNull();
    expect(setDate(list, now, { name: "", due: now + 60, lasts: 60 })).toBeNull();
    for (let i = 0; i < 10; i++) setDate(list, now, { name: `Gathering number ${i}${"x".repeat(i)}`, due: now + (i + 1) * 60 * 5, lasts: 60 });
    expect(list.filter((d) => !d.done)).toHaveLength(6);
    expect(list.map((d) => d.due)).toEqual([...list.map((d) => d.due)].sort((a, b) => a - b));
  });

  test("the same thing said again is not added twice, and said for another day it is moved", () => {
    const list: Dated[] = [];
    const now = 540;
    setDate(list, now, { name: "The harvest festival", due: now + 3 * DAY, lasts: 600 });
    expect(setDate(list, now, { name: "harvest festival", due: now + 3 * DAY, lasts: 600 })).toBeNull();
    expect(setDate(list, now, { name: "Festival", due: now + 3 * DAY + 60, lasts: 600 })).toBe("moved");
    expect(list).toHaveLength(1);
    expect(list[0]!.due).toBe(now + 3 * DAY + 60);
    // A different thing on another day is a different thing.
    expect(setDate(list, now, { name: "Festival of lamps", due: now + 20 * DAY, lasts: 600 })).toBe("added");
    expect(alike(mk("Meeting with Sela", 100), { name: "Meeting with Tomas", due: 100 })).toBe(false);
  });

  test("where a thing stands: far, soon, now, missed after an hour's grace for a day, then over", () => {
    const d = mk("Fair", 1000, { lasts: 120 });
    expect(standing(d, 0)).toBe("far");
    expect(standing(d, 1000 - 16 * 60)).toBe("soon");
    expect(standing(d, 1000)).toBe("now");
    expect(standing(d, 1119)).toBe("now");
    expect(standing(d, 1120 + 30)).toBe("over");
    expect(standing(d, 1120 + 61)).toBe("missed");
    expect(standing(d, 1120 + DAY + 1)).toBe("over");
    expect(standing({ ...d, done: true }, 1000)).toBe("over");
    expect(tidy([d, mk("Old", 10)], 1120 + 2 * DAY).map((x) => x.name)).toEqual([]);
    expect(tidy([d], 1500)).toHaveLength(1);
  });

  test("'in n days at a time' counts from the day it is said on", () => {
    expect(dueOf(2 * DAY + 600, 3, 18 * 60)).toBe(5 * DAY + 18 * 60);
    expect(dueOf(540, 0, 600)).toBe(600);
  });

  test("a run's state is mended: nothing missing stops it loading", () => {
    const r = newRun(1, "w", "h", "Jay");
    r.minutes = 500;
    const old = { start: "soon", seen: 9000, needs: [{ name: "x" }, null, { name: "Food", value: 4, low: "H", feeds: "f", pace: "slow" }] } as unknown as Upkeep;
    const m = mend(old, r);
    expect(m.start).toBe(540);
    expect(m.seen).toBe(500);
    expect(m.dated).toEqual([]);
    expect(m.needs).toHaveLength(1);
    expect(mend({} as Upkeep, r).needs).toEqual([]);
    expect(freshUpkeep(77).seen).toBe(77);
  });
});

/* ------------------------------------------------- the hooks ------------------------------------------------- */

const JUDGE = {
  kind: "action", act: "eat the stew", target: null, item: null, item_named: false, needs_item: null, ability: null, ability_named: false,
  verdict: "trivial", reason: "Plain.", attribute: "strength", skill: "Eating", for: [], against: [], scores: { physical: 0, likelihood: 0, item: null, ability: null, other: null },
};

interface Fake {
  seed?: unknown;
  read?: unknown;
  minutes?: number;
  fail?: boolean;
}

function deps(f: Fake = {}): RunDeps & { prompts: { role: Role; text: string }[]; told: Message[][] } {
  const prompts: { role: Role; text: string }[] = [], told: Message[][] = [];
  return {
    prompts,
    told,
    systems: [upkeep],
    ask: async (messages: Message[], role: Role) => {
      const sys = messages[0]!.content;
      if (sys.includes("clock, the needs and the calendar")) {
        prompts.push({ role, text: messages[1]!.content });
        if (f.fail) throw new Error("no answer");
        return JSON.stringify(f.seed ?? { hour: "18:30", needs: [{ name: "Food", low: "Hungry", feeds: "a meal", pace: "steady", starts: "fair" }], dated: [{ name: "The lantern festival", in_days: 3, at: "19:00", lasts_hours: 4, place: "the square" }] });
      }
      if (role === "builder") return JSON.stringify({ place: { name: "Camp", text: "Cold." }, calling: "Scout", attributes: ["strength", "cunning", "dexterity"], skills: ["Eating", "Running", "Lying", "Hiding"].map((name) => ({ name, level: 2 })), abilities: [], items: [], money: 5, coin: "bronze", people: [], opening: "Dusk falls on the camp." });
      if (role === "teller") return (told.push(messages), "You eat the stew by the fire.");
      if (sys.includes("referee")) return JSON.stringify(JUDGE);
      if (sys.includes("records")) return JSON.stringify({ minutes: f.minutes ?? 30 });
      if (sys.includes("calendar of a text adventure")) {
        prompts.push({ role, text: messages[1]!.content });
        if (f.fail) throw new Error("no answer");
        return JSON.stringify(f.read ?? { needs: [], dated: [], settled: [], called_off: [] });
      }
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
  };
}

const card = { world: "A cold mountain.", who: "A scout.", name: "Jay" };

const started = async (f: Fake = {}): Promise<{ r: Run; d: ReturnType<typeof deps> }> => {
  const d = deps(f);
  return { r: await begin(d, card, 7), d };
};

const told = (r: Run, minutes: number, story = "You eat."): Told => ({ line: "I eat the stew.", kind: "action", act: "eat", verdict: "trivial", target: null, item: null, ability: null, attribute: "strength", skill: "", roll: null, outcome: null, before: r, story, core: null, minutes });

describe("when a run begins", () => {
  test("the hour, the needs and a dated thing are read from the opening in one call", async () => {
    const { r, d } = await started();
    expect(d.prompts).toHaveLength(1);
    expect(d.prompts[0]!.role).toBe("builder");
    const st = r.sys!.upkeep as Upkeep;
    expect(st.start).toBe(18 * 60 + 30);
    expect(st.needs).toEqual([{ name: "Food", low: "Hungry", feeds: "a meal", pace: "steady", value: 60 }]);
    expect(st.dated).toHaveLength(1);
    expect(st.dated[0]!.due).toBe(dueOf(st.start, 3, 19 * 60));
    expect(clockOf(st.dated[0]!.due).day).toBe(4);
  });

  test("a story about people needs nothing: an empty list stands, and no hour gives the default", async () => {
    const { r } = await started({ seed: { hour: null, needs: [], dated: [] } });
    const st = r.sys!.upkeep as Upkeep;
    expect(st.needs).toEqual([]);
    expect(st.start).toBe(9 * 60);
  });

  test("no usable answer leaves a plain run with a morning start, and the run still opens", async () => {
    const { r, d } = await started({ fail: true });
    expect(d.prompts).toHaveLength(2);
    const st = r.sys!.upkeep as Upkeep;
    expect(st.needs).toEqual([]);
    expect(st.start).toBe(540);
    expect(r.place.name).toBe("Camp");
  });

  test("an answer that does not check is no answer: needs the sheet keeps are not needs, at most three, no repeats", async () => {
    const mkn = (name: string, low = "Weak") => ({ name, low, feeds: "something", pace: "slow", starts: "well" });
    const { r } = await started({ seed: { hour: "7:15", needs: [mkn("Health"), mkn("Gold"), mkn("Food", "Hungry"), mkn("food"), mkn("Rest", "Tired"), mkn("Warmth", "Cold"), mkn("Blood", "Drained")], dated: [{ name: "In the past", in_days: 0, at: "06:00" }, { name: "A thing", in_days: 2, at: "noon" }, { name: "Dawn duel", in_days: 1, at: "05:30" }] } });
    const st = r.sys!.upkeep as Upkeep;
    expect(st.needs.map((n) => n.name)).toEqual(["Food", "Rest", "Warmth"]);
    expect(st.start).toBe(7 * 60 + 15);
    expect(st.dated.map((x) => x.name)).toEqual(["Dawn duel"]);
    const bad = await started({ seed: { hour: "18:00", dated: [] } });
    expect((bad.r.sys!.upkeep as Upkeep).needs).toEqual([]);
    expect(bad.d.prompts).toHaveLength(2);
  });
});

describe("what every model is told", () => {
  test("the scene gives the day, the time of day, what the light means, what is coming up and which needs are low", async () => {
    const { r, d } = await started();
    const s = sceneOf(d, r);
    expect(s).toContain("TIME: Day 1, dusk, about half past six in the evening.");
    expect(s).toContain("The light is going");
    expect(s).toContain("COMING UP: The lantern festival (at the square), in 3 days, about seven in the evening.");
    expect(s).not.toContain("NEEDS:");
    const st = r.sys!.upkeep as Upkeep;
    st.needs[0]!.value = 20;
    expect(sceneOf(d, r)).toContain("NEEDS: Jay is hungry, though not yet in trouble; they will want a meal.");
    st.needs[0]!.value = 2;
    expect(sceneOf(d, r)).toContain("Jay is hungry, badly");
    r.minutes = 6 * 60;
    expect(sceneOf(d, r)).toContain("TIME: Day 2, night, about half past twelve at night.");
    expect(sceneOf(d, r)).toContain("It is dark, ordinary shops, offices and gates are shut");
  });

  test("an old run with no state of its own gets a calendar and no needs, and loads", () => {
    const r = newRun(3, "w", "h", "Jay");
    r.minutes = 3000;
    const d = deps();
    expect(sceneOf(d, r)).toContain("TIME: Day 3,");
    expect(pagesOf(d, r)[0]!.his[0]).toContain("Day 3");
    expect(showsOf(d, r)).toEqual([]);
    expect((r.sys!.upkeep as Upkeep).seen).toBe(3000);
  });

  test("a critical need is a small penalty to rolls", async () => {
    const { r } = await started();
    expect(upkeep.modifiers!(r, {} as never, null)).toEqual([]);
    (r.sys!.upkeep as Upkeep).needs[0]!.value = 3;
    expect(upkeep.modifiers!(r, {} as never, null)).toEqual([{ what: "hungry", by: -5, why: "Food is nearly gone" }]);
  });

  test("a thing about to begin, one going on and one missed are offered to the storyteller, three at most", async () => {
    const { r } = await started({ seed: { hour: "10:00", needs: [], dated: [] } });
    const st = r.sys!.upkeep as Upkeep;
    st.dated = [
      { name: "Council", due: 600 + 120, lasts: 60, place: "the hall", done: false },
      { name: "Market", due: 600 - 10, lasts: 120, place: "", done: false },
      { name: "Far feast", due: 600 + 5 * DAY, lasts: 60, place: "", done: false },
    ];
    const hints = upkeep.hint!(r, {} as never, null);
    expect(hints).toEqual(["Market is going on right now.", "Council (at the hall) begins in about 2 hours."]);
    r.minutes = 600 + 3 * 60 - 540 + 240;
    const later = upkeep.hint!(r, {} as never, null);
    expect(later.join(" ")).toContain("Market has come and gone without Jay there");
    expect(later.join(" ")).toContain("Council (at the hall) has come and gone");
  });
});

describe("after a passage", () => {
  test("time runs the needs down, the reader's step fills them, and the player is told", async () => {
    const { r, d } = await started({ read: { needs: [{ name: "Food", step: 2, neglected: false }], dated: [], settled: [] } });
    r.minutes = 60;
    const t = told(r, 60);
    const seen = await upkeep.read!(d, structuredClone(r), t, null);
    expect(seen).not.toBeNull();
    const lines = upkeep.apply!(r, seen, t, null);
    const st = r.sys!.upkeep as Upkeep;
    // 60 fair, an hour of steady drain (2), then a decent meal (35).
    expect(st.needs[0]!.value).toBe(93);
    expect(lines).toContain("Food +35 (93 of 100).");
    expect(st.seen).toBe(60);
  });

  test("a passage of no minutes changes nothing in the clock or the needs", async () => {
    const { r, d } = await started({ read: { needs: [{ name: "Food", step: 3, neglected: false }], dated: [], settled: [] } });
    const before = structuredClone(r);
    const t = told(r, 0);
    const seen = await upkeep.read!(d, structuredClone(r), t, null);
    expect(upkeep.apply!(r, seen, t, null)).toEqual([]);
    expect(r).toEqual(before);
  });

  test("a skip the player wrote is followed: the clock jumps, a week drains only half a day, nobody is brought down", async () => {
    const { r, d } = await started({ seed: { hour: "9:00", needs: [{ name: "Water", low: "Thirsty", feeds: "a drink", pace: "quick", starts: "poor" }], dated: [] }, read: { needs: [{ name: "Water", step: 0, neglected: true }], dated: [], settled: [] } });
    r.minutes = 7 * DAY;
    const t = told(r, 7 * DAY, "A week passes in the desert with no water.");
    const seen = await upkeep.read!(d, structuredClone(r), t, null);
    const lines = upkeep.apply!(r, seen, t, null);
    const st = r.sys!.upkeep as Upkeep;
    expect(clockOf(9 * 60 + r.minutes).day).toBe(8);
    expect(st.needs[0]!.value).toBe(SKIP_FLOOR);
    expect(bandOf(st.needs[0]!)).toBe("low");
    expect(r.sheet.hp).toBe(MAX_HP);
    expect(lines.some((l) => /health/.test(l))).toBe(false);
    expect(lines).toContain("Morning, day 8.");
  });

  test("a long skip with nothing said about it is taken to have eaten and slept", async () => {
    const { r, d } = await started({ seed: { hour: "22:00", needs: [{ name: "Rest", low: "Tired", feeds: "sleep", pace: "steady", starts: "poor" }], dated: [] }, read: { needs: [], dated: [], settled: [] } });
    r.minutes = 600;
    const t = told(r, 600, "You sleep until morning.");
    upkeep.apply!(r, await upkeep.read!(d, structuredClone(r), t, null), t, null);
    expect((r.sys!.upkeep as Upkeep).needs[0]!.value).toBe(SKIP_KEPT);
    // And when the reader cannot be read at all, the same.
    const again = await started({ seed: { hour: "22:00", needs: [{ name: "Rest", low: "Tired", feeds: "sleep", pace: "steady", starts: "poor" }], dated: [] }, fail: false });
    again.r.minutes = 600;
    upkeep.apply!(again.r, null, told(again.r, 600), null);
    expect((again.r.sys!.upkeep as Upkeep).needs[0]!.value).toBe(SKIP_KEPT);
  });

  test("a critical need costs health through the sheet, is told in plain words, and never below the floor", async () => {
    const { r } = await started({ seed: { hour: "9:00", needs: [{ name: "Food", low: "Hungry", feeds: "a meal", pace: "steady", starts: "poor" }], dated: [] } });
    const st = r.sys!.upkeep as Upkeep;
    st.needs[0]!.value = 11;
    r.minutes = 30;
    const lines = upkeep.apply!(r, null, told(r, 30), null);
    expect(st.needs[0]!.value).toBe(10);
    expect(lines).toEqual([]);
    r.minutes = 90;
    const next = upkeep.apply!(r, null, told(r, 60), null);
    expect(next).toContain("Hungry, badly.");
    expect(next).toContain("Hungry: health -1.");
    expect(r.sheet.hp).toBe(MAX_HP - 1);
    r.sheet.hp = HEALTH_FLOOR;
    r.minutes = 150;
    expect(upkeep.apply!(r, null, told(r, 60), null).some((l) => l.startsWith("Hungry: health"))).toBe(false);
    expect(r.sheet.hp).toBe(HEALTH_FLOOR);
  });

  test("a made-up need name from the reader is dropped, and a repeated one counts once", async () => {
    const { r, d } = await started({ read: { needs: [{ name: "Luck", step: 3, neglected: false }, { name: "food", step: 1, neglected: false }, { name: "Food", step: 3, neglected: false }, { name: "Food", step: "lots" }], dated: [], settled: [] } });
    r.minutes = 0;
    const seen = await upkeep.read!(d, structuredClone(r), told(r, 5), null);
    expect(seen!.needs).toEqual([{ name: "Food", step: 1, neglected: false }]);
  });

  test("the reader is not asked at all with no needs and nothing dated in the air", async () => {
    const { r, d } = await started({ seed: { hour: "9:00", needs: [], dated: [] } });
    const before = d.prompts.length;
    expect(await upkeep.read!(d, structuredClone(r), told(r, 5, "You walk to the well and look about."), null)).toBeNull();
    expect(d.prompts).toHaveLength(before);
    // A passage that looks ahead to a time is asked about, with no needs part in the question.
    const t = told(r, 5, "The reeve says the council meets in three days.");
    await upkeep.read!(d, structuredClone(r), t, null);
    expect(d.prompts).toHaveLength(before + 1);
    expect(d.prompts.at(-1)!.role).toBe("reader");
    expect(d.prompts.at(-1)!.text).not.toContain("THE CHARACTER'S NEEDS");
    expect(d.prompts.at(-1)!.text).toContain("KEPT ON THE CALENDAR");
  });

  test("with needs the reader is asked every turn, needs and dated things in the one call", async () => {
    const { r, d } = await started();
    const before = d.prompts.length;
    await upkeep.read!(d, structuredClone(r), told(r, 5, "You sit."), null);
    expect(d.prompts).toHaveLength(before + 1);
    const text = d.prompts.at(-1)!.text;
    expect(text).toContain("THE CHARACTER'S NEEDS");
    expect(text).not.toContain('"dated"');
    await upkeep.read!(d, structuredClone(r), told(r, 5, "The market opens tomorrow."), null);
    expect(d.prompts.at(-1)!.text).toContain('"dated"');
    expect(d.prompts.at(-1)!.text).toContain("The lantern festival");
  });

  test("a dated thing the story sets up is kept, once; a thing in the past or too far is not; one moved is moved", async () => {
    const { r, d } = await started({ seed: { hour: "9:00", needs: [], dated: [] }, read: { needs: [], dated: [{ name: "Ship sails", in_days: 2, at: "06:00", lasts_hours: 1, place: "the quay" }, { name: "Already gone", in_days: 0, at: "03:00" }, { name: "Far off", in_days: 400, at: "06:00" }], settled: [] } });
    r.minutes = 10;
    const t = told(r, 10, "The harbourmaster says the ship sails in two days at dawn.");
    const seen = await upkeep.read!(d, structuredClone(r), t, null);
    const lines = upkeep.apply!(r, seen, t, null);
    const st = r.sys!.upkeep as Upkeep;
    expect(st.dated.map((x) => x.name)).toEqual(["Ship sails"]);
    expect(st.dated[0]!.due).toBe(dueOf(0, 2, 6 * 60));
    expect(lines).toContain("On the calendar: Ship sails, in 2 days, about six in the morning.");
    r.minutes = 20;
    expect(upkeep.apply!(r, seen, told(r, 10), null).some((l) => l.startsWith("On the calendar"))).toBe(false);
    expect(st.dated).toHaveLength(1);
  });

  test("a thing the character takes part in is settled only when it is at hand; one called off goes at any time", async () => {
    const { r } = await started({ seed: { hour: "10:00", needs: [], dated: [] } });
    const st = r.sys!.upkeep as Upkeep;
    st.dated = [
      { name: "Council", due: 600 + 60, lasts: 60, place: "", done: false },
      { name: "Far feast", due: 600 + 5 * DAY, lasts: 60, place: "", done: false },
      { name: "Far duel", due: 600 + 6 * DAY, lasts: 60, place: "", done: false },
    ];
    r.minutes = 5;
    upkeep.apply!(r, { needs: [], dated: [], settled: ["council", "Far feast"], calledOff: ["Far duel"] }, told(r, 5), null);
    expect(st.dated.find((x) => x.name === "Council")!.done).toBe(true);
    expect(st.dated.find((x) => x.name === "Far feast")!.done).toBe(false);
    expect(st.dated.find((x) => x.name === "Far duel")!.done).toBe(true);
  });

  test("the pages and the table: the time, the coming days and each need; one bar a need, higher is better, and nothing else", async () => {
    const { r, d } = await started();
    const page = pagesOf(d, r)[0]!;
    expect(page.heading).toBe("Time and needs");
    expect(page.his[0]).toBe("Day 1, dusk, about half past six in the evening.");
    expect(page.his.join("\n")).toContain("Coming up: The lantern festival");
    expect(page.his.join("\n")).toContain("Food: fine, 60 of 100. Filled by a meal.");
    (r.sys!.upkeep as Upkeep).needs[0]!.value = 25.4;
    expect(pagesOf(d, r)[0]!.his.join("\n")).toContain("Food: low (hungry), 25 of 100.");
    const shows = showsOf(d, r);
    expect(shows).toHaveLength(1);
    expect(shows[0]).toMatchObject({ kind: "bar", group: "Needs", name: "Food", value: 25, max: 100, good: "up", note: "Hungry" });
  });
});

describe("a whole turn", () => {
  test("a passage runs the clock on, feeds the need, and the storyteller is shown the time and the need", async () => {
    const d = deps({ read: { needs: [{ name: "Food", step: 2, neglected: false }], dated: [], settled: [] }, minutes: 45 });
    const r = await begin(d, card, 7);
    const t = await turn(d, r, "I eat the stew.");
    const st = t.run.sys!.upkeep as Upkeep;
    expect(t.run.minutes).toBe(45);
    expect(st.needs[0]!.value).toBeCloseTo(60 - 1.5 + 35, 5);
    expect(t.report.changes.some((c) => c.startsWith("Food +35"))).toBe(true);
    const last = d.told[0]!.at(-1)!.content;
    expect(last).toContain("TIME: Day 1, dusk");
    expect(last).toContain("COMING UP: The lantern festival");
  });

  test("a failing reader costs the turn nothing and the time still runs", async () => {
    const d = deps({ minutes: 120 });
    const r = await begin(d, card, 7);
    d.ask = new Proxy(d.ask, { apply: async (f, self, args: [Message[], Role]) => (args[0][0]!.content.includes("calendar of a text adventure") ? Promise.reject(new Error("down")) : Reflect.apply(f, self, args)) });
    const t = await turn(d, r, "I eat the stew.");
    expect(t.story).toContain("stew");
    expect((t.run.sys!.upkeep as Upkeep).needs[0]!.value).toBe(56);
  });
});

describe("the clock catching up with the story", () => {
  test("a time of day the passage ends at puts the clock on to it, never back, and never a day on for a small overshoot", async () => {
    const { minutesUntil, phaseOf } = await import("../src/engine/upkeep.js");
    // Half past eight in the morning, and the passage ends in the evening: on to dusk today.
    const morning = 8 * 60 + 30;
    expect(phaseOf(morning + minutesUntil(morning, "dusk"))).toBe("dusk");
    expect(minutesUntil(morning, "dusk")).toBe(9 * 60 + 30);
    // Already there: nothing.
    expect(minutesUntil(morning, "morning")).toBe(0);
    // Dusk, and the passage ends at first light: on to dawn tomorrow.
    const dusk = 18 * 60;
    expect(phaseOf((dusk + minutesUntil(dusk, "dawn")) % 1440)).toBe("dawn");
    // The count of minutes ran three hours past noon: the clock is left alone, not sent a day on.
    expect(minutesUntil(15 * 60, "noon")).toBe(0);
  });
});
