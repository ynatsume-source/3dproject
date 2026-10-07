// Headless check (owner, 2026-10-07: clearing land — the residents fell the island's own trees), on the real island of
// Dot's world, with a stand-in mind that takes the step it is given.
//  1 the grown trees near home are offered to fell: which kind, how tall, how far; two not of the windbreak and the
//    nearest one that is, which says so
//  2 felled: the tree is gone (not in the way, no longer offered); the branches as green firewood on the shelf; in its
//    record; kept in the save
//  3 the windbreak: three trees felled to windward of the house, and a typhoon takes another course of thatch
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/fell-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-06T10:00:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(7);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const { HOUSE_N } = await import('../src/robots/house');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const O: any = buildOcean(loc), R: any = O.residents;
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const dot = R.list.find((r: any) => r.id === 'dot'), dm = R.mind(dot), V = R.village;
const cam = new THREE.Vector3();
const calm: any = { ok: true, at: 0, cloud: 0.2, rain: 0, rainMeasured: 0, code: 1, wind: 3, windMeasured: 3, windDir: 90, gust: 5, pressure: 1012, typhoon: false, source: 'test', record: { station: 'test', at: '' } };
let wx = calm;
const run = async (secs: number, until?: () => boolean) => { for (let i = 0; i < secs * 2; i++) { sim += 500; cam.set(dot.pos.x, 30, dot.pos.z); R.setWeather(wx); R.update(0.5, sim, cam); await Promise.resolve(); await Promise.resolve(); if (until?.()) return true; } return false; };
let pick: (i: any) => string | undefined = () => undefined, last: any = null;
R.setBrain(async (i: any) => { if (i.who !== 'dot') return null; last = i; return { goal: { text: 'テスト', why: 'テスト' }, plan: [pick(i) ?? 'look:shore'] }; });
const think = () => { dm.why = 'テスト'; dm.lastCall = -1e12; };
dot.stats.built = 24; dot.battery = 1;
const fells = () => (last?.options ?? []).filter((o: any) => o.action === 'fell');

{ // 1
  pick = () => undefined; think(); await run(5);
  const f = fells();
  want('1 the grown trees near home are offered to fell, with kind, height and distance; one of the windbreak', f.length === 3 && f.filter((o: any) => /風上/.test(o.label)).length === 1 && f.every((o: any) => /林の木を切り倒す（.+、高さ約\d+m、\d+m先。丸太[23]本と薪/.test(o.label)), f.map((o: any) => o.label).join(' / ').slice(0, 300));
}
let felled: any = null;
{ // 2
  const o = fells()[0], [x, z] = o.id.slice(5).split(',').map(Number);
  const fire0 = Object.values(R.lab.lots).filter((l: any) => l.materialId === 'firewood').length;
  pick = (i) => i.options.find((p: any) => p.id === o.id)?.id; think();
  await run(900, () => V.felled.length > 0);
  felled = V.felled[0]; pick = () => undefined; think(); await run(5);   // (what it is offered now)
  const solidsHere: string[] = []; R.solids.each(x, z, 1, (s: any) => { if (Math.hypot(s.x - x, s.z - z) < 0.3) solidsHere.push(s.kind); });
  want('2 felled: the tree is gone, not in the way', !!felled && Math.hypot(felled.x - x, felled.z - z) < 0.01 && !solidsHere.includes('trunk') && !fells().some((p: any) => p.id === o.id), solidsHere.join(',') || 'clear');
  want('2 the branches as green firewood on the shelf', Object.values(R.lab.lots).filter((l: any) => l.materialId === 'firewood').length > fire0);
  want('2 in its record', dot.diary.some((e: any) => /林の.+を切り倒した（高さ約\d+m。丸太[23]本/.test(e.text)), dot.diary.filter((e: any) => /切り倒した/.test(e.text)).map((e: any) => e.text)[0]);
  R.save(); const saved = JSON.parse([...store.values()].find((v) => v.includes('"felled"')) ?? '{}');
  want('2 kept in the save', saved.village?.felled?.length === 1);
}
{ // 3 the windbreak: the trees to the south-east of the house, where the typhoons blow from
  V.house.n = HOUSE_N; V.house.lost = 0; V.house.weighed = false;
  let n = 0;
  for (let k = 0; k < 8 && n < 3; k++) {
    pick = () => undefined; think(); await run(5);
    const o = fells().find((p: any) => /風上/.test(p.label)); if (!o) break;
    const before = V.felled.length; pick = (i) => i.options.find((p: any) => p.id === o.id)?.id; think();
    if (await run(900, () => V.felled.length > before)) n++;
  }
  pick = () => undefined;
  wx = { ...calm, typhoon: true, rain: 10, rainMeasured: 10, wind: 20, windMeasured: 20, pressure: 980 }; await run(30); wx = calm; await run(10);
  want('3 three felled to windward: a typhoon takes another course of thatch', n === 3 && V.house.lost === 2, `windward felled ${n}, thatch lost ${V.house.lost}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
