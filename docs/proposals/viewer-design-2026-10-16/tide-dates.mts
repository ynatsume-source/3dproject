// When the island's tide is worth showing (viewer design, 2026-10-23): Kayama's tide by the world's own model
// (src/time/astro.ts tide, with the diurnal K1/O1 share; locations.ts kayama), in JST, with the sun and the moon at each.
// No random draws: the same dates every run. Run from the repo root:
//   npx tsx docs/proposals/viewer-design-2026-10-16/tide-dates.mts            (the stream's first season, 12/20–1/31)
//   npx tsx docs/proposals/viewer-design-2026-10-16/tide-dates.mts rehearsal  (10/26–11/20, every high and low)
const { tide, sun, moon } = await import(process.cwd() + '/src/time/astro.ts');
const lat = 24.36107, lon = 123.99674, amp = 0.8, lag = 0.25, diurnal = { d: 0.3, lag: 2 * Math.PI / 3 };
const H = (t: number) => tide(t, lat, lon, amp, lag, diurnal).h;
const STEP = 300000, deg = 180 / Math.PI;
const jst = (t: number) => new Date(t + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
const light = (t: number) => { const a = sun(t, lat, lon).alt * deg; return a > 0 ? 'day' : a > -6 ? 'dusk' : 'night'; };
const moonAt = (t: number) => { const m = moon(t, lat, lon); return `moon ${Math.round(m.illum * 100)}%${m.alt > 0 ? ' up' : ''}`; };
function extremes(from: number, to: number) {
  const out: { t: number; h: number; low: boolean }[] = [];
  for (let t = from; t < to; t += STEP) {
    const a = H(t - STEP), b = H(t), c = H(t + STEP);
    if (b < a && b <= c) out.push({ t, h: b, low: true });
    if (b > a && b >= c) out.push({ t, h: b, low: false });
  }
  return out;
}
if (process.argv[2] === 'rehearsal') {
  for (const e of extremes(Date.UTC(2026, 9, 25, 15), Date.UTC(2026, 10, 20, 15)))
    console.log(jst(e.t), e.low ? 'low ' : 'high', e.h.toFixed(2).padStart(5), light(e.t).padEnd(5), e.low ? moonAt(e.t) : '');
} else {
  const ex = extremes(Date.UTC(2026, 11, 19, 15), Date.UTC(2027, 0, 31, 15));
  console.log('deep lows (below -0.70 m):');
  for (const e of ex.filter((e) => e.low && e.h < -0.7)) console.log(' ', jst(e.t), e.h.toFixed(2), light(e.t).padEnd(5), moonAt(e.t));
  console.log('high waters (above +0.80 m):');
  for (const e of ex.filter((e) => !e.low && e.h > 0.8)) console.log(' ', jst(e.t), e.h.toFixed(2), light(e.t));
}
