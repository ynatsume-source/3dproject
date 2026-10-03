/** Executable fixture profiles. These do NOT promote the inherited concept catalog. */
export const MODEL_VERSION = 'clay-fixture-v1';
export const PROCESS = {
  shape: { id: 'fixture.clay.shape.v1', candidateId: 'p11_pottery_shape', seconds: 60, powerW: 2 },
  dry: { id: 'fixture.clay.dry.v1', candidateId: 'p12_pottery_dry', targetC: 60 },
  weigh: { id: 'fixture.mass.measure.v1', candidateId: null, seconds: 10, powerW: 1, resolutionMg: 100 },
} as const;
export type ProcessId = typeof PROCESS[keyof typeof PROCESS]['id'];
export const PHYSICS = {
  ambientC: 20,
  waterSpecificHeatJPerKgK: 4186, // OpenStax m42224; constant-c approximation.
  latentHeatJPerKg: 2_340_000, // m42229, 60 °C coffee evaporation exercise; approximate water value.
  solidSpecificHeatJPerKgK: 800, // Synthetic fixture assumption, NOT calibrated clay data.
  dryerEfficiency: 0.8, // Synthetic source-to-sample efficiency; loss goes to surroundings.
  coolingW: 10, // Synthetic piecewise constant cooling, capped at ambient.
  baseEvaporationMgPerS: 10, // Synthetic mass-transfer limit at 5 mm; not a drying law.
} as const;
