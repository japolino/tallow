/**
 * The faces and backs of the cards, drawn in code (docs/DESIGN.md, 8.1): our own tarot-style set, with a framed
 * figure, a title banner, flat inks and gold. Every kind of card has its own picture, made of a few flat shapes in
 * dark ink over a coloured ground, the way an old woodcut would be coloured by hand. Nothing is copied from any deck.
 *
 * A person from a character card gets a portrait set in the same frame (milestone 4); until then they get the
 * picture of their kind, with their name written over the banner.
 */
import { cardKind, type CardFamily } from "../engine/cards.js";
import { mk, rng, type Canvas } from "./textures.js";

export const CARD_PX = { w: 300, h: 500 };

const GOLD = "#c9a04a";
const GOLD_DARK = "#7d5f22";
const INK = "#1b130d";
const PAPER = "#e9dcb8";
const SERIF = `"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif`;

/** The ground each family is painted on, and the colour of its back. */
const GROUND: Record<CardFamily, [string, string]> = {
  person: ["#2f5d63", "#173438"],
  obstacle: ["#7a5a33", "#3d2b16"],
  fight: ["#7c2a22", "#3c1210"],
  thing: ["#5d6a32", "#2c3315"],
  place: ["#3c3a6e", "#1c1b3a"],
};

type G = CanvasRenderingContext2D;

const path = (g: G, pts: number[][], close = true): void => {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x!, y!) : g.moveTo(x!, y!)));
  if (close) g.closePath();
};
const disc = (g: G, x: number, y: number, r: number): void => {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
};

/** A standing figure in a long robe: the shape most people on the cards are made from. Centre at x, feet at y. */
function figure(g: G, x: number, y: number, s = 1, o: { arms?: "down" | "out" | "up" | "folded"; hood?: boolean } = {}): void {
  g.fillStyle = INK;
  path(g, [[x - 34 * s, y], [x - 20 * s, y - 120 * s], [x - 14 * s, y - 150 * s], [x + 14 * s, y - 150 * s], [x + 20 * s, y - 120 * s], [x + 34 * s, y]]);
  g.fill();
  disc(g, x, y - 168 * s, 17 * s);
  g.fill();
  if (o.hood) {
    path(g, [[x - 22 * s, y - 150 * s], [x, y - 196 * s], [x + 22 * s, y - 150 * s]]);
    g.fill();
  }
  g.lineWidth = 9 * s;
  g.lineCap = "round";
  g.strokeStyle = INK;
  g.beginPath();
  const arms = o.arms ?? "down";
  if (arms === "out") {
    g.moveTo(x - 14 * s, y - 140 * s);
    g.lineTo(x - 52 * s, y - 108 * s);
    g.moveTo(x + 14 * s, y - 140 * s);
    g.lineTo(x + 52 * s, y - 108 * s);
  } else if (arms === "up") {
    g.moveTo(x - 14 * s, y - 140 * s);
    g.lineTo(x - 40 * s, y - 190 * s);
    g.moveTo(x + 14 * s, y - 140 * s);
    g.lineTo(x + 40 * s, y - 190 * s);
  } else if (arms === "folded") {
    g.moveTo(x - 18 * s, y - 128 * s);
    g.lineTo(x + 18 * s, y - 120 * s);
  }
  g.stroke();
}

/** Rays behind a picture: the gold sunburst every card has somewhere. */
function rays(g: G, x: number, y: number, r: number, n = 18): void {
  g.strokeStyle = "rgba(233,200,110,0.35)";
  g.lineWidth = 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35);
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    g.stroke();
  }
}

/** The ground: hills or a floor, under the figure. */
function ground(g: G, y: number, hills = true): void {
  g.fillStyle = "rgba(20,14,8,0.45)";
  g.beginPath();
  g.moveTo(30, 380);
  if (hills) g.bezierCurveTo(90, y - 18, 160, y + 14, 270, y - 8);
  else g.lineTo(270, y);
  g.lineTo(270, 380);
  g.closePath();
  g.fill();
}

/** Each kind's picture, inside the frame (about 40..260 across, 40..380 down). */
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
  water(g) {
    g.fillStyle = "rgba(160,200,210,0.35)";
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      const y = 200 + i * 28;
      g.moveTo(40, y);
      for (let x = 40; x <= 260; x += 20) g.quadraticCurveTo(x + 10, y - 10, x + 20, y);
      g.lineTo(260, y + 14);
      g.lineTo(40, y + 14);
      g.fill();
    }
    g.fillStyle = INK;
    for (const [x, y] of [[80, 330], [140, 300], [200, 270]]) {
      g.beginPath();
      g.ellipse(x!, y!, 22, 8, 0, 0, Math.PI * 2);
      g.fill();
    }
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
  crowd(g) {
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 6; i++) {
        const x = 55 + i * 38 + (row % 2) * 18, y = 250 + row * 45;
        g.fillStyle = INK;
        disc(g, x, y, 14);
        g.fill();
        g.fillRect(x - 16, y + 10, 32, 40);
      }
    }
    g.fillStyle = "#f0c060";
    for (const x of [80, 150, 220]) {
      disc(g, x, 180, 9);
      g.fill();
    }
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
  hound(g) {
    ground(g, 350, false);
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(150, 280, 78, 34, 0, 0, Math.PI * 2);
    g.fill();
    path(g, [[210, 260], [260, 220], [262, 252], [228, 290]]);
    g.fill();
    for (const x of [96, 120, 180, 204]) g.fillRect(x, 300, 12, 50);
    g.fillStyle = "#e05030";
    disc(g, 244, 236, 4);
    g.fill();
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
  keep(g) {
    ground(g, 340);
    g.fillStyle = INK;
    g.fillRect(118, 120, 64, 220);
    for (let i = 0; i < 4; i++) g.fillRect(114 + i * 20, 104, 12, 18);
    g.fillRect(70, 240, 50, 100);
    g.fillStyle = "#f2c25a";
    g.fillRect(142, 160, 14, 22);
  },
  fire(g) {
    ground(g, 345, false);
    for (const [c, s] of [["#7c2a12", 1], ["#d0601e", 0.75], ["#f0b040", 0.45]] as const) {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(150 - 60 * s, 340);
      g.bezierCurveTo(150 - 70 * s, 260, 150 - 10 * s, 220, 150, 140 + (1 - s) * 80);
      g.bezierCurveTo(150 + 10 * s, 220, 150 + 70 * s, 260, 150 + 60 * s, 340);
      g.fill();
    }
    figure(g, 64, 345, 0.6);
    figure(g, 236, 345, 0.6);
  },
  key(g) {
    rays(g, 150, 210, 120);
    g.strokeStyle = INK;
    g.lineWidth = 14;
    disc(g, 150, 140, 34);
    g.stroke();
    g.beginPath();
    g.moveTo(150, 174);
    g.lineTo(150, 330);
    g.moveTo(150, 300);
    g.lineTo(182, 300);
    g.moveTo(150, 324);
    g.lineTo(176, 324);
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
  lantern(g) {
    g.fillStyle = "rgba(240,200,90,0.25)";
    path(g, [[150, 230], [40, 380], [260, 380]]);
    g.fill();
    g.fillStyle = INK;
    g.fillRect(118, 150, 64, 100);
    path(g, [[110, 150], [150, 112], [190, 150]]);
    g.fill();
    g.fillStyle = "#f2c25a";
    g.fillRect(146, 170, 8, 64);
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

/** The gold frame every card shares: a thin double rule with small corner flourishes. */
function frame(g: G, w: number, h: number): void {
  g.strokeStyle = GOLD;
  g.lineWidth = 6;
  g.strokeRect(14, 14, w - 28, h - 28);
  g.lineWidth = 2;
  g.strokeRect(24, 24, w - 48, h - 48);
  g.fillStyle = GOLD;
  for (const [x, y] of [[24, 24], [w - 24, 24], [24, h - 24], [w - 24, h - 24]]) {
    g.beginPath();
    g.moveTo(x!, y! - 9);
    g.lineTo(x! + 9, y!);
    g.lineTo(x!, y! + 9);
    g.lineTo(x! - 9, y!);
    g.closePath();
    g.fill();
  }
}

/** Old paper's mottle over everything, so the flat colours look printed and worn. */
function wear(g: G, w: number, h: number, seed: number): void {
  const r = rng(seed);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "255,240,200" : "20,10,0"},${0.02 + r() * 0.05})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
  }
  const edge = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.65);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(30,15,0,0.35)");
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
}

/** The face of a card: picture, frame, banner with its title, and a name over it if it has one. */
export function cardFace(kindId: string, name?: string): Canvas {
  const { w, h } = CARD_PX;
  const [c, g] = mk(w, h);
  const k = cardKind(kindId);
  const [light, dark] = GROUND[k.family];
  g.fillStyle = "#120c08";
  g.fillRect(0, 0, w, h);
  const grad = g.createLinearGradient(0, 30, 0, h - 30);
  grad.addColorStop(0, light);
  grad.addColorStop(1, dark);
  g.fillStyle = grad;
  g.fillRect(24, 24, w - 48, h - 48);
  // An arch at the top of the picture.
  g.fillStyle = "rgba(255,235,180,0.12)";
  g.beginPath();
  g.moveTo(40, 380);
  g.lineTo(40, 110);
  g.arc(150, 110, 110, Math.PI, 0);
  g.lineTo(260, 380);
  g.closePath();
  g.fill();
  g.save();
  g.beginPath();
  g.rect(28, 28, w - 56, 360);
  g.clip();
  (PICTURES[k.id] ?? PICTURES.token!)(g, rng(k.id.length * 97));
  g.restore();
  frame(g, w, h);

  // The banner: a ribbon with its ends folded back.
  const by = 405;
  g.fillStyle = "#8a6a2a";
  path(g, [[22, by], [44, by - 6], [44, by + 52], [22, by + 46], [32, by + 23]]);
  g.fill();
  path(g, [[w - 22, by], [w - 44, by - 6], [w - 44, by + 52], [w - 22, by + 46], [w - 32, by + 23]]);
  g.fill();
  g.fillStyle = PAPER;
  g.fillRect(40, by - 6, w - 80, 58);
  g.strokeStyle = GOLD_DARK;
  g.lineWidth = 2;
  g.strokeRect(40, by - 6, w - 80, 58);
  g.fillStyle = INK;
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 30;
  for (; size > 16; size--) {
    g.font = `${size}px ${SERIF}`;
    if (g.measureText(k.title.toUpperCase()).width < w - 100) break;
  }
  g.fillText(k.title.toUpperCase(), w / 2, by + 23);
  if (name) {
    // A name on a gold plate over the picture's foot.
    g.font = `italic 26px ${SERIF}`;
    const nw = Math.min(w - 70, g.measureText(name).width + 30);
    g.fillStyle = "rgba(20,12,6,0.82)";
    g.fillRect(w / 2 - nw / 2, 342, nw, 36);
    g.strokeStyle = GOLD;
    g.strokeRect(w / 2 - nw / 2, 342, nw, 36);
    g.fillStyle = "#f1dfae";
    g.fillText(name.length > 22 ? `${name.slice(0, 21)}…` : name, w / 2, 361, w - 80);
  }
  wear(g, w, h, kindId.length * 13 + (name?.length ?? 0));
  return c;
}

/** The back of a card: dark, in its family's colour, with a gold pattern of our own (a lidded eye in a sunburst). */
export function cardBack(family: CardFamily): Canvas {
  const { w, h } = CARD_PX;
  const [c, g] = mk(w, h);
  const [light, dark] = GROUND[family];
  g.fillStyle = "#120c08";
  g.fillRect(0, 0, w, h);
  g.fillStyle = dark;
  g.fillRect(24, 24, w - 48, h - 48);
  // A lattice of fine gold lines.
  g.strokeStyle = "rgba(201,160,74,0.28)";
  g.lineWidth = 1.5;
  g.save();
  g.beginPath();
  g.rect(24, 24, w - 48, h - 48);
  g.clip();
  for (let i = -h; i < w + h; i += 22) {
    g.beginPath();
    g.moveTo(i, 24);
    g.lineTo(i + h, h + 24);
    g.moveTo(i, h + 24);
    g.lineTo(i + h, 24);
    g.stroke();
  }
  g.restore();
  g.fillStyle = light;
  g.beginPath();
  g.ellipse(w / 2, h / 2, 80, 120, 0, 0, Math.PI * 2);
  g.fill();
  rays(g, w / 2, h / 2, 110, 24);
  g.strokeStyle = GOLD;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(w / 2 - 54, h / 2);
  g.quadraticCurveTo(w / 2, h / 2 - 44, w / 2 + 54, h / 2);
  g.quadraticCurveTo(w / 2, h / 2 + 44, w / 2 - 54, h / 2);
  g.stroke();
  g.fillStyle = GOLD;
  disc(g, w / 2, h / 2, 14);
  g.fill();
  frame(g, w, h);
  wear(g, w, h, 5 + family.length);
  return c;
}
