/**
 * Asks the real models for the music of a sitting already played, passage by passage, and prints what they chose
 * (src/game/music.ts): to see that the choice follows the scene before it is heard in the room.
 *
 *   bun --env-file=.env.local scripts/run-music.ts --load .artifacts/run/game.json [--out file.md]
 *   bun --env-file=.env.local scripts/run-music.ts --world "A rusted orbital station..." --passages file.txt
 *
 * A saved run keeps only where it ended, so the scene is read from each passage alone. `--passages` is a text file of
 * passages separated by blank lines, for a world there is no sitting of.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { newRun, type Run } from "../src/engine/run.js";
import { pieceCalled } from "../src/engine/music.js";
import { pickMusic, type Playing } from "../src/game/music.js";
import type { Message, Role } from "../src/game/ask.js";

const env = process.env;
if (!env.CHAT_URL || !env.CHAT_MODEL_FAST) {
  console.error("Needs CHAT_URL, CHAT_API_KEY and CHAT_MODEL_FAST (run with --env-file=.env.local).");
  process.exit(1);
}
const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const doc: string[] = [];
const out = (s = ""): void => {
  doc.push(s);
  console.log(s);
  const f = arg("out");
  if (f) writeFileSync(f, doc.join("\n"));
};
let calls = 0, ms = 0;
const ask = async (messages: Message[], _role: Role): Promise<string> => {
  const s = Date.now();
  const r = await fetch(env.CHAT_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.CHAT_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.CHAT_MODEL_FAST, messages }), signal: AbortSignal.timeout(90_000) });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  calls++;
  ms += Date.now() - s;
  const text = j.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("no answer");
  return text;
};

let run: Run;
let passages: string[];
const load = arg("load");
if (load) {
  run = JSON.parse(readFileSync(load, "utf8")) as Run;
  passages = [run.opening, ...run.beats.map((b) => `${run.sheet.name}: ${b.you}\n\n${b.story}`)];
} else {
  run = newRun(1, arg("world") ?? "", "", "the player's character");
  passages = readFileSync(arg("passages")!, "utf8").split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);
}

out(`# The music, passage by passage`);
out(`World: ${run.world.replace(/\s+/g, " ").slice(0, 200)}`);
let playing: Playing | null = null;
const heard: string[] = [];
for (const [i, passage] of passages.entries()) {
  out();
  out(`**${i === 0 ? "Opening" : `Passage ${i}`}:** ${passage.replace(/\s+/g, " ").slice(0, 260)}…`);
  const got = await pickMusic({ ask, log: (m) => out(`_(${m})_`) }, run, passage, playing, heard.slice(-10), "PLACE: read it from the passage.");
  if (!got) {
    if (playing) playing.turns++;
    out(`- plays on: ${playing ? `"${playing.title}"` : "nothing"}`);
    continue;
  }
  playing = { title: got.pieces[0]!.title, turns: 0 };
  heard.push(...got.pieces.slice(0, 2).map((p) => p.title));
  out(`- scene: ${got.scene}`);
  out(`- wanted: ${[got.want.feels.join(", "), got.want.genres.join(", "), got.want.instruments.join(", "), got.want.pace, got.want.words].filter(Boolean).join(" | ")}`);
  out(`- ${got.picked ? "picked" : "nearest (no pick)"}: ${got.pieces.map((p) => `"${p.title}" (${pieceCalled(p.title)!.genre}; ${p.feels.join(", ")}; ${p.instruments})`).join("  •  ")}`);
}
out();
out(`${calls} asks, ${Math.round(ms / Math.max(1, calls))} ms each.`);
