// last_tenant: single-player browser game. The server only serves the built client + /health (no rooms, no DB).
// Zero dependencies (node:http) so the image builds without network access.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT ?? 2567);
const root = process.env.PUBLIC_DIR ?? "";
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".mp3": "audio/mpeg",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, game: "last_tenant" })); return; }
  if (!root) { res.writeHead(404); res.end(); return; }
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (rel.endsWith("/")) rel += "index.html";
  let file = join(root, rel);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); } catch { file = join(root, "index.html"); }
  try {
    const body = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": ext === ".html" ? "no-cache" : "public, max-age=3600" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(port, "0.0.0.0", () => console.log(`[last_tenant] listening on :${port}`));
