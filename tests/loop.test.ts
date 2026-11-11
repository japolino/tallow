/**
 * The gaps closed after the live tests: questions to the narrator, what a fork tells you, the blocks for the ways,
 * taking a sitting up again, a second skeleton for each trope, and the weather a place calls for.
 */
import { describe, expect, test } from "bun:test";
import { CITY_COURTSHIP, COURIER, NIGHT_RESCUE, RESCUE } from "../src/content/adventures.js";
import { arrive, ASK_HOURS, ponder, startTrip, type Trip } from "../src/engine/adventure.js";
import { nameCheck, startMoment, wayStates } from "../src/engine/moment.js";
import { backSaid, forkHint } from "../src/engine/tell-adventure.js";
import { lookSaid } from "../src/engine/tell.js";
import { applyWords, buildAdventure, buildMessages, CITY, fallbackAdventure, modernCard, SKELETONS, skeletonFor } from "../src/game/build.js";
import type { CardInfo } from "../src/game/card.js";
import { direct, type Table } from "../src/game/director.js";
import { plainReading, standIns } from "../src/game/minds.js";
import { answerMessages } from "../src/game/prompts.js";
import { wantsNew } from "../src/game/session.js";
import { askLike } from "../src/meaning/read.js";

const stop = (id: string) => RESCUE.stops.find((s) => s.id === id)!;
const mill = () => startMoment(stop("mill"), COURIER, "q");

/** A table that writes the lines it is given, in order, then the first way still open; and keeps a record. */
function scripted(lines: string[], log: string[]): { table: Table; set(d: { trip: Trip; stage: string }): void } {
  let d!: { trip: Trip; stage: string };
  const table: Table = {
    say: async (l) => void log.push(...l),
    write: async () => {
      const open = () => {
        const m = d.trip.facing?.moment;
        const way = m && (["sneak", "talk", "force", "pay"] as const).find((w) => nameCheck(m, { way: w }));
        return { sneak: "I creep past quietly", talk: "I ask them kindly", force: "I shove my way through", pay: "I pay the toll" }[way ?? "sneak"];
      };
      const line = lines.shift() ?? (d.stage === "camp" ? "I press on" : open());
      log.push(`> ${line}`);
      return { line, given: Promise.resolve() };
    },
    page: async () => {},
    aside: async () => {},
    wait: async (_b, w) => w,
    weigh: async () => {},
    dieOrLine: async () => null,
    throwDie: async () => void log.push("throw"),
    carry: async () => {},
    clock: () => {},
    deal: async (s) => void log.push(`deal ${s.map((x) => x.id).join(",")}`),
    turn: async (s) => void log.push(`turn ${s.id}`),
    clear: async () => {},
    fork: async (s) => s[0]!.id,
    offer: async () => 0,
    give: async (c) => void log.push(`give ${c.id}`),
    take: async () => {},
    rival: async () => {},
    move: async () => {},
    ways: async (s) => void log.push(`ways ${s ? Object.entries(s).map(([w, v]) => `${w}:${v}`).join(" ") : "down"}`),
    weather: (sky) => void log.push(`sky ${sky}`),
  };
  return { table, set: (x) => (d = x) };
}

describe("questions to the narrator", () => {
  test("a question or a look is told apart from a try", () => {
    for (const l of ["What does she want?", "is the cart badly stuck?", "I look around the mill", "I wait and see", "Who else is here?"]) expect([l, askLike(l)]).toEqual([l, true]);
    for (const l of ["I creep along the race", "I pay her a coin", "I help her with the cart"]) expect([l, askLike(l)]).toEqual([l, false]);
    expect(plainReading("What does she want?", mill())).toBe("none");
    expect(plainReading("Can you tell me who passed?", mill())).toBe("none");
    expect(plainReading("I ask her who passed", mill())).toMatchObject({ way: "talk" });
  });

  test("a look round names only what is there, and the ways still open", () => {
    const said = lookSaid(mill());
    expect(said).toContain("her cart stuck in the race");
    expect(said).toContain("the footpath along the race");
    expect(lookSaid({ ...mill(), closed: ["sneak"] })).not.toContain("footpath");
  });

  test("asking takes a quarter of an hour and changes nothing else", () => {
    const t = arrive(startTrip(RESCUE, COURIER, "q"), "mill")!.trip;
    const p = ponder(t)!;
    expect(p.sheet.hour).toBe(t.sheet.hour + ASK_HOURS);
    expect(p.facing!.moment.sheet.hour).toBe(p.sheet.hour);
    expect(p.facing!.moment.tries).toBe(0);
    expect(p.sheet.health).toBe(t.sheet.health);
  });

  test("the director answers a question without a throw, then plays on", async () => {
    const log: string[] = [];
    const q = scripted(["What does she want?"], log);
    const d = direct(RESCUE, COURIER, "q1", q.table, standIns(0));
    q.set(d);
    await d.done;
    const asked = log.indexOf("> What does she want?");
    expect(asked).toBeGreaterThan(0);
    expect(log[asked + 1]).toContain("You look again");
    expect(log.slice(asked + 1, asked + 3).join(" ")).toContain("quarter of an hour");
    expect(log.slice(asked, asked + 4)).not.toContain("throw");
  });

  test("the model is asked to answer from the scene and change nothing", () => {
    const [sys, user] = answerMessages("what does she want?", mill());
    expect(sys!.content).toContain("Nothing changes because of your answer");
    expect(user!.content).toContain("her cart stuck in the race");
  });
});

describe("what a fork tells you", () => {
  test("whether something is to be had, how many tries, and the easiest way", () => {
    expect(forkHint(stop("crossing"))).toContain("walk on with you");
    expect(forkHint(stop("crossing"))).toContain("come to a fight");
    expect(forkHint(stop("crossing"))).toContain("going at it head on");
    expect(forkHint(stop("bridge"))).toContain("talking or paying");
    expect(forkHint(stop("mill"))).toContain("something to be had");
  });
});

describe("the blocks for the ways", () => {
  test("open, closed by a failure, or not there", () => {
    const m = startMoment(stop("crossing"), COURIER, "q");
    expect(wayStates(m)).toEqual({ talk: "open", sneak: "open", force: "open", pay: "none" });
    expect(wayStates({ ...m, closed: ["talk"] }).talk).toBe("closed");
  });

  test("the director stands them up at a place and lays them down after", async () => {
    const log: string[] = [];
    const q = scripted([], log);
    const d = direct(RESCUE, COURIER, "q2", q.table, standIns(0));
    q.set(d);
    await d.done;
    const first = log.findIndex((l) => l.startsWith("ways "));
    expect(log[first]).toBe("ways talk:open sneak:open force:open pay:open");
    expect(log).toContain("ways down");
  });
});

describe("taking a sitting up again", () => {
  test("it is saved before each try, and taken up at the place it stood", async () => {
    const saves: (Trip | null)[] = [];
    const log: string[] = [];
    const q = scripted([], log);
    const d = direct(RESCUE, COURIER, "q3", q.table, standIns(0), { save: (t) => saves.push(t && structuredClone(t)) });
    q.set(d);
    const end = await d.done;
    expect(saves.at(-1)).toBeNull();
    const mid = saves.find((t) => t?.facing && t.visited.length >= 2)!;
    expect(mid).toBeTruthy();
    // Through JSON, as it is kept.
    const kept = JSON.parse(JSON.stringify(mid)) as Trip;
    const log2: string[] = [];
    const q2 = scripted([], log2);
    const d2 = direct(kept.adv, kept.sheet, kept.seed, q2.table, standIns(0), { resume: kept });
    q2.set(d2);
    const end2 = await d2.done;
    expect(log2.find((l) => l.startsWith("deal "))).toBe(`deal ${kept.adv.stops.filter((s) => !kept.visited.includes(s.id) || s.id === kept.facing!.stop.id).map((s) => s.id).join(",")}`);
    expect(log2).toContain(`turn ${kept.facing!.stop.id}`);
    expect(log2.join(" ")).toContain("You came back");
    // The same seed and the same lines: it ends as the sitting that was not left did.
    expect(end2.over).toBe(end.over);
    expect(backSaid(kept).join(" ")).toContain(kept.facing!.stop.name);
  });

  test("a new story or the old one", () => {
    expect(wantsNew("a new one, please")).toBe(true);
    expect(wantsNew("start over")).toBe(true);
    expect(wantsNew("go on")).toBe(false);
    expect(wantsNew("let's continue where we left off")).toBe(false);
  });
});

const NOW: CardInfo = {
  name: "Ines Park",
  description: "{{char}} is a nurse on the night shift at a city hospital. She lives in a small apartment downtown, drives a battered car, and texts {{user}} too late at night. She plays guitar in a band on weekends.",
};
const THEN: CardInfo = {
  name: "Aldric",
  description: "{{char}} is a knight sworn to the queen, who keeps the castle gate. He rides a grey horse and carries an old sword from the last war with the dragon. In the village tavern he is quiet.",
};
/** A card with a modern word or two in an old world: it keeps the old road. */
const MIXED: CardInfo = { name: "Wren", description: "{{char}} is a witch who keeps a tavern in a kingdom of mages. She calls her familiar her phone." };
/** A fantasy card full of words an older world uses too: a band, a company, a club, a city. */
const SELLSWORD: CardInfo = { name: "Garr", description: "{{char}} leads a band of sellswords, the Grey Company, out of a city bar. He fights with a club and drinks at the inn." };
/** Urban fantasy: a vampire with a phone and a car is in our own times. */
const NIGHTWALKER: CardInfo = { name: "Vesna", description: "{{char}} is a vampire who owns a downtown nightclub. She drives a black car, never answers her phone, and wears a hoodie to hide from the sun." };

describe("a second skeleton for each trope", () => {
  test("a card set in our own times gets the city, and any other the old road", () => {
    expect(modernCard(NOW)).toBe(true);
    expect(modernCard(THEN)).toBe(false);
    expect(modernCard(MIXED)).toBe(false);
    expect(modernCard(SELLSWORD)).toBe(false);
    expect(modernCard(NIGHTWALKER)).toBe(true);
    expect(skeletonFor(NOW, "rescue")).toBe(CITY.rescue);
    expect(skeletonFor(NOW, "courtship")).toBe(CITY.courtship);
    expect(skeletonFor(THEN, "rescue")).toBe(SKELETONS.rescue);
  });

  test("the city road has its own map, with a choice from the first step", () => {
    for (const adv of [NIGHT_RESCUE, CITY_COURTSHIP]) {
      expect(adv.roads.filter(([a]) => a === adv.start).length).toBe(2);
      expect(adv.places.map((p) => p.id)).not.toEqual((adv.trope === "rescue" ? RESCUE : SKELETONS.courtship).places.map((p) => p.id));
    }
  });

  test("the builder is given the city skeleton, and keeps its shape", async () => {
    const [, user] = buildMessages(NOW, CITY.rescue);
    expect(user!.content).toContain("Brant");
    const built = applyWords(CITY.rescue, NOW, { title: "Night Shift", places: { cafe: "The Corner Diner" } }, "s").adv;
    expect(built.title).toBe("Night Shift");
    expect(built.roads).toEqual(NIGHT_RESCUE.roads);
    expect(built.places.find((p) => p.id === "cafe")!.name).toBe("The Corner Diner");
    expect(built.weather).toBe("rain");
    // With no model: the city road with the card's character in it.
    const plain = await buildAdventure(null, NOW, "rescue", "s");
    expect(plain.roads).toEqual(NIGHT_RESCUE.roads);
    expect(plain.companions.some((c) => c.name === "Ines Park")).toBe(true);
    const court = fallbackAdventure(CITY.courtship, NOW, "s");
    expect(court.courted!.name).toBe("Ines Park");
    expect(JSON.stringify(court)).not.toContain("Noor");
  });
});

describe("the weather a place calls for", () => {
  test("the road's weather between places, and a place's own while you are there", async () => {
    const log: string[] = [];
    const q = scripted([], log);
    const d = direct(RESCUE, COURIER, "q4", q.table, standIns(0));
    q.set(d);
    const end = await d.done;
    expect(log.find((l) => l.startsWith("sky "))).toBe("sky clear");
    const at = (id: string) => log.indexOf(`turn ${id}`);
    for (const s of RESCUE.stops.filter((s) => end.visited.includes(s.id))) expect(log.slice(at(s.id)).find((l) => l.startsWith("sky "))).toBe(`sky ${s.weather ?? "clear"}`);
    expect(log).toContain("sky storm");
  });
});
