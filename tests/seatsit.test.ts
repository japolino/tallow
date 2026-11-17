import { describe, expect, test } from "bun:test";
import { createTables } from "../src/backend/table.js";
import { mine, seatSit, SEAT_LOOK, SEAT_THROW, type SeatEvent, type SeatLink } from "../src/game/seatsit.js";
import type { Table } from "../src/game/table.js";
import { readSeatLine, seatLine, type WireLine, type WireRound } from "../src/shared/tablewire.js";
import { open, world } from "./roomworld.js";

/** One seat at a table that is not there: what the narrator said and showed is written down, and nothing is drawn. */
function seat(me: string, state: { round: WireRound; text: string } | null, o: { persona?: { name: string; who: string }; may?: () => { ok: true } | { ok: false; why: string } } = {}) {
  const said: string[] = [], sent: string[] = [], dice: number[] = [], notes: { mine?: string; heading?: string; his: string[] }[] = [];
  let sheets: { heading: string; his: string[] }[] = [];
  let beside: { id: string; name: string; picture: number; out?: boolean }[] = [];
  let alive = true;
  /** What happens, in order: an event from the room, or a line this player writes. */
  const script: (SeatEvent | { write: string })[] = [];
  let hand: ((line: string) => void) | null = null;
  const table: Table = {
    say: async (lines) => void said.push(...lines),
    write: () => new Promise((done) => (hand = (line) => done({ line, given: Promise.resolve() }))),
    page: async () => undefined,
    aside: async () => undefined,
    wait: (_beat, work) => work,
    dieOrLine: async () => null,
    throwDie: async (face) => void dice.push(face),
    clock: () => undefined,
    sheets: (pages) => void (sheets = pages),
    party: (p) => void (beside = p),
    notes: (w) => void notes.push(w),
  };
  const link: SeatLink = {
    me: () => me,
    state: () => state,
    send: async (line) => {
      sent.push(line);
      return { ok: true };
    },
    may: o.may ?? (() => ({ ok: true })),
    next: () => new Promise((done) => {
      const step = (): void => {
        const at = script.shift();
        if (!at) {
          // Nothing more happens: the sitting ends once what is under way has been worked through.
          setTimeout(() => {
            alive = false;
            done({ type: "turn" });
          }, 5);
        } else if ("write" in at) {
          hand?.(at.write);
          // The line is handed over before the room answers it.
          setTimeout(step, 1);
        } else done(at);
      };
      step();
    }),
  };
  const run = () => seatSit({ table, link, deps: { ask: async () => "" }, persona: o.persona ?? null, alive: () => alive });
  return { said, sent, dice, notes, script, run, sheets: () => sheets, beside: () => beside };
}

describe("a seat at the table", () => {
  test("the host writes, throws the die the host's game decided, hears the passage and gets the sheets", async () => {
    const w = world();
    const t = createTables(w.host);
    const first = (await open(t))!;
    const s = seat("host", { round: first, text: w.messages[0]!.content });
    const line = w.say("I sneak past the goblin.");
    await w.reply(t, "She slips by the goblin.");
    const part = (w.own(line) as WireLine).part;
    const round = w.own(w.messages.at(-1)!.id) as WireRound;
    s.script.push({ write: "I sneak past the goblin." }, { type: "line", part }, { type: "passage", text: "She slips by the goblin." }, { type: "round", round, text: "She slips by the goblin." });
    await s.run();
    expect(s.sent).toEqual(["I sneak past the goblin."]);
    expect(s.dice).toEqual([part.die!.face]);
    expect(s.said).toContain(SEAT_THROW);
    expect(s.said).toContain(part.die!.said);
    expect(s.said).toContain("She slips by the goblin.");
    // The passage is said once, and the page beside the notebook has the line and what came of it.
    expect(s.said.filter((x) => x === "She slips by the goblin.")).toHaveLength(1);
    expect(s.notes.at(-1)!.mine).toBe("I sneak past the goblin.");
    expect(s.notes.at(-1)!.his).toContain("She slips by the goblin.");
    expect(s.sheets().length).toBeGreaterThan(0);
    // Alone at the table, nobody sits beside you and nothing is said of looking.
    expect(s.beside()).toEqual([]);
    expect(s.said).not.toContain(SEAT_LOOK);
  });

  test("a guest sits down with their page, sees the other's die, and has their own character in the chair", async () => {
    const w = world();
    const t = createTables(w.host);
    const first = (await open(t))!;
    const s = seat("p2", { round: first, text: w.messages[0]!.content }, { persona: { name: "Tom", who: "Tom, a hedge knight." } });
    const sat = w.say(seatLine("Tom", "Tom, a hedge knight."), { id: "p2", name: "Tom" });
    const hers = w.say("I sneak past the goblin.");
    await w.reply(t, "Tom rides up as Mira slips by.");
    const round = w.own(w.messages.at(-1)!.id) as WireRound;
    const other = (w.own(hers) as WireLine).part;
    s.script.push({ type: "line", part: (w.own(sat) as WireLine).part }, { type: "line", part: other }, { type: "passage", text: "Tom rides up as Mira slips by." }, { type: "round", round, text: "Tom rides up as Mira slips by." }, { write: "I draw my sword." });
    await s.run();
    // The first thing sent is the seat line, with the page; once seated, lines go as they are written.
    expect(readSeatLine(s.sent[0]!)).toEqual({ name: "Tom", page: "Tom, a hedge knight." });
    expect(s.sent[1]).toBe("I draw my sword.");
    // Nobody throws another player's die; it is read out.
    expect(s.dice).toEqual([]);
    expect(s.said).toContain(`Mira: ${other.die!.said}`);
    expect(s.said).toContain("Tom rides up as Mira slips by.");
    const sheets = s.sheets().flatMap((p) => [p.heading, ...p.his]).join("\n");
    expect(sheets).toContain("Longsword");
    expect(sheets).toContain("At the table");
    // The host sits beside them, wearing the picture of the first place at the table; how to look that way is said once.
    expect(s.beside()).toEqual([{ id: "host", name: "Mira", picture: 0, out: false }]);
    expect(s.said.filter((x) => x === SEAT_LOOK)).toHaveLength(1);
    expect(mine(round.run!, "p2").sheet.name).toBe("Tom");
    expect(mine(round.run!, "host").sheet.name).toBe("Mira");
  });

  test("a line the room will not take yet is said back, not lost in silence", async () => {
    const w = world();
    const t = createTables(w.host);
    const first = (await open(t))!;
    const s = seat("host", { round: first, text: w.messages[0]!.content }, { may: () => ({ ok: false, why: "It is Tom's turn to write." }) });
    s.script.push({ write: "I sneak past the goblin." });
    await s.run();
    expect(s.sent).toEqual([]);
    expect(s.said).toContain("It is Tom's turn to write.");
  });

  test("an answer is said to the one who asked, and no story is told for it", async () => {
    const w = world();
    const t = createTables(w.host);
    const first = (await open(t))!;
    const s = seat("host", { round: first, text: w.messages[0]!.content });
    w.host.deps = () => ({ ask: async (ms) => (ms[0]!.content.includes("referee") ? JSON.stringify({ kind: "ooc" }) : "You have 5 bronze.") });
    const line = w.say("How much money do I have?");
    await w.reply(t, "Mira: You have 5 bronze.");
    const round = w.own(w.messages.at(-1)!.id) as WireRound;
    s.script.push({ write: "How much money do I have?" }, { type: "line", part: (w.own(line) as WireLine).part }, { type: "passage", text: "Mira: You have 5 bronze." }, { type: "round", round, text: "Mira: You have 5 bronze." });
    await s.run();
    expect(s.said).toContain("You have 5 bronze.");
    expect(s.said).not.toContain("Mira: You have 5 bronze.");
  });
});
