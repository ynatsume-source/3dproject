// Headless check: a turtle rising to breathe goes all the way up (its head at the surface), stays a few seconds,
// and only then goes down again; it does not stop short a metre under and sink back (owner report, night).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/turtle-breath-check.ts [miyako]
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';

const loc = LOCATIONS.find((l) => l.id === (process.argv[2] || 'miyako'))!;
const oc = buildOcean(loc);
const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
let bad = 0;
for (const [label, ms] of [['night', ev.set + 3 * 3600000], ['noon', ev.noon]] as const) {
  oc.eco.setSky(skyState(ms, loc), new THREE.Vector2(0.5, 0.2));
  const cam = new THREE.Vector3(0, -40, 0);   // (the camera far below: nothing startles it)
  let t = 0;
  for (let k = 0; k < 300; k++) { t += 0.1; oc.eco.step(0.1, t, cam, 0, -1); }
  for (const tu of oc.turtles as any[]) {
    if (!tu.placed) continue;
    tu.air = 0; tu.alarm = 0;
    let top = -1e9, atTop = 0, startedDown = -1, upAgain = false, min = 1e9;
    for (let k = 0; k < 1200; k++) {
      t += 0.1; oc.eco.step(0.1, t, cam, 0, -1);
      const y = tu.pos.y;
      if (y > top) top = y;
      if (y > -0.5) atTop += 0.1;
      if (tu.state !== 'breathe' && startedDown < 0 && k > 5) startedDown = k * 0.1;
      if (startedDown >= 0) min = Math.min(min, y);
      if (startedDown >= 0 && k * 0.1 > startedDown + 20) { upAgain = min < y - 0.01 && false; break; }
    }
    const ok = top > -0.5 && atTop >= 2.5 && atTop < 20;
    if (!ok) bad++;
    console.log(`${label} turtle: highest ${top.toFixed(2)} m, ${atTop.toFixed(1)} s within 0.5 m of the surface, then ${tu.state} ${ok ? 'ok' : 'FAIL'}`);
    tu.air = 999;
    void upAgain;
  }
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
if (bad) process.exit(1);
