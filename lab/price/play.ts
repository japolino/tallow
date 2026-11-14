/**
 * Plays the prototype against real models.
 *
 *   bun --env-file=.env.local lab/price/play.ts --world lab/price/worlds/locks.json            (you type the lines)
 *   bun --env-file=.env.local lab/price/play.ts --world w.json --lines lines.txt               (lines given in advance)
 *   bun --env-file=.env.local lab/price/play.ts --world w.json --bot coauthor --beats 12       (a model plays)
 *
 * --quick reads each line in about 2 s instead of 13 (a little less exact); --fast teller tells on the fast model.
 *
 * A line of "table" shows the table again; an empty line or "quit" ends the night. When a line is a bare try, the
 * game says what each die would come to and asks which to spend: a number, or "no" to leave the try alone. With
 * lines given in advance or a model playing, the lowest die that lands is spent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { addCard, addWant, apply, arrive, bite, brief, debtDue, diceSaid, LANDS, newState, table, type Outcome, type Ruling, type State } from "./engine.js";
import { arriveAt, ask, calls, chooseBite, comeDue, mint, on, open, playerLine, read, refine, tell, type World } from "./minds.js";

const arg = (k: string): string | undefined => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const world = JSON.parse(readFileSync(arg("world")!, "utf8")) as World;
const given = arg("lines") ? readFileSync(arg("lines")!, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")) : null;
const bot = arg("bot");
const beats = Number(arg("beats") ?? 12);
// --fast reader,teller puts those jobs on the fast model; --full prints the whole table after every beat.
for (const j of (arg("fast") ?? "").split(",").filter(Boolean)) on[j] = "fast";
// --reader <model id> puts the reader on any model the proxy serves.
if (arg("reader")) on.reader = arg("reader")!;
// --quick reads a line in two steps (the fast model, then the Decision model for how far each thing gets): about 2 s.
const quick = process.argv.includes("--quick");
if (quick) on.reader = "fast";
const full = process.argv.includes("--full") || (!arg("lines") && !arg("bot"));
const log: string[] = [];
const out = (s: string): void => { console.log(s); log.push(s); };
const rule = (): void => out("-".repeat(100));

const stdin = (async function* () { for await (const chunk of Bun.stdin.stream()) for (const l of new TextDecoder().decode(chunk).split(/\r?\n/)) yield l; })();
const typed = async (q: string): Promise<string> => { process.stdout.write(q); const r = await stdin.next(); return r.done ? "" : String(r.value).trim(); };

// With nobody to ask: the lowest die that lands clean, else the highest there is.
const autoDie = (s: State): number | "skip" => { const ok = s.dice.filter((d) => d >= LANDS).sort((a, b) => a - b); return ok[0] ?? [...s.dice].sort((a, b) => b - a)[0] ?? "skip"; };

async function main(): Promise<void> {
  const s = newState(Number(arg("seed") ?? 7));
  const recent: string[] = [];
  out(`WORLD: ${world.world.slice(0, 160)}...\nWHO: ${world.who}\nASKED FOR: ${world.premise}`);
  const o = await open(ask, world);
  if (!o) { out("The table could not be set."); return; }
  arrive(s, o.place.name, o.place.text);
  for (const c of o.here.slice(0, 3)) addCard(s, "here", c, c.kind === "thing" ? 1 : null);
  for (const c of o.yours.slice(0, 4)) addCard(s, "you", c);
  addWant(s, "you", { ...o.want, size: "large" });
  if (o.trouble) addWant(s, "them", o.trouble);
  rule(); out(`NARRATOR: ${o.opening}`); rule(); out(table(s)); rule();
  recent.push(`NARRATOR: ${o.opening}`);

  for (let n = 0; !s.over; n++) {
    let line: string;
    if (given) { if (n >= given.length) break; line = given[n]!; }
    else if (bot) { if (n >= beats) break; line = await playerLine(ask, world, s, recent, bot); }
    else { line = await typed("\nYOU> "); if (!line || line === "quit") break; if (line === "table") { out(table(s)); n--; continue; } }
    out(`\nYOU: ${line}`);

    let r: Ruling | null = await read(ask, world, s, recent, line);
    if (r && quick) r = await refine(world, s, line, r);
    if (!r) { out("(the reader gave no answer; the line is kept and nothing moved)"); continue; }
    out(`    (reader: ${JSON.stringify({ ...r, happens: undefined })})`);

    // The beat is played on a copy first, so a price can be said before it is paid.
    let trial = structuredClone(s);
    let res: Outcome = apply(trial, r);
    if (res.wantsDie) {
      // A bare try: say what each die would come to before one is spent.
      let die: number | "skip";
      if (given || bot) die = autoDie(s);
      else {
        const a = await typed(`  NARRATOR: You have nothing on the table behind that, only yourself. It is a try at "${res.wantsDie[0]!.name}". Your dice: ${diceSaid(s)}. Which will you spend (a number, or no)? `);
        die = /^\d+$/.test(a) ? Number(a) : "skip";
      }
      out(`    (a bare try at "${res.wantsDie[0]!.name}"; dice ${s.dice.join(", ")}; spent: ${die})`);
      trial = structuredClone(s);
      res = apply(trial, r, die);
    }
    // A large thing written as done is never billed unseen: more than one marker, or hours, is said first.
    const owed = res.ledger.filter((l) => l.startsWith("On account")).length;
    const hours = res.ledger.filter((l) => l.includes("is paid in hours"));
    if (!given && !bot && (owed > 1 || hours.length)) {
      const bill = [owed ? `${owed} marker${owed === 1 ? "" : "s"} on my account` : "", hours.length ? `${trial.candle < s.candle ? s.candle - trial.candle : 0} notches of your candle` : ""].filter(Boolean).join(" and ");
      const a = await typed(`  NARRATOR: Written as done, so it is done, if you will have it at the price: ${bill}. So be it? (yes, or no to take the line back) `);
      if (!/^(y|so be it)/i.test(a)) { out("    (the line is taken back; nothing moved)"); n--; continue; }
    }
    Object.assign(s, trial);

    // What was won becomes a card, written from what went into it.
    for (const w of s.toMint.splice(0)) {
      const d = await mint(ask, world, w);
      const c = d ? addCard(s, "you", d, d.kind === "thing" ? w.size + 1 : null) : null;
      res.ledger.push(c ? `Dealt to you, for ${w.name}: ${c.name} (${c.id}). ${c.text}${c.catch ? ` The catch: ${c.catch}` : ""}` : `${w.name} is yours, though no card was written for it.`);
    }
    // A trouble left alone takes something: the model picks which of what code allows.
    for (const t of res.bit) res.ledger.push(bite(s, t, await chooseBite(ask, world, s, t)));

    const told = await tell(ask, world, s, recent, line, r.happens ?? "", res.ledger);
    for (const l of res.ledger) out(`    . ${l}`);
    out(`\nNARRATOR: ${told}`);
    recent.push(`PLAYER: ${line}`, `NARRATOR: ${told}`);

    if (res.goes && !s.over) {
      const due = debtDue(s, true);
      const a = await arriveAt(ask, world, s, recent, res.goes, due);
      if (a) {
        arrive(s, res.goes, a.text);
        for (const c of a.here.slice(0, 3)) addCard(s, "here", c, c.kind === "thing" ? 1 : null);
        if (a.trouble && typeof a.trouble === "object") { const t = addWant(s, "them", a.trouble); if (t && due) t.collects = due.id; }
        out(`\nNARRATOR: ${a.telling}`);
        recent.push(`NARRATOR: ${a.telling}`);
      }
    }
    // A marker comes due where you stand.
    const marker = s.over || res.goes ? null : debtDue(s);
    if (marker) {
      const d = await comeDue(ask, world, s, recent, marker);
      const t = d ? addWant(s, "them", d.trouble) : null;
      if (d && t) { t.collects = marker.id; out(`\nNARRATOR: ${d.telling}`); recent.push(`NARRATOR: ${d.telling}`); }
    }
    if (full) { rule(); out(table(s)); rule(); } else out(brief(s));
  }
  rule(); out(table(s)); rule();
  out(`\n${s.over ?? "The night is left where it stands."}`);
  out(`\nCALLS: ${Object.entries(calls).map(([k, v]) => `${k} ${v.n} (${Math.round(v.ms / v.n / 100) / 10}s each)`).join(", ")}`);
  if (arg("out")) writeFileSync(arg("out")!, log.join("\n"));
}

await main();
process.exit(0);
