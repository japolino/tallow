/**
 * Where the narrator's books are kept (engine/chapter.ts): in the user's own storage in Lumiverse, one file for each
 * hero at each card, at the path `bookFile` names. Not in the page's localStorage: a book grows a chapter at every rest
 * and every ending, it should be there on any browser or device the user plays from, and the page's storage is small
 * and already holds the sittings and the stories' voices. Nothing in it leaves the user's own Lumiverse.
 */
import type { SpindleAPI } from "lumiverse-spindle-types";

/** The only paths a book may be kept at: `books/<card>/<chat>-<hero>.json`, in the letters `bookFile` makes. */
const PATH = /^books\/[a-z0-9_-]{1,64}\/[a-z0-9_-]{1,110}\.json$/;
/** A book is a few hundred kilobytes at most (80 chapters); anything far bigger is not one. */
const MOST_BYTES = 2_000_000;

export const bookPathOk = (file: string): boolean => PATH.test(file);

export function createBooks(spindle: Pick<SpindleAPI, "userStorage">) {
  return {
    /** A book as it was kept, or null when there is none (or the path is not a book's). */
    async read(userId: string, file: string): Promise<unknown> {
      if (!bookPathOk(file)) throw new Error("not a book's path");
      return (await spindle.userStorage.getJson<unknown>(file, { fallback: null, userId })) ?? null;
    },
    async keep(userId: string, file: string, book: unknown): Promise<void> {
      if (!bookPathOk(file)) throw new Error("not a book's path");
      if (!book || typeof book !== "object" || (book as { v?: unknown }).v !== 1) throw new Error("not a book");
      if (JSON.stringify(book).length > MOST_BYTES) throw new Error("the book is too big to keep");
      await spindle.userStorage.setJson(file, book, { userId });
    },
  };
}
