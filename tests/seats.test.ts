/**
 * A full table (docs/MOONSHOT.md, 4): other players and the spotlight. All names here are made up for the tests.
 */
import { describe, expect, test } from "bun:test";
import type { Notice } from "../src/engine/margin.js";
import { asksTable, bestOf, feel, fellowBrief, handedTo, handOver, spoke, spotlight, styleFromWords, talkItOver, vote, wantsToSpeak, whatTheySay, type Fellow, type Moment2 } from "../src/engine/seats.js";

const mira: Fellow = {
  id: "mira",
  name: "Mira",
  who: "a lute player with debts",
  style: "talker",
  stats: { brawn: 0, grace: 1, charm: 4, guile: 2, wits: 1, sense: 0 },
  fault: "cannot leave a debt alone",
  want: "to pay off the moneylender",
  wantWords: ["moneylender", "debt", "coin"],
  attitude: "wary",
  toward: {},
  lastSpoke: -1,
  overruled: 0,
};
const aldous: Fellow = {
  id: "aldous",
  name: "Aldous",
  who: "a lapsed monk with sharp eyes",
  style: "planner",
  stats: { brawn: 1, grace: 1, charm: 0, guile: 0, wits: 3, sense: 3 },
  fault: "will not harm the innocent",
  want: "to find the abbey's lost book",
  wantWords: ["abbey", "book"],
  attitude: "wary",
  toward: {},
  lastSpoke: -1,
  overruled: 0,
};
const at = (turn: number, text: string, more: Partial<Moment2> = {}): Moment2 => ({ turn, text, seed: "s", ...more });

describe("the spotlight", () => {
  test("a scene that touches a player's want makes them keen", () => {
    expect(wantsToSpeak(mira, at(4, "The moneylender's man sits by the fire."))).toBeGreaterThan(wantsToSpeak(mira, at(4, "Rain on the roof.")));
  });

  test("at most one speaks after a line, often nobody", () => {
    const counts = Array.from({ length: 60 }, (_, i) => spotlight([{ ...mira, lastSpoke: i }, { ...aldous, lastSpoke: i }], at(i + 1, "I look round the room.", { seed: `x${i}` })).length);
    expect(Math.max(...counts)).toBeLessThanOrEqual(1);
    expect(counts.filter((c) => c === 0).length).toBeGreaterThan(10);
  });

  test("everyone speaks when you ask the table or before a big decision", () => {
    expect(spotlight([mira, aldous], at(2, "What do you two think?", { asked: true }))).toHaveLength(2);
    expect(asksTable("Right. What do you two think?")).toBe(true);
  });

  test("a player who has said nothing for a while is nudged up", () => {
    expect(wantsToSpeak({ ...mira, lastSpoke: 1 }, at(9, "x"))).toBeGreaterThan(wantsToSpeak(spoke(mira, 8), at(9, "x")));
  });

  test("nobody somewhere else speaks", () => {
    expect(spotlight([{ ...mira, at: "roof" }], at(3, "the moneylender", { asked: true }), "bar")).toEqual([]);
  });
});

describe("what they say", () => {
  const boots: Notice = { id: "boots", stat: "sense", at: 3, says: "wet boots, and it hasn't rained." };
  test("a friend covers what you cannot see", () => {
    expect(whatTheySay(aldous, at(1, "I sit down."), { notices: [boots], yours: [] })).toMatchObject({ kind: "notice", notice: boots });
    expect(whatTheySay(aldous, at(1, "I sit down."), { notices: [boots], yours: ["boots"] }).kind).not.toBe("notice");
  });

  test("they refuse what goes against who they are", () => {
    expect(whatTheySay(aldous, at(1, "I burn the house down")).kind).toBe("refuse");
    expect(whatTheySay({ ...aldous, attitude: "close" }, at(1, "I burn the house down")).kind).not.toBe("refuse");
  });

  test("they catch a lie with their own Sense", () => {
    expect(whatTheySay(aldous, at(1, "I listen to the barkeep"), { lie: { by: 2, who: "the barkeep" } })).toMatchObject({ kind: "advise" });
  });

  test("they offer when the try is plainly theirs", () => {
    expect(whatTheySay(mira, at(1, "I talk to the guard", { way: "talk" })).kind).toBe("offer");
  });

  test("the model is told only what code chose", () => {
    const b = fellowBrief(mira, { kind: "banter", fact: "makes light of it" });
    expect(b).toContain("makes light of it");
    expect(b).toContain("invent no clue");
  });
});

describe("the table decides together", () => {
  test("each says which way they would go; a vote settles it", () => {
    const said = talkItOver([mira, aldous], ["talk", "sneak", "force"]);
    expect(said).toEqual([{ id: "mira", way: "talk" }, { id: "aldous", way: "sneak" }]);
    expect(vote("force", said)).toBe("force");
    expect(vote("force", [{ way: "talk" }, { way: "talk" }])).toBe("talk");
  });

  test("overrule them every time and they go cold; back them and they go close", () => {
    let m = mira;
    for (let i = 0; i < 3; i++) m = feel(m, "overruled");
    expect(m.attitude).toBe("cold");
    expect(feel(mira, "backed").attitude).toBe("friendly");
  });

  test("a try handed over is thrown on their stats", () => {
    expect(handedTo("Mira, you do the talking", [mira, aldous])?.id).toBe("mira");
    expect(handedTo("I talk to him", [mira, aldous])).toBeNull();
    expect(handOver(mira).stats.charm).toBe(4);
    expect(bestOf(aldous)).toBe("wits");
  });

  test("a way of playing from a card's words", () => {
    expect(styleFromWords("a reckless brawler with a soldier's scars")).toBe("brawler");
    expect(styleFromWords("a mischievous trickster")).toBe("joker");
  });
});
