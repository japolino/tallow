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
  // The pictures are looked at while the lore is read (game/card.ts, looks).
  const seeing = looksOf(userId, characterId, c.image_id ?? null);
  const entries = await loreOf(userId, c.world_book_ids ?? []);
  books.set(`${userId}:${characterId}`, entries);
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
  const looks = await seeing;
  if (looks) info.looks = looks;
  const personas = await personasOf(userId, info.name);
  if (personas.length) info.personas = personas;
  return info;
}

/** How many of the player's personas are put on the paper (session.ts, whoYouAre). */
const PERSONAS_MAX = 12;

/**
 * The player's personas, to sit down as (game/card.ts, `personas`): the active one first, then the default, then the
 * rest as Lumiverse lists them. Empty without any or without the "personas" permission. Only read, never changed.
 */
async function personasOf(userId: string, charName: string): Promise<NonNullable<CardInfo["personas"]>> {
  try {
    const [listed, active, fallback] = await Promise.all([
      spindle.personas.list({ limit: 100, userId }).then((r) => r.data, () => []),
      spindle.personas.getActive(userId).catch(() => null),
      spindle.personas.getDefault(userId).catch(() => null),
    ]);
    const first = [active, fallback].filter((p): p is NonNullable<typeof p> => !!p);
    const all = [...first, ...listed.filter((p) => !first.some((f) => f.id === p.id))];
    const seen = new Set<string>();
    const out: NonNullable<CardInfo["personas"]> = [];
    for (const p of all) {
      const name = p.name?.trim();
      if (!name || seen.has(p.id)) continue;
      seen.add(p.id);
      // Its macros as the game reads them: the player is the persona, the character the card's.
      const fill = (x: string): string => x.replace(/\{\{\s*user\s*\}\}|<USER>/gi, name).replace(/\{\{\s*char\s*\}\}|<BOT>/gi, charName).replace(/\{\{[^}]*\}\}/g, "").trim();
      const title = fill(p.title ?? "");
      const who = [title, fill(p.description ?? "")].filter(Boolean).join(". ").slice(0, 2000);
      out.push({ name: name.slice(0, 60), who, ...(title ? { title: title.slice(0, 80) } : {}) });
      if (out.length >= PERSONAS_MAX) break;
    }
    return out;
  } catch (err) {
    spindle.log.info(`tallow: the personas could not be read (${text(err).slice(0, 120)})`);
    return [];
  }
}

/** Each card's lore as last read, for finding the entries nearest a scene. */
const books = new Map<string, LoreEntry[]>();
const SCENE_LORE = 3;

/**
 * The card's lore nearest a scene: by meaning when there is an embedding model (the entries' vectors are kept from the
 * first time), else by the keys the scene names. Only entries a big book left out of the card's own lore are useful,
 * but the teller drops any it already has.
 */
async function loreNear(userId: string, characterId: string, scene: string): Promise<string[]> {
  const entries = books.get(`${userId}:${characterId}`) ?? [];
  if (entries.length <= LORE_MAX) return [];
  const [q] = (await models.embed(userId, [scene], { ms: 4000, inputType: "query" })) ?? [];
  const vs = q ? await models.embed(userId, entries.map(loreText), { ms: 12000, inputType: "passage" }) : null;
  const near = q && vs ? vs.map((v) => (v ? cosine(q, v) : null)) : undefined;
  return pickLore(entries.filter((e) => !e.constant), scene, near?.filter((_, i) => !entries[i]!.constant)).slice(0, SCENE_LORE);
}

const MAX_PICTURES = 3;
const MAX_PICTURE_BYTES = 4 * 1024 * 1024;
const LOOK_MS = 25_000;
const LOOK_PROMPT =
  "These are the pictures of a character card for a story game: its avatar first, then any gallery images. Describe, plainly and in three or four sentences, what they show that a storyteller would need: how the character looks (build, apparent age, clothing, anything not human about them), and the setting, era and kind of world the pictures suggest. Say only what can be seen. If a picture shows someone who looks under 18, say so plainly.";

/**
 * What the card's pictures show, by the reader model when it can see; null when there are no pictures, no "images"
 * permission, or the model cannot look at them. Never holds the card up for long.
 */
async function looksOf(userId: string, characterId: string, avatar: string | null): Promise<string | null> {
  try {
    const gallery = (await spindle.characters.getGallery?.(characterId, userId).catch(() => [])) ?? [];
    const ids = [...new Set([avatar, ...gallery.map((g) => g.image_id)].filter((x): x is string => !!x))].slice(0, MAX_PICTURES);
    if (!ids.length || !spindle.images?.readBinary) return null;
    const parts: { type: "image"; data: string; mime_type: string }[] = [];
    for (const id of ids) {
      const meta = await spindle.images.get(id, userId).catch(() => null);
      const mime = meta?.mime_type ?? "image/png";
      if (!mime.startsWith("image/")) continue;
      const bytes = await spindle.images.readBinary(id, userId).catch(() => null);
      if (!bytes || bytes.byteLength > MAX_PICTURE_BYTES) continue;
      parts.push({ type: "image", data: Buffer.from(bytes).toString("base64"), mime_type: mime });
    }
    if (!parts.length) return null;
    const messages = [{ role: "user", content: [{ type: "text", text: LOOK_PROMPT }, ...parts] }];
    // The reader first; if it cannot see, the builder (often the stronger model, more often one that sees).
    const look = (role: "reader" | "builder") => Promise.race([models.quiet(userId, role, messages as never), new Promise<string>((_, no) => setTimeout(() => no(new Error("timed out")), LOOK_MS))]);
    const said = await look("reader").catch(() => look("builder"));
    const t = said.replace(/\s+/g, " ").trim().slice(0, 800);
    return t.length > 20 ? t : null;
  } catch (err) {
    spindle.log.info(`tallow: the card's pictures could not be looked at (${text(err).slice(0, 120)})`);
    return null;
  }
}

spindle.onFrontendMessage(async (raw: unknown, userId: string) => {
  const msg = raw as ToBackend;
  if (!msg || typeof msg !== "object" || typeof (msg as { id?: unknown }).id !== "string") return;
  try {
    if (msg.type === "card") send({ type: "card", id: msg.id, card: await card(userId, msg.characterId) }, userId);
    else if (msg.type === "lore") send({ type: "lore", id: msg.id, entries: await loreNear(userId, msg.characterId, msg.text) }, userId);
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
