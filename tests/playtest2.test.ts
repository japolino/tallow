/**
 * What the second round of playtests with real cards found (2026-11-11), each fixed and kept fixed: favours that never
 * moved, slips that would not lie together, time that ran without a word, the other side's moves said twice or not at
 * all, the map inked with the made-up world's names, a try handed to a player named on the wrong stat.
 */
import { describe, expect, test } from "bun:test";
import { COURIER } from "../src/content/adventures.js";
import { FAMILIES, drawRecipe } from "../src/content/tropes.js";
import { arrive, startTrip, type Adventure, type Trip } from "../src/engine/adventure.js";
import { furnish } from "../src/engine/furnish.js";
import { layRoad, waysThrough } from "../src/engine/road.js";
import { newSchedule } from "../src/engine/schedule.js";
import { checkSaid } from "../src/engine/tell.js";
import { handStat, worldArrive, worldBegin, worldFirst, worldLine, workedOn } from "../src/engine/world.js";
import { applyWords, buildMessages, fallbackAdventure } from "../src/game/build.js";
import { cardKind, faceOf } from "../src/engine/cards.js";
import type { CardInfo } from "../src/game/card.js";
import { inKit } from "../src/game/session.js";
import { nameCheck } from "../src/engine/moment.js";
import { readAbility } from "../src/engine/abilities.js";
import { abilityRule } from "../src/engine/tell-adventure.js";

const MAREN: CardInfo = { name: "Maren", description: "Maren Vell is a ferrywoman of thirty who keeps the crossing at Dunmore." };
const road = (family: (typeof FAMILIES)[number], seed = "f1"): Adventure => furnish(layRoad(drawRecipe(family, seed, [], [family]), seed, { modern: false }));
const built = (family: (typeof FAMILIES)[number], seed = "f1"): Adventure => fallbackAdventure(road(family, seed), MAREN, seed);
const begin = (a: Adventure, seed = "f1"): Trip => worldBegin(startTrip(a, a.kit ? inKit(COURIER, a.kit) : COURIER, seed));
/** At the first stop on the road that has a person in it. */
const atPerson = (a: Adventure): Trip | null => {
  const path = waysThrough(a).find((p) => p.some((id) => a.stops.find((s) => s.id === id)?.person));
  if (!path) return null;
  const id = path.find((x) => a.stops.find((s) => s.id === x)?.person)!;
  let t: Trip = begin(a);
  for (const step of path) {
    if (step === id) break;
    t = { ...t, at: step, visited: [...t.visited, step] };
  }
  const r = arrive(t, id);
  return r ? worldArrive(r.trip, a.stops.find((s) => s.id === id)!).trip : null;
};
const someone = (): Trip => {
  for (const seed of ["v1", "v2", "v3", "v4", "v5"]) {
    const t = atPerson(built("rescue", seed));
    if (t?.facing) return t;
  }
  throw new Error("no seed reached a person");
};
const personHere = (t: Trip) => {
  const p = t.facing!.stop.person!;
  return t.people?.[p.id] ?? p;
};

describe("a favour asked is a favour that can be done", () => {
  test("doing what they asked works the favour's clock, takes time, and pays when it is full", () => {
    let t = someone();
    const p = personHere(t);
    t = { ...t, people: { ...(t.people ?? {}), [p.id]: { ...p, wants: "her late rent paid before the landlord calls" } } };
    const asked = worldLine(t, "What can I do for you?", t.facing!.moment)!;
    t = asked.trip;
    expect(t.projects?.some((x) => x.id === `favour:${p.id}`)).toBe(true);
    const line = "I go to the landlord and pay off her rent.";
    expect(workedOn(t, line, t.facing!.stop.id)?.id).toBe(`favour:${p.id}`);
    expect(worldFirst(t, line)).toBe(true);
    let filled = 0;
    for (let i = 0; i < 8 && filled < 4; i++) {
      const w = worldLine({ ...t, seed: `${t.seed}:${i}` }, line, t.facing!.moment)!;
      expect(w.lines[0]).toContain("You spend an hour on what was asked of you");
      expect(w.hours).toBe(1);
      expect(w.trip.sheet.hour).toBe(t.sheet.hour + 1);
      t = w.trip;
      filled = t.projects!.find((x) => x.id === `favour:${p.id}`)!.filled;
      if (filled >= 4) expect(w.lines.join(" ")).toContain("hears it is done");
    }
    expect(filled).toBe(4);
    expect(t.people![p.id]!.attitude).toBe("close");
  });

  test("a goal of your own is worked by its words, and named as worked", () => {
    let t = someone();
    t = worldLine(t, "I want to open a shop that sells English breakfasts", t.facing!.moment)!.trip;
    const w = worldLine(t, "I spend the afternoon working on the breakfast shop", t.facing!.moment)!;
    expect(w.lines[0]).toMatch(/^You spend 4 hours on open a shop/);
    expect(w.hours).toBe(4);
  });
});

describe("the people in your way", () => {
  test("pressing someone who has had enough is told so, and is not read as a try", () => {
    const t = someone();
    const p = personHere(t);
    const done = { ...t, visits: { ...(t.visits ?? {}), [t.facing!.stop.id]: { person: p.id, heard: 3, counted: [], ended: true } } } as Trip;
    expect(worldFirst(done, "I press her harder.")).toBe(true);
    expect(worldLine(done, "I press her harder.", done.facing!.moment)!.lines[0]).toContain("has had enough of you");
  });

  test("asking whether someone is lying is a reading, never a lie of your own", () => {
    const t = someone();
    expect(worldFirst(t, "Do you think she was lying about the boat?")).toBe(true);
    const w = worldLine(t, "Do you think she was lying about the boat?", t.facing!.moment)!;
    expect(w.note ?? "").not.toContain("seen through the player's lie");
  });
});

describe("slips laid side by side", () => {
  test("by their numbers, or asked which two when the line does not say", () => {
    const t0 = someone();
    const clues = t0.adv.clues!.filter((c) => !c.false).slice(0, 2);
    const book = { ...t0.book!, slips: clues.map((c) => ({ clue: c.id, state: "seen" as const })) };
    const t = { ...t0, book } as Trip;
    expect(worldFirst(t, "I compare slip 1 and slip 2")).toBe(true);
    expect(worldLine(t, "I compare slip 1 and slip 2", t.facing!.moment)!.lines[0]).toContain("You lay the two slips side by side");
    const which = worldLine(t, "I compare what I know", t.facing!.moment)!;
    expect(which.lines[0]).toContain("Which two?");
    expect(which.free).toBe(true);
  });
});

describe("the table's time", () => {
  test("a vote takes no time; calling everyone back takes half an hour, and says the hour", () => {
    const t = someone();
    expect(worldLine(t, "Let's vote on it.", t.facing!.moment)!.free).toBe(true);
    const away = { ...t, fellows: t.fellows!.map((f) => ({ ...f, at: t.adv.stops.find((s) => s.climax)!.id })) };
    const r = worldLine(away, "Let's regroup.", away.facing!.moment)!;
    expect(r.hours).toBe(0.5);
    expect(r.trip.sheet.hour).toBe(t.sheet.hour + 0.5);
    expect(r.lines[0]).toContain("it is now");
  });

  test("a wait moves the clock at the place in your way too, so the next try starts from its end", () => {
    const t = someone();
    const w = worldLine(t, "I'll wait here until noon", t.facing!.moment)!;
    expect(w.trip.sheet.hour).toBeGreaterThan(t.sheet.hour);
    expect(w.trip.facing!.moment.sheet.hour).toBe(w.trip.sheet.hour);
  });
});

describe("the other side's clock, said once and never lost", () => {
  test("a move that began on your way is not said again as going on; one you missed is found when you get there", () => {
    const t = someone();
    const stop = t.facing!.stop;
    const now = t.sheet.hour;
    const on = { id: "on", at: now - 0.25, where: stop.id, what: "the cart is loaded", lasts: 1 };
    const missed = { id: "gone", at: now - 3, where: stop.id, what: "they burned the ledger" };
    const schedule = { ...newSchedule([on, missed]), happened: [{ id: "on", at: on.at }, { id: "gone", at: missed.at }] };
    const t2 = { ...t, schedule };
    const said = worldArrive(t2, stop, now - 1).lines.join(" ");
    expect(said).not.toContain("Right now, here: the cart is loaded");
    expect(said).toContain("You come too late for it");
    expect(said).toContain("they burned the ledger");
    expect(worldArrive(t2, stop, now - 0.2).lines.join(" ")).toContain("Right now, here: the cart is loaded");
  });
});

describe("the builder's words", () => {
  test("a clue that names a place inks it by the name the card's world gave it", () => {
    const a = road("rescue");
    const c = a.clues!.find((x) => x.points)!;
    const place = a.places.find((p) => p.name === c.points)!;
    const b = applyWords(a, MAREN, { places: { [place.id]: "Thornwick Keep" } }, "s").adv;
    expect(b.clues!.find((x) => x.id === c.id)!.points).toBe("Thornwick Keep");
  });

  test("a world card's companion is named, and taken from their line when the name is left out", () => {
    const a = road("rescue");
    const world: CardInfo = { name: "Harrowmere", description: "A frontier of monster girls and men.", world: true };
    expect(applyWords(a, world, { friend: { name: "Tobiah Fenn", who: "a miller's son" } }, "s").adv.companions.find((x) => x.id === "friend")!.name).toBe("Tobiah Fenn");
    expect(applyWords(a, world, { friend: { who: "Tobiah Fenn, a miller's son who lost his sister" } }, "s").adv.companions.find((x) => x.id === "friend")!.name).toBe("Tobiah Fenn");
    expect(buildMessages(world, a)[1]!.content).toContain('"name": "<their name>"');
  });

  test("what the player asked for and the campaign so far go to the builder", () => {
    const user = buildMessages(MAREN, road("heist"), { asked: "a heist, to steal his heart-locket", campaign: "Steward Vesper wants the grimoire." })[1]!.content;
    expect(user).toContain("a heist, to steal his heart-locket");
    expect(user).toContain("THE CAMPAIGN SO FAR");
  });

  test("the model invents each stop: none of the made-up stops' words are shown to it", () => {
    const a = road("rescue");
    const user = buildMessages(MAREN, a)[1]!.content;
    for (const s of a.stops) {
      expect(user).not.toContain(s.situation.slice(0, 40));
      for (const l of s.levers) expect(user).not.toContain(`"${l.name}"`);
    }
    expect(user).toContain("<a thing really there that helps");
  });

  test("a stop the model wrote whole is its own, with its things to use; a stop half written stays the made-up one", () => {
    const a = road("rescue");
    const [s1, s2] = a.stops.filter((s) => !s.climax && s.levers.length >= 2);
    const levers = (s: typeof s1, tag: string) => Object.fromEntries(s!.levers.map((l) => [l.way, `${tag} ${l.way} thing`]));
    const words = {
      stops: {
        [s1!.id]: { situation: "You face the drowned bell-ringer on the stair. Everything here is new.", teaser: "a bell under water", levers: levers(s1, "brine") },
        [s2!.id]: { situation: "A half-written stop.", levers: { [s2!.levers[0]!.way]: "only one thing" } },
      },
    };
    const b = applyWords(a, MAREN, words, "s").adv;
    const t1 = b.stops.find((s) => s.id === s1!.id)!;
    expect(t1.situation).toContain("drowned bell-ringer");
    expect(t1.teaser).toBe("a bell under water");
    for (const l of t1.levers) {
      expect(l.name).toBe(`brine ${l.way} thing`);
      expect(l.words).toContain("brine");
    }
    const t2 = b.stops.find((s) => s.id === s2!.id)!;
    expect(t2.situation).toBe(s2!.situation);
    expect(t2.levers.map((l) => l.name)).toEqual(s2!.levers.map((l) => l.name));
    // A note sent back as it is counts as unwritten.
    const echoed = applyWords(a, MAREN, { stops: { [s1!.id]: { situation: "<what stands in the way here>", levers: levers(s1, "x") } } }, "s").adv;
    expect(echoed.stops.find((s) => s.id === s1!.id)!.situation).toBe(s1!.situation);
  });

  test("a stop's card shows the title the model wrote for it, else its kind's own, and no stock title is offered", () => {
    const a = road("rescue");
    const s = a.stops.find((x) => !x.climax)!;
    const whole = (face?: string) => ({ stops: { [s.id]: { ...(face ? { face } : {}), situation: "You meet something new here, of this world.", levers: Object.fromEntries(s.levers.map((l) => [l.way, `new ${l.way}`])) } } });
    const b = applyWords(a, MAREN, whole("The Hungry Pack"), "s").adv.stops.find((x) => x.id === s.id)!;
    expect(faceOf(b)).toBe("The Hungry Pack");
    expect(b.card).toBe(s.card);
    expect(faceOf(applyWords(a, MAREN, whole(), "s").adv.stops.find((x) => x.id === s.id)!)).toBe(cardKind(s.card).title);
    const user = buildMessages(MAREN, a)[1]!.content;
    for (const x of a.stops.filter((y) => !y.climax)) expect(user).not.toContain(`"${cardKind(x.card).title}"`);
  });
});

describe("a try handed to a player", () => {
  test("is thrown on the stat they are best at for that way, and named as theirs", () => {
    const t = someone();
    const f = { ...t.fellows![0]!, stats: { brawn: 1, grace: 1, charm: 1, guile: 3, wits: 1, sense: 1 } };
    expect(handStat(f, "talk")).toBe("guile");
    const c = nameCheck(t.facing!.moment, { way: "talk", stat: "guile" })!;
    expect(checkSaid({ ...c, by: f.name }).join(" ")).toContain(`That tests ${f.name}'s Guile`);
  });
});

describe("names", () => {
  test("a person laid on a road is never called 'the the' something", () => {
    for (const family of FAMILIES) for (const s of road(family).stops) if (s.person) expect(s.person.name).not.toMatch(/^the (the|a|an) /i);
  });
});

describe("an ability's words", () => {
  test("its tags are cut at a word, nothing left hanging, and never 'a a'", () => {
    const a = readAbility({ name: "Silver Tongue", looks: "a quick word", does: "ease", much: 1, often: "stop", tags: ["a crowd turning against you", "pressing someone for what they know", "oath"] }, "x")!;
    expect(a.tags).toEqual(["a crowd turning", "pressing someone", "oath"]);
    const rule = abilityRule(a);
    expect(rule).toContain("a crowd turning, pressing someone or an oath comes into it");
    expect(rule).not.toMatch(/\ba a\b/);
  });
});
