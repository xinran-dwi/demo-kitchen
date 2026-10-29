// First-run guide: three steps that spotlight the real UI. Shown once (remembered in localStorage),
// reopened with the ? button. The public playground uses the same guide with a different last step.

const KEY = 'dk-welcome-v1';

const STEPS = (isStatic) => [
  { target: '#styleSection', title: 'Pick a style',
    body: 'Each style is a complete look for your video. Hover a card to see it move, click to apply it. You can switch any time.' },
  { target: '#extraSection', title: 'Add extras',
    body: 'Switch on captions, a backdrop, a title or end card and more. Each one has at most one simple choice.' },
  isStatic
    ? { target: '#exportBtn', title: 'Make one for your product',
        body: 'This is a sample. Install Demo Kitchen and Claude will build a demo like this from your own project. Free, runs on your Mac.',
        action: 'Show me how' }
    : { target: '#exportBtn', title: 'Export',
        body: 'When it looks right, export an MP4 or a GIF. It is saved in the demo/out folder of your project.' },
];

const CSS = `
.wl-spot { position: fixed; z-index: 50; border-radius: 12px; box-shadow: 0 0 0 9999px rgba(10,10,12,.42); pointer-events: none; transition: all .25s ease; }
.wl-card { position: fixed; z-index: 51; width: 320px; background: #fff; border-radius: 14px; padding: 16px 16px 14px; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 18px 50px rgba(0,0,0,.25); font: 14px/1.5 var(--sans); color: var(--ink); transition: top .25s ease, left .25s ease; }
.wl-dots { display: flex; gap: 5px; margin-bottom: 10px; }
.wl-dots i { width: 6px; height: 6px; border-radius: 3px; background: #E4E4E7; }
.wl-dots i.on { width: 16px; background: var(--ink); }
.wl-card h4 { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
.wl-card p { margin: 0; color: var(--ink-2); font-size: 13px; }
.wl-card .wl-tip { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line-2); color: var(--muted); font-size: 12px; }
.wl-actions { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.wl-actions .skip { margin-right: auto; border: 0; background: none; color: var(--muted); cursor: pointer; font-size: 12.5px; padding: 0; }
.wl-actions .skip:hover { color: var(--ink); }
.wl-actions .btn { height: 30px; padding: 0 12px; font-size: 12.5px; }
.help { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--line); background: var(--panel); color: var(--muted); font-weight: 600; font-size: 13px; cursor: pointer; }
.help:hover { color: var(--ink); border-color: #D4D4D8; }
`;

export function initWelcome({ isStatic = false, onAction } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const help = document.getElementById('helpBtn');
  if (help) help.onclick = () => open(0);
  if (!localStorage.getItem(KEY)) {
    // Wait until the tool is actually on screen (on the guide page it sits below the hero).
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); setTimeout(() => open(0), 600); } }, { threshold: 0.6 });
    io.observe(document.querySelector('.preview') || document.body);
  }

  let spot, card, i = 0;
  const steps = STEPS(isStatic);

  function open(n) {
    close(false);
    i = n;
    spot = Object.assign(document.createElement('div'), { className: 'wl-spot' });
    card = Object.assign(document.createElement('div'), { className: 'wl-card', role: 'dialog' });
    card.setAttribute('aria-live', 'polite');
    document.body.append(spot, card);
    render();
    addEventListener('resize', place);
    document.getElementById('panel')?.addEventListener('scroll', place);
    addEventListener('keydown', onKey);
  }
  function close(remember = true) {
    spot?.remove(); card?.remove(); spot = card = null;
    removeEventListener('resize', place);
    removeEventListener('keydown', onKey);
    document.getElementById('panel')?.removeEventListener('scroll', place);
    if (remember) localStorage.setItem(KEY, '1');
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  }
  function go(d) { const n = i + d; if (n < 0) return; if (n >= steps.length) return close(); i = n; render(); }

  function render() {
    const s = steps[i], last = i === steps.length - 1;
    card.innerHTML = `
      <div class="wl-dots">${steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <h4>${i + 1}. ${s.title}</h4>
      <p>${s.body}</p>
      <p class="wl-tip">${isStatic ? 'In your own copy you can also ask Claude for anything specific, like “make the cursor bigger”.' : 'Want something specific? Just ask Claude in your chat, like “make the cursor bigger”.'}</p>
      <div class="wl-actions">
        <button type="button" class="skip">${last ? '' : 'Skip'}</button>
        ${i > 0 ? '<button type="button" class="btn back">Back</button>' : ''}
        <button type="button" class="btn primary next">${s.action || (last ? 'Done' : 'Next')}</button>
      </div>`;
    card.querySelector('.skip').onclick = () => close();
    card.querySelector('.back')?.addEventListener('click', () => go(-1));
    card.querySelector('.next').onclick = () => { if (s.action) { close(); onAction?.(); } else go(1); };
    // Scroll the side panel only: scrollIntoView would also scroll the page around an embedded playground.
    const el = document.querySelector(s.target), panel = document.getElementById('panel');
    if (el && panel?.contains(el)) panel.scrollTo({ top: el.offsetTop - panel.offsetTop - 12, behavior: 'smooth' });
    setTimeout(place, 280);
    requestAnimationFrame(place);
  }

  function place() {
    if (!card) return;
    const el = document.querySelector(steps[i].target);
    if (!el) return;
    const b = el.getBoundingClientRect(), pad = 6;
    const r = { left: b.left, right: b.right, top: Math.max(b.top, 8), bottom: Math.min(b.bottom, innerHeight - 8) };
    r.width = r.right - r.left; r.height = r.bottom - r.top;
    Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + 2 * pad + 'px', height: r.height + 2 * pad + 'px' });
    const cw = card.offsetWidth, ch = card.offsetHeight, W = innerWidth, H = innerHeight;
    let x, y;
    if (r.right + 16 + cw < W) { x = r.right + 16; y = r.top; }           // to the right
    else { x = Math.max(12, r.right - cw); y = r.bottom + 14; }           // below, right-aligned
    y = Math.max(12, Math.min(y, H - ch - 12));
    Object.assign(card.style, { left: x + 'px', top: y + 'px' });
  }
}
