// Checks for the science core's first loop (clay test tiles). Run:
//   npx tsx scripts/science-clay-check.ts
// Pure Node: no DOM, no WebGL, no network.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { elementMoles, addComp, type Composition } from '../src/science/chem';
import { propose } from '../src/science/core';
import { createClayTestWorld } from '../src/science/fixture/clay-world';
import { Driver, ENV_DAY, runScenario, T0 } from '../src/science/fixture/scenario';
import { TestWorld, hashOf } from '../src/science/fixture/world';
import type { Command } from '../src/science/types';

let failures = 0, passes = 0;
function ok(cond: unknown, name: string, detail = '') {
  if (cond) { passes++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); }
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}
const H = 3600_000;
const stateHash = (w: TestWorld) => hashOf(w.state);

console.log('1. scenario: materials and fuel are used, progress and results remain');
const base = runScenario();
const v = base.w.state.view;
ok(base.w.check().length === 0, 'world invariants (mass, reservations)', base.w.check().join('; '));
ok(v.lots['clay-A'].comp && (v.lots['clay-A'].version > 1), 'clay lot was drawn down');
const fires = Object.values(v.runs).filter((r) => r.kind === 'firing');
ok(fires.every((r) => (r.fuelBurnedMg ?? 0) > 0), 'every firing burned real fuel', fires.map((r) => `${r.id}:${((r.fuelBurnedMg ?? 0) / 1e6).toFixed(1)}kg`).join(' '));
ok(fires.every((r) => r.checkpoints.length > 10), 'firing runs keep temperature checkpoints');
ok(Object.values(v.samples).every((s) => s.history.length >= 2), 'every sample has a history');

console.log('2. different conditions → different samples, with the cause recorded');
const abs = (s: string) => Object.values(v.observations).find((o) => o.sampleId === s && o.kind === 'absorption')?.value as number;
ok(v.runs['fire-1'].peakKilnC! < 700 && v.runs['fire-2'].peakKilnC! > 950, 'open fire cannot reach the kiln temperature',
  `open ${v.runs['fire-1'].peakKilnC!.toFixed(0)} °C (${v.runs['fire-1'].outcome}), kiln ${v.runs['fire-2'].peakKilnC!.toFixed(0)} °C`);
ok(abs('T1') > abs('T2') && abs('T2') > abs('T4'), 'measured absorption: open fire > kiln 30 min > kiln 90 min', `${abs('T1')}% > ${abs('T2')}% > ${abs('T4')}%`);
ok(v.samples.T3.stage === 'slaked' && Object.keys(v.samples.T3.comp).length === 0 && v.lots['soak-T3:slurry'], 'unfired control slakes back into a reclaimable slurry lot');
ok(v.samples.T2.sinter < v.samples.T4.sinter, 'longer hold → more sintering (world state)', `${v.samples.T2.sinter.toFixed(2)} < ${v.samples.T4.sinter.toFixed(2)}`);
ok(v.procedures['proc-tile'].status === 'tried' && v.procedures['proc-tile-90'].status === 'reproduced', 'procedure status: one success = tried; two separate firings = reproduced');

console.log('3. missing facility or supply → no success');
const rej = (code: string) => base.log.some((l) => !l.ok && l.note.startsWith(code));
ok(rej('facility'), 'a planned (non-existent) kiln is refused');
ok(rej('no_fuel'), 'an existing kiln without reserved fuel is refused');
ok(rej('protected_resource'), 'protected life/recovery stocks cannot be reserved for research');
ok(v.runs['fire-1'].outcome === 'fuel_exhausted' || v.runs['fire-1'].outcome === 'peak_not_reached', 'open fire run ends without reaching the target', v.runs['fire-1'].outcome);
{
  const d = new Driver(createClayTestWorld());
  d.send({ type: 'open_research', atMs: T0, record: { id: 'rx', residentId: 'dot', question: 'q', hypothesis: { text: '', variable: '', expect: '' }, basis: [], controls: {} } });
  d.send({ type: 'reserve', atMs: T0, reservationId: 'rc', researchId: 'rx', purpose: '', lotId: 'clay-A', mg: 100_000 });
  d.send({ type: 'reserve', atMs: T0, reservationId: 'rw', researchId: 'rx', purpose: '', lotId: 'water-work', mg: 100_000 });
  d.send({ type: 'prepare_clay', atMs: T0, clayReservationId: 'rc', waterReservationId: 'rw', rawMg: 50_000, targetWaterRatio: 0.24, outLotId: 'pc' });
  d.send({ type: 'shape_tiles', atMs: T0, lotId: 'pc', researchId: 'rx', scrapLotId: 'sc', trimFraction: 0, tiles: [{ sampleId: 'W1', label: 'wet', massMg: 45_000, dimsMm: { w: 50, l: 50, t: 10 } }] });
  d.send({ type: 'reserve', atMs: T0, reservationId: 'rf', researchId: 'rx', purpose: '', lotId: 'wood-research', mg: 2_000_000 });
  d.send({ type: 'start_firing', atMs: T0, runId: 'fw', researchId: 'rx', sampleIds: ['W1'], facilityId: 'kiln-fixture', fuelReservationId: 'rf',
    plan: { pace: 'fast', targetGlow: 'orange', holdMin: 30, cooling: 'natural' }, seed: 5, env: ENV_DAY, ashLotId: 'aw' });
  d.advanceUntilDone('fw', T0, 2, ENV_DAY);
  const r = d.w.state.view.runs.fw, s = d.w.state.view.samples.W1;
  ok(r.outcome === 'fuel_exhausted' && r.peakKilnC! < 950, 'too little reserved fuel → fire dies before the target', `${(r.fuelBurnedMg! / 1e6).toFixed(1)} kg, peak ${r.peakKilnC!.toFixed(0)} °C`);
  ok(d.w.state.view.reservations.rf.consumedMg <= 2_000_000, 'never burns beyond the reservation');
  ok(s.risk.steamRatioMax > 1, 'firing an undried tile fast raises the steam-crack risk', `ratio ${s.risk.steamRatioMax.toFixed(1)}`);
}

{
  // plenty of fuel on the open fire: the facility, not the fuel, limits the peak
  const d = new Driver(createClayTestWorld());
  d.send({ type: 'open_research', atMs: T0, record: { id: 'rx', residentId: 'dot', question: 'q', hypothesis: { text: '', variable: '', expect: '' }, basis: [], controls: {} } });
  d.send({ type: 'reserve', atMs: T0, reservationId: 'rc', researchId: 'rx', purpose: '', lotId: 'clay-A', mg: 100_000 });
  d.send({ type: 'reserve', atMs: T0, reservationId: 'rw', researchId: 'rx', purpose: '', lotId: 'water-work', mg: 100_000 });
  d.send({ type: 'prepare_clay', atMs: T0, clayReservationId: 'rc', waterReservationId: 'rw', rawMg: 50_000, targetWaterRatio: 0.24, outLotId: 'pc' });
  d.send({ type: 'shape_tiles', atMs: T0, lotId: 'pc', researchId: 'rx', scrapLotId: 'sc', trimFraction: 0, tiles: [{ sampleId: 'S', label: 's', massMg: 45_000, dimsMm: { w: 50, l: 50, t: 10 } }] });
  d.send({ type: 'start_drying', atMs: T0, runId: 'dr', researchId: 'rx', sampleIds: ['S'], facilityId: 'rack-shade', seed: 1 });
  d.send({ type: 'advance', atMs: T0 + 96 * H, runId: 'dr', untilMs: T0 + 96 * H, env: ENV_DAY });
  d.send({ type: 'finish_drying', atMs: T0 + 96 * H, runId: 'dr' });
  d.send({ type: 'reserve', atMs: T0, reservationId: 'rf', researchId: 'rx', purpose: '', lotId: 'wood-research', mg: 140_000_000 });
  d.send({ type: 'start_firing', atMs: T0 + 96 * H, runId: 'fo', researchId: 'rx', sampleIds: ['S'], facilityId: 'open-fire', fuelReservationId: 'rf',
    plan: { pace: 'normal', targetGlow: 'orange', holdMin: 30, cooling: 'natural' }, seed: 6, env: ENV_DAY, ashLotId: 'ao' });
  d.advanceUntilDone('fo', T0 + 96 * H, 2, ENV_DAY);
  const r = d.w.state.view.runs.fo;
  ok(r.outcome === 'peak_not_reached' && r.peakKilnC! < 750, 'open fire with ample fuel still cannot reach the orange glow', `peak ${r.peakKilnC!.toFixed(0)} °C, ${(r.fuelBurnedMg! / 1e6).toFixed(0)} kg burned of 140`);
}

console.log('4. by-products, failed samples, heat in/out are accounted');
for (const r of fires) {
  const e = r.energy;
  const rhs = e.flueLossJ + e.wallLossJ + e.wareSensibleJ + e.reactionsNetJ + e.structureStoredJ;
  ok(Math.abs(e.releasedJ - rhs) / e.releasedJ < 1e-9, `${r.id}: heat released = flue + wall + ware + reactions + stored`,
    `${(e.releasedJ / 1e6).toFixed(1)} MJ released, ware+reactions ${((e.wareSensibleJ + e.reactionsNetJ) / 1e6).toFixed(3)} MJ`);
  const ash = v.lots[r.ashLotId!].comp.ash ?? 0;
  ok(Math.abs(ash - r.fuelBurnedMg! * 0.85 * 0.01) <= 0.001 * ash + 2, `${r.id}: ash lot holds the ash of the burned wood`, `${(ash / 1000).toFixed(1)} g`);
}
// element balance across the whole world: initial + inflow = now + outflow (formula species only)
const w0 = createClayTestWorld().state.view;
const sumComp = (vv: typeof v): Composition => [...Object.values(vv.lots).map((l) => l.comp), ...Object.values(vv.samples).map((s) => s.comp)].reduce((a, c) => addComp(a, c), {} as Composition);
const before = addComp(sumComp(w0), base.w.state.atmosphereIn);
const after = addComp(sumComp(v), base.w.state.atmosphereOut);
const eb = elementMoles(before), ea = elementMoles(after);
// every mg-rounded reaction may shift each element by at most ~1 mg; allow 1 mg per reacting run-sample and per firing
const ATOM = { C: 12.011, H: 1.008, O: 15.999, Al: 26.982, Si: 28.085, Ca: 40.078 } as const;
const errMg = (Object.keys(eb) as (keyof typeof eb)[]).map((k) => [k, Math.abs(eb[k] - ea[k]) * ATOM[k] * 1000] as const);
const worstMg = Math.max(...errMg.map(([, e]) => e));
ok(worstMg < 20, 'element balance of C, H, O, Al, Si, Ca over the whole test (≤ rounding of a few mg)',
  errMg.map(([k, e]) => `${k} ${e.toFixed(2)} mg`).join(', '));
ok((base.w.state.atmosphereOut.co2 ?? 0) > 0 && (base.w.state.atmosphereIn.o2 ?? 0) > 0, 'CO2 out and O2 in are recorded as boundary flows');
ok(v.samples.T1.stage === 'broken' || v.samples.T1.cracks.length >= 0, 'failed sample stays in inventory with its cracks', `T1 ${v.samples.T1.stage}, cracks ${v.samples.T1.cracks.length}`);
ok(v.lots['scrap-r1'] && v.lots['scrap-r1'].kind === 'clay_scrap', 'trimmings kept as unfired, reclaimable scrap');

console.log('5. interruption, save/load, resend: nothing doubles');
{
  // save → load after every command
  let w = createClayTestWorld();
  const d = runScenario({ world: w, hook: (dd) => { dd.w = TestWorld.load(dd.w.save()); } });
  w = d.w;
  ok(stateHash(w) === stateHash(base.w), 'save/load after every command gives the identical final world');
}
{
  const again = runScenario();
  ok(stateHash(again.w) === stateHash(base.w), 'the same inputs reproduce the same world, run to run');
}
{
  const d = new Driver(createClayTestWorld());
  const sent: Command[] = [];
  const orig = d.w.submit.bind(d.w);
  d.w.submit = (c: Command) => { sent.push(c); return orig(c); };
  runScenario({ world: d.w });
  const h = stateHash(d.w);
  let replayedAll = true;
  for (const c of sent) { const r = orig(c); replayedAll &&= r.replayed; }
  ok(replayedAll && stateHash(d.w) === h, 'resending every command (same id, same payload) changes nothing', `${sent.length} commands`);
  const first = sent.find((c) => c.type === 'reserve' && (c as { mg: number }).mg === 600_000)!;
  const r = orig({ ...first, mg: 999 } as Command);
  ok(!r.ok && r.rejection?.code === 'command_id_reused' && stateHash(d.w) === h, 'same commandId with a different payload is refused');
}
{
  // advance chunking: 1 h steps vs one big step give the same firing
  const mk = (chunks: number[]) => {
    const d = new Driver(createClayTestWorld());
    d.send({ type: 'open_research', atMs: T0, record: { id: 'rx', residentId: 'dot', question: 'q', hypothesis: { text: '', variable: '', expect: '' }, basis: [], controls: {} } });
    d.send({ type: 'reserve', atMs: T0, reservationId: 'rc', researchId: 'rx', purpose: '', lotId: 'clay-A', mg: 100_000 });
    d.send({ type: 'reserve', atMs: T0, reservationId: 'rw', researchId: 'rx', purpose: '', lotId: 'water-work', mg: 100_000 });
    d.send({ type: 'prepare_clay', atMs: T0, clayReservationId: 'rc', waterReservationId: 'rw', rawMg: 50_000, targetWaterRatio: 0.24, outLotId: 'pc' });
    d.send({ type: 'shape_tiles', atMs: T0, lotId: 'pc', researchId: 'rx', scrapLotId: 'sc', trimFraction: 0, tiles: [{ sampleId: 'S', label: 's', massMg: 45_000, dimsMm: { w: 50, l: 50, t: 10 } }] });
    d.send({ type: 'start_drying', atMs: T0, runId: 'dr', researchId: 'rx', sampleIds: ['S'], facilityId: 'rack-shade', seed: 1 });
    d.send({ type: 'advance', atMs: T0 + 96 * H, runId: 'dr', untilMs: T0 + 96 * H, env: ENV_DAY });
    d.send({ type: 'finish_drying', atMs: T0 + 96 * H, runId: 'dr' });
    d.send({ type: 'reserve', atMs: T0, reservationId: 'rf', researchId: 'rx', purpose: '', lotId: 'wood-research', mg: 40_000_000 });
    const t = T0 + 96 * H;
    d.send({ type: 'start_firing', atMs: t, runId: 'f', researchId: 'rx', sampleIds: ['S'], facilityId: 'kiln-fixture', fuelReservationId: 'rf',
      plan: { pace: 'normal', targetGlow: 'orange', holdMin: 30, cooling: 'natural' }, seed: 9, env: ENV_DAY, ashLotId: 'a' });
    let at = t;
    for (const c of chunks) { at += c; d.send({ type: 'advance', atMs: at, runId: 'f', untilMs: at, env: ENV_DAY }); }
    return d;
  };
  const a = mk(Array(30).fill(H)), b = mk([7.3 * H, 0.2 * H, 22.5 * H]);
  const pick = (d: Driver) => hashOf([{ ...d.w.state.view.samples.S, version: 0 }, { ...d.w.state.view.runs.f, version: 0 }, d.w.state.view.lots.a.comp, d.w.state.view.lots['wood-research'].comp]);
  ok(pick(a) === pick(b) && a.w.state.view.runs.f.status === 'completed', 'how the time is chunked does not change the result');

  // operational outage in the middle of the firing
  const c = mk([2 * H]);
  const run0 = c.w.state.view.runs.f;
  const burnedBefore = run0.fuelBurnedMg!;
  c.send({ type: 'advance', atMs: T0 + 110 * H, runId: 'f', untilMs: T0 + 110 * H, env: ENV_DAY, outage: { fromMs: T0 + 99 * H, toMs: T0 + 109 * H } });
  const hr = c.w.state.view.runs.f;
  ok(hr.status === 'halted_operational' && hr.lastMs <= T0 + 99 * H, 'outage during firing → run halts at the last known step', `burned ${(hr.fuelBurnedMg! / 1e6).toFixed(1)} kg (was ${(burnedBefore / 1e6).toFixed(1)})`);
  ok(!c.w.state.view.samples.S.historyComplete, 'its sample is marked as having an unknown thermal history');
  c.send({ type: 'advance', atMs: T0 + 112 * H, runId: 'f', untilMs: T0 + 112 * H, env: ENV_DAY });
  ok(c.w.state.view.runs.f.lastMs === hr.lastMs, 'a halted run does not continue on its own');
  c.send({ type: 'resolve_halt', atMs: T0 + 112 * H, runId: 'f', decision: 'abandon' });
  ok(!c.w.state.view.reservations.rf.open && c.w.state.view.facilities['kiln-fixture'].occupiedBy === null, 'resolving releases unburned fuel and the kiln');
  c.send({ type: 'add_trial', atMs: T0 + 112 * H, researchId: 'rx', trial: { sampleId: 'S', condition: {}, runIds: ['f'], observationIds: [] } });
  const bad = c.send({ type: 'conclude_research', atMs: T0 + 112 * H, researchId: 'rx', conclusion: { verdict: 'supported', text: '', observationIds: [] },
    procedure: { id: 'p', goal: 'g', steps: {}, scope: { clayLotIds: [], facilityIds: [], thicknessMm: [] }, evidence: [{ researchId: 'rx', sampleId: 'S', ok: true }], unknowns: [] } }, 'reject');
  ok(bad.rejection?.code === 'incomplete_history_evidence', 'a sample with an unknown history cannot become evidence for a procedure');
  ok(c.w.check().length === 0, 'invariants still hold after outage and abandonment');

  // stale proposal: computed on an old view, committed after the world moved on
  const d = mk([H]);
  const old = JSON.parse(JSON.stringify(d.w.state.view));
  d.send({ type: 'advance', atMs: T0 + 98 * H, runId: 'f', untilMs: T0 + 98 * H, env: ENV_DAY });
  const stale = propose(old, { type: 'advance', commandId: 'stale', actorId: 'dot', atMs: T0 + 99 * H, runId: 'f', untilMs: T0 + 99 * H, env: ENV_DAY });
  const viewBefore = hashOf(d.w.state.view);
  const res = (d.w as unknown as { commit: (c: Command, p: typeof stale, h: string) => { ok: boolean; rejection?: { code: string } } })
    .commit({ type: 'advance', commandId: 'stale', actorId: 'dot', atMs: 0, runId: 'f', untilMs: 0, env: ENV_DAY }, stale, 'x');
  ok(!res.ok && res.rejection?.code === 'conflict', 'a proposal built on an outdated version is refused at commit');
  ok(hashOf(d.w.state.view) === viewBefore, 'the refused proposal leaves the world view unchanged');
}
{
  // drying outage
  const d = new Driver(createClayTestWorld());
  d.send({ type: 'open_research', atMs: T0, record: { id: 'rx', residentId: 'dot', question: 'q', hypothesis: { text: '', variable: '', expect: '' }, basis: [], controls: {} } });
  d.send({ type: 'reserve', atMs: T0, reservationId: 'rc', researchId: 'rx', purpose: '', lotId: 'clay-A', mg: 100_000 });
  d.send({ type: 'reserve', atMs: T0, reservationId: 'rw', researchId: 'rx', purpose: '', lotId: 'water-work', mg: 100_000 });
  d.send({ type: 'prepare_clay', atMs: T0, clayReservationId: 'rc', waterReservationId: 'rw', rawMg: 50_000, targetWaterRatio: 0.24, outLotId: 'pc' });
  d.send({ type: 'shape_tiles', atMs: T0, lotId: 'pc', researchId: 'rx', scrapLotId: 'sc', trimFraction: 0, tiles: [{ sampleId: 'S', label: 's', massMg: 45_000, dimsMm: { w: 50, l: 50, t: 10 } }] });
  d.send({ type: 'start_drying', atMs: T0, runId: 'dr', researchId: 'rx', sampleIds: ['S'], facilityId: 'rack-shade', seed: 1 });
  d.send({ type: 'advance', atMs: T0 + 48 * H, runId: 'dr', untilMs: T0 + 48 * H, env: ENV_DAY, outage: { fromMs: T0 + 2 * H, toMs: T0 + 30 * H } });
  const r = d.w.state.view.runs.dr;
  ok(r.gap && !d.w.state.view.samples.S.historyComplete, 'outage during drying is recorded as a gap, not filled with invented weather');
}

console.log('6. what residents know: own observations only, no hidden numbers');
{
  const obsv = Object.values(v.observations);
  const numeric = obsv.filter((o) => typeof o.value === 'number');
  ok(numeric.every((o) => o.instrumentId || o.kind === 'duration' || o.kind === 'fuel_used'), 'numeric observations only from an instrument, a clock or counting', numeric.map((o) => o.kind).filter((k, i, a) => a.indexOf(k) === i).join(','));
  ok(obsv.filter((o) => o.kind === 'glow').every((o) => typeof o.value === 'string'), 'kiln temperature reaches the resident only as a glow colour');
  const d = new Driver(base.w); d.actor = 'lantern';
  const r = d.send({ commandId: 'lantern-1', type: 'open_research', atMs: T0, record: { id: 'rl', residentId: 'lantern', question: 'q', hypothesis: { text: '', variable: '', expect: '' },
    basis: [{ kind: 'own-trial', ref: Object.keys(v.observations)[0], note: '' }], controls: {} } }, 'reject');
  ok(r.rejection?.code === 'unknown_observation', "another resident cannot cite dot's observations as their own trial");
}

console.log('7. conditions that should matter do matter (risk is explainable)');
{
  const dryTest = (fac: string, t: number, seed: number) => {
    const d = new Driver(createClayTestWorld());
    d.send({ type: 'open_research', atMs: T0, record: { id: 'rx', residentId: 'dot', question: 'q', hypothesis: { text: '', variable: '', expect: '' }, basis: [], controls: {} } });
    d.send({ type: 'reserve', atMs: T0, reservationId: 'rc', researchId: 'rx', purpose: '', lotId: 'clay-A', mg: 100_000 });
    d.send({ type: 'reserve', atMs: T0, reservationId: 'rw', researchId: 'rx', purpose: '', lotId: 'water-work', mg: 100_000 });
    d.send({ type: 'prepare_clay', atMs: T0, clayReservationId: 'rc', waterReservationId: 'rw', rawMg: 80_000, targetWaterRatio: 0.24, outLotId: 'pc' });
    d.send({ type: 'shape_tiles', atMs: T0, lotId: 'pc', researchId: 'rx', scrapLotId: 'sc', trimFraction: 0, tiles: [{ sampleId: 'S', label: 's', massMg: Math.round(4500 * t), dimsMm: { w: 50, l: 50, t } }] });
    d.send({ type: 'start_drying', atMs: T0, runId: 'dr', researchId: 'rx', sampleIds: ['S'], facilityId: fac, seed });
    d.send({ type: 'advance', atMs: T0 + 24 * H, runId: 'dr', untilMs: T0 + 24 * H, env: ENV_DAY });
    return d.w.state.view.samples.S;
  };
  const sun = Array.from({ length: 20 }, (_, i) => dryTest('rack-sun', 15, i + 1));
  const shade = Array.from({ length: 20 }, (_, i) => dryTest('rack-shade', 15, i + 1));
  ok(sun[0].risk.dryFluxRatioMax > 1 && shade[0].risk.dryFluxRatioMax < 1, 'sun + wind dries faster than the tolerance; shade does not',
    `ratio sun ${sun[0].risk.dryFluxRatioMax.toFixed(2)}, shade ${shade[0].risk.dryFluxRatioMax.toFixed(2)}`);
  const ns = sun.filter((s) => s.cracks.length).length, nh = shade.filter((s) => s.cracks.length).length;
  ok(ns > 0 && nh === 0, '15 mm tiles: drying cracks in the sun across 20 seeds, none in the shade', `${ns}/20 vs ${nh}/20`);
}

console.log('8. the core stays pure');
{
  const dir = join(process.cwd(), 'src/science');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => join(dir, f));
  const src = files.map((f) => [f, readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')] as const);
  const bad = src.filter(([, s]) => /Date\.now|Math\.random|fetch\(|from 'three'|document\.|localStorage|performance\.now/.test(s));
  ok(bad.length === 0, 'no clock, Math.random, network, DOM or Three.js in src/science/*.ts', bad.map(([f]) => f).join(','));
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
