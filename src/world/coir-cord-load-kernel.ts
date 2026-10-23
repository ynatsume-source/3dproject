import type { CoirPiece } from '../science/prototypes/coir-cord-types';
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
  | { kind: 'exposure'; fromIslandMs: number; toIslandMs: number; shade: boolean }
  | {
    kind: 'voyage-summary';
    sunMs: number;
    shadeMs: number;
    abrasions: number;
    maxLoadGf: number;
    sourceFingerprint: number;
    resultFingerprint: number;
    break?: { gf: number; breakAtMm?: number };
  };

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
  } else if (event.kind === 'voyage-summary') {
    need(shape(event, ['kind', 'sunMs', 'shadeMs', 'abrasions', 'maxLoadGf',
      'sourceFingerprint', 'resultFingerprint', ...(event.break === undefined ? [] : ['break'])])
      && [event.sunMs, event.shadeMs, event.abrasions, event.maxLoadGf,
        event.sourceFingerprint, event.resultFingerprint].every(n => uint(n))
      && BigInt(event.sunMs) + BigInt(event.shadeMs) <= BigInt(q.islandAtMs),
      'invalid-request');
    if (event.break !== undefined) {
      need(shape(event.break, ['gf', ...(event.break.breakAtMm === undefined
        ? [] : ['breakAtMm'])])
        && uint(event.break.gf) && event.break.gf <= event.maxLoadGf
        && (event.break.breakAtMm === undefined || uint(event.break.breakAtMm, 1)),
        'invalid-request');
    }
  } else {
    need(event.kind === 'exposure' && shape(event, ['kind', 'fromIslandMs', 'toIslandMs', 'shade'])
      && uint(event.fromIslandMs) && uint(event.toIslandMs)
      && event.toIslandMs > event.fromIslandMs && event.toIslandMs <= q.islandAtMs
      && typeof event.shade === 'boolean', 'invalid-request');
  }
}


/** Small accidental-corruption fingerprint; not a signature or an authorization boundary. */
export function cordPiecesFingerprint(pieces: CoirPiece[]): number {
  const text = canonical(pieces.map(p => ({
    material: p.material, lengthMm: p.lengthMm,
    fiberDryMg: p.fiberDryMg, pithDryMg: p.pithDryMg, waterMg: p.waterMg,
    baseStrengthGf: p.baseStrengthGf, damage: p.damage,
    inheritedWear: p.inheritedWear ?? { faded: false, abraded: false },
  })));
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return hash;
}

function evaluateVoyageSummary(
  source: LotView, q: CordLoadRequest, worldId: string, worldEpoch: string, runId: string,
) {
  const e = q.event;
  need(e.kind === 'voyage-summary', 'invalid-request');
  const piece = readCordPiece(source);
  need(e.sourceFingerprint === cordPiecesFingerprint([piece]), 'conflicting-replay');
  const from = q.islandAtMs - e.sunMs - e.shadeMs;
  const model = createIntegerCordDamageModel(piece, q.assumptionId, {
    worldId, worldEpoch, runId, openedAtWorldMs: q.worldAtMs, openedAtIslandMs: from,
  });
  let state = model.start();
  let islandAt = from;
  const common = { worldId, worldEpoch, runId };
  for (const [tag, duration, shade] of [
    ['sun', e.sunMs, false], ['shade', e.shadeMs, true],
  ] as const) {
    if (!duration) continue;
    const to = islandAt + duration;
    state = model.commit(state, {
      ...common, eventId: q.commandId + ':' + tag, kind: 'exposure', clock: 'island',
      atMs: to, fromIslandMs: islandAt, toIslandMs: to, shade,
    });
    islandAt = to;
  }
  // All these wear totals occurred before the actual fracture. Historical intact
  // peak loads must NOT be tested against the later, weaker final cord.
  if (e.abrasions) {
    state = model.commit(state, {
      ...common, eventId: q.commandId + ':abrasion', kind: 'abrasion', clock: 'world',
      atMs: q.worldAtMs, count: e.abrasions,
    });
  }
  if (e.break) {
    state = model.commit(state, {
      ...common, eventId: q.commandId + ':break', kind: 'load', clock: 'world',
      atMs: q.worldAtMs, gf: e.break.gf,
      ...(e.break.breakAtMm === undefined ? {} : { breakAtMm: e.break.breakAtMm }),
    });
  }
  const projected = model.project(state);
  need((projected.status === 'broken') === !!e.break
    && cordPiecesFingerprint(projected.pieces) === e.resultFingerprint, 'event-refused');
  const produced: ScienceStepResult['produced'] = projected.pieces.map(p =>
    writeCordPiece(p, source.location, readCordHistory(source)));
  return { state, produced, observations: model.observe(state) };
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
  if (event.kind === 'voyage-summary') {
    return evaluateVoyageSummary(source, q, worldId, worldEpoch, runId);
  }
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
