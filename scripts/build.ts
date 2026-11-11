/**
 * Builds the two Spindle bundles in dist/: backend.js and frontend.js. Each is one self-contained ES module, because
 * the host loads the frontend from a single file. The room's model files and recorded sounds go inside the frontend
 * bundle from src/embedded/, written fresh first (scripts/embed.ts), so the room needs nothing fetched at run time but
 * the music. Nothing here is needed to install: Lumiverse builds src/ with a plain `bun build`, and it comes out the same.
 *
 *   bun run build
 */
import { spawnSync } from "node:child_process";

// The models and sounds, written into src/embedded/ fresh (scripts/embed.ts), so the bundle never carries stale ones.
if (spawnSync("bun", ["run", "scripts/embed.ts"], { stdio: "inherit" }).status !== 0) process.exit(1);

for (const [entry, out] of [
  ["./src/backend.ts", "backend.js"],
  ["./src/frontend.ts", "frontend.js"],
] as const) {
  const result = await Bun.build({ entrypoints: [entry], outdir: "./dist", naming: out, target: "browser", format: "esm", minify: true, splitting: false });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  const size = result.outputs.reduce((n, o) => n + o.size, 0);
  console.log(`dist/${out}  ${(size / 1024).toFixed(0)} KB`);
}
