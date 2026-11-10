/**
 * A moment in plain words. The player may never have played a tabletop game,
 * so every line here says what is being asked and what the numbers mean.
 * The screen and the text playthrough (scripts/moment.ts) both speak through
 * these, so what is tested by reading is what is shown.
 */
import { options, PARTIAL, STAT_MAX, TRY_HOURS, type Check, type Shut, type CostKind, type Moment, type Outcome, type Stat, type Tier, type Way } from "./moment.js";

export const WAY_NAME: Record<Way, string> = { talk: "Talk", sneak: "Sneak", force: "Force", pay: "Pay" };
export const WAY_MEANS: Record<Way, string> = {
  talk: "Get them to let you by, with words.",
  sneak: "Get by without being noticed.",
  force: "Go through whatever is in the way.",
  pay: "Hand over supplies for the way through.",
};

export const STAT_NAME: Record<Stat, string> = { brawn: "Brawn", cunning: "Cunning", charm: "Charm", wits: "Wits" };
export const STAT_MEANS: Record<Stat, string> = {
  brawn: "strength and toughness",
  cunning: "quiet feet, quick hands and a straight face",
  charm: "warmth, nerve and a way with people",
  wits: "knowing things, noticing things and doing sums",
};

/** How a way is gone about when it leans on a given stat. */
export const HOW: Record<Way, Partial<Record<Stat, string>>> = {
  talk: { charm: "by winning them over", brawn: "by a threat", cunning: "by a lie", wits: "by an argument they cannot answer" },
  sneak: { cunning: "by going unseen", wits: "by finding a way round" },
  force: { brawn: "by main strength" },
  pay: { wits: "at a fair price", charm: "by sweetening the deal" },
};

export const DIFFICULTY_NAME = ["Easy", "Fair", "Hard", "Very hard"] as const;

const COST_NAME: Record<CostKind, string> = { goodwill: "goodwill", hours: "time", health: "health", supplies: "supplies" };
/** What each way puts at risk, said once on the table of ways. */
export const RISK: Record<Way, string> = {
  talk: "If it goes wrong you lose goodwill: people think less of you.",
  sneak: "If it goes wrong you lose time: daylight you will not get back.",
  force: "If it goes wrong you get hurt: you lose health.",
  pay: "It costs supplies when it works, and more when it goes wrong.",
};

/** What the die has to do, said without a pointless "plus 0". */
const need = (add: number, target: number): string => (add ? `the die plus ${add} must reach ${target}` : `the die alone must reach ${target}`);

/** A chance as a whole number out of 100. */
export const outOf100 = (p: number): number => Math.round(p * 100);

/** "6:00 pm". Hours past 24 are the next day. */
export function clock(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) {
    mm = 0;
    hh = (hh + 1) % 24;
  }
  return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`;
}

/** "half an hour", "an hour", "an hour and a half", "2 hours", "2 and a half hours". */
export function span(hours: number): string {
  const whole = Math.floor(hours + 1e-9);
  const half = hours - whole >= 0.25;
  if (whole === 0) return half ? "half an hour" : "no time";
  if (whole === 1) return half ? "an hour and a half" : "an hour";
  return half ? `${whole} and a half hours` : `${whole} hours`;
}

/** What the sheet shows: the numbers the player carries, each with what it is. */
export function sheetLines(m: Moment): string[] {
  const s = m.sheet;
  return [
    `Health ${s.health}. How much hurt you can still take.`,
    `Supplies ${s.supplies}. Food, coin and gear you can hand over.`,
    `Goodwill ${s.goodwill}. How well people think of you.`,
    `It is ${clock(s.hour)}. Every try takes ${span(TRY_HOURS)}.`,
  ];
}

/** Each stat with its number and what it is. The number is added to the die. */
export function statLines(m: Moment): string[] {
  return (Object.keys(STAT_NAME) as Stat[]).map((k) => `${STAT_NAME[k]} +${m.sheet.stats[k]}: ${STAT_MEANS[k]}.`);
}

export const STATS_NOTE = `Each of these is a number from 0 to ${STAT_MAX}. When a try tests one of them, its number is added to the die.`;

/** One way on the table of ways: what it tests, how hard it is here, the chances, and what it risks. */
export function optionLine(c: Check): string {
  const price = c.way === "pay" ? ` Asks ${c.price} supplies.` : "";
  return `${WAY_NAME[c.way]}: tests ${STAT_NAME[c.stat]} (+${c.add}). ${DIFFICULTY_NAME[c.difficulty]} here: ${need(c.add, c.target)}. Out of 100 throws, about ${outOf100(c.odds.success)} work and ${outOf100(c.odds.partial)} work at a cost.${price}`;
}

export function shutLine(way: Way, why: Shut, price = 0): string {
  if (why === "closed") return `${WAY_NAME[way]}: closed. You tried it here and it failed.`;
  if (why === "unheard") return `${WAY_NAME[way]}: closed. You have no goodwill left, and nobody will hear you out.`;
  if (why === "cannot_pay") return `${WAY_NAME[way]}: you do not have the ${price} supplies it asks.`;
  return `${WAY_NAME[way]}: not possible here.`;
}

/** The narrator names the check: said after the line is read and before the die is touched. */
export function checkLines(c: Check): string[] {
  const how = HOW[c.way][c.stat] ?? "";
  const lines = [
    `The narrator reads this as: ${WAY_NAME[c.way]}${how ? `, ${how}` : ""}.`,
    `It tests your ${STAT_NAME[c.stat]} (${STAT_MEANS[c.stat]}). Yours is ${c.add}, so you add ${c.add || "nothing"} to the die.`,
    `It is ${DIFFICULTY_NAME[c.difficulty].toLowerCase()} here: ${need(c.add, c.target)}.`,
  ];
  if (c.lever) lines.push(`You are using ${c.lever.name}, so it is one step easier than it would have been.`);
  if (c.cold) lines.push("You have no goodwill left, so talking is one step harder than it would have been.");
  lines.push(`Out of 100 throws, about ${outOf100(c.odds.success)} work, ${outOf100(c.odds.partial)} work at a cost, and ${outOf100(c.odds.fail)} fail.`);
  if (c.way === "pay") lines.push(`It asks ${c.price} supplies. If it fails you lose some supplies anyway, this way closes, and every way left gets harder.`);
  else lines.push(`If it fails you lose ${COST_NAME[c.costs]}, this way closes, and every way left gets harder.`);
  return lines;
}

const TIER_SAYS: Record<Tier, string> = {
  crit_success: "A 20 always works, and works better than you hoped.",
  success: "That is enough: it works.",
  partial: `That is short, but by ${PARTIAL} or less: it works, but at a cost.`,
  fail: "That is not enough: it fails.",
  crit_fail: "A 1 always fails, and fails badly.",
};

/** What the die showed and what that comes to. */
export function rollLines(o: Outcome): string[] {
  const c = o.check;
  const sum = c.add ? `With your ${STAT_NAME[c.stat]} (+${c.add}) that makes ${o.total}.` : `Your ${STAT_NAME[c.stat]} adds nothing, so it stays ${o.total}.`;
  return [`The die shows ${o.natural}. ${sum} You needed ${c.target}.`, TIER_SAYS[o.tier]];
}

const left = (n: number): string => (n === 0 ? "none left" : `${n} left`);

/** What the result changed, one plain sentence each. `third` says it of the player ("they") for the narrator's note. */
export function changeLines(o: Outcome, third = false): string[] {
  const You = third ? "They" : "You";
  const you = third ? "they" : "you";
  const s = o.next.sheet;
  const lines: string[] = [];
  const { kind, amount, lost } = o.cost;
  if (kind === "hours") {
    lines.push(amount > 0 ? `It takes ${span(o.hours)}: ${span(TRY_HOURS)} for the try and ${span(amount)} lost. It is now ${clock(s.hour)}.` : `It takes ${span(o.hours)}. It is now ${clock(s.hour)}.`);
  } else {
    if (lost > 0) lines.push(`${You} lose ${lost} ${COST_NAME[kind]} (${left(s[kind])}).`);
    else if (amount > 0) lines.push(`${You} had no ${COST_NAME[kind]} left to lose.`);
    lines.push(`It takes ${span(o.hours)}. It is now ${clock(s.hour)}.`);
  }
  if (o.goodwillWon) lines.push(`Word of it gets about: ${you} gain ${o.goodwillWon} goodwill (${s.goodwill} now).`);
  if (o.past) lines.push(`${You} are past ${o.next.stop.name}.`);
  else if (!o.closed) lines.push(`It still stands in ${third ? "their" : "your"} way, and it is harder now: every way here is one step harder, that one too.`);
  else {
    lines.push(`${WAY_NAME[o.closed]} failed, so it is closed to ${third ? "them" : "you"} here.`);
    lines.push(o.turnedBack ? `No way is left. ${You} are turned back from ${o.next.stop.name}.` : "The trouble here has grown: every way left is one step harder.");
  }
  return lines;
}

const NOTE: Record<Tier, string> = {
  crit_success: "It goes better than they could have hoped. They are through.",
  success: "It works. They are through.",
  partial: "It works and they are through, but not cleanly: show the cost below, and no other.",
  fail: "What they wrote was tried and it did not work. They are not through. Show the cost below, and no other, and how the situation has got worse. Do not let them through by any other means.",
  crit_fail: "What they wrote was tried and it went badly. They are not through. Show the cost below, and no other, and that this will be remembered. Do not let them through by any other means.",
};

/**
 * What the narrator must make true: instructions for the model that tells the story, never shown to the
 * player. The model is free only in the telling; what happened is fixed here. `more` is a try that worked at a stop
 * that takes more than one: the player is not past it yet.
 */
export function narratorNote(o: Outcome, more = false): string {
  const c = o.check;
  const facts = [
    `At ${o.next.stop.name} the player tried: ${(c.attempt || WAY_NAME[c.way].toLowerCase()).replace(/[.!?]+$/, "")}.`,
    more ? "It works, but they are not through yet: more still stands in the way here, so do not let them past." : NOTE[o.tier],
    ...changeLines(o, true).filter((l) => !(more && /are past/.test(l))),
  ];
  return facts.join(" ");
}

/* ------------------------------ what the screen asks ------------------------------ */

export const KIND_SAYS = { person: "Someone stands in your way.", obstacle: "Something stands in your way.", fight: "A fight stands in your way." } as const;
export const ASK = "What do you do? Write it in your own words.";
export const HINT = "You can talk, sneak, force your way through, or pay. Using something you can see in the scene makes that way one step easier.";
export const UNCLEAR = "The narrator cannot tell how you are going about it. Which is it?";
export const SHUT_SAYS = "That way is not open to you here. Which of these is it?";
export const HOLD = "The die is in your hand. Move the pointer to shake it, then click the table to let it go.";

/** The table of ways as it stands: every way, open or not, in a fixed order. */
export function wayLines(m: Moment): string[] {
  if (m.over) return [];
  return options(m).map((o) => (o.check ? `${optionLine(o.check)} ${RISK[o.way]}` : shutLine(o.way, o.shut!, m.stop.ways[o.way]?.price ?? 0)));
}

/** What is said when the moment is over. `next` is the stop after this one; `other` is where the other road goes. */
export function endLines(m: Moment, next: string, other: string): string[] {
  if (m.over === "past") return [`That was one moment of the game: a situation, your own words, one check, one die, and a changed situation.`, `Next on this road: ${next}. What you spent here, you no longer have there.`];
  if (m.over === "turned_back") return [`That was one moment of the game, and it went against you. The game does not stop there: it goes on from a worse place.`, `The other road goes by ${other}.`];
  return [];
}

/* ------------------------------ what the narrator says aloud ------------------------------ */

/*
 * At the table nothing is shown as a panel of numbers. The narrator speaks, a
 * scale shows the chances, and counters on the table show what you carry.
 * These are the narrator's own words for the same facts as above, said to
 * you across the table. They carry no odds: the scale does that.
 */

const WAY_VERB: Record<Way, string> = { talk: "talk your way past", sneak: "get by unnoticed", force: "force your way through", pay: "pay your way through" };
const HARD_SAID = ["That is an easy thing here.", "That is a fair thing to ask here.", "That is hard here.", "That is very hard here."] as const;

/** The check, named aloud before the die is touched. */
export function checkSaid(c: Check): string[] {
  const how = c.way === "sneak" && c.stat === "cunning" ? "" : HOW[c.way][c.stat] ?? "";
  const lines = [`I take it you mean to ${WAY_VERB[c.way]}${how ? `, ${how}` : ""}.`, `That tests your ${STAT_NAME[c.stat]}: ${STAT_MEANS[c.stat]}.`, HARD_SAID[c.difficulty]];
  if (c.lever) lines.push(`You are using ${c.lever.name}. That is a weight on your side.`);
  if (c.cold) lines.push("You have no goodwill left, so nobody much wants to hear you out: that is one step harder.");
  if (c.way === "pay") lines.push(`It asks ${c.price} of your supplies, and more if it goes badly.`);
  else lines.push(RISK[c.way]);
  return lines;
}

/** Said once the scale is loaded: what the scale means and what to do next. */
export const SCALE_SAYS = "Look at the scale. My weights say how hard it is; yours are what you bring. The pan that sinks is the likelier end.";
export const DIE_SAYS = "Take a die from the box when you are ready. Or write again, if I have you wrong.";
export const ASK_SAID = "What do you do? Open your notebook and write it in your own words.";
/** Asked at every stop after the first. */
export const ASK_NEXT = "What do you do? Write it in the notebook.";
export const ASK_AGAIN = "It still stands in your way. What do you do now?";
export const UNCLEAR_SAID = "That does not get you past. Write what you do about it: what you say to them, how you slip by unseen, what you push or break through, or what you pay. Using something you can see here helps.";

/** Why a way that was read cannot be tried, as the narrator says it. */
export function shutSaid(way: Way, why: Shut, price = 0): string {
  const then = "Write something else.";
  if (why === "unheard") return `You have no goodwill left. Nobody will hear you out now, so talking is shut to you until people think better of you. ${then}`;
  if (why === "closed") return `You tried to ${WAY_VERB[way]} here already, and it failed. That way is shut. ${then}`;
  if (why === "cannot_pay") return `That asks ${price} supplies, and you do not have them. ${then}`;
  return `There is no way to ${WAY_VERB[way]} here. ${then}`;
}

/** The short line that heads the narrator's writing on a turn's page: what the try was. */
export function checkHeading(c: Check): string {
  return `${WAY_NAME[c.way]}, on your ${STAT_NAME[c.stat]}. ${DIFFICULTY_NAME[c.difficulty]}${c.lever ? `, with ${c.lever.name}` : ""}.`;
}
