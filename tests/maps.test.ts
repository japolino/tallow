/**
 * Map shapes (2026-11-11): a road is walked from one end to the other; a hub is a place you go out from and come back
 * to, its places done in any order, its end opening once enough of them are done.
 */
import { describe, expect, test } from "bun:test";
import { COURIER } from "../src/content/adventures.js";
import { drawRecipe, recipeOf } from "../src/content/tropes.js";
import { ahead, arrive, hubDone, mapOf, startTrip, type Adventure, type Trip } from "../src/engine/adventure.js";
import { layRoad, waysThrough } from "../src/engine/road.js";
import { forkRead, forkSaid } from "../src/engine/tell-adventure.js";

const hubOf = (seed: string): Adventure => layRoad(recipeOf("culprit")!, seed);
const tripOf = (a: Adventure): Trip => startTrip(a, COURIER, "s");
/** Past a stop without playing it: there, and done. */
const past = (t: Trip, id: string): Trip => ({ ...t, at: id, visited: [...t.visited, id], facing: null });

describe("a hub", () => {
  test("its places are all one card each, a leg out from the hub, and the end is closed at first", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const a = hubOf(seed);
      expect(a.hub).toBeDefined();
      const spokes = a.stops.filter((s) => !s.climax);
      expect(a.hub!.needs).toBeGreaterThanOrEqual(2);
      expect(a.hub!.needs).toBeLessThanOrEqual(spokes.length);
      const t = tripOf(a);
      const first = ahead(t).map((s) => s.id).sort();
      expect(first).toEqual(spokes.map((s) => s.id).sort());
      expect(ahead(t).some((s) => s.climax)).toBe(false);
    }
  });

  test("going from one place to another is back through the hub, and the end opens once enough are done", () => {
    const a = hubOf("e");
    const spokes = a.stops.filter((s) => !s.climax).map((s) => s.id);
    let t = tripOf(a);
    const r = arrive(t, spokes[0]!)!;
    expect(r.hours).toBeGreaterThan(0);
    t = past(t, spokes[0]!);
    const out = a.roads.find(([x, y]) => x === "start" && y === spokes[1])![2];
    const across = a.roads.find(([x, y]) => x === spokes[0] && y === spokes[1])![2];
    expect(across).toBeGreaterThan(out);
    for (const id of spokes.slice(1, a.hub!.needs)) t = past(t, id);
    expect(hubDone(t)).toBe(a.hub!.needs);
    expect(ahead(t).some((s) => s.climax)).toBe(true);
    // The places left over can still be done first.
    if (spokes.length > a.hub!.needs) expect(ahead(t).some((s) => !s.climax)).toBe(true);
  });

  test("every way through goes to each place once, and to the end only after enough of them", () => {
    const a = hubOf("f");
    const paths = waysThrough(a);
    expect(paths.length).toBeGreaterThan(1);
    for (const p of paths) {
      expect(new Set(p).size).toBe(p.length);
      const end = p.findIndex((id) => a.stops.find((s) => s.id === id)?.climax);
      expect(end).toBeGreaterThanOrEqual(a.hub!.needs);
    }
  });

  test("is drawn as it is walked: a path out to each place and to the end, not every road between them", () => {
    const a = hubOf("g");
    const m = mapOf(a);
    expect(m.paths.every(([x]) => x === "start")).toBe(true);
    expect(m.paths.length).toBe(a.stops.length);
  });

  test("the narrator names each place by number and says when the end opens; a number picks it", () => {
    const a = hubOf("h");
    const t = tripOf(a);
    const choices = ahead(t);
    const said = forkSaid(t, choices, choices.map(() => 1), null).join(" ");
    expect(said).toContain("1. ");
    expect(said).toContain("is closed to you until");
    if (choices.length > 2) {
      expect(forkRead("3", choices)).toBe(choices[2]!.id);
      expect(forkRead("the second one", choices)).toBe(choices[1]!.id);
    }
  });
});

describe("a road", () => {
  test("stays a road: no hub, and every road goes forward", () => {
    const a = layRoad(recipeOf("escort")!, "a");
    expect(a.hub).toBeUndefined();
    expect(waysThrough(a).every((p) => a.stops.find((s) => s.id === p[p.length - 1])?.climax)).toBe(true);
    expect(drawRecipe("journey", "x", []).shape).not.toBe("hub");
  });
});
