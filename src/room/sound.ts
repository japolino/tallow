/**
 * The room's sounds: recordings (assets/sounds, from Freesound; CREDITS.md), played with WebAudio.
 *
 *   beds     what is always there, louder or softer with the room: a low room tone, the fire, wind, rain, and the
 *            night outside. Each is a recorded loop, faded over its own start so it has no seam.
 *   effects  the small sounds of the table, played by the things that make them: the die thrown, a card dealt, the
 *            pencil, a page torn off, a piece set down, a stone in the bowl, the leather unrolled. Each has a few
 *            recordings, and one is picked at random (a little faster or slower) every time.
 *
 * Every sound also has a stand-in made in code, used only until its recordings are decoded, or if they fail.
 *
 * There is one of these for the page (`sound`), shared by everything in the room. Until the first click or key
 * press the browser will not let a page make sound, so nothing is made before then: every call is safe, and does
 * nothing, before `start`. The music is not played here (music.ts) but follows the same levels.
 */

export type Sfx =
  | "throw" // the die thrown: the whole tumble, from its first landing
  | "clack" // the die on wood (a bounce; the recorded throw has its own)
  | "rattle" // the die shaken in your hand
  | "deal" // a card through the air
  | "pat" // a card laid down
  | "riffle" // the deck shuffled
  | "scratch" // the pencil on the page
  | "tear" // the page torn off
  | "slide" // paper pushed over the table
  | "knock" // a wooden piece set down
  | "token" // a counter set down
  | "swish" // something into a sleeve
  | "weight" // iron into the pan of the balance
  | "tink" // brass, or the balance's own ring
  | "stone" // a stone into the bowl
  | "unroll" // the leather unrolled
  | "rollup" // the leather rolled up
  | "peg" // a peg or a dial set into the leather
  | "strike" // a candle lit
  | "slam" // a fist on the table
  | "tap" // a finger on the table
  | "thunder";

export interface PlayOpts {
  /** Across the table, -1 your left .. 1 your right (room x is about -0.7..0.7 and is taken as it is). */
  x?: number;
  /** 0..1 or a little more. */
  gain?: number;
  /** Pitch, 1 as made. */
  rate?: number;
  /** Seconds from now. */
  delay?: number;
}

export interface Levels {
  muted: boolean;
  /** Everything, 0..1. */
  master: number;
  music: number;
  /** The room's own sounds: the beds and the table. */
  sounds: number;
}

export const LEVELS: Levels = { muted: false, master: 0.8, music: 0.45, sounds: 0.8 };

/** What the room tells the sound every frame. */
export interface RoomAir {
  wind: number;
  rain: number;
  storm: number;
  snow: number;
  fog: number;
}

export type Bed = "tone" | "candles" | "wind" | "rain" | "night";
const BEDS: Bed[] = ["tone", "candles", "wind", "rain", "night"];

const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));

/** Levels kept as they are given, read back from storage as they were. */
export function normalLevels(v: unknown): Levels {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof Levels, unknown>>;
  const num = (x: unknown, d: number): number => (typeof x === "number" && Number.isFinite(x) ? clamp(x) : d);
  return { muted: o.muted === true, master: num(o.master, LEVELS.master), music: num(o.music, LEVELS.music), sounds: num(o.sounds, LEVELS.sounds) };
}

/** How loud each bed should be for the room as it is (0..1 before the levels). Pure, for tests. */
export function bedMix(air: RoomAir, candles: number, night: boolean): Record<Bed, number> {
  const wet = clamp(air.rain + air.storm * 0.8);
  return {
    tone: 1,
    candles: clamp(candles),
    wind: clamp(air.wind * 0.75 + air.storm * 0.45 + air.snow * 0.3 + air.fog * 0.1),
    rain: wet,
    // Crickets and the night outside, when nothing louder is going on out there.
    night: night ? clamp(1 - wet * 1.6 - air.wind * 0.9 - air.snow) : 0,
  };
}

/** A seamless loop from a recording: its end is faded over its start, so there is no click where it wraps. */
export function loopable(channels: Float32Array[], rate: number, fade = 1.5): Float32Array[] {
  const len = channels[0]?.length ?? 0;
  const f = Math.min(Math.floor(rate * fade), Math.floor(len / 3));
  if (f < 2) return channels;
  return channels.map((src) => {
    const out = new Float32Array(len - f);
    out.set(src.subarray(0, len - f));
    // The first f samples become a crossfade from the tail into the head (equal power).
    for (let i = 0; i < f; i++) {
      const k = i / f;
      out[i] = src[i]! * Math.sin((k * Math.PI) / 2) + src[len - f + i]! * Math.cos((k * Math.PI) / 2);
    }
    return out;
  });
}

interface BedNode {
  out: GainNode;
  made: GainNode;
  file: GainNode;
  fileSrc: AudioBufferSourceNode | null;
  /** Kept to move the wind about. */
  filter?: BiquadFilterNode;
}

export class Sound {
  levels: Levels = { ...LEVELS };
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private bedBus!: GainNode;
  private white!: AudioBuffer;
  private pink!: AudioBuffer;
  private brown!: AudioBuffer;
  private beds = new Map<Bed, BedNode>();
  private files = new Map<Bed, AudioBuffer>();
  private thunders: AudioBuffer[] = [];
  /** Recorded effects, by name: a few takes of each. */
  private shots = new Map<string, AudioBuffer[]>();
  private rattleUntil = 0;
  private listeners = new Set<(l: Levels) => void>();
  private startHooks = new Set<() => void>();
  private armed = false;
  private air: RoomAir = { wind: 0, rain: 0, storm: 0, snow: 0, fog: 0 };
  private candles = 0;
  private night = false;
  private nextPop = 0;
  private gust = 0;
  private gustTo = 0.5;
  private lastFlash = 0;
  private scratchAt = 0;
  private rattleAt = 0;

  get started(): boolean {
    return !!this.ctx;
  }

  /** The audio clock, for scheduling (0 before start). */
  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Start on the page's first click or key press (the browser allows nothing sooner). Safe to call more than once. */
  arm(): void {
    if (this.armed || typeof window === "undefined") return;
    this.armed = true;
    const go = (): void => {
      window.removeEventListener("pointerdown", go, true);
      window.removeEventListener("keydown", go, true);
      this.start();
    };
    window.addEventListener("pointerdown", go, true);
    window.addEventListener("keydown", go, true);
  }

  /** Called once sound may play (now, if it already may). */
  onStart(fn: () => void): () => void {
    if (this.ctx) fn();
    else this.startHooks.add(fn);
    return () => this.startHooks.delete(fn);
  }

  start(): void {
    if (this.ctx) {
      void this.ctx.resume().catch(() => {});
      return;
    }
    const AC = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!AC) return;
    let ctx: AudioContext;
    try {
      ctx = new AC({ latencyHint: "interactive" });
    } catch {
      return;
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.bedBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.bedBus.connect(this.master);
    this.white = this.noise("white");
    this.pink = this.noise("pink");
    this.brown = this.noise("brown");
    this.makeBeds();
    this.applyLevels();
    void ctx.resume().catch(() => {});
    for (const fn of this.startHooks) fn();
    this.startHooks.clear();
  }

  setLevels(l: Partial<Levels>): void {
    this.levels = normalLevels({ ...this.levels, ...l });
    this.applyLevels();
    for (const fn of this.listeners) fn(this.levels);
  }

  onLevels(fn: (l: Levels) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private applyLevels(): void {
    if (!this.ctx) return;
    const l = this.levels;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(l.muted ? 0 : l.master, t, 0.08);
    this.sfxBus.gain.setTargetAtTime(l.sounds, t, 0.08);
    this.bedBus.gain.setTargetAtTime(l.sounds, t, 0.08);
  }

  /** A recorded loop for a bed, or null for the one made here. */
  setBedFile(bed: Bed, buffer: AudioBuffer | null): void {
    if (buffer) this.files.set(bed, buffer);
    else this.files.delete(bed);
    const b = this.beds.get(bed);
    if (!this.ctx || !b) return;
    const t = this.ctx.currentTime;
    if (b.fileSrc) {
      const old = b.fileSrc;
      b.file.gain.setTargetAtTime(0, t, 0.6);
      old.stop(t + 3);
      b.fileSrc = null;
    }
    if (buffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(b.file);
      // Start somewhere in the loop, so two sittings do not begin the same.
      src.start(t + 0.05, Math.random() * buffer.duration);
      b.fileSrc = src;
      b.file.gain.setTargetAtTime(1, t + 0.05, 1.2);
      b.made.gain.setTargetAtTime(0, t + 0.05, 1.2);
    } else b.made.gain.setTargetAtTime(1, t, 1.2);
  }

  /** Recorded thunder, used instead of the made one when there is any. */
  setThunder(buffers: AudioBuffer[]): void {
    this.thunders = buffers;
  }

  /** Decode a recording with the page's audio (null before start, or if it is not audio). */
  async decode(bytes: ArrayBuffer): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      return await this.ctx.decodeAudioData(bytes);
    } catch {
      return null;
    }
  }

  /** The same recording, made to loop without a seam. */
  seamless(buf: AudioBuffer): AudioBuffer {
    if (!this.ctx) return buf;
    const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
    const out = loopable(chans, buf.sampleRate);
    const b = this.ctx.createBuffer(out.length, out[0]!.length, buf.sampleRate);
    out.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    return b;
  }

  /**
   * Every frame, from the room: what is in the air, how lit the candles are, whether it is night, and how bright any
   * lightning is (a flash brings its thunder a moment later).
   */
  room(dt: number, air: RoomAir, candles: number, night: boolean, flash: number): void {
    this.air = air;
    this.candles = candles;
    this.night = night;
    if (!this.ctx || this.ctx.state !== "running") {
      this.lastFlash = flash;
      return;
    }
    const t = this.ctx.currentTime;
    const mix = bedMix(air, candles, night);
    const made: Record<Bed, number> = { tone: 0.07, candles: 0.05, wind: 0.32, rain: 0.3, night: 0.05 };
    // The recordings are all brought to the same peak; these set them against each other.
    const recorded: Record<Bed, number> = { tone: 0.06, candles: 0.16, wind: 0.32, rain: 0.26, night: 0.13 };
    for (const bed of BEDS) {
      const b = this.beds.get(bed);
      if (!b) continue;
      const base = this.files.has(bed) ? recorded[bed] : made[bed];
      b.out.gain.setTargetAtTime(mix[bed] * base * (bed === "wind" ? 0.55 + this.gust * 0.6 : 1), t, 0.4);
    }
    // The wind gusts: it wanders toward a new strength every few seconds.
    this.gust += (this.gustTo - this.gust) * Math.min(1, dt * 0.6);
    if (Math.abs(this.gustTo - this.gust) < 0.05) this.gustTo = Math.random();
    this.beds.get("wind")?.filter?.frequency.setTargetAtTime(260 + this.gust * 520, t, 0.5);
    // The candles crackle now and then, more when more of them burn.
    if (candles > 0.05 && t >= this.nextPop) {
      this.nextPop = t + 0.25 + Math.random() * (2.6 / (0.4 + candles));
      if (!this.files.has("candles")) this.pop(t, (Math.random() - 0.5) * 0.8, 0.12 + Math.random() * 0.25 * candles);
    }
    if (flash > 0.3 && this.lastFlash <= 0.3) this.play("thunder", { gain: 0.6 + Math.random() * 0.5, x: (Math.random() - 0.5) * 0.6, delay: 0.5 + Math.random() * 0.6 });
    this.lastFlash = flash;
  }

  /** The pencil while you write: a scratch for a letter, not more often than a hand could. */
  write(x = 0): void {
    const t = this.now;
    if (t - this.scratchAt < 0.045) return;
    this.scratchAt = t;
    this.play("scratch", { x, gain: 0.7 + Math.random() * 0.4, rate: 0.85 + Math.random() * 0.35 });
  }

  /** The die shaken in your hand: `shake` 0..1, called every frame while it is held. */
  shake(shake: number, x = 0.3): void {
    const t = this.now;
    const takes = this.shots.get("rattle");
    if (takes?.length) {
      // A recorded shake runs to its end, and another follows while the hand is still shaking.
      if (shake < 0.12 || t < this.rattleUntil || !this.ctx || this.ctx.state !== "running" || this.levels.muted) return;
      const dur = this.shot(takes, { x, gain: 0.25 + shake * 0.45 }, 0, "rattle");
      this.rattleUntil = t + dur * 0.85;
      return;
    }
    if (shake < 0.12 || t - this.rattleAt < 0.16 - shake * 0.1) return;
    this.rattleAt = t + Math.random() * 0.04;
    this.play("rattle", { x, gain: 0.35 + shake * 0.6 });
  }

  play(name: Sfx, o: PlayOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || this.levels.muted) return;
    const t = ctx.currentTime + (o.delay ?? 0) + 0.005;
    const g = clamp(o.gain ?? 1, 0, 2);
    const r = o.rate ?? 1;
    const out = ctx.createStereoPanner();
    out.pan.value = clamp((o.x ?? 0) * 1.3, -1, 1);
    out.connect(this.sfxBus);
    const jit = (k = 0.08) => 1 + (Math.random() * 2 - 1) * k;
    // A recording, when there is one.
    if (name === "clack" && this.shots.get("throw")?.length) return;
    const key = name === "rollup" ? "unroll-back" : name;
    const takes = name === "thunder" ? this.thunders : this.shots.get(key);
    if (takes?.length) {
      if (name === "scratch") this.scratchBit(takes, o, t);
      else this.shot(takes, o, o.delay ?? 0, key);
      return;
    }
    switch (name) {
      case "throw":
      case "clack":
        this.burst(t, out, { f: 2900 * r * jit(), q: 3, dur: 0.05, gain: 1.6 * g });
        this.burst(t, out, { f: 1250 * r * jit(), q: 2, dur: 0.035, gain: 1.1 * g });
        this.tone(t, out, 520 * r * jit(), 0.06, 0.3 * g, "triangle");
        this.tone(t, out, 1730 * r * jit(), 0.03, 0.12 * g, "sine");
        break;
      case "rattle":
        for (let i = 0; i < 3; i++) this.burst(t + i * (0.018 + Math.random() * 0.02), out, { f: 3600 * jit(0.2), q: 4, dur: 0.022, gain: (0.7 - i * 0.12) * g });
        break;
      case "deal":
        this.burst(t, out, { f: 1600 * r, fTo: 4200 * r, type: "bandpass", q: 1.1, dur: 0.11, gain: 0.32 * g, attack: 0.03 });
        break;
      case "pat":
        this.burst(t, out, { f: 900 * r * jit(), q: 1.2, dur: 0.05, gain: 0.7 * g, src: this.pink });
        this.burst(t, out, { f: 3200 * jit(), q: 2, dur: 0.02, gain: 0.25 * g });
        break;
      case "riffle":
        for (let i = 0; i < 26; i++) {
          const u = i / 26;
          this.burst(t + u * 0.55 + Math.random() * 0.012, out, { f: 2400 + u * 1600 + Math.random() * 900, q: 3, dur: 0.018, gain: (0.12 + Math.sin(Math.PI * u) * 0.14) * g });
        }
        this.burst(t + 0.58, out, { f: 700, q: 1, dur: 0.06, gain: 0.3 * g, src: this.pink });
        break;
      case "scratch":
        this.burst(t, out, { f: 4200 * r, fTo: 3000 * r, q: 2.5, dur: 0.05 + Math.random() * 0.06, gain: 0.11 * g, attack: 0.012 });
        break;
      case "tear": {
        // Fibres giving way one after another, faster as it goes, over a breathy rip.
        let at = 0;
        for (let i = 0; i < 30; i++) {
          at += 0.02 - i * 0.0004 + Math.random() * 0.012;
          this.burst(t + at, out, { f: 1800 + Math.random() * 3800, q: 5, dur: 0.012 + Math.random() * 0.012, gain: (0.25 + Math.random() * 0.25) * g });
        }
        this.burst(t, out, { f: 2400, fTo: 5200, type: "bandpass", q: 0.9, dur: at + 0.05, gain: 0.22 * g, attack: at * 0.6 });
        break;
      }
      case "slide":
        this.burst(t, out, { f: 1100 * r, fTo: 700 * r, type: "bandpass", q: 0.8, dur: 0.32, gain: 0.16 * g, attack: 0.1, src: this.pink });
        break;
      case "knock":
        this.tone(t, out, 210 * r * jit(), 0.09, 0.4 * g, "sine", 150 * r);
        this.burst(t, out, { f: 950 * r * jit(), q: 3, dur: 0.05, gain: 0.3 * g });
        break;
      case "token":
        this.tone(t, out, 330 * r * jit(), 0.06, 0.18 * g, "sine", 260 * r);
        this.burst(t, out, { f: 1900 * r * jit(), q: 4, dur: 0.035, gain: 0.25 * g });
        this.burst(t + 0.05 + Math.random() * 0.03, out, { f: 2300 * jit(), q: 5, dur: 0.02, gain: 0.1 * g });
        break;
      case "swish":
        this.burst(t, out, { f: 600, fTo: 1800, type: "bandpass", q: 0.7, dur: 0.22, gain: 0.14 * g, attack: 0.09, src: this.pink });
        break;
      case "weight":
        this.tone(t, out, 180 * r * jit(), 0.14, 0.2 * g, "sine", 140 * r);
        this.bell(t, out, 1150 * r * jit(0.03), [1, 2.76, 5.4], 0.35, 0.08 * g);
        break;
      case "tink":
        this.bell(t, out, 2350 * r * jit(0.02), [1, 2.4, 4.1], 0.7, 0.08 * g);
        break;
      case "stone":
        this.bell(t, out, 1450 * r * jit(0.06), [1, 2.05, 3.3], 0.28, 0.14 * g);
        this.burst(t, out, { f: 2600 * jit(), q: 4, dur: 0.03, gain: 0.3 * g });
        this.burst(t + 0.06 + Math.random() * 0.04, out, { f: 3100 * jit(), q: 5, dur: 0.02, gain: 0.12 * g });
        break;
      case "unroll":
      case "rollup": {
        const up = name === "unroll";
        this.burst(t, out, { f: up ? 300 : 900, fTo: up ? 1000 : 300, type: "bandpass", q: 0.8, dur: 0.75, gain: 0.45 * g, attack: up ? 0.12 : 0.4, src: this.pink });
        for (let i = 0; i < 5; i++) this.burst(t + 0.1 + i * 0.12 + Math.random() * 0.04, out, { f: 500 + Math.random() * 400, q: 1.5, dur: 0.05, gain: 0.3 * g, src: this.pink });
        this.tone(t + (up ? 0.72 : 0.6), out, 120, 0.12, 0.2 * g, "sine", 90);
        break;
      }
      case "peg":
        this.tone(t, out, 420 * r * jit(), 0.05, 0.2 * g, "triangle", 300 * r);
        this.burst(t, out, { f: 1600 * jit(), q: 3, dur: 0.03, gain: 0.2 * g });
        break;
      case "strike":
        // A dry scrape, the flare of the head, and the small breath of the flame taking.
        this.burst(t, out, { f: 3500, fTo: 2200, type: "bandpass", q: 1.4, dur: 0.12, gain: 0.25 * g, attack: 0.02 });
        this.burst(t + 0.09, out, { f: 1200, fTo: 500, type: "lowpass", q: 0.5, dur: 0.55, gain: 0.22 * g, attack: 0.06, src: this.pink });
        for (let i = 0; i < 4; i++) this.pop(t + 0.15 + Math.random() * 0.4, o.x ?? 0, 0.15);
        break;
      case "slam":
        this.tone(t, out, 70, 0.4, 0.9 * g, "sine", 38);
        this.burst(t, out, { f: 260, type: "lowpass", q: 0.7, dur: 0.28, gain: 0.7 * g, src: this.brown });
        this.burst(t, out, { f: 1100, q: 1.5, dur: 0.06, gain: 0.3 * g });
        // Everything on the table jumps and lands again.
        for (let i = 0; i < 6; i++) this.burst(t + 0.08 + Math.random() * 0.12, out, { f: 1500 + Math.random() * 2500, q: 4, dur: 0.025, gain: 0.1 * g });
        break;
      case "tap":
        this.tone(t, out, 160 * r * jit(), 0.07, 0.22 * g, "sine", 120);
        this.burst(t, out, { f: 700 * jit(), q: 2, dur: 0.04, gain: 0.12 * g, src: this.pink });
        break;
      case "thunder": {
        // A crack (when it is near), then a long roll that comes and goes before it dies away.
        const near = g > 0.9;
        if (near) this.burst(t, out, { f: 2400, fTo: 600, type: "lowpass", q: 0.6, dur: 0.5, gain: 0.35 * g, src: this.white });
        const dur = 3.5 + Math.random() * 2.5;
        this.burst(t + (near ? 0.1 : 0.3), out, { f: 220, fTo: 70, type: "lowpass", q: 0.8, dur, gain: 0.9 * g, attack: 0.35, src: this.brown });
        for (let i = 0; i < 3; i++) this.burst(t + 0.6 + i * (0.6 + Math.random() * 0.8), out, { f: 160, fTo: 60, type: "lowpass", q: 1, dur: 1.4, gain: 0.5 * g, attack: 0.2, src: this.brown });
        break;
      }
    }
  }

  /**
   * Take in the recordings: `files` are their names ("deal-2.mp3": a take of "deal"; "rain-1.mp3": the rain bed),
   * `get` fetches one. Decoded one after another once sound has started; each replaces its stand-in as it is ready.
   */
  loadRecordings(files: readonly string[], get: (file: string) => Promise<ArrayBuffer>): void {
    this.onStart(() => {
      void (async () => {
        for (const file of files) {
          const name = file.replace(/-\d+\.mp3$/, "");
          try {
            const buf = await this.decode(await get(file));
            if (!buf || !this.ctx) continue;
            if ((BEDS as string[]).includes(name)) this.setBedFile(name as Bed, this.seamless(buf));
            else if (name === "thunder") this.setThunder([...this.thunders, buf]);
            else {
              this.shots.set(name, [...(this.shots.get(name) ?? []), buf]);
              // The leather rolled up is the unrolling played backwards.
              if (name === "unroll") this.shots.set("unroll-back", [...(this.shots.get("unroll-back") ?? []), this.reversed(buf)]);
            }
          } catch {
            /* That one stays made in code. */
          }
        }
      })();
    });
  }

  /** How many recordings are in (for checks). */
  get recordings(): { shots: number; beds: number; thunder: number } {
    return { shots: [...this.shots.values()].reduce((n, l) => n + l.length, 0), beds: this.files.size, thunder: this.thunders.length };
  }

  /** How loud each recorded effect plays, against the others (they are all brought to the same peak). */
  private static LOUD: Record<string, number> = {
    throw: 0.8, rattle: 0.5, deal: 0.32, pat: 0.4, riffle: 0.4, tear: 0.45, slide: 0.22, knock: 0.55, token: 0.45,
    swish: 0.25, weight: 0.3, tink: 0.2, stone: 0.4, unroll: 0.35, "unroll-back": 0.35, peg: 0.4, strike: 0.45, slam: 0.9, thunder: 0.7,
  };

  /** Play one of the takes. Returns how long it lasts. */
  private shot(takes: AudioBuffer[], o: PlayOpts, delay: number, key: string): number {
    const ctx = this.ctx!;
    const buf = takes[Math.floor(Math.random() * takes.length)]!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const rate = (o.rate ?? 1) * (0.94 + Math.random() * 0.12);
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = clamp(o.gain ?? 1, 0, 2) * (Sound.LOUD[key] ?? 0.4);
    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp((o.x ?? 0) * 1.3, -1, 1);
    src.connect(g).connect(pan).connect(this.sfxBus);
    src.start(ctx.currentTime + delay + 0.005);
    return buf.duration / rate;
  }

  /** A moment of pencil on paper, from somewhere in a longer recording of writing. */
  private scratchBit(takes: AudioBuffer[], o: PlayOpts, t: number): void {
    const ctx = this.ctx!;
    const buf = takes[Math.floor(Math.random() * takes.length)]!;
    const len = 0.09 + Math.random() * 0.08;
    const at = Math.random() * Math.max(0, buf.duration - len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.95 + Math.random() * 0.1;
    const g = ctx.createGain();
    const peak = clamp(o.gain ?? 1, 0, 2) * 0.35;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.015);
    g.gain.setValueAtTime(peak, t + len - 0.03);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp((o.x ?? 0) * 1.3, -1, 1);
    src.connect(g).connect(pan).connect(this.sfxBus);
    src.start(t, at, len + 0.02);
  }

  private reversed(buf: AudioBuffer): AudioBuffer {
    const ctx = this.ctx!;
    const b = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) b.copyToChannel(buf.getChannelData(c).slice().reverse() as Float32Array<ArrayBuffer>, c);
    return b;
  }

  /* ------------------------------- the making ------------------------------- */

  private noise(kind: "white" | "pink" | "brown"): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "white") d[i] = w;
      else if (kind === "pink") {
        // Paul Kellet's filter.
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    // The loop wraps without a click.
    const f = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < f; i++) {
      const k = i / f;
      d[i] = d[i]! * k + d[len - f + i]! * (1 - k);
    }
    return buf;
  }

  private makeBeds(): void {
    const ctx = this.ctx!;
    const loop = (buf: AudioBuffer, ...chain: AudioNode[]): void => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      let at: AudioNode = src;
      for (const n of chain) at = at.connect(n);
      src.start(0, Math.random() * buf.duration);
    };
    const filter = (type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      return n;
    };
    for (const bed of BEDS) {
      const out = ctx.createGain();
      out.gain.value = 0;
      const made = ctx.createGain();
      const file = ctx.createGain();
      file.gain.value = 0;
      made.connect(out);
      file.connect(out);
      out.connect(this.bedBus);
      const node: BedNode = { out, made, file, fileSrc: null };
      if (bed === "tone") loop(this.brown, filter("lowpass", 170), made);
      else if (bed === "candles") loop(this.pink, filter("bandpass", 1800, 0.6), made);
      else if (bed === "wind") {
        node.filter = filter("bandpass", 420, 1.4);
        loop(this.pink, node.filter, filter("lowpass", 1400), made);
      } else if (bed === "rain") {
        loop(this.pink, filter("highpass", 700), filter("lowpass", 6500), made);
        // Heavier drops on the glass, under the hiss.
        loop(this.white, filter("bandpass", 3400, 2.5), made);
      } else {
        // The night: a soft high trill that comes and goes (crickets, far off).
        const trill = ctx.createOscillator();
        trill.frequency.value = 4300;
        const am = ctx.createGain();
        am.gain.value = 0;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 23;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.5;
        const slow = ctx.createOscillator();
        slow.frequency.value = 0.37;
        const slowGain = ctx.createGain();
        slowGain.gain.value = 0.5;
        lfo.connect(lfoGain).connect(am.gain);
        slow.connect(slowGain).connect(am.gain);
        const soft = ctx.createGain();
        soft.gain.value = 0.25;
        trill.connect(am).connect(soft).connect(made);
        trill.start();
        lfo.start();
        slow.start();
        loop(this.pink, filter("highpass", 3000), made);
      }
      this.beds.set(bed, node);
      const rec = this.files.get(bed);
      if (rec) this.setBedFile(bed, rec);
    }
  }

  /** A short filtered burst of noise. */
  private burst(t: number, out: AudioNode, o: { f: number; fTo?: number; q?: number; type?: BiquadFilterType; dur: number; gain: number; attack?: number; src?: AudioBuffer }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = o.src ?? this.white;
    const fl = ctx.createBiquadFilter();
    fl.type = o.type ?? "bandpass";
    fl.frequency.setValueAtTime(o.f, t);
    if (o.fTo) fl.frequency.exponentialRampToValueAtTime(o.fTo, t + o.dur);
    fl.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const a = o.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.005, o.dur));
    src.connect(fl).connect(g).connect(out);
    const off = Math.random() * (src.buffer.duration - o.dur - 0.1);
    src.start(t, Math.max(0, off));
    src.stop(t + o.dur + 0.05);
  }

  private tone(t: number, out: AudioNode, f: number, dur: number, gain: number, type: OscillatorType = "sine", fTo?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (fTo) o.frequency.exponentialRampToValueAtTime(fTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** A struck thing that rings: a few partials, the higher ones dying first. */
  private bell(t: number, out: AudioNode, f: number, partials: number[], dur: number, gain: number): void {
    partials.forEach((p, i) => this.tone(t, out, f * p, dur / (1 + i * 0.8), gain / (1 + i * 0.7)));
  }

  /** A crackle from a wick. */
  private pop(t: number, x: number, gain: number): void {
    const ctx = this.ctx!;
    const out = ctx.createStereoPanner();
    out.pan.value = clamp(x, -1, 1);
    out.connect(this.bedBus);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.burst(t + i * (0.01 + Math.random() * 0.03), out, { f: 2200 + Math.random() * 4000, q: 3, dur: 0.006 + Math.random() * 0.012, gain: gain * (1 - i * 0.25) });
  }

  /** The room is gone: its beds go quiet (they come back with the next room's first frame). */
  hush(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const b of this.beds.values()) b.out.gain.setTargetAtTime(0, t, 0.5);
  }

  dispose(): void {
    const ctx = this.ctx;
    this.armed = false;
    this.ctx = null;
    this.beds.clear();
    void ctx?.close().catch(() => {});
  }
}

/** The page's one sound. */
export const sound = new Sound();
