/**
 * A whole adventure in plain words: what the narrator says at the start, on the road, at a fork, on arriving, and at
 * the end. The table (preview/table.ts) and the text playthrough (scripts/adventure.ts) both speak through these,
 * so what is read in the script is what is said in the room.
 */
import { companionOf, FALL_HOURS, HEALTH_MAX, hubDone, lootOf, placeName, withParty, REST_HEALS, REST_HOURS, type Adventure, type Companion, type Arrival, type Rested, type RoadStop, type Trip, type Turn, type Used } from "./adventure.js";
import { cardKind, FAMILY_SAYS } from "./cards.js";
import { coming, contestKind, type Contest, type ContestKind, type Dial, type Round } from "./contest.js";
import { shapeOf, storeAt, type Ability } from "./abilities.js";
import { DELAY_HOURS, DREAD_SPEND, type Move } from "./dread.js";
import type { Save } from "./save.js";
import { LUCK_YES, type Luck } from "./luck.js";
import { STATS, type Lever, type Way } from "./moment.js";
import { TRY_HOURS } from "./moment.js";
import { clock, KIND_SAYS, span, STAT_MEANS, STAT_NAME } from "./tell.js";
import { kitLines, type TakenOut, type WorldKit } from "./kit.js";
import { yourPiece } from "./battle.js";
import { seededRng } from "./dice.js";

const WAY_DOING: Record<Way, string> = { talk: "talk your way past", sneak: "slip by unseen", force: "go at a thing head on", pay: "pay your way" };

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const climaxOf = (adv: Adventure): RoadStop | undefined => adv.stops.find((s) => s.climax);

/** The deadline in a sentence, with what it looks like in the room. */
export function deadlineSaid(adv: Adventure): string {
  const night = adv.deadline.hour > 24;
  const at = adv.deadline.name === clock(adv.deadline.hour) ? adv.deadline.name : `${adv.deadline.name}, ${clock(adv.deadline.hour)}`;
  return `The clock is against you: at ${at}, it is too late. ${night ? "The light in the room is the clock, and after dark the candles are: when they have burnt down, it is morning." : "The light in the room is the clock."}`;
}

/** Who walks with you, what they bring, and what they think of how you go about things. */
export function companionSaid(c: Companion): string {
  return `${c.name} walks with you: ${c.who.replace(/[.]+$/, "")}. While ${c.name} is with you, your ${STAT_NAME[c.stat]} counts one higher. ${c.name} likes it when you ${WAY_DOING[c.likes]}, and hates it when you ${WAY_DOING[c.dislikes]}: whenever you get past a place either way, word of it gets about, and your goodwill goes up or down.`;
}

/** Said at the very start: the job, the clock, and the road dealt face down. */
export function startSaid(adv: Adventure): string[] {
  const end = climaxOf(adv);
  const lines = [adv.goal, deadlineSaid(adv)];
  if (adv.courted) lines.push(`This is ${adv.courted.name}, ${adv.courted.who}. ${adv.courted.name}'s card lies by you.`);
  if (adv.rival) lines.push(`And this is ${adv.rival.name}, ${adv.rival.who}. Every try of yours that fails, ${adv.rival.name} ${gains(adv.rival.name)} ground, and I put a dark seal on that card. At ${adv.rival.max} seals, ${adv.rival.name} ${has(adv.rival.name)} won.`);
  for (const id of adv.party ?? []) {
    const c = adv.companions.find((x) => x.id === id);
    if (c) lines.push(companionSaid(c));
  }
  const forks = new Set(adv.roads.map(([a]) => a)).size < adv.roads.length;
  lines.push(
    forks
      ? `I deal the road face down: ${adv.stops.length} places between here and ${end?.name ?? "the end"}. The road forks on the way, so you will pass only some of them. You will not know what waits at each until you get there.`
      : `I deal the road face down: ${adv.stops.length} places between here and ${end?.name ?? "the end"}. You will not know what waits at each until you get there.`,
  );
  return lines;
}

/** The first page you are handed: the job, who you are, your strengths, the clock. */
export function firstPage(t: Trip): { heading: string; his: string[] } {
  const s = t.sheet.stats;
  const adv = t.adv;
  return {
    heading: adv.title,
    his: [
      adv.goal,
      adv.who,
      `Your strengths, each out of 4: ${[...STATS.map((k) => `${STAT_NAME[k]} ${s[k]}`), ...(typeof s.power === "number" ? [`${t.sheet.powerName ?? "Power"} ${s.power}`] : [])].join(", ")}. When a try leans on one, that many small weights go in your pan of the balance.`,
      ...t.abilities.map((a) => abilityLine(a, t.storeName ?? "store")),
      storeLine(t.storeName ?? "store", t.sheet.store ?? 0),
      deadlineSaid(adv),
      ...(adv.rival ? [`${adv.rival.name} ${gains(adv.rival.name)} ground on every try of yours that fails. At ${adv.rival.max}, ${adv.rival.name} ${has(adv.rival.name)} won.`] : []),
      ...(adv.kit ? kitLines(adv.kit) : []),
    ],
  };
}

const WAY_EASY: Record<Way, string> = { talk: "talking", sneak: "going unseen", force: "going at it head on", pay: "paying" };

/**
 * What can be told of a face-down card at a fork, so the choice is a choice: whether something waits there to be won
 * or someone to walk on with you, whether it takes more than one good try, and which way looks easiest there.
 */
export function forkHint(s: RoadStop): string {
  const bits: string[] = [];
  if (s.reward?.joins) bits.push("Someone there may walk on with you.");
  else if (s.reward?.loot) bits.push("There is something to be had there.");
  if ((s.holds ?? 1) > 1) bits.push(s.kind === "fight" ? "It will come to a fight." : "It will come to a contest, and take more than one good try.");
  const ways = Object.entries(s.ways) as [Way, { difficulty: number }][];
  const least = Math.min(...ways.map(([, w]) => w.difficulty));
  const easy = ways.filter(([, w]) => w.difficulty === least).map(([w]) => WAY_EASY[w]);
  if (easy.length && easy.length < ways.length) bits.push(`It looks easiest by ${easy.length === 1 ? easy[0] : `${easy.slice(0, -1).join(", ")} or ${easy[easy.length - 1]}`}.`);
  return bits.join(" ");
}

/** At a fork: the two face-down cards, what can be told of each, and which one a companion would take. */
export function forkSaid(t: Trip, stops: RoadStop[], hours: number[], leaning: { name: string; side: number } | null): string[] {
  if (t.adv.hub) return hubSaid(t, stops, hours);
  const side = ["On your left", "On your right"];
  const lines = ["The road splits here, and I lay out two cards. The colour of a card's back tells you what kind of thing waits there."];
  stops.forEach((s, i) => lines.push([`${side[i] ?? "And"}, ${FAMILY_SAYS[cardKind(s.card).family]}: ${s.teaser}. ${cap(span(hours[i] ?? 0))} away.`, forkHint(s)].filter(Boolean).join(" ")));
  if (leaning) lines.push(`${leaning.name} nods at the card on your ${leaning.side ? "right" : "left"}.`);
  lines.push("Pick one: touch it, or write which.");
  return lines;
}
/**
 * Where you can go from a hub (docs/MOONSHOT.md, the maps): each place still to do, by number, how far it is (back
 * through the hub when you are out at another), and whether the end is open yet.
 */
export function hubSaid(t: Trip, stops: RoadStop[], hours: number[]): string[] {
  const hub = placeName(t.adv, t.adv.start);
  const out = t.at !== t.adv.start;
  const lines = [out ? `From here, back through ${hub}, you can go on to any of these.` : `From ${hub} you can go out to any of these, in any order, and every road leads back here.`];
  stops.forEach((s, i) => lines.push([`${i + 1}. ${s.climax ? "The end of it all" : cap(FAMILY_SAYS[cardKind(s.card).family])}: ${s.name}, ${s.teaser}. ${cap(span(hours[i] ?? 0))} away.`, s.climax ? "" : forkHint(s)].filter(Boolean).join(" ")));
  const end = t.adv.stops.find((s) => s.climax);
  const left = (t.adv.hub?.needs ?? 0) - hubDone(t);
  if (end && left > 0) lines.push(`${end.name} is closed to you until you have done ${left === 1 ? "one more of them" : `${left} more of them`}.`);
  else if (end && stops.some((s) => s.climax) && stops.length > 1) lines.push(`${end.name} is open now. Go there when you are ready, or do more first: every place done is something more to go on, and every hour spent is the other side's.`);
  lines.push("Pick one: touch its card, or write which, by name or by number.");
  return lines;
}
export const HUB_AGAIN = "I cannot tell which you mean. Write its name, or its number.";

export const FORK_AGAIN = "I cannot tell which you mean. The one on your left, or the one on your right?";

/** Whether a name is of many ("the hunters", "the Brightwater twins"), by its last word: then "gain" and "have". */
const many = (name: string): boolean => /^the\b/i.test(name) && /[^su]s$/i.test(name.trim().split(/\s+/).pop() ?? "");
const gains = (name: string): string => (many(name) ? "gain" : "gains");
const has = (name: string): string => (many(name) ? "have" : "has");

/** On arriving at a stop: the road behind you, the card turned, and what stands there. */
export function arriveSaid(a: Arrival): string[] {
  const k = cardKind(a.stop.card);
  const holds = Math.max(1, a.stop.holds ?? 1);
  const lines = [`The road to ${a.stop.name} takes ${span(a.hours)}. It is ${clock(a.trip.sheet.hour)}.`, `I turn the card: ${k.title}.`, KIND_SAYS[a.stop.kind], a.stop.situation];
  if (a.trip.facing && a.trip.facing.moment.trouble > 0) lines.push("Word of you got here first, after your rest: every way is one step harder.");
  if (holds > 1) lines.push(a.stop.kind === "fight" ? "This will come to a fight." : "This will be a contest, a back-and-forth, not one try.");
  const left = Math.floor((a.trip.adv.deadline.hour - a.trip.sheet.hour) / TRY_HOURS + 1e-9);
  if (a.stop.climax && left < 8) lines.push(left <= 0 ? "There is no time left for even one try." : `There is time for ${left === 1 ? "one try" : `${left} tries`} before ${a.trip.adv.deadline.name}, each half an hour.`);
  return lines;
}

/** The page a stop's card comes with. */
export function stopPage(a: Arrival): { heading: string; his: string[] } {
  const holds = Math.max(1, a.stop.holds ?? 1);
  return { heading: `${a.stop.name}: ${cardKind(a.stop.card).title}`, his: [a.stop.situation, ...(holds > 1 ? ["It comes to a contest."] : [])] };
}

/* ------------------------------ contests (contest.ts) ------------------------------ */

const NOTCHES = (n: number): string => (n === 1 ? "a notch" : `${n} notches`);
const dialNow = (d: Dial): string => `${d.filled} of ${d.notches}`;

/** Said as the narrator unrolls the leather and sets out the dials: who you are up against, and how a round goes. */
export function contestSaid(c: Contest, climax = false): string[] {
  const foes = c.foes.map((f) => `${f.name}, a dial of ${f.notches}`);
  const lines = [
    `I unroll the leather over the map and set out the dials. On my side: ${orWords(foes).replace(/ or /, " and ")}.`,
    `Every try of yours that works puts notches on a dial: 2, or 3 if it uses what is here. Fill every dial on my side and you have won.`,
    `Before each try I show you what is coming at you. A try that works keeps it off you. One that costs you, or fails, and it lands on your own dial: ${c.you.name}, ${c.you.notches} notches. If yours fills, you are taken out.`,
  ];
  if (c.danger) lines.push(`And ${c.danger.name}: a dial of ${c.danger.notches} that fills a notch every round on its own. If it fills before you are done, it is here.`);
  lines.push(climax ? "You may give in at any round: write that you do. Here, at the last place, that loses the story." : "You may give in at any round: write that you do, and you come out of it whole, with nothing to show for it.");
  return lines;
}

// Said so that a name of one or of many reads right: "here comes the hound", "here comes his two mates" is never said.
const BLOW: Record<ContestKind, string[]> = {
  fight: ["Look out: {f}, coming straight at you.", "Now {f}, closing in on you, swinging.", "{f} again, going for you."],
  words: ["Now {f}, with a sharp answer for you.", "Now {f}, pressing you hard in front of everyone.", "{f} again, throwing your own words back at you."],
  struggle: ["Look out: {f}, fighting you every step.", "Now {f}, giving way under you.", "{f} again, pushing back harder than before."],
};

/** What is coming at you this round, when no model says it. */
export function blowLine(c: Contest): string {
  const f = coming(c);
  if (!f) return "";
  const lines = BLOW[c.kind];
  return cap(lines[c.round % lines.length]!.replace("{f}", f.name));
}

/** Said after what is coming, so the player knows what to answer. */
export const BLOW_RULE = "Answer it with what you do: a try that works keeps it off you.";
/** Asked in every later round of a contest, after what is coming. */
export const ASK_ROUND = "What do you do?";

/** What a round did to the dials, one plain sentence each. */
export function roundSaid(r: Round, c: Contest | undefined, kind: ContestKind): string[] {
  const lines: string[] = [];
  // Said so that a name of one or of many reads right: no verb that must agree with it.
  const down: Record<ContestKind, string> = { fight: "down or done with", words: "out of answers", struggle: "beaten" };
  const poss = (name: string): string => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
  const broke: Record<ContestKind, string> = { fight: "has had enough, and breaks off", words: "gives way before it has to", struggle: "gives way" };
  for (const h of r.hits)
    lines.push(
      h.filled >= h.notches
        ? `${cap(NOTCHES(h.n))} on ${poss(h.name)} dial, and it is full: ${h.name}, ${down[kind]}.`
        : h.breaksAt && h.filled >= h.breaksAt
          ? `${cap(NOTCHES(h.n))} on ${poss(h.name)} dial, ${dialNow(h)}, and that is enough: ${h.name} ${broke[kind]}.`
          : `${cap(NOTCHES(h.n))} on ${poss(h.name)} dial: ${dialNow(h)}.`,
    );
  if (!r.hit) lines.push("No notch on any dial.");
  if (r.won) return [...lines, kind === "fight" ? "That is the last of them. You have won the fight." : "That is every dial full. You have won."];
  const you = c?.you;
  if (r.landed && you) lines.push(`${r.landed > 1 ? "It lands hard" : "It lands"}: ${NOTCHES(r.landed)} on your dial, ${dialNow(you)}.`);
  else if (!r.landed && you) lines.push("It does not reach you.");
  if (r.danger?.came && r.danger.save) lines.push(`${cap(r.danger.dial.name)}: it is here. Every way is a step harder now.`, dangerSaveSaid(r.danger.save));
  else if (r.danger?.came) lines.push(`${cap(r.danger.dial.name)}: it is here. Every way is a step harder now, and it put a notch on your dial.`);
  else if (r.danger) lines.push(`${cap(r.danger.dial.name)}: ${dialNow(r.danger.dial)}.`);
  return lines;
}

/** How a save against the danger in a contest went: said after you throw it. */
export const dangerSaveSaid = (save: Save): string => `${saveSaid(save)}${save.kept ? "" : " A notch on your dial."}`;

/** What being taken out means, said for the teller: never death, for the rules never kill you in a contest. */
const TAKEN_MEANS: Record<Exclude<TakenOut, "killed">, string> = {
  wounded: "beaten and left hurt",
  captured: "taken prisoner by those who beat them",
  claimed: "claimed by those who beat them, who take what they want of the player, as the winners do in this world",
  shamed: "shamed in front of everyone and driven off",
  exiled: "driven out, and told never to come back",
};

/**
 * What being taken out means here: one of the world's own (kit.ts, `takenOut`, already held to the content settings),
 * drawn by the seed, never death. `follow` (the dice decide, content.ts): the teller shows what follows, the winners'
 * way; without it, the teller says it and stops, and what follows is the player's.
 */
export function takenOutOf(kit: Pick<WorldKit, "takenOut"> | undefined, seed: string, follow: boolean): { means: Exclude<TakenOut, "killed">; follow: boolean } {
  const pool = (kit?.takenOut ?? []).filter((x): x is Exclude<TakenOut, "killed"> => x !== "killed");
  const list = pool.length ? pool : (["wounded", "captured"] as const);
  return { means: list[Math.floor(seededRng(`taken:${seed}`)() * list.length)]!, follow };
}

/** What the teller must keep true about a round of a contest, added to what it is told of the try. */
export function contestNote(r: Round, kind: ContestKind, blow: string, taken?: { means: Exclude<TakenOut, "killed">; follow: boolean }): string {
  const facts = [`This is one round of a ${kind === "fight" ? "fight" : kind === "words" ? "war of words" : "struggle"}.`];
  if (r.won) facts.push("With this, the player has won it: the last of what stood against them is beaten, gives way, or runs.");
  else if (r.beaten.length) facts.push(`${cap(r.beaten.map((b) => b.name).join(" and "))} ${r.beaten.length > 1 ? "are" : "is"} beaten, but it is not over.`);
  else if (r.hit) facts.push(`It tells on ${r.hits.map((h) => h.name).join(" and ")}, who ${r.hits.length > 1 ? "are" : "is"} still in it.`);
  else facts.push("It does nothing to them.");
  if (!r.won && blow) facts.push(r.landed > 1 ? `What was coming at the player (${blow}) lands hard.` : r.landed ? `What was coming at the player (${blow}) lands.` : `What was coming at the player (${blow}) does not reach them.`);
  if (r.danger?.came) facts.push(`And now ${r.danger.dial.name}: it is here.${r.danger.save ? (r.danger.save.kept ? " The player sees it coming and keeps it off themselves." : " It reaches the player.") : ""}`);
  if (r.taken && taken?.follow) facts.push(`The player is taken out, and here that means they are ${TAKEN_MEANS[taken.means]}. They lost, and the scene goes the winners' way: show it happening, within what this story allows. They are not killed.`);
  else if (r.taken) facts.push(`The player is taken out: overpowered, cornered or shamed off, but not killed${taken ? `; here that means they are ${TAKEN_MEANS[taken.means]}` : ""}. Say it, and do not say what happens after.`);
  return facts.join(" ");
}

/** Said when you are taken out of a contest. */
export function takenSaid(t: Trip, taken: Exclude<Turn["taken"], null>, fell: boolean): string {
  if (taken === "end") return "Your dial is full. You are taken out, here at the last place.";
  const lost = taken.supplies ? " and a supply" : "";
  return fell
    ? `You are taken out. When you come to, it is over, and you are beyond ${placeName(t.adv, t.at)} with nothing to show for it${lost ? ", short a supply" : ""}. Word of it goes ahead: the next place will be a step harder.`
    : `Your dial is full: you are taken out. You come to ${span(taken.hours)} later, beyond ${placeName(t.adv, t.at)}, with nothing to show for it${lost ? ", short a supply" : ""}. It is ${clock(t.sheet.hour)}. Word of it goes ahead: the next place will be a step harder.`;
}

/** Said when you give in. */
export function yieldSaid(t: Trip): string[] {
  if (t.over === "yielded") return ["You give in. I roll up the leather."];
  return [`You give in, and they let you go. You come out of it whole, beyond ${placeName(t.adv, t.at)}, with nothing to show for it. It is ${clock(t.sheet.hour)}.`];
}

/** What a turn led to, beyond the throw itself: one plain sentence each. */
export function turnSaid(turn: Turn): string[] {
  const t = turn.trip;
  const adv = t.adv;
  const lines: string[] = [];
  if (turn.used) lines.push(`That used up ${turn.used.name}. Its card goes back to me.`);
  if (turn.markUsed) lines.push(`You leaned on ${turn.markUsed.name}, and that is spent now.`);
  if (turn.marked) lines.push(markSaid(turn.marked));
  if (turn.round) lines.push(...roundSaid(turn.round, t.facing?.contest, contestKind(turn.outcome.next.stop)));
  if (turn.fell && turn.taken) lines.push("That was the last of your health. You go down.");
  else if (turn.fell) lines.push(`That was the last of your health. You go down, and come to ${span(FALL_HOURS)} later with 1 health. It is ${clock(t.sheet.hour)}.`);
  if (turn.taken) lines.push(takenSaid(t, turn.taken, !!turn.fell));
  if (turn.more && !turn.round) {
    const n = t.facing?.holds ?? 1;
    lines.push(`That is one down. It takes ${n === 1 ? "one more good try" : `${n} more good tries`}.`);
  }
  if (turn.cleared) {
    for (const o of turn.opinions)
      lines.push(
        o.liked
          ? `${o.companion.name} is glad you went about it that way.${o.goodwill ? " Word of it gets about: you gain 1 goodwill." : ""}`
          : `${o.companion.name} would not have gone about it that way, and says so where people can hear.${o.goodwill ? " Word of it gets about: you lose 1 goodwill." : ""}`,
      );
    if (turn.reward) {
      lines.push(turn.reward.says);
      if (turn.reward.loot) {
        const l = adv.loot.find((x) => x.id === turn.reward!.loot);
        if (l) lines.push(`That card is yours to keep: ${l.name}. Using it later makes one way one step easier, once.`);
      }
      if (turn.reward.joins) {
        const c = adv.companions.find((x) => x.id === turn.reward!.joins);
        if (c) lines.push(companionSaid(c));
      }
    }
  }
  if (turn.longWay) lines.push(`You will not get past ${placeName(adv, t.at)}. You go the long way round it: ${span(turn.longWay.hours)}${turn.longWay.supplies ? " and a supply" : ""}. It is ${clock(t.sheet.hour)}.`);
  if (turn.rivalGained && adv.rival && t.over !== "rival") lines.push(`${adv.rival.name} ${gains(adv.rival.name)} ground: ${t.rival} of ${adv.rival.max}.`);
  if (turn.dread && !t.over) lines.push(dreadSaid(turn.dread, t.dread ?? 0));
  return lines;
}

/* ------------------------------ the narrator's side (dread.ts) ------------------------------ */

const STONES = ["no stones", "one stone", "two stones", "three stones", "four stones", "five stones", "six stones", "seven stones", "eight stones", "nine stones"];

/** Said as stones go in the bowl. */
export function dreadSaid(gained: number, now: number): string {
  const drop = gained > 1 ? "I drop two black stones in my bowl" : "I drop a black stone in my bowl";
  const warn = now >= DREAD_SPEND ? " That is enough for me to do something with, at the next place." : now === DREAD_SPEND - 1 ? " One more, and I will use them." : "";
  return `${drop}: ${STONES[now] ?? `${now} stones`} there now.${warn}`;
}

/** What a move does in the rules, in a sentence: said after the narrator tells it. */
export function moveRule(mv: Move): string {
  switch (mv.kind) {
    case "trouble":
      return "Every way past here is a step harder now.";
    case "shut":
      return `The way to ${WAY_OPEN[mv.way!]} here is shut to you.`;
    case "delay":
      return `That costs you time: ${span(DELAY_HOURS)}.`;
    case "hurt":
      return mv.save?.kept ? "You keep it off you: no health lost." : "That costs you 1 health.";
    case "brand":
      return `I write it on a slip and lay it on my side of the table: ${mv.against!.name}. It is against you. Your next try to ${WAY_OPEN[mv.against!.way]}, here or at a later place, throws two dice, and the worse one counts. Then the slip is used up.`;
    case "spoil":
      return `${cap(mv.lever!.name)} is no use to you now.`;
    case "sour":
      return `You can no longer lean on ${mv.lever!.name}.`;
    case "cold":
      return "Word of it gets about: you lose 1 goodwill.";
  }
}

/** What the model is told the move is, so it can show it happening. */
export function moveNote(mv: Move): string {
  switch (mv.kind) {
    case "trouble":
      return "Something new makes this place harder for the player: a new person, a worse mood, a danger they had not seen. Show it arriving.";
    case "shut":
      return `The way to ${WAY_OPEN[mv.way!]} here closes to the player before they try it. Show why.`;
    case "delay":
      return "Something holds the player up for a while. Show what.";
    case "hurt":
      return mv.save?.kept ? "Something here comes at the player before they begin, but they see it in time and keep it off. Show it, without gore." : "Something here hurts the player a little before they begin. Show it, without gore.";
    case "brand":
      return `Something here turns against the player's chances to ${WAY_OPEN[mv.against!.way]}: ${mv.against!.name}. Show how it comes to be so.`;
    case "spoil":
      return `${cap(mv.lever!.name)} stops being any use to the player. Show what happens to it.`;
    case "sour":
      return `What the player had going for them, ${mv.lever!.name}, is lost: it turns, or is forgotten. Show it.`;
    case "cold":
      return "Word of the player sours here: people have heard something against them. Show it.";
  }
}

/** Said before you throw a save: what it is for, and what you need. */
export function saveAsk(save: Save, what: string): string {
  return `${cap(what)}. Throw to keep it off you: the die plus your ${STAT_NAME[save.stat]}${save.add ? ` (+${save.add})` : ""}, ${save.target} or more. Take a die from the box.`;
}

/** Said after a save is thrown: the face, the sum, and whether it is kept off. */
export function saveSaid(save: Save): string {
  const face = `The die shows ${save.natural}.`;
  if (save.natural >= 20) return `${face} A 20 always keeps it off you.`;
  if (save.natural <= 1) return `${face} A 1 never does.`;
  const total = save.natural + save.add;
  return `${face}${save.add ? ` With your ${STAT_NAME[save.stat]}, ${total}.` : ""} ${save.kept ? `That is ${save.target} or more: you keep it off.` : `That is short of ${save.target}: it reaches you.`}`;
}

/** Said before the narrator throws its own die for a question that only luck can settle. */
export function luckAsk(fact: string): string {
  return `Whether ${fact}: nothing here settles that, so luck will. I throw my own die, the pale one. On ${LUCK_YES} or more, yes.`;
}

/** Said after the narrator's die lands: the face and the answer, then (on a yes) what it is worth. */
export function luckSaid(l: Luck, fact: string): [string, ...string[]] {
  const face = `My die shows ${l.natural}.`;
  if (!l.yes) return [`${face} No: it is not so.`];
  return [`${face} Yes: ${fact}.`, `That goes on a card on your side. Lean on it once, and your try to ${WAY_OPEN[l.mark!.way]} here is a step easier.`];
}

/** What the model is told luck decided, so it can show it. */
export function luckNote(l: Luck, fact: string): string {
  return l.yes ? `The narrator's die said yes: it is so, ${fact}. Show it, plainly, as part of this place.` : `The narrator's die said no: it is not so, there is no ${fact.replace(/^(some|a|an|any)\s+/i, "")} here. Say so plainly, and do not offer it another way.`;
}

/** Said as the narrator takes stones out of its bowl to make a move. */
export const spendSaid = (n: number): string => `I take ${STONES[n] ?? `${n} stones`} out of my bowl.`;

/** A fault as said aloud: "you cannot resist an audience" when it reads after "you", else as it was written. */
export function faultSaid(fault: string): string {
  const f = fault.trim().replace(/[.!]+$/, "").replace(/^you\s+/i, "");
  return /^(cannot|can.t|won.t|don.t|can|could|will|won|would|never|must|always|are|do|don|hate|love|need|trust|forget|lose|take|talk|run|keep|give|go|get|let|say|tell|see|want|have|lie|fall|break|act|rush|refuse|believe|think|look|make|leave)\b/i.test(f) ? `you ${f}` : f.charAt(0).toLowerCase() + f.slice(1);
}

/** The narrator offers your fault (dread.ts, tempting). */
export function temptSaid(fault: string, store = "store"): string[] {
  const f = faultSaid(fault);
  const what = f.startsWith("you ") ? `I know you: ${f}.` : `I know your fault: ${f}.`;
  return [what, `Here, it could have its way. Let it, and you take back 1 of your ${store}, but it will make things worse at this place. Will you let it? Write yes or no.`];
}
export const TEMPT_NO = "As you like. It stays in its box.";
export const temptYes = (store = "store"): string => `So be it. Take back 1 of your ${store}.`;

/** Whether a written answer lets the fault have its way, by its words: yes, no, or null when it cannot be told. */
export function temptRead(line: string): boolean | null {
  const l = ` ${line.toLowerCase()} `;
  if (/\b(no|not|never|nope|refuse|resist|don't|do not|won't|will not|hold back|hold it back)\b/.test(l)) return false;
  if (/\b(yes|yeah|yep|aye|sure|ok|okay|let it|i do|i will|give in|go ahead|why not)\b/.test(l)) return true;
  return null;
}

/** Said when you sit down again at a sitting you left: where you were, and how things stand. */
export function backSaid(t: Trip): string[] {
  const at = t.facing ? `We were at ${t.facing.stop.name}, and it still stands in your way.` : t.visited.length ? `You were past ${placeName(t.adv, t.at)}.` : "You had only just set out.";
  return [`You came back. ${at}`, `It is ${clock(t.sheet.hour)}. Everything is where you left it.`];
}

/** Asked after a stop, if you are hurt: rest, or press on. */
export function campAsk(t: Trip): string {
  const full = storeAt(t.level);
  const spent = (t.sheet.store ?? full) < full ? `, and ${t.sheet.store ?? 0} of ${full} left in your ${t.storeName ?? "store"}` : "";
  return `You are past ${placeName(t.adv, t.at)}, with ${t.sheet.health} health of ${HEALTH_MAX}${spent}. Rest here, or press on? Resting heals ${REST_HEALS}${spent ? " and fills your " + (t.storeName ?? "store") + " again" : ""} and eats a supply, but takes ${span(REST_HOURS)}, and word of you goes ahead: the next place will be a step harder. Write which.`;
}
export const PRESS_ON = "You press on.";

export function restSaid(r: Rested): string[] {
  const s = r.trip.sheet;
  return [
    r.ate ? `You rest, and eat. ${r.healed ? `You get back ${r.healed} health (${s.health} now).` : "It does you no more good."}` : `You rest with nothing to eat. You get back ${r.healed} health (${s.health} now).`,
    `It is ${clock(s.hour)}.`,
  ];
}

/** Said when the adventure is over. */
export function endSaid(t: Trip): string[] {
  const adv = t.adv;
  if (t.over === "won") return [adv.won, "That is the adventure, and you won it."];
  if (t.over === "deadline") return [adv.deadline.lost, "That is the adventure, and it went against you."];
  if (t.over === "rival") return [adv.rival?.lost ?? "Someone else got there first.", "That is the adventure, and it went against you."];
  if (t.over === "taken") return [`You were taken out at ${climaxOf(adv)?.name ?? "the last place"}, and the job is lost. That is the adventure, and it went against you.`];
  if (t.over === "yielded") return [`You gave in at ${climaxOf(adv)?.name ?? "the last place"}, and the job is lost. That is the adventure, and it went against you.`];
  return [`You are turned back from ${climaxOf(adv)?.name ?? "the last place"}, with no way left to try. That is the adventure, and it went against you.`];
}

/** The last page: how it went. */
export function endPage(t: Trip): { heading: string; his: string[] } {
  return { heading: t.over === "won" ? "Won" : "Lost", his: [...endSaid(t).slice(0, 1), `Places reached: ${t.visited.map((id) => placeName(t.adv, id)).join(", ") || "none"}. It was ${clock(t.sheet.hour)}.`] };
}

/* ----------------------------- reading what is written between stops ----------------------------- */

/** Whether a line written after a stop means to rest. Anything else presses on. */
export function campRead(line: string): "rest" | "on" {
  const l = line.toLowerCase();
  if (/\b(press on|push on|keep going|go on|move on|carry on|hurry|no rest|don'?t rest|not rest|skip)\b/.test(l)) return "on";
  return /\b(rest|rests|sleep|sleeps|camp|nap|lie down|breather|catch my breath|recover|heal|bind|patch|eat|wait)\b/.test(l) ? "rest" : "on";
}

/** Which card a line written at a fork picks: by side, by name, or by a word of what was said about it. Null when it cannot tell. */
export function forkRead(line: string, stops: RoadStop[]): string | null {
  const l = ` ${line.toLowerCase()} `;
  // By number, when there are more than two to pick from: "3", "the third", "number two".
  if (stops.length > 2) {
    const n = /\b([1-9])\b/.exec(l)?.[1] ?? null;
    const ord = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"].findIndex((w) => new RegExp(`\\b${w}\\b`).test(l));
    const word = ["one", "two", "three", "four", "five", "six", "seven"].findIndex((w) => new RegExp(`\\b(?:number|no\\.?) ${w}\\b`).test(l));
    const i = n ? Number(n) - 1 : ord >= 0 ? ord : word;
    if (i >= 0 && i < stops.length) return stops[i]!.id;
  }
  const left = /\b(left|first|former)\b/.test(l), right = /\b(right|second|latter|other)\b/.test(l);
  if (left !== right) return stops[left ? 0 : 1]?.id ?? null;
  const words = (s: string) => s.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !["the", "where", "someone", "which", "their", "there", "with", "that", "this"].includes(w));
  const score = stops.map((s) => [...words(s.name), ...words(s.teaser), ...words(cardKind(s.card).title)].filter((w) => l.includes(w)).length);
  const best = Math.max(...score);
  if (best === 0 || score.filter((n) => n === best).length > 1) return null;
  return stops[score.indexOf(best)]!.id;
}

const WAY_TRY: Record<Way, string> = { talk: "talks", sneak: "goes unseen", force: "goes at a thing head on", pay: "pays" };

const orWords = (xs: string[]): string => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);
const steps = (n: number): string => (n === 1 ? "a step" : `${n} steps`);

/** A tag as said after "where": "a lock", but "an oath", "pressing someone", "the watch", "crowds" as they are. */
function withArticle(tag: string): string {
  const t = tag.trim();
  const first = t.split(/\s+/)[0]!.toLowerCase();
  if (/^(a|an|the|some|any|your|their|his|her)$/.test(first) || /ing$/.test(first) || (/s$/.test(first) && !/ss$/.test(first) && t.split(/\s+/).length === 1)) return t;
  return `${/^[aeiou]/i.test(t) ? "an" : "a"} ${t}`;
}

/** When an ability applies, in words: "a try that talks", "when a lock or a gate comes into it", "any try". */
function whenSaid(a: Ability): string {
  if (a.tags.length) return `a try where ${orWords(a.tags.slice(0, 3).map(withArticle))} comes into it`;
  if (a.ways.length) return `a try that ${orWords(a.ways.map((w) => WAY_TRY[w]))}`;
  return "any try";
}

/** What an ability does in the rules, in a sentence or two: said when it is offered and written on the first page. */
export function abilityRule(a: Ability, store = "store"): string {
  const how = a.store ? `For 1 of your ${store}` : a.often === "always" ? "Whenever it fits" : a.often === "stop" ? "Once at each stop" : "Once a story";
  const when = whenSaid(a);
  const limit = a.limit ? ` Only ${a.limit.replace(/^only\s+/i, "").replace(/[.]+$/, "")}.` : "";
  switch (a.does) {
    case "flourish":
      return "It always works and needs no die. It changes nothing by itself, but use it cleverly, towards a way past, and it can leave something here to lean on.";
    case "ease":
      return `${how}, ${when} is ${steps(a.much)} easier.${limit}`;
    case "edge":
      return `${how}, ${when} is thrown with two dice, and the better one counts.${limit}`;
    case "open":
      return `${how}, ${a.ways.length ? `the way to ${orWords(a.ways.map((w) => WAY_OPEN[w]))}` : "a way"} that is shut here, or not there at all, is open to you for one try.${limit}`;
    case "ward":
      return `${how}, ${when} costs ${a.much} less if it goes wrong.${limit}`;
    case "slip":
      return `${how}, ${when} that fails works at a cost instead.${limit}`;
    case "aid":
      return `${how}, when someone walks with you, ${when} counts ${a.much} higher.${limit}`;
    case "sway":
      return `${how}, one person here is warmer to you: talking to them is ${steps(a.much)} easier for the rest of the stop. Write that you use it, or use it as you talk.${limit}`;
    case "learn":
      return `${how}, write that you use it, and I tell you one true, useful thing here, which makes one try a step easier.${limit}`;
    case "mark":
      return `${how}, write that you use it, and it sets something up here that makes ${a.much === 1 ? "one try" : `${a.much} tries`} a step easier.${limit}`;
    case "mend":
      return `${how}, write that you use it, and you get back ${a.much} ${a.of ?? "health"}.${limit}`;
    case "reach":
      return `${how}, in a fight, you strike from out of their reach: the blow back that round is one lighter.${limit}`;
    case "bind":
      return `${how}, in a fight, the next blow coming at you does not come.${limit}`;
    case "sweep":
      return `${how}, in a fight, what your try does goes on every foe at once, not only one.${limit}`;
    case "drain":
      return `${how}, in a fight, what your try takes off them comes back off your own dial.${limit}`;
  }
}

/** An ability in a sentence, for the first page: its kind, its name, what it looks like and what it does. */
export function abilityLine(a: Ability, store = "store"): string {
  return `Your ${shapeOf(a)}, ${a.name}: ${a.looks.replace(/[.]+$/, "")}. ${abilityRule(a, store)}`;
}

/** What is written on an ability's card, under its picture: its kind, what it looks like, and what it does. */
export function abilityCardText(a: Ability, store = "store"): string {
  return `${cap(shapeOf(a))}. ${a.looks.replace(/[.]+$/, "")}. ${abilityRule(a, store)}`;
}

/** What is written on a companion's card: who they are, the stat they lift, and what they like and hate. */
export function companionCardText(c: Companion): string {
  return `${c.who.replace(/[.]+$/, "")}. Your ${STAT_NAME[c.stat]} counts one higher. Likes it when you ${WAY_DOING[c.likes]}; hates it when you ${WAY_DOING[c.dislikes]}.`;
}

/** What is written on a thing you keep. */
export const lootCardText = (l: { way: Way }): string => `Use it to ${WAY_OPEN[l.way]}: that try is one step easier, once.`;

/** What is written on the slip of a mark you made. */
export const markCardText = (l: Lever): string => `Something to lean on when you ${WAY_OPEN[l.way]}: that try is a step easier${(l.uses ?? 1) > 1 ? `, ${l.uses} times` : ", once"}.${l.edge ? " In a fight it counts one more against a foe." : ""}`;

/**
 * Your sheets, the stack by your left hand that you can pick up and leaf through: who you are and how you stand,
 * what you can do, who walks with you, and what you carry. Set out again whenever any of it changes.
 */
export function sheetPages(t: Trip): { heading: string; his: string[] }[] {
  const s = t.sheet;
  const store = t.storeName ?? "store";
  const st = s.stats;
  const me = yourPiece({ id: "you", name: "you", stats: st, at: [0, 0], level: t.level });
  const statLines = [...STATS.map((k) => `${STAT_NAME[k]} ${st[k]}: ${STAT_MEANS[k]}.`), ...(typeof st.power === "number" ? [`${s.powerName ?? "Power"} ${st.power}.`] : [])];
  const pages: { heading: string; his: string[] }[] = [
    {
      heading: "Who you are",
      his: [
        t.adv.who,
        `Level ${t.level}. Health ${s.health} of ${HEALTH_MAX}. Supplies ${s.supplies}. Goodwill ${s.goodwill}. ${cap(store)} ${s.store ?? 0} of ${storeAt(t.level)}.`,
        `Your strengths, each out of 4:\n${statLines.join("\n")}`,
        `In a fight: Stamina ${me.stamina}, Composure ${me.composure}, Defense ${me.defense}.`,
      ],
    },
  ];
  // What you can do, four to a page, so each can be read.
  const can = [...t.abilities.map((a) => abilityLine(a, store)), storeLine(store, s.store ?? 0)];
  for (let i = 0; i < can.length; i += 4) pages.push({ heading: i ? "What you can do, more" : "What you can do", his: can.slice(i, i + 4) });
  const with_ = withParty(t).map((id) => companionOf(t.adv, id)).filter((c): c is Companion => !!c);
  const people = [
    ...with_.map((c) => `${c.name}: ${companionCardText(c)}`),
    ...(t.adv.courted ? [`${t.adv.courted.name}, whom you would win: ${t.adv.courted.who.replace(/[.]+$/, "")}.`] : []),
    ...(t.adv.rival ? [`${t.adv.rival.name}, your rival: ${t.rival} of ${t.adv.rival.max} seals.`] : []),
  ];
  pages.push({ heading: "Who walks with you", his: people.length ? people : ["No one. You go alone."] });
  const things = [
    ...t.kept.map((id) => lootOf(t.adv, id)).filter((l) => !!l).map((l) => `${l!.name}. ${lootCardText(l!)}`),
    ...t.marks.map((l) => `${l.name}. ${markCardText(l)}`),
    ...(t.against ?? []).map((a) => `Against you, the narrator's slip: ${a.name}. Your next try to ${WAY_OPEN[a.way]} throws two dice, and the worse counts.`),
  ];
  pages.push({ heading: "What you carry", his: things.length ? things : ["Nothing yet but what you stand up in."] });
  return pages;
}

/** The store in a sentence (docs/SYSTEMS.md, 2.2). */
export function storeLine(store: string, n: number): string {
  return `Your ${store}: ${n} of it. Some of what you can do costs 1 of it. You can also give a try everything you have: write that you do, and 1 of it makes the try a step easier. Resting fills it again.`;
}

const WAY_OPEN: Record<Way, string> = { talk: "talk", sneak: "go unseen", force: "go at it head on", pay: "pay" };

/** Said at a level-up, as two abilities are dealt face up. */
export function levelSaid(offers: Ability[], store = "store"): string[] {
  const side = ["On your left", "On your right"];
  return [
    "You have come a long way tonight, and the road has taught you something. I deal you two cards, face up. Keep one.",
    ...offers.map((a, i) => `${side[i] ?? "And"}, a ${shapeOf(a)}, ${a.name}: ${a.looks.replace(/[.]+$/, "")}. ${abilityRule(a, store)}`),
    "Touch the one you want, or write which.",
  ];
}
export const LEVEL_AGAIN = "Which of the two? The one on your left, or the one on your right?";
export const levelTaken = (a: Ability): string => `${a.name}, then. It is yours from the next stop on.`;

/** What came of an ability used without a die (adventure.ts, useAbility), said after the telling. */
export function usedSaid(u: Used, store = "store"): string[] {
  const a = u.ability;
  switch (u.effect) {
    case "try":
      return [`Your ${a.name} is for a try. Write what you do to get past, and use it as you do.`];
    case "spent":
      return [a.store && a.often === "always" ? `You have no ${store} left for your ${a.name}. Resting fills it again.` : `Your ${a.name} is used ${a.often === "story" ? "for this story" : "here"} already.`];
    case "nothing":
      return a.does === "flourish" ? ["It works, as it always does. It does not help you past by itself: use it towards a way past, with something that is here, and it will."] : ["Nothing comes of it here."];
    case "mark":
      return [`That sets something up here: ${u.mark!.name}. It makes a try that ${WAY_TRY[u.mark!.way]} a step easier.`];
    case "mend":
      return [u.mended!.amount ? `You get back ${u.mended!.amount} ${u.mended!.kind}.` : `You have all the ${u.mended!.kind} you can carry already.`];
    case "warm":
      return ["They warm to you: talking to them is a step easier for the rest of this place."];
  }
}

/** A mark left by a try, said as it is laid down. */
export const markSaid = (l: Lever): string => `That leaves something you can lean on later: ${l.name}. I write it on a slip and lay it by you.`;

/** Which of two things a line picks: by left or right, or by the words of its name. -1 when it cannot be told. */
export function pickRead(line: string, names: string[]): number {
  const l = ` ${line.toLowerCase()} `;
  const left = /\b(left|first|former)\b/.test(l), right = /\b(right|second|latter|other)\b/.test(l);
  if (left !== right) return left ? 0 : 1;
  const score = names.map((n) => n.toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 2 && l.includes(w)).length);
  const best = Math.max(...score);
  if (best <= 0 || score.filter((n) => n === best).length > 1) return -1;
  return score.indexOf(best);
}
