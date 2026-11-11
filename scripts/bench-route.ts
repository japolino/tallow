/**
 * Measures the free-form router (src/game/route.ts) against real models: every line in tests/route-cases.ts, asked of
 * the Decision model and of chat models, with what each got wrong and how long it took. Keys come from .env.local
 * (never committed):
 *
 *   DECISION_URL, DECISION_MODEL, DECISION_API_KEY   a Decision API (POST {model, state, questions})
 *   CHAT_URL, CHAT_API_KEY, CHAT_MODEL_FAST, CHAT_MODEL_STRONG   an OpenAI-style chat completions endpoint
 *
 *   bun --env-file=.env.local scripts/bench-route.ts [decision,fast,strong] [--only <text>] [--runs n]
 */
import type { DecisionAnswer } from "lumiverse-spindle-types";
import { parseRoute, routeFromAnswers, routeMessages, routeQuestions, type Routed } from "../src/game/route.js";
import { CASES, CONTEXTS, type RouteCase } from "../tests/route-cases.js";

const env = process.env;
const which = (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "decision,fast,strong").split(",");
const argOf = (k: string): string | undefined => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const only = argOf("only");
const runs = Number(argOf("runs") ?? 1);
const cases = CASES.filter((c) => !only || c.line.toLowerCase().includes(only.toLowerCase()));

type Asker = (c: RouteCase) => Promise<{ got: Routed | null; raw: string }>;

const decision: Asker = async (c) => {
  const q = routeQuestions(c.line, CONTEXTS[c.ctx]!);
  const r = await fetch(env.DECISION_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.DECISION_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.DECISION_MODEL, ...q }), signal: AbortSignal.timeout(20_000) });
  const j = (await r.json()) as { answers?: Record<string, DecisionAnswer> };
  const a = j.answers?.route;
  const raw = a?.type === "choice" ? `${a.choice} ${(a.probabilities[a.choice] ?? 0).toFixed(2)}` : JSON.stringify(j).slice(0, 200);
  return { got: routeFromAnswers(j.answers ?? null, CONTEXTS[c.ctx]!), raw };
};

const chat =
  (model: string): Asker =>
  async (c) => {
    const r = await fetch(env.CHAT_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.CHAT_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: routeMessages(c.line, CONTEXTS[c.ctx]!), temperature: 0 }), signal: AbortSignal.timeout(60_000) });
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = j.choices?.[0]?.message?.content ?? JSON.stringify(j).slice(0, 200);
    return { got: parseRoute(raw, CONTEXTS[c.ctx]!), raw: raw.replace(/\s+/g, " ").slice(0, 120) };
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

const right = (c: RouteCase, g: Routed | null): boolean => !!g && (g.route === c.want || !!c.ok?.includes(g.route));
const whichRight = (c: RouteCase, g: Routed | null): boolean => !c.which || !g || g.route !== c.want || (g.place ?? g.thread ?? g.goal) === c.which;

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
        const k = `  want ${r.c.want}${r.c.which ? ` (${r.c.which})` : ""}, got ${r.got ? `${r.got.route}${r.got.place ?? r.got.thread ?? r.got.goal ? ` (${r.got.place ?? r.got.thread ?? r.got.goal})` : ""}` : "nothing"} [${r.raw}]: ${r.c.line.slice(0, 110)}`;
        misses.set(k, (misses.get(k) ?? 0) + 1);
      }
    }
  }
  times.sort((a, b) => a - b);
  const pct = (x: number): string => `${((100 * x) / total).toFixed(1)}%`;
  console.log(`\n=== ${name}: ${pct(ok)} right (${pct(strict)} exactly), ${unsure} unsure or failed, ${wrongWhich} wrong place/matter/goal, of ${total}; median ${times[Math.floor(times.length / 2)]} ms, p90 ${times[Math.floor(times.length * 0.9)]} ms`);
  for (const [k, v] of misses) console.log(`${v > 1 ? `${v}x` : "  "}${k}`);
}
