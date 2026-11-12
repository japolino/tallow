/**
 * Plays a whole sitting against real models, with the player's lines given in advance: the narrator, builder and hero
 * on the strong chat model, the reader on the fast one, and the Decision model for the quick questions, as Lumiverse
 * would. For finding out what really happens with a line, end to end. Keys and models come from .env.local (see
 * scripts/bench-route.ts); keep real cards out of the repo.
 *
 *   bun --env-file=.env.local scripts/play-real.ts --card card.json --lines lines.txt [--seed s]
 *
 * lines.txt has one player line per line; when they run out, the night ends. A line that starts with "FORK:" is kept
 * for the next fork in a story, and only for a fork. One that starts with "DIE:" is kept for the next die spent in a
 * story of scenes: "high", "low", "mid", or the die's number (the best die when there is none).
 *
 * Cards given and taken are printed, and at the end how many calls each job made and how long they took.
 */
import { readFileSync } from "node:fs";
import type { DecisionAnswer, DecisionQuestion } from "lumiverse-spindle-types";
import type { CardInfo } from "../src/game/card.js";
import type { Table } from "../src/game/director.js";
import { modelMinds } from "../src/game/modelminds.js";
import type { Message, Role } from "../src/game/prompts.js";
import { sit } from "../src/game/session.js";
import type { RoadStop } from "../src/engine/adventure.js";
import { forkRead } from "../src/engine/tell-adventure.js";
import { boardText } from "../src/engine/battle.js";
import { battleLedger } from "../src/engine/tell-battle.js";

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

/** Calls and milliseconds by job: the role, and the scenes written again told apart from the builder's first story. */
const calls: Record<string, { n: number; ms: number }> = {};
const jobOf = (messages: Message[], role: Role): string => (messages[0]?.content.includes("keep a short tabletop story true") ? "revise" : role);

const ask = async (messages: Message[], role: Role): Promise<string> => {
  const model = role === "reader" ? env.CHAT_MODEL_FAST! : env.CHAT_MODEL_STRONG!;
  const s = Date.now();
  const job = jobOf(messages, role);
  const tally = (calls[job] ??= { n: 0, ms: 0 });
  tally.n++;
  const r = await fetch(env.CHAT_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.CHAT_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages }), signal: AbortSignal.timeout(90_000) });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content ?? "";
  tally.ms += Date.now() - s;
  out(`    (${job} on ${model}, ${Date.now() - s} ms${text ? "" : `: ${JSON.stringify(j).slice(0, 160)}`})`);
  if (job === "revise" || (job === "reader" && /"own"\s*:\s*\{/.test(text))) out(`    (${job} said: ${text.replace(/\s+/g, " ").slice(0, 900)})`);
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
    const i = lines.findIndex((l) => !l.startsWith("FORK:") && !l.startsWith("DIE:"));
    const line = i >= 0 ? lines.splice(i, 1)[0]! : "done for tonight";
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
  async battle(b: import("../src/engine/battle.js").Battle | null) {
    if (!b) return void out("[the mat is rolled up]");
    out(boardText(b));
    out(`[${battleLedger(b)}]`);
  },
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
  // As the room does it (game/roomtable.ts): a player sent the other way first, then the meaning, then the words.
  async fork(stops: RoadStop[], read?: (line: string) => string | null) {
    const i = lines.findIndex((l) => l.startsWith("FORK:"));
    const line = i >= 0 ? lines.splice(i, 1)[0]!.slice(5).trim() : "left";
    out(`
[${at()}] YOU (at the fork: ${stops.map((s, i) => `${i + 1}. ${s.name}`).join(" / ")}): ${line}`);
    const own = read?.(line);
    if (own) return own;
    // Keyed as the room keys them (game/roomtable.ts): what the player sees, never a hidden index.
    const keys = stops.map((_, i) => (stops.length > 2 ? String(i + 1) : i ? "right" : "left"));
    const options = Object.fromEntries(stops.map((s, i) => [keys[i]!, stops.length > 2 ? `place ${i + 1} on the map: ${s.name}, ${s.teaser}` : `the card on the ${i ? "right" : "left"}: ${s.name}, ${s.teaser}`]));
    const k = await minds.pick?.(stops.length > 2 ? "Which place do you go to?" : "Which way do you go, left or right?", line, options).catch(() => null);
    const id = k && k in options ? stops[keys.indexOf(k)]!.id : (forkRead(line, stops) ?? stops[0]!.id);
    out(`    (fork: ${stops.find((s) => s.id === id)?.name}${k ? "" : ", by the words"})`);
    return id;
  },
  async offer() {
    return 0;
  },
  async hand(dice: readonly number[]) {
    if (dice.length) out(`[hand: ${dice.join(", ")}]`);
  },
  async pickDie(dice: readonly number[]) {
    const i = lines.findIndex((l) => l.startsWith("DIE:"));
    const want = i >= 0 ? lines.splice(i, 1)[0]!.slice(4).trim().toLowerCase() : "high";
    const sorted = [...dice].sort((a, b) => a - b);
    const value = want === "low" ? sorted[0]! : want === "mid" ? sorted[Math.floor(sorted.length / 2)]! : /^\d+$/.test(want) && dice.includes(Number(want)) ? Number(want) : sorted.at(-1)!;
    out(`[${at()}] YOU spend the ${value} (${want})`);
    return dice.indexOf(value);
  },
  async give(c: { id: string; side: string; name: string; text?: string }) {
    out(`[card given: ${c.side} / ${c.name} (${c.id})${c.text ? `: ${c.text}` : ""}]`);
  },
  async take(id: string) {
    out(`[card taken: ${id}]`);
  },
  async rival() {},
  async move() {},
  theatre() {},
} as unknown as Table;

const minds = modelMinds(ask, { decide, onFallback: (job, why) => out(`    [FELL BACK: ${job}: ${why}]`) });
await sit({ card, seed: arg("seed") ?? "real-1", table, minds, ask, fellBack: (job, why) => out(`    [NOT TAKEN: ${job}: ${why}]`) });
out(`\n[${at()}] over.`);
out(Object.entries(calls).map(([k, v]) => `${k}: ${v.n} calls, ${(v.ms / 1000).toFixed(1)} s`).join("\n"));
