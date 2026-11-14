/**
 * The music a scene may be given: the composer's whole library (embedded/pieces.js, about twelve hundred pieces), and
 * how a few of them are found for what a model says a scene wants.
 *
 * A model reads the scene and says what its music should be, in the library's own words for genre and feel and in its
 * own for the rest. Code finds the pieces that come nearest, and a model picks among those (game/music.ts). Nothing
 * here chooses for a scene by itself: without a model's words there are no candidates.
 */
import { PIECES } from "../embedded/pieces.js";

export interface Piece {
  title: string;
  /** The file's name on the composer's site. */
  file: string;
  seconds: number;
  /** Beats a minute; 0 when the library does not say. */
  bpm: number;
  genre: string;
  feels: string[];
  instruments: string;
  collection: string;
}

export const LIBRARY: readonly Piece[] = PIECES.map(([title, file, seconds, bpm, genre, feels, instruments, collection]) => ({
  title, file: file || `${title}.mp3`, seconds, bpm, genre, feels: feels.split(", ").filter(Boolean), instruments, collection,
}));

const counted = (words: string[]): string[] => {
  const n = new Map<string, number>();
  for (const w of words) n.set(w, (n.get(w) ?? 0) + 1);
  // A word the library uses once or twice is no vocabulary.
  return [...n].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).map(([w]) => w);
};
/** The library's own words, most used first. */
export const GENRES: readonly string[] = counted(LIBRARY.map((p) => p.genre));
export const FEELS: readonly string[] = counted(LIBRARY.flatMap((p) => p.feels));

const low = (s: string): string => s.toLowerCase().trim();
const BY_TITLE = new Map(LIBRARY.map((p) => [low(p.title), p]));
/** A piece by its title, however it is cased. */
export const pieceCalled = (title: string): Piece | undefined => BY_TITLE.get(low(title));

export type Pace = "slow" | "medium" | "fast";

/** What a scene's music should be, as a model said it. */
export interface Wanted {
  /** From FEELS. */
  feels: string[];
  /** From GENRES. */
  genres: string[];
  /** In the model's own words: "lute", "strings", "synths". */
  instruments: string[];
  pace: Pace | "";
  /** A few words of its own, matched against titles and collections. */
  words: string;
}

/** A model's words for a scene, kept to what the library knows. Null when nothing of it is usable. */
export function wanted(feels: unknown[], genres: unknown[], instruments: unknown[], pace: unknown, words: unknown): Wanted | null {
  const known = (said: unknown[], vocab: readonly string[], most: number): string[] =>
    [...new Set(said.map((s) => vocab.find((v) => low(v) === low(String(s ?? "")))).filter((v): v is string => !!v))].slice(0, most);
  const w: Wanted = {
    feels: known(feels, FEELS, 3),
    genres: known(genres, GENRES, 3),
    instruments: [...new Set(instruments.map((s) => low(String(s ?? "")).replace(/[^a-z ]/g, "").trim()).filter((s) => s.length >= 3 && s.length <= 24))].slice(0, 4),
    pace: (["slow", "medium", "fast"] as const).find((p) => p === low(String(pace ?? ""))) ?? "",
    words: String(words ?? "").replace(/[<>{}]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120),
  };
  return w.feels.length || w.genres.length ? w : null;
}

const paceOf = (bpm: number): Pace | "" => (!bpm ? "" : bpm < 84 ? "slow" : bpm <= 124 ? "medium" : "fast");

/** How near a piece comes to what is wanted. */
export function nearness(p: Piece, w: Wanted): number {
  let n = 0;
  const hits = p.feels.filter((f) => w.feels.includes(f)).length;
  // Every feel asked for counts; a piece that is also other things counts a little less.
  n += hits * 3 - (p.feels.length - hits) * 0.6;
  if (w.genres.includes(p.genre)) n += 3 + (w.genres[0] === p.genre ? 1 : 0);
  const inst = low(p.instruments);
  // "strings" finds "Strings"; "lute" finds "Lute"; a plural finds its singular.
  n += Math.min(3, w.instruments.filter((i) => inst.includes(i) || inst.includes(i.replace(/s$/, ""))).length) * 2;
  const pace = paceOf(p.bpm);
  if (w.pace && pace) n += pace === w.pace ? 1.5 : pace === "medium" || w.pace === "medium" ? -0.5 : -2;
  const name = low(`${p.title} ${p.collection}`);
  n += Math.min(2, low(w.words).split(/[^a-z]+/).filter((t) => t.length >= 4 && name.includes(t)).length) * 1.5;
  // Long enough to sit under a scene without coming round again at once.
  if (p.seconds >= 120 && p.seconds <= 420) n += 0.5;
  return n;
}

/**
 * The pieces that come nearest to what is wanted, nearest first: what a model then picks among. Pieces played lately
 * are left out while there are enough others, and a little chance keeps the same words from always finding the same
 * few.
 */
export function candidates(w: Wanted, recent: readonly string[], most = 14, rnd: () => number = Math.random, library: readonly Piece[] = LIBRARY): Piece[] {
  const lately = new Set(recent.map(low));
  const ranked = library.map((p) => ({ p, n: nearness(p, w) + rnd() * 1.2 })).filter((x) => x.n > 2).sort((a, b) => b.n - a.n);
  const fresh = ranked.filter((x) => !lately.has(low(x.p.title)));
  return (fresh.length >= Math.min(most, 4) ? fresh : ranked).slice(0, most).map((x) => x.p);
}

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
/** A piece as a model is shown it. */
export const pieceLine = (p: Piece): string =>
  [`"${p.title}"`, p.genre, p.feels.join(", "), p.instruments || "instruments not said", p.bpm ? `${p.bpm} beats a minute` : "", clock(p.seconds), p.collection ? `in the collection "${p.collection}"` : ""].filter(Boolean).join("; ");
