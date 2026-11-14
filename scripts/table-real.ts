/**
 * The table under a chat (game/pricetable.ts), end to end against real models, with a chat stood in for: the chat's
 * own model writes each reply from a plain roleplay prompt with the table's note put straight after the player's
 * message, as the interceptor does in Lumiverse (backend/table.ts). For finding out whether the reader reads an
 * ordinary roleplay message rightly, whether the chat's model plays what the note says, and how long a reply is held.
 *
 *   bun --env-file=.env.local scripts/table-real.ts --world lab/price/worlds/coast.json --lines lab/price/runs/chat-coast.txt [--seed n] [--bare]
 *
 * The world file is { world, who, premise } (made-up worlds only; keep real cards out of the repo). The lines file has
 * one player message per line. "SWIPE" asks for the last reply again, which must bill nothing; "UNDO" takes the last
 * message back. With --bare the same lines are played with no table at all, to set the two chats side by side.
 */
import { readFileSync } from "node:fs";
import type { DecisionAnswer, DecisionQuestion } from "lumiverse-spindle-types";
import { table } from "../src/engine/price.js";
import { createTable, noteOf, type Kept, type TableWorld } from "../src/game/pricetable.js";
import type { Message, Role } from "../src/game/ask.js";

const env = process.env;
const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const world = JSON.parse(readFileSync(arg("world")!, "utf8")) as TableWorld;
const lines = readFileSync(arg("lines")!, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const bare = process.argv.includes("--bare");
const out = (s: string): void => console.log(s);
const calls: Record<string, { n: number; ms: number }> = {};

async function chat(model: string, messages: Message[], job: string): Promise<string> {
  const s = Date.now();
  const r = await fetch(env.CHAT_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.CHAT_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages }), signal: AbortSignal.timeout(120_000) });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content ?? "";
  const tally = (calls[job] ??= { n: 0, ms: 0 });
  tally.n++;
  tally.ms += Date.now() - s;
  if (!text) throw new Error(`no answer (${JSON.stringify(j).slice(0, 160)})`);
  return text;
}
const ask = (messages: Message[], role: Role): Promise<string> => chat(role === "reader" ? env.CHAT_MODEL_FAST! : env.CHAT_MODEL_STRONG!, messages, role);
const decide = async (_what: string, state: unknown, questions: Record<string, DecisionQuestion>, ms: number): Promise<Record<string, DecisionAnswer | undefined> | null> => {
  const s = Date.now();
  try {
    const r = await fetch(env.DECISION_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.DECISION_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.DECISION_MODEL, state, questions }), signal: AbortSignal.timeout(ms) });
    const j = (await r.json()) as { answers?: Record<string, DecisionAnswer> };
    const tally = (calls.decision ??= { n: 0, ms: 0 });
    tally.n++;
    tally.ms += Date.now() - s;
    out(`    (second look: ${Object.entries(j.answers ?? {}).map(([q, a]) => (a.type === "choice" ? `${q}=${a.choice} ${(a.probabilities?.[a.choice] ?? 0).toFixed(2)}` : q)).join(", ") || "no answer"})`);
    return j.answers ?? null;
  } catch {
    return null;
  }
};

/** The chat as Lumiverse would hold it, and the prompt its own model is given: a plain roleplay prompt, nothing of Tallow's. */
const history: { you: boolean; text: string }[] = [];
const CHAT: Message = { role: "system", content: `You are the narrator and every character but the player's in an ongoing roleplay.\n\nTHE WORLD AND WHO IS IN IT:\n${world.world}\n\nTHE PLAYER'S CHARACTER:\n${world.who}\n\nWrite the next part of the story in 90 to 160 words of prose. Never speak or act for the player's character.` };
const prompt = (note: string | null): Message[] => {
  const turns: Message[] = history.map((h) => ({ role: h.you ? "user" : "assistant", content: h.text }));
  return [CHAT, ...turns, ...(note ? [{ role: "system", content: note } as Message] : [])];
};
const recent = (): string[] => history.slice(-5, -1).map((h) => `${h.you ? "The player" : "The story"}: ${h.text.slice(0, 700)}`);

const t = createTable({ ask, ...(env.DECISION_URL ? { decide } : {}), log: (m) => out(`    (${m})`) });

history.push({ you: false, text: await chat(env.CHAT_MODEL_STRONG!, [CHAT, { role: "user", content: "(Open the scene: where the player's character is and who is near. Do not act for them.)" }], "chat") });
out(`THE STORY: ${history[0]!.text}\n`);

let k: Kept | null = null;
if (!bare) {
  const s = Date.now();
  k = await t.deal(world, history.map((h) => `The story: ${h.text}`), Number(arg("seed") ?? 11));
  if (!k) throw new Error("no table was dealt");
  out(`[dealt in ${((Date.now() - s) / 1000).toFixed(1)} s]\n${table(k.state)}\n`);
}

const held: number[] = [];
for (const line of lines) {
  if (line === "UNDO" && k) {
    k = t.undo(k);
    history.splice(-2);
    out(`[the last message was taken back]\n${table(k.state)}\n`);
    continue;
  }
  const swipe = line === "SWIPE";
  if (swipe) history.pop();
  else history.push({ you: true, text: line });
  out(`${"-".repeat(100)}\nYOU${swipe ? " (the same message, asked again)" : ""}: ${history.at(-1)!.text}`);
  let note: string | null = null;
  if (k) {
    const s = Date.now();
    const was = k;
    k = await t.beat(k, history.at(-1)!.text, history.length - 1, recent());
    held.push(Date.now() - s);
    out(`  [read in ${((Date.now() - s) / 1000).toFixed(1)} s${k === was ? "; nothing played again" : ""}]`);
    for (const l of k.last?.ledger ?? []) out(`  · ${l}`);
    if (!k.last?.ledger.length) out("  · (nothing at the table changed)");
    note = noteOf(k);
  }
  const reply = await chat(env.CHAT_MODEL_STRONG!, prompt(note), "chat");
  history.push({ you: false, text: reply });
  out(`\nTHE STORY: ${reply}\n`);
  if (k) {
    const s = Date.now();
    const seen = await t.seen(k, reply, [`The story: ${reply.slice(0, 1200)}`]);
    if (seen) {
      k = seen;
      out(`  [reply read in ${((Date.now() - s) / 1000).toFixed(1)} s, after it was shown]`);
      for (const n of k.news) out(`  ! ${n}`);
    }
    out(`\n${table(k.state)}\n`);
  }
}

out("=".repeat(100));
if (k) {
  const sorted = [...held].sort((a, b) => a - b);
  out(`A reply was held ${(sorted[Math.floor(sorted.length / 2)]! / 1000).toFixed(1)} s at the median and ${(sorted.at(-1)! / 1000).toFixed(1)} s at the most, before the chat's own model began.`);
  out(`\nTHE LAST NOTE THE CHAT'S MODEL WAS GIVEN:\n${noteOf(k)}`);
}
for (const [job, c] of Object.entries(calls)) out(`${job}: ${c.n} call(s), ${(c.ms / c.n / 1000).toFixed(1)} s each`);
