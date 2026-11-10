/**
 * Pictures of the room in every state worth looking at, taken with a browser
 * that has no window (scripts/browser.ts). They go to .artifacts/room/.
 *
 *   bun scripts/shots.ts            every picture
 *   bun scripts/shots.ts rain hand  only the ones whose name has one of these words in it
 *   SOFT=1 bun scripts/shots.ts     draw with the software renderer (a slow machine)
 *   TALLOW_PORT=4190 bun scripts/shots.ts   serve the preview on another port
 */
import { join } from "node:path";
import { withPage, type Page } from "./browser.js";

const out = join(import.meta.dir, "..", ".artifacts", "room");
const words = process.argv.slice(2);
const want = (name: string): boolean => !words.length || words.some((w) => name.includes(w));

type Clip = { x: number; y: number; width: number; height: number; scale?: number };
type Scene = (page: Page, save: (suffix?: string, clip?: Clip) => Promise<void>) => Promise<void>;
const scenes: [string, Scene][] = [];
const scene = (name: string, fn: Scene): void => void scenes.push([name, fn]);
/** One picture of the room as it stands after `seconds` of its own time. */
const still = (name: string, query: string, seconds = 3): void =>
  scene(name, async (page, save) => {
    await page.open(`${query}&hud=0&patrol=0`);
    await page.run(`room.advance?.(${seconds})`);
    await save();
  });

// The hours of the day, in clear weather.
for (const [name, t] of [["dawn", 6.3], ["morning", 8.5], ["noon", 12.5], ["afternoon", 15.5], ["golden", 18.3], ["dusk", 19.6], ["night", 23]] as const) still(`time-${name}`, `t=${t}`);

// The candles through the night: new at dusk, stubs by morning, cold all day.
for (const t of [18.3, 21, 0, 3, 6, 6.9, 7.5]) still(`candles-${String(t).replace(".", "_")}`, `t=${t}&lean=1`, 2);

// Every kind of weather, by day and by night.
for (const w of ["rain", "storm", "fog", "wind", "snow"]) {
  still(`weather-${w}-day`, `t=14&weather=${w}`, 6);
  still(`weather-${w}-night`, `t=22&weather=${w}`, 6);
}
// The same weather seen close, through each window.
for (const w of ["rain", "storm", "fog", "wind", "snow"])
  scene(`window-${w}`, async (page, save) => {
    await page.open(`t=14&weather=${w}&hud=0&patrol=0`);
    await page.run("room.lookFrom([0.2, 0.7, 0.3], [-2.3, 0.9, -0.4], 45); room.advance(6)");
    await save("-left");
    await page.run("room.lookFrom([0.9, 0.55, 0.3], [-0.5, 1.0, -2.5], 40); room.advance(1)");
    await save("-back");
    await page.run("room.setClock(22); room.advance(3)");
    await save("-back-night");
  });
scene("weather-storm-flash", async (page, save) => {
  await page.open("t=22&weather=storm&hud=0&patrol=0");
  // Step on until the sky is lit, then take the picture inside the flash.
  await page.run(`(() => { for (let i = 0; i < 4000 && room.flash < 0.6; i++) room.advance(1 / 60); return room.flash; })()`);
  await save();
});

// The narrator sets out new candles as the light goes.
scene("candles-set", async (page, save) => {
  await page.open("t=18.1&hud=0&patrol=0");
  await page.run("room.advance(1)");
  await save("-0-before");
  await page.run("room.setClock(18.4)");
  for (const [i, s] of [0.9, 0.9, 0.7, 0.8, 1.2, 2, 2, 3].entries()) {
    await page.run(`room.advance(${s})`);
    await save(`-${i + 1}`);
  }
});

// Your hand: taking the die, holding it, shaking it, letting go, and leaning in to read it.
scene("hand", async (page, save) => {
  await page.open("t=20&hud=0&patrol=0");
  await page.run("void room.offerDie(14)");
  await page.run("room.advance(0.75)");
  await save("-0-reach");
  await page.run("room.advance(1.2)");
  await save("-1-held");
  await save("-1-held-close", { x: 440, y: 340, width: 420, height: 340, scale: 2 });
  await page.run("room.shakeIn = 1; room.advance(0.05); room.shakeIn = 1; room.advance(0.05); room.shakeIn = 1; room.advance(0.05)");
  await save("-2-shaken");
  await page.run("room.advance(1); room.releaseDie(); room.advance(0.12)");
  await save("-3-let-go");
  await page.run("room.advance(0.3)");
  await save("-4-flying");
  await page.run("room.advance(0.5)");
  await save("-4b-landing");
  await page.run("room.advance(1.6)");
  await save("-5-read");
  await page.run("room.advance(2.6)");
  await save("-5b-sitting-back");
  await page.run("room.advance(2)");
  await save("-6-sat-back");
});
scene("hand-day", async (page, save) => {
  await page.open("t=12.5&hud=0&patrol=0");
  await page.run("void room.offerDie(7)");
  await page.run("room.advance(2.2)");
  await save();
});

// The pieces, close.
scene("pieces", async (page, save) => {
  await page.open("t=20&hud=0&patrol=0");
  await page.run("room.lookFrom([-0.2, 0.2, 0.42], [-0.36, 0.045, 0.08], 26); room.advance(1)");
  await save("-yours");
  await page.run("room.lookFrom([0.28, 0.16, 0.12], [0.09, 0.05, -0.33], 24); room.advance(1)");
  await save("-narrators");
  await page.run("room.setClock(12.5); room.advance(3)");
  await save("-narrators-noon");
});

// The narrator moves its own piece.
scene("piece", async (page, save) => {
  await page.open("t=20&hud=0&patrol=0&lean=1");
  await page.run("room.advance(1.5)");
  await page.run(`void room.movePiece("shadow", PATROL[1])`);
  for (const [i, s] of [0.5, 0.5, 0.5, 0.5, 0.6, 1.5].entries()) {
    await page.run(`room.advance(${s})`);
    await save(`-${i}`);
  }
});
scene("piece-seat", async (page, save) => {
  await page.open("t=18.3&hud=0&patrol=0");
  await page.run("room.advance(1.5)");
  await page.run(`void room.movePiece("shadow", PATROL[1])`);
  await page.run("room.advance(1.4)");
  await save();
});

// The narrator's hand at work, close: its fingers closing on the head of its piece, the piece carried and set down.
scene("grip-piece", async (page, save) => {
  await page.open("t=20&hud=0&patrol=0");
  await page.run("room.advance(1.5)");
  // Keep the eye on the piece wherever the hand takes it.
  const aim = `(() => { const p = room.pieces.get("shadow").mesh.position; room.lookFrom([p.x + 0.16, 0.2, p.z + 0.3], [p.x, 0.1, p.z], 26); })()`;
  await page.run(`void room.movePiece("shadow", PATROL[1])`);
  for (const [i, s] of [0.7, 0.5, 0.35, 0.2, 0.25, 0.4, 0.5, 0.5, 0.5, 0.35, 0.35, 0.5, 0.8].entries()) {
    await page.run(`${aim}; room.advance(${s}); ${aim}; room.advance(1 / 60)`);
    await save(`-${String(i).padStart(2, "0")}`);
  }
  // The same grip from the side, by daylight, where nothing is hidden.
  await page.open("t=12.5&hud=0&patrol=0");
  await page.run("room.advance(1.5)");
  await page.run(`void room.movePiece("shadow", PATROL[1])`);
  await page.run(`room.advance(2.4); (() => { const p = room.pieces.get("shadow").mesh.position; room.lookFrom([p.x - 0.3, 0.12, p.z + 0.05], [p.x, 0.1, p.z], 24); })(); room.advance(1 / 60)`);
  await save("-side");
});
// And setting out a candle: carried by its top, stood in the dish, let go of, and lit with a pinch at the wick.
scene("grip-candle", async (page, save) => {
  await page.open("t=18.1&hud=0&patrol=0");
  await page.run("room.advance(1); room.setClock(18.4); room.lookFrom([-0.36, 0.42, 0.0], [-0.7, 0.2, -0.47], 30)");
  for (const [i, s] of [0.8, 0.5, 0.4, 0.4, 0.4, 0.3, 0.3, 0.3, 0.3, 0.25, 0.25, 0.3, 0.4, 0.6].entries()) {
    await page.run(`room.advance(${s})`);
    await save(`-${String(i).padStart(2, "0")}`);
  }
});

// The small things the narrator does with its hands. Each from your seat, and close.
for (const [name, times] of [
  ["slam", [0.4, 0.35, 0.2, 0.07, 0.3, 1.0, 1.0]],
  ["drum", [0.4, 0.2, 0.2, 0.5, 1.2]],
  ["tap", [0.6, 0.25, 0.15, 2.4]],
  ["steeple", [0.6, 0.9, 2, 2.6, 1.2]],
  ["flick", [0.45, 0.1, 0.1, 0.4, 0.9]],
] as const)
  scene(`gesture-${name}`, async (page, save) => {
    for (const close of [false, true]) {
      await page.open("t=20&hud=0&patrol=0");
      await page.run(`${close ? "room.lookFrom([0.5, 0.3, -0.25], [0.12, 0.08, -0.72], 30); " : ""}room.advance(1.5); room.gesture("${name}")`);
      for (const [i, s] of times.entries()) {
        await page.run(`room.advance(${s})`);
        await save(`-${close ? "close" : "seat"}-${i}`);
      }
    }
  });

// The narrator, close: the hood at each hour, and from the side.
scene("narrator", async (page, save) => {
  for (const [name, t] of [["golden", 18.3], ["noon", 12.5], ["night", 23]] as const) {
    await page.open(`t=${t}&hud=0&patrol=0`);
    await page.run("room.lookFrom([0.1, 0.62, 0.55], [0, 0.6, -1.1], 32); room.advance(2)");
    await save(`-${name}`);
  }
  await page.run("room.lookFrom([1.1, 0.75, -0.2], [0, 0.6, -1.1], 34); room.advance(1)");
  await save("-side");
});

// Other ways the room is shown.
still("lean", "t=18.3&lean=1");
still("reduced", "t=23&weather=storm&reduced=1");
still("no-models", "t=18.3&models=0");
still("flat", "t=23&weather=rain&flat=1", 0);
for (const q of [1, 2, 3, 4]) still(`quality-${q}`, `t=20&weather=snow&quality=${q}`);
scene("phone", async (page, save) => {
  await page.size(390, 844);
  await page.open("t=18.3&patrol=0&hud=0");
  await page.run("room.advance(2)");
  await save("-upright");
  await page.run("room.lean(true); room.advance(2)");
  await save("-upright-lean");
  await page.size(844, 390);
  await page.run("room.lean(false); room.advance(2)");
  await save("-sideways");
  await page.size(1024, 768);
});

// One moment of the game, played at the table as a player would: a try that fails, then one that works at a cost.
// The seed "moss" throws a 3 and then a 9. Nothing is on the screen but the room.
/** Run the room on by so many seconds, a tenth at a time, letting the game's own waiting code run in between. */
const go = (s: number): string => `(async () => { for (let i = 0; i < ${Math.round(s * 10)}; i++) { room.advance(0.1); await new Promise((r) => setTimeout(r, 0)); } })()`;
/** Play on until something is true, hurrying the narrator's speech; with `down`, any page handed to you is set straight down. */
const until = (cond: string, o: { max?: number; down?: boolean } = {}): string =>
  `(async () => { const d = room.desk; for (let i = 0; i < ${(o.max ?? 90) * 10} && !(${cond}); i++) { room.advance(0.1); d.voice.hurry(); ${o.down ? "if (d.mode === 'holding') d.setDown();" : ""} await new Promise((r) => setTimeout(r, 0)); } return !!(${cond}); })()`;
const ASKED = "room.desk.inviting && room.desk.mode === 'idle' && !room.desk.onDie";
const HELD = "room.desk.mode === 'holding'";
const WEIGHED = "!!room.desk.onDie && !room.desk.voice.speaking";
/** Open the notebook and type a line into it, a letter at a time. */
const type = (line: string): string =>
  `(async () => { const d = room.desk; d.open(); room.advance(1.3); const f = document.querySelector("textarea"); for (const ch of ${JSON.stringify(line)}) { f.value += ch; f.dispatchEvent(new Event("input")); room.advance(0.04); } room.advance(0.3); })()`;
scene("moment", async (page, save) => {
  await page.size(1440, 900);
  await page.open("moment=1&seed=moss");
  await page.run(go(4));
  await save("-00-narrator-speaks");
  await page.run(until(HELD));
  await page.run(go(1));
  await save("-01-first-page-held");
  await page.run("void room.desk.setDown()");
  await page.run(go(0.3));
  await save("-02-setting-it-down");
  await page.run(until(ASKED));
  await page.run(go(1.5));
  await save("-03-asked");
  await page.run(type("I put my shoulder to the bar and heave"));
  await save("-04-writing");
  await page.run("room.desk.submit()");
  await page.run(go(0.75));
  await save("-05-torn-off");
  await page.run(go(0.9));
  await save("-06-held-out");
  await page.run(go(0.9));
  await save("-07-narrator-takes-it");
  await page.run(go(2.2));
  await save("-08-check-said");
  // You turn to the balance while it is loaded, and back to the table when the beam is at rest.
  await page.run(go(2.4));
  await save("-08-turning-to-the-balance");
  await page.run(until("room.desk.counters.tilt !== 0 && room.desk.glance.k > 0.9", { max: 20 }));
  await page.run(go(1.2));
  await save("-08-weights-in");
  await page.run(until(WEIGHED + " && room.desk.glance.k < 0.02"));
  await page.run(go(0.6));
  await save("-09-weighed");
  await page.run("room.desk.onDie()");
  await page.run(go(2));
  await save("-10-die-in-hand");
  await page.run("room.releaseDie()");
  await page.run(go(2.7));
  await save("-11-die-read");
  await page.run(until("play.stage === 'told' && room.desk.voice.showing", { max: 20 }));
  await page.run(go(2.5));
  await save("-12-told-and-stone-taken");
  await page.run(until("room.desk.mode === 'busy'", { max: 40 }));
  await page.run(go(1.2));
  await save("-13-narrator-writes");
  await page.run(until(HELD));
  await page.run(go(0.9));
  await save("-14-page-back");
  await page.run("void room.desk.setDown()");
  await page.run(until(ASKED));
  await page.run(type("I climb down and creep across by the rope walk"));
  await save("-15-second-line");
  await page.run("room.desk.submit()");
  await page.run(until(WEIGHED));
  await page.run(go(1.5));
  await save("-16-second-weighing");
  await page.run("room.desk.onDie()");
  await page.run(go(2));
  await page.run("room.releaseDie()");
  await page.run(until(HELD));
  await page.run(go(0.9));
  await save("-17-second-page");
  await page.run("void room.desk.setDown()");
  await page.run(until("play.stage === 'over'", { max: 40 }));
  await page.run(go(7));
  await save("-18-past");
  await page.run("room.desk.voice.hush(); void room.desk.pickUp()");
  await page.run(go(1.2));
  await save("-19-reading-the-pile");
  await page.run("void room.desk.leaf(-1)");
  await page.run(go(1.6));
  await save("-20-an-earlier-page");
  console.log("     ", await page.run("JSON.stringify({ over: play.moment.over, tries: play.moment.tries, pages: room.desk.pages.length, health: room.desk.counters.count('health'), supplies: room.desk.counters.count('supplies'), goodwill: room.desk.counters.count('goodwill') })"));
  await page.size(1024, 768);
});
// The things on your side of the table, seen close.
scene("desk-close", async (page, save) => {
  await page.size(1440, 900);
  await page.open("moment=1&seed=moss");
  await page.run(until(ASKED, { down: true }));
  await page.run("room.desk.voice.hush(); room.lookFrom([-0.26, 0.3, 0.76], [-0.26, 0, 0.3], 40); room.advance(1)");
  await save("-notebook-and-counters");
  await page.run("room.lookFrom(null)");
  await page.run(type("I ask her about the ledger and offer to check her sums"));
  await page.run("room.desk.submit()");
  await page.run(until(WEIGHED));
  await page.run("room.desk.voice.hush(); room.lookFrom([-0.24, 0.3, 0.34], [-0.64, 0.08, -0.2], 36); room.advance(2)");
  await save("-balance");
  await page.run("room.lookFrom([-0.1, 0.5, 0.2], [-0.22, 0, -0.5], 36); room.advance(0.5)");
  await save("-page-with-narrator");
  await page.run("room.lookFrom(null)");
  await page.size(1024, 768);
});
// Writing, seen as you see it: the pencil taken up off the notebook, a line being written, the page torn off.
scene("writing", async (page, save) => {
  await page.size(1440, 900);
  await page.open("moment=1&seed=moss");
  await page.run(until(ASKED, { down: true }));
  await page.run("room.desk.voice.hush(); room.advance(1.5)");
  await save("-0-notebook-shut");
  await page.run("room.desk.open(); room.advance(0.25)");
  await save("-1-hand-takes-pencil");
  await page.run("room.advance(0.45)");
  await save("-2-pencil-lifted");
  await page.run(type("I ask her about the ledger"));
  await save("-3-a-line");
  await page.run(type(" and offer to check her sums for her"));
  await save("-4-more");
  await page.run("room.desk.submit()");
  await page.run(go(0.5));
  await save("-5-torn");
  await page.size(1024, 768);
});
scene("moment-unclear", async (page, save) => {
  await page.size(1440, 900);
  await page.open("moment=1&seed=moss");
  await page.run(until(ASKED, { down: true }));
  await page.run(type("I stand there and think about it"));
  await page.run("room.desk.submit()");
  await page.run(go(6));
  await save();
  await page.size(1024, 768);
});
// Every way failing, with "reduce motion" on: the seed "hazel" throws 3, 8, 8, 7. You are turned back.
scene("moment-turned-back", async (page, save) => {
  await page.size(1440, 900);
  await page.open("moment=1&seed=hazel&reduced=1");
  for (const line of ["I shove the bar up", "I pay the toll", "I ask her kindly to let me by", "I creep past the dog"]) {
    await page.run(until(ASKED, { down: true }));
    await page.run(type(line));
    await page.run("room.desk.submit()");
    await page.run(until(WEIGHED));
    await page.run("room.desk.onDie()");
    await page.run(go(0.5));
    await page.run("room.releaseDie()");
    await page.run(until(HELD + " || play.stage === 'over'"));
  }
  await page.run(until("play.stage === 'over'", { down: true }));
  await page.run(go(3));
  await save();
  console.log("     ", await page.run("JSON.stringify({ over: play.moment.over, tries: play.moment.tries, shadow: room.pieces.get('shadow').at, you: room.pieces.get('you').at, health: room.desk.counters.count('health'), supplies: room.desk.counters.count('supplies'), goodwill: room.desk.counters.count('goodwill') })"));
  await page.size(1024, 768);
});
// The room's own controls, on their own page.
scene("controls", async (page, save) => {
  await page.open("play=0&patrol=0&t=12.5");
  await page.run("room.advance(2)");
  await save();
});
scene("moment-phone", async (page, save) => {
  await page.size(390, 844);
  await page.open("moment=1&seed=moss");
  await page.run(go(4));
  await save("-upright-speaking");
  await page.run(until(HELD));
  await page.run(go(1));
  await save("-upright-page");
  await page.run("void room.desk.setDown()");
  await page.run(until(ASKED));
  await page.run(type("I put my shoulder to the bar and heave"));
  await save("-upright-writing");
  await page.run("room.desk.submit()");
  await page.run(until(WEIGHED));
  await page.run(go(1.5));
  await save("-upright-weighed");
  await page.size(1024, 768);
});

// TALLOW_PORT moves the preview server off its usual port, for when something else has it.
await withPage({ soft: process.env.SOFT === "1", port: Number(process.env.TALLOW_PORT) || undefined }, async (page) => {
  for (const [name, fn] of scenes) {
    if (!want(name)) continue;
    const save = (suffix = "", clip?: Clip): Promise<void> => page.shot(join(out, `${name}${suffix}.jpg`), clip);
    try {
      await fn(page, save);
      console.log("ok  ", name);
    } catch (err) {
      console.log("FAIL", name, String(err).split("\n")[0]);
    }
  }
  if (page.problems.length) console.log("\nThe page complained:\n" + [...new Set(page.problems)].join("\n"));
});
process.exit(0);
