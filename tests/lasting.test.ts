import { describe, expect, test } from "bun:test";
import { STOCK_SCENES, STOCK_SCENES_RAW } from "../src/content/scenes.js";
import { startTrip, type Trip } from "../src/engine/adventure.js";
import { enterScene, GRIP_MAX, leaveScene, price, sceneAdventure, STEP, startHand, thingsNow, type SceneTry } from "../src/engine/hand.js";
import { START } from "../src/engine/hero.js";
import { ASK_NEED, checkOwn, checkReading, comeDue, companyKept, companyNow, enterDue, lastingOf, priceTry, reviseTrip, spendTry, standingOf, walkAway, whatStands, withCompany, type OwnRead } from "../src/engine/lasting.js";
import type { Sheet } from "../src/engine/moment.js";
import { handEndSaid, spentNote, stakeSaid } from "../src/engine/tell-hand.js";
import { askNote, truthsSaid } from "../src/engine/tell-lasting.js";
import type { CardInfo } from "../src/game/card.js";
import type { Director, Table } from "../src/game/director.js";
import { checkRevision, reviseMessages } from "../src/game/lastingwriter.js";
import { standIns, type Minds } from "../src/game/minds.js";
import type { Ask } from "../src/game/prompts.js";
import { directScenes } from "../src/game/scenes.js";
import { sceneLineMessages } from "../src/game/scenewriter.js";
import { rulesHero } from "../src/engine/hero.js";
import { sit, type Kept } from "../src/game/session.js";

const SHEET: Sheet = { stats: { brawn: 1, grace: 2, charm: 3, guile: 2, wits: 1, sense: 1 }, ...START, hour: 19 };
const adventure = (seed: string) => sceneAdventure(STOCK_SCENES, { seed, who: "a courier", startHour: 19 });
const opened = (seed = "last"): Trip => enterScene(startHand(startTrip(adventure(seed), SHEET, seed)))!.trip;
const withDice = (t: Trip, dice: number[]): Trip => ({ ...t, hand: { ...t.hand!, dice } });

const ORLA: OwnRead = { kind: "join", who: "Orla", change: "Orla comes with you for the rest of the night.", size: "large", lesser: "Orla rows you across, and no further.", catch: "Her boy is left alone by the stove, and the men who paid her will want to know why.", against: "Orla shuts her door on you.", costs: "goodwill" };
const ask = (own: OwnRead, risk: SceneTry["risk"] = "real"): SceneTry => ({ attempt: "ask Orla to come along", stat: "charm", risk, stake: "goodwill", threat: "she turns away", aim: "own", thing: null, own });
/** Spend the first die (set to `die`) on a try. */
const roll = (t: Trip, r: SceneTry, die: number) => {
  const tt = withDice(t, [die, 2, 2]);
  return spendTry(tt, priceTry(tt, r)!, 0)!;
};

describe("what a try is after, read", () => {
  test("a try after something of its own keeps what it is after; one that says nothing usable is a try at the scene, and says why", () => {
    const t = opened();
    const base = { kind: "try", attempt: "ask her along", stat: "charm", risk: "real", stake: "goodwill", threat: "she turns away", aim: "own" };
    const r = checkReading({ ...base, own: { kind: "join", who: "Orla", change: "Orla comes with you", size: "huge", catch: "her boy is left alone", against: "she shuts the door" } }, t, false);
    expect(r).toMatchObject({ kind: "try", aim: "own", own: { kind: "join", who: "Orla", size: "huge", costs: "goodwill" } });
    let why = "";
    const bare = checkReading({ ...base, own: { kind: "join", who: "Orla", change: "Orla comes with you" } }, t, false, (w) => (why = w));
    expect(bare).toMatchObject({ kind: "try", aim: "through", own: null });
    expect(why).toContain('"catch"');
    // A size or kind not the game's is the middle one, not a reason to refuse.
    expect(checkOwn({ kind: "elope", who: "Orla", change: "Orla comes with you", size: "enormous", catch: "her boy is left" }, t, "hours")).toMatchObject({ kind: "fact", size: "large", costs: "hours" });
    // Walking away is a line the reader can say.
    expect(checkReading({ kind: "leave" }, t, false)).toEqual({ kind: "leave" });
  });

  test("an ask under way goes on at the size it had, however it is put again", () => {
    const t = roll(opened(), ask({ ...ORLA, size: "huge" }), 2).trip;
    const under = lastingOf(t.hand).asks[0]!;
    expect(under.size).toBe("huge");
    const again = checkOwn({ kind: "join", who: "orla", change: "Orla walks with you", size: "small", catch: "her boy" }, t, "goodwill")!;
    expect(again.ask).toBe(under.id);
    expect(again.size).toBe("huge");
  });

  test("an ask under way named by its id is taken only for the same person", () => {
    const t = roll(opened(), ask({ ...ORLA, size: "huge" }), 2).trip;
    const id = lastingOf(t.hand).asks[0]!.id;
    expect(checkOwn({ ask: id, who: "Orla" }, t, "goodwill")).toMatchObject({ ask: id, who: "Orla", size: "huge" });
    expect(checkOwn({ ask: id }, t, "goodwill", undefined, "beg Orla once more")).toMatchObject({ ask: id });
    // A real reader once went on with an ask of one person in a try at another.
    let why = "";
    expect(checkOwn({ ask: id }, t, "goodwill", (w) => (why += w), "ask the Tidewarden to forgive the toll")).toBeNull();
    expect(why).toContain(`(${id}) is of Orla`);
    const other = checkOwn({ ask: id, kind: "bond", who: "the Tidewarden", change: "The toll is forgiven for good.", size: "small", catch: "She will want a favour for it." }, t, "goodwill")!;
    expect(other.ask).toBeUndefined();
    expect(other.size).toBe("small");
  });

  test("the reader is told what it can win, what is now true, and what is under way", () => {
    const t = roll(opened(), ask({ ...ORLA, size: "huge" }), 2).trip;
    const [system, user] = sceneLineMessages("Orla, come with me", { trip: t });
    expect(system!.content).toContain('"aim": "through" | "loose" | "own"');
    expect(system!.content).toContain("Never refuse an ask");
    expect(system!.content).toContain('{"kind": "leave"}');
    // A real reader once read "I finish it" as walking away.
    expect(system!.content).toContain('Never for a line that goes on with the scene, however short ("I finish it"');
    expect(user!.content).toContain("Asks under way");
    expect(user!.content).toContain("Orla");
  });
});

describe("an ask, priced", () => {
  test("a bigger ask is harder, and how the one asked stands with you counts", () => {
    const t = opened();
    const scene = price(t, { ...ask(ORLA), aim: "through", own: null })!.target;
    expect(priceTry(t, ask({ ...ORLA, size: "small" }))!.target).toBe(scene);
    expect(priceTry(t, ask(ORLA))!.target).toBe(scene + STEP);
    expect(priceTry(t, ask({ ...ORLA, size: "huge" }))!.target).toBe(scene + 2 * STEP);
    // A landing leaves her warmer: the next ask of her is a step easier.
    const warmer = roll(t, ask({ ...ORLA, size: "huge" }), 20).trip;
    expect(standingOf(warmer, "Orla")).toBe(1);
    expect(priceTry(warmer, ask({ ...ORLA, size: "huge" }))!.target).toBe(scene + STEP);
  });

  test("the stake says what it is after, why it is hard, what landing makes true and what comes with it", () => {
    const t = withDice(opened(), [18, 9, 3]);
    const said = stakeSaid(t, priceTry(t, ask(ORLA))!).join(" ");
    expect(said).toContain("Orla comes with you for the rest of the night");
    expect(said).toContain("a step harder for so big an ask");
    expect(said).toContain("Her boy is left alone");
    expect(said).toContain("Orla rows you across, and no further");
    expect(said).toContain("Which die do you spend on it?");
  });
});

describe("an ask, won", () => {
  test("a landed try wins it for good: someone joins you, a card's worth of rule, and the one in the way is not any more", () => {
    const t = opened();
    const s = roll(t, ask(ORLA), 20);
    expect(s.own!.won).toMatchObject({ kind: "join", form: "full", said: ORLA.change, due: 1 });
    expect(s.own!.joined!.name).toBe("Orla");
    expect(s.trip.hand!.through).toBeGreaterThan(t.hand!.through);
    expect(companyNow(s.trip).map((c) => c.name)).toEqual(["Orla"]);
    expect(standingOf(s.trip, "Orla")).toBeGreaterThanOrEqual(1);
    // She can be leaned on once a scene, like a thing in it.
    expect(thingsNow(s.trip).some((x) => x.id === `with:${s.own!.joined!.id}`)).toBe(true);
    expect(truthsSaid(s.trip).join(" ")).toContain(ORLA.change.replace(/\.$/, ""));
    expect(askNote(s)).toContain("stays true");
    // Orla is the one in the way here: won over, she is not in it any more, and the scene moves as a try at it would.
    expect(spentNote(s, STOCK_SCENES.scenes[0]!)).toContain("toward getting through");
    expect(stakeSaid(withDice(t, [20, 2, 2]), priceTry(withDice(t, [20, 2, 2]), ask(ORLA))!).join(" ")).toContain("Since Orla is the one in your way here");
  });

  test("an ask of someone who is not the one in the way, or for a promise from them, does not move the scene", () => {
    const t = opened();
    const bram = roll(t, ask({ ...ORLA, who: "Bram", change: "Bram comes with you." }), 20);
    expect(bram.own!.joined!.name).toBe("Bram");
    expect(bram.trip.hand!.through).toBe(t.hand!.through);
    expect(spentNote(bram, STOCK_SCENES.scenes[0]!)).not.toContain("toward getting through");
    const promise = roll(t, ask({ ...ORLA, kind: "bond", change: "Orla owes you a crossing." }), 20);
    expect(promise.own!.won!.kind).toBe("bond");
    expect(promise.trip.hand!.through).toBe(t.hand!.through);
  });

  test("someone named in more words or fewer is the same person", () => {
    const t = roll(opened(), ask(ORLA), 20).trip;
    expect(standingOf(t, "Orla the ferry keeper")).toBe(standingOf(t, "Orla"));
    const failed = roll(t, ask({ ...ORLA, kind: "side", who: "Orla the ferry keeper", change: "Orla turns on the men who paid her." }), 2);
    // The one with you is the one let down: she thinks less of you, and leaves as the next scene opens.
    expect(standingOf(failed.trip, "Orla")).toBe(0);
    expect(Object.keys(lastingOf(failed.trip.hand).people)).toEqual(["orla"]);
  });

  test("a huge ask takes more than one landing, and rapport carries between them", () => {
    const t = opened();
    const first = roll(t, ask({ ...ORLA, size: "huge" }), 19);
    expect(first.own!.won).toBeNull();
    expect(first.own!.ask.filled).toBe(2);
    expect(first.own!.ask.need).toBe(ASK_NEED.huge);
    const own = checkOwn({ ...ORLA, size: "huge" }, first.trip, "goodwill")!;
    const second = roll(first.trip, ask(own), 19);
    expect(second.own!.won?.said).toBe(ORLA.change);
  });

  test("a landing at a cost wins the lesser version; a failure costs you with them, and enough of it sets them against you", () => {
    const t = opened();
    const p = priceTry(withDice(t, [10, 2, 2]), ask({ ...ORLA, size: "small" }))!;
    // Find a die that lands only at a cost.
    const costDie = [...Array(20).keys()].map((i) => i + 1).find((d) => priceTry(withDice(t, [d, 2, 2]), ask({ ...ORLA, size: "small" }))!.bands[0] === "cost")!;
    expect(p).toBeTruthy();
    const lesser = roll(t, ask({ ...ORLA, size: "small" }), costDie);
    expect(lesser.own!.won).toMatchObject({ form: "lesser", said: ORLA.lesser });
    // Won only at a cost, from a stranger: she does not think well enough of you to stay past this scene.
    expect(standingOf(lesser.trip, "Orla")).toBe(0);
    const failed = roll(t, ask(ORLA), 2);
    expect(failed.own!.won).toBeNull();
    expect(standingOf(failed.trip, "Orla")).toBe(-1);
    const botched = roll(failed.trip, ask(checkOwn(ORLA, failed.trip, "goodwill")!), 1);
    expect(botched.own!.soured).toMatchObject({ kind: "sour", who: "Orla", said: ORLA.against });
    expect(standingOf(botched.trip, "Orla")).toBe(-2);
  });
});

describe("what comes due", () => {
  test("a catch comes due as the next scene opens, at code's price, and never closes it before you act", () => {
    const won = roll(opened(), ask(ORLA), 20).trip;
    // Not in the scene it was won in.
    expect(comeDue(won).due).toEqual([]);
    const next = leaveScene({ ...won, hand: { ...won.hand!, through: 5 } }, "won")!.trip;
    const e = enterDue(next)!;
    expect(e.due.length).toBe(1);
    expect(e.due[0]!.change!.catch).toBe(ORLA.catch);
    expect(e.due[0]!.losses).toEqual([{ kind: "goodwill", amount: 1 }]);
    expect(e.trip.hand!.grip).toBe(1);
    expect(e.trip.hand!.grip).toBeLessThan(GRIP_MAX);
    // Paid once.
    expect(comeDue(e.trip).due).toEqual([]);
    expect(lastingOf(e.trip.hand).changes[0]!.due).toBeNull();
  });

  test("someone with you who thinks too little of you leaves as a scene opens; one set against you turns", () => {
    const won = roll(opened(), ask(ORLA), 20).trip;
    const cold = { ...won, hand: { ...won.hand!, lasting: { ...lastingOf(won.hand), people: { orla: { name: "Orla", standing: 0 } } } } };
    const left = comeDue(cold);
    expect(left.due[0]).toMatchObject({ how: "left", closed: 0 });
    expect(companyNow(left.trip)).toEqual([]);
    expect(whatStands(left.trip).gone).toEqual([{ name: "Orla", how: "left" }]);
    const against = { ...won, hand: { ...won.hand!, lasting: { ...lastingOf(won.hand), people: { orla: { name: "Orla", standing: -2 } } } } };
    expect(comeDue(against).due[0]).toMatchObject({ how: "turned", closed: 1 });
  });

  test("leaning on someone in a try that falls short makes them think less of you", () => {
    const won = roll(opened(), ask(ORLA), 20).trip;
    const id = `with:${companyNow(won)[0]!.id}`;
    const s = roll(won, { attempt: "Orla rows hard", stat: "charm", risk: "real", stake: "health", threat: "the boat slews", aim: "through", thing: id }, 2);
    expect(s.leaned).toMatchObject({ before: 1, after: 0 });
  });
});

describe("walking away", () => {
  test("from a scene: left undone, nothing from it, all that closed follows and a step more; from the last, the story", () => {
    const t = { ...opened(), hand: { ...opened().hand!, grip: 2 } };
    const w = walkAway(t)!;
    expect(w.last).toBe(false);
    expect(w.trip.hand!.scene).toBe(1);
    expect(w.trip.hand!.grip).toBe(3);
    expect(w.trip.hand!.boons).toEqual([]);
    expect(w.trip.hand!.lost.at(-1)).toContain("walked away");
    const last = { ...t, hand: { ...t.hand!, scene: 2 } };
    const end = walkAway(last)!;
    expect(end.trip.over).toBe("taken");
    expect(handEndSaid(end.trip).join(" ")).toContain("walked away");
  });
});

describe("scenes written again", () => {
  const raw = () => JSON.parse(JSON.stringify(STOCK_SCENES_RAW)) as typeof STOCK_SCENES_RAW;

  test("are checked scene by scene: one that checks is kept, one that does not stays as it was", () => {
    const r = raw();
    const s2 = { ...r.scenes[1]!, situation: "Orla walks beside you into the toll yard, and the watchmen know her by sight and do not like it." };
    let why = "";
    const got = checkRevision({ scenes: [s2, { ...r.scenes[2]!, taken: undefined }] }, STOCK_SCENES, 1, (w) => (why = w));
    expect(got.map((s) => s.id)).toEqual(["s2"]);
    expect(why).toContain('scene 3: "taken"');
  });

  test("keep their ids, names and difficulty, and never touch a scene already come to", () => {
    const t = opened();
    const r = raw();
    const got = checkRevision({ scenes: [{ ...r.scenes[1]!, name: "Somewhere Else", situation: "Orla walks beside you into the toll yard, and the watchmen know her by sight and do not like it." }, r.scenes[2]] }, STOCK_SCENES, 1);
    const next = reviseTrip(t, got);
    const s2 = next.adv.scenes!.scenes[1]!;
    expect(s2.name).toBe(STOCK_SCENES.scenes[1]!.name);
    expect(s2.difficulty).toBe(STOCK_SCENES.scenes[1]!.difficulty);
    expect(s2.situation).toContain("Orla walks beside you");
    expect(next.adv.stops[1]!.situation).toContain("Orla walks beside you");
    expect(next.adv.scenes!.scenes[0]).toBe(t.adv.scenes!.scenes[0]!);
    // A rewrite of a scene in play is not taken.
    expect(reviseTrip(t, [{ ...STOCK_SCENES.scenes[0]!, situation: "changed" }]).adv.scenes!.scenes[0]!.situation).toBe(STOCK_SCENES.scenes[0]!.situation);
  });

  test("the model is told what is now true and handed the scenes still to come", () => {
    const [system, user] = reviseMessages(STOCK_SCENES, 1, ["Orla goes with the player now."]);
    expect(system!.content).toContain("never whether");
    expect(user!.content).toContain("Orla goes with the player now.");
    expect(user!.content).toContain(STOCK_SCENES.scenes[1]!.name);
    expect(user!.content).not.toContain(`"name": "${STOCK_SCENES.scenes[0]!.name}"`);
  });
});

describe("from one story to the next", () => {
  test("whoever is with you at the end is with you at the start of the next, as they stood, with what is owed", () => {
    const won = roll(opened(), ask(ORLA), 20).trip;
    const carried = companyKept(won);
    expect(carried).toMatchObject([{ name: "Orla", owed: true, catch: ORLA.catch }]);
    const fresh = withCompany(startHand(startTrip(adventure("next"), SHEET, "next")), carried);
    expect(companyNow(fresh).map((c) => c.name)).toEqual(["Orla"]);
    expect(standingOf(fresh, "Orla")).toBe(standingOf(won, "Orla"));
    // What came with her comes due at the first scene of the new story.
    expect(enterDue(fresh)!.due.length).toBe(1);
    expect(whatStands(fresh).with[0]).toMatchObject({ name: "Orla", owed: true });
  });
});

/** A table that plays a fixed list of lines, touching the highest die for every try. */
function tableFor(lines: string[], log: string[], d: { now: Director | null }): Table {
  return {
    say: async (l) => void log.push(...l),
    write: async () => {
      let line = lines.shift();
      if (line === undefined && (!d.now || d.now.stage === "over")) line = "done for tonight";
      if (line === undefined) {
        const st = d.now!.stage;
        if (st === "camp") line = "I press on";
        else if (log.at(-1)?.includes("Give something up")) line = "I let it lie";
        else if (st === "check") line = String(Math.max(...d.now!.trip.hand!.dice));
        else line = "I push on";
      }
      if (log.length > 4000) throw new Error(`table ran away: ${log.slice(-12).join(" | ")}`);
      log.push(`> ${line}`);
      return { line, given: Promise.resolve() };
    },
    pickDie: async (dice: readonly number[]) => dice.indexOf(Math.max(...dice)),
    hand: async () => {},
    board: async () => {},
    page: async () => {},
    aside: async () => {},
    wait: async (_b, w) => w,
    weigh: async () => {},
    dieOrLine: async () => null,
    throwDie: async () => {},
    carry: async () => {},
    clock: () => {},
    deal: async () => {},
    turn: async (s) => void log.push(`[turn] ${s.id}`),
    clear: async () => {},
    fork: async (s) => s[0]!.id,
    offer: async () => 0,
    give: async (c) => void log.push(`[give] ${c.id} ${c.side} ${c.name}`),
    take: async (id) => void log.push(`[take] ${id}`),
    rival: async () => {},
    sweep: async () => {},
    move: async () => {},
  };
}

describe("at the table", () => {
  test("a try after someone is priced and said, won with a card on your side, the scenes ahead written again, and the catch told as the next opens", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    const notes: string[] = [];
    let revised = 0;
    const minds = {
      sceneLine: async (line: string) => (line === "done for tonight" ? { kind: "stop" } : line.startsWith("Orla") ? { kind: "try", attempt: "ask Orla along", stat: "charm", risk: "grave", stake: "goodwill", threat: "she turns away", aim: "own", thing: null, own: { ...ORLA, size: "small" } } : { kind: "try", attempt: "push on", stat: "charm", risk: "grave", stake: "health", threat: "it goes wrong", aim: "through", thing: null }),
      sceneTell: async (_at: unknown, note: string) => (notes.push(note), "told"),
      sceneRevise: async (story: typeof STOCK_SCENES, from: number, truths: readonly string[]) => {
        revised++;
        expect(truths.join(" ")).toContain("Orla");
        return story.scenes.slice(from).map((s) => ({ ...s, situation: `${s.situation} Orla is with you here.` }));
      },
    } as unknown as Minds;
    const lines = ["Orla, come with me for good", ...Array(8).fill("I push on")];
    d.now = directScenes(adventure("tab"), SHEET, "tab", tableFor(lines, log, d), minds);
    const end = await d.now.done;
    expect(log.some((l) => l.startsWith("You are after something of your own here"))).toBe(true);
    const joined = log.some((l) => /^\[give\] with:w\d+ companion Orla$/.test(l));
    expect(joined).toBe(true);
    expect(revised).toBeGreaterThan(0);
    expect(end.adv.scenes!.scenes[1]!.situation).toContain("Orla is with you here.");
    expect(notes.join(" ")).toContain(ORLA.catch.replace(/\.$/, ""));
  });

  test("walking away is said at its price first, and done only when the player means it", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    const minds = { sceneLine: async (line: string) => (line.includes("walk away") ? { kind: "leave" } : line === "done for tonight" ? { kind: "stop" } : { kind: "free" }) } as unknown as Minds;
    d.now = directScenes(adventure("walk"), SHEET, "walk", tableFor(["I walk away from all this", "no", "I walk away from all this", "yes", "done for tonight"], log, d), minds);
    const end = await d.now.done;
    expect(log.filter((l) => l.startsWith("Walk away from")).length).toBe(2);
    expect(log.some((l) => l.startsWith("You walk away from"))).toBe(true);
    expect(end.hand!.scene).toBe(1);
    expect(log.filter((l) => l.startsWith("[turn]"))).toEqual(["[turn] s1", "[turn] s2"]);
  });
});

describe("a line written at the trade", () => {
  test("that does something else is not lost: the die lies as it is, and the line is played after", async () => {
    let offered = false;
    let played = false;
    for (const seed of ["tr1", "tr2", "tr3", "tr4", "tr5", "tr6", "tr7", "tr8"]) {
      const log: string[] = [];
      const d = { now: null as Director | null };
      const minds = {
        sceneLine: async (line: string) => (line === "done for tonight" ? { kind: "stop" } : line === "I look at the river instead" ? ((played = true), { kind: "free" }) : { kind: "try", attempt: "push on", stat: "wits", risk: "real", stake: "health", threat: "it goes wrong", aim: "through", thing: null }),
        pick: async (q: string) => (q.includes("give something up") ? "other" : null),
      } as unknown as Minds;
      const table = tableFor([], log, d);
      const write = table.write;
      table.write = async () => (log.at(-1)?.includes("Give something up") ? (log.push("> I look at the river instead"), { line: "I look at the river instead", given: Promise.resolve() }) : write());
      table.pickDie = async (dice) => dice.indexOf(Math.min(...dice));
      d.now = directScenes(adventure(seed), SHEET, seed, table, minds);
      await d.now.done;
      if (log.some((l) => l.includes("Give something up"))) offered = true;
      if (played) break;
    }
    expect(offered).toBe(true);
    expect(played).toBe(true);
  });
});

describe("a line written at rest-or-press-on", () => {
  test("that does something else presses on, and is played in the scene ahead", async () => {
    const log: string[] = [];
    const d = { now: null as Director | null };
    const LINE = "I look over the clerk's desk for anything useful";
    let playedAt = -1;
    const minds = {
      sceneLine: async (line: string) => (line === "done for tonight" ? { kind: "stop" } : line === LINE ? ((playedAt = log.length), { kind: "free" }) : { kind: "try", attempt: "push on", stat: "charm", risk: "grave", stake: "health", threat: "it goes wrong", aim: "through", thing: null }),
      pick: async (q: string) => (q.includes("rest before the next scene") ? "other" : null),
    } as unknown as Minds;
    let asked = false;
    const table = tableFor([], log, d);
    const write = table.write;
    table.write = async () => {
      if (log.at(-1)?.includes("Rest before the next scene")) return (asked = true), log.push(`> ${LINE}`), { line: LINE, given: Promise.resolve() };
      if (asked && playedAt >= 0) return log.push("> done for tonight"), { line: "done for tonight", given: Promise.resolve() };
      return write();
    };
    d.now = directScenes(adventure("held"), SHEET, "held", table, minds);
    await d.now.done;
    expect(asked).toBe(true);
    expect(log).toContain("You press on.");
    expect(playedAt).toBeGreaterThan(log.indexOf("[turn] s2"));
  });
});

describe("a sitting", () => {
  test("someone won in one story is with the hero in the next, and its builder is told so", async () => {
    const CARD = { name: "Maren", description: "A ferrywoman on a river of lamps.", personality: "dry", scenario: "The night ferry is late." } as CardInfo;
    const built: string[] = [];
    const ask: Ask = async (messages, role) => {
      const all = messages.map((m) => m.content).join("\n");
      if (role === "builder" && all.includes("THE STORY TO WRITE")) return (built.push(all), JSON.stringify(STOCK_SCENES_RAW));
      throw new Error("no model for that");
    };
    const won = roll(opened(), ask0(), 20).trip;
    const kept: Kept = { hero: { ...rulesHero("Tam, a courier"), sheet: SHEET }, played: [], carry: [], company: companyKept(won) };
    const log: string[] = [];
    const d = { now: null as Director | null };
    const minds = { ...standIns(0), hero: async (line: string) => rulesHero(line) };
    await sit({ card: CARD, seed: "carry", table: tableFor(["I want to get a sealed letter to the magistrate before dawn, whatever it costs me"], log, d), minds, ask, kept, started: (x) => (d.now = x) });
    expect(built[0]).toContain("WHO GOES WITH THE PLAYER");
    expect(built[0]).toContain("Orla");
    expect(log.some((l) => /^\[give\] with:w\d+ companion Orla$/.test(l))).toBe(true);
  });
});

function ask0(): SceneTry {
  return ask(ORLA);
}
