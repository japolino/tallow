/** Messages between Tallow's frontend (the room) and its backend (the card and the model). */
import type { CardInfo } from "../game/card.js";
import type { Message, Role } from "../game/prompts.js";

export type ToBackend = { type: "card"; id: string; characterId: string } | { type: "ask"; id: string; role: Role; messages: Message[] };

export type ToFrontend = { type: "card"; id: string; card: CardInfo | null } | { type: "answer"; id: string; text: string } | { type: "error"; id: string; error: string };
