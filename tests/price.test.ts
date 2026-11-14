/**
 * The table kept under an ordinary chat (engine/price.ts, game/pricetable.ts, backend/table.ts): what a message is
 * worth by what it brings to bear, that nothing written as done is refused (it is billed), what a trouble may take,
 * when a marker comes due, what the chat's model is told, and that a chat with no table is left exactly as it was.
 */
import { describe, expect, test } from "bun:test";
import type { InterceptorContextDTO, LlmMessageDTO, SpindleAPI } from "lumiverse-spindle-types";
import { createTables } from "../src/backend/table.js";
import type { Models } from "../src/backend/models.js";
import { addCard, addHere, addWant, apply, arrive, autoDie, bite, bites, CANDLE, debtDue, debts, DEBTS, FUSE, HERE_MOST, newState, table, troubles, turnNight, type State } from "../src/engine/price.js";
import { createTable, noteOf, parseOpening, parseRuling, refined, refineQuestions, type Kept, type TableWorld } from "../src/game/pricetable.js";
import type { Ask, Message } from "../src/game/ask.js";

const WORLD: TableWorld = { world: "Harrowmere, a drowned canal city of locks and tolls.", who: "Wren, a broke noodle cook.", premise: "A noodle stand of my own." };

/** Wren at the quay: c1 cart (2 uses), c2 tongue, c3 crock (2 uses), c4 Brant (here), w5 a pitch (2 hurdles), x6 cart-breakers. */
function quay(): State {
  const s = newState(3);
  s.dice = [15, 7, 2];
  arrive(s, "The Sluice-Foot", "Shift bells are ringing.");
  addCard(s, "you", { name: "Handcart", kind: "thing", text: "Fifty bowls before it runs dry." });
  addCard(s, "you", { name: "Quick Tongue", kind: "trait", text: "She can talk a guard round." });
  addCard(s, "you", { name: "Crock of Black Vinegar", kind: "thing", text: "The river spirits crave it.", catch: "Its reek is proof of theft." });
  addCard(s, "here", { name: "Lockmaster Brant", kind: "tie", text: "Lets a kettle stand if his belly is soothed." }, null);
  addWant(s, "you", { name: "A Pitch at the Tide Tower", size: "middling", terms: ["The lock authority's leave", "The river-thing left content"] });
  addWant(s, "them", { name: "Cart-Breakers", text: "Two toughs coming down the quay.", size: "small", terms: ["To smash her cart"], bite: "they break the cart" });
  return s;
}
const hurdle = (s: State, id: string) => s.wants.flatMap((w) => w.terms).find((t) => t.id === id)!;

describe("what a message is worth", () => {
  test("a thing that clears a hurdle clears it, and is used", () => {
    const s = quay();
    const r = apply(s, { plays: [{ card: "c3", on: "w5.2", fit: "full" }] });
    expect(hurdle(s, "w5.2").points).toBe(2);
    expect(s.cards.find((c) => c.id === "c3")!.uses).toBe(1);
    expect(r.ledger.join(" ")).toContain("answers");
    expect(s.candle).toBe(CANDLE - 1);
  });

  test("two things that each help clear it together; a trait is tired, not lost", () => {
    const s = quay();
    apply(s, { plays: [{ card: "c2", on: "w5.1", fit: "part" }, { card: "c4", on: "w5.1", fit: "part" }] });
    expect(hurdle(s, "w5.1").points).toBe(2);
    expect(s.cards.find((c) => c.id === "c2")!.tired).toBe(true);
    // Tired, it adds nothing until a rest.
    const again = apply(s, { plays: [{ card: "c2", on: "w5.2", fit: "full" }] });
    expect(hurdle(s, "w5.2").points).toBe(0);
    expect(again.ledger.join(" ")).toContain("tired");
    apply(s, { rest: true });
    expect(s.cards.find((c) => c.id === "c2")!.tired).toBe(false);
  });

  test("giving a thing up is worth one more, and only what is yours can be given", () => {
    const s = quay();
    apply(s, { plays: [{ card: "c3", on: "w5.2", fit: "part", give: true }] });
    expect(hurdle(s, "w5.2").points).toBe(2);
    expect(s.cards.some((c) => c.id === "c3")).toBe(false);
    const t = quay();
    apply(t, { plays: [{ card: "c4", on: "w5.1", fit: "part", give: true }] });
    expect(hurdle(t, "w5.1").points).toBe(1);
    expect(t.cards.some((c) => c.id === "c4")).toBe(true);
  });

  test("a thing that does not bear on it earns nothing and is not spent", () => {
    const s = quay();
    const r = apply(s, { plays: [{ card: "c1", on: "w5.1", fit: "none", why: "a cart is not a licence" }] });
    expect(hurdle(s, "w5.1").points).toBe(0);
    expect(s.cards.find((c) => c.id === "c1")!.uses).toBe(2);
    expect(r.ledger.join(" ")).toContain("does not bear on");
    expect(s.candle).toBe(CANDLE);
  });

  test("a bare try always moves things a step, and the die says what it costs in hours", () => {
    for (const [die, burnt] of [[15, 1], [7, 2], [2, 3]] as const) {
      const s = quay();
      expect(apply(structuredClone(s), { tries: [{ on: "w5.1" }] }).wantsDie).toBeTruthy();
      apply(s, { tries: [{ on: "w5.1" }] }, die);
      expect(hurdle(s, "w5.1").points).toBe(1);
      // A notch for acting, and none, one or two more for the die.
      expect(s.candle).toBe(CANDLE - burnt);
      expect(s.dice).not.toContain(die);
    }
    expect(autoDie(quay())).toBe(15);
    expect(autoDie({ ...quay(), dice: [7, 2] })).toBe(7);
  });
});

describe("nothing written as done is refused", () => {
  test("what the message did not pay for goes on account, in the player's own words when they named a price", () => {
    const s = quay();
    const r = apply(s, { declared: [{ term: "w5.1", cost: "the name her master gave her" }] });
    expect(hurdle(s, "w5.1").points).toBe(2);
    expect(debts(s)).toHaveLength(1);
    expect(debts(s)[0]!.text).toContain("the name her master gave her");
    expect(r.ledger.join(" ")).toContain("On account");
  });

  test("a want written as won whole is won, each hurdle billed; past what is lent, in hours", () => {
    const s = quay();
    addCard(s, "them", { name: "An old marker", text: "Owed.", kind: "debt" }, null);
    addCard(s, "them", { name: "Another", text: "Owed.", kind: "debt" }, null);
    const r = apply(s, { declared: ["w5"] });
    expect(s.wants.some((w) => w.id === "w5")).toBe(false);
    expect(s.toMint.map((w) => w.name)).toEqual(["A Pitch at the Tide Tower"]);
    expect(debts(s)).toHaveLength(DEBTS);
    expect(r.ledger.join(" ")).toContain("paid in hours");
    expect(s.candle).toBe(CANDLE - 4 - 1);
  });

  test("a reach for something lasting becomes a want with as many hurdles as its size, and may replace an old road to the same thing", () => {
    const s = quay();
    apply(s, { wish: { name: "A Cat's Body", size: "middling", terms: ["An offering the river wants", "Something of hers given up", "one too many"] }, plays: [{ card: "c3", on: "new.1", fit: "full", give: true }] });
    const cat = s.wants.find((w) => w.name === "A Cat's Body")!;
    expect(cat.terms).toHaveLength(2);
    expect(cat.terms[0]!.points).toBe(2);
    apply(s, { wish: { name: "A Ledge Nobody Can Reach", size: "middling", terms: ["A foothold", "A way to serve from it"], instead: "w5" } });
    expect(s.wants.some((w) => w.id === "w5")).toBe(false);
  });

  test("an ordinary thing the character would have is dealt as it is used, good once", () => {
    const s = quay();
    apply(s, { had: { name: "Cook's knife", text: "Stamped steel." }, plays: [{ card: "had", on: "w5.2", fit: "part" }] });
    expect(hurdle(s, "w5.2").points).toBe(1);
    expect(s.cards.some((c) => c.name === "Cook's knife")).toBe(false);
  });
});

describe("what is held against you", () => {
  test("a trouble left alone comes nearer on a beat that acts, and not on plain talk", () => {
    const s = quay();
    apply(s, {});
    expect(troubles(s)[0]!.fuse).toBe(FUSE);
    apply(s, { plays: [{ card: "c2", on: "w5.1", fit: "part" }] });
    expect(troubles(s)[0]!.fuse).toBe(FUSE - 1);
    // Answered, it does not come nearer.
    apply(s, { plays: [{ card: "c1", on: "x6", fit: "part" }] });
    expect(troubles(s)[0]!.fuse).toBe(FUSE - 1);
  });

  test("when its fuse is out it takes one thing code allows, and goes", () => {
    const s = quay();
    const x = troubles(s)[0]!;
    x.fuse = 1;
    const r = apply(s, { time: 1 });
    expect(r.bit).toEqual([x]);
    expect(bites(s, x).map((b) => b.id)).toEqual(expect.arrayContaining(["wound", "hours", "take:c1", "marker"]));
    expect(bite(s, x, "take:c1")).toContain("Handcart");
    expect(s.cards.some((c) => c.id === "c1")).toBe(false);
    expect(troubles(s)).toHaveLength(0);
    // A pick code does not allow is a wound.
    const t = quay();
    bite(t, troubles(t)[0]!, "take:everything");
    expect(t.wounds).toBe(1);
  });

  test("a marker comes due only with no trouble on the table, at once when the narrator will lend no more, and is torn up when answered", () => {
    const s = quay();
    apply(s, { declared: ["w5.1"] });
    expect(debtDue(s, true)).toBeNull();
    s.wants = s.wants.filter((w) => w.whose === "you");
    // Too soon after it was taken, unless arriving somewhere would not change that either.
    expect(debtDue(s, true)).toBeNull();
    s.beat += 2;
    const marker = debtDue(s, true)!;
    expect(marker.kind).toBe("debt");
    const collector = addWant(s, "them", { name: "The Clerk", size: "small", terms: ["The toll"] })!;
    collector.collects = marker.id;
    apply(s, { plays: [{ card: "c1", on: collector.id, fit: "full" }] });
    expect(debts(s)).toHaveLength(0);
    const full = quay();
    full.wants = full.wants.filter((w) => w.whose === "you");
    for (let i = 0; i < DEBTS; i++) addCard(full, "them", { name: `Marker ${i}`, text: "Owed.", kind: "debt" }, null);
    expect(debtDue(full)?.name).toBe("Marker 0");
  });

  test("the night turns when the candle is out or the character is laid low, and the chat goes on", () => {
    const s = quay();
    s.candle = 1;
    apply(s, { time: 2 });
    expect(s.over).toBeTruthy();
    const said = turnNight(s);
    expect(said.join(" ")).toContain("next day");
    expect(s.candle).toBe(CANDLE);
    expect(s.night).toBe(2);
    expect(s.over).toBeUndefined();
    expect(turnNight(s)).toEqual([]);
  });

  test("what is in the scene is kept to a few things, and none twice", () => {
    const s = quay();
    addHere(s, [{ name: "Lockmaster Brant", text: "Again." }, { name: "A Skiff", text: "Lantern-lit." }, { name: "An Altar", text: "Drowned." }, { name: "A Winch", text: "Rusted." }]);
    const here = s.cards.filter((c) => c.side === "here");
    expect(here).toHaveLength(HERE_MOST);
    expect(here.filter((c) => c.name === "Lockmaster Brant")).toHaveLength(1);
  });
});

/* ------------------------------------------------- the models ------------------------------------------------- */

const OPENING = JSON.stringify({
  place: { name: "The Sluice-Foot", text: "Shift bells are ringing." },
  here: [{ name: "Lockmaster Brant", kind: "tie", text: "Sour-bellied and wary of you." }, { name: "The Drowned Altar", kind: "thing", text: "Spirits bargain here.", catch: "They keep something back." }],
  yours: [{ name: "Handcart", kind: "thing", text: "Fifty bowls." }, { name: "Quick Tongue", kind: "trait", text: "Talks guards round." }, { name: "Crock of Vinegar", kind: "thing", text: "Spirits crave it." }, { name: "Guild Training", kind: "trait", text: "Knows every broth." }],
  want: { name: "A Pitch at the Tide Tower", text: "A place of her own.", size: "middling", terms: ["The lock authority's leave", "The river-thing left content"] },
  trouble: null,
});

/** A stand-in for the models: what each job answers, by what its prompt begins with. */
function minds(answers: { reader?: string | (() => string); card?: string; look?: string; due?: string; open?: string }): { ask: Ask; asked: string[] } {
  const asked: string[] = [];
  const ask: Ask = async (messages: Message[]) => {
    const head = messages[0]!.content;
    const job = head.startsWith("You are the rules reader") ? "reader" : head.includes("You set its table") ? "open" : head.includes("Write the card it becomes") ? "card" : head.includes("Read it only for where the scene now is") ? "look" : head.includes("comes due where they are") ? "due" : "bite";
    asked.push(job);
    const a = job === "reader" ? answers.reader : job === "open" ? (answers.open ?? OPENING) : job === "card" ? answers.card : job === "look" ? answers.look : job === "due" ? answers.due : '{"pick":"wound"}';
    if (a === undefined) throw new Error(`no answer for ${job}`);
    return typeof a === "function" ? a() : a;
  };
  return { ask, asked };
}
const dealt = async (m: { ask: Ask }): Promise<Kept> => (await createTable(m).deal(WORLD, ["Wren: I wheel my cart to the quay."], 5))!;

describe("a message under a chat", () => {
  test("a table is dealt whole from the builder's opening, or not at all", async () => {
    const k = await dealt(minds({}));
    expect(k.state.cards.filter((c) => c.side === "you")).toHaveLength(4);
    expect(k.state.wants[0]!.terms).toHaveLength(2);
    expect(parseOpening('{"place":{"name":"<where the scene is now>"},"here":[],"yours":[]}')).toBeNull();
    expect(await createTable(minds({ open: "I cannot do that." })).deal(WORLD, [], 1)).toBeNull();
  });

  test("it is played once: a swipe or a regeneration of the same message changes nothing", async () => {
    const m = minds({ reader: '{"plays":[{"card":"c5","on":"w7.2","fit":"full","give":true,"why":"an offering"}]}' });
    const t = createTable(m);
    const k = await dealt(m);
    const played = await t.beat(k, "I pour the whole crock into the canal for the river-thing.", 4, []);
    expect(played.state.wants[0]!.terms[1]!.points).toBe(2);
    expect(played.state.cards.some((c) => c.name === "Crock of Vinegar")).toBe(false);
    const again = await t.beat(played, "I pour the whole crock into the canal for the river-thing.", 4, []);
    expect(again).toBe(played);
    expect(m.asked.filter((j) => j === "reader")).toHaveLength(1);
  });

  test("what is won is told at once, and written as a card with its catch once the reply has told it: no reply waits for the builder", async () => {
    const m = minds({ reader: '{"declared":["w7"]}', look: "{}", card: '{"name":"The Tide Tower Pitch","kind":"fact","text":"A place of her own where the crews eat.","catch":"The Magistrate knows where to find her."}' });
    const t = createTable(m);
    const played = await t.beat(await dealt(m), "Some days later the stand is open.", 6, []);
    expect(m.asked).not.toContain("card");
    expect(debts(played.state)).toHaveLength(2);
    const note = noteOf(played);
    expect(note).toContain("On account");
    expect(note).toContain("A Pitch at the Tide Tower is yours.");
    expect(note).toContain("never undo or contradict");
    const seen = (await t.seen(played, "The shutters go up on the stand at dawn.", []))!;
    const card = seen.state.cards.find((c) => c.name === "The Tide Tower Pitch")!;
    expect(card.catch).toContain("Magistrate");
    expect(seen.state.toMint).toEqual([]);
    expect(seen.news.join(" ")).toContain("The Magistrate knows where to find her.");
  });

  test("the chat's model is told plainly when nothing changed, and never told to mention the table", async () => {
    const m = minds({ reader: "{}" });
    const played = await createTable(m).beat(await dealt(m), "I smile at Brant.", 2, []);
    const note = noteOf(played);
    expect(note).toContain("Nothing at the table changed");
    expect(note).toContain("Never mention the table");
    expect(note).toContain(table(played.state));
    expect(played.state.candle).toBe(CANDLE);
  });

  test("a reader that gives no answer costs nothing: the message is kept as played and the table is as it was", async () => {
    const m = minds({});
    const k = await dealt(m);
    const played = await createTable(m).beat(k, "I sneak past.", 3, []);
    expect(played.state).toEqual(k.state);
    expect(played.last?.ledger).toEqual([]);
  });

  test("the Decision model's second look can lower a fit and can tell an attempt from a thing done, and nothing else", async () => {
    const k = await dealt(minds({}));
    const r = parseRuling('{"plays":[{"card":"c4","on":"w7.1","fit":"full","why":"charm"}],"declared":[{"term":"w7.1"}]}')!;
    const q = refineQuestions(WORLD, k.state, "I use my charm to get a licence.", r);
    expect(Object.keys(q.questions).sort()).toEqual(["done0", "fit0", "paid0"]);
    const out = refined(r, { fit0: { type: "choice", choice: "none" }, done0: { type: "choice", choice: "attempt" } });
    expect(out.plays![0]!.fit).toBe("none");
    expect(out.declared).toEqual([]);
    expect(refined(r, null)).toBe(r);
    expect(refined(r, { fit0: { type: "choice", choice: "mostly" } }).plays![0]!.fit).toBe("full");
  });

  test("work the message shows done is paid for in hours, and nothing is owed after", async () => {
    const k = await dealt(minds({}));
    const r = parseRuling('{"declared":[{"term":"w7.1","cost":"a whole afternoon scraping boards"}]}')!;
    const out = refined(r, { done0: { type: "choice", choice: "done" }, paid0: { type: "choice", choice: "worked" } }, k.state);
    expect(out.declared).toEqual([{ term: "w7.1", worked: true }]);
    const s = structuredClone(k.state);
    const res = apply(s, out);
    expect(s.wants[0]!.terms[0]!.points).toBe(2);
    expect(debts(s)).toHaveLength(0);
    // The hours the work took are the whole of what the time costs: the same afternoon is not charged twice.
    expect(s.candle).toBe(CANDLE - 4);
    expect(res.ledger.join(" ")).toContain("paid for in hours");
  });

  test("a thing on the table written as already won, which the reader missed, is taken only on a sure answer", async () => {
    const k = await dealt(minds({}));
    const r = parseRuling('{"wish":{"name":"a pitch at the tide tower","size":"middling","terms":["a","b"],"instead":"w7"},"time":2}')!;
    const q = refineQuestions(WORLD, k.state, "A week later the stand is open.", r);
    expect(Object.keys(q.questions).sort()).toEqual(["won", "wonpaid"]);
    expect(Object.keys((q.questions.won as { criteria: Record<string, string> }).criteria)).toEqual(["none", "w7"]);
    const sure = refined(r, { won: { type: "choice", choice: "w7", probabilities: { w7: 0.9 } } }, k.state);
    expect(sure.declared).toEqual(["w7"]);
    expect(sure.wish).toBeNull();
    expect(refined(r, { won: { type: "choice", choice: "w7", probabilities: { w7: 0.5 } } }, k.state).declared).toEqual([]);
    expect(refined(r, { won: { type: "choice", choice: "none", probabilities: { none: 0.9 } } }, k.state).declared).toEqual([]);
    expect(refined(r, { won: { type: "choice", choice: "w99", probabilities: { w99: 0.9 } } }, k.state).declared).toEqual([]);
    // Not asked when the reader already listed something as done, or when nothing on the table is open.
    expect(Object.keys(refineQuestions(WORLD, k.state, "x", parseRuling('{"declared":["w7"]}')!).questions)).not.toContain("won");
  });

  test("a wish for what is already on the table under the same name is no new want", async () => {
    const k = await dealt(minds({}));
    const s = structuredClone(k.state);
    apply(s, { wish: { name: "a pitch at the Tide Tower", size: "large", terms: ["a", "b", "c"] }, plays: [{ card: "c5", on: "new.2", fit: "full" }] });
    expect(s.wants.filter((w) => w.whose === "you")).toHaveLength(1);
    expect(s.wants[0]!.terms.map((t) => t.points)).toEqual([0, 2]);
  });

  test("a reader's answer is taken only in the shape asked for", () => {
    const r = parseRuling('Here you go: {"plays":[{"card":"c1","on":"w2.1","fit":"splendid"},{"card":7}],"declared":["w2.2",{"term":"w2.1","cost":"  her name "}],"time":"lots","rest":"yes"}')!;
    expect(r.plays).toEqual([{ card: "c1", on: "w2.1", fit: "none", give: false, why: "" }]);
    expect(r.declared).toEqual([{ term: "w2.2" }, { term: "w2.1", cost: "her name" }]);
    expect(r.time).toBe(0);
    expect(r.rest).toBe(false);
    expect(parseRuling("no json here")).toBeNull();
  });

  test("after a reply the scene is read once: who is here, where it is, and a marker may come due as news for the next note", async () => {
    const m = minds({
      reader: '{"declared":[{"term":"w7.1"}]}',
      look: '{"place":{"name":"The Counting-House","text":"Clerks bend over ledgers."},"here":[{"name":"Clerk Fenn","kind":"tie","text":"Suspicious of the smell of broth."}],"ties":[]}',
      due: '{"name":"Toll-Assayer Fenn","text":"Tapping the cart with an iron gauge.","size":"small","terms":["The toll she never paid"],"bite":"he impounds the kettle"}',
    });
    const t = createTable(m);
    let k = await t.beat(await dealt(m), "Brant chalks his mark on my cart.", 2, []);
    k.state.beat += 2;
    const seen = (await t.seen(k, "Brant nods you through to the counting-house.", []))!;
    expect(seen.state.place.name).toBe("The Counting-House");
    expect(seen.state.cards.filter((c) => c.side === "here").map((c) => c.name)).toEqual(["Clerk Fenn"]);
    expect(troubles(seen.state)[0]!.name).toBe("Toll-Assayer Fenn");
    expect(seen.news[0]).toContain("A marker has come due");
    expect(await t.seen(seen, "Another reply.", [])).toBeNull();
    // The next message's note tells it.
    k = await t.beat(seen, "I bow to the clerk.", 4, []);
    expect(noteOf(k)).toContain("SINCE YOUR LAST REPLY");
    expect(k.news).toEqual([]);
  });

  test("the last message can be taken back, and is then played again", async () => {
    const m = minds({ reader: '{"declared":["w7"]}', look: "{}", card: '{"name":"The Pitch","text":"Hers."}' });
    const t = createTable(m);
    const k = await dealt(m);
    const played = (await t.seen(await t.beat(k, "The stand is open.", 6, []), "It opens.", []))!;
    expect(played.state.cards.some((c) => c.name === "The Pitch")).toBe(true);
    const back = t.undo(played);
    expect(back.state).toEqual(k.state);
    expect(back.last).toBeUndefined();
    expect((await t.beat(back, "The stand is open.", 6, [])).state.wants).toHaveLength(0);
  });
});

/* ------------------------------------------------- in Lumiverse ------------------------------------------------- */

function host(m: { ask: Ask }) {
  const files = new Map<string, unknown>();
  let handler: ((messages: LlmMessageDTO[], ctx: InterceptorContextDTO) => Promise<unknown>) | null = null;
  const changed: string[] = [];
  const spindle = {
    log: { info: () => undefined, warn: () => undefined },
    userStorage: {
      getJson: async (path: string, o: { fallback: unknown }) => (files.has(path) ? structuredClone(files.get(path)) : o.fallback),
      setJson: async (path: string, v: unknown) => void files.set(path, structuredClone(v)),
      delete: async (path: string) => void files.delete(path),
    },
    chats: { get: async (id: string) => (id === "chat-1" ? { id, character_id: "char-1" } : null) },
    characters: { get: async () => ({ name: "Brant", description: "A lockmaster in {{user}}'s city.", personality: "", scenario: "" }) },
    personas: { getActive: async () => ({ id: "p", name: "Wren", title: "", description: "A broke noodle cook." }), getDefault: async () => null },
    chat: { getMessages: async () => [{ id: "m0", index_in_chat: 0, is_user: false, name: "Brant", content: "<think>hm</think>The quay is loud tonight." }, { id: "m1", index_in_chat: 1, is_user: true, name: "Wren", content: "I wheel my cart up." }] },
    registerInterceptor: (h: typeof handler) => ((handler = h), () => undefined),
    on: () => () => undefined,
  } as unknown as SpindleAPI;
  const models = { quiet: (_u: string, role: string, messages: Message[]) => m.ask(messages, role as never), decide: async () => null } as unknown as Models;
  const tables = createTables(spindle, models, (_u, chatId) => void changed.push(chatId));
  const ctx = (over: Partial<InterceptorContextDTO> = {}): InterceptorContextDTO => ({ userId: "u", chatId: "chat-1", generationType: "normal", isDryRun: false, ...over }) as InterceptorContextDTO;
  const prompt = (line: string, index = 3): LlmMessageDTO[] => [
    { role: "system", content: "You are Brant." },
    { role: "assistant", content: "The quay is loud tonight.", __isChatHistory: true, sourceIndexInChat: index - 1 },
    { role: "user", content: line, __isChatHistory: true, sourceIndexInChat: index },
    { role: "system", content: "Write the next reply." },
  ];
  return { tables, files, changed, ctx, prompt, run: (messages: LlmMessageDTO[], c = ctx()) => handler!(messages, c) as Promise<LlmMessageDTO[] | { messages: LlmMessageDTO[]; breakdown?: { messageIndex: number }[] }> };
}

describe("in Lumiverse", () => {
  test("a chat with no table, a dry run, and another extension's quiet ask are left exactly as they were", async () => {
    const h = host(minds({ reader: "{}" }));
    const p = h.prompt("Hello.");
    expect(await h.run(p)).toBe(p);
    await h.tables.deal("u", "chat-1", "a stand of my own");
    expect(await h.run(p, h.ctx({ isDryRun: true }))).toBe(p);
    expect(await h.run(p, h.ctx({ generationType: "quiet" }))).toBe(p);
    expect(await h.run(p, h.ctx({ chatId: "chat-2" }))).toBe(p);
    await h.tables.change("u", "chat-1", "off");
    expect(await h.run(p)).toBe(p);
  });

  test("the table is dealt from the card, the persona and the chat's last messages, cleaned of what is not the story", async () => {
    let seen = "";
    const base = minds({});
    const h = host({ ask: (messages, role, o) => ((seen ||= messages[1]!.content), base.ask(messages, role, o)) });
    const v = (await h.tables.deal("u", "chat-1", "a stand of my own"))!;
    expect(v.on).toBe(true);
    expect(v.premise).toBe("a stand of my own");
    expect(seen).toContain("A lockmaster in Wren's city.");
    expect(seen).toContain("Wren: I wheel my cart up.");
    expect(seen).not.toContain("<think>");
    expect([...h.files.keys()]).toEqual(["tables/chat-1.json"]);
  });

  test("the note goes straight after the player's message, the message is played once, and nothing else in the prompt moves", async () => {
    const h = host(minds({ reader: '{"declared":[{"term":"w7.1","cost":"a promise to Brant"}]}' }));
    await h.tables.deal("u", "chat-1", "");
    const p = h.prompt("Brant chalks his mark on my cart.");
    const out = (await h.run(p)) as { messages: LlmMessageDTO[]; breakdown: { messageIndex: number }[] };
    expect(out.messages).toHaveLength(p.length + 1);
    expect(out.breakdown[0]!.messageIndex).toBe(3);
    expect(out.messages[3]!.role).toBe("system");
    expect(String(out.messages[3]!.content)).toContain("a promise to Brant");
    expect(out.messages.filter((_, i) => i !== 3)).toEqual(p);
    expect(h.changed).toEqual(["chat-1"]);
    // A swipe of the same message tells the same note and bills nothing more.
    const again = (await h.run(p, h.ctx({ generationType: "swipe" }))) as { messages: LlmMessageDTO[] };
    expect(again.messages[3]!.content).toBe(out.messages[3]!.content);
    expect((await h.tables.view("u", "chat-1"))!.state.cards.filter((c) => c.kind === "debt")).toHaveLength(1);
    expect(h.changed).toEqual(["chat-1"]);
  });

  test("a table that fails never costs the chat its reply", async () => {
    const h = host(minds({ reader: "{}" }));
    await h.tables.deal("u", "chat-1", "");
    h.files.set("tables/chat-1.json", { v: 1, on: true, world: WORLD, state: { cards: "broken" }, news: [] });
    const p = h.prompt("Hello.");
    expect(await h.run(p)).toBe(p);
  });

  test("taking the last message back, pausing, and putting the table away; and another user's chat is not read", async () => {
    const h = host(minds({ reader: '{"declared":["w7.1"]}' }));
    await h.tables.deal("u", "chat-1", "");
    await h.run(h.prompt("Brant agrees."));
    expect((await h.tables.view("u", "chat-1"))!.canUndo).toBe(true);
    const back = (await h.tables.change("u", "chat-1", "undo"))!;
    expect(back.canUndo).toBe(false);
    expect(back.state.cards.some((c) => c.kind === "debt")).toBe(false);
    expect((await h.tables.change("u", "chat-1", "off"))!.on).toBe(false);
    expect(await h.tables.change("u", "chat-1", "drop")).toBeNull();
    expect(h.files.size).toBe(0);
    await expect(h.tables.view("u", "someone-elses-chat")).rejects.toThrow("no such chat");
  });
});
