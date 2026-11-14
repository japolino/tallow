/**
 * Perks: what a level brings besides points. Pure and seeded, nothing here asks a model (game/systems/perks.ts does).
 *
 * A perk is a name, a sentence and one effect from a short menu that code owns. A model writes the name and the sentence
 * and picks the effect and its target; code checks the pick against the sheet and sets every number. Every effect is
 * small, bounded, and checkable by code alone at the moment it applies:
 *
 *   skill      a small bonus to rolls on one named skill the character has.
 *   attribute  a small bonus to rolls on one attribute, when one stated kind of situation holds.
 *   rest       one named ability rests a turn less after it is used.
 *   keep       once a level, brought down, the character stays on their feet with a little health.
 *   xp         a little more experience from one kind of deed worth real experience.
 *
 * The original game keeps its perks as sentences only, which are told to the models and never enforced; what it does
 * enforce is how many may be learned (one more at every second level, and one to start) and that none is learned twice.
 */
import { ATTRIBUTES, clean, LEVEL_CAP, MAX_HP, person, same, skillOf, stateOf, xpBase, xpToNext, type Attribute, type Judged, type Modifier, type Run, type Sheet } from "./run.js";

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
/** A calling may be renamed only when this many levels have passed since the last time (the start counts as level 1). */
export const RENAME_GAP = 3;
/** After this many failed attempts to write a choice, the choice is dropped. */
export const GIVE_UP = 3;

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

export interface PerkState {
  held: Perk[];
  /** The choice that is open: three perks to take one of, or none. */
  offer: { level: number; perks: Perk[] } | null;
  /** Choices earned and not yet written. */
  owed: number;
  fails: number;
  /** The highest level already counted. */
  seen: number;
  /** The level the calling was last renamed at. */
  renamed: number;
}

/** The perks' state in a run, made on first use; a run saved before it existed (or before a field) gets its defaults. */
export function perksOf(r: Run): PerkState {
  const st = stateOf<Partial<PerkState>>(r, "perks", () => ({}));
  st.held = Array.isArray(st.held) ? st.held : [];
  st.offer = st.offer && Array.isArray(st.offer.perks) && st.offer.perks.length ? st.offer : null;
  st.owed = Math.max(0, Math.round(Number(st.owed) || 0));
  st.fails = Math.max(0, Math.round(Number(st.fails) || 0));
  st.seen = Number.isFinite(Number(st.seen)) && Number(st.seen) >= 1 ? Math.round(Number(st.seen)) : 0;
  st.renamed = Number.isFinite(Number(st.renamed)) && Number(st.renamed) >= 1 ? Math.round(Number(st.renamed)) : 1;
  return st as PerkState;
}

/** The same state, read without writing anything into the run (for the moments that must leave the run as it is). */
export function peekPerks(r: Run): PerkState {
  const raw = (r.sys?.perks ?? {}) as Partial<PerkState>;
  const offer = raw.offer && Array.isArray(raw.offer.perks) && raw.offer.perks.length ? raw.offer : null;
  return {
    held: Array.isArray(raw.held) ? raw.held : [],
    offer,
    owed: Math.max(0, Math.round(Number(raw.owed) || 0)),
    fails: Math.max(0, Math.round(Number(raw.fails) || 0)),
    seen: Math.max(0, Math.round(Number(raw.seen) || 0)),
    renamed: Math.max(1, Math.round(Number(raw.renamed) || 1)),
  };
}

/* ------------------------------------------------- checking what a model wrote ------------------------------------------------- */

const key = (p: Perk): string => `${p.effect}|${p.effect === "rest" || p.effect === "skill" ? p.target.toLowerCase() : p.effect === "attribute" ? `${p.target}|${p.when}` : p.effect === "xp" ? `${p.when}|${p.when === "skill" ? p.target.toLowerCase() : ""}` : ""}`;

/** A model's perk, checked against the sheet and made whole by the rules. Null when any part of it does not check. */
export function checkPerk(s: Sheet, raw: { name: string; text: string; effect: string; target: string; when: string }, level: number): Perk | null {
  const name = clean(raw.name, 40), text = clean(raw.text, 180);
  const effect = clean(raw.effect, 20).toLowerCase() as Effect;
  if (name.length < 3 || name.split(" ").length > 5 || text.length < 12) return null;
  // Numbers are the game's own: a name or sentence with one in it is no answer.
  if (/\d/.test(name) || /\d/.test(text) || /[<>{}]/.test(name + text)) return null;
  if (!EFFECTS.includes(effect)) return null;
  const target = clean(raw.target, 60), when = clean(raw.when, 20).toLowerCase();
  const perk: Perk = { name, text, effect, target: "", when: "", level };
  if (effect === "skill") {
    const sk = skillOf(s, target);
    if (!sk) return null;
    perk.target = sk.name;
  } else if (effect === "attribute") {
    const a = target.toLowerCase() as Attribute;
    if (!ATTRIBUTES.includes(a) || !SITUATIONS.includes(when as Situation)) return null;
    perk.target = a;
    perk.when = when;
  } else if (effect === "rest") {
    const ab = s.abilities.find((x) => same(x.name, target));
    if (!ab) return null;
    perk.target = ab.name;
  } else if (effect === "xp") {
    if (!DEEDS.includes(when as DeedKind)) return null;
    perk.when = when;
    if (when === "skill") {
      const sk = skillOf(s, target);
      if (!sk) return null;
      perk.target = sk.name;
    }
  }
  return perk;
}

/** Whether a perk may still be taken: not the same name, not the same effect on the same target, and only one of keeping. */
export function allowed(st: PerkState, p: Perk): boolean {
  return !st.held.some((h) => same(h.name, p.name) || key(h) === key(p));
}

/** The perks of an offer: those that check, each with an effect of its own kind, at most three, and at least two. Null otherwise. */
export function offerOf(st: PerkState, perks: readonly (Perk | null)[]): Perk[] | null {
  const out: Perk[] = [];
  for (const p of perks) {
    if (!p || !allowed(st, p)) continue;
    if (out.some((o) => o.effect === p.effect || same(o.name, p.name))) continue;
    out.push(p);
    if (out.length === 3) break;
  }
  return out.length >= 2 ? out : null;
}

/** How many choices a level gained brings: one a level, within the original's rule of one to start and one more every second level. */
export function earned(st: PerkState, level: number, gained: number): number {
  const room = 1 + Math.floor(level / 2) - st.held.length - (st.offer ? 1 : 0) - st.owed;
  return Math.max(0, Math.min(gained, room));
}

/** Take a perk of the open choice, by its name. Returns it, or null when none is open or the name is not one of them. */
export function takePerk(st: PerkState, name: string, level: number): Perk | null {
  const p = st.offer?.perks.find((x) => same(x.name, name));
  if (!st.offer || !p || !allowed(st, p)) return null;
  st.held.push({ ...p, level });
  st.offer = null;
  st.owed = Math.max(0, st.owed);
  return p;
}

/* ------------------------------------------------- what a perk does ------------------------------------------------- */

const cap = (t: string): string => (t ? t[0]!.toUpperCase() + t.slice(1) : t);

/** What a perk does, in plain words. */
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

/** The perks' changes to one roll. A perk whose target is gone does nothing; together they add no more than the cap. */
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

/** An ability called on this turn rests less, by what its perk gives: only an ability the perk names, never below ready, once. */
export function restLess(r: Run, abilityName: string | null): boolean {
  if (!abilityName) return false;
  const a = r.sheet.abilities.find((x) => same(x.name, abilityName));
  if (!a || a.wait < 1) return false;
  if (!peekPerks(r).held.some((p) => p.effect === "rest" && same(p.target, a.name))) return false;
  a.wait = Math.max(0, a.wait - REST_LESS);
  return true;
}

/** The perk that would hold the character up, if one is ready this level. */
export function keeper(r: Run): Perk | undefined {
  return peekPerks(r).held.find((p) => p.effect === "keep" && (p.used ?? 0) < r.sheet.level);
}

/** What a turn's deed was, for the experience perks: read from the run before the turn and what was read back, never from words. */
export interface Deed {
  social: boolean;
  fight: boolean;
  find: boolean;
  skill: string;
}

/** The extra experience for a deed of this size, from the first experience perk that fits; 0 when none does. */
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
