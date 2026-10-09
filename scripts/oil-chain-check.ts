// Headless check (science final review 2026-10-09-pit-fire; the goal "boil coconut oil in a pot fired on the island"),
// with the residents. clay-chain-check takes raw clay to a dry pot; from there:
//  1 Lantern makes what the processes wait for from the science side's recipes: the woodpile's roof and the coconut tools
//    (bamboo off the shelf); it piles the green firewood together (six lots, branches of felled trees)
//  2 the pile dries under its roof (p15x, 30 island days) — green wood never brings a pot to red
//  3 the dry pot is fired in the open on the seasoned wood (p13y, Lantern's fire plan): a fired pot, or sherds
//  4 the fired pot made the island's cook pot (civ-sci.fired-pot-assembly/1)
//  5 a coconut split, grated and pressed (p30x), the milk boiled in that pot over the fire (p31x 0.1.3): coconut oil
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/oil-chain-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather, islandWeather } from '../src/world/island-time';
import { addLot, emptyLedger, startRun, advance, toReal, type Ledger } from '../src/world/process-runner';
import { CATALOG } from '../src/world/process-catalog';

let now = Date.parse('2026-10-06T08:00:00Z');   // (17:00 on the island: Lantern is up)
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
await loadIslandWeather();

// (a dry cook pot as the island's steps make one: coiled from 2 kg of prepared clay, dried a fortnight under leaves)
function dryPot() {
  const env = (clock: 'world' | 'island') => (at: number) => { const w = islandWeather(toReal(clock, at)); return w ? { sampleId: `e${at}`, source: 'record' as const, effectiveAt: at, airTempC: w.air, humidity: w.humidity, windMs: w.windMeasured, windHeightM: 28.9, rainMmH: w.rainMeasured, pressureHPa: w.pressureMeasured } : { sampleId: `n${at}`, source: 'unknown' as const, effectiveAt: at }; };
  const spec = (e: any) => ({ processId: e.processId, processVersion: e.processVersion, catalogVersion: e.catalogVersion, contract: e.contract, clock: e.clock, operator: 'res:lantern' });
  const shapeE = CATALOG.find((c) => c.processId === 'p11y_pot_shape')!, dryE = CATALOG.find((c) => c.processId === 'p12y_pot_dry')!;
  const L: Ledger = emptyLedger('w', 'e'), T0 = Date.parse('2026-10-06T10:00:00+09:00');
  addLot(L, { lotId: 'lot:clay', materialId: 'prepared_clay', amount: { value: 2_000_000, unit: 'mg' }, location: 'shelf', quality: { water_ppm: 200_000, xd_kaolinite_ppm: 600_000, xd_quartz_ppm: 400_000 } });
  const r1 = startRun(L, { ...spec(shapeE), lotIds: ['lot:clay'], equipmentIds: [] }, T0).run!;
  const green = advance(L, r1.runId, shapeE.step, { realNow: T0 + 3 * 3600e3, environment: env('world'), energy: shapeE.energy, actions: [{ at: r1.lastTo, action: 'plan', params: shapeE.start!.params }] }).flatMap((c) => c.produced ?? []).find((l) => l.materialId === 'green_pot')!;
  L.equipment['eq:rack'] = { equipmentId: 'eq:rack', kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: 'civ-sci-test-2', condition: 1, params: { sunExposure: 0, covered: 1 } };
  const T1 = T0 + 4 * 3600e3, r2 = startRun(L, { ...spec(dryE), lotIds: [green.lotId], equipmentIds: ['eq:rack'] }, T1).run!;
  return advance(L, r2.runId, dryE.step, { realNow: T1 + 20 * 86400e3, environment: env('island'), actions: [{ at: r2.lastTo + 14 * 86_400_000, action: 'take_off' }] }).flatMap((c) => c.produced ?? []).find((l) => l.materialId === 'dry_pot')!;
}
const pot = dryPot();
if (!pot) { console.log('FAIL: no dry pot to start from'); process.exit(1); }
Math.random = mulberry32(3);
const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
R.setBrain(null);
const lantern = R.list.find((r: any) => r.id === 'lantern'), lab = R.lab;
const step = (secs: number, until?: () => boolean) => { for (let i = 0; i < secs; i++) { now += 1000; R.update(1, now, new THREE.Vector3(0, 50, 0)); if (i % 60 === 0) R.setWeather(islandWeather(now)); for (const r of R.list) if (!r.sp.living) { r.battery = Math.max(r.battery, 0.6); } if (until?.()) return true; } return false; };
const lots = (m: string) => Object.values(lab.lots).filter((l: any) => l.materialId === m) as any[];
const has = (m: string) => lots(m).length > 0;
const diary = (re: RegExp) => lantern.diary.find((e: any) => re.test(e.text))?.text ?? '';
{ const { lotId: _, ...p } = pot; addLot(lab, { ...p, location: 'shelf' }); }   // (a lot id of the shelf's own)
for (let k = 0; k < 6; k++) addLot(lab, { materialId: 'firewood', amount: { value: 8_000_000, unit: 'mg' }, location: 'shelf', quality: { water_ppm: 450_000, history_complete: 1 } });   // (the branches of felled trees, green)
addLot(lab, { materialId: 'bamboo', amount: { value: 6_000_000, unit: 'mg' }, location: 'shelf' });
for (let k = 0; k < 2; k++) addLot(lab, { materialId: 'coconut', amount: { value: 1_500_000, unit: 'mg' }, quality: { count: 1 }, location: 'shelf' });
{ // 1
  step(6 * 3600, () => !!lab.equipment['eq:firewood_stack'] && !!lab.equipment['eq:fixture_coconut_tools'] && lots('firewood').length === 1);
  want('1 the woodpile\'s roof and the coconut tools made from bamboo, as the recipes say', !!lab.equipment['eq:firewood_stack'] && !!lab.equipment['eq:fixture_coconut_tools'] && lots('bamboo').reduce((n, l) => n + l.amount.value, 0) === 6_000_000 - 2_000_000 - 1_500_000, `${diary(/薪の山の屋根を作った/).slice(0, 60)} / ${diary(/ヤシの実を割る/).slice(0, 40)}`);
  const w = lots('firewood');
  want('1 the green firewood piled together: one lot, its mass and its water', w.length === 1 && w[0].amount.value === 48_000_000 && w[0].quality.water_ppm === 450_000, diary(/薪を1つの山にまとめた/));
}
{ // 2..5
  const stages: string[] = [], seen = (m: string, ok: () => boolean) => { if (!stages.includes(m) && ok()) stages.push(m); };
  const done = step(300 * 3600, () => {
    seen('drying', () => Object.values(lab.runs).some((r: any) => r.processId === 'p15x_firewood_dry'));
    seen('seasoned', () => lots('firewood').some((l) => l.quality.water_ppm <= 250_000));
    seen('firing', () => Object.values(lab.runs).some((r: any) => r.processId === 'p13y_pot_pit_fire'));
    seen('fired_pot', () => has('fired_pot') || !!lab.equipment['eq:cook_pot']);
    seen('sherds', () => has('pot_sherds'));
    seen('cook_pot', () => !!lab.equipment['eq:cook_pot']);
    seen('milk', () => has('coconut_milk') || has('coconut_oil'));
    seen('oil', () => has('coconut_oil'));
    return has('coconut_oil') || has('pot_sherds') || lots('fired_pot').some((l) => (l.quality.crack ?? 0) >= 1);
  });
  const runs = Object.values(lab.runs).map((r: any) => `${r.processId} ${r.status}${r.why ? ' (' + r.why + ')' : ''}`);
  const wood = lots('firewood').map((l) => `${(l.amount.value / 1e6).toFixed(1)}kg ${(l.quality.water_ppm / 1e4).toFixed(0)}%`).join(', ');
  console.log('stages', stages.join(' → '), '| runs', runs.join(', '), '| wood', wood);
  want('2 the pile dried under its roof: seasoned wood', stages.includes('seasoned'), diary(/薪を積んで乾かす：できた/).slice(0, 120));
  want('3 the dry pot fired in the open on it', stages.includes('firing') && (stages.includes('fired_pot') || stages.includes('sherds')), diary(/野焼きする：/).slice(0, 160));
  const fp = lots('fired_pot')[0], cracked = !lab.equipment['eq:cook_pot'] && !!fp && (fp.quality.crack ?? 0) >= 1;
  console.log('  fired pot:', JSON.stringify(fp?.quality ?? lab.equipment['eq:cook_pot']?.assembled?.from?.quality ?? {}));
  if (stages.includes('sherds')) console.log('  (the pot broke in the fire: a real outcome — the rest needs another pot)');
  else if (cracked) { console.log('  (a hairline crack from the fire: a real outcome — a cracked pot leaks and is not made a cook pot; the rest needs another pot)'); want('4 a cracked pot is not made a cook pot', !lab.equipment['eq:cook_pot'] && !Object.values(lab.runs).some((r: any) => r.processId === 'p31x_coconut_oil_boil')); }
  else {
    want('4 the fired pot made the island\'s cook pot', stages.includes('cook_pot'), `${diary(/焼いた器を鍋にした/)} ${JSON.stringify(lab.equipment['eq:cook_pot']?.params ?? {})}`);
    const oil = lots('coconut_oil')[0];   // (a boil stopped — taken off when its tender was called away — keeps the oil it had made)
    want('5 a coconut pressed, its milk boiled in that pot: coconut oil', done && !!oil && Object.values(lab.runs).some((r: any) => r.processId === 'p31x_coconut_oil_boil' && ['completed', 'stopped'].includes(r.status) && r.equipmentIds.includes('eq:cook_pot')), oil ? `${(oil.amount.value / 1000).toFixed(1)} g — ${Object.values(lab.runs).filter((r: any) => r.processId === 'p31x_coconut_oil_boil').map((r: any) => r.status).join(',')} — ${lantern.diary.filter((e: any) => /煮て油をとる：|野焼きする：/.test(e.text)).map((e: any) => e.text).join(' / ').slice(0, 400)}` : 'none');
  }
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
