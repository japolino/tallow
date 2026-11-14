/**
 * The quest board's Show (src/game/systems/quests.ts, boardShow) and its lesson: what the board is given to lay out,
 * from the quests the run keeps (src/engine/quests.ts).
 */
import { describe, expect, test } from "bun:test";
import { newRun, type Run } from "../src/engine/run.js";
import { addQuest, closeTask, emptyQuests, finish, setValue, type Quests, type TaskSpec } from "../src/engine/quests.js";
import { QUEST_WORDS, QUESTS_LESSON, boardShow, quests } from "../src/game/systems/quests.js";

const spec = (what: string, more: Partial<TaskSpec> = {}): TaskSpec => ({ do: what, check: `${what}: true`, kind: "done", target: 1, aim: "", ready: true, main: false, first: [], ...more });

function runWith(fill: (s: Quests, r: Run) => void): Run {
  const r = newRun(1, "", "", "Jay");
  const s = emptyQuests();
  fill(s, r);
  r.sys = { ...(r.sys ?? {}), quests: s };
  return r;
}

/** Return the ring to Mara, after finding it (out of reach), after asking the fisherman where the thief went. */
const ring = (s: Quests, turn = 1) =>
  addQuest(s, {
    title: "Mara's ring",
    goal: "Find Mara's stolen ring",
    from: "Mara",
    top: spec("Return the ring to Mara", { first: [spec("Find the ring", { main: true, ready: false, first: [spec("Ask the fisherman about the thief")] })] }),
  }, turn);

describe("the quest board's Show", () => {
  test("nothing is on the board until the run has a quest", () => {
    const r = runWith(() => {});
    expect(boardShow(r)).toBeNull();
    expect(quests.shows!(r)).toEqual([]);
    expect(quests.teach!(r)).toEqual([]);
  });

  test("an open quest's tasks come as a tree from the top, each with where it stands in words and lines that set about it", () => {
    const r = runWith((s) => void ring(s));
    r.turn = 1;
    const b = boardShow(r)!;
    expect(b.kind).toBe("quests");
    expect(b.quests).toHaveLength(1);
    const q = b.quests[0]!;
    expect(q).toMatchObject({ id: "q1", title: "Mara's ring", text: "Find Mara's stolen ring", from: "asked by Mara", state: "open", fresh: true });
    expect(q.end).toBeUndefined();
    expect(q.tasks.map((t) => [t.id, t.state, t.needs])).toEqual([["q1-1", "waiting", ["q1-2"]], ["q1-2", "blocked", ["q1-3"]], ["q1-3", "open", []]]);
    expect(q.tasks.map((t) => t.note)).toEqual([QUEST_WORDS.waiting, QUEST_WORDS.blockedSteps, QUEST_WORDS.open]);
    expect(q.tasks[1]!.main).toBe(true);
    // A task that can be taken up offers to set about it, plainly or for the player to say how; one out of reach, to look for a way.
    expect(q.tasks[2]!.choices).toEqual([
      { say: "Set about it", line: "I set about this: ask the fisherman about the thief." },
      { say: "Say how", line: "To ask the fisherman about the thief, I " },
    ]);
    expect(q.tasks[1]!.choices).toEqual([{ say: "Look for a way", line: "I look for a way to find the ring." }]);
    expect(q.tasks[0]!.choices.map((c) => c.say)).toEqual(["Set about it", "Say how"]);
    // A line of its own sets a quest; and the run is not changed by being shown.
    expect(b.own).toEqual({ say: "Set yourself a quest", line: "I set myself a goal: " });
    const before = JSON.stringify(r);
    boardShow(r);
    expect(JSON.stringify(r)).toBe(before);
    // The turn after, it is no longer new.
    r.turn = 2;
    expect(boardShow(r)!.quests[0]!.fresh).toBe(false);
  });

  test("a counted task says how far along it is; a task done is ticked and what lay beneath it is left out; a closed one says why", () => {
    const r = runWith((s) => {
      const q = addQuest(s, { title: "Wolves", goal: "Clear the wolves", from: "self", top: spec("Report to the reeve", { first: [spec("Slay five wolves", { kind: "count", target: 5, main: true }), spec("Mend the fence", { first: [spec("Find nails")] }), spec("Ask the miller")] }) }, 1);
      setValue(q, q.tasks[1]!, 2, 2);
      setValue(q, q.tasks[2]!, true, 2);
      closeTask(q, q.tasks[4]!, "the miller has gone", 2);
    });
    const q = boardShow(r)!.quests[0]!;
    expect(q.from).toBe("set by themselves");
    expect(q.tasks.map((t) => t.text)).toEqual(["Report to the reeve", "Slay five wolves", "Mend the fence", "Ask the miller"]);
    const [top, wolves, fence, miller] = q.tasks;
    expect(wolves).toMatchObject({ state: "open", progress: "2 of 5" });
    expect(fence).toMatchObject({ state: "done", note: "Done.", needs: [], choices: [] });
    expect(miller).toMatchObject({ state: "closed", why: "the miller has gone", note: "No longer to be done: the miller has gone.", choices: [] });
    expect(top!.needs).toEqual([wolves!.id, fence!.id, miller!.id]);
    expect(top!.progress).toBeUndefined();
  });

  test("ended quests come after the open ones, the latest first, with how they ended and no tasks", () => {
    const r = runWith((s) => {
      const a = ring(s);
      const b = addQuest(s, { title: "The wall", goal: "Mend the sea wall", from: "", top: spec("Mend the sea wall", { kind: "share", target: 1 }) }, 1);
      const c = addQuest(s, { title: "The fair", goal: "Win at the fair", from: "", top: spec("Win at the fair") }, 1);
      addQuest(s, { title: "The boy", goal: "Find the boy", from: "", top: spec("Find the boy") }, 3);
      finish(s, a, "done", "achieved", 4);
      finish(s, b, "lost", "the sea took it", 5);
      finish(s, c, "dropped", "given up", 6);
    });
    r.turn = 6;
    const b = boardShow(r)!;
    expect(b.quests.map((q) => [q.title, q.state])).toEqual([["The boy", "open"], ["The fair", "dropped"], ["The wall", "lost"], ["Mara's ring", "done"]]);
    expect(b.quests.map((q) => q.end)).toEqual([undefined, "Given up.", "Lost: the sea took it.", "Achieved."]);
    expect(b.quests.slice(1).every((q) => q.tasks.length === 0 && !q.fresh)).toBe(true);
    expect(QUEST_WORDS.ended("dropped", "set aside, long untouched")).toBe("Given up: set aside, long untouched.");
  });

  test("a task out of reach with nothing beneath it waits on more being found out", () => {
    const r = runWith((s) => {
      const q = addQuest(s, { title: "Gate", goal: "Pass the gate", from: "", top: spec("Pass the gate", { ready: false, first: [spec("Learn the password")] }) }, 1);
      closeTask(q, q.tasks[1]!, "the guard is dead", 2);
      q.tasks[0]!.prep = 2;
    });
    const [top, step] = boardShow(r)!.quests[0]!.tasks;
    expect(top!.state).toBe("blocked");
    expect(top!.note).toBe(QUEST_WORDS.blockedFind);
    // The step closed under it is still shown, with why; it is no step left to do.
    expect(top!.needs).toEqual(["q1-2"]);
    expect(step).toMatchObject({ state: "closed", why: "the guard is dead" });
  });

  test("the board is taught once there is a quest, in the narrator's words, with no keys or mouse in them", () => {
    expect(quests.teach!(runWith((s) => void ring(s)))).toEqual([QUESTS_LESSON]);
    expect(QUESTS_LESSON.key).toBe("quests");
    expect(QUESTS_LESSON.lines.length).toBeGreaterThanOrEqual(2);
    expect(QUESTS_LESSON.lines.length).toBeLessThanOrEqual(3);
    for (const line of QUESTS_LESSON.lines) {
      expect(line).toMatch(/[.!?]$/);
      expect(line).not.toMatch(/click|mouse|keyboard|press|\btap\b|—/i);
    }
    expect(QUESTS_LESSON.lines.join(" ")).toContain("Touch");
  });
});
