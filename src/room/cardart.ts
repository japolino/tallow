/**
 * The faces and backs of the cards, drawn in code (docs/DESIGN.md, 8.1): our own tarot-style set. A picture in an
 * arched window over an engraved sky, a gold-foil frame, a ribbon with the card's title, and, on a card that does
 * something, a panel under the picture with what it does. Every kind of card has its own picture, made of flat shapes
 * in dark ink, each with a warm halo of light round it, the way a print is lit from behind. Nothing is copied from any
 * deck.
 *
 * Everything is drawn on a card 300 by 500 across and down, at twice that many pixels, so that a card held up to the
 * eyes (tablecards.ts, look) is still sharp.
 */
import { cardKind, type CardFamily } from "../engine/cards.js";
import { mk, rng, type Canvas } from "./textures.js";

/** How many pixels a card is drawn at. */
export const CARD_PX = { w: 600, h: 1000 };
/** The card as it is drawn on, before it is scaled to its pixels. */
const W = 300, H = 500;
const SCALE = CARD_PX.w / W;

const GOLD = "#c9a04a";
const GOLD_DARK = "#7d5f22";
const INK = "#1b130d";
const PAPER = "#e9dcb8";
const SERIF = `"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif`;
const TAU = Math.PI * 2;

/** Each family's sky: its top, its foot, and the light that glows behind the picture. The second is the colour of its back. */
const SKY: Record<CardFamily, [string, string, string]> = {
  person: ["#4a8a90", "#11282b", "rgba(240,220,160,"],
  obstacle: ["#a77e48", "#2a1c0e", "rgba(250,220,150,"],
  fight: ["#a8412f", "#260b09", "rgba(255,190,120,"],
  thing: ["#7f8e44", "#1c210c", "rgba(245,232,165,"],
  place: ["#5653a0", "#12112c", "rgba(225,215,255,"],
};

type G = CanvasRenderingContext2D;

const path = (g: G, pts: number[][], close = true): void => {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x!, y!) : g.moveTo(x!, y!)));
  if (close) g.closePath();
};
const disc = (g: G, x: number, y: number, r: number): void => {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
};

/**
 * A standing figure in a long robe: the shape most people on the cards are made from. Centre at x, feet at y. The
 * robe falls from the shoulders and flares to the hem; the arms are sleeves with a hand at the end.
 */
function figure(g: G, x: number, y: number, s = 1, o: { arms?: "down" | "out" | "up" | "folded"; hood?: boolean } = {}): void {
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(x - 37 * s, y);
  g.bezierCurveTo(x - 31 * s, y - 60 * s, x - 26 * s, y - 108 * s, x - 25 * s, y - 130 * s);
  g.bezierCurveTo(x - 24 * s, y - 146 * s, x - 15 * s, y - 152 * s, x - 7 * s, y - 154 * s);
  g.lineTo(x + 7 * s, y - 154 * s);
  g.bezierCurveTo(x + 15 * s, y - 152 * s, x + 24 * s, y - 146 * s, x + 25 * s, y - 130 * s);
  g.bezierCurveTo(x + 26 * s, y - 108 * s, x + 31 * s, y - 60 * s, x + 37 * s, y);
  g.quadraticCurveTo(x, y + 7 * s, x - 37 * s, y);
  g.fill();
  // Neck and head.
  g.fillRect(x - 5 * s, y - 162 * s, 10 * s, 12 * s);
  g.beginPath();
  g.ellipse(x, y - 172 * s, 13.5 * s, 16 * s, 0, 0, TAU);
  g.fill();
  if (o.hood) {
    g.beginPath();
    g.moveTo(x - 23 * s, y - 138 * s);
    g.bezierCurveTo(x - 28 * s, y - 176 * s, x - 15 * s, y - 199 * s, x + 2 * s, y - 200 * s);
    g.bezierCurveTo(x + 19 * s, y - 198 * s, x + 28 * s, y - 176 * s, x + 23 * s, y - 138 * s);
    g.closePath();
    g.fill();
  }
  const arm = (fx: number, fy: number, tx: number, ty: number, bend: number): void => {
    g.strokeStyle = INK;
    g.lineCap = "round";
    g.lineWidth = 11 * s;
    g.beginPath();
    g.moveTo(x + fx * s, y + fy * s);
    g.quadraticCurveTo(x + ((fx + tx) / 2 + bend) * s, y + ((fy + ty) / 2) * s, x + tx * s, y + ty * s);
    g.stroke();
    disc(g, x + tx * s, y + ty * s, 6 * s);
    g.fill();
  };
  const arms = o.arms ?? "down";
  if (arms === "out") {
    arm(-18, -140, -58, -102, -6);
    arm(18, -140, 58, -102, 6);
  } else if (arms === "up") {
    arm(-18, -142, -44, -198, -10);
    arm(18, -142, 44, -198, 10);
  } else if (arms === "folded") {
    // The forearms across the chest, a shade lighter so they read against the robe.
    g.fillStyle = "rgba(255,230,180,0.14)";
    g.beginPath();
    g.ellipse(x, y - 116 * s, 22 * s, 6 * s, -0.08, 0, TAU);
    g.fill();
  }
}

/** Rays behind a picture: the gold sunburst every card has somewhere, in thin wedges that fade outward. */
function rays(g: G, x: number, y: number, r: number, n = 18): void {
  const fade = g.createRadialGradient(x, y, r * 0.2, x, y, r);
  fade.addColorStop(0, "rgba(250,220,140,0.55)");
  fade.addColorStop(1, "rgba(250,220,140,0)");
  g.fillStyle = fade;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const wide = (TAU / n) * (i % 2 ? 0.16 : 0.3);
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * 0.22, y + Math.sin(a) * r * 0.22);
    g.lineTo(x + Math.cos(a - wide) * r, y + Math.sin(a - wide) * r);
    g.lineTo(x + Math.cos(a + wide) * r, y + Math.sin(a + wide) * r);
    g.closePath();
    g.fill();
  }
}

/** The ground: hills or a floor, under the figure, darker toward you, with the light along its top edge. */
function ground(g: G, y: number, hills = true): void {
  const fill = g.createLinearGradient(0, y - 20, 0, 390);
  fill.addColorStop(0, "rgba(16,10,5,0.55)");
  fill.addColorStop(1, "rgba(8,5,2,0.92)");
  const edge = (): void => {
    g.beginPath();
    g.moveTo(20, hills ? y + 6 : y);
    if (hills) g.bezierCurveTo(90, y - 18, 160, y + 14, 280, y - 8);
    else g.lineTo(280, y);
  };
  g.fillStyle = fill;
  edge();
  g.lineTo(280, 400);
  g.lineTo(20, 400);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(255,225,160,0.22)";
  g.lineWidth = 1.5;
  edge();
  g.stroke();
}

/** Each kind's picture, inside the window (about 40..260 across, 40..380 down; the window's arch tops out at 34). */
const PICTURES: Record<string, (g: G, r: () => number) => void> = {
  keeper(g) {
    ground(g, 340, false);
    g.fillStyle = INK;
    g.fillRect(40, 250, 220, 12); // the bar
    g.fillRect(222, 230, 14, 110);
    figure(g, 120, 340, 0.85, { arms: "folded" });
    g.fillStyle = PAPER;
    g.fillRect(96, 230, 40, 26); // the ledger
    g.strokeStyle = INK;
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(100, 237 + i * 7);
      g.lineTo(132, 237 + i * 7);
      g.stroke();
    }
  },
  host(g) {
    rays(g, 150, 170, 90);
    figure(g, 150, 300, 1, { arms: "out" });
    g.fillStyle = "#5a3a1c";
    g.fillRect(40, 280, 220, 60); // counter
    g.fillStyle = GOLD;
    g.fillRect(80, 262, 16, 20);
    g.fillRect(204, 262, 16, 20);
    disc(g, 150, 250, 10);
    g.fill();
  },
  miller(g) {
    ground(g, 345);
    g.strokeStyle = INK;
    g.lineWidth = 7;
    disc(g, 205, 210, 52);
    g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(205, 210);
      g.lineTo(205 + Math.cos(a) * 52, 210 + Math.sin(a) * 52);
      g.stroke();
    }
    figure(g, 105, 345, 0.85, { arms: "down" });
    g.fillStyle = PAPER;
    path(g, [[150, 345], [158, 310], [182, 310], [190, 345]]);
    g.fill();
  },
  warden(g) {
    rays(g, 150, 160, 100);
    figure(g, 150, 350, 1.05, { arms: "folded" });
    g.strokeStyle = GOLD;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(150, 188, 26, 0.2, Math.PI - 0.2);
    g.stroke();
    disc(g, 182, 280, 9);
    g.stroke();
  },
  guardian(g) {
    g.fillStyle = "rgba(10,6,4,0.5)";
    g.fillRect(70, 110, 160, 240);
    g.fillStyle = "rgba(233,200,110,0.25)";
    g.fillRect(90, 130, 120, 220);
    figure(g, 150, 350, 1, { arms: "folded" });
  },
  rival(g) {
    rays(g, 150, 150, 80, 12);
    figure(g, 150, 345, 1, { arms: "down" });
    g.fillStyle = "#b8323a";
    disc(g, 196, 268, 12);
    g.fill();
    g.strokeStyle = "#2c4a1c";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(196, 280);
    g.lineTo(190, 320);
    g.stroke();
  },
  beloved(g) {
    rays(g, 150, 150, 110, 24);
    figure(g, 150, 345, 1, { arms: "down" });
    g.strokeStyle = "#c7524a";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(160, 160);
    g.bezierCurveTo(200, 150, 220, 190, 250, 170);
    g.stroke();
    g.fillStyle = "#c7524a";
    g.beginPath();
    g.moveTo(150, 92);
    g.bezierCurveTo(130, 70, 105, 95, 150, 122);
    g.bezierCurveTo(195, 95, 170, 70, 150, 92);
    g.fill();
  },
  companion(g) {
    ground(g, 340);
    figure(g, 135, 340, 0.95, { arms: "down", hood: true });
    g.strokeStyle = INK;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(178, 170);
    g.lineTo(190, 345);
    g.stroke();
    g.fillStyle = "#5a3a1c";
    path(g, [[100, 200], [92, 255], [118, 262], [122, 205]]);
    g.fill();
  },
  gate(g) {
    g.fillStyle = INK;
    g.fillRect(50, 120, 26, 240);
    g.fillRect(224, 120, 26, 240);
    g.fillStyle = "#4a3018";
    g.fillRect(76, 150, 148, 210);
    g.strokeStyle = INK;
    g.lineWidth = 4;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(80 + i * 30, 150);
      g.lineTo(80 + i * 30, 360);
      g.stroke();
    }
    g.fillStyle = INK;
    g.fillRect(56, 240, 188, 18);
    g.fillStyle = GOLD;
    disc(g, 150, 100, 12);
    g.fill();
  },
  climb(g) {
    g.fillStyle = "#3a2a18";
    path(g, [[40, 380], [40, 120], [120, 90], [180, 160], [260, 110], [260, 380]]);
    g.fill();
    g.strokeStyle = PAPER;
    g.lineWidth = 4;
    g.setLineDash([10, 8]);
    path(g, [[60, 360], [200, 310], [80, 260], [210, 210], [120, 150]], false);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#e8a23a";
    disc(g, 120, 104, 10);
    g.fill();
  },
  contest(g) {
    g.fillStyle = INK;
    g.fillRect(146, 230, 8, 140);
    for (const [r, c] of [[60, PAPER], [44, "#b8323a"], [28, PAPER], [12, GOLD]] as const) {
      g.fillStyle = c;
      disc(g, 150, 200, r);
      g.fill();
    }
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(200, 160);
    g.lineTo(250, 120);
    g.stroke();
  },
  ambush(g) {
    ground(g, 345);
    g.fillStyle = "#1e2a16";
    for (const x of [60, 240]) {
      path(g, [[x - 34, 345], [x, 110], [x + 34, 345]]);
      g.fill();
    }
    figure(g, 150, 345, 0.95, { arms: "up" });
    g.strokeStyle = "#d8d8d0";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(190, 150);
    g.lineTo(230, 92);
    g.stroke();
  },
  sentries(g) {
    g.fillStyle = "#4a4038";
    g.fillRect(40, 300, 220, 80);
    figure(g, 100, 320, 0.8);
    figure(g, 200, 320, 0.8);
    g.strokeStyle = "#cfcfc8";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(80, 120);
    g.lineTo(220, 300);
    g.moveTo(220, 120);
    g.lineTo(80, 300);
    g.stroke();
  },
  token(g) {
    rays(g, 150, 210, 120);
    g.fillStyle = "#8a5a2c";
    disc(g, 150, 220, 62);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 5;
    disc(g, 150, 220, 46);
    g.stroke();
    path(g, [[150, 186], [176, 236], [124, 236]]);
    g.stroke();
    g.beginPath();
    g.moveTo(150, 158);
    g.lineTo(150, 90);
    g.stroke();
  },
  water(g) {
    // Bands of water, each a little paler toward you, with stepping stones across.
    for (let i = 0; i < 7; i++) {
      const y = 196 + i * 27;
      g.fillStyle = `rgba(${150 + i * 10},${195 + i * 6},${210 + i * 4},${0.18 + i * 0.05})`;
      g.beginPath();
      g.moveTo(20, y + 16);
      g.lineTo(20, y);
      for (let x = 20; x < 280; x += 26) g.bezierCurveTo(x + 7, y - 9, x + 19, y - 9, x + 26, y);
      g.lineTo(280, y + 16);
      g.closePath();
      g.fill();
    }
    g.fillStyle = INK;
    for (const [x, y, rx] of [[78, 340, 24], [140, 306, 20], [196, 276, 17], [240, 252, 13]]) {
      g.beginPath();
      g.ellipse(x!, y!, rx!, rx! * 0.38, 0, 0, TAU);
      g.fill();
    }
  },
  crowd(g) {
    // Rows of heads and shoulders, smaller and paler toward the back, under three lamps.
    g.fillStyle = "#f0c060";
    for (const x of [80, 150, 220]) {
      disc(g, x, 168, 7);
      g.fill();
    }
    for (let row = 0; row < 4; row++) {
      const s = 0.62 + row * 0.16;
      const y = 228 + row * 40;
      g.fillStyle = row === 3 ? INK : `rgba(27,19,13,${0.55 + row * 0.15})`;
      for (let i = -1; i < 8; i++) {
        const x = 40 + i * 34 * s + (row % 2) * 16;
        g.beginPath();
        g.ellipse(x, y, 11 * s, 13 * s, 0, 0, TAU);
        g.fill();
        g.beginPath();
        g.moveTo(x - 22 * s, y + 46 * s);
        g.bezierCurveTo(x - 21 * s, y + 18 * s, x - 12 * s, y + 12 * s, x, y + 12 * s);
        g.bezierCurveTo(x + 12 * s, y + 12 * s, x + 21 * s, y + 18 * s, x + 22 * s, y + 46 * s);
        g.closePath();
        g.fill();
      }
    }
  },
  hound(g) {
    ground(g, 352, false);
    // A lean hound side on, head up, one forepaw lifted, its eye a coal.
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(74, 270);
    g.bezierCurveTo(92, 246, 150, 250, 190, 252);
    g.bezierCurveTo(206, 240, 214, 220, 226, 210);
    g.lineTo(236, 196);
    g.lineTo(242, 210);
    g.bezierCurveTo(254, 214, 266, 222, 270, 232);
    g.lineTo(250, 238);
    g.bezierCurveTo(240, 246, 232, 258, 226, 276);
    g.bezierCurveTo(222, 292, 212, 300, 196, 302);
    g.bezierCurveTo(160, 306, 120, 300, 96, 296);
    g.bezierCurveTo(84, 292, 74, 284, 74, 270);
    g.fill();
    // The tail, up and curved.
    g.strokeStyle = INK;
    g.lineCap = "round";
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(80, 268);
    g.bezierCurveTo(60, 250, 52, 226, 62, 206);
    g.stroke();
    // Legs: hind pair, the near forepaw down, the far one lifted.
    g.lineWidth = 9;
    for (const [x0, y0, x1, y1, x2, y2] of [[100, 292, 92, 322, 98, 352], [122, 296, 118, 324, 126, 352], [196, 298, 204, 326, 200, 352], [214, 290, 236, 306, 240, 324]]) {
      g.beginPath();
      g.moveTo(x0!, y0!);
      g.quadraticCurveTo(x1!, y1!, x2!, y2!);
      g.stroke();
    }
    g.fillStyle = "#ff6a3a";
    disc(g, 246, 220, 3);
    g.fill();
  },
  keep(g) {
    ground(g, 342);
    g.fillStyle = INK;
    // The great tower with its battlements, a lower wall and a gate.
    g.fillRect(124, 118, 60, 224);
    for (let i = 0; i < 4; i++) g.fillRect(120 + i * 18, 100, 12, 20);
    g.fillRect(62, 236, 186, 106);
    for (let i = 0; i < 9; i++) g.fillRect(60 + i * 21, 222, 12, 16);
    g.fillRect(52, 196, 30, 146);
    for (let i = 0; i < 2; i++) g.fillRect(50 + i * 20, 184, 12, 14);
    g.fillRect(226, 196, 30, 146);
    for (let i = 0; i < 2; i++) g.fillRect(224 + i * 20, 184, 12, 14);
    // One lit window high up, the gate dark below.
    g.fillStyle = "#f2c25a";
    g.beginPath();
    g.moveTo(146, 182);
    g.lineTo(146, 164);
    g.arc(154, 164, 8, Math.PI, 0);
    g.lineTo(162, 182);
    g.fill();
    g.fillStyle = "#0a0604";
    g.beginPath();
    g.moveTo(138, 342);
    g.lineTo(138, 300);
    g.arc(154, 300, 16, Math.PI, 0);
    g.lineTo(170, 342);
    g.fill();
  },
  fire(g) {
    ground(g, 345, false);
    for (const [c, s] of [["#7c2a12", 1], ["#d0601e", 0.75], ["#f0b040", 0.45], ["#fff0b0", 0.2]] as const) {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(150 - 60 * s, 340);
      g.bezierCurveTo(150 - 74 * s, 262, 150 - 14 * s, 222, 150, 140 + (1 - s) * 90);
      g.bezierCurveTo(150 + 14 * s, 222, 150 + 74 * s, 262, 150 + 60 * s, 340);
      g.fill();
    }
    // Sparks going up.
    g.fillStyle = "#ffd070";
    for (const [x, y] of [[132, 150], [170, 128], [150, 104], [118, 120], [184, 160]]) {
      disc(g, x!, y!, 2);
      g.fill();
    }
    figure(g, 64, 345, 0.6);
    figure(g, 236, 345, 0.6);
  },
  key(g) {
    rays(g, 150, 210, 120);
    g.strokeStyle = INK;
    g.lineCap = "round";
    // The bow: a ring with a quatrefoil cut in it.
    g.lineWidth = 12;
    disc(g, 150, 136, 34);
    g.stroke();
    g.lineWidth = 4;
    for (const [dx, dy] of [[0, -12], [12, 0], [0, 12], [-12, 0]]) {
      disc(g, 150 + dx!, 136 + dy!, 8);
      g.stroke();
    }
    // The shank, a collar, and the bit with its wards.
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(150, 170);
    g.lineTo(150, 334);
    g.stroke();
    g.fillStyle = INK;
    g.fillRect(138, 192, 24, 9);
    path(g, [[150, 288], [186, 288], [186, 300], [174, 300], [174, 310], [186, 310], [186, 332], [150, 332]]);
    g.fill();
  },
  lantern(g) {
    g.fillStyle = "rgba(240,200,90,0.22)";
    path(g, [[150, 236], [30, 390], [270, 390]]);
    g.fill();
    g.fillStyle = INK;
    // The ring it hangs by, the cap, the glass in its cage, the base.
    g.strokeStyle = INK;
    g.lineWidth = 5;
    disc(g, 150, 104, 11);
    g.stroke();
    path(g, [[112, 152], [150, 116], [188, 152]]);
    g.fill();
    g.fillRect(112, 150, 76, 9);
    g.fillRect(114, 246, 72, 12);
    g.fillStyle = "#f6cf6a";
    g.fillRect(122, 159, 56, 87);
    g.fillStyle = "#fff4c8";
    g.beginPath();
    g.ellipse(150, 208, 7, 18, 0, 0, TAU);
    g.fill();
    g.fillStyle = INK;
    for (const x of [120, 147, 174]) g.fillRect(x, 159, 6, 87);
  },
  purse(g) {
    rays(g, 150, 220, 110);
    g.fillStyle = "#5a3a1c";
    g.beginPath();
    g.moveTo(110, 180);
    g.bezierCurveTo(60, 260, 90, 330, 150, 330);
    g.bezierCurveTo(210, 330, 240, 260, 190, 180);
    g.closePath();
    g.fill();
    g.fillStyle = GOLD;
    for (const [x, y] of [[90, 350], [126, 360], [206, 352]]) {
      g.beginPath();
      g.ellipse(x!, y!, 16, 6, 0, 0, Math.PI * 2);
      g.fill();
    }
  },
};

/** Gold leaf: a sheen that runs light and dark across the card. */
function goldLeaf(g: G): CanvasGradient {
  const gold = g.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, "#f6dd8e");
  gold.addColorStop(0.22, "#b4832c");
  gold.addColorStop(0.45, "#f2d47c");
  gold.addColorStop(0.7, "#8a621f");
  gold.addColorStop(1, "#ecc96e");
  return gold;
}

/** A small gold flourish in a corner of the frame: a curl, a dot and a leaf, turned to fit its corner. */
function flourish(g: G, x: number, y: number, sx: number, sy: number, gold: CanvasGradient): void {
  g.save();
  g.translate(x, y);
  g.scale(sx, sy);
  g.strokeStyle = gold;
  g.fillStyle = gold;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(0, 22);
  g.bezierCurveTo(0, 8, 8, 0, 22, 0);
  g.stroke();
  g.beginPath();
  g.moveTo(5, 16);
  g.bezierCurveTo(6, 9, 9, 6, 16, 5);
  g.stroke();
  disc(g, 6, 6, 2.6);
  g.fill();
  path(g, [[22, 0], [28, -2.5], [33, 0], [28, 2.5]]);
  g.fill();
  path(g, [[0, 22], [-2.5, 28], [0, 33], [2.5, 28]]);
  g.fill();
  g.restore();
}

/** The gold frame every card shares: a broad band of leaf, a dark keyline, a thin inner rule, and flourishes in the corners. */
function frame(g: G): void {
  const gold = goldLeaf(g);
  g.strokeStyle = gold;
  g.lineWidth = 7;
  g.strokeRect(11.5, 11.5, W - 23, H - 23);
  g.strokeStyle = "rgba(30,18,6,0.9)";
  g.lineWidth = 1.2;
  g.strokeRect(15.6, 15.6, W - 31.2, H - 31.2);
  g.strokeStyle = gold;
  g.lineWidth = 1.6;
  g.strokeRect(20, 20, W - 40, H - 40);
  flourish(g, 24, 24, 1, 1, gold);
  flourish(g, W - 24, 24, -1, 1, gold);
  flourish(g, 24, H - 24, 1, -1, gold);
  flourish(g, W - 24, H - 24, -1, -1, gold);
}

/** The outline of the picture's window: straight sides, an arched top, a flat foot at `foot`. */
function windowPath(g: G, foot: number): void {
  const r = (W - 68) / 2;
  g.beginPath();
  g.moveTo(34, foot);
  g.lineTo(34, 34 + r);
  g.arc(W / 2, 34 + r, r, Math.PI, 0);
  g.lineTo(W - 34, foot);
  g.closePath();
}

/** The sky in the window: the family's colours, a light behind the picture, the fine lines of an engraving, a few stars. */
function sky(g: G, family: CardFamily, foot: number, seed: number): void {
  const [top, low, glow] = SKY[family];
  const fill = g.createLinearGradient(0, 34, 0, foot);
  fill.addColorStop(0, top);
  fill.addColorStop(1, low);
  g.fillStyle = fill;
  g.fillRect(0, 0, W, H);
  const halo = g.createRadialGradient(W / 2, foot * 0.42, 6, W / 2, foot * 0.42, foot * 0.62);
  halo.addColorStop(0, `${glow}0.5)`);
  halo.addColorStop(0.45, `${glow}0.16)`);
  halo.addColorStop(1, `${glow}0)`);
  g.fillStyle = halo;
  g.fillRect(0, 0, W, H);
  // The lines of the engraving, closer together toward the foot, where it is darker.
  g.strokeStyle = "rgba(10,6,2,0.13)";
  g.lineWidth = 0.7;
  for (let y = 38; y < foot; y += 2.6 + (1 - y / foot) * 2.4) {
    g.beginPath();
    g.moveTo(30, y);
    g.lineTo(W - 30, y);
    g.stroke();
  }
  const r = rng(seed);
  g.fillStyle = "rgba(255,245,215,0.7)";
  for (let i = 0; i < 16; i++) {
    const x = 44 + r() * (W - 88), y = 44 + r() * foot * 0.38;
    disc(g, x, y, 0.5 + r() * 0.9);
    g.fill();
  }
}

/** A ribbon across the card with words on it: folded back at both ends, gold-edged, with its shadow under it. */
function ribbon(g: G, y: number, words: string, big = 26): void {
  const h = 44;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.55)";
  g.shadowBlur = 8;
  g.shadowOffsetY = 3;
  g.fillStyle = "#6e4f1c";
  for (const side of [-1, 1]) {
    const x0 = W / 2 + side * (W / 2 - 18), x1 = W / 2 + side * (W / 2 - 46);
    path(g, [[x0, y + 6], [x1, y], [x1, y + h], [x0, y + h + 6], [x0 + side * -10, y + h / 2 + 3]]);
    g.fill();
  }
  const band = g.createLinearGradient(0, y - 6, 0, y + h);
  band.addColorStop(0, "#f4ead0");
  band.addColorStop(0.5, PAPER);
  band.addColorStop(1, "#cdbb8e");
  g.fillStyle = band;
  g.fillRect(42, y - 6, W - 84, h + 4);
  g.restore();
  // The folds where the ends turn back.
  g.fillStyle = "#4a3410";
  for (const side of [-1, 1]) {
    const x1 = W / 2 + side * (W / 2 - 46);
    path(g, [[x1, y - 6], [x1, y], [x1 + side * 4, y - 2]]);
    g.fill();
  }
  g.strokeStyle = GOLD_DARK;
  g.lineWidth = 1.4;
  g.strokeRect(42, y - 6, W - 84, h + 4);
  g.strokeStyle = "rgba(125,95,34,0.5)";
  g.lineWidth = 0.8;
  g.strokeRect(46, y - 2, W - 92, h - 4);
  g.fillStyle = INK;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const text = words.toUpperCase();
  const spaced = "letterSpacing" in g;
  let size = big;
  for (; size > 11; size--) {
    g.font = `${size}px ${SERIF}`;
    if (spaced) (g as G & { letterSpacing: string }).letterSpacing = `${(size * 0.08).toFixed(1)}px`;
    if (g.measureText(text).width < W - 104) break;
  }
  g.fillText(text, W / 2, y + h / 2 - 3);
  if (spaced) (g as G & { letterSpacing: string }).letterSpacing = "0px";
}

/** A name on a dark plate edged in gold, over the foot of the picture. */
function plate(g: G, name: string, y: number): void {
  g.font = `italic 24px ${SERIF}`;
  const shown = name.length > 24 ? `${name.slice(0, 23)}…` : name;
  const nw = Math.min(W - 76, g.measureText(shown).width + 34);
  g.fillStyle = "rgba(18,11,5,0.86)";
  g.fillRect(W / 2 - nw / 2, y, nw, 34);
  g.strokeStyle = GOLD;
  g.lineWidth = 1.4;
  g.strokeRect(W / 2 - nw / 2 + 0.5, y + 0.5, nw - 1, 33);
  g.fillStyle = "#f3e2b0";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(shown, W / 2, y + 18, W - 92);
}

/** Break words into lines no wider than `width` in the current font. */
function wrap(g: G, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The panel under the picture of a card that does something: its kind in red, and what it does, as large as fits. */
function panel(g: G, top: number, title: string, text: string): void {
  const x = 36, w = W - 72, foot = H - 34;
  const fill = g.createLinearGradient(0, top, 0, foot);
  fill.addColorStop(0, "#efe4c8");
  fill.addColorStop(1, "#dccca2");
  g.fillStyle = fill;
  g.fillRect(x, top, w, foot - top);
  g.strokeStyle = GOLD_DARK;
  g.lineWidth = 1.2;
  g.strokeRect(x + 0.5, top + 0.5, w - 1, foot - top - 1);
  g.strokeStyle = "rgba(125,95,34,0.45)";
  g.lineWidth = 0.7;
  g.strokeRect(x + 4, top + 4, w - 8, foot - top - 8);
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = "#7a1e14";
  g.font = `bold 10px ${SERIF}`;
  if ("letterSpacing" in g) (g as G & { letterSpacing: string }).letterSpacing = "1.5px";
  g.fillText(title.toUpperCase(), W / 2, top + 17);
  if ("letterSpacing" in g) (g as G & { letterSpacing: string }).letterSpacing = "0px";
  g.strokeStyle = "rgba(122,30,20,0.45)";
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(W / 2 - 40, top + 22);
  g.lineTo(W / 2 + 40, top + 22);
  g.stroke();
  const room = foot - top - 34;
  let size = 16, lines: string[] = [];
  for (size = 16; size > 7; size -= 0.5) {
    g.font = `${size}px ${SERIF}`;
    lines = wrap(g, text, w - 18);
    if (lines.length * size * 1.22 <= room) break;
  }
  g.fillStyle = INK;
  const lh = size * 1.22;
  const y0 = top + 28 + (room - lines.length * lh) / 2 + size;
  lines.forEach((l, i) => g.fillText(l, W / 2, y0 + i * lh));
}

/** Old paper's grain over everything, so the flat colours look printed and worn, and the edges a little darker. */
function wear(g: G, seed: number): void {
  const r = rng(seed);
  for (let i = 0; i < 420; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "255,240,200" : "20,10,0"},${0.02 + r() * 0.05})`;
    g.fillRect(r() * W, r() * H, 0.6 + r() * 2, 0.6 + r() * 2);
  }
  const edge = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.68);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(30,15,0,0.32)");
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);
}

/**
 * The face of a card: picture, frame, the ribbon with its title, and a name over it if it has one. A card with
 * words (what it does) has a smaller picture, its name on the ribbon, and the words in a panel under it.
 */
export function cardFace(kindId: string, name?: string, text?: string, title?: string): Canvas {
  const [c, g] = mk(CARD_PX.w, CARD_PX.h);
  g.scale(SCALE, SCALE);
  const k = cardKind(kindId);
  const told = !!text;
  const foot = told ? 286 : 392;
  g.fillStyle = "#120c08";
  g.fillRect(0, 0, W, H);
  g.save();
  windowPath(g, foot);
  g.clip();
  sky(g, k.family, foot, k.id.length * 31 + 7);
  // The picture, made smaller to fit above the words when there are words. Every shape in it has a halo of light.
  g.save();
  if (told) {
    g.translate(W / 2, 30);
    g.scale(0.74, 0.74);
    g.translate(-W / 2, -30);
  }
  g.shadowColor = "rgba(255,214,140,0.42)";
  g.shadowBlur = 14 * SCALE;
  (PICTURES[k.id] ?? PICTURES.token!)(g, rng(k.id.length * 97));
  g.restore();
  // A shadow inside the window's edge, so the picture sits back in it.
  const inner = g.createRadialGradient(W / 2, foot * 0.45, foot * 0.3, W / 2, foot * 0.5, foot * 0.75);
  inner.addColorStop(0, "rgba(0,0,0,0)");
  inner.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = inner;
  g.fillRect(0, 0, W, H);
  g.restore();
  g.strokeStyle = goldLeaf(g);
  g.lineWidth = 2.2;
  windowPath(g, foot);
  g.stroke();
  frame(g);
  if (told) {
    ribbon(g, foot - 10, name ?? title ?? k.title, 22);
    panel(g, foot + 44, name ? `${title ?? k.title}` : "", text!);
  } else {
    ribbon(g, 404, title ?? k.title);
    if (name) plate(g, name, 344);
  }
  wear(g, kindId.length * 13 + (name?.length ?? 0));
  return c;
}

/** The back of a card: dark, in its family's colour, with a gold pattern of our own (a lidded eye in a sunburst). */
export function cardBack(family: CardFamily): Canvas {
  const [c, g] = mk(CARD_PX.w, CARD_PX.h);
  g.scale(SCALE, SCALE);
  const [light, dark] = SKY[family];
  g.fillStyle = "#120c08";
  g.fillRect(0, 0, W, H);
  const fill = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * 0.6);
  fill.addColorStop(0, light);
  fill.addColorStop(1, dark);
  g.fillStyle = fill;
  g.fillRect(20, 20, W - 40, H - 40);
  // A lattice of fine gold lines, and a dot where they cross.
  g.save();
  g.beginPath();
  g.rect(20, 20, W - 40, H - 40);
  g.clip();
  g.strokeStyle = "rgba(220,180,90,0.22)";
  g.lineWidth = 0.9;
  for (let i = -H; i < W + H; i += 18) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + H, H);
    g.moveTo(i, H);
    g.lineTo(i + H, 0);
    g.stroke();
  }
  g.restore();
  const gold = goldLeaf(g);
  // The medallion: rings of gold, a sunburst, and the eye.
  const cx = W / 2, cy = H / 2;
  g.fillStyle = dark;
  disc(g, cx, cy, 92);
  g.fill();
  rays(g, cx, cy, 120, 32);
  g.strokeStyle = gold;
  g.lineWidth = 3;
  disc(g, cx, cy, 80);
  g.stroke();
  g.lineWidth = 1;
  disc(g, cx, cy, 86);
  g.stroke();
  disc(g, cx, cy, 74);
  g.stroke();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    disc(g, cx + Math.cos(a) * 80, cy + Math.sin(a) * 80, 2);
    g.fillStyle = gold;
    g.fill();
  }
  g.lineWidth = 3.4;
  g.beginPath();
  g.moveTo(cx - 52, cy);
  g.quadraticCurveTo(cx, cy - 42, cx + 52, cy);
  g.quadraticCurveTo(cx, cy + 42, cx - 52, cy);
  g.stroke();
  g.fillStyle = gold;
  disc(g, cx, cy, 15);
  g.fill();
  g.fillStyle = "#120c08";
  disc(g, cx, cy, 6);
  g.fill();
  // The lid's lashes.
  g.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(cx + i * 16, cy - 30 + Math.abs(i) * 5);
    g.lineTo(cx + i * 20, cy - 42 + Math.abs(i) * 6);
    g.stroke();
  }
  frame(g);
  wear(g, 5 + family.length);
  return c;
}
