/**
 * The narrator's book (engine/chapter.ts, game/chapters.ts): bound in oxblood leather with a brass clasp, it stands on
 * the shelf behind the table, its cover to the room. When a chapter is due the narrator beckons it down, it lies open
 * on the table in front of it, and its hand writes while the ink comes up line by line on the page; then it closes and
 * goes back to its shelf, a little brighter for a while. You can take it down whenever your hands are free: touch it
 * and it comes to you open, at its newest chapter, its pages turned with a touch at either side of the view (or the
 * arrow keys, or the wheel), and put back with a touch in the middle (or Escape). A wide view shows a spread of two
 * pages; a phone held upright shows one at a time, and the book slides from one page to the next.
 *
 * The book's own space: the spine lies along z through the origin, the pages face +y, the top of a page is towards -z.
 * Its origin is the middle of the open spread at the height of the pages; closed, the middle of the closed book.
 */
import { BoxGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3, type Object3D, type PerspectiveCamera, type Scene } from "three";
import type { Book, BookPicture } from "../engine/chapter.js";
import { BOOK_PX, FONTS, layBook, openingPage, type LaidPage } from "./bookpages.js";
import { sound } from "./sound.js";
import { mk, rng } from "./textures.js";
import { ease, Tracks, type Reacher, type Step } from "./track.js";

/** A page, in metres; the boards stand out past it by LIP; each half of the text block is B thick, a board T. */
const W = 0.15;
const H = 0.21;
const B = 0.011;
const T = 0.004;
const LIP = 0.005;
const INK = "#1d0e08";
const PAPER = "#e8dcbf";
const GILT = "#d1aa5c";
/** Where it stands on its shelf, in the shelves' own space (room.ts, shelves): row 1, left of the skull, cover out. */
const ON_SHELF = new Vector3(-0.2, -0.2 + 0.44 + 0.0175 + H / 2 + LIP, 0.105);
/** Where it lies open while the narrator writes in it: on the table by its right hand, clear of the map, where the player can see its pages. */
const ON_TABLE = new Vector3(-0.36, B + T + 0.001, -0.72);
/** How far it is turned from facing the narrator square: toward the hand that writes. */
const TABLE_TURN = -0.55;
/** The least time the narrator is seen writing, however fast the chapter came. */
const WRITE_MIN = 2.6;
/** How long a chapter is expected to take, for how fast the ink comes up before it is in. */
const WRITE_GUESS = 28;
/** Lines of ink on the page being written. */
const ROWS = 19;

type Hands = Reacher & { close?(arm: number, on?: "pinch" | "grasp"): void; release?(arm: number): void };

export interface BookHost {
  scene: Scene;
  camera: PerspectiveCamera;
  host: HTMLElement;
  narrator: Hands;
  reduced: boolean;
  /** The shelves (room.ts): the book stands among them. */
  shelves: Object3D;
  /** The game wants the narrator's hands now (cards, pieces, candles): the writing hand makes way. */
  busy(): boolean;
}

type State = "shelf" | "fetch" | "writing" | "return" | "lift" | "reading" | "lower";

interface Pose {
  p: Vector3;
  q: Quaternion;
}

/** One drawn surface: a page of the open book, or a side of the leaf being turned. */
class Surface {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly tex: CanvasTexture;
  readonly mat: MeshStandardMaterial;
  /** What is drawn on it now, so it is not drawn twice. */
  shows = "";
  constructor() {
    const [c, g] = mk(BOOK_PX.w, BOOK_PX.h);
    this.canvas = c;
    this.g = g;
    this.tex = new CanvasTexture(c);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mat = new MeshStandardMaterial({ map: this.tex, roughness: 0.92, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.05 });
  }
}

export class RoomBook {
  readonly group = new Group();
  /** How a picture is fetched to be drawn on its page (frontend.ts); without it the pages show where pictures will be. */
  pictures: ((p: BookPicture) => Promise<CanvasImageSource | null>) | null = null;
  private body = new Group();
  private left = new Group();
  private leafG = new Group();
  private spine: Mesh;
  private clasp: Mesh;
  private tracks: Tracks;
  private state: State = "shelf";
  private book: Book | null = null;
  private pages: LaidPage[] = [];
  private laidFor: Book | null = null;
  /** The page being read: the spread is pages 2s and 2s+1. */
  private at = 0;
  private surf = { left: new Surface(), right: new Surface(), front: new Surface(), back: new Surface() };
  private cover: { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: CanvasTexture; for: string };
  private leather: MeshStandardMaterial;
  private coverMat: MeshStandardMaterial;
  private open = 0;
  private leafTurn = 0;
  /** How much brighter it is for a chapter just shelved. */
  private glow = 0;
  private work: { settled: boolean; since: number } | null = null;
  private pending: Promise<unknown> | null = null;
  private pendingDone = false;
  private hand = -1;
  private ink = -1;
  /** How far the ink has come on the page being written, 0..1. */
  private inkK = 0;
  private mats: MeshStandardMaterial[] = [];
  private t = 0;
  /** Across the view: 0 shows the left page, 1 the right, 0.5 both (a wide view). */
  private side = 0.5;
  private images = new Map<string, CanvasImageSource | "loading" | "none">();
  private read: HTMLDivElement;
  private tmp = new Vector3();
  private geos: (BoxGeometry | PlaneGeometry)[] = [];

  constructor(private h: BookHost) {
    this.tracks = new Tracks(h.reduced);
    this.leather = new MeshStandardMaterial({ color: 0x5a1f18, roughness: 0.62, emissive: 0x5a1f18, emissiveIntensity: 0.12 }); // palette: oxblood
    const edge = new MeshStandardMaterial({ color: 0xc9a877, roughness: 0.9, emissive: 0xc9a877, emissiveIntensity: 0.04 }); // palette: parchment
    const brass = new MeshStandardMaterial({ color: 0x8a6a2c, roughness: 0.45, metalness: 0.6, emissive: 0x8a6a2c, emissiveIntensity: 0.1 }); // palette: brass
    this.mats.push(edge, brass);
    const [cc, cg] = mk(512, 716);
    const ctex = new CanvasTexture(cc);
    ctex.colorSpace = SRGBColorSpace;
    ctex.anisotropy = 8;
    this.cover = { canvas: cc, g: cg, tex: ctex, for: "\u0000" };
    this.coverMat = new MeshStandardMaterial({ map: ctex, roughness: 0.6, emissive: 0xffffff, emissiveMap: ctex, emissiveIntensity: 0.1 });

    const box = (w: number, hh: number, d: number, mat: MeshStandardMaterial, x: number, y: number, z = 0): Mesh => {
      const g = new BoxGeometry(w, hh, d);
      this.geos.push(g);
      const m = new Mesh(g, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      return m;
    };
    const plane = (mat: MeshStandardMaterial, x: number, y: number, flip: boolean): Mesh => {
      const g = new PlaneGeometry(W, H);
      g.rotateX(-Math.PI / 2);
      if (flip) g.rotateZ(Math.PI);
      this.geos.push(g);
      const m = new Mesh(g, mat);
      m.position.set(x, y, 0);
      m.receiveShadow = true;
      return m;
    };
    // The right half: its board under, its half of the block, its page on top.
    const right = new Group();
    right.add(box(W + LIP, T, H + 2 * LIP, this.leather, (W + LIP) / 2, -T / 2), box(W, B, H, edge, W / 2, B / 2), plane(this.surf.right.mat, W / 2, B + 0.0004, false));
    // The left half turns about the spine at the height of the pages: open it lies flat beside the right, shut it lies on it.
    this.left.position.set(0, B, 0);
    this.left.add(box(W + LIP, T, H + 2 * LIP, this.leather, -(W + LIP) / 2, -B - T / 2), box(W, B, H, edge, -W / 2, -B / 2), plane(this.surf.left.mat, -W / 2, 0.0004, false));
    // The front cover, on the outside of the left board.
    this.left.add(plane(this.coverMat, -W / 2, -B - T - 0.0006, true));
    (this.left.children[3] as Mesh).scale.set((W + LIP * 0.6) / W, 1, (H + LIP * 1.4) / H);
    // The leaf being turned: two sides, lying on the right page at 0, on the left at -pi.
    this.leafG.position.set(0, B + 0.0009, 0);
    const lf = plane(this.surf.front.mat, W / 2, 0.0002, false);
    const lb = plane(this.surf.back.mat, 0, 0, true);
    lb.geometry.translate(W / 2, -0.0002, 0);
    lb.position.set(0, 0, 0);
    this.leafG.add(lf, lb);
    this.leafG.visible = false;
    this.spine = box(0.007, 1, H + 2 * LIP, this.leather, -0.0035, 0);
    this.clasp = box(0.026, 2 * B + 2 * T + 0.003, 0.03, brass, W + LIP - 0.004, B);
    right.add(this.spine, this.clasp);
    this.body.add(right, this.left, this.leafG);
    this.group.add(this.body);
    this.shut(1);
    this.drawCover("");

    this.read = document.createElement("div");
    this.read.setAttribute("aria-live", "polite");
    Object.assign(this.read.style, { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clipPath: "inset(50%)" });
    h.host.append(this.read);
    h.scene.add(this.group);
    const sp = this.shelfPose();
    this.group.position.copy(sp.p);
    this.group.quaternion.copy(sp.q);
    window.addEventListener("keydown", this.onKey, true);
  }

  /* ------------------------------ the game's side ----------------------------- */

  /** The book as it now stands: a chapter written into it, or a picture come. */
  show(book: Book): void {
    const more = !!this.book && book.chapters.length > this.book.chapters.length && this.book.hero === book.hero;
    this.book = book;
    this.drawCover(book.hero);
    if (more && this.state === "shelf") this.glow = 1;
    // Pages already in your hands are laid out again where you are; the rest when the book is next opened.
    if (this.held) {
      const was = this.pages[this.at]?.chapter;
      this.layout();
      if (was) this.at = Math.max(0, Math.min(this.pages.length - 1, this.pages.findIndex((p) => p.chapter === was)));
      this.paintSpread();
    }
  }

  /** A chapter is being written: the narrator takes the book down and writes in it until `work` settles. */
  writing(work: Promise<unknown>): void {
    if (this.state === "shelf") return this.fetch(work);
    this.pending = work;
    this.pendingDone = false;
    void work.finally(() => (this.pendingDone = true));
  }

  /** In your hands (on the way up, open, or on the way back): the room is drawn finer while it is. */
  get held(): boolean {
    return this.state === "lift" || this.state === "reading" || this.state === "lower";
  }

  /* ---------------------------------- shapes ---------------------------------- */

  /** Shut (1) or open (0): the left half over the right, the spine as thick as the shut book, the origin in its middle. */
  private shut(k: number): void {
    this.open = 1 - k;
    this.left.rotation.z = -Math.PI * k;
    const tall = T + (2 * B + T) * k;
    this.spine.scale.y = tall;
    this.spine.position.y = -T + tall / 2;
    this.clasp.visible = k > 0.985;
    this.body.position.set(-(W / 2) * k, -B * k, 0);
  }

  private shelfPose(): Pose {
    const s = this.h.shelves;
    s.updateWorldMatrix(true, false);
    const p = s.localToWorld(ON_SHELF.clone());
    // Standing, its cover to the room, leaning back a little against the books behind it.
    const q = s.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2 - 0.1));
    return { p, q };
  }

  private tablePose(): Pose {
    // Turned to the narrator, who writes in it.
    return { p: ON_TABLE.clone(), q: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI + TABLE_TURN) };
  }

  /** A narrow view (a phone held upright) shows one page at a time. */
  private get narrow(): boolean {
    return this.h.camera.aspect < 0.8;
  }

  /** Where it is held to be read, in the camera's space: upright, as large as the view allows, the page being read in the middle. */
  private holdPose(): Pose {
    const cam = this.h.camera;
    const half = Math.tan((cam.fov * Math.PI) / 360);
    const wide = this.narrow ? W / 2 + 0.004 : W + LIP;
    const d = Math.max(0.2, wide / (0.94 * half * cam.aspect), (H / 2 + LIP) / (0.9 * half));
    // The page being read in the middle: the left one sits at -W/2, the right one at +W/2.
    const x = this.narrow ? (0.5 - this.side) * W : 0;
    return { p: new Vector3(x, -0.004, -d), q: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2 - 0.06) };
  }

  /* --------------------------------- painting --------------------------------- */

  private drawCover(hero: string): void {
    const c = this.cover;
    if (c.for === hero) return;
    c.for = hero;
    const g = c.g;
    const w = c.canvas.width, hh = c.canvas.height;
    const r = rng(77);
    g.fillStyle = "#5a1f18";
    g.fillRect(0, 0, w, hh);
    // Leather: a grain of darker and lighter flecks, worn paler at the edges.
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(30,8,6,0.18)" : "rgba(120,52,40,0.12)";
      g.fillRect(r() * w, r() * hh, 1 + r() * 3, 1 + r() * 2);
    }
    const wear = g.createRadialGradient(w / 2, hh / 2, hh * 0.25, w / 2, hh / 2, hh * 0.75);
    wear.addColorStop(0, "rgba(0,0,0,0)");
    wear.addColorStop(1, "rgba(150,90,60,0.25)");
    g.fillStyle = wear;
    g.fillRect(0, 0, w, hh);
    // Two gilt rules round the edge, and corners of brass.
    g.strokeStyle = GILT;
    g.lineWidth = 4;
    g.strokeRect(30, 30, w - 60, hh - 60);
    g.lineWidth = 2;
    g.strokeRect(44, 44, w - 88, hh - 88);
    g.fillStyle = "#8a6a2c";
    for (const [x, y] of [[0, 0], [w, 0], [0, hh], [w, hh]] as const) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (x ? -70 : 70), y);
      g.lineTo(x, y + (y ? -70 : 70));
      g.fill();
    }
    g.fillStyle = GILT;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = '34px Georgia, "Palatino Linotype", serif';
    g.fillText("THE  BOOK  OF", w / 2, 230);
    let size = 58;
    const name = (hero || "the traveller").toUpperCase();
    do g.font = `${size}px Georgia, "Palatino Linotype", serif`;
    while (g.measureText(name).width > w - 120 && --size > 20);
    g.fillText(name, w / 2, 310);
    this.ornament(g, w / 2, 420, GILT, 1.4);
    c.tex.needsUpdate = true;
  }

  /** A small flourish: a diamond between two tapering strokes. */
  private ornament(g: CanvasRenderingContext2D, x: number, y: number, color: string, s = 1): void {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(9, 0);
    g.lineTo(0, 9);
    g.lineTo(-9, 0);
    g.fill();
    for (const d of [-1, 1]) {
      g.beginPath();
      g.moveTo(d * 16, 0);
      g.quadraticCurveTo(d * 60, -5, d * 110, 0);
      g.quadraticCurveTo(d * 60, 3, d * 16, 0);
      g.fill();
    }
    g.restore();
  }

  /** Paper: warm, flecked, darker into the gutter on the spine's side. */
  private paper(s: Surface, gutterLeft: boolean, seed: number): void {
    const g = s.g;
    const w = BOOK_PX.w, hh = BOOK_PX.h;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, w, hh);
    const r = rng(500 + seed * 17);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(120,90,50,${0.03 + r() * 0.05})`;
      g.beginPath();
      g.arc(r() * w, r() * hh, 2 + r() * 10, 0, Math.PI * 2);
      g.fill();
    }
    const gut = g.createLinearGradient(gutterLeft ? 0 : w, 0, gutterLeft ? 90 : w - 90, 0);
    gut.addColorStop(0, "rgba(70,45,20,0.32)");
    gut.addColorStop(1, "rgba(70,45,20,0)");
    g.fillStyle = gut;
    g.fillRect(0, 0, w, hh);
    const rim = g.createRadialGradient(w / 2, hh / 2, hh * 0.35, w / 2, hh / 2, hh * 0.75);
    rim.addColorStop(0, "rgba(0,0,0,0)");
    rim.addColorStop(1, "rgba(110,80,40,0.18)");
    g.fillStyle = rim;
    g.fillRect(0, 0, w, hh);
  }

  /** Draw page `i` of the book on a surface (a right-hand page has its gutter on the left). */
  private paint(s: Surface, i: number, rightHand: boolean): void {
    const page = this.pages[i];
    const pic = page?.items.find((it) => it.t === "picture");
    const img = pic && pic.t === "picture" ? this.imageFor(pic.chapter) : undefined;
    const key = `${i}|${rightHand}|${this.pages.length}|${this.laidFor?.chapters.length}|${typeof img === "object" ? "img" : String(img)}|${page?.said.length ?? -1}`;
    if (s.shows === key) return;
    s.shows = key;
    this.paper(s, rightHand, i);
    const g = s.g;
    if (page) {
      g.fillStyle = INK;
      g.textBaseline = "alphabetic";
      if (page.head) {
        g.font = FONTS.head;
        g.textAlign = "center";
        g.globalAlpha = 0.7;
        g.fillText(page.head, BOOK_PX.w / 2, 62);
        g.globalAlpha = 1;
      }
      for (const it of page.items) {
        if (it.t === "line") {
          g.font = FONTS[it.font];
          g.textAlign = it.center ? "center" : "left";
          g.fillText(it.text, it.x, it.y);
        } else if (it.t === "rule") {
          g.strokeStyle = INK;
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(BOOK_PX.w * 0.32, it.y);
          g.lineTo(BOOK_PX.w * 0.68, it.y);
          g.stroke();
        } else if (it.t === "ornament") this.ornament(g, BOOK_PX.w / 2, it.y, INK, 0.9);
        else if (it.t === "picture") this.plate(g, it, img);
      }
      if (page.folio) {
        g.font = FONTS.head;
        g.textAlign = "center";
        g.fillText(String(page.folio), BOOK_PX.w / 2, BOOK_PX.h - 46);
      }
    }
    s.tex.needsUpdate = true;
  }

  /** A chapter's picture in its box, framed in ink; while it is being made, or if it cannot be shown, a note in its place. */
  private plate(g: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }, img: CanvasImageSource | "loading" | "none" | undefined): void {
    if (img && typeof img === "object") {
      const iw = (img as HTMLImageElement).naturalWidth || (img as { width: number }).width || 1;
      const ih = (img as HTMLImageElement).naturalHeight || (img as { height: number }).height || 1;
      // As much of it as fills the box, from its middle.
      const k = Math.max(box.w / iw, box.h / ih);
      const sw = box.w / k, sh = box.h / k;
      g.save();
      g.beginPath();
      g.rect(box.x, box.y, box.w, box.h);
      g.clip();
      g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, box.x, box.y, box.w, box.h);
      // Printed on the page: a little of the paper's warmth over it.
      g.fillStyle = "rgba(232,220,191,0.08)";
      g.fillRect(box.x, box.y, box.w, box.h);
      g.restore();
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.strokeRect(box.x, box.y, box.w, box.h);
      g.lineWidth = 1;
      g.strokeRect(box.x - 7, box.y - 7, box.w + 14, box.h + 14);
      return;
    }
    g.strokeStyle = "rgba(29,14,8,0.35)";
    g.setLineDash([6, 8]);
    g.lineWidth = 2;
    g.strokeRect(box.x, box.y, box.w, box.h);
    g.setLineDash([]);
    g.fillStyle = "rgba(29,14,8,0.55)";
    g.font = FONTS.note;
    g.textAlign = "center";
    g.fillText(img === "none" ? "The picture could not be shown here." : "A picture is being painted for this page.", box.x + box.w / 2, box.y + box.h / 2);
  }

  /** The picture for a chapter, fetched once: the image, "loading", "none", or undefined when it has none. */
  private imageFor(chapter: string): CanvasImageSource | "loading" | "none" | undefined {
    const pic = this.laidFor?.chapters.find((c) => c.id === chapter)?.picture;
    if (!pic || pic.status === "failed") return undefined;
    if (pic.status !== "ready" || !this.pictures) return "loading";
    const key = pic.imageId ?? pic.id;
    const got = this.images.get(key);
    if (got) return got;
    this.images.set(key, "loading");
    void this.pictures(pic).then(
      (img) => {
        this.images.set(key, img ?? "none");
        this.repaint();
      },
      () => {
        this.images.set(key, "none");
        this.repaint();
      },
    );
    return "loading";
  }

  private repaint(): void {
    for (const s of Object.values(this.surf)) s.shows = "";
    if (this.held) this.paintSpread();
  }

  private layout(): void {
    if (!this.book) this.pages = [];
    else if (this.laidFor !== this.book) {
      const g = this.surf.front.g;
      this.pages = layBook(this.book, (s, f) => ((g.font = FONTS[f]), g.measureText(s).width));
      this.laidFor = this.book;
    }
  }

  /** The spread being read on the open book's two pages. */
  private paintSpread(): void {
    const s = this.at - (this.at % 2);
    this.paint(this.surf.left, s, false);
    this.paint(this.surf.right, s + 1, true);
    const said = this.narrow ? this.pages[this.at]?.said : [this.pages[s]?.said, this.pages[s + 1]?.said].filter(Boolean).join(" ");
    this.read.textContent = said ? `The narrator's book. ${said}` : "The narrator's book.";
  }

  /** The page being written, as far as the ink has come (`k`, 0..1): lines of a hand too small and far off to read. */
  private paintInk(k: number): void {
    const rows = Math.round(k * ROWS * 4) / 4;
    if (rows === this.ink) return;
    this.ink = rows;
    const s = this.surf.right;
    s.shows = "ink";
    this.paper(s, true, 99);
    const g = s.g;
    const r = rng(4242);
    g.strokeStyle = INK;
    g.lineWidth = 2.4;
    g.lineCap = "round";
    for (let row = 0; row < Math.ceil(rows); row++) {
      const y = 130 + row * 41;
      const end = 70 + (BOOK_PX.w - 140) * Math.min(1, rows - row) * (row === ROWS - 1 ? 0.55 : 0.92 + r() * 0.08);
      g.beginPath();
      let x = 70 + (row && r() < 0.15 ? 30 : 0);
      g.moveTo(x, y);
      while (x < end) {
        const step = 6 + r() * 7;
        g.quadraticCurveTo(x + step / 2, y - 6 - r() * 12, x + step, y + (r() - 0.5) * 4);
        x += step;
        if (r() < 0.12) {
          x += 9;
          g.moveTo(x, y);
        }
      }
      g.stroke();
    }
    s.tex.needsUpdate = true;
  }

  /* ---------------------------------- moving ---------------------------------- */

  /** Fly from where it is to a pose, along an arc, shutting or opening as it goes. */
  private fly(to: () => Pose, dur: number, lift: number, openFrom: number, openTo: number, openAt = 0.6, also?: (u: number) => void): Step {
    let from: Pose = { p: new Vector3(), q: new Quaternion() };
    let dst: Pose = from;
    return {
      dur,
      begin: () => {
        from = { p: this.group.position.clone(), q: this.group.quaternion.clone() };
        dst = to();
      },
      tick: (u) => {
        const e = ease(u);
        this.group.position.lerpVectors(from.p, dst.p, e);
        this.group.position.y += Math.sin(Math.PI * u) * lift;
        this.group.quaternion.slerpQuaternions(from.q, dst.q, e);
        const o = openFrom + (openTo - openFrom) * ease(Math.max(0, Math.min(1, openTo > openFrom ? (u - openAt) / (1 - openAt) : u / openAt)));
        this.shut(1 - o);
        also?.(u);
      },
    };
  }

  /** The narrator beckons the book down and opens it on the table to write in it. */
  private fetch(work: Promise<unknown>): void {
    this.state = "fetch";
    this.work = { settled: false, since: this.t };
    const w = this.work;
    void work.finally(() => (w.settled = true));
    this.layout();
    // On the left page, the last of what is written; on the right, a fresh page for the ink.
    this.paint(this.surf.left, Math.max(0, this.pages.length - 1 - (this.pages[this.pages.length - 1]?.kind === "blank" ? 1 : 0)), false);
    this.ink = -1;
    this.inkK = 0;
    this.paintInk(0);
    const n = this.h.narrator;
    n.watch(this.group.getWorldPosition(this.tmp).clone(), 1.6, this.t);
    void this.tracks
      .run([
        this.fly(() => this.tablePose(), 1.7, 0.22, 0, 1, 0.65, (u) => {
          if (u > 0.5) n.watch(ON_TABLE, 1, this.t);
        }),
      ])
      .then(() => {
        sound.play("slide", { x: ON_TABLE.x, gain: 0.5 });
        this.state = "writing";
        this.work!.since = this.t;
      });
  }

  /** Done writing: the hand comes away, the book shuts and goes back to its shelf. */
  private putAway(): void {
    this.state = "return";
    this.freeHand();
    void this.tracks.run([{ dur: 0.35 }, this.fly(() => this.shelfPose(), 1.6, 0.22, 1, 0, 0.35)]).then(() => {
      this.state = "shelf";
      this.work = null;
      this.glow = 1;
      this.next();
    });
  }

  /** A chapter that came due while the book was busy is written now, if it is still being written. */
  private next(): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    if (!this.pendingDone) this.fetch(p);
  }

  private freeHand(): void {
    if (this.hand < 0) return;
    this.h.narrator.release?.(this.hand);
    this.h.narrator.reach(this.hand, null);
    this.hand = -1;
  }

  /** Take it down from the shelf, open at its newest chapter. */
  private lift(): void {
    this.layout();
    this.at = openingPage(this.pages, this.book ?? { v: 1, hero: "", card: "", chapters: [], marks: {} });
    this.side = this.narrow ? this.at % 2 : 0.5;
    for (const s of Object.values(this.surf)) s.shows = "";
    this.paintSpread();
    this.state = "lift";
    this.h.camera.attach(this.group);
    this.setGlow(0.5);
    sound.play("slide", { x: 0.3, gain: 0.5 });
    void this.tracks.run([this.fly(() => this.holdPose(), 0.9, 0, 0, 1, 0.45)]).then(() => {
      this.state = "reading";
    });
  }

  /** Put it back on its shelf. */
  private lower(): void {
    if (this.state !== "reading") return;
    this.state = "lower";
    this.h.scene.attach(this.group);
    this.read.textContent = "";
    void this.tracks.run([this.fly(() => this.shelfPose(), 0.9, 0.05, 1, 0, 0.45)]).then(() => {
      this.state = "shelf";
      this.setGlow(0.05);
      this.next();
    });
  }

  private setGlow(k: number): void {
    for (const s of Object.values(this.surf)) s.mat.emissiveIntensity = k;
  }

  /** Turn to the page before (-1) or after (+1). */
  private async leaf(by: number): Promise<void> {
    if (this.state !== "reading") return;
    const to = this.at + by;
    if (to < 0 || to >= this.pages.length) return;
    const spread = this.at - (this.at % 2);
    const next = to - (to % 2);
    if (next === spread) {
      // The other page of the same spread: on a narrow view the book slides across to it.
      this.at = to;
      const from = this.side;
      this.state = "lift";
      await this.tracks.run([{ dur: 0.35, tick: (u) => ((this.side = from + (to % 2 - from) * ease(u)), this.place()) }]);
      this.state = "reading";
      this.paintSpread();
      return;
    }
    this.state = "lift";
    const fwd = by > 0;
    // The leaf: forward it is the right page turned over to show the next left one; back, the left page turned back.
    if (fwd) {
      this.paint(this.surf.front, spread + 1, true);
      this.paint(this.surf.back, next, false);
      this.paint(this.surf.right, next + 1, true);
    } else {
      this.paint(this.surf.back, spread, false);
      this.paint(this.surf.front, next + 1, true);
      this.paint(this.surf.left, next, false);
    }
    this.leafG.visible = true;
    sound.play("slide", { x: fwd ? 0.1 : -0.1, gain: 0.6 });
    const from = this.side;
    const side = this.narrow ? to % 2 : 0.5;
    await this.tracks.run([
      {
        dur: 0.6,
        tick: (u) => {
          const e = ease(u);
          this.leafTurn = fwd ? -Math.PI * e : -Math.PI * (1 - e);
          this.leafG.rotation.z = this.leafTurn;
          // A little lift in the middle of its turn, the way a page bows as it goes over.
          this.leafG.position.y = B + 0.0009 + Math.sin(Math.PI * e) * 0.012;
          this.side = from + (side - from) * e;
          this.place();
        },
      },
    ]);
    this.at = to;
    this.paintSpread();
    this.leafG.visible = false;
    this.state = "reading";
  }

  /** Keep it where it is held, as the view changes (a phone turned, the lens widened). */
  private place(): void {
    const p = this.holdPose();
    this.group.position.copy(p.p);
    this.group.quaternion.copy(p.q);
  }

  /* --------------------------------- pointer ---------------------------------- */

  private far(e: { clientX: number; clientY: number }): number {
    const r = this.h.host.getBoundingClientRect();
    const p = this.group.getWorldPosition(this.tmp).project(this.h.camera);
    if (p.z > 1) return Infinity;
    return Math.hypot(((p.x + 1) / 2) * r.width - (e.clientX - r.left), ((1 - p.y) / 2) * r.height - (e.clientY - r.top)) / r.height;
  }

  /** True where a click would do something of the book's. @param free your hands are free (nothing else taken up). */
  hot(e: { clientX: number; clientY: number }, free: boolean): boolean {
    if (this.held) return true;
    return free && this.state === "shelf" && this.far(e) < 0.075;
  }

  /** A click in the room. Returns true if the book used it. */
  click(e: { clientX: number; clientY: number }, free: boolean): boolean {
    if (this.state === "reading") {
      const r = this.h.host.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (x < 0.3) void this.leaf(-1);
      else if (x > 0.7) void this.leaf(1);
      else this.lower();
      return true;
    }
    if (this.held) return true;
    if (free && this.state === "shelf" && this.far(e) < 0.075) {
      this.lift();
      return true;
    }
    return false;
  }

  /** The wheel turns the pages while it is open. */
  wheel(dy: number): boolean {
    if (!this.held) return false;
    if (this.state === "reading" && Math.abs(dy) > 4) void this.leaf(dy > 0 ? 1 : -1);
    return true;
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.held || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") void this.leaf(-1);
    else if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === " ") void this.leaf(1);
    else if (k === "Escape" || k === "Enter") this.lower();
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  /* ---------------------------------- frame ----------------------------------- */

  update(t: number, dt: number): void {
    this.t = t;
    this.tracks.update(t);
    if (this.state === "reading") this.place();
    // A chapter just shelved: brighter for a while, so the eye goes to it.
    this.glow = Math.max(0, this.glow - dt / 24);
    const pulse = this.h.reduced ? 0 : Math.sin(t * 2.2) * 0.5 + 0.5;
    this.leather.emissiveIntensity = 0.12 + this.glow * (0.25 + pulse * 0.25);
    this.coverMat.emissiveIntensity = 0.1 + this.glow * (0.35 + pulse * 0.35);
    if (this.state !== "writing" || !this.work) return;
    // The ink comes up as the chapter is written: quickly at first, then slower, never quite done until it is in.
    const w = this.work;
    const since = t - w.since;
    const k = (this.inkK = w.settled ? Math.min(1, this.inkK + dt / 1.4) : Math.max(this.inkK, (1 - Math.exp(-since / WRITE_GUESS)) * 0.92));
    this.paintInk(k);
    const n = this.h.narrator;
    const where = this.inkAt(k, t);
    const arm = n.armFor(where);
    if (this.h.busy() || (this.hand < 0 && n.busy?.(arm))) {
      // The game wants the hands: the pen waits.
      this.freeHand();
    } else {
      if (this.hand !== arm) {
        this.freeHand();
        this.hand = arm;
        n.close?.(arm, "pinch");
      }
      n.reach(arm, where, true);
      if (Math.floor(t * 0.5) !== Math.floor((t - dt) * 0.5)) n.watch(where, 2.2, t);
    }
    if (w.settled && since >= WRITE_MIN && k >= 1) this.putAway();
  }

  /** Where the pen is on the page being written, in the room: along the line the ink has reached, a little above the page. */
  private inkAt(k: number, t: number): Vector3 {
    const rows = k * ROWS;
    const row = Math.min(ROWS - 1, Math.floor(rows));
    const along = rows - row;
    const still = this.h.reduced;
    const x = W * (0.12 + 0.76 * along) + (still ? 0 : Math.sin(t * 19) * 0.003);
    const z = -H / 2 + H * ((130 + row * 41) / BOOK_PX.h) + (still ? 0 : Math.sin(t * 27) * 0.002);
    // The book's own space, as it lies open (its origin the middle of the spread).
    return this.group.localToWorld(this.tmp.set(x, 0.012 + (still ? 0 : Math.abs(Math.sin(t * 9)) * 0.004), z)).clone();
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKey, true);
    this.freeHand();
    this.read.remove();
    this.group.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const s of Object.values(this.surf)) {
      s.tex.dispose();
      s.mat.dispose();
    }
    this.cover.tex.dispose();
    this.coverMat.dispose();
    this.leather.dispose();
    for (const m of this.mats) m.dispose();
  }
}
