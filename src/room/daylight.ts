/**
 * The light is the clock (docs/DESIGN.md, 8): the game's hour of day and its
 * weather, turned into everything the room needs to light itself. Pure
 * numbers, no three.js, so the rules of the light can be tested without a
 * browser.
 *
 * The room's axes: +x is the player's right, +y is up, +z points from the
 * narrator toward the player. A window sits in the back wall (behind the
 * narrator) and another in the left wall. The sun rises on the left, climbs,
 * and sets behind the narrator, so the day ends with low gold light coming
 * straight down the table toward the player.
 */

export type Rgb = [number, number, number];

/** The kinds of weather the room can show. */
export type Weather = "clear" | "rain" | "storm" | "fog" | "wind" | "snow";

/** What is in the air, each 0..1. A kind of weather is a mix of these; the room slides from one mix to the next. */
export interface Air {
  snow: number;
  rain: number;
  fog: number;
  wind: number;
  /** Thunder and lightning. */
  storm: number;
}

export const CALM: Air = { snow: 0, rain: 0, fog: 0, wind: 0, storm: 0 };

export const WEATHERS: Record<Weather, Air> = {
  clear: CALM,
  rain: { ...CALM, rain: 0.75, wind: 0.2 },
  storm: { ...CALM, rain: 1, wind: 0.85, storm: 1 },
  fog: { ...CALM, fog: 1 },
  wind: { ...CALM, wind: 1 },
  snow: { ...CALM, snow: 1, wind: 0.12 },
};

export const WEATHER_NAMES = Object.keys(WEATHERS) as Weather[];

export type Phase = "night" | "dawn" | "morning" | "noon" | "afternoon" | "golden hour" | "dusk";

export interface LightState {
  /** Unit vector pointing from the room toward the sun (or the moon at night). */
  sunDir: [number, number, number];
  /** sRGB, 0..1. */
  sunColor: Rgb;
  sunIntensity: number;
  /** True while the direct light is the moon. */
  moon: boolean;
  skyTop: Rgb;
  skyHorizon: Rgb;
  ambientSky: Rgb;
  ambientGround: Rgb;
  ambientIntensity: number;
  /** How lit the candles are, 0 (out) to 1. */
  candle: number;
  /** How visible the shafts of light through the windows are, 0..1. */
  shaft: number;
  exposure: number;
  /** How cold the room is, 0..1: frost, breath fog and shiver follow it. */
  cold: number;
  /** Rain on the glass and past the windows, 0..1. */
  wet: number;
  /** Fog outside and creeping in, 0..1. */
  fog: number;
  /** Wind: the flames lean, leaves pass the windows, the map lifts at a corner. 0..1. */
  wind: number;
  /** Thunder and lightning, 0..1. */
  storm: number;
  /** How far the candles have burnt down, 0 (new) to 1 (stubs). */
  burn: number;
  phase: Phase;
}

const hex = (n: number): Rgb => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

interface Key {
  h: number;
  sun: Rgb;
  sunI: number;
  top: Rgb;
  hor: Rgb;
  amb: Rgb;
  ground: Rgb;
  ambI: number;
  candle: number;
  shaft: number;
  exp: number;
}

/** First light and last light: between them the direct light is the sun, outside them the moon. */
export const SUNRISE = 5.8;
export const SUNSET = 20;

const NIGHT: Omit<Key, "h"> = {
  sun: hex(0x8ea8e0), sunI: 0.5,
  top: hex(0x04060d), hor: hex(0x0c1322),
  amb: hex(0x1c2640), ground: hex(0x0a0706), ambI: 0.27,
  candle: 1, shaft: 0.3, exp: 1.12,
};

const KEYS: Key[] = [
  { h: 0, ...NIGHT },
  { h: 4.9, ...NIGHT },
  // The moon fades out and the sun takes over at zero strength, so the swap is never seen.
  { h: SUNRISE, sun: hex(0xff9a70), sunI: 0, top: hex(0x18213c), hor: hex(0x5c4250), amb: hex(0x38405c), ground: hex(0x0c0908), ambI: 0.29, candle: 1, shaft: 0, exp: 1.1 },
  { h: 6.7, sun: hex(0xffb080), sunI: 1.6, top: hex(0x3b5788), hor: hex(0xf2a878), amb: hex(0x7684a4), ground: hex(0x241a14), ambI: 0.42, candle: 0.45, shaft: 0.8, exp: 1 },
  { h: 8.5, sun: hex(0xfff0d6), sunI: 3.4, top: hex(0x4c8cd6), hor: hex(0xc6dbf0), amb: hex(0xa6bedc), ground: hex(0x3a3028), ambI: 0.72, candle: 0, shaft: 0.7, exp: 1 },
  { h: 12.5, sun: hex(0xfffaf0), sunI: 5, top: hex(0x3d84e0), hor: hex(0xbcd8f4), amb: hex(0xc4ccd8), ground: hex(0x4a4036), ambI: 0.78, candle: 0, shaft: 0.55, exp: 1 },
  { h: 16, sun: hex(0xffe4b4), sunI: 3.8, top: hex(0x4a84cc), hor: hex(0xdcd6c8), amb: hex(0xb4bccc), ground: hex(0x44362a), ambI: 0.8, candle: 0, shaft: 0.65, exp: 1 },
  { h: 18.3, sun: hex(0xff9838), sunI: 3.6, top: hex(0x586ca6), hor: hex(0xffb060), amb: hex(0xb8845c), ground: hex(0x2a1810), ambI: 0.46, candle: 0.2, shaft: 1, exp: 1 },
  { h: 19.4, sun: hex(0xff5626), sunI: 0.9, top: hex(0x292e58), hor: hex(0xd25c38), amb: hex(0x6c5064), ground: hex(0x140c0a), ambI: 0.3, candle: 0.85, shaft: 0.5, exp: 1.03 },
  { h: SUNSET, sun: hex(0xff5626), sunI: 0, top: hex(0x111730), hor: hex(0x382a48), amb: hex(0x2c3050), ground: hex(0x0c0908), ambI: 0.28, candle: 1, shaft: 0, exp: 1.1 },
  { h: 21, ...NIGHT },
  { h: 24, ...NIGHT },
];

/** New candles are set out and lit at this hour, as the light goes, and burn until BURNT_OUT the next morning. */
export const CANDLES_LIT = 18.25;
export const BURNT_OUT = 7;

/**
 * How far the candles have burnt down at this hour: 0 is a new candle, 1 a
 * stub. They burn evenly from the evening to the morning. By day the cold
 * stubs stand where they went out, until new ones are set out in the evening.
 */
export function candleBurn(hour: number): number {
  const h = wrapHour(hour);
  const night = 24 - CANDLES_LIT + BURNT_OUT;
  const since = h >= CANDLES_LIT ? h - CANDLES_LIT : h + 24 - CANDLES_LIT;
  return since < night ? since / night : 1;
}

/** Hours wrap: 25 is 1, -1 is 23. */
export function wrapHour(h: number): number {
  return ((h % 24) + 24) % 24;
}

export function phaseOf(hour: number): Phase {
  const h = wrapHour(hour);
  if (h < 5 || h >= 20.5) return "night";
  if (h < 7) return "dawn";
  if (h < 11) return "morning";
  if (h < 14) return "noon";
  if (h < 17) return "afternoon";
  if (h < 19.2) return "golden hour";
  return "dusk";
}

/** "6:30 pm" for a 24-hour float. */
export function clockLabel(hour: number): string {
  const h = wrapHour(hour);
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) {
    mm = 0;
    hh = (hh + 1) % 24;
  }
  const twelve = hh % 12 === 0 ? 12 : hh % 12;
  return `${twelve}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`;
}

function norm(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Where the direct light comes from at this hour. */
function lightDir(h: number): { dir: [number, number, number]; moon: boolean } {
  if (h >= SUNRISE && h <= SUNSET) {
    const p = (h - SUNRISE) / (SUNSET - SUNRISE);
    // Never quite on the horizon: a light lying flat along the table stretches every shadow to nothing. And never
    // high: it is a winter sun, which tops out at about 26 degrees, so even at noon it reaches in across the table.
    const raw = Math.max(0.09, Math.sin(Math.PI * p)) * 56;
    const el = ((raw / Math.pow(1 + Math.pow(raw / 27, 4), 0.25)) * Math.PI) / 180;
    // From the left wall in the morning (12 degrees) round to the back wall by evening (80 degrees), holding to the
    // left through the middle of the day so the noon sun lands on the near left of the table.
    const az = ((12 + 68 * (p - 0.17 * Math.sin(Math.PI * p) ** 2)) * Math.PI) / 180;
    return { dir: norm([-Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el)]), moon: false };
  }
  // The moon stays behind the back window all night and drifts a little, so its light always lies across the table.
  const p = (h > SUNSET ? h - SUNSET : h + 24 - SUNSET) / (24 - SUNSET + SUNRISE);
  return { dir: norm([lerp(-0.5, -0.12, p), 0.5 + 0.1 * Math.sin(Math.PI * p), -0.8]), moon: true };
}

/**
 * The room's light at an hour (0..24, wraps) under what is in the air (a
 * plain number is an amount of snow, 0 clear .. 1 snowing hard). Every value
 * moves smoothly with the hour; the one jump, sun to moon, happens while the
 * direct light is at zero.
 */
export function daylight(hour: number, air: number | Partial<Air> = 0): LightState {
  const h = wrapHour(hour);
  const a0 = typeof air === "number" ? { snow: air } : air;
  const s = clamp01(a0.snow ?? 0);
  const rain = clamp01(a0.rain ?? 0);
  const fog = clamp01(a0.fog ?? 0);
  const wind = clamp01(a0.wind ?? 0);
  const storm = clamp01(a0.storm ?? 0);
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.h <= h) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const t = b.h === a.h ? 0 : clamp01((h - a.h) / (b.h - a.h));

  const { dir, moon } = lightDir(h);
  let sunColor = mix(a.sun, b.sun, t);
  let sunIntensity = lerp(a.sunI, b.sunI, t);
  let skyTop = mix(a.top, b.top, t);
  let skyHorizon = mix(a.hor, b.hor, t);
  let ambientSky = mix(a.amb, b.amb, t);
  const ambientGround = mix(a.ground, b.ground, t);
  let ambientIntensity = lerp(a.ambI, b.ambI, t);
  let candle = lerp(a.candle, b.candle, t);
  let shaft = lerp(a.shaft, b.shaft, t);
  let exposure = lerp(a.exp, b.exp, t);

  if (s > 0) {
    // Snow: a low grey sky, the sun reduced to a cold glow, flat pale light, and candles lit against the gloom.
    const bright = clamp01((ambientIntensity - 0.2) / 0.85);
    // The sky is a heavy grey even at noon, so the white of the falling snow shows against it.
    skyTop = mix(skyTop, mix(hex(0x0a0d14), hex(0x6c7584), bright), 0.92 * s);
    skyHorizon = mix(skyHorizon, mix(hex(0x12161f), hex(0x9aa2ae), bright), 0.92 * s);
    sunColor = mix(sunColor, [0.8, 0.87, 1], 0.85 * s);
    sunIntensity *= 1 - 0.7 * s;
    ambientSky = mix(ambientSky, mix(hex(0x1a2030), hex(0xb4c2d8), bright), 0.8 * s);
    ambientIntensity *= 1 + 0.12 * s;
    shaft *= 1 - 0.85 * s;
    candle = Math.max(candle, 0.8 * s);
    exposure *= 1 - 0.05 * s;
  }

  if (rain > 0) {
    // Rain: a dark, heavy sky, darker still in a storm; almost no direct light; candles against the gloom.
    const bright = clamp01((ambientIntensity - 0.2) / 0.85);
    const heavy = 1 - 0.4 * storm;
    const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
    skyTop = mix(skyTop, mix(hex(0x05070b), scale(hex(0x4c5662), heavy), bright), 0.94 * rain);
    skyHorizon = mix(skyHorizon, mix(hex(0x0a0d13), scale(hex(0x8a949e), heavy), bright), 0.94 * rain);
    sunColor = mix(sunColor, [0.7, 0.79, 0.95], 0.8 * rain);
    sunIntensity *= 1 - 0.84 * rain;
    ambientSky = mix(ambientSky, mix(hex(0x121824), hex(0x8092aa), bright), 0.8 * rain);
    ambientIntensity *= 1 - 0.22 * rain - 0.16 * rain * storm;
    shaft *= 1 - 0.92 * rain;
    candle = Math.max(candle, Math.min(1, 0.8 * rain + 0.2 * storm));
    exposure *= 1 - 0.03 * rain;
  }
  if (fog > 0) {
    // Fog: no sky, only a flat pale wall of it; the sun a smear; soft light from everywhere.
    const bright = clamp01((ambientIntensity - 0.2) / 0.85);
    const wall = mix(hex(0x0d1016), hex(0xb4b8ba), bright);
    skyTop = mix(skyTop, wall, 0.96 * fog);
    skyHorizon = mix(skyHorizon, wall, 0.96 * fog);
    sunColor = mix(sunColor, [0.92, 0.92, 0.9], 0.7 * fog);
    sunIntensity *= 1 - 0.72 * fog;
    ambientSky = mix(ambientSky, mix(hex(0x181c24), hex(0xb6bcc0), bright), 0.85 * fog);
    ambientIntensity *= 1 + 0.08 * fog;
    shaft *= 1 - 0.5 * fog;
    candle = Math.max(candle, 0.6 * fog);
  }

  return { wet: rain, fog, wind, storm, burn: candleBurn(h), sunDir: dir, sunColor, sunIntensity, moon, skyTop, skyHorizon, ambientSky, ambientGround, ambientIntensity, candle, shaft, exposure, cold: s, phase: phaseOf(h) };
}
