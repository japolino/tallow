/**
 * The line router made plain (an audit of implicit machines, 2026-11-11): what a line comes to is read from one table of
 * rows, a try is only taken from the reader by the rows that may take one, and the small readers around it (giving in,
 * a question that asks to try, a try handed to a player, the hour a line names, asking the table) say only what they
 * mean.
 */
import { describe, expect, test } from "bun:test";
import { COURIER } from "../src/content/adventures.js";
import { FAMILIES, drawRecipe } from "../src/content/tropes.js";
import { arrive, clockTo, startTrip, type Adventure, type Trip } from "../src/engine/adventure.js";
import { yieldRead, yieldSure } from "../src/engine/contest.js";
import { furnish } from "../src/engine/furnish.js";
import { layRoad, waysThrough } from "../src/engine/road.js";
import { hourNamed } from "../src/engine/schedule.js";
import { asksTable, handedTo } from "../src/engine/seats.js";
import { worldArrive, worldBegin, worldFirst, worldFirstLine, worldLine, workedOn } from "../src/engine/world.js";
import { fallbackAdventure } from "../src/game/build.js";
import type { CardInfo } from "../src/game/card.js";
import { plainReading } from "../src/game/minds.js";
import { inKit } from "../src/game/session.js";

const MAREN: CardInfo = { name: "Maren", description: "Maren Vell is a ferrywoman of thirty who keeps the crossing at Dunmore." };
const built = (family: (typeof FAMILIES)[number], seed: string): Adventure => fallbackAdventure(furnish(layRoad(drawRecipe(family, seed, [], [family]), seed, { modern: false })), MAREN, seed);
const begin = (a: Adventure, seed: string): Trip => worldBegin(startTrip(a, a.kit ? inKit(COURIER, a.kit) : COURIER, seed));
/** At the first stop on the road with a person in it. */
const atPerson = (a: Adventure, seed: string): Trip | null => {
  const path = waysThrough(a).find((p) => p.some((id) => a.stops.find((s) => s.id === id)?.person));
  if (!path) return null;
  const id = path.find((x) => a.stops.find((s) => s.id === x)?.person)!;
  let t: Trip = begin(a, seed);
  for (const step of path) {
    if (step === id) break;
    t = { ...t, at: step, visited: [...t.visited, step] };
  }
  const r = arrive(t, id);
  return r ? worldArrive(r.trip, a.stops.find((s) => s.id === id)!).trip : null;
};
const someone = (): Trip => {
  for (const seed of ["v1", "v2", "v3", "v4", "v5"]) {
    const t = atPerson(built("rescue", seed), seed);
    if (t?.facing) return t;
  }
  throw new Error("no seed reached a person");
};
/** The same place in your way, with nobody in it. */
const nobody = (t: Trip): Trip => {
  const f = t.facing!;
  const { person: _gone, ...stop } = f.stop;
  const { person: _too, ...mstop } = f.moment.stop as typeof f.stop;
  return { ...t, facing: { ...f, stop, moment: { ...f.moment, stop: mstop } } } as Trip;
};

describe("words to the person here, and words that are not", () => {
  test("a question about the place, or a look round, is not heard as words said to them", () => {
    const t = someone();
    for (const line of ["Is there a back door?", "I look around the room."]) {
      const w = worldLine(t, line, t.facing!.moment);
      expect(w?.note ?? "").not.toContain("May say only");
      expect((w?.trip ?? t).visits).toEqual(t.visits);
      expect((w?.trip ?? t).people).toEqual(t.people);
    }
  });

  test("what you say in front of them still is", () => {
    const t = someone();
    expect(worldLine(t, "Good evening. Do you know the road north?", t.facing!.moment)!.note).toContain("May say only");
  });
});

describe("a wait, and a try with a wait in it", () => {
  test("a try that waits for its moment is thrown as a try; a wait on its own is the world's", () => {
    const t = someone();
    for (const s of [t, nobody(t)]) {
      expect(worldFirst(s, "I wait for the guard to turn, then slip past.")).toBe(false);
      expect(worldFirstLine(s, "I wait for the guard to turn, then slip past.", s.facing!.moment)).toBeNull();
      expect(worldFirst(s, "I wait here until noon.")).toBe(true);
    }
  });

  test("an hour word before a noun names a thing, not the hour", () => {
    expect(hourNamed("I wait for the morning guard to leave", 10)).toBeNull();
    expect(hourNamed("I wait until morning", 10)).toBe(32);
    expect(hourNamed("I wait until morning comes", 10)).toBe(32);
    expect(hourNamed("I wait till dusk, then go", 10)).toBe(19);
  });
});

describe("the rows that may take a try say something, or give it back", () => {
  test("a player sent to a place that is not on the map asks where; nobody watches in their stead", () => {
    const t = someone();
    const who = t.fellows![0]!;
    const line = `${who.name.split(" ")[0]}, go watch the gate.`;
    expect(worldFirst(t, line)).toBe(true);
    const w = worldFirstLine(t, line, t.facing!.moment)!;
    expect(w.lines[0]).toContain("would go, but where?");
    expect(w.free).toBe(true);
    expect(w.hours).toBeUndefined();
    expect(w.trip.sheet.hour).toBe(t.sheet.hour);
  });

  test("asking the table on your own is your call, and is not said to the person here", () => {
    const t = { ...someone(), fellows: [] };
    const w = worldFirstLine(t, "What should we do?", t.facing!.moment)!;
    expect(w.lines[0]).toContain("nobody else at the table");
    expect(w.note).toBeUndefined();
  });

  test("helping the person here down from a cart is not an hour of their favour", () => {
    let t = someone();
    const p = t.facing!.stop.person!;
    t = { ...t, people: { ...(t.people ?? {}), [p.id]: { ...(t.people?.[p.id] ?? p), wants: "her late rent paid before the landlord calls" } } };
    t = worldLine(t, "What can I do for you?", t.facing!.moment)!.trip;
    expect(t.projects?.some((x) => x.id === `favour:${p.id}`)).toBe(true);
    expect(workedOn(t, "I help her down from the cart.", t.facing!.stop.id)).toBeNull();
    expect(worldFirst(t, "I help her down from the cart and run for the gate.")).toBe(false);
    // Doing what was asked is still work on it.
    expect(worldFirst(t, "I go to the landlord and pay off her rent.")).toBe(true);
  });
});

describe("giving in", () => {
  test("only a line that gives in is read as giving in", () => {
    expect(yieldRead("Enough talk, I swing at him.")).toBe(false);
    expect(yieldRead("Give up the key or die!")).toBe(false);
    expect(yieldRead("I give up my sword to him.")).toBe(false);
    expect(yieldRead("I yield!")).toBe(true);
    expect(yieldRead("Enough.")).toBe(true);
    expect(yieldRead("We won't give in.")).toBe(false);
  });

  test("with no model to ask, only a yield past doubt ends the contest", () => {
    expect(yieldSure("Enough. I give in.")).toBe(true);
    expect(yieldSure("I yield, then stab him when he turns.")).toBe(false);
  });
});

describe("a question that asks to try", () => {
  test("is read as the try it names; a plain question stays a question", () => {
    const m = someone().facing!.moment;
    const r = plainReading("Can I slip past while he's distracted?", m);
    expect(r).not.toBe("none");
    expect(r).not.toBeNull();
    expect(plainReading("Where does this road go?", m)).toBe("none");
  });
});

describe("a try handed to a player", () => {
  test("by a name and a verb, never by something of theirs", () => {
    const f = { ...someone().fellows![0]!, name: "Mira" };
    expect(handedTo("I have Mira's rope, I climb", [f])).toBeNull();
    expect(handedTo("Have Mira and me go first.", [f])).toBeNull();
    expect(handedTo("Let Mira try the lock.", [f])?.name).toBe("Mira");
    expect(handedTo("Get Mira to talk to him.", [f])?.name).toBe("Mira");
  });
});

describe("asking the table", () => {
  test("one reader for talking it over, a vote, and every player's say", () => {
    expect(asksTable("Thoughts?")).toBe(true);
    expect(asksTable("What should we do?")).toBe(true);
    expect(asksTable("What do you all think?")).toBe(true);
    expect(asksTable("What do you think?")).toBe(false);
  });
});

describe("one clock", () => {
  test("moves the moment's hour with the trip's, and time past the deadline loses the job", () => {
    const t = someone();
    const late = clockTo(t, t.adv.deadline.hour + 1);
    expect(late.facing!.moment.sheet.hour).toBe(late.sheet.hour);
    expect(late.over).toBe("deadline");
    const near = clockTo(t, t.adv.deadline.hour - 0.5);
    expect(near.over).toBeFalsy();
    const w = worldLine(near, "I wait here a while.", near.facing!.moment)!;
    expect(w.hours).toBe(1);
    expect(w.trip.over).toBe("deadline");
  });
});

describe("getting ready", () => {
  test("is for the way the line names, when that way is open here", () => {
    const t = someone();
    const ways = t.facing!.moment.stop.ways;
    const named = (["talk", "pay", "force", "sneak"] as const).find((w) => ways[w] && w !== (["sneak", "force", "talk", "pay"] as const).find((x) => ways[x]));
    if (!named) return;
    const said = { talk: "talk my way in", pay: "pay my way in", force: "force my way in", sneak: "sneak in" }[named];
    const w = worldLine(t, `I get ready to ${said}.`, t.facing!.moment)!;
    expect(w.lines[0]).toContain(`for ${named}.`);
  });
});
