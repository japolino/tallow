/**
 * The room (docs/DESIGN.md, 8): one table in a dark cabin, seen from your
 * chair. Across it sits the narrator. Between you lies the map, with pieces
 * on it; a die rolls beside it. The light is the game's clock, the weather
 * is the game's weather, and you can lean in over the map and sit back.
 *
 * Axes: +x is your right, +y is up, +z points from the narrator to you. The
 * table top is y = 0. Lengths are in metres.
 *
 * `mountRoom` is the only entry: it returns a handle the game drives. With
 * no WebGL it returns the flat room (flat.ts) behind the same handle.
 */
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  FogExp2,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Shape,
  Path,
  SphereGeometry,
  IcosahedronGeometry,
  SRGBColorSpace,
  BufferAttribute,
  BufferGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
  type WebGLRenderTarget,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Candle, candleKit } from "./candles.js";
import { candleBurn, daylight, WEATHERS, wrapHour, type Air, type LightState, type Weather } from "./daylight.js";
import { Governor, QUALITY } from "./governor.js";
import { Desk } from "./desk.js";
import { Die, DIE_REST } from "./die.js";
import { PlayerHand } from "./hand.js";
import { mountFlatRoom } from "./flat.js";
import { drawMapSheet, MAP_PX, stopOnSheet, type MapSheet } from "./mapsheet.js";
import { Narrator, type Gesture } from "./narrator.js";

export type { Gesture };
import { Post } from "./post.js";
import { sound } from "./sound.js";
import { flameCanvas, frostCanvas, glowCanvas, latticeCanvas, leatherCanvas, rainGlassCanvas, rng, treelineCanvas, woodCanvas, type Canvas } from "./textures.js";
import { Breath, Drift, Lightning, Mist, Rain } from "./weather.js";

export type { Weather } from "./daylight.js";

export interface PieceSpec {
  id: string;
  kind: "player" | "companion" | "narrator";
  /** The stop it stands on. */
  at: string;
}

export interface RoomOptions {
  map: MapSheet;
  pieces: PieceSpec[];
  /** Hour of the game's day, 0..24. */
  hour?: number;
  weather?: Weather;
  /** Leave unset to follow the system's "reduce motion" setting. */
  reducedMotion?: boolean;
  /** Use the flat room even where WebGL works (for testing the fallback). */
  flat?: boolean;
  /** Where the room's model files are served from (the repo's assets folder). Without it the room uses shapes built in code. */
  assets?: string;
  /** Told when the player leans in or sits back (by clicking the map, the wheel, or a key). */
  onLean?: (over: boolean) => void;
  /** Start at this step of quality instead of the full picture (0). The room still steps down by itself when frames run slow. */
  quality?: number;
}

export interface RoomStats {
  fps: number;
  /** 0 is the full picture; each step up draws fewer pixels or fewer shadows. */
  quality: number;
  /** Size of the drawn picture before it is scaled to the screen. */
  buffer: [number, number];
}

export interface RoomHandle {
  readonly kind: "webgl" | "flat";
  /** Settles when the room's model files have loaded (or failed, and their stand-ins are showing). */
  readonly ready: Promise<void>;
  setClock(hour: number): void;
  setWeather(weather: Weather): void;
  /** Lean in over the map (true) or sit back (false). */
  lean(over: boolean): void;
  readonly leaning: boolean;
  /** Show a throw that ends on `value` (1..20). The number is decided by the caller; resolves when the die rests. */
  rollDie(value: number): Promise<void>;
  /**
   * Put the die in the player's hand: the view tips down to the dice box, the hand takes a die and holds it, moving
   * with the pointer. A click (or `releaseDie`) lets go, and the throw ends on `value`, which the caller decided
   * beforehand. Resolves when the die rests.
   */
  offerDie(value: number): Promise<void>;
  /** True while the die is in the player's hand, waiting to be let go. */
  readonly holding: boolean;
  releaseDie(): void;
  /**
   * Resolves when you have sat back from reading a throw, so the table is in view again (on the next frame if
   * you already have). Absent on the flat room.
   */
  settled?(): Promise<void>;
  /** Move a piece to a stop. Resolves when it is set down. */
  movePiece(id: string, stopId: string): Promise<void>;
  /** Draw a new map on the sheet: an adventure built after the room was (its places keep their ids). Absent on the flat room. */
  setMap?(map: MapSheet): void;
  /** Theatre of the mind (free form, engine/free.ts): the map sheet and the pieces put away, or set out again. Absent on the flat room. */
  theatre?(on: boolean): void;
  /** The narrator inks a place onto the map, down its margin (engine/clues.ts). Absent on the flat room. */
  inkPlace?(name: string): void;
  /** Notches in the burning candle, one at the height each of these hours will fall (docs/MOONSHOT.md, 5.3). Absent on the flat room. */
  notch?(hours: readonly number[]): void;
  /**
   * The black candle of a campaign (docs/MOONSHOT.md, 6.1), at the narrator's right hand: six rings scored on it, `burned`
   * of them gone. Lit for a while when the big bad takes a step. Null puts it away. Absent on the flat room.
   */
  blackCandle?(c: { burned: number; lit: boolean } | null): void;
  /**
   * Have the narrator do something small with its hands: "slam" a fist on the table (the table shakes, the flames
   * flutter, the pieces and the die jump), "drum" its fingers, "tap" one finger slowly, "steeple" its hands while it
   * waits, or "flick" something away. Returns false if its hands are busy, or with reduced motion (nothing moves).
   * Absent on the flat room.
   */
  gesture?(name: Gesture): boolean;
  /** Your side of the table: the notebook, the pages, the counters, the balance and the narrator's voice. Absent on the flat room. */
  readonly desk?: Desk;
  stats(): RoomStats;
  /**
   * Draw some frames back to back, waiting for the graphics card after each, and return the milliseconds one
   * frame costs. Unlike the frame rate, this does not depend on how often the browser lets the page draw.
   * Absent on the flat room.
   */
  benchmark?(frames?: number): number;
  /**
   * Run the room forward by this many seconds at once, a sixtieth of a second at a time. For checks and scripted
   * pictures, where the browser may not be drawing the page at speed. Absent on the flat room.
   */
  advance?(seconds: number): void;
  dispose(): void;
}

/** The map sheet on the table. */
const MAP_W = 1.08;
const MAP_H = MAP_W * (MAP_PX.h / MAP_PX.w);
const MAP_Z = -0.12;
const MAP_Y = 0.003;

/** Where the narrator sits. */
const NARRATOR_Z = -1.14;

const BACK = { cx: -0.15, w: 1.3, y0: 0.2, h: 1.55, arch: 0.42, z: -2.5 };
const LEFT = { cz: -0.35, w: 1.2, y0: 0.3, h: 1.2, x: -2.3 };
const WALL_T = 0.28;

const SEAT = { eye: new Vector3(0, 0.5, 1.2), look: new Vector3(0, 0.14, -0.6), fov: 42 };
const LEAN = { eye: new Vector3(0, 1.02, 0.5), look: new Vector3(0, 0, -0.09), fov: 42 };

/** The dice box, by your right hand, and how you look down at it. */
const BOX = new Vector3(0.5, 0, 0.3);
const BOX_VIEW = { eye: new Vector3(0.12, 0.6, 1.16), look: new Vector3(0.44, -0.02, 0.2) };
/** Where a thrown die comes to rest, and where you lean to read it. */
const DIE_AT = new Vector3(0.4, MAP_Y, 0.1);
const READ_EYE = new Vector3(0.385, 0.42, 0.37);
const READ_FOV = 24;
/** By day, new candles are set out early once the weather makes the room this dark (LightState.candle). */
const GLOOM = 0.5;
/** How far in front of the eye the drawn hand is held. */
const HAND_D = 0.42;

const ease = (k: number): number => k * k * (3 - 2 * k);
const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

export function webglOk(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

export function mountRoom(host: HTMLElement, opts: RoomOptions): RoomHandle {
  if (!opts.flat && webglOk()) {
    try {
      return new Room(host, opts);
    } catch (err) {
      console.warn("tallow: the 3D room could not start; using the flat room.", err);
    }
  }
  return mountFlatRoom(host, opts);
}

interface Piece {
  mesh: Group;
  /** What the figure is made of, and the colour of the band round its base that says whose it is. */
  mats: { body: Material; band: Material };
  kind: PieceSpec["kind"];
  /** How tall the piece stands, for the hand that lifts it by its head. */
  height: number;
  at: string;
  move: {
    t0: number;
    dur: number;
    from: Vector3;
    to: Vector3;
    done: () => void;
    /** Set when the narrator's hand is doing the moving: which arm, and how far along it is. */
    arm?: number;
    phase?: "wait" | "reach" | "pinch" | "carry" | "release";
  } | null;
}

/** One of the narrator's hands setting out new candles: which candles are still to do, and where it is with the first. */
interface Tend {
  arm: number;
  queue: number[];
  phase: "fetch" | "carry" | "set" | "letgo" | "light" | "flare";
  t0: number;
  /** The new candle while it is in the hand. */
  held: Mesh;
}

class Room implements RoomHandle {
  readonly kind = "webgl" as const;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(SEAT.fov, 1, 0.05, 80);
  private post: Post;
  private canvas: HTMLCanvasElement;
  private resizeObs: ResizeObserver;
  private raf = 0;
  private disposed = false;
  private textures: Texture[] = [];
  private env: WebGLRenderTarget | null = null;

  private reduced: boolean;
  private hour: number;
  /** What is in the air now, and what it is sliding toward. */
  private air: Air;
  private airTarget: Air;
  private state: LightState;
  readonly ready: Promise<void>;

  private sun = new DirectionalLight(0xffffff, 1);
  private hemi = new HemisphereLight(0xffffff, 0x000000, 1);
  private bounce = new PointLight(0xffffff, 0, 6, 1.6);
  private candleLight = new PointLight(0xff9440, 0, 5, 1.7);
  private candleFill = new PointLight(0xff8a38, 0, 3.6, 1.8);
  private candles: Candle[] = [];
  /** The black candle of a campaign, its kit, how far it has burnt (rings of six), and how lit it is now. */
  private black: Candle | null = null;
  private blackKit: ReturnType<typeof candleKit> | null = null;
  private blackBurn = 0;
  private blackLit = 0;
  private notchMat = new MeshBasicMaterial({ color: 0x1a0f08 });
  private kit!: ReturnType<typeof candleKit>;
  private candleLevel = 0;
  private draught = 0;
  /** Each candle as it stands: how far burnt, and how lit (0 out, 1 burning, more for the moment it flares up). */
  private wax: { burn: number; lit: number }[] = [];
  /** Where each candle stands, in the room. */
  private feet: Vector3[] = [];
  private tending: Tend[] = [];
  private heldGeo: CylinderGeometry | null = null;
  /** True when new candles were set out by day, because of the weather. */
  private dayCandles = false;
  private flash = 0;
  private rumble = 0;
  /** A fist has hit the table: 1 at the blow, dying away. While it lasts the pieces and the die jump. */
  private jolt = 0;
  private jolted = false;
  private dieRest: number | null = null;
  private sky!: ShaderMaterial;
  private shafts: { mat: ShaderMaterial; normal: Vector3 }[] = [];
  private frost: { mesh: Mesh; mat: MeshBasicMaterial }[] = [];
  private trees: { mesh: Mesh; mat: MeshBasicMaterial }[] = [];
  private snowDrift: Drift[] = [];
  private rain: Rain[] = [];
  private leaves: { drift: Drift; push: Vector3 }[] = [];
  private glass: Mesh[] = [];
  private glassTex!: CanvasTexture;
  private banks: Mesh[] = [];
  private mist!: Mist;
  private lightning = new Lightning();
  private windVec = new Vector3();
  private dust!: Drift;
  private breath = new Breath();
  private narrator: Narrator;
  private die = new Die();
  private pieces = new Map<string, Piece>();
  private stops: Map<string, Vector3>;
  private mapMesh!: Mesh;
  private mapFlat!: Float32Array;
  private mapLifted = false;

  private hand: PlayerHand;
  readonly desk: Desk;
  private grab: { phase: "reach" | "hold" | "throw"; t0: number; value: number; done: () => void; from: Vector3 } | null = null;
  private boxK = 0;
  private handAt = new Vector3(0.2, -0.34, -HAND_D);
  private shake = 0;
  private shakeIn = 0;
  private shakeRun = 0;
  private rock = 0;
  private leanTarget = 0;
  private leanK = 0;
  private pointer = new Vector2();
  /** The pointer as the view follows it: eased, so the view never jerks. */
  private view = new Vector2();
  /** Reading the die: 1 while you lean toward it, 0 sat back. */
  private readK = 0;
  private readUntil = -1;
  private wasRolling = false;
  /** Waiting to be told that the view has sat back from the die. */
  private satBack: (() => void)[] = [];
  /** Where your eyes are while a die is thrown: they follow it across the table to where it stops. */
  private readLook = DIE_AT.clone();
  private baseFov = SEAT.fov;
  private tmpV = new Vector3();
  private spy: { eye: Vector3; look: Vector3; fov: number } | null = null;
  /** While true the room stands still between calls to advance(): for taking pictures of one exact moment. */
  paused = false;
  private t = 0;
  private last = 0;
  private breathAt = 2;
  private narratorBreathAt = 4;
  private shiverAt = 5;
  private governor = new Governor();
  private quality = 0;
  /** A page is up to be read, and the room is drawn finer for it: small writing cannot be read in chunky pixels. */
  private fine = false;
  /** False once this machine has shown it cannot draw that finely and keep its pace. */
  private fineOk = true;
  /** 0..1: how far the picture has been made plain for reading (post.ts). */
  private clear = 0;
  private rnd = rng(2024);
  private tmpColor = new Color();
  private tmpColor2 = new Color();

  constructor(private host: HTMLElement, private opts: RoomOptions) {
    this.reduced = opts.reducedMotion ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.hour = wrapHour(opts.hour ?? 18.3);
    this.airTarget = { ...WEATHERS[opts.weather ?? "clear"] };
    this.air = { ...this.airTarget };
    this.state = daylight(this.hour, this.air);
    this.quality = Math.max(0, Math.min(QUALITY.length - 1, Math.round(opts.quality ?? 0)));

    this.renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance", alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    Object.assign(this.canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block", imageRendering: "pixelated" });
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "A table in a dark room. A hooded figure sits across it. A map with playing pieces lies between you.");
    host.appendChild(this.canvas);
    this.post = new Post(this.renderer);

    this.stops = new Map(
      opts.map.stops.map((s) => {
        const q = stopOnSheet(s.u, s.v);
        return [s.id, V((q.u - 0.5) * MAP_W, MAP_Y, MAP_Z + (q.v - 0.5) * MAP_H)];
      }),
    );

    // Fog in the room is always there; clear air is fog of no thickness.
    this.scene.fog = new FogExp2(0x000000, 0);
    this.environment();
    this.lights();
    this.shell();
    this.outside();
    this.table();
    this.props();
    this.narrator = new Narrator(this.reduced, opts.assets ? `${opts.assets.replace(/\/$/, "")}/models` : undefined);
    this.narrator.group.position.set(0, 0, NARRATOR_Z);
    this.scene.add(this.narrator.group);
    this.feet = this.candles.map((c) => c.group.getWorldPosition(V(0, 0, 0)));
    const burnt = this.candleTarget(this.state);
    this.wax = this.candles.map(() => ({ burn: burnt, lit: burnt < 0.999 ? 1 : 0 }));
    this.scene.add(this.die.mesh, this.breath.group);
    // Your hand is drawn flat and hangs in front of the eye, so the camera has to be part of the scene.
    this.hand = new PlayerHand(this.reduced);
    this.camera.add(this.hand.group);
    this.scene.add(this.camera);
    this.desk = new Desk({ scene: this.scene, camera: this.camera, host, narrator: this.narrator, reduced: this.reduced, box: BOX, sitBack: () => this.lean(false), stops: this.stops });
    this.diceBox();
    this.die.place(BOX.clone().add(V(-0.02, 0.012 + DIE_REST, 0.01)));
    for (const p of opts.pieces) this.addPiece(p);
    const carved = opts.assets ? this.loadPieces(`${opts.assets.replace(/\/$/, "")}/models/pieces.glb`) : Promise.resolve();
    this.ready = Promise.all([this.narrator.ready, carved]).then(() => undefined);
    this.settlePieces();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.applyQuality();
    this.canvas.addEventListener("pointermove", this.onPointer);
    this.canvas.addEventListener("click", this.onClick);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: true });
    this.canvas.addEventListener("webglcontextlost", this.onLost);
    this.raf = requestAnimationFrame(this.frame);
  }

  /* ------------------------------ building ------------------------------ */

  private tex(c: Canvas, o: { srgb?: boolean; repeat?: [number, number] } = {}): CanvasTexture {
    const t = new CanvasTexture(c);
    if (o.srgb !== false) t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    if (o.repeat) {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.repeat.set(o.repeat[0], o.repeat[1]);
    }
    this.textures.push(t);
    return t;
  }

  /** A dim room for polished things (the die, brass, glass) to reflect. */
  private environment(): void {
    const env = new Scene();
    env.add(new Mesh(new BoxGeometry(10, 10, 10), new MeshBasicMaterial({ color: new Color(0.02, 0.016, 0.014), side: BackSide })));
    const warm = new Mesh(new PlaneGeometry(3, 2), new MeshBasicMaterial({ color: new Color(3, 1.7, 0.7), side: DoubleSide }));
    warm.position.set(-2, 1.5, -3);
    warm.lookAt(0, 0, 0);
    env.add(warm);
    const cool = new Mesh(new PlaneGeometry(4, 1), new MeshBasicMaterial({ color: new Color(0.25, 0.3, 0.5), side: DoubleSide }));
    cool.position.set(3, 2.5, 2);
    cool.lookAt(0, 0, 0);
    env.add(cool);
    const pm = new PMREMGenerator(this.renderer);
    this.env = pm.fromScene(env, 0.04);
    pm.dispose();
    env.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      (m.material as Material | undefined)?.dispose?.();
    });
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.3;
  }

  private lights(): void {
    this.scene.add(this.hemi);
    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    s.shadow.bias = -0.0006;
    s.shadow.normalBias = 0.012;
    s.shadow.radius = 2.5;
    const c = s.shadow.camera;
    c.left = c.bottom = -3.6;
    c.right = c.top = 3.6;
    c.near = 1;
    c.far = 22;
    s.target.position.set(-0.6, 0.4, -0.8);
    this.scene.add(s, s.target, this.bounce);
    // The candles: one light that throws shadows from the cluster, one that only fills from the other side.
    const cl = this.candleLight;
    cl.castShadow = true;
    cl.shadow.mapSize.set(512, 512);
    cl.shadow.bias = -0.004;
    cl.shadow.radius = 5;
    cl.shadow.camera.near = 0.03;
    cl.shadow.camera.far = 5;
    cl.position.set(-0.7, 0.22, -0.46);
    this.candleFill.position.set(0.7, 0.3, -0.42);
    this.scene.add(cl, this.candleFill);
  }

  /** Walls, floor, ceiling and the two windows. */
  private shell(): void {
    const boards = woodCanvas(1024, 1024, { planks: 9, seed: 41, dark: [22, 14, 9], light: [86, 60, 38], seam: 0.03 });
    const wall = new MeshStandardMaterial({ map: this.tex(boards, { repeat: [0.42, 0.42] }), bumpMap: this.tex(boards, { srgb: false, repeat: [0.42, 0.42] }), bumpScale: 3, roughness: 0.9, color: 0x9a8876 });

    // Back wall, with the arched window cut out of it.
    const b = BACK;
    const spring = b.y0 + b.h * (1 - b.arch);
    const backShape = new Shape();
    backShape.moveTo(-2.9, -0.76);
    backShape.lineTo(2.9, -0.76);
    backShape.lineTo(2.9, 2.05);
    backShape.lineTo(-2.9, 2.05);
    backShape.closePath();
    const hole = new Path();
    hole.moveTo(b.cx - b.w / 2, b.y0);
    hole.lineTo(b.cx - b.w / 2, spring);
    hole.absellipse(b.cx, spring, b.w / 2, b.h * b.arch, Math.PI, 0, true, 0);
    hole.lineTo(b.cx + b.w / 2, b.y0);
    hole.closePath();
    backShape.holes.push(hole);
    const back = new Mesh(new ExtrudeGeometry(backShape, { depth: WALL_T, bevelEnabled: false, curveSegments: 20 }), wall);
    back.position.z = b.z - WALL_T;
    back.castShadow = back.receiveShadow = true;
    this.scene.add(back);

    // Left wall, with a square window.
    const l = LEFT;
    const leftShape = new Shape();
    leftShape.moveTo(-2.9, -0.76);
    leftShape.lineTo(3.1, -0.76);
    leftShape.lineTo(3.1, 2.05);
    leftShape.lineTo(-2.9, 2.05);
    leftShape.closePath();
    const lh = new Path();
    // The wall is built facing +z, then turned to face +x: its local x runs along -z in the room.
    lh.moveTo(-l.cz - l.w / 2, l.y0);
    lh.lineTo(-l.cz - l.w / 2, l.y0 + l.h);
    lh.lineTo(-l.cz + l.w / 2, l.y0 + l.h);
    lh.lineTo(-l.cz + l.w / 2, l.y0);
    lh.closePath();
    leftShape.holes.push(lh);
    const left = new Mesh(new ExtrudeGeometry(leftShape, { depth: WALL_T, bevelEnabled: false }), wall);
    left.rotation.y = Math.PI / 2;
    left.position.x = l.x - WALL_T;
    left.castShadow = left.receiveShadow = true;
    this.scene.add(left);

    const right = new Mesh(new BoxGeometry(WALL_T, 2.81, 6), wall);
    right.position.set(2.3 + WALL_T / 2, 0.645, 0);
    right.receiveShadow = true;
    this.scene.add(right);

    const ceil = new Mesh(new BoxGeometry(6.2, 0.2, 6.2), new MeshStandardMaterial({ color: 0x1a120c, roughness: 1 }));
    ceil.position.set(0, 2.05, 0);
    ceil.castShadow = true;
    this.scene.add(ceil);
    const beamMat = new MeshStandardMaterial({ map: this.tex(woodCanvas(512, 128, { planks: 1, seed: 9, dark: [16, 10, 7], light: [70, 48, 30] })), roughness: 0.9, color: 0x8a7868 });
    for (const z of [-1.9, -0.7, 0.5]) {
      const beam = new Mesh(new BoxGeometry(5.2, 0.2, 0.18), beamMat);
      beam.position.set(0, 1.85, z);
      beam.castShadow = beam.receiveShadow = true;
      this.scene.add(beam);
    }

    const floorC = woodCanvas(1024, 1024, { planks: 12, seed: 5, dark: [14, 9, 6], light: [64, 44, 28], seam: 0.04 });
    const floor = new Mesh(new PlaneGeometry(6, 6), new MeshStandardMaterial({ map: this.tex(floorC, { repeat: [2, 2] }), roughness: 0.85, color: 0x8a7a6c }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.76;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // The leading: it masks the sun, so its pattern lies across the table.
    const lead = (canvas: Canvas) => new MeshStandardMaterial({ map: this.tex(canvas), alphaTest: 0.5, side: DoubleSide, roughness: 0.7, color: 0x6a655c });
    const backLead = new Mesh(new PlaneGeometry(b.w, b.h), lead(latticeCanvas(512, 610, { cols: 7, rows: 6, arch: b.arch, lead: 5 })));
    backLead.position.set(b.cx, b.y0 + b.h / 2, b.z - WALL_T * 0.55);
    backLead.castShadow = true;
    this.scene.add(backLead);
    const leftLead = new Mesh(new PlaneGeometry(l.w, l.h), lead(latticeCanvas(512, 512, { cols: 6, rows: 5, arch: 0, lead: 5 })));
    leftLead.rotation.y = Math.PI / 2;
    leftLead.position.set(l.x - WALL_T * 0.55, l.y0 + l.h / 2, l.cz);
    leftLead.castShadow = true;
    this.scene.add(leftLead);

    // Frost on the inside of the glass, shown when it is cold.
    const frostT = this.tex(frostCanvas(512, 512, 12));
    for (const [geo, pos, ry] of [
      [new PlaneGeometry(b.w, b.h), V(b.cx, b.y0 + b.h / 2, b.z - WALL_T * 0.5), 0],
      [new PlaneGeometry(l.w, l.h), V(l.x - WALL_T * 0.5, l.y0 + l.h / 2, l.cz), Math.PI / 2],
    ] as const) {
      const m = new MeshBasicMaterial({ map: frostT, transparent: true, opacity: 0, depthWrite: false });
      const f = new Mesh(geo, m);
      f.position.copy(pos);
      f.rotation.y = ry;
      f.visible = false;
      this.frost.push({ mesh: f, mat: m });
      this.scene.add(f);
    }

    // Rain on the glass: beads and trails that creep down the panes.
    this.glassTex = this.tex(rainGlassCanvas(44), { repeat: [2.2, 1.6] });
    for (const [geo, pos, ry] of [
      [new PlaneGeometry(b.w, b.h), V(b.cx, b.y0 + b.h / 2, b.z - WALL_T * 0.46), 0],
      [new PlaneGeometry(l.w, l.h), V(l.x - WALL_T * 0.46, l.y0 + l.h / 2, l.cz), Math.PI / 2],
    ] as const) {
      const m = new MeshBasicMaterial({ map: this.glassTex, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const pane = new Mesh(geo, m);
      pane.position.copy(pos);
      pane.rotation.y = ry;
      pane.visible = false;
      this.glass.push(pane);
      this.scene.add(pane);
    }

    // A deep sill under each window.
    const sillMat = new MeshStandardMaterial({ color: 0x2c2018, roughness: 0.85 });
    const sillB = new Mesh(new BoxGeometry(b.w + 0.16, 0.05, WALL_T + 0.12), sillMat);
    sillB.position.set(b.cx, b.y0 - 0.025, b.z - WALL_T / 2 + 0.05);
    sillB.castShadow = sillB.receiveShadow = true;
    this.scene.add(sillB);
    const sillL = new Mesh(new BoxGeometry(WALL_T + 0.12, 0.05, l.w + 0.16), sillMat);
    sillL.position.set(l.x - WALL_T / 2 + 0.05, l.y0 - 0.025, l.cz);
    sillL.castShadow = sillL.receiveShadow = true;
    this.scene.add(sillL);

    this.shelves();
    this.lightShafts();

    // Dust hanging in the light.
    this.dust = new Drift({ count: 260, min: V(-1.6, 0, -2.2), max: V(1.4, 1.5, 0.8), size: 0.006, vel: V(0, -0.012, 0), sway: 0.05, seed: 3, additive: true });
    this.scene.add(this.dust.points);

    // Fog that has come in: over the sills, low across the far end of the table, round the narrator.
    this.mist = new Mist([
      { at: V(-0.4, 0.5, -2.1), span: 1.2, size: 1.5 },
      { at: V(0.5, 0.25, -1.7), span: 1.4, size: 1.2 },
      { at: V(-1.5, 0.6, -0.6), span: 0.8, size: 1.3 },
      { at: V(0.0, 0.12, -0.9), span: 1.3, size: 0.9 },
      { at: V(-0.3, 0.1, -0.35), span: 1.1, size: 0.7 },
      { at: V(0.9, 0.5, -1.2), span: 1.0, size: 1.3 },
      { at: V(0.2, 0.9, -1.5), span: 1.5, size: 1.6 },
    ]);
    this.scene.add(this.mist.group);
  }

  /** Shelves of books against the back wall, to the right of the window, mostly lost in the dark. */
  private shelves(): void {
    const g = new Group();
    const wood = new MeshStandardMaterial({ color: 0x241a12, roughness: 0.9 });
    const r = rng(8);
    const spines = [0x4a1f1a, 0x1f2a3a, 0x3a3018, 0x23301f, 0x3a2430, 0x2a2420, 0x51361c];
    for (let row = 0; row < 4; row++) {
      const y = -0.2 + row * 0.44;
      const shelf = new Mesh(new BoxGeometry(1.5, 0.035, 0.26), wood);
      shelf.position.set(0, y, 0);
      shelf.castShadow = shelf.receiveShadow = true;
      g.add(shelf);
      let x = -0.7;
      while (x < 0.66) {
        const w = 0.03 + r() * 0.045;
        const h = 0.2 + r() * 0.14;
        if (r() < 0.86) {
          const book = new Mesh(new BoxGeometry(w, h, 0.17 + r() * 0.04), new MeshStandardMaterial({ color: spines[Math.floor(r() * spines.length)]!, roughness: 0.8 }));
          book.position.set(x + w / 2, y + 0.0175 + h / 2, 0.01);
          book.rotation.z = r() < 0.12 ? 0.18 : 0;
          book.castShadow = true;
          g.add(book);
        }
        x += w + 0.004;
      }
    }
    for (const sx of [-0.76, 0.76]) {
      const side = new Mesh(new BoxGeometry(0.04, 1.9, 0.27), wood);
      side.position.set(sx, 0.55, 0);
      g.add(side);
    }
    g.position.set(1.42, 0, BACK.z + 0.14);
    this.scene.add(g);
  }

  /**
   * Shafts of light through each window: a bundle of soft rays, each a
   * ribbon from a point in the opening along the direction of the sun, turned
   * in the shader to face the eye. Moving the clock only changes one vector.
   */
  private lightShafts(): void {
    const r = rng(21);
    const make = (o: Vector3, a: Vector3, bv: Vector3, normal: Vector3, inside: (s: number, t: number) => boolean) => {
      const pos: number[] = [], far: number[] = [], side: number[] = [], seed: number[] = [], idx: number[] = [];
      let made = 0;
      while (made < 46) {
        const s = r(), t = r();
        if (!inside(s, t)) continue;
        const p = o.clone().addScaledVector(a, s).addScaledVector(bv, t);
        const base = pos.length / 3;
        const sd = r();
        for (const [f, sgn] of [[0, -1], [0, 1], [1, 1], [1, -1]] as const) {
          pos.push(p.x, p.y, p.z);
          far.push(f);
          side.push(sgn);
          seed.push(sd);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        made++;
      }
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute("far", new BufferAttribute(new Float32Array(far), 1));
      geo.setAttribute("side", new BufferAttribute(new Float32Array(side), 1));
      geo.setAttribute("seed", new BufferAttribute(new Float32Array(seed), 1));
      geo.setIndex(idx);
      const mat = new ShaderMaterial({
        uniforms: { uDir: { value: new Vector3() }, uColor: { value: new Color() }, uStrength: { value: 0 }, uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float far, side, seed;
          uniform vec3 uDir;
          varying float vSide, vFar, vSeed;
          void main() {
            vec3 a = (modelViewMatrix * vec4(position, 1.0)).xyz;
            vec3 b = (modelViewMatrix * vec4(position + uDir * (0.7 + seed * 0.5), 1.0)).xyz;
            vec3 p = mix(a, b, far);
            vec3 across = normalize(cross(b - a, p));
            // Each ray widens as it goes, the way light spreads in dusty air.
            p += across * side * (0.035 + seed * 0.05) * (1.0 + far * 1.6);
            vSide = side; vFar = far; vSeed = seed;
            gl_Position = projectionMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uStrength, uTime;
          varying float vSide, vFar, vSeed;
          void main() {
            float across = 1.0 - vSide * vSide;
            float along = pow(1.0 - vFar, 1.5) * smoothstep(0.0, 0.06, vFar);
            float breathe = 0.8 + 0.2 * sin(uTime * (0.2 + vSeed * 0.3) + vSeed * 40.0);
            gl_FragColor = vec4(uColor, across * across * along * breathe * uStrength * (0.5 + vSeed * 0.5));
          }`,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      });
      const m = new Mesh(geo, mat);
      m.frustumCulled = false;
      m.renderOrder = 3;
      this.scene.add(m);
      this.shafts.push({ mat, normal });
    };
    const b = BACK, l = LEFT;
    // Inside the arch: below the spring anywhere, above it only under the curve.
    const arch = (s: number, t: number) => t < 1 - b.arch || ((s - 0.5) * 2) ** 2 + ((t - (1 - b.arch)) / b.arch) ** 2 < 0.92;
    make(V(b.cx - b.w / 2 + 0.04, b.y0 + 0.04, b.z - 0.02), V(b.w - 0.08, 0, 0), V(0, b.h - 0.06, 0), V(0, 0, 1), arch);
    make(V(l.x - 0.02, l.y0 + 0.04, l.cz + l.w / 2 - 0.04), V(0, 0, -(l.w - 0.08)), V(0, l.h - 0.08, 0), V(1, 0, 0), () => true);
  }

  /** What is seen through the windows: sky, sun, a winter tree line, falling snow. */
  private outside(): void {
    this.sky = new ShaderMaterial({
      uniforms: { uTop: { value: new Color() }, uHorizon: { value: new Color() }, uSunColor: { value: new Color() }, uSunDir: { value: new Vector3(0, 1, 0) }, uSun: { value: 0 } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uSunColor, uSunDir;
        uniform float uSun;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y * 1.5 + 0.08, 0.0, 1.0);
          vec3 c = mix(uHorizon, uTop, pow(h, 0.65));
          float s = max(dot(d, uSunDir), 0.0);
          c += uSunColor * (pow(s, 900.0) * 40.0 + pow(s, 60.0) * 1.6 + pow(s, 7.0) * 0.3) * uSun;
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: BackSide,
      depthWrite: false,
    });
    const dome = new Mesh(new SphereGeometry(40, 32, 16), this.sky);
    dome.renderOrder = -1;
    this.scene.add(dome);

    const treeT = this.tex(treelineCanvas(17));
    for (const [pos, ry, w] of [[V(BACK.cx + 0.6, 1.3, -11), 0, 20], [V(-11, 1.3, -0.4), Math.PI / 2, 20]] as const) {
      const m = new MeshBasicMaterial({ map: treeT, transparent: true, color: 0x000000, depthWrite: false, fog: false });
      const tree = new Mesh(new PlaneGeometry(w, w / 2), m);
      tree.position.copy(pos);
      tree.rotation.y = ry;
      this.trees.push({ mesh: tree, mat: m });
      this.scene.add(tree);
    }

    // What falls or blows past each window: one box of it behind the back wall, one beyond the left.
    const behind = { min: V(-5, -1.6, -10), max: V(5, 4, -2.95) };
    const beside = { min: V(-10, -1.6, -4), max: V(-2.75, 4, 3) };
    this.snowDrift.push(
      new Drift({ ...behind, count: 2200, size: 0.06, vel: V(0, -0.55, 0), sway: 0.16, seed: 1, crisp: 0.75 }),
      new Drift({ ...beside, count: 1500, size: 0.06, vel: V(0, -0.55, 0), sway: 0.16, seed: 2, crisp: 0.75 }),
      // A few big flakes right against the glass.
      new Drift({ min: V(-1.2, 0, -3.5), max: V(0.9, 2.2, -2.9), count: 70, size: 0.03, vel: V(0, -0.7, 0), sway: 0.08, seed: 6, crisp: 0.6 }),
    );
    for (const d of this.snowDrift) this.scene.add(d.points);
    this.rain.push(new Rain({ ...behind, count: 2600, seed: 11 }), new Rain({ ...beside, count: 1800, seed: 12 }));
    for (const r of this.rain) this.scene.add(r.lines);
    // Leaves and grit on the wind, going the way the wind goes past each window.
    this.leaves.push(
      { drift: new Drift({ min: V(-6, -0.5, -7), max: V(6, 3.5, -3), count: 600, size: 0.1, vel: V(0, -0.5, 0), sway: 0.3, seed: 14, crisp: 1, leaf: true }), push: V(5.5, 0, 0.4) },
      { drift: new Drift({ min: V(-7, -0.5, -5), max: V(-3, 3.5, 4), count: 480, size: 0.1, vel: V(0, -0.5, 0), sway: 0.3, seed: 15, crisp: 1, leaf: true }), push: V(0.4, 0, 5.5) },
    );
    for (const lv of this.leaves) this.scene.add(lv.drift.points);

    // Snow lying on the sills outside, banked against the bottom of each window.
    // Lit only by the sky, never by the candles indoors.
    const snowMat = new MeshBasicMaterial({ color: 0xe8eef6, fog: false });
    const bank = (w: number, seed: number) => {
      const r = rng(seed);
      const shape = new Shape();
      shape.moveTo(-w / 2, 0);
      const n = 14;
      for (let i = 0; i <= n; i++) shape.lineTo(-w / 2 + (w * i) / n, 0.05 + r() * 0.07 + 0.05 * Math.sin((i / n) * Math.PI));
      shape.lineTo(w / 2, 0);
      shape.closePath();
      const m = new Mesh(new ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }), snowMat);
      m.visible = false;
      this.banks.push(m);
      this.scene.add(m);
      return m;
    };
    bank(BACK.w, 71).position.set(BACK.cx, BACK.y0, BACK.z - WALL_T * 0.55 - 0.14);
    const lb = bank(LEFT.w, 72);
    lb.rotation.y = Math.PI / 2;
    lb.position.set(LEFT.x - WALL_T * 0.55 - 0.14, LEFT.y0, LEFT.cz);
  }

  private table(): void {
    const woodC = woodCanvas(1024, 640, { planks: 5, seed: 23, dark: [34, 18, 10], light: [128, 82, 46] });
    const top = new Mesh(
      new RoundedBoxGeometry(1.9, 0.07, 1.25, 3, 0.012),
      new MeshStandardMaterial({ map: this.tex(woodC), bumpMap: this.tex(woodC, { srgb: false }), bumpScale: 2.4, roughness: 0.5, color: 0xa08672 }),
    );
    top.position.set(0, -0.035, -0.1);
    top.castShadow = top.receiveShadow = true;
    this.scene.add(top);
    const under = new Mesh(new BoxGeometry(1.7, 0.12, 1.05), new MeshStandardMaterial({ color: 0x1c120b, roughness: 0.9 }));
    under.position.set(0, -0.13, -0.1);
    under.castShadow = true;
    this.scene.add(under);
    for (const sx of [-0.78, 0.78])
      for (const sz of [-0.62, 0.42]) {
        const leg = new Mesh(new BoxGeometry(0.09, 0.7, 0.09), new MeshStandardMaterial({ color: 0x1c120b, roughness: 0.9 }));
        leg.position.set(sx, -0.41, sz);
        leg.castShadow = true;
        this.scene.add(leg);
      }

    // The map: a sheet of parchment that does not quite lie flat.
    const geo = new PlaneGeometry(MAP_W, MAP_H, 28, 18);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (MAP_W / 2), z = p.getZ(i) / (MAP_H / 2);
      const corner = Math.pow(Math.abs(x), 6) * Math.pow(Math.abs(z), 6);
      const ripple = Math.sin(x * 5.1 + 0.6) * Math.sin(z * 3.7) * 0.0012;
      p.setY(i, corner * 0.02 + ripple + Math.pow(Math.abs(x), 12) * 0.004);
    }
    geo.computeVertexNormals();
    this.mapFlat = new Float32Array(p.array as Float32Array);
    this.mapMesh = new Mesh(geo, new MeshStandardMaterial({ map: this.tex(drawMapSheet(this.opts.map)), roughness: 0.93, side: DoubleSide }));
    this.mapMesh.position.set(0, MAP_Y - 0.001, MAP_Z);
    this.mapMesh.receiveShadow = true;
    this.mapMesh.castShadow = true;
    this.scene.add(this.mapMesh);
  }

  /** The things on the table: candles, the narrator's book, a few coins. */
  private props(): void {
    const brass = new MeshStandardMaterial({ color: 0x8a6a2c, roughness: 0.32, metalness: 0.9 });
    const pewter = new MeshStandardMaterial({ color: 0x55585c, roughness: 0.45, metalness: 0.8 });
    this.kit = candleKit(this.tex(flameCanvas()), this.tex(glowCanvas(128, 0.06)));
    let seed = 300;
    const candle = (x: number, z: number, h: number, r: number, burns: number, parent: Object3D) => {
      const c = new Candle({ h, r, burns, seed: seed++ }, this.kit);
      c.group.position.set(x, 0, z);
      parent.add(c.group);
      this.candles.push(c);
    };

    // The cluster on your left, on a pewter dish.
    const cluster = new Group();
    cluster.position.set(-0.7, 0, -0.46);
    const dish = new Mesh(new LatheGeometry([[0, 0.004], [0.1, 0.004], [0.125, 0.014], [0.13, 0.02], [0.122, 0.021], [0.1, 0.01], [0, 0.009]].map(([r, y]) => new Vector2(r, y)), 32), pewter);
    dish.castShadow = dish.receiveShadow = true;
    cluster.add(dish);
    // The dish is raised a little in the middle, where the candles stand.
    const stand = new Group();
    stand.position.y = 0.009;
    cluster.add(stand);
    candle(-0.03, 0.01, 0.2, 0.021, 0.8, stand);
    candle(0.045, -0.02, 0.15, 0.024, 0.74, stand);
    candle(0.012, 0.055, 0.105, 0.019, 0.7, stand);
    this.scene.add(cluster);

    // One tall candle in a brass stick on the other side.
    const stick = new Group();
    stick.position.set(0.7, 0, -0.42);
    const holder = new Mesh(
      new LatheGeometry([[0, 0], [0.055, 0], [0.058, 0.008], [0.03, 0.016], [0.012, 0.03], [0.011, 0.07], [0.018, 0.078], [0.011, 0.088], [0.011, 0.12], [0.03, 0.128], [0.034, 0.14], [0.022, 0.142], [0.02, 0.132], [0, 0.132]].map(([r, y]) => new Vector2(r, y)), 28),
      brass,
    );
    holder.castShadow = true;
    stick.add(holder);
    const upper = new Group();
    upper.position.y = 0.132;
    stick.add(upper);
    candle(0, 0, 0.19, 0.0125, 0.86, upper);
    this.scene.add(stick);

    // The black candle of a campaign, at the narrator's right hand: put away until a campaign begins.
    const bk = (this.blackKit = candleKit(this.tex(flameCanvas()), this.tex(glowCanvas(128, 0.06))));
    bk.wax.color.set(0x171213);
    bk.run.color.set(0x110d0e);
    bk.rim.color.set(0x241c1c);
    const black = (this.black = new Candle({ h: 0.17, r: 0.019, burns: 0.9, seed: 991 }, bk));
    black.group.position.set(0.6, 0, -0.27);
    black.group.visible = false;
    // Six rings scored round it, one for each step the big bad can take.
    black.notch([1, 2, 3, 4, 5].map((k) => k / 6), new MeshBasicMaterial({ color: 0x5a4a3a }));
    this.scene.add(black.group);

    // The narrator's book, closed, at its right hand.
    const tome = new Group();
    const cover = new MeshStandardMaterial({ map: this.tex(leatherCanvas(4, [70, 26, 20])), roughness: 0.6 });
    const pages = new MeshStandardMaterial({ color: 0xb8a57e, roughness: 0.9 });
    const block = new Mesh(new BoxGeometry(0.21, 0.046, 0.29), pages);
    block.position.y = 0.031;
    const c1 = new Mesh(new RoundedBoxGeometry(0.225, 0.008, 0.3, 2, 0.003), cover);
    c1.position.y = 0.004;
    const c2 = c1.clone();
    c2.position.y = 0.058;
    const spine = new Mesh(new BoxGeometry(0.008, 0.062, 0.3), cover);
    spine.position.set(-0.112, 0.031, 0);
    for (const m of [block, c1, c2, spine]) {
      m.castShadow = m.receiveShadow = true;
      tome.add(m);
    }
    const clasp = new Mesh(new BoxGeometry(0.03, 0.066, 0.02), brass);
    clasp.position.set(0.108, 0.031, 0);
    tome.add(clasp);
    tome.position.set(0.72, 0, -0.14);
    tome.rotation.y = 0.24;
    this.scene.add(tome);

    // A few coins by the narrator's book.
    const gold = new MeshStandardMaterial({ color: 0xb08a34, roughness: 0.3, metalness: 1 });
    for (let i = 0; i < 6; i++) {
      const coin = new Mesh(new CylinderGeometry(0.013, 0.013, 0.0025, 18), gold);
      const stack = i < 3;
      coin.position.set(stack ? 0.5 : 0.47 + this.rnd() * 0.09, stack ? 0.00125 + i * 0.0026 : 0.00125, stack ? -0.36 : -0.31 + this.rnd() * 0.06);
      coin.rotation.y = this.rnd() * 3;
      coin.castShadow = coin.receiveShadow = true;
      this.scene.add(coin);
    }
  }

  /** An open box of dice by your right hand. The die you roll is taken from it. */
  private diceBox(): void {
    const g = new Group();
    const woodC = woodCanvas(256, 128, { planks: 1, seed: 61, dark: [26, 14, 8], light: [96, 60, 34] });
    const wood = new MeshStandardMaterial({ map: this.tex(woodC), roughness: 0.6, color: 0x9a8270 });
    const felt = new MeshStandardMaterial({ color: 0x1c2a22, roughness: 1 });
    const w = 0.21, d = 0.15, h = 0.042, t = 0.011;
    const base = new Mesh(new BoxGeometry(w, t, d), wood);
    base.position.y = t / 2;
    const lining = new Mesh(new PlaneGeometry(w - t * 2, d - t * 2), felt);
    lining.rotation.x = -Math.PI / 2;
    lining.position.y = t + 0.0006;
    g.add(base, lining);
    for (const [sx, sz, bw, bd] of [[0, d / 2 - t / 2, w, t], [0, -d / 2 + t / 2, w, t], [w / 2 - t / 2, 0, t, d], [-w / 2 + t / 2, 0, t, d]] as const) {
      const wall = new Mesh(new BoxGeometry(bw, h, bd), wood);
      wall.position.set(sx, h / 2, sz);
      g.add(wall);
    }
    // Two more dice lying in it.
    for (const [x, z, color, turn] of [[0.045, -0.025, 0xd8c9a4, 0.7], [0.03, 0.035, 0x1c2c48, 2.1]] as const) {
      const spare = new Mesh(new IcosahedronGeometry(0.026, 0), new MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, flatShading: true }));
      spare.position.set(x, t + 0.0207, z);
      spare.rotation.set(turn, turn * 1.7, 0.4);
      g.add(spare);
    }
    g.traverse((o) => {
      o.castShadow = o.receiveShadow = true;
    });
    g.position.copy(BOX);
    g.rotation.y = -0.18;
    this.scene.add(g);
  }

  /** The carved figures, once they have loaded (models/pieces.py makes them). */
  private carved: Group | null = null;
  private pieceVoid = new MeshBasicMaterial({ color: 0x000000, fog: false });
  private pieceEyes = new MeshBasicMaterial({ color: 0xffdf9a, fog: false, toneMapped: false });

  /** Fetch the carved figures and stand them in place of the turned ones. If the file will not load, the turned ones stay. */
  private loadPieces(url: string): Promise<void> {
    return new Promise((done) => {
      new GLTFLoader().load(
        url,
        (gltf) => {
          if (!this.disposed) {
            this.carved = gltf.scene;
            for (const p of this.pieces.values()) this.carve(p);
          }
          done();
        },
        undefined,
        () => {
          console.warn("tallow: the carved pieces did not load; keeping the turned ones.");
          done();
        },
      );
    });
  }

  /** Stand the carved figure in a piece's place: a walker in a hat for you and your companions, a small hooded copy of the narrator for its own. */
  private carve(p: Piece): void {
    const src = this.carved?.getObjectByName(p.kind === "narrator" ? "shadow" : "traveller");
    if (!src) return;
    const fig = src.clone(true);
    fig.position.set(0, 0, 0);
    fig.scale.setScalar(p.kind === "companion" ? 0.86 : 1);
    // Yours and your companions' look up the table at the narrator; its own looks back at you.
    fig.rotation.y = p.kind === "narrator" ? 0 : Math.PI;
    let found = false;
    fig.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const name = (m.material as Material | undefined)?.name ?? "";
      const inside = /void|eyes/i.test(name);
      m.material = /eyes/i.test(name) ? this.pieceEyes : inside ? this.pieceVoid : /band/i.test(name) ? p.mats.band : p.mats.body;
      m.castShadow = !inside;
      m.receiveShadow = !inside;
      found = true;
    });
    if (!found) return;
    for (const old of [...p.mesh.children]) {
      p.mesh.remove(old);
      (old as Mesh).geometry?.dispose();
    }
    p.mesh.add(fig);
  }

  private addPiece(spec: PieceSpec): void {
    const g = new Group();
    const lathe = (pts: number[][], mat: Material) => {
      const m = new Mesh(new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), 28), mat);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // The narrator's own piece is black glass with a red band; yours is old ivory with a blue band, a companion's the same with a green one.
    const mats =
      spec.kind === "narrator"
        ? {
            body: new MeshPhysicalMaterial({ color: 0x17141c, roughness: 0.24, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.14 }),
            band: new MeshStandardMaterial({ color: 0x7a1410, roughness: 0.4, emissive: new Color(0x5a0806), emissiveIntensity: 0.25 }),
          }
        : {
            body: new MeshPhysicalMaterial({ color: 0xe6d9ba, roughness: 0.34, clearcoat: 0.4, clearcoatRoughness: 0.4 }),
            band: new MeshStandardMaterial({ color: spec.kind === "player" ? 0x244a9a : 0x2c6a3a, roughness: 0.35 }),
          };
    if (spec.kind === "narrator") {
      // Until the carved figure loads (or if it never does): a dark turned shape.
      lathe([[0, 0], [0.021, 0], [0.022, 0.004], [0.017, 0.01], [0.0105, 0.03], [0.0135, 0.058], [0.0095, 0.068], [0.0118, 0.08], [0.0085, 0.092], [0, 0.104]], mats.body);
      const band = new Mesh(new TorusGeometry(0.0128, 0.0016, 8, 28), mats.band);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.06;
      g.add(band);
    } else {
      // A turned figure in old ivory: yours has a blue band, a companion's a green one.
      const s = spec.kind === "player" ? 1 : 0.86;
      lathe(
        [[0, 0], [0.02, 0], [0.021, 0.004], [0.018, 0.009], [0.011, 0.014], [0.0078, 0.034], [0.0095, 0.05], [0.006, 0.056], [0.0112, 0.062], [0.006, 0.067], [0.0098, 0.072], [0.0116, 0.079], [0.0098, 0.086], [0.005, 0.0905], [0, 0.0915]].map(([r, y]) => [r * s, y * s]),
        mats.body,
      );
      const band = new Mesh(new TorusGeometry(0.0108 * s, 0.0016, 8, 28), mats.band);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.062 * s;
      g.add(band);
    }
    this.scene.add(g);
    this.pieces.set(spec.id, { mesh: g, mats, kind: spec.kind, height: spec.kind === "narrator" ? 0.104 : spec.kind === "player" ? 0.0915 : 0.079, at: spec.at, move: null });
  }

  /** Where a piece stands at its stop: pieces sharing a stop stand side by side. */
  private standAt(id: string): Vector3 {
    const me = this.pieces.get(id)!;
    const here = [...this.pieces.entries()].filter(([, p]) => p.at === me.at).map(([k]) => k);
    const i = here.indexOf(id);
    const base = this.stops.get(me.at) ?? V(0, MAP_Y, MAP_Z);
    return base.clone().add(V((i - (here.length - 1) / 2) * 0.05, 0, 0));
  }

  private settlePieces(): void {
    for (const [id, p] of this.pieces) if (!p.move) p.mesh.position.copy(this.standAt(id));
  }

  /* ------------------------------- handle ------------------------------- */

  setClock(hour: number): void {
    this.hour = wrapHour(hour);
  }

  setWeather(weather: Weather): void {
    this.airTarget = { ...(WEATHERS[weather] ?? WEATHERS.clear) };
    if (this.reduced) this.air = { ...this.airTarget };
  }

  get leaning(): boolean {
    return this.leanTarget > 0.5;
  }

  lean(over: boolean): void {
    if (this.leaning === over) return;
    this.leanTarget = over ? 1 : 0;
    if (this.reduced) this.leanK = this.leanTarget;
    this.opts.onLean?.(over);
  }

  offerDie(value: number): Promise<void> {
    if (this.grab || this.die.rolling) return Promise.resolve();
    this.lean(false);
    return new Promise<void>((done) => {
      this.grab = { phase: this.reduced ? "hold" : "reach", t0: this.t, value, done, from: this.handAt.clone() };
      this.hand.open = 0;
      this.hand.group.visible = true;
      this.readUntil = -1;
      // A die is taken from the box: the one on the table from the last roll goes back first.
      this.scene.attach(this.die.mesh);
      this.die.place(BOX.clone().add(V(-0.02, 0.012 + DIE_REST, 0.01)));
      if (this.reduced) {
        this.handAt.set(0.06, -0.085, -HAND_D);
        this.takeDie();
      }
    });
  }

  get holding(): boolean {
    return this.grab?.phase === "hold";
  }

  releaseDie(): void {
    const g = this.grab;
    if (!g || g.phase !== "hold") return;
    g.phase = "throw";
    g.t0 = this.t;
    g.from.copy(this.handAt);
    this.hand.open = 1;
    const from = this.die.mesh.getWorldPosition(V(0, 0, 0));
    this.scene.attach(this.die.mesh);
    this.die.inHand(null);
    this.die.glow = 0;
    if (this.reduced) {
      this.hand.group.visible = false;
      this.grab = null;
    }
    void this.rollDie(g.value, from).then(g.done);
  }

  /** The die goes from the box into the hollow of the hand. */
  private takeDie(): void {
    this.hand.palm.add(this.die.mesh);
    this.die.mesh.position.set(0, 0, 0);
    this.die.inHand(PlayerHand.ORDER + 1);
    this.die.glow = 0.4;
  }

  rollDie(value: number, from = V(0.98, 0.14, 0.42)): Promise<void> {
    const to = DIE_AT.clone();
    // The numeral is turned to be read from where you lean to read it.
    const read = to.clone().sub(READ_EYE);
    this.narrator.watch(this.die.mesh.position, 3.2, this.t);
    this.readUntil = -1;
    this.readLook.copy(from).setY(MAP_Y);
    return this.die.throw(value, from, to, read, this.t, this.reduced).then(() => {
      this.die.glow = 0.22;
      // The narrator has an opinion about the number.
      this.narrator.mood(value <= 5 ? "narrow" : value >= 17 ? "wide" : "player", 2.2, this.t);
    });
  }

  settled(): Promise<void> {
    return new Promise<void>((done) => this.satBack.push(done));
  }

  setMap(map: MapSheet): void {
    this.opts = { ...this.opts, map };
    const mat = this.mapMesh.material as MeshStandardMaterial;
    const old = mat.map;
    mat.map = this.tex(drawMapSheet(map));
    mat.needsUpdate = true;
    old?.dispose();
    // The same Map the desk reads, changed in place.
    for (const s of map.stops) {
      const q = stopOnSheet(s.u, s.v);
      this.stops.set(s.id, V((q.u - 0.5) * MAP_W, MAP_Y, MAP_Z + (q.v - 0.5) * MAP_H));
    }
  }

  theatre(on: boolean): void {
    this.mapMesh.visible = !on;
    for (const p of this.pieces.values()) p.mesh.visible = !on;
  }

  notch(hours: readonly number[]): void {
    // The tall candle in the brass stick is the one the narrator cuts.
    this.candles[3]?.notch(hours.map((h) => (wrapHour(h) >= 7 && wrapHour(h) < 18.25 ? -1 : candleBurn(h))), this.notchMat);
  }

  blackCandle(c: { burned: number; lit: boolean } | null): void {
    if (!this.black) return;
    this.black.group.visible = !!c;
    if (!c) return;
    this.blackBurn = Math.max(0, Math.min(1, c.burned / 6));
    if (c.lit) this.blackLit = 1;
  }

  inkPlace(name: string): void {
    const map = this.opts.map;
    if (!map || map.inked?.includes(name)) return;
    this.setMap({ ...map, inked: [...(map.inked ?? []), name] });
  }

  movePiece(id: string, stopId: string): Promise<void> {
    const p = this.pieces.get(id);
    if (!p || !this.stops.has(stopId)) return Promise.resolve();
    if (p.move) {
      // Already on its way somewhere: finish that at once, so nothing is left hanging.
      const old = p.move;
      if (old.arm !== undefined && old.phase !== "wait") this.narrator.reach(old.arm, null);
      p.move = null;
      old.done();
    }
    p.at = stopId;
    const to = this.standAt(id);
    if (this.reduced) {
      this.settlePieces();
      return Promise.resolve();
    }
    this.narrator.watch(p.mesh.position, 2.6, this.t);
    return new Promise<void>((done) => {
      const from = p.mesh.position.clone();
      const dur = 0.55 + from.distanceTo(to) * 1.6;
      // The narrator moves its own pieces by hand (if that hand is free). Yours and your companions' step by themselves.
      const arm = this.narrator.armFor(from.clone().lerp(to, 0.5));
      const free = !this.tending.some((j) => j.arm === arm) && ![...this.pieces.values()].some((q) => q.move?.arm === arm);
      // A hand that is dealing or laying something down finishes that first, and then comes for the piece.
      const byHand = p.kind === "narrator" && free;
      const waits = byHand && this.narrator.busy(arm);
      p.move = byHand ? { t0: this.t, dur: dur + 0.25, from, to, done, arm, phase: waits ? "wait" : "reach" } : { t0: this.t, dur, from, to, done };
      // The hand is spoken for from this moment, so nothing else sends it elsewhere before the frame is out.
      if (byHand && !waits) this.narrator.reach(arm, V(from.x, from.y + p.height - 0.016, from.z));
    }).then(() => this.settlePieces());
  }

  gesture(name: Gesture): boolean {
    if (name === "slam") this.narrator.mood("narrow", 3.6, this.t);
    return !this.reduced && this.narrator.gesture(name);
  }

  stats(): RoomStats {
    return { fps: Math.round(1000 / Math.max(1, this.governor.frameMs)), quality: this.quality, buffer: [this.post.bufferSize.x, this.post.bufferSize.y] };
  }

  benchmark(frames = 60): number {
    const gl = this.renderer.getContext();
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      this.post.render(this.scene, this.camera);
      gl.finish();
    }
    return (performance.now() - t0) / frames;
  }

  dispose(): void {
    this.disposed = true;
    sound.hush();
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.canvas.removeEventListener("pointermove", this.onPointer);
    this.canvas.removeEventListener("click", this.onClick);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.scene.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      const mat = m.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    for (const t of this.textures) t.dispose();
    for (const d of this.snowDrift) d.dispose();
    for (const r of this.rain) r.dispose();
    for (const lv of this.leaves) lv.drift.dispose();
    for (const c of this.candles) c.dispose();
    this.black?.dispose();
    this.blackKit?.dispose();
    this.notchMat.dispose();
    this.heldGeo?.dispose();
    this.kit.dispose();
    this.mist.dispose();
    this.dust.dispose();
    this.breath.dispose();
    this.narrator.dispose();
    this.hand.dispose();
    this.desk.dispose();
    this.die.dispose();
    this.env?.dispose();
    this.post.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  /* ------------------------------- events ------------------------------- */

  private onPointer = (e: PointerEvent): void => {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = ((e.clientY - r.top) / r.height) * 2 - 1;
    // How hard the pointer is being moved: it rattles the die in the hand.
    this.shakeIn += Math.hypot(x - this.pointer.x, y - this.pointer.y);
    this.rock += (x - this.pointer.x) * 2.2;
    this.pointer.set(x, y);
    this.canvas.style.cursor = !this.grab && this.desk.hot(e) ? "pointer" : "";
  };

  /** Click the lower half of the view (the table) to lean in; click again to sit back. */
  private onClick = (e: MouseEvent): void => {
    if (this.grab) {
      // With the die in hand, a click lets it go.
      this.releaseDie();
      return;
    }
    // The notebook, the pages and the dice box come before leaning in over the map.
    if (this.desk.click(e)) return;
    const r = this.canvas.getBoundingClientRect();
    if (this.leaning || (e.clientY - r.top) / r.height > 0.45) this.lean(!this.leaning);
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.desk.mode === "reading") void this.desk.leaf(e.deltaY > 0 ? 1 : -1);
    else if (!this.grab && this.desk.mode === "idle" && Math.abs(e.deltaY) > 4) this.lean(e.deltaY < 0);
  };

  private onLost = (e: Event): void => {
    e.preventDefault();
    console.warn("tallow: the graphics context was lost; the room is paused until it returns.");
  };

  private resize(): void {
    const w = Math.max(2, this.host.clientWidth), h = Math.max(2, this.host.clientHeight);
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.renderer.setSize(Math.round(w * dpr), Math.round(h * dpr), false);
    // Whole screen pixels per drawn pixel, so the chunky picture stays even.
    const lines = QUALITY[this.quality]!.lines;
    const usual = Math.max(1, Math.round((h * dpr) / lines));
    // With a page up to be read, twice the lines (which on most screens is every pixel there is).
    const px = this.fine ? Math.max(1, Math.round((h * dpr) / (lines * 2))) : usual;
    this.post.resize((w * dpr) / px, (h * dpr) / px, usual / px);
    this.camera.aspect = w / h;
    // A tall, narrow view (a phone held upright) needs a wider lens to keep the table in frame.
    this.baseFov = w / h < 0.6 ? 72 : w / h < 0.8 ? 68 : w / h < 1 ? 60 : w / h < 1.3 ? 50 : SEAT.fov;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  /** Set the room up for its step of quality: how many pixels, which shadows, whether the small things in the air are drawn. */
  private applyQuality(): void {
    const q = QUALITY[this.quality]!;
    this.candleLight.castShadow = q.candleShadows;
    if (this.sun.shadow.mapSize.x !== q.sunShadow) {
      this.sun.shadow.mapSize.set(q.sunShadow, q.sunShadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }

  /** Drop a step of quality: fewer drawn pixels first, then cheaper shadows. */
  private degrade(): void {
    if (this.quality >= QUALITY.length - 1) return;
    this.quality++;
    this.applyQuality();
  }

  /* -------------------------------- frame ------------------------------- */

  private frame = (ms: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    // Up to a quarter of a second at a time: a machine that only manages a few frames a second still keeps the
    // room's own pace (a throw takes as long as it should), and a page woken from the background does not lurch.
    const dt = Math.min(0.25, this.last ? (ms - this.last) / 1000 : 0.016);
    // Frames drawn while the page is in the background say nothing about how fast the machine is.
    if (this.last && document.visibilityState === "visible" && this.governor.note(ms - this.last)) {
      // Too slow while drawing finely for a page: give that up, and leave the room's own quality as it was.
      if (this.fine) this.fineOk = false;
      else this.degrade();
    }
    this.last = ms;
    if (!this.paused) this.step(dt);
  };

  /** Move the room on by `dt` seconds and draw it. */
  private step(dt: number): void {
    this.t += dt;
    const t = this.t;

    // The weather slides from what it was to what it is to be.
    for (const key of Object.keys(this.air) as (keyof Air)[]) {
      const d = this.airTarget[key] - this.air[key];
      const stepBy = dt * 0.45;
      this.air[key] = Math.abs(d) <= stepBy ? this.airTarget[key] : this.air[key] + Math.sign(d) * stepBy;
    }
    const L = (this.state = daylight(this.hour, this.air));
    this.light(L, t, dt);
    sound.room(dt, this.air, this.candleLevel, this.hour >= 20.5 || this.hour < 5.5, this.flash);
    // The narrator's hands first, then the table: whatever is in a hand is put where the fingers are in this frame,
    // not where they were in the last one (a frame behind is a finger's width at the speed a hand deals).
    this.narrator.update(t, this.camera, dt);
    this.animate(t, dt, L);
    this.aim(t, dt, L);
    // A fist on the table: felt for a moment, then gone.
    const struck = this.narrator.takeImpact();
    if (struck) sound.play("slam", { x: -0.1 });
    if (struck && !this.reduced) this.jolt = 1;
    else if (this.jolt) this.jolt = this.jolt < 0.004 ? 0 : this.jolt * Math.exp(-dt / 0.2);
    // A page in your hands: the picture is drawn finer and plainer for as long as it is up, so it can be read.
    const reading = this.desk.pageUp;
    if (this.fine !== (reading && this.fineOk)) {
      this.fine = reading && this.fineOk;
      this.resize();
    }
    this.clear = this.reduced ? +reading : Math.max(0, Math.min(1, this.clear + (reading ? dt : -dt) * 4));
    const haze = this.scene.fog!.color;
    this.post.set({ time: t, exposure: L.exposure * 1.08, cold: L.cold, still: this.reduced, haze: [haze.r, haze.g, haze.b], hazeK: L.fog * 0.1, clear: this.clear });
    this.post.render(this.scene, this.camera);
  }

  /** Look at the room from somewhere else (for close pictures of one thing); null gives the view back to the player. */
  lookFrom(eye: [number, number, number] | null, look: [number, number, number] = [0, 0, 0], fov = 30): void {
    this.spy = eye ? { eye: V(...eye), look: V(...look), fov } : null;
    if (!eye) {
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  advance(seconds: number): void {
    for (let left = seconds; left > 0; left -= 1 / 60) this.step(Math.min(left, 1 / 60));
  }

  /** Set every light in the room from the hour and the weather. */
  private light(L: LightState, t: number, dt: number): void {
    const dir = V(L.sunDir[0], L.sunDir[1], L.sunDir[2]);
    this.sun.color.setRGB(L.sunColor[0], L.sunColor[1], L.sunColor[2], SRGBColorSpace);
    let sunI = L.sunIntensity;
    let shaft = L.shaft;

    // Lightning: for an instant the only light is a hard blue-white from behind the narrator, so the leading of the
    // back window is thrown down the table toward you.
    const strike = L.storm > 0.05 && !this.reduced ? this.lightning.flash(t) : null;
    const flash = (this.flash = strike ? strike.k * L.storm : 0);
    if (strike && flash > 0.01) {
      const k = Math.min(1, flash * 4);
      dir.lerp(this.tmpV.set(strike.side * 0.45, 0.5, -1).normalize(), k).normalize();
      this.sun.color.lerp(this.tmpColor.setRGB(0.72, 0.82, 1), k);
      sunI += flash * 9;
      shaft = Math.max(shaft, flash);
    }
    const travel = dir.clone().negate();
    this.sun.intensity = sunI;
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 11);

    // Indoors, the sky only reaches the room through two windows.
    this.hemi.color.setRGB(L.ambientSky[0], L.ambientSky[1], L.ambientSky[2], SRGBColorSpace).lerp(this.tmpColor.setRGB(0.72, 0.82, 1), Math.min(1, flash));
    this.hemi.groundColor.setRGB(L.ambientGround[0], L.ambientGround[1], L.ambientGround[2], SRGBColorSpace);
    this.hemi.intensity = L.ambientIntensity * 0.34 + flash * 0.5;

    // Light that has come in and bounced off whatever it landed on: it sits over the patch of sun on the table or floor.
    const land = (wx: number, wy: number, wz: number) => {
      const s = wy / Math.max(0.2, -travel.y);
      return V(wx + travel.x * s, 0, wz + travel.z * s);
    };
    const wl = Math.max(0, travel.x), wb = Math.max(0, travel.z);
    const patch = land(LEFT.x, LEFT.y0 + LEFT.h * 0.6, LEFT.cz).multiplyScalar(wl).addScaledVector(land(BACK.cx, BACK.y0 + BACK.h * 0.6, BACK.z), wb).divideScalar(Math.max(0.001, wl + wb));
    this.bounce.color.copy(this.sun.color).multiply(this.tmpColor.setRGB(1, 0.82, 0.62));
    this.bounce.intensity = sunI * 0.5 * Math.min(1, wl + wb);
    // Well above the table, so it fills the room without burning out whatever stands under it.
    this.bounce.position.set(Math.max(-1.7, Math.min(1.4, patch.x)), 1.05, Math.max(-2, Math.min(1, patch.z)));
    this.scene.environmentIntensity = 0.12 + L.ambientIntensity * 0.3;

    const sky = this.sky.uniforms;
    const glare = this.tmpColor.setRGB(0.5, 0.6, 0.85).multiplyScalar(flash * 1.6);
    (sky.uTop!.value as Color).setRGB(L.skyTop[0], L.skyTop[1], L.skyTop[2], SRGBColorSpace).multiplyScalar(1.5).add(glare);
    (sky.uHorizon!.value as Color).setRGB(L.skyHorizon[0], L.skyHorizon[1], L.skyHorizon[2], SRGBColorSpace).multiplyScalar(1.8).add(glare);
    (sky.uSunColor!.value as Color).copy(this.sun.color);
    (sky.uSunDir!.value as Vector3).set(L.sunDir[0], L.sunDir[1], L.sunDir[2]);
    // Under snow, rain or fog the disc of the sun is not seen at all.
    sky.uSun!.value = (L.moon ? 0.5 : 1) * Math.min(1.4, L.sunIntensity / 2.6) * (1 - L.cold * 0.85) * (1 - L.wet * 0.9) * (1 - L.fog * 0.8);

    for (const s of this.shafts) {
      const through = Math.max(0, travel.dot(s.normal));
      (s.mat.uniforms.uDir!.value as Vector3).copy(travel).multiplyScalar(4.2);
      s.mat.uniforms.uTime!.value = this.reduced ? 0 : t;
      (s.mat.uniforms.uColor!.value as Color).copy(this.sun.color);
      s.mat.uniforms.uStrength!.value = shaft * Math.sqrt(through) * Math.min(1, sunI * 3) * (0.3 + 0.7 * Math.min(1, sunI / 3)) * 0.085;
    }

    // Candles come up as the room darkens.
    this.candleLevel += (L.candle - this.candleLevel) * (this.reduced ? 1 : Math.min(1, dt * 1.6));
    const motes = QUALITY[this.quality]!.motes;
    const lit = Math.min(1, shaft * Math.min(1, sunI) + this.candleLevel * 0.25);
    if (!this.reduced) this.dust.advance(dt, this.tmpV.set(0.05, 0, 0.012).multiplyScalar(L.wind));
    this.dust.set(this.reduced ? 0 : t, motes ? lit * 0.5 : 0, this.tmpColor.copy(this.sun.color).lerp(this.tmpColor2.setRGB(1, 0.6, 0.3), this.candleLevel * 0.5), this.post.bufferSize.y);

    // The colder it is, the more the glass frosts at its edges.
    for (const f of this.frost) {
      f.mesh.visible = L.cold > 0.01;
      f.mat.opacity = L.cold * 0.62;
      f.mat.color.copy(sky.uHorizon!.value as Color).multiplyScalar(0.55).addScalar(0.08);
    }

    this.weather(L, t, dt);
    this.tendCandles(t, dt, L);

    // The eyes show most in the dark.
    this.narrator.glow = 0.62 + 0.38 * (1 - Math.min(1, L.ambientIntensity));
    // The edge of its cloth catches what light the room has: the sky's by day, the candles' by night.
    this.narrator.rim.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 0.3).add(this.tmpColor.setRGB(1, 0.5, 0.2).multiplyScalar(this.candleLevel * 0.02));
  }

  /** Everything the weather does that can be seen: what passes the windows, what is on the glass, what comes into the room. */
  private weather(L: LightState, t: number, dt: number): void {
    const horizon = this.sky.uniforms.uHorizon!.value as Color;
    const still = this.reduced;
    const h = this.post.bufferSize.y;
    const push = this.windVec;
    // The wind comes in gusts: it never blows evenly.
    const gust = still ? 0.6 : 0.62 + 0.38 * Math.sin(t * 0.71) * Math.sin(t * 0.23 + 1.3);
    const burst = still ? 0 : Math.max(0, Math.sin(t * 0.9 + 0.4) * Math.sin(t * 0.37 + 2));
    const wind = L.wind * gust;

    // The tree line: a dark band the snow and rain show up against. In fog it goes into the grey.
    for (const tr of this.trees) {
      tr.mat.color.copy(horizon).multiplyScalar(0.06 + L.cold * 0.1).lerp(horizon, L.fog * 0.93);
      tr.mat.opacity = 1 - 0.7 * L.fog;
    }

    // Snow: pale flakes, slanted by the wind. The ones against the glass catch the candlelight.
    const flake = this.tmpColor.copy(horizon).multiplyScalar(0.4).addScalar(0.06 + 0.75 * Math.min(1, L.ambientIntensity));
    this.snowDrift.forEach((d, i) => {
      if (!still) d.advance(dt, push.set(i === 1 ? 0.3 : 3.4, 0, i === 1 ? 3.4 : 0.3).multiplyScalar(wind));
      if (i === 2) flake.lerp(this.tmpColor2.setRGB(1, 0.72, 0.45), this.candleLevel * 0.45);
      d.set(still ? 0 : t, L.cold, flake, h);
    });
    for (const b of this.banks) {
      b.visible = L.cold > 0.02;
      b.scale.y = 0.15 + 0.85 * L.cold;
      (b.material as MeshBasicMaterial).color.copy(horizon).multiplyScalar(0.5).addScalar(0.04 + 0.5 * Math.min(1, L.ambientIntensity));
    }

    // Rain: streaks past the windows, and beads that creep down the glass.
    const streak = this.tmpColor.copy(horizon).multiplyScalar(0.4).add(this.tmpColor2.setRGB(0.16, 0.12, 0.08).multiplyScalar(this.candleLevel)).addScalar(this.flash * 0.5);
    this.rain.forEach((r, i) => {
      if (!still) r.advance(dt, push.set(i === 1 ? 0.3 : 5, 0, i === 1 ? 5 : 0.3).multiplyScalar(wind));
      r.set(L.wet * 1.3, streak);
    });
    if (!still) this.glassTex.offset.y = (this.glassTex.offset.y + dt * 0.016 * (0.4 + L.wet)) % 1;
    for (const pane of this.glass) {
      const m = pane.material as MeshBasicMaterial;
      pane.visible = L.wet > 0.02;
      m.opacity = L.wet * 0.36;
      m.color.copy(horizon).multiplyScalar(0.9).addScalar(0.1 + this.flash);
    }

    // Wind: leaves and grit go by, and the flames lean away from the left window.
    const leafK = Math.max(0, Math.min(1, (L.wind - 0.3) / 0.5));
    const leaf = this.tmpColor.copy(horizon).multiplyScalar(0.07).add(this.tmpColor2.setRGB(0.03, 0.02, 0.012));
    for (const lv of this.leaves) {
      if (!still) lv.drift.advance(dt, push.copy(lv.push).multiplyScalar(0.25 + gust));
      lv.drift.set(still ? 0 : t, leafK * 1.6, leaf, h);
    }
    // Thunder shakes the room a moment after the flash.
    this.rumble = Math.max(still || L.storm < 0.05 ? 0 : this.lightning.rumble(t) * L.storm, this.jolt);
    const want = still ? L.wind * 0.3 : L.wind * (0.18 + 0.82 * burst) * 0.9 + this.rumble * 0.25 * Math.sin(t * 37) + this.jolt * 0.55 * Math.sin(t * 29);
    this.draught += (want - this.draught) * Math.min(1, dt * 5);
    this.flutter(still ? 0 : L.wind * (0.3 + 0.7 * burst), t);

    // Fog: the room itself greys with distance, and wisps of it cross the far end of the table.
    const fog = this.scene.fog as FogExp2;
    fog.color.copy(horizon).multiplyScalar(0.5);
    fog.density = L.fog * 0.16;
    this.mist.update(t, QUALITY[this.quality]!.motes ? L.fog : 0, this.tmpColor.copy(horizon).multiplyScalar(0.55).addScalar(0.04 + this.candleLevel * 0.05), still);
  }

  /** The wind gets under the corner of the map nearest the left window and lifts it. */
  private flutter(k: number, t: number): void {
    const geo = this.mapMesh.geometry;
    const p = geo.attributes.position!;
    const flat = this.mapFlat;
    if (k < 0.02) {
      if (!this.mapLifted) return;
      (p.array as Float32Array).set(flat);
      this.mapLifted = false;
    } else {
      for (let i = 0; i < p.count; i++) {
        const x = flat[i * 3]! / (MAP_W / 2), z = flat[i * 3 + 2]! / (MAP_H / 2);
        const w = Math.max(0, (-x - 0.5) / 0.5) * Math.max(0, (z - 0.2) / 0.8);
        if (w <= 0) continue;
        p.setY(i, flat[i * 3 + 1]! + w * w * k * 0.05 * (0.62 + 0.38 * Math.sin(t * 9 + x * 6 + z * 4)));
      }
      this.mapLifted = true;
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  }

  /**
   * How far burnt the candles on the table should be. By the clock they are new in the evening and stubs by morning,
   * and the cold stubs stand all day. If the weather makes the day dark enough to want them, new ones are set out
   * early and wait, hardly burning, for the evening.
   */
  private candleTarget(L: LightState): number {
    const night = L.burn < 1;
    if (night) this.dayCandles = false;
    else if (L.candle >= GLOOM) this.dayCandles = true;
    return night ? L.burn : this.dayCandles ? 0 : 1;
  }

  /** The candles: their wax and flames, the light they give, and the narrator setting out new ones when they are due. */
  private tendCandles(t: number, dt: number, L: LightState): void {
    const target = this.candleTarget(L);
    if (!this.tending.length && this.wax.some((w) => w.burn - target > 0.1)) {
      const handsFull = [...this.pieces.values()].some((p) => p.move?.arm !== undefined);
      if (this.reduced) for (const w of this.wax) w.burn = target;
      else if (!handsFull) {
        // New candles are due. One hand sees to each side of the table.
        const byArm = new Map<number, number[]>();
        this.feet.forEach((foot, i) => {
          const arm = this.narrator.armFor(foot);
          byArm.set(arm, [...(byArm.get(arm) ?? []), i]);
        });
        this.heldGeo ??= new CylinderGeometry(1, 1.04, 1, 20).translate(0, 0.5, 0);
        for (const [arm, queue] of byArm) {
          const held = new Mesh(this.heldGeo, this.kit.wax);
          held.castShadow = true;
          held.visible = false;
          this.scene.add(held);
          this.tending.push({ arm, queue, phase: "fetch", t0: t, held });
        }
        this.narrator.watch(V(-0.7, 0.16, -0.46), 8, t);
      }
    }

    for (const job of this.tending) {
      const i = job.queue[0]!;
      const c = this.candles[i]!, w = this.wax[i]!, foot = this.feet[i]!;
      const u = t - job.t0;
      const tall = c.heightAt(target);
      /** Send the hand somewhere; returns how far its fingertips still are from it. */
      const go = (x: number, y: number, z: number) => {
        const p = V(x, y, z);
        this.narrator.reach(job.arm, p);
        return this.narrator.fingertips(job.arm).distanceTo(p);
      };
      // The hand holds a new candle by its top, the fingers this far below the rim.
      const hold = tall - 0.014;
      const next = (phase: Tend["phase"]) => {
        job.phase = phase;
        job.t0 = t;
      };
      if (job.phase === "fetch") {
        // Back into the cloak for a new candle.
        const from = this.narrator.sleeve(job.arm);
        if ((go(from.x, from.y, from.z) < 0.03 && u > 0.35) || u > 1.6) {
          job.held.scale.set(c.radius, tall, c.radius);
          job.held.visible = true;
          this.narrator.close(job.arm, "grasp");
          this.narrator.carry(job.arm, job.held, { offset: V(0, -hold, 0), snap: true });
          next("carry");
        }
      } else if (job.phase === "carry" || job.phase === "set") {
        // Out over the old stub, then down: the new candle is stood in what is left of the old one.
        const over = job.phase === "carry";
        const d = go(foot.x, foot.y + hold + (over ? 0.11 : 0), foot.z);
        if (over ? d < 0.04 || u > 1.8 : d < 0.002 || u > 1) {
          if (over) next("set");
          else {
            // It stands. The candle in the hand becomes the candle on the table, in the same place.
            this.narrator.carry(job.arm, null);
            job.held.visible = false;
            w.burn = target;
            w.lit = 0;
            this.narrator.release(job.arm);
            next("letgo");
          }
        }
      } else if (job.phase === "letgo") {
        // The fingers come away from it.
        go(foot.x, foot.y + hold, foot.z);
        if (this.narrator.gripped(job.arm) <= 0 || u > 1) {
          this.narrator.strike(job.arm);
          next("light");
        }
      } else if (job.phase === "light") {
        // Finger and thumb close on the wick.
        go(foot.x, foot.y + tall + 0.01, foot.z);
        if (u > this.narrator.sparkAfter) {
          sound.play("strike", { x: foot.x, gain: 0.7 });
          next("flare");
        }
      } else {
        // The fingers spring away and it takes, tall for a moment before it settles.
        go(foot.x, foot.y + tall + 0.085, foot.z - 0.04);
        w.lit = Math.min(1, u / 0.08) * (1 + 0.8 * Math.exp(-u * 7));
        if (u > 0.5) {
          w.lit = 1;
          job.queue.shift();
          if (job.queue.length) next("fetch");
          else {
            this.narrator.reach(job.arm, null);
            this.scene.remove(job.held);
          }
        }
      }
    }
    this.tending = this.tending.filter((j) => j.queue.length);

    // Candles the hand is not at keep time by the clock. A stub that has burnt right down is out.
    const waiting = new Set(this.tending.flatMap((j) => j.queue));
    const lv = this.candleLevel;
    let glowing = 0;
    this.candles.forEach((c, i) => {
      const w = this.wax[i]!;
      if (!waiting.has(i)) {
        w.burn = target;
        w.lit += ((target < 0.999 ? 1 : 0) - w.lit) * (this.reduced ? 1 : Math.min(1, dt * 2.5));
      }
      glowing += Math.min(1, w.lit) / this.candles.length;
      // By day a flame is small and gives no glow to speak of; in the dark it is the light of the room.
      c.update(t, { level: w.lit * (0.62 + 0.38 * lv), glow: w.lit * (0.2 + 0.8 * lv), burn: w.burn, draught: this.draught, still: this.reduced });
    });
    if (this.black?.group.visible) {
      // Lit only while the big bad takes a step: it burns a while, then the narrator pinches it out.
      this.blackLit = Math.max(0, this.blackLit - dt / 9);
      this.black.update(t, { level: this.blackLit, glow: this.blackLit, burn: this.blackBurn, draught: this.draught, still: this.reduced });
    }
    this.kit.wax.emissiveIntensity = glowing * (0.2 + 0.8 * lv) * 0.6;
    this.kit.rim.emissiveIntensity = glowing * (0.2 + 0.8 * lv) * 0.55;

    // The light they give: the cluster throws the shadows, the single candle fills from the other side.
    const cluster = Math.min(1.3, (this.wax[0]!.lit + this.wax[1]!.lit + this.wax[2]!.lit) / 3);
    const single = Math.min(1.3, this.wax[3]!.lit);
    const lean = 1 - 0.3 * Math.min(1, Math.abs(this.draught));
    const flick = this.reduced ? 1 : 0.86 + 0.09 * Math.sin(t * 11.3) + 0.06 * Math.sin(t * 23.7 + 1.3) + 0.05 * Math.sin(t * 5.1 + 0.4);
    this.candleLight.intensity = lv * 1.5 * flick * cluster * lean;
    this.candleFill.intensity = lv * 0.7 * (this.reduced ? 1 : 0.9 + 0.1 * Math.sin(t * 9.1 + 2)) * single * lean;
    const top = Math.max(this.candles[0]!.top, this.candles[1]!.top, this.candles[2]!.top);
    const j = this.reduced ? 0 : 0.004;
    // Well above the flames and a little in front, clear of the wax, so no candle is burnt out by its neighbour's light.
    this.candleLight.position.set(-0.69 + Math.sin(t * 7.1) * j, 0.009 + top + 0.16 + Math.sin(t * 9.3) * j, -0.42 + Math.cos(t * 6.3) * j);
    this.candleFill.position.set(0.7, 0.132 + this.candles[3]!.top + 0.13, -0.39);
  }

  /** Things that move by themselves: the die, the pieces, breath in the cold. */
  private animate(t: number, dt: number, L: LightState): void {
    this.die.update(t);
    this.holdDie(t, dt, L);
    this.desk.update(t, dt, Math.min(1, 0.5 + L.ambientIntensity * 0.45 + this.candleLevel * 0.25));
    // A blow on the table: whatever stands on it jumps and rocks, and settles exactly where it stood.
    const j = this.jolt;
    const dieFree = !this.grab && !this.die.rolling && this.die.mesh.parent === this.scene;
    if (j && dieFree) {
      this.dieRest ??= this.die.mesh.position.y;
      this.die.mesh.position.y = this.dieRest + Math.abs(Math.sin(t * 47)) * 0.005 * j;
    } else if (this.dieRest !== null) {
      if (dieFree) this.die.mesh.position.y = this.dieRest;
      this.dieRest = null;
    }
    let n = 0;
    for (const p of this.pieces.values()) {
      const m = p.move;
      n++;
      if (!m && (j || this.jolted)) {
        p.mesh.position.y = MAP_Y + Math.abs(Math.sin(t * 43 + n * 1.7)) * 0.006 * j;
        p.mesh.rotation.z = Math.sin(t * 37 + n) * 0.07 * j;
        p.mesh.rotation.x = Math.sin(t * 31 + n * 2.3) * 0.05 * j;
      }
      if (!m) continue;
      if (m.arm !== undefined) {
        this.carryPiece(p, m, t);
        continue;
      }
      const u = Math.min(1, (t - m.t0) / m.dur);
      const e = ease(u);
      // Lifted, carried, set down.
      p.mesh.position.lerpVectors(m.from, m.to, e);
      p.mesh.position.y = MAP_Y + Math.sin(Math.PI * u) * 0.035 + Math.max(0, 1 - Math.abs(u - 0.5) * 4) * 0.008;
      p.mesh.rotation.z = Math.sin(Math.PI * u) * 0.08;
      if (u >= 1) {
        p.mesh.rotation.z = 0;
        p.move = null;
        sound.play("knock", { x: m.to.x, gain: 0.8 });
        m.done();
      }
    }

    this.jolted = j > 0;

    if (L.cold > 0.3) {
      const tint = this.tmpColor.setRGB(L.ambientSky[0], L.ambientSky[1], L.ambientSky[2], SRGBColorSpace).multiplyScalar(0.5 + L.ambientIntensity * 0.5).addScalar(0.1 + this.candleLevel * 0.12);
      if (t > this.breathAt) {
        // Your own breath: out and a little down, from just under the eye.
        this.breathAt = t + 3.6 + this.rnd() * 1.2;
        const fwd = this.camera.getWorldDirection(V(0, 0, 0));
        const from = this.camera.position.clone().addScaledVector(fwd, 0.22).add(V(0, -0.075, 0));
        for (let i = 0; i < 3; i++) this.breath.puff(from.clone().add(V((this.rnd() - 0.5) * 0.03, (this.rnd() - 0.5) * 0.02, 0)), fwd.clone().multiplyScalar(0.2 + i * 0.07).add(V(0, -0.02, 0)), t + i * 0.12, 0.11, 0.3 * L.cold, 2.8);
      }
      if (t > this.narratorBreathAt) {
        this.narratorBreathAt = t + 5 + this.rnd() * 2;
        const from = V(0, 0.585, NARRATOR_Z + 0.2);
        for (let i = 0; i < 2; i++) this.breath.puff(from, V((this.rnd() - 0.5) * 0.03, -0.03, 0.12 + i * 0.05), t + i * 0.15, 0.2, 0.3 * L.cold, 3);
      }
      this.breath.update(t, dt, tint, this.reduced);
    } else this.breath.update(t, dt, this.tmpColor.setRGB(0.5, 0.5, 0.5), this.reduced);
  }

  /**
   * The narrator moves its own piece: the hand comes out to it, the fingers close on its head, it is lifted, carried
   * over and set down, and the fingers come away. Each step waits on the hand, not on a clock.
   */
  private carryPiece(p: Piece, m: NonNullable<Piece["move"]>, t: number): void {
    const arm = m.arm!;
    const hand = this.narrator;
    // The fingers close round the middle of the head, a little under its top.
    const head = p.height - 0.016;
    const u = t - m.t0;
    if (m.phase === "wait") {
      if (!hand.busy(arm) || u > 8) {
        m.phase = "reach";
        m.t0 = t;
      }
    } else if (m.phase === "reach") {
      const at = V(m.from.x, m.from.y + head, m.from.z);
      hand.reach(arm, at);
      if ((hand.fingertips(arm).distanceTo(at) < 0.003 && hand.reached(arm) > 0.97) || u > 2.4) {
        hand.close(arm, "pinch");
        m.phase = "pinch";
        m.t0 = t;
      }
    } else if (m.phase === "pinch") {
      if (hand.gripped(arm) >= 1 || u > 1) {
        // The piece hangs from the fingers that hold it.
        hand.carry(arm, p.mesh, { offset: V(0, -head, 0), floor: MAP_Y });
        m.phase = "carry";
        m.t0 = t;
      }
    } else if (m.phase === "carry") {
      const k = Math.min(1, u / m.dur);
      const at = m.from.clone().lerp(m.to, ease(k));
      at.y = MAP_Y + Math.sin(Math.PI * k) * 0.05;
      hand.reach(arm, V(at.x, at.y + head, at.z));
      if (k >= 1 && (p.mesh.position.distanceTo(m.to) < 0.0008 || u > m.dur + 0.9)) {
        hand.carry(arm, null);
        p.mesh.position.copy(m.to);
        sound.play("knock", { x: m.to.x });
        hand.release(arm);
        m.phase = "release";
        m.t0 = t;
      }
    } else if (hand.gripped(arm) <= 0 || u > 1.2) {
      // The fingers are off it: the hand goes home.
      p.move = null;
      hand.reach(arm, null);
      m.done();
    }
  }

  /** Your hand and the die in it: reaching into the box, held and rattled by the pointer, flung open to throw. */
  private holdDie(t: number, dt: number, L: LightState): void {
    const g = this.grab;
    this.boxK += ((g && g.phase !== "throw" && !this.reduced ? 1 : 0) - this.boxK) * Math.min(1, dt * 3.2);
    // How fast the pointer has been going over the last sixth of a second, in widths of the view a second. Measured
    // over a moment rather than a frame, so it is the same at any frame rate and with a pointer that reports less
    // often than the screen draws. An easy back-and-forth of the mouse is a full shake.
    this.shakeRun = this.shakeRun * Math.exp(-dt / 0.16) + this.shakeIn;
    this.shake += (Math.min(1, (this.shakeRun / 0.16) * 0.3) - this.shake) * Math.min(1, dt * 8);
    this.shakeIn = 0;
    this.rock *= Math.max(0, 1 - dt * 6);
    if (!g) return;
    const off = V(0.2, -0.36, -HAND_D);
    const hold = V(0.06 + this.pointer.x * 0.1, -0.085 - this.pointer.y * 0.045, -HAND_D);
    if (g.phase === "reach") {
      // Down to the box, close on a die, and up again.
      const u = (t - g.t0) / 1.3;
      const box = this.camera.worldToLocal(BOX.clone().add(V(-0.02, 0.03, 0.01)));
      box.multiplyScalar(HAND_D / -box.z).sub(V(this.hand.palm.position.x, this.hand.palm.position.y, 0));
      if (u < 0.55) this.handAt.lerpVectors(off, box, ease(Math.max(0, u / 0.55)));
      else {
        if (this.die.mesh.parent !== this.hand.palm) this.takeDie();
        this.handAt.lerpVectors(box, hold, ease(Math.min(1, (u - 0.55) / 0.45)));
      }
      if (u >= 1) g.phase = "hold";
    } else if (g.phase === "hold") {
      this.handAt.lerp(hold, this.reduced ? 1 : Math.min(1, dt * 10));
      sound.shake(this.shake);
    } else {
      // Flung forward and open, then away out of sight.
      const u = (t - g.t0) / 0.75;
      const flung = g.from.clone().add(V(-0.07, 0.07, 0));
      if (u < 0.22) this.handAt.lerpVectors(g.from, flung, ease(u / 0.22));
      else this.handAt.lerpVectors(flung, off, ease(Math.min(1, (u - 0.22) / 0.78)));
      if (u >= 1) {
        this.hand.group.visible = false;
        this.grab = null;
      }
    }
    this.hand.group.position.copy(this.handAt);
    this.hand.group.rotation.z = this.reduced ? 0 : Math.max(-0.5, Math.min(0.5, -this.rock)) + Math.sin(t * 1.3) * 0.015;
    // Shaken, the fingers ease off the die so it has room to rattle.
    this.hand.loose = g.phase === "hold" ? this.shake : 0;
    if (this.die.mesh.parent === this.hand.palm && !this.reduced) {
      // The die rattles in the palm as the hand is shaken, and lies still when it is not.
      const k = this.shake;
      this.die.mesh.position.set(Math.sin(t * 31) * 0.012 * k, Math.abs(Math.sin(t * 23)) * 0.014 * k, 0);
      this.die.mesh.rotateOnAxis(V(Math.sin(t * 1.7), Math.cos(t * 2.3), Math.sin(t * 0.9)).normalize(), k * dt * 14);
    }
    this.hand.update(t, Math.min(1, 0.5 + L.ambientIntensity * 0.45 + this.candleLevel * 0.25));
  }

  /**
   * Point the camera: your seat or leaning over the map, down at the dice box while your hand is in it, in over a
   * thrown die to read it. Every move between these is eased at both ends; nothing snaps.
   */
  private aim(t: number, dt: number, L: LightState): void {
    this.leanK += (this.leanTarget - this.leanK) * Math.min(1, dt * 4.2);
    if (Math.abs(this.leanTarget - this.leanK) < 0.001) this.leanK = this.leanTarget;
    const k = ease(this.leanK);
    // The view follows the pointer softly, a little behind it.
    if (this.reduced) this.view.copy(this.pointer);
    else this.view.lerp(this.pointer, Math.min(1, dt * 6));
    // A thrown die: you lean in over where it lands, stay until you have read it, and sit back.
    // Once it stops you stay leant over it for a moment, long enough to read it.
    if (this.wasRolling && !this.die.rolling) this.readUntil = t + 2.6;
    this.wasRolling = this.die.rolling;
    const reading = this.die.rolling || t < this.readUntil;
    this.readK = this.reduced ? (reading ? 1 : 0) : Math.max(0, Math.min(1, this.readK + (reading ? 0.85 : -0.7) * dt));
    // Your eyes go with the die as it tumbles, so it never leaves the picture, and settle where it lies.
    if (this.die.rolling) this.tmpV.copy(this.die.mesh.position).setY(MAP_Y);
    else this.tmpV.copy(DIE_AT);
    if (this.reduced) this.readLook.copy(DIE_AT);
    else this.readLook.lerp(this.tmpV, Math.min(1, dt * 7));
    if (this.satBack.length && !reading && !this.grab && this.readK < 0.03) for (const done of this.satBack.splice(0)) done();
    const rk = ease(this.readK);

    const narrow = this.camera.aspect < 1;
    const eye = SEAT.eye.clone().lerp(LEAN.eye, k);
    const look = SEAT.look.clone().lerp(LEAN.look, k);
    if (narrow) {
      // On an upright screen you sit further back and higher, so the whole width of the table stays in the picture (the
      // notebook at one end, the dice box at the other) and the table, seen more from above, fills more of its height;
      // and you lean in from higher, so the whole width of the map does.
      const half = Math.tan((this.baseFov * Math.PI) / 360) * this.camera.aspect;
      eye.z += 0.4 * (1 - k);
      eye.y += 0.6 * (1 - k) + Math.max(0.3, 0.6 / half - LEAN.eye.y) * k;
    }
    const bk = ease(Math.max(0, Math.min(1, this.boxK)));
    eye.lerp(BOX_VIEW.eye, bk);
    look.lerp(BOX_VIEW.look, bk);
    eye.lerp(READ_EYE, rk);
    look.lerp(this.readLook, rk);
    // A glance at the balance while a check is weighed; and writing, in over the notebook. Neither while a die is being read.
    const g = this.desk.glance;
    const gk = ease(g.k) * (1 - rk);
    eye.lerp(g.eye, gk);
    look.lerp(g.look, gk);
    const f = this.desk.focus;
    const wk = ease(f.k) * (1 - rk);
    eye.lerp(f.eye, wk);
    look.lerp(f.look, wk);
    if (!this.reduced) {
      const free = (1 - rk * 0.75) * (1 - wk * 0.85) * (1 - gk * 0.7);
      eye.x += Math.sin(t * 0.45) * 0.006 * (1 - k);
      eye.y += Math.sin(t * 0.8) * 0.004;
      look.x += this.view.x * 0.16 * (1 - k * 0.6) * free;
      look.y -= this.view.y * 0.07 * (1 - k) * free;
      eye.x += this.view.x * 0.03 * free;
    }
    const fov = this.baseFov + (READ_FOV - this.baseFov) * rk + (g.fov - this.baseFov) * gk * (1 - wk) + (f.fov - this.baseFov) * wk;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(eye);
    this.camera.lookAt(look);
    if (!this.reduced && L.cold > 0.3) {
      // A shiver: a short tremor every few seconds.
      if (t > this.shiverAt + 0.9) this.shiverAt = t + 4.5 + this.rnd() * 5;
      const s = t - this.shiverAt;
      if (s > 0 && s < 0.9) {
        const env = Math.sin((s / 0.9) * Math.PI) * L.cold;
        this.camera.rotation.z += Math.sin(t * 61) * 0.0035 * env;
        this.camera.rotation.x += Math.sin(t * 47 + 1) * 0.0022 * env;
        this.camera.position.x += Math.sin(t * 53) * 0.0018 * env;
      }
    }
    if (this.rumble > 0.01) {
      // Thunder, felt through the floor.
      this.camera.position.y += Math.sin(t * 41) * 0.003 * this.rumble;
      this.camera.rotation.z += Math.sin(t * 33 + 1) * 0.0025 * this.rumble;
    }
    if (this.spy) {
      this.camera.position.copy(this.spy.eye);
      this.camera.lookAt(this.spy.look);
      if (this.camera.fov !== this.spy.fov) {
        this.camera.fov = this.spy.fov;
        this.camera.updateProjectionMatrix();
      }
    }
  }
}
