// The jacks' tornado, grown out of the sea (ADR 0005). Where a sea has bigeye trevally, a great school of them
// keeps to one spot by day — the same spot every day, on the reef's edge, as divers know it — milling slowly in a
// loose, flattened wheel. It is not started; it is there. How tightly it turns is the sea's doing: as the tide
// runs, the stream across the edge winds the wheel up into a tall spinning column (the tornado), and at slack
// water it eases back into a lazy wheel; a shark coming close tightens it too. At dusk it loosens and spreads,
// and through the night the jacks are out hunting, the school no more than a wide, drifting scatter; at dawn it
// draws back together. Every fish's place follows from the school's state, so nothing jumps; hunters may pick
// off its stragglers. The sea log speaks once the column has formed, never before.
import * as THREE from 'three';
import { fishGeometry, fishMaterial, SHAPES } from '../ocean/models';
import { makeSchoolShade } from './schoolshade';
import { unseen, sightRange } from './unseen';
import { outZone } from '../ocean/zone';
import { clamp, R, rr, mulberry32 } from '../core/math';
import type { Species } from '../data/locations';
import type { Env, Subject, PreyGroup } from './env';

const smooth = (a: number, b: number, x: number) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

export function makeJacks(oc: any, fraction: number) {
  const loc = oc.loc;
  const sp: Species | undefined = loc.species.find((s: Species) => s.id === 'gingameaji');
  if (!sp || loc.pelagic) return null;
  const T = oc.T;

  // its spot: on the edge of the reef, over 11-22 m of water with the reef rising steeply beside it — the same
  // every day (found from the sea's own name, not from where the camera is)
  let seed = 2166136261; for (const ch of String(loc.id) + ':jacks') { seed ^= ch.charCodeAt(0); seed = Math.imul(seed, 16777619); }
  const rnd = mulberry32(seed >>> 0);
  let home: THREE.Vector3 | null = null, best = -1;
  for (let k = 0; k < 900; k++) {
    const x = (rnd() * 2 - 1) * 105, z = (rnd() * 2 - 1) * 105;
    if (outZone(x, z, 0.85)) continue;
    const fl = T.top(x, z);
    if (fl > -11 || fl < -22) continue;
    let rise = -1e9, clear = true;
    for (let a = 0; a < 6.28; a += 0.524) {
      rise = Math.max(rise, T.top(x + Math.cos(a) * 20, z + Math.sin(a) * 20));
      for (const d of [4, 8, 13]) if (T.top(x + Math.cos(a) * d, z + Math.sin(a) * d) > fl + 2) clear = false;   // (open water round the wheel itself)
    }
    const score = clear ? rise - fl : -1;
    if (score > best) { best = score; home = new THREE.Vector3(x, fl, z); }
    if (best > 6 && k > 300) break;
  }
  if (!home) return null;
  const floor0 = home.y;

  // (more than the old staged tornado's 1300: the owner found it thin. Each fish is placed, not flocked: cheap)
  // (as the owner saw them in photographs: a wall of fish you cannot see through — thousands in a thick-walled column)
  const NMAX = 5000;
  let N = Math.round(NMAX * clamp(fraction, 0.6, 1));
  const g = fishGeometry(SHAPES[sp.shape], true), sw = new Float32Array(NMAX * 3);
  for (let i = 0; i < NMAX; i++) sw.set([R() * 6.28, rr((sp.freq || [7, 10])[0], (sp.freq || [7, 10])[1]), rr(0.9, 1.08)], i * 3);
  g.setAttribute('aSwim', new THREE.InstancedBufferAttribute(sw, 3));
  const shade = makeSchoolShade(g, NMAX, 1, { round: false });
  const mesh = new THREE.InstancedMesh(g, fishMaterial(sp, true, true), NMAX);
  mesh.count = N; mesh.userData.jacks = true; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  oc.group.add(mesh);
  // each fish: height in the column, its own reach, phase, pace, tilt, place in the wheel and in the night scatter
  const H = new Float32Array(NMAX), RJ = new Float32Array(NMAX), A0 = new Float32Array(NMAX), SPD = new Float32Array(NMAX), TL = new Float32Array(NMAX), WR = new Float32Array(NMAX), WY = new Float32Array(NMAX), SC = new Float32Array(NMAX * 3), SZ = new Float32Array(NMAX);
  for (let i = 0; i < NMAX; i++) {
    H[i] = R(); RJ[i] = R(); A0[i] = R() * 6.28; SPD[i] = rr(0.8, 1.2); TL[i] = R() * 6.28;
    WR[i] = Math.sqrt(R()); WY[i] = R() * 2 - 1;
    const a = R() * 6.28, r = Math.sqrt(R()); SC[i * 3] = Math.cos(a) * r; SC[i * 3 + 1] = R() * 2 - 1; SC[i * 3 + 2] = Math.sin(a) * r;
    SZ[i] = rr(sp.size[0], sp.size[1]) / 1.28;
  }
  // (where each one spends the night: the highest reef round its spot, read once — it swims over that, not
  // bumping up and down over every coral head)
  // (and never out over a reef flat too shallow for it: drawn in toward the spot until there is water enough)
  const SF = new Float32Array(NMAX);
  for (let i = 0; i < NMAX; i++) {
    for (let fr = 1; fr >= 0.2; fr -= 0.1) {
      const x = home.x + SC[i * 3] * 34 * fr, z = home.z + SC[i * 3 + 2] * 34 * fr;
      let f = -1e9; for (const [dx, dz] of [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7], [5, 5], [-5, -5], [5, -5], [-5, 5], [3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5]]) f = Math.max(f, T.top(x + dx, z + dz));
      SF[i] = f;
      if (f < -4.5 || fr < 0.25) { SC[i * 3] *= fr; SC[i * 3 + 2] *= fr; break; }
    }
  }
  const gone = new Uint8Array(NMAX), last = new Float32Array(NMAX * 6), ANG = new Float32Array(NMAX);   // (ANG: how far round each has come — carried on, not worked out from the time, so a change of pace never jumps)
  const dir = rnd() < 0.5 ? 1 : -1;

  const st = {
    c: home.clone(),        // the school's middle (it sways with the stream, about its spot)
    k: 0.3,                 // 0 a lazy wheel .. 1 the full column
    spread: 0,              // 0 the day school .. 1 the night scatter
    alive: N, t: 0, stream: 0, threat: 0, told: false, toldAt: -1e9,
  };
  let hidden = false, settled = false;

  // where fish i is at time t, for the school's state now (and how it is moving)
  const P = new THREE.Vector3();
  const base = () => Math.max(floor0 + 2.6, -18), top = () => Math.min(base() + 13, -1.5);
  // (per fish, worked out once: its height's share of the column's girth, and the phases of its weave and bob)
  const MD = new Float32Array(NMAX), WC = new Float32Array(NMAX), WS = new Float32Array(NMAX), BC = new Float32Array(NMAX), BS = new Float32Array(NMAX);
  for (let i = 0; i < NMAX; i++) { MD[i] = Math.sin(H[i] * Math.PI); WC[i] = Math.cos(H[i] * 5); WS[i] = Math.sin(H[i] * 5); BC[i] = Math.cos(H[i] * 9 + TL[i]); BS[i] = Math.sin(H[i] * 9 + TL[i]); }
  let fb = 0, ftp = 0, fws = 0, fwc = 0, fbs = 0, fbc = 0;   // (the same for every fish this frame)
  const lean = { x: 0, z: 0 };
  function frameStart(t: number) { fb = base(); ftp = top(); fws = Math.sin(t * 0.3); fwc = Math.cos(t * 0.3); fbs = Math.sin(t * 0.07) * 0.9 * st.k; fbc = Math.cos(t * 0.05) * 0.9 * st.k; }
  function place(i: number, t: number, dt: number, out: THREE.Vector3) {
    const k = st.k, sp2 = SPD[i];
    // the column: every fish the same way round, each on its own slightly tilted circle, wider in its middle
    const b = fb, tp = ftp, y0 = b + (tp - b) * H[i];
    const rb = (2.5 + 0.6 * MD[i]) * (0.6 + 0.4 * RJ[i]);   // (a tall column, near enough as wide top to bottom: a thick wall round a narrow hollow core)
    // the wheel: a broad, flattened ring low over the edge, turning slowly
    const rw = 5.5 + 3.5 * WR[i], yw = b + 2.6 + WY[i] * 2.2;
    const r = rb + (rw - rb) * (1 - k), y = y0 + (yw - y0) * (1 - k);
    const w = dir * (0.35 + 0.55 * k) * sp2 / Math.max(r, 2), a = A0[i] + (ANG[i] += w * dt);
    const ca = Math.cos(a), sa = Math.sin(a);
    const rr2 = r + (fws * WC[i] + fwc * WS[i]) * (0.4 + 0.6 * (1 - k));
    // (the column leans down the stream and bends a little, slowly, as a real one does; the wheel barely)
    const hh = H[i] * k, bx = (lean.x * hh + fbs * Math.sin(H[i] * 3)) * 1, bz = (lean.z * hh + fbc * Math.sin(H[i] * 3)) * 1;
    let x = st.c.x + bx + ca * rr2, yy = y + (0.45 + 0.4 * (1 - k)) * (sa * BC[i] + ca * BS[i]), z = st.c.z + bz + sa * rr2;
    // the night scatter: spread wide and low over the reef round about, drifting
    const s = st.spread;
    if (s > 0.001) {
      const sx = st.c.x + SC[i * 3] * 34 + Math.sin(t * 0.05 + A0[i]) * 4, sz = st.c.z + SC[i * 3 + 2] * 34 + Math.cos(t * 0.045 + A0[i] * 1.3) * 4;
      const sy = Math.min(Math.max(b + 1.5 + SC[i * 3 + 1] * 2.5, SF[i] + 1.2 + (SC[i * 3 + 1] + 1) * 0.8), -1.5);
      x += (sx - x) * s; yy += (sy - yy) * s; z += (sz - z) * s;
    }
    out.set(x, yy, z);
  }

  const prey: PreyGroup = {
    x: home.x, y: home.y + 5, z: home.z, alive: N, label: sp.ja,
    scare() { st.threat = Math.max(st.threat, 0.6); },   // (a jack school holds together under threat: it tightens)
    take() { const i = Math.floor(R() * N); if (gone[i]) return false; gone[i] = 1; st.alive--; prey.alive--; return true; },
    pick(x, y, z) { let b = -1, bs = Infinity; for (let q = 0; q < 40; q++) { const i = Math.floor(R() * N); if (gone[i]) continue; const d = Math.sqrt((last[i * 6] - x) ** 2 + (last[i * 6 + 1] - y) ** 2 + (last[i * 6 + 2] - z) ** 2); if (d < bs) { bs = d; b = i; } } return b; },
    at(i, out, vel) { if (i < 0 || gone[i]) return false; out.x = last[i * 6]; out.y = last[i * 6 + 1]; out.z = last[i * 6 + 2]; if (vel) { vel.x = last[i * 6 + 3]; vel.y = last[i * 6 + 4]; vel.z = last[i * 6 + 5]; } return true; },
    chased() { st.threat = Math.max(st.threat, 0.4); },
    safe() { return false; },
    kill(i) { if (i < 0 || gone[i] || st.alive <= 2) return false; gone[i] = 1; st.alive--; prey.alive--; return true; },
  };
  oc.eco?.env?.prey?.push(prey);
  let preyIn = !!oc.eco?.env?.prey;

  const subject: Subject = {
    key: 'jacks', label: `${sp.ja}の群れ`, kind: 'school', prio: 3, size: 8, reach: 90,
    pos: () => P.set(st.c.x, (base() + top()) / 2 * st.k + (base() + 2.2) * (1 - st.k), st.c.z),
    status: () => (st.spread > 0.5 ? '夜の狩りに散っている' : st.k > 0.65 ? '銀色の竜巻になって回りつづけている' : st.k > 0.4 ? '潮に合わせて渦を締めはじめた' : 'ゆっくりと輪を描いて漂っている'),
    live: () => st.spread < 0.6,
  };
  Object.defineProperty(subject, 'label', { get: () => (st.k > 0.65 && st.spread < 0.3 ? `${sp.ja}のトルネード` : `${sp.ja}の群れ`) });
  Object.defineProperty(subject, 'prio', { get: () => (st.k > 0.65 && st.spread < 0.3 ? 5.5 : 3) });
  // (the tornado: filmed from right under it, looking up the hollow core toward the light)
  Object.defineProperty(subject, 'under', { get: () => (st.k > 0.65 && st.spread < 0.3 ? 6.5 : undefined) });

  const E = mesh.instanceMatrix.array as Float32Array, Q = new THREE.Vector3(), V = new THREE.Vector3();
  let frame = 0, flC = new Float32Array(NMAX).fill(NaN), reviveAcc = 0, surge = 0;
  function update(dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
    if (!preyIn) { env.prey.push(prey); preyIn = true; }
    st.t += dt; frame++;
    // the sea's state: daylight, the tidal stream across the edge (the drift of the water less its steady part),
    // a shark close by
    const light = clamp(env.day + env.twilight * 0.6, 0, 1);
    st.stream = clamp(Math.sqrt((env.cur.x - 0.12) ** 2 + (env.cur.z - 0.05) ** 2) / 0.8, 0, 1);
    let thr = 0;
    for (const th of env.threats) if (th.r >= 3) { const d = Math.sqrt((th.x - st.c.x) ** 2 + (th.z - st.c.z) ** 2); if (d < 25) thr = Math.max(thr, (1 - d / 25) * (th.r > 3 ? 1 : 0.5)); }   // (a hunter about: more so on the hunt)
    st.threat = Math.max(thr, st.threat - dt * 0.05);
    surge = Math.max(0, surge - dt / 300);
    const drift = 0.1 * Math.sin(st.t * 0.004 + seed % 7);
    const want = clamp(light * (0.18 + 0.7 * smooth(0.15, 0.7, st.stream) + 0.25 * st.threat + 0.6 * surge + drift), 0, 1);
    // (it winds up over a minute or so, and runs down more slowly; at once, on arriving)
    if (!settled) { st.k = want; settled = true; }
    st.k += (want - st.k) * Math.min(1, dt * (want > st.k ? 0.025 : 0.012));
    const night = 1 - smooth(0.1, 0.45, light);
    st.spread += (night - st.spread) * Math.min(1, dt * 0.01);
    // (it leans a little down the stream, about its spot)
    st.c.x += (home!.x + env.cur.x * 3 - st.c.x) * Math.min(1, dt * 0.05);
    st.c.z += (home!.z + env.cur.z * 3 - st.c.z) * Math.min(1, dt * 0.05);
    lean.x += (env.cur.x * 2.5 - lean.x) * Math.min(1, dt * 0.05); lean.z += (env.cur.z * 2.5 - lean.z) * Math.min(1, dt * 0.05);
    prey.x = st.c.x; prey.z = st.c.z; prey.y = st.k > 0.5 ? (base() + top()) / 2 : base() + 2.2;

    // told once the column has formed and is in view, not before
    const dc = Math.sqrt((st.c.x - cam.x) ** 2 + (st.c.z - cam.z) ** 2);
    const reach = 14 + 38 * st.spread;   // (how far its fish reach from its middle: the wheel and the lean; the night scatter)
    const inView = !unseen(oc, st.c.x, prey.y, st.c.z, cam, fx, fz, reach);
    if (st.k > 0.65 && st.spread < 0.3 && inView && dc < 60 && !st.told && st.t - st.toldAt > 1200) {
      st.told = true; st.toldAt = st.t;
      env.events.push({ kind: 'observe', text: `${sp.ja}の群れが渦を巻き、銀色の竜巻になった。潮が動いている`, x: st.c.x, z: st.c.z, at: () => st.c });
    }
    if (st.k < 0.45) st.told = false;

    // out of sight and far off: not drawn, not worked out (and the taken made up, as others join)
    // (only ever out of view: beyond what can be seen, or behind and to the side)
    hidden = dc - reach > sightRange(oc) || (dc > reach + 25 && !inView);
    mesh.visible = !hidden;
    if (hidden) {
      for (let i = 0; i < N; i++) last[i * 6 + 1] = 0;   // (its way of swimming taken afresh when it is next seen)
      if (st.alive < N && (reviveAcc += dt * 3) >= 1) for (let i = 0; i < N && reviveAcc >= 1; i++) if (gone[i]) { gone[i] = 0; st.alive++; prey.alive++; reviveAcc--; }
      return;
    }
    shade.begin(); frameStart(st.t);
    for (let i = 0; i < N; i++) {
      const o = i * 16;
      if (gone[i]) { for (let j = 0; j < 16; j++) E[o + j] = 0; continue; }
      // (the further off, the less often each fish is moved — that much further in one go: less work, the same motion)
      const lx = last[i * 6] - cam.x, lz = last[i * 6 + 2] - cam.z, d2 = last[i * 6 + 1] < 0 ? lx * lx + lz * lz : 0;
      const every = d2 > 8100 ? 6 : d2 > 3600 ? 4 : d2 > 1225 ? 3 : d2 > 324 ? 2 : 1;   // (beyond 18 m every other frame, 35 m every third, 60 m every fourth, 90 m every sixth)
      if ((frame + i) % every) { shade.keep(0, last[i * 6], last[i * 6 + 1], last[i * 6 + 2]); continue; }
      const fdt = dt * every;
      place(i, st.t, fdt, Q);
      // (they give the camera room, as a school gives a diver: flowing round it, never through the lens)
      { const ax = Q.x - cam.x, ay = Q.y - cam.y, az = Q.z - cam.z, d2 = ax * ax + ay * ay + az * az; if (d2 < 6.25) { const d = Math.sqrt(d2) || 0.01, f = (2.5 - d) / d; Q.x += ax * f; Q.y += ay * f * 0.5; Q.z += az * f; } }
      if ((frame + i) % (st.spread < 0.05 ? 8 : 6) === 0 || flC[i] !== flC[i]) {
        flC[i] = T.top(Q.x, Q.z);
        // (over the reef at night: and a little ahead, so it is already rising when a rock comes)
        if (st.spread >= 0.05 && last[i * 6 + 1] < 0) { const vx = (Q.x - last[i * 6]) / fdt, vz = (Q.z - last[i * 6 + 2]) / fdt; flC[i] = Math.max(flC[i], T.top(Q.x + vx * 0.4, Q.z + vz * 0.4), T.top(Q.x + vx * 0.9, Q.z + vz * 0.9)); }
      }
      Q.y = Math.min(Math.max(Q.y, flC[i] + 0.6), -0.6);
      // (up and down no faster than a fish swims: over a coral head, up and over it, not snapped onto it)
      const ly = last[i * 6 + 1];
      if (ly < 0) Q.y = ly + clamp(Q.y - ly, -0.25 * fdt * 20, 0.45 * fdt * 20);
      // (and never faster than a fish darting (5 m/s), whatever pushed it: nothing jumps)
      if (last[i * 6 + 1] < 0) { const mx = Q.x - last[i * 6], my = Q.y - last[i * 6 + 1], mz = Q.z - last[i * 6 + 2], ml = Math.sqrt(mx * mx + my * my + mz * mz), cap = 5 * fdt; if (ml > cap) { const f = cap / ml; Q.set(last[i * 6] + mx * f, last[i * 6 + 1] + my * f, last[i * 6 + 2] + mz * f); } if (Q.y < flC[i] + 0.15) Q.y = Math.min(Math.max(Q.y, T.top(Q.x, Q.z) + 0.15), -0.6); }   // (out of the reef right where it is — not where it is heading)
      // (how it is moving: from where it was — no second placing; on the first frame, round the wheel)
      if (last[i * 6 + 1] < 0 && fdt > 0) V.set((Q.x - last[i * 6]) / fdt, (Q.y - last[i * 6 + 1]) / fdt, (Q.z - last[i * 6 + 2]) / fdt);
      else V.set(-(Q.z - st.c.z) * dir, 0, (Q.x - st.c.x) * dir);
      if (V.x * V.x + V.z * V.z < 1e-6) V.set(last[i * 6 + 3], 0, last[i * 6 + 5] || 1);
      last[i * 6] = Q.x; last[i * 6 + 1] = Q.y; last[i * 6 + 2] = Q.z; last[i * 6 + 3] = V.x; last[i * 6 + 4] = V.y; last[i * 6 + 5] = V.z;
      // (its body along the way it swims: the basis written straight in)
      let hx = V.x, hy = V.y * 0.5, hz = V.z; const hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1; hx /= hl; hy /= hl; hz /= hl;
      let rx = hz, rz = -hx; const rl = Math.sqrt(rx * rx + rz * rz) || 1; rx /= rl; rz /= rl;
      const ux = hy * rz, uy = hz * rx - hx * rz, uz = -hy * rx, sc = SZ[i];
      E[o] = rx * sc; E[o + 1] = 0; E[o + 2] = rz * sc; E[o + 3] = 0;
      E[o + 4] = ux * sc; E[o + 5] = uy * sc; E[o + 6] = uz * sc; E[o + 7] = 0;
      E[o + 8] = hx * sc; E[o + 9] = hy * sc; E[o + 10] = hz * sc; E[o + 11] = 0;
      E[o + 12] = Q.x; E[o + 13] = Q.y; E[o + 14] = Q.z; E[o + 15] = 1;
      shade.set(i, 0, Q.x, Q.y, Q.z);
    }
    shade.end();
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    st, home, update, sp,
    each(cb: (x: number, y: number, z: number, len: number) => boolean | void, most = 200) { if (hidden) return; const k = Math.max(1, Math.floor(N / most)); for (let i = 0; i < N; i += k) if (!gone[i] && cb(last[i * 6], last[i * 6 + 1], last[i * 6 + 2], sp.size[1]) === true) return; },
    get hidden() { return hidden; },
    subjects: (): Subject[] => (st.spread > 0.6 ? [] : [subject]),
    // (a day the stream runs hard over the edge: wound up tight for a while — the rare-scene entry)
    surge() { surge = 1; },
    setFraction(f: number) { N = Math.round(NMAX * clamp(f, 0.6, 1)); mesh.count = N; let a = 0; for (let i = 0; i < N; i++) if (!gone[i]) a++; st.alive = prey.alive = a; },
  };
}
export type Jacks = NonNullable<ReturnType<typeof makeJacks>>;
