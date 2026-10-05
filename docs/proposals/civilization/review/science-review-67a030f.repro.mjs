// Focused, read-only follow-up: A2a, /3 saves and thermal enclosures. Deferred C1/C2 are not rerun.
// node --import tsx <this file> /absolute/science-67a030f > report.json
// Exit 0 means the diagnostic completed, not that findings are cleared. No C1 malformed-save probes here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
assert(root?.startsWith('/'), 'Pass an absolute science checkout path');
const get = p => import(pathToFileURL(`${root}/${p}`));
const { scienceStep } = await get('src/science/step/index.ts');
const { BAROMETER_PROCESS, rise } = await get('src/science/step/barometer.ts');
const { validateResult } = await get('src/science/step/validate.ts');
const H = 3600000, defaults = { bulbVolumeMl: 500, tubeBoreMm: 8, tubeLengthMm: 600, markMm: 5, bulbTauS: 900 };
function req(from, to, state = null, env = {}, reads = [], params = {}, extra = {}) {
  return { ...BAROMETER_PROCESS, contract: '0.2.0', requestId: `b:${from}`, runId: 'run:baro',
    world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, catalogVersion: 'civ-sci-test-2', seed: 1,
    interval: { from, to }, state, environment: { sampleId: `env:${from}`, source: 'record', effectiveAt: from,
      pressureHPa: 1010, airTempC: 28, ...env }, lots: [], energy: [],
    equipment: [{ equipmentId: 'eq:baro', kind: 'fixture_air_barometer', catalogEntry: 'fixture_air_barometer',
      catalogVersion: 'civ-sci-test-2', condition: 1, params: { ...defaults, ...params } }],
    actions: reads.map(at => ({ at, residentId: 'res:lantern', action: 'read_gauge' })), ...extra };
}
let calls = 0;
function run(q, allowFailure = false) {
  const before = JSON.stringify(q), r = scienceStep(q); calls++;
  assert.equal(JSON.stringify(q), before, 'input/state mutation');
  assert.deepEqual(validateResult(q, r), []);
  if (!allowFailure) assert.notEqual(r.status, 'failed', r.evidence.notes);
  // All continuations use exactly the JSON that can be persisted, not an in-memory-only representation.
  assert.deepEqual(JSON.parse(JSON.stringify(r.state)), r.state);
  return JSON.parse(JSON.stringify(r));
}
const compact = r => ({ observations: r.observations, state: r.state, diagnostics: r.diagnostics, status: r.status });
const fixed = { loss: [], pressureOnly: null, persistentSpill: [], schemas: [] };
for (const contract of ['0.1.0', '0.2.0']) {
  const init = run(req(0, 30000, null, {}, [], {}, { contract }));
  const e = { pressureHPa: 980, airTempC: 38 };
  const whole = run(req(30000, 90000, init.state, e, [45000, 75000], {}, { contract, stop: 'equipment-lost' }));
  const a = run(req(30000, 60000, init.state, e, [45000], {}, { contract }));
  const b = run(req(60000, 90000, a.state, e, [75000], {}, { contract, stop: 'equipment-lost' }));
  const absent = run(req(30000, 90000, init.state, e, [45000, 75000], {}, { contract, stop: 'equipment-lost', equipment: [] }));
  assert.deepEqual(whole.state, b.state); assert.deepEqual(whole, absent);
  assert.deepEqual(whole.observations, [...a.observations, ...b.observations]);
  assert.deepEqual(whole.observations.map(o => o.value), [21, 21]);
  fixed.loss.push({ contract, readings: whole.observations, sameState: true, absentEquipmentSameResult: true });
  assert.equal(init.state.schema, 'civ-sci.air-barometer/3');
  const oldState = { schema: 'civ-sci.air-barometer/1', data: { eqId: 'eq:baro', paramsFp: init.state.data.paramsFp,
    startMs: 0, lastTo: 30000, sealed: init.state.data.sealed, bulbK: 301.15, historyComplete: true } };
  const old = run(req(30000, 60000, oldState, {}, [30000], {}, { contract }), true);
  assert.equal(old.status, 'failed'); assert.match(old.evidence.notes, /unsupported-state-schema/);
  assert.equal(old.observations.length, 0); assert.deepEqual(old.simulated, { from: 30000, to: 30000 });
  fixed.schemas.push({ contract, fresh: init.state.schema, oldStatus: old.status, reason: old.diagnostics.error });
}
{
  const init = run(req(0, 30000));
  const gap = run(req(30000, 30000 + H, init.state, { airTempC: 33, pressureHPa: undefined }));
  const control = run(req(30000, 30000 + H, init.state, { airTempC: 33 }));
  const restored = run(req(30000 + H, 60000 + H, gap.state, {}, [30000 + H]));
  const normal = run(req(30000 + H, 60000 + H, control.state, {}, [30000 + H]));
  assert.deepEqual(restored.observations, normal.observations); assert.equal(restored.observations[0].value, 11);
  assert.equal(gap.state.data.bulbLoK, control.state.data.bulbLoK);
  assert.equal(gap.state.data.historyComplete, false);
  fixed.pressureOnly = { bulbC: gap.diagnostics.bulbC, readings: restored.observations };
}
for (const [tubeLengthMm, pressureHPa, expected] of [[600, 900, 'spilled-top'], [200, 940, 'spilled-top'],
  [200, 980, 'spilled-top'], [200, 1050, 'spilled-bottom']]) for (const observe of [true, false]) {
  const p = { tubeLengthMm }, a = run(req(0, 30000, null, {}, [], p));
  const b = run(req(30000, 60000, a.state, { pressureHPa }, observe ? [30000] : [], p));
  const c = run(req(60000, 90000, b.state, {}, [60000], p));
  assert.equal(c.state.data.condition, expected); assert.equal(c.observations[0].value, undefined);
  assert.equal(typeof c.observations[0].text, 'string');
  const reset = run(req(90000, 120000, null, {}, [90000], p, { runId: 'run:reset' }));
  assert.equal(reset.observations[0].value, 0);
  fixed.persistentSpill.push({ tubeLengthMm, pressureHPa, observe, condition: c.state.data.condition,
    observations: c.observations, newRunReading: reset.observations[0].value });
}

// Same weather boundaries, same actions, nonzero origin; saved /3 state across a temperature gap and pressure gap.
function partition(chunk, tubeLengthMm, tau, gapKind) {
  const origin = 1000, p = { tubeLengthMm, bulbTauS: tau };
  let state = run(req(origin, origin + 30000, null, {}, [], p)).state;
  const observations = [], start = origin + 30000;
  const phases = [{ end: start + H, env: gapKind === 'temperature' ? { airTempC: undefined } : { airTempC: 33, pressureHPa: undefined } },
    { end: start + 4 * H, env: {} }, { end: start + 5 * H, env: { pressureHPa: 980 } }];
  for (const phase of phases) while (state.data.lastTo < phase.end) {
    const from = state.data.lastTo, to = Math.min(phase.end, origin + (Math.floor((from - origin) / chunk) + 1) * chunk);
    const reads = [];
    for (let at = origin + 7000 + Math.ceil((from - origin - 7000) / 60000) * 60000; at < to; at += 60000) reads.push(at);
    const r = run(req(from, to, state, phase.env, reads, p));
    observations.push(...r.observations); state = r.state;
  }
  return { state, observations };
}
const chunking = [];
for (const tube of [200, 600]) for (const tau of [900, 21600]) for (const gap of ['temperature', 'pressure']) {
  const baseline = partition(30000, tube, tau, gap);
  for (const chunk of [H, 3 * H, 7300, 17000, 37001]) {
    const r = partition(chunk, tube, tau, gap), a = baseline.state.data, b = r.state.data;
    const thermalDifferenceK = Math.max(...['bulbLoK', 'bulbHiK', 'gapLoMinK', 'gapHiMaxK'].map(k => Math.abs(a[k] - b[k])));
    assert.deepEqual(r.observations, baseline.observations);
    assert.equal(b.condition, a.condition); assert(thermalDifferenceK < 1e-9);
    if (chunk % 30000 === 0) assert.deepEqual(r.state, baseline.state);
    chunking.push({ tube, tau, gap, chunk, exactState: JSON.stringify(r.state) === JSON.stringify(baseline.state),
      equalObservations: true, thermalDifferenceK, condition: b.condition });
  }
}

const recovery = [];
for (const tau of [900, 21600]) {
  const p = { bulbTauS: tau }, a = run(req(0, 30000, null, {}, [], p));
  const b = run(req(30000, 30000 + H, a.state, { airTempC: undefined }, [], p));
  const expectedWidthK = 130 * (1 - Math.exp(-3600 / tau));
  assert(Math.abs(b.state.data.bulbHiK - b.state.data.bulbLoK - expectedWidthK) < 1e-10);
  let state = b.state, firstNumeric = null;
  for (let f = 30000 + H; f < 30000 + H + 48 * H; f += 60000) {
    const r = run(req(f, f + 60000, state, {}, [f], p)); state = r.state;
    if (r.observations.some(o => o.value !== undefined)) { firstNumeric = (f - (30000 + H)) / 60000; break; }
  }
  recovery.push({ tauS: tau, gapHours: 1, gapWidthK: expectedWidthK, minutesAfterGapAtFirstNumeric: firstNumeric,
    knownTemperatureAfterGapC: 28, knownPressureHPa: 1010, samplingSeconds: 60 });
}

// Actual paired weather, held forward hourly for this model comparison. Only the 18:00 temperature is hidden.
// It is a sensor-data omission in this diagnostic, not an assertion of an outage in JMA's original observations.
const loadCsv = name => readFileSync(new URL(`../../../../data/science/evidence/${name}`, import.meta.url), 'utf8')
  .trim().split('\n').slice(1).map(line => {
    const [hourJst, pressureHPa, seaLevelHPa, airTempC, humidity] = line.split(',').map(Number);
    return { hourJst, pressureHPa, seaLevelHPa, airTempC, humidity: humidity / 100 };
  });
const weather = loadCsv('jma-ishigaki-20160124-hourly.csv'), midnight = Date.parse('2016-01-24T00:00:00+09:00');
function coldReplay(hideTemperature, tubeLengthMm = 600) {
  let state = null; const observations = [], intervals = [];
  for (const w of weather) {
    const from = midnight + w.hourJst * H, to = from + H;
    const reads = Array.from({ length: 120 }, (_, j) => from + j * 30000);
    const r = run(req(from, to, state, { pressureHPa: w.pressureHPa, airTempC: hideTemperature && w.hourJst === 18 ? undefined : w.airTempC }, reads, { tubeLengthMm }));
    state = r.state; observations.push(...r.observations); intervals.push({ hour: w.hourJst, boundsC: r.diagnostics.bulbC });
  }
  return { observations, intervals };
}
const coldBounds = [];
for (const tube of [600, 3000]) {
  const observed = coldReplay(false, tube), hidden = coldReplay(true, tube);
  const controls = new Map(observed.observations.map(o => [o.at, o]));
  const differences = hidden.observations.filter(o => o.value !== undefined && o.value !== controls.get(o.at)?.value);
  assert.deepEqual(differences, []);
  for (let i = 0; i < hidden.intervals.length; i++) {
    const [lo, hi] = hidden.intervals[i].boundsC, actual = observed.intervals[i].boundsC[0];
    assert(actual >= lo - 1e-9 && actual <= hi + 1e-9, `hour ${hidden.intervals[i].hour} not enclosed`);
  }
  const numericAfterGap = hidden.observations.filter(o => o.at >= midnight + 19 * H && o.value !== undefined).length;
  if (tube === 3000) assert(numericAfterGap > 0, 'the broad-tube comparison must not be vacuous');
  coldBounds.push({ tubeLengthMm: tube, hiddenHour: 18, actualMissingTemperatureC: 8.6,
    differences, all24HourlyTemperaturesEnclosed: true, numericAfterGap,
    afterGap: { hidden: hidden.intervals.find(x => x.hour === 18), control: observed.intervals.find(x => x.hour === 18) } });
}
const oldStates = [];
for (const schema of ['civ-sci.air-barometer/1', 'civ-sci.air-barometer/2']) {
  const fresh = run(req(0, 30000)), old = structuredClone(fresh.state); old.schema = schema;
  const r = run(req(30000, 60000, old), true);
  assert.equal(r.status, 'failed'); assert.match(r.evidence.notes, /unsupported-state-schema/);
  assert.equal(r.observations.length, 0);
  oldStates.push({ schema, status: r.status, reason: r.evidence.notes });
}
const domainEnclosures = [];
for (const tau of [900, 21600]) for (const actualC of [-60, -30, 0, 38, 70]) {
  const p = { tubeLengthMm: 3000, bulbTauS: tau }, fresh = run(req(1000, 31000, null, {}, [], p));
  let control = fresh.state, hidden = fresh.state;
  for (let n = 0; n < 8; n++) {
    const from = 31000 + n * 900000, to = from + 900000;
    control = run(req(from, to, control, { airTempC: actualC }, [], p)).state;
    hidden = run(req(from, to, hidden, { airTempC: undefined }, [], p)).state;
    assert(control.data.bulbLoK >= hidden.data.bulbLoK - 1e-9 && control.data.bulbHiK <= hidden.data.bulbHiK + 1e-9);
  }
  const expected = 130 * (1 - Math.exp(-7200 / tau));
  assert(Math.abs(hidden.data.bulbHiK - hidden.data.bulbLoK - expected) < 1e-9);
  domainEnclosures.push({ tau, actualC, enclosed: true, widthK: expected });
}
const yonaguni = loadCsv('jma-yonaguni-20150928-hourly.csv');
const slopes = yonaguni.slice(1).map((w, i) => ({ fromHour: yonaguni[i].hourJst, toHour: w.hourJst,
  hPaPerHour: w.pressureHPa - yonaguni[i].pressureHPa }));
const observedHourlySlopes = { largestFall: slopes.reduce((a, b) => a.hPaPerHour < b.hPaPerHour ? a : b),
  largestRise: slopes.reduce((a, b) => a.hPaPerHour > b.hPaPerHour ? a : b) };
console.log(JSON.stringify({ root, process: BAROMETER_PROCESS, calls, fixed, chunking, recovery,
  observedHourlySlopes, coldBounds, oldStates, domainEnclosures }, null, 2));
