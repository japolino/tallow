/**
 * The music: pieces by Kevin MacLeod (incompetech.com), streamed from his site while they play, never bundled.
 * Licensed under Creative Commons: By Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/); the credits are
 * in CREDITS.md and in the drawer.
 *
 * The music follows what is happening at the table, by mood:
 *   road     on the way between places, and before the story starts (a lute, a story being told)
 *   place    at a stop, with something in the way (low, uneasy)
 *   contest  while the leather is out: a race against something (tense)
 *   night    on the road after dark
 *   end      a story over
 * A new mood fades the old piece out and a new one in. A piece runs to its end and the next is another of the same
 * mood. Nothing is fetched until sound may play (sound.ts) and the music is turned up.
 */
import { sound, type Levels } from "./sound.js";

export type Mood = "road" | "place" | "contest" | "night" | "end";

export const TRACKS: Record<Mood, readonly string[]> = {
  road: ["Teller of the Tales", "Midnight Tale", "Suonatore di Liuto", "Heavy Heart"],
  place: ["Lost Time", "Ghost Story", "Heart of Nowhere", "Plaint", "Relent"],
  contest: ["Darkest Child", "Lost Frontier", "Oppressive Gloom", "Gloom Horizon"],
  night: ["Night Vigil", "Gone Beyond", "Lamentation"],
  end: ["At Rest", "Dark Times"],
};

export const MUSIC_BASE = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/";

export const trackUrl = (title: string): string => MUSIC_BASE + encodeURIComponent(`${title}.mp3`);

/** The credit line the licence asks for, for one piece. */
export const credit = (title: string): string =>
  `"${title}" Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/`;

export const ALL_TRACKS: readonly string[] = [...new Set(Object.values(TRACKS).flat())];

/** The piece to play next in a mood: not the one just played, nor (when there are enough) one played lately. */
export function nextTrack(mood: Mood, recent: readonly string[], rnd: () => number = Math.random): string {
  const pool = TRACKS[mood];
  const fresh = pool.filter((t) => !recent.includes(t));
  const from = fresh.length ? fresh : pool.filter((t) => t !== recent[recent.length - 1]);
  const list = from.length ? from : pool;
  return list[Math.floor(rnd() * list.length) % list.length]!;
}

/** How loud the music plays for these levels, 0..1. */
export const musicVolume = (l: Levels): number => (l.muted ? 0 : Math.min(1, l.master * l.music));

const FADE = 3.5;

interface Playing {
  el: HTMLAudioElement;
  title: string;
  mood: Mood;
  /** 0..1, the fade in or out. */
  k: number;
  want: number;
}

export class Music {
  private mood: Mood = "road";
  private playing: Playing[] = [];
  private recent: string[] = [];
  private raf = 0;
  private last = 0;
  private offLevels: (() => void) | null = null;
  private offStart: (() => void) | null = null;
  private on = false;

  /** Begin following the moods (the music starts once sound may play). */
  attach(): void {
    if (this.on || typeof Audio === "undefined") return;
    this.on = true;
    this.offLevels = sound.onLevels(() => this.levelsChanged());
    this.offStart = sound.onStart(() => this.levelsChanged());
  }

  /** What the table is doing now. The same mood again changes nothing. */
  set(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    if (!this.on || !sound.started) return;
    const cur = this.current();
    if (cur && TRACKS[mood].includes(cur.title)) {
      cur.mood = mood;
      return;
    }
    this.begin();
  }

  get now(): { mood: Mood; title: string | null } {
    return { mood: this.mood, title: this.current()?.title ?? null };
  }

  private current(): Playing | undefined {
    return this.playing.find((p) => p.want > 0);
  }

  private levelsChanged(): void {
    if (!this.on || !sound.started) return;
    const v = musicVolume(sound.levels);
    if (v <= 0) {
      // Silent music is not streamed at all.
      for (const p of this.playing) this.drop(p);
      this.playing = [];
      return;
    }
    if (!this.current()) this.begin();
    this.tick();
  }

  private begin(): void {
    if (musicVolume(sound.levels) <= 0) return;
    for (const p of this.playing) p.want = 0;
    const title = nextTrack(this.mood, this.recent);
    this.recent = [...this.recent, title].slice(-3);
    const el = new Audio();
    el.preload = "auto";
    el.src = trackUrl(title);
    el.volume = 0;
    const p: Playing = { el, title, mood: this.mood, k: 0, want: 1 };
    el.addEventListener("ended", () => {
      if (this.current() === p) this.begin();
    });
    // A piece that cannot be fetched is skipped, after a pause so a dead network is not hammered.
    el.addEventListener("error", () => {
      if (this.current() !== p) return;
      p.want = 0;
      setTimeout(() => this.on && !this.current() && this.begin(), 20_000);
    });
    void el.play().catch(() => {});
    this.playing.push(p);
    this.tick();
  }

  private tick = (): void => {
    cancelAnimationFrame(this.raf);
    const now = performance.now();
    const dt = this.last ? Math.min(0.25, (now - this.last) / 1000) : 0.016;
    this.last = now;
    const v = musicVolume(sound.levels);
    for (const p of this.playing) {
      p.k += Math.sign(p.want - p.k) * Math.min(Math.abs(p.want - p.k), dt / FADE);
      // A curve that sounds even as it fades.
      p.el.volume = Math.max(0, Math.min(1, v * p.k * p.k));
    }
    const gone = this.playing.filter((p) => p.want === 0 && p.k <= 0);
    for (const p of gone) this.drop(p);
    this.playing = this.playing.filter((p) => !gone.includes(p));
    if (this.playing.some((p) => p.k !== p.want)) this.raf = requestAnimationFrame(this.tick);
    else this.last = 0;
  };

  private drop(p: Playing): void {
    p.el.pause();
    p.el.removeAttribute("src");
    p.el.load();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const p of this.playing) this.drop(p);
    this.playing = [];
    this.offLevels?.();
    this.offStart?.();
    this.on = false;
    this.mood = "road";
  }
}

/** The page's one music. */
export const music = new Music();
