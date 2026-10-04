// Headless check: the first minutes of a visit differ from day to day, and always open with fish all about (owner's
// choice F, 2026-10: ecosystem.ts startDay). For several dates, the sea is entered at its usual start (pickStart) and
// held 3 minutes there: the day's lot, the fish within 25 m after 5 s, and whether the day's big one came within 30 m.
// Want: the lots differ between days; after 5 s at least 300 fish within 25 m every day; a visitor that was drawn
// comes within 30 m.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/day-lot-check.ts [sea]
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState } from '../src/time/clock';
import { pickStart } from '../src/ocean/start';
const loc = LOCATIONS.find((l) => l.id === (process.argv[2] || 'miyako'))!;
const coralOf = (oc: any) => new Set(oc.cells.flatMap((c: any) => [c.mesh, c.hi].filter(Boolean)));
const m = new THREE.Matrix4();
let bad = 0; const lots = new Set<string>();
for (const day of [3, 4, 5, 6, 7]) {
  const oc: any = buildOcean(loc), coral = coralOf(oc);
  oc.eco.setSky(skyState(Date.UTC(2026, 9, day, 2), loc), new THREE.Vector2(0.5, 0.2));
  const st = pickStart(oc), cam = st ? st.pos.clone() : new THREE.Vector3(0, -6, 0), fx = st ? -Math.sin(st.yaw) : 0, fz = st ? -Math.cos(st.yaw) : -1;
  for (const f of oc.fish) f.reset();
  oc.eco.startDay();
  const lot = oc.eco.dayLot;
  let t = 0, at5 = 0, visClose = false;
  const nearN = () => { let n = 0; oc.group.traverse((o: any) => { if (!o.isInstancedMesh || coral.has(o) || !o.visible) return; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); const e = m.elements; if (Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]) < 1e-6) continue; if (Math.hypot(e[12] - cam.x, e[13] - cam.y, e[14] - cam.z) < 25) n++; } }); return n; };
  const vsys = (oc.fish as any[]).find((f) => f.sp.ja === lot.visitor);
  for (let k = 0; k < 1800; k++) {
    t += 0.1; oc.eco.step(0.1, t, cam, fx, fz);
    if (k === 49) at5 = nearN();
    if (vsys && k % 10 === 0) { const g = vsys.dbg.groups.find((q: any) => q.type === 'roam'); if (g && g.c.distanceTo(cam) < 30) visClose = true; }
  }
  const nearTxt = Object.entries(lot.near).map(([k, v]: any) => `${k} ${v.toFixed(2)}`).join(', ');
  lots.add(nearTxt + lot.visitor);
  const ok = at5 >= 300 && (!lot.visitor || visClose);
  if (!ok) bad++;
  console.log(`Oct ${day}: ${at5} fish within 25 m at 5 s; big one: ${lot.visitor ?? 'none'}${lot.visitor ? ` at ${lot.at} s, ${visClose ? 'came within 30 m' : 'NOT seen near'}` : ''} ${ok ? 'ok' : 'FAIL'}\n   near on arriving: ${nearTxt}`);
}
if (lots.size < 3) { bad++; console.log('the days are too much alike'); }
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
