// Integration: real resident task execution on a controlled open hill, at Kayama's
// coordinates. The browser capture separately checks the actual island/vegetation.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { LOCATIONS } from '../src/data/locations';
import { mulberry32 } from '../src/core/math';

const realNow = Date.now, realRandom = Math.random;
const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const data = new Map<string, string>();
const key = 'seaglass.residents.v1', experiment = 'seaglass.lantern-study.residents.v1';
let now = Date.parse('2026-10-01T13:00:00Z');
Date.now = () => now;
Math.random = mulberry32(70204);
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k),
} });
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }),
  getElementById: () => null,
} });
try {
  const loc = { ...LOCATIONS.find(l => l.id === 'kayama')!, f: (x: number, z: number) => x < 0 ? -3 : 12 + 0.001 * z };
  const T = { ground: loc.f, top: loc.f, floor: loc.f, vegH: () => 0, landCover: () => ({ can: 0, sand: 1 }) };
  const base = makeResidents(loc, T, ['テスト魚'], ['テスト鳥']);
  assert.equal(base.study, undefined);
  base.list.find(r => r.id === 'dot')!.diary.push({ at: now - 1000, text: '以前から残っている記録。' });
  base.save();
  const original = data.get(key)!;
  const R = makeResidents(loc, T, ['テスト魚'], ['テスト鳥'], { lanternStudy: true });
  R.setStudyWeather(0.08, 'simulation');
  assert.equal(R.study!.state.aiEnabled, false);
  assert.ok(R.list.find(r => r.id === 'dot')!.diary.some(e => e.text === '以前から残っている記録。'));
  const r = R.list.find(r => r.id === 'lantern')!, cam = r.pos.clone().add(new THREE.Vector3(0, 4, 4));
  const visited = new Set<string>();
  let elapsed = 0, drawingFrames = 0, distance = 0, last = r.pos.clone();
  // (the second look of a study waits 45 minutes for the sky to turn: up to three hours of a night)
  while (elapsed < 3 * 3600 && !R.study!.state.works.some(w => w.completedAt)) {
    now += 500; elapsed += 0.5; R.update(0.5, now, cam);
    visited.add(r.task?.kind ?? 'idle');
    if (r.task?.kind === 'study-draw' && r.task.arrived) drawingFrames++;
    distance += r.pos.distanceTo(last); last.copy(r.pos);
  }
  assert.ok(R.study!.state.works.some(w => w.completedAt), JSON.stringify({ task:r.task, state:R.study!.state }));
  const work = R.study!.state.works.find(w => w.completedAt)!;
  assert.ok(work.observationIds.length >= 2 && work.revisions >= 2);
  assert.ok(drawingFrames >= 200, 'two genuine drawing dwell periods were executed');
  assert.ok(visited.has('study-observe') && visited.has('study-draw'));
  { const ts = work.observationIds.map(id => R.study!.state.observations.find(o => o.id === id)!.atMs); assert.ok(ts[1] - ts[0] >= 45 * 60_000, 'the two looks are far enough apart for the sky to have turned'); }
  assert.ok([...visited].some(k => !k.startsWith('study-') && k !== 'idle'), 'between looks it lives its usual life: ' + [...visited].join(','));
  assert.ok(R.study!.state.observations.every(o => o.cloudSource === 'simulation' && !o.offline));
  R.save();
  assert.equal(data.get(key), original, 'experimental saves must leave the legacy world byte-identical');
  assert.ok(data.has(experiment));
  const restored = makeResidents(loc, T, ['テスト魚'], ['テスト鳥'], { lanternStudy: true });
  assert.ok(restored.study!.state.works.some(w => w.id === work.id && w.completedAt === work.completedAt));
  assert.ok(restored.list.find(o => o.id === 'dot')!.diary.some(e => e.text === '以前から残っている記録。'));
  restored.save(); assert.equal(data.get(key), original);
  const normalAgain = makeResidents(loc, T, ['テスト魚'], ['テスト鳥']);
  assert.equal(normalAgain.study, undefined);
  assert.equal(data.get(key), original);
  console.log(JSON.stringify({ status: 'passed', terrain: 'Controlled open hill at Kayama coordinates', elapsedSeconds: elapsed,
    taskKinds: [...visited], observations: R.study!.state.observations.length, revisions: work.revisions,
    drawingFrames, travelMetres: distance, legacySaveUnchanged: true, completedWorkRestored: true, liveApiCalls: 0 }, null, 2));
  R.study!.dispose(); restored.study!.dispose();
} finally {
  Date.now = realNow; Math.random = realRandom;
  if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete (globalThis as any).document;
  if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else delete (globalThis as any).localStorage;
}
