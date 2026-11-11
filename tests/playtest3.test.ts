/**
 * The third round of playtests (2026-11-11), with the same three cards: times said in words, work that is only work
 * when it is, a player sent off by name to the place named (at a fork too), pressing a thing that is not a person, a
 * campaign that takes one step for running out of time, and the candle's last line said plainly.
 */
import { describe, expect, test } from "bun:test";
import { COURIER } from "../src/content/adventures.js";
import { FAMILIES, drawRecipe } from "../src/content/tropes.js";
import { arrive, startTrip, type Adventure, type RoadStop, type Trip } from "../src/engine/adventure.js";
import { chapterSaid, endChapter, startCampaign, STOCK_FRONTS, type Campaign } from "../src/engine/campaign.js";
import { furnish } from "../src/engine/furnish.js";
import { layRoad, waysThrough } from "../src/engine/road.js";
import { hourNamed, hoursNamed, timeRead } from "../src/engine/schedule.js";
import { handedTo } from "../src/engine/seats.js";
import { forkSplit, worldArrive, worldBegin, worldFirst, worldFirstLine, worldLine, workedOn } from "../src/engine/world.js";
import { fallbackAdventure } from "../src/game/build.js";
import type { CardInfo } from "../src/game/card.js";
import { inKit } from "../src/game/session.js";

const MAREN: CardInfo = { name: "Maren", description: "Maren Vell is a ferrywoman of thirty who keeps the crossing at Dunmore." };
const built = (family: (typeof FAMILIES)[number], seed: string): Adventure => fallbackAdventure(furnish(layRoad(drawRecipe(family, seed, [], [family]), seed, { modern: false })), MAREN, seed);
const begin = (a: Adventure, seed: string): Trip => worldBegin(startTrip(a, a.kit ? inKit(COURIER, a.kit) : COURIER, seed));
const someone = (): Trip => {
  for (const seed of ["v1", "v2", "v3", "v4", "v5"]) {
    const a = built("rescue", seed);
    const path = waysThrough(a).find((p) => p.some((id) => a.stops.find((s) => s.id === id)?.person));
    if (!path) continue;
    const id = path.find((x) => a.stops.find((s) => s.id === x)?.person)!;
    let t: Trip = begin(a, seed);
    for (const step of path) {
      if (step === id) break;
      t = { ...t, at: step, visited: [...t.visited, step] };
    }
    const r = arrive(t, id);
    const w = r ? worldArrive(r.trip, a.stops.find((s) => s.id === id)!).trip : null;
    if (w?.facing && w.fellows?.length) return w;
  }
  throw new Error("no seed reached a person with a fellow");
};

describe("times said in words", () => {
  test("a quarter past, half past and a quarter to, and o'clock on the clock face", () => {
    expect(hourNamed("I'll wait here a little while, until a quarter past two", 26)).toBe(26.25);
    expect(hourNamed("I'll wait until 5 o'clock", 16)).toBe(17);
    expect(hourNamed("wait till half past seven", 18)).toBe(19.5);
    expect(hourNamed("wait until a quarter to midnight", 20)).toBe(23.75);
    expect(hourNamed("wait until 2 in the morning", 22)).toBe(26);
    expect(hourNamed("wait until 8:25 pm", 19)).toBeCloseTo(20.4167, 3);
    expect(hourNamed("I wait for the morning guard to leave", 10)).toBeNull();
  });

  test("a length of time is the time said, not an hour", () => {
    expect(hoursNamed("half an hour on my breakfast shop")).toBe(0.5);
    expect(hoursNamed("I put in another hour on the shop")).toBe(1);
    expect(hoursNamed("an hour and a half")).toBe(1.5);
    expect(hoursNamed("a couple of hours")).toBe(2);
    expect(timeRead("I wait half an hour", 20)).toEqual({ act: "wait", hours: 0.5 });
    const t = someone();
    const w = worldLine(t, "I wait here half an hour.", t.facing!.moment)!;
    expect(w.hours).toBe(0.5);
    expect(w.lines[0]).toContain("You wait half an hour.");
  });
});

describe("work is work only when it is", () => {
  const withGoal = (): Trip => {
    const t = someone();
    return worldLine(t, "I want to open a shop that sells English breakfasts", t.facing!.moment)!.trip;
  };

  test("another hour put into the shop works it, for the time said", () => {
    const t = withGoal();
    expect(workedOn(t, "I put in another hour on the shop, ordering a griddle and finding a supplier", t.facing!.stop.id)).not.toBeNull();
    const w = worldLine(t, "I spend half an hour on my breakfast shop, drawing up the menu", t.facing!.moment)!;
    expect(w.hours).toBe(0.5);
    expect(w.lines[0]).toMatch(/^You spend half an hour on/);
  });

  test("asking whether someone lies about the thing, or a question about it, is not an hour's work", () => {
    let t = someone();
    const p = t.facing!.stop.person!;
    t = { ...t, people: { ...(t.people ?? {}), [p.id]: { ...(t.people?.[p.id] ?? p), wants: "to be rid of the night smugglers" } } };
    t = worldLine(t, "What can I do for you?", t.facing!.moment)!.trip;
    expect(t.projects?.some((x) => x.id === `favour:${p.id}`)).toBe(true);
    expect(workedOn(t, "Is he lying about the smugglers he says he has to curse?", t.facing!.stop.id)).toBeNull();
    expect(workedOn(t, "Where do the smugglers land?", t.facing!.stop.id)).toBeNull();
    expect(workedOn(t, "I spend an hour running the smugglers off the jetty.", t.facing!.stop.id)).not.toBeNull();
  });
});

describe("pressing", () => {
  test("pressing a button is not pressing a person, and a place without a person of its own is a try", () => {
    const t = someone();
    expect(worldFirst(t, "I press the buzzer by the door.")).toBe(false);
    const { person: _gone, ...stop } = t.facing!.stop;
    const bare = { ...t, facing: { ...t.facing!, stop, moment: { ...t.facing!.moment, stop } } } as Trip;
    expect(worldFirstLine(bare, "What aren't you telling me?", bare.facing!.moment)).toBeNull();
  });
});

describe("a player sent off", () => {
  test("a try handed over with no way named still names who takes it", () => {
    const f = { ...someone().fellows![0]!, name: "Vypra" };
    expect(handedTo("Vypra, you take this one.", [f])?.name).toBe("Vypra");
  });

  test("at a fork, the one sent goes one way and you take the other", () => {
    const t0 = someone();
    const f = { ...t0.fellows![0]!, name: "Vypra", at: undefined, attitude: "friendly" as const };
    const t = { ...t0, fellows: [f] } as Trip;
    const a = { id: "noodle", name: "the Noodle Bar", teaser: "", card: "person" } as unknown as RoadStop;
    const b = { id: "crowd", name: "the Crowd at the Concourse", teaser: "", card: "crowd" } as unknown as RoadStop;
    const s = forkSplit(t, "Vypra, go on ahead to the Noodle Bar… I'll take the crowd.", [a, b])!;
    expect(s.who.name).toBe("Vypra");
    expect(s.to.id).toBe("noodle");
    expect(s.rest.toLowerCase()).toContain("crowd");
    const s2 = forkSplit(t, "I'll take the Noodle Bar. Vypra, you go to the Concourse.", [a, b])!;
    expect(s2.to.id).toBe("crowd");
    expect(forkSplit(t, "Let's take the Noodle Bar.", [a, b])).toBeNull();
  });

  test("goes to the place named, not to another with a word in common", () => {
    const t0 = someone();
    const f = { ...t0.fellows![0]!, at: undefined, attitude: "friendly" as const };
    const first = f.name.split(/\s+/)[0]!;
    const places = [...t0.adv.places, { id: "gate", name: "Salt Gate" }, { id: "pyre", name: "Pyre Gate" }] as Adventure["places"];
    const t = { ...t0, fellows: [f], adv: { ...t0.adv, places }, book: { ...t0.book!, mapped: [...t0.book!.mapped, "Salt Gate", "Pyre Gate"] } } as Trip;
    const w = worldFirstLine(t, `${first}, go ahead to Pyre Gate and keep watch.`, t.facing!.moment)!;
    expect(w.lines[0]).toContain("goes off to Pyre Gate");
  });
});

describe("the campaign", () => {
  test("running out of time takes one step; being taken out at the end of the road takes two", () => {
    const c0: Campaign = startCampaign(STOCK_FRONTS[0]!);
    expect(endChapter(c0, { setBack: false, failedNear: false, found: [] }).steps.length).toBe(1);
    expect(endChapter(c0, { setBack: false, failedNear: true, found: [] }).steps.length).toBe(2);
  });

  test("the candle's last line says the last step plainly", () => {
    const c = { ...startCampaign(STOCK_FRONTS[0]!), burned: 6, next: 6 };
    const line = chapterSaid(c, [], true).join(" ");
    expect(line).toContain(`the last step is taken: ${c.front.steps[5]}.`);
    expect(line).not.toContain("It is the");
  });
});
