---
name: demo-video
description: Make a polished product demo video (MP4 or GIF) of the project in the current folder. Claude storyboards a short demo, builds the screens as a scene (rebuilt in HTML, or captured from the running app), then opens Demo Kitchen, a local website where the user picks one of eight styles (Calm, Snappy, Cinematic, Minimal, Midnight, Pop, Tutorial, Showcase), switches on extras (captions, zoom on clicks, backdrop, browser/phone frame, title and end cards, letterbox), previews live and exports. Finer tuning (cursor size, easing, slow motion, transitions, motion blur and more) happens by asking Claude, who edits the recipe. Use whenever the user wants a demo video, product video, launch video, screen-recording-style GIF, README GIF, walkthrough video or teaser of something they built, or says "make a demo of this", "record a demo", "demo GIF for the README", or runs /demo-video. "/demo-video sample" opens a practice demo of a sample app.
---

# /demo-video

Turns the project in the current folder into a demo video the user directs from a simple local website.

**Who you're talking to.** Many people using this are designers or makers who use Claude Code in the desktop app and have never used a terminal. So:
- Talk in everyday words. Say "the screens", "the video", "your project folder", not "world.html", "the dev server" or "the recipe". Mention file names only when the user asks.
- Never ask the user to type a command. You run everything. Before something that triggers a permission prompt, say in one short line what it's for, so clicking **Allow** feels safe.
- When something fails, say what it means and what you're doing about it ("Chrome isn't installed, so I'm downloading a private copy, about a minute"), not the raw error.

```
project/demo/world.html       the screens, laid out on one big canvas       ← you write this
project/demo/storyboard.json  shots, cursor path, clicks, captions, timing   ← you write this
project/demo/recipe.json      chosen style, extras and fine settings          ← the website (and you) write this
project/demo/out/             exported MP4 / GIF files
```

The app lives in this plugin: `<this skill's base directory>/../../app`. Call that `APP` below.
Read `references/scene-contract.md` before writing any scene file. Read `references/storyboard-tips.md` before planning the storyboard.

## 0. Get the tools ready (every time, it's quick)

Tell the user in one line: "First I'll check your Mac has what Demo Kitchen needs. If anything's missing I'll download a private copy, which takes a couple of minutes the first time."

```bash
bash "APP/setup/setup.sh"
```

It installs only what's missing, into `~/.demo-kitchen/tools` (no Homebrew, no admin password), prints one ✓ line per tool and ends with `NODE=<path>`. Use that path wherever this skill says `NODE`. Relay the ✓ lines as a one-sentence summary. If it prints ✗, tell the user what it says in plain words. On Windows or Linux, explain that Demo Kitchen is Mac-only for now and stop.

## Practice run: `/demo-video sample`

If the user typed `/demo-video sample` (or asks to try it first, practice, or see how it works), skip steps 1 to 4. Run in the background:

```bash
"NODE" "APP/bin/demo-kitchen.mjs" practice
```

This copies a ready-made demo of a sample app called Pocket to `~/Demo Kitchen/practice` and opens Demo Kitchen in the browser. A short welcome there walks them through it. Tell them: "Demo Kitchen is open in your browser with a sample app. Pick a style, try a few extras, then hit Export. When you're ready for your own project, open its folder and type /demo-video." Then hand over as in step 6.

## 1. Understand the product (quietly, quickly)

Read the README, the main routes/screens and any existing screenshots or demo GIFs. Work out:
- the one thing the product does that a viewer should remember,
- the shortest flow that shows it (usually 2 to 4 screens, one or two clicks per screen),
- how it looks: colors, fonts, real copy. Never invent a different look.

## 2. Propose a storyboard and confirm it

Show the user a short beat list (3 to 5 beats, under 20 seconds total), in plain words, for example:

```
0–3 s   Sign-up screen. Cursor clicks the email field, types, clicks "Get started".   Caption: "Sign up in seconds."
3–7 s   Camera glides to the dashboard; cards build in. Cursor clicks the goal card.  Caption: "Your money, already sorted."
7–9 s   Pull back to show both screens. End card: "Try Pocket · pocket.app"
```

Ask once ("Does this story work, or would you like to change anything?"). Adjust if they want changes, then build. Building takes a few minutes, so say so.

## 3. Choose how the screens get into the scene

| Situation | Use |
|---|---|
| Runs in a browser (web app, site) and looks right as it is | **Capture**: start the dev server, drive it with Playwright, screenshot each state at 2× (`deviceScaleFactor: 2`), place the PNGs in `world.html` |
| Can't run in a browser (Figma plugin, native/mobile app, CLI, design-only), or the real app needs login, has messy data, or you need build-in animations | **Rebuild**: recreate the screens in HTML/CSS with the product's real colors, fonts and copy |

Mixing is fine (captured screens plus a rebuilt panel). Tell the user which one you picked and why, in one plain sentence ("Your plugin runs inside Figma, so I'll rebuild its screens as a clean scene instead of recording them.").

## 4. Write the scene

Create `demo/world.html` and `demo/storyboard.json` following `references/scene-contract.md`. The example at `APP/examples/desktop-version/demo/` (a Figma plugin demo, rebuilt in HTML) and `APP/examples/pocket/demo/` (a four-screen web app: typing, chip selection, a toggle, progress bars and a pull-back to all screens, using `window.scene.update`) are good references.

Don't write `demo/recipe.json` from scratch: the server creates it from `APP/presets/calm-product-demo.json` on first start. Afterwards, set the end card text in it (`dishes.outro.title`/`subtitle`) to the product name and link.

## 5. Open the menu

Run in the background from the project folder:

```bash
"NODE" "APP/bin/demo-kitchen.mjs" demo
```

It prints `Menu: http://127.0.0.1:<port>/` and opens it in the browser itself. If it was started with `--no-open`, open the printed URL with `open <url>`. Use the actual printed port.

Then render a quick check yourself so you catch broken targets before the user does:

```bash
"NODE" "APP/bin/demo-kitchen.mjs" export demo --format gif --fps 10 --width 800 --out demo/out/check.gif
```

Look at a few frames (`ffmpeg -i demo/out/check.gif -vf "fps=1,scale=480:-1,tile=4x3" -frames:v 1 demo/out/check.png`; ffmpeg may be at `~/.demo-kitchen/tools/bin/ffmpeg`). Check that the cursor lands on its targets, nothing is cut off, and captions don't cover the action. Watch the server log for `[demo-kitchen] No element matches "…"` warnings. Fix, then delete the check files.

## 6. Hand over

Tell the user, briefly and in plain words:
- Demo Kitchen is open in their browser (give the URL in case they closed it). A short welcome shows them around the first time, and the **?** button brings it back. The page has two steps: **pick a style** (Calm, Snappy, Cinematic, Minimal, Midnight, Pop, Tutorial, Showcase), then **switch on extras** (captions, zoom on clicks, backdrop, window frame, title card, end card, letterbox),
- **Export** in the top right makes the MP4 or GIF. It's saved in the `demo/out` folder of their project; offer to open that folder for them (`open demo/out`),
- anything finer is a chat request to you: "bigger cursor", "caption on beat 2 should say…", "slow down the reveal". The page deliberately has no sliders. You make those changes by editing `demo/recipe.json` (every dish and param is listed in `APP/engine/catalog.js`; the page picks changes up live) or the storyboard/world (the preview reloads).

Exports from the command line, when the user asks you to do it:

```bash
"NODE" "APP/bin/demo-kitchen.mjs" export demo --format mp4 --quality 1080p --fps 60
"NODE" "APP/bin/demo-kitchen.mjs" export demo --format gif --width 1200 --fps 20
```

The Demo Kitchen page keeps working only while its background process runs. If the user comes back later and the page won't load, start it again with the command in step 5.

To uninstall, remove the plugin (`claude plugin uninstall demo-kitchen@demo-kitchen-tools`) and delete `~/.demo-kitchen` and, if they want, `~/Demo Kitchen`.
