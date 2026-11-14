/**
 * A chat that was really played freeform, played again with the table under it (game/pricetable.ts), to set the two
 * side by side. The player's messages are the ones they really wrote, in order and unchanged; the chat's history is
 * the one that really happened, so each message is read in the story it was written for. For each message it shows
 * what the table made of it, the reply the chat really gave, and the reply a model gives to the same history when
 * the table's note is in the prompt.
 *
 *   bun --env-file=.env.local scripts/table-replay.ts --chat .artifacts/replay/some.json [--turns 12] [--out file.md] [--all-replies]
 *
 * A reply with the table is written only for a message the table did something with, unless --all-replies.
 *
 * The chat file is { world, who, premise, hero, card, messages: [{ you, name, text }] }. Real chats are private: keep
 * them and what this writes in .artifacts (ignored), never in the repo. The table is dealt from the chat up to the
 * first reply to the player's first message, and played from their next message on.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { DecisionAnswer, DecisionQuestion } from "lumiverse-spindle-types";
import { brief, table } from "../src/engine/price.js";
import { createTable, ends, noteOf, type Kept, type TableWorld } from "../src/game/pricetable.js";
import type { Message, Role } from "../src/game/ask.js";

const env = process.env;
const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
interface Line { you: boolean; name: string; text: string }
const chat = JSON.parse(readFileSync(arg("chat")!, "utf8")) as TableWorld & { hero: string; card: string; messages: Line[] };
const world: TableWorld = { world: chat.world, who: chat.who, premise: chat.premise ?? "" };
const turns = Number(arg("turns") ?? 12);
const outFile = arg("out") ?? arg("chat")!.replace(/\.json$/, ".replay.md");
const doc: string[] = [];
const out = (s = ""): void => void doc.push(s);
const save = (): void => writeFileSync(outFile, doc.join("\n"));
const clip = (s: string, most: number): string => (s.length > most ? `${s.slice(0, most).trimEnd()} […]` : s);
const quote = (s: string): string => s.split("\n").map((l) => `> ${l}`).join("\n");
const calls: Record<string, { n: number; ms: number }> = {};
const tally = (job: string, since: number): void => {
  const c = (calls[job] ??= { n: 0, ms: 0 });
  c.n++;
  c.ms += Date.now() - since;
};

async function complete(model: string, messages: Message[], job: string): Promise<string> {
  const s = Date.now();
  const r = await fetch(env.CHAT_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.CHAT_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages }), signal: AbortSignal.timeout(150_000) });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content ?? "";
  tally(job, s);
  if (!text) throw new Error(`no answer (${JSON.stringify(j).slice(0, 160)})`);
  return text;
}
const ask = (messages: Message[], role: Role): Promise<string> => complete(role === "reader" ? env.CHAT_MODEL_FAST! : env.CHAT_MODEL_STRONG!, messages, role);
let looked = "";
const decide = async (_what: string, state: unknown, questions: Record<string, DecisionQuestion>, ms: number): Promise<Record<string, DecisionAnswer | undefined> | null> => {
  const s = Date.now();
  try {
    const r = await fetch(env.DECISION_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.DECISION_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.DECISION_MODEL, state, questions }), signal: AbortSignal.timeout(ms) });
    const j = (await r.json()) as { answers?: Record<string, DecisionAnswer> };
    tally("decision", s);
    looked = Object.entries(j.answers ?? {}).map(([q, a]) => (a.type === "choice" ? `${q}=${a.choice}` : q)).join(", ");
    return j.answers ?? null;
  } catch {
    return null;
  }
};

const ms = chat.messages;
const firstYou = ms.findIndex((m) => m.you);
const firstReply = ms.findIndex((m, i) => i > firstYou && !m.you);
const start = ms.findIndex((m, i) => i > firstReply && m.you);
if (firstYou < 0 || firstReply < 0 || start < 0) throw new Error("the chat is too short to replay");
const said = (m: Line, most: number): string => `${m.you ? chat.hero : "The story"}: ${ends(m.text, most)}`;

const t = createTable({ ask, ...(env.DECISION_URL ? { decide } : {}), log: (m) => out(`_(${m})_`) });
const CHAT: Message = { role: "system", content: `You are the narrator and every character but the player's in an ongoing roleplay.\n\nTHE CARD (the world and who is in it):\n${chat.world}\n\nTHE PLAYER'S CHARACTER:\n${chat.who}\n\nWrite the next part of the story in 150 to 260 words of prose, in the voice the story so far is told in. No status panels, no lists, no thinking out loud.` };

out(`# ${chat.card}, played as ${chat.hero}: freeform beside the table\n`);
out(`The table was dealt from the chat's first ${firstReply + 1} messages, and your next ${turns} messages were played on it exactly as you wrote them.\n`);
const dealAt = Date.now();
let k: Kept | null = await t.deal(world, ms.slice(0, firstReply + 1).map((m) => said(m, 1800)), 11);
if (!k) throw new Error("no table was dealt");
out(`## The table as dealt (${((Date.now() - dealAt) / 1000).toFixed(0)} s)\n\n\`\`\`\n${table(k.state)}\n\`\`\`\n`);
save();

const held: number[] = [];
let played = 0;
for (let i = start; i < ms.length && played < turns; i++) {
  const m = ms[i]!;
  if (!m.you) continue;
  played++;
  const history = ms.slice(0, i);
  // What the chat really answered: everything up to the player's next message.
  const next = ms.findIndex((x, j) => j > i && x.you);
  const real = ms.slice(i + 1, next < 0 ? ms.length : next).map((x) => x.text).join("\n\n");
  out(`---\n\n## Message ${played}\n\n**You wrote:**\n\n${quote(clip(m.text, 1200))}\n`);
  const s = Date.now();
  looked = "";
  try {
    k = await t.beat(k, m.text, i, history.slice(-4).map((x) => said(x, 900)));
  } catch (e) {
    out(`_(the table could not play this message: ${(e as Error).message})_\n`);
  }
  held.push(Date.now() - s);
  out(`**What the table made of it** (read in ${((Date.now() - s) / 1000).toFixed(1)} s${looked ? `; second look: ${looked}` : ""}):\n`);
  for (const l of k.last?.index === i && k.last.ledger.length ? k.last.ledger : ["Nothing at the table changed: plain roleplay."]) out(`- ${l.replace(/ \([cwx]\d+(?:\.\d+)?\)/g, "")}`);
  out(`\n\`${brief(k.state).replace(/\n/g, " ")}\`\n`);
  out(`**Freeform, as it really went:**\n\n${quote(clip(real, 1100) || "(no reply in the chat)")}\n`);
  let reply = "";
  const acted = (k.last?.index === i && k.last.ledger.length > 0) || k.news.length > 0;
  if (!acted && !process.argv.includes("--all-replies")) reply = "(The table had nothing to tell the model, so the reply would be an ordinary freeform one.)";
  else try {
    const turnsOf: Message[] = history.slice(-8).map((x) => ({ role: x.you ? "user" : "assistant", content: clip(x.text, 2500) }) as Message);
    reply = await complete(env.CHAT_MODEL_STRONG!, [CHAT, ...turnsOf, { role: "user", content: m.text }, { role: "system", content: noteOf(k) }], "chat");
  } catch (e) {
    reply = `(the model gave no reply: ${(e as Error).message})`;
  }
  out(`**With the table:**\n\n${quote(reply)}\n`);
  // The table goes on from the reply the chat really gave, since that is what your next message was written to.
  if (real) {
    try {
      const seen = await t.seen(k, real, [`The story: ${ends(real, 1200)}`]);
      if (seen) {
        k = seen;
        for (const n of k.news) out(`**Then, at the table:** ${n.replace(/ Bring it into the scene[\s\S]*$/, "")}\n`);
      }
    } catch (e) {
      out(`_(the reply could not be read: ${(e as Error).message})_\n`);
    }
  }
  save();
  console.log(`${chat.card}: message ${played} of ${turns} done`);
}

const sorted = [...held].sort((a, b) => a - b);
out(`---\n\n## The table at the end\n\n\`\`\`\n${table(k.state)}\n\`\`\`\n`);
out(`A reply was held ${(sorted[Math.floor(sorted.length / 2)]! / 1000).toFixed(1)} s at the median and ${(sorted.at(-1)! / 1000).toFixed(1)} s at the most before the chat's own model would have begun.\n`);
out(Object.entries(calls).map(([job, c]) => `${job}: ${c.n} calls, ${(c.ms / c.n / 1000).toFixed(1)} s each`).join("; "));
save();
console.log(`written to ${outFile}`);
