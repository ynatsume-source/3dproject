// Real terrain for seas that come ashore: baked from survey data by scripts/bake-<id>.py into height
// maps (cm), reef cover and land cover (tree canopy, dry sand, bare rock), plus the aerial photograph
// draped over the land. Two grids: close in at 1 m (+-half) and the whole island at 2 m (+-farHalf).
// Loaded before the sea is built; sampled bilinearly, from the fine grid where it reaches.
import * as THREE from 'three';

interface Grid { N: number; half: number; st: number; h: Float32Array; reef: Uint8Array; canopy: Uint8Array; sand: Uint8Array; rock: Uint8Array; photo: THREE.Texture; cover: THREE.DataTexture }
export interface Land {
  near: Grid; far: Grid;
  h(x: number, z: number): number;
  reef(x: number, z: number): number;      // 0..1
  canopy(x: number, z: number): number;    // 0..1
  sand(x: number, z: number): number;      // 0..1
  rock(x: number, z: number): number;      // 0..1
}
const lands: Record<string, Land> = {};
export const landOf = (id: string): Land | undefined => lands[id];

async function pixels(url: string) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  return { w: bmp.width, d: g.getImageData(0, 0, bmp.width, bmp.height).data };
}
async function grid(base: string, half: number): Promise<Grid> {
  const [H, C, photo] = await Promise.all([pixels(`${base}_h.png`), pixels(`${base}_c.png`), new THREE.TextureLoader().loadAsync(`${base}.jpg`)]);
  const N = H.w, n = N * N;
  const h = new Float32Array(n), reef = new Uint8Array(n), canopy = new Uint8Array(n), sand = new Uint8Array(n), rock = new Uint8Array(n);
  const cov = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    h[i] = (H.d[i * 4] * 256 + H.d[i * 4 + 1] - 32768) / 100; reef[i] = H.d[i * 4 + 2];
    canopy[i] = C.d[i * 4]; sand[i] = C.d[i * 4 + 1]; rock[i] = C.d[i * 4 + 2];
    cov[i * 4] = canopy[i]; cov[i * 4 + 1] = sand[i]; cov[i * 4 + 2] = rock[i]; cov[i * 4 + 3] = 255;
  }
  photo.flipY = false; photo.wrapS = photo.wrapT = THREE.ClampToEdgeWrapping; photo.anisotropy = 8; photo.needsUpdate = true;
  const cover = new THREE.DataTexture(cov, N, N, THREE.RGBAFormat);
  cover.magFilter = cover.minFilter = THREE.LinearFilter; cover.needsUpdate = true;
  return { N, half, st: 2 * half / N, h, reef, canopy, sand, rock, photo, cover };
}
// bilinear sample of a grid over [-half, half]^2 (row 0 = north, z grows southward)
function at(G: Grid, a: ArrayLike<number>, x: number, z: number) {
  const N = G.N, fx = Math.min(N - 1.001, Math.max(0, (x + G.half) / G.st - 0.5)), fz = Math.min(N - 1.001, Math.max(0, (z + G.half) / G.st - 0.5));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * N + i;
  return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + N] * (1 - u) + a[k + N + 1] * u) * v;
}

// let a sea's land go (its sea has been let go: src/main.ts, KEEP_SEAS) — loaded again if it is visited again
export function forgetLand(id: string) { delete lands[id]; }
export async function loadLand(id: string, half: number, farHalf: number): Promise<Land> {
  if (lands[id]) return lands[id];
  const base = `${import.meta.env?.BASE_URL ?? '/'}land/${id}`;
  const [near, far] = await Promise.all([grid(base, half), grid(`${base}_far`, farHalf)]);
  // the fine grid inside its square, easing into the coarse one over its last 10 m
  const pick = (k: (G: Grid) => ArrayLike<number>, s: number) => (x: number, z: number) => {
    const e = Math.max(Math.abs(x), Math.abs(z)), w = Math.min(1, Math.max(0, (half - 2 - e) / 10));
    if (w >= 1) return at(near, k(near), x, z) * s;
    const fv = at(far, k(far), x, z) * s;
    return w <= 0 ? fv : fv + (at(near, k(near), x, z) * s - fv) * w;
  };
  return (lands[id] = {
    near, far,
    h: pick((G) => G.h, 1), reef: pick((G) => G.reef, 1 / 255), canopy: pick((G) => G.canopy, 1 / 255),
    sand: pick((G) => G.sand, 1 / 255), rock: pick((G) => G.rock, 1 / 255),
  });
}
