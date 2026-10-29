// Small timing helpers shared by every effect. Everything is a pure function of time,
// so the live preview and the frame-by-frame export always agree.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const prog = (t, t0, t1) => (t1 <= t0 ? (t >= t1 ? 1 : 0) : clamp((t - t0) / (t1 - t0)));
export const easeOut = (x) => 1 - Math.pow(1 - x, 3);
export const easeIn = (x) => x * x * x;
// 0 → 1 → 0 over x in [0, 1]
export const bump = (x) => Math.sin(Math.PI * clamp(x));

// In-out ease with a strength knob: 0 = linear, 1 = the cubic ease from the plugin demo, 2 = very soft.
export function easeInOut(x, strength = 1) {
  const p = 1 + 2 * Math.max(0, strength);
  return x < 0.5 ? Math.pow(2, p - 1) * Math.pow(x, p) : 1 - Math.pow(-2 * x + 2, p) / 2;
}

// Keyframe track: [{ t, ...value }]. Returns [A, B, k] for the segment containing t (k is raw 0–1).
export function segmentAt(track, t) {
  if (!track.length) return null;
  if (t <= track[0].t) return [track[0], track[0], 1, 0];
  for (let i = 0; i < track.length - 1; i++) {
    const A = track[i], B = track[i + 1];
    if (t <= B.t) return [A, B, prog(t, A.t, B.t), i];
  }
  const L = track[track.length - 1];
  return [L, L, 1, track.length - 1];
}

// Output time ↔ scene time. Pace speeds the whole scene up or down; slow motion slows one range further.
export function makeTimeMap(sceneDuration, pace = 1, slow = null) {
  const segs = [];
  const P = Math.max(0.05, pace);
  if (slow && slow.to > slow.from) {
    const a = clamp(slow.from, 0, sceneDuration), b = clamp(slow.to, 0, sceneDuration);
    if (a > 0) segs.push([0, a, P]);
    if (b > a) segs.push([a, b, P * Math.max(0.05, slow.speed)]);
    if (sceneDuration > b) segs.push([b, sceneDuration, P]);
  } else segs.push([0, sceneDuration, P]);
  let u = 0;
  const out = segs.map(([t0, t1, speed]) => { const s = { t0, t1, speed, u0: u }; u += (t1 - t0) / speed; s.u1 = u; return s; });
  return {
    duration: u,
    sceneAt(x) {
      for (const s of out) if (x <= s.u1) return s.t0 + (x - s.u0) * s.speed;
      return sceneDuration;
    },
    outAt(t) {
      for (const s of out) if (t <= s.t1) return s.u0 + (t - s.t0) / s.speed;
      return u;
    },
  };
}
