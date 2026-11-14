import { describe, expect, test } from "bun:test";
import type { DecisionAnswer } from "lumiverse-spindle-types";
import {
  addXp, allowed, checkPerk, earned, effectWords, holds, keeper, offerOf, peekPerks, perkModifiers, perksOf, REST_LESS, restLess, ROLL_CAP, takePerk, xpBonus,
  type Perk,
} from "../src/engine/perks.js";
import { attributesFrom, meet, newRun, xpToNext, type Judged, type Run } from "../src/engine/run.js";
import type { Message, Role } from "../src/game/ask.js";
import { pagesOf, sceneOf, showsOf, turn } from "../src/game/runturn.js";
import type { RunDeps } from "../src/game/system.js";
import { byName, perks } from "../src/game/systems/perks.js";

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

const raw = (over: Partial<Record<"name" | "text" | "effect" | "target" | "when", string>> = {}) => ({ name: "Quiet Feet", text: "Moves without a sound.", effect: "skill", target: "stealth", when: "", ...over });
const mk = (r: Run, over = {}): Perk => checkPerk(r.sheet, raw(over), 2)!;
const judged = (over: Partial<Judged> = {}): Judged => ({ attribute: "dexterity", skill: "Stealth", scores: { physical: 0, likelihood: 0 }, ...over });

describe("checking a perk a model wrote", () => {
  test("a skill perk names a skill the sheet has, in the sheet's own spelling", () => {
    const r = start();
    expect(mk(r).target).toBe("Stealth");
    expect(checkPerk(r.sheet, raw({ target: "Juggling" }), 2)).toBeNull();
  });
  test("an attribute perk needs a real attribute and a known kind of moment", () => {
    const r = start();
    expect(checkPerk(r.sheet, raw({ effect: "attribute", target: "Cunning", when: "foe" }), 2)).toMatchObject({ target: "cunning", when: "foe" });
    expect(checkPerk(r.sheet, raw({ effect: "attribute", target: "luck", when: "foe" }), 2)).toBeNull();
    expect(checkPerk(r.sheet, raw({ effect: "attribute", target: "cunning", when: "when it rains" }), 2)).toBeNull();
  });
  test("a rest perk needs an ability the character has; losing it later is no harm", () => {
    const r = start();
    expect(checkPerk(r.sheet, raw({ effect: "rest", target: "the quick count" }), 2)?.target).toBe("Quick Count");
    expect(checkPerk(r.sheet, raw({ effect: "rest", target: "Fireball" }), 2)).toBeNull();
  });
  test("an experience perk names a kind of deed, and a skill when it is the skill kind", () => {
    const r = start();
    expect(checkPerk(r.sheet, raw({ effect: "xp", when: "social", target: "" }), 2)).toMatchObject({ when: "social" });
    expect(checkPerk(r.sheet, raw({ effect: "xp", when: "skill", target: "haggling" }), 2)).toMatchObject({ when: "skill", target: "Haggling" });
    expect(checkPerk(r.sheet, raw({ effect: "xp", when: "skill", target: "juggling" }), 2)).toBeNull();
    expect(checkPerk(r.sheet, raw({ effect: "xp", when: "always" }), 2)).toBeNull();
  });
  test("an unknown effect, a number in the words, markup or a note left unfilled is no perk", () => {
    const r = start();
    expect(checkPerk(r.sheet, raw({ effect: "damage" }), 2)).toBeNull();
    expect(checkPerk(r.sheet, raw({ text: "Gives a +5 bonus to sneaking." }), 2)).toBeNull();
    expect(checkPerk(r.sheet, raw({ name: "Ghost 2" }), 2)).toBeNull();
    expect(checkPerk(r.sheet, raw({ name: "<2 to 4 words>" }), 2)).toBeNull();
    expect(checkPerk(r.sheet, raw({ text: "short" }), 2)).toBeNull();
  });
  test("a choice is of different kinds, at most three, and at least two, none already held", () => {
    const r = start();
    const st = perksOf(r);
    const a = mk(r), b = mk(r, { name: "Sharp Eye", effect: "rest", target: "Quick Count" }), c = mk(r, { name: "Steady Heart", effect: "keep", target: "" });
    const same2 = mk(r, { name: "Soft Steps" });
    expect(offerOf(st, [a, same2, b, c])?.map((p) => p.name)).toEqual(["Quiet Feet", "Sharp Eye", "Steady Heart"]);
    expect(offerOf(st, [a, same2, null])).toBeNull();
    st.held.push(a);
    expect(offerOf(st, [mk(r, { name: "Another Name" }), b, c])?.map((p) => p.name)).toEqual(["Sharp Eye", "Steady Heart"]);
    expect(allowed(st, mk(r, { name: "quiet feet", target: "Haggling" }))).toBe(false);
  });
});

describe("what a level earns", () => {
  test("a choice a level, within one to start and one more every second level, counting what is open and owed", () => {
    const r = start();
    const st = perksOf(r);
    expect(earned(st, 2, 1)).toBe(1);
    expect(earned(st, 2, 5)).toBe(2);
    st.owed = 2;
    expect(earned(st, 2, 1)).toBe(0);
    st.owed = 0;
    st.held.push(mk(r), mk(r, { name: "Sharp Eye", effect: "keep", target: "" }));
    expect(earned(st, 3, 1)).toBe(0);
    expect(earned(st, 4, 1)).toBe(1);
  });
  test("a perk is taken by name once, and the same one cannot be taken again", () => {
    const r = start();
    const st = perksOf(r);
    const a = mk(r), b = mk(r, { name: "Sharp Eye", effect: "keep", target: "" });
    st.offer = { level: 2, perks: [a, b] };
    expect(takePerk(st, "nothing like it", 2)).toBeNull();
    expect(takePerk(st, "quiet feet", 2)?.name).toBe("Quiet Feet");
    expect(st.offer).toBeNull();
    st.offer = { level: 3, perks: [mk(r, { name: "quiet feet again", target: "Stealth" }), b] };
    expect(takePerk(st, "quiet feet again", 3)).toBeNull();
    expect(st.held).toHaveLength(1);
  });
});

describe("the effects", () => {
  test("a skill perk adds a small bonus on rolls on that skill only", () => {
    const r = start();
    perksOf(r).held.push(mk(r));
    expect(perkModifiers(r, judged())).toEqual([{ what: "Quiet Feet", by: 5 }]);
    expect(perkModifiers(r, judged({ skill: "Haggling" }))).toEqual([]);
  });
  test("a skill perk whose skill has gone does nothing", () => {
    const r = start();
    perksOf(r).held.push(mk(r));
    r.sheet.skills = r.sheet.skills.filter((s) => s.name !== "Stealth");
    expect(perkModifiers(r, judged())).toEqual([]);
  });
  test("an attribute perk helps only when its kind of moment holds", () => {
    const r = start();
    perksOf(r).held.push(mk(r, { name: "Cold Blood", effect: "attribute", target: "dexterity", when: "foe" }));
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
    const st = perksOf(r);
    st.held.push(mk(r), mk(r, { name: "Cold Blood", effect: "attribute", target: "dexterity", when: "foe" }), mk(r, { name: "Gift Of Hands", effect: "attribute", target: "dexterity", when: "tool" }));
    const mods = perkModifiers(r, judged({ target: "Goblin", item: "Knife" }));
    expect(mods.reduce((n, m) => n + m.by, 0)).toBeLessThanOrEqual(ROLL_CAP);
    expect(mods).toHaveLength(2);
  });
  test("a rest perk shortens the rest of its own ability by one turn, and of no other", () => {
    const r = start();
    r.sheet.abilities.push({ name: "Hard Look", text: "Stares.", tier: 0, kind: "innate", wait: 2 });
    r.sheet.abilities[0]!.wait = 2;
    perksOf(r).held.push(mk(r, { name: "Sharp Eye", effect: "rest", target: "Quick Count" }));
    expect(restLess(r, "Hard Look")).toBe(false);
    expect(r.sheet.abilities[1]!.wait).toBe(2);
    expect(restLess(r, "Quick Count")).toBe(true);
    expect(r.sheet.abilities[0]!.wait).toBe(2 - REST_LESS);
    expect(restLess(r, null)).toBe(false);
    r.sheet.abilities[0]!.wait = 0;
    expect(restLess(r, "Quick Count")).toBe(false);
  });
  test("a keeping perk holds the character up once a level", () => {
    const r = start();
    const p = mk(r, { name: "Steady Heart", effect: "keep", target: "" });
    perksOf(r).held.push(p);
    expect(keeper(r)).toBe(p);
    p.used = r.sheet.level;
    expect(keeper(r)).toBeUndefined();
    r.sheet.level++;
    expect(keeper(r)).toBe(p);
  });
  test("an experience perk fits its deed, and pays a bounded share only for deeds that earn something", () => {
    const r = start();
    perksOf(r).held.push(mk(r, { name: "Silver Tongue", effect: "xp", when: "social", target: "" }));
    const deed = { social: true, fight: false, find: false, skill: "" };
    expect(xpBonus(r, deed, 2)).toBeNull();
    const b3 = xpBonus(r, deed, 3)!, b5 = xpBonus(r, deed, 5)!;
    expect(b3.extra).toBeGreaterThanOrEqual(1);
    expect(b5.extra).toBeGreaterThanOrEqual(b3.extra);
    expect(b5.extra).toBeLessThan(xpToNext(1));
    expect(xpBonus(r, { ...deed, social: false }, 5)).toBeNull();
  });
  test("an experience perk of a skill fits only the skill practised", () => {
    const r = start();
    perksOf(r).held.push(mk(r, { name: "Hard Bargain", effect: "xp", when: "skill", target: "Haggling" }));
    expect(xpBonus(r, { social: false, fight: false, find: false, skill: "haggling" }, 4)).not.toBeNull();
    expect(xpBonus(r, { social: false, fight: false, find: false, skill: "Stealth" }, 4)).toBeNull();
  });
  test("extra experience counts a level as the core does: three points each", () => {
    const r = start();
    r.sheet.xp = xpToNext(1) - 1;
    expect(addXp(r.sheet, 2)).toBe(1);
    expect(r.sheet).toMatchObject({ level: 2, points: 3, xp: 1 });
  });
  test("every perk says what it does in plain words", () => {
    const r = start();
    for (const p of [mk(r), mk(r, { effect: "attribute", target: "cunning", when: "crowd" }), mk(r, { effect: "rest", target: "Quick Count" }), mk(r, { effect: "keep", target: "" }), mk(r, { effect: "xp", when: "find", target: "" })])
      expect(effectWords(p)).toMatch(/^[A-Z].*\.$/);
  });
});

/* ------------------------------------------------- the hooks, with fake models ------------------------------------------------- */

const choice = (c: string, p = 0.9): DecisionAnswer => ({ type: "choice", choice: c, probabilities: { [c]: p } }) as unknown as DecisionAnswer;
const OFFER = {
  calling: null,
  perks: [
    { name: "Quiet Feet", text: "Moves without a sound.", effect: "skill", target: "Stealth", when: "" },
    { name: "Counting House Nerve", text: "Keeps a cool head with strangers.", effect: "attribute", target: "cunning", when: "social" },
    { name: "Steady Heart", text: "Does not stay down for long.", effect: "keep", target: "", when: "" },
  ],
};
const JUDGE = {
  kind: "action", act: "sneak past the goblin", target: "Goblin", item: null, item_named: false, needs_item: null, ability: null, ability_named: false,
  verdict: "challenge", reason: "It may see.", attribute: "dexterity", skill: "Stealth", for: [], against: [], scores: { physical: 0, likelihood: 0, item: null, ability: null, other: null },
};

interface Fake {
  offer?: unknown;
  take?: unknown;
  back?: unknown;
  decide?: (what: string) => Record<string, DecisionAnswer | undefined> | null;
  judge?: unknown;
}
function deps(f: Fake = {}): RunDeps & { calls: { role: Role; sys: string }[] } {
  const calls: { role: Role; sys: string }[] = [];
  return {
    calls,
    systems: [perks],
    ask: async (messages: Message[], role: Role) => {
      const sys = messages[0]!.content;
      calls.push({ role, sys });
      if (role === "teller") return "You slip by.";
      if (role === "builder") {
        const o = f.offer ?? OFFER;
        if (typeof o === "function") return JSON.stringify((o as () => unknown)());
        return typeof o === "string" ? o : JSON.stringify(o);
      }
      if (sys.includes("settles a choice")) return typeof f.take === "string" ? f.take : JSON.stringify(f.take ?? { take: null });
      if (sys.includes("referee")) return JSON.stringify(f.judge ?? JUDGE);
      if (sys.includes("records")) return JSON.stringify(f.back ?? { minutes: 2 });
      return "A summary of what has happened so far, long enough to be kept as one.";
    },
    ...(f.decide ? { decide: async (what: string) => f.decide!(what) } : {}),
  };
}

const withOffer = (): Run => {
  const r = start();
  r.sheet.level = 2;
  const st = perksOf(r);
  st.seen = 2;
  st.offer = { level: 2, perks: OFFER.perks.map((p) => checkPerk(r.sheet, p, 2)!) };
  return r;
};

describe("the system in a turn", () => {
  test("a level gained writes three perks that wait as an open choice, shown as cards and told in the scene", async () => {
    const r = start();
    r.sheet.xp = xpToNext(1) - 1;
    const d = deps({ back: { xp: { size: 3 }, minutes: 2 } });
    const t = await turn(d, r, "I sneak past the goblin.");
    const st = peekPerks(t.run);
    expect(t.run.sheet.level).toBe(2);
    expect(st.offer?.perks.map((p) => p.name)).toEqual(["Quiet Feet", "Counting House Nerve", "Steady Heart"]);
    expect(st.owed).toBe(0);
    expect(t.report.changes.join(" ")).toContain("brings a new knack to choose");
    for (const n of ["Quiet Feet", "Counting House Nerve", "Steady Heart"]) expect(sceneOf(d, t.run)).toContain(n);
    const cards = showsOf(d, t.run);
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({ kind: "card", group: "perks", title: "Quiet Feet", line: "I take Quiet Feet." });
    expect(pagesOf(d, t.run)[0]!.his.join("\n")).toContain("A choice is open");
    expect(d.calls.filter((c) => c.role === "builder")).toHaveLength(1);
  });

  test("a level that earns nothing, or no level, writes nothing and costs no extra call", async () => {
    const d = deps();
    const t = await turn(d, start(), "I sneak past the goblin.");
    expect(peekPerks(t.run).offer).toBeNull();
    expect(d.calls.filter((c) => c.role === "builder")).toHaveLength(0);
    expect(d.calls.filter((c) => c.sys.includes("settles a choice"))).toHaveLength(0);
  });

  test("a choice that cannot be written is tried again on later turns and given up after a few", async () => {
    let r = start();
    r.sheet.xp = xpToNext(1) - 1;
    const d = deps({ back: { xp: { size: 3 } }, offer: { perks: [{ name: "Only One", text: "One alone is no choice.", effect: "keep", target: "", when: "" }] } });
    const logged: string[] = [];
    d.log = (m) => void logged.push(m);
    for (let i = 0; i < 3; i++) r = (await turn(d, r, "I sneak past the goblin.")).run;
    const st = peekPerks(r);
    expect(st.offer).toBeNull();
    expect(st.owed).toBe(0);
    expect(logged.some((m) => m.includes("did not check"))).toBe(true);
  });

  test("several levels at once give one choice at a time", async () => {
    const r = start();
    r.sheet.xp = xpToNext(1) + xpToNext(2) - 1;
    const d = deps({ back: { xp: { size: 5 }, minutes: 2 } });
    r.sheet.xp = 0;
    r.sheet.level = 1;
    const t0 = await turn(d, r, "I sneak past the goblin.");
    const run = t0.run;
    // Two levels gained together, as the core counts them.
    run.sheet.level += 0;
    const st = perksOf(run);
    st.offer = null;
    st.owed = 0;
    st.seen = 1;
    run.sheet.level = 3;
    run.sheet.skills.push({ name: "Skulking", xp: 0, level: 1 });
    const t1 = await turn(deps({ back: { minutes: 1 } }), run, "I wait.");
    const after = peekPerks(t1.run);
    expect(after.offer).not.toBeNull();
    expect(after.owed).toBe(1);
  });

  test("the player takes a perk in any words: read by the fast model, applied in settle, not twice", async () => {
    const r = withOffer();
    const d = deps({ take: { take: "Steady Heart" }, judge: { ...JUDGE, kind: "story" } });
    const t = await turn(d, r, "I think I'll go with the one about not staying down.");
    const st = peekPerks(t.run);
    expect(st.held.map((p) => p.name)).toEqual(["Steady Heart"]);
    expect(st.offer).toBeNull();
    expect(d.calls.some((c) => c.sys.includes("settles a choice"))).toBe(true);
    const told = d.calls.filter((c) => c.role === "teller");
    expect(told).toHaveLength(1);
  });

  test("a line that only uses the skill takes nothing, and the choice stays open", async () => {
    const d = deps({ take: { take: null } });
    const t = await turn(d, withOffer(), "I creep forward, quiet as I can.");
    expect(peekPerks(t.run).held).toHaveLength(0);
    expect(peekPerks(t.run).offer).not.toBeNull();
  });

  test("an answer that names no perk of the choice takes nothing", async () => {
    const d = deps({ take: { take: "Fireball Hands" } });
    const t = await turn(d, withOffer(), "I take fireball hands.");
    expect(peekPerks(t.run).held).toHaveLength(0);
  });

  test("the Decision model, when sure, reads the choice without the fast model", async () => {
    const d = deps({ decide: (what) => (what === "perk" ? { choice: choice("p2") } : null), judge: { ...JUDGE, kind: "story" } });
    const t = await turn(d, withOffer(), "The second one.");
    expect(peekPerks(t.run).held.map((p) => p.name)).toEqual(["Counting House Nerve"]);
    expect(d.calls.some((c) => c.sys.includes("settles a choice"))).toBe(false);
  });

  test("the Decision model sure of none skips the fast model; unsure falls to it", async () => {
    const sureNone = deps({ decide: () => ({ choice: choice("none") }) });
    await turn(sureNone, withOffer(), "I look around.");
    expect(sureNone.calls.some((c) => c.sys.includes("settles a choice"))).toBe(false);
    const unsure = deps({ decide: () => ({ choice: choice("p1", 0.3) }), take: { take: "Quiet Feet" } });
    const t = await turn(unsure, withOffer(), "Quiet Feet, yes.");
    expect(unsure.calls.some((c) => c.sys.includes("settles a choice"))).toBe(true);
    expect(peekPerks(t.run).held.map((p) => p.name)).toEqual(["Quiet Feet"]);
  });

  test("with neither model giving an answer, the card's own line and the bare name still take it", async () => {
    const broken: RunDeps = { ...deps(), ask: async (m, role) => (role === "reader" && m[0]!.content.includes("settles a choice") ? "not json" : deps().ask(m, role)) };
    const t = await turn(broken, withOffer(), "I take Steady Heart.");
    expect(peekPerks(t.run).held.map((p) => p.name)).toEqual(["Steady Heart"]);
    expect(byName(withOffer().sys!.perks ? peekPerks(withOffer()).offer!.perks : [], "steady heart")?.name).toBe("Steady Heart");
    expect(byName(peekPerks(withOffer()).offer!.perks, "I creep along")).toBeNull();
  });

  test("with no choice open nothing is read from the line", async () => {
    const d = deps();
    await turn(d, start(), "I take Quiet Feet.");
    expect(d.calls.some((c) => c.sys.includes("settles a choice"))).toBe(false);
  });

  test("a perk's bonus reaches the roll, and its name is shown with it", async () => {
    const r = start();
    perksOf(r).held.push(mk(r));
    const t = await turn(deps(), r, "I sneak past the goblin.");
    expect(t.report.roll!.modifiers).toContainEqual({ what: "Quiet Feet", by: 5 });
  });

  test("a held perk is in the scene every model sees", () => {
    const r = start();
    perksOf(r).held.push(mk(r));
    expect(sceneOf(deps(), r)).toContain("KNACKS: Quiet Feet (Moves without a sound)");
  });

  test("a keeping perk spares a character who would be brought down, once a level", async () => {
    const r = start();
    perksOf(r).held.push(mk(r, { name: "Steady Heart", effect: "keep", target: "" }));
    const hit = { hp: [{ who: "player", delta: -200 }], minutes: 2 };
    const first = await turn(deps({ back: hit }), r, "I sneak past the goblin.");
    expect(first.run.downs).toBe(0);
    expect(first.run.sheet.hp).toBe(10);
    expect(first.report.changes.join(" ")).toContain("stay on your feet");
    const second = await turn(deps({ back: hit }), first.run, "I sneak past the goblin.");
    expect(second.run.downs).toBe(1);
  });

  test("an experience perk adds its share to the deed, and a level it brings is counted", async () => {
    const r = start();
    perksOf(r).held.push(mk(r, { name: "Silver Tongue", effect: "xp", when: "social", target: "" }));
    const judge = { ...JUDGE, target: "Mara", skill: "Haggling", attribute: "charisma" };
    const t = await turn(deps({ judge, back: { xp: { size: 3 }, minutes: 2 } }), r, "I haggle with Mara.");
    expect(t.report.changes.join(" ")).toContain("Silver Tongue");
    expect(t.run.sheet.xp).toBeGreaterThan(0);
    const nothing = await turn(deps({ judge, back: { xp: { size: 2 }, minutes: 2 } }), r, "I haggle with Mara.");
    expect(nothing.report.changes.join(" ")).not.toContain("Silver Tongue");
  });

  test("a calling is renamed only when the model says so on a level, and not often", async () => {
    const r = start();
    r.sheet.xp = xpToNext(1) - 1;
    r.sheet.level = 1;
    const early = await turn(deps({ back: { xp: { size: 3 } }, offer: { ...OFFER, calling: "Salt lord" } }), r, "I sneak past the goblin.");
    expect(early.run.sheet.calling).toBe("Road clerk");
    const late = start();
    late.sheet.level = 3;
    perksOf(late).seen = 3;
    late.sheet.xp = xpToNext(3) - 1;
    const t = await turn(deps({ back: { xp: { size: 3 } }, offer: { ...OFFER, calling: "Salt lord" } }), late, "I sneak past the goblin.");
    expect(t.run.sheet.level).toBe(4);
    expect(t.run.sheet.calling).toBe("Salt lord");
    expect(peekPerks(t.run).renamed).toBe(4);
    const again = await turn(deps({ back: { xp: { size: 3 } }, offer: { ...OFFER, calling: "Salt king" } }), { ...structuredClone(t.run), sheet: { ...structuredClone(t.run.sheet), xp: xpToNext(4) - 1 } }, "I sneak past the goblin.");
    expect(again.run.sheet.calling).toBe("Salt lord");
  });

  test("the choice survives a reload, and an old run with no state loads", async () => {
    const r = start();
    r.sheet.xp = xpToNext(1) - 1;
    const t = await turn(deps({ back: { xp: { size: 3 } } }), r, "I sneak past the goblin.");
    const back = JSON.parse(JSON.stringify(t.run)) as Run;
    expect(peekPerks(back).offer?.perks).toHaveLength(3);
    expect(showsOf(deps(), back)).toHaveLength(3);
    const old = start();
    expect(old.sys).toBeUndefined();
    expect(sceneOf(deps(), old)).not.toContain("KNACKS");
    expect(pagesOf(deps(), old)).toEqual([]);
    const t2 = await turn(deps(), old, "I sneak past the goblin.");
    expect(t2.story).toBe("You slip by.");
    // A state written before some of its fields existed gets their defaults.
    const partial = start();
    partial.sys = { perks: { held: [] } };
    expect(peekPerks(partial)).toMatchObject({ offer: null, owed: 0, renamed: 1 });
  });
});
