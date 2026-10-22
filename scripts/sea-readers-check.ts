// Headless check (the sea level, ADR 0009 step 2 in preparation: what reads the sea's height). Each sea's life run for three
// minutes at the year's lowest tide (−1.04 m), at mean sea level and at its highest (+0.91 m), the sea's height set as the
// app sets it (setSeaLevel):
//  1 none of the sea's life above the still water — a breath, a ceiling, a leap's exit all from the water's top there, not
//    from y = 0 (at the lowest tide a sea snake breathing at y = −0.2 had been 0.8 m up in the air)
//    what comes to the top (to breathe, a leap) as near it at every tide as at mean sea level
//  2 at mean sea level all as before: the waters' top 0 everywhere, no map read (the many that ask each frame)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/sea-readers-check.ts
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { setSeaLevel, waterTopAt, useWater } from '../src/ocean/air';

let bad = 0;
const want = (what: string, ok: boolean, got: unknown = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
// (in the air by nature: the birds, the flying fish out of the water)
const flies = (s: any) => s.kind === 'bird' || /トビウオ|カツオドリ|アジサシ|カモメ|ペリカン|グンカン/.test(s.label ?? '');
for (const id of ['miyako', 'gbr', 'galapagos']) {
  const hi: Record<string, Record<string, number>> = {};
  for (const h of [-1.04, 0, 0.91]) {
    const loc: any = LOCATIONS.find((l) => l.id === id)!, oc: any = buildOcean(loc); useWater(oc.water ?? null); setSeaLevel(h);
    const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc); oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.5, 0.2));
    const cam = new THREE.Vector3(0, h - 3, 0), top: Record<string, number> = hi[h] = {}; let t = 0;
    for (let k = 0; k < 1800; k++) {
      t += 0.1; oc.eco.step(0.1, t, cam, 0, -1);
      if (k % 10) continue;
      for (const s of oc.eco.subjects()) { if (flies(s)) continue; const p = s.pos(); if (!p) continue; const key = `${s.kind}:${s.label}`; top[key] = Math.max(top[key] ?? -1e9, p.y - waterTopAt(p.x, p.z)); }
    }
    const [k, v] = Object.entries(top).sort((a, b) => b[1] - a[1])[0] ?? ['-', -1e9];
    want(`1 ${id}, the sea at ${h >= 0 ? '+' : ''}${h.toFixed(2)} m: the sea's life under its water`, v <= 0.02, `highest ${k} ${v.toFixed(2)} m from the top, ${Object.keys(top).length} kinds`);
  }
  // (those that come to the top — to breathe, a leap, the ceiling of a shoal — as near it at every tide as at mean sea level;
  // the rest keep to the reef, which does not move, so are nearer the top at low water)
  const kinds = Object.keys(hi[0]).filter((k) => hi[0][k] > -0.6), off = kinds.filter((k) => [hi[-1.04][k], hi[0.91][k]].some((v) => v !== undefined && Math.abs(v - hi[0][k]) > 0.15));
  want(`1 ${id}: what comes to the top, as near it at every tide`, off.length === 0, off.length ? off.map((k) => `${k} ${hi[0][k].toFixed(2)} → ${hi[-1.04][k]?.toFixed(2)} / ${hi[0.91][k]?.toFixed(2)}`).join(', ') : kinds.map((k) => `${k.split(':')[1]} ${hi[0][k].toFixed(2)}`).join(', '));
}
{ // 2
  setSeaLevel(0); let reads = 0;
  useWater({ tex: {}, tideK: () => { reads++; return 1; }, x0: 0, z0: 0, size: 1 } as any);
  const tops = Array.from({ length: 100 }, (_, i) => waterTopAt(i * 3.1, -i * 1.7));
  want('2 at mean sea level: the waters\' top 0 everywhere, no map read', tops.every((v) => v === 0) && reads === 0, `${reads} reads`);
  setSeaLevel(0.5); const t1 = waterTopAt(1, 1); setSeaLevel(0); useWater(null);
  want('2 off it: the map read', t1 === 0.5 && reads === 1, `${t1} m, ${reads} read`);
}
console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
