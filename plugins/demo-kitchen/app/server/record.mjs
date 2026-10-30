// Frame-by-frame export: headless Chrome renders every frame with player.renderAt(u), then
// ffmpeg (MP4) or gifski (GIF) encodes them. Same pipeline as anatomy-skill-test/teaser/record-gifs-hq.mjs.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { openPage } from "./chrome.mjs";
import { ASPECTS, normalizeRecipe } from "../engine/catalog.js";

// ~/.demo-kitchen/tools/bin is where setup/setup.sh (Mac) or setup.ps1 (Windows) puts private copies,
// so people never need Homebrew or an installer.
const WIN = process.platform === "win32";
const PRIVATE = join(homedir(), ".demo-kitchen", "tools", "bin");
const BIN_DIRS = WIN ? [PRIVATE] : [PRIVATE, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
const PATH_DIRS = (process.env.PATH || "").split(WIN ? ";" : ":").filter(Boolean);
export function findTool(name, { required = true } = {}) {
  const file = WIN ? name + ".exe" : name;
  for (const d of [...BIN_DIRS, ...PATH_DIRS]) if (existsSync(join(d, file))) return join(d, file);
  return required ? name : null; // let spawn try PATH and report a clear error
}

function run(cmd, args, onLine, opts = {}) {
  return new Promise((done, fail) => {
    const p = spawn(cmd, args, opts);
    let tail = "";
    const eat = (d) => { const s = d.toString(); tail = (tail + s).slice(-4000); onLine?.(s); };
    p.stdout.on("data", eat);
    p.stderr.on("data", eat);
    p.on("error", (e) => fail(new Error(`${cmd} could not start (${e.code}). ${e.code === "ENOENT" ? "Ask Claude to run Demo Kitchen's setup again." : ""}`)));
    p.on("exit", (code) => (code === 0 ? done() : fail(new Error(`${basename(cmd)} failed:\n${tail}`))));
  });
}

/**
 * opts: { baseUrl, demo, recipe, format: 'mp4'|'gif', out, fps, quality: '1080p'|'4k', gifWidth, gifQuality,
 *         scale (override capture scale, e.g. 0.25 for menu preview clips), crf, onProgress(phase, done, total), signal }
 */
export async function record(opts) {
  const recipe = normalizeRecipe(opts.recipe);
  const [W, H] = ASPECTS[recipe.aspect];
  const format = opts.format || "mp4";
  const fps = opts.fps || (format === "gif" ? 20 : 60);
  let scale = opts.scale ?? (format === "mp4" ? (opts.quality === "4k" ? 2 : 1) : (opts.gifWidth || 1200) > W ? 2 : 1);
  const blur = recipe.dishes.motionBlur.on ? Math.max(2, Math.round(recipe.dishes.motionBlur.samples)) : 1;
  const progress = opts.onProgress || (() => {});

  const work = join(tmpdir(), `demo-kitchen-${process.pid}-${Date.now()}`);
  const raw = join(work, "raw"), frames = join(work, "frames");
  mkdirSync(raw, { recursive: true });
  mkdirSync(frames, { recursive: true });

  const dpr = scale >= 1 ? scale : 1, clipScale = scale >= 1 ? 1 : scale;
  const page = await openPage(`${opts.baseUrl}/app/player/index.html?demo=${encodeURIComponent(opts.demo || "/demo/")}&mode=export`, { width: W, height: H, scale: dpr });
  try {
    // wait for the player module to start, then for the demo to finish loading
    for (let i = 0; ; i++) {
      if (await page.evaluate("location.pathname.endsWith('/player/index.html') && !!window.playerReady").catch(() => false)) break;
      if (i > 300) throw new Error("The player page did not load. " + page.errors.join(" "));
      await new Promise((r) => setTimeout(r, 100));
    }
    await page.evaluate("window.playerReady");
    await page.evaluate(`player.setRecipe(${JSON.stringify(recipe)}), true`);
    const total = await page.evaluate("player.total");
    const count = Math.max(1, Math.ceil(total * fps - 1e-6));
    const shutter = 0.5; // 180° shutter: blend the first half of each frame interval
    progress("capture", 0, count);
    let k = 0;
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < blur; j++) {
        if (opts.signal?.aborted) throw new Error("Export cancelled");
        const u = blur > 1 ? (i + (j / (blur - 1) - 0.5) * shutter) / fps : i / fps;
        await page.evaluate(`player.renderAt(${Math.max(0, Math.min(total - 1e-4, u))}), true`);
        const { data } = await page.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true, clip: { x: 0, y: 0, width: W, height: H, scale: clipScale } });
        writeFileSync(join(blur > 1 ? raw : frames, String(k++).padStart(5, "0") + ".png"), Buffer.from(data, "base64"));
      }
      progress("capture", i + 1, count);
    }
    page.close();
    if (page.errors.length) console.warn("[demo-kitchen] page messages:\n  " + [...new Set(page.errors)].slice(0, 8).join("\n  "));

    const ffmpeg = findTool("ffmpeg");
    if (blur > 1) {
      progress("blend", 0, count);
      await run(ffmpeg, ["-y", "-loglevel", "error", "-stats", "-framerate", String(fps * blur), "-i", join(raw, "%05d.png"),
        "-vf", `tmix=frames=${blur},select='eq(mod(n\\,${blur})\\,${blur - 1})'`, "-fps_mode", "passthrough", "-start_number", "0", join(frames, "%05d.png")],
        (s) => { const m = s.match(/frame=\s*(\d+)/); if (m) progress("blend", +m[1], count); });
    }

    mkdirSync(dirname(opts.out), { recursive: true });
    progress("encode", 0, count);
    const gifski = format === "gif" && findTool("gifski", { required: false });
    if (format === "gif" && !gifski) {
      // No gifski: ffmpeg's two-pass palette GIF. Bigger files, still clean.
      const w = opts.gifWidth || 1200;
      await run(ffmpeg, ["-y", "-loglevel", "error", "-stats", "-framerate", String(fps), "-i", join(frames, "%05d.png"),
        "-vf", `scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a`, opts.out],
        (s) => { const m = s.match(/frame=\s*(\d+)/); if (m) progress("encode", +m[1], count); });
    } else if (format === "gif") {
      // Short names, run from the frames folder: Windows caps a command line at ~32k characters.
      const list = readdirSync(frames).filter((f) => f.endsWith(".png")).sort();
      await run(gifski, ["--fps", String(fps), "--quality", String(opts.gifQuality || 90), "--width", String(opts.gifWidth || 1200), "-o", resolve(opts.out), ...list],
        (s) => { const m = s.match(/(\d+)\s*\/\s*(\d+)/); if (m) progress("encode", +m[1], count); }, { cwd: frames });
    } else {
      await run(ffmpeg, ["-y", "-loglevel", "error", "-stats", "-framerate", String(fps), "-i", join(frames, "%05d.png"),
        "-c:v", "libx264", "-preset", opts.preset || "slow", "-crf", String(opts.crf ?? 16), "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", opts.out],
        (s) => { const m = s.match(/frame=\s*(\d+)/); if (m) progress("encode", +m[1], count); });
    }
    progress("done", count, count);
    return { out: opts.out, frames: count, seconds: total, width: Math.round(W * scale), height: Math.round(H * scale), fps };
  } finally {
    page.close();
    rmSync(work, { recursive: true, force: true });
  }
}
