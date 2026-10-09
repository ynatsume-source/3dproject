// Headless check (science final review 2026-10-07-clay-pit): on the island, with the residents, from raw clay on the
// shelf to a dried pot — Lantern digs the clay pit under the hut's roof (the clay for its lining from the shelf, as the
// science side's table says), and the island's own processes follow: soak in the pit, knead, coil a cook pot, dry it.
//  1 the pit: dug only once there is a roof, rain water and clay enough; the lining's clay taken from the shelf; the
//    equipment's params from the table; in Lantern's record, and nothing in it says an earth pit never leaks
//  2 the chain: soaked in the pit (p10x 0.1.2), kneaded, a cook pot coiled, dried on the rack
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/clay-chain-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather, islandWeather } from '../src/world/island-time';
import { addLot } from '../src/world/process-runner';
import { clayPitMaterials, clayPitParams } from '../src/science/step/clay-pit';
import { CLAY_PIT_PLAN } from '../src/world/process-catalog';
import { RAW_CLAY_SOUTH } from '../src/world/planet-map';

let now = Date.parse('2026-10-06T08:00:00Z');   // (17:00 on the island: Lantern is up)
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
await loadIslandWeather();
Math.random = mulberry32(3);
const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
R.setBrain(null);
const by = (id: string) => R.list.find((r: any) => r.id === id), lantern = by('lantern'), dot = by('dot');
const V = R.village, lab = R.lab;
const step = (secs: number, until?: () => boolean) => { for (let i = 0; i < secs; i++) { now += 1000; R.update(1, now, new THREE.Vector3(0, 50, 0)); if (i % 60 === 0) R.setWeather(islandWeather(now)); if (until?.()) return true; } return false; };
const need = clayPitMaterials(CLAY_PIT_PLAN);
const shelfClay = () => Object.values(lab.lots).filter((l: any) => l.materialId === 'raw_clay').reduce((n: number, l: any) => n + l.amount.value, 0);
{ // 1
  addLot(lab, { materialId: 'raw_clay', amount: { value: 30_000_000, unit: 'mg' }, location: 'shelf', quality: { ...RAW_CLAY_SOUTH } });   // (as the raft brings it)
  step(1800);
  want('1 no roof, no rain water: no pit', !V.clayPit);
  dot.stats.built = 24; V.catcher = { at: now, areaM2: 0.8, capMg: 20e6 };
  addLot(lab, { materialId: 'process_water', amount: { value: 18_000_000, unit: 'mg' }, location: 'shelf' });
  const clay0 = shelfClay();
  const dug = step(4 * 3600, () => !!V.clayPit);
  const eq = lab.equipment['eq:clay_pit'];
  want('1 dug under the hut\'s roof, its lining\'s clay from the shelf', dug && clay0 - shelfClay() === need.rawClayMg, `${(need.rawClayMg / 1e6).toFixed(1)} kg, ${Math.round(need.handSeconds / 60)} min`);
  want('1 the equipment\'s params from the table', !!eq && JSON.stringify(eq.params) === JSON.stringify(clayPitParams(CLAY_PIT_PLAN)), JSON.stringify(eq?.params));
  const line = lantern.diary.find((e: any) => /粘土の池を掘った/.test(e.text))?.text ?? '';
  want('1 in Lantern\'s record — and nothing says an earth pit never leaks', !!line && !/漏れない|漏らさない/.test(lantern.diary.map((e: any) => e.text).join('')), line);
}
{ // 2
  const has = (m: string) => Object.values(lab.lots).some((l: any) => l.materialId === m);
  const stages: string[] = [];
  const done = step(80 * 3600, () => {
    for (const m of ['settled_clay', 'prepared_clay', 'green_pot', 'dry_pot']) if (has(m) && !stages.includes(m)) stages.push(m);
    return has('dry_pot');
  });
  const runs = Object.values(lab.runs).map((r: any) => `${r.processId} ${r.status}${r.why ? ' (' + r.why + ')' : ''}`);
  want('2 soaked in the pit, kneaded, a cook pot coiled, dried on the rack', done && ['settled_clay', 'prepared_clay', 'green_pot', 'dry_pot'].every((m) => stages.includes(m)), `${stages.join(' → ')} | ${runs.join(', ')}`);
  want('2 the soak ran in the pit (0.1.4)', Object.values(lab.runs).some((r: any) => r.processId === 'p10x_clay_slake' && r.processVersion === '0.1.4' && r.equipmentIds.includes('eq:clay_pit')));
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
