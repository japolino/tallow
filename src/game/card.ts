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
  /**
   * What the card's pictures show (its avatar and a gallery image or two), described by a model that can see: looks,
   * setting and kind of world. Read with the card's words everywhere the card is read (cardText).
   */
  looks?: string;
  /**
   * The card is a world, place or scenario rather than one person (its name is a land, a town, a game; it narrates
   * many people). Then nobody in the story is called by the card's name: the companion or the one courted is a
   * person from that world. Set by the sitting (session.ts) from `looksLikeWorld` or the Decision model.
   */
  world?: boolean;
  /**
   * Whether a model read the card's character as under 18 or written as a child. Set by the sitting (session.ts) from
   * the Decision model or the reader; with the card's words (card/child.ts) it keeps them from ever being courted.
   */
  minor?: boolean;
}

/* A card's words that say it is a world or a scenario, not a person. Strong ones decide alone. */
const WORLD_STRONG = [
  /\b(narrator|game ?master|dungeon ?master|storyteller|text adventure|text-based (game|rpg|adventure)|interactive (fiction|story)|simulator)\b/i,
  /\b(rpg|role-?playing game)\b/i,
  /\b(this|the) (card|bot) (is|describes) (a|an|the) (world|setting|scenario|place|city|kingdom|game)\b/i,
  /\{\{char\}\} (is|acts as|plays|will play|will narrate|narrates|controls) (the |a |an )?(world|setting|scenario|narrator|game|all|every|other|npcs?|characters)\b/i,
  /\b(play|plays|voice|voices|control|controls) (all|every|the) (other )?(npcs?|characters|people)\b/i,
  /\bnot (a|one) (single )?(character|person)\b/i,
  /\bnpcs?\b/i,
  /^\W{0,4}(factions?|locations?|places|races|regions|world ?(name|info|lore|atmosphere)|magic( system)?|major threats)\W{0,4}:/im,
  // A card laid out as a game master's brief: "## Simulation: ...", "### Mechanics:", "### Objectives for {{user}}:".
  /^\W{0,6}(simulation|world setting)\b/im,
  /^\W{0,6}(game )?mechanics\W{0,4}:?\s*$/im,
  /^\W{0,6}(objectives for (you|\{\{user\}\})|ai responsibilities)\W{0,4}:?\s*$/im,
];
const WORLD_WEAK = [
  /\b(world|realm|kingdom|empire|city|town|village|academy|school|isle|island|continent|lands?|planet|station|colony|province|valley|universe|setting|scenario)\b/i,
  /^\W{0,4}(characters|setting|world|history|geography|lore|background)\W{0,4}:/im,
  /\byou (play as|are playing|arrive in|wake up in|find yourself in)\b/i,
  /\b(the (world|land|city|realm|kingdom) of)\b/i,
];
/* A card's words that say it is one person. */
const PERSON = [
  /^\W{0,4}(age|gender|sex|species|height|appearance|body|likes|dislikes|hobbies|occupation|personality|sexuality)\W{0,4}:/gim,
  /\b\d{1,3}[ -]years?[ -]old\b/gi,
  /\b(his|her) (hair|eyes|face|voice|smile|body|skin)\b/gi,
  /\{\{char\}\} (is|has) (a |an )?(\d|young|old|tall|short|shy|cheerful|cold|kind|man|woman|girl|boy|guy|lady)/gi,
];

/**
 * Whether a card reads as a world or scenario rather than one person, by its own words. The Decision model, when the
 * user has one, is asked the same and its sure answer wins (session.ts); this is the answer without it.
 */
export function looksLikeWorld(card: CardInfo): boolean {
  return worldScore(card) >= WORLD_AT;
}

/** How far a card's words lean towards a world: at WORLD_AT it reads as one; at WORLD_SURE, no model's word overrules it. */
export const WORLD_AT = 4;
export const WORLD_SURE = 9;
export function worldScore(card: CardInfo): number {
  const name = card.name;
  const text = [card.description, card.scenario, card.personality].map((s) => (s ?? "").slice(0, 4000)).join("\n");
  const strong = WORLD_STRONG.filter((r) => r.test(text)).length;
  // A game's or a simulator's name ("Tower of Player V2", "... SIMULATOR") is a world's, never a person's.
  const titled = /\b(v\d+(\.\d+)?|simulator|simulation|rpg)\b/i.test(name) ? 3 : 0;
  const weak = WORLD_WEAK.filter((r) => r.test(text)).length + (WORLD_WEAK[0]!.test(name) ? 2 : 0) + titled;
  const person = PERSON.reduce((n, r) => n + Math.min(3, text.match(r)?.length ?? 0), 0);
  return strong * 3 + weak - person;
}

export type Trope = "rescue" | "courtship";

/** The card's own macros, filled the way the game reads them: the character by name, the user as "you". */
export function unmacro(s: string, name: string): string {
  return s.replace(/\{\{\s*char\s*\}\}|<BOT>/gi, name).replace(/\{\{\s*user\s*\}\}|<USER>/gi, "you").replace(/\{\{[^}]*\}\}/g, "");
}

const trim = (s: string | undefined, max: number): string => (s ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

/**
 * The card as text for a prompt, kept short: the description first, then the rest as room allows. The lore has room
 * of its own (up to a quarter), so a long description does not crowd it out.
 */
export function cardText(card: CardInfo, max = 7000): string {
  let lore = "";
  for (const entry of card.lore ?? []) {
    const t = trim(entry, 600);
    if (t && lore.length + t.length < max / 4) lore += `\nLore:\n${unmacro(t, card.name)}\n`;
  }
  const room = max - lore.length;
  const parts: [string, string | undefined, number][] = [
    ["Description", card.description, 4000],
    ["Personality", card.personality, 800],
    ["Scenario", card.scenario, 1200],
    ["Looks (from the card's pictures)", card.looks, 800],
    ["First message", card.firstMessage, 1500],
  ];
  let out = `Name: ${card.name}\n`;
  for (const [label, text, cap] of parts) {
    const t = trim(text, cap);
    if (t && out.length + t.length < room) out += `\n${label}:\n${unmacro(t, card.name)}\n`;
  }
  return (out + lore).trim();
}

/** Whether the card's character may be courted: never anyone the card reads as a child (docs/DESIGN.md, 7). */
export const courtable = (card: CardInfo): boolean => !card.minor && !isChild(card.name, card.description, card.personality, card.scenario, card.firstMessage);

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
