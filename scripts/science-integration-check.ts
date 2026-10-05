// The world side's check of the science processes it has taken in: weighing (fixture_mass_measure) and the
// test tile's shaping (p11x_test_tile_shape), fixture-3 on the one test catalog civ-sci-test-2.
// src/science/step/{simple,fixture-profile,validate}.ts come unchanged from codex/civilization-simulation
// (6ea2509, simple.ts from c8f9446);
// nothing in the app calls them yet (the island runs processes only once the shared world's server holds the
// ledger, ADR 0002). This checks what the world will rely on when it does: every result passes validateResult,
// each status means what docs/proposals/civilization/SCIENCE_FINAL_REVIEW_RESPONSE.md says the world does with it,
// and each settles exactly once. Run: npx tsx scripts/science-integration-check.ts
import { simpleFixtureStep as step } from '../src/science/step/simple';
import { dryingStep, DRYING_PROCESS, SCIENCE_CATALOG_VERSION, TILE_DRY_MATERIAL } from '../src/science/step/drying';
import { validateResult } from '../src/science/step/validate';
import type { ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';

const T = 1_790_000_010_000;   // a world-clock 30 s mark
const req = (o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.1.0', requestId: `run:w1@${o.interval?.from ?? T}#0`, world: { worldId: 'w', worldEpoch: 'e1', worldVersion: 1 }, runId: 'run:w1',
  processId: 'fixture_mass_measure', processVersion: 'fixture-3', catalogVersion: 'civ-sci-test-2',
  interval: { from: T, to: T + 10_000 }, state: null, environment: { sampleId: 'env:sim-1', source: 'simulation', effectiveAt: T },
  lots: [{ lotId: 'lot:tile-1', materialId: 'tile', amount: { value: 36_290, unit: 'mg' }, location: 'site:workshop' }],
  equipment: [{ equipmentId: 'eq:balance-1', kind: 'fixture_balance', catalogEntry: 'fixture_balance', catalogVersion: 'civ-sci-test-2', condition: 1 }],
  energy: [{ sourceId: 'src:fixture-mains', kind: 'electric', maxJ: 10 }],
  actions: [{ at: T, residentId: 'res:dot', action: 'read-balance' }], seed: 1, ...o,
});

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, info?: unknown) => { if (ok) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } };
const run = (name: string, r: ScienceStepRequest) => { const res = (r.processId === DRYING_PROCESS.processId ? dryingStep : step)(r); check(`${name}: validateResult`, validateResult(r, res).length === 0, validateResult(r, res)); return res; };
const flows = (x: ScienceStepResult) => x.consumed.length + x.produced.length + x.released.length;

// the world's side of one weighing: commits by requestId, at most once per run
function world() {
  const done = new Set<string>(), memory: { res: string; value: number; precision: number }[] = [];
  let usedJ = 0, closed = false;
  return {
    memory, get usedJ() { return usedJ; }, get closed() { return closed; },
    commit(r: ScienceStepRequest, res: ScienceStepResult, observer: string) {
      if (done.has(r.requestId) || closed || validateResult(r, res).length || res.status === 'failed') return false;
      done.add(r.requestId);
      for (const e of res.energy) usedJ += e.usedJ;
      // (the observer is the resident who read the balance in the world's own request: the result does not name them)
      if (res.status === 'completed') for (const o of res.observations) memory.push({ res: observer, value: o.value!, precision: o.precision! });
      if (res.status === 'completed' || res.status === 'stopped') closed = true;
      return true;
    },
  };
}

// 1. the plain weighing: 36,290 mg reads 36,300 mg ± 100, 10 J lost, nothing consumed
{
  const r = req(), res = run('whole', r), w = world();
  check('whole: completed', res.status === 'completed', res.status);
  check('whole: reads 36300 mg, precision 100', res.observations.length === 1 && res.observations[0].value === 36_300 && res.observations[0].precision === 100, res.observations);
  check('whole: never shows the true mass', !res.observations.some((o) => o.value === 36_290));
  check('whole: 10 J used and lost', res.energy.length === 1 && res.energy[0].usedJ === 10 && res.energy[0].lostJ === 10, res.energy);
  check('whole: no lot change', flows(res) === 0);
  check('whole: commits once', w.commit(r, res, 'res:dot') && !w.commit(r, res, 'res:dot') && w.memory.length === 1 && w.usedJ === 10);
  check('whole: same request, same result', JSON.stringify(step(r)) === JSON.stringify(res));
  // a request after completion (a world bug) settles nothing and the closed run refuses it
  const late = req({ requestId: 'run:w1@late', interval: { from: T + 10_000, to: T + 11_000 }, state: res.state, actions: [] }), lr = run('after completion', late);
  check('after completion: no flows, no observation, no energy', flows(lr) === 0 && lr.observations.length === 0 && lr.energy.length === 0);
  check('after completion: the world does not commit again', !w.commit(late, lr, 'res:dot') && w.memory.length === 1);
}
// 2. in two parts (4 s + 6 s): same reading, same 10 J, the observation only at the end
{
  const w = world(), a = req({ interval: { from: T, to: T + 4_000 } }), ra = run('part 1', a);
  check('part 1: running, no observation', ra.status === 'running' && ra.observations.length === 0);
  w.commit(a, ra, 'res:dot');
  const b = req({ interval: { from: T + 4_000, to: T + 10_000 }, state: ra.state, actions: [] }), rb = run('part 2', b);
  check('part 2: completed with the reading', rb.status === 'completed' && rb.observations[0]?.value === 36_300);
  w.commit(b, rb, 'res:dot');
  check('parts: 10 J in all, one memory', w.usedJ === 10 && w.memory.length === 1 && w.closed);
  check('parts: a resent part 1 changes nothing', !w.commit(a, step(a), 'res:dot') && w.usedJ === 10);
}
// 3. power short (fixture-3: an offer arrives evenly over its interval): 5 J over 10 s is 0.5 W, less than the
// balance's 1 W — nothing happens in that interval (needs-input, 0 J, no reading) and the clock moves to its end;
// offered enough after that, it weighs from there and completes
{
  const a = req({ energy: [{ sourceId: 'src:fixture-mains', kind: 'electric', maxJ: 5 }] }), ra = run('short power', a);
  check('short power: needs-input, nothing used, time moved to the end of the interval', ra.status === 'needs-input' && ra.simulated.to === T + 10_000 && ra.energy.length === 0 && flows(ra) === 0 && ra.observations.length === 0, ra);
  const b = req({ interval: { from: ra.simulated.to, to: T + 20_000 }, state: ra.state, actions: [] }), rb = run('short power, resumed', b);
  check('short power: resumed with enough power and completed', rb.status === 'completed' && rb.energy[0].usedJ === 10 && rb.observations[0]?.value === 36_300, rb);
}
// 4. stops: operator / equipment-lost close the run without a reading; world-pause resumes later
{
  const a = req({ interval: { from: T, to: T + 4_000 }, stop: 'operator' }), ra = run('operator stop', a);
  check('operator stop: stopped, no observation', ra.status === 'stopped' && ra.observations.length === 0 && flows(ra) === 0);
  const p = req({ interval: { from: T, to: T + 4_000 }, stop: 'world-pause' }), rp = run('world pause', p);
  check('world pause: running (a pause is not a failure)', rp.status === 'running');
  const q = req({ interval: { from: T + 60_000, to: T + 66_000 }, state: rp.state, actions: [] }), rq = run('after pause', q);
  check('after pause: resumes later and completes', rq.status === 'completed' && rq.observations[0]?.value === 36_300);
  // (fixture-2: a stop is honoured even when the power ran short before the end of the interval)
  const s = req({ energy: [{ sourceId: 'src:fixture-mains', kind: 'electric', maxJ: 5 }], stop: 'operator' }), rs = run('stop + short power', s);
  check('stop + short power: stopped, no reading', rs.status === 'stopped' && rs.observations.length === 0);
}
// 5. refusals: failed, with no flows and nothing for the world to commit
for (const [name, r, code] of [
  ['live environment', req({ environment: { sampleId: 'env:live-1', source: 'live', effectiveAt: T } }), 'fixture-only'],
  ['no read-balance', req({ actions: [] }), 'measurement-not-requested'],
  ['off the second', req({ interval: { from: T + 1, to: T + 10_001 } }), 'unaligned-or-invalid-interval'],
  ['heat offered', req({ energy: [{ sourceId: 'src:fire-1', kind: 'heat', maxJ: 100 }] }), 'invalid-energy-offer'],
  ['worn balance', req({ equipment: [{ equipmentId: 'eq:balance-1', kind: 'fixture_balance', catalogEntry: 'fixture_balance', catalogVersion: 'civ-sci-test-2', condition: 0.9 }] }), 'uncalibrated-equipment'],
  ['old catalog', req({ catalogVersion: 'civilization-fixture-1' }), 'unsupported-version'],
  ['old process version', req({ processVersion: 'fixture-1' }), 'unsupported-version'],
  ['old state schema', req({ state: { schema: 'civilization-simple-process/1', data: {} } }), 'unsupported-schema'],
] as const) {
  const res = run(name, r), w = world();
  check(`${name}: failed ${code}`, res.status === 'failed' && (res.diagnostics as any)?.code === code, [res.status, res.diagnostics]);
  check(`${name}: nothing to commit`, flows(res) === 0 && res.energy.length === 0 && res.observations.length === 0 && !w.commit(r, res, 'res:dot'));
}
// 6. the lot changed under a running weighing
{
  const a = req({ interval: { from: T, to: T + 4_000 } }), ra = step(a);
  const b = req({ interval: { from: T + 4_000, to: T + 10_000 }, state: ra.state, actions: [], lots: [{ lotId: 'lot:tile-1', materialId: 'tile', amount: { value: 36_000, unit: 'mg' }, location: 'site:workshop' }] });
  check('changed lot: failed changed-input', (run('changed lot', b).diagnostics as any)?.code === 'changed-input');
}

// 7. shaping a test tile: 45 g of prepared clay in a 50 x 50 x 10 mm mould, 60 s of a resident's hands (120 J)
{
  const clay = { lotId: 'lot:clay-1', materialId: 'prepared_clay', amount: { value: 45_000, unit: 'mg' as const }, location: 'site:workshop', quality: { water_ppm: 220_000, xd_kaolinite_ppm: 600_000, xd_quartz_ppm: 400_000 } };
  const bench = { equipmentId: 'eq:bench-1', kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: 'civ-sci-test-2', condition: 1, params: { thicknessMm: 10, widthMm: 50, lengthMm: 50 } };
  const sreq = (o: Partial<ScienceStepRequest> = {}) => req({ runId: 'run:s1', requestId: `run:s1@${o.interval?.from ?? T}#0`, processId: 'p11x_test_tile_shape', lots: [clay], equipment: [bench],
    energy: [{ sourceId: 'src:res-dot-hands', kind: 'mechanical', maxJ: 120 }], actions: [], interval: { from: T, to: T + 60_000 }, ...o });
  const r = sreq(), res = run('shape', r);
  check('shape: completed', res.status === 'completed', [res.status, res.diagnostics]);
  check('shape: the clay lot consumed whole', res.consumed.length === 1 && res.consumed[0].lotId === 'lot:clay-1' && res.consumed[0].amount.value === 45_000);
  const tile = res.produced[0];
  check('shape: one green test tile of the same mass, where the clay was', res.produced.length === 1 && tile.materialId === 'test_tile_green' && tile.amount.value === 45_000 && tile.into === 'site:workshop', res.produced);
  check('shape: the tile carries what drying needs', !!tile && ['water_ppm', 'width_mm', 'length_mm', 'thickness_mm'].every((k) => typeof tile.quality?.[k] === 'number'), tile?.quality);
  check('shape: 120 J of hand work, all lost', res.energy.length === 1 && res.energy[0].usedJ === 120 && res.energy[0].lostJ === 120);
  // in two parts, the lot settled only at the end
  const a = sreq({ interval: { from: T, to: T + 20_000 } }), ra = run('shape part 1', a);
  check('shape part 1: running, nothing settled', ra.status === 'running' && ra.consumed.length === 0 && ra.produced.length === 0);
  const b = sreq({ interval: { from: T + 20_000, to: T + 60_000 }, state: ra.state }), rb = run('shape part 2', b);
  check('shape parts: same tile as in one go', rb.status === 'completed' && JSON.stringify(rb.produced) === JSON.stringify(res.produced));
  // stopped: nothing made, the clay stays clay
  const st = run('shape stopped', sreq({ interval: { from: T, to: T + 20_000 }, stop: 'operator' }));
  check('shape stopped: stopped, no tile, no clay used', st.status === 'stopped' && st.consumed.length === 0 && st.produced.length === 0);
  // refusals
  for (const [name, o, code] of [
    ['mould too big for the clay', { equipment: [{ ...bench, params: { thicknessMm: 20, widthMm: 100, lengthMm: 100 } }] }, 'mould-does-not-fit-the-clay'],
    ['clay without its make-up', { lots: [{ ...clay, quality: { water_ppm: 220_000 } }] }, 'clay-make-up-missing'],
    ['not clay', { lots: [{ ...clay, materialId: 'sand' }] }, 'wrong-material'],
  ] as const) {
    const rr = run(name, sreq(o as any));
    check(`${name}: failed ${code}`, rr.status === 'failed' && (rr.diagnostics as any)?.code === code, [rr.status, rr.diagnostics]);
  }
}

// 8. drying the tile on a rack, a day at a time in the real weather (0.3.0, catalog civ-sci-test-2): nothing settles
// while it dries; taken off, the tile and the water it lost settle once, mass closing in mg; a day with no weather
// known (or no humidity) is not worked out and leaves the history incomplete — never made up
{
  const clay = { lotId: 'lot:clay-2', materialId: 'prepared_clay', amount: { value: 45_000, unit: 'mg' as const }, location: 'site:workshop', quality: { water_ppm: 220_000, xd_kaolinite_ppm: 600_000, xd_quartz_ppm: 400_000 } };
  const bench = { equipmentId: 'eq:bench-1', kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: 'civ-sci-test-2', condition: 1, params: { thicknessMm: 10, widthMm: 50, lengthMm: 50 } };
  const shaped = step(req({ runId: 'run:s2', requestId: 'run:s2@0', processId: 'p11x_test_tile_shape', lots: [clay], equipment: [bench], energy: [{ sourceId: 'src:res-dot-hands', kind: 'mechanical', maxJ: 120 }], actions: [], interval: { from: T, to: T + 60_000 } }));
  const tile = shaped.produced[0];
  const tileLot = { lotId: 'lot:tile-2', materialId: tile.materialId, amount: tile.amount, location: 'site:rack', quality: tile.quality };
  const rack = { equipmentId: 'eq:rack-1', kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1, params: { sunExposure: 0 } };
  const DAY = 86_400_000, start = T + 60_000 + 30_000 - ((T + 60_000) % 30_000);   // (the run starts on a world-clock 30 s mark)
  let state: any = null, last: ScienceStepResult | null = null;
  const days: string[] = [];
  for (let d = 0; d < 5; d++) {
    const from = start + d * DAY, to = d === 4 ? from + 6 * 3_600_000 : from + DAY;
    const env = d === 2 ? { sampleId: `env:d${d}`, source: 'unknown' as const, effectiveAt: from }
      : { sampleId: `env:d${d}`, source: 'live' as const, effectiveAt: from, airTempC: 28, humidity: 0.72, windMs: 3 };
    const r: ScienceStepRequest = req({ runId: 'run:d1', requestId: `run:d1@${from}#0`, processId: DRYING_PROCESS.processId, processVersion: DRYING_PROCESS.processVersion,
      catalogVersion: SCIENCE_CATALOG_VERSION, interval: { from, to }, state, environment: env as any, lots: [tileLot], equipment: [rack], energy: [],
      actions: d === 4 ? [{ at: to - 30_000, residentId: 'res:dot', action: 'take_off' }] : [], seed: 7 });
    const res = run(`dry day ${d + 1}`, r);
    days.push(res.status + (res.status === "failed" ? " " + JSON.stringify([res.diagnostics, res.evidence.notes]).slice(0, 200) : ""));
    if (d < 4) check(`dry day ${d + 1}: running, nothing settled`, res.status === 'running' && flows(res) === 0, [res.status, res.diagnostics]);
    state = res.state; last = res;
  }
  const res = last!;
  check('dry: taken off, completed', res.status === 'completed', days);
  const cin = res.consumed.reduce((a, c) => a + c.amount.value, 0), cout = res.produced.reduce((a, c) => a + c.amount.value, 0) + res.released.reduce((a, c) => a + c.amount.value, 0);
  check('dry: the tile consumed whole, mass closes in mg', res.consumed.length === 1 && cin === 45_000 && cout === 45_000, [cin, cout]);
  check('dry: water let go to the air', res.released.some((x) => x.materialId === 'water_vapour' && x.to === 'air' && x.amount.value > 0), res.released);
  const out = res.produced[0];
  check('dry: a dried tile, lighter', !!out && (out.materialId === TILE_DRY_MATERIAL || out.materialId === 'test_tile_green') && out.amount.value < 45_000, out);
  check('dry: the day with no weather left the history incomplete', out?.quality?.history_complete === 0, out?.quality);
  check('dry: what is seen, only on taking it off', res.observations.length > 0);
  check('dry: no energy offered, none taken from an offer', res.energy.every((e) => /^src:env-heat:/.test(e.sourceId)));
  // no humidity (the weather had none): not worked out either
  const nh = run('dry without humidity', req({ runId: 'run:d2', requestId: 'run:d2@0', processId: DRYING_PROCESS.processId, processVersion: DRYING_PROCESS.processVersion, catalogVersion: SCIENCE_CATALOG_VERSION,
    interval: { from: start, to: start + DAY }, environment: { sampleId: 'env:x', source: 'live', effectiveAt: start, airTempC: 28, windMs: 3 } as any, lots: [tileLot], equipment: [rack], energy: [], actions: [], seed: 7 }));
  check('dry without humidity: running, nothing worked out, nothing settled', nh.status === 'running' && flows(nh) === 0 && nh.energy.length === 0, [nh.status, nh.energy]);
  // an old state is refused (the world then ends the run and frees the reservation)
  const old = run('dry old state', req({ runId: 'run:d1', requestId: 'run:d1@old', processId: DRYING_PROCESS.processId, processVersion: DRYING_PROCESS.processVersion, catalogVersion: SCIENCE_CATALOG_VERSION,
    interval: { from: start, to: start + 30_000 }, state: { schema: 'civ-sci.drying/2', data: {} }, environment: { sampleId: 'env:x', source: 'live', effectiveAt: start, airTempC: 28, humidity: 0.7, windMs: 3 } as any, lots: [tileLot], equipment: [rack], energy: [], actions: [], seed: 7 }));
  check('dry old state /2: failed, nothing to commit', old.status === 'failed' && flows(old) === 0, [old.status, old.diagnostics]);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
