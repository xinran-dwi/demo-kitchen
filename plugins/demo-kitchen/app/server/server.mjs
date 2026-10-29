// Local server for the menu: serves the app and the project's demo/ folder, saves the recipe,
// streams file changes and export progress over SSE, and runs exports.
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, watch, mkdirSync, createReadStream } from "node:fs";
import { join, resolve, extname, basename, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { record } from "./record.mjs";
import { normalizeRecipe, applyPreset, defaultRecipe } from "../engine/catalog.js";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".ico": "image/x-icon" };

export function loadPresets() {
  const dir = join(APP, "presets");
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => ({ id: basename(f, ".json"), ...JSON.parse(readFileSync(join(dir, f), "utf8")) }));
}

export async function startServer({ demoDir, port = 4180, host = "127.0.0.1" }) {
  demoDir = resolve(demoDir);
  if (!existsSync(join(demoDir, "storyboard.json"))) throw new Error(`No storyboard.json in ${demoDir}. Run /demo-video in your project first.`);
  const recipePath = join(demoDir, "recipe.json"), outDir = join(demoDir, "out");
  const clients = new Set();
  const broadcast = (event, data) => { for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  let lastSelfWrite = 0, job = null;

  if (!existsSync(recipePath)) {
    const calm = loadPresets().find((p) => p.id === "calm-product-demo");
    const fresh = applyPreset(defaultRecipe(), calm || {});
    if (calm) fresh.preset = calm.id;
    writeFileSync(recipePath, JSON.stringify(fresh, null, 2) + "\n");
  }
  const readRecipe = () => { try { return normalizeRecipe(JSON.parse(readFileSync(recipePath, "utf8"))); } catch { return normalizeRecipe({}); } };

  // file watching → live reload
  let timer = null, pending = new Set();
  try {
    watch(demoDir, { recursive: true }, (_, file) => {
      if (!file || file.startsWith("out" + sep) || file === "out" || file.startsWith(".")) return;
      pending.add(file);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const files = [...pending]; pending = new Set();
        const recipeOnly = files.every((f) => f === "recipe.json");
        if (recipeOnly) { if (Date.now() - lastSelfWrite > 600) broadcast("recipe", readRecipe()); }
        else broadcast("scene", { files });
      }, 180);
    });
  } catch (e) { console.warn("File watching unavailable:", e.message); }

  const send = (res, code, body, type = "application/json; charset=utf-8") => { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  const body = (req) => new Promise((r) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
  const serveFile = (res, root, rel) => {
    const file = resolve(root, "." + decodeURIComponent(rel));
    if (!file.startsWith(root)) return send(res, 403, { error: "forbidden" });
    let f = file;
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
    if (!existsSync(f)) return send(res, 404, { error: "not found: " + rel });
    res.writeHead(200, { "content-type": TYPES[extname(f).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
    createReadStream(f).pipe(res);
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    try {
      if (p === "/") { res.writeHead(302, { location: "/app/menu/" }); return res.end(); }
      if (p.startsWith("/app/")) return serveFile(res, APP, p.slice(4));
      if (p.startsWith("/demo/")) return serveFile(res, demoDir, p.slice(5));
      if (p === "/api/info") {
        const sb = JSON.parse(readFileSync(join(demoDir, "storyboard.json"), "utf8"));
        return send(res, 200, { demoDir, outDir, project: basename(dirname(demoDir)), title: sb.title || basename(dirname(demoDir)), presets: loadPresets(), exporting: !!job });
      }
      if (p === "/api/recipe" && req.method === "GET") return send(res, 200, readRecipe());
      if (p === "/api/recipe" && req.method === "PUT") {
        const r = normalizeRecipe(await body(req));
        lastSelfWrite = Date.now();
        writeFileSync(recipePath, JSON.stringify(r, null, 2) + "\n");
        return send(res, 200, { ok: true });
      }
      if (p === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write("event: hello\ndata: {}\n\n");
        clients.add(res);
        const ping = setInterval(() => res.write(": ping\n\n"), 20000);
        req.on("close", () => { clients.delete(res); clearInterval(ping); });
        return;
      }
      if (p === "/api/export" && req.method === "POST") {
        if (job) return send(res, 409, { error: "An export is already running." });
        const o = await body(req);
        const recipe = normalizeRecipe(o.recipe || readRecipe());
        const format = o.format === "gif" ? "gif" : "mp4";
        const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
        const slug = (basename(dirname(demoDir)) || "demo").replace(/[^\w-]+/g, "-").toLowerCase();
        mkdirSync(outDir, { recursive: true });
        const out = join(outDir, `${slug}-${stamp}.${format}`);
        const ctrl = new AbortController();
        job = { ctrl, out };
        const started = Date.now();
        send(res, 202, { ok: true, out });
        broadcast("export", { phase: "start", done: 0, total: 1, format });
        record({ baseUrl: `http://${host}:${server.address().port}`, demo: "/demo/", recipe, format, out, fps: +o.fps || undefined, quality: o.quality, gifWidth: +o.gifWidth || undefined, gifQuality: +o.gifQuality || undefined,
          signal: ctrl.signal, onProgress: (phase, done, total) => broadcast("export", { phase, done, total, format }) })
          .then((r) => { const size = statSync(out).size; broadcast("export", { phase: "finished", ...r, size, url: "/out/" + basename(out), secondsTaken: (Date.now() - started) / 1000 }); console.log(`Exported ${out} (${(size / 1e6).toFixed(1)} MB)`); })
          .catch((e) => { broadcast("export", { phase: "error", message: e.message }); console.error("Export failed:", e.message); })
          .finally(() => { job = null; });
        return;
      }
      if (p === "/api/export/cancel" && req.method === "POST") { job?.ctrl.abort(); return send(res, 200, { ok: true }); }
      if (p === "/api/reveal" && req.method === "POST") {
        const { path } = await body(req);
        const f = resolve(path || outDir);
        if (!f.startsWith(demoDir)) return send(res, 403, { error: "forbidden" });
        spawn("open", existsSync(f) && statSync(f).isFile() ? ["-R", f] : [f]);
        return send(res, 200, { ok: true });
      }
      if (p.startsWith("/out/")) return serveFile(res, outDir, p.slice(4));
      send(res, 404, { error: "not found" });
    } catch (e) {
      console.error(e);
      send(res, 500, { error: e.message });
    }
  });

  const actual = await new Promise((done, fail) => {
    const tryPort = (n, left) => {
      server.once("error", (e) => (e.code === "EADDRINUSE" && left > 0 ? tryPort(n + 1, left - 1) : fail(e)));
      server.listen(n, host, () => done(server.address().port));
    };
    tryPort(port, 30);
  });
  return { url: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${actual}/`, port: actual, server, close: () => server.close() };
}
