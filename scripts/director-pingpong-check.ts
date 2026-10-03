// Headless check: with the default guide (程よく), does the camera swing back to what it has just left (A → B → A
// within two minutes), as it did after a manta? Flies a point-mass drone for 10 minutes per time of day and counts.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/director-pingpong-check.ts [sea]
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { Director, speciesOf } from '../src/director';
import { PERSONAS } from '../src/persona';

const loc = LOCATIONS.find((l) => l.id === (process.argv[2] || 'miyako'))!;
const persona = PERSONAS[0];
let back = 0, shots = 0;
for (const seed of [1, 2]) {
  const oc = buildOcean(loc);
  const d = new Director();
  d.dwellK = persona.dwell; d.distK = persona.distK; d.styles = persona.styles; d.giantW = persona.giant; d.spinK = persona.spinK;
  d.switchK = persona.switchK; d.minHold = persona.minHold; d.rest = persona.rest; d.nearK = persona.nearK ?? 1;
  const seen = new Set<string>();
  d.weight = (s) => persona.weight(s, { isNew: !seen.has(speciesOf(s)) } as any);
  d.jumpTo = (s) => !!persona.jumpTo?.(s, { isNew: !seen.has(speciesOf(s)) } as any);
  const pos = new THREE.Vector3(0, loc.f(0, 0) + 3, 0), vel = new THREE.Vector3();
  const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
  for (const ms of [ev.noon + seed * 600000, ev.set - 20 * 60000]) {
    oc.eco.setSky(skyState(ms, loc), new THREE.Vector2(0.5, 0.2));
    d.reset();
    let t = 0;
    const hist: { sp: string; at: number }[] = [];
    for (let k = 0; k < 6000; k++) {
      t += 0.1;
      oc.eco.step(0.1, t, pos, vel.x, vel.z || -1);
      const shot = d.update(0.1, pos, () => oc.eco.subjects(), oc.T.h, new THREE.Vector3(vel.x, 0, vel.z).normalize());
      if (shot) {
        const sp = speciesOf(shot.subject);
        if (!hist.length || hist[hist.length - 1].sp !== sp) {
          shots++; seen.add(sp);
          // A → B → A within two minutes
          if (hist.length >= 2 && hist[hist.length - 2].sp === sp && t - hist[hist.length - 2].at < 120) { back++; if (back <= 6) console.log(`  back to ${sp} at ${t.toFixed(0)} s (after ${hist[hist.length - 1].sp})`); }
          hist.push({ sp, at: t });
        }
        const want = shot.pos.clone().sub(pos); const L = want.length();
        vel.lerp(want.multiplyScalar(Math.min(2.4, L * 0.8) / Math.max(L, 1e-4)), 0.12);
      } else vel.lerp(new THREE.Vector3(1.2, 0, 0.3), 0.05);
      pos.addScaledVector(vel, 0.1);
      pos.x = Math.max(-120, Math.min(120, pos.x)); pos.z = Math.max(-120, Math.min(120, pos.z));
      pos.y = Math.min(Math.max(pos.y, oc.T.h(pos.x, pos.z) + 0.7), -0.7);
    }
  }
}
console.log(`${loc.id}: subject changes ${shots}, swung back to what it just left ${back}`);
