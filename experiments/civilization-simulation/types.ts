import type { ProcessId } from '../../src/science/fixture-profile.ts';
export type FixtureOptions = {
  dryerEnergyJ?: number;
  dryerPowerW?: number;
  dryerMaxTemperatureC?: number;
  workEnergyJ?: number;
  balanceEnergyJ?: number;
};
export type MaterialLot = {
  id: string;
  solidMg: number;
  waterMg: number;
  temperatureC: number;
  form: 'prepared-clay' | 'coupon';
  thicknessMm: number | null;
  location: 'storage' | 'equipment';
  revision: number;
  origin: string;
  history: string[];
  reservedBy: string | null;
};
export type Equipment = {
  id: string;
  processId: ProcessId;
  revision: number;
  available: boolean;
  reservedBy: string | null;
  energyJ: number;
  initialEnergyJ: number;
  maxPowerW: number;
  maxTemperatureC: number;
};
export type ProcessRun = {
  id: string;
  processId: ProcessId;
  modelVersion: string;
  lotId: string;
  equipmentId: string;
  equipmentRevision: number;
  status: 'running' | 'completed' | 'failed';
  stage: 'work' | 'heating' | 'evaporating' | 'cooling' | 'finished';
  startedAtMs: number;
  endedAtMs: number | null;
  elapsedS: number;
  activeS: number;
  durationLimitS: number;
  thicknessMm: number | null;
  failure: string | null;
  inputJ: number;
  wasteHeatJ: number;
  vaporEnthalpyJ: number;
  coolingHeatJ: number;
  vaporMg: number;
};
export type Observation = {
  runId: string;
  lotId: string;
  worldTime: number;
  instrumentId: string;
  measuredMassMg: number;
  resolutionMg: number;
};
export type CommandEnvelope = {
  commandId: string;
  worldId: string;
  worldEpoch: string;
  expectedVersion: number;
};
export type Action =
  | { kind: 'start'; processId: string; lotId: string; equipmentId: string;
      expectedLotRevision: number; expectedEquipmentRevision: number;
      thicknessMm?: number; durationLimitS?: number }
  | { kind: 'advance'; seconds: number }
  | { kind: 'cancel'; runId: string }
  | { kind: 'pause' | 'resume' };
export type Command = CommandEnvelope & Action;
export type WorldEvent = {
  eventId: string; worldId: string; worldEpoch: string; worldVersion: number;
  worldTime: number; commandId: string; catalogVersion: string; type: string;
  subjectIds: string[]; payload: Record<string, unknown>;
};
export type World = {
  scope: 'test-fixture'; modelVersion: string; worldId: string; worldEpoch: string;
  worldVersion: number; worldTime: number; paused: boolean;
  options: Required<FixtureOptions>;
  lots: Record<string, MaterialLot>; equipment: Record<string, Equipment>;
  runs: Record<string, ProcessRun>; observations: Observation[]; events: WorldEvent[];
  commands: Command[]; initialSolidMg: number; initialWaterMg: number;
};
