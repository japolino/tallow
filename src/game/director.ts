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
import { ahead, arrive, placeOf, attempt, companionOf, HEALTH_MAX, hoursTo, lootOf, prefers, rest, startTrip, takePerk, withKnack, type Adventure, type RoadStop, type Trip } from "../engine/adventure.js";
import { perkOf, perkOffer, type Perk } from "../engine/hero.js";
import { cardKind } from "../engine/cards.js";
import { nameCheck, shut, type Check, type Sheet } from "../engine/moment.js";
import { arriveSaid, campAsk, campRead, endPage, endSaid, firstPage, forkSaid, levelSaid, levelTaken, PRESS_ON, restSaid, startSaid, stopPage, turnSaid } from "../engine/tell-adventure.js";
import { ASK_AGAIN, ASK_NEXT, ASK_SAID, changeLines, checkHeading, checkSaid, DIE_SAYS, narratorNote, rollLines, SCALE_SAYS, shutSaid, UNCLEAR_SAID } from "../engine/tell.js";
import type { Minds } from "./minds.js";

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
  side: "companion" | "loot" | "courted" | "rival" | "perk";
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
  /** Move a piece: yours ("you") or the narrator's ("shadow"). */
  move(piece: "you" | "shadow", at: string): Promise<void>;
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
  /** Your knacks at the start (hero.ts): the one your kind of person comes with. */
  perks?: string[];
  /** Who you are, in your words, for the first page (it replaces the adventure's own). */
  who?: string;
}

const perkCard = (p: Perk): SideCard => ({ id: `perk:${p.id}`, card: p.card, name: p.name, side: "perk" });

export function direct(adv: Adventure, sheet: Sheet, seed: string, table: Table, minds: Minds, opts: DirectOptions = {}): Director {
  const yours = (a: Adventure): Adventure => (opts.who ? { ...a, who: opts.who } : a);
  let trip = startTrip(yours(adv), sheet, seed, opts.perks);
  let stage: Stage = "start";

  const play = async (): Promise<Trip> => {
    table.clock(trip.sheet.hour);
    void table.carry(null, trip.sheet, false);
    void table.move("you", adv.start);
    const end = adv.stops.find((s) => s.climax);
    if (end) void table.move("shadow", end.id);
    if (opts.build) {
      const built = yours(await table.wait("deal", opts.build));
      trip = { ...startTrip(built, sheet, seed, opts.perks) };
    }
    await table.deal(trip.adv.stops);
    for (const id of trip.perks) {
      const p = perkOf(id);
      if (p) await table.give(perkCard(p));
    }
    for (const id of trip.party) {
      const c = companionOf(trip.adv, id);
      if (c) await table.give({ id: c.id, card: c.card, name: c.name, side: "companion" });
    }
    if (trip.adv.courted) await table.give({ id: "courted", card: trip.adv.courted.card, name: trip.adv.courted.name, side: "courted" });
    if (trip.adv.rival) {
      await table.give({ id: "rival", card: trip.adv.rival.card, name: trip.adv.rival.name, side: "rival" });
      void table.rival(0, trip.adv.rival.max);
    }
    await table.say(startSaid(trip.adv));
    await table.page(firstPage(trip));

    let asked = false;
    while (!trip.over) {
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
      const a = arrive(trip, pick.id)!;
      trip = a.trip;
      table.clock(trip.sheet.hour);
      await table.move("shadow", pick.id);
      await table.turn(pick);
      await table.say(arriveSaid(a));
      if (trip.over) break;
      await table.page(stopPage(a));
      await table.say([asked ? ASK_NEXT : ASK_SAID]);
      asked = true;
      await atStop(pick);
      if (trip.over) break;
      // Past it (or round it): rest, if you are hurt, or press on.
      if (trip.sheet.health < HEALTH_MAX) {
        stage = "camp";
        await table.say([campAsk(trip)]);
        const w = await table.write();
        await w.given;
        void table.aside();
        if (campRead(w.line) === "rest") {
          const before = trip.sheet;
          const r = rest(trip)!;
          trip = r.trip;
          table.clock(trip.sheet.hour);
          const carried = table.carry(before, trip.sheet, false);
          await table.say(restSaid(r));
          await carried;
        } else await table.say([PRESS_ON]);
      }
    }
    stage = "over";
    await table.say(endSaid(trip));
    await table.page(endPage(trip));
    return trip;
  };

  /** The stop in your way, played try by try until you are past it, round it, or the adventure is over. */
  const atStop = async (stop: RoadStop): Promise<void> => {
    let scaleSaid = false;
    let next: Written | null = null;
    while (trip.facing && !trip.over) {
      stage = "write";
      const w = next ?? (await table.write());
      next = null;
      stage = "given";
      const m = trip.facing.moment;
      // The reading starts now, while the page is still in the air.
      const reading = minds.read(w.line, m);
      await w.given;
      const said = await table.wait("read", reading);
      // A try that uses nothing in the scene leans on a knack, if you have one for that way.
      const read = said && withKnack(m, said);
      const check = read && nameCheck(m, read);
      if (!read || !check) {
        const why = read && shut(m, read.way);
        void table.aside();
        await table.say([read && why ? shutSaid(read.way, why, m.stop.ways[read.way]?.price ?? 0) : UNCLEAR_SAID]);
        continue;
      }
      stage = "check";
      void table.weigh(check);
      await table.say([...checkSaid(check), ...(scaleSaid ? [] : [SCALE_SAYS]), DIE_SAYS]);
      scaleSaid = true;
      next = await table.dieOrLine();
      if (next) continue;

      // The number is decided here, before the die is touched. The throw only shows it.
      const before = trip.sheet;
      const turn = attempt(trip, read);
      if (!turn) continue;
      const o = turn.outcome;
      stage = "throw";
      await table.throwDie(o.natural);
      trip = turn.trip;
      stage = "told";
      table.clock(trip.sheet.hour);
      void table.weigh(null);
      minds.know?.(trip.adv.who, trip.party.map((id) => companionOf(trip.adv, id)).filter((c) => !!c).map((c) => (c!.who.toLowerCase().startsWith(c!.name.toLowerCase()) ? c!.who : `${c!.name}, ${c!.who}`)));
      const telling = minds.tell(o, stop, narratorNote(o, turn.more), turn.more);
      const [sum, says] = rollLines(o);
      const told = await table.wait("tell", telling);
      const carried = table.carry(before, trip.sheet, o.check.way === "pay" && trip.sheet.supplies < before.supplies);
      const after = turnSaid(turn);
      await table.say([says!, told, ...after]);
      await carried;
      if (turn.used) await table.take(turn.used.id);
      if (turn.rivalGained && trip.adv.rival) await table.rival(trip.rival, trip.adv.rival.max);
      const changed = changeLines(o).filter((l) => !(turn.more && l.startsWith("You are past")));
      await table.page({ heading: checkHeading(check), his: [sum!, told, ...changed, ...after] });
      if (turn.cleared || turn.longWay) {
        await table.clear(stop);
        void table.move("you", stop.id);
        const r = turn.reward;
        const loot = r?.loot ? lootOf(trip.adv, r.loot) : undefined;
        if (loot) await table.give({ id: loot.id, card: loot.card, name: loot.name, side: "loot" });
        const c = r?.joins ? companionOf(trip.adv, r.joins) : undefined;
        if (c) await table.give({ id: c.id, card: c.card, name: c.name, side: "companion" });
        if (turn.levelUp) await levelUp();
      } else if (!trip.over) {
        // Still in your way: the narrator lifts its piece and sets it down again where it stood.
        void table.move("shadow", stop.id);
        await table.say([ASK_AGAIN]);
      }
    }
  };

  /** Two knacks dealt face up; the one you keep is yours from the next stop. */
  const levelUp = async (): Promise<void> => {
    const offers = perkOffer(trip.perks, trip.seed);
    if (!offers.length) return;
    await table.say(levelSaid(offers));
    const i = await table.offer(offers.map(perkCard));
    const p = offers[i] ?? offers[0]!;
    trip = takePerk(trip, p.id);
    await table.say([levelTaken(p)]);
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
