// The sail work's things as they look (nature team, 2026-10-20; main's window: worksite-look.ts, PR #56): the cut
// pandanus leaves, the strips split from them and the scrap, the sail mat, the bamboo mast. Shapes only — laid out and
// drawn with the husk-and-cord things (robots/coir-look.ts, which builds these inside its quiet(), so no three.js id
// draws the world's Math.random). Each shape is the same for every one of its kind and look (their sizes are the
// world's fixed ones: the mast 2.5 m, the mat 2 m² — sail-raft-rules mastMm, sail-work requestedAreaCm2); a thing's own
// small differences (turn, size) come from its id, in the layout. Nothing here reads a hidden value.
// Attributes, as coir-look's thingMat takes them: color (a tint on the kind's tone), aIn (1: the mat's woven face,
// patterned in the shader; 0 elsewhere), aWv (where on the weave, metres, for that pattern). Lying along x, on y = 0.
import * as THREE from 'three';
import { draw } from '../science/rng';

const r = (...k: string[]) => draw(0x7361696c, 'sail-shape', ...k);   // ('sail': the shapes' own random numbers, fixed)

class Shape {
  P: number[] = []; C: number[] = []; I: number[] = []; W: number[] = []; idx: number[] = [];
  v(p: number[], c: number[], inn = 0, wv: number[] = [0, 0]) { this.P.push(p[0], p[1], p[2]); this.C.push(c[0], c[1], c[2]); this.I.push(inn); this.W.push(wv[0], wv[1]); return this.P.length / 3 - 1; }
  // a strip of quads: rows[i] is a row of vertex indices across; joined row to row
  join(rows: number[][]) { for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j + 1 < rows[i].length; j++) { const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j], d = rows[i + 1][j + 1]; this.idx.push(a, c, b, b, c, d); } }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aIn', new THREE.Float32BufferAttribute(this.I, 1)); g.setAttribute('aWv', new THREE.Float32BufferAttribute(this.W, 2));
    g.setIndex(this.idx); g.computeVertexNormals();
    return g;
  }
}
const grey = (k: number) => [k, k, k];

/** Cut pandanus leaves, a bundle of seven laid together, bases even: long, sword-like, folded along the midrib and
 *  narrowing to a point. Fresh: green, deeply folded, a little glossy (the tone's). Drying: yellowing from the tips, the
 *  fold slackening, a little curled. Dry: straw, flat, the edges curling up a little. */
export function leavesGeo(look: 'fresh' | 'drying' | 'dry'): THREE.BufferGeometry {
  const S = new Shape(), SEG = 12;
  for (let k = 0; k < 7; k++) {
    const q = (n: string) => r('leaf', look, String(k), n);
    const L = 1.1 + 0.3 * q('len'), W = 0.055 + 0.015 * q('w'), z0 = (k - 3) * 0.032 + (q('z') - 0.5) * 0.012, fan = (q('fan') - 0.5) * 0.12, y0 = 0.003 + k % 3 * 0.004;
    const fold = look === 'fresh' ? 0.014 : look === 'drying' ? 0.008 : 0.003, tone = 0.88 + 0.24 * q('tone');
    const rows: number[][] = [];
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG, x = -0.55 + t * L, w = W * (1 - Math.pow(t, 1.8)) + 0.002, z = z0 + Math.sin(fan) * t * L;
      const curl = look === 'dry' ? 0.006 : look === 'drying' ? 0.004 * Math.sin(t * 5 + k) : 0;
      // (drying: yellow from the tip back; the rest the tone's)
      const tip = look === 'drying' ? Math.max(0, (t - 0.35) / 0.65) : 0;
      const c = [tone * (1 + 0.45 * tip), tone * (1 + 0.15 * tip), tone * (1 - 0.35 * tip)];
      const lift = y0 + Math.sin(t * 3.1 + k) * 0.004;
      rows.push([S.v([x, lift + fold + curl, z - w], c), S.v([x, lift, z], c.map((v) => v * 1.08)), S.v([x, lift + fold + curl, z + w], c)]);
    }
    S.join(rows);
  }
  return S.geo();
}

/** Strips split from the dried leaves: two dozen narrow ribbons a metre long, laid in a loose bundle, the ends apart. */
export function stripsGeo(): THREE.BufferGeometry {
  const S = new Shape(), SEG = 10;
  for (let k = 0; k < 24; k++) {
    const q = (n: string) => r('strip', String(k), n);
    const L = 0.9 + 0.12 * q('len'), w = 0.006, z0 = (k - 11.5) * 0.007, y0 = 0.002 + (k % 4) * 0.0025, tone = 0.88 + 0.24 * q('tone'), ph = q('ph') * 6.28;
    const rows: number[][] = [];
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG, x = -L / 2 + t * L, e = Math.abs(t - 0.5) * 2, z = z0 * (1 + 1.6 * e * e) + Math.sin(t * 7 + ph) * 0.004;
      rows.push([S.v([x, y0, z - w], grey(tone)), S.v([x, y0, z + w], grey(tone))]);
    }
    S.join(rows);
  }
  return S.geo();
}

/** The scrap: the spiny edges and ends cut off as the leaves were split — short narrow pieces in a low, loose heap. */
export function scrapGeo(): THREE.BufferGeometry {
  const S = new Shape(), SEG = 5;
  for (let k = 0; k < 30; k++) {
    const q = (n: string) => r('scrap', String(k), n);
    const L = 0.15 + 0.3 * q('len'), w = 0.003 + 0.004 * q('w'), a = q('a') * Math.PI * 2, bend = (q('b') - 0.5) * 2.2, rr0 = 0.13 * Math.sqrt(q('r'));
    const cx = Math.cos(a) * rr0, cz = Math.sin(a) * rr0, y0 = 0.003 + 0.03 * (1 - rr0 / 0.13) * q('y'), d = q('d') * Math.PI * 2, tone = 0.8 + 0.3 * q('tone');
    const rows: number[][] = [];
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG - 0.5, ang = d + bend * t, x = cx + Math.cos(d) * t * L + Math.cos(ang) * 0.02 * t, z = cz + Math.sin(d) * t * L + Math.sin(ang) * 0.02 * t;
      const nx = -Math.sin(ang) * w, nz = Math.cos(ang) * w, y = Math.max(0.002, y0 - Math.abs(t) * 0.03);
      rows.push([S.v([x - nx, y, z - nz], grey(tone)), S.v([x + nx, y, z + nz], grey(tone))]);
    }
    S.join(rows);
  }
  return S.geo();
}

// the mat: the raft's one sail, 2 m² (1.25 m across, 1.6 m long, along z)
const MAT_W = 1.25, MAT_L = 1.6;
/** The sail mat. Weaving: lying open, woven from one end most of the way, the strips not yet woven in fanning loose from
 *  the woven edge (how far it has come is a number the world keeps: always drawn as one stage). Done: rolled up along its
 *  width and tied in two places. Torn: lying open, a rip running in from one edge, the strips frayed along it. */
export function matGeo(look: 'weaving' | 'done' | 'torn'): THREE.BufferGeometry {
  const S = new Shape(), NX = 24, NZ = 30;
  if (look === 'done') {
    // the roll: as long as the mat is wide, a hand's breadth across; its woven face outside; two cord ties
    const R0 = 0.075, N = 20, rows: number[][] = [];
    for (let i = 0; i <= NX; i++) {
      const x = -MAT_W / 2 + i / NX * MAT_W, tie = [-0.35, 0.35].some((tx) => Math.abs(x - tx * MAT_W) < 0.02), row: number[] = [];
      for (let j = 0; j <= N; j++) { const a = j / N * Math.PI * 2, rr = R0 + (tie ? 0.004 : 0); row.push(S.v([x, R0 + Math.sin(a) * rr, Math.cos(a) * rr], tie ? [0.62, 0.48, 0.34] : grey(1), tie ? 0 : 1, [x, a * R0])); }
      rows.push(row);
    }
    S.join(rows);
    for (const sx of [-1, 1]) {   // (the roll's ends: the mat's edge coiled, a little darker)
      const c = S.v([sx * MAT_W / 2, R0, 0], grey(0.72)), ring: number[] = [];
      for (let j = 0; j <= N; j++) { const a = j / N * Math.PI * 2; ring.push(S.v([sx * MAT_W / 2, R0 + Math.sin(a) * R0, Math.cos(a) * R0], grey(0.85))); }
      for (let j = 0; j < N; j++) S.idx.push(...(sx > 0 ? [c, ring[j], ring[j + 1]] : [c, ring[j + 1], ring[j]]));
    }
    return S.geo();
  }
  const woven = look === 'weaving' ? 0.62 : 1;   // (how far along its length the weave is drawn)
  // (a rip in from the far edge: one continuous jagged slit — never narrower than a cell, so never a row of holes)
  const rip = (x: number, z: number) => look === 'torn' && Math.abs(x - (0.18 + (z / MAT_L + 0.5) * -0.3)) < 0.6 * MAT_W / NX && z > -0.1;
  const hgt = (x: number, z: number) => 0.004 + 0.006 * Math.sin(x * 4.1 + z * 2.3) * Math.sin(z * 3.7) + (look === 'torn' ? 0.01 * Math.max(0, Math.sin(x * 6 + 1)) : 0);
  const grid: number[][] = [];
  for (let j = 0; j <= NZ; j++) {
    const z = -MAT_L / 2 + j / NZ * MAT_L * woven, row: number[] = [];
    for (let i = 0; i <= NX; i++) { const x = -MAT_W / 2 + i / NX * MAT_W; row.push(S.v([x, hgt(x, z), z], grey(1), 1, [x, z])); }
    grid.push(row);
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = -MAT_W / 2 + (i + 0.5) / NX * MAT_W, z = -MAT_L / 2 + (j + 0.5) / NZ * MAT_L * woven;
    if (rip(x, z)) continue;
    const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1]; S.idx.push(a, c, b, b, c, d);
  }
  // loose strips: from the woven edge (weaving), or frayed along the rip (torn) — narrow ribbons, as the strips
  const loose = (x0: number, z0: number, dx: number, dz: number, L: number, k: number, tone: number) => {
    const rows: number[][] = [], w = 0.006;
    for (let s = 0; s <= 6; s++) {
      const t = s / 6, x = x0 + dx * t * L, z = z0 + dz * t * L, y = hgt(x0, z0) + 0.002 + Math.sin(t * 4 + k) * 0.004;
      rows.push([S.v([x - dz * w, y, z + dx * w], grey(tone)), S.v([x + dz * w, y, z - dx * w], grey(tone))]);
    }
    S.join(rows);
  };
  if (look === 'weaving') for (let k = 0; k < 44; k++) {
    const q = (n: string) => r('loose', String(k), n), x0 = -MAT_W / 2 + (k + 0.5) / 44 * MAT_W, sp = (x0 / MAT_W) * 0.5 + (q('sp') - 0.5) * 0.12;
    loose(x0, -MAT_L / 2 + MAT_L * woven, Math.sin(sp), Math.cos(sp), MAT_L * (1 - woven) * (0.9 + 0.3 * q('len')), k, 0.9 + 0.2 * q('tone'));
  }
  if (look === 'torn') for (let k = 0; k < 18; k++) {
    const q = (n: string) => r('fray', String(k), n), z0 = -0.1 + (k / 18) * (MAT_L / 2 + 0.1), x0 = 0.18 + (z0 / MAT_L + 0.5) * -0.3, sx = k % 2 ? 1 : -1;
    loose(x0 + sx * 0.6 * MAT_W / NX, z0, sx * 0.7, (q('d') - 0.5) * 0.8, 0.03 + 0.05 * q('len'), k, 0.85 + 0.2 * q('tone'));
  }
  return S.geo();
}

// the mast: bamboo, 2.5 m (along x), its nodes a little proud and darker
const MAST_L = 2.5;
function bamboo(S: Shape, x0: number, x1: number, r0: number, r1: number, jag0: string, jag1: string) {
  const N = 9, rows: number[][] = [], segs = Math.max(2, Math.round((x1 - x0) / 0.04));
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, x = x0 + (x1 - x0) * t, X = x + MAST_L / 2, node = Math.abs(((X + 0.16) % 0.32) - 0.16) < 0.012;
    const rad = (r0 + (r1 - r0) * t) * (node ? 1.1 : 1), row: number[] = [];
    for (let j = 0; j <= N; j++) {
      const a = j / N * Math.PI * 2, end = i === 0 ? jag0 : i === segs ? jag1 : '';
      // (a broken end: its rim splintered, long and short slivers)
      const jag = end ? (r(end, String(j % N)) * 0.07) * (i === 0 ? -1 : 1) : 0;
      row.push(S.v([x + jag, r0 + Math.sin(a) * rad, Math.cos(a) * rad], node ? grey(0.78) : end ? grey(1.25) : grey(1)));
    }
    rows.push(row);
  }
  S.join(rows);
}
/** The bamboo mast. Cut: whole, lying. Broken: snapped in two, the pieces lying apart, the break splintered. */
export function mastGeo(look: 'cut' | 'broken'): THREE.BufferGeometry {
  const S = new Shape(), r0 = 0.03, r1 = 0.024;
  if (look === 'cut') bamboo(S, -MAST_L / 2, MAST_L / 2, r0, r1, '', '');
  else {
    bamboo(S, -MAST_L / 2, 0.25, r0, r0 + (r1 - r0) * 0.6, '', 'jag-a');
    // (the top piece fallen a little apart and turned)
    const o = S.P.length / 3; bamboo(S, 0.25, MAST_L / 2, r0 + (r1 - r0) * 0.6, r1, 'jag-b', '');
    const c = Math.cos(0.45), s = Math.sin(0.45);
    for (let i = o; i < S.P.length / 3; i++) { const x = S.P[i * 3] - 0.25, z = S.P[i * 3 + 2]; S.P[i * 3] = 0.33 + x * c - z * s; S.P[i * 3 + 2] = 0.12 + x * s + z * c; }
  }
  return S.geo();
}

export const SAIL_SIZE = { matW: MAT_W, matL: MAT_L, mastL: MAST_L };
