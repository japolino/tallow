/**
 * Milestone 4: a card read, a hero made from your own words, an adventure built for the card, and the model's three
 * jobs (reader, teller, hero) checked before anything they say is used. Every card here is made up.
 */
import { describe, expect, test } from "bun:test";
import { isChild } from "../src/engine/card/child.js";
import { startMoment } from "../src/engine/moment.js";
import { CLASSES, checkSpread, makeHero, perkOffer, PERKS, rulesHero, STAT_BUDGET } from "../src/engine/hero.js";
import { applyWords, buildAdventure, buildMessages, fallbackAdventure, foreignName, FRIEND, SKELETONS, wordsOf } from "../src/game/build.js";
import { cardText, courtable, tropeRead, tropesFor, unmacro, type CardInfo } from "../src/game/card.js";
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
    expect(checkSpread({ brawn: 3, cunning: 1, charm: 1, wits: 1 })).toEqual({ brawn: 3, cunning: 1, charm: 1, wits: 1 });
    expect(checkSpread({ brawn: 4, cunning: 4, charm: 0, wits: 0 })).toBeNull();
    expect(checkSpread({ brawn: 5, cunning: 1, charm: 0, wits: 0 })).toBeNull();
    expect(checkSpread({ brawn: 1.5, cunning: 1.5, charm: 1, wits: 2 })).toBeNull();
    for (const c of CLASSES) expect(Object.values(c.stats).reduce((a, b) => a + b, 0)).toBe(STAT_BUDGET);
    const h = makeHero("sellsword", { stats: { brawn: 9 } });
    expect(h.sheet.stats).toEqual(CLASSES.find((c) => c.id === "sellsword")!.stats);
    expect(h.perks.length).toBe(1);
  });

  test("without a model, the kind of person is read from the words", () => {
    const h = rulesHero("I am Bram, a sellsword who has fought in two wars");
    expect(h.cls).toBe("sellsword");
    expect(h.name).toBe("Bram");
    expect(h.who.startsWith("You are Bram")).toBe(true);
  });

  test("a model's hero is checked", () => {
    const h = parseHero('{"class":"scholar","name":"Wim","stats":{"brawn":0,"cunning":2,"charm":1,"wits":3},"who":"You are Wim, who reads too much."}');
    expect(h?.cls).toBe("scholar");
    expect(h?.name).toBe("Wim");
    expect(parseHero("no json")).toBeNull();
    expect(heroMessages("I am Wim")[1]!.content).toBe("I am Wim");
  });

  test("a level-up offers two knacks you do not have, for different ways when it can", () => {
    const two = perkOffer(["silver"], "seed");
    expect(two.length).toBe(2);
    expect(two.some((p) => p.id === "silver")).toBe(false);
    expect(two[0]!.way).not.toBe(two[1]!.way);
    expect(perkOffer(PERKS.map((p) => p.id), "seed")).toEqual([]);
  });
});

describe("an adventure built for a card", () => {
  test("the model is asked for words only, with every stop's card and the clock", () => {
    const [sys, user] = buildMessages(MAREN, "courtship");
    expect(sys!.content).toContain("keep every key exactly as it is");
    expect(user!.content).toContain('Its card is "The Beloved"');
    expect(user!.content).toContain("The one being courted is here");
    expect(user!.content).toContain("THE CLOCK: it starts at 2:00 pm and is lost at 12:00 am (midnight)");
    expect(user!.content).not.toContain('"called"');
    // The words handed over carry no deadline name to change: the hour and its name stay together.
    expect((wordsOf(SKELETONS.courtship).deadline as Record<string, unknown>).name).toBeUndefined();
  });

  test("a name in another script is asked for in English letters too, and used", () => {
    expect(foreignName("하나")).toBe(true);
    expect(foreignName("Zoë O'Hara")).toBe(false);
    expect(buildMessages(HANA, "rescue")[1]!.content).toContain('Add a key "called"');
    const built = applyWords("rescue", HANA, { called: "Hana" }, "s").adv;
    expect(built.companions.find((c) => c.id === FRIEND)!.name).toBe("Hana");
    expect(applyWords("rescue", HANA, {}, "s").adv.companions.find((c) => c.id === FRIEND)!.name).toBe("하나");
  });

  test("every number, id and road stays the skeleton's; words that do not check are the skeleton's", () => {
    const base = SKELETONS.rescue;
    const raw = {
      title: "The Lamps of Coldharbour",
      places: { mill: "Wick Street", abbey: "The Chapel of Quiet Forms" },
      stops: { mill: { situation: "A lamp is out and the street is <b>dark</b>.", teaser: "a dark street" } },
      deadline: { name: "teatime", lost: "The lamps go out for good." },
      friend: { who: "Maren, the lamplighter", good_at: "cunning", likes: "sneak", dislikes: "sneak" },
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
  });

  test("a courtship puts the card's character in the beloved's part, and falls back to a rescue for a child", async () => {
    expect(fallbackAdventure("courtship", MAREN, "s").courted!.name).toBe("Maren Vell");
    expect(JSON.stringify(fallbackAdventure("courtship", MAREN, "s"))).not.toContain(SKELETONS.courtship.courted!.name);
    const kid = await buildAdventure(null, PIP, "courtship", "s");
    expect(kid.trope).toBe("rescue");
    expect(kid.courted).toBeUndefined();
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
    expect(parseRead('```json\n{"way":"sneak","stat":"cunning","lever":null,"attempt":"you creep by"}\n```', m)).toEqual({ way: "sneak", stat: "cunning", lever: null, attempt: "you creep by" });
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
