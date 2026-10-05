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
  want('2 the record is there, from the archive', !!w && w.ok && /ERA5/.test(w.source) && w.pressure > 900, w ? `${w.pressure} hPa` : 'none');
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
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
