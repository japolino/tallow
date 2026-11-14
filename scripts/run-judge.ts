/**
 * Judges lines against the real models without playing them: the judge and its second look only (game/runturn.ts,
 * judgeTurn), each line several times from the same moment of a run, to see how often a line is refused. For checking
 * the judge after its wording is touched, above all on lines a co-author writes: people and events written into the
 * scene, time skipped, going somewhere and then doing something there.
 *
 *   bun --env-file=.env.local scripts/run-judge.ts --card .artifacts/replay/some.json --lines lines.txt [--times 4] [--seed 7] [--load run.json] [--save run.json] [--out file.md]
 *
 * Without --load a run is set up from the card first (and kept with --save, to judge from the same moment again).
 * A line that begins with "!" is one that ought to be refused; every other line ought not to be.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { DecisionAnswer, DecisionQuestion } from "lumiverse-spindle-types";
import type { Run } from "../src/engine/run.js";
import type { Message, Role } from "../src/game/ask.js";
import { begin, judgeTurn, type Card } from "../src/game/runturn.js";

const env = process.env;
const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const doc: string[] = [];
const outFile = arg("out");
const out = (s = ""): void => {
  doc.push(s);
  console.log(s);
  if (outFile) writeFileSync(outFile, doc.join("\n"));
};

async function complete(model: string, messages: Message[]): Promise<string> {
  const r = await fetch(env.CHAT_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.CHAT_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages }), signal: AbortSignal.timeout(150_000) });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error(`no answer (${JSON.stringify(j).slice(0, 160)})`);
  return text;
}
const ask = (messages: Message[], role: Role): Promise<string> => complete(role === "reader" ? env.CHAT_MODEL_FAST! : env.CHAT_MODEL_STRONG!, messages);
const decide = async (_what: string, state: unknown, questions: Record<string, DecisionQuestion>, ms: number): Promise<Record<string, DecisionAnswer | undefined> | null> => {
  try {
    const r = await fetch(env.DECISION_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.DECISION_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.DECISION_MODEL, state, questions }), signal: AbortSignal.timeout(ms) });
    return ((await r.json()) as { answers?: Record<string, DecisionAnswer> }).answers ?? null;
  } catch {
    return null;
  }
};
// The judge alone: no system reads the line.
const deps = { ask, ...(env.DECISION_URL ? { decide } : {}), systems: [], log: (m: string) => out(`_(${m})_`) };

const linesFile = arg("lines");
if (!linesFile) throw new Error("--lines file is needed");
const lines = readFileSync(linesFile, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const times = Number(arg("times") ?? 4);

let run: Run;
const load = arg("load");
if (load) run = JSON.parse(readFileSync(load, "utf8")) as Run;
else {
  const cardFile = arg("card");
  if (!cardFile) throw new Error("--card or --load is needed");
  // The card file is the one scripts/run-play.ts reads: { world, who, hero, card, messages }.
  const file = JSON.parse(readFileSync(cardFile, "utf8")) as { world: string; who: string; hero: string; messages?: { you?: boolean; text: string }[] };
  const opens = file.messages?.find((m) => !m.you)?.text;
  const card: Card = { world: file.world, who: file.who, name: file.hero, ...(opens ? { first: opens } : {}) };
  run = await begin(deps, card, Number(arg("seed") ?? 7));
  const save = arg("save");
  if (save) writeFileSync(save, JSON.stringify(run));
}
out(`At ${run.place.name || "an unnamed place"}, turn ${run.turn}. Each line judged ${times} times.\n`);

let wrong = 0, all = 0;
for (const raw of lines) {
  const refuse = raw.startsWith("!");
  const line = raw.replace(/^!\s*/, "");
  const got = await Promise.all(Array.from({ length: times }, async () => {
    try {
      const p = await judgeTurn(deps, structuredClone(run), line);
      const x = p.report;
      const refused = x.kind === "ooc" || (x.kind === "action" && (x.verdict === "implausible" || x.verdict === "missing"));
      return { refused, text: `${x.kind}${x.kind === "action" ? `, ${x.verdict}: ${x.act}` : ""}${x.second ? ` [second look: ${x.second}]` : ""}${refused ? ` (${x.reason || p.reply || ""})` : ""}` };
    } catch (e) {
      return { refused: true, text: `could not be judged: ${(e as Error).message}` };
    }
  }));
  const bad = got.filter((g) => g.refused !== refuse).length;
  wrong += bad;
  all += got.length;
  out(`${bad ? "WRONG" : "ok   "} ${refuse ? "(should be refused) " : ""}> ${line}`);
  for (const g of got) out(`        ${g.refused ? "refused" : "taken  "}  ${g.text.slice(0, 300)}`);
}
out(`\n${all - wrong} of ${all} judged as they should be.`);
