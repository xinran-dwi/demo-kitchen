// Renders the menu's preview clips with the sample scene and the same recorder as a real export:
// one per style (menu/previews/style-<preset>.mp4) and one per extra (menu/previews/<dish>.mp4).
// Run after changing an effect or a preset: npm run previews [name ...]
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { startServer } from "../server/server.mjs";
import { record, findTool } from "../server/record.mjs";
import { DISHES, defaultRecipe, applyPreset } from "../engine/catalog.js";
import { loadPresets } from "../server/server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "menu", "previews");
const only = process.argv.slice(2);
// The extras offered in the menu (menu/menu.js EXTRAS).
const EXTRAS = ["captions", "autoZoom", "background", "frame", "intro", "outro", "cinematic"];
const TEXT = { intro: { title: "Pocket", subtitle: "Money that plans itself" }, outro: { title: "Try Pocket", subtitle: "pocket.app" }, frame: { url: "pocket.app" } };

// The plain plate every dish is shown on: camera + cursor + clicks, nothing else.
const BASE = ["camera", "cursor", "ripple", "press", "typing"];
// Extra settings so the dish reads clearly in a 128 px thumbnail.
const SHOWCASE = {
  overview: { duration: 1.2, hold: 1 },
  slowmo: { from: 0.9, to: 2.8, speed: 0.35 },
  motionBlur: { samples: 6 },
  transitions: { style: "slide" },
  intro: { ...TEXT.intro, duration: 1.8 },
  outro: { ...TEXT.outro, hold: 1.8, style: "center" },
  frame: TEXT.frame,
  background: { padding: 0.08 },
  cinematic: { bars: 0.1, vignette: 0.5 },
  fades: { in: 0.6, out: 0.6 },
};

// The still shown before hover: a moment where the effect is clearly visible.
const POSTER = { "style-cinematic-trailer": 4.6, "style-snappy-launch": 3.2, "style-midnight": 4.6, "style-pop": 1.4, "style-tutorial": 4.2, "style-showcase": 9.6, intro: 0.9, outro: 7.4, autoZoom: 1.2, cinematic: 2.6 };
const poster = (name) => execFileSync(findTool("ffmpeg"), ["-y", "-loglevel", "error", "-ss", String(POSTER[name] ?? (name.startsWith("style-") ? 3 : 1.6)), "-i", join(OUT, name + ".mp4"), "-frames:v", "1", "-q:v", "3", join(OUT, name + ".jpg")]);

const srv = await startServer({ demoDir: join(HERE, "sample"), port: 4700 });
const base = srv.url.replace(/\/$/, "");
for (const p of loadPresets()) {
  const name = "style-" + p.id;
  if (only.length && !only.includes(name)) continue;
  const r = applyPreset(defaultRecipe(), p);
  for (const [id, t] of Object.entries(TEXT)) Object.assign(r.dishes[id], t);
  const t0 = Date.now();
  const res = await record({ baseUrl: base, demo: "/demo/", recipe: r, format: "mp4", out: join(OUT, name + ".mp4"), fps: 24, scale: 0.25, crf: 24 });
  poster(name);
  console.log(`${name.padEnd(30)} ${res.seconds.toFixed(1)} s  ${((Date.now() - t0) / 1000).toFixed(0)} s to render`);
}
if (process.argv.includes("--posters")) { for (const n of [...loadPresets().map((p) => "style-" + p.id), ...EXTRAS]) poster(n); process.exit(0); }
for (const d of Object.values(DISHES)) {
  if (!EXTRAS.includes(d.id) || (only.length && !only.includes(d.id))) continue;
  const r = defaultRecipe();
  for (const id of Object.keys(r.dishes)) r.dishes[id].on = BASE.includes(id);
  r.dishes.typing.on = d.id === "typing" ? true : r.dishes.typing.on;
  Object.assign(r.dishes[d.id], d.preview || {}, SHOWCASE[d.id] || {}, { on: true });
  if (d.id === "typing") r.dishes.typing.cps = 12;
  const out = join(OUT, d.id + ".mp4");
  const t0 = Date.now();
  const res = await record({ baseUrl: base, demo: "/demo/", recipe: r, format: "mp4", out, fps: 24, scale: 0.25, crf: 24 });
  poster(d.id);
  console.log(`${d.id.padEnd(30)} ${res.seconds.toFixed(1)} s  ${((Date.now() - t0) / 1000).toFixed(0)} s to render`);
}
srv.close();
process.exit(0);
