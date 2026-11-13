/**
 * Reading an ordinary chat for the narrator's book that is kept beside it (engine/chatbook.ts). The chat is only ever
 * read here, never changed: its messages are cleaned of what is not the story and handed to the frontend, which
 * decides when a chapter is due and has it written (game/chatbook.ts).
 *
 * Lumiverse gives an extension a chat's messages under its "chat_mutation" permission (there is no read-only one), and
 * says whose chat it is under "chats". Without them there is no book for the chat, and nothing else changes.
 */
import type { SpindleAPI } from "lumiverse-spindle-types";
import { forkedBook, cleanLine, CHAT_HERO, LINE_MAX, type ChatLine } from "../engine/chatbook.js";
import { bookFile, readBook } from "../engine/chapter.js";

/** How many messages from before the part asked for are sent along, and how short each is cut. */
export const EARLIER_MOST = 12;
export const EARLIER_MAX = 1200;
/** The most messages sent whole: a book that is this far behind writes about the newest of them. */
export const LINES_MOST = 60;

/** A chat message as the host gives it, as far as the book reads it. */
export interface HostMessage {
  id: string;
  index_in_chat: number;
  is_user?: boolean;
  role?: string;
  name?: string;
  content?: string;
  hidden?: boolean;
}

/**
 * A chat's messages as the book reads them: those after `after` cleaned whole, the last few before it cut short, and
 * the place of the chat's last message. Hidden messages and the system's own are not the story.
 */
export function chatLines(messages: readonly HostMessage[], after: number): { lines: ChatLine[]; earlier: ChatLine[]; last: number } {
  const shown = messages.filter((m) => !m.hidden && m.role !== "system").sort((a, b) => a.index_in_chat - b.index_in_chat);
  const line = (m: HostMessage, most: number): ChatLine => ({ index: m.index_in_chat, id: m.id, you: m.is_user ?? m.role === "user", name: (m.name ?? "").slice(0, 80), text: cleanLine(m.content ?? "", most) });
  const lines = shown.filter((m) => m.index_in_chat > after).slice(-LINES_MOST).map((m) => line(m, LINE_MAX)).filter((l) => l.text);
  const first = lines.length ? lines[0]!.index : Infinity;
  const earlier = shown.filter((m) => m.index_in_chat <= after || m.index_in_chat < first).slice(-EARLIER_MOST).map((m) => line(m, EARLIER_MAX)).filter((l) => l.text && l.index < first);
  return { lines, earlier, last: shown.length ? shown[shown.length - 1]!.index_in_chat : -1 };
}

type Host = Pick<SpindleAPI, "chat" | "chats" | "characters" | "personas" | "userStorage">;

const about = (s: string, user: string, char: string, most: number): string =>
  s
    .replace(/\{\{\s*user\s*\}\}|<USER>/gi, user)
    .replace(/\{\{\s*char\s*\}\}|<BOT>/gi, char)
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, most);

export function createChats(spindle: Host) {
  /** The chat when it is this user's, else null. */
  const owned = async (userId: string, chatId: string) => (chatId ? await spindle.chats.get(chatId, userId) : null);

  return {
    /** The chat as the book reads it; throws when it is not this user's chat or cannot be read. */
    async read(userId: string, chatId: string, after: number): Promise<{ lines: ChatLine[]; earlier: ChatLine[]; last: number }> {
      if (!(await owned(userId, chatId))) throw new Error("no such chat");
      const messages = (await spindle.chat.getMessages(chatId)) as unknown as HostMessage[];
      return chatLines(messages, Number.isFinite(after) ? Math.floor(after) : -1);
    },

    /** Who the chat is between: the card in a few words, and the player's persona as it is now. */
    async who(userId: string, chatId: string): Promise<{ card: { name: string; about: string }; hero: { name: string; who: string } }> {
      const chat = await owned(userId, chatId);
      if (!chat) throw new Error("no such chat");
      const c = chat.character_id ? await spindle.characters.get(chat.character_id, userId).catch(() => null) : null;
      const p = (await spindle.personas.getActive(userId).catch(() => null)) ?? (await spindle.personas.getDefault(userId).catch(() => null));
      const hero = p?.name?.trim() || "the player's character";
      const name = c?.name?.trim() || "";
      return {
        card: { name: name.slice(0, 80), about: about([c?.description ?? "", c?.scenario ?? ""].filter(Boolean).join(" "), hero, name, 900) },
        hero: { name: hero.slice(0, 60), who: about([p?.title ?? "", p?.description ?? ""].filter(Boolean).join(". "), hero, name, 600) },
      };
    },

    /**
     * A chat was branched from another: the new chat's book begins with the chapters written from the messages the two
     * share. Nothing is done when the source has no book, or the new chat already has one.
     */
    async forked(userId: string, from: string, to: string, characterId: string, atIndex: number): Promise<number> {
      const source = await spindle.userStorage.getJson<unknown>(bookFile(from, characterId, CHAT_HERO), { fallback: null, userId });
      if (!source) return 0;
      const target = bookFile(to, characterId, CHAT_HERO);
      if (await spindle.userStorage.getJson<unknown>(target, { fallback: null, userId })) return 0;
      const book = forkedBook(readBook(source, CHAT_HERO, ""), from, to, atIndex);
      if (!book.chapters.length) return 0;
      await spindle.userStorage.setJson(target, book, { userId });
      return book.chapters.length;
    },
  };
}
