/**
 * The narrator's book kept beside an ordinary chat (docs/DESIGN.md 3.5, item 30). The chat is the play and is never
 * touched: nothing here reads a line as a try, prices it or refuses it. When a scene of the chat is over, the narrator
 * writes a short chapter of what the player did not see, among the other people of the story, and keeps it in a book
 * for that chat (engine/chapter.ts keeps the book itself).
 *
 * Who decides what:
 * - Code cleans the chat's messages of what is not the story (a model's thinking, pictures, markup), finds which of
 *   them are settled and not yet written about, and keeps the book and how far it has got.
 * - A model says whether the player's newest message opens a new scene (game/chatbook.ts), and a model writes the
 *   chapter (game/chatwriter.ts).
 *
 * Pure: messages and a book in, the next book out. Nothing is changed in place.
 */
import type { Book, ChapterMark } from "./chapter.js";

/** One message of a chat, cleaned: whose it is and what it says. */
export interface ChatLine {
  /** Its place in the chat, from 0. */
  index: number;
  id: string;
  /** Written by the player (who may also have written what others say and do in it). */
  you: boolean;
  name: string;
  text: string;
}

/** The longest one message is kept, in characters: its start and its end, the middle left out. */
export const LINE_MAX = 16_000;

/** A model's thinking left in a message, in the tags models and presets use for it. */
const THINKING = /<(thoughts?|think|thinking|reasoning|reflection|scratchpad|cot)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** A message without the blocks an illustrator put in it: from each marker to the end of the `div` it opens. */
function withoutPictures(s: string): string {
  let out = "";
  let at = 0;
  for (;;) {
    const open = s.slice(at).search(/<div\b[^>]*\b(?:data-inlay-illustrator|inlay-illustrator-image)\b/i);
    if (open < 0) return out + s.slice(at);
    out += s.slice(at, at + open);
    let i = at + open;
    let depth = 0;
    const tag = /<(\/?)div\b[^>]*>/gi;
    tag.lastIndex = i;
    let end = -1;
    for (let m = tag.exec(s); m; m = tag.exec(s)) {
      depth += m[1] ? -1 : 1;
      if (depth <= 0) {
        end = tag.lastIndex;
        break;
      }
    }
    // A block never closed: everything after its marker is dropped rather than read as story.
    if (end < 0) return out;
    i = end;
    at = i;
  }
}

/**
 * A message as the story reads it: no thinking, no pictures, no markup, its paragraphs kept. A very long one keeps its
 * start and its end. This only takes away what is not prose; it reads nothing into what is left.
 */
export function cleanLine(raw: string, most = LINE_MAX): string {
  let s = (raw ?? "").replace(/\r/g, "");
  s = s.replace(THINKING, " ");
  s = withoutPictures(s);
  s = s
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|blockquote|li|h[1-6])\s*>/gi, "\n\n")
    .replace(/<\/?[a-zA-Z][^<>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  s = s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (s.length <= most) return s;
  const head = Math.floor(most * 0.35);
  return `${s.slice(0, head).trimEnd()}\n\n[…]\n\n${s.slice(s.length - (most - head)).trimStart()}`;
}

/** Fewer replies than this since the last chapter is not yet a chapter's worth, unless the player asks for one. */
export const MIN_REPLIES = 2;
/** A scene that has run this many replies gets a chapter whether or not the player has moved on. */
export const MOST_REPLIES = 10;

/** The part of a chat a chapter can be written from. */
export interface ChatSpan {
  /** The messages not yet written about, in order. */
  lines: ChatLine[];
  /** The last of them, by its place in the chat; the mark moves here when a chapter is kept. */
  upTo: number;
  /** How many of them are replies (not the player's). */
  replies: number;
  /** The player's newest message, which comes after them and may open a new scene; none when the player asked. */
  opener: ChatLine | null;
}

const inOrder = (lines: readonly ChatLine[]): ChatLine[] => [...lines].filter((l) => l.text.trim()).sort((a, b) => a.index - b.index);

/**
 * What is settled and not yet written about: everything after the last chapter and before the player's newest message.
 * The reply that came after that message is left for next time, because it can still be swiped or written again; the
 * player's message itself is the first of the next scene, if it opens one. Null when there is nothing there.
 */
export function settledSpan(all: readonly ChatLine[], after: number): ChatSpan | null {
  const lines = inOrder(all);
  const opener = [...lines].reverse().find((l) => l.you) ?? null;
  if (!opener) return null;
  const span = lines.filter((l) => l.index > after && l.index < opener.index);
  if (!span.length) return null;
  return { lines: span, upTo: span[span.length - 1]!.index, replies: span.filter((l) => !l.you).length, opener };
}

/** Everything not yet written about, to the end of the chat: for a chapter the player asked for. */
export function wholeSpan(all: readonly ChatLine[], after: number): ChatSpan | null {
  const span = inOrder(all).filter((l) => l.index > after);
  if (!span.length) return null;
  return { lines: span, upTo: span[span.length - 1]!.index, replies: span.filter((l) => !l.you).length, opener: null };
}

/** Whether a span is worth asking about at all: enough has been said since the last chapter. */
export const spanWorth = (s: ChatSpan | null): s is ChatSpan => !!s && s.replies >= MIN_REPLIES;

/** A scene that has run long gets its chapter without waiting for the player to move on. */
export const spanLong = (s: ChatSpan): boolean => s.replies >= MOST_REPLIES;

/** The most of a chat a chapter is written from, in characters: the newest kept whole, older messages cut down. */
export const TRANSCRIPT_MAX = 60_000;
/** What an older message is cut down to when the transcript is over its size. */
const OLDER_MAX = 1800;

/**
 * A span as it is given to the writer: within `most` characters, the newest messages whole and older ones cut down to
 * their start and end (then left out, oldest first, if it is still too much). Says whether anything was left out.
 */
export function fitted(lines: readonly ChatLine[], most = TRANSCRIPT_MAX): { lines: ChatLine[]; cut: boolean } {
  const out = lines.map((l) => ({ ...l }));
  const size = (): number => out.reduce((n, l) => n + l.text.length, 0);
  let cut = false;
  for (let i = 0; i < out.length - 2 && size() > most; i++) {
    const l = out[i]!;
    if (l.text.length > OLDER_MAX) {
      l.text = cleanLine(l.text, OLDER_MAX);
      cut = true;
    }
  }
  while (out.length > 2 && size() > most) {
    out.shift();
    cut = true;
  }
  return { lines: out, cut };
}

/** A chat's key in its book. */
export const chatStory = (chatId: string): string => `chat|${chatId}`;

/** The name a chat's book is kept under (engine/chapter.ts, bookFile): one book for a chat, whoever the player is in it. */
export const CHAT_HERO = "chat";

/** How far a chat's book has got, as a mark. */
export const chatMark = (upTo: number): ChapterMark => ({ deeds: [], scene: 0, lost: 0, visited: 0, told: 0, upTo });

/** The last message a chat's book has written about, or -1 when it has written nothing. */
export function writtenUpTo(book: Book, chatId: string): number {
  const mark = book.marks[chatStory(chatId)]?.upTo;
  if (typeof mark === "number") return mark;
  const own = book.chapters.filter((c) => c.story === chatStory(chatId) && typeof c.upTo === "number").map((c) => c.upTo!);
  return own.length ? Math.max(...own) : -1;
}

/**
 * The book of a chat that was branched from another: the chapters written from messages the branch shares (those up to
 * and including the one it was branched at), now belonging to the new chat. What was written from later messages
 * stays with the chat it was written in.
 */
export function forkedBook(source: Book, from: string, to: string, atIndex: number): Book {
  const was = chatStory(from);
  const now = chatStory(to);
  const chapters = source.chapters.filter((c) => c.story === was && typeof c.upTo === "number" && c.upTo <= atIndex).map((c, i) => ({ ...c, story: now, n: i + 1 }));
  const upTo = chapters.length ? Math.max(...chapters.map((c) => c.upTo!)) : -1;
  return { v: 1, hero: source.hero, card: source.card, chapters, marks: upTo >= 0 ? { [now]: chatMark(upTo) } : {} };
}
