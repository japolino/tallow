/**
 * Plays a whole sitting against real models, with the player's lines given in advance: the narrator, builder and hero
 * on the strong chat model, the reader on the fast one, and the Decision model for the quick questions, as Lumiverse
 * would. For finding out what really happens with a line, end to end. Keys and models come from .env.local (see
 * scripts/bench-route.ts); keep real cards out of the repo.
 *
 *   bun --env-file=.env.local scripts/play-real.ts --card card.json --lines lines.txt [--seed s]
 *
 * lines.txt has one player line per line; when they run out, the night ends.
 */
import { readFileSync } from "node:fs";
import type { DecisionAnswer, DecisionQuestion } from "lumiverse-spindle-types";
import type { CardInfo } from "../src/game/card.js";
import type { Table } from "../src/game/director.js";
import { modelMinds } from "../src/game/modelminds.js";
import type { Message, Role } from "../src/game/prompts.js";
import { sit } from "../src/game/session.js";

const env = process.env;
const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const card = JSON.parse(readFileSync(arg("card")!, "utf8")) as CardInfo;
const lines = readFileSync(arg("lines")!, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const t0 = Date.now();
const at = (): string => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const out = (s: string): void => console.log(s);

const ask = async (messages: Message[], role: Role): Promise<string> => {
  const model = role === "reader" ? env.CHAT_MODEL_FAST! : env.CHAT_MODEL_STRONG!;
  const s = Date.now();
  const r = await fetch(env.CHAT_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.CHAT_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages }), signal: AbortSignal.timeout(90_000) });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content ?? "";
  out(`    (${role} on ${model}, ${Date.now() - s} ms${text ? "" : `: ${JSON.stringify(j).slice(0, 160)}`})`);
  if (!text) throw new Error("no answer");
  return text;
};

const decide = async (what: string, state: unknown, questions: Record<string, DecisionQuestion>, ms: number): Promise<Record<string, DecisionAnswer | undefined> | null> => {
  const s = Date.now();
  try {
    const r = await fetch(env.DECISION_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.DECISION_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.DECISION_MODEL, state, questions }), signal: AbortSignal.timeout(ms) });
    const j = (await r.json()) as { answers?: Record<string, DecisionAnswer> };
    const a = Object.entries(j.answers ?? {}).map(([k, v]) => (v.type === "choice" ? `${k}=${v.choice} ${(v.probabilities[v.choice] ?? 0).toFixed(2)}` : k));
    out(`    (decision "${what}", ${Date.now() - s} ms: ${a.join(", ") || JSON.stringify(j).slice(0, 160)})`);
    return j.answers ?? null;
  } catch (e) {
    out(`    (decision "${what}" failed: ${(e as Error).message})`);
    return null;
  }
};

const table = {
  async say(l: string[]) {
    for (const x of l) out(`NARRATOR: ${x}`);
  },
  async write() {
    const line = lines.shift() ?? "done for tonight";
    out(`\n[${at()}] YOU: ${line}`);
    return { line, given: Promise.resolve() };
  },
  async page(w: { heading?: string; his: string[] }) {
    out(`[page: ${w.heading ?? ""}] ${w.his.join(" / ")}`);
  },
  async aside() {},
  async wait<T>(_b: string, p: Promise<T>) {
    return p;
  },
  async weigh() {},
  async dieOrLine() {
    return null;
  },
  async throwDie(n: number) {
    out(`[THE DIE: ${n}]`);
  },
  async carry() {},
  clock() {},
  async deal() {},
  async turn() {},
  async clear() {},
  async fork() {
    return "";
  },
  async offer() {
    return 0;
  },
  async give() {},
  async take() {},
  async rival() {},
  async move() {},
  theatre() {},
} as unknown as Table;

const minds = modelMinds(ask, { decide, onFallback: (job, why) => out(`    [FELL BACK: ${job}: ${why}]`) });
await sit({ card, seed: arg("seed") ?? "real-1", table, minds, ask });
out(`\n[${at()}] over.`);
