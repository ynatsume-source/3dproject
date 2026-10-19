// Trusted world-only bridge: never accept a resident's account as certified wear.
import type { CoirPiece } from '../science/prototypes/coir-cord-types';
import { COIR_CORD_ASSUMPTION_ID } from '../science/prototypes/coir-cord-types';
import { readCordPiece, writeCordPiece } from './coir-cord-lots';
import { applyCordLoad, type CordLoadLedger, type CordLoadResult } from './coir-cord-load';
import {
  cordPiecesFingerprint, evaluate, need, validateRequest, type CordLoadRequest,
} from './coir-cord-load-kernel';

export interface CordVoyageSummary {
  commandId: string;
  assumptionId: string;
  lotId: string;
  worldAtMs: number;
  islandAtMs: number;
  initial: CoirPiece;
  pieces: CoirPiece[];
  sunMs: number;
  shadeMs: number;
  abrasions: number;
  maxLoadGf?: number;
  break?: { gf: number; atWorldMs: number; atIslandMs: number; breakAtMm?: number };
}

/** One bounded /4 receipt per physical source cord at voyage settlement.
 * The voyage supplies cumulative wear BEFORE fracture plus the actual fracture
 * witness, not an old maximum load retested against a later weakened cord.
 * World IDs are allocated by the existing load transaction exactly once.
 */
export function applyCordVoyageSummary(
  L: CordLoadLedger, summary: CordVoyageSummary,
): CordLoadResult {
  need(summary && summary.assumptionId === COIR_CORD_ASSUMPTION_ID
    && summary.initial?.lotId === summary.lotId
    && Array.isArray(summary.pieces), 'invalid-request');
  const canonicalPiece = (p: CoirPiece) => {
    const out = writeCordPiece(p, 'site:summary-check', 1);
    return readCordPiece({
      lotId: p.lotId, materialId: out.materialId, amount: out.amount,
      quality: out.quality, location: out.into!,
    });
  };
  const initial = canonicalPiece(summary.initial);
  const pieces = summary.pieces.map(canonicalPiece);
  if (summary.break) {
    need(Number.isSafeInteger(summary.break.atWorldMs)
      && Number.isSafeInteger(summary.break.atIslandMs)
      && summary.break.atWorldMs >= 0 && summary.break.atWorldMs <= summary.worldAtMs
      && summary.break.atIslandMs >= 0 && summary.break.atIslandMs <= summary.islandAtMs,
      'invalid-request');
  }
  const q: CordLoadRequest = {
    commandId: summary.commandId, assumptionId: summary.assumptionId,
    lotId: summary.lotId, worldAtMs: summary.worldAtMs, islandAtMs: summary.islandAtMs,
    event: {
      kind: 'voyage-summary', sunMs: summary.sunMs, shadeMs: summary.shadeMs,
      abrasions: summary.abrasions,
      maxLoadGf: summary.maxLoadGf ?? summary.break?.gf ?? 0,
      sourceFingerprint: cordPiecesFingerprint([initial]),
      resultFingerprint: cordPiecesFingerprint(pieces),
      ...(summary.break ? { break: {
        gf: summary.break.gf,
        ...(summary.break.breakAtMm === undefined ? {} : { breakAtMm: summary.break.breakAtMm }),
      } } : {}),
    },
  };
  validateRequest(q);
  const out = writeCordPiece(initial, 'site:summary-check', 1);
  evaluate({
    lotId: summary.lotId, materialId: out.materialId, amount: out.amount,
    quality: out.quality, location: out.into!,
  }, q, L.world.worldId, L.world.worldEpoch, 'run:summary-validation');
  // Validation above has no world mutation; applyCordLoad owns /3 migration,
  // chronology, bounded idempotency, existing-ID retention and atomic settlement.
  return applyCordLoad(L, q);
}
