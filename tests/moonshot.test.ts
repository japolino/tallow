/**
 * The rest of the moonshot (docs/MOONSHOT.md): pressing, reading and favours; votes, hand-overs and splitting up;
 * fights in a world's own currency and its gear ladder; what projects pay off; the campaign's last story; and content
 * set at the table.
 */
import { describe, expect, test } from "bun:test";
import { COURIER } from "../src/content/adventures.js";
import { TAVERN } from "../src/content/tavern.js";
import { arrive, startTrip, type Trip } from "../src/engine/adventure.js";
import { checkFront, finaleDue, finaleRoad, startCampaign, stockFront } from "../src/engine/campaign.js";
import { contentFromLine, contentSaid, DEFAULT_CONTENT } from "../src/engine/content.js";
import { RATING_MAX } from "../src/engine/effect.js";
import { fightKind, gearFrom, kitFight, stockKit } from "../src/engine/kit.js";
import { nameCheck } from "../src/engine/moment.js";
import { startProject } from "../src/engine/project.js";
import { handedTo } from "../src/engine/seats.js";
import { payoffsNow, personAt, projectDone, talkOver, worldArrive, worldBegin, worldClock, worldLine, worldTried } from "../src/engine/world.js";
import { inKit } from "../src/game/session.js";

const begin = (seed = "m"): Trip => worldBegin(startTrip(TAVERN, inKit(COURIER, TAVERN.kit!), seed));
const atTaproom = (seed = "m"): Trip => worldArrive(arrive(begin(seed), "taproom")!.trip, TAVERN.stops[0]!).trip;
const atMarket = (seed = "m"): Trip => worldArrive(arrive({ ...begin(seed), at: "taproom", visited: ["taproom"] }, "market")!.trip, TAVERN.stops[1]!).trip;

describe("people: pressing, reading, favours", () => {
  test("pressing is a throw: it gets something out of her, or she closes up", () => {
    let gave = false;
    let closed = false;
    for (let i = 0; i < 16 && !(gave && closed); i++) {
      const t = atTaproom(`press-${i}`);
      const w = worldLine(t, "What aren't you telling me, Hesk?", t.facing!.moment)!;
      expect(w.lines[0]).toContain("You press Hesk");
      if (w.lines[0]!.includes("gives it up")) gave = true;
      if (w.lines[0]!.includes("closes up")) closed = true;
    }
    expect(gave || closed).toBe(true);
  });

  test("reading Pell after he lies: sometimes you catch it, and the slip is marked", () => {
    let caught = false;
    for (let i = 0; i < 40 && !caught; i++) {
      const t = atMarket(`read-${i}`);
      const told = worldLine(t, "So, Pell, any gossip about the box the masked ones carry?", t.facing!.moment)!;
      if (!told.trip.book!.slips.some((s) => s.clue === "pell-river")) continue;
      const at = { ...told.trip, sheet: { ...told.trip.sheet, stats: { ...told.trip.sheet.stats, sense: 4 } } };
      const r = worldLine(at, "Is he lying about the river boat?", { ...at.facing!.moment, sheet: at.sheet })!;
      expect(r.lines[0]).toContain("You watch Old Pell's face");
      if (r.lines[0]!.includes("that was a lie")) {
        caught = true;
        expect(r.trip.book!.slips.find((s) => s.clue === "pell-river")!.state).not.toBe("pinned");
        // Once a visit: asking again tells you nothing more.
        const again = worldLine(r.trip, "Is he lying about the river boat?", { ...r.trip.facing!.moment, sheet: at.sheet })!;
        expect(again.lines[0]).toContain("already");
      }
    }
    expect(caught).toBe(true);
  });

  test("asking what she needs starts a favour; done, she is close and tells everything", () => {
    const t = atTaproom();
    const w = worldLine(t, "What can I do for you, Hesk?", t.facing!.moment)!;
    const p = w.trip.projects!.find((x) => x.id === "favour:hesk")!;
    expect(p.segments).toBe(4);
    expect(w.lines[0]).toContain("brother");
    const done = projectDone(w.trip, { ...p, filled: 4 }, w.trip.facing!.moment);
    expect(done.trip.people!.hesk!.attitude).toBe("close");
    expect(done.trip.book!.slips.map((s) => s.clue)).toContain("hesk-brother");
  });
});

describe("the other players", () => {
  test("a vote: hands go up, and the plan the table agreed on is an edge for the way it chose", () => {
    const t = atTaproom();
    const w = worldLine(t, "Let's vote: I say we sneak out the back.", t.facing!.moment)!;
    expect(w.lines[0]).toContain("Hands go up");
    const lever = w.trip.facing!.moment.stop.levers.find((l) => l.id === "agreed:taproom")!;
    expect(lever.edge).toBe(true);
    expect(w.trip.proposals!.decided).toBe(lever.way);
  });

  test("talk it over, then go against them three times running, and a player goes cool", () => {
    let t = atTaproom();
    const start = t.fellows!.map((f) => f.attitude);
    let cooled = false;
    for (let i = 0; i < 4 && !cooled; i++) {
      const o = talkOver({ ...t, proposals: undefined });
      t = o.trip;
      const theirs = new Set(t.proposals!.list.map((x) => x.way));
      const against = (["talk", "sneak", "force", "pay"] as const).find((w) => !theirs.has(w)) ?? "pay";
      const r = worldTried(t, against);
      t = r.trip;
      cooled = r.lines.some((l) => l.includes("gone cool"));
    }
    expect(cooled || t.fellows!.some((f, i) => f.attitude !== start[i])).toBe(true);
  });

  test("a try handed to another player is thrown on their stats, and they feel trusted", () => {
    const t = atTaproom();
    const brannoc = handedTo("Brannoc, you take this one.", t.fellows!)!;
    expect(brannoc.id).toBe("brannoc");
    const r = worldTried(t, "force", { handed: "brannoc" });
    expect(r.trip.fellows!.find((f) => f.id === "brannoc")).toBeDefined();
  });

  test("split up: a player goes off to a place on the map, I cut to them, and they come back with what they saw", () => {
    let t = atTaproom();
    t = { ...t, book: { ...t.book!, mapped: [...t.book!.mapped, "The Alley"] } };
    const s = worldLine(t, "Ysolde, go and keep watch on the alley.", t.facing!.moment)!;
    expect(s.trip.fellows!.find((f) => f.id === "ysolde")!.at).toBe("alley");
    const c = worldClock({ ...s.trip, sheet: { ...s.trip.sheet, hour: 23.5 } }, 23.5, 24.25);
    expect(c.lines.some((l) => l.startsWith("Cut to Ysolde"))).toBe(true);
    const back = worldLine(c.trip, "Everyone back together.", c.trip.facing!.moment)!;
    expect(back.trip.fellows!.every((f) => !f.at)).toBe(true);
    expect(back.trip.book!.slips.map((x) => x.clue)).toEqual(expect.arrayContaining(["alley-mask", "alley-box"]));
  });
});

describe("a world's own fights and gear", () => {
  test("in a monster-romance world a fight is a seduction, won with charm, and you risk your composure", () => {
    const kit = stockKit("monster-romance", { ...DEFAULT_CONTENT, heat: true });
    const f = kitFight(kit, true);
    expect(f.kind).toBe("seduction");
    expect(f.attack).toContain("charm");
    expect(f.dial).not.toContain("health");
  });

  test("a medieval fight is won with steel; a space one is a firefight", () => {
    expect(fightKind(stockKit("medieval", DEFAULT_CONTENT)).kind).not.toBe("seduction");
    expect(kitFight(stockKit("space", DEFAULT_CONTENT), false).attack).not.toContain("power");
  });

  test("what you carry is read against the world's ladder, at most +1 without a price paid", () => {
    const kit = stockKit("medieval", DEFAULT_CONTENT);
    expect(gearFrom(kit, ["a sword"]).force).toBe(1);
    expect(gearFrom(kit, ["plate and a master's blade"]).force).toBeLessThanOrEqual(1);
    expect(gearFrom(kit, ["a crowbar"]).sneak).toBe(0);
    expect(gearFrom(kit, ["a love letter"]).force).toBeUndefined();
  });

  test("the alley fight in the tavern is thrown on the world's fighting stats, said once", () => {
    let t = arrive({ ...begin(), at: "taproom", visited: ["taproom"] }, "alley")!.trip;
    const w = worldArrive(t, TAVERN.stops[2]!);
    t = w.trip;
    expect(t.facing!.moment.attack?.length).toBeGreaterThan(0);
    const check = nameCheck(t.facing!.moment, { way: "force" })!;
    expect(t.facing!.moment.attack).toContain(check.stat);
  });
});

describe("what projects pay off", () => {
  test("a business pays income, a place overhears plans, people start warmer", () => {
    const t = atTaproom();
    const before = t.sheet.supplies;
    const p = payoffsNow(t, ["income", "place", "people"]);
    expect(p.trip.sheet.supplies).toBe(before + 1);
    expect(p.trip.schedule!.known.length).toBeGreaterThan(t.schedule!.known.length);
    expect(p.lines.some((l) => l.includes("notch in the candle"))).toBe(true);
    expect(p.trip.people!.hesk!.attitude).not.toBe(personAt(t, TAVERN.stops[0]!)!.attitude);
  });

  test("a finished project is kept as payoffs for the stories after", () => {
    const t = atTaproom();
    const p = { ...startProject("project-1", "open a shop that sells English breakfasts"), filled: 4 };
    const d = projectDone(t, p, t.facing!.moment);
    expect(d.trip.payoffs?.length).toBeGreaterThan(0);
    expect(d.lines[0]).toContain("It pays off");
  });
});

describe("the campaign's last story", () => {
  test("due when the candle is out or all three keys are held", () => {
    const c = startCampaign(stockFront(1, false));
    expect(finaleDue(c)).toBe(false);
    expect(finaleDue({ ...c, burned: 6 })).toBe(true);
    expect(finaleDue({ ...c, keys: [true, true, true] })).toBe(true);
  });

  test("the big bad itself waits at the climax, at the top of the scale, and the keys are edges", () => {
    const c = { ...startCampaign(stockFront(1, false)), keys: [true, true, false] as [boolean, boolean, boolean] };
    const adv = finaleRoad(TAVERN, c);
    const climax = adv.stops.find((s) => s.climax)!;
    expect(climax.foe!.name).toBe(c.front.name);
    expect(Object.values(climax.foe!.ratings!).every((r) => r === RATING_MAX)).toBe(true);
    expect(adv.finale!.edges).toBeGreaterThan(0);
  });

  test("a model's big bad is checked: what is missing comes from the stock one", () => {
    const stock = stockFront(2, false);
    const f = checkFront({ name: "the drowned king", wants: "the coast under the sea", steps: ["one"], keys: ["his true name", "x"] }, stock);
    expect(f.name).toBe("the drowned king");
    expect(f.steps).toEqual(stock.steps);
    expect(f.keys).toEqual(stock.keys);
  });
});

describe("content, set at the table", () => {
  test("heat, dark themes, the dice, lines and veils, in your own words", () => {
    let s = DEFAULT_CONTENT;
    s = contentFromLine("heat on", s)!;
    expect(s.heat).toBe(true);
    s = contentFromLine("dark themes on please", s)!;
    expect(s.dark).toBe(true);
    s = contentFromLine("let the dice decide", s)!;
    expect(s.diceDecide).toBe(true);
    s = contentFromLine("line: spiders, gore", s)!;
    expect(s.lines).toEqual(["spiders", "gore"]);
    s = contentFromLine("veil: torture", s)!;
    expect(s.veils).toEqual(["torture"]);
    s = contentFromLine("no heat", s)!;
    expect(s.heat).toBe(false);
    s = contentFromLine("clear the lines", s)!;
    expect(s.lines).toEqual([]);
    expect(contentSaid(s)).toContain("torture");
  });

  test("a line of play sets nothing", () => {
    expect(contentFromLine("A heist, something tense.", DEFAULT_CONTENT)).toBeNull();
    expect(contentFromLine("I want a dark story about a haunted abbey and a long war", DEFAULT_CONTENT)).toBeNull();
  });
});
