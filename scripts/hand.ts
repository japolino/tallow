/**
 * The balance of a story played with a hand of dice (src/engine/hand.ts), by simulation: many stories of the stock
 * scenes, each played by a simple player, and how often each kind of player wins.
 *
 *   bun run scripts/hand.ts            2000 stories for each kind of player
 *   RUNS=10000 bun run scripts/hand.ts
 *
 * The players differ only in what they risk and which die they spend; none of them reads a word. The numbers this
 * tunes are the ones at the top of hand.ts: the clocks, the gains, the costs, the hours a story has.
 */
import { STOCK_SCENES } from "../src/content/scenes.js";
import { startTrip, type Trip } from "../src/engine/adventure.js";
import { seededRng, type Rng } from "../src/engine/dice.js";
import { comesTo, enterScene, GRIP_MAX, leaveScene, outOfTime, price, restHand, RISKS, sceneAdventure, spend, startHand, thingsNow, trades, TRADE_PRICE, worthRest, type Band, type Priced, type Risk, type TradeKind } from "../src/engine/hand.js";
import { START } from "../src/engine/hero.js";
import type { Sheet, Stat } from "../src/engine/moment.js";

type Kind = "careful" | "plain" | "meek" | "reckless" | "timid" | "blind";
const KINDS: Kind[] = ["careful", "plain", "meek", "reckless", "timid", "blind"];

const SPREAD: Sheet = { stats: { brawn: 1, grace: 2, charm: 3, guile: 2, wits: 1, sense: 1 }, ...START, hour: 0 };
const STATS: Stat[] = ["brawn", "grace", "charm", "guile", "wits", "sense"];

/** What a band is worth to a player weighing it: steps gained against steps closed and what is lost. */
const worth = (p: Priced, band: Band, grip: number): number => {
  const e = comesTo(p.risk, band);
  const closing = (grip + Math.max(0, e.grip) >= GRIP_MAX ? 8 : 0) + e.grip * (2 + grip * 0.5);
  return e.gain * 3 - closing - e.cost * 2;
};

interface Choice {
  p: Priced;
  die: number;
  trade: TradeKind | null;
  score: number;
}

/** The stat a player leans on: mostly what they are good at, sometimes what the scene asks for. */
const leans = (t: Trip, rng: Rng): Stat => {
  const sorted = [...STATS].sort((a, b) => (t.sheet.stats[b] ?? 0) - (t.sheet.stats[a] ?? 0));
  const r = rng();
  return r < 0.45 ? sorted[0]! : r < 0.75 ? sorted[1]! : sorted[2 + Math.floor(rng() * 4)]!;
};

function choose(t: Trip, kind: Kind, rng: Rng): Choice | null {
  const h = t.hand!;
  const stat = leans(t, rng);
  const thing = thingsNow(t)[0]?.id ?? null;
  // A line uses what is there about half the time.
  const uses = rng() < 0.5 ? thing : null;
  // "meek" is a plain player whose reader calls most lines a slight risk: six in ten slight, three real, one grave.
  const meek = (): Risk => { const r = rng(); return r < 0.6 ? "slight" : r < 0.9 ? "real" : "grave"; };
  const risks: Risk[] = kind === "reckless" ? ["grave"] : kind === "timid" ? ["slight"] : kind === "careful" ? [...RISKS] : kind === "meek" ? [meek()] : [RISKS[Math.floor(rng() * 3)]!];
  const options: Choice[] = [];
  for (const risk of risks)
    for (const aim of kind === "careful" && h.grip >= 2 ? (["through", "loose"] as const) : (["through"] as const)) {
      const p = price(t, { attempt: "a try", stat, risk, stake: "health", threat: "it goes wrong", aim, thing: uses });
      if (!p) continue;
      h.dice.forEach((_, die) => {
        options.push({ p, die, trade: null, score: worth(p, p.bands[die]!, h.grip) + (aim === "loose" ? -1 : 0) });
        if (kind === "careful" || kind === "plain" || kind === "meek")
          for (const trade of trades(t, p, die)) {
            const lifted = price({ ...t, sheet: { ...t.sheet, stats: { ...t.sheet.stats, [stat]: (t.sheet.stats[stat] ?? 0) + 3 } } }, p);
            if (lifted) options.push({ p, die, trade, score: worth(p, lifted.bands[die]!, h.grip) - TRADE_PRICE[trade] * (trade === "health" ? 2.2 : 0.9) });
          }
      });
    }
  if (!options.length) return null;
  // A blind player spends the dice as they lie; the others look at what each would come to.
  if (kind === "blind") return options.find((o) => o.die === 0 && !o.trade) ?? options[0]!;
  return options.sort((a, b) => b.score - a.score)[0]!;
}

interface Tally {
  won: number;
  taken: number;
  deadline: number;
  tries: number;
  health: number;
  scenesTaken: number;
  rests: number;
}

function play(seed: string, kind: Kind): { trip: Trip; tries: number; scenesTaken: number; rests: number } {
  const rng = seededRng(`${seed}:player`);
  let t = startHand(startTrip(sceneAdventure(STOCK_SCENES, { seed, who: "a courier" }), SPREAD, seed));
  let tries = 0;
  let scenesTaken = 0;
  let rests = 0;
  while (!t.over) {
    if (!t.hand!.opened) {
      // A careful player rests when hurt badly or holding a poor hand with time to spare.
      const spare = t.adv.deadline.hour - t.sheet.hour;
      const poor = t.hand!.dice.every((d) => d < 8);
      if (worthRest(t) && spare > 7 && (kind === "careful" || kind === "plain" || kind === "meek") && (t.sheet.health <= 2 || (kind === "careful" && poor))) {
        t = restHand(t)!.trip;
        rests++;
        continue;
      }
      const e = enterScene(t);
      if (!e) break;
      t = e.trip;
      continue;
    }
    if (outOfTime(t)) {
      t = { ...t, over: "deadline" };
      break;
    }
    const c = choose(t, kind, rng);
    if (!c) break;
    const s = spend(t, c.p, c.die, c.trade)!;
    tries++;
    t = s.trip;
    if (s.scene !== "on") {
      if (s.scene === "taken") scenesTaken++;
      t = leaveScene(t, s.scene)!.trip;
    }
  }
  return { trip: t, tries, scenesTaken, rests };
}

const runs = Number(process.env.RUNS ?? 2000);
console.log(`${runs} stories of "${STOCK_SCENES.title}" for each kind of player\n`);
console.log("player     won   taken  late   tries  health  scenes lost  rests");
for (const kind of KINDS) {
  const tally: Tally = { won: 0, taken: 0, deadline: 0, tries: 0, health: 0, scenesTaken: 0, rests: 0 };
  for (let i = 0; i < runs; i++) {
    const r = play(`sim-${i}`, kind);
    if (r.trip.over === "won") tally.won++;
    else if (r.trip.over === "taken") tally.taken++;
    else tally.deadline++;
    tally.tries += r.tries;
    tally.health += r.trip.sheet.health;
    tally.scenesTaken += r.scenesTaken;
    tally.rests += r.rests;
  }
  const pct = (n: number): string => `${Math.round((100 * n) / runs)}%`.padStart(5);
  const avg = (n: number): string => (n / runs).toFixed(1).padStart(6);
  console.log(`${kind.padEnd(9)} ${pct(tally.won)} ${pct(tally.taken)} ${pct(tally.deadline)}  ${avg(tally.tries)}  ${avg(tally.health)}  ${avg(tally.scenesTaken)}       ${avg(tally.rests)}`);
}
