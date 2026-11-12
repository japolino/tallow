/**
 * The words code says in a story played with a hand of dice (hand.ts): the rule, the stake before a die is chosen,
 * what a spent die came to, and the notes that tell a narrator model what must be true. Every number said here is
 * the engine's; a model only tells what happened.
 */
import { HEALTH_MAX, REST_HEALS, REST_HOURS, type Trip } from "./adventure.js";
import { bandOf, comesTo, GRIP_MAX, HAND_SIZE, sceneNow, STEP, thingsNow, THROUGH_MAX, TRADE_PRICE, type Band, type Entered, type HandRest, type Left, type Loss, type Priced, type Scene, type Spent, type TradeKind } from "./hand.js";
import { STATS, type CostKind } from "./moment.js";
import { clock, DIFFICULTY_NAME, span, STAT_NAME, statName } from "./tell.js";

const and = (xs: readonly (string | number)[]): string => (xs.length <= 1 ? String(xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const steps = (n: number): string => (n === 1 ? "1 step" : `${n} steps`);
const ORDINAL = ["first", "second", "third", "fourth", "fifth"];

/** The dice on the table, said. */
export const diceSaid = (dice: readonly number[]): string => (dice.length ? and(dice) : "none");

/** What a die would come to, in a word or three. */
export const BAND_SAYS: Record<Band, string> = {
  crit: "lands, and better than you hoped",
  clean: "lands",
  cost: "lands, at a cost",
  fail: "falls short",
  botch: "goes badly wrong",
};

const lossSaid = (l: Loss): string => (l.kind === "hours" ? span(l.amount) : `${l.amount} ${l.kind === "health" ? "health" : l.kind}`);
const STAKE_OF: Record<CostKind, string> = { health: "health", supplies: "supplies", goodwill: "goodwill", hours: "time" };

/** The rule, said once at the start of a story. */
export const HAND_RULE = [
  "This story is played with a hand of dice. I throw three for you before you do anything, and they lie in front of you until you spend them.",
  "Write what you do, in your own words. If it could go wrong, I tell you what it leans on, what it puts at risk, and what each die would make of it; then you choose which die to spend. Talk, questions and a look about cost no die and no time.",
  `In every scene two dials turn. One fills as you get through it, in ${THROUGH_MAX} steps; the other as it closes on you, in ${GRIP_MAX}. Whichever fills first ends the scene.`,
];

/** Said as a story of scenes begins. */
export function handStartSaid(t: Trip): string[] {
  const adv = t.adv;
  const n = adv.scenes?.scenes.length ?? 0;
  return [
    adv.goal,
    `It is ${clock(adv.startHour)}. It must be done by ${adv.deadline.name}, at ${clock(adv.deadline.hour)}.`,
    `There are ${n} scenes between you and that. I deal them face down.`,
    ...HAND_RULE,
    `Your first three: ${diceSaid(t.hand?.dice ?? [])}.`,
  ];
}

/** The first page of a story of scenes. */
export function handFirstPage(t: Trip): { heading: string; his: string[] } {
  const s = t.sheet.stats;
  return {
    heading: t.adv.title,
    his: [
      t.adv.goal,
      t.adv.who,
      `Your strengths, each out of 4: ${[...STATS.map((k) => `${STAT_NAME[k]} ${s[k]}`), ...(typeof s.power === "number" ? [`${t.sheet.powerName ?? "Power"} ${s.power}`] : [])].join(", ")}. The one a try leans on is added to the die you spend.`,
      `Done by ${t.adv.deadline.name}, at ${clock(t.adv.deadline.hour)}. Each die spent takes half an hour.`,
      `Your dice: ${diceSaid(t.hand?.dice ?? [])}.`,
    ],
  };
}

/** Said on coming to a scene. */
export function sceneSaid(e: Entered): string[] {
  const grip = e.trip.hand?.grip ?? 0;
  return [
    `The ${ORDINAL[e.index] ?? "next"} scene of ${e.total}: ${e.scene.name}.${e.hours ? ` Getting there takes ${span(e.hours)}; it is ${clock(e.trip.sheet.hour)}.` : ""}`,
    `I turn the card: ${e.scene.face}.`,
    ...(grip ? [`What closed on you before has followed you here: the dial on your side starts at ${grip} of ${GRIP_MAX}.`] : []),
  ];
}

/** The page a scene's card comes with: what you are here to do, what closes on you, and what there is to use. */
export function scenePage(t: Trip, scene: Scene): { heading: string; his: string[] } {
  const things = thingsNow(t).map((x) => x.name);
  return {
    heading: `${scene.name}: ${scene.face}`,
    his: [
      `To get through: ${scene.through}`,
      `What closes on you: ${scene.closing}`,
      ...(things.length ? [`Here to use, each once: ${and(things)}. A line that uses one is a step easier.`] : []),
      `Your dice: ${diceSaid(t.hand?.dice ?? [])}.`,
    ],
  };
}

/** Asked when a scene has been opened, and after every line. */
export const HAND_ASK = "What do you do?";

/** The state of the scene, for a narrator model: how far through, how far closed, what was lost before. */
function standing(t: Trip, scene: Scene): string {
  const h = t.hand;
  const lost = h?.lost.length ? ` Earlier in this story, and still true: ${h.lost.join(" ")}` : "";
  const who = scene.person ? ` Here: ${scene.person.name}, ${scene.person.who} They want: ${scene.person.wants}` : "";
  return `The scene: ${scene.situation}${who} What the player is here to do: ${scene.through} What closes on them as it goes wrong: ${scene.closing} So far they are ${h?.through ?? 0} of ${THROUGH_MAX} steps through, and it has closed ${h?.grip ?? 0} of ${GRIP_MAX} on them.${lost}`;
}

/** What a narrator model must show to open a scene. */
export function openingNote(t: Trip, scene: Scene): string {
  return `Open this scene: show the place, who is in it and what is going on, as the player's character comes into it, and stop at the point where they can act. Nothing is decided yet: do not act or speak for the player's character, and do not let anything be won or lost. ${standing(t, scene)}`;
}

/** What a narrator model must show for a line that risks nothing. */
export function freeNote(t: Trip, scene: Scene): string {
  return `The player says or does something that puts nothing at risk. Answer inside the scene: whoever is here reacts and speaks as themselves; a look shows what is there. Nothing in the game changes: they are no further through and it has closed no further, so nothing they are here for is given or settled by this. Stop where they can act again. ${standing(t, scene)}`;
}

const BAND_NOTE: Record<Band, string> = {
  crit: "It works, and better than they could have hoped: something turns their way as well.",
  clean: "It works, cleanly.",
  cost: "It works, but not cleanly: it costs them, and that is shown happening.",
  fail: "It does not work, and what they risked happens to them.",
  botch: "It goes badly wrong: what they risked happens to them, and worse.",
};

/** What a narrator model must show for a die spent on a try. `after` is the trip after it; `scene` the scene it was in. */
export function spentNote(s: Spent, scene: Scene): string {
  const p = s.try;
  const h = s.trip.hand;
  const parts = [
    `The player tried this: ${p.attempt || "what they wrote"}${p.using ? `, using ${p.using.name}` : ""}.`,
    BAND_NOTE[s.band],
    s.gain ? (p.aim === "loose" ? `They get ${steps(s.gain)} loose of what was closing on them.` : `It takes them ${steps(s.gain)} of ${THROUGH_MAX} toward this: ${scene.through}`) : "They are no further through.",
    s.closed > 0 ? `The scene closes on them by ${steps(s.closed)}: ${scene.closing} What happens to them, shown as it happens: ${p.threat}` : "",
    s.losses.length ? `It costs them ${and(s.losses.map(lossSaid))}: show how.` : "",
    s.traded ? `They chose to give up ${TRADE_PRICE[s.traded]} ${STAKE_OF[s.traded]} to make it land: show the price they paid for it.` : "",
    s.scene === "won" ? `That is enough: they are through. Show it done: ${scene.through}` : s.scene === "taken" ? `It has closed on them altogether. Show it going the scene's way, not theirs: ${scene.taken}` : "The scene is not over: stop where they can act again, and do not settle the rest of it.",
    `Before this they were ${Math.max(0, (h?.through ?? 0) - (p.aim === "through" ? s.gain : 0))} of ${THROUGH_MAX} through. The scene: ${scene.situation}${scene.person ? ` Here: ${scene.person.name}, ${scene.person.who}` : ""}`,
  ];
  return parts.filter(Boolean).join(" ");
}

/** Said in plain words when no model tells it. */
export function spentPlain(s: Spent): string {
  const p = s.try;
  if (s.band === "crit") return "It works, and better than you hoped.";
  if (s.band === "clean") return "It works.";
  if (s.band === "cost") return `It works, but it costs you: ${p.threat}`;
  return s.band === "botch" ? `It goes badly wrong: ${p.threat}` : `It does not work: ${p.threat}`;
}

/** What a try is and what it risks, said before a die is chosen, with what each die on the table would come to. */
export function stakeSaid(t: Trip, p: Priced): string[] {
  const scene = sceneNow(t);
  const dice = t.hand?.dice ?? [];
  const fail = comesTo(p.risk, "fail");
  const gain = comesTo(p.risk, "clean").gain;
  const need = p.add ? `the die plus ${p.add} must reach ${p.target}` : `the die alone must reach ${p.target}`;
  const lose = fail.cost ? ` and you lose ${lossSaid({ kind: p.stake, amount: fail.cost })}` : "";
  return [
    `That leans on your ${statName(p.stat, t.sheet.powerName)}.${p.using ? ` ${p.using.name} makes it a step easier.` : ""} ${DIFFICULTY_NAME[scene?.difficulty ?? 1]} here: ${need}.`,
    `It is a ${p.risk} risk. If it lands: ${steps(gain)} ${p.aim === "loose" ? "loose of what is closing on you" : "toward getting through"}. If it falls short: ${p.threat.replace(/[.!\s]+$/, "")}. The scene closes on you by ${steps(fail.grip)}${lose}.`,
    `Your dice: ${dice.map((d, i) => `the ${d} ${BAND_SAYS[p.bands[i] ?? "fail"]}`).join("; ")}.`,
    "Which die do you spend on it? Touch it, or write its number. Or write something else, and this is left alone.",
  ];
}

const TRADE_SAYS: Record<TradeKind, string> = { health: `a wound (${TRADE_PRICE.health} health)`, supplies: `${TRADE_PRICE.supplies} supplies` };

/** Asked when the die chosen falls short and something could be given up to lift it a step. */
export function tradeAsk(p: Priced, natural: number, open: readonly TradeKind[]): string {
  const now = bandOf(natural, p.add, p.target);
  const then = bandOf(natural, p.add + STEP, p.target);
  return `The ${natural} ${BAND_SAYS[now]}. Give something up and it ${BAND_SAYS[then]} instead: ${open.map((k) => TRADE_SAYS[k]).join(", or ")}. Write what you give up, or that you let it lie.`;
}

/** The options of a trade, for a reader: what each means. */
export const tradeOptions = (open: readonly TradeKind[]): Record<TradeKind | "none", string> =>
  ({ ...Object.fromEntries(open.map((k) => [k, k === "health" ? "they take a wound, get hurt or give up health to make it work" : "they give up supplies, gear, coin or something they carry to make it work"])), none: "they give nothing up: they let the die lie as it is" }) as Record<TradeKind | "none", string>;

/** What a spent die came to, in the game's numbers: said after the telling. */
export function spentSaid(s: Spent): string[] {
  const h = s.trip.hand;
  const lifted = s.traded ? `, and gave up ${TRADE_SAYS[s.traded]} to lift it` : "";
  const lines = [`You spent the ${s.natural}${lifted}: it ${BAND_SAYS[s.band]}. Through: ${h?.through ?? 0} of ${THROUGH_MAX}. Closed on you: ${h?.grip ?? 0} of ${GRIP_MAX}.`];
  if (s.losses.length) lines.push(`You lose ${and(s.losses.map(lossSaid))}.`);
  if (s.scene === "on") lines.push(s.fresh ? `That was the last of your dice. I throw ${HAND_SIZE} more: ${diceSaid(s.fresh)}.` : `Dice left: ${diceSaid(h?.dice ?? [])}.`);
  return lines;
}

/** Said when a scene is left behind (not the last: the ending says that). `told`: a narrator has just told how it closed, so it is not said twice. */
export function leftSaid(l: Left, told = false): string[] {
  const dice = l.trip.hand?.dice ?? [];
  const follow = l.follows ? ` Half of what had closed on you follows you: the next scene starts ${l.follows} of ${GRIP_MAX} closed.` : "";
  if (l.how === "won") return [`You are through. You come away with ${l.boon?.name ?? "nothing"}: it makes one thing a step easier, once, later on.${follow}`, `Dice on the table: ${diceSaid(dice)}.`];
  return [
    told ? "It has closed on you." : `It has closed on you. ${l.scene.taken}`,
    `You come to ${span(l.hours)} later, with nothing from it${l.losses.length ? `, and ${and(l.losses.map(lossSaid))} the worse` : ""}. It is ${clock(l.trip.sheet.hour)}.${follow}`,
    `Dice on the table: ${diceSaid(dice)}.`,
  ];
}

/** Asked between scenes, when a rest would do something. */
export function handRestAsk(t: Trip): string {
  const dice = t.hand?.dice ?? [];
  return `You have ${t.sheet.health} health of ${HEALTH_MAX}, and ${dice.length ? `the ${diceSaid(dice)}` : "no dice"} on the table. Rest before the next scene, or press on? A rest heals ${REST_HEALS}, eats a supply and sweeps your dice up for ${HAND_SIZE} new ones, but it takes ${span(REST_HOURS)}: it is ${clock(t.sheet.hour)}, and you have until ${clock(t.adv.deadline.hour)}. Write which.`;
}

export function handRestSaid(r: HandRest): string[] {
  const s = r.trip.sheet;
  return [
    r.ate ? `You rest, and eat. ${r.healed ? `You get back ${r.healed} health (${s.health} now).` : "It does you no more good."}` : `You rest with nothing to eat. You get back ${r.healed} health (${s.health} now).`,
    `It is ${clock(s.hour)}. I sweep up your dice and throw ${HAND_SIZE} more: ${diceSaid(r.dice)}.`,
  ];
}

/** Said when a story of scenes is over. */
export function handEndSaid(t: Trip): string[] {
  const adv = t.adv;
  if (t.over === "won") return [adv.won, "That is the story, and you won it."];
  if (t.over === "taken") return [adv.scenes?.scenes.at(-1)?.taken ?? "", adv.deadline.lost, "That is the story, and it went against you."].filter(Boolean);
  return [`It is ${clock(t.sheet.hour)}: ${adv.deadline.name} has come.`, adv.deadline.lost, "That is the story, and it went against you."];
}

/** The last page. */
export function handEndPage(t: Trip): { heading: string; his: string[] } {
  const scenes = t.adv.scenes?.scenes.length ?? 0;
  const lost = t.hand?.lost ?? [];
  return { heading: t.over === "won" ? "Won" : "Lost", his: [handEndSaid(t)[0] ?? "", `Scenes got through: ${t.passed} of ${scenes}. It was ${clock(t.sheet.hour)}.`, ...(lost.length ? [`What it took from you: ${lost.join(" ")}`] : [])] };
}

/** Said when a story of scenes is taken up again. */
export function handBackSaid(t: Trip): string[] {
  const s = sceneNow(t);
  const h = t.hand;
  const at = s && h?.opened ? `We were at ${s.name}: ${h.through} of ${THROUGH_MAX} through, ${h.grip} of ${GRIP_MAX} closed on you.` : s ? `You were on your way to the next scene.` : "";
  return [`You came back. ${at}`, `It is ${clock(t.sheet.hour)}. Your dice lie as you left them: ${diceSaid(h?.dice ?? [])}.`];
}
