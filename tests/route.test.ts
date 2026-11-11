/**
 * The free-form router (game/route.ts): the questions and the prompt are well formed for every case, the answers are
 * read safely, and a sitting does what the model said a line is, whatever its words. How well the real models answer
 * is measured by scripts/bench-route.ts, not here.
 */
import { describe, expect, test } from "bun:test";
import type { DecisionAnswer } from "lumiverse-spindle-types";
import { rulesHero } from "../src/engine/hero.js";
import type { CardInfo } from "../src/game/card.js";
import type { Director, Table } from "../src/game/director.js";
import { standIns } from "../src/game/minds.js";
import { parseRoute, ROUTE_NAMES, routeFromAnswers, routeMessages, routeQuestions, routesFor, type Route, type Routed, type RouteContext } from "../src/game/route.js";
import { sit } from "../src/game/session.js";
import { CASES, CONTEXTS } from "./route-cases.js";

const choice = (c: string, p = 0.9): DecisionAnswer => ({ type: "choice", choice: c, probabilities: { [c]: p }, confidence: p });

describe("the cases", () => {
  test("every case is a route there, with a known place, matter or goal where it names one", () => {
    for (const c of CASES) {
      const ctx = CONTEXTS[c.ctx]!;
      expect(routesFor(ctx)).toContain(c.want);
      if (c.which && c.want === "go") expect([...ctx.places, "new"]).toContain(c.which);
      if (c.which && c.want === "thread") expect(ctx.threads.map((t) => t.id)).toContain(c.which);
      if (c.which && c.want === "work") expect(ctx.goals.map((g) => g.id)).toContain(c.which);
    }
    // Every route is measured.
    for (const r of ROUTE_NAMES) expect(CASES.some((c) => c.want === r)).toBe(true);
  });
});

describe("the questions", () => {
  test("offer only what makes sense here, and name the goals and matters in the choice", () => {
    const q = routeQuestions("I spend the day on the mill", CONTEXTS.home!);
    const route = q.questions.route as { criteria: Record<string, string> };
    expect(Object.keys(route.criteria)).not.toContain("thread");
    expect(route.criteria.work).toContain("build a watermill on the stream");
    expect(Object.keys(q.questions)).toEqual(["route", "place", "goal"]);
    const sys = routeMessages("x", CONTEXTS.inn!)[0]!.content;
    expect(sys).not.toContain("- work:");
    expect(sys).toContain("- thread:");
  });

  test("read the line whole, however long", () => {
    const long = `I ${"say a kind and careful thing, ".repeat(50)}and smile.`;
    expect(JSON.stringify(routeQuestions(long, CONTEXTS.inn!).state)).toContain("and smile.");
    expect(routeMessages(long, CONTEXTS.inn!)[1]!.content).toContain("and smile.");
  });
});

describe("the answers", () => {
  const inn = CONTEXTS.inn!;
  test("from the Decision model: taken when sure, with the place, matter or goal it names", () => {
    expect(routeFromAnswers({ route: choice("try") }, inn)).toEqual({ route: "try" });
    expect(routeFromAnswers({ route: choice("try", 0.3) }, inn)).toBeNull();
    expect(routeFromAnswers({ route: choice("go"), place: choice("the chapel") }, inn)).toEqual({ route: "go", place: "the chapel" });
    expect(routeFromAnswers({ route: choice("go"), place: choice("none") }, inn)).toEqual({ route: "go", place: "new" });
    expect(routeFromAnswers({ route: choice("thread"), thread: choice("thread-2") }, inn)).toEqual({ route: "thread", thread: "thread-2" });
    // A matter it cannot name is only talk about it.
    expect(routeFromAnswers({ route: choice("thread"), thread: choice("none") }, inn)).toEqual({ route: "say" });
    // Work with no goal to work at is not offered, so not taken.
    expect(routeFromAnswers({ route: choice("work") }, inn)).toBeNull();
    expect(routeFromAnswers(null, inn)).toBeNull();
  });

  test("from the reader: JSON, in a fence or not, checked the same way", () => {
    expect(parseRoute('```json\n{"route": "try"}\n```', inn)).toEqual({ route: "try" });
    expect(parseRoute('{"route": "GO", "place": "The Chapel"}', inn)).toEqual({ route: "go", place: "the chapel" });
    expect(parseRoute('{"route": "dance"}', inn)).toBeNull();
    expect(parseRoute("no idea", inn)).toBeNull();
    expect(parseRoute('{"route": "work", "goal": "project-2"}', CONTEXTS.home!)).toEqual({ route: "work", goal: "project-2" });
  });
});

describe("a sitting with a router", () => {
  const MAREN: CardInfo = { name: "Maren", description: "Maren Vell is a ferrywoman of thirty who keeps the crossing at Dunmore." };

  function tableFor(lines: string[], log: string[], d: { now: Director | null }): Table {
    return {
      say: async (l: string[]) => void log.push(...l),
      write: async () => {
        const line = lines.shift() ?? "done for tonight";
        log.push(`> ${line}`);
        return { line, given: Promise.resolve() };
      },
      offer: async () => 0,
      give: async () => {},
      page: async (p: { heading: string }) => void log.push(`[page] ${p.heading}`),
      wait: async <T,>(_k: string, p: Promise<T>) => p,
      clock: () => {},
      carry: async () => {},
      weigh: async () => {},
      throwDie: async () => void log.push("[die]"),
      dieOrLine: async () => null,
      aside: async () => {},
    } as unknown as Table;
  }

  async function play(lines: string[], routes: Record<string, Route>): Promise<{ log: string[]; told: string[] }> {
    const log: string[] = [];
    const told: string[] = [];
    const d = { now: null as Director | null };
    const route = async (line: string, _ctx: RouteContext): Promise<Routed | null> => (routes[line] ? { route: routes[line]!, ...(routes[line] === "go" ? { place: "new" } : {}) } : null);
    const roam = async (line: string, _m: unknown, note?: string): Promise<string> => (line && told.push(`${line} | ${note ?? ""}`), "The world answers you, in the Lantern Yard.");
    const minds = { ...standIns(0), hero: async (l: string) => rulesHero(l), route, roam, read: async () => "none" as const };
    await sit({ card: MAREN, seed: "route-sitting", table: tableFor(lines, log, d), minds, ask: null, started: (x) => (d.now = x) });
    return { log, told };
  }

  test("a check called for is thrown, even when the words alone would make it a goal", async () => {
    const line = "I want to make a check to know if somebody is watching me";
    const { log } = await play(["no story, just let me roam", "I am a courier named Tam", line, "done for tonight"], { [line]: "try", "done for tonight": "done" });
    expect(log).toContain("[die]");
    expect(log.some((l) => l.startsWith("You set yourself a goal"))).toBe(false);
  });

  test("a line the model says is talk is answered whole, even with 'and wait' in it", async () => {
    const line = "I pour her a cup of my own wine, tell her of the hills where I was born, and wait.";
    const { log, told } = await play(["no story, just let me roam", "I am a courier named Tam", line, "done for tonight"], { [line]: "say", "done for tonight": "done" });
    expect(told.some((t) => t.startsWith(line))).toBe(true);
    expect(log.some((l) => /^You wait/.test(l))).toBe(false);
  });

  test("a goal the words would miss is set, and going somewhere unnamed is named by the narrator", async () => {
    const goal = "I've decided I'm going to build my own tavern, right here by the gate.";
    const away = "I finish my drink and step out into the rain.";
    const { log } = await play(["no story, just let me roam", "I am a courier named Tam", goal, away, "notebook", "done for tonight"], { [goal]: "goal", [away]: "go", notebook: "notebook", "done for tonight": "done" });
    expect(log.some((l) => l.startsWith("You set yourself a goal. Build my own tavern"))).toBe(true);
    expect(log).toContain("The world answers you, in the Lantern Yard.");
    expect(log.some((l) => l.startsWith("[page]"))).toBe(true);
  });
});
