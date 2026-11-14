import { describe, expect, test } from "bun:test";
import type { DecisionAnswer } from "lumiverse-spindle-types";
import {
  ACTIVE_MOST, activePerks, addXp, allPerks, checkTrees, effectWords, holds, inReach, keeper, learn, nextPointAt, peekPerks, perkModifiers, perkNamed, perkPoints, perksOf,
  REST_LESS, restLess, ROLL_CAP, setActive, xpBonus,
  type Perk, type RawNode, type RawTree,
} from "../src/engine/perks.js";
import { attributesFrom, meet, newRun, xpToNext, type Judged, type Run } from "../src/engine/run.js";
import type { Message, Role } from "../src/game/ask.js";
import { begin, lessonOf, pagesOf, sceneOf, showsOf, turn } from "../src/game/runturn.js";
import type { RunDeps, Show } from "../src/game/system.js";
import { byWording, perks, PERKS_LESSON, SELF_LESSON, SELF_WORDS, selfShow } from "../src/game/systems/perks.js";

const start = (): Run => {
  const r = newRun(7, "a world of salt roads", "a hero", "Jay");
  r.sheet.calling = "Road clerk";
  r.sheet.attributes = attributesFrom(["cunning", "dexterity"]);
  r.sheet.skills.push({ name: "Stealth", xp: 300, level: 3 }, { name: "Haggling", xp: 100, level: 2 });
  r.sheet.abilities.push({ name: "Quick Count", text: "Counts anything at a glance.", tier: 0, kind: "innate", wait: 0 });
  r.opening = "A goblin stands in the road.";
  r.place = { name: "Salt road", text: "" };
  meet(r, { name: "Goblin", power: 2, hostile: true });
  meet(r, { name: "Mara", power: 3 });
  return r;
};

const n = (name: string, children: RawNode[] = [], text = `You are known for your ${name.toLowerCase()}, wherever you go.`): RawNode => ({ name, text, children });
/** Three trees a model might write: fifteen perks, each tree of its own shape. */
const TREES = (): RawTree[] => [
  { name: "Quiet Roads", root: n("Soft Step", [n("Shadow Habit", [n("Unseen Passage", [n("Ghost of the Road")])]), n("Light Fingers")]) },
  { name: "Ledger Mind", root: n("Ready Count", [n("Fair Dealer"), n("Long Memory", [n("Sealed Lips")]), n("Cold Sums")]) },
  { name: "Salt Blood", root: n("Road Hardened", [n("Weather Eye", [n("Storm Sense")]), n("Iron Stomach", [n("Second Wind")])]) },
];
/** The same as a model's JSON. */
const asJson = (trees: RawTree[]): unknown => {
  const node = (x: RawNode): unknown => ({ name: x.name, text: x.text, children: x.children.map(node) });
  return { perk_trees: trees.map((t) => ({ name: t.name, root: t.root ? node(t.root) : null })) };
};
const withTrees = (r: Run = start()): Run => {
  perksOf(r).trees = checkTrees(TREES())!;
  return r;
};
const held = (over: Partial<Perk> = {}): Perk => ({ name: "Quiet Feet", text: "Moves without a sound.", effect: "skill", target: "Stealth", when: "", level: 2, ...over });
const judged = (over: Partial<Judged> = {}): Judged => ({ attribute: "dexterity", skill: "Stealth", scores: { physical: 0, likelihood: 0 }, ...over });

describe("checking the trees a model wrote", () => {
  test("three trees within the limits are kept whole, each perk after the one above it", () => {
    const got = checkTrees(TREES())!;
    expect(got.map((t) => t.name)).toEqual(["Quiet Roads", "Ledger Mind", "Salt Blood"]);
    expect(got[0]!.perks.map((p) => [p.id, p.name, p.parent])).toEqual([
      ["t1-0", "Soft Step", null], ["t1-1", "Shadow Habit", "t1-0"], ["t1-2", "Unseen Passage", "t1-1"], ["t1-3", "Ghost of the Road", "t1-2"], ["t1-4", "Light Fingers", "t1-0"],
    ]);
    expect(got.flatMap((t) => t.perks).every((p) => !p.learned && !p.active)).toBe(true);
  });
  test("any number of trees but three is no answer", () => {
    expect(checkTrees(TREES().slice(0, 2))).toBeNull();
    expect(checkTrees([...TREES(), { name: "A Fourth", root: n("One More", [n("And Another"), n("And A Third"), n("And A Fourth", [n("And A Fifth")])]) }])).toBeNull();
  });
  test("a tree with too few perks, too many, too deep, too wide, or a root with nothing under it is no answer", () => {
    const swap = (root: RawNode | null): RawTree[] => [{ name: "Quiet Roads", root }, ...TREES().slice(1)];
    expect(checkTrees(swap(n("Soft Step", [n("Shadow Habit", [n("Unseen Passage")]), n("Light Fingers")])))).toBeNull();
    expect(checkTrees(swap(n("Soft Step", [n("A1", [n("A2"), n("A3"), n("A4")]), n("B1", [n("B2"), n("B3"), n("B4")])])))).toBeNull();
    expect(checkTrees(swap(n("Soft Step", [n("Aa", [n("Bb", [n("Cc", [n("Dd", [n("Ee")])])])])])))).toBeNull();
    expect(checkTrees(swap(n("Soft Step", [n("Aa"), n("Bb"), n("Cc"), n("Dd")])))).toBeNull();
    expect(checkTrees(swap(n("Soft Step")))).toBeNull();
    expect(checkTrees(swap(null))).toBeNull();
    // Nine in a tree is one too many.
    expect(checkTrees(swap(n("Soft Step", [n("Aa", [n("Ab"), n("Ac"), n("Ad")]), n("Ba", [n("Bb"), n("Bc"), n("Bd")])])))).toBeNull();
  });
  test("a name used twice, a note left unfilled, markup, a number, or a sentence too short is no answer", () => {
    const first = (child: RawNode): RawTree[] => [{ name: "Quiet Roads", root: n("Soft Step", [n("Shadow Habit", [n("Unseen Passage", [child])]), n("Light Fingers")]) }, ...TREES().slice(1)];
    expect(checkTrees(first(n("Ghost of the Road")))).not.toBeNull();
    expect(checkTrees(first(n("Ready Count")))).toBeNull();
    expect(checkTrees(first(n("the soft step")))).toBeNull();
    expect(checkTrees(first(n("<2 to 4 words>")))).toBeNull();
    expect(checkTrees(first(n("Ghost", [], "<one plain sentence>")))).toBeNull();
    expect(checkTrees(first(n("Ghost", [], "Adds +5 to your sneaking rolls.")))).toBeNull();
    expect(checkTrees(first(n("Ghost", [], "Too short.")))).toBeNull();
    expect(checkTrees(first(n("")))).toBeNull();
    expect(checkTrees([{ name: "Ledger Mind", root: TREES()[0]!.root }, ...TREES().slice(1)])).toBeNull();
  });
});

describe("points, reach and the active three", () => {
  test("one point to start and one more at every second level, less what is learned, old perks counted", () => {
    const st = perksOf(withTrees());
    expect([1, 2, 3, 4, 5, 20].map((level) => perkPoints(st, level))).toEqual([1, 2, 2, 3, 3, 11]);
    perkNamed(st, "Soft Step")!.learned = true;
    expect(perkPoints(st, 1)).toBe(0);
    expect(perkPoints(st, 2)).toBe(1);
    st.held.push(held());
    expect(perkPoints(st, 2)).toBe(0);
    expect(perkPoints(st, 1)).toBe(0);
    expect([1, 2, 3, 19, 20].map(nextPointAt)).toEqual([2, 4, 4, 20, null]);
  });
  test("a perk is learned only from its tree's first perk down, with a point, and once", () => {
    const st = perksOf(withTrees());
    const root = perkNamed(st, "Soft Step")!, child = perkNamed(st, "Shadow Habit")!, other = perkNamed(st, "Ready Count")!;
    expect(inReach(st, root)).toBe(true);
    expect(inReach(st, child)).toBe(false);
    expect(learn(st, 1, child)).toBe("above");
    expect(learn(st, 1, root)).toBe("ok");
    expect(learn(st, 1, root)).toBe("learned");
    expect(inReach(st, child)).toBe(true);
    expect(learn(st, 1, child)).toBe("points");
    expect(learn(st, 1, other)).toBe("points");
    expect(learn(st, 2, child)).toBe("ok");
    // Learning does not make it active.
    expect(activePerks(st)).toEqual([]);
  });
  test("a learned perk is made active or not, three at the most", () => {
    const st = perksOf(withTrees());
    const [a, b, c, d] = ["Soft Step", "Ready Count", "Road Hardened", "Light Fingers"].map((x) => perkNamed(st, x)!);
    expect(setActive(st, a!, true)).toBe("unlearned");
    for (const p of [a, b, c, d]) p!.learned = true;
    expect([a, b, c].map((p) => setActive(st, p!, true))).toEqual(["ok", "ok", "ok"]);
    expect(setActive(st, d!, true)).toBe("full");
    expect(setActive(st, a!, true)).toBe("already");
    expect(setActive(st, a!, false)).toBe("ok");
    expect(setActive(st, d!, true)).toBe("ok");
    expect(activePerks(st).map((p) => p.name)).toEqual(["Light Fingers", "Ready Count", "Road Hardened"]);
    expect(activePerks(st)).toHaveLength(ACTIVE_MOST);
  });
});

describe("perks of the old kind, in a run saved with them", () => {
  test("a skill perk adds a small bonus on rolls on that skill only, and nothing once the skill is gone", () => {
    const r = start();
    perksOf(r).held.push(held());
    expect(perkModifiers(r, judged())).toEqual([{ what: "Quiet Feet", by: 5 }]);
    expect(perkModifiers(r, judged({ skill: "Haggling" }))).toEqual([]);
    r.sheet.skills = r.sheet.skills.filter((s) => s.name !== "Stealth");
    expect(perkModifiers(r, judged())).toEqual([]);
  });
  test("an attribute perk helps only when its kind of moment holds", () => {
    const r = start();
    perksOf(r).held.push(held({ name: "Cold Blood", effect: "attribute", target: "dexterity", when: "foe" }));
    expect(perkModifiers(r, judged({ target: "Goblin" }))).toEqual([{ what: "Cold Blood", by: 5 }]);
    expect(perkModifiers(r, judged({ target: "Mara" }))).toEqual([]);
    expect(perkModifiers(r, judged({ target: "Goblin", attribute: "cunning" }))).toEqual([]);
  });
  test("each kind of moment is read from the run and the judged line", () => {
    const r = start();
    expect(holds(r, judged({ target: "Mara" }), "social")).toBe(true);
    expect(holds(r, judged({ target: "Goblin" }), "social")).toBe(false);
    expect(holds(r, judged({ item: "Knife" }), "tool")).toBe(true);
    expect(holds(r, judged({ ability: "Quick Count" }), "gift")).toBe(true);
    expect(holds(r, judged(), "wounded")).toBe(false);
    r.sheet.hp = 40;
    expect(holds(r, judged(), "wounded")).toBe(true);
    expect(holds(r, judged(), "crowd")).toBe(false);
    meet(r, { name: "Second goblin", hostile: true });
    expect(holds(r, judged(), "crowd")).toBe(true);
    expect(holds(r, judged(), "nonsense")).toBe(false);
  });
  test("perks together never add more than the cap to one roll", () => {
    const r = start();
    perksOf(r).held.push(held(), held({ name: "Cold Blood", effect: "attribute", target: "dexterity", when: "foe" }), held({ name: "Gift Of Hands", effect: "attribute", target: "dexterity", when: "tool" }));
    const mods = perkModifiers(r, judged({ target: "Goblin", item: "Knife" }));
    expect(mods.reduce((sum, m) => sum + m.by, 0)).toBeLessThanOrEqual(ROLL_CAP);
    expect(mods).toHaveLength(2);
  });
  test("a rest perk shortens the rest of its own ability by one turn, and of no other", () => {
    const r = start();
    r.sheet.abilities.push({ name: "Hard Look", text: "Stares.", tier: 0, kind: "innate", wait: 2 });
    r.sheet.abilities[0]!.wait = 2;
    perksOf(r).held.push(held({ name: "Sharp Eye", effect: "rest", target: "Quick Count" }));
    expect(restLess(r, "Hard Look")).toBe(false);
    expect(restLess(r, "Quick Count")).toBe(true);
    expect(r.sheet.abilities[0]!.wait).toBe(2 - REST_LESS);
    expect(restLess(r, null)).toBe(false);
  });
  test("a keeping perk holds the character up once a level", () => {
    const r = start();
    const p = held({ name: "Steady Heart", effect: "keep", target: "" });
    perksOf(r).held.push(p);
    expect(keeper(r)).toBe(p);
    p.used = r.sheet.level;
    expect(keeper(r)).toBeUndefined();
    r.sheet.level++;
    expect(keeper(r)).toBe(p);
  });
  test("an experience perk fits its deed, and pays a bounded share only for deeds that earn something", () => {
    const r = start();
    perksOf(r).held.push(held({ name: "Silver Tongue", effect: "xp", when: "social", target: "" }));
    const deed = { social: true, fight: false, find: false, skill: "" };
    expect(xpBonus(r, deed, 2)).toBeNull();
    const b3 = xpBonus(r, deed, 3)!, b5 = xpBonus(r, deed, 5)!;
    expect(b3.extra).toBeGreaterThanOrEqual(1);
    expect(b5.extra).toBeGreaterThanOrEqual(b3.extra);
    expect(b5.extra).toBeLessThan(xpToNext(1));
    expect(xpBonus(r, { ...deed, social: false }, 5)).toBeNull();
  });
  test("extra experience counts a level as the core does: three points each", () => {
    const r = start();
    r.sheet.xp = xpToNext(1) - 1;
    expect(addXp(r.sheet, 2)).toBe(1);
    expect(r.sheet).toMatchObject({ level: 2, points: 3, xp: 1 });
  });
  test("every old perk says what it does in plain words", () => {
    for (const p of [held(), held({ effect: "attribute", target: "cunning", when: "crowd" }), held({ effect: "rest", target: "Quick Count" }), held({ effect: "keep", target: "" }), held({ effect: "xp", when: "find", target: "" })])
      expect(effectWords(p)).toMatch(/^[A-Z].*\.$/);
  });
  test("a run saved with the old kind keeps what it held, loses the choice that was open, and counts what it held", () => {
    const r = start();
    r.sheet.level = 4;
    r.sys = { perks: { held: [held()], offer: { level: 4, perks: [held({ name: "Sharp Eye" })] }, owed: 1, fails: 0, seen: 4, renamed: 1 } };
    const st = perksOf(r);
    expect(st.held.map((p) => p.name)).toEqual(["Quiet Feet"]);
    expect(st.trees).toEqual([]);
    expect(Object.keys(r.sys!.perks as object).sort()).toEqual(["askAt", "fails", "held", "last", "trees"]);
    // 1 + 4 / 2 = 3 in all, one of them spent on the old perk; the open choice stood for one of the two left.
    expect(perkPoints(st, 4)).toBe(2);
    expect(peekPerks(start())).toMatchObject({ trees: [], held: [], fails: 0, askAt: 0, last: null });
  });
});

/* ------------------------------------------------- the hooks, with fake models ------------------------------------------------- */

const choice = (c: string, p = 0.9): DecisionAnswer => ({ type: "choice", choice: c, probabilities: { [c]: p } }) as unknown as DecisionAnswer;
const JUDGE = {
  kind: "action", act: "sneak past the goblin", target: "Goblin", item: null, item_named: false, needs_item: null, ability: null, ability_named: false,
  verdict: "challenge", reason: "It may see.", attribute: "dexterity", skill: "Stealth", for: [], against: [], scores: { physical: 0, likelihood: 0, item: null, ability: null, other: null },
};
const STORY = { ...JUDGE, kind: "story" };
const SETUP = {
  place: { name: "Salt road", text: "A white road." }, name: "Jay", calling: "Road clerk", attributes: ["cunning", "dexterity", "charisma"],
  skills: [{ name: "Stealth", level: 3 }, { name: "Haggling", level: 2 }, { name: "Counting", level: 2 }, { name: "Walking", level: 1 }],
  abilities: [], items: [], money: 3, coin: "salt", people: [], opening: "A goblin stands in the road.",
};

interface Fake {
  /** What the builder answers when asked for the trees: an answer, or one for each asking in turn. */
  trees?: unknown;
  /** What the reader answers when a line is read for perks. */
  line?: unknown;
  back?: unknown;
  decide?: (what: string) => Record<string, DecisionAnswer | undefined> | null;
  judge?: unknown;
}
function deps(f: Fake = {}): RunDeps & { calls: { role: Role; sys: string }[]; told: Message[][] } {
  const calls: { role: Role; sys: string }[] = [];
  const told: Message[][] = [];
  let asked = 0;
  const text = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));
  return {
    calls,
    told,
    systems: [perks],
    ask: async (messages: Message[], role: Role) => {
      const sys = messages[0]!.content;
      calls.push({ role, sys });
      if (role === "teller") {
        told.push(messages);
        return "You slip by.";
      }
      if (sys.includes("perk trees")) {
        const t = f.trees === undefined ? asJson(TREES()) : Array.isArray(f.trees) ? f.trees[Math.min(asked, f.trees.length - 1)] : f.trees;
        asked++;
        return text(t);
      }
      if (role === "builder") return text(SETUP);
      if (sys.includes("changes their character's perks")) return text(f.line ?? { learn: [], on: [], off: [] });
      if (sys.includes("referee")) return text(f.judge ?? JUDGE);
      if (sys.includes("records")) return text(f.back ?? { minutes: 2 });
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
    ...(f.decide ? { decide: async (what: string) => f.decide!(what) } : {}),
  };
}
const treeAsks = (d: { calls: { sys: string }[] }): number => d.calls.filter((c) => c.sys.includes("perk trees")).length;
const lineAsks = (d: { calls: { sys: string }[] }): number => d.calls.filter((c) => c.sys.includes("changes their character's perks")).length;
const self = (d: RunDeps, r: Run): Extract<Show, { kind: "self" }> => showsOf(d, r).find((s): s is Extract<Show, { kind: "self" }> => s.kind === "self")!;

describe("the trees are written once", () => {
  test("a run begun has its three trees written by the strong model, from the world and the character", async () => {
    const d = deps();
    const r = await begin(d, { world: "a world of salt roads", who: "a clerk of the salt road", name: "Jay" }, 3);
    expect(peekPerks(r).trees.map((t) => t.name)).toEqual(["Quiet Roads", "Ledger Mind", "Salt Blood"]);
    expect(treeAsks(d)).toBe(1);
    const asked = d.calls.find((c) => c.sys.includes("perk trees"))!;
    expect(asked.role).toBe("builder");
    // A turn after that asks for nothing more.
    await turn(d, r, "I sneak past the goblin.");
    expect(treeAsks(d)).toBe(1);
  });

  test("an answer that does not check is asked for once more; with none the run has no trees, plays on, and asks again later", async () => {
    const bad = asJson(TREES().slice(0, 2));
    const d = deps({ trees: [bad, bad, bad, bad, asJson(TREES())] });
    let r = await begin(d, { world: "w", who: "h", name: "Jay" }, 3);
    expect(peekPerks(r).trees).toEqual([]);
    expect(treeAsks(d)).toBe(2);
    expect(self(d, r).perks).toMatchObject({ trees: [], note: SELF_WORDS.unwritten });
    // The next turn is played as it is; the one after asks again (and fails again), then it waits longer.
    const t1 = await turn(d, r, "I sneak past the goblin.");
    expect(t1.story).toBe("You slip by.");
    expect(treeAsks(d)).toBe(2);
    r = (await turn(d, t1.run, "I sneak past the goblin.")).run;
    expect(treeAsks(d)).toBe(4);
    expect(peekPerks(r)).toMatchObject({ trees: [], fails: 2, askAt: 6 });
    for (let i = 0; i < 3; i++) r = (await turn(d, r, "I wait.")).run;
    expect(treeAsks(d)).toBe(4);
    const t6 = await turn(d, r, "I wait.");
    expect(peekPerks(t6.run).trees).toHaveLength(3);
    expect(t6.report.changes.join(" ")).toContain("Your perks are written, in three trees: Quiet Roads, Ledger Mind, Salt Blood.");
  });

  test("a run saved before the trees has them written after its next turn, and keeps the old perks it held", async () => {
    const old = start();
    old.sheet.level = 2;
    old.sys = { perks: { held: [held()], offer: { level: 2, perks: [held({ name: "Sharp Eye" })] }, owed: 0, seen: 2 } };
    const d = deps();
    expect(showsOf(d, old).filter((s) => s.kind === "card")).toEqual([]);
    const t = await turn(d, old, "I sneak past the goblin.");
    expect(t.report.roll!.modifiers).toContainEqual({ what: "Quiet Feet", by: 5 });
    const st = peekPerks(t.run);
    expect(st.trees).toHaveLength(3);
    expect(st.held.map((p) => p.name)).toEqual(["Quiet Feet"]);
    expect(perkPoints(st, 2)).toBe(1);
    expect(sceneOf(d, t.run)).toContain("KNACKS: Quiet Feet (Moves without a sound)");
    expect(self(d, t.run).perks.old).toEqual([{ name: "Quiet Feet", text: "Moves without a sound.", note: SELF_WORDS.old("A small boost to your rolls on Stealth.") }]);
  });
});

describe("learning and switching by a line", () => {
  test("the board's line is read by the fast model, and the perk is learned and made active", async () => {
    const d = deps({ line: { learn: ["Soft Step"], on: ["soft step"], off: [] }, judge: STORY });
    const r = withTrees();
    const line = self(d, r).perks.trees[0]!.perks[0]!.choices[0]!.line;
    expect(line).toBe("I learn the perk Soft Step and make it active.");
    const t = await turn(d, r, line);
    const p = perkNamed(peekPerks(t.run), "Soft Step")!;
    expect(p).toMatchObject({ learned: true, active: true });
    expect(perkPoints(peekPerks(t.run), 1)).toBe(0);
    expect(t.report.changes).toContain(`Learned: Soft Step. ${p.text} It is active (1 of 3).`);
    // The storyteller is told of it this turn, and is shown it as an active perk from then on.
    expect(d.told[0]!.at(-1)!.content).toContain(`has just come into a lasting trait, "Soft Step"`);
    expect(sceneOf(d, t.run)).toContain(`- Active perk, Soft Step: ${p.text.replace(/\.$/, "")}.`);
    await turn(d, t.run, "I sneak past the goblin.");
    expect(d.told[1]!.at(-1)!.content).toContain("- Active perk, Soft Step:");
    expect(d.calls.filter((c) => c.sys.includes("referee")).at(-1)).toBeDefined();
  });

  test("the judge is shown an active perk too", async () => {
    const r = withTrees();
    const st = perksOf(r);
    Object.assign(perkNamed(st, "Soft Step")!, { learned: true, active: true });
    let seen = "";
    const d = deps();
    const ask = d.ask;
    d.ask = async (m, role) => {
      if (m[0]!.content.includes("referee")) seen = m[1]!.content;
      return ask(m, role);
    };
    await turn(d, r, "I sneak past the goblin.");
    expect(seen).toContain("ACTIVE PERKS: lasting traits that are true of Jay now.");
    expect(seen).toContain("- Active perk, Soft Step:");
  });

  test("learning alone leaves it inactive, and says so", async () => {
    const d = deps({ line: { learn: ["Soft Step"] }, judge: STORY });
    const t = await turn(d, withTrees(), "I learn Soft Step.");
    expect(perkNamed(peekPerks(t.run), "Soft Step")).toMatchObject({ learned: true, active: false });
    expect(t.report.changes.join(" ")).toContain("It is not active: a learned perk does nothing until it is made active.");
    expect(sceneOf(d, t.run)).not.toContain("ACTIVE PERKS");
  });

  test("a perk out of reach is not learned, the story goes on, and the report says why", async () => {
    const d = deps({ line: { learn: ["Shadow Habit"], on: ["Shadow Habit"] }, judge: STORY });
    const t = await turn(d, withTrees(), "I learn the perk Shadow Habit and make it active.");
    expect(t.story).toBe("You slip by.");
    expect(perkNamed(peekPerks(t.run), "Shadow Habit")).toMatchObject({ learned: false, active: false });
    expect(t.report.changes).toContain("Shadow Habit was not learned: Soft Step must be learned first.");
    expect(t.report.changes.join(" ")).not.toContain("not made active");
    expect(d.told[0]!.at(-1)!.content).toContain(`does not come into "Shadow Habit" now`);
  });

  test("with no point to spend a perk within reach is not learned, and the report says when the next comes", async () => {
    const r = withTrees();
    perkNamed(perksOf(r), "Soft Step")!.learned = true;
    const d = deps({ line: { learn: ["Ready Count"] }, judge: STORY });
    const t = await turn(d, r, "I learn Ready Count.");
    expect(perkNamed(peekPerks(t.run), "Ready Count")!.learned).toBe(false);
    expect(t.report.changes).toContain("Ready Count was not learned: you have no perk point to spend (the next comes at level 2).");
  });

  test("a fourth perk is not made active, and one made inactive makes room", async () => {
    const r = withTrees();
    const st = perksOf(r);
    r.sheet.level = 8;
    for (const x of ["Soft Step", "Ready Count", "Road Hardened"]) Object.assign(perkNamed(st, x)!, { learned: true, active: true });
    perkNamed(st, "Light Fingers")!.learned = true;
    const full = await turn(deps({ line: { on: ["Light Fingers"] }, judge: STORY }), r, "I make my perk Light Fingers active.");
    expect(perkNamed(peekPerks(full.run), "Light Fingers")!.active).toBe(false);
    expect(full.report.changes).toContain("Light Fingers was not made active: 3 perks are active already. Make one inactive first.");
    const swap = await turn(deps({ line: { on: ["Light Fingers"], off: ["Soft Step"] }, judge: STORY }), r, "I make Soft Step inactive and Light Fingers active.");
    expect(activePerks(peekPerks(swap.run)).map((p) => p.name)).toEqual(["Light Fingers", "Ready Count", "Road Hardened"]);
    expect(swap.report.changes).toEqual(expect.arrayContaining(["Soft Step is no longer active (2 of 3).", "Light Fingers is now active (3 of 3)."]));
    // The board offers only what can be done: nothing on the fourth while three are active.
    expect(self(deps(), r).perks.trees[0]!.perks.find((p) => p.name === "Light Fingers")).toMatchObject({ note: SELF_WORDS.full, choices: [] });
  });

  test("a line that does something else as well is still judged for that, and the perk is learned beside it", async () => {
    const d = deps({ line: { learn: ["Soft Step"], on: ["Soft Step"] } });
    const t = await turn(d, withTrees(), "I learn Soft Step, keep it active, and sneak past the goblin.");
    expect(t.report.roll).not.toBeNull();
    expect(perkNamed(peekPerks(t.run), "Soft Step")).toMatchObject({ learned: true, active: true });
  });

  test("a line the judge took for a remark to the game is told as story when it learns a perk", async () => {
    const d = deps({ line: { learn: ["Soft Step"] }, judge: { ...JUDGE, kind: "ooc" } });
    const t = await turn(d, withTrees(), "I learn Soft Step.");
    expect(t.report.kind).toBe("story");
    expect(perkNamed(peekPerks(t.run), "Soft Step")!.learned).toBe(true);
  });

  test("a perk the passage shows them coming into is not written down again as a new ability", async () => {
    const back = { ability: { name: "Quiet Detachment", text: "Keeps thoughts quiet." }, minutes: 2 };
    const t = await turn(deps({ line: { learn: ["Soft Step"], on: ["Soft Step"] }, judge: STORY, back }), withTrees(), "I learn the perk Soft Step and make it active.");
    expect(t.run.sheet.abilities.map((a) => a.name)).toEqual(["Quick Count"]);
    // One that bears a perk's name is struck on any turn; another ability, on a turn that touched no perk, is learned as ever.
    const named = await turn(deps({ back: { ability: { name: "Ready Count", text: "Counts fast." }, minutes: 2 } }), withTrees(), "I sneak past the goblin.");
    expect(named.run.sheet.abilities.map((a) => a.name)).toEqual(["Quick Count"]);
    const other = await turn(deps({ back: { ability: { name: "Goblin Tongue", text: "Speaks with goblins." }, minutes: 2 } }), withTrees(), "I sneak past the goblin.");
    expect(other.run.sheet.abilities.map((a) => a.name)).toEqual(["Quick Count", "Goblin Tongue"]);
  });

  test("a line that touches no perk changes none, and names that are no perk are passed over", async () => {
    const t = await turn(deps(), withTrees(), "I creep forward, quiet as I can.");
    expect(allPerks(peekPerks(t.run)).some((p) => p.learned)).toBe(false);
    const odd = await turn(deps({ line: { learn: ["Fireball Hands"], on: "nonsense" } }), withTrees(), "I learn fireball hands.");
    expect(allPerks(peekPerks(odd.run)).some((p) => p.learned)).toBe(false);
    expect(odd.report.changes.join(" ")).not.toContain("Fireball");
  });

  test("the Decision model sure the line leaves the perks alone spares the fast model; anything else, the fast model says which", async () => {
    const none = deps({ decide: (what) => (what === "perk" ? { perk: choice("none") } : null) });
    await turn(none, withTrees(), "I look around.");
    expect(lineAsks(none)).toBe(0);
    const some = deps({ decide: (what) => (what === "perk" ? { perk: choice("learn") } : null), line: { learn: ["Soft Step"] }, judge: STORY });
    const t = await turn(some, withTrees(), "The first of the quiet ones.");
    expect(lineAsks(some)).toBe(1);
    expect(perkNamed(peekPerks(t.run), "Soft Step")!.learned).toBe(true);
    const unsure = deps({ decide: () => ({ perk: choice("none", 0.3) }), line: { learn: ["Soft Step"] }, judge: STORY });
    await turn(unsure, withTrees(), "Soft Step, yes.");
    expect(lineAsks(unsure)).toBe(1);
  });

  test("with no model answering, the board's own wording and the bare name still do it", async () => {
    const base = deps({ judge: STORY });
    const broken: RunDeps = { ...base, ask: async (m, role) => (m[0]!.content.includes("changes their character's perks") ? "not json" : base.ask(m, role)) };
    const t = await turn(broken, withTrees(), "I learn the perk Soft Step and make it active.");
    expect(perkNamed(peekPerks(t.run), "Soft Step")).toMatchObject({ learned: true, active: true });
    const st = perksOf(withTrees());
    expect(byWording(st, "soft step")).toEqual({ learn: ["t1-0"], on: [], off: [] });
    expect(byWording(st, "I learn the perk Ready Count.")).toEqual({ learn: ["t2-0"], on: [], off: [] });
    expect(byWording(st, "I make my perk Soft Step active.")).toEqual({ learn: [], on: ["t1-0"], off: [] });
    expect(byWording(st, "I make my perk Soft Step inactive.")).toEqual({ learn: [], on: [], off: ["t1-0"] });
    expect(byWording(st, "I creep along with a soft step")).toBeNull();
    // Every line the board writes is one the last fallback reads.
    for (const p of selfShow(withTrees()).perks.trees.flatMap((tr) => tr.perks)) for (const c of p.choices) expect(byWording(st, c.line)).not.toBeNull();
  });

  test("with no trees nothing is read from the line", async () => {
    const d = deps({ trees: "nothing usable" });
    await turn(d, start(), "I learn Soft Step.");
    expect(lineAsks(d)).toBe(0);
  });

  test("a level that brings a perk point says so; one that does not says nothing of perks", async () => {
    const r = withTrees();
    r.sheet.xp = xpToNext(1) - 1;
    const t = await turn(deps({ back: { xp: { size: 3 }, minutes: 2 } }), r, "I sneak past the goblin.");
    expect(t.run.sheet.level).toBe(2);
    expect(t.report.changes).toContain("Level 2 brings a perk point: 2 perk points to spend.");
    const next = structuredClone(t.run);
    next.sheet.xp = xpToNext(2) - 1;
    const t3 = await turn(deps({ back: { xp: { size: 3 }, minutes: 2 } }), next, "I sneak past the goblin.");
    expect(t3.run.sheet.level).toBe(3);
    expect(t3.report.changes.join(" ")).not.toContain("perk point");
  });

  test("an old keeping perk still spares a character who would be brought down, once a level", async () => {
    const r = start();
    perksOf(r).held.push(held({ name: "Steady Heart", effect: "keep", target: "" }));
    const hit = { hp: [{ who: "player", delta: -200 }], minutes: 2 };
    const first = await turn(deps({ back: hit }), r, "I sneak past the goblin.");
    expect(first.run.downs).toBe(0);
    expect(first.run.sheet.hp).toBe(10);
    const second = await turn(deps({ back: hit }), first.run, "I sneak past the goblin.");
    expect(second.run.downs).toBe(1);
  });

  test("an old experience perk still adds its share to the deed", async () => {
    const r = start();
    perksOf(r).held.push(held({ name: "Silver Tongue", effect: "xp", when: "social", target: "" }));
    const judge = { ...JUDGE, target: "Mara", skill: "Haggling", attribute: "charisma" };
    const t = await turn(deps({ judge, back: { xp: { size: 3 }, minutes: 2 } }), r, "I haggle with Mara.");
    expect(t.report.changes.join(" ")).toContain("Silver Tongue");
  });
});

describe("what the board is given", () => {
  test("who you are: level, experience, health, the five attributes, skills by name, abilities and whether they are ready", () => {
    const r = withTrees();
    r.sheet.abilities.push({ name: "Hard Look", text: "Stares a liar down.", tier: 1, kind: "innate", wait: 3 });
    const s = selfShow(r);
    expect(s).toMatchObject({ kind: "self", name: "Jay", calling: "Road clerk", level: 1, xp: [0, 100], hp: [100, 100], points: 0 });
    expect(s.toPlace).toBeUndefined();
    expect(s.attributes.map((a) => [a.id, a.name, a.score, a.choices.length])).toEqual([["strength", "Strength", 4, 0], ["dexterity", "Dexterity", 5, 0], ["intelligence", "Intelligence", 3, 0], ["charisma", "Charisma", 2, 0], ["cunning", "Cunning", 6, 0]]);
    expect(s.attributes.every((a) => a.text.length > 10)).toBe(true);
    expect(s.skills.map((k) => [k.name, k.level, k.most])).toEqual([["Haggling", 2, 10], ["Stealth", 3, 10]]);
    expect(s.skills[1]!.xp[1]).toBeGreaterThan(0);
    expect(s.abilities).toEqual([
      { name: "Quick Count", text: "Counts anything at a glance.", rank: "basic", wait: 0, note: "Ready.", choices: [{ say: "Call on it", line: "I call on Quick Count to " }] },
      { name: "Hard Look", text: "Stares a liar down.", rank: "strong", wait: 3, note: "Resting: ready in 3 turns.", choices: [] },
    ]);
  });

  test("while points remain each attribute offers the line that puts one there", () => {
    const r = withTrees();
    r.sheet.points = 3;
    const s = selfShow(r);
    expect(s.toPlace).toBe("3 points to place.");
    expect(s.attributes[0]).toMatchObject({ note: "3 points to place. A point placed stays placed.", choices: [{ say: "Put a point here", line: "I put one point into Strength." }] });
  });

  test("the trees: what is learned, what is within reach, what is far, and the one line each offers", () => {
    const r = withTrees();
    r.sheet.level = 2;
    const st = perksOf(r);
    Object.assign(perkNamed(st, "Soft Step")!, { learned: true, active: true });
    const p = selfShow(r).perks;
    expect(p).toMatchObject({ points: 1, active: 1, most: 3, note: "1 perk point to spend. 1 of 3 active.", old: [] });
    expect(p.trees.map((t) => [t.id, t.name, t.perks.length])).toEqual([["t1", "Quiet Roads", 5], ["t2", "Ledger Mind", 5], ["t3", "Salt Blood", 5]]);
    const by = (name: string) => p.trees.flatMap((t) => t.perks).find((x) => x.name === name)!;
    expect(by("Soft Step")).toMatchObject({ state: "learned", active: true, depth: 0, parent: null, note: SELF_WORDS.isActive, choices: [{ say: "Make it inactive", line: "I make my perk Soft Step inactive." }] });
    expect(by("Shadow Habit")).toMatchObject({ state: "reach", depth: 1, parent: "t1-0", note: "Within reach. You have 1 perk point to spend.", choices: [{ say: "Learn it", line: "I learn the perk Shadow Habit and make it active." }] });
    expect(by("Unseen Passage")).toMatchObject({ state: "far", depth: 2, note: "Out of reach: Shadow Habit must be learned first.", choices: [] });
    expect(by("Ghost of the Road").depth).toBe(3);
    expect(by("Ready Count").state).toBe("reach");
    perkNamed(st, "Shadow Habit")!.learned = true;
    const q = selfShow(r).perks.trees.flatMap((t) => t.perks);
    expect(q.find((x) => x.name === "Shadow Habit")).toMatchObject({ state: "learned", active: false, note: SELF_WORDS.isLearned, choices: [{ say: "Make it active", line: "I make my perk Shadow Habit active." }] });
    expect(q.find((x) => x.name === "Ready Count")).toMatchObject({ state: "reach", note: "Within reach, but you have no perk point: the next comes at level 4.", choices: [] });
  });

  test("the system shows the board and no cards, writes a page, and teaches the board, then the perks once there is a point", () => {
    const d = deps();
    const r = withTrees();
    expect(showsOf(d, r).map((s) => s.kind)).toEqual(["self"]);
    expect(pagesOf(d, r)[0]!.his.join("\n")).toContain("Quiet Roads:\n  Soft Step [within reach]: ");
    expect(pagesOf(d, start())).toEqual([]);
    expect(lessonOf(d, r)).toBe(SELF_LESSON);
    expect(lessonOf(d, r)).toBe(PERKS_LESSON);
    expect(lessonOf(d, r)).toBeNull();
    const none = start();
    expect(lessonOf(d, none)).toBe(SELF_LESSON);
    expect(lessonOf(d, none)).toBeNull();
    const spent = withTrees();
    perkNamed(perksOf(spent), "Soft Step")!.learned = true;
    spent.taught = ["self"];
    expect(lessonOf(d, spent)).toBeNull();
  });

  test("the scene tells every model the perks within reach while there is a point, and that such a line is story", () => {
    const d = deps();
    const r = withTrees();
    expect(sceneOf(d, r)).toContain("PERKS: Jay has 1 perk point and may learn one of these whenever the player likes: Soft Step; Ready Count; Road Hardened.");
    expect(sceneOf(d, r)).toContain(`(kind "story")`);
    expect(sceneOf(d, start())).not.toContain("PERK");
  });
});
