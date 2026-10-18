import type { CoirPiece } from './coir-cord-types';
import { currentIntegerCordStrength } from './coir-cord-damage';
import { INTEGER_HALF_LIFE_POLICY_ID } from './integer-half-life';
import { validateRig, type SailRig } from './sail-raft-manufacturing';
import type { SailCell, VoyageContext } from './sail-raft-voyage';
import {
  PADDLE_MM_S, SAIL_RULES as R, sailMotionClock, check, uint, id, shape,
  canonical, copy, safe, signed, sum, cosDeg, sinDeg, angleDelta,
  equilibriumSpeedMmS, sailForceGf, sailStrength, validateMat, validateMast,
} from './sail-raft-rules';

export interface SailCellV2 extends Omit<SailCell, 'windMmS' | 'windToDeg' | 'rain'> {
  windMmS: number | null;
  windToDeg: number | null;
  rain: boolean | null;
}
export interface CordVoyageEffect {
  sourceLotId: string;
  initial: CoirPiece;
  pieces: CoirPiece[];
  sunMs: number;
  shadeMs: number;
  abrasions: number;
  maxLoadGf: number;
  break?: { gf: number; atWorldMs: number; atIslandMs: number; breakAtMm: number };
}
interface CordCheckpoint extends CordVoyageEffect {
  carryMs: number;
}
interface LastCell {
  cellId: string;
  digest: number;
  powered: boolean;
  paddling: boolean;
  speedMmS: number;
  forceGf: number;
  windMmS: number | null;
  sailUp: boolean;
}
interface BrokenPart {
  cellId: string;
  part: 'sail' | 'mast' | 'cord';
  lotId: string;
  marginGf: number;
}
interface PartLoad {
  part: 'sail' | 'mast' | 'cord';
  lotId: string;
  gf: number;
}
export interface SailVoyageCheckpoint {
  schema: 'prototype-sail-raft-checkpoint/2';
  assumptionId: string;
  binding: number;
  policy: string;
  nextWorldMs: number;
  nextIslandMs: number;
  cellCount: number;
  mat: SailRig['mat'];
  mast: SailRig['mast'];
  cords: CordCheckpoint[];
  eastNumerator: string;
  northNumerator: string;
  alongNumerator: string;
  sailingMs: number;
  maxLoads: PartLoad[];
  broken: BrokenPart[];
  last: LastCell | null;
}
const DEN = 1000000000n;
const hash = (value: unknown): number => {
  const text = canonical(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
};
const numerator = (s: unknown): s is string =>
  typeof s === 'string' && /^(0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(s) && s.length <= 80;
function validateContext(c: VoyageContext): void {
  check(shape(c, ['worldId', 'worldEpoch', 'runId', 'seed', 'openedAtWorldMs', 'openedAtIslandMs'])
    && id(c.worldId) && id(c.worldEpoch) && id(c.runId) && uint(c.seed)
    && c.seed <= 0xffffffff && uint(c.openedAtWorldMs) && uint(c.openedAtIslandMs),
  'invalid-voyage-context');
}
/** A constant-size fold. The world owns the bounded cell receipts; this layer stores no history. */
export function createCheckpointVoyage(original: SailRig, assumptionId: string, originalContext: VoyageContext) {
  const clock = sailMotionClock(assumptionId);
  validateRig(original);
  validateContext(originalContext);
  const source = copy(original), c = copy(originalContext);
  const binding = hash([assumptionId, R, INTEGER_HALF_LIFE_POLICY_ID, source, c]);
  function startCheckpoint(): SailVoyageCheckpoint {
    return {
      schema: 'prototype-sail-raft-checkpoint/2', assumptionId, binding,
      policy: INTEGER_HALF_LIFE_POLICY_ID,
      nextWorldMs: c.openedAtWorldMs, nextIslandMs: c.openedAtIslandMs, cellCount: 0,
      mat: copy(source.mat), mast: copy(source.mast),
      cords: source.cords.map(p => ({
        sourceLotId: p.lotId, initial: copy(p), pieces: [copy(p)],
        sunMs: 0, shadeMs: 0, abrasions: 0, maxLoadGf: 0,
        carryMs: source.cordUseRemainders.find(u => u.lotId === p.lotId)!.worldMs,
      })),
      eastNumerator: '0', northNumerator: '0', alongNumerator: '0', sailingMs: 0,
      maxLoads: [
        { part: 'sail', lotId: source.mat.lotId, gf: 0 },
        { part: 'mast', lotId: source.mast.lotId, gf: 0 },
        ...source.cords.map(p => ({ part: 'cord' as const, lotId: p.lotId, gf: 0 })),
      ],
      broken: [], last: null,
    };
  }
  function restoreCheckpoint(value: unknown): SailVoyageCheckpoint {
    check(shape(value, ['schema', 'assumptionId', 'binding', 'policy', 'nextWorldMs', 'nextIslandMs',
      'cellCount', 'mat', 'mast', 'cords', 'eastNumerator', 'northNumerator', 'alongNumerator',
      'sailingMs', 'maxLoads', 'broken', 'last'])
      && value.schema === 'prototype-sail-raft-checkpoint/2'
      && value.assumptionId === assumptionId && value.binding === binding
      && value.policy === INTEGER_HALF_LIFE_POLICY_ID, 'unsupported-voyage-checkpoint');
    check(uint(value.nextWorldMs, c.openedAtWorldMs) && uint(value.nextIslandMs, c.openedAtIslandMs)
      && uint(value.cellCount) && uint(value.sailingMs)
      && numerator(value.eastNumerator) && numerator(value.northNumerator)
      && numerator(value.alongNumerator), 'corrupt-voyage-checkpoint');
    validateMat(value.mat);
    validateMast(value.mast);
    for (const key of ['lotId', 'material', 'dryMg', 'waterMg', 'areaCm2', 'baseStrengthGf'] as const) {
      check(value.mat[key] === source.mat[key], 'corrupt-sail-source');
    }
    for (const key of ['lotId', 'material', 'dryMg', 'waterMg', 'lengthMm', 'baseStrengthGf'] as const) {
      check(value.mast[key] === source.mast[key], 'corrupt-mast-source');
    }
    for (const key of ['sunMs', 'shadeMs', 'rainMs'] as const) {
      check(value.mat.damage[key] >= source.mat.damage[key], 'corrupt-sail-damage');
    }
    check(value.mat.lotId === source.mat.lotId && value.mast.lotId === source.mast.lotId
      && Array.isArray(value.cords) && value.cords.length === source.cords.length,
    'corrupt-voyage-parts');
    for (let i = 0; i < value.cords.length; i++) {
      const p = value.cords[i];
      check(shape(p, ['sourceLotId', 'initial', 'pieces', 'sunMs', 'shadeMs', 'abrasions', 'maxLoadGf', 'carryMs',
        ...(p?.break === undefined ? [] : ['break'])])
        && p.sourceLotId === source.cords[i].lotId
        && canonical(p.initial) === canonical(source.cords[i])
        && uint(p.sunMs) && uint(p.shadeMs) && uint(p.abrasions) && uint(p.maxLoadGf) && uint(p.carryMs)
        && p.carryMs < R.abrasionWorldMs && Array.isArray(p.pieces)
        && p.pieces.length === (p.break ? 2 : 1), 'corrupt-cord-checkpoint');
      for (const piece of p.pieces) currentIntegerCordStrength(piece);
      const masses = ['fiberDryMg', 'pithDryMg', 'waterMg', 'lengthMm'] as const;
      for (const key of masses) check(sum(...p.pieces.map((x: CoirPiece) => x[key])) === p.initial[key],
        'corrupt-cord-mass');
      for (const piece of p.pieces) check(piece.baseStrengthGf === p.initial.baseStrengthGf
        && piece.material === p.initial.material
        && piece.damage.sunMs === sum(p.initial.damage.sunMs, p.sunMs)
        && piece.damage.shadeMs === sum(p.initial.damage.shadeMs, p.shadeMs)
        && piece.damage.abrasions === sum(p.initial.damage.abrasions, p.abrasions),
      'corrupt-cord-damage');
      if (p.break) check(shape(p.break, ['gf', 'atWorldMs', 'atIslandMs', 'breakAtMm'])
        && uint(p.break.gf) && uint(p.break.atWorldMs) && uint(p.break.atIslandMs)
        && uint(p.break.breakAtMm, 1) && p.break.breakAtMm < p.initial.lengthMm,
      'corrupt-cord-break');
      else check(p.pieces[0].lotId === p.sourceLotId, 'corrupt-cord-id');
    }
    check(Array.isArray(value.maxLoads) && value.maxLoads.length === source.cords.length + 2,
      'corrupt-load-checkpoint');
    for (let i = 0; i < value.maxLoads.length; i++) {
      const p = value.maxLoads[i], expected = i === 0
        ? { part: 'sail', lotId: source.mat.lotId }
        : i === 1 ? { part: 'mast', lotId: source.mast.lotId }
        : { part: 'cord', lotId: source.cords[i - 2].lotId };
      check(shape(p, ['part', 'lotId', 'gf']) && p.part === expected.part
        && p.lotId === expected.lotId && uint(p.gf), 'corrupt-load-checkpoint');
    }
    check(Array.isArray(value.broken) && value.broken.length <= source.cords.length + 2,
      'corrupt-break-checkpoint');
    const brokenIds = new Set<string>();
    for (const b of value.broken) {
      check(shape(b, ['cellId', 'part', 'lotId', 'marginGf']) && id(b.cellId)
        && ['sail', 'mast', 'cord'].includes(b.part) && id(b.lotId)
        && Number.isSafeInteger(b.marginGf) && b.marginGf < 0 && !brokenIds.has(b.lotId),
      'corrupt-break-checkpoint');
      brokenIds.add(b.lotId);
    }
    if (value.last !== null) check(shape(value.last,
      ['cellId', 'digest', 'powered', 'paddling', 'speedMmS', 'forceGf', 'windMmS', 'sailUp'])
      && id(value.last.cellId) && uint(value.last.digest) && value.last.digest <= 0xffffffff
      && typeof value.last.powered === 'boolean' && typeof value.last.paddling === 'boolean'
      && uint(value.last.speedMmS) && uint(value.last.forceGf)
      && (value.last.windMmS === null || uint(value.last.windMmS))
      && typeof value.last.sailUp === 'boolean', 'corrupt-last-cell');
    check((value.cellCount === 0) === (value.last === null), 'corrupt-cell-count');
    return copy(value as SailVoyageCheckpoint);
  }
  function validateCell(cell: SailCellV2, p: SailVoyageCheckpoint): void {
    check(shape(cell, ['cellId', 'worldId', 'worldEpoch', 'runId', 'fromWorldMs', 'toWorldMs',
      'confirmedAtWorldMs', 'fromIslandMs', 'toIslandMs', 'aboard', 'windMmS', 'windToDeg',
      'gustMmS', 'headingDeg', 'rain', 'sailUp'])
      && id(cell.cellId) && cell.worldId === c.worldId && cell.worldEpoch === c.worldEpoch
      && cell.runId === c.runId && uint(cell.fromWorldMs) && uint(cell.toWorldMs)
      && uint(cell.confirmedAtWorldMs) && cell.confirmedAtWorldMs >= cell.toWorldMs
      && cell.fromWorldMs >= p.nextWorldMs && cell.toWorldMs - cell.fromWorldMs === R.cellWorldMs
      && uint(cell.fromIslandMs) && uint(cell.toIslandMs)
      && cell.fromIslandMs >= p.nextIslandMs && cell.toIslandMs > cell.fromIslandMs
      && cell.aboard === true && uint(cell.headingDeg) && cell.headingDeg < 360
      && (cell.windMmS === null || uint(cell.windMmS))
      && (cell.windToDeg === null || uint(cell.windToDeg) && cell.windToDeg < 360)
      && (cell.gustMmS === null || uint(cell.gustMmS)
        && (cell.windMmS === null || cell.gustMmS >= cell.windMmS))
      && (cell.rain === null || typeof cell.rain === 'boolean')
      && typeof cell.sailUp === 'boolean', 'invalid-or-unconfirmed-cell');
  }
  function step(value: SailVoyageCheckpoint, cell: SailCellV2): SailVoyageCheckpoint {
    const p = restoreCheckpoint(value);
    if (p.last?.cellId === cell.cellId) {
      check(p.last.digest === hash(cell), 'conflicting-cell-replay');
      return p;
    }
    validateCell(cell, p);
    const hasWind = cell.windMmS !== null && cell.windToDeg !== null;
    const up = cell.sailUp && !p.mat.torn && !p.mast.broken && !p.cords.some(x => x.break);
    const delta = hasWind ? angleDelta(cell.windToDeg!, cell.headingDeg) : 0;
    const sailSpeed = up && hasWind ? equilibriumSpeedMmS(cell.windMmS!, p.mat.areaCm2, delta) : 0;
    const gust = cell.gustMmS === null
      ? safe(BigInt(cell.windMmS ?? 0) * 14n / 10n) : cell.gustMmS;
    const force = up && hasWind ? sailForceGf(p.mat.areaCm2, Math.max(0, gust - sailSpeed)) : 0;
    const ropeForce = sum(force, force);
    const candidates: BrokenPart[] = [];
    if (up) {
      const strength = sailStrength(p.mat);
      if (force > strength) candidates.push({
        cellId: cell.cellId, part: 'sail', lotId: p.mat.lotId, marginGf: strength - force,
      });
      if (force > p.mast.baseStrengthGf) candidates.push({
        cellId: cell.cellId, part: 'mast', lotId: p.mast.lotId,
        marginGf: p.mast.baseStrengthGf - force,
      });
      for (let i = 0; i < p.cords.length; i++) {
        const cord = p.cords[i], piece = cord.pieces[0];
        // Exposure precedes this cell's load; abrasion follows it. Unknown rain
        // uses sun, and a raised healthy sail still ages while the crew paddles.
        const islandMs = cell.toIslandMs - cell.fromIslandMs;
        cord.sunMs = sum(cord.sunMs, islandMs);
        piece.damage.sunMs = sum(piece.damage.sunMs, islandMs);
        const strength = currentIntegerCordStrength(piece);
        cord.maxLoadGf = Math.max(cord.maxLoadGf, ropeForce);
        p.maxLoads[i + 2].gf = Math.max(p.maxLoads[i + 2].gf, ropeForce);
        if (ropeForce > strength) {
          const cut = Math.floor(piece.lengthMm / 2), a = copy(piece), b = copy(piece);
          a.lengthMm = cut;
          b.lengthMm = piece.lengthMm - cut;
          for (const key of ['fiberDryMg', 'pithDryMg', 'waterMg'] as const) {
            a[key] = safe(BigInt(piece[key]) * BigInt(cut) / BigInt(piece.lengthMm));
            b[key] = piece[key] - a[key];
          }
          check(a.fiberDryMg > 0 && b.fiberDryMg > 0, 'unsplittable-rig-cord');
          // Private identities: settlement allocates the world's physical child lot IDs.
          a.lotId = c.runId + ':cord:' + i + ':1';
          b.lotId = c.runId + ':cord:' + i + ':2';
          cord.pieces = [a, b];
          cord.break = {
            gf: ropeForce, atWorldMs: cell.fromWorldMs,
            atIslandMs: cell.toIslandMs, breakAtMm: cut,
          };
          candidates.push({
            cellId: cell.cellId, part: 'cord', lotId: cord.sourceLotId,
            marginGf: strength - ropeForce,
          });
        }
      }
      p.maxLoads[0].gf = Math.max(p.maxLoads[0].gf, force);
      p.maxLoads[1].gf = Math.max(p.maxLoads[1].gf, force);
    }
    candidates.sort((a, b) => a.marginGf !== b.marginGf
      ? a.marginGf < b.marginGf ? -1 : 1
      : a.part + ':' + a.lotId < b.part + ':' + b.lotId ? -1 : 1);
    for (const b of candidates) {
      p.broken.push(b);
      if (b.part === 'sail') p.mat.torn = true;
      if (b.part === 'mast') p.mast.broken = true;
    }
    const survived = up && candidates.length === 0;
    const motionMs = clock === 'island'
      ? cell.toIslandMs - cell.fromIslandMs : cell.toWorldMs - cell.fromWorldMs;
    const speed = survived && hasWind ? Math.max(PADDLE_MM_S, sailSpeed) : PADDLE_MM_S;
    const mmMs = BigInt(speed) * BigInt(motionMs);
    p.eastNumerator = (BigInt(p.eastNumerator) + mmMs * BigInt(cosDeg(cell.headingDeg))).toString();
    p.northNumerator = (BigInt(p.northNumerator) + mmMs * BigInt(sinDeg(cell.headingDeg))).toString();
    p.alongNumerator = (BigInt(p.alongNumerator) + mmMs * 1000000n).toString();
    if (survived) {
      p.sailingMs = sum(p.sailingMs, motionMs);
      const islandMs = cell.toIslandMs - cell.fromIslandMs;
      const field = cell.rain === true ? 'rainMs' : 'sunMs';
      p.mat.damage[field] = sum(p.mat.damage[field], islandMs);
      for (const cord of p.cords) {
        const used = sum(cord.carryMs, motionMs);
        const count = Math.floor(used / R.abrasionWorldMs);
        cord.carryMs = used % R.abrasionWorldMs;
        cord.abrasions = sum(cord.abrasions, count);
        cord.pieces[0].damage.abrasions = sum(cord.pieces[0].damage.abrasions, count);
      }
    }
    p.nextWorldMs = cell.toWorldMs;
    p.nextIslandMs = cell.toIslandMs;
    p.cellCount = sum(p.cellCount, 1);
    p.last = {
      cellId: cell.cellId, digest: hash(cell), powered: survived && hasWind && sailSpeed >= PADDLE_MM_S,
      paddling: !survived || !hasWind || sailSpeed < PADDLE_MM_S,
      speedMmS: speed, forceGf: force, windMmS: cell.windMmS, sailUp: cell.sailUp,
    };
    return p;
  }
  function projectCheckpoint(value: SailVoyageCheckpoint) {
    const p = restoreCheckpoint(value);
    return {
      rig: {
        ...copy(source), mat: p.mat, mast: p.mast, cords: p.cords.flatMap(x => x.pieces),
        cordUseRemainders: p.cords.flatMap(x => x.pieces.map(piece => ({
          lotId: piece.lotId, worldMs: x.carryMs,
        }))),
      },
      distance: {
        eastMm: signed(BigInt(p.eastNumerator) / DEN),
        northMm: signed(BigInt(p.northNumerator) / DEN),
        alongHeadingMm: signed(BigInt(p.alongNumerator) / DEN), sidewaysMm: 0,
      },
      maxLoads: p.maxLoads, broken: p.broken, sailingMs: p.sailingMs,
      cordEffects: p.cords.map(({ carryMs: _carry, ...effect }) => effect),
      last: p.last,
    };
  }
  function observeCheckpoint(value: SailVoyageCheckpoint): string[] {
    const p = restoreCheckpoint(value), last = p.last;
    if (!last) return ['筏と帆は、まだ動かしていない。'];
    const wind = last.windMmS;
    const words = [wind === null ? '風の強さは、はっきり分からない。'
      : wind === 0 ? '風をほとんど感じない。'
      : wind < 3000 ? '頬に弱い風を感じる。'
      : wind < 8000 ? '風が体を押す。'
      : wind < 15000 ? '強い風に体を支えたくなる。'
      : '激しい風が体を押しつける。'];
    words.push(last.paddling ? '櫂で漕ぎ、景色がゆっくり流れていく。'
      : 'むしろ帆が張り、景色が流れていく。');
    if (!last.sailUp) words.push('帆はたたまれている。');
    if (p.mat.torn) words.push('むしろ帆は裂けている。');
    if (p.mast.broken) words.push('竹のマストが折れている。');
    else if (last.forceGf > 0) words.push('マストがきしむ。');
    if (p.cords.some(x => x.break)) words.push('帆を張る縄が切れている。');
    return words;
  }
  // Explicit reference storage path, useful for replaying independent confirmed input.
  // The operational API never stores cells or invokes this function.
  function replayCheckpoint(cells: SailCellV2[]): SailVoyageCheckpoint {
    check(Array.isArray(cells), 'invalid-cell-history');
    return cells.reduce((p, cell) => step(p, cell), startCheckpoint());
  }
  return Object.freeze({
    startCheckpoint, restoreCheckpoint, step, projectCheckpoint, observeCheckpoint, replayCheckpoint,
    start: startCheckpoint, restore: restoreCheckpoint, project: projectCheckpoint,
    observe: observeCheckpoint,
    commit(value: SailVoyageCheckpoint, oneOrMany: SailCellV2 | SailCellV2[]) {
      return (Array.isArray(oneOrMany) ? oneOrMany : [oneOrMany]).reduce(step, restoreCheckpoint(value));
    },
  });
}
