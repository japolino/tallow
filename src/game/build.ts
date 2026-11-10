/**
 * Building an adventure for a character card (docs/DESIGN.md, 3.1). The trope's skeleton is one of the made-up
 * adventures (content/adventures.ts): its places and roads, how hard every way is at every stop, what each thing
 * there helps with, the clock, the rival. All of that is kept exactly. A model writes only the words: names, what
 * stands at each stop, what is won there. Code checks every field and keeps the skeleton's words for any that are
 * missing or too long, so a bad answer can make an adventure duller, never broken or unfair.
 *
 * The card's own character takes the part the trope has for them: in a rescue they walk with you from the start (a
 * companion, docs/DESIGN.md, 5); in a courtship they are the one you court, which is never offered for anyone the card
 * reads as a child (7).
 */
import { COURTSHIP, RESCUE } from "../content/adventures.js";
import type { Adventure, Companion, RoadStop } from "../engine/adventure.js";
import { cardKind } from "../engine/cards.js";
import { STATS, WAYS, type Stat, type Way } from "../engine/moment.js";
import { clock } from "../engine/tell.js";
import { cardText, courtable, type CardInfo, type Trope } from "./card.js";
import { firstJson, type Ask, type Message } from "./prompts.js";

export const SKELETONS: Record<Trope, Adventure> = { rescue: RESCUE, courtship: COURTSHIP };

/** The id the card's own character has in a rescue, as a companion. */
export const FRIEND = "friend";

/** The words of an adventure, keyed by the skeleton's ids: what a model writes. */
export interface Words {
  title: string;
  goal: string;
  won: string;
  /** How it ends if you are too late. The hour and its name stay the skeleton's, so the clock and the words agree. */
  deadline: { lost: string };
  /** The card character's name in English letters, when the card writes it in another script. */
  called?: string;
  places: Record<string, string>;
  stops: Record<string, { situation: string; teaser: string; levers: Record<string, string>; reward?: string }>;
  companions: Record<string, { name: string; who: string }>;
  loot: Record<string, string>;
  /** In a rescue: the card's character, who comes with you. */
  friend?: { who: string; good_at: Stat; likes: Way; dislikes: Way };
  courted?: { who: string };
  rival?: { name: string; who: string; lost: string };
}

/** The made-up adventure's own words, in the shape a model is asked to fill. */
export function wordsOf(adv: Adventure): Words {
  const w: Words = {
    title: adv.title,
    goal: adv.goal,
    won: adv.won,
    deadline: { lost: adv.deadline.lost },
    places: Object.fromEntries(adv.places.map((p) => [p.id, p.name])),
    stops: Object.fromEntries(
      adv.stops.map((s) => [s.id, { situation: s.situation, teaser: s.teaser, levers: Object.fromEntries(s.levers.map((l) => [l.id, l.name])), ...(s.reward ? { reward: s.reward.says } : {}) }]),
    ),
    companions: Object.fromEntries(adv.companions.map((c) => [c.id, { name: c.name, who: c.who }])),
    loot: Object.fromEntries(adv.loot.map((l) => [l.id, l.name])),
  };
  if (adv.trope === "rescue") w.friend = { who: "who they are, in a line", good_at: "charm", likes: "talk", dislikes: "force" };
  if (adv.courted) w.courted = { who: adv.courted.who };
  if (adv.rival) w.rival = { name: adv.rival.name, who: adv.rival.who, lost: adv.rival.lost };
  return w;
}

const DIFF = ["easy", "fair", "hard", "very hard"];
const WAY_WORD: Record<Way, string> = { talk: "talk", sneak: "sneak", force: "force", pay: "pay" };

/** Names in another script (Hangul, kana, Cyrillic...) are asked for in English letters too, since the game's words are English. */
export const foreignName = (name: string): boolean => /[^\p{Script=Latin}\p{N}\p{P}\p{Zs}]/u.test(name);

/** What is fixed at each stop, in plain words, so the situation the model writes fits the rules. */
function factsOf(adv: Adventure): string {
  return adv.stops
    .map((s) => {
      const ways = WAYS.filter((w) => s.ways[w])
        .map((w) => `${WAY_WORD[w]} ${DIFF[s.ways[w]!.difficulty]}${w === "pay" ? ` (the price is ${s.ways[w]!.price ?? 0} supplies: say what is paid for)` : ""}`)
        .join(", ");
      const levers = s.levers.map((l) => `"${l.id}" helps ${WAY_WORD[l.way]}`).join("; ");
      const reward = s.reward?.loot ? ` Getting past gives the thing "${s.reward.loot}".` : s.reward?.joins ? ` Getting past, "${s.reward.joins}" joins you.` : "";
      const here = adv.courted && s.card === adv.courted.card ? " The one being courted is here, and is the person in the way." : "";
      return `- ${s.id}: ${s.kind === "fight" ? "a fight" : s.kind === "person" ? "a person in the way" : "an obstacle"}${s.climax ? ", THE LAST STOP" : ""}. Its card is "${cardKind(s.card).title}": what stands here should fit that card.${here} Ways: ${ways}. Things there: ${levers || "none"}.${reward}`;
    })
    .join("\n");
}

export function buildMessages(card: CardInfo, trope: Trope): Message[] {
  const adv = SKELETONS[trope];
  const role =
    trope === "rescue"
      ? `${card.name} is the card's character. In this rescue someone ${card.name} loves, needs or owes has been taken, and ${card.name} walks the road with the player from the start, as a companion. Invent the one who was taken, from the card's world. Write "friend" for ${card.name}: "who" is one line about them; "good_at" is the one of brawn, cunning, charm, wits they are best at; "likes" and "dislikes" are ways (talk, sneak, force, pay) they approve and disapprove of, different from each other.`
      : `${card.name} is the card's character, and the one the player is courting tonight. Write "courted" for them: "who" is one line about them. The rival is someone else who wants ${card.name}'s heart: invent them.`;
  const system = [
    "You write the words of a short tabletop adventure. The rules and every number are fixed already; you only write the words, in the world of a character card.",
    "You are given the adventure as it is written for a made-up world, as JSON. Rewrite every value for the card's world and people, and keep every key exactly as it is. Do not add or remove keys.",
    "Every name must be new and belong to the card's world. Keep the same shape of story: the same kinds of stops in the same places, the same things to use at each, the same rewards. Move it all into the card's own setting: a modern card gets a modern road, a strange world its own kind of trouble.",
    'A "reward" is said after the player gets past, however they did it (kind words, a bribe, a theft, a fight): say how the thing comes to them in words that fit any of those, such as finding it, being left with it, or taking it, never only a kind handing-over.',
    "The keys are only labels. A thing keyed \"furnace\" or \"fiddle\" can become anything in the card's world that helps the same way; only its value, what it is called, is shown.",
    'Each "situation" is 2 to 4 short sentences, in the second person ("you"), saying what stands in the way and naming every thing there to use (its value under "levers" is what it is called, in a few words). If paying is a way at that stop, the situation says what is paid for and how much, in supplies.',
    "The stops in your way are about the job, never about the player's own feelings. Nobody in them is a child unless the card says so, and no romance involves anyone the card says is a child. Nothing sexual or explicit, and nothing hateful, whatever the card has: leave all of that out. A courtship is about winning a heart, told as a fairy tale would tell it.",
    "Write plainly, as a narrator would say it aloud. No markdown. Answer with the JSON only.",
  ].join("\n");
  const user = [
    `THE CARD\n${cardText(card)}`,
    `THE TROPE: ${trope}. ${role}`,
    `THE CLOCK: it starts at ${clock(adv.startHour)} and is lost at ${clock(adv.deadline.hour)} (${adv.deadline.name}). Write the times of day to fit.`,
    ...(foreignName(card.name) ? [`The card writes the name "${card.name}" in another script. Add a key "called": the name in English letters, and use it everywhere.`] : []),
    `WHAT IS FIXED AT EACH STOP (do not change it, write words that fit it):\n${factsOf(adv)}`,
    `THE ADVENTURE TO REWRITE (keep the keys):\n${JSON.stringify(wordsOf(adv), null, 1)}`,
  ].join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/* ------------------------------ checking what came back ------------------------------ */

const plain = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/[*_#`]+/g, "").replace(/\s+/g, " ").trim();
  return s && s.length <= max && !/[{}<>]/.test(s) ? s : null;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
/** Words a line might use for a thing, from its name: the longer words in it. */
export const wordsFor = (name: string): string[] => {
  const ws = name.toLowerCase().replace(/[^\p{L}' -]/gu, " ").split(/\s+/).filter((w) => w.length > 3 && !["their", "there", "with", "from", "that", "this", "your", "under", "over"].includes(w));
  return [...new Set([name.toLowerCase(), ...ws])].slice(0, 6);
};

/** How many of the model's fields were used, out of how many there were. */
export interface Built {
  adv: Adventure;
  used: number;
  of: number;
}

/** Put a model's words on the skeleton, field by field, keeping the skeleton's words for anything that does not check. */
export function applyWords(trope: Trope, card: CardInfo, raw: unknown, seed: string): Built {
  const base = SKELETONS[trope];
  const w = obj(raw);
  let used = 0, of = 0;
  const take = (v: unknown, max: number, fallback: string): string => {
    of++;
    const s = plain(v, max);
    if (s) used++;
    return s ?? fallback;
  };

  const places = obj(w.places);
  const stops = obj(w.stops);
  const comps = obj(w.companions);
  const loot = obj(w.loot);
  const placeName = (id: string, fallback: string) => take(places[id], 36, fallback);
  // The card's character, by the name the words will use.
  const name = foreignName(card.name) ? plain(w.called, 30) ?? card.name : card.name;
  const names = new Map(base.places.map((p) => [p.id, placeName(p.id, p.name)]));

  const adv: Adventure = {
    ...base,
    id: `${trope}-card`,
    title: take(w.title, 40, base.title),
    goal: take(w.goal, 700, base.goal),
    won: take(w.won, 500, base.won),
    seed: hashSeed(seed),
    who: GUEST,
    deadline: { ...base.deadline, lost: take(obj(w.deadline).lost, 400, base.deadline.lost) },
    places: base.places.map((p) => ({ ...p, name: names.get(p.id)! })),
    stops: base.stops.map((s): RoadStop => {
      const ws = obj(stops[s.id]);
      const lv = obj(ws.levers);
      return {
        ...s,
        name: names.get(s.id)!,
        situation: take(ws.situation, 900, s.situation),
        teaser: take(ws.teaser, 120, s.teaser),
        levers: s.levers.map((l) => {
          const name = take(lv[l.id], 60, l.name);
          return { ...l, name, words: name === l.name ? l.words : wordsFor(name) };
        }),
        ...(s.reward ? { reward: { ...s.reward, says: take(ws.reward, 400, s.reward.says) } } : {}),
      };
    }),
    companions: base.companions.map((c) => ({ ...c, name: take(obj(comps[c.id]).name, 30, c.name), who: take(obj(comps[c.id]).who, 200, c.who) })),
    loot: base.loot.map((l) => {
      const name = take(loot[l.id], 40, l.name);
      return { ...l, name, words: name === l.name ? l.words : wordsFor(name) };
    }),
  };

  if (trope === "rescue") {
    const f = obj(w.friend);
    const stat = STATS.includes(f.good_at as Stat) ? (f.good_at as Stat) : "charm";
    const likes = WAYS.includes(f.likes as Way) ? (f.likes as Way) : "talk";
    const dislikes = WAYS.includes(f.dislikes as Way) && f.dislikes !== likes ? (f.dislikes as Way) : likes === "force" ? "sneak" : "force";
    const friend: Companion = { id: FRIEND, name, card: "companion", who: take(f.who, 200, `${name}, who asked for your help`), stat, likes, dislikes };
    adv.companions = [...adv.companions, friend];
    adv.party = [FRIEND];
  }
  if (trope === "courtship" && base.courted) adv.courted = { ...base.courted, name, who: take(obj(w.courted).who, 240, "the one you have come for") };
  if (base.rival) {
    const r = obj(w.rival);
    adv.rival = { ...base.rival, name: take(r.name, 30, base.rival.name), who: take(r.who, 200, base.rival.who), lost: take(r.lost, 400, base.rival.lost) };
  }
  return { adv, used, of };
}

/** Who you are when nobody has said: the skeleton's own hero belongs to its made-up world. */
const GUEST = "You are a traveller who has come this way tonight.";

/** With no model, or nothing usable from one: the made-up adventure, with the card's character in their part. */
export function fallbackAdventure(trope: Trope, card: CardInfo, seed: string): Adventure {
  const base = SKELETONS[trope];
  if (trope === "courtship" && base.courted) {
    // The made-up beloved's name is the card character's throughout.
    const swap = (s: string): string => s.split(base.courted!.name).join(card.name);
    const json = JSON.parse(swap(JSON.stringify(base))) as Adventure;
    return { ...json, id: `${trope}-card`, seed: hashSeed(seed), who: GUEST, courted: { ...base.courted, name: card.name, who: "the one you have come for" } };
  }
  return applyWords("rescue", card, {}, seed).adv;
}

/** Below this share of fields usable, the answer is thrown away and the made-up adventure is played instead. */
const ENOUGH = 0.6;

/** Build the adventure for a card: ask the model (twice at most), check its words, and fall back if they will not do. */
export async function buildAdventure(ask: Ask | null, card: CardInfo, trope: Trope, seed: string): Promise<Adventure> {
  const t: Trope = trope === "courtship" && !courtable(card) ? "rescue" : trope;
  if (ask) {
    for (let i = 0; i < 2; i++) {
      try {
        const text = await ask(buildMessages(card, t), "builder");
        const built = applyWords(t, card, firstJson(text), seed);
        if (built.used / built.of >= ENOUGH) return built.adv;
      } catch {
        // Try again, then fall back.
      }
    }
  }
  return fallbackAdventure(t, card, seed);
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}
