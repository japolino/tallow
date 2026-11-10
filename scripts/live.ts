/**
 * Plays a sitting for a character card one step at a time, with the model and the player answered from outside: by a
 * person, or by another model standing in for Lumiverse's own. Each run replays every answer given so far (the game is
 * seeded, so it plays out the same way), prints what is new at the table, and stops at the first thing waiting for an
 * answer: a request to the model (with its full prompt), or the player's turn to write.
 *
 *   bun scripts/live.ts --card card.json --state dir next            what is waiting now
 *   bun scripts/live.ts --card card.json --state dir answer file.txt  answer it with the text in a file, then go on
 *
 * The card file is { name, description, personality?, scenario?, firstMessage? }. Keep real cards out of the repo.
 * The state folder holds the answers so far, the whole transcript, and the adventure as it was built.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lootOf, type Adventure } from "../src/engine/adventure.js";
import { cardKind } from "../src/engine/cards.js";
import { forkRead, FORK_AGAIN, LEVEL_AGAIN, pickRead } from "../src/engine/tell-adventure.js";
import { weigh } from "../src/engine/weigh.js";
import type { CardInfo } from "../src/game/card.js";
import type { Director, Table } from "../src/game/director.js";
import { modelMinds } from "../src/game/modelminds.js";
import type { Message, Role } from "../src/game/prompts.js";
import { sit } from "../src/game/session.js";

const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const cardPath = arg("card"), stateDir = arg("state");
if (!cardPath || !stateDir) throw new Error("Usage: bun scripts/live.ts --card card.json --state dir next|answer file");
const cmd = process.argv.includes("answer") ? "answer" : "next";
mkdirSync(stateDir, { recursive: true });

interface Answer {
  kind: "model" | "player";
  text: string;
}
interface State {
  seed: string;
  answers: Answer[];
  /** How many transcript lines have been printed already. */
  shown: number;
}
const statePath = join(stateDir, "state.json");
const state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { seed: arg("seed") ?? `live-${Date.now().toString(36)}`, answers: [], shown: 0 };
const card = JSON.parse(readFileSync(cardPath, "utf8")) as CardInfo;

/** What is waiting for an answer, in the order it was asked. */
type Waiting = { kind: "model"; role: Role; messages: Message[] } | { kind: "player"; why: string };
const asked: Waiting[] = [];
let used = 0;
const log: string[] = [];
const out = (s: string): void => void log.push(s);

if (cmd === "answer") {
  const file = process.argv[process.argv.indexOf("answer") + 1];
  if (!file) throw new Error("answer needs a file");
  const text = readFileSync(file, "utf8").trim();
  // Which kind is waiting is found by replaying; the answer is checked against it below.
  state.answers.push({ kind: "player", text, ...({ pending: true } as object) });
}

/** The next answer, if there is one for this kind of question; otherwise it waits (and the run stops there). */
function next<T>(w: Waiting, make: (text: string) => T): Promise<T> {
  asked.push(w);
  const a = state.answers[used];
  if (!a) return new Promise<T>(() => {});
  used++;
  // An answer given just now takes the kind of what was waiting.
  if ((a as { pending?: boolean }).pending) {
    delete (a as { pending?: boolean }).pending;
    a.kind = w.kind;
  }
  if (a.kind !== w.kind) throw new Error(`Answer ${used} was for the ${a.kind}, but the ${w.kind} is being asked.`);
  return Promise.resolve(make(a.text));
}

const ask = (messages: Message[], role: Role): Promise<string> => next({ kind: "model", role, messages }, (t) => t);
const write = (why: string): Promise<string> => next({ kind: "player", why }, (t) => t);

let director: Director | null = null;
const table: Table = {
  async say(lines) {
    for (const l of lines) out(`NARRATOR: ${l}`);
  },
  async write() {
    const line = await write(director?.stage ?? "intro");
    out(`YOU WRITE: "${line}"`);
    return { line, given: Promise.resolve() };
  },
  async page(w) {
    out(`[You are handed a page${w.heading ? `: ${w.heading}` : ""}]`);
    for (const p of w.his) out(`    ${p}`);
  },
  async aside() {},
  async wait(_beat, work) {
    return work;
  },
  async weigh(check) {
    if (!check) return;
    const w = weigh(check);
    out(`[The balance: ${w.his} dark weights against your ${w.yours} pale${w.lever ? " and a brass one" : ""}; it leans ${w.lean > 0.05 ? "your way" : w.lean < -0.05 ? "against you" : "level"}. (For a text player: about ${Math.round((check.odds.success + check.odds.partial) * 10)} throws in 10 get you past, ${Math.round(check.odds.partial * 10)} of them at a cost.)]`);
  },
  async dieOrLine() {
    out("[You take a die from the box.]");
    return null;
  },
  async throwDie(n) {
    out(`[The die shows ${n}.]`);
  },
  async carry(before, after) {
    if (!before) return void out(`[Before you: ${after.health} health, ${after.supplies} supplies, ${after.goodwill} goodwill.]`);
    const ch = (["health", "supplies", "goodwill"] as const).filter((k) => before[k] !== after[k]).map((k) => `${k} ${before[k]} -> ${after[k]}`);
    if (ch.length) out(`[Counters: ${ch.join(", ")}.]`);
  },
  clock() {},
  async deal(stops) {
    out(`[The narrator deals ${stops.length} cards face down along the map.]`);
  },
  async turn(stop) {
    out(`[The card at ${stop.name} is turned: ${cardKind(stop.card).title}.]`);
  },
  async clear(stop) {
    out(`[The card at ${stop.name} is taken off the map.]`);
  },
  async fork(stops) {
    for (;;) {
      const line = await write("fork");
      out(`YOU WRITE: "${line}"`);
      const id = forkRead(line, stops);
      if (id) return id;
      out(`NARRATOR: ${FORK_AGAIN}`);
    }
  },
  async offer(cards) {
    out(`[Two cards dealt face up: ${cards.map((c) => `"${c.name}" (${cardKind(c.card).title})`).join(" and ")}.]`);
    for (;;) {
      const line = await write("level-up");
      out(`YOU WRITE: "${line}"`);
      const i = pickRead(line, cards.map((c) => c.name));
      if (i >= 0) return i;
      out(`NARRATOR: ${LEVEL_AGAIN}`);
    }
  },
  async give(c) {
    out(`[A card is dealt to your side: ${cardKind(c.card).title}, "${c.name}" (${c.side}).]`);
  },
  async take(id) {
    out(`[The narrator takes back a card: ${built ? (lootOf(built, id)?.name ?? id) : id}.]`);
  },
  async rival(n, max) {
    if (n) out(`[A dark seal on the rival's card: ${n} of ${max}.]`);
  },
  async move() {},
};

let built: Adventure | null = null;
const fallbacks: string[] = [];
const minds = modelMinds(ask, {
  timeoutMs: 10 * 60_000,
  onFallback: (job, why) => {
    fallbacks.push(`${job}: ${why}`);
    out(`[NOTE FOR THE TESTER: the stand-in answered for the ${job} (${why}).]`);
  },
});

const finish = (over: boolean): void => {
  writeFileSync(join(stateDir, "transcript.txt"), log.join("\n"));
  if (built) writeFileSync(join(stateDir, "adventure.json"), JSON.stringify(built, null, 1));
  const fresh = log.slice(state.shown);
  state.shown = log.length;
  writeFileSync(statePath, JSON.stringify(state, null, 1));
  if (fresh.length) console.log(`=== NEW AT THE TABLE ===\n${fresh.join("\n")}\n`);
  if (over) {
    const t = director!.trip;
    console.log(`=== GAME OVER: ${t.over} at hour ${t.sheet.hour}, health ${t.sheet.health}, supplies ${t.sheet.supplies}, goodwill ${t.sheet.goodwill}. Stand-in answers: ${fallbacks.length}. ===`);
    return;
  }
  const w = asked[used];
  if (!w) return void console.log("=== Nothing is waiting, and the game is not over. (A bug: say so in your report.) ===");
  if (w.kind === "player") {
    console.log(`=== YOUR TURN AS THE PLAYER (${w.why}) ===\nWrite one line, as the player would, into a file, then: bun scripts/live.ts --card ${cardPath} --state ${stateDir} answer <file>`);
  } else {
    console.log(`=== MODEL REQUEST (${w.role}) ===\nAnswer exactly as the model would: follow the system prompt to the letter and give only the answer it asks for. Write it into a file, then: bun scripts/live.ts --card ${cardPath} --state ${stateDir} answer <file>\n`);
    for (const m of w.messages) console.log(`--- ${m.role.toUpperCase()} ---\n${m.content}\n`);
  }
};

const done = sit({
  card,
  seed: state.seed,
  table,
  minds,
  ask,
  built: (a) => {
    built = a;
    out(`[NOTE FOR THE TESTER: the adventure is built: "${a.title}".]`);
  },
  started: (d) => (director = d),
});
let over = false;
done.then(() => (over = true)).catch((e) => out(`[ERROR: ${e instanceof Error ? e.stack : e}]`));
// Everything that can run without an answer runs in a moment; then whatever is left is waiting.
setTimeout(() => {
  finish(over);
  process.exit(0);
}, 400);
