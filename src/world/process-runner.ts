// The world's side of a science process (ADR 0002): the ledger of lots and equipment, reservations, the run's clock,
// the requests, and committing each result exactly once. Pure: no DOM, no storage, no clock of its own, no
// Math.random — the caller passes the time, the weather and the step, and saves the ledger as given (JSON). So the
// same code runs in the shared world's server when there is one, and in a headless check now.
//
// Each process runs on its own clock (ADR 0006 addendum, agreed with the science team): the hand-work processes
// (weighing, shaping) on the world's real clock; those that only wait (drying, firing, soaking, lime, the barometer)
// on the island's clock, ISLAND_RATE times as fast. A run's interval, its operator's action times and its weather's
// effectiveAt are all on that one clock; what the world shows (records, the journal) is turned back to real time.
import type { EnergyOffer, EnvironmentSample, EquipmentView, Id, LotView, Observation, OperatorAction, ScienceState,
  ScienceStep, ScienceStepRequest, ScienceStepResult } from './science-contract';
import { ISLAND_EPOCH as EPOCH, ISLAND_RATE } from './island-time';
import { validateResult } from '../science/step/validate';

export type ProcessClock = 'world' | 'island';
/** A real moment on a process's clock, and back. Integer ms. */
export const toClock = (clock: ProcessClock, realMs: number) => (clock === 'world' ? Math.floor(realMs) : Math.floor(EPOCH + (realMs - EPOCH) * ISLAND_RATE));
export const toReal = (clock: ProcessClock, ms: number) => (clock === 'world' ? ms : Math.round(EPOCH + (ms - EPOCH) / ISLAND_RATE));
/** Interval boundaries fall on 30 s marks of the process's clock (contract rule 4: exact for every process there). */
const MARK = 30_000;
const mark = (ms: number) => ms - (((ms % MARK) + MARK) % MARK);

export interface Run {
  runId: Id; processId: Id; processVersion: string; catalogVersion: string; contract: string; clock: ProcessClock;
  lotIds: Id[]; equipmentIds: Id[]; operator: Id; seed: number;
  lastTo: number;                     // on the run's clock: where the next interval starts
  attempt: number;
  state: ScienceState | null;
  status: ScienceStepResult['status'] | 'starting';
  observations: Observation[];        // what the operator could notice, in order (on the run's clock)
  why?: string;                       // why it failed or stopped
}
export interface Ledger {
  world: { worldId: Id; worldEpoch: Id; worldVersion: number };
  lots: Record<Id, LotView & { reservedBy?: Id }>;
  equipment: Record<Id, EquipmentView & { reservedBy?: Id }>;
  runs: Record<Id, Run>;
  committed: Id[];                    // requestIds already committed (the last few hundred: a resend is refused)
  seq: number;                        // for new ids
}
export const emptyLedger = (worldId: Id, worldEpoch: Id): Ledger => ({ world: { worldId, worldEpoch, worldVersion: 0 }, lots: {}, equipment: {}, runs: {}, committed: [], seq: 0 });

export function addLot(L: Ledger, lot: Omit<LotView, 'lotId'> & { lotId?: Id }): LotView {
  const l = { ...lot, lotId: lot.lotId ?? `lot:${++L.seq}` } as LotView; L.lots[l.lotId] = l; L.world.worldVersion++; return l;
}

export interface RunSpec {
  processId: Id; processVersion: string; catalogVersion: string; contract: string; clock: ProcessClock;
  lotIds: Id[]; equipmentIds: Id[]; operator: Id;
}
/** Start a run: its lots and equipment are reserved to it until it ends. Its first interval starts on the next 30 s
 *  mark of its clock. The seed is drawn from the world's own sequence (the same on every request of the run). */
export function startRun(L: Ledger, spec: RunSpec, realNow: number): { run?: Run; why?: string } {
  for (const id of spec.lotIds) { const l = L.lots[id]; if (!l) return { why: `no lot ${id}` }; if (l.reservedBy) return { why: `${id} is in use (${l.reservedBy})` }; }
  for (const id of spec.equipmentIds) { const e = L.equipment[id]; if (!e) return { why: `no equipment ${id}` }; if (e.reservedBy) return { why: `${id} is in use (${e.reservedBy})` }; }
  const runId = `run:${++L.seq}`, at = toClock(spec.clock, realNow);
  const run: Run = { ...spec, lotIds: [...spec.lotIds], equipmentIds: [...spec.equipmentIds], runId, seed: (L.seq * 2654435761) >>> 0, lastTo: mark(at) + MARK, attempt: 0, state: null, status: 'starting', observations: [] };
  for (const id of spec.lotIds) L.lots[id].reservedBy = runId;
  for (const id of spec.equipmentIds) L.equipment[id].reservedBy = runId;
  L.runs[runId] = run; L.world.worldVersion++;
  return { run };
}

export interface StepInput {
  realNow: number;                                             // how far to step: up to this real moment (its mark)
  environment: (fromOnClock: number) => EnvironmentSample;     // the weather for the interval (effectiveAt on the run's clock)
  energy?: (from: number, to: number) => EnergyOffer[];        // what the world can supply over the interval (on the run's clock)
  actions?: (Omit<OperatorAction, 'residentId'> & { residentId?: Id })[];   // at: on the run's clock, within the interval
  stop?: ScienceStepRequest['stop'];
  maxMs?: number;                                              // the longest interval to ask for at once (default a day)
}
/** The next request for a run, up to realNow (or null: nothing to ask yet, or the run has ended). */
export function nextRequest(L: Ledger, runId: Id, i: StepInput): ScienceStepRequest | null {
  const r = L.runs[runId]; if (!r || !['starting', 'running', 'needs-input'].includes(r.status)) return null;
  const to = Math.min(mark(toClock(r.clock, i.realNow)), r.lastTo + (i.maxMs ?? 86_400_000));
  if (to <= r.lastTo && !i.stop) return null;
  const from = r.lastTo, end = Math.max(to, from);
  return {
    contract: r.contract, requestId: `${r.runId}@${from}#${r.attempt}`, world: { ...L.world },
    runId: r.runId, processId: r.processId, processVersion: r.processVersion, catalogVersion: r.catalogVersion,
    interval: { from, to: end }, state: r.state, environment: i.environment(from),
    lots: r.lotIds.map((id) => { const { reservedBy: _, ...l } = L.lots[id]; return l; }),
    equipment: r.equipmentIds.map((id) => { const { reservedBy: _, ...e } = L.equipment[id]; return e; }),
    energy: i.energy?.(from, end) ?? [], actions: (i.actions ?? []).filter((a) => a.at >= from && a.at < end).map((a) => ({ ...a, residentId: a.residentId ?? r.operator })),
    ...(i.stop ? { stop: i.stop } : {}), seed: r.seed,
  };
}

export interface Committed { ok: boolean; why?: string; status?: Run['status']; produced?: LotView[]; observations?: Observation[] }
/** Commit one result: checked, then applied exactly once (by requestId) — the run's state and clock, and, when the run
 *  ends, the lots it used and made. A result that breaks the contract is refused and changes nothing; a failed
 *  process ends its run and frees what it held, with nothing consumed. */
export function commit(L: Ledger, req: ScienceStepRequest, res: ScienceStepResult): Committed {
  const r = L.runs[req.runId];
  if (!r) return { ok: false, why: 'no such run' };
  if (L.committed.includes(req.requestId)) return { ok: false, why: 'already committed' };
  if (req.interval.from !== r.lastTo) return { ok: false, why: 'not the run\'s next interval' };
  const problems = validateResult(req, res);
  if (problems.length) { r.attempt++; return { ok: false, why: `refused: ${problems.join('; ')}` }; }
  L.committed.push(req.requestId); if (L.committed.length > 500) L.committed.splice(0, L.committed.length - 500);
  L.world.worldVersion++;
  if (res.status === 'failed') { end(L, r, 'failed', String((res.diagnostics as any)?.code ?? (res.diagnostics as any)?.error ?? res.evidence?.notes ?? 'failed')); return { ok: true, status: 'failed' }; }
  r.state = res.state; r.lastTo = res.status === 'needs-input' || res.simulated.to <= req.interval.from ? req.interval.to : res.simulated.to;
  r.observations.push(...res.observations);
  const produced: LotView[] = [];
  if (res.status === 'completed' || res.status === 'stopped') {
    // (the run settles its lots when it ends: what it used goes, what it made is new — where the step says, or where
    // its first lot was)
    for (const c of res.consumed) { const l = L.lots[c.lotId]; l.amount = { ...l.amount, value: l.amount.value - c.amount.value }; if (l.amount.value <= 0) delete L.lots[c.lotId]; }
    const where = L.lots[r.lotIds[0]]?.location ?? req.lots[0]?.location ?? 'site:unknown';
    for (const p of res.produced) produced.push(addLot(L, { materialId: p.materialId, amount: { ...p.amount }, location: p.into ?? where, ...(p.quality ? { quality: { ...p.quality } } : {}) }));
    for (const id of r.equipmentIds) { const e = L.equipment[id], w = res.equipmentWear.find((x) => x.equipmentId === id); if (e && w) e.condition = Math.max(0, Math.min(1, e.condition + w.conditionDelta)); }
    end(L, r, res.status);
  } else r.status = res.status;
  return { ok: true, status: r.status, produced, observations: res.observations };
}
/** End a run without settling anything (its process version is gone, the world gave it up): what it held is free
 *  again, unconsumed (lots settle only when a run ends by the step's own word). */
export function abortRun(L: Ledger, runId: Id, why: string) { const r = L.runs[runId]; if (r && ['starting', 'running', 'needs-input'].includes(r.status)) { end(L, r, 'stopped', why); L.world.worldVersion++; } }
function end(L: Ledger, r: Run, status: Run['status'], why?: string) {
  r.status = status; if (why) r.why = why;
  for (const id of r.lotIds) if (L.lots[id]?.reservedBy === r.runId) delete L.lots[id].reservedBy;
  for (const id of r.equipmentIds) if (L.equipment[id]?.reservedBy === r.runId) delete L.equipment[id].reservedBy;
}

/** Step a run as far as realNow, interval by interval, committing each. Returns what was committed, in order. */
export function advance(L: Ledger, runId: Id, step: ScienceStep, i: StepInput): Committed[] {
  const out: Committed[] = [];
  for (let k = 0; k < 400; k++) {
    const req = nextRequest(L, runId, i); if (!req) break;
    const c = commit(L, req, step(req)); out.push(c);
    if (!c.ok || req.stop) break;
  }
  return out;
}
