import { describe, expect, test } from "bun:test";
import { DEFAULT_CONTENT } from "../src/engine/content.js";
import { stockKit } from "../src/engine/kit.js";
import { kitMessages, parseKit, writeKit } from "../src/game/kitwriter.js";

const TOWER = {
  like: "high-fantasy",
  name: "Floors, bosses and loot",
  magic: "high",
  era: "a tower of a hundred floors, each its own world; system windows, skills and drops",
  fears: "the floor boss, dying on a floor nobody comes back from, the guilds",
  power: "Arcana",
  risks: [{ dial: "health", name: "HP" }],
  gear: {
    fight: { none: "bare fists", plain: "a starter sword", made: "a rare drop", best: "a boss-drop legendary" },
    travel: { none: "climbing the stairs", plain: "a floor map", made: "a teleport crystal" },
    entry: { none: "nothing", plain: "a lockpick skill", made: "a master key drop" },
  },
  contests: [
    { kind: "fight", attack: ["brawn", "power"], defend: ["grace"] },
    { kind: "words", attack: ["charm"], defend: ["sense"] },
  ],
  verbs: ["reach", "edge"],
  hurts: ["fire", "holy", "weak points"],
  takenOut: ["wounded", "claimed", "killed"],
  wants: ["your loot", "your floor-clear"],
};

describe("the world kit, written by a model and checked by code", () => {
  test("a whole kit is used in its own words, held to code's lists", () => {
    const kit = parseKit(TOWER, DEFAULT_CONTENT, "medieval")!;
    expect(kit.era).toContain("hundred floors");
    expect(kit.gear.travel.made).toBe("a teleport crystal");
    expect(kit.id).toBe("high-fantasy");
    expect(kit.power).toBe("Arcana");
    expect(kit.risks[0]!.name).toBe("HP");
    expect(kit.contests[0]!.attack).toContain("power");
    expect(kit.wants).toContain("your loot");
  });

  test("a kit with a note left in, or a rung of the gear ladder missing, is thrown away whole", () => {
    expect(parseKit({ ...TOWER, era: "<the era, its places and its tools>" }, DEFAULT_CONTENT, "medieval")).toBeNull();
    expect(parseKit({ ...TOWER, gear: { ...TOWER.gear, entry: { none: "nothing" } } }, DEFAULT_CONTENT, "medieval")).toBeNull();
    expect(parseKit({ ...TOWER, wants: [] }, DEFAULT_CONTENT, "medieval")).toBeNull();
    expect(parseKit("a tower", DEFAULT_CONTENT, "medieval")).toBeNull();
  });

  test("what code's lists do not have falls to the nearest stock kit the model named; content settings still hold", () => {
    const kit = parseKit({ ...TOWER, like: "space", contests: [{ kind: "boss-rush", attack: ["brawn"], defend: ["grace"] }], verbs: ["explode"] }, { ...DEFAULT_CONTENT, heat: false, dark: false }, "medieval")!;
    expect(kit.id).toBe("space");
    expect(kit.contests).toEqual(stockKit("space", DEFAULT_CONTENT).contests);
    expect(kit.takenOut).not.toContain("claimed");
    // The world's own words are kept even so.
    expect(kit.era).toContain("hundred floors");
  });

  test("an unknown nearest kit falls back to the card's words", () => {
    expect(parseKit({ ...TOWER, like: "tower-world" }, DEFAULT_CONTENT, "modern")!.id).toBe("modern");
  });

  test("the model is asked again once, then the stock kit is used", async () => {
    let asked = 0;
    const good = await writeKit(async () => (asked++ === 0 ? "not json" : JSON.stringify(TOWER)), "A tower of a hundred floors.", DEFAULT_CONTENT, () => stockKit("medieval", DEFAULT_CONTENT));
    expect(asked).toBe(2);
    expect(good.name).toBe("Floors, bosses and loot");
    const fell = await writeKit(async () => "{}", "A tower.", DEFAULT_CONTENT, () => stockKit("medieval", DEFAULT_CONTENT));
    expect(fell).toEqual(stockKit("medieval", DEFAULT_CONTENT));
    const none = await writeKit(null, "A tower.", DEFAULT_CONTENT, () => stockKit("space", DEFAULT_CONTENT));
    expect(none.id).toBe("space");
  });

  test("the player's ask and who they are go to the kit; claimed is offered only where content allows it", () => {
    const m = kitMessages("THE TOWER", DEFAULT_CONTENT, { asked: "I want to open a ramen stand at the bottom of the tower", who: "Ken, a cook", modern: false });
    const all = m.map((x) => x.content).join("\n");
    expect(all).toContain("ramen stand");
    expect(all).toContain("Ken, a cook");
    expect(all).toContain("claimed");
    const tame = kitMessages("THE TOWER", { ...DEFAULT_CONTENT, heat: false, dark: false }).map((x) => x.content).join("\n");
    expect(tame).not.toContain("claimed");
  });
});
