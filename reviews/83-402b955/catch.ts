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
import { createHash } from 'node:crypto';
const j = JSON.parse(readFileSync(process.env.SOAK_IN!, 'utf8')); for (const [k, v] of Object.entries(j.store)) store.set(k, v as string); now = j.now + 12 * 3600e3;
let t = performance.now(); const R: any = make(); console.log('make', (performance.now() - t).toFixed(0), 'ms');
const times: number[] = [];
for (let i = 0; i < 120; i++) { now += 1000; t = performance.now(); R.update(1, now, new THREE.Vector3(0, 50, 0)); times.push(performance.now() - t); await Promise.resolve(); }
console.log('first frame', times[0].toFixed(0), 'ms; next 119 max', Math.max(...times.slice(1)).toFixed(1), 'ms');
const L = R.lab, soak = Object.values(L.runs).filter((r: any) => r.processId === 'prototype_husk_soak');
const pick = { soak: soak.map((r: any) => r.state), records: L.huskSoakRecords, lots: L.lots, world: L.world, seq: L.seq, committedLen: L.committed.length };
console.log('soak frameCount', soak.map((r: any) => r.state.data.frameCount), 'hash', createHash('sha256').update(JSON.stringify(pick)).digest('hex').slice(0, 16));
