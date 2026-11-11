/**
 * Tallow's backend inside Lumiverse (Spindle). It does three things for the room in the frontend, and nothing else:
 *   card    reads the chat's character card (needs the "characters" permission), with a few entries of its lorebook
 *           when it has one (needs "world_books"; picked by meaning when there is an embedding model, "embeddings");
 *   ask     asks the user's model, each job on its own connection and reasoning (needs "generation");
 *   decide  asks the Decision model small typed questions (needs "decisions").
 * The game itself runs in the frontend. Nothing here decides anything, and the card is never changed. Every extra
 * (lore, decisions, embeddings) may be missing: the game goes on without it.
 */
import type { SpindleAPI, WorldBookEntryDTO } from "lumiverse-spindle-types";
import { createModels } from "./backend/models.js";
import type { CardInfo } from "./game/card.js";
import { loreQuery, loreText, pickLore, LORE_MAX, type LoreEntry } from "./game/lore.js";
import { cosine } from "./meaning/models.js";
import type { ToBackend, ToFrontend } from "./shared/protocol.js";

declare const spindle: SpindleAPI;

const models = createModels(spindle);
const send = (msg: ToFrontend, userId: string): void => spindle.sendToFrontend(msg, userId);
const text = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const MAX_BOOKS = 3;
const MAX_ENTRIES = 400;

/** The card's own lorebooks, as entries the builder may be given. Empty when there are none or they cannot be read. */
async function loreOf(userId: string, bookIds: readonly string[]): Promise<LoreEntry[]> {
  if (!bookIds.length || !spindle.world_books?.entries) return [];
  const out: LoreEntry[] = [];
  for (const id of bookIds.slice(0, MAX_BOOKS)) {
    try {
      const entries: WorldBookEntryDTO[] = [];
      for (let offset = 0; offset < MAX_ENTRIES; offset += 200) {
        const { data, total } = await spindle.world_books.entries.list(id, { limit: 200, offset, userId });
        entries.push(...data);
        if (!data.length || entries.length >= total) break;
      }
      for (const e of entries)
        if (!e.disabled && e.content?.trim())
          out.push({ title: e.comment?.trim() || e.key?.[0] || "entry", keys: [...(e.key ?? []), ...(e.keysecondary ?? [])].filter((k) => typeof k === "string" && k.trim()), content: e.content, constant: !!e.constant, order: e.order_value ?? 0 });
    } catch (err) {
      // No "world_books" permission, or a book that is gone: the card is read without it.
      spindle.log.info(`tallow: a lorebook could not be read (${text(err).slice(0, 120)})`);
      return out;
    }
  }
  return out;
}

async function card(userId: string, characterId: string): Promise<CardInfo | null> {
  const c = await spindle.characters.get(characterId, userId);
  if (!c) return null;
  const info: CardInfo = { name: c.name, description: c.description ?? "", personality: c.personality ?? "", scenario: c.scenario ?? "", firstMessage: (c.first_mes ?? "").slice(0, 4000) };
  const entries = await loreOf(userId, c.world_book_ids ?? []);
  if (entries.length) {
    // A small book goes in whole (as much as fits); a big one is ranked, by meaning when there is an embedding model.
    let near: (number | null)[] | undefined;
    if (entries.length > LORE_MAX) {
      const [q] = (await models.embed(userId, [loreQuery(info.name, info.description)], { ms: 8000, inputType: "query" })) ?? [];
      const vs = q ? await models.embed(userId, entries.map(loreText), { ms: 12000, inputType: "passage" }) : null;
      if (q && vs) near = vs.map((v) => (v ? cosine(q, v) : null));
    }
    info.lore = pickLore(entries, `${info.name}\n${info.description}\n${info.scenario}\n${info.firstMessage}`, near);
  }
  return info;
}

spindle.onFrontendMessage(async (raw: unknown, userId: string) => {
  const msg = raw as ToBackend;
  if (!msg || typeof msg !== "object" || typeof (msg as { id?: unknown }).id !== "string") return;
  try {
    if (msg.type === "card") send({ type: "card", id: msg.id, card: await card(userId, msg.characterId) }, userId);
    else if (msg.type === "ask") send({ type: "answer", id: msg.id, text: await models.quiet(userId, msg.role, msg.messages) }, userId);
    else if (msg.type === "models") {
      if (!msg.patch) models.fresh(userId);
      send({ type: "models", id: msg.id, state: msg.patch ? await models.update(userId, msg.patch) : await models.state(userId) }, userId);
    } else if (msg.type === "decide") send({ type: "decided", id: msg.id, answers: await models.decide(userId, msg.state, msg.questions, Math.min(20_000, Math.max(1000, msg.ms)), msg.what) }, userId);
  } catch (err) {
    send({ type: "error", id: msg.id, error: text(err) }, userId);
    spindle.log.warn(`tallow: ${msg.type} failed: ${text(err)}`);
  }
});
