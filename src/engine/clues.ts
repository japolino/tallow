/**
 * Finding things out (docs/LOOP.md, 4): clues, keys, and a map inked by leads.
 *
 * Each story hides a truth, and the end needs three keys: three things to know or have. Every key has at least three
 * clues, in different places or people, so missing one never locks the story. A clue is a slip the narrator writes and
 * hands you, a line long, in one of four states: heard (someone told you), doubted (a hunch says it may be false),
 * seen (your own eyes: sure), proved (two clues agree). Some are lies, which code knows and you do not.
 *
 * Most clues point somewhere. When you get one that points to a place you have not been, the narrator inks that place
 * onto the map. Where to go next is never handed to you: it is written on the slips in front of you.
 *
 * Pure: facts in, an answer out.
 */

/** A story's kind, for what its three keys are. */
export type StoryKind = "mystery" | "rescue" | "heist" | "journey" | "hunt" | "romance" | "survival";

/** The three keys each kind of story needs (docs/LOOP.md, 4.1). */
export const KEYS: Record<StoryKind, readonly [string, string, string]> = {
  mystery: ["who did it", "how it was done", "where they will be"],
  rescue: ["where they are held", "a way in", "who guards them, and when"],
  heist: ["a way in", "the guards' habits", "the secret of the lock"],
  journey: ["the safe road", "who is following", "the word that gets you through"],
  hunt: ["its lair", "its weakness", "what draws it out"],
  romance: ["what they long for", "the old wound", "the rival's lie"],
  survival: ["what the danger wants", "its weak point", "who can be trusted"],
};

/** A clue: a line of fact, the key it bears on, where it points, and whether it is true. */
export interface Clue {
  id: string;
  /** What the slip says, a line long. */
  text: string;
  /** The key (0, 1 or 2) it bears on, if any. */
  key?: 0 | 1 | 2;
  /** The place it points to, if any: getting it inks that place on the map. */
  points?: string;
  /** An appointment it tells of (schedule.ts): getting it cuts a notch in the candle. */
  tells?: string;
  /** It is a lie. Code knows; the player does not. */
  false?: boolean;
  /** For a false clue, the true one it hides. */
  truth?: string;
  /** Clues it cannot be true together with: laid side by side, they are proof one is false. */
  against?: string[];
  /** How you get it: from a person (by id), seen at a place, or found by a throw there. */
  from?: { person?: string; place?: string };
}

export type SlipState = "heard" | "doubted" | "seen" | "proved" | "torn";

/** A slip on your side of the table. */
export interface Slip {
  clue: string;
  state: SlipState;
}

/** Where your slips and your map stand. */
export interface Casebook {
  slips: Slip[];
  /** Places inked on the map. */
  mapped: string[];
  /** Slips leaned on already (each is leverage once). */
  leaned: string[];
}

export const newCasebook = (mapped: string[] = []): Casebook => ({ slips: [], mapped, leaned: [] });

/** What getting a clue did: the slip, a place inked, an appointment learned. */
export interface Got {
  book: Casebook;
  slip: Slip;
  /** A place newly inked onto the map. */
  inked?: string;
  /** An appointment the clue tells of. */
  tells?: string;
  /** It was already on the table. */
  again: boolean;
}

/**
 * You get a clue (4.2): heard when told, seen when you saw it. A doubted hunch marks it with a question. A clue that
 * points to a place not on the map inks it there. A clue already held is not given twice, but seeing what you were told
 * makes it sure.
 */
export function getClue(book: Casebook, clue: Clue, how: "heard" | "seen", hunch = false): Got {
  const had = book.slips.find((s) => s.clue === clue.id);
  const state: SlipState = how === "seen" ? "seen" : hunch ? "doubted" : "heard";
  if (had) {
    // Seen with your own eyes, a slip you only heard is better; a hunch later on still marks one you only heard.
    const better = had.state === "heard" && (state === "seen" || state === "doubted") ? state : had.state;
    const slip = { ...had, state: better };
    return { book: { ...book, slips: book.slips.map((s) => (s.clue === clue.id ? slip : s)) }, slip, again: true };
  }
  const slip = { clue: clue.id, state };
  const inked = clue.points && !book.mapped.includes(clue.points) ? clue.points : undefined;
  return {
    book: { ...book, slips: [...book.slips, slip], mapped: inked ? [...book.mapped, inked] : book.mapped },
    slip,
    ...(inked ? { inked } : {}),
    ...(clue.tells ? { tells: clue.tells } : {}),
    again: false,
  };
}

/** A slip is marked doubted (a hunch, or a reading that says it may be false). */
export const doubt = (book: Casebook, id: string): Casebook => ({ ...book, slips: book.slips.map((s) => (s.clue === id && s.state !== "proved" ? { ...s, state: "doubted" } : s)) });

/**
 * Two slips laid together (4.2, proof): if they cannot both be true, a throw on Wits that works tears the false one in
 * half and gives the truth; if they agree on a key, both are proved. Code knows which is false.
 */
export function layTogether(book: Casebook, clues: readonly Clue[], a: string, b: string, works: boolean): { book: Casebook; torn?: string; truth?: string; proved?: boolean } {
  const ca = clues.find((c) => c.id === a), cb = clues.find((c) => c.id === b);
  const held = (id: string) => book.slips.some((s) => s.clue === id && s.state !== "torn");
  if (!ca || !cb || !held(a) || !held(b) || !works) return { book };
  const clash = (ca.against ?? []).includes(b) || (cb.against ?? []).includes(a);
  if (clash) {
    const liar = ca.false ? ca : cb.false ? cb : null;
    if (!liar) return { book };
    const slips = book.slips.map((s) => (s.clue === liar.id ? { ...s, state: "torn" as SlipState } : s));
    return { book: { ...book, slips }, torn: liar.id, ...(liar.truth ? { truth: liar.truth } : {}) };
  }
  if (ca.key !== undefined && ca.key === cb.key && !ca.false && !cb.false) {
    const slips = book.slips.map((s) => (s.clue === a || s.clue === b ? { ...s, state: "proved" as SlipState } : s));
    return { book: { ...book, slips }, proved: true };
  }
  return { book };
}

/**
 * Whether a key is known (4.2): one proved clue, or two true ones that bear on it and are not torn. A false clue never
 * makes a key known, though it may make you think so.
 */
export function keyKnown(book: Casebook, clues: readonly Clue[], key: 0 | 1 | 2): boolean {
  const on = book.slips.filter((s) => s.state !== "torn").map((s) => ({ s, c: clues.find((c) => c.id === s.clue) })).filter((x) => x.c && x.c.key === key && !x.c.false);
  return on.some((x) => x.s.state === "proved") || on.length >= 2;
}

/** How many of the three keys are known. */
export const keysKnown = (book: Casebook, clues: readonly Clue[]): number => ([0, 1, 2] as const).filter((k) => keyKnown(book, clues, k)).length;

/** Each key held is an edge in the finale (docs/MOONSHOT.md, 6.1): with all three the gap is fair; with none it is hopeless. */
export const keyEdges = (book: Casebook, clues: readonly Clue[]): number => keysKnown(book, clues);

/**
 * Leaning on a slip (4.4): a fact you can use, as a lever. Once each; a torn slip cannot be leaned on. Leaning on a lie
 * still works on someone who believes it, so code does not stop you.
 */
export function lean(book: Casebook, id: string): { book: Casebook; ok: boolean } {
  const slip = book.slips.find((s) => s.clue === id);
  if (!slip || slip.state === "torn" || book.leaned.includes(id)) return { book, ok: false };
  return { book: { ...book, leaned: [...book.leaned, id] }, ok: true };
}

/** Which slip a line leans on, by the words of the slip. */
export function slipNamed(line: string, book: Casebook, clues: readonly Clue[]): string | null {
  const l = line.toLowerCase();
  let best: string | null = null, score = 0;
  for (const s of book.slips) {
    if (s.state === "torn") continue;
    const c = clues.find((x) => x.id === s.clue);
    const words = (c?.text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !["that", "this", "with", "from", "were", "they", "have", "there", "their", "goes", "into", "what", "when", "says", "swears"].includes(w));
    const n = words.filter((w) => l.includes(w)).length;
    if (n > score) (best = s.clue), (score = n);
  }
  return best;
}

/**
 * Checking a story before it is played (4.2): every key has at least three true clues, from at least two different
 * people or places; every false clue can be caught (it clashes with a true one).
 */
export function checkClues(clues: readonly Clue[]): string[] {
  const problems: string[] = [];
  for (const k of [0, 1, 2] as const) {
    const on = clues.filter((c) => c.key === k && !c.false);
    if (on.length < 3) problems.push(`key ${k} has only ${on.length} true clue(s)`);
    const sources = new Set(on.map((c) => c.from?.person ?? c.from?.place ?? c.id));
    if (sources.size < 2) problems.push(`key ${k} has its clues in one place`);
  }
  for (const c of clues.filter((x) => x.false)) {
    const caught = (c.against ?? []).some((id) => clues.some((x) => x.id === id && !x.false)) || clues.some((x) => !x.false && (x.against ?? []).includes(c.id));
    if (!caught) problems.push(`the lie ${c.id} cannot be caught`);
  }
  return problems;
}

/** What a slip looks like on the table, in words: the state is how it lies (a question mark inked, a wax drop, a pin). */
export function slipSaid(slip: Slip, clue: Clue): string {
  const mark = slip.state === "doubted" ? " (?)" : slip.state === "seen" ? " (seen)" : slip.state === "proved" ? " (proved)" : slip.state === "torn" ? " (torn: a lie)" : "";
  return `${clue.text}${mark}`;
}
