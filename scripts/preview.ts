/**
 * Room preview server: bundles preview/main.ts and serves it with
 * preview/index.html at http://localhost:4184 (PORT overrides). The bundle is
 * rebuilt on each page load, so a refresh picks up edits. No Lumiverse needed.
 */
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const port = Number(process.env.PORT ?? 4184);

async function bundle(entry: string): Promise<Response> {
  const result = await Bun.build({ entrypoints: [join(root, entry)], target: "browser", format: "esm", splitting: false, sourcemap: "inline" });
  if (!result.success) {
    const text = result.logs.map((l) => String(l)).join("\n");
    console.error(text);
    return new Response(`console.error(${JSON.stringify(text)})`, { headers: { "content-type": "text/javascript" } });
  }
  return new Response(await result.outputs[0]!.text(), { headers: { "content-type": "text/javascript", "cache-control": "no-store" } });
}

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/main.js") return bundle("preview/main.ts");
    if (url.pathname === "/cards.js") return bundle("preview/cards.ts");
    // The built extension in a pretend host (preview/host.ts): run `bun run build` first.
    if (url.pathname === "/host.js") return bundle("preview/host.ts");
    if (url.pathname === "/dist/frontend.js") return new Response(Bun.file(join(root, "dist/frontend.js")), { headers: { "content-type": "text/javascript", "cache-control": "no-store" } });
    if (url.pathname === "/host") return new Response('<!doctype html><meta charset="utf-8"><title>Tallow in a pretend host</title><style>html,body{margin:0;height:100%;background:#111}</style><script type="module" src="/host.js"></script>', { headers: { "content-type": "text/html", "cache-control": "no-store" } });
    // Every card face and back, for looking at the art.
    if (url.pathname === "/cards") return new Response('<!doctype html><meta charset="utf-8"><title>Tallow cards</title><script type="module" src="/cards.js"></script>', { headers: { "content-type": "text/html", "cache-control": "no-store" } });
    // Models and other files the room loads at run time.
    if (url.pathname.startsWith("/assets/")) {
      const rel = decodeURIComponent(url.pathname.slice(8));
      if (rel.split("/").some((p) => p === ".." || p === "")) return new Response("bad path", { status: 400 });
      const f = Bun.file(join(root, "assets", rel));
      return (await f.exists()) ? new Response(f, { headers: { "cache-control": "no-store" } }) : new Response("not found", { status: 404 });
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file(join(root, "preview/index.html")), { headers: { "content-type": "text/html", "cache-control": "no-store" } });
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`Tallow room preview: http://localhost:${port}`);
