// The few things that differ by operating system: opening a URL in the browser and
// showing a file in Finder/Explorer. Everything else in Demo Kitchen is plain Node.
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";

export const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";

function launch(cmd, args) {
  try { spawn(cmd, args, { stdio: "ignore", detached: true, windowsVerbatimArguments: platform === "windows" }).on("error", () => {}).unref(); } catch {}
}

export function openUrl(url) {
  if (platform === "mac") launch("open", [url]);
  else if (platform === "windows") launch("cmd", ["/c", "start", '""', `"${url}"`]); // args passed verbatim, quoted by hand
  else launch("xdg-open", [url]);
}

// Show a file selected in its folder (or open the folder itself).
export function reveal(path) {
  const isFile = existsSync(path) && statSync(path).isFile();
  if (platform === "mac") launch("open", isFile ? ["-R", path] : [path]);
  else if (platform === "windows") launch("explorer", [isFile ? `/select,"${path}"` : `"${path}"`]);
  else launch("xdg-open", [isFile ? path.replace(/[\\/][^\\/]*$/, "") : path]);
}
