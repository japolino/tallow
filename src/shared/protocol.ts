/** Messages between Tallow's frontend (the room) and its backend (the card and the models). */
import type { DecisionAnswer, DecisionQuestion } from "lumiverse-spindle-types";
import type { CardInfo } from "../game/card.js";
import type { PresetSnapshot } from "../game/preset.js";
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
  /** `parameters`: the settings of the story's preset (game/preset.ts), for a narration written under it. */
  | { type: "ask"; id: string; role: Role; messages: Message[]; parameters?: Record<string, unknown> }
  /** The chat's preset as it is now, as a story keeps it (game/preset.ts); null when there is none, or it cannot be read. */
  | { type: "preset"; id: string; chatId: string }
  /** Small typed questions for the Decision model; answered with null when there is none or it failed. */
  | { type: "decide"; id: string; what: string; state: unknown; questions: Record<string, DecisionQuestion>; ms: number }
  /** The drawer: read the model choices, or change one. */
  | { type: "models"; id: string; patch?: ModelsPatch }
  /** The card's lore nearest a scene, by meaning when there is an embedding model (backend.ts, loreNear). */
  | { type: "lore"; id: string; characterId: string; text: string };

export type ToFrontend =
  | { type: "card"; id: string; card: CardInfo | null }
  | { type: "answer"; id: string; text: string }
  | { type: "preset"; id: string; snapshot: PresetSnapshot | null }
  | { type: "decided"; id: string; answers: Record<string, DecisionAnswer | undefined> | null }
  | { type: "models"; id: string; state: ModelsState }
  | { type: "lore"; id: string; entries: string[] }
  | { type: "error"; id: string; error: string };
