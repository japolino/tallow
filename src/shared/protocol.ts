/** Messages between Tallow's frontend (the room) and its backend (the card and the models). */
import type { DecisionAnswer, DecisionQuestion } from "lumiverse-spindle-types";
import type { ChatLine } from "../engine/chatbook.js";
import type { State } from "../engine/price.js";
import type { CardInfo } from "../game/card.js";
import type { PresetSnapshot } from "../game/preset.js";
import type { Message, Role } from "../game/ask.js";
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

/** [table] A chat's table as the drawer shows it (backend/table.ts). */
export interface TableView {
  on: boolean;
  state: State;
  /** What the player's last message did at the table. */
  ledger: string[];
  /** What has happened at the table since, for the next reply to tell. */
  news: string[];
  premise: string;
  canUndo: boolean;
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
  /** [book] The narrator's book for a hero at a card (engine/chapter.ts, bookFile), read from the user's own storage. */
  | { type: "book"; id: string; file: string }
  /** [book] Keep the book. */
  | { type: "book-keep"; id: string; file: string; book: unknown }
  /** [book] Whether Inlay Illustrator answers its shared-pictures endpoint for this user. */
  | { type: "pictures"; id: string }
  /** [book] One picture for a chapter, drawn by Inlay Illustrator; answered when it is ready or has failed. */
  | { type: "picture"; id: string; picture: { id: string; chatId: string; text: string } }
  /** [book] A picture's bytes, for a room that cannot load it by its address. */
  | { type: "image"; id: string; imageId: string }
  /** [chat book] An ordinary chat as its book reads it (backend/chat.ts): the messages after a place in it, cleaned. Only read. */
  | { type: "chat"; id: string; chatId: string; after: number }
  /** [chat book] Who a chat is between: its card in a few words, and the player's persona. */
  | { type: "who"; id: string; chatId: string }
  /** [table] The table kept under a chat: read it, deal a new one (with what the player is after), turn it on or off, take the last message back, or put it away. */
  | { type: "table"; id: string; chatId: string; do?: "deal" | "on" | "off" | "undo" | "drop"; premise?: string };

export type ToFrontend =
  | { type: "card"; id: string; card: CardInfo | null }
  | { type: "answer"; id: string; text: string }
  | { type: "preset"; id: string; snapshot: PresetSnapshot | null }
  | { type: "decided"; id: string; answers: Record<string, DecisionAnswer | undefined> | null }
  | { type: "models"; id: string; state: ModelsState }
  | { type: "lore"; id: string; entries: string[] }
  // [book] The narrator's book, its keeping, and its pictures.
  | { type: "book"; id: string; book: unknown }
  | { type: "book-kept"; id: string }
  | { type: "pictures"; id: string; ready: boolean }
  | { type: "picture"; id: string; picture: { imageId: string; url: string } | null; why?: string }
  | { type: "image"; id: string; data: string | null; mime?: string }
  | { type: "chat"; id: string; lines: ChatLine[]; earlier: ChatLine[]; last: number }
  | { type: "who"; id: string; card: { name: string; about: string }; hero: { name: string; who: string } }
  | { type: "table"; id: string; table: TableView | null }
  /** [table] Not an answer (its id is empty): a chat's table has changed. */
  | { type: "table-changed"; id: ""; chatId: string }
  /** [chat book] Not an answer (its id is empty): a reply has just been written in a chat, or a chat was branched. */
  | { type: "replied"; id: ""; chatId: string; kind: string }
  | { type: "error"; id: string; error: string };
