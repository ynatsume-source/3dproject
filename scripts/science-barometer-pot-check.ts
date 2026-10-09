// Checks for the self-made barometer: a gauge tube through the plug (p16x 0.1.3, table civ-sci.pot-assembly/4) and the
// barometer on the residents' pot (m03x_air_barometer_pot 0.1.0).
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-barometer-pot-check.ts
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { BAROMETER_PROCESS } from '../src/science/step/barometer';
import { BAROMETER_POT_PROCESS } from '../src/science/step/barometer-pot';
import { airLeakTauMin, LEAK_TEST_PROCESS, potSherdsQuality, potToEquipmentParams, readPot, TAR_SEAL_PROCESS } from '../src/science/step/vessel';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const M = 60_000, H = 3600_000, D = 24 * H, W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const violations: string[] = [];
const step = (q: ScienceStepRequest) => { const r = scienceStep(q); violations.push(...validateResult(q, r).map((v) => `${q.requestId}: ${v}`)); return r; };
const sum = (xs: { amount: { value: number } }[] = []) => xs.reduce((t, x) => t + x.amount.value, 0);

// ---- the pot with a tube through its plug ----
const POT = (cap = 500, mg = 600_000): LotView => ({ lotId: 'lot:pot', materialId: 'fired_pot_test', amount: { value: mg, unit: 'mg' }, location: 'site:shelf', quality: { capacity_ml: cap, absorption_ppm: 120_000 } });
const TUBE: LotView = { lotId: 'lot:tube', materialId: 'gauge_tube_test', amount: { value: 40_000, unit: 'mg' }, location: 'site:shelf', quality: { bore_mm: 8, length_mm: 600 } };
const TAR = (mg: number): LotView => ({ lotId: 'lot:tar', materialId: 'wood_tar', amount: { value: mg, unit: 'mg' }, location: 'eq:retort', quality: { x_wood_tar_ppm: 1_000_000 } });
const WOOD: LotView = { lotId: 'lot:wood', materialId: 'firewood', amount: { value: 2_000_000, unit: 'mg' }, location: 'site:woodpile', quality: { water_ppm: 150_000 } };
const BRUSH = { equipmentId: 'eq:brush', kind: 'fixture_tar_brush', catalogEntry: 'fixture_tar_brush', catalogVersion: 'civ-sci-test-2', condition: 1 };
const PIT = { equipmentId: 'eq:pit', kind: 'open_fire_pit', catalogEntry: 'open_fire_pit', catalogVersion: 'civ-sci-test-2', condition: 1, params: { maxBurnKgPerH: 3 } };
function seal(o: { pot?: LotView; tarMg?: number; warm?: boolean; jointTarG?: number; tube?: LotView | null; seal?: boolean }) {
  const lots = [o.pot ?? POT(), TAR(o.tarMg ?? 30_000), ...(o.tube === null ? [] : [o.tube ?? TUBE]), ...(o.warm ? [WOOD] : [])];
  return step({ contract: '0.2.0', requestId: 's', world: W, runId: 'run:seal', ...TAR_SEAL_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: 0, to: H }, state: null,
    environment: { sampleId: 'env:0', source: 'simulation', effectiveAt: 0, airTempC: 28 }, lots, equipment: o.warm ? [BRUSH, PIT] : [BRUSH],
    energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: 3600 * 20 }], seed: 1,
    actions: o.seal === false ? [] : [{ at: M, residentId: 'res:lantern', action: 'seal', params: { jointTarG: o.jointTarG ?? 0 } }] });
}
const potOf = (r: ScienceStepResult): LotView => { const p = r.produced.find((x) => x.materialId === 'fired_pot_test' || x.materialId === 'fired_pot')!; return { lotId: 'lot:bulb', materialId: p.materialId, amount: p.amount, location: 'site:shelf', quality: p.quality }; };

console.log('1. a tube through the plug: the joint leaks apart from the walls (p16x 0.1.3, table /4)');
const warmWell = seal({ warm: true, jointTarG: 6 }), warmLittle = seal({ warm: true, jointTarG: 1 }), coldBare = seal({ jointTarG: 0 });
const best = seal({ warm: true, tarMg: 90_000, jointTarG: 60 }); // walls well tarred, the joint heaped high
{
  const tau = (r: ScienceStepResult) => potOf(r).quality!.air_leak_tau_min;
  const p = potOf(warmWell);
  ok(warmWell.status === 'completed' && p.quality!.tube_bore_mm === 8 && p.quality!.x_tube_ppm! > 0 && sum(warmWell.consumed) + sum((warmWell as unknown as { drawn: { amount: { value: number } }[] }).drawn) === sum(warmWell.produced) + sum(warmWell.released),
    'the tube goes into the pot through the plug: its mass joins the pot lot (x_tube_ppm), the mass closes', JSON.stringify({ tube: p.quality!.x_tube_ppm, joint: p.quality!.joint_cover_ppm }));
  ok(tau(coldBare) < tau(warmLittle) && tau(warmLittle) < tau(warmWell), 'the more (and warmer) tar heaped on the joint, the longer the pot holds its air',
    `bare joint ${tau(coldBare)} min / 1 g warm ${tau(warmLittle)} / 6 g warm ${tau(warmWell)}`);
  const noTube = potOf(seal({ warm: true, tube: null, tarMg: 90_000 })), heavy = potOf(seal({ warm: true, tarMg: 90_000, jointTarG: 60 }));
  ok(noTube.quality!.air_leak_tau_min > heavy.quality!.air_leak_tau_min && heavy.quality!.air_leak_tau_min < 100_000, 'walls sealed perfectly, the joint still leaks a little: a tubed pot is never perfect (jointLeakFloor)',
    `no tube ${noTube.quality!.air_leak_tau_min} min / tube with 60 g on the joint ${heavy.quality!.air_leak_tau_min} min`);
  const notThrough = seal({ seal: false });
  ok(notThrough.status === 'failed' && /seal/.test(String(notThrough.evidence.notes)), 'a tube without a seal is refused (it goes through the plug)', String(notThrough.evidence.notes));
  const small = { absorption: 0.12, coverage: 0.9, sealed: true, capacityMl: 500 }, big = { ...small, capacityMl: 2000 };
  ok(airLeakTauMin(small) === airLeakTauMin({ absorption: 0.12, coverage: 0.9, sealed: true }) && airLeakTauMin(big) > airLeakTauMin(small),
    'the same walls hold the air longer in a bigger pot (more air behind the same leak per area); the 500 mL reference pot is as before', `${airLeakTauMin(small)} → ${airLeakTauMin(big)} min`);
  const bp = readPot(p), sherds = potSherdsQuality(p.quality!);
  ok(bp.tube?.mg === Math.floor((p.amount.value * p.quality!.x_tube_ppm!) / 1e6) && sherds.x_tube_ppm === p.quality!.x_tube_ppm, 'the tubed pot reads back (body, tar, tube apart); broken, the tube stays in the pieces');
  const leak = step({ contract: '0.2.0', requestId: 'l', world: W, runId: 'run:leak', ...LEAK_TEST_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: 0, to: 6 * H }, state: null,
    environment: { sampleId: 'e', source: 'record', effectiveAt: 0, airTempC: 28, humidity: 0.75, windMs: 2 }, lots: [p],
    equipment: [{ equipmentId: 'eq:stand', kind: 'fixture_vessel_stand', catalogEntry: 'fixture_vessel_stand', catalogVersion: 'civ-sci-test-2', condition: 1, params: { sunExposure: 0 } }], energy: [], seed: 1,
    actions: [{ at: 6 * H - 30_000, residentId: 'res:lantern', action: 'take_out' }] });
  ok(leak.status === 'completed' && potOf(leak).quality!.tube_bore_mm === 8 && sum(leak.consumed) === sum(leak.produced) + sum(leak.released), 'the leak test reads a tubed pot and hands it back with its tube');
}

// ---- the barometer on the pot ----
const bulb = (r: ScienceStepResult, o: Record<string, number> = {}) => ({ equipmentId: 'eq:bulb', kind: 'assembled_pot', catalogEntry: 'assembled_pot', catalogVersion: 'civ-sci-test-2', condition: 1,
  params: { ...potToEquipmentParams(potOf(r)), markMm: 5, ...o } });
const WATER = (mg = 20_000): LotView => ({ lotId: 'lot:tubewater', materialId: 'process_water', amount: { value: mg, unit: 'mg' }, location: 'site:jar' });
type Env = { p?: number; t?: number; source?: string };
const greq = (from: number, to: number, env: Env, state: ScienceStepRequest['state'], acts: [number, string][], o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.2.0', requestId: `g@${from}`, world: W, runId: 'run:gauge', ...BAROMETER_POT_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
  environment: { sampleId: `env:${from}`, source: (env.source ?? 'record') as 'record', effectiveAt: from, ...(env.t !== undefined ? { airTempC: env.t } : {}), ...(env.p !== undefined ? { pressureHPa: env.p } : {}) },
  lots: [WATER()], equipment: [bulb(warmWell)], energy: [], seed: 1, actions: acts.map(([at, action]) => ({ at, residentId: 'res:lantern', action })), ...o });
/** The pressure falls 30 hPa over 24 h, then holds (the design's example), at 28 °C. */
const storm = (t: number): Env => ({ p: 1010 - Math.min(30, (30 * t) / D), t: 28 });
function gauge(until: number, env: (t: number) => Env, readsAt: number[], o: Partial<ScienceStepRequest> = {}, chunk = H) {
  let st: ScienceStepRequest['state'] = null; const all: ScienceStepResult[] = [];
  for (let t = 0; t < until; t += chunk) {
    const e = Math.min(until, t + chunk);
    const acts: [number, string][] = [...readsAt.filter((x) => x >= t && x < e).map((x) => [x, 'read_gauge'] as [number, string]), ...(e === until ? [[until - 1000, 'take_out'] as [number, string]] : [])];
    const r = step(greq(t, e, env(t), st, acts, o)); all.push(r); st = JSON.parse(JSON.stringify(r.state));
    if (r.status !== 'running') break;
  }
  const last = all[all.length - 1];
  return { all, last, marks: new Map(all.flatMap((r) => r.observations).filter((x) => x.value !== undefined).map((x) => [Math.round(x.at / H), x.value as number])) };
}
const every6h = Array.from({ length: 8 }, (_, i) => i * 6 * H + 6 * H - 2000);

console.log('2. the barometer on the residents\' pot (m03x 0.1.0)');
{
  // the test gauge with the same bulb, tube and stick: what a pot that never leaks reads
  const testGauge = (() => {
    const p = bulb(warmWell).params; let st: ScienceStepRequest['state'] = null; const m = new Map<number, number>();
    for (let t = 0; t < 2 * D; t += H) {
      const r = step({ contract: '0.2.0', requestId: `t${t}`, world: W, runId: 'run:test', ...BAROMETER_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: t, to: t + H }, state: st,
        environment: { sampleId: `e${t}`, source: 'record', effectiveAt: t, airTempC: 28, pressureHPa: storm(t).p }, lots: [],
        equipment: [{ equipmentId: 'eq:test', kind: 'fixture_air_barometer', catalogEntry: 'fixture_air_barometer', catalogVersion: 'civ-sci-test-2', condition: 1,
          params: { bulbVolumeMl: p.capacityMl, tubeBoreMm: p.tubeBoreMm, tubeLengthMm: p.tubeLengthMm, markMm: 5, bulbTauS: p.bulbTauS } }], energy: [], seed: 1,
        actions: every6h.filter((x) => x >= t && x < t + H).map((at) => ({ at, residentId: 'res:lantern', action: 'read_gauge' })) });
      st = r.state; for (const o of r.observations) m.set(Math.round(o.at / H), o.value as number);
    }
    return m;
  })();
  const good = gauge(2 * D, storm, every6h, { equipment: [bulb(best)] });
  const leaky = gauge(2 * D, storm, every6h, { equipment: [bulb(coldBare)] });
  const g = (r: ReturnType<typeof gauge>) => every6h.map((x) => r.marks.get(Math.round(x / H)));
  const tg = every6h.map((x) => testGauge.get(Math.round(x / H)));
  const gd = g(good);
  ok(gd.every((v, i) => v !== undefined && Math.abs(v - tg[i]!) <= 3) && gd[7]! >= gd[3]! - 2, 'the best pot (walls well tarred, the joint heaped high) reads near the test gauge and creeps back only slowly (the joint still leaks a little)',
    `pot ${gd.join(',')} / test ${tg.join(',')} (τ ${bulb(best).params.airLeakTauMin} min)`);
  const lk = g(leaky);
  ok(lk[3]! < tg[3]! && lk[7]! < lk[3]! && lk[7]! <= 2, 'a pot with a bare joint rises less while the pressure falls and creeps back once it stops: it shows the change, not the height',
    `leaky ${lk.join(',')} marks (τ ${bulb(coldBare).params.airLeakTauMin} min)`);
  ok(good.last.status === 'completed' && good.last.produced[0]?.amount.value === 20_000 && sum(good.last.consumed) === sum(good.last.produced) + sum(good.last.released), 'taken out, the tube\'s water comes back');
}

console.log('3. pieces, reads, unknown weather, a spill');
{
  const reads = [37 * M + 13_000, 6 * H + 7_000, 6 * H + 7_001, 20 * H + 29_999];
  const key = (r: ReturnType<typeof gauge>) => JSON.stringify([r.last.produced, r.all.flatMap((x) => x.observations), r.last.state.data]);
  // the weather changes at 6 h steps (every split below shares them); reads fall between the cells
  const steps = (t: number): Env => ({ p: 1010 - 8 * Math.floor(t / (6 * H)), t: 28 + (Math.floor(t / (6 * H)) % 2) });
  const a = gauge(D, steps, reads), b = gauge(D, steps, reads, {}, 30_000), c = gauge(D, steps, reads, {}, 432_000 + 0), d = gauge(D, steps, reads, {}, 2 * H), e = gauge(D, steps, reads, {}, 30 * M);
  ok(key(a) === key(b) && key(a) === key(c) && key(a) === key(d) && key(a) === key(e), '1 h = 30 s = 7.2 min = 2 h = 30 min pieces (reads between the cells): the same readings and state, to the last decimal');
  const quiet = gauge(D, steps, []);
  ok(JSON.stringify(quiet.last.state.data) === JSON.stringify(a.last.state.data), 'reading changes nothing');
  const gap = gauge(D, (t) => (t >= 6 * H && t < 9 * H ? { source: 'unknown' } : storm(t)), [5 * H, 7 * H, 12 * H], { equipment: [bulb(coldBare)] });
  const air = (gap.all[8].diagnostics as { airLeft: number[] }).airLeft;
  ok(!gap.marks.has(7) && air[1] > air[0] && gap.last.produced[0]?.quality?.history_complete === 0, 'weather unknown: no reading; the air left is carried as a range (it may have leaked either way)', `air ${air.map((x) => x.toFixed(6)).join('..')}`);
  const spill = gauge(3 * H, (t) => ({ p: t >= H ? 950 : 1010, t: 28 }), [2 * H], { equipment: [bulb(warmWell, { tubeLengthMm: 200 })] });
  const lost = spill.last.released.find((x) => x.materialId === 'process_water' && x.to === 'ground');
  ok(lost && lost.amount.value > 0 && sum(spill.last.consumed) === sum(spill.last.produced) + sum(spill.last.released) && /あふれ/.test(spill.all.flatMap((x) => x.observations).map((x) => x.text).join()),
    'a short tube and a deep fall: the water spills over the mouth, to the ground, and the gauge says so', `${lost?.amount.value} mg spilled`);
}

console.log('4. requests that are refused');
{
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  refused('a pot without a tube', step(greq(0, H, storm(0), null, [], { equipment: [{ ...bulb(warmWell), params: { ...potToEquipmentParams(potOf(seal({ warm: true, tube: null }))), markMm: 5 } }] })), /tubeBoreMm/);
  refused('no stick (markMm)', step(greq(0, H, storm(0), null, [], { equipment: [{ ...bulb(warmWell), params: { ...potToEquipmentParams(potOf(warmWell)) } }] })), /markMm/);
  refused('a pot whose air-holding is not known', step(greq(0, H, storm(0), null, [], { equipment: [bulb(warmWell, { airtightKnown: 0, airLeakTauMin: 0 })] })), /airtightKnown/);
  refused('too little water for the tube', step(greq(0, H, storm(0), null, [], { lots: [WATER(1_000)] })), /at least/);
  refused('set without the pressure', step(greq(0, H, { t: 28 }, null, [])), /known weather/);
  refused('energy offered', step(greq(0, H, storm(0), null, [], { energy: [{ sourceId: 'src:x', kind: 'heat', maxJ: 1 }] })), /no energy/);
  refused('an unknown action', step(greq(0, H, storm(0), null, [[0, 'vent']])), /unknown action/);
  const s0 = step(greq(0, H, storm(0), null, []));
  refused('a missing interval', step(greq(2 * H, 3 * H, storm(0), s0.state, [])), /noncontiguous/);
  refused('the bulb changed under the run', step(greq(H, 2 * H, storm(0), s0.state, [], { equipment: [bulb(coldBare)] })), /changed-input/);
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation', violations.slice(0, 3).join(' / '));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
