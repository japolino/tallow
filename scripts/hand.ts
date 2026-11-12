/**
 * The balance of a story played with a hand of dice (src/engine/hand.ts), by simulation: many stories of the stock
 * scenes, each played by a simple player, and how often each kind of player wins.
 *
 *   bun run scripts/hand.ts            2000 stories for each kind of player
 *   RUNS=10000 bun run scripts/hand.ts
 *
 * The players differ only in what they risk and which die they spend; none of them reads a word. The numbers this
 * tunes are the ones at the top of hand.ts: the clocks, the gains, the costs, the hours a story has.
 *
 * Three more play as the plain player does, but for one thing (engine/lasting.ts): an "asker" spends the first try of
 * every scene asking someone to come along (a large ask) until they do, a "dreamer" asks a huge thing (a villain
 * turned to their side) the same way, and a "walker" walks away from any scene but the last once it has nearly closed
 * on them. Their second table says what the asks won and cost.
 */
import { STOCK_SCENES } from "../src/content/scenes.js";
import { startTrip, type Trip } from "../src/engine/adventure.js";
import { seededRng, type Rng } from "../src/engine/dice.js";
import { comesTo, enterScene, GRIP_MAX, leaveScene, outOfTime, price, restHand, RISKS, sceneAdventure, spend, startHand, thingsNow, trades, TRADE_PRICE, worthRest, type Band, type Priced, type Risk, type TradeKind } from "../src/engine/hand.js";
import { START } from "../src/engine/hero.js";
import { companyNow, enterDue, lastingOf, priceTry, spendTry, standingOf, walkAway, type AskSize } from "../src/engine/lasting.js";
import type { Sheet, Stat } from "../src/engine/moment.js";

type Kind = "careful" | "plain" | "meek" | "reckless" | "timid" | "blind" | "asker" | "dreamer" | "walker";
const KINDS: Kind[] = ["careful", "plain", "meek", "reckless", "timid", "blind", "asker", "dreamer", "walker"];
/** The players who ask for something of their own, and how big it is. */
const ASKS: Partial<Record<Kind, AskSize>> = { asker: "large", dreamer: "huge" };
/** Who plays as the plain player does, when not asking or walking. */
const plainish = (k: Kind): Kind => (k === "asker" || k === "dreamer" || k === "walker" ? "plain" : k);

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

function choose(t: Trip, k: Kind, rng: Rng): Choice | null {
  const kind = plainish(k);
  const h = t.hand!;
  const stat = leans(t, rng);
  // Someone who goes with you is leaned on first, when there is someone.
  const things = thingsNow(t);
  const thing = (things.find((x) => x.id.startsWith("with:")) ?? things[0])?.id ?? null;
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

/** An ask for someone to come along (or be turned), at the given size, spending the best die on it. */
function asking(t: Trip, size: AskSize): Choice | null {
  // Asked again, it goes on with the ask under way, as the reader's answer is joined to it (lasting.ts, checkOwn).
  const under = lastingOf(t.hand).asks.find((a) => a.who === "Orla")?.id;
  const own = { kind: size === "huge" ? ("side" as const) : ("join" as const), who: "Orla", change: "Orla comes with you.", lesser: "Orla comes as far as the next landing.", size, catch: "Someone will come looking for her.", against: "Orla turns away.", costs: "goodwill" as const, ...(under ? { ask: under } : {}) };
  const p = priceTry(t, { attempt: "ask Orla", stat: "charm", risk: "real", stake: "goodwill", threat: "she refuses", aim: "own", thing: null, own });
  if (!p) return null;
  const dice = t.hand!.dice;
  return { p, die: dice.indexOf(Math.max(...dice)), trade: null, score: 0 };
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

interface Played {
  trip: Trip;
  tries: number;
  scenesTaken: number;
  rests: number;
  asks: number;
  won: boolean;
  lesser: number;
  walked: number;
}

function play(seed: string, kind: Kind): Played {
  const rng = seededRng(`${seed}:player`);
  let t = startHand(startTrip(sceneAdventure(STOCK_SCENES, { seed, who: "a courier" }), SPREAD, seed));
  let tries = 0;
  let scenesTaken = 0;
  let rests = 0;
  let asks = 0;
  let lesser = 0;
  let walked = 0;
  let won = false;
  let askedIn = -1;
  const size = ASKS[kind];
  while (!t.over) {
    if (!t.hand!.opened) {
      // A careful player rests when hurt badly or holding a poor hand with time to spare.
      const spare = t.adv.deadline.hour - t.sheet.hour;
      const poor = t.hand!.dice.every((d) => d < 8);
      const k = plainish(kind);
      if (worthRest(t) && spare > 7 && (k === "careful" || k === "plain" || k === "meek") && (t.sheet.health <= 2 || (k === "careful" && poor))) {
        t = restHand(t)!.trip;
        rests++;
        continue;
      }
      // What tries won comes due as a scene opens (engine/lasting.ts); with nothing won, this is enterScene.
      const e = enterDue(t);
      if (!e) break;
      t = e.trip;
      continue;
    }
    if (outOfTime(t)) {
      t = { ...t, over: "deadline" };
      break;
    }
    const h = t.hand!;
    if (kind === "walker" && h.grip >= GRIP_MAX - 1 && h.scene < (t.adv.scenes?.scenes.length ?? 0) - 1) {
      t = walkAway(t)!.trip;
      walked++;
      continue;
    }
    const asks1 = !!size && !won && askedIn !== h.scene;
    const c = asks1 ? asking(t, size!) : choose(t, kind, rng);
    if (!c) break;
    const s = spendTry(t, c.p, c.die, c.trade)!;
    tries++;
    t = s.trip;
    if (asks1) {
      asks++;
      askedIn = h.scene;
      if (s.own?.won) {
        won = true;
        if (s.own.won.form !== "full") lesser++;
      }
    }
    if (s.scene !== "on") {
      if (s.scene === "taken") scenesTaken++;
      t = leaveScene(t, s.scene)!.trip;
    }
  }
  return { trip: t, tries, scenesTaken, rests, asks, won, lesser, walked };
}

const runs = Number(process.env.RUNS ?? 2000);
console.log(`${runs} stories of "${STOCK_SCENES.title}" for each kind of player\n`);
console.log("player     won   taken  late   tries  health  scenes lost  rests");
const lasting: string[] = [];
for (const kind of KINDS) {
  const tally: Tally = { won: 0, taken: 0, deadline: 0, tries: 0, health: 0, scenesTaken: 0, rests: 0 };
  const more = { asks: 0, got: 0, lesser: 0, still: 0, standing: 0, walked: 0, sour: 0 };
  for (let i = 0; i < runs; i++) {
    const r = play(`sim-${i}`, kind);
    more.asks += r.asks;
    more.got += r.won ? 1 : 0;
    more.lesser += r.lesser;
    more.still += companyNow(r.trip).length ? 1 : 0;
    more.standing += standingOf(r.trip, "Orla");
    more.walked += r.walked;
    more.sour += lastingOf(r.trip.hand).changes.some((c) => c.kind === "sour") ? 1 : 0;
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
  if (ASKS[kind] || kind === "walker")
    lasting.push(`${kind.padEnd(9)} ${avg(more.asks)} ${pct(more.got)} ${pct(more.lesser)}      ${pct(more.still)}    ${avg(more.standing)}       ${pct(more.sour)}   ${avg(more.walked)}`);
}
console.log("\nplayer      asks   got lesser  with at end  standing  set against  walked");
for (const l of lasting) console.log(l);
