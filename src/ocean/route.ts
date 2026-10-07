// Finding the way through the water. Sent somewhere across the reef, the drone does not head straight for it
// and climb whatever is in the way: a reef top that comes up to within a metre or two of the surface is a
// wall it can neither swim over (it keeps below the surface) nor through. So the way is planned first, as
// on a chart: the sea is read on a grid of cells, each one open if there is room for the drone between the
// highest thing standing in it and the surface, and the shortest open way is found (A*), shallower water
// counting for a little more so it keeps to the channels rather than skimming the tops. The grid way is then
// pulled straight wherever the water between two points is open, so it runs in long clean lines, and the
// drone follows it by looking a few metres ahead along it. If there is no way through the water at all,
// the planner says so, and the drone goes up and over in the air instead.
import { hyp } from '../core/math';

export interface RoutePlan {
  ok: boolean;              // a way through the water was found
  pts: number[];            // x, z, x, z… from the start to the goal (pulled straight)
  len: number;              // its length (m)
  gx: number; gz: number;   // the goal it was planned for
}

const CELL = 2;             // grid cell (m)
const RING = 0.9;           // the drone's own room: each cell also reads the floor this far round its middle

/** The floor read cell by cell on a grid fixed to the world, kept between plans (the seabed and what stands on it
 *  do not move): the first plan across a stretch of reef reads it, later ones reuse it. One per sea. */
export function floorCells(floor: (x: number, z: number) => number) {
  const m = new Map<number, number>();
  return (i: number, j: number) => {
    const key = (i + 32768) * 65536 + (j + 32768);
    let f = m.get(key);
    if (f === undefined) {
      const x = i * CELL, z = j * CELL;
      f = Math.max(floor(x, z), floor(x + RING, z), floor(x - RING, z), floor(x, z + RING), floor(x, z - RING));
      m.set(key, f);
    }
    return f;
  };
}

/**
 * cells: the sea's floor, read per cell (floorCells).
 * ceil: how high the floor may come and still leave room for the drone below the surface.
 * bound: the square the drone may move in ([minX, maxX, minZ, maxZ]).
 */
export function planRoute(cells: (i: number, j: number) => number, ceil: number, bound: [number, number, number, number],
  ax: number, az: number, bx: number, bz: number): RoutePlan {
  const d = hyp(bx - ax, bz - az), pad = Math.max(24, d * 0.5);
  // (the grid sits on the world's own, so cells read for one plan serve the next)
  const x0 = Math.ceil(Math.max(bound[0], Math.min(ax, bx) - pad) / CELL) * CELL, x1 = Math.min(bound[1], Math.max(ax, bx) + pad);
  const z0 = Math.ceil(Math.max(bound[2], Math.min(az, bz) - pad) / CELL) * CELL, z1 = Math.min(bound[3], Math.max(az, bz) + pad);
  const I0 = Math.round(x0 / CELL), J0 = Math.round(z0 / CELL);
  const W = Math.max(2, Math.ceil((x1 - x0) / CELL) + 1), H = Math.max(2, Math.ceil((z1 - z0) / CELL) + 1), N = W * H;
  const cx = (i: number) => x0 + i * CELL, cz = (j: number) => z0 + j * CELL;
  const ci = (x: number) => Math.max(0, Math.min(W - 1, Math.round((x - x0) / CELL))), cj = (z: number) => Math.max(0, Math.min(H - 1, Math.round((z - z0) / CELL)));
  // the floor of each cell, read only when the search reaches it
  const fl = new Float32Array(N).fill(NaN);
  const cellFloor = (k: number) => {
    let f = fl[k];
    if (f !== f) fl[k] = f = cells(I0 + k % W, J0 + ((k / W) | 0));
    return f;
  };
  const s = ci(ax) + cj(az) * W, g = ci(bx) + cj(bz) * W;
  // (where it is now and where it is going are reachable from there already: the camera spot was chosen clear
  // of the floor, and the drone is wherever it is; only the way between them is in question)
  const open = (k: number) => k === s || k === g || cellFloor(k) <= ceil;
  // shallower water costs a little more: keep to the deep, where there is room to move up and down
  const cost = (k: number) => 1 + 0.6 * Math.min(1, Math.max(0, (cellFloor(k) - (ceil - 3)) / 3));
  const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), shut = new Uint8Array(N);
  const heap: number[] = [], hf: number[] = [];   // a binary heap of cells by f = g + h
  const push = (k: number, f: number) => {
    heap.push(k); hf.push(f);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], lk = heap.pop()!, lf = hf.pop()!;
    if (heap.length) {
      heap[0] = lk; hf[0] = lf;
      for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; }
    }
    return top;
  };
  const gi = g % W, gj = (g / W) | 0;
  const hEst = (k: number) => hyp((k % W) - gi, ((k / W) | 0) - gj);
  gs[s] = 0; push(s, hEst(s));
  let found = false, budget = 60000;
  while (heap.length && budget-- > 0) {
    const k = pop();
    if (shut[k]) continue;
    shut[k] = 1;
    if (k === g) { found = true; break; }
    const i = k % W, j = (k / W) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const n = ii + jj * W;
      if (shut[n] || !open(n)) continue;
      // (no cutting a corner past a blocked cell)
      if (di && dj && (!open(i + di + j * W) || !open(i + (j + dj) * W))) continue;
      const gn = gs[k] + (di && dj ? Math.SQRT2 : 1) * (cost(k) + cost(n)) * 0.5;
      if (gn < gs[n]) { gs[n] = gn; from[n] = k; push(n, gn + hEst(n)); }
    }
  }
  if (!found) return { ok: false, pts: [ax, az, bx, bz], len: d, gx: bx, gz: bz };
  // the grid way, goal back to start
  const chain: number[] = [];
  for (let k = g; k !== -1; k = from[k]) chain.push(k);
  chain.reverse();
  const way: number[] = [ax, az];
  for (let n = 1; n < chain.length - 1; n++) way.push(cx(chain[n] % W), cz((chain[n] / W) | 0));
  way.push(bx, bz);
  // pulled straight: from each point, on to the furthest later point it can see across open water
  const clearLine = (x0: number, z0: number, x1: number, z1: number) => {
    const L = hyp(x1 - x0, z1 - z0), n = Math.ceil(L / 0.8);
    for (let t = 1; t < n; t++) {
      const k = ci(x0 + (x1 - x0) * t / n) + cj(z0 + (z1 - z0) * t / n) * W;
      if (!open(k)) return false;
    }
    return true;
  };
  const pts = [way[0], way[1]];
  for (let a = 0; a < way.length / 2 - 1;) {
    let b = way.length / 2 - 1;
    while (b > a + 1 && !clearLine(way[a * 2], way[a * 2 + 1], way[b * 2], way[b * 2 + 1])) b--;
    pts.push(way[b * 2], way[b * 2 + 1]); a = b;
  }
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) len += hyp(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return { ok: true, pts, len, gx: bx, gz: bz };
}

/** The point `look` metres further along the plan from where the drone is now (out: x, z), and how far
 *  is left to go along it. Measured from the closest point on the plan, so a drone pushed a little off it
 *  steers back onto it rather than cutting a corner across a blocked cell. */
export function alongRoute(p: RoutePlan, x: number, z: number, look: number, out: { x: number; z: number }) {
  const P = p.pts;
  let best = Infinity, seg = 0, tt = 0;
  for (let i = 0; i < P.length - 2; i += 2) {
    const dx = P[i + 2] - P[i], dz = P[i + 3] - P[i + 1], L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - P[i]) * dx + (z - P[i + 1]) * dz) / L2));
    const ex = P[i] + dx * t - x, ez = P[i + 1] + dz * t - z, e = ex * ex + ez * ez;
    if (e < best) { best = e; seg = i; tt = t; }
  }
  // walk on from there
  let left = look, i = seg, t = tt, rest = 0, ox = P[P.length - 2], oz = P[P.length - 1];
  for (; i < P.length - 2; i += 2, t = 0) {
    const dx = P[i + 2] - P[i], dz = P[i + 3] - P[i + 1], L = hyp(dx, dz), r = L * (1 - t);
    if (left <= r) { const u = t + left / Math.max(L, 1e-9); ox = P[i] + dx * u; oz = P[i + 1] + dz * u; left = 0; break; }
    left -= r;
  }
  out.x = ox; out.z = oz;
  // (what is left: from the closest point to the end)
  for (let k = seg; k < P.length - 2; k += 2) { const L = hyp(P[k + 2] - P[k], P[k + 3] - P[k + 1]); rest += k === seg ? L * (1 - tt) : L; }
  return { rest, off: Math.sqrt(best) };
}
