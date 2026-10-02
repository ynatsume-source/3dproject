// Ported from codex/civilization-lab@13a35fa (src/science/step.ts) — shaping and weighing fixtures.
// Changes on porting: exported as simpleFixtureStep (the dispatcher in ./index.ts is the only entry point);
// produced quality key thicknessMm → thickness_mm (catalog quality keys are snake_case).
import { SCIENCE_CONTRACT_VERSION } from '../../world/science-contract';
import type { ScienceStep, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { PROCESS } from './fixture-profile';

export const FIXTURE_CATALOG_VERSION = 'civilization-fixture-1';
export const FIXTURE_PROCESS_VERSION = 'fixture-1';
export const STATE_SCHEMA = 'civilization-simple-process/1';
type State = {
  runId: string; worldId: string; worldEpoch: string; processId: string;
  elapsedS: number; lastTo: number; operationalPause: boolean; completed: boolean; stopped: boolean;
  lotFingerprint: string; equipmentId: string; thicknessMm: number | null; observer: string | null;
};
const int = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min;
const id = (s: unknown, prefix: string): s is string => typeof s === 'string' && s.startsWith(prefix) && s.length > prefix.length;
function need(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
function blank(req: ScienceStepRequest): ScienceStepResult {
  return { contract: SCIENCE_CONTRACT_VERSION, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: req.interval.from },
    state: req.state ?? { schema: STATE_SCHEMA, data: null }, status: 'failed',
    consumed: [], produced: [], released: [], energy: [], equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: 'simple-fixture-1', sourceRefs: ['openstax-heat', 'fixture-assumptions-1'],
      notes: 'Fixture only; geometry, duration and work are synthetic. Not a raw-world recipe.' } };
}
/** Minimal 0.1.0 adapter. Inventory, time, persistence and idempotent commit belong to the caller.
 * Drying stays in the lab until the host agrees how to update the composition of an in-process lot. */
export const SIMPLE_FIXTURE_PROCESSES = ['p11_pottery_shape', 'fixture_mass_measure'] as const;
export const simpleFixtureStep: ScienceStep = req => {
  const result = blank(req);
  try {
    need(req.contract === SCIENCE_CONTRACT_VERSION && req.catalogVersion === FIXTURE_CATALOG_VERSION &&
      req.processVersion === FIXTURE_PROCESS_VERSION, 'unsupported-version');
    const shape = req.processId === 'p11_pottery_shape', weigh = req.processId === 'fixture_mass_measure';
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
        (shape ? int(state.thicknessMm, 1) && state.thicknessMm <= 20 : state.thicknessMm === null), 'invalid-state');
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
    need(req.equipment.length === 1, 'one-equipment-required');
    const equipment = req.equipment[0];
    need(id(equipment.equipmentId, 'eq:') && equipment.catalogVersion === FIXTURE_CATALOG_VERSION &&
      equipment.catalogEntry === (shape ? 'fixture_bench' : 'fixture_balance') &&
      equipment.kind === equipment.catalogEntry && equipment.condition === 1, 'uncalibrated-equipment');
    const thickness = shape ? equipment.params?.thicknessMm : null;
    if (shape) need(int(thickness, 1) && thickness <= 20, 'invalid-thickness');
    // Canonical fingerprint prevents an accepted run from silently changing material or quantity.
    const fingerprint = JSON.stringify([lot.lotId, lot.materialId, lot.amount, lot.location,
      Object.entries(lot.quality ?? {}).sort(([a], [b]) => a.localeCompare(b))]);
    for (const action of req.actions) need(int(action.at) && action.at >= from && action.at < to && id(action.residentId, 'res:'), 'invalid-action');
    if (state) {
      need(state.lotFingerprint === fingerprint && state.equipmentId === equipment.equipmentId &&
        state.thicknessMm === thickness, 'changed-input');
    } else {
      const observer = req.actions.find(a => a.action === 'read-balance')?.residentId ?? null;
      if (weigh) need(observer, 'measurement-not-requested');
      state = { runId: req.runId, processId: req.processId, worldId: req.world.worldId, worldEpoch: req.world.worldEpoch,
        elapsedS: 0, lastTo: from, operationalPause: false, completed: false, stopped: false,
        lotFingerprint: fingerprint, equipmentId: equipment.equipmentId, thicknessMm: thickness!, observer };
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
    if (state.completed && shape) {
      result.consumed = [{ lotId: lot.lotId, amount: { ...lot.amount } }];
      result.produced = [{ materialId: 'unfired_pot', amount: { ...lot.amount },
        quality: { ...lot.quality, thickness_mm: state.thicknessMm! }, into: lot.location }];
    } else if (state.completed && weigh) {
      result.observations = [{ at: state.lastTo, channel: `instrument:${equipment.equipmentId}`,
        quantity: 'mass', value: Math.round(lot.amount.value / PROCESS.weigh.resolutionMg) * PROCESS.weigh.resolutionMg,
        unit: 'mg', precision: PROCESS.weigh.resolutionMg }];
    }
    // stop applies at interval.to, never at its beginning and never before a partial energy-limited step.
    if (req.stop && state.lastTo === to && !state.completed) {
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
