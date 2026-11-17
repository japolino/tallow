/**
 * A table for several, kept by the host's Lumiverse (the game itself is game/partyturn.ts).
 *
 * A Lumiverse room is the host's chat: every player's line arrives in it as a message with who wrote it, and the room
 * then has the host generate one reply, which it streams to everyone. This plays the game on exactly that:
 *
 *   before the reply   (an interceptor, which the room's generation waits for) the lines written since the narrator
 *                      last spoke are one round: a newcomer is seated, every line is judged and rolled for its own
 *                      player's character, and what was made of each line is written onto it. The reply's whole
 *                      prompt is then replaced with the storyteller's, so the room's own reply is the round's passage.
 *   after the reply    the passage is read back, what changed is written down, and the run as it now stands is
 *                      written onto the narrator's message, where every player's table reads it (shared/tablewire.ts).
 *
 * Nothing else is sent anywhere: a room carries messages and nothing more. The table is the host's, kept in the
 * host's own storage; a guest's Lumiverse only shows it.
 *
 * It asks Spindle for nothing by name: what it needs of the host is handed in (TableHost), so it runs in a test.
 */
import type { Run } from "../engine/run.js";
import { HOST, reseat, seatFirst, seatNamed, seatOf, settled } from "../engine/seats.js";
import type { Message } from "../game/ask.js";
import { afterRound, idle, join, judgeRound, tellingOfRound, type Part, type Round, type SeatLine } from "../game/partyturn.js";
import { checkSaid, faceOf, rollSaid } from "../game/runsit.js";
import { begin, type Card, type RunDeps } from "../game/runturn.js";
import { OWN, readSeatLine, wireOf, wireRun, type WireLine, type WirePart, type WireRound } from "../shared/tablewire.js";

/** A chat message as the host gives it: who wrote it is in `extra.mp` for a guest's, and nowhere for the host's own. */
export interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  extra?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/** What the table needs of the host it runs in. */
export interface TableHost {
  /** The last messages of a chat, in order. */
  messages(chatId: string, tail: number): Promise<ChatMsg[]>;
  /** Add the narrator's message; returns its id. */
  append(chatId: string, content: string): Promise<string>;
  /** Write Tallow's own entry on a message (null takes it off). */
  setOwn(chatId: string, messageId: string, own: unknown): Promise<void>;
  setContent(chatId: string, messageId: string, content: string): Promise<void>;
  /** The host's own storage, by user. */
  load(userId: string, path: string): Promise<string | null>;
  save(userId: string, path: string, data: string): Promise<void>;
  /** Whose table a chat is, kept for the whole extension so it is found again after a restart. */
  loadIndex(): Promise<Record<string, string>>;
  saveIndex(index: Record<string, string>): Promise<void>;
  /** The models, asked as this user. */
  deps(userId: string): Pick<RunDeps, "ask" | "decide">;
  log(m: string): void;
}

/** How long a passage is at a table for several: said aloud, and shared between everyone who acted. */
const WORDS = "Two or three short paragraphs, 110 to 200 words.";
/** How many lines' ids are remembered as played, so a line is never played twice. */
const PLAYED_MOST = 400;

interface Saved {
  v: 1;
  userId: string;
  chatId: string;
  run: Run;
  rules: unknown;
  /** The host's participant id in the room, once the host's browser has said it (see OpenAsk). */
  hostId?: string;
  /** The narrator's message that carries the run now. */
  narratorId: string | null;
  played: string[];
}

interface Pending {
  /** The ids of the lines this round was judged from. */
  ids: string[];
  round: Round;
  /** What the room's reply is asked. */
  teller: Message[];
  /** The run as it stood before the round: a passage told again is read back against this, not against itself. */
  before: Run;
  /** For a round with nothing to tell: what the narrator's message says instead. */
  says?: string;
}

interface Table extends Saved {
  pending: Pending | null;
  /** The round last played, kept so its passage can be told again (a swipe or a regenerate) to the same dice. */
  last: (Pending & { messageId: string }) | null;
  /** What is still being written down: the next round waits for it. */
  busy: Promise<void>;
}

const pathOf = (chatId: string): string => `table-${chatId.replace(/[^A-Za-z0-9_-]/g, "_")}.json`;
const cap = (t: string): string => (t ? t[0]!.toUpperCase() + t.slice(1) : t);

/** One player's part, as their table says and shows it. */
export function wirePart(p: Part): WirePart {
  const x = p.report;
  const roll = p.how === "played" ? x?.roll ?? null : null;
  const aside = p.how === "played" && x?.kind === "action" ? (x.verdict === "implausible" ? "That could not work." : x.verdict === "missing" ? "You have nothing to do that with." : "") : "";
  return {
    seat: p.seat,
    name: p.name,
    how: p.how,
    line: p.line,
    ...(roll && x ? { heading: cap(x.act).slice(0, 60), check: checkSaid({ run: p.judging!.run, line: p.line, report: x, result: "" }), die: { face: faceOf(roll), said: rollSaid(roll) } } : {}),
    ...(aside ? { aside } : {}),
    ...(p.reply ? { reply: p.reply } : {}),
    changes: p.changes.filter((c) => !c.startsWith("(")),
  };
}

export interface OpenAsk {
  userId: string;
  chatId: string;
  /** What a new table is set up from; not read when the chat already has one. */
  card: () => Promise<Card | null>;
  seed: number;
  rules: unknown;
  /** The host's own name at the table. */
  player: string;
  /** The host's participant id in the room: a freeform round writes it on the host's own lines, as on a guest's. */
  hostId?: string;
}

export function createTables(host: TableHost) {
  const tables = new Map<string, Table>();
  const opening = new Map<string, Promise<Table | null>>();
  let index: Record<string, string> | null = null;

  const depsOf = (t: Table): RunDeps => ({ ...host.deps(t.userId), log: (m) => host.log(`table ${t.chatId.slice(0, 8)}: ${m}`), rules: () => t.rules });

  async function keep(t: Table): Promise<void> {
    const saved: Saved = { v: 1, userId: t.userId, chatId: t.chatId, run: settled(t.run), rules: t.rules, ...(t.hostId ? { hostId: t.hostId } : {}), narratorId: t.narratorId, played: t.played.slice(-PLAYED_MOST) };
    try {
      await host.save(t.userId, pathOf(t.chatId), JSON.stringify(saved));
    } catch (e) {
      host.log(`the table could not be saved: ${(e as Error).message}`);
    }
  }

  /** The table of a chat, read from the host's storage the first time it is asked for; null when the chat has none. */
  async function find(chatId: string): Promise<Table | null> {
    const have = tables.get(chatId);
    if (have) return have;
    const going = opening.get(chatId);
    if (going) return going;
    const reading = (async (): Promise<Table | null> => {
      try {
        index ??= await host.loadIndex().catch(() => ({}));
        const userId = index[chatId];
        if (!userId) return null;
        const raw = await host.load(userId, pathOf(chatId));
        const s = raw ? (JSON.parse(raw) as Saved) : null;
        if (!s || s.v !== 1 || s.run?.v !== 1 || !s.run.seats?.length) return null;
        const t: Table = { ...s, pending: null, last: null, busy: Promise.resolve() };
        tables.set(chatId, t);
        return t;
      } catch (e) {
        host.log(`the table could not be read: ${(e as Error).message}`);
        return null;
      } finally {
        opening.delete(chatId);
      }
    })();
    opening.set(chatId, reading);
    return reading;
  }

  /** The round as it is written on the narrator's message. */
  const wireRound = (t: Table, parts: Part[], withRun: boolean, idleRound = false): WireRound => ({ v: 1, kind: "round", n: t.run.turn, parts: parts.map(wirePart), ...(withRun ? { run: wireRun(t.run) } : {}), ...(idleRound ? { idle: true } : {}) });

  /** The run moves to the narrator's newest message: the one that had it keeps only its round. */
  async function carry(t: Table, messageId: string, round: WireRound): Promise<void> {
    await host.setOwn(t.chatId, messageId, round).catch((e) => host.log(`the table's state could not be written on the message: ${(e as Error).message}`));
    const old = t.narratorId;
    t.narratorId = messageId;
    if (old && old !== messageId) {
      try {
        const was = (await host.messages(t.chatId, 60)).find((m) => m.id === old);
        const w = was ? wireOf(was.metadata ?? was.extra) : null;
        if (w?.kind === "round" && w.run) {
          const { run: _run, ...rest } = w;
          await host.setOwn(t.chatId, old, rest);
        }
      } catch {
        /* It only made the old message larger than it need be. */
      }
    }
  }

  /**
   * Sit the host down: the chat's table, set up from the card the first time. Returns the round on the narrator's
   * message as every table reads it, or null when no table could be set up.
   */
  async function open(a: OpenAsk): Promise<WireRound | null> {
    let t = await find(a.chatId);
    if (t && t.userId !== a.userId) return null;
    if (!t) {
      const card = await a.card();
      if (!card) return null;
      const deps: RunDeps = { ...host.deps(a.userId), log: (m) => host.log(`table ${a.chatId.slice(0, 8)}: ${m}`), rules: () => a.rules };
      const run = await begin(deps, card, a.seed);
      seatFirst(run, HOST, a.player);
      t = { v: 1, userId: a.userId, chatId: a.chatId, run, rules: a.rules, ...(a.hostId ? { hostId: a.hostId } : {}), narratorId: null, played: [], pending: null, last: null, busy: Promise.resolve() };
      tables.set(a.chatId, t);
      index ??= await host.loadIndex().catch(() => ({}));
      index[a.chatId] = a.userId;
      await host.saveIndex(index).catch((e) => host.log(`the list of tables could not be saved: ${(e as Error).message}`));
      // The opening is the narrator's first message: everyone who comes into the room reads the table from it.
      const id = await host.append(a.chatId, run.opening);
      await carry(t, id, wireRound(t, [], true));
      await keep(t);
    } else {
      t.rules = a.rules;
      if (a.hostId) t.hostId = a.hostId;
      const me = seatOf(t.run, HOST);
      if (me && a.player) me.player = a.player;
    }
    return wireRound(t, [], true);
  }

  async function rules(userId: string, chatId: string, value: unknown): Promise<void> {
    const t = await find(chatId);
    if (t && t.userId === userId) t.rules = value;
  }

  /** The seat a message was written from, and what to call its player. */
  function writerOf(t: Table, m: ChatMsg): { seat: string; player: string; persona: string } {
    const mp = (m.extra?.mp ?? null) as { participantId?: unknown; displayName?: unknown; personaName?: unknown } | null;
    if (!mp || typeof mp.participantId !== "string" || !mp.participantId || mp.participantId === t.hostId) return { seat: HOST, player: "", persona: "" };
    const player = typeof mp.displayName === "string" ? mp.displayName : "";
    return { seat: mp.participantId, player, persona: typeof mp.personaName === "string" ? mp.personaName : player };
  }

  /**
   * The room is about to generate its reply in this chat. Returns the storyteller's messages for the round, to be
   * sent in place of the chat's own prompt; null when the chat has no table (the reply is then the chat's own).
   */
  async function before(chatId: string, generationType: string): Promise<Message[] | null> {
    const t = await find(chatId);
    if (!t || generationType === "impersonate" || generationType === "quiet") return null;
    // What the last round changed is written down before the next is judged.
    await t.busy.catch(() => undefined);
    const all = await host.messages(chatId, 60);
    // A passage told again (a swipe, a regenerate, a continue) is the same round to the same dice: the run goes back to
    // where it stood before that round, and the new passage is read back in the old one's place.
    if ((generationType === "regenerate" || generationType === "swipe" || generationType === "continue") && t.last && all.some((m) => m.id === t.last!.messageId)) {
      t.run = structuredClone(t.last.before);
      t.pending = { ids: t.last.ids, round: t.last.round, teller: t.last.teller, before: t.last.before, ...(t.last.says ? { says: t.last.says } : {}) };
      return t.pending.teller;
    }
    // The round: every player's message since the narrator last spoke that has not been played.
    let from = all.length;
    while (from > 0 && all[from - 1]!.role !== "assistant") from--;
    const batch = all.slice(from).filter((m) => m.role === "user" && m.content.trim() && !t.played.includes(m.id));
    if (!batch.length) {
      // Nothing was written: the story goes on by itself, from the host's seat.
      const round = await judgeRound(depsOf(t), t.run, [{ seat: HOST, line: "(Nobody writes anything. Time passes, and the story goes on.)" }]);
      t.pending = { ids: [], round, teller: tellingOfRound(depsOf(t), round, WORDS), before: structuredClone(t.run) };
      return t.pending.teller;
    }
    const ids = batch.map((m) => m.id);
    // The same lines as were judged already (the reply failed and is asked for again): the same judging stands.
    if (t.pending && t.pending.ids.length === ids.length && t.pending.ids.every((id, i) => id === ids[i])) return t.pending.teller;

    const d = depsOf(t);
    const run = structuredClone(settled(t.run));
    const lines: SeatLine[] = [];
    const joined: string[] = [];
    for (const m of batch) {
      const w = writerOf(t, m);
      const sits = readSeatLine(m.content);
      if (!seatOf(run, w.seat)) {
        // A guest who came back into the room under a new id takes their old seat, by their character's name.
        const old = w.seat !== HOST ? seatNamed(run, sits?.name || w.persona) : undefined;
        if (old && old.id !== HOST && !batch.some((b) => writerOf(t, b).seat === old.id)) reseat(run, old.id, w.seat);
        else {
          await join(d, run, { id: w.seat, player: w.player, name: sits?.name || w.persona, page: sits?.page ?? "" });
          if (sits) joined.push(w.seat);
        }
      }
      // A line that only sits down again says nothing: the seat is theirs already.
      if (sits && !joined.includes(w.seat)) continue;
      const have = lines.find((l) => l.seat === w.seat);
      if (have) have.line = `${have.line}\n${m.content.trim()}`;
      else lines.push({ seat: w.seat, line: sits ? "(sits down)" : m.content.trim() });
    }
    // The host's line is played first, as the lead of the round.
    lines.sort((a, b) => Number(b.seat === HOST) - Number(a.seat === HOST));
    const round = await judgeRound(d, run, lines, joined);
    // What was made of each line is written onto it at once: a player sees their check and throws their die while
    // the passage is being told.
    await Promise.all(batch.map((m) => {
      const part = round.parts.find((p) => p.seat === writerOf(t, m).seat);
      const own: WireLine | null = part ? { v: 1, kind: "line", part: wirePart(part) } : null;
      return own ? host.setOwn(chatId, m.id, own).catch(() => undefined) : Promise.resolve();
    }));
    if (idle(round)) {
      // Nobody's character did anything: the narrator's message is the game's answers, and no story is told.
      const says = round.parts.filter((p) => p.reply).map((p) => `${p.name}: ${p.reply}`).join("\n\n") || "Nothing happens.";
      // Seats taken and points placed are the run's from now on.
      t.pending = { ids, round, before: run, says, teller: [{ role: "system", content: "Repeat the text the user gives you exactly, word for word. Add nothing before it or after it." }, { role: "user", content: says }] };
      return t.pending.teller;
    }
    t.pending = { ids, round, teller: tellingOfRound(d, round, WORDS), before: structuredClone(settled(t.run)) };
    return t.pending.teller;
  }

  /**
   * The room's reply is in: the round's passage. It is read back, what changed is written down, and the run as it now
   * stands is written onto the narrator's message. A reply that failed leaves the round waiting to be told again.
   */
  function after(chatId: string, messageId: string | undefined, content: string | undefined): Promise<void> {
    const t = tables.get(chatId);
    if (!t || !t.pending || !messageId || !content?.trim()) return Promise.resolve();
    const p = t.pending;
    t.pending = null;
    t.busy = (async () => {
      const d = depsOf(t);
      try {
        if (p.says !== undefined) {
          t.run = settled(p.round.run);
          if (content.trim() !== p.says.trim()) await host.setContent(chatId, messageId, p.says).catch(() => undefined);
          await carry(t, messageId, wireRound(t, p.round.parts, true, true));
        } else {
          const played = await afterRound(d, p.round, content.trim());
          t.run = played.run;
          // What was told after the passage (the world's own move, a coming round) is added to the narrator's message.
          if (played.story.trim() !== content.trim()) await host.setContent(chatId, messageId, played.story).catch(() => undefined);
          await carry(t, messageId, wireRound(t, played.parts, true));
        }
      } catch (e) {
        host.log(`the passage could not be written down: ${(e as Error).message}`);
        // The story was told all the same: the table shows the run as it stood, so nobody is left waiting.
        await carry(t, messageId, wireRound(t, p.round.parts, true));
      }
      t.last = { ...p, messageId };
      for (const id of p.ids) if (!t.played.includes(id)) t.played.push(id);
      await keep(t);
    })();
    return t.busy;
  }

  /** The table of a chat as its tables read it, for the host's own frontend. */
  async function state(userId: string, chatId: string): Promise<WireRound | null> {
    const t = await find(chatId);
    return t && t.userId === userId ? wireRound(t, [], true) : null;
  }

  return { open, rules, before, after, state, has: (chatId: string) => find(chatId).then((t) => !!t), key: OWN };
}

export type Tables = ReturnType<typeof createTables>;
