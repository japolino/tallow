/**
 * The second audit of machines hidden in the code (2026-11-11): a hero's own stats kept, paying never dearer for being
 * good at it, a 1 that always fails, a campaign whose steps are stopped by winning, clues only for getting past, one
 * sheet that counts, and a hunch about a lie however the lie reaches you.
 */
import { describe, expect, test } from "bun:test";
import { COURIER } from "../src/content/adventures.js";
import { FAMILIES, drawRecipe, storyRead } from "../src/content/tropes.js";
import { arrive, sheetKept, startTrip, type Adventure, type Trip } from "../src/engine/adventure.js";
import { campaignBrief, endChapter, startCampaign, STOCK_FRONTS, type Campaign } from "../src/engine/campaign.js";
import { getClue } from "../src/engine/clues.js";
import { furnish } from "../src/engine/furnish.js";
import { makeHero, STAT_BUDGET } from "../src/engine/hero.js";
import { resolve, WAY_STATS, type Moment } from "../src/engine/moment.js";
import { layRoad, waysThrough } from "../src/engine/road.js";
import { checkSaid, rollLines } from "../src/engine/tell.js";
import { projectDone, worldArrive, worldBegin, worldPast } from "../src/engine/world.js";
import { fallbackAdventure } from "../src/game/build.js";
import type { CardInfo } from "../src/game/card.js";
import { frontMessages, heroMessages } from "../src/game/prompts.js";
import { inKit, wantsCampaign } from "../src/game/session.js";

const MAREN: CardInfo = { name: "Maren", description: "Maren Vell is a ferrywoman of thirty who keeps the crossing at Dunmore." };
const built = (family: (typeof FAMILIES)[number], seed: string): Adventure => fallbackAdventure(furnish(layRoad(drawRecipe(family, seed, [], [family]), seed, { modern: false })), MAREN, seed);
const begin = (a: Adventure, seed: string): Trip => worldBegin(startTrip(a, a.kit ? inKit(COURIER, a.kit) : COURIER, seed));
/** At a stop of the road, gone to along a way through it. */
const at = (a: Adventure, seed: string, id: string): Trip | null => {
  const path = waysThrough(a).find((p) => p.includes(id));
  if (!path) return null;
  let t: Trip = begin(a, seed);
  for (const step of path) {
    if (step === id) break;
    t = { ...t, at: step, visited: [...t.visited, step] };
  }
  const r = arrive(t, id);
  return r ? worldArrive(r.trip, a.stops.find((s) => s.id === id)!).trip : null;
};
const someone = (): Trip => {
  for (const seed of ["v1", "v2", "v3", "v4", "v5"]) {
    const a = built("rescue", seed);
    const stop = a.stops.find((s) => s.person && waysThrough(a).some((p) => p.includes(s.id)));
    const t = stop ? at(a, seed, stop.id) : null;
    if (t?.facing) return t;
  }
  throw new Error("no seed reached a person");
};

describe("a hero's own stats", () => {
  test("the model is told the real budget, and a spread that misses it is put right, not thrown away", () => {
    expect(heroMessages("a sailor")[0]!.content).toContain(`the six always add up to exactly ${STAT_BUDGET}`);
    const six = { brawn: 0, grace: 1, charm: 0, guile: 0, wits: 4, sense: 1 };
    const h = makeHero("courier", { stats: six });
    const sum = Object.values(h.sheet.stats).reduce((a, b) => a + (b ?? 0), 0);
    expect(sum).toBe(STAT_BUDGET);
    expect(h.sheet.stats.wits).toBe(4);
    expect(h.sheet.stats.brawn).toBeLessThanOrEqual(1);
  });
});

describe("sure hands and a slip", () => {
  /** The same moment, thrown again and again, with a stat of 3 for every way and a price of 2 to pay. */
  const tries = (m0: Moment, slip = false): ReturnType<typeof resolve>[] => {
    const stats = { ...m0.sheet.stats };
    for (const s of WAY_STATS.pay) if (s !== "power") stats[s] = 3;
    const stop = { ...m0.stop, ways: { ...m0.stop.ways, pay: { difficulty: 4, price: 2, ...(m0.stop.ways.pay ?? {}) } } };
    const ability = slip ? { id: "slip", name: "Luck", looks: "luck", does: "slip" as const, much: 1, often: "story" as const, ways: ["pay" as const] } : undefined;
    const out: ReturnType<typeof resolve>[] = [];
    for (let i = 0; i < 300; i++) {
      const m = { ...m0, tries: i, stop: { ...stop, ways: { ...stop.ways, pay: { ...stop.ways.pay!, price: 2 } } }, sheet: { ...m0.sheet, stats, supplies: 9 }, ...(ability ? { abilities: [ability] } : {}) } as Moment;
      out.push(resolve(m, { way: "pay", ...(ability ? { ability: ability.id } : {}) }));
    }
    return out;
  };

  test("a failure saved by sure hands never costs more than the price, and is told as what it is", () => {
    const outs = tries(someone().facing!.moment).filter((o) => o?.steady);
    expect(outs.length).toBeGreaterThan(0);
    for (const o of outs) {
      expect(o!.cost.amount).toBeLessThanOrEqual(2 + (o!.check.position === "desperate" ? 1 : 0));
      expect(rollLines(o!).join(" ")).toContain("this is what you are good at");
      expect(rollLines(o!).join(" ")).not.toContain("by 3 or less");
    }
  });

  test("a 1 always fails, sure hands or not, and the narrator does not promise otherwise", () => {
    const outs = tries(someone().facing!.moment).filter((o) => o && o.natural === 1 && !o.naturals);
    for (const o of outs) expect(o!.tier).toBe("crit_fail");
    const sure = outs[0]?.check ?? tries(someone().facing!.moment)[0]!.check;
    if (sure.sure) expect(checkSaid(sure).join(" ")).toContain("unless the die shows a 1");
  });
});

describe("a campaign", () => {
  test("a chapter won stops the step that was due; the next loss takes the steps after it, never the same one", () => {
    const c0 = startCampaign(STOCK_FRONTS[0]!);
    const won = endChapter(c0, { setBack: true, failedNear: false, found: [0], trouble: "The Ferry, get her across", how: "won" });
    expect(won.steps).toEqual([]);
    expect(won.stopped).toBe(c0.front.steps[0]!);
    expect(won.campaign.burned).toBe(0);
    const lost = endChapter(won.campaign, { setBack: false, failedNear: true, found: [], trouble: "The Vault, steal the ledger", how: "deadline" });
    expect(lost.steps).toEqual([c0.front.steps[1]!, c0.front.steps[2]!]);
    expect(lost.steps).not.toContain(c0.front.steps[0]!);
    expect(lost.campaign.burned).toBe(2);
    const brief = campaignBrief(lost.campaign);
    expect(brief).toContain(`stopped it before: ${c0.front.steps[0]}`);
    expect(brief).toContain("The Ferry, get her across: won");
    expect(brief).toContain(`last, ${c0.front.steps[2]}`);
  });

  test("the end itself cannot be stopped by a chapter, and the player's own big bad goes to the writer", () => {
    let c: Campaign = { ...startCampaign(STOCK_FRONTS[0]!), next: 5 };
    c = endChapter(c, { setBack: true, failedNear: false, found: [] }).campaign;
    expect(c.next).toBe(5);
    expect(frontMessages("A grey port.", "a campaign against the Red King")[1]!.content).toContain("the Red King");
  });

  test("asking for no big bad is not asking for one", () => {
    expect(wantsCampaign("No big bad please, just a heist")).toBe(false);
    expect(wantsCampaign("Let's play a campaign against the Red King")).toBe(true);
  });
});

describe("another story, or stop", () => {
  test("a story where something stops or leaves is a story; only stopping play stops", () => {
    const offered = [...FAMILIES];
    expect(storyRead("Something where we stop a cult", offered, true)).not.toBe("done");
    expect(storyRead("Let's leave the city behind", offered, true)).not.toBe("done");
    expect(storyRead("I'm done for tonight", offered, true)).toBe("done");
    expect(storyRead("Enough.", offered, true)).toBe("done");
  });
});

describe("clues for getting past", () => {
  test("a favour done in the middle of a fight makes them close, but what they know waits until you are past", () => {
    const t0 = someone();
    const p = t0.facing!.stop.person!;
    const t = { ...t0, facing: { ...t0.facing!, contest: {} as never } } as Trip;
    const project = { id: `favour:${p.id}`, goal: "her rent", segments: 4, filled: 4, needs: [], complications: [], payoff: ["people"] } as never;
    const d = projectDone(t, project, t.facing!.moment);
    expect(d.trip.people![p.id]!.attitude).toBe("close");
    expect(d.trip.book!.slips.length).toBe(t.book!.slips.length);
  });
});

describe("one sheet", () => {
  test("the moment in your way takes the trip's supplies and hour, and keeps the stats it throws with", () => {
    const t0 = someone();
    const handed = { ...t0.facing!.moment.sheet.stats, charm: 4 };
    const t = { ...t0, sheet: { ...t0.sheet, supplies: t0.sheet.supplies + 3, hour: t0.sheet.hour + 2 }, facing: { ...t0.facing!, moment: { ...t0.facing!.moment, sheet: { ...t0.facing!.moment.sheet, stats: handed } } } };
    const k = sheetKept(t);
    expect(k.facing!.moment.sheet.supplies).toBe(t.sheet.supplies);
    expect(k.facing!.moment.sheet.hour).toBe(t.sheet.hour);
    expect(k.facing!.moment.sheet.stats.charm).toBe(4);
  });
});

describe("a hunch about a lie", () => {
  /** A trip at the stop of someone who lies, with a sharp Sense. */
  const liar = (): { t: Trip; stop: Adventure["stops"][number] } | null => {
    for (const family of FAMILIES)
      for (const seed of ["a", "b", "c", "d"]) {
        const a = built(family, seed);
        const stop = a.stops.find((s) => s.person?.lie && waysThrough(a).some((p) => p.includes(s.id)));
        const t = stop ? at(a, seed, stop.id) : null;
        if (t && stop) return { t: { ...t, sheet: { ...t.sheet, stats: { ...t.sheet.stats, sense: 4 } } }, stop };
      }
    return null;
  };

  test("a lie given up once you are past them is flagged, as it would be told to your face", () => {
    const l = liar();
    expect(l).not.toBeNull();
    const { t, stop } = l!;
    const lie = stop.person!.lie!.clue;
    const w = worldPast(t, stop, true);
    const slip = w.trip.book!.slips.find((s) => s.clue === lie);
    expect(slip?.state).toBe("doubted");
  });

  test("a slip only heard is marked by a hunch that comes later", () => {
    const book = { slips: [{ clue: "x", state: "heard" as const }], mapped: [] } as never;
    const g = getClue(book, { id: "x", key: 0, text: "x" } as never, "heard", true);
    expect(g.slip.state).toBe("doubted");
  });
});

describe("the world kit", () => {
  test("a card set in Hell gets Hell's era and foes, not kingdoms and towers", async () => {
    const { kitFor } = await import("../src/game/session.js");
    const hell: CardInfo = { name: "Harrowmere", world: true, description: "Harrowmere is a city in the third circle of Hell, where devils keep the damned to their pacts and imps run the brimstone mills. Magic is a spell bought with souls." };
    const k = kitFor(hell, false, undefined);
    expect(k.era).toContain("Hell");
    expect(k.wants).toContain("your soul");
    expect(k.hurts).toContain("holy");
    // A demon said once in a plain fantasy is still a plain fantasy.
    const elf: CardInfo = { name: "Ilsa", description: "Ilsa is an elf mage who studies spells in a wizard's tower and once fought a demon." };
    expect(kitFor(elf, false, undefined).era).toContain("kingdoms");
  });

  test("a ship among the stars does not make a card of an older age", async () => {
    const { modernCard } = await import("../src/game/build.js");
    const ship: CardInfo = { name: "Vex", description: "Vex flies a starship between planets of the galaxy. She carries a pistol, checks her phone and drinks in a neon bar downtown." };
    expect(modernCard(ship)).toBe(true);
  });
});

describe("content set at the table", () => {
  test("each setting is read in its own part of the line", async () => {
    const { contentFromLine, DEFAULT_CONTENT, crossesLine } = await import("../src/engine/content.js");
    expect(contentFromLine("Heat on, no limits", DEFAULT_CONTENT)?.heat).toBe(true);
    expect(contentFromLine("No heat please", DEFAULT_CONTENT)?.heat).toBe(false);
    const both = contentFromLine("heat on, but no dark stuff", { ...DEFAULT_CONTENT, dark: true })!;
    expect(both.heat).toBe(true);
    expect(both.dark).toBe(false);
    // A line drawn on a word is crossed by the word, not by a longer word that starts with it.
    const s = { ...DEFAULT_CONTENT, lines: ["cat"] };
    expect(crossesLine("The category was wrong.", s)).toBe(false);
    expect(crossesLine("Two cats watch.", s)).toBe(true);
  });

  test("a story named in the same line as a setting is still read", () => {
    const offered = [...FAMILIES];
    const line = "Heat on, and let's do a heist where we rob the duke's vault";
    expect(storyRead(line, offered, false)).not.toBeNull();
  });
});

describe("a rest", () => {
  test("is offered when your store is spent, though you are not hurt, and says so", async () => {
    const { weary } = await import("../src/engine/adventure.js");
    const { campAsk } = await import("../src/engine/tell-adventure.js");
    const t0 = someone();
    const full = { ...t0, facing: null, sheet: { ...t0.sheet, health: 5 } } as Trip;
    expect(weary({ ...full, sheet: { ...full.sheet, store: 99 } })).toBe(false);
    const spent = { ...full, sheet: { ...full.sheet, store: 0 } };
    expect(weary(spent)).toBe(true);
    expect(campAsk(spent)).toContain("0 of");
  });
});
