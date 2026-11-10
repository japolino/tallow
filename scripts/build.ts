/**
 * Builds the two Spindle bundles in dist/: backend.js and frontend.js. Each is one self-contained ES module, because
 * the host loads the frontend from a single file. The room's model files (assets/models/*.glb) go inside the frontend
 * bundle, so the room needs nothing fetched at run time.
 *
 *   bun run build
 */
import { readdirSync, readFileSync } from "node:fs";
import type { BunPlugin } from "bun";

/** `import { MODELS } from "tallow:models"`: every .glb in assets/models, as base64, by file name. */
const models: BunPlugin = {
  name: "tallow-models",
  setup(b) {
    b.onResolve({ filter: /^tallow:models$/ }, () => ({ path: "tallow:models", namespace: "tallow" }));
    b.onLoad({ filter: /.*/, namespace: "tallow" }, () => {
      const files = readdirSync("assets/models").filter((f) => f.endsWith(".glb"));
      const entries = files.map((f) => `${JSON.stringify(f)}: ${JSON.stringify(readFileSync(`assets/models/${f}`).toString("base64"))}`);
      return { contents: `export const MODELS = {${entries.join(",")}};`, loader: "js" };
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
