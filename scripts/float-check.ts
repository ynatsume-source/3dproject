// Nothing standing in the water (owner report, 2026-10-05: corals and rocks floating at the rims of coral heads,
// slabs stuck on their sides, corals hung at the cave's skylights). Builds each sea as the app does (Kayama on its
// real terrain) and, for every coral colony and every rock as drawn, takes the vertices of its lowest part (the
// bottom quarter of its height) and how far each is above the seabed under it (terrain and cave rock, T.h). A
// piece floats when more than a fifth of its bottom stands over 0.3 m clear of the floor. Want: under 2% of
// the corals and under 1.5% of the rocks floating in every sea (before this fix: Miyako 26% and 31%, the Maldives
// 38% and 36%; a steep wall's last few are measurement as much as anything). (A table's plate, a sea fan's blade and a soft coral's
// crown are meant to stand clear: only the stalk is counted.)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/float-check.ts [miyako kayama gbr redsea maldives]
import './node-land';
import * as THREE from 'three';
import { loadLand } from '../src/ocean/land';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { CORAL_MAT } from '../src/ocean/models';

const KINDS = ['branch', 'table', 'brain', 'mushroom', 'fan', 'clam'];
const m = new THREE.Matrix4(), pt = new THREE.Vector3();
let bad = 0;
const seas = process.argv.slice(2);
for (const id of seas.length ? seas : ['miyako', 'kayama', 'gbr', 'redsea', 'maldives']) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!;
  if (loc.land) await loadLand(id, loc.land.half, loc.land.far);
  const oc: any = buildOcean(loc);
  const T = oc.T;
  const tally: Record<string, [number, number]> = {};
  const worst: string[] = [];
  const meshes: { mesh: THREE.InstancedMesh; kind: string }[] = [];
  for (const cell of oc.cells) {
    const kind = Object.keys(CORAL_MAT).find((k) => (CORAL_MAT as any)[k] === cell.mesh.material);
    if (cell.big) meshes.push({ mesh: cell.mesh, kind: 'rock' });
    else if (kind && KINDS.includes(kind)) meshes.push({ mesh: cell.mesh, kind });
  }
  // (the cave's top: its corals are in a mesh of their own, added straight to the group)
  for (const o of oc.group.children as any[]) if (o.isInstancedMesh && !meshes.some((q) => q.mesh === o)) {
    const kind = Object.keys(CORAL_MAT).find((k) => (CORAL_MAT as any)[k] === o.material);
    if (kind && KINDS.includes(kind)) meshes.push({ mesh: o, kind });
  }
  for (const { mesh, kind } of meshes) {
    const g = mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox!, P = g.attributes.position, hgt = bb.max.y - bb.min.y;
    // the bottom quarter; a table only its stalk (the middle fifth of its width)
    const half = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z);
    const low: number[] = [];
    for (let j = 0; j < P.count; j++) {
      const y = P.getY(j);
      if (y > bb.min.y + hgt * (kind === 'fan' ? 0.1 : 0.25)) continue;
      if ((kind === 'table' || kind === 'mushroom') && Math.hypot(P.getX(j), P.getZ(j)) > half * 0.2) continue;
      if (kind === 'fan' && Math.hypot(P.getX(j), P.getZ(j)) > half * 0.06) continue;   // (a fan: its thin stalk; the blade stands out from a wall as it should)
      low.push(j);
    }
    if (!low.length) continue;
    const step = Math.max(1, Math.floor(low.length / 24));
    const t = (tally[kind] ??= [0, 0]);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      let n = 0, up = 0, most = 0;
      for (let q = 0; q < low.length; q += step) {
        pt.fromBufferAttribute(P, low[q]).applyMatrix4(m);
        const gap = pt.y - T.h(pt.x, pt.z);
        n++; if (gap > 0.3) up++; most = Math.max(most, gap);
      }
      t[0]++;
      if (up > n * 0.2) { t[1]++; if (process.env.DBG && kind !== "rock" && t[1] < 6) console.log("  ", kind, m.elements[12].toFixed(1), m.elements[13].toFixed(2), m.elements[14].toFixed(1), "gap", most.toFixed(2), "floor", T.h(m.elements[12], m.elements[14]).toFixed(2), "cave", oc.cave ? oc.cave.topAt(m.elements[12], m.elements[14]).toFixed(1) : "-", "scale", Math.hypot(m.elements[0], m.elements[1], m.elements[2]).toFixed(2)); if (worst.length < 4) worst.push(`${kind} at (${m.elements[12].toFixed(0)}, ${m.elements[14].toFixed(0)}) ${most.toFixed(2)} m`); }
    }
  }
  const line = Object.entries(tally).map(([k, [n, f]]) => `${k} ${(100 * f / Math.max(1, n)).toFixed(1)}% of ${n}`).join(', ');
  const [cn, cf] = Object.entries(tally).filter(([k]) => k !== 'rock').reduce((a, [, [n, f]]) => [a[0] + n, a[1] + f], [0, 0]);
  const [rn, rf] = tally.rock ?? [0, 0];
  const ok = cf / Math.max(1, cn) < 0.02 && rf / Math.max(1, rn) < 0.015;
  if (!ok) bad++;
  console.log(`${id}: floating — corals ${(100 * cf / Math.max(1, cn)).toFixed(1)}%, rocks ${(100 * rf / Math.max(1, rn)).toFixed(1)}% (${line})${worst.length ? '; e.g. ' + worst.join('; ') : ''} ${ok ? 'ok' : 'FAIL'}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
