// Headless check (ADR 0006, 0007): Dot's world's own time and weather.
//  1 the calendar: an island year is four real weeks; it began on island June 1st; the day keeps the real clock
//  2 the weather: the Earth's past record replayed on the island's calendar — a typhoon in the first island summer
//  3 a typhoon on the island: everyone takes shelter, the evening custom waits; once it passes the beds and the rocky
//    bottom are torn up, something washes up, and each has it in its record
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/island-time-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { ISLAND_RATE, islandDate, islandWait, islandWeather, loadIslandWeather, type IslandWeather } from '../src/world/island-time';

let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const t0 = Date.parse('2026-10-05T00:00:00+09:00'), H = 3.6e6;

{ // 1 the calendar
  const a = islandDate(t0), b = islandDate(t0 + 28 * 24 * H), wk = islandDate(t0 + 7 * 24 * H);
  want('1 it began on island June 1st, year 1, summer', a.year === 1 && a.month === 6 && a.day === 1 && a.season === '夏', a.label);
  want('1 four real weeks are an island year', b.year === 2 && b.month === 6 && b.day === 1, b.label);
  want('1 a real week is about a season (91 island days)', Math.abs(wk.dayOfYear - a.dayOfYear - 91) <= 1, wk.label);
  want('1 what is only waited for runs at the same rate', Math.abs(islandWait(ISLAND_RATE * H) - H) < 1);
}
await loadIslandWeather();
let typhoonAt = 0;
{ // 2 the weather
  const w = islandWeather(t0)!;
  want('2 the record is there: measured at the station (JMA Ishigaki), with its original time', !!w && w.ok && w.record.station === 'jma-47918' && w.pressureMeasured! > 900 && /^2024-06-01T00:00/.test(w.record.at), w ? `${w.pressureMeasured} hPa at ${w.record.at}` : 'none');
  for (let m = 0; m < 28 * 24 * 60 && !typhoonAt; m += 10) if (islandWeather(t0 + m * 60e3)!.typhoon) typhoonAt = t0 + m * 60e3;
  const d = typhoonAt ? islandDate(typhoonAt) : null, tw = typhoonAt ? islandWeather(typhoonAt)! : null;
  want('2 a typhoon in the first island summer, from the record (low pressure, gale)', !!d && d.month === 7 && tw!.pressure < 996 && tw!.gust >= 20, d ? `${d.label} ${tw!.pressure} hPa, gusts ${tw!.gust} m/s` : 'none');
}
{ // 3 a typhoon on the island
  let now = Date.parse('2026-10-03T01:00:00Z'); Date.now = () => now; Math.random = mulberry32(5);
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
  const f = (x: number) => (x < 0 || x > 300 ? -3 : 2), T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  R.setBrain(null);
  const run = (secs: number) => { for (let i = 0; i < secs * 4; i++) { now += 250; R.update(0.25, now, new THREE.Vector3(0, 50, 0)); } };
  run(5);
  const fair = { ...islandWeather(t0)!, typhoon: false } as IslandWeather, gale = { ...fair, typhoon: true, pressure: 985, gust: 33, wind: 18 } as IslandWeather;
  const grass0 = R.beds.map((b: any) => b.grass), stock0 = R.patches.reduce((n: number, p: any) => n + Object.values(p.stock).reduce((a: number, b: any) => a + b, 0), 0);
  R.setWeather(fair); run(5);
  R.setWeather(gale); run(10);
  want('3 in a typhoon everyone takes shelter', R.list.every((r: any) => r.task?.kind === 'shelter'), R.list.map((r: any) => `${r.id}:${r.task?.kind}`).join(' '));
  want('3 …and each has it in its record', R.list.every((r: any) => r.diary.some((e: any) => e.key === 'weather' && /台風が来た/.test(e.text))));
  R.setWeather(fair); run(5);
  const grass1 = R.beds.map((b: any) => b.grass), stock1 = R.patches.reduce((n: number, p: any) => n + Object.values(p.stock).reduce((a: number, b: any) => a + b, 0), 0);
  want('3 once it has passed, no one is still sheltering', R.list.every((r: any) => r.task?.kind !== 'shelter'));
  want('3 the beds and the rocky bottom are torn up', grass1.every((g: number, i: number) => g < grass0[i] * 0.5 + 1e-6) && stock1 <= stock0 / 2 + R.patches.length, `grass ${grass0.map((g: number) => g.toFixed(2))} → ${grass1.map((g: number) => g.toFixed(2))}, prey ${stock0} → ${stock1}`);
  want('3 …and it is in their record that it passed', R.list.every((r: any) => r.diary.some((e: any) => e.key === 'weather' && /台風が過ぎた/.test(e.text))));
}
{ // 4 the sea in the record: the swell, its period and where it comes from, and the thunder rule
  const ty = islandWeather(Date.parse('2026-10-08T16:40:00Z'))!;   // (island July 24th: the record's typhoon, 2024-07-24)
  want('4 every hour has its sea: wave, swell, period, direction', [ty.wave, ty.swell, ty.swellPeriod, ty.swellDir].every((x) => typeof x === 'number'), `wave ${ty.wave} m, swell ${ty.swell} m every ${ty.swellPeriod} s from ${ty.swellDir}°`);
  want('4 the typhoon\'s sea is high and long', (ty.wave ?? 0) > 3 && (ty.swellPeriod ?? 0) >= 9);
  // (a long swell runs ahead of the deep ones: in the two island days before they came in, the swell's period passed 9 s
  // — for most, not all; and long swells come with no storm after them too)
  const W2 = islandWait(48 * 3.6e6); let was = false, last = -1e15, deep = 0, ahead = 0;
  for (let t = t0; t < t0 + 84 * 86400e3; t += 300e3) {
    const w = islandWeather(t)!;
    if (w.typhoon && !was && t - last > W2 && w.pressure < 996) { deep++; for (let u = t - W2; u < t; u += 300e3) if ((islandWeather(u)!.swellPeriod ?? 0) >= 9) { ahead++; break; } }
    if (w.typhoon) last = t; was = w.typhoon;
  }
  want('4 most deep typhoons have a long swell before them', deep >= 3 && ahead * 2 > deep, `${ahead} of ${deep}`);
  let n = 0, th = 0; for (let t = t0; t < t0 + 28 * 86400e3; t += 1800e3) { n++; if (islandWeather(t)!.thunder) th++; }
  want('4 thunder now and then, not often (a typhoon in heavy rain, or a downpour)', th > 0 && th / n < 0.02, `${(th / n * 100).toFixed(2)}% of the time`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
