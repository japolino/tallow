import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { SOUND_CREDITS } from "../src/frontend/soundcredits.js";
import { musicVolume } from "../src/room/music.js";
import { bedMix, LEVELS, loopable, normalLevels, Sound } from "../src/room/sound.js";
import { SOUND_FILES } from "../src/room/soundfiles.js";

const CALM = { wind: 0, rain: 0, storm: 0, snow: 0, fog: 0 };

describe("levels", () => {
  test("the usual levels for anything that is not levels", () => {
    expect(normalLevels(null)).toEqual(LEVELS);
    expect(normalLevels("loud")).toEqual(LEVELS);
  });
  test("kept as given, held to 0..1", () => {
    expect(normalLevels({ muted: true, master: 2, music: -1, sounds: 0.3 })).toEqual({ muted: true, master: 1, music: 0, sounds: 0.3 });
    expect(normalLevels({ master: Number.NaN }).master).toBe(LEVELS.master);
  });
  test("the music is silent when muted or turned down", () => {
    expect(musicVolume({ ...LEVELS, muted: true })).toBe(0);
    expect(musicVolume({ ...LEVELS, music: 0 })).toBe(0);
    expect(musicVolume({ muted: false, master: 0.5, music: 0.5, sounds: 1 })).toBeCloseTo(0.25);
  });
});

describe("the beds", () => {
  test("a clear day: room tone only", () => {
    const m = bedMix(CALM, 0, false);
    expect(m).toEqual({ tone: 1, candles: 0, wind: 0, rain: 0, night: 0 });
  });
  test("rain and storm bring the rain and the wind", () => {
    const m = bedMix({ ...CALM, rain: 1, storm: 0.5 }, 0.5, false);
    expect(m.rain).toBe(1);
    expect(m.wind).toBeGreaterThan(0);
    expect(m.candles).toBe(0.5);
  });
  test("the night outside is heard only when nothing louder is out there", () => {
    expect(bedMix(CALM, 1, true).night).toBe(1);
    expect(bedMix({ ...CALM, rain: 0.8 }, 1, true).night).toBe(0);
    expect(bedMix(CALM, 1, false).night).toBe(0);
  });
});

describe("a seamless loop", () => {
  test("the end is faded over the start, so the wrap is where the recording itself went on", () => {
    const src = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7));
    const [out] = loopable([src], 100, 1.5);
    const f = 150;
    expect(out!.length).toBe(1000 - f);
    // The loop starts as the tail did, and ends just before the tail began: the wrap is continuous.
    expect(out![0]).toBeCloseTo(src[1000 - f]!, 5);
    expect(out![out!.length - 1]).toBeCloseTo(src[1000 - f - 1]!, 5);
    // And by the end of the fade it is the head again.
    expect(out![f]).toBeCloseTo(src[f]!, 5);
  });
  test("too short to fade is left as it is", () => {
    const src = new Float32Array(3);
    expect(loopable([src], 100)[0]).toBe(src);
  });
});

describe("the recordings", () => {
  test("the list is exactly the files in assets/sounds", () => {
    const files = readdirSync("assets/sounds").filter((f) => f.endsWith(".mp3")).sort();
    expect([...SOUND_FILES].sort()).toEqual(files);
  });
  test("every take is named for a sound the room plays", () => {
    const known = new Set(["throw", "rattle", "deal", "pat", "riffle", "scratch", "tear", "slide", "knock", "token", "peg", "swish", "weight", "tink", "stone", "unroll", "strike", "slam", "thunder", "tone", "candles", "rain", "wind", "night"]);
    for (const f of SOUND_FILES) expect(known.has(f.replace(/-\d+\.mp3$/, ""))).toBe(true);
  });
  test("each is credited, and the Attribution ones say so", () => {
    expect(SOUND_CREDITS.length).toBeGreaterThan(40);
    for (const c of SOUND_CREDITS) expect(c.url).toStartWith("https://freesound.org/");
    expect(SOUND_CREDITS.some((c) => c.by)).toBe(true);
  });
});

describe("before sound may play", () => {
  test("nothing is made and nothing breaks", () => {
    const s = new Sound();
    expect(s.started).toBe(false);
    s.play("clack");
    s.write();
    s.shake(1);
    s.room(0.016, CALM, 1, true, 1);
    s.setLevels({ master: 0.2 });
    expect(s.levels.master).toBe(0.2);
  });
});
