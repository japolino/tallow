/**
 * The narrator's voice for one story (docs/DESIGN.md, 11, item 27): the player's preset as it was when the story began
 * (preset.ts), and the story so far. With them, a narration is one long conversation that only grows at its end:
 *
 *   the preset's blocks from before the chat      the same for the whole story
 *   the frame: what this table is                 the same for every story
 *   the story so far, turn by turn                only ever added to
 *   the preset's blocks from after the chat       the same for the whole story
 *   this turn's rules, and what must be true      new each turn, and last, so they win
 *
 * Everything above the last two is the same bytes from one turn to the next, which is what a provider's prompt cache
 * needs; the host (Lumiverse) places the cache marks, and nothing here is specific to one provider.
 *
 * Pure: the frontend gives the keeper a way to take a snapshot and a place to keep what it holds.
 */
import { readSnapshot, type PresetSnapshot } from "./preset.js";
import type { Message } from "./ask.js";

/** One turn of the story so far: what the game recorded of it, and what the narrator said. */
export interface Turn {
  you: string;
  narrator: string;
}

/** A story's voice, as a narration is laid out under it. */
export interface Voice {
  snapshot: PresetSnapshot;
  log: readonly Turn[];
}

/** What stands between the preset and the story so far. It never changes, so it never breaks a cache. */
export const FRAME = [
  "You are the narrator of a tabletop roleplaying game played at a table in a dark room, in the world and with the characters set out above. Everything above about how to write holds here: its style, its length, its voice, and what it allows to be shown.",
  "What follows is the story so far: each turn, a short record of where the player was, what they wrote and what the game decided, and then what you said.",
  "After it comes this turn. The game's code throws every die and keeps every number, and tells you what must be true; that, and the rules given with it, come before anything above wherever they differ.",
  "The player's character is the one each turn names as the player, whatever name the text above uses for the user. You narrate; the people of the story speak in their own voices inside your narration. Never write the game's records back, and never answer as anyone but the narrator.",
].join("\n");

/** How long the story so far may grow, and what it is cut back to: cut rarely and by a lot, so the cache breaks rarely. */
export const LOG_MAX = 40_000;
export const LOG_KEPT = 20_000;

const size = (log: readonly Turn[]): number => log.reduce((n, t) => n + t.you.length + t.narrator.length, 0);

/** The story so far with a turn added; over its limit, the oldest turns go until about half is left. */
export function grown(log: readonly Turn[], turn: Turn): Turn[] {
  const out = [...log, turn];
  if (size(out) <= LOG_MAX) return out;
  while (out.length > 1 && size(out) > LOG_KEPT) out.shift();
  return out;
}

/** A narration under a story's voice: the job's own messages (its rules, then its facts) come last. */
export function laid(v: Voice, job: readonly Message[]): Message[] {
  const story: Message[] = v.log.flatMap((t) => [
    { role: "user" as const, content: t.you },
    { role: "assistant" as const, content: t.narrator },
  ]);
  return [...v.snapshot.before, { role: "system", content: FRAME }, ...story, ...v.snapshot.after, ...job];
}

/** What a turn was, for the record: where, what the player wrote, and what the game decided. */
export interface Told {
  at?: { name: string; situation?: string };
  wrote?: string;
  /** What must be true, or what happened, in the game's own words. */
  must?: string;
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n).trim()}…` : s);

/** The record of a turn. The place is described the first time it is come to, and only named after that. */
export function recordOf(t: Told, lastPlace?: string): string {
  const lines = [
    t.at ? (t.at.situation && t.at.name !== lastPlace ? `At ${t.at.name}: ${clip(t.at.situation.replace(/\s+/g, " ").trim(), 600)}` : `At ${t.at.name}.`) : "",
    t.wrote?.trim() ? `The player wrote: "${clip(t.wrote.replace(/"/g, "'").trim(), 2000)}"` : "",
    t.must?.trim() ? `The game: ${clip(t.must.replace(/\s+/g, " ").trim(), 800)}` : "",
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "(The story goes on.)";
}

/* ------------------------------ keeping a voice for each story ------------------------------ */

interface Held {
  /** The story it belongs to; null until the story is known. */
  key: string | null;
  /** Undefined until it is taken; null when there is no preset to take. Never changed after that. */
  snapshot?: PresetSnapshot | null;
  taking?: Promise<PresetSnapshot | null>;
  log: Turn[];
  place?: string;
  /** The story is over: it tells its ending under this voice, and the next story gets its own. */
  ended?: boolean;
}

/** What is kept between sittings: the voices of the stories that are not over. */
export interface KeptVoices {
  v: 1;
  voices: { key: string; snapshot: PresetSnapshot; log: Turn[]; place?: string }[];
}

export interface KeeperOptions {
  /** Take a snapshot of the player's preset as it is now. Null when there is none to take. */
  take: () => Promise<PresetSnapshot | null>;
  /** What was kept from before, as it was read back (unchecked). */
  kept?: unknown;
  /** Keep this for next time. */
  keep?: (k: KeptVoices) => void;
  /** The story left unfinished last time, when there is one: its voice is taken up again. */
  resume?: string;
}

export interface Keeper {
  /** The story now being told (its key), or null when the one being told has just ended. */
  story(key: string | null): void;
  /** A new story is about to be told: take its snapshot now, not when its first words are wanted. */
  ahead(): void;
  /** The voice to narrate under, once its snapshot is taken; null when the story has no preset. */
  now(): Promise<Voice | null>;
  /** A turn was told: add it to the story so far. */
  said(told: Told, narrator: string): void;
}

/** How many stories' voices are held at once: a night of free form, and a story begun inside it. */
const HELD = 2;

export function readKept(raw: unknown): Held[] {
  const k = raw as Partial<KeptVoices> | null;
  if (!k || typeof k !== "object" || k.v !== 1 || !Array.isArray(k.voices)) return [];
  const out: Held[] = [];
  for (const h of k.voices) {
    if (!h || typeof h.key !== "string" || !Array.isArray(h.log)) continue;
    const snapshot = readSnapshot(h.snapshot);
    // A voice that does not read back whole is not taken up: the story gets a new one.
    if (!snapshot) continue;
    const log = h.log.filter((t) => t && typeof t.you === "string" && typeof t.narrator === "string").map((t) => ({ you: t.you, narrator: t.narrator }));
    out.push({ key: h.key, snapshot, log, ...(typeof h.place === "string" ? { place: h.place } : {}) });
  }
  return out.slice(-HELD);
}

export function voiceKeeper(o: KeeperOptions): Keeper {
  let held = readKept(o.kept);
  let current: Held = (o.resume ? held.find((h) => h.key === o.resume) : undefined) ?? { key: null, log: [] };

  const keep = (): void => {
    // Only a voice with a preset in it is kept: a story that had none to take (or could not read it) may try again next time.
    const voices = held.filter((h) => h.key && !h.ended && h.snapshot).map((h) => ({ key: h.key!, snapshot: h.snapshot!, log: h.log, ...(h.place ? { place: h.place } : {}) }));
    try {
      o.keep?.({ v: 1, voices });
    } catch {
      /* Not kept: the story goes on under this voice until the page is left. */
    }
  };
  const take = (h: Held): Promise<PresetSnapshot | null> => {
    if (h.snapshot !== undefined) return Promise.resolve(h.snapshot);
    return (h.taking ??= o
      .take()
      .catch(() => null)
      .then((s) => {
        // Taken once: whatever came back is this story's, to its end.
        if (h.snapshot === undefined) h.snapshot = s;
        keep();
        return h.snapshot;
      }));
  };
  const hold = (h: Held): void => {
    held = [...held.filter((x) => x !== h && !x.ended), h].slice(-HELD);
  };

  return {
    story(key) {
      if (key === null) {
        // A voice no story has taken up yet has nothing to end: it waits for the next one.
        if (current.key === null) return;
        current.ended = true;
        held = held.filter((h) => h !== current);
        keep();
        return;
      }
      if (current.key === key && !current.ended) return;
      const known = held.find((h) => h.key === key && !h.ended);
      if (known) current = known;
      else if (current.key === null && !current.ended) current.key = key;
      else current = { key, log: [] };
      hold(current);
      void take(current);
    },
    ahead() {
      // Only when the next story is surely a new one: a story still being told keeps the voice it has.
      if (current.ended) current = { key: null, log: [] };
      if (current.key === null) void take(current);
    },
    async now() {
      const h = current;
      const snapshot = await take(h);
      return snapshot ? { snapshot, log: h.log } : null;
    },
    said(told, narrator) {
      const h = current;
      if (!h.snapshot || !narrator.trim()) return;
      h.log = grown(h.log, { you: recordOf(told, h.place), narrator: narrator.trim() });
      if (told.at) h.place = told.at.name;
      if (h.key && !h.ended) keep();
    },
  };
}
