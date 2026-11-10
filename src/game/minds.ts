/**
 * The two jobs a model does in the game (docs/DESIGN.md, 2): reading what the player wrote, and telling what
 * happened. Neither decides anything. This file holds the stand-ins used when there is no model: a list of plain
 * words for the reading, fixed lines for the telling, and a delay that can be made long on purpose so the table's
 * waits can be looked at.
 */
import type { RoadStop } from "../engine/adventure.js";
import type { Moment, Outcome, Read, Tier } from "../engine/moment.js";
import { rulesRead } from "../meaning/read.js";

export interface Minds {
  /** What a written line attempts, or null when it cannot be told. */
  read(line: string, m: Moment): Promise<Read | null>;
  /**
   * Tell what happened, in a sentence or three. `note` is what must be true (narratorNote); `more` says the stop is
   * not finished with yet, though this try worked.
   */
  tell(o: Outcome, stop: RoadStop, note: string, more: boolean): Promise<string>;
  /** Who is at the table, for the telling: told by the director whenever it changes. */
  know?(who: string, company: string[]): void;
}

const after = <T>(ms: number, v: T): Promise<T> => (ms > 0 ? new Promise((done) => setTimeout(() => done(v), ms)) : Promise.resolve(v));

type Said = "won" | "more" | "cost" | "fail" | "bad";
const KIND: Record<Tier, Said> = { crit_success: "won", success: "won", partial: "cost", fail: "fail", crit_fail: "bad" };

/** Plain lines for each way and result, for when no model tells it. `{at}` is the stop's name. */
const LINES: Record<Said, Record<string, string>> = {
  won: {
    talk: "Your words land. At {at}, the way opens for you.",
    sneak: "Nobody sees you go. {at} is behind you before anyone thinks to look.",
    force: "You go straight at it, and it gives. {at} is behind you.",
    pay: "The price is taken, and the way at {at} opens.",
  },
  more: {
    talk: "That lands, and it buys you ground. It is not over yet.",
    sneak: "You get that far unseen. There is further to go.",
    force: "That one goes down. It is not over.",
    pay: "That much is accepted. More is wanted.",
  },
  cost: {
    talk: "You are let by, but not gladly, and it will be remembered.",
    sneak: "You get by, but slowly, a hand's breadth at a time.",
    force: "You get through, and you are hurt doing it.",
    pay: "It costs more than it should have, but you are through.",
  },
  fail: {
    talk: "It does not land. Nobody here will listen to you that way again.",
    sneak: "You are seen. That way is shut now, and they are watching.",
    force: "It holds, and you come off worse.",
    pay: "What you offer is taken in part and the rest refused.",
  },
  bad: {
    talk: "It goes badly wrong. You have made an enemy here.",
    sneak: "You are caught in the open. It costs you dearly.",
    force: "It goes very badly. You are hurt, and they are angry.",
    pay: "You are cheated outright, and laughed at for it.",
  },
};

/** Stand-ins for both jobs. `slowMs` is how long each takes, to look at the waits. */
export function standIns(slowMs = 0): Minds {
  return {
    read: (line, m) => after(slowMs, rulesRead(line, m)),
    tell: (o, stop, _note, more) => {
      const kind = more && o.past ? "more" : KIND[o.tier];
      return after(slowMs, LINES[kind][o.check.way]!.replace("{at}", stop.name));
    },
  };
}
