// Seabirds and their hunting (eco/birds, ocean/seabird): each sea with birds is run by day for MIN minutes, the camera
// up in the air on a wide loop, looking where it goes (a bait ball, where there is one, runs as it does). Want: no bird
// ever moved more than a few metres in one step unless out of sight before and after (eco/birds birdUnseen); none low
// over the land or into the seabed under the water; the boobies and shearwaters only plunging where it is deep enough;
// banked into their turns (the inner wing down); each kind hunting its own way at least once (a booby's plunge, a
// tern's hover and dip, a shearwater's dive, a frigatebird's skim, an albatross settling to seize). Then a kind is
// called up as the guide does: it should come across in front of the camera within 20 s.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/bird-check.ts [sea ...]   (env MIN 12)
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { birdUnseen } from '../src/eco/birds';

const MIN = +(process.env.MIN || 12), seas = process.argv.slice(2);
let fail = 0;
const ang = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
for (const id of seas.length ? seas : LOCATIONS.filter((l: any) => l.birds).map((l) => l.id)) {
  const loc: any = LOCATIONS.find((l) => l.id === id)!;
  const oc: any = buildOcean(loc);
  const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
  oc.eco.setSky(skyState(ev.noon - 2 * 3600e3, loc), new THREE.Vector2(0.3, 0.1));
  const B = oc.birds, T = oc.T, dt = 0.05, R0 = 70, W = 1.1 / R0, cam = new THREE.Vector3();
  const prev = new Map<any, { p: THREE.Vector3; seen: boolean; h: number; state: string }>();
  let jumps = 0, badJumps = 0, lowLand = 0, inBed = 0, shallow = 0, bankOk = 0, bankBad = 0, t = 0;
  const ev2: Record<string, number> = {}, logs: Record<string, number> = {};
  const count = (k: string) => { ev2[k] = (ev2[k] ?? 0) + 1; };
  const fx2 = { splash() {}, bubbles() {}, plop() {} };
  const step = (fx: number, fz: number) => {
    oc.eco.step(dt, t, cam, fx, fz);
    B.update(dt, cam, fx, fz, cam.y > 0, (_sp: any, text: string) => { logs[text] = (logs[text] ?? 0) + 1; }, oc.bait?.attract, fx2);
    for (const F of B.flocks) for (const b of F.birds) {
      const seen = !birdUnseen(b.p, cam, fx, fz), q = prev.get(b);
      if (q) {
        if (q.p.distanceTo(b.p) > 5) { jumps++; if (q.seen || seen) { badJumps++; if (process.env.DEBUG) console.log('jump in sight', F.sp.id, q.state, b.state, q.p.distanceTo(b.p).toFixed(1)); } }
        if (q.state !== b.state) {
          const k = F.sp.kind;
          if (b.state === 'dive') count(`${k} ${b.dip ? 'dip' : 'plunge'}`);
          if (b.state === 'hover') count(`${k} hover`);
          if (b.state === 'skim') count(`${k} skim`);
          if (b.state === 'chase') count(`${k} chase`);
          if (b.state === 'land') count(`${k} land`);
          if (q.state === 'chase' && b.carry > 30) count(`${k} robbed`);
          if (b.state === 'under') { count(`${k} under`); if (T.top(b.p.x, b.p.z) > -2) { shallow++; if (process.env.DEBUG) console.log('shallow plunge', F.sp.id, T.top(b.p.x, b.p.z).toFixed(1)); } }
        }
        // (banked into the turn: turning right, h rising, the bank positive — the left wing up)
        if (b.state === 'fly' && q.state === 'fly') { const w = ang(b.h - q.h) / dt; if (Math.abs(w) > 0.35 && Math.abs(b.bank) > 0.05) { if (Math.sign(w) === Math.sign(b.bank)) bankOk++; else bankBad++; } }
      }
      prev.set(b, { p: b.p.clone(), seen, h: b.h, state: b.state });
      const g = T.ground(b.p.x, b.p.z);
      if (b.state !== 'under' && b.state !== 'rest' && g > 0 && b.p.y < g + 1) lowLand++;
      if (b.state === 'under' && b.p.y < T.top(b.p.x, b.p.z) + 0.2) inBed++;
    }
  };
  for (let k = 0; k < MIN * 60 / dt; k++) {
    t += dt;
    const a = t * W, fx = -Math.sin(a), fz = Math.cos(a);
    cam.set(Math.cos(a) * R0, Math.max(15, T.ground(Math.cos(a) * R0, Math.sin(a) * R0) + 12), Math.sin(a) * R0);
    step(fx, fz);
  }
  // the guide calling a kind up
  const F0 = B.flocks.find((f: any) => !f.sp.crowd);
  let came = Infinity; const fx = -Math.sin(t * W), fz = Math.cos(t * W);
  B.call(F0.sp.id, cam, fx, fz);
  for (let k = 0; k < 20 / dt; k++) {
    t += dt; step(fx, fz);
    for (const b of F0.birds) if (b.visit > 0 && !birdUnseen(b.p, cam, fx, fz) && b.p.distanceTo(cam) < 40) came = Math.min(came, k * dt);
  }
  const kinds = [...new Set(B.flocks.map((f: any) => f.sp.kind))] as string[];
  const hunted = kinds.filter((k) => (k === 'booby' && ev2['booby plunge']) || (k === 'tern' && ev2['tern hover'] && ev2['tern dip']) || (k === 'shearwater' && ev2['shearwater plunge'])
    || (k === 'frigate' && (ev2['frigate skim'] || ev2['frigate chase'])) || (k === 'albatross' && ev2['albatross land']));
  const ok = badJumps === 0 && lowLand === 0 && inBed === 0 && shallow === 0 && bankBad <= bankOk * 0.05 && hunted.length === kinds.length && came < 20;
  if (!ok) fail++;
  console.log(`${id} (${B.flocks.map((f: any) => `${f.sp.ja}${f.sp.crowd ? '・大群' : ''} ${f.birds.length}`).join(', ')}): ${MIN} min — set down ${jumps} (in sight ${badJumps}); low over land ${lowLand}; into the seabed ${inBed}; plunges into shallows ${shallow}; banked into the turn ${bankOk}, the wrong way ${bankBad}; hunting ${JSON.stringify(ev2)} (kinds that hunted ${hunted.length}/${kinds.length}); called up: in front within 40 m after ${came === Infinity ? 'never' : came.toFixed(1) + ' s'} — ${ok ? 'PASS' : 'FAIL'}`);
  if (process.env.LOGS) for (const [k, v] of Object.entries(logs)) console.log(`   ${v}× ${k}`);
}
process.exit(fail ? 1 : 0);
