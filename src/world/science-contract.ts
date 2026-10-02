// The boundary between the shared world's authority (this app's server side) and the science core
// (materials processing, chemistry, heat, mechanical work, electricity, research), developed separately
// on codex/civilization-simulation. ADR 0002; the full notes are docs/proposals/civilization/SCIENCE_HANDOFF.md.
//
// Who owns what:
//   world  — the clock, the material lots and where they are, reservations, equipment (works and parts),
//            saving and recovery, events, the AI budget. It asks, checks, and commits exactly once.
//   science — a pure step: given the state of one process run over one interval of world time, it proposes
//            the next state, what was consumed and produced, the energy used and lost, what a resident could
//            observe, and the evidence. It keeps no clock, inventory, save, ledger, network or outside randomness.
//
// Types only: no behaviour in the app depends on this file yet. Changes go through a pull request to main,
// reviewed by the world side; bump SCIENCE_CONTRACT_VERSION on any change to a shape or a rule below.

export const SCIENCE_CONTRACT_VERSION = '0.1.0';

/** Stable ids. Catalog entries keep the catalog's own ids as they are (processes 'p20_lime_calcination',
 *  materials 'quicklime', capabilities…). Things that exist in the world carry a prefix by kind: 'lot:…',
 *  'eq:…' (a work or part acting as equipment), 'run:…', 'src:…' (an energy source), 'env:…' (an environment
 *  sample), 'res:…' (a resident). */
export type Id = string;

/** Amounts in the ledger are integers of the smallest unit of their dimension; never mix dimensions. */
export type Unit =
  | 'mg' | 'g' | 'kg'          // mass
  | 'mm' | 'cm' | 'm'          // length
  | 'mL' | 'L'                 // volume
  | 'count'                    // discrete pieces (one lot of identical items)
  | 'J' | 'kJ' | 'Wh';         // energy (heat, mechanical and electrical work are told apart by `kind`)
export interface Quantity { value: number; unit: Unit }   // value: an integer in that unit

/** A half-open interval of world time [from, to), in milliseconds since the Unix epoch (UTC). */
export interface Interval { from: number; to: number }

export interface WorldRef { worldId: Id; worldEpoch: Id; worldVersion: number }

/** The environment the world used for this interval, with where it came from (never invented). */
export interface EnvironmentSample {
  sampleId: Id;
  source: 'live' | 'simulation' | 'stale' | 'unknown';
  effectiveAt: number;
  airTempC?: number; humidity?: number; windMs?: number; rainMmH?: number; pressureHPa?: number;
}

/** A material lot reserved for this run: the only material the step may consume. */
export interface LotView {
  lotId: Id; materialId: Id; amount: Quantity;
  quality?: Record<string, number>;   // e.g. moisture, purity: defined per material in the catalog
  location: Id;                       // where it is (a site, a vessel, a resident's hands): the world's own id
}

/** A work (or a part of one) acting as equipment: kiln, crucible, bellows, coil… and its present condition. */
export interface EquipmentView {
  equipmentId: Id; kind: string; catalogEntry: Id; catalogVersion: string;
  condition: number;                  // 0..1, as the world last committed it
  params?: Record<string, number>;    // measured properties: volume, insulation, coil turns… (catalog units)
}

/** Energy the world can supply over the interval from one source (a fire, a resident's work, a stored charge). */
export interface EnergyOffer { sourceId: Id; kind: 'heat' | 'mechanical' | 'electric'; maxJ: number }

/** What the resident running the process did during the interval (from the world's executor). */
export interface OperatorAction { at: number; residentId: Id; action: string; params?: Record<string, number> }

/** The science side's own state for a run (temperatures, reaction progress, charge…): opaque to the world,
 *  which stores and restores it as given. The science side defines its schema and migrates old versions. */
export interface ScienceState { schema: string; data: unknown }

export interface ScienceStepRequest {
  contract: string;                   // SCIENCE_CONTRACT_VERSION the world speaks
  requestId: Id;                      // idempotency key: runId + interval.from + attempt; a resend gets the same result
  world: WorldRef;
  runId: Id; processId: Id; processVersion: string; catalogVersion: string;
  interval: Interval;
  state: ScienceState | null;         // null on the first step of a run
  environment: EnvironmentSample;
  lots: LotView[];
  equipment: EquipmentView[];
  energy: EnergyOffer[];
  actions: OperatorAction[];
  stop?: 'operator' | 'world-pause' | 'equipment-lost' | 'shutdown';   // the run is being interrupted at interval.to
  seed: number;                       // the only randomness: the world draws and stores it
}

/** Something a resident could notice, through a sense or an instrument they have: never the hidden truth. */
export interface Observation {
  at: number; channel: 'sight' | 'touch' | 'sound' | 'smell' | 'weight' | `instrument:${string}`;
  quantity?: string; value?: number; unit?: string; precision?: number;
  text?: string;                      // a short plain description for the world to show; never an instruction
}

export interface ScienceStepResult {
  contract: string;
  requestId: Id;                      // echoes the request
  runId: Id;
  simulated: Interval;                // what was actually simulated (shorter than asked if the run ended)
  state: ScienceState;                // the next state, to store
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'needs-input';
  consumed: { lotId: Id; amount: Quantity }[];                         // from the reserved lots only
  produced: { materialId: Id; amount: Quantity; quality?: Record<string, number>; into?: Id }[];
  released: { materialId: Id; amount: Quantity; to: 'air' | 'water' | 'ground' }[];   // gases, vapour, ash: balances must close
  energy: { sourceId: Id; kind: 'heat' | 'mechanical' | 'electric'; usedJ: number; lostJ: number; storedJ?: number }[];
  equipmentWear: { equipmentId: Id; conditionDelta: number }[];
  observations: Observation[];
  evidence: { evaluatorVersion: string; sourceRefs: Id[]; notes?: string };   // what the outcome rests on
  diagnostics?: unknown;              // for tests and the verification screen; never shown to residents
}

/** The one function the science core provides (pure and deterministic for a given request). */
export type ScienceStep = (req: ScienceStepRequest) => ScienceStepResult;

/* Temperature and power are state, never inventory: they live in ScienceState and observations, not in lots.
 * Energy is accounted in J over the interval actually run (1 Wh = 3600 J). The existing robots' battery (0..1,
 * no Wh capacity) is legacy / sealed_bootstrap: never converted into an EnergyOffer.
 *
 * Rules both sides keep (the world checks these before committing; a failing result is rejected, not patched):
 *  1. consumed ⊆ the reserved lots, never more than their amount; units as the lot's.
 *  2. Mass closes per run step: Σconsumed = Σproduced + Σreleased within the catalog's stated tolerance.
 *  3. Energy closes: for each source, usedJ ≤ maxJ; usedJ = (stored change) + lostJ + (work done).
 *  4. Interval additivity: stepping [a,b) then [b,c) gives the same outcome as [a,c) within tolerance,
 *     so a pause, a restart or a resend never changes the result.
 *  5. The same request gives the same result (no clock, no Math.random: use `seed`).
 *  6. Unknown processVersion, catalogVersion, state schema or contract major version: return 'failed'
 *     with a diagnostic, never guess.
 *  7. The world commits a result once (by requestId) in one transaction with the lot, energy and event changes;
 *     a world-side shutdown is an operational pause, not a failed experiment.
 */
