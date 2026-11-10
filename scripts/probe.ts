/**
 * Ask the running room a question from the command line:
 *   bun scripts/probe.ts "t=12.5" "room.stats()"
 * Opens the preview with the first argument as its query, runs the second as an expression in the page, and prints
 * what it gives back. With a third argument, also saves a picture there.
 */
import { withPage } from "./browser.js";

const [query = "", expression = "room.stats()", file] = process.argv.slice(2);
await withPage({ soft: process.env.SOFT === "1" }, async (page) => {
  await page.open(query);
  console.log(JSON.stringify(await page.run(expression), null, 1));
  if (file) await page.shot(file);
  if (page.problems.length) console.log([...new Set(page.problems)].join("\n"));
});
process.exit(0);
