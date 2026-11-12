/**
 * Plays a whole sitting against real models, with the player's lines given in advance: the narrator, builder and hero
 * on the strong chat model, the reader on the fast one, and the Decision model for the quick questions, as Lumiverse
 * would. For finding out what really happens with a line, end to end. Keys and models come from .env.local (see
 * scripts/bench-route.ts); keep real cards out of the repo.
 *
 *   bun --env-file=.env.local scripts/play-real.ts --card card.json --lines lines.txt [--seed s]
 *
 * lines.txt has one player line per line; when they run out, the night ends. A line that starts with "FORK:" is kept
 * for the next fork in a story, and only for a fork. In a story of scenes, "HIGH" spends the highest die on the table,
 * and "REST" is kept for the next time a rest is offered; with --dice, every die asked for is the highest on the table
 * and every cost asked for is a wound, so the lines need only be deeds. The narrator's book is kept in memory: each chapter is
 * printed as it is shelved, and the whole book once the night is over.
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
import type { Book } from "../src/engine/chapter.js";
import { chapterKeeper } from "../src/game/chapters.js";

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

/** In a story of scenes: the dice last said to be on the table, and whether the narrator has just asked to rest or press on. */
let dice: number[] = [];
let restAsked = false;
let dieAsked = false;
let costAsked = false;
const table = {
  async say(l: string[]) {
    for (const x of l) {
      out(`NARRATOR: ${x}`);
      // As engine/tell-hand.ts says them: "Your first three: 4, 2 and 6.", "Dice left: …", "I throw 3 more: …".
      const said = /(Your first three|Your dice|Dice left|more|Dice on the table|left them):\s*(.+)$/.exec(x);
      if (said) dice = [...said[2]!.matchAll(/\b(\d{1,2})\b/g)].map((m) => Number(m[1]));
      restAsked = /Rest before the next scene, or press on\?/.test(x);
      dieAsked = /Which die do you spend on it\?/.test(x);
      costAsked = /Give something up and it lands/.test(x);
    }
  },
  async write() {
    // With --dice, a die asked for is the highest on the table, and a cost asked for is a wound: the lines are only deeds.
    const auto = dieAsked && dice.length ? String(Math.max(...dice)) : costAsked ? "a wound" : null;
    if (process.argv.includes("--dice") && auto) {
      dieAsked = costAsked = false;
      out(`\n[${at()}] YOU: ${auto}`);
      return { line: auto, given: Promise.resolve() };
    }
    // "HIGH" in lines.txt spends the highest die on the table; "REST" is kept for the next time a rest is offered, and only then.
    const r = lines.findIndex((l) => l === "REST");
    if (restAsked && r >= 0) {
      lines.splice(r, 1);
      restAsked = false;
      out(`\n[${at()}] YOU: I rest, eat, and bind my hands.`);
      return { line: "I rest, eat, and bind my hands.", given: Promise.resolve() };
    }
    const i = lines.findIndex((l) => !l.startsWith("FORK:") && l !== "REST");
    let line = i >= 0 ? lines.splice(i, 1)[0]! : "done for tonight";
    if (line === "HIGH") line = dice.length ? String(Math.max(...dice)) : "I look around";
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
  async give() {},
  async take() {},
  async rival() {},
  async move() {},
  theatre() {},
} as unknown as Table;

// The narrator's book (game/chapters.ts), kept in memory: each chapter printed as it is shelved, and the whole book at the end.
const books = new Map<string, Book>();
const printed = new Set<string>();
const chapters = chapterKeeper({
  ask,
  card: card.name,
  load: async (hero) => books.get(hero) ?? null,
  save: async (hero, b) => void books.set(hero, b),
  shelf: {
    writing: (work) => (out(`    [${at()} THE NARRATOR TAKES THE BOOK DOWN AND WRITES]`), void work.then(() => out(`    [${at()} the book goes back on its shelf]`))),
    show: (b) => {
      for (const c of b.chapters.filter((x) => !printed.has(x.id))) {
        printed.add(c.id);
        out(`\n    ===== CHAPTER ${c.n} (${c.at}): ${c.title} =====\n${c.text.map((p) => `    ${p}`).join("\n\n")}\n    FACTS: ${c.facts.join(" | ")}\n    PICTURE: ${c.scene ?? ""}\n`);
      }
    },
  },
  fellBack: (job, why) => out(`    [NOT TAKEN: ${job}: ${why}]`),
});
const said = table.say.bind(table);
table.say = (l) => (chapters.heard(l), said(l));
const minds = modelMinds(ask, { decide, context: () => ({ world: chapters.established() }), onFallback: (job, why) => out(`    [FELL BACK: ${job}: ${why}]`) });
await sit({ card, seed: arg("seed") ?? "real-1", table, minds, ask, chapters, save: (t) => chapters.story(t && !t.over ? `${t.adv.id}|${t.seed}` : null), fellBack: (job, why) => out(`    [NOT TAKEN: ${job}: ${why}]`) });
out(`\n[${at()}] over; waiting for the book.`);
await chapters.settled();
for (const [hero, b] of books) out(`\n[${at()}] THE BOOK OF ${hero}: ${b.chapters.length} chapters (${b.chapters.map((c) => `${c.n}. ${c.title} [${c.at}]`).join("; ")})`);
