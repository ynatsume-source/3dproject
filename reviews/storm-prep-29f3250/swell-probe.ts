import './node-land';
const { loadIslandWeather, islandWeather, islandWait } = await import('../src/world/island-time');
await loadIslandWeather();
const start = Date.parse('2026-11-05T06:00:00+09:00'), DAYS = Number(process.env.DAYS ?? 90), STEP = 10 * 60e3, WAIT = islandWait(48 * 3.6e6);
const jst = (t: number) => ((t / 3.6e6 + 9) % 24 + 24) % 24;
let was = false, onsets: number[] = [];
for (let t = start; t < start + DAYS * 864e5; t += STEP) { const w = islandWeather(t); const s = !!w?.typhoon; if (s && !was) onsets.push(t); was = s; }
let morning = 0, awake = 0, evening = 0;
const rows: string[] = [];
for (const o of onsets) {
  let m = false, a = false, e = false;
  for (let t = o - WAIT; t < o; t += STEP) { const w = islandWeather(t); if (!w || w.swellPeriod === undefined || w.swellPeriod < 9 || w.typhoon) continue; const h = jst(t);
    if (h >= 8.85 && h < 9.5) m = true; if (h >= 6 && h < 21) a = true; if (h >= 19 && h < 21) e = true; }
  morning += +m; awake += +a; evening += +e;
  rows.push(`${((o - start) / 3.6e6).toFixed(1)}h jst${jst(o).toFixed(1)} morning ${m} evening ${e} awake ${a}`);
}
console.log(JSON.stringify({ DAYS, waitH: +(WAIT / 3.6e6).toFixed(2), storms: onsets.length, caughtAtMorning: morning, caughtAtEvening: evening, swellSeenAwake: awake }));
console.log(rows.join('\n'));
process.exit(0);
