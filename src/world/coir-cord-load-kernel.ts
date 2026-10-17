import type { LotView, ScienceStepResult } from './science-contract';
import { createIntegerCordDamageModel, type CordDamageEvent } from '../science/prototypes/coir-cord-damage';
import {
  COIR_CORD_ASSUMPTION_ID, cordCanonical as canonical, cordInteger as uint,
  cordId as id, cordShape as shape,
} from '../science/prototypes/coir-cord-types';
import { readCordPiece, readCordHistory, writeCordPiece } from './coir-cord-lots';

export type CordHostEvent =
  | { kind: 'load'; gf: number; breakAtMm?: number }
  | { kind: 'abrasion'; count: number }
  | { kind: 'exposure'; fromIslandMs: number; toIslandMs: number; shade: boolean };

export interface CordLoadRequest {
  commandId: string;
  assumptionId: string;
  lotId: string;
  worldAtMs: number;
  islandAtMs: number;
  event: CordHostEvent;
}
export interface CordLoadResult {
  runId: string;
  lotIds: string[];
  observations: string[];
}
export type CordLoadCode =
  | 'invalid-request' | 'missing-material' | 'material-in-use' | 'out-of-order-event'
  | 'conflicting-replay' | 'corrupt-save' | 'event-refused'
  | 'unsupported-load-schema' | 'expired-command';

export class CordLoadError extends Error {
  constructor(readonly code: CordLoadCode) {
    super('The cord event could not be applied.');
    this.name = 'CordLoadError';
  }
}
export function need(value: unknown, code: CordLoadCode): asserts value {
  if (!value) throw new CordLoadError(code);
}
export const clone = <T>(value: T): T => structuredClone(value);
export function plain(lot: LotView & { reservedBy?: string }): LotView {
  const { reservedBy: _, ...value } = lot;
  return clone(value);
}
export const substance = (lot: LotView): string =>
  canonical([lot.materialId, lot.amount, lot.quality]);

export function validateRequest(q: CordLoadRequest): void {
  need(shape(q, ['commandId', 'assumptionId', 'lotId', 'worldAtMs', 'islandAtMs', 'event'])
    && id(q.commandId) && q.assumptionId === COIR_CORD_ASSUMPTION_ID
    && id(q.lotId) && uint(q.worldAtMs) && uint(q.islandAtMs), 'invalid-request');
  const event = q.event;
  need(event && typeof event === 'object' && !Array.isArray(event), 'invalid-request');
  if (event.kind === 'load') {
    need(shape(event, ['kind', 'gf', ...(event.breakAtMm === undefined ? [] : ['breakAtMm'])])
      && uint(event.gf) && (event.breakAtMm === undefined || uint(event.breakAtMm, 1)),
      'invalid-request');
  } else if (event.kind === 'abrasion') {
    need(shape(event, ['kind', 'count']) && uint(event.count), 'invalid-request');
  } else {
    need(event.kind === 'exposure' && shape(event, ['kind', 'fromIslandMs', 'toIslandMs', 'shade'])
      && uint(event.fromIslandMs) && uint(event.toIslandMs)
      && event.toIslandMs > event.fromIslandMs && event.toIslandMs <= q.islandAtMs
      && typeof event.shade === 'boolean', 'invalid-request');
  }
}

/** Shared unchanged integer physics for legacy migration and new transactions. */
export function evaluate(
  source: LotView,
  q: CordLoadRequest,
  worldId: string,
  worldEpoch: string,
  runId: string,
) {
  const event = q.event;
  const model = createIntegerCordDamageModel(readCordPiece(source), q.assumptionId, {
    worldId, worldEpoch, runId,
    openedAtWorldMs: q.worldAtMs,
    openedAtIslandMs: event.kind === 'exposure' ? event.fromIslandMs : q.islandAtMs,
  });
  const common = { eventId: q.commandId, worldId, worldEpoch, runId };
  const receipt: CordDamageEvent = event.kind === 'exposure'
    ? { ...common, ...clone(event), clock: 'island', atMs: event.toIslandMs }
    : { ...common, ...clone(event), clock: 'world', atMs: q.worldAtMs };
  const state = model.commit(model.start(), receipt);
  const projected = model.project(state);
  const produced: ScienceStepResult['produced'] = projected.pieces.map(piece =>
    writeCordPiece(piece, source.location, readCordHistory(source)));
  return { state, produced, observations: model.observe(state) };
}
