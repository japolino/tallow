/**
 * The clock, the clues, projects and the campaign (docs/MOONSHOT.md, 5 to 7.5; docs/LOOP.md, 4).
 * All names here are made up for the tests.
 */
import { describe, expect, test } from "bun:test";
import { bringBack, campaignBrief, endChapter, finaleEdges, handFor, keyFor, RINGS, sayItsSo, setUp, startCampaign } from "../src/engine/campaign.js";
import { checkClues, getClue, keyKnown, keysKnown, layTogether, lean, newCasebook, slipNamed, type Clue } from "../src/engine/clues.js";
import { goalNamed, payoffOf, projectSaid, sizeGoal, startProject, workOn } from "../src/engine/project.js";
import { goingOn, hourNamed, hourSaid, learn, newSchedule, notches, runClock, stop, timeRead, timeTaken, type Appointment, whatSaid } from "../src/engine/schedule.js";

const night: Appointment[] = [
  { id: "meet", at: 24, where: "alley", what: "the masked four meet behind the tavern", lasts: 0.25 },
  { id: "courier", at: 24.25, where: "alley", what: "the courier brings the box", needs: ["meet"] },
  { id: "chapel", at: 25.5, where: "chapel", what: "the box reaches the chapel", needs: ["courier"], otherwise: "lookout" },
  { id: "lookout", at: 25.5, where: "tavern", what: "one comes back to look for whoever set the trap" },
  { id: "close", at: 26, where: "tavern", what: "the barkeep closes", daily: true },
];

describe("appointments", () => {
  test("they happen whether you are there or not", () => {
    const r = runClock(newSchedule(night), 22, 27);
    expect(r.events.map((e) => e.a.id)).toEqual(["meet", "courier", "chapel", "close"]);
  });

  test("getting in the way changes them: a branch code already knows", () => {
    const s = stop(newSchedule(night), "courier");
    expect(runClock(s, 22, 27).events.map((e) => e.a.id)).toEqual(["meet", "lookout", "close"]);
  });

  test("routines come round every day", () => {
    expect(runClock(newSchedule(night), 0, 60).events.filter((e) => e.a.id === "close").map((e) => e.at)).toEqual([2, 26, 50]);
  });

  test("what you know of gets a notch in the candle", () => {
    const s = learn(newSchedule(night), "meet");
    expect(notches(s, 21)).toEqual([{ id: "meet", at: 24 }]);
    expect(runClock(s, 21, 25).events.find((e) => e.a.id === "meet")?.known).toBe(true);
    expect(learn(s, "nothing")).toBe(s);
  });

  test("what is going on at a place now", () => {
    // Only what really happened is going on: the clock has to have run past it.
    expect(goingOn(runClock(newSchedule(night), 23, 24.1).schedule, "alley", 24.1).map((a) => a.id)).toEqual(["meet"]);
    expect(goingOn(newSchedule(night), "alley", 24.1)).toEqual([]);
    expect(goingOn(newSchedule(night), "alley", 23)).toEqual([]);
  });
});

describe("things to do with time", () => {
  test("waiting until midnight is one of the strongest lines in the game", () => {
    expect(timeRead("We nurse our drinks until near midnight", 21)).toEqual({ act: "wait", until: 24 });
    expect(timeTaken({ act: "wait", until: 24 }, 21)).toBe(3);
    expect(timeRead("I keep an eye on the alley door", 21)?.act).toBe("watch");
    expect(timeRead("We follow the courier", 21)?.act).toBe("follow");
    expect(timeRead("We lay an ambush by the grate", 21)?.act).toBe("prepare");
    expect(timeRead("I spend the day asking round the market", 9)).toEqual({ act: "stretch", hours: 10 });
    expect(timeRead("I punch him", 21)).toBeNull();
  });

  test("hours named and said", () => {
    expect(hourNamed("till 2", 21)).toBe(26);
    expect(hourNamed("until eleven", 21)).toBe(23);
    expect(hourNamed("until dawn", 21)).toBe(30);
    expect(hourSaid(24)).toBe("midnight");
    expect(hourSaid(25.5)).toBe("half past 1 in the morning");
    // A quarter to noon is not "in the morning", nor a quarter to midnight "at night".
    expect(hourSaid(11.75)).toBe("a quarter to noon");
    expect(hourSaid(23.75)).toBe("a quarter to midnight");
    expect(hourSaid(8.75)).toBe("a quarter to 9 in the morning");
  });

  test("what happens is said once: the hour the model wrote into it, and its full stop, are left off", () => {
    expect(whatSaid("mercenaries search the barges at Raven Bridge at 7:15 pm, hunting for mana.")).toBe("mercenaries search the barges at Raven Bridge, hunting for mana");
    expect(whatSaid("the enforcers ransack the Guild Bureau at 11:45 am")).toBe("the enforcers ransack the Guild Bureau");
    expect(whatSaid("the guards change at midnight.")).toBe("the guards change");
    expect(whatSaid("a bell rings at the three gates")).toBe("a bell rings at the three gates");
  });
});

const clues: Clue[] = [
  { id: "tracks", text: "Muddy cart tracks on the north road, made at dusk.", key: 0, points: "north road", from: { place: "gate" } },
  { id: "boy", text: "The miller's boy saw the cart at noon.", key: 0, from: { person: "boy" }, against: ["inn"] },
  { id: "inn", text: "The innkeeper says the cart left at dusk.", key: 0, false: true, truth: "boy", from: { person: "marta" } },
  { id: "drover", text: "A drover passed the cart at the mill.", key: 0, from: { person: "drover" } },
  { id: "k1a", text: "a", key: 1, from: { person: "a" } },
  { id: "k1b", text: "b", key: 1, from: { person: "b" } },
  { id: "k1c", text: "c", key: 1, from: { place: "c" } },
  { id: "k2a", text: "d", key: 2, from: { person: "a" } },
  { id: "k2b", text: "e", key: 2, from: { person: "b" } },
  { id: "k2c", text: "f", key: 2, from: { place: "c" }, tells: "meet" },
];

describe("clues and the map", () => {
  test("a clue that points somewhere new inks it on the map", () => {
    const g = getClue(newCasebook(["tavern"]), clues[0]!, "seen");
    expect(g.inked).toBe("north road");
    expect(g.book.mapped).toEqual(["tavern", "north road"]);
    expect(g.slip.state).toBe("seen");
    expect(getClue(g.book, clues[0]!, "heard").again).toBe(true);
  });

  test("a clue can tell of an appointment", () => {
    expect(getClue(newCasebook(), clues[9]!, "heard").tells).toBe("meet");
  });

  test("two slips that cannot both be true: a throw on Wits tears the lie", () => {
    let book = getClue(newCasebook(), clues[1]!, "heard").book;
    book = getClue(book, clues[2]!, "heard").book;
    expect(layTogether(book, clues, "boy", "inn", false).torn).toBeUndefined();
    const r = layTogether(book, clues, "boy", "inn", true);
    expect(r.torn).toBe("inn");
    expect(r.truth).toBe("boy");
  });

  test("a key is known with one proved clue or two true ones; a lie never makes it known", () => {
    let book = getClue(newCasebook(), clues[2]!, "heard").book;
    expect(keyKnown(book, clues, 0)).toBe(false);
    book = getClue(book, clues[0]!, "heard").book;
    expect(keyKnown(book, clues, 0)).toBe(false);
    book = getClue(book, clues[3]!, "heard").book;
    expect(keyKnown(book, clues, 0)).toBe(true);
    expect(keysKnown(book, clues)).toBe(1);
  });

  test("a slip is leverage, once", () => {
    const book = getClue(newCasebook(), clues[0]!, "seen").book;
    expect(slipNamed("I show him the muddy cart tracks", book, clues)).toBe("tracks");
    const once = lean(book, "tracks");
    expect(once.ok).toBe(true);
    expect(lean(once.book, "tracks").ok).toBe(false);
  });

  test("a story is checked before it is played", () => {
    expect(checkClues(clues)).toEqual([]);
    expect(checkClues(clues.filter((c) => c.id !== "drover"))).toContain("key 0 has only 2 true clue(s)");
    expect(checkClues([...clues, { id: "lie2", text: "x", key: 1, false: true }])).toContain("the lie lie2 cannot be caught");
  });
});

describe("projects", () => {
  test("code sizes a goal by ambition", () => {
    expect(sizeGoal("open a shop that sells English breakfasts")).toBe(6);
    expect(sizeGoal("train an army of ants to ruin this season's crops")).toBe(12);
    expect(sizeGoal("write a song")).toBe(4);
  });

  test("a goal named in a line", () => {
    expect(goalNamed("I want to open a shop that sells English breakfasts.")).toBe("open a shop that sells English breakfasts");
    expect(goalNamed("Let's train an army of ants")).toBe("train an army of ants");
    expect(goalNamed("I open the door")).toBeNull();
    // Wanting something now is not a venture.
    expect(goalNamed("I want to make a check to know if somebody is watching me")).toBeNull();
    expect(goalNamed("I want to find out who is giggling in the trees")).toBeNull();
  });

  test("it pays off as something the other rules use", () => {
    expect(payoffOf("open a shop that sells English breakfasts")).toEqual(["income", "place"]);
    expect(payoffOf("train an army of ants to ruin the crops")).toEqual(["weapon"]);
  });

  test("work fills it; failure brings a complication, never a dead end", () => {
    const p = startProject("shop", "open a shop that sells English breakfasts");
    const a = workOn(p, "success", 0, "s");
    expect(a.project.filled).toBe(2);
    expect(a.project.needs[0]!.done).toBe(true);
    const b = workOn(a.project, "fail", 1, "s");
    expect(b.complication).toBeDefined();
    expect(b.project.filled).toBe(2);
    const c = workOn({ ...b.project, filled: 5 }, "success", 2, "t");
    expect(c.done).toBe(true);
    expect(projectSaid(p)).toContain("0 of 6");
  });
});

describe("the campaign", () => {
  const lich = startCampaign({
    name: "the lich",
    wants: "to rise as the undying king on the longest night",
    steps: ["the graves are opened", "the bishop is bought", "the grave-knights ride", "the river turns", "the city falls silent", "the longest night"],
    hands: ["the masked four", "the bought bishop"],
    keys: ["where its heart is kept", "its true name", "the rite that unbinds it"],
  });

  test("it takes a step after every story you do not set it back, and burns a ring", () => {
    const a = endChapter(lich, { setBack: false, failedNear: false, found: [] });
    expect(a.campaign.burned).toBe(1);
    expect(a.steps).toEqual(["the graves are opened"]);
    const b = endChapter(a.campaign, { setBack: true, failedNear: false, found: [0] });
    expect(b.campaign.burned).toBe(1);
    expect(b.campaign.keys).toEqual([true, false, false]);
    const c = endChapter(b.campaign, { setBack: false, failedNear: true, found: [] });
    expect(c.campaign.burned).toBe(3);
  });

  test("when the candle is out it is the longest night", () => {
    expect(endChapter({ ...lich, burned: RINGS - 1 }, { setBack: false, failedNear: false, found: [] }).over).toBe(true);
  });

  test("each chapter has a hand and a key; the finale counts keys as edges", () => {
    expect(handFor(lich)).toBe("the masked four");
    expect(keyFor(lich)).toBe(0);
    expect(finaleEdges({ ...lich, keys: [true, true, false] })).toBe(2);
  });

  test("the narrator brings things back, and what the players say becomes true", () => {
    const c = setUp(setUp(lich, "a locked drawer in the bishop's study"), "a name dropped: Corvin");
    const b = bringBack(c);
    expect(b.thread).toBe("a locked drawer in the bishop's study");
    expect(b.campaign.threads).toEqual(["a name dropped: Corvin"]);
    expect(campaignBrief(sayItsSo(lich, "Aldous studied the sigil at the abbey"))).toContain("Aldous studied the sigil");
  });
});
