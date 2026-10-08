// Morays in their holes (owner report, 2026-10-08: a moray's hole not where the rock is). Builds each sea with
// morays as the app does and, for every moray, against the seabed as drawn (T.drawn):
//   hole  — the opening's middle and its rim (16 points round it) on the face: want all within 3 cm of it
//   body  — the body behind the opening (a tenth, three tenths and over half its length back) inside the rock: want
//           under the face
//   head  — the head at its daytime and its night reach out in the water: want clear of the face and anything on it
// Also, for comparison, how far the old placement (on the smooth ground, loc.f) stood off the face as drawn.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/moray-check.ts [miyako kayama gbr maldives redsea galapagos]
import './node-land';
import * as THREE from 'three';
import { loadLand } from '../src/ocean/land';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';

const seas = process.argv.slice(2);
let fail = 0;
for (const id of seas.length ? seas : ['miyako', 'kayama', 'gbr', 'maldives', 'redsea', 'galapagos']) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!;
  if (loc.land) await loadLand(id, loc.land.half, loc.land.far);
  const oc: any = buildOcean(loc);
  const T = oc.T, ms: any[] = oc.critters?.morays ?? [];
  if (!ms.length) { console.log(`${id}: no morays`); continue; }
  let rimOff = 0, bodyOut = 0, headIn = 0, oldOff = 0, worstRim = 0;
  const ax = new THREE.Vector3(), ay = new THREE.Vector3(), q = new THREE.Vector3();
  for (const m of ms) {
    // the opening: middle and rim (its shape as placed: across the face and up it, longer up it when the body meets it slanting)
    ax.set(-m.nrm.z, 0, m.nrm.x).normalize(); ay.crossVectors(m.nrm, ax);
    const r = m.len * 0.075, sl = Math.min(1.8, 1 / Math.max(0.35, Math.abs(m.nrm.dot(m.dir))));
    let worst = Math.abs(m.pos.y - T.drawn(m.pos.x, m.pos.z));
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      q.copy(m.pos).addScaledVector(ax, Math.cos(a) * r).addScaledVector(ay, Math.sin(a) * r * sl);
      worst = Math.max(worst, Math.abs(q.y - T.drawn(q.x, q.z)));
    }
    worstRim = Math.max(worstRim, worst); if (worst > 0.03) rimOff++;
    // the body behind the opening
    let out = false;
    for (const f of [0.1, 0.3, 0.55]) { q.copy(m.pos).addScaledVector(m.dir, -m.len * f); if (q.y > T.drawn(q.x, q.z) - 0.02) out = true; }
    if (out) bodyOut++;
    // the head out in the water
    let inn = false;
    for (const o of [m.outDay, 0.45]) { q.copy(m.pos).addScaledVector(m.dir, m.len * o); if (q.y < T.top(q.x, q.z) + 0.03) inn = true; }
    if (inn) headIn++;
    oldOff += Math.abs((loc.f(m.pos.x, m.pos.z) - 0.15) - T.drawn(m.pos.x, m.pos.z));
  }
  const n = ms.length, ok = rimOff === 0 && bodyOut === 0 && headIn === 0;
  if (!ok) fail++;
  console.log(`${id}: ${n} morays — opening off the face (>3 cm): ${rimOff} (worst ${(worstRim * 100).toFixed(1)} cm); body not in the rock: ${bodyOut}; head in the rock: ${headIn}; the old placement stood ${(oldOff / n * 100).toFixed(0)} cm off the face on average — ${ok ? 'PASS' : 'FAIL'}`);
}
process.exit(fail ? 1 : 0);
