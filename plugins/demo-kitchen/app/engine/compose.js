// The compositor. Loads a project's demo (world.html + storyboard.json), then draws any moment of the
// video with renderAt(u). The menu's live preview and the frame-by-frame export both call this, so what
// you see in the menu is exactly what gets exported.
//
// Layers, back to front: backdrop → window (frame chrome + viewport with the world iframe)
// → highlight ring, ripples, cursor, caption → letterbox/vignette → title/end card → fade.

import { ASPECTS, normalizeRecipe } from './catalog.js';
import { clamp, lerp, prog, easeOut, easeIn, bump, easeInOut, segmentAt, makeTimeMap } from './timeline.js';
import { CURSORS, backdropCSS, luminance } from './looks.js';

const CSS = `
.dk-stage { position: relative; overflow: hidden; font-family: Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.dk-stage * { box-sizing: border-box; }
.dk-abs { position: absolute; left: 0; top: 0; }
.dk-win { position: absolute; overflow: hidden; }
.dk-vp { position: absolute; overflow: hidden; }
.dk-zoom { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.dk-zoom iframe { border: 0; display: block; pointer-events: none; transform-origin: 0 0; }
.dk-chrome { position: absolute; left: 0; top: 0; right: 0; display: flex; align-items: center; }
.dk-chrome i { display: block; border-radius: 50%; flex: none; }
.dk-url { position: absolute; left: 50%; transform: translateX(-50%); display: flex; align-items: center; justify-content: center; border-radius: 8px; white-space: nowrap; overflow: hidden; }
.dk-ring { position: absolute; border-radius: 12px; pointer-events: none; }
.dk-ripple { position: absolute; border-radius: 50%; pointer-events: none; }
.dk-cursor { position: absolute; left: 0; top: 0; transform-origin: 0 0; overflow: visible; }
.dk-caption { position: absolute; left: 0; right: 0; display: flex; justify-content: center; pointer-events: none; }
.dk-caption span { display: inline-block; white-space: pre-wrap; text-align: center; max-width: 86%; }
.dk-caption.headline span { font-weight: 600; letter-spacing: -0.015em; text-shadow: 0 0 .5em var(--halo), 0 0 1.2em var(--halo); }
.dk-caption.pill span { font-weight: 600; color: #fff !important; background: rgba(18,18,20,.84); padding: .42em .95em; border-radius: 999px; letter-spacing: -0.01em; box-shadow: 0 8px 30px rgba(0,0,0,.18); }
.dk-caption.lower { justify-content: flex-start; padding-left: 5%; }
.dk-caption.lower span { text-align: left; font-weight: 600; background: rgba(255,255,255,.94); padding: .55em .9em .55em 1em; border-left: .22em solid currentColor; border-radius: 6px; box-shadow: 0 10px 34px rgba(0,0,0,.14); }
.dk-bar { position: absolute; left: 0; right: 0; background: #000; }
.dk-card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; pointer-events: none; }
.dk-card h1 { font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; margin: 0; }
.dk-card p { font-weight: 500; margin: 0; }
`;

const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; parent?.appendChild(e); return e; };
const num = (v, d) => (v === undefined || v === null || v === '' || isNaN(+v) ? d : +v);

export class Player {
  constructor(host, { demo = '/demo/', mode = 'preview' } = {}) {
    this.demo = demo.endsWith('/') ? demo : demo + '/';
    this.mode = mode;
    this.u = 0;
    this.playing = false;
    this.loop = true;
    this.onTime = null;
    this.warned = new Set();
    if (!document.getElementById('dk-css')) { const s = el('style'); s.id = 'dk-css'; s.textContent = CSS; document.head.appendChild(s); }

    const st = (this.stage = el('div', 'dk-stage', host));
    this.bg = el('div', 'dk-abs', st);
    this.winEl = el('div', 'dk-win', st);
    this.chrome = el('div', 'dk-chrome', this.winEl);
    this.vpEl = el('div', 'dk-vp', this.winEl);
    this.zoomEl = el('div', 'dk-zoom', this.vpEl);
    this.iframe = el('iframe', '', this.zoomEl);
    this.iframe.setAttribute('scrolling', 'no');
    this.ringEl = el('div', 'dk-ring', st);
    this.ripplesEl = el('div', 'dk-abs', st);
    this.cursorEl = el('div', 'dk-cursor', st);
    this.captionEl = el('div', 'dk-caption', st);
    this.captionText = el('span', '', this.captionEl);
    this.vignette = el('div', 'dk-abs', st);
    this.barTop = el('div', 'dk-bar', st);
    this.barBottom = el('div', 'dk-bar', st);
    this.card = el('div', 'dk-card', st);
    this.cardH = el('h1', '', this.card);
    this.cardP = el('p', '', this.card);
    this.fade = el('div', 'dk-abs', st);
    this.recipe = normalizeRecipe({});
  }

  // ---------- loading ----------
  async load() {
    const bust = `?v=${Date.now()}`;
    this.sb = await (await fetch(this.demo + 'storyboard.json' + bust, { cache: 'no-store' })).json();
    if (!this.recipeSet) {
      try { const r = await fetch(this.demo + 'recipe.json' + bust, { cache: 'no-store' }); if (r.ok) this.recipe = normalizeRecipe(await r.json()); } catch {}
    }
    const sb = this.sb;
    this.V = sb.viewport || [1920, 1080];
    this.shots = (sb.shots || []).slice().sort((a, b) => a.t - b.t);
    this.path = (sb.cursor?.path || []).slice().sort((a, b) => a.t - b.t);
    this.clicks = (sb.clicks || []).map((c) => (typeof c === 'number' ? { t: c } : c)).sort((a, b) => a.t - b.t);
    this.captions = (sb.captions || []).map((c) => (Array.isArray(c) ? { from: c[0], to: c[1], text: c[2] } : c));

    const [Vw, Vh] = this.V;
    Object.assign(this.iframe.style, { width: Vw + 'px', height: Vh + 'px' });
    await new Promise((res) => { this.iframe.onload = res; this.iframe.src = this.demo + (sb.world || 'world.html') + bust; });
    const w = (this.w = this.iframe.contentWindow), d = (this.doc = w.document);
    await d.fonts?.ready;
    await Promise.all([...d.images].map((i) => i.decode?.().catch(() => {})));
    if (w.scene?.ready) await w.scene.ready;
    await d.fonts?.ready;

    this.world = d.getElementById('world');
    if (this.world) this.world.style.transformOrigin = '0 0';
    this.worldBg = getComputedStyle(d.body).backgroundColor || '#fff';
    this.inEls = [...d.querySelectorAll('[data-in],[data-out]')].map((e) => ({
      e, tin: num(e.dataset.in, null), tout: num(e.dataset.out, null), fx: e.dataset.fx || 'rise',
      dur: num(e.dataset.dur, 0.5), dx: num(e.dataset.dx, 0), dy: num(e.dataset.dy, 18),
    }));
    this.typeEls = [...d.querySelectorAll('[data-type]')].map((e) => ({ e, t0: num(e.dataset.type, 0), text: e.textContent }));
    this.lastCam = null;
    this.relayout();
    this.retime();
    this.renderAt(Math.min(this.u, this.total - 1e-3));
    return this;
  }

  setRecipe(r) {
    this.recipeSet = true;
    this.recipe = normalizeRecipe(r);
    if (!this.sb) return;
    this.relayout();
    this.retime();
    this.renderAt(Math.min(this.u, this.total - 1e-3));
  }

  dish(id) { return this.recipe.dishes[id]; }
  on(id) { return !!this.recipe.dishes[id]?.on; }
  get size() { return ASPECTS[this.recipe.aspect]; }

  // ---------- layout: backdrop, window, frame chrome ----------
  relayout() {
    const [W, H] = this.size, [Vw, Vh] = this.V;
    const bg = this.dish('background'), fr = this.dish('frame');
    Object.assign(this.stage.style, { width: W + 'px', height: H + 'px' });
    const bgOn = this.on('background'), frOn = this.on('frame');
    const phone = frOn && fr.style === 'phone', browser = frOn && fr.style === 'browser';
    const dark = fr.theme === 'dark';
    this.bg.style.cssText = `width:${W}px;height:${H}px;background:${bgOn ? backdropCSS(bg.style, bg.color1, bg.color2) : this.worldBg}`;

    const pad = bgOn ? bg.padding * Math.min(W, H) : 0;
    const barH = browser ? Math.round(Math.max(W, H) * 0.022) : 0;
    const bezel = phone ? Math.round(Math.min(W, H) * 0.018) : 0;
    const aw = W - 2 * pad - 2 * bezel, ah = H - 2 * pad - barH - 2 * bezel;
    const f = Math.min(aw / Vw, ah / Vh);
    const vpW = Vw * f, vpH = Vh * f;
    const winW = vpW + 2 * bezel, winH = vpH + barH + 2 * bezel;
    const winX = (W - winW) / 2, winY = (H - winH) / 2;
    const radius = phone ? Math.round(Math.min(winW, winH) * 0.09) : bgOn ? bg.radius : browser ? 12 : 0;
    const shadow = bgOn ? bg.shadow : frOn ? 0.4 : 0;
    this.f = f;
    this.vpOrigin = { x: winX + bezel, y: winY + bezel + barH };
    Object.assign(this.winEl.style, {
      left: winX + 'px', top: winY + 'px', width: winW + 'px', height: winH + 'px', borderRadius: radius + 'px',
      background: phone ? '#0B0B0D' : browser ? (dark ? '#232327' : '#EDEDF0') : this.worldBg,
      boxShadow: shadow ? `0 ${2 * shadow}px ${6 * shadow}px rgba(0,0,0,${0.08 * shadow}), 0 ${30 * shadow}px ${90 * shadow}px rgba(0,0,0,${0.32 * shadow})` : 'none',
    });
    Object.assign(this.vpEl.style, {
      left: bezel + 'px', top: bezel + barH + 'px', width: vpW + 'px', height: vpH + 'px',
      borderRadius: phone ? Math.max(0, radius - bezel) + 'px' : bgOn && !browser ? radius + 'px' : '0',
      background: this.worldBg,
    });
    // browser chrome
    this.chrome.style.display = browser ? 'flex' : 'none';
    if (browser) {
      const dot = Math.round(barH * 0.3), url = (fr.url || '').replace(/[<>&]/g, '');
      this.chrome.style.cssText = `display:flex;height:${barH}px;padding-left:${barH * 0.5}px;gap:${dot * 0.7}px;border-bottom:1px solid ${dark ? '#36363b' : '#DADADF'}`;
      this.chrome.innerHTML = ['#FF5F57', '#FEBC2E', '#28C840'].map((c) => `<i style="width:${dot}px;height:${dot}px;background:${c}"></i>`).join('') +
        `<div class="dk-url" style="height:${barH * 0.62}px;width:${Math.min(winW * 0.42, 620)}px;background:${dark ? '#34343A' : '#fff'};color:${dark ? '#bbb' : '#666'};font:500 ${barH * 0.34}px Inter">${url}</div>`;
    }
  }

  // ---------- timing ----------
  retime() {
    const D = num(this.sb.duration, 10);
    const ov = this.dish('overview');
    this.D = D;
    this.sceneEnd = D + (this.on('overview') ? ov.duration + ov.hold : 0);
    const sm = this.dish('slowmo');
    this.tm = makeTimeMap(this.sceneEnd, this.recipe.pace, this.on('slowmo') ? sm : null);
    this.I = this.on('intro') ? this.dish('intro').duration : 0;
    this.tail = this.on('outro') ? this.dish('outro').hold : num(this.sb.tail, 0.8);
    this.total = this.I + this.tm.duration + this.tail;
  }
  sceneTime(u) {
    if (u < this.I) return 0;
    if (u < this.I + this.tm.duration) return this.tm.sceneAt(u - this.I);
    return this.sceneEnd;
  }
  outTime(t) { return this.I + this.tm.outAt(t); }
  markers() {
    return [
      ...this.clicks.map((c) => ({ u: this.outTime(c.t), kind: 'click' })),
      ...this.captions.map((c) => ({ u: this.outTime(c.from), u2: this.outTime(c.to), kind: 'caption', text: c.text })),
      ...this.shots.map((s) => ({ u: this.outTime(s.t), kind: 'shot' })),
    ];
  }

  // ---------- world geometry ----------
  warn(msg) { if (!this.warned.has(msg)) { this.warned.add(msg); console.warn('[demo-kitchen]', msg); } }
  find(sel) { const e = this.doc.querySelector(sel); if (!e) this.warn(`No element matches "${sel}" in the world`); return e; }
  worldBox(sel) {
    if (!this.world) return null;
    const wr = this.world.getBoundingClientRect(), s = this.lastCam?.s || 1;
    const els = sel === '*' ? [...this.world.children] : [this.find(sel)].filter(Boolean);
    if (!els.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of els) { const r = e.getBoundingClientRect(); if (!r.width && !r.height) continue; x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
    if (x0 === Infinity) return null;
    return { x: (x0 - wr.left) / s, y: (y0 - wr.top) / s, w: (x1 - x0) / s, h: (y1 - y0) / s };
  }
  resolveShot(s, zoomMul = 1) {
    const [Vw, Vh] = this.V;
    const ax = num(s.ax, Vw / 2), ay = num(s.ay, Vh / 2);
    if (s.fit) {
      const b = this.worldBox(s.fit), pad = num(s.pad, 0.08);
      if (!b) return { cx: Vw / 2, cy: Vh / 2, s: 1, ax, ay };
      const sc = Math.min((Vw * (1 - 2 * pad)) / b.w, (Vh * (1 - 2 * pad)) / b.h) * num(s.zoom, 1) * zoomMul;
      return { cx: b.x + b.w / 2 + num(s.dx, 0), cy: b.y + b.h / 2 + num(s.dy, 0), s: sc, ax, ay };
    }
    return { cx: num(s.cx, Vw / 2), cy: num(s.cy, Vh / 2), s: num(s.s, 1) * zoomMul, ax, ay };
  }

  // ---------- camera ----------
  cameraAt(t) {
    const [Vw] = this.V, cd = this.dish('camera'), fx = { o: 1, dx: 0, sc: 1 };
    const zoom = this.on('camera') ? cd.zoom : 1;
    let track = this.on('camera') ? this.shots : this.shots.slice(0, 1);
    if (this.on('overview')) {
      const ov = this.dish('overview'), last = track[track.length - 1];
      track = [...track, ...(last ? [{ ...last, t: this.D }] : []), { t: this.D + ov.duration, fit: '*', pad: ov.pad, overview: true }];
    }
    if (!track.length) return { cam: { cx: this.V[0] / 2, cy: this.V[1] / 2, s: 1, ax: this.V[0] / 2, ay: this.V[1] / 2 }, fx };
    const [A, B, k] = segmentAt(track, t);
    const a = this.resolveShot(A, A.overview ? 1 : zoom);
    if (A === B) return { cam: a, fx };
    const b = this.resolveShot(B, B.overview ? 1 : zoom);
    const same = Math.abs(a.cx - b.cx) < 0.5 && Math.abs(a.cy - b.cy) < 0.5 && Math.abs(a.s - b.s) < 1e-4 && Math.abs(a.ax - b.ax) < 0.5 && Math.abs(a.ay - b.ay) < 0.5;
    if (same) return { cam: a, fx };

    const tr = this.dish('transitions');
    if (this.on('transitions') && !B.overview) {
      const mid = (A.t + B.t) / 2, d = tr.duration, e = prog(t, mid - d / 2, mid + d / 2);
      if (e > 0 && e < 1) {
        const x = 2 * e;
        if (tr.style === 'fade') fx.o = easeInOut(Math.abs(1 - x));
        if (tr.style === 'slide') fx.dx = x < 1 ? -Vw * easeIn(x) : Vw * (1 - easeOut(x - 1));
        if (tr.style === 'zoom') { if (x < 1) { fx.sc = 1 + 0.35 * easeIn(x); fx.o = 1 - easeIn(x); } else { fx.sc = 0.82 + 0.18 * easeOut(x - 1); fx.o = easeOut(x - 1); } }
      }
      return { cam: t < mid ? a : b, fx };
    }
    const q = easeInOut(k, this.on('camera') ? cd.easing : 1);
    return {
      cam: { cx: lerp(a.cx, b.cx, q), cy: lerp(a.cy, b.cy, q), s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), q)), ax: lerp(a.ax, b.ax, q), ay: lerp(a.ay, b.ay, q) },
      fx,
    };
  }
  toScreen(x, y, cam = this.lastCam) { return cam ? { x: cam.ax + (x - cam.cx) * cam.s, y: cam.ay + (y - cam.cy) * cam.s } : { x, y }; }

  // ---------- cursor ----------
  target(to) {
    if (Array.isArray(to)) return { x: to[0], y: to[1] };
    if (to?.world) return this.toScreen(to.world[0], to.world[1]);
    if (to?.el) {
      const e = this.find(to.el);
      if (!e) return { x: this.V[0] / 2, y: this.V[1] / 2 };
      const r = e.getBoundingClientRect(), at = to.at || [0.5, 0.5];
      return { x: r.left + r.width * at[0] + num(to.dx, 0), y: r.top + r.height * at[1] + num(to.dy, 0) };
    }
    return { x: num(to?.x, 0), y: num(to?.y, 0) };
  }
  cursorAt(t) {
    if (!this.path.length) return null;
    const [A, B, k] = segmentAt(this.path, t);
    const p = this.target(A.to);
    if (A === B || k <= 0) return p;
    const q = this.target(B.to);
    if (k >= 1) return q;
    const cd = this.dish('cursor'), nm = this.dish('naturalMotion');
    let e = easeInOut(k, this.on('cursor') ? cd.smoothness : 1);
    let ox = 0, oy = 0;
    if (this.on('naturalMotion')) {
      e += nm.overshoot * 0.12 * bump(prog(k, 0.55, 1));
      const h = nm.arc * bump(k);
      ox = (q.y - p.y) * h; oy = -(q.x - p.x) * h;
    }
    return { x: lerp(p.x, q.x, e) + ox, y: lerp(p.y, q.y, e) + oy };
  }

  // ---------- auto zoom toward clicks ----------
  zoomAt(t) {
    const [Vw, Vh] = this.V, none = { z: 1, p: { x: Vw / 2, y: Vh / 2 } };
    if (!this.on('autoZoom') || !this.clicks.length) return none;
    const z = this.dish('autoZoom');
    let E = 0, wx = 0, wy = 0, ws = 0;
    for (const c of this.clicks) {
      const a0 = c.t - 0.1 - z.ramp, a1 = c.t - 0.1, b0 = c.t + z.hold, b1 = b0 + z.ramp;
      if (t <= a0 || t >= b1) continue;
      const e = t < a1 ? easeInOut(prog(t, a0, a1)) : 1 - easeInOut(prog(t, b0, b1));
      if (e <= 0) continue;
      const p = c.at ? this.target(c.at) : this.cursorAt(c.t) || none.p;
      E = Math.max(E, e); wx += e * p.x; wy += e * p.y; ws += e;
    }
    if (!ws) return none;
    return { z: 1 + (z.amount - 1) * E, p: { x: wx / ws, y: wy / ws } };
  }

  // ---------- per-element reveals and typing inside the world ----------
  applyElements(t) {
    for (const r of this.inEls) {
      let v = 1;
      if (r.tin !== null) v = Math.min(v, easeOut(prog(t, r.tin, r.tin + r.dur)));
      if (r.tout !== null) v = Math.min(v, 1 - easeOut(prog(t, r.tout, r.tout + r.dur)));
      const s = r.e.style;
      s.opacity = v;
      s.visibility = v <= 0 ? 'hidden' : '';
      const k = 1 - v;
      if (r.fx === 'rise') s.transform = `translate(${r.dx * k}px, ${r.dy * k}px)`;
      else if (r.fx === 'scale') s.transform = `scale(${lerp(1, 0.96, k)})`;
      else if (r.fx === 'left') s.transform = `translateX(${-60 * k}px)`;
      else if (r.fx === 'right') s.transform = `translateX(${60 * k}px)`;
    }
    const ty = this.dish('typing');
    for (const r of this.typeEls) {
      const n = t < r.t0 ? 0 : this.on('typing') ? Math.floor((t - r.t0) * ty.cps) : r.text.length;
      const typingNow = this.on('typing') && ty.caret && t >= r.t0 - 0.4 && n < r.text.length + 6;
      const caret = typingNow && Math.floor(t * 2.2) % 2 === 0 ? '<span style="font-weight:300;opacity:.75">|</span>' : '';
      r.e.innerHTML = r.text.slice(0, n).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]) + caret;
    }
  }

  // ---------- one frame ----------
  renderAt(u) {
    if (!this.sb) return;
    u = clamp(u, 0, this.total);
    this.u = u;
    const t = this.sceneTime(u), [W, H] = this.size, [Vw, Vh] = this.V, w = this.w;
    const ctx = { t, u, viewport: this.V, clicks: this.clicks, recipe: this.recipe, toScreen: (x, y) => this.toScreen(x, y), player: this };

    w.scene?.layout?.(t, ctx);
    this.applyElements(t);
    const { cam, fx } = this.cameraAt(t);
    this.lastCam = cam;
    ctx.cam = cam;
    if (this.world) this.world.style.transform = `translate(${cam.ax - cam.cx * cam.s}px, ${cam.ay - cam.cy * cam.s}px) scale(${cam.s})`;
    w.scene?.update?.(t, ctx);

    // viewport: fit scale f, zoom z about p, transition scale/offset about the center
    const { z, p } = this.zoomAt(t), f = this.f, C = { x: Vw / 2, y: Vh / 2 };
    const M = f * fx.sc * z;
    const ox = f * (fx.sc * (p.x * (1 - z) - C.x) + C.x + fx.dx), oy = f * (fx.sc * (p.y * (1 - z) - C.y) + C.y);
    this.zoomEl.style.transform = `matrix(${M},0,0,${M},${ox},${oy})`;
    this.zoomEl.style.opacity = fx.o;
    const toStage = (q) => ({ x: this.vpOrigin.x + M * q.x + ox, y: this.vpOrigin.y + M * q.y + oy });

    // cursor
    const cd = this.dish('cursor'), pos = this.cursorAt(t);
    const show = this.sb.cursor?.show || [-1e9, 1e9];
    const vis = this.on('cursor') && pos ? prog(t, show[0], show[0] + 0.3) * (1 - prog(t, show[1], show[1] + 0.5)) * fx.o : 0;
    let press = 0;
    for (const c of this.clicks) press = Math.max(press, prog(t, c.t - 0.08, c.t - 0.02) * (1 - prog(t, c.t + 0.1, c.t + 0.18)));
    const cs = pos ? toStage(pos) : { x: 0, y: 0 };
    if (vis > 0) {
      const shape = CURSORS[cd.style] || CURSORS.arrow, k = cd.size / 32;
      const sq = this.on('press') ? 1 - this.dish('press').squash * press : 1;
      if (this.cursorStyle !== cd.style + cd.size + cd.shadow) {
        this.cursorStyle = cd.style + cd.size + cd.shadow;
        this.cursorEl.innerHTML = `<svg width="${cd.size}" height="${cd.size}" viewBox="0 0 32 32" style="display:block;overflow:visible;filter:drop-shadow(0 ${4 * cd.shadow}px ${8 * cd.shadow}px rgba(0,0,0,${0.45 * cd.shadow}))">${shape.svg}</svg>`;
      }
      const hx = shape.hot[0] * k, hy = shape.hot[1] * k;
      this.cursorEl.style.transformOrigin = `${hx}px ${hy}px`;
      this.cursorEl.style.transform = `translate(${cs.x - hx}px, ${cs.y - hy}px) scale(${sq})`;
    }
    this.cursorEl.style.opacity = vis;

    // ripples
    let rip = '';
    if (this.on('ripple') && vis > 0) {
      const rd = this.dish('ripple');
      for (const c of this.clicks) {
        const e = prog(t, c.t, c.t + rd.duration);
        if (e <= 0 || e >= 1) continue;
        const r = lerp(rd.size * 0.22, rd.size, easeOut(e));
        rip += `<div class="dk-ripple" style="left:${cs.x - r}px;top:${cs.y - r}px;width:${2 * r}px;height:${2 * r}px;border:${rd.thickness}px solid ${rd.color};opacity:${0.7 * (1 - e) * vis}"></div>`;
      }
    }
    this.ripplesEl.innerHTML = rip;

    // highlight ring around the clicked element
    let ring = 0, ringBox = null;
    if (this.on('press') && this.dish('press').ring) {
      for (const c of this.clicks) {
        if (!c.el) continue;
        const e = easeOut(prog(t, c.t - 0.15, c.t + 0.05)) * (1 - prog(t, c.t + 0.5, c.t + 0.8));
        if (e > ring) { ring = e; ringBox = c.el; }
      }
    }
    if (ring > 0 && ringBox && this.find(ringBox)) {
      const r = this.find(ringBox).getBoundingClientRect(), a = toStage({ x: r.left, y: r.top }), b = toStage({ x: r.right, y: r.bottom });
      const g = 8, col = this.dish('press').ringColor;
      Object.assign(this.ringEl.style, { display: 'block', left: a.x - g + 'px', top: a.y - g + 'px', width: b.x - a.x + 2 * g + 'px', height: b.y - a.y + 2 * g + 'px',
        border: `3px solid ${col}`, boxShadow: `0 0 0 ${6 * ring}px ${col}33`, opacity: ring });
    } else this.ringEl.style.display = 'none';

    // letterbox + vignette (computed first so captions can sit inside the picture)
    const ci = this.dish('cinematic');
    const barK = this.on('cinematic') ? (ci.animate ? easeOut(prog(u, this.I, this.I + 0.9)) : 1) : 0;
    const bar = ci.bars * H * barK;
    Object.assign(this.barTop.style, { top: 0, height: bar + 'px' });
    Object.assign(this.barBottom.style, { bottom: 0, height: bar + 'px' });
    this.vignette.style.cssText = `width:${W}px;height:${H}px;pointer-events:none;background:${this.on('cinematic') && ci.vignette ? `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${0.7 * ci.vignette}) 100%)` : 'none'}`;

    // captions
    const cp = this.dish('captions'), cc = this.on('captions') && this.captions.find((c) => t >= c.from && t < c.to);
    if (cc) {
      let e = Math.min(easeOut(prog(t, cc.from, cc.from + cp.fade)), 1 - prog(t, cc.to - cp.fade * 0.8, cc.to));
      if (this.on('outro')) { const s0 = this.I + this.tm.duration - this.dish('outro').lead; e *= 1 - prog(u, s0 - 0.1, s0 + 0.25); } // the end card takes over
      if (this.captionText.textContent !== cc.text) this.captionText.textContent = cc.text;
      this.captionEl.className = 'dk-caption ' + cp.style;
      const edge = Math.max(H * 0.05, bar + H * 0.025);
      const lift = (1 - e) * 10 * (cp.position === 'top' ? 1 : -1);
      Object.assign(this.captionEl.style, { top: cp.position === 'top' ? edge + 'px' : 'auto', bottom: cp.position === 'bottom' ? edge + 'px' : 'auto', opacity: e, transform: `translateY(${lift}px)` });
      // 'auto' picks ink that reads on what's behind: light only on a dark backdrop. Pill and Card bring their own background.
      const bg = this.dish('background'), dark = this.on('background') && (luminance(bg.color1) + luminance(bg.color2)) / 2 < 0.45;
      const ink = cp.color && cp.color !== 'auto' ? cp.color : cp.style === 'headline' && dark ? '#F4F4F5' : '#18181B';
      this.captionText.style.setProperty('--halo', luminance(ink) > 0.5 ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.85)');
      Object.assign(this.captionText.style, { fontSize: cp.size + 'px', color: cp.style === 'lower' && luminance(ink) > 0.6 ? '#18181B' : ink });
    } else this.captionEl.style.opacity = 0;

    // title card / end card
    this.renderCard(u);

    // fade in / out
    const fd = this.dish('fades');
    const fo = this.on('fades') ? Math.max(1 - prog(u, 0, fd.in), prog(u, this.total - fd.out, this.total)) : 0;
    this.fade.style.cssText = `width:${W}px;height:${H}px;background:${fd.color};opacity:${fo};pointer-events:none`;

    this.onTime?.(u);
  }

  renderCard(u) {
    const [W, H] = this.size, S = Math.min(W, H) / 1080, c = this.card.style;
    if (this.on('intro') && u < this.I) {
      const d = this.dish('intro'), dark = d.theme === 'dark', o = 1 - prog(u, this.I - 0.5, this.I), e = easeOut(prog(u, 0.05, 0.8));
      c.display = 'flex'; c.opacity = o; c.backdropFilter = 'none'; c.background = dark ? '#0E0E10' : '#FBFAF7'; c.justifyContent = 'center'; c.paddingTop = '0';
      this.setCardText(d.title, d.subtitle, dark ? '#fff' : '#161616', dark ? '#9A9AA2' : '#6E6E6E', 92 * S, 32 * S, e);
      return;
    }
    if (this.on('outro')) {
      const d = this.dish('outro'), start = this.I + this.tm.duration - d.lead, e = easeOut(prog(u, start, start + 0.7));
      if (e > 0) {
        c.display = 'flex'; c.opacity = 1;
        c.backdropFilter = 'none';
        if (d.style === 'top') {
          c.background = 'transparent'; c.justifyContent = 'flex-start'; c.paddingTop = H * 0.065 + 'px';
          this.setCardText(d.title, d.subtitle, '#1E1E1E', '#6E6E6E', 64 * S, 28 * S, e);
        } else if (d.style === 'center') {
          c.background = `rgba(12,12,14,${0.6 * e})`; c.backdropFilter = `blur(${10 * e}px)`; c.justifyContent = 'center'; c.paddingTop = '0';
          this.setCardText(d.title, d.subtitle, '#fff', 'rgba(255,255,255,.75)', 84 * S, 32 * S, e);
        } else {
          c.background = `rgba(251,250,247,${e})`; c.justifyContent = 'center'; c.paddingTop = '0';
          this.setCardText(d.title, d.subtitle, '#161616', '#6E6E6E', 84 * S, 32 * S, e);
        }
        return;
      }
    }
    c.display = 'none';
  }
  setCardText(title, sub, c1, c2, s1, s2, e) {
    if (this.cardH.textContent !== title) this.cardH.textContent = title;
    if (this.cardP.textContent !== sub) this.cardP.textContent = sub;
    Object.assign(this.cardH.style, { color: c1, fontSize: s1 + 'px', opacity: e, transform: `translateY(${(1 - e) * 16}px)` });
    Object.assign(this.cardP.style, { color: c2, fontSize: s2 + 'px', marginTop: s2 * 0.5 + 'px', opacity: e, transform: `translateY(${(1 - e) * 22}px)` });
  }

  // ---------- live playback (preview only) ----------
  play() {
    if (this.playing) return;
    this.playing = true;
    if (this.u >= this.total - 0.01) this.u = 0;
    let t0 = performance.now() - this.u * 1000;
    const tick = (now) => {
      if (!this.playing) return;
      let u = (now - t0) / 1000;
      if (u >= this.total) {
        if (!this.loop) { this.renderAt(this.total - 1e-3); this.pause(); return; }
        t0 = now; u = 0;
      }
      this.renderAt(u);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  pause() { this.playing = false; }
  seek(u) { const was = this.playing; this.pause(); this.renderAt(u); if (was) this.play(); }
}
