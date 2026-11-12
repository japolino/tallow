/**
 * The paper of who you may be: when the narrator asks who you are tonight and you have personas of your own in
 * Lumiverse, it lays a sheet in front of you with each of them written on it, a box by each name and a last box for
 * someone new (session.ts, whoYouAre). You tick one by touching its line: a pencil tick goes in the box and the
 * narrator takes the paper back. Or you write instead, and it takes the paper back unticked.
 *
 * The sheet lies flat on the table, its top away from you, so it reads from your chair; while it lies there you look
 * down at it. Nothing here decides anything: the box ticked is handed to the game, which reads it.
 */
import { CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Raycaster, SRGBColorSpace, Vector2, Vector3, type PerspectiveCamera } from "three";
import { sound } from "./sound.js";
import { mk } from "./textures.js";
import { ease, Held, type Reacher, type Step, type Tracks } from "./track.js";

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Where the sheet lies: in the middle of the table, between the map and you, just above the map so none of it sinks under. */
export const ROSTER_AT = V(0.02, 0.0062, -0.2);
/** Where the narrator lays it, as far as its hands reach (where it lays a fork's cards), before it slides it over to you. */
const LAID_AT = V(0.02, 0.0062, -0.45);
/** Its size in the room, in metres, and on its canvas, in pixels (the same shape). */
const W = 0.24, H = 0.312;
const PX_W = 768, PX_H = 1000;
/** Where the lines begin under the heading, and how much is left bare at the foot. */
const TOP = 176, FOOT = 56;
/** No line is taller than this, however few there are. */
const ROW_MOST = 112;
const SERIF = 'Georgia, "Palatino Linotype", "Book Antiqua", serif';
const HAND = '"Segoe Print", "Ink Free", "Bradley Hand", "Comic Sans MS", cursive';
const INK = "#1d0e08";
const PENCIL = "#34353b";
const PAPER = "#e3d8bb";

/** One line on the paper: a name, and what kind of person that is, if it says. */
export interface RosterLine {
  name: string;
  title?: string;
}

/** How tall each line is, for `n` lines in all (the last is someone new). */
export const rowHeight = (n: number): number => Math.min(ROW_MOST, (PX_H - TOP - FOOT) / Math.max(1, n));

/** Which line a point on the paper is on (pixels down from its top edge), or -1 when it is on none. */
export function rowAt(py: number, n: number): number {
  const i = Math.floor((py - TOP) / rowHeight(n));
  return py >= TOP && i >= 0 && i < n ? i : -1;
}

/** Cut text to fit `width`, ending it with an ellipsis where it was cut. */
function fit(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && g.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

export class Roster {
  readonly group = new Group();
  /** Set while a box can be ticked: called with the line touched (the last is someone new). */
  choosing: ((i: number) => void) | null = null;
  private lines: RosterLine[] = [];
  private sheet: Mesh | null = null;
  private tex: CanvasTexture | null = null;
  private mat: MeshStandardMaterial | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private hovered = -1;
  private ticked = -1;
  private ray = new Raycaster();

  constructor(private narrator: Reacher, private tracks: Tracks, private reduced: boolean, private camera: PerspectiveCamera) {}

  /** True while the paper lies on the table. */
  get out(): boolean {
    return !!this.sheet;
  }

  /** Where the middle of the paper is, in the room, for looking at it. */
  get middle(): Vector3 {
    return this.group.localToWorld(ROSTER_AT.clone());
  }

  /** The line under the pointer, or -1. */
  lineAt(e: { clientX: number; clientY: number }, host: HTMLElement): number {
    if (!this.sheet) return -1;
    const r = host.getBoundingClientRect();
    this.ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObject(this.sheet, false)[0];
    if (!hit?.uv) return -1;
    return rowAt((1 - hit.uv.y) * PX_H, this.lines.length + 1);
  }

  /** Light the line under the pointer, so it can be seen which box a touch would tick. */
  set hover(i: number) {
    if (i === this.hovered || !this.choosing) return;
    this.hovered = i;
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    if (!g || !this.tex) return;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, PX_W, PX_H);
    // Old paper: a little darker toward its edges.
    const edge = g.createRadialGradient(PX_W / 2, PX_H / 2, PX_H * 0.3, PX_W / 2, PX_H / 2, PX_H * 0.75);
    edge.addColorStop(0, "rgba(90,60,25,0)");
    edge.addColorStop(1, "rgba(90,60,25,0.2)");
    g.fillStyle = edge;
    g.fillRect(0, 0, PX_W, PX_H);
    g.fillStyle = INK;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.font = `italic 58px ${SERIF}`;
    g.fillText("Who sits down tonight?", PX_W / 2, 104);
    g.fillRect(PX_W * 0.2, 130, PX_W * 0.6, 2);
    const all = [...this.lines, { name: "Someone new", title: "write who" }];
    const n = all.length;
    const rh = rowHeight(n);
    const box = Math.min(46, rh * 0.5);
    const left = 58, text = left + box + 26, right = PX_W - 44;
    all.forEach((l, i) => {
      const y = TOP + i * rh;
      if (i === this.hovered && this.ticked < 0) {
        g.fillStyle = "rgba(120,80,30,0.13)";
        g.fillRect(left - 18, y + 3, right - left + 30, rh - 6);
      }
      const mid = y + rh / 2;
      // The box, inked by hand.
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.strokeRect(left, mid - box / 2, box, box);
      if (i === this.ticked) {
        g.strokeStyle = PENCIL;
        g.lineWidth = Math.max(5, box * 0.14);
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(left + box * 0.12, mid + box * 0.02);
        g.lineTo(left + box * 0.42, mid + box * 0.36);
        g.lineTo(left + box * 1.08, mid - box * 0.62);
        g.stroke();
      }
      g.textAlign = "left";
      g.fillStyle = INK;
      const last = i === n - 1;
      const nameSize = Math.round(Math.min(46, rh * 0.5));
      g.font = `${last ? "italic " : ""}${nameSize}px ${SERIF}`;
      const name = fit(g, l.name, right - text);
      const tall = rh >= 84 && !!l.title;
      g.textBaseline = "middle";
      g.fillText(name, text, tall ? mid - rh * 0.16 : mid);
      if (l.title) {
        const small = Math.round(nameSize * 0.62);
        g.font = `italic ${small}px ${last ? SERIF : HAND}`;
        g.fillStyle = "#4a3523";
        if (tall) g.fillText(fit(g, l.title, right - text), text, mid + rh * 0.22);
        else {
          g.font = `${nameSize}px ${SERIF}`;
          const after = text + g.measureText(name).width + 16;
          g.font = `italic ${small}px ${last ? SERIF : HAND}`;
          if (right - after > 60) g.fillText(fit(g, `— ${l.title}`, right - after), after, mid + 2);
        }
      }
    });
    this.tex.needsUpdate = true;
  }

  private make(): Mesh {
    const [c, g] = mk(PX_W, PX_H);
    this.g = g;
    this.tex = new CanvasTexture(c as HTMLCanvasElement);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 8;
    // The paper gives some of its own light back, so it can be read on a table lit by one candle.
    this.mat = new MeshStandardMaterial({ map: this.tex, roughness: 0.95, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.22 });
    const geo = new PlaneGeometry(W, H);
    geo.rotateX(-Math.PI / 2);
    const m = new Mesh(geo, this.mat);
    m.receiveShadow = true;
    m.castShadow = true;
    this.draw();
    return m;
  }

  /** The narrator lays the paper in front of you, with these lines on it and a last one for someone new. */
  lay(lines: readonly RosterLine[]): Promise<void> {
    if (this.sheet) this.drop();
    this.lines = lines.map((l) => ({ ...l }));
    this.hovered = -1;
    this.ticked = -1;
    const sheet = this.make();
    this.sheet = sheet;
    if (this.reduced) {
      sheet.position.copy(ROSTER_AT);
      this.group.add(sheet);
      return Promise.resolve();
    }
    const n = this.narrator;
    const arm = n.armFor(this.group.localToWorld(LAID_AT.clone()));
    // Held by the middle of its top edge, the edge away from you.
    const grip = (out: Vector3): Vector3 => this.group.localToWorld(out.copy(sheet.position).add(V(0, 0, -H / 2)));
    const held = new Held(n, arm, sheet, () => this.tracks.now, grip);
    const above = LAID_AT.clone().add(V(0, 0.07, -0.08));
    let start = V(0, 0, 0);
    const steps: Step[] = [
      { dur: 0.25, tick: () => n.reach(arm, this.group.localToWorld(above.clone().add(V(0, 0, -H / 2)))), until: () => n.reached(arm) > 0.8, patience: 1.4 },
      {
        dur: 0.04,
        begin: () => {
          start = this.group.worldToLocal(n.fingertips(arm).clone()).add(V(0, 0, H / 2));
          sheet.position.copy(start);
          this.group.add(sheet);
          held.take();
          sound.play("slide", { x: ROSTER_AT.x, gain: 0.5 });
        },
      },
      {
        dur: 0.55,
        until: () => held.there,
        patience: 0.8,
        tick: (u) => {
          sheet.position.lerpVectors(start, LAID_AT, ease(u));
          sheet.position.y += Math.sin(Math.PI * u) * 0.02;
          held.follow();
        },
      },
      { dur: 0.05, begin: () => sound.play("pat", { x: LAID_AT.x, gain: 0.5, rate: 0.8 }) },
      // Its fingers let go, and give it a push over the table to you.
      {
        dur: 0.6,
        begin: () => {
          start = sheet.position.clone();
          sound.play("slide", { x: ROSTER_AT.x, gain: 0.6 });
        },
        tick: (u) => {
          sheet.position.lerpVectors(start, ROSTER_AT, 1 - (1 - u) * (1 - u));
          n.reach(arm, u < 0.35 ? grip(V(0, 0, 0)).add(V(0, 0.01, 0)) : null);
        },
      },
      { dur: 0.05, begin: () => n.reach(arm, null) },
    ];
    return this.tracks.run(steps);
  }

  /** A pencil tick in the box of line `i`. */
  tick(i: number): void {
    this.ticked = i;
    this.hovered = -1;
    this.draw();
    sound.play("scratch", { x: ROSTER_AT.x, gain: 0.8 });
  }

  /** The narrator takes the paper back to its side of the dark. */
  take(): Promise<void> {
    const sheet = this.sheet;
    this.choosing = null;
    if (!sheet) return Promise.resolve();
    if (this.reduced) {
      this.drop();
      return Promise.resolve();
    }
    const n = this.narrator;
    const arm = n.armFor(this.group.localToWorld(LAID_AT.clone()));
    const top = (h: number): Vector3 => this.group.localToWorld(sheet.position.clone().add(V(0, h, -H / 2)));
    const held = new Held(n, arm, sheet, () => this.tracks.now, (out) => this.group.localToWorld(out.copy(sheet.position).add(V(0, 0, -H / 2))));
    const from = V(0, 0, 0);
    const steps: Step[] = [
      // A moment to see the tick go in; then the paper is pushed back over the table, and the hand comes for it.
      { dur: 0.35 },
      {
        dur: 0.5,
        begin: () => {
          from.copy(sheet.position);
          sound.play("slide", { x: ROSTER_AT.x, gain: 0.5 });
        },
        tick: (u) => sheet.position.lerpVectors(from, LAID_AT, ease(u)),
      },
      { dur: 0.25, tick: () => n.reach(arm, top(0.05)), until: () => n.reached(arm) > 0.8 && n.fingertips(arm).distanceTo(top(0.05)) < 0.05, patience: 1.4 },
      { dur: 0.15, tick: (u) => n.reach(arm, top(0.05 - 0.045 * ease(u))) },
      {
        dur: 0.5,
        begin: () => {
          from.copy(sheet.position);
          held.take();
          sound.play("slide", { x: ROSTER_AT.x, gain: 0.5 });
        },
        tick: (u) => {
          sheet.position.copy(from).add(V(0, 0.09 * ease(u), -0.3 * ease(u)));
          held.follow();
        },
      },
      {
        dur: 0.04,
        begin: () => {
          this.drop();
          n.reach(arm, null);
          sound.play("swish", { x: ROSTER_AT.x, gain: 0.5 });
        },
      },
    ];
    return this.tracks.run(steps);
  }

  private drop(): void {
    if (this.sheet) {
      this.group.remove(this.sheet);
      this.sheet.geometry.dispose();
    }
    this.tex?.dispose();
    this.mat?.dispose();
    this.sheet = null;
    this.tex = null;
    this.mat = null;
    this.g = null;
    this.choosing = null;
  }

  dispose(): void {
    this.drop();
  }
}
