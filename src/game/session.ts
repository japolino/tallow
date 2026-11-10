/**
 * A whole sitting for a character card (milestone 4): the narrator asks which kind of story it is to be and who you
 * are, and the adventure is built for the card while you write (docs/DESIGN.md, 2: work starts as early as it can).
 * Then the director plays it. Every question is answered by writing in the notebook; nothing is picked from a list.
 */
import type { Trip } from "../engine/adventure.js";
import type { Hero } from "../engine/hero.js";
import { buildAdventure, SKELETONS } from "./build.js";
import { tropeRead, tropesFor, type CardInfo, type Trope } from "./card.js";
import { direct, type Director, type Table } from "./director.js";
import type { Minds } from "./minds.js";
import type { Ask } from "./prompts.js";
import type { Adventure } from "../engine/adventure.js";

export interface SittingOptions {
  card: CardInfo;
  seed: string;
  table: Table;
  minds: Minds & { hero(line: string, hour?: number): Promise<Hero> };
  /** The model, for building the adventure. Null builds the made-up one with the card's character in it. */
  ask: Ask | null;
  /** Told the moment the adventure is built, before its cards are dealt (the room draws its map then). */
  built?: (adv: Adventure) => void;
  /** Told when the director takes over, for anything that watches it. */
  started?: (d: Director) => void;
}

export const TROPE_AGAIN = "A rescue, or a courtship? Write which.";
export const WHO_ASK = "And who are you? Write it in your own words: what kind of person you are, and your name, if you like.";

export function greeting(card: CardInfo, offered: readonly Trope[]): string[] {
  const rescue = `A rescue: someone ${card.name} cares for has been taken, and you have one night to get them back, with ${card.name} beside you.`;
  if (offered.length === 1) return [`Sit down. I have a story for you tonight, and ${card.name} is in it.`, `It is a rescue. Someone ${card.name} cares for has been taken, and you have one night to get them back, with ${card.name} beside you.`];
  return [
    `Sit down. I have a story for you tonight, and ${card.name} is in it.`,
    `What kind of story is it to be? ${rescue} Or a courtship: tonight you try to win ${card.name}'s heart, and someone else is trying too.`,
    "Write which.",
  ];
}

export async function sit(o: SittingOptions): Promise<Trip> {
  const { table, card } = o;
  const offered = tropesFor(card);
  await table.say(greeting(card, offered));
  let trope: Trope = offered[0]!;
  if (offered.length > 1) {
    for (;;) {
      const w = await table.write();
      await w.given;
      void table.aside();
      const t = tropeRead(w.line, offered);
      if (t) {
        trope = t;
        break;
      }
      await table.say([TROPE_AGAIN]);
    }
  }
  // The building starts now, and runs while you write who you are and while the narrator shuffles.
  const build = buildAdventure(o.ask, card, trope, o.seed).then((adv) => (o.built?.(adv), adv));
  await table.say([WHO_ASK]);
  const w = await table.write();
  const reading = o.minds.hero(w.line);
  await w.given;
  const hero = await table.wait("read", reading);
  void table.aside();
  const d = direct(SKELETONS[trope], hero.sheet, o.seed, table, o.minds, { build, perks: hero.perks, who: hero.who });
  o.started?.(d);
  return d.done;
}
