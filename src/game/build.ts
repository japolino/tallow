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
import { CITY_COURTSHIP, COURTSHIP, NIGHT_RESCUE, RESCUE } from "../content/adventures.js";
import { partOf, type Adventure, type Companion, type RoadStop } from "../engine/adventure.js";
import { KEYS } from "../engine/clues.js";
import { ageFrom } from "../engine/content.js";
import { STATS, WAYS, type CoreStat, type Stat, type Way } from "../engine/moment.js";
import { clock } from "../engine/tell.js";
import { cardText, courtable, type CardInfo, type Trope } from "./card.js";
import { firstJson, type Ask, type Message } from "./prompts.js";

export const SKELETONS: Record<Trope, Adventure> = { rescue: RESCUE, courtship: COURTSHIP };
/** The same tropes in a modern city, with their own maps: for cards set in our own times. */
export const CITY: Record<Trope, Adventure> = { rescue: NIGHT_RESCUE, courtship: CITY_COURTSHIP };

/**
 * Words that put a card in our own times. A few different ones, and the city skeleton fits it better than the old road.
 * Words an older world uses as well (a club, a band, a company, a city) are left out.
 */
const MODERN = /\b(phones?|smartphones?|cell ?phones?|texts? (?:me|you|her|him|them)|texting|e-?mails?|internet|online|social media|instagram|laptops?|computers?|cars?|drives? a|taxi|uber|subway|highway|apartment|office|corporate|ceo|startup|high school|campus|nightclub|bartender|caf[eé]|coffee shop|downtown|mall|supermarket|police|cops?|hospital|nurse|guitar|concert|tv|television|video games?|gamer|youtube|streamer|influencer|guns?|pistol|neon|cyberpunk|modern|jeans|hoodie)\b/gi;
/** Words that put a card in an older age, which keep the old road even if a modern word turns up. A ship among the stars is not of an older age. */
const OLDEN = /\b(swords?|knights?|kingdom|castle|dragons?|elf|elves|dwarf|orcs?|mage|magic|wizard|witch|sorcer\w*|tavern|inn|village|lord|prince|princess|king|queen|duke|noble|empire|medieval|steed|horse|bow and arrow|spell|realm|guild|temple|shrine|samurai|ninja|demon|vampire)\b/gi;

/** Whether a card is set in our own times, from the words it uses. */
export function modernCard(card: CardInfo): boolean {
  const text = cardText(card, 7000);
  // Each word once, whether it is said once or ten times, and "phone" and "phones" as one.
  const count = (re: RegExp) => new Set((text.match(re) ?? []).map((w) => w.toLowerCase().replace(/s$/, ""))).size;
  const now = count(MODERN), then = count(OLDEN);
  return (now >= 3 || (now >= 2 && then === 0)) && now > then * 1.5;
}

/** The skeleton for a card and a trope: the city one for a modern card, the old road for anything else. */
/** The skeleton for a card: the city one for a card of our own day. `modern` is a reading of the card already made (a Decision model), else the card is read by its words. */
export const skeletonFor = (card: CardInfo, trope: Trope, modern?: boolean): Adventure => ((modern ?? modernCard(card)) ? CITY : SKELETONS)[trope];

const skeleton = (s: Trope | Adventure): Adventure => (typeof s === "string" ? SKELETONS[s] : s);

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
  friend?: { name?: string; who: string; good_at: Stat; likes: Way; dislikes: Way; age?: string };
  courted?: { who: string };
  rival?: { name: string; who: string; lost: string };
  /** The person at a stop (engine/furnish.ts), by the stop's id: their name, who they are, what they want now. */
  people?: Record<string, { name: string; who: string; wants: string; age?: string }>;
  /** What there is to find out (engine/furnish.ts): each clue's fact, a line long, by its id. */
  clues?: Record<string, string>;
  /** What the other side does, by its clock (engine/furnish.ts): a line each, by id. */
  moves?: Record<string, string>;
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
  if (partOf(adv) === "friend") w.friend = { name: "<their name>", who: "<who they are, in a line>", good_at: "charm", likes: "talk", dislikes: "force", age: "adult, elder, young-adult or minor: how old they are written as" };
  if (adv.courted) w.courted = { who: adv.courted.who };
  if (adv.rival) w.rival = { name: adv.rival.name, who: adv.rival.who, lost: adv.rival.lost };
  const people = adv.stops.filter((s) => s.person);
  if (people.length) w.people = Object.fromEntries(people.map((s) => [s.id, { name: s.person!.name, who: "<who they are, in a line>", wants: s.person!.wants ?? "", age: "adult, elder, young-adult or minor: how old they are written as" }]));
  if (adv.clues?.length) w.clues = Object.fromEntries(adv.clues.map((c) => [c.id, c.text]));
  if (adv.appointments?.length) w.moves = Object.fromEntries(adv.appointments.map((a) => [a.id, a.what]));
  return w;
}

/** The key a stop's thing to use is written under: its way, when the stop has one thing for that way, else its id. */
export const leverKey = (s: RoadStop, l: RoadStop["levers"][number]): string => (s.levers.filter((x) => x.way === l.way).length === 1 ? l.way : l.id);

/**
 * The adventure as a model is asked to write it: the made-up words for everything but the stops, and for each stop a
 * note of what to write. The made-up stops are not shown, so nothing stock is copied into the card's world.
 */
export function designOf(adv: Adventure): Omit<Words, "stops"> & { stops: Record<string, Record<string, unknown>> } {
  // Each note is in angle brackets, which no written value may have: a note sent back as it is counts as unwritten.
  const w = wordsOf(adv);
  const lootName = new Map(adv.loot.map((l) => [l.id, l]));
  const stops = Object.fromEntries(
    adv.stops.map((s) => {
      const levers = Object.fromEntries(s.levers.map((l) => [leverKey(s, l), `<a thing really there that helps ${WAY_WORD[l.way]}, in a few words>`]));
      const won = s.reward?.loot ? `the thing loot.${s.reward.loot} comes to you` : s.reward?.joins ? `companions.${s.reward.joins} joins you` : "";
      return [
        s.id,
        {
          face: "<the title on its card, 1 to 4 words>",
          situation: "<what stands in the way here, 2 to 4 sentences, naming each thing under levers>",
          teaser: "<a few words about this stop itself, seen from the road: said at a fork, before its card is turned>",
          levers,
          ...(s.reward ? { reward: `<a sentence or two: how, once past, ${won || "what is won comes to you"}>` } : {}),
        },
      ];
    }),
  );
  const companions = Object.fromEntries(adv.companions.map((c) => [c.id, { name: "<their name>", who: `<who they are, in a line: someone of this world, best at ${c.stat}, who likes getting past by ${WAY_WORD[c.likes]} and dislikes ${WAY_WORD[c.dislikes]}>` }]));
  const loot = Object.fromEntries(adv.loot.map((l) => [l.id, `<a thing of this world that helps ${WAY_WORD[lootName.get(l.id)!.way]} once, in a few words>`]));
  const places = Object.fromEntries(adv.places.map((p) => [p.id, "<a place of this world, in a few words>"]));
  const out: Omit<Words, "stops"> & { stops: Record<string, Record<string, unknown>> } = { ...w, places, stops, companions, loot };
  if (w.people) out.people = Object.fromEntries(Object.entries(w.people).map(([id, p]) => [id, { ...p, name: "<their name>", wants: "<one thing they want now, a few words, that the player could do for them>" }]));
  if (w.clues) out.clues = Object.fromEntries(Object.keys(w.clues).map((id) => [id, "<the fact, a line long>"]));
  if (w.moves) out.moves = Object.fromEntries(Object.keys(w.moves).map((id) => [id, "<what the other side does then, a line>"]));
  return out;
}

/** What is fixed about the people, the clues and the other side's clock, for the words to fit. */
function worldFacts(adv: Adventure): string {
  const out: string[] = [];
  const stopName = (id: string): string => adv.places.find((p) => p.id === id)?.name ?? id;
  const who = (pid: string): string => adv.stops.find((s) => s.person?.id === pid)?.id ?? pid;
  const keys = adv.kind ? KEYS[adv.kind] : null;
  for (const s of adv.stops.filter((x) => x.person)) out.push(`- people.${s.id}: the person in the way at ${s.id}. "wants" is one thing they want now, a few words, that the player could do for them.${s.person!.lie ? " They lie about one thing (a clue below)." : ""}`);
  for (const c of adv.clues ?? []) {
    const src = c.from?.person ? `told by the person at ${who(c.from.person)}` : `seen at ${c.from?.place ?? "a place"}, once the player is past it`;
    const about = keys && c.key !== undefined ? `about "${keys[c.key]}"` : "a fact";
    out.push(`- clues.${c.id}: ${about}, ${src}.${c.false ? ` A LIE: a believable one, which clues.${c.truth} proves false.` : ""}${c.points ? ` It names ${c.points} as where it ends.` : ""}${c.tells ? ` It tells of moves.${c.tells}, and when.` : ""}`);
  }
  for (const a of adv.appointments ?? []) out.push(`- moves.${a.id}: what the other side does at ${stopName(a.where)} at ${clock(a.at)}, whether the player is there or not.${a.needs?.length ? ` It follows moves.${a.needs.join(", ")}.` : ""}`);
  return out.join("\n");
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
      const levers = s.levers.map((l) => `one that helps ${WAY_WORD[l.way]} (under "${leverKey(s, l)}")`).join("; ");
      const reward = s.reward?.loot ? ` Getting past gives the thing "${s.reward.loot}".` : s.reward?.joins ? ` Getting past, "${s.reward.joins}" joins you.` : "";
      const here = adv.courted && (s.card === adv.courted.card || (s.climax && partOf(adv) === "courted")) ? " The one being courted is here, and is the person in the way." : "";
      return `- ${s.id}: ${s.kind === "fight" ? "a fight" : s.kind === "person" ? "a person in the way" : "an obstacle"}${s.climax ? ", THE LAST STOP" : ""}.${here} Ways: ${ways}. Things there to invent: ${levers || "none"}.${reward}`;
    })
    .join("\n");
}

/** What the table said that the story should take in: what the player asked for, and a campaign so far. */
export interface TableAsks {
  /** The player's own words when they chose the story ("a heist, to steal his heart-locket"). */
  asked?: string;
  /** Who the player is, in their own words as they wrote it at the table: the story should suit them. */
  who?: string;
  /** A campaign under way (campaign.ts), in a few lines: its big bad, the steps it has taken, what the players know. */
  campaign?: string;
}

export function buildMessages(card: CardInfo, of: Trope | Adventure, asks: TableAsks = {}): Message[] {
  const adv = skeleton(of);
  const part = partOf(adv);
  const story = adv.brief ?? (part === "friend" ? "a rescue: someone has been taken, and is held at the end of the road" : "a courtship: tonight the player tries to win someone's heart");
  const role = card.world
    ? part === "friend"
      ? `"${card.name}" is not one person: it is the world (or the scenario) the story is set in, so nobody in the story is called "${card.name}". A person of this world walks the road with the player from the start, as a companion: the one the story is about, or who needs this done. Take the companion from the people the card names, or invent one who belongs there, and invent anyone else the story needs. Write "friend" for the companion: "name" is their name (a few words at most); "who" is one line about them; "good_at" is the one of brawn, grace, charm, guile, wits, sense they are best at; "likes" and "dislikes" are ways (talk, sneak, force, pay) they approve and disapprove of, different from each other.`
      : `"${card.name}" is not one person: it is the world (or the scenario) the story is set in, so nobody in the story is called "${card.name}". The player is courting someone of this world tonight: take them from the people the card names (never one the card says is a child), or invent one who belongs there. Write "courted" for them: "name" is their name (a few words at most); "who" is one line about them. ${adv.rival ? " Whoever stands against the player is in the rival: invent them." : ""}`
    : part === "friend"
      ? `${card.name} is the card's character, and walks the road with the player from the start, as a companion: the one the story is about, or who needs this done. Invent anyone else the story needs, from the card's world. Write "friend" for ${card.name}: "who" is one line about them; "good_at" is the one of brawn, grace, charm, guile, wits, sense they are best at; "likes" and "dislikes" are ways (talk, sneak, force, pay) they approve and disapprove of, different from each other.`
      : `${card.name} is the card's character, and the one the player is courting tonight. Write "courted" for them: "who" is one line about them. ${adv.rival ? " Whoever stands against the player is in the rival: invent them." : ""}`;
  const system = [
    `You write the words of a short tabletop adventure. The rules and every number are fixed already; you only write the words, in the world of a ${card.world ? "card that describes a world or scenario" : "character card"}.`,
    "You are given the adventure as JSON: its keys, and words for a made-up world, or a note of what to write where the stops are yours. Write every value for the card's world and people, and keep every key exactly as it is. Do not add or remove keys.",
    "Every name must be new and belong to the card's world. The shape of the story is fixed: which stops there are and where, whether each is a person in the way, an obstacle or a fight, how hard each way is there and what it costs, and what is won. What each stop is, is yours to invent: who or what stands there, and what there is to use, made from the card's world, what the player asked for and who they are. A modern card gets a modern road, a strange world its own kind of trouble, a dungeon its own floors and traps.",
    'A "reward" is said after the player gets past, however they did it (kind words, a bribe, a theft, a fight): say how the thing comes to them in words that fit any of those, such as finding it, being left with it, or taking it, never only a kind handing-over.',
    'Under "levers", each stop has one thing for each way it can be got past, keyed by the way ("talk", "sneak", "force", "pay"): write something that is really there in your scene and plainly helps that way, named in a few words (to talk, something they care about or a sore point; to sneak, a way round or something to hide behind; to force, something weak or something to use; to pay, what can be bought or bargained with). Make every stop its own, no two alike, and nothing stock (a toll bar, an official with keys on the desk and a hidden debt, a guide who wants paying) unless this world plainly has it.',
    `Each stop's "face" is the title on its card, turned over when the player arrives: 1 to 4 words, most often "The" and what stands there, in this world's words ("The Drowned Bell-Ringer", "The Rent Collector", "The Hungry Pack").`,
    'Each "situation" is 2 to 4 short sentences, in the second person ("you"), saying what stands in the way and naming every thing there to use (its value under "levers" is what it is called). If paying is a way at that stop, the situation says what is paid for and how much, in supplies.',
    "The stops in your way are about the job, never about the player's own feelings. Nobody in them is a child unless the card says so, and no romance involves anyone the card says is a child. Nothing sexual or explicit, and nothing hateful, whatever the card has: leave all of that out. A courtship is about winning a heart, told as a fairy tale would tell it.",
    "Use the card's own world as fully as you can. Put the stops at places the card (or its lore) names, or places that plainly belong there. Make the people in the way the card's own people, factions and kinds of folk. Let the job grow out of the card's own troubles, scenario and history. Make the things to use and to win things of that world: its magic or machines, its customs, its money, its beasts. Never a plain village or a plain road when the card has places and people of its own.",
    '"{friend}" in the words stands for the companion (or the one courted): write their name in its place.',
    "Write plainly, as a narrator would say it aloud. No markdown. Answer with the JSON only.",
  ].join("\n");
  const user = [
    `THE CARD\n${cardText(card)}`,
    `THE STORY: ${story} ${role}`,
    ...(asks.asked ? [`WHAT THE PLAYER ASKED FOR, in their words (fit the story to it as far as the fixed shape allows: its premise, its tone, the trouble they expect): "${asks.asked.slice(0, 700)}"`] : []),
    ...(asks.who ? [`WHO THE PLAYER IS, in their words (the story should suit them: who they are shapes what they know, how people meet them, and what trouble finds them): "${asks.who.slice(0, 700)}"`] : []),
    ...(asks.campaign ? [`THE CAMPAIGN SO FAR (this story is one chapter of it: tie it in, by its hand or what it is after; do not repeat a trouble the players already ended): ${asks.campaign}`] : []),
    `THE CLOCK: it starts at ${clock(adv.startHour)} and is lost at ${clock(adv.deadline.hour)} (${adv.deadline.name}). Write the times of day to fit.`,
    ...(!card.world && foreignName(card.name) ? [`The card writes the name "${card.name}" in another script. Add a key "called": the name in English letters, and use it everywhere.`] : []),
    `WHAT IS FIXED AT EACH STOP (do not change it, write words that fit it):\n${factsOf(adv)}`,
    ...(adv.clues?.length || adv.appointments?.length ? [`THE PEOPLE, WHAT THERE IS TO FIND OUT, AND THE OTHER SIDE'S CLOCK (each clue is one plain fact, a line long, true unless it says it is a lie; the facts must fit together into one story the player can piece out):\n${worldFacts(adv)}`] : []),
    `THE ADVENTURE TO WRITE (keep the keys; the stops are yours to invent):\n${JSON.stringify(designOf(adv), null, 1)}`,
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
export function applyWords(from: Trope | Adventure, card: CardInfo, raw: unknown, seed: string): Built {
  const base0 = skeleton(from);
  const trope = base0.trope;
  const part = partOf(base0);
  const w0 = obj(raw);
  let used = 0, of = 0;
  const take = (v: unknown, max: number, fallback: string): string => {
    of++;
    const s = plain(v, max);
    if (s) used++;
    return s ?? fallback;
  };

  // The card's character, by the name the words will use. A world card has none: the model names a person of that
  // world, or the made-up one stands in.
  const said = obj(part === "friend" ? w0.friend : w0.courted);
  const named = base0.courted && !base0.courted.name.includes("{") ? base0.courted.name : null;
  const name = card.world
    ? plain(said.name, 30) ?? nameIn(said.who) ?? (part === "courted" && named ? named : standIn(seed))
    : foreignName(card.name) ? plain(w0.called, 30) ?? card.name : card.name;
  // "{friend}" in a laid-out road's words (and in a model's, if it kept them) is that name.
  const fillName = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v).split("{friend}").join(JSON.stringify(name).slice(1, -1))) as T));
  const base = fillName(base0);
  const w = obj(fillName(w0));
  const places = obj(w.places);
  const stops = obj(w.stops);
  const comps = obj(w.companions);
  const loot = obj(w.loot);
  const placeName = (id: string, fallback: string) => take(places[id], 36, fallback);
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
      // A stop is the model's whole or not at all: its scene and every thing to use in it, or the made-up stop, so the
      // things the scene names are the things the reader can pick.
      of += 3 + s.levers.length;
      const situation = plain(ws.situation, 900);
      const levers = s.levers.map((l) => plain(lv[leverKey(s, l)] ?? lv[l.id], 60));
      const whole = situation !== null && levers.every((x) => x !== null);
      const reward = s.reward ? { reward: { ...s.reward, says: take(ws.reward, 400, s.reward.says) } } : {};
      if (!whole) return { ...s, name: names.get(s.id)!, ...reward };
      const teaser = plain(ws.teaser, 120)?.replace(/[\s.;]+$/, "") || null;
      used += 1 + s.levers.length + (teaser ? 1 : 0);
      const face = plain(ws.face, 40);
      if (face) used++;
      return {
        ...s,
        ...(face ? { face } : {}),
        name: names.get(s.id)!,
        situation,
        teaser: teaser ?? s.teaser,
        levers: s.levers.map((l, i) => ({ ...l, name: levers[i]!, words: wordsFor(levers[i]!) })),
        ...reward,
      };
    }),
    companions: base.companions.map((c) => ({ ...c, name: take(obj(comps[c.id]).name, 30, c.name), who: take(obj(comps[c.id]).who, 200, c.who) })),
    loot: base.loot.map((l) => {
      const name = take(loot[l.id], 40, l.name);
      return { ...l, name, words: name === l.name ? l.words : wordsFor(name) };
    }),
  };

  if (part === "friend") {
    const f = obj(w.friend);
    const stat = STATS.includes(f.good_at as CoreStat) ? (f.good_at as CoreStat) : "charm";
    const likes = WAYS.includes(f.likes as Way) ? (f.likes as Way) : "talk";
    const dislikes = WAYS.includes(f.dislikes as Way) && f.dislikes !== likes ? (f.dislikes as Way) : likes === "force" ? "sneak" : "force";
    const friend: Companion = { id: FRIEND, name, card: "companion", who: take(f.who, 200, `${name}, who asked for your help`), stat, likes, dislikes, ...(typeof f.age === "string" ? { age: f.age.slice(0, 20) } : {}) };
    adv.companions = [...adv.companions, friend];
    adv.party = [FRIEND];
  }
  if (part === "courted" && base.courted) adv.courted = { ...base.courted, name, who: take(obj(w.courted).who, 240, "the one you have come for") };
  if (base.rival) {
    const r = obj(w.rival);
    adv.rival = { ...base.rival, name: take(r.name, 30, base.rival.name), who: take(r.who, 200, base.rival.who), lost: take(r.lost, 400, base.rival.lost) };
  }
  // The people, the clues and the other side's clock, in the card's world's words. Who someone is, read by code from
  // their own words: only a clear adult is ever in a scene with heat or dark themes.
  const ppl = obj(w.people);
  adv.stops = adv.stops.map((s) => {
    if (!s.person) return s;
    const wp = obj(ppl[s.id]);
    const name = take(wp.name, 40, s.person.name);
    const who = plain(wp.who, 200) ?? "";
    return { ...s, person: { ...s.person, name, wants: take(wp.wants, 120, s.person.wants ?? ""), ...(who ? { look: who } : {}), age: ageFrom(wp.age, name, who) } };
  });
  const cw = obj(w.clues);
  // A clue that names a place inks it on the map by the name the place has now.
  const renamed = new Map(base.places.map((p) => [p.name.toLowerCase(), names.get(p.id)!]));
  if (adv.clues) adv.clues = adv.clues.map((c) => ({ ...c, text: take(cw[c.id], 220, c.text), ...(c.points ? { points: renamed.get(c.points.toLowerCase()) ?? c.points } : {}) }));
  const mw = obj(w.moves);
  if (adv.appointments) adv.appointments = adv.appointments.map((a) => ({ ...a, what: take(mw[a.id], 200, a.what) }));
  return { adv, used, of };
}

/** A name at the start of a line about someone ("Tobiah Fenn, a miller's son"): the words before the first comma or dash, if they look like a name. */
function nameIn(who: unknown): string | null {
  const s = plain(who, 200);
  const m = s && /^([A-Z][\p{L}'’-]+(?:\s+(?:[A-Z][\p{L}'’-]+|of|the|de|van|von)){0,3})\s*[,–—(-]/u.exec(s);
  return m && m[1]!.length <= 30 && !/^(The|A|An|She|He|They|Her|His|Their)$/.test(m[1]!) ? m[1]! : null;
}

/** A companion's name when a world card's companion was not named: plain names that fit most worlds. */
const STAND_INS = ["Wren", "Tamsin", "Corin", "Ilse", "Bram", "Odile"];
const standIn = (seed: string): string => STAND_INS[hashSeed(`${seed}:friend`) % STAND_INS.length]!;

/** Who you are when nobody has said: the skeleton's own hero belongs to its made-up world. */
const GUEST = "You are a traveller who has come this way tonight.";

/** With no model, or nothing usable from one: the made-up adventure, with the card's character in their part. */
export function fallbackAdventure(of: Trope | Adventure, card: CardInfo, seed: string): Adventure {
  const base = skeleton(of);
  const trope = base.trope;
  // On a world card the made-up beloved keeps their own name: nobody is called by the card's. (A laid-out road has no
  // made-up beloved: "{friend}" stands in its words, and is filled in like any other.)
  if (!base.family && partOf(base) === "courted" && base.courted && !card.world) {
    // The made-up beloved's name is the card character's throughout.
    const swap = (s: string): string => s.split(base.courted!.name).join(card.name);
    const json = JSON.parse(swap(JSON.stringify(base))) as Adventure;
    return { ...json, id: `${trope}-card`, seed: hashSeed(seed), who: GUEST, courted: { ...base.courted, name: card.name, who: "the one you have come for" } };
  }
  return applyWords(base, card, {}, seed).adv;
}

/** Below this share of fields usable, the answer is thrown away and the made-up adventure is played instead. */
const ENOUGH = 0.6;

/** Build the adventure for a card: ask the model (twice at most), check its words, and fall back if they will not do. */
export async function buildAdventure(ask: Ask | null, card: CardInfo, of: Trope | Adventure, seed: string, modern?: boolean, asks: TableAsks = {}): Promise<Adventure> {
  const t: Trope | null = typeof of === "string" ? (of === "courtship" && !courtable(card) ? "rescue" : of) : null;
  const base = t ? skeletonFor(card, t, modern) : (of as Adventure);
  if (ask) {
    for (let i = 0; i < 2; i++) {
      try {
        const text = await ask(buildMessages(card, base, asks), "builder");
        const built = applyWords(base, card, firstJson(text), seed);
        if (built.used / built.of >= ENOUGH) return built.adv;
      } catch {
        // Try again, then fall back.
      }
    }
  }
  return fallbackAdventure(base, card, seed);
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}
