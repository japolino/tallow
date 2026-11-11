/**
 * The story router (game/storyroute.ts): the cases are well formed, only the kinds that make sense where the player is
 * are offered, the answers are read safely, and the director does what the router said a line is, whatever its words.
 * How well the real models answer is measured by scripts/bench-route.ts --story, not here.
 */
import { describe, expect, test } from "bun:test";
import type { DecisionAnswer } from "lumiverse-spindle-types";
import { COURIER, RESCUE } from "../src/content/adventures.js";
import type { Trip } from "../src/engine/adventure.js";
import { nameCheck } from "../src/engine/moment.js";
import { direct, LEFT_SAID, type Director, type Table } from "../src/game/director.js";
import { standIns, type Minds } from "../src/game/minds.js";
import { parseStoryRoute, STORY_ROUTE_NAMES, storyRouteFromAnswers, storyRouteMessages, storyRouteQuestions, storyRoutesFor, type StoryContext, type StoryRoute, type StoryRouted } from "../src/game/storyroute.js";
import { STORY_CASES, STORY_CONTEXTS } from "./story-cases.js";

const choice = (c: string, p = 0.9): DecisionAnswer => ({ type: "choice", choice: c, probabilities: { [c]: p }, confidence: p });

describe("the cases", () => {
  test("every case is a kind offered there, with a way open there, a goal they have or a player at the table", () => {
    for (const c of STORY_CASES) {
      const ctx = STORY_CONTEXTS[c.ctx]!;
      expect([c.line, storyRoutesFor(ctx).includes(c.want)]).toEqual([c.line, true]);
      for (const o of c.ok ?? []) expect([c.line, o, storyRoutesFor(ctx).includes(o)]).toEqual([c.line, o, true]);
      if (c.which && c.want === "try") expect(ctx.ways).toContain(c.which as never);
      if (c.which && c.want === "work") expect(ctx.goals.map((g) => g.id)).toContain(c.which);
      if (c.which && c.want === "send") expect(ctx.fellows).toContain(c.which);
    }
    // Every kind is measured.
    for (const r of STORY_ROUTE_NAMES) expect([r, STORY_CASES.some((c) => c.want === r)]).toEqual([r, true]);
  });
});

describe("the questions", () => {
  test("offer only what makes sense here: nobody to press with nobody here, no giving in outside a contest", () => {
    const archive = storyRoutesFor(STORY_CONTEXTS.archive!);
    for (const r of ["speak", "press", "sizeup", "favour", "vote", "talkover", "send", "regroup", "yield"] as StoryRoute[]) expect(archive).not.toContain(r);
    expect(archive).toContain("work");
    expect(archive).toContain("compare");
    expect(storyRoutesFor(STORY_CONTEXTS.brawl!)).toContain("yield");
    expect(storyRoutesFor(STORY_CONTEXTS.brawl!)).not.toContain("luck");
    expect(storyRoutesFor(STORY_CONTEXTS.chapel!)).toContain("regroup");
  });

  test("name the person and the players where they come in, and ask the way only of the ways open", () => {
    const q = storyRouteQuestions("I lean on him", STORY_CONTEXTS.gate!);
    const route = q.questions.route as { criteria: Record<string, string> };
    expect(route.criteria.press).toContain("Sergeant Holt");
    expect(route.criteria.talkover).toContain("Vypra and Stolas");
    expect(Object.keys((q.questions.way as { criteria: Record<string, string> }).criteria)).toEqual(["talk", "sneak", "force", "pay", "none"]);
    expect(Object.keys((storyRouteQuestions("x", STORY_CONTEXTS.archive!).questions.way as { criteria: Record<string, string> }).criteria)).toEqual(["sneak", "force", "none"]);
    const sys = storyRouteMessages("x", STORY_CONTEXTS.archive!)[0]!.content;
    expect(sys).not.toContain("- press:");
    expect(sys).not.toContain("{person}");
  });

  test("read the line whole, however long", () => {
    const long = `I ${"say a kind and careful thing, ".repeat(50)}and smile.`;
    expect(JSON.stringify(storyRouteQuestions(long, STORY_CONTEXTS.gate!).state)).toContain("and smile.");
    expect(storyRouteMessages(long, STORY_CONTEXTS.gate!)[1]!.content).toContain("and smile.");
  });
});

describe("the answers", () => {
  const gate = STORY_CONTEXTS.gate!;
  const archive = STORY_CONTEXTS.archive!;
  test("from the Decision model: taken when sure, with a way only when it is open and sure", () => {
    expect(storyRouteFromAnswers({ route: choice("try"), way: choice("sneak") }, gate)).toEqual({ route: "try", way: "sneak" });
    expect(storyRouteFromAnswers({ route: choice("try"), way: choice("sneak", 0.3) }, gate)).toEqual({ route: "try" });
    expect(storyRouteFromAnswers({ route: choice("try"), way: choice("talk") }, archive)).toEqual({ route: "try" });
    expect(storyRouteFromAnswers({ route: choice("speak", 0.3) }, gate)).toBeNull();
    // A kind not offered here is not taken.
    expect(storyRouteFromAnswers({ route: choice("press") }, archive)).toBeNull();
    expect(storyRouteFromAnswers({ route: choice("send"), who: choice("Vypra") }, gate)).toEqual({ route: "send", who: "Vypra" });
    expect(storyRouteFromAnswers({ route: choice("work"), goal: choice("project-1") }, archive)).toEqual({ route: "work", goal: "project-1" });
    expect(storyRouteFromAnswers(null, gate)).toBeNull();
  });

  test("from the reader: JSON, in a fence or not, checked the same way", () => {
    expect(parseStoryRoute('```json\n{"route": "try", "way": "Force"}\n```', gate)).toEqual({ route: "try", way: "force" });
    expect(parseStoryRoute('{"route": "SIZEUP"}', gate)).toEqual({ route: "sizeup" });
    expect(parseStoryRoute('{"route": "yield"}', gate)).toBeNull();
    expect(parseStoryRoute("no idea", gate)).toBeNull();
    // Work at a goal it cannot name is only talk about it.
    expect(parseStoryRoute('{"route": "work", "goal": "project-9"}', { ...archive, goals: [...archive.goals, { id: "project-2", goal: "a mill" }] })).toEqual({ route: "say" });
  });
});

describe("the director, with a router", () => {
  /** A table that writes the lines it is given, then the first way still open; and keeps a record. */
  function scripted(lines: string[], log: string[]): { table: Table; set(d: { trip: Trip; stage: string }): void } {
    let d!: { trip: Trip; stage: string };
    const table = {
      say: async (l: string[]) => void log.push(...l),
      write: async () => {
        const m = d.trip.facing?.moment;
        const way = m && (["sneak", "talk", "force", "pay"] as const).find((w) => nameCheck(m, { way: w }));
        const line = lines.shift() ?? (d.stage === "camp" ? "I press on" : { sneak: "I creep past quietly", talk: "I ask them kindly", force: "I shove my way through", pay: "I pay the toll" }[way ?? "sneak"]);
        log.push(`> ${line}`);
        return { line, given: Promise.resolve() };
      },
      page: async () => {},
      aside: async () => {},
      wait: async <T,>(_b: string, w: Promise<T>) => w,
      weigh: async () => {},
      dieOrLine: async () => null,
      throwDie: async () => void log.push("throw"),
      carry: async () => {},
      clock: () => {},
      deal: async () => {},
      turn: async () => {},
      clear: async () => {},
      fork: async (s: { id: string }[]) => s[0]!.id,
      offer: async () => 0,
      give: async () => {},
      take: async () => {},
      rival: async () => {},
      move: async () => {},
    } as unknown as Table;
    return { table, set: (x) => (d = x) };
  }

  /** Plays RESCUE with the lines given first, the router saying what each of them is, and nothing for the rest. */
  async function play(lines: string[], routes: Record<string, StoryRouted>, save?: (t: Trip | null) => void, more: Partial<Minds> = {}): Promise<{ log: string[]; asked: StoryContext[]; stops: string[]; d: Director }> {
    const log: string[] = [];
    const asked: StoryContext[] = [];
    const stops: string[] = [];
    const q = scripted([...lines], log);
    const storyRoute = async (line: string, ctx: StoryContext): Promise<StoryRouted | null> => (asked.push(ctx), stops.push(ctx.here), routes[line] ?? null);
    const d = direct(RESCUE, COURIER, "story-route", q.table, { ...standIns(0), storyRoute, ...more }, save ? { save } : {});
    q.set(d);
    await d.done;
    return { log, asked, stops, d };
  }
  const after = (log: string[], line: string, n = 3): string[] => log.slice(log.indexOf(`> ${line}`) + 1, log.indexOf(`> ${line}`) + 1 + n);

  test("a check called for is thrown on its stat, and gets them past nothing", async () => {
    const line = "I want to make a check to know if somebody is watching me";
    const { log, asked, stops } = await play([line], { [line]: { route: "check", stat: "sense" } });
    const next = after(log, line, 4);
    expect(next[0]).toMatch(/^A check on your Sense, then\./);
    expect(next).toContain("throw");
    expect(log.slice(log.indexOf(`> ${line}`) + 1).join(" ")).toMatch(/sense/i);
    // the place is still where it was: the next line is written at the same stop
    expect(stops[1]).toBe(stops[0]);
    expect(asked[0]!.here).toBeTruthy();
    expect(asked[0]!.ways.length).toBeGreaterThan(0);
  });

  test("a line that only does something it could miss is called for a roll, unasked, and what is to be found there is found", async () => {
    const line = "I run my fingers along the wall, feeling for any loose stone or hidden catch.";
    const { log } = await play([line], { [line]: { route: "check", stat: "sense" } });
    const next = after(log, line, 4);
    expect(next[0]).toMatch(/^That needs a roll: a check on your Sense/);
    expect(next).toContain("throw");
  });

  test("done for tonight in the middle of it leaves the story where it stands, saved, and no more is played", async () => {
    const line = "done for tonight";
    const saved: (Trip | null)[] = [];
    const { log, d } = await play([line], { [line]: { route: "stop" } }, (t) => void saved.push(t));
    expect(d.left).toBe(true);
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.at(-1)).toBeTruthy();
    expect(saved.at(-1)!.over).toBeFalsy();
    expect(log.slice(-LEFT_SAID.length)).toEqual(LEFT_SAID);
    expect(log.filter((l) => l.startsWith("> ")).length).toBe(1);
  });

  test("a line the model says is said is answered, even with 'and wait' in it, and nothing is thrown", async () => {
    const line = "I tell her of the hills where I was born, the long grey swell of the sea, and wait.";
    const { log } = await play([line], { [line]: { route: "say" } });
    const next = after(log, line, 2);
    expect(next).not.toContain("throw");
    expect(next.join(" ")).not.toMatch(/You wait/);
    expect(next.join(" ")).toContain("quarter of an hour");
  });

  test("a wait the words would take for a try is a wait, and a try the words would take for a wait is a try", async () => {
    const wait = "We settle in the reeds and see who comes and goes.";
    const slip = "I wait for her to turn her back, then creep along the race.";
    const { log } = await play([wait, slip], { [wait]: { route: "wait" }, [slip]: { route: "try", way: "sneak" } });
    expect(after(log, wait, 1)[0]).toMatch(/^You wait an hour/);
    expect(after(log, slip, 10)).toContain("throw");
  });

  test("how long a wait is comes from the model's reading, not only from its words", async () => {
    const wait = "We keep out of sight among the reeds till the light goes.";
    const pick: Minds["pick"] = async (question, _text, options) => (/how long/i.test(question) && "for-3" in options ? "for-3" : null);
    const { log } = await play([wait], { [wait]: { route: "wait" } }, undefined, { pick });
    expect(after(log, wait, 1)[0]).toMatch(/^You wait 3 hours/);
  });

  test("a give-in the router says is asked again, plainly, before the contest is let go", async () => {
    const yieldAll = { route: "yield" } as StoryRouted;
    const routes = new Proxy({}, { get: () => yieldAll }) as Record<string, StoryRouted>;
    const asked: string[] = [];
    const pickAs = (answer: string): Minds["pick"] => async (question, _t, options) => (asked.push(question), /give in/i.test(question) && answer in options ? answer : null);
    const no = await play([], routes, undefined, { pick: pickAs("no") });
    expect(no.log.join(" ")).not.toMatch(/You give in/);
    expect(asked.some((q) => /give in/i.test(q))).toBe(true);
    const yes = await play([], routes, undefined, { pick: pickAs("yes") });
    expect(yes.log.join(" ")).toMatch(/You give in/);
  });

  test("a goal is set from the line, however it is said", async () => {
    const line = "One day, when all this is over, I mean to build a proper ferry of my own.";
    const { log } = await play([line], { [line]: { route: "goal" } });
    expect(after(log, line, 1)[0]).toMatch(/^You set yourself a goal/);
  });
});
