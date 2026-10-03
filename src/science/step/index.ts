// The science core's single entry point for the world: ScienceStep (src/world/science-contract.ts).
// Only processes listed here are executable; everything else in the catalog is concept-only and fails.

import type { ScienceStep, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { dryingStep, DRYING_PROCESS } from './drying';
import { simpleFixtureStep, SIMPLE_FIXTURE_PROCESSES } from './simple';
import { calcineStep, CALCINE_PROCESS, hydrateStep, HYDRATE_PROCESS } from './lime';
import { firingStep, FIRING_PROCESS } from './firing';
import { soakStep, SOAK_PROCESS } from './soak';
import { woodFireStep, WOOD_FIRE_PROCESS } from './wood-fire';
import { contractExtras } from './common';

const PROCESSES: Record<string, ScienceStep> = {
  [DRYING_PROCESS.processId]: dryingStep,
  ...Object.fromEntries(SIMPLE_FIXTURE_PROCESSES.map((id) => [id, simpleFixtureStep])),
  [CALCINE_PROCESS.processId]: calcineStep,
  [HYDRATE_PROCESS.processId]: hydrateStep,
  [FIRING_PROCESS.processId]: firingStep,
  [SOAK_PROCESS.processId]: soakStep,
  [WOOD_FIRE_PROCESS.processId]: woodFireStep,   // contract 0.2.x (proposed): returns `drawn`
};

export const scienceStep: ScienceStep = (req: ScienceStepRequest): ScienceStepResult => {
  const impl = PROCESSES[req.processId];
  if (impl) return impl(req);
  return {
    ...contractExtras(req),
    contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: req.interval.from },
    state: req.state ?? { schema: 'none', data: null }, status: 'failed',
    consumed: [], produced: [], released: [], energy: [], equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: 'none', sourceRefs: [], notes: `process ${req.processId} is not executable (concept-only or not implemented)` },
    diagnostics: { error: `process ${req.processId} is not executable` },
  };
};

export const EXECUTABLE_PROCESSES = Object.keys(PROCESSES);
