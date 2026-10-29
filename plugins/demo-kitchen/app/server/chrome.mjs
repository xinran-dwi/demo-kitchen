// Minimal Chrome DevTools driver: launch headless Chrome and talk to one page.
// Adapted from anatomy-skill-test/teaser/cdp.mjs. No npm packages: Node 22's built-in WebSocket.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const TESTING = (arch) => join(homedir(), ".demo-kitchen", "tools", "chrome", `chrome-mac-${arch}`, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
const WINDIRS = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
const CANDIDATES = [
  process.env.CHROME_PATH,
  // Windows: Chrome if installed, otherwise Edge, which ships with Windows 10/11 and is the same engine
  ...WINDIRS.map((d) => join(d, "Google", "Chrome", "Application", "chrome.exe")),
  ...WINDIRS.map((d) => join(d, "Microsoft", "Edge", "Application", "msedge.exe")),
  join(homedir(), ".demo-kitchen", "tools", "chrome", "chrome-win64", "chrome.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  TESTING("arm64"), // private copy from setup/setup.sh, only when no browser is installed
  TESTING("x64"),
].filter(Boolean);

export function findChrome() {
  const hit = CANDIDATES.find((p) => existsSync(p));
  if (!hit) throw new Error("Could not find Google Chrome. Ask Claude to run Demo Kitchen's setup, which downloads a private copy.");
  return hit;
}

export async function openPage(url, { width, height, scale = 1 }) {
  if (typeof WebSocket === "undefined") throw new Error("Demo Kitchen needs Node 22 or newer (for the built-in WebSocket).");
  const profile = mkdtempSync(join(tmpdir(), "demo-kitchen-chrome-"));
  const chrome = spawn(findChrome(), ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-color-profile=srgb", "--autoplay-policy=no-user-gesture-required", "about:blank"]);
  const port = await new Promise((done, fail) => {
    let text = "";
    chrome.stderr.on("data", (d) => { text += d; const m = text.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//); if (m) done(Number(m[1])); });
    chrome.on("exit", (code) => fail(new Error("Chrome exited early (" + code + ")")));
    setTimeout(() => fail(new Error("Chrome did not start")), 20000);
  });
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => socket.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener("message", (m) => {
    const data = JSON.parse(m.data);
    if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
    else if (data.method === "Runtime.exceptionThrown") errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
    else if (data.method === "Runtime.consoleAPICalled" && (data.params.type === "error" || data.params.type === "warning")) errors.push(data.params.args.map((a) => a.value ?? a.description).join(" "));
  });
  const send = (method, params = {}) => new Promise((r, f) => {
    const n = ++id;
    pending.set(n, (d) => (d.error ? f(new Error(method + ": " + d.error.message)) : r(d.result)));
    socket.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
  await send("Page.navigate", { url });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const close = () => { try { socket.close(); } catch {} chrome.kill("SIGKILL"); try { rmSync(profile, { recursive: true, force: true }); } catch {} };
  return { send, evaluate, close, errors };
}
