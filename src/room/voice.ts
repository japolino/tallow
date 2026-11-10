/**
 * The narrator's voice. It has no speech bubble and no panel: its words come
 * a few at a time out of a patch of moving dark, low in the picture, like
 * something said from inside a shadow. The dark is drawn in the same chunky
 * pixels as the room, and it is never a box: a soft body with tendrils that
 * reach out and curl back.
 *
 * The words come at reading pace. A click or a key brings the rest at once.
 * A long speech comes in passages, one after another. What was said stays
 * until `hush` or the next thing said.
 *
 * For a screen reader the whole speech is put, once, into a live region; the
 * words that appear one by one are hidden from it.
 */

const CSS = `
.tallow-voice { position: absolute; left: 50%; bottom: 3.5%; width: min(92%, 43rem); transform: translateX(-50%); pointer-events: none; opacity: 0; z-index: 2; }
.tallow-voice canvas { position: absolute; left: -16%; top: -70%; width: 132%; height: 240%; image-rendering: pixelated; }
.tallow-voice p { position: relative; margin: 0; padding: 0.4rem 1.2rem; text-align: center; font: 1.22rem/1.5 Georgia, "Times New Roman", serif; color: #ece1c8; text-shadow: 0 0 5px #000, 0 0 12px #000, 0 1px 1px #000; letter-spacing: 0.01em; }
.tallow-voice span { opacity: 0; transition: opacity 0.28s ease-out; }
.tallow-voice span.out { opacity: 1; }
.tallow-voice.still span { transition: none; }
.tallow-voice-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 560px) { .tallow-voice p { font-size: 1.05rem; padding: 0.3rem 0.5rem; } }
`;

/** Cut a speech into passages of a few sentences, so no passage is more than a few lines on the screen. */
export function passages(lines: string[], most = 34): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const sentences = line.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [line];
    let run = "";
    let count = 0;
    for (const s of sentences) {
      const n = s.trim().split(/\s+/).length;
      if (count && count + n > most) {
        out.push(run.trim());
        run = "";
        count = 0;
      }
      run += s;
      count += n;
    }
    if (run.trim()) out.push(run.trim());
  }
  return out;
}

/** How long a word takes to say, in seconds: longer words and the ends of sentences take longer. */
export function wordTime(word: string): number {
  const stop = /[.!?]["')\]]*$/.test(word) ? 0.34 : /[,;:]$/.test(word) ? 0.15 : 0;
  return 0.06 + Math.min(12, word.length) * 0.027 + stop;
}

export class Voice {
  private box: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private p: HTMLParagraphElement;
  private live: HTMLDivElement;
  private style: HTMLStyleElement;
  private queue: string[] = [];
  private words: HTMLSpanElement[] = [];
  private shown = 0;
  /** When the next word comes, and when the passage that is fully out gives way to the next. */
  private nextAt = 0;
  private turnAt = Infinity;
  private done: (() => void) | null = null;
  private want = 0;
  private k = 0;
  private t = 0;
  private drawnAt = -1;

  constructor(host: HTMLElement, private reduced: boolean) {
    this.style = document.createElement("style");
    this.style.textContent = CSS;
    this.box = document.createElement("div");
    this.box.className = "tallow-voice" + (reduced ? " still" : "");
    this.box.setAttribute("aria-hidden", "true");
    this.canvas = document.createElement("canvas");
    this.g = this.canvas.getContext("2d")!;
    this.p = document.createElement("p");
    this.box.append(this.canvas, this.p);
    this.live = document.createElement("div");
    this.live.className = "tallow-voice-live";
    this.live.setAttribute("aria-live", "polite");
    host.append(this.style, this.box, this.live);
  }

  /** True while words are still coming. */
  get speaking(): boolean {
    return this.shown < this.words.length || this.queue.length > 0;
  }

  /** True while anything said is still on the screen. */
  get showing(): boolean {
    return this.want > 0;
  }

  /** What is on the screen now, for checks. */
  get text(): string {
    return this.words.slice(0, this.shown).map((w) => w.textContent).join("").trim();
  }

  /** Say these lines. Resolves when the last word is out (at once, if a click hurries it). */
  say(lines: string | string[]): Promise<void> {
    const all = passages(Array.isArray(lines) ? lines : [lines]);
    this.done?.();
    this.live.textContent = all.join(" ");
    this.queue = all;
    this.want = 1;
    // The promise first: with reduced motion a single passage is all out at once, and must be able to say so.
    const said = new Promise<void>((done) => (this.done = done));
    this.passage();
    return said;
  }

  /** Bring the rest of what is being said at once. Returns false if nothing was still coming. */
  hurry(): boolean {
    if (!this.speaking) return false;
    if (this.shown < this.words.length) {
      for (const w of this.words) w.classList.add("out");
      this.shown = this.words.length;
      this.turnAt = this.t + 1.1;
    } else this.passage();
    this.finishIfOut();
    return true;
  }

  /** Let the words fade and the dark draw back. */
  hush(): void {
    this.want = 0;
    this.queue = [];
    this.shown = this.words.length;
    this.finishIfOut();
  }

  private passage(): void {
    const text = this.queue.shift() ?? "";
    this.p.replaceChildren();
    this.words = text.split(/\s+/).filter(Boolean).map((word) => {
      const span = document.createElement("span");
      span.textContent = word + " ";
      this.p.append(span);
      return span;
    });
    this.shown = 0;
    this.nextAt = this.t + (this.k < 0.5 ? 0.35 : 0.1);
    this.turnAt = Infinity;
    if (this.reduced) {
      for (const w of this.words) w.classList.add("out");
      this.shown = this.words.length;
      this.turnAt = this.t + 1.5 + text.length * 0.04;
      this.finishIfOut();
    }
  }

  private finishIfOut(): void {
    if (this.speaking || !this.done) return;
    const done = this.done;
    this.done = null;
    done();
  }

  update(t: number, dt: number): void {
    this.t = t;
    while (this.shown < this.words.length && t >= this.nextAt) {
      const w = this.words[this.shown++]!;
      w.classList.add("out");
      this.nextAt = Math.max(this.nextAt, t - 0.5) + wordTime(w.textContent!.trim());
      if (this.shown === this.words.length) {
        // A passage stays long enough to be read again before the next one takes its place.
        this.turnAt = t + 1.3 + this.words.length * 0.05;
        this.finishIfOut();
      }
    }
    if (this.queue.length && t >= this.turnAt) this.passage();
    // Words come up quickly and go a little slower, but soon enough not to lie over a page being handed to you.
    this.k = this.reduced ? this.want : this.k + (this.want - this.k) * Math.min(1, dt * (this.want ? 5 : 3.6));
    if (Math.abs(this.want - this.k) < 0.004) this.k = this.want;
    this.box.style.opacity = String(Math.min(1, this.k * 1.15));
    if (this.k <= 0) {
      if (this.p.firstChild && !this.want) this.p.replaceChildren();
      return;
    }
    // The dark moves a dozen times a second, like the room's other drawings; standing still when motion is reduced.
    const step = this.reduced ? 0 : Math.floor(t * 14);
    if (step !== this.drawnAt || this.k < 1) {
      this.drawnAt = step;
      this.shade(this.reduced ? 3 : t);
    }
  }

  /** Paint the patch of dark behind the words: a soft body that follows the text, and tendrils reaching out of it. */
  private shade(t: number): void {
    const c = this.canvas, g = this.g;
    // One cell of the dark is about three screen pixels, near enough to the room's own chunky pixels.
    const w = Math.max(8, Math.round(c.clientWidth / 3)), h = Math.max(8, Math.round(c.clientHeight / 3));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    g.clearRect(0, 0, w, h);
    // The words' own box, within the canvas (which is wider and taller than it, to give the tendrils room).
    const bw = w / 1.32, bh = h / 2.4;
    const cx = w / 2, cy = h * (0.7 / 2.4) + bh / 2;
    const k = this.k;
    const dab = (x: number, y: number, r: number, a: number) => {
      if (r <= 0.5) return;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(0,0,0,${a})`);
      grad.addColorStop(0.55, `rgba(0,0,0,${a * 0.6})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    // The body: dabs along the lines of text, each drifting on its own.
    const n = 13;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1) - 0.5;
      const x = cx + u * bw * 0.94 + Math.sin(t * 0.7 + i * 1.9) * bw * 0.02;
      const y = cy + Math.sin(t * 0.9 + i * 2.7) * bh * 0.13;
      dab(x, y, (bh * 0.62 + Math.sin(t * 1.1 + i) * bh * 0.08) * (0.4 + 0.6 * k) * (1 - Math.abs(u) * 0.35), 0.62);
    }
    // The tendrils: each a string of smaller and smaller dabs along a line that sways.
    const arms = 11;
    for (let a = 0; a < arms; a++) {
      const side = a % 2 ? 1 : -1;
      const u = (a + 0.5) / arms - 0.5;
      let x = cx + u * bw * 1.02, y = cy + side * bh * 0.28;
      let dir = side * (Math.PI / 2) + u * 1.5 + Math.sin(t * 0.6 + a * 2.1) * 0.5;
      const reach = (0.55 + 0.45 * Math.sin(t * 0.43 + a * 1.37)) * k;
      const links = 12;
      for (let s = 0; s < links; s++) {
        const f = s / links;
        if (f > reach) break;
        dir += Math.sin(t * 1.3 + a * 3.1 + s * 0.7) * 0.22 + (side > 0 ? 0.02 : -0.02);
        x += Math.cos(dir) * bh * 0.14;
        y += Math.sin(dir) * bh * 0.14;
        dab(x, y, bh * (0.2 - f * 0.15), 0.55 * (1 - f * 0.5));
      }
    }
  }

  dispose(): void {
    this.done?.();
    this.style.remove();
    this.box.remove();
    this.live.remove();
  }
}
