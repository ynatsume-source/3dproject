// Headless check (the husks' pool at the tide's edge, science 2026-10-20 (c); ADR 0009). On the residents' island as built:
//  1 the pool at the lagoon's (or the sea's) edge, its ground about −0.2 m (under the tide 60% of the year), a dry spot
//    to stand on within reach; a pool saved before (no ground, no standing spot) placed again, its id kept
//  2 the tide's reach: only the pool (and the husks soaking in it) below the year's highest tide (+0.91 m) and the
//    waves' run-up (0.2 m); every other worksite and every lot above it; husks taken out carried up to the worksite
//  3 the pool's time in spans of a world minute, each under the water or not by the sea at its middle (the sea ≥ the
//    ground + 5 cm): low water is not counted; closed twelve hours and loaded, the same spans and the same time under
//    as staying open
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/husk-tide-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-06T10:00:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(7);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const { tide } = await import('../src/time/astro');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const oc: any = buildOcean(loc);
const { makeHuskHost, emptyHuskHostState, IMMERSED_M, POOL_REACH_M } = await import('../src/robots/husk-host');
const { addLot, emptyLedger } = await import('../src/world/process-runner');

let bad = 0;
const want = (what: string, ok: boolean, got: unknown = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const R = oc.residents, W = oc.water, HIGH = 0.91, RUNUP = 0.2;
{ // 1
  const p = R.huskSites().pool, g = loc.f(p.x, p.z), sg = loc.f(p.stand[0], p.stand[1]);
  want('1 the pool at the lagoon\'s or the sea\'s edge, about −0.2 m', g >= -0.26 && g <= -0.14 && Math.abs(p.ground - g) < 1e-9 && ['sea', 'lagoon'].includes(W.at(p.x, p.z)), `${g.toFixed(2)} m, ${W.at(p.x, p.z)}`);
  want('1 a dry spot to stand on, within reach', sg >= 0.45 && Math.hypot(p.stand[0] - p.x, p.stand[1] - p.z) <= POOL_REACH_M, `${sg.toFixed(2)} m, ${Math.hypot(p.stand[0] - p.x, p.stand[1] - p.z).toFixed(1)} m off`);
  const st: any = emptyHuskHostState(); st.sites = { pool: { id: 'site:husk-pool', x: 61, z: -85 }, work: { id: 'site:husk-work', x: 63.8, z: -144.4, reachM: 2 } };
  const old = makeHuskHost({ lab: emptyLedger('w', 'old'), state: () => st, dev: [], placeSites: () => { throw new Error('placed anew'); }, repool: R.huskRepool, seaAt: () => 0 });
  const q = old.sites().pool;
  want('1 a pool saved before: placed again, its id kept', q.id === 'site:husk-pool' && q.ground !== undefined && !!q.stand && Math.hypot(q.x - p.x, q.z - p.z) < 1e-9, `(${q.x.toFixed(1)}, ${q.z.toFixed(1)})`);
}
{ // 2 (a raft standing, so the sail's places are found and their trees' leaves put on them)
  R.village.raft.parts = 99; R.update(0.5, sim, new THREE.Vector3(0, 50, 0));
  const spots = R.worksiteSpots(), low = Object.entries(spots).filter(([id, s]: any) => id !== 'site:husk-pool' && loc.f(s.x, s.z) < HIGH + RUNUP);
  want('2 every other worksite above the highest tide and its run-up', low.length === 0, Object.entries(spots).filter(([id]) => id !== 'site:husk-pool').map(([id, s]: any) => `${id.replace('site:', '')} ${loc.f(s.x, s.z).toFixed(2)}`).join(', '));
  const at = (l: any) => spots[l.location], lowLots = Object.values(R.lab.lots).filter((l: any) => at(l) && l.location !== 'site:husk-pool' && loc.f(at(l).x, at(l).z) < HIGH + RUNUP);
  want('2 every lot at a worksite above it too', lowLots.length === 0, `${Object.values(R.lab.lots).filter((l: any) => at(l)).length} lots at worksites`);
}
{ // 3 (in a ledger of its own: the island's tide as the sea, the pool at −0.2 m)
  const sea = (ms: number) => tide(ms, loc.lat, loc.lon, loc.tide.amp, loc.tide.lag, loc.tide.diurnal).h;
  const pool = { id: 'site:husk-pool', x: 0, z: 0, ground: -0.2, stand: [2, 0] as [number, number] }, work = { id: 'site:husk-work', x: 20, z: 0, reachM: 2 };
  const t0 = Date.parse('2026-10-06T00:00:00Z'), HOURS = 12;
  const run = (every: number) => {
    const L = emptyLedger('w', 'tide'), st = emptyHuskHostState();
    addLot(L, { materialId: 'coconut_husk', amount: { value: 2_400_017, unit: 'mg' }, location: 'shelf', quality: { count: 2, water_ppm: 300_000, ash_dry_ppm: 20_000, history_complete: 1 } });
    const H = makeHuskHost({ lab: L, state: () => st, dev: [], placeSites: () => ({ pool: { ...pool }, work }), repool: () => ({ ...pool }), seaAt: sea });
    H.putInPool('dot', t0);
    for (let t = t0 + every; t <= t0 + HOURS * 3600e3; t += every) H.tick(t);
    const r: any = Object.values(L.runs)[0];
    return { L, H, frames: r.state.data.frames as any[] };
  };
  const open = run(10_000), closed = run(HOURS * 3600e3);
  const under = (fr: any[]) => fr.filter((f) => f.immersed).reduce((a, f) => a + f.toIslandMs - f.fromIslandMs, 0), all = (fr: any[]) => fr.reduce((a, f) => a + f.toIslandMs - f.fromIslandMs, 0);
  const expect = open.frames.every((f) => f.immersed === (sea(Math.floor((f.fromWorldMs + f.toWorldMs) / 2)) >= pool.ground + IMMERSED_M));
  want('3 each minute under the water or not by the sea at its middle', expect && open.frames.every((f) => f.toWorldMs - f.fromWorldMs === 60_000), `${open.frames.length} spans`);
  const u = under(open.frames), a = all(open.frames);
  want('3 low water not counted', u > 0 && u < a, `${(u / 3600e3).toFixed(1)} of ${(a / 3600e3).toFixed(1)} island hours under (${(100 * u / a).toFixed(0)}%)`);
  want('3 closed twelve hours and loaded: the same spans, the same time under', JSON.stringify(closed.frames.map((f) => [f.fromWorldMs, f.toWorldMs, f.immersed])) === JSON.stringify(open.frames.map((f) => [f.fromWorldMs, f.toWorldMs, f.immersed])) && under(closed.frames) === u, `${(under(closed.frames) / 3600e3).toFixed(1)} h`);
  // (taken out: up to the moment, the last part-minute too; the husks carried up to the worksite, none left in the water)
  const H = open.H, L = open.L, out = t0 + HOURS * 3600e3 + 25_000; H.takeOut('dot', out);
  const fr: any[] = (Object.values(L.runs)[0] as any).state.data.frames, wet = Object.values(L.lots).filter((l: any) => l.materialId === 'wet_unseparated_coconut_husk') as any[];
  want('3 taken out: the time up to the moment it lifted them', fr.at(-1).toWorldMs === out, `${(out - fr.at(-1).fromWorldMs) / 1000} s last`);
  want('2 taken out: carried up to the worksite, none left at the pool', wet.length > 0 && wet.every((l) => l.location === work.id) && !Object.values(L.lots).some((l: any) => l.location === pool.id), wet.map((l) => l.location).join(','));
}
console.log(bad ? `FAIL ${bad}` : 'all ok');
process.exit(bad ? 1 : 0);
