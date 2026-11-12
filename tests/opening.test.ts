/**
 * The night opens from the card's first message (session.ts, openingFor): a model chooses among the openings the story's
 * shape allows, code lays the road with its first stop that trouble, and the card's own character, met hostile there,
 * walks with you only once it is past. And you may sit down as your own persona instead of someone new.
 */
import { describe, expect, test } from "bun:test";
import { RECIPES, recipeOf, type Recipe } from "../src/content/tropes.js";
import { furnish } from "../src/engine/furnish.js";
import { hubDone, mapOf } from "../src/engine/adventure.js";
import { FRIEND, layRoad, waysThrough, type RoadOptions } from "../src/engine/road.js";
import { applyWords, buildMessages, openingSaid } from "../src/game/build.js";
import type { CardInfo } from "../src/game/card.js";
import { openingFor, openingOf, openingOptions, personaLine, takesPersona, whoAsk, WHO_ASK } from "../src/game/session.js";

const HOSTILE: CardInfo = {
  name: "Vesna",
  description: "A mercenary captain who blames you for the death of her brother.",
  scenario: "The ruins of the old mill, at dusk.",
  firstMessage: "Vesna draws her sabre the moment {{user}} steps out of the trees. \"You. I have waited a year for this.\" She charges.",
};
const WORLD: CardInfo = { ...HOSTILE, name: "The Ashlands", world: true };
const captive = recipeOf("captive")!;
const vault = recipeOf("vault")!;
const swap = recipeOf("swap")!;

/** The stop the road from the start leads to, when it leads to one. */
const firstStops = (r: Recipe, seed: string, opening?: RoadOptions["opening"]) => {
  const adv = layRoad(r, seed, { ...(opening ? { opening } : {}) });
  return { adv, first: adv.roads.filter(([a]) => a === adv.start).map(([, b]) => adv.stops.find((s) => s.id === b)!) };
};

describe("the road is laid with the opening the first message calls for", () => {
  test("a fight with the card's own character is the first stop, and they join once it is past", () => {
    let opened = 0;
    for (let i = 0; i < 40; i++) {
      const { adv, first } = firstStops(captive, `o${i}`, { kind: "fight", them: true });
      const s = adv.stops.find((x) => x.opening);
      if (!s) continue;
      opened++;
      expect(first).toEqual([s]);
      expect(s.kind).toBe("fight");
      expect(s.opening).toBe("them");
      expect(s.reward?.joins).toBe(FRIEND);
      expect(s.reward?.loot).toBeUndefined();
      expect(s.foe).toBeDefined();
    }
    expect(opened).toBeGreaterThan(30);
  });

  test("a standoff with others is a person stop that wins nothing and brings nobody", () => {
    for (let i = 0; i < 20; i++) {
      const adv = furnish(layRoad(captive, `s${i}`, { opening: { kind: "person", them: false } }));
      const s = adv.stops.find((x) => x.opening)!;
      expect(s.kind).toBe("person");
      expect(s.opening).toBe("others");
      expect(s.reward).toBeUndefined();
      expect(s.person).toBeDefined();
    }
  });

  test("a hub is gone into through its opening, which is not one of its places", () => {
    const plain = layRoad(vault, "h1");
    const adv = layRoad(vault, "h1", { opening: { kind: "fight", them: true } });
    const s = adv.stops.find((x) => x.opening)!;
    expect(s.kind).toBe("fight");
    expect(adv.stops.length).toBe(plain.stops.length + 1);
    // The only way out of the start is the opening; from there, every place the hub had, and its end.
    expect(adv.roads.filter(([a]) => a === adv.start).map(([, b]) => b)).toEqual([s.id]);
    expect(adv.roads.filter(([a]) => a === s.id).map(([, b]) => b).sort()).toEqual(plain.roads.filter(([a]) => a === plain.start).map(([, b]) => b).sort());
    // It is not counted toward what the end needs, and the clock has room for it.
    expect(hubDone({ adv, visited: [adv.start, s.id] })).toBe(0);
    expect(adv.deadline.hour).toBeGreaterThanOrEqual(plain.deadline.hour);
    for (const way of waysThrough(adv)) if (way.some((id) => adv.stops.find((x) => x.id === id)?.climax)) expect(way.filter((id) => id !== s.id && !adv.stops.find((x) => x.id === id)?.climax).length).toBeGreaterThanOrEqual(adv.hub!.needs);
    expect(mapOf(adv).paths.some(([a]) => a === s.id)).toBe(true);
  });

  test("a road without an opening is laid as before", () => {
    expect(JSON.stringify(layRoad(captive, "same"))).toBe(JSON.stringify(layRoad(captive, "same", {})));
    expect(JSON.stringify(layRoad(vault, "same"))).toBe(JSON.stringify(layRoad(vault, "same", {})));
  });

  test("the card's character, met first, is not at your side until the opening is past", () => {
    const adv = furnish(layRoad(captive, "o1", { opening: { kind: "fight", them: true } }));
    expect(adv.stops.some((s) => s.opening)).toBe(true);
    const built = applyWords(adv, HOSTILE, {}, "o1").adv;
    expect(built.party).toEqual([]);
    expect(built.companions.some((c) => c.id === FRIEND)).toBe(true);
    const plain = applyWords(furnish(layRoad(captive, "o1")), HOSTILE, {}, "o1").adv;
    expect(plain.party).toEqual([FRIEND]);
  });

  test("the builder is told the opening comes from the first message, and who stands there", () => {
    const adv = furnish(layRoad(captive, "o1", { opening: { kind: "fight", them: true } }));
    const s = adv.stops.find((x) => x.opening)!;
    expect(s).toBeDefined();
    const said = openingSaid(HOSTILE, s);
    expect(said).toContain("first message");
    expect(said).toContain("Vesna");
    const user = buildMessages(HOSTILE, adv)[1]!.content;
    expect(user).toContain("THE OPENING");
    expect(user).toContain("is met first, at the opening stop");
  });
});

describe("the opening is chosen by a model, among those the story allows", () => {
  test("only openings the story's shape allows are offered", () => {
    expect(Object.keys(openingOptions(HOSTILE, captive)!)).toEqual(["road", "fight_them", "fight", "standoff"]);
    // A world card has no one character to come at you.
    expect(openingOptions(WORLD, captive)!.fight_them).toBeUndefined();
    // A story with no fights in it offers none.
    expect(Object.keys(openingOptions(HOSTILE, swap)!)).toEqual(["road", "standoff"]);
    expect(Object.keys(openingOptions(HOSTILE, vault)!)).toEqual(["road", "fight_them", "fight", "standoff"]);
    expect(openingOptions({ ...HOSTILE, firstMessage: "" }, captive)).toBeNull();
  });

  test("the model's answer is the opening; anything not offered is none", async () => {
    const said = (key: string | null) => ({ pick: async () => key });
    expect(await openingFor(said("fight_them"), HOSTILE, captive, "a tracker", "")).toEqual({ kind: "fight", them: true });
    expect(await openingFor(said("standoff"), WORLD, captive, "", "")).toEqual({ kind: "person", them: false });
    expect(await openingFor(said("fight_them"), WORLD, captive, "", "")).toBeNull();
    expect(await openingFor(said("road"), HOSTILE, captive, "", "")).toBeNull();
    expect(await openingFor(said(null), HOSTILE, captive, "", "")).toBeNull();
    expect(await openingFor({}, HOSTILE, captive, "", "")).toBeNull();
    expect(openingOf(HOSTILE, "fight")).toEqual({ kind: "fight", them: false });
  });

  test("the model sees the first message with the card's macros filled, who the player is and what they asked", async () => {
    let seen = "";
    await openingFor({ pick: async (_q, text) => ((seen = text), "road") }, HOSTILE, captive, "Kel, a deserter", "revenge on the river");
    expect(seen).toContain("the moment you steps out");
    expect(seen).toContain("Kel, a deserter");
    expect(seen).toContain("revenge on the river");
  });

  test("every story with fights offers a fight opening, and every one can be laid with its openings", () => {
    for (const r of RECIPES) {
      const o = openingOptions(HOSTILE, r)!;
      expect(!!o.fight).toBe(r.mix.fight > 0);
      for (const key of Object.keys(o)) {
        const op = openingOf(HOSTILE, key);
        if (!op) continue;
        const adv = furnish(layRoad(r, `all:${key}`, { opening: op }));
        const s = adv.stops.find((x) => x.opening);
        if (r.shape === "hub") expect(s?.kind).toBe(op.kind);
        if (s) expect(s.kind).toBe(op.kind);
        expect(waysThrough(adv).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("you may sit down as your own persona", () => {
  const persona = { name: "Kestrel", who: "A wandering cartographer with a bad knee and a good memory." };
  test("the narrator offers it only when there is one", () => {
    expect(whoAsk()).toBe(WHO_ASK);
    expect(whoAsk(persona)).toContain("as yourself, Kestrel");
  });
  test("the words take it only when no model can tell", () => {
    expect(takesPersona("as myself", persona)).toBe(true);
    expect(takesPersona("Kestrel.", persona)).toBe(true);
    expect(takesPersona("A one-eyed smuggler called Rook", persona)).toBe(false);
  });
  test("the persona is what is read into the hero, with what was said at the table", () => {
    const line = personaLine(persona, "as myself, with my old compass");
    expect(line.startsWith("Kestrel. A wandering cartographer")).toBe(true);
    expect(line).toContain("with my old compass");
  });
});
