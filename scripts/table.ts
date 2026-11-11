/**
 * Plays a whole adventure in the room, in a real browser, the way a player would: writing lines in the notebook,
 * touching a card where the road splits, taking the die from the box and letting it go, setting down each page. It
 * takes pictures of the moments worth looking at (in .artifacts/table/) and checks that the adventure gets to an end.
 *
 *   bun run table                          the rescue
 *   ADV=courtship bun run table            the courtship
 *   SLOW=2500 bun run table                the stand-ins take 2.5 seconds, so the narrator's waits are seen
 *   TALLOW_PORT=4186 bun run table         serve the preview on another port
 *   PHONE=1 bun run table                  on a phone held upright (390 by 844)
 *   ADV=night-rescue bun run table         any adventure in content/adventures.ts
 */
import { withPage } from "./browser.js";

const PHONE = !!process.env.PHONE;
const W = PHONE ? 390 : 1280, H = PHONE ? 844 : 800;
const ADV = process.env.ADV ?? "rescue";
const SLOW = Number(process.env.SLOW ?? 0);
const SEED = process.env.SEED ?? "lantern";
const OUT = `.artifacts/table/${ADV}${SLOW ? "-slow" : ""}${PHONE ? "-phone" : ""}`;
let failed = 0;
const check = (what: string, ok: boolean, detail = ""): void => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `  (${detail})` : ""}`);
};

/** Lines a player might write for each way past a thing, in the plain words the stand-in reader knows. */
const LINES: Record<string, string> = {
  talk: "I ask them kindly to let me by",
  sneak: "I creep past quietly",
  force: "I shove my way through",
  pay: "I pay what they ask",
};

await withPage({ port: Number(process.env.TALLOW_PORT ?? 4187), width: W, height: H }, async (page) => {
  await page.open(`adventure=${ADV}&seed=${SEED}${SLOW ? `&slow=${SLOW}` : ""}`);
  if (PHONE) await page.size(W, H);
  await page.run("room.paused = false");
  await page.mouse("move", W / 2, H / 2);
  const dir = <T>(expr: string): Promise<T> => page.run<T>(`(() => { const d = getDirector(); return d ? (${expr}) : null; })()`);
  const shot = (name: string): Promise<void> => page.shot(`${OUT}/${name}.jpg`);
  const spot = (expr: string): Promise<{ x: number; y: number }> =>
    page.run(`(() => { const v = (${expr}).clone().project(room.camera); const r = document.querySelector("canvas").getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; })()`);
  const click = async (at: { x: number; y: number }): Promise<void> => {
    await page.mouse("move", at.x, at.y);
    await page.wait(200);
    await page.mouse("down", at.x, at.y);
    await page.mouse("up", at.x, at.y);
  };

  const shots = new Set<string>();
  /** Take a picture once, the first time a thing is true. */
  const once = async (name: string, cond: string, delay = 0): Promise<void> => {
    if (shots.has(name) || !(await page.run<boolean>(`!!(${cond})`))) return;
    shots.add(name);
    if (delay) await page.wait(delay);
    await shot(name);
    console.log(`     picture: ${name}`);
  };

  const t0 = Date.now();
  let tries = 0;
  let lastStop = "";
  let lineAt = 0;
  let lastLook = "";
  let sameSince = Date.now();
  for (;;) {
    if (Date.now() - t0 > 9 * 60_000) break;
    const stage = await dir<string>("d.stage");
    if (stage === "over" && !(await page.run<boolean>("room.desk.voice.speaking")) && (await page.run<string>("room.desk.mode")) === "idle") break;

    await once("01-dealing", "room.desk.cards.road.size > 2 && getDirector()?.stage === 'start'");
    await once("02-dealt", "getDirector()?.stage === 'start' && room.desk.voice.speaking");
    await once("03-fork-laid", "!!room.desk.cards.choosing", 900);
    await once("05-turned", "getDirector()?.stage === 'road' && room.desk.glance.k > 0.85");
    await once("07-side-card", "room.desk.cards.side.length > 0 && room.desk.mode === 'idle'", 800);
    await once("06-ways", "getDirector()?.stage === 'write' && Object.values(room.desk.ways.states).includes('open') && room.desk.mode === 'idle' && room.desk.glance.k < 0.02 && room.desk.focus.k < 0.02", 500);
    await once("08-balance", "room.desk.glance.k > 0.9 && !!room.desk.onDie");
    if (SLOW) {
      await once("04-reading", "getDirector()?.stage === 'given' && room.desk.his && room.desk.his.group.position.y > 0.3", 300);
      await once("06-musing", "getDirector()?.stage === 'told' && !room.desk.voice.speaking && room.desk.mode === 'idle'", 1200);
    }

    // When nothing has changed for a while, say what the table looks like, so a stuck run can be read.
    const look = await page.run<string>("JSON.stringify({ stage: getDirector()?.stage, mode: room.desk.mode, speaking: room.desk.voice.speaking, inviting: room.desk.inviting, onDie: !!room.desk.onDie, glance: Math.round(room.desk.glance.k * 100) / 100, choosing: !!room.desk.cards.choosing, text: room.desk.voice.text.slice(0, 60), calls: (window.tableCalls ?? []).slice(-6).join(' > ') })");
    if (look !== lastLook) { lastLook = look; sameSince = Date.now(); }
    else if (Date.now() - sameSince > 20000) { console.log(`     stuck: ${look}`); sameSince = Date.now(); }
    const speaking = await page.run<boolean>("room.desk.voice.speaking");
    const mode = await page.run<string>("room.desk.mode");
    if (speaking) {
      await page.type(" ");
    } else if (mode === "holding") {
      await page.key("Enter");
    } else if (await page.run<boolean>("!!room.desk.cards.choosing && room.desk.cards.laid(0)")) {
      // Touch the card on the right the first time, and the left after.
      const i = shots.has("fork-picked") ? 0 : 1;
      await page.wait(600);
      await click(await spot(`room.desk.cards.laid(${i})`));
      shots.add("fork-picked");
      console.log(`     touched the card on the ${i ? "right" : "left"}`);
    } else if (await page.run<boolean>("!!room.desk.onDie && room.desk.mode === 'idle' && room.desk.glance.k < 0.02")) {
      // Only once you have turned back from the balance, so the box is where the click lands.
      await page.wait(800);
      await click(await spot('room.desk.where("box")'));
      await page.wait(2800);
      await page.mouse("move", W * 0.55, H * 0.5);
      await page.mouse("move", W * 0.6, H * 0.45);
      await page.mouse("down", W * 0.6, H * 0.45);
      await page.mouse("up", W * 0.6, H * 0.45);
    } else if (mode === "idle" && (await page.run<boolean>("room.desk.inviting && !room.desk.onDie")) && Date.now() - lineAt > 1500) {
      let line = "I press on";
      if (stage === "camp") line = (await dir<number>("d.trip.sheet.health"))! <= 2 ? "I rest and eat something" : "I press on";
      else if (stage === "write") {
        const f = await dir<{ stop: string; ways: string[]; closed: string[] }>("({ stop: d.trip.facing.stop.id, ways: Object.keys(d.trip.facing.moment.stop.ways), closed: d.trip.facing.moment.closed })");
        if (f) {
          if (f.stop !== lastStop) tries = 0;
          lastStop = f.stop;
          const open = ["talk", "sneak", "pay", "force"].filter((w) => f.ways.includes(w) && !f.closed.includes(w));
          line = LINES[open[tries % Math.max(1, open.length)] ?? "talk"]!;
          tries++;
        }
      }
      await click(await spot('room.desk.where("book")'));
      await page.wait(500);
      await page.type(line);
      await page.wait(300);
      await page.key("Enter");
      lineAt = Date.now();
      console.log(`     wrote "${line}" (${stage})`);
    }
    await page.wait(150);
  }
  const end = await dir<{ over: string | null; visited: string[]; hour: number }>("({ over: d.trip.over, visited: d.trip.visited, hour: d.trip.sheet.hour })");
  await shot("09-end");
  check("the adventure gets to an end", !!end?.over, JSON.stringify(end));
  check("every picture was taken", ["01-dealing", "02-dealt", "05-turned", "07-side-card"].every((s) => shots.has(s)) || !end, [...shots].join(", "));
  const problems = page.problems.filter((p) => !/GPU stall|GL Driver|WebGL/.test(p));
  check("no errors in the page", problems.length === 0, problems.slice(0, 5).join(" | "));
  console.log(`${failed ? `${failed} FAILED` : "all passed"} in ${Math.round((Date.now() - t0) / 1000)} s`);
});
process.exit(failed ? 1 : 0);
