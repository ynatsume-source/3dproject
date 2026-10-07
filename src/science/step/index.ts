// The science core's single entry point, as main has it (the science side's own index also lists processes main has not
// taken in: lime, firing, soak). Only processes listed here run; anything else fails, saying so.
import type { ScienceStep, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { dryingStep, DRYING_PROCESS } from './drying';
import { simpleFixtureStep, SIMPLE_FIXTURE_PROCESSES } from './simple';
import { woodFireStep, WOOD_FIRE_PROCESS } from './wood-fire';
import { contractExtras } from './common';
import { barometerStep, BAROMETER_PROCESS } from './barometer';
import { slakeStep, SLAKE_PROCESS } from './slake';
import { kneadStep, KNEAD_PROCESS } from './knead';
import { charcoalStep, CHARCOAL_PROCESS } from './charcoal';
import { leakTestStep, LEAK_TEST_PROCESS, tarSealStep, TAR_SEAL_PROCESS } from './vessel';
import { firewoodDryStep, FIREWOOD_DRY_PROCESS } from './firewood';
import { coconutBoilStep, coconutMilkStep, COCONUT_BOIL_PROCESS, COCONUT_MILK_PROCESS } from './coconut';

const PROCESSES: Record<string, ScienceStep> = {
  [DRYING_PROCESS.processId]: dryingStep,
  ...Object.fromEntries(SIMPLE_FIXTURE_PROCESSES.map((id) => [id, simpleFixtureStep])),
  [WOOD_FIRE_PROCESS.processId]: woodFireStep,         // contract 0.2.x only
  [BAROMETER_PROCESS.processId]: barometerStep,
  [SLAKE_PROCESS.processId]: slakeStep,
  [KNEAD_PROCESS.processId]: kneadStep,
  [COCONUT_MILK_PROCESS.processId]: coconutMilkStep,
  [COCONUT_BOIL_PROCESS.processId]: coconutBoilStep,   // contract 0.2.x only: the fire draws O2
  [CHARCOAL_PROCESS.processId]: charcoalStep,          // contract 0.2.x only
  [TAR_SEAL_PROCESS.processId]: tarSealStep,           // contract 0.2.x only (the warming fire)
  [LEAK_TEST_PROCESS.processId]: leakTestStep,
  [FIREWOOD_DRY_PROCESS.processId]: firewoodDryStep as ScienceStep, // contract 0.2.x only (rain on an open stack is drawn)
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
