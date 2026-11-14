/**
 * The camera for scripts/film-clips.ts, which films the room for a trailer: 1920 by 1080 at 30 frames a second, into
 * .artifacts/trailer-clips/ (no sound: the music and the room's sounds are not in the pictures).
 *
 * The built extension is played in the pretend host (preview/host.ts, ?run=1) in a browser without a window. The
 * page's clock is ours: timers, animation frames and the page's own transitions only move when a frame is stepped, a
 * sixtieth of a second at a time, and a picture is taken every second step. So a clip is exactly as smooth as the room
 * is, however long a frame takes to draw or to save.
 *
 * The narrator's words are set a little larger than the room sets them (22 px to the rem, not 16), so they can be
 * read in a video; the leave button is taken out of the picture.
 */
import { mkdirSync } from "node:fs";
import { withPage, type Page } from "./browser.js";

export const W = 1920, H = 1080, FPS = 30;
export const OUT = process.env.FILM_OUT ?? ".artifacts/trailer-clips";
const PORT = Number(process.env.TALLOW_PORT ?? 4191);

/** Put in the page before anything of its own runs: the clock, timers and frames are stepped from here. */
const CLOCK = `(() => {
  let now = 0, seq = 1, rafs = [];
  const base = Date.now(), timers = new Map(), roots = [], seen = new Map();
  performance.now = () => now;
  Date.now = () => base + now;
  window.setTimeout = (fn, ms, ...a) => (timers.set(seq, { at: now + Math.max(0, +ms || 0), fn, a, every: 0 }), seq++);
  window.setInterval = (fn, ms, ...a) => (timers.set(seq, { at: now + Math.max(1, +ms || 0), fn, a, every: Math.max(1, +ms || 0) }), seq++);
  window.clearTimeout = window.clearInterval = (id) => void timers.delete(id);
  window.requestAnimationFrame = (fn) => (rafs.push({ id: seq, fn }), seq++);
  window.cancelAnimationFrame = (id) => void (rafs = rafs.filter((r) => r.id !== id));
  const attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (o) { const r = attach.call(this, o); roots.push(r); return r; };
  const ease = (k) => k * k * (3 - 2 * k);
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const F = (window.film = {
    get now() { return now; },
    /** A camera move: { from: {eye, look, fov}, to: {...}, t0, ms }. Null gives the view back to the player. */
    move: null,
    cam(from, to, seconds) { F.move = from ? { from, to: to ?? from, t0: now, ms: seconds * 1000 } : null; if (!from && window.room) window.room.lookFrom(null); },
    /** Things to do at a time of the clip: [{ at: ms from now, run: () => {} }]. */
    cues: [],
    cue(seconds, run) { F.cues.push({ at: now + seconds * 1000, run }); },
    step(n) {
      for (let i = 0; i < n; i++) {
        const end = now + 1000 / 60;
        for (let guard = 0; guard < 5000; guard++) {
          let next = null;
          for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
          if (!next) break;
          const [id, t] = next;
          now = Math.max(now, t.at);
          if (t.every) t.at += t.every; else timers.delete(id);
          try { typeof t.fn === "function" ? t.fn(...t.a) : (0, eval)(t.fn); } catch (e) { console.error(e); }
        }
        now = end;
        for (const c of F.cues.filter((c) => c.at <= now)) { F.cues.splice(F.cues.indexOf(c), 1); try { c.run(); } catch (e) { console.error(e); } }
        if (F.move && window.room) {
          const m = F.move, k = ease(Math.min(1, m.ms ? (now - m.t0) / m.ms : 1));
          window.room.lookFrom(mix(m.from.eye, m.to.eye, k), mix(m.from.look, m.to.look, k), m.from.fov + (m.to.fov - m.from.fov) * k);
        }
        const run = rafs; rafs = [];
        for (const r of run) try { r.fn(now); } catch (e) { console.error(e); }
      }
      // The page's own transitions and animations keep our time, not the wall's.
      const all = new Set(document.getAnimations());
      for (const r of roots) for (const a of r.getAnimations()) all.add(a);
      for (const a of all) {
        if (!seen.has(a)) seen.set(a, now - 1000 / 60);
        const at = now - seen.get(a), end = a.effect?.getComputedTiming().endTime ?? 0;
        try { if (at >= end) a.finish(); else { a.pause(); a.currentTime = at; } } catch {}
      }
      for (const a of [...seen.keys()]) if (!all.has(a)) seen.delete(a);
      return now;
    },
  });
})()`;

export interface Film {
  page: Page;
  /** Run the page on without taking pictures. */
  skip(seconds: number): Promise<void>;
  /** Run the page on until this is true in it, without pictures; false if it never was. */
  wait(cond: string, most?: number): Promise<boolean>;
  /** Take pictures for this long. */
  roll(seconds: number): Promise<void>;
  /** Take pictures until this is true in the page (and `after` seconds more); false if it never was. */
  rollUntil(cond: string, most: number, after?: number): Promise<boolean>;
  /** The pointer wanders a little while pictures are taken, so the view is never quite still. */
  drift(on: boolean): void;
  /** Move the camera from one view to another over the next seconds; null gives it back to the player's own. */
  cam(from: View | null, to?: View, seconds?: number): Promise<void>;
  run<T = unknown>(expr: string): Promise<T>;
  /** Touch one of the desk's own things with the mouse (desk.ts, screenOf). */
  touch(what: string): Promise<boolean>;
  click(x: number, y: number): Promise<void>;
}
export interface View {
  eye: [number, number, number];
  look: [number, number, number];
  fov: number;
}

const HOST = (q: string): string => `http://127.0.0.1:${PORT}/host?${q}`;

/** One sitting in the pretend host, and the clips made in it. `want` says which clips are made; the rest are played through without pictures. */
export async function reel(name: string, query: string, want: (clip: string) => boolean, play: (f: Film, clip: (name: string, make: () => Promise<void>) => Promise<void>) => Promise<void>, size: { w: number; h: number } = { w: W, h: H }): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await withPage({ port: PORT, width: size.w, height: size.h }, async (page) => {
    await page.cdp("Emulation.setDeviceMetricsOverride", { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
    await page.cdp("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK });
    await page.cdp("Page.navigate", { url: query.startsWith("/") ? `http://127.0.0.1:${PORT}${query}` : HOST(query) });
    let enc: { stdin: { write(b: Uint8Array): unknown; end(): unknown; flush?(): unknown }; exited: Promise<number> } | null = null;
    let frames = 0, drifting = false, t = 0;
    const step = (n: number): Promise<number> => page.run<number>(`film.step(${n})`);
    const frame = async (): Promise<void> => {
      if (drifting) {
        t += 1 / FPS;
        await page.mouse("move", size.w * (0.5 + 0.16 * Math.sin(t * 0.55)), size.h * (0.3 + 0.06 * Math.sin(t * 0.83 + 1)));
      }
      await step(2);
      if (!enc) return;
      const shot = await page.cdp<{ data: string }>("Page.captureScreenshot", { format: "jpeg", quality: 97, optimizeForSpeed: true });
      enc.stdin.write(Buffer.from(shot.data, "base64"));
      frames++;
    };
    const cond = (c: string): Promise<boolean> => page.run<boolean>(`!!(${c})`).catch(() => false);
    const f: Film = {
      page,
      run: (e) => page.run(e),
      drift: (on) => void (drifting = on),
      async skip(seconds) {
        const was = enc;
        enc = null;
        for (let left = seconds; left > 0; left -= 0.5) await step(Math.round(Math.min(left, 0.5) * 60));
        enc = was;
      },
      async wait(c, most = 60) {
        const was = enc;
        enc = null;
        let ok = false;
        for (let s = 0; s < most && !(ok = await cond(c)); s += 0.1) await step(6);
        enc = was;
        return ok;
      },
      async roll(seconds) {
        for (let i = 0; i < Math.round(seconds * FPS); i++) await frame();
      },
      async rollUntil(c, most, after = 0) {
        let ok = false;
        for (let i = 0; i < most * FPS && !(ok = await cond(c)); i++) await frame();
        if (ok && after) await f.roll(after);
        return ok;
      },
      async cam(from, to, seconds = 0) {
        await page.run(`(film.cam(${JSON.stringify(from)}, ${JSON.stringify(to ?? null)}, ${seconds}), 1)`);
      },
      async touch(what) {
        const at = await page.run<{ x: number; y: number } | null>(`room.desk.screenOf(${JSON.stringify(what)})`);
        if (!at) return false;
        await f.click(at.x, at.y);
        return true;
      },
      async click(x, y) {
        await page.mouse("move", x, y);
        await page.mouse("down", x, y);
        await page.mouse("up", x, y);
      },
    };
    const clip = async (clipName: string, make: () => Promise<void>): Promise<void> => {
      const full = `${name}-${clipName}`;
      const filmed = want(full);
      const t0 = Date.now();
      if (filmed) {
        const proc = Bun.spawn(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", "-an", `${OUT}/${full}.mp4`], { stdin: "pipe", stdout: "ignore", stderr: "inherit" });
        enc = proc as unknown as typeof enc;
        frames = 0;
      }
      try {
        await make();
      } finally {
        if (filmed && enc) {
          const e = enc;
          enc = null;
          await e.stdin.end();
          await e.exited;
          console.log(`${full}.mp4  ${(frames / FPS).toFixed(1)} s  (${((Date.now() - t0) / 1000).toFixed(0)} s to film)`);
        }
        drifting = false;
        await f.cam(null).catch(() => {});
      }
    };
    await play(f, clip);
    const bad = page.problems.filter((p) => !/GPU stall|GL Driver|WebGL|no model in the pretend host|fell back|tallow: /.test(p));
    if (bad.length) console.log(`${name}: the page complained: ${bad.slice(0, 4).join(" | ")}`);
  });
}

/** Sit down in the pretend host and wait until the room is there; the leave button is taken out of the picture. */
export async function sitDown(f: Film): Promise<void> {
  for (let i = 0; i < 300 && !(await f.run<boolean>("!!window.hostReady").catch(() => false)); i++) await f.page.wait(100);
  const b = await f.page.middle("#sit");
  await f.click(b.x, b.y);
  for (let i = 0; i < 400 && !(await f.run<boolean>("!!window.room").catch(() => false)); i++) {
    await f.run("film.step(2)");
    await f.page.wait(30);
  }
  // The models load in real time, whatever our clock says.
  for (let i = 0; i < 400; i++) {
    const ready = await f.run<boolean>("Promise.race([window.room.ready.then(() => true), new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(false); c.port2.postMessage(0); })])");
    if (ready) break;
    await f.run("film.step(2)");
    await f.page.wait(50);
  }
  await f.run(`(() => { for (const el of document.querySelectorAll("*")) { const b = el.shadowRoot?.querySelector(".tl-close"); if (b) b.style.display = "none"; } for (const b of document.querySelectorAll("button")) b.style.display = "none"; if (innerWidth > 900) document.documentElement.style.fontSize = "22px"; window.heard = []; const say = room.desk.say.bind(room.desk); room.desk.say = (lines) => (window.heard.push(...[].concat(lines)), say(lines)); return 1; })()`);
}

export const ASKED = "room.desk.inviting && room.desk.mode === 'idle' && !room.desk.voice.speaking";
export const heard = (part: string): string => `window.heard.some((t) => t.includes(${JSON.stringify(part)}))`;

/** Hurry the page on to where the player is asked to write: the narrator's words are brought out at once, pages set down, a die let go. */
export async function hurry(f: Film, cond: string = ASKED, most = 120): Promise<boolean> {
  for (let s = 0; s < most; s += 0.25) {
    if (await f.run<boolean>(`!!(${cond})`).catch(() => false)) return true;
    if (await f.run<boolean>("room.desk.voice.speaking")) await f.page.type(" ");
    else if (await f.run<boolean>("room.holding")) await f.run("room.releaseDie()");
    else if (await f.run<boolean>("room.desk.mode === 'holding' || room.desk.mode === 'reading'")) await f.page.key("Enter");
    await f.run("film.step(15)");
  }
  return false;
}
