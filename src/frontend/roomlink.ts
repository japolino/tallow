/**
 * A Lumiverse multiplayer room, as a seat at the table needs it (game/seatsit.ts): who I am in it, whose turn it is,
 * what the host's Tallow has written on the messages (shared/tablewire.ts), and how a line is handed in.
 *
 * A room gives an extension three things, and this uses only those. The room's own events reach every player's
 * frontend (ROOM_STATUS with the last messages when you come in, ROOM_TURN_CHANGED, and the chat's MESSAGE_SENT and
 * MESSAGE_EDITED, relayed to guests through the same event names). A line goes in through the chat's own composer,
 * which applies the room's turn rules. And the host may open and end the room's "freeform window", in which everyone
 * writes before one reply is made: the table keeps one open, so a round is collect-then-resolve as in the game this
 * follows, with no button for the host to press each round.
 *
 * The watching starts when the extension loads, not when you sit down: a guest's messages arrive as they come into
 * the room, before they open the table.
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { SeatEvent, SeatLink } from "../game/seatsit.js";
import { HOST } from "../engine/seats.js";
import { wireOf, type WireRound } from "../shared/tablewire.js";

interface Participant {
  id: string;
  role: "host" | "peer";
  displayName: string;
  persona?: { name?: string } | null;
  status?: string;
}
interface RoomView {
  roomId: string;
  chatId: string;
  status?: string;
  turnStrategy: "round_robin" | "freeform";
  freeformDeadline: number | null;
  currentTurnParticipantId: string | null;
  participants: Participant[];
  selfParticipantId?: string;
}
interface Msg {
  id: string;
  chat_id?: string;
  is_user?: boolean;
  name?: string;
  content?: string;
  extra?: Record<string, unknown> | null;
}

/** What is known of one chat's room and table. */
interface Known {
  room: RoomView | null;
  /** The narrator's message that carries the run, and its text. */
  at: { id: string; round: WireRound; text: string } | null;
  /** Messages seen, by id: the last text and whether Tallow's entry on each was already passed on. */
  seen: Map<string, { line: boolean; round: string; passage: string }>;
  queue: SeatEvent[];
  waiting: ((e: SeatEvent) => void) | null;
  /** My own messages sent and not yet seen back: what `send` waits on. */
  sent: ((id: string) => void)[];
  generating: boolean;
}

const API = "/api/v1/multiplayer";

export function createRoomWatch(ctx: SpindleFrontendContext) {
  const chats = new Map<string, Known>();
  const of = (chatId: string): Known => {
    let k = chats.get(chatId);
    if (!k) chats.set(chatId, (k = { room: null, at: null, seen: new Map(), queue: [], waiting: null, sent: [], generating: false }));
    return k;
  };
  const push = (k: Known, e: SeatEvent): void => {
    if (k.waiting) {
      const w = k.waiting;
      k.waiting = null;
      w(e);
    } else {
      k.queue.push(e);
      if (k.queue.length > 200) k.queue.shift();
    }
  };
  const meIn = (room: RoomView | null): Participant | undefined => (room?.selfParticipantId ? room.participants.find((p) => p.id === room.selfParticipantId) : undefined);
  const seatOfMe = (k: Known): string | null => {
    if (!k.room) return HOST;
    const me = meIn(k.room);
    return me ? (me.role === "host" ? HOST : me.id) : null;
  };
  const mineIs = (k: Known, m: Msg): boolean => {
    const mp = (m.extra?.mp ?? null) as { participantId?: string } | null;
    const seat = seatOfMe(k);
    // The host's own line carries no name in a room of turns, and the host's participant id in a freeform round.
    return !!m.is_user && (seat === HOST ? !mp?.participantId || mp.participantId === k.room?.selfParticipantId : mp?.participantId === seat);
  };

  /** A message as it now is: what is new on it is passed on, each thing once. */
  function take(k: Known, m: Msg, live: boolean): void {
    if (!m?.id) return;
    const was = k.seen.get(m.id) ?? { line: false, round: "", passage: "" };
    const text = m.content ?? "";
    const own = wireOf(m.extra);
    if (m.is_user) {
      if (live && !k.seen.has(m.id) && mineIs(k, m)) for (const done of k.sent.splice(0)) done(m.id);
      if (own?.kind === "line" && !was.line) {
        was.line = true;
        if (live) push(k, { type: "line", part: own.part });
      }
    } else if (own?.kind === "round") {
      if (own.run) k.at = { id: m.id, round: own, text };
      // The same message written down again (the passage was told again, or more was told after it) is the round
      // once more; the run's own count of dice drawn tells one writing-down from the next.
      const sig = own.run ? `${own.n}|${own.run.n}|${text.length}` : "";
      if (live && sig && was.round !== sig) push(k, { type: "round", round: own, text });
      if (sig) was.round = sig;
    }
    k.seen.set(m.id, was);
  }

  const offs: (() => void)[] = [];
  const on = (name: string, f: (p: any) => void): void => void offs.push(ctx.events.on(name, f as (p: unknown) => void));
  on("ROOM_STATUS", (p: { chatId?: string; room?: RoomView; messages?: Msg[] }) => {
    if (!p?.room?.chatId) return;
    const k = of(p.room.chatId);
    k.room = { ...p.room, selfParticipantId: p.room.selfParticipantId ?? k.room?.selfParticipantId };
    for (const m of p.messages ?? []) take(k, m, false);
    push(k, { type: "turn" });
  });
  on("ROOM_TURN_CHANGED", (p: { chatId?: string; currentTurnParticipantId?: string | null; freeformDeadline?: number | null; turnStrategy?: RoomView["turnStrategy"] }) => {
    const k = p?.chatId ? chats.get(p.chatId) : undefined;
    if (!k?.room) return;
    if (p.currentTurnParticipantId !== undefined) k.room.currentTurnParticipantId = p.currentTurnParticipantId;
    if (p.freeformDeadline !== undefined) k.room.freeformDeadline = p.freeformDeadline;
    if (p.turnStrategy) k.room.turnStrategy = p.turnStrategy;
    push(k, { type: "turn" });
  });
  for (const name of ["ROOM_PARTICIPANT_JOINED", "ROOM_PARTICIPANT_LEFT", "ROOM_PARTICIPANT_KICKED"]) {
    on(name, (p: { chatId?: string; participant?: Participant; participantId?: string }) => {
      const k = p?.chatId ? chats.get(p.chatId) : undefined;
      if (!k?.room) return;
      const id = p.participant?.id ?? p.participantId;
      if (name === "ROOM_PARTICIPANT_JOINED" && p.participant && !k.room.participants.some((x) => x.id === id)) k.room.participants.push(p.participant);
      else if (name !== "ROOM_PARTICIPANT_JOINED") k.room.participants = k.room.participants.filter((x) => x.id !== id);
      push(k, { type: "turn" });
    });
  }
  on("ROOM_ROUND_COMPLETE", (p: { chatId?: string }) => {
    const k = p?.chatId ? chats.get(p.chatId) : undefined;
    if (k) push(k, { type: "turn" });
  });
  const message = (p: { chatId?: string; message?: Msg }): void => {
    const chatId = p?.chatId ?? p?.message?.chat_id;
    if (!chatId || !p.message) return;
    take(of(chatId), p.message, true);
  };
  on("MESSAGE_SENT", message);
  on("MESSAGE_EDITED", message);
  on("GENERATION_STARTED", (p: { chatId?: string }) => {
    if (p?.chatId) of(p.chatId).generating = true;
  });
  const ended = (p: { chatId?: string; messageId?: string; content?: string; error?: string }): void => {
    if (!p?.chatId) return;
    const k = of(p.chatId);
    k.generating = false;
    // The passage is said the moment it is told; what it changed comes after, on the same message.
    if (p.messageId && p.content?.trim() && !p.error) {
      const was = k.seen.get(p.messageId) ?? { line: false, round: "", passage: "" };
      if (was.passage !== p.content.trim()) {
        was.passage = p.content.trim();
        k.seen.set(p.messageId, was);
        push(k, { type: "passage", text: p.content.trim() });
      }
    }
    push(k, { type: "turn" });
  };
  on("GENERATION_ENDED", ended);
  on("GENERATION_STOPPED", (p: { chatId?: string }) => {
    if (p?.chatId) of(p.chatId).generating = false;
  });

  const call = async (path: string, method = "GET", body?: unknown): Promise<unknown> => {
    const r = await fetch(`${API}${path}`, { method, credentials: "include", ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json().catch(() => null);
  };

  /**
   * The room of a chat, when I am its host and it was not seen in an event (the extension loaded after the room was
   * made). A guest's room is only ever known from the events.
   */
  async function hostRoom(chatId: string): Promise<void> {
    const k = of(chatId);
    if (k.room) return;
    try {
      const got = (await call(`/rooms/by-chat/${encodeURIComponent(chatId)}`)) as { room?: RoomView | null } | null;
      const room = got?.room;
      if (!room || room.status === "closed") return;
      const host = room.participants.find((p) => p.role === "host");
      k.room = { ...room, selfParticipantId: room.selfParticipantId ?? host?.id };
    } catch {
      /* No room, or none that is mine: a table for one. */
    }
  }

  /** The table as the host's own backend gave it, for a host who sat down after the messages went by. */
  function seed(chatId: string, round: WireRound, text: string): void {
    const k = of(chatId);
    if (round.run && (!k.at || k.at.round.n <= round.n)) k.at = { id: k.at?.id ?? "", round, text };
  }

  /** How I stand in a chat: the room's host, a guest in it, or in no room at all. */
  function standing(chatId: string): "host" | "guest" | "none" {
    const k = chats.get(chatId);
    if (!k?.room) return "none";
    const me = meIn(k.room);
    return me?.role === "host" ? "host" : me ? "guest" : "none";
  }

  const turnOf = (k: Known): { ok: true } | { ok: false; why: string } => {
    const room = k.room;
    if (k.generating) return { ok: false, why: "I am still telling the last of it. Write it again in a moment." };
    if (!room) return { ok: true };
    if (room.turnStrategy === "freeform") {
      return room.freeformDeadline !== null && Date.now() / 1000 < room.freeformDeadline ? { ok: true } : { ok: false, why: "Not yet: the round is not open. Write it again in a moment." };
    }
    if (room.currentTurnParticipantId === room.selfParticipantId) return { ok: true };
    const whose = room.participants.find((p) => p.id === room.currentTurnParticipantId);
    return { ok: false, why: `Not yet: it is ${whose?.persona?.name || whose?.displayName || "someone else"}'s turn. Write it again when it comes to you.` };
  };

  function link(chatId: string): SeatLink {
    const k = of(chatId);
    return {
      me: () => seatOfMe(k),
      state: () => (k.at ? { round: k.at.round, text: k.at.text } : null),
      may: () => turnOf(k),
      async send(line) {
        const may = turnOf(k);
        if (!may.ok) return may;
        const composer = ctx.composer;
        if (!composer?.getState().mounted) return { ok: false, why: "I cannot reach this chat's message box from here. Leave the table, open the chat, and sit down again." };
        // The line is in when my own message comes back from the room.
        const back = new Promise<boolean>((done) => {
          const mine = (): void => done(true);
          k.sent.push(mine);
          setTimeout(() => {
            k.sent = k.sent.filter((f) => f !== mine);
            done(false);
          }, 12_000);
        });
        try {
          composer.setText(line);
          await composer.send();
        } catch (e) {
          return { ok: false, why: /BUSY/.test(String((e as Error)?.message)) ? "I am still telling the last of it. Write it again in a moment." : "That did not go through. Write it again." };
        }
        return (await back) ? { ok: true } : { ok: false, why: "That did not reach the table. Write it again." };
      },
      next: () =>
        new Promise<SeatEvent>((done) => {
          const e = k.queue.shift();
          if (e) done(e);
          else k.waiting = done;
        }),
    };
  }

  /* The host's own part: the round stays open for everyone to write in, and the host may go on without the rest. */

  /** Open the room's round (its freeform window) when none is open and nothing is being told. The host's only. */
  async function openRound(chatId: string): Promise<void> {
    const k = chats.get(chatId);
    const room = k?.room;
    if (!k || !room || standing(chatId) !== "host" || room.turnStrategy !== "freeform" || k.generating) return;
    if (room.freeformDeadline !== null && Date.now() / 1000 < room.freeformDeadline) return;
    try {
      const got = (await call(`/rooms/${room.roomId}/freeform/start`, "POST")) as { deadline?: number | null } | null;
      if (got?.deadline) room.freeformDeadline = got.deadline;
    } catch {
      /* The room's own panel can still open it. */
    }
  }

  /** Go on without whoever has not written: the round is told with the lines that are in. The host's only. */
  async function goOn(chatId: string): Promise<void> {
    const room = chats.get(chatId)?.room;
    if (!room || standing(chatId) !== "host") return;
    try {
      if (room.turnStrategy === "freeform") await call(`/rooms/${room.roomId}/freeform/end`, "POST");
      else if (room.currentTurnParticipantId && room.currentTurnParticipantId !== room.selfParticipantId) await call(`/rooms/${room.roomId}/turn/skip`, "POST", { participant_id: room.currentTurnParticipantId });
    } catch {
      /* Nothing to go on from. */
    }
  }

  /** Who is at the table and where the round stands, in a line for the strip at the top of the room. */
  function strip(chatId: string): { text: string; canGoOn: boolean } {
    const k = chats.get(chatId);
    const room = k?.room;
    if (!k || !room) return { text: "", canGoOn: false };
    const name = (p: Participant): string => p.persona?.name || p.displayName || "Guest";
    const host = standing(chatId) === "host";
    if (k.generating) return { text: "The narrator is telling it.", canGoOn: false };
    if (room.turnStrategy === "freeform") {
      const open = room.freeformDeadline !== null && Date.now() / 1000 < room.freeformDeadline;
      return { text: open ? `Everyone writes: ${room.participants.map(name).join(", ")}.` : "The round is closed.", canGoOn: host && open };
    }
    const whose = room.participants.find((p) => p.id === room.currentTurnParticipantId);
    const mine = room.currentTurnParticipantId === room.selfParticipantId;
    return { text: mine ? "Your turn." : `${whose ? name(whose) : "Someone"} is writing.`, canGoOn: host && !mine && !!whose };
  }

  return { link, seed, standing, hostRoom, selfId: (chatId: string) => chats.get(chatId)?.room?.selfParticipantId ?? null, openRound, goOn, strip, strategy: (chatId: string) => chats.get(chatId)?.room?.turnStrategy ?? null, dispose: () => offs.splice(0).forEach((f) => f()) };
}

export type RoomWatch = ReturnType<typeof createRoomWatch>;
