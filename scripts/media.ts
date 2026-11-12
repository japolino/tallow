/**
 * The pictures and moving pictures in the README, taken with a browser that has no window (scripts/browser.ts).
 * Each moving picture is drawn frame by frame (the room only moves when told to), and ffmpeg makes the
 * frames into an animated WebP. Frames go to .artifacts/media/, the finished pictures to docs/media/.
 *
 *   bun scripts/media.ts               every picture
 *   bun scripts/media.ts dice weather  only the ones whose name has one of these words in it
 *
 * Needs ffmpeg on the PATH.
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { withPage, type Page } from "./browser.js";

const root = join(import.meta.dir, "..");
const frames = join(root, ".artifacts", "media");
const out = join(root, "docs", "media");
mkdirSync(out, { recursive: true });
const words = process.argv.slice(2);
const want = (name: string): boolean => !words.length || words.some((w) => name.includes(w));

const W = 1280, H = 800;
const FPS = 15;

/** Run the room on by so many seconds, a tenth at a time, letting the game's own waiting code run in between. */
const go = (s: number): string => `(async () => { for (let i = 0; i < ${Math.round(s * 10)}; i++) { room.advance(0.1); await new Promise((r) => setTimeout(r, 0)); } })()`;
/** Play on until something is true, hurrying the narrator's speech. */
const until = (cond: string, max = 60): string =>
  `(async () => { const d = room.desk; for (let i = 0; i < ${max * 10} && !(${cond}); i++) { room.advance(0.1); d.voice.hurry(); await new Promise((r) => setTimeout(r, 0)); } return !!(${cond}); })()`;

/** A run of frames: before each, `step` is run in the page (it should move the room on). */
class Reel {
  private n = 0;
  constructor(private page: Page, private name: string) {
    // The grain holds still between frames, as it does with reduced motion: grain that changes every frame leaves a
    // GIF nothing to share from one frame to the next.
    void page.run("(() => { const p = room.post; if (!p.held) { const set = p.set.bind(p); p.set = (o) => set({ ...o, still: true }); p.held = true; } })()");
    rmSync(join(frames, name), { recursive: true, force: true });
    mkdirSync(join(frames, name), { recursive: true });
  }
  async frame(step = `room.advance(${1 / FPS})`): Promise<void> {
    await this.page.run(`(async () => { ${step}; await new Promise((r) => setTimeout(r, 0)); })()`);
    await this.page.shot(join(frames, this.name, `${String(this.n++).padStart(4, "0")}.png`), { x: 0, y: 0, width: W, height: H });
  }
  async frames(count: number, step?: string): Promise<void> {
    for (let i = 0; i < count; i++) await this.frame(step);
  }
  /**
   * Make the moving picture: an animated WebP, `width` across, played at `fps`. GitHub shows it in place as a GIF
   * would be, at a fraction of the size (the room's flickering light gives a GIF little to share between frames).
   */
  async anim(width = 720, fps = FPS): Promise<void> {
    const src = join(frames, this.name, "%04d.png");
    const file = join(out, `${this.name}.webp`);
    const p = Bun.spawnSync(["ffmpeg", "-y", "-loglevel", "error", "-framerate", String(fps), "-i", src, "-vf", `scale=${width}:-1:flags=lanczos`, "-c:v", "libwebp_anim", "-lossless", "0", "-quality", "72", "-compression_level", "4", "-loop", "0", file]);
    if (p.exitCode) throw new Error(`ffmpeg: ${p.stderr.toString()}`);
    console.log(`${this.name}.webp: ${this.n} frames, ${(Bun.file(file).size / 1e6).toFixed(1)} MB`);
  }
}

/** A still, as a JPEG in docs/media. */
const still = async (page: Page, name: string): Promise<void> => {
  await page.shot(join(out, `${name}.jpg`), { x: 0, y: 0, width: W, height: H });
  console.log(`${name}.jpg`);
};

type Scene = (page: Page) => Promise<void>;
const scenes: [string, Scene][] = [];
const scene = (name: string, fn: Scene): void => void scenes.push([name, fn]);

// The room at golden hour, and at night in a storm: the pictures at the top of the README.
scene("room", async (page) => {
  await page.open("t=18.3&hud=0&patrol=0&play=0");
  await page.run("room.advance(3)");
  await still(page, "room-golden");
  await page.open("t=22.5&weather=rain&hud=0&patrol=0&play=0");
  await page.run("room.advance(6)");
  await still(page, "room-night-rain");
});

// A day and a night passing outside the window, the weather changing as it goes, the candles set out and burning down.
scene("weather", async (page) => {
  await page.open("t=7&hud=0&patrol=0&play=0");
  await page.run("room.advance(2)");
  const reel = new Reel(page, "weather");
  const plan: [number, string][] = [[0, "clear"], [24, "rain"], [48, "storm"], [72, "fog"], [96, "snow"], [124, "wind"], [146, "clear"]];
  for (let f = 0; f < 165; f++) {
    const w = plan.find(([at]) => at === f);
    const hour = (7 + f * 0.15) % 24;
    await reel.frame(`${w ? `room.setWeather("${w[1]}"); ` : ""}room.setClock(${hour.toFixed(3)}); room.advance(0.2)`);
  }
  await reel.anim(720);
});

// Your hand takes a die from the box, shakes it, lets it go; it lands, and you lean in to read it.
scene("dice", async (page) => {
  await page.open("t=20&hud=0&patrol=0&play=0");
  await page.run("room.advance(1.5); void room.offerDie(17)");
  const reel = new Reel(page, "dice");
  await reel.frames(26);
  for (let i = 0; i < 22; i++) {
    const a = i * 0.9;
    await page.mouse("move", W / 2 + Math.cos(a) * 90, H * 0.62 + Math.sin(a) * 60);
    await reel.frame(`room.shakeIn = 1.4; room.advance(${1 / FPS})`);
  }
  await page.run("room.releaseDie()");
  await reel.frames(75);
  await reel.anim(720);
});

// One turn at the table: you write a line, tear it off and hand it over; the narrator weighs it, you throw, and it
// writes what happened under your line and hands the page back.
scene("turn", async (page) => {
  await page.open("moment=1&seed=moss");
  await page.run(until("room.desk.mode === 'holding'"));
  await page.run("void room.desk.setDown()");
  await page.run(until("room.desk.inviting && room.desk.mode === 'idle' && !room.desk.onDie"));
  await page.run(go(1));
  const reel = new Reel(page, "turn");
  await reel.frame("room.desk.open(); room.advance(0.1)");
  await reel.frames(12, "room.advance(0.1)");
  const line = "I offer to put her sums right if she lifts the bar";
  for (let i = 0; i < line.length; i += 2) {
    const two = JSON.stringify(line.slice(i, i + 2));
    await reel.frame(`const f = document.querySelector("textarea"); f.value += ${two}; f.dispatchEvent(new Event("input")); room.advance(0.08)`);
  }
  await reel.frames(4, "room.advance(0.1)");
  await reel.frame("room.desk.submit(); room.advance(0.1)");
  // Handed over, read, the balance loaded: on at twice the pace, hurrying the narrator's words.
  for (let i = 0; i < 70 && !(await page.run<boolean>("!!room.desk.onDie && !room.desk.voice.speaking && room.desk.glance.k < 0.02")); i++)
    await reel.frame("room.advance(0.14); room.desk.voice.hurry()");
  await reel.frames(5, "room.advance(0.1)");
  await reel.frame("room.desk.onDie(); room.advance(0.1)");
  await reel.frames(14, "room.advance(0.1)");
  await reel.frame("room.releaseDie(); room.advance(0.1)");
  for (let i = 0; i < 110 && !(await page.run<boolean>("room.desk.mode === 'holding'")); i++) await reel.frame("room.advance(0.12); room.desk.voice.hurry()");
  await reel.frames(22, "room.advance(0.1)");
  await reel.anim(720, 12);
});

// The pages you have read, picked up as a stack and leafed through: your thumb draws the front one out and tucks it in
// behind. Then your own sheets, the other stack.
scene("pages", async (page) => {
  await page.open("t=19&hud=0&patrol=0&play=0");
  await page.run(`(async () => {
    const d = room.desk;
    d.sheets([
      { heading: "Who you are", his: ["You are Mara Vell, a lock-breaker from the river quarter, quick and quiet and owed money by half the wharf.", "Level 2. Health 5 of 6. Supplies 3. Goodwill 1. Grit 4 of 4.", "Your strengths, each out of 4:\\nBrawn 1: strength and toughness.\\nGrace 3: quiet feet, quick hands and a sure step.\\nCharm 1: warmth, nerve and a way with people.\\nGuile 2: a straight face, a good lie and a light touch.\\nWits 2: knowing things, working things out.\\nSense 1: noticing things, reading people.", "In a fight: Stamina 8, Composure 8, Defense 13."] },
      { heading: "What you can do", his: ["Your trick, Sleight: a coin walks your knuckles and is gone. It always works and needs no die.", "Your gift, Ember in the Palm: a coal of red light wakes in your hand. For 1 of your grit, a try where a lock or a gate comes into it is one step easier.", "Your grit: 4 of it. Some of what you can do costs 1 of it."] },
      { heading: "Who walks with you", his: ["Wren Halloway: a road-worn tinker with quick hands. Your Grace counts one higher. Likes it when you slip by unseen; hates it when you pay your way."] },
    ]);
    const turns = [
      ["Over the toll bridge", "The keeper counts your coins twice and waves you over. Behind you the bar comes down again."],
      ["The mill at Odo's", "The wheel is still. Someone has nailed the door shut from the outside, and recently."],
      ["Past the dog", "You go round by the ditch, low and slow. The dog lifts its head, and puts it down."],
      ["The ledger", "Her sums were wrong by eleven crowns. She lifts the bar herself, and does not look at you."],
    ];
    for (const [heading, line] of turns) {
      const p = d.handBack({ heading, his: [line] });
      for (let i = 0; i < 200 && d.mode !== "holding"; i++) { room.advance(0.1); await new Promise((r) => setTimeout(r, 0)); }
      const s = d.setDown();
      for (let i = 0; i < 25; i++) { room.advance(0.1); await new Promise((r) => setTimeout(r, 0)); }
      await s; await p;
    }
  })()`);
  await page.run(go(1));
  const reel = new Reel(page, "pages");
  await reel.frames(8);
  await reel.frame(`void room.desk.pickUp(); room.advance(${1 / FPS})`);
  await reel.frames(30);
  for (const by of [-1, -1, -1, 1]) {
    await reel.frame(`void room.desk.leaf(${by}); room.advance(${1 / FPS})`);
    await reel.frames(18);
  }
  await reel.frame(`void room.desk.setDown(); room.advance(${1 / FPS})`);
  await reel.frames(22);
  await reel.frame(`void room.desk.pickUp(undefined, room.desk.sheaf); room.advance(${1 / FPS})`);
  await reel.frames(30);
  for (const by of [1, 1]) {
    await reel.frame(`void room.desk.leaf(${by}); room.advance(${1 / FPS})`);
    await reel.frames(22);
  }
  await reel.anim(720);
});

// A card dealt to your side, picked up and held to your eyes to read what it does.
scene("cards", async (page) => {
  await page.open("t=19&hud=0&patrol=0&play=0");
  await page.run(`(async () => {
    const d = room.desk;
    const cards = [
      ["a", "lantern", "Ember in the Palm", "Gift. A coal of red light wakes in your hand. For 1 of your grit, a try where a lock or a gate comes into it is one step easier."],
      ["b", "companion", "Wren Halloway", "A road-worn tinker with quick hands. Your Grace counts one higher. Likes it when you slip by unseen; hates it when you pay your way."],
      ["c", "key", "Brass key of the mill", "Use it to go unseen: that try is one step easier, once."],
    ];
    for (const [id, kind, name, text] of cards) {
      const p = d.cards.give({ id, kind, name, text });
      for (let i = 0; i < 30; i++) { room.advance(0.1); await new Promise((r) => setTimeout(r, 0)); }
      await p;
    }
  })()`);
  await page.run(go(1));
  const reel = new Reel(page, "cards");
  await reel.frames(10);
  for (const i of [0, 1, 2]) {
    await reel.frame(`void room.desk.cards.look(${i}); room.advance(${1 / FPS})`);
    await reel.frames(30);
  }
  await reel.frame(`void room.desk.cards.unlook(); room.advance(${1 / FPS})`);
  await reel.frames(14);
  await reel.anim(720);
  await page.run(`void room.desk.cards.look(0)`);
  await page.run(go(1.2));
  await still(page, "card-held");
});

// The card art on its own: every kind of card's face, and the back.
scene("deck", async (page) => {
  await page.open("hud=0&play=0&patrol=0");
  await page.run(`location.href = location.origin + "/cards"`);
  await page.wait(2500);
  const size = await page.run<{ w: number; h: number }>("({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })");
  await page.size(W, Math.max(H, Math.min(2400, size.h)));
  await page.wait(500);
  await page.shot(join(out, "deck.jpg"));
  await page.size(W, H);
  console.log("deck.jpg");
});

// The battle mat unrolled for a fight, the enemies' next moves chalked on it.
scene("mat", async (page) => {
  await page.open("t=20&hud=0&patrol=0&play=0&mat=1&seed=tavern");
  await page.run(go(3));
  await still(page, "mat");
  await page.run("room.lean(true)");
  await page.run(go(2));
  await still(page, "mat-close");
});

const chosen = scenes.filter(([name]) => want(name));
await withPage({ width: W, height: H }, async (page) => {
  await page.size(W, H);
  for (const [name, fn] of chosen) {
    console.log(`- ${name}`);
    await fn(page);
  }
  if (page.problems.length) console.log(`problems in the page:\n${page.problems.slice(0, 10).join("\n")}`);
});
