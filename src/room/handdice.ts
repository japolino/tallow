/**
 * Your hand of dice (engine/hand.ts, docs/DESIGN.md 3.3): the dice already thrown for you, in a row on a small wooden
 * rack on the near side of the map. You spend one on each thing you try, by touching it; a die spent is taken off
 * the rack, and when the last is gone the next hand is thrown.
 *
 * The rack leans toward your chair. A die lying flat on the table shows you a side face more than the one on top,
 * and would be misread from where you sit; on the rack the face that counts is the one turned to you.
 *
 * Like every die in the room, these only show what code already rolled. Which die is spent is yours to choose; what
 * it comes to is code's (hand.ts, spend).
 */
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { Die, DIE_REST } from "./die.js";
import { sound } from "./sound.js";
import { ease, type Step, type Tracks } from "./track.js";

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** The most dice a hand lies as. */
const MOST = 5;
/** A little bigger than the die in the box, to be read from your chair. */
const SCALE = 1.25;
/** The rack: on the map's near side, right of the middle, between the dials' leather and the dice box. */
const AT = V(0.365, 0.004, 0.15);
const GAP = 0.082;
/** The rack's board: how deep and thick it is, and the lip along its near edge that the dice rest against. */
const BOARD_D = 0.086, BOARD_T = 0.007, LIP = 0.012;
/** How far the rack leans from lying flat toward facing your eyes (0 flat, 1 square to you). */
const LEAN = 0.72;
/** Your eyes, in your chair (room.ts, SEAT). */
const EYE = V(0, 0.5, 1.2);
/** Where they are thrown from, on the rack's own slope: above it, from your side. */
const FROM = V(0.1, 0.14, 0.16);
/** They are read from your chair: up the slope. */
const READ = V(0, 0, -1);

interface Lying {
  die: Die;
  value: number;
  /** Where it lies, in the row. */
  at: Vector3;
  /** How far it is lifted for the pointer, 0..1. */
  lift: number;
}

export class HandDice {
  readonly group = new Group();
  /** The leaning board the dice stand on: everything of the hand is laid out in its own slope. */
  private rack = new Group();
  private board: Mesh;
  private lip: Mesh;
  private wood = new MeshStandardMaterial({ color: 0x3a2617, roughness: 0.7 });
  private pool: Die[] = [];
  /** The dice on the table, in the hand's own order. */
  private lying: Lying[] = [];
  /** Set while a die may be touched: called with its place in the hand. */
  choosing: ((i: number) => void) | null = null;
  /** The die the pointer is over, or -1. */
  hover = -1;
  /** The die last touched: the one taken off when the hand comes back one shorter. */
  private picked = -1;
  private last = 0;

  constructor(private tracks: Tracks, private reduced: boolean) {
    // The slope: from straight up, most of the way round to facing your eyes.
    const up = V(0, 1, 0);
    const toEye = EYE.clone().sub(AT).normalize();
    const q = new Quaternion().setFromUnitVectors(up, toEye);
    this.rack.quaternion.slerpQuaternions(new Quaternion(), q, LEAN);
    // Set down so the board's near edge rests on the table.
    const drop = V(0, -BOARD_T, BOARD_D / 2).applyQuaternion(this.rack.quaternion).y;
    this.rack.position.copy(AT).setY(AT.y - drop);
    this.board = new Mesh(new BoxGeometry(1, BOARD_T, BOARD_D), this.wood);
    this.board.position.set(0, -BOARD_T / 2, 0);
    this.lip = new Mesh(new BoxGeometry(1, LIP, 0.006), this.wood);
    this.lip.position.set(0, LIP / 2 - BOARD_T, BOARD_D / 2 + 0.003);
    for (const m of [this.board, this.lip]) {
      m.castShadow = m.receiveShadow = true;
      this.rack.add(m);
    }
    this.rack.visible = false;
    this.group.add(this.rack);
    for (let i = 0; i < MOST; i++) {
      const d = new Die("player");
      d.mesh.scale.setScalar(SCALE);
      this.pool.push(d);
      this.rack.add(d.mesh);
    }
  }

  /** The rack is as wide as the hand it holds, and is on the table only while there is one. */
  private fit(n: number): void {
    this.rack.visible = n > 0;
    const w = Math.max(1, n) * GAP + 0.03;
    this.board.scale.x = this.lip.scale.x = w;
  }

  /** The place of die `i` of `n` in the row. */
  private slot(i: number, n: number): Vector3 {
    return V((i - (n - 1) / 2) * GAP, 0, BOARD_D / 2 - 0.036);
  }

  /** Where each die lies, in the room, in the hand's order: for the pointer. */
  at(): Vector3[] {
    return this.lying.map((l) => this.rack.localToWorld(l.at.clone().setY(l.at.y + DIE_REST * SCALE)));
  }

  /** Touch die `i`: it is the one that goes when the hand comes back without it. */
  pick(i: number): void {
    if (!this.choosing || !this.lying[i]) return;
    this.picked = i;
    const done = this.choosing;
    this.choosing = null;
    this.hover = -1;
    done(i);
  }

  /**
   * Show the hand. `thrown`: these are new dice, thrown down together. Otherwise the dice on the table are kept and
   * any that are no longer in the hand are taken off (a die spent).
   */
  async show(dice: readonly number[], thrown: boolean): Promise<void> {
    const want = dice.slice(0, MOST);
    if (!thrown && this.same(want)) return;
    if (thrown || !this.lying.length) {
      await this.clear();
      return this.throwAll(want);
    }
    // Which die went: the one touched, when taking it out leaves this hand; else the first that does not fit.
    const values = this.lying.map((l) => l.value);
    let gone = values.map((_, i) => i).filter((i) => i === this.picked);
    if (!this.fits(values.filter((_, i) => !gone.includes(i)), want)) {
      gone = [];
      let j = 0;
      values.forEach((v, i) => (v === want[j] ? j++ : gone.push(i)));
      if (j < want.length) {
        // Not the hand that lay here at all: lay it anew.
        await this.clear();
        return this.throwAll(want, true);
      }
    }
    this.picked = -1;
    await this.takeOff(gone);
  }

  private same(want: readonly number[]): boolean {
    return this.fits(this.lying.map((l) => l.value), want);
  }

  private fits(a: readonly number[], b: readonly number[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  /** Throw a whole hand down, one die after another. */
  private throwAll(want: readonly number[], still = false): Promise<void> {
    const quiet = still || this.reduced;
    this.lying = want.map((value, i) => ({ die: this.pool[i]!, value, at: this.slot(i, want.length), lift: 0 }));
    this.fit(this.lying.length);
    if (!this.lying.length) return Promise.resolve();
    const steps: Step[] = this.lying.map((l, i) => ({
      dur: 0.14,
      begin: () => {
        // The die's roll rests its centre DIE_REST above `to`; these are bigger, so `to` is set higher to match.
        const to = l.at.clone().add(V(0, DIE_REST * (SCALE - 1), 0));
        l.die.mesh.scale.setScalar(SCALE);
        void l.die.throw(l.value, FROM.clone().add(V(i * 0.02, 0, 0)), to, READ, this.tracks.now, quiet);
      },
    }));
    steps.push({ dur: 0.1, until: () => this.lying.every((l) => !l.die.rolling), patience: 2.6 });
    // A moment for them to be read.
    steps.push({ dur: 0.35 });
    return this.tracks.run(steps);
  }

  /** Take these dice off the table (by their place in the row): each is lifted and gone. */
  private takeOff(gone: readonly number[]): Promise<void> {
    const going = gone.map((i) => this.lying[i]!).filter(Boolean);
    this.lying = this.lying.filter((_, i) => !gone.includes(i));
    if (!going.length) return Promise.resolve();
    const from = going.map((l) => l.die.mesh.position.clone());
    return this.tracks.run([
      {
        dur: 0.38,
        begin: () => sound.play("clack", { x: AT.x, gain: 0.5 }),
        tick: (u) => {
          going.forEach((l, k) => {
            l.die.mesh.position.copy(from[k]!).add(V(0, 0.05 * ease(u), -0.02 * ease(u)));
            l.die.mesh.scale.setScalar(SCALE * (1 - ease(u)));
            l.die.glow = 0.5 * (1 - u);
          });
        },
      },
      {
        dur: 0,
        begin: () => {
          for (const l of going) {
            l.die.mesh.visible = false;
            l.die.glow = 0;
            l.die.mesh.scale.setScalar(SCALE);
          }
          // The rack goes with the last of them.
          if (!this.lying.length) this.fit(0);
        },
      },
    ]);
  }

  /** Sweep every die off the table. */
  private clear(): Promise<void> {
    this.picked = -1;
    this.hover = -1;
    return this.takeOff(this.lying.map((_, i) => i));
  }

  update(now: number): void {
    const dt = Math.min(0.1, Math.max(0, now - this.last));
    this.last = now;
    for (const d of this.pool) d.update(now);
    this.lying.forEach((l, i) => {
      if (l.die.rolling || l.die.showing === null) return;
      // The die under the pointer comes up a little and is lit; while one may be chosen, they all glow faintly.
      const want = this.choosing && this.hover === i ? 1 : 0;
      l.lift = this.reduced ? want : l.lift + (want - l.lift) * Math.min(1, dt * 14);
      l.die.mesh.position.y = l.at.y + DIE_REST * SCALE + l.lift * 0.014;
      l.die.glow = this.choosing ? 0.16 + l.lift * 0.4 + (this.reduced ? 0 : Math.sin(now * 3.2 + i) * 0.04) : 0;
    });
  }

  dispose(): void {
    for (const d of this.pool) d.dispose();
    this.board.geometry.dispose();
    this.lip.geometry.dispose();
    this.wood.dispose();
  }
}
