/**
 * The world around the road (docs/MOONSHOT.md): the people at a place and how they feel about you, the slips of what
 * you have found out and the map they ink, the other side's clock, your own projects, and the other players at the
 * table. Each has its own rules file; this one puts them together for a story and says, in a few plain lines, what
 * happened, so the director only has to call it at four points: when you begin, when you come to a place, when you
 * write a line that tries nothing, and when the clock runs.
 *
 * Pure: a trip in, a trip and some lines out. Every number is decided here, by code and a seeded die.
 */
import { clockTo, companionOf, placeName, type Companion, type RoadStop, type Trip } from "./adventure.js";
import { readAgeBand } from "./content.js";
import { getClue, keysKnown, layTogether, newCasebook, slipNamed, type Clue } from "./clues.js";
import { seededRng } from "./dice.js";
import { ATTITUDE_STEP, attitudeIndex, favourDone, hearLine, hunch, PATIENCE, lieTo, lineKind, moveAttitude, newVisit, pressDifficulty, pressed, readThem, released, rulesLine, type Attitude, type Person } from "./people.js";
import { goalNamed, PAYOFF_DOES, payoffOf, projectSaid, startProject, workOn, type Payoff, type Project } from "./project.js";
import { doubt } from "./clues.js";
import { kitFight } from "./kit.js";
import { goingOn, hourSaid, learn, newSchedule, nextAt, runClock, stoppedAt, type Appointment, timeRead, timeTaken } from "./schedule.js";
import { asksTable, feel, spoke, spotlight, talkItOver, vote, whatTheySay, type Fellow, type Said, type Style } from "./seats.js";
import { hasPower, shut, statOf, TARGETS, WAY_STATS, WAYS, type Moment, type Stat, type Way } from "./moment.js";
import type { Tier } from "./moment.js";

/** How a person's feeling is said aloud. */
export const ATTITUDE_SAID: Record<Attitude, string> = {
  hostile: "wants you gone",
  cold: "has no time for you",
  wary: "watches you, and waits",
  friendly: "is glad to see you",
  close: "would do a great deal for you",
};

const name = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The clues the story has, and one by id. */
const cluesOf = (t: Trip): readonly Clue[] => t.adv.clues ?? [];
const clueOf = (t: Trip, id: string): Clue | undefined => cluesOf(t).find((c) => c.id === id);

/** A story begins: an empty casebook with where you set out inked on the map, the other side's clock, the other players. */
export function worldBegin(t: Trip): Trip {
  return seated({
    ...t,
    ...(t.adv.clues?.length ? { book: t.book ?? newCasebook([t.adv.start]) } : {}),
    ...(t.adv.appointments?.length ? { schedule: t.schedule ?? newSchedule(t.adv.appointments, t.adv.appointments.filter((a) => a.daily).map((a) => a.id)) } : {}),
    ...(t.adv.fellows?.length ? { fellows: t.fellows ?? t.adv.fellows } : {}),
  });
}

const STYLE_OF: Record<Stat, Style> = { brawn: "brawler", grace: "brawler", charm: "talker", guile: "joker", wits: "planner", sense: "planner", power: "planner" };
const WAY_WANTS: Record<Way, { want: string; words: string[] }> = {
  talk: { want: "to see this done with words, not blood", words: ["talk", "ask", "persuade", "word", "deal"] },
  sneak: { want: "to get through unseen, and out again", words: ["sneak", "quiet", "unseen", "slip", "hide"] },
  force: { want: "a fight worth telling about", words: ["fight", "force", "blade", "break", "strike"] },
  pay: { want: "to come out of this richer than they went in", words: ["pay", "coin", "gold", "price", "buy"] },
};

/** Someone walking with you, as a player at the table (docs/MOONSHOT.md, 4.1): best at what they help with, wanting what they like. */
export function fellowOf(c: Companion, power: boolean): Fellow {
  const stats = { brawn: 1, grace: 1, charm: 1, guile: 1, wits: 1, sense: 1, ...(power ? { power: 1 } : {}) };
  return {
    id: c.id,
    name: c.name,
    who: c.who,
    style: STYLE_OF[c.stat],
    stats: { ...stats, [c.stat]: 3 },
    want: WAY_WANTS[c.likes].want,
    wantWords: WAY_WANTS[c.likes].words,
    attitude: "friendly",
    toward: {},
    lastSpoke: -1,
    overruled: 0,
    age: readAgeBand(c.name, c.who),
    ...(c.id === "friend" ? { fromCard: true } : {}),
  };
}

/** Everyone walking with you has a seat at the table, a companion who joined on the road too. */
export function seated(t: Trip): Trip {
  const have = new Set((t.fellows ?? []).map((f) => f.id));
  const add = t.party.map((id) => companionOf(t.adv, id)).filter((c): c is Companion => !!c && !have.has(c.id));
  if (!add.length) return t;
  return { ...t, fellows: [...(t.fellows ?? []), ...add.map((c) => fellowOf(c, typeof t.sheet.stats.power === "number"))] };
}

/** The person at the place in your way, as they stand now (their feeling carries over between visits). */
export function personAt(t: Trip, stop?: RoadStop | null): Person | null {
  const p = stop?.person;
  if (!p) return null;
  return t.people?.[p.id] ?? p;
}

/** What a few lines of the world say, and the trip after. */
export interface Told {
  trip: Trip;
  lines: string[];
  /** Places newly inked on the map. */
  inked?: string[];
  /** For the narrator, when it answers: who the person is now and what they may say. */
  note?: string;
  /** Talk at the table, out of the story (a vote, talking it over, sending a player off, a goal named): it takes no time. */
  free?: boolean;
}

/**
 * Whether a clue heard is a lie you have a hunch about (docs/LOOP.md, 3.4): someone's lie, and your Sense at least their
 * skill at lying. However it reaches you (told to your face, pressed out of them, brought back by a player you sent,
 * given up once you are past them, or after a favour), the same hunch.
 */
function lieHunch(t: Trip, c: Clue): boolean {
  const liar = t.adv.stops.map((s) => personAt(t, s)).find((p) => p?.lie?.clue === c.id);
  return !!liar && hunch(statOf(t.sheet, "sense"), liar);
}

/** Inking and notches: the lines for what getting a clue did. */
function gotLines(t: Trip, c: Clue, how: "heard" | "seen", hunchHad = false): Told {
  if (!t.book) return { trip: t, lines: [] };
  const g = getClue(t.book, c, how, hunchHad || (how === "heard" && lieHunch(t, c)));
  if (g.again) return { trip: { ...t, book: g.book }, lines: g.slip.state === "doubted" && t.book.slips.find((x) => x.clue === c.id)?.state === "heard" ? [`You think again about “${c.text}” Something about it does not sit right with you.`] : [] };
  let trip: Trip = { ...t, book: g.book };
  const lines = [`I write it on a slip and push it across to you: “${c.text}”${g.slip.state === "doubted" ? " Something about it does not sit right with you." : ""}`];
  if (g.inked) lines.push(`I ink ${g.inked} onto the map.`);
  if (g.tells && trip.schedule) {
    const a = trip.schedule.appointments.find((x) => x.id === g.tells);
    trip = { ...trip, schedule: learn(trip.schedule, g.tells) };
    if (a) lines.push(`I cut a notch in the candle: ${hourSaid(a.at)}, at ${placeName(t.adv, a.where)}.`);
  }
  return { trip, lines, ...(g.inked ? { inked: [g.inked] } : {}) };
}

function gotAll(t: Trip, clues: { c: Clue; how: "heard" | "seen"; hunch?: boolean }[]): Told {
  let trip = t;
  const lines: string[] = [];
  const inked: string[] = [];
  for (const x of clues) {
    const g = gotLines(trip, x.c, x.how, x.hunch);
    trip = g.trip;
    lines.push(...g.lines);
    inked.push(...(g.inked ?? []));
  }
  return { trip, lines, ...(inked.length ? { inked } : {}) };
}

/**
 * You come to a place (after `arrive`): the person there and how they feel, which counts in talking them round; what
 * is going on there now, by the other side's clock.
 */
export function worldArrive(t: Trip, stop: RoadStop, since?: number): Told {
  let trip = seated(t);
  const lines: string[] = [];
  const inked: string[] = [];
  const p = personAt(t, stop);
  if (p && trip.facing) {
    // Their feeling makes talking them round easier or harder for the whole visit (moment.ts reads it as warmth).
    const warm = -ATTITUDE_STEP[p.attitude];
    trip = { ...trip, visits: { ...(trip.visits ?? {}), [stop.id]: newVisit(p.id) }, facing: { ...trip.facing, moment: { ...trip.facing.moment, warm: (trip.facing.moment.warm ?? 0) + warm } } };
    lines.push(`${p.name} ${ATTITUDE_SAID[p.attitude]}.`);
  }
  if (trip.schedule) {
    // What began here on your way is said by the clock (worldClock), so only what was going on before is said now.
    // Said as going on only if it began before you set out: one that began on your way was said by the clock already.
    const began = (a: Appointment): number => (a.daily ? nextAt(a, trip.sheet.hour - (a.lasts ?? 0.25)) : trip.schedule!.happened.find((h) => h.id === a.id)?.at ?? a.at);
    for (const a of goingOn(trip.schedule, stop.id, trip.sheet.hour)) if (since === undefined || began(a) <= since) lines.push(`Right now, here: ${a.what}.`);
    // What the other side did here while you were elsewhere, and nobody saw: you come too late, and find its signs.
    const s = trip.schedule;
    const missed = s.happened.filter((h) => (since === undefined || h.at <= since) && !s.known.includes(h.id)).map((h) => ({ h, a: s.appointments.find((x) => x.id === h.id) })).filter((x) => x.a?.where === stop.id && !goingOn(s, stop.id, trip.sheet.hour).some((g) => g.id === x.h.id));
    for (const { h, a } of missed) {
      lines.push(`You come too late for it. At ${hourSaid(h.at)}, here: ${a!.what}. It is done, and you can see the signs of it.`);
      trip = { ...trip, schedule: learn(trip.schedule!, h.id) };
    }
  }
  // A fight in this world's currency (docs/MOONSHOT.md, 7.2): what it is won with, and what you risk.
  if (trip.adv.kit && stop.kind === "fight" && trip.facing) {
    const kf = kitFight(trip.adv.kit, hasPower(trip.sheet));
    const f = trip.facing;
    const contest = f.contest ? { ...f.contest, you: { ...f.contest.you, name: kf.dial } } : undefined;
    trip = { ...trip, facing: { ...f, moment: { ...f.moment, attack: kf.attack }, ...(contest ? { contest } : {}) } };
    if (kf.kind !== "fight" && !(trip.noticed ?? []).includes("kit:fight")) {
      lines.push(`In this world a fight is ${kf.said}: it is won with ${kf.attack.map((s) => statName(s, trip.sheet.powerName)).join(" and ")}, and what you risk is ${kf.dial}.`);
      trip = { ...trip, noticed: [...(trip.noticed ?? []), "kit:fight"] };
    }
  }
  // Players who went off on their own come back when you get to where they are (4.3), with what they saw there.
  const back = (trip.fellows ?? []).filter((f) => f.at === stop.id);
  if (back.length) {
    const r = rejoin(trip, back.map((f) => f.id));
    trip = r.trip;
    lines.push(...r.lines);
    inked.push(...(r.inked ?? []));
  }
  // A name of your own (a project's payoff) goes before you: people here are easier to talk round.
  if (p && trip.facing && (trip.payoffs ?? []).includes("name")) {
    trip = { ...trip, facing: { ...trip.facing, moment: { ...trip.facing.moment, warm: (trip.facing.moment.warm ?? 0) + 1 } } };
    lines.push(`Your name goes before you: ${p.name} has heard of you.`);
  }
  // A weapon of yours (a project's payoff): an edge you bring to one fight.
  if (trip.facing && (stop.kind === "fight" || stop.climax) && (trip.payoffs ?? []).includes("weapon") && !trip.armed) {
    trip = { ...trip, armed: true, facing: { ...trip.facing, moment: { ...trip.facing.moment, edges: (trip.facing.moment.edges ?? 0) + 1 } } };
    lines.push("You bring the weapon you made for this: an edge on every try here.");
  }
  // The table talks it over before a big move (4.4).
  if (stop.climax && trip.facing) {
    const t2 = talkOver(trip);
    trip = t2.trip;
    lines.push(...t2.lines);
  }
  // The last story of a campaign: the big bad itself, and every key you carried is an edge against it (6.1).
  if (stop.climax && trip.facing && trip.adv.finale) {
    const fin = trip.adv.finale;
    trip = { ...trip, facing: { ...trip.facing, moment: { ...trip.facing.moment, edges: (trip.facing.moment.edges ?? 0) + fin.edges } } };
    lines.push(fin.edges >= 3 ? `${name(fin.name)} waits here. You carry all three keys to it: three edges, and a fair fight.` : fin.edges ? `${name(fin.name)} waits here. You carry ${fin.edges === 1 ? "one key" : "two keys"} to it: ${fin.edges === 1 ? "an edge" : "two edges"} on every try.` : `${name(fin.name)} waits here, and you carry none of the keys to it. Nothing you throw will touch it. You can run, or buy time for someone else.`);
  }
  // At the end of the story, every key you hold is an edge against what waits there (docs/MOONSHOT.md, 6.1).
  if (stop.climax && trip.book && trip.facing && cluesOf(trip).length) {
    const keys = keysKnown(trip.book, cluesOf(trip));
    trip = { ...trip, facing: { ...trip.facing, moment: { ...trip.facing.moment, edges: (trip.facing.moment.edges ?? 0) + keys } } };
    lines.push(keys === 3 ? "You know all three keys to it. Here, that counts: three edges on your side, on every try." : keys ? `You know ${keys === 1 ? "one" : "two"} of the three keys to it: ${keys === 1 ? "an edge" : "two edges"} on your side, on every try here.` : "You know none of the keys to it. Whatever you do here, you do without them.");
  }
  return { trip, lines, ...(inked.length ? { inked } : {}) };
}

/**
 * The clock has run from one hour to another: what the other side did. What happens where you are is said; what you
 * knew of elsewhere is said as news; the rest happens out of sight, and you find out by what it changed.
 */
export function worldClock(t: Trip, from: number, to: number): Told {
  if (!t.schedule || to <= from) return { trip: t, lines: [] };
  const here = t.facing?.stop.id ?? t.at;
  const r = runClock(t.schedule, from, to);
  const away = (t.fellows ?? []).filter((f) => f.at && f.at !== here);
  let schedule = r.schedule;
  const lines = r.events
    .map((e) => {
      if (e.a.where === here) return `At ${hourSaid(e.at)}, here: ${e.a.what}.`;
      // Splitting up (4.3): the narrator cuts to a player who is there, and what they saw is yours to know.
      const there = away.find((f) => f.at === e.a.where);
      if (there) {
        schedule = learn(schedule, e.a.id);
        return `Cut to ${there.name}, at ${placeName(t.adv, e.a.where)}: at ${hourSaid(e.at)}, ${e.a.what}.`;
      }
      return e.known ? `At ${hourSaid(e.at)}, at ${placeName(t.adv, e.a.where)}: ${e.a.what}. The flame passes the notch.` : "";
    })
    .filter(Boolean);
  // What happens out of sight is not told, but you feel the other side has moved.
  if (r.events.some((e) => e.a.where !== here && !e.known && !away.some((f) => f.at === e.a.where))) lines.push("Somewhere out of sight, the other side moves. You will find out what it did when you get there.");
  const dread = r.events.filter((e) => e.a.front).length;
  return { trip: { ...t, schedule, ...(dread ? { dread: (t.dread ?? 0) + dread } : {}) }, lines };
}

/** A seeded d20 plus a stat against a target, as a tier: for the throws the world makes on its own (a project, laying slips together). */
function quietThrow(seed: string, add: number, target = 12): { natural: number; tier: Tier } {
  const natural = Math.floor(seededRng(seed)() * 20) + 1;
  const total = natural + add;
  const tier: Tier = natural === 20 ? "crit_success" : natural === 1 ? "crit_fail" : total >= target ? "success" : total >= target - 4 ? "partial" : "fail";
  return { natural, tier };
}

const TIER_SAID: Record<Tier, string> = { crit_success: "It goes better than you hoped.", success: "It comes along well.", partial: "It comes along, but not without trouble.", fail: "It does not come along.", crit_fail: "It goes badly wrong." };

/** What the world says to a line: the trip after, its lines, and how long it took when it took a stretch of the story. */
export type Heard = (Told & { hours?: number }) | null;

/**
 * A line that tries nothing at the place in your way (a question, a look round, a wait, a goal): read by the world
 * before the narrator answers. It may name a goal of your own, spend time, lay two slips together, or speak to the
 * person there. Null when the world has nothing to say about it and the narrator answers as before.
 */
export function worldLine(t: Trip, line: string, m: Moment): Heard {
  return heard(t, line, m, ROWS);
}

/**
 * A line the reader took for a try, read by the world first (docs/MOONSHOT.md, 4; docs/LOOP.md, 3): only by the rows
 * that may take a try from it (a vote, a player sent off, pressing or reading the person here, a wait on its own), and
 * only when one of them has something to say. Null: it is a try after all.
 */
export function worldFirstLine(t: Trip, line: string, m: Moment): Heard {
  return heard(t, line, m, ROWS.filter((r) => r.first(t, line)));
}

/** Whether any row of the world may take a line the reader took for a try. */
export function worldFirst(t: Trip, line: string): boolean {
  return ROWS.some((r) => r.first(t, line));
}

function heard(t: Trip, line: string, m: Moment, rows: readonly Row[]): Heard {
  const seed = `${t.seed}:${t.sheet.hour}:${line.length}`;
  for (const row of rows) {
    const out = row.run(t, line, m, seed);
    // The place in your way keeps the clock too: a try after a wait starts from the hour the wait ended at.
    if (out) return { ...out, trip: hourKept(out.trip) };
  }
  return null;
}

/** The trip with the moment at the place in your way on the trip's own hour. */
export function hourKept(t: Trip): Trip {
  if (!t.facing || t.facing.moment.sheet.hour === t.sheet.hour) return t;
  return { ...t, facing: { ...t.facing, moment: { ...t.facing.moment, sheet: { ...t.facing.moment.sheet, hour: t.sheet.hour } } } };
}

/**
 * One row of the line router, in the order the rows are read. `first`: whether the row may take a line the reader took
 * for a try (most may not). `run`: what the row makes of the line, or null to pass it on to the next row, and, for a
 * line taken from a try, back to being a try.
 */
interface Row {
  name: string;
  first: (t: Trip, line: string) => boolean;
  run: (t: Trip, line: string, m: Moment, seed: string) => Heard;
}

/** Words that say a line tries to get past: a try may have a wait or a favour in it, and is still a try. */
const TRY_VERBS = /\b(run|runs|slip|slips|sneak|sneaks|creep|climb|climbs|fight|attack|attacks|strike|swing|swings|stab|shoot|charge|break|smash|escape|flee|dash|bolt|jump|kick|grab|steal|pick the lock|bribe|threaten|then)\b/i;

/** A wait on its own: not a try that waits for its moment ("I wait for the guard to turn, then slip past"). */
const waitsAlone = (t: Trip, line: string): boolean => timeRead(line, t.sheet.hour)?.act === "wait" && !TRY_VERBS.test(line);

/** A player at the table named in a line, by the first word of their name. */
const fellowNamed = (t: Trip, line: string): Fellow | null => {
  const l = line.toLowerCase();
  return (t.fellows ?? []).find((f) => new RegExp(`\\b${f.name.toLowerCase().split(/\s+/)[0]}\\b`).test(l)) ?? null;
};
/** A player named with a word for going somewhere: the table is splitting up. */
const sendsOff = (t: Trip, line: string): Fellow | null => {
  const who = fellowNamed(t, line);
  return who && SPLIT.test(line) && /\b(go|goes|head|scout|stake out|keep watch|watch)\b/i.test(line) ? who : null;
};

/** Words that say a line is said to someone: words in quotes, a word for speaking, a greeting, or "you". */
const SPEAKS = /["“”]|\b(say|says|said|tell|ask|asks|talk|speak|greet|offer|promise|threaten|flirt|plead|beg|explain|thank|compliment|insist|reply|answer|whisper|introduce|apologi[sz]e|hello|hi|hey|good (morning|evening|day)|please|sorry|you|your|you're|yours)\b/i;
/** Words that say a line is about the place, not said to anyone: a look round, or asking what is there. */
const ABOUT_PLACE = /^\s*(is|are|was|were) there\b|\b(look|looks|looking|search|searching|examine|inspect|check|study|survey|glance|peer|listen|sniff|explore|wander|scan)\b/i;
/**
 * Whether a line is said to the person here: anything you say in front of them, unless it is a look round or a question
 * about the place ("Is there a back door?") that names nothing said to them (words for speaking, "you", their name).
 */
const addressed = (line: string, p: Person): boolean => {
  if (SPEAKS.test(line)) return true;
  const l = line.toLowerCase();
  if (p.name.split(/[\s'’]+/).some((w) => /^[A-Z][a-z]{2,}$/.test(w) && new RegExp(`\\b${w.toLowerCase()}\\b`).test(l))) return true;
  return !ABOUT_PLACE.test(line);
};

const ROWS: readonly Row[] = [
  {
    // A goal of your own (docs/MOONSHOT.md, 7.5): said at the table, so it takes no time.
    name: "goal",
    first: () => false,
    run: (t, line) => {
      const goal = goalNamed(line);
      if (!goal) return null;
      const p = startProject(`project-${(t.projects?.length ?? 0) + 1}`, goal, undefined, "person");
      return { trip: { ...t, projects: [...(t.projects ?? []), p] }, lines: [`You set yourself a goal. ${projectSaid(p)} Spend time on it when you like: say you work on it, and for how long.`], free: true };
    },
  },
  {
    // Working on a goal of your own, or on what someone asked of you (docs/MOONSHOT.md, 7.5; docs/LOOP.md, 3.5).
    name: "work",
    first: (t, line) => !TRY_VERBS.test(line) && !!workedOn(t, line, t.facing?.stop.id),
    run: (t, line, m, seed) => {
      const p = workedOn(t, line, m.stop.id);
      return p ? workIt(t, line, m, p, seed) : null;
    },
  },
  {
    // Two slips laid side by side (docs/LOOP.md, 4.2): a throw on Wits.
    name: "compare",
    first: (t, line) => !!t.book && t.book.slips.length >= 2 && COMPARE.test(line),
    run: (t, line, m, seed) => (t.book && COMPARE.test(line) ? compareSlips(t, line, m, seed) : null),
  },
  {
    // The table (docs/MOONSHOT.md, 4): splitting up, coming back together, talking it over, a vote.
    name: "table",
    first: (t, line) => VOTE.test(line) || asksTable(line) || REGROUP.test(line) || !!sendsOff(t, line),
    run: (t, line, m) => {
      const table = tableLine(t, line, m);
      if (table) return table;
      const alone = !withYou(t).length;
      if (VOTE.test(line) && alone) return { trip: t, lines: ["There is nobody else at the table to vote with. It is your call."], free: true };
      if (asksTable(line) && alone && !VOTE.test(line)) return { trip: t, lines: ["There is nobody else at the table to talk it over with. It is your call."], free: true };
      if (REGROUP.test(line) && !(t.fellows ?? []).some((f) => f.at)) return { trip: t, lines: [(t.fellows ?? []).length ? "Everyone is here with you already." : "There is nobody to call back: you are on your own."], free: true };
      // A player sent off somewhere that is not a place on the map asks where, rather than you going in their stead.
      const who = sendsOff(t, line);
      if (who && !who.at) return { trip: t, lines: [`${who.name} would go, but where? Name a place on the map: one on the road, or one you have had inked.`], free: true };
      return null;
    },
  },
  {
    // Pressing the person here, reading them, asking what they need (docs/LOOP.md, 3.3 to 3.5).
    name: "person",
    first: (_t, line) => PRESS.test(line) || READ.test(line) || FAVOUR.test(line),
    run: (t, line, m, seed) => {
      const p = personAt(t, m.stop as RoadStop);
      if (p) return personActs(t, line, m, p, seed);
      if (PRESS.test(line)) return { trip: t, lines: ["There is nobody here to press."], free: true };
      return null;
    },
  },
  {
    // Time (docs/MOONSHOT.md, 5.2). From a try, only a wait on its own; watching, following and getting ready only when
    // the line tried nothing.
    name: "time",
    first: (t, line) => waitsAlone(t, line),
    run: (t, line, m, seed) => timeSpent(t, line, m, seed),
  },
  {
    // Something said to the person here (docs/LOOP.md, 3): only a line said to them. A question about the place, or a
    // look round, is the narrator's (or luck's) to answer.
    name: "speech",
    first: () => false,
    run: (t, line, m, seed) => {
      const p = personAt(t, m.stop as RoadStop);
      return p && addressed(line, p) ? spokenTo(t, line, m, p, seed) : null;
    },
  },
  {
    // A look round a place: what is to be seen there by anyone who looks.
    name: "look",
    first: () => false,
    run: (t, line, m) => {
      if (!t.book || !/\b(look|looks|search|examine|inspect|check|study|survey)\b/i.test(line)) return null;
      const here = cluesOf(t).filter((c) => c.from?.place === m.stop.id && !c.from?.person);
      const g = gotAll(t, here.map((c) => ({ c, how: "seen" as const })));
      return g.lines.length ? g : null;
    },
  },
];

/** Two slips laid side by side: which two, then a throw on Wits that pins them both, tears one, or says nothing. */
function compareSlips(t: Trip, line: string, m: Moment, seed: string): Heard {
  if (!t.book) return null;
  const pair = twoSlips(line, t);
  if (!pair) {
    const held = t.book.slips.filter((s) => s.state !== "torn").map((s, i) => `${i + 1}: “${clueOf(t, s.clue)?.text ?? s.clue}”`);
    if (held.length < 2) return { trip: t, lines: ["You have fewer than two slips to lay side by side."], free: true };
    return { trip: t, lines: [`Which two? Name them, or give their numbers. Your slips: ${held.join(" ")}`], free: true };
  }
  const [a, b] = pair;
  const th = quietThrow(`lay:${seed}`, statOf(m.sheet, "wits"));
  const works = th.tier === "success" || th.tier === "crit_success";
  const r = layTogether(t.book, cluesOf(t), a, b, works);
  const trip = { ...t, book: r.book };
  if (r.torn) {
    const truth = r.truth ? clueOf(t, r.truth) : undefined;
    const got = truth ? gotLines(trip, truth, "seen") : { trip, lines: [] };
    return { trip: got.trip, lines: [`You lay the two slips side by side (a ${th.natural}, and your Wits). One of them cannot be true: I tear it in half.`, ...got.lines] };
  }
  if (r.proved) return { trip, lines: [`You lay the two slips side by side (a ${th.natural}, and your Wits). They agree: both are pinned, proved.`] };
  return { trip, lines: [`You lay the two slips side by side (a ${th.natural}, and your Wits). ${works ? "They have nothing to say to each other." : "You cannot make them fit, or make them fight."}`] };
}

/** Time spent in the story (docs/MOONSHOT.md, 5.2): a wait, a watch, a follow, getting ready, or a long stretch. */
function timeSpent(t: Trip, line: string, m: Moment, seed: string): Heard {
  const tr = timeRead(line, t.sheet.hour);
  if (!tr) return null;
  const hours = timeTaken(tr, t.sheet.hour);
  const from = t.sheet.hour;
  let trip: Trip = clockTo(t, from + hours);
  const lines: string[] = [];
  if (tr.act === "wait") lines.push(tr.until !== undefined ? `You wait until ${hourSaid(tr.until)}.` : "You wait an hour.");
  else if (tr.act === "watch") lines.push("You watch, and keep still.");
  else if (tr.act === "follow") lines.push("You follow, at a distance.");
  else if (tr.act === "prepare") lines.push("You get ready. The next try here has it in its favour.");
  else lines.push(`It takes ${hours >= 24 ? `${Math.round(hours / 24)} day${hours >= 48 ? "s" : ""}` : `${Math.round(hours)} hours`}.`);
  // Watching a place: what happens there while you watch is yours to know from now on.
  if (tr.act === "watch" && trip.schedule) {
    const here = m.stop.id;
    const seen = trip.schedule.appointments.filter((a) => a.where === here && a.at > from && a.at <= from + hours + 2);
    for (const a of seen) trip = { ...trip, schedule: learn(trip.schedule!, a.id) };
  }
  // Preparing: a mark you can lean on once here, for the way the line names, or else the first way open here.
  if (tr.act === "prepare" && trip.facing) {
    const named = wayInLine(line);
    const way: Way = named && m.stop.ways[named] ? named : ((["sneak", "force", "talk", "pay"] as Way[]).find((w) => m.stop.ways[w]) ?? "sneak");
    const lever = { id: `ready:${m.stop.id}:${trip.marks.length}`, name: "what you got ready", way, edge: true };
    trip = { ...trip, facing: { ...trip.facing, moment: { ...trip.facing.moment, stop: { ...trip.facing.moment.stop, levers: [...trip.facing.moment.stop.levers, lever] } } } };
    lines[0] = `${lines[0]} (A mark: ${lever.name}, for ${way}.)`;
  }
  // A long stretch spent on a project of yours: one throw fills it, or brings trouble.
  const open = (trip.projects ?? []).find((p) => p.filled < p.segments && touches(line, p.goal));
  if (tr.act === "stretch" && open) {
    const best = (["brawn", "grace", "charm", "guile", "wits", "sense"] as const).reduce((a, b) => (statOf(m.sheet, b) > statOf(m.sheet, a) ? b : a));
    const th = quietThrow(`project:${seed}`, statOf(m.sheet, best));
    const need = open.needs.findIndex((n) => !n.done);
    const w = workOn(open, th.tier, Math.max(0, need), seed);
    trip = { ...trip, projects: (trip.projects ?? []).map((p) => (p.id === open.id ? w.project : p)) };
    lines.push(`You work at it (a ${th.natural}). ${TIER_SAID[th.tier]} ${w.project.filled} of ${w.project.segments}.${w.complication ? ` And now ${complicationSaid(w.complication)}.` : ""}${w.done ? " It is done." : ""}`);
    if (w.done) {
      const d = projectDone(trip, w.project, m);
      trip = d.trip;
      lines.push(...d.lines);
    }
  }
  if (!(tr.act === "wait" && tr.until !== undefined)) lines[0] = `${lines[0]} It is now ${hourSaid(from + hours)}.`;
  const c = worldClock(trip, from, from + hours);
  return { trip: c.trip, lines: [...lines, ...c.lines], hours };
}

/** Words said to the person here (docs/LOOP.md, 3): heard, felt, and answered with what code released. */
function spokenTo(t: Trip, line: string, m: Moment, p: Person, seed: string): Heard {
  const visit = t.visits?.[m.stop.id] ?? newVisit(p.id);
  if (visit.ended) return { trip: t, lines: [`${p.name} has had enough of you for now.`], note: `${p.name} will not talk any more this visit.` };
  // A lie (docs/MOONSHOT.md, 3.3): a throw behind the narrator's hand, your Guile against their Sense. You are not told how it went.
  const lying = LIE.test(line);
  const lie = lying ? lieTo(p, statOf(m.sheet, "guile"), seed) : null;
  // A line they answer with something you do not have yet does not use their patience (people.ts, hearLine).
  const answers = released(p).some((id) => !(t.book?.slips ?? []).some((x) => x.clue === id));
  const h = hearLine(lie ? lie.person : p, visit, rulesLine(line, p, lying), answers);
  let trip: Trip = { ...t, people: { ...(t.people ?? {}), [p.id]: h.person }, visits: { ...(t.visits ?? {}), [m.stop.id]: h.visit } };
  // Their feeling counts in talking them round: the change goes into the warmth of the moment too.
  if (h.moved && trip.facing) trip = { ...trip, facing: { ...trip.facing, moment: { ...trip.facing.moment, warm: (trip.facing.moment.warm ?? 0) + h.moved } } };
  const lines: string[] = [];
  if (lie) lines.push("I throw a die behind my hand, and look at it, and do not tell you what it shows.");
  if (h.moved > 0) lines.push(`${p.name} warms to you: ${ATTITUDE_SAID[h.person.attitude]}.`);
  if (h.moved < 0) lines.push(`${p.name} cools: ${ATTITUDE_SAID[h.person.attitude]}.`);
  // What they will tell you now: only what code released (the lie among it, if they lie).
  // Believed, a lie opens them a step further, this once; seen through, they play along and tell you nothing new.
  const facts = lie && !lie.believed ? [] : released(lie?.believed ? { ...h.person, attitude: stepUp(h.person.attitude) } : h.person);
  const got = gotAll(trip, facts.map((id) => clueOf(trip, id)).filter((c): c is Clue => !!c).map((c) => ({ c, how: "heard" as const, hunch: !!h.person.lie && h.person.lie.clue === c.id && statOf(m.sheet, "sense") >= h.person.lie.skill })));
  trip = got.trip;
  lines.push(...got.lines);
  if (h.visit.ended) lines.push(`${p.name} has had enough: that was the last of their patience for now.`);
  const said = facts.map((id) => clueOf(trip, id)?.text).filter((x): x is string => !!x);
  return { trip, lines, ...(got.inked ? { inked: got.inked } : {}), note: personNote(h.person, said) };
}

/** What the narrator is told of the person, for its answer. */
export function personNote(p: Person, facts: readonly string[]): string {
  return `${p.name} ${ATTITUDE_SAID[p.attitude]}.${p.voice ? ` Speaks: ${p.voice}.` : ""}${p.wants ? ` Wants: ${p.wants}.` : ""} ${facts.length ? `May say only these facts, and nothing else that matters: ${facts.join(" | ")}.` : "Has nothing to tell that matters, and says so in their own way."}${p.doubts ? " Has seen through the player's lie: plays along, believes nothing." : ""}`;
}

/**
 * You got past (or round) the place in your way: what it gives up. Anyone who can be seen there is seen; the person
 * there tells what they know one step further than their feeling would.
 */
export function worldPast(t: Trip, stop: RoadStop, past: boolean): Told {
  if (!past || !t.book) return { trip: t, lines: [] };
  const seen = cluesOf(t).filter((c) => c.from?.place === stop.id && !c.from?.person).map((c) => ({ c, how: "seen" as const }));
  const p = personAt(t, stop);
  const told = p ? released({ ...p, attitude: p.attitude === "close" ? "close" : (["hostile", "cold", "wary", "friendly", "close"] as Attitude[])[["hostile", "cold", "wary", "friendly", "close"].indexOf(p.attitude) + 1]! }).map((id) => clueOf(t, id)).filter((c): c is Clue => !!c).map((c) => ({ c, how: "heard" as const })) : [];
  return gotAll(t, [...seen, ...told]);
}

/**
 * Past a place (docs/MOONSHOT.md, 5.1: getting in the way changes it): what the other side meant to do there and has
 * not yet done will not happen now, and anything that needed it acts on that. Said, if you knew of it.
 */
export function worldStopped(t: Trip, stop: RoadStop): Told {
  if (!t.schedule) return { trip: t, lines: [] };
  const r = stoppedAt(t.schedule, stop.id);
  if (!r.stopped.length) return { trip: t, lines: [] };
  const known = r.stopped.filter((a) => t.schedule!.known.includes(a.id));
  const lines = known.length ? [`You got here first. What they meant to do here will not happen now: ${known.map((a) => a.what).join("; ")}. I scrape the notch from the candle.`] : [];
  return { trip: { ...t, schedule: r.schedule }, lines };
}

/** Words that say a line is a lie told to someone. */
const LIE = /\b(i lie|we lie|i'm lying|i am lying|we're lying|i pretend|we pretend|pretending|i bluff|bluffing|pose as|posing as|claim to be|i claim|i tell (him|her|them) (we're|we are|i'm|i am) from)\b/i;

/** Words that lay two slips together. */
const COMPARE = /\b(compare|comparing|side by side|lay (.+ )?(together|next to|beside|against)|hold (.+ )?(up )?against|check (.+ )?against|doesn't add up|does not add up|don't add up|contradict|both can't be true|can't both be true|which (one )?is (true|lying)|don't match|do not match|match (them|it) up)\b/i;

/** The two slips a line lays together: by number ("1 and 3"), or by their words, split where the line joins them. */
function twoSlips(line: string, t: Trip): [string, string] | null {
  if (!t.book) return null;
  const held = t.book.slips.filter((s) => s.state !== "torn");
  const nums = [...line.matchAll(/\b(?:slip\s*)?#?(\d{1,2})\b/gi)].map((x) => Number(x[1]) - 1).filter((i) => i >= 0 && i < held.length);
  if (nums.length >= 2 && nums[0] !== nums[1]) return [held[nums[0]!]!.clue, held[nums[1]!]!.clue];
  for (const cut of [/\bagainst\b/i, /\bwith\b/i, /\bversus\b|\bvs\.?\b/i, /\bto\b/i, /\band\b/i, /[,;]/]) {
    const parts = line.split(cut);
    if (parts.length < 2) continue;
    const a = slipNamed(parts[0]!, t.book, cluesOf(t));
    const b = slipNamed(parts.slice(1).join(" "), t.book, cluesOf(t));
    if (a && b && a !== b) return [a, b];
  }
  return null;
}

/** Words of a want or a goal that say a line is about it: its longer words, without the small ones. */
const SMALL_WORDS = new Set(["their", "there", "with", "from", "that", "this", "them", "they", "have", "want", "wants", "back", "before", "after", "into", "over", "your", "what", "when", "will", "would", "some", "just", "more"]);
const aboutWords = (s: string): string[] => (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !SMALL_WORDS.has(w));
const WORK = /\b(work on|working on|work at|spend (the |an |a |some )?(time|hour|hours|afternoon|morning|evening|night|day|stretch|while)|put (in )?(time|work|an hour|the hours) (in|into|on)|get on with|do (her|his|their|the) (favou?r|job)|do what (she|he|they) (asked|wanted|needs?)|(her|his|their) favou?r|the favou?r)\b/i;

/**
 * A line that works on a project of yours: what someone asked of you (said in its words, or as doing them a favour), or
 * a goal of your own (named in its words, or as working on it). The open project it works on, or null.
 */
export function workedOn(t: Trip, line: string, here?: string): Project | null {
  const open = (t.projects ?? []).filter((p) => p.filled < p.segments);
  if (!open.length) return null;
  const l = line.toLowerCase();
  // A word counts by its stem, so "breakfast" works a goal about "breakfasts".
  const hits = (p: Project): number => aboutWords(p.goal).filter((w) => l.includes(w.length > 5 ? w.slice(0, w.length - 2) : w)).length;
  const work = WORK.test(line);
  const score = (p: Project): number => {
    const n = hits(p);
    if (!p.id.startsWith("favour:")) return n >= 2 || (n >= 1 && work) ? n + (work ? 1 : 0) : 0;
    // A favour: by its own words, or by doing it for them (named, or there in front of you).
    const who = p.id.slice("favour:".length);
    const stop = t.adv.stops.find((s) => s.person?.id === who);
    const person = stop ? personAt(t, stop) : null;
    const named = !!person && person.name.toLowerCase().split(/[\s'’]+/).some((w) => w.length >= 4 && l.includes(w));
    const near = named || (!!stop && stop.id === here);
    return n >= 2 || (n >= 1 && (near || work)) || (work && near) ? n + (work ? 1 : 0) + (near ? 1 : 0) : 0;
  };
  const best = open.map((p) => ({ p, n: score(p) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)[0];
  if (best) return best.p;
  // "I work on my goal" with only one goal of your own open: that one.
  const mine = open.filter((p) => !p.id.startsWith("favour:"));
  if (mine.length === 1 && /\b(work on|working on|spend .* on) (my|the|our) (goal|project|plan|dream)\b/i.test(line)) return mine[0]!;
  return null;
}

/** How long a stretch of work on a project takes, by the line or the step it is on. */
function workHours(line: string, p: Project, now: number): number {
  const tr = timeRead(line, now);
  if (tr?.act === "stretch") return Math.min(tr.hours ?? 2, 12);
  if (tr?.act === "wait" && tr.until !== undefined) return Math.max(0.5, tr.until - now);
  const named = /\b(an|one) hour\b/i.test(line) ? 1 : /\b(two|2) hours\b/i.test(line) ? 2 : /\b(three|3) hours\b/i.test(line) ? 3 : /\b(afternoon|morning|evening)\b/i.test(line) ? 4 : /\b(day|night)\b/i.test(line) ? 8 : 0;
  if (named) return named;
  if (p.id.startsWith("favour:")) return 1;
  const need = p.needs.find((n) => !n.done);
  return need?.how === "stretch" ? Math.min(need.hours ?? 2, 6) : 2;
}

/**
 * A stretch of work on a project: one throw on your best stat fills it (or brings a complication, never a dead end),
 * it takes the story's time, and the other side uses that time. A favour done pays at once: the person is close, and
 * tells you everything.
 */
function workIt(t: Trip, line: string, m: Moment, open: Project, seed: string): Told & { hours: number } {
  const hours = workHours(line, open, t.sheet.hour);
  const from = t.sheet.hour;
  let trip: Trip = clockTo(t, from + hours);
  const best = (["brawn", "grace", "charm", "guile", "wits", "sense"] as const).reduce((a, b) => (statOf(m.sheet, b) > statOf(m.sheet, a) ? b : a));
  const th = quietThrow(`project:${seed}:${open.id}:${open.filled}`, statOf(m.sheet, best));
  const need = open.needs.findIndex((n) => !n.done);
  const w = workOn(open, th.tier, Math.max(0, need), seed);
  trip = { ...trip, projects: (trip.projects ?? []).map((p) => (p.id === open.id ? w.project : p)) };
  const what = open.id.startsWith("favour:") ? `what was asked of you (${open.goal})` : open.goal;
  const lines = [`You spend ${hours === 1 ? "an hour" : hours < 1 ? "half an hour" : `${hours} hours`} on ${what} (a ${th.natural}, and your ${statName(best)}). ${TIER_SAID[th.tier]} ${w.project.filled} of ${w.project.segments}.${w.complication ? ` And now ${complicationSaid(w.complication)}.` : ""}${w.done ? " It is done." : ""} It is now ${hourSaid(from + hours)}.`];
  let inked: string[] = [];
  if (w.done) {
    const d = projectDone(trip, w.project, m);
    trip = d.trip;
    lines.push(...d.lines);
    inked = d.inked ?? [];
  }
  const c = worldClock(trip, from, from + hours);
  return { trip: c.trip, lines: [...lines, ...c.lines], hours, ...(inked.length ? { inked } : {}) };
}

/** The stat a player handed a try is best at, of those the way can be tried with (docs/MOONSHOT.md, 4.3). */
export function handStat(f: Fellow, way: Way, attack?: readonly Stat[]): Stat {
  const allowed = (way === "force" && attack?.length ? [...attack] : WAY_STATS[way]).filter((s) => s !== "power" || typeof f.stats.power === "number");
  return allowed.reduce((a, b) => (statOf(f, b) > statOf(f, a) ? b : a));
}
const stepUp = (a: Attitude): Attitude => (["hostile", "cold", "wary", "friendly", "close"] as Attitude[])[Math.min(4, ["hostile", "cold", "wary", "friendly", "close"].indexOf(a) + 1)]!;

const COMPLICATION_SAID: Record<string, string> = { rival: "a rival sets up against you", debt: "you owe someone", law: "the law takes an interest", turns: "the thing turns on you", hunger: "it costs more than you have", notice: "the other side hears of it" };
const complicationSaid = (c: string): string => COMPLICATION_SAID[c] ?? c;

/** Whether a line is about a goal, by the goal's longer words. */
function touches(line: string, goal: string): boolean {
  const l = line.toLowerCase();
  return (goal.toLowerCase().match(/[a-z]{5,}/g) ?? []).some((w) => l.includes(w));
}

/** Who at the table speaks after a line, if anyone, and what code chose for them to say. */
export interface FellowSays {
  trip: Trip;
  fellow: Fellow;
  said: Said;
}

/**
 * The other players (docs/MOONSHOT.md, 4): after your line, at most one of them speaks, the keenest, and only if keen
 * enough; everyone when you ask the table. Code chooses what they say; a model words it in their voice.
 */
export function worldFellows(t: Trip, line: string, m: Moment, way?: Way): FellowSays[] {
  const fellows = t.fellows ?? [];
  if (!fellows.length) return [];
  const turn = (t.turn ?? 0) + 1;
  const asked = asksTable(line);
  const mo = { turn, text: `${m.stop.situation} ${line}`, ...(way ? { way } : {}), asked, big: !!(m.stop as RoadStop).climax && turn % 3 === 0, bold: /\b(charge|all out|recklessly|kick the door)\b/i.test(line), seed: t.seed };
  const ids = spotlight(fellows, mo, m.stop.id).slice(0, asked ? 3 : 1);
  let trip: Trip = { ...t, turn };
  const out: FellowSays[] = [];
  const places = scoutable(t);
  for (const id of ids) {
    const f = trip.fellows!.find((x) => x.id === id)!;
    const said = whatTheySay(f, mo, { notices: m.stop.notices ?? [], yours: trip.noticed ?? [], places });
    trip = { ...trip, fellows: trip.fellows!.map((x) => (x.id === id ? spoke(x, turn) : x)), ...(said.notice ? { noticed: [...(trip.noticed ?? []), said.notice.id] } : {}) };
    out.push({ trip, fellow: f, said });
  }
  // Each later entry carries the trip after all who spoke before it; the last is the trip after everyone.
  return out.map((x) => ({ ...x, trip }));
}

/**
 * Places on the map worth sending a player to: inked or on the road, not yet been to, and with something there to find
 * that you do not hold yet (a thing to be seen, or what the person there would tell). A place with nothing to find is
 * never suggested, so a scout sent where the table said comes back with something.
 */
export function scoutable(t: Trip): string[] {
  const held = new Set((t.book?.slips ?? []).map((s) => s.clue));
  const out: string[] = [];
  for (const mapped of new Set([...(t.book?.mapped ?? []), ...t.adv.stops.map((s) => s.id)])) {
    const place = t.adv.places.find((p) => p.name === mapped || p.id === mapped);
    const id = place?.id ?? mapped;
    if (t.visited.includes(id) || id === t.adv.start || id === t.at) continue;
    const stop = t.adv.stops.find((s) => s.id === id);
    const there = stop ? personAt(t, stop) : null;
    const found = cluesOf(t).some((c) => c.from?.place === id && !c.from?.person && !held.has(c.id)) || (!!there && released(there).some((c) => !held.has(c)));
    const name = place?.name ?? mapped;
    if (found && !out.includes(name)) out.push(name);
  }
  return out;
}

/** A fellow player's words with no model to voice them. */
export function fellowSaid(f: Fellow, s: Said): string {
  switch (s.kind) {
    case "notice":
      return `${f.name} leans in: “Look. ${name(s.fact)}”`;
    case "refuse":
      return `${f.name} shakes their head: they ${s.fact}.`;
    case "advise":
      return `${f.name}, low: “${name(s.fact)}.”`;
    case "offer":
      return `${f.name} ${s.fact}.`;
    case "alone":
      return `${f.name} ${s.fact}.`;
    default:
      return `${f.name} ${s.fact}.`;
  }
}

/** A stat's name as the table says it: the seventh by the name its world gives it. */
const statName = (s: Stat, power?: string): string => (s === "power" ? power ?? "power" : name(s));

/** The best way for you to go about it, by your strongest stat. */
function yourWay(m: Moment): Way {
  const open = WAYS.filter((w) => !shut(m, w));
  const score = (w: Way): number => Math.max(...WAY_STATS[w].map((s) => statOf(m.sheet, s)));
  return (open.length ? open : [...WAYS]).reduce((a, b) => (score(b) > score(a) ? b : a));
}

/** The ways said aloud. */
const WAY_SAID: Record<Way, string> = { talk: "talk your way through", sneak: "go quietly", force: "go in hard", pay: "buy your way" };
const WAY_SHORT: Record<Way, string> = { talk: "talking", sneak: "going quietly", force: "going in hard", pay: "paying" };
const WAY_WORDS: Record<Way, RegExp> = {
  talk: /\b(talk|talking|words|persuade|charm)\b/i,
  sneak: /\b(sneak|quiet|quietly|creep|hide|stealth)\b/i,
  force: /\b(force|fight|hard|attack|storm|charge|break)\b/i,
  pay: /\b(pay|bribe|buy|coin|gold)\b/i,
};
const wayInLine = (line: string): Way | null => WAYS.find((w) => WAY_WORDS[w].test(line)) ?? null;

/** The players still at your side (not off on their own). */
const withYou = (t: Trip): Fellow[] => (t.fellows ?? []).filter((f) => !f.at);

/**
 * Talk it over (docs/MOONSHOT.md, 4.4): before a big move, each player at your side says which way they would go.
 * Kept, so what you then do counts with them (4.5).
 */
export function talkOver(t: Trip): Told {
  const m = t.facing?.moment;
  const here = withYou(t);
  if (!m || !here.length || t.proposals?.stop === m.stop.id) return { trip: t, lines: [] };
  const open = WAYS.filter((w) => !shut(m, w));
  const list = talkItOver(here, open);
  const said = list.map((x) => `${here.find((f) => f.id === x.id)!.name} would ${WAY_SAID[x.way]}.`);
  return { trip: { ...t, proposals: { stop: m.stop.id, list } }, lines: [`I sit back from the map. “Talk it over.” ${said.join(" ")} You decide, or put it to a vote.`] };
}

/**
 * What you did, as the table sees it (4.5): go a player's way and the count of times overruled starts again (and when
 * it was desperate, they feel backed); go another way and they are overruled, three times running and they go cold.
 * The player you handed a try to is trusted with it.
 */
export function worldTried(t: Trip, way: Way, o: { handed?: string; desperate?: boolean } = {}): Told {
  let fellows = t.fellows ?? [];
  const lines: string[] = [];
  if (o.handed) fellows = fellows.map((f) => (f.id === o.handed ? feel(f, "followed") : f));
  const p = t.proposals;
  if (p && t.facing && p.stop === t.facing.stop.id && !p.decided) {
    fellows = fellows.map((f) => {
      const said = p.list.find((x) => x.id === f.id);
      if (!said || f.id === o.handed) return f;
      const g = feel(f, said.way === way ? (o.desperate ? "backed" : "followed") : "overruled");
      if (attitudeIndex(g.attitude) < attitudeIndex(f.attitude)) lines.push(`${f.name} goes quiet. Overruled again, and it shows: ${f.name} has gone cool on you.`);
      if (attitudeIndex(g.attitude) > attitudeIndex(f.attitude)) lines.push(`${f.name} catches your eye: you went their way when it cost you. They will remember it.`);
      return g;
    });
    return { trip: { ...t, fellows, proposals: { ...p, decided: way } }, lines };
  }
  return { trip: { ...t, fellows }, lines };
}

/** A try handed to a player (4.3), said. */
export function handSaid(f: Fellow, stat: Stat): string {
  return `You hand it to ${f.name}: this try is thrown on their ${statName(stat, f.powerName)}, and what comes of it is yours to deal with.`;
}

/** Players who were off on their own come back, with what they saw there: its clues, as heard. */
export function rejoin(t: Trip, ids: readonly string[]): Told {
  let trip = t;
  const lines: string[] = [];
  for (const id of ids) {
    const f = (trip.fellows ?? []).find((x) => x.id === id);
    if (!f?.at) continue;
    const at = f.at;
    trip = { ...trip, fellows: trip.fellows!.map((x) => (x.id === id ? withoutAt(x) : x)) };
    const seen = cluesOf(trip).filter((c) => c.from?.place === at && !c.from?.person);
    // And what the person there would tell anyone who asked, as they feel now.
    const stop = trip.adv.stops.find((s) => s.id === at);
    const there = stop ? personAt(trip, stop) : null;
    const asked = there ? released(there).map((id) => clueOf(trip, id)).filter((c): c is Clue => !!c) : [];
    const g = gotAll(trip, [...seen, ...asked].map((c) => ({ c, how: "heard" as const })));
    trip = g.trip;
    lines.push(`${f.name} is back from ${placeName(trip.adv, at)}${g.lines.length ? ", and tells you what they saw there." : ", with nothing new."}`, ...g.lines);
  }
  return { trip, lines };
}
const withoutAt = (f: Fellow): Fellow => {
  const { at: _gone, ...rest } = f;
  return rest;
};

/** How long it takes to call everyone back together, in hours. */
const REGROUP_HOURS = 0.5;

const SPLIT = /\b(go|goes|head|keep watch|watch|wait|stay|scout|check|stake out|take)\b/i;
const REGROUP = /\b(regroup|come back|rejoin|meet back|everyone back|back together|join (me|us))\b/i;
const VOTE = /\b(let's vote|we vote|put it to a vote|vote on it|show of hands|we should vote)\b/i;

/**
 * The table, read from a line (4): a player sent off to a place on the map, everyone called back, or a vote. Null when
 * the line is none of these.
 */
export function tableLine(t: Trip, line: string, m: Moment): (Told & { hours?: number }) | null {
  const fellows = t.fellows ?? [];
  if (!fellows.length) return null;
  const l = line.toLowerCase();
  if (REGROUP.test(line) && fellows.some((f) => f.at)) {
    // Word has to reach them, and they have to come back: half an hour, and the other side's clock runs meanwhile.
    const from = t.sheet.hour;
    const r = rejoin(clockTo(t, from + REGROUP_HOURS), fellows.filter((f) => f.at).map((f) => f.id));
    const c = worldClock(r.trip, from, from + REGROUP_HOURS);
    return { trip: c.trip, lines: [`You send word, and the table comes back together. That takes half an hour: it is now ${hourSaid(from + REGROUP_HOURS)}.`, ...r.lines, ...c.lines], ...(r.inked ? { inked: r.inked } : {}), hours: REGROUP_HOURS };
  }
  if (asksTable(line) && !VOTE.test(line) && withYou(t).length) {
    const o = talkOver({ ...t, proposals: undefined });
    if (o.lines.length) return { ...o, free: true };
  }
  if (VOTE.test(line)) {
    const here = withYou(t);
    if (!here.length) return null;
    const open = WAYS.filter((w) => !shut(m, w));
    const theirs = t.proposals?.stop === m.stop.id ? t.proposals.list.filter((x) => here.some((f) => f.id === x.id)) : talkItOver(here, open);
    const yours = wayInLine(line) ?? yourWay(m);
    const won = vote(yours, theirs);
    const hands = [`you for ${WAY_SHORT[yours]}`, ...theirs.map((x) => `${here.find((f) => f.id === x.id)!.name} for ${WAY_SHORT[x.way]}`)];
    // A plan the whole table agreed on is an edge, once, for the way it chose.
    const lever = { id: `agreed:${m.stop.id}`, name: "the plan you all agreed on", way: won, edge: true };
    let trip: Trip = { ...t, proposals: { stop: m.stop.id, list: theirs, decided: won } };
    if (trip.facing && !trip.facing.moment.stop.levers.some((x) => x.id === lever.id)) {
      const f = trip.facing;
      trip = { ...trip, facing: { ...f, moment: { ...f.moment, stop: { ...f.moment.stop, levers: [...f.moment.stop.levers, lever] } } } };
    }
    return { trip, lines: [`Hands go up: ${hands.join(", ")}. The table goes with ${WAY_SHORT[won]}. (A mark: ${lever.name}, for ${won}.)`], free: true };
  }
  // Splitting up: a player named, a place on the map named, and a word for going there.
  const who = fellows.find((f) => new RegExp(`\\b${f.name.toLowerCase().split(/\s+/)[0]}\\b`).test(l));
  if (who && !who.at && SPLIT.test(line)) {
    // A place on the road is on the map before you; any other has to be inked first.
    const known = (p: { id: string; name: string }): boolean => !t.book || t.book.mapped.includes(p.name) || t.book.mapped.includes(p.id) || t.visited.includes(p.id) || t.adv.stops.some((s) => s.id === p.id);
    const place = t.adv.places.find((p) => p.id !== m.stop.id && p.id !== t.adv.start && (l.includes(p.name.toLowerCase()) || new RegExp(`\\b${p.id.toLowerCase()}\\b`).test(l)) && known(p));
    if (place) {
      if (who.attitude === "hostile" || who.attitude === "cold") return { trip: t, lines: [`${who.name} folds their arms: not for you, not tonight.`], free: true };
      const trip = { ...t, fellows: fellows.map((f) => (f.id === who.id ? { ...f, at: place.id } : f)) };
      return { trip, lines: [`${who.name} goes off to ${place.name} on their own. When something happens there, I will cut to them, and they will bring back what they find.`], free: true };
    }
  }
  return null;
}

const PRESS = /\b(press (him|her|them|harder|again|on (it|that))|i press|keep pressing|lean on|lean hard|push (him|her|them|harder)|make (him|her|them) talk|intimidate|i insist|tell me everything|you're hiding|you are hiding|what (aren't|are not|else aren't) you telling|what else (do you know|are you hiding))\b/i;
const READ = /\b(read (him|her|them)|read (his|her|their) face|(is|was|are|were) (he|she|they|[a-z]+) lying|are you lying|lying (to me )?about|lied (to me|about)|telling (me )?the truth|is (that|it|this) true|do i believe (him|her|them)|can i trust (him|her|them|that)|(study|search|watch) (his|her|their) face)\b/i;
const FAVOUR = /\b(what can i do for you|what do you need|what do you want from me|can i help you|i('ll| will) help you|do you a favou?r|owe you one|a favou?r)\b/i;

/**
 * What you do to the person here beyond talking (docs/LOOP.md, 3.3 to 3.5): press them for what they hold back (a throw
 * against their resolve: Brawn to frighten, Charm or Guile otherwise), read whether the last thing they told you was
 * true (Sense against their skill at lying), or ask what they need (a favour: a project of four, and once it is done
 * they would do a great deal for you). Null when the line is none of these.
 */
export function personActs(t: Trip, line: string, m: Moment, p: Person, seed: string): Told | null {
  const visit = t.visits?.[m.stop.id] ?? newVisit(p.id);
  // Done with you for this visit: pressing, reading or asking them is no try at the place, and is not read as one.
  if (visit.ended) return PRESS.test(line) || READ.test(line) || FAVOUR.test(line) ? { trip: t, lines: [`${p.name} has had enough of you for now. Pressing them again will get you nothing here.`], note: `${p.name} will not talk any more this visit.` } : null;
  const set = (trip: Trip, person: Person, v = visit): Trip => {
    const moved = attitudeIndex(person.attitude) - attitudeIndex(p.attitude);
    let out: Trip = { ...trip, people: { ...(trip.people ?? {}), [p.id]: person }, visits: { ...(trip.visits ?? {}), [m.stop.id]: v } };
    if (moved && out.facing) out = { ...out, facing: { ...out.facing, moment: { ...out.facing.moment, warm: (out.facing.moment.warm ?? 0) + moved } } };
    return out;
  };
  if (PRESS.test(line)) {
    const frightened = lineKind(line) === "threat" || /\b(intimidate|lean on|lean hard|loom|or else)\b/i.test(line);
    const stat: Stat = frightened ? "brawn" : statOf(m.sheet, "guile") > statOf(m.sheet, "charm") ? "guile" : "charm";
    const th = quietThrow(`press:${seed}`, statOf(m.sheet, stat), TARGETS[pressDifficulty(p)]);
    const head = `You press ${p.name} (a ${th.natural}, and your ${statName(stat)}).`;
    if (th.tier === "fail" || th.tier === "crit_fail") {
      const person = { ...p, attitude: moveAttitude(p.attitude, th.tier === "crit_fail" ? -2 : -1) };
      // A press that fails tries their patience like any line that gets nowhere: past it, they end the visit.
      const v = { ...visit, heard: visit.heard + 1, ended: visit.ended || th.tier === "crit_fail" || visit.heard + 1 >= PATIENCE[person.attitude] };
      return { trip: set(t, person, v), lines: [`${head} ${p.name} closes up: ${ATTITUDE_SAID[person.attitude]}.${v.ended ? ` ${p.name} has had enough of you for now.` : ""}`], note: personNote(person, []) };
    }
    const r = pressed(p, frightened);
    const person = th.tier === "partial" ? { ...r.person, attitude: moveAttitude(r.person.attitude, -1) } : r.person;
    const clue = r.clue ? clueOf(t, r.clue) : undefined;
    const got = clue ? gotLines(set(t, person), clue, "heard") : { trip: set(t, person), lines: [] as string[] };
    const cost = attitudeIndex(person.attitude) < attitudeIndex(p.attitude) ? ` It costs you: ${p.name} ${ATTITUDE_SAID[person.attitude]}.` : "";
    return { ...got, lines: [`${head} ${clue ? `${p.name} gives it up.` : `${p.name} has nothing more to give.`}${cost}`, ...got.lines], note: personNote(person, clue ? [clue.text] : []) };
  }
  if (READ.test(line)) {
    const theirs = new Set([...p.knows.map((k) => k.clue), ...(p.lie ? [p.lie.clue] : [])]);
    // The thing you name ("is he lying about the river?"), or else the last thing they told you.
    const named = t.book ? slipNamed(line, t.book, cluesOf(t)) : null;
    // What someone else told you: their face is not here to read. Laid beside another slip, it can still be caught out.
    const by = named && !theirs.has(named) ? clueOf(t, named)?.from?.person : undefined;
    const teller = by ? t.adv.stops.map((s) => personAt(t, s)).find((x) => x?.id === by) : null;
    if (teller && named && /\b(lying|lie|lied|truth|true|trust|believe)\b/i.test(line)) return { trip: t, lines: [`${teller.name} told you that, and ${teller.name} is not here: there is no face to read. Lay that slip beside another one, and see if they can both be true.`], free: true };
    const last =(named && theirs.has(named) ? t.book!.slips.find((s) => s.clue === named) : undefined) ?? [...(t.book?.slips ?? [])].reverse().find((s) => theirs.has(s.clue));
    if (!last) return { trip: t, lines: [`${p.name} has told you nothing yet to weigh.`] };
    const key = `read:${last.clue}`;
    if (visit.counted.includes(key)) return { trip: t, lines: ["You have read them on that already. Their face will not tell you more."] };
    const r = readThem(p, last.clue, statOf(m.sheet, "sense"), `read:${seed}`);
    let trip = set(t, p, { ...visit, counted: [...visit.counted, key] });
    const head = `You watch ${p.name}'s face (a ${r.natural}, and your Sense):`;
    if (r.told === "false" && trip.book) {
      trip = { ...trip, book: doubt(trip.book, last.clue) };
      return { trip, lines: [`${head} that was a lie. I mark the slip.`] };
    }
    return { trip, lines: [`${head} ${r.told === "true" ? "that was the truth, as far as they know it." : "you cannot tell."}`] };
  }
  if (FAVOUR.test(line) && p.wants) {
    if (p.helped) return { trip: t, lines: [`${p.name} owes you already, and knows it.`] };
    const id = `favour:${p.id}`;
    const have = (t.projects ?? []).find((x) => x.id === id);
    if (have) return { trip: t, lines: [`What ${p.name} needs is still to be done: ${have.filled} of ${have.segments}.`] };
    const project: Project = { ...startProject(id, p.wants), segments: 4, payoff: ["people"] };
    return { trip: { ...t, projects: [...(t.projects ?? []), project] }, lines: [`${p.name} tells you what they need: ${p.wants}. I start a clock of 4 for it. Do it, and ${p.name} would do a great deal for you.`], note: `${personNote(p, [])} Tells the player plainly what they need: ${p.wants}.` };
  }
  return null;
}

/**
 * A project finished (docs/MOONSHOT.md, 7.5): it pays off as something the other rules use, kept for the stories after;
 * a favour done makes the person close, and they tell you everything.
 */
export function projectDone(t: Trip, p: Project, m: Moment): Told {
  let trip = t;
  const lines: string[] = [];
  if (p.id.startsWith("favour:")) {
    const who = p.id.slice("favour:".length);
    const stop = trip.adv.stops.find((s) => s.person?.id === who);
    const person = stop ? personAt(trip, stop) : null;
    if (person && stop) {
      const close = favourDone(person);
      trip = { ...trip, people: { ...(trip.people ?? {}), [who]: close } };
      lines.push(`${person.name} hears it is done. ${person.name} ${ATTITUDE_SAID.close}.`);
      // Told what they know at once, if you are with them; in the middle of a fight, it waits until you are past it.
      if (m.stop.id === stop.id && !(trip.facing?.stop.id === stop.id && trip.facing.contest)) {
        const g = gotAll(trip, released(close).map((id) => clueOf(trip, id)).filter((c): c is Clue => !!c).map((c) => ({ c, how: "heard" as const })));
        trip = g.trip;
        lines.push(...g.lines);
      }
    }
    return { trip, lines };
  }
  const pays = (p.payoff.length ? p.payoff : payoffOf(p.goal)).filter((x) => !(trip.payoffs ?? []).includes(x));
  if (!pays.length) return { trip, lines };
  trip = { ...trip, payoffs: [...(trip.payoffs ?? []), ...pays] };
  lines.push(`It pays off: ${pays.map((x) => PAYOFF_DOES[x]).join("; ")}.`);
  const now = payoffsNow(trip, pays);
  return { trip: now.trip, lines: [...lines, ...now.lines] };
}

/**
 * What payoffs do at once, and again at the start of every story after (7.5): income is a supply; a place is somewhere
 * people talk, so you overhear what the other side has planned; people (a faction, a crowd) start a step warmer.
 * A weapon waits for a fight, and a name for someone to talk to.
 */
export function payoffsNow(t: Trip, pays: readonly Payoff[]): Told {
  let trip = t;
  const lines: string[] = [];
  if (pays.includes("income")) {
    trip = { ...trip, sheet: { ...trip.sheet, supplies: trip.sheet.supplies + 1 } };
    lines.push("Your own business pays: a supply.");
  }
  if (pays.includes("place") && trip.schedule) {
    const s = trip.schedule;
    const unknown = s.appointments.find((a) => !s.known.includes(a.id) && !a.daily && !s.happened.some((h) => h.id === a.id));
    if (unknown) {
      trip = { ...trip, schedule: learn(s, unknown.id) };
      lines.push(`People talk at your place, and you overhear it: ${unknown.what}. I cut a notch in the candle: ${hourSaid(unknown.at)}, at ${placeName(trip.adv, unknown.where)}.`);
    }
  }
  if (pays.includes("people")) {
    const people: Record<string, Person> = { ...(trip.people ?? {}) };
    for (const s of trip.adv.stops) {
      const p = personAt(trip, s);
      if (p && attitudeIndex(p.attitude) < attitudeIndex("friendly")) people[p.id] = { ...p, attitude: moveAttitude(p.attitude, 1) };
    }
    trip = { ...trip, people };
    lines.push("Word gets round: people here start a step warmer toward you.");
  }
  return { trip, lines };
}
