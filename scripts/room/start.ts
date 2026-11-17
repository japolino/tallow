/**
 * A throwaway Lumiverse for trying a table for several in a real room, without touching your own install: its own
 * data folder (.artifacts/room-check, git-ignored), its own port, started from Lumiverse's source. It runs from that
 * folder, so the real install's .env and data are never read or written.
 *
 *   bun --no-env-file scripts/room/start.ts          (or the "room-check" entry of .claude/launch.json)
 *   bun --env-file=.env.local scripts/room/forward.ts
 *   bun --env-file=.env.local scripts/room/check.ts
 *
 * LUMIVERSE_DIR is where Lumiverse's source is (default: the folder this repository sits in).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dir, "../../.artifacts/room-check");
const lumiverse = resolve(process.env.LUMIVERSE_DIR ?? join(import.meta.dir, "../../.."));
mkdirSync(join(root, "data"), { recursive: true });
// Passwords made here, for this folder's two test accounts only.
for (const f of ["owner.txt", "guest.txt"]) if (!existsSync(join(root, f))) writeFileSync(join(root, f), `T-${crypto.randomUUID()}`);
process.chdir(root);
Object.assign(process.env, {
  DATA_DIR: join(root, "data"),
  PORT: process.env.PORT || "7871",
  OWNER_USERNAME: "host",
  OWNER_PASSWORD: readFileSync(join(root, "owner.txt"), "utf8").trim(),
  FRONTEND_DIR: join(lumiverse, "frontend/dist"),
  LUMIVERSE_FORCE_BUN_WORKERS: "1",
  LUMIVERSE_FORCE_SPINDLE_ASYNC_BUN: "1",
});
await import(pathToFileURL(join(lumiverse, "src/index.ts")).href);
