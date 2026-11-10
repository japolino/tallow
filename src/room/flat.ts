/**
 * The flat room: what the player gets where WebGL is not available. The same
 * table, drawn as a still painting on a 2D canvas. It keeps every job the 3D
 * room has (docs/DESIGN.md, 8), only plainer: the hour and the weather tint
 * the picture, the map can be brought up close, pieces stand on their stops,
 * and the die shows its number.
 *
 * It is driven through the same handle as the 3D room, so the game never
 * needs to know which one it has.
 */
import { candleBurn, clockLabel, daylight, WEATHERS } from "./daylight.js";
import { drawMapSheet, stopOnSheet } from "./mapsheet.js";

/** How each kind of weather is said in the picture's description. */
const WEATHER_WORDS: Record<string, string> = { snow: ", snowing", rain: ", raining", storm: ", a thunderstorm", fog: ", fog outside", wind: ", a high wind" };
import type { PieceSpec, RoomHandle, RoomOptions, RoomStats, Weather } from "./room.js";

const css = (c: [number, number, number], k = 1): string => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(1, v * k)) * 255)).join(",")})`;

export function mountFlatRoom(host: HTMLElement, opts: RoomOptions): RoomHandle {
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
  canvas.setAttribute("role", "img");
  host.appendChild(canvas);
  const g = canvas.getContext("2d")!;
  const map = drawMapSheet(opts.map);
  const pieces = new Map<string, PieceSpec>(opts.pieces.map((p) => [p.id, { ...p }]));
  let hour = opts.hour ?? 18.3;
  let weather: Weather = opts.weather ?? "clear";
  let leaning = false;
  let die: number | null = null;

  const paint = (): void => {
    const w = (canvas.width = Math.max(2, host.clientWidth));
    const h = (canvas.height = Math.max(2, host.clientHeight));
    const L = daylight(hour, WEATHERS[weather] ?? WEATHERS.clear);
    const dark = Math.min(1, L.ambientIntensity * 0.8 + L.candle * 0.25);
    canvas.setAttribute("aria-label", `A table in a dark room, ${L.phase}, ${clockLabel(hour)}${WEATHER_WORDS[weather] ?? ""}. A hooded figure sits across it.${die ? ` The die shows ${die}.` : ""}`);

    // The wall, and the window behind the narrator.
    g.fillStyle = css([0.07, 0.05, 0.04], 0.5 + dark);
    g.fillRect(0, 0, w, h);
    const wx = w * 0.36, ww = w * 0.28, wy = h * 0.06, wh = h * 0.46;
    const sky = g.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, css(L.skyTop));
    sky.addColorStop(1, css(L.skyHorizon));
    g.fillStyle = sky;
    g.beginPath();
    g.moveTo(wx, wy + wh);
    g.lineTo(wx, wy + ww / 2);
    g.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
    g.lineTo(wx + ww, wy + wh);
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = "rgba(10,8,6,.9)";
    g.lineWidth = Math.max(1, w / 500);
    for (let i = -8; i < 16; i++) {
      g.beginPath();
      g.moveTo(wx + (i * ww) / 7, wy);
      g.lineTo(wx + (i * ww) / 7 + wh * 0.5, wy + wh);
      g.moveTo(wx + (i * ww) / 7, wy);
      g.lineTo(wx + (i * ww) / 7 - wh * 0.5, wy + wh);
      g.stroke();
    }
    if (L.cold > 0.5) {
      g.fillStyle = "rgba(240,246,255,.8)";
      for (let i = 0; i < 90; i++) g.fillRect(wx + ((i * 97) % 100) * 0.01 * ww, wy + ((i * 57) % 100) * 0.01 * wh, 2, 2);
    }
    if (L.wet > 0.5) {
      // Rain: short slanted strokes.
      g.strokeStyle = "rgba(200,214,232,.55)";
      for (let i = 0; i < 70; i++) {
        const x = wx + ((i * 97) % 100) * 0.01 * ww, y = wy + ((i * 57) % 100) * 0.01 * wh;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - 3 - L.wind * 6, y + 12);
        g.stroke();
      }
    }
    if (L.fog > 0.5) {
      g.fillStyle = "rgba(190,194,196,.35)";
      g.fillRect(wx, wy, ww, wh);
    }
    g.restore();

    // The narrator: a hooded shape, and two eyes.
    g.fillStyle = "#040304";
    g.beginPath();
    g.moveTo(w * 0.3, h * 0.6);
    g.quadraticCurveTo(w * 0.36, h * 0.36, w * 0.45, h * 0.33);
    g.quadraticCurveTo(w * 0.44, h * 0.16, w * 0.5, h * 0.15);
    g.quadraticCurveTo(w * 0.56, h * 0.16, w * 0.55, h * 0.33);
    g.quadraticCurveTo(w * 0.64, h * 0.36, w * 0.7, h * 0.6);
    g.fill();
    g.fillStyle = "#f6ecd0";
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(w * 0.5 + s * w * 0.018, h * 0.255, w * 0.009, w * 0.004, s * 0.12, 0, Math.PI * 2);
      g.fill();
    }

    // The table, and the map on it. Leaning in brings the map up to fill the view.
    const top = leaning ? h * 0.12 : h * 0.56;
    const table = g.createLinearGradient(0, top, 0, h);
    table.addColorStop(0, css([0.2, 0.12, 0.07], 0.5 + dark));
    table.addColorStop(1, css([0.34, 0.21, 0.12], 0.5 + dark));
    g.fillStyle = table;
    g.beginPath();
    g.moveTo(w * (leaning ? 0 : 0.14), top);
    g.lineTo(w * (leaning ? 1 : 0.86), top);
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.fill();
    const mw = leaning ? Math.min(w * 0.92, (h * 0.82 * map.width) / map.height) : w * 0.46;
    const mh = (mw * map.height) / map.width * (leaning ? 1 : 0.55);
    const mx = (w - mw) / 2, my = leaning ? top + (h - top - mh) / 2 : h * 0.62;
    g.drawImage(map, mx, my, mw, mh);
    for (const p of pieces.values()) {
      const s = opts.map.stops.find((x) => x.id === p.at);
      if (!s) continue;
      const q = stopOnSheet(s.u, s.v);
      const r = Math.max(4, mw * 0.014);
      g.fillStyle = p.kind === "narrator" ? "#0c0a10" : "#e6d9ba";
      g.strokeStyle = p.kind === "narrator" ? "#9a1410" : p.kind === "player" ? "#244a9a" : "#2c6a3a";
      g.lineWidth = Math.max(2, r * 0.35);
      g.beginPath();
      g.arc(mx + q.u * mw + (p.kind === "narrator" ? r : -r), my + q.v * mh - r, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // The candles at either end of the table tell the hour as they do in the 3D room: new at dusk, burnt down by
    // morning, cold stubs by day (and set out early when the weather makes the day dark).
    if (!leaning) {
      const clock = candleBurn(hour);
      const lit = clock < 1 || L.candle >= 0.5;
      const burn = clock < 1 ? clock : lit ? 0.15 : 1;
      const foot = top + h * 0.035;
      for (const [cx, tall] of [[0.2, 1], [0.228, 0.72], [0.8, 0.94]] as const) {
        const ch = h * 0.12 * tall * (1 - 0.84 * burn);
        const cw = Math.max(4, w * 0.011);
        const x = w * cx;
        g.fillStyle = css([0.86, 0.8, 0.64], lit ? 1 : 0.3 + dark * 0.6);
        g.fillRect(x - cw / 2, foot - ch, cw, ch);
        if (!lit) continue;
        g.globalCompositeOperation = "lighter";
        const glow = g.createRadialGradient(x, foot - ch, 0, x, foot - ch, h * 0.42);
        glow.addColorStop(0, "rgba(255,170,80,.34)");
        glow.addColorStop(0.35, "rgba(200,110,40,.12)");
        glow.addColorStop(1, "rgba(120,60,20,0)");
        g.fillStyle = glow;
        g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = "source-over";
        g.fillStyle = "#ffd98a";
        g.beginPath();
        g.ellipse(x, foot - ch - cw * 0.9, cw * 0.36, cw * 0.9, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (die) {
      const r = Math.max(14, w * 0.022);
      const dx = w * 0.8, dy = h * 0.88;
      g.fillStyle = "#5a1216";
      g.beginPath();
      for (let i = 0; i < 6; i++) g.lineTo(dx + Math.cos((i / 6) * Math.PI * 2 + Math.PI / 6) * r, dy + Math.sin((i / 6) * Math.PI * 2 + Math.PI / 6) * r);
      g.fill();
      g.fillStyle = "#f0d08a";
      g.font = `700 ${r}px Georgia, serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(die), dx, dy);
    }

    // The hour's light over everything, and the dark at the edges.
    g.globalCompositeOperation = "soft-light";
    g.fillStyle = css(L.sunColor, Math.min(1, L.sunIntensity / 3));
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "source-over";
    const vig = g.createRadialGradient(w / 2, h * 0.55, h * 0.2, w / 2, h * 0.55, Math.max(w, h) * 0.75);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,.92)");
    g.fillStyle = vig;
    g.fillRect(0, 0, w, h);
  };

  const obs = new ResizeObserver(paint);
  obs.observe(host);
  const onClick = (): void => handle.lean(!leaning);
  canvas.addEventListener("click", onClick);

  const handle: RoomHandle = {
    kind: "flat",
    ready: Promise.resolve(),
    setClock(h: number) {
      hour = h;
      paint();
    },
    setWeather(wv: Weather) {
      weather = wv;
      paint();
    },
    lean(over: boolean) {
      if (leaning === over) return;
      leaning = over;
      opts.onLean?.(over);
      paint();
    },
    get leaning() {
      return leaning;
    },
    rollDie(value: number) {
      die = value;
      paint();
      return Promise.resolve();
    },
    offerDie(value: number) {
      return handle.rollDie(value);
    },
    holding: false,
    releaseDie() {},
    movePiece(id: string, stopId: string) {
      const p = pieces.get(id);
      if (p) p.at = stopId;
      paint();
      return Promise.resolve();
    },
    stats(): RoomStats {
      return { fps: 0, quality: 0, buffer: [canvas.width, canvas.height] };
    },
    dispose() {
      obs.disconnect();
      canvas.removeEventListener("click", onClick);
      canvas.remove();
    },
  };
  paint();
  return handle;
}
