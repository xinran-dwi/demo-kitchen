# Scene contract

A scene is two files in `<project>/demo/`. The project supplies the **content**; Demo Kitchen supplies every **effect**. So never draw a cursor, ripple, caption, backdrop, frame or end card inside the scene. The engine does those, and the user controls them from the menu.

## Coordinates

- **Viewport**: the screen the camera looks through, `storyboard.viewport` (default `[1920, 1080]`). Cursor positions given as `[x, y]` are viewport pixels.
- **World**: the big canvas inside `#world`, where screens are laid out in their own pixel sizes, side by side with gaps (for example 80–120 px). The camera pans and zooms over it.

## `world.html`

A normal HTML page whose body is exactly the viewport size.

```html
<!doctype html>
<html><head>
<meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=block" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1920px; height: 1080px; overflow: hidden; background: #F3F3F1; }  /* body color shows around screens */
  #world { position: absolute; left: 0; top: 0; }           /* the engine sets its transform */
  .screen { position: absolute; overflow: hidden; border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,.08); }
</style>
</head><body>
  <div id="world">
    <div class="screen" id="signup" style="left:0;top:0;width:1440px;height:900px">…</div>
    <div class="screen" id="home"   style="left:1560px;top:0;width:1440px;height:900px">…</div>
  </div>
  <div id="hud">…optional screen-space UI that should NOT move with the camera (e.g. a plugin panel)…</div>
</body></html>
```

Rules:
- Give every screen and every click target a stable `id`. The storyboard points at them.
- Use `display=block` for web fonts so no frame renders with a fallback font.
- **Captured screens**: `<img class="screen" id="home" src="shots/home.png" style="left:1560px;top:0;width:1440px">`. Capture at 2× and display at 1× CSS size so zooms stay sharp. Store images in `demo/shots/`.
- One screen that changes state in place (before/after a click): stack two images at the same position and reveal the second with `data-in` (below). For in-place swaps, `data-fx="fade"` looks like a real UI update.
- Keep everything deterministic. No `setInterval`, CSS animations, `Date.now()` or `Math.random()` without a fixed seed. Anything that moves must be driven by time through the attributes or hooks below. Otherwise the preview and the export will disagree.

### Built-in time attributes (no JS needed)

| Attribute | Effect |
|---|---|
| `data-in="3.2"` | Hidden before 3.2 s, then animates in |
| `data-out="6"` | Animates out at 6 s |
| `data-fx="rise"` | `rise` (default, fades up 18 px), `fade`, `scale`, `left`, `right` |
| `data-dur="0.5"` | Animation length in seconds |
| `data-dx="-24"` `data-dy="18"` | Offsets for `rise` |
| `data-type="1.3"` | The element's text types out from 1.3 s (speed comes from the Typing dish). Put it on a `<span>` inside the input box, never on the box itself |

The engine sets `opacity`/`transform` on these elements, so don't give them their own transform. Wrap them instead.

Stagger build-ins by 0.06–0.12 s per item (`data-in="3.30"`, `"3.38"`, `"3.46"`…). It reads as "the product did this".

### Optional JS hooks (for anything the attributes can't do)

```js
window.scene = {
  ready: document.fonts.ready,                 // a promise; the engine waits for it
  layout(t, ctx) { /* move/resize world elements for time t. Runs before the camera, so `fit` shots see it */ },
  update(t, ctx) { /* everything else: button pressed states, progress text, HUD labels */ },
};
```

`ctx` = `{ t, u, cam, toScreen(x, y) → viewport point, clicks: [{t, el}], viewport: [w, h], recipe }`. `t` is scene seconds (before pace and slow motion); `cam` is `{cx, cy, s, ax, ay}`. Both hooks must be pure functions of `t`: no state carried between frames, because frames are rendered out of order when the user scrubs. See `APP/examples/desktop-version/demo/world.html` for a full example: a Figma canvas with a plugin panel HUD, selection boxes, labels that follow the camera, and a finale that slides frames into a grid.

## `storyboard.json`

```json
{
  "title": "Pocket",
  "world": "world.html",
  "viewport": [1920, 1080],
  "duration": 9,
  "tail": 0.8,
  "shots": [
    { "t": 0,    "fit": "#signup", "pad": 0.07 },
    { "t": 3.0,  "fit": "#signup", "pad": 0.07 },
    { "t": 3.8,  "fit": "#home",   "pad": 0.07 },
    { "t": 5.5,  "fit": "#goal",   "pad": 0.25 },
    { "t": 7.0,  "cx": 1500, "cy": 450, "s": 0.55 }
  ],
  "cursor": {
    "show": [0, 8.2],
    "path": [
      { "t": 0,    "to": [1560, 960] },
      { "t": 0.4,  "to": [1560, 960] },
      { "t": 1.1,  "to": { "el": "#email", "at": [0.3, 0.55] } },
      { "t": 2.3,  "to": { "el": "#email", "at": [0.3, 0.55] } },
      { "t": 2.7,  "to": { "el": "#join" } },
      { "t": 3.0,  "to": { "el": "#join" } },
      { "t": 3.6,  "to": [1600, 930] }
    ]
  },
  "clicks": [ { "t": 1.25, "el": "#email" }, { "t": 2.85, "el": "#join" } ],
  "captions": [
    { "from": 0.2, "to": 3.0, "text": "Sign up in seconds." },
    { "from": 3.4, "to": 6.8, "text": "Your money, already sorted." }
  ]
}
```

- **duration**: scene length in seconds. **tail**: hold at the end when the End card dish is off.
- **shots**: camera keyframes. The camera eases from each shot to the next, and two identical shots in a row make a hold. A shot is either
  - `{ "t", "fit": "#id" | "*", "pad": 0.08, "zoom": 1, "dx", "dy" }`: frame an element (or `*` for everything) with padding as a fraction of the viewport; or
  - `{ "t", "cx", "cy", "s" }`: world point at the center, at scale `s`.
  - Both accept `"ax", "ay"`: where in the viewport the center lands (default the middle). Use it to leave room for a HUD panel.
- **cursor.path**: waypoints. The cursor eases from each to the next, and a repeated waypoint is a hold. Targets: `[x, y]` (viewport px), `{ "el": "#id", "at": [fx, fy], "dx", "dy" }` (a point inside an element, tracked live as the camera moves), or `{ "world": [x, y] }`.
- **cursor.show**: `[from, to]` seconds it is visible (fades in and out).
- **clicks**: when the button goes down. These drive ripples, the press squeeze, the highlight ring (`el`) and zoom on click. Put each click while the cursor is holding on its target: arrive, wait about 0.15 s, click, hold about 0.3 s, move on.
- **captions**: `{ from, to, text }`, one short sentence each, in the user's voice, with no em dashes.

## `recipe.json` (written by the menu; you may edit it)

```json
{ "version": 1, "aspect": "16:9", "pace": 1, "preset": "calm-product-demo",
  "dishes": { "camera": { "on": true, "easing": 1, "zoom": 1 }, "outro": { "on": true, "title": "Try Pocket", "subtitle": "pocket.app" } } }
```

Missing dishes and params fall back to defaults. The full list of dishes, params and ranges is in `APP/engine/catalog.js`. Aspect ratios: `16:9`, `1:1`, `4:5`, `9:16`. For vertical formats, design a viewport that suits them (for example `[1080, 1350]`) rather than squeezing a 16:9 scene.
