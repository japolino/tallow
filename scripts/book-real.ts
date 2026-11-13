/**
 * Keeps the narrator's book beside a freeform chat against real models (game/chatbook.ts): the chat is given in
 * advance and replayed a reply at a time, as Lumiverse would tell the book of each one. For finding out what really
 * happens: whether a time skip is seen as a new scene, and whether the chapter is aftermath and not a recap. Keys and
 * models come from .env.local (see scripts/play-real.ts); keep real chats out of the repo.
 *
 *   bun --env-file=.env.local scripts/book-real.ts --chat chat.txt [--preset preset.txt] [--wish "what about"] [--no-decide]
 *
 * chat.txt is the chat as blocks: a line "YOU:" or "THEM:" on its own begins a message, and everything up to the next
 * such line is its text (raw, as a chat keeps it: thinking blocks and markup are cleaned as the backend cleans them).
 * --preset stands a text before the chat as a preset's system prompt would, to see the chapter's rules win over it.
 * --wish asks for one more chapter at the end, about that. --no-decide leaves the scene question to the reader model.
 */
import { readFileSync } from "node:fs";
import type { DecisionAnswer, DecisionQuestion } from "lumiverse-spindle-types";
import { chatLines, type HostMessage } from "../src/backend/chat.js";
import type { Book } from "../src/engine/chapter.js";
import { CHAT_HERO } from "../src/engine/chatbook.js";
import { chapterKeeper } from "../src/game/chapters.js";
import { chatBook } from "../src/game/chatbook.js";
import type { PresetSnapshot } from "../src/game/preset.js";
import type { Message, Role } from "../src/game/prompts.js";

const env = process.env;
const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const out = (s: string): void => console.log(s);
const t0 = Date.now();
const at = (): string => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

const messages: HostMessage[] = [];
for (const l of readFileSync(arg("chat")!, "utf8").split(/\r?\n/)) {
  const head = /^(YOU|THEM):\s*$/.exec(l);
  if (head) messages.push({ id: `m${messages.length}`, index_in_chat: messages.length, is_user: head[1] === "YOU", name: head[1] === "YOU" ? "You" : "Them", content: "" });
  else if (messages.length) messages[messages.length - 1]!.content += `${l}\n`;
}
const presetText = arg("preset") ? readFileSync(arg("preset")!, "utf8").trim() : "";
const snapshot: PresetSnapshot | null = presetText ? { v: 1, presetId: "real", name: "given", before: [{ role: "system", content: presetText }], after: [], dropped: [], judged: false } : null;

const ask = async (msgs: Message[], role: Role): Promise<string> => {
  const model = role === "reader" ? env.CHAT_MODEL_FAST! : env.CHAT_MODEL_STRONG!;
  const s = Date.now();
  const r = await fetch(env.CHAT_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.CHAT_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: msgs }), signal: AbortSignal.timeout(120_000) });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content ?? "";
  out(`    (${role} on ${model}, ${Date.now() - s} ms, ${msgs.reduce((n, m) => n + m.content.length, 0)} chars asked${text ? "" : `: ${JSON.stringify(j).slice(0, 160)}`})`);
  if (role === "reader") out(`    (reader said: ${text.replace(/\s+/g, " ").slice(0, 200)})`);
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

let saved: Book | null = null;
let seen = 0;
const keeper = chapterKeeper({
  ask,
  card: "real",
  load: async () => saved,
  save: async (_h, b) => void (saved = b),
  fellBack: (job, why) => out(`    [NOT TAKEN: ${job}: ${why}]`),
});
const book = chatBook({
  chatId: "real",
  lines: async (after) => chatLines(messages.slice(0, seen), after),
  who: async () => ({ card: { name: arg("card") ?? "", about: arg("about") ?? "" }, hero: { name: arg("hero") ?? "the player's character", who: "" } }),
  snapshot: async () => snapshot,
  ask,
  ...(process.argv.includes("--no-decide") || !env.DECISION_URL ? {} : { decide }),
  keeper,
  fellBack: (job, why) => out(`    [FELL BACK: ${job}: ${why}]`),
});

const show = (c: { n: number; title: string; text: string[]; facts: string[]; scene?: string; upTo?: number }): void => {
  out(`\n===== CHAPTER ${c.n}: ${c.title || "(untitled)"} (written from the chat up to message ${c.upTo}) =====`);
  for (const p of c.text) out(`${p}\n`);
  out(`(${c.text.join(" ").split(/\s+/).length} words)`);
  for (const f of c.facts) out(`FACT: ${f}`);
  if (c.scene) out(`PICTURE: ${c.scene}`);
  out("=====\n");
};

for (let i = 0; i < messages.length; i++) {
  const m = messages[i]!;
  if (m.is_user || i === 0) continue;
  seen = i + 1;
  const mine = messages[i - 1]!;
  out(`\n[${at()}] reply ${i} written, after the player's: "${(mine.content ?? "").replace(/\s+/g, " ").trim().slice(0, 110)}"`);
  const r = await book.replied();
  if (r.chapter) show(r.chapter);
  else out(`    no chapter: ${r.why}`);
}
if (arg("wish")) {
  seen = messages.length;
  out(`\n[${at()}] the player asks for a chapter: "${arg("wish")}"`);
  const r = await book.write(arg("wish"));
  if (r.chapter) show(r.chapter);
  else out(`    no chapter: ${r.why}`);
}
await keeper.settled();
out(`\n[${at()}] the book holds ${saved ? (saved as Book).chapters.filter((c) => c.story).length : 0} chapter(s) kept under "${CHAT_HERO}".`);
