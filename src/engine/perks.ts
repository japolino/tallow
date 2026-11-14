/**
 * Perks. Pure and seeded, nothing here asks a model (game/systems/perks.ts does).
 *
 * PERK TREES, as the game this one follows has them. A character has three trees of perks, written once by a model
 * from the world and the character. A perk is a name and a sentence: a lasting trait, with no number behind it. Code
 * owns everything else about them:
 *
 *   points   a character has one perk point to start and one more at every second level, less the perks learned
 *            (the original, GameCharacter.GetAvailPerkPts).
 *   learning a perk is learned when it is not learned yet, the one above it in its tree is (a root has none above
 *            it), and there is a point for it (the original, GameplayManager.DoLearnPerk). Learning does not make it
 *            active.
 *   active   a learned perk is active or not; at most three are active at once (the original,
 *            GameplayManager.DoSetPerkActivated; PerkNode.MAX_ACTIVE_PERKS and the summary settings' maxActivePerks,
 *            both 3). An active perk is told to every model that is shown the character
 *            (GameCharacter.GetClassAndOrPerksStr); that is all it does.
 *
 * The original can also undo every perk learned, or have the trees written again, for a currency this game does not
 * have (GameplayManager.DoRespecPerks, DoRegenPerkTrees): neither is here.
 *
 * PERKS OF THE OLD KIND. Before the trees, a level here offered three perks to take one of, each with one small effect
 * that code enforced: a bonus on a roll, an ability that rests less, health kept when brought down, a little more
 * experience. None is offered any more. One already held in a saved run stays held and goes on doing what it did; the
 * second half of this file is what that takes, and nothing adds to `held`. Each of them counts as a perk learned when
 * points are counted, since it was paid for out of the same count.
 */
import { clean, LEVEL_CAP, MAX_HP, person, same, skillOf, stateOf, xpBase, xpToNext, type Judged, type Modifier, type Run, type Sheet } from "./run.js";

/* ------------------------------------------------- the trees ------------------------------------------------- */

/**
 * The shape of a character's perk trees. The original's code takes whatever shape its builder's answer parses to
 * (AIAsker.GenPerkTrees); these are the limits its builder is asked to keep (its perk-tree prompt: three trees, five to
 * eight perks in each, none more than five deep, no more than three under one perk, and a root with at least one under
 * it). Here code holds the answer to them.
 */
export const TREES = 3;
export const TREE_LEAST = 5;
export const TREE_MOST = 8;
export const DEPTH_MOST = 5;
export const CHILDREN_MOST = 3;
/** The most perks active at once (the original, PerkNode.MAX_ACTIVE_PERKS). */
export const ACTIVE_MOST = 3;

/** One perk of a tree. */
export interface PerkNode {
  /** Stable for the life of the trees: "t1-0" is the root of the first tree. */
  id: string;
  name: string;
  text: string;
  /** The id of the perk above it in its tree; null for a root. */
  parent: string | null;
  learned: boolean;
  active: boolean;
}

/** A tree: its name and its perks, the root first, each after the one above it. */
export interface PerkTree {
  name: string;
  perks: PerkNode[];
}

/** A perk as a model writes it: a name, a sentence, and the perks under it. */
export interface RawNode {
  name: string;
  text: string;
  children: RawNode[];
}
export interface RawTree {
  name: string;
  root: RawNode | null;
}

const NAME_MOST = 40, TEXT_MOST = 200;

/** A name or a sentence a model wrote that can be kept: not empty, no note left unfilled, no markup, and no number (a perk has none). */
const written = (v: string, least: number): boolean => v.length >= least && !/[<>{}\[\]]/.test(v) && !/\d|%/.test(v);

/**
 * A model's trees, checked whole: exactly three, each within the limits above, every name used once. Null when any
 * part of the answer does not check: an answer is kept whole or not at all.
 */
export function checkTrees(raw: readonly RawTree[]): PerkTree[] | null {
  if (raw.length !== TREES) return null;
  const names: string[] = [];
  const fresh = (name: string): boolean => {
    if (names.some((n) => same(n, name))) return false;
    names.push(name);
    return true;
  };
  const out: PerkTree[] = [];
  for (let t = 0; t < raw.length; t++) {
    const tree = raw[t]!;
    const title = clean(tree.name, NAME_MOST);
    if (!written(title, 2) || !tree.root || out.some((o) => same(o.name, title))) return null;
    const perks: PerkNode[] = [];
    const walk = (n: RawNode, parent: string | null, depth: number): boolean => {
      const name = clean(n.name, NAME_MOST), text = clean(n.text, TEXT_MOST);
      if (depth > DEPTH_MOST || !written(name, 3) || name.split(" ").length > 6 || !written(text, 12) || !fresh(name)) return false;
      if (n.children.length > CHILDREN_MOST) return false;
      const id = `t${t + 1}-${perks.length}`;
      perks.push({ id, name, text, parent, learned: false, active: false });
      if (perks.length > TREE_MOST) return false;
      return n.children.every((c) => walk(c, id, depth + 1));
    };
    if (!walk(tree.root, null, 1)) return null;
    if (perks.length < TREE_LEAST || !tree.root.children.length) return null;
    out.push({ name: title, perks });
  }
  return out;
}

export interface PerkState {
  /** The character's trees; none until they are written. */
  trees: PerkTree[];
  /** How many times the trees could not be written, and the turn before which they are not asked for again. */
  fails: number;
  askAt: number;
  /** What the last line that touched the perks came to, as the player is told it; `did` when it learned one or made one active. */
  last: { turn: number; told: string[]; did?: boolean } | null;
  /** Perks of the old kind, held from before the trees. Nothing adds to these. */
  held: Perk[];
}

const count = (v: unknown): number => Math.max(0, Math.round(Number(v) || 0));

/** Trees as they were saved, kept only if they still have the shape of trees. */
function savedTrees(v: unknown): PerkTree[] {
  if (!Array.isArray(v)) return [];
  const ok = v.every((t) => t && typeof t === "object" && typeof (t as PerkTree).name === "string" && Array.isArray((t as PerkTree).perks) && (t as PerkTree).perks.length > 0 && (t as PerkTree).perks.every((p) => p && typeof p.id === "string" && typeof p.name === "string"));
  return ok ? (v as PerkTree[]) : [];
}

function read(raw: Partial<PerkState>): PerkState {
  const last = raw.last && Array.isArray(raw.last.told) ? raw.last : null;
  return { trees: savedTrees(raw.trees), fails: count(raw.fails), askAt: count(raw.askAt), last, held: Array.isArray(raw.held) ? raw.held : [] };
}

/**
 * The perks' state in a run, made on first use. A run saved before the trees gets none (they are written at its next
 * turn), keeps the perks it held, and loses only a choice of the old kind that was still open: the point it stood for
 * is counted again.
 */
export function perksOf(r: Run): PerkState {
  const st = stateOf<Partial<PerkState>>(r, "perks", () => ({}));
  Object.assign(st, read(st));
  // What only the old kind of perk kept: an open choice, choices owed, the levels counted, the calling's last renaming.
  for (const gone of ["offer", "owed", "seen", "renamed"]) delete (st as Record<string, unknown>)[gone];
  return st as PerkState;
}

/** The same state, read without writing anything into the run (for the moments that must leave the run as it is). */
export function peekPerks(r: Run): PerkState {
  return read((r.sys?.perks ?? {}) as Partial<PerkState>);
}

/** Every perk of the trees, tree by tree. */
export const allPerks = (st: PerkState): PerkNode[] => st.trees.flatMap((t) => t.perks);

/** A perk of the trees by its name, as `same` reads names. */
export const perkNamed = (st: PerkState, name: string): PerkNode | undefined => allPerks(st).find((p) => same(p.name, name));

export const perkById = (st: PerkState, id: string | null): PerkNode | undefined => (id ? allPerks(st).find((p) => p.id === id) : undefined);

/**
 * The perk points still to spend at a level: one to start and one more at every second level, less what is learned
 * (the original, GameCharacter.GetAvailPerkPts). A perk of the old kind that is held counts as one learned.
 */
export function perkPoints(st: PerkState, level: number): number {
  return Math.max(0, 1 + Math.floor(level / 2) - allPerks(st).filter((p) => p.learned).length - st.held.length);
}

/** The level that brings the next perk point; null when no level left does. */
export function nextPointAt(level: number): number | null {
  const next = level + (level % 2 === 0 ? 2 : 1);
  return next <= LEVEL_CAP ? next : null;
}

/** Whether a perk could be learned if there were a point for it: not learned, and the one above it learned (the original, UiPerkNode.ArePrereqsMet). */
export function inReach(st: PerkState, p: PerkNode): boolean {
  return !p.learned && (p.parent === null || !!perkById(st, p.parent)?.learned);
}

export type Learnt = "ok" | "learned" | "above" | "points";

/** Learn a perk, by the rule the original keeps (GameplayManager.DoLearnPerk). Says why not when it is not learned. */
export function learn(st: PerkState, level: number, p: PerkNode): Learnt {
  if (p.learned) return "learned";
  if (!inReach(st, p)) return "above";
  if (perkPoints(st, level) < 1) return "points";
  p.learned = true;
  return "ok";
}

/** The perks that are active, in the trees' order, and never more than the most there may be (the original, GameCharacter.GetActivePerks). */
export const activePerks = (st: PerkState): PerkNode[] => allPerks(st).filter((p) => p.learned && p.active).slice(0, ACTIVE_MOST);

export type Switched = "ok" | "unlearned" | "full" | "already";

/** Make a learned perk active or not (the original, GameplayManager.DoSetPerkActivated). Says why not when nothing changes. */
export function setActive(st: PerkState, p: PerkNode, on: boolean): Switched {
  if (!p.learned) return "unlearned";
  if (p.active === on) return "already";
  if (on && activePerks(st).length >= ACTIVE_MOST) return "full";
  p.active = on;
  return "ok";
}

/* ------------------------------------------------- perks of the old kind, for runs saved with them ------------------------------------------------- */

export const EFFECTS = ["skill", "attribute", "rest", "keep", "xp"] as const;
export type Effect = (typeof EFFECTS)[number];

/** The kinds of situation an attribute perk may be tied to, each checkable from the judged line and the run alone. */
export const SITUATIONS = ["foe", "social", "tool", "gift", "wounded", "crowd"] as const;
export type Situation = (typeof SITUATIONS)[number];
export const SITUATION_SAYS: Record<Situation, string> = {
  foe: "the one acted against is someone hostile",
  social: "the one acted on is a person who is not hostile",
  tool: "a thing they carry is used",
  gift: "one of their abilities is called on",
  wounded: "their health is under half",
  crowd: "two or more hostile people are here",
};

/** The kinds of deed an experience perk may be tied to. */
export const DEEDS = ["social", "fight", "find", "skill"] as const;
export type DeedKind = (typeof DEEDS)[number];
export const DEED_SAYS: Record<DeedKind, string> = {
  social: "deeds done with people who are not hostile",
  fight: "deeds of fighting, or against hostile people",
  find: "deeds that bring in something found or earned",
  skill: "deeds that practise one named skill",
};

/** What each effect is worth. These are the rules; no model sets any of them. */
export const SKILL_BONUS = 5;
export const ATTRIBUTE_BONUS = 5;
/** The most the perks together may add to one roll, in hundredths (the rules' own bonuses run 5 to 15). */
export const ROLL_CAP = 10;
export const REST_LESS = 1;
/** The health kept when brought down. */
export const KEEP_HP = 10;
/** An experience perk adds this share of a base deed, by the size of the deed (sizes 3, 4 and 5; smaller ones earn nothing). */
export const XP_SHARE: Record<number, number> = { 3: 0.2, 4: 0.35, 5: 0.5 };

/** A perk of the old kind: a name, a sentence and one effect that code enforces. */
export interface Perk {
  name: string;
  text: string;
  effect: Effect;
  /** A skill, an attribute, or an ability, by effect; for an experience perk, a skill when the deed kind is "skill". */
  target: string;
  /** A situation for an attribute perk, a deed kind for an experience perk. */
  when: string;
  /** The level it was taken at. */
  level: number;
  /** For `keep`: the level it last held someone up. */
  used?: number;
}

const cap = (t: string): string => (t ? t[0]!.toUpperCase() + t.slice(1) : t);

/** What a perk of the old kind does, in plain words. */
export function effectWords(p: Perk): string {
  switch (p.effect) {
    case "skill":
      return `A small boost to your rolls on ${p.target}.`;
    case "attribute":
      return `A small boost to your rolls on ${cap(p.target)} when ${SITUATION_SAYS[p.when as Situation] ?? "the moment is right"}.`;
    case "rest":
      return `${p.target} is ready again ${REST_LESS === 1 ? "a turn" : `${REST_LESS} turns`} sooner after you use it.`;
    case "keep":
      return `Once a level, when you would be brought down, you stay on your feet with a little health left.`;
    case "xp":
      return `A little extra experience from ${p.when === "skill" ? `deeds that practise ${p.target}` : DEED_SAYS[p.when as DeedKind] ?? "some deeds"}, when they earn real experience.`;
    default:
      return "";
  }
}

/** Whether a kind of situation holds for a judged line, from the run as it stands after the turn's pass. */
export function holds(r: Run, j: Judged, when: string): boolean {
  const t = j.target ? person(r, j.target) : undefined;
  switch (when as Situation) {
    case "foe":
      return !!t && t.hostile && !t.dead;
    case "social":
      return !!t && !t.hostile && !t.dead;
    case "tool":
      return !!j.item;
    case "gift":
      return !!j.ability;
    case "wounded":
      return r.sheet.hp < MAX_HP / 2;
    case "crowd":
      return r.people.filter((x) => x.here && !x.dead && x.hostile).length >= 2;
    default:
      return false;
  }
}

/** The old perks' changes to one roll. A perk whose target is gone does nothing; together they add no more than the cap. */
export function perkModifiers(r: Run, j: Judged): Modifier[] {
  const out: Modifier[] = [];
  let sum = 0;
  const known = j.skill ? skillOf(r.sheet, j.skill) : undefined;
  for (const p of peekPerks(r).held) {
    let by = 0;
    if (p.effect === "skill" && known && same(known.name, p.target) && skillOf(r.sheet, p.target)) by = SKILL_BONUS;
    else if (p.effect === "attribute" && p.target === j.attribute && holds(r, j, p.when)) by = ATTRIBUTE_BONUS;
    if (!by || sum + by > ROLL_CAP) continue;
    sum += by;
    out.push({ what: p.name, by });
  }
  return out;
}

/** An ability called on this turn rests less, by what its old perk gives: only an ability the perk names, never below ready, once. */
export function restLess(r: Run, abilityName: string | null): boolean {
  if (!abilityName) return false;
  const a = r.sheet.abilities.find((x) => same(x.name, abilityName));
  if (!a || a.wait < 1) return false;
  if (!peekPerks(r).held.some((p) => p.effect === "rest" && same(p.target, a.name))) return false;
  a.wait = Math.max(0, a.wait - REST_LESS);
  return true;
}

/** The old perk that would hold the character up, if one is ready this level. */
export function keeper(r: Run): Perk | undefined {
  return peekPerks(r).held.find((p) => p.effect === "keep" && (p.used ?? 0) < r.sheet.level);
}

/** What a turn's deed was, for the old experience perks: read from the run before the turn and what was read back, never from words. */
export interface Deed {
  social: boolean;
  fight: boolean;
  find: boolean;
  skill: string;
}

/** The extra experience for a deed of this size, from the first old experience perk that fits; null when none does. */
export function xpBonus(r: Run, deed: Deed, size: number): { perk: Perk; extra: number } | null {
  const share = XP_SHARE[Math.max(0, Math.min(5, Math.round(size)))];
  if (!share || r.sheet.level >= LEVEL_CAP) return null;
  for (const p of peekPerks(r).held) {
    if (p.effect !== "xp") continue;
    const fits = p.when === "skill" ? !!deed.skill && same(deed.skill, p.target) && !!skillOf(r.sheet, p.target) : !!deed[p.when as "social" | "fight" | "find"];
    if (!fits) continue;
    const extra = Math.max(1, Math.ceil(xpBase(r.sheet.level) * share));
    return { perk: p, extra };
  }
  return null;
}

/** Experience added outside a deed's own size, counted as the core counts a level: three points each. Returns the levels gained. */
export function addXp(s: Sheet, extra: number): number {
  let gained = 0;
  s.xp += Math.max(0, Math.round(extra));
  while (s.level < LEVEL_CAP && s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level++;
    s.points += 3;
    gained++;
  }
  return gained;
}
