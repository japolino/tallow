/**
 * Free form played at a table (engine/free.ts; docs/DESIGN.md 3.2): no story and no road, only the world and whatever
 * you write that you do in it. Theatre of the mind: the narrator lays no map and deals no road; the table holds the
 * die, the scale, your counters, the cards of who walks with you and your abilities, and the narrator's notebook.
 *
 * Most of what you write is simply answered: the narrator says what happens. Only something that could go wrong calls
 * for the die, with the same scale, stats, prices and clock as a story. Going somewhere is half an hour, and a place is
 * kept in the notebook once it has been told. A goal of your own, a wait, or work at a goal is the world's (world.ts),
 * as in a story. The threads in the air move on with the clock; pull on one and it is played as a story of its kind,
 * and then you are back where you were.
 */
import { offerRoom, stockOffer, type Ability } from "../engine/abilities.js";
import { attempt, companionOf, ponder, rest, takeAbility, withAbility, withParty, type RoadStop, type Trip, type Turn } from "../engine/adventure.js";
import { contentFromLine, contentRules, contentSaid, DEFAULT_CONTENT, playable } from "../engine/content.js";
import { couldInstead, tradeOf } from "../engine/effect.js";
import { describe, faceScene, freeOf, goneTo, hereOf, leavesHere, nameStart, notebookPage, placeIn, openThreads, placeNamed, pullAsk, remember, RISK_OPTIONS, RISK_QUESTION, riskyWords, START_NAME, threadPlayed, threadPulled, threadsRun, threadsSaid, type Thread } from "../engine/free.js";
import { nameCheck, shut, WAYS, type Read } from "../engine/moment.js";
import { levelSaid, restSaid } from "../engine/tell-adventure.js";
import { cantSaid, changeLines, checkHeading, checkSaid, DIE_SAYS, narratorNote, rollLines, SCALE_SAYS } from "../engine/tell.js";
import { worldLineFree } from "../engine/world.js";
import { checkedGrade } from "../meaning/read.js";
import { abilityCard, type Table, type Written } from "./director.js";
import { isUse, pickBy, type Minds } from "./minds.js";

export interface RoamOptions {
  table: Table;
  minds: Minds;
  /** The free trip: begun (freeAdventure, startTrip, worldBegin), or kept from a sitting left in free form. */
  trip: Trip;
  /** Taken up from a sitting left in free form: the opening is not said again. */
  resumed?: boolean;
  /** The world, in a few lines, as the narrator is to say it ("Kettlebridge", "a ship among the stars"). */
  world: string;
  /** Who you are, for the abilities written for you at a level-up. */
  hero?: { who: string; calling?: { name: string; line: string; fault?: string } };
  /** The world, in a few lines, for the abilities written for you. */
  worldText?: string;
  /** Told the trip whenever it could be taken up again from. */
  save?: (trip: Trip | null) => void;
  /** Keep content set at the table, for the next sitting too. */
  keepContent?: (c: NonNullable<Trip["adv"]["content"]>) => void;
  /**
   * A thread pulled on is played as a story of its kind (session.ts): resolves with how long it took and who you are
   * after it (your abilities and level), or null when it could not be played.
   */
  story: (thread: Thread) => Promise<{ hours: number; abilities: Ability[]; level: number } | null>;
}

export const freeOpen = (world: string): string => `Then there is no story tonight: only ${world}, and whatever you do in it. We play, and see where it goes.`;
export const FREE_HOW = "Write what you do, or say. When something you try could go wrong, I will call for the die. Write \"notebook\" for what I have written down, or that you are done for tonight.";
export const WHERE_TO = "Where to? Write where you go.";
const NOTHING_YET = "You do. Nothing comes of it, not yet.";

const DONE = /\b(done for (?:tonight|now|today)|stop(?:ping)? (?:playing|here|for (?:tonight|now))|that'?s (?:all|enough) for (?:tonight|now|today)|good ?night|call it a night|end (?:the|this) session|i'?m done|we'?re done)\b/i;
const NOTEBOOK = /\b(notebook|your notes|what do (?:i|we) know|what'?s in the air|the threads|rumou?rs)\b/i;
const REST = /\b(rest|sleep|turn in|go to bed|lie down|make camp|take a nap|get some sleep|bed down)\b/i;
const YES = /\b(yes|yeah|yep|sure|ok(?:ay)?|let'?s|do it|now|aye|go on|play it)\b/i;
const NO = /\b(no|not (?:yet|now)|rather not|later|leave it|nope)\b/i;

/** What a try came to in free form: the price and the hour, a mark, a fall; nothing about getting past, for nothing stands in the way. */
export function freeTurnLines(turn: Turn): string[] {
  const o = turn.outcome;
  const keep = changeLines(o).filter((l) => !/^(You are past|It still stands|No way is left|The trouble here has grown)/.test(l) && !/ failed, so it is closed to you here\.$/.test(l));
  const extra: string[] = [];
  if (turn.used) extra.push(`That used up ${turn.used.name}.`);
  if (turn.markUsed) extra.push(`You leaned on ${turn.markUsed.name}, and that is spent now.`);
  if (turn.marked) extra.push(`It leaves something you can lean on later: ${turn.marked.name}.`);
  if (turn.fell) extra.push("That was the last of your health. You go down, and come to some hours later with 1 health.");
  return [...keep, ...extra];
}

export async function roam(o: RoamOptions): Promise<Trip> {
  const { table, minds } = o;
  let trip = faceScene(o.trip);
  const fit = (text: string): string => (text ? playable(text, trip.adv.content ?? DEFAULT_CONTENT) : text);
  const rules = (): string => contentRules(trip.adv.content ?? DEFAULT_CONTENT, ["adult"]);
  const knowNow = (): void =>
    minds.know?.(
      trip.adv.who,
      withParty(trip)
        .map((id) => companionOf(trip.adv, id))
        .filter((c) => !!c)
        .map((c) => (c!.who.toLowerCase().startsWith(c!.name.toLowerCase()) ? c!.who : `${c!.name}, ${c!.who}`)),
      rules(),
    );
  /**
   * The narrator says what happens: the free teller, when there is a model. Without one there is nothing to say but
   * the plain line the caller has (the look-round answer of a story would talk of ways through).
   */
  const narrate = async (line: string, note?: string): Promise<string> => {
    const m = trip.facing!.moment;
    const said = minds.roam ? await table.wait("tell", minds.roam(line, m, note).catch(() => "")) : "";
    return said ? fit(said) : "";
  };
  /** The clock has moved: word of the threads, said. */
  const ran = async (): Promise<void> => {
    const r = threadsRun(trip);
    trip = r.trip;
    if (r.lines.length) await table.say(r.lines);
  };
  const levelUp = async (): Promise<void> => {
    const room = offerRoom(trip.abilities, trip.level);
    const written = minds.offer && o.hero ? await table.wait("deal", minds.offer(o.hero, trip.abilities, trip.deeds, trip.level, room, o.worldText).catch(() => [] as Ability[])) : [];
    const offers = (written.length === 2 ? written : stockOffer(trip.abilities, trip.level, trip.seed)).map((a, i) => ({ ...a, id: `${a.id}-f${trip.level}-${i}` }));
    if (!offers.length) return;
    await table.say(levelSaid(offers, trip.storeName ?? "store"));
    const i = await table.offer(offers.map(abilityCard));
    const a = offers[i] ?? offers[0]!;
    trip = takeAbility(trip, a);
    void table.carry(null, trip.sheet, false);
    await table.say([`${a.name}, then. It is yours from now on.`]);
  };

  knowNow();
  // No map and no pieces: the places are in the narrator's notebook.
  table.theatre?.(true);
  table.clock(trip.sheet.hour);
  void table.carry(null, trip.sheet, false);
  for (const a of trip.abilities) await table.give(abilityCard(a));
  for (const id of trip.party) {
    const c = companionOf(trip.adv, id);
    if (c) await table.give({ id: c.id, card: c.card, name: c.name, side: "companion" });
  }
  if (!o.resumed) {
    await table.say([freeOpen(o.world)]);
    const here = hereOf(freeOf(trip)!);
    const named = here.name !== START_NAME;
    const scene = await narrate("", named ? `The night begins at ${here.name}. Set the opening scene there: what it is like, and who is about, in two or three sentences, calling it by its name.` : "The night begins. Set the opening scene, where it begins for them: where they are, what it is like there, and who is about, in two or three sentences. Name the place.");
    if (scene) trip = describe(trip, here.id, scene);
    // A place the narrator named in the telling is the start place's name from then on.
    const found = !named && scene ? placeIn(scene) : null;
    if (found) trip = nameStart(trip, found);
    await table.say([...(scene ? [scene] : []), threadsSaid(freeOf(trip)!), FREE_HOW]);
  } else await table.say([`We were in the middle of things, at ${hereOf(freeOf(trip)!).name}. ${threadsSaid(freeOf(trip)!)}`, FREE_HOW]);

  let next: Written | null = null;
  let scaleSaid = false;
  for (;;) {
    if (!next) o.save?.(trip);
    const w = next ?? (await table.write());
    next = null;
    const m = trip.facing!.moment;
    // The reading and the question of risk start now, while the page is in the air; not for a line that only asks for
    // the notebook or ends the night.
    const plain = DONE.test(w.line) || (NOTEBOOK.test(w.line) && !placeNamed(w.line));
    const reading = plain ? Promise.resolve(null) : minds.read(w.line, m).catch(() => null);
    const riskAsked: Promise<boolean | null> = plain
      ? Promise.resolve(null)
      : minds.risky
      ? minds.risky(w.line, m).catch(() => null)
      : minds.pick
        ? minds.pick(RISK_QUESTION, w.line, { ...RISK_OPTIONS }).then((a) => (a === "yes" ? true : a === "no" ? false : null), () => null)
        : Promise.resolve(null);
    await w.given;
    const line = w.line.trim();
    const hourBefore = trip.sheet.hour;

    if (DONE.test(line)) {
      void table.aside();
      o.save?.(trip);
      return trip;
    }
    if (NOTEBOOK.test(line) && !placeNamed(line)) {
      void table.aside();
      await table.page(notebookPage(trip));
      continue;
    }
    const set = contentFromLine(line, trip.adv.content ?? DEFAULT_CONTENT);
    if (set) {
      void table.aside();
      trip = { ...trip, adv: { ...trip.adv, content: set } };
      o.keepContent?.(set);
      knowNow();
      await table.say([contentSaid(set)]);
      continue;
    }

    // A thread pulled on: a story of its own, if you want it now.
    const thread = threadPulled(trip, line);
    if (thread) {
      void table.aside();
      await table.say([pullAsk(thread)]);
      const a = await table.write();
      await a.given;
      const yes = await pickBy(minds, "Does the player want to play this story out now?", a.line, { yes: "yes, now", no: "no, not yet" }, () => (NO.test(a.line) ? "no" : YES.test(a.line) ? "yes" : null), (p) => table.wait("read", p));
      void table.aside();
      if (yes !== "yes") {
        await table.say(["Then it stays in the air, for now."]);
        continue;
      }
      o.save?.(trip);
      // A story has its road: the map and the pieces come out for it, and go away again after.
      table.theatre?.(false);
      const played = await o.story(thread);
      table.theatre?.(true);
      if (played) {
        trip = threadPlayed(trip, thread.id);
        trip = { ...trip, abilities: played.abilities.map((x) => ({ ...x })), level: played.level, sheet: { ...trip.sheet, hour: trip.sheet.hour + Math.max(1, played.hours) } };
        trip = faceScene(trip);
        knowNow();
        table.clock(trip.sheet.hour);
        void table.carry(null, trip.sheet, false);
        for (const a2 of trip.abilities) await table.give(abilityCard(a2));
        for (const id of trip.party) {
          const c = companionOf(trip.adv, id);
          if (c) await table.give({ id: c.id, card: c.card, name: c.name, side: "companion" });
        }
        await table.say([`And you are back at ${hereOf(freeOf(trip)!).name}, some hours on. ${openThreads(freeOf(trip)!).length ? threadsSaid(freeOf(trip)!) : "Nothing else is in the air, for now."}`]);
        await ran();
      }
      continue;
    }

    // Going somewhere: half an hour, and the place told once and kept.
    const to = placeNamed(line);
    if (to) {
      void table.aside();
      const g = goneTo(trip, to);
      trip = g.trip;
      table.clock(trip.sheet.hour);
      const told = g.known
        ? await narrate(line, `They are back at ${g.place.name}: ${g.place.said} Say what it is like now, in a sentence or two.`)
        : await narrate(line, `They arrive at ${g.place.name}, somewhere new. Say what it is like there and who is about, in two or three sentences.`);
      if (told && !g.known) trip = describe(trip, g.place.id, told);
      const said = told || (g.known ? `You are back at ${g.place.name}.` : `You go to ${g.place.name}.`);
      await table.say([said]);
      trip = remember(trip, line, said);
      await ran();
      continue;
    }
    if (leavesHere(line)) {
      void table.aside();
      await table.say([WHERE_TO]);
      continue;
    }
    if (REST.test(line) && !riskyWords(line)) {
      void table.aside();
      const r = rest({ ...trip, facing: null });
      if (r) {
        const before = trip.sheet;
        trip = faceScene(r.trip);
        table.clock(trip.sheet.hour);
        const carried = table.carry(before, trip.sheet, false);
        await table.say(restSaid(r));
        await carried;
        trip = remember(trip, line, "They rested.");
        await ran();
        continue;
      }
    }

    const heard = await table.wait("read", reading);
    const answer = await table.wait("read", riskAsked);
    const risky = answer ?? riskyWords(line);
    const read: Read | null = heard && heard !== "none" && !isUse(heard) && risky ? heard : null;
    const check0 = read ? withAbility(m, { ...read, line, trade: tradeOf(line) ?? undefined, grade: checkedGrade(read.grade, line, m, []) }) : null;
    const check = check0 ? nameCheck(m, check0) : null;

    if (!check0 || !check) {
      // Not a try: the world's rows first (a goal of your own, a wait, work at a goal), else the narrator says what happens.
      const w2 = worldLineFree(trip, line, m);
      void table.aside();
      if (w2) {
        const answering = w2.note ? table.wait("tell", minds.answer(line, w2.trip.facing?.moment ?? m, w2.note).catch(() => "")) : null;
        trip = w2.trip.facing ? w2.trip : faceScene(w2.trip);
        if (!w2.hours && !w2.free) trip = ponder(trip) ?? trip;
        table.clock(trip.sheet.hour);
        const said = answering ? fit(await answering) : "";
        await table.say([...(said ? [said] : []), ...w2.lines].filter(Boolean));
        trip = remember(trip, line, [said, ...w2.lines].join(" "));
        if (trip.sheet.hour > hourBefore) await ran();
        continue;
      }
      const note = isUse(heard) ? `They use one of their abilities, ${trip.abilities.find((a) => a.id === heard.use)?.name ?? "a knack of theirs"}: show it at work, and what it sets up, without settling anything risky.` : undefined;
      const said = (await narrate(line, note)) || NOTHING_YET;
      trip = ponder(trip) ?? trip;
      table.clock(trip.sheet.hour);
      await table.say([said]);
      trip = remember(trip, line, said);
      await ran();
      continue;
    }

    if (check.effect === "none") {
      void table.aside();
      await table.say(cantSaid(check, couldInstead(m.stop.foe, WAYS.filter((x) => x !== check.way && !shut(m, x)))));
      continue;
    }
    // A try: the scale is loaded and the die is offered, as in any story.
    void table.weigh(check);
    await table.say([...checkSaid(check), ...(scaleSaid ? [] : [SCALE_SAYS]), DIE_SAYS]);
    scaleSaid = true;
    next = await table.dieOrLine();
    if (next) {
      void table.weigh(null);
      continue;
    }
    const before = trip.sheet;
    const scene: RoadStop = trip.facing!.stop;
    const turn = attempt(trip, check0);
    if (!turn) {
      void table.weigh(null);
      continue;
    }
    const out = turn.outcome;
    await table.throwDie(out.natural);
    // No bowl of dread in free form: what goes wrong is told, and paid for, at once.
    trip = { ...turn.trip, dread: 0 };
    table.clock(trip.sheet.hour);
    void table.weigh(null);
    const note = `${narratorNote(out, false)} There is nothing to get past in free play: show only what the try did, and leave the scene open.`;
    // The stock lines of a story say a place is behind you; with no model, the die's own words are enough.
    const told = minds.roam ? fit(await table.wait("tell", minds.tell(out, scene, note, false).catch(() => ""))) : "";
    const [sum, says] = rollLines(out);
    const after = freeTurnLines(turn);
    const carried = table.carry(before, trip.sheet, out.check.way === "pay" && trip.sheet.supplies < before.supplies);
    await table.say([says!, ...(told ? [told] : []), ...after]);
    await carried;
    await table.page({ heading: checkHeading(check), his: [sum!, ...(told ? [told] : []), ...after] });
    trip = remember(faceScene(trip), line, told || (out.past ? "It worked." : "It went wrong."));
    if (turn.levelUp) await levelUp();
    await ran();
  }
}
