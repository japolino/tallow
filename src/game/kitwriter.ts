/**
 * The world kit written by a model (docs/PROPOSAL-llm-first.md, 1).
 *
 * A kit says how a world plays: its era, what people fear, what gear is nothing, plain and made-for-it, which contests
 * it has, what its foes are hurt by, what being taken out means and what threats want. The builder writes it from the
 * card, what the player asked for and who they are, choosing from code's fixed lists where a list exists. Code checks it:
 * the words that make the world its own (name, era, fears, the gear ladder, wants) must all be there and plain, or the
 * whole kit is thrown away; the mechanical lists are held to code's menus by `checkKit`, falling back to the stock kit
 * the model said the world is nearest to. Only when no model answers is the kit picked by the card's words
 * (`kitFromWords`).
 */
import { CONTEST_KINDS, DIALS, KIT_IDS, POWER_NAMES, TAKEN_OUTS, checkKit, kitFromWords, type KitId, type WorldKit } from "../engine/kit.js";
import { allowedTakenOut, type ContentSettings } from "../engine/content.js";
import { firstJson, type Ask, type Message } from "./prompts.js";

const VERBS = ["reach", "bind", "sweep", "drain", "ward", "edge", "sway", "ease", "aid", "slip"];
const STATS = ["brawn", "grace", "charm", "guile", "wits", "sense", "power"];

/** How long a model is given to write the kit before the stock one is used. */
const KIT_MS = 25000;

export interface KitAsks {
  /** What the player asked for, in their words: the night's premise. */
  asked?: string;
  /** Who the player is, in their words. */
  who?: string;
  /** Whether the card is of our own day, as the Decision model read it (undefined: not known). */
  modern?: boolean;
}

export function kitMessages(world: string, content: ContentSettings, asks: KitAsks = {}): Message[] {
  const taken = allowedTakenOut([...TAKEN_OUTS], content);
  const system = [
    "You set up how a tabletop world plays. The rules, the die and every number are fixed; you say what this world is like, so the game can speak in its terms.",
    "Read the card (and what the player asked for, and who they are) and write the world's kit as JSON. Write every text value for THIS world, in its own words: its places, its tools, its fears. Never a generic fantasy (castles, villages, swords) unless the card plainly is one. A tower climbed floor by floor talks of floors, bosses and loot; a dungeon builder's world talks of cores, traps and adventurers; a city of our day talks of phones, cars and the police.",
    "Where a field gives a list, choose only from it. Write the JSON only, no markdown.",
  ].join("\n");
  const shape = {
    like: `<the stock world this is nearest to, for anything you leave out: one of ${KIT_IDS.join(", ")}>`,
    name: "<a short name for how this world plays, 2 to 5 words>",
    magic: "<none, low or high>",
    era: "<the era, its places and its tools, in a few words (under 120 letters)>",
    fears: "<what people here fear, a few things>",
    power: `<the seventh strength some here have, one of ${POWER_NAMES.join(", ")}; or none>`,
    risks: [{ dial: `<one of ${DIALS.join(", ")}: what you risk losing in this world>`, name: "<what this world calls it, 1 or 2 words>" }],
    gear: {
      fight: { none: "<fighting with nothing>", plain: "<plain weapons and armour here>", made: "<the best ordinary ones>", best: "<the rare best there is>" },
      travel: { none: "<travelling with nothing>", plain: "<plain ways to get about>", made: "<the best ordinary way>" },
      entry: { none: "<getting in with nothing>", plain: "<plain tools for getting in>", made: "<the best ordinary ones>" },
    },
    contests: [{ kind: `<one of ${CONTEST_KINDS.join(", ")}>`, attack: [`<1 or 2 of ${STATS.join(", ")}>`], defend: ["<1 or 2 of the same>"] }],
    verbs: [`<2 to 4 of ${VERBS.join(", ")}: what abilities here lean on>`],
    hurts: ["<2 to 5 things foes here are weak to, 1 or 2 plain words each>"],
    takenOut: [`<1 to 3 of ${taken.join(", ")}: what being beaten means here>`],
    wants: ["<2 or 3 things threats here want from you, a few words each>"],
  };
  const user = [
    `THE CARD\n${world}`,
    ...(asks.asked ? [`WHAT THE PLAYER ASKED FOR, in their words: "${asks.asked.slice(0, 600)}"`] : []),
    ...(asks.who ? [`WHO THE PLAYER IS, in their words: "${asks.who.slice(0, 500)}"`] : []),
    ...(asks.modern === true ? ["The card is set in our own day (or near it)."] : asks.modern === false ? ["The card is not set in our own day."] : []),
    `THE KIT TO WRITE (replace every <note>; contests: 2 to 5 of them, the first being how a fight here goes)\n${JSON.stringify(shape, null, 1)}`,
  ].join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

const plain = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/[*_#`]+/g, "").replace(/\s+/g, " ").trim();
  return s.length >= 2 && s.length <= max && !/[{}<>]/.test(s) ? s : null;
};
/** Every string inside a value, however deep. */
const stringsIn = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v as Record<string, unknown>).flatMap(stringsIn) : []);
const rungWhole =(v: unknown): boolean => {
  const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return !!(plain(r.none, 60) && plain(r.plain, 60) && plain(r.made, 60));
};

/**
 * A model's kit, checked whole: null unless the words that make the world its own are all there and plain (a name, an
 * era, its fears, every rung of the gear ladder, what threats want). The rest goes through `checkKit`, held to code's
 * lists, with the stock kit the model named as nearest for anything that does not check.
 */
export function parseKit(raw: unknown, content: ContentSettings, fallbackBase: KitId): WorldKit | null {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null) as Record<string, unknown> | null;
  if (!o) return null;
  const g = (o.gear && typeof o.gear === "object" ? o.gear : {}) as Record<string, unknown>;
  const wants = Array.isArray(o.wants) ? o.wants.map((w) => plain(w, 40)).filter(Boolean) : [];
  if (!plain(o.name, 40) || !plain(o.era, 120) || !plain(o.fears, 120) || !rungWhole(g.fight) || !rungWhole(g.travel) || !rungWhole(g.entry) || !wants.length) return null;
  // Every text field of the kit must be clean: a note left in anywhere throws the kit away.
  if (stringsIn([o.name, o.era, o.fears, o.gear, o.wants, o.hurts, o.risks]).some((s) => /[<>{}]/.test(s))) return null;
  const like = typeof o.like === "string" ? (KIT_IDS as readonly string[]).find((k) => k === o.like!.toString().trim().toLowerCase()) : undefined;
  return checkKit(o, (like as KitId | undefined) ?? fallbackBase, content);
}

/**
 * The world's kit for a card: written by a model and checked whole (asked twice at most), or, with no model or no answer
 * that checks, the stock kit `fallback` gives (the card's words).
 */
export async function writeKit(ask: Ask | null, world: string, content: ContentSettings, fallback: () => WorldKit, asks: KitAsks = {}): Promise<WorldKit> {
  if (!ask) return fallback();
  const until = Date.now() + KIT_MS;
  const base = kitFromWords(world);
  for (let tries = 0; tries < 2 && Date.now() < until - 3000; tries++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const slow = new Promise<string>((_, no) => (timer = setTimeout(() => no(new Error("slow")), Math.max(1000, until - Date.now()))));
      const kit = parseKit(firstJson(await Promise.race([ask(kitMessages(world, content, asks), "builder"), slow])), content, base);
      if (kit) return kit;
    } catch {
      // Too slow, or no answer: asked again below if there is time.
    } finally {
      clearTimeout(timer);
    }
  }
  return fallback();
}
