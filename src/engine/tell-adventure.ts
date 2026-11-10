/**
 * A whole adventure in plain words: what the narrator says at the start, on the road, at a fork, on arriving, and at
 * the end. The table (preview/table.ts) and the text playthrough (scripts/adventure.ts) both speak through these,
 * so what is read in the script is what is said in the room.
 */
import { FALL_HOURS, HEALTH_MAX, placeName, REST_HEALS, REST_HOURS, type Adventure, type Companion, type Arrival, type Rested, type RoadStop, type Trip, type Turn } from "./adventure.js";
import { cardKind, FAMILY_SAYS } from "./cards.js";
import { perkOf, type Perk } from "./hero.js";
import { STATS, type Way } from "./moment.js";
import { TRY_HOURS } from "./moment.js";
import { clock, KIND_SAYS, span, STAT_MEANS, STAT_NAME } from "./tell.js";

const WAY_DOING: Record<Way, string> = { talk: "talk your way past", sneak: "slip by unseen", force: "go at a thing head on", pay: "pay your way" };

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const climaxOf = (adv: Adventure): RoadStop | undefined => adv.stops.find((s) => s.climax);

/** The deadline in a sentence, with what it looks like in the room. */
export function deadlineSaid(adv: Adventure): string {
  const night = adv.deadline.hour > 24;
  return `The clock is against you: at ${adv.deadline.name}, ${clock(adv.deadline.hour)}, it is too late. ${night ? "The light in the room is the clock, and after dark the candles are: when they have burnt down, it is morning." : "The light in the room is the clock."}`;
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
  if (adv.rival) lines.push(`And this is ${adv.rival.name}, ${adv.rival.who}. Every try of yours that fails, ${adv.rival.name} gains ground, and I put a dark seal on that card. At ${adv.rival.max} seals, ${adv.rival.name} has won.`);
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
      `Your strengths, each out of 4: ${STATS.map((k) => `${STAT_NAME[k]} ${s[k]}`).join(", ")}. When a try leans on one, that many small weights go in your pan of the balance.`,
      ...t.perks.map((id) => perkOf(id)).filter((p): p is Perk => !!p).map(knackLine),
      deadlineSaid(adv),
      ...(adv.rival ? [`${adv.rival.name} gains ground on every try of yours that fails. At ${adv.rival.max}, ${adv.rival.name} has won.`] : []),
    ],
  };
}

/** At a fork: the two face-down cards, what can be told of each, and which one a companion would take. */
export function forkSaid(t: Trip, stops: RoadStop[], hours: number[], leaning: { name: string; side: number } | null): string[] {
  const side = ["On your left", "On your right"];
  const lines = ["The road splits here, and I lay out two cards. The colour of a card's back tells you what kind of thing waits there."];
  stops.forEach((s, i) => lines.push(`${side[i] ?? "And"}, ${FAMILY_SAYS[cardKind(s.card).family]}: ${s.teaser}. ${cap(span(hours[i] ?? 0))} away.`));
  if (leaning) lines.push(`${leaning.name} nods at the card on your ${leaning.side ? "right" : "left"}.`);
  lines.push("Pick one: touch it, or write which.");
  return lines;
}
export const FORK_AGAIN = "I cannot tell which you mean. The one on your left, or the one on your right?";

/** On arriving at a stop: the road behind you, the card turned, and what stands there. */
export function arriveSaid(a: Arrival): string[] {
  const k = cardKind(a.stop.card);
  const holds = Math.max(1, a.stop.holds ?? 1);
  const lines = [`The road to ${a.stop.name} takes ${span(a.hours)}. It is ${clock(a.trip.sheet.hour)}.`, `I turn the card: ${k.title}.`, KIND_SAYS[a.stop.kind], a.stop.situation];
  if (a.trip.facing && a.trip.facing.moment.trouble > 0) lines.push("Word of you got here first, after your rest: every way is one step harder.");
  if (holds > 1) {
    lines.push(a.stop.kind === "fight" ? `It will take ${holds} good tries to come out of this: each one that works settles one of them.` : `It will take ${holds} good tries to see this through.`);
    lines.push("Here a way that fails stays open to you, but every miss makes everything here a step harder.");
  }
  const left = Math.floor((a.trip.adv.deadline.hour - a.trip.sheet.hour) / TRY_HOURS + 1e-9);
  if (a.stop.climax && left < 8) lines.push(left <= 0 ? "There is no time left for even one try." : `There is time for ${left === 1 ? "one try" : `${left} tries`} before ${a.trip.adv.deadline.name}, each half an hour.`);
  return lines;
}

/** The page a stop's card comes with. */
export function stopPage(a: Arrival): { heading: string; his: string[] } {
  const holds = Math.max(1, a.stop.holds ?? 1);
  return { heading: `${a.stop.name}: ${cardKind(a.stop.card).title}`, his: [a.stop.situation, ...(holds > 1 ? [`It takes ${holds} good tries.`] : [])] };
}

/** What a turn led to, beyond the throw itself: one plain sentence each. */
export function turnSaid(turn: Turn): string[] {
  const t = turn.trip;
  const adv = t.adv;
  const lines: string[] = [];
  if (turn.used) lines.push(`That used up ${turn.used.name}. Its card goes back to me.`);
  if (turn.fell) lines.push(`That was the last of your health. You go down, and come to ${span(FALL_HOURS)} later with 1 health. It is ${clock(t.sheet.hour)}.`);
  if (turn.more) {
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
  if (turn.rivalGained && adv.rival && t.over !== "rival") lines.push(`${adv.rival.name} gains ground: ${t.rival} of ${adv.rival.max}.`);
  return lines;
}

/** Asked after a stop, if you are hurt: rest, or press on. */
export function campAsk(t: Trip): string {
  return `You are past ${placeName(t.adv, t.at)}, with ${t.sheet.health} health of ${HEALTH_MAX}. Rest here, or press on? Resting heals ${REST_HEALS} and eats a supply, but takes ${span(REST_HOURS)}, and word of you goes ahead: the next place will be a step harder. Write which.`;
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
  const left = /\b(left|first|former)\b/.test(l), right = /\b(right|second|latter|other)\b/.test(l);
  if (left !== right) return stops[left ? 0 : 1]?.id ?? null;
  const words = (s: string) => s.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !["the", "where", "someone", "which", "their", "there", "with", "that", "this"].includes(w));
  const score = stops.map((s) => [...words(s.name), ...words(s.teaser), ...words(cardKind(s.card).title)].filter((w) => l.includes(w)).length);
  const best = Math.max(...score);
  if (best === 0 || score.filter((n) => n === best).length > 1) return null;
  return stops[score.indexOf(best)]!.id;
}

const WAY_TRY: Record<Way, string> = { talk: "talks", sneak: "goes unseen", force: "goes at a thing head on", pay: "pays" };

/** A knack in a sentence, for the first page and when one is offered. */
export function knackLine(p: Perk): string {
  return `Your knack, ${p.name}: ${p.says}. Once at each stop, a try that ${WAY_TRY[p.way]} is a step easier.`;
}

/** Said at a level-up, as two knacks are dealt face up. */
export function levelSaid(offers: Perk[]): string[] {
  const side = ["On your left", "On your right"];
  return [
    "You have come a long way tonight, and the road has taught you something. I deal you two cards, face up. Keep one.",
    ...offers.map((p, i) => `${side[i] ?? "And"}, ${p.name}: ${p.says}. Once at each stop, a try that ${WAY_TRY[p.way]} is a step easier.`),
    "Touch the one you want, or write which.",
  ];
}
export const LEVEL_AGAIN = "Which of the two? The one on your left, or the one on your right?";
export const levelTaken = (p: Perk): string => `${p.name}, then. It is yours from the next stop on.`;

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
