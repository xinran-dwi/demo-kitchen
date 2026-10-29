// Visual building blocks: cursor shapes and backdrop styles.

// Cursor shapes on a 32×32 grid; `hot` is the pixel that actually clicks.
export const CURSORS = {
  arrow: { hot: [5, 3], svg: '<path d="M5 3 L5 25 L10.5 19.8 L14.3 28.4 L18.4 26.6 L14.6 18.2 L22.2 18.2 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>' },
  white: { hot: [5, 3], svg: '<path d="M5 3 L5 25 L10.5 19.8 L14.3 28.4 L18.4 26.6 L14.6 18.2 L22.2 18.2 Z" fill="#fff" stroke="#111" stroke-width="1.8" stroke-linejoin="round"/>' },
  dot: { hot: [16, 16], svg: '<circle cx="16" cy="16" r="10" fill="rgba(30,30,30,.32)" stroke="#fff" stroke-width="2.2"/>' },
  hand: { hot: [13.5, 3], svg: '<path d="M11.5 5 a2 2 0 0 1 4 0 V14.5 V12 a2 2 0 0 1 4 0 V14.5 V13 a2 2 0 0 1 4 0 V15.5 V15 a2 2 0 0 1 4 0 V21.5 c0 4.4 -3 7.5 -7.4 7.5 h-2.4 c-2.8 0 -4.4 -1.2 -6 -3.5 L5.6 20.2 a2.1 2.1 0 0 1 3.3 -2.6 L11.5 20 Z" fill="#fff" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/>' },
};

export function backdropCSS(style, c1, c2) {
  switch (style) {
    case 'solid': return c1;
    case 'gradient': return `linear-gradient(135deg, ${c1}, ${c2})`;
    case 'dots': return `radial-gradient(${shade(c1, -0.18)} 1.6px, transparent 1.8px) 0 0 / 28px 28px, ${c1}`;
    default: // mesh
      return `radial-gradient(60% 70% at 15% 20%, ${c1} 0%, transparent 70%), radial-gradient(55% 65% at 85% 80%, ${c2} 0%, transparent 70%), radial-gradient(45% 50% at 80% 15%, ${shade(c2, 0.35)} 0%, transparent 70%), ${shade(c1, 0.45)}`;
  }
}

// Lighten (k > 0) or darken (k < 0) a hex color.
export function shade(hex, k) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// 0 (black) to 1 (white), perceived brightness of a hex color.
export function luminance(hex) {
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
