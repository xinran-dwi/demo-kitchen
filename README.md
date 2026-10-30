Creator: Xinran Ma

More resources like this on: designwithai.co

# demo-kitchen

## What it is

Demo Kitchen turns any project you built with Claude Code into a polished demo video, with no screen recording or video editor involved. Claude reads your project, storyboards a short demo and builds the screens as a scene. Then a simple local website opens: pick one of eight styles (Calm, Snappy, Cinematic, Minimal, Midnight, Pop, Tutorial, Showcase), switch on a few extras like captions, zoom on clicks, a backdrop or an end card, watch the live preview and export an MP4 or GIF. Anything finer, you just ask Claude.

## When to use it

- You built something with Claude Code and want a short demo video for LinkedIn, X or YouTube
- You need a crisp, looping GIF for a README or a Substack post
- Your product can't be screen-recorded nicely (a Figma plugin, a mobile app, a tool behind a login) and you want the screens rebuilt cleanly
- You want to try different looks (calm, snappy, cinematic) on the same demo without redoing it
- You want a few quick, visual choices for the look, and to leave the fine-tuning to a chat with Claude

## How to use it

**Try it first, nothing to install:** [demo.designwithai.co](https://demo.designwithai.co) has a live playground and a step-by-step guide with pictures.

### Install (one time)

In the Claude desktop app, go to **Code** and paste this message:

```
Please install the Demo Kitchen plugin for me. It's in the plugin marketplace at github.com/xinran-dwi/demo-kitchen (marketplace "demo-kitchen-tools", plugin "demo-kitchen"). Install it for my user so it works in every project, then tell me when it's ready.
```

Click **Allow** when Claude asks to run commands, then start a new session.

Using Claude Code in the Terminal instead:

```bash
/plugin marketplace add xinran-dwi/demo-kitchen
/plugin install demo-kitchen@demo-kitchen-tools
```

### Step by step

1. **Practice (optional)** — Type `/demo-video sample`. Demo Kitchen opens in your browser with a ready-made sample app, and a short welcome shows you around.

2. **Open your project** — Start a session in the folder of the project you want to demo.

3. **Run /demo-video** — The first time, Claude checks your Mac has what Demo Kitchen needs and downloads private copies of anything missing (about 2 minutes, no passwords). Then it proposes a short storyboard of 3 to 5 moments, under 20 seconds. Say yes or ask for changes.

4. **Let Claude build the scene** — Claude either captures your running app or rebuilds the screens in HTML (for things like Figma plugins), and writes them to a `demo/` folder in your project.

5. **Pick a style** — Demo Kitchen opens in your browser. Hover a style to see it move, click one, and the preview updates. Choose a format (16:9, 1:1, 4:5, 9:16) and a speed (Relaxed, Normal, Quick) at the top.

6. **Add extras** — Switch on what you want: Captions, Zoom on clicks, Backdrop, Window frame, Title card, End card, Letterbox. Each has at most one simple choice, like Subtle or Strong, a color, or your text.

7. **Ask Claude for anything finer** — "make the cursor bigger", "change the second caption", "slow down on the dashboard". The preview updates by itself.

8. **Export** — Click **Export** and pick MP4 (1080p or 4K) or GIF (small, medium or large). The file lands in `demo/out/` in your project.

## Requirements

- A Mac
- [Claude Code](https://claude.ai/code), in the Claude desktop app or the Terminal
- Everything else (Node, ffmpeg, gifski, Chrome) is set up by Claude on first run if it's missing
