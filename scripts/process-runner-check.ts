// Headless check of the world's side of a science process (src/world/process-runner.ts, ADR 0002 / 0006):
//  1 shaping a test tile on the world's real clock: the clay reserved, stepped in parts, the tile made once, the clay
//    gone, the reservation freed; a resent request changes nothing
//  2 drying the tile on the island's clock, in the island's replayed weather: half a real day is days of drying; taken
//    off, the dried tile replaces it; what was noticed comes back in real time
//  3 saved and restored mid-run (JSON), it ends exactly as a run never interrupted
//  4 what the world refuses: a lot in use, a result that breaks the contract (nothing changes); a refused process
//    (not clay) ends its run with nothing used
//  5 what a run lets go is booked (science final review 2026-10-10-barometer): the self-made barometer on a tubed pot, the
//    pressure falling fast enough to push water out of the tube's mouth; taken out, the rest of the water back where it
//    was, the spilled water released to the ground and in the ledger — none of it lost from the accounts
// Usage: npx tsx scripts/process-runner-check.ts
import { emptyLedger, addLot, startRun, advance, commit, nextRequest, toClock, toReal, assemble, type Ledger } from '../src/world/process-runner';
import { POT_ASSEMBLY } from '../src/world/process-catalog';
import { barometerPotStep, BAROMETER_POT_PROCESS } from '../src/science/step/barometer-pot';
import { simpleFixtureStep } from '../src/science/step/simple';
import { dryingStep, DRYING_PROCESS, SCIENCE_CATALOG_VERSION } from '../src/science/step/drying';
import { loadIslandWeather, islandWeather } from '../src/world/island-time';
import type { ScienceStep } from '../src/world/science-contract';

let bad = 0;
const want = (what: string, ok: boolean, got: unknown = '') => { if (!ok) bad++; console.log(`${what}: ${typeof got === 'string' ? got : JSON.stringify(got)} ${ok ? 'ok' : 'FAIL'}`); };
await loadIslandWeather();
const T0 = Date.parse('2026-10-06T09:00:07+09:00');
const clayQ = { water_ppm: 220_000, xd_kaolinite_ppm: 600_000, xd_quartz_ppm: 400_000 };
function world(): Ledger {
  const L = emptyLedger('dotworld', 'e1');
  addLot(L, { lotId: 'lot:clay-1', materialId: 'prepared_clay', amount: { value: 45_000, unit: 'mg' }, location: 'site:workshop', quality: { ...clayQ } });
  L.equipment['eq:bench-1'] = { equipmentId: 'eq:bench-1', kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: 'civ-sci-test-2', condition: 1, params: { thicknessMm: 10, widthMm: 50, lengthMm: 50 } };
  L.equipment['eq:rack-1'] = { equipmentId: 'eq:rack-1', kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1, params: { sunExposure: 0 } };
  return L;
}
const sim = (at: number) => ({ sampleId: `env:sim:${at}`, source: 'simulation' as const, effectiveAt: at });
const hands = (from: number, to: number) => [{ sourceId: 'src:res-lantern-hands', kind: 'mechanical' as const, maxJ: Math.round(((to - from) / 1000) * 3) }];
const shapeSpec = { processId: 'p11x_test_tile_shape', processVersion: 'fixture-4', catalogVersion: 'civ-sci-test-2', contract: '0.2.1', clock: 'world' as const, lotIds: ['lot:clay-1'], equipmentIds: ['eq:bench-1'], operator: 'res:lantern' };

let tileId = '';
{ // 1
  const L = world(), { run } = startRun(L, shapeSpec, T0);
  want('1 the clay is reserved to the run', L.lots['lot:clay-1'].reservedBy === run!.runId && run!.lastTo % 30_000 === 0, run!.runId);
  const a = advance(L, run!.runId, simpleFixtureStep, { realNow: T0 + 75_000, environment: sim, energy: hands });
  want('1 part way: running, nothing settled', a.length > 0 && a.every((c) => c.ok && c.status === 'running') && !!L.lots['lot:clay-1'], a.map((c) => c.status));
  const b = advance(L, run!.runId, simpleFixtureStep, { realNow: T0 + 3 * 60_000, environment: sim, energy: hands });
  const tile = b.flatMap((c) => c.produced ?? [])[0];
  want('1 done: one green tile, the clay gone, nothing reserved', L.runs[run!.runId].status === 'completed' && tile?.materialId === 'test_tile_green' && tile.amount.value === 45_000 && !L.lots['lot:clay-1'] && !L.equipment['eq:bench-1'].reservedBy, tile);
  // a resend of the last request: refused, nothing changes
  const last = Object.keys(L.lots).length, req = { ...nextRequest(L, run!.runId, { realNow: T0 + 4 * 60_000, environment: sim, energy: hands }) };
  want('1 the run has ended: nothing more to ask', Object.keys(req).length === 0);
  const again = commit(L, { requestId: L.committed[L.committed.length - 1], runId: run!.runId } as any, {} as any);
  want('1 a resent result is not committed again', !again.ok && Object.keys(L.lots).length === last, again.why);
  tileId = tile?.lotId ?? '';
}
// 2 + 3: drying, on the island's clock
const dryOnce = (interrupt: boolean) => {
  const L = world(), { run: s } = startRun(L, shapeSpec, T0);
  advance(L, s!.runId, simpleFixtureStep, { realNow: T0 + 3 * 60_000, environment: sim, energy: hands });
  const tile = Object.values(L.lots).find((l) => l.materialId === 'test_tile_green')!;
  tile.location = 'site:rack';
  let led = L;
  const start = T0 + 5 * 60_000, { run } = startRun(led, { processId: DRYING_PROCESS.processId, processVersion: DRYING_PROCESS.processVersion, catalogVersion: SCIENCE_CATALOG_VERSION, contract: '0.1.0', clock: 'island', lotIds: [tile.lotId], equipmentIds: ['eq:rack-1'], operator: 'res:lantern' }, start);
  const off = toClock('island', start + 11 * 3600_000);   // (taken off the rack after eleven real hours: about six island days)
  // (the replayed weather: measured values at the island's date; source 'live' until 0.2.1's 'record' is taken in)
  const env = (at: number) => { const w = islandWeather(toReal('island', at))!; return { sampleId: `env:record:jma-47918:${w.record.at}`, source: 'live' as const, effectiveAt: at, airTempC: w.air, humidity: w.humidity, windMs: w.windMeasured }; };
  const steps: string[] = [];
  for (let h = 1; h <= 12; h++) {
    if (interrupt && h === 6) led = JSON.parse(JSON.stringify(led));   // (saved and restored: the server restarted)
    const c = advance(led, run!.runId, dryingStep, { realNow: start + h * 3600_000, environment: env, actions: [{ at: off, action: 'take_off' }] });
    steps.push(...c.map((x) => (x.ok ? x.status! : `refused ${x.why}`)));
  }
  return { L: led, run: led.runs[run!.runId], steps, start, off };
};
{
  const { L, run, steps, start, off } = dryOnce(false);
  const dried = Object.values(L.lots).find((l) => l.location === 'site:rack' && l.lotId !== run.lotIds[0]);
  want('2 drying runs on the island\'s clock: eleven real hours are days on the rack', run.clock === 'island' && (off - toClock('island', start)) / 86400_000 > 5, `${((off - toClock('island', start)) / 86400_000).toFixed(1)} island days`);
  want('2 taken off: completed, the dried tile in place of the wet one, lighter', run.status === 'completed' && !L.lots[run.lotIds[0]] && !!dried && dried.amount.value < 45_000, `${steps.slice(-2).join(',')} ${dried?.materialId} ${dried?.amount.value} mg`);
  const seen = run.observations[0];
  want('2 what was noticed is told back in real time', !!seen && Math.abs(toReal('island', seen.at) - (start + 11 * 3600_000)) < 3600_000, seen ? new Date(toReal('island', seen.at)).toISOString() : 'none');
  const { L: L2, run: run2 } = dryOnce(true);
  const a = Object.values(L.lots).map((l) => [l.materialId, l.amount.value, l.quality]), b = Object.values(L2.lots).map((l) => [l.materialId, l.amount.value, l.quality]);
  want('3 saved and restored mid-run: the same dried tile', run2.status === 'completed' && JSON.stringify(a) === JSON.stringify(b));
}
{ // 4
  const L = world(), { run } = startRun(L, shapeSpec, T0);
  const twice = startRun(L, shapeSpec, T0);
  want('4 a lot in use cannot be taken by another run', !twice.run && /in use/.test(twice.why ?? ''), twice.why);
  const cheat: ScienceStep = (req) => ({ ...simpleFixtureStep(req), status: 'completed', consumed: [{ lotId: 'lot:someone-elses', amount: { value: 1, unit: 'mg' } }] });
  const before = JSON.stringify(L.lots), r = advance(L, run!.runId, cheat, { realNow: T0 + 3 * 60_000, environment: sim, energy: hands });
  want('4 a result that breaks the contract is refused, nothing changes', !r[0].ok && JSON.stringify(L.lots) === before && L.runs[run!.runId].status === 'starting', r[0].why);
  const M = world(); M.lots['lot:clay-1'].materialId = 'sand';
  const { run: s } = startRun(M, shapeSpec, T0), f = advance(M, s!.runId, simpleFixtureStep, { realNow: T0 + 3 * 60_000, environment: sim, energy: hands });
  want('4 not clay: the process refuses, the run ends, the sand is still there and free', f[0]?.status === 'failed' && M.lots['lot:clay-1']?.amount.value === 45_000 && !M.lots['lot:clay-1'].reservedBy, M.runs[s!.runId].why);
}
{ // 5
  const L = emptyLedger('dotworld', 'e1');
  const pot = addLot(L, { materialId: 'fired_pot_test', amount: { value: 640_000, unit: 'mg' }, location: 'site:hut',
    quality: { capacity_ml: 500, absorption_ppm: 120000, coverage_ppm: 990000, sealed: 1, x_tube_ppm: 39_000, tube_bore_mm: 8, tube_length_mm: 200, joint_cover_ppm: 900_000 } });
  const eq = assemble(L, pot.lotId, POT_ASSEMBLY, T0).equipment!;
  addLot(L, { lotId: 'lot:water', materialId: 'process_water', amount: { value: 20_000, unit: 'mg' }, location: 'jar:rain', quality: {} });
  const { run, why } = startRun(L, { processId: BAROMETER_POT_PROCESS.processId, processVersion: BAROMETER_POT_PROCESS.processVersion, catalogVersion: 'civ-sci-test-2', contract: '0.2.1', clock: 'world', lotIds: ['lot:water'], equipmentIds: [eq.equipmentId], operator: 'res:lantern' }, T0);
  let hPa = 1010;
  const env = (at: number) => ({ sampleId: `env:sim:${at}`, source: 'simulation' as const, effectiveAt: at, airTempC: 27, pressureHPa: hPa });
  const a = advance(L, run!.runId, barometerPotStep, { realNow: T0 + 2 * 3_600_000, environment: env });
  hPa = 950;   // (a deep fall for a short tube: the water pushed out of its open mouth)
  const b = advance(L, run!.runId, barometerPotStep, { realNow: T0 + 3 * 3_600_000, environment: env });
  const at = L.runs[run!.runId].lastTo;
  const c = advance(L, run!.runId, barometerPotStep, { realNow: T0 + 3 * 3_600_000 + 60_000, environment: env, actions: [{ action: 'take_out', at }] });
  const back = Object.values(L.lots).filter((l) => l.materialId === 'process_water'), spilled = (L.released ?? []).filter((x) => x.materialId === 'process_water' && x.to === 'ground').reduce((n, x) => n + x.mg, 0);
  const kept = back.reduce((n, l) => n + l.amount.value, 0);
  want('5 the gauge set and read, the fall spilled water, taken out', !why && [...a, ...b, ...c].every((x) => x.ok) && L.runs[run!.runId].status === 'completed', `${why ?? ''} ${L.runs[run!.runId].status} ${L.runs[run!.runId].why ?? ''} ${[...a, ...b, ...c].filter((x) => !x.ok).map((x) => x.why).join('; ')}`);
  want('5 the rest of the water back where it was, the spill released to the ground and booked: 20 g in all', spilled > 0 && back.every((l) => l.location === 'jar:rain') && kept + spilled === 20_000, `back ${kept} mg @${back.map((l) => l.location).join(',')}, spilled ${spilled} mg`);
  const L2: Ledger = JSON.parse(JSON.stringify(L));
  want('5 the booking kept in the save', (L2.released ?? []).length === (L.released ?? []).length && (L2.released ?? []).length > 0);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
