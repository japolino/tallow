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
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { seatLine } from "../../src/shared/tablewire.js";

const repo = resolve(import.meta.dir, "../..");
const root = join(repo, ".artifacts/room-check");
const base = `http://localhost:${process.env.PORT || "7871"}`;
const forward = `http://127.0.0.1:${process.env.FORWARD_PORT || 8399}/v1`;
const t0 = Date.now();
const say = (s: string): void => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${s}`);
const failed: string[] = [];
const check = (ok: boolean, what: string): void => {
  say(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed.push(what);
};

/* ------------------------------------------------- the API, as an account ------------------------------------------------- */

const cookies = new Map<string, string>();
async function login(user: string): Promise<string> {
  const have = cookies.get(user);
  if (have) return have;
  const password = readFileSync(join(root, user === "host" ? "owner.txt" : "guest.txt"), "utf8").trim();
  const r = await fetch(`${base}/api/auth/sign-in/username`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ username: user, password }) });
  if (!r.ok) throw new Error(`sign-in as ${user}: ${r.status} ${await r.text()}`);
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  cookies.set(user, cookie);
  return cookie;
}
async function api(user: string, method: string, path: string, body?: unknown): Promise<any> {
  const r = await fetch(`${base}${path}`, { method, headers: { Cookie: await login(user), Origin: base, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await r.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* Not JSON: the text is the answer. */
  }
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 300)}`);
  return parsed;
}

/** A list, however the API wraps it. */
const listOf = (x: any): any[] => (Array.isArray(x) ? x : (x?.data ?? x?.extensions ?? x?.items ?? x?.users ?? []));

/* ------------------------------------------------- setting it up ------------------------------------------------- */

const git = (args: string[], cwd: string): string => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};

// This working copy's branch, as the throwaway's extension.
const clone = join(root, "data/extensions/tallow/repo");
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], repo);
if (git(["status", "--porcelain", "--", "src", "spindle.json"], repo)) say("note: src/ has changes that are not committed; the throwaway installs what is committed");
let ext = listOf(await api("host", "GET", "/api/v1/spindle")).find((e) => e.identifier === "tallow");
if (!ext) {
  mkdirSync(join(root, "data/extensions/tallow"), { recursive: true });
  if (!existsSync(clone)) git(["clone", "-q", "--branch", branch, repo, clone], root);
  const got = await api("host", "POST", "/api/v1/spindle/import-local");
  ext = got.imported?.[0];
  if (!ext) throw new Error(`Lumiverse would not take the extension: ${JSON.stringify(got.skipped)}`);
  await api("host", "POST", `/api/v1/spindle/${ext.id}/permissions`, { grant: ext.permissions });
  await api("host", "POST", `/api/v1/spindle/${ext.id}/enable`);
} else {
  git(["fetch", "-q", "origin", branch], clone);
  git(["reset", "-q", "--hard", `origin/${branch}`], clone);
  rmSync(join(clone, "dist"), { recursive: true, force: true });
  await api("host", "POST", `/api/v1/spindle/${ext.id}/restart`);
}
const running = listOf(await api("host", "GET", "/api/v1/spindle")).find((e) => e.identifier === "tallow");
check(running?.status === "running", `Lumiverse runs Tallow's backend (${git(["log", "--oneline", "-1"], clone)})`);
if (running?.status !== "running") process.exit(1);

// The host's models: a strong one for everything, a fast one for reading.
let conns = listOf(await api("host", "GET", "/api/v1/connections"));
if (!conns.length) {
  const strong = await api("host", "POST", "/api/v1/connections", { name: "Strong", provider: "custom", api_url: forward, model: process.env.CHAT_MODEL_STRONG, is_default: true, api_key: "local" });
  const fast = await api("host", "POST", "/api/v1/connections", { name: "Fast", provider: "custom", api_url: forward, model: process.env.CHAT_MODEL_FAST, api_key: "local" });
  const dir = join(root, "data/users", strong.user_id, "extensions/tallow");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "models.json"), JSON.stringify({ roles: { reader: { connectionId: fast.id } } }));
  conns = [strong, fast];
}
const tried = await api("host", "POST", `/api/v1/connections/${conns.find((c: any) => c.is_default)?.id ?? conns[0].id}/test`);
check(tried.success === true, "the model endpoint answers (scripts/room/forward.ts is running)");
if (!tried.success) process.exit(1);

// A guest account, a persona each, a small world, and a freeform room on a new chat of it.
const users = listOf(await api("host", "GET", "/api/v1/users"));
if (!users.some((u) => u.username === "guest")) await api("host", "POST", "/api/v1/users", { username: "guest", password: readFileSync(join(root, "guest.txt"), "utf8").trim(), role: "user" });
const personas = async (user: string, name: string, description: string): Promise<void> => {
  const have = await api(user, "GET", "/api/v1/personas");
  if (!listOf(have).some((p) => p.name === name)) await api(user, "POST", "/api/v1/personas", { name, description, is_default: true });
};
await personas("host", "Ysolde", "Ysolde, a wiry former caravan guard in her thirties, quick with a short spear and quicker to haggle. Blunt, loyal, afraid of deep water. Carries a short spear, a waxed cloak and eleven copper pennies.");
await personas("guest", "Brother Fenn", "Brother Fenn, a plump wandering friar with a gift for talking people round and a weakness for good ale. Knows herbs and wounds. Carries a walking staff, a satchel of herbs and a tin cup.");
const character = await api("host", "POST", "/api/v1/characters", {
  name: "The Marrow Road",
  description: "A low-fantasy borderland. The Marrow Road runs from the river town of Hask through pine hills to the old watchtower at Crane's Rest. Goblins scavenge the ditches, a toll gang holds the stone bridge, and the innkeeper Dalla at the Split Kettle pays coin for news and for trouble dealt with. Magic is rare and costly. Coin is copper pennies.",
  scenario: "The story begins on the road at dusk, an hour's walk from the Split Kettle inn, where a cart lies overturned in the ditch.",
  first_mes: "",
});
const chat = await api("host", "POST", "/api/v1/chats", { character_id: character.id });
const made = await api("host", "POST", "/api/v1/multiplayer/rooms", { chat_id: chat.id, turn_strategy: "freeform" });
const roomId = made.roomId as string, chatId = made.chatId as string;
say(`room ${roomId} on chat ${chatId}`);

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
