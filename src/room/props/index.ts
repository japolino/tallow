/**
 * The table's props and the one who keeps them (base.ts says what a prop is; layout.ts where each lives).
 *
 * The manager, TableProps, is the desk's (desk.ts, `desk.props`). It gives every prop the whole list of what the game
 * shows each time it changes and puts a prop on the table or takes it off by whether it has anything; it knows what
 * the pointer is over and what a touch does; it keeps which one prop is open and leans you over it; it shows a prop's
 * name on a tag while it is pointed at, and for a moment when it arrives.
 *
 * It can be driven from a script (scripts/prop-shots.ts, scripts/film.ts), through the room's handle:
 *
 *   room.desk.props.out                 the keys of the props on the table now
 *   room.desk.props.open("pack")        open one by its key (false if it is not on the table or your hands are full)
 *   room.desk.props.close()             close the open one and sit back
 *   room.desk.props.openKey             the key of the open one, or null
 *   room.desk.props.partsOf()           the ids of the open prop's parts that can be touched now
 *   room.desk.props.touch("tag:rope")   touch a part of the open prop by its id (false if there is no such part now)
 *   room.desk.props.choose(1)           touch the second pencilled choice now offered (the part "choice:1")
 *   room.desk.props.screenOf("pack")    where a prop is in the picture, in the page's pixels, or null;
 *   room.desk.props.screenOf("pack:tag:rope")   and where a part of the open prop is: to move the real pointer there
 *
 * Every move here and in the props runs on the room's clock (the desk's tracks and update), so it steps with the room
 * when a script winds it on by hand.
 */
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3, type PerspectiveCamera } from "three";
import type { Show } from "../../game/system.js";
import { sound } from "../sound.js";
import { ease, type Reacher, type Tracks } from "../track.js";
import { fitText, INK, Label, paper, type Part, type PropHost, type TableProp } from "./base.js";
import { Board } from "./board.js";
import { layOf, PROP_KEYS, viewOf, type PropKey, type View } from "./layout.js";
import { Pack } from "./pack.js";
import { Rack } from "./rack.js";
import { Ring } from "./ring.js";
import { Self } from "./self.js";
import { Stall } from "./stall.js";

export { LAYOUT, layOf, PROP_KEYS, viewOf, type PropKey } from "./layout.js";
export type { Part, PropHost, TableProp } from "./base.js";

/** Every prop of the table, in the order of their keys. A new prop is added here and in layout.ts. */
export const makeProps = (h: PropHost): TableProp[] => [new Pack(h), new Stall(h), new Ring(h), new Board(h), new Self(h), new Rack(h)];

/** What the manager needs of the desk it belongs to. */
export interface PropsDesk {
  /** What the props are added to. */
  root: Group;
  /** The element the room is drawn in, for where the pointer is. */
  host: HTMLElement;
  camera: PerspectiveCamera;
  tracks: Tracks;
  reduced: boolean;
  narrator: Reacher;
  now(): number;
  /** Whether your hands are free to open a prop (a notebook that is open is shut for it). */
  free(): boolean;
  /** Lean over an open prop; null sits you back from it. */
  lean(view: View | null): void;
  /** Write a line on the pad; the notebook is opened for it when it can be. */
  write(line: string): void;
  /** Keep one line up to date on the pad without opening the notebook. */
  keep(line: string): void;
  /** Whether the line last kept is still on the pad. */
  kept(): boolean;
  /** Open the notebook as it stands. */
  notebook(): void;
  tell(text: string): void;
}

interface Item {
  prop: TableProp;
  /** On the table (or on its way to it). */
  out: boolean;
  /** How far it has arrived, 0 off the table to 1 at home; which arriving or leaving is the latest. */
  k: number;
  run: number;
  /** How much it is pointed at, 0..1. */
  warm: number;
  tag: Label;
  /** How far its tag is shown, and until when it is shown without being pointed at. */
  tagK: number;
  tagUntil: number;
}

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
/** The least a part can be found from, as a share of the picture's height: a finger is not a pointer. */
const LEAST_REACH = 0.024;
/** A name tag, at one metre from the eye with a lens of 90 degrees: it is sized by how far off it is, so it reads the same everywhere. */
const TAG_W = 0.32, TAG_H = 0.074;

export class TableProps {
  /** The one that is open, by its key. */
  openKey: PropKey | null = null;
  private items: Item[];
  private narrow: boolean;
  /** The closed prop the pointer is over. */
  private over: PropKey | null = null;
  /** The part of the open prop chosen with the keys, if any. */
  private keyed = -1;
  private tmp = V(0, 0, 0);
  private marks: Group | null = null;

  constructor(private d: PropsDesk) {
    this.narrow = d.camera.aspect < 1;
    const host: PropHost = {
      tracks: d.tracks,
      reduced: d.reduced,
      camera: d.camera,
      narrator: d.narrator,
      now: d.now,
      narrow: () => this.narrow,
      write: (line) => {
        this.close();
        d.write(line);
      },
      keep: (line) => d.keep(line),
      kept: () => d.kept(),
      notebook: () => {
        this.close();
        d.notebook();
      },
      close: () => this.close(),
      tell: (text) => d.tell(text),
    };
    this.items = makeProps(host).map((prop) => {
      const tag = new Label(TAG_W, TAG_H, { px: 1000 });
      tag.mat.transparent = true;
      tag.mat.opacity = 0;
      tag.mat.depthTest = false;
      tag.mat.emissiveIntensity = 0.5;
      tag.mesh.renderOrder = 30;
      tag.mesh.visible = false;
      tag.mesh.receiveShadow = false;
      tag.draw((g, w, h) => {
        paper(g, w, h, 17);
        g.strokeStyle = "rgba(36,22,12,0.55)";
        g.lineWidth = 3;
        g.strokeRect(5, 5, w - 10, h - 10);
        g.fillStyle = INK;
        g.textAlign = "center";
        fitText(g, prop.name, w / 2, h * 0.68, w - 30, h * 0.56, h * 0.3, "italic 700");
      });
      return { prop, out: false, k: 0, run: 0, warm: 0, tag, tagK: 0, tagUntil: -1 };
    });
    for (const it of this.items) this.place(it);
  }

  /* ------------------------------------------------- what is shown ------------------------------------------------- */

  /** The whole list of what the game shows: each prop takes what is its own, and is on the table only while it has something. */
  show(shows: readonly Show[]): void {
    for (const it of this.items) {
      const has = it.prop.show(shows);
      if (has && !it.out) this.bring(it);
      else if (!has && it.out) this.send(it);
    }
  }

  /** The player's line has gone to the narrator. */
  sent(): void {
    for (const it of this.items) it.prop.sent?.();
  }

  /** The keys of the props on the table. */
  get out(): PropKey[] {
    return this.items.filter((it) => it.out).map((it) => it.prop.key);
  }

  private item(key: string | null): Item | undefined {
    return this.items.find((it) => it.prop.key === key);
  }

  /** Put a prop and what it lays out where the layout has them, for the shape of the picture as it is. */
  private place(it: Item): void {
    const lay = layOf(it.prop.key, this.narrow);
    it.prop.spread.position.set(lay.spread.x, 0.0015, lay.spread.z);
    it.prop.spread.rotation.y = lay.spread.yaw;
    it.prop.group.rotation.y = lay.home.yaw;
    it.prop.place(lay, this.narrow);
    this.pose(it);
  }

  /** Where a prop is now: at its home, short of it while it arrives or leaves, lifted a little while pointed at. */
  private pose(it: Item): void {
    const { home } = layOf(it.prop.key, this.narrow);
    const e = ease(it.k);
    // It comes in over the nearer edge of the table, and goes out the same way.
    const side = Math.abs(home.x) / 0.95 > Math.abs(home.z + 0.1) / 0.625;
    const off = (1 - e) * 0.24;
    it.prop.group.position.set(home.x + (side ? Math.sign(home.x) * off : 0), Math.sin(Math.PI * e) * 0.035 + ease(it.warm) * 0.006, home.z + (side ? 0 : Math.sign(home.z + 0.1) * off));
    it.prop.group.scale.setScalar(home.scale * (0.86 + 0.14 * e));
  }

  private bring(it: Item): void {
    it.out = true;
    const run = ++it.run;
    this.d.root.add(it.prop.group, it.prop.spread, it.tag.mesh);
    const x = layOf(it.prop.key, this.narrow).home.x;
    void this.d.tracks
      .run([
        { dur: 0.65, begin: () => sound.play("slide", { x, gain: 0.45, rate: 0.9 }), tick: (u) => run === it.run && ((it.k = Math.max(it.k, u)), this.pose(it)) },
        { dur: 0, begin: () => run === it.run && sound.play("knock", { x, gain: 0.35, rate: 0.8 }) },
      ])
      .then(() => {
        if (run !== it.run) return;
        it.k = 1;
        this.pose(it);
        // Its name is shown for a moment when it is first set down, so it need not be pointed at to be known.
        it.tagUntil = this.d.now() + 3.5;
      });
  }

  private send(it: Item): void {
    it.out = false;
    const run = ++it.run;
    if (this.openKey === it.prop.key) this.close();
    if (this.over === it.prop.key) this.over = null;
    it.tagUntil = -1;
    const from = it.k;
    const x = layOf(it.prop.key, this.narrow).home.x;
    void this.d.tracks
      .run([{ dur: 0.5, begin: () => sound.play("slide", { x, gain: 0.4, rate: 1.1 }), tick: (u) => run === it.run && ((it.k = from * (1 - u)), this.pose(it)) }])
      .then(() => {
        if (run !== it.run) return;
        it.k = 0;
        this.d.root.remove(it.prop.group, it.prop.spread, it.tag.mesh);
      });
  }

  /* ------------------------------------------------- opening and closing ------------------------------------------------- */

  /** Open a prop: you lean over it and it unfolds. Any other that was open is closed first. */
  open(key: PropKey): boolean {
    const it = this.item(key);
    if (!it || !it.out) return false;
    if (this.openKey === key) return true;
    if (!this.d.free()) return false;
    if (this.openKey) this.shut();
    this.openKey = key;
    this.over = null;
    this.keyed = -1;
    this.d.tell(`${it.prop.name}, open.`);
    it.prop.open();
    this.d.lean(viewOf(layOf(key, this.narrow), this.d.camera.aspect));
    return true;
  }

  /** Close the open prop and sit back. */
  close(): void {
    if (!this.openKey) return;
    this.shut();
    this.d.lean(null);
  }

  /** Fold the open prop up without moving your head: the desk calls this when you have already turned to something else. */
  shut(): void {
    const it = this.item(this.openKey);
    this.openKey = null;
    this.keyed = -1;
    if (!it) return;
    it.prop.hover(null);
    it.prop.close();
  }

  /* ------------------------------------------------- pointing and touching ------------------------------------------------- */

  /** The part nearest the pointer among these, if the pointer is within its reach. */
  private pick(e: { clientX: number; clientY: number }, parts: Part[]): Part | null {
    const r = this.d.host.getBoundingClientRect();
    const cam = this.d.camera;
    const half = Math.tan((cam.fov * Math.PI) / 360);
    let best: Part | null = null, least = 1;
    // What lies under the rest is found only where nothing else is.
    for (const p of [...parts.filter((x) => !x.under), ...parts.filter((x) => x.under)]) {
      if (p.under && best) break;
      const s = this.tmp.copy(p.at).project(cam);
      if (s.z > 1) continue;
      const off = Math.hypot(((s.x + 1) / 2) * r.width - (e.clientX - r.left), ((1 - s.y) / 2) * r.height - (e.clientY - r.top)) / r.height;
      const reach = Math.max(LEAST_REACH, p.reach / (2 * cam.position.distanceTo(p.at) * half));
      if (off / reach < least) {
        least = off / reach;
        best = p;
      }
    }
    return best;
  }

  /** The closed props as things to touch: the middle of each, and half its width. */
  private closed(): Part[] {
    return this.items.filter((it) => it.out && it.k >= 1 && it.prop.key !== this.openKey).map((it) => {
      const { home } = layOf(it.prop.key, this.narrow);
      return { id: it.prop.key, at: V(home.x, home.h * home.scale * 0.45, home.z), reach: Math.max(home.w, home.d) * home.scale * 0.5 };
    });
  }

  /**
   * The pointer has moved: while a prop is open, which of its parts it is over; else which closed prop. Returns
   * whether a touch here would be the props' to use.
   */
  hot(e: { clientX: number; clientY: number }): boolean {
    const open = this.item(this.openKey);
    if (open) {
      this.over = null;
      const part = this.pick(e, open.prop.parts());
      this.keyed = -1;
      open.prop.hover(part?.id ?? null);
      return true;
    }
    this.over = (this.pick(e, this.closed())?.id as PropKey | undefined) ?? null;
    return !!this.over;
  }

  /** The closed prop a touch here would open, if any. */
  at(e: { clientX: number; clientY: number }): PropKey | null {
    return this.openKey ? null : ((this.pick(e, this.closed())?.id as PropKey | undefined) ?? null);
  }

  /**
   * A touch. While a prop is open: on one of its parts, that part is touched; anywhere else, it is closed. With none
   * open: on a closed prop, it is opened. Returns whether the touch was used.
   */
  click(e: { clientX: number; clientY: number }): boolean {
    const open = this.item(this.openKey);
    if (open) {
      const part = this.pick(e, open.prop.parts());
      if (part) open.prop.touch(part.id);
      else {
        // Another prop touched from here is opened in its place.
        const other = this.pick(e, this.closed());
        if (!other || !this.open(other.id as PropKey)) this.close();
      }
      return true;
    }
    const key = this.at(e);
    return !!key && this.open(key);
  }

  /** A key, while a prop is open: Escape closes it; the arrows go from part to part, and Enter or Space touches the one chosen. */
  key(e: { key: string }): boolean {
    const open = this.item(this.openKey);
    if (!open) return false;
    if (e.key === "Escape") {
      this.close();
      return true;
    }
    const parts = open.prop.parts();
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step && parts.length) {
      this.keyed = (((this.keyed < 0 && step < 0 ? 0 : this.keyed) + step) % parts.length + parts.length) % parts.length;
      open.prop.hover(parts[this.keyed]!.id);
      return true;
    }
    if ((e.key === "Enter" || e.key === " ") && this.keyed >= 0 && parts[this.keyed]) {
      const id = parts[this.keyed]!.id;
      this.keyed = -1;
      open.prop.touch(id);
      return true;
    }
    return false;
  }

  /* ------------------------------------------------- for scripts ------------------------------------------------- */

  /** The ids of the open prop's parts that can be touched now. */
  partsOf(): string[] {
    return this.item(this.openKey)?.prop.parts().map((p) => p.id) ?? [];
  }

  /** Touch a part of the open prop by its id. False when it has no such part now. */
  touch(id: string): boolean {
    const open = this.item(this.openKey);
    if (!open || !open.prop.parts().some((p) => p.id === id)) return false;
    open.prop.touch(id);
    return true;
  }

  /** Touch one of the pencilled choices now offered, by its number from 0. */
  choose(i: number): boolean {
    return this.touch(`choice:${i}`);
  }

  /**
   * Where something is in the picture, in the page's pixels: a prop on the table by its key ("pack"), or a part of
   * the open prop by the prop's key and the part's id ("pack:tag:rope"). Null when it is not there, or out of the picture.
   */
  screenOf(what: string): { x: number; y: number } | null {
    const cut = what.indexOf(":");
    const key = cut < 0 ? what : what.slice(0, cut);
    const it = this.item(key);
    if (!it || !it.out) return null;
    let at: Vector3 | undefined;
    if (cut < 0) {
      const { home } = layOf(it.prop.key, this.narrow);
      at = V(home.x, home.h * home.scale * 0.45, home.z);
    } else if (this.openKey === key) at = it.prop.parts().find((p) => p.id === what.slice(cut + 1))?.at;
    if (!at) return null;
    const r = this.d.host.getBoundingClientRect();
    const p = at.clone().project(this.d.camera);
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null;
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  /**
   * For laying the table out (preview/props.ts, ?homes=1): mark every prop's home with a block of its size and every
   * spread with a thin sheet, whether or not the prop is out.
   */
  marksOn(on: boolean): void {
    if (this.marks) {
      this.d.root.remove(this.marks);
      this.marks.traverse((o) => {
        (o as Mesh).geometry?.dispose();
        ((o as Mesh).material as MeshBasicMaterial | undefined)?.dispose?.();
      });
      this.marks = null;
    }
    if (!on) return;
    const marks = (this.marks = new Group());
    const tints = [0xd04040, 0x40a0d0, 0xd0a030, 0x50c060, 0xc060c0, 0xe0e0e0];
    PROP_KEYS.forEach((key, i) => {
      const { home, spread } = layOf(key, this.narrow);
      const block = new Mesh(new BoxGeometry(home.w * home.scale, home.h * home.scale, home.d * home.scale), new MeshBasicMaterial({ color: tints[i], transparent: true, opacity: 0.55 }));
      block.position.set(home.x, (home.h * home.scale) / 2, home.z);
      block.rotation.y = home.yaw;
      const sheet = new Mesh(new BoxGeometry(spread.w, 0.002, spread.h), new MeshBasicMaterial({ color: tints[i], transparent: true, opacity: 0.3 }));
      sheet.position.set(spread.x, 0.003, spread.z);
      sheet.rotation.y = spread.yaw;
      marks.add(block, sheet);
    });
    this.d.root.add(marks);
  }

  /* ------------------------------------------------- every frame ------------------------------------------------- */

  update(dt: number, t: number): void {
    const still = this.d.reduced;
    const to = (now: number, want: number, rate: number): number => (still || Math.abs(want - now) < 0.004 ? want : now + (want - now) * Math.min(1, dt * rate));
    // The picture has changed shape (a phone turned, a window dragged): everything goes to its place for the new one.
    const narrow = this.d.camera.aspect < 1;
    if (narrow !== this.narrow) {
      this.narrow = narrow;
      this.close();
      for (const it of this.items) this.place(it);
      if (this.marks) this.marksOn(true);
    }
    const cam = this.d.camera;
    const half = Math.tan((cam.fov * Math.PI) / 360);
    for (const it of this.items) {
      if (!it.out && it.k <= 0) continue;
      const pointed = this.over === it.prop.key && !this.openKey;
      const was = it.warm;
      it.warm = to(it.warm, pointed ? 1 : 0, 9);
      if (it.warm !== was) {
        it.prop.warm(ease(it.warm));
        this.pose(it);
      }
      it.prop.update(dt, t);
      // Its name, on a tag over it, turned to you: while it is pointed at, and for a moment after it arrives.
      const named = it.out && it.k >= 1 && !this.openKey && (pointed || t < it.tagUntil);
      it.tagK = to(it.tagK, named ? 1 : 0, named ? 8 : 5);
      it.tag.mesh.visible = it.tagK > 0.01;
      if (!it.tag.mesh.visible) continue;
      const { home } = layOf(it.prop.key, this.narrow);
      const at = it.tag.mesh.position.set(home.x, home.h * home.scale + 0.03, home.z);
      const size = cam.position.distanceTo(at) * half * (this.narrow ? 0.62 : 1);
      it.tag.mesh.scale.setScalar(size);
      at.y += TAG_H * size * 0.5 + (1 - ease(it.tagK)) * -0.01;
      it.tag.mesh.quaternion.copy(cam.quaternion);
      it.tag.mat.opacity = ease(it.tagK);
    }
  }

  dispose(): void {
    this.marksOn(false);
    for (const it of this.items) {
      it.prop.dispose();
      it.tag.dispose();
    }
  }
}
