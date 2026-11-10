/**
 * Every surface in the room is painted here, in code, onto canvases: wood,
 * plaster, the leaded window, frost, flames, glows. Nothing is downloaded.
 * Each function is seeded, so the room looks the same every time.
 */

export type Canvas = HTMLCanvasElement;

export function mk(w: number, h: number): [Canvas, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

/** A small seeded generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise on a lattice, 0..1. */
export function noise2(seed: number): (x: number, y: number) => number {
  const r = rng(seed);
  const N = 256;
  const g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x: number, y: number) => g[(((y % N) + N) % N) * N + (((x % N) + N) % N)]!;
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

export function fbm(n: (x: number, y: number) => number, x: number, y: number, oct: number): number {
  let v = 0, amp = 0.5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) {
    v += n(x * f, y * f) * amp;
    tot += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return v / tot;
}

type Rgb = [number, number, number];

/**
 * Planked wood, grain running along x. `planks` boards across the height,
 * each with its own tint and grain offset, dark seams between them.
 */
export function woodCanvas(w: number, h: number, o: { planks: number; seed: number; dark: Rgb; light: Rgb; seam?: number }): Canvas {
  const [c, g] = mk(w, h);
  const img = g.createImageData(w, h);
  const n = noise2(o.seed);
  const n2 = noise2(o.seed + 11);
  const r = rng(o.seed + 5);
  const off = Array.from({ length: o.planks }, () => ({ u: r() * 40, tint: 0.82 + r() * 0.3, knotX: r(), knotY: 0.25 + r() * 0.5, knot: r() < 0.45 }));
  const seam = o.seam ?? 0.012;
  for (let y = 0; y < h; y++) {
    const v = (y / h) * o.planks;
    const pi = Math.min(o.planks - 1, Math.floor(v));
    const pv = v - pi;
    const p = off[pi]!;
    const edge = Math.min(pv, 1 - pv);
    const seamK = edge < seam ? 0.35 + 0.65 * (edge / seam) : 1;
    for (let x = 0; x < w; x++) {
      const u = (x / w) * 4 + p.u;
      // A knot bends the grain around itself.
      let bend = 0;
      let knotDark = 0;
      if (p.knot) {
        const dx = (x / w - p.knotX) * 4;
        const dy = (pv - p.knotY) * 1.1;
        const d = Math.hypot(dx * 0.6, dy);
        bend = Math.exp(-d * d * 28) * 0.9 * Math.sign(dy || 1);
        knotDark = Math.exp(-d * d * 220);
      }
      const warp = fbm(n, u * 1.3, pv * 1.5 + pi * 3.1, 3) * 0.9;
      const rings = fbm(n, u * 0.7 + warp, (pv + bend * 0.12) * 16 + pi * 7.3 + warp * 2.2, 4);
      const pores = n2(u * 46, pv * 170 + pi * 9);
      let t = rings * 0.82 + pores * 0.18;
      t = Math.max(0, Math.min(1, (t - 0.28) * 1.9));
      const k = p.tint * seamK * (1 - knotDark * 0.7);
      const i = (y * w + x) * 4;
      img.data[i] = Math.min(255, (o.dark[0] + (o.light[0] - o.dark[0]) * t) * k);
      img.data[i + 1] = Math.min(255, (o.dark[1] + (o.light[1] - o.dark[1]) * t) * k);
      img.data[i + 2] = Math.min(255, (o.dark[2] + (o.light[2] - o.dark[2]) * t) * k);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Old lime plaster: mottled, stained darker toward the floor, hairline cracks. */
export function plasterCanvas(w: number, h: number, seed: number, base: Rgb): Canvas {
  const [c, g] = mk(w, h);
  const img = g.createImageData(w, h);
  const n = noise2(seed);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const big = fbm(n, u * 5, v * 5, 4);
      const fine = fbm(n, u * 60 + 9, v * 60, 2);
      const k = 0.62 + big * 0.5 + (fine - 0.5) * 0.16;
      const i = (y * w + x) * 4;
      img.data[i] = Math.min(255, base[0] * k);
      img.data[i + 1] = Math.min(255, base[1] * k);
      img.data[i + 2] = Math.min(255, base[2] * k);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const r = rng(seed + 3);
  g.strokeStyle = "rgba(20,14,10,.35)";
  g.lineWidth = 1;
  for (let k = 0; k < 7; k++) {
    let x = r() * w, y = r() * h;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 30; s++) {
      x += (r() - 0.5) * 14;
      y += r() * 9;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

/**
 * A leaded window: diamond panes held in lead cames, a heavier mullion and
 * transom, all inside an arch (or a plain rectangle). Opaque where there is
 * lead or frame, clear elsewhere, so the same canvas masks the light: the
 * sun throws this lattice across the table.
 * @param arch 0 for a rectangle, else the fraction of the height where the arch springs.
 */
export function latticeCanvas(w: number, h: number, o: { cols: number; rows: number; arch: number; lead: number }): Canvas {
  const [c, g] = mk(w, h);
  g.clearRect(0, 0, w, h);
  const outline = () => {
    g.beginPath();
    if (o.arch > 0) {
      const sp = h * (1 - o.arch);
      g.moveTo(0, h);
      g.lineTo(0, sp);
      g.ellipse(w / 2, sp, w / 2, sp, 0, Math.PI, 0);
      g.lineTo(w, h);
    } else g.rect(0, 0, w, h);
    g.closePath();
  };
  // Everything outside the opening is solid, so the light only comes through the arch.
  g.fillStyle = "#1a1612";
  g.fillRect(0, 0, w, h);
  g.save();
  outline();
  g.clip();
  g.clearRect(0, 0, w, h);
  g.strokeStyle = "#16130f";
  g.lineWidth = o.lead;
  const dx = w / o.cols, dy = h / o.rows;
  for (let i = -o.rows; i <= o.cols + o.rows; i++) {
    g.beginPath();
    g.moveTo(i * dx, 0);
    g.lineTo(i * dx + (h / dy) * dx * 0.5, h);
    g.stroke();
    g.beginPath();
    g.moveTo(i * dx, 0);
    g.lineTo(i * dx - (h / dy) * dx * 0.5, h);
    g.stroke();
  }
  g.lineWidth = o.lead * 3;
  g.beginPath();
  g.moveTo(w / 2, 0);
  g.lineTo(w / 2, h);
  g.moveTo(0, h * 0.56);
  g.lineTo(w, h * 0.56);
  g.stroke();
  g.restore();
  g.strokeStyle = "#16130f";
  g.lineWidth = o.lead * 4;
  outline();
  g.stroke();
  return c;
}

/** Frost creeping in from the edges of the panes. White with alpha. */
export function frostCanvas(w: number, h: number, seed: number): Canvas {
  const [c, g] = mk(w, h);
  const img = g.createImageData(w, h);
  const n = noise2(seed);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const edge = Math.min(u, 1 - u, v * 0.8, (1 - v) * 1.6);
      const fern = fbm(n, u * 9, v * 9, 4);
      const fine = fbm(n, u * 70, v * 70, 2);
      // Thick at the edges of the glass, thinning to nothing in the middle, so the weather can still be seen through it.
      let a = (0.26 - edge) * 3.4 + (fern - 0.5) * 1.1;
      a = Math.max(0, Math.min(1, a)) * (0.6 + fine * 0.5);
      const i = (y * w + x) * 4;
      img.data[i] = 232;
      img.data[i + 1] = 240;
      img.data[i + 2] = 250;
      img.data[i + 3] = Math.min(255, a * 235);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * Rain on the glass: beads of water and the trails of the ones that have run. White on transparent; it repeats up
 * and down, so the room can slide it down the pane for ever.
 */
export function rainGlassCanvas(seed: number): Canvas {
  const w = 256, h = 512;
  const [c, g] = mk(w, h);
  const r = rng(seed);
  g.lineCap = "round";
  for (let i = 0; i < 34; i++) {
    const x = r() * w, y0 = r() * h, len = 60 + r() * 220, wd = 1.2 + r() * 1.8;
    for (const dy of [-h, 0, h]) {
      // The trail thins out behind the bead that left it.
      const gr = g.createLinearGradient(0, y0 + dy, 0, y0 + dy + len);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(1, "rgba(255,255,255,.5)");
      g.strokeStyle = gr;
      g.lineWidth = wd;
      g.beginPath();
      g.moveTo(x, y0 + dy);
      let xx = x;
      for (let k = 1; k <= 8; k++) {
        xx += (((i * 7 + k * 13) % 5) - 2) * 0.7;
        g.lineTo(xx, y0 + dy + (len * k) / 8);
      }
      g.stroke();
      g.fillStyle = "rgba(255,255,255,.85)";
      g.beginPath();
      g.ellipse(xx, y0 + dy + len + 2, wd * 1.5, wd * 2.1, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let i = 0; i < 260; i++) {
    const x = r() * w, y = r() * h, s = 0.7 + r() * 1.8;
    g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.45})`;
    for (const dy of [-h, 0, h]) {
      g.beginPath();
      g.ellipse(x, y + dy, s, s * 1.25, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/** A soft round glow, white on transparent. `core` sharpens the centre. */
export function glowCanvas(size: number, core = 0.12): Canvas {
  const [c, g] = mk(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(core, "rgba(255,255,255,.75)");
  gr.addColorStop(0.45, "rgba(255,255,255,.16)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

/** A candle flame: a teardrop, white core through amber to nothing. */
export function flameCanvas(): Canvas {
  const [c, g] = mk(64, 128);
  const gr = g.createRadialGradient(32, 92, 2, 32, 78, 62);
  gr.addColorStop(0, "rgba(255,255,235,1)");
  gr.addColorStop(0.22, "rgba(255,214,120,.96)");
  gr.addColorStop(0.55, "rgba(255,120,30,.5)");
  gr.addColorStop(1, "rgba(255,60,0,0)");
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(32, 4);
  g.bezierCurveTo(54, 54, 56, 118, 32, 122);
  g.bezierCurveTo(8, 118, 10, 54, 32, 4);
  g.fill();
  // The blue root of the flame, around the wick.
  const b = g.createRadialGradient(32, 112, 0, 32, 112, 16);
  b.addColorStop(0, "rgba(90,130,255,.55)");
  b.addColorStop(1, "rgba(90,130,255,0)");
  g.globalCompositeOperation = "lighter";
  g.fillStyle = b;
  g.fillRect(8, 92, 48, 34);
  return c;
}

/** Soft streaks for the shafts of light: bright bands that fade along the beam (x) and vary across it (y). */
export function shaftCanvas(seed: number): Canvas {
  const [c, g] = mk(256, 64);
  const img = g.createImageData(256, 64);
  const n = noise2(seed);
  for (let y = 0; y < 64; y++) {
    const band = 0.45 + 0.55 * fbm(n, 3.3, y / 5, 3);
    const edge = Math.sin((y / 63) * Math.PI);
    for (let x = 0; x < 256; x++) {
      const u = x / 255;
      // Bright at the window, gone by the far end; and never a hard start.
      const along = Math.pow(1 - u, 1.6) * Math.min(1, u * 14);
      const a = band * Math.pow(edge, 0.7) * along;
      const i = (y * 256 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** A puff of breath or smoke: a lumpy soft cloud, white on transparent. */
export function puffCanvas(seed: number): Canvas {
  const s = 128;
  const [c, g] = mk(s, s);
  const img = g.createImageData(s, s);
  const n = noise2(seed);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (x - s / 2) / (s / 2), dy = (y - s / 2) / (s / 2);
      const d = Math.hypot(dx, dy);
      const lump = fbm(n, x / 22, y / 22, 3);
      const a = Math.max(0, 1 - d * (0.9 + (lump - 0.5) * 0.9));
      const i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** A bare winter tree line, black on transparent, for the view out of the windows. */
export function treelineCanvas(seed: number): Canvas {
  const w = 1024, h = 512;
  const [c, g] = mk(w, h);
  const r = rng(seed);
  const n = noise2(seed);
  g.fillStyle = "#000";
  // Rolling ground.
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.78 - fbm(n, x / 180, 1.5, 3) * h * 0.16);
  g.lineTo(w, h);
  g.fill();
  const branch = (x: number, y: number, a: number, len: number, wd: number, depth: number) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.lineWidth = wd;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    if (depth <= 0) return;
    const kids = 2 + (r() < 0.35 ? 1 : 0);
    for (let k = 0; k < kids; k++) branch(x2, y2, a + (r() - 0.5) * 1.25, len * (0.62 + r() * 0.2), wd * 0.66, depth - 1);
  };
  g.strokeStyle = "#000";
  g.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const x = 40 + (i / 8) * (w - 80) + (r() - 0.5) * 60;
    const y = h * 0.78 - fbm(n, x / 180, 1.5, 3) * h * 0.16 + 6;
    branch(x, y, -Math.PI / 2 + (r() - 0.5) * 0.2, 60 + r() * 60, 9 + r() * 6, 6);
  }
  return c;
}

/** Leather for book covers: pebbled, worn at the edges. */
export function leatherCanvas(seed: number, base: Rgb): Canvas {
  const s = 256;
  const [c, g] = mk(s, s);
  const img = g.createImageData(s, s);
  const n = noise2(seed);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const k = 0.7 + fbm(n, x / 5, y / 5, 2) * 0.35 + fbm(n, x / 60, y / 60, 2) * 0.25;
      const i = (y * s + x) * 4;
      img.data[i] = Math.min(255, base[0] * k);
      img.data[i + 1] = Math.min(255, base[1] * k);
      img.data[i + 2] = Math.min(255, base[2] * k);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** A loose sheet with a few lines of handwriting: the player's notes on the near side of the table. */
export function notesCanvas(seed: number): Canvas {
  const w = 384, h = 512;
  const [c, g] = mk(w, h);
  const n = noise2(seed);
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = 0.86 + fbm(n, x / 70, y / 70, 3) * 0.2;
      const i = (y * w + x) * 4;
      img.data[i] = 222 * k;
      img.data[i + 1] = 204 * k;
      img.data[i + 2] = 166 * k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const r = rng(seed + 1);
  g.strokeStyle = "rgba(40,26,16,.72)";
  g.lineWidth = 1.6;
  g.lineCap = "round";
  for (let line = 0; line < 13; line++) {
    const y = 60 + line * 32;
    let x = 40;
    const end = w - 40 - (line % 4 === 3 ? 120 * r() + 40 : r() * 30);
    while (x < end) {
      const word = 16 + r() * 44;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < word; k += 4) g.lineTo(x + k, y + Math.sin(k * 0.9 + r() * 6) * 4 * r() - (r() < 0.12 ? 8 : 0));
      g.stroke();
      x += word + 10;
    }
  }
  return c;
}
