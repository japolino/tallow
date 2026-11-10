/**
 * Small moves made of steps: lift this, carry it there, set it down. Each
 * step runs for a time and may then wait for something (a hand to arrive).
 * Steps follow each other inside one tick of the room's clock, so a run of
 * them plays the same whether the room is drawn sixty times a second or
 * wound forward by a script.
 */
import type { Vector3 } from "three";

export const ease = (k: number): number => k * k * (3 - 2 * k);

export interface Step {
  /** Seconds this step takes. With motion reduced every step takes none. */
  dur: number;
  begin?(): void;
  /** Called every tick with how far through the step it is, 0..1 (always once with 1). */
  tick?(u: number): void;
  /** After its time is up the step still waits for this to be true, but never longer than `patience`. */
  until?(): boolean;
  /** Seconds to wait on `until` before going on regardless. Default 1.2. */
  patience?: number;
}

/** What the table needs of the narrator: its hands and its eyes. src/room/narrator.ts provides it. */
export interface Reacher {
  armFor(world: Vector3): number;
  reach(arm: number, world: Vector3 | null): void;
  fingertips(arm: number): Vector3;
  reached(arm: number): number;
  sleeve(arm: number): Vector3;
  watch(point: Vector3, seconds: number, now: number): void;
  mood(gaze: "player" | "watch" | "narrow" | "wide", seconds: number, now: number): void;
}

interface Run {
  steps: Step[];
  i: number;
  t0: number;
  done: () => void;
}

export class Tracks {
  private runs: Run[] = [];
  now = 0;

  constructor(private reduced: boolean) {}

  /** Play these steps in order. Resolves when the last one ends. */
  run(steps: Step[]): Promise<void> {
    if (!steps.length) return Promise.resolve();
    return new Promise<void>((done) => this.runs.push({ steps, i: 0, t0: -1, done }));
  }

  get busy(): boolean {
    return this.runs.length > 0;
  }

  update(t: number): void {
    this.now = t;
    for (const run of [...this.runs]) {
      for (;;) {
        const s = run.steps[run.i];
        if (!s) {
          this.runs.splice(this.runs.indexOf(run), 1);
          run.done();
          break;
        }
        if (run.t0 < 0) {
          run.t0 = t;
          s.begin?.();
        }
        const dur = this.reduced ? 0 : s.dur;
        const u = dur > 0 ? Math.min(1, (t - run.t0) / dur) : 1;
        s.tick?.(u);
        if (u < 1) break;
        if (s.until && !s.until() && t - run.t0 < dur + (s.patience ?? 1.2)) break;
        run.i++;
        run.t0 = -1;
      }
    }
  }
}
