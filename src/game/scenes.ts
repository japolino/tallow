/**
 * Plays a story of scenes at a table, with a hand of dice (engine/hand.ts, docs/DESIGN.md 3.3). Like the director of a
 * road story (director.ts) it decides nothing: the rules are hand.ts, the words tell-hand.ts, and the models read and
 * tell (scenewriter.ts). It puts them in order.
 *
 * A turn: the line is read (a try, or a line that risks nothing); for a try, code prices it and the narrator says what
 * it leans on, what it risks and what each die on the table would come to; the player spends a die (touching it, or
 * writing its number) or writes something else; if the die falls short, a trade is offered at code's price; the die
 * is spent, the trip kept, and the narrator tells what happened from the note of what must be true.
 */
import type { Ability } from "../engine/abilities.js";
import { startTrip, stopOf, type Adventure, type Trip } from "../engine/adventure.js";
import { contentRules, DEFAULT_CONTENT, playable } from "../engine/content.js";
import { handDials, leaveScene, outOfTime, restHand, sceneNow, startHand, trades, worthRest, type Priced, type Scene, type SceneLine, type SceneThing, type TradeKind } from "../engine/hand.js";
import { companyNow, enterDue, lastingOf, priceTry, reviseTrip, scenesAhead, spendTry, walkAway, withCompany, type Carried, type Change, type Comrade } from "../engine/lasting.js";
import { askNote, askSaid, CHANGE_CARD, changeText, comradeText, companySaid, dueNote, duePlain, dueSaid, truthsSaid, walkAsk, walkedSaid, walkNote } from "../engine/tell-lasting.js";
import type { Sheet } from "../engine/moment.js";
import { sheetPages } from "../engine/tell-adventure.js";
import { freeNote, HAND_ASK, handBackSaid, handEndPage, handEndSaid, handFirstPage, handRestAsk, handRestSaid, handStartSaid, leftSaid, openingNote, scenePage, sceneSaid, spentNote, spentPlain, spentSaid, stakeSaid, tradeAsk, tradeOptions } from "../engine/tell-hand.js";
import { UNCLEAR_SAID } from "../engine/tell.js";
import { abilityCard, LEFT_SAID, LeftOff, type Director, type SideCard, type Stage, type Table, type Written } from "./director.js";
import { pickBy, type Minds } from "./minds.js";
import { dieNamed, rulesSceneLine } from "./scenewriter.js";

export interface SceneOptions {
  abilities?: readonly Ability[];
  level?: number;
  storeName?: string;
  /** A sitting left before its end, to take up where it stopped. */
  resume?: Trip;
  /** Told the trip at every point it could be taken up again from, and null when it is over. */
  save?: (trip: Trip | null) => void;
  /** Who goes with the hero from the last story (engine/lasting.ts, companyKept): with them from the first scene. */
  company?: readonly Carried[];
}

/** What an earlier scene left you with, as a card on your side. */
const boonCard = (b: SceneThing): SideCard => ({ id: b.id, card: "token", name: b.name, side: "loot", text: "Yours from a scene you got through. A line that uses it is a step easier, once; then it is spent." });

/** Someone who goes with you, as a card on your side. */
const comradeCard = (c: Comrade, change?: Change): SideCard => ({ id: `with:${c.id}`, card: "companion", name: c.name, side: "companion", text: comradeText(c, change) });
/** Something won that stays true, as a card: on your side, or on the narrator's for someone set against you. */
const changeCard = (c: Change): SideCard => ({ id: `won:${c.id}`, card: CHANGE_CARD[c.kind], name: c.who, side: c.kind === "sour" ? "rival" : "mark", text: changeText(c) });
/** The cards of everything won that still stands: whoever goes with you, and what is true. */
function lastingCards(t: Trip): SideCard[] {
  const l = lastingOf(t.hand);
  return [...companyNow(t).map((c) => comradeCard(c, l.changes.find((x) => x.id === c.change))), ...l.changes.filter((c) => c.kind !== "join").map(changeCard)];
}

/** What a line written when walking away is asked about can mean. */
/** At the trade: a line that answers something else, to be played after the die is spent. */
const TRADE_OTHER = "they do not answer the question: they do or say something else, a new thing to play";
const WALK_OPTIONS = { yes: "yes: they walk away and leave the scene", no: "no: they stay, and say nothing more", other: "they stay and do or say something else instead" };
/** Whether a line at a walk-away ask means it, by its words: only when nothing can read it by meaning. */
const walkWords = (line: string): keyof typeof WALK_OPTIONS => (/^\s*(yes|yeah|yep|aye|i do|i walk|walk away|go|leave)\b/i.test(line) ? "yes" : /^\s*(no|nope|nah|stay|i stay)\W*$/i.test(line) ? "no" : "other");

/** Said for a line that risks nothing, when no model can answer it. */
const FREE_PLAIN = "Nothing comes of that yet, and nothing is lost by it.";

/** Whether a line written at a rest means to rest, by its words: only when nothing can read it by meaning. */
const restWords = (line: string): "rest" | "on" => (/\b(rest|sleep|camp|recover|heal|eat|wait)\b/i.test(line) && !/\b(no|not|don'?t|without)\b[^.]{0,12}\brest/i.test(line) ? "rest" : "on");
/** Which trade a line means, by its words: only when nothing can read it by meaning. */
const tradeWords = (line: string, open: readonly TradeKind[]): TradeKind | "none" => {
  if (/\b(no|none|nothing|let it|leave it|keep)\b/i.test(line)) return "none";
  if (open.includes("health") && /\b(wound|health|hurt|blood|pain|bleed)\w*/i.test(line)) return "health";
  if (open.includes("supplies") && /\b(suppl|gear|coin|pack|food|carry)\w*/i.test(line)) return "supplies";
  return "none";
};

export function directScenes(adv: Adventure, sheet: Sheet, seed: string, bare: Table, minds: Minds, opts: SceneOptions = {}): Director {
  let trip: Trip = opts.resume ?? withCompany(startHand({ ...startTrip(adv, sheet, seed, opts.abilities ?? [], opts.level ?? 1), ...(opts.storeName ? { storeName: opts.storeName } : {}) }), opts.company ?? []);
  let stage: Stage = "start";
  const sheetsNow = (): void => bare.sheets?.(sheetPages(trip));
  const table: Table = Object.assign(Object.create(bare) as Table, {
    page: (w: { heading?: string; his: string[] }) => {
      sheetsNow();
      return bare.page(w);
    },
    carry: async (before: Sheet | null, after: Sheet, paid: boolean) => {
      await bare.carry(before, after, paid);
      sheetsNow();
    },
  });
  const content = () => trip.adv.content ?? DEFAULT_CONTENT;
  /** What the game allows (content.ts): only clear adults are ever in a scene with heat or dark themes. */
  const rules = (): string => {
    const bands = trip.adv.stops.map((s) => s.person?.age).filter((b) => b !== undefined);
    return contentRules(content(), bands.length ? bands : ["adult"]);
  };
  // Whoever goes with you is told to the narrator with every beat, as themselves (engine/lasting.ts).
  const knowNow = (): void => minds.know?.(trip.adv.who, companyNow(trip).map((c) => `${c.name}, ${c.who}`), rules());
  /** A model's words as they may be played: the veil when they were refused or crossed a line. */
  const fit = (text: string): string => (text ? playable(text, content()) : text);
  const tell = async (scene: Scene, note: string, wrote?: string): Promise<string> => (minds.sceneTell ? fit(await table.wait("tell", minds.sceneTell(scene, note, wrote).catch(() => ""))) : "");
  const dice = (): number[] => trip.hand?.dice ?? [];
  const keep = (): void => opts.save?.(trip.over ? null : trip);

  /**
   * The scenes not yet come to, written again by a model to fit what tries have won (engine/lasting.ts), while the player
   * plays on. Something more won while it is being written is written in after it. Waited for before the next scene.
   */
  let revising: Promise<void> | null = null;
  /** A line written in answer to a question that it did not answer (rest or press on, a trade): played next in a scene. */
  let held: Written | null = null;
  let again = false;
  const revise = (): void => {
    if (!minds.sceneRevise) return;
    if (revising) return void (again = true);
    const run = async (): Promise<void> => {
      do {
        again = false;
        const story = trip.adv.scenes;
        const from = scenesAhead(trip);
        if (!story || from >= story.scenes.length) return;
        const got = await minds.sceneRevise!(story, from, [...truthsSaid(trip), ...companySaid(trip)]).catch(() => []);
        if (got.length) {
          trip = reviseTrip(trip, got);
          keep();
        }
      } while (again);
    };
    revising = run().finally(() => (revising = null));
  };

  /** What a line is: a die named outright is read like a touch; else by a model; else by its words. */
  const readLine = async (line: string, pending: Priced | null): Promise<SceneLine> => {
    const named = pending ? dieNamed(line, dice()) : null;
    if (named !== null) return { kind: "die", die: named };
    const read = minds.sceneLine ? await minds.sceneLine(line, { trip, pending: pending ? { attempt: pending.attempt } : null }).catch(() => null) : null;
    return read ?? rulesSceneLine(line, trip, !!pending);
  };

  const begin = async (): Promise<void> => {
    table.clock(trip.sheet.hour);
    void table.carry(null, trip.sheet, false);
    void table.move("you", trip.adv.start);
    const end = trip.adv.stops.find((s) => s.climax);
    if (end) void table.move("shadow", end.id);
    table.weather?.(trip.adv.weather ?? "clear");
    table.notch?.([]);
    await table.deal(trip.adv.stops);
    for (const a of trip.abilities) await table.give(abilityCard(a));
    for (const c of lastingCards(trip)) await table.give(c);
    await table.hand?.(dice(), true);
    await table.say(handStartSaid(trip));
    await table.page(handFirstPage(trip));
  };

  /** Lay the table out again as a sitting left it. */
  const goOn = async (): Promise<void> => {
    const h = trip.hand!;
    const scene = sceneNow(trip);
    const stop = scene ? stopOf(trip.adv, scene.id) : undefined;
    table.clock(trip.sheet.hour);
    void table.carry(null, trip.sheet, false);
    void table.move("you", trip.at);
    table.weather?.(trip.adv.weather ?? "clear");
    table.notch?.([]);
    await table.deal(trip.adv.stops.filter((s) => !trip.visited.includes(s.id) || (h.opened && s.id === scene?.id)));
    if (h.opened && stop) {
      void table.move("shadow", stop.id);
      await table.turn(stop);
    }
    for (const a of trip.abilities) await table.give(abilityCard(a));
    for (const b of h.boons) await table.give(boonCard(b));
    for (const c of lastingCards(trip)) await table.give(c);
    await table.hand?.(dice(), false);
    await table.say(handBackSaid(trip));
    if (h.opened && scene) {
      // The dials are set out again before you are asked anything.
      const dials = table.board?.(handDials(trip));
      await table.page(scenePage(trip, scene));
      await dials;
      await table.say([HAND_ASK]);
    } else await table.page(handFirstPage(trip));
  };

  /** Between scenes, when a rest would do something: rest, or press on. */
  const restOrOn = async (): Promise<void> => {
    stage = "camp";
    await table.say([handRestAsk(trip)]);
    const w = await table.write();
    await w.given;
    const rests = await pickBy(minds, "Does the player rest before the next scene, or press on?", w.line, { rest: "rest, sleep, eat or tend wounds first", on: "press on without resting", other: "neither: they do or say something else, a new thing to play" }, () => restWords(w.line), (p) => table.wait("read", p));
    void table.aside();
    // Something else written instead presses on, and is played in the scene ahead.
    if (rests === "other") held = w;
    if (rests !== "rest") return void (await table.say(["You press on."]));
    const before = trip.sheet;
    const r = restHand(trip);
    if (!r) return;
    trip = r.trip;
    keep();
    table.clock(trip.sheet.hour);
    const carried = table.carry(before, trip.sheet, false);
    await table.hand?.(dice(), true);
    await table.say(handRestSaid(r));
    await carried;
  };

  /** Come to the scene in play: its card is turned, and the narrator opens it. */
  const arrive = async (): Promise<void> => {
    stage = "road";
    // The scene ahead is played as it now stands: written again to fit what was won, when that is done.
    if (revising) await table.wait("deal", revising);
    const before = trip.sheet;
    const e = enterDue(trip);
    if (!e) return;
    trip = e.trip;
    knowNow();
    table.clock(trip.sheet.hour);
    const stop = stopOf(trip.adv, e.scene.id);
    if (stop) {
      await table.move("you", stop.id);
      await table.turn(stop);
    }
    await table.say(sceneSaid(e));
    if (trip.over) return;
    // What came due as the scene opens is in the opening's note, and its numbers are said after it. Whoever went is
    // gone from what the narrator is told from now on.
    if (e.due.some((d) => d.goes)) knowNow();
    const due = e.due.length ? dueNote(e.due) : "";
    const opening = tell(e.scene, [openingNote(trip, e.scene), due].filter(Boolean).join(" "));
    void table.board?.(handDials(trip));
    await table.say([(await opening) || [e.scene.situation, e.due.length ? duePlain(e.due) : ""].filter(Boolean).join(" ")]);
    if (e.due.length) {
      for (const d of e.due) if (d.goes) await table.take(`with:${d.goes.id}`);
      await table.say(dueSaid(e.due, trip.hand?.grip ?? 0));
      await table.carry(before, trip.sheet, false);
    }
    await table.page(scenePage(trip, e.scene));
    await table.say([HAND_ASK]);
  };

  /** The scene in play, line by line, until you are through it, it has closed on you, or the story is over. */
  const atScene = async (): Promise<void> => {
    let next: { w: Written; read: SceneLine } | null = null;
    while (!trip.over && trip.hand?.opened) {
      const scene = sceneNow(trip);
      if (!scene) return;
      if (outOfTime(trip)) {
        trip = { ...trip, over: "deadline" };
        return;
      }
      if (!next) keep();
      if (!next && held) {
        const h = held;
        held = null;
        next = { w: h, read: await table.wait("read", readLine(h.line, null)) };
      }
      stage = "write";
      let w: Written;
      let read: SceneLine;
      if (next) ({ w, read } = next);
      else {
        w = await table.write();
        stage = "given";
        const reading = readLine(w.line, null);
        await w.given;
        read = await table.wait("read", reading);
      }
      next = null;
      if (read.kind === "stop") {
        void table.aside();
        opts.save?.(trip);
        await table.say(LEFT_SAID);
        throw new LeftOff();
      }
      if (read.kind === "leave") {
        // Walking away is the player's to do, at a price said first (engine/lasting.ts, walkAway).
        stage = "write";
        void table.aside();
        await table.say([walkAsk(trip)]);
        const ww = await table.write();
        await ww.given;
        const meant = await pickBy(minds, "Does the player mean to walk away from the scene?", ww.line, WALK_OPTIONS, () => walkWords(ww.line), (x) => table.wait("read", x));
        if (meant !== "yes") {
          void table.aside();
          // Something else written instead is read as a line of its own; a plain no is asked what they do.
          if (meant === "other") next = { w: ww, read: await table.wait("read", readLine(ww.line, null)) };
          else await table.say([HAND_ASK]);
          continue;
        }
        const walked = walkAway(trip);
        if (!walked) continue;
        trip = walked.trip;
        keep();
        const told = await tell(scene, walkNote(walked), w.line);
        await table.say([...(told ? [told] : []), ...walkedSaid(walked)]);
        await table.board?.(null);
        const stop = stopOf(trip.adv, scene.id);
        if (stop) await table.clear(stop);
        return;
      }
      if (read.kind === "free" || read.kind === "die") {
        // A line that risks nothing (or a die named with no try waiting for one): answered in the scene, no die, no time.
        void table.aside();
        const told = await tell(scene, freeNote(trip, scene), w.line);
        await table.say([told || FREE_PLAIN]);
        continue;
      }
      const p = priceTry(trip, read);
      if (!p) {
        void table.aside();
        await table.say([UNCLEAR_SAID]);
        continue;
      }
      // The stake is said before a die is chosen, with what each die would come to.
      stage = "check";
      await table.say(stakeSaid(trip, p));
      const got = table.pickDie ? await table.pickDie(dice()) : await table.write();
      let die: number;
      if (typeof got === "number") die = got;
      else {
        const then = readLine(got.line, p);
        await got.given;
        const r = await table.wait("read", then);
        if (r.kind !== "die") {
          // Something else written instead: the try is left alone, and this line is read in its place. Its page is
          // the one now in the narrator's hand (the desk has put the page before it on the heap).
          next = { w: got, read: r };
          continue;
        }
        // The page that named the die is the one the answer is written under.
        die = dice().indexOf(r.die);
      }
      if (die < 0 || die >= dice().length) continue;
      // A die that falls short can be lifted a step, by giving something up at code's price.
      const open = trades(trip, p, die);
      let trade: TradeKind | null = null;
      // A line written at the trade that does something else is not lost: the die lies as it is, and the line is played after.
      let playLater: Written | null = null;
      if (open.length) {
        stage = "write";
        await table.say([tradeAsk(p, dice()[die]!, open)]);
        const tw = await table.write();
        await tw.given;
        const chosen = await pickBy(minds, "Does the player give something up to lift the die, and what?", tw.line, { ...tradeOptions(open), other: TRADE_OTHER }, () => tradeWords(tw.line, open), (x) => table.wait("read", x));
        void table.aside();
        trade = chosen && chosen !== "none" && chosen !== "other" ? chosen : null;
        if (chosen === "other") playLater = tw;
      }
      stage = "throw";
      const before = trip.sheet;
      const s = spendTry(trip, p, die, trade);
      if (!s) continue;
      trip = s.trip;
      // Kept at once: leaving the table now cannot take back a die spent.
      keep();
      stage = "told";
      table.clock(trip.sheet.hour);
      const telling = tell(scene, [spentNote(s, scene), askNote(s)].filter(Boolean).join(" "), w.line);
      const lifted = table.hand?.(s.fresh ? [] : dice(), false);
      const carried = table.carry(before, trip.sheet, false);
      const dials = table.board?.(handDials(trip));
      const voiced = await telling;
      const told = voiced || spentPlain(s);
      const after = [...askSaid(s), ...spentSaid(s)];
      await table.say([told, ...after]);
      await lifted;
      await carried;
      await dials;
      if (s.fresh) await table.hand?.(dice(), true);
      if (p.using?.id.startsWith("boon:")) await table.take(p.using.id);
      // Something won that stays true is a card on the table, and the scenes ahead are written again to fit it.
      const won = s.own?.won ?? null;
      if (won) await table.give(s.own?.joined ? comradeCard(s.own.joined, won) : changeCard(won));
      if (s.own?.soured) await table.give(changeCard(s.own.soured));
      if (won || s.own?.soured) {
        knowNow();
        revise();
      }
      await table.page({ heading: p.attempt || scene.name, his: [told, ...after] });
      if (s.scene === "on") {
        if (playLater) next = { w: playLater, read: await table.wait("read", readLine(playLater.line, null)) };
        else if (!trip.over) await table.say([HAND_ASK]);
        continue;
      }
      // The scene is over: got through, or closed on you. A line written at the trade is played in the next.
      held = playLater;
      const sheetBefore = trip.sheet;
      const l = leaveScene(trip, s.scene);
      if (!l) return;
      trip = l.trip;
      keep();
      table.clock(trip.sheet.hour);
      await table.board?.(null);
      const stop = stopOf(trip.adv, scene.id);
      if (stop) await table.clear(stop);
      if (l.last) return;
      await table.say(leftSaid(l, !!voiced));
      if (l.boon) await table.give(boonCard(l.boon));
      if (l.losses.length) await table.carry(sheetBefore, trip.sheet, false);
    }
  };

  const play = async (): Promise<Trip> => {
    knowNow();
    if (opts.resume) await goOn();
    else await begin();
    while (!trip.over) {
      keep();
      if (!trip.hand?.opened) {
        if ((trip.hand?.scene ?? 0) > 0 && worthRest(trip)) await restOrOn();
        if (trip.over) break;
        await arrive();
        if (trip.over) break;
      }
      await atScene();
    }
    opts.save?.(null);
    stage = "over";
    void table.board?.(null);
    await table.say(handEndSaid(trip));
    await table.page(handEndPage(trip));
    await table.hand?.([], false);
    return trip;
  };

  let left = false;
  const done = play().catch((e: unknown) => {
    if (!(e instanceof LeftOff)) throw e;
    left = true;
    return trip;
  });
  return {
    get trip() {
      return trip;
    },
    get stage() {
      return stage;
    },
    get left() {
      return left;
    },
    done,
  };
}
