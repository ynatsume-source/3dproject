// State and command shapes for the science core (contract draft "civ-sci/0.1").
//
// The core never owns the world: the adapter passes a WorldView in and receives a Proposal
// (entity puts with expected versions + append-only ledger entries). The adapter commits a
// proposal once, atomically, and dedupes by commandId. Time, environment and random seeds
// come in with the command; the core has no clock, no Math.random and no network.

import type { Composition } from './chem';

export const CONTRACT_VERSION = 'civ-sci/0.1';

export interface Provenance {
  kind: 'test-fixture' | 'world' | 'legacy';
  note: string;
  /** false for fixtures: never counted toward the raw-material "first light" achievement. */
  countsForWorldAchievement: boolean;
}

export type LotKind = 'clay' | 'water' | 'fuel' | 'clay_scrap' | 'ash' | 'slurry' | 'shards';

export interface MaterialLot {
  id: string;
  kind: LotKind;
  label: string;
  comp: Composition;           // integer mg by species
  location: string;
  provenance: Provenance;
  /** Life/recovery reserve: research may not reserve it. */
  protected: boolean;
  /** A countable unit a resident perceives (e.g. one bundle of firewood), in mg. */
  unitMg?: number;
  unitLabel?: string;
  version: number;
}

export interface Crack {
  mechanism: 'drying' | 'steam' | 'dunting';
  severity: 'hairline' | 'through';
  runId: string;
  /** risk ratio (exposure / tolerance) and the probability used for the draw */
  ratio: number;
  p: number;
  visibleDry: boolean;
}

export type SampleStage = 'formed' | 'leather' | 'dry' | 'fired' | 'broken' | 'slaked';

export interface Sample {
  id: string;
  label: string;
  researchId: string;
  comp: Composition;
  /** water/dry-solids ratio at shaping; drives shrinkage */
  shapedWaterRatio: number;
  greenDimsMm: { w: number; l: number; t: number };
  linearShrink: number;
  stage: SampleStage;
  location: string;
  maxWareTempC: number;
  /** sintering progress 0..1 (not a species: a microstructure state) */
  sinter: number;
  /** dehydroxylation fraction is derived from comp; cached for reports */
  dehydrox: number;
  deformed: boolean;
  cracks: Crack[];
  /** risk exposure carried while a run is active */
  risk: { dryFluxRatioMax: number; steamRatioMax: number; duntRatioMax: number };
  /** true while every interval of its history was simulated; false after an operational gap */
  historyComplete: boolean;
  history: { runId: string; process: string; atMs: number; summary: string }[];
  version: number;
}

export type FacilityKind = 'drying_shade' | 'drying_sun' | 'open_fire' | 'kiln' | 'soak_basin' | 'balance';

export interface ThermalSpec {
  heatCapJPerK: number;
  uaWPerK: number;
  chamberFraction: number;
  maxBurnKgPerH: number;
  forcedCoolingUaFactor: number;
}

export interface Facility {
  id: string;
  kind: FacilityKind;
  label: string;
  /** a Work that physically exists now; a plan or a destroyed one is false */
  exists: boolean;
  condition: 'ok' | 'damaged';
  occupiedBy: string | null;
  capacitySamples: number;
  provenance: Provenance;
  thermal?: ThermalSpec;
  instrument?: { resolutionMg: number };
  version: number;
}

export interface Reservation {
  id: string;
  researchId: string;
  purpose: string;
  lotId: string;
  mg: number;
  consumedMg: number;
  open: boolean;
  version: number;
}

export interface EnvSample {
  id: string;
  source: 'test-fixture' | 'observed' | 'forecast' | 'simulation';
  airTempC: number;
  rh: number;          // 0..1
  windMs: number;
  solar: number;       // 0..1, fraction of clear-sky sun on the rack
}

/**
 * What a resident without a thermometer can actually control: how fast to feed the fire,
 * which glow colour to aim for, how long to keep it, and whether to open up while cooling.
 */
export interface FiringPlan {
  pace: 'slow' | 'normal' | 'fast';
  targetGlow: GlowTarget;
  holdMin: number;
  cooling: 'natural' | 'forced';
}
export type GlowTarget = 'dull_red' | 'cherry' | 'orange' | 'yellow';

/** World-side control law derived from a FiringPlan (the resident never sees these numbers). */
export interface FiringSchedule {
  rampKPerH: number;
  peakC: number;
  holdMin: number;
  cooling: 'natural' | 'forced';
}

export interface Checkpoint { tMin: number; kilnC: number; wareC: number; burnKgPerH: number; waterRatio?: number }

export interface EnergyAccount {
  /** all J. released = flue + wall + wareSensible + reactionsNet + structureStored (closes each step) */
  releasedJ: number;
  flueLossJ: number;
  wallLossJ: number;
  wareSensibleJ: number;
  reactionsNetJ: number;
  structureStoredJ: number;
  /** drying: heat drawn from the surrounding air to evaporate water */
  envHeatInJ: number;
}

export type RunKind = 'drying' | 'firing' | 'soak';
export type RunStatus = 'active' | 'completed' | 'halted_operational' | 'abandoned';

export interface ProcessRun {
  id: string;
  kind: RunKind;
  processId: string;
  processVersion: number;
  status: RunStatus;
  researchId: string;
  actorId: string;
  facilityId: string;
  sampleIds: string[];
  seed: number;
  startMs: number;
  lastMs: number;
  stepS: number;
  stepIndex: number;
  envIds: string[];
  // firing
  plan?: FiringPlan;
  schedule?: FiringSchedule;
  fuelReservationId?: string;
  fuelBurnedMg?: number;
  kilnC?: number;
  ambientC?: number;
  wareC?: Record<string, number>;
  /** per sample: composition when firing started + cumulative reaction extents (0..1, floats) */
  ware?: Record<string, { base: Composition; ext: { water: number; organic: number; dehydrox: number; calc: number } }>;
  /** everything taken from the fuel lot so far (integer mg) and what this run has already emitted */
  fuelBurnedComp?: Composition;
  emitted?: { out: Composition; in: Composition };
  phase?: 'ramp' | 'hold' | 'cool' | 'done';
  holdStartStep?: number;
  peakKilnC?: number;
  ashLotId?: string;
  // soak
  waterReservationId?: string;
  balanceId?: string;
  measuredDryMg?: number;
  durationS?: number;
  energy: EnergyAccount;
  checkpoints: Checkpoint[];
  outcome?: string;
  gap?: { fromMs: number; toMs: number };
  version: number;
}

export interface Observation {
  id: string;
  residentId: string;
  atMs: number;
  sampleId?: string;
  runId?: string;
  kind: 'visual' | 'tap' | 'glow' | 'fuel_used' | 'dryness' | 'mass' | 'absorption' | 'soak_look' | 'slaked' | 'duration';
  value: string | number;
  unit?: string;
  instrumentId?: string;
  resolution?: number;
  text: string;
}

export interface BoundaryFlow {
  id: string;
  runId: string;
  atMs: number;
  direction: 'out' | 'in';
  medium: 'atmosphere';
  comp: Composition;
  note: string;
}

export interface EnergyEntry {
  id: string;
  runId: string;
  fromMs: number;
  toMs: number;
  kind: 'heat';
  source: string;
  account: EnergyAccount;
}

export interface WorldEvent {
  id: string;
  commandId: string;
  atMs: number;
  type: string;
  subjectIds: string[];
  summary: string;
}

export interface ResearchTrial {
  sampleId: string;
  condition: Record<string, string | number>;
  runIds: string[];
  observationIds: string[];
}

export interface ResearchRecord {
  id: string;
  residentId: string;
  question: string;
  hypothesis: { text: string; variable: string; expect: string };
  /** where the idea came from — kept separate from what was tried on the island */
  basis: { kind: 'prior-knowledge' | 'own-trial' | 'told-by'; ref: string; note: string }[];
  controls: Record<string, string | number>;
  trials: ResearchTrial[];
  status: 'open' | 'concluded';
  conclusion?: { verdict: 'supported' | 'not-supported' | 'inconclusive'; text: string; observationIds: string[] };
  next?: string;
  version: number;
}

export interface LearnedProcedure {
  id: string;
  residentId: string;
  goal: string;
  steps: Record<string, string | number>;
  scope: { clayLotIds: string[]; facilityIds: string[]; thicknessMm: number[] };
  evidence: { researchId: string; sampleId: string; ok: boolean }[];
  /** 'tried' after one success; 'reproduced' after successes in two separate runs */
  status: 'tried' | 'reproduced';
  unknowns: string[];
  version: number;
}

export interface WorldView {
  lots: Record<string, MaterialLot>;
  samples: Record<string, Sample>;
  facilities: Record<string, Facility>;
  reservations: Record<string, Reservation>;
  runs: Record<string, ProcessRun>;
  observations: Record<string, Observation>;
  research: Record<string, ResearchRecord>;
  procedures: Record<string, LearnedProcedure>;
}

// ---- commands --------------------------------------------------------------------------

interface CmdBase { commandId: string; atMs: number; actorId: string }

export type Command =
  | (CmdBase & { type: 'reserve'; reservationId: string; researchId: string; purpose: string; lotId: string; mg: number })
  | (CmdBase & { type: 'release'; reservationId: string })
  | (CmdBase & { type: 'prepare_clay'; clayReservationId: string; waterReservationId: string; rawMg: number;
      targetWaterRatio: number; outLotId: string })
  | (CmdBase & { type: 'shape_tiles'; lotId: string; researchId: string; scrapLotId: string;
      tiles: { sampleId: string; label: string; massMg: number; dimsMm: { w: number; l: number; t: number } }[];
      trimFraction: number })
  | (CmdBase & { type: 'start_drying'; runId: string; researchId: string; sampleIds: string[]; facilityId: string; seed: number })
  | (CmdBase & { type: 'finish_drying'; runId: string })
  | (CmdBase & { type: 'start_firing'; runId: string; researchId: string; sampleIds: string[]; facilityId: string;
      fuelReservationId: string; plan: FiringPlan; seed: number; env: EnvSample; ashLotId: string })
  | (CmdBase & { type: 'start_soak'; runId: string; researchId: string; sampleId: string; facilityId: string;
      waterReservationId: string; balanceId?: string; seed: number; slurryLotId: string })
  | (CmdBase & { type: 'advance'; runId: string; untilMs: number; env: EnvSample;
      outage?: { fromMs: number; toMs: number } })
  | (CmdBase & { type: 'resolve_halt'; runId: string; decision: 'abandon' })
  | (CmdBase & { type: 'inspect'; sampleId: string; seed: number })
  | (CmdBase & { type: 'open_research'; record: Omit<ResearchRecord, 'version' | 'status' | 'trials'> & { trials?: ResearchTrial[] } })
  | (CmdBase & { type: 'add_trial'; researchId: string; trial: ResearchTrial })
  | (CmdBase & { type: 'conclude_research'; researchId: string;
      conclusion: NonNullable<ResearchRecord['conclusion']>; next?: string;
      procedure?: Omit<LearnedProcedure, 'version' | 'status' | 'evidence' | 'residentId'> & { evidence: LearnedProcedure['evidence'] } });

export interface Put<T> { entity: T; expectVersion: number | null }

export interface Proposal {
  ok: boolean;
  rejection?: { code: string; detail: string };
  lots: Put<MaterialLot>[];
  samples: Put<Sample>[];
  facilities: Put<Facility>[];
  reservations: Put<Reservation>[];
  runs: Put<ProcessRun>[];
  research: Put<ResearchRecord>[];
  procedures: Put<LearnedProcedure>[];
  boundary: BoundaryFlow[];
  energy: EnergyEntry[];
  observations: Observation[];
  events: WorldEvent[];
  /** parameter ids and source cards the result depended on */
  evidence: { params: string[]; note: string }[];
}

export function emptyProposal(): Proposal {
  return { ok: true, lots: [], samples: [], facilities: [], reservations: [], runs: [], research: [], procedures: [],
    boundary: [], energy: [], observations: [], events: [], evidence: [] };
}

export function reject(code: string, detail: string): Proposal {
  return { ...emptyProposal(), ok: false, rejection: { code, detail } };
}
