/**
 * Keeps the narrator's book through a sitting (engine/chapter.ts, docs/DESIGN.md 11, item 29): when a chapter is due
 * it gathers what to write from, has a model write it (chapterwriter.ts) while the narrator is seen writing in the book,
 * keeps it, shelves it, and asks Inlay Illustrator for its picture when the user has said yes to pictures.
 *
 * Nothing here is waited for by the game. A chapter that is slow arrives late; one that fails is not written, and why
 * goes to the same place as every other model answer that was not taken (`fellBack`). Its material is not lost: the
 * story's mark is only moved on when a chapter is kept, so the next one is written from it too.
 */
import type { Trip } from "../engine/adventure.js";
import { chapterMaterial, chapterWorth, emptyBook, established, establishedSaid, markOf, pictureId, readBook, withChapter, withMark, withoutMark, withPicture, type Book, type BookChapter, type BookPicture, type ChapterAt, type ChapterDraft, type ChapterMark } from "../engine/chapter.js";
import { DEFAULT_CONTENT, playable, VEIL_SAID, type ContentSettings } from "../engine/content.js";
import { writeChapter } from "./chapterwriter.js";
import type { Ask } from "./prompts.js";
import type { Keeper } from "./voice.js";

/** The room's side of the book (room/book.ts): the narrator seen writing in it, and the book on its shelf as it now stands. */
export interface ChapterShelf {
  /** A chapter is being written: the narrator takes the book down and writes in it until `work` settles. */
  writing(work: Promise<unknown>): void;
  /** The book as it now stands: a chapter shelved, or a picture come. */
  show(book: Book): void;
}

/** What a picture is asked with, and what comes back: where the finished picture is, or null with why. */
export interface PictureAsk {
  id: string;
  text: string;
}
export type PictureGot = { imageId: string; url: string } | { why: string };

export interface ChapterKeeperOptions {
  ask: Ask | null;
  /** The story's voice: a chapter is written under it when it has one, like the night's prose. */
  voice?: Keeper | null;
  /** The card's name, for a new book. */
  card: string;
  /** A hero's book as it was kept (unchecked), or null. */
  load(hero: string): Promise<unknown>;
  save(hero: string, book: Book): Promise<void>;
  shelf?: ChapterShelf;
  /** Pictures for the chapters: asked only while `allowed()` says yes when a chapter is kept. */
  pictures?: { allowed(): boolean; draw(p: PictureAsk): Promise<PictureGot> };
  /** What the game allows now (content.ts). */
  content?(): ContentSettings;
  /** Told when a chapter (or its picture) was not taken, and why. */
  fellBack?(job: string, why: string): void;
  /** How long a chapter may take (ms); chapterwriter.ts's own time when not given. */
  ms?: number;
}

/**
 * A chapter whose words come from somewhere other than a story at the table (a chat's book, game/chatbook.ts): what it
 * is filed under, where its story will stand once it is kept, and how it is written.
 */
export interface ChapterJob {
  /** Whose book it goes in. */
  hero: string;
  /** Its story's key and title in the book. */
  key: string;
  title: string;
  at: ChapterAt;
  hour?: number;
  /** Where the story stands once this chapter is kept. */
  mark: ChapterMark;
  /** A chat's book: the last message it is written from. */
  upTo?: number;
  /** Writes it, given what the book's earlier chapters of this story established; null when no chapter came. */
  write(established: string[]): Promise<ChapterDraft | null>;
}

export interface Chapters {
  /** The narrator said these lines aloud: a chapter is written knowing what was said, so it does not say it again. */
  heard(lines: readonly string[]): void;
  /** A chapter is due: at a rest, at the end of a story, when you stop for the night. Written in the background. */
  due(trip: Trip, at: ChapterAt, hero: { name: string; who?: string }): void;
  /** The story now being told (its key), or null between stories. */
  story(key: string | null): void;
  /** What the book has established, for the tellings of the story now being told; "" when nothing. */
  established(): string;
  /** What the book has established, for the builder of the next story at this card; "" when nothing. */
  forBuilder(): string;
  /** A chapter written from somewhere else (`ChapterJob`), in turn with the rest; the chapter as it was kept, or null. */
  dueWith(job: ChapterJob): Promise<BookChapter | null>;
  /** A hero's book, read (and shown on the shelf) at once. */
  open(hero: string): Promise<Book>;
  /** Settles when every chapter asked for so far is written or given up, and its picture drawn or given up. */
  settled(): Promise<void>;
}

/** A story's key in the book: the same as the voice's (frontend.ts). */
export const storyKey = (t: Trip): string => `${t.adv.id}|${t.seed}`;

/** The narrator's lines kept for a chapter to know what was said: the last this many. */
const HEARD_MAX = 40;
/** The most of them a chapter is given, in characters, newest kept. */
const HEARD_CHARS = 2400;
/** A book plate is never anything but clothed, whatever the table allows (Inlay's analyzer reads it). */
export const CLOTHED = "Everyone in it is fully clothed, and nothing in it is sexual.";
/** What tells Inlay what the picture is for. */
const PLATE = "An illustration for a chapter of a storybook:";

export function chapterKeeper(o: ChapterKeeperOptions): Chapters {
  const books = new Map<string, Promise<Book>>();
  let hero: string | null = null;
  let current: string | null = null;
  const heard: string[] = [];
  let heardCount = 0;
  let queue: Promise<void> = Promise.resolve();
  const pictures: Promise<void>[] = [];
  const latest = new Map<string, Book>();
  const fell = (job: string, why: unknown): void => o.fellBack?.(job, why instanceof Error ? why.message : String(why));
  const content = (): ContentSettings => o.content?.() ?? DEFAULT_CONTENT;

  const bookFor = (name: string): Promise<Book> => {
    let b = books.get(name);
    if (!b) {
      b = o
        .load(name)
        .catch(() => null)
        .then((raw) => readBook(raw, name, o.card));
      books.set(name, b);
      void b.then((x) => latest.set(name, x));
    }
    return b;
  };
  /** Change a hero's book: in turn with every other change to it, then kept and shown. */
  const change = (name: string, fn: (b: Book) => Book, show = true): Promise<Book> => {
    const next = bookFor(name).then(fn);
    books.set(name, next);
    return next.then(async (b) => {
      latest.set(name, b);
      try {
        await o.save(name, b);
      } catch (e) {
        fell("book", e);
      }
      if (show && name === hero) o.shelf?.show(b);
      return b;
    });
  };

  /** The narrator's lines since the last chapter of a story, newest kept, within the chapter's share. */
  const heardSince = (told: number | undefined): string[] => {
    const n = told === undefined ? 12 : Math.max(0, heardCount - told);
    const since = heard.slice(-Math.min(n, heard.length));
    const out: string[] = [];
    let size = 0;
    for (let i = since.length - 1; i >= 0 && size < HEARD_CHARS; i--) {
      out.unshift(since[i]!);
      size += since[i]!.length;
    }
    return out;
  };

  const picture = (name: string, c: BookChapter): void => {
    const p = o.pictures;
    if (!p?.allowed()) return;
    const said = c.scene || `${c.title ? `${c.title}. ` : ""}${c.text[0]?.split(/(?<=[.!?])\s/)[0] ?? ""}`;
    const text = playable(`${PLATE} ${said} ${CLOTHED}`, content());
    if (text === VEIL_SAID) return void fell("chapter picture", "its words crossed the table's lines");
    const id = pictureId(`${o.card}-${name}`, c.id);
    const asked: BookPicture = { id, status: "asked" };
    const work = change(name, (b) => withPicture(b, c.id, asked), false)
      .then(() => p.draw({ id, text: text.slice(0, 1900) }))
      .then(
        (got) => ("why" in got ? { id, status: "failed" as const, why: got.why.slice(0, 200) } : { id, status: "ready" as const, imageId: got.imageId, url: got.url }),
        (e: unknown) => ({ id, status: "failed" as const, why: (e instanceof Error ? e.message : String(e)).slice(0, 200) }),
      )
      .then((pic: BookPicture) => {
        if (pic.status === "failed") fell("chapter picture", pic.why ?? "no reason");
        return change(name, (b) => withPicture(b, c.id, pic));
      })
      .then(() => undefined);
    pictures.push(work);
  };

  const write = async (t: Trip, at: ChapterAt, who: { name: string; who?: string }): Promise<void> => {
    const name = who.name || "the traveller";
    const key = storyKey(t);
    const book = await bookFor(name);
    const since = book.marks[key];
    const m = chapterMaterial(t, at, { hero: { name, ...(who.who ? { who: who.who } : {}) }, since: since ?? null, told: heardSince(since?.told), established: established(book, key) });
    const mark = markOf(t, heardCount);
    if (!chapterWorth(m)) {
      await change(name, (b) => withMark(b, key, mark), false);
      return;
    }
    let done: () => void = () => {};
    const writing = new Promise<void>((ok) => (done = ok));
    if (name === hero) o.shelf?.writing(writing);
    try {
      const voice = o.voice ? await o.voice.now().catch(() => null) : null;
      const draft = await writeChapter(o.ask, m, content(), voice, (why) => fell("chapter", why), o.ms);
      if (!draft) return;
      const c: Omit<BookChapter, "n"> = {
        id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
        story: key,
        storyTitle: t.adv.title,
        at,
        title: draft.title,
        text: draft.text,
        facts: draft.facts,
        ...(draft.picture ? { scene: draft.picture } : {}),
        hour: t.sheet.hour,
        written: Date.now(),
      };
      const kept = await change(name, (b) => (at === "end" ? withoutMark(withChapter(b, c, mark), key) : withChapter(b, c, mark)));
      const shelved = kept.chapters.find((x) => x.id === c.id);
      if (shelved) picture(name, shelved);
    } finally {
      done();
    }
  };

  const writeJob = async (j: ChapterJob): Promise<BookChapter | null> => {
    const book = await bookFor(j.hero);
    let done: () => void = () => {};
    const writing = new Promise<void>((ok) => (done = ok));
    if (j.hero === hero) o.shelf?.writing(writing);
    try {
      const draft = await j.write(established(book, j.key));
      if (!draft) return null;
      const c: Omit<BookChapter, "n"> = {
        id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
        story: j.key,
        storyTitle: j.title,
        at: j.at,
        title: draft.title,
        text: draft.text,
        facts: draft.facts,
        ...(draft.picture ? { scene: draft.picture } : {}),
        hour: j.hour ?? 0,
        written: Date.now(),
        ...(j.upTo !== undefined ? { upTo: j.upTo } : {}),
      };
      const kept = await change(j.hero, (b) => withChapter(b, c, j.mark));
      const shelved = kept.chapters.find((x) => x.id === c.id) ?? null;
      if (shelved) picture(j.hero, shelved);
      return shelved;
    } finally {
      done();
    }
  };

  return {
    heard(lines) {
      for (const l of lines) {
        const s = l.replace(/\s+/g, " ").trim();
        if (!s) continue;
        heard.push(s);
        heardCount++;
      }
      if (heard.length > HEARD_MAX) heard.splice(0, heard.length - HEARD_MAX);
    },
    due(t, at, who) {
      hero = who.name || "the traveller";
      // The story as it is now: play goes on (and changes the trip) while the chapter waits its turn and is written.
      const now = JSON.parse(JSON.stringify(t)) as Trip;
      queue = queue.then(() => write(now, at, who)).catch((e) => fell("chapter", e));
    },
    dueWith(job) {
      const work = queue.then(() => writeJob(job));
      queue = work.then(
        () => undefined,
        (e) => fell("chapter", e),
      );
      return work.catch(() => null);
    },
    story(key) {
      current = key;
    },
    established() {
      const b = hero ? latest.get(hero) : undefined;
      return b ? establishedSaid(established(b, current ?? undefined)) : "";
    },
    forBuilder() {
      const b = hero ? latest.get(hero) : undefined;
      return b ? establishedSaid(established(b)) : "";
    },
    async open(name) {
      hero = name;
      const b = await bookFor(name);
      latest.set(name, b);
      o.shelf?.show(b);
      return b;
    },
    async settled() {
      await queue;
      await Promise.all(pictures.map((p) => p.catch(() => undefined)));
    },
  };
}

/** A blank book for a hero, for a room shown before any is read. */
export const blankBook = (hero: string, card: string): Book => emptyBook(hero, card);
