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
import { forkRead, FORK_AGAIN, HUB_AGAIN, LEVEL_AGAIN, pickRead } from "../engine/tell-adventure.js";
import { weigh } from "../engine/weigh.js";
import { CARRIED } from "../room/counters.js";
import { music } from "../room/music.js";
import type { RoomHandle } from "../room/room.js";
import type { Beat, SideCard, Table, Written } from "./director.js";
import type { Minds } from "./minds.js";

export interface RoomTableOptions {
  reduced: boolean;
  /** Sets the room's clock (and anything else that shows the hour). */
  setHour(hour: number): void;
  /** Reads a written choice of card by meaning (a Decision model), when there is one. */
  pick?: Minds["pick"];
}

export function roomTable(room: RoomHandle, opts: RoomTableOptions): Table {
  const desk = room.desk;
  if (!desk) throw new Error("tallow: the flat room has no table to play at.");

  let shownHour: number | null = null;
  // The music follows the table (room/music.ts): on the road (by night after dark), at a stop, in a contest, at the end.
  let at: "road" | "place" = "road";
  let contest = false;
  let dark = false;
  const mood = (): void => music.set(contest ? "contest" : at === "place" ? "place" : dark ? "night" : "road");
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

  /** Two cards are laid out: touch one, or write which. `read` makes a written line into 0, 1, or -1 for "cannot tell". */
  const choose = (read: (line: string) => number | Promise<number>, again: string): Promise<number> =>
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
          const got = read(w.line);
          const i = typeof got === "number" ? got : await desk.reading(got);
          void desk.pushAside();
          if (over) return;
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

  /**
   * A written choice of card read by meaning first (opts.pick), and by its words when that cannot tell. The options'
   * keys are what the player sees ("left", "2"), never a hidden index, so a model answering the label is right.
   */
  const byMeaning = (question: string, line: string, options: Record<string, string>, rules: () => number): number | Promise<number> =>
    opts.pick ? opts.pick(question, line, options).then((k) => (k !== null && k in options ? Object.keys(options).indexOf(k) : rules()), rules) : rules();
  const SIDES = ["left", "right"] as const;

  const table: Table = {
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

    ink: async (place) => room.inkPlace?.(place),
    notch: (hours) => room.notch?.(hours),
    blackCandle: (c) => room.blackCandle?.(c),
    theatre: (on) => room.theatre?.(on),

    clock: (hour) => {
      const h = ((hour % 24) + 24) % 24;
      dark = h >= 20.5 || h < 5.5;
      mood();
      slideClock(hour);
    },

    deal: (stops: RoadStop[]) => {
      at = "road";
      contest = false;
      mood();
      return desk.cards.deal(stops.map((s) => ({ id: s.id, kind: s.card, ...(s.face ? { title: s.face } : {}) })));
    },
    turn: (stop) => {
      at = "place";
      mood();
      return desk.cards.turn(stop.id);
    },
    clear: (stop) => {
      at = "road";
      mood();
      return desk.cards.clear(stop.id);
    },

    async fork(stops, read) {
      // A line the director reads itself first (a player sent down the other way), then the meaning, then the rules.
      const own = (line: string): number => {
        const id = read?.(line);
        return id ? stops.findIndex((s) => s.id === id) : -1;
      };
      // The narrator's hands hold two cards: more places than that (a hub) are picked on the map, by name or number.
      if (stops.length > 2) {
        const options = Object.fromEntries(stops.map((s, i) => [String(i + 1), `place ${i + 1} on the map: ${s.name}, ${s.teaser}`]));
        const rules = (line: string): number => {
          const id = forkRead(line, stops);
          return id ? stops.findIndex((s) => s.id === id) : -1;
        };
        const picked = await choose((line) => (own(line) >= 0 ? own(line) : byMeaning("Which place do you go to?", line, options, () => rules(line))), HUB_AGAIN);
        return stops[picked]!.id;
      }
      await desk.cards.lay(stops.map((s) => s.id));
      const rules = (line: string): number => {
        const id = forkRead(line, stops);
        return id ? stops.findIndex((s) => s.id === id) : -1;
      };
      const options = Object.fromEntries(stops.map((s, i) => [SIDES[i] ?? String(i), `the card on the ${i ? "right" : "left"}: ${s.name}, ${s.teaser}`]));
      const picked = await choose((line) => (own(line) >= 0 ? own(line) : byMeaning("Which way do you go, left or right?", line, options, () => rules(line))), FORK_AGAIN);
      await desk.cards.unlay(picked);
      return stops[picked]!.id;
    },

    async offer(cards) {
      await desk.cards.offer(cards.map((c) => ({ id: c.id, kind: c.card, name: c.name, text: c.text })));
      const options = Object.fromEntries(cards.map((c, i) => [SIDES[i] ?? String(i), `the card on the ${i ? "right" : "left"}: ${c.name}`]));
      const picked = await choose((line) => byMeaning("Which card do you keep, left or right?", line, options, () => pickRead(line, cards.map((c) => c.name))), LEVEL_AGAIN);
      await desk.cards.unoffer(picked);
      return picked;
    },

    give: (card: SideCard) => desk.cards.give({ id: card.id, kind: card.card, name: card.name, text: card.text }, card.side === "rival"),
    sheets: (pages) => desk.sheets(pages),
    take: (id) => desk.cards.take(id),
    rival: (n, max) => desk.cards.rival(n, max),
    dread: (n) => desk.dread.show(n),
    board: (c) => {
      contest = !!c;
      mood();
      return desk.board.show(c);
    },
    battle: (b, events) => {
      contest = !!b;
      mood();
      return desk.mat.show(b, events);
    },
    luck: async (natural) => {
      desk.voice.hush();
      await desk.luck.throw(natural);
    },
    against: (list) => desk.against.show(list),
    sweep: async () => {
      contest = false;
      at = "road";
      music.set("end");
      await desk.board.show(null);
      await desk.mat.show(null);
      await desk.cards.sweep();
      await desk.dread.show(0);
      await desk.against.show([]);
    },
    ways: (states) => desk.ways.show(states),
    weather: (sky) => room.setWeather(sky),
    move: (piece, at) => room.movePiece(piece === "you" ? PLAYER : "shadow", at),
  };
  return table;
}

/** The id of the player's own piece in the room. */
export const PLAYER = "you";
