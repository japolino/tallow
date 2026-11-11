/**
 * The room's models and sounds kept in src/embedded/ (scripts/embed.ts): they are what an install from GitHub builds
 * with, so they must be just what the assets are now.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { EMBEDDED } from "../scripts/embed.js";

test("the embedded models and sounds match the assets (run `bun run embed` if not)", () => {
  for (const [path, make] of Object.entries(EMBEDDED)) expect(readFileSync(path, "utf8") === make()).toBe(true);
});

test("the frontend imports them as plain modules, so a plain bun build needs nothing of ours", () => {
  const src = readFileSync("src/frontend.ts", "utf8");
  expect(src).not.toMatch(/from "tallow:/);
  expect(src).toContain('from "./embedded/models.js"');
});
