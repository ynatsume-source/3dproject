// Science team soak (2026-10-20): the island headless for 12 h, closed 12 h, 12 h again; the residents' minds a seeded
// stand-in that prefers the husk / cord / sail work. Measures, hour by hour: the save's size, the ledger, the frame cost.
import * as THREE from 'three';
import { performance } from 'node:perf_hooks';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather, islandWeather } from '../src/world/island-time';
import { addLot } from '../src/world/process-runner';
import { writePlantMass } from '../src/world/sail-lots';
import { BAMBOO_SOUTH } from '../src/world/planet-map';
import { writeCordBundle } from '../src/world/coir-cord-lots';
import { readFileSync, writeFileSync } from 'node:fs';

let now = Date.parse('2026-12-01T00:00:00Z');   // (09:00 on the island)
Date.now = () => now;
const store = new Map<string, string>(), KEY = 'seaglass.residents.v1';
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
await loadIslandWeather();
Math.random = mulberry32(11);
const pickRng = mulberry32(2026);
const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
const WORK = /^(husk|soak|takeout|beat|clear|cord|sail|voyage)/;
let calls = 0, picks: Record<string, number> = {};
const make = () => {
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  R.setBrain(async (i: any) => { calls++; const o = i.options ?? []; if (!o.length) return null;
    const work = o.filter((x: any) => WORK.test(x.id)), pool = work.length && pickRng() < 0.6 ? work : o, p = pool[Math.floor(pickRng() * pool.length)];
    picks[p.id.split(':')[0]] = (picks[p.id.split(':')[0]] ?? 0) + 1; return { goal: { text: 'テスト', why: 'テスト' }, plan: [p.id] }; });
  R.list.find((r: any) => r.id === 'dot').stats.built = 99;
  return R;
};
const IN = process.env.SOAK_IN, OUT = process.env.SOAK_OUT, HOURS = Number(process.env.SOAK_HOURS ?? '12'), CLOSE = Number(process.env.SOAK_CLOSE ?? '12');
if (IN) { const j = JSON.parse(readFileSync(IN, 'utf8')); for (const [k, v] of Object.entries(j.store)) store.set(k, v as string); now = j.now + CLOSE * 3600e3; }
let R: any = make();
const errors: string[] = [];
const hourRows: any[] = [];
let frameMax = 0, frameSum = 0, frames = 0;
async function run(secs: number) {
  for (let i = 0; i < secs; i++) {
    now += 1000;
    const t = performance.now();
    try { R.update(1, now, new THREE.Vector3(0, 50, 0)); } catch (e: any) { if (errors.length < 50) errors.push(`${new Date(now).toISOString()} ${e?.message ?? e}`); }
    const dt = performance.now() - t; frameSum += dt; frames++; if (dt > frameMax) frameMax = dt;
    if (i % 60 === 0) R.setWeather(islandWeather(now));
    for (const r of R.list) if (!r.sp.living) { r.battery = Math.max(r.battery, 0.7); }
    await Promise.resolve(); await Promise.resolve();
    if ((now / 1000) % 3600 === 0) row();
  }
}
function row() {
  const L = R.lab, runs = Object.values(L.runs) as any[], byProc: Record<string, number> = {};
  for (const r of runs) byProc[`${r.processId}:${r.status}`] = (byProc[`${r.processId}:${r.status}`] ?? 0) + 1;
  const save = store.get(KEY) ?? '', mats: Record<string, number> = {};
  for (const l of Object.values(L.lots) as any[]) mats[l.materialId] = (mats[l.materialId] ?? 0) + 1;
  hourRows.push({ at: new Date(now + 9 * 3600e3).toISOString().slice(5, 16), saveKB: Math.round(save.length / 1024), lots: Object.keys(L.lots).length, runs: runs.length,
    cordLoadsKB: Math.round(JSON.stringify(L.coirCordLoads ?? {}).length / 1024), committed: (L.committed ?? []).length,
    meanMs: +(frameSum / Math.max(1, frames)).toFixed(2), maxMs: +frameMax.toFixed(1), errors: errors.length,
    husk: (mats.coir_fiber_bundle ?? 0) + '束', strand: mats.coir_strand ?? 0, rope: mats.coir_rope ?? 0, mat: mats.sail_mat ?? 0, mast: mats.bamboo_mast ?? 0,
    voyages: (L.sailVoyages?.recent ?? []).length, procs: byProc });
  frameSum = 0; frames = 0; frameMax = 0;
}
// the stock: husks on the shelf, bamboo from the south, a raft of six
const MASS = 2_400_000;
if (!IN) {
for (let k = 0; k < 6; k++) addLot(R.lab, { materialId: 'coconut_husk', amount: { value: MASS, unit: 'mg' }, location: 'shelf', quality: { count: 2, water_ppm: 300_000, ash_dry_ppm: 20_000, history_complete: 1 } });
addLot(R.lab, { materialId: 'bamboo', amount: { value: 7_000_000, unit: 'mg' }, location: 'shelf', quality: { ...BAMBOO_SOUTH } });
R.village.raft.parts = 6;
for (let k = 0; k < 4; k++) { const b = writeCordBundle({ fiberDryMg: 72_000, pithDryMg: 7_000, waterMg: 5_000 } as any, 'shelf', 1); addLot(R.lab, { materialId: b.materialId, amount: b.amount, quality: b.quality, location: 'shelf' }); }
}
const w0 = performance.now();
let savedKB = 0, catchMs = 0;
if (IN) { row(); await run(HOURS * 3600); R.save(); }
else {
await run(HOURS * 3600);
R.save(); savedKB = Math.round((store.get(KEY) ?? '').length / 1024);
if (CLOSE > 0) { now += CLOSE * 3600e3;
const c0 = performance.now(); R = make(); catchMs = performance.now() - c0; row();
await run(HOURS * 3600);
R.save(); }
}
if (OUT) writeFileSync(OUT, JSON.stringify({ now, store: Object.fromEntries(store) }));
const wall = Math.round((performance.now() - w0) / 1000);
const dev = (d: any[]) => { const h: Record<string, number> = {}; for (const x of d ?? []) h[`${x.action}:${x.code}`] = (h[`${x.action}:${x.code}`] ?? 0) + 1; return h; };
console.log(JSON.stringify({ wallSec: wall, savedKBAtClose: savedKB, catchUpMs: Math.round(catchMs), brainCalls: calls, picks, errors, huskDev: dev(R.huskDev), cordDev: dev(R.cordDev), sailDev: dev(R.sailDev) }, null, 1));
for (const r of hourRows) console.log(JSON.stringify(r));
const d = R.list.map((r: any) => `${r.id}: ` + r.diary.filter((e: any) => /殻|繊維|縄|撚|帆|アダン|竹|筏/.test(e.text)).slice(-4).map((e: any) => e.text).join(' / '));
console.log(d.join('\n'));
console.log('--- lots at the end');
for (const l of Object.values(R.lab.lots) as any[]) if (/husk|coir|pandanus|bamboo|sail|mast/.test(l.materialId)) console.log(l.lotId, l.materialId, l.location, l.amount.value, JSON.stringify(l.quality ?? {}));
console.log('--- husk host state', JSON.stringify(R.village.huskHost ?? {}).slice(0, 400));
console.log('--- save composition (KB)');
const sv = JSON.parse(store.get(KEY) ?? '{}');
const sz = (v: unknown) => Math.round(JSON.stringify(v ?? null).length / 102.4) / 10;
const rows: [string, number][] = [];
const walk = (o: any, path: string, depth: number) => { for (const [k, v] of Object.entries(o ?? {})) { const s = sz(v); if (s >= 3) { rows.push([path + k, s]); if (depth < 3 && v && typeof v === 'object' && !Array.isArray(v)) walk(v, path + k + '.', depth + 1); else if (Array.isArray(v)) rows.push([path + k + ' (len)', v.length]); } } };
walk(sv, '', 0);
for (const [k, s] of rows.sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(String(s).padStart(7), k);
