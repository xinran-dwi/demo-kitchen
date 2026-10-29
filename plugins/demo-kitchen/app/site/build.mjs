// Builds the public guide page: the landing page plus a static copy of Demo Kitchen running the
// Pocket sample, so visitors can try styles and extras with nothing installed.
//   node site/build.mjs [--out ../../../site] [--repo xinran-dwi/demo-kitchen]
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPresets } from "../server/server.mjs";
import { applyPreset, defaultRecipe } from "../engine/catalog.js";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, d) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : d; };
const OUT = resolve(flag("out", join(APP, "..", "..", "..", "site")));
const REPO = flag("repo", "xinran-dwi/demo-kitchen");

rmSync(OUT, { recursive: true, force: true });
for (const dir of ["menu", "player", "engine", "presets"]) cpSync(join(APP, dir), join(OUT, "app", dir), { recursive: true });
writeFileSync(join(OUT, "app", "presets", "index.json"), JSON.stringify(loadPresets()));
mkdirSync(join(OUT, "demo"), { recursive: true });
for (const f of ["world.html", "storyboard.json"]) cpSync(join(APP, "examples", "pocket", "demo", f), join(OUT, "demo", f));
const calm = loadPresets().find((p) => p.id === "calm-product-demo");
writeFileSync(join(OUT, "demo", "recipe.json"), JSON.stringify({ ...applyPreset(defaultRecipe(), calm), preset: calm.id }));

const html = readFileSync(join(APP, "site", "landing.html"), "utf8").replaceAll("{{REPO_URL}}", `https://github.com/${REPO}`).replaceAll("{{REPO}}", REPO);
writeFileSync(join(OUT, "index.html"), html);
cpSync(join(APP, "site", "landing.css"), join(OUT, "landing.css"));
writeFileSync(join(OUT, ".nojekyll"), "");
console.log(`Site built in ${OUT}`);
