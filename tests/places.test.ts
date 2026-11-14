/**
 * Places (src/engine/places.ts, src/game/systems/places.ts): the map's rules, and each moment of a turn with the
 * models faked.
 */
import { describe, expect, test } from "bun:test";
import {
  add, alike, arrive, byId, connect, durationText, emptyPlaces, feltDanger, find, here, MAX_PLACES, merge, minutesBetween, pathText, prune, readPlaces, remember, seenAt,
  type Places,
} from "../src/engine/places.js";
import { meet, newRun, person, type Run } from "../src/engine/run.js";
import type { Message, Role } from "../src/game/ask.js";
import { pagesOf, sceneOf, showsOf, turn } from "../src/game/runturn.js";
import type { RunDeps } from "../src/game/system.js";
import { places } from "../src/game/systems/places.js";

/* ------------------------------------------------- the engine ------------------------------------------------- */

function map(): { st: Places; inn: ReturnType<typeof add> & object; town: ReturnType<typeof add> & object } {
  const st = emptyPlaces();
  const inn = add(st, 0, { name: "The Rusty Anchor", kind: "inn", size: 1 }, "unplaced", undefined)!;
  st.at = inn.id;
  const town = add(st, 0, { name: "Port Kell", kind: "town", size: 3 }, "holds", inn)!;
  return { st, inn, town };
}

describe("the map", () => {
  test("a larger place named around a known one holds it, and a smaller one goes inside", () => {
    const { st, inn, town } = map();
    expect(inn.within).toBe(town.id);
    const cellar = add(st, 1, { name: "Cellar", size: 0 }, "inside", inn)!;
    expect(cellar.within).toBe(inn.id);
    expect(pathText(st, cellar.id)).toBe("Cellar, in The Rusty Anchor, in Port Kell");
    // A market beside the inn stands in the same town, with a way to the inn.
    const market = add(st, 1, { name: "Fish Market", size: 1 }, "beside", inn)!;
    expect(market.within).toBe(town.id);
    expect(minutesBetween(st, market.id, inn.id)).toBe(20);
  });

  test("nothing is put inside a place no bigger than itself: a kingdom said to be inside an inn goes to the top", () => {
    const { st, inn } = map();
    const realm = add(st, 1, { name: "The Northern Kingdom", size: 4 }, "inside", inn)!;
    expect(realm.within).toBeNull();
    const room = add(st, 1, { name: "Back Room", size: 0 }, "inside", inn)!;
    const closet = add(st, 1, { name: "Broom Closet", size: 0 }, "inside", room)!;
    expect(closet.within).toBe(inn.id);
    // A room said to hold a town does not: it stands beside it, and the town is left where it was.
    const town = byId(st, inn.within!)!;
    const small = add(st, 1, { name: "Harbour Shed", size: 0 }, "holds", town)!;
    expect(small.within).toBeNull();
    expect(town.within).toBeNull();
    expect(minutesBetween(st, small.id, town.id)).toBe(5);
  });

  test("a place named again under another wording is the same place, and its wording is kept", () => {
    const { st, inn } = map();
    expect(add(st, 2, { name: "the rusty anchor" }, "inside", undefined)).toBe(inn);
    expect(add(st, 2, { name: "Anchor Tavern" }, "same", inn)).toBe(inn);
    expect(find(st, "anchor tavern")).toBe(inn);
    expect(st.list).toHaveLength(2);
    expect(alike("Kell", "Port Kell")).toBe(true);
    expect(alike("the North Gate", "the North Road")).toBe(false);
  });

  test("a journey is the shortest road along the known ways, and is spoken of plainly", () => {
    const st = emptyPlaces();
    const a = add(st, 0, { name: "A" }, "unplaced", undefined)!, b = add(st, 0, { name: "B" }, "unplaced", undefined)!, c = add(st, 0, { name: "C" }, "unplaced", undefined)!;
    connect(st, a.id, b.id, 60);
    connect(st, b.id, c.id, 60);
    connect(st, a.id, c.id, 500);
    expect(minutesBetween(st, a.id, c.id)).toBe(120);
    add(st, 0, { name: "D" }, "unplaced", undefined);
    expect(minutesBetween(st, a.id, find(st, "D")!.id)).toBeNull();
    expect(durationText(1)).toBe("a moment away");
    expect(durationText(15)).toBe("about 15 minutes away");
    expect(durationText(120)).toBe("about 2 hours away");
    expect(durationText(4320)).toBe("about 3 days away");
  });

  test("danger is felt less by the seasoned and more by the green, and a safe place stays safe", () => {
    expect(feltDanger(3, 1)).toBe(4);
    expect(feltDanger(3, 8)).toBe(3);
    expect(feltDanger(3, 12)).toBe(2);
    expect(feltDanger(2, 20)).toBe(1);
    expect(feltDanger(0, 1)).toBe(0);
    expect(feltDanger(5, 1)).toBe(5);
  });

  test("a place found to be another gives it everything: wordings, what is inside, ways, who was seen there", () => {
    const { st, inn } = map();
    const dup = add(st, 1, { name: "Dockside Inn", size: 1 }, "far", inn)!;
    const room = add(st, 1, { name: "Loft", size: 0 }, "inside", dup)!;
    st.seen.Mira = dup.id;
    st.at = dup.id;
    merge(st, dup, inn);
    expect(st.list.includes(dup)).toBe(false);
    expect(room.within).toBe(inn.id);
    expect(inn.was).toContain("Dockside Inn");
    expect(st.seen.Mira).toBe(inn.id);
    expect(st.at).toBe(inn.id);
    expect(st.ways.some((w) => w.a === dup.id || w.b === dup.id)).toBe(false);
  });

  test("arriving brings back those last seen there, alive and not with you, and clears what barred the way", () => {
    const r = newRun(1, "w", "h", "Jay");
    const { st, inn, town } = map();
    meet(r, { name: "Mira" });
    meet(r, { name: "Old Tom" });
    meet(r, { name: "Ghost" });
    remember(st, r, []);
    for (const p of r.people) p.here = false;
    person(r, "Ghost")!.dead = true;
    town.blocker = "a rockfall";
    arrive(st, r, town);
    expect(town.visited && st.fresh === town.id && town.blocker === "").toBe(true);
    const back = arrive(st, r, inn);
    expect(back.sort()).toEqual(["Mira", "Old Tom"]);
    expect(person(r, "Ghost")!.here).toBe(false);
  });

  test("who is where is kept under the name the run has now, and those gone or dead are nowhere known", () => {
    const r = newRun(1, "w", "h", "Jay");
    const { st, inn } = map();
    meet(r, { name: "the hooded woman" });
    meet(r, { name: "Brann" });
    remember(st, r, []);
    const p = person(r, "the hooded woman")!;
    p.was.push(p.name);
    p.name = "Sela";
    person(r, "Brann")!.here = false;
    remember(st, r, ["Brann"]);
    expect(st.seen).toEqual({ Sela: inn.id });
    expect(seenAt(st, r, inn.id)).toEqual(["Sela"]);
  });

  test("past the cap the oldest places never visited fall away, never where you are or have been", () => {
    const { st, inn, town } = map();
    inn.visited = true;
    for (let i = 0; i < MAX_PLACES + 5; i++) add(st, i + 1, { name: `Hamlet ${i}`, size: 2 }, "beside", inn);
    const dropped = prune(st);
    expect(st.list).toHaveLength(MAX_PLACES);
    expect(dropped[0]).toBe("Hamlet 0");
    expect(find(st, "The Rusty Anchor") && find(st, "Port Kell")).toBeTruthy();
    expect(byId(st, town.id)).toBe(town);
  });

  test("a map saved before a field existed reads with every field given", () => {
    const st = readPlaces({ list: [{ id: "p1", name: "Old Hall" }], at: "p1" });
    expect(st.list[0]).toMatchObject({ size: 1, danger: 1, things: [], was: [], blocker: "", visited: false });
    expect(st.ways).toEqual([]);
    expect(st.next).toBe(2);
    expect(readPlaces(undefined).list).toEqual([]);
  });
});

/* ------------------------------------------------- the turn ------------------------------------------------- */

const WALK = {
  kind: "action", act: "walk to the fish market", target: null, item: null, item_named: false, needs_item: null, ability: null, ability_named: false,
  verdict: "trivial", reason: "Nothing stands in the way.", attribute: "dexterity", skill: "Walking", for: [], against: [], scores: { physical: 3, likelihood: 0, item: null, ability: null, other: null },
};

interface Fakes {
  judge?: unknown;
  back?: unknown;
  going?: unknown;
  named?: unknown;
  placed?: unknown;
  peopled?: unknown;
  seeded?: unknown;
  /** What the model that fills in a first visit was shown. */
  shown?: string[];
}

function deps(f: Fakes = {}): RunDeps & { told: Message[][]; asked: string[]; logged: string[] } {
  const told: Message[][] = [], asked: string[] = [], logged: string[] = [];
  const say = (x: unknown): string => (typeof x === "string" ? x : JSON.stringify(x));
  return {
    told,
    asked,
    logged,
    systems: [places],
    log: (m) => void logged.push(m),
    ask: async (messages: Message[], role: Role) => {
      const sys = messages[0]!.content;
      if (role === "teller") return (told.push(messages), "You go on your way.");
      if (sys.includes("set up the map")) return asked.push("seed"), say(f.seeded ?? {});
      if (sys.includes("fill in a place")) return asked.push("people"), f.shown?.push(messages.at(-1)!.content), say(f.peopled ?? {});
      if (sys.includes("referee")) return say(f.judge ?? WALK);
      if (sys.includes("keep the records")) return say(f.back ?? { minutes: 3 });
      if (sys.includes("goes to another place")) return asked.push("plan"), say(f.going ?? { going: null });
      if (sys.includes("report only the places")) return asked.push("read"), say(f.named ?? { places: [] });
      if (sys.includes("just arrived somewhere")) return asked.push("place"), say(f.placed ?? "no idea");
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
  };
}

/** A run at the Rusty Anchor in Port Kell, with the Fish Market beside it, Mira at the inn and Hal at the market. */
function start(): Run {
  const r = newRun(7, "a port town world", "a sailor", "Jay");
  r.opening = "You sit in the Rusty Anchor.";
  r.place = { name: "The Rusty Anchor", text: "A dockside inn." };
  meet(r, { name: "Mira", text: "The innkeeper." });
  const st = emptyPlaces();
  const inn = add(st, 0, { name: "The Rusty Anchor", text: "A dockside inn.", kind: "inn", size: 1 }, "unplaced", undefined)!;
  inn.visited = inn.peopled = true;
  st.at = inn.id;
  add(st, 0, { name: "Port Kell", kind: "town", size: 3, danger: 1 }, "holds", inn);
  const market = add(st, 0, { name: "Fish Market", text: "Stalls of the morning catch.", kind: "market", size: 1, danger: 1 }, "beside", inn)!;
  market.visited = market.peopled = true;
  meet(r, { name: "Hal", text: "A fishmonger." });
  st.seen = { Mira: inn.id, Hal: market.id };
  person(r, "Hal")!.here = false;
  r.sys = { places: st };
  return r;
}
const stOf = (r: Run): Places => r.sys!.places as Places;

describe("places in a turn", () => {
  test("a run begun puts where it opens on the map, with the places the card puts near it", async () => {
    const r = newRun(3, "w", "h", "Jay");
    r.place = { name: "The Rusty Anchor", text: "A dockside inn." };
    meet(r, { name: "Mira" });
    const d = deps({
      seeded: {
        here: { kind: "inn", size: 1, danger: 0, private: false, things: [{ name: "long oak bar", use: "trade" }, { name: "hearth", use: "other" }] },
        nearby: [
          { name: "Port Kell", text: "A salt-stung town.", kind: "town", size: 3, danger: 1, where: "holds", of: "The Rusty Anchor" },
          { name: "Fish Market", text: "Stalls.", kind: "market", size: 1, danger: 1, where: "beside", of: "The Rusty Anchor", way: "short walk" },
          { name: "the Rusty Anchor", where: "beside", of: "Port Kell" },
          { name: "Smugglers' Cove", text: "A hidden inlet.", kind: "cove", size: 2, danger: 3, where: "beside", of: "Port Kell", way: "half a day" },
        ],
      },
    });
    await places.seed!(d, r, { world: "w", who: "h", name: "Jay" });
    const st = stOf(r);
    expect(st.list.map((p) => p.name)).toEqual(["The Rusty Anchor", "Port Kell", "Fish Market", "Smugglers' Cove"]);
    const inn = here(st)!;
    expect(inn).toMatchObject({ kind: "inn", visited: true, peopled: true, within: find(st, "Port Kell")!.id });
    expect(inn.things.map((t) => t.use)).toEqual(["trade", "other"]);
    expect(minutesBetween(st, inn.id, find(st, "Fish Market")!.id)).toBe(15);
    expect(st.seen).toEqual({ Mira: inn.id });
    // Every model is shown the danger here and the ways on.
    const scene = sceneOf(d, r);
    expect(scene).toContain("PLACE NOTES: The Rusty Anchor is inn, in Port Kell. How dangerous it is to be here: safe.");
    expect(scene).toContain("Fish Market (about 15 minutes away)");
    expect(scene).toContain("out to Port Kell");
  });

  test("going to a known place: the storyteller is told the way and who is there; arriving brings them back", async () => {
    const r = start();
    // The read-back says Mira is gone because the character left her: she stays where she was.
    const d = deps({ going: { going: "Fish Market" }, back: { place: { name: "Fish Market", text: "Busy." }, minutes: 2, gone: ["Mira"] } });
    const t = await turn(d, r, "I walk over to the fish market.");
    const last = d.told[0]!.at(-1)!.content;
    expect(last).toContain("Where Jay is heading: Fish Market, in Port Kell.");
    expect(last).toContain("They have been there before.");
    expect(last).toContain("By the known ways it is about 20 minutes from where they are");
    expect(last).toContain("they find there those last seen there: Hal.");
    // The journey takes as long as the way does, not the two minutes read back.
    expect(t.run.minutes).toBe(20);
    expect(person(t.run, "Hal")!.here).toBe(true);
    expect(person(t.run, "Mira")!.here).toBe(false);
    expect(t.report.changes).toContain("Still here: Hal.");
    const st = stOf(t.run);
    expect(here(st)!.name).toBe("Fish Market");
    expect(st.seen).toEqual({ Mira: find(st, "The Rusty Anchor")!.id, Hal: st.at });
    expect(d.asked).toEqual(["plan", "read"]);
    // Going back finds Mira where she was left.
    const back = await turn(deps({ going: { going: "The Rusty Anchor" }, back: { place: { name: "the Rusty Anchor", text: "" }, minutes: 25 } }), t.run, "Back to the inn.");
    expect(person(back.run, "Mira")!.here).toBe(true);
    expect(person(back.run, "Hal")!.here).toBe(false);
    expect(back.run.place.name).toBe("The Rusty Anchor");
  });

  test("a place read back that is where they already are, by another wording, is no move and leaves nobody behind", async () => {
    const r = start();
    here(stOf(r))!.was.push("the dockside tavern");
    const t = await turn(deps({ back: { place: { name: "The dockside tavern", text: "" }, minutes: 2 } }), r, "I stretch.");
    expect(t.run.place.name).toBe("The Rusty Anchor");
    expect(person(t.run, "Mira")!.here).toBe(true);
  });

  test("a place arrived at by a new name that is a known one is merged into it, and those there are found", async () => {
    const r = start();
    const d = deps({ back: { place: { name: "The fishmongers' square", text: "Gulls everywhere." }, minutes: 15 }, placed: { where: "same", of: "Fish Market (market, in Port Kell, visited)", kind: "market", size: 1, danger: 1 } });
    const t = await turn(d, r, "I head out among the stalls.");
    const st = stOf(t.run);
    expect(st.list.map((p) => p.name)).toEqual(["The Rusty Anchor", "Port Kell", "Fish Market"]);
    expect(here(st)!.was).toContain("The fishmongers' square");
    expect(t.run.place.name).toBe("Fish Market");
    expect(person(t.run, "Hal")!.here).toBe(true);
    expect(t.report.changes).toContain("The fishmongers' square is Fish Market. Still here: Hal.");
    // A visited place is not filled in again.
    expect(d.asked).not.toContain("people");
  });

  test("a new place arrived at is placed, and filled in once on the first visit, held to its restraint", async () => {
    const r = start();
    const d = deps({
      back: { place: { name: "The Drowned Bell", text: "A sunken chapel, half flooded." }, minutes: 40 },
      placed: { where: "beside", of: "Fish Market", kind: "ruined chapel", size: 1, danger: 1, way: "short walk" },
      peopled: {
        people: [{ name: "a hunched bell-ringer", text: "Keeps the bell.", power: 2, hostile: true }, { name: "Mira", text: "dup", power: 3 }],
        things: [{ name: "cracked bell", use: "other" }, { name: "stone font", use: "keep" }],
        inside: [{ name: "Flooded Crypt", text: "Black water.", kind: "crypt", size: 0, danger: 3 }, { name: "Whole Kingdom", size: 4 }],
        barred: { place: "Flooded Crypt", by: "a wall of black water" },
      },
    });
    const t = await turn(d, r, "I follow the tolling down to the water.");
    const st = stOf(t.run);
    const bell = here(st)!;
    expect(bell).toMatchObject({ name: "The Drowned Bell", kind: "ruined chapel", visited: true, peopled: true, within: find(st, "Port Kell")!.id });
    expect(minutesBetween(st, bell.id, find(st, "Fish Market")!.id)).toBe(15);
    // In a place of little danger nobody is hostile; nobody already known is written again.
    const ringer = person(t.run, "a hunched bell-ringer")!;
    expect(ringer).toMatchObject({ here: true, hostile: false });
    expect(t.run.people.filter((p) => p.name === "Mira")).toHaveLength(1);
    expect(bell.things.map((x) => x.name)).toEqual(["cracked bell", "stone font"]);
    expect(find(st, "Flooded Crypt")).toMatchObject({ within: bell.id, visited: false, blocker: "a wall of black water" });
    expect(find(st, "Whole Kingdom")).toBeUndefined();
    expect(st.seen["a hunched bell-ringer"]).toBe(bell.id);
    expect(d.asked).toEqual(["plan", "read", "place", "people"]);
    // Every model is shown the barred way.
    expect(sceneOf(d, t.run)).toContain("Flooded Crypt (inside, a moment away; the way in barred by a wall of black water)");
  });

  test("a first visit is shown what the story said before, and nobody it writes is fighting until the story shows them", async () => {
    const r = start();
    r.beats.push({ you: "I ask Mira what is out in the woods.", story: "Mira lowers her voice. \"A grey wolf dens under the split oak in Hollow Wood. Bring me its ferns and the room is yours.\"" });
    const shown: string[] = [];
    const d = deps({
      shown,
      back: { place: { name: "Hollow Wood", text: "Old trees, close and dark." }, minutes: 60 },
      placed: { where: "far", of: "Port Kell", kind: "forest", size: 3, danger: 3, way: "an hour's walk" },
      peopled: { people: [{ name: "a grey wolf", text: "Dens under the split oak.", power: 4, hostile: true }], things: [], inside: [] },
    });
    const t = await turn(d, r, "I walk out to Hollow Wood.");
    // The warning given in the inn is in front of the model, so it writes that wolf and not some other danger.
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain("THE STORY BEFORE THEY CAME");
    expect(shown[0]).toContain("A grey wolf dens under the split oak");
    expect(shown[0]!.indexOf("A grey wolf dens")).toBeLessThan(shown[0]!.indexOf("HOW THEY CAME HERE"));
    expect(shown[0]).toContain("no other danger is added beside them");
    // It is here, and what it means to do is kept in words; but it takes no turn against the player until a passage shows it.
    const wolf = person(t.run, "a grey wolf")!;
    expect(wolf).toMatchObject({ here: true, hostile: false, power: 4 });
    expect(wolf.text).toBe("Dens under the split oak. Will attack whoever comes near.");
    expect(t.report.changes).toContain("In Hollow Wood: a grey wolf.");
  });

  test("nobody is written into a private place, or a room", async () => {
    const r = start();
    const d = deps({
      back: { place: { name: "Mira's Bedroom", text: "A small room upstairs." }, minutes: 2 },
      placed: { where: "inside", of: "The Rusty Anchor", kind: "bedroom", size: 0, danger: 0, private: true },
      peopled: { people: [{ name: "a lurking thief", power: 3, hostile: true }], things: [{ name: "narrow bed", use: "other" }], inside: [{ name: "Wardrobe Nook", size: 0 }] },
    });
    const t = await turn(d, r, "I slip upstairs into Mira's room.");
    expect(person(t.run, "a lurking thief")).toBeUndefined();
    const room = here(stOf(t.run))!;
    expect(room.within).toBe(find(stOf(t.run), "The Rusty Anchor")!.id);
    expect(room.things).toHaveLength(1);
    expect(find(stOf(t.run), "Wardrobe Nook")).toBeUndefined();
  });

  test("with no usable placing, a place arrived at stands beside where they came from, as far as the passage took", async () => {
    const r = start();
    const d = deps({ back: { place: { name: "Lighthouse Point", text: "" }, minutes: 90 } });
    const t = await turn(d, r, "I walk out along the cliffs.");
    const st = stOf(t.run);
    expect(here(st)!.name).toBe("Lighthouse Point");
    expect(minutesBetween(st, st.at, find(st, "The Rusty Anchor")!.id)).toBe(90);
    expect(t.story).toBe("You go on your way.");
    expect(d.logged.some((m) => m.includes("placing where they arrived"))).toBe(true);
  });

  test("places the passage names go on the map; known ones, ones too alike, and ones that do not check do not", async () => {
    const r = start();
    const d = deps({
      named: {
        places: [
          { name: "Greywater Keep", text: "A fortress up the coast.", kind: "fortress", size: 2, danger: 3, where: "far", of: "Port Kell", way: "days" },
          { name: "Somewhere", where: "nowhere" },
          { name: "the third door on the left", where: "inside", of: "The Rusty Anchor", size: 0 },
          { name: "the keep's dungeon", where: "inside", of: "Greywater Keep", size: 0, danger: 4 },
          { name: "Kell", where: "unplaced" },
        ],
        barred: [{ place: "Greywater Keep", by: "a raised drawbridge" }],
      },
    });
    const t = await turn(d, r, "I ask Mira about the coast.");
    // A longer name around a known one is a part of it, and is kept.
    const harbour = await turn(deps({ named: { places: [{ name: "Port Kell Harbour", kind: "harbour", size: 2, where: "inside", of: "Port Kell (town)" }] } }), start(), "I look out to sea.");
    expect(find(stOf(harbour.run), "Port Kell Harbour")!.within).toBe(find(stOf(harbour.run), "Port Kell")!.id);
    const st = stOf(t.run);
    // A room only heard of (the dungeon) is not kept: rooms come onto the map by being entered, or with their building.
    expect(st.list.map((p) => p.name)).toEqual(["The Rusty Anchor", "Port Kell", "Fish Market", "Greywater Keep"]);
    const keep = find(st, "Greywater Keep")!;
    expect(keep).toMatchObject({ visited: false, blocker: "a raised drawbridge" });
    expect(minutesBetween(st, keep.id, find(st, "Port Kell")!.id)).toBe(4320);
    expect(t.report.changes).toContain("On the map now: Greywater Keep.");
    // The barrier is shown to the storyteller when the character heads there, and overcome when the passage shows it.
    const go = await turn(deps({ going: { going: "Greywater Keep" }, named: { places: [], cleared: ["Greywater Keep"] } }), t.run, "I set out for the keep.");
    expect(go.report.changes).toContain("The way into Greywater Keep is open again.");
  });

  test("a barrier is told to the storyteller as a fact, and arriving anyway clears it", async () => {
    const r = start();
    find(stOf(r), "Fish Market")!.blocker = "a collapsed awning";
    const d = deps({ going: { going: "fish market" }, back: { place: { name: "Fish Market", text: "" }, minutes: 20 } });
    const t = await turn(d, r, "I go to the market.");
    expect(d.told[0]!.at(-1)!.content).toContain("The way into Fish Market is barred by a collapsed awning; it still bars the way unless this turn's result gets them past it.");
    expect(here(stOf(t.run))!.blocker).toBe("");
  });

  test("a line the player writes as a co-author is followed, and the storyteller is told time stands as written", async () => {
    const r = start();
    const story = { ...WALK, kind: "story", act: "", verdict: null };
    const d = deps({ judge: story, going: { going: "Port Kell" }, back: { place: { name: "Port Kell", text: "" }, minutes: 4320 } });
    const t = await turn(d, r, "Three days later I am in the town square of Port Kell.");
    expect(d.told[0]!.at(-1)!.content).toContain("what the player wrote about time passing stands");
    expect(t.run.minutes).toBe(4320);
    expect(here(stOf(t.run))!.name).toBe("Port Kell");
  });

  test("plan is skipped when no other place is known, and nothing is asked twice", async () => {
    const r = newRun(1, "w", "h", "Jay");
    r.opening = "It begins.";
    r.place = { name: "A Cell", text: "" };
    const d = deps();
    const t = await turn(d, r, "I sit.");
    expect(d.asked).toEqual(["read"]);
    // A run from before the map existed has it made from where the character is.
    expect(here(stOf(t.run))!.name).toBe("A Cell");
  });

  test("the map and the pages show what is known", () => {
    const r = start();
    const d = deps();
    const [m] = showsOf(d, r);
    expect(m).toMatchObject({ kind: "map", at: here(stOf(r))!.id });
    if (m?.kind !== "map") throw new Error("no map");
    expect(m.places.map((p) => [p.name, p.seen])).toEqual([["The Rusty Anchor", true], ["Port Kell", false], ["Fish Market", true]]);
    expect(m.ways).toHaveLength(3);
    const pages = pagesOf(d, r);
    expect(pages.map((p) => p.heading)).toEqual(["Where you are", "Places known", "Who is where"]);
    expect(pages[2]!.his).toEqual(["Hal: last seen at Fish Market."]);
  });
});
