/**
 * Plays a whole adventure at a table (milestone 3). The director decides nothing: the rules are in
 * src/engine/adventure.ts and moment.ts, the words in tell.ts and tell-adventure.ts. It only puts them in order and
 * tells the table what to say and show.
 *
 * The table is anything that can say, show and take a written line: the room (preview/table.ts), or plain text
 * (scripts/adventure.ts). So the text playthrough is the same game as the one in the room, line for line.
 *
 * Every wait for a model goes through `table.wait`, which the room fills with something the narrator does (docs/
 * DESIGN.md, 2, "The room hides every wait"). The work is started as early as it can be: the reading of a line on
 * Enter, before the page has reached the narrator.
 */
import { offerRoom, stockOffer, type Ability } from "../engine/abilities.js";
import { ahead, arrive, placeOf, type Loot, attempt, companionOf, HEALTH_MAX, hoursTo, lootOf, placeName, ponder, prefers, rest, startTrip, takeAbility, tripNow, useAbility, withAbility, withContest, yieldContest, type Adventure, type RoadStop, type Sky, type Trip } from "../engine/adventure.js";
import { cardKind } from "../engine/cards.js";
import { coming, contestKind, foeNamed, renamed, yieldRead, type Contest, type ContestNames } from "../engine/contest.js";
import { ASK_ROUND, BLOW_RULE, blowLine, contestNote, contestSaid, dangerSaveSaid, luckAsk, luckNote, luckSaid, saveAsk, saveSaid, yieldSaid } from "../engine/tell-adventure.js";
import { canLuck, luckRead, throwLuck, type LuckAsk } from "../engine/luck.js";
import { giveIn, narratorTurn, refuse, tempting, type Move } from "../engine/dread.js";
import { leverLeft, nameCheck, shut, WAYS, wayStates, type Against, type Check, type Lever, type Moment, type Sheet, type Way } from "../engine/moment.js";
import { arriveSaid, backSaid, campAsk, campRead, endPage, endSaid, firstPage, forkSaid, levelSaid, levelTaken, PRESS_ON, restSaid, startSaid, stopPage, turnSaid, usedSaid, moveNote, moveRule, spendSaid, temptSaid, temptRead, temptYes, TEMPT_NO } from "../engine/tell-adventure.js";
import { ASK_AGAIN, ASK_NEXT, ASK_SAID, ASK_TIME_SAID, cantSaid, changeLines, checkHeading, checkSaid, DIE_SAYS, narratorNote, rollLines, SCALE_SAYS, shutSaid, UNCLEAR_SAID } from "../engine/tell.js";
import { couldInstead, tradeOf } from "../engine/effect.js";
import { faultDue, foeNotices, marginFor, marginLine } from "../engine/margin.js";
import { fellowSaid, handSaid, payoffsNow, worldArrive, worldBegin, worldClock, worldFellows, worldLine, worldPast, worldTried, type Told } from "../engine/world.js";
import { gearFrom } from "../engine/kit.js";
import type { Payoff } from "../engine/project.js";
import { contentRules, playable } from "../engine/content.js";
import { fellowBrief, handedTo, handOver } from "../engine/seats.js";
import { checkedGrade, rulesRead } from "../meaning/read.js";
import { abilityNote } from "./prompts.js";
import { isUse, pickBy, type Minds } from "./minds.js";

/** What the table is waiting for, so it can show the right thing meanwhile. */
export type Beat = "read" | "tell" | "deal";

export interface Written {
  line: string;
  /** Resolves when the page is in the narrator's hands. */
  given: Promise<void>;
}

/** A card on your side of the table. */
export interface SideCard {
  id: string;
  /** Its kind (cards.ts). */
  card: string;
  /** The name written under the picture: a person's name, or a thing's. */
  name: string;
  side: "companion" | "loot" | "courted" | "rival" | "perk" | "mark";
}

export interface Table {
  /** The narrator says these lines. Resolves when the last word is out. */
  say(lines: string[]): Promise<void>;
  /** The player writes a line in the notebook and hands it over. */
  write(): Promise<Written>;
  /** The narrator writes on the page it has (or a fresh one) and hands it to the player. Resolves when it is set down. */
  page(w: { heading?: string; his: string[] }): Promise<void>;
  /** The narrator pushes the page it has aside: a line it could not use. */
  aside(): Promise<void>;
  /** Something is being worked out: show the beat for it until `work` is done, then end it. */
  wait<T>(beat: Beat, work: Promise<T>): Promise<T>;
  /** Load the balance for a check, or clear it (null). Resolves when the weights are in. */
  weigh(check: Check | null): Promise<void>;
  /** Wait for the player to take a die (null), or to write another line instead. */
  dieOrLine(): Promise<Written | null>;
  /** The player throws; the die shows `natural`, which was decided before. */
  throwDie(natural: number): Promise<void>;
  /** The counters on the table follow what is carried. With no `before`, they are set out at once. */
  carry(before: Sheet | null, after: Sheet, paid: boolean): Promise<void>;
  /** The room's clock. */
  clock(hour: number): void;
  /** Deal the road: every stop's card face down on the map. */
  deal(stops: RoadStop[]): Promise<void>;
  /** Turn a stop's card face up. */
  turn(stop: RoadStop): Promise<void>;
  /** A stop is behind you: its card is taken off the map. */
  clear(stop: RoadStop): Promise<void>;
  /** Fan two face-down cards for a fork. Resolves with the id of the one the player picks. */
  fork(stops: RoadStop[]): Promise<string>;
  /** Deal two cards face up to choose between (a level-up). Resolves with the index of the one kept, which stays on your side. */
  offer(cards: SideCard[]): Promise<number>;
  /** A card is dealt to your side, or taken from it. */
  give(card: SideCard): Promise<void>;
  take(id: string): Promise<void>;
  /** The rival's seals. */
  rival(n: number, max: number): Promise<void>;
  /** The narrator's bowl of dread: stones go in, or are taken out, until it holds `n`. */
  dread?(n: number): Promise<void>;
  /** A story is over: every card on the table goes back into the deck. */
  sweep?(): Promise<void>;
  /** Stand up the blocks of the ways open at a place, and lay down the rest; null lays them all down. */
  ways?(states: ReturnType<typeof wayStates> | null): Promise<void>;
  /** The leather of a contest (engine/contest.ts): unrolled with its dials, the dials set to match, or rolled up (null). */
  board?(c: Contest | null): Promise<void>;
  /** The narrator throws its own die, for a question only luck can settle (engine/luck.ts); it shows `natural`. */
  luck?(natural: number): Promise<void>;
  /** The narrator's slips against you (dread.ts, "brand"), laid out on its side to match this list. */
  against?(list: readonly Against[]): Promise<void>;
  /** The weather outside the windows: the road's, or the place's you are at. */
  weather?(sky: Sky): void;
  /** Move a piece: yours ("you") or the narrator's ("shadow"). */
  move(piece: "you" | "shadow", at: string): Promise<void>;
  /** Pencil notes in the margin of your notebook (margin.ts): what your hero notices, in your own hand. */
  margin?(notes: string[]): Promise<void>;
  /** The narrator inks a place onto the map: a clue pointed there (clues.ts). */
  ink?(place: string): Promise<void>;
  /** The candle's notches: the hours of the appointments you know of (schedule.ts). */
  notch?(hours: number[]): void;
  /** The black candle of a campaign (campaign.ts): rings burned of six, lit while the big bad takes a step; null puts it away. */
  blackCandle?(c: { burned: number; lit: boolean } | null): void;
}

export type Stage = "start" | "fork" | "road" | "write" | "given" | "check" | "throw" | "told" | "camp" | "over";

export interface Director {
  readonly trip: Trip;
  readonly stage: Stage;
  /** Resolves when the adventure is over. */
  readonly done: Promise<Trip>;
}

export interface DirectOptions {
  /** How the adventure is got ready: at milestone 4 it is built from a card by a model, and the table deals while it waits. */
  build?: Promise<Adventure>;
  /** Your abilities at the start (hero.ts, abilities.ts). */
  abilities?: readonly Ability[];
  /** Your level at the start. */
  level?: number;
  /** What your store is called in your calling: heat, nerve, breath. */
  storeName?: string;
  /** Who you are, for the abilities written for you at a level-up. */
  hero?: { who: string; calling?: { name: string; line: string; fault?: string } };
  /** The world of the story, in a few lines, for the abilities written for you. */
  world?: string;
  /** Who you are, in your words, for the first page (it replaces the adventure's own). */
  who?: string;
  /** A sitting left before its end, to take up where it stopped (the table is laid out again as it stood). */
  resume?: Trip;
  /** Told the trip at every point it could be taken up again from (before each stop and each try), and null when it is over. */
  save?: (trip: Trip | null) => void;
  /** Things kept from an earlier story, still yours at the start of this one. */
  carry?: Loot[];
  /** What your finished projects pay off (project.ts), kept from story to story. */
  payoffs?: readonly Payoff[];
}

export const abilityCard = (a: Ability): SideCard => ({ id: `ability:${a.id}`, card: a.card, name: a.name, side: "perk" });
export const markCard = (l: Lever): SideCard => ({ id: l.id, card: "token", name: l.name, side: "mark" });

export function direct(adv: Adventure, sheet: Sheet, seed: string, table: Table, minds: Minds, opts: DirectOptions = {}): Director {
  const carry = (opts.carry ?? []).filter((l, i, all) => all.findIndex((x) => x.id === l.id) === i);
  // Who you say you are, and what you bring from an earlier story.
  const yours = (a: Adventure): Adventure => ({ ...a, ...(opts.who ? { who: opts.who } : {}), loot: [...a.loot.filter((l) => !carry.some((c) => c.id === l.id)), ...carry] });
  /** Your gear, read from what you carry in this world's ladder (kit.ts, docs/MOONSHOT.md, 7.4). */
  const geared = (t: Trip): Trip => {
    if (!t.adv.kit) return t;
    const items = t.kept.map((id) => lootOf(t.adv, id)?.name ?? "").filter(Boolean);
    const gear = { ...(t.sheet.gear ?? {}), ...gearFrom(t.adv.kit, items) };
    return { ...t, sheet: { ...t.sheet, gear }, ...(t.facing ? { facing: { ...t.facing, moment: { ...t.facing.moment, sheet: { ...t.facing.moment.sheet, gear } } } } : {}) };
  };
  const begin = (a: Adventure): Trip => {
    const t = startTrip(yours(a), sheet, seed, opts.abilities ?? [], opts.level ?? 1);
    return geared(worldBegin({ ...t, kept: [...t.kept, ...carry.map((l) => l.id)], ...(opts.storeName ? { storeName: opts.storeName } : {}), ...(opts.payoffs?.length ? { payoffs: [...opts.payoffs] } : {}) }));
  };
  /** The moment's stats are always yours, outside a try you handed to another player (docs/MOONSHOT.md, 4.3). */
  const synced = (t: Trip): Trip => {
    if (!t.facing) return t;
    const { powerName: _p, ...rest } = t.facing.moment.sheet;
    const s = { ...rest, stats: { ...t.sheet.stats }, ...(t.sheet.powerName ? { powerName: t.sheet.powerName } : {}) };
    return { ...t, facing: { ...t.facing, moment: { ...t.facing.moment, sheet: s } } };
  };
  let trip = begin(adv);
  let stage: Stage = "start";
  // Whether the narrator has said yet that asking takes time.
  let pondered = false;
  /** The weather at a place, or on the road between places. */
  const sky = (at?: RoadStop | null): void => table.weather?.(at?.weather ?? trip.adv.weather ?? "clear");
  /** What the game allows, for the models (content.ts): only clear adults are ever in a scene with heat or dark themes. */
  const rules = (): string | undefined => {
    const c = trip.adv.content;
    if (!c) return undefined;
    const bands = [...trip.adv.stops.map((s) => s.person?.age), ...(trip.fellows ?? []).map((f) => f.age)].filter((b) => b !== undefined);
    return contentRules(c, bands.length ? bands : ["adult"]);
  };
  /** A model's words as they may be played (content.ts): the veil when they were refused or crossed a line. */
  const fit = (text: string): string => (trip.adv.content && text ? playable(text, trip.adv.content) : text);
  /** The candle's notches follow what you know of the other side's clock. */
  const notches = (): void => {
    const s = trip.schedule;
    if (!s || !table.notch) return;
    table.notch(s.appointments.filter((a) => s.known.includes(a.id) && !s.stopped.includes(a.id) && !s.happened.some((h) => h.id === a.id)).map((a) => a.at));
  };
  /** What the world said: places inked, notches cut, and the lines. */
  const worldSaid = async (w: Told, extra: string[] = []): Promise<void> => {
    trip = w.trip;
    for (const place of w.inked ?? []) await table.ink?.(place);
    notches();
    const lines = [...extra, ...w.lines].filter(Boolean);
    if (lines.length) await table.say(lines);
  };
  /** The clock has moved on from an hour: what the other side did meanwhile. */
  const ranFrom = async (from: number): Promise<void> => {
    if (!trip.schedule || trip.sheet.hour <= from) return;
    const before = trip.dread ?? 0;
    await worldSaid(worldClock(trip, from, trip.sheet.hour));
    if ((trip.dread ?? 0) !== before) await table.dread?.(trip.dread ?? 0);
  };
  /** After a line, at most one of the other players speaks (everyone, if you asked the table). */
  const fellowsSpeak = async (line: string, m: Moment, way?: Way): Promise<void> => {
    const says = worldFellows(trip, line, m, way);
    if (!says.length) return;
    trip = says[0]!.trip;
    for (const x of says) {
      const words = minds.fellow ? fit(await table.wait("tell", minds.fellow(fellowBrief(x.fellow, x.said), m).catch(() => ""))) : "";
      // With no model to voice it, idle talk is left unsaid: only what changes something is spoken.
      if (!words && x.said.kind === "banter") continue;
      await table.say([words || fellowSaid(x.fellow, x.said)]);
      if (x.said.notice && table.margin) await table.margin([`${x.fellow.name}: ${x.said.notice.says}`]);
    }
  };

  const play = async (): Promise<Trip> => {
    if (opts.resume) return goOn(opts.resume);
    table.clock(trip.sheet.hour);
    void table.carry(null, trip.sheet, false);
    void table.move("you", adv.start);
    const end = adv.stops.find((s) => s.climax);
    if (end) void table.move("shadow", end.id);
    if (opts.build) {
      trip = begin(await table.wait("deal", opts.build));
    }
    sky();
    await table.deal(trip.adv.stops);
    for (const a of trip.abilities) await table.give(abilityCard(a));
    for (const id of trip.party) {
      const c = companionOf(trip.adv, id);
      if (c) await table.give({ id: c.id, card: c.card, name: c.name, side: "companion" });
    }
    for (const id of trip.kept) {
      const l = lootOf(trip.adv, id);
      if (l) await table.give({ id: l.id, card: l.card, name: l.name, side: "loot" });
    }
    if (trip.adv.courted) await table.give({ id: "courted", card: trip.adv.courted.card, name: trip.adv.courted.name, side: "courted" });
    if (trip.adv.rival) {
      await table.give({ id: "rival", card: trip.adv.rival.card, name: trip.adv.rival.name, side: "rival" });
      void table.rival(0, trip.adv.rival.max);
    }
    await table.say(startSaid(trip.adv));
    await table.page(firstPage(trip));
    // What your projects pay off comes with you into every story (docs/MOONSHOT.md, 7.5).
    if (trip.payoffs?.length) await worldSaid(payoffsNow(trip, trip.payoffs));
    return road(false);
  };

  /** Lay the table out again as a sitting left it, and go on from there. */
  const goOn = async (t: Trip): Promise<Trip> => {
    trip = withContest(tripNow(t));
    table.clock(trip.sheet.hour);
    void table.carry(null, trip.sheet, false);
    void table.move("you", trip.at);
    const facing = trip.facing?.stop;
    sky(facing);
    // The cards still on the map: the places not reached, and the one in your way.
    await table.deal(trip.adv.stops.filter((s) => !trip.visited.includes(s.id) || s.id === facing?.id));
    if (facing) {
      void table.move("shadow", facing.id);
      await table.turn(facing);
    } else {
      const end = trip.adv.stops.find((s) => s.climax);
      if (end) void table.move("shadow", end.id);
    }
    for (const a of trip.abilities) await table.give(abilityCard(a));
    for (const id of trip.party) {
      const c = companionOf(trip.adv, id);
      if (c) await table.give({ id: c.id, card: c.card, name: c.name, side: "companion" });
    }
    for (const id of trip.kept) {
      const l = lootOf(trip.adv, id);
      if (l) await table.give({ id: l.id, card: l.card, name: l.name, side: "loot" });
    }
    for (const l of trip.marks) await table.give(markCard(l));
    const lucky = trip.facing ? luckLever(trip.facing.moment) : null;
    if (lucky) await table.give(markCard(lucky));
    if (trip.against?.length) await table.against?.(trip.against);
    if (trip.dread) await table.dread?.(trip.dread);
    if (trip.adv.courted) await table.give({ id: "courted", card: trip.adv.courted.card, name: trip.adv.courted.name, side: "courted" });
    if (trip.adv.rival) {
      await table.give({ id: "rival", card: trip.adv.rival.card, name: trip.adv.rival.name, side: "rival" });
      void table.rival(trip.rival, trip.adv.rival.max);
    }
    await table.say(backSaid(trip));
    if (facing && trip.facing) {
      const standing = table.ways?.(wayStates(trip.facing.moment));
      await table.page({ heading: `${facing.name}: ${cardKind(facing.card).title}`, his: [facing.situation, ...firstPage(trip).his.slice(1)] });
      await standing;
      if (trip.facing.contest) await table.board?.(trip.facing.contest);
      else await table.say([ASK_NEXT]);
      await atStop(facing, ASK_NEXT);
      await camp();
    } else if (trip.visited.length && trip.sheet.health < HEALTH_MAX) {
      await table.page(firstPage(trip));
      await camp();
    } else await table.page(firstPage(trip));
    return road(true);
  };

  /** If you are hurt, after a place: rest, or press on. */
  const camp = async (): Promise<void> => {
    if (trip.over || trip.sheet.health >= HEALTH_MAX) return;
    stage = "camp";
    await table.say([campAsk(trip)]);
    const w = await table.write();
    await w.given;
    const rests = await pickBy(minds, "You are hurt. Do you rest here, or press on?", w.line, { rest: "rest, sleep or tend wounds here", on: "press on without resting" }, () => campRead(w.line), (p) => table.wait("read", p));
    void table.aside();
    if (rests === "rest") {
      const before = trip.sheet;
      const r = rest(trip)!;
      trip = r.trip;
      table.clock(trip.sheet.hour);
      const carried = table.carry(before, trip.sheet, false);
      await table.say(restSaid(r));
      await carried;
    } else await table.say([PRESS_ON]);
  };

  /** The road from where you are to the end: forks, places, and a rest between them. */
  const road = async (asked0: boolean): Promise<Trip> => {
    let asked = asked0;
    while (!trip.over) {
      opts.save?.(trip);
      sky();
      // Left to right as they lie on the map, so "the one on your left" is the one that is.
      const choices = ahead(trip).sort((a, b) => (placeOf(trip.adv, a.id)?.u ?? 0) - (placeOf(trip.adv, b.id)?.u ?? 0));
      if (!choices.length) break;
      let pick = choices[0]!;
      if (choices.length > 1) {
        stage = "fork";
        const comp = trip.party.map((id) => companionOf(trip.adv, id)!).find((c) => c && prefers(c, choices));
        const liked = comp ? prefers(comp, choices) : null;
        await table.say(forkSaid(trip, choices, choices.map((s) => hoursTo(trip, s.id)), comp && liked ? { name: comp.name, side: choices.indexOf(liked) } : null));
        const id = await table.fork(choices);
        pick = choices.find((s) => s.id === id) ?? pick;
      }
      stage = "road";
      const setOut = trip.sheet.hour;
      const a = arrive(trip, pick.id)!;
      trip = a.trip;
      const here = worldArrive(trip, pick);
      trip = here.trip;
      // A contest's names are asked for at once, while the card is turned and the place is told.
      const naming = trip.facing?.contest && minds.contest ? minds.contest(trip.facing.moment, trip.facing.contest.kind).catch(() => ({}) as ContestNames) : null;
      table.clock(trip.sheet.hour);
      await table.move("shadow", pick.id);
      await table.turn(pick);
      sky(pick);
      // The narrator stands up the blocks of the ways there are here while it speaks, and is done before it writes.
      const standing = trip.facing ? table.ways?.(wayStates(trip.facing.moment)) : undefined;
      await table.say(arriveSaid(a));
      await standing;
      await ranFrom(setOut);
      if (here.lines.length) await table.say(here.lines);
      if (trip.over) break;
      await table.page(stopPage(a));
      await writeMargin(pick);
      await narratorSide();
      if (trip.over) break;
      const ask = asked ? ASK_NEXT : ASK_SAID;
      asked = true;
      // In a contest the question comes after what is coming at you, so that is what you answer.
      if (trip.facing?.contest) await openContest(naming);
      else await table.say([ask]);
      await atStop(pick, ask);
      if (trip.over) break;
      // Past it (or round it): rest, if you are hurt, or press on.
      await camp();
    }
    opts.save?.(null);
    stage = "over";
    await table.say(endSaid(trip));
    await table.page(endPage(trip));
    return trip;
  };

  /** The names a line can use that the table holds beyond the scene: companions, the one you court, places passed (for grading a line). */
  const alsoReal = (): string[] => [
    ...trip.party.map((id) => companionOf(trip.adv, id)?.name ?? ""),
    ...(trip.adv.courted ? [trip.adv.courted.name] : []),
    ...trip.visited.map((id) => placeName(trip.adv, id)),
  ].filter(Boolean);

  /** The marks on your side of the table follow the ones you carry. */
  const marksMoved = async (before: readonly Lever[]): Promise<void> => {
    for (const l of before) if (!trip.marks.some((x) => x.id === l.id)) await table.take(l.id);
    for (const l of trip.marks) if (!before.some((x) => x.id === l.id)) await table.give(markCard(l));
  };

  /** A move of the narrator's has happened at the place in your way: show it, say what it does, and set the table to match. */
  const moved = async (before: Trip, mv: Move, lead: string[], why = ""): Promise<void> => {
    const m = trip.facing!.moment;
    const told = minds.move ? await table.wait("tell", minds.move(m, `${moveNote(mv)}${why}`).catch(() => "")) : "";
    if (mv.save) {
      // Something comes at you: you throw to keep it off before the rule is said.
      await table.say([...lead, ...(told ? [told] : []), saveAsk(mv.save, "it comes at you")]);
      await table.throwDie(mv.save.natural);
      await table.say([saveSaid(mv.save), moveRule(mv)]);
    } else await table.say([...lead, ...(told ? [told] : []), moveRule(mv)]);
    table.clock(trip.sheet.hour);
    if (["hurt", "cold", "delay"].includes(mv.kind) || before.sheet.store !== trip.sheet.store) await table.carry(before.sheet, trip.sheet, false);
    if (mv.kind === "shut") await table.ways?.(wayStates(m));
    if (mv.kind === "sour") await marksMoved(before.marks);
    if (mv.kind === "brand") await table.against?.(trip.against ?? []);
  };

  /** What luck said yes to at a place, while it can still be leaned on. */
  const luckLever = (m: Moment): Lever | null => m.stop.levers.find((l) => l.id.startsWith("luck:") && leverLeft(m, l)) ?? null;

  /**
   * Whether a line asks luck something (engine/luck.ts), read by the model when there is one, else by the rules:
   * what would be so, and which way it would help. Null when it is not a question for luck.
   */
  const luckAsked = async (line: string, m: Moment): Promise<LuckAsk | null> => {
    if (minds.luck) return table.wait("read", minds.luck(line, m).catch(() => null));
    const fact = luckRead(line);
    if (!fact) return null;
    const way = rulesRead(line, m)?.way ?? WAYS.find((w) => m.stop.ways[w] && !m.closed.includes(w)) ?? "talk";
    return { fact, way };
  };

  /**
   * On coming to a place (dread.ts): if the bowl holds enough, the narrator spends it on a move here; then, now and
   * again, it offers you your calling's fault.
   */
  const narratorSide = async (): Promise<void> => {
    const nt = narratorTurn(trip);
    if (nt) {
      const before = trip;
      trip = nt.trip;
      const bowl = table.dread?.(trip.dread ?? 0);
      await moved(before, nt.move, [spendSaid(nt.spent)]);
      await bowl;
    }
    const fault = opts.hero?.calling?.fault;
    if (!fault || !tempting(trip, fault)) return;
    const m = trip.facing!.moment;
    // Whether the fault could make trouble here at all, asked of the Decision model when there is one.
    const fits = minds.pick ? await minds.pick("Could this flaw plausibly make trouble for the player in this situation?", `The flaw: ${fault}
The situation: ${m.stop.situation}`, { yes: "yes, it could", no: "no, it has nothing to do with it" }, "Say whether a character's flaw could make trouble in a scene.").catch(() => null) : null;
    if (fits === "no") return;
    const store = trip.storeName ?? "store";
    await table.say(temptSaid(fault, store));
    const w = await table.write();
    await w.given;
    const answer = await pickBy(minds, "Does the player let their flaw have its way?", w.line, { yes: "yes: they let it, or give in to it", no: "no: they hold it back" }, () => {
      const r = temptRead(w.line);
      return r === null ? null : r ? "yes" : "no";
    }, (p) => table.wait("read", p));
    void table.aside();
    const g = answer === "yes" ? giveIn(trip) : null;
    if (!g) {
      trip = refuse(trip);
      await table.say([TEMPT_NO]);
      return;
    }
    const before = trip;
    trip = g.trip;
    await moved(before, g.move, [temptYes(store)], ` It happens because the player gave in to their flaw: ${fault}.`);
  };

  /** The narrator unrolls the leather for a contest, with the names a model gave it if any, and says how it goes. */
  const openContest = async (naming: Promise<ContestNames> | null): Promise<void> => {
    const f = trip.facing!;
    const names = naming ? await table.wait("deal", naming) : {};
    const contest = renamed(f.contest!, names);
    trip = { ...trip, facing: { ...f, contest } };
    const shown = table.board?.(contest);
    await table.say(contestSaid(contest, !!f.stop.climax));
    await shown;
  };

  /** You give in, in the contest in your way: the leather is rolled up, and you go on with nothing, or the story is lost. */
  const giveUp = async (stop: RoadStop): Promise<void> => {
    void table.aside();
    trip = yieldContest(trip)!;
    table.clock(trip.sheet.hour);
    opts.save?.(trip.over ? null : trip);
    await table.say(yieldSaid(trip));
    await table.board?.(null);
    await table.ways?.(null);
    if (!trip.over) {
      await table.clear(stop);
      void table.move("you", stop.id);
    }
  };

  /** The stop in your way, played try by try until you are past it, round it, or the adventure is over. */
  const atStop = async (stop: RoadStop, ask = ASK_NEXT): Promise<void> => {
    let scaleSaid = false;
    let next: Written | null = null;
    // In a contest: the round whose blow has been shown, and what it was.
    let shownRound = -1;
    let blow = "";
    while (trip.facing && !trip.over) {
      if (!next) opts.save?.(trip);
      const c0 = trip.facing.contest;
      if (c0 && c0.round !== shownRound) {
        // What is coming at you this round, said before you write, so you can answer it.
        shownRound = c0.round;
        const foe = coming(c0);
        const said = foe && minds.blow ? await table.wait("tell", minds.blow(trip.facing.moment, c0, foe).catch(() => "")) : "";
        blow = said || blowLine(c0);
        await table.say([blow, ...(c0.round ? [ASK_ROUND] : [BLOW_RULE, ask])]);
      }
      stage = "write";
      const w = next ?? (await table.write());
      next = null;
      stage = "given";
      const m = trip.facing.moment;
      // The reading starts now, while the page is still in the air.
      const reading = minds.read(w.line, m);
      await w.given;
      if (trip.facing.contest && yieldRead(w.line)) {
        const gives = await pickBy(minds, "Does the player give in, and stop the contest?", w.line, { yes: "yes: they give in, give up or yield", no: "no: they keep at it" }, () => "yes", (p) => table.wait("read", p));
        if (gives === "yes") {
          await giveUp(stop);
          return;
        }
      }
      const heard = await table.wait("read", reading);
      let said = heard;
      if (isUse(heard)) {
        // An ability used without a die: a trick, a thing learned, a mark, a mend. The narrator shows it; the rules say what it comes to.
        const u = useAbility(trip, { ...heard, grade: checkedGrade(heard.grade, w.line, m, alsoReal()) });
        if (!u || u.effect === "try" || u.effect === "spent") {
          // Nothing to set up with it here: if the line also tries to get past, that try is what it does.
          const plain = rulesRead(w.line, m);
          if (plain) said = u?.effect === "try" ? { ...plain, ability: u.ability.id } : plain;
          else {
            void table.aside();
            await table.say(u ? usedSaid(u, trip.storeName) : [UNCLEAR_SAID]);
            continue;
          }
        }
      }
      if (isUse(said)) {
        const u = useAbility(trip, { ...said, grade: checkedGrade(said.grade, w.line, m, alsoReal()) })!;
        void table.aside();
        const before = trip.sheet;
        trip = u.trip;
        table.clock(trip.sheet.hour);
        const store = trip.storeName ?? "store";
        const told = await table.wait("tell", minds.answer(w.line, trip.facing?.moment ?? m, `${abilityNote(u.ability, store)} ${usedSaid(u, store).join(" ")}`));
        const carried = u.effect === "mend" || before.store !== trip.sheet.store ? table.carry(before, trip.sheet, false) : undefined;
        await table.say([...(told ? [told] : []), ...usedSaid(u, store)]);
        await carried;
        continue;
      }
      if (said === "none") {
        // The world reads it first (world.ts): a goal of your own, time spent, two slips laid together, words to the person here, a look round.
        const hourBefore = trip.sheet.hour;
        const w2 = worldLine(trip, w.line, m);
        if (w2) {
          void table.aside();
          const answering = w2.note ? minds.answer(w.line, w2.trip.facing?.moment ?? m, w2.note) : null;
          trip = w2.trip;
          if (!w2.hours) trip = ponder(trip) ?? trip;
          table.clock(trip.sheet.hour);
          const answer = answering ? fit(await table.wait("tell", answering)) : "";
          await worldSaid({ ...w2, trip }, answer ? [answer] : []);
          if (!w2.hours) await ranFrom(hourBefore);
          if (trip.sheet.hour >= trip.adv.deadline.hour) {
            // Time spent past the deadline: the job is lost, as it would be by any other way of spending it.
            trip = { ...trip, facing: null, over: "deadline" };
            break;
          }
          await fellowsSpeak(w.line, trip.facing?.moment ?? m);
          continue;
        }
        // A question only luck can settle ("is there a boat at the jetty?"): the narrator throws its own die. Once a place.
        const asked = canLuck(trip) ? await luckAsked(w.line, m) : null;
        const thrown = asked ? throwLuck(trip, asked) : null;
        if (asked && thrown) {
          void table.aside();
          trip = ponder(thrown.trip)!;
          table.clock(trip.sheet.hour);
          const fact = thrown.luck.mark?.name ?? asked.fact;
          const answering = minds.answer(w.line, trip.facing!.moment, luckNote(thrown.luck, fact));
          await table.say([luckAsk(fact)]);
          await table.luck?.(thrown.luck.natural);
          const answer = await table.wait("tell", answering);
          const [verdict, ...rule] = luckSaid(thrown.luck, fact);
          await table.say([verdict, ...(answer ? [answer] : []), ...rule, ...(pondered ? [] : [ASK_TIME_SAID])]);
          pondered = true;
          if (thrown.luck.mark) await table.give(markCard(thrown.luck.mark));
          continue;
        }
        // A question, or a look round: the narrator answers from what is here. No die, but the clock runs.
        const answering = minds.answer(w.line, m);
        void table.aside();
        trip = ponder(trip)!;
        table.clock(trip.sheet.hour);
        const answer = fit(await table.wait("tell", answering));
        await table.say([answer, ...(pondered ? [] : [ASK_TIME_SAID])]);
        pondered = true;
        await ranFrom(hourBefore);
        await fellowsSpeak(w.line, m);
        continue;
      }
      // A try that names no ability leans on one that works by itself, if one fits; the line's grade is held to what it really uses.
      const contest = trip.facing.contest;
      // A try handed to another player is thrown on their stats (docs/MOONSHOT.md, 4.3).
      const hand = handedTo(w.line, (trip.fellows ?? []).filter((f) => !f.at));
      const mh: Moment = hand ? { ...m, sheet: { ...m.sheet, stats: { ...handOver(hand).stats }, ...(hand.powerName ? { powerName: hand.powerName } : {}) } } : m;
      const read = said && withAbility(mh, { ...said, line: w.line, trade: tradeOf(w.line) ?? undefined, grade: checkedGrade(said.grade, w.line, mh, alsoReal()), ...(contest ? { target: foeNamed(w.line, contest) } : {}) });
      const check = read && nameCheck(mh, read);
      if (check && check.effect === "none") {
        // Too far outmatched for any throw to matter: no die, and what would change the gap (docs/MOONSHOT.md, 2.2).
        void table.aside();
        const open = WAYS.filter((x) => x !== check.way && !shut(m, x));
        await table.say(cantSaid(check, couldInstead(m.stop.foe, open)));
        continue;
      }
      if (!read || !check) {
        const why = read && shut(m, read.way);
        void table.aside();
        await table.say([read && why ? shutSaid(read.way, why, m.stop.ways[read.way]?.price ?? 0) : UNCLEAR_SAID]);
        continue;
      }
      stage = "check";
      void table.weigh(check);
      await table.say([...(hand ? [handSaid(hand, read.way)] : []), ...checkSaid(check), ...(scaleSaid ? [] : [SCALE_SAYS]), DIE_SAYS]);
      scaleSaid = true;
      next = await table.dieOrLine();
      if (next) continue;

      // The number is decided here, before the die is touched. The throw only shows it.
      const before = trip.sheet;
      const marksBefore = trip.marks;
      const hourBefore = trip.sheet.hour;
      if (hand && trip.facing) trip = { ...trip, facing: { ...trip.facing, moment: mh } };
      const felt = worldTried(trip, check.way, { ...(hand ? { handed: hand.id } : {}), desperate: check.position === "desperate" });
      trip = felt.trip;
      const turn = attempt(trip, read);
      if (!turn) continue;
      const o = turn.outcome;
      stage = "throw";
      await table.throwDie(o.natural);
      trip = turn.trip;
      // Kept at once: leaving the table now cannot take back a throw.
      opts.save?.(trip.over ? null : trip);
      stage = "told";
      table.clock(trip.sheet.hour);
      void table.weigh(null);
      minds.know?.(trip.adv.who, trip.party.map((id) => companionOf(trip.adv, id)).filter((c) => !!c).map((c) => (c!.who.toLowerCase().startsWith(c!.name.toLowerCase()) ? c!.who : `${c!.name}, ${c!.who}`)), rules());
      // In a contest, a try that works but does not end it is "more"; the round's own facts go to the teller too.
      const more = turn.round ? o.past && !turn.cleared && !turn.taken : turn.more;
      const note = narratorNote(o, more) + (turn.round ? ` ${contestNote(turn.round, contestKind(stop), blow)}` : "");
      const telling = minds.tell(o, stop, note, more);
      const [sum, says] = rollLines(o);
      const told = fit(await table.wait("tell", telling));
      const carried = table.carry(before, trip.sheet, o.check.way === "pay" && trip.sheet.supplies < before.supplies);
      const after = turnSaid(turn);
      if (turn.dread) void table.dread?.(trip.dread ?? 0);
      const dials = turn.contest ? table.board?.(turn.contest) : undefined;
      const danger = turn.round?.danger?.save;
      const cut = danger ? after.indexOf(dangerSaveSaid(danger)) : -1;
      if (danger && cut >= 0) {
        // The danger arrives this round: you throw to keep it off before what it did is said.
        await table.say([says!, told, ...after.slice(0, cut), saveAsk(danger, "it comes at you")]);
        await table.throwDie(danger.natural);
        await table.say(after.slice(cut));
      } else await table.say([says!, told, ...after]);
      if (turn.againstUsed) await table.against?.(trip.against ?? []);
      await carried;
      await dials;
      if (turn.used) await table.take(turn.used.id);
      await marksMoved(marksBefore);
      // What luck gave you here goes once it is leaned on, or once the place is behind you.
      const lucky = luckLever(m);
      if (lucky && (!trip.facing || !luckLever(trip.facing.moment))) await table.take(lucky.id);
      if (turn.rivalGained && trip.adv.rival) await table.rival(trip.rival, trip.adv.rival.max);
      const changed = changeLines(o).filter((l) => !((more || turn.taken || (turn.round && !turn.cleared)) && l.startsWith("You are past")));
      await table.page({ heading: checkHeading(check), his: [sum!, told, ...changed, ...after] });
      const away = turn.cleared || !!turn.longWay || (!!turn.taken && turn.taken !== "end");
      if (turn.contest && (away || trip.over)) await table.board?.(null);
      if (away || trip.over) await table.ways?.(null);
      else if (o.closed && trip.facing) await table.ways?.(wayStates(trip.facing.moment));
      trip = synced(trip);
      if (felt.lines.length) await table.say(felt.lines);
      await ranFrom(hourBefore);
      if (away || o.past) await worldSaid(worldPast(trip, stop, true));
      if (!trip.over) await fellowsSpeak(w.line, m, check.way);
      if (away) {
        await table.clear(stop);
        void table.move("you", stop.id);
        const r = turn.reward;
        const loot = r?.loot ? lootOf(trip.adv, r.loot) : undefined;
        if (loot) await table.give({ id: loot.id, card: loot.card, name: loot.name, side: "loot" });
        trip = geared(trip);
        const c = r?.joins ? companionOf(trip.adv, r.joins) : undefined;
        if (c) await table.give({ id: c.id, card: c.card, name: c.name, side: "companion" });
        if (turn.levelUp) await levelUp();
      } else if (!trip.over) {
        // Still in your way: the narrator lifts its piece and sets it down again where it stood. In a contest, what
        // comes at you next is said first, and the question after it.
        void table.move("shadow", stop.id);
        if (!trip.facing?.contest) await table.say([ASK_AGAIN]);
      }
    }
  };

  /**
   * What your hero notices here, written in the margin of your notebook (docs/MOONSHOT.md, 3.2): only what you are good
   * enough to see, and now and then your fault, in your own hand. Your companions' help counts.
   */
  const writeMargin = async (stop: RoadStop): Promise<void> => {
    if (!trip.facing || !table.margin) return;
    const seed = `${trip.seed}:${stop.id}`;
    const notices = [...(stop.notices ?? []), ...foeNotices(stop.foe, stop.id)];
    const notes = marginFor(trip.facing.moment.sheet, notices, trip.noticed ?? [], { due: faultDue(trip.faults ?? 0, seed), seed });
    if (!notes.length) return;
    trip = { ...trip, noticed: [...(trip.noticed ?? []), ...notes.filter((n) => !n.fault).map((n) => n.id)], faults: (trip.faults ?? 0) + (notes.some((n) => n.fault) ? 1 : 0) };
    await table.margin(notes.map((n) => marginLine(n, trip.sheet.powerName)));
  };

  /**
   * Two abilities dealt face up, written from what you did (docs/SYSTEMS.md, 2.3) or, with no model, from the stock;
   * the one you keep is yours from the next stop, and your store grows.
   */
  const levelUp = async (): Promise<void> => {
    const room = offerRoom(trip.abilities, trip.level);
    const usedWays = [...new Set(trip.deeds.map((d) => (["talk", "sneak", "force", "pay"] as Way[]).find((w) => d.includes(w))).filter((w): w is Way => !!w))];
    const written = minds.offer && opts.hero ? await table.wait("deal", minds.offer(opts.hero, trip.abilities, trip.deeds, trip.level, room, opts.world).catch(() => [] as Ability[])) : [];
    const offers = (written.length === 2 ? written : stockOffer(trip.abilities, trip.level, trip.seed, usedWays)).map((a, i) => ({ ...a, id: `${a.id}-l${trip.level}-${i}` }));
    if (!offers.length) return;
    const store = trip.storeName ?? "store";
    await table.say(levelSaid(offers, store));
    const i = await table.offer(offers.map(abilityCard));
    const a = offers[i] ?? offers[0]!;
    trip = takeAbility(trip, a);
    void table.carry(null, trip.sheet, false);
    await table.say([levelTaken(a)]);
  };

  const done = play();
  return {
    get trip() {
      return trip;
    },
    get stage() {
      return stage;
    },
    done,
  };
}

/** A card's title, for tables that show it in words. */
export const titleOf = (card: string): string => cardKind(card).title;
