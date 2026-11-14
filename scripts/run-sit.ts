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
  // Your own three, and each system's pages after them.
  check("your sheets lie by your hand", await until("room.desk.sheaf.length >= 3", 10000), String(await page.run("room.desk.sheaf.length")));
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

  // The field the keys go into is the one with the keyboard, inside the room's own shadow tree.
  const FIELD = "(() => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; })()";
  /** Rub out what is on the pad and shut the notebook. */
  const rubOut = async (): Promise<void> => {
    await page.run(`(${FIELD}.value = "", ${FIELD}.dispatchEvent(new Event("input")), 1)`);
    await page.wait(300);
    await page.key("Escape");
    await page.wait(500);
  };
  /**
   * Touch something of the desk's with the mouse (desk.ts, screenOf). The view follows the pointer a little, so the
   * pointer is brought over it, the view let settle, and brought over it again before the click.
   */
  const touch = async (what: string): Promise<boolean> => {
    let at: { x: number; y: number } | null = null;
    for (let i = 0; i < 4; i++) {
      at = await page.run<{ x: number; y: number } | null>(`room.desk.screenOf(${JSON.stringify(what)})`);
      if (!at) return false;
      await page.mouse("move", at.x, at.y);
      await page.wait(500);
    }
    await page.mouse("down", at!.x, at!.y);
    await page.mouse("up", at!.x, at!.y);
    return true;
  };

  // What the systems put on the table, driven straight from here so every kind and every change is seen whatever the
  // run has come to: a map of known places, cards on your side, meters in the reckoning's frame and counters on its slip.
  // The next real turn lays out what the systems themselves show instead.
  const FIRST = [
    {
      kind: "map",
      title: "The Lamplighters' Quarter",
      places: [
        { id: "stair", name: "The Lamplighters' Stair", seen: true },
        { id: "mill", name: "The Old Mill", seen: false, danger: 2, note: "smoke by night" },
        { id: "market", name: "Night Market", seen: true },
        { id: "chapel", name: "Drowned Chapel", seen: false, danger: 1 },
        { id: "gate", name: "River Gate", seen: true },
      ],
      ways: [["stair", "mill"], ["stair", "market"], ["market", "chapel"], ["market", "gate"]],
      at: "stair",
    },
    { kind: "card", id: "q1", group: "quest", title: "The Boy's Errand", text: "Find out who sent the boy with the hooked knife, and why.", line: "I ask the boy who sent him." },
    { kind: "card", id: "w1", group: "wares", title: "Lamp Oil", text: "A flask of good oil, enough for a night. Three coins.", line: "I buy the lamp oil." },
    { kind: "card", id: "p1", group: "perk", title: "Night Eyes", text: "You see in the dark as well as others do at dusk." },
    { kind: "bar", id: "b1", group: "needs", name: "Hunger", value: 3, max: 10, good: "down" },
    { kind: "bar", id: "b2", group: "fight", name: "The boy's nerve", value: 6, max: 8, good: "none", note: "wavering" },
    { kind: "tokens", id: "t1", name: "Saves from death", count: 2, max: 3 },
  ];
  const SECOND = [
    {
      ...FIRST[0],
      places: [...(FIRST[0] as { places: { id: string; seen: boolean }[] }).places.map((p) => (p.id === "mill" ? { ...p, seen: true } : p)), { id: "well", name: "The Sunken Well by the Ferry Steps", seen: false, note: "the boy ran this way" }],
      ways: [...(FIRST[0] as { ways: string[][] }).ways, ["gate", "well"]],
      at: "market",
    },
    { ...FIRST[1], text: "The boy says a woman in grey sent him. Find her before she finds you." },
    FIRST[3],
    { kind: "card", id: "s1", group: "suggestion", title: "Follow the smoke", text: "Smoke rises from the mill though nobody works there now.", line: "I follow the smoke toward the Old Mill." },
    { kind: "card", id: "x1", group: "wares", title: "Rope", text: "Thirty feet of hemp rope. Two coins." },
    { kind: "card", id: "x2", group: "wares", title: "Hooded Lantern", text: "A lantern that can be shut to a sliver. Five coins." },
    { kind: "card", id: "x3", group: "wares", title: "Chalk", text: "A stick of white chalk. One coin." },
    { ...FIRST[4], value: 5 },
    { kind: "bar", id: "b4", group: "fight", name: "Grey woman's guard", value: 14, max: 20, good: "down" },
    { kind: "bar", id: "b3", group: "needs", name: "Fatigue", value: 2, max: 6, good: "down" },
    { ...FIRST[6], count: 1 },
  ];
  const sideIds = "room.desk.cards.sideCards.map((c) => c.id).join(' ')";
  const piece = "[...room.pieces.values()].find((p) => p.kind === 'player')";

  await page.run(`(room.show(${JSON.stringify(FIRST)}), 1)`);
  check("the map is unrolled with your piece where you are", await until(`room.mapMesh.visible && room.mapMesh.scale.z > 0.99 && ${piece}.mesh.visible && ${piece}.at === 'stair'`, 10000));
  check("the cards are dealt to your side", await until(`${sideIds} === 'quest:q1 wares:w1 perk:p1'`, 20000), String(await page.run(sideIds)));
  const tally = "JSON.stringify(room.desk.tally.state)";
  check("the meters stand in the frame, the counters lie on their slip", await until(`(() => { const s = room.desk.tally.state; return s.up && s.rows.map((r) => r.name + ' ' + r.k + '/' + r.n).join(', ') === 'Hunger 3/10, The boy\\'s nerve 6/8' && s.slips.length === 1 && s.slips[0].stones === 2; })()`, 15000), String(await page.run(tally)));
  await page.wait(1500);
  await shot("09-shown");

  // The reckoning, leaned over to be read.
  check("touching the reckoning leans you over it", (await touch("tally")) && (await until("room.desk.glance.k > 0.95", 5000)));
  await page.wait(500);
  await shot("10-reckoning");
  await page.mouse("down", 640, 300);
  await page.mouse("up", 640, 300);
  check("and touching the table again sits you back", await until("room.desk.glance.k < 0.05", 5000));

  // Touching a place writes a line that goes there; nothing is sent.
  const turnBefore = await run<number>("run.turn");
  check("touching a place on the map writes the line that goes there", (await touch("place:mill")) && (await until("room.desk.mode === 'writing' && room.desk.draft === 'I go to the Old Mill.'", 5000)), String(await page.run("room.desk.draft")));
  await page.wait(900);
  await shot("11-place-written");
  check("and does not send it", (await run<number>("run.turn")) === turnBefore && (await page.run<boolean>("room.desk.inviting")));
  await rubOut();

  // A card is picked up to be read; touching it again writes its line.
  check("touching a card picks it up to read", (await touch("card:0")) && (await until("room.desk.cards.lookingAt === 0", 5000)));
  await page.wait(600);
  await shot("12-card-held");
  check("touching it again writes the line pencilled on it", (await touch("held")) && (await until("room.desk.mode === 'writing' && room.desk.draft === 'I ask the boy who sent him.'", 5000)), String(await page.run("room.desk.draft")));
  await rubOut();

  // A second list: what is the same stays, the rest is added, changed and taken away.
  await page.run(`(room.show(${JSON.stringify(SECOND)}), 1)`);
  check("a card no longer shown goes back, a changed one is written again, new ones are dealt, four at most", await until(`${sideIds} === 'quest:q1 perk:p1 suggestion:s1 wares:x1'`, 30000), String(await page.run(sideIds)));
  check("the changed card has its new words", await page.run<boolean>("room.desk.cards.sideCards[0].text.startsWith('The boy says')"));
  check("the meters change, grouped as they come", await until(`room.desk.tally.state.rows.map((r) => r.name + ' ' + r.k + '/' + r.n).join(', ') === "Hunger 5/10, Fatigue 2/6, Grey woman's guard 7/10"`, 5000), String(await page.run(tally)));
  check("a stone is taken back", await until("room.desk.tally.state.slips[0]?.stones === 1", 15000), String(await page.run(tally)));
  check("your piece walks to where you are now", await until(`${piece}.at === 'market' && !${piece}.move`, 10000));
  check("the new place is on the map", await page.run<boolean>("room.stops.has('well') && room.desk.places.some((p) => p.line === 'I look around Night Market.')"));
  await page.wait(1500);
  await shot("13-changed");
  // And the writing view, with all of it out.
  await page.type("I ");
  await page.wait(1200);
  await shot("14-writing-with-shows");
  await rubOut();

  // A long line: written at one size, a full page is turned and the line goes on, and none of it is lost.
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
  // The turn laid out what the systems themselves show: everything laid out from here that they do not show is taken away.
  const gone = `(() => { const s = room.desk.tally.state; return !room.desk.cards.sideCards.some((c) => /^(quest:q1|perk:p1|suggestion:s1|wares:x)/.test(c.id)) && !s.rows.some((r) => /Hunger|Fatigue|Grey woman/.test(r.name)) && !s.slips.some((x) => x.name === 'Saves from death') && !room.stops.has('well'); })()`;
  check("what the systems no longer show is taken away, and what they show is laid out", await until(gone, 30000), `${await page.run(sideIds)} | ${await page.run(tally)} | ${await page.run("[...room.stops.keys()].join(' ')")}`);
  await page.wait(2500);
  await shot("18-systems-own");

  // Left and come back to: the run is taken up.
  await until(ASKED, 40000);
  await page.run("location.reload()");
  await page.wait(500);
  for (let i = 0; i < 100 && !(await page.run<boolean>("!!window.hostReady").catch(() => false)); i++) await page.wait(100);
  await sitDown();
  // It is said at once, perhaps before this script is listening: what is being said is read too.
  check("the run is taken up where it was left", await until(`${heard("We were in the middle of things, at The Lamplighters' Stair")} || (room.desk.voice.live?.textContent ?? "").includes("We were in the middle of things, at The Lamplighters' Stair")`, 30000));
  check("a turn further on than it began", (await run<number>("run.turn")) === 2);
  check("with its sheets", await until("room.desk.sheaf.length >= 3", 10000), String(await page.run("room.desk.sheaf.length")));

  // Begun again by its command.
  await write("new game");
  check("a new game begins again from the start", await until(`${heard("Then we begin again")} && (() => { const run = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).run; return run.turn === 0 && run.beats.length === 0; })()`, 40000));
  await until(ASKED, 40000);
  await page.wait(600);
  await shot("04-again");

  // On a phone held upright: everything shown is still on the table and in the picture, and the notebook still clear.
  await page.size(390, 844);
  await page.wait(1200);
  await page.run(`(room.show(${JSON.stringify(SECOND)}), 1)`);
  check("on a phone, the cards are dealt", await until(`room.desk.cards.sideCards.length === 4`, 30000), String(await page.run(sideIds)));
  await until("room.desk.tally.state.slips[0]?.stones === 1 && room.mapMesh.scale.z > 0.99", 15000);
  const inView = async (what: string): Promise<boolean> => {
    // In the page's own pixels: an emulated phone lays the page out wider than the picture it gives.
    const at = await page.run<{ x: number; y: number; w: number; h: number } | null>(`(() => { const p = room.desk.screenOf(${JSON.stringify(what)}); return p && { ...p, w: innerWidth, h: innerHeight }; })()`);
    return !!at && at.x > 0 && at.x < at.w && at.y > 0 && at.y < at.h;
  };
  const seen: string[] = [];
  for (const what of ["tally", "card:0", "card:3", "place:well", "place:stair", "book", "pile", "sheaf"]) if (!(await inView(what))) seen.push(`${what} at ${JSON.stringify(await page.run(`room.desk.screenOf(${JSON.stringify(what)})`))}`);
  check("on a phone, the reckoning, the cards, the places and your things are all in the picture", seen.length === 0, seen.join(", "));
  await page.wait(1200);
  await shot("15-phone");
  check("on a phone, touching a place writes its line", (await touch("place:gate")) && (await until("room.desk.mode === 'writing' && room.desk.draft === 'I go to River Gate.'", 5000)), String(await page.run("room.desk.draft")));
  await page.wait(1200);
  await shot("16-phone-writing");
  await rubOut();
  check("on a phone, the reckoning can be leaned over", (await touch("tally")) && (await until("room.desk.glance.k > 0.95", 5000)));
  await page.wait(500);
  await shot("17-phone-reckoning");
  const problems = page.problems.filter((p) => !/GPU stall|GL Driver|WebGL|no model in the pretend host|fell back/.test(p));
  check("no errors in the page", problems.length === 0, problems.slice(0, 4).join(" | "));
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
