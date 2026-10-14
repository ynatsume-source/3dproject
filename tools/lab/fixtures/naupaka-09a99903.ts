// Exact geometry routines from 09a99903a1fa9a7053719df1ac93ff81f66eb5f3. Test-only.
import * as THREE from 'three';
import {R,rr} from '../../../src/core/math';
class Builder {
  p: number[] = []; n: number[] = []; c: number[] = []; w: number[] = []; i: number[] = [];
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, nrm: THREE.Vector3, col: number[], sway: number[]) {
    const o = this.p.length / 3;
    for (const [v, s] of [[a, sway[0]], [b, sway[1]], [c, sway[2]], [d, sway[3]]] as [THREE.Vector3, number][]) {
      this.p.push(v.x, v.y, v.z); this.n.push(nrm.x, nrm.y, nrm.z); this.c.push(col[0], col[1], col[2]); this.w.push(s);
    }
    this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  // a tapered tube from a to b
  tube(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, col: number[], sw0 = 0, sw1 = 0, seg = 5) {
    const ax = new THREE.Vector3().subVectors(b, a).normalize();
    const u = new THREE.Vector3(1, 0, 0); if (Math.abs(ax.x) > 0.9) u.set(0, 0, 1);
    const v1 = new THREE.Vector3().crossVectors(ax, u).normalize(), v2 = new THREE.Vector3().crossVectors(ax, v1);
    for (let k = 0; k < seg; k++) {
      const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
      const d0 = v1.clone().multiplyScalar(Math.cos(a0)).addScaledVector(v2, Math.sin(a0)), d1 = v1.clone().multiplyScalar(Math.cos(a1)).addScaledVector(v2, Math.sin(a1));
      const nm = d0.clone().add(d1).normalize();
      this.quad(a.clone().addScaledVector(d0, r0), a.clone().addScaledVector(d1, r0), b.clone().addScaledVector(d1, r1), b.clone().addScaledVector(d0, r1), nm, col, [sw0, sw0, sw1, sw1]);
    }
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.w, 1));
    g.setIndex(this.i);
    return g;
  }
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const jit = (c: number[], k: number) => { const t = 1 + (R() - 0.5) * k; return [c[0] * t, c[1] * t * (1 + (R() - 0.5) * k * 0.4), c[2] * t]; };


function rosette(B: Builder, c: THREE.Vector3, out: THREE.Vector3, n: number, L: number, col: number[], young: number[], sway: number, fold = false) {
  const up = V(0, 1, 0), a0 = R() * 6.28;
  for (let k = 0; k < n; k++) {
    const an = a0 + k * 2.4, inner = k < 2;
    // each leaf leans out from the rosette's axis (the shoot's direction), the inner ones more upright
    const side = V(Math.cos(an), 0, Math.sin(an)), tilt = inner ? 0.35 : 0.85;
    const d = out.clone().multiplyScalar(1 - tilt * 0.6).addScaledVector(side, tilt).addScaledVector(up, 0.25).normalize();
    const w = V(-d.z, 0, d.x).normalize(), l = L * (inner ? 0.6 : rr(0.85, 1.15));
    const nrm = new THREE.Vector3().crossVectors(w, d).normalize(); if (nrm.y < 0) nrm.negate();
    const dome = out.clone().add(up).normalize(), nm = nrm.lerp(dome, 0.55).normalize();
    // spoon-shaped: narrow at the stalk, widest two-thirds out, round at the tip
    const p0 = c, p1 = c.clone().addScaledVector(d, l * 0.62), p2 = c.clone().addScaledVector(d, l);
    const hw = l * 0.24, cl = jit(inner ? young : col, 0.2);
    if (!fold) { B.quad(p0, p1.clone().addScaledVector(w, -hw), p2, p1.clone().addScaledVector(w, hw), nm, cl, [sway, sway + 0.05, sway + 0.1, sway + 0.05]); continue; }
    // a thick felted leaf: folded up along the midrib, arched, its tip curling down — four facets, each
    // shaded a little differently, so it reads as a leaf with a body rather than a flat card
    const m1 = c.clone().addScaledVector(d, l * 0.5).addScaledVector(up, l * 0.08), m2 = c.clone().addScaledVector(d, l).addScaledVector(up, -l * 0.18);
    const eAt = (t: number, sgn: number, wd: number) => c.clone().addScaledVector(d, l * t).addScaledVector(w, sgn * wd).addScaledVector(up, -wd * 0.45 + (t < 0.7 ? l * 0.05 : -l * 0.06));
    for (const sgn of [-1, 1]) {
      const e1 = eAt(0.5, sgn, hw * 1.1), e2 = eAt(0.82, sgn, hw * 0.75);
      const fn = (a: THREE.Vector3, b: THREE.Vector3, q: THREE.Vector3) => { const f = new THREE.Vector3().crossVectors(b.clone().sub(a), q.clone().sub(a)).normalize(); if (f.y < 0) f.negate(); return f.lerp(dome, 0.45).normalize(); };
      B.quad(c, e1, m1, m1, fn(c, e1, m1), cl, [sway, sway + 0.05, sway + 0.05, sway + 0.05]);
      B.quad(m1, e1, e2, m2, fn(m1, e1, m2), cl.map((v) => v * 0.93), [sway + 0.05, sway + 0.05, sway + 0.1, sway + 0.1]);
    }
  }
}
function dome(B: Builder, c: THREE.Vector3, rx: number, ry: number, col: number[], sway: number, cap = false) {
  const NU = 12, NV = 5, seed = R() * 30, pt = (i: number, j: number) => {
    const u = i / NU * 6.28, v = j / NV * Math.PI * 0.5, n = V(Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u));
    const r = 0.85 + 0.25 * Math.abs(Math.sin(u * 3 + seed) * Math.sin(v * 4 + seed * 0.7));
    return { p: V(c.x + n.x * rx * r, c.y + n.y * ry * r, c.z + n.z * rx * r), n };
  };
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = pt(i, j), b = pt(i + 1, j), d = pt(i + 1, j + 1), e = pt(i, j + 1);
    B.quad(a.p, b.p, d.p, e.p, a.n.clone().add(d.n).normalize(), jit(col, 0.15), [sway * 0.5, sway * 0.5, sway, sway]);
  }
  // (a crown up in the air is closed underneath: a shallow, shaded underside, not a hollow seen into from below)
  if (cap) for (let i = 0; i < NU; i++) {
    const a = pt(i, 0), b = pt(i + 1, 0), lo = V(c.x, c.y - ry * 0.25, c.z);
    const nn = V(a.n.x * 0.6, -0.5, a.n.z * 0.6).normalize();
    B.quad(a.p, lo, b.p, b.p, nn, jit(col.map((v) => v * 0.8), 0.12), [sway * 0.5, sway * 0.5, sway * 0.5, sway * 0.5]);
  }
}
export function historicalShrubGeo(silver: boolean) {
  const B = new Builder(), bark = silver ? [0.42, 0.38, 0.32] : [0.4, 0.36, 0.26];
  if (!silver) {
    dome(B, V(0, 0.02, 0), 0.5, 0.42, [0.13, 0.3, 0.11], 0.15);
    // shoots spreading from the foot to points over a low dome, a rosette at each
    for (let k = 0; k < 85; k++) {
      const u = R() * 6.28, v = Math.acos(1 - R() * 1.1);
      const nm = V(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
      const tip = V(nm.x * 0.6, 0.08 + nm.y * 0.45, nm.z * 0.6).multiplyScalar(rr(0.8, 1.05));
      const mid = tip.clone().multiplyScalar(0.5).add(V(0, -0.04, 0));
      if (k % 3 === 0) { B.tube(V(nm.x * 0.05, 0, nm.z * 0.05), mid, 0.018, 0.012, bark, 0, 0.1, 3); B.tube(mid, tip, 0.012, 0.008, bark, 0.1, 0.25, 3); }
      rosette(B, tip, V(nm.x, nm.y * 0.6, nm.z).normalize(), 8, rr(0.15, 0.2), [0.2, 0.44, 0.16], [0.42, 0.6, 0.25], 0.25);
    }
  } else {
    // a short crooked trunk, limbs out and up, twigs ending in rosettes
    const top = V(rr(-0.06, 0.06), 0.22, rr(-0.06, 0.06)), cc = top.clone().add(V(0, 0.26, 0));
    B.tube(V(0, 0, 0), top, 0.05, 0.035, bark, 0, 0.05, 6);
    dome(B, cc.clone().add(V(0, -0.1, 0)), 0.3, 0.28, [0.27, 0.33, 0.25], 0.25, true);
    for (let k = 0; k < 5; k++) {
      const an = k * 1.26 + R() * 0.5, e = top.clone().add(V(Math.cos(an) * rr(0.18, 0.28), rr(0.1, 0.2), Math.sin(an) * rr(0.18, 0.28)));
      B.tube(top, e, 0.03, 0.015, bark, 0.05, 0.25, 4);
      for (let j = 0; j < 9; j++) {
        // twig ends over a rounded crown
        const u = an + rr(-0.75, 0.75), v = Math.acos(1 - R() * 1.55), t = cc.clone().add(V(Math.sin(v) * Math.cos(u) * 0.48, Math.cos(v) * 0.4, Math.sin(v) * Math.sin(u) * 0.48));   // (a rounded heap, down its sides too)
        B.tube(e, t, 0.012, 0.006, bark, 0.25, 0.35, 3);
        const o = t.clone().sub(cc).normalize();
        rosette(B, t, o, 11, rr(0.13, 0.17), [0.46, 0.54, 0.44], [0.56, 0.64, 0.5], 0.35, true);
      }
    }
  }
  return B.geo();
}
