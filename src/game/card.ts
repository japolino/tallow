/**
 * A character card, as much of it as the game reads (docs/DESIGN.md, 3.1 and 5): who the character is, the world they
 * live in, and a little of their lorebook. The game never changes the card.
 */
import { isChild } from "../engine/card/child.js";

export interface CardInfo {
  name: string;
  description: string;
  personality?: string;
  scenario?: string;
  /** The card's first message: often the best picture of its world. */
  firstMessage?: string;
  /** A few lorebook entries, already chosen, as plain text. */
  lore?: string[];
}

export type Trope = "rescue" | "courtship";

/** The card's own macros, filled the way the game reads them: the character by name, the user as "you". */
export function unmacro(s: string, name: string): string {
  return s.replace(/\{\{\s*char\s*\}\}|<BOT>/gi, name).replace(/\{\{\s*user\s*\}\}|<USER>/gi, "you").replace(/\{\{[^}]*\}\}/g, "");
}

const trim = (s: string | undefined, max: number): string => (s ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

/** The card as text for a prompt, kept short: the description first, then the rest as room allows. */
export function cardText(card: CardInfo, max = 7000): string {
  const parts: [string, string | undefined, number][] = [
    ["Description", card.description, 4000],
    ["Personality", card.personality, 800],
    ["Scenario", card.scenario, 1200],
    ["First message", card.firstMessage, 1500],
  ];
  let out = `Name: ${card.name}\n`;
  for (const [label, text, cap] of parts) {
    const t = trim(text, cap);
    if (t && out.length + t.length < max) out += `\n${label}:\n${unmacro(t, card.name)}\n`;
  }
  for (const entry of card.lore ?? []) {
    const t = trim(entry, 600);
    if (t && out.length + t.length < max) out += `\nLore:\n${unmacro(t, card.name)}\n`;
  }
  return out.trim();
}

/** Whether the card's character may be courted: never anyone the card reads as a child (docs/DESIGN.md, 7). */
export const courtable = (card: CardInfo): boolean => !isChild(card.name, card.description, card.personality, card.scenario, card.firstMessage);

/** The tropes this card is offered. Only tropes the card can support (3.1): a courtship needs someone who may be courted. */
export const tropesFor = (card: CardInfo): Trope[] => (courtable(card) ? ["rescue", "courtship"] : ["rescue"]);

/** Which trope a written line asks for, or null when it cannot be told. */
export function tropeRead(line: string, offered: readonly Trope[]): Trope | null {
  const l = line.toLowerCase();
  const court = /\b(court|courting|courtship|woo|wooing|romance|romantic|love|heart|date|kiss|win (?:her|him|them))/.test(l);
  const rescue = /\b(rescue|save|saving|free|freeing|get (?:her|him|them) out|break (?:her|him|them) out|taken|kidnap)/.test(l);
  const pick: Trope | null = court && !rescue ? "courtship" : rescue && !court ? "rescue" : null;
  return pick && offered.includes(pick) ? pick : null;
}
