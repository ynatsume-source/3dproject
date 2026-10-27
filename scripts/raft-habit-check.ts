// Headless check (science on #177: with the model away, no raft was lashed and no crossing came in 72 hours, because
// lash:raft and voyage: were only ever chosen by Dot's mind). On the real island of Dot's world, Dot by habit alone:
//  1 a clear morning: it looks out to sea and puts the islands on its map (#177's habit)
//  2 a log in hand, the raft not whole and an island on the map: shaped and lashed to the raft, not put on the hut —
//    six times, a raft
//  3 the raft whole, a clear day after the morning gathering, but a strong wind: the world turns it back, and it does
//    not go again for three hours
//  4 a calm clear morning after the gathering: it crosses to the island it has seen, and is back with what is there
//  5 the island reached: no crossing again by habit (the house's trips for bamboo and clay are the mind's)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/raft-habit-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-06T07:30:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(11);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const { ISLES } = await import('../src/world/planet-map');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const R: any = buildOcean(loc).residents;
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const dot = R.list.find((r: any) => r.id === 'dot'), dm = R.mind(dot);
const cam = new THREE.Vector3();
const run = async (secs: number, until?: () => boolean) => { for (let i = 0; i < secs * 2; i++) { sim += 500; cam.set(dot.pos.x, 30, dot.pos.z); R.update(0.5, sim, cam); await Promise.resolve(); await Promise.resolve(); if (until?.()) return true; } return false; };
R.setBrain(null);   // (no mind's answers: its habits only)
const calm = { ok: true, at: 0, cloud: 0.2, rain: 0, code: 1, wind: 3, windDir: 90, gust: 5, pressure: 1012, typhoon: false, source: 'test', record: { station: 'test', at: '' } };
R.setWeather(calm);
const V = R.village, near = ISLES.find((i: any) => i.id === 'south-near')!;
// (each goal it takes up, by habit: what it set out to do)
const goals: string[] = []; { const seen = new Set<string>(), u = R.update; R.update = (...a: any[]) => { const x = u(...a), g = dm.goal; if (g && !seen.has(g.id)) { seen.add(g.id); goals.push(g.text); } return x; }; }
{ // 1
  await run(4 * 3600, () => Object.keys(V.map.seen).length > 0);
  want('1 a clear morning: the islands on its map, by habit', Object.keys(V.map.seen).length > 0 && !!V.map.seen[near.id], Object.keys(V.map.seen).join(' '));
}
{ // 2
  const built0 = dot.stats.built;
  for (let k = 0; k < 12 && V.raft.parts < 6; k++) { const p = V.raft.parts; if (!dot.holding) dot.holding = 'wood'; await run(1800, () => V.raft.parts > p); }
  want('2 logs shaped and lashed to the raft, not put on the hut: a raft', V.raft.parts === 6 && dot.diary.some((e: any) => /筏ができた/.test(e.text)) && dot.stats.built === built0, `${V.raft.parts}/6, hut ${built0} → ${dot.stats.built}; ${goals.filter((g) => /筏/.test(g)).slice(0, 3).join(' / ')}`);
}
{ // 3
  dot.holding = ''; dot.battery = 1; dot.task = null; sim = Date.parse('2026-10-07T09:40:00+09:00');
  R.setWeather({ ...calm, wind: 11 });
  await run(2 * 3600, () => dm.results.some((r: any) => r.optionId === `voyage:${near.id}` && r.outcome === 'blocked'));
  const blocked = dm.results.filter((r: any) => r.optionId === `voyage:${near.id}`), at = blocked[0]?.at ?? sim;
  await run(2.5 * 3600);
  const again = dm.results.filter((r: any) => r.optionId.startsWith('voyage:') && r.at > at);
  want('3 a strong wind: turned back by the world, and not again within three hours', blocked[0]?.outcome === 'blocked' && /風が強い/.test(blocked[0]?.detail ?? '') && !again.length && !V.map.reached[near.id], `${blocked[0]?.detail ?? 'none'}; again ${again.length}`);
}
{ // 4
  R.setWeather(calm); dot.holding = ''; dot.battery = 1; dot.task = null; sim = Date.parse('2026-10-08T09:40:00+09:00');
  let away = false;
  await run(6 * 3600, () => { if (dot.task?.kind === 'voyage' && dot.task.data?.started) away = true; return !!V.map.reached[near.id]; });
  want('4 a calm clear morning: it crosses by habit to the island it has seen, and is back', away && !!V.map.reached[near.id] && goals.includes('筏で島へ渡る') && dot.diary.some((e: any) => /にたどり着いて戻った/.test(e.text)), `${goals.slice(-4).join(' / ')}`);
}
{ // 5
  sim = Date.parse('2026-10-09T09:40:00+09:00'); dot.battery = 1; dot.holding = ''; dot.task = null;
  const t0 = sim, crossed: string[] = [];
  await run(4 * 3600, () => { if (dot.task?.kind === 'voyage') crossed.push(dot.task.data?.isle); return false; });
  const later = dm.results.filter((r: any) => r.optionId.startsWith('voyage:') && r.at > t0);   // (its results kept are the last sixty: counted by time)
  want('5 the island reached: no crossing again by habit', !later.length && !crossed.length, later.map((r: any) => `${r.optionId} ${r.outcome}`).join(' / '));
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
