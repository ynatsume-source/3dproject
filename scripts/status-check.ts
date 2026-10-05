// The caption's line about what an animal is doing is true of that animal (owner report, 2026-10-05: "ヒブダイ 藻を
// かじっている" over a fish that was not; CAPTION_FOCUS_TAP.md rule 2). Builds each sea as the app does, runs its life
// for five minutes, morning to evening in turn, with the camera drifting over the reef, and once a second reads the
// status of every reef fish group and every small-fish school offered as a subject, against what that group itself is
// doing right now (its own state, read here apart from the words):
//   chased    — one of its fish under a predator's chase in the last 2 s: the words must say it is chased
//   shying    — a predator frightened it in the last 4 s (not chased): the words must say so
//   resting   — settled (activity under 0.35, nothing after it): the words must say it rests or sleeps
//   grazing   — an algae eater, active: "藻をかじっている" only then, and never otherwise
// Logged, for the subject's own line (now) and for the species' line (as it was: one line for all of a kind):
// the share of readings that are wrong. Want 0 for the subject's own.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/status-check.ts [miyako gbr]
import './node-land';
import * as THREE from 'three';
import { loadLand } from '../src/ocean/land';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState } from '../src/time/clock';

let bad = 0;
const want = process.argv.slice(2);
for (const id of want.length ? want : ['miyako', 'gbr']) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!;
  if (loc.land) await loadLand(id, loc.land.half, loc.land.far);
  const oc: any = buildOcean(loc);
  const cam = new THREE.Vector3();
  let n = 0, wrongNow = 0, wrongOld = 0; const ex: string[] = [], tally: Record<string, number> = {};
  for (const hour of [6.5, 10, 17.8]) {
    oc.eco.setSky(skyState(Date.UTC(2026, 8, 29, 0) + (hour - loc.tz) * 3600000, loc), new THREE.Vector2(0.3, 0.1));
    const dt = 1 / 10;
    for (let k = 0; k < 10 * 100; k++) {
      const t = k * dt, s = (hour * 37 + t) * 0.004;
      const [px, pz] = loc.path ? loc.path(s) : [Math.cos(s) * 40, Math.sin(s) * 40];
      cam.set(px, Math.min(oc.T.top(px, pz) + 4, -2), pz);
      const [qx, qz] = loc.path ? loc.path(s + 0.01) : [Math.cos(s + 0.01) * 40, Math.sin(s + 0.01) * 40];
      const fx = qx - px, fz = qz - pz, fl = Math.hypot(fx, fz) || 1;
      oc.eco.step(dt, t, cam, fx / fl, fz / fl);
      if (k % 10 || t < 15) continue;
      const subj = oc.eco.subjects();
      for (const f of oc.fish as any[]) {
        const G = f.dbg?.groups, Ls = f.dbg?.leaders;
        if (!G && !Ls) continue;
        for (const sj of subj) {
          const [sid, gi, extra] = sj.key.split(':');
          if (sid !== f.sp.id || extra || sj.kind === 'hunt') continue;
          const g = G ? G[+gi] : Ls[+gi]; if (!g) continue;
          // (what it is doing, from its own state)
          let truth = '';
          if (g.ch && g.t - g.ch.t < 2) truth = 'chased';
          else if (G && g.predT != null && g.t - g.predT < 4) truth = 'shying';
          else if (Ls && g.fear > 0.5) truth = 'shying';
          else if (G && g.act < 0.35 && !(g.cr && g.cr.mode !== 'out')) truth = 'resting';
          else if (G && f.sp.diet === 'algae' && g.act > 0.5 && g.fear <= 0.2 && !g.goal) truth = 'grazing';   // (moving on to another patch, it says that instead)
          const right = (w: string) => truth === 'chased' ? /追われ|弾け/.test(w) : truth === 'shying' ? /捕食者|逃げ/.test(w) : truth === 'resting' ? /休|眠/.test(w) : truth === 'grazing' ? /藻をかじ/.test(w) : !/藻をかじ/.test(w) || !(G && g.act <= 0.5);
          const now = sj.status(), old = f.status();
          n++; tally[truth || 'other'] = (tally[truth || 'other'] ?? 0) + 1;
          if (!right(now)) { wrongNow++; if (ex.length < 5) ex.push(`${sj.label} ${truth || 'other'}: "${now}"`); }
          if (!right(old)) wrongOld++;
        }
      }
    }
  }
  const pn = 100 * wrongNow / Math.max(1, n), po = 100 * wrongOld / Math.max(1, n), ok = wrongNow === 0;
  if (!ok) bad++;
  console.log(`${id}: ${n} readings (${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(', ')}); wrong — its own line ${pn.toFixed(1)}%, the species' line ${po.toFixed(1)}% ${ok ? 'ok' : 'FAIL'}${ex.length ? '; e.g. ' + ex.join(' | ') : ''}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
