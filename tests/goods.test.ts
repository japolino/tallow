/**
 * Goods (src/engine/goods.ts, src/game/systems/goods.ts): worth, buying and selling, merchants, making things, and
 * above all that nothing settled here is counted twice by the turn's own read-back.
 */
import { describe, expect, test } from "bun:test";
import {
  affordable, alike, buyPrice, buyShare, capQuality, finestForSale, haggled, inCoins, intoStock, madeQty, madeQuality, madeStep, nice, purseFor,
  qualityFactor, restock, RESTOCK_MINUTES, sellPrice, sellShare, worthRef, type Merchant,
} from "../src/engine/goods.js";
import { attributesFrom, meet, newRun, stateOf, take, type Outcome, type Run } from "../src/engine/run.js";
import type { Message, Role } from "../src/game/ask.js";
import { turn } from "../src/game/runturn.js";
import type { Readback, RunDeps, Settling, Told } from "../src/game/system.js";
import { goods, goodsOf, readPlan, readStock, type GoodsState, type Plan, type Result } from "../src/game/systems/goods.js";

/* ------------------------------------------------- the numbers ------------------------------------------------- */

describe("worth", () => {
  test("quality raises worth in order, and the original's tiers hold from rare up", () => {
    const qs = ["trash", "mundane", "common", "uncommon", "rare", "epic", "legendary"] as const;
    const f = qs.map((q) => qualityFactor(q));
    for (let i = 1; i < f.length; i++) expect(f[i]!).toBeGreaterThan(f[i - 1]!);
    expect(qualityFactor("common")).toBe(1);
    expect(qualityFactor("rare")).toBeCloseTo(Math.pow(2, 0.6));
    expect(qualityFactor("legendary")).toBeCloseTo(Math.pow(4, 0.6));
  });
  test("kind sets the rung; precious things are worth three and a half times as much", () => {
    expect(worthRef({ kind: 2, precious: false }, "common")).toBe(5);
    expect(worthRef({ kind: 2, precious: true }, "common")).toBe(17.5);
    expect(worthRef({ kind: 4, precious: false }, "common")).toBeGreaterThan(worthRef({ kind: 3, precious: false }, "legendary"));
  });
  test("prices are whole, two figures once big, never below one coin", () => {
    expect(nice(4.4)).toBe(4);
    expect(nice(187)).toBe(190);
    expect(nice(1234)).toBe(1200);
    expect(nice(0)).toBe(0);
    expect(inCoins(5, 5)).toBe(1); // a loaf in a world of coins worth a pair of boots still costs a coin
    expect(inCoins(5, 3)).toBe(5);
    expect(inCoins(5, 1)).toBe(500);
  });
});

describe("buying and selling", () => {
  test("the original's price shares: twice the worth to buy and a sixth to sell at no charisma, closing as charisma and liking grow", () => {
    expect(buyShare(0, 0)).toBeCloseTo(2);
    expect(sellShare(0, 0)).toBeCloseTo((5 / 6) * 0.2);
    expect(buyShare(10, 0)).toBeLessThan(buyShare(4, 0));
    expect(sellShare(10, 0)).toBeGreaterThan(sellShare(4, 0));
    // A seller who likes you counts five points of charisma a step; one who dislikes you counts nothing against it.
    expect(buyShare(4, 2)).toBeCloseTo(buyShare(14, 0));
    expect(buyShare(4, -3)).toBeCloseTo(buyShare(4, 0));
  });
  test("selling never fetches as much as buying back, and a worthless thing fetches nothing", () => {
    for (const ref of [1, 5, 25, 120, 600]) for (const c of [2, 6, 12, 30, 60, 120]) expect(sellPrice(ref, 3, c, 3, 3)).toBeLessThan(buyPrice(ref, 3, c, 3, 3) + 1);
    expect(sellPrice(1, 3, 2, 0)).toBe(0);
    expect(sellPrice(1, 1, 2, 0)).toBeGreaterThan(0);
  });
  test("a haggle moves the price within a bounded band, and only when rolled", () => {
    expect(haggled("buy", null)).toBe(1);
    expect(haggled("buy", 3)).toBe(0.75);
    expect(haggled("buy", -3)).toBe(1.2);
    expect(haggled("sell", 3)).toBe(1.3);
    for (const o of [-3, -2, -1, 0, 1, 2, 3] as Outcome[]) {
      expect(haggled("buy", o)).toBeGreaterThanOrEqual(0.75);
      expect(haggled("buy", o)).toBeLessThanOrEqual(1.2);
    }
    expect(buyPrice(120, 3, 4, 0, 3)).toBeLessThan(buyPrice(120, 3, 4, 0));
  });
  test("how many can be paid for is whole and never below none", () => {
    expect(affordable(10, 3)).toBe(3);
    expect(affordable(0, 3)).toBe(0);
    expect(affordable(10, 0)).toBe(0);
  });
});

describe("merchants", () => {
  test("ordinary sellers keep to uncommon; the finest things are not for a beginner, and legendary never for sale", () => {
    expect(finestForSale(false, 20)).toBe("uncommon");
    expect(finestForSale(true, 1)).toBe("rare");
    expect(finestForSale(true, 12)).toBe("epic");
    expect(capQuality("legendary", finestForSale(true, 20))).toBe("epic");
    expect(capQuality("mundane", "uncommon")).toBe("mundane");
  });
  test("restocked after eight hours of the story, not before; things sold to them join their wares", () => {
    const m: Merchant = { name: "Baker", special: false, wares: [{ name: "Bread", text: "", quality: "common", qty: 0, stocked: 6, kind: 2, precious: false }], purse: 3, full: 50, stockedAt: 100 };
    expect(restock(m, 100 + RESTOCK_MINUTES - 1)).toBe(false);
    expect(m.wares[0]!.qty).toBe(0);
    expect(restock(m, 100 + RESTOCK_MINUTES)).toBe(true);
    expect(m.wares[0]!.qty).toBe(6);
    expect(m.purse).toBe(50);
    intoStock(m, { name: "bread", text: "", quality: "common", qty: 2, kind: 2, precious: false });
    intoStock(m, { name: "Old boots", text: "", quality: "mundane", qty: 1, kind: 4, precious: false });
    expect(m.wares.map((w) => [w.name, w.qty])).toEqual([["Bread", 8], ["Old boots", 1]]);
  });
  test("a purse comes from the run's own dice: a merchant's is large, anyone else's small", () => {
    const r = newRun(3, "", "", "Jay");
    const a = purseFor(r, true, 3), b = purseFor(r, false, 3);
    expect(a).toBeGreaterThanOrEqual(1500);
    expect(a).toBeLessThanOrEqual(15000);
    expect(b).toBeLessThanOrEqual(200);
    const again = newRun(3, "", "", "Jay");
    expect(purseFor(again, true, 3)).toBe(a);
  });
  test("names that plainly mean the same thing match; different things that share a word do not", () => {
    expect(alike("loaf of bread", "Bread loaf")).toBe(true);
    expect(alike("Rope", "coil of rope")).toBe(true);
    expect(alike("Healing potions", "potion of healing")).toBe(true);
    expect(alike("Iron sword", "Iron helmet")).toBe(false);
    expect(alike("Apple", "Pear")).toBe(false);
  });
});

describe("making things", () => {
  test("plausibility picks the result; a fine roll carries a stretch, a poor one falls back; nothing makes the implausible work", () => {
    expect(madeStep("plausible", null, false)).toBe(0);
    expect(madeStep("barely", null, false)).toBe(1);
    expect(madeStep("implausible", null, false)).toBe(2);
    expect(madeStep("barely", 2, false)).toBe(0);
    expect(madeStep("implausible", 3, false)).toBe(2);
    expect(madeStep("plausible", -1, false)).toBe(1);
    expect(madeStep("barely", -3, false)).toBe(2);
    expect(madeStep("plausible", 3, true)).toBe(2);
  });
  test("quality comes from what goes in: one thing keeps its own, three alike make one step better, and the roll moves it", () => {
    const r = newRun(5, "", "", "Jay");
    expect(madeQuality(r, ["uncommon"], null)).toBe("uncommon");
    expect(madeQuality(r, ["common", "common", "common"], null)).toBe("uncommon");
    expect(madeQuality(r, ["uncommon"], 3)).toBe("rare");
    expect(madeQuality(r, ["uncommon"], -1)).toBe("common");
    expect(madeQuality(r, ["common"], -3)).toBe("trash");
    expect(madeQuality(r, [], null)).toBe("mundane");
    // Plain things together stay plain (a branch and a stone do not make a common thing), and a poor turn spoils them.
    expect(madeQuality(r, ["mundane", "mundane"], null)).toBe("mundane");
    expect(madeQuality(r, ["mundane", "mundane"], -1)).toBe("trash");
    // However many go in, never more than a step above the best of them.
    expect(madeQuality(r, Array(30).fill("common"), null)).toBe("uncommon");
    // Three rare things would make an epic one, but only from a turn that went well.
    expect(madeQuality(r, ["rare", "rare", "rare"], 1)).toBe("epic");
    expect(madeQuality(r, ["rare", "rare", "rare"], 0)).toBe("rare");
  });
  test("how many are made is whole and bounded", () => {
    expect(madeQty(0, 1)).toBe(1);
    expect(madeQty(50, 1)).toBe(5);
    expect(madeQty(50, 10)).toBe(20);
    expect(madeQty(3, 2)).toBe(3);
  });
});

/* ------------------------------------------------- the hooks ------------------------------------------------- */

const start = (): Run => {
  const r = newRun(7, "A small kingdom of farms and markets.", "a clerk", "Jay");
  r.sheet.attributes = attributesFrom(["charisma"]);
  r.sheet.money = 40;
  r.sheet.coin = "silver";
  r.opening = "The market is busy.";
  r.place = { name: "Market square", text: "" };
  meet(r, { name: "Baker", text: "Sells bread from a stall." });
  meet(r, { name: "Guard", text: "Watches the square." });
  take(r.sheet, { name: "Wolf pelt", quality: "common", qty: 3 });
  take(r.sheet, { name: "Plank", quality: "common", qty: 2 });
  stateOf<Partial<GoodsState>>(r, "goods", () => ({ coin: 3 }));
  return r;
};

const settling = (over: Partial<Settling> = {}): Settling => ({ line: "", kind: "action", act: "buy", verdict: "trivial", target: null, item: null, ability: null, attribute: "charisma", skill: "", roll: null, outcome: null, ...over });
const plan = (over: Partial<Plan>): Plan => ({ deal: "none", done: false, haggle: false, with: null, seller: false, goods: [], sum: null, size: null, make: null, coin: null, stock: null, ...over });
const back = (over: Partial<Readback> = {}): Readback => ({ renamed: [], fresh: [], hp: [], feelings: [], follows: [], hostile: [], calmed: [], gone: [], beaten: [], dead: [], found: [], lost: [], money: 0, ability: null, xp: 0, place: null, minutes: 1, ...over });
const told = (r: Run, t: Settling): Told => ({ ...t, before: r, story: "", core: null, minutes: 0 });
const BREAD = { name: "Bread", qty: 2, kind: 2, precious: false, quality: "common" as const, service: false };
const STOCK = { special: false, wares: [{ name: "Bread", text: "A round loaf.", quality: "common" as const, qty: 5, stocked: 5, kind: 2, precious: false }, { name: "Honey cake", text: "Sweet.", quality: "uncommon" as const, qty: 2, stocked: 2, kind: 2, precious: false }] };

describe("settling a deal", () => {
  test("a purchase is priced by code, paid for, and struck from a read-back that reports it again", () => {
    const r = start();
    const t = settling();
    const facts = goods.settle!(r, t, plan({ deal: "buy", with: "Baker", seller: true, goods: [BREAD], stock: STOCK }));
    const m = goodsOf(r).merchants[0]!;
    const unit = buyPrice(5, 3, r.sheet.attributes.charisma, 0);
    expect(r.sheet.money).toBe(40 - unit * 2);
    expect(r.sheet.items.find((i) => i.name === "Bread")!.qty).toBe(2);
    expect(m.wares[0]!.qty).toBe(3);
    expect(facts[0]).toContain(`for ${unit * 2} silver`);
    // The turn's own read-back reports the same purchase: it is struck, so nothing is gained or paid twice.
    const b = back({ found: [{ name: "loaf of bread", text: "", quality: "common", qty: 2 }, { name: "Lost glove", text: "", quality: "common", qty: 1 }], money: -unit * 2 });
    goods.amend!(r, b, told(r, t), null);
    expect(b.found.map((f) => f.name)).toEqual(["Lost glove"]);
    expect(b.money).toBe(0);
    expect(goods.apply!(r, null, told(r, t), null)).toEqual(expect.arrayContaining([`Bought: 2 × Bread for ${unit * 2} silver.`]));
  });

  test("a much larger sum in the read-back keeps only what is beyond the settled one; an unrelated gain is left alone", () => {
    const r = start();
    goods.settle!(r, settling(), plan({ deal: "buy", with: "Baker", goods: [BREAD] }));
    const paid = -goodsOf(r).last!.money;
    expect(paid).toBeGreaterThan(0);
    const b = back({ money: -(paid * 3) });
    goods.amend!(r, b, told(r, settling()), null);
    expect(b.money).toBe(-(paid * 2));
    const c = back({ money: 15 });
    goods.amend!(r, c, told(r, settling()), null);
    expect(c.money).toBe(15);
  });

  test("an attempt the character cannot afford moves nothing, and the story cannot hand it over anyway", () => {
    const r = start();
    r.sheet.money = 1;
    const facts = goods.settle!(r, settling(), plan({ deal: "buy", with: "Baker", goods: [{ ...BREAD, qty: 5, kind: 4 }] }));
    expect(facts[0]).toContain("cannot afford");
    expect(r.sheet.money).toBe(1);
    expect(r.sheet.items.some((i) => i.name === "Bread")).toBe(false);
    const b = back({ found: [{ name: "Bread", text: "", quality: "common", qty: 5 }], money: -1 });
    goods.amend!(r, b, told(r, settling()), null);
    expect(b.found).toEqual([]);
    expect(b.money).toBe(0);
  });

  test("a purchase written as done is followed: fewer if fewer can be paid for, else on credit or for a favour, and money never goes below zero", () => {
    const r = start();
    const unit = buyPrice(5, 3, r.sheet.attributes.charisma, 0);
    r.sheet.money = unit * 2 + 1;
    goods.settle!(r, settling({ kind: "story", verdict: null }), plan({ deal: "buy", done: true, goods: [{ ...BREAD, qty: 9 }] }));
    expect(r.sheet.items.find((i) => i.name === "Bread")!.qty).toBe(2);
    expect(r.sheet.money).toBe(1);
    expect(goodsOf(r).debts).toEqual([]);
    const q = start();
    q.sheet.money = 10;
    const facts = goods.settle!(q, settling({ kind: "story", verdict: null }), plan({ deal: "buy", done: true, with: "Baker", goods: [{ name: "Ox", qty: 1, kind: 6, precious: false, quality: "common", service: false }] }));
    expect(q.sheet.money).toBe(0);
    expect(q.sheet.items.some((i) => i.name === "Ox")).toBe(true);
    expect(goodsOf(q).debts).toEqual([{ to: "Baker", amount: buyPrice(5000, 3, q.sheet.attributes.charisma, 0) - 10, favour: true }]);
    expect(facts[0]).toContain("favour");
    // Written as done with a seller who is elsewhere now: the debt is to them, and their stock is what was sold.
    const e = start();
    e.sheet.money = 0;
    goods.settle!(e, settling(), plan({ deal: "browse", with: "Baker", seller: true, stock: STOCK }));
    e.people[0]!.here = false;
    goods.settle!(e, settling({ verdict: "implausible" }), plan({ deal: "buy", done: true, with: "Baker", goods: [{ ...BREAD, qty: 1 }] }));
    expect(goodsOf(e).debts[0]!.to).toBe("Baker");
    expect(goodsOf(e).merchants[0]!.wares[0]!.qty).toBe(4);
  });

  test("a sale moves the thing and the coins once, within what the buyer can pay", () => {
    const r = start();
    const t = settling();
    goods.settle!(r, t, plan({ deal: "sell", with: "Baker", seller: true, goods: [{ name: "Wolf pelt", qty: 2, kind: 3, precious: false, quality: "common", service: false }], stock: STOCK }));
    const unit = sellPrice(25, 3, r.sheet.attributes.charisma, 0);
    expect(r.sheet.money).toBe(40 + unit * 2);
    expect(r.sheet.items.find((i) => i.name === "Wolf pelt")!.qty).toBe(1);
    expect(goodsOf(r).merchants[0]!.wares.find((w) => w.name === "Wolf pelt")!.qty).toBe(2);
    const b = back({ lost: [{ name: "Wolf pelts", qty: 2 }], money: unit * 2 });
    goods.amend!(r, b, told(r, t), null);
    expect(b.lost).toEqual([]);
    expect(b.money).toBe(0);
    // Someone who is not a merchant has only a little on hand.
    const q = start();
    goodsOf(q);
    stateOf<GoodsState>(q, "goods", () => ({}) as GoodsState).purses = { guard: 0 };
    const facts = goods.settle!(q, settling(), plan({ deal: "sell", with: "Guard", goods: [{ name: "Wolf pelt", qty: 1, kind: 3, precious: false, quality: "common", service: false }] }));
    expect(facts[0]).toContain("cannot afford");
    expect(q.sheet.money).toBe(40);
  });

  test("a rolled haggle moves the price; an unrolled one does not", () => {
    const a = start(), b = start();
    a.sheet.money = b.sheet.money = 1000;
    goods.settle!(a, settling({ verdict: "challenge", outcome: 3 }), plan({ deal: "buy", haggle: true, goods: [{ ...BREAD, kind: 4, qty: 1 }] }));
    goods.settle!(b, settling(), plan({ deal: "buy", haggle: true, goods: [{ ...BREAD, kind: 4, qty: 1 }] }));
    expect(1000 - b.sheet.money).toBe(buyPrice(120, 3, b.sheet.attributes.charisma, 0));
    expect(1000 - a.sheet.money).toBeLessThan(1000 - b.sheet.money);
    expect(goodsOf(a).last!.told[0]).toContain("haggled down");
  });

  test("an impossible attempt, a hostile seller, or one who dislikes the character changes no hands", () => {
    const r = start();
    expect(goods.settle!(r, settling({ verdict: "implausible" }), plan({ deal: "buy", goods: [BREAD] }))).toEqual([]);
    r.people[0]!.hostile = true;
    expect(goods.settle!(r, settling(), plan({ deal: "buy", with: "Baker", goods: [BREAD] }))[0]).toContain("will not deal");
    r.people[0]!.hostile = false;
    r.people[0]!.feeling = -50;
    expect(goods.settle!(r, settling(), plan({ deal: "buy", with: "Baker", goods: [BREAD] }))[0]).toContain("will not deal");
    expect(r.sheet.money).toBe(40);
  });

  test("paying hands over the sum named, pays down a debt, and never more than the character has", () => {
    const r = start();
    goodsOf(r);
    stateOf<GoodsState>(r, "goods", () => ({}) as GoodsState).debts = [{ to: "Baker", amount: 12, favour: false }];
    goods.settle!(r, settling(), plan({ deal: "pay", with: "Baker" }));
    expect(r.sheet.money).toBe(28);
    expect(goodsOf(r).debts).toEqual([]);
    const facts = goods.settle!(r, settling(), plan({ deal: "pay", with: "Guard", sum: 500 }));
    expect(facts[0]).toContain("only 28");
    expect(r.sheet.money).toBe(28);
    goods.settle!(r, settling({ kind: "story", verdict: null }), plan({ deal: "pay", done: true, with: "Guard", sum: 500 }));
    expect(r.sheet.money).toBe(0);
  });
});

describe("making", () => {
  const making = (plausibility: "plausible" | "barely" | "implausible") => ({
    from: [{ name: "Plank", qty: 2 }],
    want: "a longsword",
    tool: "a knife",
    plausibility,
    results: [
      { name: "Longsword", text: "A sword.", qty: 1, kind: 4, precious: false },
      { name: "Wooden sword", text: "A practice sword.", qty: 1, kind: 3, precious: false },
      { name: "Wooden club", text: "A heavy club.", qty: 9, kind: 2, precious: false },
    ] as [Result, Result, Result],
  });

  test("the result falls back toward what the materials allow; the materials are used up; nothing is counted twice", () => {
    const r = start();
    const t = settling({ verdict: "challenge", outcome: 1 });
    const facts = goods.settle!(r, t, plan({ deal: "make", make: making("barely") }));
    expect(r.sheet.items.some((i) => i.name === "Plank")).toBe(false);
    // One kind of material keeps its own quality, however many of it go in: two common planks make a common thing.
    expect(r.sheet.items.find((i) => i.name === "Wooden sword")!.quality).toBe("common");
    expect(facts[0]).toContain("not quite a longsword");
    const b = back({ found: [{ name: "wooden sword", text: "", quality: "rare", qty: 1 }], lost: [{ name: "Plank", qty: 2 }] });
    goods.amend!(r, b, told(r, t), null);
    expect(b.found).toEqual([]);
    expect(b.lost).toEqual([]);
  });

  test("a making the judge finds impossible still makes the loosest thing, bounded in number; one lacking something needed makes nothing", () => {
    const r = start();
    goods.settle!(r, settling({ verdict: "implausible" }), plan({ deal: "make", make: making("plausible") }));
    expect(r.sheet.items.find((i) => i.name === "Wooden club")!.qty).toBe(9);
    // A fallback that is the very thing asked for is told as made, only poorer.
    const same = start();
    const twice = making("plausible");
    twice.results[1] = { ...twice.results[0] };
    const told = goods.settle!(same, settling({ verdict: "challenge", outcome: -2 }), plan({ deal: "make", make: twice }));
    expect(told[0]).toContain("Jay makes Longsword");
    expect(told[0]).not.toContain("not quite");
    const q = start();
    expect(goods.settle!(q, settling({ verdict: "missing" }), plan({ deal: "make", make: making("plausible") }))).toEqual([]);
    expect(q.sheet.items.find((i) => i.name === "Plank")!.qty).toBe(2);
  });
});

describe("reading the line", () => {
  const st = (): GoodsState => goodsOf(start());
  test("no deal is the default answer, and a coin asked for is taken", () => {
    const r = start();
    const g = goodsOf(r);
    g.coin = null;
    expect(readPlan(r, g, { deal: "none", coin: 4 })).toMatchObject({ deal: "none", coin: 4 });
    expect(readPlan(r, st(), { deal: "maybe" })).toBeNull();
  });
  test("a sale of a thing not carried does not check; a buy keeps only whole entries; a stranger is nobody", () => {
    const r = start();
    // Selling only what they do not carry is a sound answer with nothing in it: no deal, and no asking again.
    expect(readPlan(r, st(), { deal: "sell", goods: [{ name: "Dragon egg", qty: 1, kind: 7 }] })).toMatchObject({ deal: "none", goods: [] });
    expect(readPlan(r, st(), { deal: "sell", goods: [{ name: "<a thing>", qty: 1, kind: 7 }] })).toBeNull();
    // Someone not here is nobody for a deal done now, but is who a deal written as done was with.
    r.people[0]!.here = false;
    expect(readPlan(r, st(), { deal: "buy", with: "Baker", goods: [{ name: "Bread", qty: 1, kind: 2 }] })!.with).toBeNull();
    expect(readPlan(r, st(), { deal: "buy", done: true, with: "Baker", goods: [{ name: "Bread", qty: 1, kind: 2 }] })!.with).toBe("Baker");
    r.people[0]!.here = true;
    const p = readPlan(r, st(), { deal: "sell", with: "Nobody here", goods: [{ name: "wolf pelt", qty: 40, kind: 3 }] })!;
    expect(p.goods[0]).toMatchObject({ name: "Wolf pelt", qty: 3 });
    expect(p.with).toBeNull();
    const b = readPlan(r, st(), { deal: "buy", with: "Baker", sells_for_a_living: true, goods: [{ name: "Bread", qty: 2.6, kind: 2 }, { name: "<the thing>", qty: 1, kind: 2 }, { name: "Cake", qty: 1, kind: 99 }] })!;
    expect(b.goods.map((g) => [g.name, g.qty])).toEqual([["Bread", 3]]);
    expect(b.seller).toBe(true);
  });
  test("a making needs all three results and a plausibility, or it does not check", () => {
    const r = start();
    const one = { name: "Club", text: "x", qty: 1, kind: 2 };
    expect(readPlan(r, st(), { deal: "make", make: { from: [{ name: "Plank", qty: 1 }], plausibility: "barely", named: one, near: one } })).toBeNull();
    expect(readPlan(r, st(), { deal: "make", make: { from: [{ name: "Plank", qty: 1 }], plausibility: "barely", named: one, near: one, loose: one } })!.make!.results).toHaveLength(3);
  });
  test("a seller's stock is held to ordinary quality unless they are special, and needs at least two wares", () => {
    const r = start();
    const s = readStock(r, { special: false, wares: [{ name: "Crown of ages", quality: "legendary", qty: 50, kind: 7 }, { name: "Bread", quality: "common", qty: 3, kind: 2 }, { name: "bread", qty: 1, kind: 2 }] })!;
    expect(s.wares.map((w) => [w.name, w.quality, w.qty])).toEqual([["Crown of ages", "uncommon", 20], ["Bread", "common", 3]]);
    expect(readStock(r, { special: false, wares: [{ name: "Bread", kind: 2 }] })).toBeNull();
  });
});

describe("the table and the sheet", () => {
  test("a merchant here lays out wares as cards whose prices hold still between turns; nothing is made in a run that has no state", () => {
    const r = start();
    goods.settle!(r, settling(), plan({ deal: "browse", with: "Baker", seller: true, stock: STOCK }));
    const a = goods.shows!(r), b = goods.shows!(r);
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ kind: "card", line: "I buy the bread from Baker." });
    expect(goods.scene!(r).join("\n")).toContain("Baker sells things here");
    expect(goods.pages!(r).map((p) => p.heading)).toContain("Baker's wares");
    r.people[0]!.here = false;
    expect(goods.shows!(r)).toEqual([]);
    const old = newRun(1, "", "", "Jay");
    goods.scene!(old);
    goods.pages!(old);
    goods.shows!(old);
    expect(old.sys).toBeUndefined();
  });

  test("asking what a thing costs gets code's price, from the seller's own wares when they have it", () => {
    const r = start();
    goods.settle!(r, settling(), plan({ deal: "browse", with: "Baker", seller: true, stock: STOCK }));
    const facts = goods.settle!(r, settling(), plan({ deal: "browse", with: "Baker", goods: [{ ...BREAD, qty: 1 }, { name: "Horse", qty: 1, kind: 6, precious: false, quality: "legendary", service: false }] }));
    expect(facts[0]).toContain(`Bread: about ${buyPrice(5, 3, r.sheet.attributes.charisma, 0)} silver`);
    // Asked of an ordinary seller, even a legendary horse is priced as the best they could sell.
    expect(facts[0]).toContain(`Horse: about ${buyPrice(worthRef({ kind: 6, precious: false }, "uncommon"), 3, r.sheet.attributes.charisma, 0)} silver`);
    expect(r.sheet.money).toBe(40);
    expect(readPlan(r, goodsOf(r), { deal: "browse", with: "Baker" })).toMatchObject({ deal: "browse", goods: [] });
  });
});

/* ------------------------------------------------- a whole turn ------------------------------------------------- */

describe("a whole turn", () => {
  const JUDGE = { kind: "action", act: "buy two loaves from the baker", target: "Baker", item: null, item_named: false, needs_item: null, ability: null, ability_named: false, verdict: "trivial", reason: "A plain purchase.", attribute: "charisma", skill: "Haggling", for: [], against: [], scores: { physical: 3, likelihood: 1 } };
  function deps(backAnswer: unknown, planAnswer: unknown): RunDeps & { asked: string[] } {
    const asked: string[] = [];
    return {
      asked,
      systems: [goods],
      ask: async (messages: Message[], role: Role) => {
        const sys = messages[0]!.content;
        if (role === "teller") return "The baker wraps two loaves and takes your silver.";
        if (sys.includes("referee")) return JSON.stringify(JUDGE);
        if (sys.includes("records")) return JSON.stringify(backAnswer);
        if (sys.includes("stock the sellers")) return (asked.push("stock"), JSON.stringify({ special: false, wares: STOCK.wares }));
        if (sys.includes("say what kind of thing")) return (asked.push("kinds"), JSON.stringify({ things: [{ name: "Copper ring", kind: 3, precious: true }] }));
        if (sys.includes("trade ledger")) return (asked.push("plan"), JSON.stringify(planAnswer));
        return "A summary of what has happened so far, long enough to be kept as one.";
      },
    };
  }

  test("buying with the read-back reporting the same loaves and silver: paid once, gained once, and the storyteller is told the price", async () => {
    const r = start();
    const d = deps({ found: [{ name: "Bread", text: "", quality: "common", qty: 2 }, { name: "Copper ring", text: "Found in the change.", quality: "common", qty: 1 }], money: -9, minutes: 3 }, { deal: "buy", done: false, with: "Baker", sells_for_a_living: true, goods: [{ name: "Bread", qty: 2, kind: 2, quality: "common" }] });
    const t = await turn(d, r, "I buy two loaves from the baker.");
    const unit = buyPrice(5, 3, r.sheet.attributes.charisma, 0);
    expect(t.run.sheet.money).toBe(40 - unit * 2);
    expect(t.run.sheet.items.find((i) => i.name === "Bread")!.qty).toBe(2);
    expect(t.run.sheet.items.some((i) => i.name === "Copper ring")).toBe(true);
    expect(d.asked).toEqual(["plan", "stock", "kinds"]);
    expect(goodsOf(t.run).kinds["copper ring"]).toEqual({ kind: 3, precious: true });
    expect(t.report.changes).toEqual(expect.arrayContaining([`Bought: 2 × Bread for ${unit * 2} silver.`]));
    // The run given is untouched.
    expect(r.sheet.money).toBe(40);
    expect(goodsOf(r).merchants).toEqual([]);
  });

  test("a line with no deal changes nothing of this system", async () => {
    const r = start();
    const d = deps({ minutes: 2 }, { deal: "none" });
    const t = await turn(d, r, "I look around the square.");
    expect(t.run.sheet.money).toBe(40);
    expect(goodsOf(t.run).last).toBeNull();
    expect(d.asked).toEqual(["plan"]);
  });
});

describe("the purse a run begins with", () => {
  test("is made to fit what the coin buys, and nothing stays nothing", async () => {
    const { startingMoney } = await import("../src/engine/goods.js");
    // A coin like a dime: twenty of them would not buy a loaf, so the purse is about a week of plain food.
    expect(startingMoney(20, 2)).toBe(600);
    expect(startingMoney(900, 2)).toBe(900);
    // A coin worth a month's wages: a purse of hundreds is brought down to about a horse.
    expect(startingMoney(400, 6)).toBe(5);
    expect(startingMoney(0, 2)).toBe(0);
  });
});
