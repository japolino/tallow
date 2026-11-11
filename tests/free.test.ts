/**
 * Free form (engine/free.ts, game/free.ts): no story, only the world. Theatre of the mind: a place you are at stands
 * before you with every way open and nothing to get past; a die only for what could go wrong; places kept in the
 * narrator's notebook; threads in the air that move on with the clock, and become a story when pulled.
 */
import { describe, expect, test } from "bun:test";
import { COURIER } from "../src/content/adventures.js";
import { attempt, startTrip, type Trip } from "../src/engine/adventure.js";
import { rulesHero } from "../src/engine/hero.js";
import { checkFreeWorld, FREE_TROPE, faceScene, freeAdventure, freeOf, goneTo, hereOf, LOG_MAX, nameStart, NO_DEADLINE, notebookPage, placeIn, placeNamed, remember, riskyWords, START_NAME, stockThreads, threadPulled, threadsRun, type Thread } from "../src/engine/free.js";
import { nameCheck, WAYS } from "../src/engine/moment.js";
import { worldBegin } from "../src/engine/world.js";
import type { CardInfo } from "../src/game/card.js";
import type { Director, Table } from "../src/game/director.js";
import { freeOpen } from "../src/game/free.js";
import { standIns } from "../src/game/minds.js";
import { parseRisk } from "../src/game/prompts.js";
import { FREE_OFFER, GOODNIGHT, greeting, sit, wantsFree, type Kept } from "../src/game/session.js";

const MAREN: CardInfo = { name: "Maren", description: "Maren Vell is a ferrywoman of thirty who keeps the crossing at Dunmore." };

const begun = (seed = "f1", threads?: Thread[]): Trip => {
  const adv = freeAdventure({ seed, who: "a courier", world: "Dunmore", start: { name: "the ferry landing", said: "A wet landing with a lamp." }, startHour: 19, ...(threads ? { threads } : {}) });
  return faceScene(worldBegin(startTrip(adv, COURIER, seed)));
};

describe("a place in free form", () => {
  test("stands before you with every way open, nothing to get past, and a clock that never runs out", () => {
    const t = begun();
    expect(t.adv.trope).toBe(FREE_TROPE);
    expect(t.adv.stops).toEqual([]);
    expect(t.adv.deadline.hour).toBe(NO_DEADLINE);
    const m = t.facing!.moment;
    for (const w of WAYS) expect(m.stop.ways[w]).toBeTruthy();
    expect(m.stop.situation).toContain("A wet landing with a lamp.");
  });

  test("a try leaves the place as it was: a fresh moment, nothing shut, and the story never over", () => {
    let t = begun("f2");
    for (let i = 0; i < 6; i++) {
      const m = t.facing!.moment;
      const turn = attempt(t, { way: "force", stat: "brawn" })!;
      expect(turn).toBeTruthy();
      expect(nameCheck(m, { way: "force" })).toBeTruthy();
      t = faceScene(turn.trip);
      expect(t.over).toBeNull();
      expect(t.facing!.moment.closed).toEqual([]);
      expect(t.facing!.moment.trouble).toBe(0);
    }
  });
});

describe("going places", () => {
  test("a line that goes somewhere names the place, and nothing else does", () => {
    expect(placeNamed("I head to the docks")).toBe("the docks");
    expect(placeNamed("We go back to the Crooked Inn to see Mara.")).toBe("the Crooked Inn");
    expect(placeNamed("I walk over to the market, and buy bread")).toBe("the market");
    expect(placeNamed("I go to sleep")).toBeNull();
    expect(placeNamed("I look around the room")).toBeNull();
    expect(placeNamed("I tell her to go to hell")).toBeNull();
  });

  test("a new place is added to the notebook, a known one is gone back to, and the going takes half an hour", () => {
    const t0 = begun("f3");
    const a = goneTo(t0, "the docks", "Tarred planks and gulls.");
    expect(a.known).toBe(false);
    expect(a.trip.sheet.hour).toBe(t0.sheet.hour + 0.5);
    expect(hereOf(freeOf(a.trip)!).name).toBe("the docks");
    const b = goneTo(a.trip, "ferry landing");
    expect(b.known).toBe(true);
    expect(freeOf(b.trip)!.places.length).toBe(2);
    expect(b.trip.facing!.moment.stop.situation).toContain("A wet landing with a lamp.");
    const page = notebookPage(b.trip);
    expect(page.his.join(" ")).toContain("Places you know: the docks.");
  });

  test("the narrator keeps the last few things that happened in mind, and no more", () => {
    let t = begun("f4");
    for (let i = 0; i < LOG_MAX + 3; i++) t = remember(t, `I do thing ${i}.`, `Thing ${i} happens.`);
    expect(freeOf(t)!.log.length).toBe(LOG_MAX);
    expect(t.facing!.moment.stop.situation).toContain(`Thing ${LOG_MAX + 2} happens.`);
    expect(t.facing!.moment.stop.situation).not.toContain("Thing 0 happens.");
  });
});

describe("the threads", () => {
  test("two threads of different kinds, one quick and one slow", () => {
    const th = stockThreads("w", 19);
    expect(th.length).toBe(2);
    expect(th[0]!.family).not.toBe(th[1]!.family);
    expect(th[0]!.every).toBeLessThan(th[1]!.every);
    expect(th.some((x) => x.family === "romance")).toBe(false);
  });

  test("left alone, a thread takes a step every few hours, and at its last it is gone", () => {
    const thread: Thread = { id: "thread-1", family: "rescue", said: "Someone is missing.", words: "missing", steps: ["One.", "Two.", "Three."], step: 0, every: 6, since: 19 };
    let t = begun("f5", [thread]);
    t = { ...t, sheet: { ...t.sheet, hour: 25 } };
    let r = threadsRun(t);
    expect(r.lines).toEqual(["Word reaches you: One."]);
    t = { ...r.trip, sheet: { ...r.trip.sheet, hour: 40 } };
    r = threadsRun(t);
    expect(r.lines.length).toBe(2);
    expect(r.lines[1]).toContain("That is over now");
    expect(freeOf(r.trip)!.threads[0]!.done).toBe("gone");
    expect(threadsRun(r.trip).lines).toEqual([]);
  });

  test("a thread is pulled by its number or by its words with a will to act, not by talk about it", () => {
    const threads: Thread[] = [
      { id: "thread-1", family: "rescue", said: "Someone is missing.", words: "missing|gone|taken", steps: ["a", "b", "c"], step: 0, every: 6, since: 19 },
      { id: "thread-2", family: "hunt", said: "A beast kills at the edge.", words: "beast|killing", steps: ["a", "b", "c"], step: 0, every: 10, since: 19 },
    ];
    const t = begun("f6", threads);
    expect(threadPulled(t, "I'll look into the thread 2")?.id).toBe("thread-2");
    expect(threadPulled(t, "the first thread")?.id).toBe("thread-1");
    expect(threadPulled(t, "I want to look into whoever has gone missing")?.id).toBe("thread-1");
    expect(threadPulled(t, "Who is missing?")).toBeNull();
    expect(threadPulled(t, "I order a drink")).toBeNull();
  });
});

describe("the die, only for what could go wrong", () => {
  test("risky words call for it; ordinary ones do not", () => {
    expect(riskyWords("I sneak into the warehouse")).toBe(true);
    expect(riskyWords("I try to bribe the guard")).toBe(true);
    expect(riskyWords("I order a drink and sit by the fire")).toBe(false);
    expect(riskyWords("I ask Maren how her day was")).toBe(false);
  });

  test("asking someone for what they could refuse is opposed, even in quiet words", () => {
    expect(riskyWords("I ask the bouncer to let me in")).toBe(true);
    expect(riskyWords("I get the clerk to show me the ledger")).toBe(true);
    expect(riskyWords("I talk my way past the doorman")).toBe(true);
    expect(riskyWords("I slip in without being seen")).toBe(true);
    expect(riskyWords("I ask the barkeep what is good tonight")).toBe(false);
    expect(riskyWords("I tell Maren about the ferry")).toBe(false);
  });

  test("the reader's answer on the die is checked", () => {
    expect(parseRisk('{"roll": true}')).toBe(true);
    expect(parseRisk('Sure: {"roll": false}')).toBe(false);
    expect(parseRisk('{"roll": "maybe"}')).toBeNull();
    expect(parseRisk("no idea")).toBeNull();
  });
});

const WRITTEN = {
  place: { name: "The Drowned Lantern", said: "A low tavern on stilts over the black water, full of bargemen and smoke." },
  threads: [
    { kind: "mystery", said: "The bells of the sunken chapel have been ringing at low tide.", words: ["bells", "sunken chapel", "low tide"], steps: ["A bargeman who went to listen has drowned.", "The bells ring at high tide too.", "The chapel has risen from the water, and the ringing has stopped."] },
    { kind: "romance", said: "Someone has a sweetheart.", words: ["sweetheart"], steps: ["a", "b", "c"] },
    { kind: "heist", said: "The toll-master keeps the year's tolls in his boathouse.", words: ["tolls", "toll-master", "boathouse (old)"], steps: ["He has hired two more guards.", "The tolls go upriver in three days.", "The tolls are gone upriver."] },
  ],
};

describe("a night written for the card's world", () => {
  test("a model's place and threads are kept when they check, and the clocks are code's", () => {
    const d = checkFreeWorld(WRITTEN, "w1", 19);
    expect(d.place).toEqual({ name: "the Drowned Lantern", said: WRITTEN.place.said });
    expect(d.threads.map((x) => x.family)).toEqual(["mystery", "heist"]);
    expect(d.threads.map((x) => x.every)).toEqual([6, 10]);
    expect(d.threads[0]!.steps.length).toBe(3);
    // A word with marks in it is taken as plain letters, never as a pattern.
    expect(() => new RegExp(d.threads[1]!.words)).not.toThrow();
  });

  test("what does not check is made up from the stock, of another kind", () => {
    const d = checkFreeWorld({ place: { name: "x" }, threads: [WRITTEN.threads[0], { kind: "mystery", said: "Another mystery entirely, of no use.", words: ["other"], steps: ["a step", "b step", "c step"] }] }, "w2", 19);
    expect(d.place).toBeUndefined();
    expect(d.threads[0]!.said).toBe(WRITTEN.threads[0]!.said);
    expect(d.threads[1]!.family).not.toBe("mystery");
    const none = checkFreeWorld(null, "w3", 19);
    expect(none.threads.map((x) => x.said)).toEqual(stockThreads("w3", 19).map((x) => x.said));
  });

  test("a written thread is pulled by its own words", () => {
    const d = checkFreeWorld(WRITTEN, "w4", 19);
    const t = begun("w4", d.threads);
    expect(threadPulled(t, "I want to look into those sunken chapel bells")?.family).toBe("mystery");
    expect(threadPulled(t, "what's with the bells?")).toBeNull();
  });

  test("a place the narrator named becomes the start place's name, once", () => {
    expect(placeIn("Rain drums on the roof of the Gilded Eel as you shake off your coat.")).toBe("the Gilded Eel");
    expect(placeIn("You stand in the rain, alone.")).toBeNull();
    const adv = freeAdventure({ seed: "n1", who: "a courier", world: "Dunmore", start: { name: START_NAME, said: "Somewhere." }, startHour: 19 });
    let t = faceScene(worldBegin(startTrip(adv, COURIER, "n1")));
    t = nameStart(t, "the Gilded Eel");
    expect(hereOf(freeOf(t)!).name).toBe("the Gilded Eel");
    expect(t.facing!.stop.name).toBe("the Gilded Eel");
    expect(nameStart(t, "the Salt Gate")).toBe(t);
  });
});

describe("the world's rows in free form", () => {
  test("a goal, a wait and work are the world's; asking someone along is not a player sent to a place on the map", async () => {
    const { worldLineFree } = await import("../src/engine/world.js");
    const adv = freeAdventure({ seed: "r1", who: "a courier", world: "Dunmore", start: { name: "the landing", said: "A landing." }, startHour: 19, companion: { id: "friend", name: "Vypra", card: "companion", who: "Vypra, a fox", stat: "charm", likes: "talk", dislikes: "force" } });
    const t = faceScene(worldBegin(startTrip(adv, COURIER, "r1")));
    const m = t.facing!.moment;
    expect(worldLineFree(t, "I ask Vypra if she wants to go down and get noodles with me.", m)).toBeNull();
    expect(worldLineFree(t, "What do you think we should do, Vypra?", m)).toBeNull();
    expect(worldLineFree(t, "I wait an hour.", m)?.hours).toBe(1);
    expect(worldLineFree(t, "I want to open a shop that sells noodles", m)?.trip.projects?.length).toBe(1);
  });
});

describe("choosing free form at the table", () => {
  test("it is offered with the stories, and asked for in plain words", () => {
    expect(greeting(MAREN, ["rescue"]).join(" ")).toContain(FREE_OFFER);
    expect(wantsFree("No story tonight, just the world")).toBe(true);
    expect(wantsFree("no story, I just want to roam")).toBe(true);
    expect(wantsFree("free form please")).toBe(true);
    expect(wantsFree("Let's just play and see where it goes")).toBe(true);
    expect(wantsFree("a heist")).toBe(false);
  });
});

/** A table that plays free form from a queue of lines, and a story (when one is under way) by a try that can be made. */
function tableFor(lines: string[], log: string[], d: { now: Director | null }): Table {
  return {
    say: async (l) => void log.push(...l),
    write: async () => {
      let line: string;
      const st = d.now?.stage;
      if (d.now && st !== "over") {
        if (st === "camp") line = "I press on";
        else {
          const m = d.now.trip.facing?.moment;
          const way = m && (["sneak", "talk", "force", "pay"] as const).find((w) => nameCheck(m, { way: w }));
          line = { sneak: "I creep past quietly", talk: "I ask them kindly", force: "I shove my way through", pay: "I pay what they ask" }[way ?? "sneak"];
        }
      } else line = lines.shift() ?? "done for tonight";
      log.push(`> ${line}`);
      return { line, given: Promise.resolve() };
    },
    page: async (p) => void log.push(`[page] ${p.heading ?? ""}: ${p.his.join(" ")}`),
    aside: async () => {},
    wait: async (_b, w) => w,
    weigh: async () => {},
    dieOrLine: async () => null,
    throwDie: async (n) => void log.push(`[die] ${n}`),
    carry: async () => {},
    clock: () => {},
    deal: async () => void log.push("[deal]"),
    turn: async () => {},
    clear: async () => {},
    fork: async (s) => s[0]!.id,
    offer: async () => 0,
    give: async () => {},
    take: async () => {},
    rival: async () => {},
    sweep: async () => {},
    move: async () => {},
  };
}

const minds = { ...standIns(0), hero: async (line: string) => rulesHero(line) };

describe("a sitting in free form", () => {
  test("no map is dealt; going, a risky try, the notebook, and done for tonight", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    const lines = ["no story, I just want to roam", "I am a quick-fingered courier named Tam", "I head to the docks", "I order a drink at the stall", "I sneak into the warehouse", "notebook", "done for tonight"];
    let kept: Kept | null = null;
    let saved: Trip | null = null;
    let left = false;
    await sit({ card: MAREN, seed: "free-night", table: tableFor(lines, log, d), minds, ask: null, started: (x) => (d.now = x), keep: (k) => (kept = k), save: (t) => (saved = t), leave: () => (left = true) });
    expect(log).toContain(freeOpen("Maren's world"));
    expect(log).not.toContain("[deal]");
    expect(log.some((l) => l.startsWith("There are two things in the air."))).toBe(true);
    expect(log.some((l) => l.startsWith("[die]"))).toBe(true);
    expect(log.filter((l) => l.startsWith("[die]")).length).toBe(1);
    expect(log.some((l) => l.startsWith("[page] The narrator's notebook") && l.includes("You are at the docks"))).toBe(true);
    expect(log).toContain(GOODNIGHT[0]!);
    expect(left).toBe(true);
    expect(kept!.hero).toBeTruthy();
    expect(saved!.adv.free).toBeTruthy();
    expect(saved!.adv.party).toEqual(["friend"]);
  });

  test("a thread pulled on is played as a story, and then you are back where you were", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    const lines = ["free form", "I am a sellsword called Bree", "I'll look into thread 1", "yes, let's", "done for tonight"];
    let saved: Trip | null = null;
    await sit({ card: MAREN, seed: "free-thread", table: tableFor(lines, log, d), minds, ask: null, started: (x) => (d.now = x), save: (t) => t && (saved = t) });
    expect(log.some((l) => l.startsWith("That is a story of its own"))).toBe(true);
    expect(log).toContain("[deal]");
    expect(log.some((l) => l.startsWith("And you are back at"))).toBe(true);
    expect(saved!.adv.free!.threads[0]!.done).toBe("played");
  });

  test("with a model, the night begins at a place written for the world, and a quiet ask of someone is thrown for", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    const lines = ["just let me roam", "I am a smuggler called Ash", "I ask the bouncer to let me in", "notebook", "done for tonight"];
    const asked: string[] = [];
    const ask = async (_m: unknown, role: string): Promise<string> => (asked.push(role), role === "builder" ? JSON.stringify(WRITTEN) : "");
    const risky: string[] = [];
    const withRisk = { ...minds, risky: async (line: string) => (risky.push(line), /bouncer/.test(line)) };
    await sit({ card: MAREN, seed: "free-model", table: tableFor(lines, log, d), minds: withRisk, ask, started: (x) => (d.now = x) });
    expect(asked).toContain("builder");
    expect(log.some((l) => l.includes("The bells of the sunken chapel"))).toBe(true);
    expect(risky).toContain("I ask the bouncer to let me in");
    expect(log.filter((l) => l.startsWith("[die]")).length).toBe(1);
    expect(log.some((l) => l.startsWith("[page] The narrator's notebook") && l.includes("You are at the Drowned Lantern"))).toBe(true);
  });

  test("a sitting left in free form is taken up again where it was", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    const t = goneTo(begun("f7"), "the old mill").trip;
    const saved = { ...t, adv: { ...t.adv, party: [] } };
    await sit({ card: MAREN, seed: "free-back", table: tableFor(["go on", "done for tonight"], log, d), minds, ask: null, saved, kept: { hero: rulesHero("a courier"), played: [], carry: [] } });
    expect(log.some((l) => l.includes("there was no story"))).toBe(true);
    expect(log.some((l) => l.startsWith("We were in the middle of things, at the old mill."))).toBe(true);
    expect(log).toContain(GOODNIGHT[0]!);
  });
});
