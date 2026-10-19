import { moon, sun, tide } from '../src/time/astro';
const lat = 24.36107, lon = 123.99674, amp = 0.8, lag = 0.25, E = Math.sin(2 * 23.44 * Math.PI / 180);
// diurnal part: each body's sin(2·declination) × cos(hour angle − L) (K1/O1 and the sun's K1/P1 come out of it)
const diurnal = (t: number, L: number, D: number) => { const m = moon(t, lat, lon), s = sun(t, lat, lon);
  return amp * D * (0.68 * Math.sin(2 * m.dec) / E * Math.cos(m.ha - L) + 0.32 * Math.sin(2 * s.dec) / E * Math.cos(s.ha - L)); };
const h = (t: number, L: number, D: number) => tide(t, lat, lon, amp, lag).h + (D ? diurnal(t, L, D) : 0);
function scan(L: number, D: number, y0: number, m0: number, d0: number, days: number) {
  let eve = 0, morn = 0, mid = 0, low = 0, n = 0;
  const T0 = Date.UTC(y0, m0, d0, -9);
  for (let t = T0; t < T0 + days * 864e5; t += 6e5) { const a = h(t - 6e5, L, D), b = h(t, L, D), c = h(t + 6e5, L, D);
    if (b < a && b <= c) { low = Math.min(low, b); if (b < -0.7) { n++; const hr = new Date(t + 9 * 36e5).getUTCHours(); if (hr >= 17 && hr <= 23) eve++; else if (hr >= 3 && hr <= 9) morn++; else if (hr >= 10 && hr <= 15) mid++; } } }
  return { deep: n, eve, morn, mid, lowest: +low.toFixed(2) };
}
const yr = (L: number, D: number) => { let low = 0; const T0 = Date.UTC(2026, 9, 1); for (let t = T0; t < T0 + 365 * 864e5; t += 6e5) low = Math.min(low, h(t, L, D)); return +low.toFixed(2); };
for (const D of [0.25, 0.3, 0.35, 0.4, 0.5]) { const L = 2 * Math.PI / 3;
  const w = scan(L, D, 2026, 11, 20, 42), w7 = (() => { let n = 0; const T0 = Date.UTC(2026, 11, 20, -9); for (let t = T0; t < T0 + 42 * 864e5; t += 6e5) { const a = h(t - 6e5, L, D), b = h(t, L, D), c = h(t + 6e5, L, D); if (b < a && b <= c && b < -0.7) { const hr = new Date(t + 9 * 36e5).getUTCHours(); if (hr >= 19 && hr <= 21) n++; } } return n; })();
  console.log(`D=${D} L=120°: winter ${JSON.stringify(w)} (19–21h below −0.7 m: ${w7}), summer ${JSON.stringify(scan(L, D, 2027, 5, 1, 42))}, year's lowest ${yr(L, D)}`); }
