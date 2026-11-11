/**
 * Tries the built extension (dist/frontend.js) in the pretend host (preview/host.ts): presses "Sit at the table",
 * answers the narrator's two questions in the notebook, and checks that the adventure is built, its map drawn and its
 * road dealt. There is no model in the pretend host, so the stand-ins answer and the made-up adventure is played with
 * the card's character in it. Then it reloads the page in the middle of the story, sits down again and checks that the
 * sitting is taken up where it was left. Pictures go to .artifacts/sit/.
 *
 *   bun run build && bun scripts/sit.ts
 *   CARD=hangul bun scripts/sit.ts      a card whose name is written in Hangul (preview/host.ts)
 *   CARD=modern bun scripts/sit.ts      a card set in our own times, which gets the city road
 *   CARD=world bun scripts/sit.ts       a card that is a world, not a person: the story is set there, and the companion
 *                                       is someone of that world
 *   DECIDE=1 bun scripts/sit.ts        with the pretend Decision model: the story asked for, and whether to go on, are
 *                                       read by meaning first
 */
import { withPage } from "./browser.js";

const W = 1280, H = 800;
const CARD = process.env.CARD ?? "maren";
const DECIDE = !!process.env.DECIDE;
const Q = `card=${CARD}${DECIDE ? "&decide=1" : ""}`;
const NAME = ({ maren: "Maren", hangul: "하나", modern: "Ines", world: "set in Thornvale" } as Record<string, string>)[CARD] ?? "Maren";
let failed = 0;
const check = (what: string, ok: boolean, detail = ""): void => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `  (${detail})` : ""}`);
};

await withPage({ port: Number(process.env.TALLOW_PORT ?? 4187), width: W, height: H }, async (page) => {
  const port = Number(process.env.TALLOW_PORT ?? 4187);
  await page.run(`location.href = location.origin.startsWith("http") ? "/host?${Q}" : "http://localhost:${port}/host?${Q}"`);
  for (let i = 0; i < 100 && !(await page.run<boolean>("!!window.hostReady").catch(() => false)); i++) await page.wait(100);
  // A sitting left by an earlier run would be offered again: start clean.
  await page.run("localStorage.clear()");
  check("the bundle loads in the host and adds its button", await page.run<boolean>("!!document.querySelector('#sit')"));
  const sitDown = async (): Promise<void> => {
    const b = await page.middle("#sit");
    await page.mouse("move", b.x, b.y);
    await page.mouse("down", b.x, b.y);
    await page.mouse("up", b.x, b.y);
  };
  await sitDown();
  for (let i = 0; i < 150 && !(await page.run<boolean>("!!window.room").catch(() => false)); i++) await page.wait(100);
  check("a click opens the room over the page", await page.run<boolean>("!!window.room"));
  await page.run("window.room.ready");
  const shot = (n: string) => page.shot(`.artifacts/sit/${CARD}-${n}.jpg`);
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
  check("the narrator greets you by the card's character", await until(`room.desk.voice.speaking && room.desk.voice.text.includes(${JSON.stringify(NAME)})`, 15000));
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
  if (DECIDE) check("the Decision model was asked which story it is", await page.run<boolean>("window.decided.filter((w) => w === 'pick').length >= 2"), await page.run<string>("window.decided.join(', ')"));
  await page.wait(1200);
  await shot("03-first-page");
  const title = await page.run<string>("room.opts.map.title");
  console.log(`     the road: ${title}`);

  // Leave in the middle of the story (a reload), sit down again, and go on with it.
  check("the sitting is kept as it goes", await until("Object.keys(localStorage).some((k) => k.startsWith('tallow:sitting:'))", 30000));
  if (CARD === "world") {
    const party = await page.run<string>("(() => { const k = Object.keys(localStorage).find((k) => k.startsWith('tallow:sitting:')); const t = JSON.parse(localStorage.getItem(k)); return JSON.stringify((t.adv ?? t.trip?.adv).companions.map((c) => c.name)); })()").catch((e) => `unread: ${e}`);
    check("nobody in the story is called by the world's name", !party.includes("Thornvale") && !party.startsWith("unread"), party);
  }
  await page.run("location.href = location.href");
  await page.wait(1500);
  for (let i = 0; i < 100 && !(await page.run<boolean>("!!window.hostReady").catch(() => false)); i++) await page.wait(100);
  await sitDown();
  for (let i = 0; i < 150 && !(await page.run<boolean>("!!window.room").catch(() => false)); i++) await page.wait(100);
  await page.run("window.room.ready");
  check("sitting down again, you are asked whether to go on", await until("room.desk.voice.text.includes('in the middle of a story')", 20000));
  await until(ASKED);
  await write("let's go on with it");
  check("and the story is taken up where it was left", await until("room.desk.voice.text.includes('You came back') || room.desk.voice.text.includes('where you left')", 30000), await page.run<string>("room.desk.voice.text.slice(0, 80)"));
  check("on the same road", (await page.run<string>("room.opts.map.title")) === title, await page.run<string>("room.opts.map.title"));
  check("with the cards dealt again", await until("room.desk.cards.road.size > 2", 30000));
  if (DECIDE) check("and whether to go on was read by meaning", await page.run<boolean>("window.decided.includes('pick')"));
  await page.wait(1500);
  await shot("04-taken-up");
  const problems = page.problems.filter((p) => !/GPU stall|GL Driver|WebGL|no model in the pretend host|fell back/.test(p));
  check("no errors in the page", problems.length === 0, problems.slice(0, 4).join(" | "));
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
