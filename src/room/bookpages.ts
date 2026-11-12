/**
 * The narrator's book laid out in pages (room/book.ts draws them): a first page that says whose book it is, then each
 * chapter from a page of its own, its number and title at the head, its picture under them when it has one, and its
 * text flowing on over as many pages as it takes. Nothing here draws: it only measures, with whatever `measure` it is
 * given (a canvas in the room, a stand-in in the tests), so a page is the same wherever it is laid out.
 */
import type { Book } from "../engine/chapter.js";

/** A page's size in pixels, as it is drawn (the page in the room is 0.15 by 0.21 metres, the same shape). */
export const BOOK_PX = { w: 720, h: 1008 };
const SIDE = 70;
const TOP = 104;
const BOTTOM = 92;
export const FONTS = {
  body: '29px Georgia, "Palatino Linotype", "Book Antiqua", serif',
  title: 'italic 40px Georgia, "Palatino Linotype", "Book Antiqua", serif',
  numeral: '22px Georgia, "Palatino Linotype", "Book Antiqua", serif',
  head: 'italic 21px Georgia, "Palatino Linotype", "Book Antiqua", serif',
  note: 'italic 25px Georgia, "Palatino Linotype", "Book Antiqua", serif',
  name: '50px Georgia, "Palatino Linotype", "Book Antiqua", serif',
};
const BODY_LH = 41;
const TITLE_LH = 50;
const INDENT = 30;

export type Item =
  | { t: "line"; text: string; x: number; y: number; font: keyof typeof FONTS; center?: boolean }
  | { t: "rule"; y: number }
  | { t: "ornament"; y: number }
  /** The chapter's picture: drawn in this box when it has come, a note in its place while it is being made. */
  | { t: "picture"; chapter: string; x: number; y: number; w: number; h: number };

export interface LaidPage {
  kind: "front" | "title" | "text" | "blank";
  /** The chapter on it, if any. */
  chapter?: string;
  /** Over the page: the story's title. */
  head?: string;
  /** Its number, from the first page of the first chapter. */
  folio?: number;
  items: Item[];
  /** What is written on it, for a screen reader. */
  said: string;
}

export type Measure = (text: string, font: keyof typeof FONTS) => number;

const NUMERALS: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
export function roman(n: number): string {
  let s = "";
  for (const [v, r] of NUMERALS) while (n >= v) (s += r), (n -= v);
  return s || "O";
}

/** Break a paragraph into lines: the first `first` wide, the rest `width`; a word too long for a line is cut. */
export function wrapLines(measure: (s: string) => number, text: string, width: number, first = width): string[] {
  const lines: string[] = [];
  let line = "";
  const room = (): number => (lines.length ? width : first);
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (measure(w) > room() && w.length > 1) {
      if (line) {
        lines.push(line);
        line = "";
        continue;
      }
      let n = w.length - 1;
      while (n > 1 && measure(w.slice(0, n)) > room()) n--;
      lines.push(w.slice(0, n));
      w = w.slice(n);
    }
    const next = line ? `${line} ${w}` : w;
    if (measure(next) > room()) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Lay the book out in pages. Always an even number of them, so it opens on a spread. */
export function layBook(book: Book, measure: Measure): LaidPage[] {
  const width = BOOK_PX.w - SIDE * 2;
  const mid = BOOK_PX.w / 2;
  const foot = BOOK_PX.h - BOTTOM;
  const pages: LaidPage[] = [];
  const centred = (text: string, y: number, font: keyof typeof FONTS): Item => ({ t: "line", text, x: mid, y, font, center: true });

  // The first page: whose book it is.
  const front: Item[] = [];
  let y = 300;
  front.push(centred("The Book of", y, "note"));
  y += 74;
  for (const l of wrapLines((s) => measure(s, "name"), book.hero || "the traveller", width)) {
    front.push(centred(l, y, "name"));
    y += 62;
  }
  front.push({ t: "rule", y: y + 4 });
  y += 70;
  for (const l of wrapLines((s) => measure(s, "note"), `as the narrator keeps it, at ${book.card || "this"}'s table`, width - 40)) {
    front.push(centred(l, y, "note"));
    y += 36;
  }
  y += 40;
  const n = book.chapters.length;
  front.push(centred(n ? `${n === 1 ? "One chapter" : `${n} chapters`} in it` : "Nothing is written in it yet.", y, "head"));
  front.push({ t: "ornament", y: foot - 70 });
  pages.push({ kind: "front", items: front, said: `The Book of ${book.hero}. ${n ? `${n} chapters.` : "Nothing is written in it yet."}` });

  let folio = 1;
  for (const c of book.chapters) {
    const head = c.storyTitle || undefined;
    let items: Item[] = [];
    let said: string[] = [];
    let kind: LaidPage["kind"] = "title";
    const flush = (): void => {
      pages.push({ kind, chapter: c.id, ...(head && kind !== "title" ? { head } : {}), folio: folio++, items, said: said.join(" ") });
      items = [];
      said = [];
      kind = "text";
      y = TOP;
    };
    // The head of the chapter.
    y = TOP + 70;
    items.push(centred(`CHAPTER ${roman(c.n)}`, y, "numeral"));
    said.push(`Chapter ${c.n}.`);
    y += 66;
    for (const l of wrapLines((s) => measure(s, "title"), c.title || "Untitled", width - 20)) {
      items.push(centred(l, y, "title"));
      y += TITLE_LH;
    }
    said.push(`${c.title}.`);
    y += 4;
    const pictured = c.picture && c.picture.status !== "failed";
    if (pictured) {
      // The picture fills the rest of its page, and the text begins over the leaf.
      const h = Math.min(600, foot - y - 20);
      items.push({ t: "picture", chapter: c.id, x: SIDE, y: y + 8, w: width, h });
      flush();
    } else {
      items.push({ t: "ornament", y: y + 10 });
      y += 66;
    }
    // The text, paragraph by paragraph, over as many pages as it takes.
    c.text.forEach((para, pi) => {
      const lines = wrapLines((s) => measure(s, "body"), para, width, pi === 0 ? width : width - INDENT);
      lines.forEach((l, li) => {
        if (y + BODY_LH > foot) flush();
        items.push({ t: "line", text: l, x: SIDE + (li === 0 && pi > 0 ? INDENT : 0), y: y + 29, font: "body" });
        y += BODY_LH;
      });
      said.push(para);
      y += 8;
    });
    if (items.length) flush();
  }
  if (pages.length % 2) pages.push({ kind: "blank", items: [], said: "" });
  return pages;
}

/** The page the book opens at: the first page of its newest chapter, or the first page when it has none. */
export function openingPage(pages: readonly LaidPage[], book: Book): number {
  const last = book.chapters[book.chapters.length - 1];
  if (!last) return 0;
  const i = pages.findIndex((p) => p.chapter === last.id);
  return i < 0 ? 0 : i;
}
