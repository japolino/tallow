/**
 * Tallow's backend inside Lumiverse (Spindle). It does two things for the room in the frontend, and nothing else:
 *   card   reads the chat's character card (needs the "characters" permission);
 *   ask    asks the user's model, with Lumiverse's own generation (needs "generation").
 * The game itself runs in the frontend. Nothing here decides anything, and the card is never changed.
 */
import type { SpindleAPI } from "lumiverse-spindle-types";
import type { CardInfo } from "./game/card.js";
import type { Message } from "./game/prompts.js";
import type { ToBackend, ToFrontend } from "./shared/protocol.js";

declare const spindle: SpindleAPI;

const send = (msg: ToFrontend, userId: string): void => spindle.sendToFrontend(msg, userId);
const text = (err: unknown): string => (err instanceof Error ? err.message : String(err));

async function card(userId: string, characterId: string): Promise<CardInfo | null> {
  const c = await spindle.characters.get(characterId, userId);
  if (!c) return null;
  return { name: c.name, description: c.description ?? "", personality: c.personality ?? "", scenario: c.scenario ?? "", firstMessage: (c.first_mes ?? "").slice(0, 4000) };
}

async function ask(userId: string, messages: Message[]): Promise<string> {
  const res = (await spindle.generate.quiet({ type: "quiet", messages, userId } as never)) as { content?: unknown };
  if (typeof res?.content !== "string" || !res.content.trim()) throw new Error("The model gave no answer.");
  return res.content;
}

spindle.onFrontendMessage(async (raw: unknown, userId: string) => {
  const msg = raw as ToBackend;
  if (!msg || typeof msg !== "object" || typeof (msg as { id?: unknown }).id !== "string") return;
  try {
    if (msg.type === "card") send({ type: "card", id: msg.id, card: await card(userId, msg.characterId) }, userId);
    else if (msg.type === "ask") send({ type: "answer", id: msg.id, text: await ask(userId, msg.messages) }, userId);
  } catch (err) {
    send({ type: "error", id: msg.id, error: text(err) }, userId);
    spindle.log.warn(`tallow: ${msg.type} failed: ${text(err)}`);
  }
});
