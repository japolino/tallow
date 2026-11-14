/**
 * Quests: what the player's character has taken on, each kept as a small tree of tasks (game/systems/quests.ts asks the
 * models; this file keeps the rules).
 *
 * A quest is a top task with the tasks that must or may come before it beneath it. The top task is the last to be done:
 * going back to whoever asked, when someone did, or else the aim itself. One task in the tree is the aim (`main`).
 * Each task has a condition of one of three kinds, with a value code keeps:
 *   done   done or not (0 or 1),
 *   count  a number of things (3 of 5 wolves),
 *   share  work done by degrees, from 0 to 1 (half the wall mended).
 * A reader sets the values a passage plainly moved; from the values, code alone decides what is done, what is now
 * within reach, and whether the quest is achieved, lost, or goes on.
 *
 * A task may need preparing first (`prep` 2 or 3): it is not yet within reach until that many less one of the tasks
 * beneath it are done, or the story brings it within reach. The tree grows from what the story finds (a lead adds a
 * task beneath another; another way found replaces the tasks beneath one), and a task the story makes pointless or
 * impossible is closed. A quest is never left with nothing to do and no end: a task waiting on preparation that can no
 * longer come is brought within reach, and a quest whose aim is closed ends.
 *
 * Pure and seeded: nothing here asks a model or reads a clock.
 */
import { gainXp, type Sheet } from "./run.js";

/* ------------------------------------------------- the state ------------------------------------------------- */

export type Kind = "done" | "count" | "share";
export const KINDS: readonly Kind[] = ["done", "count", "share"];

export interface Task {
  /** Unique in the run: the quest's id, a dash, and a number ("q2-3"). */
  id: string;
  /** What to do, as a short instruction. */
  do: string;
  /** A plain statement that is true once it is done. */
  check: string;
  kind: Kind;
  /** The value at which it is done: 1 for done, how many for a count, the share (at most 1) for a share. */
  target: number;
  value: number;
  /** Who or what it is aimed at, as the story names it; "" when nothing in particular. */
  aim: string;
  /** The task this one comes before; null for the top task. */
  under: string | null;
  /** How much preparing it needs: 1 it can be tried now; 2 or 3 it needs one or two tasks beneath it done first. */
  prep: number;
  /** Tasks beneath it done so far, counted as they are done (so tasks replaced later still count). */
  gained: number;
  /** The aim of the quest. */
  main: boolean;
  /** Made pointless or impossible, and why. */
  closed: boolean;
  why: string;
  /** Closed only because what it led to was done or closed: no fault of anyone's. */
  moot: boolean;
  /** The turn it was done, or 0. */
  at: number;
}

export type QuestState = "open" | "done" | "lost" | "dropped";

export interface Quest {
  id: string;
  title: string;
  /** The aim in one sentence, as an instruction. */
  goal: string;
  /** Who asked it of the player's character; "self" when they set it themselves; "" when the situation did. */
  from: string;
  /** The id of a finished quest this one grows out of, or "". */
  after: string;
  tasks: Task[];
  state: QuestState;
  begun: number;
  /** The last turn anything about it changed. */
  touched: number;
  ended: number;
  /** One line on how it ended. */
  end: string;
  /** The last task done that was not the top one, for pointing the way on the next turn. */
  nudge: { turn: number; task: string } | null;
  /** How many tasks have been numbered. */
  n: number;
}

export interface Quests {
  list: Quest[];
  /** How many quests have been numbered. */
  n: number;
}

/** The most quests open at once. */
export const MAX_OPEN = 5;
/** Finished quests kept, newest last; older ones are let go. */
export const KEEP_FINISHED = 12;
/** The most tasks a quest is built with. */
export const BUILD_MOST = 5;
/** The most tasks of a quest still to do at once, and in all. */
export const LIVE_MOST = 8;
export const ALL_MOST = 16;
/** The most tasks another way may bring. */
export const OTHER_WAY_MOST = 3;
/** Turns a quest must lie untouched before it may be set aside to make room for a new one. */
export const STALE_TURNS = 20;
/** Turns a quest may lie untouched with its only tasks out of reach before the first of them is brought within reach. */
export const UNBLOCK_TURNS = 6;

export const emptyQuests = (): Quests => ({ list: [], n: 0 });

const str = (v: unknown, most: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, most) : "");
const num = (v: unknown, otherwise: number): number => (typeof v === "number" && Number.isFinite(v) ? v : otherwise);

/** A kept state read with a default for every field, so a run saved before a field existed still loads. */
export function readQuests(v: Quests | undefined | null): Quests {
  const s = v && typeof v === "object" ? v : emptyQuests();
  s.list = Array.isArray(s.list) ? s.list.filter((q) => q && typeof q === "object") : [];
  s.n = Math.max(num(s.n, 0), s.list.length);
  for (const q of s.list) {
    q.id = str(q.id, 20) || `q${++s.n}`;
    q.title = str(q.title, 60) || "A quest";
    q.goal = str(q.goal, 200);
    q.from = str(q.from, 60);
    q.after = str(q.after, 20);
    q.state = (["open", "done", "lost", "dropped"] as const).includes(q.state) ? q.state : "open";
    q.begun = num(q.begun, 0);
    q.touched = num(q.touched, q.begun);
    q.ended = num(q.ended, 0);
    q.end = str(q.end, 200);
    q.nudge = q.nudge && typeof q.nudge === "object" ? q.nudge : null;
    q.tasks = Array.isArray(q.tasks) ? q.tasks.filter((t) => t && typeof t === "object") : [];
    q.n = Math.max(num(q.n, 0), q.tasks.length);
    for (const t of q.tasks) {
      t.kind = KINDS.includes(t.kind) ? t.kind : "done";
      t.target = t.kind === "done" ? 1 : Math.max(t.kind === "share" ? 0.01 : 1, num(t.target, 1));
      t.value = Math.max(0, num(t.value, 0));
      t.do = str(t.do, 120);
      t.check = str(t.check, 160);
      t.aim = str(t.aim, 60);
      t.under = typeof t.under === "string" ? t.under : null;
      t.prep = Math.max(1, Math.min(3, Math.round(num(t.prep, 1))));
      t.gained = Math.max(0, num(t.gained, 0));
      t.main = t.main === true;
      t.closed = t.closed === true;
      t.why = str(t.why, 120);
      t.moot = t.moot === true;
      t.at = num(t.at, 0);
    }
  }
  return s;
}

export const openQuests = (s: Quests): Quest[] => s.list.filter((q) => q.state === "open");
export const finishedQuests = (s: Quests): Quest[] => s.list.filter((q) => q.state !== "open");
export const questOf = (s: Quests, id: string): Quest | undefined => s.list.find((q) => q.id === id.trim().toLowerCase());
export const taskOf = (q: Quest, id: string): Task | undefined => q.tasks.find((t) => t.id === id.trim().toLowerCase());

/** The quest a task id belongs to, and the task, when both are kept and the quest is open. */
export function findTask(s: Quests, id: string): { q: Quest; t: Task } | null {
  const k = String(id ?? "").trim().toLowerCase();
  for (const q of openQuests(s)) {
    const t = q.tasks.find((x) => x.id === k);
    if (t) return { q, t };
  }
  return null;
}

/* ------------------------------------------------- the tree ------------------------------------------------- */

export const isDone = (t: Task): boolean => !t.closed && t.value >= t.target;
/** Still to do: neither done nor closed. */
export const isLive = (t: Task): boolean => !t.closed && t.value < t.target;
export const topOf = (q: Quest): Task | undefined => q.tasks.find((t) => t.under === null);
export const childrenOf = (q: Quest, t: Task): Task[] => q.tasks.filter((x) => x.under === t.id);
export const parentOf = (q: Quest, t: Task): Task | undefined => (t.under === null ? undefined : q.tasks.find((x) => x.id === t.under));
export function descendantsOf(q: Quest, t: Task): Task[] {
  const out: Task[] = [];
  const walk = (x: Task): void => {
    for (const c of childrenOf(q, x)) {
      out.push(c);
      walk(c);
    }
  };
  walk(t);
  return out;
}
export function ancestorsOf(q: Quest, t: Task): Task[] {
  const out: Task[] = [];
  for (let p = parentOf(q, t); p && out.length < q.tasks.length; p = parentOf(q, p)) out.push(p);
  return out;
}
/** The aim of the quest: the task marked as it, or the top task. */
export const mainOf = (q: Quest): Task | undefined => q.tasks.find((t) => t.main) ?? topOf(q);
export const liveOf = (q: Quest): Task[] => q.tasks.filter(isLive);

export type Status = "done" | "closed" | "blocked" | "waiting" | "open";

/**
 * Where a task stands. "blocked": it needs preparing first and not enough beneath it is done yet. "waiting": tasks
 * beneath it are still to do (they come first, though nothing stops the story doing this one outright). "open": it can
 * be taken up now.
 */
export function status(q: Quest, t: Task): Status {
  if (t.closed) return "closed";
  if (t.value >= t.target) return "done";
  if (t.prep > 1 && t.gained < t.prep - 1) return "blocked";
  return childrenOf(q, t).some(isLive) ? "waiting" : "open";
}

/**
 * The task to point the way to: prerequisites before what they lead to, the branch that holds the aim before others.
 * Undefined only for a quest with nothing left to do.
 */
export function nextOf(q: Quest): Task | undefined {
  const top = topOf(q);
  if (!top || !isLive(top)) return undefined;
  const main = mainOf(q);
  const holdsMain = (t: Task): boolean => !!main && (t === main || descendantsOf(q, t).includes(main));
  const walk = (t: Task): Task => {
    const found = childrenOf(q, t).filter(isLive).sort((a, b) => Number(holdsMain(b)) - Number(holdsMain(a))).map(walk);
    return found.find((x) => status(q, x) === "open") ?? (status(q, t) === "open" ? t : found[0] ?? t);
  };
  return walk(top);
}

/* ------------------------------------------------- similar wording ------------------------------------------------- */

const SMALL = new Set(["the", "a", "an", "to", "of", "and", "or", "for", "in", "on", "at", "with", "from", "his", "her", "their", "its", "my", "your", "by", "into", "out", "up", "is", "be"]);
const words = (s: string): string[] => s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter((w) => w && !SMALL.has(w));

/** Whether two instructions plainly say the same thing: the same words once small ones are set aside, near enough. */
export function alike(a: string, b: string): boolean {
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  if (x.join(" ") === y.join(" ")) return true;
  const sx = new Set(x), sy = new Set(y);
  const both = [...sx].filter((w) => sy.has(w)).length;
  // Mostly the same words, or the shorter wholly inside the longer with a word or two more.
  return both / new Set([...sx, ...sy]).size >= 0.7 || (Math.min(sx.size, sy.size) >= 2 && both === Math.min(sx.size, sy.size) && Math.abs(sx.size - sy.size) <= 2);
}

/* ------------------------------------------------- building ------------------------------------------------- */

/** A task as it is written down from a checked answer, with the tasks that come before it. */
export interface TaskSpec {
  do: string;
  check: string;
  kind: Kind;
  target: number;
  aim: string;
  ready: boolean;
  main: boolean;
  first: TaskSpec[];
}

/** How many tasks a spec holds, itself included. */
export const sizeOf = (t: TaskSpec): number => 1 + t.first.reduce((n, c) => n + sizeOf(c), 0);

/** A target as the rules allow it for a kind: done is 1; a count is a whole number from 1 to 99; a share is above 0 and at most 1. */
export function targetFor(kind: Kind, v: unknown): number {
  const n = Number(v);
  if (kind === "done") return 1;
  if (kind === "count") return Number.isFinite(n) && n >= 1 ? Math.min(99, Math.round(n)) : 1;
  return Number.isFinite(n) && n > 0 && n <= 1 ? Math.round(n * 100) / 100 : 1;
}

function plant(q: Quest, spec: TaskSpec, under: string | null): Task {
  const t: Task = {
    id: `${q.id}-${++q.n}`,
    do: str(spec.do, 120),
    check: str(spec.check, 160),
    kind: spec.kind,
    target: targetFor(spec.kind, spec.target),
    value: 0,
    aim: str(spec.aim, 60),
    under,
    prep: spec.ready ? 1 : 2,
    gained: 0,
    main: spec.main,
    closed: false,
    why: "",
    moot: false,
    at: 0,
  };
  q.tasks.push(t);
  for (const c of spec.first) plant(q, c, t.id);
  return t;
}

/** A new open quest from a checked plan. The plan's aim is the task marked main, else the top task. */
export function addQuest(s: Quests, d: { title: string; goal: string; from: string; after?: string; top: TaskSpec }, turn: number): Quest {
  const q: Quest = { id: `q${++s.n}`, title: str(d.title, 60), goal: str(d.goal, 200), from: str(d.from, 60), after: str(d.after, 20), tasks: [], state: "open", begun: turn, touched: turn, ended: 0, end: "", nudge: null, n: 0 };
  plant(q, d.top, null);
  // A plan's task with nothing written beneath it has nothing to wait for: out of reach, it could only be freed by the wait in
  // repair. Only a task with steps beneath it starts out of reach.
  for (const t of q.tasks) if (!childrenOf(q, t).length) t.prep = 1;
  // One aim: the first marked, else the top task.
  const marked = q.tasks.filter((t) => t.main);
  for (const t of marked.slice(1)) t.main = false;
  if (!marked.length) q.tasks[0]!.main = true;
  s.list.push(q);
  return q;
}

/** Whether a new task with these words may be added to a quest: there is room, and it is not a task already there. */
export function roomFor(q: Quest, what: string, more = 1): boolean {
  return liveOf(q).length + more <= LIVE_MOST && q.tasks.length + more <= ALL_MOST && !q.tasks.some((t) => alike(t.do, what));
}

/* ------------------------------------------------- what a passage changes ------------------------------------------------- */

/** A task is done: its value is full, it counts for every task above it, and what was beneath it and not yet done is no longer needed. */
export function complete(q: Quest, t: Task, turn: number): void {
  t.value = t.target;
  t.at = turn;
  for (const a of ancestorsOf(q, t)) a.gained++;
  for (const d of descendantsOf(q, t)) if (isLive(d)) Object.assign(d, { closed: true, moot: true, why: "no longer needed" });
  if (t.under !== null) q.nudge = { turn, task: t.id };
  q.touched = turn;
}

export type Moved = "done" | "more" | "less" | null;

/**
 * A value the reader set for a live task. A done-or-not task moves only when it is done; a count or a share may go up or
 * down, and is done at its target. A task not yet within reach takes no part credit: only being done outright.
 */
export function setValue(q: Quest, t: Task, v: unknown, turn: number): Moved {
  if (!isLive(t)) return null;
  let x: number;
  if (t.kind === "done") {
    const yes = v === true || v === 1 || (typeof v === "string" && /^(true|yes|done|1)$/i.test(v.trim()));
    if (!yes) return null;
    x = 1;
  } else {
    let n = typeof v === "string" ? Number(/-?\d+(?:\.\d+)?/.exec(v)?.[0] ?? NaN) : Number(v);
    if (typeof v === "boolean") n = v ? t.target : NaN;
    if (!Number.isFinite(n)) return null;
    if (t.kind === "share" && n > 1 && n <= 100) n /= 100;
    x = t.kind === "count" ? Math.max(0, Math.min(t.target, Math.round(n))) : Math.max(0, Math.min(1, Math.round(n * 100) / 100));
  }
  if (x >= t.target) {
    complete(q, t, turn);
    return "done";
  }
  if (status(q, t) === "blocked" || x === t.value) return null;
  const was = t.value;
  t.value = x;
  q.touched = turn;
  return x > was ? "more" : "less";
}

/** A task the story has brought within reach. Only a task that was out of reach. */
export function unblock(q: Quest, t: Task, turn: number): boolean {
  if (status(q, t) !== "blocked") return false;
  t.prep = 1;
  q.touched = turn;
  return true;
}

/** Whether the aim is beneath this task: then its tasks may not be swapped for another way. */
export const holdsMainBelow = (q: Quest, t: Task): boolean => descendantsOf(q, t).some((d) => d.main && isLive(d));

/** A lead the story found: a task to do before another. Null when it may not be added. */
export function addLead(q: Quest, t: Task, spec: TaskSpec, turn: number): Task | null {
  if (!isLive(t) || sizeOf(spec) !== 1 || !roomFor(q, spec.do)) return null;
  const added = plant(q, { ...spec, main: false, first: [] }, t.id);
  q.touched = turn;
  return added;
}

/**
 * Another way found to a task: it replaces the tasks beneath it that are still to do (done ones stay done and keep
 * counting). The new tasks are side by side, or one after another when they must come in order. Null when it may not
 * be done: the task is done or closed, the aim is among what would be replaced, or the new steps are already there or
 * there is no room.
 */
export function otherWay(q: Quest, t: Task, steps: TaskSpec[], inOrder: boolean, turn: number): Task[] | null {
  if (!isLive(t) || !steps.length || steps.length > OTHER_WAY_MOST || holdsMainBelow(q, t)) return null;
  // Each child not done goes, with everything beneath it; a done child stays, with what lies beneath it.
  const going = new Set(childrenOf(q, t).filter((c) => !isDone(c)).flatMap((c) => [c, ...descendantsOf(q, c)]).map((d) => d.id));
  const kept: Quest = { ...q, tasks: q.tasks.filter((x) => !going.has(x.id)) };
  if (steps.some((p, i) => !roomFor(kept, p.do, steps.length) || steps.some((o, j) => j < i && alike(o.do, p.do)))) return null;
  q.tasks = kept.tasks;
  const added: Task[] = [];
  let under = t.id;
  // In order: the last step is the one right beneath the task, each earlier one beneath the next.
  for (const p of inOrder ? [...steps].reverse() : steps) {
    const x = plant(q, { ...p, main: false, first: [] }, under);
    added.push(x);
    if (inOrder) under = x.id;
  }
  q.touched = turn;
  return inOrder ? added.reverse() : added;
}

/** A task the story made pointless or impossible: closed, with what was beneath it. Not a task already done. */
export function closeTask(q: Quest, t: Task, why: string, turn: number): boolean {
  if (!isLive(t)) return false;
  t.closed = true;
  t.why = str(why, 120);
  for (const d of descendantsOf(q, t)) if (isLive(d)) Object.assign(d, { closed: true, moot: true, why: "no longer needed" });
  q.touched = turn;
  return true;
}

/** Whether closing this task ends the quest's hope: it is the aim, or something the aim leads up to. */
export const isEssential = (q: Quest, t: Task): boolean => {
  const m = mainOf(q);
  return !!m && (t === m || ancestorsOf(q, m).includes(t));
};

export type Fate = "achieved" | "lost" | "going";

/** What the values now say of a quest: its top task is done; its aim or something above it was closed; or it goes on. */
export function fateOf(q: Quest): Fate {
  const top = topOf(q);
  if (!top) return "lost";
  if (isDone(top)) return "achieved";
  const m = mainOf(q);
  if (top.closed || (m && [m, ...ancestorsOf(q, m)].some((t) => t.closed && !t.moot))) return "lost";
  return liveOf(q).length ? "going" : "lost";
}

/**
 * A quest is never left out of reach for good. A task waiting on preparation whose tasks beneath are all done or
 * closed can gain nothing more, so it is brought within reach; and when everything left lies out of reach and the quest
 * has gone untouched a while, the next task is brought within reach too. Returns the tasks brought within reach.
 */
export function repair(q: Quest, turn: number): Task[] {
  const freed: Task[] = [];
  for (const t of liveOf(q)) {
    if (status(q, t) !== "blocked" || descendantsOf(q, t).some(isLive)) continue;
    if (childrenOf(q, t).length) {
      t.prep = 1;
      freed.push(t);
    }
  }
  const live = liveOf(q);
  if (live.length && !live.some((t) => status(q, t) === "open") && turn - q.touched >= UNBLOCK_TURNS) {
    const n = nextOf(q);
    if (n && status(q, n) === "blocked") {
      n.prep = 1;
      freed.push(n);
    }
  }
  return freed;
}

/** A quest comes to its end, and the oldest finished quests beyond those kept are let go. */
export function finish(s: Quests, q: Quest, state: Exclude<QuestState, "open">, end: string, turn: number): void {
  q.state = state;
  q.ended = turn;
  q.end = str(end, 200);
  q.nudge = null;
  q.touched = turn;
  const done = finishedQuests(s).sort((a, b) => a.ended - b.ended);
  const drop = new Set(done.slice(0, Math.max(0, done.length - KEEP_FINISHED)));
  if (drop.size) s.list = s.list.filter((x) => !drop.has(x));
}

/**
 * Room for a new quest: under the most open at once, or the open quest left untouched longest is set aside when it has
 * lain untouched long enough. Returns the quest set aside, true when there was room anyway, or false.
 */
export function makeRoom(s: Quests, turn: number): Quest | boolean {
  const open = openQuests(s);
  if (open.length < MAX_OPEN) return true;
  const stale = [...open].sort((a, b) => a.touched - b.touched)[0]!;
  if (turn - stale.touched < STALE_TURNS) return false;
  finish(s, stale, "dropped", "set aside, long untouched", turn);
  return stale;
}

/** Whether a goal is already kept: the same aim as a quest open or finished, or as a task of an open one. */
export const known = (s: Quests, goal: string): boolean =>
  s.list.some((q) => alike(q.goal, goal) || alike(q.title, goal) || (q.state === "open" && q.tasks.some((t) => isLive(t) && alike(t.do, goal))));

/* ------------------------------------------------- experience ------------------------------------------------- */

/** Tasks done in a quest, as the top task counts them, and the top task itself. */
export function tasksDone(q: Quest): number {
  const top = topOf(q);
  return top ? top.gained + (isDone(top) ? 1 : 0) : 0;
}

/**
 * What a quest is worth on its end, in deeds of the base size: one for each task done when it is achieved, and three
 * tenths of half that when it is lost. Given out in the sizes the sheet knows (2.0, 1.4 and 0.75 of the base).
 */
export function questWorth(q: Quest, achieved: boolean): number {
  const n = Math.min(8, tasksDone(q));
  return achieved ? n : 0.3 * 0.5 * n;
}

const SIZES: readonly [number, number][] = [[5, 2.0], [4, 1.4], [3, 0.75]];

/** Experience for a quest's worth, through the sheet's own rule. Returns what to tell. */
export function questXp(s: Sheet, worth: number): string[] {
  const told: string[] = [];
  let left = Math.min(8, Math.max(0, worth));
  let total = 0;
  for (let guard = 0; guard < 10 && left >= 0.75; guard++) {
    const [size, share] = SIZES.find(([, x]) => x <= left + 1e-9)!;
    left -= share;
    for (const line of gainXp(s, size)) {
      const m = /^(\d+) experience\.$/.exec(line);
      if (m) total += Number(m[1]);
      else told.push(line);
    }
  }
  return total ? [`${total} experience.`, ...told] : told;
}

/* ------------------------------------------------- as text ------------------------------------------------- */

/** How far a task has come, in words: "not yet", "3 of 5", "40%". */
export function progressOf(t: Task): string {
  if (t.kind === "count") return `${Math.round(t.value)} of ${t.target}`;
  if (t.kind === "share") return `${Math.round(t.value * 100)}% of ${Math.round(t.target * 100)}%`;
  return isDone(t) ? "done" : "not yet";
}

export const whoAsked = (q: Quest): string => (q.from === "self" ? "set by themselves" : q.from ? `asked by ${q.from}` : "");
