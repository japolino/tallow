/**
 * Passes the throwaway Lumiverse's model calls on to your real model endpoint, adding its key from the environment,
 * so the key is never stored in the throwaway's data. UPSTREAM is the endpoint up to /v1 (default: CHAT_URL without
 * /chat/completions); UPSTREAM_KEY its key (default: CHAT_API_KEY).
 */
const up = (process.env.UPSTREAM ?? (process.env.CHAT_URL ?? "").replace(/\/chat\/completions\/?$/, "")).replace(/\/$/, "");
const key = process.env.UPSTREAM_KEY ?? process.env.CHAT_API_KEY ?? "";
if (!up) throw new Error("Set UPSTREAM (or CHAT_URL) to the model endpoint.");
Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.FORWARD_PORT || 8399),
  idleTimeout: 255,
  async fetch(req) {
    const u = new URL(req.url);
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
    const r = await fetch(`${up}${u.pathname.replace(/^\/v1/, "")}${u.search}`, { method: req.method, headers: { "Content-Type": req.headers.get("content-type") ?? "application/json", Authorization: `Bearer ${key}` }, body });
    console.log(new Date().toISOString().slice(11, 19), req.method, u.pathname, r.status);
    return new Response(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("content-type") ?? "application/json" } });
  },
});
console.log(`forwarding 127.0.0.1:${process.env.FORWARD_PORT || 8399} to ${up}`);
