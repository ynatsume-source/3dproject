// Coral through coral (owner report, 2026-10-05: flat table corals poking through one another, branches through
// plates, domes into domes). Builds each sea as the app does (Kayama on its real terrain) and, for every colony as
// drawn, tests up to 40 points of its own geometry against the body of each colony near it. A colony's body is its
// own shape as a solid of revolution — the widest it reaches at each height (from its geometry), a little inside
// that so touching is not counted — in its own frame (scale, tilt and turn); a sea fan is a thin blade. A colony
// runs into another when over a tenth of its points are inside it. Two colonies of a thicket (one tangle, many
// colonies grown together) are not counted against each other: that is how a thicket grows.
// Logged: the share of colonies running into another, by the pair of forms; and how many stand with their bases
// in one another (the bases closer than the two base radii together).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/coral-overlap-check.ts [miyako kayama gbr redsea maldives]
import './node-land';
import * as THREE from 'three';
import { loadLand } from '../src/ocean/land';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { CORAL_MAT, CORAL_GEO } from '../src/ocean/models';

const KINDS = ['branch', 'table', 'brain', 'mushroom', 'fan', 'clam'];
const NB = 8;
// a form's profile: the widest it reaches in each of NB bands of its height, and its height
const prof = new Map<THREE.BufferGeometry, { h: number; y0: number; r: number[]; base: number }>();
function profile(g: THREE.BufferGeometry) {
  let p = prof.get(g); if (p) return p;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox!, P = g.attributes.position, h = b.max.y - b.min.y, r = new Array(NB).fill(0);
  for (let j = 0; j < P.count; j++) { const i = Math.min(NB - 1, Math.floor((P.getY(j) - b.min.y) / h * NB)); r[i] = Math.max(r[i], Math.hypot(P.getX(j), P.getZ(j))); }
  p = { h, y0: b.min.y, r, base: r[0] }; prof.set(g, p); return p;
}
const m = new THREE.Matrix4(), pt = new THREE.Vector3(), lp = new THREE.Vector3();
const want = process.argv.slice(2);
for (const id of want.length ? want : ['miyako', 'kayama', 'gbr', 'redsea', 'maldives']) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!;
  if (loc.land) await loadLand(id, loc.land.half, loc.land.far);
  const oc: any = buildOcean({ ...loc, residents: false });
  const cols: any[] = [];
  const seen = new Set<any>();
  const meshes: any[] = [];
  for (const c of oc.cells) if (!c.big) meshes.push(c.mesh);
  for (const o of oc.group.children) if ((o as any).isInstancedMesh) meshes.push(o);
  for (const mesh of meshes) {
    if (seen.has(mesh)) continue; seen.add(mesh);
    const kind = Object.keys(CORAL_MAT).find((k) => (CORAL_MAT as any)[k] === mesh.material);
    if (!kind || !KINDS.includes(kind)) continue;
    const g: THREE.BufferGeometry = mesh.geometry, p = profile(g);
    const thicket = kind === 'branch' && g.attributes.position === (CORAL_GEO as any).branch[2].attributes.position;
    const P = g.attributes.position, step = Math.max(1, Math.floor(P.count / 40));
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      const e = m.elements, s = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[8], e[9], e[10]));
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j < P.count; j += step) pts.push(pt.fromBufferAttribute(P, j).applyMatrix4(m).clone());
      cols.push({ kind: thicket ? 'thicket' : kind, x: e[12], z: e[14], y: e[13], R: Math.max(...p.r) * s, base: p.base * s, inv: m.clone().invert(), p, pts });
    }
  }
  // spatial hash
  const C = 3, H = new Map<string, any[]>();
  for (const c of cols) { const k = Math.floor(c.x / C) + ',' + Math.floor(c.z / C); (H.get(k) ?? H.set(k, []).get(k)!).push(c); }
  const inside = (b: any, w: THREE.Vector3) => {
    lp.copy(w).applyMatrix4(b.inv);
    const t = (lp.y - b.p.y0) / b.p.h; if (t < 0.02 || t > 0.98) return false;
    const r = b.p.r[Math.min(NB - 1, Math.floor(t * NB))] * 0.8;
    if (b.kind === 'fan') return Math.abs(lp.z) < 0.05 && Math.hypot(lp.x, lp.z) < r;
    return Math.hypot(lp.x, lp.z) < r;
  };
  const pair: Record<string, number> = {}, byKind: Record<string, [number, number]> = {};
  let into = 0, bases = 0;
  for (const a of cols) {
    const t = (byKind[a.kind] ??= [0, 0]); t[0]++;
    let hit: any = null;
    for (let i = Math.floor((a.x - a.R - 3) / C); i <= Math.floor((a.x + a.R + 3) / C) && !hit; i++) for (let j = Math.floor((a.z - a.R - 3) / C); j <= Math.floor((a.z + a.R + 3) / C) && !hit; j++) for (const b of H.get(i + ',' + j) ?? []) {
      if (b === a || (a.kind === 'thicket' && b.kind === 'thicket')) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) > a.R + b.R) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < (a.base + b.base) * 0.7 && a.kind !== 'thicket') bases++;
      let n = 0; for (const w of a.pts) if (inside(b, w)) n++;
      if (n > a.pts.length * 0.1) { hit = b; break; }
    }
    if (hit) { t[1]++; into++; const key = [a.kind, hit.kind].sort().join('+'); pair[key] = (pair[key] ?? 0) + 1; }
  }
  const top = Object.entries(pair).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(`${id}: ${cols.length} colonies; ${(100 * into / cols.length).toFixed(1)}% run into another (${Object.entries(byKind).map(([k, [n, f]]) => `${k} ${(100 * f / n).toFixed(0)}%`).join(', ')}); bases inside one another ${(bases / 2) | 0} pairs; most: ${top}`);
}
