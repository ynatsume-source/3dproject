// Headless check of movement near the reef: does the drone keep clear of rock and coral while cruising
// and filming, and do mantas glide level rather than scaling coral heads?
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { Director } from '../src/director';

// the auto-cruise route and the drone's collision, as in main.ts
function pathXZ(s: number): [number, number] { return [110 * Math.sin(s * 0.9) + 22 * Math.sin(s * 2.3 + 1), -8 + 88 * Math.sin(s * 0.6 + 0.8) + 20 * Math.cos(s * 1.7)]; }
function pathAlt(s: number) { const a = 3.4 + 2.0 * Math.sin(s * 3.1) + 1.2 * Math.sin(s * 7.3 + 2); return Math.max(1.8, a) + Math.pow(Math.max(0, Math.sin(s * 1.13 + 0.5)), 8) * 10; }

for (const id of ['miyako', 'gbr', 'maldives']) {
  const loc = LOCATIONS.find((l) => l.id === id)!;
  const oc = buildOcean(loc), T = oc.T, G = T.ground;
  const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
  oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.5, 0.2));
  const d = new Director();
  const pos = new THREE.Vector3(), vel = new THREE.Vector3(), v = new THREE.Vector3(), tgt = new THREE.Vector3();
  let s = 0.4;
  const pp = (s: number, o: THREE.Vector3) => { const [x, z] = pathXZ(s); return o.set(x, Math.min(T.top(x, z) + pathAlt(s), -1.4), z); };
  pp(s, pos);
  let close = 0, inside = 0, n = 0, pops = 0;
  const mantaVy: number[] = [];
  let lastMy = oc.mantas.map((m: any) => m.pos.y);
  for (let k = 0; k < 6000; k++) {
    const dt = 0.1;
    oc.eco.step(dt, k * dt, pos, 0, -1);
    const shot = d.update(dt, pos, () => oc.eco.subjects(), T.top);
    if (shot) { v.subVectors(shot.pos, pos); const L = v.length(), top = shot.phase === 'approach' ? 2.4 : 0.9; v.multiplyScalar(Math.min(top, L * 0.8) / Math.max(L, 1e-4)); vel.lerp(v, 1 - Math.exp(-dt * 1.2)); }
    else {
      const a = pp(s, tgt), b = pathXZ(s + 0.001), rate = Math.hypot(b[0] - a.x, b[1] - a.z) / 0.001;
      s += 1.35 * dt / Math.max(rate, 1e-3); pp(s, tgt);
      v.subVectors(tgt, pos); const L = v.length(); v.multiplyScalar(Math.min(L * 1.4, L > 6 ? 4.5 : 3) / Math.max(L, 1e-4)); vel.lerp(v, 1 - Math.exp(-dt * 1.5));
    }
    const hs = Math.hypot(vel.x, vel.z);
    if (hs > 0.05) { let ah = -1e9; for (const t of [0.5, 1.0, 1.6, 2.4]) ah = Math.max(ah, G(pos.x + vel.x * t, pos.z + vel.z * t)); const want = ah + 1.0; if (pos.y < want) vel.y = Math.max(vel.y, Math.min(1.6, (want - pos.y) * 1.1)); }
    pos.addScaledVector(vel, dt);
    let fh = G(pos.x, pos.z);
    for (let q = 0; q < 8; q++) { const a = q * Math.PI / 4; fh = Math.max(fh, G(pos.x + Math.cos(a) * 0.7, pos.z + Math.sin(a) * 0.7) - 0.25); }
    if (pos.y < fh + 0.75) { const y0 = pos.y; pos.y = Math.max(fh + 0.35, pos.y + (fh + 0.75 - pos.y) * Math.min(1, dt * 6)); if (pos.y - y0 > 0.3) pops++; if (vel.y < 0) vel.y *= 0.5; }
    pos.y = Math.min(pos.y, -0.7);
    // clearance: nearest ground within 0.4 m of the lens
    let g = G(pos.x, pos.z); for (let q = 0; q < 8; q++) { const a = q * Math.PI / 4; g = Math.max(g, G(pos.x + Math.cos(a) * 0.4, pos.z + Math.sin(a) * 0.4)); }
    n++; if (pos.y - g < 0.3) close++; if (pos.y < g) inside++;
    oc.mantas.forEach((m: any, i: number) => { if (k > 20) mantaVy.push(Math.abs(m.pos.y - lastMy[i]) / dt); lastMy[i] = m.pos.y; });
  }
  mantaVy.sort((a, b) => a - b);
  const q = (f: number) => (mantaVy.length ? mantaVy[Math.floor(f * (mantaVy.length - 1))].toFixed(2) : '-');
  console.log(`${id}: drone within 0.3 m of rock/coral ${(close / n * 100).toFixed(2)}%, inside ${(inside / n * 100).toFixed(2)}%, pops ${pops}; manta climb m/s p50 ${q(0.5)} p99 ${q(0.99)} max ${q(1)}`);
}
