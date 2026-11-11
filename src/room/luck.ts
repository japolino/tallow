/**
 * The narrator's own die (docs/SYSTEMS.md, 7): a pale bone die that lives in a small wooden tray on its side of the
 * table, between the rival's card and the deck. When you ask something only luck can settle ("is there a boat at the
 * jetty?"), the narrator's hand picks it out of the tray and throws it there, in its own pan, where you can read it.
 * The face was decided before (engine/luck.ts). It is only shown: you never click it.
 */
import { sound } from "./sound.js";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { Die, DIE_REST } from "./die.js";
import { ease, type Reacher, type Step, type Tracks } from "./track.js";

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** The tray's middle: on the narrator's side, left of the deck, clear of the rival's card and your counters. */
const AT = V(-0.27, 0, -0.63);
const IN_W = 0.15, IN_D = 0.1, RIM = 0.006, RIM_H = 0.014, FLOOR = 0.005;
/** The narrator's die is smaller than yours. */
const SCALE = 0.72;
/** Where the die lies between throws: in the tray's far corner, by the narrator's hand. */
const REST = V(0.045, FLOOR, -0.022);
/** Where a throw ends: the middle of the tray, a little toward you. */
const LAND = V(-0.012, FLOOR, 0.012);

export class LuckTray {
  readonly group = new Group();
  private die = new Die("narrator");
  private wood = new MeshStandardMaterial({ color: 0x3a2617, roughness: 0.7 });
  private felt = new MeshStandardMaterial({ color: 0x1d2a20, roughness: 0.95 });
  private geos: BoxGeometry[] = [];

  constructor(private narrator: Reacher, private tracks: Tracks, private reduced: boolean) {
    const box = (w: number, h: number, d: number, at: Vector3, m: MeshStandardMaterial): void => {
      const g = new BoxGeometry(w, h, d);
      this.geos.push(g);
      const mesh = new Mesh(g, m);
      mesh.position.copy(at);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    const OW = IN_W + RIM * 2, OD = IN_D + RIM * 2;
    box(OW, FLOOR, OD, V(0, FLOOR / 2, 0), this.felt);
    box(OW, RIM_H, RIM, V(0, RIM_H / 2, -OD / 2 + RIM / 2), this.wood);
    box(OW, RIM_H, RIM, V(0, RIM_H / 2, OD / 2 - RIM / 2), this.wood);
    box(RIM, RIM_H, IN_D, V(-OW / 2 + RIM / 2, RIM_H / 2, 0), this.wood);
    box(RIM, RIM_H, IN_D, V(OW / 2 - RIM / 2, RIM_H / 2, 0), this.wood);
    this.group.position.copy(AT);
    this.die.mesh.scale.setScalar(SCALE);
    this.group.add(this.die.mesh);
    this.die.place(this.lying(REST));
    this.die.mesh.rotation.set(0.4, 1.1, 0.2);
  }

  /** A spot on the tray's floor as the die's centre stands there (the die rolls as if it were full size, so it is set lower). */
  private lying(p: Vector3): Vector3 {
    return p.clone().add(V(0, DIE_REST * SCALE, 0));
  }

  private world(p: Vector3): Vector3 {
    return this.group.localToWorld(p.clone());
  }

  /** The narrator picks its die out of the tray and throws it there, to show `natural`. Resolves when it can be read. */
  throw(natural: number): Promise<void> {
    const d = this.die;
    // The die's roll puts its centre DIE_REST above `to`; this one is smaller, so `to` is set lower to match.
    const to = LAND.clone().add(V(0, -DIE_REST * (1 - SCALE), 0));
    // Turned to be read from your chair.
    const readFrom = this.world(LAND).sub(V(0, 0.45, 0.62)).setY(0);
    if (this.reduced) {
      d.mesh.rotation.set(0, 0, 0);
      return d.throw(natural, to, to, readFrom, this.tracks.now, true);
    }
    const n = this.narrator;
    const over = this.world(REST.clone().add(V(0, 0.07, 0)));
    const at = this.world(this.lying(REST));
    const arm = n.armFor(at);
    let from = V(0, 0, 0);
    const held = (): void => {
      d.mesh.position.copy(this.group.worldToLocal(n.fingertips(arm).clone()).add(V(0, -0.012, 0)));
    };
    const steps: Step[] = [
      { dur: 0.2, tick: () => n.reach(arm, over), until: () => n.reached(arm) > 0.85 && n.fingertips(arm).distanceTo(over) < 0.05, patience: 1.4 },
      { dur: 0.25, tick: (u) => n.reach(arm, over.clone().lerp(at.clone().add(V(0, 0.012, 0)), ease(u))) },
      // Closed on it, the die goes up with the hand and over to the near corner, shaken a little.
      {
        dur: 0.55,
        begin: () => {
          n.watch(this.world(LAND), 3.5, this.tracks.now);
          // Rattled in its fist.
          for (let k = 0; k < 3; k++) sound.play("rattle", { x: AT.x, delay: 0.12 + k * 0.13, gain: 0.5, rate: 0.85 });
        },
        tick: (u) => {
          const up = this.world(V(0.05, 0.1, -0.035)).add(V(Math.sin(u * 28) * 0.004, 0, 0));
          n.reach(arm, at.clone().lerp(up, ease(u)));
          held();
          d.mesh.rotation.x += 0.2;
        },
      },
      {
        dur: 0.08,
        begin: () => {
          from = d.mesh.position.clone();
          void d.throw(natural, from, to, readFrom, this.tracks.now, false);
          n.reach(arm, null);
        },
        until: () => !d.rolling,
        patience: 2.4,
      },
      // A moment for it to be read before anything is said.
      { dur: 0.5 },
    ];
    return this.tracks.run(steps);
  }

  update(now: number): void {
    this.die.update(now);
  }

  dispose(): void {
    this.die.dispose();
    this.wood.dispose();
    this.felt.dispose();
    for (const g of this.geos) g.dispose();
  }
}
