/**
 * Keeps the frame rate steady on a slow machine: it is told how long each
 * frame took, and says when the room should draw less. Pure numbers, so the
 * rule can be tested without a browser.
 *
 * The rule: time spent in frames slower than about 40 a second counts
 * against the room; time spent in good frames pays it back twice as fast.
 * After two seconds' worth of slow frames the room drops a step. Gaps of a
 * second or more are not counted at all: they mean the page was in the
 * background, not that drawing is slow.
 */
export class Governor {
  private debt = 0;
  /** Smoothed time per frame, in milliseconds. */
  frameMs = 16;

  constructor(private o: { slowMs: number; ignoreMs: number; patienceMs: number } = { slowMs: 25, ignoreMs: 1000, patienceMs: 2000 }) {}

  /** Note one frame's time in milliseconds. Returns true when the room should drop a step of quality. */
  note(ms: number): boolean {
    if (!(ms > 0) || ms >= this.o.ignoreMs) return false;
    this.frameMs += (ms - this.frameMs) * 0.05;
    if (ms > this.o.slowMs) {
      this.debt += ms;
      if (this.debt > this.o.patienceMs) {
        this.debt = 0;
        return true;
      }
    } else this.debt = Math.max(0, this.debt - ms * 2);
    return false;
  }
}

/** What each step of quality draws. Step 0 is the full picture. */
export interface QualityStep {
  /** Lines of picture aimed for. */
  lines: number;
  candleShadows: boolean;
  /** Size of the sun's shadow map. */
  sunShadow: number;
  /** Whether the small things in the air (dust, wisps of fog) are drawn. */
  motes: boolean;
}

export const QUALITY: QualityStep[] = [
  { lines: 600, candleShadows: true, sunShadow: 2048, motes: true },
  { lines: 480, candleShadows: false, sunShadow: 2048, motes: true },
  { lines: 400, candleShadows: false, sunShadow: 1024, motes: true },
  { lines: 320, candleShadows: false, sunShadow: 1024, motes: false },
  { lines: 240, candleShadows: false, sunShadow: 512, motes: false },
];
