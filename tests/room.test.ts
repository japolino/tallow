/**
 * The rules of the room that can be checked without a browser: what the
 * clock does to the light, and that the die comes to rest showing the number
 * it was told to.
 */
import { describe, expect, test } from "bun:test";
import { IcosahedronGeometry, Vector3 } from "three";
import { rollD20, seededRng } from "../src/engine/dice.js";
import { BURNT_OUT, candleBurn, CANDLES_LIT, clockLabel, daylight, phaseOf, SUNRISE, SUNSET, WEATHER_NAMES, WEATHERS, wrapHour } from "../src/room/daylight.js";
import { Governor, QUALITY } from "../src/room/governor.js";
import { Lightning } from "../src/room/weather.js";
import { d20Faces, restingTurn } from "../src/room/die.js";
import { layoutPlaces, stopOnSheet } from "../src/room/mapsheet.js";
import { beadsFor } from "../src/room/tally.js";
import { kindOfGroup } from "../src/room/tablecards.js";
import { leavesOf, wrapText } from "../src/room/paper.js";

describe("the light is the clock", () => {
  test("every hour gives a usable light", () => {
    for (let h = 0; h <= 24; h += 0.05) {
      for (const snow of [0, 0.5, 1]) {
        const L = daylight(h, snow);
        const all = [...L.sunDir, ...L.sunColor, L.sunIntensity, ...L.skyTop, ...L.skyHorizon, ...L.ambientSky, ...L.ambientGround, L.ambientIntensity, L.candle, L.shaft, L.exposure, L.cold];
        expect(all.every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...L.sunDir)).toBeCloseTo(1, 5);
        // The light always comes from above the horizon, so shadows never run flat along the table.
        expect(L.sunDir[1]).toBeGreaterThan(0.05);
        expect(L.sunIntensity).toBeGreaterThanOrEqual(0);
        expect(L.candle).toBeGreaterThanOrEqual(0);
        expect(L.candle).toBeLessThanOrEqual(1);
      }
    }
  });

  test("the light never jumps as the clock moves", () => {
    const step = 0.02;
    for (let h = 0; h < 24; h += step) {
      const a = daylight(h), b = daylight(h + step);
      expect(Math.abs(a.sunIntensity - b.sunIntensity)).toBeLessThan(0.12);
      expect(Math.abs(a.ambientIntensity - b.ambientIntensity)).toBeLessThan(0.03);
      expect(Math.abs(a.candle - b.candle)).toBeLessThan(0.04);
      for (let i = 0; i < 3; i++) expect(Math.abs(a.skyHorizon[i]! - b.skyHorizon[i]!)).toBeLessThan(0.05);
      // The one jump in direction, sun to moon, happens only while the direct light is out.
      const turn = Math.hypot(a.sunDir[0] - b.sunDir[0], a.sunDir[1] - b.sunDir[1], a.sunDir[2] - b.sunDir[2]);
      if (turn > 0.05) expect(Math.max(a.sunIntensity, b.sunIntensity)).toBeLessThan(0.05);
    }
  });

  test("midnight and noon are the same after a full turn of the clock", () => {
    expect(daylight(0)).toEqual(daylight(24));
    expect(daylight(25.5)).toEqual(daylight(1.5));
    expect(wrapHour(-1)).toBe(23);
  });

  test("candles are lit by night and out by day", () => {
    expect(daylight(0).candle).toBe(1);
    expect(daylight(23).candle).toBe(1);
    expect(daylight(12.5).candle).toBe(0);
    expect(daylight(10).candle).toBe(0);
  });

  test("the day ends with low light coming down the table toward the player", () => {
    const L = daylight(18.3);
    expect(L.phase).toBe("golden hour");
    expect(L.moon).toBe(false);
    // The sun is behind the narrator (-z) and low.
    expect(L.sunDir[2]).toBeLessThan(-0.7);
    expect(L.sunDir[1]).toBeLessThan(0.45);
    // Warm: more red than blue.
    expect(L.sunColor[0]).toBeGreaterThan(L.sunColor[2] * 2);
    expect(L.shaft).toBeCloseTo(1, 5);
  });

  test("the morning sun comes from the left window", () => {
    const L = daylight(8);
    expect(L.sunDir[0]).toBeLessThan(-0.7);
  });

  test("the moon is the direct light outside sunrise and sunset", () => {
    expect(daylight(SUNRISE - 0.5).moon).toBe(true);
    expect(daylight(SUNRISE + 0.5).moon).toBe(false);
    expect(daylight(SUNSET + 0.5).moon).toBe(true);
    expect(daylight(2).sunColor[2]).toBeGreaterThan(daylight(2).sunColor[0]);
  });

  test("snow dims and cools the day, lights the candles, and makes the room cold", () => {
    const clear = daylight(12.5, 0), snow = daylight(12.5, 1);
    expect(snow.sunIntensity).toBeLessThan(clear.sunIntensity * 0.5);
    expect(snow.shaft).toBeLessThan(clear.shaft * 0.5);
    expect(snow.candle).toBeGreaterThan(0.5);
    expect(snow.cold).toBe(1);
    expect(clear.cold).toBe(0);
    // A grey sky: its colours are closer together than a clear noon's blue.
    const spread = (c: number[]) => Math.max(...c) - Math.min(...c);
    expect(spread(snow.skyTop)).toBeLessThan(spread(clear.skyTop));
  });

  test("hours read as a clock and a part of the day", () => {
    expect(clockLabel(18.3)).toBe("6:18 pm");
    expect(clockLabel(0)).toBe("12:00 am");
    expect(clockLabel(12.5)).toBe("12:30 pm");
    expect(clockLabel(23.999)).toBe("12:00 am");
    expect(phaseOf(8)).toBe("morning");
    expect(phaseOf(12.5)).toBe("noon");
    expect(phaseOf(23)).toBe("night");
    expect(phaseOf(19.5)).toBe("dusk");
  });
});

describe("the die shows what the code rolled", () => {
  const faces = d20Faces(new IcosahedronGeometry(1, 0));

  test("every number from 1 to 20 is on the die once, and opposite faces add up to 21", () => {
    expect([...faces.numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (let f = 0; f < 20; f++) {
      const opposite = faces.normals.findIndex((n) => n.dot(faces.normals[f]!) < -0.999);
      expect(faces.numbers[f]! + faces.numbers[opposite]!).toBe(21);
    }
  });

  test("the die rests with the asked-for number up, its numeral upright for the reader", () => {
    const readFrom = new Vector3(0.4, 0, -1.1).normalize();
    for (let value = 1; value <= 20; value++) {
      const turn = restingTurn(faces, value, readFrom);
      const f = faces.numbers.indexOf(value);
      const up = faces.normals[f]!.clone().applyQuaternion(turn);
      expect(up.y).toBeCloseTo(1, 5);
      // No other face points up.
      for (let k = 0; k < 20; k++) if (k !== f) expect(faces.normals[k]!.clone().applyQuaternion(turn).y).toBeLessThan(0.8);
      // The top of the numeral points away from the reader.
      const top = faces.tops[f]!.clone().applyQuaternion(turn);
      expect(top.y).toBeCloseTo(0, 5);
      expect(top.dot(readFrom)).toBeCloseTo(1, 5);
    }
  });

  test("a face the die does not have is refused", () => {
    expect(() => restingTurn(faces, 21, new Vector3(0, 0, -1))).toThrow();
  });

  test("the same seed always rolls the same numbers", () => {
    const a = seededRng("a-seed"), b = seededRng("a-seed");
    const first = Array.from({ length: 30 }, () => rollD20(a));
    expect(Array.from({ length: 30 }, () => rollD20(b))).toEqual(first);
    expect(first.every((n) => n >= 1 && n <= 20)).toBe(true);
    expect(new Set(first).size).toBeGreaterThan(8);
  });
});

describe("the map sheet", () => {
  test("stops land inside the sheet's border", () => {
    for (const [u, v] of [[0, 0], [1, 1], [0.5, 0.5], [0, 1]] as const) {
      const p = stopOnSheet(u, v);
      expect(p.u).toBeGreaterThan(0.05);
      expect(p.u).toBeLessThan(0.95);
      expect(p.v).toBeGreaterThan(0.08);
      expect(p.v).toBeLessThan(0.92);
    }
    expect(stopOnSheet(0.2, 0.5).u).toBeLessThan(stopOnSheet(0.8, 0.5).u);
    expect(stopOnSheet(0.5, 0.2).v).toBeLessThan(stopOnSheet(0.5, 0.8).v);
  });

  const places = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
  const chain = (n: number): [string, string][] => Array.from({ length: n - 1 }, (_, i) => [`p${i}`, `p${i + 1}`]);

  test("a run's places each get a spot of their own, inside the sheet and off the sea", () => {
    for (const n of [1, 5, 12, 20, 26]) {
      const at = layoutPlaces(places(n), chain(n));
      expect(at.size).toBe(n);
      const spots = [...at.values()];
      for (const p of spots) {
        expect(p.u).toBeGreaterThanOrEqual(0);
        expect(p.u).toBeLessThan(0.8);
        expect(p.v).toBeGreaterThan(0.05);
        expect(p.v).toBeLessThan(0.97);
      }
      // No two closer than a cell's width.
      for (let i = 0; i < spots.length; i++)
        for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i]!.u - spots[j]!.u, (spots[i]!.v - spots[j]!.v) * 0.7)).toBeGreaterThan(0.06);
    }
  });

  test("a place keeps its spot as more become known, and the same places always come out the same", () => {
    const few = layoutPlaces(places(6), chain(6));
    const more = layoutPlaces(places(12), chain(12));
    for (const [id, p] of few) expect(more.get(id)).toEqual(p);
    expect(layoutPlaces(places(12), chain(12))).toEqual(more);
  });

  test("a place is set near the place a way joins it to", () => {
    const at = layoutPlaces(places(8), [["p0", "p1"], ["p0", "p2"], ["p2", "p7"], ["p3", "p4"]]);
    const d = (a: string, b: string) => Math.hypot(at.get(a)!.u - at.get(b)!.u, at.get(a)!.v - at.get(b)!.v);
    expect(d("p2", "p7")).toBeLessThan(0.3);
  });
});

describe("the reckoning (room/tally.ts)", () => {
  test("a meter up to ten is shown bead for bead", () => {
    expect(beadsFor(3, 10)).toEqual({ n: 10, k: 3 });
    expect(beadsFor(6, 8)).toEqual({ n: 8, k: 6 });
    expect(beadsFor(0, 4)).toEqual({ n: 4, k: 0 });
    expect(beadsFor(9, 4)).toEqual({ n: 4, k: 4 });
    expect(beadsFor(-2, 4)).toEqual({ n: 4, k: 0 });
  });

  test("a larger one in tenths, never empty while there is any and never full while some is missing", () => {
    expect(beadsFor(14, 20)).toEqual({ n: 10, k: 7 });
    expect(beadsFor(1, 100)).toEqual({ n: 10, k: 1 });
    expect(beadsFor(99, 100)).toEqual({ n: 10, k: 9 });
    expect(beadsFor(100, 100)).toEqual({ n: 10, k: 10 });
    expect(beadsFor(0, 100)).toEqual({ n: 10, k: 0 });
  });
});

describe("what the systems' cards are drawn as (room/tablecards.ts)", () => {
  test("each group has a picture, and an unknown group the token", () => {
    expect(kindOfGroup("quest")).toBe("lantern");
    expect(kindOfGroup("Wares")).toBe("purse");
    expect(kindOfGroup("perk")).toBe("boon");
    expect(kindOfGroup("suggestion")).toBe("crossroads");
    expect(kindOfGroup("something else")).toBe("token");
    // As the systems name them.
    expect(kindOfGroup("quests")).toBe("lantern");
    expect(kindOfGroup("Old Hesk's wares")).toBe("purse");
    expect(kindOfGroup("choices")).toBe("crossroads");
    expect(kindOfGroup("perks")).toBe("boon");
    expect(kindOfGroup("shadows")).toBe("token");
  });
});

describe("the candles are a second clock", () => {
  test("they are new at dusk, burn down steadily through the night, and are stubs by morning", () => {
    expect(candleBurn(CANDLES_LIT)).toBe(0);
    expect(candleBurn(BURNT_OUT)).toBe(1);
    let prev = 0;
    // From the moment they are lit, through midnight, to the moment they are spent.
    for (let since = 0; since <= 24 - CANDLES_LIT + BURNT_OUT; since += 0.05) {
      const b = candleBurn(CANDLES_LIT + since);
      expect(b).toBeGreaterThanOrEqual(prev);
      // Never a jump: a twentieth of an hour takes off less than a hundredth of a candle.
      expect(b - prev).toBeLessThan(0.01);
      prev = b;
    }
    expect(prev).toBeGreaterThan(0.99);
    // About half gone a little after midnight.
    expect(candleBurn(0.6)).toBeGreaterThan(0.45);
    expect(candleBurn(0.6)).toBeLessThan(0.55);
  });

  test("all day they stand as cold stubs, until new ones are set out at dusk", () => {
    for (let h = BURNT_OUT; h < CANDLES_LIT; h += 0.25) expect(candleBurn(h)).toBe(1);
    expect(candleBurn(CANDLES_LIT - 0.01)).toBe(1);
    expect(candleBurn(CANDLES_LIT + 0.01)).toBeLessThan(0.01);
  });

  test("the light carries the same burn the candles show", () => {
    for (const h of [0, 3, 6.9, 12, 18.3, 21]) expect(daylight(h).burn).toBe(candleBurn(h));
  });
});

describe("the weather", () => {
  test("every kind of weather gives a usable light at every hour", () => {
    for (const w of WEATHER_NAMES) {
      for (let h = 0; h < 24; h += 0.5) {
        const L = daylight(h, WEATHERS[w]);
        expect(Math.hypot(...L.sunDir)).toBeCloseTo(1, 5);
        for (const v of [L.sunIntensity, L.ambientIntensity, L.exposure, ...L.sunColor, ...L.skyTop, ...L.skyHorizon]) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
        expect(L.exposure).toBeGreaterThan(0);
        for (const v of [L.candle, L.shaft, L.cold, L.wet, L.fog, L.wind, L.storm, L.burn]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  test("each kind is its own", () => {
    const at = (w: (typeof WEATHER_NAMES)[number]) => daylight(14, WEATHERS[w]);
    const clear = at("clear");
    expect([clear.wet, clear.fog, clear.wind, clear.storm, clear.cold]).toEqual([0, 0, 0, 0, 0]);
    expect(at("rain").wet).toBeGreaterThan(0.5);
    expect(at("rain").cold).toBe(0);
    expect(at("storm").storm).toBe(1);
    expect(at("storm").wet).toBe(1);
    expect(at("storm").wind).toBeGreaterThan(0.5);
    expect(at("fog").fog).toBe(1);
    expect(at("wind").wind).toBe(1);
    // A high wind in a clear sky leaves the light alone.
    expect(at("wind").sunIntensity).toBe(clear.sunIntensity);
    expect(at("snow").cold).toBe(1);
  });

  test("a dark day is dark enough that candles are set out early", () => {
    for (const w of ["rain", "storm", "fog", "snow"] as const) {
      const L = daylight(14, WEATHERS[w]);
      expect(L.candle).toBeGreaterThanOrEqual(0.5);
      expect(L.sunIntensity).toBeLessThan(daylight(14).sunIntensity * 0.5);
    }
    expect(daylight(14, WEATHERS.wind).candle).toBe(0);
    // The storm is the darkest of them.
    expect(daylight(14, WEATHERS.storm).sunIntensity).toBeLessThan(daylight(14, WEATHERS.rain).sunIntensity);
  });

  test("lightning strikes at the same moments every time, a few times a minute, and the thunder follows it", () => {
    const a = new Lightning(), b = new Lightning();
    let strikes = 0, was = 0, firstFlash = -1, firstRumble = -1;
    for (let t = 0; t < 120; t += 0.01) {
      const k = a.flash(t).k;
      expect(k).toBe(b.flash(t).k);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(1);
      if (k > 0.5 && was <= 0.5) strikes++;
      was = k;
      if (firstFlash < 0 && k > 0.5) firstFlash = t;
      if (firstRumble < 0 && a.rumble(t) > 0.3) firstRumble = t;
    }
    expect(strikes).toBeGreaterThan(6);
    expect(strikes).toBeLessThan(40);
    expect(firstRumble).toBeGreaterThan(firstFlash + 0.4);
    expect(firstRumble).toBeLessThan(firstFlash + 1.5);
  });
});

describe("a slow machine draws less, in steps", () => {
  test("good frames never ask for less", () => {
    const g = new Governor();
    for (let i = 0; i < 6000; i++) expect(g.note(16.7)).toBe(false);
  });

  test("about two seconds of slow frames drop one step, and it takes as long again for the next", () => {
    const g = new Governor();
    let frames = 0;
    while (!g.note(50)) frames++;
    expect(frames * 50).toBeGreaterThanOrEqual(1900);
    expect(frames * 50).toBeLessThanOrEqual(2100);
    frames = 0;
    while (!g.note(50)) frames++;
    expect(frames * 50).toBeGreaterThanOrEqual(1900);
  });

  test("a hitch now and then is forgiven, and a page left in the background is not counted", () => {
    const g = new Governor();
    for (let i = 0; i < 2000; i++) expect(g.note(i % 30 === 0 ? 60 : 16.7)).toBe(false);
    for (let i = 0; i < 100; i++) expect(g.note(5000)).toBe(false);
  });

  test("each step draws no more than the one before", () => {
    for (let i = 1; i < QUALITY.length; i++) {
      expect(QUALITY[i]!.lines).toBeLessThan(QUALITY[i - 1]!.lines);
      expect(QUALITY[i]!.sunShadow).toBeLessThanOrEqual(QUALITY[i - 1]!.sunShadow);
    }
    expect(QUALITY[0]!.candleShadows).toBe(true);
    expect(QUALITY[QUALITY.length - 1]!.motes).toBe(false);
  });
});

describe("writing that runs past a page (room/paper.ts)", () => {
  const row = (h: number, gap = 0) => ({ h, gap });

  test("rows fill a leaf and go on at the top of the next, none lost", () => {
    const rows = Array.from({ length: 45 }, () => row(40));
    const leaves = leavesOf(rows, 756);
    expect(leaves.map((l) => l.length)).toEqual([18, 18, 9]);
    expect(leaves.flat()).toHaveLength(45);
  });

  test("a leaf never begins with the space before a paragraph", () => {
    // Two rows fill the leaf exactly; the third has a gap, which is left out at the top of the next.
    const leaves = leavesOf([row(50), row(50), row(50, 30), row(50)], 100);
    expect(leaves.map((l) => l.length)).toEqual([2, 2]);
  });

  test("a row taller than a leaf still gets one, and nothing is one leaf", () => {
    expect(leavesOf([row(500), row(10)], 100).map((l) => l.length)).toEqual([1, 1]);
    expect(leavesOf([], 100)).toEqual([[]]);
  });

  test("wrapped text keeps every word, however long", () => {
    const text = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
    const lines = wrapText((s) => s.length * 10, text, 300);
    expect(lines.join(" ")).toBe(text);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(30);
  });
});
