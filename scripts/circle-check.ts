// Roaming big fish do not circle on the spot (owner, 2026-10-09: a barracuda going round and round in one place):
// each sea with them is run by day with the camera still; for each roaming group of a big species, the most its
// heading turns one way in any 40 s (a full circle is 360°) while it stays within 12 m of where it was (circling on
// the spot; turning while it travels, chasing or rounding the reef, is not that), windows with a jump (put down
// again) left out.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/circle-check.ts [sea ...]   (env MIN 10, IDS onikamasu,...)
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';

const MIN = +(process.env.MIN || 10), seas = process.argv.slice(2), IDS = (process.env.IDS || '').split(',').filter(Boolean);
let fail = 0;
for (const id of seas.length ? seas : ['miyako', 'maldives', 'gbr', 'redsea']) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!;
  const oc: any = buildOcean(loc);
  oc.eco.setSky(skyState(sunEvents(Date.UTC(2026, 8, 29, 3), loc).noon, loc), new THREE.Vector2(0.3, 0.1));
  const cam = new THREE.Vector3(0, -6, 0), dt = 0.05, W = Math.round(40 / dt);
  const hist = new Map<any, { h: number[]; p: THREE.Vector3[]; sp: string }>();
  let worst = 0, worstWho = '', worstMove = 0;
  for (let k = 0; k < MIN * 60 / dt; k++) {
    oc.eco.step(dt, k * dt, cam, 0, -1);
    for (const sch of oc.fish) for (const g of sch.dbg?.groups ?? []) {
      if (g.type !== 'roam' || !sch.sp.big || (IDS.length && !IDS.includes(sch.sp.id)) || !g.placed) continue;
      let H = hist.get(g); if (!H) { H = { h: [], p: [], sp: sch.sp.ja }; hist.set(g, H); }
      const last = H.h.length ? H.h[H.h.length - 1] : g.head;
      H.h.push(last + Math.atan2(Math.sin(g.head - last), Math.cos(g.head - last))); H.p.push(g.c.clone());
      if (H.h.length > W) { H.h.shift(); H.p.shift(); }
      if (H.h.length === W) {
        let jump = false, far = 0; for (let i = 1; i < W; i++) { if (H.p[i].distanceTo(H.p[i - 1]) > 2) jump = true; far = Math.max(far, H.p[i].distanceTo(H.p[0])); }
        const turned = Math.abs(H.h[W - 1] - H.h[0]);
        if (!jump && far < 12 && turned > worst) { worst = turned; worstWho = H.sp; worstMove = far; }
      }
    }
  }
  const ok = worst < Math.PI * 1.67;
  if (!ok) fail++;
  console.log(`${id}: most turned one way in 40 s staying within 12 m ${(worst * 57.3).toFixed(0)}° (${worstWho || '-'}, at most ${worstMove.toFixed(1)} m from where it was) — ${ok ? 'PASS' : 'FAIL'}`);
}
process.exit(fail ? 1 : 0);
