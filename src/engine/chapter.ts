/**
 * The narrator's book (docs/DESIGN.md, 11, item 29). At a rest, when a story ends and when you stop for the night, the
 * narrator writes a short chapter in a book of its own, and stands it on the shelf behind it. A chapter is not a recap:
 * it is what happened a little later, or in between, among the people you dealt with while you were not there. It
 * decides nothing in the game, but what it says is true in the story from then on: the tellings after it, and the
 * builder of the next story at this card, are told what it established.
 *
 * Who decides what:
 * - Code gathers what the chapter is written from (`chapterMaterial`), checks what comes back (`checkChapter`), and
 *   keeps the book: its chapters, how far each story had got when its last chapter was written, and its pictures.
 * - A model writes the chapter (game/chapterwriter.ts). Nothing in the game's numbers changes because of it.
 *
 * Pure: a trip and a book in, the next book out. Nothing is changed in place.
 */

/**
 * When a chapter is written: at a rest, at the end of a story, when you stop in the middle of one, after a night of free
 * form, or at a break in an ordinary chat that the book is kept beside (engine/chatbook.ts).
 */
export type ChapterAt = "rest" | "end" | "stop" | "night" | "chat";

/** How far a story had got when its last chapter was written, so the next one is written only from what came after. */
export interface ChapterMark {
  /** The deeds already written about (the trip keeps the last few, so they are kept by their words). */
  deeds: string[];
  /** Scenes before this one were written about (a story of scenes). */
  scene: number;
  /** What scenes had taken from you by then. */
  lost: number;
  /** Stops reached by then (a road story, or free form). */
  visited: number;
  /** Lines the narrator had said by then (counted by whoever keeps them: game/chapters.ts). */
  told: number;
  /** A chat's book: the last message written about, by its place in the chat (engine/chatbook.ts). */
  upTo?: number;
}

/** Someone the chapter can be about: a person of a scene or a stop, or a companion. */
export interface ChapterPerson {
  name: string;
  who: string;
  wants?: string;
  /** Where the player met them, and how it went there, in a few words. */
  met: string;
}

/** What a chapter is written from. Everything here is something the game already knows; nothing is made up by code. */
export interface ChapterMaterial {
  at: ChapterAt;
  story: { title: string; goal: string; ending?: string; over?: "won" | "lost" };
  hero: { name: string; who: string };
  /** The hour of the story, 0 to 24 and on (a story can run past midnight). */
  hour: number;
  /** The scenes (or stops) since the last chapter, and how each went. */
  happened: string[];
  people: ChapterPerson[];
  companions: { name: string; who: string }[];
  /** What the player tried that worked, in a few words each. */
  deeds: string[];
  /** What scenes took from the player. */
  lost: string[];
  /** What scenes left the player with. */
  boons: string[];
  /**
   * What the player's tries have won that stays true, who has been set against them, and who went with them for a while
   * and has gone (engine/lasting.ts), in the story's words: the mark they have left on people, which is what a chapter shows.
   */
  changed: string[];
  /** What the narrator said aloud since the last chapter, most recent last. */
  told: string[];
  /** What the chapters before this one established. */
  established: string[];
  /**
   * More to write from, in plain lines. The obvious place to add material the game learns to keep later (what has
   * changed for good in the world, how companions stand with you): whoever calls `chapterMaterial` passes it as `more`.
   */
  more: string[];
}

export interface MaterialOptions {
  hero: { name: string; who?: string };
  /** Where the last chapter of this story left off; none for the first. */
  since?: ChapterMark | null;
  /** The narrator's lines since the last chapter. */
  told?: readonly string[];
  established?: readonly string[];
  more?: readonly string[];
}

const clip = (s: string, n: number): string => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trim()}…` : t;
};

/** Whether anything has happened since the last chapter to write about. The end of a story always has. */
export const chapterWorth = (m: ChapterMaterial): boolean => m.at === "end" || m.happened.length > 0 || m.deeds.length > 0 || m.lost.length > 0 || m.changed.length > 0;

/* ------------------------------ the answer, checked ------------------------------ */

/** A chapter as it is kept: its title, its paragraphs, what it makes true, and what its picture would show. */
export interface ChapterDraft {
  /** Empty when the model gave none: the book then calls it by its number. */
  title: string;
  text: string[];
  /** A few short things it establishes, for the tellings and the builder after it. */
  facts: string[];
  /** One moment of it in words, for a picture; empty when the model gave none. */
  picture: string;
}

/** The longest a chapter is kept, in characters; a longer one is cut at the end of a paragraph or a sentence, not refused. */
export const CHAPTER_MAX = 2600;
/** Fewer words than this is not a chapter. */
export const CHAPTER_MIN_WORDS = 12;
const FACTS_MAX = 3;

const plain = (s: string): string => s.replace(/[*_#`]+/g, "").replace(/[ \t]+/g, " ").trim();

/**
 * A model's chapter as the book keeps it, or null with the reason when it has no chapter in it (`why`). Its form is
 * forgiven: a missing title or picture, facts given as one line, paragraphs run together, a chapter too long (it is cut,
 * at the end of a sentence). Only a missing or empty chapter is refused.
 */
export function checkChapter(raw: unknown, why?: (reason: string) => void): ChapterDraft | null {
  const no = (reason: string): null => (why?.(reason), null);
  if (!raw || typeof raw !== "object") return no("no chapter in the answer");
  const r = raw as Record<string, unknown>;
  const body = Array.isArray(r.text) ? r.text.filter((x) => typeof x === "string").join("\n\n") : typeof r.text === "string" ? r.text : "";
  let paras = body
    .replace(/\r/g, "")
    .split(/\n\s*\n|\n(?=\s{2,}|\t)/)
    .map((p) => plain(p.replace(/\n/g, " ")))
    .filter(Boolean);
  let title = typeof r.title === "string" ? plain(r.title).replace(/^["“'‘]+|["”'’]+$/g, "").replace(/^chapter\s+[\w-]+\s*[:.–—-]\s*/i, "").trim() : "";
  // A heading left at the top of the text (the title again, or "Chapter Three") is not part of it.
  while (paras.length > 1 && paras[0]!.split(/\s+/).length <= 8 && !/[.!?…"”]$/.test(paras[0]!)) {
    if (!title) title = paras[0]!.replace(/^chapter\s+[\w-]+\s*[:.–—-]?\s*/i, "").trim();
    paras = paras.slice(1);
  }
  const words = paras.join(" ").split(/\s+/).filter(Boolean).length;
  if (!words) return no("no chapter in the answer");
  if (words < CHAPTER_MIN_WORDS) return no(`only ${words} words: too short to be a chapter`);
  // Too long: whole paragraphs while they fit, then the last cut at the end of a sentence.
  const kept: string[] = [];
  let size = 0;
  for (const p of paras) {
    if (size + p.length <= CHAPTER_MAX) {
      kept.push(p);
      size += p.length;
      continue;
    }
    const room = CHAPTER_MAX - size;
    const cut = p.slice(0, room);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf('." '));
    if (end > 60) kept.push(cut.slice(0, end + 1));
    break;
  }
  if (!kept.length) kept.push(`${paras[0]!.slice(0, CHAPTER_MAX - 1).trim()}…`);
  const factList = Array.isArray(r.facts) ? r.facts : typeof r.facts === "string" ? r.facts.split(/\n|;\s+/) : [];
  const facts = factList
    .filter((f): f is string => typeof f === "string")
    .map((f) => plain(f.replace(/^\s*[-•*\d.)]+\s*/, "")))
    .filter((f) => f.length > 3)
    .map((f) => clip(f, 200))
    .slice(0, FACTS_MAX);
  const picture = typeof r.picture === "string" ? clip(plain(r.picture), 400) : "";
  return { title: clip(title, 60), text: kept, facts, picture };
}

/* ------------------------------ the book ------------------------------ */

/** A chapter's picture, asked of Inlay Illustrator (game/chapters.ts): asked, ready with where to find it, or failed. */
export interface BookPicture {
  /** The request's id, as Inlay sees it. */
  id: string;
  status: "asked" | "ready" | "failed";
  imageId?: string;
  url?: string;
  why?: string;
}

export interface BookChapter {
  id: string;
  /** Its number in the book, from 1. */
  n: number;
  /** The story it belongs to (its key), and that story's title. */
  story: string;
  storyTitle: string;
  at: ChapterAt;
  title: string;
  text: string[];
  facts: string[];
  /** What its picture shows, in words, when the model said. */
  scene?: string;
  picture?: BookPicture;
  /** The story's hour when it was written. */
  hour: number;
  /** When it was written (ms since 1970). */
  written: number;
  /** A chat's book: the last message of the chat this chapter was written from, by its place in the chat. */
  upTo?: number;
}

/** The narrator's book for one hero at one card. */
export interface Book {
  v: 1;
  hero: string;
  card: string;
  chapters: BookChapter[];
  /** Where each story's last chapter left off, by the story's key. */
  marks: Record<string, ChapterMark>;
}

/** How many chapters a book keeps: the oldest go first. */
export const BOOK_MAX = 80;
/** How many stories' marks are kept: only a story still being told needs one. */
const MARKS_MAX = 8;

export const emptyBook = (hero: string, card: string): Book => ({ v: 1, hero, card, chapters: [], marks: {} });

const str = (v: unknown, n: number): string => (typeof v === "string" ? v.slice(0, n) : "");
const strs = (v: unknown, n: number, most: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, n)).slice(0, most) : []);

/** A book as it was read back from storage (unchecked): what is whole in it is kept, and a book that is not one is an empty one. */
export function readBook(raw: unknown, hero: string, card: string): Book {
  const b = raw as Partial<Book> | null;
  if (!b || typeof b !== "object" || b.v !== 1 || !Array.isArray(b.chapters)) return emptyBook(hero, card);
  const chapters: BookChapter[] = [];
  for (const c of b.chapters as unknown[]) {
    const x = c as Partial<BookChapter> | null;
    if (!x || typeof x !== "object" || typeof x.id !== "string") continue;
    const text = strs(x.text, CHAPTER_MAX, 40);
    if (!text.length) continue;
    const at: ChapterAt = x.at === "end" || x.at === "stop" || x.at === "night" || x.at === "chat" ? x.at : "rest";
    const p = x.picture;
    const picture: BookPicture | undefined =
      p && typeof p === "object" && typeof p.id === "string" && (p.status === "asked" || p.status === "ready" || p.status === "failed")
        ? { id: p.id, status: p.status, ...(typeof p.imageId === "string" ? { imageId: p.imageId } : {}), ...(typeof p.url === "string" ? { url: p.url } : {}), ...(typeof p.why === "string" ? { why: p.why.slice(0, 200) } : {}) }
        : undefined;
    chapters.push({ id: x.id.slice(0, 80), n: chapters.length + 1, story: str(x.story, 200), storyTitle: str(x.storyTitle, 80), at, title: str(x.title, 60), text, facts: strs(x.facts, 200, FACTS_MAX), ...(typeof x.scene === "string" ? { scene: x.scene.slice(0, 400) } : {}), ...(picture ? { picture } : {}), hour: typeof x.hour === "number" && Number.isFinite(x.hour) ? x.hour : 0, written: typeof x.written === "number" ? x.written : 0, ...(typeof x.upTo === "number" && Number.isFinite(x.upTo) ? { upTo: Math.floor(x.upTo) } : {}) });
  }
  const marks: Record<string, ChapterMark> = {};
  for (const [k, m] of Object.entries(b.marks && typeof b.marks === "object" ? b.marks : {})) {
    const x = m as Partial<ChapterMark> | null;
    if (!x || typeof x !== "object") continue;
    const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    marks[k.slice(0, 200)] = { deeds: strs(x.deeds, 200, 12), scene: n(x.scene), lost: n(x.lost), visited: n(x.visited), told: n(x.told), ...(typeof x.upTo === "number" && Number.isFinite(x.upTo) ? { upTo: Math.floor(x.upTo) } : {}) };
  }
  return { v: 1, hero: str(b.hero, 80) || hero, card: str(b.card, 120) || card, chapters: chapters.slice(-BOOK_MAX), marks };
}

/** The book with a chapter added at its end (numbered by code), and the story's mark moved on. */
export function withChapter(book: Book, c: Omit<BookChapter, "n">, mark: ChapterMark): Book {
  const chapters = [...book.chapters, { ...c, n: 0 }].slice(-BOOK_MAX).map((x, i) => ({ ...x, n: i + 1 }));
  return { ...book, chapters, marks: withMarkOf(book.marks, c.story, mark) };
}

/** The book with a story's mark moved on and no chapter added (nothing to write about since the last). */
export const withMark = (book: Book, story: string, mark: ChapterMark): Book => ({ ...book, marks: withMarkOf(book.marks, story, mark) });

function withMarkOf(marks: Record<string, ChapterMark>, story: string, mark: ChapterMark): Record<string, ChapterMark> {
  const rest = Object.entries(marks).filter(([k]) => k !== story);
  return Object.fromEntries([...rest, [story, mark] as const].slice(-MARKS_MAX));
}

/** A story is over: its mark is not needed again. */
export const withoutMark = (book: Book, story: string): Book => ({ ...book, marks: Object.fromEntries(Object.entries(book.marks).filter(([k]) => k !== story)) });

/** The book with a chapter's picture as it now stands. */
export function withPicture(book: Book, chapterId: string, picture: BookPicture): Book {
  return { ...book, chapters: book.chapters.map((c) => (c.id === chapterId ? { ...c, picture } : c)) };
}

/**
 * What the book has established, in short lines, for a telling or a builder: the facts of a story's own chapters when
 * a story is named and it has any, else of the last few chapters in the book. Newest last.
 */
export function established(book: Book, story?: string, most = 6): string[] {
  const own = story ? book.chapters.filter((c) => c.story === story) : [];
  const from = own.length ? own : book.chapters.slice(-3);
  const lines = from.flatMap((c) => (c.facts.length ? c.facts : [clip(c.text[0] ?? "", 200)]).map((f) => (own.length ? f : `${c.storyTitle ? `(${c.storyTitle}) ` : ""}${f}`)));
  return lines.filter(Boolean).slice(-most);
}

/** The words a book's established facts are given to a model in, or "" when it has none. */
export function establishedSaid(lines: readonly string[]): string {
  return lines.length ? `What the narrator's book has already written, true in this story from now on (keep to it, and don't retell it): ${lines.join(" ")}` : "";
}

/** A name made safe for a file path: letters, digits, '-' and '_', at most `n` long. */
const slug = (s: string, n: number): string => s.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, n) || "x";

/** Where a hero's book at a card is kept in the user's own storage (backend/book.ts). */
export function bookFile(chatId: string, characterId: string, hero: string): string {
  return `books/${slug(characterId, 64)}/${slug(chatId, 64)}-${slug(hero, 40)}.json`;
}

/** The id Inlay Illustrator is asked a chapter's picture under: letters, digits and `_.:-`, at most 96, the same each time. */
export function pictureId(book: string, chapterId: string): string {
  const key = `tallow:book:${book}:${chapterId}`;
  const safe = key.replace(/[^A-Za-z0-9_.:-]/g, "_");
  if (safe.length <= 96) return safe;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return `${safe.slice(0, 70)}.${chapterId.replace(/[^A-Za-z0-9]/g, "").slice(-12)}.${(h >>> 0).toString(36)}`;
}
