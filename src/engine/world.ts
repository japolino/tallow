/**
 * The world around the road (docs/MOONSHOT.md): the people at a place and how they feel about you, the slips of what
 * you have found out and the map they ink, the other side's clock, your own projects, and the other players at the
 * table. Each has its own rules file; this one puts them together for a story and says, in a few plain lines, what
 * happened, so the director only has to call it at four points: when you begin, when you come to a place, when you
 * write a line that tries nothing, and when the clock runs.
 *
 * Pure: a trip in, a trip and some lines out. Every number is decided here, by code and a seeded die.
 */
import { placeName, type RoadStop, type Trip } from "./adventure.js";
import { getClue, keysKnown, layTogether, newCasebook, slipNamed, type Clue } from "./clues.js";
import { seededRng } from "./dice.js";
import { ATTITUDE_STEP, attitudeIndex, favourDone, hearLine, lieTo, lineKind, moveAttitude, newVisit, pressDifficulty, pressed, readThem, released, rulesLine, type Attitude, type Person } from "./people.js";
import { goalNamed, PAYOFF_DOES, payoffOf, projectSaid, startProject, workOn, type Payoff, type Project } from "./project.js";
import { doubt } from "./clues.js";
import { kitFight } from "./kit.js";
import { goingOn, hourSaid, learn, newSchedule, runClock, timeRead, timeTaken } from "./schedule.js";
import { feel, spoke, spotlight, talkItOver, vote, whatTheySay, type Fellow, type Said } from "./seats.js";
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
  return {
    ...t,
    ...(t.adv.clues?.length ? { book: t.book ?? newCasebook([t.adv.start]) } : {}),
    ...(t.adv.appointments?.length ? { schedule: t.schedule ?? newSchedule(t.adv.appointments, t.adv.appointments.filter((a) => a.daily).map((a) => a.id)) } : {}),
    ...(t.adv.fellows?.length ? { fellows: t.fellows ?? t.adv.fellows } : {}),
  };
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
}

/** Inking and notches: the lines for what getting a clue did. */
function gotLines(t: Trip, c: Clue, how: "heard" | "seen", hunch = false): Told {
  if (!t.book) return { trip: t, lines: [] };
  const g = getClue(t.book, c, how, hunch);
  if (g.again) return { trip: { ...t, book: g.book }, lines: [] };
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
export function worldArrive(t: Trip, stop: RoadStop): Told {
  let trip = t;
  const lines: string[] = [];
  const p = personAt(t, stop);
  if (p && trip.facing) {
    // Their feeling makes talking them round easier or harder for the whole visit (moment.ts reads it as warmth).
    const warm = -ATTITUDE_STEP[p.attitude];
    trip = { ...trip, visits: { ...(trip.visits ?? {}), [stop.id]: newVisit(p.id) }, facing: { ...trip.facing, moment: { ...trip.facing.moment, warm: (trip.facing.moment.warm ?? 0) + warm } } };
    lines.push(`${p.name} ${ATTITUDE_SAID[p.attitude]}.`);
  }
  if (trip.schedule) {
    for (const a of goingOn(trip.schedule, stop.id, trip.sheet.hour)) lines.push(`Right now, here: ${a.what}.`);
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
  return { trip, lines };
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

/**
 * A line that tries nothing at the place in your way (a question, a look round, a wait, a goal): read by the world
 * before the narrator answers. It may name a goal of your own, spend time, lay two slips together, or speak to the
 * person there. Null when the world has nothing to say about it and the narrator answers as before.
 */
export function worldLine(t: Trip, line: string, m: Moment): (Told & { hours?: number }) | null {
  const seed = `${t.seed}:${t.sheet.hour}:${line.length}`;
  // A goal of your own (docs/MOONSHOT.md, 7.5).
  const goal = goalNamed(line);
  if (goal) {
    const p = startProject(`project-${(t.projects?.length ?? 0) + 1}`, goal, undefined, "person");
    return { trip: { ...t, projects: [...(t.projects ?? []), p] }, lines: [`You set yourself a goal. ${projectSaid(p)}`] };
  }
  // Two slips laid side by side (docs/LOOP.md, 4.2): a throw on Wits.
  if (t.book && /\b(compare|lay .* (together|side by side)|doesn't add up|does not add up|contradict|both can't be true)\b/i.test(line)) {
    const parts = line.split(/\band\b|\bwith\b|\bagainst\b/i);
    const a = parts.length > 1 ? slipNamed(parts[0]!, t.book, cluesOf(t)) : null;
    const b = parts.length > 1 ? slipNamed(parts.slice(1).join(" "), t.book, cluesOf(t)) : null;
    if (a && b && a !== b) {
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
  }
  // The table: splitting up, coming back together, a vote (docs/MOONSHOT.md, 4).
  const table = tableLine(t, line, m);
  if (table) return table;
  // Pressing the person here, reading them, asking what they need (docs/LOOP.md, 3.3 to 3.5).
  const someone = personAt(t, m.stop as RoadStop);
  if (someone) {
    const acts = personActs(t, line, m, someone, seed);
    if (acts) return acts;
  }
  // Time (docs/MOONSHOT.md, 5.2).
  const tr = timeRead(line, t.sheet.hour);
  if (tr) {
    const hours = timeTaken(tr, t.sheet.hour);
    const from = t.sheet.hour;
    let trip: Trip = { ...t, sheet: { ...t.sheet, hour: from + hours } };
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
    // Preparing: a mark you can lean on once here.
    if (tr.act === "prepare" && trip.facing) {
      const way: Way = (["sneak", "force", "talk", "pay"] as Way[]).find((w) => m.stop.ways[w]) ?? "sneak";
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
    const c = worldClock(trip, from, from + hours);
    return { trip: c.trip, lines: [...lines, ...c.lines], hours };
  }
  // Something said to the person here (docs/LOOP.md, 3).
  const p = personAt(t, m.stop as RoadStop);
  if (p) {
    const visit = t.visits?.[m.stop.id] ?? newVisit(p.id);
    if (visit.ended) return { trip: t, lines: [`${p.name} has had enough of you for now.`], note: `${p.name} will not talk any more this visit.` };
    // A lie (docs/MOONSHOT.md, 3.3): a throw behind the narrator's hand, your Guile against their Sense. You are not told how it went.
    const lying = LIE.test(line);
    const lie = lying ? lieTo(p, statOf(m.sheet, "guile"), seed) : null;
    const h = hearLine(lie ? lie.person : p, visit, rulesLine(line, p, lying));
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
  // A look round a place: what is to be seen there by anyone who looks.
  if (t.book && /\b(look|search|examine|inspect|check|study|read)\b/i.test(line)) {
    const here = cluesOf(t).filter((c) => c.from?.place === m.stop.id && !c.from?.person);
    const g = gotAll(t, here.map((c) => ({ c, how: "seen" as const })));
    if (g.lines.length) return g;
  }
  return null;
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

/** Words that say a line is a lie told to someone. */
const LIE = /\b(i lie|we lie|lying|i pretend|we pretend|pretending|i bluff|bluffing|pose as|posing as|claim to be|i claim|i tell (him|her|them) (we're|we are|i'm|i am) from)\b/i;
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
  const asked = /\b(what do you (two|both|all|guys|think)|what do we do|any ideas|thoughts\?|what say you|talk it over)\b/i.test(line);
  const mo = { turn, text: `${m.stop.situation} ${line}`, ...(way ? { way } : {}), asked, big: !!(m.stop as RoadStop).climax && turn % 3 === 0, bold: /\b(charge|all out|recklessly|kick the door)\b/i.test(line), seed: t.seed };
  const ids = spotlight(fellows, mo, m.stop.id).slice(0, asked ? 3 : 1);
  let trip: Trip = { ...t, turn };
  const out: FellowSays[] = [];
  const places = (t.book?.mapped ?? []).filter((p) => !t.visited.includes(p) && p !== t.adv.start);
  for (const id of ids) {
    const f = trip.fellows!.find((x) => x.id === id)!;
    const said = whatTheySay(f, mo, { notices: m.stop.notices ?? [], yours: trip.noticed ?? [], places });
    trip = { ...trip, fellows: trip.fellows!.map((x) => (x.id === id ? spoke(x, turn) : x)), ...(said.notice ? { noticed: [...(trip.noticed ?? []), said.notice.id] } : {}) };
    out.push({ trip, fellow: f, said });
  }
  // Each later entry carries the trip after all who spoke before it; the last is the trip after everyone.
  return out.map((x) => ({ ...x, trip }));
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
export function handSaid(f: Fellow, way: Way): string {
  const stat = WAY_STATS[way].filter((s) => s !== "power" || typeof f.stats.power === "number").reduce((a, b) => (statOf(f, b) > statOf(f, a) ? b : a));
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
    const g = gotAll(trip, seen.map((c) => ({ c, how: "heard" as const })));
    trip = g.trip;
    lines.push(`${f.name} is back from ${placeName(trip.adv, at)}${g.lines.length ? ", and tells you what they saw there." : ", with nothing new."}`, ...g.lines);
  }
  return { trip, lines };
}
const withoutAt = (f: Fellow): Fellow => {
  const { at: _gone, ...rest } = f;
  return rest;
};

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
    const r = rejoin(t, fellows.filter((f) => f.at).map((f) => f.id));
    return { ...r, lines: ["You send word, and the table comes back together.", ...r.lines] };
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
    return { trip, lines: [`Hands go up: ${hands.join(", ")}. The table goes with ${WAY_SHORT[won]}. (A mark: ${lever.name}, for ${won}.)`] };
  }
  // Splitting up: a player named, a place on the map named, and a word for going there.
  const who = fellows.find((f) => new RegExp(`\\b${f.name.toLowerCase().split(/\s+/)[0]}\\b`).test(l));
  if (who && !who.at && SPLIT.test(line)) {
    const known = (p: { id: string; name: string }): boolean => !t.book || t.book.mapped.includes(p.name) || t.book.mapped.includes(p.id) || t.visited.includes(p.id);
    const place = t.adv.places.find((p) => p.id !== m.stop.id && p.id !== t.adv.start && (l.includes(p.name.toLowerCase()) || new RegExp(`\\b${p.id.toLowerCase()}\\b`).test(l)) && known(p));
    if (place) {
      if (who.attitude === "hostile" || who.attitude === "cold") return { trip: t, lines: [`${who.name} folds their arms: not for you, not tonight.`] };
      const trip = { ...t, fellows: fellows.map((f) => (f.id === who.id ? { ...f, at: place.id } : f)) };
      return { trip, lines: [`${who.name} goes off to ${place.name} on their own. When something happens there, I will cut to them.`] };
    }
  }
  return null;
}

const PRESS = /\b(press (him|her|them)|lean on|lean hard|push (him|her|them)|make (him|her|them) talk|intimidate|i insist|tell me everything|you're hiding|you are hiding|what (aren't|are not) you telling)\b/i;
const READ = /\b(read (him|her|them)|read (his|her|their) face|is (he|she|they) lying|are you lying|is (that|it) true|do i believe (him|her|them)|can i trust (him|her|them|that)|(study|search) (his|her|their) face)\b/i;
const FAVOUR = /\b(what can i do for you|what do you need|what do you want from me|can i help you|i('ll| will) help you|do you a favou?r|owe you one|a favou?r)\b/i;

/**
 * What you do to the person here beyond talking (docs/LOOP.md, 3.3 to 3.5): press them for what they hold back (a throw
 * against their resolve: Brawn to frighten, Charm or Guile otherwise), read whether the last thing they told you was
 * true (Sense against their skill at lying), or ask what they need (a favour: a project of four, and once it is done
 * they would do a great deal for you). Null when the line is none of these.
 */
export function personActs(t: Trip, line: string, m: Moment, p: Person, seed: string): Told | null {
  const visit = t.visits?.[m.stop.id] ?? newVisit(p.id);
  if (visit.ended) return null;
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
      const v = { ...visit, heard: visit.heard + 1, ended: visit.ended || th.tier === "crit_fail" };
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
    const last = (named && theirs.has(named) ? t.book!.slips.find((s) => s.clue === named) : undefined) ?? [...(t.book?.slips ?? [])].reverse().find((s) => theirs.has(s.clue));
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
      if (m.stop.id === stop.id) {
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
