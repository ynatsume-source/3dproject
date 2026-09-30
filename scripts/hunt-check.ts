// Headless check of hunts: run a sea through dusk and watch each hunt — how many bursts, how close the
// hunter got to the fish it chased, how fast each went, and how it ended (caught, or the fish got away).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/hunt-check.ts [seaId]
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';

const loc = LOCATIONS.find((l) => l.id === (process.argv[2] || 'miyako'))!;
const oc = buildOcean(loc);
const cam = new THREE.Vector3(0, loc.f(0, 0) + 3, 0);
const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
oc.eco.setSky(skyState(ev.set - 10 * 60000, loc), new THREE.Vector2(0.5, 0.2));
const track = new Map<string, { bursts: number; minD: number; phase: string; hs: number; ts: number; last: THREE.Vector3; lastT: THREE.Vector3 | null; turns: number }>();
let t = 0;
const out: string[] = [];
for (let k = 0; k < 900 * 10; k++) {
  t += 0.1;
  for (const e of oc.eco.step(0.1, t, cam, 0, -1)) if (e.kind === 'catch' || e.kind === 'hunt') out.push(`${t.toFixed(0)}s ${e.kind === 'catch' ? '[catch] ' : ''}${e.text}`);
  for (const s of oc.eco.subjects()) {
    if (s.kind !== 'hunt') continue;
    const st = s.status(), p = s.pos()!, tg = s.target?.();
    let r = track.get(s.key);
    if (!r) { r = { bursts: 0, minD: 1e9, phase: '', hs: 0, ts: 0, last: new THREE.Vector3(p.x, p.y, p.z), lastT: null, turns: 0 }; track.set(s.key, r); }
    const phase = st.includes('追いかけ') ? 'burst' : st.includes('かわされ') ? 'recover' : 'stalk';
    if (phase === 'burst' && r.phase !== 'burst') r.bursts++;
    if (phase === 'burst' && tg) {
      const d = Math.hypot(p.x - tg.x, p.y - tg.y, p.z - tg.z); r.minD = Math.min(r.minD, d);
      if (Math.hypot(p.x - r.last.x, p.z - r.last.z) < 1.5) r.hs = Math.max(r.hs, Math.hypot(p.x - r.last.x, p.y - r.last.y, p.z - r.last.z) / 0.1);
      if (r.lastT && Math.hypot(tg.x - r.lastT.x, tg.z - r.lastT.z) < 1.5) r.ts = Math.max(r.ts, Math.hypot(tg.x - r.lastT.x, tg.y - r.lastT.y, tg.z - r.lastT.z) / 0.1);
      r.lastT = new THREE.Vector3(tg.x, tg.y, tg.z);
    } else r.lastT = null;
    r.phase = phase; r.last.set(p.x, p.y, p.z);
    if (!s.live()) track.delete(s.key);
    (s as any)._r = r;
  }
  for (const [key, r] of track) if (!oc.eco.subjects().some((s) => s.key === key)) { out.push(`   hunt ${key}: bursts ${r.bursts}, closest ${r.minD < 1e8 ? r.minD.toFixed(2) + ' m' : '-'}, hunter top ${r.hs.toFixed(1)} m/s, fish top ${r.ts.toFixed(1)} m/s`); track.delete(key); }
}
console.log(out.join('\n'));
const caught = out.filter((l) => l.includes('[catch]')).length, away = out.filter((l) => /振り切|空を切|追いつけ|あきらめ/.test(l)).length;
console.log(`\ncaught ${caught}, got away ${away}`);
