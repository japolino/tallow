/**
 * The narrator's bowl of dread (docs/SYSTEMS.md, 5.1): a low dark dish at the far right of the table, by the narrator's
 * hand, with a black stone in it for every try of yours that went wrong or cost you. When the narrator spends them on
 * one of its own moves, its hand reaches in and takes them out. The bowl is in plain sight, so a full one is a warning.
 * It is only shown: you never click it.
 */
import { sound } from "./sound.js";
import { CylinderGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, SphereGeometry, Vector2, Vector3 } from "three";
import { seededRng } from "../engine/dice.js";
import { ease, type Reacher, type Step, type Tracks } from "./track.js";

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Where the bowl stands: beyond the row of way blocks, to the right of the map's far edge, clear of the candle. */
const AT = V(0.66, 0, -0.6);
const R = 0.05;

/** Where the n-th stone lies in the bowl: a loose heap, the same every time. */
function lie(i: number): Vector3 {
  const rng = seededRng(`dread:${i}`);
  const a = i * 2.4 + rng() * 0.6;
  const r = i === 0 ? 0 : Math.min(R * 0.62, 0.011 * Math.sqrt(i) + rng() * 0.004);
  return V(Math.cos(a) * r, 0.009 + Math.floor(i / 7) * 0.008, Math.sin(a) * r);
}

export class DreadBowl {
  readonly group = new Group();
  private stones: Mesh[] = [];
  private stoneGeo = new SphereGeometry(0.0085, 14, 10);
  private stoneMat = new MeshStandardMaterial({ color: 0x0b0a0a, roughness: 0.25, metalness: 0.2 });
  private clay = new MeshStandardMaterial({ color: 0x2b1d16, roughness: 0.8 });
  private bowlGeo: LatheGeometry;
  private footGeo = new CylinderGeometry(R * 0.5, R * 0.55, 0.006, 24);

  constructor(private narrator: Reacher, private tracks: Tracks, private reduced: boolean) {
    // A shallow dish turned on a wheel: its profile from the middle of the floor out to the lip.
    const profile = [V(0, 0.006, 0), V(R * 0.55, 0.006, 0), V(R * 0.85, 0.012, 0), V(R, 0.026, 0), V(R * 1.04, 0.03, 0), V(R * 0.97, 0.03, 0), V(R * 0.8, 0.014, 0), V(0, 0.009, 0)].map((p) => new Vector2(p.x, p.y));
    this.bowlGeo = new LatheGeometry(profile, 32);
    const bowl = new Mesh(this.bowlGeo, this.clay);
    const foot = new Mesh(this.footGeo, this.clay);
    foot.position.y = 0.003;
    bowl.castShadow = bowl.receiveShadow = foot.receiveShadow = true;
    this.group.add(foot, bowl);
    this.group.position.copy(AT);
  }

  /** How many stones are in the bowl now. */
  get count(): number {
    return this.stones.length;
  }

  private stone(i: number): Mesh {
    const s = new Mesh(this.stoneGeo, this.stoneMat);
    s.scale.set(1, 0.62, 1);
    s.rotation.y = i * 1.3;
    s.castShadow = true;
    return s;
  }

  /** Over the bowl, where the narrator's fingers go. */
  private above(h = 0.07): Vector3 {
    return AT.clone().add(V(0, h, 0));
  }

  /**
   * Put stones in, one at a time, dropped from the narrator's fingers, or take them out with one reach, until there are
   * `n`. Resolves when the bowl shows it.
   */
  show(n: number): Promise<void> {
    const want = Math.max(0, Math.round(n));
    const nr = this.narrator;
    if (this.reduced) {
      while (this.stones.length < want) {
        const s = this.stone(this.stones.length);
        s.position.copy(lie(this.stones.length));
        this.stones.push(s);
        this.group.add(s);
      }
      while (this.stones.length > want) this.group.remove(this.stones.pop()!);
      return Promise.resolve();
    }
    const steps: Step[] = [];
    const arm = nr.armFor(AT);
    const reachOver: Step = { dur: 0.15, tick: () => nr.reach(arm, this.above()), until: () => nr.reached(arm) > 0.8 && nr.fingertips(arm).distanceTo(this.above()) < 0.06, patience: 1.2 };
    if (want > this.stones.length) {
      steps.push(reachOver);
      for (let i = this.stones.length; i < want; i++) {
        let s: Mesh;
        let from = V(0, 0, 0);
        steps.push(
          {
            dur: 0.05,
            begin: () => {
              s = this.stone(i);
              from = this.group.worldToLocal(nr.fingertips(arm).clone());
              s.position.copy(from);
              this.stones.push(s);
              this.group.add(s);
            },
          },
          {
            dur: 0.22,
            tick: (u) => {
              const to = lie(i);
              s.position.lerpVectors(from, to, u * u);
              if (u >= 1 && !s.userData.heard) {
                s.userData.heard = true;
                sound.play("stone", { x: AT.x, gain: 0.8, rate: 0.9 + (i % 4) * 0.06 });
              }
            },
          },
          { dur: 0.12 },
        );
      }
      steps.push({ dur: 0.06, begin: () => nr.reach(arm, null) });
    } else if (want < this.stones.length) {
      const into = this.above(0.012);
      steps.push(
        reachOver,
        { dur: 0.3, tick: (u) => nr.reach(arm, this.above().lerp(into, ease(u))) },
        {
          dur: 0.05,
          begin: () => {
            // Scooped up: the stones knock together in the hand.
            for (let k = 0; k < Math.min(3, this.stones.length - want); k++) sound.play("stone", { x: AT.x, gain: 0.35, delay: k * 0.05, rate: 1.1 });
            while (this.stones.length > want) this.group.remove(this.stones.pop()!);
          },
        },
        { dur: 0.3, tick: (u) => nr.reach(arm, into.clone().lerp(this.above(0.12), ease(u))) },
        { dur: 0.06, begin: () => nr.reach(arm, null) },
      );
    }
    return this.tracks.run(steps);
  }

  dispose(): void {
    this.stoneGeo.dispose();
    this.stoneMat.dispose();
    this.clay.dispose();
    this.bowlGeo.dispose();
    this.footGeo.dispose();
  }
}
