/**
 * The music: pieces by Kevin MacLeod (incompetech.com), streamed from his site while they play, never bundled.
 * Licensed under Creative Commons: By Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/); the credits are
 * in CREDITS.md and in the drawer, which names every piece as it is played.
 *
 * What plays is a short list of pieces chosen for the scene (game/music.ts chooses, from the whole library). The list
 * is played in order and round again until another is given. Until one is given, a few pieces for a story being told.
 *
 * Nothing here ever leaves the room silent on purpose:
 *   - the pieces end in several seconds of recorded silence, so the next is fetched while one still plays and brought
 *     in before that end, not after it;
 *   - a new piece only takes over once it is really sounding; until then the old one plays on;
 *   - a piece that cannot be fetched, or stops arriving, is given up and another is tried.
 * Nothing is fetched until sound may play (sound.ts) and the music is turned up.
 */
import { sound, type Levels } from "./sound.js";

/** A piece to play: what it is called, and its file on the composer's site. */
export interface Tune {
  title: string;
  file: string;
}

const tune = (title: string): Tune => ({ title, file: `${title}.mp3` });
/** What plays before any scene has been read: a lute, a story being told. */
export const OPENING: readonly Tune[] = ["Teller of the Tales", "Midnight Tale", "Suonatore di Liuto", "Heavy Heart"].map(tune);

export const MUSIC_BASE = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/";

export const tuneUrl = (t: Tune): string => MUSIC_BASE + encodeURIComponent(t.file);

/** The credit line the licence asks for, for one piece. */
export const credit = (title: string): string =>
  `"${title}" Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/`;

/** How loud the music plays for these levels, 0..1. */
export const musicVolume = (l: Levels): number => (l.muted ? 0 : Math.min(1, l.master * l.music));

/** Seconds a piece takes to fade in or out. */
export const FADE = 4;
/** The next piece is fetched this long before the one playing ends, */
export const FETCH_AHEAD = 40;
/** and started this long before it: the pieces end in up to a quarter of a minute of silence. */
export const LEAD = 11;
/** A piece that has not moved for this long has stopped arriving. */
export const STALLED = 9;
/** A piece asked to play that is not sounding after this long is given up. */
export const SLOW_START = 20;

/** What the music needs of something that plays a file: an <audio> element, or a stand-in for tests. */
export interface Player {
  src: string;
  volume: number;
  preload: string;
  readonly currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, fn: () => void): void;
}

interface Voice {
  el: Player;
  tune: Tune;
  /** 0..1, the fade in or out. */
  k: number;
  want: number;
  /** Asked to play (ms), or 0 while it is only being fetched. */
  asked: number;
  failed: boolean;
  /** Where it was when last looked at, and when it last moved (ms). */
  at: number;
  moved: number;
}

export class Music {
  private list: Tune[] = [...OPENING];
  /** Which of the list is fetched next. */
  private next = 0;
  /** The piece that is playing, and the one being brought in after it. */
  private cur: Voice | null = null;
  private coming: Voice | null = null;
  /** Pieces fading out. */
  private going: Voice[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private fails = 0;
  private notBefore = 0;
  /** Another list was given: its first piece is brought in now, not when the one playing ends. */
  private turn = false;
  private offLevels: (() => void) | null = null;
  private offStart: (() => void) | null = null;
  private on = false;
  private played: Tune[] = [];
  private listeners = new Set<() => void>();

  constructor(
    /** What plays a file; an <audio> element when not given. */
    private make: (() => Player) | null = null,
    private clock: () => number = () => performance.now(),
    private may: () => boolean = () => sound.started,
    private level: () => number = () => musicVolume(sound.levels),
  ) {}

  /** Begin playing (the music starts once sound may play). */
  attach(): void {
    if (this.on || (!this.make && typeof Audio === "undefined")) return;
    this.on = true;
    this.offLevels = sound.onLevels(() => this.wake());
    this.offStart = sound.onStart(() => this.wake());
    this.wake();
  }

  /**
   * The pieces for the scene as it is now, the best first. They play in order and round again. A list that begins
   * with the piece already playing lets it play on.
   */
  play(list: readonly Tune[]): void {
    if (!list.length) return;
    this.list = list.map((t) => ({ title: t.title, file: t.file }));
    const playing = (this.coming?.asked ? this.coming : this.cur)?.tune.title;
    if (playing === this.list[0]!.title) {
      this.next = this.list.length > 1 ? 1 : 0;
      // What was only being fetched to follow belongs to the old list.
      if (this.coming && !this.coming.asked) this.drop(this.coming), (this.coming = null);
      return;
    }
    this.next = 0;
    this.turn = true;
    if (this.coming) this.drop(this.coming), (this.coming = null);
    this.notBefore = 0;
    this.wake();
  }

  /** What is playing, and every piece played since the room opened, oldest first. */
  get now(): { title: string | null; heard: readonly Tune[] } {
    return { title: this.cur?.tune.title ?? null, heard: this.played };
  }

  /** Called whenever another piece begins to sound. */
  onPiece(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private wake(): void {
    if (!this.on) return;
    if (this.timer === null && typeof setInterval !== "undefined") this.timer = setInterval(() => this.step(), 60);
    this.step();
  }

  private fetch(now: boolean): void {
    // Not the piece that is playing, when there is another to give.
    if (this.list.length > 1 && this.list[this.next % this.list.length]!.title === this.cur?.tune.title) this.next++;
    const t = this.list[this.next++ % this.list.length]!;
    const el = this.make ? this.make() : (new Audio() as unknown as Player);
    el.preload = "auto";
    el.src = tuneUrl(t);
    el.volume = 0;
    const v: Voice = { el, tune: t, k: 0, want: 0, asked: 0, failed: false, at: 0, moved: 0 };
    el.addEventListener("error", () => (v.failed = true));
    this.coming = v;
    if (now) this.start(v);
    else el.load();
  }

  private start(v: Voice): void {
    v.asked = v.moved = this.clock();
    void v.el.play().catch(() => (v.failed = true));
  }

  /** One look at everything: what should be fetched, started, given up, and how loud each piece is. Public for tests. */
  step(): void {
    if (!this.on) return;
    const now = this.clock();
    // The page was asleep: nothing is judged by how long that was.
    const slept = this.last > 0 && now - this.last > 3000;
    const dt = this.last ? Math.min(1.5, (now - this.last) / 1000) : 0.06;
    this.last = now;
    const vol = this.may() ? this.level() : 0;
    if (vol <= 0) {
      // Silent music is not streamed at all.
      this.silence();
      return;
    }
    const cur = this.cur;
    if (cur) {
      if (cur.el.currentTime !== cur.at || slept) (cur.at = cur.el.currentTime), (cur.moved = now);
      const over = cur.el.ended || cur.failed || now - cur.moved > STALLED * 1000;
      if (over) {
        if (!cur.el.ended) this.fails++;
        this.drop(cur);
        this.cur = null;
      }
    }
    const left = this.cur && Number.isFinite(this.cur.el.duration) ? this.cur.el.duration - this.cur.el.currentTime : Infinity;

    const c = this.coming;
    if (c) {
      if (slept && c.asked) c.asked = now;
      if (c.failed || (c.asked && !this.sounding(c) && now - c.asked > SLOW_START * 1000)) {
        // Given up: another is tried, a little later each time so a dead network is not hammered.
        this.drop(c);
        this.coming = null;
        this.fails++;
        this.notBefore = now + Math.min(20_000, 1000 * 2 ** Math.min(5, this.fails - 1));
      } else if (!c.asked && (!this.cur || left <= LEAD)) this.start(c);
      else if (c.asked && this.sounding(c)) {
        // It is really playing: now, and only now, it takes over.
        if (this.cur) (this.cur.want = 0), this.going.push(this.cur);
        c.want = 1;
        c.at = c.el.currentTime;
        c.moved = now;
        this.cur = c;
        this.coming = null;
        this.fails = 0;
        this.turn = false;
        this.played = [...this.played.filter((t) => t.title !== c.tune.title), c.tune];
        for (const fn of this.listeners) fn();
      }
    } else if (now >= this.notBefore) {
      if (!this.cur || this.turn) this.fetch(true);
      else if (left <= FETCH_AHEAD) this.fetch(false);
    }

    for (const v of [...this.going, ...(this.cur ? [this.cur] : [])]) {
      v.k += Math.sign(v.want - v.k) * Math.min(Math.abs(v.want - v.k), dt / FADE);
      // A curve that sounds even as it fades.
      v.el.volume = Math.max(0, Math.min(1, vol * v.k * v.k));
    }
    for (const v of this.going.filter((v) => v.k <= 0 || v.el.ended)) this.drop(v);
    this.going = this.going.filter((v) => v.k > 0 && !v.el.ended);
  }

  private sounding(v: Voice): boolean {
    return !v.el.paused && v.el.currentTime > 0.05;
  }

  private silence(): void {
    for (const v of [this.cur, this.coming, ...this.going]) if (v) this.drop(v);
    this.cur = this.coming = null;
    this.going = [];
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.last = 0;
  }

  private drop(v: Voice): void {
    v.el.pause();
    v.el.removeAttribute("src");
    v.el.load();
  }

  dispose(): void {
    this.silence();
    this.offLevels?.();
    this.offStart?.();
    this.on = false;
    this.list = [...OPENING];
    this.next = 0;
    this.fails = 0;
    this.notBefore = 0;
    this.turn = false;
  }
}

/** The page's one music. */
export const music = new Music();
