/**
 * Builds the two Spindle bundles in dist/: backend.js and frontend.js. Each is one self-contained ES module, because
 * the host loads the frontend from a single file. The room's model files (assets/models/*.glb) and its recorded sounds
 * (assets/sounds/*.mp3, the ones listed in src/room/soundfiles.ts) go inside the frontend bundle, so the room needs
 * nothing fetched at run time but the music.
 *
 *   bun run build
 */
import { readdirSync, readFileSync } from "node:fs";
import type { BunPlugin } from "bun";
import { SOUND_FILES } from "../src/room/soundfiles.js";

const embed = (dir: string, files: readonly string[]): string =>
  files.map((f) => `${JSON.stringify(f)}: ${JSON.stringify(readFileSync(`${dir}/${f}`).toString("base64"))}`).join(",");

/**
 * `import { MODELS } from "tallow:models"`: every .glb in assets/models, as base64, by file name.
 * `import { SOUNDS } from "tallow:sounds"`: the recordings in assets/sounds, the same way.
 */
const models: BunPlugin = {
  name: "tallow-models",
  setup(b) {
    b.onResolve({ filter: /^tallow:(models|sounds)$/ }, (a) => ({ path: a.path, namespace: "tallow" }));
    b.onLoad({ filter: /.*/, namespace: "tallow" }, (a) => {
      if (a.path === "tallow:sounds") return { contents: `export const SOUNDS = {${embed("assets/sounds", SOUND_FILES)}};`, loader: "js" };
      const files = readdirSync("assets/models").filter((f) => f.endsWith(".glb"));
      return { contents: `export const MODELS = {${embed("assets/models", files)}};`, loader: "js" };
    });
  },
};

for (const [entry, out] of [
  ["./src/backend.ts", "backend.js"],
  ["./src/frontend.ts", "frontend.js"],
] as const) {
  const result = await Bun.build({ entrypoints: [entry], outdir: "./dist", naming: out, target: "browser", format: "esm", minify: true, splitting: false, plugins: [models] });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  const size = result.outputs.reduce((n, o) => n + o.size, 0);
  console.log(`dist/${out}  ${(size / 1024).toFixed(0)} KB`);
}
