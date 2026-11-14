/**
 * Small typed questions put to the user's Decision model, when they have one (Lumiverse's Decision API): an answer
 * with how sure the model is, in about a second. The asking goes through the backend (src/backend/models.ts).
 */
import type { DecisionAnswer, DecisionQuestion } from "lumiverse-spindle-types";

/** Ask the Decision model. Null when there is none, it failed, or it ran past `ms`. */
export type Decide = (what: string, state: unknown, questions: Record<string, DecisionQuestion>, ms: number) => Promise<Record<string, DecisionAnswer | undefined> | null>;

/** How sure an answer must be to be taken: below this, the next way of answering is tried. */
export const SURE = 0.55;

/** The choice of an answer when it is sure enough, else null. */
export function sureChoice(a: DecisionAnswer | undefined, min = SURE): string | null {
  if (!a || a.type !== "choice") return null;
  const p = Number(a.probabilities?.[a.choice] ?? a.confidence ?? 0);
  return p >= min ? a.choice : null;
}
