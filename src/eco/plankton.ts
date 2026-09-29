// A coarse 2-D plankton field over the sea. The tidal current carries it, daylight feeds the
// phytoplankton, zooplankton rises into the water column after dark, and planktivores graze it down.
import { vnoise } from '../core/math';

export class Plankton {
  readonly N = 48;
  readonly half: number;
  readonly cell: number;
  a: Float32Array;
  private b: Float32Array;
  private acc = 0;

  constructor(half: number) {
    this.half = half;
    this.cell = (half * 2) / this.N;
    this.a = new Float32Array(this.N * this.N);
    this.b = new Float32Array(this.N * this.N);
    for (let j = 0; j < this.N; j++) for (let i = 0; i < this.N; i++) this.a[j * this.N + i] = 0.35 + 0.3 * vnoise(i * 0.35, j * 0.35);
  }

  private idx(x: number, z: number): [number, number, number, number] {
    const fx = (x + this.half) / this.cell - 0.5, fz = (z + this.half) / this.cell - 0.5;
    const i = Math.max(0, Math.min(this.N - 2, Math.floor(fx))), j = Math.max(0, Math.min(this.N - 2, Math.floor(fz)));
    return [i, j, Math.max(0, Math.min(1, fx - i)), Math.max(0, Math.min(1, fz - j))];
  }

  sample(x: number, z: number): number {
    const [i, j, u, v] = this.idx(x, z), N = this.N, a = this.a;
    const p = a[j * N + i], q = a[j * N + i + 1], r = a[(j + 1) * N + i], s = a[(j + 1) * N + i + 1];
    return (p + (q - p) * u) * (1 - v) + (r + (s - r) * u) * v;
  }

  consume(x: number, z: number, amount: number) {
    const [i, j] = this.idx(x, z), k = j * this.N + i;
    this.a[k] = Math.max(0.02, this.a[k] - amount);
  }

  update(dt: number, cur: { x: number; z: number }, sunI: number, night: number, t: number) {
    this.acc += dt;
    if (this.acc < 0.25) return;
    const step = this.acc; this.acc = 0;
    const N = this.N, a = this.a, b = this.b;
    const base = 0.22 + 0.25 * sunI + 0.5 * night;
    const drift = 0.6;     // m/s of plankton drift per unit of current
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      // semi-Lagrangian advection: pick up what was upstream
      const x = (i + 0.5) * this.cell - this.half - cur.x * drift * step;
      const z = (j + 0.5) * this.cell - this.half - cur.z * drift * step;
      let v = (Math.abs(x) > this.half || Math.abs(z) > this.half) ? base : this.sample(x, z);
      // patches bloom and fade slowly
      const patch = 0.75 + 0.5 * vnoise(i * 0.3 + t * 0.004, j * 0.3 - t * 0.003);
      v += (base * patch - v) * Math.min(1, step * 0.02);
      b[j * N + i] = v;
    }
    this.a = b; this.b = a;
  }
}
