import type { Ledger, Run } from './process-runner';
import type { Observation } from './science-contract';

/** Bookkeeping only. Physics, lots, reservations and the world's ID sequence do
 * not depend on how many old records remain in this window. */
export const SCIENCE_RECORDS_SCHEMA = 'civ-world.science-records/1' as const;
export const SCIENCE_RECORD_LIMITS = Object.freeze({
  finished: 64,
  observations: 64,
  finishedObservations: 8,
  committed: 500,
  released: 300
});

export interface ScienceRunSummary {
  runId: string;
  processId: string;
  processVersion: string;
  catalogVersion: string;
  contract: string;
  clock: Run['clock'];
  lotIds: string[];
  equipmentIds: string[];
  operator: string;
  lastTo: number;
  status: 'completed' | 'stopped' | 'failed';
  observations: Observation[];
  why?: string;
}

export interface ScienceRecords {
  schema: typeof SCIENCE_RECORDS_SCHEMA;
  worldId: string;
  worldEpoch: string;
  finished: ScienceRunSummary[];
}

const terminal = (status: string): status is ScienceRunSummary['status'] =>
  status === 'completed' || status === 'stopped' || status === 'failed';
const uint = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const id = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function requireRecords(ok: unknown): asserts ok {
  if (!ok) throw Error('science records: corrupt-or-unsupported-records');
}

function keys(value: Record<string, unknown>, wanted: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...wanted].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function validObservation(value: unknown): value is Observation {
  if (!record(value) || !uint(value.at) || !id(value.channel)) return false;
  if (!['sight', 'touch', 'sound', 'smell', 'weight'].includes(value.channel)
    && !(value.channel.startsWith('instrument:') && value.channel.length > 11)) return false;
  if (Object.keys(value).some(key =>
    !['at', 'channel', 'quantity', 'value', 'unit', 'precision', 'text'].includes(key))) return false;
  for (const key of ['quantity', 'unit', 'text']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return false;
  }
  for (const key of ['value', 'precision']) {
    if (value[key] !== undefined
      && (typeof value[key] !== 'number' || !Number.isFinite(value[key]))) return false;
  }
  return true;
}

function summaryOk(value: unknown): value is ScienceRunSummary {
  if (!record(value) || !keys(value, [
    'runId', 'processId', 'processVersion', 'catalogVersion', 'contract', 'clock',
    'lotIds', 'equipmentIds', 'operator', 'lastTo', 'status', 'observations',
    ...(value.why === undefined ? [] : ['why'])
  ])) return false;
  return [value.runId, value.processId, value.processVersion, value.catalogVersion,
    value.contract, value.operator].every(id)
    && ['world', 'island'].includes(String(value.clock))
    && uint(value.lastTo) && terminal(String(value.status))
    && Array.isArray(value.lotIds) && value.lotIds.every(id)
    && Array.isArray(value.equipmentIds) && value.equipmentIds.every(id)
    && (value.why === undefined || typeof value.why === 'string')
    && Array.isArray(value.observations)
    && value.observations.length <= SCIENCE_RECORD_LIMITS.finishedObservations
    && value.observations.every(validObservation);
}

function recordsOf(L: Ledger): ScienceRecords {
  requireRecords(L && record(L.world) && id(L.world.worldId) && id(L.world.worldEpoch));
  const value = L.scienceRecords;
  if (value === undefined) {
    return {
      schema: SCIENCE_RECORDS_SCHEMA,
      worldId: L.world.worldId,
      worldEpoch: L.world.worldEpoch,
      finished: []
    };
  }
  requireRecords(record(value)
    && keys(value as unknown as Record<string, unknown>, [
      'schema', 'worldId', 'worldEpoch', 'finished'
    ])
    && value.schema === SCIENCE_RECORDS_SCHEMA
    && value.worldId === L.world.worldId && value.worldEpoch === L.world.worldEpoch
    && Array.isArray(value.finished)
    && value.finished.length <= SCIENCE_RECORD_LIMITS.finished
    && value.finished.every(summaryOk)
    && new Set(value.finished.map(summary => summary.runId)).size === value.finished.length);
  return value;
}

function summarise(run: Run): ScienceRunSummary {
  requireRecords(terminal(run.status)
    && [run.runId, run.processId, run.processVersion, run.catalogVersion,
      run.contract, run.operator].every(id)
    && ['world', 'island'].includes(run.clock) && uint(run.lastTo)
    && Array.isArray(run.lotIds) && run.lotIds.every(id)
    && Array.isArray(run.equipmentIds) && run.equipmentIds.every(id)
    && Array.isArray(run.observations) && run.observations.every(validObservation)
    && (run.why === undefined || typeof run.why === 'string'));
  return {
    runId: run.runId,
    processId: run.processId,
    processVersion: run.processVersion,
    catalogVersion: run.catalogVersion,
    contract: run.contract,
    clock: run.clock,
    lotIds: [...run.lotIds],
    equipmentIds: [...run.equipmentIds],
    operator: run.operator,
    lastTo: run.lastTo,
    status: run.status,
    observations: structuredClone(run.observations.slice(
      -SCIENCE_RECORD_LIMITS.finishedObservations
    )),
    ...(run.why === undefined ? {} : { why: run.why })
  };
}

/** Validate the bounded record envelope before a mutation. It does not scan
 * active science states or every old request at each process step. */
export function ensureScienceRecords(L: Ledger): void {
  recordsOf(L);
}

/** Owner adapters call this after constructing their own terminal projections.
 * This helper intentionally does not retain the run's state, inputs or seed. */
export function archiveScienceRun(L: Ledger, runId: string): ScienceRunSummary {
  const records = recordsOf(L);
  const run = L.runs[runId];
  if (!run) {
    const previous = records.finished.find(summary => summary.runId === runId);
    requireRecords(previous);
    return structuredClone(previous);
  }
  const summary = summarise(run);
  const finished = records.finished.filter(previous => previous.runId !== runId);
  finished.push(summary);
  L.scienceRecords = {
    ...records,
    finished: finished.slice(-SCIENCE_RECORD_LIMITS.finished)
  };
  delete L.runs[runId];
  return structuredClone(summary);
}

export function recentScienceRuns(L: Ledger): ScienceRunSummary[] {
  return structuredClone(recordsOf(L).finished);
}

export function readScienceRunSummary(
  L: Ledger,
  runId: string
): ScienceRunSummary | undefined {
  const summary = recordsOf(L).finished.find(value => value.runId === runId);
  return summary === undefined ? undefined : structuredClone(summary);
}

/** In-place migration of the previous unversioned bookkeeping. Prototype
 * owners first migrate their own richer states; they retire their runs only
 * after preserving required material provenance and terminal projections.
 * This function never advances a clock, consumes a lot, settles twice or
 * changes the ID sequence. Repeated migration is harmless. */
export function compactScienceLedger(L: Ledger): Ledger {
  const records = recordsOf(L);
  requireRecords(record(L.runs) && Array.isArray(L.committed)
    && L.committed.every(id)
    && (L.released === undefined || Array.isArray(L.released)));
  const runs = Object.values(L.runs);
  for (const run of runs) {
    requireRecords(record(run) && Array.isArray(run.observations)
      && run.observations.every(validObservation));
  }
  // Validate every legacy summary before altering the ledger.
  const ended = runs.filter(run =>
    !run.processId.startsWith('prototype_') && terminal(run.status)
  );
  const summaries = ended.map(summarise);
  const finished = [
    ...records.finished.filter(previous =>
      !summaries.some(summary => summary.runId === previous.runId)),
    ...summaries
  ].slice(-SCIENCE_RECORD_LIMITS.finished);
  L.scienceRecords = { ...records, finished };
  for (const run of runs) {
    run.observations = run.observations.slice(-SCIENCE_RECORD_LIMITS.observations);
  }
  for (const run of ended) {
    // These were settled before the old save. Only stale reservations owned by
    // that already-ended run can be released; material amounts remain untouched.
    for (const lotId of run.lotIds) {
      if (L.lots[lotId]?.reservedBy === run.runId) delete L.lots[lotId].reservedBy;
    }
    for (const equipmentId of run.equipmentIds) {
      if (L.equipment[equipmentId]?.reservedBy === run.runId) {
        delete L.equipment[equipmentId].reservedBy;
      }
    }
    delete L.runs[run.runId];
  }
  L.committed = L.committed.slice(-SCIENCE_RECORD_LIMITS.committed);
  if (L.released) L.released = L.released.slice(-SCIENCE_RECORD_LIMITS.released);
  return L;
}
