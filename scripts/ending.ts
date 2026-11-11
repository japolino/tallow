/**
 * Plays a whole story with the built extension (dist/frontend.js) in the pretend host (preview/host.ts), the way a
 * player would, and looks at what happens when it is over (docs/DESIGN.md, 1.3): a knack if it was won, the cards
 * gathered back into the deck, "Another story?", and, when you write that you are done, goodnight and the room closed.
 * Then it sits down again and checks that you are who you were. Pictures go to .artifacts/ending/.
 *
 *   bun run build && bun scripts/ending.ts
 *   STORY=mystery bun scripts/ending.ts     which kind of story to ask for (default: a heist)
 *   CARD=world bun scripts/ending.ts        another of the pretend host's cards
 */
import { withPage } from "./browser.js";

const W = 1280, H = 800;
const CARD = process.env.CARD ?? "maren";
const STORY = process.env.STORY ?? "heist";
const OUT = `.artifacts/ending/${CARD}-${STORY}`;
let failed = 0;
const check = (what: string, ok: boolean, detail = ""): void => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `  (${detail})` : ""}`);
};
const LINES: Record<string, string> = { talk: "I ask them kindly to let me by", sneak: "I creep past quietly", force: "I shove my way through", pay: "I pay what they ask" };

await withPage({ port: Number(process.env.TALLOW_PORT ?? 4187), width: W, height: H }, async (page) => {
  const port = Number(process.env.TALLOW_PORT ?? 4187);
  const go = async (): Promise<void> => {
    await page.run(`location.href = location.origin.startsWith("http") ? "/host?card=${CARD}" : "http://localhost:${port}/host?card=${CARD}"`);
    await page.wait(800);
    for (let i = 0; i < 100 && !(await page.run<boolean>("!!window.hostReady").catch(() => false)); i++) await page.wait(100);
  };
  await go();
  await page.run("localStorage.clear()");
  const shot = (n: string) => page.shot(`${OUT}/${n}.jpg`);
  const spot = (expr: string): Promise<{ x: number; y: number }> =>
    page.run(`(() => { const v = (${expr}).clone().project(room.camera); const r = document.querySelector("canvas") ?? [...document.querySelectorAll("div")].map((d) => d.shadowRoot?.querySelector("canvas")).find(Boolean); const b = r.getBoundingClientRect(); return { x: b.left + ((v.x + 1) / 2) * b.width, y: b.top + ((1 - v.y) / 2) * b.height }; })()`);
  const click = async (at: { x: number; y: number }): Promise<void> => {
    await page.mouse("move", at.x, at.y);
    await page.wait(200);
    await page.mouse("down", at.x, at.y);
    await page.mouse("up", at.x, at.y);
  };
  const sitDown = async (): Promise<void> => {
    await click(await page.middle("#sit"));
    for (let i = 0; i < 150 && !(await page.run<boolean>("!!window.room").catch(() => false)); i++) await page.wait(100);
    await page.run("window.room.ready");
    await page.run("room.paused = false").catch(() => {});
  };
  const write = async (line: string): Promise<void> => {
    await click(await spot('room.desk.where("book")'));
    await page.wait(500);
    await page.type(line);
    await page.wait(300);
    await page.key("Enter");
    await listen();
    console.log(`     wrote "${line}"`);
  };
  /** Everything the narrator has said, as it was seen, so a line hurried past is still known to have been said. */
  const heard: string[] = [];
  const said = (s: string): boolean => heard.some((h) => h.includes(s));
  // Listened for in the page itself, often, so a line hurried past between two looks from here is not missed.
  const listen = async (): Promise<void> => {
    const got = await page.run<string[]>(`(() => {
      if (!window.heardAll) { window.heardAll = []; setInterval(() => { const t = window.room?.desk?.voice.text; if (t && window.heardAll[window.heardAll.length - 1] !== t) window.heardAll.push(t); }, 30); }
      return window.heardAll.splice(0);
    })()`).catch(() => [] as string[]);
    for (const t of got) if (heard[heard.length - 1] !== t) heard.push(t);
  };
  const ASKED = "room.desk.inviting && room.desk.mode === 'idle' && !room.desk.voice.speaking && !room.desk.onDie && !room.desk.cards.choosing";
  /** Hurry the narrator and set pages down until a thing is true. */
  const until = async (cond: string, ms = 30000, hurry = true): Promise<boolean> => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await listen();
      if (await page.run<boolean>(`!!(${cond})`).catch(() => false)) return true;
      if (!hurry) await page.wait(100);
      else if (await page.run<boolean>("room.desk.voice.speaking")) await page.type(" ");
      else if (await page.run<boolean>("room.desk.mode === 'holding'")) await page.key("Enter");
      await page.wait(150);
    }
    return false;
  };

  await sitDown();
  await listen();
  check("the narrator offers every kind of story", await until("room.desk.voice.text.includes('a heist') && room.desk.voice.text.includes('a night to survive')", 20000), await page.run<string>("room.desk.voice.text.slice(0, 120)"));
  await until(ASKED);
  await shot("01-asked");
  await write(`a ${STORY}, please`);
  // Not hurried here: the line that says which story the dice drew is the one being checked.
  await until(`room.desk.voice.text.includes('who are you')`, 40000, false);
  check("the story drawn is said", said(", then."), heard.find((h) => h.includes(", then.")) ?? heard.slice(-2).join(" / "));
  await until(ASKED);
  await write("I am Bram, a blacksmith from the hill farms");
  check("the road is dealt", await until("room.desk.cards.road.size > 3", 40000));
  await page.wait(1500);
  await shot("02-dealt");
  const title = await page.run<string>("room.opts.map.title");
  console.log(`     the road: ${title}`);

  // Play it through, the way the table check does: hurry the narrator, set pages down, touch a card at a fork or an
  // offer, throw the die, and write the likeliest way past.
  const t0 = Date.now();
  let lineAt = 0;
  for (;;) {
    if (Date.now() - t0 > 12 * 60_000) break;
    await listen();
    const stage = await page.run<string>("window.director?.stage ?? ''");
    if (stage === "over") break;
    const speaking = await page.run<boolean>("room.desk.voice.speaking");
    const mode = await page.run<string>("room.desk.mode");
    if (speaking) await page.type(" ");
    else if (mode === "holding") await page.key("Enter");
    else if (await page.run<boolean>("!!room.desk.cards.choosing && !!room.desk.cards.laid(0)")) {
      await page.wait(600);
      await click(await spot("room.desk.cards.laid(0)"));
    } else if (await page.run<boolean>("!!room.desk.onDie && room.desk.mode === 'idle' && room.desk.glance.k < 0.02")) {
      await page.wait(800);
      await click(await spot('room.desk.where("box")'));
      await page.wait(2800);
      await page.mouse("move", W * 0.55, H * 0.5);
      await page.mouse("move", W * 0.6, H * 0.45);
      await page.mouse("down", W * 0.6, H * 0.45);
      await page.mouse("up", W * 0.6, H * 0.45);
    } else if (mode === "idle" && (await page.run<boolean>("room.desk.inviting && !room.desk.onDie")) && Date.now() - lineAt > 1500) {
      let line = "I press on";
      if (stage === "camp") line = (await page.run<number>("window.director.trip.sheet.health")) <= 2 ? "I rest and eat something" : "I press on";
      else if (stage === "write") {
        // A careful player: the open way with the lowest number to reach for this hero, using a thing there for it.
        const pick = await page.run<{ way: string; words: string | null } | null>(`(() => {
          const m = window.director?.trip.facing?.moment; if (!m) return null;
          const STATS = ${JSON.stringify({ talk: ["charm", "brawn", "guile", "wits", "power"], sneak: ["grace", "guile", "wits", "sense", "power"], force: ["brawn", "grace", "power"], pay: ["wits", "charm"] })};
          let best = null;
          for (const [way, w] of Object.entries(m.stop.ways)) {
            if (m.closed.includes(way) || (way === "pay" && m.sheet.supplies < (w.price ?? 0))) continue;
            const stat = Math.max(...STATS[way].map((s) => m.sheet.stats[s] ?? 0));
            const lever = m.stop.levers.find((l) => l.way === way && !m.spent.includes(l.id));
            const score = 3 * w.difficulty - stat - (lever ? 3 : 0);
            if (!best || score < best.score) best = { way, words: lever?.words?.[0] ?? null, score };
          }
          return best;
        })()`);
        if (pick) line = pick.words ? `${LINES[pick.way]}, using the ${pick.words}` : LINES[pick.way]!;
      }
      await write(line);
      lineAt = Date.now();
    }
    await page.wait(150);
  }
  const end = await page.run<{ over: string | null; visited: string[] }>("(() => ({ over: window.director.trip.over, visited: window.director.trip.visited }))()");
  check("the story gets to an end", !!end.over, JSON.stringify(end));
  await until("room.desk.voice.text.includes('That is the adventure')", 20000);
  await shot("03-the-end");

  // After the end.
  if (end.over === "won") {
    check("a story won is rewarded with a knack", await until("!!room.desk.cards.choosing && !!room.desk.cards.laid(0)", 30000));
    await page.wait(1200);
    await shot("04-reward");
    await click(await spot("room.desk.cards.laid(0)"));
  }
  check("the cards are gathered back into the deck", await until("room.desk.cards.road.size === 0 && room.desk.cards.side.length === 0", 40000), `${await page.run("room.desk.cards.road.size")} on the map, ${await page.run("room.desk.cards.side.length")} on your side`);
  check("and the narrator asks for another story", await until("room.desk.voice.text.includes('Another story?')", 30000), await page.run<string>("room.desk.voice.text.slice(0, 100)"));
  await until(ASKED);
  await page.wait(800);
  await shot("05-another");
  const hero = await page.run<string>("(() => { const k = Object.keys(localStorage).find((k) => k.startsWith('tallow:hero:')); return k ? localStorage.getItem(k) : ''; })()");
  check("who you are is kept", hero.includes('"played"') && hero.includes("Bram"), hero.slice(0, 120));
  await write("I'm done for tonight");
  check("goodnight", await until("room.desk.voice.text.includes('all for tonight')", 20000));
  await shot("06-goodnight");
  const OPEN = "[...document.querySelectorAll('div')].some((d) => d.shadowRoot?.querySelector('.tl-layer.open'))";
  check("and the room closes", await until(`!(${OPEN})`, 20000));
  console.log(`     the narrator said, after the end:\n       ${heard.slice(heard.findIndex((h) => h.includes("That is the adventure")) >= 0 ? heard.findIndex((h) => h.includes("That is the adventure")) : -8).join("\n       ")}`);

  // Sit down again: you are back, and not asked who you are.
  await page.run("window.room = null");
  await sitDown();
  check("sitting down again, you are greeted as yourself", await until("room.desk.voice.text.includes('You are back')", 20000), await page.run<string>("room.desk.voice.text.slice(0, 120)"));
  await until(ASKED);
  await shot("07-back");
  const problems = page.problems.filter((p) => !/GPU stall|GL Driver|WebGL|no model in the pretend host|fell back/.test(p));
  check("no errors in the page", problems.length === 0, problems.slice(0, 4).join(" | "));
  console.log(`${failed ? `${failed} FAILED` : "all passed"} in ${Math.round((Date.now() - t0) / 1000)} s`);
});
process.exit(failed ? 1 : 0);
