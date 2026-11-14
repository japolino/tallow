/**
 * Content settings (docs/MOONSHOT.md, 7.6). The community this lives in is adults only, and adult themes are welcome,
 * so content is a setting per chat, not a filter built into the builder. Heat, dark themes and letting the dice decide
 * are on unless the player turns them off at the table ("heat off"); there is no switch for them anywhere else.
 *
 * Two rules hold whatever the settings:
 *   1. Nobody read as a child, ever. Every person record gets an age band, checked by code; nobody without a clear
 *      adult band is in a scene with heat or dark themes, whatever a model writes.
 *   2. A refusal never breaks the game. A reply that comes back refused or empty is a veil drawn ("…and the candle
 *      gutters"); every number stands, and play goes on.
 *
 * Pure.
 */
import { isChild } from "./card/child.js";

export interface ContentSettings {
  /** Off: the scene fades at the door. On (the default): explicit, written by the chat's own model and preset. */
  heat: boolean;
  /** Off: everyone in an intimate scene is willing. On (the default): dubious and unwilling themes, where the world calls for them. */
  dark: boolean;
  /** Off: a die decides whether your hero is caught; what happens next is your choice. On (the default): lose, and the scene goes the world's way. */
  diceDecide: boolean;
  /** Never appear. */
  lines: string[];
  /** Happen off-screen. */
  veils: string[];
}

export const DEFAULT_CONTENT: ContentSettings = { heat: true, dark: true, diceDecide: true, lines: [], veils: [] };

/** Settings from whatever was kept, each field checked: on unless it was turned off. */
export function readContent(raw: unknown): ContentSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase().slice(0, 40)).filter(Boolean).slice(0, 20) : []);
  return { heat: o.heat !== false, dark: o.dark !== false, diceDecide: o.diceDecide !== false, lines: list(o.lines), veils: list(o.veils) };
}

/** The age band of a person in a story. Only the adult bands may be in heat or dark scenes. */
export type AgeBand = "adult" | "elder" | "young-adult" | "minor" | "unclear";
export const ADULT_BANDS: readonly AgeBand[] = ["adult", "elder", "young-adult"];
export const isAdult = (band: AgeBand | undefined): boolean => !!band && ADULT_BANDS.includes(band);

/**
 * A person's age band from what a model said of them and from their own words together: a minor if either says so,
 * else the model's adult band when it gave one, else what the words say. The words never overrule a model's "minor".
 */
export function ageFrom(said: unknown, ...texts: (string | null | undefined)[]): AgeBand {
  const rules = readAgeBand(...texts);
  if (rules === "minor" || said === "minor") return "minor";
  return typeof said === "string" && (ADULT_BANDS as readonly string[]).includes(said) ? (said as AgeBand) : rules;
}

/**
 * A person's age band, read from their own words by code (the same rule as the card's own character, card/child.ts):
 * any sign of a child is a minor; a stated age of 18 or more is an adult (65 or more an elder); words like "old woman"
 * make an elder; plain adult words make an adult; anything else is unclear.
 */
export function readAgeBand(...texts: (string | null | undefined)[]): AgeBand {
  const text = texts.filter(Boolean).join(" ");
  if (isChild(text) || /\b(teen|teenage|teenager|schoolgirl|schoolboy|underage|minor|loli|shota|kid|girl of (?:1[0-7]|[1-9])|boy of (?:1[0-7]|[1-9]))\b/i.test(text)) return "minor";
  const age = /\b(\d{2,3})[-\s]?(?:years?|yrs?)[-\s]?old\b/i.exec(text)?.[1];
  if (age) return Number(age) >= 65 ? "elder" : Number(age) >= 18 ? (Number(age) < 21 ? "young-adult" : "adult") : "minor";
  if (/\b(old (?:woman|man|crone|sailor|soldier)|grandmother|grandfather|elder|elderly|aged|greybeard|widow)\b/i.test(text)) return "elder";
  if (/\b(woman|man|lady|gentleman|wife|husband|mother|father|soldier|knight|captain|merchant|barkeep|innkeeper|priest|priestess|widower|adult|lord|queen|king|mercenary|smith|sailor|doctor|scholar|thief|guard)\b/i.test(text)) return "adult";
  // Monster-world people are adults of their kind when the words say so.
  if (/\b(lamia|harpy|succubus|arachne|centaur|dragon|demon|vampire|elf|dwarf|orc)\b/i.test(text) && !/\b(young|little|small)\b/i.test(text)) return "adult";
  return "unclear";
}

/** How an intimate scene with these people may go: explicit only with heat on and every one of them a clear adult. */
export function sceneHeat(s: ContentSettings, bands: readonly (AgeBand | undefined)[]): "fade" | "explicit" {
  return s.heat && bands.length > 0 && bands.every(isAdult) ? "explicit" : "fade";
}

/** Whether a scene may be unwilling or dubious: dark themes on, and every one of them a clear adult. */
export function sceneDark(s: ContentSettings, bands: readonly (AgeBand | undefined)[]): boolean {
  return s.dark && bands.length > 0 && bands.every(isAdult);
}


/** A word or phrase as a whole word (and its plural): a line on "cat" is not crossed by "category". */
const has = (text: string, word: string): boolean => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:e?s)?\\b`, "i").test(text);
/** Whether a text crosses one of the chat's lines (which must never appear). */
export const crossesLine = (text: string, s: ContentSettings): boolean => s.lines.some((l) => has(text, l));
/** Whether a text touches a veil (which happens off-screen). */
export const touchesVeil = (text: string, s: ContentSettings): boolean => s.veils.some((v) => has(text, v));

/** What the narrator says when a veil is drawn: over a refusal, a line crossed, or a veiled thing. */
export const VEIL_SAID = "…and the candle gutters.";

/** Whether a model's reply came back refused, toned down to nothing, or empty. */
export function refused(reply: string | null | undefined): boolean {
  const t = (reply ?? "").trim();
  if (t.length < 2) return true;
  return /^(i('m| am) (sorry|unable|not able)|i can(no|')t (help|continue|write|do that|assist|create|produce)|as an ai\b|i won't (write|continue|produce)|this request|i must decline|sorry, but)/i.test(t);
}

/** A model's reply as it may be played: the reply, or the veil when it was refused or crossed a line. */
export function playable(reply: string | null | undefined, s: ContentSettings): string {
  if (refused(reply) || crossesLine(reply ?? "", s)) return VEIL_SAID;
  return reply!.trim();
}

/**
 * What a model writing a scene is told, from the settings: one or two plain lines. The chat's own preset decides how
 * far a scene goes; this only says what the game allows.
 */
export function contentRules(s: ContentSettings, bands: readonly (AgeBand | undefined)[]): string {
  const heat = sceneHeat(s, bands);
  const parts = [heat === "explicit" ? "Intimate scenes may be explicit, if the chat's own instructions allow it." : "Intimate scenes fade at the door: say that it happens, not how."];
  parts.push(sceneDark(s, bands) ? "Dubious and unwilling themes are allowed where this world calls for them." : "Everyone in an intimate scene is willing.");
  if (bands.some((b) => !isAdult(b))) parts.push("Someone here is not clearly an adult: nothing romantic or sexual involves them, in any way.");
  if (s.lines.length) parts.push(`Never include: ${s.lines.join(", ")}.`);
  if (s.veils.length) parts.push(`Keep off-screen: ${s.veils.join(", ")}.`);
  return parts.join(" ");
}

// ---- Setting content at the table ----

const ON = /\b(on|yes|allowed|welcome|please|enable|enabled|fine|ok|okay)\b/i;
const OFF = /\b(off|no|none|not|never|disable|disabled|stop|without)\b/i;
/**
 * On or off, for one setting in a line: read in the part of the line that names it ("heat on, no limits" is heat on).
 * A plain "on" or "off" there decides; then a "no" or "not" before the name; then the other words.
 */
const switchOf = (line: string, key: RegExp): boolean | null => {
  const part = line.split(/[,;.!?]|\b(?:but|and|then|also)\b/i).find((c) => key.test(c)) ?? line;
  if (/\boff\b/i.test(part)) return false;
  if (/\bon\b/i.test(part)) return true;
  const at = part.search(key);
  if (at > 0 && OFF.test(part.slice(0, at))) return false;
  return OFF.test(part) ? false : ON.test(part) ? true : null;
};
const DARK = /\bdark (themes?|content|stuff)\b|\bdub(ious)?[- ]?con\b|\bnon[- ]?con\b/i;
const HEAT = /\b(heat|nsfw|explicit|spicy|lewd|smut)\b/i;
const clip = (x: string): string => x.trim().toLowerCase().replace(/[.!?"']+$/g, "").slice(0, 40);

/**
 * Content set at the table, in your own words (docs/MOONSHOT.md, 7.6): "heat on", "no heat", "dark themes on", "let the
 * dice decide", "line: spiders", "veil: torture", "no more lines". Null when the line sets nothing, so it is read as
 * play. Pure: the settings in, the new settings out.
 */
export function contentFromLine(line: string, s: ContentSettings): ContentSettings | null {
  const t = line.trim();
  const listed = /^(lines?|veils?)\s*[:=]\s*(.+)$/i.exec(t);
  if (listed) {
    const items = listed[2]!.split(/[,;]|\band\b/i).map(clip).filter((x) => x.length >= 2);
    if (!items.length) return null;
    const key = /^line/i.test(listed[1]!) ? "lines" : "veils";
    return readContent({ ...s, [key]: [...new Set([...s[key], ...items])] });
  }
  if (/\b(clear|no more|drop|remove)\b.*\b(lines?|veils?)\b/i.test(t)) {
    const lines = /\blines?\b/i.test(t);
    const veils = /\bveils?\b/i.test(t);
    return { ...s, ...(lines ? { lines: [] } : {}), ...(veils ? { veils: [] } : {}) };
  }
  if (/\b(dice|die) decides?\b|\blet the dice\b/i.test(t)) return { ...s, diceDecide: !/\b(don'?t|do not|never|no|not|stop)\b/i.test(t) };
  if (/\b(my choice|i choose|i decide)\b.*\b(caught|lose|scene)\b/i.test(t)) return { ...s, diceDecide: false };
  // Dark themes and heat, either or both in one line ("heat on, no dark stuff").
  let out: ContentSettings | null = null;
  if (DARK.test(t)) {
    const v = switchOf(t, DARK);
    if (v !== null) out = { ...(out ?? s), dark: v };
  }
  // Heat in a short line, or said plainly as on or off in a longer one ("heat on, and let's do a heist in the docks").
  if (HEAT.test(t) && (t.split(/\s+/).length <= 8 || /\b(heat|nsfw)\s+(?:is\s+)?(on|off)\b|\bno (heat|nsfw)\b/i.test(t))) {
    const v = /^(heat|nsfw|explicit|spicy|lewd|smut)\s*[.!]?$/i.test(t) ? true : switchOf(t, HEAT);
    if (v !== null) out = { ...(out ?? s), heat: v };
  }
  return out;
}

/** What the narrator says back when content was set at the table: the settings as they now stand, plainly. */
export function contentSaid(s: ContentSettings): string {
  const parts = [
    s.heat ? "Heat is on: intimate scenes may be explicit." : "Heat is off: intimate scenes fade at the door.",
    s.dark ? "Dark themes are on, where the world calls for them." : "Dark themes are off: everyone is willing.",
    s.diceDecide ? "The dice decide how a lost scene goes." : "When you are caught, what happens next is your choice.",
  ];
  if (s.lines.length) parts.push(`Lines, never shown: ${s.lines.join(", ")}.`);
  if (s.veils.length) parts.push(`Veils, kept off-screen: ${s.veils.join(", ")}.`);
  return `Noted in the margin of my notebook. ${parts.join(" ")}`;
}
