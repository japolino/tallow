/**
 * Projects: wandering off on purpose (docs/MOONSHOT.md, 7.5), after Blades in the Dark's long-term projects.
 *
 * You name the goal in a line ("I want to open a shop that sells English breakfasts"). Code sizes it by ambition: a
 * clock of 4, 6, 8 or 12 segments, more when it is far beyond who you are. The narrator says what it needs, three or
 * four things, each a scene or one throw over a long stretch. It takes the story's time, and the other side uses that
 * time. A failure brings a complication, never a dead end. It pays off as something the other rules use.
 *
 * Pure: facts in, an answer out.
 */
import { seededRng } from "./dice.js";
import type { Scale } from "./effect.js";
import { SCALES } from "./effect.js";
import type { Tier } from "./moment.js";

export type Payoff = "income" | "place" | "people" | "weapon" | "name";
export const PAYOFFS: readonly Payoff[] = ["income", "place", "people", "weapon", "name"];

/** What each payoff does in the other rules. */
export const PAYOFF_DOES: Record<Payoff, string> = {
  income: "a supply at the start of every chapter",
  place: "somewhere safe, where people talk, so you overhear appointments",
  people: "a faction or a crowd starts friendly, or someone joins you",
  weapon: "an edge you can bring to one fight, or a move against the big bad's plan",
  name: "how a whole town or faction treats you",
};

export type Complication = "rival" | "debt" | "law" | "turns" | "hunger" | "notice";
export const COMPLICATIONS: Record<Complication, string> = {
  rival: "a rival sets up against you",
  debt: "you owe someone now",
  law: "the law takes an interest",
  turns: "the thing turns on you",
  hunger: "it costs more than you have: you go short",
  notice: "the other side hears of it",
};

/** A step the project needs: a scene to play, or one throw over a long stretch. */
export interface Need {
  what: string;
  /** "scene": played as a place; "stretch": one throw over hours or days. */
  how: "scene" | "stretch";
  /** Hours it takes, for a stretch. */
  hours?: number;
  done?: boolean;
}

export interface Project {
  id: string;
  /** The goal, in the player's words. */
  goal: string;
  segments: 4 | 6 | 8 | 12;
  filled: number;
  needs: Need[];
  payoff: Payoff[];
  /** What it is up against, for the gap: the size of what it means to change. */
  scale: Scale;
  complications: Complication[];
}

/** Words that say how big an ambition is. */
const GRAND = /\b(kingdom|empire|army|armies|valley|nation|guild|city|whole|every|all the|fleet|cult|church|crown|world|harvest|season)\b/i;
const SMALL = /\b(shop|stall|garden|recipe|song|boat|cart|cottage|a few|little|small|one)\b/i;

/** How big a goal's scale is, by its words: what it means to change. */
export function scaleOfGoal(goal: string): Scale {
  if (/\b(kingdom|empire|nation|world|crown)\b/i.test(goal)) return "army";
  if (/\b(valley|city|fleet|harvest|season|guild|church)\b/i.test(goal)) return "ship";
  if (/\b(army|armies|gang|crew|cult|band)\b/i.test(goal)) return "squad";
  return "person";
}

/**
 * The clock a goal needs: 4 for something small, 6 for a business or a hunt, 8 for something grand, 12 for something
 * that changes a whole place. Ambition far beyond who you are needs more: each step of scale over your own adds a size.
 */
export function sizeGoal(goal: string, yourScale: Scale = "person"): Project["segments"] {
  const sizes: Project["segments"][] = [4, 6, 8, 12];
  const business = /\b(sell|sells|selling|business|tavern|inn|trade|company)\b/i.test(goal);
  let i = GRAND.test(goal) ? 2 : business ? 1 : SMALL.test(goal) ? 0 : 1;
  if (/\b(train|breed|build|found|raise|tame)\b/i.test(goal) && i < 2) i += 1;
  const over = SCALES.indexOf(scaleOfGoal(goal)) - SCALES.indexOf(yourScale);
  i += Math.max(0, over - 1);
  return sizes[Math.min(3, i)]!;
}

/** The payoffs a goal's words suggest; income and a place for a business. */
export function payoffOf(goal: string): Payoff[] {
  const out: Payoff[] = [];
  if (/\b(shop|business|sell|sells|tavern|inn|stall|trade|farm|mine)\b/i.test(goal)) out.push("income", "place");
  if (/\b(army|ants|weapon|trap|poison|ruin|destroy|siege|crops)\b/i.test(goal)) out.push("weapon");
  if (/\b(friends|allies|followers|crew|guild|band|faction|recruit)\b/i.test(goal)) out.push("people");
  if (/\b(famous|known|name|reputation|honour|honor|title)\b/i.test(goal)) out.push("name");
  if (/\b(house|hideout|base|home|lair|keep)\b/i.test(goal) && !out.includes("place")) out.push("place");
  return out.length ? [...new Set(out)].slice(0, 2) : ["name"];
}

/** A project from a goal in the player's words, with the needs the narrator says (from a model, or a stock three). */
export function startProject(id: string, goal: string, needs?: Need[], yourScale: Scale = "person"): Project {
  const segments = sizeGoal(goal, yourScale);
  const stock: Need[] = [
    { what: "find out what it takes", how: "scene" },
    { what: "get what you need for it", how: "stretch", hours: 6 },
    { what: "the day it is put to the test", how: "scene" },
  ];
  return { id, goal: goal.replace(/\s+/g, " ").trim().slice(0, 160), segments, filled: 0, needs: (needs?.length ? needs : stock).slice(0, 4).map((n) => ({ ...n, done: false })), payoff: payoffOf(goal), scale: scaleOfGoal(goal), complications: [] };
}

/** Segments a try at a project fills, by how it went: a 20 three, a success two, at a cost one, a failure none. */
export const SEGMENTS_FOR: Record<Tier, number> = { crit_success: 3, success: 2, partial: 1, fail: 0, crit_fail: 0 };

/**
 * Work on a project: fill segments by how it went, mark the need done when it worked, and on a failure (or a cost) a
 * complication, never a dead end. Done when the clock is full.
 */
export function workOn(p: Project, tier: Tier, need: number, seed: string): { project: Project; complication?: Complication; done: boolean } {
  const filled = Math.min(p.segments, p.filled + SEGMENTS_FOR[tier]);
  const worked = tier === "crit_success" || tier === "success" || tier === "partial";
  const needs = p.needs.map((n, i) => (i === need && worked ? { ...n, done: true } : n));
  let complication: Complication | undefined;
  if (tier === "fail" || tier === "crit_fail" || (tier === "partial" && seededRng(`comp:${seed}`)() < 0.5)) {
    const kinds = Object.keys(COMPLICATIONS) as Complication[];
    const fresh = kinds.filter((k) => !p.complications.includes(k));
    const pool = fresh.length ? fresh : kinds;
    complication = pool[Math.floor(seededRng(`which:${seed}`)() * pool.length)]!;
  }
  const project = { ...p, filled, needs, complications: complication ? [...p.complications, complication] : p.complications };
  return { project, ...(complication ? { complication } : {}), done: filled >= p.segments };
}

/** Whether a line names a goal of your own ("I want to open a shop...", "let's start a business..."). */
export function goalNamed(line: string): string | null {
  const m = /\b(?:i|we)\s+(?:want|wanna|mean|plan|intend|would like|'d like)\s+to\s+(open|start|build|found|train|breed|raise|run|set up|make|become|find|hunt for|search for|dig for)\s+(.{4,140})/i.exec(line) ?? /\blet'?s\s+(open|start|build|found|train|breed|raise|run|set up|search for|hunt for|dig for)\s+(.{4,140})/i.exec(line);
  return m ? `${m[1]} ${m[2]!.replace(/[.!]+$/, "")}`.trim() : null;
}

/** The clock in words, for the narrator: "the breakfast shop: 2 of 6, still to do: find eggs and bacon". */
export function projectSaid(p: Project): string {
  const left = p.needs.filter((n) => !n.done).map((n) => n.what);
  // Said as a sentence of its own: "Open a shop that sells pies: 0 of 6".
  return `${p.goal.charAt(0).toUpperCase()}${p.goal.slice(1)}: ${p.filled} of ${p.segments}${left.length ? `, still to do: ${left.join("; ")}` : ""}. When it is done: ${p.payoff.map((x) => PAYOFF_DOES[x]).join("; ")}.`;
}
