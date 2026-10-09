// Checks for the residents' fired pots as equipment (table civ-sci.fired-pot-assembly/1).
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-fired-pot-assembly-check.ts
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { POT_DRY_PROCESS, POT_SHAPE_PROCESS } from '../src/science/step/pottery';
import { PIT_FIRE_PROCESS } from '../src/science/step/pit-fire';
import { LEAK_TEST_PROCESS, POT_ASSEMBLY_TABLE, potQualityOnReturn, potToEquipmentParams, readPot, TAR_SEAL_PROCESS } from '../src/science/step/vessel';
import { OIL_LAMP_PROCESS, wickQuality } from '../src/science/step/oil-lamp';
import { cookPotParams, FIRED_POT_ASSEMBLY_TABLE, firedPotQualityOnReturn, firedPotSherdsQuality, lampDishParams, retortParams, retortPartsOnReturn, TOOL_RECIPES } from '../src/science/step/fired-pot-assembly';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const H = 3600_000, D = 24 * H, W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const asLot = (p: ScienceStepResult['produced'][number], id: string): LotView => ({ lotId: id, materialId: p.materialId, amount: p.amount, location: 'site:shelf', quality: p.quality });

/** A real fired pot: kneaded clay → shaped → dried 8 days in the shade → fired with care (the first seed that does not crack). */
function firedPot(form: number, capacityMl: number, id: string): LotView {
  const shaped = scienceStep({ contract: '0.2.0', requestId: 's', world: W, runId: `run:shape:${id}`, ...POT_SHAPE_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: 0, to: 4 * H }, state: null,
    environment: { sampleId: 'env:0', source: 'record', effectiveAt: 0 }, lots: [{ lotId: 'lot:clay', materialId: 'prepared_clay', amount: { value: 5_000_000, unit: 'mg' }, location: 's', quality: { water_ppm: 200_000, xd_kaolinite_ppm: 600_000, xd_quartz_ppm: 380_000 } }],
    equipment: [], energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: 4 * 3600 * 20 }], seed: 1, actions: [{ at: 0, residentId: 'res:lantern', action: 'plan', params: { form, capacityMl } }] });
  const green = asLot(shaped.produced[0], `lot:green:${id}`);
  let st: ScienceStepRequest['state'] = null, r!: ScienceStepResult;
  for (let t = 0; t < 8 * D; t += 6 * H) {
    r = scienceStep({ contract: '0.2.0', requestId: `d${t}`, world: W, runId: `run:dry:${id}`, ...POT_DRY_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: t, to: t + 6 * H }, state: st,
      environment: { sampleId: `e${t}`, source: 'record', effectiveAt: t, airTempC: 28, humidity: 0.75, windMs: 2 }, lots: [green],
      equipment: [{ equipmentId: 'eq:rack', kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: 'civ-sci-test-2', condition: 1, params: { sunExposure: 0 } }], energy: [], seed: 1,
      actions: t + 6 * H >= 8 * D ? [{ at: t + 6 * H - 30_000, residentId: 'res:lantern', action: 'take_off' }] : [] });
    st = r.state; if (r.status !== 'running') break;
  }
  const dry = asLot(r.produced[0], `lot:dry:${id}`);
  for (let seed = 1; seed < 50; seed++) {
    let fs: ScienceStepRequest['state'] = null, f!: ScienceStepResult;
    for (let t = 0; t < 2 * D; t += 3 * H) {
      f = scienceStep({ contract: '0.2.0', requestId: `f${t}`, world: W, runId: `run:fire:${id}`, ...PIT_FIRE_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: t, to: t + 3 * H }, state: fs,
        environment: { sampleId: `e${t}`, source: 'record', effectiveAt: t, airTempC: 28, humidity: 0.75, windMs: 1, rainMmH: 0 },
        lots: [dry, { lotId: 'lot:wood', materialId: 'firewood', amount: { value: 40_000_000, unit: 'mg' }, location: 's', quality: { water_ppm: 150_000 } }],
        equipment: [{ equipmentId: 'eq:pit', kind: 'open_fire_pit', catalogEntry: 'open_fire_pit', catalogVersion: 'civ-sci-test-2', condition: 1, params: {} }], energy: [], seed,
        actions: t === 0 ? [{ at: 0, residentId: 'res:lantern', action: 'fire_plan', params: { preheatMin: 60, pace: 0, targetGlow: 1, holdMin: 30, forcedCooling: 0 } }] : [] });
      fs = f.state; if (f.status !== 'running') break;
    }
    const p = f.produced[0];
    if (p.materialId === 'fired_pot' && (p.quality?.crack ?? 0) === 0) return asLot(p, id);
  }
  throw new Error('no whole pot in 50 firings');
}
const cook = firedPot(1, 4000, 'lot:cook'), jar = firedPot(2, 2000, 'lot:jar'), lamp = firedPot(3, 80, 'lot:lamp');

console.log('1. a cook pot, a tar retort and a lamp dish from the residents\' fired pots');
{
  const c = cookPotParams(cook);
  ok(FIRED_POT_ASSEMBLY_TABLE === 'civ-sci.fired-pot-assembly/2' && c.capacityMl === 4000 && c.heatCapJPerK > 1000 && c.heatCapJPerK < 1600 && c.uaWPerK > 1.5 && c.uaWPerK < 3.5 && c.heatShare === 0.2,
    'a 4 L cook pot: heat capacity from its mass, heat loss from its surface (near the test pot\'s 1800 J/K, 3 W/K)', JSON.stringify(c));
  ok(cookPotParams(cook, { heatShare: 0.3 }).heatShare === 0.3, 'main may set how much of the fire goes into the pot (its hearth)');
  const r = retortParams(cook, jar);
  ok(r.capacityMl === 4000 && r.heatCapJPerK > c.heatCapJPerK && r.uaWPerK > c.uaWPerK && r.heatShare === 0.35 && r.collectShare === 0.6,
    'a retort from the cook pot (upper, the charge) and a 2 L jar (lower, the tar): both pots\' heat capacity and surface', JSON.stringify(r));
  const l = lampDishParams(lamp);
  ok(l.capacityMl === 80 && l.absorptionPpm > 100_000, 'a lamp dish: how much oil it holds, and that its unglazed body soaks some up', JSON.stringify(l));
}

console.log('2. what is not assembled');
{
  const refuse = (name: string, f: () => unknown, why: RegExp) => { let msg = ''; try { f(); } catch (e) { msg = (e as Error).message; } ok(why.test(msg), name, msg); };
  refuse('a cracked pot (it leaks)', () => cookPotParams({ ...cook, quality: { ...cook.quality, crack: 1, crack_ppm: 100_000 } }), /crack/);
  refuse('a lamp dish as a cook pot', () => cookPotParams(lamp), /form/);
  refuse('a cook pot as a lamp dish', () => lampDishParams(cook), /form/);
  refuse('the same pot twice in a retort', () => retortParams(cook, cook), /two different/);
  refuse('a lower pot too small for what a full charge drips (Codex AS-A1: 8 L over 100 mL)',
    () => retortParams({ ...cook, quality: { ...cook.quality, capacity_ml: 8000 } }, { ...jar, quality: { ...jar.quality, capacity_ml: 100 } }), /drip up to 615 mL/);
  refuse('a small upper pot', () => retortParams({ ...jar, quality: { ...jar.quality, capacity_ml: 500 } }, cook), /at least/);
  refuse('a test pot (fired_pot_test) — it has its own table', () => cookPotParams({ ...cook, materialId: 'fired_pot_test' }), /fired_pot/);
  refuse('a heat share out of range', () => cookPotParams(cook, { heatShare: 2 }), /heatShare/);
}

console.log('3. back to a lot');
{
  const whole = firedPotQualityOnReturn(cook.quality!, 1), worn = firedPotQualityOnReturn(cook.quality!, 0.9), again = firedPotQualityOnReturn({ ...worn }, 0.95);
  ok(JSON.stringify(whole) === JSON.stringify(cook.quality) && worn.crack === 1 && worn.crack_ppm === 100_000 && again.crack_ppm === 150_000,
    'whole: the lot as it was; worn: the wear added to the crack index (and a cracked pot is not assembled again)');
  const sherds = firedPotSherdsQuality(cook.quality!);
  ok(sherds.absorption_ppm === cook.quality!.absorption_ppm && sherds.capacity_ml === undefined, 'broken: pot_sherds (the sealed vessel\'s form, same amount)', JSON.stringify(sherds));
  let threw = false; try { firedPotQualityOnReturn(cook.quality!, NaN); } catch { threw = true; }
  ok(threw, 'a condition that is not a number is refused');
}

{
  const whole = retortPartsOnReturn(cook.quality!, jar.quality!, 1), worn = retortPartsOnReturn(cook.quality!, jar.quality!, 0.8), broken = retortPartsOnReturn(cook.quality!, jar.quality!, 0);
  ok(JSON.stringify(whole.upper.quality) === JSON.stringify(cook.quality) && JSON.stringify(whole.lower.quality) === JSON.stringify(jar.quality)
    && worn.upper.quality.crack === 1 && worn.upper.quality.crack_ppm === 200_000 && JSON.stringify(worn.lower.quality) === JSON.stringify(jar.quality)
    && broken.upper.materialId === 'pot_sherds' && broken.lower.materialId === 'fired_pot' && JSON.stringify(broken.lower.quality) === JSON.stringify(jar.quality),
    'a retort goes back as two lots: the wear is the upper pot\'s (in the fire); broken, the upper one is sherds and the lower one whole');
}

console.log('4. tools main makes from materials');
ok(TOOL_RECIPES.length === 5 && TOOL_RECIPES.every((t) => t.materials.every((m) => m.mg > 0) && t.handSeconds > 0), 'five tools, each with its materials and the hands\' work',
  TOOL_RECIPES.map((t) => `${t.kind}: ${t.materials.map((m) => `${m.materialId} ${m.mg / 1e6} kg`).join(', ')}`).join(' / '));

console.log('5. the residents\' jar as a sealed vessel (p16x 0.1.2, p17x 0.1.3, table civ-sci.pot-assembly/3)');
{
  const sum = (xs: { amount: { value: number } }[] = []) => xs.reduce((t, x) => t + x.amount.value, 0);
  type Drawn = { drawn?: { amount: { value: number } }[] };
  const closes = (r: ScienceStepResult) => sum(r.consumed) + sum((r as Drawn).drawn) === sum(r.produced) + sum(r.released);
  const BRUSH = { equipmentId: 'eq:brush', kind: 'fixture_tar_brush', catalogEntry: 'fixture_tar_brush', catalogVersion: 'civ-sci-test-2', condition: 1 };
  const STAND = { equipmentId: 'eq:stand', kind: 'fixture_vessel_stand', catalogEntry: 'fixture_vessel_stand', catalogVersion: 'civ-sci-test-2', condition: 1, params: { sunExposure: 0 } };
  const TAR: LotView = { lotId: 'lot:tar', materialId: 'wood_tar', amount: { value: 40_000, unit: 'mg' }, location: 'eq:retort', quality: { x_wood_tar_ppm: 1_000_000 } };
  const sealed = scienceStep({ contract: '0.2.0', requestId: 's', world: W, runId: 'run:seal', ...TAR_SEAL_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: 0, to: H }, state: null,
    environment: { sampleId: 'env:0', source: 'simulation', effectiveAt: 0 }, lots: [jar, TAR], equipment: [BRUSH], energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: 3600 * 20 }], seed: 1,
    actions: [{ at: 60_000, residentId: 'res:lantern', action: 'seal' }] });
  const pot = sealed.produced.find((p) => p.materialId === 'fired_pot')!;
  const kept = ['form', 'wall_mm', 'surface_cm2', 'xd_quartz_ppm', 'sinter_ppm', 'crack'].every((k) => pot?.quality?.[k] === jar.quality![k]);
  ok(sealed.status === 'completed' && pot && pot.quality!.sealed === 1 && (pot.quality!.air_leak_tau_min ?? 0) > 0 && kept && closes(sealed),
    'the residents\' 2 L jar takes tar and a plug: it comes back as a fired_pot, its form, wall, surface and fired make-up as they were', `air_leak_tau_min ${pot?.quality?.air_leak_tau_min}`);
  const potLot = asLot(pot, 'lot:sealed-jar');
  let st: ScienceStepRequest['state'] = null, r!: ScienceStepResult;
  for (let t = 0; t < 2 * D; t += 6 * H) {
    r = scienceStep({ contract: '0.2.0', requestId: `l${t}`, world: W, runId: 'run:leak', ...LEAK_TEST_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: t, to: t + 6 * H }, state: st,
      environment: { sampleId: `e${t}`, source: 'record', effectiveAt: t, airTempC: 28, humidity: 0.75, windMs: 2 }, lots: [potLot], equipment: [STAND], energy: [], seed: 1,
      actions: t + 6 * H >= 2 * D ? [{ at: t + 6 * H - 30_000, residentId: 'res:lantern', action: 'take_out' }] : [] });
    st = r.state; if (r.status !== 'running') break;
  }
  const back = r.produced.find((p) => p.materialId === 'fired_pot');
  ok(r.status === 'completed' && back?.quality?.form === 2 && back.quality.sealed === 1 && closes(r), 'it stands two days on the stand as a fired_pot (the leak test reads the residents\' pot)');
  const p = potToEquipmentParams(potLot);
  ok(POT_ASSEMBLY_TABLE === 'civ-sci.pot-assembly/3' && p.sealed === 1 && p.airLeakTauMin === pot.quality!.air_leak_tau_min && readPot(potLot).areaM2 === jar.quality!.surface_cm2 / 1e4,
    'it assembles as a barometer bulb (the pot\'s own surface, not the test pot\'s assumed shape)', JSON.stringify(p));
  const worn = potQualityOnReturn(potLot.quality!, 0.9);
  ok(worn.crack === 1 && worn.airtight_known === 0 && worn.sealed === 1 && worn.form === 2, 'worn, it comes back still stopped, its air-holding unknown, and its crack mark shows the wear');
  let stopped = ''; try { cookPotParams(potLot); } catch (e) { stopped = (e as Error).message; }
  ok(/sealed/.test(stopped), 'a stopped jar is not a cook pot (its mouth is plugged)', stopped);
  let threw = ''; try { readPot({ ...potLot, quality: { ...potLot.quality, water_ppm: 1000 } }); } catch (e) { threw = (e as Error).message; }
  ok(/water_ppm 0/.test(threw), 'a fired pot\'s body holds no water of its own (water in the walls is x_water_ppm)', threw);
}

console.log('6. a lamp dish handed back wet from the water test (table /2, Codex VF-A1)');
{
  const STAND = { equipmentId: 'eq:stand', kind: 'fixture_vessel_stand', catalogEntry: 'fixture_vessel_stand', catalogVersion: 'civ-sci-test-2', condition: 1, params: { sunExposure: 0 } };
  const WATER: LotView = { lotId: 'lot:water', materialId: 'process_water', amount: { value: 60_000, unit: 'mg' }, location: 'site:jar' };
  let st: ScienceStepRequest['state'] = null, r!: ScienceStepResult;
  for (let t = 0; t < D; t += 6 * H) {
    r = scienceStep({ contract: '0.2.0', requestId: `w${t}`, world: W, runId: 'run:wet', ...LEAK_TEST_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: t, to: t + 6 * H }, state: st,
      environment: { sampleId: `e${t}`, source: 'record', effectiveAt: t, airTempC: 28, humidity: 0.95, windMs: 1 }, lots: [lamp, WATER], equipment: [STAND], energy: [], seed: 1,
      actions: t + 6 * H >= D ? [{ at: t + 6 * H - 30_000, residentId: 'res:lantern', action: 'take_out' }] : [] });
    st = r.state; if (r.status !== 'running') break;
  }
  const wetDish = asLot(r.produced.find((p) => p.materialId === 'fired_pot')!, 'lot:wet-lamp');
  const bare = lampDishParams(lamp), wet = lampDishParams(wetDish);
  ok((wetDish.quality!.x_water_ppm ?? 0) > 0 && Math.abs(wet.massG - bare.massG) <= 1 && wet.absorptionPpm < bare.absorptionPpm,
    'the dish\'s mass is its fired body (the water in its walls is not body), and the pores the water fills take up no oil', `bare ${JSON.stringify(bare)} / wet ${JSON.stringify(wet)} (lot ${wetDish.amount.value} mg)`);
  const sitOil = (params: Record<string, number>) => scienceStep({ contract: '0.2.0', requestId: 'o', world: W, runId: 'run:lamp', ...OIL_LAMP_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: 0, to: H }, state: null,
    environment: { sampleId: 'e', source: 'record', effectiveAt: 0, airTempC: 27, humidity: 0.8, windMs: 1, rainMmH: 0 },
    lots: [{ lotId: 'lot:oil', materialId: 'coconut_oil', amount: { value: 50_000, unit: 'mg' }, location: 'site:jar', quality: { x_coconut_fat_ppm: 1_000_000 } },
      { lotId: 'lot:wick', materialId: 'lamp_wick', amount: { value: 2_000, unit: 'mg' }, location: 'site:shelf', quality: wickQuality(1, 4) }],
    equipment: [{ equipmentId: 'eq:lamp', kind: 'lamp_dish', catalogEntry: 'lamp_dish', catalogVersion: 'civ-sci-test-2', condition: 1, params: { ...params, shelter: 0.8, roofed: 1 } }], energy: [], seed: 1,
    actions: [{ at: H - 1000, residentId: 'res:lantern', action: 'put_out' }] });
  const soakedBy = (x: ScienceStepResult) => x.produced.find((p) => p.quality?.soaked_in_dish === 1)?.amount.value ?? 0;
  const sBare = soakedBy(sitOil(bare)), sWet = soakedBy(sitOil(wet));
  ok(sWet < sBare, 'handed back wet, assembled, pure oil set in it for an hour: it soaks less than the dry dish, never more', `${sBare} → ${sWet} mg`);
  const pot2 = cookPotParams({ ...jar, quality: { ...jar.quality, x_water_ppm: 50_000 }, amount: { value: Math.round(jar.amount.value / 0.95), unit: 'mg' } });
  ok(Math.abs(pot2.heatCapJPerK - cookPotParams(jar).heatCapJPerK) <= 1, 'a cook pot\'s heat capacity is its fired body\'s (the water in its walls is not counted as ceramic)');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
