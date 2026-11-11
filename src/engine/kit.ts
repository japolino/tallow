/**
 * World kits (docs/MOONSHOT.md, 7): every world its own game.
 *
 * Every card gets a kit: a short record of how its world plays. A model writes it from the card, picking from fixed
 * lists, and code checks every field; a field that does not check falls back to the nearest stock kit. A card with no
 * model gets a stock kit, told apart by the card's own words.
 *
 * The same rules, the same die, the same gap in every world. Only what the dials mean, what the gear is, which verbs
 * the abilities lean on, what foes are hurt by and what being taken out means change. A world with its own kind of
 * power adds a seventh stat (Arcana, Tech, Faith, Psi, Allure); a world without one has none.
 *
 * Pure: facts in, a kit out.
 */
import type { Verb } from "./abilities.js";
import { allowedTakenOut, type ContentSettings } from "./content.js";
import type { Gear } from "./effect.js";
import type { CoreStat, Stat, Way } from "./moment.js";

export type KitId = "medieval" | "high-fantasy" | "modern" | "space" | "monster-romance";
export const KIT_IDS: readonly KitId[] = ["medieval", "high-fantasy", "modern", "space", "monster-romance"];

/** The seventh stat's names, from a fixed list. */
export type PowerName = "Arcana" | "Tech" | "Faith" | "Psi" | "Allure";
export const POWER_NAMES: readonly PowerName[] = ["Arcana", "Tech", "Faith", "Psi", "Allure"];

/** The dials you risk: which exist and what this world calls them. */
export type Dial = "health" | "shields" | "composure" | "nerve" | "reputation";
export const DIALS: readonly Dial[] = ["health", "shields", "composure", "nerve", "reputation"];

/** The back-and-forths a world has. */
export type ContestKind = "fight" | "duel" | "siege" | "spell-duel" | "firefight" | "dogfight" | "hack" | "seduction" | "chase" | "struggle" | "words";
export const CONTEST_KINDS: readonly ContestKind[] = ["fight", "duel", "siege", "spell-duel", "firefight", "dogfight", "hack", "seduction", "chase", "struggle", "words"];

/** What being taken out means. */
export type TakenOut = "wounded" | "captured" | "killed" | "claimed" | "shamed" | "exiled";
export const TAKEN_OUTS: readonly TakenOut[] = ["wounded", "captured", "killed", "claimed", "shamed", "exiled"];

export type Magic = "none" | "low" | "high";

/** What counts as nothing, plain and made-for-it in this world, for one use. */
export interface Rung {
  none: string;
  plain: string;
  made: string;
  /** Words for the rare best there is (+2, with a price), when the world has it. */
  best?: string;
}

/** One kind of back-and-forth: which stats attack and which defend. */
export interface KitContest {
  kind: ContestKind;
  attack: Stat[];
  defend: Stat[];
}

export interface WorldKit {
  id: KitId;
  /** A short name for this world's kit, for the first page. */
  name: string;
  magic: Magic;
  /** The era and its tools, in a few words. */
  era: string;
  /** What people fear here. */
  fears: string;
  /** The seventh stat, when the world has that kind of power. */
  power?: PowerName;
  /** The dials you risk, each with its name in this world. */
  risks: { dial: Dial; name: string }[];
  gear: { fight: Rung; travel: Rung; entry: Rung };
  contests: KitContest[];
  /** The verbs this world's abilities lean on. */
  verbs: Verb[];
  /** The kinds of thing foes here are weak to (effect.ts's tags). */
  hurts: string[];
  takenOut: TakenOut[];
  /** What threats here want. */
  wants: string[];
}

const ALL: Stat[] = ["brawn", "grace", "charm", "guile", "wits", "sense"];

export const STOCK_KITS: Record<KitId, WorldKit> = {
  medieval: {
    id: "medieval",
    name: "Swords and crossbows",
    magic: "none",
    era: "castles, villages and roads; steel, horses and candles",
    fears: "war, plague, the lord's men and the dark",
    risks: [{ dial: "health", name: "health" }],
    gear: {
      fight: { none: "bare hands", plain: "a knife, a club, leather", made: "a sword, a crossbow, mail", best: "plate and a master's blade" },
      travel: { none: "on foot with nothing", plain: "a pack and boots", made: "a good horse" },
      entry: { none: "nothing", plain: "a crowbar", made: "picks and a forged pass" },
    },
    contests: [
      { kind: "fight", attack: ["brawn", "grace"], defend: ["brawn", "grace"] },
      { kind: "duel", attack: ["grace"], defend: ["grace", "sense"] },
      { kind: "siege", attack: ["wits"], defend: ["brawn"] },
      { kind: "words", attack: ["charm", "guile"], defend: ["sense", "wits"] },
      { kind: "chase", attack: ["grace"], defend: ["grace"] },
    ],
    verbs: ["reach", "ward", "edge"],
    hurts: ["numbers", "height", "fire", "iron"],
    takenOut: ["wounded", "captured", "killed"],
    wants: ["your death", "your gold", "your silence"],
  },
  "high-fantasy": {
    id: "high-fantasy",
    name: "Fireballs and fancy swordplay",
    magic: "high",
    era: "kingdoms, towers and ruins; steel and spellcraft",
    fears: "liches, dragons, curses and the old dark",
    power: "Arcana",
    risks: [{ dial: "health", name: "health" }],
    gear: {
      fight: { none: "bare hands", plain: "a blade, a staff", made: "an enchanted blade, a focus", best: "a relic of the old wars" },
      travel: { none: "on foot", plain: "a horse", made: "a griffon, a portal scroll" },
      entry: { none: "nothing", plain: "picks", made: "a key of unlocking" },
    },
    contests: [
      { kind: "fight", attack: ["brawn", "grace", "power"], defend: ["brawn", "grace"] },
      { kind: "spell-duel", attack: ["power"], defend: ["power", "wits"] },
      { kind: "words", attack: ["charm", "guile"], defend: ["sense", "wits"] },
      { kind: "chase", attack: ["grace"], defend: ["grace"] },
    ],
    verbs: ["sweep", "bind", "edge"],
    hurts: ["fire", "holy", "silver", "name", "light"],
    takenOut: ["wounded", "captured", "killed"],
    wants: ["your death", "your soul", "the relic you carry"],
  },
  modern: {
    id: "modern",
    name: "Streets and secrets",
    magic: "none",
    era: "cities, phones and cars",
    fears: "the police, the gang, being found out",
    risks: [{ dial: "health", name: "health" }, { dial: "reputation", name: "reputation" }],
    gear: {
      fight: { none: "bare hands", plain: "a bat, a knife", made: "a pistol, body armour" },
      travel: { none: "on foot", plain: "a bus pass", made: "a fast car" },
      entry: { none: "nothing", plain: "a crowbar", made: "a keycard, a laptop" },
    },
    contests: [
      { kind: "fight", attack: ["brawn", "grace"], defend: ["brawn", "grace"] },
      { kind: "chase", attack: ["grace"], defend: ["grace", "wits"] },
      { kind: "words", attack: ["charm", "guile"], defend: ["sense", "wits"] },
      { kind: "hack", attack: ["wits"], defend: ["wits"] },
    ],
    verbs: ["reach", "ward", "edge"],
    hurts: ["numbers", "height", "noise", "light"],
    takenOut: ["wounded", "captured", "killed", "shamed"],
    wants: ["your silence", "your money", "you gone"],
  },
  space: {
    id: "space",
    name: "Lasers and blades of light",
    magic: "low",
    era: "ships, stations and strange worlds",
    fears: "the void, the empire, machines that think",
    power: "Tech",
    risks: [{ dial: "health", name: "health" }, { dial: "shields", name: "shields" }],
    gear: {
      fight: { none: "bare hands", plain: "a blaster", made: "a rifle, an energy blade", best: "a mech" },
      travel: { none: "on foot", plain: "a shuttle", made: "a fast ship" },
      entry: { none: "nothing", plain: "a cutter", made: "a slicer rig" },
    },
    contests: [
      { kind: "firefight", attack: ["grace", "power"], defend: ["grace", "sense"] },
      { kind: "dogfight", attack: ["grace", "power"], defend: ["grace"] },
      { kind: "hack", attack: ["power", "wits"], defend: ["power"] },
      { kind: "words", attack: ["charm", "guile"], defend: ["sense", "wits"] },
    ],
    verbs: ["reach", "sweep", "ward"],
    hurts: ["ion", "noise", "numbers", "height"],
    takenOut: ["wounded", "captured", "killed"],
    wants: ["your death", "your ship", "the data you carry"],
  },
  "monster-romance": {
    id: "monster-romance",
    name: "A seduction is a fight",
    magic: "high",
    era: "a world of monster girls and the men who wander into it",
    fears: "being claimed, losing yourself, the old ones of each kind",
    power: "Allure",
    risks: [{ dial: "composure", name: "composure" }],
    gear: {
      fight: { none: "nothing to your name", plain: "a charm, a clean shirt", made: "an enchanted ring, a holy relic" },
      travel: { none: "on foot", plain: "a cart", made: "a guide who knows the woods" },
      entry: { none: "nothing", plain: "a gift", made: "an invitation" },
    },
    contests: [
      { kind: "seduction", attack: ["charm", "power"], defend: ["sense", "power"] },
      { kind: "chase", attack: ["grace"], defend: ["grace"] },
      { kind: "struggle", attack: ["brawn"], defend: ["brawn", "grace"] },
      { kind: "words", attack: ["charm", "guile"], defend: ["sense", "wits"] },
    ],
    verbs: ["drain", "bind", "sway"],
    hurts: ["praise", "holy", "name", "light"],
    takenOut: ["claimed", "captured", "shamed"],
    wants: ["you", "your seed", "your heart"],
  },
};

/** Words that tell a stock kit from a card, when there is no model. */
const KIT_WORDS: Record<KitId, RegExp> = {
  "monster-romance": /\b(monster girl|monster girls|monstergirl|mamono|lamia|harpy|succubus|slime girl|arachne|kobold|centaur girl|mge)\b/i,
  space: /\b(starship|spaceship|space station|galaxy|galactic|planet|laser|blaster|lightsaber|android|cyborg|hyperspace|sci-?fi|spacer|mech)\b/i,
  "high-fantasy": /\b(wizard|mage|sorcer\w*|spell|spells|dragon|elf|elves|dwarf|orc|lich|necromanc\w*|enchant\w*|arcane|magic|paladin|cleric)\b/i,
  modern: /\b(phone|car|cars|city|police|cop|gang|office|college|university|apartment|internet|laptop|gun|pistol|modern)\b/i,
  medieval: /\b(knight|castle|lord|peasant|village|sword|crossbow|king|queen|tavern|inn|squire|monastery)\b/i,
};

/** The stock kit whose words come up most in a card's text; medieval when none do. Romance beats fantasy, space beats both. */
export function kitFromWords(text: string): KitId {
  let best: KitId = "medieval", score = 0;
  for (const id of ["monster-romance", "space", "high-fantasy", "modern", "medieval"] as KitId[]) {
    const n = (text.match(new RegExp(KIT_WORDS[id].source, "gi")) ?? []).length * (id === "monster-romance" ? 3 : id === "space" ? 1.5 : 1);
    if (n > score) (best = id), (score = n);
  }
  return best;
}

/** Words of Hell and its kind: a card set among devils is not a fantasy of kingdoms and towers. */
const INFERNAL = /\b(hell|hells|infernal|inferno|demons?|demonic|devils?|diabolic\w*|damned|damnation|brimstone|abyss\w*|hellfire|hellish|fallen angels?|archdevils?|archdemons?|imps?|pacts?|souls?|underworld|lucifer|satan\w*|beelzebub|asmodeus|mephisto\w*|circles? of hell)\b/gi;

/**
 * Whether a card is set in Hell or among devils: two or more of Hell's words, said more than the words of a plain
 * fantasy or an old world. A card that only mentions a demon or a soul once is not.
 */
export function infernalWords(text: string): boolean {
  const hits = text.match(INFERNAL) ?? [];
  const kinds = new Set(hits.map((w) => w.toLowerCase().replace(/s$/, ""))).size;
  const count = (id: KitId) => (text.match(new RegExp(KIT_WORDS[id].source, "gi")) ?? []).length;
  return kinds >= 2 && hits.length * 1.5 > Math.max(count("high-fantasy"), count("medieval"));
}

/** What Hell changes in an old world's kit: the era, its fears, what hurts its foes, what they want. Checked like a model's kit. */
export const INFERNAL_KIT = {
  name: "Brimstone and broken pacts",
  magic: "high",
  era: "the pits, courts and burning roads of Hell; chains, brimstone and pacts",
  fears: "devils, damnation, a broken pact, a name given away",
  power: "Faith",
  hurts: ["holy", "salt", "iron", "true name", "light"],
  wants: ["your soul", "your name", "a pact signed"],
} as const;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const pickList = <T extends string>(v: unknown, list: readonly T[], max = 6): T[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => (typeof x === "string" ? x.trim().toLowerCase() : "")).filter((x): x is T => (list as readonly string[]).includes(x)))].slice(0, max) : [];
const STATS_OK: readonly Stat[] = [...ALL, "power"];

/**
 * A kit from a model's answer, every field checked; a field that does not check is the stock kit's. Content settings
 * hold what being taken out can mean (no "claimed" without heat or dark themes).
 */
export function checkKit(raw: unknown, base: KitId, content: ContentSettings): WorldKit {
  const stock = STOCK_KITS[base];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const magic = (["none", "low", "high"] as const).find((m) => m === o.magic) ?? stock.magic;
  // A seventh stat only where the world has that kind of power; none where magic is none, unless it is a world of machines.
  const named = POWER_NAMES.find((p) => typeof o.power === "string" && p.toLowerCase() === o.power.trim().toLowerCase());
  const power = o.power === null || o.power === "none" ? undefined : named ?? stock.power;
  const risks = Array.isArray(o.risks)
    ? (o.risks as unknown[])
        .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : {}))
        .filter((r) => DIALS.includes(r.dial as Dial))
        .map((r) => ({ dial: r.dial as Dial, name: str(r.name, 20) || (r.dial as string) }))
        .slice(0, 2)
    : [];
  const rung = (v: unknown, fb: Rung): Rung => {
    const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const best = str(r.best, 60);
    return { none: str(r.none, 60) || fb.none, plain: str(r.plain, 60) || fb.plain, made: str(r.made, 60) || fb.made, ...(best ? { best } : fb.best ? { best: fb.best } : {}) };
  };
  const g = (o.gear && typeof o.gear === "object" ? o.gear : {}) as Record<string, unknown>;
  const contests = Array.isArray(o.contests)
    ? (o.contests as unknown[])
        .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : {}))
        .filter((c) => CONTEST_KINDS.includes(c.kind as ContestKind))
        .map((c) => ({ kind: c.kind as ContestKind, attack: pickList(c.attack, STATS_OK, 3), defend: pickList(c.defend, STATS_OK, 3) }))
        .filter((c) => c.attack.length && c.defend.length)
        .map((c) => (power ? c : { ...c, attack: c.attack.filter((s) => s !== "power"), defend: c.defend.filter((s) => s !== "power") }))
        .filter((c) => c.attack.length && c.defend.length)
        .slice(0, 5)
    : [];
  const verbs = pickList<Verb>(o.verbs, ["reach", "bind", "sweep", "drain", "ward", "edge", "sway", "ease", "aid", "slip"], 4);
  const hurts = Array.isArray(o.hurts) ? [...new Set((o.hurts as unknown[]).map((h) => str(h, 16).toLowerCase()).filter((h) => /^[a-z ]{2,16}$/.test(h)))].slice(0, 6) : [];
  const takenOut = allowedTakenOut(pickList(o.takenOut ?? o.taken_out, TAKEN_OUTS), content);
  const wants = Array.isArray(o.wants) ? (o.wants as unknown[]).map((w) => str(w, 40)).filter(Boolean).slice(0, 4) : [];
  return {
    id: base,
    name: str(o.name, 40) || stock.name,
    magic,
    era: str(o.era, 120) || stock.era,
    fears: str(o.fears, 120) || stock.fears,
    ...(power ? { power } : {}),
    risks: risks.length ? risks : stock.risks,
    gear: { fight: rung(g.fight, stock.gear.fight), travel: rung(g.travel, stock.gear.travel), entry: rung(g.entry, stock.gear.entry) },
    contests: contests.length ? contests : stock.contests.filter((c) => power || !c.attack.includes("power")),
    verbs: verbs.length ? verbs : stock.verbs,
    hurts: hurts.length ? hurts : stock.hurts,
    takenOut: takenOut.length ? takenOut : allowedTakenOut(stock.takenOut, content).length ? allowedTakenOut(stock.takenOut, content) : ["wounded", "captured"],
    wants: wants.length ? wants : stock.wants,
  };
}

/** A stock kit as content settings allow it. */
export const stockKit = (id: KitId, content: ContentSettings): WorldKit => checkKit({}, id, content);

/**
 * Gear on the ladder (docs/MOONSHOT.md, 7.4): whatever the words say, gear is −1, 0 or +1. A +2 needs a price paid
 * (it is rare, it runs out, it draws attention). "My laser cannon does infinite damage" plays as +1.
 */
export function gearOf(kit: WorldKit, use: keyof WorldKit["gear"], item: string, pricePaid = false): Gear {
  const r = kit.gear[use];
  const l = item.toLowerCase();
  const has = (words: string): boolean => words.toLowerCase().split(/,\s*|\s+and\s+|\s+or\s+/).some((w) => w.trim().length > 2 && l.includes(w.trim().replace(/^(a|an|the)\s+/, "")));
  if (r.best && has(r.best)) return pricePaid ? 2 : 1;
  if (has(r.made)) return 1;
  if (has(r.plain)) return 0;
  if (has(r.none) || !item.trim()) return -1;
  return 0;
}

/** The kit in a few lines, for the first page. */
export function kitLines(kit: WorldKit): string[] {
  const risk = kit.risks.map((r) => r.name).join(" and ");
  const lines = [`This world: ${kit.era}. People here fear ${kit.fears}.`];
  lines.push(kit.power ? `Here some have a seventh strength: ${kit.power}.` : "Nobody here has any power but their own hands and wits: gear counts for more.");
  lines.push(`What you risk is your ${risk}. ${kit.contests.some((c) => c.kind === "seduction") ? "A fight here is won by breaking their composure, not their bones." : ""}`.trim());
  return lines;
}

/** The stat a world's power is, if it has one, as a sheet's name for it. */
export const powerOf = (kit: WorldKit): string | undefined => kit.power;

/** Which stats attack in a contest of this kind, in this world: the kit's own, or the usual for a fight. */
export function attackStats(kit: WorldKit, kind: ContestKind): Stat[] {
  return kit.contests.find((c) => c.kind === kind)?.attack ?? (["brawn"] as CoreStat[]);
}

/**
 * Your gear, read from what you carry (docs/MOONSHOT.md, 7.4): for each way, the best rung anything you carry reaches
 * in this world's ladder (fighting for force, getting in for sneaking). Nothing that the ladder knows: plain, as before.
 * A +2 needs a price paid, so what you carry is at most +1.
 */
export function gearFrom(kit: WorldKit, items: readonly string[]): Partial<Record<Way, Gear>> {
  const out: Partial<Record<Way, Gear>> = {};
  const uses: [Way, keyof WorldKit["gear"]][] = [["force", "fight"], ["sneak", "entry"]];
  for (const [way, use] of uses) {
    const r = kit.gear[use];
    const known = items.filter((i) => i.trim()).map((i) => ({ i, g: gearOf(kit, use, i) })).filter((x) => x.g !== 0 || ladderKnows(r, x.i));
    if (known.length) out[way] = known.reduce((a, b) => (b.g > a ? b.g : a), -1 as Gear);
  }
  return out;
}
/** Whether an item is on a rung of the ladder at all (so a plain one counts as plain, not as unknown). */
function ladderKnows(r: Rung, item: string): boolean {
  const l = item.toLowerCase();
  return [r.plain, r.made, r.best ?? ""].join(", ").toLowerCase().split(/,\s*|\s+and\s+|\s+or\s+/).some((w) => {
    const word = w.trim().replace(/^(a|an|the)\s+/, "");
    return word.length > 2 && l.includes(word);
  });
}

/** The kind of back-and-forth a fight is in this world: the first of its fighting kinds it has (a seduction, a firefight, a duel of spells), or a plain fight. */
export function fightKind(kit: WorldKit): KitContest {
  const order: ContestKind[] = ["seduction", "firefight", "spell-duel", "duel", "fight"];
  for (const k of order) {
    const c = kit.contests.find((x) => x.kind === k);
    if (c) return c;
  }
  return { kind: "fight", attack: ["brawn", "grace"], defend: ["brawn", "wits"] };
}

/** What a fight here is called, and what you risk in it, in this world's own words. */
export const FIGHT_SAID: Record<ContestKind, string> = {
  fight: "a fight",
  duel: "a duel",
  siege: "a siege",
  "spell-duel": "a duel of spells",
  firefight: "a firefight",
  dogfight: "a dogfight",
  hack: "a break-in",
  seduction: "a seduction",
  chase: "a chase",
  struggle: "a struggle",
  words: "a war of words",
};

/**
 * A fight in this world's currency (7.2): the stats a fight is won with here (charm and allure in a seduction, grace and
 * tech in a firefight), and what your dial is called (your composure, your shields). The same gap, the same die.
 */
export function kitFight(kit: WorldKit, hasPower: boolean): { kind: ContestKind; attack: Stat[]; dial: string; said: string } {
  const c = fightKind(kit);
  const attack = c.attack.filter((s) => s !== "power" || hasPower);
  const risk = kit.risks.find((r) => r.dial !== "reputation") ?? kit.risks[0];
  return { kind: c.kind, attack: attack.length ? attack : ["brawn"], dial: `your ${risk?.name ?? "health"}`, said: FIGHT_SAID[c.kind] };
}
