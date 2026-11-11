/**
 * Contests (docs/SYSTEMS.md, 6): the dials, a round, giving in and being taken out, and the words that tell them.
 * All names here are made up for the tests.
 */
import { describe, expect, test } from "bun:test";
import { COURIER, RESCUE } from "../src/content/adventures.js";
import { arrive, attempt, startTrip, TAKEN_HOURS, withContest, YIELD_HOURS, yieldContest, type Trip } from "../src/engine/adventure.js";
import { CARD_KINDS } from "../src/engine/cards.js";
import { blowFor, coming, contestKind, foeNamed, isContest, notchesFor, playRound, renamed, startContest, yieldRead, type Contest } from "../src/engine/contest.js";
import { rollD20, seededRng } from "../src/engine/dice.js";
import type { Read } from "../src/engine/moment.js";
import { blowLine, contestSaid, roundSaid, yieldSaid } from "../src/engine/tell-adventure.js";
import { parseContest } from "../src/game/prompts.js";

const placeCard = CARD_KINDS.find((k) => k.family === "place")!.id;
const fight = (holds = 2) => startContest({ kind: "fight", name: "the old ford", holds });
const total = (c: Contest) => c.foes.reduce((n, f) => n + f.notches, 0);

describe("the dials", () => {
  test("a stop is a contest when it takes more than one good try", () => {
    expect(isContest({ kind: "fight", holds: 2 })).toBe(true);
    expect(isContest({ kind: "person", holds: 1 })).toBe(false);
    expect(isContest({ kind: "obstacle" })).toBe(false);
    expect(contestKind({ kind: "fight" })).toBe("fight");
    expect(contestKind({ kind: "person" })).toBe("words");
    expect(contestKind({ kind: "obstacle" })).toBe("struggle");
  });

  test("the foes hold two notches for every good try; yours and the danger's are sized to them", () => {
    const c = fight(2);
    expect(total(c)).toBe(4);
    expect(c.you.notches).toBe(4);
    expect(c.danger!.notches).toBe(5);
    const long = fight(3);
    expect(total(long)).toBe(6);
    expect(long.you.notches).toBe(6);
    expect(long.danger!.notches).toBe(7);
  });

  test("with no model, the foe is named from what the stop shows", () => {
    expect(startContest({ kind: "person", name: "the square", card: placeCard, holds: 2 }).foes[0]!.name).toBe("the people here");
    expect(startContest({ kind: "fight", name: "the tower", card: placeCard, holds: 2 }).foes[0]!.name).toBe("the ones who hold it");
    expect(fight().foes[0]!.name).toBe("the old ford");
  });

  test("a model's names: two foes share the notches (the second always 2), and nothing changes after the first round", () => {
    const c = renamed(fight(3), { foes: ["Captain Orrin", "his \"two\" hounds", "a third one"], danger: "the bell tower ringing" });
    expect(c.foes.map((f) => [f.name, f.notches])).toEqual([
      ["Captain Orrin", 4],
      ["his two hounds", 2],
    ]);
    expect(c.danger!.name).toBe("the bell tower ringing");
    expect(total(c)).toBe(6);
    const later = { ...c, round: 1 };
    expect(renamed(later, { foes: ["someone else"] })).toBe(later);
    // Unfit names are left to code.
    expect(renamed(fight(), { foes: [7, ""], danger: "x" }).foes[0]!.name).toBe("the old ford");
  });

  test("a line goes for the foe it names; otherwise for none", () => {
    const c = renamed(fight(3), { foes: ["Captain Orrin", "his hounds"] });
    expect(foeNamed("I kick the nearest of the hounds away", c)).toBe("foe1");
    expect(foeNamed("I go straight for Orrin", c)).toBe("foe0");
    expect(foeNamed("I run", c)).toBeNull();
    expect(coming(c)!.id).toBe("foe0");
  });
});

describe("a round", () => {
  test("notches for a try: 2 when it works at all, 3 when better than hoped, one more for using what is there, none when it fails", () => {
    expect(notchesFor("success")).toBe(2);
    expect(notchesFor("partial")).toBe(2);
    expect(notchesFor("crit_success")).toBe(3);
    expect(notchesFor("success", "grounded")).toBe(3);
    expect(notchesFor("crit_success", "inspired")).toBe(4);
    expect(notchesFor("fail", "inspired")).toBe(0);
    expect(notchesFor("crit_fail")).toBe(0);
  });

  test("the blow lands on a cost or a failure, twice on a bad one", () => {
    expect(blowFor("crit_success")).toBe(0);
    expect(blowFor("success")).toBe(0);
    expect(blowFor("partial")).toBe(1);
    expect(blowFor("fail")).toBe(1);
    expect(blowFor("crit_fail")).toBe(2);
  });

  test("what is more than the target has left goes on to the next foe", () => {
    const c = renamed(fight(3), { foes: ["Captain Orrin", "his hounds"] });
    const { contest, round } = playRound(c, "crit_success", "grounded", "foe1");
    expect(round.target.id).toBe("foe1");
    expect(round.hit).toBe(4);
    expect(round.hits.map((h) => [h.id, h.n])).toEqual([
      ["foe1", 2],
      ["foe0", 2],
    ]);
    expect(round.beaten.map((b) => b.id)).toEqual(["foe1"]);
    expect(contest.foes.map((f) => f.filled)).toEqual([2, 2]);
    expect(round.landed).toBe(0);
    expect(contest.danger!.filled).toBe(1);
    expect(contest.round).toBe(1);
  });

  test("the danger fills a notch a round; when full it is here, lands a notch, and its dial goes", () => {
    let c: Contest = { ...fight(2), danger: { id: "danger", name: "more of them coming", notches: 2, filled: 1 } };
    const r = playRound(c, "success", undefined);
    expect(r.round.danger!.came).toBe(true);
    expect(r.round.landed).toBe(1);
    expect(r.contest.danger).toBeNull();
    expect(r.contest.you.filled).toBe(1);
    c = r.contest;
    expect(playRound(c, "success", undefined).round.danger).toBeNull();
  });

  test("filling every foe wins, and nothing lands then; filling your own dial takes you out", () => {
    const won = playRound({ ...fight(2), foes: [{ id: "foe0", name: "the old ford", notches: 4, filled: 2 }] }, "partial", undefined);
    expect(won.round.won).toBe(true);
    expect(won.round.landed).toBe(0);
    expect(won.round.danger).toBeNull();
    const lost = playRound({ ...fight(2), you: { id: "you", name: "how much you can take", notches: 4, filled: 3 } }, "crit_fail", undefined);
    expect(lost.round.taken).toBe(true);
    expect(lost.contest.you.filled).toBe(4);
  });

  test("giving in is read from the player's own words, not from talk of someone else giving in", () => {
    expect(yieldRead("I give up, you win")).toBe(true);
    expect(yieldRead("Enough. I yield.")).toBe(true);
    expect(yieldRead("We surrender")).toBe(true);
    expect(yieldRead("I will never give up")).toBe(false);
    expect(yieldRead("I tell him to surrender")).toBe(false);
    expect(yieldRead("I don't back down")).toBe(false);
  });
});

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
const atFord = (): Trip => go(throwAt(go(startTrip(RESCUE, COURIER, "test"), "mill"), { way: "sneak" }, 18).trip, "crossing");

describe("in a trip", () => {
  test("giving in at an ordinary place: out of it whole, beyond it, with nothing, half an hour on", () => {
    const t = atFord();
    const y = yieldContest(t)!;
    expect(y.facing).toBeNull();
    expect(y.at).toBe("crossing");
    expect(y.party).toEqual(t.party);
    expect(y.sheet.hour).toBe(t.sheet.hour + YIELD_HOURS);
    expect(yieldSaid(y)[0]).toContain("give in");
    // Nothing to give in to with no contest in the way.
    expect(yieldContest(y)).toBeNull();
  });

  test("giving in at the last place loses the story", () => {
    const t = atFord();
    const last: Trip = { ...t, facing: { ...t.facing!, stop: { ...t.facing!.stop, climax: true } } };
    expect(yieldContest(last)!.over).toBe("yielded");
  });

  test("taken out at an ordinary place: beyond it hours later, a supply short, nothing gained, and word goes ahead", () => {
    let t = atFord();
    const supplies = t.sheet.supplies;
    let turn = throwAt(t, { way: "talk" }, 1);
    for (let i = 0; i < 4 && !turn.taken; i++) turn = throwAt(turn.trip, { way: "talk" }, 1);
    expect(turn.taken).not.toBeNull();
    t = turn.trip;
    expect(t.facing).toBeNull();
    expect(t.at).toBe("crossing");
    expect(t.party).toEqual([]);
    expect(t.warned).toBe(1);
    expect(t.sheet.supplies).toBe(Math.max(0, supplies - 1));
    if (turn.taken !== "end" && !turn.fell) expect(turn.taken!.hours).toBe(TAKEN_HOURS);
  });

  test("a sitting kept from before contests gets its contest set out", () => {
    const t = atFord();
    const old: Trip = { ...t, facing: { ...t.facing!, contest: undefined } };
    expect(withContest(old).facing!.contest!.foes.length).toBe(1);
    expect(withContest(t)).toBe(t);
  });
});

describe("the words", () => {
  test("the narrator sets out the dials and the rules in plain words", () => {
    const c = renamed(fight(3), { foes: ["Captain Orrin", "his hounds"] });
    const said = contestSaid(c).join(" ");
    expect(said).toContain("Captain Orrin, a dial of 4 and his hounds, a dial of 2");
    expect(said).toContain("how much you can take, 6 notches");
    expect(said).toContain("more of them coming: a dial of 7");
    expect(contestSaid(c, true).join(" ")).toContain("loses the story");
    expect(blowLine(c)).toContain("Captain Orrin");
  });

  test("a round is told one dial at a time", () => {
    const c = renamed(fight(3), { foes: ["Captain Orrin", "his hounds"] });
    const r = playRound(c, "partial", undefined, "foe1");
    const lines = roundSaid(r.round, r.contest, "fight");
    expect(lines[0]).toBe("2 notches on his hounds' dial, and it is full: his hounds, down or done with.");
    expect(lines).toContain("It lands: a notch on your dial, 1 of 6.");
    expect(lines).toContain("More of them coming: 1 of 7.");
    const miss = playRound(c, "fail", undefined);
    expect(roundSaid(miss.round, miss.contest, "fight")).toContain("No notch on any dial.");
  });

  test("a model's names are taken from its JSON, and only if they are short", () => {
    expect(parseContest('Here: {"foes": ["Captain Orrin", "a crowd of very angry dock workers by the water"], "danger": "the tide"}')).toEqual({ foes: ["Captain Orrin"], danger: "the tide" });
    expect(parseContest("no json here")).toEqual({});
  });
});
