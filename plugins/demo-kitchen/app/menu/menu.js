// The menu: pick one style, add a few extras, export. Every finer setting still exists in
// recipe.json (see engine/catalog.js) and is meant to be changed by asking Claude, not with sliders.
import { ASPECTS, normalizeRecipe, applyPreset, defaultRecipe } from '../engine/catalog.js';
import { initWelcome } from './welcome.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
const CHECK = '<svg viewBox="0 0 24 24" width="12" height="12"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const STYLE_ORDER = ['calm-product-demo', 'snappy-launch', 'cinematic-trailer', 'minimal', 'midnight', 'pop', 'tutorial', 'showcase'];
const SPEEDS = [['Relaxed', 0.85], ['Normal', 1], ['Quick', 1.2]];
const BACKDROPS = [
  ['Lavender', { style: 'mesh', color1: '#C9D3F5', color2: '#F6D5E3' }],
  ['Peach', { style: 'mesh', color1: '#F9D9C4', color2: '#F4C6D0' }],
  ['Mint', { style: 'mesh', color1: '#CDEBDF', color2: '#D6E6F7' }],
  ['Gray', { style: 'solid', color1: '#E9E9EC', color2: '#E9E9EC' }],
  ['Night', { style: 'gradient', color1: '#2B2D33', color2: '#121316' }],
];

// Each extra is one effect with at most one simple choice.
const EXTRAS = [
  { id: 'captions', name: 'Captions', desc: 'A short line for each step',
    // Each look only swaps the style; position and size stay put so the caption never jumps.
    seg: [['Clean', { style: 'headline', color: 'auto' }], ['Pill', { style: 'pill', color: 'auto' }], ['Card', { style: 'lower', color: 'auto' }]],
    current: (d) => ({ pill: 'Pill', lower: 'Card' })[d.style] || 'Clean' },
  { id: 'autoZoom', name: 'Zoom on clicks', desc: 'Pushes in so every click is easy to see',
    seg: [['Subtle', { amount: 1.3 }], ['Strong', { amount: 1.7 }]], current: (d) => (d.amount >= 1.5 ? 'Strong' : 'Subtle') },
  { id: 'background', name: 'Backdrop', desc: 'Floats your product on a soft color', swatches: BACKDROPS },
  { id: 'frame', name: 'Window frame', desc: 'A browser window or a phone around it',
    seg: [['Browser', { style: 'browser' }], ['Phone', { style: 'phone' }]], current: (d) => (d.style === 'phone' ? 'Phone' : 'Browser'),
    text: [['url', 'Address, e.g. yourproduct.com', (d) => d.style === 'browser']] },
  { id: 'intro', name: 'Title card', desc: 'Your product name before the demo', text: [['title', 'Title'], ['subtitle', 'One line about it']] },
  { id: 'outro', name: 'End card', desc: 'Name and link at the end', text: [['title', 'Title'], ['subtitle', 'Link or call to action']] },
  { id: 'cinematic', name: 'Letterbox', desc: 'Black bars for a film look' },
];

let recipe, info, player, styles = [];
// Static mode: the public playground on the guide page. No local server, so no saving to disk and no export.
let STATIC = new URLSearchParams(location.search).has('static');

let saveTimer;
function changed() {
  player?.setRecipe(recipe);
  renderStyles();
  renderExtras();
  renderTop();
  renderMarks();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => STATIC
    ? localStorage.setItem('dk-playground-recipe', JSON.stringify(recipe))
    : fetch('/api/recipe', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipe) }), 250);
}

// ---------- top bar ----------
function buildTop() {
  $('project').textContent = info.title;
  $('aspect').innerHTML = Object.keys(ASPECTS).map((a) => `<button type="button" data-v="${a}">${a}</button>`).join('');
  $('aspect').onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { recipe.aspect = v; changed(); fit(); } };
  $('speed').innerHTML = SPEEDS.map(([n, v]) => `<button type="button" data-v="${v}" title="Playback speed">${n}</button>`).join('');
  $('speed').onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { recipe.pace = +v; changed(); } };
}
function renderTop() {
  for (const b of $('aspect').children) b.classList.toggle('on', b.dataset.v === recipe.aspect);
  const near = SPEEDS.reduce((a, b) => (Math.abs(b[1] - recipe.pace) < Math.abs(a[1] - recipe.pace) ? b : a));
  for (const b of $('speed').children) b.classList.toggle('on', +b.dataset.v === near[1]);
}

// ---------- 1. style ----------
function buildStyles() {
  $('styles').innerHTML = styles.map((s) => `
    <button type="button" class="style" data-id="${s.id}">
      <div class="thumb"><video src="previews/style-${s.id}.mp4" muted loop playsinline preload="none"></video><img src="previews/style-${s.id}.jpg" alt=""></div>
      <i class="check">${CHECK}</i>
      <b>${esc(s.name)}</b><span>${esc(s.description)}</span>
    </button>`).join('');
  for (const el of $('styles').children) {
    const v = el.querySelector('video');
    el.addEventListener('mouseenter', () => v.play().catch(() => {}));
    el.addEventListener('mouseleave', () => { v.pause(); v.currentTime = 0; });
    el.addEventListener('click', () => pickStyle(el.dataset.id));
  }
}
function pickStyle(id) {
  const s = styles.find((x) => x.id === id);
  if (!s) return;
  const keep = { intro: recipe.dishes.intro.on, outro: recipe.dishes.outro.on };
  recipe = applyPreset(recipe, s);
  recipe.preset = id;
  // Title and end cards are your content, not part of the look: switching styles never removes them.
  for (const k of Object.keys(keep)) recipe.dishes[k].on = recipe.dishes[k].on || keep[k];
  fillPlaceholders();
  changed();
}
// Never show catalog placeholder text in a video: use the project's name, or leave it blank.
function fillPlaceholders() {
  const d = recipe.dishes;
  if (d.intro.title === 'Your product') d.intro.title = info.title;
  if (d.intro.subtitle === 'What it does, in one line') d.intro.subtitle = '';
  if (d.outro.title === 'Try it today') d.outro.title = info.title;
  if (d.outro.subtitle === 'yourproduct.com') d.outro.subtitle = '';
  if (d.frame.url === 'yourproduct.com') d.frame.url = /\w\.\w/.test(d.outro.subtitle) ? d.outro.subtitle : '';
}
function renderStyles() {
  for (const el of $('styles').children) el.classList.toggle('on', el.dataset.id === recipe.preset);
}

// ---------- 2. extras ----------
function buildExtras() {
  $('extras').innerHTML = EXTRAS.map((x) => `
    <div class="extra" data-id="${x.id}">
      <div class="extra-row">
        <div class="thumb"><video src="previews/${x.id}.mp4" muted loop playsinline preload="none"></video><img src="previews/${x.id}.jpg" alt=""></div>
        <div><b>${esc(x.name)}</b><span class="desc">${esc(x.desc)}</span></div>
        <button type="button" class="switch" role="switch" aria-label="${esc(x.name)}"></button>
      </div>
      <div class="opt"></div>
    </div>`).join('');
  for (const el of $('extras').children) {
    const x = EXTRAS.find((e) => e.id === el.dataset.id), v = el.querySelector('video');
    el.addEventListener('mouseenter', () => v.play().catch(() => {}));
    el.addEventListener('mouseleave', () => { v.pause(); v.currentTime = 0; });
    el.querySelector('.extra-row').addEventListener('click', () => toggleExtra(x));
  }
  renderExtras();
}
function toggleExtra(x) {
  const d = recipe.dishes[x.id];
  d.on = !d.on;
  if (d.on) fillPlaceholders();
  changed();
}
function renderExtras() {
  for (const el of $('extras').children) {
    const x = EXTRAS.find((e) => e.id === el.dataset.id), d = recipe.dishes[x.id];
    el.classList.toggle('on', d.on);
    el.querySelector('.switch').setAttribute('aria-checked', d.on);
    const opt = el.querySelector('.opt');
    if (document.activeElement && opt.contains(document.activeElement)) continue; // don't clobber typing
    let html = '';
    if (x.seg) html += `<div class="seg small">${x.seg.map(([n]) => `<button type="button" data-seg="${n}" class="${x.current(d) === n ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    if (x.swatches) html += x.swatches.map(([n, v]) => `<button type="button" class="swatch${d.color1 === v.color1 ? ' on' : ''}" data-sw="${n}" title="${n}" style="background:${v.style === 'solid' ? v.color1 : `linear-gradient(135deg, ${v.color1}, ${v.color2})`}"></button>`).join('');
    if (x.text) html += x.text.filter(([, , when]) => !when || when(d)).map(([k, ph]) => `<input type="text" data-text="${k}" placeholder="${esc(ph)}" value="${esc(d[k])}">`).join('');
    opt.innerHTML = html;
    opt.onclick = (e) => {
      const sg = e.target.closest('[data-seg]'), sw = e.target.closest('[data-sw]');
      if (sg) { Object.assign(d, x.seg.find(([n]) => n === sg.dataset.seg)[1]); changed(); }
      if (sw) { Object.assign(d, x.swatches.find(([n]) => n === sw.dataset.sw)[1]); changed(); }
    };
    opt.oninput = (e) => { const k = e.target.dataset.text; if (k) { d[k] = e.target.value; changed(); } };
  }
}

// ---------- preview ----------
function loadPlayer() {
  const frame = $('player');
  frame.src = '../player/index.html?demo=../../demo/';
  frame.onload = async () => {
    try {
      await frame.contentWindow.playerReady;
      player = frame.contentWindow.player;
      player.setRecipe(recipe);
      player.onTime = onTime;
      $('loading').hidden = true;
      fit();
      renderMarks();
      player.play();
      setPlaying(true);
    } catch (e) {
      $('loading').hidden = false;
      $('loading').classList.add('err');
      $('loading').textContent = 'The demo could not load:\n' + e.message + '\n\nCheck demo/world.html and demo/storyboard.json.';
    }
  };
}
function fit() {
  if (!player) return;
  const pass = $('pass'), cs = getComputedStyle(pass);
  const aw = pass.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = pass.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const [W, H] = ASPECTS[recipe.aspect];
  const k = Math.min(aw / W, ah / H);
  Object.assign($('stageWrap').style, { width: W * k + 'px', height: H * k + 'px' });
  Object.assign($('player').style, { width: W + 'px', height: H + 'px', transform: `scale(${k})` });
}
new ResizeObserver(fit).observe($('pass'));

function onTime(u) {
  const T = player.total, pct = (100 * u) / T;
  $('tNow').textContent = fmtTime(u);
  $('tTotal').textContent = fmtTime(T);
  $('fill').style.width = pct + '%';
  $('head').style.left = pct + '%';
  if (!player.playing && document.querySelector('.transport').classList.contains('playing')) setPlaying(false);
}
function renderMarks() {
  if (!player) return;
  const T = player.total;
  $('marks').innerHTML = player.markers().filter((m) => m.kind === 'click').map((m) => `<i class="mk click" style="left:${((100 * m.u) / T).toFixed(3)}%"></i>`).join('');
  onTime(player.u);
}
function setPlaying(on) { document.querySelector('.transport').classList.toggle('playing', on); $('play').setAttribute('aria-label', on ? 'Pause' : 'Play'); }
function togglePlay() { if (!player) return; if (player.playing) { player.pause(); setPlaying(false); } else { player.play(); setPlaying(true); } }
$('play').onclick = togglePlay;

const scrub = $('scrub');
const seekFromEvent = (e) => { const r = scrub.getBoundingClientRect(); player?.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * player.total); };
scrub.addEventListener('pointerdown', (e) => {
  if (!player) return;
  const was = player.playing;
  player.pause();
  scrub.setPointerCapture(e.pointerId);
  seekFromEvent(e);
  const move = (ev) => seekFromEvent(ev);
  scrub.addEventListener('pointermove', move);
  scrub.addEventListener('pointerup', () => { scrub.removeEventListener('pointermove', move); if (was) player.play(); setPlaying(player.playing); }, { once: true });
});
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, dialog') || !player) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.code === 'ArrowLeft') player.seek(Math.max(0, player.u - 1));
  if (e.code === 'ArrowRight') player.seek(Math.min(player.total, player.u + 1));
});

// ---------- export ----------
const dlg = $('exportDlg');
let fmt = 'mp4', lastOut = null;
const segValue = (id) => $(id).querySelector('.on').dataset.v;
for (const id of ['mp4Quality', 'gifSize']) $(id).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; for (const x of $(id).children) x.classList.toggle('on', x === b); updateHint(); };
$('exportBtn').onclick = () => { if (STATIC) return showInstall(); showPane('exportSetup'); updateHint(); dlg.showModal(); };
// In the playground, "Export" leads to the install steps on the guide page around it.
function showInstall() {
  if (window.parent !== window) window.parent.postMessage({ type: 'demo-kitchen:install' }, '*');
  else location.href = '../../#install';
}
$('fmt').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  fmt = b.dataset.v;
  for (const x of $('fmt').children) x.classList.toggle('on', x === b);
  for (const r of document.querySelectorAll('.row[data-for]')) r.hidden = r.dataset.for !== fmt;
  updateHint();
};
function updateHint() {
  if (!player) return;
  const [W, H] = ASPECTS[recipe.aspect], k = segValue('mp4Quality') === '4k' ? 2 : 1;
  const size = fmt === 'gif' ? `${segValue('gifSize')} px wide, 20 fps` : `${W * k}×${H * k}, 60 fps`;
  $('exportHint').textContent = `${player.total.toFixed(1)} seconds · ${size} · saved to demo/out/`;
}
function showPane(id) { for (const p of ['exportSetup', 'exportRun', 'exportDone']) $(p).hidden = p !== id; }
$('startExport').onclick = async () => {
  showPane('exportRun');
  $('phase').textContent = 'Starting…';
  $('barFill').style.width = '0%';
  $('phaseDetail').textContent = '';
  const body = fmt === 'gif' ? { format: 'gif', fps: 20, gifWidth: +segValue('gifSize'), gifQuality: 90, recipe } : { format: 'mp4', fps: 60, quality: segValue('mp4Quality'), recipe };
  const r = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { $('phase').textContent = 'Another export is running'; $('phaseDetail').textContent = j.error; return; }
  lastOut = j.out;
};
$('cancelExport').onclick = () => fetch('/api/export/cancel', { method: 'POST' });
$('again').onclick = () => showPane('exportSetup');
$('reveal').onclick = () => fetch('/api/reveal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: lastOut }) });

function onExport(ev) {
  if (ev.phase === 'start') { showPane('exportRun'); return; }
  if (ev.phase === 'error') { $('phase').textContent = ev.message === 'Export cancelled' ? 'Cancelled' : 'Export failed'; $('phaseDetail').textContent = ev.message === 'Export cancelled' ? '' : ev.message; return; }
  if (ev.phase === 'finished') {
    showPane('exportDone');
    const url = ev.url + '?v=' + Date.now();
    $('result').innerHTML = ev.out.endsWith('.gif') ? `<img src="${url}" alt="Exported GIF">` : `<video src="${url}" controls autoplay muted loop playsinline></video>`;
    $('resultInfo').textContent = `${ev.width}×${ev.height} · ${ev.seconds.toFixed(1)} s · ${(ev.size / 1e6).toFixed(1)} MB`;
    $('download').href = ev.url;
    $('download').setAttribute('download', ev.out.split(/[\\/]/).pop());
    lastOut = ev.out;
    return;
  }
  if (ev.phase === 'done') return;
  const label = { capture: 'Rendering frames', blend: 'Adding motion blur', encode: ev.format === 'gif' ? 'Making the GIF' : 'Encoding the video' }[ev.phase] || ev.phase;
  $('phase').textContent = label + '…';
  const w = { capture: [0, 0.82], blend: [0.82, 0.9], encode: [0.9, 1] }[ev.phase] || [0, 1];
  $('barFill').style.width = (100 * (w[0] + (w[1] - w[0]) * (ev.done / Math.max(1, ev.total)))).toFixed(1) + '%';
  $('phaseDetail').textContent = ev.phase === 'capture' ? `${ev.done} of ${ev.total}` : '';
}

// ---------- live updates from disk (e.g. when Claude edits the recipe or scene) ----------
function listen() {
  const es = new EventSource('/api/events');
  es.addEventListener('recipe', (e) => { recipe = normalizeRecipe(JSON.parse(e.data)); player?.setRecipe(recipe); renderStyles(); renderExtras(); renderTop(); renderMarks(); fit(); });
  es.addEventListener('scene', async () => {
    if (!player) return loadPlayer();
    const was = player.playing;
    player.pause();
    try { await player.load(); player.setRecipe(recipe); renderMarks(); if (was) player.play(); } catch (e) { console.error(e); loadPlayer(); }
  });
  es.addEventListener('export', (e) => onExport(JSON.parse(e.data)));
}

// ---------- start ----------
async function loadServer() {
  const r = await fetch('/api/info');
  if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('no server');
  info = await r.json();
  recipe = normalizeRecipe(await (await fetch('/api/recipe')).json());
}
async function loadStatic() {
  STATIC = true;
  const presets = await (await fetch('../presets/index.json')).json();
  info = { title: 'Pocket (sample)', presets };
  const saved = localStorage.getItem('dk-playground-recipe');
  recipe = saved ? normalizeRecipe(JSON.parse(saved)) : Object.assign(applyPreset(defaultRecipe(), presets.find((p) => p.id === 'calm-product-demo')), { preset: 'calm-product-demo' });
  if (!saved) Object.assign(recipe.dishes.outro, { on: true, title: 'Try Pocket', subtitle: 'pocket.app' });
  document.querySelector('.ask').textContent = 'This is a sample. In your own copy, Claude builds the screens from your project, and you can ask it for anything more specific, like “make the cursor bigger”.';
}
if (STATIC) await loadStatic(); else await loadServer().catch(loadStatic);
styles = STYLE_ORDER.map((id) => info.presets.find((p) => p.id === id)).filter(Boolean);
document.title = `${info.title} · Demo Kitchen`;
$('reveal').textContent = { windows: 'Show in Explorer', linux: 'Open folder' }[info.platform] || 'Show in Finder';
buildTop();
buildStyles();
buildExtras();
fillPlaceholders();
renderStyles();
renderTop();
loadPlayer();
if (!STATIC) listen();
initWelcome({ isStatic: STATIC, onAction: showInstall });
