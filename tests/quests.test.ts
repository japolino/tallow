/**
 * Quests (src/engine/quests.ts, src/game/systems/quests.ts): the rules of a quest's tasks, and the system at a turn with
 * faked models.
 */
import { describe, expect, test } from "bun:test";
import { meet, newRun, xpBase, type Run } from "../src/engine/run.js";
import {
  addLead, addQuest, alike, ALL_MOST, childrenOf, closeTask, complete, emptyQuests, fateOf, finish, KEEP_FINISHED, makeRoom, MAX_OPEN, nextOf, openQuests, otherWay,
  questWorth, questXp, readQuests, repair, setValue, STALE_TURNS, status, targetFor, taskOf, topOf, UNBLOCK_TURNS, unblock, type Quest, type Quests, type TaskSpec,
} from "../src/engine/quests.js";
import type { Message, Role } from "../src/game/ask.js";
import { pagesOf, sceneOf, showsOf, turn } from "../src/game/runturn.js";
import type { RunDeps } from "../src/game/system.js";
import { quests, readAnswer, readPlan } from "../src/game/systems/quests.js";

const spec = (what: string, more: Partial<TaskSpec> = {}): TaskSpec => ({ do: what, check: `${what}: true`, kind: "done", target: 1, aim: "", ready: true, main: false, first: [], ...more });

/** Return the ring to Mara, after finding it, after asking the fisherman where the thief went. */
function ringQuest(s: Quests = emptyQuests(), turn = 1): Quest {
  return addQuest(s, {
    title: "Mara's ring",
    goal: "Find Mara's stolen ring",
    from: "Mara",
    top: spec("Return the ring to Mara", { first: [spec("Find the ring", { main: true, ready: false, first: [spec("Ask the fisherman about the thief")] })] }),
  }, turn);
}

describe("a quest's tasks", () => {
  test("a plan is written down as a tree with one aim, and the way points to the first step", () => {
    const s = emptyQuests();
    const q = ringQuest(s);
    expect(q.id).toBe("q1");
    expect(q.tasks.map((t) => [t.id, t.under])).toEqual([["q1-1", null], ["q1-2", "q1-1"], ["q1-3", "q1-2"]]);
    expect(q.tasks.filter((t) => t.main).map((t) => t.id)).toEqual(["q1-2"]);
    expect(status(q, q.tasks[0]!)).toBe("waiting");
    expect(status(q, q.tasks[1]!)).toBe("blocked");
    expect(status(q, q.tasks[2]!)).toBe("open");
    expect(nextOf(q)!.do).toBe("Ask the fisherman about the thief");
    // With no task marked, the top task is the aim; with two marked, only the first.
    const plain = addQuest(s, { title: "Wall", goal: "Mend the wall", from: "", top: spec("Mend the wall", { first: [spec("a", { main: true }), spec("b", { main: true })] }) }, 1);
    expect(plain.tasks.filter((t) => t.main).map((t) => t.do)).toEqual(["a"]);
    const lone = addQuest(s, { title: "Wall", goal: "Mend it", from: "", top: spec("Mend it") }, 1);
    expect(lone.tasks[0]!.main).toBe(true);
    expect(s.list.map((x) => x.id)).toEqual(["q1", "q2", "q3"]);
  });

  test("a done-or-not task moves only when it is done; a count and a share move both ways and are done at their target", () => {
    const s = emptyQuests();
    const q = addQuest(s, { title: "Wolves", goal: "Clear the wolves", from: "", top: spec("Report to the reeve", { first: [spec("Slay five wolves", { kind: "count", target: 5, main: true }), spec("Mend the fence", { kind: "share", target: 1 })] }) }, 1);
    const [top, wolves, fence] = q.tasks as [typeof q.tasks[0], typeof q.tasks[0], typeof q.tasks[0]];
    expect(setValue(q, top, false, 2)).toBeNull();
    expect(setValue(q, wolves, 3, 2)).toBe("more");
    expect(wolves.value).toBe(3);
    expect(setValue(q, wolves, "2 of 5", 3)).toBe("less");
    expect(setValue(q, wolves, 2, 3)).toBeNull();
    expect(setValue(q, wolves, 40, 4)).toBe("done");
    expect(wolves.value).toBe(5);
    expect(setValue(q, wolves, 1, 5)).toBeNull();
    expect(setValue(q, fence, 50, 5)).toBe("more");
    expect(fence.value).toBe(0.5);
    expect(setValue(q, fence, "nonsense", 5)).toBeNull();
    expect(setValue(q, fence, 1, 6)).toBe("done");
    expect(top.gained).toBe(2);
    expect(status(q, top)).toBe("open");
    expect(setValue(q, top, "yes", 7)).toBe("done");
    expect(fateOf(q)).toBe("achieved");
  });

  test("a task not yet within reach takes no part credit, but may be done outright, and the story may bring it within reach", () => {
    const s = emptyQuests();
    const q = addQuest(s, { title: "Vault", goal: "Open the vault", from: "", top: spec("Count the gold", { kind: "count", target: 10, ready: false, first: [spec("Find the key")] }) }, 1);
    const top = topOf(q)!;
    expect(status(q, top)).toBe("blocked");
    expect(setValue(q, top, 4, 2)).toBeNull();
    expect(top.value).toBe(0);
    expect(unblock(q, top, 2)).toBe(true);
    expect(unblock(q, top, 2)).toBe(false);
    expect(setValue(q, top, 4, 3)).toBe("more");
    const q2 = addQuest(s, { title: "Gate", goal: "Pass the gate", from: "", top: spec("Pass the gate", { ready: false, first: [spec("Learn the password")] }) }, 1);
    expect(status(q2, topOf(q2)!)).toBe("blocked");
    expect(setValue(q2, topOf(q2)!, true, 2)).toBe("done");
  });

  test("a task done counts for those above it, ends what was beneath it, and leaves a pointer to what it led to", () => {
    const s = emptyQuests();
    const q = ringQuest(s);
    const [top, ring, ask] = q.tasks as [typeof q.tasks[0], typeof q.tasks[0], typeof q.tasks[0]];
    complete(q, ring, 4);
    expect(ask.closed && ask.moot).toBe(true);
    expect(top.gained).toBe(1);
    expect(q.nudge).toEqual({ turn: 4, task: ring.id });
    expect(fateOf(q)).toBe("going");
    expect(nextOf(q)).toBe(top);
    complete(q, top, 5);
    expect(q.nudge).toEqual({ turn: 4, task: ring.id });
    expect(fateOf(q)).toBe("achieved");
  });

  test("closing a task: a side task leaves the quest going; the aim, or a task above it, loses it; a step made moot does not", () => {
    const s = emptyQuests();
    const q = ringQuest(s);
    expect(closeTask(q, q.tasks[2]!, "the fisherman drowned", 2)).toBe(true);
    expect(closeTask(q, q.tasks[2]!, "again", 2)).toBe(false);
    expect(fateOf(q)).toBe("going");
    expect(closeTask(q, q.tasks[1]!, "the ring was melted down", 3)).toBe(true);
    expect(fateOf(q)).toBe("lost");
    // The aim beneath a middle task done another way is moot, not lost.
    const q2 = addQuest(s, { title: "Escort", goal: "Bring the envoy home", from: "", top: spec("Bring the envoy home", { first: [spec("Cross the pass", { first: [spec("Bribe the guards", { main: true })] })] }) }, 1);
    complete(q2, q2.tasks[1]!, 2);
    expect(q2.tasks[2]!.moot).toBe(true);
    expect(fateOf(q2)).toBe("going");
  });

  test("a lead adds a step beneath a task once: not twice, not beneath a task done, not past the most a quest may hold", () => {
    const s = emptyQuests();
    const q = ringQuest(s);
    const ring = q.tasks[1]!;
    const lead = addLead(q, ring, spec("Search the thief's boat"), 2);
    expect(lead?.under).toBe(ring.id);
    expect(addLead(q, ring, spec("search the thief's boat!"), 2)).toBeNull();
    expect(addLead(q, ring, spec("Ask the fisherman about the thief, again"), 2)).toBeNull();
    complete(q, q.tasks[2]!, 3);
    complete(q, lead!, 3);
    complete(q, ring, 4);
    expect(addLead(q, ring, spec("Something new"), 5)).toBeNull();
    const big = ringQuest(s);
    for (let i = 0; i < ALL_MOST; i++) addLead(big, big.tasks[0]!, spec(`Distinct errand number ${i} ${"x".repeat(i)}`), 2);
    expect(big.tasks.filter((t) => !t.closed && t.value < t.target).length).toBeLessThanOrEqual(8);
  });

  test("another way replaces the steps still to do beneath a task, keeps those done, and never replaces the aim", () => {
    const s = emptyQuests();
    const q = addQuest(s, { title: "Keep", goal: "Get into the keep", from: "", top: spec("Get into the keep", { main: true, first: [spec("Steal the key", { first: [spec("Learn the key's hiding place")] }), spec("Lure the guard away")] }) }, 1);
    const top = topOf(q)!;
    complete(q, q.tasks.find((t) => t.do === "Lure the guard away")!, 2);
    const added = otherWay(q, top, [spec("Bribe the cook"), spec("Climb through the kitchen window")], true, 3);
    expect(added!.map((t) => t.do)).toEqual(["Bribe the cook", "Climb through the kitchen window"]);
    // In order: the window is right beneath the keep, the cook beneath the window.
    expect(added![1]!.under).toBe(top.id);
    expect(added![0]!.under).toBe(added![1]!.id);
    expect(q.tasks.some((t) => t.do === "Steal the key" || t.do === "Learn the key's hiding place")).toBe(false);
    expect(q.tasks.some((t) => t.do === "Lure the guard away")).toBe(true);
    expect(top.gained).toBe(1);
    const ring = ringQuest(s);
    expect(otherWay(ring, ring.tasks[0]!, [spec("Buy a copy of the ring")], false, 2)).toBeNull();
    expect(otherWay(ring, ring.tasks[1]!, [spec("Ask the harbour master")], false, 2)!.length).toBe(1);
    expect(childrenOf(ring, ring.tasks[1]!).map((t) => t.do)).toEqual(["Ask the harbour master"]);
  });

  test("a quest is never left with no way forward: what can gain nothing more is brought within reach", () => {
    const s = emptyQuests();
    const q = ringQuest(s, 1);
    const ring = q.tasks[1]!;
    closeTask(q, q.tasks[2]!, "the fisherman left", 2);
    expect(status(q, ring)).toBe("blocked");
    expect(repair(q, 2)).toEqual([ring]);
    expect(status(q, ring)).toBe("open");
    // A plan's task with nothing beneath it is never out of reach from the start.
    const lone = addQuest(s, { title: "Map", goal: "Find the map", from: "", top: spec("Find the map", { ready: false }) }, 10);
    expect(status(lone, topOf(lone)!)).toBe("open");
    // One out of reach with nothing beneath it (a lead marked so, or an old save) waits for the story a while, then is brought within reach.
    topOf(lone)!.prep = 2;
    expect(repair(lone, 10 + UNBLOCK_TURNS - 1)).toEqual([]);
    expect(repair(lone, 10 + UNBLOCK_TURNS)).toEqual([topOf(lone)!]);
  });

  test("finished quests beyond those kept are let go, and a new quest at the most open makes room only from one long untouched", () => {
    const s = emptyQuests();
    for (let i = 0; i < KEEP_FINISHED + 3; i++) finish(s, ringQuest(s, i), "done", "achieved", i);
    expect(s.list.length).toBe(KEEP_FINISHED);
    expect(s.list[0]!.id).toBe("q4");
    const t = emptyQuests();
    for (let i = 0; i < MAX_OPEN; i++) ringQuest(t, 10 + i);
    expect(makeRoom(t, 20)).toBe(false);
    const gone = makeRoom(t, 10 + STALE_TURNS);
    expect(gone).not.toBe(false);
    expect((gone as Quest).id).toBe("q1");
    expect(openQuests(t).length).toBe(MAX_OPEN - 1);
  });

  test("experience on the end is sized by the tasks done, through the sheet's own rule", () => {
    const s = emptyQuests();
    const q = ringQuest(s);
    for (const t of [...q.tasks].reverse()) if (t.value < t.target && !t.closed) complete(q, t, 2);
    expect(questWorth(q, true)).toBe(3);
    expect(questWorth(q, false)).toBeCloseTo(0.45);
    const r = newRun(1, "w", "h", "Jay");
    const told = questXp(r.sheet, questWorth(q, true));
    // 3 deeds of the base: one of 2.0 and one of 0.75 (what is left under the smallest size is not given).
    expect(told[0]).toBe(`${Math.ceil(xpBase(1) * 2) + Math.ceil(xpBase(1) * 0.75)} experience.`);
    expect(questXp(newRun(1, "w", "h", "Jay").sheet, 0.3)).toEqual([]);
  });

  test("an old or half-written state is read with a default for every field", () => {
    const s = readQuests({ list: [{ id: "q1", title: "", goal: "Find it", tasks: [{ id: "q1-1", do: "Find it", kind: "odd", under: null }] }] } as never);
    const q = s.list[0]!;
    expect(q.state).toBe("open");
    expect(q.title).toBe("A quest");
    expect(q.tasks[0]).toMatchObject({ kind: "done", target: 1, value: 0, prep: 1, closed: false, main: false });
    expect(s.n).toBe(1);
    expect(readQuests(undefined)).toEqual({ list: [], n: 0 });
  });

  test("targets and wording", () => {
    expect(targetFor("done", 7)).toBe(1);
    expect(targetFor("count", 0)).toBe(1);
    expect(targetFor("count", 400)).toBe(99);
    expect(targetFor("share", 0.5)).toBe(0.5);
    expect(targetFor("share", 3)).toBe(1);
    expect(alike("Find the ring", "find the lost ring")).toBe(true);
    expect(alike("Find the ring", "Return the ring to Mara")).toBe(false);
  });
});

/* ------------------------------------------------- the system, with faked models ------------------------------------------------- */

interface Fake {
  reader?: unknown[];
  plan?: unknown;
  decide?: "yes" | "no";
}

function deps(f: Fake): RunDeps & { asked: { role: Role; text: string }[]; told: Message[][] } {
  const asked: { role: Role; text: string }[] = [], told: Message[][] = [];
  const answers = [...(f.reader ?? [])];
  let plans = 0;
  return {
    asked,
    told,
    systems: [quests],
    log: () => undefined,
    ...(f.decide ? { decide: async () => ({ hook: { type: "choice", choice: f.decide!, confidence: 0.99 } as never }) } : {}),
    ask: async (messages: Message[], role: Role) => {
      const sys = messages[0]!.content;
      const all = messages.map((m) => m.content).join("\n");
      if (role === "teller") return (told.push(messages), told.length === 1 ? "The story goes on." : "Mara thanks you warmly.");
      asked.push({ role, text: all });
      if (sys.includes("referee")) return JSON.stringify({ kind: "story" });
      if (sys.includes("keep the records")) return JSON.stringify({ minutes: 2 });
      if (sys.includes("taken on")) return JSON.stringify(answers.length ? answers.shift() : {});
      if (sys.includes("plan quests")) return JSON.stringify(Array.isArray(f.plan) ? f.plan[Math.min(plans++, f.plan.length - 1)] : f.plan ?? {});
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
  };
}

const PLAN = { title: "Mara's ring", task: { do: "Return the ring to Mara", check: "Mara holds her ring again", kind: "done", target: 1, aim: "mara", ready: true, main: false, first: [{ do: "Find the ring", check: "Jay has the ring", kind: "done", ready: true, main: true, first: [] }] } };

const start = (): Run => {
  const r = newRun(7, "a harbour town", "a hero", "Jay");
  r.opening = "Mara weeps at the quay.";
  r.place = { name: "The quay", text: "" };
  meet(r, { name: "Mara", power: 2 });
  return r;
};

const questsOf = (r: Run): Quests => r.sys!.quests as Quests;

describe("quests at a turn", () => {
  test("a quest noticed is planned by the builder and kept; with none open the reader is asked only whether one begins", async () => {
    const d = deps({ reader: [{ new: { goal: "Find Mara's stolen ring", from: "mara", after: null } }], plan: PLAN });
    const t = await turn(d, start(), "Mara begs me to find her ring. I promise I will.");
    const reader = d.asked.find((a) => a.text.includes("OPEN QUESTS"))!;
    expect(reader.text).not.toContain('"progress"');
    expect(reader.text).toContain('"new"');
    const q = questsOf(t.run).list[0]!;
    expect(q).toMatchObject({ id: "q1", title: "Mara's ring", from: "Mara", goal: "Find Mara's stolen ring" });
    expect(q.tasks[0]!.aim).toBe("Mara");
    expect(t.report.changes.join("\n")).toContain("A new quest: Mara's ring. Find Mara's stolen ring. First: Find the ring.");
    expect(sceneOf(d, t.run)).toContain("Mara's ring: Find Mara's stolen ring (asked by Mara) Next: Find the ring.");
    expect(pagesOf(d, t.run)[0]!.heading).toBe("Quests");
    expect(showsOf(d, t.run)).toEqual([{ kind: "card", id: "q1", group: "quests", title: "Mara's ring", text: "Find Mara's stolen ring Next: Find the ring." }]);
  });

  test("one who asked but is only named so far is kept as the asker, and the builder is told they asked", async () => {
    const d = deps({ reader: [{ new: { goal: "Kill the beast in Corin's cellar", from: "Corin" } }], plan: PLAN });
    const t = await turn(d, start(), "The keeper says old Corin needs a beast cleared from his cellar. I agree.");
    expect(questsOf(t.run).list[0]!.from).toBe("Corin");
    expect(d.asked.find((a) => a.role === "builder")!.text).toContain("Corin asked it of Jay.");
    const d2 = deps({ reader: [{ new: { goal: "Learn who Jay was", from: "jay" } }], plan: PLAN });
    expect(questsOf((await turn(d2, start(), "I resolve to learn who I was.")).run).list[0]!.from).toBe("self");
  });

  test("a task still waiting on its steps beneath is not brought within reach by the reader", async () => {
    const plan = { title: "Mara's ring", task: { ...PLAN.task, ready: false } };
    const d = deps({ reader: [{ new: { goal: "Find Mara's stolen ring", from: "Mara" } }, { reachable: ["q1-1"] }], plan });
    const one = await turn(d, start(), "Mara asks me to find her ring.");
    const two = await turn(d, one.run, "I set out for the harbour.");
    expect(two.report.changes.join("\n")).not.toContain("Within reach now");
    expect(status(questsOf(two.run).list[0]!, questsOf(two.run).list[0]!.tasks[0]!)).toBe("blocked");
    expect(d.asked.filter((a) => a.text.includes("OPEN QUESTS")).at(-1)!.text).toContain("[q1-1] Return the ring to Mara. Done when: Mara holds her ring again (done or not; not yet). comes after q1-2.");
  });

  test("a sure no from the Decision model saves the call when nothing is open; a quest already kept is not noticed again", async () => {
    const d = deps({ decide: "no" });
    await turn(d, start(), "I look at the sea.");
    expect(d.asked.some((a) => a.text.includes("OPEN QUESTS"))).toBe(false);
    const d2 = deps({ reader: [{ new: { goal: "Find Mara's stolen ring", from: "Mara" } }, { new: { goal: "find the stolen ring of Mara" } }], plan: PLAN });
    const one = await turn(d2, start(), "Mara asks me to find her ring.");
    const two = await turn(d2, one.run, "She asks again.");
    expect(questsOf(two.run).list.length).toBe(1);
    expect(d2.asked.filter((a) => a.role === "builder").length).toBe(1);
  });

  test("progress is read for the tasks kept; a step done points the storyteller toward what it led to on the next turn", async () => {
    const d = deps({ reader: [{ new: { goal: "Find Mara's stolen ring", from: "Mara" } }, { progress: [{ task: "q1-2", value: true }] }, {}], plan: PLAN });
    const one = await turn(d, start(), "Mara asks me to find her ring.");
    const two = await turn(d, one.run, "I dive and come up with the ring.");
    expect(d.asked.filter((a) => a.text.includes("OPEN QUESTS")).at(-1)!.text).toContain("[q1-2] Find the ring.");
    expect(two.report.changes).toContain("Done: Find the ring (Mara's ring).");
    expect(taskOf(questsOf(two.run).list[0]!, "q1-2")!.value).toBe(1);
    await turn(d, two.run, "I walk back.");
    const last = d.told.at(-1)!.at(-1)!.content;
    expect(last).toContain("What it was for can be taken up now: Return the ring to Mara.");
  });

  test("a quest achieved gives experience by code; left hanging it is settled in a short passage, settled already it is not", async () => {
    const d = deps({ reader: [{ new: { goal: "Find Mara's stolen ring", from: "Mara" } }, { progress: [{ task: "q1-1", value: true }] }], plan: PLAN });
    const one = await turn(d, start(), "Mara asks me to find her ring.");
    const two = await turn(d, one.run, "I hand Mara the ring.");
    const q = questsOf(two.run).list[0]!;
    expect(q.state).toBe("done");
    expect(two.report.changes).toContain("Quest achieved: Mara's ring.");
    expect(two.run.sheet.xp).toBeGreaterThan(0);
    expect(d.told.at(-1)!.at(-1)!.content).toContain('has achieved what they took on ("Find Mara\'s stolen ring")');
    expect(two.story).toContain("Mara thanks you warmly.");
    const d2 = deps({ reader: [{ new: { goal: "Find Mara's stolen ring", from: "Mara" } }, { progress: [{ task: "q1-1", value: true }], settled: ["q1"] }], plan: PLAN });
    const a = await turn(d2, start(), "Mara asks me to find her ring.");
    const b = await turn(d2, a.run, "I hand Mara the ring; she pays me and we part.");
    expect(questsOf(b.run).list[0]!.state).toBe("done");
    expect(d2.told.length).toBe(2);
  });

  test("ids are checked: on the first try any unknown id sends the question again, on the second the rest stands", async () => {
    const d = deps({ reader: [{ new: { goal: "Find Mara's stolen ring", from: "Mara" } }, { progress: [{ task: "q9-9", value: true }] }, { progress: [{ task: "q1-2", value: true }, { task: "ring", value: true }] }], plan: PLAN });
    const one = await turn(d, start(), "Mara asks me to find her ring.");
    const two = await turn(d, one.run, "I find the ring.");
    expect(two.report.changes).toContain("Done: Find the ring (Mara's ring).");
    const s = questsOf(two.run);
    expect(readAnswer(s, { progress: [{ task: "nope", value: 1 }] }, true)).toBeNull();
    expect(readAnswer(s, { progress: [{ task: "nope", value: 1 }], reachable: ["q1-1"] }, false)!.reachable).toEqual(["q1-1"]);
  });

  test("an aim made impossible loses the quest, and a new aim the passage gives grows out of it; a quest given up is let go", async () => {
    const d = deps({
      reader: [{ new: { goal: "Find Mara's stolen ring", from: "Mara" } }, { closed: [{ task: "q1-2", why: "the ring was melted down", instead: "Make the thief pay for the ring" }] }],
      plan: [PLAN, { title: "The thief", task: { do: "Make the thief pay", check: "The thief has paid", kind: "done", main: true, first: [] } }],
    });
    const one = await turn(d, start(), "Mara asks me to find her ring.");
    const two = await turn(d, one.run, "The smith says he melted it down.");
    const [lost, next] = questsOf(two.run).list;
    expect(lost).toMatchObject({ state: "lost", end: "the ring was melted down" });
    expect(next).toMatchObject({ state: "open", after: "q1", from: "Mara", goal: "Make the thief pay for the ring" });
    expect(two.report.changes).toContain("Quest lost: Mara's ring (the ring was melted down).");
    const d2 = deps({ reader: [{ new: { goal: "Find Mara's stolen ring", from: "Mara" } }, { given_up: [{ quest: "q1", why: "Jay refused" }] }], plan: PLAN });
    const a = await turn(d2, start(), "Mara asks me to find her ring.");
    const b = await turn(d2, a.run, "I tell her I won't do it.");
    expect(questsOf(b.run).list[0]!).toMatchObject({ state: "dropped", end: "Jay refused" });
    expect(b.run.sheet.xp).toBe(0);
  });

  test("a reader or builder that fails costs nothing, and a run saved before quests existed is not written to by the scene or the pages", async () => {
    const d = deps({ reader: ["not json", "still not"], plan: PLAN });
    const t = await turn(d, start(), "Mara asks me to find her ring.");
    expect(t.story).toBe("The story goes on.");
    expect(questsOf(t.run).list).toEqual([]);
    const d2 = deps({ reader: [{ new: { goal: "Find Mara's stolen ring" } }], plan: { title: "No way to tell", task: { do: "Find the ring" } } });
    const t2 = await turn(d2, start(), "Mara asks me to find her ring.");
    expect(questsOf(t2.run).list).toEqual([]);
    const old = start();
    expect(sceneOf(d, old)).not.toContain("QUESTS");
    expect(pagesOf(d, old)).toEqual([]);
    expect(old.sys).toBeUndefined();
  });

  test("a plan is checked whole: a title, at most five tasks, each with what to do and how to tell, and no step twice", () => {
    expect(readPlan(PLAN)).not.toBeNull();
    const many = { title: "Big", task: { do: "Top", check: "c", first: [1, 2, 3, 4, 5].map((i) => ({ do: `Step ${i}`, check: "c" })) } };
    expect(readPlan(many)).toBeNull();
    expect(readPlan({ title: "No check", task: { do: "Top" } })).toBeNull();
    expect(readPlan({ task: { do: "Top", check: "c" } })).toBeNull();
    expect(readPlan({ title: "Twice", task: { do: "Top", check: "c", first: [{ do: "Go", check: "c" }, { do: "go", check: "d" }] } })).toBeNull();
    expect(readPlan({ title: "Unfilled", task: { do: "<a short instruction>", check: "c" } })).toBeNull();
    const p = readPlan({ title: "Kinds", task: { do: "Bring pelts", check: "c", kind: "count", target: 5 } })!;
    expect(p.top).toMatchObject({ kind: "count", target: 5, ready: true });
  });
});
