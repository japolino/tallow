/**
 * The words code says about what a try can win that stays won (lasting.ts): the stake of an ask before a die is chosen,
 * what a spent die came to for it, a catch come due, someone gone, walking away, and the lines that tell a narrator or a
 * reader model what is now true. Every number said here is the engine's; a model only tells what it looks like.
 */
import type { Trip } from "./adventure.js";
import { comesTo, GRIP_MAX, sceneNow, type Priced, type Loss } from "./hand.js";
import { askComesTo, askOf, askSteps, ASK_STEPS, countsThrough, CATCH_COST, CATCH_GRIP, companyNow, lastingOf, samePerson, standingOf, STAYS_AT, WALK_GRIP, type AskSize, type Change, type Comrade, type Due, type SpentTry, type Walked } from "./lasting.js";
import { DIFFICULTY_NAME, span, statName } from "./tell.js";

const and = (xs: readonly (string | number)[]): string => (xs.length <= 1 ? String(xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const steps = (n: number): string => (n === 1 ? "1 step" : `${n} steps`);
const lossSaid = (l: Loss): string => (l.kind === "hours" ? span(l.amount) : `${l.amount} ${l.kind}`);
const stop = (s: string): string => s.replace(/[.!\s]+$/, "");

/** How big an ask is, said. */
export const SIZE_SAID: Record<AskSize, string> = { small: "a small ask", large: "a big ask", huge: "an outrageous ask" };

/** How someone stands with you, in a few words, or nothing for a stranger. */
export function standingSaid(n: number): string {
  return n <= -2 ? "set against you" : n === -1 ? "cold towards you" : n === 1 ? "warm towards you" : n >= 2 ? "bound to you" : "";
}

/* ------------------------------ what is true, for the models ------------------------------ */

/**
 * What tries have won that is still true, who goes with the player, and who has been set against them, as lines for a
 * narrator or a reader: told as true, in the story's words.
 */
export function truthsSaid(t: Pick<Trip, "hand">): string[] {
  const l = lastingOf(t.hand);
  const out: string[] = [];
  for (const c of l.changes) {
    const comrade = c.kind === "join" ? l.company.find((x) => x.change === c.id) : undefined;
    if (comrade?.gone) out.push(`${comrade.name} went with the player for a while, and has ${comrade.gone === "turned" ? "turned on them" : "left them"}: ${comrade.name} is not with the player now, whatever an earlier telling or the scene's own words say.`);
    else if (c.kind === "sour") out.push(`${c.who} is set against the player: ${stop(c.said)}.`);
    else out.push(`${c.form === "lesser" ? "Won, but only in part" : "Won"}, and still true: ${stop(c.said)}.${c.due !== null && c.catch ? ` It came with this, which has not come due yet: ${stop(c.catch)}.` : ""}`);
  }
  const people = Object.values(l.people).filter((p) => p.standing && !companyNow(t).some((c) => samePerson(c.name, p.name)));
  if (people.length) out.push(`How people stand with the player: ${people.map((p) => `${p.name}, ${standingSaid(p.standing).replace("you", "them")}`).join("; ")}.`);
  return out;
}

/**
 * Who goes with the player, for a narrator: themselves, by their own nature, and how they feel about the player now. One
 * who was the one in the player's way in the scene in play is told as no longer in it.
 */
export function companySaid(t: Pick<Trip, "hand"> & Partial<Pick<Trip, "adv">>): string[] {
  const person = t.adv ? sceneNow(t as Trip)?.person : undefined;
  return companyNow(t).map((c) => {
    const st = standingOf(t, c.name);
    const was = person && samePerson(person.name, c.name) ? " They were the one in the player's way in this scene, and now they are on the player's side of it, wherever the scene says they are." : "";
    return `${c.name} is with the player: ${stop(c.who)}. They speak and act as themselves, by their own nature and wants, and they ${st >= 2 ? "are bound to the player" : st >= STAYS_AT ? "think well of the player" : "think little of the player just now"}.${was}`;
  });
}

/* ------------------------------ an ask, before a die is chosen ------------------------------ */

/** The stake of a try at something of the player's own: what it is after, how hard and why, and what each band would make true. */
export function askStakeSaid(t: Trip, p: Priced): string[] {
  const own = p.own!;
  const scene = sceneNow(t);
  const a = askOf(t, own);
  const st = standingOf(t, own.who);
  const land = askComesTo(p.risk, "clean").steps;
  const fail = comesTo(p.risk, "fail");
  const need = p.add ? `the die plus ${p.add} must reach ${p.target}` : `the die alone must reach ${p.target}`;
  const why = [ASK_STEPS[a.size] ? `${ASK_STEPS[a.size] === 1 ? "a step" : `${ASK_STEPS[a.size]} steps`} harder for so big an ask` : "", st > 0 ? `${st === 1 ? "a step" : `${st} steps`} easier, since ${own.who} is ${standingSaid(st)}` : st < 0 ? `${-st === 1 ? "a step" : `${-st} steps`} harder, since ${own.who} is ${standingSaid(st)}` : ""].filter(Boolean);
  const left = a.need - a.filled;
  const wins = land >= left;
  const lose = fail.cost ? `, and you lose ${lossSaid({ kind: p.stake, amount: fail.cost })}` : "";
  const through = countsThrough(t, own) ? ` Since ${own.who} is the one in your way here, a landing also counts toward getting through: ${steps(comesTo(p.risk, "clean").gain)}.` : "";
  return [
    `You are after something of your own here: ${stop(own.change)}. ${SIZE_SAID[a.size][0]!.toUpperCase()}${SIZE_SAID[a.size].slice(1)}${a.filled ? `, ${a.filled} of the ${a.need} steps it takes already won` : a.need > 1 ? `: it takes ${a.need} steps, and a landing wins ${land}` : ""}.`,
    `That leans on your ${statName(p.stat, t.sheet.powerName)}.${p.using ? ` ${p.using.name} makes it a step easier.` : ""} ${DIFFICULTY_NAME[scene?.difficulty ?? 1]} here${why.length ? `, ${and(why)}` : ""}: ${need}.`,
    `If it lands: ${wins ? "it is so, and it stays so" : `${steps(Math.min(land, left))} nearer it, and ${own.who} thinks better of you`}. ${wins ? `It comes with this: ${stop(own.catch)}, and that comes due when the next scene opens (${CATCH_COST[a.size]} ${own.costs === "hours" ? (CATCH_COST[a.size] === 1 ? "hour" : "hours") : own.costs}${CATCH_GRIP[a.size] ? ", and that scene starts a step closed" : ""}).` : ""}${own.lesser ? ` If it lands only at a cost, what is true instead is less: ${stop(own.lesser)}.` : ""}${through}`.replace(/\s+/g, " ").trim(),
    `If it falls short: ${own.against ? `${stop(own.against)}, and ` : ""}${own.who} thinks less of you. The scene closes on you by ${steps(fail.grip)}${lose}.`,
  ];
}

/* ------------------------------ what a spent die came to ------------------------------ */

/** What a narrator must show of a die spent on an ask, after the band itself is said. */
export function askNote(s: SpentTry): string {
  const o = s.own;
  const own = s.try.own;
  const parts: string[] = [];
  if (o && own) {
    parts.push(`What the player was after: ${stop(own.change)}.`);
    if (o.won) {
      parts.push(o.won.form === "lesser" ? `It comes true only in part, and this is what is true now and stays true: ${stop(o.won.said)}.` : `It comes true, and stays true from now on: ${stop(o.won.said)}.`);
      if (o.joined) parts.push(`${o.joined.name} goes with the player from now on, as themselves.`);
      parts.push(`It comes with this, by the nature of who or what is involved; it has not come due yet, so it may only be hinted at: ${stop(o.won.catch)}.`);
    } else if (o.steps) parts.push(`It is not won yet, but it is nearer (${o.ask.filled} of ${o.ask.need}): show ${own.who} moved by it, not yet won over.`);
    else parts.push(`It does not move ${own.who}; it costs the player with them${own.against ? `: ${stop(own.against)}` : ""}.`);
    if (o.soured) parts.push(`${own.who} is set against the player now, and stays so.`);
  }
  if (s.leaned) parts.push(`${s.leaned.comrade.name}, who is with the player, was leaned on and let down by it, and thinks less of them.`);
  return parts.join(" ");
}

/** What a spent die came to for an ask, in the game's numbers: said after the telling. */
export function askSaid(s: SpentTry): string[] {
  const o = s.own;
  const own = s.try.own;
  const out: string[] = [];
  if (o && own) {
    if (o.won) out.push(`${o.won.form === "lesser" ? "It is yours, but only in part" : "It is yours, and it stays so"}: ${stop(o.won.said)}.${o.joined ? ` ${o.joined.name} goes with you: lean on them once a scene and it is a step easier. If they come to think too little of you, they leave.` : ""} What comes with it comes due when the next scene opens.`);
    else if (o.steps) out.push(`${o.ask.filled} of the ${o.ask.need} steps toward it.`);
    const was = standingSaid(o.standing.before);
    const now = standingSaid(o.standing.after);
    if (o.standing.after !== o.standing.before) out.push(`${own.who} ${now ? `is ${now}` : "is neither warm nor cold towards you"} now${was ? `, where they were ${was}` : ""}.`);
  }
  if (s.leaned) out.push(`${s.leaned.comrade.name} thinks less of you for it${s.leaned.after < STAYS_AT ? `: unless that changes, they leave you when the next scene opens` : ""}.`);
  return out;
}

/* ------------------------------ what comes due ------------------------------ */

/** What a narrator must show as a scene opens, of what came due: added to the opening's note. */
export function dueNote(due: readonly Due[]): string {
  return due
    .map((d) => {
      const cost = d.losses.length ? ` It costs the player ${and(d.losses.map(lossSaid))}: show how.` : "";
      if (d.goes) return `Before anything else here, ${d.goes.name} ${d.how === "turned" ? "turns on the player, as their nature and what is between them would have it" : "leaves the player, as their nature and what is between them would have it"}${d.change?.catch ? `; what came with them comes due as they go: ${stop(d.change.catch)}` : ""}.${cost}${d.closed ? " It makes this scene worse from the start." : ""}`;
      return `Before anything else here, something the player won earlier comes with its price, and it comes due now: ${stop(d.change?.catch ?? "")}.${cost}${d.closed ? " It makes this scene worse from the start." : ""} What was won stays won: ${stop(d.change?.said ?? "")}.`;
    })
    .join(" ");
}

/** What came due as a scene opens, in the game's numbers. */
export function dueSaid(due: readonly Due[], grip: number): string[] {
  const lost = due.flatMap((d) => d.losses);
  const goes = due.filter((d) => d.goes);
  const closed = due.reduce((n, d) => n + d.closed, 0);
  return [
    ...goes.map((d) => `${d.goes!.name} ${d.how === "turned" ? "has turned on you" : "has left you"}: they thought too little of you to stay. Their card goes back to the deck.`),
    `${due.some((d) => !d.goes) ? "What you won came with a price, and it has come due" : "That comes with a price"}${lost.length ? `: you lose ${and(lost.map(lossSaid))}` : ""}.${closed ? ` This scene starts ${grip} of ${GRIP_MAX} closed on you.` : ""}`,
  ];
}

/** Said, when no model tells it, of what came due. */
export const duePlain = (due: readonly Due[]): string => due.map((d) => (d.goes ? `${d.goes.name} is gone.` : stop(d.change?.catch ?? "") + ".")).join(" ");

/* ------------------------------ walking away ------------------------------ */

/** Asked before the player walks away from a scene: what it would cost, said, so they can think again. */
export function walkAsk(t: Trip): string {
  const s = sceneNow(t);
  const h = t.hand;
  if (!s || !h) return "";
  const last = (t.hand?.scene ?? 0) >= (t.adv.scenes?.scenes.length ?? 1) - 1;
  if (last) return `This is the last scene. Walking away from it gives up the story: ${stop(t.adv.deadline.lost)}. Do you walk away? Write yes, or what you do instead.`;
  return `Walk away from ${s.name}, and it is left undone: nothing it would have taken from you is taken, but it leaves you nothing, and what it was for is lost. All that has closed on you here follows you, and ${steps(WALK_GRIP)} more: the next scene starts ${Math.min(GRIP_MAX - 1, h.grip + WALK_GRIP)} of ${GRIP_MAX} closed. Do you walk away? Write yes, or what you do instead.`;
}

/** Said when the player walks away from a scene. */
export function walkedSaid(w: Walked): string[] {
  return w.last ? [`You walk away from ${w.scene.name}, and from the story.`] : [`You walk away from ${w.scene.name}, and leave it as it is. The next scene starts ${w.follows} of ${GRIP_MAX} closed on you.`];
}

/** What a narrator must show when the player walks away from a scene. */
export const walkNote = (w: Walked): string => `The player turns their back on this scene and walks away from it, leaving it undone: show them going, and what they leave behind going on without them. Nothing more is taken from them for it. Do not follow them anywhere yet. The scene: ${w.scene.situation}`;

/* ------------------------------ the cards on your side ------------------------------ */

/** What is written on the card of someone who goes with you. */
export const comradeText = (c: Comrade, change?: Change): string => `${stop(c.who)}. With you${change && stop(change.said) !== stop(c.who) ? `: ${stop(change.said)}` : ""}. Lean on them in a line and it is a step easier, once a scene. If they come to think too little of you, they leave.`;

/** What is written on the card of something won that stays true. */
export const changeText = (c: Change): string => (c.kind === "sour" ? `${stop(c.said)}. Set against you: anything asked of them is two steps harder.` : `${stop(c.said)}.${c.form === "lesser" ? " Won only in part." : ""} Won, and it stays true.`);

/** The card a change is shown by: someone won to your side or a promise is a token, a thing a purse, a fact a lantern. */
export const CHANGE_CARD: Record<Change["kind"], string> = { join: "companion", side: "token", bond: "token", take: "purse", fact: "lantern", sour: "rival" };

/** Said at the end of a story: who walks out of it with you. */
export function companyEndSaid(t: Pick<Trip, "hand">): string[] {
  const c = companyNow(t);
  return c.length ? [`${and(c.map((x) => x.name))} ${c.length > 1 ? "walk" : "walks"} out of it with you.`] : [];
}
