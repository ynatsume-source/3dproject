// Deterministic noise, seeded randomness and small helpers shared by terrain, placement and simulation.

export function hash(x: number, z: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export function vnoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, z: number, oct = 5): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f); n += a; f *= 2.03; a *= 0.5; }
  return s / n;
}

export const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
export const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
export const angDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One shared seeded stream: reseeded when a sea is built so its layout is stable between visits.
let stream = mulberry32(1);
export const seedRandom = (seed: number) => { stream = mulberry32(seed); };
/** The stream of draws itself: a sea built a slice at a time keeps its own between slices (main.ts, ocean/build.ts). */
export const getStream = () => stream;
export const setStream = (s: () => number) => { stream = s; };
export const R = (): number => stream();
export const rr = (a: number, b: number): number => a + (b - a) * stream();
export const pick = <T>(arr: T[]): T => arr[Math.floor(stream() * arr.length)];

// Terrain functions report the reef cover of the last sampled point here.
export const TERR = { reef: 0 };

function cellHash(i: number, j: number, s: number) { return hash(i * 1.37 + s * 17.1, j * 2.11 - s * 9.3); }

// (each cell's draws are kept once worked out, per seed: the terrain is sampled millions of times while a sea is built,
// and the same few thousand cells are asked for again and again — the values are the same, only not recomputed)
const bommieMemo = new Map<number, Map<number, Float64Array>>();

// Coral heads / pinnacles: flat-topped mounds scattered on a jittered grid. Returns [height, reefMask].
export function bommieField(x: number, z: number, cell: number, prob: number, hMin: number, hMax: number,
  rMin: number, rMax: number, seed: number, edge = 0.55): [number, number] {
  const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
  let h = 0, m = 0;
  let memo = bommieMemo.get(seed); if (!memo) bommieMemo.set(seed, memo = new Map());
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const i = ci + di, j = cj + dj;
    const key = (i + 16384) * 32768 + (j + 16384);
    let c = memo.get(key);
    if (!c) { c = new Float64Array([cellHash(i, j, seed), cellHash(i, j, seed + 1), cellHash(i, j, seed + 2), cellHash(i, j, seed + 3), cellHash(i, j, seed + 4)]); memo.set(key, c); }
    if (c[0] > prob) continue;
    const cx = (i + 0.2 + 0.6 * c[1]) * cell, cz = (j + 0.2 + 0.6 * c[2]) * cell;
    const r = rMin + (rMax - rMin) * c[3], hh = hMin + (hMax - hMin) * c[4];
    const dx = x - cx, dz = z - cz, dd = dx * dx + dz * dz, far = r * 1.05 * 1.08;
    if (dd > far * far) continue;   // (out of reach of this one: skip the trig)
    const ang = Math.atan2(dz, dx);
    const rad = r * (0.85 + 0.12 * Math.sin(ang * 3 + seed + i) + 0.08 * Math.sin(ang * 5 + j));
    const d = Math.sqrt(dd) / rad;
    h = Math.max(h, hh * (1 - smooth(edge, 1.0, d)));
    m = Math.max(m, smooth(1.08, 0.62, d));
  }
  return [h, m];
}
