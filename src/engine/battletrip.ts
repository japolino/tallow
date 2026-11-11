/**
 * A fight stop on the battle mat (docs/COMBAT.md, 8): the board opened from the trip (the place, your side, the foes
 * the stop and the world give), and the end of it mapped back onto the trip as a try's end is (won, taken, fled or
 * given in; red stones lost; the store spent; hours; the reward). Pure.
 */
import { arenaFor, arenaNames, buildArena, type ArenaId } from "./arena.js";
import { storeAt, type Ability } from "./abilities.js";
import { companionOf, copySheet, overClock, TAKEN_HOURS, withParty, YIELD_HOURS, FALL_HOURS, type Reward, type RoadStop, type Trip } from "./adventure.js";
import { startBattle, type Battle, type BattleAbility, type BattleEvent, type Piece } from "./battle.js";
import { DEFAULT_CONTENT, type ContentSettings } from "./content.js";
import { encounter, foesFor, type FoeSpec, type Side } from "./encounter.js";
import { FOE_KINDS, type FoeKind } from "./foekinds.js";
import { LEVEL_EVERY } from "./hero.js";
import type { WorldKit } from "./kit.js";
import { GOODWILL_MAX, STATS, type Stat, type Stats } from "./moment.js";

/** How a companion fights when nobody tells it what to do (docs/COMBAT.md, 6.1). The same words as a player's style. */
export type FightStyle = "brawler" | "planner" | "talker" | "joker" | "treasure";

/** A battle in your way, with what the director needs to play it on. Kept with the trip, so a sitting can be left mid-fight. */
export interface BattleSeat {
  battle: Battle;
  /** Your piece's id. */
  hero: string;
  arena: ArenaId;
  /** Companions' styles, by piece id. */
  styles: Record<string, FightStyle>;
  /** Your abilities, as the board plays them. */
  abilities: BattleAbility[];
  /** The foe you went for last, for "again". */
  last?: string;
  /** The rounds said so far, for the hours it took. */
  said?: number;
}

export const HERO_ID = "you";
/** What a companion counts for in the foes' threat budget, against the hero's 1. */
export const COMPANION_WEIGHT = 0.5;

/** A stop is fought on the mat when it is a fight. */
export const onTheMat = (stop: Pick<RoadStop, "kind">): boolean => stop.kind === "fight";

/**
 * How hard the fight is, 0 to 3. A story try weighs your strength in one throw; a fight is a dozen throws, so the same
 * number runs much harder on the mat (the sim: a very hard fight is lost a third of the time even reading the board).
 * A fight is one step under the place's own difficulty, and the trouble you are in; only the last place keeps the full step.
 */
export function fightDifficulty(t: Trip): number {
  const f = t.facing!;
  const base = f.stop.ways.force?.difficulty ?? f.stop.ways.sneak?.difficulty ?? 2;
  return Math.max(0, Math.min(3, base - (f.stop.climax ? 0 : 1) + (f.moment.trouble ?? 0)));
}

const GATED_WORDS = /\b(seduc\w*|charm\w*|succub\w*|incub\w*|siren|lamia|nymph|tempt\w*|allur\w*|kiss\w*|web\w*|snare\w*|coil\w*|tentacle\w*|vine\w*|slime\w*|net\w*|captur\w*|abduct\w*|kidnap\w*|slaver\w*|bind\w*|monster girl\w*)\b/i;

const BEASTS: readonly FoeKind[] = ["swarm", "pack", "flock"];
const BEAST_WORDS = /\b(beasts?|wol(f|ves)|hounds?|dogs?|rats?|swarms?|insects?|spiders?|crows?|ravens?|bats?|birds?|harp(y|ies)|wyverns?|jackals?|boars?|bears?|creatures?|monsters?|broods?|wolfpack|drones?|bugs?|vermin|snakes?|serpents?|ghouls?|wargs?)\b/i;

/** The kinds the world and the place give, gated by the content settings (docs/COMBAT.md, 11.5). */
export function poolFor(kit: WorldKit | undefined, content: ContentSettings, words: string): FoeKind[] {
  const byKit: Record<string, FoeKind[]> = {
    medieval: ["brute", "shooter", "swarm", "skirmisher", "guardian", "leader", "pack", "lurker"],
    "high-fantasy": ["brute", "shooter", "swarm", "skirmisher", "caster", "guardian", "leader", "pack", "lurker", "flock"],
    modern: ["brute", "shooter", "skirmisher", "leader", "lurker", "pack"],
    space: ["brute", "shooter", "skirmisher", "guardian", "leader", "swarm", "flock"],
    "monster-romance": ["charmer", "ensnarer", "captor", "pack", "swarm", "lurker", "flock", "brute"],
  };
  const base = byKit[kit?.id ?? "medieval"] ?? byKit.medieval!;
  const hinted = GATED_WORDS.test(words) ? (["charmer", "ensnarer", "captor"] as FoeKind[]) : [];
  // Beasts only where the place speaks of them; people elsewhere.
  const beasts = BEAST_WORDS.test(words);
  const all = [...new Set([...base, ...hinted])].filter((k) => beasts || !BEASTS.includes(k) || base.every((x) => BEASTS.includes(x)));
  return all.filter((k) => {
    const gate = FOE_KINDS[k].gate;
    if (gate === "charm") return content.heat || content.dark;
    if (gate === "restraint") return content.dark || content.heat;
    return true;
  });
}

const flat = (n: number): Stats => Object.fromEntries(STATS.map((s) => [s, n])) as Stats;

/** A companion who has only the one thing they are good at: middling at the rest. */
function companionStats(stat: Stat): Stats {
  const s = flat(1);
  if (stat === "power") s.charm = 3;
  else s[stat] = 3;
  return s;
}

/** The stat a companion leans on, for its style. */
const styleBy = (stat: Stat | undefined): FightStyle => (stat === "wits" || stat === "sense" ? "planner" : stat === "charm" || stat === "power" ? "talker" : stat === "guile" ? "joker" : "brawler");

const ALLURE = /allure|glamou?r|thrall|desire|lust|charm|beguil|enchant/i;

/** An ability as the board plays it: once a fight unless it costs the store or always works. */
export const battleAbility = (a: Ability): BattleAbility => ({ id: a.id, name: a.name, does: a.does, much: a.much, tags: a.tags, store: a.store, often: a.often });

/** What a fight is going to be, before the names: the place, the foes as specs, how hard. */
export interface BattlePlan {
  seed: string;
  arena: ArenaId;
  difficulty: number;
  foes: FoeSpec[];
  side: Side[];
  styles: Record<string, FightStyle>;
}

/** The fight the stop in your way would be. */
export function planBattle(t: Trip): BattlePlan {
  const f = t.facing!;
  const stop = f.stop;
  const seed = `${t.seed}:${stop.id}:battle`;
  const words = `${stop.name} ${stop.situation} ${stop.foe?.name ?? ""}`;
  const arena = arenaFor(words, seed);
  const difficulty = fightDifficulty(t);
  const content = t.adv.content ?? DEFAULT_CONTENT;
  const fight = t.adv.kit?.contests.find((c) => c.kind === "fight");
  const own = t.sheet.stats;
  const defend = fight?.defend.length ? fight.defend.reduce((a, b) => ((own[b] ?? -9) > (own[a] ?? -9) ? b : a)) : undefined;
  const allure = !!t.sheet.powerName && ALLURE.test(t.sheet.powerName);
  const side: Side[] = [{ id: HERO_ID, name: "you", stats: own, hero: true, level: t.level, ...(defend && defend !== "grace" ? { defend } : {}), ...(allure ? { poiseBy: "power" as Stat } : {}), weapon: weaponFor(own) }];
  const styles: Record<string, FightStyle> = {};
  for (const id of withParty(t)) {
    const c = companionOf(t.adv, id);
    if (!c) continue;
    side.push({ id: c.id, name: c.name, stats: companionStats(c.stat), level: t.level, weapon: weaponFor(companionStats(c.stat)) });
    styles[c.id] = styleBy(c.stat);
  }
  for (const fl of (t.fellows ?? []).filter((x) => !x.at && !side.some((s) => s.id === x.id))) {
    side.push({ id: fl.id, name: fl.name, stats: fl.stats, level: t.level, weapon: weaponFor(fl.stats) });
    styles[fl.id] = fl.style;
  }
  const pool = poolFor(t.adv.kit, content, words);
  // A companion is good at one thing and middling at the rest: half a fighter to the budget, so a friend at your side
  // doesn't bring a third brigand down on you.
  const foes = foesFor(seed, difficulty, 1 + (side.length - 1) * COMPANION_WEIGHT, pool, !!stop.climax);
  // The one the stop names stands at the head of them.
  if (stop.foe?.name && foes.length) {
    const head = foes.reduce((a, b) => (rankOrder(b.rank) > rankOrder(a.rank) ? b : a));
    head.name = stop.foe.name;
  }
  return { seed, arena, difficulty, foes, side, styles };
}

const rankOrder = (r: string): number => ["minion", "soldier", "elite", "boss"].indexOf(r);

/** A weapon from what a piece is best at: grace and wits shoot, brawn swings heavy, the rest carry a blade. */
function weaponFor(s: Stats): Side["weapon"] {
  const top = (["brawn", "grace", "wits", "guile", "charm", "sense"] as const).reduce((a, b) => ((s[b] ?? 0) > (s[a] ?? 0) ? b : a));
  return top === "brawn" ? "heavy" : top === "wits" ? "ranged" : top === "guile" ? "light" : "blade";
}

/** What a model is asked to name for a plan: the foes by f1, f2…, and the things on the mat by their keys. */
export function namesWanted(p: BattlePlan): { foes: { id: string; kind: string; rank: string; says: string }[]; props: { key: string; template: string; name: string }[] } {
  return {
    foes: p.foes.map((f, i) => ({ id: `f${i + 1}`, kind: f.kind, rank: f.rank, says: FOE_KINDS[f.kind].says })),
    props: arenaNames(p.arena),
  };
}

/** The battle opened from a plan, with the names a model gave if any. Their first move is shown at once. */
export function openBattle(t: Trip, p: BattlePlan, names: { foes?: Record<string, string>; props?: Record<string, string> } = {}): { trip: Trip; events: BattleEvent[] } {
  const f = t.facing!;
  const arena = buildArena(p.arena, p.seed, names.props ?? {});
  const foes = p.foes.map((x, i) => (names.foes?.[`f${i + 1}`] && !x.name ? { ...x, name: names.foes[`f${i + 1}`] } : x));
  const content = t.adv.content ?? DEFAULT_CONTENT;
  const spec = encounter({
    seed: p.seed,
    difficulty: p.difficulty,
    side: p.side,
    mat: arena.mat,
    foes,
    props: arena.props,
    zones: arena.zones,
    ground: arena.ground,
    store: t.sheet.store ?? storeAt(t.level),
    ...(f.stop.climax ? { parley: false } : {}),
  });
  // A foe that would claim or carry off: with dark themes off it only beats you, as any foe does.
  if (!content.dark) for (const x of spec.pieces) if (x.side === "them" && x.kind === "captor") x.kind = "brute";
  const { battle, events } = startBattle(spec);
  const seat: BattleSeat = { battle, hero: HERO_ID, arena: p.arena, styles: p.styles, abilities: t.abilities.filter((a) => !t.storyUsed.includes(a.id)).map(battleAbility) };
  return { trip: { ...t, facing: { ...f, battle: seat } }, events };
}

/** What the end of a battle came to for the trip, as a try's end does. */
export interface BattleEnd {
  trip: Trip;
  cleared: boolean;
  /** Taken out: hours and supplies lost at an ordinary place, or "end" at the last one. */
  taken: { hours: number; supplies: number } | "end" | null;
  /** Given in or ran: out of it whole, with nothing. */
  gaveIn: boolean;
  reward: Reward | null;
  levelUp: boolean;
  /** Red stones lost. */
  wounds: number;
  /** Fell to the last red stone: you came to later. */
  fell: number;
}

/** Hours a fight takes: a quarter of an hour, and a little more for each round. */
export const fightHours = (rounds: number): number => Math.round((0.25 + 0.1 * rounds) * 4) / 4;

/** The trip after a battle that is over. Null while it is still on. */
export function battleEnd(t0: Trip): BattleEnd | null {
  const f = t0.facing;
  const seat = f?.battle;
  if (!f || !seat?.battle.over) return null;
  const b = seat.battle;
  const sheet = copySheet(t0.sheet);
  sheet.health -= b.wounds;
  sheet.hour += fightHours(b.round);
  if (b.store !== undefined) sheet.store = b.store;
  let fell = 0;
  if (sheet.health <= 0) {
    fell = FALL_HOURS;
    sheet.health = 1;
    sheet.hour += FALL_HOURS;
  }
  let trip: Trip = { ...t0, sheet, facing: null };
  const storyOnce = (b.used ?? []).filter((id) => t0.abilities.find((a) => a.id === id)?.often === "story");
  if (storyOnce.length) trip.storyUsed = [...new Set([...t0.storyUsed, ...storyOnce])];
  const stop = f.stop;
  const deed = `fought at ${stop.name}`;
  let cleared = false, taken: BattleEnd["taken"] = null, gaveIn = false, reward: Reward | null = null;
  if (b.over === "won" || b.over === "parley") {
    cleared = true;
    trip.at = stop.id;
    trip.passed = t0.passed + 1;
    trip.deeds = [...t0.deeds, `${b.over === "parley" ? "talked them down" : "won the fight"} at ${stop.name}`].slice(-8);
    reward = stop.reward ?? null;
    if (reward?.loot && !trip.kept.includes(reward.loot)) trip.kept = [...trip.kept, reward.loot];
    if (reward?.joins && !trip.party.includes(reward.joins)) trip.party = [...trip.party, reward.joins];
    // Companions who like a fight won by force say so.
    for (const id of withParty(t0)) {
      const c = companionOf(t0.adv, id);
      if (!c) continue;
      const way = b.over === "parley" ? "talk" : "force";
      const liked = way === c.likes ? 1 : way === c.dislikes ? -1 : 0;
      sheet.goodwill = Math.max(0, Math.min(GOODWILL_MAX, sheet.goodwill + liked));
    }
    if (stop.climax) trip.over = "won";
  } else if (b.over === "taken") {
    if (stop.climax) {
      trip.over = "taken";
      taken = "end";
    } else {
      const supplies = Math.min(1, sheet.supplies);
      const hours = fell ? 0 : TAKEN_HOURS;
      sheet.supplies -= supplies;
      sheet.hour += hours;
      taken = { hours: hours + fell, supplies };
      trip.at = stop.id;
      trip.warned = 1;
    }
  } else {
    gaveIn = true;
    if (stop.climax) trip.over = "yielded";
    else {
      sheet.hour += YIELD_HOURS;
      trip.at = stop.id;
    }
    trip.deeds = [...t0.deeds, deed].slice(-8);
  }
  trip.sheet = sheet;
  if (trip.over !== "won") trip = overClock(trip);
  const levelUp = cleared && !trip.over && trip.passed % LEVEL_EVERY === 0;
  return { trip, cleared, taken, gaveIn, reward, levelUp, wounds: b.wounds, fell };
}

/** The battle in your way, put back on the trip after a turn of it. */
export function withBattle(t: Trip, battle: Battle, last?: string): Trip {
  const f = t.facing;
  if (!f?.battle) return t;
  return { ...t, facing: { ...f, battle: { ...f.battle, battle, ...(last ? { last } : {}) } } };
}

/** Your piece, as it stands. */
export const heroPiece = (s: BattleSeat): Piece | undefined => s.battle.pieces.find((p) => p.id === s.hero);
