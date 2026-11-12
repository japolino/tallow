/**
 * You may sit down as one of your own personas (session.ts, whoYouAre): in the room they are on a paper with a box each
 * (room/roster.ts), and a written line is read for one of them by meaning, by its words only when no model can tell.
 */
import { describe, expect, test } from "bun:test";
import { rulesHero } from "../src/engine/hero.js";
import { nameCheck } from "../src/engine/moment.js";
import type { Trip } from "../src/engine/adventure.js";
import type { CardInfo, Persona } from "../src/game/card.js";
import type { Table, Written } from "../src/game/director.js";
import { standIns } from "../src/game/minds.js";
import { NEW_ASK, personaLine, personaOptions, personaPicked, personaRead, sit, whoAsk, WHO_ASK } from "../src/game/session.js";
import { rowAt, rowHeight } from "../src/room/roster.js";

const KESTREL: Persona = { name: "Kestrel", who: "Cartographer. A wandering cartographer with a bad knee and a good memory.", title: "Cartographer" };
const ROOK: Persona = { name: "Rook", who: "A one-eyed smuggler who owes everyone money." };
const MAREN: CardInfo = { name: "Maren Vell", description: "Maren Vell is a lamplighter in a river town, thirty-one, quick-tongued and stubborn." };

describe("the narrator asks who you are, with your personas", () => {
  test("with none it asks as before; with them it names them, or points at the paper", () => {
    expect(whoAsk()).toBe(WHO_ASK);
    expect(whoAsk([KESTREL])).toContain("as yourself, Kestrel");
    expect(whoAsk([KESTREL, ROOK])).toContain("1, Kestrel; 2, Rook");
    expect(whoAsk([KESTREL, ROOK], true)).toContain("tick one");
  });

  test("a model is offered each persona by its number, and someone new", () => {
    expect(Object.keys(personaOptions([KESTREL, ROOK]))).toEqual(["1", "2", "new"]);
    expect(personaOptions([KESTREL])["1"]).toContain("Kestrel, Cartographer");
  });

  test("the model's answer is the persona; anything not offered is someone new", async () => {
    const said = (key: string | null) => ({ ...standIns(0), pick: async () => key });
    expect(await personaPicked(said("2"), "the smuggler, tonight", [KESTREL, ROOK])).toBe(1);
    expect(await personaPicked(said("new"), "Kestrel", [KESTREL, ROOK])).toBe(-1);
    expect(await personaPicked(said("7"), "whatever", [KESTREL, ROOK])).toBe(-1);
    expect(await personaPicked(said("1"), "anything", [])).toBe(-1);
  });

  test("the model sees every persona and what was written", async () => {
    let seen = "";
    await personaPicked({ ...standIns(0), pick: async (_q, text) => ((seen = text), "new") }, "a tall stranger", [KESTREL, ROOK]);
    expect(seen).toContain("1. Kestrel");
    expect(seen).toContain("2. Rook: A one-eyed smuggler");
    expect(seen).toContain("a tall stranger");
  });

  test("the words take a persona only by its name or number, when no model can tell", async () => {
    expect(personaRead("Rook.", [KESTREL, ROOK])).toBe(1);
    expect(personaRead("as kestrel", [KESTREL, ROOK])).toBe(0);
    expect(personaRead("2", [KESTREL, ROOK])).toBe(1);
    expect(personaRead("as myself", [KESTREL])).toBe(0);
    expect(personaRead("as myself", [KESTREL, ROOK])).toBe(-1);
    expect(personaRead("A one-eyed smuggler called Rook who hates boats", [KESTREL, ROOK])).toBe(-1);
    expect(await personaPicked(standIns(0), "Rook", [KESTREL, ROOK])).toBe(1);
  });

  test("the persona is what is read into the hero, with what was said at the table, if anything", () => {
    expect(personaLine(KESTREL).startsWith("Kestrel. Cartographer. A wandering cartographer")).toBe(true);
    expect(personaLine(KESTREL)).not.toContain("Said at the table");
    expect(personaLine(KESTREL, "as myself, with my old compass")).toContain("with my old compass");
  });
});

describe("the paper of who you may be", () => {
  test("its lines fill the paper, none too tall, and a touch finds the line under it", () => {
    expect(rowHeight(2)).toBeLessThanOrEqual(112);
    expect(rowHeight(13) * 13).toBeLessThanOrEqual(1000);
    const h = rowHeight(3);
    expect(rowAt(176 + h * 0.5, 3)).toBe(0);
    expect(rowAt(176 + h * 2.5, 3)).toBe(2);
    expect(rowAt(176 + h * 3.5, 3)).toBe(-1);
    expect(rowAt(100, 3)).toBe(-1);
  });
});

/** A table that plays a whole sitting: who you are answered by `who`, then one story, then goodnight. */
function playTable(log: string[], who: (list: { name: string; title?: string }[]) => Promise<{ ticked: number } | Written>, lines: string[]): { table: Table; d: () => { trip: Trip; stage: string } | null; started: (x: { trip: Trip; stage: string }) => void } {
  let d: { trip: Trip; stage: string } | null = null;
  const table: Table = {
    say: async (l) => void log.push(...l),
    write: async () => {
      let line: string;
      if (!d || d.stage === "over") line = lines.shift() ?? "I'm done for tonight";
      else if (d.stage === "camp") line = "I press on";
      else {
        const m = d.trip.facing?.moment;
        const way = m && (["sneak", "talk", "force", "pay"] as const).find((w) => nameCheck(m, { way: w }));
        line = { sneak: "I creep past quietly", talk: "I ask them kindly", force: "I shove my way through", pay: "I pay what they ask" }[way ?? "sneak"];
      }
      log.push(`> ${line}`);
      return { line, given: Promise.resolve() };
    },
    personas: async (list) => (log.push(`paper: ${list.map((l) => l.name).join(", ")}`), who(list)),
    page: async () => {},
    aside: async () => {},
    wait: async (_b, w) => w,
    weigh: async () => {},
    dieOrLine: async () => null,
    throwDie: async () => {},
    carry: async () => {},
    clock: () => {},
    deal: async () => {},
    turn: async () => {},
    clear: async () => {},
    fork: async (s) => s[0]!.id,
    offer: async () => 0,
    give: async () => {},
    take: async () => {},
    rival: async () => {},
    move: async () => {},
  };
  return { table, d: () => d, started: (x) => (d = x) };
}

describe("sitting down as a persona", () => {
  const card: CardInfo = { ...MAREN, personas: [KESTREL, ROOK] };

  test("the box ticked is who the hero is read from", async () => {
    const log: string[] = [];
    const read: string[] = [];
    const { table, started } = playTable(log, async () => ({ ticked: 1 }), ["a heist, please"]);
    const minds = { ...standIns(0), hero: async (line: string) => (read.push(line), rulesHero(line)) };
    await sit({ card, seed: "p1", table, minds, ask: null, started });
    expect(log).toContain("paper: Kestrel, Rook");
    expect(read[0]!.startsWith("Rook. A one-eyed smuggler")).toBe(true);
  });

  test("the box for someone new asks who, and that line is the hero", async () => {
    const log: string[] = [];
    const read: string[] = [];
    const { table, started } = playTable(log, async (list) => ({ ticked: list.length }), ["a heist, please", "Rook"]);
    const minds = { ...standIns(0), hero: async (line: string) => (read.push(line), rulesHero(line)) };
    await sit({ card, seed: "p2", table, minds, ask: null, started });
    expect(log).toContain(NEW_ASK);
    // Ticked as someone new, a line that happens to be a persona's name is still someone new.
    expect(read[0]).toBe("Rook");
  });

  test("a line written instead of a tick is read for a persona", async () => {
    const log: string[] = [];
    const read: string[] = [];
    const { table, started } = playTable(log, async () => ({ line: "Kestrel", given: Promise.resolve() }), ["a heist, please"]);
    const minds = { ...standIns(0), hero: async (line: string) => (read.push(line), rulesHero(line)) };
    await sit({ card, seed: "p3", table, minds, ask: null, started });
    expect(read[0]!.startsWith("Kestrel. Cartographer.")).toBe(true);
  });

  test("a table with no paper asks with the names, and reads the line", async () => {
    const log: string[] = [];
    const read: string[] = [];
    const { table, started } = playTable(log, async () => ({ ticked: 0 }), ["a heist, please", "2"]);
    delete table.personas;
    const minds = { ...standIns(0), hero: async (line: string) => (read.push(line), rulesHero(line)) };
    await sit({ card, seed: "p4", table, minds, ask: null, started });
    expect(log.some((l) => l.includes("1, Kestrel; 2, Rook"))).toBe(true);
    expect(read[0]!.startsWith("Rook.")).toBe(true);
  });
});
