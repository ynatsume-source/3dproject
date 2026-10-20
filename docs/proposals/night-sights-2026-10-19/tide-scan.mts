// The island's deep low tides (below -0.7 m) from 12/20 to 1/31, by the model in src/time/astro.ts (Kayama). Run from the repo root: npx tsx docs/proposals/night-sights-2026-10-19/tide-scan.mts
const { tide } = await import(process.cwd() + '/src/time/astro.ts');
const lat = 24.36107, lon = 123.99674, amp = 0.8, lag = 0.25;
const out: string[] = []; let night = 0, day = 0;
for (let t = Date.UTC(2026, 11, 20, 15); t < Date.UTC(2027, 1, 1, 15); t += 600000) {
  const a = tide(t - 600000, lat, lon, amp, lag).h, b = tide(t, lat, lon, amp, lag).h, c = tide(t + 600000, lat, lon, amp, lag).h;
  if (b < a && b <= c && b < -0.7) { const jst = new Date(t + 9 * 3600e3), h = jst.getUTCHours(); const isN = h >= 19 || h < 4; isN ? night++ : day++;
    out.push(`${jst.toISOString().slice(5, 16).replace('T', ' ')} ${b.toFixed(2)} ${isN ? 'NIGHT' : ''}`); }
}
console.log(out.join('\n')); console.log({ night, day });
