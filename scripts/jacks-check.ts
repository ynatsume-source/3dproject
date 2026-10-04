// Headless check of the jacks' tornado, grown out of the sea (ADR 0005). In each sea with bigeye trevally the
// school is found at its spot on the reef's edge (the same spot each time it is built); then a day is run with
// the tidal stream turning from slack to full and back, and on into the night, the camera 22 m off, looking at it.
// Want: a spot found, over open water; the column winds up as the stream runs (k > 0.65) and eases at slack
// (k < 0.45); the night scatters it (spread > 0.8); the log names the tornado only once it has formed; no fish
// jumps (faster than 12 m/s between its moves: nothing pops into a new place); none out of the water or in the reef;
// a step under 4 ms on average (5,000 fish, the far side every other frame; only while in view — out of sight, nothing).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/jacks-check.ts [sea ...]
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState } from '../src/time/clock';
import { unseen } from '../src/eco/unseen';

let bad = 0;
const seas = process.argv.slice(2).length ? process.argv.slice(2) : LOCATIONS.filter((l: any) => !l.pelagic && l.species.some((s: any) => s.id === 'gingameaji')).map((l) => l.id);
for (const id of seas) {
  const loc = LOCATIONS.find((l) => l.id === id)!;
  const oc: any = buildOcean(loc);
  const J = oc.jacks;
  if (!J) { console.log(`${id}: no spot found FAIL`); bad++; continue; }
  const again: any = buildOcean(loc).jacks;
  const same = again && again.home.distanceTo(J.home) < 0.01;
  const mesh = oc.group.children.find((o: any) => o.isInstancedMesh && o.count >= 1500 && o.material === J && false) || oc.group.children.filter((o: any) => o.isInstancedMesh && o.count >= 3000 && o.count <= 5000).pop();
  // the day: slack for 4 min, the stream rising to full over 4, full for 6, easing to slack over 4, slack 4; then night 6
  const day = skyState(Date.UTC(2026, 8, 29, 11) - loc.tz * 3600000, loc), night = skyState(Date.UTC(2026, 8, 29, 23) - loc.tz * 3600000, loc);   // (11:00 and 23:00 there)
  const stream = (t: number) => { const m = t / 60; return m < 4 ? 0 : m < 8 ? (m - 4) / 4 : m < 14 ? 1 : m < 18 ? 1 - (m - 14) / 4 : 0; };
  const cam = new THREE.Vector3();
  const prev = new Float32Array(5000 * 3), prevT = new Float32Array(5000); let havePrev = false;   // (prevT: a far fish is moved only every few frames — its speed over that, not one frame's step)
  let maxK = 0, slackK = 1, spread = 0, early = 0, told = 0, jumps = 0, outW = 0, inReef = 0, ms = 0, n = 0;
  const dt = 1 / 20;
  // (what the jacks themselves cost, apart from the rest of the sea)
  let jms = 0; const upd = J.update; J.update = (...a: any[]) => { const t0 = performance.now(); upd(...a); jms += performance.now() - t0; };
  oc.jacks = J;
  for (let k = 0; k < (process.env.QUICK ? 20 * 60 : 20 * 60 * 28); k++) {
    const t = k * dt, isNight = t > 22 * 60, sv = isNight ? 0 : stream(t);
    oc.eco.setSky(isNight ? night : day, new THREE.Vector2(0.12 + 0.8 * sv, 0.05));
    const a = t * 0.01;
    cam.set(J.st.c.x + Math.cos(a) * 22, Math.min(J.home.y + 6, -3), J.st.c.z + Math.sin(a) * 22);
    const fx = J.st.c.x - cam.x, fz = J.st.c.z - cam.z, fl = Math.hypot(fx, fz) || 1;
    const t0 = performance.now();
    const evs = oc.eco.step(dt, t, cam, fx / fl, fz / fl);
    ms += performance.now() - t0; n++;
    for (const e of evs) if (/竜巻|渦を巻/.test(e.text)) { told++; console.log(`   ${(t / 60).toFixed(1).padStart(5)} min log: ${e.text} (k ${J.st.k.toFixed(2)})`); if (J.st.k < 0.6) early++; }
    if (t > 60 && t < 22 * 60) { maxK = Math.max(maxK, J.st.k); }
    if (t > 20.5 * 60 && t < 22 * 60) slackK = Math.min(slackK, J.st.k);
    if (isNight) spread = J.st.spread;
    if (k % 20 === 0) console.log(`${id} ${(t / 60).toFixed(1).padStart(5)} min stream ${sv.toFixed(2)} k ${J.st.k.toFixed(2)} spread ${J.st.spread.toFixed(2)} alive ${J.st.alive} ${J.hidden ? 'hidden' : ''}`.trimEnd());
    // every fish: no jumps, in the water, out of the reef
    if (!J.hidden && mesh) {
      const E = mesh.instanceMatrix.array as Float32Array;
      for (let i = 0; i < mesh.count; i += 3) {
        const o = i * 16; if (!E[o + 15]) continue;
        const x = E[o + 12], y = E[o + 13], z = E[o + 14];
        const moved = Math.hypot(x - prev[i * 3], y - prev[i * 3 + 1], z - prev[i * 3 + 2]);
        if (havePrev && prev[i * 3 + 1] !== 0 && moved > 0 && moved / Math.max(dt, t - prevT[i]) > 12) { if (jumps++ < 8 && process.env.DBG) console.log('jump', (t / 60).toFixed(2), i, [prev[i * 3], prev[i * 3 + 1], prev[i * 3 + 2]].map((v) => v.toFixed(1)).join(','), '->', [x, y, z].map((v) => v.toFixed(1)).join(','), 'floor', oc.T.top(x, z).toFixed(1), 'k', J.st.k.toFixed(2), 'spread', J.st.spread.toFixed(2)); }
        if (y > -0.5) outW++;
        if (k % 40 === 0 && y < oc.T.top(x, z) - 0.05) { if (inReef++ < 5 && process.env.DBG) console.log('reef', (t / 60).toFixed(2), i, y.toFixed(1), oc.T.top(x, z).toFixed(1), 'k', J.st.k.toFixed(2), 'spread', J.st.spread.toFixed(2)); }
        if (moved > 0) prevT[i] = t;
        prev[i * 3] = x; prev[i * 3 + 1] = y; prev[i * 3 + 2] = z;
      }
      havePrev = true;
    } else havePrev = false;
  }
  // then the camera 45 m off, turning slowly on the spot for two minutes of daylight: whenever the school comes into
  // view it is already there (no fish appears in sight — hidden only while out of view)
  J.update = upd;   // (the cost: of the day and night above only)
  let popped = 0, wasShown = new Set<number>(), wasVis: any = false;
  for (let k = 0; k < 20 * 120; k++) {
    const t = 30 * 60 + k * dt, yaw = k * dt * 0.12;
    oc.eco.setSky(day, new THREE.Vector2(0.5, 0.05));
    cam.set(J.home.x + 45, Math.min(J.home.y + 6, -3), J.home.z);
    const fx = Math.cos(yaw), fz = Math.sin(yaw);
    oc.eco.step(dt, t, cam, fx, fz);
    const shown = new Set<number>();
    if (mesh && mesh.visible) { const E = mesh.instanceMatrix.array as Float32Array; for (let i = 0; i < mesh.count; i += 7) if (E[i * 16 + 15]) { shown.add(i); if (k > 0 && !wasShown.has(i) && !unseen(oc, E[i * 16 + 12], E[i * 16 + 13], E[i * 16 + 14], cam, fx, fz, 1)) { if (popped++ < 4 && process.env.DBG) { const dx = E[i * 16 + 12] - cam.x, dz = E[i * 16 + 14] - cam.z; console.log('pop', k, i, 'fish angle', (Math.acos((dx * fx + dz * fz) / Math.hypot(dx, dz)) * 57.3).toFixed(0), 'dist', Math.hypot(dx, dz).toFixed(0), 'was visible', wasVis, 'centre', J.st.c.toArray().map((v: number) => v.toFixed(0)).join(',')); } } } }
    wasVis = mesh?.visible;
    wasShown = shown;
  }
  const avg = jms / n;
  const ok = same && maxK > 0.65 && slackK < 0.45 && spread > 0.8 && told > 0 && !early && !jumps && !outW && !inReef && !popped && avg < 4;
  if (!ok) bad++;
  console.log(`${id}: spot (${J.home.x.toFixed(0)}, ${J.home.z.toFixed(0)}) floor ${J.home.y.toFixed(1)} m${same ? '' : ' (not the same when built again!)'}; full stream k ${maxK.toFixed(2)}, slack k ${slackK.toFixed(2)}, night spread ${spread.toFixed(2)}; told ${told} (early ${early}); jumps ${jumps}, out of the water ${outW}, in the reef ${inReef}; came into view already there ${popped ? `NO (${popped} appeared)` : 'yes'}; step ${avg.toFixed(2)} ms ${ok ? 'ok' : 'FAIL'}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
