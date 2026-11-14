/**
 * The ring (src/game/systems/fight.ts, ringShow; src/room/props/ring.ts): what a fight puts on the table. One Show of
 * kind "fight" while a fight or a contest is on, with every word and every line the room may write; the saves as
 * counters only while there is none; the narrator's lesson. The models are faked.
 */
import { describe, expect, test } from "bun:test";
import { fightOf, makeContest, SAVE_COST, viewFight, YOU, type Draft } from "../src/engine/fight.js";
import { USUAL } from "../src/engine/rules.js";
import { attributesFrom, MAX_HP, meet, newRun, person, type Run } from "../src/engine/run.js";
import type { Message, Role } from "../src/game/ask.js";
import { lessonOf, showsOf, turn } from "../src/game/runturn.js";
import type { RunDeps, Settling, Show } from "../src/game/system.js";
import { CONTEST_LESSON, fight, RING_LESSON, RING_LINES_MOST, RING_SEEN_MOST, RING_WORDS, ringShow } from "../src/game/systems/fight.js";

type Ring = Extract<Show, { kind: "fight" }>;

const start = (): Run => {
  const r = newRun(7, "a world", "a hero", "Jay");
  r.sheet.attributes = attributesFrom(["strength"]);
  r.opening = "A goblin stands in the road.";
  r.place = { name: "Forest road", text: "" };
  meet(r, { name: "Goblin", text: "A wiry thing with a notched cleaver.", power: 2, hostile: true });
  return r;
};

const DRAFT = (over: Partial<Draft> = {}): Draft => ({
  name: "The chase through the market",
  rating: 3,
  sides: [{ name: "Jay", against: false, members: [YOU, "Mara"] }, { name: "The thieves", against: true, members: ["Goblin", "Fence"] }, { name: "The watch", against: false, members: ["Sergeant"] }],
  measures: [
    { name: "Jay's lead", length: "short", start: "middle", atFull: "win", atEmpty: "lose", good: "up" },
    { name: "The crowd", length: "medium", start: "middle", atFull: "none", atEmpty: "none", good: "down" },
  ],
  lines: ["I run harder", "I cut through a stall", "I hide"],
  ...over,
});

/** A market with a foe, a friend, someone on the foe's side who is not fighting, and a third party. */
const market = (): Run => {
  const r = start();
  meet(r, { name: "Mara", text: "Your sister, quick with a sling.", power: 3 });
  meet(r, { name: "Fence", text: "He buys what the thieves bring.", power: 1 });
  meet(r, { name: "Sergeant", text: "Of the market watch.", power: 5 });
  fightOf(r).contest = makeContest(r, DRAFT());
  return r;
};

const settling = (o: Partial<Settling> = {}): Settling => ({ line: "I wait.", kind: "action", act: "wait", verdict: "challenge", target: null, item: null, ability: null, attribute: "strength", skill: "", roll: null, outcome: 0, ...o });

const only = (r: Run): Ring => {
  const shows = fight.shows!(r);
  expect(shows.map((s) => s.kind)).toEqual(["fight"]);
  return shows[0] as Ring;
};

describe("what a fight puts on the table", () => {
  test("with nobody to fight there is no ring, only the saves as counters; without saves, nothing", () => {
    const r = start();
    r.people[0]!.hostile = false;
    expect(ringShow(r)).toBeNull();
    expect(fight.shows!(r)).toEqual([{ kind: "tokens", id: "fight-saves", name: "Saves from a killing blow", count: 2, max: 2 }]);
    r.rules = { ...USUAL, saves: false };
    expect(fight.shows!(r)).toEqual([]);
  });

  test("a plain fight is one ring: each foe with health, power and the lines that can be written with them", () => {
    const r = start();
    r.people[0]!.hp = 62;
    const ring = only(r);
    expect(ring.name).toBe(RING_WORDS.fight);
    expect(ring.text).toBe("You are fighting Goblin.");
    expect(ring.sides).toEqual([]);
    expect(ring.measures).toEqual([]);
    expect(ring.others).toEqual([]);
    expect(ring.foes).toEqual([
      {
        id: "goblin",
        name: "Goblin",
        text: "A wiry thing with a notched cleaver.",
        hp: 62,
        max: MAX_HP,
        tier: 2,
        step: 0,
        odds: "Health 62 of 100. Power 2 of 7, about your match.",
        down: false,
        choices: [
          { say: "Attack them", line: "I attack Goblin " },
          { say: "Speak to them", line: "I say to Goblin: " },
          { say: "Use something on them", line: "On Goblin I use " },
        ],
      },
    ]);
    // With no contest, your own piece offers the line that attacks each foe.
    expect(ring.lines).toEqual([{ say: "Attack Goblin", line: "I attack Goblin " }]);
    expect(ring.you).toEqual({ name: "Jay", hp: 100, max: MAX_HP, text: `Health 100 of 100. Saves from a killing blow: 2 of 2. A blow that would bring you down costs one, and ${SAVE_COST} health, instead.` });
    expect(ring.saves).toEqual({ count: 2, max: 2 });
  });

  test("how a foe stands against you comes from the code's own steps of power, never from the room", () => {
    const r = start();
    const steps = [1, 2, 3, 4, 5, 6, 7].map((power) => {
      r.people[0]!.power = power;
      const f = only(r).foes[0]!;
      return [f.tier, f.step, f.odds.split(", ")[1]] as const;
    });
    // A first-level character stands on the second step of power.
    expect(steps).toEqual([
      [1, -1, "a little weaker than you."],
      [2, 0, "about your match."],
      [3, 1, "a little stronger than you."],
      [4, 2, "much stronger than you."],
      [5, 3, "far stronger than you."],
      [6, 3, "far stronger than you."],
      [7, 3, "far stronger than you."],
    ]);
  });

  test("where saves are played without, the ring has none and says nothing of them", () => {
    const r = start();
    r.rules = { ...USUAL, saves: false };
    const ring = only(r);
    expect(ring.saves).toBeUndefined();
    expect(ring.you.text).toBe("Health 100 of 100.");
  });

  test("a contest brings its name, its sides, its measures and its lines; everyone on a side has a piece, yours not listed", () => {
    const r = market();
    const ring = only(r);
    expect(ring.name).toBe("The chase through the market");
    expect(ring.sides).toEqual([
      { name: "Jay", stance: "yours", members: ["Mara"] },
      { name: "The thieves", stance: "against", members: ["Goblin", "Fence"] },
      { name: "The watch", stance: "other", members: ["Sergeant"] },
    ]);
    expect(ring.text).toBe("A fair test for you. Jay: you, Mara. The thieves, against you: Goblin, Fence. The watch: Sergeant.");
    // The one fighting you is a foe, with health; the rest stand by their side, with none.
    expect(ring.foes.map((f) => f.name)).toEqual(["Goblin"]);
    expect(ring.others.map((o) => [o.name, o.side, o.stance, o.odds])).toEqual([
      ["Mara", "Jay", "yours", "On your side. Power 3 of 7, a little stronger than you."],
      ["Fence", "The thieves", "against", "With The thieves, against you. Power 1 of 7, a little weaker than you."],
      ["Sergeant", "The watch", "other", "With The watch. Power 5 of 7, far stronger than you."],
    ]);
    // Nobody who is not fighting you is attacked from the ring.
    for (const o of ring.others) expect(o.choices).toEqual([{ say: "Speak to them", line: `I say to ${o.name}: ` }, { say: "Use something on them", line: `On ${o.name} I use ` }]);
    expect(ring.measures).toEqual([
      { id: "jay-s-lead~0", name: "Jay's lead", value: 3, max: 5, good: "up", atFull: "win", atEmpty: "lose", note: "3 of 5. Full, you win. Empty, you lose." },
      { id: "crowd~1", name: "The crowd", value: 6, max: 12, good: "down", atFull: "none", atEmpty: "none", note: "6 of 12. It ends nothing; less of it is better for you." },
    ]);
    // The contest's own lines as they were written, then the line that attacks each foe.
    expect(ring.lines).toEqual([
      { say: "I run harder", line: "I run harder" },
      { say: "I cut through a stall", line: "I cut through a stall" },
      { say: "I hide", line: "I hide" },
      { say: "Attack Goblin", line: "I attack Goblin " },
    ]);
  });

  test("never more lines than the screen it follows has buttons, and every id on the mat is its own", () => {
    const r = market();
    for (const name of ["Rat", "Rat", "Wolf", "Crow"]) r.people.push({ ...person(r, "Goblin")!, name, was: [] });
    const ring = only(r);
    expect(ring.lines).toHaveLength(RING_LINES_MOST);
    const ids = [...ring.foes, ...ring.others].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("rat");
    expect(ids).toContain("rat~2");
  });

  test("someone who goes with you stands on your side in a plain fight; the beaten, the gone and the dead have no piece of their own", () => {
    const r = start();
    const mara = meet(r, { name: "Mara", power: 3 })!;
    mara.follows = true;
    const gone = meet(r, { name: "Ferryman", power: 3 })!;
    gone.follows = true;
    gone.here = false;
    const ring = only(r);
    expect(ring.others.map((o) => [o.name, o.stance, o.side])).toEqual([["Mara", "yours", ""]]);
    expect(ring.text).toBe("You are fighting Goblin. With you: Mara.");
  });
});

describe("a foe brought down stays where they fell", () => {
  test("beaten or dead in the fight that is on, they lie on the mat with nothing to write; the fight stays on the table until the next line", () => {
    const r = start();
    meet(r, { name: "Rat", power: 1, hostile: true });
    // A turn begins: whoever is fighting is kept by name.
    fight.settle!(r, settling(), { flee: false, over: false });
    expect(viewFight(r).seen).toEqual(["Goblin", "Rat"]);
    // The goblin is beaten, as the turn's own read-back writes it down.
    Object.assign(person(r, "Goblin")!, { hp: 0, hostile: false });
    let ring = only(r);
    expect(ring.foes.map((f) => [f.name, f.down, f.hp, f.odds, f.choices.length])).toEqual([["Rat", false, 100, "Health 100 of 100. Power 1 of 7, a little weaker than you.", 3], ["Goblin", true, 0, RING_WORDS.beaten, 0]]);
    expect(ring.text).toBe("You are fighting Rat.");
    expect(ring.lines).toEqual([{ say: "Attack Rat", line: "I attack Rat " }]);
    // The rat is killed: nobody is left, and the ring still shows how it ended.
    Object.assign(person(r, "Rat")!, { hp: 0, hostile: false, dead: true, here: false });
    ring = only(r);
    expect(ring.foes.map((f) => [f.name, f.down, f.odds])).toEqual([["Goblin", true, RING_WORDS.beaten], ["Rat", true, RING_WORDS.dead]]);
    expect(ring.text).toBe("Nobody is left fighting you.");
    expect(ring.lines).toEqual([]);
    // Nothing is taught of a fight that is over.
    expect(fight.teach!(r)).toEqual([]);
    // The next line is played: the fight is cleared off the table, and the saves are counters again.
    fight.settle!(r, settling(), null);
    expect(viewFight(r).seen).toEqual([]);
    expect(fight.shows!(r).map((s) => s.kind)).toEqual(["tokens"]);
  });

  test("one who only left off, or got up again, is not lying there; a list of names never grows without end", () => {
    const r = start();
    fight.settle!(r, settling(), { flee: false, over: false });
    // Calmed: no longer fighting, unhurt. No fight is left, and nobody fell.
    person(r, "Goblin")!.hostile = false;
    expect(ringShow(r)).toBeNull();
    // Fighting again: a foe once more, standing.
    person(r, "Goblin")!.hostile = true;
    expect(only(r).foes.map((f) => f.down)).toEqual([false]);
    for (let i = 0; i < 40; i++) {
      meet(r, { name: `Rat ${i}`, power: 1, hostile: true });
      fight.settle!(r, settling(), { flee: false, over: false });
      person(r, `Rat ${i}`)!.here = false;
    }
    expect(viewFight(r).seen.length).toBeLessThanOrEqual(RING_SEEN_MOST);
  });
});

/* ------------------------------------------------- in a turn ------------------------------------------------- */

const JUDGE = {
  kind: "action", act: "attack the goblin", target: "Goblin", item: null, item_named: false, needs_item: null, ability: null, ability_named: false,
  verdict: "challenge", reason: "", attribute: "strength", skill: "Swords", for: [], against: [], scores: { physical: 0, likelihood: 0, item: null, ability: null, other: null },
};

function deps(back: unknown): RunDeps {
  return {
    systems: [fight],
    ask: async (messages: Message[], role: Role) => {
      const sys = messages[0]!.content;
      if (role === "teller") return "You strike, and the goblin goes down.";
      if (sys.includes("You read one line a player wrote")) return JSON.stringify({ flee: false, over: false, press: true });
      if (sys.includes("You keep the record of fights")) return JSON.stringify({ acted: true, got_away: false, begun: null });
      if (sys.includes("referee")) return JSON.stringify(JUDGE);
      if (sys.includes("records")) return JSON.stringify(back);
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
  };
}

describe("the ring, in a turn", () => {
  test("the line the ring writes for a foe is played like any other; the foe it brings down lies on the mat after it, and is gone a line later", async () => {
    const line = (ringShow(start())!.foes[0]!.choices[0]!.line + "with everything I have").trim();
    expect(line).toBe("I attack Goblin with everything I have");
    const d = deps({ beaten: ["Goblin"], minutes: 1 });
    const a = await turn(d, start(), line);
    expect(a.report.changes).toContain("Goblin is beaten.");
    const ring = showsOf(d, a.run).find((s): s is Ring => s.kind === "fight")!;
    expect(ring.foes).toMatchObject([{ name: "Goblin", down: true, hp: 0 }]);
    expect(showsOf(d, a.run).some((s) => s.kind === "tokens" || s.kind === "bar" || s.kind === "card")).toBe(false);
    const b = await turn(deps({ minutes: 1 }), a.run, "I catch my breath.");
    expect(showsOf(d, b.run).map((s) => s.kind)).toEqual(["tokens"]);
  });
});

describe("what the narrator says of it", () => {
  test("the ring is explained the first time a fight is on, and a contest's measures the first time one is under way", () => {
    const calm = start();
    calm.people[0]!.hostile = false;
    expect(fight.teach!(calm)).toEqual([]);
    expect(fight.teach!(start())).toEqual([RING_LESSON]);
    expect(fight.teach!(market())).toEqual([RING_LESSON, CONTEST_LESSON]);
    expect(RING_LESSON.key).toBe("fight");
    expect(CONTEST_LESSON.key).toBe("contest");
    for (const lesson of [RING_LESSON, CONTEST_LESSON]) {
      expect(lesson.lines.length).toBeGreaterThanOrEqual(2);
      expect(lesson.lines.length).toBeLessThanOrEqual(3);
      for (const l of lesson.lines) {
        expect(l.length).toBeLessThanOrEqual(240);
        expect(l).not.toMatch(/[<>{}]/);
      }
      // It says the thing is touched, and that a touch only offers.
      expect(lesson.lines.join(" ")).toContain("Touch");
      expect(lesson.lines.join(" ")).toMatch(/until you send/);
    }
    // Said once each in a run, the fight first.
    const d: RunDeps = { ask: async () => "", systems: [fight] };
    const r = market();
    expect(lessonOf(d, r)).toBe(RING_LESSON);
    expect(lessonOf(d, r)).toBe(CONTEST_LESSON);
    expect(lessonOf(d, r)).toBeNull();
  });
});
