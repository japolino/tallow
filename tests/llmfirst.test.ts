/**
 * The model-first pieces (docs/PROPOSAL-llm-first.md): the pick parser reads a model's answer back whole or not at all,
 * a stop's own failure stakes are what a failed try risks, losing face with someone turns them and not the world, and
 * losing a fight goes the way the world's own outcome says.
 */
import { describe, expect, test } from "bun:test";
import { COURIER, RESCUE } from "../src/content/adventures.js";
import { startTrip } from "../src/engine/adventure.js";
import { rollD20, seededRng } from "../src/engine/dice.js";
import { nameCheck, resolve, stakeOf, startMoment, threatOf, WAY_COST, type Moment, type Outcome, type Read } from "../src/engine/moment.js";
import { riskSaid } from "../src/engine/tell.js";
import { takenOutOf, takenPool, takenToll } from "../src/engine/tell-adventure.js";
import { parsePick } from "../src/game/decisions.js";
import { applyWords, designOf, leverKey, SKELETONS } from "../src/game/build.js";
import { parseRead } from "../src/game/prompts.js";
import { checkedGrade } from "../src/meaning/read.js";
import { BRIDGE, YOU } from "../preview/mock.js";

describe("a model's pick is read back to an id, or not at all", () => {
  const sides = { left: "the card on the left: the Drowned Chapel", right: "the card on the right: the Smugglers' Stair" };
  const hub = { "1": "place 1 on the map: the Night Market", "2": "place 2 on the map: the Archive", "3": "place 3 on the map: the Docks" };

  test("ids, quoted or bare, in any case", () => {
    expect(parsePick('{"pick": "left"}', sides)).toBe("left");
    expect(parsePick('{"pick":"RIGHT"}', sides)).toBe("right");
    expect(parsePick("right", sides)).toBe("right");
    expect(parsePick('"left".', sides)).toBe("left");
  });

  test("numbers are the number shown, never a hidden index", () => {
    expect(parsePick('{"pick": 3}', hub)).toBe("3");
    expect(parsePick('{"pick": "1"}', hub)).toBe("1");
  });

  test("the option's words, or the words before its colon, are its id", () => {
    expect(parsePick('{"pick": "the card on the right"}', sides)).toBe("right");
    expect(parsePick('{"pick": "place 2 on the map: the Archive"}', hub)).toBe("2");
  });

  test("an honest unclear, or anything else, is no pick", () => {
    expect(parsePick('{"pick": "unclear"}', sides)).toBeNull();
    expect(parsePick('{"pick": "the chapel, probably"}', sides)).toBeNull();
    expect(parsePick("", sides)).toBeNull();
  });
});

/** A moment whose next throw shows `face`: the die is seeded, so the seed picks the face. */
function withFace(m: Moment, face: number): Moment {
  for (let i = 0; i < 5000; i++) {
    const seed = `s${i}`;
    if (rollD20(seededRng(`${seed}:${m.stop.id}:try:${m.tries}`)) === face) return { ...m, seed };
  }
  throw new Error(`no seed found for a ${face}`);
}
const play = (m: Moment, read: Read, face: number): Outcome => resolve(withFace(m, face), read)!;

describe("a failed try risks what failing brings down at this stop", () => {
  const pack = { ...BRIDGE, fails: { talk: { stake: "health" as const, threat: "The hungry pack closes in and bites" } } };

  test("the stop's stake beats the way's own and a bare pick; a line that says what happens beats the stop's; paying is always supplies", () => {
    expect(stakeOf({ way: "talk" }, pack)).toBe("health");
    expect(stakeOf({ way: "talk" })).toBe(WAY_COST.talk);
    expect(stakeOf({ way: "talk", stake: "hours" })).toBe("hours");
    expect(stakeOf({ way: "talk", stake: "hours" }, pack)).toBe("health");
    expect(stakeOf({ way: "talk", stake: "hours", threat: "The pack loses interest and wanders off" }, pack)).toBe("hours");
    expect(stakeOf({ way: "pay", stake: "health" }, pack)).toBe("supplies");
  });

  test("the stop's threat is said only with its own stake", () => {
    expect(threatOf({ way: "talk" }, pack)).toBe("The hungry pack closes in and bites");
    expect(threatOf({ way: "talk", stake: "hours" }, pack)).toBe("The hungry pack closes in and bites");
    expect(threatOf({ way: "talk", threat: "They laugh you off" }, pack)).toBe("They laugh you off");
    expect(threatOf({ way: "sneak" }, pack)).toBeUndefined();
  });

  test("the check carries it, and the narrator says it before the throw", () => {
    const c = nameCheck(startMoment(pack, YOU, "t"), { way: "talk" })!;
    expect(c.costs).toBe("health");
    expect(riskSaid(c)).toContain("hungry pack closes in");
  });
});

describe("goodwill lost in front of someone is lost with them", () => {
  const fail = (m: Moment): Outcome => {
    for (const face of [2, 3, 4, 5]) {
      const o = play(m, { way: "talk" }, face);
      if (o.tier === "fail") return o;
    }
    throw new Error("no failing face");
  };

  test("with someone there, they turn colder and the world's goodwill is kept", () => {
    const m: Moment = { ...startMoment(BRIDGE, YOU, "t"), person: "Mara" };
    const o = fail(m);
    expect(o.cost.kind).toBe("goodwill");
    expect(o.turned).toBeGreaterThan(0);
    expect(o.next.sheet.goodwill).toBe(m.sheet.goodwill);
    expect((o.next.warm ?? 0) < (m.warm ?? 0)).toBe(true);
  });

  test("with nobody there, it is the world's goodwill", () => {
    const m = startMoment(BRIDGE, YOU, "t");
    const o = fail(m);
    expect(o.turned).toBeUndefined();
    expect(o.next.sheet.goodwill).toBeLessThan(m.sheet.goodwill);
  });
});

describe("losing a fight goes the world's way", () => {
  test("a means the model chose is used when the world allows it; else the seeded one", () => {
    const kit = { takenOut: ["wounded", "captured", "shamed"] as const };
    expect(takenOutOf({ takenOut: [...kit.takenOut] }, "s", true, "shamed").means).toBe("shamed");
    expect(takenPool({ takenOut: [...kit.takenOut] })).toContain(takenOutOf({ takenOut: [...kit.takenOut] }, "s", true, "claimed").means);
    expect(takenOutOf({ takenOut: [...kit.takenOut] }, "s", true, "claimed").means).not.toBe("claimed");
  });

  test("each means costs something of its own", () => {
    const t = startTrip(RESCUE, COURIER, "x");
    expect(takenToll(t, "wounded").trip.sheet.health).toBe(1);
    expect(takenToll(t, "shamed").trip.sheet.goodwill).toBe(Math.max(0, t.sheet.goodwill - 1));
    expect(takenToll(t, "exiled").trip.sheet.hour).toBeGreaterThan(t.sheet.hour);
    for (const m of ["wounded", "captured", "claimed", "shamed", "exiled"] as const) expect(takenToll(t, m).said.length).toBeGreaterThan(10);
  });
});

describe("the reader names what the line uses, and code keeps only what is real", () => {
  const beast = { ...BRIDGE, foe: { ratings: {}, hurtBy: ["fire", "silver"] } };
  const m = startMoment(beast, YOU, "t");

  test("a foe's weaknesses the reader names are kept only if the foe has them", () => {
    const r = parseRead('{"way": "force", "stat": "brawn", "hurts": ["fire", "ice"], "trade": "bold"}', m);
    const read = r && r !== "none" && !("use" in r) ? r : null;
    expect(read?.hurts).toEqual(["fire"]);
    expect(read?.trade).toBe("bold");
  });

  test("a weakness the reader named counts even when the words do not say it", () => {
    const named = nameCheck(m, { way: "force", line: "I swing the torch at it", hurts: ["fire"] })!;
    const none = nameCheck(m, { way: "force", line: "I swing the torch at it", hurts: [] })!;
    expect(named.hurts).toEqual(["fire"]);
    expect(none.hurts).toEqual([]);
  });

  test("a real thing the reader named by id earns the grade its words alone would not", () => {
    const lever = BRIDGE.levers[0]!;
    expect(checkedGrade("grounded", "I do the obvious thing.", startMoment(BRIDGE, YOU, "t"))).toBe("plain");
    expect(checkedGrade("grounded", "I do the obvious thing.", startMoment(BRIDGE, YOU, "t"), [], { lever: lever.id })).toBe("grounded");
    expect(checkedGrade("inspired", "I do the obvious thing.", startMoment(BRIDGE, YOU, "t"), [], { lever: "not-here" })).toBe("plain");
  });
});

describe("the narrator's move is the one that fits the scene, when it can happen", () => {
  test("a chosen move that can happen here is made; one that cannot is not", async () => {
    const { arrive, ahead } = await import("../src/engine/adventure.js");
    const { movesHere, pickMove } = await import("../src/engine/dread.js");
    let t = startTrip(RESCUE, COURIER, "x");
    t = arrive(t, ahead(t)[0]!.id)!.trip;
    const legal = movesHere(t).map(([k]) => k);
    expect(legal.length).toBeGreaterThan(1);
    for (const k of legal) expect(pickMove(t, "s", undefined, k)!.kind).toBe(k);
    const seeded = pickMove(t, "s")!.kind;
    const illegal = (["trouble", "shut", "delay", "hurt", "spoil", "sour", "cold", "brand"] as const).find((k) => !legal.includes(k));
    if (illegal) expect(pickMove(t, "s", undefined, illegal)!.kind).toBe(seeded);
  });
});

describe("the builder writes what hurts each foe, from the world's own list", () => {
  test("the shape asks for it only where a foe stands, naming the kit's list", () => {
    const base = SKELETONS.rescue;
    const shape = designOf(base, ["salt", "iron"]);
    for (const st of base.stops) {
      const asked = (shape.stops[st.id] as Record<string, unknown>).hurt_by;
      if (st.foe) expect(String(asked)).toContain("salt, iron");
      else expect(asked).toBeUndefined();
    }
  });

  test("a whole stop's weaknesses are kept as short plain tags; markup is not", () => {
    const sk = SKELETONS.rescue;
    const base = { ...sk, stops: sk.stops.map((x, i) => (i === 0 ? { ...x, foe: { ratings: {}, hurtBy: ["numbers"] } } : x)) };
    const st = base.stops[0]!;
    const whole = (hurt: unknown[]) => ({
      stops: {
        [st.id]: {
          face: "The Salt Gate",
          situation: "A brine-wraith guards the gate, and it hates the salt.",
          teaser: "a gate that weeps brine",
          levers: Object.fromEntries(st.levers.map((l, i) => [leverKey(st, l), `a sack of salt ${i}`])),
          ...(st.reward ? { reward: "Past it, what was kept here is yours." } : {}),
          ...(st.person ? { person: { name: "Oda", who: "the gatekeeper", wants: "her brother back", age: "adult" } } : {}),
          hurt_by: hurt,
        },
      },
    });
    const built = applyWords(base, { name: "Tess" } as never, whole(["Salt", "iron", "<b>x</b>"]), "s");
    const keep = built.adv.stops.find((x) => x.id === st.id)!;
    expect(built.missing).not.toContain(`stop:${st.id}`);
    expect(keep.foe!.hurtBy).toEqual(["salt", "iron"]);
    // Without any, the foe keeps the road's own.
    const none = applyWords(base, { name: "Tess" } as never, whole([]), "s").adv.stops.find((x) => x.id === st.id)!;
    expect(none.foe!.hurtBy).toEqual(["numbers"]);
  });
});
