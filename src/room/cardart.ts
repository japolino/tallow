/**
 * The faces and backs of the cards, drawn in code: our own tarot-style set, printed the way a hand-drawn deck is. On
 * cream stock, in one ink for each family of card: a picture in line and hatching inside a pointed arch, with a disc
 * of light and fine rays behind it; a plate at the head that says what sort of card it is; the card's name on a banner
 * across the picture's foot; and, when a card says more, its words under the banner. The picture takes whatever room
 * the words leave. Nothing is copied from any deck.
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
/** The ink the picture being drawn is printed in: each card sets its own (INKS). */
let INK = "#1b130d";
const PAPER = "#e9dcb8";
const SERIF = `"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif`;
/** Your own hand, in pencil (the same as on your pages, paper.ts). */
const HAND = '"Segoe Print", "Ink Free", "Bradley Hand", "Comic Sans MS", cursive';
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

/* ------------------------------------------------- the face ------------------------------------------------- */

/** The card's own stock, the white its pictures are lit with, pencil, and gilt. */
const STOCK = "#ecdcb6", WHITE = "#fbf6e6", GRAPHITE = "#4b4a52", GILT = "#d2a441";
/** Each family's ink, and the wash behind its picture. */
const INKS: Record<CardFamily, [string, string]> = {
  person: ["#1d3b46", "#c6dcd3"],
  obstacle: ["#4b2e17", "#ecd09c"],
  fight: ["#5c1a1c", "#efc4ae"],
  thing: ["#2c3b1a", "#d9dfaa"],
  place: ["#2a2358", "#d2ccec"],
};
/** Kinds printed in another family's ink than their own, so the cards laid side by side are not all one colour. */
const INK_AS: Record<string, CardFamily> = { lantern: "obstacle", boon: "person" };
let WASH = INKS.place[1];

const pen = (g: G, w: number, color = INK): void => {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineJoin = "round";
  g.lineCap = "round";
};
/** A shape from path data (as in an SVG): filled, then outlined in the card's ink. */
function shape(g: G, d: string, fill: string | null = WHITE, w = 2): void {
  const p = new Path2D(d);
  if (fill) {
    g.fillStyle = fill;
    g.fill(p);
  }
  if (w > 0) {
    pen(g, w);
    g.stroke(p);
  }
}
/** Shade inside a shape, the way an engraver does: fine strokes all leaning one way. */
function hatch(g: G, d: string, gap = 4, lean = 0.55, w = 0.75): void {
  g.save();
  g.clip(new Path2D(d));
  pen(g, w);
  g.globalAlpha = 0.7;
  g.beginPath();
  for (let x = -320; x < 620; x += gap) {
    g.moveTo(x, 0);
    g.lineTo(x + 520 * lean, 520);
  }
  g.stroke();
  g.restore();
}
/** A four-pointed sparkle. */
function spark(g: G, x: number, y: number, r: number, fill = WHITE): void {
  const k = r * 0.22;
  shape(g, `M${x},${y - r} Q${x + k},${y - k} ${x + r},${y} Q${x + k},${y + k} ${x},${y + r} Q${x - k},${y + k} ${x - r},${y} Q${x - k},${y - k} ${x},${y - r} Z`, fill, 1.1);
}
/** A small orb, outlined. */
function orb(g: G, x: number, y: number, r: number, fill: string | null = WHITE): void {
  disc(g, x, y, r);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  pen(g, 1.1);
  g.stroke();
}
/** Two birds far off. */
function birds(g: G, x: number, y: number): void {
  shape(g, `M${x},${y} q5,-6 10,0 q5,-6 10,0 M${x + 26},${y - 12} q4,-5 8,0 q4,-5 8,0`, null, 1.3);
}
/** Level ground from `y` down. */
function field(g: G, y: number, fill = STOCK): void {
  shape(g, `M0,${y} L300,${y} L300,470 L0,470 Z`, fill, 0);
  shape(g, `M0,${y} L300,${y}`, null, 1.8);
}
/** Tufts of grass. */
function tufts(g: G, at: number[][]): void {
  for (const [x, y] of at) shape(g, `M${x! - 4},${y} l2,-6 M${x},${y} l0,-8 M${x! + 4},${y} l-2,-6`, null, 1.1);
}
/** A coin lying flat. */
function coin(g: G, x: number, y: number, r: number): void {
  g.beginPath();
  g.ellipse(x, y, r, r * 0.38, 0, 0, TAU);
  g.fillStyle = GILT;
  g.fill();
  pen(g, 1.1);
  g.stroke();
}

/**
 * The pictures of the kinds the game lays out now, drawn in line: ink on the card's stock, white where the light
 * falls, a little gilt. Each is drawn in a box about 40..260 across and 92..376 down, standing on 376.
 */
const DRAWN: Record<string, (g: G) => void> = {
  /** A choice to make: a signpost where three roads part, and a walker stopped before it. */
  crossroads(g) {
    shape(g, "M0,300 C40,262 84,256 122,276 C150,246 214,238 300,286 L300,310 L0,310 Z", WASH, 1.6);
    hatch(g, "M150,262 C196,244 250,256 300,286 L300,310 L150,310 Z", 5);
    field(g, 304);
    // Three roads from your feet: one to each side, one straight on.
    shape(g, "M118,470 C132,400 143,340 147,304 L153,304 C157,340 168,400 182,470 Z", WHITE, 1.6);
    shape(g, "M0,372 C56,350 104,326 138,304 L145,304 C118,336 84,378 60,470 L0,470 Z", WHITE, 1.6);
    shape(g, "M300,372 C244,350 196,326 162,304 L155,304 C182,336 216,378 240,470 L300,470 Z", WHITE, 1.6);
    shape(g, "M150,318 L150,330 M150,344 L150,360 M150,378 L150,400 M150,422 L150,450", null, 1.2);
    tufts(g, [[40, 330], [262, 334], [96, 392], [212, 400], [24, 420], [280, 430]]);
    birds(g, 196, 150);
    // The post and its three boards.
    shape(g, "M145,362 L146,146 L154,146 L155,362 Z", WHITE, 2);
    hatch(g, "M150,146 L154,146 L155,362 L150,362 Z", 3.2);
    shape(g, "M142,146 L150,132 L158,146 Z", GILT, 1.8);
    shape(g, "M146,160 L98,160 L80,173 L98,186 L146,186 Z", WHITE, 2);
    shape(g, "M154,194 L204,194 L222,207 L204,220 L154,220 Z", WHITE, 2);
    shape(g, "M128,228 L172,228 L172,252 L128,252 Z", WHITE, 2);
    shape(g, "M104,170 L138,170 M106,177 L132,177 M162,204 L198,204 M164,211 L190,211 M150,246 L150,234 M145,239 L150,233 L155,239", null, 1.2);
    // The walker, seen from behind: a cloak, a hat, a staff.
    shape(g, "M84,372 C85,340 92,322 104,316 C116,322 123,340 124,372 Z", INK, 1.2);
    shape(g, "M88,315 C96,311 112,311 120,315 C112,319 96,319 88,315 Z M97,313 C98,302 110,302 111,313 Z", INK, 1.2);
    shape(g, "M130,372 L126,296", null, 2.4);
  },
  /** A task taken up: a lantern on a staff by a road that winds to a far keep under a star. */
  lantern(g) {
    shape(g, "M0,304 C60,280 110,292 160,300 C200,270 240,262 300,284 L300,312 L0,312 Z", WASH, 1.6);
    hatch(g, "M160,300 C200,270 240,262 300,284 L300,312 L160,312 Z", 5);
    field(g, 306);
    // The road, winding off to the keep.
    shape(g, "M110,470 C150,420 250,392 226,356 C208,330 150,330 186,306 L194,306 C170,330 232,330 252,356 C282,396 210,420 196,470 Z", WHITE, 1.6);
    // The keep on its hill, small and far, and the star over it.
    shape(g, "M214,280 L216,236 L212,236 L212,228 L218,228 L218,232 L224,232 L224,228 L230,228 L230,232 L236,232 L236,228 L242,228 L242,236 L238,236 L240,280 Z", WHITE, 1.5);
    shape(g, "M224,280 L224,266 Q227,260 230,266 L230,280 Z", INK, 0);
    shape(g, "M227,228 L227,212 L238,216 L227,221", GILT, 1.2);
    spark(g, 228, 172, 15, GILT);
    spark(g, 262, 146, 5);
    spark(g, 196, 138, 4);
    tufts(g, [[40, 340], [70, 400], [268, 420], [150, 372]]);
    // The staff with its crook, and the lantern hung from it.
    shape(g, "M92,376 L92,150 C92,104 148,104 148,146", null, 6.5);
    pen(g, 2.6, WHITE);
    g.stroke(new Path2D("M92,373 L92,150 C92,107 146,107 146.5,143"));
    shape(g, "M148,146 L148,158", null, 1.6);
    orb(g, 148, 164, 6, null);
    shape(g, "M124,196 L148,170 L172,196 Z", INK, 1.6);
    shape(g, "M128,196 L168,196 L164,262 L132,262 Z", WHITE, 2);
    shape(g, "M148,206 C160,222 158,244 148,250 C138,244 136,222 148,206 Z", GILT, 1.4);
    shape(g, "M148,224 C153,232 152,242 148,246 C144,242 143,232 148,224 Z", WHITE, 0);
    shape(g, "M140,196 L141,262 M156,196 L155,262", null, 1.2);
    shape(g, "M124,262 L172,262 L168,274 L128,274 Z", INK, 1.6);
    // Its light.
    pen(g, 1.1);
    g.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + 0.2, r0 = 54 + (i % 2) * 6, r1 = r0 + 12 + (i % 2) * 8;
      g.moveTo(148 + Math.cos(a) * r0, 228 + Math.sin(a) * r0);
      g.lineTo(148 + Math.cos(a) * r1, 228 + Math.sin(a) * r1);
    }
    g.stroke();
  },
  /** Something for sale: a merchant's scales under an awning, coin in one pan and goods in the other. */
  purse(g) {
    // The awning.
    let scallops = "M22,92 L278,92 L278,112";
    for (let i = 0; i < 8; i++) scallops += " q-16,18 -32,0";
    shape(g, `${scallops} Z`, WHITE, 2);
    for (let i = 0; i < 8; i += 2) hatch(g, `M${22 + i * 32},92 L${54 + i * 32},92 L${54 + i * 32},126 L${22 + i * 32},126 Z`, 3.4);
    // The counter and its cloth.
    shape(g, "M0,340 L300,340 L300,470 L0,470 Z", WASH, 0);
    shape(g, "M0,340 L300,340", null, 2.2);
    g.save();
    g.clip(new Path2D("M0,342 L300,342 L300,470 L0,470 Z"));
    pen(g, 0.8);
    g.globalAlpha = 0.6;
    g.beginPath();
    for (let x = -200; x < 520; x += 22) {
      g.moveTo(x, 342);
      g.lineTo(x + 130, 472);
      g.moveTo(x, 342);
      g.lineTo(x - 130, 472);
    }
    g.stroke();
    g.restore();
    // The scales: the left pan down under its coin.
    shape(g, "M116,340 L184,340 L174,326 L126,326 Z", INK, 1.6);
    shape(g, "M145,326 L146,168 L154,168 L155,326 Z", WHITE, 2);
    hatch(g, "M150,168 L154,168 L155,326 L150,326 Z", 3.2);
    shape(g, "M62,196 C104,170 196,166 238,176", null, 4.5);
    orb(g, 150, 162, 8, GILT);
    shape(g, "M64,196 L38,266 M64,196 L90,266 M236,177 L212,236 M236,177 L260,236", null, 1.2);
    shape(g, "M30,266 L98,266 C94,290 34,290 30,266 Z", WHITE, 2);
    shape(g, "M204,236 L268,236 C264,258 208,258 204,236 Z", WHITE, 2);
    hatch(g, "M64,266 L98,266 C96,280 80,288 64,288 Z", 3.2);
    hatch(g, "M236,236 L268,236 C266,250 252,256 236,256 Z", 3.2);
    for (const [x, y] of [[52, 262], [66, 259], [78, 263], [60, 254], [72, 252]]) coin(g, x!, y!, 9);
    // A stoppered flask in the other pan.
    shape(g, "M228,236 C222,222 228,212 232,208 L232,200 L240,200 L240,208 C244,212 250,222 244,236 Z", WHITE, 1.5);
    shape(g, "M230,200 L242,200 L241,194 L231,194 Z", INK, 1);
    // A tied purse and a stack of coin on the counter.
    shape(g, "M206,340 C196,318 204,300 220,296 L242,296 C258,300 266,318 256,340 Z", WHITE, 2);
    hatch(g, "M232,296 L242,296 C258,300 266,318 256,340 L232,340 Z", 3.4);
    shape(g, "M216,296 C222,288 240,288 246,296 M214,290 L224,296 M248,290 L238,296", null, 1.6);
    for (const [x, y] of [[52, 336], [52, 331], [52, 326], [84, 336], [84, 331]]) coin(g, x!, y!, 12);
  },
  /** A gift taken at a new level: a star in a wreath of laurel, tied with a ribbon. */
  boon(g) {
    const cx = 150, cy = 228;
    // The wreath: two branches of leaves, open at the top.
    for (const side of [-1, 1]) {
      pen(g, 1.8);
      g.beginPath();
      g.arc(cx, cy, 84, Math.PI / 2 - side * 0.12, Math.PI / 2 - side * 2.66, side > 0);
      g.stroke();
      for (let i = 0; i < 9; i++) {
        const a = Math.PI / 2 - side * (0.3 + i * 0.27);
        for (const out of [1, -1]) {
          g.save();
          g.translate(cx + Math.cos(a) * (84 + out * 9), cy + Math.sin(a) * (84 + out * 9));
          g.rotate(a - side * (Math.PI / 2 + out * 0.5));
          g.beginPath();
          g.ellipse(0, 0, 11, 4.4, 0, 0, TAU);
          g.fillStyle = out > 0 ? WHITE : WASH;
          g.fill();
          pen(g, 1.2);
          g.stroke();
          g.restore();
        }
      }
    }
    // The star: eight points, the four long ones gilt.
    const star = (r1: number, r0: number, turn: number): string => {
      let d = "";
      for (let i = 0; i < 8; i++) {
        const a = turn + (i / 8) * TAU, r = i % 2 ? r0 : r1;
        d += `${i ? "L" : "M"}${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)} `;
      }
      return `${d}Z`;
    };
    shape(g, star(40, 13, Math.PI / 4), WHITE, 1.6);
    shape(g, star(62, 15, 0), GILT, 2);
    shape(g, `M${cx},${cy - 62} L${cx},${cy + 62} M${cx - 62},${cy} L${cx + 62},${cy}`, null, 0.9);
    orb(g, cx, cy, 7);
    for (const [x, y, r] of [[92, 150, 6], [214, 162, 5], [206, 292, 4], [88, 286, 5], [150, 128, 4]]) spark(g, x!, y!, r!);
    // The ribbon that ties it.
    shape(g, "M150,312 C128,296 116,318 138,326 Z M150,312 C172,296 184,318 162,326 Z", WHITE, 1.8);
    shape(g, "M144,320 C136,344 126,356 112,368 L128,366 L132,378 C142,360 148,344 150,326 Z", WHITE, 1.8);
    shape(g, "M156,320 C164,344 174,356 188,368 L172,366 L168,378 C158,360 152,344 150,326 Z", WHITE, 1.8);
    hatch(g, "M150,326 C152,344 158,360 168,378 L172,366 L188,368 C174,356 164,344 156,320 Z", 3);
    shape(g, "M143,311 L157,311 L158,325 L142,325 Z", INK, 1);
  },
  /** A fight: two swords crossed behind a round shield. */
  ambush(g) {
    const sword = (turn: number): void => {
      g.save();
      g.translate(150, 238);
      g.rotate(turn);
      shape(g, "M-7,-150 L0,-172 L7,-150 L5.5,44 L-5.5,44 Z", WHITE, 1.8);
      hatch(g, "M0,-172 L7,-150 L5.5,44 L0,44 Z", 3.2, 0.9);
      shape(g, "M0,-160 L0,40", null, 0.9);
      shape(g, "M-30,42 C-18,48 18,48 30,42 L30,52 C18,56 -18,56 -30,52 Z", INK, 1.2);
      shape(g, "M-4.5,54 L4.5,54 L4,88 L-4,88 Z", WASH, 1.4);
      shape(g, "M-4.5,62 L4.5,62 M-4.4,70 L4.4,70 M-4.2,78 L4.2,78", null, 1);
      orb(g, 0, 95, 7.5, GILT);
      g.restore();
    };
    sword(-0.62);
    sword(0.62);
    // The shield, quartered, with a gilt boss.
    orb(g, 150, 238, 62);
    pen(g, 2.6);
    disc(g, 150, 238, 62);
    g.stroke();
    hatch(g, "M150,238 L150,186 A52,52 0 0 1 202,238 Z", 3.6);
    hatch(g, "M150,238 L150,290 A52,52 0 0 1 98,238 Z", 3.6);
    pen(g, 1.4);
    disc(g, 150, 238, 52);
    g.stroke();
    shape(g, "M150,186 L150,290 M98,238 L202,238", null, 1.4);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.26;
      disc(g, 150 + Math.cos(a) * 57, 238 + Math.sin(a) * 57, 1.5);
      g.fillStyle = INK;
      g.fill();
    }
    orb(g, 150, 238, 13, GILT);
    orb(g, 150, 238, 5);
    // Where the blades meet, sparks.
    for (const [x, y, r] of [[150, 108, 9], [128, 96, 4], [174, 100, 5], [150, 84, 3]]) spark(g, x!, y!, r!);
    shape(g, "M40,376 L96,360 M36,368 L52,360 M204,362 L262,376 M250,362 L266,370", null, 1.4);
  },
  /** A group and where you stand with it: a banner with a crown on it, hung from a bar between two lances. */
  warden(g) {
    shape(g, "M62,376 L96,96 M238,376 L204,96", null, 3);
    shape(g, "M96,96 L92,76 L100,76 Z M204,96 L200,76 L208,76 Z", WHITE, 1.4);
    shape(g, "M150,84 L92,118 M150,84 L208,118", null, 1.2);
    orb(g, 150, 82, 5, GILT);
    shape(g, "M78,118 L222,118", null, 5);
    orb(g, 76, 118, 5.5, GILT);
    orb(g, 224, 118, 5.5, GILT);
    // The cloth, swallow-tailed, with its border and the crown.
    shape(g, "M94,122 L206,122 L206,318 L150,290 L94,318 Z", WHITE, 2.4);
    hatch(g, "M94,122 L112,122 L112,309 L94,318 Z", 3.4);
    shape(g, "M102,130 L198,130 L198,304 L150,280 L102,304 Z", null, 0.9);
    shape(g, "M118,222 L118,186 L134,204 L150,176 L166,204 L182,186 L182,222 Z", GILT, 2);
    shape(g, "M116,222 L184,222 L184,234 L116,234 Z", WHITE, 1.8);
    for (const [x, y] of [[118, 184], [150, 173], [182, 184]]) orb(g, x!, y!, 4);
    for (const x of [130, 150, 170]) orb(g, x, 228, 2.4, INK);
    spark(g, 150, 258, 9, WASH);
    shape(g, "M128,150 L172,150 M136,158 L164,158", null, 1.2);
    // Tassels at its tails.
    shape(g, "M94,318 L90,344 M94,318 L94,346 M94,318 L98,344 M206,318 L202,344 M206,318 L206,346 M206,318 L210,344", null, 1.4);
    tufts(g, [[40, 372], [150, 370], [268, 374]]);
  },
  /** A place: a keep on its rock, one window lit, a path going up to its door. */
  keep(g) {
    // A crescent moon, and cloud.
    shape(g, "M70,104 A24,24 0 1 0 100,138 A19,19 0 1 1 70,104 Z", WHITE, 1.6);
    shape(g, "M196,128 q8,-12 20,-4 q10,-10 22,0 q12,-2 12,10 Z", WHITE, 1.3);
    birds(g, 206, 176);
    // The rock.
    shape(g, "M0,404 C30,360 58,318 100,300 L204,300 C246,316 276,352 300,404 L300,470 L0,470 Z", WHITE, 2.2);
    hatch(g, "M168,300 L204,300 C246,316 276,352 300,404 L300,470 L210,470 C204,410 188,350 168,300 Z", 4.4);
    shape(g, "M40,404 C50,382 64,372 78,366 M240,372 C250,380 258,392 262,404 M110,330 C120,338 126,350 126,362", null, 1.2);
    // The path up to the door.
    shape(g, "M96,470 C120,430 178,420 160,388 C148,366 132,356 142,300 L158,300 C150,350 172,362 184,386 C204,424 150,438 136,470 Z", WASH, 1.5);
    // The side tower with its cone, then the great tower.
    shape(g, "M88,300 L90,220 L118,220 L120,300 Z", WHITE, 2);
    shape(g, "M84,220 L104,184 L124,220 Z", INK, 1.4);
    shape(g, "M100,246 L100,236 Q104,230 108,236 L108,246 Z", INK, 0);
    shape(g, "M116,300 L120,150 L180,150 L184,300 Z", WHITE, 2.2);
    hatch(g, "M152,150 L180,150 L184,300 L152,300 Z", 3.6);
    shape(g, "M112,150 L112,128 L126,128 L126,140 L140,140 L140,128 L160,128 L160,140 L174,140 L174,128 L188,128 L188,150 Z", WHITE, 2.2);
    shape(g, "M122,176 L178,176 M120,214 L180,214 M118,256 L182,256", null, 0.9);
    shape(g, "M140,206 L140,190 Q150,176 160,190 L160,206 Z", GILT, 1.6);
    shape(g, "M150,180 L150,206 M140,196 L160,196", null, 0.9);
    shape(g, "M138,300 L138,276 Q150,258 162,276 L162,300 Z", INK, 1.2);
    shape(g, "M150,128 L150,96", null, 1.8);
    shape(g, "M150,96 L176,103 L150,112 Z", GILT, 1.4);
    spark(g, 232, 110, 5);
    spark(g, 44, 176, 4);
  },
  /** A thing learned or found that opens something: a key on its cord. */
  key(g) {
    g.save();
    g.translate(150, 232);
    g.rotate(-0.3);
    g.translate(-150, -232);
    // The cord it hangs by.
    shape(g, "M150,96 C120,56 76,92 104,128 C118,146 96,170 84,160", null, 1.8);
    // The bow, a trefoil of three rings.
    for (const [x, y] of [[150, 112], [130, 144], [170, 144]]) orb(g, x!, y!, 21);
    orb(g, 150, 134, 13);
    for (const [x, y] of [[150, 112], [130, 144], [170, 144]]) orb(g, x!, y!, 9, WASH);
    orb(g, 150, 134, 5, GILT);
    // The shank with its collars, and the bit with its wards.
    shape(g, "M143,162 L157,162 L156,348 L144,348 Z", WHITE, 2);
    hatch(g, "M150,162 L157,162 L156,348 L150,348 Z", 3.2);
    shape(g, "M138,170 L162,170 L162,180 L138,180 Z", GILT, 1.6);
    shape(g, "M139,290 L161,290 L161,298 L139,298 Z", GILT, 1.6);
    shape(g, "M156,302 L196,302 L196,314 L182,314 L182,324 L196,324 L196,348 L176,348 L176,338 L166,338 L166,348 L156,348 Z", WHITE, 2);
    hatch(g, "M176,302 L196,302 L196,314 L182,314 L182,324 L196,324 L196,348 L176,348 Z", 3.2);
    g.restore();
    for (const [x, y, r] of [[226, 132, 8], [246, 168, 4], [74, 276, 6], [58, 244, 3], [214, 330, 5]]) spark(g, x!, y!, r!);
  },
};
Object.assign(PICTURES, DRAWN);

/**
 * Behind every picture: the family's wash, a white disc of light with fine rays going out from it to the edges of
 * the window, and a few small orbs in the air.
 */
function backdrop(g: G, top: number, foot: number, cx: number, cy: number, r: number, seed: number): void {
  const fill = g.createLinearGradient(0, top, 0, foot);
  fill.addColorStop(0, WASH);
  fill.addColorStop(1, STOCK);
  g.fillStyle = fill;
  g.fillRect(0, 0, W, H);
  pen(g, 0.7);
  g.globalAlpha = 0.5;
  g.beginPath();
  const n = 64;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.05;
    const r0 = r + (i % 2 ? 14 : 6), r1 = i % 4 === 1 ? r + 46 : 460;
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  }
  g.stroke();
  g.globalAlpha = 1;
  orb(g, cx, cy, r);
  pen(g, 0.7);
  disc(g, cx, cy, Math.max(1, r - 5));
  g.stroke();
  const rnd = rng(seed);
  for (let i = 0; i < 6; i++) {
    const x = 40 + rnd() * 220, y = top + 22 + rnd() * Math.max(10, cy - top - 10), s = 1.8 + rnd() * 3.4;
    if (Math.hypot(x - cx, y - cy) > r + 12) orb(g, x, y, s);
  }
}

/** The card's stock: old paper, a little lighter in the middle. */
function stock(g: G): void {
  g.fillStyle = STOCK;
  g.fillRect(0, 0, W, H);
  const light = g.createRadialGradient(W / 2, H * 0.45, 30, W / 2, H / 2, H * 0.7);
  light.addColorStop(0, "rgba(255,250,232,0.5)");
  light.addColorStop(1, "rgba(255,250,232,0)");
  g.fillStyle = light;
  g.fillRect(0, 0, W, H);
}

const rounded = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x + r},${y + h} Q${x},${y + h} ${x},${y + h - r} L${x},${y + r} Q${x},${y} ${x + r},${y} Z`;

/** The printed border: a heavy line, a hair line inside it, and a small fan of strokes in each corner. */
function border(g: G): void {
  shape(g, rounded(8, 8, W - 16, H - 16, 9), null, 2.4);
  shape(g, rounded(13, 13, W - 26, H - 26, 6), null, 0.8);
  for (const [x, y, sx, sy] of [[19, 19, 1, 1], [W - 19, 19, -1, 1], [19, H - 19, 1, -1], [W - 19, H - 19, -1, -1]]) {
    g.save();
    g.translate(x!, y!);
    g.scale(sx!, sy!);
    pen(g, 0.9);
    g.beginPath();
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      g.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
      g.lineTo(Math.cos(a) * (i % 2 ? 11 : 16), Math.sin(a) * (i % 2 ? 11 : 16));
    }
    g.stroke();
    orb(g, 1.5, 1.5, 2.2, GILT);
    g.restore();
  }
}

const spacing = (g: G, px: number): void => {
  if ("letterSpacing" in g) (g as G & { letterSpacing: string }).letterSpacing = `${px}px`;
};

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

/** Lines cut to `most`, the last ending in an ellipsis that still fits `width`. */
function cut(g: G, lines: string[], most: number, width: number): string[] {
  if (lines.length <= most) return lines;
  const kept = lines.slice(0, most);
  let last = kept[most - 1]!;
  while (last && g.measureText(`${last}…`).width > width) last = last.slice(0, -1).trimEnd();
  kept[most - 1] = `${last}…`;
  return kept;
}

interface Fit {
  font: string;
  size: number;
  lines: string[];
  h: number;
  space: number;
}

/** The name, as large as lets it sit in the banner: one line when it is short, up to three when it is a sentence. */
function fitName(g: G, words: string, width: number): Fit {
  const caps = words.length <= 22;
  const shown = caps ? words.toUpperCase() : words;
  let fit: Fit = { font: "", size: 11, lines: [shown], h: 0, space: 0 };
  for (const size of [22, 20, 18, 16.5, 15, 14, 13, 12, 11]) {
    const font = `${caps ? "" : "italic "}${size}px ${SERIF}`, space = caps ? size * 0.07 : 0;
    g.font = font;
    spacing(g, space);
    const lines = wrap(g, shown, width);
    fit = { font, size, lines, h: 0, space };
    if (lines.length <= (size >= 18 ? 1 : size >= 14 ? 2 : 3)) break;
  }
  g.font = fit.font;
  fit.lines = cut(g, fit.lines, 3, width);
  spacing(g, 0);
  fit.h = fit.lines.length * fit.size * 1.16 + 15;
  return fit;
}

/** Text set in a block no taller than `room`: smaller until it fits, and cut short only when nothing else will do. */
function fitBlock(g: G, text: string, width: number, room: number, sizes: number[], face: string, lead: number, pad: number): Fit {
  let fit: Fit = { font: "", size: sizes[0]!, lines: [], h: 0, space: 0 };
  for (const size of sizes) {
    const font = `${size}px ${face}`;
    g.font = font;
    const lines = wrap(g, text, width);
    fit = { font, size, lines, h: lines.length * size * lead + pad, space: 0 };
    if (fit.h <= room) break;
  }
  if (fit.h > room) {
    g.font = fit.font;
    fit.lines = cut(g, fit.lines, Math.max(1, Math.floor((room - pad) / (fit.size * lead))), width);
    fit.h = fit.lines.length * fit.size * lead + pad;
  }
  return fit;
}

/** The banner across the foot of the picture, swallow-tailed, with the name on it. */
function banner(g: G, mid: number, fit: Fit): void {
  const y = mid - fit.h / 2, h = fit.h, x0 = 15, x1 = W - 15;
  const d = `M${x0},${y} L${x1},${y} L${x1 - 9},${y + h / 2} L${x1},${y + h} L${x0},${y + h} L${x0 + 9},${y + h / 2} Z`;
  g.save();
  g.shadowColor = "rgba(40,24,8,0.35)";
  g.shadowBlur = 5;
  g.shadowOffsetY = 2;
  shape(g, d, WHITE, 0);
  g.restore();
  shape(g, d, null, 2);
  shape(g, `M${x0 + 14},${y + 3.5} L${x1 - 14},${y + 3.5} M${x0 + 14},${y + h - 3.5} L${x1 - 14},${y + h - 3.5}`, null, 0.7);
  g.fillStyle = INK;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = fit.font;
  spacing(g, fit.space);
  const lh = fit.size * 1.16;
  fit.lines.forEach((l, i) => g.fillText(l, W / 2 + fit.space / 2, mid - ((fit.lines.length - 1) * lh) / 2 + i * lh + fit.size * 0.06, x1 - x0 - 40));
  spacing(g, 0);
}

/** The small plate at the head of the card that says what sort of card it is. */
function plate(g: G, label: string): void {
  g.font = `bold 9.5px ${SERIF}`;
  spacing(g, 1.5);
  const text = label.toUpperCase();
  const w = Math.min(190, g.measureText(text).width + 30);
  const x0 = W / 2 - w / 2, x1 = W / 2 + w / 2;
  shape(g, `M${x0 + 8},21 L${x1 - 8},21 L${x1},31 L${x1 - 8},41 L${x0 + 8},41 L${x0},31 Z`, WHITE, 1.6);
  g.fillStyle = INK;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, W / 2 + 0.75, 31.5, w - 22);
  spacing(g, 0);
  if (x0 - 34 > 24) {
    shape(g, `M${x0 - 6},31 L${x0 - 26},31 M${x1 + 6},31 L${x1 + 26},31`, null, 0.8);
    orb(g, x0 - 30, 31, 1.8, GILT);
    orb(g, x1 + 30, 31, 1.8, GILT);
  }
}

/** Grain over everything, so the print looks worn, and the edges a little darker. */
function wear(g: G, seed: number): void {
  const r = rng(seed);
  for (let i = 0; i < 380; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "255,248,225" : "60,36,10"},${0.02 + r() * 0.045})`;
    g.fillRect(r() * W, r() * H, 0.6 + r() * 2, 0.6 + r() * 2);
  }
  const edge = g.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.72);
  edge.addColorStop(0, "rgba(60,36,10,0)");
  edge.addColorStop(1, "rgba(60,36,10,0.2)");
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);
}

const plain = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * The face of a card, laid out as a tarot card is: the picture fills the card inside its arch, and the card's name is
 * on a banner across the picture's foot. A card that says more has what it says set under the banner, in a block only
 * as tall as its words, and the picture has the rest. `title` (what sort of card it is) is on a small plate at the
 * head; `line`, what touching the card writes for you, is pencilled at the foot unless it only repeats the name.
 * Nothing is ever drawn wider than the place made for it.
 */
export function cardFace(kindId: string, name?: string, text?: string, title?: string, line?: string): Canvas {
  const [c, g] = mk(CARD_PX.w, CARD_PX.h);
  g.scale(SCALE, SCALE);
  const k = cardKind(kindId);
  [INK, WASH] = INKS[INK_AS[k.id] ?? k.family];
  const tidy = (s?: string): string => (s ?? "").replace(/\s+/g, " ").trim();
  const words = tidy(name) || tidy(title) || k.title;
  const label = tidy(name) ? tidy(title) : "";
  const body = tidy(text);
  const said = tidy(line) && plain(tidy(line)) !== plain(words) ? tidy(line) : "";

  // What is written decides how much of the card the picture gets.
  const top = 48, floor = H - 24;
  const named = fitName(g, words, W - 76);
  const hint = said ? fitBlock(g, said, W - 76, 36, [11, 10, 9.5], HAND, 1.18, 10) : null;
  const under = hint?.h ?? 0;
  const room = floor - under - named.h / 2 - 4 - (top + 176);
  const block = body ? fitBlock(g, body, W - 64, Math.max(40, room), [14, 13.5, 13, 12.5, 12, 11.5, 11, 10.5, 10, 9.5, 9], SERIF, 1.25, 20) : null;
  const foot = floor - under - (block?.h ?? 0) - (block || hint ? 4 : 0) - named.h / 2;

  stock(g);
  // The picture, sized to its window and standing on the banner.
  const stand = foot - named.h / 2 + 5;
  const s = Math.max(0.5, Math.min(1.22, (stand - (top + 16)) / 284));
  g.save();
  g.clip(new Path2D(`M26,${foot} L26,120 C26,78 84,54 150,48 C216,54 274,78 274,120 L274,${foot} Z`));
  backdrop(g, top, foot, W / 2, stand - 162 * s, 76 * s, k.id.length * 31 + words.length);
  g.translate(W / 2, stand);
  g.scale(s, s);
  g.translate(-W / 2, -376);
  (PICTURES[k.id] ?? PICTURES.token!)(g, rng(k.id.length * 97));
  g.restore();
  shape(g, `M26,${foot} L26,120 C26,78 84,54 150,48 C216,54 274,78 274,120 L274,${foot}`, null, 2.2);
  shape(g, `M30,${foot} L30,121 C30,82 86,58 150,52 C214,58 270,82 270,121 L270,${foot}`, null, 0.7);
  border(g);
  if (label) plate(g, label);
  else spark(g, W / 2, 31, 7, GILT);
  banner(g, foot, named);

  const y = foot + named.h / 2 + 4;
  if (block) {
    // A small rule with a lozenge, then the words.
    shape(g, `M${W / 2 - 46},${y + 7} L${W / 2 - 8},${y + 7} M${W / 2 + 8},${y + 7} L${W / 2 + 46},${y + 7}`, null, 0.8);
    shape(g, `M${W / 2},${y + 3} L${W / 2 + 4},${y + 7} L${W / 2},${y + 11} L${W / 2 - 4},${y + 7} Z`, GILT, 1);
    g.fillStyle = INK;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.font = block.font;
    const lh = block.size * 1.25;
    block.lines.forEach((l, i) => g.fillText(l, W / 2, y + 16 + block.size + i * lh, W - 60));
  }
  if (hint) {
    pen(g, 0.7, GRAPHITE);
    g.setLineDash([2, 3]);
    g.beginPath();
    g.moveTo(40, floor - hint.h + 2);
    g.lineTo(W - 40, floor - hint.h + 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = GRAPHITE;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.font = hint.font;
    const lh = hint.size * 1.18;
    hint.lines.forEach((l, i) => g.fillText(l, W / 2, floor - hint.h + 6 + hint.size + i * lh, W - 70));
  }
  wear(g, kindId.length * 13 + words.length);
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
