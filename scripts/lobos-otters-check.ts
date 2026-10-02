// Wild sea otters at Point Lobos: always there, never through rock, dive to the real bottom and come up to eat.
// npx tsx --import ./scripts/node-assets.mjs scripts/lobos-otters-check.ts
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { swellAt } from '../src/ocean/air';

const oc = buildOcean(LOCATIONS.find(l => l.id === 'pointlobos')!);
const ot = oc.lobosOtters; assert.ok(ot && ot.list.length === 3, 'three otters in the canopy');
for (const id of ['miyako', 'maldives']) { const o = LOCATIONS.find(l => l.id === id); if (o) assert.ok(!buildOcean(o).lobosOtters, `no otters in ${id}`); }
const env: any = { night: 0, day: 1, events: [], cam: { x: 0, y: 0, z: 0 } };
const cam = new THREE.Vector3(0, -5, 0);
const seen: Record<string, number> = {}; let deepest = 0, minClear = Infinity, maxStep = 0, afterDive = 0, dives = 0;
const last = ot.list.map((o: any) => o.pos.clone()), was = ot.list.map((o: any) => o.doing);
for (let i = 0; i < 36000; i++) {
  env.night = (Math.floor(i / 9000) % 2) ? 0.9 : 0;
  cam.copy(ot.list[0].pos);
  ot.update(0.1, env, cam);
  ot.list.forEach((o: any, j: number) => {
    seen[o.doing] = (seen[o.doing] || 0) + 1;
    const top = oc.T.top(o.pos.x, o.pos.z);
    minClear = Math.min(minClear, o.pos.y - top);
    assert.ok(o.pos.y <= swellAt(o.pos.x, o.pos.z) + 1e-6, 'never above the water');
    if (o.doing === 'dive') deepest = Math.min(deepest, o.pos.y - swellAt(o.pos.x, o.pos.z));
    maxStep = Math.max(maxStep, o.pos.distanceTo(last[j])); last[j].copy(o.pos);
    if (was[j] === 'dive' && o.doing !== 'dive') { dives++; if (o.doing === 'eat') afterDive++; }
    was[j] = o.doing;
    assert.ok(Math.abs(o.pos.x) < 100 && Math.abs(o.pos.z) < 100, 'stays in the sea');
  });
}
assert.ok(minClear > 0.15, `clear of the rock (${minClear})`);
assert.ok(deepest < -5, `reaches the bottom (${deepest})`);
assert.ok(dives > 5 && afterDive === dives, 'every dive ends in a meal');
assert.ok(maxStep < 0.4, `no jumps (${maxStep})`);
for (const d of ['float', 'groom', 'dive', 'eat', 'sleep', 'swim']) assert.ok(seen[d] > 0, d);
console.log(JSON.stringify({ seen, deepest, minClear, maxStep, dives }, null, 1), '\nlobos otters: PASS');
