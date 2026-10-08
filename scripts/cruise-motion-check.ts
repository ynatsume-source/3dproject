// How a big roaming fish moves while it is watched (owner, 2026-10-08: a barracuda speeding up, jumping up or down
// and turning of a sudden while nothing is going on). Builds a sea, puts the camera DIST metres off one fish of the
// species, following it as the auto camera does, and steps the sea 1/20 s for MIN minutes by day; each half second
// the fish's speed, climb and turn. Counted as a jolt: speed up by more than 60% of its cruising speed within a
// second, climbing or sinking faster than 0.5 m/s, or turning faster than 35°/s — and what it was doing then
// (hunting, or startled by the camera). A turn counts only when it is moving (over 0.15 m/s).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/cruise-motion-check.ts [sea] [species]   (env MIN 6, DIST 2.5)
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';

const id = process.argv[2] || 'miyako', spId = process.argv[3] || 'onikamasu', MIN = +(process.env.MIN || 6), DIST = +(process.env.DIST || 2.5);
const loc: any = LOCATIONS.find((l) => l.id === id)!;
const oc: any = buildOcean(loc);
const sys = oc.fish.find((f: any) => f.sp.id === spId);
if (!sys) { console.log('no', spId, 'in', id); process.exit(1); }
const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.4, 0.15));
const cam = new THREE.Vector3(0, -3, 0), fp = sys.dbg.fp, groups = sys.dbg.groups;
let t = 0;
const dt = 0.05;
// settle, then follow the first of its fish
for (let k = 0; k < 400; k++) { t += dt; oc.eco.step(dt, t, cam, 0, -1); }
const g = groups.find((q: any) => q.type === 'roam'), i = g.start, cruise = sys.sp.speed * 0.7;
const rows: any[] = [];
let prev = [fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]], prevV = [0, 0, 0], prevH = 0;
for (let k = 0; k < MIN * 60 / dt; k++) {
  // the camera beside it, a little above, easing after it
  const want = new THREE.Vector3(fp[i * 3] + DIST * 0.7, fp[i * 3 + 1] + 0.6, fp[i * 3 + 2] + DIST * 0.7);
  cam.lerp(want, Math.min(1, dt * 1.2));
  t += dt; oc.eco.step(dt, t, cam, 0, -1);
  if (k % 10 === 9) {
    const p = [fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]], v = [(p[0] - prev[0]) / 0.5, (p[1] - prev[1]) / 0.5, (p[2] - prev[2]) / 0.5];
    const sp = Math.hypot(v[0], v[2]), h = Math.atan2(v[2], v[0]);
    let dh = h - prevH; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const camD = Math.hypot(p[0] - cam.x, p[1] - cam.y, p[2] - cam.z);
    rows.push({ t: +(k * dt).toFixed(1), sp, acc: (sp - Math.hypot(prevV[0], prevV[2])) / 0.5, vy: v[1], turn: sp > 0.15 && Math.hypot(prevV[0], prevV[2]) > 0.15 ? Math.abs(dh) / 0.5 * 180 / Math.PI : 0,   // (a heading means nothing when it is all but still)
      hunt: g.hunt?.phase ?? '', fear: +g.fear.toFixed(2), camD: +camD.toFixed(1) });
    prev = p; prevV = v; prevH = h;
  }
}
const jolts = rows.slice(2).filter((r) => r.acc > cruise * 1.2 || Math.abs(r.vy) > 0.5 || r.turn > 35);
const calm = jolts.filter((r) => !r.hunt);
console.log(`${id} ${sys.sp.ja}: cruising ${cruise.toFixed(2)} m/s, camera ${DIST} m off, ${MIN} min — jolts ${jolts.length} (of them not hunting ${calm.length}); speed median ${med(rows.map((r) => r.sp)).toFixed(2)} max ${Math.max(...rows.map((r) => r.sp)).toFixed(2)} m/s; climb |vy| max ${Math.max(...rows.map((r) => Math.abs(r.vy))).toFixed(2)} m/s; turn max ${Math.max(...rows.map((r) => r.turn)).toFixed(0)}°/s`);
const k3 = (f: (r: any) => boolean) => calm.filter(f).length;
console.log(`  speed-ups ${k3((r) => r.acc > cruise * 1.2)}, climbs/sinks ${k3((r) => Math.abs(r.vy) > 0.5)}, turns ${k3((r) => r.turn > 35)}; with the camera inside 3.5 m ${k3((r) => r.camD < 3.5)}, fear>0.1 ${k3((r) => r.fear > 0.1)}`);
for (const r of [...calm].sort((a, b) => (Math.abs(b.vy) + b.turn / 60 + b.acc) - (Math.abs(a.vy) + a.turn / 60 + a.acc)).slice(0, 8)) console.log(`  at ${r.t}s: speed ${r.sp.toFixed(2)} (${r.acc > 0 ? '+' : ''}${r.acc.toFixed(2)}/s), climb ${r.vy.toFixed(2)} m/s, turn ${r.turn.toFixed(0)}°/s, fear ${r.fear}, camera ${r.camD} m`);
function med(a: number[]) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; }
process.exit(calm.length > 2 ? 1 : 0);
