#!/usr/bin/env node
// demo-kitchen [demo-dir] [--port 4180] [--no-open]          open the menu for a project's demo/ folder
// demo-kitchen export [demo-dir] [--format mp4|gif] [--fps N] [--quality 1080p|4k] [--width 1200] [--out file]
// demo-kitchen practice [--no-open]                           copy the sample app to ~/Demo Kitchen/practice and open it
import { resolve, join, basename, dirname } from "node:path";
import { existsSync, readFileSync, mkdirSync, cpSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { startServer } from "../server/server.mjs";
import { record } from "../server/record.mjs";
import { openUrl } from "../server/os.mjs";

const args = process.argv.slice(2);
const flag = (name, d) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : d; };
const has = (name) => args.includes("--" + name);
const VALUED = new Set(["--port", "--format", "--fps", "--quality", "--width", "--out", "--gif-quality"]);
const positional = args.filter((a, i) => !a.startsWith("--") && !VALUED.has(args[i - 1]));
const isExport = positional[0] === "export";
let demoDir = resolve(positional[isExport ? 1 : 0] || (existsSync("demo/storyboard.json") ? "demo" : "."));

if (positional[0] === "practice") {
  // A ready-made demo to play with. Lives outside the plugin so updates never overwrite someone's tries.
  demoDir = join(homedir(), "Demo Kitchen", "practice", "demo");
  if (!existsSync(join(demoDir, "storyboard.json"))) {
    const sample = join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "pocket", "demo");
    mkdirSync(demoDir, { recursive: true });
    for (const f of ["world.html", "storyboard.json"]) cpSync(join(sample, f), join(demoDir, f));
  }
}

if (!existsSync(join(demoDir, "storyboard.json"))) {
  console.error(`No storyboard.json found in ${demoDir}.\nRun /demo-video in your project (it writes demo/world.html and demo/storyboard.json), then point demo-kitchen at that demo/ folder.`);
  process.exit(1);
}

if (isExport) {
  const srv = await startServer({ demoDir, port: 4300 + Math.floor(Math.random() * 500) });
  const format = flag("format", "mp4");
  const out = resolve(flag("out", join(demoDir, "out", `${basename(dirname(demoDir))}.${format}`)));
  mkdirSync(dirname(out), { recursive: true });
  const recipe = JSON.parse(readFileSync(join(demoDir, "recipe.json"), "utf8"));
  let last = "";
  const t0 = Date.now();
  const r = await record({ baseUrl: srv.url.replace(/\/$/, ""), demo: "/demo/", recipe, format, out, fps: +flag("fps", 0) || undefined, quality: flag("quality", "1080p"),
    gifWidth: +flag("width", 0) || undefined, gifQuality: +flag("gif-quality", 0) || undefined,
    onProgress: (phase, done, total) => { const line = `${phase} ${Math.round((100 * done) / Math.max(1, total))}%`; if (line !== last && (done % 30 === 0 || done === total)) { last = line; process.stdout.write(line + "\n"); } } });
  console.log(`\n✓ ${r.out}\n  ${r.width}×${r.height}, ${r.fps} fps, ${r.seconds.toFixed(1)} s, ${r.frames} frames, took ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  srv.close();
  process.exit(0);
}

const srv = await startServer({ demoDir, port: +flag("port", 4180) });
console.log(`\n  Demo Kitchen is open for ${basename(dirname(demoDir))}\n\n  Menu:  ${srv.url}\n  Demo:  ${demoDir}\n\n  Ctrl+C to close.\n`);
if (!has("no-open")) openUrl(srv.url);
