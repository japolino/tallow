/**
 * Pictures of a table for several as you see it from your chair: the others seated beside you, and the view turned to
 * each side. In the preview room, with nobody else needed. Pictures go to .artifacts/party-shots/.
 *
 *   bun scripts/party-shots.ts
 */
import { withPage } from "./browser.js";

const OUT = ".artifacts/party-shots";
await withPage({ port: Number(process.env.TALLOW_PORT ?? 4189), width: 1280, height: 800 }, async (page) => {
  const port = Number(process.env.TALLOW_PORT ?? 4189);
  await page.cdp("Page.navigate", { url: `http://127.0.0.1:${port}/props?props=none&t=19` });
  for (let i = 0; i < 200 && !(await page.run<boolean>("!!window.room").catch(() => false)); i++) await page.wait(100);
  await page.run("window.room.ready");
  await page.run("(room.paused = true, room.advance(4), 1)");
  const seats = (n: number): string => JSON.stringify(["Brother Fenn", "Ysolde", "Maren of the Lamps", "Tom", "Ash", "Quill", "Dalla"].slice(0, n).map((name, i) => ({ id: `p${i}`, name, picture: i + 1, out: i === 3 })));
  const settle = (s = 1.6): Promise<unknown> => page.run(`room.advance(${s})`);
  await page.run(`room.party(${seats(1)})`);
  await settle();
  await page.shot(`${OUT}/1-table-one-other.jpg`);
  await page.run("room.lookAside(-1)");
  await settle();
  await page.shot(`${OUT}/2-left-one-other.jpg`);
  console.log("turned left:", await page.run("room.aside"), "and there is nobody on the right to turn to:", (await page.run("(room.lookAside(1), room.aside)")) === 0);
  await page.run(`room.party(${seats(2)})`);
  await page.run("room.lookAside(1)");
  await settle();
  await page.shot(`${OUT}/3-right-two-others.jpg`);
  await page.run(`room.party(${seats(7)})`);
  await page.run("room.lookAside(-1)");
  await settle();
  await page.shot(`${OUT}/4-left-seven-others.jpg`);
  await page.run("room.lookAside(1)");
  await settle();
  await page.shot(`${OUT}/5-right-seven-others.jpg`);
  await page.run("room.lookAside(0)");
  await settle();
  await page.shot(`${OUT}/6-table-seven-others.jpg`);
  // The pointer taken to the left edge turns you; any key turns you back.
  await page.run(`room.party(${seats(2)})`);
  await page.run("room.paused = false");
  await page.mouse("move", 640, 400);
  await page.mouse("move", 30, 380);
  await page.wait(900);
  const turned = await page.run<number>("room.aside");
  await page.shot(`${OUT}/7-pointer-at-left-edge.jpg`);
  await page.type(" ");
  await page.wait(200);
  const back = await page.run<number>("room.aside");
  // The page is a little narrower than the window: the edge is taken from the canvas itself.
  const rightEdge = (await page.run<number>("Math.round(document.querySelector('canvas').getBoundingClientRect().right)")) - 16;
  await page.mouse("move", rightEdge, 380);
  await page.wait(900);
  const right = await page.run<number>("room.aside");
  await page.mouse("move", 640, 380);
  await page.wait(200);
  console.log(`pointer at the left edge turns you left: ${turned === -1}; a key turns you back: ${back === 0}; the right edge turns you right: ${right === 1}; back in the middle, to the table: ${(await page.run<number>("room.aside")) === 0}`);
  if (page.problems.length) console.log("console:", page.problems.slice(0, 5).join(" | "));
});
process.exit(0);
