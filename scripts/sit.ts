/**
 * Tries the built extension (dist/frontend.js) in the pretend host (preview/host.ts): presses "Sit at the table",
 * answers the narrator's two questions in the notebook, and checks that the adventure is built, its map drawn and its
 * road dealt. There is no model in the pretend host, so the stand-ins answer and the made-up adventure is played with
 * the card's character in it. Pictures go to .artifacts/sit/.
 *
 *   bun run build && bun scripts/sit.ts
 */
import { withPage } from "./browser.js";

const W = 1280, H = 800;
let failed = 0;
const check = (what: string, ok: boolean, detail = ""): void => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `  (${detail})` : ""}`);
};

await withPage({ port: Number(process.env.TALLOW_PORT ?? 4187), width: W, height: H }, async (page) => {
  await page.run(`location.href = location.origin.startsWith("http") ? "/host" : "http://localhost:${Number(process.env.TALLOW_PORT ?? 4187)}/host"`);
  for (let i = 0; i < 100 && !(await page.run<boolean>("!!window.hostReady").catch(() => false)); i++) await page.wait(100);
  check("the bundle loads in the host and adds its button", await page.run<boolean>("!!document.querySelector('#sit')"));
  const b = await page.middle("#sit");
  await page.mouse("move", b.x, b.y);
  await page.mouse("down", b.x, b.y);
  await page.mouse("up", b.x, b.y);
  for (let i = 0; i < 150 && !(await page.run<boolean>("!!window.room").catch(() => false)); i++) await page.wait(100);
  check("a click opens the room over the page", await page.run<boolean>("!!window.room"));
  await page.run("window.room.ready");
  const shot = (n: string) => page.shot(`.artifacts/sit/${n}.jpg`);
  const until = async (cond: string, ms = 30000): Promise<boolean> => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await page.run<boolean>(`!!(${cond})`).catch(() => false)) return true;
      if (await page.run<boolean>("room.desk.voice.speaking")) await page.type(" ");
      else if (await page.run<boolean>("room.desk.mode === 'holding'")) await page.key("Enter");
      await page.wait(150);
    }
    return false;
  };
  const write = async (line: string): Promise<void> => {
    const v = await page.run<{ x: number; y: number }>(`(() => { const v = room.desk.where("book").project(room.camera); const r = document.querySelector("canvas") ?? [...document.querySelectorAll("div")].map((d) => d.shadowRoot?.querySelector("canvas")).find(Boolean); const b = r.getBoundingClientRect(); return { x: b.left + ((v.x + 1) / 2) * b.width, y: b.top + ((1 - v.y) / 2) * b.height }; })()`);
    await page.mouse("move", v.x, v.y);
    await page.wait(150);
    await page.mouse("down", v.x, v.y);
    await page.mouse("up", v.x, v.y);
    await page.wait(500);
    await page.type(line);
    await page.wait(300);
    await page.key("Enter");
  };
  const ASKED = "room.desk.inviting && room.desk.mode === 'idle' && !room.desk.voice.speaking";
  check("the narrator greets you by the card's character", await until("room.desk.voice.speaking && room.desk.voice.text.includes('Maren')", 15000));
  await shot("01-greeting");
  check("and asks which story", await until(ASKED));
  await write("a rescue, please");
  check("then who you are", await until(`${ASKED} && room.desk.voice.text.includes('who are you') || room.desk.voice.text.includes('who are you')`));
  await until(ASKED);
  await write("I am Bram, a blacksmith from the hill farms");
  check("the road is dealt", await until("room.desk.cards.road.size > 3", 40000), String(await page.run("room.desk.cards.road.size")));
  check("on a map drawn for the adventure", (await page.run<string>("room.opts.map.title")).length > 0, await page.run<string>("room.opts.map.title"));
  await page.wait(2500);
  await shot("02-dealt");
  check("the card's character lies on your side", await until("room.desk.cards.side.length >= 2", 30000), String(await page.run("room.desk.cards.side.length")));
  check("and you are handed the first page", await until("room.desk.mode === 'holding'", 60000));
  await page.wait(1200);
  await shot("03-first-page");
  const problems = page.problems.filter((p) => !/GPU stall|GL Driver|WebGL|no model in the pretend host|fell back/.test(p));
  check("no errors in the page", problems.length === 0, problems.slice(0, 4).join(" | "));
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
