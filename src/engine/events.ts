/**
 * What the world does unasked (the rules, with no model in them): which kinds of event may be offered to the storyteller
 * and how often, how a long run of doing nothing is counted, how a cutting-in is rolled, and what a set of quick choices
 * has to look like to be kept.
 *
 * Pure and seeded: every chance is a draw from the run's own dice (engine/run.ts, draw), so a run replays the same.
 * The numbers are the game's own: an event is likelier on arriving somewhere than on going on, likelier on going on than
 * on a plain action, never in a fight, and never again until a few turns have gone by.
 */
import { draw, MAX_HP, person, same, stateOf, type Run } from "./run.js";

/* ------------------------------------------------- the numbers ------------------------------------------------- */

/** The chance that something is offered, by what the turn is. */
export const CHANCE = { arrival: 0.6, going: 0.4, action: 0.2, fight: 0.2 } as const;
/** Turns after something is offered (or cuts in) before anything is offered again. */
export const COOLDOWN = 3;
/** How many kinds of event are put to the storyteller at once. */
export const LISTED = 2;
/** At or below this much health a character is nearly down: no hazard is offered, and nothing unwelcome cuts in. */
export const NEARLY_DOWN = 25;
/** Lines in a row that only go on before things begin to go against a character who stays passive. */
export const PASSIVE_FREE = 2;
/** How likely a cutting-in is when the reader named none, and the least and most it may be. */
export const CUT_IN = { otherwise: 0.3, least: 0.1, most: 0.6 } as const;
/** The turns of history there must be before something done earlier can catch up. */
export const HISTORY = 3;
/** Rolls that went badly in a row before the player seems stuck. */
export const STUCK_AFTER = 2;

/* ------------------------------------------------- what is kept ------------------------------------------------- */

export interface EventsState {
  /** Turns still to go before anything may be offered. */
  cooldown: number;
  /** Kinds not yet offered in this round; when it is empty it is filled again (so a kind does not come round twice early). */
  bag: string[];
  /** The kinds offered last time. */
  last: string[];
  /** Lines in a row, up to the last turn, that only said to wait or go on. */
  quiet: number;
  /** The character came to a new place last turn, and what is fitting on arriving has not been offered yet. */
  arrived: boolean;
  /** The turn something cut in on (so nothing else is offered then). */
  cutIn: number;
  /** Turns in a row the roll went badly. */
  bad: number;
  lastLine: string;
  /** The quick choices, and the turn they were made for. */
  choices: string[];
  choicesTurn: number;
}

const fresh = (): EventsState => ({ cooldown: 0, bag: [], last: [], quiet: 0, arrived: false, cutIn: -1, bad: 0, lastLine: "", choices: [], choicesTurn: -1 });

/** The state of this system in a run, made on first use; a run kept before a field existed gets that field's default. */
export function eventsOf(r: Run): EventsState {
  const st = stateOf<Partial<EventsState>>(r, "events", fresh);
  const f = fresh();
  for (const k of Object.keys(f) as (keyof EventsState)[]) if (st[k] === undefined || typeof st[k] !== typeof f[k]) (st as Record<string, unknown>)[k] = f[k];
  if (!Array.isArray(st.bag) || !Array.isArray(st.last) || !Array.isArray(st.choices)) Object.assign(st, { bag: [], last: [], choices: [] });
  return st as EventsState;
}

/* ------------------------------------------------- what the run shows ------------------------------------------------- */

/** Anyone hostile, here and still able to fight. */
export const inFight = (r: Run): boolean => r.people.some((p) => p.here && p.hostile && !p.dead && p.hp > 0);
export const nearlyDown = (r: Run): boolean => r.sheet.hp <= Math.min(NEARLY_DOWN, MAX_HP);
/** The people who travel with the character and are here. */
export const followersOf = (r: Run): string[] => r.people.filter((p) => p.follows && p.here && !p.dead).map((p) => p.name);

const OPEN = new Set(["open", "active", "ongoing", "current", "underway"]);
/**
 * An open quest, if the quests system's state plainly shows one: a name for it, or an empty string when one is open but
 * unnamed. Null when none is plainly open. Read defensively and never written to: it is another system's.
 */
export function openQuest(r: Run): string | null {
  try {
    const q = r.sys?.quests as unknown;
    if (!q || typeof q !== "object") return null;
    const o = q as Record<string, unknown>;
    const lists = Array.isArray(q) ? [q] : [o.quests, o.list, o.active, o.open, o.items].filter(Array.isArray);
    for (const l of lists) {
      for (const e of l as unknown[]) {
        if (!e || typeof e !== "object") continue;
        const x = e as Record<string, unknown>;
        const state = String(x.status ?? x.state ?? "").toLowerCase();
        if (OPEN.has(state) || x.open === true || x.done === false) {
          const n = [x.title, x.name, x.goal].find((v) => typeof v === "string" && v.trim());
          return typeof n === "string" ? n.replace(/\s+/g, " ").trim().slice(0, 80) : "";
        }
      }
    }
  } catch { /* another system's state that cannot be read shows no quest */ }
  return null;
}

/* ------------------------------------------------- the kinds of event ------------------------------------------------- */

export type Trigger = "arrival" | "going" | "action";

export interface Context {
  followers: string[];
  quest: string | null;
}

export interface Kind {
  key: string;
  /** What may happen, as the storyteller is told it. */
  text: (c: Context, pick: (n: number) => number) => string;
  /** When it may be offered. */
  on: readonly Trigger[];
  /** Only with at least this many companions. */
  followers?: number;
  /** Only with a quest open. */
  quest?: boolean;
  /** Only in a fight (and then nothing else is). */
  fight?: boolean;
  /** Never to a character who is nearly down. */
  hazard?: boolean;
  /** Only when there is something earlier for it to come from. */
  history?: boolean;
}

const ANY: readonly Trigger[] = ["arrival", "going", "action"];
const named = (n: string): string => n || "the one they are after";

export const KINDS: readonly Kind[] = [
  { key: "approach", on: ANY, text: () => "Someone comes up to the character with a request, an offer, a warning or an accusation." },
  { key: "discovery", on: ANY, text: () => "The character comes upon something interesting that they were not looking for." },
  { key: "news", on: ANY, text: () => "News reaches the character, by word, by letter or from a passer-by, about a person, a group or a place they already know of." },
  { key: "consequence", on: ANY, history: true, text: () => "Something the character did earlier catches up with them." },
  { key: "hazard", on: ANY, hazard: true, text: () => "A danger, an obstacle or someone unfriendly turns up." },
  { key: "opportunity", on: ANY, text: () => "A chance comes the character's way: work, a deal, a favour to be asked, a way in." },
  { key: "drawn_in", on: ["arrival"], text: () => "People where the character has come to are in the middle of a quarrel, a hard choice or a celebration, and the character is drawn into it." },
  { key: "scene", on: ["arrival"], text: () => "Something is going on in this place just as the character gets there." },
  { key: "wonder", on: ANY, text: () => "A small kindness or a small wonder comes with no strings tied to it." },
  { key: "confides", on: ANY, followers: 1, text: (c, p) => `${c.followers[p(c.followers.length)]!}, who travels with the character, confides something personal.` },
  { key: "banter", on: ANY, followers: 2, text: (c, p) => {
    const a = p(c.followers.length);
    const b = (a + 1 + p(c.followers.length - 1)) % c.followers.length;
    return `${c.followers[a]!} and ${c.followers[b]!}, who both travel with the character, tease each other or trade banter.`;
  } },
  { key: "complication", on: ANY, quest: true, text: (c) => `A complication, or a move by a rival, bears on what the character is after${c.quest ? ` (${named(c.quest)})` : ""}.` },
  { key: "lead", on: ANY, quest: true, text: (c) => `A lead or a rumour turns up about what the character is after${c.quest ? ` (${named(c.quest)})` : ""}.` },
  { key: "turn_of_fight", on: ["action", "going"], fight: true, text: () => "Something shifts in the fight: a new arrival on one side or the other, the ground or the building giving way, or someone's nerve breaking." },
];

/** The kinds that may be offered now. */
export function eligible(r: Run, trigger: Trigger): Kind[] {
  const fight = inFight(r);
  const c: Context = { followers: followersOf(r), quest: openQuest(r) };
  const down = nearlyDown(r);
  return KINDS.filter((k) => {
    if (!!k.fight !== fight) return false;
    if (!k.on.includes(trigger)) return false;
    if (k.hazard && down) return false;
    if (k.followers && c.followers.length < k.followers) return false;
    if (k.quest && c.quest === null) return false;
    if (k.history && r.turn < HISTORY) return false;
    return true;
  });
}

/**
 * Draw from the round's bag: a kind is not offered again until the others have had their turn, and one offered just
 * now is passed over while any other will do. Takes up to `count`, and puts back what is not offered.
 */
export function pickKinds(r: Run, st: EventsState, from: readonly Kind[], count = LISTED): Kind[] {
  const known = new Set(KINDS.map((k) => k.key));
  st.bag = st.bag.filter((k) => known.has(k));
  const picks: Kind[] = [];
  for (let i = 0; i < count; i++) {
    let rest = from.filter((k) => !picks.includes(k));
    const fresher = rest.filter((k) => !st.last.includes(k.key));
    if (fresher.length) rest = fresher;
    if (!rest.length) break;
    let pool = rest.filter((k) => st.bag.includes(k.key));
    if (!pool.length) {
      // A new round: each kind goes in, all of them alike (none is weightier than another).
      pool = rest;
      for (const k of rest) if (!st.bag.includes(k.key)) st.bag.push(k.key);
    }
    const one = pool[Math.min(pool.length - 1, Math.floor(draw(r) * pool.length))]!;
    st.bag.splice(st.bag.indexOf(one.key), 1);
    picks.push(one);
  }
  return picks;
}

/**
 * Something offered to the storyteller this turn, or nothing. Never in the turn something cut in, never while the
 * cooldown runs, never in a fight but what suits one; then a roll against the chance for what this turn is.
 * Writes down what it offered (the cooldown, the round's bag, the last kinds) in the run it is given.
 */
export function offer(r: Run, trigger: Trigger): string[] {
  const st = eventsOf(r);
  if (st.cutIn === r.turn || st.cooldown > 0) return [];
  const fight = inFight(r);
  const chance = fight ? CHANCE.fight : CHANCE[trigger];
  if (draw(r) >= chance) return [];
  const from = eligible(r, trigger);
  if (!from.length) return [];
  const picks = pickKinds(r, st, from);
  if (!picks.length) return [];
  st.cooldown = COOLDOWN;
  st.last = picks.map((k) => k.key);
  const c: Context = { followers: followersOf(r), quest: openQuest(r) };
  const pick = (n: number): number => (n <= 1 ? 0 : Math.min(n - 1, Math.floor(draw(r) * n)));
  return picks.map((k) => k.text(c, pick));
}

/* ------------------------------------------------- cutting in ------------------------------------------------- */

/** The chance of a cutting-in as the reader gave it (a number from 1 to 9 for tenths, or from 0 to 1), kept to what is allowed. */
export function cutInChance(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return CUT_IN.otherwise;
  const p = n > 1 ? n / 10 : n;
  return Math.max(CUT_IN.least, Math.min(CUT_IN.most, p));
}

/** Whether something cuts in now: not while the cooldown runs, not in a fight; then rolled. Starts the cooldown when it does. */
export function cutsIn(r: Run, chance: number, unwelcome: boolean): boolean {
  const st = eventsOf(r);
  if (st.cooldown > 0 || inFight(r) || (unwelcome && nearlyDown(r))) return false;
  if (draw(r) >= chance) return false;
  st.cooldown = COOLDOWN;
  st.cutIn = r.turn;
  return true;
}

/** Who cuts in: someone here, by the name the run has them under, or else a short description. */
export function whoCutsIn(r: Run, who: string): string {
  const p = person(r, who);
  if (p) return p.dead ? "" : p.name;
  return same(who, r.sheet.name) ? "" : who;
}

/* ------------------------------------------------- going on without a line ------------------------------------------------- */

/**
 * What the storyteller is told when the player writes nothing of their own. `before` is how many such lines came just
 * before this one: from the third in a row the world stops going their way.
 */
export function passiveFact(before: number, how: "wait" | "onward"): string {
  const base = `${how === "wait" ? "The player has the character wait and let time pass" : "The player has the character simply go on"}, writing nothing of their own to do. They start nothing new. The world does not wait with them: time passes, and other people and happenings move on by themselves, so that something is different by the end of the passage.`;
  return before >= PASSIVE_FREE
    ? `${base} They have done nothing for some time now, so things do not quite go their way: a small setback, a chance slipping past, or a little ill luck, but nothing that hurts them badly.`
    : base;
}

/* ------------------------------------------------- quick choices ------------------------------------------------- */

const SAYS_I = /^(i|you|we|he|she|they|let's)\b/i;
/**
 * Three quick choices kept whole or not at all: three different things to try, each in the imperative, two to ten
 * words, none of them the character speaking or a name, none the same as another (their first words differ).
 */
export function choicesOk(r: Run, items: readonly string[]): string[] | null {
  const out = items.map((s) => s.replace(/\s+/g, " ").trim().replace(/^[-*\d.)\s]+/, "").replace(/[.!]+$/, ""));
  if (out.length !== 3) return null;
  const firsts = new Set<string>();
  const first = r.sheet.name.split(" ")[0]!.toLowerCase();
  for (const s of out) {
    const words = s.split(" ");
    if (words.length < 2 || words.length > 10 || /[<>{}"]/.test(s) || SAYS_I.test(s) || words[0]!.toLowerCase() === first) return null;
    firsts.add(words[0]!.toLowerCase());
  }
  return firsts.size === 3 ? out : null;
}

/** Whether the player seems stuck by what the rolls and the lines show: failures in a row, the same line again, or going on. */
export function seemsStuck(st: EventsState, again: boolean, failed: boolean, idle: boolean): boolean {
  return idle || again || st.bad + (failed ? 1 : 0) >= STUCK_AFTER;
}
