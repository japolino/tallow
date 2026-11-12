/**
 * Tries a story of scenes played with a hand of dice (src/engine/hand.ts, src/game/scenes.ts) in the built extension,
 * in the pretend host (preview/host.ts, ?scenes=1: a pretend builder hands back the stock story, and there is no
 * other model, so every line is read by its words and told in code's plain ones).
 *
 * It sits down, says what story it wants and who it is, and checks that three scene cards are dealt and three dice
 * thrown; writes a try, checks that the stake is said and a die may be touched, touches one with the mouse and checks
 * that it is spent; names the next by its number; then reloads in the middle of the scene and checks that the story
 * is taken up with the dice as they lay. Pictures go to .artifacts/hand/.
 *
 *   bun run build && bun scripts/hand-sit.ts
 */
import { withPage } from "./browser.js";

const W = 1280, H = 800;
const Q = "card=maren&scenes=1";
let failed = 0;
const check = (what: string, ok: boolean, detail = ""): void => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `  (${detail})` : ""}`);
};

await withPage({ port: Number(process.env.TALLOW_PORT ?? 4186), width: W, height: H }, async (page) => {
  const port = Number(process.env.TALLOW_PORT ?? 4186);
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
  };
  await sitDown();
  const shot = (n: string) => page.shot(`.artifacts/hand/${n}.jpg`);
  /** Everything the narrator says from here on, gathered as it is given to be said. */
  await page.run("(window.heard = [], ((say) => (room.desk.say = (lines) => (window.heard.push(...lines), say(lines))))(room.desk.say.bind(room.desk)), 1)");
  const heard = (part: string): string => `window.heard.some((t) => t.includes(${JSON.stringify(part)}))`;
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
  const at = (expr: string): Promise<{ x: number; y: number }> =>
    page.run<{ x: number; y: number }>(`(() => { const v = (${expr}).clone().project(room.camera); const r = document.querySelector("canvas") ?? [...document.querySelectorAll("div")].map((d) => d.shadowRoot?.querySelector("canvas")).find(Boolean); const b = r.getBoundingClientRect(); return { x: b.left + ((v.x + 1) / 2) * b.width, y: b.top + ((1 - v.y) / 2) * b.height }; })()`);
  const click = async (p: { x: number; y: number }): Promise<void> => {
    await page.mouse("move", p.x, p.y);
    await page.wait(200);
    await page.mouse("down", p.x, p.y);
    await page.mouse("up", p.x, p.y);
  };
  const write = async (line: string): Promise<void> => {
    await click(await at('room.desk.where("book")'));
    await page.wait(500);
    await page.type(line);
    await page.wait(300);
    await page.key("Enter");
  };
  const ASKED = "room.desk.inviting && room.desk.mode === 'idle' && !room.desk.voice.speaking";
  const DICE = "room.desk.dice.lying.map((l) => l.value)";
  const hand = (): Promise<number[]> => page.run<number[]>(`director.trip.hand.dice`);
  /** A die that falls just short is offered a trade at code's price: this player lets it lie. */
  const spent = async (cond: string, ms = 30000): Promise<boolean> => {
    const trades = await page.run<number>(`window.heard.filter((t) => t.includes("Give something up")).length`);
    if (!(await until(`${cond} || window.heard.filter((t) => t.includes("Give something up")).length > ${trades}`, ms))) return false;
    if (await page.run<boolean>(cond)) return true;
    await until(ASKED);
    await write("I let it lie");
    return until(cond, ms);
  };

  check("the narrator asks which story", await until(ASKED));
  await write("I want to get a sealed letter to the magistrate before dawn, whatever it costs me");
  check("then who you are", await until(`${ASKED} && ${heard("who are you")}`));
  await write("I am Tam, a quick-fingered courier from the river wards");
  check("the story is a model's own, not one drawn from the deck", await until("window.director?.trip?.adv?.scenes", 60000), await page.run<string>("window.director?.trip?.adv?.title ?? ''"));
  check("no road story was announced in its place", !(await page.run<boolean>(heard("No story of my own"))));
  check("three scene cards are dealt", await until("room.desk.cards.road.size === 3", 40000), String(await page.run("room.desk.cards.road.size")));
  check("and three dice are thrown where you can read them", await until(`${DICE}.length === 3 && room.desk.dice.lying.every((l) => l.die.showing === l.value)`, 40000), JSON.stringify(await page.run(DICE)));
  check("the dice on the table are the hand code rolled", JSON.stringify(await page.run(DICE)) === JSON.stringify(await hand()));
  await page.wait(800);
  await shot("01-hand-thrown");
  check("the first scene is opened and you are asked what you do", await until(`${ASKED} && director.trip.hand.opened && ${heard("What do you do?")}`, 60000));
  check("the two dials stand on the table", await page.run<boolean>("room.desk.board.group.visible !== false && !!room.desk.board"));
  await shot("02-scene");

  // A try: the stake is said before any die is spent, and then a die may be touched.
  const before = await hand();
  await write("I talk the ferryman round, kindly, and ask him to take me across");
  check("the stake is said, with what each die would come to", await until(`${heard("Which die do you spend on it?")} && ${heard("Your dice: the ")}`, 30000));
  check("and a die may be touched", await until("!!room.desk.dice.choosing", 30000));
  check("nothing is spent yet", JSON.stringify(await hand()) === JSON.stringify(before));
  const best = before.indexOf(Math.max(...before));
  // The view sways a little with the pointer, so the die is followed to where it is seen once the pointer is on it.
  let p = await at(`room.desk.dice.at()[${best}]`);
  for (let i = 0; i < 4; i++) {
    await page.mouse("move", p.x, p.y);
    await page.wait(350);
    p = await at(`room.desk.dice.at()[${best}]`);
  }
  check("the die under the pointer is picked out", (await page.run<number>("room.desk.dice.hover")) === best, String(await page.run("room.desk.dice.hover")));
  await shot("03-choosing");
  await click(p);
  check("touching it spends it", await spent("director.trip.hand.dice.length === 2"), JSON.stringify(await hand()));
  check("and it is taken off the table", await until(`${DICE}.length === 2`, 20000), JSON.stringify(await page.run(DICE)));
  check("what it came to is said", await until(heard(`You spent the ${before[best]}`), 30000));
  check("the die spent is the one touched", JSON.stringify(await hand()) === JSON.stringify(before.filter((_, i) => i !== best)));
  await until(`${ASKED} && room.desk.mode === 'idle'`, 60000);
  await page.wait(600);
  await shot("04-spent");

  // The next die is named by writing its number.
  const two = await hand();
  await write("I slip aboard behind the lamp crates while he argues");
  check("the next try waits for a die too", await until("!!room.desk.dice.choosing", 40000));
  await write(String(two[0]));
  check("a die named by its number is spent", await spent("director.trip.hand.dice.length === 1 || director.trip.hand.rolled > 1 || director.trip.hand.scene > 0"), JSON.stringify(await hand()));
  await until(`${ASKED} && room.desk.mode === 'idle'`, 60000);

  // Leave in the middle of the scene (a reload), sit down again, and go on with it.
  check("the sitting is kept as it goes", await until("Object.keys(localStorage).some((k) => k.startsWith('tallow:sitting:'))", 30000));
  const kept = await hand();
  const through = await page.run<number>("director.trip.hand.through");
  await page.run("location.href = location.href");
  await page.wait(1500);
  for (let i = 0; i < 100 && !(await page.run<boolean>("!!window.hostReady").catch(() => false)); i++) await page.wait(100);
  await sitDown();
  await page.run("(window.heard = [], ((say) => (room.desk.say = (lines) => (window.heard.push(...lines), say(lines))))(room.desk.say.bind(room.desk)), 1)");
  check("sitting down again, you are asked whether to go on", await until(heard("in the middle of a story"), 20000));
  await until(ASKED);
  await write("let's go on with it");
  check("the story is taken up where it was left", await until(heard("You came back"), 30000));
  check("with the dice as they lay", await until(`JSON.stringify(${DICE}) === ${JSON.stringify(JSON.stringify(kept))}`, 30000), JSON.stringify(await page.run(DICE)));
  check("and as far through the scene as you were", (await page.run<number>("director.trip.hand.through")) === through);
  await until(ASKED, 60000);
  await page.wait(800);
  await shot("05-taken-up");
  const problems = page.problems.filter((p) => !/GPU stall|GL Driver|WebGL|no model in the pretend host|fell back/.test(p));
  check("no errors in the page", problems.length === 0, problems.slice(0, 4).join(" | "));
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
