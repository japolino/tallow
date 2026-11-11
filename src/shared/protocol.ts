/** Messages between Tallow's frontend (the room) and its backend (the card and the models). */
import type { DecisionAnswer, DecisionQuestion } from "lumiverse-spindle-types";
import type { CardInfo } from "../game/card.js";
import type { Message, Role } from "../game/prompts.js";
import type { ModelsPatch, ReasoningPick } from "../meaning/models.js";

export interface ConnOption {
  id: string;
  name: string;
  model: string;
  isDefault: boolean;
}

/** What the drawer shows about the models: the choices made, and the connections in Lumiverse to choose from. */
export interface ModelsState {
  roles: Record<Role, { connectionId: string | null; reasoning: ReasoningPick }>;
  decision: string;
  embedding: string;
  llm: ConnOption[];
  /** Null when they cannot be read (no "decisions" permission). */
  decisions: ConnOption[] | null;
  embeddings: ConnOption[];
}

export type ToBackend =
  | { type: "card"; id: string; characterId: string }
  | { type: "ask"; id: string; role: Role; messages: Message[] }
  /** Small typed questions for the Decision model; answered with null when there is none or it failed. */
  | { type: "decide"; id: string; what: string; state: unknown; questions: Record<string, DecisionQuestion>; ms: number }
  /** The drawer: read the model choices, or change one. */
  | { type: "models"; id: string; patch?: ModelsPatch };

export type ToFrontend =
  | { type: "card"; id: string; card: CardInfo | null }
  | { type: "answer"; id: string; text: string }
  | { type: "decided"; id: string; answers: Record<string, DecisionAnswer | undefined> | null }
  | { type: "models"; id: string; state: ModelsState }
  | { type: "error"; id: string; error: string };
