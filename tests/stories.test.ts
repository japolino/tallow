/**
 * Stories drawn from families and their roads laid out by code (content/tropes.ts, engine/road.ts), the builder told
 * the story and the card's world, and a sitting that goes on after a story ends (session.ts).
 */
import { describe, expect, test } from "bun:test";
import { FAMILIES, RECIPES, drawRecipe, familiesFor, recipeOf, recipesIn, storyRead } from "../src/content/tropes.js";
import { partOf, type Trip } from "../src/engine/adventure.js";
import { cardKind } from "../src/engine/cards.js";
import { rulesHero } from "../src/engine/hero.js";
import { nameCheck, WAYS } from "../src/engine/moment.js";
import { layRoad, waysThrough } from "../src/engine/road.js";
import { applyWords, buildMessages, fallbackAdventure, FRIEND } from "../src/game/build.js";
import type { CardInfo } from "../src/game/card.js";
import type { Table } from "../src/game/director.js";
import { standIns } from "../src/game/minds.js";
import { epilogueMessages } from "../src/game/prompts.js";
import { GOODNIGHT, keptThings, sit, type Kept } from "../src/game/session.js";

const MAREN: CardInfo = { name: "Maren Vell", description: "Maren Vell is a lamplighter in a river town, thirty-one, quick-tongued and stubborn." };
const VALE: CardInfo = { name: "Thornvale", description: "A valley kingdom of river towns.", world: true };

describe("the stories", () => {
  test("every family has stories, and every story's cards are real", () => {
    for (const f of FAMILIES) expect(recipesIn(f).length).toBeGreaterThanOrEqual(3);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    for (const r of RECIPES) {
      for (const c of r.climax.cards) expect(() => cardKind(c)).not.toThrow();
      if (r.rival) expect(() => cardKind(r.rival!.card)).not.toThrow();
      expect(r.part === "courted").toBe(r.family === "romance");
    }
  });

  test("a romance is offered only when the card's character may be courted", () => {
    expect(familiesFor(true)).toContain("romance");
    expect(familiesFor(false)).not.toContain("romance");
    expect(familiesFor(false).length).toBe(FAMILIES.length - 1);
  });

  test("what you write is read as a kind of story, a choice left to the narrator, or stopping", () => {
    const all = familiesFor(true);
    expect(storyRead("a heist, please", all)).toBe("heist");
    expect(storyRead("let's solve a murder", all)).toBe("mystery");
    expect(storyRead("surprise me", all)).toBe("any");
    expect(storyRead("I want to win her heart", familiesFor(false))).toBeNull();
    expect(storyRead("I'm done for tonight", all)).toBeNull();
    expect(storyRead("I'm done for tonight", all, true)).toBe("done");
    expect(storyRead("hmm", all)).toBeNull();
  });

  test("a story is drawn inside the family asked for, and not one already played while there are others", () => {
    for (const f of FAMILIES) for (let i = 0; i < 20; i++) expect(drawRecipe(f, `s${i}`, []).family).toBe(f);
    const heists = recipesIn("heist").map((r) => r.id);
    const played = heists.slice(0, -1);
    expect(drawRecipe("heist", "x", played).id).toBe(heists[heists.length - 1]!);
    // All played: anything but the last one.
    for (let i = 0; i < 20; i++) expect(drawRecipe("heist", `y${i}`, heists).id).not.toBe(heists[heists.length - 1]);
    // Left to the narrator: never a romance if it is not offered, and seeds give different stories.
    const picks = new Set(Array.from({ length: 40 }, (_, i) => drawRecipe("any", `z${i}`, [], familiesFor(false))));
    for (const r of picks) expect(r.family).not.toBe("romance");
    expect(picks.size).toBeGreaterThan(8);
  });
});

describe("a road laid out for a story", () => {
  test("every story gives a whole, fair road, on many seeds, in either age", () => {
    for (const r of RECIPES) {
      for (let i = 0; i < 25; i++) {
        const adv = layRoad(r, `seed-${i}`, { modern: i % 2 === 1 });
        const ids = adv.stops.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.length).toBeGreaterThanOrEqual(r.stops[0]);
        expect(ids.length).toBeLessThanOrEqual(r.stops[1]);
        expect(new Set(adv.places.map((p) => p.id)).size).toBe(adv.places.length);
        for (const s of adv.stops) {
          expect(adv.places.some((p) => p.id === s.id)).toBe(true);
          expect(() => cardKind(s.card)).not.toThrow();
          const open = WAYS.filter((w) => s.ways[w]);
          expect(open.length).toBeGreaterThanOrEqual(2);
          // One way is always fair or easier: there is a way to try.
          expect(Math.min(...open.map((w) => s.ways[w]!.difficulty))).toBeLessThanOrEqual(1);
          for (const l of s.levers) expect(s.ways[l.way]).toBeDefined();
          if (s.reward?.loot) expect(adv.loot.some((l) => l.id === s.reward!.loot)).toBe(true);
          if (s.reward?.joins) expect(adv.companions.some((c) => c.id === s.reward!.joins)).toBe(true);
        }
        const climax = adv.stops.filter((s) => s.climax);
        expect(climax.length).toBe(1);
        expect(climax[0]!.holds).toBe(r.climax.holds > 1 ? r.climax.holds : undefined);
        // Every way through ends at the last stop, and passes the same number of stops or one fewer.
        const ways = waysThrough(adv);
        expect(ways.length).toBeGreaterThanOrEqual(2);
        for (const w of ways) expect(w[w.length - 1]).toBe(climax[0]!.id);
        expect(adv.deadline.hour).toBeGreaterThan(adv.startHour + 5);
        expect(adv.deadline.hour).toBeLessThan(adv.startHour + 18);
        expect(Boolean(adv.rival)).toBe(Boolean(r.rival));
        expect(partOf(adv)).toBe(r.part);
        if (adv.rival) expect(adv.stops.some((s) => s.card === adv.rival!.card)).toBe(false);
      }
    }
  });

  test("the same story and seed give the same road; other seeds give other roads", () => {
    const r = recipeOf("vault")!;
    expect(JSON.stringify(layRoad(r, "moss"))).toBe(JSON.stringify(layRoad(r, "moss")));
    const shapes = new Set(Array.from({ length: 20 }, (_, i) => layRoad(r, `s${i}`).stops.map((s) => s.card).join(",")));
    expect(shapes.size).toBeGreaterThan(10);
  });

  test("the card's character takes the story's part, by name, everywhere", () => {
    const rescue = fallbackAdventure(layRoad(recipeOf("captive")!, "a"), MAREN, "a");
    expect(JSON.stringify(rescue)).not.toContain("{friend}");
    expect(rescue.companions.find((c) => c.id === FRIEND)!.name).toBe("Maren Vell");
    expect(rescue.party).toEqual([FRIEND]);
    expect(rescue.goal).toContain("Maren Vell");
    const romance = fallbackAdventure(layRoad(recipeOf("forbidden")!, "a"), MAREN, "a");
    expect(JSON.stringify(romance)).not.toContain("{friend}");
    expect(romance.courted!.name).toBe("Maren Vell");
    // A world card: someone of that world, never the world's name and never the placeholder.
    const world = fallbackAdventure(layRoad(recipeOf("admirer")!, "a"), VALE, "a");
    expect(world.courted!.name).not.toBe("Thornvale");
    expect(JSON.stringify(world)).not.toContain("{friend}");
    const named = applyWords(layRoad(recipeOf("escort")!, "a"), VALE, { friend: { name: "Edda", who: "a ferrywoman", good_at: "wits", likes: "talk", dislikes: "force" }, goal: "Get {friend} to the high bridge by dawn." }, "a").adv;
    expect(named.companions.find((c) => c.id === FRIEND)!.name).toBe("Edda");
    expect(named.goal).toBe("Get Edda to the high bridge by dawn.");
  });

  test("the builder is told the story, and to use the card's own world", () => {
    const [sys, user] = buildMessages(MAREN, layRoad(recipeOf("smuggle")!, "a"));
    expect(user!.content).toContain("THE STORY: a smuggling run");
    expect(sys!.content).toContain("Use the card's own world as fully as you can");
    expect(sys!.content).toContain('"{friend}"');
  });
});

describe("after a story", () => {
  test("the epilogue is asked for in the card's world, and fits how it ended", () => {
    const adv = fallbackAdventure(layRoad(recipeOf("beast")!, "a"), MAREN, "a");
    const t = { adv, seed: "a", sheet: { stats: { brawn: 1, grace: 1, charm: 1, guile: 1, wits: 1, sense: 1 }, health: 3, supplies: 2, goodwill: 1, hour: 20 }, at: "start", visited: [], facing: null, party: [FRIEND], kept: [], abilities: [], storyUsed: [], marks: [], level: 1, deeds: [], passed: 0, rival: 0, warned: 0, over: "won" } as Trip;
    const [sys, user] = epilogueMessages(t, { world: "A river town of lamplighters." });
    expect(sys!.content).toContain("It was won");
    expect(user!.content).toContain("A river town of lamplighters.");
    expect(epilogueMessages({ ...t, over: "deadline" })[0]!.content).toContain("It was lost");
  });

  test("things kept for the next story get ids the next road cannot have", () => {
    const adv = fallbackAdventure(layRoad(recipeOf("vault")!, "a"), MAREN, "a");
    const t = { adv, kept: adv.loot.map((l) => l.id) } as unknown as Trip;
    const kept = keptThings(t);
    expect(kept.length).toBeLessThanOrEqual(2);
    for (const l of kept) expect(l.id.startsWith("kept-")).toBe(true);
  });

  test("a sitting goes on after a story: words for what became of everyone, the table cleared, another story or goodnight", async () => {
    const log: string[] = [];
    let d: { trip: Trip; stage: string } | null = null;
    const between = ["a heist, please", "I am Ash, a quick and quiet thief", "I'm done for tonight"];
    const table: Table = {
      say: async (l) => void log.push(...l),
      write: async () => {
        let line: string;
        if (!d || d.stage === "over") line = between.shift() ?? "done";
        else if (d.stage === "camp") line = "I press on";
        else {
          const m = d.trip.facing?.moment;
          const way = m && (["sneak", "talk", "force", "pay"] as const).find((w) => nameCheck(m, { way: w }));
          line = { sneak: "I creep past quietly", talk: "I ask them kindly", force: "I shove my way through", pay: "I pay what they ask" }[way ?? "sneak"];
        }
        log.push(`> ${line}`);
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
      fork: async (s) => s[0]!.id,
      offer: async () => (log.push("offer"), 0),
      give: async () => {},
      take: async () => {},
      rival: async () => {},
      sweep: async () => void log.push("sweep"),
      move: async () => {},
    };
    let kept: Kept | null = null;
    let left = false;
    const minds = { ...standIns(0), epilogue: async () => "Years later, people still tell it.", hero: async (line: string) => rulesHero(line) };
    const last = await sit({ card: MAREN, seed: "night", table, minds, ask: null, started: (x) => (d = x), keep: (k) => (kept = k), leave: () => (left = true) });
    expect(log).toContain("Years later, people still tell it.");
    expect(log).toContain("sweep");
    expect(log.some((l) => l.startsWith("Another story?"))).toBe(true);
    expect(log).toContain(GOODNIGHT[0]!);
    expect(left).toBe(true);
    expect(kept!.played).toEqual([last!.adv.trope]);
    expect(recipeOf(last!.adv.trope)!.family).toBe("heist");
    if (last!.over === "won") {
      expect(log).toContain("offer");
      expect(kept!.hero.abilities.length).toBe(last!.abilities.length + 1);
    } else expect(kept!.carry).toEqual([]);
    // Sitting down again: you are who you were, and the narrator says so.
    log.length = 0;
    d = null;
    between.push("surprise me", "done");
    await sit({ card: MAREN, seed: "night2", table, minds, ask: null, started: (x) => (d = x), kept, keep: (k) => (kept = k) });
    expect(log.some((l) => l.includes("You are back"))).toBe(true);
    expect(log.some((l) => l.startsWith("And who are you?"))).toBe(false);
    expect(kept!.played.length).toBe(2);
    expect(kept!.played[1]).not.toBe(kept!.played[0]);
  });
});
