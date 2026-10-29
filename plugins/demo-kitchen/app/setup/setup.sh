#!/bin/bash
# Demo Kitchen setup. Makes sure Node 22+, ffmpeg, gifski and a Chrome browser are available,
# downloading private copies into ~/.demo-kitchen/tools when they're missing. No Homebrew, no admin password.
# Safe to run again: anything already there is skipped. Last line printed is the node to launch Demo Kitchen with.
#
#   bash setup.sh            install what's missing
#   bash setup.sh --check    only report, download nothing

set -euo pipefail

TOOLS="$HOME/.demo-kitchen/tools"
BIN="$TOOLS/bin"
CHECK_ONLY=0; [ "${1:-}" = "--check" ] && CHECK_ONLY=1

NODE_VERSION="22.23.4"
NODE_SHA_arm64="c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428"
NODE_SHA_x64="efcc2b0db6f94bf53eddb038fe2b370277a042bd29e4f19b8f8e23598795b819"
FFMPEG_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1"
FFMPEG_SHA_arm64="8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa"
FFMPEG_SHA_x64="929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106"
GIFSKI_URL="https://github.com/ImageOptim/gifski/releases/download/1.34.0/gifski-1.34.0.tar.xz"
GIFSKI_SHA="b9b6591aa163123d737353d9c8581efdf3234d28eeaa45329b31da905cd5a996"
CHROME_JSON="https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"

if [ "$(uname -s)" != "Darwin" ]; then echo "✗ Demo Kitchen works on Mac only for now."; exit 1; fi
case "$(uname -m)" in arm64) ARCH=arm64 ;; *) ARCH=x64 ;; esac

ok()   { echo "✓ $1"; }
todo() { echo "• $1"; }
fail() { echo "✗ $1"; exit 1; }

# download URL FILE SHA256 (sha optional)
fetch() {
  curl -fL --retry 2 --silent --show-error -o "$2" "$1" || fail "Couldn't download $1. Check your internet connection and try again."
  if [ -n "${3:-}" ]; then
    local got; got=$(shasum -a 256 "$2" | cut -d' ' -f1)
    [ "$got" = "$3" ] || { rm -f "$2"; fail "The download of $(basename "$1") didn't match its checksum, so it wasn't used."; }
  fi
}

# DK_FRESH=1 ignores tools already on the Mac (for testing the downloads).
find_bin() { # first match among private copy, Homebrew, system, PATH
  [ -n "${DK_FRESH:-}" ] && { [ -x "$BIN/$1" ] && echo "$BIN/$1"; return 0; }
  for d in "$BIN" /opt/homebrew/bin /usr/local/bin /usr/bin; do [ -x "$d/$1" ] && { echo "$d/$1"; return; }; done
  command -v "$1" 2>/dev/null || true
}

mkdir -p "$BIN"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT

# ---- Node 22+ ----
NODE=""
for n in "$TOOLS/node/bin/node" "$(find_bin node)"; do
  [ -n "$n" ] && [ -x "$n" ] || continue
  major=$("$n" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if [ "$major" -ge 22 ]; then NODE="$n"; break; fi
done
if [ -n "$NODE" ]; then ok "Node is ready"
elif [ $CHECK_ONLY = 1 ]; then todo "Node 22 needs to be downloaded (about 50 MB)"
else
  todo "Downloading Node (about 50 MB)…"
  name="node-v$NODE_VERSION-darwin-$ARCH"; sha_var="NODE_SHA_$ARCH"
  fetch "https://nodejs.org/dist/v$NODE_VERSION/$name.tar.gz" "$WORK/node.tgz" "${!sha_var}"
  rm -rf "$TOOLS/node"; mkdir -p "$TOOLS/node"
  tar -xzf "$WORK/node.tgz" -C "$TOOLS/node" --strip-components 1
  NODE="$TOOLS/node/bin/node"; ok "Node is ready"
fi

# ---- ffmpeg (video encoder) ----
if [ -n "$(find_bin ffmpeg)" ]; then ok "Video encoder (ffmpeg) is ready"
elif [ $CHECK_ONLY = 1 ]; then todo "Video encoder (ffmpeg) needs to be downloaded (about 25 MB)"
else
  todo "Downloading the video encoder (about 25 MB)…"
  sha_var="FFMPEG_SHA_$ARCH"
  fetch "$FFMPEG_URL/ffmpeg-darwin-$ARCH.gz" "$WORK/ffmpeg.gz" "${!sha_var}"
  gunzip -c "$WORK/ffmpeg.gz" > "$BIN/ffmpeg"; chmod +x "$BIN/ffmpeg"
  xattr -d com.apple.quarantine "$BIN/ffmpeg" 2>/dev/null || true
  "$BIN/ffmpeg" -version >/dev/null 2>&1 || fail "The video encoder downloaded but won't run on this Mac."
  ok "Video encoder (ffmpeg) is ready"
fi

# ---- gifski (GIF encoder; optional, ffmpeg makes GIFs too) ----
if [ -n "$(find_bin gifski)" ]; then ok "GIF encoder (gifski) is ready"
elif [ $CHECK_ONLY = 1 ]; then todo "GIF encoder (gifski) needs to be downloaded (about 15 MB)"
else
  todo "Downloading the GIF encoder (about 15 MB)…"
  if curl -fL --retry 2 --silent -o "$WORK/gifski.tar.xz" "$GIFSKI_URL" \
     && [ "$(shasum -a 256 "$WORK/gifski.tar.xz" | cut -d' ' -f1)" = "$GIFSKI_SHA" ] \
     && tar -xJf "$WORK/gifski.tar.xz" -C "$WORK" mac/gifski; then
    mv "$WORK/mac/gifski" "$BIN/gifski"; chmod +x "$BIN/gifski"; "$BIN/gifski" --version >/dev/null 2>&1 || true
    xattr -d com.apple.quarantine "$BIN/gifski" 2>/dev/null || true
    ok "GIF encoder (gifski) is ready"
  else
    ok "GIF encoder skipped. GIFs will be made with ffmpeg instead (slightly bigger files)"
  fi
fi

# ---- Chrome (renders the frames, runs hidden) ----
CHROME=""
for c in "${CHROME_PATH:-}" \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "$TOOLS/chrome/chrome-mac-$ARCH/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"; do
  [ -n "${DK_FRESH:-}" ] && [[ "$c" != "$TOOLS"* ]] && continue
  [ -n "$c" ] && [ -x "$c" ] && { CHROME="$c"; break; }
done
if [ -n "$CHROME" ]; then ok "Browser for rendering is ready"
elif [ $CHECK_ONLY = 1 ]; then todo "A private Chrome needs to be downloaded (about 150 MB)"
else
  todo "No Chrome found. Downloading a private copy just for Demo Kitchen (about 150 MB)…"
  url=$(curl -fsSL "$CHROME_JSON" | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s).channels.Stable.downloads.chrome.find(x=>x.platform===process.argv[1]);console.log(d?d.url:"")})' "mac-$ARCH")
  [ -n "$url" ] || fail "Couldn't find a Chrome download. Installing Google Chrome from google.com/chrome also works."
  fetch "$url" "$WORK/chrome.zip"
  rm -rf "$TOOLS/chrome"; mkdir -p "$TOOLS/chrome"
  ditto -x -k "$WORK/chrome.zip" "$TOOLS/chrome"
  xattr -dr com.apple.quarantine "$TOOLS/chrome" 2>/dev/null || true
  ok "Browser for rendering is ready"
fi

echo "NODE=$NODE"
