// Science team soak on the real island (2026-10-21): Kayama's land and water as built (buildOcean), the residents' minds a
// seeded stand-in that prefers the husk / cord / sail / voyage work; HOURS open, CLOSE closed, HOURS again. Hour rows.
import './node-land';
import * as THREE from 'three';
import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync } from 'node:fs';
let now = Date.parse('2026-12-01T00:00:00Z');
Date.now = () => now;
const store = new Map<string, string>(), KEY = 'seaglass.residents.v1';
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(11);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const { tide: tideFn } = await import('../src/time/astro');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const { loadIslandWeather, islandWeather } = await import('../src/world/island-time');
const { addLot } = await import('../src/world/process-runner');
const { writeCordBundle } = await import('../src/world/coir-cord-lots');
const { BAMBOO_SOUTH } = await import('../src/world/planet-map');
await loadIslandWeather();
const pickRng = mulberry32(2026);
const WORK = /^(husk|soak|takeout|beat|clear|cord|sail|voyage|survey|lash|craft|gather)/;
let calls = 0; const picks: Record<string, number> = {};
const keyOf = (id: string) => /^(sail|cord|voyage)/.test(id) ? id.split(':').slice(0, 2).join(':') : id.split(':')[0];
const make = () => {
  const oc: any = buildOcean(loc); const R: any = oc.residents;
  R.setBrain(async (i: any) => { calls++; const o = i.options ?? []; if (!o.length) return null;
    const ready = o.filter((x: any) => x.ready !== false), work = ready.filter((x: any) => WORK.test(x.id)), pool = work.length && pickRng() < 0.6 ? work : (ready.length ? ready : o), p = pool[Math.floor(pickRng() * pool.length)];
    picks[keyOf(p.id)] = (picks[keyOf(p.id)] ?? 0) + 1; return { goal: { text: 'テスト', why: 'テスト' }, plan: [p.id] }; });
  if (process.env.SOAK_TIDE === '1') R.setSeaAt((ms: number) => tideFn(ms, loc.lat, loc.lon, loc.tide.amp, loc.tide.lag, loc.tide.diurnal).h);
  return R;
};
const IN = process.env.SOAK_IN, OUT = process.env.SOAK_OUT, HOURS = Number(process.env.SOAK_HOURS ?? '12'), CLOSE = Number(process.env.SOAK_CLOSE ?? '12');
if (IN) { const j = JSON.parse(readFileSync(IN, 'utf8')); for (const [k, v] of Object.entries(j.store)) store.set(k, v as string); now = j.now + CLOSE * 3600e3; }
let R: any = make();
const errors: string[] = [], hourRows: any[] = [];
let frameMax = 0, frameSum = 0, frames = 0;
const cam = new THREE.Vector3(0, 50, 0);
const W0 = performance.now();
const { Session } = await import('node:inspector');
const sess = new Session(); sess.connect();
const post = (m: string, a: any = {}) => new Promise<any>((ok, no) => sess.post(m, a, (e: any, r: any) => e ? no(e) : ok(r)));
await post('Profiler.enable'); await post('Profiler.start'); let profN = 0;
async function hourProfile(mean: number, at: string) {
  const { profile } = await post('Profiler.stop');
  if (mean > 10 && profN < 6) { writeFileSync(`${process.env.PROF_DIR}/slow-${at.replace(/[:T]/g, '-')}-${mean.toFixed(0)}ms.cpuprofile`, JSON.stringify(profile)); profN++; }
  await post('Profiler.start');
}
async function run(secs: number) {
  for (let i = 0; i < secs; i++) {
    now += 1000;
    const t = performance.now();
    try { R.update(1, now, cam); } catch (e: any) { if (errors.length < 50) errors.push(`${new Date(now).toISOString()} ${e?.stack?.split('\n').slice(0, 3).join(' | ') ?? e}`); }
    const dt = performance.now() - t; frameSum += dt; frames++; if (dt > frameMax) frameMax = dt;
    if (i % 60 === 0) R.setWeather(islandWeather(now));
    for (const r of R.list) if (!r.sp.living) r.battery = Math.max(r.battery, 0.7);
    await Promise.resolve(); await Promise.resolve();
    if ((now / 1000) % 3600 === 0) { const m = frameSum / Math.max(1, frames); row(); await hourProfile(m, hourRows.at(-1).at); }
  }
}
function row() {
  const L = R.lab, runs = Object.values(L.runs) as any[], byProc: Record<string, number> = {};
  for (const r of runs) byProc[`${r.processId}:${r.status}`] = (byProc[`${r.processId}:${r.status}`] ?? 0) + 1;
  const save = store.get(KEY) ?? '', mats: Record<string, number> = {};
  for (const l of Object.values(L.lots) as any[]) mats[l.materialId] = (mats[l.materialId] ?? 0) + 1;
  const v = R.village;
  hourRows.push({ at: new Date(now + 9 * 3600e3).toISOString().slice(5, 16), saveKB: Math.round(save.length / 1024), lots: Object.keys(L.lots).length, runs: runs.length,
    meanMs: +(frameSum / Math.max(1, frames)).toFixed(2), maxMs: +frameMax.toFixed(1), errors: errors.length,
    husk: mats.coir_fiber_bundle ?? 0, rope: mats.coir_rope ?? 0, mat: mats.sail_mat ?? 0, mast: mats.bamboo_mast ?? 0, rigs: Object.values(L.equipment).filter((e: any) => e.assembled?.parts?.some((p: any) => p.materialId === 'sail_mat')).length,
    voyages: (L.sailVoyages?.recent ?? []).length, sailing: Object.values(L.runs).filter((r: any) => r.processId === 'prototype_sail_voyage').length,
    raft: v.raft?.parts, raftAt: v.raft?.x != null, seen: Object.keys(v.map?.seen ?? {}).length, reached: Object.keys(v.map?.reached ?? {}).length, procs: byProc });
  process.stderr.write(JSON.stringify({ ...hourRows.at(-1), wall: Math.round((performance.now() - W0) / 1000), picksNow: Object.entries(picks).filter(([k]) => /^(sail|voyage)/.test(k)) }) + '\n');
  frameSum = 0; frames = 0; frameMax = 0;
}
if (!IN) {
  for (let k = 0; k < 6; k++) addLot(R.lab, { materialId: 'coconut_husk', amount: { value: 2_400_000, unit: 'mg' }, location: 'shelf', quality: { count: 2, water_ppm: 300_000, ash_dry_ppm: 20_000, history_complete: 1 } });
  addLot(R.lab, { materialId: 'bamboo', amount: { value: 7_000_000, unit: 'mg' }, location: 'shelf', quality: { ...BAMBOO_SOUTH } });
  for (let k = 0; k < 4; k++) { const b = writeCordBundle({ fiberDryMg: 72_000, pithDryMg: 7_000, waterMg: 5_000 } as any, 'shelf', 1); addLot(R.lab, { materialId: b.materialId, amount: b.amount, quality: b.quality, location: 'shelf' }); }
  R.list.find((r: any) => r.id === 'dot').stats.built = 99;
  if (process.env.SOAK_RAFT !== '0') R.village.raft.parts = 6;
}
const w0 = performance.now(); let catchMs = 0;
row();
await run(HOURS * 3600); R.save();
if (!IN && CLOSE > 0) { now += CLOSE * 3600e3; const c0 = performance.now(); R = make(); catchMs = performance.now() - c0; row(); await run(HOURS * 3600); R.save(); }
if (OUT) writeFileSync(OUT, JSON.stringify({ now, store: Object.fromEntries(store) }));
const dev = (d: any[]) => { const h: Record<string, number> = {}; for (const x of d ?? []) h[`${x.action}:${x.code}`] = (h[`${x.action}:${x.code}`] ?? 0) + 1; return h; };
console.log(JSON.stringify({ wallSec: Math.round((performance.now() - w0) / 1000), rebuildMs: Math.round(catchMs), brainCalls: calls, picks, errors, huskDev: dev(R.huskDev), cordDev: dev(R.cordDev), sailDev: dev(R.sailDev) }, null, 1));
for (const r of hourRows) console.log(JSON.stringify(r));
console.log('--- diary (sail / raft / voyage)');
for (const r of R.list) console.log(r.id + ': ' + r.diary.filter((e: any) => /帆|筏|航|島へ|渡/.test(e.text)).slice(-6).map((e: any) => e.text).join(' / '));
