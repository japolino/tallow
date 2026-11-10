/**
 * The table in the room: the director's `Table` (director.ts) played with the room's things, so a whole adventure is
 * shown with nothing on the screen but the room. Nothing here decides anything.
 *
 * Every wait for a model is something the narrator does (docs/DESIGN.md, 2, "The room hides every wait"):
 *   read  it holds your page up to the candlelight and reads it;
 *   tell  it thinks it over with its hands, and looks out of the window if it takes long;
 *   deal  it shuffles the deck.
 * Each starts only if the work is not done already, and ends the moment it is.
 */
import type { RoadStop } from "../engine/adventure.js";
import type { Sheet } from "../engine/moment.js";
import { forkRead, FORK_AGAIN, LEVEL_AGAIN, pickRead } from "../engine/tell-adventure.js";
import { weigh } from "../engine/weigh.js";
import { CARRIED } from "../room/counters.js";
import type { RoomHandle } from "../room/room.js";
import type { Beat, SideCard, Table, Written } from "./director.js";

export interface RoomTableOptions {
  reduced: boolean;
  /** Sets the room's clock (and anything else that shows the hour). */
  setHour(hour: number): void;
}

export function roomTable(room: RoomHandle, opts: RoomTableOptions): Table {
  const desk = room.desk;
  if (!desk) throw new Error("tallow: the flat room has no table to play at.");

  let shownHour: number | null = null;
  let clockRun = 0;
  /** The clock slides to a new hour, quicker for a short way than a long one. */
  const slideClock = (to: number): void => {
    cancelAnimationFrame(clockRun);
    const from = shownHour ?? to;
    if (opts.reduced || Math.abs(to - from) < 1e-6) {
      shownHour = to;
      opts.setHour(to);
      return;
    }
    const t0 = performance.now();
    const dur = 900 + Math.min(2200, Math.abs(to - from) * 900);
    const tick = (now: number): void => {
      const k = Math.min(1, (now - t0) / dur);
      shownHour = from + (to - from) * (k * k * (3 - 2 * k));
      opts.setHour(shownHour);
      if (k < 1) clockRun = requestAnimationFrame(tick);
    };
    clockRun = requestAnimationFrame(tick);
  };

  /** Two cards are laid out: touch one, or write which. `read` makes a written line into 0, 1, or -1 for "cannot tell". */
  const choose = (read: (line: string) => number, again: string): Promise<number> =>
    new Promise<number>((done) => {
      let over = false;
      desk.cards.choosing = (i) => {
        if (over) return;
        over = true;
        desk.noLine();
        done(i);
      };
      const ask = async (): Promise<void> => {
        while (!over) {
          const w = await desk.write();
          if (over) return;
          await w.given;
          void desk.pushAside();
          const i = read(w.line);
          if (i >= 0) {
            over = true;
            done(i);
            return;
          }
          await desk.say(again);
        }
      };
      void ask();
    });

  const table: Table = {
    say: (lines) => desk.say(lines),
    write: () => desk.write(),
    page: (w) => desk.handBack(w),
    aside: () => desk.pushAside(),

    wait<T>(beat: Beat, work: Promise<T>): Promise<T> {
      if (beat === "read") return desk.reading(work);
      if (beat === "tell") return desk.musing(work);
      void desk.cards.shuffle(work);
      return work;
    },

    async weigh(check) {
      if (!check) return desk.counters.weigh(null);
      // You turn to the balance while it is loaded, and back when the beam has come to rest.
      const settled = desk.counters.weigh(weigh(check));
      desk.watchBalance(settled);
      return settled;
    },

    dieOrLine: () =>
      new Promise<Written | null>((done) => {
        desk.onDie = () => {
          desk.onDie = null;
          desk.lookBack();
          desk.noLine();
          done(null);
        };
        void desk.write().then((w) => {
          desk.onDie = null;
          done(w);
        });
      }),

    async throwDie(natural) {
      desk.voice.hush();
      await room.offerDie(natural);
      // Not while you are bent over the die: the table changes once it is in view again.
      await room.settled?.();
    },

    async carry(before: Sheet | null, after: Sheet, paid: boolean) {
      if (!before) {
        desk.counters.set(after);
        void desk.counters.weigh({ his: 0, yours: 0, lever: false, lean: 0 });
        return;
      }
      // The narrator takes what is lost and gives what is gained, one pile at a time.
      for (const kind of CARRIED) {
        if (after[kind] === before[kind]) continue;
        await desk.counters.change(kind, after[kind], kind === "supplies" && paid);
      }
    },

    clock: (hour) => slideClock(hour),

    deal: (stops: RoadStop[]) => desk.cards.deal(stops.map((s) => ({ id: s.id, kind: s.card }))),
    turn: (stop) => desk.cards.turn(stop.id),
    clear: (stop) => desk.cards.clear(stop.id),

    async fork(stops) {
      await desk.cards.lay(stops.map((s) => s.id));
      const picked = await choose((line) => {
        const id = forkRead(line, stops);
        return id ? stops.findIndex((s) => s.id === id) : -1;
      }, FORK_AGAIN);
      await desk.cards.unlay(picked);
      return stops[picked]!.id;
    },

    async offer(cards) {
      await desk.cards.offer(cards.map((c) => ({ id: c.id, kind: c.card, name: c.name })));
      const picked = await choose((line) => pickRead(line, cards.map((c) => c.name)), LEVEL_AGAIN);
      await desk.cards.unoffer(picked);
      return picked;
    },

    give: (card: SideCard) => desk.cards.give({ id: card.id, kind: card.card, name: card.name }, card.side === "rival"),
    take: (id) => desk.cards.take(id),
    rival: (n, max) => desk.cards.rival(n, max),
    move: (piece, at) => room.movePiece(piece === "you" ? PLAYER : "shadow", at),
  };
  return table;
}

/** The id of the player's own piece in the room. */
export const PLAYER = "you";
