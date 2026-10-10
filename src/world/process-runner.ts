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
  equipment: Record<Id, EquipmentView & { reservedBy?: Id; assembled?: Assembled }>;
  runs: Record<Id, Run>;
  committed: Id[];                    // requestIds already committed (the last few hundred: a resend is refused)
  released?: Released[];             // what runs let go out of the world's lots — water spilled on the ground, smoke to the air (the last few hundred)
  seq: number;                        // for new ids
}
export interface Released { runId: Id; processId: Id; at: number; materialId: Id; mg: number; to: 'air' | 'water' | 'ground' }
export const emptyLedger = (worldId: Id, worldEpoch: Id): Ledger => ({ world: { worldId, worldEpoch, worldVersion: 0 }, lots: {}, equipment: {}, runs: {}, committed: [], seq: 0 });

export function addLot(L: Ledger, lot: Omit<LotView, 'lotId'> & { lotId?: Id }): LotView {
  const l = { ...lot, lotId: lot.lotId ?? `lot:${++L.seq}` } as LotView; L.lots[l.lotId] = l; L.world.worldVersion++; return l;
}

/* ---------- assembly: a lot made into equipment, and back (ADR 0006 addendum: main assembles, science gives the table) ---------- */

/** What an assembled piece of equipment keeps: the lot it was made from (as it was), and the table's version. */
export interface Assembled { from: LotView; table: string; at: number; parts?: LotView[] }   // (parts: made from several lots — all of them, in the table's role order; from is the first)
/** The science side's table for one kind of equipment (e.g. vessel.ts: assembled_pot, civ-sci.pot-assembly/1). */
export interface AssemblyTable {
  version: string; kind: Id; catalogEntry: Id; catalogVersion: string;
  materials: Id[];                                            // the lots it can be made from
  toParams(lot: LotView): Record<string, number>;
  qualityOnReturn(copy: Record<string, number>, condition: number): Record<string, number>;
  brokenMaterial?: Id;                                        // what a broken one becomes (pot_sherds)
  brokenQuality?(copy: Record<string, number>): Record<string, number>;   // and its quality, from the copy (potSherdsQuality)
}

/** Make a whole lot into equipment. The lot leaves the shelf; the equipment keeps a copy of it (its mass stays in the
 *  world). Refused for a lot in use, or of a material the table does not take. */
export function assemble(L: Ledger, lotId: Id, T: AssemblyTable, realNow: number): { equipment?: EquipmentView; why?: string } {
  const lot = L.lots[lotId];
  if (!lot) return { why: `no lot ${lotId}` };
  if (lot.reservedBy) return { why: `${lotId} is in use (${lot.reservedBy})` };
  if (!T.materials.includes(lot.materialId)) return { why: `${lot.materialId} cannot be made into ${T.kind}` };
  let params: Record<string, number>;
  try { params = T.toParams(lot); } catch (e) { return { why: (e as Error).message }; }
  const { reservedBy: _, ...copy } = lot;
  const equipmentId = `eq:${++L.seq}`;
  L.equipment[equipmentId] = { equipmentId, kind: T.kind, catalogEntry: T.catalogEntry, catalogVersion: T.catalogVersion, condition: 1, params,
    assembled: { from: JSON.parse(JSON.stringify(copy)), table: T.version, at: realNow } };
  delete L.lots[lotId];
  L.world.worldVersion++;
  return { equipment: L.equipment[equipmentId] };
}

/** Take assembled equipment apart: it goes back to a lot (a new lotId) of the material it was made from, with the
 *  quality the table gives for its condition (worn: the seal no longer known, the wear kept as a crack). A broken one
 *  (condition 0) becomes a lot of the table's broken material instead, of the same mass, with the quality the table
 *  gives it from the copy (the body's own: its absorption, the tar it had, the water in its walls). */
export function disassemble(L: Ledger, equipmentId: Id, T: AssemblyTable): { lot?: LotView; why?: string } {
  const e = L.equipment[equipmentId];
  if (!e) return { why: `no equipment ${equipmentId}` };
  if (!e.assembled) return { why: `${equipmentId} was not assembled from a lot` };
  if (e.assembled.parts) return { why: `${equipmentId} is made of ${e.assembled.parts.length} lots (disassembleParts)` };
  if (e.reservedBy) return { why: `${equipmentId} is in use (${e.reservedBy})` };
  const from = e.assembled.from;
  let lot: LotView;
  if (e.condition <= 0) {
    if (!T.brokenMaterial) return { why: `nothing to make of a broken ${e.kind}` };
    let quality: Record<string, number> | undefined;
    try { quality = T.brokenQuality?.({ ...(from.quality ?? {}) }); } catch (err) { return { why: (err as Error).message }; }
    lot = addLot(L, { materialId: T.brokenMaterial, amount: { ...from.amount }, ...(quality ? { quality } : {}), location: from.location });
  } else {
    let quality: Record<string, number>;
    try { quality = T.qualityOnReturn({ ...(from.quality ?? {}) }, e.condition); } catch (err) { return { why: (err as Error).message }; }
    lot = addLot(L, { materialId: from.materialId, amount: { ...from.amount }, quality, location: from.location });
  }
  delete L.equipment[equipmentId];
  L.world.worldVersion++;
  return { lot };
}

/* ---------- several lots made into one piece (a tar retort: an upper and a lower pot) ---------- */

/** The science side's table for equipment made from several lots, one for each role (e.g. fired-pot-assembly.ts:
 *  tar_retort from the upper and the lower pot). How it goes back is the table's: one lot for each part, of the same
 *  amount as its copy (retortPartsOnReturn: the wear is the upper pot's). */
export interface PartsAssemblyTable {
  version: string; kind: Id; catalogEntry: Id; catalogVersion: string;
  roles: string[];                                            // what each lot is, in order (upper, lower)
  materials: Id[];                                            // the lots it can be made from
  toParams(lots: LotView[]): Record<string, number>;
  partsOnReturn(copies: Record<string, number>[], condition: number): { materialId: Id; quality: Record<string, number> }[];
}

/** Make several whole lots, one for each of the table's roles in order, into one piece of equipment. The lots leave the
 *  shelf; the equipment keeps a copy of each. Refused for a missing or repeated lot, one in use, or one of a material
 *  the table does not take; nothing changes then. */
export function assembleParts(L: Ledger, lotIds: Id[], T: PartsAssemblyTable, realNow: number): { equipment?: EquipmentView; why?: string } {
  if (lotIds.length !== T.roles.length) return { why: `${T.kind} is made of ${T.roles.length} lots (${T.roles.join(', ')})` };
  if (new Set(lotIds).size !== lotIds.length) return { why: 'the same lot twice' };
  const lots: (LotView & { reservedBy?: Id })[] = [];
  for (const id of lotIds) {
    const lot = L.lots[id];
    if (!lot) return { why: `no lot ${id}` };
    if (lot.reservedBy) return { why: `${id} is in use (${lot.reservedBy})` };
    if (!T.materials.includes(lot.materialId)) return { why: `${lot.materialId} cannot be made into ${T.kind}` };
    lots.push(lot);
  }
  let params: Record<string, number>;
  try { params = T.toParams(lots); } catch (e) { return { why: (e as Error).message }; }
  const parts = lots.map((l) => { const { reservedBy: _, ...copy } = l; return JSON.parse(JSON.stringify(copy)) as LotView; });
  const equipmentId = `eq:${++L.seq}`;
  L.equipment[equipmentId] = { equipmentId, kind: T.kind, catalogEntry: T.catalogEntry, catalogVersion: T.catalogVersion, condition: 1, params,
    assembled: { from: parts[0], parts, table: T.version, at: realNow } };
  for (const id of lotIds) delete L.lots[id];
  L.world.worldVersion++;
  return { equipment: L.equipment[equipmentId] };
}

/** Take equipment made of several lots apart: one lot (a new lotId) for each part, of its copy's amount and where it was,
 *  with what the table says it became for the equipment's condition. Nothing changes if the table's answer does not
 *  match the parts. */
//  The table answers for ordinary use only (the wear the upper pot's; science, 2026-10-08). What else befalls a part — it
//  is dropped, or itself breaks — is the world's: `broken` names those parts, and each comes back as the one-lot table's
//  broken material (sherds, with what that table keeps of the body), of its own copy's amount. A piece lost whole (washed
//  away) is loseEquipment's.
export function disassembleParts(L: Ledger, equipmentId: Id, T: PartsAssemblyTable, broken?: { parts: number[]; as: AssemblyTable }): { lots?: LotView[]; why?: string } {
  const e = L.equipment[equipmentId];
  if (!e) return { why: `no equipment ${equipmentId}` };
  const parts = e.assembled?.parts;
  if (!parts) return { why: `${equipmentId} was not made of several lots` };
  if (e.reservedBy) return { why: `${equipmentId} is in use (${e.reservedBy})` };
  if (broken && (!broken.as.brokenMaterial || broken.parts.some((i) => !Number.isInteger(i) || i < 0 || i >= parts.length))) return { why: 'no broken material, or no such part' };
  let back: { materialId: Id; quality: Record<string, number> }[];
  try { back = T.partsOnReturn(parts.map((p) => ({ ...(p.quality ?? {}) })), e.condition); } catch (err) { return { why: (err as Error).message }; }   // (asked once, for all the parts)
  if (!Array.isArray(back) || back.length !== parts.length || back.some((b) => !b || typeof b.materialId !== 'string')) return { why: `the table gave ${back?.length ?? 0} parts back for ${parts.length}` };
  if (broken) for (const i of broken.parts) {
    let q: Record<string, number> | undefined;
    try { q = broken.as.brokenQuality?.({ ...(parts[i].quality ?? {}) }); } catch (err) { return { why: (err as Error).message }; }
    back[i] = { materialId: broken.as.brokenMaterial!, quality: q ?? {} };
  }
  const lots = back.map((b, i) => addLot(L, { materialId: b.materialId, amount: { ...parts[i].amount }, quality: { ...b.quality }, location: parts[i].location }));   // (each part its own amount, on its own side)
  delete L.equipment[equipmentId];
  L.world.worldVersion++;
  return { lots };
}

/** A piece of equipment lost whole (washed away in a flood, gone with all its parts): a run using it is told so
 *  (stop: equipment-lost — the step settles what it can) and the equipment is gone; nothing comes back. */
export function loseEquipment(L: Ledger, equipmentId: Id, step: ScienceStep | null, i: StepInput | null): { committed: Committed[]; why?: string } {
  const e = L.equipment[equipmentId];
  if (!e) return { committed: [], why: `no equipment ${equipmentId}` };
  let committed: Committed[] = [];
  const runId = e.reservedBy;
  if (runId) {
    if (step && i) committed = advance(L, runId, step, { ...i, stop: 'equipment-lost' });
    if (L.runs[runId] && ['starting', 'running', 'needs-input'].includes(L.runs[runId].status)) abortRun(L, runId, `${equipmentId} was lost`);   // (the step would not settle it: freed, unconsumed)
  }
  delete L.equipment[equipmentId];
  L.world.worldVersion++;
  return { committed };
}

/** After loading: equipment assembled under another version of its table gets its params again from the lot it was
 *  made from (a run using it was already stopped with the process versions). Returns the ids worked out again. */
export function refreshAssembled(L: Ledger, T: AssemblyTable): Id[] {
  const out: Id[] = [];
  for (const e of Object.values(L.equipment)) {
    if (!e.assembled || e.assembled.parts || e.kind !== T.kind || e.assembled.table === T.version || e.reservedBy) continue;
    try { e.params = T.toParams(e.assembled.from); e.assembled.table = T.version; e.catalogVersion = T.catalogVersion; out.push(e.equipmentId); } catch { /* (kept as it was; the table no longer takes it) */ }
  }
  if (out.length) L.world.worldVersion++;
  return out;
}
/** The same, for equipment made of several lots. */
export function refreshAssembledParts(L: Ledger, T: PartsAssemblyTable): Id[] {
  const out: Id[] = [];
  for (const e of Object.values(L.equipment)) {
    const parts = e.assembled?.parts;
    if (!parts || e.kind !== T.kind || e.assembled!.table === T.version || e.reservedBy) continue;
    try { e.params = T.toParams(parts); e.assembled!.table = T.version; e.catalogVersion = T.catalogVersion; out.push(e.equipmentId); } catch { /* (kept as it was) */ }
  }
  if (out.length) L.world.worldVersion++;
  return out;
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

export interface Committed { ok: boolean; why?: string; status?: Run['status']; produced?: LotView[]; observations?: Observation[]; diagnostics?: Record<string, unknown> }   // (diagnostics: the world's own numbers, never told to a resident)
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
    // (and what it let go is booked where it went: the barometer's spilled water to the ground — science final review
    // 2026-10-10-barometer; it leaves the lots, it is not lost from the accounts)
    for (const x of res.released ?? []) (L.released ??= []).push({ runId: r.runId, processId: r.processId, at: res.simulated.to, materialId: x.materialId, mg: x.amount.value, to: x.to });
    if ((L.released?.length ?? 0) > 300) L.released!.splice(0, L.released!.length - 300);
    const where = L.lots[r.lotIds[0]]?.location ?? req.lots[0]?.location ?? 'site:unknown';
    for (const p of res.produced) produced.push(addLot(L, { materialId: p.materialId, amount: { ...p.amount }, location: p.into ?? where, ...(p.quality ? { quality: { ...p.quality } } : {}) }));
    for (const id of r.equipmentIds) { const e = L.equipment[id], w = res.equipmentWear.find((x) => x.equipmentId === id); if (e && w) e.condition = Math.max(0, Math.min(1, e.condition + w.conditionDelta)); }
    end(L, r, res.status);
  } else r.status = res.status;
  return { ok: true, status: r.status, produced, observations: res.observations, diagnostics: res.diagnostics as Record<string, unknown> | undefined };
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
