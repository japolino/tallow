/**
 * More than one kind of throw (docs/SYSTEMS.md, 7): two dice keeping the worse (a mark against you), saves, and the
 * narrator's own die for questions only luck can settle.
 */
import { describe, expect, test } from "bun:test";
import { COURIER, RESCUE } from "../src/content/adventures.js";
import type { Ability } from "../src/engine/abilities.js";
import { arrive, attempt, startTrip, type Trip } from "../src/engine/adventure.js";
import { playRound, startContest, type Contest } from "../src/engine/contest.js";
import { d20Odds, d20OddsBest, d20OddsWorst, rollD20, seededRng } from "../src/engine/dice.js";
import { AGAINST_MAX, applyMove, movesHere, pickMove } from "../src/engine/dread.js";
import { canLuck, cleanFact, LUCK_YES, luckRead, throwLuck } from "../src/engine/luck.js";
import { leverLeft, nameCheck, WAYS, type Against } from "../src/engine/moment.js";
import { SAVE_TARGET, saveOdds, throwSave } from "../src/engine/save.js";
import { checkHeading, checkSaid } from "../src/engine/tell.js";
import { dangerSaveSaid, luckAsk, luckNote, luckSaid, moveRule, roundSaid, saveAsk, saveSaid } from "../src/engine/tell-adventure.js";
import { direct, type Table } from "../src/game/director.js";
import { standIns } from "../src/game/minds.js";
import { luckMessages, parseLuck } from "../src/game/prompts.js";

const watched: Against = { id: "against:test:1", way: "force", name: "they are ready for you" };
const atMill = (seed = "th", against: Against[] = []): Trip => arrive({ ...startTrip(RESCUE, COURIER, seed), against }, "mill")!.trip;
const open = (t: Trip) => WAYS.filter((w) => t.facing!.moment.stop.ways[w] && !t.facing!.moment.closed.includes(w));

/** A seed at which the narrator's die shows yes (or no) at the mill. */
function luckSeed(yes: boolean): string {
  for (let i = 0; i < 500; i++) if (rollD20(seededRng(`l${i}:luck:mill`)) >= LUCK_YES === yes) return `l${i}`;
  throw new Error("no seed");
}

describe("two dice, keep the worse", () => {
  test("the odds are counted over every pair, and mirror keeping the better", () => {
    for (const [add, target] of [[0, 11], [3, 14], [5, 12]] as const) {
      const one = d20Odds(add, target, 0).success, best = d20OddsBest(add, target, 0).success, worst = d20OddsWorst(add, target, 0).success;
      expect(worst).toBeLessThan(one);
      expect(best).toBeGreaterThan(one);
      // Keeping the higher and keeping the lower of two dice, together, are two plain throws.
      expect(best + worst).toBeCloseTo(2 * one, 10);
    }
  });

  test("a mark against your way makes your next try that way throw two and keep the worse; then it is used up", () => {
    const t = atMill("th", [watched]);
    const m = t.facing!.moment;
    expect(m.against).toEqual([watched]);
    const check = nameCheck(m, { way: "force", stat: "brawn", lever: null })!;
    expect(check.bane).toEqual(watched);
    expect(checkSaid(check).join(" ")).toContain("the worse one counts");
    expect(checkHeading(check)).toContain("two dice, the worse");
    // A try another way is not touched by it.
    expect(nameCheck(m, { way: "talk", stat: "charm", lever: null })!.bane).toBeNull();
    const turn = attempt(t, { way: "force", stat: "brawn", lever: null })!;
    const [a, b] = turn.outcome.naturals!;
    expect(turn.outcome.natural).toBe(Math.min(a, b));
    expect(turn.againstUsed).toEqual(watched);
    expect(turn.trip.against ?? []).toEqual([]);
    expect(turn.trip.facing?.moment.against ?? []).toEqual([]);
  });

  test("an edge and a mark against you cancel: one die, as usual", () => {
    const coin: Ability = { id: "coin", name: "Lucky Coin", looks: "A coin that lands well.", does: "edge", much: 1, ways: [], tags: [], often: "always", store: true, card: "token" };
    const t = arrive({ ...startTrip(RESCUE, COURIER, "th", [coin]), against: [{ ...watched, way: "sneak" }] }, "mill")!.trip;
    const read = { way: "sneak" as const, stat: "grace" as const, lever: null, ability: "coin" };
    const check = nameCheck(t.facing!.moment, read)!;
    expect(check.edge).toBe(true);
    expect(check.bane?.way).toBe("sneak");
    expect(checkSaid(check).join(" ")).toContain("cancels your two dice");
    const turn = attempt(t, read)!;
    expect(turn.outcome.naturals).toBeUndefined();
    // Cancelled or not, the slip is used up by the try.
    expect(turn.trip.against ?? []).toEqual([]);
  });

  test("a mark against you carries to the next place, and lasts until it is used", () => {
    const t = atMill("th", [watched]);
    const talked = attempt(t, { way: "talk", stat: "charm", lever: null })!;
    expect(talked.trip.against).toEqual([watched]);
  });
});

describe("the narrator's brand", () => {
  test("it writes a slip against a way still open here and not marked yet, at most two at once", () => {
    const t = atMill("br");
    const mv = pickMove(t, "x", ["brand"])!;
    expect(mv.kind).toBe("brand");
    expect(open(t)).toContain(mv.against!.way);
    const branded = applyMove(t, mv);
    expect(branded.against).toEqual([mv.against!]);
    expect(branded.facing!.moment.against).toEqual([mv.against!]);
    expect(moveRule(mv)).toContain("the worse one counts");
    // Never twice against the same way; never more than the most.
    const again = pickMove(branded, "y", ["brand"]);
    if (again) expect(again.against!.way).not.toBe(mv.against!.way);
    const full = { ...branded, against: Array.from({ length: AGAINST_MAX }, (_, i) => ({ ...watched, id: `a${i}` })) };
    expect(movesHere(full, ["brand"]).length).toBe(0);
  });
});

describe("saves", () => {
  test("the die plus the best fitting stat, 12 or more; a 20 always keeps it off, a 1 never", () => {
    const s = throwSave(COURIER, ["brawn", "wits"], "a");
    expect(s.stat).toBe("brawn");
    expect(s.add).toBe(1);
    expect(s.target).toBe(SAVE_TARGET);
    expect(s.kept).toBe(s.natural === 20 || (s.natural > 1 && s.natural + s.add >= SAVE_TARGET));
    expect(throwSave(COURIER, ["brawn", "wits"], "a")).toEqual(s);
    for (let i = 0; i < 300; i++) {
      const x = throwSave({ ...COURIER, stats: { ...COURIER.stats, brawn: 30 } }, ["brawn"], `s${i}`);
      if (x.natural === 1) expect(x.kept).toBe(false);
      const y = throwSave({ ...COURIER, stats: { ...COURIER.stats, brawn: 0 } }, ["brawn"], `s${i}`);
      if (y.natural === 20) expect(y.kept).toBe(true);
    }
    expect(saveOdds(0)).toBeCloseTo(0.45, 10);
    expect(saveOdds(3)).toBeGreaterThan(saveOdds(1));
  });

  test("the words say what to throw, and how it went", () => {
    const s = { stat: "wits" as const, add: 2, target: 12, natural: 11, kept: true };
    expect(saveAsk(s, "it comes at you")).toBe("It comes at you. Throw to keep it off you: the die plus your Wits (+2), 12 or more. Take a die from the box.");
    expect(saveSaid(s)).toContain("13");
    expect(saveSaid(s)).toContain("you keep it off");
    expect(saveSaid({ ...s, natural: 20 })).toContain("always");
    expect(saveSaid({ ...s, natural: 1, kept: false })).toContain("never");
    expect(saveSaid({ ...s, natural: 5, kept: false })).toContain("it reaches you");
  });

  test("a hurt move comes with a save: kept off, it costs no health", () => {
    const t = atMill("hu");
    const mv = pickMove(t, "x", ["hurt"])!;
    expect(mv.save).toBeDefined();
    const kept = { ...mv, save: { ...mv.save!, natural: 20, kept: true } };
    const lost = { ...mv, save: { ...mv.save!, natural: 1, kept: false } };
    expect(applyMove(t, kept).sheet.health).toBe(t.sheet.health);
    expect(applyMove(t, lost).sheet.health).toBe(t.sheet.health - 1);
    expect(moveRule(kept)).toContain("no health lost");
    expect(moveRule(lost)).toContain("1 health");
  });

  test("when the danger in a contest arrives, a kept save stops its notch", () => {
    const c: Contest = { ...startContest({ kind: "fight", name: "the old ford", holds: 2 }), danger: { id: "danger", name: "more of them coming", notches: 2, filled: 1 } };
    const keptSave = { stat: "brawn" as const, add: 1, target: 12, natural: 18, kept: true };
    const kept = playRound(c, "success", undefined, null, keptSave);
    expect(kept.round.danger!.came).toBe(true);
    expect(kept.round.danger!.save).toEqual(keptSave);
    expect(kept.round.landed).toBe(0);
    const missed = playRound(c, "success", undefined, null, { ...keptSave, natural: 4, kept: false });
    expect(missed.round.landed).toBe(1);
    const said = roundSaid(kept.round, kept.contest, "fight");
    expect(said).toContain(dangerSaveSaid(keptSave));
    expect(roundSaid(missed.round, missed.contest, "fight").join(" ")).toContain("A notch on your dial");
  });
});

describe("the narrator's die", () => {
  test("a yes lays the fact at the place, to lean on once; a no is only a no; once a place", () => {
    const yes = atMill(luckSeed(true));
    expect(canLuck(yes)).toBe(true);
    const y = throwLuck(yes, { fact: "A boat tied at the jetty.", way: "sneak" })!;
    expect(y.luck.yes).toBe(true);
    expect(y.luck.natural).toBeGreaterThanOrEqual(LUCK_YES);
    const lever = y.trip.facing!.moment.stop.levers.find((l) => l.id === "luck:mill")!;
    expect(lever).toEqual(y.luck.mark!);
    expect(lever.name).toBe("a boat tied at the jetty");
    expect(lever.mark).toBe(true);
    expect(leverLeft(y.trip.facing!.moment, lever)).toBe(true);
    expect(canLuck(y.trip)).toBe(false);
    expect(throwLuck(y.trip, { fact: "another boat", way: "sneak" })).toBeNull();

    const no = throwLuck(atMill(luckSeed(false)), { fact: "a boat", way: "sneak" })!;
    expect(no.luck.yes).toBe(false);
    expect(no.luck.mark).toBeNull();
    expect(no.trip.facing!.moment.stop.levers.some((l) => l.id.startsWith("luck:"))).toBe(false);
    expect(no.trip.facing!.moment.lucked).toBe(true);
  });

  test("the fact helps the way asked, or the easiest open one if that is shut", () => {
    const t = atMill(luckSeed(true));
    const shut = { ...t, facing: { ...t.facing!, moment: { ...t.facing!.moment, closed: ["sneak" as const] } } };
    const y = throwLuck(shut, { fact: "a boat", way: "sneak" })!;
    expect(y.luck.mark!.way).not.toBe("sneak");
    expect(open(shut)).toContain(y.luck.mark!.way);
  });

  test("the rules hear a question for luck, and only that", () => {
    expect(luckRead("Is there a boat at the jetty?")).toBe("a boat at the jetty");
    expect(luckRead("are there any guards asleep")).toBe("some guards asleep");
    expect(luckRead("So, could there be a back door?")).toBe("a back door");
    expect(luckRead("What does the miller want?")).toBeNull();
    expect(luckRead("I sneak past the guard")).toBeNull();
    expect(cleanFact('"A *boat* by the jetty!"')).toBe("a boat by the jetty");
  });

  test("a model's reading is checked: luck true, a short fact, a way that is open", () => {
    const m = atMill().facing!.moment;
    expect(luckMessages("Is there a boat?", m)[0]!.content).toContain('"luck"');
    expect(parseLuck('{"luck": true, "fact": "a boat at the jetty", "way": "sneak"}', m)).toEqual({ fact: "a boat at the jetty", way: "sneak" });
    expect(parseLuck('{"luck": false, "fact": "x y z", "way": "sneak"}', m)).toBeNull();
    expect(parseLuck('{"luck": true, "fact": "a boat", "way": "fly"}', m)!.way).toBe(open(atMill())[0]);
    expect(parseLuck("not json", m)).toBeNull();
  });

  test("the words: what is thrown, and what it came to", () => {
    expect(luckAsk("a boat at the jetty")).toContain(`On ${LUCK_YES} or more, yes`);
    const y = throwLuck(atMill(luckSeed(true)), { fact: "a boat at the jetty", way: "sneak" })!.luck;
    const [verdict, rule] = luckSaid(y, "a boat at the jetty");
    expect(verdict).toContain("Yes: a boat at the jetty.");
    expect(rule).toContain("a step easier");
    const n = throwLuck(atMill(luckSeed(false)), { fact: "a boat", way: "sneak" })!.luck;
    expect(luckSaid(n, "a boat")).toEqual([`My die shows ${n.natural}. No: it is not so.`]);
    expect(luckNote(n, "a boat at the jetty")).toContain("there is no boat at the jetty");
  });
});

/** A table that writes the given lines, then tries the first way still open; and keeps a record of what it is told to do. */
function scripted(lines: string[], log: string[]): { table: Table; set(d: { trip: Trip; stage: string }): void } {
  let d!: { trip: Trip; stage: string };
  const table: Table = {
    say: async (l) => void log.push(...l),
    write: async () => {
      const m = d.trip.facing?.moment;
      const way = m && (["sneak", "talk", "force", "pay"] as const).find((w) => nameCheck(m, { way: w }));
      const line = lines.shift() ?? (d.stage === "camp" ? "I press on" : { sneak: "I creep past quietly", talk: "I ask them kindly", force: "I shove my way through", pay: "I pay the toll" }[way ?? "sneak"]);
      log.push(`> ${line}`);
      return { line, given: Promise.resolve() };
    },
    page: async () => {},
    aside: async () => {},
    wait: async (_b, w) => w,
    weigh: async () => {},
    dieOrLine: async () => null,
    throwDie: async (n) => void log.push(`throw ${n}`),
    luck: async (n) => void log.push(`luck ${n}`),
    against: async (list) => void log.push(`against ${list.map((a) => a.way).join(",")}`),
    carry: async () => {},
    clock: () => {},
    deal: async () => {},
    turn: async () => {},
    clear: async () => {},
    fork: async (s) => s[0]!.id,
    offer: async () => 0,
    give: async (c) => void log.push(`give ${c.id}`),
    take: async (id) => void log.push(`take ${id}`),
    rival: async () => {},
    move: async () => {},
  };
  return { table, set: (x) => (d = x) };
}

describe("at the table", () => {
  test("a question for luck is thrown by the narrator, once a place; a yes is a card on your side until it is used", async () => {
    const seed = luckSeed(true);
    const log: string[] = [];
    const q = scripted(["Is there a boat at the jetty?", "Is there a ladder by the wheel?"], log);
    const d = direct(RESCUE, COURIER, seed, q.table, standIns(0));
    q.set(d);
    await d.done;
    const asked = log.indexOf("> Is there a boat at the jetty?");
    const thrown = log.findIndex((l, i) => i > asked && l.startsWith("luck "));
    expect(thrown).toBeGreaterThan(asked);
    expect(log[thrown - 1]).toBe(luckAsk("a boat at the jetty"));
    expect(log[thrown + 1]).toContain("Yes: a boat at the jetty.");
    const given = log.indexOf("give luck:mill");
    expect(given).toBeGreaterThan(thrown);
    expect(log.indexOf("take luck:mill")).toBeGreaterThan(given);
    // The second question at the same place is only answered: the narrator's die is thrown once a place.
    const second = log.indexOf("> Is there a ladder by the wheel?");
    expect(log.slice(second, second + 4).some((l) => l.startsWith("luck "))).toBe(false);
  });
});
