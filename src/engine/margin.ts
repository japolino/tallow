/**
 * The margin (docs/MOONSHOT.md, 3): your skills talk to you.
 *
 * Every stat is a way of noticing. When a place is set, every hidden thing in it has a number; code compares each with
 * your stats and, where you are good enough, your hero writes it in the margin of your notebook, in pencil, with the
 * stat in small capitals before it:
 *
 *   SENSE — the woman by the stairs has looked at the back door four times.
 *   GUILE — the barkeep's "nothing back there but bins" came too fast.
 *
 * Only what you are good enough to notice is written. And the margin can be wrong in one way: your fault gets a voice
 * once or twice a story, giving bad advice in your own hand. The narrator knows it is the fault talking; you are not
 * told. Following it is a temptation, as it always was.
 *
 * Pure: facts in, notes out. A model may write what a notice says; code decides who sees it.
 */
import type { Foe } from "./effect.js";
import { statOf, type Sheet, type Stat } from "./moment.js";
import { seededRng } from "./dice.js";

/** What each stat notices (docs/MOONSHOT.md, 3.1). */
export const NOTICES: Record<Stat, string> = {
  sense: "what is there: a hidden door, wet boots on a dry night, a hand on a knife",
  wits: "what it means: whose sigil that is, that the ledger is forged",
  guile: "lies and liars",
  charm: "what people want, and what they fear",
  grace: "ways in and out: the drainpipe, the loose shutter, the back stair",
  brawn: "danger, and what breaks",
  power: "what your world's power touches: a ward, a curse, a working",
};

/** A hidden thing at a place: seen by a hero with at least `at` in `stat`. */
export interface Notice {
  id: string;
  stat: Stat;
  /** The stat it takes to see it, 1 to 4. */
  at: number;
  /** What the hero writes, in a few words, without the stat. */
  says: string;
  /** Whether leaning on it makes a slip heard (a thing said) or seen (a thing seen). Seen when not said. */
  slip?: "heard" | "seen";
}

/** A note in the margin. */
export interface MarginNote {
  id: string;
  stat: Stat;
  says: string;
  /** The fault talking: bad advice in your own hand. Never shown as such to the player. */
  fault?: boolean;
}

/** The most notes written at one place, so the margin stays a margin. */
export const MARGIN_MAX = 3;
/** How often a story lets the fault speak. */
export const FAULT_MAX = 2;

/** What the fault says, in your own hand, by the stat it hides behind (your best). */
const FAULT_SAYS: Record<Stat, readonly string[]> = {
  brawn: ["you could take them.", "they are all talk: push through."],
  grace: ["you could be past before they turn round.", "nobody is watching the far side."],
  charm: ["they like you already. Ask for more.", "one smile and they will let you by."],
  guile: ["they will believe anything you tell them.", "they have not seen through you. Keep going."],
  wits: ["you have worked it out. No need to look further.", "it is obvious what this is."],
  sense: ["nothing here is hidden.", "they are telling the truth."],
  power: ["your power is more than enough for this.", "nothing here can stand against what you can do."],
};

/** Your best stat, which the fault hides behind. */
const bestStat = (sheet: Pick<Sheet, "stats">): Stat => {
  const order: Stat[] = ["brawn", "grace", "charm", "guile", "wits", "sense", ...(typeof sheet.stats.power === "number" ? (["power"] as Stat[]) : [])];
  return order.reduce((a, b) => (statOf(sheet, b) > statOf(sheet, a) ? b : a));
};

/**
 * The notes your hero writes at a place: what you are good enough to see and have not seen before, the hardest finds
 * first, at most MARGIN_MAX. With `fault`, one more note in your own hand that is the fault talking.
 */
export function marginFor(sheet: Pick<Sheet, "stats">, notices: readonly Notice[], seen: readonly string[] = [], fault?: { due: boolean; seed: string }): MarginNote[] {
  const got: MarginNote[] = notices
    .filter((n) => !seen.includes(n.id) && n.at > 0 && statOf(sheet, n.stat) >= n.at)
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
    .slice(0, MARGIN_MAX)
    .map((n) => ({ id: n.id, stat: n.stat, says: n.says }));
  if (fault?.due) {
    const stat = bestStat(sheet);
    const says = FAULT_SAYS[stat];
    const pick = says[Math.floor(seededRng(fault.seed)() * says.length)]!;
    got.push({ id: `fault-${fault.seed}`, stat, says: pick, fault: true });
  }
  return got;
}

/** Whether the fault speaks at this place: seeded, about one place in four, never more than FAULT_MAX a story. */
export function faultDue(spoken: number, seed: string): boolean {
  return spoken < FAULT_MAX && seededRng(`fault:${seed}`)() < 0.25;
}

/** A note as written: the stat in capitals, a dash, the words. The seventh stat goes by the world's name. */
export function marginLine(n: MarginNote, powerName?: string): string {
  const name = n.stat === "power" ? (powerName ?? "power") : n.stat;
  const says = n.says.trim().replace(/^[a-z]/, (c) => c.toLowerCase());
  return `${name.toUpperCase()} — ${says}`;
}

/**
 * What any foe gives away to a hero who looks (docs/MOONSHOT.md, 2.5 and 3.1), from its record alone: Brawn judges how
 * dangerous it is, Sense sees what it keeps away from, Wits knows a second weakness, Guile knows when it will break.
 */
export function foeNotices(foe: Foe | null | undefined, id = "foe"): Notice[] {
  if (!foe) return [];
  const out: Notice[] = [];
  const who = foe.name ?? "they";
  const force = foe.ratings.force;
  if (typeof force === "number") {
    out.push({ id: `${id}-danger`, stat: "brawn", at: 2, says: force >= 4 ? `${who} could break you in half. Not head on.` : force <= 1 ? `${who} is the least dangerous thing here.` : `${who} can fight, but you have seen worse.` });
  }
  const [first, second] = foe.hurtBy ?? [];
  if (first) out.push({ id: `${id}-hurt-${first}`, stat: "sense", at: 2, says: `${who} keeps clear of anything ${first === "numbers" ? "that comes at it from two sides" : `to do with ${first}`}.` });
  if (second) out.push({ id: `${id}-hurt-${second}`, stat: "wits", at: 3, says: `you have read of things like this: ${second} hurts them.` });
  if (foe.breaks && foe.breaks < 1) out.push({ id: `${id}-breaks`, stat: "guile", at: 2, says: `${who} has no stomach for a long fight. Hurt them and they will run.` });
  const talk = foe.ratings.talk;
  if (typeof talk === "number" && talk <= 1) out.push({ id: `${id}-talk`, stat: "charm", at: 2, says: `${who} wants to be talked down more than they will say.` });
  return out;
}
