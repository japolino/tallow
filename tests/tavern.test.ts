/**
 * The tavern at midnight (src/content/tavern.ts), through the world layer (engine/world.ts) and the whole director:
 * the moonshot's systems working together in one story.
 */
import { describe, expect, test } from "bun:test";
import { COURIER } from "../src/content/adventures.js";
import { TAVERN, TAVERN_CLUES } from "../src/content/tavern.js";
import { arrive, startTrip, type Trip } from "../src/engine/adventure.js";
import { checkClues, keyKnown } from "../src/engine/clues.js";
import { nameCheck } from "../src/engine/moment.js";
import { worldArrive, worldBegin, worldClock, worldFellows, worldLine, worldPast } from "../src/engine/world.js";
import { direct, type Table } from "../src/game/director.js";
import { standIns } from "../src/game/minds.js";
import { inKit } from "../src/game/session.js";

const begin = (seed = "t"): Trip => worldBegin(startTrip(TAVERN, inKit(COURIER, TAVERN.kit!), seed));
const atTaproom = (seed = "t"): Trip => {
  const t = arrive(begin(seed), "taproom")!.trip;
  return worldArrive(t, TAVERN.stops[0]!).trip;
};

describe("the story is sound", () => {
  test("every key has three clues in more than one place, and the lie can be caught", () => {
    expect(checkClues(TAVERN_CLUES)).toEqual([]);
  });

  test("the world's kit gives the hero a seventh strength, named as it is named there", () => {
    const t = begin();
    expect(t.sheet.stats.power).toBe(1);
    expect(t.sheet.powerName).toBe("Arcana");
    expect(t.book?.mapped).toEqual(["room"]);
    expect(t.schedule?.known).toEqual(["close"]);
    expect(t.fellows?.length).toBe(2);
  });
});

describe("Hesk, the barkeep", () => {
  test("how she feels counts in talking her round", () => {
    const t = atTaproom();
    expect(t.facing!.moment.warm ?? 0).toBe(0);
    const wary = nameCheck(t.facing!.moment, { way: "talk" })!;
    const w = worldLine(t, "I'll be honest with you, Hesk: we came about your brother.", t.facing!.moment)!;
    expect(w.trip.people!.hesk!.attitude).not.toBe("wary");
    const warmer = nameCheck(w.trip.facing!.moment, { way: "talk" })!;
    expect(warmer.difficulty).toBeLessThan(wary.difficulty);
  });

  test("she tells only what code released, and a clue that points somewhere inks it on the map", () => {
    const t = atTaproom();
    const w = worldLine(t, "Honestly, I just want to know who the masked ones are.", t.facing!.moment)!;
    expect(w.note).toContain("May say only these facts");
    expect(w.trip.book!.slips.map((s) => s.clue)).toContain("hesk-masks");
    expect(w.trip.book!.slips.map((s) => s.clue)).not.toContain("hesk-brother");
    if (w.trip.book!.slips.some((s) => s.clue === "hesk-midnight")) {
      expect(w.trip.book!.mapped).toContain("the alley");
      expect(w.trip.schedule!.known).toContain("meet");
      expect(w.lines.some((l) => l.includes("notch in the candle"))).toBe(true);
    }
  });

  test("threats cost, and her patience runs out", () => {
    let t = atTaproom();
    const lines: string[] = [];
    for (let i = 0; i < 4; i++) {
      const w = worldLine(t, "Tell me or I'll break your arm.", t.facing!.moment)!;
      t = w.trip;
      lines.push(...w.lines);
    }
    expect(t.people!.hesk!.attitude).toBe("hostile");
    expect(lines.some((l) => l.includes("had enough"))).toBe(true);
  });
});

describe("the clock", () => {
  test("waiting until midnight runs the other side's clock, and what happens where you are is said", () => {
    const t = arrive({ ...begin(), at: "taproom", visited: ["taproom"] }, "alley")!.trip;
    const w = worldLine({ ...t, sheet: { ...t.sheet, hour: 22 } }, "We hide and wait until midnight.", t.facing!.moment)!;
    expect(w.hours).toBe(2);
    expect(w.trip.sheet.hour).toBe(24);
    expect(w.lines[0]).toContain("midnight");
    expect(w.lines.some((l) => l.includes("masked ones meet"))).toBe(true);
  });

  test("stop the courier and the masked four act on it", () => {
    let t = begin();
    t = { ...t, schedule: { ...t.schedule!, stopped: ["courier"] } };
    const r = worldClock(t, 23, 27);
    expect(r.trip.schedule!.happened.map((h) => h.id)).toEqual(["meet", "lookout", "close"]);
  });

  test("the box reaching the crypt is a step of the big bad's: a stone in the bowl", () => {
    const r = worldClock(begin(), 23, 26);
    expect(r.trip.dread ?? 0).toBe(1);
  });
});

describe("slips, lies and proof", () => {
  test("Pell's lie, laid beside what the watch saw, is torn in half", () => {
    let t = arrive({ ...begin("pell"), at: "taproom", visited: ["taproom"] }, "market")!.trip;
    t = worldArrive(t, TAVERN.stops[1]!).trip;
    const w = worldLine(t, "So, Pell, any gossip about the box the masked ones carry?", t.facing!.moment)!;
    expect(w.trip.book!.slips.map((s) => s.clue)).toContain("pell-river");
    expect(w.trip.book!.mapped).toContain("the river docks");
    // The watch house log gives the true slip.
    const past = worldPast({ ...w.trip, facing: null }, TAVERN.stops[3]!, true);
    expect(past.trip.book!.slips.map((s) => s.clue)).toContain("watch-chapel");
    // Laid together; with good Wits the lie is torn (the throw is seeded, so try a few hours).
    let torn = false;
    for (let h = 0; h < 12 && !torn; h++) {
      const at = { ...past.trip, facing: t.facing, sheet: { ...past.trip.sheet, hour: 21 + h, stats: { ...past.trip.sheet.stats, wits: 4 } } };
      const lay = worldLine(at, "I compare the river boat story with the warm new iron crypt door", { ...t.facing!.moment, sheet: at.sheet });
      torn = !!lay?.trip.book!.slips.some((s) => s.clue === "pell-river" && s.state === "torn");
    }
    expect(torn).toBe(true);
  });

  test("a key is known by two true slips, never by the lie", () => {
    let t = begin();
    t = worldPast(t, TAVERN.stops[2]!, true).trip;
    expect(keyKnown(t.book!, TAVERN_CLUES, 0)).toBe(false);
    expect(keyKnown(t.book!, TAVERN_CLUES, 1)).toBe(false);
    t = worldPast(t, TAVERN.stops[3]!, true).trip;
    expect(keyKnown(t.book!, TAVERN_CLUES, 1)).toBe(true);
  });
});

describe("wandering off on purpose", () => {
  test("a goal named in a line becomes a project, and a long stretch works on it", () => {
    const t = atTaproom();
    const g = worldLine(t, "I want to open a shop that sells English breakfasts.", t.facing!.moment)!;
    expect(g.trip.projects?.[0]?.segments).toBe(6);
    const w = worldLine(g.trip, "I spend the day on the breakfasts: eggs, bacon, a stall by the market.", t.facing!.moment)!;
    expect(w.hours).toBe(10);
    expect(w.lines.some((l) => l.includes("of 6"))).toBe(true);
  });
});

describe("the other players", () => {
  test("at most one speaks unasked; everyone when you ask the table", () => {
    const t = atTaproom();
    const quiet = worldFellows(t, "I order a drink.", t.facing!.moment);
    expect(quiet.length).toBeLessThanOrEqual(1);
    const asked = worldFellows(t, "What do you two think?", t.facing!.moment);
    expect(asked.length).toBe(2);
    expect(asked[0]!.trip.turn).toBe(1);
  });

  test("a fellow sees what you did not, and says it aloud", () => {
    const t = atTaproom();
    // The courier has Sense 1 and Wits 0: the ring and the old silver are beyond them, not beyond Brannoc and Ysolde.
    const says = worldFellows(t, "What do you two think?", t.facing!.moment);
    expect(says.some((x) => x.said.kind === "notice")).toBe(true);
  });
});

describe("played whole by the director", () => {
  test("the tavern ends for many seeds, and the world speaks while it is played", async () => {
    const all: string[] = [];
    for (let i = 0; i < 12; i++) {
      const log: string[] = [];
      let d!: { trip: Trip; stage: string };
      const table: Table = {
        say: async (l) => void log.push(...l),
        write: async () => {
          if (d.stage === "camp") return { line: "I press on", given: Promise.resolve() };
          const m = d.trip.facing!.moment;
          const way = (["sneak", "talk", "force", "pay"] as const).find((w) => {
            const c = nameCheck(m, { way: w });
            return c && c.effect !== "none";
          });
          const line = { sneak: "I creep past quietly", talk: "I ask them kindly", force: "I shove my way through", pay: "I pay the toll" }[way ?? "sneak"];
          return { line, given: Promise.resolve() };
        },
        page: async () => {},
        aside: async () => {},
        wait: async (_b, w) => w,
        weigh: async () => {},
        dieOrLine: async () => null,
        throwDie: async () => {},
        carry: async () => {},
        clock: () => {},
        deal: async () => {},
        turn: async () => {},
        clear: async () => {},
        fork: async (s) => s[i % s.length]!.id,
        offer: async () => 0,
        give: async () => {},
        take: async () => {},
        rival: async () => {},
        move: async () => {},
        ink: async (p) => void log.push(`ink ${p}`),
      };
      const run = direct(TAVERN, inKit(COURIER, TAVERN.kit!), `tavern-${i}`, table, standIns(0));
      d = run;
      const t = await run.done;
      expect(t.over).not.toBeNull();
      all.push(...log);
    }
    expect(all.some((l) => l.startsWith("I write it on a slip"))).toBe(true);
    expect(all.some((l) => l.startsWith("ink "))).toBe(true);
    expect(all.some((l) => l.includes("This world:") || l.includes("watches you, and waits") || l.includes("is glad to see you"))).toBe(true);
  });
});

describe("lies and keys", () => {
  test("a lie is thrown behind the narrator's hand; seen through, they tell you nothing new", () => {
    let believed = 0, doubted = 0;
    for (let i = 0; i < 20; i++) {
      const t = atTaproom(`lie-${i}`);
      const w = worldLine({ ...t, sheet: { ...t.sheet, hour: 21 + i / 10 } }, "I pretend we are city guards and ask about the masked ones.", t.facing!.moment)!;
      expect(w.lines[0]).toContain("behind my hand");
      if (w.trip.people!.hesk!.doubts) {
        doubted++;
        expect(w.trip.book!.slips.length).toBe(0);
        expect(w.note).toContain("believes nothing");
      } else believed++;
    }
    expect(believed).toBeGreaterThan(0);
    expect(doubted).toBeGreaterThan(0);
  });

  test("at the end of the story, every key you hold is an edge on every try", () => {
    let t = begin();
    t = worldPast(t, TAVERN.stops[2]!, true).trip;
    t = worldPast(t, TAVERN.stops[3]!, true).trip;
    const crypt = TAVERN.stops[4]!;
    const there = arrive({ ...t, at: "watch", visited: ["watch"] }, "crypt")!.trip;
    const without = nameCheck(there.facing!.moment, { way: "force" })!;
    const a = worldArrive(there, crypt);
    expect(a.trip.facing!.moment.edges).toBe(1);
    expect(a.lines.some((l) => l.includes("one of the three keys"))).toBe(true);
    const withKeys = nameCheck(a.trip.facing!.moment, { way: "force" })!;
    expect(["none", "limited", "standard", "great", "overwhelming"].indexOf(withKeys.effect!)).toBeGreaterThan(["none", "limited", "standard", "great", "overwhelming"].indexOf(without.effect!));
  });
});
