/**
 * Tries a run (src/engine/run.ts, src/game/runsit.ts) at the table in the built extension, in the pretend host
 * (preview/host.ts, ?run=1: a pretend model sets up a sheet, calls for the die unless a line only looks or asks, tells
 * a short story and reads it back).
 *
 * It sits down and checks that the sheet is written and the opening said; writes a try and checks that the check is
 * said before anything changes, takes the die, and checks that the roll, the story and what changed are said, the run
 * is kept and a page handed over; writes a line with nothing in doubt and checks that no die is called for; reloads
 * and checks that the run is taken up; then begins again by its command. Pictures go to .artifacts/run-sit/.
 *
 *   bun run build && bun scripts/run-sit.ts
 */
import { withPage } from "./browser.js";

const W = 1280, H = 800;
const Q = "card=maren&run=1";
const KEY = "tallow:run:chat-maren:card-maren";
let failed = 0;
const check = (what: string, ok: boolean, detail = ""): void => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `  (${detail})` : ""}`);
};

await withPage({ port: Number(process.env.TALLOW_PORT ?? 4187), width: W, height: H }, async (page) => {
  const port = Number(process.env.TALLOW_PORT ?? 4187);
  await page.run(`location.href = location.origin.startsWith("http") ? "/host?${Q}" : "http://localhost:${port}/host?${Q}"`);
  for (let i = 0; i < 100 && !(await page.run<boolean>("!!window.hostReady").catch(() => false)); i++) await page.wait(100);
  await page.run("localStorage.clear()");
  const sitDown = async (): Promise<void> => {
    const b = await page.middle("#sit");
    await page.mouse("move", b.x, b.y);
    await page.mouse("down", b.x, b.y);
    await page.mouse("up", b.x, b.y);
    for (let i = 0; i < 150 && !(await page.run<boolean>("!!window.room").catch(() => false)); i++) await page.wait(100);
    await page.run("window.room.ready");
    // Everything the narrator says from here on, gathered as it is given to be said.
    await page.run("(window.heard = [], ((say) => (room.desk.say = (lines) => (window.heard.push(...[].concat(lines)), say(lines))))(room.desk.say.bind(room.desk)), 1)");
  };
  await sitDown();
  const shot = (n: string) => page.shot(`.artifacts/run-sit/${n}.jpg`);
  const heard = (part: string): string => `window.heard.some((t) => t.includes(${JSON.stringify(part)}))`;
  const run = <T>(expr: string): Promise<T> => page.run<T>(`(() => { const run = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) ?? "null")?.run; return run ? (${expr}) : null; })()`);
  const until = async (cond: string, ms = 30000): Promise<boolean> => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await page.run<boolean>(`!!(${cond})`).catch(() => false)) return true;
      if (await page.run<boolean>("room.desk.voice.speaking")) await page.type(" ");
      else if (await page.run<boolean>("room.holding")) await page.run("room.releaseDie()");
      else if (await page.run<boolean>("room.desk.mode === 'holding' || room.desk.mode === 'reading'")) await page.key("Enter");
      await page.wait(150);
    }
    return false;
  };
  const ASKED = "room.desk.inviting && room.desk.mode === 'idle' && !room.desk.voice.speaking";
  const write = async (line: string): Promise<void> => {
    await until(ASKED, 40000);
    await page.type(line);
    await page.wait(300);
    await page.key("Enter");
  };

  check("a sheet is written from the card", await until(`localStorage.getItem(${JSON.stringify(KEY)})`, 40000));
  check("for the name on the page, with the game's attributes", (await run<string>("run.sheet.name + ' ' + run.sheet.attributes.dexterity + ' ' + run.sheet.skills.length")) === "Ash 6 8", String(await run("run.sheet.name + ' ' + run.sheet.attributes.dexterity + ' ' + run.sheet.skills.length")));
  check("the opening is said, and how to play", await until(`${heard("Lamplighters' Stair")} && ${heard("Write what you do")}`, 30000));
  check("your sheets lie by your hand", await until("room.desk.sheaf.length === 3", 10000), String(await page.run("room.desk.sheaf.length")));
  check("you are asked to write", await until(ASKED, 40000));
  await page.wait(600);
  await shot("01-opened");

  // A try: the check is said before anything changes, and the die is offered.
  await write("I sneak up the stair toward the nearest lamp, keeping to the wall.");
  check("the check is said in the narrator's words", await until(`${heard("I take it you mean to get close to the nearest lamp unseen")} && ${heard("For you: the rain covers your steps")} && ${heard("on your dexterity, and on Stealth")}`, 30000), await page.run<string>("window.heard.slice(-5).join(' / ')"));
  check("and the die is offered", await until("!!room.desk.onDie", 30000));
  check("nothing has changed yet", (await run<number>("run.turn")) === 0);
  await shot("02-check");
  await page.key("Enter");
  check("the die is thrown and read out", await until(heard(" on the die"), 40000), await page.run<string>("window.heard.slice(-3).join(' / ')"));
  check("the story is told", await until(heard("more frightened than you are"), 40000));
  check("and what changed is said", await until(`${heard("The boy with the hooked knife enters the story")} && ${heard("8 experience")}`, 30000), await page.run<string>("window.heard.slice(-6).join(' / ')"));
  check("the run is kept, a turn on", (await run<string>("run.turn + ' ' + run.beats.length + ' ' + run.sheet.xp + ' ' + run.people.length")) === "1 1 8 2", String(await run("run.turn + ' ' + run.beats.length + ' ' + run.sheet.xp + ' ' + run.people.length")));
  check("the skill thrown on is practised", (await run<number>("run.sheet.skills.find((k) => k.name === 'Stealth').xp")) === 440);
  check("a page of it is handed over", await until("room.desk.pages.some((p) => (p.heading ?? '').startsWith('Get close'))", 40000));
  await until(ASKED, 40000);
  await page.wait(600);
  await shot("03-told");

  // What happened last lies written out beside the notebook.
  check("the turn is written out beside the notebook", await page.run<boolean>("room.desk.lastTurn?.writing.mine.includes('I sneak up the stair') && room.desk.lastTurn.writing.his.some((t) => t.includes('more frightened than you are')) && room.desk.lastTurn.writing.his.some((t) => t.includes('on the die'))"), JSON.stringify(await page.run("room.desk.lastTurn?.writing.his.map((t) => t.slice(0, 24))")));

  // A long line: written at one size, a full page is turned and the line goes on, and none of it is lost.
  // The field the keys go into is the one with the keyboard, inside the room's own shadow tree.
  const FIELD = "(() => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; })()";
  const long = Array.from({ length: 60 }, (_, i) => `Step ${i + 1}: I keep to the wall and count the lamps as I pass under them.`).join(" ");
  await page.type("I ");
  await page.wait(900);
  check("the notebook is open", await page.run<boolean>("room.desk.mode === 'writing'"));
  check("a short line is one leaf", (await page.run<number>("room.desk.leaves")) === 1);
  await shot("05-short");
  await page.run(`(${FIELD}.value = ${JSON.stringify(long)}, ${FIELD}.dispatchEvent(new Event("input")), 1)`);
  // Letters only: the typing here presses "." and "!" as other keys.
  await page.type(" And then I stop");
  await page.wait(900);
  const wrote = await page.run<{ n: number; leaves: number; end: boolean }>("({ n: room.desk.draft.length, leaves: room.desk.leaves, end: room.desk.draft.endsWith('And then I stop') })");
  check("all of a long line is on the pad", wrote.n === long.length + " And then I stop".length && wrote.end, `${wrote.n} of ${long.length + 16}`);
  check("on more than one leaf", wrote.leaves >= 3, String(wrote.leaves));
  await shot("06-long");

  // A look across at what happened last, and back by writing.
  await page.key("Tab");
  await page.wait(1200);
  check("Tab turns you to what happened last", await page.run<boolean>("room.desk.notesUp && room.desk.mode === 'writing'"));
  await shot("07-notes");
  const leaves = await page.run<number>("room.desk.lastTurn.leaves");
  await page.key("ArrowRight");
  await page.wait(500);
  check("its leaves turn", (await page.run<number>("room.desk.lastTurn.leaf")) === Math.min(1, leaves - 1), `${leaves} leaves`);
  if (leaves > 1) await shot("08-notes-next");
  await page.type("x");
  await page.wait(1200);
  check("writing turns you back to the notebook", await page.run<boolean>("!room.desk.notesUp && room.desk.draft.endsWith('I stopx')"));
  // Rubbed out again: the leaf comes back, and the page is clean.
  await page.run(`(${FIELD}.value = "", ${FIELD}.dispatchEvent(new Event("input")), 1)`);
  await page.wait(700);
  check("rubbed out, it is one leaf again", await page.run<boolean>("room.desk.leaves === 1 && room.desk.draft === ''"));
  await page.key("Escape");
  await page.wait(400);

  // Nothing in doubt: no die, the story simply goes on.
  const said = await page.run<number>("window.heard.length");
  await write("I look the quarter over and ask her what she saw.");
  check("a line with nothing in doubt is told without a die", await until(`(() => { const run = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).run; return run.turn === 2; })()`, 40000));
  check("and no check was called for", !(await page.run<boolean>(`window.heard.slice(${said}).some((t) => t.includes("I take it you mean"))`)));

  // Left and come back to: the run is taken up.
  await until(ASKED, 40000);
  await page.run("location.reload()");
  await page.wait(500);
  for (let i = 0; i < 100 && !(await page.run<boolean>("!!window.hostReady").catch(() => false)); i++) await page.wait(100);
  await sitDown();
  // It is said at once, perhaps before this script is listening: what is being said is read too.
  check("the run is taken up where it was left", await until(`${heard("We were in the middle of things, at The Lamplighters' Stair")} || (room.desk.voice.live?.textContent ?? "").includes("We were in the middle of things, at The Lamplighters' Stair")`, 30000));
  check("a turn further on than it began", (await run<number>("run.turn")) === 2);
  check("with its sheets", await until("room.desk.sheaf.length === 3", 10000));

  // Begun again by its command.
  await write("new game");
  check("a new game begins again from the start", await until(`${heard("Then we begin again")} && (() => { const run = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).run; return run.turn === 0 && run.beats.length === 0; })()`, 40000));
  await until(ASKED, 40000);
  await page.wait(600);
  await shot("04-again");
  const problems = page.problems.filter((p) => !/GPU stall|GL Driver|WebGL|no model in the pretend host|fell back/.test(p));
  check("no errors in the page", problems.length === 0, problems.slice(0, 4).join(" | "));
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
