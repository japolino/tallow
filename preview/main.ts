/**
 * The preview page. By default it plays a whole adventure at the table, with
 * nothing on the screen but the room (milestone 3; src/game/director.ts and
 * src/game/roomtable.ts). With ?moment=1 it plays the single moment of
 * milestone 2 (preview/play.ts). With ?play=0 it is the room alone, with
 * controls for the clock, the weather, leaning in and the die (milestone 1).
 *
 * Address-bar switches, for looking at one state at a time:
 *   ?adventure=courtship   which made-up adventure: rescue (the default) or courtship
 *   ?adventure=gen:vault   a road laid out for one of the stories in content/tropes.ts (a new one for each seed)
 *   ?slow=3000     the stand-ins for the models take this many milliseconds, so the waits can be seen
 *   ?moment=1      the single moment of milestone 2 instead of an adventure
 *   ?play=0        the room alone, with its own controls
 *   ?seed=abc      choose the dice for the moment (the same seed throws the same faces)
 *   ?t=18.3        hour of the day
 *   ?weather=rain  clear, rain, storm, fog, wind or snow
 *   ?quality=3     start at a lower step of quality (0 is the full picture, 4 the cheapest)
 *   ?lean=1        start leaning over the map
 *   ?roll=14       throw the die to this number on load
 *   ?hand=14       pick the die up on load and hold it (a click lets go; it lands on this number)
 *   ?reduced=1     behave as if "reduce motion" were on
 *   ?flat=1        use the flat room (what shows without WebGL)
 *   ?hud=0         the room alone: no controls, and no moment being played
 *   ?patrol=0      keep the narrator's piece still
 *   ?models=0      use only shapes built in code (what shows if a model file fails to load)
 */
import { ADVENTURES, COURIER } from "../src/content/adventures.js";
import { recipeOf } from "../src/content/tropes.js";
import { layRoad } from "../src/engine/road.js";
import { fallbackAdventure } from "../src/game/build.js";
import { mapOf } from "../src/engine/adventure.js";
import { randomSeed, rollD20, seededRng } from "../src/engine/dice.js";
import { direct } from "../src/game/director.js";
import { standIns } from "../src/game/minds.js";
import { PLAYER, roomTable } from "../src/game/roomtable.js";
import { clockLabel, daylight, WEATHER_NAMES } from "../src/room/daylight.js";
import { mountRoom, type Weather } from "../src/room/room.js";
import { music } from "../src/room/music.js";
import { sound } from "../src/room/sound.js";
import { SOUND_FILES } from "../src/room/soundfiles.js";
import { MAP, PATROL, PIECES, ROAD, YOU } from "./mock.js";
import { startPlay } from "./play.js";
import { buildArena } from "../src/engine/arena.js";
import { encounter } from "../src/engine/encounter.js";
import { playRound, startBattle } from "../src/engine/battle.js";
import { readOrder } from "../src/engine/tactics.js";

const q = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

/** Playing the moment, or only looking at the room. */
const playing = q.get("play") !== "0" && q.get("hud") !== "0";
/** A whole adventure (the default), or the single moment of milestone 2. */
const seed = q.get("seed") ?? randomSeed();
const wanted = q.get("adventure") ?? "rescue";
const story = wanted.startsWith("gen:") ? recipeOf(wanted.slice(4)) : undefined;
const adventure =
  playing && q.get("moment") !== "1"
    ? story
      ? fallbackAdventure(layRoad(story, seed), { name: "Maren Vell", description: "Maren Vell is a lamplighter in a river town, quick-tongued and stubborn." }, seed)
      : ADVENTURES[wanted] ?? ADVENTURES.rescue!
    : null;
const climax = adventure?.stops.find((s) => s.climax)?.id;

let hour = Number(q.get("t") ?? (adventure ? adventure.startHour : playing ? YOU.hour : 18.3));
let weather: Weather = WEATHER_NAMES.find((w) => w === q.get("weather")) ?? "clear";
const reduced = q.get("reduced") === "1" ? true : undefined;

// Sound starts with the first click or key press, as in Lumiverse.
sound.arm();
sound.loadRecordings(SOUND_FILES, async (f) => (await fetch(`/assets/sounds/${f}`)).arrayBuffer());
Object.assign(window, { sound, music });
const room = mountRoom($("#host"), {
  map: adventure ? mapOf(adventure) : MAP,
  // In an adventure your piece starts where the road does, and the narrator's stands on the end of it. In the moment,
  // your piece has come as far as the last stop you got past, and the narrator's stands in your way.
  pieces: adventure
    ? [
        { id: PLAYER, kind: "player", at: adventure.start },
        { id: "shadow", kind: "narrator", at: climax ?? adventure.start },
      ]
    : playing
      ? PIECES.map((p) => ({ ...p, at: p.kind === "narrator" ? ROAD.stop : ROAD.from }))
      : PIECES,
  hour,
  weather,
  reducedMotion: reduced,
  assets: q.get("models") === "0" ? undefined : "/assets",
  flat: q.get("flat") === "1",
  quality: Number(q.get("quality") ?? 0),
  onLean: (over) => {
    $("#lean").setAttribute("aria-pressed", String(over));
    $("#lean").textContent = over ? "Sit back" : "Lean in over the map";
  },
});
// For looking at the room from scripts and the console.
Object.assign(window, { room, PATROL });

const hourInput = $<HTMLInputElement>("#hour");
const showClock = (): void => {
  hourInput.value = String(hour);
  $("#clock").textContent = `${clockLabel(hour)}, ${daylight(hour).phase}`;
};
const setHour = (h: number): void => {
  hour = ((h % 24) + 24) % 24;
  room.setClock(hour);
  showClock();
};
hourInput.addEventListener("input", () => setHour(Number(hourInput.value)));
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-hour]")) b.addEventListener("click", () => setHour(Number(b.dataset.hour)));

const setWeather = (w: Weather): void => {
  weather = w;
  room.setWeather(w);
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-weather]")) b.setAttribute("aria-pressed", String(b.dataset.weather === w));
};
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-weather]")) b.addEventListener("click", () => setWeather(b.dataset.weather as Weather));

// "Run a day": the clock goes round once in about forty seconds.
let running = false;
let lastTick = 0;
const tick = (ms: number): void => {
  if (running) {
    setHour(hour + ((ms - lastTick) / 1000) * 0.6);
    requestAnimationFrame(tick);
  }
  lastTick = ms;
};
$("#day").addEventListener("click", () => {
  running = !running;
  $("#day").setAttribute("aria-pressed", String(running));
  lastTick = performance.now();
  if (running) requestAnimationFrame(tick);
});

$("#lean").addEventListener("click", () => room.lean(!room.leaning));

// The number comes from the seeded dice, never from the animation: the throw only shows it.
const rng = seededRng("tallow-preview");
let noteTimer = 0;
const note = (text: string): void => {
  $("#note").textContent = text;
  $("#note").classList.add("on");
  clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => $("#note").classList.remove("on"), 3200);
};
let rolling = false;
const roll = async (value = rollD20(rng), byHand = true): Promise<void> => {
  // With the die already in hand, the same control lets it go.
  if (room.holding) return room.releaseDie();
  if (rolling) return;
  rolling = true;
  if (byHand) {
    $("#roll").textContent = "Let go of the die";
    note("Move the pointer to shake the die. Click to let go.");
    await room.offerDie(value);
    $("#roll").textContent = "Pick up the die";
  } else await room.rollDie(value);
  note(`The die shows ${value}.`);
  rolling = false;
};
$("#roll").addEventListener("click", () => void roll());

const slow = Number(q.get("slow") ?? 0);
const director =
  adventure && room.desk
    ? (() => {
        const table = roomTable(room, { reduced: reduced ?? matchMedia("(prefers-reduced-motion: reduce)").matches, setHour: (h) => setHour(h) });
        // The room's model files first, so the narrator's hands are its own when it deals.
        // What the director last asked of the table, and whether it came back: for reading a run that stops.
        const calls: string[] = [];
        const traced = table as unknown as Record<string, unknown>;
        for (const [k, f] of Object.entries(traced)) {
          if (typeof f !== "function") continue;
          traced[k] = (...a: unknown[]) => {
            calls.push(k);
            const r = (f as (...a: unknown[]) => unknown)(...a);
            if (r instanceof Promise) void r.then(() => calls.push(`${k} done`));
            return r;
          };
        }
        Object.assign(window, { tableCalls: calls });
        const minds = standIns(slow);
        let d: ReturnType<typeof direct> | null = null;
        void room.ready.then(() => {
          d = direct(adventure, COURIER, seed, table, minds);
          Object.assign(window, { director: d });
        });
        return () => d;
      })()
    : null;
const play = playing && !adventure
  ? startPlay(room, { seed: q.get("seed") ?? undefined, hour: q.get("t") ? hour : undefined, reduced: reduced ?? matchMedia("(prefers-reduced-motion: reduce)").matches, setHour: (h) => setHour(h) })
  : null;
Object.assign(window, { play, getDirector: director });

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (["INPUT", "BUTTON", "TEXTAREA", "SUMMARY", "A"].includes((e.target as HTMLElement).tagName)) return;
  // While a moment is played the letters belong to the notebook; the space bar still leans in and sits back.
  if (e.key === " " || (e.key === "m" && !playing)) {
    e.preventDefault();
    room.lean(!room.leaning);
  } else if (e.key === "r" && !playing) void roll();
});

// The narrator's piece walks its round by itself.
if (q.get("patrol") !== "0" && !playing) {
  let i = 0;
  const step = async (): Promise<void> => {
    i = (i + 1) % PATROL.length;
    await room.movePiece("shadow", PATROL[i]!);
    setTimeout(() => void step(), 5200);
  };
  setTimeout(() => void step(), 3500);
}

if (!playing && q.get("hud") !== "0") $("#hud").classList.remove("hidden");
if (q.get("lean") === "1") room.lean(true);
if (q.get("roll")) setTimeout(() => void roll(Math.max(1, Math.min(20, Number(q.get("roll")))), false), 600);
if (q.get("hand")) setTimeout(() => void roll(Math.max(1, Math.min(20, Number(q.get("hand"))))), 600);
setWeather(weather);
showClock();
setInterval(() => {
  const s = room.stats();
  $("#stats").textContent = room.kind === "flat" ? "flat room (no WebGL)" : `${s.fps} fps, ${s.buffer[0]}x${s.buffer[1]}, quality step ${s.quality}`;
}, 500);

// ?mat=1 (with play=0): the battle mat on its own, a sample fight played by the board-reader, a round every few seconds.
if (q.get("mat") === "1" && room.desk) {
  const desk = room.desk;
  void room.ready.then(async () => {
    const arena = buildArena((q.get("arena") as Parameters<typeof buildArena>[0]) ?? "tavern", seed);
    const stats = { brawn: 2, grace: 2, charm: 1, guile: 1, wits: 1, sense: 1 };
    const spec = encounter({ seed, difficulty: 1, side: [{ id: "you", name: "you", stats, hero: true }, { id: "vy", name: "Vypra", stats: { ...stats, charm: 3 } }], mat: arena.mat, props: arena.props, zones: arena.zones, ground: arena.ground });
    let { battle } = startBattle(spec);
    await desk.mat.show(battle, []);
    Object.assign(window, { matState: () => desk.mat.state, battleNow: () => battle });
    for (let r = 0; r < 12 && !battle.over; r++) {
      await new Promise((ok) => setTimeout(ok, 2500));
      const orders = battle.pieces.filter((p) => p.side === "you" && !p.down && !p.out).map((p) => readOrder(battle, p.id));
      const played = playRound(battle, orders);
      battle = played.battle;
      await desk.mat.show(battle, played.events);
    }
  });
}

// ?roster=1 (with play=0): the paper of who you may be (room/roster.ts), with sample personas; what you pick is shown.
if (q.get("roster") === "1" && room.desk) {
  void room.ready.then(async () => {
    const table = roomTable(room, { reduced: reduced ?? matchMedia("(prefers-reduced-motion: reduce)").matches, setHour: (h) => setHour(h) });
    const n = Number(q.get("n") ?? 4);
    const sample = [
      { name: "Kestrel", title: "A wandering cartographer" },
      { name: "Rook", title: "One-eyed smuggler, owes everyone" },
      { name: "Sister Amaranth Vell-Okonkwo of the Ninth Lantern", title: "Exiled lamp-priest with a very long title that will not fit" },
      { name: "Ash" },
      { name: "Juniper", title: "Herbalist" },
      { name: "Marrow", title: "Gravedigger and poet" },
    ];
    const list = Array.from({ length: n }, (_, i) => ({ ...sample[i % sample.length]!, name: i < sample.length ? sample[i]!.name : `${sample[i % sample.length]!.name} ${i + 1}` }));
    const got = await table.personas!(list);
    const said = "ticked" in got ? (got.ticked < list.length ? `ticked ${list[got.ticked]!.name}` : "ticked someone new") : `wrote: ${got.line}`;
    Object.assign(window, { rosterPicked: said });
    note(said);
  });
}
