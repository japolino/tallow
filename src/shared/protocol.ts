/** Messages between Tallow's frontend (the room) and its backend (the card and the models). */
import type { DecisionAnswer, DecisionQuestion } from "lumiverse-spindle-types";
import type { CardInfo } from "../game/card.js";
import type { PresetSnapshot } from "../game/preset.js";
import type { Message, Role } from "../game/ask.js";
import type { ModelsPatch, ReasoningPick } from "../meaning/models.js";
import type { WireRound } from "./tablewire.js";

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
  | { type: "lore"; id: string; characterId: string; text: string }
  /**
   * A table for several (backend/table.ts), asked by the room's host: sit down at this chat's table, set up from the
   * card the first time. `rules` are how hard the host has the game set; `player` is the host's own name at the table.
   */
  | { type: "table"; id: string; chatId: string; characterId: string; seed: number; rules: unknown; player: string; hostId?: string }
  /** The host changed how hard the game is. */
  | { type: "tablerules"; id: string; chatId: string; rules: unknown }
  /** A guest's own persona, to sit down as: their character's name and page. */
  | { type: "persona"; id: string };

export type ToFrontend =
  | { type: "card"; id: string; card: CardInfo | null }
  | { type: "answer"; id: string; text: string }
  | { type: "preset"; id: string; snapshot: PresetSnapshot | null }
  | { type: "decided"; id: string; answers: Record<string, DecisionAnswer | undefined> | null }
  | { type: "models"; id: string; state: ModelsState }
  | { type: "lore"; id: string; entries: string[] }
  /** The table as every player's Tallow reads it from the narrator's message; null when none could be set up. */
  | { type: "table"; id: string; round: WireRound | null }
  | { type: "persona"; id: string; persona: { name: string; who: string } | null }
  | { type: "done"; id: string }
  | { type: "error"; id: string; error: string };
