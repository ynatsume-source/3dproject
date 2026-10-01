// Finding a way on foot: A* over a grid laid between where one is and where it is going, each cell costing
// what it takes to cross it (Infinity: cannot — the sea for those who do not swim; a lot: a thicket one could
// push through but would rather go round), then pulled taut so the walk is a few straight legs, not a
// staircase. The grid is finer for short walks and coarser for long ones, so a walk across the island costs
// about as much to plan as a walk across the beach.

export type Cost = (x: number, z: number) => number;

export function findPath(sx: number, sz: number, tx: number, tz: number, cost: Cost): [number, number][] | null {
  const dist = Math.hypot(tx - sx, tz - sz);
  const C = Math.min(4, Math.max(1, dist / 160)), M = Math.max(25, dist * 0.35);
  const x0 = Math.min(sx, tx) - M, z0 = Math.min(sz, tz) - M;
  const W = Math.ceil((Math.abs(tx - sx) + 2 * M) / C) + 1, H = Math.ceil((Math.abs(tz - sz) + 2 * M) / C) + 1, N = W * H;
  const cx = (i: number) => x0 + (i % W + 0.5) * C, cz = (i: number) => z0 + (Math.floor(i / W) + 0.5) * C;
  const at = (x: number, z: number) => Math.min(H - 1, Math.max(0, Math.floor((z - z0) / C))) * W + Math.min(W - 1, Math.max(0, Math.floor((x - x0) / C)));
  const s = at(sx, sz), g = at(tx, tz);
  const cc = new Float32Array(N).fill(-1);
  const cellCost = (i: number) => { if (cc[i] < 0) cc[i] = i === s || i === g ? 1 : cost(cx(i), cz(i)); return cc[i]; };
  const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  // a binary heap of [f, cell]
  const hf: number[] = [], hi: number[] = [];
  const push = (f: number, i: number) => {
    let k = hf.length; hf.push(f); hi.push(i);
    while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [hf[p], hf[k]] = [hf[k], hf[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p; }
  };
  const pop = () => {
    const i = hi[0], lf = hf.pop()!, li = hi.pop()!;
    if (hf.length) {
      hf[0] = lf; hi[0] = li; let k = 0;
      for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < hf.length && hf[a] < hf[m]) m = a; if (b < hf.length && hf[b] < hf[m]) m = b; if (m === k) break; [hf[m], hf[k]] = [hf[k], hf[m]]; [hi[m], hi[k]] = [hi[k], hi[m]]; k = m; }
    }
    return i;
  };
  const hx = (i: number) => Math.hypot(cx(i) - tx, cz(i) - tz) / C;
  gs[s] = 0; push(hx(s), s);
  let n = 0, found = false;
  while (hf.length && n++ < 160000) {
    const i = pop(); if (done[i]) continue; done[i] = 1;
    if (i === g) { found = true; break; }
    const ix = i % W, iz = Math.floor(i / W);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const jx = ix + dx, jz = iz + dz; if (jx < 0 || jz < 0 || jx >= W || jz >= H) continue;
      const j = jz * W + jx; if (done[j]) continue;
      const c = cellCost(j); if (!isFinite(c)) continue;
      if (dx && dz && (!isFinite(cellCost(iz * W + jx)) || !isFinite(cellCost(jz * W + ix)))) continue;   // (no cutting a corner of the sea)
      const ng = gs[i] + (dx && dz ? 1.414 : 1) * c;
      if (ng < gs[j]) { gs[j] = ng; from[j] = i; push(ng + hx(j), j); }
    }
  }
  if (!found) return null;
  const cells: number[] = []; for (let i = g; i !== -1; i = from[i]) cells.push(i);
  cells.reverse();
  // pulled taut: from each point, straight on to the furthest one it can reach without crossing anything dearer
  const free = (a: number, b: number) => {
    const ax = cx(a), az = cz(a), bx = cx(b), bz = cz(b), L = Math.hypot(bx - ax, bz - az), k = Math.ceil(L / (C * 0.5));
    const worst = Math.max(cellCost(a), cellCost(b));
    for (let t = 1; t < k; t++) { const c = cellCost(at(ax + (bx - ax) * t / k, az + (bz - az) * t / k)); if (c > Math.max(1.2, worst)) return false; }
    return true;
  };
  const out: [number, number][] = [];
  let a = 0;
  while (a < cells.length - 1) {
    let b = a + 1;
    while (b + 1 < cells.length && free(cells[a], cells[b + 1])) b++;
    out.push([cx(cells[b]), cz(cells[b])]); a = b;
  }
  if (out.length) out[out.length - 1] = [tx, tz]; else out.push([tx, tz]);
  return out;
}
