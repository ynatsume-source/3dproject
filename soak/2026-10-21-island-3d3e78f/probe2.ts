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
  return R;
};
const j = JSON.parse(readFileSync(process.env.SOAK_IN!, 'utf8')); for (const [k, v] of Object.entries(j.store)) store.set(k, v as string); now = j.now;
const R: any = make(); const cam = new THREE.Vector3(0, 50, 0);
const dot = R.list.find((r: any) => r.id === 'dot');
const frame = () => { now += 1000; const t = performance.now(); R.update(1, now, cam); return performance.now() - t; };
const seq: string[] = [];
let tot = 0; for (let i = 0; i < 60; i++) { const ms = frame(); tot += ms; if (i < 12) seq.push(`${ms.toFixed(0)}ms act=${dot.act} task=${dot.task?.kind ?? '-'}@${JSON.stringify(dot.task?.to ?? dot.task?.at ?? null)} went=${dot.went} blocked=${dot.blocked} hold=${dot.holding} pos=${dot.pos.x.toFixed(1)},${dot.pos.z.toFixed(1)}`); await Promise.resolve(); }
console.log('as saved: 60 frames mean', (tot / 60).toFixed(1), 'ms'); console.log(seq.join('\n'));
const keys = Object.keys(dot).filter((k) => !['mesh', 'group', 'body', 'parts', 'mind', 'agent'].includes(k)); console.log('dot keys', keys.join(','));
console.log('dot.mo', JSON.stringify(dot.mo ?? {}).slice(0, 600));
dot.holding = ''; tot = 0; for (let i = 0; i < 60; i++) { tot += frame(); await Promise.resolve(); } console.log('dot holding nothing: 60 frames mean', (tot / 60).toFixed(1), 'ms');
