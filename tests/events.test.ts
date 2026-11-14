/**
 * Events (src/engine/events.ts, src/game/systems/events.ts): what the world does unasked, and quick choices.
 */
import { describe, expect, test } from "bun:test";
import { draw, meet, newRun, type Run } from "../src/engine/run.js";
import { choicesOk, COOLDOWN, cutInChance, cutsIn, eligible, eventsOf, inFight, KINDS, offer, openQuest, passiveFact, pickKinds } from "../src/engine/events.js";
import type { Message, Role } from "../src/game/ask.js";
import { begin, sceneOf, showsOf, turn } from "../src/game/runturn.js";
import type { RunDeps } from "../src/game/system.js";
import { events } from "../src/game/systems/events.js";

const start = (seed = 7): Run => {
  const r = newRun(seed, "a world", "a hero", "Jay");
  r.opening = "A road at dusk.";
  r.place = { name: "Forest road", text: "" };
  r.turn = 5;
  return r;
};
const CAST = (r: Run, n: number): void => void ["Wren", "Moss", "Pike"].slice(0, n).forEach((name) => ((meet(r, { name }) ?? r.people.find((p) => p.name === name)!).follows = true));

describe("what may be offered", () => {
  test("the kinds of an arrival, of going on and of a plain action are not the same", () => {
    const r = start();
    const keys = (t: "arrival" | "going" | "action"): string[] => eligible(r, t).map((k) => k.key);
    expect(keys("arrival")).toEqual(expect.arrayContaining(["drawn_in", "scene", "approach"]));
    expect(keys("going")).not.toContain("drawn_in");
    expect(keys("action")).not.toContain("scene");
  });

  test("companions' kinds need companions, and quest kinds need an open quest to be plainly seen", () => {
    const r = start();
    const all = (): string[] => eligible(r, "going").map((k) => k.key);
    expect(all()).not.toContain("confides");
    CAST(r, 1);
    expect(all()).toContain("confides");
    expect(all()).not.toContain("banter");
    CAST(r, 2);
    expect(all()).toContain("banter");
    expect(all()).not.toContain("lead");
    r.sys = { quests: { quests: [{ title: "Find the ledger", status: "done" }] } };
    expect(all()).not.toContain("lead");
    r.sys = { quests: "unreadable" };
    expect(all()).not.toContain("lead");
    r.sys = { quests: { quests: [{ title: "Find the ledger", status: "open" }] } };
    expect(openQuest(r)).toBe("Find the ledger");
    expect(all()).toEqual(expect.arrayContaining(["lead", "complication"]));
  });

  test("something done earlier needs an earlier to come from", () => {
    const r = start();
    r.turn = 1;
    expect(eligible(r, "going").map((k) => k.key)).not.toContain("consequence");
    r.turn = 4;
    expect(eligible(r, "going").map((k) => k.key)).toContain("consequence");
  });

  test("a hazard is never offered to a character who is nearly down", () => {
    const r = start();
    expect(eligible(r, "going").map((k) => k.key)).toContain("hazard");
    r.sheet.hp = 25;
    expect(eligible(r, "going").map((k) => k.key)).not.toContain("hazard");
    r.sheet.hp = 26;
    expect(eligible(r, "going").map((k) => k.key)).toContain("hazard");
  });

  test("in a fight only what suits one is offered; a beaten foe is no fight", () => {
    const r = start();
    const foe = meet(r, { name: "Brute", hostile: true })!;
    expect(inFight(r)).toBe(true);
    expect(eligible(r, "action").map((k) => k.key)).toEqual(["turn_of_fight"]);
    expect(eligible(r, "arrival")).toEqual([]);
    foe.hp = 0;
    expect(inFight(r)).toBe(false);
    expect(eligible(r, "action").map((k) => k.key)).not.toContain("turn_of_fight");
    foe.hp = 100;
    foe.here = false;
    expect(inFight(r)).toBe(false);
  });
});

describe("how often", () => {
  test("a run replays the same: the same seed offers the same", () => {
    const play = (): string[][] => {
      const r = start(11);
      const seen: string[][] = [];
      for (let i = 0; i < 40; i++) {
        r.turn++;
        seen.push(offer(r, "going"));
        eventsOf(r).cooldown = Math.max(0, eventsOf(r).cooldown - 1);
      }
      return seen;
    };
    expect(play()).toEqual(play());
  });

  test("the chance is the game's own: more on arriving than going on, more than on an action", () => {
    const rate = (t: "arrival" | "going" | "action"): number => {
      let n = 0;
      for (let seed = 1; seed <= 600; seed++) {
        const r = start(seed);
        if (offer(r, t).length) n++;
      }
      return n / 600;
    };
    const [a, g, p] = [rate("arrival"), rate("going"), rate("action")];
    expect(a).toBeGreaterThan(0.5);
    expect(a).toBeLessThan(0.7);
    expect(g).toBeGreaterThan(0.33);
    expect(g).toBeLessThan(0.47);
    expect(p).toBeGreaterThan(0.14);
    expect(p).toBeLessThan(0.26);
  });

  test("not every turn: after an offer nothing comes for the cooldown, and never the same kind twice running", () => {
    const r = start(3);
    const rounds: { turn: number; keys: string[] }[] = [];
    for (let i = 0; i < 300; i++) {
      r.turn++;
      const st = eventsOf(r);
      const before = st.cooldown;
      const got = offer(r, "arrival");
      if (got.length) {
        expect(before).toBe(0);
        rounds.push({ turn: r.turn, keys: [...st.last] });
        expect(st.cooldown).toBe(COOLDOWN);
      }
      st.cooldown = Math.max(0, st.cooldown - 1);
    }
    expect(rounds.length).toBeGreaterThan(20);
    for (let i = 1; i < rounds.length; i++) {
      expect(rounds[i]!.turn - rounds[i - 1]!.turn).toBeGreaterThanOrEqual(COOLDOWN);
      for (const k of rounds[i]!.keys) expect(rounds[i - 1]!.keys).not.toContain(k);
    }
  });

  test("nothing at all while the cooldown runs, nor in the turn something cut in", () => {
    const r = start();
    eventsOf(r).cooldown = 2;
    for (let i = 0; i < 50; i++) expect(offer(r, "arrival")).toEqual([]);
    eventsOf(r).cooldown = 0;
    eventsOf(r).cutIn = r.turn;
    for (let i = 0; i < 50; i++) expect(offer(r, "arrival")).toEqual([]);
  });

  test("two are listed, and a kind comes round again only when the others have had their turn", () => {
    const r = start(5);
    const st = eventsOf(r);
    const from = eligible(r, "going");
    const seen: string[] = [];
    for (let i = 0; i < Math.floor(from.length / 2); i++) {
      st.last = [];
      const picks = pickKinds(r, st, from);
      expect(picks).toHaveLength(2);
      seen.push(...picks.map((k) => k.key));
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  test("the list always has a text for each kind, in plain words", () => {
    const r = start();
    CAST(r, 3);
    r.sys = { quests: { quests: [{ title: "Find it", status: "active" }] } };
    for (const k of KINDS) {
      const t = k.text({ followers: ["Wren", "Moss", "Pike"], quest: "Find it" }, (n) => n - 1);
      expect(t.length).toBeGreaterThan(20);
      expect(t).not.toMatch(/[<>{}]|undefined/);
    }
    expect(KINDS.find((k) => k.key === "banter")!.text({ followers: ["Wren", "Moss"], quest: null }, () => 0)).toBe("Wren and Moss, who both travel with the character, tease each other or trade banter.");
  });
});

describe("cutting in", () => {
  test("the reader's chance is kept to what is allowed, and a missing one is the game's default", () => {
    expect(cutInChance(undefined)).toBe(0.3);
    expect(cutInChance("x")).toBe(0.3);
    expect(cutInChance(5)).toBe(0.5);
    expect(cutInChance(0.4)).toBe(0.4);
    expect(cutInChance(9)).toBe(0.6);
    expect(cutInChance(0.01)).toBe(0.1);
  });

  test("it is rolled with the run's dice, starts the cooldown, and is not rolled in a fight or while one runs", () => {
    const r = start(2);
    expect(cutsIn(r, 0, false)).toBe(false);
    expect(eventsOf(r).cooldown).toBe(0);
    const used = r.n;
    expect(cutsIn(r, 1, false)).toBe(true);
    expect(r.n).toBeGreaterThan(used);
    expect(eventsOf(r).cooldown).toBe(COOLDOWN);
    expect(eventsOf(r).cutIn).toBe(r.turn);
    const n = r.n;
    expect(cutsIn(r, 1, false)).toBe(false);
    expect(r.n).toBe(n);
    const f = start();
    meet(f, { name: "Brute", hostile: true });
    expect(cutsIn(f, 1, false)).toBe(false);
  });

  test("nothing unwelcome cuts in on a character who is nearly down", () => {
    const r = start();
    r.sheet.hp = 10;
    expect(cutsIn(r, 1, true)).toBe(false);
    expect(cutsIn(r, 1, false)).toBe(true);
  });
});

describe("going on without a line", () => {
  test("the world moves, and from the third time running things begin to go against the character", () => {
    expect(passiveFact(0, "wait")).toContain("wait and let time pass");
    expect(passiveFact(1, "onward")).toContain("simply go on");
    expect(passiveFact(1, "onward")).not.toContain("ill luck");
    expect(passiveFact(2, "wait")).toContain("ill luck");
    expect(passiveFact(2, "wait")).toContain("nothing that hurts them badly");
  });
});

describe("quick choices that are kept", () => {
  const r = start();
  test("three different things to try, whole or not at all", () => {
    expect(choicesOk(r, ["Ask who sent him.", "Slip out the back", "1. Take the lamp"])).toEqual(["Ask who sent him", "Slip out the back", "Take the lamp"]);
    expect(choicesOk(r, ["Ask who sent him", "Slip out the back"])).toBeNull();
    expect(choicesOk(r, ["Ask him", "Ask her", "Take the lamp"])).toBeNull();
    expect(choicesOk(r, ["I ask him", "Slip out", "Take the lamp"])).toBeNull();
    expect(choicesOk(r, ["Jay asks him", "Slip out", "Take the lamp"])).toBeNull();
    expect(choicesOk(r, ["Wait", "Slip out", "Take the lamp"])).toBeNull();
    expect(choicesOk(r, ["Ask the one who sent him here and why they sent him", "Slip out", "Take the lamp"])).toBeNull();
    expect(choicesOk(r, ["Ask <who>", "Slip out", "Take the lamp"])).toBeNull();
  });
});

/* ------------------------------------------------- the hooks, with the models faked ------------------------------------------------- */

const JUDGE = { kind: "action", act: "creep past the guard", target: null, item: null, item_named: false, needs_item: null, ability: null, ability_named: false, verdict: "trivial", reason: "", attribute: "dexterity", skill: "Stealth", for: [], against: [], scores: { physical: 0, likelihood: 0, item: null, ability: null, other: null } };
const PASSAGE = "You slip along the wall while the guard looks the other way, and reach a door that stands ajar, a thin light spilling out from the room beyond it onto the flagstones.";

function deps(over: { plan?: unknown; choices?: unknown; planText?: string; story?: string } = {}): RunDeps & { told: Message[][]; seen: string[] } {
  const told: Message[][] = [], seen: string[] = [];
  return {
    told,
    seen,
    systems: [events],
    ask: async (messages: Message[], role: Role) => {
      const sys = messages[0]!.content;
      if (role === "builder") return JSON.stringify({ place: { name: "Gatehouse", text: "" }, calling: "Clerk", attributes: ["dexterity", "cunning", "strength"], skills: ["Stealth", "Running", "Lying", "Hiding"].map((name) => ({ name, level: 2 })), abilities: [], items: [], money: 0, coin: "bronze", people: [], opening: "It begins in a gatehouse." });
      if (role === "teller") return (told.push(messages), over.story ?? PASSAGE);
      if (sys.includes("referee")) return JSON.stringify(JUDGE);
      if (sys.includes("records")) return JSON.stringify({ minutes: 3 });
      if (sys.includes("for two small things")) return (seen.push("plan"), over.planText ?? JSON.stringify(over.plan ?? { idle: "none", interruption: null }));
      if (sys.includes("who may want ideas")) return (seen.push("choices"), JSON.stringify(over.choices ?? { decision: false, stuck: false, choices: [] }));
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
  };
}

const last = (d: { told: Message[][] }): string => d.told.at(-1)!.at(-1)!.content;

describe("the hooks", () => {
  test("a run begun and played with no state of this system makes it on first use", async () => {
    const d = deps();
    const r = await begin(d, { world: "w", who: "h", name: "Jay" }, 3);
    expect(r.sys?.events).toBeUndefined();
    const old = { ...r, sys: { events: { cooldown: 1 } } } as Run;
    expect(eventsOf(old)).toMatchObject({ cooldown: 1, bag: [], quiet: 0, choices: [] });
    expect(sceneOf(d, r)).not.toContain("undefined");
  });

  test("a line that plainly implies a cutting-in may bring one, rolled by code, and the storyteller is told", async () => {
    const plan = { idle: "none", interruption: { who: "A guard", what: "A guard turns at the noise and starts toward the shelf.", chance: 9, unwelcome: true } };
    let got = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const d = deps({ plan });
      const r = start(seed);
      const t = await turn(d, r, "I creep past the guard, brushing the shelf.");
      const told = last(d).includes("cuts in");
      if (told) {
        got++;
        expect(last(d)).toContain("A guard turns at the noise");
        expect(last(d)).toContain("stop before harm");
        expect(eventsOf(t.run).cooldown).toBe(COOLDOWN - 1);
      }
    }
    // Nine in ten becomes seven at most: it happens most of the time, and not every time.
    expect(got).toBeGreaterThan(4);
    expect(got).toBeLessThan(12);
  });

  test("most lines imply none, and a cutting-in with nobody to cut in is none", async () => {
    const d = deps({ plan: { idle: "none", interruption: { who: "", what: "Something happens.", chance: 9, unwelcome: false } } });
    await turn(d, start(), "I look at the guard.");
    expect(last(d)).not.toContain("cuts in");
  });

  test("a line that only goes on moves the world, and by the third in a row it goes against the character", async () => {
    let r = start(4);
    const facts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = deps({ plan: { idle: "wait", interruption: null } });
      const t = await turn(d, r, "wait");
      r = t.run;
      facts.push(last(d));
      expect(eventsOf(r).quiet).toBe(i + 1);
    }
    expect(facts[0]).toContain("time passes");
    expect(facts[1]).not.toContain("ill luck");
    expect(facts[2]).toContain("ill luck");
    const d = deps();
    r = (await turn(d, r, "I knock on the door.")).run;
    expect(eventsOf(r).quiet).toBe(0);
  });

  test("when the model cannot be read, a bare wait is still going on and nothing else is", async () => {
    const d1 = deps({ planText: "not json at all" });
    await turn(d1, start(), "wait");
    expect(last(d1)).toContain("time passes");
    const d2 = deps({ planText: "not json at all" });
    await turn(d2, start(), "I knock on the door and wait for an answer.");
    expect(last(d2)).not.toContain("time passes");
  });

  test("in a fight the line is not read at all", async () => {
    const r = start();
    meet(r, { name: "Brute", hostile: true });
    const d = deps();
    await turn(d, r, "wait");
    expect(d.seen).not.toContain("plan");
  });

  test("an arrival is noticed after the turn, and something fitting is offered on the next", async () => {
    let r = start(1);
    const d = deps();
    r = (await turn(d, r, "I walk on.")).run;
    expect(eventsOf(r).arrived).toBe(false);
    const moved = { ...r, place: { name: "The market", text: "" } } as Run;
    const t = events.apply!(moved, { choices: [] }, { before: r } as never, null);
    expect(t).toEqual([]);
    expect(eventsOf(moved).arrived).toBe(true);
    // The next turn offers on the arrival's chance, and the arrival is then used up.
    let offered = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const x = structuredClone(moved);
      x.seed = seed;
      eventsOf(x).cooldown = 0;
      if (events.hint!(x, {} as never, null).length) offered++;
      expect(eventsOf(x).arrived).toBe(false);
    }
    expect(offered).toBeGreaterThan(14);
    expect(offered).toBeLessThan(34);
  });

  test("what is offered goes to the storyteller as a thing it may use, and the player is told nothing of it", async () => {
    let seen = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const d = deps({ plan: { idle: "onward", interruption: null } });
      const t = await turn(d, start(seed), "go on");
      if (last(d).includes("You may bring in one of these")) {
        seen++;
        expect(t.report.changes.filter((c) => /event|offer|choice/i.test(c))).toEqual([]);
      }
    }
    expect(seen).toBeGreaterThan(5);
  });

  test("quick choices: shown after a moment of decision, never after a settled one", async () => {
    const decisive = { decision: true, stuck: false, choices: ["Push the door open", "Ask the guard for the time", "Slip back the way you came"] };
    const d1 = deps({ choices: decisive });
    const t1 = await turn(d1, start(), "I creep on.");
    const cards = showsOf(d1, t1.run);
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({ kind: "card", group: "choices", title: "Push the door open", line: "Push the door open" });
    const d2 = deps();
    const t2 = await turn(d2, start(), "I creep on.");
    expect(showsOf(d2, t2.run)).toEqual([]);
    // They are only for the turn they were made for.
    t1.run.turn++;
    expect(showsOf(d1, t1.run)).toEqual([]);
  });

  test("choices that name a result, or are not three, or are the same deed, are not kept", async () => {
    for (const choices of [["Push the door open", "Ask the guard"], ["Ask him", "Ask her", "Take the lamp"], ["I push the door", "Ask the guard", "Go back"]]) {
      const d = deps({ choices: { decision: true, stuck: false, choices } });
      const t = await turn(d, start(), "I creep on.");
      expect(showsOf(d, t.run)).toEqual([]);
      expect(t.story).toBe(PASSAGE);
    }
  });

  test("a player who seems stuck is given choices even when the passage settles", async () => {
    let r = start(9);
    const plan = { idle: "wait", interruption: null };
    const d = deps({ plan, choices: { decision: false, stuck: false, choices: ["Knock on the door", "Walk round the house", "Climb the wall"] } });
    r = (await turn(d, r, "wait")).run;
    expect(showsOf(d, r)).toHaveLength(3);
  });

  test("a short passage costs no call for choices", async () => {
    const d = deps({ story: "You nod." });
    await turn(d, start(), "I nod.");
    expect(d.seen).not.toContain("choices");
  });

  test("a system that gets nothing usable does nothing", async () => {
    const d = deps({ planText: "", choices: "nonsense" });
    const t = await turn(d, start(), "I creep on.");
    expect(t.story).toBe(PASSAGE);
    expect(showsOf(d, t.run)).toEqual([]);
    expect(draw(t.run)).toBeGreaterThanOrEqual(0);
  });
});
