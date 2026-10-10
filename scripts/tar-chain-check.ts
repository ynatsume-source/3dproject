// Headless check (the residents' wood tar, 2026-10-10: science p14x 0.1.3 with the residents' tar_retort, p16x 0.1.4 on
// their own fired jar), with the residents:
//  1 two fired jars of the retort's sizes (2 L upper, 0.3 L lower) made the retort (fired-pot-assembly/2 retortParams)
//  2 the charge carved from a dry lot and laid in the upper jar, the fuel beside it; burned as planned (fed 200 minutes,
//    opened at six hours): charcoal, the tar and the wood vinegar on the shelf; nothing left in the retort
//  3 a 0.5 L fired jar, the tar, a brush made from bamboo: the jar sealed (sealed 1)
//  4 the retort kept across a save
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/tar-chain-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather, islandWeather } from '../src/world/island-time';
import { addLot } from '../src/world/process-runner';

let now = Date.parse('2026-10-06T00:00:00Z');   // (9:00 on the island)
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
await loadIslandWeather();
Math.random = mulberry32(7);
const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
R.setBrain(null);
const lantern = R.list.find((r: any) => r.id === 'lantern'), lab = R.lab;
const step = (secs: number, until?: () => boolean) => { for (let i = 0; i < secs; i++) { now += 1000; R.update(1, now, new THREE.Vector3(0, 50, 0)); if (i % 60 === 0) R.setWeather(islandWeather(now)); for (const r of R.list) if (!r.sp.living) { r.battery = 1; r.hunger = 0.2; } if (until?.()) return true; } return false; };
const lots = (m: string) => Object.values(lab.lots).filter((l: any) => l.materialId === m) as any[];
const runs = (p: string) => Object.values(lab.runs).filter((r: any) => r.processId === p) as any[];
const jar = (ml: number, mg: number) => addLot(lab, { materialId: 'fired_pot', amount: { value: mg, unit: 'mg' }, location: 'shelf', quality: { form: 2, capacity_ml: ml, surface_cm2: Math.round(4.836 * Math.pow(ml, 2 / 3) * 1.2), absorption_ppm: 120_000, history_complete: 1 } });
// (the island as the lamp leaves it: its cook pot and lamp dish stand; seasoned wood in a pile; and two jars fired for the retort)
lab.equipment['eq:cook_pot'] = { equipmentId: 'eq:cook_pot', kind: 'cook_pot', catalogEntry: 'cook_pot', catalogVersion: 'x', condition: 1, params: { capacityMl: 3000 } };
lab.equipment['eq:lamp_dish'] = { equipmentId: 'eq:lamp_dish', kind: 'lamp_dish', catalogEntry: 'lamp_dish', catalogVersion: 'x', condition: 1, params: { capacityMl: 100, absorptionPpm: 120000, massG: 250, shelter: 0.8, roofed: 1 } };
addLot(lab, { materialId: 'firewood', amount: { value: 30_000_000, unit: 'mg' }, location: 'shelf', quality: { water_ppm: 250_000, history_complete: 1 } });
jar(2000, 1_400_000); jar(300, 420_000);
{ // 1
  step(3600, () => !!lab.equipment['eq:tar_retort']);
  const e = lab.equipment['eq:tar_retort'];
  want('1 two fired jars made the retort', !!e && e.params.capacityMl === 2000 && e.params.heatCapJPerK > 0 && lots('fired_pot').length === 0, JSON.stringify(e?.params));
}
{ // 2
  step(2 * 86400, () => runs('p14x_charcoal_tar_retort').some((r) => !['starting', 'running', 'needs-input'].includes(r.status)));
  const run = runs('p14x_charcoal_tar_retort')[0];
  const at = (m: string) => lots(m).map((l) => `${+(l.amount.value / 1000).toFixed(0)}g@${l.location}`).join(',');
  want('2 burned as planned: charcoal, tar and wood vinegar', run?.status === 'completed' && lots('charcoal').length > 0 && lots('wood_tar').length > 0, `${run?.status} ${run?.why ?? ''} charcoal ${at('charcoal')} tar ${at('wood_tar')} vinegar ${at('wood_vinegar')}`);
  want('2 all of it on the shelf, nothing left in the retort', Object.values(lab.lots).every((l: any) => l.location !== 'eq:tar_retort') && lots('wood_tar').every((l) => l.location === 'shelf'), Object.values(lab.lots).filter((l: any) => l.location !== 'shelf').map((l: any) => `${l.materialId}@${l.location}`).join(','));
}
{ // 3
  jar(500, 600_000);
  addLot(lab, { materialId: 'bamboo', amount: { value: 1_000_000, unit: 'mg' }, location: 'shelf', quality: { history_complete: 1 } });
  step(2 * 86400, () => lots('fired_pot').some((l) => l.quality?.sealed === 1));
  const s = lots('fired_pot').find((l) => l.quality?.sealed === 1);
  want('3 a 0.5 L jar sealed with the island\'s tar (a brush made first)', !!s && !!lab.equipment['eq:fixture_tar_brush'] && (s.quality.x_wood_tar_ppm ?? 0) > 0, JSON.stringify(s?.quality ?? runs('p16x_vessel_tar_seal').map((r) => `${r.status} ${r.why ?? ''}`)));
  want('3 said in its own words', lantern.diary.some((e: any) => /乾留の器にした/.test(e.text)) && lantern.diary.some((e: any) => /封じ/.test(e.text)), lantern.diary.filter((e: any) => /乾留|封じ|炭/.test(e.text)).map((e: any) => e.text).slice(-3).join(' / '));
}
R.save(); const saved = JSON.parse([...store.values()].find((v) => v.includes('tar_retort')) ?? '{}');
want('4 the retort kept in the save', !!saved.lab?.equipment?.['eq:tar_retort']?.assembled);
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
