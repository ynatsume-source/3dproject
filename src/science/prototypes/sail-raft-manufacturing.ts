import type {
  CoirContext,
  CoirInterval
} from './coir-cord';
import type {
  CoirPiece
} from './coir-cord-types';
import {
  currentIntegerCordStrength
} from './coir-cord-damage';
import {
  INTEGER_HALF_LIFE_POLICY_ID
} from './integer-half-life';
import {
  SAIL_RAFT_ID,
  SAIL_RAFT_ISLAND_ID,
  SAIL_RAFT_WORLD_ID,
  SAIL_RULES as R,
  choose,
  check,
  uint,
  shape,
  id,
  canonical,
  copy,
  sum,
  mulDiv,
  ceilDiv,
  qualityPpm,
  validateMat,
  validateMast,
  sailStrength,
  type PlantMass,
  type SailMat,
  type BambooMast
} from './sail-raft-rules';
export interface RaftHull {
  lotId: string;
  material: 'raft';
  dryMg: number;
  waterMg: number
}
export interface CordUseRemainder {
  lotId: string;
  worldMs: number
}
export interface SailRig {
  lotId: string;
  material: 'sail_raft';
  hull: RaftHull;
  mat: SailMat;
  mast: BambooMast;
  cords: CoirPiece[];
  cordUseRemainders: CordUseRemainder[]
}
export type SailManufactureInput =
| {
  operation: 'harvest';
  source: PlantMass
}
| {
  operation: 'dry';
  source: PlantMass;
  roofed: true
}
| {
  operation: 'split';
  source: PlantMass
}
| {
  operation: 'weave';
  source: PlantMass;
  requestedAreaCm2: number
}
| {
  operation: 'mast';
  source: PlantMass
}
| {
  operation: 'rig';
  hull: RaftHull;
  mat: SailMat;
  mast: BambooMast;
  cords: CoirPiece[];
  cordUseRemainders: CordUseRemainder[]
};
export interface SailManufactureState {
  schema: 'prototype-sail-manufacture/1';
  binding: string;
  intervals: CoirInterval[]
}
export function validateRig(r: SailRig) {
  check(shape(r, ['lotId', 'material', 'hull', 'mat', 'mast', 'cords', 'cordUseRemainders']) && id(r.lotId) && r.material === 'sail_raft', 'invalid-rig');
  validateParts(r.hull, r.mat, r.mast, r.cords, r.cordUseRemainders);
}
function validateParts(h: RaftHull, m: SailMat, b: BambooMast, cords: CoirPiece[], use: CordUseRemainder[]) {
  check(shape(h, ['lotId', 'material', 'dryMg', 'waterMg']) && id(h.lotId) && h.material === 'raft' && uint(h.dryMg, 1) && uint(h.waterMg), 'invalid-raft');
  sum(h.dryMg, h.waterMg);
  validateMat(m);
  validateMast(b);
  check(!m.torn && !b.broken && sailStrength(m)>0, 'broken-rig-part');
  check(Array.isArray(cords) && cords.length>0, 'cords-required');
  for (const p of cords) {
    currentIntegerCordStrength(p);
    check(p.lengthMm >= 2 && BigInt(p.fiberDryMg)*BigInt(Math.floor(p.lengthMm/2))/BigInt(p.lengthMm)>0n, 'unsplittable-rig-cord');
  }
  check(sum(...cords.map(p => p.lengthMm)) >= R.minRigCordMm, 'insufficient-rig-cord');
  check(Array.isArray(use) && use.length === cords.length && new Set(use.map(u => u?.lotId)).size === use.length, 'cord-use-history-required');
  for (const u of use)check(shape(u, ['lotId', 'worldMs']) && cords.some(p => p.lotId === u.lotId) && uint(u.worldMs) && u.worldMs<R.abrasionWorldMs, 'invalid-cord-use-remainder');
  const ids = [h.lotId, m.lotId, b.lotId, ...cords.map(p => p.lotId)];
  check(new Set(ids).size === ids.length, 'duplicate-rig-part');
  sum(h.dryMg, h.waterMg, m.dryMg, m.waterMg, b.dryMg, b.waterMg, ...cords.flatMap(p => [p.fiberDryMg, p.pithDryMg, p.waterMg]));
}
function source(p: PlantMass) {
  check(shape(p, ['lotId', 'material', 'dryMg', 'waterMg', ...(p?.lengthMm === undefined?[]: ['lengthMm'])])
  && id(p.lotId) && uint(p.dryMg, 1) && uint(p.waterMg), 'invalid-plant-material');
  sum(p.dryMg, p.waterMg);
}
export function createSailManufacturingModel(original: SailManufactureInput, assumptionId: string, ctx: CoirContext) {
  choose(assumptionId);
  check(shape(ctx, ['worldId', 'worldEpoch', 'runId', 'seed', 'clock', 'openedAtMs']) && id(ctx.worldId) && id(ctx.worldEpoch) && id(ctx.runId)
  && uint(ctx.seed) && ctx.seed <= 0xffffffff && uint(ctx.openedAtMs), 'invalid-context');
  const op = original?.operation;
  check(['harvest', 'dry', 'split', 'weave', 'mast', 'rig'].includes(op), 'unknown-operation');
  check(ctx.clock === (op === 'dry'?'island': 'world'), 'wrong-clock');
  let duration = 0, mastDry = 0, mastWater = 0, strength = 0;
  if (original.operation === 'rig') {
    check(shape(original, ['operation', 'hull', 'mat', 'mast', 'cords', 'cordUseRemainders']), 'invalid-rig-input');
    validateParts(original.hull, original.mat, original.mast, original.cords, original.cordUseRemainders);
    duration = R.rigMs;
  } else {
    check(shape(original, op === 'dry'?['operation', 'source', 'roofed']: op === 'weave'?['operation', 'source', 'requestedAreaCm2']: ['operation', 'source']), 'invalid-stage-input');
    source(original.source);
    const s = original.source;
    if (original.operation === 'harvest') {
      check(s.material === 'pandanus_standing_leaves' && s.lengthMm === undefined, 'standing-leaf-source-required');
      duration = ceilDiv(s.dryMg, R.harvestMs, R.leafReferenceDryMg);
    } else if (original.operation === 'dry') {
      check(s.material === 'pandanus_leaves' && s.lengthMm === undefined && original.roofed === true, 'roofed-leaves-required');
      duration = s.waterMg>Math.floor(s.dryMg/5)?R.roofDryMs: 0;
    } else if (original.operation === 'split') {
      check(s.material === 'pandanus_leaves' && s.lengthMm === undefined && BigInt(s.waterMg)*5n <= BigInt(s.dryMg), 'dry-leaves-required');
      duration = ceilDiv(s.dryMg, R.splitMs, R.leafReferenceDryMg);
    } else if (original.operation === 'weave') {
      check(s.material === 'pandanus_strips' && s.lengthMm === undefined && BigInt(s.waterMg)*5n <= BigInt(s.dryMg), 'dry-strips-required');
      check(uint(original.requestedAreaCm2, 1) && BigInt(original.requestedAreaCm2)*BigInt(R.weaveDryMgPerCm2) <= BigInt(s.dryMg), 'insufficient-weave-material');
      duration = mulDiv(original.requestedAreaCm2, R.weaveMsPerCm2, 1);
      strength = mulDiv(original.requestedAreaCm2, R.sailGfPerCm2*qualityPpm(ctx.seed, ctx.runId, s.lotId, 'sail-weave-quality', 850000, 300000), 1000000);
    } else {
      check(s.material === 'bamboo' && uint(s.lengthMm, R.mastMm), 'long-bamboo-required');
      mastDry = mulDiv(s.dryMg, R.mastMm, s.lengthMm!);
      mastWater = mulDiv(s.waterMg, R.mastMm, s.lengthMm!);
      check(mastDry >= R.mastMinDryMg, 'insufficient-mast-dry-mass');
      duration = R.mastMs;
      strength = mulDiv(R.mastBaseGf, qualityPpm(ctx.seed, ctx.runId, s.lotId, 'mast-cut-quality', 900000, 200000), 1000000);
    }
  }
  check(uint(duration), 'invalid-duration');
  const input = copy(original), c = copy(ctx), binding = canonical([SAIL_RAFT_ID, R, INTEGER_HALF_LIFE_POLICY_ID, input, c]);
  const save = (intervals: CoirInterval[]): SailManufactureState => ({
    schema: 'prototype-sail-manufacture/1',
    binding,
    intervals: copy(intervals)
  });
  function receipts(records: unknown) {
    check(Array.isArray(records), 'invalid-work-history');
    let total = 0, last = c.openedAtMs;
    const ids = new Set<string>();
    for (const r of records) {
      check(shape(r, op === 'dry'?['confirmationId', 'worldId', 'worldEpoch', 'runId', 'clock', 'fromMs', 'toMs', 'confirmedAtMs', 'kind']:
      ['confirmationId', 'worldId', 'worldEpoch', 'runId', 'clock', 'fromMs', 'toMs', 'confirmedAtMs', 'kind', 'actorId', 'attendance']), 'invalid-confirmation');
      check(id(r.confirmationId) && !ids.has(r.confirmationId) && r.worldId === c.worldId && r.worldEpoch === c.worldEpoch && r.runId === c.runId && r.clock === c.clock
      && uint(r.fromMs) && uint(r.toMs) && uint(r.confirmedAtMs) && r.fromMs >= last && r.toMs>r.fromMs && r.confirmedAtMs >= r.toMs, 'invalid-confirmed-work');
      check(op === 'dry'?r.kind === 'host-confirmed-roofed-wait': r.kind === 'host-confirmed-manual-work' && id(r.actorId) && r.attendance === 'present', 'unconfirmed-attendance-or-roof');
      ids.add(r.confirmationId);
      total = sum(total, r.toMs-r.fromMs);
      last = r.toMs;
    }
    return total;
  }
  function restore(v: unknown): SailManufactureState {
    check(shape(v, ['schema', 'binding', 'intervals']) && v.schema === 'prototype-sail-manufacture/1' && v.binding === binding, 'unsupported-manufacture-save');
    receipts(v.intervals);
    return save(v.intervals);
  }
  function project(v: SailManufactureState) {
    const state = restore(v), total = receipts(state.intervals), work = Math.min(total, duration), done = total >= duration;
    let material: PlantMass|SailMat|BambooMast|null = null, remaining: PlantMass|null = null, scrap: PlantMass|null = null, releasedWaterMg = 0, areaCm2 = 0;
    let product = {
      dryMg: 0,
      waterMg: 0
    }, rig: SailRig|null = null;
    const lotId = c.runId+':product';
    if (input.operation === 'rig') {
      if (done)rig = {
        lotId,
        material: 'sail_raft',
        hull: copy(input.hull),
        mat: copy(input.mat),
        mast: copy(input.mast),
        cords: copy(input.cords),
        cordUseRemainders: copy(input.cordUseRemainders)
      };
    } else {
      const s = input.source;
      if (input.operation === 'harvest') {
        const d = duration?mulDiv(s.dryMg, work, duration): s.dryMg, w = s.waterMg-mulDiv(s.waterMg, s.dryMg-d, s.dryMg);
        product = {
          dryMg: d,
          waterMg: w
        };
        remaining = {
          ...s,
          dryMg: s.dryMg-d,
          waterMg: s.waterMg-w
        };
        if (done)material = {
          lotId,
          material: 'pandanus_leaves',
          ...product
        };
      } else if (input.operation === 'dry') {
        releasedWaterMg = duration?mulDiv(s.waterMg-Math.floor(s.dryMg/5), work, duration): 0;
        product = {
          dryMg: s.dryMg,
          waterMg: s.waterMg-releasedWaterMg
        };
        if (done)material = {
          lotId,
          material: 'pandanus_leaves',
          ...product
        };
      } else if (input.operation === 'split') {
        const d = mulDiv(Math.floor(s.dryMg/10), work, duration), w = s.waterMg-mulDiv(s.waterMg, s.dryMg-d, s.dryMg);
        product = {
          dryMg: s.dryMg-d,
          waterMg: s.waterMg-w
        };
        scrap = {
          lotId: c.runId+':scrap',
          material: 'pandanus_leaf_scrap',
          dryMg: d,
          waterMg: w
        };
        if (done)material = {
          lotId,
          material: 'pandanus_strips',
          ...product
        };
      } else if (input.operation === 'weave') {
        areaCm2 = Math.min(input.requestedAreaCm2, Math.floor(work/R.weaveMsPerCm2));
        const d = areaCm2*R.weaveDryMgPerCm2, w = s.waterMg-mulDiv(s.waterMg, s.dryMg-d, s.dryMg);
        product = {
          dryMg: d,
          waterMg: w
        };
        remaining = {
          ...s,
          dryMg: s.dryMg-d,
          waterMg: s.waterMg-w
        };
        if (done)material = {
          lotId,
          material: 'sail_mat',
          ...product,
          areaCm2,
          baseStrengthGf: strength,
          torn: false,
          damage: {
            sunMs: 0,
            shadeMs: 0,
            rainMs: 0
          }
        };
      } else {
        if (done) {
          product = {
            dryMg: mastDry,
            waterMg: mastWater
          };
          remaining = {
            ...s,
            lotId: c.runId+':bamboo-remainder',
            dryMg: s.dryMg-mastDry,
            waterMg: s.waterMg-mastWater,
            lengthMm: s.lengthMm!-R.mastMm
          };
          material = {
            lotId,
            material: 'bamboo_mast',
            ...product,
            lengthMm: R.mastMm,
            baseStrengthGf: strength,
            broken: false
          };
        } else remaining = copy(s);
      }
    }
    return {
      status: done?'completed' as const: 'partial' as const,
      totalWorkMs: total,
      requiredMs: duration,
      product,
      remaining,
      scrap,
      releasedWaterMg,
      areaCm2,
      material,
      rig
    };
  }
  return Object.freeze({
    start: () => save([]),
    restore,
    project,
    commit(v: SailManufactureState, r: CoirInterval) {
      const state = restore(v), old = state.intervals.find(x => x.confirmationId === r.confirmationId);
      if (old) {
        check(canonical(old) === canonical(r), 'conflicting-work-replay');
        return state;
      }
      receipts([...state.intervals, r]);
      return save([...state.intervals, r]);
    },
    observe(v: SailManufactureState): string[] {
      const p = project(v);
      return [p.status === 'completed'?({
        harvest: '葉を取り終えた。',
        dry: '葉は乾いて、しなやかになった。',
        split: p.scrap && (p.scrap.dryMg+p.scrap.waterMg)>0?'葉を細く裂いた。とげと葉脈の屑が残っている。': '葉を細く裂いた。目立った屑は残らなかった。',
        weave: '編んだむしろが広がっている。',
        mast: '竹のマストを切り出した。',
        rig: '筏にマストとむしろ帆を据え、縄で結んだ。'
      }[op]): '手元の材料は、まだ作業の途中だ。'];
    }
  });
}

/** Bounded cumulative manufacturing state. Numeric fields are safe integers.
 * Old confirmations outside recent are rejected by the chronological cursor;
 * only the most recent 64 confirmations support exact replay.
 */
export interface SailManufactureCheckpoint {
  schema: 'prototype-sail-manufacture/2';
  binding: string;
  totalWorkMs: number;
  lastAtMs: number;
  floorAtMs: number | null;
  recent: {
    confirmationId: string;
    fromMs: number;
    toMs: number;
    confirmedAtMs: number;
    actorId: string | null;
  }[];
}

export const SAIL_MANUFACTURE_RECEIPT_LIMIT = 64;

/** The v2 world adapter uses this entry, rather than retaining every interval.
 * The accepted v1 cumulative arithmetic remains the projection oracle: a single
 * synthetic interval carries the exact total and never represents new work.
 */
export function createCompactSailManufacturingModel(
  original: SailManufactureInput,
  assumptionId: string,
  ctx: CoirContext
) {
  check(
    assumptionId === SAIL_RAFT_ISLAND_ID || assumptionId === SAIL_RAFT_WORLD_ID,
    'explicit-v2-sail-assumption-required'
  );
  const input = copy(original);
  const model = createSailManufacturingModel(input, SAIL_RAFT_ID, ctx);
  const context = copy(ctx);
  const drying = input.operation === 'dry';
  const binding = canonical([
    'prototype-sail-manufacture/2',
    assumptionId,
    R,
    INTEGER_HALF_LIFE_POLICY_ID,
    input,
    context
  ]);

  function interval(r: unknown): asserts r is CoirInterval {
    const keys = [
      'confirmationId', 'worldId', 'worldEpoch', 'runId', 'clock',
      'fromMs', 'toMs', 'confirmedAtMs', 'kind',
      ...(drying ? [] : ['actorId', 'attendance'])
    ];
    check(shape(r, keys), 'invalid-confirmation');
    check(
      id(r.confirmationId) &&
      r.worldId === context.worldId &&
      r.worldEpoch === context.worldEpoch &&
      r.runId === context.runId &&
      r.clock === context.clock &&
      uint(r.fromMs) &&
      uint(r.toMs) &&
      uint(r.confirmedAtMs) &&
      r.fromMs >= context.openedAtMs &&
      r.toMs > r.fromMs &&
      r.confirmedAtMs >= r.toMs,
      'invalid-confirmed-work'
    );
    check(
      drying
        ? r.kind === 'host-confirmed-roofed-wait'
        : r.kind === 'host-confirmed-manual-work' &&
          id(r.actorId) &&
          r.attendance === 'present',
      'unconfirmed-attendance-or-roof'
    );
  }

  function compact(r: CoirInterval): SailManufactureCheckpoint['recent'][number] {
    return {
      confirmationId: r.confirmationId,
      fromMs: r.fromMs,
      toMs: r.toMs,
      confirmedAtMs: r.confirmedAtMs,
      actorId: drying ? null : r.actorId!
    };
  }

  function restore(value: unknown): SailManufactureCheckpoint {
    check(
      shape(value, [
        'schema', 'binding', 'totalWorkMs', 'lastAtMs',
        'floorAtMs', 'recent'
      ]) &&
      value.schema === 'prototype-sail-manufacture/2' &&
      value.binding === binding,
      'unsupported-manufacture-save'
    );
    check(
      uint(value.totalWorkMs) &&
      uint(value.lastAtMs) &&
      value.lastAtMs >= context.openedAtMs &&
      value.totalWorkMs <= value.lastAtMs - context.openedAtMs &&
      (value.floorAtMs === null ||
        uint(value.floorAtMs) &&
        value.floorAtMs > context.openedAtMs &&
        value.floorAtMs <= value.lastAtMs) &&
      Array.isArray(value.recent) &&
      value.recent.length <= SAIL_MANUFACTURE_RECEIPT_LIMIT,
      'invalid-manufacture-checkpoint'
    );
    let last = value.floorAtMs ?? context.openedAtMs;
    let retainedWork = 0;
    const seen = new Set<string>();
    for (const r of value.recent) {
      check(
        shape(r, [
          'confirmationId', 'fromMs', 'toMs', 'confirmedAtMs', 'actorId'
        ]) &&
        id(r.confirmationId) &&
        !seen.has(r.confirmationId) &&
        uint(r.fromMs) &&
        uint(r.toMs) &&
        uint(r.confirmedAtMs) &&
        r.fromMs >= last &&
        r.toMs > r.fromMs &&
        r.confirmedAtMs >= r.toMs &&
        (drying ? r.actorId === null : id(r.actorId)),
        'invalid-manufacture-receipt'
      );
      seen.add(r.confirmationId);
      retainedWork = sum(retainedWork, r.toMs - r.fromMs);
      last = r.toMs;
    }
    check(
      last === value.lastAtMs &&
      retainedWork <= value.totalWorkMs &&
      (value.floorAtMs === null
        ? retainedWork === value.totalWorkMs
        : value.recent.length === SAIL_MANUFACTURE_RECEIPT_LIMIT &&
          value.totalWorkMs > retainedWork &&
          value.totalWorkMs - retainedWork <=
            value.floorAtMs - context.openedAtMs) &&
      (value.recent.length > 0 ||
        value.totalWorkMs === 0 && value.lastAtMs === context.openedAtMs),
      'invalid-manufacture-totals'
    );
    return copy(value) as SailManufactureCheckpoint;
  }

  function legacyTotal(totalWorkMs: number): SailManufactureState {
    check(uint(totalWorkMs), 'invalid-confirmed-work-total');
    if (totalWorkMs === 0) return model.start();
    const toMs = sum(context.openedAtMs, totalWorkMs);
    const r: CoirInterval = {
      confirmationId: 'sail:compact-total',
      worldId: context.worldId,
      worldEpoch: context.worldEpoch,
      runId: context.runId,
      clock: context.clock,
      fromMs: context.openedAtMs,
      toMs,
      confirmedAtMs: toMs,
      kind: drying ? 'host-confirmed-roofed-wait' : 'host-confirmed-manual-work',
      ...(drying ? {} : { actorId: 'sail:compact-actor', attendance: 'present' as const })
    };
    return model.commit(model.start(), r);
  }

  function projectTotalForAbandon(totalWorkMs: number) {
    const p = model.project(legacyTotal(totalWorkMs));
    if (p.status === 'completed' || input.operation === 'rig') return p;
    if (input.operation === 'harvest' && p.product.dryMg > 0) {
      p.material = {
        lotId: context.runId + ':product',
        material: 'pandanus_leaves',
        ...p.product
      };
    } else if (input.operation === 'dry' || input.operation === 'split') {
      // Partly split leaves are still leaves. The actual scrap remains scrap;
      // restarting cannot claim an unfinished bundle as ready weaving strips.
      p.material = {
        lotId: context.runId + ':product',
        material: 'pandanus_leaves',
        ...p.product
      };
    } else if (input.operation === 'weave' && p.areaCm2 > 0) {
      p.material = {
        lotId: context.runId + ':product',
        material: 'sail_mat',
        ...p.product,
        areaCm2: p.areaCm2,
        baseStrengthGf: mulDiv(
          p.areaCm2,
          R.sailGfPerCm2 * qualityPpm(
            context.seed,
            context.runId,
            input.source.lotId,
            'sail-weave-quality',
            850000,
            300000
          ),
          1000000
        ),
        torn: false,
        damage: { sunMs: 0, shadeMs: 0, rainMs: 0 }
      };
    }
    return p;
  }

  return Object.freeze({
    start: (): SailManufactureCheckpoint => ({
      schema: 'prototype-sail-manufacture/2',
      binding,
      totalWorkMs: 0,
      lastAtMs: context.openedAtMs,
      floorAtMs: null,
      recent: []
    }),
    restore,
    /** Pure host-certified cumulative totals; this does not certify attendance. */
    projectTotal(totalWorkMs: number) {
      return model.project(legacyTotal(totalWorkMs));
    },
    observeTotal(totalWorkMs: number): string[] {
      return model.observe(legacyTotal(totalWorkMs));
    },
    projectTotalForAbandon,
    project(value: SailManufactureCheckpoint) {
      return model.project(legacyTotal(restore(value).totalWorkMs));
    },
    observe(value: SailManufactureCheckpoint): string[] {
      return model.observe(legacyTotal(restore(value).totalWorkMs));
    },
    commit(
      value: SailManufactureCheckpoint,
      confirmation: CoirInterval
    ): SailManufactureCheckpoint {
      const state = restore(value);
      interval(confirmation);
      const receipt = compact(confirmation);
      const old = state.recent.find(
        x => x.confirmationId === confirmation.confirmationId
      );
      if (old) {
        check(canonical(old) === canonical(receipt), 'conflicting-work-replay');
        return state;
      }
      check(confirmation.fromMs >= state.lastAtMs, 'expired-or-overlapping-work');
      state.totalWorkMs = sum(
        state.totalWorkMs,
        confirmation.toMs - confirmation.fromMs
      );
      state.lastAtMs = confirmation.toMs;
      state.recent.push(receipt);
      if (state.recent.length > SAIL_MANUFACTURE_RECEIPT_LIMIT) {
        state.floorAtMs = state.recent.shift()!.toMs;
      }
      return state;
    }
  });
}
