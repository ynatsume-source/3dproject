// Real terrain for seas that come ashore: baked from survey data by scripts/bake-<id>.py into a height
// map (1 m grid, cm), reef cover and land cover (tree canopy, dry sand, bare rock), plus the aerial
// photograph draped over the land. Loaded before the sea is built; sampled bilinearly.
import * as THREE from 'three';

export interface Land {
  N: number; half: number;
  h: Float32Array; reef: Uint8Array; canopy: Uint8Array; sand: Uint8Array; rock: Uint8Array;
  photo: THREE.Texture; cover: THREE.DataTexture;
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

export async function loadLand(id: string, half: number): Promise<Land> {
  if (lands[id]) return lands[id];
  const base = `${import.meta.env.BASE_URL}land/${id}`;
  const [H, C, photo] = await Promise.all([
    pixels(`${base}_h.png`), pixels(`${base}_c.png`),
    new THREE.TextureLoader().loadAsync(`${base}.jpg`),
  ]);
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
  return (lands[id] = { N, half, h, reef, canopy, sand, rock, photo, cover });
}

// bilinear sample of a grid over [-half, half]^2 (row 0 = north, z grows southward)
export function sample(L: Land, a: ArrayLike<number>, x: number, z: number) {
  const N = L.N, fx = Math.min(N - 1.001, Math.max(0, x + L.half - 0.5)), fz = Math.min(N - 1.001, Math.max(0, z + L.half - 0.5));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * N + i;
  return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + N] * (1 - u) + a[k + N + 1] * u) * v;
}
