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
console.log('now (M2+S2):', 'winter', JSON.stringify(scan(0, 0, 2026, 11, 20, 42)), 'summer', JSON.stringify(scan(0, 0, 2027, 5, 1, 42)));
for (let k = 0; k < 12; k++) { const L = k * Math.PI / 6;
  console.log(`L=${(k * 30).toString().padStart(3)}°`, 'winter', JSON.stringify(scan(L, 0.5, 2026, 11, 20, 42)), 'summer', JSON.stringify(scan(L, 0.5, 2027, 5, 1, 42))); }
