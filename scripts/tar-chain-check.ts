// Headless check (the residents' wood tar, 2026-10-10: science p14x 0.1.3 with the residents' tar_retort, p16x 0.1.4 on
// their own fired jar), with the residents:
//  1 two fired jars of the retort's sizes (2 L upper, 0.3 L lower) made the retort (fired-pot-assembly/2 retortParams)
//  2 the charge carved from a dry lot and laid in the upper jar, the fuel beside it; burned as planned (fed 200 minutes,
//    opened at six hours): charcoal, the tar and the wood vinegar on the shelf; nothing left in the retort
//  3 a 0.5 L fired jar, the tar, a brush made from bamboo, a 350 mm tube cut from it: the jar sealed with the tube through
//    its plug (science final review 2026-10-11-bamboo-tube)
//  4 the weather pot: the sealed jar with its tube made a gauge (table /5, the stick added), 250 mL of rain water in it, read
//    every few hours on the island's record — only marks and words in Lantern's diary, the air kept in the log
//  5 the retort and the weather pot kept across a save
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/tar-chain-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather, islandWeather } from '../src/world/island-time';
import { addLot } from '../src/world/process-runner';
import { recentScienceRuns } from '../src/world/science-records';

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
const runs = (p: string) => [...Object.values(lab.runs), ...recentScienceRuns(lab)].filter((r: any) => r.processId === p) as any[];
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
  addLot(lab, { materialId: 'bamboo', amount: { value: 3_000_000, unit: 'mg' }, location: 'shelf', quality: { history_complete: 1 } });
  addLot(lab, { materialId: 'process_water', amount: { value: 1_000_000, unit: 'mg' }, location: 'shelf', quality: { history_complete: 1 } });
  step(3 * 86400, () => lots('fired_pot').some((l) => l.quality?.sealed === 1) || !!lab.equipment['eq:assembled_pot']);
  const tube = runs('p18x_bamboo_tube').filter((r) => r.status === 'completed').length;
  const s = lots('fired_pot').find((l) => l.quality?.sealed === 1) ?? (lab.equipment['eq:assembled_pot'] ? { quality: lab.equipment['eq:assembled_pot'].assembled?.copy?.quality } : undefined);
  want('3 a 350 mm bamboo tube cut, the 0.5 L jar sealed with it through its plug (a brush made first)', tube >= 1 && !!s && s.quality?.tube_form === 2 && s.quality?.tube_length_mm === 350 && (s.quality?.x_wood_tar_ppm ?? 0) > 0 && !!lab.equipment['eq:fixture_tar_brush'], JSON.stringify(s?.quality ?? runs('p16x_vessel_tar_seal').map((r) => `${r.status} ${r.why ?? ''}`)) + ` tubes cut ${tube}`);
}
{ // 4
  step(2 * 86400, () => (R.village.gaugeLog ?? []).filter((g: any) => g.processId === 'm03x_air_barometer_pot' && g.mark !== undefined).length >= 3);
  const e = lab.equipment['eq:assembled_pot'], run = runs('m03x_air_barometer_pot')[0];
  const water = run ? run.lotIds.map((id: string) => lab.lots[id]).find((l: any) => l?.materialId === 'process_water') : undefined;
  want('4 the weather pot: tubeForm 2, the stick added, 250 mL of rain water in it', e?.params?.tubeForm === 2 && e.params.markMm === 5 && water?.amount.value === 250_000, `${JSON.stringify(e?.params)} water ${water?.amount.value} ${run?.status ?? 'no run'} ${run?.why ?? ''}`);
  const log = (R.village.gaugeLog ?? []).filter((g: any) => g.processId === 'm03x_air_barometer_pot'), said = lantern.diary.filter((x: any) => /天気の壺を置いて読む.*：目盛り/.test(x.text)).map((x: any) => x.text);
  want('4 read every few hours: marks in the diary (and at most a felt word, no number for the air), the air kept in the log', log.filter((g: any) => g.mark !== undefined).length >= 3 && said.length >= 3 && log.every((g: any) => g.airC === null || Number.isFinite(g.airC)) && said.every((t: string) => !/\d/.test((t.match(/（([^（）]*)）$/) ?? ['', ''])[1])), said.slice(0, 3).join(' / '));
}
R.save(); const saved = JSON.parse([...store.values()].find((v) => v.includes('tar_retort')) ?? '{}');
want('5 the retort and the weather pot kept in the save', !!saved.lab?.equipment?.['eq:tar_retort']?.assembled && !!saved.lab?.equipment?.['eq:assembled_pot']?.assembled);
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
