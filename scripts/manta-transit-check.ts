// Headless check: a manta swimming over to a new circle (transit) keeps beating its wings and breathing —
// the wing phase and mouth go on changing while it moves, and its glides ease the beat down and up again
// (no wing held still at an odd angle). Usage: npx tsx --import ./scripts/node-assets.mjs scripts/manta-transit-check.ts
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';

const loc = LOCATIONS.find((l) => l.id === 'miyako')!;
const oc = buildOcean(loc);
const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.5, 0.2));
const cam = new THREE.Vector3(0, -4, 0);
let t = 0;
for (let k = 0; k < 300; k++) { t += 0.1; oc.eco.step(0.1, t, cam, 0, -1); }   // (placed, settled)
const m: any = oc.mantas.find((x: any) => x.placed);
if (!m) { console.log('no manta placed'); process.exit(1); }
// send it to a new circle 40 m off, in deep water
let best: [number, number] | null = null;
for (let a = 0; a < 6.28 && !best; a += 0.3) { const x = m.pos.x + Math.cos(a) * 40, z = m.pos.z + Math.sin(a) * 40; if (oc.T.top(x, z) < -9) best = [x, z]; }
if (!best) { console.log('no deep water nearby'); process.exit(1); }
m.transit = new THREE.Vector3(best[0], 0, best[1]);
const U = m.mesh.material.uniforms;
let fails = 0, moved = 0, windows = 0, minAmp = 9, maxAmp = 0, maxJump = 0;
let lp = U.uPhase.value, lm = U.uMouth.value, la = U.uAmp.value, last = m.pos.clone();
for (let k = 0; k < 400 && m.transit; k++) {
  t += 0.05; oc.eco.step(0.05, t, cam, 0, -1);
  minAmp = Math.min(minAmp, U.uAmp.value); maxAmp = Math.max(maxAmp, U.uAmp.value); maxJump = Math.max(maxJump, Math.abs(U.uAmp.value - la)); la = U.uAmp.value;
  if (k % 40 === 39) {   // every 2 s
    windows++;
    const d = m.pos.distanceTo(last), dp = Math.abs(U.uPhase.value - lp), dm = Math.abs(U.uMouth.value - lm);
    if (d > 1) { moved++; if (dp < 0.5 || dm < 1e-4) { fails++; console.log(`  frozen while moving ${d.toFixed(1)} m: phase +${dp.toFixed(2)}, mouth ±${dm.toFixed(4)}`); } }
    lp = U.uPhase.value; lm = U.uMouth.value; last.copy(m.pos);
  }
}
console.log(`2 s windows ${windows}, moving ${moved}, frozen ${fails}; wing amplitude ${minAmp.toFixed(2)}–${maxAmp.toFixed(2)}, largest step per frame ${maxJump.toFixed(3)}`);
if (fails || moved === 0 || maxJump > 0.08) { console.log('FAIL'); process.exit(1); }
console.log('PASS');
