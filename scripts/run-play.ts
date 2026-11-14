/**
 * A run (src/engine/run.ts, src/game/runturn.ts) played in the terminal against the real models, on a card.
 *
 *   bun --env-file=.env.local scripts/run-play.ts --card .artifacts/replay/some.json [--lines file] [--seed 7] [--out file.md] [--save file.json] [--load file.json]
 *
 * With --lines the messages in the file are played in order (one a line, or blocks split by a line of ---) and the
 * whole game is written to --out; without it you type. Typed commands: /sheet, /scene, /spend <attribute>, /quit.
 *
 * The card file is { world, who, hero, card, messages: [{ you, name, text }] } (scripts/table-replay.ts reads the same).
 * Real cards are private: keep them, saves and transcripts in .artifacts (ignored), never in the repo.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import type { DecisionAnswer, DecisionQuestion } from "lumiverse-spindle-types";
import { ATTRIBUTES, sceneText, sheetText, spend, type Attribute, type Run } from "../src/engine/run.js";
import type { Message, Role } from "../src/game/ask.js";
import { begin, reportText, turn, type Card } from "../src/game/runturn.js";

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
const decide = async (_what: string, state: unknown, questions: Record<string, DecisionQuestion>, ms: number): Promise<Record<string, DecisionAnswer | undefined> | null> => {
  const s = Date.now();
  try {
    const r = await fetch(env.DECISION_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.DECISION_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.DECISION_MODEL, state, questions }), signal: AbortSignal.timeout(ms) });
    const j = (await r.json()) as { answers?: Record<string, DecisionAnswer> };
    tally("decision", s);
    return j.answers ?? null;
  } catch {
    return null;
  }
};
const deps = { ask, ...(env.DECISION_URL ? { decide } : {}), log: (m: string) => out(`_(${m})_`) };

interface Line { you: boolean; name: string; text: string }
const file = JSON.parse(readFileSync(arg("card")!, "utf8")) as { world: string; who: string; hero: string; card: string; messages?: Line[] };
const opens = file.messages?.[0] && !file.messages[0].you ? file.messages[0].text : undefined;
const card: Card = { world: file.world, who: file.who, name: file.hero, ...(opens ? { first: opens } : {}) };
const saveFile = arg("save");
const quote = (s: string): string => s.split("\n").map((l) => `> ${l}`).join("\n");
const block = (s: string): string => `\`\`\`\n${s}\n\`\`\``;

let run: Run;
const loadFile = arg("load");
if (loadFile && existsSync(loadFile)) {
  run = JSON.parse(readFileSync(loadFile, "utf8")) as Run;
  out(`# ${file.card}, played as ${run.sheet.name} (carried on from turn ${run.turn})\n`);
} else {
  const s = Date.now();
  run = await begin(deps, card, Number(arg("seed") ?? 7));
  out(`# ${file.card}, played as ${run.sheet.name}\n`);
  out(`_Set up in ${((Date.now() - s) / 1000).toFixed(0)} s._\n`);
  out(run.opening.length > 2200 ? `[…] ${run.opening.slice(-2200)}` : run.opening);
  out();
  if (saveFile) writeFileSync(saveFile, JSON.stringify(run));
}
out(block(`${sheetText(run)}\n\n${sceneText(run)}`));
out();

async function play(line: string): Promise<void> {
  out(`---\n\n**You:**\n\n${quote(line)}\n`);
  const s = Date.now();
  try {
    const t = await turn(deps, run, line);
    run = t.run;
    out(t.story);
    out();
    out(block(reportText(t.report) || "Nothing changed."));
    out(`_${((Date.now() - s) / 1000).toFixed(1)} s: judged in ${(t.report.ms.judge / 1000).toFixed(1)}${t.report.second ? `, second look ${t.report.second}` : ""}; told in ${(t.report.ms.tell / 1000).toFixed(1)}; read back in ${(t.report.ms.read / 1000).toFixed(1)}._\n`);
    if (saveFile) writeFileSync(saveFile, JSON.stringify(run));
  } catch (e) {
    out(`_(the turn could not be played: ${(e as Error).message})_\n`);
  }
}

const linesFile = arg("lines");
if (linesFile) {
  const text = readFileSync(linesFile, "utf8");
  const lines = (/^---\s*$/m.test(text) ? text.split(/^---\s*$/m) : text.split(/\r?\n/)).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  for (const line of lines) {
    await play(line);
    // Nobody is here to choose, so points go where the character is already strongest.
    while (run.sheet.points > 0) {
      const best = [...ATTRIBUTES].sort((a, b) => run.sheet.attributes[b] - run.sheet.attributes[a])[0]!;
      spend(run.sheet, best);
      out(`_(a point into ${best})_`);
    }
  }
} else {
  // Lines are taken as they come, so what is typed (or piped) while a turn is being played waits its turn.
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "\n> " });
  let open = true;
  rl.on("close", () => (open = false));
  rl.prompt();
  for await (const raw of rl) {
    const line = raw.trim();
    if (line === "/quit") break;
    if (line === "/sheet") console.log(sheetText(run));
    else if (line === "/scene") console.log(sceneText(run));
    else if (line.startsWith("/spend")) {
      const a = line.split(/\s+/)[1]?.toLowerCase() as Attribute;
      console.log(spend(run.sheet, a) ? `${a} is now ${run.sheet.attributes[a]}. ${run.sheet.points} left.` : `Nothing spent. You have ${run.sheet.points} point(s); attributes are ${ATTRIBUTES.join(", ")}.`);
      if (saveFile) writeFileSync(saveFile, JSON.stringify(run));
    } else if (line) await play(line);
    if (open) rl.prompt();
  }
  rl.close();
}

out(`---\n\n## The sheet at the end\n`);
out(block(`${sheetText(run)}\n\n${sceneText(run)}\n\nTurn ${run.turn}. ${Math.round(run.minutes / 60)} hours have passed. Brought down ${run.downs} time(s).`));
out(`\n_Model calls: ${Object.entries(calls).map(([k, v]) => `${k} ${v.n} (${(v.ms / v.n / 1000).toFixed(1)} s each)`).join(", ")}._`);
