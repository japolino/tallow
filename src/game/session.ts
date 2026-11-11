/**
 * A whole sitting for a character card (milestone 4, and docs/DESIGN.md 1.3, the long game): the narrator asks what
 * kind of story it is to be and who you are, a story of that kind is drawn and its road laid out (content/tropes.ts,
 * engine/road.ts), and the adventure is built for the card while you write (docs/DESIGN.md, 2: work starts as early
 * as it can). Then the director plays it.
 *
 * When a story is over the narrator says what became of everyone, gives you a knack if you won it (and lets you keep
 * a thing or two), gathers the cards back into the deck, and asks whether you want another story. You stay who you
 * are from one story to the next, with what you have earned, until you say you are someone new. Every question is
 * answered by writing in the notebook; nothing is picked from a list.
 */
import { offerRoom, shapeOf, stockOffer, type Ability } from "../engine/abilities.js";
import { lootOf, startTrip, takeAbility, type Adventure, type Companion, type Loot, type Trip } from "../engine/adventure.js";
import { checkFreeWorld, freeAdventure, plainCard, START_NAME, type FreeDraft } from "../engine/free.js";
import { worldBegin } from "../engine/world.js";
import { fitSpread, heroNow, spreadNow, START, type Hero } from "../engine/hero.js";
import { layRoad } from "../engine/road.js";
import { furnish } from "../engine/furnish.js";
import { campaignBrief, chapterSaid, checkFront, endChapter, finaleDue, finaleRoad, finaleSaid, keyFor, RINGS, startCampaign, stockFront, type Campaign, type Front } from "../engine/campaign.js";
import type { Payoff, Project } from "../engine/project.js";
import { contentFromLine, contentSaid, DEFAULT_CONTENT, playable, type ContentSettings } from "../engine/content.js";
import { checkKit, INFERNAL_KIT, infernalWords, kitFromWords, stockKit, type KitId, type WorldKit } from "../engine/kit.js";
import type { Sheet } from "../engine/moment.js";
import { abilityRule, levelTaken } from "../engine/tell-adventure.js";
import { drawRecipe, familiesFor, familiesSaid, FAMILY_SAID, storyRead, type Family, type Recipe, type StoryAnswer } from "../content/tropes.js";
import { buildAdventure, FRIEND, modernCard } from "./build.js";
import { cardText, courtable, looksLikeWorld, type CardInfo } from "./card.js";
import { KIND, MINOR, SETTING } from "./decisions.js";
import { campaignBy, contentBy, someoneNewBy } from "./meaning.js";
import { abilityCard, direct, type Director, type Table } from "./director.js";
import { roam } from "./free.js";
import { pickBy, type Minds } from "./minds.js";
import { firstJson, freeWorldMessages, frontMessages, type Ask } from "./prompts.js";

/** Who you are at this card's table, kept from one story (and one sitting) to the next. */
export interface Kept {
  /** Who you are, with the stats and knacks you have earned. */
  hero: Hero;
  /** The stories played with this card, oldest first (their ids in content/tropes.ts). */
  played: string[];
  /** Things kept from the last story won, still yours at the start of the next. */
  carry: Loot[];
  /** A campaign under way at this table (campaign.ts): one big bad across many stories, and its black candle. */
  campaign?: Campaign;
  /** What your finished projects pay off (project.ts): income, a place, people, a weapon, a name. */
  payoffs?: Payoff[];
  /** Goals of your own still under way (project.ts), to go on with in the next story. A favour stays with its story. */
  projects?: Project[];
}

/** How long a model is given to write a big bad before the stock one is used. */
const FRONT_MS = 30000;
/** The free world is written while the player says who they are, so it can take longer: a slow model still makes it. */
const FREE_WORLD_MS = 60000;

/** A big bad for a campaign: written by a model from the card's world and checked by code, or the stock one. */
export async function writeFront(ask: Ask | null, world: string, stock: Front, asked = ""): Promise<Front> {
  if (!ask) return stock;
  try {
    const text = await Promise.race([ask(frontMessages(world, asked), "builder"), new Promise<string>((_, no) => setTimeout(() => no(new Error("slow")), FRONT_MS))]);
    return checkFront(firstJson(text), stock);
  } catch {
    return stock;
  }
}

/**
 * A night of free form for a card's world (engine/free.ts): the place it begins at and two threads, written by a model
 * and checked by code, or the stock threads and no place.
 */
export async function writeFreeWorld(ask: Ask | null, world: string, who: string, seed: string, hour: number): Promise<FreeDraft> {
  if (!ask) return checkFreeWorld(null, seed, hour);
  try {
    const text = await Promise.race([ask(freeWorldMessages(world, who), "builder"), new Promise<string>((_, no) => setTimeout(() => no(new Error("slow")), FREE_WORLD_MS))]);
    return checkFreeWorld(firstJson(text), seed, hour);
  } catch {
    return checkFreeWorld(null, seed, hour);
  }
}

/** Whether a line asks for a campaign: one long threat across many stories. */
export const wantsCampaign = (line: string): boolean => /\b(campaign|long game|many stories|big bad)\b/i.test(line) && !/\b(no|not|without|don'?t want|rather not)\b[^.,;]{0,24}\b(campaign|long game|many stories|big bad)\b/i.test(line);

/**
 * Your sheet in a world's kit (kit.ts): a seventh strength only in a world with that kind of power, named as it is
 * named there; without one, it is put away (and comes back in a world that has it).
 */
export function inKit(sheet: Sheet, kit: WorldKit): Sheet {
  if (kit.power) return { ...sheet, stats: { ...sheet.stats, power: typeof sheet.stats.power === "number" ? sheet.stats.power : 1 }, powerName: kit.power };
  const { power: _put, ...core } = sheet.stats;
  const { powerName: _name, ...rest } = sheet;
  return { ...rest, stats: core };
}

/** The kit for a card: by its words, held to our own day when the card is of our own day. */
export function kitFor(card: CardInfo, modern: boolean | undefined, content: ContentSettings | undefined): WorldKit {
  const text = cardText(card, 4000);
  let id: KitId = kitFromWords(text);
  if (modern === true && (id === "medieval" || id === "high-fantasy")) id = "modern";
  if (modern === false && id === "modern") id = "medieval";
  const settings = content ?? DEFAULT_CONTENT;
  // Hell is an old world of its own: its era, fears and foes, not the generic kingdoms and towers.
  if ((id === "medieval" || id === "high-fantasy") && infernalWords(text)) return checkKit(INFERNAL_KIT, "high-fantasy", settings);
  return stockKit(id, settings);
}

export interface SittingOptions {
  card: CardInfo;
  seed: string;
  table: Table;
  minds: Minds & { hero(line: string, hour?: number, world?: string): Promise<Hero> };
  /** The model, for building the adventure. Null builds the made-up one with the card's character in it. */
  ask: Ask | null;
  /** Told the moment the adventure is built, before its cards are dealt (the room draws its map then). */
  built?: (adv: Adventure) => void;
  /** Told when the director takes over, for anything that watches it. */
  started?: (d: Director) => void;
  /** A sitting with this card that was left before its end, if there is one. */
  saved?: Trip | null;
  /** Keeps the trip, so a sitting that is left can be taken up again; null forgets it (director.ts, `save`). */
  save?: (trip: Trip | null) => void;
  /** Who you were at this card's table last time, if you have sat here before. */
  kept?: Kept | null;
  /** Keeps who you are after each story. */
  keep?: (k: Kept) => void;
  /** You are done for tonight: the room is closed. */
  leave?: () => void;
  /** What the game allows at this table (content.ts): heat, dark themes, lines and veils. */
  content?: ContentSettings;
  /** Keep content set at the table in your own words ("heat on", "veil: spiders"), for the next sitting too. */
  keepContent?(c: ContentSettings): void;
}

export const WHO_ASK = "And who are you? Write it in your own words: what kind of person you are, and your name, if you like.";
/** How many things may be kept from a story won. */
export const CARRY_MAX = 2;

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function greeting(card: CardInfo, offered: readonly Family[], back?: Hero | null): string[] {
  // A world card is where the story is set; nobody in it is called by the card's name (card.ts, `world`).
  const open = card.world ? `Sit down. I have a story for you tonight, set in ${card.name}.` : `Sit down. I have a story for you tonight, and ${card.name} is in it.`;
  const again = back ? [`You are back${back.name && back.name !== "the traveller" ? `, ${back.name}` : ""}. I kept your place.`] : [];
  return [open, ...again, `What kind of story is it to be? ${cap(familiesSaid(offered))}.`, FREE_OFFER, "Write which, or write that I should choose."];
}

/** Free form, offered with the stories (engine/free.ts). */
export const FREE_OFFER = "Or no story at all: only the world, and whatever you do in it.";

/** Whether a line asks for free form: no story, no goal, only the world. */
export const wantsFree = (line: string): boolean =>
  /\b(free ?form|free play|freeplay|play freely|no story|without a story|no goal|just (?:play|roam|wander|live|hang out|explore|be there)|(?:just )?let (?:me|us) (?:roam|wander|explore|play freely|loose)|sandbox|open world|see where it goes|theatre of the mind|the world itself)\b/i.test(line) &&
  !/\b(not|don'?t want)\b[^.,;]{0,12}\b(free|no story|sandbox)\b/i.test(line);

/** What the world is called when the narrator offers free form in it. */
export const freeWorldName = (card: CardInfo): string => (card.world ? card.name : `${card.name}'s world`);

/** Asked when a story is over. */
export const anotherAsk = (offered: readonly Family[]): string[] => [`Another story? Write what kind: ${familiesSaid(offered)}. Or no story at all, only the world. Or write that I should choose, or that you are done for tonight.`];
export const storyAgain = (offered: readonly Family[], canStop: boolean): string => `Which kind of story? Write one: ${familiesSaid(offered)}. Or write that I should choose${canStop ? ", or that you are done for tonight" : ""}.`;
export const GOODNIGHT = ["Then that is all for tonight. The candles can burn down without us.", "Come back when you want another story. I will keep your place at the table."];

/** What the narrator says when the story is drawn: the kind, and what it turned out to be. */
export const drawnSaid = (r: Recipe, chose: boolean): string => `${chose ? `Then I choose. ${cap(FAMILY_SAID[r.family].name)}.` : `${cap(FAMILY_SAID[r.family].name)}, then.`} ${r.drawn}`;

/** An ability for a story won: two cards, keep one. */
export function rewardSaid(offers: readonly Ability[], store = "store"): string[] {
  const side = ["On your left", "On your right"];
  return [
    "You won that one, and it has taught you something you will keep for the stories after it. I deal you two cards, face up. Keep one.",
    ...offers.map((a, i) => `${side[i] ?? "And"}, a ${shapeOf(a)}, ${a.name}: ${a.looks.replace(/[.]+$/, "")}. ${abilityRule(a, store)}`),
    "Touch the one you want, or write which.",
  ];
}
export const carrySaid = (things: readonly Loot[]): string => `And you keep ${things.map((l) => l.name).join(" and ")}. ${things.length > 1 ? "They are" : "It is"} yours at the start of the next story.`;

/** Asked when a sitting with this card was left before its end. */
export const goOnAsk = (card: CardInfo, t: Trip): string[] =>
  t.adv.free
    ? [`Sit down. Last time there was no story, only ${freeWorldName(card)}, and you were out in it.`, "Shall we go on from where you were, or begin something new? Write which."]
    : [`Sit down. We were in the middle of a story ${card.world ? "in" : "with"} ${card.name}: ${t.adv.title}.`, "Shall we go on with it, or begin a new one? Write which."];

/** How long the sitting waits for the Decision model to say whether the card is a world, before its own reading decides. */
const KIND_MS = 4000;

/** Whether a line wants a new story rather than the one left off. Anything else goes on. */
export function wantsNew(line: string): boolean {
  return /\b(new|another|fresh|start over|begin again|from the start|different|restart|again from)\b/i.test(line) && !/\b(go on|carry on|continue|keep going|where we left)\b/i.test(line);
}

/** Whether a line asks to be someone new, rather than who you were last time. */
export const wantsSomeoneNew = (line: string): boolean => /\b(someone new|somebody new|someone else|somebody else|new (?:hero|character|person)|different (?:hero|character|person)|another (?:hero|character|person)|play as)\b/i.test(line);

const GO_ON = { on: "go on with the story that was left off", new: "begin a new story" } as const;

/** Whether the card is a world or scenario: the Decision model's sure answer when there is one, else the card's own words. */
async function worldCard(card: CardInfo, minds: Minds, reading: <T>(p: Promise<T>) => Promise<T>): Promise<boolean> {
  if (card.world !== undefined) return card.world;
  const guess = looksLikeWorld(card);
  if (!minds.pick) return guess;
  const asked = minds.pick(KIND.question, cardText(card, 3000), KIND.options, KIND.task).catch(() => null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => (timer = setTimeout(() => r(null), KIND_MS)));
  const kind = await reading(Promise.race([asked, timeout])).finally(() => clearTimeout(timer));
  return kind === "world" ? true : kind === "person" ? false : guess;
}

/**
 * Whether the card's character is a minor, by meaning (docs/DESIGN.md, 7): true when a model says so, or says it
 * cannot tell and the card's words lean young; undefined when no model answers, and the words alone decide.
 */
async function minorCard(card: CardInfo, minds: Minds): Promise<boolean | undefined> {
  if (card.minor !== undefined) return card.minor;
  if (!minds.pick) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => (timer = setTimeout(() => r(null), KIND_MS)));
  const said = await Promise.race([minds.pick(MINOR.question, cardText(card, 3000), MINOR.options, MINOR.task).catch(() => null), timeout]).finally(() => clearTimeout(timer));
  return said === "minor" ? true : said === "adult" ? false : undefined;
}

/** Things still held at the end of a story won, to keep for the next: a few, with ids that cannot meet the next road's. */
export const keptThings = (t: Trip): Loot[] =>
  t.kept
    .map((id) => lootOf(t.adv, id))
    .filter((l): l is Loot => !!l)
    .slice(0, CARRY_MAX)
    .map((l) => ({ ...l, id: `kept-${l.id.replace(/^kept-/, "")}` }));

export async function sit(o: SittingOptions): Promise<Trip | null> {
  const { table } = o;
  const reading = <T>(p: Promise<T>): Promise<T> => table.wait("read", p);
  const [world, minor] = await Promise.all([worldCard(o.card, o.minds, reading), minorCard(o.card, o.minds)]);
  const card: CardInfo = { ...o.card, world, ...(minor !== undefined ? { minor } : {}) };
  const offered = familiesFor(courtable(card));
  let kept = o.kept ?? null;
  let last: Trip | null = null;
  let stories = 0;
  // What the game allows, which can be changed at the table between stories.
  // The settings go with every story, so the narrator is always told what is allowed (content.ts: on unless turned off).
  let content: ContentSettings = o.content ?? DEFAULT_CONTENT;

  /** When a story is over: what became of everyone, an ability and a thing or two if it was won, and the table cleared. */
  const after = async (t0: Trip, hero: Hero, kept0: Kept | null): Promise<Kept> => {
    const written = o.minds.epilogue ? await table.wait("tell", o.minds.epilogue(t0).catch(() => null)) : null;
    // The epilogue keeps to what the game allows, like every other line a model writes.
    const epilogue = written && t0.adv.content ? playable(written, t0.adv.content) : written;
    if (epilogue) await table.say([epilogue]);
    // What you learned in the story stays yours: the abilities taken at its level-ups, and the level.
    let t = t0;
    let carry: Loot[] = [];
    if (t.over === "won") {
      const room = offerRoom(t.abilities, t.level);
      const written = o.minds.offer ? await table.wait("deal", o.minds.offer(hero, t.abilities, t.deeds, t.level, room, card.world ? cardText(card, 700) : "").catch(() => [] as Ability[])) : [];
      const offers = (written.length === 2 ? written : stockOffer(t.abilities, t.level, `${t.seed}:won`)).map((a, i) => ({ ...a, id: `${a.id}-w${t.level}-${i}` }));
      if (offers.length) {
        await table.say(rewardSaid(offers, hero.calling?.store));
        const i = await table.offer(offers.map(abilityCard));
        const a = offers[i] ?? offers[0]!;
        t = takeAbility(t, a);
        await table.say([levelTaken(a).replace("from the next stop on", "from the next story on")]);
      }
      carry = keptThings(t);
      if (carry.length) await table.say([carrySaid(carry)]);
    }
    // A campaign: the big bad takes a step after every story you did not set it back, and the black candle burns.
    let campaign = kept0?.campaign;
    if (campaign && t.adv.finale) {
      // The last story was against the big bad itself: the campaign is over, won or lost.
      await table.say(finaleSaid(campaign, t.over === "won"));
      table.blackCandle?.(null);
      campaign = undefined;
    } else if (campaign && campaign.burned < RINGS) {
      const won = t.over === "won";
      const key = keyFor(campaign);
      // Who you won over and who you made an enemy of carry on, and what this chapter was, so the next is not the same.
      const people = Object.values(t.people ?? {});
      const friends = people.filter((p) => p.attitude === "close" || p.attitude === "friendly").map((p) => p.name);
      const enemies = people.filter((p) => p.attitude === "hostile").map((p) => p.name);
      const e = endChapter(campaign, { setBack: won, failedNear: !won && t.over === "taken" && !!t.adv.stops.find((s) => s.id === t.at)?.climax, found: won && key !== null ? [key] : [], friends, enemies, trouble: `${t.adv.title}, ${t.adv.goal}`, how: t.over ?? "unfinished" });
      campaign = e.campaign;
      table.blackCandle?.({ burned: campaign.burned, lit: e.steps.length > 0 });
      await table.say(chapterSaid(campaign, e.steps, e.over, e.stopped));
      if (!e.over && finaleDue(campaign)) await table.say([`You hold all three keys to ${campaign.front.name}. The next story can be the last: against it, itself.`]);
    }
    // What your projects pay off is yours in the stories after; a weapon brought to a fight is spent.
    const payoffs = (t.payoffs ?? []).filter((p) => !(p === "weapon" && t.armed));
    await table.sweep?.();
    const grown: Hero = { ...hero, abilities: t.abilities.map((a) => ({ ...a })), level: t.level };
    const projects = (t.projects ?? []).filter((p) => !p.id.startsWith("favour:") && p.filled < p.segments);
    const next: Kept = { hero: grown, played: [...(kept0?.played ?? []), t.adv.trope].slice(-12), carry, ...(campaign ? { campaign } : {}), ...(payoffs.length ? { payoffs } : {}), ...(projects.length ? { projects } : {}) };
    o.keep?.(next);
    return next;
  };

  // Whether the card is of our own day, asked of the Decision model while the narrator greets you; else its words decide.
  const setting = o.minds.pick ? o.minds.pick(SETTING.question, cardText(card, 3000), SETTING.options, SETTING.task).catch(() => null) : Promise.resolve(null);

  /** Who you are: kept from before, or written now. */
  const whoYouAre = async (someoneNew: boolean): Promise<Hero> => {
    if (kept && !someoneNew) return heroNow(kept.hero);
    await table.say([WHO_ASK]);
    const w = await table.write();
    const heroRead = o.minds.hero(w.line, undefined, card.world ? cardText(card, 700) : "");
    await w.given;
    const hero = await reading(heroRead);
    void table.aside();
    return hero;
  };

  /** A story was left in the middle of it, for tonight (director.ts, `left`): the sitting ends there. */
  let leftOff = false;
  /** A story of a kind, drawn, built and played, and what came of it kept (the stories, and a thread pulled in free form). */
  const playStory = async (answer: Family | "any", askedFor: string, someoneNew: boolean, longGame: boolean): Promise<Trip> => {
    const recipe = drawRecipe(answer, o.seed, kept?.played ?? [], offered);
    await table.say([drawnSaid(recipe, answer === "any")]);
    // The road is laid out and the building starts now, and runs while you write who you are and while the narrator shuffles.
    const world = await setting;
    const modern = world === "now" ? true : world === "then" ? false : undefined;
    const seed = stories ? `${o.seed}:${stories}` : o.seed;
    // The world's kit (kit.ts) and what the game allows (content.ts) go with the story, whoever builds it.
    const kit = kitFor(card, modern ?? modernCard(card), content);
    const fitted = (adv: Adventure): Adventure => ({ ...adv, kit, ...(content ? { content } : {}) });
    // The living world on it (furnish.ts): people with minds of their own, what there is to find out, the other side's clock.
    const base = fitted(furnish(layRoad(recipe, seed, { modern: modern ?? modernCard(card) })));
    // A campaign asked for, and none under way: a big bad for this world and for what the player asked (written by a
    // model while you write who you are, checked by code), and a black candle of six rings.
    const frontAsked = longGame && !kept?.campaign ? writeFront(o.ask, card.world ? cardText(card, 1200) : cardText(card, 700), stockFront(base.seed, (modern ?? modernCard(card)) || kit.id === "space"), askedFor).then(startCampaign) : null;
    // What the player asked for, and the campaign so far, go to the builder so the story is theirs and one chapter of
    // it: the first chapter of a campaign begun now waits for its big bad, so it is built as part of it.
    const briefed: Promise<string | undefined> = frontAsked ? frontAsked.then(campaignBrief) : Promise.resolve(kept?.campaign ? campaignBrief(kept.campaign) : undefined);
    const build = briefed.then((brief) => buildAdventure(o.ask, card, base, seed, modern, { asked: askedFor, ...(brief ? { campaign: brief } : {}) })).then((adv) => fitted(adv)).then((adv) => (o.built?.(adv), adv));
    const hero = await whoYouAre(someoneNew);
    const carry = kept && !someoneNew ? kept.carry : [];
    if (frontAsked) {
      const started = await table.wait("deal", frontAsked);
      kept = kept ? { ...kept, campaign: started } : { hero, played: [], carry: [], campaign: started };
    }
    const campaign = kept?.campaign;
    if (campaign) table.blackCandle?.({ burned: campaign.burned, lit: false });
    if (campaign && campaign.chapter === 0 && campaign.burned === 0) await table.say([`A campaign, then: ${campaignBrief(campaign)} A black candle stands at my right hand, six rings scored on it. It is lit only when ${campaign.front.name} takes a step.`]);
    else if (campaign && !finaleDue(campaign)) await table.say([`Chapter ${campaign.chapter + 1} against ${campaign.front.name}. The black candle stands at my right hand, ${RINGS - campaign.burned} ring${RINGS - campaign.burned === 1 ? "" : "s"} left on it.`]);
    // The last story of a campaign: the big bad itself waits at the end of the road (campaign.ts, 6.1).
    const finale = campaign && finaleDue(campaign) ? campaign : null;
    if (finale) await table.say([`This is the last story. At the end of the road, ${finale.front.name} itself is waiting.`]);
    const road0 = finale ? finaleRoad(base, finale) : base;
    const build0 = finale ? build.then((adv) => finaleRoad(adv, finale)) : build;
    const worldText = [card.world ? cardText(card, 700) : "", campaign ? campaignBrief(campaign) : ""].filter(Boolean).join("\n");
    const d = direct(road0, inKit({ ...hero.sheet, ...START }, kit), seed, table, o.minds, {
      build: build0,
      abilities: hero.abilities,
      level: hero.level,
      storeName: hero.calling?.store,
      hero,
      world: worldText,
      who: hero.who,
      save: o.save,
      carry,
      ...(kept?.payoffs?.length && !someoneNew ? { payoffs: kept.payoffs } : {}),
      ...(kept?.projects?.length && !someoneNew ? { projects: kept.projects } : {}),
    });
    o.started?.(d);
    last = await d.done;
    // Left for tonight in the middle of it: kept as it stood (director.ts saved it), nothing more is made of it now.
    if (d.left) {
      leftOff = true;
      return last;
    }
    kept = await after(last, hero, kept);
    stories++;
    return last;
  };

  /**
   * Free form (engine/free.ts, game/free.ts): no story, only the world. Played until you are done for tonight; a thread
   * pulled on is played as a story, and then you are back where you were. Who you are is kept as it goes.
   */
  const playFree = async (someoneNew: boolean, resume?: Trip): Promise<void> => {
    const world = await setting;
    const modern = world === "now" ? true : world === "then" ? false : undefined;
    const kit = kitFor(card, modern ?? modernCard(card), content);
    const seed = `${o.seed}:free:${stories}`;
    // The world it is all in goes to the narrator with every place: the card's scenario first, then who it is about.
    const worldSaid = plainCard([card.scenario ?? "", card.description ?? ""].filter(Boolean).join(" "), 700);
    // The place it begins at and the threads in the air are written for the card's world while you say who you are.
    const drafted = resume ? null : writeFreeWorld(o.ask, card.world ? cardText(card, 1200) : worldSaid, "", seed, 19);
    let hero = await whoYouAre(someoneNew);
    if (!kept || someoneNew) kept = { hero, played: kept && !someoneNew ? kept.played : [], carry: [] };
    const name = freeWorldName(card);
    // The card's own character is with you, as in a story; a world card is only where you are.
    const firstLine = plainCard(card.description ?? "", 400).split(/(?<=[.!?])\s/)[0]?.slice(0, 200) ?? "";
    const companion: Companion | undefined = card.world ? undefined : { id: FRIEND, name: card.name, card: "companion", who: firstLine || `${card.name}, who is with you`, stat: "charm", likes: "talk", dislikes: "force" };
    const begun = (draft: FreeDraft): Trip => {
      const scenario = plainCard(card.scenario ?? "", 300);
      const start = draft.place ?? { name: START_NAME, said: scenario || `Somewhere in ${name}, as the night begins.` };
      const adv = freeAdventure({ seed, who: hero.who, world: name, start, startHour: 19, kit, setting: worldSaid, threads: draft.threads, ...(content ? { content } : {}), ...(companion ? { companion } : {}) });
      const t = startTrip(adv, inKit({ ...hero.sheet, ...START }, kit), seed, hero.abilities ?? [], hero.level ?? 1);
      return worldBegin({ ...t, ...(hero.calling?.store ? { storeName: hero.calling.store } : {}), ...(kept?.payoffs?.length ? { payoffs: [...kept.payoffs] } : {}), ...(kept?.projects?.length ? { projects: kept.projects.map((p) => ({ ...p })) } : {}) });
    };
    const keepFree = (t: Trip): void => {
      hero = { ...hero, abilities: t.abilities.map((a) => ({ ...a })), level: t.level };
      const projects = (t.projects ?? []).filter((p) => !p.id.startsWith("favour:") && p.filled < p.segments);
      const payoffs = t.payoffs ?? kept?.payoffs ?? [];
      kept = { ...(kept ?? { played: [], carry: [] }), hero, ...(payoffs.length ? { payoffs } : {}), ...(projects.length ? { projects } : {}) };
      o.keep?.(kept);
    };
    const t = await roam({
      table,
      minds: o.minds,
      trip: resume ?? begun(await table.wait("deal", drafted ?? writeFreeWorld(null, "", "", seed, 19))),
      resumed: !!resume,
      world: name,
      hero,
      worldText: card.world ? cardText(card, 700) : "",
      ...(o.save ? { save: o.save } : {}),
      keepContent: (c) => {
        content = c;
        o.keepContent?.(c);
      },
      story: async (thread) => {
        const done = await playStory(thread.family, thread.said, false, false);
        const h = kept?.hero ?? hero;
        hero = h;
        return { hours: Math.max(1, done.sheet.hour - done.adv.startHour), abilities: (h.abilities ?? []).map((a) => ({ ...a })), level: h.level ?? 1 };
      },
    });
    keepFree(t);
  };

  if (o.saved && !o.saved.over) {
    await table.say(goOnAsk(card, o.saved));
    const w = await table.write();
    await w.given;
    const go = await pickBy(o.minds, o.saved.adv.free ? "Shall we go on from where the player was, or begin something new?" : "Shall we go on with the story, or begin a new one?", w.line, GO_ON, () => (wantsNew(w.line) ? "new" : "on"), reading);
    void table.aside();
    if (go !== "new" && o.saved.adv.free) {
      // Free form left off: back out in the world, where you were, until you are done for tonight.
      await playFree(false, o.saved);
      await table.say(GOODNIGHT);
      o.leave?.();
      return last;
    }
    if (go !== "new") {
      // A story kept from before the six stats has its sheet read into them.
      const t = spreadNow(o.saved.sheet.stats) ? o.saved : { ...o.saved, sheet: { ...o.saved.sheet, stats: fitSpread(o.saved.sheet.stats, typeof o.saved.sheet.stats.power === "number") } };
      o.built?.(t.adv);
      // The black candle stands where it stood when you got up from the table.
      if (kept?.campaign) table.blackCandle?.({ burned: kept.campaign.burned, lit: false });
      const d = direct(t.adv, t.sheet, t.seed, table, o.minds, { resume: t, save: o.save, ...(kept?.hero ? { hero: heroNow(kept.hero) } : {}) });
      o.started?.(d);
      last = await d.done;
      if (d.left) {
        await table.say(GOODNIGHT.slice(0, 1));
        o.leave?.();
        return last;
      }
      const hero: Hero = kept?.hero ? heroNow(kept.hero) : heroNow({ name: "the traveller", cls: "courier", who: t.adv.who, sheet: t.sheet, perks: t.perks } as Hero);
      kept = await after(last, hero, kept);
      stories++;
    } else o.save?.(null);
  }

  for (;;) {
    const first = stories === 0;
    await table.say(first ? greeting(card, offered, kept?.hero) : anotherAsk(offered));
    const options = {
      ...Object.fromEntries(offered.map((f) => [f, FAMILY_SAID[f].means])),
      any: "let the narrator choose: a surprise",
      free: "no story at all: play freely in the world, with no set goal",
      ...(first ? {} : { done: "stop playing for tonight" }),
    } as Record<StoryAnswer | "free", string>;
    let answer: StoryAnswer | "free" | null = null;
    let someoneNew = false;
    let longGame = false;
    let askedFor = "";
    for (;;) {
      const w = await table.write();
      await w.given;
      // Content set at the table, before the story is chosen (docs/MOONSHOT.md, 7.6).
      // Read by meaning first (game/meaning.ts), with the words when no model can tell.
      const [set, wantsNew, wantsLong] = await reading(Promise.all([contentBy(o.minds, w.line, content ?? DEFAULT_CONTENT), kept ? someoneNewBy(o.minds, w.line, () => wantsSomeoneNew(w.line)) : Promise.resolve(false), campaignBy(o.minds, w.line, () => wantsCampaign(w.line))]));
      if (set) {
        content = set;
        o.keepContent?.(set);
        void table.aside();
        await table.say([contentSaid(set)]);
        // A story asked for in the same line is still asked for ("heat on, and something with a heist"); a line that
        // only sets content waits for the story.
        const named = await pickBy(o.minds, "Does the line also ask for a kind of story, or no story at all? If so, which?", w.line, { ...options, none: "it asks for no story yet" }, () => (wantsFree(w.line) ? "free" : storyRead(w.line, offered, false) ?? "none"), reading);
        if (!named || named === "none" || named === "done") continue;
        someoneNew = wantsNew;
        longGame = longGame || wantsLong;
        askedFor = w.line;
        answer = named;
        break;
      }
      someoneNew = wantsNew;
      longGame = longGame || wantsLong;
      askedFor = w.line;
      // What kind of story, or none at all, by meaning; the words only when no model can tell.
      answer = await pickBy(o.minds, first ? "What kind of story is it to be, or no story at all?" : "Another story, and what kind? Or no story at all? Or done for tonight?", w.line, options, () => (wantsFree(w.line) ? "free" : storyRead(w.line, offered, !first) ?? (someoneNew ? "any" : null)), reading);
      void table.aside();
      if (answer) break;
      await table.say([storyAgain(offered, !first)]);
    }
    if (answer === "done") {
      await table.say(GOODNIGHT);
      o.leave?.();
      return last;
    }
    if (answer === "free") {
      // Free form runs until you are done for tonight.
      await playFree(someoneNew);
      await table.say(GOODNIGHT);
      o.leave?.();
      return last;
    }
    await playStory(answer, askedFor, someoneNew, longGame);
    if (leftOff) {
      await table.say(GOODNIGHT.slice(0, 1));
      o.leave?.();
      return last;
    }
  }
}
