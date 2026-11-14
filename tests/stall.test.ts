/**
 * The seller's cloth (src/game/systems/goods.ts, stallShows; room/props/stall.ts shows it) and putting things on and
 * taking them off through the turn's read-back (src/game/runturn.ts, apply).
 */
import { describe, expect, test } from "bun:test";
import { buyPrice, RESTOCK_MINUTES, worthRef } from "../src/engine/goods.js";
import { attributesFrom, meet, newRun, stateOf, take, type Run } from "../src/engine/run.js";
import { apply, readReadback } from "../src/game/runturn.js";
import type { Readback, Settling, Show } from "../src/game/system.js";
import { goods, goodsOf, PACK_LESSON, readPlan, readStock, STALL_LESSON, STALL_WORDS, stallShows, type GoodsState, type Plan } from "../src/game/systems/goods.js";

const start = (): Run => {
  const r = newRun(7, "A small kingdom of farms and markets.", "a clerk", "Jay");
  r.sheet.attributes = attributesFrom(["charisma"]);
  r.sheet.money = 40;
  r.sheet.coin = "silver";
  r.place = { name: "Market square", text: "" };
  meet(r, { name: "Baker", text: "Sells bread from a stall." });
  take(r.sheet, { name: "Wolf pelt", quality: "common", qty: 3 });
  stateOf<Partial<GoodsState>>(r, "goods", () => ({ coin: 3 }));
  return r;
};
const settling = (over: Partial<Settling> = {}): Settling => ({ line: "", kind: "action", act: "", verdict: "trivial", target: null, item: null, ability: null, attribute: "charisma", skill: "", roll: null, outcome: null, ...over });
const plan = (over: Partial<Plan>): Plan => ({ deal: "none", done: false, haggle: false, with: null, seller: false, goods: [], sum: null, size: null, make: null, coin: null, stock: null, ...over });
const STOCK = {
  special: false,
  wares: [
    { name: "Bread", text: "A round loaf.", quality: "common" as const, qty: 5, stocked: 5, kind: 2, precious: false },
    { name: "Honey cake", text: "Sweet.", quality: "uncommon" as const, qty: 1, stocked: 1, kind: 2, precious: false },
    { name: "Fine saddle", text: "Tooled leather.", quality: "common" as const, qty: 1, stocked: 1, kind: 5, precious: false },
  ],
};
const withBaker = (): Run => {
  const r = start();
  goods.settle!(r, settling(), plan({ deal: "browse", with: "Baker", seller: true, stock: STOCK }));
  return r;
};
const back = (over: Partial<Readback> = {}): Readback => ({ renamed: [], fresh: [], hp: [], feelings: [], follows: [], hostile: [], calmed: [], gone: [], beaten: [], dead: [], found: [], lost: [], money: 0, ability: null, xp: 0, place: null, minutes: 1, ...over });

describe("the seller's cloth", () => {
  test("one cloth for a seller who will deal: each ware's price is code's, with what the coin pays for", () => {
    const r = withBaker();
    const [s, ...more] = stallShows(r);
    expect(more).toEqual([]);
    expect(s).toMatchObject({ kind: "stall", id: "baker", seller: "Baker", text: "Sells bread from a stall.", coin: "silver", money: 40, purse: goodsOf(r).merchants[0]!.purse });
    const ch = r.sheet.attributes.charisma;
    const bread = buyPrice(worthRef({ kind: 2, precious: false }, "common"), 3, ch, 0);
    const saddle = buyPrice(worthRef({ kind: 5, precious: false }, "common"), 3, ch, 0);
    expect(s!.wares.map((w) => [w.id, w.name, w.quality, w.qty, w.price])).toEqual([
      ["bread", "Bread", "common", 5, bread],
      ["honey cake", "Honey cake", "uncommon", 1, s!.wares[1]!.price],
      ["fine saddle", "Fine saddle", "common", 1, saddle],
    ]);
    expect(s!.wares[0]!.can).toBe(Math.min(5, Math.floor(40 / bread)));
    // A ware the coin does not pay for says so with the numbers, and its lines are offered all the same.
    expect(saddle).toBeGreaterThan(40);
    expect(s!.wares[2]!.can).toBe(0);
    expect(s!.wares[2]!.note).toContain(`You have 40 silver; one costs ${saddle}`);
    expect(s!.wares[2]!.choices.length).toBeGreaterThan(0);
  });

  test("a ware's lines buy one, leave a line to finish with how many where there are several, and haggle; nothing else", () => {
    const [s] = stallShows(withBaker());
    expect(s!.wares[0]!.choices).toEqual([
      { say: "Buy one", line: "I buy the bread from Baker, just one." },
      { say: "Buy several", line: "I buy the bread from Baker, this many: " },
      { say: "Haggle over the price (a poor throw raises it)", line: "I haggle with Baker over the price of the bread, and buy it at whatever price we settle on." },
    ]);
    expect(s!.wares[1]!.choices.map((c) => c.line)).toEqual(["I buy the honey cake from Baker.", STALL_WORDS.haggleLine("honey cake", "Baker")]);
    // How a haggle goes is said in the haggle choice itself, not in the slip's body; the note is the coin alone.
    expect(STALL_WORDS.haggle).toContain("raises");
    for (const w of s!.wares) expect(w.note).not.toMatch(/haggle|throw/i);
    expect([STALL_WORDS.some(40, "silver", s!.wares[0]!.can), STALL_WORDS.have(40, "silver")]).toContain(s!.wares[0]!.note);
  });

  test("the purse and the restock are said in the game's words; a ware bought out leaves the cloth; time brings it back", () => {
    const r = withBaker();
    const [s] = stallShows(r);
    expect(s!.restock).toBe(RESTOCK_MINUTES);
    expect(s!.about).toContain(`Baker has ${s!.purse} silver on hand`);
    expect(s!.about).toContain("in about 8 hours");
    r.sheet.money = 1000;
    goods.settle!(r, settling(), plan({ deal: "buy", with: "Baker", seller: true, goods: [{ name: "Honey cake", qty: 1, kind: 2, precious: false, quality: "uncommon", service: false }] }));
    expect(stallShows(r)[0]!.wares.map((w) => w.name)).toEqual(["Bread", "Fine saddle"]);
    expect(stallShows(r)[0]!.money).toBe(r.sheet.money);
    r.minutes += RESTOCK_MINUTES;
    expect(stallShows(r)[0]!.restock).toBe(0);
    expect(stallShows(r)[0]!.about).toContain("due now");
    goods.apply!(r, null, { ...settling(), before: r, story: "", core: null, minutes: 0 }, null);
    expect(stallShows(r)[0]!.wares.map((w) => w.name)).toEqual(["Bread", "Honey cake", "Fine saddle"]);
  });

  test("no cloth for a seller who is hostile, thinks ill of you, or has gone; none in a run with no state", () => {
    const r = withBaker();
    const baker = r.people.find((p) => p.name === "Baker")!;
    baker.feeling = -50;
    expect(stallShows(r)).toEqual([]);
    baker.feeling = 0;
    baker.hostile = true;
    expect(stallShows(r)).toEqual([]);
    baker.hostile = false;
    baker.here = false;
    expect(stallShows(r)).toEqual([]);
    const bare = newRun(1, "", "", "Jay");
    expect(stallShows(bare)).toEqual([]);
    expect(bare.sys).toBeUndefined();
  });

  test("the cloth is taught when a seller will deal, before the satchel, in the narrator's words", () => {
    expect(goods.teach!(start())).toEqual([PACK_LESSON]);
    expect(goods.teach!(withBaker())).toEqual([STALL_LESSON, PACK_LESSON]);
    expect(STALL_LESSON.key).toBe("stall");
    expect(STALL_LESSON.lines.length).toBeGreaterThanOrEqual(2);
    expect(STALL_LESSON.lines.length).toBeLessThanOrEqual(3);
    for (const line of STALL_LESSON.lines) {
      expect(line).toMatch(/[.!?]$/);
      expect(line).not.toMatch(/click|mouse|keyboard|press|\btap\b|—/i);
    }
    expect(STALL_LESSON.lines.join(" ")).toContain("Touch");
    expect(STALL_LESSON.lines.join(" ")).toContain("haggle");
  });

  test("the goods system shows the satchel and then each cloth", () => {
    const shows: Show[] = goods.shows!(withBaker());
    expect(shows.map((s) => s.kind)).toEqual(["pack", "stall"]);
  });
});

describe("putting on and taking off", () => {
  test("the read-back reports it and code applies it, only to a thing carried, only when it changes", () => {
    const r = start();
    take(r.sheet, { name: "Oilskin cloak", quality: "common", qty: 1 })!.worn = true;
    const b = readReadback({ wear: [{ name: "Wolf pelt", on: true }, { name: "Oilskin cloak", on: false }, { name: "Crown", on: true }, { name: "Wolf pelt" }] });
    expect(b.wear).toEqual([{ name: "Wolf pelt", on: true }, { name: "Oilskin cloak", on: false }, { name: "Crown", on: true }]);
    const told = apply(r, b, null);
    expect(r.sheet.items.find((i) => i.name === "Wolf pelt")!.worn).toBe(true);
    expect(r.sheet.items.find((i) => i.name === "Oilskin cloak")!.worn).toBeUndefined();
    expect(r.sheet.items.some((i) => i.name === "Crown")).toBe(false);
    expect(told).toEqual(expect.arrayContaining(["Now worn: Wolf pelt.", "Taken off: Oilskin cloak."]));
    // Saying again what already is changes nothing and tells nothing.
    expect(apply(r, back({ wear: [{ name: "Wolf pelt", on: true }] }), null).some((t) => t.includes("Wolf pelt"))).toBe(false);
    // A read-back from before the field existed still applies.
    expect(() => apply(r, back(), null)).not.toThrow();
  });
});

describe("what can be worn is said when a thing comes into being", () => {
  test("a seller's stock, a thing bought off it or not, a thing made and a thing found keep the model's word; bread is not wearable", () => {
    const r = start();
    // The stocking model says it, ware by ware; a ware it said nothing about has nothing.
    const stock = readStock(r, { wares: [
      { name: "Wool cloak", text: "Warm.", quality: "common", qty: 2, kind: 4, wearable: true },
      { name: "Brown bread", text: "A loaf.", quality: "common", qty: 5, kind: 1, wearable: false },
      { name: "Rope", text: "Hemp.", quality: "common", qty: 3, kind: 2 },
    ] })!;
    expect(stock.wares.map((w) => w.wearable)).toEqual([true, false, undefined]);
    r.sheet.money = 10000;
    goods.settle!(r, settling(), plan({ deal: "browse", with: "Baker", seller: true, stock }));
    const buy = (name: string, wearable?: boolean) => goods.settle!(r, settling(), plan({ deal: "buy", with: "Baker", seller: true, goods: [{ name, qty: 1, kind: 2, precious: false, quality: "common", service: false, ...(wearable === undefined ? {} : { wearable }) }] }));
    buy("Wool cloak");
    buy("Brown bread");
    buy("Rope");
    // Not among the wares: the buying reader's own word for it.
    buy("Iron dagger", true);
    const item = (n: string) => r.sheet.items.find((i) => i.name === n)!;
    expect([item("Wool cloak").wearable, item("Brown bread").wearable, item("Rope").wearable, item("Iron dagger").wearable]).toEqual([true, false, undefined, true]);
    // The buying reader reads it from its answer.
    const p = readPlan(r, goodsOf(r), { deal: "buy", with: "Baker", goods: [{ name: "Iron dagger", qty: 1, kind: 2, quality: "common", wearable: true }, { name: "Pie", qty: 1, kind: 1, quality: "common" }] })!;
    expect(p.goods.map((g) => g.wearable)).toEqual([true, undefined]);
    // A thing found keeps what the read-back said; one from a read-back that did not say has nothing.
    const b = readReadback({ found: [{ name: "Bronze helm", text: "Dented.", quality: "common", qty: 1, wearable: true }, { name: "Apple", text: "Red.", quality: "common", qty: 1, wearable: false }, { name: "Odd stone", text: "Grey.", quality: "common", qty: 1 }] });
    apply(r, b, null);
    expect([item("Bronze helm").wearable, item("Apple").wearable, item("Odd stone").wearable]).toEqual([true, false, undefined]);
    // The satchel offers putting on only where it was said to be wearable.
    const says = (n: string) => goods.shows!(r).flatMap((x) => (x.kind === "pack" ? x.items : [])).find((i) => i.name === n)!.choices.map((c) => c.say);
    expect(says("Bronze helm")).toContain("Put it on");
    expect(says("Brown bread")).not.toContain("Put it on");
    expect(says("Odd stone")).not.toContain("Put it on");
    // A thing made keeps the making reader's word for what came of it.
    const res = (name: string) => ({ name, text: "Rough.", qty: 1, kind: 2, precious: false, wearable: true });
    goods.settle!(r, settling(), plan({ deal: "make", make: { from: [{ name: "Wolf pelt", qty: 1 }], want: "a hood", tool: "", plausibility: "plausible", results: [res("Pelt hood"), res("Pelt hood"), res("Pelt wrap")] } }));
    expect(item("Pelt hood").wearable).toBe(true);
    // Sold back, it goes into the stock with it.
    goods.settle!(r, settling(), plan({ deal: "sell", with: "Baker", seller: true, goods: [{ name: "Bronze helm", qty: 1, kind: 3, precious: false, quality: "common", service: false }] }));
    expect(goodsOf(r).merchants[0]!.wares.find((w) => w.name === "Bronze helm")?.wearable).toBe(true);
  });
});
