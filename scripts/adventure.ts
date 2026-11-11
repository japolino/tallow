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
 *   ADV=gen:heist bun run adventure      a road laid out for a story (content/tropes.ts), a new one for every seed
 *   ADV=gen:all RUNS=300 bun run adventure   every story, 300 roads each, and how often each is won
 */
import { STOCK_CALLINGS } from "../src/engine/abilities.js";
import { ADVENTURES, COURIER } from "../src/content/adventures.js";
import { RECIPES, recipeOf } from "../src/content/tropes.js";
import { lootOf, type Adventure, type RoadStop, type Trip } from "../src/engine/adventure.js";
import { layRoad } from "../src/engine/road.js";
import { fallbackAdventure } from "../src/game/build.js";
import { cardKind } from "../src/engine/cards.js";
import { randomSeed } from "../src/engine/dice.js";
import { nameCheck, WAYS, type Check, type Stat, type Way } from "../src/engine/moment.js";
import { forkRead, FORK_AGAIN, LEVEL_AGAIN, pickRead } from "../src/engine/tell-adventure.js";
import { weigh, fairChance } from "../src/engine/weigh.js";
import { direct, type Director, type Table } from "../src/game/director.js";
import { standIns } from "../src/game/minds.js";

const ADV = process.env.ADV ?? "rescue";
const GEN = ADV.startsWith("gen:") ? ADV.slice(4) : null;
/** A made-up card, for roads laid out from a story. */
const CARD = { name: "Maren Vell", description: "Maren Vell is a lamplighter in a river town, thirty-one, quick-tongued and stubborn." };
const advFor = (seed: string, recipe = GEN): Adventure => {
  if (!recipe) return ADVENTURES[ADV]!;
  const r = recipeOf(recipe);
  if (!r) throw new Error(`No story "${recipe}". There are: ${RECIPES.map((x) => x.id).join(", ")}`);
  return fallbackAdventure(layRoad(r, seed), CARD, seed);
};
if (!GEN && !ADVENTURES[ADV]) throw new Error(`No adventure "${ADV}". There are: ${Object.keys(ADVENTURES).join(", ")}, or gen:<story>`);
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

const EFFECT_WORTH = { none: 0, limited: 0.6, standard: 1, great: 1.3, overwhelming: 1.6 } as const;
/** A try's worth to the simple player: its chance, weighed by what it can do. */
const worth = (c: Check): number => fairChance(c) * EFFECT_WORTH[c.effect ?? "standard"];

/** How the simple player words a try by each way, leaning on each strength: a person plays to what they are good at. */
const PHRASE: Record<Way, Partial<Record<Stat, string>>> = {
  talk: { charm: PLAIN.talk, guile: "I bluff my way past them", wits: "I reason with them", brawn: "I threaten them until they let me by" },
  sneak: { grace: PLAIN.sneak, guile: "I blend in and walk past", sense: "I wait for the moment they look away and go", wits: "I look for a way round" },
  force: { brawn: PLAIN.force, grace: "I dodge and dart through nimbly" },
  pay: { wits: PLAIN.pay, charm: "I sweeten the deal with a little extra" },
};

/** The simple player's line at a stop: the way and strength with the best chance, using a thing there if there is one. */
function lineFor(d: Director): string {
  const f = d.trip.facing!;
  const m = f.moment;
  let best: { c: Check; words?: string } | null = null;
  for (const way of WAYS) {
    const levers = m.stop.levers.filter((l) => l.way === way && !m.spent.includes(l.id));
    for (const stat of Object.keys(PHRASE[way]) as Stat[]) {
      for (const l of [undefined, ...levers]) {
        const c = nameCheck(m, { way, stat, lever: l?.id ?? null });
        if (!c || c.effect === "none" || c.stat !== stat) continue;
        if (!best || worth(c) > worth(best.c)) best = { c, words: l?.words?.[0] };
      }
    }
  }
  if (!best) return "I wait";
  const said = PHRASE[best.c.way][best.c.stat] ?? PLAIN[best.c.way];
  return best.words ? `${said}, using the ${best.words}` : said;
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
    async margin(notes) {
      out("[In the margin of your notebook, in pencil:]");
      for (const n of notes) out(wrap(n, "    "));
      out("");
    },
    async ink(place) {
      out(`[The narrator dips a pen and inks ${place} onto the map.]`);
    },
    notch(hours) {
      if (hours.length) out(`[Notches in the burning candle at ${hours.map((h) => `${String(Math.floor(h % 24)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`).join(", ")}.]`);
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
      out(`[The narrator takes back the card of ${lootOf(d().trip.adv, id)?.name ?? id}.]\n`);
    },
    async rival(n, max) {
      if (n) out(`[A dark seal goes on the rival's card: ${n} of ${max}.]\n`);
    },
    async move() {},
  };
}

async function once(adv: Adventure, seed: string): Promise<Trip> {
  let d!: Director;
  d = direct(adv, COURIER, seed, textTable(() => d), standIns(0), { abilities: STOCK_CALLINGS.courier!.hand });
  return d.done;
}

async function many(recipe: string | null, runs: number): Promise<void> {
  const ends: Record<string, number> = {};
  let hours = 0, health = 0, title = "";
  for (let i = 0; i < runs; i++) {
    const adv = advFor(`run-${i}`, recipe);
    title = recipe ?? adv.title;
    const t = await once(adv, `run-${i}`);
    ends[t.over ?? "none"] = (ends[t.over ?? "none"] ?? 0) + 1;
    hours += t.sheet.hour - adv.startHour;
    health += t.sheet.health;
  }
  console.log(`${title.padEnd(14)} fork ${process.env.FORK ?? "left"}, ${runs} runs:`, Object.entries(ends).sort().map(([k, n]) => `${k} ${Math.round((n / runs) * 100)}%`).join(", "), `| ${(hours / runs).toFixed(1)}h taken, health ${(health / runs).toFixed(1)}`);
}

if (quiet) {
  const runs = Number(process.env.RUNS);
  if (GEN === "all") for (const r of RECIPES) await many(r.id, runs);
  else await many(GEN, runs);
} else {
  const seed = process.env.SEED ?? randomSeed();
  const adv = advFor(seed, GEN === "all" ? RECIPES[0]!.id : GEN);
  out(`=== ${adv.title} (seed ${seed}) ===\n`);
  await once(adv, seed);
}
