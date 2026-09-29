// Headless check of the ecosystem: build a sea, run it through dusk and night, report behaviour.
// Usage: npx tsx scripts/sim-check.ts [seaId]
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';

const loc = LOCATIONS.find((l) => l.id === (process.argv[2] || 'miyako'))!;
const oc = buildOcean(loc);
const cam = new THREE.Vector3(0, loc.f(0, 0) + 3, 0);
const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
const current = new THREE.Vector2(0.5, 0.2);
let events: string[] = [];
function run(fromMs: number, seconds: number, label: string) {
  const s = skyState(fromMs, loc);
  oc.eco.setSky(s, current);
  let t = 0;
  for (let k = 0; k < seconds * 10; k++) {
    t += 0.1;
    for (const e of oc.eco.step(0.1, t, cam, 0, -1)) events.push(`${label} ${t.toFixed(0)}s ${e.text}`);
  }
  const prey = oc.eco.env.prey.reduce((a, p) => a + p.alive, 0);
  console.log(`\n[${label}] day=${s.day.toFixed(2)} night=${s.night.toFixed(2)} twilight=${s.twilight.toFixed(2)} prey alive=${prey}`);
  for (const f of oc.fish) console.log(`  ${f.sp.ja.padEnd(14, '　')} ${f.status()}`);
  console.log(`  ウミガメ: ${oc.turtles.map((x: any) => x.state).join(', ')}`);
  console.log(`  plankton @cam: ${oc.eco.env.plankton.sample(0, 0).toFixed(2)}`);
}
run(ev.noon, 60, 'noon');
run(ev.set - 20 * 60000, 600, 'dusk');
run(ev.set + 3 * 3600000, 120, 'night');
run(ev.rise + 20 * 60000, 90, 'dawn');
console.log('\nevents:\n' + events.slice(0, 25).join('\n'));
