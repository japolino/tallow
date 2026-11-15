/**
 * The room with the table's props laid out from sample data, for looking at them without the game, a model or a build:
 * http://localhost:4184/props (scripts/preview.ts bundles this from source on every load).
 *
 *   ?props=pack,ring     which props are out (their keys, src/room/props/layout.ts); "all" for every one; none when left out
 *   ?fill=1|6|20         how full each is (preview/propsamples.ts): a little, an ordinary amount, a great deal
 *   ?open=pack           that prop is touched open once the room is ready
 *   ?rest=1              everything else the table can hold is out too: the map, the cards row, the reckoning, your
 *                        sheets, what happened last beside the notebook
 *   ?hour=21             the hour of the room's day (the usual is 21, by candlelight); ?still=1 for reduced motion
 *   ?homes=1             every prop's home marked with a block of its size, and its spread with a thin sheet, in
 *                        its own colour (src/room/props/layout.ts): for seeing what room each has
 *
 * The page sets window.room (the room's own handle: room.desk.props is the props' manager), window.samples(fill) (the
 * sample Shows) and window.lay(keys, fill, rest) (lay them out again). scripts/prop-shots.ts takes its pictures here.
 */
import { loadCardPictures } from "../src/room/cardart.js";
import { mountRoom } from "../src/room/room.js";
import type { Show } from "../src/game/system.js";
import type { PropKey } from "../src/room/props/layout.js";
import { REST, SAMPLES, type Fill } from "./propsamples.js";

const q = new URLSearchParams(location.search);
const fill = (Number(q.get("fill")) || 6) as Fill;
const want = (q.get("props") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const keys = want.includes("all") ? Object.keys(SAMPLES) : want.filter((k) => k in SAMPLES);

document.documentElement.style.cssText = "margin:0;height:100%;background:#111";
document.body.style.cssText = "margin:0;height:100%;overflow:hidden";
const host = document.createElement("div");
Object.assign(host.style, { position: "absolute", inset: "0" });
document.body.appendChild(host);

const room = mountRoom(host, {
  map: { title: "", seed: 1, stops: [], paths: [] },
  pieces: [{ id: "you", kind: "player", at: "start" }, { id: "shadow", kind: "narrator", at: "end" }],
  hour: Number(q.get("hour")) || 21,
  assets: "/assets",
  ...(q.get("still") === "1" ? { reducedMotion: true } : {}),
});

/** The sample Shows for these props, and the rest of the table when asked. */
const samples = (which: string[], f: Fill, rest: boolean): Show[] => [...(rest ? REST : []), ...which.flatMap((k) => SAMPLES[k]?.(f) ?? [])];
const lay = (which: string[] = keys, f: Fill = fill, rest = q.get("rest") === "1"): void => {
  room.show?.(samples(which, f, rest));
  if (rest) {
    room.desk?.sheets([
      { heading: "Ash", his: ["Road-worn courier. Level 2, 40 of 180 experience. Health 82 of 100.", "Strength 2, Dexterity 6, Intelligence 3, Charisma 4, Cunning 5", "Skills: Stealth 4, Climbing 3, Haggling 3."] },
      { heading: "What you have", his: ["Courier's Memory: recalls any street walked once.", "Carrying: a satchel, a belt knife.", "12 silver."] },
    ]);
    room.desk?.notes({ mine: "I sneak up the stair toward the nearest lamp, keeping to the wall.", his: ["You go about it as you wrote, and the stair gives you what it can.", "The thing under the lamp has shown itself: a boy with a hooked knife."] });
  }
};

Object.assign(window, { room, samples: (f: Fill = fill) => samples(Object.keys(SAMPLES), f, false), lay });
await room.ready;
// The cards' painted pictures, as the game itself has them by the time a card is dealt.
await loadCardPictures();
room.theatre?.(true);
// The notebook can be opened, as when the game waits for a line; nothing is ever sent anywhere from here.
void room.desk?.write();
lay();
if (q.get("homes") === "1") room.desk?.props.marksOn(true);
// Opened once it has arrived: the room's own clock says when, so this steps with the room when a script winds it on.
const open = q.get("open");
if (open && keys.includes(open)) {
  const t0 = room.desk!.tracks.now;
  void room.desk!.tracks.run([{ dur: 0, until: () => room.desk!.tracks.now - t0 > 1.5, patience: 3 }]).then(() => room.desk!.props.open(open as PropKey));
}
Object.assign(window, { propsReady: true });
