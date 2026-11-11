/**
 * Small moves made of steps: lift this, carry it there, set it down. Each
 * step runs for a time and may then wait for something (a hand to arrive).
 * Steps follow each other inside one tick of the room's clock, so a run of
 * them plays the same whether the room is drawn sixty times a second or
 * wound forward by a script.
 */
import { Vector3, type Object3D } from "three";

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
  /** @param holding the hand has the thing it is going with: it keeps close to where it is sent, with no slow start. */
  reach(arm: number, world: Vector3 | null, holding?: boolean): void;
  fingertips(arm: number): Vector3;
  /** Whether that hand is away on some errand already. Whoever wants it next waits, so no hand is sent two ways at once. */
  busy?(arm: number): boolean;
  reached(arm: number): number;
  sleeve(arm: number): Vector3;
  watch(point: Vector3, seconds: number, now: number): void;
  mood(gaze: "player" | "watch" | "narrow" | "wide", seconds: number, now: number): void;
}

/**
 * A thing in a hand, while a step moves it. The step goes on saying where the thing should be at each moment, but
 * the hand is sent there and the thing is then put where the fingers really are. So the two cannot come apart: a
 * hand that runs late carries the thing late with it, and a thing never gets ahead of the hand that carries it.
 *
 *   const held = new Held(narrator, arm, card, () => tracks.now);
 *   { begin: () => held.take(),
 *     tick: (u) => { card.position.lerpVectors(from, to, ease(u)); held.follow(); },
 *     until: () => held.there }
 */
export class Held {
  /** How far the grip was from the fingers when the thing was taken: drawn in as it goes, so taking it moves nothing. */
  private off = new Vector3();
  private goal = new Vector3();
  private last = 0;
  private fresh = true;
  /** How far the fingers still are from where the thing wants them. */
  private short = Infinity;

  /**
   * @param now the room's clock
   * @param grip where on the thing the fingers hold it, in the room (default: its origin)
   */
  constructor(private n: Reacher, private arm: number, private obj: Object3D, private now: () => number, private grip: (out: Vector3) => Vector3 = (out) => obj.getWorldPosition(out)) {}

  /** The step begins: the thing is taken where it is. */
  take(): void {
    this.fresh = true;
    this.short = Infinity;
  }

  /** Every tick, after the thing has been put where it should be: send the hand there, and bring the thing to the fingers. */
  follow(): void {
    const g = this.grip(this.goal);
    this.n.reach(this.arm, g, true);
    const tips = this.n.fingertips(this.arm);
    const t = this.now();
    if (this.fresh) {
      this.fresh = false;
      this.off.copy(g).sub(tips);
    } else this.off.multiplyScalar(Math.exp(-Math.max(0, t - this.last) * 9));
    this.last = t;
    const late = _a.copy(tips).sub(g);
    this.short = late.length() + this.off.length();
    // In the fingers all the way; over the last two centimetres the thing comes exactly to its place.
    late.multiplyScalar(Math.min(1, late.length() / 0.02)).add(this.off);
    const w = this.obj.getWorldPosition(_b).add(late);
    this.obj.position.copy(this.obj.parent ? this.obj.parent.worldToLocal(w) : w);
  }

  /** Whether the hand has brought it where it was going. */
  get there(): boolean {
    return this.short < 0.004;
  }
}
const _a = new Vector3(), _b = new Vector3();

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
