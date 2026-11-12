/**
 * Milestone 4: a card read, a hero made from your own words, an adventure built for the card, and the model's three
 * jobs (reader, teller, hero) checked before anything they say is used. Every card here is made up.
 */
import { describe, expect, test } from "bun:test";
import { isChild } from "../src/engine/card/child.js";
import { startMoment } from "../src/engine/moment.js";
import { CLASSES, checkSpread, makeHero, rulesHero, STAT_BUDGET } from "../src/engine/hero.js";
import { handPrice, budgetAt, stockOffer, STOCK_CALLINGS } from "../src/engine/abilities.js";
import { applyWords, buildAdventure, buildMessages, fallbackAdventure, foreignName, FRIEND, SKELETONS, wordsOf } from "../src/game/build.js";
import { cardText, courtable, looksLikeWorld, tropeRead, tropesFor, unmacro, WORLD_SURE, worldScore, type CardInfo } from "../src/game/card.js";
import { asksRomance, greeting, NO_ROMANCE } from "../src/game/session.js";
import { firstJson, heroMessages, parseHero, parseRead, parseTell, readMessages, tellMessages } from "../src/game/prompts.js";
import { BRIDGE, YOU } from "../preview/mock.js";

const MAREN: CardInfo = {
  name: "Maren Vell",
  description: "{{char}} is a lamplighter in the river town of Coldharbour, thirty-one, quick-tongued and stubborn. She owes {{user}} a favour.",
  personality: "Wry, loyal.",
  firstMessage: "Maren swings down from her ladder.",
};
const PIP: CardInfo = { name: "Pip", description: "Pip is a ten-year-old boy who runs errands at the docks." };
const HANA: CardInfo = { name: "하나", description: "하나 is a potter of twenty-eight who keeps a shop by the sea." };

describe("a card", () => {
  test("its macros are filled the way the game reads them", () => {
    expect(unmacro("{{char}} smiles at {{user}}. <BOT> waits. {{random::a,b}}", "Maren")).toBe("Maren smiles at you. Maren waits. ");
    const t = cardText(MAREN);
    expect(t.startsWith("Name: Maren Vell")).toBe(true);
    expect(t).toContain("Maren Vell is a lamplighter");
    expect(t).not.toContain("{{");
  });

  test("a courtship is never offered for anyone the card reads as a child", () => {
    expect(courtable(MAREN)).toBe(true);
    expect(courtable(PIP)).toBe(false);
    expect(tropesFor(PIP)).toEqual(["rescue"]);
    expect(tropesFor(MAREN)).toEqual(["rescue", "courtship"]);
  });

  test("the child rule: narrow, and decided by an age when the card gives one", () => {
    expect(isChild("She is a fifteen-year-old apprentice.")).toBe(true);
    expect(isChild("Age: 14. Loves kites.")).toBe(true);
    expect(isChild("A child who sells matches.")).toBe(true);
    // Other people, not the character: a dislike, a list of a world's folk.
    expect(isChild("Likes: tea, rain. Dislikes: children, loud bars.")).toBe(false);
    expect(isChild("The city is full of nobles, children, and elders.")).toBe(false);
    // An adult with a back story.
    expect(isChild("Age 18. Years of training turned an openly cheerful child into a guarded one.")).toBe(false);
    expect(isChild("She is 30 and has two children.")).toBe(false);
  });

  test("which story a line asks for", () => {
    expect(tropeRead("a rescue, please", ["rescue", "courtship"])).toBe("rescue");
    expect(tropeRead("I want to win her heart", ["rescue", "courtship"])).toBe("courtship");
    expect(tropeRead("I want to win her heart", ["rescue"])).toBeNull();
    expect(tropeRead("hmm", ["rescue", "courtship"])).toBeNull();
  });
});

describe("a hero from your own words", () => {
  test("the points always add up, whatever a model says", () => {
    const six = { brawn: 3, grace: 2, charm: 1, guile: 0, wits: 1, sense: 1 };
    expect(checkSpread(six)).toEqual(six);
    expect(checkSpread({ brawn: 4, grace: 4, charm: 0, guile: 0, wits: 0, sense: 1 })).toBeNull();
    expect(checkSpread({ brawn: 5, grace: 1, charm: 0, guile: 0, wits: 1, sense: 1 })).toBeNull();
    expect(checkSpread({ brawn: 1.5, grace: 1.5, charm: 1, guile: 1, wits: 2, sense: 1 })).toBeNull();
    // The seventh only where the world has it, and then the seven add up to one more.
    expect(checkSpread({ ...six, power: 1 })).toBeNull();
    expect(checkSpread({ ...six, power: 1 }, true)).toEqual({ ...six, power: 1 });
    expect(checkSpread(six, true)).toBeNull();
    for (const c of CLASSES) expect(Object.values(c.stats).reduce((a, b) => a + b, 0)).toBe(STAT_BUDGET);
    const h = makeHero("sellsword", { stats: { brawn: 9 } });
    expect(h.sheet.stats).toEqual(CLASSES.find((c) => c.id === "sellsword")!.stats);
    expect(h.abilities.length).toBe(3);
    expect(h.abilities.filter((a) => a.does === "flourish").length).toBe(1);
    expect(h.calling.name.length).toBeGreaterThan(0);
  });

  test("without a model, the kind of person is read from the words", () => {
    const h = rulesHero("I am Bram, a sellsword who has fought in two wars");
    expect(h.cls).toBe("sellsword");
    expect(h.name).toBe("Bram");
    expect(h.who.startsWith("You are Bram")).toBe(true);
  });

  test("a model's hero is checked", () => {
    const h = parseHero('{"class":"scholar","name":"Wim","stats":{"brawn":0,"grace":1,"charm":1,"guile":1,"wits":3,"sense":2},"who":"You are Wim, who reads too much."}');
    expect(h?.cls).toBe("scholar");
    expect(h?.name).toBe("Wim");
    expect(parseHero("no json")).toBeNull();
    expect(heroMessages("I am Wim")[1]!.content).toContain("I am Wim");
    // With no calling or abilities written, the stock ones of its kind are dealt.
    expect(h!.abilities.map((a) => a.name)).toEqual(STOCK_CALLINGS.scholar!.hand.map((a) => a.name));
  });

  test("a level-up offers two abilities you do not have, within the next level's budget", () => {
    const have = STOCK_CALLINGS.courier!.hand;
    const two = stockOffer(have, 1, "seed");
    expect(two.length).toBe(2);
    expect(two.some((a) => have.some((h) => h.name === a.name))).toBe(false);
    for (const a of two) expect(handPrice([...have, a])).toBeLessThanOrEqual(budgetAt(2) + 1);
  });
});

describe("an adventure built for a card", () => {
  test("the model is asked for words only, with a card title to write at every stop, and the clock", () => {
    const [sys, user] = buildMessages(MAREN, "courtship");
    expect(sys!.content).toContain("keep every key exactly as it is");
    expect(user!.content).toContain('"face": "<the title on its card');
    expect(user!.content).toContain("The one being courted is here");
    expect(user!.content).toContain("THE CLOCK: it starts at 2:00 pm and is lost at 12:00 am (midnight)");
    expect(user!.content).not.toContain('"called"');
    // The words handed over carry no deadline name to change: the hour and its name stay together.
    expect((wordsOf(SKELETONS.courtship).deadline as Record<string, unknown>).name).toBeUndefined();
  });

  test("a romance asked for is heard as one, so the narrator can say why there is none", () => {
    expect(asksRomance("a romance. i got reincarnated as a mimic and i'm in love with the adventurer")).toBe(true);
    expect(asksRomance("a heist, to take back the crown")).toBe(false);
    expect(NO_ROMANCE).toContain("reads as young");
  });

  test("what the player asked for and who they said they are both go to the builder", () => {
    const [, user] = buildMessages(MAREN, "rescue", { asked: "a rescue where everything is stranger than it looks", who: "an isekai'd office worker who knows nothing of this world" });
    expect(user!.content).toContain("WHAT THE PLAYER ASKED FOR");
    expect(user!.content).toContain("stranger than it looks");
    expect(user!.content).toContain("WHO THE PLAYER IS");
    expect(user!.content).toContain("isekai'd office worker");
  });

  test("a name in another script is asked for in English letters too, and used", () => {
    expect(foreignName("하나")).toBe(true);
    expect(foreignName("Zoë O'Hara")).toBe(false);
    expect(buildMessages(HANA, "rescue")[1]!.content).toContain('Add a key "called"');
    const built = applyWords("rescue", HANA, { called: "Hana" }, "s").adv;
    expect(built.companions.find((c) => c.id === FRIEND)!.name).toBe("Hana");
    expect(applyWords("rescue", HANA, {}, "s").adv.companions.find((c) => c.id === FRIEND)!.name).toBe("하나");
  });

  test("every number, id and road stays the skeleton's; a unit that does not check is the skeleton's whole", () => {
    const base = SKELETONS.rescue;
    const raw = {
      title: "The Lamps of Coldharbour",
      goal: "Relight the lamps before teatime.", won: "The lamps burn again.", 
      places: { mill: "Wick Street", abbey: "The Chapel of Quiet Forms" },
      stops: { mill: { situation: "A lamp is out and the street is <b>dark</b>.", teaser: "a dark street" } },
      deadline: { name: "teatime", lost: "The lamps go out for good." },
      friend: { who: "Maren, the lamplighter", good_at: "grace", likes: "sneak", dislikes: "sneak" },
    };
    const { adv, used, of } = applyWords("rescue", MAREN, raw, "s");
    expect(adv.title).toBe("The Lamps of Coldharbour");
    expect(adv.stops.find((s) => s.id === "mill")!.name).toBe("Wick Street");
    // A long place name is still a name.
    expect(adv.stops.find((s) => s.id === "abbey")!.name).toBe("The Chapel of Quiet Forms");
    // Markup is refused: the skeleton's words stand.
    expect(adv.stops.find((s) => s.id === "mill")!.situation).toBe(base.stops.find((s) => s.id === "mill")!.situation);
    expect(adv.deadline).toEqual({ ...base.deadline, lost: "The lamps go out for good." });
    expect(adv.roads).toEqual(base.roads);
    adv.stops.forEach((s, i) => expect(s.ways).toEqual(base.stops[i]!.ways));
    const friend = adv.companions.find((c) => c.id === FRIEND)!;
    expect(friend.name).toBe("Maren Vell");
    expect(friend.likes).toBe("sneak");
    expect(friend.dislikes).not.toBe("sneak");
    expect(adv.party).toEqual([FRIEND]);
    // The skeleton's own hero belongs to its made-up world, and is never kept.
    expect(adv.who).not.toBe(base.who);
    expect(used).toBeGreaterThan(0);
    expect(used).toBeLessThan(of);
    // The frame was written whole; the half-written stop is the made-up one, by its new name.
    expect(adv.goal).toBe("Relight the lamps before teatime.");
    const fresh = applyWords("rescue", MAREN, { ...raw, goal: undefined }, "s");
    expect(fresh.missing).toContain("frame");
    expect(fresh.adv.title).toBe(base.title);
    expect(fresh.missing).toContain("stop:mill");
  });

  test("a courtship puts the card's character in the beloved's part, and falls back to a rescue for a child", async () => {
    expect(fallbackAdventure("courtship", MAREN, "s").courted!.name).toBe("Maren Vell");
    expect(JSON.stringify(fallbackAdventure("courtship", MAREN, "s"))).not.toContain(SKELETONS.courtship.courted!.name);
    const kid = await buildAdventure(null, PIP, "courtship", "s");
    expect(kid.trope).toBe("rescue");
    expect(kid.courted).toBeUndefined();
  });

  test("a world card is told from a person, and nobody in its story is called by its name", () => {
    const VALE: CardInfo = {
      name: "Thornvale",
      description: "{{char}} is the narrator of Thornvale, a valley kingdom of river towns and old forests. {{char}} plays all the other characters.\nNPCs:\n- Edda, a ferrywoman\n- Lord Asher, who keeps the bridge\nFactions: the Guild, the Wardens",
    };
    expect(looksLikeWorld(VALE)).toBe(true);
    expect(looksLikeWorld(MAREN)).toBe(false);
    expect(looksLikeWorld(HANA)).toBe(false);
    // A game master's brief for a game is a world, sure enough that a model calling it one person is not believed.
    const TOWER: CardInfo = { name: "Tower of Player V2", description: "## Simulation: Tower of Player\n### AI Responsibilities:\n- you control your character's speech.\n### Scenario:\n- Events: exploration, floor missions, guild politics.\n### Objectives for {{user}}:\n- Explore new floors.\n### Mechanics:\n- Combat: descriptive action." };
    expect(worldScore(TOWER)).toBeGreaterThanOrEqual(WORLD_SURE);
    expect(worldScore(MAREN)).toBeLessThan(WORLD_SURE);
    const world: CardInfo = { ...VALE, world: true };
    const [sys, user] = buildMessages(world, "rescue");
    expect(sys!.content).toContain("describes a world or scenario");
    expect(user!.content).toContain('nobody in the story is called "Thornvale"');
    expect(user!.content).toContain('"name" is their name');
    // The companion is the person the model names from that world, never the card.
    const named = applyWords("rescue", world, { friend: { name: "Edda", who: "a ferrywoman", good_at: "wits", likes: "talk", dislikes: "force" } }, "s").adv;
    expect(named.companions.find((c) => c.id === FRIEND)!.name).toBe("Edda");
    const blank = applyWords("rescue", world, {}, "s").adv.companions.find((c) => c.id === FRIEND)!;
    expect(blank.name).not.toBe("Thornvale");
    expect(blank.who).not.toContain("Thornvale");
    // A courtship's beloved: the model's choice, else the made-up one keeps their own name.
    expect(applyWords("courtship", world, { courted: { name: "Lord Asher", who: "keeper of the bridge" } }, "s").adv.courted!.name).toBe("Lord Asher");
    expect(fallbackAdventure("courtship", world, "s").courted!.name).toBe(SKELETONS.courtship.courted!.name);
    expect(JSON.stringify(fallbackAdventure("rescue", world, "s"))).not.toContain("Thornvale");
  });

  test("a world card's greeting sets the story there", () => {
    const world: CardInfo = { name: "Thornvale", description: "a valley kingdom", world: true };
    const said = greeting(world, ["rescue", "romance"]).join(" ");
    expect(said).toContain("set in Thornvale");
    expect(said).not.toContain("Thornvale cares");
    expect(said).not.toContain("Thornvale's heart");
    expect(greeting(MAREN, ["rescue"]).join(" ")).toContain("Maren Vell is in it");
  });

  test("a model that answers badly twice gets the made-up adventure, not a broken one", async () => {
    let asked = 0;
    const adv = await buildAdventure(async () => (asked++, "I cannot help with that."), MAREN, "rescue", "s");
    expect(asked).toBe(2);
    expect(adv.stops.length).toBe(SKELETONS.rescue.stops.length);
  });
});

describe("the reader and the teller", () => {
  test("the reader is shown only what can be tried now", () => {
    const m = { ...startMoment(BRIDGE, YOU, "t"), closed: ["talk" as const] };
    const user = readMessages("I ask nicely", m)[1]!.content;
    expect(user).not.toMatch(/Ways there: [^\n]*talk/);
    expect(parseRead('{"way":"none"}', m)).toBe("none");
    expect(parseRead('```json\n{"way":"sneak","stat":"grace","lever":null,"attempt":"you creep by"}\n```', m)).toEqual({ way: "sneak", stat: "grace", lever: null, attempt: "you creep by" });
    expect(firstJson('Sure! {"a": {"b": 1}} trailing')).toEqual({ a: { b: 1 } });
  });

  test("the teller is given the player's own words, whole, and what must be true", () => {
    const line = "I hand the old woman her lost bead and ask, as warmly as I can, whether she would let me by to see the glassblower";
    const msgs = tellMessages({} as never, { name: "The Stall", situation: "An old woman minds a stall." } as never, "It works. They are through.", false, { who: "You are Bram.", with: ["Maren, a lamplighter"], line });
    expect(msgs[1]!.content).toContain(line);
    expect(msgs[1]!.content).toContain("With them: Maren, a lamplighter.");
    expect(parseTell('Narrator: "The bar lifts, and you are through."')).toBe("The bar lifts, and you are through.");
    expect(parseTell("ok")).toBeNull();
  });
});

describe("the reader judges what a failure brings down", () => {
  test("its stake and threat are kept when they check, and dropped when they do not", async () => {
    const { parseRead: parseReader } = await import("../src/game/prompts.js");
    const { startMoment } = await import("../src/engine/moment.js");
    const { BRIDGE, YOU } = await import("../preview/mock.js");
    const m = startMoment(BRIDGE, YOU, "t");
    const r = parseReader('{"way":"talk","stat":"charm","stake":"health","threat":"the pack closes in and bites"}', m) as { stake?: string; threat?: string };
    expect(r.stake).toBe("health");
    expect(r.threat).toBe("the pack closes in and bites");
    const bad = parseReader('{"way":"talk","stake":"soul","threat":"x"}', m) as { stake?: string; threat?: string };
    expect(bad.stake).toBeUndefined();
    expect(bad.threat).toBeUndefined();
  });
});
