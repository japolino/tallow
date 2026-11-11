/**
 * A story built from a card gets the living world too (engine/furnish.ts): people with minds of their own, what there
 * is to find out, the other side's clock, and the companions at the table. Found missing by playing real cards.
 */
import { describe, expect, test } from "bun:test";
import { FAMILIES, drawRecipe } from "../src/content/tropes.js";
import { arrive, startTrip, type Adventure, type Trip } from "../src/engine/adventure.js";
import { checkClues } from "../src/engine/clues.js";
import { furnish } from "../src/engine/furnish.js";
import { layRoad, waysThrough } from "../src/engine/road.js";
import { hourNamed } from "../src/engine/schedule.js";
import { worldArrive, worldBegin, worldFirst, worldLine } from "../src/engine/world.js";
import { applyWords, buildMessages, fallbackAdventure, wordsOf } from "../src/game/build.js";
import type { CardInfo } from "../src/game/card.js";
import { inKit } from "../src/game/session.js";
import { COURIER } from "../src/content/adventures.js";

const MAREN: CardInfo = { name: "Maren", description: "Maren Vell is a ferrywoman of thirty who keeps the crossing at Dunmore." };
const road = (family: (typeof FAMILIES)[number], seed = "f1"): Adventure => furnish(layRoad(drawRecipe(family, seed, [], [family]), seed, { modern: false }));
const built = (family: (typeof FAMILIES)[number], seed = "f1"): Adventure => fallbackAdventure(road(family, seed), MAREN, seed);
const begin = (a: Adventure, seed = "f1"): Trip => worldBegin(startTrip(a, a.kit ? inKit(COURIER, a.kit) : COURIER, seed));
/** At the first stop on the road that has a person in it. */
const atPerson = (a: Adventure): Trip | null => {
  const t0 = begin(a);
  const path = waysThrough(a).find((p) => p.some((id) => a.stops.find((s) => s.id === id)?.person));
  if (!path) return null;
  const id = path.find((x) => a.stops.find((s) => s.id === x)?.person)!;
  let t: Trip = t0;
  for (const step of path) {
    if (step === id) break;
    t = { ...t, at: step, visited: [...t.visited, step] };
  }
  const r = arrive(t, id);
  return r ? worldArrive(r.trip, a.stops.find((s) => s.id === id)!).trip : null;
};

describe("a laid road is furnished", () => {
  for (const family of FAMILIES) {
    test(`${family}: people, clues that check, and the other side's clock`, () => {
      for (const seed of ["a", "b", "c", "d"]) {
        const a = road(family, seed);
        expect(a.kind).toBe(family);
        expect(checkClues(a.clues ?? [])).toEqual([]);
        const people = a.stops.filter((s) => s.person);
        expect(people.length).toBeGreaterThan(0);
        for (const s of people) expect(s.climax).toBeFalsy();
        // Everyone a clue is told by is someone on the road, and knows it.
        for (const c of a.clues!.filter((x) => x.from?.person)) expect(people.some((s) => s.person!.id === c.from!.person && s.person!.knows.some((k) => k.clue === c.id))).toBe(true);
        expect(a.appointments!.length).toBeGreaterThan(0);
        for (const ap of a.appointments!) {
          expect(ap.at).toBeGreaterThan(a.startHour);
          expect(ap.at).toBeLessThan(a.deadline.hour);
        }
      }
    });
  }

  test("a road with people already (written by hand) is left as it is", () => {
    const a = road("mystery");
    expect(furnish(a)).toBe(a);
  });
});

describe("the builder rewrites them for the card's world", () => {
  test("the model is asked for the people, the clues and the other side's moves, and told what each must be", () => {
    const a = road("rescue");
    const w = wordsOf(a);
    expect(Object.keys(w.people ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(w.clues ?? {}).length).toBe(a.clues!.length);
    expect(Object.keys(w.moves ?? {}).length).toBe(a.appointments!.length);
    const user = buildMessages(MAREN, a)[1]!.content;
    expect(user).toContain("THE PEOPLE, WHAT THERE IS TO FIND OUT");
    expect(user).toContain("where they are held");
  });

  test("what the model wrote is taken over, and who someone is is read by code", () => {
    const a = road("rescue");
    const s = a.stops.find((x) => x.person)!;
    const c = a.clues![0]!;
    const b = applyWords(a, MAREN, { people: { [s.id]: { name: "Old Garrow", who: "an old man who keeps the toll", wants: "his boat back" } }, clues: { [c.id]: "They keep her in the salt cellar under the abbey." } }, "s").adv;
    const p = b.stops.find((x) => x.id === s.id)!.person!;
    expect(p.name).toBe("Old Garrow");
    expect(p.wants).toBe("his boat back");
    expect(p.age).toBe("elder");
    expect(b.clues!.find((x) => x.id === c.id)!.text).toBe("They keep her in the salt cellar under the abbey.");
  });
});

describe("played: the full table and the people, in a story built from a card", () => {
  test("the card's character walks with you as a player at the table", () => {
    const t = begin(built("rescue"));
    expect(t.party).toContain("friend");
    expect(t.fellows?.find((f) => f.id === "friend")?.name).toBe("Maren");
    expect(t.fellows?.find((f) => f.id === "friend")?.fromCard).toBe(true);
  });

  test("a vote, talking it over, and pressing the person here all do something", () => {
    for (const seed of ["v1", "v2", "v3", "v4"]) {
      const a = built("rescue", seed);
      const t = atPerson(a);
      if (!t?.facing) continue;
      const m = t.facing.moment;
      expect(worldLine(t, "Let's vote on it.", m)!.lines[0]).toContain("Hands go up");
      expect(worldLine(t, "Let's talk it over.", m)!.lines[0]).toContain("Talk it over");
      expect(worldFirst(t, "What aren't you telling me?")).toBe(true);
      expect(worldLine(t, "What aren't you telling me?", m)!.lines[0]).toContain("You press");
      expect(worldLine(t, "What can I do for you?", m)!.trip.projects?.some((p) => p.id.startsWith("favour:"))).toBe(true);
      return;
    }
    throw new Error("no seed reached a person");
  });

  test("a vote with nobody to vote with says so instead of doing nothing", () => {
    const a = built("romance");
    const t = begin(a);
    const stop = a.stops[0]!;
    const r = arrive(t, stop.id);
    if (!r?.trip.facing) return;
    const w = worldLine({ ...r.trip, fellows: [] }, "Let's vote.", r.trip.facing.moment)!;
    expect(w.lines[0]).toContain("nobody else at the table");
  });

  test("waiting until a bell rings an hour names that hour", () => {
    expect(hourNamed("I'll wait here until the bells ring four", 20)).toBe(28);
  });
});
