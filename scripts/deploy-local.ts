/**
 * Copy the built extension into a local Lumiverse install, to try it there.
 *
 *   bun run build && bun scripts/deploy-local.ts [D:/Lumiverse]
 *
 * The first time, then use Lumiverse's "Import local extensions" (the owner can) to register it, and turn it on.
 * Later: restart the extension and refresh the page. The copied manifest gets `dev_mode: true`, so a host update never
 * resets the local copy. Nothing is granted here: Lumiverse asks you for each permission itself.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const host = process.argv[2] ?? "D:/Lumiverse";
const home = join(host, "data", "extensions", "tallow");
const target = join(home, "repo");
if (!existsSync(join(host, "data", "extensions"))) {
  console.error(`No extensions folder under ${host}/data`);
  process.exit(1);
}
if (!existsSync("dist/backend.js") || !existsSync("dist/frontend.js")) {
  console.error("Build first: bun run build");
  process.exit(1);
}
mkdirSync(join(target, "dist"), { recursive: true });
cpSync("dist", join(target, "dist"), { recursive: true });
cpSync("package.json", join(target, "package.json"));
const manifest = JSON.parse(readFileSync("spindle.json", "utf8")) as Record<string, unknown>;
manifest.dev_mode = true;
writeFileSync(join(target, "spindle.json"), JSON.stringify(manifest, null, 2));
mkdirSync(join(home, "storage"), { recursive: true });
console.log(`Copied to ${target}. In Lumiverse: Extensions, "Import local extensions", then turn Tallow on.`);
