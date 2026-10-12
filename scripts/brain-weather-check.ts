// Headless check (what a mind is told of the weather, 2026-10-12): the residents' minds hear the weather as a body
// meets it, never the record's measured numbers (ADR 0006: no hidden values; reading pressure is Lantern's own work):
//  1 a mild day (wind 4.7 m/s, 1009 hPa in the record): Dot's and Rakko's input have the sky and the wind in words, no
//    m/s, no hPa and no pressure key; the felt warmth in words when the air was measured
//  2 the air not measured: no felt word for it (an unknown is not a feeling), the sky and wind still in words
//  3 too much wind to cross: the crossing refused in words, and what Dot is told of it afterwards carries no m/s
//  4 Lantern's own gauge (its marks, its guesses) stays its own: no other resident's input carries it
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/brain-weather-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';

let now = Date.parse('2026-10-06T03:00:00Z');   // (noon on the island)
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
Math.random = mulberry32(7);
const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
const seen: Record<string, any> = {};
R.setBrain(async (i: any) => { seen[i.who] = i; return null; });
const byId = (id: string) => R.list.find((r: any) => r.id === id);
const day = (o: any) => ({ ok: true, at: now, cloud: 0.2, rain: 0, rainMeasured: 0, code: 1, wind: 4.7, windMeasured: 4.7, windDir: 90, gust: 7, pressure: 1009, pressureMeasured: 1009, air: 31, humidity: 0.85, typhoon: false, thunder: false, source: 'test', record: { station: 'test', at: '' }, ...o });
let wx: any = day({});
const think = () => { for (const r of R.list) { const a = R.mind(r); if (a) { a.why = 'テスト'; a.lastCall = -1e12; } } };
const run = async (secs: number, until: () => boolean) => { for (let i = 0; i < secs * 2; i++) { now += 500; R.setWeather(wx); R.update(0.5, now, new THREE.Vector3(0, 50, 0)); for (const r of R.list) if (!r.sp.living) r.battery = 1; await Promise.resolve(); await Promise.resolve(); if (until()) return true; } return false; };
const numbers = (x: any) => JSON.stringify(x).match(/[\d.]+\s*(m\/s|hPa)|気圧/g) ?? [];
const WIND = /^(ほとんどない|弱い|やや強い|強い)$/;

{ // 1
  think(); await run(60, () => !!seen.dot && !!seen.rakko);
  for (const who of ['dot', 'rakko']) {
    const isl = seen[who]?.now?.island ?? {};
    want(`1 ${who}: the sky and the wind in words, no m/s, no hPa, no pressure`, !!seen[who] && isl.天気 === '晴れ' && WIND.test(isl.風 ?? '') && !('気圧' in isl) && numbers(seen[who]).length === 0, `${JSON.stringify(isl)} ${numbers(seen[who]).join(' ')}`);
  }
  want('1 the felt warmth in words when the air was measured', /蒸し暑い/.test(seen.dot?.now?.island?.体感 ?? ''), seen.dot?.now?.island?.体感 ?? '(none)');
}
{ // 2
  wx = day({ air: undefined, humidity: undefined }); delete seen.dot; think(); await run(60, () => !!seen.dot);
  const isl = seen.dot?.now?.island ?? {};
  want('2 the air not measured: no felt word for it; sky and wind still in words', !!seen.dot && !('体感' in isl) && isl.天気 === '晴れ' && WIND.test(isl.風 ?? ''), JSON.stringify(isl));
}
{ // 3
  wx = day({ wind: 9.4, windMeasured: 9.4, gust: 14 });
  const dot = byId('dot');
  dot.task = { kind: 'voyage', opt: 'sail:south-near', label: '南の島へ渡る', arrived: true, data: { isle: 'south-near' }, at: now };
  await run(5, () => dot.task?.kind !== 'voyage');
  const told = R.mind(dot).results.slice(-3);
  want('3 the crossing refused for the wind, in words', dot.task?.kind !== 'voyage' && told.some((x: any) => /風が強い/.test(JSON.stringify(x))) && numbers(told).length === 0, JSON.stringify(told.map((x: any) => x.detail ?? x)));
  wx = day({}); delete seen.dot; think(); await run(60, () => !!seen.dot);
  want('3 what Dot is told afterwards carries no m/s or hPa', !!seen.dot && numbers(seen.dot).length === 0, numbers(seen.dot ?? {}).join(' '));
}
{ // 4
  R.village.gaugeLog.push({ at: now, processId: 'm02x_air_barometer_test', mark: 37, airC: 30 });
  for (const k of Object.keys(seen)) delete seen[k];
  think(); await run(60, () => ['dot', 'rakko', 'kame'].every((w) => !R.mind(byId(w)) || !!seen[w]));
  const others = Object.entries(seen).filter(([w]) => w !== 'lantern');
  want('4 no other resident is given Lantern\'s gauge', others.length > 0 && others.every(([, i]) => !('guess' in (i.now ?? {})) && !/m02x|目盛り|gauge/.test(JSON.stringify(i))), others.map(([w]) => w).join(','));
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
