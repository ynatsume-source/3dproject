// Frozen main c6ca044 legacy-v1 reference; import paths only changed.
import type {
  CoirPiece
} from '../../src/science/prototypes/coir-cord-types';
import {
  COIR_CORD_ASSUMPTION_ID
} from '../../src/science/prototypes/coir-cord-types';
import {
  createIntegerCordDamageModel,
  currentIntegerCordStrength,
  type CordDamageEvent,
  type CordDamageContext
} from '../../src/science/prototypes/coir-cord-damage';
import {
  INTEGER_HALF_LIFE_POLICY_ID
} from '../../src/science/prototypes/integer-half-life';
import {
  validateRig,
  type SailRig
} from '../../src/science/prototypes/sail-raft-manufacturing';
import {
  SAIL_RAFT_ID,
  SAIL_RULES as R,
  choose,
  check,
  uint,
  shape,
  id,
  canonical,
  copy,
  sum,
  safe,
  signed,
  cosDeg,
  sinDeg,
  angleDelta,
  equilibriumSpeedMmS,
  sailForceGf,
  sailStrength,
  validateMat,
  type SailMat
} from '../../src/science/prototypes/sail-raft-rules';
export interface VoyageContext {
  worldId: string;
  worldEpoch: string;
  runId: string;
  seed: number;
  openedAtWorldMs: number;
  openedAtIslandMs: number
}
export interface SailCell {
  cellId: string;
  worldId: string;
  worldEpoch: string;
  runId: string;
  fromWorldMs: number;
  toWorldMs: number;
  confirmedAtWorldMs: number;
  fromIslandMs: number;
  toIslandMs: number;
  aboard: true;
  windMmS: number;
  windToDeg: number;
  gustMmS: number|null;
  headingDeg: number;
  rain: boolean;
  sailUp: boolean;
}
export interface VoyageState {
  schema: 'prototype-sail-raft/1';
  binding: string;
  cells: SailCell[]
}
function context(c: VoyageContext) {
  check(shape(c, ['worldId', 'worldEpoch', 'runId', 'seed', 'openedAtWorldMs', 'openedAtIslandMs']) && id(c.worldId) && id(c.worldEpoch) && id(c.runId)
  && uint(c.seed) && c.seed <= 0xffffffff && uint(c.openedAtWorldMs) && uint(c.openedAtIslandMs), 'invalid-voyage-context');
}
export function cordVoyageContext(c: VoyageContext, lotId: string): CordDamageContext {
  return {
    worldId: c.worldId,
    worldEpoch: c.worldEpoch,
    runId: c.runId+':cord:'+JSON.stringify(lotId),
    openedAtWorldMs: c.openedAtWorldMs,
    openedAtIslandMs: c.openedAtIslandMs
  };
}
const DEN = 50000000n;
export function createSailRaftVoyage(original: SailRig, assumptionId: string, originalContext: VoyageContext) {
  choose(assumptionId);
  validateRig(original);
  context(originalContext);
  const rig = copy(original), c = copy(originalContext), binding = canonical([SAIL_RAFT_ID, R, INTEGER_HALF_LIFE_POLICY_ID, rig, c]);
  const save = (cells: SailCell[]): VoyageState => ({
    schema: 'prototype-sail-raft/1',
    binding,
    cells: copy(cells)
  });
  function replay(records: unknown) {
    check(Array.isArray(records), 'invalid-cell-history');
    const seen = new Set<string>();
    let lastWorld = c.openedAtWorldMs, lastIsland = c.openedAtIslandMs;
    const mat = copy(rig.mat), mast = copy(rig.mast), cords = rig.cords.map(p => ({
      sourceLotId: p.lotId,
      pieces: [copy(p)],
      broken: false,
      carry: rig.cordUseRemainders.find(u => u.lotId === p.lotId)!.worldMs
    }));
    let east = 0n, north = 0n, along = 0n, side = 0n, sailingMs = 0;
    const maxLoads = [{
      part: 'sail',
      lotId: mat.lotId,
      gf: 0
    }, {
      part: 'mast',
      lotId: mast.lotId,
      gf: 0
    }, ...cords.map(p => ({
      part: 'cord',
      lotId: p.sourceLotId,
      gf: 0
    }))];
    const broken: {
      cellId: string;
      part: string;
      lotId: string;
      marginGf: number
    }[] = [];
    const cordEvents: {
      sourceLotId: string;
      event: CordDamageEvent
    }[] = [], sailExposures: {
      cellId: string;
      mode: 'sun'|'rain';
      fromIslandMs: number;
      toIslandMs: number
    }[] = [];
    const trace: {
      cellId: string;
      powered: boolean;
      speedMmS: number;
      forceGf: number;
      gustSource: string
    }[] = [];
    for (const cell of records) {
      check(shape(cell, ['cellId', 'worldId', 'worldEpoch', 'runId', 'fromWorldMs', 'toWorldMs', 'confirmedAtWorldMs', 'fromIslandMs', 'toIslandMs', 'aboard', 'windMmS', 'windToDeg', 'gustMmS', 'headingDeg', 'rain', 'sailUp'])
      && id(cell.cellId) && !seen.has(cell.cellId) && cell.worldId === c.worldId && cell.worldEpoch === c.worldEpoch && cell.runId === c.runId
      && uint(cell.fromWorldMs) && uint(cell.toWorldMs) && uint(cell.confirmedAtWorldMs) && cell.fromWorldMs === lastWorld
      && BigInt(cell.toWorldMs)-BigInt(cell.fromWorldMs) === BigInt(R.cellWorldMs) && cell.confirmedAtWorldMs >= cell.toWorldMs
      && uint(cell.fromIslandMs) && uint(cell.toIslandMs) && cell.fromIslandMs === lastIsland && cell.toIslandMs>cell.fromIslandMs && cell.aboard === true
      && uint(cell.windMmS) && uint(cell.windToDeg) && cell.windToDeg<360 && uint(cell.headingDeg) && cell.headingDeg<360
      && (cell.gustMmS === null || uint(cell.gustMmS) && cell.gustMmS >= cell.windMmS)
      && typeof cell.rain === 'boolean' && typeof cell.sailUp === 'boolean', 'invalid-or-unconfirmed-cell');
      seen.add(cell.cellId);
      lastWorld = cell.toWorldMs;
      lastIsland = cell.toIslandMs;
      const delta = angleDelta(cell.windToDeg, cell.headingDeg), up = cell.sailUp && !mat.torn && !mast.broken && !cords.some(p => p.broken);
      const speed = up?equilibriumSpeedMmS(cell.windMmS, mat.areaCm2, delta): 0;
      const gust = cell.gustMmS === null?safe(BigInt(cell.windMmS)*14n/10n): cell.gustMmS;
      const force = up?sailForceGf(mat.areaCm2, Math.max(0, gust-speed)): 0, ropeForce = sum(force, force);
      const candidates: {
        cellId: string;
        part: string;
        lotId: string;
        marginGf: number
      }[] = [];
      const working = cords.map(() => null as ReturnType<typeof createIntegerCordDamageModel>|null);
      const cordStates = cords.map(() => null as ReturnType<ReturnType<typeof createIntegerCordDamageModel>['start']>|null);
      if (up) {
        const ms = sailStrength(mat);
        if (force>ms)candidates.push({
          cellId: cell.cellId,
          part: 'sail',
          lotId: mat.lotId,
          marginGf: ms-force
        });
        if (force>mast.baseStrengthGf)candidates.push({
          cellId: cell.cellId,
          part: 'mast',
          lotId: mast.lotId,
          marginGf: mast.baseStrengthGf-force
        });
        for (let i = 0; i<cords.length; i++) {
          const p = cords[i], ctx = cordVoyageContext(c, p.sourceLotId), m = createIntegerCordDamageModel(p.pieces[0], COIR_CORD_ASSUMPTION_ID, ctx);
          const load: CordDamageEvent = {
            kind: 'load',
            clock: 'world',
            eventId: cell.cellId+':load',
            worldId: c.worldId,
            worldEpoch: c.worldEpoch,
            runId: ctx.runId,
            atMs: cell.fromWorldMs,
            gf: ropeForce
          };
          const s = m.commit(m.start(), load), result = m.project(s), strength = currentIntegerCordStrength(p.pieces[0]);
          working[i] = m;
          cordStates[i] = s;
          cordEvents.push({
            sourceLotId: p.sourceLotId,
            event: load
          });
          if (result.status === 'broken') {
            candidates.push({
              cellId: cell.cellId,
              part: 'cord',
              lotId: p.sourceLotId,
              marginGf: strength-ropeForce
            });
            p.pieces = result.pieces;
            p.broken = true;
          }
        }
        maxLoads[0].gf = Math.max(maxLoads[0].gf, force);
        maxLoads[1].gf = Math.max(maxLoads[1].gf, force);
        for (let i = 2; i<maxLoads.length; i++)maxLoads[i].gf = Math.max(maxLoads[i].gf, ropeForce);
      }
      candidates.sort((a, b) => a.marginGf !== b.marginGf?(a.marginGf<b.marginGf?-1: 1): (a.part+':'+a.lotId<b.part+':'+b.lotId?-1: 1));
      for (const b of candidates) {
        broken.push(b);
        if (b.part === 'sail')mat.torn = true;
        if (b.part === 'mast')mast.broken = true;
      }
      const survived = up && candidates.length === 0, powered = survived && Math.abs(delta) <= 60 && speed>0;
      if (powered) {
        const mm = BigInt(speed)*30n;
        along += mm*DEN;
        east += mm*BigInt(cosDeg(cell.headingDeg))*50n;
        north += mm*BigInt(sinDeg(cell.headingDeg))*50n;
      } else {
        // No powered motion outside the sailing sector; the unpowered raft drifts.
        const mm = BigInt(cell.windMmS)*30n;
        along += mm*BigInt(cosDeg(delta));
        side += mm*BigInt(sinDeg(delta));
        east += mm*BigInt(cosDeg(cell.windToDeg));
        north += mm*BigInt(sinDeg(cell.windToDeg));
      }
      if (powered)sailingMs = sum(sailingMs, R.cellWorldMs);
      if (survived) {
        const dt = cell.toIslandMs-cell.fromIslandMs, field = cell.rain?'rainMs': 'sunMs';
        mat.damage[field] = sum(mat.damage[field], dt);
        sailExposures.push({
          cellId: cell.cellId,
          mode: cell.rain?'rain': 'sun',
          fromIslandMs: cell.fromIslandMs,
          toIslandMs: cell.toIslandMs
        });
        for (let i = 0; i<cords.length; i++) {
          const p = cords[i], m = working[i]!, ctx = cordVoyageContext(c, p.sourceLotId);
          let s = cordStates[i]!;
          const e: CordDamageEvent = {
            kind: 'exposure',
            clock: 'island',
            eventId: cell.cellId+':exposure',
            worldId: c.worldId,
            worldEpoch: c.worldEpoch,
            runId: ctx.runId,
            atMs: cell.toIslandMs,
            fromIslandMs: cell.fromIslandMs,
            toIslandMs: cell.toIslandMs,
            shade: false
          };
          s = m.commit(s, e);
          cordEvents.push({
            sourceLotId: p.sourceLotId,
            event: e
          });
          const used = sum(p.carry, powered?R.cellWorldMs: 0), abrasion = Math.floor(used/R.abrasionWorldMs);
          p.carry = used%R.abrasionWorldMs;
          if (abrasion) {
            const a: CordDamageEvent = {
              kind: 'abrasion',
              clock: 'world',
              eventId: cell.cellId+':abrasion',
              worldId: c.worldId,
              worldEpoch: c.worldEpoch,
              runId: ctx.runId,
              atMs: cell.toWorldMs,
              count: abrasion
            };
            s = m.commit(s, a);
            cordEvents.push({
              sourceLotId: p.sourceLotId,
              event: a
            });
          }
          p.pieces = m.project(s).pieces;
        }
      }
      trace.push({
        cellId: cell.cellId,
        powered,
        speedMmS: powered?speed: Math.floor(cell.windMmS/50),
        forceGf: force,
        gustSource: cell.gustMmS === null?'assumed-1.4': 'measured'
      });
    }
    return {
      rig: {
        ...copy(rig),
        mat,
        mast,
        cords: cords.flatMap(p => p.pieces),
        cordUseRemainders: cords.flatMap(p => p.pieces.map(piece => ({
          lotId: piece.lotId,
          worldMs: p.carry
        })))
      },
      distance: {
        eastMm: signed(east/DEN),
        northMm: signed(north/DEN),
        alongHeadingMm: signed(along/DEN),
        sidewaysMm: signed(side/DEN)
      },
      maxLoads,
      broken,
      cordEvents,
      sailExposures,
      sailingMs,
      trace
    };
  }
  function restore(v: unknown): VoyageState {
    check(shape(v, ['schema', 'binding', 'cells']) && v.schema === 'prototype-sail-raft/1' && v.binding === binding, 'unsupported-voyage-save');
    replay(v.cells);
    return save(v.cells);
  }
  return Object.freeze({
    start: () => save([]),
    restore,
    project: (v: VoyageState) => replay(restore(v).cells),
    commit(v: VoyageState, oneOrMany: SailCell|SailCell[]) {
      const state = restore(v), incoming = Array.isArray(oneOrMany)?oneOrMany: [oneOrMany], cells = copy(state.cells);
      for (const cell of incoming) {
        const old = cells.find(x => x.cellId === cell.cellId);
        if (old) {
          check(canonical(old) === canonical(cell), 'conflicting-cell-replay');
          continue;
        }
        cells.push(copy(cell));
      }
      replay(cells);
      return save(cells);
    },
    observe(v: VoyageState): string[] {
      const state = restore(v),
      p = replay(state.cells),
      last = state.cells.at(-1);
      if (!last)return ['筏と帆は、まだ動かしていない。'];
      const t = p.trace.at(-1)!;
      const words = [last.windMmS === 0?'風をほとんど感じない。': last.windMmS<3000?'頬に弱い風を感じる。': last.windMmS<8000?'風が体を押す。': last.windMmS<15000?'強い風に体を支えたくなる。': '激しい風が体を押しつける。'];
      words.push(!last.sailUp?'帆はたたまれている。': p.rig.mat.torn?'むしろ帆は裂けている。': last.windMmS === 0?'帆はゆるみ、景色は動いていない。': t.powered?'むしろ帆が張り、景色が流れていく。': t.speedMmS === 0?'帆はゆるみ、景色の動きはほとんど感じられない。': '帆がばたつき、景色がゆっくり流れていく。');
      if (p.rig.mast.broken)words.push('竹のマストが折れている。');
      else if (t.forceGf>0)words.push('マストがきしむ。');
      if (p.broken.some(b => b.part === 'cord'))words.push('帆を張る縄が切れている。');
      return words;
    }
  });
}
export interface SailExposure {
  eventId: string;
  fromIslandMs: number;
  toIslandMs: number;
  mode: 'sun'|'shade'|'rain'
}
/** Shore/storage wear is explicit too; no implicit clock or weather. */
export function createSailWearModel(original: SailMat, assumptionId: string, openedAtIslandMs: number) {
  choose(assumptionId);
  validateMat(original);
  check(uint(openedAtIslandMs), 'invalid-island-start');
  const source = copy(original), binding = canonical([SAIL_RAFT_ID, INTEGER_HALF_LIFE_POLICY_ID, source, openedAtIslandMs]);
  const save = (events: SailExposure[]) => ({
    schema: 'prototype-sail-wear/1',
    binding,
    events: copy(events)
  });
  function replay(events: SailExposure[]) {
    check(Array.isArray(events), 'invalid-exposure-history');
    const mat = copy(source), ids = new Set<string>();
    let last = openedAtIslandMs;
    for (const e of events) {
      check(shape(e, ['eventId', 'fromIslandMs', 'toIslandMs', 'mode']) && id(e.eventId) && !ids.has(e.eventId) && uint(e.fromIslandMs) && uint(e.toIslandMs)
      && e.fromIslandMs >= last && e.toIslandMs>e.fromIslandMs && ['sun', 'shade', 'rain'].includes(e.mode), 'invalid-exposure');
      ids.add(e.eventId);
      last = e.toIslandMs;
      const k = e.mode === 'sun'?'sunMs': e.mode === 'rain'?'rainMs': 'shadeMs';
      mat.damage[k] = sum(mat.damage[k], e.toIslandMs-e.fromIslandMs);
    }
    return mat;
  }
  function restore(v: ReturnType<typeof save>) {
    check(shape(v, ['schema', 'binding', 'events']) && v.schema === 'prototype-sail-wear/1' && v.binding === binding, 'unsupported-sail-wear');
    replay(v.events);
    return save(v.events);
  }
  return Object.freeze({
    start: () => save([]),
    restore,
    project: (v: ReturnType<typeof save>) => replay(restore(v).events),
    commit(v: ReturnType<typeof save>, e: SailExposure) {
      const s = restore(v), old = s.events.find(x => x.eventId === e.eventId);
      if (old) {
        check(canonical(old) === canonical(e), 'conflicting-exposure-replay');
        return s;
      }
      replay([...s.events, e]);
      return save([...s.events, e]);
    }
  });
}
