/**
 * Films a clip for each thing the game does, for a trailer (the camera is scripts/film.ts): the built extension in the
 * pretend host, 1920 by 1080 at 30 frames a second, without sound, into .artifacts/trailer-clips/.
 *
 *   bun run build && bun scripts/film-clips.ts      every reel
 *   bun scripts/film-clips.ts room systems          only the reels named (room, turn, systems, deck, phone)
 *   bun scripts/film-clips.ts turn:die room:snow    only the clips of a reel whose names contain the word
 *
 * A reel is one sitting, played in order; a clip that is not wanted is played through without pictures, so the ones
 * after it still find the table as they expect. Reels can be filmed side by side, each with its own TALLOW_PORT.
 */
import { SAMPLES, type Fill } from "../preview/propsamples.js";
import { FPS, H, W, heard, hurry, reel, sitDown, type Film, type View } from "./film.js";

/** The field the keys go into: the one with the keyboard, inside the room's own shadow tree. */
const FIELD = "(() => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; })()";

async function press(f: Film, ch: string): Promise<void> {
  const vk = /^[a-z0-9 ]$/i.test(ch) ? { windowsVirtualKeyCode: ch === " " ? 32 : ch.toUpperCase().charCodeAt(0) } : {};
  await f.page.cdp("Input.dispatchKeyEvent", { type: "keyDown", text: ch, unmodifiedText: ch, key: ch, code: ch === " " ? "Space" : "", ...vk });
  await f.page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: ch, code: ch === " " ? "Space" : "", ...vk });
}
/** Type a line the way a person does: a letter every two or three pictures, a breath at a comma. */
async function typeLine(f: Film, text: string): Promise<void> {
  let n = 7;
  for (const ch of text) {
    await press(f, ch);
    n = (n * 31 + 11) % 97;
    await f.roll((ch === "," || ch === "." ? 7 : 1 + (n % 3)) / FPS);
  }
}
/** Rub out what is on the pad and shut the notebook, without pictures. */
async function rubOut(f: Film): Promise<void> {
  await f.run(`(${FIELD}.value = "", ${FIELD}.dispatchEvent(new Event("input")), 1)`);
  await f.skip(0.3);
  await f.page.key("Escape");
  await f.skip(0.8);
}
/** Bring the pointer over something of the desk's, let the view settle on it, and touch it; pictures are taken meanwhile. */
async function touchSlow(f: Film, what: string): Promise<boolean> {
  let at: { x: number; y: number } | null = null;
  for (let i = 0; i < 3; i++) {
    at = await f.run<{ x: number; y: number } | null>(`room.desk.screenOf(${JSON.stringify(what)})`);
    if (!at) return false;
    await f.page.mouse("move", at.x, at.y);
    await f.roll(0.4);
  }
  await f.click(at!.x, at!.y);
  return true;
}
/** A whole turn played without pictures: a line that calls for the die, the die, the story, the page set down. */
async function quickTurn(f: Film, line: string): Promise<void> {
  await hurry(f);
  await f.page.type(line);
  await f.skip(0.3);
  await f.page.key("Enter");
  await hurry(f, "!!room.desk.onDie", 60);
  await f.page.key("Enter");
  await f.skip(1);
  await hurry(f);
}

const MAP1 = {
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
};
const MAP2 = {
  ...MAP1,
  places: [...MAP1.places.map((p) => (p.id === "mill" ? { ...p, seen: true } : p)), { id: "well", name: "The Sunken Well", seen: false, note: "the boy ran this way" }],
  ways: [...MAP1.ways, ["gate", "well"]],
  at: "market",
};
const CARDS1 = [
  { kind: "card", id: "q1", group: "quests", title: "The Boy's Errand", text: "Find out who sent the boy with the hooked knife, and why. Next: ask at the Lamplighters' Stair (0 of 1).", line: "I ask the boy who sent him." },
  { kind: "card", id: "w1", group: "Old Hesk's wares", title: "Lamp oil: 12 silver", text: "A flask of good oil, enough for a night. 3 left.", line: "I buy the lamp oil from Old Hesk." },
  { kind: "card", id: "p1", group: "perks", title: "Sure-Footed", text: "You have learned to trust your feet on bad ground. Climbing rises by 1, and a fall costs you less than it should.", line: "I take Sure-Footed." },
  { kind: "card", id: "c1", group: "choices", title: "Follow the smoke to the Old Mill", text: "", line: "Follow the smoke to the Old Mill" },
];
// Only what the run's systems do lay out (quests, a merchant's wares, the lines of a contest, choices): the table can
// draw other kinds of card, but nothing in the game deals them.
const CARDS2 = [
  { kind: "card", id: "q2", group: "quests", title: "The Woman in Grey", text: "The boy says a woman in grey sent him. Find her before she finds you. Next: follow the smoke to the Old Mill (0 of 1)." },
  { kind: "card", id: "w2", group: "Old Hesk's wares", title: "Hooded lantern: 5 silver", text: "A lantern that can be shut to a sliver of light. 1 left.", line: "I buy the hooded lantern from Old Hesk." },
  { kind: "card", id: "e1", group: "The fight on the weir", title: "Hold the bridge", text: "A way to go about the fight on the weir.", line: "Hold the bridge" },
  { kind: "card", id: "c2", group: "choices", title: "Give the boy up to the watch", text: "", line: "Give the boy up to the watch" },
];
const METERS1 = [
  { kind: "bar", id: "b1", group: "Needs", name: "Hunger", value: 3, max: 10, good: "down" },
  { kind: "bar", id: "b2", group: "fight", name: "The boy with the hooked knife", value: 6, max: 8, good: "down", note: "power 2 of 7" },
  { kind: "tokens", id: "t1", name: "Saves from a killing blow", count: 2, max: 3 },
];
const METERS2 = [
  { kind: "bar", id: "b1", group: "Needs", name: "Hunger", value: 5, max: 10, good: "down" },
  { kind: "bar", id: "b3", group: "Needs", name: "Fatigue", value: 2, max: 6, good: "down" },
  { kind: "bar", id: "b2", group: "fight", name: "The boy with the hooked knife", value: 2, max: 8, good: "down", note: "power 2 of 7" },
  { kind: "bar", id: "b4", group: "fight", name: "The woman in grey", value: 7, max: 8, good: "down", note: "power 5 of 7" },
  { kind: "tokens", id: "t1", name: "Saves from a killing blow", count: 1, max: 3 },
];
const show = (f: Film, list: object[]): Promise<unknown> => f.run(`(room.show(${JSON.stringify(list)}), 1)`);
const sideIds = "room.desk.cards.sideCards.map((c) => c.id).join(' ')";
const piece = "[...room.pieces.values()].find((p) => p.kind === 'player')";

type Clip = (name: string, make: () => Promise<void>) => Promise<void>;

/** The room by itself: the narrator, the hours, the weather. The game is at rest, waiting for a line. */
async function roomReel(f: Film, clip: Clip): Promise<void> {
  await sitDown(f);
  await hurry(f);
  await f.run("(room.desk.voice.hush(), 1)");
  await f.skip(2);
  const hour = (h: number): Promise<unknown> => f.run(`(room.setClock(${h}), 1)`);

  await clip("01-the-room", async () => {
    await f.cam({ eye: [1.05, 0.8, 1.65], look: [-0.1, 0.22, -0.6], fov: 40 }, { eye: [0.5, 0.6, 1.3], look: [-0.05, 0.2, -0.6], fov: 40 }, 9);
    await f.roll(9);
  });
  await clip("02-the-narrator", async () => {
    await f.cam({ eye: [0.5, 0.48, 0.4], look: [0, 0.5, -1.14], fov: 38 }, { eye: [0.14, 0.55, -0.05], look: [0, 0.6, -1.14], fov: 34 }, 8);
    await f.roll(8);
  });
  await clip("03-the-narrators-hands", async () => {
    await f.cam({ eye: [-0.8, 0.2, 0.6], look: [0.05, 0.2, -0.9], fov: 38 }, { eye: [-0.55, 0.24, 0.75], look: [0.05, 0.22, -0.9], fov: 38 }, 15);
    await f.roll(0.6);
    for (const [g, s] of [["drum", 3.2], ["slam", 3.6], ["steeple", 4], ["flick", 3]] as const) {
      await f.run(`room.gesture(${JSON.stringify(g)})`);
      await f.roll(s);
    }
  });
  await clip("04-a-day-and-a-night", async () => {
    await f.cam({ eye: [0.75, 0.7, 1.5], look: [-0.15, 0.3, -0.7], fov: 42 }, { eye: [-0.2, 0.6, 1.35], look: [-0.1, 0.3, -0.7], fov: 42 }, 22);
    const n = 22 * FPS;
    for (let i = 0; i < n; i++) {
      await hour(14.5 + (17.5 * i) / n);
      await f.roll(1 / FPS);
    }
  });
  const weather: [string, string, number, View, View][] = [
    ["05-rain", "rain", 17.9, { eye: [0.35, 0.5, 1.25], look: [-0.2, 0.5, -1.2], fov: 42 }, { eye: [0.2, 0.52, 0.85], look: [-0.2, 0.56, -1.2], fov: 42 }],
    ["06-storm", "storm", 22.4, { eye: [0.9, 0.6, 0.9], look: [-1.2, 0.6, -0.9], fov: 44 }, { eye: [0.6, 0.58, 0.8], look: [-1.2, 0.62, -0.9], fov: 44 }],
    ["07-fog", "fog", 7.3, { eye: [-0.5, 0.45, 1.3], look: [0, 0.4, -1], fov: 42 }, { eye: [-0.2, 0.5, 1.1], look: [0, 0.42, -1], fov: 42 }],
    ["08-wind", "wind", 16.9, { eye: [0.35, 0.5, 1.25], look: [-0.2, 0.5, -1.2], fov: 42 }, { eye: [0.55, 0.55, 1.05], look: [-0.5, 0.55, -1.2], fov: 42 }],
    ["09-snow", "snow", 8.4, { eye: [0.9, 0.6, 0.9], look: [-1.2, 0.6, -0.9], fov: 44 }, { eye: [0.4, 0.55, 1.1], look: [-0.6, 0.55, -1.2], fov: 44 }],
  ];
  for (const [name, w, h, from, to] of weather) {
    await hour(h);
    await f.run(`(room.setWeather("clear"), 1)`);
    await f.skip(4);
    await clip(name, async () => {
      await f.cam(from, to, 9);
      await f.roll(0.7);
      await f.run(`(room.setWeather(${JSON.stringify(w)}), 1)`);
      await f.roll(8.3);
    });
  }
  await f.run(`(room.setWeather("clear"), 1)`);
  await hour(23.2);
  await f.skip(5);
  await clip("10-candles-at-night", async () => {
    await f.cam({ eye: [-0.75, 0.12, 0.7], look: [0.1, 0.25, -0.9], fov: 38 }, { eye: [-0.4, 0.18, 0.62], look: [0.1, 0.27, -0.9], fov: 38 }, 8);
    await f.roll(8);
  });
}

/** One turn at the table, from sitting down to the page handed back, and the papers on your side. */
async function turnReel(f: Film, clip: Clip): Promise<void> {
  await sitDown(f);
  await clip("01-sitting-down", async () => {
    f.drift(true);
    // Heard is "given to be said": the clip runs until the last of it is out.
    await f.rollUntil(`${heard("Write what you do")} && !room.desk.voice.speaking`, 50, 1);
  });
  await hurry(f);
  await clip("02-writing-a-line", async () => {
    f.drift(true);
    await f.roll(0.8);
    f.drift(false);
    await typeLine(f, "I sneak up the stair toward the nearest lamp, keeping to the wall.");
    await f.roll(0.7);
    await f.page.key("Enter");
    await f.roll(4);
  });
  await clip("03-the-check-is-named", async () => {
    f.drift(true);
    await f.rollUntil("!!room.desk.onDie", 34, 2);
  });
  await clip("04-the-die", async () => {
    await f.roll(0.5);
    await f.page.key("Enter");
    await f.rollUntil("room.holding", 8, 0.4);
    // Shaken with the pointer, then let go.
    for (let i = 0; i < 54; i++) {
      await f.page.mouse("move", W * (0.56 + 0.1 * Math.sin(i * 0.9)), H * (0.6 + 0.07 * Math.cos(i * 1.3)));
      await f.roll(1 / FPS);
    }
    await f.run("(room.releaseDie(), 1)");
    await f.rollUntil(`${heard(" on the die")} && !room.desk.voice.speaking`, 20, 0.6);
  });
  await clip("05-the-story-is-told", async () => {
    f.drift(true);
    await f.rollUntil("room.desk.mode === 'holding'", 44, 0);
  });
  await clip("06-the-page-handed-back", async () => {
    await f.roll(4.5);
    await f.page.key("Enter");
    await f.roll(3);
  });
  await quickTurn(f, "I climb the drainpipe and run along the roof after the boy.");
  await clip("07-what-happened-last", async () => {
    await f.roll(0.5);
    await typeLine(f, "I ask ");
    await f.roll(0.8);
    await f.page.key("Tab");
    await f.roll(3);
    await f.page.key("ArrowRight");
    await f.roll(2.2);
    await typeLine(f, "her what she saw");
    await f.roll(1.5);
  });
  await rubOut(f);
  await clip("08-a-long-line", async () => {
    await press(f, "I");
    await f.roll(0.8);
    const long = Array.from({ length: 30 }, (_, i) => `I keep to the wall and count the lamps as I pass under them, ${i + 1} and then the next, and I do not look back.`).join(" ");
    for (let n = 0; n < long.length && n < 6 * 9 * FPS; n += 6) {
      await f.run(`(${FIELD}.value = ${JSON.stringify(long.slice(0, n))}, ${FIELD}.dispatchEvent(new Event("input")), 1)`);
      await f.roll(1 / FPS);
    }
    await f.roll(1.2);
  });
  await rubOut(f);
  await clip("09-leafing-through-the-pages", async () => {
    f.drift(true);
    await f.roll(0.6);
    f.drift(false);
    await touchSlow(f, "pile");
    await f.roll(2.6);
    // The newest page is on top: back to the one before, forward again, and back.
    for (const k of ["ArrowLeft", "ArrowRight", "ArrowLeft"]) {
      await f.page.key(k);
      await f.roll(2.2);
    }
    await f.page.key("Enter");
    await f.roll(2);
  });
  await clip("10-your-sheets", async () => {
    await touchSlow(f, "sheaf");
    await f.roll(3);
    for (const k of ["ArrowRight", "ArrowRight"]) {
      await f.page.key(k);
      await f.roll(2.6);
    }
    await f.page.key("Enter");
    await f.roll(2);
  });
}

/** What the run's systems lay on the table: the map, the cards, the reckoning. */
async function systemsReel(f: Film, clip: Clip): Promise<void> {
  await sitDown(f);
  await quickTurn(f, "I sneak up the stair toward the nearest lamp.");
  await f.run("(room.desk.voice.hush(), 1)");
  await f.skip(1.5);

  await clip("01-the-map-unrolls", async () => {
    f.drift(true);
    await f.roll(1);
    await show(f, [MAP1]);
    await f.rollUntil(`room.mapMesh.visible && room.mapMesh.scale.z > 0.99 && ${piece}.at === 'stair'`, 12, 3);
  });
  await clip("02-walking-the-map", async () => {
    await f.run("(room.lean(true), 1)");
    await f.roll(2);
    await show(f, [MAP2]);
    await f.rollUntil(`${piece}.at === 'market' && !${piece}.move`, 12, 2.5);
    await f.run("(room.lean(false), 1)");
    await f.roll(1.5);
  });
  await clip("03-a-place-writes-its-line", async () => {
    await touchSlow(f, "place:mill");
    await f.rollUntil("room.desk.mode === 'writing' && room.desk.draft === 'I go to the Old Mill.'", 6, 2);
  });
  await rubOut(f);
  await clip("04-cards-are-dealt", async () => {
    f.drift(true);
    await f.roll(0.6);
    await show(f, [MAP2, ...CARDS1]);
    await f.rollUntil(`room.desk.cards.sideCards.length === 4`, 24, 2);
  });
  const readCards = async (): Promise<void> => {
    await touchSlow(f, "card:0");
    await f.rollUntil("room.desk.cards.lookingAt === 0", 5, 2.6);
    for (let i = 1; i < 4; i++) {
      await f.page.key("ArrowRight");
      await f.roll(3);
    }
  };
  await clip("05-reading-the-cards", async () => {
    await readCards();
    await f.touch("held");
    await f.rollUntil("room.desk.mode === 'writing'", 5, 2.2);
  });
  await rubOut(f);
  await f.skip(0.5);
  await clip("06-cards-change-hands", async () => {
    f.drift(true);
    await f.roll(0.6);
    await show(f, [MAP2, ...CARDS2]);
    await f.rollUntil(`room.desk.cards.sideCards.length === 4 && !/:(q1|w1|p1|c1)\\b/.test(${sideIds}) && /:c2$/.test(${sideIds})`, 30, 2);
  });
  await clip("07-reading-more-cards", async () => {
    await readCards();
    await f.page.key("Escape");
    await f.roll(1.8);
  });
  await clip("08-the-reckoning", async () => {
    f.drift(true);
    await f.roll(0.6);
    await show(f, [MAP2, ...CARDS2, ...METERS1]);
    await f.rollUntil("room.desk.tally.state.up && room.desk.tally.state.slips[0]?.stones === 2", 16, 1.5);
    f.drift(false);
    await touchSlow(f, "tally");
    await f.rollUntil("room.desk.glance.k > 0.95", 5, 3.5);
    await f.click(W / 2, H * 0.3);
    await f.roll(1.6);
  });
  await clip("09-the-reckoning-changes", async () => {
    f.drift(true);
    await f.roll(0.6);
    await show(f, [MAP2, ...CARDS2, ...METERS2]);
    await f.rollUntil("room.desk.tally.state.slips[0]?.stones === 1", 16, 1.2);
    f.drift(false);
    await touchSlow(f, "tally");
    await f.rollUntil("room.desk.glance.k > 0.95", 5, 3.5);
    await f.click(W / 2, H * 0.3);
    await f.roll(1.6);
  });
  await clip("10-everything-out-while-you-write", async () => {
    f.drift(true);
    await f.roll(1);
    f.drift(false);
    await typeLine(f, "I follow the smoke toward the Old Mill.");
    await f.roll(2);
  });
  await rubOut(f);
}

/** Every painted card face, passed slowly across the picture. */
async function deckReel(f: Film, clip: Clip): Promise<void> {
  for (let i = 0; i < 200 && !(await f.run<boolean>("!!window.drawn").catch(() => false)); i++) await f.page.wait(100);
  const n = await f.run<number>(`(() => {
    const all = [...document.querySelectorAll("canvas")];
    // The 24 kinds, then the run's own cards; the backs and the try-out of far too many words are left out.
    const keep = [...all.slice(0, 24), ...all.slice(32, 40)];
    document.body.style.cssText = "margin:0;background:#0b0a0a;overflow:hidden;height:100vh";
    const row = document.createElement("div");
    row.id = "row";
    row.style.cssText = "position:absolute;left:0;top:90px;display:flex;gap:56px;padding-left:1920px;will-change:transform";
    for (const c of keep) { c.style.width = "540px"; c.style.height = "900px"; c.style.flex = "none"; c.style.borderRadius = "14px"; c.style.boxShadow = "0 18px 60px #000"; row.append(c); }
    for (const c of all) if (!keep.includes(c)) c.remove();
    document.body.append(row);
    return keep.length;
  })()`);
  const width = 1920 + n * (540 + 56);
  const seconds = 40;
  await clip("01-every-card", async () => {
    for (let i = 0; i < seconds * FPS; i++) {
      await f.run(`(document.getElementById("row").style.transform = "translateX(${(-(width * i) / (seconds * FPS)).toFixed(2)}px)", 1)`);
      await f.roll(1 / FPS);
    }
  });
}

/** The table on a phone held upright, set in the middle of a 16:9 picture. */
async function phoneReel(f: Film, clip: Clip): Promise<void> {
  await sitDown(f);
  await quickTurn(f, "I sneak up the stair toward the nearest lamp.");
  await f.run("(room.desk.voice.hush(), 1)");
  await f.skip(1);
  await clip("01-on-a-phone", async () => {
    await f.roll(1);
    await show(f, [MAP2, ...CARDS1, ...METERS1]);
    await f.rollUntil(`room.desk.cards.sideCards.length === 4`, 24, 2);
    await touchSlow(f, "place:gate");
    await f.rollUntil("room.desk.mode === 'writing'", 6, 2.5);
  });
  await rubOut(f);
  await show(f, [MAP2]);
  await f.run("(room.setClock(21), 1)");
  await f.skip(16);
  await clip("02-the-props-on-a-phone", async () => {
    await f.roll(0.8);
    await show(f, [MAP2, ...SAMPLES.pack!(6), ...SAMPLES.board!(6), ...SAMPLES.ring!(6)]);
    await f.rollUntil("room.desk.props.out.length === 3", 10, 4);
    await touchSlow(f, prop("ring"));
    await f.rollUntil(propOpen("ring"), 6, 3);
    await part(f, "ring", "foe:woman-in-grey", 2.8);
    await part(f, "ring", "choice:0", 0.2);
    await f.rollUntil("room.desk.mode === 'writing'", 6, 2.4);
  });
}

/* ------------------------------------------------- the props ------------------------------------------------- */

/** Something of a prop's, by the name the desk knows it by: "pack", or a part of the open one, "pack:tag:hemp-rope". */
const prop = (what: string): string => `prop:${what}`;
const propOpen = (key: string): string => `room.desk.props.openKey === ${JSON.stringify(key)}`;
const hasPart = (id: string): string => `room.desk.props.partsOf().includes(${JSON.stringify(id)})`;
/** Touch a part of the open prop once it can be touched, with the pointer brought over it first. */
async function part(f: Film, key: string, id: string, after = 1.6): Promise<void> {
  await f.rollUntil(hasPart(id), 6, 0.3);
  if (!(await touchSlow(f, prop(`${key}:${id}`)))) console.log(`   (no part ${id} of ${key}: ${await f.run<string>("room.desk.props.partsOf().join(' ')")})`);
  await f.roll(after);
}
/** Shut whatever is open and clear the pad, without pictures. */
async function shut(f: Film): Promise<void> {
  await f.run("(room.desk.props.close(), 1)");
  await f.skip(0.8);
  if (await f.run<boolean>("room.desk.mode === 'writing'")) await rubOut(f);
  await f.skip(0.6);
}

/** Each mechanic's own thing on the table: it arrives, it is opened, something of it is touched, and a line is written. */
async function propsReel(f: Film, clip: Clip): Promise<void> {
  await sitDown(f);
  await quickTurn(f, "I sneak up the stair toward the nearest lamp.");
  await f.run("(room.desk.voice.hush(), 1)");
  await f.skip(1.5);
  await show(f, [MAP2]);
  await f.wait(`room.mapMesh.visible && room.mapMesh.scale.z > 0.99`, 12);
  // By candlelight, as most of a sitting is played: the narrator sets the candles out and lights them.
  await f.run("(room.setClock(21), 1)");
  await f.skip(16);
  const out = (key: string): string => `room.desk.props.out.includes(${JSON.stringify(key)})`;
  const sample = (key: string, fill: Fill = 6): object[] => SAMPLES[key]!(fill);

  await clip("01-the-satchel-arrives", async () => {
    f.drift(true);
    await f.roll(1);
    await show(f, [MAP2, ...sample("pack")]);
    await f.rollUntil(out("pack"), 8, 4.5);
  });
  await clip("02-the-satchel-opens", async () => {
    f.drift(false);
    await touchSlow(f, prop("pack"));
    await f.rollUntil(propOpen("pack"), 6, 3);
    await part(f, "pack", "tag:hemp-rope", 2.6);
    await part(f, "pack", "choice:0", 0.2);
    await f.rollUntil("room.desk.mode === 'writing' && room.desk.draft.startsWith('I use the hemp rope')", 6, 1);
    await typeLine(f, "to climb down to the quay.");
    await f.roll(1.5);
  });
  await rubOut(f);
  await clip("03-making-something", async () => {
    await touchSlow(f, prop("pack"));
    await f.rollUntil(propOpen("pack"), 6, 1.6);
    await part(f, "pack", "tag:hemp-rope", 1.8);
    const make = await f.run<number>(`room.desk.props.partsOf().filter((p) => p.startsWith("choice:")).length - 1`);
    await part(f, "pack", `choice:${make}`, 2);
    await part(f, "pack", "tag:lamp-oil", 1.8);
    const again = await f.run<number>(`room.desk.props.partsOf().filter((p) => p.startsWith("choice:")).length - 1`);
    await part(f, "pack", `choice:${again}`, 2.4);
    await part(f, "pack", "write", 0.2);
    await f.rollUntil("room.desk.mode === 'writing'", 6, 1);
    await typeLine(f, "a torch.");
    console.log(`   on the pad: ${await f.run<string>("room.desk.draft")}`);
    await f.roll(1.5);
  });
  await shut(f);

  const pack = sample("pack");
  /** Lay a prop's Show beside the map and the satchel, and wait until it stands on the table. */
  const lay = async (key: string, shows: object[], pictures: boolean, after = 3): Promise<void> => {
    await show(f, [MAP2, ...pack, ...shows]);
    if (pictures) await f.rollUntil(out(key), 8, after);
    else {
      await f.wait(out(key), 8);
      await f.skip(after);
    }
  };
  /** Take everything but the map and the satchel off the table, without pictures. */
  const clear = async (): Promise<void> => {
    await shut(f);
    await show(f, [MAP2, ...pack]);
    await f.skip(2.5);
  };
  /** Open a prop by touching it, from your own seat. */
  const open = async (key: string, after = 2.2): Promise<void> => {
    await f.cam(null);
    f.drift(false);
    await f.roll(0.6);
    await touchSlow(f, prop(key));
    await f.rollUntil(propOpen(key), 6, after);
  };
  const written = (start: string): string => `room.desk.mode === 'writing' && room.desk.draft.startsWith(${JSON.stringify(start)})`;

  await clip("04-the-sellers-cloth", async () => {
    await f.cam({ eye: [0.62, 0.34, -0.02], look: [0.39, 0.02, -0.6], fov: 34 }, { eye: [0.5, 0.26, -0.16], look: [0.39, 0.02, -0.6], fov: 34 }, 6);
    await f.roll(0.8);
    await lay("stall", sample("stall"), true, 4.4);
    await open("stall");
    await part(f, "stall", "ware:heavy wool cloak", 3);
    await part(f, "stall", "choice:0", 0.2);
    await f.rollUntil(written("I buy the heavy wool cloak from Oren"), 6, 2.4);
  });
  await rubOut(f);
  await clip("05-haggling", async () => {
    await open("stall", 1.4);
    await part(f, "stall", "ware:crystal lantern", 2.6);
    await part(f, "stall", "choice:2", 0.2);
    await f.rollUntil(written("I haggle with Oren"), 6, 2.6);
  });
  await clear();

  // The fight: it is laid, a blow lands, a foe goes down, and a piece is touched for what could be tried against it.
  const fight = sample("ring")[0] as { foes: { id: string; hp: number; down: boolean }[] };
  const blow = (hp: number, down = false): object => ({ ...fight, foes: fight.foes.map((x) => (x.id === "woman-in-grey" ? { ...x, hp, down } : x)) });
  await clip("06-the-fight-ring", async () => {
    await f.cam({ eye: [0.98, 0.36, 0.46], look: [0.72, 0.03, -0.01], fov: 34 }, { eye: [0.84, 0.3, 0.4], look: [0.72, 0.03, -0.01], fov: 34 }, 12);
    await f.roll(0.8);
    await lay("ring", [fight], true, 3.4);
    await show(f, [MAP2, ...pack, blow(38)]);
    await f.roll(2.6);
    await show(f, [MAP2, ...pack, blow(0, true)]);
    await f.roll(3.2);
  });
  await clip("07-a-foe-is-touched", async () => {
    await open("ring");
    await part(f, "ring", "foe:boy-with-the-hooked-knife", 3);
    await part(f, "ring", "choice:0", 0.2);
    await f.rollUntil(written("I attack The Boy with the Hooked Knife"), 6, 0.8);
    await typeLine(f, "with the flat of my blade.");
    await f.roll(1.5);
  });
  await rubOut(f);
  await clip("08-what-you-could-try", async () => {
    // Leaning over the ring shows your own piece's offers at once.
    await open("ring", 3.6);
    await part(f, "ring", "choice:0", 0.2);
    await f.rollUntil(written("I fight my way toward the stair"), 6, 2.4);
  });
  await clear();

  await clip("09-the-quest-board", async () => {
    await f.cam({ eye: [-0.02, 0.3, -0.12], look: [-0.295, 0.08, -0.64], fov: 32 }, { eye: [-0.14, 0.24, -0.24], look: [-0.295, 0.08, -0.64], fov: 32 }, 9);
    await f.roll(0.8);
    await lay("board", sample("board", 1), true, 3);
    await show(f, [MAP2, ...pack, ...sample("board")]);
    await f.roll(5.2);
  });
  await clip("10-a-quest-and-its-tasks", async () => {
    await open("board");
    await part(f, "board", "slip:q2", 3.4);
    await part(f, "board", "task:q2-4", 2.8);
    await part(f, "board", "choice:1", 0.2);
    await f.rollUntil(written("To search the drying sheds by the ferry, I"), 6, 0.8);
    await typeLine(f, "go after dark with the lantern shut.");
    await f.roll(1.5);
  });
  await clear();

  await clip("11-the-character-board", async () => {
    await f.cam({ eye: [-0.44, 0.3, 0.56], look: [-0.67, 0.02, 0.15], fov: 34 }, { eye: [-0.52, 0.24, 0.5], look: [-0.67, 0.02, 0.15], fov: 34 }, 9);
    await f.roll(0.8);
    await lay("self", sample("self", 1), true, 2.6);
    await show(f, [MAP2, ...pack, ...sample("self")]);
    await f.roll(5.4);
  });
  await clip("12-the-perk-trees", async () => {
    await open("self", 2.8);
    await part(f, "self", "perk:t1-1", 3.2);
    await part(f, "self", "choice:0", 0.2);
    await f.rollUntil(written("I learn the perk Second Wind"), 6, 2.6);
  });
  await rubOut(f);
  await clip("13-a-point-is-placed", async () => {
    await open("self", 1.6);
    await part(f, "self", "attr:cunning", 2.8);
    await part(f, "self", "choice:0", 0.2);
    await f.rollUntil(written("I put one point into Cunning"), 6, 2.4);
  });
  await clear();

  // Where you stand: the pennants are hung, one group comes to think better of you, and its help is called on.
  const rack = sample("rack")[0] as { groups: { id: string; standing: number }[] };
  const better = { ...rack, groups: rack.groups.map((g) => (g.id === "night-market-traders" ? { ...g, standing: 46, step: 6, label: "esteemed", tone: "for" } : g)) };
  await clip("14-the-faction-rack", async () => {
    await f.cam({ eye: [0.98, 0.34, -0.06], look: [0.815, 0.09, -0.58], fov: 31 }, { eye: [0.905, 0.3, -0.155], look: [0.815, 0.09, -0.58], fov: 31 }, 9);
    await f.roll(0.8);
    await lay("rack", [rack], true, 3.2);
    await show(f, [MAP2, ...pack, better]);
    await f.roll(4.4);
  });
  await clip("15-calling-on-a-group", async () => {
    await open("rack");
    await part(f, "rack", "pennant:drowned-chapel", 3.2);
    await f.run(`(room.desk.props.touch("back"), 1)`);
    await f.roll(1.2);
    await part(f, "rack", "pennant:house-varrow", 3.2);
    await part(f, "rack", "choice:0", 0.2);
    await f.rollUntil(written("I call on House Varrow"), 6, 2.6);
  });
  await clear();

  await clip("16-every-prop-on-the-table", async () => {
    await f.cam({ eye: [-0.75, 0.62, 0.95], look: [-0.1, 0.02, -0.25], fov: 40 }, { eye: [0.75, 0.62, 0.95], look: [0.12, 0.02, -0.25], fov: 40 }, 14);
    await f.roll(1);
    await show(f, [MAP2, ...pack, ...sample("board"), ...sample("stall"), ...sample("self"), ...sample("rack"), fight]);
    await f.roll(13);
  });
  await f.cam(null);
}

const words = process.argv.slice(2);
const REELS: [string, string, (f: Film, clip: Clip) => Promise<void>, { w: number; h: number }?][] = [
  ["room", "card=maren&run=1", roomReel],
  ["turn", "card=maren&run=1", turnReel],
  ["systems", "card=maren&run=1", systemsReel],
  ["props", "card=maren&run=1", propsReel],
  ["deck", "/cards", deckReel],
  ["phone", "card=maren&run=1", phoneReel, { w: 608, h: 1080 }],
];
for (const [name, query, play, size] of REELS) {
  const mine = words.filter((w) => w === name || w.startsWith(`${name}:`));
  if (words.length && !mine.length) continue;
  const parts = mine.filter((w) => w.includes(":")).map((w) => w.split(":")[1]!);
  const whole = !words.length || mine.includes(name);
  await reel(name, query, (c) => whole || parts.some((p) => c.includes(p)), play, size);
}
process.exit(0);
