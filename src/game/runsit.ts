/**
 * A run (engine/run.ts, game/runturn.ts) played at the table in the room: theatre of the mind, with no map and no road.
 *
 * You write what you do. The narrator reads it, and when something is in doubt it says what it takes you to mean, what
 * stands for you and against you, and what it will be thrown on; you take the die and throw. The story is already being
 * written while you do. Then the narrator tells it, hands you the page, and your sheets are written out again as they
 * now stand. Nothing here decides anything: every number is the run's.
 */
import { ATTRIBUTES, MAX_HP, outcomeName, spend, standingWord, xpToNext, type Attribute, type Roll, type Run } from "../engine/run.js";
import { CARDS_OUT, type Table, type Written } from "./table.js";
import { firstJson } from "./ask.js";
import { begin, judgeTurn, pagesOf, showsOf, tellTurn, type Card, type Judging, type RunDeps } from "./runturn.js";
import type { Show } from "./system.js";

export interface RunSitOptions {
  table: Table;
  deps: RunDeps;
  card: Card;
  seed: number;
  /** A run left unfinished at this table, taken up again. */
  saved: Run | null;
  /** Told the run whenever it could be taken up again from. */
  save: (r: Run) => void;
  /** Nobody can be asked (no "generation" permission, or no model). */
  mute?: boolean;
}

export const RUN_HOW = "Write what you do, or say, in your own words. When it could go wrong, I will call for the die.";
export const RUN_NOTES = "What happened last is written out beside your notebook. Touch it, or press Tab while you write, to look across at it.";
export const RUN_DIE = "Take a die from the box when you are ready. Or write again, if I have you wrong.";
export const RUN_AGAIN = 'Write "new game" to begin again from the start.';
const NEW_GAME = /^\s*new game[.!]*\s*$/i;
const NO_VOICE = "I have no voice tonight: I may not ask your model anything. Allow Tallow to generate, then sit down again.";
/** How long a passage is at the table, where it is said aloud. */
const WORDS = "One or two short paragraphs, 70 to 130 words.";

const cap = (t: string): string => (t ? t[0]!.toUpperCase() + t.slice(1) : t);
const paragraphs = (t: string): string[] => t.split(/\n{2,}/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);

/** The face the die shows for a roll: the roll itself, on a die of twenty. */
export const faceOf = (roll: Roll): number => Math.max(1, Math.min(20, Math.ceil(roll.raw * 20)));

/** Your sheets, as pages for the stack by your hand. */
export function runSheets(r: Run): { heading: string; his: string[] }[] {
  const s = r.sheet;
  const here = r.people.filter((p) => p.here && !p.dead);
  return [
    {
      heading: s.name,
      his: [
        `${s.calling ? `${cap(s.calling)}. ` : ""}Level ${s.level}, ${s.xp} of ${xpToNext(s.level)} experience. Health ${s.hp} of ${MAX_HP}.${s.points ? ` ${s.points} point${s.points === 1 ? "" : "s"} to place.` : ""}`,
        ATTRIBUTES.map((a) => `${cap(a)} ${s.attributes[a]}`).join(", "),
        `Skills: ${[...s.skills].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)).map((k) => `${k.name} ${k.level}`).join(", ") || "none yet"}.`,
      ],
    },
    {
      heading: "What you have",
      his: [
        ...s.abilities.map((a) => `${a.name}${a.wait ? ` (resting, ${a.wait})` : ""}: ${a.text}`),
        `Carrying: ${s.items.map((i) => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ""}`).join(", ") || "nothing"}.`,
        `${s.money} ${s.coin}.`,
      ],
    },
    {
      heading: r.place.name || "Here",
      his: [...(r.place.text ? [r.place.text] : []), ...(here.length ? here.map((p) => `${p.name}${p.hostile ? ", hostile" : p.follows ? ", with you" : ""}${p.hp > 0 ? "" : ", beaten"}: ${standingWord(p.feeling)}.`) : ["Nobody else is here."])],
    },
  ];
}

/**
 * All your sheets: the character's own (runSheets), each system's pages, and, last, the cards the systems show that
 * are more than the table lays out (table.ts, CARDS_OUT), so nothing shown is lost.
 */
export function allSheets(d: RunDeps, r: Run, shows: Show[]): { heading: string; his: string[] }[] {
  const over = shows.flatMap((s) => (s.kind === "card" ? [s] : [])).slice(CARDS_OUT);
  return [
    ...runSheets(r),
    ...pagesOf(d, r),
    ...(over.length ? [{ heading: "Not on the table", his: over.map((c) => `${c.title}${c.group ? ` (${c.group})` : ""}: ${c.text}`) }] : []),
  ];
}

/** How a run opens, as the page beside your notebook: there is nothing of yours on it yet. */
const openingNotes = (r: Run): { heading: string; his: string[] } => ({ heading: r.place.name || "How it begins", his: paragraphs(r.opening) });

/** The check, as the narrator says it before the die. */
export function checkSaid(p: Judging): string[] {
  const x = p.report, roll = x.roll!;
  const lines = [`I take it you mean to ${x.act.replace(/[.!?]+$/, "").replace(/^./, (c) => c.toLowerCase())}.`];
  if (x.pro.length) lines.push(`For you: ${x.pro.join("; ")}.`);
  if (x.con.length) lines.push(`Against you: ${x.con.join("; ")}.`);
  lines.push(`It goes on your ${roll.attribute.name}${roll.skill.name ? `, and on ${roll.skill.name}${roll.skill.fresh ? ", which is new to you" : ""}` : ""}.`);
  return lines;
}

/** The die, as the narrator reads it out. */
export function rollSaid(roll: Roll): string {
  const by = roll.modifiers.reduce((n, m) => n + m.by, 0);
  return `${faceOf(roll)} on the die${by ? `, and ${by > 0 ? `${by} for you` : `${-by} against you`}` : ""}: ${outcomeName(roll.outcome)}.`;
}

/** Where a level's points go, read from a line: by a model when there is one, else by the attributes it names. */
async function placePoints(d: RunDeps, r: Run, line: string): Promise<string[]> {
  const s = r.sheet;
  let want: Partial<Record<Attribute, number>> = {};
  try {
    const j = firstJson(await d.ask([
      { role: "system", content: "Answer with one JSON object and nothing else." },
      { role: "user", content: `A player has ${s.points} points to add to their character's attributes (${ATTRIBUTES.join(", ")}). They wrote: "${line.replace(/"/g, "'").slice(0, 400)}". How many go to each? Write {"strength": n, "dexterity": n, "intelligence": n, "charisma": n, "cunning": n}, the numbers adding up to at most ${s.points}. If they named only one attribute, all of them go there.` },
    ], "reader")) as Record<string, unknown> | null;
    if (j) for (const a of ATTRIBUTES) want[a] = Math.max(0, Math.round(Number(j[a]) || 0));
  } catch { /* by its words, below */ }
  if (!Object.values(want).some((n) => n! > 0)) {
    const named = ATTRIBUTES.filter((a) => line.toLowerCase().includes(a));
    want = named.length ? { [named[0]!]: s.points } : {};
  }
  const told: string[] = [];
  for (const a of ATTRIBUTES) {
    let n = 0;
    while (n < (want[a] ?? 0) && spend(s, a)) n++;
    if (n) told.push(`${cap(a)} is now ${s.attributes[a]}.`);
  }
  return told;
}

/** Which cards most want the little room there is: a choice that is open now, then what suits the moment, then reminders. */
const CARD_RANK: [RegExp, number, number][] = [
  [/perk|knack/i, 0, 3],
  [/fight|foe|contest/i, 1, 3],
  [/choice|suggest/i, 2, 3],
  [/ware|shop|merchant|goods/i, 3, 3],
  [/quest/i, 4, 2],
];
/**
 * What the systems show, with the cards in the order the table should lay them: the first few of each kind, the most
 * pressing kinds first, and whatever is over after them (it goes to the sheets). Everything else is left as it came.
 */
export function inOrder(shows: Show[]): Show[] {
  const rank = (g: string): [number, number] => {
    const hit = CARD_RANK.find(([re]) => re.test(g));
    return hit ? [hit[1], hit[2]] : [CARD_RANK.length, 2];
  };
  const cards = shows.flatMap((s) => (s.kind === "card" ? [s] : []));
  const seen = new Map<string, number>();
  const first: typeof cards = [], rest: typeof cards = [];
  for (const card of cards) {
    const n = seen.get(card.group) ?? 0;
    seen.set(card.group, n + 1);
    (n < rank(card.group)[1] ? first : rest).push(card);
  }
  first.sort((a, b) => rank(a.group)[0] - rank(b.group)[0]);
  return [...shows.filter((s) => s.kind !== "card"), ...first, ...rest];
}

export async function runSit(o: RunSitOptions): Promise<void> {
  const { table, deps } = o;
  table.theatre?.(true);
  /** The run as the table shows it, written out again whenever it changes: your sheets, and what the systems put out. */
  const lay = (r: Run): void => {
    const shows = inOrder(showsOf(deps, r));
    table.sheets?.(allSheets(deps, r, shows));
    table.show?.(shows);
  };
  let run: Run;
  if (o.saved) {
    run = o.saved;
    lay(run);
    const before = run.beats[run.beats.length - 1];
    table.notes?.(before ? { mine: before.you, his: paragraphs(before.story) } : openingNotes(run));
    await table.say([`We were in the middle of things${run.place.name ? `, at ${run.place.name}` : ""}.`, RUN_HOW, RUN_NOTES, RUN_AGAIN]);
  } else {
    if (o.mute) {
      await table.say([NO_VOICE]);
      return;
    }
    await table.say([`${o.card.name ? `You sit down as ${o.card.name}` : "You sit down"}. Give me a moment to set the table.`]);
    run = await table.wait("deal", begin(deps, o.card, o.seed));
    lay(run);
    o.save(run);
    table.notes?.(openingNotes(run));
    await table.say([...paragraphs(run.opening), RUN_HOW, RUN_NOTES]);
  }

  let next: Written | null = null;
  for (;;) {
    const w: Written = next ?? (await table.write());
    next = null;
    const line = w.line.trim();
    if (!line) {
      await w.given;
      void table.aside();
      continue;
    }
    // "new game", as the table tells you to write it: a command, whatever is going on in the story.
    if (NEW_GAME.test(line)) {
      await w.given;
      void table.aside();
      if (o.mute) {
        await table.say([NO_VOICE]);
        continue;
      }
      await table.say(["Then we begin again. Give me a moment to set the table."]);
      run = await table.wait("deal", begin(deps, o.card, (o.seed + run.turn + 1) >>> 0));
      lay(run);
      o.save(run);
      table.notes?.(openingNotes(run));
      await table.say([...paragraphs(run.opening), RUN_HOW]);
      continue;
    }
    // A level's points wait to be placed before anything else is played.
    if (run.sheet.points > 0) {
      await w.given;
      const told = await table.wait("read", placePoints(deps, run, line));
      if (told.length) {
        void table.aside();
        lay(run);
        o.save(run);
        await table.say(told);
        if (run.sheet.points > 0) await table.say([`${run.sheet.points} still to place.`]);
        continue;
      }
    }
    // Judged while the page is in the air.
    const judging = judgeTurn(deps, run, line);
    await w.given;
    let p: Judging;
    try {
      p = await table.wait("read", judging);
    } catch {
      void table.aside();
      await table.say(["I could not read that. Write it again."]);
      continue;
    }
    if (p.reply !== undefined) {
      void table.aside();
      await table.say([p.reply]);
      continue;
    }
    // The story is written while the check is said and the die thrown; it is thrown away if you write again instead.
    let early: (passage: string) => void = () => undefined;
    const passage = new Promise<string>((given) => (early = given));
    const telling = tellTurn(deps, p, { words: WORDS, onStory: (s) => early(s) });
    telling.catch(() => undefined);
    const roll = p.report.roll;
    if (roll) {
      await table.say([...checkSaid(p), RUN_DIE]);
      next = await table.dieOrLine();
      if (next) continue;
      await table.throwDie(faceOf(roll));
      await table.say([rollSaid(roll)]);
    } else void table.aside();
    // The passage is said as soon as it is told; the rest of the turn (what changed, and what the world does next) is
    // written down meanwhile and said after it.
    const y = p.report;
    const aside = y.kind === "action" && y.verdict === "implausible" ? ["That could not work."] : y.kind === "action" && y.verdict === "missing" ? ["You have nothing to do that with."] : [];
    let first: string;
    try {
      first = await table.wait("tell", Promise.race([passage, telling.then((t) => t.story)]));
    } catch {
      await table.say(["I lost the thread there, and have nothing for what you wrote. Write on, and it will be taken up."]);
      continue;
    }
    await table.say([...aside, ...paragraphs(first)]);
    let t: Awaited<typeof telling>;
    try {
      t = await table.wait("tell", telling);
    } catch {
      await table.say(["I lost the thread after that, and what it changed is not written down. Write on, and it will be taken up."]);
      continue;
    }
    run = t.run;
    o.save(run);
    lay(run);
    const x = t.report;
    const changes = x.changes.filter((c) => !c.startsWith("("));
    // What was told after the passage: the world's own move, a quest's close, coming round after a fall.
    const after = t.story.startsWith(first) ? t.story.slice(first.length).trim() : "";
    // The whole of the turn, to write the next against: it lies by the notebook from now on.
    table.notes?.({ mine: line, ...(roll ? { heading: cap(x.act).slice(0, 60) } : {}), his: [...(roll ? [rollSaid(roll)] : []), ...aside, ...paragraphs(t.story), ...changes] });
    if (after || changes.length) await table.say([...paragraphs(after), ...changes]);
    if (roll) await table.page({ heading: cap(x.act).slice(0, 60), his: [rollSaid(roll), ...paragraphs(t.story), ...changes] });
    if (run.sheet.points > 0) await table.say([`You have ${run.sheet.points} points to place among ${ATTRIBUTES.join(", ")}. Write where they go.`]);
  }
}
