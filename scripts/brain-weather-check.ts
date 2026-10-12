// Headless check (what a mind is told of the weather, 2026-10-12): the residents' minds hear the weather as a body
// meets it, never the record's measured numbers (ADR 0006: no hidden values; reading pressure is Lantern's own work):
//  1 a mild day (wind 4.7 m/s, 1009 hPa in the record): Dot's and Rakko's input have the sky and the wind in words, no
//    m/s, no hPa and no pressure key; the felt warmth in words when the air was measured
//  2 the air not measured: no felt word for it (an unknown is not a feeling), the sky and wind still in words
//  3 too much wind to cross: the crossing refused in words, and what Dot is told of it afterwards carries no m/s
//  4 Lantern's own gauge (its marks, its guesses) stays its own: no other resident's input carries it
//  5 a typhoon comes with no instrument read: the diary has it in words, and so has the day's post prompt (journal/
//    write.ts, the AI a stand-in that only records the prompt); the viewer's log keeps the station's numbers
//  6 green firewood piled together: the diary (and so the post's prompt) has the weighed mass, not the model's water %
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/brain-weather-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { writePost } from '../src/journal/write';
import { addLot } from '../src/world/process-runner';

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
{ // 5
  const events: string[] = []; R.onEvent = (_k: string, t: string) => events.push(t);
  wx = day({ typhoon: true, pressure: 995, pressureMeasured: 995, wind: 22, windMeasured: 22, gust: 30, rain: 12, rainMeasured: 12, cloud: 1 });
  const t0 = now; await run(3, () => false);
  const lantern = byId('lantern'), lines = lantern.diary.filter((d: any) => d.at >= t0 && /台風が来た/.test(d.text));
  const inp = { who: 'lantern', name: lantern.v.name, profile: 'テスト', day: '2026-10-06', entries: lantern.diary.filter((d: any) => d.at >= t0).map((d: any) => ({ time: '12:00', text: d.text, key: d.key })), photos: [], talks: [] };
  const prompts: string[] = [];
  await writePost(inp, async (system: string, user: string) => { prompts.push(system + '\n' + user); return null; }, 'stub');
  want('5 a typhoon in the diary in words (no instrument read), and so in the post\'s prompt', lines.length === 1 && numbers(lines).length === 0 && /風が強い/.test(lines[0].text) && prompts.length === 1 && /台風が来た/.test(prompts[0]) && numbers(prompts[0]).length === 0, `${lines.map((d: any) => d.text).join(' / ')} | prompt ${numbers(prompts[0] ?? '').join(' ') || 'no numbers'}`);
  want('5 the viewer\'s log still has the station\'s numbers', events.some((t) => /台風が来た.*995hPa.*30m\/s/.test(t)), events.find((t) => /台風/.test(t)) ?? '(none)');
}
{ // 6
  wx = day({}); await run(5, () => false);
  for (const kg of [6, 9]) addLot(R.lab, { materialId: 'firewood', amount: { value: kg * 1e6, unit: 'mg' }, location: 'shelf', quality: { water_ppm: 450_000, history_complete: 1 } });
  const t0 = now, who = () => R.list.find((r: any) => r.diary.some((d: any) => d.at >= t0 && /薪を1つの山にまとめた/.test(d.text)));
  await run(16 * 3600, () => !!who());   // (Lantern piles the wood, and works by night)
  const r = who(), line = r?.diary.find((d: any) => d.at >= t0 && /薪を1つの山にまとめた/.test(d.text));
  const prompts: string[] = [];
  if (r) await writePost({ who: r.id, name: r.v.name, profile: 'テスト', day: '2026-10-06', entries: [{ time: '12:00', text: line.text, key: line.key }], photos: [], talks: [] }, async (system: string, user: string) => { prompts.push(system + '\n' + user); return null; }, 'stub');
  const pile = Object.values(R.lab.lots).find((l: any) => l.materialId === 'firewood' && l.amount.value === 15e6) as any;
  want('6 firewood piled: the weighed mass in the diary and the post\'s prompt, no model water %', !!line && /15kg/.test(line.text) && !/水分|%/.test(line.text) && prompts.length === 1 && !/水分\d|\d+%/.test(prompts[0]) && pile?.quality?.water_ppm === 450_000, `${line?.text ?? '(not piled)'} | lot water_ppm ${pile?.quality?.water_ppm}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
