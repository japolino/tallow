/**
 * The battle balance sim (docs/COMBAT.md, 10, step 1): many seeded fights on plain mats, played by a side that reads
 * the board and by one that only ever says "I attack the nearest one", across difficulties and side sizes.
 *
 *   bun run battle                            # the table
 *   RUNS=400 bun run scripts/battle.ts        # more fights per cell
 *   SHOW=seed bun run scripts/battle.ts       # one fight, round by round, on the plain board
 */
import { boardText, piece, startBattle, theirTurn, yourTurn, type Battle, type BattleEvent } from "../src/engine/battle.js";
import { encounter, type Side } from "../src/engine/encounter.js";
import { plainOrder, readOrder } from "../src/engine/tactics.js";

const HERO: Side = { id: "hero", name: "Hero", hero: true, level: 1, armor: 1, weapon: "blade", stats: { brawn: 3, grace: 2, charm: 1, guile: 0, wits: 1, sense: 1 } };
const FELLOWS: Side[] = [
  { id: "kai", name: "Kai", level: 1, armor: 1, weapon: "heavy", stats: { brawn: 3, grace: 1, charm: 0, guile: 0, wits: 0, sense: 1 } },
  { id: "rue", name: "Rue", level: 1, armor: 0, weapon: "ranged", stats: { brawn: 0, grace: 3, charm: 1, guile: 2, wits: 1, sense: 2 } },
];
const CAP = 20;

type Player = (b: Battle, id: string) => ReturnType<typeof readOrder>;

/** One fight to its end: each piece of your side decides in turn, seeing what the one before it did. */
function fight(seed: string, difficulty: number, side: Side[], play: Player, show = false) {
  let { battle: b, events } = startBattle(encounter({ seed, difficulty, side }));
  if (show) tell(b, events);
  while (!b.over && b.round <= CAP) {
    const all: BattleEvent[] = [];
    for (const p of b.pieces.filter((x) => x.side === "you" && !x.down && !x.out && !x.fled)) {
      const r = yourTurn(b, [play(b, p.id)]);
      b = r.battle;
      all.push(...r.events);
      if (b.over) break;
    }
    if (!b.over) {
      const r = theirTurn(b);
      b = r.battle;
      all.push(...r.events);
    }
    if (show) tell(b, all);
  }
  const hero = piece(b, "hero")!;
  return { over: b.over ?? "stalled", rounds: b.round, wounds: b.wounds, heroDown: !!hero.down, staminaLeft: hero.stamina / hero.staminaMax };
}

function tell(b: Battle, events: BattleEvent[]) {
  for (const e of events) {
    if (e.e === "roll") console.log(`  ${e.by} ${e.what} ${e.at}: ${e.natural}+${e.add} vs ${e.target} -> ${e.tier}${e.why.length ? ` (${e.why.join(", ")})` : ""}`);
    else if (e.e === "hit") console.log(`  ${e.piece} takes ${e.damage} (${e.stamina} left)`);
    else if (e.e === "intent") console.log(`  ${e.intent.by} chalks a ${e.intent.kind} at ${e.intent.target}`);
    else if (e.e === "move") console.log(`  ${e.piece} ${e.style === "stand" ? "stands up" : `${e.style}s to ${e.path.at(-1)!.join(",")}`}`);
    else if (e.e !== "miss") console.log(`  ${JSON.stringify(e)}`);
  }
  console.log(`-- round ${b.round}${b.over ? ` (${b.over})` : ""}, wounds ${b.wounds}`);
  console.log(boardText(b));
  for (const p of b.pieces) if (!p.out && !p.fled) console.log(`   ${p.id.padEnd(5)} ${p.name.padEnd(12)} ${p.stamina}/${p.staminaMax}${p.down ? " DOWN" : ""}${p.states.length ? ` [${p.states.map((s) => s.id).join(",")}]` : ""}`);
}

if (process.env.SHOW) {
  fight(process.env.SHOW, Number(process.env.DIFF ?? 1), process.env.SOLO ? [HERO] : [HERO, ...FELLOWS], process.env.PLAIN ? plainOrder : readOrder, true);
  process.exit(0);
}

const RUNS = Number(process.env.RUNS ?? 200);
const rows: string[] = [];
for (const [label, side] of [
  ["solo", [HERO]],
  ["three", [HERO, ...FELLOWS]],
] as const) {
  for (const difficulty of [0, 1, 2, 3]) {
    for (const [who, play] of [
      ["reads", readOrder],
      ["plain", plainOrder],
    ] as const) {
      let won = 0;
      let rounds = 0;
      let wounds = 0;
      let down = 0;
      let stalled = 0;
      for (let i = 0; i < RUNS; i++) {
        const r = fight(`sim${i}`, difficulty, [...side], play);
        if (r.over === "won") {
          won++;
          rounds += r.rounds;
        }
        if (r.over === "stalled") stalled++;
        wounds += r.wounds;
        if (r.heroDown) down++;
      }
      const pct = (n: number) => `${String(Math.round((n / RUNS) * 100)).padStart(3)}%`;
      // A fight still going at the cap is one where your side kept out of reach: as good as getting away.
      rows.push(`${label.padEnd(6)} d${difficulty} ${who.padEnd(6)} won ${pct(won)}  lost ${pct(RUNS - won - stalled)}  kept away ${pct(stalled)}  rounds to win ${(rounds / Math.max(1, won)).toFixed(1).padStart(4)}  wounds ${(wounds / RUNS).toFixed(2)}  hero down ${pct(down)}`);
    }
  }
}
console.log(rows.join("\n"));
