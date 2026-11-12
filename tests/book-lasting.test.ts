/**
 * What tries have won that stays true (engine/lasting.ts) reaches the narrator's book (engine/chapter.ts): whoever was
 * won to come along is someone a chapter can be among, and what was won or turned against the player is told to its writer.
 */
import { describe, expect, test } from "bun:test";
import { STOCK_SCENES } from "../src/content/scenes.js";
import { startTrip, type Trip } from "../src/engine/adventure.js";
import { chapterMaterial, chapterWorth } from "../src/engine/chapter.js";
import { enterScene, sceneAdventure, startHand, type SceneTry } from "../src/engine/hand.js";
import { START } from "../src/engine/hero.js";
import { companyNow, priceTry, spendTry, type OwnRead } from "../src/engine/lasting.js";
import type { Sheet } from "../src/engine/moment.js";
import { materialSaid } from "../src/game/chapterwriter.js";

const SHEET: Sheet = { stats: { brawn: 1, grace: 2, charm: 3, guile: 2, wits: 1, sense: 1 }, ...START, hour: 19 };
const opened = (seed = "book"): Trip => enterScene(startHand(startTrip(sceneAdventure(STOCK_SCENES, { seed, who: "a courier", startHour: 19 }), SHEET, seed)))!.trip;
const ORLA: OwnRead = { kind: "join", who: "Orla", change: "Orla comes with you for the rest of the night.", size: "large", lesser: "Orla rows you across, and no further.", catch: "Her boy is left alone by the stove, and will come looking.", against: "She shuts the ferry gate on you.", costs: "hours" };
const ask = (own: OwnRead, risk: SceneTry["risk"] = "grave"): SceneTry => ({ attempt: "ask something lasting", stat: "charm", risk, stake: "goodwill", threat: "they turn away", aim: "own", thing: null, own });
const roll = (t: Trip, r: SceneTry, die: number) => {
  const tt = { ...t, hand: { ...t.hand!, dice: [die, 2, 2] } };
  return spendTry(tt, priceTry(tt, r)!, 0)!;
};
const HERO = { name: "Wren", who: "a courier" };

describe("the book knows what tries have won", () => {
  test("someone won to come along is among those a chapter can be about, with what came with them", () => {
    const t = roll(opened(), ask(ORLA), 19).trip;
    expect(companyNow(t).map((c) => c.name)).toEqual(["Orla"]);
    const m = chapterMaterial(t, "rest", { hero: HERO });
    const orla = m.companions.find((c) => c.name === "Orla");
    expect(orla).toBeDefined();
    expect(orla!.who).toContain("Her boy is left alone by the stove");
    expect(orla!.who).toContain("not come due yet");
    const said = materialSaid(m);
    expect(said).toContain("WHO WALKS WITH THE PLAYER");
    expect(said).toContain("Orla");
    // Won as a companion, she is not also listed as a thing won.
    expect(m.changed.some((c) => c.includes("Orla"))).toBe(false);
  });

  test("something won that is not a companion, and someone set against the player, are told to the writer", () => {
    const debt: OwnRead = { kind: "bond", who: "the toll clerk", change: "The toll clerk owes you a crossing, no questions asked.", size: "small", catch: "He will want the favour returned.", against: "He reports you to the yard.", costs: "goodwill" };
    let t = roll(opened(), ask(debt, "real"), 19).trip;
    const m = chapterMaterial(t, "rest", { hero: HERO });
    expect(m.changed.join(" ")).toContain("owes you a crossing");
    expect(materialSaid(m)).toContain("THAT STAYS TRUE");
    // Two botched asks set someone against the player: that stays true too, and they are someone to write about.
    const grudge: OwnRead = { kind: "side", who: "Maud the lamplighter", change: "Maud takes your side against the yard.", size: "large", catch: "The yard will know.", against: "Maud tells the yard you tried to turn her.", costs: "goodwill" };
    t = roll(t, ask(grudge, "real"), 1).trip;
    const m2 = chapterMaterial(t, "rest", { hero: HERO });
    expect(m2.changed.join(" ")).toContain("Maud the lamplighter is set against the player");
    expect(m2.people.some((p) => p.name === "Maud the lamplighter")).toBe(true);
    expect(chapterWorth(m2)).toBe(true);
  });
});
