import { describe, expect, test } from "bun:test";
import { STOCK_SCENES, STOCK_SCENES_RAW } from "../src/content/scenes.js";
import { startTrip, type Trip } from "../src/engine/adventure.js";
import { contentRules, DEFAULT_CONTENT } from "../src/engine/content.js";

import { bandOf, checkSceneLine, checkSceneStory, comesTo, enterScene, GRIP_MAX, HAND_SIZE, handDials, leaveScene, price, restHand, rollHand, sceneAdventure, SCENES, sceneNow, spend, startHand, STEP, STORY_HOURS, thingsNow, THROUGH_MAX, trades, worthRest, type SceneTry } from "../src/engine/hand.js";
import { START } from "../src/engine/hero.js";
import { TARGETS, TRY_HOURS, type Sheet } from "../src/engine/moment.js";
import { HAND_ASK, stakeSaid } from "../src/engine/tell-hand.js";
import type { CardInfo } from "../src/game/card.js";
import { LEFT_SAID, type Director, type Table } from "../src/game/director.js";
import type { Minds } from "../src/game/minds.js";
import type { Ask } from "../src/game/prompts.js";
import { directScenes } from "../src/game/scenes.js";
import { rulesHero } from "../src/engine/hero.js";
import { standIns } from "../src/game/minds.js";
import { sit, type Kept } from "../src/game/session.js";
import { dieNamed, parseSceneLine, rulesSceneLine, sceneLineMessages, sceneStoryMessages, writeScenes } from "../src/game/scenewriter.js";

const SHEET: Sheet = { stats: { brawn: 1, grace: 2, charm: 3, guile: 2, wits: 1, sense: 1 }, ...START, hour: 19 };
const begun = (seed = "hand"): Trip => startHand(startTrip(sceneAdventure(STOCK_SCENES, { seed, who: "a courier", startHour: 19 }), SHEET, seed));
const opened = (seed = "hand"): Trip => enterScene(begun(seed))!.trip;
const TRY: SceneTry = { attempt: "talk the ferryman round", stat: "charm", risk: "real", stake: "goodwill", threat: "he puts you off his boat", aim: "through", thing: null };
/** A trip with these dice on the table. */
const withDice = (t: Trip, dice: number[]): Trip => ({ ...t, hand: { ...t.hand!, dice } });

describe("a story of scenes, checked whole", () => {
  test("the stock story checks, with ids of code's own", () => {
    expect(STOCK_SCENES.scenes.length).toBe(SCENES);
    expect(STOCK_SCENES.scenes.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(STOCK_SCENES.scenes[0]!.things[0]!.id).toBe("s1-t1");
    // The last scene is the hardest, and code says how hard: the story does not.
    expect(STOCK_SCENES.scenes.at(-1)!.difficulty).toBeGreaterThan(STOCK_SCENES.scenes[0]!.difficulty);
  });

  const raw = () => JSON.parse(JSON.stringify(STOCK_SCENES_RAW)) as typeof STOCK_SCENES_RAW;
  const refused = (story: unknown): string => {
    let why = "";
    expect(checkSceneStory(story, (r) => (why = r))).toBeNull();
    return why;
  };

  test("a story with a note left in it, a scene short, a part missing or too few things is refused whole, and says why", () => {
    const noted = raw();
    (noted.scenes[1] as { through: string }).through = "<what the player has to get done here>";
    expect(refused(noted)).toBe(`scene 2: "through" still has a note's brackets in it`);
    const short = raw();
    (short as { scenes: unknown[] }).scenes = short.scenes.slice(0, 2);
    expect(refused(short)).toBe("it has 2 scenes, not 3");
    const gone = raw();
    delete (gone.scenes[2] as { taken?: string }).taken;
    expect(refused(gone)).toBe(`scene 3: "taken" is missing`);
    const bare = raw();
    (bare.scenes[0] as { things: string[] }).things = ["only the one"];
    expect(refused(bare)).toBe("scene 1: it has 1 things to use, not two or three");
    expect(refused(null)).toBe("the answer is not a story");
    expect(refused("a story")).toBe("the answer is not a story");
  });

  test("a phrase longer than the note asked for is the model's phrase, and the story is kept", () => {
    // What the first real builder wrote: things of ten words where the note said a few, and a boon of twelve.
    const long = raw();
    const s = long.scenes[2] as { things: string[]; boon: string; taken: string };
    s.things = ["the ledger of favours Maren keeps buttoned inside her coat, with tonight's page torn out", "the ferryman's habit of counting heads twice before he casts off", "a lamp still warm to the touch"];
    s.boon = "the ferryman's word that he will hold the last boat for you once";
    s.taken = `${s.taken} They take what you carry and put you off the quay, and by the time you are back the lamps along the whole east side are dark and nobody will say who was there.`;
    const story = checkSceneStory(long)!;
    expect(story).not.toBeNull();
    expect(story.scenes[2]!.things.map((t) => t.name)).toEqual(s.things);
    expect(story.scenes[2]!.boon).toBe(s.boon);
    expect(story.scenes[2]!.taken).toBe(s.taken);
    // A runaway answer is still refused: a "thing" that is a page of text is not a thing.
    const runaway = raw();
    (runaway.scenes[0] as { things: string[] }).things[0] = "a thing ".repeat(40);
    expect(refused(runaway)).toBe("scene 1: thing 1 is 319 characters");
  });

  test("a title that must fit a card is cut back to whole words; a fourth thing is left out; a picture not on the list is replaced", () => {
    const wide = raw();
    const s = wide.scenes[0] as { face: string; things: string[]; card: string; person?: unknown };
    s.face = "The Ferryman Who Counts Every Head Twice Over";
    s.things = [...s.things.slice(0, 3), "a fourth thing nobody asked for"];
    s.card = "The Guardian";
    const story = checkSceneStory(wide)!;
    expect(story.scenes[0]!.face).toBe("The Ferryman Who Counts Every Head");
    expect(story.scenes[0]!.things.length).toBe(3);
    // Named by its title: the same picture. Not on the list at all: the plainest picture of the scene's kind.
    expect(story.scenes[0]!.card).toBe("guardian");
    const odd = raw();
    (odd.scenes[0] as { card: string }).card = "no-such-card";
    const got = checkSceneStory(odd)!;
    expect(got).not.toBeNull();
    expect(got.scenes[0]!.card).toBe(got.scenes[0]!.person ? "keeper" : "gate");
  });

  test("the adventure made of it is a line of scenes against a clock", () => {
    const adv = sceneAdventure(STOCK_SCENES, { seed: "x", who: "a courier", startHour: 19 });
    expect(adv.stops.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(adv.stops.at(-1)!.climax).toBe(true);
    expect(adv.deadline.hour).toBe(19 + STORY_HOURS);
    expect(adv.scenes).toBe(STOCK_SCENES);
  });
});

describe("the hand", () => {
  test("is thrown by the seed: the same story has the same dice", () => {
    expect(rollHand("a", 0)).toEqual(rollHand("a", 0));
    expect(rollHand("a", 0).length).toBe(HAND_SIZE);
    expect(rollHand("a", 0)).not.toEqual(rollHand("a", 1));
    expect(begun("a").hand!.dice).toEqual(rollHand("a", 0));
  });

  test("a try is priced by the scene and the stat, a step easier with a thing", () => {
    const t = opened();
    const scene = sceneNow(t)!;
    const plain = price(t, TRY)!;
    expect(plain.add).toBe(3);
    expect(plain.target).toBe(TARGETS[scene.difficulty]!);
    const thing = thingsNow(t)[0]!;
    const eased = price(t, { ...TRY, thing: thing.id })!;
    expect(eased.target).toBe(plain.target - STEP);
    expect(eased.using).toEqual(thing);
    expect(plain.bands.length).toBe(t.hand!.dice.length);
    // Nothing has closed on you yet, so there is nothing to get loose of: it is a try to get through.
    expect(price(t, { ...TRY, aim: "loose" })!.aim).toBe("through");
    expect(price({ ...t, hand: { ...t.hand!, grip: 2 } }, { ...TRY, aim: "loose" })!.aim).toBe("loose");
    // A thing that is not here eases nothing.
    expect(price(t, { ...TRY, thing: "not-here" })).toMatchObject({ using: null, thing: null, target: plain.target });
  });

  test("what a die comes to depends on what it is spent on", () => {
    const t = withDice(opened(), [10, 10, 10]);
    const strong = price(t, TRY)!; // charm 3
    const weak = price(t, { ...TRY, stat: "brawn" })!; // brawn 1
    expect(strong.bands[0]).not.toBe(weak.bands[0]);
    expect(bandOf(1, 10, 9)).toBe("botch");
    expect(bandOf(20, 0, 18)).toBe("crit");
    // More risked, more gained and more lost.
    expect(comesTo("grave", "clean").gain).toBeGreaterThan(comesTo("slight", "clean").gain);
    expect(comesTo("grave", "fail").cost).toBeGreaterThan(comesTo("slight", "fail").cost);
  });

  test("a die spent is gone, takes its time, and a new hand is thrown when the last goes", () => {
    let t = withDice(opened(), [15, 4]);
    const before = t.sheet.hour;
    const s = spend(t, price(t, TRY)!, 0)!;
    expect(s.natural).toBe(15);
    expect(s.trip.hand!.dice).toEqual([4]);
    expect(s.trip.sheet.hour).toBe(before + TRY_HOURS);
    expect(s.trip.hand!.through).toBe(s.gain);
    expect(s.fresh).toBeNull();
    t = s.trip;
    const last = spend(t, price(t, TRY)!, 0)!;
    expect(last.fresh!.length).toBe(HAND_SIZE);
    expect(last.trip.hand!.dice).toEqual(last.fresh!);
    expect(spend(t, price(t, TRY)!, 5)).toBeNull();
  });

  test("a thing is used once a scene", () => {
    const t = withDice(opened(), [15, 15, 15]);
    const thing = thingsNow(t)[0]!;
    const s = spend(t, price(t, { ...TRY, thing: thing.id })!, 0)!;
    expect(thingsNow(s.trip).some((x) => x.id === thing.id)).toBe(false);
    expect(price(s.trip, { ...TRY, thing: thing.id })!.using).toBeNull();
  });

  test("a trade is offered only when it changes what the die comes to, and never for a 1 or a 20", () => {
    const t = withDice(opened(), [1, 20, 8, 19]);
    const p = price(t, TRY)!; // needs 12 with +3: an 8 falls one short
    expect(trades(t, p, 0)).toEqual([]);
    expect(trades(t, p, 1)).toEqual([]);
    expect(trades(t, p, 2)).toEqual(["health", "supplies"]);
    expect(trades(t, p, 3)).toEqual([]);
    const plain = spend(t, p, 2)!;
    const lifted = spend(t, p, 2, "health")!;
    expect(lifted.band).not.toBe(plain.band);
    expect(lifted.traded).toBe("health");
    expect(lifted.trip.sheet.health).toBe(t.sheet.health - 1);
    // A trade nothing allows is not made.
    expect(spend(t, p, 0, "health")!.traded).toBeNull();
    // Down to your last health, a wound is not on offer.
    expect(trades({ ...t, sheet: { ...t.sheet, health: 1 } }, p, 2)).toEqual(["supplies"]);
  });

  test("a scene got through leaves you something for later, used once and then gone", () => {
    let t = withDice(opened(), [20, 20, 20]);
    while (t.hand!.through < THROUGH_MAX) t = spend(withDice(t, [20, 20, 20]), price(t, { ...TRY, risk: "grave" })!, 0)!.trip;
    const l = leaveScene(t, "won")!;
    expect(l.boon!.id).toBe("boon:s1");
    expect(l.trip.passed).toBe(1);
    expect(l.trip.hand!.scene).toBe(1);
    expect(l.trip.hand!.opened).toBe(false);
    const next = withDice(enterScene(l.trip)!.trip, [15, 15, 15]);
    expect(thingsNow(next).some((x) => x.id === "boon:s1")).toBe(true);
    const used = spend(next, price(next, { ...TRY, thing: "boon:s1" })!, 0)!;
    expect(used.trip.hand!.boons).toEqual([]);
  });

  test("a scene that closes on you takes something that stays taken, and half of it follows you", () => {
    let t = withDice(opened(), [2, 2, 2]);
    while (t.hand!.grip < GRIP_MAX) t = spend(withDice(t, [2, 2, 2]), price(t, { ...TRY, stat: "brawn" })!, 0)!.trip;
    const health = t.sheet.health;
    const l = leaveScene(t, "taken")!;
    expect(l.trip.over).toBeFalsy();
    expect(l.trip.hand!.lost).toEqual([STOCK_SCENES.scenes[0]!.taken]);
    expect(l.trip.sheet.health).toBe(Math.max(1, health - 1));
    expect(l.follows).toBe(Math.floor(GRIP_MAX / 2));
    expect(l.trip.hand!.grip).toBe(l.follows);
    expect(l.trip.passed).toBe(0);
    expect(l.boon).toBeNull();
    // What was taken is still taken two scenes on.
    const on = enterScene(l.trip)!.trip;
    expect(on.hand!.lost.length).toBe(1);
  });

  test("the last scene settles the story either way", () => {
    const at = (how: "won" | "taken") => {
      const t = opened();
      return leaveScene({ ...t, hand: { ...t.hand!, scene: SCENES - 1 } }, how)!;
    };
    expect(at("won").trip.over).toBe("won");
    expect(at("taken").trip.over).toBe("taken");
    expect(at("won").last).toBe(true);
  });

  test("a rest is only between scenes: it heals, eats, takes its hours and throws new dice", () => {
    expect(restHand(opened())).toBeNull();
    const t: Trip = { ...begun(), sheet: { ...SHEET, health: 2 } };
    expect(worthRest(t)).toBe(true);
    const r = restHand(t)!;
    expect(r.trip.sheet.health).toBeGreaterThan(2);
    expect(r.trip.sheet.supplies).toBe(t.sheet.supplies - 1);
    expect(r.trip.sheet.hour).toBeGreaterThan(t.sheet.hour);
    expect(r.dice).not.toEqual(t.hand!.dice);
  });

  test("the two dials are the room's own", () => {
    const t = opened();
    const c = handDials({ ...t, hand: { ...t.hand!, through: 2, grip: 1 } })!;
    expect(c.foes[0]!.notches).toBe(THROUGH_MAX);
    expect(c.foes[0]!.filled).toBe(2);
    expect(c.you.notches).toBe(GRIP_MAX);
    expect(c.you.filled).toBe(1);
  });

  test("the stake is said before a die is chosen, with what each die would come to", () => {
    const t = withDice(opened(), [3, 12, 18]);
    const said = stakeSaid(t, price(t, TRY)!).join(" ");
    expect(said).toContain("the 3 ");
    expect(said).toContain("the 12 ");
    expect(said).toContain("the 18 ");
    expect(said).toContain("he puts you off his boat");
    expect(said).toContain("Which die do you spend on it?");
  });
});

describe("a line read", () => {
  test("a reader's answer is checked against the table", () => {
    const t = opened();
    const c = { trip: t };
    const ok = parseSceneLine(JSON.stringify({ kind: "try", attempt: "talk him round", stat: "charm", risk: "real", stake: "goodwill", threat: "he puts you ashore", aim: "through", thing: "s1-t1" }), c);
    expect(ok?.kind).toBe("try");
    expect(parseSceneLine('{"kind":"try","stat":"charm","risk":"huge","stake":"goodwill","threat":"he puts you ashore"}', c)).toBeNull();
    expect(parseSceneLine('{"kind":"try","stat":"luck","risk":"real","stake":"goodwill","threat":"he puts you ashore"}', c)).toBeNull();
    expect(parseSceneLine('{"kind":"try","stat":"charm","risk":"real","stake":"goodwill","threat":"he puts you ashore","thing":"a-sword-i-made-up"}', c)).toBeNull();
    // A risky try has to say what happens if it goes wrong.
    expect(parseSceneLine('{"kind":"try","stat":"charm","risk":"real","stake":"goodwill"}', c)).toBeNull();
    expect(parseSceneLine('{"kind":"free"}', c)).toEqual({ kind: "free" });
    // A die is named only for a try that waits, and only one on the table.
    const die = t.hand!.dice[0]!;
    expect(parseSceneLine(`{"kind":"die","die":${die}}`, c)).toBeNull();
    expect(parseSceneLine(`{"kind":"die","die":${die}}`, { trip: t, pending: { attempt: "x" } })).toEqual({ kind: "die", die });
    expect(checkSceneLine({ kind: "die", die: 21 }, t, true)).toBeNull();
  });

  test("a bare number names a die without asking anything", () => {
    expect(dieNamed("14", [3, 14, 9])).toBe(14);
    expect(dieNamed("the 14.", [3, 14, 9])).toBe(14);
    expect(dieNamed("I spend the 9", [3, 14, 9])).toBe(9);
    expect(dieNamed("15", [3, 14, 9])).toBeNull();
    expect(dieNamed("I give him 14 coins and run", [3, 14, 9])).toBeNull();
  });

  test("with no model, words read it: a question risks nothing, a deed is a try, stopping stops", () => {
    const t = opened();
    expect(rulesSceneLine("What does the ferryman look like?", t, false).kind).toBe("free");
    expect(rulesSceneLine("I shove him off the gangplank", t, false)).toMatchObject({ kind: "try", stat: "brawn" });
    expect(rulesSceneLine("done for tonight", t, false).kind).toBe("stop");
  });

  test("the reader is shown the scene, the things by id and, for a waiting try, the dice", () => {
    const t = opened();
    const [system, user] = sceneLineMessages("the high one", { trip: t, pending: { attempt: "talk him round" } });
    expect(system!.content).toContain('"kind": "die"');
    expect(user!.content).toContain("s1-t1");
    expect(user!.content).toContain(`The dice on the table: ${t.hand!.dice.join(", ")}.`);
    expect(sceneLineMessages("I look", { trip: t })[0]!.content).not.toContain('"kind": "die"');
  });
});

const CARD: CardInfo = { name: "Maren", description: "A ferrywoman on a river of lamps.", personality: "dry, watchful", scenario: "The night ferry is late." } as CardInfo;

describe("the builder's story", () => {
  test("is the model's to invent: the player's words go in, no stock scene does, and the game's rules come last", () => {
    const [system, user] = sceneStoryMessages(CARD, { asked: "I want to open a noodle stand at the foot of the tower", who: "Tam, a cook who cannot say no" }, DEFAULT_CONTENT);
    expect(user!.content).toContain("noodle stand");
    expect(user!.content).toContain("cannot say no");
    expect(user!.content).not.toContain(STOCK_SCENES.scenes[0]!.name);
    expect(user!.content).not.toContain("trope");
    expect(system!.content.endsWith(contentRules(DEFAULT_CONTENT, ["adult"]))).toBe(true);
  });

  test("an answer that does not check is asked for once more, then given up whole", async () => {
    let asked = 0;
    const good = JSON.stringify(STOCK_SCENES_RAW);
    const second: Ask = async () => (++asked === 1 ? '{"title": "half a story"}' : good);
    const story = await writeScenes(second, CARD, {}, DEFAULT_CONTENT);
    expect(asked).toBe(2);
    expect(story!.title).toBe(STOCK_SCENES.title);
    asked = 0;
    const never: Ask = async () => (asked++, "I would rather not.");
    expect(await writeScenes(never, CARD, {}, DEFAULT_CONTENT)).toBeNull();
    expect(asked).toBe(2);
    expect(await writeScenes(null, CARD, {}, DEFAULT_CONTENT)).toBeNull();
  });
});

/** A table that writes from a queue of lines, and when the queue is dry tries something and spends the best die. */
function tableFor(lines: string[], log: string[], d: { now: Director | null }, touch = false): Table {
  let n = 0;
  return {
    say: async (l) => void log.push(...l),
    write: async () => {
      let line = lines.shift();
      if (line === undefined && (!d.now || d.now.stage === "over")) line = "done for tonight";
      if (line === undefined) {
        const t = d.now!.trip;
        const st = d.now!.stage;
        if (st === "camp") line = "I press on";
        else if (log.at(-1)?.includes("Give something up")) line = "I let it lie";
        else if (st === "check") line = String(Math.max(...t.hand!.dice));
        else line = ["I talk him round, kindly", "I slip past while they argue", "I push through the press of them"][n++ % 3]!;
      }
      log.push(`> ${line}`);
      return { line, given: Promise.resolve() };
    },
    ...(touch ? { pickDie: async (dice: readonly number[]) => dice.indexOf(Math.max(...dice)) } : {}),
    hand: async (dice, thrown) => void log.push(`[hand${thrown ? " thrown" : ""}] ${dice.join(" ")}`),
    board: async (c) => void log.push(c ? `[dials] ${c.foes[0]!.filled}/${c.foes[0]!.notches} ${c.you.filled}/${c.you.notches}` : "[dials off]"),
    page: async (p) => void log.push(`[page] ${p.heading ?? ""}: ${p.his.join(" ")}`),
    aside: async () => {},
    wait: async (_b, w) => w,
    weigh: async () => {},
    dieOrLine: async () => null,
    throwDie: async (x) => void log.push(`[die] ${x}`),
    carry: async () => {},
    clock: () => {},
    deal: async (stops) => void log.push(`[deal] ${stops.length}`),
    turn: async (s) => void log.push(`[turn] ${s.id}`),
    clear: async (s) => void log.push(`[clear] ${s.id}`),
    fork: async (s) => s[0]!.id,
    offer: async () => 0,
    give: async (c) => void log.push(`[give] ${c.id}`),
    take: async (id) => void log.push(`[take] ${id}`),
    rival: async () => {},
    sweep: async () => {},
    move: async () => {},
  };
}

const NO_MINDS = {} as Minds;
const adventure = (seed: string) => sceneAdventure(STOCK_SCENES, { seed, who: "a courier", startHour: 19 });

describe("a story of scenes at the table", () => {
  test("plays to an end with no model at all, every die spent said before it is spent", async () => {
    for (const seed of ["t1", "t2", "t3", "t4"]) {
      const log: string[] = [];
      const d = { now: null as Director | null };
      const saves: (Trip | null)[] = [];
      d.now = directScenes(adventure(seed), SHEET, seed, tableFor([], log, d), NO_MINDS, { save: (t) => void saves.push(t) });
      const end = await d.now.done;
      expect(end.over).toBeTruthy();
      expect(d.now.stage).toBe("over");
      expect(saves.at(-1)).toBeNull();
      expect(saves.some((s) => s?.hand?.opened)).toBe(true);
      expect(log.filter((l) => l.startsWith("[turn]"))[0]).toBe("[turn] s1");
      expect(log.some((l) => l.startsWith("[dials] "))).toBe(true);
      // Each try: the stake and what each die would do, then a die named, then what it came to.
      const stakes = log.filter((l) => l.startsWith("Which die do you spend on it?")).length;
      const spent = log.filter((l) => l.startsWith("You spent the ")).length;
      expect(spent).toBeGreaterThan(3);
      expect(stakes).toBe(spent);
      expect(log.at(-1)).toMatch(/^\[hand\] $/);
      expect(log.some((l) => l.startsWith("[page] Won") || l.startsWith("[page] Lost"))).toBe(true);
    }
  });

  test("a die touched is spent like one named", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    d.now = directScenes(adventure("touch"), SHEET, "touch", tableFor([], log, d, true), NO_MINDS);
    const end = await d.now.done;
    expect(end.over).toBeTruthy();
    expect(log.some((l) => /^> \d+$/.test(l))).toBe(false);
    expect(log.some((l) => l.startsWith("You spent the "))).toBe(true);
  });

  test("a line that risks nothing spends no die and no time; something else written leaves a waiting try alone", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    const told: string[] = [];
    const minds = { sceneTell: async (_at: unknown, note: string, wrote?: string) => (told.push(`${wrote ?? ""} || ${note}`), wrote ? `(told) ${wrote}` : "(the scene opens)") } as Minds;
    const lines = ["What is the ferryman doing?", "I talk him round, kindly", "What does the water look like?", "done for tonight"];
    let saved: Trip | null = null;
    d.now = directScenes(adventure("free"), SHEET, "free", tableFor(lines, log, d), minds, { save: (t) => void (saved = t) });
    const end = await d.now.done;
    expect(d.now.left).toBe(true);
    expect(end.over).toBeFalsy();
    expect(log).toContain("(the scene opens)");
    expect(log).toContain("(told) What is the ferryman doing?");
    // The try was priced and its stake said, and then left alone: no die went.
    expect(log.some((l) => l.startsWith("Which die do you spend on it?"))).toBe(true);
    expect(log.some((l) => l.startsWith("You spent the "))).toBe(false);
    expect(end.hand!.dice.length).toBe(HAND_SIZE);
    expect(end.sheet.hour).toBe(19);
    expect(log).toContain(LEFT_SAID[0]!);
    expect(saved!.hand!.opened).toBe(true);
  });

  test("a story left is taken up where it stopped, with the dice as they lay", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    let saved: Trip | null = null;
    d.now = directScenes(adventure("back"), SHEET, "back", tableFor(["I talk him round, kindly", "20", "done for tonight"], log, d), NO_MINDS, { save: (t) => void (saved = t) });
    await d.now.done;
    const kept = saved!;
    // "20" is not on the table, so it is read as a line of its own; the try before it spent nothing.
    expect(kept.hand!.opened).toBe(true);
    const log2: string[] = [];
    const d2 = { now: null as Director | null };
    d2.now = directScenes(kept.adv, kept.sheet, "back", tableFor([], log2, d2), NO_MINDS, { resume: kept });
    const end = await d2.now.done;
    expect(log2.some((l) => l.startsWith("You came back."))).toBe(true);
    expect(log2).toContain(`[hand] ${kept.hand!.dice.join(" ")}`);
    expect(log2).toContain(HAND_ASK);
    expect(end.over).toBeTruthy();
  });

  test("the narrator is told what must be true, and what it tells is what is said", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    const notes: string[] = [];
    const minds = { sceneTell: async (_at: unknown, note: string) => (notes.push(note), "The narrator tells it.") } as Minds;
    d.now = directScenes(adventure("told"), SHEET, "told", tableFor([], log, d), minds);
    await d.now.done;
    expect(log).toContain("The narrator tells it.");
    expect(notes.some((n) => n.includes("The player tried this:"))).toBe(true);
    // A scene that is not over is not settled by the narrator.
    expect(notes.some((n) => n.includes("The scene is not over"))).toBe(true);
  });

  test("a trade is put at code's price, and taken when the player says so", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    const table = tableFor([], log, d);
    const write = table.write;
    table.write = async () => {
      if (log.at(-1)?.includes("Give something up")) {
        log.push("> I take the wound");
        return { line: "I take the wound", given: Promise.resolve() };
      }
      return write();
    };
    // Spend the worst die each time, so some fall just short.
    table.pickDie = async (dice) => dice.indexOf(Math.min(...dice));
    let traded = false;
    for (const seed of ["tr1", "tr2", "tr3", "tr4", "tr5", "tr6"]) {
      d.now = directScenes(adventure(seed), SHEET, seed, table, NO_MINDS);
      await d.now.done;
      if (log.some((l) => l.includes("gave up a wound"))) traded = true;
    }
    expect(log.some((l) => l.includes("Give something up"))).toBe(true);
    expect(traded).toBe(true);
  });
});

describe("a sitting", () => {
  const minds = { ...standIns(0), hero: async (line: string) => rulesHero(line) };
  const lines = () => ["I want to get a sealed letter to the magistrate before dawn, whatever it costs me", "I am a quick-fingered courier named Tam"];

  test("with a model, the story is the model's own scenes, built from what the player asked and who they are", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    const seen: string[] = [];
    const ask: Ask = async (messages, role) => {
      const all = messages.map((m) => m.content).join("\n");
      if (role === "builder" && all.includes("THE STORY TO WRITE")) {
        seen.push(all);
        return JSON.stringify(STOCK_SCENES_RAW);
      }
      throw new Error("no model for that");
    };
    let kept: Kept | null = null;
    let built = "";
    const end = await sit({ card: CARD, seed: "sit-scenes", table: tableFor(lines(), log, d), minds, ask, started: (x) => (d.now = x), keep: (k) => (kept = k), built: (adv) => (built = adv.title) });
    expect(seen.length).toBe(1);
    expect(seen[0]).toContain("sealed letter to the magistrate");
    expect(seen[0]).toContain("courier named Tam");
    expect(built).toBe(STOCK_SCENES.title);
    expect(end!.adv.scenes).toBeTruthy();
    expect(end!.over).toBeTruthy();
    // No recipe was drawn and no road dealt: the three cards are the story's scenes.
    expect(log).toContain("[deal] 3");
    expect(log.some((l) => l.startsWith("You spent the "))).toBe(true);
    expect(log.some((l) => l.startsWith("No story of my own"))).toBe(false);
    expect(kept!.played).toEqual([`scenes: ${STOCK_SCENES.title}`]);
  });

  test("a model that writes no story that checks: a road story is played instead, and who you are is not asked twice", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    let asked = 0;
    const ask: Ask = async (messages) => {
      if (messages.some((m) => m.content.includes("THE STORY TO WRITE"))) asked++;
      throw new Error("no model");
    };
    // The road story is played by the road's own table: it needs none of the hand's lines, so the sitting is left there.
    const queue = [...lines(), "done for tonight"];
    await sit({ card: CARD, seed: "sit-road", table: tableFor(queue, log, d), minds, ask, started: (x) => (d.now = x) });
    expect(asked).toBe(2);
    expect(log.some((l) => l.startsWith("No story of my own"))).toBe(true);
    expect(log.filter((l) => l === "> I am a quick-fingered courier named Tam").length).toBe(1);
    expect(log.some((l) => l.startsWith("[deal] "))).toBe(true);
    expect(log.some((l) => l.startsWith("You spent the "))).toBe(false);
  });

  test("with no model at all, nothing changes: a road story as before", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    await sit({ card: CARD, seed: "sit-none", table: tableFor([...lines(), "done for tonight"], log, d), minds, ask: null, started: (x) => (d.now = x) });
    expect(log.some((l) => l.startsWith("No story of my own"))).toBe(false);
    expect(log.some((l) => l.startsWith("[deal] "))).toBe(true);
  });

  test("a story of scenes left for tonight is taken up again at the next sitting", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    const ask: Ask = async (messages, role) => {
      if (role === "builder" && messages.some((m) => m.content.includes("THE STORY TO WRITE"))) return JSON.stringify(STOCK_SCENES_RAW);
      throw new Error("no model for that");
    };
    let saved: Trip | null = null;
    let kept: Kept | null = null;
    await sit({ card: CARD, seed: "sit-left", table: tableFor([...lines(), "What is the ferryman doing?", "done for tonight"], log, d), minds, ask, started: (x) => (d.now = x), save: (t) => void (saved = t), keep: (k) => (kept = k) });
    expect(saved!.adv.scenes).toBeTruthy();
    expect(saved!.hand!.opened).toBe(true);
    const log2: string[] = [];
    const d2 = { now: null as Director | null };
    const end = await sit({ card: CARD, seed: "sit-left", table: tableFor(["yes, let us go on"], log2, d2), minds, ask, saved: saved!, ...(kept ? { kept } : {}), started: (x) => (d2.now = x) });
    expect(log2.some((l) => l.startsWith("You came back."))).toBe(true);
    expect(end!.over).toBeTruthy();
  });
});
