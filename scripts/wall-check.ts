// Headless check (dwelling, step 3 — docs/proposals/sumika-2026-10-07.md): on the real island of Dot's world, with a
// stand-in mind that takes the step it is given.
//  1 Rakko's quiet place: nothing until it has known a rough sea; then coral stones dived for and set in a ring in the
//    shallows near its home; whole, it rests there when the sea is rough, and feels it little there
//  2 Kamemaru's ledge: once it has known a rough sea, it finds where the bottom drops away near its home, says so, and
//    goes there when the sea is rough
//  3 the stone wall: once the house has its walls, Rakko brings stones to the beach and Dot lays them to windward
//  4 whole, a typhoon takes no thatch (unweighted, its windbreak felled); kept in the save
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/wall-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-06T10:00:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(11);
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
const by = (id: string) => R.list.find((r: any) => r.id === id), dot = by('dot'), rakko = by('rakko'), kame = by('kame'), V = R.village;
const cam = new THREE.Vector3();
const calm: any = { ok: true, at: 0, cloud: 0.2, rain: 0, rainMeasured: 0, code: 1, wind: 3, windMeasured: 3, windDir: 90, gust: 5, pressure: 1012, wave: 0.5, typhoon: false, source: 'test', record: { station: 'test', at: '' } };
const rough = { ...calm, wind: 9, windMeasured: 9, wave: 3.5 };
let wx = calm, watchOn = rakko;
const fed = () => { for (const r of [rakko, kame]) { r.hunger = Math.min(r.hunger, 0.2); r.sleepy = 0; } dot.battery = 1; dot.wear = 0; };
const run = async (secs: number, until?: () => boolean) => { for (let i = 0; i < secs * 2; i++) { sim += 500; fed(); cam.set(watchOn.pos.x, 30, watchOn.pos.z); R.setWeather(wx); R.update(0.5, sim, cam); await Promise.resolve(); await Promise.resolve(); if (until?.()) return true; } return false; };
const plans: Record<string, (i: any) => string[] | null> = {};
let last: Record<string, any> = {};
R.setBrain(async (i: any) => { last[i.who] = i; const p = plans[i.who]?.(i); return p ? { goal: { text: 'テスト', why: 'テスト' }, plan: p } : null; });
const think = (r: any) => { const m = R.mind(r); if (m) { m.why = 'テスト'; m.lastCall = -1e12; } };
const ids = (who: string) => (last[who]?.options ?? []).map((o: any) => o.id);

{ // 1
  plans.rakko = () => ['float:sea']; think(rakko); await run(10);
  want('1 calm, never rough yet: no quiet place to make', !ids('rakko').includes('seastone:sea') && !V.nest.at, ids('rakko').filter((x: string) => /stone|nest/.test(x)).join(','));
  wx = rough; rakko.wet = true; await run(30, () => !!rakko.mo.roughFelt); wx = calm;
  plans.rakko = (i) => i.options.some((o: any) => o.id === 'nest:sea' && o.ready !== false) ? ['nest:sea'] : i.options.some((o: any) => o.id === 'seastone:sea' && o.ready !== false) ? ['seastone:sea', 'nest:sea'] : ['float:sea'];
  think(rakko); await run(900, () => ids('rakko').includes('seastone:sea'));
  want('1 a rough sea known: stones for a quiet place offered', ids('rakko').includes('seastone:sea') && !!V.nest.at, V.nest.at ? V.nest.at.map((v: number) => v.toFixed(0)).join(',') : 'none');
  let k = 0; while (V.nest.n < 10 && k++ < 40) { const n0 = V.nest.n; think(rakko); await run(400, () => V.nest.n > n0); }
  want('1 ten stones dived for and set in a ring in the shallows', V.nest.n === 10 && rakko.diary.some((e: any) => /石の囲いができた/.test(e.text)), `${V.nest.n}/10`);
  plans.rakko = () => null; rakko.task = null; wx = rough; await run(120);
  const d = Math.hypot(rakko.pos.x - V.nest.at[0], rakko.pos.z - V.nest.at[1]);
  want('1 the sea rough: it rests there, and feels it little', d < 2.5 && R.shelterK(rakko) < 0.5, `${d.toFixed(1)} m from it, ${R.shelterK(rakko)}`);
  wx = calm;
}
{ // 2
  watchOn = kame; wx = rough; await run(3600, () => !!kame.mo.roughFelt); wx = calm;   // (it may have been ashore, basking)
  want('2 Kamemaru, having known the rough sea too: its ledge found and told', !!V.kameBed && kame.diary.some((e: any) => /岩棚の下の寝場所/.test(e.text)), kame.diary.find((e: any) => /岩棚/.test(e.text))?.text ?? (kame.mo.roughFelt ? 'felt, none found' : 'not felt'));
  kame.task = null; wx = rough; await run(400, () => !!V.kameBed && Math.hypot(kame.pos.x - V.kameBed[0], kame.pos.z - V.kameBed[1]) < 3);
  const d = V.kameBed ? Math.hypot(kame.pos.x - V.kameBed[0], kame.pos.z - V.kameBed[1]) : 1e9;
  want('2 the sea rough: it goes under its ledge, and feels it less there', d < 3 && R.shelterK(kame) < 1, `${d.toFixed(1)} m, ${R.shelterK(kame)}`);
  wx = calm;
}
{ // 3
  watchOn = dot;
  dot.stats.built = 24; V.house.n = HOUSE_N; V.house.lost = 0; V.house.weighed = false;
  plans.rakko = (i) => i.options.some((o: any) => o.id === 'stonedrop:beach' && o.ready !== false) ? ['stonedrop:beach'] : i.options.some((o: any) => o.id === 'seastone:sea' && o.ready !== false) ? ['seastone:sea', 'stonedrop:beach'] : ['float:sea'];
  plans.dot = (i) => i.options.some((o: any) => o.id === 'wall:next' && o.ready !== false) ? ['wall:next'] : i.options.some((o: any) => o.id === 'wallfetch:beach') ? ['wallfetch:beach', 'wall:next'] : ['look:shore'];
  rakko.task = null; dot.task = null; dot.holding = '';   // (hands free)
  for (let k = 0; k < 30 && V.wall.n < 3; k++) { think(rakko); think(dot); await run(300); }
  want('3 Rakko brings stones to the beach, Dot lays them to windward of the house', V.wall.n >= 3 && rakko.diary.some((e: any) => /石置き場に運んだ/.test(e.text)) && dot.diary.some((e: any) => /石垣に石を積んだ/.test(e.text)), `wall ${V.wall.n}/24, on the beach ${V.wall.pile}`);
}
{ // 4
  plans.rakko = () => null; plans.dot = () => null;
  V.wall.n = 24; V.house.weighed = false; V.house.lost = 0;
  wx = { ...calm, typhoon: true, rain: 10, rainMeasured: 10, wind: 20, windMeasured: 20, pressure: 980, wave: 5 }; await run(30); wx = calm; await run(10);
  want('4 whole: a typhoon takes no thatch, though the roof was not weighed down', V.house.lost === 0, `thatch lost ${V.house.lost}`);
  R.save(); const saved = JSON.parse([...store.values()].find((v) => v.includes('"wall"')) ?? '{}');
  want('4 kept in the save', saved.village?.wall?.n === 24 && saved.village?.nest?.n === 10 && !!saved.village?.kameBed);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
