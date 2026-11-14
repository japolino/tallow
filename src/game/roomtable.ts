/**
 * The table in the room: the game's `Table` (table.ts) played with the room's things, so a whole game is shown with
 * nothing on the screen but the room. Nothing here decides anything.
 *
 * Every wait for a model is something the narrator does:
 *   read  it holds your page up to the candlelight and reads it;
 *   tell  it thinks it over with its hands, and looks out of the window if it takes long;
 *   deal  it shuffles the deck.
 * Each starts only if the work is not done already, and ends the moment it is.
 */
import { music } from "../room/music.js";
import type { RoomHandle } from "../room/room.js";
import type { Beat, Table, Written } from "./table.js";

export interface RoomTableOptions {
  reduced: boolean;
  /** Sets the room's clock (and anything else that shows the hour). */
  setHour(hour: number): void;
}

export function roomTable(room: RoomHandle, opts: RoomTableOptions): Table {
  const desk = room.desk;
  if (!desk) throw new Error("tallow: the flat room has no table to play at.");

  let shownHour: number | null = null;
  // The music follows the hour: the road's by day, the night's after dark.
  music.attach();
  music.set("road");
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

  return {
    async margin(notes) {
      desk.margin(notes);
    },
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

    theatre: (on) => room.theatre?.(on),
    sheets: (pages) => desk.sheets(pages),
    notes: (w) => desk.notes(w),

    clock: (hour) => {
      const h = ((hour % 24) + 24) % 24;
      music.set(h >= 20.5 || h < 5.5 ? "night" : "road");
      slideClock(hour);
    },
  };
}

/** The id of the player's own piece in the room. */
export const PLAYER = "you";
