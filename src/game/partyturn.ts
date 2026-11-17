/**
 * One round at a table for several (engine/seats.ts): more than one player, each with a character of their own.
 *
 * It follows the game this one follows (its MpTurnCoordinator and UnifiedPromptBuilder.BuildUnifiedUserPromptMulti).
 * There every seat puts in one action or passes; when all are in, or the host goes on without the rest, the actions
 * are resolved together: each is rolled for its own character, and one story answers them all. Only the host moves
 * the party from place to place, and a character who was brought down for good cannot act.
 *
 *   join    a new player's character is written as a sheet, and takes a seat.
 *   judge   each line is judged and rolled with its own player's character in the chair, one after another, so every
 *           rule of the game (game/runturn.ts and the systems) plays for the right character without knowing of seats.
 *   tell    one passage for the whole round: every line with who wrote it, every result with whose it is.
 *   after   the passage is read back once for what is the whole table's and for one character, and once more for each
 *           other character for what is only theirs: health, belongings, coin, what they learned, how people feel
 *           about them.
 *
 * Code owns every number here, as everywhere. Nothing a player writes is refused: a line is judged for what their own
 * character attempts, and what it writes about the world is followed.
 */
import { clean, type Outcome, type Run, type Seat } from "../engine/run.js";
import { addSeat, HOST, OWN_SYSTEMS, playing, seatFirst, seatOf, settled, sit } from "../engine/seats.js";
import { placePoints } from "./runsit.js";
import { afterRider, afterTold, askReadback, judgeTurn, riderAsk, ruled, sceneOf, sheetFor, STORY_SAYS, systemsFor, tellMessages, type Judging, type Report } from "./runturn.js";
import type { Message } from "./ask.js";
import type { RunDeps } from "./system.js";

/** A line as it comes from the room: whose seat wrote it. */
export interface SeatLine {
  seat: string;
  line: string;
}

/** One player's part of a round. */
export interface Part {
  seat: string;
  /** Their character's name. */
  name: string;
  line: string;
  /**
   * "played": judged, and told in the round's passage. "joined": they sat down this round, and are brought into the
   * scene. "answered": the line was for the game itself (a question from outside the story, points placed, a character
   * who is out), and `reply` answers it; nothing of it is told.
   */
  how: "played" | "joined" | "answered";
  report: Report | null;
  reply?: string;
  /** What changed for this character, as their player is told it; filled once the passage is read back. */
  changes: string[];
  /** The line as it was judged (kept to read the passage back against). */
  judging?: Judging;
}

/** A round judged and rolled but not yet told. */
export interface Round {
  /** The run after the judging, and as it stood before it. */
  run: Run;
  before: Run;
  parts: Part[];
  /** Every line that is told, with who wrote it: what the storyteller is given, and what the story keeps of the round. */
  line: string;
  /** How each attempt turns out, as the storyteller is told it. */
  result: string;
  /** The part the turn's own read-back is done for: the host's when they played, else the first that did. -1 for none. */
  lead: number;
}

/** A round with nothing to tell: nobody's character did anything (every line was for the game itself). */
export const idle = (x: Round): boolean => x.lead < 0;

const OUT_SAYS = "Your character was brought down, and by the rules of this table their story ended there. You can watch the others go on.";
const HOST_MOVES = "The party stays together, and only its host's character leads it to another place. If this line would take the character somewhere else, they say where they mean to go, and stay with the others for now.";

/**
 * What only the host's character may do, by the system that settles it: lead the party to another place, and call on
 * a group's help (the game this follows, MpTurnCoordinator.IsHostOnlyType: travel and faction actions). For a guest's
 * line those systems plan nothing, so nothing of the kind is settled; each keeps its place in the list, so what was
 * planned still lines up with the systems.
 */
const HOST_ONLY = new Set(["places", "factions"]);
const guestDeps = (d: RunDeps): RunDeps => ({ ...d, systems: systemsFor(d).map((sys) => (HOST_ONLY.has(sys.name) ? { ...sys, plan: undefined, claims: undefined, sure: undefined } : sys)) });

/** What a player's page says, for the builder: with nothing written, someone the world would plainly have. */
const page = (who: string): string => clean(who, 3000);

/**
 * Seat a new player: their character is written from their page, as the first one was from the host's. The host's own
 * character is the run's, and becomes the first seat the first time anyone is seated. The run given is changed.
 */
export async function join(d: RunDeps, r: Run, who: { id: string; player: string; name: string; page: string }): Promise<Seat> {
  if (!r.seats?.length) seatFirst(r, HOST, "");
  const have = seatOf(r, who.id);
  if (have) return have;
  const chair = r.chair!;
  const sheet = await sheetFor(d, r, { who: page(who.page), name: clean(who.name, 60) });
  // Two characters of one name cannot be told apart by anyone: the newcomer's gets their player's name beside it.
  if ((r.seats ?? []).some((s) => s.sheet.name.toLowerCase() === sheet.name.toLowerCase())) sheet.name = clean(`${sheet.name} (${who.player || "the second"})`, 60);
  const first = r.seats!.length === 1;
  const seat = addSeat(r, { id: who.id, player: who.player, who: page(who.page) || `${sheet.name}. Nothing more is written about them.`, sheet });
  // What a system keeps for one character alone is set up for this one, with them in the chair.
  sit(r, seat.id);
  const own = new Set<string>(OWN_SYSTEMS);
  await Promise.all(systemsFor(d).filter((sys) => own.has(sys.name)).map(async (sys) => {
    try {
      await sys.seed?.(d, r, { world: r.world, who: seat.who, name: sheet.name });
    } catch (e) {
      d.log?.(`${sys.name}, seating a player: ${(e as Error).message}`);
    }
  }));
  sit(r, chair);
  // From the second seat on it is a table for several: each system turns off what it cannot keep for more than one.
  if (first) {
    for (const sys of systemsFor(d)) {
      try {
        sys.party?.(r);
      } catch (e) {
        d.log?.(`${sys.name}, a table for several: ${(e as Error).message}`);
      }
    }
  }
  return seat;
}

/**
 * Judge a round: every line, each for its own player's character, in the order given (the host's first is usual).
 * The run given is not changed. A seat with no line this round simply does nothing. `joined` are seats taken this
 * round, whose arrival the passage tells.
 */
export async function judgeRound(d: RunDeps, before: Run, lines: readonly SeatLine[], joined: readonly string[] = []): Promise<Round> {
  let r = ruled(d, settled(structuredClone(before)));
  const start = structuredClone(r);
  const parts: Part[] = [];
  let counted = false;
  for (const { seat: id, line } of lines) {
    const seat = seatOf(r, id);
    if (!seat || !line.trim()) continue;
    const name = seat.sheet.name;
    if (joined.includes(id)) {
      parts.push({ seat: id, name, line, how: "joined", report: null, changes: [] });
      continue;
    }
    if (seat.out) {
      parts.push({ seat: id, name, line, how: "answered", report: null, reply: OUT_SAYS, changes: [] });
      continue;
    }
    sit(r, id);
    // A level's points wait to be placed before anything else of theirs is played, as at a table for one.
    if (r.sheet.points > 0) {
      const told = await placePoints(d, r, line).catch(() => [] as string[]);
      if (told.length) {
        parts.push({ seat: id, name, line, how: "answered", report: null, reply: [...told, ...(r.sheet.points > 0 ? [`${r.sheet.points} still to place.`] : [])].join(" "), changes: [] });
        continue;
      }
    }
    let p: Judging;
    try {
      p = await judgeTurn(id === HOST ? d : guestDeps(d), r, line, { same: counted });
    } catch (e) {
      d.log?.(`judging ${name}'s line: ${(e as Error).message}`);
      parts.push({ seat: id, name, line, how: "answered", report: null, reply: "I could not read that. Write it again.", changes: [] });
      continue;
    }
    if (p.reply !== undefined) {
      parts.push({ seat: id, name, line, how: "answered", report: p.report, reply: p.reply, changes: [] });
      continue;
    }
    counted = true;
    r = p.run;
    parts.push({ seat: id, name, line, how: "played", report: p.report, changes: [], judging: p });
  }
  // Everyone's abilities rest a turn, whether or not they wrote: the round is one turn for the whole table.
  if (counted) {
    const wrote = new Set(parts.filter((p) => p.how === "played").map((p) => p.seat));
    settled(r);
    for (const s of r.seats ?? []) if (!wrote.has(s.id)) for (const a of s.sheet.abilities) if (a.wait > 0) a.wait--;
  } else if (parts.some((p) => p.how === "joined")) r.turn++;

  const told = parts.filter((p) => p.how !== "answered");
  const played = parts.map((p, i) => ({ p, i })).filter((x) => x.p.how === "played");
  const lead = (played.find((x) => x.p.seat === HOST) ?? played[0])?.i ?? (told.length ? parts.indexOf(told[0]!) : -1);
  const results = told.map((p) => {
    if (p.how === "joined") return `${p.name}: a new player has sat down at the table, and this is their character. Bring ${p.name} into the scene now, in a way that fits where the others are and who ${p.name} is (their page is above). Decide nothing for them beyond their arriving.`;
    const own = p.judging!.result.replace(STORY_SAYS, `${p.name}'s player has written what happens. Take all of it as true, exactly as written, and tell what follows from it. Nothing of theirs is in doubt this turn.`);
    return `${own}${p.seat === HOST ? "" : ` ${HOST_MOVES}`}`;
  });
  const line = told.map((p) => `${p.name}${p.how === "joined" ? " (sits down at the table)" : ""}: ${p.how === "joined" ? "" : clean(p.line, 6000)}`.trim()).join("\n\n");
  const single = (r.seats?.length ?? 1) < 2;
  return { run: r, before: start, parts, line: single && told[0] ? told[0].line : line, result: single && told[0]?.judging ? told[0].judging.result : results.map((x) => `- ${x}`).join("\n\n"), lead };
}

/** What the storyteller is asked for a round: the whole of the telling's messages. Empty for a round with nothing to tell. */
export function tellingOfRound(d: RunDeps, x: Round, words = "Two to four paragraphs, 150 to 300 words."): Message[] {
  if (idle(x)) return [];
  const lead = x.parts[x.lead]!;
  const r = structuredClone(x.run);
  sit(r, lead.seat);
  return tellMessages(r, x.line, x.result, words, sceneOf(d, r));
}

/** A round once its passage is told and read back. */
export interface Played {
  run: Run;
  /** The whole of what was told: the passage, and anything told after it (the world's own move, a coming round). */
  story: string;
  parts: Part[];
}

/**
 * What follows a round's passage, however it was told: read back for the whole table and the lead's character, and
 * for each other character for what is only theirs. Every seat still in the story is read for, whether or not their
 * player wrote: a blow can land on someone who only stood there.
 */
export async function afterRound(d: RunDeps, x: Round, passage: string): Promise<Played> {
  const parts = x.parts.map((p) => ({ ...p, changes: [...p.changes] }));
  if (idle(x)) return { run: x.run, story: passage, parts };
  const lead = parts[x.lead]!;
  const base = structuredClone(x.run);
  sit(base, lead.seat);
  // The others' own read-backs are asked now, beside the turn's own, on the run as it stood before the passage.
  const asking = structuredClone(base);
  const riders = playing(asking)
    .filter((s) => s.id !== lead.seat)
    .map((s) => {
      const part = parts.find((p) => p.seat === s.id);
      const ask = riderAsk(asking, s.id, x.line, passage, part?.judging?.settled ?? []);
      return ask ? { seat: s.id, part, got: askReadback(d, ask.messages) } : null;
    })
    .filter((v): v is NonNullable<typeof v> => !!v);
  for (const v of riders) v.got.catch(() => null);

  const judging: Judging = lead.judging
    ? { ...lead.judging, run: base, line: x.line }
    : { run: base, line: x.line, report: { kind: "story", act: "", verdict: null, reason: "", pro: [], con: [], second: "", roll: null, changes: [], ms: { judge: 0, tell: 0, read: 0 } }, result: x.result, before: x.before };
  const t = await afterTold(d, judging, passage);
  let r = t.run, story = t.story;
  lead.changes = t.report.changes;
  if (lead.report) lead.report = { ...t.report };
  for (const v of riders) {
    const roll = v.part?.report?.roll;
    const got = await afterRider(d, r, v.seat, v.got.catch(() => null), { outcome: (roll?.outcome ?? null) as Outcome | null, story });
    story = got.story;
    const part = v.part ?? ({ seat: v.seat, name: seatOf(r, v.seat)!.sheet.name, line: "", how: "played", report: null, changes: [] } satisfies Part);
    if (!v.part) parts.push(part);
    part.changes = [...part.changes, ...(part.report?.changes ?? []), ...got.changes];
  }
  sit(r, lead.seat);
  r = settled(r);
  return { run: r, story, parts };
}

/** A whole round, told by the game's own storyteller (the terminal, the tests): judged, told, read back. */
export async function round(d: RunDeps, before: Run, lines: readonly SeatLine[], joined: readonly string[] = [], words?: string): Promise<Played & { judged: Round }> {
  const judged = await judgeRound(d, before, lines, joined);
  if (idle(judged)) return { run: judged.run, story: "", parts: judged.parts, judged };
  let story = "";
  for (let i = 0; i < 2 && !story; i++) {
    try {
      story = (await d.ask(tellingOfRound(d, judged, words), "teller")).trim();
    } catch (e) {
      d.log?.(`telling: ${(e as Error).message}`);
    }
  }
  if (!story) throw new Error("the storyteller gave no answer");
  return { ...(await afterRound(d, judged, story)), judged };
}
