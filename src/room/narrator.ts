/**
 * The narrator: a figure across the table that the light never quite reaches.
 * A hooded shape, two long hands resting where the candle can find them, and
 * a pair of flat, drawn eyes in the dark of the hood. The eyes are the only
 * face it has: they follow the die and the pieces, narrow, widen and blink.
 *
 * The eyes are 2D on purpose: drawn on a small canvas a few times a second,
 * so they move like an animated drawing rather than like something lit.
 */
import {
  AnimationMixer,
  BackSide,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  LinearFilter,
  LoopOnce,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Camera,
  type Material,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mk, rng } from "./textures.js";

/** What the eyes are doing. */
export type Gaze = "player" | "watch" | "narrow" | "wide";

const EYE_W = 256, EYE_H = 112;

/** Something small the narrator does with its hands when it has an opinion. */
export type Gesture = "slam" | "drum" | "tap" | "steeple" | "flick";

const UP = new Vector3(0, 1, 0);
const ease = (k: number): number => k * k * (3 - 2 * k);

/**
 * Move a value toward where it is wanted the way a hand does: it gathers speed, and slows as it arrives, with no
 * jump in speed at either end, however often the place it is wanted changes. `v` carries its speed between calls.
 */
function settle(now: number, want: number, v: { v: number }, seconds: number, dt: number): number {
  const w = 2 / seconds, x = w * dt;
  const fall = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const off = now - want;
  const push = (v.v + w * off) * dt;
  v.v = (v.v - w * push) * fall;
  return want + (off + push) * fall;
}

/** The hips the body leans from, and the table's far edge, in the narrator's own space. */
const HIPS = new Vector3(0, -0.35, 0.04);
const TABLE_EDGE = 0.395;
/** How far from the shoulder a thing can be before the body leans toward it, and the most the shoulder is sent after it. */
const REACH_EASY = 0.6;
const REACH_LEAN = 0.24;

/** `y`, but never below `floor`: exactly `y` from `soft` above it, exactly `floor` from `soft` below, and round between. */
function above(y: number, floor: number, soft: number): number {
  const d = y - floor;
  return d >= soft ? y : d <= -soft ? floor : floor + (d + soft) ** 2 / (4 * soft);
}

/** The clips that go round and round; every other one plays once and holds its last pose. */
const LOOPS = new Set(["rest", "idle", "carry", "carry_wide"]);
/** The clips of a hand at work on something. While one of these plays, being sent somewhere new does not start the hand over. */
const WORK = new Set(["reach", "pinch", "grasp", "lift", "lift_wide", "carry", "carry_wide", "set_down", "set_down_wide", "release", "light"]);
/** The bones a clip may move. The shoulder, elbow and wrist are worked out here, from where the hand has to be. */
const CLIP_BONES = /^(ctl|index_|middle_|ring_|little_|thumb_)/;

/**
 * A sculpted arm with bones in it (models/narrator_arm.py). Its clips move the fingers and a bone called "ctl" that
 * says where the wrist should be and how the hand is turned; the upper arm and forearm are then laid between the
 * shoulder and that wrist, lengthened a little if the wrist is far away.
 */
interface Rig {
  root: Group;
  /** The armature: the shoulder and "ctl" are placed in its space. For the mirrored arm that space is mirrored too. */
  space: Object3D;
  mixer: AnimationMixer;
  actions: Map<string, AnimationAction>;
  /** How far each clip has faded in (0..1), where that is heading, and how fast. */
  fades: Map<AnimationAction, { k: number; to: number; rate: number }>;
  /** The clip in charge now, and the ones to follow it, each when the one before has played out. */
  clip: string;
  then: string[];
  upper: Object3D;
  upperEnd: Object3D;
  fore: Object3D;
  foreEnd: Object3D;
  wrist: Object3D;
  ctl: Object3D;
  grip: Object3D;
  /** The arm as it was made: bone lengths, which way each bone lay, and which side the elbow sticks out. */
  l1: number;
  l2: number;
  upperEnd0: Vector3;
  foreEnd0: Vector3;
  upperQ0: Quaternion;
  foreQ0: Quaternion;
  upperDir0: Vector3;
  foreDir0: Vector3;
  pole: Vector3;
  /** Whether the fist of the "slam" now playing has landed yet. */
  struck: boolean;
  /** The shoulder as it was made: in the arm's own space, and in the narrator's. */
  shoulder0: Vector3;
  shoulderAt: Vector3;
}

/** The colour of the narrator's cloth. */
const CLOTH = 0x1c1a20;

/** One arm: a sleeve from the elbow, hidden in the mantle, to the hand, which can leave its place on the table to move a piece. */
interface Arm {
  side: number;
  elbow: Vector3;
  hand: Object3D;
  /** Where the hand lies at rest, and how it is turned there. */
  rest: Vector3;
  restYaw: number;
  /** The fingertips, in the hand's own space. */
  tip: Vector3;
  /** How far behind the hand's origin the sleeve ends. */
  cuff: number;
  sleeve: [Mesh, Mesh];
  joints: [Mesh, Mesh];
  /** Where the fingertips are wanted (in the narrator's space), or null to lie at rest. */
  want: Vector3 | null;
  /** The hand has the thing it is going with (track.ts, Held): it keeps close to where it is sent. */
  holding: boolean;
  at: Vector3;
  k: number;
  /** How fast `at` and `k` are changing, so they can be eased. */
  vel: [{ v: number }, { v: number }, { v: number }];
  kVel: { v: number };
  /** The sculpted, boned arm, once it has loaded. */
  rig?: Rig;
  /** What the fingers are closed on (or closing on), if anything, and how far they have closed, 0..1. */
  hold: "pinch" | "grasp" | null;
  closed: number;
  /** Where the point between the fingertips is, in the room. */
  tips: Vector3;
  /** A thing in the hand: it goes where the fingers go. `offset` is from the fingers to the thing's own origin. */
  carried: { obj: Object3D; offset: Vector3; ideal: Vector3; floor: number } | null;
}

export class Narrator {
  readonly group = new Group();
  private head = new Group();
  private body: Mesh;
  private eyes: Mesh;
  private eyeTex: CanvasTexture;
  private eyeG: CanvasRenderingContext2D;
  private fingers: Group[] = [];
  private arms: Arm[] = [];
  /** The hood built in code, hidden once the sculpted one has loaded. */
  private codeHood: Mesh[] = [];
  /** Settles when every sculpted part has loaded or failed. */
  readonly ready: Promise<void>;
  private lookTarget: Vector3 | null = null;
  private gaze: Gaze = "player";
  private gazeUntil = 0;
  private open = 1;
  private blinkAt = 3;
  private blinkEye = 0;
  private drawnAt = -1;
  private pupil = new Vector2();
  private tapAt = 6;
  private jitter = rng(77);
  private mats: Material[] = [];
  /** The stand-in shapes built in code, hidden once the draped mantle has loaded. */
  private standIns: Mesh[] = [];
  private codeHands: Group[] = [];
  /** The round of each elbow of the plain arms built in code: hidden with them once the sculpted arms have loaded. */
  private elbows: Mesh[] = [];
  private cloth: MeshStandardMaterial;
  /** Moments inside the clips that the room acts on: seconds into "slam" when the fist lands, into "light" when the wick takes. */
  private marks: Record<string, number> = { slam: 0.74, light: 0.5 };
  private impact = 0;
  /**
   * Everything above the lap: the mantle, the hood, and (through `poseRig`) the shoulders. It leans from the hips:
   * toward something far away before an arm has to lengthen for it, and into a blow of the fist.
   */
  private torso = new Group();
  private lean = { pitch: 0, roll: 0, yaw: 0, nod: 0 };
  private leanVel = { pitch: { v: 0 }, roll: { v: 0 }, yaw: { v: 0 }, nod: { v: 0 } };
  /** How brightly the eyes show, 0..1 (set from the room's light: brighter in the dark). */
  glow = 0.8;
  /**
   * The light of the room where it catches the edge of the cloth (set from the room's light). The cloth is nearly
   * black and half the figure sits against a wall as dark as it is: without this, the side away from the window
   * cannot be told from the wall, and it looks as if only half of it were there.
   */
  readonly rim = new Color(0.03, 0.03, 0.035);

  /**
   * @param models where the sculpted parts are served from (models/*.py make them): the draped mantle and the
   *   hand. Without it, or for any part that fails to load, the figure keeps the simpler shape built here in code.
   */
  constructor(private reduced: boolean, models?: string) {
    // Dark, but not so dark that candlelight and daylight have nothing to show its folds by.
    const cloth = (this.cloth = new MeshStandardMaterial({ color: CLOTH, roughness: 1, metalness: 0, envMapIntensity: 0, side: DoubleSide }));
    const rim = { value: this.rim };
    cloth.onBeforeCompile = (shader) => {
      shader.uniforms.uRim = rim;
      shader.fragmentShader =
        "uniform vec3 uRim;\n" +
        shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\n  { float rimF = 1.0 - abs(dot(normal, normalize(vViewPosition))); totalEmissiveRadiance += uRim * rimF * rimF; }",
        );
    };
    cloth.customProgramCacheKey = () => "narrator-cloth-rim";
    const voidMat = new MeshBasicMaterial({ color: 0x000000, fog: false });
    this.mats.push(cloth, voidMat);

    // The cloak: a turned shape with folds pressed into it, wider than it is deep.
    const prof = [
      [0.46, -0.8], [0.44, -0.4], [0.4, 0], [0.37, 0.2], [0.335, 0.34], [0.29, 0.42], [0.2, 0.47], [0.12, 0.5], [0.0, 0.5],
    ].map(([r, y]) => new Vector2(r, y));
    const geo = new LatheGeometry(prof, 72);
    const p = geo.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const fold = y < 0.4 ? 1 + 0.045 * Math.sin(a * 11 + y * 4) * Math.min(1, (0.4 - y) * 3) + 0.02 * Math.sin(a * 23 + 1.3) : 1;
      p.setXYZ(i, x * fold, y, z * fold * 0.68);
    }
    geo.computeVertexNormals();
    this.body = new Mesh(geo, cloth);
    this.body.castShadow = true;
    this.group.add(this.torso);
    this.torso.add(this.body);
    this.standIns.push(this.body);

    // The hood: an open shell around a hollow that no light enters.
    const hoodProf = [
      [0.0, -0.2], [0.07, -0.192], [0.13, -0.16], [0.172, -0.1], [0.19, -0.02], [0.19, 0.06], [0.178, 0.12], [0.166, 0.15], [0.158, 0.156],
    ].map(([r, a]) => new Vector2(r, a));
    const hoodGeo = new LatheGeometry(hoodProf, 48);
    hoodGeo.rotateX(Math.PI / 2); // the shell opens toward +z, the player
    const hp = hoodGeo.attributes.position!;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
      // Taller than wide, the brim drooping over the brow, the sides falling to the shoulders.
      const droop = z > 0 ? -z * 0.25 * Math.max(0, y) * 6 : 0;
      const fall = y < 0 ? 1 + -y * 1.4 : 1;
      hp.setXYZ(i, x * 0.92 * fall, y * 1.22 + droop, z);
    }
    hoodGeo.computeVertexNormals();
    const hood = new Mesh(hoodGeo, new MeshStandardMaterial({ color: CLOTH, roughness: 1, envMapIntensity: 0 }));
    this.mats.push(hood.material as Material);
    hood.castShadow = true;
    this.head.add(hood);
    this.codeHood.push(hood);
    // The inside of the hood takes no light at all.
    const lining = new Mesh(hoodGeo, new MeshBasicMaterial({ color: 0x000000, side: BackSide }));
    this.mats.push(lining.material as Material);
    this.head.add(lining);
    this.codeHood.push(lining);
    const hollow = new Mesh(new SphereGeometry(0.168, 24, 18), voidMat);
    hollow.scale.set(0.95, 1.2, 0.6);
    hollow.position.z = 0.01;
    // The hollow stays whichever hood is worn: it is the dark that the eyes float in, and it hides the collar behind.
    this.head.add(hollow);

    // The eyes: one flat sheet, redrawn as the gaze changes.
    const [ec, eg] = mk(EYE_W, EYE_H);
    this.eyeG = eg;
    this.eyeTex = new CanvasTexture(ec);
    this.eyeTex.colorSpace = SRGBColorSpace;
    this.eyeTex.minFilter = this.eyeTex.magFilter = LinearFilter;
    this.eyeTex.generateMipmaps = false;
    const eyeMat = new MeshBasicMaterial({ map: this.eyeTex, transparent: true, depthWrite: false, toneMapped: false, fog: false });
    this.mats.push(eyeMat);
    this.eyes = new Mesh(new PlaneGeometry(0.2, 0.2 * (EYE_H / EYE_W)), eyeMat);
    this.eyes.position.set(0, 0.012, 0.118);
    this.eyes.renderOrder = 5;
    this.head.add(this.eyes);

    this.head.position.set(0, 0.62, 0.05);
    this.head.rotation.x = 0.2;
    this.torso.add(this.head);

    // A cowl where the hood meets the shoulders.
    const cowl = new Mesh(new LatheGeometry([[0.14, 0.52], [0.24, 0.5], [0.3, 0.44], [0.27, 0.4]].map(([r, y]) => new Vector2(r, y)), 40), cloth);
    cowl.scale.z = 0.75;
    cowl.castShadow = true;
    this.torso.add(cowl);
    this.standIns.push(cowl);

    this.buildArms(cloth);
    this.draw(0);
    this.ready = models
      ? Promise.all([this.loadMantle(`${models}/narrator_cloak.glb`), this.loadArms(`${models}/narrator_arm.glb`), this.loadHood(`${models}/narrator_hood.glb`)]).then(() => undefined)
      : Promise.resolve();
  }

  /** Load a model file; resolves with its scene, or null (with a note in the console) if it will not load. */
  private fetch(url: string, what: string): Promise<Group | null> {
    return this.fetchAll(url, what).then((g) => g?.scene ?? null);
  }

  /** The same, with the movements stored in the file. */
  private fetchAll(url: string, what: string): Promise<{ scene: Group; animations: AnimationClip[] } | null> {
    return new Promise((done) => {
      new GLTFLoader().load(
        url,
        (gltf) => done(gltf),
        undefined,
        () => {
          console.warn(`tallow: the narrator's ${what} did not load; keeping the plain shape.`);
          done(null);
        },
      );
    });
  }

  /** Swap the turned hood for the sculpted one: thick cloth round a hollow that takes no light. */
  private async loadHood(url: string): Promise<void> {
    const scene = await this.fetch(url, "hood");
    if (!scene) return;
    const dark = new MeshBasicMaterial({ color: 0x000000, fog: false });
    this.mats.push(dark);
    let found = false;
    scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      // The model marks its inside "void"; everything else is cloth.
      const inside = /void/i.test((m.material as Material | undefined)?.name ?? "") || /void/i.test(m.name);
      m.material = inside ? dark : this.cloth;
      m.castShadow = !inside;
      found = true;
    });
    if (!found) return;
    this.head.add(scene);
    for (const m of this.codeHood) m.visible = false;
    this.eyes.position.set(0, 0.0, 0.118);
  }

  /** Swap the turned stand-in for cloth that was really dropped over a seated figure and left to fall. */
  private async loadMantle(url: string): Promise<void> {
    const scene = await this.fetch(url, "mantle");
    if (!scene) return;
    let found = false;
    scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.material = this.cloth;
      m.castShadow = true;
      found = true;
    });
    if (!found) return;
    this.torso.add(scene);
    for (const m of this.standIns) m.visible = false;
  }

  /**
   * Swap the jointed stand-in hands and their straight sleeves for the sculpted arm with bones in it: one copy as
   * made (the hand on the player's right) and one mirrored for the other side.
   */
  private async loadArms(url: string): Promise<void> {
    const file = await this.fetchAll(url, "arms");
    if (!file) return;
    const need = ["upper_arm", "upper_arm_end", "forearm", "forearm_end", "wrist", "ctl", "grip"];
    if (need.some((n) => !file.scene.getObjectByName(n)) || !file.animations.some((c) => c.name === "idle")) {
      console.warn("tallow: the narrator's arms are not the model this room expects; keeping the plain shape.");
      return;
    }
    const skin = new MeshStandardMaterial({ color: 0x8a8074, roughness: 0.58, envMapIntensity: 0.4 });
    this.mats.push(skin);
    // The arm bones are placed here, so the clips keep only what they are for: the hand's place and the fingers.
    const clips = file.animations.map((c) => {
      const only = c.clone();
      only.tracks = only.tracks.filter((t) => CLIP_BONES.test(t.name));
      return only;
    });
    for (const arm of this.arms) {
      const root = cloneSkinned(file.scene) as Group;
      root.scale.x = arm.side;
      root.traverse((o) => {
        try {
          const marks = JSON.parse(String(o.userData.marks ?? "{}")) as Record<string, number>;
          for (const [k, v] of Object.entries(marks)) if (Number.isFinite(v)) this.marks[k] = v;
        } catch {
          /* the moments keep the values written above */
        }
        const m = o as Mesh;
        if (!m.isMesh) return;
        // The model names its surfaces: "cloth" is the sleeve, anything else is skin.
        const cloth = /cloth/i.test((m.material as Material | undefined)?.name ?? "");
        m.material = cloth ? this.cloth : skin;
        m.castShadow = true;
        m.receiveShadow = !cloth;
        // Its bounds are those of the arm at rest; reaching, it leaves them.
        m.frustumCulled = false;
      });
      const get = (n: string): Object3D => root.getObjectByName(n)!;
      const upper = get("upper_arm"), upperEnd = get("upper_arm_end"), fore = get("forearm"), foreEnd = get("forearm_end");
      const space = upper.parent!;
      const mixer = new AnimationMixer(root);
      const actions = new Map<string, AnimationAction>();
      const fades: Rig["fades"] = new Map();
      for (const c of clips) {
        const act = mixer.clipAction(c);
        if (!LOOPS.has(c.name)) {
          act.setLoop(LoopOnce, 1);
          act.clampWhenFinished = true;
        }
        actions.set(c.name, act);
        fades.set(act, { k: 0, to: 0, rate: 1 });
      }
      // The arm as it was made: this is the pose every placing of it starts from.
      const upperQ0 = upper.quaternion.clone();
      const foreQ0 = upperQ0.clone().multiply(upperEnd.quaternion).multiply(fore.quaternion);
      const l1 = upperEnd.position.length(), l2 = foreEnd.position.length();
      const upperDir0 = new Vector3(0, 1, 0).applyQuaternion(upperQ0);
      const foreDir0 = new Vector3(0, 1, 0).applyQuaternion(foreQ0);
      const elbow = upper.position.clone().addScaledVector(upperDir0, l1);
      const wrist = elbow.clone().addScaledVector(foreDir0, l2);
      const along = wrist.clone().sub(upper.position);
      const reach = along.length();
      along.normalize();
      const pole = elbow.clone().sub(upper.position).addScaledVector(along, -(l1 * l1 - l2 * l2 + reach * reach) / (2 * reach)).normalize();
      arm.rig = {
        root, space, mixer, actions, fades, clip: "idle", then: [],
        upper, upperEnd, fore, foreEnd, wrist: get("wrist"), ctl: get("ctl"), grip: get("grip"),
        l1, l2, upperEnd0: upperEnd.position.clone(), foreEnd0: foreEnd.position.clone(), upperQ0, foreQ0, upperDir0, foreDir0, pole,
        struck: false,
        shoulder0: upper.position.clone(),
        shoulderAt: new Vector3(),
      };
      this.group.add(root);
      this.group.updateMatrixWorld(true);
      this.group.worldToLocal(space.localToWorld(arm.rig.shoulderAt.copy(upper.position)));
      const idle = actions.get("idle")!;
      idle.play();
      // The two hands do not drift in step.
      idle.time = arm.side < 0 ? idle.getClip().duration * 0.37 : 0;
      fades.get(idle)!.k = fades.get(idle)!.to = 1;
      arm.hand.visible = false;
      for (const m of [...arm.sleeve, ...arm.joints]) m.visible = false;
      arm.k = 0;
      arm.want = null;
    }
    for (const m of this.elbows) m.visible = false;
    this.poseArms(0);
  }

  /** Two sleeves coming forward onto the table, and the hands at the end of them. */
  private buildArms(cloth: Material): void {
    const skin = new MeshStandardMaterial({ color: 0x8d8376, roughness: 0.62 });
    const nail = new MeshStandardMaterial({ color: 0x2a2420, roughness: 0.4 });
    this.mats.push(skin, nail);
    const seg = (from: Vector3, to: Vector3, r0: number, r1: number, mat: Material) => {
      const len = from.distanceTo(to);
      const m = new Mesh(new CylinderGeometry(r1, r0, len, 14), mat);
      m.position.copy(from).lerp(to, 0.5);
      m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), to.clone().sub(from).normalize());
      m.castShadow = true;
      this.group.add(m);
      return m;
    };
    for (const side of [-1, 1]) {
      const shoulder = new Vector3(side * 0.27, 0.37, 0.02);
      const elbow = new Vector3(side * 0.33, 0.085, 0.3);
      const wrist = new Vector3(side * 0.168, 0.046, 0.45);
      this.standIns.push(seg(shoulder, elbow, 0.1, 0.085, cloth));
      const joint = new Mesh(new SphereGeometry(0.076, 14, 10), cloth);
      joint.position.copy(elbow);
      this.group.add(joint);
      this.elbows.push(joint);
      // The forearm sleeve is in two lengths, so it can stretch out across the table and still bend.
      const tube = (r0: number, r1: number) => {
        const m = new Mesh(new CylinderGeometry(r1, r0, 1, 14), cloth);
        m.castShadow = true;
        this.group.add(m);
        return m;
      };
      const knob = (r: number) => {
        const m = new Mesh(new SphereGeometry(r, 12, 8), cloth);
        m.castShadow = true;
        this.group.add(m);
        return m;
      };
      const sleeve: [Mesh, Mesh] = [tube(0.075, 0.062), tube(0.062, 0.047)];
      const joints: [Mesh, Mesh] = [knob(0.062), knob(0.047)];
      void wrist;

      // The hand: a flat palm and four long fingers lying toward the player, a thumb tucked beside.
      const hand = new Group();
      hand.position.set(side * 0.15, 0.016, 0.55);
      hand.rotation.y = -side * 0.34;
      const palm = new Mesh(new SphereGeometry(0.04, 18, 12), skin);
      palm.scale.set(1, 0.34, 1.25);
      palm.castShadow = true;
      hand.add(palm);
      for (let f = 0; f < 4; f++) {
        const finger = this.finger([0.05, 0.034, 0.027].map((l) => l * (f === 1 ? 1.12 : f === 3 ? 0.82 : 1)), 0.0085, skin, nail);
        finger.position.set((f - 1.5) * 0.019, 0.004, 0.04);
        finger.rotation.y = (f - 1.5) * 0.11;
        hand.add(finger);
        this.fingers.push(finger);
      }
      const thumb = this.finger([0.036, 0.028], 0.0098, skin, nail);
      thumb.position.set(-side * 0.036, 0.002, 0.004);
      thumb.rotation.y = -side * 0.95;
      hand.add(thumb);
      hand.rotation.order = "YXZ";
      this.group.add(hand);
      this.codeHands.push(hand);
      this.arms.push({ side, elbow, hand, rest: hand.position.clone(), restYaw: hand.rotation.y, tip: new Vector3(0, 0, 0.15), cuff: 0.03, sleeve, joints, want: null, holding: false, at: new Vector3(), k: 0,
        vel: [{ v: 0 }, { v: 0 }, { v: 0 }], kVel: { v: 0 }, hold: null, closed: 0, tips: new Vector3(), carried: null,
      });
    }
    this.poseArms(0);
  }

  /** Which arm reaches for a point on the table: the one on that side. */
  armFor(world: Vector3): number {
    return world.x < this.group.position.x ? 0 : 1;
  }

  /**
   * Send a hand to a point in the room: the point between its fingertips goes there (the point its fingers close
   * on). Null sends it back to rest on the table, empty: whatever it held is let go of where it is.
   * @param holding the hand has the thing it is going with, and the place it is sent is already a smooth way from
   *   one spot to the next: it keeps close to it, so the thing is not left waiting for the hand to catch up.
   */
  reach(arm: number, world: Vector3 | null, holding = false): void {
    const a = this.arms[arm];
    if (!a) return;
    a.holding = holding && !!world;
    const r = a.rig;
    if (!world) {
      if (!a.want && !a.hold && !a.carried) return;
      a.want = null;
      a.hold = null;
      a.carried = null;
      if (r) this.play(r, "idle", 0.7);
      return;
    }
    const local = this.group.worldToLocal(world.clone());
    if (!a.want) {
      a.want = local;
      if (a.k < 0.01) {
        // Start from where the fingers are, so the first of the way is as gentle as the rest.
        if (r) this.group.worldToLocal(a.at.copy(a.tips));
        else a.at.copy(local);
        for (const v of a.vel) v.v = 0;
      }
    } else a.want.copy(local);
    if (r && !WORK.has(r.clip)) this.play(r, "reach", 0.45);
  }

  /** Close the fingers on what the hand has reached: "pinch" for something small (a piece's head), "grasp" for something thicker (a candle). */
  close(arm: number, on: "pinch" | "grasp" = "pinch"): void {
    const a = this.arms[arm];
    if (!a) return;
    a.hold = on;
    const wide = on === "grasp" ? "_wide" : "";
    if (a.rig) this.play(a.rig, on, 0.1, [`lift${wide}`, `carry${wide}`]);
  }

  /** Open the fingers again: the wrist settles, then they come away. The hand stays where it is until it is sent elsewhere. */
  release(arm: number): void {
    const a = this.arms[arm];
    if (!a || !a.hold) return;
    const wide = a.hold === "grasp" ? "_wide" : "";
    a.hold = null;
    if (a.rig) this.play(a.rig, `set_down${wide}`, 0.15, ["release", "reach"]);
  }

  /** How far the fingers have closed: 0 open, 1 closed on the thing. */
  gripped(arm: number): number {
    return this.arms[arm]?.closed ?? 0;
  }

  /**
   * Put a thing in a hand (or, null, take it out): from then on it goes where the fingers go, with `offset` from the
   * point between the fingertips to the thing's own origin, and never lower than `floor`. Unless `snap` is set it
   * starts from where it stands and is drawn in to that offset, so picking it up does not move it.
   */
  carry(arm: number, obj: Object3D | null, o: { offset?: Vector3; floor?: number; snap?: boolean } = {}): void {
    const a = this.arms[arm];
    if (!a) return;
    if (!obj) {
      a.carried = null;
      return;
    }
    const ideal = o.offset?.clone() ?? new Vector3();
    const offset = o.snap ? ideal.clone() : obj.getWorldPosition(new Vector3()).sub(a.tips);
    a.carried = { obj, offset, ideal, floor: o.floor ?? -Infinity };
    this.bring(a, 0);
  }

  /** Light a wick: finger and thumb close on it where the hand is, roll it, and spring apart. It takes `sparkAfter` seconds in. */
  strike(arm: number): void {
    const r = this.arms[arm]?.rig;
    if (r) this.play(r, "light", 0.12, ["reach"]);
  }

  /** Seconds after `strike` at which the fingers spring apart and the flame should take. */
  get sparkAfter(): number {
    return this.marks.light ?? 0.5;
  }

  /**
   * Do one of the small things it does with its hands: bring a fist down on the table, drum its fingers, tap one
   * finger slowly, steeple its hands, flick something away. Returns false, and does nothing, if the hands are busy
   * (or are the plain ones built in code, which have no such movements).
   */
  gesture(name: Gesture): boolean {
    if (this.reduced) return false;
    const idle = (a: Arm): boolean => !!a.rig && a.rig.clip === "idle" && !a.want && !a.hold && !a.carried && a.k < 0.05;
    // Both hands for a steeple; otherwise the hand on the player's right if it is free, else the other.
    const use = name === "steeple" ? (this.arms.every(idle) ? this.arms : []) : [this.arms[1], this.arms[0]].filter((a): a is Arm => !!a && idle(a)).slice(0, 1);
    for (const a of use) {
      a.rig!.struck = false;
      this.play(a.rig!, name, 0.2, ["idle"]);
    }
    return use.length > 0;
  }

  /** How hard a fist has just hit the table (0 if none has since this was last asked). */
  takeImpact(): number {
    const hit = this.impact;
    this.impact = 0;
    return hit;
  }

  /** A point out of sight, in the room: where a hand goes to fetch something (with the rig, its lap under the table). */
  sleeve(arm: number): Vector3 {
    const a = this.arms[arm]!;
    return this.group.localToWorld(a.rig ? new Vector3(a.side * 0.14, -0.16, 0.2) : a.elbow.clone());
  }

  /** Where the point between a hand's fingertips is now, in the room. */
  fingertips(arm: number): Vector3 {
    return this.arms[arm]!.tips.clone();
  }

  /** Whether a hand is away on some errand: sent somewhere, or with something in it. Whoever wants it next waits. */
  busy(arm: number): boolean {
    const a = this.arms[arm];
    return !!a && (!!a.want || !!a.carried);
  }

  /** How far a hand has come from its place on the table, 0 (at rest) to 1 (fully reached out). */
  reached(arm: number): number {
    return this.arms[arm]?.k ?? 0;
  }

  /** Put a clip in charge of an arm, fading it in over `fade` seconds; `then` are the clips to follow, each when the last has played out. */
  private play(r: Rig, name: string, fade: number, then: string[] = []): void {
    const next = r.actions.get(name);
    if (!next) return;
    r.then = then;
    const f = r.fades.get(next)!;
    const loop = LOOPS.has(name);
    if (r.clip === name && loop) return;
    for (const [act, g] of r.fades) {
      if (act === next) continue;
      g.to = 0;
      g.rate = 1 / fade;
    }
    // A loop that is still fading out keeps its place; anything else starts from its beginning.
    if (!loop || f.k === 0) {
      next.reset();
      next.play();
      if (this.reduced && !loop) next.time = next.getClip().duration;
    }
    f.to = 1;
    f.rate = 1 / fade;
    r.clip = name;
  }

  /** Place each hand, and whatever it carries. */
  private poseArms(dt: number): void {
    for (const a of this.arms) {
      const goal = a.want ? 1 : 0;
      if (this.reduced) {
        a.k = goal;
        if (a.want) a.at.copy(a.want);
      } else {
        a.k = Math.max(0, Math.min(1, settle(a.k, goal, a.kVel, 0.55, dt)));
        if (!a.want && a.k < 1e-4) a.k = 0;
        if (a.want) {
          // A long way takes longer: the hand crosses the table at a walk, not a snatch.
          const time = a.holding ? 0.16 : Math.min(0.75, 0.3 + 0.5 * a.at.distanceTo(a.want));
          a.at.set(settle(a.at.x, a.want.x, a.vel[0], time, dt), settle(a.at.y, a.want.y, a.vel[1], time, dt), settle(a.at.z, a.want.z, a.vel[2], time, dt));
        }
      }
    }
    this.leanTorso(dt);
    for (const a of this.arms) {
      if (a.rig) this.poseRig(a, a.rig, dt);
      else this.poseCode(a, dt);
      this.bring(a, dt);
    }
  }

  /**
   * Lean the body from the hips. Toward something far: the shoulder goes part of the way there, so the arm has less
   * to make up by lengthening. Into a blow of the fist: back a little as the arm goes up, forward and down with it.
   */
  private leanTorso(dt: number): void {
    let pitch = 0, roll = 0, yaw = 0, nod = 0, quick = false;
    for (const a of this.arms) {
      const r = a.rig;
      if (!r) continue;
      if (a.k > 0) {
        const dx = a.at.x - r.shoulderAt.x, dy = a.at.y - r.shoulderAt.y, dz = a.at.z - r.shoulderAt.z;
        const flat = Math.hypot(dx, dz);
        // How much further the thing is than the arm reaches comfortably.
        const over = Math.min(REACH_LEAN, Math.max(0, Math.hypot(flat, dy) - REACH_EASY)) * ease(a.k);
        if (flat > 1e-3 && over > 0) {
          pitch += (dz / flat) * over;
          roll -= (dx / flat) * over * 0.7;
          yaw -= a.side * Math.max(0, dz / flat) * over * 0.7;
        }
      }
      if (r.clip === "slam") {
        const act = r.actions.get("slam")!;
        const t = act.time, T = this.marks.slam ?? 1, end = act.getClip().duration;
        const rise = Math.max(0.05, T - 0.14);
        // Back as the fist goes up; forward with the blow; held; and slowly upright again.
        const p = t < rise ? -0.07 * ease(t / rise) : t < T ? -0.07 + 0.3 * ((t - rise) / (T - rise)) ** 2 : 0.23 * (1 - ease(Math.min(1, Math.max(0, (t - (end - 1.4)) / 1.3))));
        pitch += p;
        yaw -= a.side * 0.5 * p;
        nod += t < rise ? -0.1 * ease(t / rise) : 0.3 * (1 - ease(Math.min(1, Math.max(0, (t - (end - 1.4)) / 1.3))));
        quick = true;
      }
    }
    const L = this.lean, V = this.leanVel;
    if (this.reduced) {
      L.pitch = pitch; L.roll = roll; L.yaw = yaw; L.nod = nod;
    } else {
      const time = quick ? 0.07 : 0.4;
      L.pitch = settle(L.pitch, pitch, V.pitch, time, dt);
      L.roll = settle(L.roll, roll, V.roll, time, dt);
      L.yaw = settle(L.yaw, yaw, V.yaw, time, dt);
      L.nod = settle(L.nod, nod, V.nod, quick ? 0.12 : 0.4, dt);
    }
    const g = this.torso;
    g.rotation.set(L.pitch, L.yaw, L.roll, "YXZ");
    // Turned about the hips, not about the table top.
    g.position.copy(HIPS).sub(_v1.copy(HIPS).applyQuaternion(g.quaternion));
    g.updateMatrix();
  }

  /** Keep a carried thing between the fingers. */
  private bring(a: Arm, dt: number): void {
    const c = a.carried;
    if (!c) return;
    c.offset.lerp(c.ideal, this.reduced ? 1 : 1 - Math.exp(-dt * 7));
    const p = a.tips.clone().add(c.offset);
    p.y = Math.max(c.floor, p.y);
    c.obj.position.copy(c.obj.parent ? c.obj.parent.worldToLocal(p) : p);
  }

  /** The sculpted arm: run its clips, then lay shoulder, elbow and wrist so the fingers are where they are wanted. */
  private poseRig(a: Arm, r: Rig, dt: number): void {
    // The clips: each fades toward being in charge or out of it, and the one in charge hands on when it has played out.
    const cur = r.actions.get(r.clip)!;
    if (r.then.length && !LOOPS.has(r.clip) && cur.time >= cur.getClip().duration - 1e-3) this.play(r, r.then[0]!, r.clip === "release" || r.clip === "light" ? 0.3 : 0.2, r.then.slice(1));
    for (const [act, f] of r.fades) {
      const step = this.reduced ? 1 : dt * f.rate;
      f.k = f.k < f.to ? Math.min(f.to, f.k + step) : Math.max(f.to, f.k - step);
      act.setEffectiveWeight(ease(f.k));
      if (f.k === 0 && f.to === 0 && act.isRunning()) act.stop();
    }
    r.mixer.update(this.reduced ? 0 : dt);
    // How far the fingers have closed, for whoever is waiting to lift what they hold.
    const now = r.actions.get(r.clip)!;
    const part = Math.min(1, now.time / now.getClip().duration);
    a.closed = r.clip === "pinch" || r.clip === "grasp" ? part : r.clip === "release" ? 1 - part : /^(lift|carry|set_down)/.test(r.clip) ? 1 : 0;
    if (r.clip === "slam" && !r.struck && now.time >= (this.marks.slam ?? 0.74)) {
      r.struck = true;
      this.impact = 1;
    }

    // Where the clips put the wrist and how they turn the hand, in the arm's own space.
    r.space.updateWorldMatrix(true, false);
    // The shoulder goes with the body as it leans.
    const S = r.space.worldToLocal(this.group.localToWorld(r.upper.position.copy(r.shoulderAt).applyMatrix4(this.torso.matrix)));
    const k = a.k;
    const turn = _q1.copy(r.ctl.quaternion);
    const W = _v1.copy(r.ctl.position);
    if (k > 0) {
      // Reaching for a real thing: the hand swings round to point along the arm, and the wrist goes wherever puts
      // the point between the fingertips exactly on it.
      // Over the table the fingers (and anything hanging from them) stay above the wood: a hand coming up from the
      // lap rides over the table's edge, not through it.
      const hang = a.carried ? Math.max(0, -a.carried.ideal.y) : 0;
      const over = ease(Math.max(0, Math.min(1, (a.at.z - TABLE_EDGE + 0.1) / 0.11)));
      _v2.copy(a.at);
      _v2.y += over * (above(a.at.y, hang - 0.015, 0.015) - a.at.y);
      const at = r.space.worldToLocal(this.group.localToWorld(_v2));
      const swing = Math.atan2(at.x - S.x, at.z - S.z) * 0.85 * k;
      turn.premultiply(_q2.setFromAxisAngle(UP, swing));
      W.lerp(at.sub(_v3.copy(r.grip.position).applyQuaternion(turn)), k);
    }
    // Shoulder to wrist. Further than the arm is long, the arm grows: gently at first, so the elbow never snaps straight.
    const d = _v2.copy(W).sub(S);
    const far = d.length();
    const grow = Math.hypot(1, Math.max(0, far / (r.l1 + r.l2) - 0.75) / 0.6);
    const l1 = r.l1 * grow, l2 = r.l2 * grow;
    const span = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-4, far));
    d.normalize();
    const along = (l1 * l1 - l2 * l2 + span * span) / (2 * span);
    const out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    // The elbow hangs to the same side it does at rest.
    const side = _v3.copy(r.pole).addScaledVector(d, -r.pole.dot(d));
    if (side.lengthSq() < 1e-6) side.set(0, -1, 0).addScaledVector(d, d.y);
    side.normalize();
    const E = _v4.copy(S).addScaledVector(d, along).addScaledVector(side, out);
    // Turn each bone from how it was made to how it must lie.
    const upperQ = _q2.setFromUnitVectors(r.upperDir0, _v2.copy(E).sub(S).normalize()).multiply(r.upperQ0);
    r.upper.quaternion.copy(upperQ);
    r.upperEnd.position.copy(r.upperEnd0).multiplyScalar(grow);
    const elbowQ = _q3.copy(upperQ).multiply(r.upperEnd.quaternion);
    const foreQ = _q4.setFromUnitVectors(r.foreDir0, _v2.copy(W).sub(E).normalize()).multiply(r.foreQ0);
    r.fore.quaternion.copy(elbowQ.invert()).multiply(foreQ);
    r.foreEnd.position.copy(r.foreEnd0).multiplyScalar(grow);
    r.wrist.quaternion.copy(foreQ.multiply(r.foreEnd.quaternion).invert()).multiply(turn);
    r.root.updateMatrixWorld(true);
    r.grip.getWorldPosition(a.tips);
  }

  /** The plain arm built in code: place the hand and stretch its sleeve to it. */
  private poseCode(a: Arm, dt: number): void {
    const shut = a.hold ? 1 : 0;
    a.closed = this.reduced ? shut : Math.max(0, Math.min(1, a.closed + Math.sign(shut - a.closed) * dt * 5));
    const k = ease(a.k);
    // Reaching, the hand turns to point along the arm and tips its fingers down onto what it holds.
    const dx = a.at.x - a.elbow.x, dz = a.at.z - a.elbow.z;
    const yaw = a.restYaw + (Math.atan2(dx, dz) - a.restYaw) * k;
    const pitch = 0.72 * k;
    const h = a.hand;
    h.rotation.set(pitch, yaw, 0);
    if (k > 0) {
      const off = a.tip.clone().applyEuler(h.rotation);
      h.position.copy(a.at).sub(off).lerp(a.rest, 1 - k);
      // Carried over the table, never through it.
      h.position.y = Math.max(h.position.y, a.rest.y);
    } else h.position.copy(a.rest);
    // The sleeve: elbow, a raised bend, and the cuff just behind the hand.
    const back = new Vector3(0, 0, -a.cuff).applyEuler(h.rotation);
    const cuff = h.position.clone().add(back).add(new Vector3(0, 0.03, 0));
    const len = cuff.distanceTo(a.elbow);
    const bend = a.elbow.clone().lerp(cuff, 0.5).add(new Vector3(0, 0.015 + len * 0.1, 0));
    const lay = (m: Mesh, from: Vector3, to: Vector3) => {
      m.position.copy(from).lerp(to, 0.5);
      m.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize());
      m.scale.set(1, from.distanceTo(to), 1);
    };
    lay(a.sleeve[0], a.elbow, bend);
    lay(a.sleeve[1], bend, cuff);
    a.joints[0].position.copy(bend);
    a.joints[1].position.copy(cuff);
    h.updateWorldMatrix(true, false);
    h.localToWorld(a.tips.copy(a.tip));
  }

  /** One finger: joints end to end along +z, each bent a little further down than the last. */
  private finger(lengths: number[], r: number, skin: Material, nail: Material): Group {
    const root = new Group();
    let at: Group = root;
    lengths.forEach((len, i) => {
      const k = new Group();
      k.rotation.x = i === 0 ? -0.2 : 0.24;
      const rr = r * (1 - i * 0.14);
      const bone = new Mesh(new CapsuleGeometry(rr, len, 4, 8), skin);
      bone.rotation.x = Math.PI / 2;
      bone.position.z = len / 2;
      bone.castShadow = true;
      k.add(bone);
      if (i === lengths.length - 1) {
        const n = new Mesh(new SphereGeometry(rr * 0.9, 8, 6), nail);
        n.scale.set(0.9, 0.3, 1.25);
        n.position.set(0, rr * 0.75, len * 0.72);
        k.add(n);
      }
      at.add(k);
      const next = new Group();
      next.position.z = len;
      k.add(next);
      at = next;
    });
    return root;
  }

  /** Have the eyes follow a point in the room for a while (a rolling die, a moving piece). */
  watch(point: Vector3, seconds: number, now: number): void {
    this.lookTarget = point;
    this.gaze = "watch";
    this.gazeUntil = now + seconds;
  }

  /** Change the look in the eyes for a while. */
  mood(gaze: Gaze, seconds: number, now: number): void {
    this.gaze = gaze;
    this.gazeUntil = now + seconds;
    if (gaze !== "watch") this.lookTarget = null;
  }

  update(t: number, camera: Camera, dt = 1 / 60): void {
    this.poseArms(dt);
    if (t > this.gazeUntil && this.gaze !== "player") {
      this.gaze = "player";
      this.lookTarget = null;
    }
    // Where the eyes point: at the thing being watched, else at the player.
    const world = this.head.getWorldPosition(new Vector3());
    const target = this.lookTarget ?? camera.position;
    const to = target.clone().sub(world);
    const yaw = Math.atan2(to.x, to.z);
    const pitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
    const k = this.reduced ? 1 : 0.06;
    // The hood turns a little; the eyes go the rest of the way.
    this.head.rotation.y += (yaw * 0.45 - this.head.rotation.y) * k;
    this.head.rotation.x += (0.2 + this.lean.nod - pitch * 0.35 - this.head.rotation.x) * k;
    this.pupil.x += (Math.max(-1, Math.min(1, yaw * 2.2)) - this.pupil.x) * (this.reduced ? 1 : 0.2);
    this.pupil.y += (Math.max(-1, Math.min(1, -pitch * 2.4 - 0.2)) - this.pupil.y) * (this.reduced ? 1 : 0.2);

    if (!this.reduced) {
      // Breathing, and a finger that taps now and then.
      const br = Math.sin(t * 0.9);
      this.body.scale.set(1 + br * 0.006, 1 + br * 0.008, 1 + br * 0.012);
      this.head.position.y = 0.62 + br * 0.004;
      if (t > this.tapAt + 1.2) this.tapAt = t + 5 + this.jitter() * 9;
      const tap = t > this.tapAt ? Math.max(0, Math.sin((t - this.tapAt) * Math.PI * 5)) * (t - this.tapAt < 0.8 ? 1 : 0) : 0;
      const f = this.fingers[5];
      if (f) f.rotation.x = -tap * 0.5;
      // A blink: both eyes, or sometimes only one, which is worse.
      if (t > this.blinkAt + 0.22) {
        this.blinkAt = t + 2.5 + this.jitter() * 7;
        this.blinkEye = this.jitter() < 0.22 ? (this.jitter() < 0.5 ? 1 : 2) : 0;
      }
      this.open = t > this.blinkAt ? Math.abs(Math.cos(((t - this.blinkAt) / 0.22) * Math.PI)) : 1;
    }
    // Drawn on eights: the eyes change a few times a second, like an animated drawing.
    const step = this.reduced ? Math.floor(t / 2) : Math.floor(t * 9);
    if (step !== this.drawnAt) {
      this.drawnAt = step;
      this.draw(step);
    }
    (this.eyes.material as MeshBasicMaterial).opacity = this.glow;
  }

  /** Paint both eyes for this step of the drawing. */
  private draw(step: number): void {
    const g = this.eyeG;
    const r = rng(1000 + step * 7);
    g.clearRect(0, 0, EYE_W, EYE_H);
    const wide = this.gaze === "wide" ? 1.6 : this.gaze === "narrow" ? 0.45 : 1;
    for (const side of [-1, 1]) {
      const closing = this.blinkEye === 0 || (this.blinkEye === 1 ? side < 0 : side > 0) ? this.open : 1;
      // Set a little too far apart, and never quite the same size.
      const cx = EYE_W / 2 + side * 62;
      const cy = EYE_H / 2 + (side < 0 ? 1 : -2);
      const w = (side < 0 ? 33 : 30) + (r() - 0.5) * 1.6;
      const h = Math.max(1.2, (side < 0 ? 12.5 : 14.5) * wide * closing + (r() - 0.5) * 1.2);
      // The lid: flat on top when narrowed, tilted inward.
      const tilt = (this.gaze === "narrow" ? 0.32 : 0.16) * side;
      g.save();
      g.translate(cx, cy);
      g.rotate(tilt);
      // A halo first, so the eye seems to give its own light.
      const halo = g.createRadialGradient(0, 0, 2, 0, 0, w * 1.5);
      halo.addColorStop(0, "rgba(255,214,150,.2)");
      halo.addColorStop(1, "rgba(255,190,120,0)");
      g.fillStyle = halo;
      g.fillRect(-w * 1.6, -w * 1.6, w * 3.2, w * 3.2);
      g.fillStyle = "#f6ecd0";
      g.beginPath();
      const top = this.gaze === "narrow" ? h * 0.35 : h;
      g.moveTo(-w, (r() - 0.5) * 1.5);
      g.quadraticCurveTo(-w * 0.2 + (r() - 0.5) * 2, -top * 1.9, w, (r() - 0.5) * 1.5);
      g.quadraticCurveTo(w * 0.1 + (r() - 0.5) * 2, h * 1.8, -w, 0);
      g.fill();
      // The pupil: a small dark point, a little too small, that goes where the eyes look.
      if (h > 4) {
        g.fillStyle = "#050302";
        g.beginPath();
        const pr = this.gaze === "wide" ? 3.4 : 4.6;
        g.ellipse(this.pupil.x * w * 0.5 + (r() - 0.5) * 0.8, this.pupil.y * h * 0.38, pr, Math.min(pr, h * 0.8), 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    this.eyeTex.needsUpdate = true;
  }

  dispose(): void {
    for (const a of this.arms) a.rig?.mixer.stopAllAction();
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
    for (const m of this.mats) m.dispose();
    this.eyeTex.dispose();
  }
}

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _q1 = new Quaternion(), _q2 = new Quaternion(), _q3 = new Quaternion(), _q4 = new Quaternion();
