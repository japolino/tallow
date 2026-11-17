/**
 * A table for several, as it travels through a Lumiverse room.
 *
 * A room carries chat messages to every player and nothing else, so the table's state rides on the messages: Tallow's
 * host writes it into its own entry of a message's extension metadata (`extra.spindle_metadata.tallow`), and every
 * player's Tallow reads it from there (the host's own included, so there is one way of seeing the table). A player's
 * line gets what was made of it (the check and the die) as soon as it is judged; the narrator's message gets what the
 * round changed and the run as it now stands.
 *
 * A player who sits down for the first time says so with their first line, which carries their character's page: the
 * room gives the host nothing else of a guest's persona that an extension can read.
 */
import type { Run } from "../engine/run.js";
import { settled } from "../engine/seats.js";

/** The key of Tallow's own entry in a message's extension metadata: the extension's identifier (spindle.json). */
export const OWN = "tallow";

/** One player's part of a round, as their table says and shows it. */
export interface WirePart {
  seat: string;
  /** Their character's name. */
  name: string;
  how: "played" | "joined" | "answered";
  line: string;
  /** What was judged, as a heading for the page ("Choke the goblin from behind"). */
  heading?: string;
  /** The check, as the narrator says it before the die; there when something was rolled. */
  check?: string[];
  /** The die: the face it shows (decided by the host), and the roll as the narrator reads it out. */
  die?: { face: number; said: string };
  /** Said before the passage when the attempt could not be made at all. */
  aside?: string;
  /** An answer from outside the story, for a line that was for the game itself. */
  reply?: string;
  /** What changed for this character; filled once the passage is read back. */
  changes: string[];
}

/** On a player's line, once it is judged. */
export interface WireLine {
  v: 1;
  kind: "line";
  part: WirePart;
}

/** On the narrator's message, once the passage is read back; the opening carries one with no parts. */
export interface WireRound {
  v: 1;
  kind: "round";
  /** The run's turn after the round. */
  n: number;
  parts: WirePart[];
  /** The run as it now stands (wireRun). Only the latest narrator's message keeps it. */
  run?: Run;
  /** The round had nothing to tell: the message is the game's answers to the players, not story. */
  idle?: boolean;
}

export type Wire = WireLine | WireRound;

/** Tallow's entry on a message, from the message's `extra` (or its `metadata` bag, as the backend reads it). */
export function wireOf(bag: unknown): Wire | null {
  const b = bag as { spindle_metadata?: Record<string, unknown> } & Record<string, unknown> | null | undefined;
  const own = (b?.spindle_metadata?.[OWN] ?? b?.[OWN]) as Wire | undefined;
  return own && typeof own === "object" && own.v === 1 && (own.kind === "line" || own.kind === "round") ? own : null;
}

/**
 * A run as it is sent: whole in everything a table shows, and without the long texts only the host's models read
 * (the world, the pages, the summary, all but the last of the story). A room drops a message that is too large, so
 * what travels is kept small.
 */
export function wireRun(r: Run): Run {
  const w = structuredClone(settled(r));
  w.world = "";
  w.who = "";
  w.summary = "";
  w.beats = w.beats.slice(-1);
  w.opening = w.beats.length ? "" : w.opening.slice(0, 6000);
  for (const s of w.seats ?? []) s.who = "";
  return w;
}

/* ------------------------------------------------- sitting down ------------------------------------------------- */

const SITS = " sits down at the table.)";

/** A guest's first line: who sits down, and their character's page (kept under what a room lets one message be). */
export function seatLine(name: string, page: string): string {
  const n = name.replace(/[()\n]/g, " ").trim().slice(0, 60) || "A stranger";
  return `(${n}${SITS}${page.trim() ? `\n\n${page.trim().slice(0, 3000)}` : ""}`;
}

/** A first line read back: the character's name and page; null for any other line. */
export function readSeatLine(content: string): { name: string; page: string } | null {
  const t = content.trim();
  const at = t.indexOf(SITS);
  if (!t.startsWith("(") || at < 2 || at > 62) return null;
  return { name: t.slice(1, at).trim(), page: t.slice(at + SITS.length).trim() };
}
