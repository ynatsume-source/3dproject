// The science core's single entry point for the world: ScienceStep (src/world/science-contract.ts).
// Only processes listed here are executable; everything else in the catalog is concept-only and fails.

import type { ScienceStep, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { dryingStep, DRYING_PROCESS } from './drying';
import { simpleFixtureStep, SIMPLE_FIXTURE_PROCESSES } from './simple';

const PROCESSES: Record<string, ScienceStep> = {
  [DRYING_PROCESS.processId]: dryingStep,
  ...Object.fromEntries(SIMPLE_FIXTURE_PROCESSES.map((id) => [id, simpleFixtureStep])),
};

export const scienceStep: ScienceStep = (req: ScienceStepRequest): ScienceStepResult => {
  const impl = PROCESSES[req.processId];
  if (impl) return impl(req);
  return {
    contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: req.interval.from },
    state: req.state ?? { schema: 'none', data: null }, status: 'failed',
    consumed: [], produced: [], released: [], energy: [], equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: 'none', sourceRefs: [], notes: `process ${req.processId} is not executable (concept-only or not implemented)` },
    diagnostics: { error: `process ${req.processId} is not executable` },
  };
};

export const EXECUTABLE_PROCESSES = Object.keys(PROCESSES);
