/**
 * A browser without a window, for looking at the room from scripts: it starts
 * the preview server in this process, starts the Edge that ships with Windows
 * (or the browser named in TALLOW_BROWSER) headless, and drives one page
 * through the debugging protocol. Nothing is downloaded and no other browser
 * is touched: the process started here is the only one stopped at the end.
 *
 *   soft: true   draw with the software renderer instead of the graphics
 *                card, which is a fair stand-in for a slow machine.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const CANDIDATES = [
  process.env.TALLOW_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((p): p is string => !!p);

export interface Page {
  /** Open the preview with this query string ("t=23&weather=rain") and wait until the room and its models are ready. */
  open(query: string): Promise<void>;
  /** Run an expression in the page and return its value (promises are awaited). */
  run<T = unknown>(expression: string): Promise<T>;
  /** Save what the page shows; with a clip, only that part of it, enlarged by `scale`. */
  shot(file: string, clip?: { x: number; y: number; width: number; height: number; scale?: number }): Promise<void>;
  size(width: number, height: number): Promise<void>;
  /** Real pointer input, through the browser's own input path. */
  mouse(type: "move" | "down" | "up", x: number, y: number): Promise<void>;
  /** Turn the mouse wheel over a point; a negative `deltaY` is a roll away from you. */
  wheel(x: number, y: number, deltaY: number): Promise<void>;
  /** Real keyboard input: each character is a key going down and coming up, so the page's own key handlers hear it. */
  type(text: string): Promise<void>;
  /** One named key, such as "Enter". */
  key(name: string): Promise<void>;
  /** The middle of an element on the page, for clicking it with the mouse. */
  middle(selector: string): Promise<{ x: number; y: number }>;
  wait(ms: number): Promise<void>;
  /** Console errors and warnings seen so far. */
  readonly problems: string[];
}

export async function withPage<T>(o: { soft?: boolean; width?: number; height?: number; port?: number }, fn: (page: Page) => Promise<T>): Promise<T> {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error("No Chromium-family browser found. Set TALLOW_BROWSER to one.");
  const port = o.port ?? 4185;
  process.env.PORT = String(port);
  await import("./preview.js");

  const profile = join(tmpdir(), `tallow-shots-${process.pid}`);
  const debugPort = 9300 + (process.pid % 500);
  const args = [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    `--window-size=${o.width ?? 1024},${o.height ?? 768}`,
    "--hide-scrollbars",
    "--mute-audio",
    "--no-first-run",
    "--disable-extensions",
    "--force-device-scale-factor=1",
    ...(o.soft ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu"] : ["--enable-gpu", "--ignore-gpu-blocklist"]),
    "about:blank",
  ];
  const proc = Bun.spawn([exe, ...args], { stdout: "ignore", stderr: "ignore" });
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  try {
    let wsUrl = "";
    for (let i = 0; i < 80 && !wsUrl; i++) {
      await sleep(150);
      try {
        const list = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
        wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? "";
      } catch {
        /* not up yet */
      }
    }
    if (!wsUrl) throw new Error("The browser did not start.");
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((ok, bad) => {
      ws.onopen = () => ok();
      ws.onerror = () => bad(new Error("could not reach the browser"));
    });
    let next = 1;
    const waiting = new Map<number, { ok: (v: any) => void; bad: (e: Error) => void }>();
    const problems: string[] = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.id && waiting.has(m.id)) {
        const w = waiting.get(m.id)!;
        waiting.delete(m.id);
        m.error ? w.bad(new Error(m.error.message)) : w.ok(m.result);
      } else if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) {
        problems.push(`${m.params.type}: ${m.params.args.map((a: any) => a.value ?? a.description ?? "").join(" ")}`);
      } else if (m.method === "Runtime.exceptionThrown") {
        problems.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
      }
    };
    const send = <R = any>(method: string, params: object = {}): Promise<R> =>
      new Promise((ok, bad) => {
        const id = next++;
        waiting.set(id, { ok, bad });
        ws.send(JSON.stringify({ id, method, params }));
      });
    await send("Page.enable");
    await send("Runtime.enable");

    const run = async <R>(expression: string): Promise<R> => {
      const r = await send<{ result: { value: R }; exceptionDetails?: { text: string; exception?: { description?: string } } }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    const page: Page = {
      problems,
      run,
      wait: sleep,
      async open(query) {
        await send("Page.navigate", { url: `http://127.0.0.1:${port}/?${query}` });
        for (let i = 0; i < 200; i++) {
          await sleep(100);
          const ready = await run<boolean>("!!window.room").catch(() => false);
          if (ready) break;
        }
        await run("window.room.ready");
        // The room only moves when a script tells it to, so every picture is of an exact moment.
        await run("window.room.paused = true");
      },
      async shot(file, clip) {
        mkdirSync(dirname(file), { recursive: true });
        const r = await send<{ data: string }>("Page.captureScreenshot", {
          ...(file.endsWith(".png") ? { format: "png" } : { format: "jpeg", quality: 92 }),
          ...(clip ? { clip: { ...clip, scale: clip.scale ?? 1 } } : {}),
        });
        await Bun.write(file, Buffer.from(r.data, "base64"));
      },
      async size(width, height) {
        await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
        await sleep(200);
      },
      async wheel(x, y, deltaY) {
        await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY, pointerType: "mouse" });
      },
      async type(text) {
        for (const ch of text) {
          const key = { key: ch, code: ch === " " ? "Space" : "", windowsVirtualKeyCode: ch === " " ? 32 : ch.toUpperCase().charCodeAt(0) };
          await send("Input.dispatchKeyEvent", { type: "keyDown", text: ch, unmodifiedText: ch, ...key });
          await send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
        }
      },
      async key(name) {
        const key = { key: name, code: name, windowsVirtualKeyCode: name === "Enter" ? 13 : 0 };
        await send("Input.dispatchKeyEvent", { type: "keyDown", ...(name === "Enter" ? { text: String.fromCharCode(13) } : {}), ...key });
        await send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
      },
      async middle(selector) {
        return run<{ x: number; y: number }>(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: "nearest" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      },
      async mouse(type, x, y) {
        await send("Input.dispatchMouseEvent", { type: type === "move" ? "mouseMoved" : type === "down" ? "mousePressed" : "mouseReleased", x, y, button: type === "move" ? "none" : "left", buttons: type === "down" ? 1 : 0, clickCount: type === "move" ? 0 : 1, pointerType: "mouse" });
      },
    };
    return await fn(page);
  } finally {
    if (process.platform === "win32") {
      // On Windows, killing the process we started leaves the browser's own helpers (GPU, renderers, utilities)
      // running for good, a dozen for every run. Stop the whole tree, and then anything still holding this profile.
      const quiet = { stdout: "ignore", stderr: "ignore" } as const;
      Bun.spawnSync(["taskkill", "/PID", String(proc.pid), "/T", "/F"], quiet);
      const held = `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*tallow-shots-${process.pid}*' -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
      Bun.spawnSync(["powershell", "-NoProfile", "-NonInteractive", "-Command", held], quiet);
    }
    proc.kill();
    await proc.exited.catch(() => {});
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* the profile folder can stay locked for a moment; it is in the temp folder */
    }
  }
}
