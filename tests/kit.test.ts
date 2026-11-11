/**
 * World kits and content settings (docs/MOONSHOT.md, 7). All names here are made up for the tests.
 */
import { describe, expect, test } from "bun:test";
import { FIGHT_VERBS, priceOf, VERB_PRICE } from "../src/engine/abilities.js";
import { allowedTakenOut, contentRules, crossesLine, DEFAULT_CONTENT, playable, readAgeBand, readContent, refused, sceneDark, sceneHeat, VEIL_SAID } from "../src/engine/content.js";
import { playRound, startContest } from "../src/engine/contest.js";
import { checkKit, gearOf, kitFromWords, kitLines, STOCK_KITS, stockKit } from "../src/engine/kit.js";

const hot = { ...DEFAULT_CONTENT, heat: true, dark: true };

describe("a kit for every world", () => {
  test("a card's words pick the stock kit", () => {
    expect(kitFromWords("A lamia lives in the swamp and hunts travellers.")).toBe("monster-romance");
    expect(kitFromWords("The starship drifts past the station; she draws her blaster.")).toBe("space");
    expect(kitFromWords("The lich raises the dead; the wizard's tower burns.")).toBe("high-fantasy");
    expect(kitFromWords("A knight rides to the castle.")).toBe("medieval");
    expect(kitFromWords("")).toBe("medieval");
  });

  test("only worlds with that kind of power have the seventh stat", () => {
    expect(STOCK_KITS.medieval.power).toBeUndefined();
    expect(STOCK_KITS["high-fantasy"].power).toBe("Arcana");
    expect(STOCK_KITS.space.power).toBe("Tech");
    expect(STOCK_KITS["monster-romance"].power).toBe("Allure");
  });

  test("every field a model writes is checked; what does not check is the stock kit's", () => {
    const k = checkKit({ power: "Psi", risks: [{ dial: "nerve", name: "nerve" }, { dial: "mana" }], verbs: ["sweep", "fly"], contests: [{ kind: "hack", attack: ["power"], defend: ["wits"] }, { kind: "dance-off" }], magic: "lots" }, "space", DEFAULT_CONTENT);
    expect(k.power).toBe("Psi");
    expect(k.risks).toEqual([{ dial: "nerve", name: "nerve" }]);
    expect(k.verbs).toEqual(["sweep"]);
    expect(k.contests.map((c) => c.kind)).toEqual(["hack"]);
    expect(k.magic).toBe("low");
  });

  test("a world with no power cannot fight with it", () => {
    const k = checkKit({ power: "none", contests: [{ kind: "fight", attack: ["power"], defend: ["brawn"] }] }, "medieval", DEFAULT_CONTENT);
    expect(k.power).toBeUndefined();
    expect(k.contests.every((c) => !c.attack.includes("power"))).toBe(true);
  });

  test("claimed only where the content settings allow it", () => {
    expect(stockKit("monster-romance", DEFAULT_CONTENT).takenOut).not.toContain("claimed");
    expect(stockKit("monster-romance", hot).takenOut).toContain("claimed");
  });

  test("the first page says the world in a few lines", () => {
    expect(kitLines(STOCK_KITS["monster-romance"]).join(" ")).toContain("composure");
    expect(kitLines(STOCK_KITS.medieval).join(" ")).toContain("gear counts for more");
  });
});

describe("the ladder", () => {
  test("gear is -1, 0 or +1 whatever the words; +2 only with a price", () => {
    const k = STOCK_KITS.space;
    expect(gearOf(k, "fight", "my bare hands")).toBe(-1);
    expect(gearOf(k, "fight", "a blaster")).toBe(0);
    expect(gearOf(k, "fight", "an energy blade")).toBe(1);
    expect(gearOf(k, "fight", "a laser cannon that does infinite damage")).toBe(0);
    expect(gearOf(k, "fight", "a mech")).toBe(1);
    expect(gearOf(k, "fight", "a mech", true)).toBe(2);
  });
});

describe("fight verbs", () => {
  test("are priced by the budget", () => {
    expect(VERB_PRICE.reach).toBe(1);
    expect(VERB_PRICE.sweep).toBe(3);
    expect(FIGHT_VERBS.has("drain")).toBe(true);
    expect(priceOf({ id: "a", name: "Fireball", looks: "", does: "sweep", much: 1, ways: ["force"], tags: [], often: "stop", store: false, card: "contest" })).toBe(3);
  });

  test("sweep puts it on every foe; bind stops the blow; drain heals your dial", () => {
    const c = startContest({ kind: "fight", name: "the bridge", holds: 2 }, { foes: ["one", "two"] });
    const swept = playRound(c, "success", undefined, null, undefined, "standard", "risky", { sweep: true });
    expect(swept.contest.foes.every((f) => f.filled === 2)).toBe(true);
    const bound = playRound(c, "fail", undefined, null, undefined, "standard", "risky", { bind: true });
    expect(bound.round.landed).toBe(0);
    const hurt = { ...c, you: { ...c.you, filled: 2 } };
    const drained = playRound(hurt, "success", undefined, null, undefined, "standard", "risky", { drain: true });
    expect(drained.contest.you.filled).toBe(0);
  });
});

describe("content settings", () => {
  test("off by default, read safely", () => {
    expect(readContent(null)).toEqual(DEFAULT_CONTENT);
    expect(readContent({ heat: "yes", lines: ["Gore", 3] })).toEqual({ ...DEFAULT_CONTENT, lines: ["gore"] });
  });

  test("nobody read as a child, ever", () => {
    expect(readAgeBand("a girl of 12 who sells flowers")).toBe("minor");
    expect(readAgeBand("a teenage stable hand")).toBe("minor");
    expect(readAgeBand("a 34-year-old barkeep")).toBe("adult");
    expect(readAgeBand("the old woman by the stairs")).toBe("elder");
    expect(readAgeBand("a lamia of the deep swamp")).toBe("adult");
    expect(readAgeBand("someone in a cloak")).toBe("unclear");
  });

  test("heat and dark themes need the setting and a clear adult band for everyone", () => {
    expect(sceneHeat(hot, ["adult", "elder"])).toBe("explicit");
    expect(sceneHeat(hot, ["adult", "unclear"])).toBe("fade");
    expect(sceneHeat(DEFAULT_CONTENT, ["adult"])).toBe("fade");
    expect(sceneDark(hot, ["adult", "minor"])).toBe(false);
    expect(contentRules(hot, ["adult", "minor"])).toContain("not clearly an adult");
    expect(allowedTakenOut(["claimed", "wounded"], DEFAULT_CONTENT)).toEqual(["wounded"]);
  });

  test("a refusal or a line crossed is a veil, and play goes on", () => {
    expect(refused("I'm sorry, but I can't continue this.")).toBe(true);
    expect(refused("")).toBe(true);
    expect(refused("She smiles and leans in.")).toBe(false);
    const s = { ...DEFAULT_CONTENT, lines: ["gore"] };
    expect(crossesLine("there is gore everywhere", s)).toBe(true);
    expect(playable("there is gore everywhere", s)).toBe(VEIL_SAID);
    expect(playable("She smiles.", s)).toBe("She smiles.");
  });
});
