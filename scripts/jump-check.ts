// Headless check for fish that jump: run a sea and flag any fish whose position changes faster than a
// fish can swim in one step (a snap onto a ledge, a pop out of rock), with what it was doing at the time.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/jump-check.ts [seaId] [phase]
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';

const loc = LOCATIONS.find((l) => l.id === (process.argv[2] || 'miyako'))!;
const oc = buildOcean(loc);
const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
const when = process.argv[3] === 'noon' ? ev.noon : ev.set - 10 * 60000;
oc.eco.setSky(skyState(when, loc), new THREE.Vector2(0.5, 0.2));
const cam = new THREE.Vector3(0, loc.f(0, 0) + 3, 0);
const prev = new Map<any, Float32Array>();
const hits = new Map<string, { n: number; worst: number; ex: string }>();
let t = 0, steps = 0;
const DT = 0.05;
for (let k = 0; k < 20 * 300; k++) {
  t += DT;
  // wander the camera slowly so groups get placed and moved about as in the app
  cam.set(Math.sin(t * 0.01) * 40, loc.f(Math.sin(t * 0.01) * 40, Math.cos(t * 0.013) * 40) + 3, Math.cos(t * 0.013) * 40);
  oc.eco.step(DT, t, cam, 0, -1);
  steps++;
  for (const f of oc.fish as any[]) {
    const d = f.dbg; if (!d) continue;
    const fp: Float32Array = d.fp, n = d.total;
    let pv = prev.get(f);
    if (pv && pv.length === fp.length) {
      for (let i = 0; i < n; i++) {
        if (d.dead[i]) continue;
        const dx = fp[i * 3] - pv[i * 3], dy = fp[i * 3 + 1] - pv[i * 3 + 1], dz = fp[i * 3 + 2] - pv[i * 3 + 2];
        const sp = Math.hypot(dx, dy, dz) / DT, vy = Math.abs(dy) / DT;
        const far = Math.hypot(fp[i * 3] - cam.x, fp[i * 3 + 2] - cam.z) > 60;   // (a group moved off out of sight: fine)
        const placed = Math.hypot(dx, dz) > 20;   // (a group moved in from far off: it grows in from nothing)
        if (!far && !placed && (vy > 2.5 || sp > f.sp.speed * 6 + 2)) {
          const g = d.groups?.find((g: any) => i >= g.start && i < g.start + g.n);
          const what = g ? `${g.type}${g.hunt ? ':hunt-' + g.hunt.phase : ''}${g.ch && g.ch.i === i ? ':chased' : ''}${g.cr ? ':cave-' + g.cr.mode : ''}` : 'shoal';
          const key = `${f.sp.ja} ${what}`;
          const h = hits.get(key) ?? { n: 0, worst: 0, ex: '' };
          h.n++; if (sp > h.worst) { h.worst = sp; h.ex = `dy ${dy.toFixed(2)} dxz ${Math.hypot(dx, dz).toFixed(2)} at y ${fp[i * 3 + 1].toFixed(1)}`; }
          hits.set(key, h);
        }
      }
    }
    if (!pv || pv.length !== fp.length) { pv = new Float32Array(fp.length); prev.set(f, pv); }
    pv.set(fp);
  }
}
console.log(`${steps} steps; fast moves per kind (vertical > 2.5 m/s or far faster than it swims):`);
for (const [k, h] of [...hits].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k.padEnd(30, '　')} ${h.n}  worst ${h.worst.toFixed(1)} m/s  (${h.ex})`);
if (!hits.size) console.log('  none');
