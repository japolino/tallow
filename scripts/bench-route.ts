/**
 * Measures the free-form router (src/game/route.ts) against real models: every line in tests/route-cases.ts, asked of
 * the Decision model and of chat models, with what each got wrong and how long it took. Keys come from .env.local
 * (never committed):
 *
 *   DECISION_URL, DECISION_MODEL, DECISION_API_KEY   a Decision API (POST {model, state, questions})
 *   CHAT_URL, CHAT_API_KEY, CHAT_MODEL_FAST, CHAT_MODEL_STRONG   an OpenAI-style chat completions endpoint
 *
 *   bun --env-file=.env.local scripts/bench-route.ts [decision,fast,strong] [--only <text>] [--runs n] [--story]
 *
 * --story measures the story router (src/game/storyroute.ts) on tests/story-cases.ts instead; --fork measures picking
 * a way at a fork by meaning (decisions.ts, pickQuestions and pickMessages) on the fork lines there.
 */
import type { DecisionAnswer } from "lumiverse-spindle-types";
import { parseRoute, routeFromAnswers, routeMessages, routeQuestions } from "../src/game/route.js";
import { parseStoryRoute, storyRouteFromAnswers, storyRouteMessages, storyRouteQuestions } from "../src/game/storyroute.js";
import { CASES, CONTEXTS } from "../tests/route-cases.js";
import { FORK_CASES, FORKS, STORY_CASES, STORY_CONTEXTS } from "../tests/story-cases.js";
import { parsePick, pickFromAnswers, pickMessages, pickQuestions } from "../src/game/decisions.js";

const env = process.env;
const which = (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "decision,fast,strong").split(",");
const argOf = (k: string): string | undefined => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const only = argOf("only");
const runs = Number(argOf("runs") ?? 1);
const story = process.argv.includes("--story");
const fork = process.argv.includes("--fork");

/** One line to route, wherever it comes from: what it should be, and what else is fair. */
interface Case {
  line: string;
  ctx: string;
  want: string;
  ok?: string[];
  which?: string;
}
/** What came back: the kind, and the way, place, matter, goal or player it names. */
interface Got {
  route: string;
  which?: string;
}
const all: Case[] = fork ? FORK_CASES.map((c) => ({ line: c.line, ctx: c.fork, want: c.want })) : story ? STORY_CASES : CASES;
const cases = all.filter((c) => !only || c.line.toLowerCase().includes(only.toLowerCase()));

// The two routers, behind one face.
type R = { route: string; place?: string; thread?: string; goal?: string; way?: string; who?: string } | null;
const flat = (r: R): Got | null => (r ? { route: r.route, which: r.place ?? r.thread ?? r.goal ?? r.way ?? r.who } : null);
const forkOf = (c: Case) => FORKS[c.ctx as keyof typeof FORKS] as { question: string; options: Record<string, string> };
const picked = (k: string | null): Got | null => (k ? { route: k } : null);
const questionsOf = (c: Case) => (fork ? pickQuestions(forkOf(c).question, c.line, forkOf(c).options) : story ? storyRouteQuestions(c.line, STORY_CONTEXTS[c.ctx]!) : routeQuestions(c.line, CONTEXTS[c.ctx]!));
const fromAnswers = (c: Case, a: Record<string, DecisionAnswer> | null): Got | null => (fork ? picked(pickFromAnswers(a, forkOf(c).options)) : flat(story ? storyRouteFromAnswers(a, STORY_CONTEXTS[c.ctx]!) : routeFromAnswers(a, CONTEXTS[c.ctx]!)));
const messagesOf = (c: Case) => (fork ? pickMessages(forkOf(c).question, c.line, forkOf(c).options) : story ? storyRouteMessages(c.line, STORY_CONTEXTS[c.ctx]!) : routeMessages(c.line, CONTEXTS[c.ctx]!));
const parsed = (c: Case, raw: string): Got | null => (fork ? picked(parsePick(raw, forkOf(c).options)) : flat(story ? parseStoryRoute(raw, STORY_CONTEXTS[c.ctx]!) : parseRoute(raw, CONTEXTS[c.ctx]!)));

type Asker = (c: Case) => Promise<{ got: Got | null; raw: string }>;

const decision: Asker = async (c) => {
  const q = questionsOf(c);
  const r = await fetch(env.DECISION_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.DECISION_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.DECISION_MODEL, ...q }), signal: AbortSignal.timeout(20_000) });
  const j = (await r.json()) as { answers?: Record<string, DecisionAnswer> };
  const a = j.answers?.[fork ? "pick" : "route"];
  const raw = a?.type === "choice" ? `${a.choice} ${(a.probabilities[a.choice] ?? 0).toFixed(2)}` : JSON.stringify(j).slice(0, 200);
  return { got: fromAnswers(c, j.answers ?? null), raw };
};

const chat =
  (model: string): Asker =>
  async (c) => {
    const r = await fetch(env.CHAT_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.CHAT_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: messagesOf(c), temperature: 0 }), signal: AbortSignal.timeout(60_000) });
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = j.choices?.[0]?.message?.content ?? JSON.stringify(j).slice(0, 200);
    return { got: parsed(c, raw), raw: raw.replace(/\s+/g, " ").slice(0, 120) };
  };

const ASKERS: Record<string, [string, Asker, number]> = {
  decision: [env.DECISION_MODEL ?? "decision", decision, 2],
  fast: [env.CHAT_MODEL_FAST ?? "fast", chat(env.CHAT_MODEL_FAST!), 6],
  strong: [env.CHAT_MODEL_STRONG ?? "strong", chat(env.CHAT_MODEL_STRONG!), 4],
};

async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await f(items[k]!);
      }
    }),
  );
  return out;
}

const right = (c: Case, g: Got | null): boolean => !!g && (g.route === c.want || !!c.ok?.includes(g.route));
// A way the model was not sure of is no answer, not a wrong one: the reader names the way then.
const whichRight = (c: Case, g: Got | null): boolean => !c.which || !g || g.route !== c.want || (story && c.want === "try" && !g.which) || g.which === c.which;

for (const key of which) {
  const [name, ask, n] = ASKERS[key]!;
  let ok = 0, strict = 0, unsure = 0, wrongWhich = 0, total = 0;
  const times: number[] = [];
  const misses = new Map<string, number>();
  for (let run = 0; run < runs; run++) {
    const res = await pool(cases, n, async (c) => {
      const t0 = Date.now();
      try {
        const r = await ask(c);
        return { c, ...r, ms: Date.now() - t0 };
      } catch (e) {
        return { c, got: null, raw: `error: ${(e as Error).message}`, ms: Date.now() - t0 };
      }
    });
    for (const r of res) {
      total++;
      times.push(r.ms);
      if (!r.got) unsure++;
      if (right(r.c, r.got)) ok++;
      if (r.got?.route === r.c.want) strict++;
      if (!whichRight(r.c, r.got)) wrongWhich++;
      if (!right(r.c, r.got) || !whichRight(r.c, r.got)) {
        const k = `  want ${r.c.want}${r.c.which ? ` (${r.c.which})` : ""}, got ${r.got ? `${r.got.route}${r.got.which ? ` (${r.got.which})` : ""}` : "nothing"} [${r.raw}]: ${r.c.line.slice(0, 110)}`;
        misses.set(k, (misses.get(k) ?? 0) + 1);
      }
    }
  }
  times.sort((a, b) => a - b);
  const pct = (x: number): string => `${((100 * x) / total).toFixed(1)}%`;
  console.log(`\n=== ${name}: ${pct(ok)} right (${pct(strict)} exactly), ${unsure} unsure or failed, ${wrongWhich} wrong ${story ? "way/goal/player" : "place/matter/goal"}, of ${total}; median ${times[Math.floor(times.length / 2)]} ms, p90 ${times[Math.floor(times.length * 0.9)]} ms`);
  for (const [k, v] of misses) console.log(`${v > 1 ? `${v}x` : "  "}${k}`);
}
