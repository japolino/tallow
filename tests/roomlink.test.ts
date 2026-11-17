import { afterEach, describe, expect, test } from "bun:test";
import { createTables, type ChatMsg } from "../src/backend/table.js";
import { createRoomWatch } from "../src/frontend/roomlink.js";
import { seatSit, SEAT_THROW } from "../src/game/seatsit.js";
import type { Table } from "../src/game/table.js";
import { readSeatLine } from "../src/shared/tablewire.js";
import { world } from "./roomworld.js";

/**
 * A Lumiverse room in memory, behaving as a real one was seen to (a freeform room, two accounts on one server): the
 * events each player's browser gets, in the order and shape they came in; the host's own line tagged with the host's
 * participant id like a guest's; the reply's empty message made before the extension is asked for the prompt. The
 * host's table (backend/table.ts), each player's link to the room (frontend/roomlink.ts) and each seat
 * (game/seatsit.ts) are the real ones.
 */
function room() {
  const w = world();
  const tables = createTables(w.host);
  const ROOM = "r1", CHAT = "c1";
  const people = [{ id: "p1", role: "host" as const, displayName: "Ana", persona: { name: "Mira" } }, { id: "p2", role: "peer" as const, displayName: "Ben", persona: { name: "Tom" } }];
  const state = { deadline: null as number | null, submitted: new Set<string>() };
  const ears: Record<string, Map<string, ((p: unknown) => void)[]>> = { p1: new Map(), p2: new Map() };
  const emit = (name: string, payload: unknown): void => {
    for (const id of ["p1", "p2"]) for (const f of ears[id]!.get(name) ?? []) f(structuredClone(payload));
  };
  /** A message as a room sends it. */
  const sent = (m: ChatMsg): Record<string, unknown> => ({ id: m.id, chat_id: CHAT, is_user: m.role === "user", content: m.content, extra: { ...(m.extra ?? {}), ...(m.metadata && Object.keys(m.metadata).length ? { spindle_metadata: m.metadata } : {}) } });
  const view = (self: string): Record<string, unknown> => ({ roomId: ROOM, chatId: CHAT, status: "open", turnStrategy: "freeform", freeformDeadline: state.deadline, currentTurnParticipantId: null, participants: people, selfParticipantId: self });
  // What Tallow writes onto a message goes out to everyone as an edit of it.
  const setOwn = w.host.setOwn;
  w.host.setOwn = async (c, id, own) => {
    await setOwn(c, id, own);
    emit("MESSAGE_EDITED", { chatId: CHAT, message: sent(w.messages.find((m) => m.id === id)!) });
  };
  const turn = (): void => emit("ROOM_TURN_CHANGED", { chatId: CHAT, roomId: ROOM, turnStrategy: "freeform", currentTurnParticipantId: null, freeformDeadline: state.deadline });
  const openWindow = (): void => {
    state.deadline = Math.floor(Date.now() / 1000) + 120;
    state.submitted.clear();
    turn();
  };
  let told = 0;
  const replies: string[] = [];
  /** The room's reply, as Lumiverse makes it. */
  async function generate(): Promise<void> {
    state.deadline = null;
    turn();
    const m: ChatMsg = { id: `n${++told}`, role: "assistant", content: "", extra: null, metadata: {} };
    w.messages.push(m);
    emit("MESSAGE_SENT", { chatId: CHAT, message: sent(m) });
    emit("GENERATION_STARTED", { chatId: CHAT });
    await tables.before(CHAT, "normal");
    m.content = replies.shift() ?? "The story goes on.";
    emit("MESSAGE_EDITED", { chatId: CHAT, message: sent(m) });
    emit("GENERATION_ENDED", { chatId: CHAT, messageId: m.id, content: m.content });
    emit("ROOM_ROUND_COMPLETE", { chatId: CHAT, roomId: ROOM });
    await tables.after(CHAT, m.id, m.content);
  }
  let going: Promise<void> = Promise.resolve();
  function submit(from: string, content: string): void {
    if (state.deadline === null) throw new Error("the window is closed");
    const who = people.find((p) => p.id === from)!;
    const id = w.say(content, { id: from, name: who.displayName });
    w.messages.find((m) => m.id === id)!.extra = { mp: { participantId: from, displayName: who.displayName, personaName: who.persona.name } };
    emit("MESSAGE_SENT", { chatId: CHAT, message: sent(w.messages.find((m) => m.id === id)!) });
    state.submitted.add(from);
    if (people.every((p) => state.submitted.has(p.id))) going = generate();
  }
  /** One player's browser: the extension's context, and a table that writes down what the narrator says. */
  function player(id: string, persona: { name: string; who: string } | null) {
    let text = "";
    const ctx = {
      events: {
        on: (name: string, f: (p: unknown) => void) => {
          const list = ears[id]!.get(name) ?? [];
          ears[id]!.set(name, [...list, f]);
          return () => undefined;
        },
      },
      composer: { getState: () => ({ mounted: true }), setText: (t: string) => void (text = t), send: async () => submit(id, text) },
    };
    const watch = createRoomWatch(ctx as never);
    const said: string[] = [], dice: number[] = [], lines: string[] = [];
    let sheets: { heading: string; his: string[] }[] = [];
    let alive = true;
    let hand: ((line: string) => void) | null = null;
    const table: Table = {
      say: async (l) => void said.push(...l),
      write: () => new Promise((done) => (hand = (line) => done({ line, given: Promise.resolve() }))),
      page: async () => undefined,
      aside: async () => undefined,
      wait: (_b, work) => work,
      dieOrLine: async () => null,
      throwDie: async (face) => void dice.push(face),
      clock: () => undefined,
      sheets: (p) => void (sheets = p),
      notes: () => undefined,
    };
    const sit = (): Promise<void> => seatSit({ table, link: watch.link(CHAT), deps: { ask: async () => "" }, persona, alive: () => alive });
    return { watch, said, dice, lines, sit, write: (line: string) => hand?.(line), sheets: () => sheets.flatMap((p) => [p.heading, ...p.his]).join("\n"), stop: () => void (alive = false) };
  }
  // The room's own API, as the host's browser calls it.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { method?: string }) => {
    const json = (o: unknown): Response => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
    if (String(url).endsWith(`/rooms/by-chat/${CHAT}`)) return json({ room: view("p1") });
    if (String(url).endsWith(`/rooms/${ROOM}/freeform/start`) && init?.method === "POST") return (openWindow(), json({ ok: true, deadline: state.deadline }));
    return new Response("{}", { status: 404 });
  }) as never;
  const hydrate = (id: string): void => (ears[id]!.get("ROOM_STATUS") ?? []).forEach((f) => f({ chatId: CHAT, roomId: ROOM, room: view(id), messages: w.messages.map(sent) }));
  return { w, tables, CHAT, player, hydrate, openWindow, replies, settle: async () => void (await going), restore: () => void (globalThis.fetch = realFetch) };
}

const tick = (ms = 15): Promise<void> => new Promise((r) => setTimeout(r, ms));
let undo: (() => void) | null = null;
afterEach(() => {
  undo?.();
  undo = null;
});

describe("a freeform room for two", () => {
  test("the host sets the table, a guest sits down from their own browser, and a round reaches both seats", async () => {
    const r = room();
    undo = r.restore;
    const host = r.player("p1", { name: "Mira", who: "Mira, a thief." });
    const guest = r.player("p2", { name: "Tom", who: "Tom, a hedge knight." });

    // The host sits down: their browser finds the room, has the backend set the table, and opens the round.
    await host.watch.hostRoom(r.CHAT);
    expect(host.watch.standing(r.CHAT)).toBe("host");
    const set = await r.tables.open({ userId: "u1", chatId: r.CHAT, card: async () => ({ world: "w", who: "Mira, a thief.", name: "Mira", retell: true }), seed: 5, rules: {}, player: "Ana", hostId: host.watch.selfId(r.CHAT)! });
    host.watch.seed(r.CHAT, set!, set!.run!.opening);
    await host.watch.openRound(r.CHAT);
    void host.sit();

    // The guest comes into the room (the last messages come with it) and sits down at the table.
    r.hydrate("p2");
    expect(guest.watch.standing(r.CHAT)).toBe("guest");
    void guest.sit();
    await tick();
    // Their first line went in by itself, with their page.
    const seatMsg = r.w.messages.find((m) => m.role === "user")!;
    expect(readSeatLine(seatMsg.content)).toEqual({ name: "Tom", page: "Tom, a hedge knight." });

    // The host writes; with both lines in, the room makes its reply.
    r.replies.push("Tom rides up as Mira slips by the goblin.");
    host.write("I sneak past the goblin.");
    await tick();
    await r.settle();
    await tick();

    // The host's own line came back to them as theirs (it carries their participant id), was judged, and they threw.
    expect(host.said).toContain(SEAT_THROW);
    expect(host.dice).toHaveLength(1);
    expect(host.said).toContain("Tom rides up as Mira slips by the goblin.");
    // The guest was seated by the host's game, heard the host's roll and the passage, and has their own sheet.
    expect(guest.said).toContain("You are seated. I am bringing you into the story now.");
    expect(guest.said.some((x) => x.startsWith("Mira: ") && /on the die/.test(x))).toBe(true);
    expect(guest.said).toContain("Tom rides up as Mira slips by the goblin.");
    expect(guest.dice).toEqual([]);
    expect(guest.sheets()).toContain("Longsword");
    expect(host.sheets()).toContain("Lockpicks");
    expect(guest.watch.link(r.CHAT).me()).toBe("p2");
    expect(host.watch.link(r.CHAT).me()).toBe("host");

    // The next round: the host's table opens it again, and the guest's line is rolled on their own sheet.
    await host.watch.openRound(r.CHAT);
    r.replies.push("Tom's blade bites.");
    guest.write("I cut at the goblin.");
    host.write("I wait.");
    await tick();
    await r.settle();
    await tick();
    expect(guest.dice).toHaveLength(1);
    expect(guest.said).toContain("Tom's blade bites.");
    // Two seats, and never a third for the host.
    const last = r.w.own(r.w.messages.at(-1)!.id) as { run?: { seats?: { id: string }[] } };
    expect(last.run!.seats!.map((s) => s.id)).toEqual(["host", "p2"]);
    host.stop();
    guest.stop();
  });
});
