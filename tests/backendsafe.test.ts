import { expect, test } from "bun:test";

/**
 * Lumiverse reads an extension's backend before running it and refuses one that reaches for the system: the
 * process's environment, files, sockets, child processes. The game's own code is part of the backend now (the host of
 * a table for several plays it there), so a stray `process.env` anywhere in src/game or src/engine stops the whole
 * extension from installing. These are the refusals that can be told from the bundle's text.
 */
const REFUSED: [string, RegExp][] = [
  ["the process's environment or control", /\bprocess\.(?:env|exit|kill|chdir|dlopen)\b/],
  ["Bun's system calls", /\bBun\.(?:file|write|spawn|spawnSync|serve|connect|listen)\b/],
  ["a system module", /from\s*["'`](?:node:)?(?:fs|fs\/promises|child_process|net|tls|dgram|http|https|worker_threads|cluster|bun|bun:sqlite|node:sqlite)["'`]/],
];

test("the backend bundle has nothing in it that Lumiverse refuses to run", async () => {
  const built = await Bun.build({ entrypoints: ["./src/backend.ts"], target: "browser", format: "esm", splitting: false });
  expect(built.success).toBe(true);
  const text = await built.outputs[0]!.text();
  for (const [what, re] of REFUSED) {
    const at = re.exec(text);
    expect(at ? `${what}: …${text.slice(Math.max(0, at.index - 60), at.index + 60)}…` : "").toBe("");
  }
});
