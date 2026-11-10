/**
 * The rules of a whole adventure (docs/DESIGN.md, 1.2): the road and its forks, the clock, resting, running out,
 * companions and things kept, and the words that tell it. Faces on the die are chosen by picking the seed.
 */
import { describe, expect, test } from "bun:test";
import { COURIER, COURTSHIP, RESCUE } from "../src/content/adventures.js";
import { isChild } from "../src/engine/card/child.js";
import { ahead, arrive, attempt, FALL_HOURS, HEALTH_MAX, LONG_WAY_HOURS, mapOf, prefers, rest, REST_HOURS, startTrip, unturned, type Trip } from "../src/engine/adventure.js";
import { CARD_KINDS, cardKind } from "../src/engine/cards.js";
import { rollD20, seededRng } from "../src/engine/dice.js";
import { nameCheck, type Read } from "../src/engine/moment.js";
import { campRead, forkRead, forkSaid, turnSaid } from "../src/engine/tell-adventure.js";
import { direct, type Table } from "../src/game/director.js";
import { standIns } from "../src/game/minds.js";
import { rulesRead } from "../src/meaning/read.js";

/** The trip with its stop's next throw showing `face`. */
function withFace(t: Trip, face: number): Trip {
  const m = t.facing!.moment;
  for (let i = 0; i < 5000; i++) {
    const seed = `s${i}`;
    if (rollD20(seededRng(`${seed}:${m.stop.id}:try:${m.tries}`)) === face) return { ...t, facing: { ...t.facing!, moment: { ...m, seed } } };
  }
  throw new Error(`no seed for ${face}`);
}
const go = (t: Trip, id: string): Trip => arrive(t, id)!.trip;
const throwAt = (t: Trip, read: Read, face: number) => attempt(withFace(t, face), read)!;
const fresh = (): Trip => startTrip(RESCUE, COURIER, "test");

describe("the road", () => {
  test("starts where the adventure says, at its own hour, with every card face down", () => {
    const t = fresh();
    expect(t.at).toBe("ferry");
    expect(t.sheet.hour).toBe(RESCUE.startHour);
    expect(unturned(t).length).toBe(RESCUE.stops.length);
    expect(ahead(t).map((s) => s.id)).toEqual(["mill"]);
  });

  test("going on takes the road's hours and turns the card", () => {
    const a = arrive(fresh(), "mill")!;
    expect(a.hours).toBe(1);
    expect(a.trip.sheet.hour).toBe(RESCUE.startHour + 1);
    expect(a.trip.facing?.stop.id).toBe("mill");
    expect(unturned(a.trip).length).toBe(RESCUE.stops.length - 1);
    // Nowhere else can be gone to with something in the way.
    expect(ahead(a.trip)).toEqual([]);
    expect(arrive(a.trip, "bridge")).toBeNull();
  });

  test("getting past a stop gives what it holds, and the road splits after the mill", () => {
    const turn = throwAt(go(fresh(), "mill"), { way: "sneak" }, 18);
    expect(turn.cleared).toBe(true);
    expect(turn.trip.at).toBe("mill");
    expect(turn.trip.kept).toEqual(["token"]);
    expect(ahead(turn.trip).map((s) => s.id)).toEqual(["bridge", "crossing"]);
  });

  test("the map is drawn from the adventure", () => {
    const m = mapOf(RESCUE);
    expect(m.stops.length).toBe(RESCUE.places.length);
    expect(m.stops.find((s) => s.id === "keep")?.climax).toBe(true);
    expect(m.paths.length).toBe(RESCUE.roads.length);
  });

  test("every road leads to a stop or from the start, and every stop can be reached", () => {
    for (const adv of [RESCUE, COURTSHIP]) {
      const ids = new Set(adv.places.map((p) => p.id));
      for (const [a, b] of adv.roads) expect(ids.has(a) && ids.has(b)).toBe(true);
      for (const s of adv.stops) expect(adv.roads.some(([, b]) => b === s.id)).toBe(true);
      expect(adv.stops.filter((s) => s.climax).length).toBe(1);
      for (const s of adv.stops) cardKind(s.card);
    }
  });
});

describe("a stop that takes more than one good try", () => {
  test("a fight at the ford takes two, and a failure in between does not undo the first", () => {
    let t = go(throwAt(go(fresh(), "mill"), { way: "sneak" }, 18).trip, "crossing");
    expect(t.facing!.holds).toBe(2);
    let turn = throwAt(t, { way: "force" }, 18);
    expect(turn.more).toBe(true);
    expect(turn.cleared).toBe(false);
    expect(turn.trip.facing!.holds).toBe(1);
    turn = throwAt(turn.trip, { way: "talk" }, 2);
    expect(turn.trip.facing!.holds).toBe(1);
    // Here a failed way stays open; it is only harder.
    expect(turn.trip.facing!.moment.closed).toEqual([]);
    expect(turn.trip.facing!.moment.trouble).toBe(1);
    turn = throwAt(turn.trip, { way: "force" }, 20);
    expect(turn.cleared).toBe(true);
    expect(turn.trip.party).toEqual(["dov"]);
    t = turn.trip;
    expect(t.facing).toBeNull();
  });
});

describe("companions", () => {
  const withDov = (): Trip => go(throwAt(throwAt(go(throwAt(go(fresh(), "mill"), { way: "sneak" }, 18).trip, "crossing"), { way: "force" }, 18).trip, { way: "force" }, 18).trip, "tor");

  test("count one higher on their stat while they walk with you", () => {
    const t = withDov();
    expect(t.sheet.stats.brawn).toBe(COURIER.stats.brawn);
    expect(t.facing!.moment.sheet.stats.brawn).toBe(COURIER.stats.brawn + 1);
  });

  test("speak well of you when you go their way, and ill when you go the way they hate", () => {
    const t = withDov();
    const liked = throwAt(t, { way: "force" }, 19);
    expect(liked.opinions).toEqual([{ companion: RESCUE.companions[0]!, liked: true, goodwill: 1 }]);
    expect(liked.trip.sheet.goodwill).toBe(t.sheet.goodwill + 1);
    const hated = throwAt(t, { way: "pay" }, 19);
    expect(hated.opinions[0]!.liked).toBe(false);
    expect(hated.trip.sheet.goodwill).toBe(t.sheet.goodwill - 1);
  });

  test("say which card at a fork they would rather take", () => {
    const dov = RESCUE.companions[0]!;
    const [abbey, tor] = ["abbey", "tor"].map((id) => RESCUE.stops.find((s) => s.id === id)!);
    expect(prefers(dov, [abbey!, tor!])?.id).toBe("tor");
  });
});

describe("things kept", () => {
  test("make their way a step easier at a later stop, once, and are then given back", () => {
    let t = throwAt(go(fresh(), "mill"), { way: "sneak" }, 18).trip;
    t = go(t, "bridge");
    expect(t.facing!.moment.stop.levers.some((l) => l.id === "token")).toBe(true);
    const turn = throwAt(t, rulesRead("I show her Orla's token and ask to cross", t.facing!.moment)!, 3);
    expect(turn.outcome.check.lever?.id).toBe("token");
    expect(turn.used?.id).toBe("token");
    expect(turn.trip.kept).toEqual([]);
  });
});

describe("resting", () => {
  test("heals and eats, but takes hours, and word of you goes ahead", () => {
    const hurt: Trip = { ...throwAt(go(fresh(), "mill"), { way: "sneak" }, 18).trip };
    hurt.sheet = { ...hurt.sheet, health: 2 };
    const r = rest(hurt)!;
    expect(r.healed).toBe(2);
    expect(r.trip.sheet.health).toBe(4);
    expect(r.trip.sheet.supplies).toBe(hurt.sheet.supplies - 1);
    expect(r.trip.sheet.hour).toBe(hurt.sheet.hour + REST_HOURS);
    expect(go(r.trip, "bridge").facing!.moment.trouble).toBe(1);
  });

  test("with nothing to eat heals less, never past the most, and not with something in your way", () => {
    const t = fresh();
    expect(rest({ ...t, sheet: { ...t.sheet, health: 1, supplies: 0 } })!.healed).toBe(1);
    expect(rest({ ...t, sheet: { ...t.sheet, health: HEALTH_MAX } })!.healed).toBe(0);
    expect(rest(go(t, "mill"))).toBeNull();
  });
});

describe("running out", () => {
  test("with no health left you go down, and come to hours later with 1", () => {
    const t = go(fresh(), "mill");
    const low: Trip = { ...t, sheet: { ...t.sheet, health: 1 }, facing: { ...t.facing!, moment: { ...t.facing!.moment, sheet: { ...t.facing!.moment.sheet, health: 1 } } } };
    const turn = throwAt(low, { way: "force" }, 2);
    expect(turn.fell).toBe(FALL_HOURS);
    expect(turn.trip.sheet.health).toBe(1);
    expect(turn.trip.sheet.hour).toBeCloseTo(t.sheet.hour + 0.5 + FALL_HOURS, 9);
  });

  test("turned back at an ordinary stop, you go the long way round; at the last one, it is over", () => {
    let t = go(fresh(), "mill");
    for (const way of ["talk", "sneak", "force", "pay"] as const) {
      const turn = throwAt(t, { way }, 2);
      t = turn.trip;
      if (way === "pay") {
        expect(turn.longWay).toEqual({ hours: LONG_WAY_HOURS, supplies: 1 });
        expect(t.at).toBe("mill");
        expect(t.kept).toEqual([]);
      }
    }
    expect(ahead(t).length).toBe(2);
  });

  test("the clock: once it passes the deadline the job is lost", () => {
    const t = fresh();
    const late = { ...t, sheet: { ...t.sheet, hour: RESCUE.deadline.hour - 0.5 } };
    expect(arrive(late, "mill")!.trip.over).toBe("deadline");
  });

  test("a rival gains ground on every failure, and wins at the most", () => {
    let t = go(startTrip(COURTSHIP, COURIER, "x"), "stall");
    t = { ...t, rival: COURTSHIP.rival!.max - 1 };
    const turn = throwAt(t, { way: "talk" }, 2);
    expect(turn.rivalGained).toBe(true);
    expect(turn.trip.over).toBe("rival");
  });
});

describe("reading what is written between stops", () => {
  test("rest or press on", () => {
    for (const l of ["I rest", "we make camp for the night", "Sleep a few hours", "I bind my wounds and eat"]) expect([l, campRead(l)]).toEqual([l, "rest"]);
    for (const l of ["press on", "I keep going", "No rest, hurry", "onward", "I don't rest"]) expect([l, campRead(l)]).toEqual([l, "on"]);
  });

  test("which card at a fork", () => {
    const [bridge, crossing] = ["bridge", "crossing"].map((id) => RESCUE.stops.find((s) => s.id === id)!);
    const two = [bridge!, crossing!];
    expect(forkRead("the left one", two)).toBe("bridge");
    expect(forkRead("I take the one on the right", two)).toBe("crossing");
    expect(forkRead("the ford", two)).toBe("crossing");
    expect(forkRead("I'll go by the gorge", two)).toBe("bridge");
    expect(forkRead("hmm", two)).toBeNull();
    expect(forkSaid(fresh(), two, [1, 1.5], null).join(" ")).toContain("a fight");
  });

  test("the courted person is never read as a child", () => {
    expect(isChild(COURTSHIP.courted!.who)).toBe(false);
  });

  test("a stop that takes more says so, and only one card kind of each id", () => {
    const t = go(throwAt(go(fresh(), "mill"), { way: "sneak" }, 18).trip, "crossing");
    expect(turnSaid(throwAt(t, { way: "force" }, 18)).join(" ")).toContain("one more good try");
    expect(new Set(CARD_KINDS.map((k) => k.id)).size).toBe(CARD_KINDS.length);
  });
});

describe("the whole adventure, played by the director", () => {
  /** A table that writes the best plain line it can, and keeps a record of what was shown. */
  function quiet(log: string[]): { table: Table; set(d: { trip: Trip; stage: string }): void } {
    let d!: { trip: Trip; stage: string };
    const table: Table = {
      say: async (l) => void log.push(...l),
      write: async () => {
        if (d.stage === "camp") return { line: "I press on", given: Promise.resolve() };
        // The first way still open, in plain words.
        const m = d.trip.facing!.moment;
        const way = (["sneak", "talk", "force", "pay"] as const).find((w) => nameCheck(m, { way: w }));
        const line = { sneak: "I creep past quietly", talk: "I ask them kindly", force: "I shove my way through", pay: "I pay the toll" }[way ?? "sneak"];
        return { line, given: Promise.resolve() };
      },
      page: async () => {},
      aside: async () => {},
      wait: async (_b, w) => w,
      weigh: async () => {},
      dieOrLine: async () => null,
      throwDie: async () => {},
      carry: async () => {},
      clock: () => {},
      deal: async (s) => void log.push(`deal ${s.length}`),
      turn: async (s) => void log.push(`turn ${s.id}`),
      clear: async () => {},
      fork: async (s) => s[0]!.id,
      offer: async (c) => (log.push(`offer ${c.map((x) => x.id).join(" ")}`), 1),
      give: async (c) => void log.push(`give ${c.id}`),
      take: async () => {},
      rival: async () => {},
      move: async () => {},
    };
    return { table, set: (x) => (d = x) };
  }

  test("ends, one way or another, for many seeds of both adventures", async () => {
    for (const adv of [RESCUE, COURTSHIP]) {
      for (let i = 0; i < 25; i++) {
        const log: string[] = [];
        const q = quiet(log);
        const d = direct(adv, COURIER, `seed-${i}`, q.table, standIns(0));
        q.set(d);
        const t = await d.done;
        expect(t.over).not.toBeNull();
        expect(log[0]).toBe(`deal ${adv.stops.length}`);
        expect(log.some((l) => l.startsWith("turn "))).toBe(true);
      }
    }
  });
});
