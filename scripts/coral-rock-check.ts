// Coral and rock: no colony drawn growing through a rock (owner report, 2026-10). Builds each sea as the app does
// (Kayama on its real terrain), takes every coral colony and every rock as drawn, and tests up to 60 points of each
// colony's own geometry against the rock's own mesh (point in mesh by ray parity). Want: under 3% of colonies with
// more than 5% of their geometry inside a rock, and at most 10 swallowed whole (> 95%).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/coral-rock-check.ts [miyako kayama gbr]
import './node-land';
import * as THREE from 'three';
import { loadLand } from '../src/ocean/land';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { CORAL_MAT, CORAL_GEO } from '../src/ocean/models';

const RK = ['boulder','angular','slab','pinnacle','pitted','rubble'];
const KINDS = ['branch', 'table', 'brain', 'mushroom', 'fan', 'clam'];
const m = new THREE.Matrix4(), inv = new THREE.Matrix4(), pt = new THREE.Vector3(), q = new THREE.Vector3();
const ray = new THREE.Raycaster(); ray.firstHitOnly = false as any;
const DIRS = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0.13, 0.07).normalize(), new THREE.Vector3(-0.1, -0.2, 1).normalize()];
const meshCache = new Map<THREE.BufferGeometry, THREE.Mesh>();
function inside(geo: THREE.BufferGeometry, p: THREE.Vector3) {     // point in closed mesh (majority of 3 parity rays)
  let mesh = meshCache.get(geo); if (!mesh) { mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); meshCache.set(geo, mesh); }
  if (!geo.boundingBox) geo.computeBoundingBox(); if (!geo.boundingBox!.containsPoint(p)) return false;
  let votes = 0;
  for (const d of DIRS) { ray.set(p, d); const hits = ray.intersectObject(mesh, false); if (hits.length % 2 === 1) votes++; }
  return votes >= 2;
}

let bad = 0;
const seas = process.argv.slice(2);
for (const id of seas.length ? seas : ['miyako', 'kayama', 'gbr']) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!;
  if (loc.land) await loadLand(id, loc.land.half, loc.land.far);
  const oc: any = buildOcean({ ...loc, residents: false });
  const corals: any[] = [], rocks: any[] = [];
  const geoIdx = new Map<THREE.BufferGeometry, number>();
  for (const cell of oc.cells) {
    const kind = Object.keys(CORAL_MAT).find((k) => (CORAL_MAT as any)[k] === cell.mesh.material);
    const isRock = !!cell.big;
    if (!isRock && (!kind || !KINDS.includes(kind))) continue;
    const g: THREE.BufferGeometry = cell.mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
    if (isRock && !geoIdx.has(g)) geoIdx.set(g, geoIdx.size);
    const bb = g.boundingBox!, half = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z);
    const P = g.attributes.position;
    for (let i = 0; i < cell.mesh.count; i++) {
      cell.mesh.getMatrixAt(i, m);
      const e = m.elements, x = e[12], z = e[14];
      const sx = Math.hypot(e[0], e[1], e[2]), sz = Math.hypot(e[8], e[9], e[10]);
      if (isRock) {
        // real footprint radius: max horizontal distance of transformed vertices
        let r = 0, top = -1e9; for (let j = 0; j < P.count; j += 2) { pt.fromBufferAttribute(P, j).applyMatrix4(m); r = Math.max(r, Math.hypot(pt.x - x, pt.z - z)); top = Math.max(top, pt.y); }
        rocks.push({ x, z, r, top, m: m.clone(), inv: m.clone().invert(), geo: g, proto: geoIdx.get(g), s: Math.max(sx, sz) });
      } else {
        const thick = kind === 'branch' && g.attributes.position === (CORAL_GEO as any).branch[2].attributes.position;
        corals.push({ kind: thick ? 'thicket' : kind, x, z, r: half * Math.max(sx, sz), m: m.clone(), geo: g, cell, i, floor: loc.f(x, z) });
      }
    }
  }
  // spatial hash rocks
  const H = new Map<string, any[]>(), C = 4;
  for (const r of rocks) { const key = Math.floor(r.x / C) + ',' + Math.floor(r.z / C); (H.get(key) || H.set(key, []).get(key)!).push(r); }
  const near = (x: number, z: number, R: number) => { const out: any[] = []; for (let i = Math.floor((x - R) / C); i <= Math.floor((x + R) / C); i++) for (let j = Math.floor((z - R) / C); j <= Math.floor((z + R) / C); j++) for (const r of H.get(i + ',' + j) || []) out.push(r); return out; };
  let full = 0, circ = 0, deep = 0, interp = 0, baseIn = 0, rockInCoral = 0, rockInThicketTable = 0;
  const byKind: Record<string, number> = {}, depths: number[] = [], ex: any[] = [];
  for (const c of corals) {
    const cand = near(c.x, c.z, c.r + 4).filter((r) => Math.hypot(r.x - c.x, r.z - c.z) < c.r + r.r);
    if (!cand.length) continue;
    circ++;
    let best = 0, bestR: any = null, fracMax = 0, base = false, rIn = false;
    for (const r of cand) {
      const d = Math.hypot(r.x - c.x, r.z - c.z), ov = c.r + r.r - d;
      if (ov > best) { best = ov; bestR = r; }
      if (d < c.r * 0.8) rIn = true;     // the rock's centre stands inside the colony
      // coral vertices inside the rock
      const P = c.geo.attributes.position, stepV = Math.max(1, Math.floor(P.count / 60)); let n = 0, k = 0;
      for (let j = 0; j < P.count; j += stepV) { n++; pt.fromBufferAttribute(P, j).applyMatrix4(c.m); q.copy(pt).applyMatrix4(r.inv); if (inside(r.geo, q)) k++; }
      fracMax = Math.max(fracMax, k / n);
      q.set(c.x, c.floor + 0.05, c.z).applyMatrix4(r.inv); if (inside(r.geo, q)) base = true;
    }
    depths.push(best); if (best > 0.3) deep++;
    if (fracMax > 0.05) { interp++; byKind[c.kind] = (byKind[c.kind] || 0) + 1; }
    if (base) baseIn++;
    if (rIn) { rockInCoral++; if (c.kind === 'table' || c.kind === 'thicket') rockInThicketTable++; }
    if (fracMax > 0.95) full++;
    if (fracMax > 0.15 || (rIn && (c.kind==='table'||c.kind==='thicket'))) ex.push({ kind: c.kind, x: c.x, z: c.z, cr: c.r, rr: bestR.r, rproto: bestR.proto, rs: bestR.s, ov: best, frac: fracMax, base });
  }
  { const CH = new Map<string, any[]>(); for (const c of corals) { const key = Math.floor(c.x / C) + ',' + Math.floor(c.z / C); (CH.get(key) || CH.set(key, []).get(key)!).push(c); }
    let rc = 0, rc2 = 0; for (const r of rocks) { let hit = false, hit2 = false; for (let i = Math.floor((r.x - 4) / C); i <= Math.floor((r.x + 4) / C); i++) for (let j = Math.floor((r.z - 4) / C); j <= Math.floor((r.z + 4) / C); j++) for (const c of CH.get(i + ',' + j) || []) { const d = Math.hypot(c.x - r.x, c.z - r.z); if (d < c.r) hit = true; if (d < c.r + 0.5 * r.r) hit2 = true; } if (hit) rc++; if (hit2) rc2++; }
    console.log(`rocks whose centre is in a colony footprint: ${rc}/${rocks.length}; within footprint + half rock radius: ${rc2}`); }
  depths.sort((a, b) => a - b);
  const pct = (p: number) => depths.length ? depths[Math.floor(p * (depths.length - 1))].toFixed(2) : '-';
  console.log(`\n== ${id}: corals ${corals.length}, rocks ${rocks.length} (protos ${geoIdx.size})`);
  console.log(`footprints intersect a rock: ${circ} (${(100 * circ / corals.length).toFixed(1)}%); overlap >0.3 m: ${deep}; overlap median ${pct(0.5)} p90 ${pct(0.9)} max ${pct(1)}`);
  console.log(`coral geometry >5% inside rock mesh: ${interp} (${Object.entries(byKind).map(([k, v]) => k + ' ' + v).join(', ')}); colony base buried in rock: ${baseIn}`);
  console.log(`rock centre inside a colony footprint: ${rockInCoral} (in table / thicket ${rockInThicketTable})`);
  console.log(`fully buried (>95% verts in rock): ${full}`);
  const seen = new Set(); const pickd = ex.filter((e) => (e.frac > 0.2 && e.frac < 0.7) || ((e.kind==='table'||e.kind==='thicket') && e.ov > 1)).sort((a,b)=>b.ov-a.ov).filter((e)=>{ if (seen.has(e.kind)) return false; seen.add(e.kind); return true; });
  for (const e of pickd) console.log(`  ${e.kind} r${e.cr.toFixed(2)} @(${e.x.toFixed(1)}, ${e.z.toFixed(1)}) vs ${RK[e.rproto >> 1]} s${e.rs.toFixed(2)} r${e.rr.toFixed(2)}: overlap ${e.ov.toFixed(2)} m, ${(100 * e.frac).toFixed(0)}% of coral verts inside rock${e.base ? ', base buried' : ''}`);
  const ok = interp / corals.length < 0.03 && full <= 10;
  if (!ok) bad++;
  console.log(`${id}: ${(100 * interp / corals.length).toFixed(1)}% of colonies >5% inside a rock, ${full} swallowed ${ok ? 'ok' : 'FAIL'}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
