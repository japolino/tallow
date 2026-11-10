/**
 * One moment of the loop, played at the table with nothing on the screen but
 * the room (milestone 2). You write in the notebook and hand the page over;
 * the narrator speaks, loads the balance, takes and gives counters, writes
 * under your line and hands the page back.
 *
 * Nothing here decides anything. The rules are in src/engine/moment.ts and
 * the words in src/engine/tell.ts; this file only says them and tells the
 * room what to show. The number on the die is known before the die is
 * picked up. There is no model: a list of plain words stands in for the
 * narrator's reading of your line, and its tellings are fixed (mock.ts).
 */
import { randomSeed } from "../src/engine/dice.js";
import { nameCheck, resolve, shut, startMoment, STATS, type Moment, type Outcome } from "../src/engine/moment.js";
import { ASK_AGAIN, ASK_SAID, changeLines, checkHeading, checkSaid, DIE_SAYS, endLines, KIND_SAYS, rollLines, SCALE_SAYS, shutSaid, STAT_NAME, UNCLEAR_SAID } from "../src/engine/tell.js";
import { weigh } from "../src/engine/weigh.js";
import { rulesRead } from "../src/meaning/read.js";
import { CARRIED } from "../src/room/counters.js";
import type { RoomHandle } from "../src/room/room.js";
import { BRIDGE, ROAD, TOLD, WHO, YOU } from "./mock.js";

/** Said once, at the start: the things on your side of the table. Preview wording; the game will have its own. */
const TABLE_SAYS = "Before you: red stones for your health, coins for your supplies, pale seals for the goodwill people bear you. I take what you lose, and I give what you gain.";
const PAGE_SAYS = "Here is how things stand, in writing. Read it, then set it down: a click will do, or Enter. The pages you set down stay in a pile by your hand.";
const AGAIN_SAYS = "That is the whole of this moment. Hand me a page, any page, and we will play it again.";

export type Stage = "intro" | "write" | "given" | "check" | "throw" | "told" | "over";

export interface PlayOptions {
  seed?: string;
  /** The hour the moment starts at, if not the made-up character's own. */
  hour?: number;
  reduced: boolean;
  /** Sets the room's clock. */
  setHour(hour: number): void;
}

export function startPlay(room: RoomHandle, opts: PlayOptions): { readonly moment: Moment; readonly stage: Stage } {
  const begin = (seed: string): Moment => startMoment(BRIDGE, { ...YOU, stats: { ...YOU.stats }, hour: opts.hour ?? YOU.hour }, seed);
  let moment = begin(opts.seed ?? randomSeed());
  let stage: Stage = "intro";
  let shownHour = moment.sheet.hour;
  const handle = {
    get moment() {
      return moment;
    },
    get stage() {
      return stage;
    },
  };
  opts.setHour(shownHour);
  const desk = room.desk;
  // The flat room has no table to play at.
  if (!desk) return handle;

  let clockRun = 0;
  const slideClock = (to: number): void => {
    cancelAnimationFrame(clockRun);
    const from = shownHour;
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

  /** The narrator's piece stands on whatever is in your way; yours stands on the last stop you got past. */
  const showPieces = (o: Outcome): void => {
    if (o.past) void room.movePiece("shadow", ROAD.next).then(() => room.movePiece("you", ROAD.stop));
    else if (o.turnedBack) void room.movePiece("shadow", ROAD.other);
    // Still in your way: the narrator lifts its piece and sets it down again where it stood.
    else void room.movePiece("shadow", ROAD.stop);
  };

  /** The counters on the table follow what you carry: the narrator takes what is lost and gives what is gained, one pile at a time. */
  const showCarried = async (before: Moment["sheet"], o: Outcome): Promise<void> => {
    for (const kind of CARRIED) {
      if (moment.sheet[kind] === before[kind]) continue;
      await desk.counters.change(kind, moment.sheet[kind], kind === "supplies" && o.check.way === "pay" && moment.sheet.supplies < before.supplies);
    }
  };

  /** Either you take a die from the box, or you write another line instead. */
  type Line = { line: string; given: Promise<void> };
  const dieOrLine = (): Promise<Line | null> =>
    new Promise((done) => {
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
    });

  const intro = async (): Promise<void> => {
    stage = "intro";
    desk.counters.set(moment.sheet);
    void desk.counters.weigh({ his: 0, yours: 0, lever: false, lean: 0 });
    const s = moment.sheet.stats;
    const strengths = `Your strengths, each out of 4: ${STATS.map((k) => `${STAT_NAME[k]} ${s[k]}`).join(", ")}. When a try leans on one, that many small weights go in your pan of the balance.`;
    await desk.say([KIND_SAYS[moment.stop.kind], moment.stop.situation, TABLE_SAYS, PAGE_SAYS]);
    await desk.handBack({ heading: moment.stop.name, his: [moment.stop.situation, WHO, strengths] });
  };

  const run = async (): Promise<void> => {
    await room.ready;
    for (;;) {
      await intro();
      let scaleSaid = false;
      await desk.say(ASK_SAID);
      stage = "write";
      let next: Line | null = await desk.write();
      while (!moment.over) {
        const { line, given } = next ?? (await desk.write());
        next = null;
        stage = "given";
        // Read while the page is still in the air.
        const read = rulesRead(line, moment);
        const check = read && nameCheck(moment, read);
        await given;
        if (!read || !check) {
          const why = read && shut(moment, read.way);
          void desk.pushAside();
          await desk.say(read && why ? shutSaid(read.way, why, moment.stop.ways[read.way]?.price ?? 0) : UNCLEAR_SAID);
          stage = "write";
          continue;
        }
        stage = "check";
        // You turn to the balance while it is loaded, and back when the beam has come to rest.
        desk.watchBalance(desk.counters.weigh(weigh(check)));
        await desk.say([...checkSaid(check), ...(scaleSaid ? [] : [SCALE_SAYS]), DIE_SAYS]);
        scaleSaid = true;
        next = await dieOrLine();
        if (next) continue;

        // The number is decided here, before the die is touched. The throw only shows it.
        const before = moment.sheet;
        const o = resolve(moment, read);
        if (!o) continue;
        stage = "throw";
        desk.voice.hush();
        await room.offerDie(o.natural);
        moment = o.next;
        stage = "told";
        slideClock(moment.sheet.hour);
        // Not while you are bent over the die: the table changes once it is in view again.
        await room.settled?.();
        void desk.counters.weigh(null);
        const [sum, says] = rollLines(o);
        const told = TOLD[o.check.way][o.tier === "partial" ? "cost" : o.past ? "past" : "fail"];
        const carried = showCarried(before, o);
        await desk.say([says!, told]);
        await carried;
        await desk.handBack({ heading: checkHeading(check), his: [sum!, told, ...changeLines(o)] });
        showPieces(o);
        if (!moment.over) {
          await desk.say(ASK_AGAIN);
          stage = "write";
        }
      }
      stage = "over";
      await desk.say([...endLines(moment, ROAD.nextName, ROAD.otherName), AGAIN_SAYS]);
      const last = await desk.write();
      await last.given;
      void desk.pushAside();
      moment = begin(randomSeed());
      slideClock(moment.sheet.hour);
      void room.movePiece("you", ROAD.from);
      void room.movePiece("shadow", ROAD.stop);
    }
  };
  void run();
  return handle;
}
