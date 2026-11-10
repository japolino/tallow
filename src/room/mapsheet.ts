/**
 * The region sheet (docs/DESIGN.md, 4): one adventure's stops and the paths
 * between them, drawn in ink on parchment. The sheet lies on the table; the
 * pieces stand on its stops.
 *
 * The drawing is made from the sheet's data and a seed, so the same adventure
 * always gets the same map.
 */
import { fbm, mk, noise2, rng, type Canvas } from "./textures.js";

export interface MapStop {
  id: string;
  name: string;
  /** Position on the sheet, 0..1 across and 0..1 down (0 is the edge farthest from the player). */
  u: number;
  v: number;
  /** The last stop, where the adventure comes to a head. */
  climax?: boolean;
}

export interface MapSheet {
  title: string;
  seed: number;
  stops: MapStop[];
  /** Paths between stops, by id. */
  paths: [string, string][];
}

export const MAP_PX = { w: 2048, h: 1380 };

const INK = "rgba(38,24,14,.88)";
const SERIF = `"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif`;

export function drawMapSheet(sheet: MapSheet): Canvas {
  const { w, h } = MAP_PX;
  const [c, g] = mk(w, h);
  const r = rng(sheet.seed);
  const n = noise2(sheet.seed);

  // Parchment: mottled, stained toward the edges. Painted small and scaled up; it is soft anyway.
  const [pc, pg] = mk(512, 345);
  const img = pg.createImageData(512, 345);
  for (let y = 0; y < 345; y++) {
    for (let x = 0; x < 512; x++) {
      const u = x / 511, v = y / 344;
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const stain = fbm(n, u * 4, v * 4, 4);
      const fibre = fbm(n, u * 90, v * 30 + 40, 2);
      let k = 0.78 + stain * 0.3 + (fibre - 0.5) * 0.1;
      k *= 0.7 + 0.3 * Math.min(1, edge * 9 + stain * 0.5);
      const i = (y * 512 + x) * 4;
      img.data[i] = Math.min(255, 226 * k);
      img.data[i + 1] = Math.min(255, 200 * k);
      img.data[i + 2] = Math.min(255, 150 * k);
      img.data[i + 3] = 255;
    }
  }
  pg.putImageData(img, 0, 0);
  g.imageSmoothingQuality = "high";
  g.drawImage(pc, 0, 0, w, h);

  // Old fold lines.
  g.strokeStyle = "rgba(70,46,24,.2)";
  g.lineWidth = 5;
  for (const fx of [w / 3, (2 * w) / 3]) {
    g.beginPath();
    g.moveTo(fx + (r() - 0.5) * 8, 0);
    g.lineTo(fx + (r() - 0.5) * 8, h);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(0, h / 2);
  g.lineTo(w, h / 2);
  g.stroke();

  const X = (u: number) => 130 + u * (w - 260);
  const Y = (v: number) => 150 + v * (h - 280);
  const wobble = (k: number) => (r() - 0.5) * k;

  // The sea: a coast down one side, with short wave ticks beyond it.
  const coast: [number, number][] = [];
  for (let y = -20; y <= h + 20; y += 16) coast.push([w * 0.83 + (fbm(n, 2.2, y / 210, 4) - 0.5) * 360 + Math.sin(y / 190) * 50, y]);
  g.fillStyle = "rgba(88,112,112,.2)";
  g.beginPath();
  g.moveTo(w, -20);
  for (const [x, y] of coast) g.lineTo(x, y);
  g.lineTo(w, h + 20);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 3.2;
  g.lineJoin = "round";
  g.beginPath();
  coast.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  g.lineWidth = 1.3;
  g.strokeStyle = "rgba(38,24,14,.45)";
  for (const off of [13, 28]) {
    g.beginPath();
    coast.forEach(([x, y], i) => (i ? g.lineTo(x + off, y) : g.moveTo(x + off, y)));
    g.stroke();
  }
  for (let i = 0; i < 70; i++) {
    const y = r() * h;
    const cx = coast[Math.min(coast.length - 1, Math.max(0, Math.round((y + 20) / 16)))]![0];
    const x = cx + 60 + r() * (w - cx - 60);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 9, y - 6, x + 18, y);
    g.quadraticCurveTo(x + 27, y + 6, x + 36, y);
    g.stroke();
  }

  const nearStop = (x: number, y: number, d: number) => sheet.stops.some((s) => Math.hypot(X(s.u) - x, Y(s.v) - y) < d);
  const inSea = (x: number, y: number) => x > coast[Math.min(coast.length - 1, Math.max(0, Math.round((y + 20) / 16)))]![0] - 30;

  // Mountains: a few ranges of inked peaks, shaded on one side.
  g.strokeStyle = INK;
  g.fillStyle = "rgba(38,24,14,.3)";
  for (let range = 0; range < 4; range++) {
    let x = 200 + r() * (w * 0.6), y = 190 + r() * (h - 420);
    const dir = r() * Math.PI * 2;
    for (let k = 0; k < 9; k++) {
      const px = x + wobble(26), py = y + wobble(22);
      x += Math.cos(dir) * 58 + wobble(16);
      y += Math.sin(dir) * 30 + wobble(16);
      if (nearStop(px, py, 95) || inSea(px, py) || px < 120 || px > w - 120 || py < 170 || py > h - 130) continue;
      const s = 30 + r() * 26;
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(px - s, py + s * 0.55);
      g.lineTo(px - s * 0.1 + wobble(4), py - s * 0.75);
      g.lineTo(px + s, py + s * 0.55);
      g.stroke();
      g.beginPath();
      g.moveTo(px - s * 0.1, py - s * 0.75);
      g.lineTo(px + s * 0.22, py + s * 0.1);
      g.lineTo(px + s * 0.05, py + s * 0.5);
      g.lineTo(px + s, py + s * 0.55);
      g.closePath();
      g.fill();
    }
  }

  // Woods: clusters of small round trees.
  for (let wood = 0; wood < 7; wood++) {
    const cx = 180 + r() * (w * 0.68), cy = 190 + r() * (h - 380);
    const count = 14 + Math.floor(r() * 22);
    for (let k = 0; k < count; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 120;
      const px = cx + Math.cos(a) * d * 1.3, py = cy + Math.sin(a) * d * 0.7;
      if (nearStop(px, py, 70) || inSea(px, py) || px < 120 || py < 170 || py > h - 130) continue;
      g.lineWidth = 1.8;
      g.strokeStyle = INK;
      g.fillStyle = "rgba(74,82,44,.3)";
      g.beginPath();
      g.arc(px, py - 9, 9 + r() * 3, Math.PI * 0.9, Math.PI * 2.1);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(px, py - 1);
      g.lineTo(px, py + 7);
      g.stroke();
    }
  }

  // A river running down to the sea.
  g.strokeStyle = "rgba(56,84,92,.75)";
  g.lineWidth = 5;
  g.lineCap = "round";
  g.beginPath();
  let rx = w * 0.18, ry = 150;
  g.moveTo(rx, ry);
  for (let k = 0; k < 44; k++) {
    rx += 30 + (fbm(n, k / 5, 7.7, 2) - 0.35) * 46;
    ry += 22 + (fbm(n, k / 4, 3.1, 2) - 0.5) * 40;
    g.lineTo(rx, ry);
    if (inSea(rx, ry)) break;
  }
  g.stroke();

  // The paths: dashes of ink from stop to stop, each with a slight bow.
  const byId = new Map(sheet.stops.map((s) => [s.id, s]));
  g.strokeStyle = "rgba(96,24,16,.85)";
  g.lineWidth = 4.2;
  g.setLineDash([16, 13]);
  for (const [a, b] of sheet.paths) {
    const A = byId.get(a), B = byId.get(b);
    if (!A || !B) continue;
    const ax = X(A.u), ay = Y(A.v), bx = X(B.u), by = Y(B.v);
    const mx = (ax + bx) / 2 + (by - ay) * 0.14, my = (ay + by) / 2 - (bx - ax) * 0.14;
    g.beginPath();
    g.moveTo(ax, ay);
    g.quadraticCurveTo(mx, my, bx, by);
    g.stroke();
  }
  g.setLineDash([]);

  // The stops: an inked ring, and a name under it. The last stop is marked heavier.
  sheet.stops.forEach((s, i) => {
    const x = X(s.u), y = Y(s.v);
    g.fillStyle = "rgba(226,202,156,.92)";
    g.strokeStyle = INK;
    g.lineWidth = s.climax ? 6 : 4;
    g.beginPath();
    g.arc(x, y, s.climax ? 31 : 25, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (s.climax) {
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 40, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = s.climax ? "rgba(120,20,14,.9)" : INK;
    g.font = `italic 600 ${s.climax ? 32 : 27}px ${SERIF}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(i + 1), x, y + 2);
    g.font = `italic 600 38px ${SERIF}`;
    g.lineWidth = 9;
    g.strokeStyle = "rgba(226,202,156,.85)";
    g.strokeText(s.name, x, y + 64);
    g.fillStyle = INK;
    g.fillText(s.name, x, y + 64);
  });

  // The title, top left, with a rule under it.
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillStyle = INK;
  g.font = `italic 600 62px ${SERIF}`;
  g.fillText(sheet.title, 150, 120);
  const tw = g.measureText(sheet.title).width;
  g.lineWidth = 2.5;
  g.strokeStyle = INK;
  g.beginPath();
  g.moveTo(150, 138);
  g.lineTo(150 + tw, 138);
  g.stroke();

  // A compass, out in the sea at the bottom right.
  const cx = w - 200, cy = h - 210;
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(cx, cy, 62, 0, Math.PI * 2);
  g.stroke();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
    const len = k % 2 ? 44 : 84;
    g.fillStyle = k % 2 ? "rgba(38,24,14,.4)" : INK;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    g.lineTo(cx + Math.cos(a + 1.35) * 11, cy + Math.sin(a + 1.35) * 11);
    g.lineTo(cx + Math.cos(a - 1.35) * 11, cy + Math.sin(a - 1.35) * 11);
    g.closePath();
    g.fill();
  }
  g.font = `600 34px ${SERIF}`;
  g.textAlign = "center";
  g.fillStyle = INK;
  g.fillText("N", cx, cy - 96);

  // A double border.
  g.strokeStyle = INK;
  g.lineWidth = 5;
  g.strokeRect(46, 46, w - 92, h - 92);
  g.lineWidth = 1.6;
  g.strokeRect(62, 62, w - 124, h - 124);
  return c;
}

/** Where a stop's position (0..1, 0..1) lands on the drawn sheet, as a fraction of the whole sheet. */
export function stopOnSheet(u: number, v: number): { u: number; v: number } {
  return { u: (130 + u * (MAP_PX.w - 260)) / MAP_PX.w, v: (150 + v * (MAP_PX.h - 280)) / MAP_PX.h };
}
