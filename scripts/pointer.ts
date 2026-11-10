/**
 * The room under a real mouse. The pictures in scripts/shots.ts drive the room
 * through its own handle; this drives it the way a player does, with pointer
 * moves, clicks and the wheel sent through the browser's own input path, while
 * the room runs at its own pace.
 *
 *   bun scripts/pointer.ts          on the graphics card
 *   SOFT=1 bun scripts/pointer.ts   on the software renderer (a slow machine)
 *
 * It checks: a click on the table leans you in and another sits you back; a
 * click above the table does nothing; the wheel leans; your hand follows the
 * pointer while it holds the die; moving the pointer fast shakes the die and
 * stopping lets it settle; a click lets go; the die lands on the number it was
 * given; and through the whole throw the view never jumps.
 *
 * Then it plays one moment of the game the same way, at the table: reads the
 * page it is handed, types a line into the notebook, hands it over, takes a
 * die from the box, lets go by clicking the table, and looks at what changed
 * in the game, on the table and on the map. Nothing is clicked but the room.
 */
import { withPage } from "./browser.js";

const W = 1024, H = 768;
let failed = 0;
const check = (what: string, ok: boolean, detail = ""): void => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `  (${detail})` : ""}`);
};

// TALLOW_PORT moves the preview server off its usual port, for when something else has it.
await withPage({ soft: process.env.SOFT === "1", width: W, height: H, port: Number(process.env.TALLOW_PORT) || undefined }, async (page) => {
  await page.open("t=20&hud=0&patrol=0");
  await page.run("room.paused = false");
  await page.mouse("move", W / 2, H / 2);
  await page.wait(400);

  // Leaning in and sitting back.
  await page.mouse("down", W / 2, H * 0.2);
  await page.mouse("up", W / 2, H * 0.2);
  await page.wait(300);
  check("a click above the table does not lean you in", (await page.run<boolean>("room.leaning")) === false);
  await page.mouse("down", W / 2, H * 0.75);
  await page.mouse("up", W / 2, H * 0.75);
  await page.wait(1200);
  check("a click on the table leans you in over the map", (await page.run<boolean>("room.leaning")) === true);
  const leantY = await page.run<number>("room.camera.position.y");
  check("the view has moved up over the map", leantY > 0.9, `eye height ${leantY.toFixed(2)} m`);
  await page.mouse("down", W / 2, H * 0.3);
  await page.mouse("up", W / 2, H * 0.3);
  await page.wait(1200);
  check("a click anywhere sits you back", (await page.run<boolean>("room.leaning")) === false);
  await page.wheel(W / 2, H / 2, -120);
  await page.wait(300);
  check("rolling the wheel away leans you in", (await page.run<boolean>("room.leaning")) === true);
  await page.wheel(W / 2, H / 2, 120);
  await page.wait(1300);
  check("rolling it back sits you back", (await page.run<boolean>("room.leaning")) === false);

  // The die in your hand.
  await page.run("void room.offerDie(11)");
  await page.wait(2600);
  check("your hand has picked the die up", (await page.run<boolean>("room.holding")) === true);
  await page.mouse("move", W * 0.25, H * 0.5);
  await page.wait(700);
  const left = await page.run<number>("room.hand.group.position.x");
  await page.mouse("move", W * 0.8, H * 0.5);
  await page.wait(700);
  const right = await page.run<number>("room.hand.group.position.x");
  check("your hand follows the pointer", right - left > 0.03, `${(left * 100).toFixed(1)} cm to ${(right * 100).toFixed(1)} cm`);

  let peak = 0;
  for (let i = 0; i < 36; i++) {
    await page.mouse("move", W * (0.55 + (i % 2 ? 0.14 : -0.14)), H * (0.5 + (i % 3) * 0.04));
    await page.wait(22);
    if (i % 6 === 5) peak = Math.max(peak, await page.run<number>("room.shake"));
  }
  check("moving the pointer fast shakes the die", peak > 0.5, `shake ${peak.toFixed(2)} of 1`);
  await page.wait(1200);
  const calm = await page.run<number>("room.shake");
  check("holding still lets it settle", calm < 0.1, `shake ${calm.toFixed(2)}`);

  // Letting go: record the view every frame until you have sat back, and look for a jump.
  await page.run(`(() => {
    const log = (window.__view = []);
    const cam = room.camera, v = new cam.position.constructor();
    const tick = () => {
      cam.getWorldDirection(v);
      log.push([performance.now(), cam.position.x, cam.position.y, cam.position.z, v.x, v.y, v.z, cam.fov]);
      if (log.length < 4000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  await page.mouse("move", W * 0.6, H * 0.55);
  await page.wait(300);
  await page.mouse("down", W * 0.6, H * 0.55);
  await page.mouse("up", W * 0.6, H * 0.55);
  await page.wait(300);
  check("a click lets go of the die", (await page.run<boolean>("room.holding")) === false);
  await page.wait(2200);
  check("the die lands on the number it was given", (await page.run<number>("room.die.showing")) === 11);
  const reading = await page.run<number>("room.camera.fov");
  check("you lean in to read it", reading < 30, `lens ${reading.toFixed(0)} degrees`);
  await page.wait(5200);
  const after = await page.run<number>("room.camera.fov");
  check("and sit back again", Math.abs(after - 42) < 0.5, `lens ${after.toFixed(0)} degrees`);
  const jump = await page.run<{ frames: number; turn: number; move: number; lens: number; ms: number }>(`(() => {
    const log = window.__view; window.__view = [];
    let turn = 0, move = 0, lens = 0, ms = 0;
    for (let i = 1; i < log.length; i++) {
      const a = log[i - 1], b = log[i];
      const dt = Math.max(1, b[0] - a[0]) / 16.7;   // in frames at 60 a second, so a slow machine is judged fairly
      const dot = Math.max(-1, Math.min(1, a[4] * b[4] + a[5] * b[5] + a[6] * b[6]));
      turn = Math.max(turn, (Math.acos(dot) * 180 / Math.PI) / dt);
      move = Math.max(move, Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3]) / dt);
      lens = Math.max(lens, Math.abs(b[7] - a[7]) / dt);
      ms = Math.max(ms, b[0] - a[0]);
    }
    return { frames: log.length, turn, move, lens, ms };
  })()`);
  // A snap would be the view turning tens of degrees in one frame. Eased, its quickest moment is two or three.
  check("the view never jumps during the throw", jump.turn < 3 && jump.move < 0.03 && jump.lens < 1.2, `over ${jump.frames} frames the most in one frame was a turn of ${jump.turn.toFixed(2)} degrees, a move of ${(jump.move * 100).toFixed(1)} cm, a lens change of ${jump.lens.toFixed(2)} degrees; longest frame ${jump.ms.toFixed(0)} ms`);

  // One moment of the game, played with the keyboard and the mouse. The seed "moss" throws a 3 and then a 9.
  console.log("");
  console.log("One moment:");
  /** Wait for something to be true, as a player would: Space hurries the narrator, and with `down` Enter sets down a page you are handed. */
  const until = async (cond: string, o: { ms?: number; down?: boolean; hurry?: boolean } = {}): Promise<boolean> => {
    const end = Date.now() + (o.ms ?? 45000);
    for (;;) {
      if (await page.run<boolean>(`!!(${cond})`)) return true;
      if (Date.now() > end) return false;
      if (o.hurry !== false && (await page.run<boolean>("room.desk.voice.speaking"))) await page.type(" ");
      else if (o.down && (await page.run<boolean>("room.desk.mode === 'holding'"))) await page.key("Enter");
      await page.wait(120);
    }
  };
  /** Where a thing on your side of the table is drawn on the screen. */
  const spot = (what: "book" | "pile" | "box"): Promise<{ x: number; y: number }> =>
    page.run(`(() => { const v = room.desk.where("${what}").project(room.camera); const r = document.querySelector("canvas").getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; })()`);
  const click = async (at: { x: number; y: number }): Promise<void> => {
    await page.mouse("move", at.x, at.y);
    await page.wait(150);
    await page.mouse("down", at.x, at.y);
    await page.mouse("up", at.x, at.y);
  };
  const table = { x: W * 0.6, y: H * 0.55 };
  const heard = (): Promise<string> => page.run<string>('[...document.querySelectorAll("[aria-live]")].map((e) => e.textContent).join(" | ")');
  const at = (id: string): Promise<string> => page.run<string>(`room.pieces.get("${id}").at`);
  const carried = (): Promise<boolean> => page.run<boolean>('["health", "supplies", "goodwill"].every((k) => room.desk.counters.count(k) === play.moment.sheet[k])');
  const counted = (): Promise<string> => page.run<string>('["health", "supplies", "goodwill"].map((k) => k + " " + room.desk.counters.count(k)).join(", ")');
  const ASKED = "room.desk.inviting && room.desk.mode === 'idle' && !room.desk.voice.speaking";
  const WEIGHED = "!!room.desk.onDie && !room.desk.voice.speaking";

  await page.open("moment=1&seed=moss");
  await page.run("room.paused = false");
  await page.mouse("move", W / 2, H / 2);
  check("there is nothing on the screen but the room", (await page.run<number>('document.querySelectorAll("#play, #line, #stage, #take").length')) === 0);
  check("the narrator speaks first", await until("room.desk.voice.speaking && room.desk.voice.text.length > 8", { ms: 8000, hurry: false }), JSON.stringify((await page.run<string>("room.desk.voice.text")).slice(0, 40)));
  check("and then hands you a page", await until("room.desk.mode === 'holding'"));
  await page.wait(900);
  check("the page is read out for a screen reader as well", (await heard()).includes("Your strengths"));
  await page.key("Enter");
  check("Enter sets it down on the pile by your hand", await until("room.desk.mode === 'idle' && room.desk.pages.length === 1", { ms: 6000 }));
  check("the counters on the table are what you carry", await carried(), await counted());
  check("the narrator asks what you do", await until(ASKED));
  const first = "I put my shoulder to the bar and heave";
  await page.type(first);
  await page.wait(400);
  check("starting to type opens the notebook", (await page.run<string>("room.desk.mode")) === "writing");
  check("a line with spaces in it can be typed, first letter and all", (await page.run<string>("room.desk.draft")) === first, JSON.stringify(await page.run<string>("room.desk.draft")));
  check("and typing it does not lean you over the map", (await page.run<boolean>("room.leaning")) === false);
  await page.wait(900);
  const lens = await page.run<number>("room.camera.fov");
  check("you lean in over the notebook to write", lens < 36, `lens ${lens.toFixed(0)} degrees`);
  await page.key("Enter");
  await page.wait(200);
  check("Enter tears the page off and holds it out", (await page.run<string>("play.stage")) !== "write" && (await page.run<string>("room.desk.draft")) === "");
  check("the narrator names the check before the die is touched", (await until(WEIGHED)) && (await page.run<string>("play.stage")) === "check" && (await heard()).includes("Brawn"), "tests Brawn");
  check("nothing has been thrown yet", (await page.run<number>("play.moment.tries")) === 0);
  check("you turn to the balance while it is loaded", await until("room.desk.glance.k > 0.9", { ms: 15000 }));
  check("and back to the table when the beam has come to rest", await until("room.desk.glance.k < 0.02", { ms: 20000 }));
  await page.wait(1500);
  const tilt = await page.run<number>("room.desk.counters.tilt");
  check("the balance is loaded and has tipped", Math.abs(tilt) > 0.02, `tilt ${tilt.toFixed(2)}`);
  await click(await spot("box"));
  await page.wait(2800);
  check("a click on the dice box puts a die in your hand", (await page.run<boolean>("room.holding")) === true);
  await click(table);
  check("the die on the table shows the number the rules threw", (await until("play.stage === 'told'", { ms: 8000 })) && (await until("room.die.showing === 3", { ms: 8000, hurry: false })));
  check("the narrator writes the turn under your line and hands the page back", await until("room.desk.mode === 'holding'", { ms: 60000 }));
  await page.wait(600);
  const turn = await heard();
  check("the page has your line and what came of it", turn.includes(first) && turn.includes("The die shows 3"));
  const sheet = await page.run<{ health: number; hour: number }>("play.moment.sheet");
  check("a failed try costs something and takes time", sheet.health === 4 && sheet.hour === 17, `health ${sheet.health}, hour ${sheet.hour}`);
  check("the narrator has taken a stone from your pile", await carried(), await counted());
  check("and the way that was tried is closed", (await page.run<string>("play.moment.closed.join()")) === "force" && (await page.run<number>("play.moment.trouble")) === 1);
  check("the pieces stay where they are", (await at("you")) === "mill" && (await at("shadow")) === "bridge");
  await click({ x: W / 2, y: H / 2 });
  check("a click sets the page down on the others", await until("room.desk.mode === 'idle' && room.desk.pages.length === 2", { ms: 6000 }));
  check("the narrator asks again", await until(ASKED));
  await click(await spot("book"));
  await page.wait(500);
  check("a click on the notebook opens it", (await page.run<string>("room.desk.mode")) === "writing");
  await page.type("I climb down and creep across by the rope walk");
  await page.key("Enter");
  check("using something in the scene is named", (await until(WEIGHED)) && (await heard()).includes("the rope walk under the bridge"));
  await page.key("Enter");
  await page.wait(2800);
  check("Enter takes a die as well", (await page.run<boolean>("room.holding")) === true);
  await click(table);
  const ended = await until("play.stage === 'over'", { ms: 90000, down: true });
  const end = await page.run<{ stage: string; over: string | null; hour: number; tries: number; mode: string }>("({ stage: play.stage, over: play.moment.over, hour: play.moment.sheet.hour, tries: play.moment.tries, mode: room.desk.mode })");
  check("a try that works at a cost gets you past", ended && end.over === "past" && end.hour === 18.5, `stage ${end.stage}, over ${end.over}, hour ${end.hour}, tries ${end.tries}, desk ${end.mode}`);
  check("your piece moves onto the stop, and the narrator's to the next thing in your way", await until('room.pieces.get("you").at === "bridge" && room.pieces.get("shadow").at === "rest"', { ms: 12000 }));
  check("the counters still match what you carry", await carried(), await counted());
  check("three pages lie in the pile", (await page.run<number>("room.desk.pages.length")) === 3);
  await until("!room.desk.voice.speaking", { ms: 20000 });
  await page.key("ArrowUp");
  check("the up arrow picks the top page up to read again", await until("room.desk.mode === 'reading'", { ms: 5000 }));
  await page.key("ArrowLeft");
  await page.wait(300);
  check("the left arrow turns to the page before", (await until("room.desk.mode === 'reading'", { ms: 6000 })) && (await heard()).includes(first));
  await page.key("Enter");
  check("and Enter puts it back", await until("room.desk.mode === 'idle'", { ms: 6000 }));
  await page.type("again");
  await page.key("Enter");
  check("handing over one more page starts the moment again", await until('play.moment.tries === 0 && play.moment.sheet.health === 5 && room.pieces.get("you").at === "mill" && room.pieces.get("shadow").at === "bridge"', { ms: 30000 }));

  const stats = await page.run<{ fps: number; quality: number }>("room.stats()");
  console.log(`\n${stats.fps} frames a second, quality step ${stats.quality}`);
  if (page.problems.length) console.log("\nThe page complained:\n" + [...new Set(page.problems)].join("\n"));
});
console.log(failed ? `\n${failed} check(s) failed.` : "\nEvery check passed.");
process.exit(failed ? 1 : 0);
