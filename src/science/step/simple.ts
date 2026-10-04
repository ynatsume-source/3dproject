// Ported from codex/civilization-lab@13a35fa (src/science/step.ts) — shaping and weighing fixtures.
// Changes on porting: exported as simpleFixtureStep (the dispatcher in ./index.ts is the only entry point);
// produced quality key thicknessMm → thickness_mm (catalog quality keys are snake_case).
// fixture-2 (2026-10-03, world side's final review): one catalog with the other steps (civ-sci-test-2);
// a stop (operator / equipment-lost) ends the run even when the offered energy ran short (0.2.0 rule 7);
// p11x_test_tile_shape makes the test tile the drying step takes (prepared clay → test_tile_green).
import { SCIENCE_CONTRACT_VERSION } from '../../world/science-contract';
import type { ScienceStep, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { PROCESS } from './fixture-profile';
import { SPECIES } from '../chem';

export const FIXTURE_CATALOG_VERSION = 'civ-sci-test-2';   // the same catalog as step/common.ts SCIENCE_CATALOG_VERSION
export const FIXTURE_PROCESS_VERSION = 'fixture-2';
export const STATE_SCHEMA = 'civilization-simple-process/2';
type State = {
  runId: string; worldId: string; worldEpoch: string; processId: string;
  elapsedS: number; lastTo: number; operationalPause: boolean; completed: boolean; stopped: boolean;
  lotFingerprint: string; equipmentId: string; thicknessMm: number | null; tileMm: [number, number] | null; observer: string | null;
};
const int = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min;
const id = (s: unknown, prefix: string): s is string => typeof s === 'string' && s.startsWith(prefix) && s.length > prefix.length;
function need(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
function blank(req: ScienceStepRequest): ScienceStepResult {
  // echo the request's contract; a 0.2.x answer (refusals included) carries `drawn` (nothing is drawn here)
  return { ...(/^0\.2\.\d+$/.test(req.contract) ? { drawn: [] } : {}), contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: req.interval.from },
    state: req.state ?? { schema: STATE_SCHEMA, data: null }, status: 'failed',
    consumed: [], produced: [], released: [], energy: [], equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: 'simple-fixture-1', sourceRefs: ['openstax-heat', 'fixture-assumptions-1'],
      notes: 'Fixture only; geometry, duration and work are synthetic. Not a raw-world recipe.' } };
}
/** Minimal 0.1.0 adapter. Inventory, time, persistence and idempotent commit belong to the caller.
 * Drying stays in the lab until the host agrees how to update the composition of an in-process lot. */
export const SIMPLE_FIXTURE_PROCESSES = ['p11_pottery_shape', 'p11x_test_tile_shape', 'fixture_mass_measure'] as const;
/** Bulk density of shaped wet clay the tile mould accepts (g/cm³ = mg/mm³): assumed, a coarse sanity range only. */
export const TILE_DENSITY_MG_PER_MM3 = { min: 1.5, max: 2.3 } as const;
export const simpleFixtureStep: ScienceStep = req => {
  const result = blank(req);
  try {
    need(req.contract === SCIENCE_CONTRACT_VERSION && req.catalogVersion === FIXTURE_CATALOG_VERSION &&
      req.processVersion === FIXTURE_PROCESS_VERSION, 'unsupported-version');
    const tile = req.processId === 'p11x_test_tile_shape';
    const shape = req.processId === 'p11_pottery_shape' || tile, weigh = req.processId === 'fixture_mass_measure';
    need(shape || weigh, 'unsupported-process');
    need(req.environment.source === 'simulation' && req.environment.sampleId.startsWith('env:'), 'fixture-only');
    need(id(req.runId, 'run:') && typeof req.requestId === 'string' && req.requestId.length > 0 && int(req.seed), 'invalid-id-or-seed');
    need(typeof req.world.worldId === 'string' && req.world.worldId.length > 0 && typeof req.world.worldEpoch === 'string' && req.world.worldEpoch.length > 0 && int(req.world.worldVersion), 'invalid-world');
    need(req.stop === undefined || ['operator', 'world-pause', 'equipment-lost', 'shutdown'].includes(req.stop), 'invalid-stop');
    const { from, to } = req.interval;
    need(int(from) && int(to) && to >= from && from % 1000 === 0 && to % 1000 === 0 && to - from <= 86400000, 'unaligned-or-invalid-interval');
    const duration = shape ? PROCESS.shape.seconds : PROCESS.weigh.seconds;
    const power = shape ? PROCESS.shape.powerW : PROCESS.weigh.powerW;
    let state: State | null = null;
    if (req.state) {
      need(req.state.schema === STATE_SCHEMA, 'unsupported-schema');
      state = structuredClone(req.state.data) as State;
      need(state && state.runId === req.runId && state.processId === req.processId &&
        state.worldId === req.world.worldId && state.worldEpoch === req.world.worldEpoch, 'state-binding');
      need(int(state.elapsedS) && state.elapsedS <= duration && int(state.lastTo) &&
        typeof state.completed === 'boolean' && typeof state.stopped === 'boolean' && typeof state.operationalPause === 'boolean' &&
        typeof state.lotFingerprint === 'string' && id(state.equipmentId, 'eq:') &&
        (state.observer === null || id(state.observer, 'res:')) &&
        (shape ? int(state.thicknessMm, 1) && state.thicknessMm <= 20 : state.thicknessMm === null) &&
        (tile ? Array.isArray(state.tileMm) && state.tileMm.every(v => int(v, 1)) : state.tileMm === null), 'invalid-state');
      need(state.completed === (state.elapsedS === duration), 'invalid-state-progress');
      need(from === state.lastTo || (state.operationalPause && from >= state.lastTo), 'noncontiguous-interval');
      if (state.completed || state.stopped) {
        result.status = state.completed ? 'completed' : 'stopped'; return result;
      }
    }
    need(req.lots.length === 1, 'one-reserved-lot-required');
    const lot = req.lots[0];
    need(id(lot.lotId, 'lot:') && lot.amount.unit === 'mg' && int(lot.amount.value, 1) &&
      lot.amount.value <= 1e9 && typeof lot.location === 'string' && lot.location.length > 0, 'invalid-lot');
    need(Object.values(lot.quality ?? {}).every(v => typeof v === 'number' && Number.isFinite(v)), 'invalid-quality');
    if (shape) need(lot.materialId === 'prepared_clay', 'wrong-material');
    if (tile) {
      // the clay carries its make-up as the tile does: water_ppm of the whole lot, xd_<species>_ppm on the dry part
      const w = lot.quality?.water_ppm;
      need(typeof w === 'number' && int(w) && w < 1e6 && Object.keys(lot.quality!).some(k => /^xd_.+_ppm$/.test(k)), 'clay-make-up-missing');
      // the make-up the tile will carry: known dry species, whole non-negative ppm, together at most the dry part
      // (what is not listed counts as inert mineral)
      let sum = 0;
      for (const [k, v] of Object.entries(lot.quality!)) {
        const m = /^xd_(.+)_ppm$/.exec(k);
        if (!m) continue;
        need(Object.hasOwn(SPECIES, m[1]) && m[1] !== 'water', 'clay-make-up-unknown-species'); // registered species only (not inherited keys)
        need(int(v), 'clay-make-up-not-whole-ppm');
        sum += v;
      }
      need(sum > 0 && sum <= 1e6, 'clay-make-up-exceeds-dry-part');
    }
    need(req.equipment.length === 1, 'one-equipment-required');
    const equipment = req.equipment[0];
    need(id(equipment.equipmentId, 'eq:') && equipment.catalogVersion === FIXTURE_CATALOG_VERSION &&
      equipment.catalogEntry === (shape ? 'fixture_bench' : 'fixture_balance') &&
      equipment.kind === equipment.catalogEntry && equipment.condition === 1, 'uncalibrated-equipment');
    const thickness = shape ? equipment.params?.thicknessMm : null;
    if (shape) need(int(thickness, 1) && thickness <= 20, 'invalid-thickness');
    let tileMm: [number, number] | null = null;
    if (tile) {
      const wMm = equipment.params?.widthMm, lMm = equipment.params?.lengthMm;
      need(int(wMm, 1) && int(lMm, 1) && wMm <= 200 && lMm <= 200, 'invalid-mould');
      const density = lot.amount.value / (wMm * lMm * thickness!);
      need(density >= TILE_DENSITY_MG_PER_MM3.min && density <= TILE_DENSITY_MG_PER_MM3.max, 'mould-does-not-fit-the-clay');
      tileMm = [wMm, lMm];
    }
    // Canonical fingerprint prevents an accepted run from silently changing material or quantity.
    const fingerprint = JSON.stringify([lot.lotId, lot.materialId, lot.amount, lot.location,
      Object.entries(lot.quality ?? {}).sort(([a], [b]) => a.localeCompare(b))]);
    for (const action of req.actions) need(int(action.at) && action.at >= from && action.at < to && id(action.residentId, 'res:'), 'invalid-action');
    if (state) {
      need(state.lotFingerprint === fingerprint && state.equipmentId === equipment.equipmentId &&
        state.thicknessMm === thickness && JSON.stringify(state.tileMm) === JSON.stringify(tileMm), 'changed-input');
    } else {
      const observer = req.actions.find(a => a.action === 'read-balance')?.residentId ?? null;
      if (weigh) need(observer, 'measurement-not-requested');
      state = { runId: req.runId, processId: req.processId, worldId: req.world.worldId, worldEpoch: req.world.worldEpoch,
        elapsedS: 0, lastTo: from, operationalPause: false, completed: false, stopped: false,
        lotFingerprint: fingerprint, equipmentId: equipment.equipmentId, thicknessMm: thickness!, tileMm, observer };
    }
    need(req.energy.length === 1, 'one-energy-source-required');
    const supply = req.energy[0], kind = shape ? 'mechanical' : 'electric';
    need(id(supply.sourceId, 'src:') && supply.kind === kind && int(supply.maxJ), 'invalid-energy-offer');
    const seconds = Math.min((to - from) / 1000, duration - state.elapsedS, Math.floor(supply.maxJ / power));
    state.elapsedS += seconds; state.lastTo = from + seconds * 1000; state.operationalPause = false;
    result.simulated.to = state.lastTo;
    result.energy = [{ sourceId: supply.sourceId, kind, usedJ: seconds * power, lostJ: seconds * power, storedJ: 0 }];
    // In this fixture manual work and balance electricity ultimately dissipate; no free useful energy is exported.
    state.completed = state.elapsedS === duration;
    result.status = state.completed ? 'completed' : state.lastTo < to ? 'needs-input' : 'running';
    if (state.completed && tile) {
      const q = lot.quality!;
      result.consumed = [{ lotId: lot.lotId, amount: { ...lot.amount } }];
      result.produced = [{ materialId: 'test_tile_green', amount: { ...lot.amount }, into: lot.location,
        quality: { ...q, width_mm: state.tileMm![0], length_mm: state.tileMm![1], thickness_mm: state.thicknessMm!,
          shaped_water_ratio_ppm: Math.round(q.water_ppm * 1e6 / (1e6 - q.water_ppm)), linear_shrink_ppm: 0, crack: 0,
          history_complete: q.history_complete ?? 1 } }];
    } else if (state.completed && shape) {
      result.consumed = [{ lotId: lot.lotId, amount: { ...lot.amount } }];
      result.produced = [{ materialId: 'unfired_pot', amount: { ...lot.amount },
        quality: { ...lot.quality, thickness_mm: state.thicknessMm! }, into: lot.location }];
    } else if (state.completed && weigh) {
      result.observations = [{ at: state.lastTo, channel: `instrument:${equipment.equipmentId}`,
        quantity: 'mass', value: Math.round(lot.amount.value / PROCESS.weigh.resolutionMg) * PROCESS.weigh.resolutionMg,
        unit: 'mg', precision: PROCESS.weigh.resolutionMg }];
    }
    // stop is asked for at interval.to. An operational pause (world-pause / shutdown) keeps the run resumable from
    // where it got to; operator / equipment-lost end it there, even when the offered energy ran short (0.2.0 rule 7).
    if (req.stop && !state.completed) {
      if (req.stop === 'world-pause' || req.stop === 'shutdown') state.operationalPause = true;
      else { state.stopped = true; result.status = 'stopped'; }
    }
    result.state = { schema: STATE_SCHEMA, data: state };
    return result;
  } catch (error) {
    // Invalid input is atomic: do not return any partial flux or mutated scientific state.
    return { ...blank(req), diagnostics: { code: error instanceof Error ? error.message : 'invalid-request' } };
  }
};
