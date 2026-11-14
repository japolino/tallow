/**
 * The table kept under an ordinary chat (engine/price.ts, game/pricetable.ts), in Lumiverse.
 *
 *   before a reply   an interceptor reads the player's newest message, plays it at the table, and adds a note to the
 *                    prompt saying what is now true (needs the "interceptor" permission). The chat's own model then
 *                    writes the reply as it always does. Nothing is added to the chat itself, and no message is changed.
 *   after a reply    the reply is read for where the scene is and who is in it, and a marker may come due.
 *   kept             one small JSON for a chat in the user's own storage, `tables/<chat>.json`.
 *
 * It is off for every chat until the player deals a table in it, and it never holds a reply up for a failure: if a
 * model gives no answer the prompt goes on unchanged.
 */
import type { InterceptorContextDTO, InterceptorResultDTO, LlmMessageDTO, SpindleAPI } from "lumiverse-spindle-types";
import { cleanLine } from "../engine/chatbook.js";
import { createTable, ends, noteOf, type Kept, type TableWorld } from "../game/pricetable.js";
import type { TableView } from "../shared/protocol.js";
import { chatLines, type HostMessage } from "./chat.js";
import type { Models } from "./models.js";

const text = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const clip = (s: string, most: number): string => s.replace(/\s+/g, " ").trim().slice(0, most);
const fileOf = (chatId: string): string => `tables/${chatId.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 100) || "chat"}.json`;
const said = (content: LlmMessageDTO["content"]): string => (typeof content === "string" ? content : content.map((p) => ((p as { type?: string }).type === "text" ? String((p as { text?: string }).text ?? "") : "")).join(" "));

/** How many of a chat's last messages the table's opening is written from, and how short each is cut. */
const STORY_MOST = 10;
const STORY_MAX = 900;
/** The generations a table is played in; a quiet ask (Tallow's own, or another extension's) and a dry run never are. */
const PLAYED = new Set(["normal", "continue", "regenerate", "swipe"]);

export const viewOf = (k: Kept | null): TableView | null => (k ? { on: k.on, state: k.state, ledger: k.last?.ledger ?? [], news: k.news, premise: k.world.premise, canUndo: !!k.last } : null);

export function createTables(spindle: SpindleAPI, models: Models, changed: (userId: string, chatId: string) => void) {
  const log = (m: string): void => {
    try {
      spindle.log.info(`tallow table: ${m}`);
    } catch {
      /* best effort */
    }
  };
  const tableFor = (userId: string) => createTable({ ask: (messages, role) => models.quiet(userId, role, messages), decide: (what, state, questions, ms) => models.decide(userId, state, questions, ms, what), log });

  const read = async (userId: string, chatId: string): Promise<Kept | null> => {
    const k = await spindle.userStorage.getJson<Kept | null>(fileOf(chatId), { fallback: null, userId }).catch(() => null);
    return k && k.v === 1 && k.state && k.world ? k : null;
  };
  const keep = (userId: string, chatId: string, k: Kept): Promise<void> => spindle.userStorage.setJson(fileOf(chatId), k, { userId });

  /** One thing at a time for a chat, so a reply being read never writes over a message being played. */
  const queue = new Map<string, Promise<unknown>>();
  const inTurn = <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const next = (queue.get(key) ?? Promise.resolve()).then(work, work);
    queue.set(key, next.catch(() => undefined));
    return next;
  };

  /** Who the chat is between, and where its story stands, for the table's opening. Throws when it is not this user's chat. */
  async function worldOf(userId: string, chatId: string, premise: string): Promise<{ world: TableWorld; story: string[] }> {
    const chat = await spindle.chats.get(chatId, userId);
    if (!chat) throw new Error("no such chat");
    const c = chat.character_id ? await spindle.characters.get(chat.character_id, userId).catch(() => null) : null;
    const p = (await spindle.personas.getActive(userId).catch(() => null)) ?? (await spindle.personas.getDefault(userId).catch(() => null));
    const hero = p?.name?.trim() || "the player's character";
    const name = c?.name?.trim() || "the other character";
    const fill = (s: string, most: number): string => clip(s.replace(/\{\{\s*user\s*\}\}|<USER>/gi, hero).replace(/\{\{\s*char\s*\}\}|<BOT>/gi, name).replace(/\{\{[^}]*\}\}/g, ""), most);
    const world = [`${name}.`, fill(c?.description ?? "", 2400), fill(c?.personality ?? "", 500), c?.scenario ? `Scenario: ${fill(c.scenario, 900)}` : ""].filter(Boolean).join(" ");
    const who = [`${hero}.`, fill([p?.title ?? "", p?.description ?? ""].filter(Boolean).join(". "), 900)].filter(Boolean).join(" ");
    const { lines } = chatLines((await spindle.chat.getMessages(chatId)) as unknown as HostMessage[], -1);
    const story = lines.slice(-STORY_MOST).map((l) => `${l.you ? hero : l.name || name}: ${ends(l.text, STORY_MAX)}`);
    return { world: { world, who, premise: clip(premise, 400) }, story };
  }

  async function intercept(messages: LlmMessageDTO[], ctx: InterceptorContextDTO): Promise<LlmMessageDTO[] | InterceptorResultDTO> {
    try {
      if (ctx.isDryRun || !ctx.chatId || !PLAYED.has(ctx.generationType)) return messages;
      const { userId, chatId } = ctx;
      // The player's newest message, as the host laid the chat out.
      const at = messages.map((m, i) => ({ m, i })).filter((x) => x.m.__isChatHistory && x.m.role === "user").pop();
      if (!at) return messages;
      const note = await inTurn(`${userId}:${chatId}`, async () => {
        const kept = await read(userId, chatId);
        if (!kept?.on) return null;
        const line = cleanLine(said(at.m.content), 4000);
        if (!line) return null;
        const history = messages.slice(0, at.i).filter((m) => m.__isChatHistory);
        const index = at.m.sourceIndexInChat ?? history.length;
        const recent = history.slice(-4).map((m) => `${m.role === "user" ? "The player" : "The story"}: ${ends(cleanLine(said(m.content), 6000), 900)}`);
        const played = await tableFor(userId).beat(kept, line, index, recent);
        if (played !== kept) {
          await keep(userId, chatId, played);
          changed(userId, chatId);
        }
        return noteOf(played);
      });
      if (!note) return messages;
      // Straight after the player's message: before a reply being continued, and before nothing else of the chat.
      const out = [...messages.slice(0, at.i + 1), { role: "system", content: note } as LlmMessageDTO, ...messages.slice(at.i + 1)];
      return { messages: out, breakdown: [{ messageIndex: at.i + 1, name: "Tallow: the table under this chat" }] };
    } catch (err) {
      // A table that fails never costs the chat its reply.
      log(`a message was not played (${text(err).slice(0, 160)})`);
      return messages;
    }
  }

  let registered: (() => void) | null = null;
  /** Ask the host for the interceptor. It is refused until the player has granted "interceptor"; then asked again. */
  const register = (): boolean => {
    if (registered) return true;
    try {
      registered = spindle.registerInterceptor(intercept, { match: { generationTypes: ["normal", "continue", "regenerate", "swipe"], isDryRun: false } });
      return true;
    } catch (err) {
      log(`the table cannot hear messages yet (${text(err).slice(0, 120)})`);
      return false;
    }
  };
  register();
  try {
    spindle.on("PERMISSION_CHANGED", () => void register());
  } catch {
    /* A host without the event: the interceptor is asked for again when a table is dealt. */
  }

  return {
    /** The chat's table as the drawer shows it, or null when none has been dealt. */
    async view(userId: string, chatId: string): Promise<TableView | null> {
      if (!(await spindle.chats.get(chatId, userId))) throw new Error("no such chat");
      return viewOf(await read(userId, chatId));
    },

    /** A new table for the chat, from where its story stands; any table it had is replaced. */
    async deal(userId: string, chatId: string, premise: string): Promise<TableView | null> {
      if (!register()) throw new Error("Tallow has not been allowed to read messages before a reply (the \"interceptor\" permission)");
      const { world, story } = await worldOf(userId, chatId, premise);
      const seed = [...chatId].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) ^ (Date.now() >>> 0);
      const k = await tableFor(userId).deal(world, story, seed);
      if (!k) throw new Error("no table was written; ask again in a moment");
      await inTurn(`${userId}:${chatId}`, () => keep(userId, chatId, k));
      return viewOf(k);
    },

    /** Turn a chat's table on or off (it is kept as it stands), take the last message back, or put the table away. */
    async change(userId: string, chatId: string, what: "on" | "off" | "undo" | "drop"): Promise<TableView | null> {
      if (!(await spindle.chats.get(chatId, userId))) throw new Error("no such chat");
      return inTurn(`${userId}:${chatId}`, async () => {
        const k = await read(userId, chatId);
        if (!k) return null;
        if (what === "drop") {
          await spindle.userStorage.delete(fileOf(chatId), userId);
          return null;
        }
        const next: Kept = what === "undo" ? tableFor(userId).undo(k) : { ...k, on: what === "on" };
        await keep(userId, chatId, next);
        return viewOf(next);
      });
    },

    /** A reply was saved in a chat: it is read for the scene, once for each message played. */
    replied(userId: string, chatId: string, reply: string): void {
      void inTurn(`${userId}:${chatId}`, async () => {
        const k = await read(userId, chatId);
        if (!k?.on || !k.last || k.last.seen) return;
        const next = await tableFor(userId).seen(k, cleanLine(reply, 6000), [`The story: ${ends(cleanLine(reply, 6000), 1200)}`]);
        if (!next) return;
        await keep(userId, chatId, next);
        changed(userId, chatId);
      }).catch((err) => log(`a reply was not read (${text(err).slice(0, 160)})`));
    },

    /** A chat was branched: the new chat begins with the table of the chat it came from. */
    async forked(userId: string, from: string, to: string): Promise<boolean> {
      const k = await read(userId, from);
      if (!k || (await read(userId, to))) return false;
      await keep(userId, to, k);
      return true;
    },
  };
}

export type Tables = ReturnType<typeof createTables>;
