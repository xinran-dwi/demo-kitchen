// The menu. Every dish is one effect; its params become sliders, pickers and text fields.
// `on` is the default for a fresh recipe; `preview` overrides params for the dish's preview clip.

export const ASPECTS = {
  '16:9': [1920, 1080],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '9:16': [1080, 1920],
};

const range = (key, label, min, max, step, value, extra = {}) => ({ key, label, type: 'range', min, max, step, value, ...extra });
const select = (key, label, options, value) => ({ key, label, type: 'select', options, value });
const color = (key, label, value) => ({ key, label, type: 'color', value });
const text = (key, label, value) => ({ key, label, type: 'text', value });
const toggle = (key, label, value) => ({ key, label, type: 'toggle', value });

export const COURSES = [
  {
    id: 'camera', name: 'Camera', note: 'How the view travels around your screens',
    dishes: [
      { id: 'camera', name: 'Smooth pan & zoom', desc: 'Glides between the shots in your storyboard, easing in and out of each move.', on: true,
        params: [range('easing', 'Softness', 0, 2, 0.05, 1, { hint: '0 is linear, 2 starts and stops very gently' }), range('zoom', 'Zoom', 0.6, 1.6, 0.01, 1, { unit: '×' })] },
      { id: 'autoZoom', name: 'Zoom on click', desc: 'Pushes in toward every click so viewers see exactly what changed.', on: false,
        params: [range('amount', 'Zoom amount', 1.1, 2.5, 0.05, 1.5, { unit: '×' }), range('ramp', 'Zoom speed', 0.2, 1.2, 0.05, 0.6, { unit: 's' }), range('hold', 'Stay zoomed', 0, 2.5, 0.05, 0.9, { unit: 's' })],
        preview: { amount: 1.7 } },
      { id: 'overview', name: 'Overview finale', desc: 'Pulls back at the end to show every screen at once.', on: false,
        params: [range('duration', 'Pull-back time', 0.6, 3, 0.1, 1.6, { unit: 's' }), range('pad', 'Breathing room', 0, 0.3, 0.01, 0.08), range('hold', 'Hold the overview', 0, 4, 0.1, 1.5, { unit: 's' })] },
    ],
  },
  {
    id: 'cursor', name: 'Cursor', note: 'The hand that drives the demo',
    dishes: [
      { id: 'cursor', name: 'Cursor', desc: 'A large, easy-to-follow pointer that travels along the planned path.', on: true,
        params: [select('style', 'Style', [['arrow', 'macOS arrow'], ['white', 'White arrow'], ['dot', 'Touch dot'], ['hand', 'Hand']], 'arrow'),
          range('size', 'Size', 20, 120, 1, 64, { unit: 'px' }), range('shadow', 'Shadow', 0, 1, 0.05, 0.6), range('smoothness', 'Smoothness', 0, 2, 0.05, 1)],
        preview: { size: 84 } },
      { id: 'naturalMotion', name: 'Natural motion', desc: 'Curved paths and a tiny overshoot, like a real hand on a trackpad.', on: false,
        params: [range('arc', 'Curve', 0, 0.5, 0.01, 0.16), range('overshoot', 'Overshoot', 0, 1, 0.05, 0.35)], preview: { arc: 0.3 } },
    ],
  },
  {
    id: 'clicks', name: 'Clicks & typing', note: 'Make every interaction land',
    dishes: [
      { id: 'ripple', name: 'Click ripple', desc: 'A ring expands from the pointer on every click.', on: true,
        params: [range('size', 'Size', 16, 140, 1, 46, { unit: 'px' }), range('thickness', 'Line', 1, 10, 0.5, 4, { unit: 'px' }), range('duration', 'Duration', 0.2, 1.5, 0.05, 0.5, { unit: 's' }), color('color', 'Color', '#0D99FF')],
        preview: { size: 70 } },
      { id: 'press', name: 'Press & highlight', desc: 'The cursor squeezes on click; optionally rings the thing being clicked.', on: true,
        params: [range('squash', 'Squeeze', 0, 0.35, 0.01, 0.14), toggle('ring', 'Highlight target', false), color('ringColor', 'Highlight color', '#0D99FF')],
        preview: { ring: true, squash: 0.25 } },
      { id: 'typing', name: 'Typing', desc: 'Text fields fill in letter by letter instead of appearing at once.', on: true,
        params: [range('cps', 'Speed', 4, 40, 1, 16, { unit: 'chars/s' }), toggle('caret', 'Blinking caret', true)] },
    ],
  },
  {
    id: 'text', name: 'Captions', note: 'Tell viewers what they are looking at',
    dishes: [
      { id: 'captions', name: 'Captions', desc: 'One short line per beat, timed by your storyboard.', on: true,
        params: [select('style', 'Style', [['headline', 'Headline'], ['pill', 'Pill'], ['lower', 'Lower third']], 'headline'),
          select('position', 'Position', [['top', 'Top'], ['bottom', 'Bottom']], 'top'),
          range('size', 'Size', 18, 80, 1, 38, { unit: 'px' }), color('color', 'Text color', 'auto'), range('fade', 'Fade', 0.1, 1, 0.05, 0.4, { unit: 's' })],
        preview: { style: 'pill', position: 'bottom', size: 44 } },
    ],
  },
  {
    id: 'canvas', name: 'Canvas & frame', note: 'What your product sits on',
    dishes: [
      { id: 'background', name: 'Backdrop', desc: 'Floats your product on a soft backdrop with rounded corners and a shadow.', on: false,
        params: [select('style', 'Style', [['mesh', 'Soft mesh'], ['gradient', 'Gradient'], ['solid', 'Solid'], ['dots', 'Dot grid']], 'mesh'),
          color('color1', 'Color 1', '#C9D8F0'), color('color2', 'Color 2', '#F2D6C9'),
          range('padding', 'Padding', 0, 0.2, 0.005, 0.07), range('radius', 'Corners', 0, 48, 1, 18, { unit: 'px' }), range('shadow', 'Shadow', 0, 1, 0.05, 0.5)] },
      { id: 'frame', name: 'Window frame', desc: 'Wraps the product in a browser window or a phone.', on: false,
        params: [select('style', 'Style', [['browser', 'Browser'], ['phone', 'Phone']], 'browser'), text('url', 'Address bar', 'yourproduct.com'), select('theme', 'Theme', [['light', 'Light'], ['dark', 'Dark']], 'light')] },
    ],
  },
  {
    id: 'cinema', name: 'Cinematic', note: 'Trailer energy',
    dishes: [
      { id: 'cinematic', name: 'Letterbox & vignette', desc: 'Black bars and darkened edges for a film look.', on: false,
        params: [range('bars', 'Bar height', 0, 0.16, 0.005, 0.09), range('vignette', 'Vignette', 0, 1, 0.05, 0.35), toggle('animate', 'Bars slide in', true)] },
      { id: 'transitions', name: 'Shot transitions', desc: 'Replaces camera glides with a cut, fade, slide or zoom-through.', on: false,
        params: [select('style', 'Style', [['fade', 'Fade'], ['slide', 'Slide'], ['zoom', 'Zoom-through'], ['cut', 'Hard cut']], 'fade'), range('duration', 'Duration', 0.15, 1.2, 0.05, 0.5, { unit: 's' })],
        preview: { style: 'slide' } },
      { id: 'slowmo', name: 'Slow motion', desc: 'Slows down one moment so viewers can savor it.', on: false,
        params: [range('from', 'Starts at', 0, 60, 0.1, 0, { unit: 's', scene: true }), range('to', 'Ends at', 0, 60, 0.1, 2, { unit: 's', scene: true }), range('speed', 'Speed', 0.15, 1, 0.05, 0.4, { unit: '×' })] },
      { id: 'motionBlur', name: 'Motion blur', desc: 'Blends in-between frames so fast moves look filmed. Export only.', on: false,
        params: [range('samples', 'Strength', 2, 8, 1, 4)] },
    ],
  },
  {
    id: 'bookends', name: 'Intro & outro', note: 'Open strong, close with a call to action',
    dishes: [
      { id: 'intro', name: 'Title card', desc: 'A clean title before the demo starts.', on: false,
        params: [text('title', 'Title', 'Your product'), text('subtitle', 'Subtitle', 'What it does, in one line'), range('duration', 'Duration', 1, 4, 0.1, 2, { unit: 's' }), select('theme', 'Theme', [['light', 'Light'], ['dark', 'Dark']], 'light')] },
      { id: 'outro', name: 'End card', desc: 'Your name, link or call to action at the end.', on: false,
        params: [text('title', 'Title', 'Try it today'), text('subtitle', 'Subtitle', 'yourproduct.com'),
          select('style', 'Style', [['top', 'Over the scene, top'], ['center', 'Center, dimmed scene'], ['solid', 'Solid card']], 'center'),
          range('hold', 'Hold', 0.5, 5, 0.1, 2.5, { unit: 's' }), range('lead', 'Start early', 0, 2, 0.1, 0, { unit: 's' })] },
      { id: 'fades', name: 'Fade in & out', desc: 'Fades up from a color at the start and back down at the end.', on: false,
        params: [color('color', 'Color', '#000000'), range('in', 'Fade in', 0, 1.5, 0.05, 0.5, { unit: 's' }), range('out', 'Fade out', 0, 1.5, 0.05, 0.6, { unit: 's' })] },
    ],
  },
];

export const DISHES = Object.fromEntries(COURSES.flatMap((c) => c.dishes.map((d) => [d.id, { ...d, course: c.id }])));

export function defaultRecipe() {
  const dishes = {};
  for (const d of Object.values(DISHES)) {
    dishes[d.id] = { on: d.on };
    for (const p of d.params) dishes[d.id][p.key] = p.value;
  }
  return { version: 1, aspect: '16:9', pace: 1, dishes };
}

// Fill any missing dish or param from the defaults, so old recipes keep working as the menu grows.
export function normalizeRecipe(r = {}) {
  const base = defaultRecipe();
  const out = { ...base, ...r, dishes: {} };
  for (const id of Object.keys(base.dishes)) out.dishes[id] = { ...base.dishes[id], ...(r.dishes?.[id] || {}) };
  if (!ASPECTS[out.aspect]) out.aspect = '16:9';
  return out;
}

// Apply a preset (a partial recipe) on top of a recipe.
export function applyPreset(recipe, preset) {
  const out = normalizeRecipe(JSON.parse(JSON.stringify(recipe)));
  if (preset.aspect) out.aspect = preset.aspect;
  if (preset.pace) out.pace = preset.pace;
  for (const id of Object.keys(out.dishes)) {
    const p = preset.dishes?.[id];
    if (preset.resetOthers && !p) out.dishes[id].on = false;
    if (p) out.dishes[id] = { ...out.dishes[id], ...p };
  }
  return out;
}
