/**
 * Writes every card on the cards page (preview/cards.ts) as a picture of its own, into the git-ignored
 * .artifacts/cards/, at the size it is drawn: for looking at the art closely, and for showing a card to something
 * that paints (a deck's own cards are the reference its other pictures are made to match).
 *
 *   bun scripts/card-shots.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { withPage } from "./browser.js";

const port = Number(process.env.TALLOW_PORT ?? 4189);
mkdirSync(".artifacts/cards", { recursive: true });
await withPage({ port, width: 900, height: 700 }, async (page) => {
  await page.run(`location.href = "http://127.0.0.1:${port}/cards"`);
  for (let i = 0; i < 150 && !(await page.run<boolean>("!!window.drawn && location.pathname === '/cards'").catch(() => false)); i++) await page.wait(100);
  const n = await page.run<number>("document.querySelectorAll('canvas').length");
  for (let i = 0; i < n; i++) {
    const url = await page.run<string>(`document.querySelectorAll('canvas')[${i}].toDataURL('image/png')`);
    writeFileSync(`.artifacts/cards/${String(i).padStart(2, "0")}.png`, Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
  }
  console.log(`${n} cards in .artifacts/cards/`);
});
// The preview server this started would keep the script alive.
process.exit(0);
