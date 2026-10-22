import * as THREE from 'three';
import { performance } from 'node:perf_hooks';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { setSeaLevel, useWater } from '../src/ocean/air';
for (const id of (process.env.SEAS ?? 'kayama,miyako').split(',')) for (const h of [0, 0.91]) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!, oc: any = buildOcean(loc); useWater(oc.water ?? null); setSeaLevel(h);
  const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc); oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.5, 0.2));
  const cam = new THREE.Vector3(0, h - 3, 0); let t = 0;
  for (let k = 0; k < 300; k++) { t += 1 / 60; oc.eco.step(1 / 60, t, cam, 0, -1); }
  const ms: number[] = []; for (let k = 0; k < 1200; k++) { t += 1 / 60; const a = performance.now(); oc.eco.step(1 / 60, t, cam, 0, -1); ms.push(performance.now() - a); }
  ms.sort((a, b) => a - b); console.log(`${id} sea ${h}: map ${oc.water?.tex ? 'yes' : 'no'}, eco.step median ${ms[600].toFixed(2)} ms, p95 ${ms[1140].toFixed(2)} ms, mean ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(2)} ms`);
  setSeaLevel(0); useWater(null);
}
