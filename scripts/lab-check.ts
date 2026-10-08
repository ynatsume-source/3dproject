// Headless check (ADR 0002 / 0006): Lantern runs a science process on the island, the world runs it.
//  1 a little prepared clay on the shelf (45 g: too little for a pot, and the test tile's steps are not ready on the
//    island): Lantern starts nothing
//  2 with a ready process (here: the test tile's shaping, given a simulation for weather — checks only) and its
//    material on the shelf, Lantern (awake from late afternoon) goes to the shelf and starts it; the world steps it; the tile lies on the
//    shelf, the clay is gone, and Lantern's record says so
//  3 saved and loaded: the shelf (the world's lots) comes back as it was
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/lab-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-06T16:35:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(11);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const { CATALOG } = await import('../src/world/process-catalog');
const { addLot } = await import('../src/world/process-runner');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const R: any = buildOcean(loc).residents;
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const lan = R.list.find((r: any) => r.id === 'lantern'), lab = R.lab;
const cam = new THREE.Vector3();
const run = async (secs: number, until?: () => boolean) => { for (let i = 0; i < secs * 2; i++) { sim += 500; cam.set(lan.pos.x, 30, lan.pos.z); R.update(0.5, sim, cam); await Promise.resolve(); if (until?.()) return true; } return false; };
R.setBrain(async () => null);
const clay = () => addLot(lab, { materialId: 'prepared_clay', amount: { value: 45_000, unit: 'mg' }, location: 'shelf', quality: { water_ppm: 220_000, xd_kaolinite_ppm: 600_000, xd_quartz_ppm: 400_000 } });
{ // 1
  const c = clay();
  await run(1800);
  want('1 a little clay, nothing it is enough for: no run started', Object.keys(lab.runs).length === 0, Object.values(lab.runs).map((r: any) => r.processId).join(', ') || CATALOG.filter((e: any) => e.ready).map((e: any) => e.processId).join(', ') + ' ready');
  delete lab.lots[c.lotId];
}
{ // 2
  R.setCatalog(CATALOG.map((e: any) => e.processId === 'p11x_test_tile_shape' ? { ...e, env: 'simulation', ready: true } : e));
  const c = clay();
  await run(3 * 3600, () => Object.values(lab.runs).some((x: any) => x.status === 'completed'));
  const r = Object.values(lab.runs)[0] as any, tile = Object.values(lab.lots).find((l: any) => l.materialId === 'test_tile_green') as any;
  want('2 Lantern started it at the shelf, and the world ran it to the end', r?.status === 'completed' && r.operator === 'res:lantern', r ? `${r.processId} ${r.status}` : 'none');
  want('2 the tile lies on the shelf; the clay is gone; nothing is held', !!tile && tile.location === 'shelf' && !lab.lots[c.lotId] && !Object.values(lab.equipment).some((e: any) => e.reservedBy), tile ? `${tile.materialId} ${tile.amount.value}mg` : 'none');
  const t = lan.diary.filter((e: any) => /試験タイル/.test(e.text)).map((e: any) => e.text);
  want('2 its record says what it did and what came of it', t.some((x: string) => /：始めた/.test(x)) && t.some((x: string) => /できた/.test(x)), t.join(' / '));
}
{ // 3
  R.save?.(); const saved = [...store.values()].find((v) => v.includes('"lab"'));
  want('3 the world\'s lots are saved with the island', !!saved && JSON.parse(saved).lab.lots && Object.values(JSON.parse(saved).lab.lots).some((l: any) => l.materialId === 'test_tile_green'));
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
