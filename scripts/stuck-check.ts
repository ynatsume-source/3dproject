// Headless check for hunts that stall: run a sea with the camera cruising about, and flag any hunt
// that stays in one phase too long or whose hunter stops moving (the hunt window would freeze on it).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/stuck-check.ts [seaId]
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';

const loc = LOCATIONS.find((l) => l.id === (process.argv[2] || 'maldives'))!;
const oc = buildOcean(loc);
const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
oc.eco.setSky(skyState(ev.set - 10 * 60000, loc), new THREE.Vector2(0.5, 0.2));
const cam = new THREE.Vector3();
const seen = new Map<string, { phase: string; since: number; at: THREE.Vector3; still: number; worstPhase: number; worstStill: number; label: string }>();
let t = 0, bad = 0;
for (let k = 0; k < 900 * 10; k++) {
  t += 0.1;
  const a = t * 0.01;
  cam.set(Math.cos(a) * 60, 0, Math.sin(a * 1.3) * 60); cam.y = Math.min(loc.f(cam.x, cam.z) + 4, -2);
  oc.eco.step(0.1, t, cam, -Math.sin(a), Math.cos(a));
  const live = new Set<string>();
  for (const s of oc.eco.subjects()) {
    if (s.kind !== 'hunt' || !s.live() || s.key.startsWith('baitball')) continue;   // (a bait ball goes on for minutes by design)
    live.add(s.key);
    const st = s.status(), p = s.pos()!;
    let r = seen.get(s.key);
    if (!r) { r = { phase: st, since: t, at: new THREE.Vector3(p.x, p.y, p.z), still: 0, worstPhase: 0, worstStill: 0, label: s.label }; seen.set(s.key, r); }
    if (st !== r.phase) { r.phase = st; r.since = t; }
    r.worstPhase = Math.max(r.worstPhase, t - r.since);
    const moved = Math.hypot(p.x - r.at.x, p.y - r.at.y, p.z - r.at.z);
    r.at.set(p.x, p.y, p.z);
    r.still = moved < 0.002 ? r.still + 0.1 : 0;
    r.worstStill = Math.max(r.worstStill, r.still);
    if (r.worstPhase > 45 || r.still > 5) { if (!(r as any).told) { (r as any).told = 1; bad++; console.log(`STUCK ${t.toFixed(0)}s ${s.key} ${r.label} 「${st}」 phase ${r.worstPhase.toFixed(0)}s still ${r.still.toFixed(1)}s at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} cam ${cam.distanceTo(new THREE.Vector3(p.x, p.y, p.z)).toFixed(0)}m`); } }
  }
  for (const key of [...seen.keys()]) if (!live.has(key)) seen.delete(key);
}
console.log(`${loc.id}: stalled hunts ${bad}`);
