import type { Ledger, Run } from './process-runner';
import type { LotView } from './science-contract';
import {
  cordCanonical as canonical, cordInteger as uint, cordId as id, cordShape as shape,
} from '../science/prototypes/coir-cord-types';
import {
  CordLoadError, evaluate, need, substance, validateRequest, type CordLoadRequest,
} from './coir-cord-load-kernel';

export const LEGACY_CORD_LOAD_LEDGER_SCHEMA = 'civ-world.coir-cord-load-ledger/3';
export interface LegacyRecord {
  request: CordLoadRequest;
  source: LotView;
  runId: string;
  lotIds: string[];
}
export interface LegacyCordLoadStore {
  schema: string;
  worldId: string;
  worldEpoch: string;
  records: LegacyRecord[];
}
interface Tracked {
  lot: LotView;
  cursor: { worldAtMs: number; islandAtMs: number };
}
type Evaluation = ReturnType<typeof evaluate>;

function chronology(q: CordLoadRequest, previous?: Tracked): void {
  if (!previous) return;
  need(q.worldAtMs >= previous.cursor.worldAtMs
    && q.islandAtMs >= previous.cursor.islandAtMs, 'corrupt-save');
  if (q.event.kind === 'exposure') {
    need(q.event.fromIslandMs >= previous.cursor.islandAtMs, 'corrupt-save');
  }
}
function validateRun(r: Run | undefined, x: LegacyRecord, s: Evaluation): void {
  const q = x.request;
  need(r && r.runId === x.runId && r.processId === 'prototype_coir_cord_load'
    && r.processVersion === 'host-3' && r.catalogVersion === 'civ-sci-test-2'
    && r.contract === '0.2.1' && r.clock === 'world' && r.status === 'completed'
    && r.lastTo === q.worldAtMs && r.operator === 'world:coir-cord-load'
    && canonical(r.lotIds) === canonical([q.lotId])
    && Array.isArray(r.equipmentIds) && r.equipmentIds.length === 0
    && canonical(r.state) === canonical({
      schema: 'civ-world.coir-cord-load/3',
      data: { request: q, source: x.source, damage: s.state, outputLotIds: x.lotIds },
    })
    && canonical(r.observations) === canonical(s.observations.map(text =>
      ({ at: q.worldAtMs, channel: 'sight', text }))), 'corrupt-save');
}

/** Fixed host-3/run-3 validation, used once before installing checkpoints.
 * Never mutate a legacy ledger or reinterpret it under the current save schema.
 */
export function readLegacyCordLoads(
  L: Ledger & { coirCordLoads?: unknown },
): { events: Array<{ record: LegacyRecord; evaluation: Evaluation }>; runIds: string[] } {
  try {
    need(L && L.world && id(L.world.worldId) && id(L.world.worldEpoch)
      && uint(L.seq) && L.runs && !Array.isArray(L.runs)
      && L.lots && !Array.isArray(L.lots) && Array.isArray(L.committed), 'corrupt-save');
    const saved = L.coirCordLoads as LegacyCordLoadStore;
    need(saved && saved.schema === LEGACY_CORD_LOAD_LEDGER_SCHEMA, 'unsupported-load-schema');
    need(shape(saved, ['schema', 'worldId', 'worldEpoch', 'records'])
      && saved.worldId === L.world.worldId && saved.worldEpoch === L.world.worldEpoch
      && Array.isArray(saved.records), 'corrupt-save');
    const tracked = new Map<string, Tracked>();
    const commands = new Set<string>();
    const used = new Set<string>();
    const retired = new Set<string>();
    const runs = new Set<string>();
    const events: Array<{ record: LegacyRecord; evaluation: Evaluation }> = [];
    for (const x of saved.records) {
      need(shape(x, ['request', 'source', 'runId', 'lotIds'])
        && id(x.runId) && Array.isArray(x.lotIds), 'corrupt-save');
      validateRequest(x.request);
      const q = x.request;
      need(!commands.has(q.commandId) && !retired.has(q.lotId) && !runs.has(x.runId),
        'corrupt-save');
      commands.add(q.commandId);
      used.add(q.lotId);
      runs.add(x.runId);
      need(shape(x.source, ['lotId', 'materialId', 'amount', 'quality', 'location'])
        && x.source.lotId === q.lotId && id(x.source.location), 'corrupt-save');
      const previous = tracked.get(q.lotId);
      if (previous) need(substance(previous.lot) === substance(x.source), 'corrupt-save');
      chronology(q, previous);
      const evaluation = evaluate(x.source, q, saved.worldId, saved.worldEpoch, x.runId);
      need(x.lotIds.length === evaluation.produced.length
        && new Set(x.lotIds).size === x.lotIds.length, 'corrupt-save');
      const intact = evaluation.produced.length === 1;
      need(intact ? x.lotIds[0] === q.lotId : evaluation.produced.length === 2, 'corrupt-save');
      validateRun(L.runs[x.runId], x, evaluation);
      if (!intact) {
        retired.add(q.lotId);
        tracked.delete(q.lotId);
      }
      evaluation.produced.forEach((p, i) => {
        const lotId = x.lotIds[i];
        need(id(lotId) && (intact ? lotId === q.lotId : !used.has(lotId)), 'corrupt-save');
        used.add(lotId);
        tracked.set(lotId, {
          lot: {
            lotId, materialId: p.materialId, amount: structuredClone(p.amount),
            quality: structuredClone(p.quality), location: p.into!,
          },
          cursor: { worldAtMs: q.worldAtMs, islandAtMs: q.islandAtMs },
        });
      });
      events.push({ record: x, evaluation });
    }
    for (const lotId of retired) need(!L.lots[lotId], 'corrupt-save');
    for (const [lotId, latest] of tracked) {
      const live = L.lots[lotId];
      if (live) need(substance(live) === substance(latest.lot), 'corrupt-save');
    }
    need(Object.values(L.runs).filter(r => r.processId === 'prototype_coir_cord_load').length
      === runs.size, 'corrupt-save');
    return { events, runIds: [...runs] };
  } catch (error) {
    if (error instanceof CordLoadError && error.code === 'unsupported-load-schema') throw error;
    throw new CordLoadError('corrupt-save');
  }
}
