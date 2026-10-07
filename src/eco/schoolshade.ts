// The light inside a school. A fish at the top of a school is in full sun; one near the bottom of a big
// school sees it only through the bodies above it, and one in the thick of it sees little of the open water
// around it. Per fish, two numbers for the shader (aShade: sun, open water), worked out from the shape of
// its group as it was the frame before (the centre and spread of each group, gathered as the fish are moved).
import * as THREE from 'three';

export function makeSchoolShade(geo: THREE.BufferGeometry, n: number, groups = 1, opts: { round?: boolean; dens?: number } = {}) {
  const arr = new Float32Array(n * 2).fill(1);
  const attr = new THREE.InstancedBufferAttribute(arr, 2); attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aShade', attr);
  const round = opts.round ?? true;
  const acc = new Float64Array(groups * 8);   // sums: count, x, y, z, xx, yy, zz (this frame)
  const st = new Float32Array(groups * 7);    // centre x y z, radii x y z, how dense (last frame)
  return {
    attr,
    // dens: how much a body's worth of school above dims the sun (bigger, tighter schools: more)
    begin() { acc.fill(0); },
    set(i: number, g: number, x: number, y: number, z: number) {
      const a = g * 8;
      acc[a]++; acc[a + 1] += x; acc[a + 2] += y; acc[a + 3] += z; acc[a + 4] += x * x; acc[a + 5] += y * y; acc[a + 6] += z * z;
      const b = g * 7, rx = st[b + 3], ry = st[b + 4], rz = st[b + 5];
      if (!(ry > 0)) { arr[i * 2] = 1; arr[i * 2 + 1] = 1; return; }
      const dx = (x - st[b]) / rx, dy = (y - st[b + 1]) / ry, dz = (z - st[b + 2]) / rz;
      const h2 = round ? dx * dx + dz * dz : 0;
      // the column of school above this fish, in radii (0 at the top, 2 at the very bottom of the middle)
      const col = Math.max(0, Math.sqrt(Math.max(0, 1 - h2)) - dy);
      const k = st[b + 6];
      arr[i * 2] = Math.max(0.3, Math.exp(-col * k * 0.8));
      // how deep in the thick of it (0 at the edge, 1 at the heart)
      const core = Math.max(0, 1 - Math.sqrt(h2 + dy * dy));
      arr[i * 2 + 1] = 1 - 0.4 * core * Math.min(1, k) - 0.15 * (1 - Math.exp(-col * k * 0.5));
    },
    // the same, its position read from an array at o (x, y, z): no numbers handed over one by one, which in the long
    // per-fish loops (too long for the compiler to fold this in) were each boxed on the heap — 3 a fish a frame
    setFrom(i: number, g: number, pos: ArrayLike<number>, o: number) { this.set(i, g, pos[o], pos[o + 1], pos[o + 2]); },
    // (a fish not moved this frame: counted in the group's shape, its own light left as it was)
    keep(g: number, x: number, y: number, z: number) {
      const a = g * 8;
      acc[a]++; acc[a + 1] += x; acc[a + 2] += y; acc[a + 3] += z; acc[a + 4] += x * x; acc[a + 5] += y * y; acc[a + 6] += z * z;
    },
    end() {
      for (let g = 0; g < groups; g++) {
        const a = g * 8, c = acc[a], b = g * 7;
        if (c < 8) { st[b + 4] = 0; continue; }
        const mx = acc[a + 1] / c, my = acc[a + 2] / c, mz = acc[a + 3] / c;
        // (an even ball's radius is about 2.2 times its spread along any one axis)
        const sx = Math.sqrt(Math.max(0, acc[a + 4] / c - mx * mx)), sy = Math.sqrt(Math.max(0, acc[a + 5] / c - my * my)), sz = Math.sqrt(Math.max(0, acc[a + 6] / c - mz * mz));
        st[b] = mx; st[b + 1] = my; st[b + 2] = mz;
        st[b + 3] = Math.max(0.5, sx * 2.2); st[b + 4] = Math.max(0.3, sy * 2.2); st[b + 5] = Math.max(0.5, sz * 2.2);
        // how many fish stand in a column through the middle, from how many there are for its size
        const r = Math.cbrt(st[b + 3] * st[b + 4] * st[b + 5]);
        st[b + 6] = Math.min(1.6, (opts.dens ?? 1) * 0.12 * Math.sqrt(c) / Math.max(1, r * 0.35));
      }
      attr.needsUpdate = true;
    },
  };
}
