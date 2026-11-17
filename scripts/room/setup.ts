/**
 * Sets the throwaway Lumiverse (scripts/room/start.ts) up for a table for two: this branch of Tallow installed as
 * committed, a host and a guest account with a persona each, the host's models, a small world, and a freeform room
 * on a new chat of it. Importing this does it; what was made is exported for the checks (check.ts, seats.ts).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const repo = resolve(import.meta.dir, "../..");
export const root = join(repo, ".artifacts/room-check");
export const base = `http://localhost:${process.env.PORT || "7871"}`;
const forward = `http://127.0.0.1:${process.env.FORWARD_PORT || 8399}/v1`;
const t0 = Date.now();
export const say = (s: string): void => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${s}`);
export const failed: string[] = [];
export const check = (ok: boolean, what: string): void => {
  say(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed.push(what);
};

/* ------------------------------------------------- the API, as an account ------------------------------------------------- */

const cookies = new Map<string, string>();
export async function login(user: string): Promise<string> {
  const have = cookies.get(user);
  if (have) return have;
  const password = readFileSync(join(root, user === "host" ? "owner.txt" : "guest.txt"), "utf8").trim();
  const r = await fetch(`${base}/api/auth/sign-in/username`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ username: user, password }) });
  if (!r.ok) throw new Error(`sign-in as ${user}: ${r.status} ${await r.text()}`);
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  cookies.set(user, cookie);
  return cookie;
}
export async function api(user: string, method: string, path: string, body?: unknown): Promise<any> {
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
  // Lumiverse's own update: the clone is reset to this repository's branch and built again.
  await api("host", "POST", `/api/v1/spindle/${ext.id}/update`);
}
export const running = listOf(await api("host", "GET", "/api/v1/spindle")).find((e) => e.identifier === "tallow");
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
export const character = await api("host", "POST", "/api/v1/characters", {
  name: "The Marrow Road",
  description: "A low-fantasy borderland. The Marrow Road runs from the river town of Hask through pine hills to the old watchtower at Crane's Rest. Goblins scavenge the ditches, a toll gang holds the stone bridge, and the innkeeper Dalla at the Split Kettle pays coin for news and for trouble dealt with. Magic is rare and costly. Coin is copper pennies.",
  scenario: "The story begins on the road at dusk, an hour's walk from the Split Kettle inn, where a cart lies overturned in the ditch.",
  first_mes: "",
});
const chat = await api("host", "POST", "/api/v1/chats", { character_id: character.id });
const made = await api("host", "POST", "/api/v1/multiplayer/rooms", { chat_id: chat.id, turn_strategy: "freeform" });
export const roomId = made.roomId as string, chatId = made.chatId as string;
say(`room ${roomId} on chat ${chatId}`);

