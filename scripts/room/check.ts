/**
 * Plays a table for two in a real Lumiverse room and says whether it went as it should.
 *
 * Against the throwaway Lumiverse (scripts/room/start.ts) it does everything two players' browsers would: installs
 * this working copy of Tallow there, makes a host and a guest account, a small world and a freeform room; then, over
 * each account's own socket, the host sets the table, the guest sits down with their persona, and they write for
 * three rounds. It checks what only a real room shows: that Lumiverse runs the backend at all, that the room's reply
 * is the storyteller's, that each line is judged for its own character, and that the table reaches the guest.
 *
 *   bun --env-file=.env.local scripts/room/check.ts
 *
 * The models are the ones named in CHAT_MODEL_STRONG and CHAT_MODEL_FAST, reached through scripts/room/forward.ts.
 * Whatever is committed is what is tried: the throwaway installs a clone of this repository's current branch.
 */
import { seatLine } from "../../src/shared/tablewire.js";
import { api, base, character, chatId, check, failed, login, roomId, running, say } from "./setup.js";

/* ------------------------------------------------- two browsers ------------------------------------------------- */

interface Ev { event: string; payload: any }
const ownOf = (e: Ev): any => e.payload?.message?.extra?.spindle_metadata?.tallow;
async function socket(user: string) {
  const got: Ev[] = [];
  const waits: { test: (e: Ev) => boolean; done: (e: Ev) => void }[] = [];
  const ws = new WebSocket(`${base.replace("http", "ws")}/api/ws`, { headers: { Cookie: await login(user), Origin: base } } as never);
  ws.onmessage = (m) => {
    let e: Ev;
    try {
      const j = JSON.parse(String(m.data));
      e = { event: j.event ?? j.type, payload: j.payload ?? j };
    } catch {
      return;
    }
    got.push(e);
    if (e.event === "ROOM_MESSAGE_REJECTED" || e.event === "ROOM_JOIN_REJECTED") say(`${user}: ${e.event} ${JSON.stringify(e.payload)}`);
    for (const w of waits.slice()) if (w.test(e)) (waits.splice(waits.indexOf(w), 1), w.done(e));
  };
  await new Promise<void>((done, fail) => {
    ws.onopen = () => done();
    ws.onerror = () => fail(new Error(`${user}: the socket would not open`));
  });
  setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: "ping" })), 20_000);
  const send = (o: unknown): void => ws.send(JSON.stringify(o));
  const until = (what: string, test: (e: Ev) => boolean, ms: number, from = 0): Promise<Ev> =>
    new Promise((done, fail) => {
      const was = got.slice(from).find(test);
      if (was) return done(was);
      const w = { test, done: (e: Ev) => (clearTimeout(timer), done(e)) };
      const timer = setTimeout(() => (waits.splice(waits.indexOf(w), 1), fail(new Error(`${user}: timed out waiting for ${what}`))), ms);
      waits.push(w);
    });
  let n = 0;
  /** Ask Tallow's backend, as its frontend does. */
  const ask = async (msg: Record<string, unknown>, ms = 240_000): Promise<any> => {
    const id = `${user}-${++n}`;
    send({ type: "SPINDLE_BACKEND_MSG", extensionId: running.id, payload: { ...msg, id } });
    return (await until(`the backend's answer to ${String(msg.type)}`, (x) => x.event === "SPINDLE_FRONTEND_MSG" && x.payload?.data?.id === id, ms)).payload.data;
  };
  return { send, until, ask, got };
}

const host = await socket("host"), guest = await socket("guest");
host.send({ type: "room_join", roomId, displayName: "Ysolde", persona: { name: "Ysolde" } });
const hostId = (await host.until("the room's status", (e) => e.event === "ROOM_STATUS", 10_000)).payload.room.selfParticipantId as string;

const hp = (await host.ask({ type: "persona" })).persona;
const set = (await host.ask({ type: "table", chatId, characterId: character.id, seed: 4242, rules: {}, player: hp?.name ?? "", hostId })).round;
check(!!set?.run && set.run.seats?.length === 1 && set.run.seats[0].sheet.name === "Ysolde", `the host's table is set: ${set?.run?.seats?.[0]?.sheet?.name} at ${set?.run?.place?.name}`);
if (!set?.run) process.exit(1);

// The guest comes into the room after the table is set: the table comes with the room's last messages.
guest.send({ type: "room_join", roomId, displayName: "Brother Fenn", persona: { name: "Brother Fenn" } });
const gs = await guest.until("the room's status", (e) => e.event === "ROOM_STATUS", 10_000);
const guestId = gs.payload.room.selfParticipantId as string;
check((gs.payload.messages ?? []).some((m: any) => m.extra?.spindle_metadata?.tallow?.run), "a guest coming in gets the table with the room's messages");
const gp = (await guest.ask({ type: "persona" })).persona;
check(gp?.name === "Brother Fenn", "a guest's own persona is read by the host's Tallow");

let at = set.n as number;
interface Told { passage: string; own: any; lines: any[]; seconds: number }
async function round(lines: [typeof host, string][]): Promise<Told> {
  const hFrom = host.got.length, gFrom = guest.got.length, began = Date.now();
  await api("host", "POST", `/api/v1/multiplayer/rooms/${roomId}/freeform/start`);
  for (const [who, text] of lines) who.send({ type: "room_message", content: text });
  const written = (e: Ev): boolean => e.event === "MESSAGE_EDITED" && !e.payload?.message?.is_user && ownOf(e)?.kind === "round" && !!ownOf(e).run && (ownOf(e).n > at || ownOf(e).idle);
  const [, g] = await Promise.all([host.until("the round written down", written, 420_000, hFrom), guest.until("the round written down", written, 420_000, gFrom)]);
  at = ownOf(g).n;
  const stamped = guest.got.slice(gFrom).filter((e) => e.event === "MESSAGE_EDITED" && e.payload?.message?.is_user && ownOf(e)?.kind === "line").map((e) => ownOf(e).part);
  const t: Told = { passage: String(g.payload.message.content), own: ownOf(g), lines: stamped, seconds: Math.round((Date.now() - began) / 1000) };
  say(`round told in ${t.seconds} s: ${t.passage.replace(/\s+/g, " ").slice(0, 260)}…`);
  for (const p of t.own.parts) say(`   ${p.name} (${p.how}${p.die ? `, ${p.die.said}` : ""})${p.changes.length ? `: ${p.changes.join(" ")}` : ""}`);
  return t;
}
const seats = (t: Told): string => t.own.run.seats.map((s: any) => `${s.id === "host" ? "host" : "guest"}:${s.sheet.name}`).join(",");

const one = await round([[guest, seatLine(gp?.name ?? "Brother Fenn", gp?.who ?? "")], [host, "I crouch by the overturned cart and look for whoever was driving it."]]);
check(seats(one) === "host:Ysolde,guest:Brother Fenn", `two seats, the host's own and the guest's (${seats(one)})`);
check(one.own.run.seats[1]?.id === guestId && one.own.run.seats[1].sheet.items.length > 0, "the guest's sheet was written from their persona's page");
check(one.lines.some((p) => p.seat === "host" && p.how === "played" && p.die), "the host's line was judged and rolled, though the room tags it like a guest's");
check(one.lines.some((p) => p.seat === guestId && p.how === "joined"), "the guest's first line seated them");
check(/Fenn/.test(one.passage), "the passage brings the guest's character into the scene");

const two = await round([[guest, "I hurry up, puffing, and bring my staff down hard across the nearest threat's weapon arm."], [host, "I put my back to the cart and jab my spear at whatever comes at me."]]);
check(two.lines.filter((p) => p.how === "played" && p.die).length === 2, "both players' lines were rolled, each its own die");
check(seats(two) === "host:Ysolde,guest:Brother Fenn", "still two seats");
check(JSON.stringify(two.own).length < 200_000, `what travels to a guest is small enough for a relay (${Math.round(JSON.stringify(two.own).length / 1024)} KB)`);

const three = await round([[guest, "I look around slowly and say aloud what I see and smell here."], [host, "How hurt am I, and what do I have on me?"]]);
check(three.lines.some((p) => p.seat === "host" && p.how === "answered" && p.reply), "a question is answered to the one who asked");
check(three.lines.some((p) => p.seat === guestId && p.how === "played"), "while the other player's line is played");

say(failed.length ? `${failed.length} FAILED:\n  ${failed.join("\n  ")}` : "ALL OK: a table for two plays in a real Lumiverse room.");
process.exit(failed.length ? 1 : 0);
