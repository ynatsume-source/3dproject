// The sky's clouds, worked out on the CPU exactly as the sky shader draws them (cloudAt in render/common.ts,
// with its hash2 / vn2 / fbm2): so the light of the moon (or the sun) under the water can follow whether a
// cloud is in front of it in the sky above, and what is seen below agrees with what is seen above.
// Keep in step with the GLSL.

const fract = (x: number) => x - Math.floor(x);
function hash2(x: number, y: number) {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return fract((a + b) * c);
}
function vn2(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}
function fbm2(x: number, y: number) {
  let a = 0.5, s = 0;
  for (let i = 0; i < 5; i++) { s += a * vn2(x, y); const nx = 1.6 * x - 1.2 * y, ny = 1.2 * x + 1.6 * y; x = nx; y = ny; a *= 0.5; }
  return s;
}
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** How much cloud is in front of the sky in direction d (a unit vector, y up), 0 clear .. 1 covered;
 *  time: uTime (s); cloud: today's cover 0..1 (uCloud). */
export function cloudAt(dx: number, dy: number, dz: number, time: number, cloud: number) {
  if (dy <= 0) return 0;
  const px = dx / (dy + 0.06) * 0.9 + time * 0.004, py = dz / (dy + 0.06) * 0.9 + time * 0.0017;
  const n = fbm2(px * 1.3, py * 1.3) + 0.35 * fbm2(px * 4.1 + 3.1, py * 4.1 + 3.1) - 0.2;
  const cov = 0.26 + (1.02 - 0.26) * cloud;
  return smooth(1 - cov, 1.2 - cov, n) * smooth(0, 0.07, dy);
}
