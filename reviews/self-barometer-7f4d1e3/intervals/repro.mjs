// Independent review of self-made gauge interval/reading/settlement semantics.
// Run from TARGET: node --import tsx --import ./scripts/node-assets.mjs /absolute/repro.mjs TARGET [RESULT.json]
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const target = process.argv[2];
const { scienceStep } = await import(pathToFileURL(`${target}/src/science/step/index.ts`).href);
const { BAROMETER_POT_PROCESS } = await import(pathToFileURL(`${target}/src/science/step/barometer-pot.ts`).href);
const { validateResult } = await import(pathToFileURL(`${target}/src/science/step/validate.ts`).href);
const { rise } = await import(pathToFileURL(`${target}/src/science/step/barometer.ts`).href);
const { TAR_SEAL_PROCESS, potToEquipmentParams } = await import(pathToFileURL(`${target}/src/science/step/vessel.ts`).href);
const H = 3_600_000, M = 60_000;
const counters = { requests: 0, exceptions: [], nonFinite: [], validatorFailures: [], checks: [] };
const finite = x => typeof x === 'number' ? Number.isFinite(x) : Array.isArray(x) ? x.every(finite) : x && typeof x === 'object' ? Object.values(x).every(finite) : true;
const check = (name, condition, detail) => counters.checks.push({ name, passed: !!condition, ...(detail === undefined ? {} : { detail }) });
const step = q => {
  counters.requests++;
  try { const r = scienceStep(q); if (!finite(r)) counters.nonFinite.push(q.requestId); counters.validatorFailures.push(...validateResult(q, r).map(v => `${q.requestId}: ${v}`)); return r; }
  catch (e) { counters.exceptions.push(`${q.requestId}: ${e.stack}`); throw e; }
};
const water = { lotId: 'lot:water', materialId: 'process_water', amount: { unit: 'mg', value: 20_000 }, location: 'site:jar', quality: { history_complete: 1 } };
// Actual sealing output and assembly table make the main fixture, rather than inventing a leak/tau pair.
const seal = step({ contract: '0.2.1', ...TAR_SEAL_PROCESS, catalogVersion: 'civ-sci-test-2', requestId: 'fixture:seal', runId: 'run:fixture-seal',
  world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, interval: { from: 0, to: H }, state: null,
  environment: { sampleId: 'env:fixture', source: 'simulation', effectiveAt: 0, airTempC: 28 },
  lots: [
    { lotId: 'lot:pot', materialId: 'fired_pot_test', amount: { value: 600_000, unit: 'mg' }, location: 'site:shelf', quality: { capacity_ml: 500, absorption_ppm: 120_000 } },
    { lotId: 'lot:tar', materialId: 'wood_tar', amount: { value: 30_000, unit: 'mg' }, location: 'site:shelf', quality: { x_wood_tar_ppm: 1_000_000 } },
    { lotId: 'lot:tube', materialId: 'gauge_tube_test', amount: { value: 40_000, unit: 'mg' }, location: 'site:shelf', quality: { bore_mm: 8, length_mm: 200 } },
    { lotId: 'lot:wood', materialId: 'firewood', amount: { value: 2_000_000, unit: 'mg' }, location: 'site:shelf', quality: { water_ppm: 150_000 } },
  ], equipment: [
    { equipmentId: 'eq:brush', kind: 'fixture_tar_brush', catalogEntry: 'fixture_tar_brush', catalogVersion: 'civ-sci-test-2', condition: 1 },
    { equipmentId: 'eq:fire', kind: 'open_fire_pit', catalogEntry: 'open_fire_pit', catalogVersion: 'civ-sci-test-2', condition: 1, params: { maxBurnKgPerH: 3 } },
  ], energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: 72_000 }], seed: 1,
  actions: [{ at: M, action: 'seal', residentId: 'res:lantern', params: { jointTarG: 6 } }] });
const producedPot = seal.produced.find(p => p.materialId === 'fired_pot_test');
if (!producedPot) throw new Error(`Fixture did not seal: ${JSON.stringify(seal)}`);
const lotPot = { lotId: 'lot:sealed', materialId: producedPot.materialId, amount: producedPot.amount, quality: producedPot.quality, location: producedPot.into };
const assembledParams = { ...potToEquipmentParams(lotPot), markMm: 5 };
const bulb = (params = {}) => ({ equipmentId: 'eq:bulb', kind: 'assembled_pot', catalogEntry: 'assembled_pot', catalogVersion: 'civ-sci-test-2', condition: 1, params: { ...assembledParams, ...params } });
function request(from, to, state, env = {}, actions = [], extra = {}) {
  return { contract: '0.2.1', ...BAROMETER_POT_PROCESS, catalogVersion: 'civ-sci-test-2', requestId: `g:${from}:${to}`, runId: 'run:gauge',
    world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, interval: { from, to }, state,
    environment: { sampleId: 'env:gauge', source: 'record', effectiveAt: from, airTempC: 28, pressureHPa: 1010, ...env }, lots: [water],
    equipment: [bulb()], energy: [], seed: 1, actions: actions.map(a => ({ ...a, residentId: 'res:lantern' })), ...extra };
}
const clone = x => JSON.parse(JSON.stringify(x));
const physical = r => ({ state: r.state, produced: r.produced, released: r.released, consumed: r.consumed, energy: r.energy, equipmentWear: r.equipmentWear });
function chain({ origin = 1007, duration = H, chunk = duration, changes = [], reads = [], takeOut, stop = 'operator', params = {}, loseEquipment = false } = {}) {
  let state = null, last; const observations = [], all = [];
  const envAt = t => { let env = {}; for (const p of changes) if (t >= origin + p.at) env = p.env; return env; };
  for (let from = origin; from < origin + duration;) {
    const futureChanges = changes.filter(c => origin + c.at > from).map(c => origin + c.at);
    const to = Math.min(origin + duration, from + chunk, ...futureChanges);
    const isLast = to === origin + duration;
    const actions = reads.filter(at => origin + at >= from && origin + at < to).map(at => ({ at: origin + at, action: 'read_gauge' }));
    if (takeOut !== undefined && origin + takeOut >= from && origin + takeOut < to) actions.push({ at: origin + takeOut, action: 'take_out' });
    last = step(request(from, to, state, envAt(from), actions, { equipment: loseEquipment && isLast && state ? [] : [bulb(params)], ...(isLast && stop ? { stop } : {}) }));
    state = clone(last.state); all.push(last); observations.push(...last.observations);
    if (last.status !== 'running') break;
    from = to;
  }
  return { last, observations, all };
}
// Search a normal warm-room case for a reading of an actual spill before the next cell records it.
const origin = 1007, prefix = step(request(origin, origin + 30_000, null));
const prefixSave = clone(prefix.state);
let spillReadWithoutSettlement = null;
for (let t = 30_001; t < 40 * M; t += 1000) {
  const readAt = origin + t - 1;
  const r = step(request(origin + 30_000, origin + t, clone(prefixSave), { airTempC: 40 }, [{ at: readAt, action: 'read_gauge' }], { stop: 'operator' }));
  if (r.observations.some(o => /あふれた/.test(o.text ?? '')) && r.state.data.condition === 'ok' && r.released.length === 0) {
    const noRead = step(request(origin + 30_000, origin + t, clone(prefixSave), { airTempC: 40 }, [], { stop: 'operator' }));
    spillReadWithoutSettlement = { relativeStopMs: t, readAt, fixture: assembledParams,
      request: { from: origin + 30_000, to: origin + t, environment: { airTempC: 40, pressureHPa: 1010 }, actions: [{ at: readAt, action: 'read_gauge' }], stop: 'operator' },
      result: r, noReadResult: noRead };
    break;
  }
}
const preciseTailEnd = 1_049_000;
const ordinaryTailActions = [{ at: origin + 1_048_000, action: 'read_gauge' }];
const ordinaryTailStop = step(request(origin + 30_000, origin + preciseTailEnd, clone(prefixSave), { airTempC: 40 }, ordinaryTailActions, { stop: 'operator' }));
const ordinaryTailTake = step(request(origin + 30_000, origin + 1_050_000, clone(prefixSave), { airTempC: 40 },
  [...ordinaryTailActions, { at: origin + preciseTailEnd, action: 'take_out' }]));
const ordinaryTailLost = step(request(origin + 30_000, origin + preciseTailEnd, clone(prefixSave), { airTempC: 40 }, ordinaryTailActions, { stop: 'equipment-lost', equipment: [] }));
const recordedAfterBoundary = step(request(origin + 30_000, origin + 1_051_000, clone(prefixSave), { airTempC: 40 }, [{ at: origin + 1_050_000, action: 'read_gauge' }], { stop: 'operator' }));
const stateAtTail = ordinaryTailStop.state.data;
const endRise = rise(stateAtTail.g, stateAtTail.s.sHi, 101000, stateAtTail.s.bHi);
const ordinaryTerminalSpill = { request: { runStart: origin, prefixKnownUntil: origin + 30_000, initialWeather: { airTempC: 28, pressureHPa: 1010 },
  subsequentWeather: { airTempC: 40, pressureHPa: 1010 }, readRelativeMs: 1_048_000, stopRelativeMs: preciseTailEnd },
  endRiseM: endRise, halfLengthM: stateAtTail.g.halfLengthM,
  projectedSpillAtEndMg: Math.min(stateAtTail.waterMg, Math.round((endRise - stateAtTail.g.halfLengthM) * stateAtTail.g.A * 1e9)),
  stopped: ordinaryTailStop, takenOut: ordinaryTailTake, equipmentLostAtEnd: ordinaryTailLost, runThroughNextCell: recordedAfterBoundary };
// A small pressure increase at the next grid head can erase the already-observed spill completely.
const hotBeforeBoundary = step(request(origin + 30000, origin + 1_050_000, clone(prefixSave), { airTempC: 40 }, ordinaryTailActions));
const recoveredReading = step(request(origin + 1_050_000, origin + 1_080_000, clone(hotBeforeBoundary.state), { airTempC: 28, pressureHPa: 1010.1 },
  [{ at: origin + 1_050_000, action: 'read_gauge' }, { at: origin + 1_079_000, action: 'read_gauge' }], { stop: 'operator' }));
const transientSpillErased = { firstSpillReading: hotBeforeBoundary.observations, beforeBoundaryState: hotBeforeBoundary.state,
  nextWeather: { airTempC: 28, pressureHPa: 1010.1 }, recoveredResult: recoveredReading };
// Also reproduce with a gradual 28 -> 40 C morning, sampled in 0.25 C / 5 minute steps.
const rampChanges = Array.from({ length: 49 }, (_, i) => ({ at: i * 5 * M, env: { airTempC: 28 + i * 0.25, pressureHPa: 1010 } }));
const rampProbe = chain({ origin, duration: 5 * H, changes: rampChanges, reads: Array.from({ length: 600 }, (_, i) => 29_000 + i * 30_000) });
const firstRampSpill = rampProbe.observations.find(o => o.text === '水が開いた管の口まで上がって、あふれた');
// Keep the discovered input fixed, so the same case remains useful after a fix moves spill detection.
const rampEndRelative = 11_850_000;
const rampTerminal = chain({ origin, duration: rampEndRelative, changes: rampChanges, reads: [rampEndRelative - 1000] });
const rampState = rampTerminal.last.state.data;
const rampRiseAtEnd = rise(rampState.g, rampState.s.sHi, 101000, rampState.s.bHi);
const gradualWeatherTerminalSpill = { changes: rampChanges.filter(c => c.at < rampEndRelative), readAt: origin + rampEndRelative - 1000,
  firstDiscoveredSpillReading: firstRampSpill ?? null, endRelativeMs: rampEndRelative, endRiseM: rampRiseAtEnd,
  projectedSpillAtEndMg: Math.min(rampState.waterMg, Math.round((rampRiseAtEnd - rampState.g.halfLengthM) * rampState.g.A * 1e9)),
  last: rampTerminal.last, observations: rampTerminal.observations };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const matrix = [];
const comparisonChunks = [['oneWeatherInterval', Infinity], ['30s', 30000], ['1h', H], ['17min+137ms', 17 * M + 137]];
const scenes = [
  { name: 'one-step-then-held', duration: H, changes: [{ at: 30000, env: { airTempC: 32, pressureHPa: 1000 } }] },
  { name: 'piecewise-off-grid', duration: 6 * H, changes: [
    { at: 30137, env: { airTempC: 28.8, pressureHPa: 1009 } }, { at: 37 * M + 137, env: { airTempC: 27, pressureHPa: 1007 } },
    { at: 2 * H, env: { airTempC: 29.5, pressureHPa: 1004 } }, { at: 3 * H + 737, env: { airTempC: 32, pressureHPa: 1002 } },
    { at: 4 * H + 1234, env: { airTempC: 27, pressureHPa: 1007 } },
  ] },
];
for (const start of [0, 1007]) for (const tau of [95, assembledParams.airLeakTauMin]) for (const scene of scenes) {
  const options = { origin: start, duration: scene.duration, changes: scene.changes, params: { tubeLengthMm: 600, airLeakTauMin: tau },
    reads: [0, 137, 30000, 30137, 59963, 6 * M + 13, H - 1000, 3 * H + 13, 6 * H - 737].filter(t => t < scene.duration) };
  const reference = chain(options), noReads = chain({ ...options, reads: [] });
  check(`reading leaves full physical state unchanged: ${scene.name}/${start}/${tau}`, equal(physical(reference.last), physical(noReads.last)));
  for (const [partition, chunk] of comparisonChunks) {
    const actual = chain({ ...options, chunk });
    const exactPhysical = equal(physical(reference.last), physical(actual.last)), exactReadings = equal(reference.observations, actual.observations);
    check(`same records and state in partition ${scene.name}/${start}/${tau}/${partition}`, exactPhysical && exactReadings);
    matrix.push({ scene: scene.name, origin: start, tauMin: tau, partition, exactPhysical, exactReadings, condition: actual.last.state.data.condition });
  }
}
for (const start of [0, 1007]) {
  const options = { origin: start, duration: H, changes: [{ at: 30000, env: { airTempC: 32, pressureHPa: 1000 } }], params: { tubeLengthMm: 600 },
    reads: [30000, 30137, 60 * 1000 + 13, H - 1000] };
  const whole = chain(options), short = chain({ ...options, chunk: 737 });
  check(`737ms parts match all physical floats and readings ${start}`, equal(physical(whole.last), physical(short.last)) && equal(whole.observations, short.observations));
  matrix.push({ scene: 'held-737ms', origin: start, partition: '737ms', exactPhysical: equal(physical(whole.last), physical(short.last)), exactReadings: equal(whole.observations, short.observations) });
  const withoutReads = chain({ ...options, reads: [] }), lotsReads = chain({ ...options, reads: Array.from({ length: 360 }, (_, i) => i * 10000 + 137) });
  check(`360 additional readings leave full physical state unchanged ${start}`, equal(physical(withoutReads.last), physical(lotsReads.last)));
}
const stopControls = [];
for (const start of [0, 1007]) for (const end of [60000, 60137]) {
  const base = { origin: start, duration: end, changes: [{ at: 30000, env: { airTempC: 32, pressureHPa: 1000 } }], params: { tubeLengthMm: 600 }, reads: [30137, end - 1000] };
  const normal = chain(base), lost = chain({ ...base, chunk: 30000, loseEquipment: true, stop: 'equipment-lost' });
  check(`equipment lost at end preserves prior physical evolution ${start}/${end}`, equal(physical(normal.last), physical(lost.last)) && equal(normal.observations, lost.observations));
  const taken = chain({ ...base, duration: end + 1000, takeOut: end });
  check(`take_out vs operator ends at the same physical time ${start}/${end}`, equal(physical(normal.last), physical(taken.last)) && equal(normal.observations, taken.observations));
  stopControls.push({ origin: start, endRelativeMs: end, lossSamePhysical: equal(physical(normal.last), physical(lost.last)), takeOutSamePhysical: equal(physical(normal.last), physical(taken.last)) });
}
const refusalControls = [];
const stateAtThirty = clone(prefixSave);
const refuse = (name, q, reason) => {
  const r = step(q); check(name, r.status === 'failed' && reason.test(r.evidence.notes) && !r.consumed.length && !r.produced.length && !r.released.length && !r.energy.length);
  refusalControls.push({ name, status: r.status, reason: r.evidence.notes });
};
refuse('old /0 schema has an explicit unsupported-state-schema refusal', request(origin + 30000, origin + 60000, { schema: 'civ-sci.air-barometer-pot/0', data: {} }), /unsupported-state-schema/);
refuse('unknown /2 state is rejected', request(origin + 30000, origin + 60000, { schema: 'civ-sci.air-barometer-pot/2', data: {} }), /unknown state schema/);
refuse('test gauge state cannot be attached to this different process', request(origin + 30000, origin + 60000, { schema: 'civ-sci.air-barometer/3', data: {} }), /unknown state schema/);
refuse('changed reserved water is rejected', request(origin + 30000, origin + 60000, clone(stateAtThirty), {}, [], { lots: [{ ...water, amount: { unit: 'mg', value: 19999 } }] }), /changed-input/);
refuse('changed water history is rejected', request(origin + 30000, origin + 60000, clone(stateAtThirty), {}, [], { lots: [{ ...water, quality: { history_complete: 0 } }] }), /changed-input/);
refuse('changed dimensions are rejected', request(origin + 30000, origin + 60000, clone(stateAtThirty), {}, [], { equipment: [bulb({ tubeLengthMm: 201 })] }), /changed-input/);
refuse('changed equipment identity is rejected', request(origin + 30000, origin + 60000, clone(stateAtThirty), {}, [], { equipment: [{ ...bulb(), equipmentId: 'eq:other' }] }), /changed-input/);
refuse('noncontiguous request is rejected', request(origin + 30001, origin + 60000, clone(stateAtThirty)), /noncontiguous/);
const reversed = bulb(); reversed.params = Object.fromEntries(Object.entries(reversed.params).reverse());
const orderedRestore = step(request(origin + 30000, origin + 60000, clone(stateAtThirty), {}, [], { stop: 'operator' }));
const reversedRestore = step(request(origin + 30000, origin + 60000, clone(stateAtThirty), {}, [], { stop: 'operator', equipment: [reversed] }));
check('params key order does not change the fingerprint or restored physics', equal(physical(orderedRestore), physical(reversedRestore)));
const result = { target: '7f4d1e3c50e29f1ecde7382219f13f19c32777d4', process: BAROMETER_POT_PROCESS, fixture: { sealedLot: lotPot, assembledParams },
  spillReadWithoutSettlement, ordinaryTerminalSpill, transientSpillErased, gradualWeatherTerminalSpill, matrix, stopControls, refusalControls,
  findings: [{ id: 'SB-A3', impact: 'A', title: 'A spill between cell heads disappears at termination or a later pressure change',
    gradualWeatherReproduced: gradualWeatherTerminalSpill.observations.some(o => /あふれた/.test(o.text ?? '')) && gradualWeatherTerminalSpill.last.state.data.condition === 'ok' && gradualWeatherTerminalSpill.last.released.length === 0,
    erasedSpillReproduced: hotBeforeBoundary.observations.some(o => /あふれた/.test(o.text ?? '')) && recoveredReading.observations.some(o => o.value !== undefined) && recoveredReading.state.data.condition === 'ok' && recoveredReading.released.length === 0 }],
  summary: { requests: counters.requests, checks: counters.checks.length, failedChecks: counters.checks.filter(c => !c.passed).length,
    matrixComparisons: matrix.length, unequalPhysicalComparisons: matrix.filter(m => !m.exactPhysical).length, unequalReadingComparisons: matrix.filter(m => !m.exactReadings).length,
    exceptions: counters.exceptions.length, nonFinite: counters.nonFinite.length, validatorFailures: counters.validatorFailures.length }, ...counters };
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.summary, null, 2));
console.log(JSON.stringify({ fixture: assembledParams, terminalSpillCondition: ordinaryTerminalSpill.stopped.diagnostics,
  gradualWeatherTerminalSpill: gradualWeatherTerminalSpill && { endRelativeMs: gradualWeatherTerminalSpill.endRelativeMs,
    endRiseM: gradualWeatherTerminalSpill.endRiseM, projectedSpillAtEndMg: gradualWeatherTerminalSpill.projectedSpillAtEndMg,
    diagnostics: gradualWeatherTerminalSpill.last.diagnostics, observations: gradualWeatherTerminalSpill.observations } }, null, 2));
