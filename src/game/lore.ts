/**
 * Which of a card's lorebook entries the builder is given (docs/DESIGN.md, 3.1: the adventure is built from the card
 * and "a little of their lorebook"). Pure: the backend reads the books and, when the user has an embedding model,
 * how near each entry is in meaning to the card; this decides which few go in.
 *
 * An entry ranks up for being always on in the book (constant), for a key word the card itself uses, and most of all
 * for being near the card in meaning. With no embedding model the first two alone decide.
 */

export interface LoreEntry {
  title: string;
  keys: string[];
  content: string;
  constant: boolean;
  /** The book's own order, lower first. */
  order: number;
}

/** At most this many entries, each cut to this many characters. */
export const LORE_MAX = 6;
export const LORE_CHARS = 600;

/** The text an entry is embedded from: its title, keys and the opening of its content. */
export function loreText(e: LoreEntry): string {
  const keys = e.keys.filter((k) => k && k !== e.title).slice(0, 6);
  return `${e.title}${keys.length ? ` (${keys.join(", ")})` : ""}\n${e.content.replace(/\s+/g, " ").trim()}`.slice(0, 900);
}

/** What the card's lore is measured against: who the character is, and the world round them. */
export const loreQuery = (name: string, description: string): string =>
  `${name}. ${description.replace(/\s+/g, " ").trim().slice(0, 900)}\nThe places, people, dangers and customs of ${name}'s world.`;

const usesKey = (keys: string[], text: string): boolean => keys.some((k) => k.trim().length >= 3 && text.includes(k.trim().toLowerCase()));

/**
 * The entries to give the builder, as plain text, best first. `near` holds each entry's likeness to the card in
 * meaning (cosine, about 0 to 1), or nothing when there is no embedding model.
 */
export function pickLore(entries: readonly LoreEntry[], cardText: string, near?: readonly (number | null)[]): string[] {
  const text = cardText.toLowerCase();
  const scored = entries.map((e, i) => {
    const sim = near?.[i];
    const s = (e.constant ? 1.5 : 0) + (usesKey(e.keys, text) ? 1 : 0) + (typeof sim === "number" ? Math.max(0, sim) * 4 : 0);
    return { e, s, i };
  });
  const ranked = scored.sort((a, z) => z.s - a.s || a.e.order - z.e.order || a.i - z.i);
  // With likeness to go on, the nearest entries are worth having even with no key the card uses.
  const kept = near ? ranked : ranked.filter((r) => r.s > 0);
  const out = (kept.length ? kept : ranked.slice(0, 3)).slice(0, LORE_MAX);
  return out.map(({ e }) => `${e.title}: ${e.content.replace(/\s+/g, " ").trim()}`.slice(0, LORE_CHARS));
}
