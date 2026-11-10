/**
 * Plays a whole adventure as text, printing only what the table would say and show, so it can be read the way a new
 * player would read it (docs/DESIGN.md, 9, milestone 3). The game is the same one the room plays: the same director,
 * rules and words, with a table that prints instead of drawing.
 *
 * A simple player writes the lines: at each stop it goes the way with the best chance, using whatever is there to
 * use, and words it the way a person might. It rests when it is badly hurt.
 *
 *   bun run adventure                    the rescue, with a random seed
 *   ADV=courtship bun run adventure      the courtship
 *   SEED=moss FORK=right bun run adventure
 *   RUNS=500 bun run adventure           play it 500 times with no printing, and say how often it is won and why it is lost
 */
import { ADVENTURES, COURIER } from "../src/content/adventures.js";
import { lootOf, type RoadStop, type Trip } from "../src/engine/adventure.js";
import { cardKind } from "../src/engine/cards.js";
import { randomSeed } from "../src/engine/dice.js";
import { nameCheck, WAYS, type Check, type Way } from "../src/engine/moment.js";
import { forkRead, FORK_AGAIN, LEVEL_AGAIN, pickRead } from "../src/engine/tell-adventure.js";
import { weigh, fairChance } from "../src/engine/weigh.js";
import { direct, type Director, type Table } from "../src/game/director.js";
import { standIns } from "../src/game/minds.js";

const adv = ADVENTURES[process.env.ADV ?? "rescue"];
if (!adv) throw new Error(`No adventure "${process.env.ADV}". There are: ${Object.keys(ADVENTURES).join(", ")}`);
const quiet = !!process.env.RUNS;
const out = (s: string): void => {
  if (!quiet) console.log(s);
};
const wrap = (s: string, pad = ""): string => {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > 96) {
      lines.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines.map((l) => pad + l).join("\n");
};

const PLAIN: Record<Way, string> = {
  talk: "I ask them kindly to let me by",
  sneak: "I creep past quietly",
  force: "I shove my way through",
  pay: "I pay what they ask",
};

/** The simple player's line at a stop: the way with the best chance, using a thing there if there is one. */
function lineFor(d: Director): string {
  const f = d.trip.facing!;
  const m = f.moment;
  let best: { c: Check; words?: string } | null = null;
  for (const way of WAYS) {
    const levers = m.stop.levers.filter((l) => l.way === way && !m.spent.includes(l.id));
    for (const l of [undefined, ...levers]) {
      const c = nameCheck(m, { way, lever: l?.id ?? null });
      if (c && (!best || fairChance(c) > fairChance(best.c))) best = { c, words: l?.words?.[0] };
    }
  }
  if (!best) return "I wait";
  return best.words ? `${PLAIN[best.c.way]}, using the ${best.words}` : PLAIN[best.c.way];
}

function textTable(d: () => Director): Table {
  return {
    async say(lines) {
      for (const l of lines) out(wrap(l, "NARRATOR  ").replace(/\n(?!NARRATOR)/g, "\n          "));
      out("");
    },
    async write() {
      const dir = d();
      let line: string;
      if (dir.stage === "camp") line = dir.trip.sheet.health <= 2 ? "I rest and eat something" : "I press on";
      else line = lineFor(dir);
      out(`YOU WRITE "${line}"`);
      out("[You tear off the page and hand it across.]\n");
      return { line, given: Promise.resolve() };
    },
    async page(w) {
      out("[You are handed a page:]");
      if (w.heading) out(wrap(w.heading.toUpperCase(), "    "));
      for (const p of w.his) out(wrap(p, "    "));
      out("[You set it down on the pile.]\n");
    },
    async aside() {
      out("[The narrator pushes the page aside.]\n");
    },
    async wait(beat, work) {
      if (beat === "read") out("[The narrator holds your page to the candle and reads it.]\n");
      if (beat === "deal") out("[The narrator shuffles the cards.]\n");
      return work;
    },
    async weigh(check) {
      if (!check) return;
      const w = weigh(check);
      out(`[The balance: ${w.his} dark weights in the narrator's pan, ${w.yours} pale ${w.yours === 1 ? "one" : "ones"} in yours${w.lever ? " and a brass one" : ""}. It leans ${w.lean > 0.05 ? "your way" : w.lean < -0.05 ? "its way" : "about level"}.]\n`);
    },
    async dieOrLine() {
      out("[You take a die from the box.]");
      return null;
    },
    async throwDie(n) {
      out(`[The die rolls and shows ${n}.]\n`);
    },
    async carry(before, after) {
      if (!before) {
        out(`[On the table before you: ${after.health} red stones (health), ${after.supplies} coins (supplies), ${after.goodwill} pale seals (goodwill).]\n`);
        return;
      }
      const ch = (["health", "supplies", "goodwill"] as const).filter((k) => before[k] !== after[k]).map((k) => `${k} ${before[k]} → ${after[k]}`);
      if (ch.length) out(`[Counters: ${ch.join(", ")}.]\n`);
    },
    clock() {},
    async deal(stops) {
      out(`[The narrator deals ${stops.length} cards face down along the map.]\n`);
    },
    async turn(stop) {
      out(`[It turns over the card at ${stop.name}: ${cardKind(stop.card).title}.]\n`);
    },
    async clear(stop) {
      out(`[It takes the card at ${stop.name} off the map.]\n`);
    },
    async fork(stops: RoadStop[]) {
      const want = process.env.FORK ?? "left";
      for (let i = 0; i < 3; i++) {
        const line = i === 0 ? `I take the one on the ${want}` : "the left one";
        out(`YOU WRITE "${line}"\n`);
        const id = forkRead(line, stops);
        if (id) return id;
        out(`NARRATOR  ${FORK_AGAIN}\n`);
      }
      return stops[0]!.id;
    },
    async offer(cards) {
      out(`[Two cards are dealt face up: ${cards.map((c) => `${cardKind(c.card).title}, "${c.name}"`).join(", and ")}.]
`);
      for (let i = 0; i < 3; i++) {
        const line = i === 0 ? "I keep the one on the right" : "the left one";
        out(`YOU WRITE "${line}"
`);
        const n = pickRead(line, cards.map((c) => c.name));
        if (n >= 0) return n;
        out(`NARRATOR  ${LEVEL_AGAIN}
`);
      }
      return 0;
    },
    async give(card) {
      out(`[A card is dealt to your side, face up: ${cardKind(card.card).title}, "${card.name}".]\n`);
    },
    async take(id) {
      out(`[The narrator takes back the card of ${lootOf(adv!, id)?.name ?? id}.]\n`);
    },
    async rival(n, max) {
      if (n) out(`[A dark seal goes on the rival's card: ${n} of ${max}.]\n`);
    },
    async move() {},
  };
}

async function once(seed: string): Promise<Trip> {
  let d!: Director;
  d = direct(adv!, COURIER, seed, textTable(() => d), standIns(0), { perks: ["light"] });
  return d.done;
}

if (quiet) {
  const runs = Number(process.env.RUNS);
  const ends: Record<string, number> = {};
  let hours = 0, health = 0;
  for (let i = 0; i < runs; i++) {
    const t = await once(`run-${i}`);
    ends[t.over ?? "none"] = (ends[t.over ?? "none"] ?? 0) + 1;
    hours += t.sheet.hour;
    health += t.sheet.health;
  }
  console.log(`${adv.title}, fork ${process.env.FORK ?? "left"}, ${runs} runs:`, Object.entries(ends).map(([k, n]) => `${k} ${Math.round((n / runs) * 100)}%`).join(", "), `| ends at ${(hours / runs).toFixed(1)}h, health ${(health / runs).toFixed(1)}`);
} else {
  const seed = process.env.SEED ?? randomSeed();
  out(`=== ${adv.title} (seed ${seed}) ===\n`);
  await once(seed);
}
