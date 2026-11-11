/**
 * The skeleton of abilities (docs/SYSTEMS.md): verbs the code owns, words a model writes, a price every ability pays
 * out of a budget, marks a good try leaves, and the grade a line earns. Every name here is made up.
 */
import { describe, expect, test } from "bun:test";
import { COURIER, RESCUE } from "../src/content/adventures.js";
import { budgetAt, capAt, fitAbility, fitHand, handPrice, priceOf, readAbility, shapeOf, STOCK, STOCK_CALLINGS, storeAt, VERB_MAX, type Ability } from "../src/engine/abilities.js";
import { arrive, attempt, MARKS_MAX, rest, startTrip, takeAbility, useAbility, type Trip } from "../src/engine/adventure.js";
import { d20Odds, d20OddsBest, rollD20, seededRng } from "../src/engine/dice.js";
import { nameCheck, type Read } from "../src/engine/moment.js";
import { usedSaid } from "../src/engine/tell-adventure.js";
import { checkedGrade, earnedGrade, pushes, rulesReading } from "../src/meaning/read.js";
import { offerMessages, parseHero, parseOffer, parseRead, readMessages } from "../src/game/prompts.js";
import { plainReading } from "../src/game/minds.js";

const A = (o: Partial<Ability> & Pick<Ability, "does">): Ability => ({ id: o.name?.toLowerCase().replace(/\W+/g, "-") ?? o.does, name: "Test", looks: "It looks like something.", much: 1, ways: [], tags: [], often: "always", store: false, card: "token", ...o });

const TRICK = A({ id: "stew", name: "Kitchen Witchery", does: "flourish", looks: "You can make any food taste of anything you like." });
const TONGUE = A({ id: "tongue", name: "Honeyed Tongue", does: "ease", ways: ["talk"], often: "stop" });
const MEND = A({ id: "salve", name: "Pocket Salve", does: "mend", of: "health", often: "stop" });
const LUCK = A({ id: "luck", name: "Lucky Coin", does: "edge", store: true });

/** The trip with its stop's next throw showing `face`. */
function withFace(t: Trip, face: number): Trip {
  const m = t.facing!.moment;
  for (let i = 0; i < 5000; i++) {
    const seed = `s${i}`;
    if (rollD20(seededRng(`${seed}:${m.stop.id}:try:${m.tries}`)) === face) return { ...t, facing: { ...t.facing!, moment: { ...m, seed } } };
  }
  throw new Error(`no seed for ${face}`);
}
const atMill = (abilities: Ability[] = [TRICK, TONGUE, MEND]): Trip => arrive(startTrip(RESCUE, COURIER, "abl", abilities), "mill")!.trip;

describe("what an ability costs", () => {
  test("the price is the verb's, times how strong, by how often", () => {
    expect(priceOf(TRICK)).toBe(0);
    expect(priceOf(A({ does: "ease", ways: ["talk"], often: "stop" }))).toBe(1);
    expect(priceOf(A({ does: "ease", ways: ["talk"], often: "always" }))).toBe(2);
    expect(priceOf(A({ does: "ease", ways: ["talk"], often: "always", much: 2 }))).toBe(4);
    // Paid from the store, it is not doubled; narrow tags take one off; a limit in words takes one off.
    expect(priceOf(A({ does: "ward", ways: ["force"], store: true }))).toBe(2);
    expect(priceOf(A({ does: "ease", ways: ["talk"], often: "always", tags: ["a lock"] }))).toBe(1);
    // Anything at all, with no ways and no tags, costs more.
    expect(priceOf(A({ does: "ease", often: "stop" }))).toBe(3);
    // Nothing but a trick is ever free.
    expect(priceOf(A({ does: "ease", ways: ["talk"], often: "story", tags: ["a lock"], limit: "only at night" }))).toBe(1);
  });

  test("the budget and the store grow with the level", () => {
    expect([1, 2, 3, 4].map(budgetAt)).toEqual([6, 8, 10, 12]);
    expect([1, 2, 3, 4].map(capAt)).toEqual([3, 4, 4, 5]);
    expect([1, 2, 3].map(storeAt)).toEqual([3, 4, 5]);
  });

  test("an ability too dear is weakened until it fits, never thrown out for that", () => {
    const big = A({ name: "Iron Will", does: "ease", ways: ["force"], much: 3, often: "always" });
    expect(priceOf(big)).toBe(6);
    const fit = fitAbility(big, 3)!;
    expect(priceOf(fit)).toBeLessThanOrEqual(3);
    expect(fit.name).toBe("Iron Will");
    expect(fit.does).toBe("ease");
  });

  test("a hand keeps at most two tricks, and fits the budget", () => {
    const hand = fitHand([TRICK, { ...TRICK, id: "t2", name: "Other" }, { ...TRICK, id: "t3", name: "Third" }, A({ does: "slip", much: 1 }), A({ does: "edge", ways: ["talk"] })], 1);
    expect(hand.filter((a) => a.does === "flourish").length).toBeLessThanOrEqual(2);
    expect(handPrice(hand)).toBeLessThanOrEqual(budgetAt(1));
  });

  test("every stock hand fits, with exactly one trick, and every stock ability prices", () => {
    for (const c of Object.values(STOCK_CALLINGS)) {
      expect(handPrice(c.hand)).toBeLessThanOrEqual(budgetAt(1));
      expect(c.hand.filter((a) => a.does === "flourish").length).toBe(1);
      for (const a of c.hand) expect(priceOf(a)).toBeLessThanOrEqual(capAt(1));
    }
    for (const a of STOCK) expect(Number.isFinite(priceOf(a))).toBe(true);
  });

  test("a model's ability is read and checked: a verb we do not have is dropped, strength is held to the verb's", () => {
    expect(readAbility({ name: "Odd Thing", looks: "It flies.", does: "fly", much: 1, ways: [], tags: [], often: "always" }, "x")).toBeNull();
    const a = readAbility({ name: "Steady Hand", looks: "Your hand does not shake.", does: "edge", much: 3, ways: ["sneak", "nowhere"], tags: ["a lock", 7], often: "stop", store: false }, "x")!;
    expect(a.much).toBe(VERB_MAX.edge);
    expect(a.ways).toEqual(["sneak"]);
    expect(a.tags).toEqual(["a lock"]);
    expect(shapeOf(a)).toBe("knack");
  });
});

describe("abilities on a try", () => {
  test("an ability for the way makes the try easier, without being named", () => {
    const t = atMill();
    const m = t.facing!.moment;
    const plain = nameCheck({ ...m, abilities: [] }, { way: "talk", stat: "charm", lever: null })!;
    const helped = attempt(withFace(t, 11), { way: "talk", stat: "charm", lever: null })!;
    expect(helped.outcome.check.ability?.id).toBe("tongue");
    expect(helped.outcome.check.target).toBeLessThan(plain.target);
  });

  test("two dice, the better counts: the odds are better, and paid from the store", () => {
    expect(d20OddsBest(2, 12, 7).success).toBeGreaterThan(d20Odds(2, 12, 7).success);
    const t = atMill([TRICK, LUCK]);
    const read: Read = { way: "sneak", stat: "grace", lever: null, ability: "luck" };
    const c = nameCheck(t.facing!.moment, read)!;
    expect(c.edge).toBe(true);
    const turn = attempt(t, read)!;
    expect(turn.outcome.naturals?.length).toBe(2);
    expect(turn.trip.sheet.store).toBe(t.sheet.store! - 1);
  });

  test("giving it everything costs one from the store, and makes it a step easier", () => {
    const t = atMill([TRICK]);
    const m = t.facing!.moment;
    const plain = nameCheck(m, { way: "force", stat: "brawn", lever: null })!;
    const pushed = nameCheck(m, { way: "force", stat: "brawn", lever: null, push: true })!;
    expect(pushed.pushed).toBe(true);
    expect(pushed.target).toBeLessThan(plain.target);
    expect(pushes("I give it everything I have and shove the door")).toBe(true);
    expect(pushes("I shove the door")).toBe(false);
  });

  test("resting fills the store again", () => {
    const t = atMill([TRICK, LUCK]);
    const spent = attempt(withFace(t, 20), { way: "sneak", stat: "grace", lever: null, ability: "luck" })!.trip;
    const hurt = { ...spent, sheet: { ...spent.sheet, health: 2 } };
    if (!hurt.facing) expect(rest(hurt)!.trip.sheet.store).toBe(storeAt(1));
  });

  test("a level-up adds the ability and one to the store", () => {
    const t = startTrip(RESCUE, COURIER, "x", [TRICK]);
    const up = takeAbility(t, TONGUE);
    expect(up.level).toBe(2);
    expect(up.abilities.map((a) => a.id)).toEqual(["stew", "tongue"]);
    expect(up.sheet.store).toBe(t.sheet.store! + 1);
  });
});

describe("marks", () => {
  test("a try that goes better than hoped always leaves one, and it can be leaned on at the next stop", () => {
    const t = atMill([TRICK]);
    const turn = attempt(withFace(t, 20), { way: "talk", stat: "charm", lever: null, mark: "Orla owes you a favour" })!;
    expect(turn.marked?.name).toBe("orla owes you a favour");
    expect(turn.trip.marks.length).toBe(1);
    const next = arrive(turn.trip, "bridge")!.trip;
    expect(next.facing!.moment.stop.levers.some((l) => l.id === turn.marked!.id)).toBe(true);
  });

  test("a plain success leaves none; one that used what was there does", () => {
    const t = atMill([TRICK]);
    const read: Read = { way: "talk", stat: "charm", lever: null };
    const plain = attempt(withFace(t, 17), { ...read, grade: "plain" })!;
    expect(plain.outcome.tier).toBe("success");
    expect(plain.marked).toBeNull();
    expect(attempt(withFace(t, 17), { ...read, grade: "grounded" })!.marked).not.toBeNull();
  });

  test("you carry at most a few, the oldest going first", () => {
    let t = atMill([TRICK]);
    const marks = Array.from({ length: MARKS_MAX + 1 }, (_, i) => ({ id: `mark:old${i}`, way: "talk" as const, name: `old mark ${i}`, words: [], mark: true }));
    t = { ...t, marks: marks.slice(0, MARKS_MAX) };
    const turn = attempt(withFace(t, 20), { way: "sneak", stat: "grace", lever: null })!;
    expect(turn.trip.marks.length).toBe(MARKS_MAX);
    expect(turn.trip.marks.some((l) => l.id === "mark:old0")).toBe(false);
  });
});

describe("abilities used without a die", () => {
  test("a trick used well, towards a way past, lays a mark here, once a stop", () => {
    const t = atMill();
    const u = useAbility(t, { use: "stew", way: "talk", grade: "grounded", mark: "Orla's bread tastes of honey again" })!;
    expect(u.effect).toBe("mark");
    const m = u.trip.facing!.moment;
    expect(m.stop.levers.some((l) => l.id === u.mark!.id && l.way === "talk")).toBe(true);
    expect(u.trip.sheet.hour).toBeGreaterThan(t.sheet.hour);
    // Again at the same stop: it works, as it always does, but leaves nothing more.
    expect(useAbility(u.trip, { use: "stew", way: "talk", grade: "grounded" })!.effect).toBe("nothing");
    expect(usedSaid(u)[0]).toContain("a step easier");
  });

  test("a trick used plainly does nothing in the rules", () => {
    expect(useAbility(atMill(), { use: "stew", way: "talk", grade: "plain" })!.effect).toBe("nothing");
    expect(useAbility(atMill(), { use: "stew", way: null, grade: "grounded" })!.effect).toBe("nothing");
  });

  test("a mend gives back what it says, never more than you can carry", () => {
    const t = atMill();
    const hurt = { ...t, sheet: { ...t.sheet, health: 2 }, facing: { ...t.facing!, moment: { ...t.facing!.moment, sheet: { ...t.facing!.moment.sheet, health: 2 } } } };
    const u = useAbility(hurt, { use: "salve", way: null })!;
    expect(u.effect).toBe("mend");
    expect(u.trip.sheet.health).toBe(3);
    expect(useAbility(u.trip, { use: "salve", way: null })!.effect).toBe("spent");
  });

  test("an ability that is for a try says so, and costs nothing", () => {
    const t = atMill();
    const u = useAbility(t, { use: "tongue", way: "talk" })!;
    expect(u.effect).toBe("try");
    expect(u.trip).toBe(t);
  });
});

describe("the grade a line earns", () => {
  test("code holds a reader's grade to what the line really uses", () => {
    const m = atMill().facing!.moment;
    expect(earnedGrade("I talk to her nicely", m)).toBe("plain");
    expect(earnedGrade("I offer to fix her cart", m)).toBe("grounded");
    expect(earnedGrade("I fix her cart and walk the footpath along the race", m)).toBe("inspired");
    expect(checkedGrade("inspired", "I talk to her with all the poetry of the ages, at great length", m)).toBe("plain");
    expect(checkedGrade("grounded", "I offer to fix her cart and take the footpath", m)).toBe("grounded");
    // A companion or a place passed is real too.
    expect(earnedGrade("I remind her that Dov is waiting", m, ["Dov"])).toBe("grounded");
  });

  test("a line that names a trick is read as a use; one that names a knack goes its way", () => {
    const m = atMill().facing!.moment;
    expect(rulesReading("I use my kitchen witchery on her bread", m)).toMatchObject({ use: "stew" });
    expect(plainReading("I use my kitchen witchery on her bread", m)).toMatchObject({ use: "stew" });
    expect(rulesReading("my honeyed tongue does the work", m)).toMatchObject({ way: "talk", ability: "tongue" });
  });
});

describe("the models' words, checked", () => {
  test("the reader is told the abilities, and its answer is checked", () => {
    const m = atMill().facing!.moment;
    expect(readMessages("hello", m)[1]!.content).toContain("Kitchen Witchery");
    expect(parseRead('{"way":"none","ability":"stew","setup":true,"helps":"talk","grade":"grounded","mark":"Her bread tastes of honey"}', m)).toEqual({ use: "stew", way: "talk", grade: "grounded", mark: "Her bread tastes of honey" });
    expect(parseRead('{"way":"talk","stat":"charm","lever":"cart","ability":"tongue","push":true,"grade":"inspired"}', m)).toMatchObject({ way: "talk", ability: "tongue", push: true, grade: "inspired" });
    expect(parseRead('{"way":"talk","stat":"charm","ability":"nonsense","grade":"divine"}', m)).toEqual({ way: "talk", stat: "charm", lever: null });
  });

  test("a written hero gets a calling and three abilities, weakened to fit, with the stock filling gaps", () => {
    const h = parseHero(
      JSON.stringify({
        class: "player",
        name: "Ysolde",
        stats: { brawn: 0, grace: 1, charm: 3, guile: 2, wits: 1, sense: 1 },
        who: "You are Ysolde, a lute player with debts.",
        calling: { name: "Tavern Lutenist", line: "You play for your supper.", leans: ["charm", "guile"], store: "verve", fault: "You cannot leave a debt alone." },
        abilities: [
          { name: "Hum of Rooms", looks: "You hum and a room goes quiet to listen.", does: "flourish", much: 1, ways: [], tags: [], often: "always", store: false },
          { name: "Encore", looks: "You make them want more.", does: "ease", much: 3, ways: ["talk"], tags: [], often: "always", store: false },
          { name: "Lucky Strings", looks: "A string never snaps on you.", does: "slip", much: 1, ways: [], tags: [], often: "always", store: false },
        ],
      }),
    )!;
    expect(h.calling.name).toBe("Tavern Lutenist");
    expect(h.calling.store).toBe("verve");
    expect(h.abilities.length).toBe(3);
    expect(h.abilities[0]!.name).toBe("Hum of Rooms");
    expect(handPrice(h.abilities)).toBeLessThanOrEqual(budgetAt(1));
    for (const a of h.abilities) expect(priceOf(a)).toBeLessThanOrEqual(capAt(1));
  });

  test("a level-up is written from what the hero did, and the offer is checked", () => {
    const [sys, user] = offerMessages({ who: "You are Ysolde." }, [TRICK], ["talked your way past at Orla's Mill"], 1, 3);
    expect(sys!.content).toContain("at most 3");
    expect(user!.content).toContain("Orla's Mill");
    const got = parseOffer(
      JSON.stringify({ abilities: [
        { name: "Mill Friend", looks: "Millers know your face.", does: "ease", much: 2, ways: ["talk"], tags: [], often: "always", store: false },
        { name: "Kitchen Witchery", looks: "Same as before.", does: "flourish", much: 1, ways: [], tags: [], often: "always", store: false },
        { name: "Quiet Step", looks: "Boards do not creak for you.", does: "ease", much: 1, ways: ["sneak"], tags: [], often: "stop", store: false },
      ] }),
      [TRICK],
      3,
      "x",
    );
    expect(got.map((a) => a.name)).toEqual(["Mill Friend", "Quiet Step"]);
    for (const a of got) expect(priceOf(a)).toBeLessThanOrEqual(3);
  });
});
