// What kind of water is where, on an island's sea: the open sea, a lagoon sheltered inside the reef, a pool
// cut off from the sea, water inland, or dry land. Read once from the terrain when the sea is built: every
// cell below the mean surface that the open sea reaches (from the edge of the map, cell to cell along their
// sides) is the sea; the rest of the low ground is cut off from it — a pool close to the shore (a tide pool,
// or only a hollow the survey smoothed into the land: which, is for the imagery to say), or water further in.
// The same answer is used for the waves drawn on the surface (the sea's swell does not come into a pool, and
// comes into a lagoon weakened), for the camera riding them, and for where the residents go into the water.
//
// The sea level here is the model's mean sea (y = 0): the rendered sea has no tide (src/ocean/air.ts).
import * as THREE from 'three';
import { due, drain } from '../core/slice';

export type WaterKind = 'sea' | 'lagoon' | 'pool' | 'inland' | 'dry';
const KINDS: WaterKind[] = ['dry', 'sea', 'lagoon', 'pool', 'inland'];
/** How much of the sea's swell reaches each kind of water (0 still .. 1 all of it). */
const SWELL_K: Record<WaterKind, number> = { dry: 0, sea: 1, lagoon: 0.35, pool: 0, inland: 0 };

export interface Water {
  at(x: number, z: number): WaterKind;
  /** How much of the sea's swell reaches (x, z), eased across the cells (as the GPU reads the texture). */
  swellK(x: number, z: number): number;
  /** The swell factor as a texture over [x0, x0 + size] × [z0, z0 + size], or null where the swell is everywhere. */
  tex: THREE.DataTexture | null; x0: number; z0: number; size: number;
  counts: Record<WaterKind, number>;
}

const POOL_REACH = 30;     // a cut-off hollow this close to the sea (m): a pool on the shore; further: inland water
const LAGOON_DEPTH = 2;    // the sea shallower than this (m) …
const LAGOON_OFF = 40;     // … and this far from water 4 m deep (m): a lagoon, sheltered inside the reef

/** f: the floor height (the land above the sea, the seabed below it); half: how far the land reaches from the
 *  middle (m), 0 for a sea with no island (all water below 0 is the sea). */
export function classifyWater(f: (x: number, z: number) => number, half: number, cell = 2): Water { return drain(classifyWaterSteps(f, half, cell)); }
/** The same, giving way between rows of samples when a slice is up (core/slice.ts). */
export function* classifyWaterSteps(f: (x: number, z: number) => number, half: number, cell = 2): Generator<string, Water, unknown> {
  if (!(half > 0)) {
    return { at: (x, z) => f(x, z) < 0 ? 'sea' : 'dry', swellK: () => 1, tex: null, x0: 0, z0: 0, size: 0,
      counts: { sea: 0, lagoon: 0, pool: 0, inland: 0, dry: 0 } };
  }
  const n = Math.round(half * 2 / cell) + 1, x0 = -half, N = n * n;
  const h = new Float32Array(N);
  for (let j = 0; j < n; j++) { if (due()) yield 'seabed'; for (let i = 0; i < n; i++) h[i + j * n] = f(x0 + i * cell, x0 + j * cell); }
  const kind = new Uint8Array(N);   // index into KINDS
  // the open sea: from every wet cell on the edge, along the sides of cells
  const q = new Int32Array(N); let qh = 0, qt = 0;
  for (let k = 0; k < n; k++) for (const c of [k, k + (n - 1) * n, k * n, k * n + n - 1]) if (h[c] < 0 && !kind[c]) { kind[c] = 1; q[qt++] = c; }
  const nb = (c: number, out: number[]) => {
    const i = c % n; out.length = 0;
    if (i > 0) out.push(c - 1); if (i < n - 1) out.push(c + 1); if (c >= n) out.push(c - n); if (c < N - n) out.push(c + n);
    return out;
  };
  const tmp: number[] = [];
  while (qh < qt) { const c = q[qh++]; for (const d of nb(c, tmp)) if (!kind[d] && h[d] < 0) { kind[d] = 1; q[qt++] = d; } }
  // how far each cell is from a set of cells (m, along the grid): breadth-first from all of them at once
  const dist = (src: (c: number) => boolean) => {
    const d = new Float32Array(N).fill(Infinity); qh = qt = 0;
    for (let c = 0; c < N; c++) if (src(c)) { d[c] = 0; q[qt++] = c; }
    while (qh < qt) { const c = q[qh++]; for (const e of nb(c, tmp)) if (d[e] === Infinity) { d[e] = d[c] + cell; q[qt++] = e; } }
    return d;
  };
  const fromSea = dist((c) => kind[c] === 1), fromDeep = dist((c) => kind[c] === 1 && h[c] < -4);
  for (let c = 0; c < N; c++) {
    if (kind[c] === 1) { if (h[c] > -LAGOON_DEPTH && fromDeep[c] > LAGOON_OFF) kind[c] = 2; }
    else if (h[c] < 0) kind[c] = fromSea[c] <= POOL_REACH ? 3 : 4;
  }
  const counts = { sea: 0, lagoon: 0, pool: 0, inland: 0, dry: 0 } as Record<WaterKind, number>;
  for (let c = 0; c < N; c++) counts[KINDS[kind[c]]]++;
  // the swell factor: by kind; dry ground at the sea's edge takes the sea's (the waves run up the beach), dry ground
  // further in none (a hollow too small for the grid to find, between its points, is not the sea either)
  const k0 = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    if (kind[c]) { k0[c] = SWELL_K[KINDS[kind[c]]]; continue; }
    let m = 0; for (const d of nb(c, tmp)) if (kind[d] === 1 || kind[d] === 2) m = Math.max(m, SWELL_K[KINDS[kind[d]]]);
    k0[c] = m;
  }
  // (eased over the next cells round, so the sea's swell dies away into a lagoon rather than stopping at a line)
  const sk = new Float32Array(N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let s = 0, w = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const ww = di || dj ? 1 : 2; s += k0[ii + jj * n] * ww; w += ww;
    }
    // (still water stays still: a pool's own cells are not lifted by the sea next to it)
    const c = i + j * n; sk[c] = kind[c] >= 3 ? 0 : s / w;
  }
  const data = new Uint8Array(N);
  for (let c = 0; c < N; c++) data[c] = Math.round(sk[c] * 255);
  const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  // texel centres sit on the grid points: the texture covers one cell more than the grid, half a cell each side
  const size = n * cell, tx0 = x0 - cell / 2;
  const cellOf = (x: number, z: number) => {
    const i = Math.round((x - x0) / cell), j = Math.round((z - x0) / cell);
    return i < 0 || j < 0 || i >= n || j >= n ? -1 : i + j * n;
  };
  return {
    at(x, z) { const c = cellOf(x, z); return c < 0 ? (f(x, z) < 0 ? 'sea' : 'dry') : KINDS[kind[c]]; },
    swellK(x, z) {
      // (bilinear between the texel centres, as the GPU's linear filter reads it)
      const u = (x - x0) / cell, v = (z - x0) / cell;
      if (u < -0.5 || v < -0.5 || u > n - 0.5 || v > n - 0.5) return 1;
      const i = Math.max(0, Math.min(n - 2, Math.floor(u))), j = Math.max(0, Math.min(n - 2, Math.floor(v)));
      const a = Math.max(0, Math.min(1, u - i)), b = Math.max(0, Math.min(1, v - j));
      const g = (ii: number, jj: number) => data[ii + jj * n] / 255;
      return (g(i, j) * (1 - a) + g(i + 1, j) * a) * (1 - b) + (g(i, j + 1) * (1 - a) + g(i + 1, j + 1) * a) * b;
    },
    tex, x0: tx0, z0: tx0, size, counts,
  };
}
