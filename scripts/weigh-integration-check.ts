// The world side's check of the first science process it takes in: weighing (fixture_mass_measure).
// src/science/step/{simple,fixture-profile,validate}.ts come unchanged from codex/civilization-simulation@6ea2509;
// nothing in the app calls them yet (the island runs processes only once the shared world's server holds the
// ledger, ADR 0002). This checks what the world will rely on when it does: every result passes validateResult,
// each status means what docs/proposals/civilization/SCIENCE_FINAL_REVIEW_RESPONSE.md says the world does with it,
// and a weighing settles exactly once. Run: npx tsx scripts/weigh-integration-check.ts
import { simpleFixtureStep as step } from '../src/science/step/simple';
import { validateResult } from '../src/science/step/validate';
import type { ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';

const T = 1_790_000_010_000;   // a world-clock 30 s mark
const req = (o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.1.0', requestId: `run:w1@${o.interval?.from ?? T}#0`, world: { worldId: 'w', worldEpoch: 'e1', worldVersion: 1 }, runId: 'run:w1',
  processId: 'fixture_mass_measure', processVersion: 'fixture-1', catalogVersion: 'civilization-fixture-1',
  interval: { from: T, to: T + 10_000 }, state: null, environment: { sampleId: 'env:sim-1', source: 'simulation', effectiveAt: T },
  lots: [{ lotId: 'lot:tile-1', materialId: 'tile', amount: { value: 36_290, unit: 'mg' }, location: 'site:workshop' }],
  equipment: [{ equipmentId: 'eq:balance-1', kind: 'fixture_balance', catalogEntry: 'fixture_balance', catalogVersion: 'civilization-fixture-1', condition: 1 }],
  energy: [{ sourceId: 'src:fixture-mains', kind: 'electric', maxJ: 10 }],
  actions: [{ at: T, residentId: 'res:dot', action: 'read-balance' }], seed: 1, ...o,
});

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, info?: unknown) => { if (ok) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } };
const run = (name: string, r: ScienceStepRequest) => { const res = step(r); check(`${name}: validateResult`, validateResult(r, res).length === 0, validateResult(r, res)); return res; };
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
// 3. power short: needs-input after 5 s, then continues from simulated.to
{
  const a = req({ energy: [{ sourceId: 'src:fixture-mains', kind: 'electric', maxJ: 5 }] }), ra = run('short power', a);
  check('short power: needs-input at +5 s', ra.status === 'needs-input' && ra.simulated.to === T + 5_000 && ra.energy[0].usedJ === 5);
  const b = req({ interval: { from: ra.simulated.to, to: T + 10_000 }, state: ra.state, actions: [] }), rb = run('short power, resumed', b);
  check('short power: resumed and completed', rb.status === 'completed' && rb.energy[0].usedJ === 5);
}
// 4. stops: operator / equipment-lost close the run without a reading; world-pause resumes later
{
  const a = req({ interval: { from: T, to: T + 4_000 }, stop: 'operator' }), ra = run('operator stop', a);
  check('operator stop: stopped, no observation', ra.status === 'stopped' && ra.observations.length === 0 && flows(ra) === 0);
  const p = req({ interval: { from: T, to: T + 4_000 }, stop: 'world-pause' }), rp = run('world pause', p);
  check('world pause: running (a pause is not a failure)', rp.status === 'running');
  const q = req({ interval: { from: T + 60_000, to: T + 66_000 }, state: rp.state, actions: [] }), rq = run('after pause', q);
  check('after pause: resumes later and completes', rq.status === 'completed' && rq.observations[0]?.value === 36_300);
  // (known, reported to the science side: a stop arriving in an interval the power could not cover is not honoured;
  // the world closes the run itself when it asked to stop)
  const s = req({ energy: [{ sourceId: 'src:fixture-mains', kind: 'electric', maxJ: 5 }], stop: 'operator' }), rs = run('stop + short power', s);
  check('stop + short power: needs-input today (world closes the run)', rs.status === 'needs-input' && rs.observations.length === 0);
}
// 5. refusals: failed, with no flows and nothing for the world to commit
for (const [name, r, code] of [
  ['live environment', req({ environment: { sampleId: 'env:live-1', source: 'live', effectiveAt: T } }), 'fixture-only'],
  ['no read-balance', req({ actions: [] }), 'measurement-not-requested'],
  ['off the second', req({ interval: { from: T + 1, to: T + 10_001 } }), 'unaligned-or-invalid-interval'],
  ['heat offered', req({ energy: [{ sourceId: 'src:fire-1', kind: 'heat', maxJ: 100 }] }), 'invalid-energy-offer'],
  ['worn balance', req({ equipment: [{ equipmentId: 'eq:balance-1', kind: 'fixture_balance', catalogEntry: 'fixture_balance', catalogVersion: 'civilization-fixture-1', condition: 0.9 }] }), 'uncalibrated-equipment'],
  ['other catalog', req({ catalogVersion: 'civ-sci-test-1' }), 'unsupported-version'],
  ['old state schema', req({ state: { schema: 'civilization-simple-process/0', data: {} } }), 'unsupported-schema'],
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

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
