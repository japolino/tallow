/**
 * A table for several (src/game/partyturn.ts) played in the terminal against the real models, on a card.
 *
 *   bun --env-file=.env.local scripts/run-party.ts --card .artifacts/replay/some.json --guest "Tom|A hedge knight with a notched sword and a debt." --lines file [--seed 7] [--out file.md] [--save file.json] [--rules '{"fall":"end"}']
 *
 * The card's own player character is the host's. Each --guest is another player's character: "name|page" (give it
 * more than once for more players). The lines file holds the rounds, split by a line of ---; in a round each line
 * begins with the character's name and a colon, and a character with no line that round does nothing:
 *
 *   Mira: I slip round the back while he talks.
 *   Tom: I keep the guard talking about his sword.
 *   ---
 *   Tom: I ask him what he is guarding.
 *
 * The card file is the one scripts/run-play.ts reads. Real cards are private: keep them and the transcripts in
 * .artifacts (ignored), never in the repo.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { DecisionAnswer, DecisionQuestion } from "lumiverse-spindle-types";
import { sheetText, type Run } from "../src/engine/run.js";
import { HOST, seatFirst, seatNamed, sit } from "../src/engine/seats.js";
import type { Message, Role } from "../src/game/ask.js";
import { join, round, type SeatLine } from "../src/game/partyturn.js";
import { begin, reportText, sceneOf, type Card } from "../src/game/runturn.js";

const env = process.env;
const args = (k: string): string[] => process.argv.flatMap((a, i) => (a === `--${k}` && process.argv[i + 1] ? [process.argv[i + 1]!] : []));
const arg = (k: string): string | undefined => args(k)[0];
const doc: string[] = [];
const outFile = arg("out");
const out = (s = ""): void => {
  doc.push(s);
  console.log(s);
  if (outFile) writeFileSync(outFile, doc.join("\n"));
};
const calls: Record<string, { n: number; ms: number }> = {};

async function complete(model: string, messages: Message[], job: string): Promise<string> {
  const s = Date.now();
  const r = await fetch(env.CHAT_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.CHAT_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages }), signal: AbortSignal.timeout(180_000) });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content ?? "";
  const c = (calls[job] ??= { n: 0, ms: 0 });
  c.n++;
  c.ms += Date.now() - s;
  if (!text) throw new Error(`no answer (${JSON.stringify(j).slice(0, 160)})`);
  return text;
}
const ask = (messages: Message[], role: Role): Promise<string> => complete(role === "reader" ? env.CHAT_MODEL_FAST! : env.CHAT_MODEL_STRONG!, messages, role);
const decide = async (_what: string, state: unknown, questions: Record<string, DecisionQuestion>, ms: number): Promise<Record<string, DecisionAnswer | undefined> | null> => {
  try {
    const r = await fetch(env.DECISION_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.DECISION_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.DECISION_MODEL, state, questions }), signal: AbortSignal.timeout(ms) });
    return ((await r.json()) as { answers?: Record<string, DecisionAnswer> }).answers ?? null;
  } catch {
    return null;
  }
};
const rules = arg("rules");
const deps = { ask, ...(env.DECISION_URL ? { decide } : {}), log: (m: string) => out(`_(${m})_`), ...(rules ? { rules: () => JSON.parse(rules) as unknown } : {}) };

const file = JSON.parse(readFileSync(arg("card")!, "utf8")) as { world: string; who: string; hero: string; card: string; messages?: { you: boolean; text: string }[] };
const opens = file.messages?.[0] && !file.messages[0].you ? file.messages[0].text : undefined;
const card: Card = { world: file.world, who: file.who, name: file.hero, ...(opens ? { first: opens } : {}) };
const block = (s: string): string => `\`\`\`\n${s}\n\`\`\``;
const quote = (s: string): string => s.split("\n").map((l) => `> ${l}`).join("\n");

/** Every character's sheet, each with how the people here feel about them. */
function sheets(r: Run): string {
  const chair = r.chair!;
  const all = r.seats!.map((s) => {
    sit(r, s.id);
    const feels = r.people.filter((p) => p.here && !p.dead).map((p) => `${p.name} ${p.feeling}`).join(", ");
    return `${sheetText(r)}${feels ? `\nHow those here feel about them: ${feels}.` : ""}${s.out ? "\nBrought down for good." : ""}`;
  });
  sit(r, chair);
  return all.join("\n\n");
}

let s = Date.now();
let run = await begin(deps, card, Number(arg("seed") ?? 7));
seatFirst(run, HOST, "the host");
out(`# ${file.card}: a table for several\n`);
out(`_Set up in ${((Date.now() - s) / 1000).toFixed(0)} s._\n`);
out(run.opening.length > 2200 ? `[…] ${run.opening.slice(-2200)}` : run.opening);
out();

// Each guest sits down, and their arrival is the first round.
const joined: string[] = [];
const arrivals: SeatLine[] = [];
for (const [i, g] of args("guest").entries()) {
  const [name = "", page = ""] = g.split("|");
  s = Date.now();
  const seat = await join(deps, run, { id: `p${i + 2}`, player: `player ${i + 2}`, name: name.trim(), page: page.trim() });
  out(`_${seat.sheet.name} sat down (sheet written in ${((Date.now() - s) / 1000).toFixed(0)} s)._\n`);
  joined.push(seat.id);
  arrivals.push({ seat: seat.id, line: "(sits down)" });
}
out(block(`${sheets(run)}\n\n${sceneOf(deps, run)}`));
out();

async function play(lines: SeatLine[], who: string[], said: string): Promise<void> {
  out(`---\n\n${said}\n`);
  s = Date.now();
  try {
    const t = await round(deps, run, lines, who);
    run = t.run;
    out(t.story || "_(Nothing was told this round.)_");
    out();
    for (const p of t.parts) {
      const report = p.how === "answered" ? p.reply ?? "" : [p.report ? reportText({ ...p.report, changes: [] }) : p.how === "joined" ? "Sat down." : "Wrote nothing.", ...p.changes].filter(Boolean).join("\n");
      out(`**${p.name}**\n\n${block(report || "Nothing changed.")}`);
    }
    out(`_${((Date.now() - s) / 1000).toFixed(1)} s for the round._\n`);
    const saveFile = arg("save");
    if (saveFile) writeFileSync(saveFile, JSON.stringify(run));
  } catch (e) {
    out(`_(The round failed: ${(e as Error).message})_`);
  }
}

if (arrivals.length) await play(arrivals, joined, `_${arrivals.length === 1 ? "A new player sits down." : "New players sit down."}_`);

const text = arg("lines") ? readFileSync(arg("lines")!, "utf8") : "";
for (const chunk of text.split(/^\s*---\s*$/m).map((x) => x.trim()).filter(Boolean)) {
  const lines: SeatLine[] = [];
  const shown: string[] = [];
  for (const m of chunk.matchAll(/^([^:\n]{1,60}):[ \t]*([\s\S]*?)(?=^[^:\n]{1,60}:[ \t]|$(?![\s\S]))/gm)) {
    const seat = seatNamed(run, m[1]!.trim());
    if (!seat) {
      out(`_(Nobody at the table plays "${m[1]!.trim()}"; that line was skipped.)_`);
      continue;
    }
    lines.push({ seat: seat.id, line: m[2]!.trim() });
    shown.push(`**${seat.sheet.name}:**\n\n${quote(m[2]!.trim())}`);
  }
  if (lines.length) await play(lines, [], shown.join("\n\n"));
}

out(block(`${sheets(run)}\n\n${sceneOf(deps, run)}`));
out(`\n_Model calls: ${Object.entries(calls).map(([k, v]) => `${k} ${v.n} (${(v.ms / 1000).toFixed(0)} s)`).join(", ")}._`);
