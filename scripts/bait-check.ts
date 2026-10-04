// Headless check of the bait ball, grown out of the sea (ADR 0005): the school is there by day; nothing is started.
// The camera keeps 25 m off the school for 25 minutes of daylight; logged: each change of phase, what the sea log
// said and when, how many hunters were pressing, how many fish are left, and what one step costs.
// Want: a ball forms by itself, reaches the surface (frenzy) and comes undone again, the school still there after;
// the log never names a ball before the fish have drawn together; the school's middle never out of the water; a step
// under 10 ms on average (the old bait ball, 5,000 fish: 8.5 ms in Miyako; this one 8,000).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/bait-check.ts [sea ...]
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState } from '../src/time/clock';

let bad = 0;
for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ['miyako', 'pacific']) {
  const loc = LOCATIONS.find((l) => l.id === id)!;
  const oc: any = buildOcean(loc);
  oc.eco.setSky(skyState(Date.UTC(2026, 8, 29, 1), loc), new THREE.Vector2(0.5, 0.2));
  const cam = new THREE.Vector3(0, -6, 0), s = oc.bait.st;
  let last = '', ms = 0, n = 0, nan = 0, formed = -1, frenzy = -1, undone = -1, early = 0, out = 0, balls = 0;
  const dt = 1 / 20;
  for (let k = 0; k < 20 * 60 * 25; k++) {
    const t = k * dt;
    // the camera off the school's side, looking at it
    if (s.placed) { const a = t * 0.02; cam.set(s.c.x + Math.cos(a) * 25, -5, s.c.z + Math.sin(a) * 25); }
    const fx = s.placed ? s.c.x - cam.x : 0, fz = s.placed ? s.c.z - cam.z : -1, fl = Math.hypot(fx, fz) || 1;
    const t0 = performance.now();
    const evs = oc.eco.step(dt, t, cam, fx / fl, fz / fl);
    ms += performance.now() - t0; n++;
    for (const e of evs) if (/ベイト|身を寄せ|群れがほどけ/.test(e.text)) { console.log(`   ${t.toFixed(0).padStart(5)}s log: ${e.text}`); if (s.ballK < 0.4) early++; }
    if (!isFinite(s.c.x + s.c.y + s.c.z)) nan++;
    if (s.c.y > -0.5) out++;
    if (s.phase !== last) {
      last = s.phase;
      const modes: Record<string, number> = {}; for (const pk of oc.bait.dbg.packs) for (const p of pk.list) modes[p.mode] = (modes[p.mode] ?? 0) + 1;
      console.log(`${id} ${t.toFixed(0).padStart(5)}s ${s.phase.padEnd(7)} y ${s.c.y.toFixed(1)} r ${s.r.toFixed(1)} alive ${s.alive} pressing ${s.pressure} hunters ${JSON.stringify(modes)}`);
      if (s.phase === 'gather') { balls++; if (formed < 0) formed = t; }
      if (s.phase === 'frenzy' && frenzy < 0) frenzy = t;
      if (s.phase === 'school' && frenzy >= 0 && undone < 0) undone = t;
    }
  }
  const avg = ms / n;
  const ok = formed >= 0 && frenzy >= 0 && undone >= 0 && s.placed && !early && !nan && !out && avg < 10;
  if (!ok) bad++;
  console.log(`${id}: formed at ${formed.toFixed(0)} s, frenzy at ${frenzy.toFixed(0)} s, undone at ${undone.toFixed(0)} s; balls in 25 min ${balls}; told early ${early}; school out of the water ${out} steps; NaN ${nan}; step ${avg.toFixed(2)} ms ${ok ? 'ok' : 'FAIL'}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
