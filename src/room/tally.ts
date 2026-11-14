/**
 * The reckoning, at the left of the table where the balance used to stand: what the game keeps count of, as things
 * that read at a glance from your chair and exactly when you look at them (desk.ts, show).
 *
 * A meter (an encounter's measure, a need like hunger, a foe's health) is a row of beads on a wire in a small
 * standing frame. The beads that count are slid to the left and coloured, the rest wait dark at the right, so how
 * full it is shows from across the table; the name and the exact figure are written on the board behind, at the
 * row's left. A frame has four rows. It is stood up when there is a meter to show and laid down when there is none.
 *
 * A few counters of one kind (saves from a killing blow) are stones laid on a slip of paper in front of the frame.
 * The slip has the name written on it and a ring inked for each the kind can have, so an empty ring is one gone. The
 * narrator sets a stone down from its sleeve, or takes one back into it.
 *
 * Touch either and you lean over to read it. Nothing here decides anything: it shows what it is given.
 */
import { sound } from "./sound.js";
import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace, Vector3, type Material } from "three";
import { carrySteps } from "./counters.js";
import { mk } from "./textures.js";
import { ease, type Reacher, type Step, type Tracks } from "./track.js";

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** A meter, as the game gives it (game/system.ts, Show "bar"). */
export interface Meter {
  id: string;
  group: string;
  name: string;
  value: number;
  max: number;
  good: "up" | "down" | "none";
  note?: string;
}

/** A few counters of one kind (game/system.ts, Show "tokens"). */
export interface Kept {
  id: string;
  name: string;
  count: number;
  max?: number;
}

/** The most meters the frame shows, and the most kinds of counter laid out; the rest are not shown. */
export const METERS_OUT = 4;
export const KEPT_OUT = 3;
/** The most beads on a wire, and the most stones (and rings) on a slip. */
const BEADS = 10;
const STONES = 6;

/** Where the frame stands, turned toward your chair, and how far it leans back. */
const FRAME_AT = V(-0.655, 0, -0.175);
const FRAME_YAW = 0.42;
const LEAN = 0.2;
/** Its measures: between the posts, each row, the foot plank, the margin above and below the rows, the written column. */
const FW = 0.2;
const ROW_H = 0.026;
const BASE_H = 0.012;
const PAD = 0.008;
const FH = PAD * 2 + METERS_OUT * ROW_H;
const LABEL_W = 0.086;
/** Where the wires run, in the frame's own space: from the upright after the writing to the right post. */
const ROD_X0 = -FW / 2 + LABEL_W + 0.004;
const ROD_X1 = FW / 2;
const BEAD_R = 0.0052;
/** A bead is narrower along its wire than across it. */
const BEAD_ALONG = 0.78;
const BEAD_W = BEAD_R * 2 * BEAD_ALONG;
/** The board's writing, in pixels. */
const BOARD_PX = { w: 1024, h: Math.round((1024 * FH) / FW) };

/** The slips: where the first lies, how far each next one is toward you, how it is turned, and its size. */
const SLIP_AT = V(-0.655, 0.0012, -0.07);
const SLIP_STEP = 0.05;
const SLIP_YAW = 0.32;
const SLIP_W = 0.15, SLIP_D = 0.042;
const SLIP_PX = { w: 768, h: Math.round((768 * SLIP_D) / SLIP_W) };
const STONE_R = 0.0062;

const SERIF = `"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif`;
const INK = "#24160c";
const PAPER = "#dccfae";

/** The figure written for a meter: whole numbers as they are, others to one place. */
const figure = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** How many beads a meter is shown with, and how many of them count: exactly, up to ten; beyond that, in tenths. */
export function beadsFor(value: number, max: number): { n: number; k: number } {
  const top = Math.max(1, Math.round(max));
  const v = Math.max(0, Math.min(top, value));
  if (top <= BEADS) return { n: top, k: Math.round(v) };
  // Never empty while there is any, and never full while some is missing.
  let k = Math.round((v / top) * BEADS);
  if (v > 0) k = Math.max(1, k);
  if (v < top) k = Math.min(BEADS - 1, k);
  return { n: BEADS, k };
}

/** Write text as large as fits `width`, down to `least`; past that it is cut and ends with an ellipsis. */
function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, least: number, style = "italic 600"): void {
  let s = size;
  for (; s > least; s -= 1) {
    g.font = `${style} ${s}px ${SERIF}`;
    if (g.measureText(text).width <= width) break;
  }
  g.font = `${style} ${s}px ${SERIF}`;
  let t = text;
  if (g.measureText(t).width > width) {
    while (t.length > 1 && g.measureText(`${t}…`).width > width) t = t.slice(0, -1);
    t = `${t.trimEnd()}…`;
  }
  g.fillText(t, x, y);
}

/** Old paper, for the board and the slips. */
function paper(g: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, w, h);
  let a = seed >>> 0;
  const r = (): number => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "255,245,215" : "60,35,10"},${0.03 + r() * 0.05})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
  }
  const edge = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.65);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(60,30,5,0.3)");
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
}

interface Row {
  meter: Meter | null;
  beads: Mesh[];
  /** Where each bead is along its wire now, and where it is going. */
  x: number[];
  want: number[];
  k: number;
}

interface Slip {
  kept: Kept;
  /** The count the stones are being brought to. */
  want: number;
  mesh: Mesh;
  mat: MeshStandardMaterial;
  tex: CanvasTexture;
  canvas: HTMLCanvasElement;
  stones: Mesh[];
  stoneMat: Material;
  drawn: string;
  /** How far it has come into sight (0..1), and where that is going. */
  k: number;
  kWant: number;
  /** Its place in front of the frame, the first nearest the frame. */
  i: number;
  /** No longer wanted: its stones are being taken back, and then it goes. */
  leaving: boolean;
}

export class Reckoning {
  readonly group = new Group();
  private frame = new Group();
  /** Everything of the frame that stands: it turns on the foot plank to lie down. */
  private stand = new Group();
  private board: Mesh;
  private boardTex: CanvasTexture;
  private boardCanvas: HTMLCanvasElement;
  private drawn = "";
  private rows: Row[] = [];
  private beadGeo = new SphereGeometry(BEAD_R, 14, 10);
  private stoneGeo = new SphereGeometry(STONE_R, 14, 10);
  private slipGeo = new PlaneGeometry(SLIP_W, SLIP_D);
  private mats: Material[] = [];
  private beadMat: Record<"up" | "down" | "none" | "rest", MeshStandardMaterial>;
  private stoneMats: Material[];
  private slips: Slip[] = [];
  /** How far the frame is stood up (0 lying flat and out of sight, 1 standing), and where that is going. */
  private upK = 0;
  private upWant = 0;
  /** The narrator's moves here, one after another. */
  private work: Promise<void> = Promise.resolve();
  /** How far all of it is moved from where it stands at a wide view (an upright one has less table at the sides). */
  private off = V(0, 0, 0);

  constructor(private narrator: Reacher, private tracks: Tracks, private reduced: boolean) {
    const mat = <T extends Material>(m: T): T => {
      this.mats.push(m);
      return m;
    };
    const wood = mat(new MeshStandardMaterial({ color: 0x3b2718, roughness: 0.7 }));
    const brass = mat(new MeshStandardMaterial({ color: 0x9a7630, roughness: 0.3, metalness: 0.95 }));
    const lit = (color: number, rough = 0.4) => mat(new MeshStandardMaterial({ color, roughness: rough, emissive: color, emissiveIntensity: 0.12 }));
    this.beadMat = { up: lit(0xe8dcbc, 0.45), down: lit(0xa3201a, 0.3), none: lit(0xc08f3a, 0.35), rest: mat(new MeshStandardMaterial({ color: 0x241810, roughness: 0.5 })) };
    this.stoneMats = [
      mat(new MeshPhysicalMaterial({ color: 0x8c1014, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.2, emissive: 0x2a0204 })),
      mat(new MeshStandardMaterial({ color: 0xcdd6d2, roughness: 0.45, emissive: 0x1a1e1d })),
      mat(new MeshStandardMaterial({ color: 0xb08a34, roughness: 0.3, metalness: 1 })),
    ];

    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: Material, parent: Group): Mesh => {
      const b = new Mesh(new BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      b.castShadow = b.receiveShadow = true;
      parent.add(b);
      return b;
    };
    // The foot plank lies on the table; the rest stands on it.
    box(FW + 0.04, BASE_H, 0.045, 0, BASE_H / 2, 0, wood, this.frame);
    this.stand.position.y = BASE_H;
    this.frame.add(this.stand);
    for (const sx of [-1, 1]) box(0.01, FH + 0.006, 0.014, sx * (FW / 2 + 0.005), FH / 2, 0, wood, this.stand);
    box(FW + 0.02, 0.009, 0.014, 0, FH + 0.0075, 0, wood, this.stand);
    box(0.004, FH, 0.01, ROD_X0 - 0.003, FH / 2, 0, wood, this.stand);

    // The board behind the wires, with the names and figures written on it.
    [this.boardCanvas] = mk(BOARD_PX.w, BOARD_PX.h);
    this.boardTex = new CanvasTexture(this.boardCanvas);
    this.boardTex.colorSpace = SRGBColorSpace;
    this.boardTex.anisotropy = 4;
    const boardMat = mat(new MeshStandardMaterial({ map: this.boardTex, roughness: 0.9, emissive: 0xffffff, emissiveMap: this.boardTex, emissiveIntensity: 0.1 }));
    this.board = new Mesh(new PlaneGeometry(FW, FH), boardMat);
    this.board.position.set(0, FH / 2, -0.006);
    this.board.receiveShadow = true;
    this.stand.add(this.board);

    for (let i = 0; i < METERS_OUT; i++) {
      const y = this.rowY(i);
      const rod = new Mesh(new CylinderGeometry(0.001, 0.001, ROD_X1 - ROD_X0 + 0.004, 6), brass);
      rod.rotation.z = Math.PI / 2;
      rod.position.set((ROD_X0 + ROD_X1) / 2, y, 0);
      this.stand.add(rod);
      const beads: Mesh[] = [];
      for (let j = 0; j < BEADS; j++) {
        const b = new Mesh(this.beadGeo, this.beadMat.rest);
        b.scale.set(BEAD_ALONG, 1, 1);
        b.position.set(ROD_X1 - BEAD_W / 2 - (BEADS - 1 - j) * BEAD_W, y, 0);
        b.castShadow = true;
        b.visible = false;
        this.stand.add(b);
        beads.push(b);
      }
      this.rows.push({ meter: null, beads, x: beads.map((b) => b.position.x), want: beads.map((b) => b.position.x), k: 0 });
    }
    this.frame.position.copy(FRAME_AT).add(this.off);
    this.frame.rotation.y = FRAME_YAW;
    this.frame.visible = false;
    this.group.add(this.frame);
    this.drawBoard();
    this.pose();
  }

  /** How high a row's wire is above the foot plank, the first row at the top. */
  private rowY(i: number): number {
    return PAD + (METERS_OUT - i - 0.5) * ROW_H;
  }

  /* ------------------------------------------------- meters ------------------------------------------------- */

  /** The meters as they now stand: the first four are shown, in their order, a row each. */
  meters(list: Meter[]): void {
    const out = list.slice(0, METERS_OUT);
    this.rows.forEach((row, i) => {
      const m = out[i] ?? null;
      const was = row.meter;
      row.meter = m;
      if (!m) {
        for (const b of row.beads) b.visible = false;
        row.k = 0;
        return;
      }
      const { n, k } = beadsFor(m.value, m.max);
      const fresh = !was || was.id !== m.id;
      const lit = this.beadMat[m.good];
      // The beads that count from the left, the rest from the right.
      row.beads.forEach((b, j) => {
        b.visible = j < n;
        if (j >= n) return;
        row.want[j] = j < k ? ROD_X0 + BEAD_W / 2 + j * BEAD_W : ROD_X1 - BEAD_W / 2 - (n - 1 - j) * BEAD_W;
        b.material = j < k ? lit : this.beadMat.rest;
        if (fresh || this.reduced) row.x[j] = row.want[j]!;
      });
      if (!fresh && k !== row.k && this.upK > 0.5) sound.play("peg", { x: FRAME_AT.x, gain: 0.5, rate: k > row.k ? 1.1 : 0.9 });
      row.k = k;
    });
    this.drawBoard();
    const any = out.length > 0;
    if (any && this.upWant === 0) sound.play("slide", { x: FRAME_AT.x, gain: 0.4, rate: 0.8 });
    this.upWant = any ? 1 : 0;
    if (any) this.frame.visible = true;
    if (this.reduced) this.upK = this.upWant;
  }

  /** The names and the exact figures, at each row's left. */
  private drawBoard(): void {
    const key = JSON.stringify(this.rows.map((r) => r.meter && [r.meter.name, r.meter.value, r.meter.max, r.meter.note ?? ""]));
    if (key === this.drawn) return;
    this.drawn = key;
    const { w, h } = BOARD_PX;
    const g = this.boardCanvas.getContext("2d")!;
    paper(g, w, h, 77);
    const px = w / FW;
    const colW = LABEL_W * px - 26;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    this.rows.forEach((row, i) => {
      const m = row.meter;
      const mid = h - (this.rowY(i) / FH) * h;
      // A ruled line between rows.
      if (i) {
        g.strokeStyle = "rgba(60,35,15,0.25)";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(14, mid - (ROW_H * px) / 2);
        g.lineTo(w - 14, mid - (ROW_H * px) / 2);
        g.stroke();
      }
      if (!m) return;
      g.fillStyle = INK;
      fitText(g, m.name, 18, mid - 4, colW, 40, 24);
      g.fillStyle = "rgba(36,22,12,0.85)";
      const fig = `${figure(Math.max(0, m.value))} of ${figure(m.max)}`;
      fitText(g, m.note ? `${fig}, ${m.note}` : fig, 18, mid + 34, colW, 30, 20, "500");
    });
    g.strokeStyle = "rgba(36,22,12,0.5)";
    g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
    this.boardTex.needsUpdate = true;
  }

  /* ------------------------------------------------- counters ------------------------------------------------- */

  /** The counters as they now stand: the first three kinds, a slip each. */
  kept(list: Kept[]): void {
    const out = list.slice(0, KEPT_OUT);
    // Slips no longer wanted: their stones are taken back, and they go.
    for (const s of this.slips) {
      if (s.leaving || out.some((k) => k.id === s.kept.id)) continue;
      s.leaving = true;
      s.want = 0;
      this.queue(() => this.bring(s).then(() => void (s.kWant = 0)));
    }
    out.forEach((k) => {
      let s = this.slips.find((x) => x.kept.id === k.id && !x.leaving);
      if (!s) {
        // The first place no slip lies in.
        let i = 0;
        while (this.slips.some((x) => x.i === i)) i++;
        s = this.slip(k, i);
        const fresh = s;
        this.queue(() => this.bring(fresh));
      } else {
        const changed = s.want !== k.count;
        s.kept = k;
        s.want = k.count;
        this.drawSlip(s);
        if (changed) {
          const same = s;
          this.queue(() => this.bring(same));
        }
      }
    });
  }

  /** A new slip, in the i-th place, coming into sight. */
  private slip(k: Kept, i: number): Slip {
    const [canvas] = mk(SLIP_PX.w, SLIP_PX.h);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new MeshStandardMaterial({ map: tex, roughness: 0.92, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.08, transparent: true, opacity: 0 });
    const mesh = new Mesh(this.slipGeo, mat);
    mesh.rotation.set(-Math.PI / 2, 0, SLIP_YAW);
    mesh.position.copy(SLIP_AT).add(this.off).add(V(0, i * 0.0002, i * SLIP_STEP));
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const s: Slip = { kept: k, want: k.count, mesh, mat, tex, canvas, stones: [], stoneMat: this.stoneMats[i % this.stoneMats.length]!, drawn: "", k: this.reduced ? 1 : 0, kWant: 1, i, leaving: false };
    this.slips.push(s);
    this.drawSlip(s);
    if (this.reduced) mat.opacity = 1;
    sound.play("slide", { x: SLIP_AT.x, gain: 0.35, rate: 1.2 });
    return s;
  }

  private slots(s: Slip): number {
    return Math.max(1, Math.min(STONES, Math.max(s.kept.max ?? 0, s.kept.count)));
  }

  /** Where the j-th stone of a slip lies, in the room. */
  private stoneAt(s: Slip, j: number): Vector3 {
    const n = this.slots(s);
    const u = 0.53 + (j + 0.5) * (0.44 / n);
    s.mesh.updateMatrixWorld();
    return s.mesh.localToWorld(V((u - 0.5) * SLIP_W, 0, 0)).add(V(0, STONE_R * 0.55, 0));
  }

  /** The name, the count and a ring for each stone it can have. */
  private drawSlip(s: Slip): void {
    const n = this.slots(s);
    const key = `${s.kept.name}|${s.kept.count}|${s.kept.max ?? ""}|${n}`;
    if (key === s.drawn) return;
    s.drawn = key;
    const { w, h } = SLIP_PX;
    const g = s.canvas.getContext("2d")!;
    paper(g, w, h, 31 + s.i * 7);
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillStyle = INK;
    fitText(g, s.kept.name, 20, h * 0.5, w * 0.5 - 30, 50, 28);
    g.fillStyle = "rgba(36,22,12,0.85)";
    fitText(g, s.kept.max !== undefined ? `${s.kept.count} of ${s.kept.max}` : String(s.kept.count), 20, h * 0.86, w * 0.5 - 30, 38, 24, "500");
    g.strokeStyle = "rgba(36,22,12,0.75)";
    g.lineWidth = 4;
    for (let j = 0; j < n; j++) {
      const x = (0.53 + (j + 0.5) * (0.44 / n)) * w;
      g.beginPath();
      g.arc(x, h / 2, Math.min(32, ((0.44 / n) * w) / 2 - 8), 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = "rgba(36,22,12,0.4)";
    g.lineWidth = 3;
    g.strokeRect(5, 5, w - 10, h - 10);
    s.tex.needsUpdate = true;
    // Stones already lying go to their places, if the rings have moved.
    s.stones.forEach((m, j) => m.position.copy(this.stoneAt(s, j)));
  }

  /** The narrator's moves here go one after another. */
  private queue(job: () => Promise<void>): void {
    this.work = this.work.then(job).catch(() => undefined);
  }

  /** Bring a slip's stones to the count it wants: the narrator sets them down from its sleeve, or takes them back into it. */
  private async bring(s: Slip): Promise<void> {
    const n = this.narrator;
    const want = Math.min(STONES, Math.max(0, s.want));
    if (want === s.stones.length) return;
    const at = this.stoneAt(s, 0);
    const arm = n.armFor(at);
    const free: Step = { dur: 0, until: () => !n.busy?.(arm), patience: 6 };
    if (want < s.stones.length) {
      const gone = s.stones.splice(want);
      await this.tracks.run([free, ...carrySteps(n, this.tracks, arm, gone, () => gone[0]!.getWorldPosition(V(0, 0, 0)), () => n.sleeve(arm), { vanish: true, lift: 0.05 })]);
      for (const m of gone) this.group.remove(m);
      return;
    }
    const first = s.stones.length;
    const fresh: Mesh[] = [];
    for (let j = first; j < want; j++) {
      const m = new Mesh(this.stoneGeo, s.stoneMat);
      m.scale.y = 0.6;
      m.castShadow = m.receiveShadow = true;
      m.visible = false;
      m.position.copy(n.sleeve(arm));
      this.group.add(m);
      fresh.push(m);
      s.stones.push(m);
    }
    const places = fresh.map((_, i) => this.stoneAt(s, first + i));
    const starts: Vector3[] = [];
    await this.tracks.run([
      free,
      ...carrySteps(n, this.tracks, arm, fresh, () => n.sleeve(arm), () => places[0]!.clone().add(V(0, 0.004, 0)), { appear: true, lift: 0.06 }),
      // Each comes to rest on its ring.
      {
        dur: 0.3,
        begin: () => fresh.forEach((m, i) => (starts[i] = m.position.clone())),
        tick: (u) => fresh.forEach((m, i) => m.position.lerpVectors(starts[i]!, places[i]!, ease(u))),
      },
    ]);
  }

  /* ------------------------------------------------- looking ------------------------------------------------- */

  /** Whether there is anything here to look at. */
  get shown(): boolean {
    return this.upWant > 0 || this.slips.some((s) => !s.leaving);
  }

  /** The places a touch finds the reckoning by: the middle of the board, and of each slip. */
  spots(): Vector3[] {
    const out: Vector3[] = [];
    if (this.upWant > 0) out.push(this.board.getWorldPosition(V(0, 0, 0)));
    for (const s of this.slips) if (!s.leaving) out.push(s.mesh.getWorldPosition(V(0, 0, 0)));
    return out;
  }

  /** Where you lean to read it all, and what you look at: between the frame and the slips, square to the frame. */
  view(): { eye: Vector3; look: Vector3 } {
    const facing = V(Math.sin(FRAME_YAW), 0, Math.cos(FRAME_YAW));
    const look = FRAME_AT.clone().add(this.off).add(facing.clone().multiplyScalar(0.085)).setY(0.05);
    // An upright view is narrow: you lean in from further off to have the whole width of the frame.
    const upright = this.off.lengthSq() > 0;
    return { eye: look.clone().add(facing.multiplyScalar(upright ? 0.66 : 0.38)).add(V(0, upright ? 0.46 : 0.27, 0)), look };
  }

  /**
   * Stood for a wide view, or an upright one (a phone held upright), where the table's left end is out of the picture:
   * there the whole of it moves in to the map's left edge and a little back, and lies on the sheet's margin (above it,
   * so the slips are not under it). Things already lying move with it.
   */
  place(upright: boolean): void {
    const want = upright ? V(0.095, 0.0035, -0.09) : V(0, 0, 0);
    if (want.equals(this.off)) return;
    const d = want.clone().sub(this.off);
    this.off.copy(want);
    this.frame.position.add(d);
    for (const s of this.slips) {
      s.mesh.position.add(d);
      for (const m of s.stones) m.position.add(d);
    }
  }

  /** What is shown, for checks: each row's name, beads and beads that count, and each slip's name and stones. */
  get state(): { up: boolean; rows: { name: string; n: number; k: number }[]; slips: { name: string; stones: number }[] } {
    return {
      up: this.upWant > 0,
      rows: this.rows.filter((r) => r.meter).map((r) => ({ name: r.meter!.name, n: r.beads.filter((b) => b.visible).length, k: r.k })),
      slips: this.slips.filter((s) => !s.leaving).map((s) => ({ name: s.kept.name, stones: s.stones.length })),
    };
  }

  /** Stand the frame as far as it is stood, and lay the beads where they are. */
  private pose(): void {
    // Lying on its back on the foot plank, it turns up to lean a little back from upright.
    const e = ease(this.upK);
    this.stand.rotation.x = -(Math.PI / 2 - 0.03) * (1 - e) - LEAN * e;
    for (const row of this.rows) row.beads.forEach((b, j) => (b.position.x = row.x[j]!));
  }

  update(dt: number): void {
    const to = (now: number, want: number, rate: number): number => (this.reduced || Math.abs(want - now) < 0.002 ? want : now + (want - now) * Math.min(1, dt * rate));
    this.upK = to(this.upK, this.upWant, 3);
    if (this.upK === 0 && this.upWant === 0) this.frame.visible = false;
    // The beads slide along their wires, unhurried.
    for (const row of this.rows) row.x.forEach((x, j) => (row.x[j] = this.reduced ? row.want[j]! : x + (row.want[j]! - x) * Math.min(1, dt * 5)));
    if (this.frame.visible) this.pose();
    for (const s of [...this.slips]) {
      s.k = to(s.k, s.kWant, 3);
      s.mat.opacity = s.k;
      s.mesh.visible = s.k > 0.002;
      if (s.kWant === 0 && s.k === 0) {
        this.group.remove(s.mesh);
        for (const m of s.stones) this.group.remove(m);
        s.tex.dispose();
        s.mat.dispose();
        this.slips.splice(this.slips.indexOf(s), 1);
      }
    }
  }

  dispose(): void {
    for (const s of this.slips) {
      s.tex.dispose();
      s.mat.dispose();
    }
    this.boardTex.dispose();
    for (const m of this.mats) m.dispose();
    this.beadGeo.dispose();
    this.stoneGeo.dispose();
    this.slipGeo.dispose();
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry && m.geometry !== this.beadGeo && m.geometry !== this.stoneGeo && m.geometry !== this.slipGeo) m.geometry.dispose();
    });
  }
}
