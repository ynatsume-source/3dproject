// Full review of the barometer from 1741075, on 5971025, plus the requested light clock/weather follow-up.
// Read-only diagnostic (not a fixes patch).
// Usage: node --import tsx <this file> /absolute/science-checkout [/absolute/1741075-baseline] > report.json
// Exit 0 means the diagnostic ran; inspect findings as well as successful numeric checks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
assert(root?.startsWith('/'), 'Pass an absolute science checkout path');
const get = p => import(pathToFileURL(`${root}/${p}`));
const { scienceStep } = await get('src/science/step/index.ts');
const { BAROMETER_PROCESS, rise } = await get('src/science/step/barometer.ts');
const { validateResult } = await get('src/science/step/validate.ts');
const H = 3600000, baseParams = { bulbVolumeMl: 500, tubeBoreMm: 8, tubeLengthMm: 600, markMm: 5, bulbTauS: 900 };
const gauge = (params = {}, other = {}) => ({ equipmentId: 'eq:baro', kind: 'fixture_air_barometer',
  catalogEntry: 'fixture_air_barometer', catalogVersion: 'civ-sci-test-2', condition: 1, params: { ...baseParams, ...params }, ...other });
function req(from, to, state = null, env = {}, reads = [], extra = {}) {
  return { ...BAROMETER_PROCESS, contract: '0.2.0', requestId: `b:${from}`, runId: 'run:baro',
    world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, catalogVersion: 'civ-sci-test-2', seed: 1,
    interval: { from, to }, state, environment: { sampleId: `env:${from}`, source: 'simulation', effectiveAt: from,
      pressureHPa: 1010, airTempC: 28, ...env }, lots: [], energy: [], equipment: [gauge()],
    actions: reads.map(at => ({ at, residentId: 'res:lantern', action: 'read_gauge' })), ...extra };
}
function call(q) {
  const before = JSON.stringify(q);
  try {
    const result = scienceStep(q);
    assert.equal(JSON.stringify(q), before, 'mutated request');
    return { result, violations: validateResult(q, result) };
  } catch (e) { return { threw: `${e.name}: ${e.message}` }; }
}
function checked(q) {
  const r = call(q); assert.equal(r.threw, undefined); assert.deepEqual(r.violations, []);
  assert.notEqual(r.result.status, 'failed'); return r.result;
}
const small = r => ({ status: r.status, simulated: r.simulated, observations: r.observations,
  diagnostics: r.diagnostics, state: r.state });
const findings = {};

// A1: stop is at interval.to; with the same loss time, partitioning changes earlier observations and heat history.
findings.equipmentLostPartitions = ['0.1.0', '0.2.0'].map(contract => {
  const init = checked(req(0, 30000, null, {}, [], { contract }));
  const warm = { airTempC: 38, pressureHPa: 980 };
  const whole = checked(req(30000, 90000, init.state, warm, [45000, 75000], { contract, stop: 'equipment-lost' }));
  const a = checked(req(30000, 60000, init.state, warm, [45000], { contract }));
  const b = checked(req(60000, 90000, a.state, warm, [75000], { contract, stop: 'equipment-lost' }));
  const afterStop = checked(req(90000, 120000, whole.state, warm, [90000], { contract }));
  return { contract, whole: small(whole), split: { observations: [...a.observations, ...b.observations], state: b.state },
    afterStop: small(afterStop) };
});

// A2: pressure is missing, but temperature is supplied. Thermal evolution does not require pressure.
const init = checked(req(0, 30000));
const gap = checked(req(30000, 30000 + H, init.state, { airTempC: 33, pressureHPa: undefined }, [30000]));
const referenceGap = checked(req(30000, 30000 + H, init.state, { airTempC: 33 }, []));
const recovered = checked(req(30000 + H, 60000 + H, gap.state, {}, [30000 + H]));
const referenceRecovered = checked(req(30000 + H, 60000 + H, referenceGap.state, {}, [30000 + H]));
findings.pressureOnlyGap = { gap: small(gap), recovered: small(recovered), knownPressureReference: small(referenceRecovered),
  expectedBulbCAtRecovery: 33 + (28 - 33) * Math.exp(-3600 / 900) };

// A3: reaching a physical tube end invalidates the unchanged trapped-air/retained-water assumptions.
findings.tubeEndRecovery = [];
for (const [tubeLengthMm, pressureHPa] of [[600, 900], [200, 940], [200, 980]]) for (const observeExcursion of [true, false]) {
  const extra = { equipment: [gauge({ tubeLengthMm })] };
  const a = checked(req(0, 30000, null, {}, [], extra));
  const b = checked(req(30000, 60000, a.state, { pressureHPa }, observeExcursion ? [30000] : [], extra));
  const c = checked(req(60000, 90000, b.state, {}, [60000], extra));
  findings.tubeEndRecovery.push({ tubeLengthMm, pressureHPa, observeExcursion, beyondEnd: small(b), recovered: small(c),
    sealedUnchanged: a.state.data.sealed === c.state.data.sealed });
}

// Defensive restoration probes: an actual failure's null data and an incomplete same-schema save.
const firstFailure = call(req(0, 30000, null, {}, [], { equipment: [] })).result;
const missingSealed = structuredClone(init.state); delete missingSealed.data.sealed;
findings.stateBoundary = {
  returnedFailureThenRetry: call(req(0, 30000, firstFailure.state, {}, [0])),
  incompleteSave: call(req(30000, 60000, missingSealed, {}, [30000])),
  anotherRunAndWorld: call(req(30000, 60000, init.state, { pressureHPa: 980 }, [30000],
    { runId: 'run:other', world: { worldId: 'other', worldEpoch: 'reset', worldVersion: 1 } })) };

// Independent physical root: bisection on positive volume and positive absolute pressure, not the quadratic formula.
const geometry = p => ({ V0: p.bulbVolumeMl * 1e-6, A: Math.PI * (p.tubeBoreMm / 2000) ** 2,
  halfLengthM: p.tubeLengthMm / 2000, markM: p.markMm / 1000, tauS: p.bulbTauS });
function bisect(g, s, P, T) {
  const k = 19620, f = x => (P + k * x) * (g.V0 + g.A * x) - s * T;
  let lo = Math.max(-P / k, -g.V0 / g.A), hi = 1;
  while (f(hi) < 0) hi *= 2;
  for (let n = 0; n < 100; n++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
let count = 0, maxErrorM = 0, maxRelativeResidual = 0;
for (const volume of [50, 100, 500, 1000, 2000]) for (const bore of [2, 4, 8, 20])
  for (const p0 of [95000, 101000, 105000]) for (const p of [80000, 95000, 101000, 110000])
    for (const t0 of [283.15, 301.15, 313.15]) for (const t of [278.15, 288.15, 301.15, 313.15, 323.15]) {
      const g = geometry({ ...baseParams, bulbVolumeMl: volume, tubeBoreMm: bore }), s = p0 * g.V0 / t0;
      const x = rise(g, s, p, t), ref = bisect(g, s, p, t);
      assert(Number.isFinite(x) && p + 19620 * x > 0 && g.V0 + g.A * x > 0);
      maxErrorM = Math.max(maxErrorM, Math.abs(x - ref));
      maxRelativeResidual = Math.max(maxRelativeResidual, Math.abs((p + 19620 * x) * (g.V0 + g.A * x) - s * t) / (s * t));
      count++;
    }
assert(maxErrorM < 1e-10 && maxRelativeResidual < 1e-12);
const g = geometry(baseParams), sealed = 101000 * g.V0 / 301.15;
const numerics = { cases: count, maxErrorM, maxRelativeResidual,
  fall30HPaMm: 1000 * rise(g, sealed, 98000, 301.15), warm1KMm: 1000 * rise(g, sealed, 101000, 302.15),
  warming5KNoPressureChangeMarks: Math.round(rise(g, sealed, 101000, 306.15) / g.markM),
  fall10HPaAndCool3KMarks: Math.round(rise(g, sealed, 100000, 298.15) / g.markM),
  dailyTemperatureAmplitudeRatios: [900, 21600].map(tau => ({ tauS: tau, ratio: 1 / Math.sqrt(1 + (2 * Math.PI * tau / 86400) ** 2),
    lagHours: Math.atan(2 * Math.PI * tau / 86400) / (2 * Math.PI) * 24 })) };

// Same piecewise-constant weather and observation times; only caller partition size differs (also an offset origin).
function chunkRun(chunk, tau, origin = 1000) {
  const extra = { equipment: [gauge({ bulbTauS: tau })] };
  let state = checked(req(origin, origin + 30000, null, {}, [], extra)).state;
  const observations = [];
  const segments = [{ end: origin + 3 * H, env: { airTempC: 33, pressureHPa: 1000 } },
    { end: origin + 6 * H, env: { airTempC: 26, pressureHPa: 980 } }];
  let maxAnalyticErrorK = 0;
  for (const seg of segments) {
    const begin = state.data.lastTo, initialK = state.data.bulbK, target = seg.env.airTempC + 273.15;
    while (state.data.lastTo < seg.end) {
      const from = state.data.lastTo;
      const to = Math.min(seg.end, origin + (Math.floor((from - origin) / chunk) + 1) * chunk);
      const reads = [];
      for (let at = origin + Math.ceil((from - origin) / 60000) * 60000; at < to; at += 60000) if (at >= from) reads.push(at);
      const r = checked(req(from, to, state, seg.env, reads, extra));
      observations.push(...r.observations); state = JSON.parse(JSON.stringify(r.state));
      maxAnalyticErrorK = Math.max(maxAnalyticErrorK, Math.abs(state.data.bulbK - (target + (initialK - target) * Math.exp(-(to - begin) / 1000 / tau))));
    }
  }
  return { observations, state, maxAnalyticErrorK };
}
const chunking = [];
for (const tau of [900, 21600]) {
  const ref = chunkRun(30000, tau);
  for (const chunk of [3600000, 3 * H, 7300, 17000, 37001]) {
    const a = chunkRun(chunk, tau);
    chunking.push({ tauS: tau, chunkMs: chunk, equalReadings: JSON.stringify(ref.observations) === JSON.stringify(a.observations),
      exactState: JSON.stringify(ref.state) === JSON.stringify(a.state), bulbDifferenceK: a.state.data.bulbK - ref.state.data.bulbK,
      maxAnalyticErrorK: a.maxAnalyticErrorK, readings: a.observations.length });
  }
}
const validation = [];
for (const contract of ['0.1.0', '0.2.0']) for (const [name, extra, env] of [
  ['no-equipment', { equipment: [] }, {}], ['initial-lost', { equipment: [], stop: 'equipment-lost' }, {}],
  ['bad-version', { processVersion: 'unrecognized' }, {}], ['bad-schema', { state: { schema: 'civ-sci.air-barometer/0', data: {} } }, {}],
  ['missing-pressure', {}, { pressureHPa: undefined }], ['stale', {}, { source: 'stale' }], ['unknown', {}, { source: 'unknown' }],
  ['zero-volume', { equipment: [gauge({ bulbVolumeMl: 0 })] }, {}],
  ['energy-offer', { energy: [{ sourceId: 'src:x', kind: 'electric', maxJ: 1 }] }, {}],
  ['unknown-action', { actions: [{ at: 0, residentId: 'res:lantern', action: 'shake' }] }, {}]]) {
  const r = call(req(0, 30000, null, env, [], { ...extra, contract }));
  assert.equal(r.threw, undefined); assert.equal(r.result.status, 'failed'); assert.deepEqual(r.violations, []);
  validation.push({ contract, name, status: r.result.status, drawnPresent: Object.hasOwn(r.result, 'drawn') });
}
// Observed weather, not observed gauge calibration. Hold each sample forward to the next hour;
// this interpolation choice is only for this diagnostic. Read at the sample time, never using the next sample early.
const csv = readFileSync(new URL('../../../../data/science/evidence/jma-yonaguni-20150928-hourly.csv', import.meta.url), 'utf8');
const weather = csv.trim().split('\n').slice(1).map(line => {
  const [hourJst, pressureHPa, seaLevelHPa, airTempC, humidityPercent] = line.split(',').map(Number);
  return { hourJst, pressureHPa, seaLevelHPa, airTempC, humidityPercent };
});
const measuredWeatherReplay = [];
for (const tau of [900, 21600]) {
  let state = null; const rows = [];
  for (const w of weather) {
    const from = Date.parse('2015-09-28T00:00:00+09:00') + w.hourJst * H;
    const r = checked(req(from, from + H, state, { pressureHPa: w.pressureHPa, airTempC: w.airTempC, humidity: w.humidityPercent / 100 },
      [from], { equipment: [gauge({ bulbTauS: tau })] }));
    state = r.state; rows.push({ hourJst: w.hourJst, marks: r.observations[0]?.value });
  }
  measuredWeatherReplay.push({ assumedTauS: tau, rows });
}
// Scale of a deliberately omitted effect: saturated trapped gas over water, at constant outside pressure.
// OpenStax m42219 gives vapor pressures 3170 Pa at 25 C and 4240 Pa at 30 C.
const vaporComparison = {
  condition: '25 C to 30 C, outside 1010 hPa, gas and water at equilibrium; comparison only, not calibration',
  currentDryGasRiseMm: rise(g, 101000 * g.V0 / 298.15, 101000, 303.15) * 1000,
  saturatedGasRiseMm: rise(g, (101000 - 3170) * g.V0 / 298.15, 101000 - 4240, 303.15) * 1000,
};
// 5971025 additions: identical weather values, differing provenance and wind measurement heights.
const { envUsable, wind10m } = await get('src/science/step/common.ts');
const { FIXTURE_PROCESS_VERSION } = await get('src/science/step/simple.ts');
const { DRYING_PROCESS } = await get('src/science/step/drying.ts');
const dry = req(1000, 1000 + 6 * H, null, { airTempC: 28, humidity: 0.65, windMs: 3 }, [], {
  ...DRYING_PROCESS,
  lots: [{ lotId: 'lot:tile', materialId: 'test_tile_green', amount: { value: 45000, unit: 'mg' }, location: 'site:rack',
    quality: { water_ppm: 193548, width_mm: 50, length_mm: 50, thickness_mm: 10, history_complete: 1 } }],
  equipment: [{ equipmentId: 'eq:rack', kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: 'civ-sci-test-2', condition: 1 }] });
const plainDry = checked(dry), recordDry = checked({ ...dry, environment: { ...dry.environment, source: 'record' } });
assert.deepEqual(recordDry, plainDry);
const baroProvenance = ['simulation', 'live', 'record'].map(source => {
  const a = checked(req(0, 30000, null, { source }));
  return checked(req(30000, H, a.state, { source, airTempC: 33, pressureHPa: 980 }, [30000, H - 1]));
});
assert.deepEqual(baroProvenance[0], baroProvenance[1]); assert.deepEqual(baroProvenance[0], baroProvenance[2]);
const withoutContract = ({ contract, ...rest }) => rest;
const recordSetup = req(0, 30000, null, { source: 'record' });
assert.deepEqual(withoutContract(checked({ ...recordSetup, contract: '0.2.1' })), withoutContract(checked(recordSetup)));
assert.deepEqual(withoutContract(checked({ ...dry, contract: '0.2.1', environment: { ...dry.environment, source: 'record' } })), withoutContract(recordDry));
const wind = [];
for (const height of [1, 2, 10, 40, 300]) {
  const q = { ...dry, environment: { ...dry.environment, source: 'record', windHeightM: height } };
  assert(envUsable(q));
  const expected = 3 * Math.log(10 / 0.03) / Math.log(height / 0.03);
  assert(Math.abs(wind10m(q) - expected) < 1e-12);
  const result = checked(q), normalized = checked({ ...dry, environment: { ...dry.environment, windMs: expected, windHeightM: 10 } });
  assert.deepEqual(result, normalized);
  wind.push({ measuredHeightM: height, measuredWindMs: 3, wind10mMs: wind10m(q), equalToNormalizedRun: true });
}
const badHeights = [0.2, 0, -1, 301, NaN, Infinity].map(height => {
  const q = { ...dry, environment: { ...dry.environment, windHeightM: height } };
  assert.equal(envUsable(q), false); const r = checked(q); assert(r.diagnostics.skipped);
  return { height: String(height), skipped: true };
});
const fixtures = [];
for (const processId of ['fixture_mass_measure', 'p11_pottery_shape', 'p11x_test_tile_shape'])
  for (const source of ['simulation', 'record', 'live', 'stale', 'unknown']) {
    const weigh = processId === 'fixture_mass_measure';
    const q = req(0, 60000, null, { source }, [], { processId, processVersion: FIXTURE_PROCESS_VERSION,
      lots: [{ lotId: 'lot:clay', materialId: 'prepared_clay', amount: { value: 45000, unit: 'mg' }, location: 'site:bench',
        quality: { water_ppm: 193548, xd_kaolinite_ppm: 450000, xd_quartz_ppm: 300000, xd_calcite_ppm: 20000 } }],
      equipment: [{ equipmentId: 'eq:fixture', kind: weigh ? 'fixture_balance' : 'fixture_bench', catalogEntry: weigh ? 'fixture_balance' : 'fixture_bench',
        catalogVersion: 'civ-sci-test-2', condition: 1, params: weigh ? {} : { thicknessMm: 10, widthMm: 50, lengthMm: 50 } }],
      energy: [{ sourceId: 'src:fixture', kind: weigh ? 'electric' : 'mechanical', maxJ: weigh ? 60 : 120 }],
      actions: weigh ? [{ at: 0, residentId: 'res:lantern', action: 'read-balance' }] : [] });
    const r = call(q); assert.equal(r.threw, undefined); assert.deepEqual(r.violations, []);
    assert.equal(r.result.status, ['simulation', 'record'].includes(source) ? 'completed' : 'failed');
    const proposed = call({ ...q, contract: '0.2.1' });
    assert.equal(proposed.threw, undefined); assert.deepEqual(proposed.violations, []);
    assert.deepEqual(withoutContract(proposed.result), withoutContract(r.result));
    fixtures.push({ processId, source, status: r.result.status });
  }
const catalog = JSON.parse(readFileSync(`${root}/data/science/catalog-test-2.json`, 'utf8'));
const clocks = catalog.processes.map(p => ({ processId: p.id, clock: p.clock }));
assert(clocks.every(p => p.clock === (['fixture_mass_measure', 'p11_pottery_shape', 'p11x_test_tile_shape'].includes(p.processId) ? 'world' : 'island')));
let matches1741075At10m = null;
if (process.argv[3]) {
  const { scienceStep: oldStep } = await import(pathToFileURL(`${process.argv[3]}/src/science/step/index.ts`));
  const old = oldStep(dry);
  assert.deepEqual(plainDry, old);
  assert.deepEqual(checked({ ...dry, environment: { ...dry.environment, windHeightM: 10 } }), old);
  matches1741075At10m = true;
}
const clockWeatherFollowup = { recordMatchesSimulationAndLive: true, contract021Matches020: true, wind, badHeights, fixtures, clocks, matches1741075At10m };
console.log(JSON.stringify({ root, process: BAROMETER_PROCESS, numerics, chunking, validation, measuredWeatherReplay, vaporComparison, clockWeatherFollowup, findings }, null, 2));
