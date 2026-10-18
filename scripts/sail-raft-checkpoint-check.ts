import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  SAIL_RAFT_ID, SAIL_RAFT_ISLAND_ID, SAIL_RAFT_WORLD_ID, PADDLE_MM_S,
  SAIL_MOTION_CLOCK, SAIL_RULES as R, equilibriumSpeedMmS, sailForceGf,
  sailStrength, cosDeg, sinDeg, angleDelta, canonical,
} from '../src/science/prototypes/sail-raft-rules';
import type { SailRig } from '../src/science/prototypes/sail-raft-manufacturing';
import {
  createSailRaftVoyage, type VoyageContext, type SailCell,
} from '../src/science/prototypes/sail-raft-voyage';
import {
  createCheckpointVoyage, type SailCellV2, type SailVoyageCheckpoint,
} from '../src/science/prototypes/sail-raft-checkpoint';
import { createSailRaftVoyage as frozenV1 } from './fixtures/sail-raft-v1';
import { COIR_CORD_ASSUMPTION_ID, type CoirPiece } from '../src/science/prototypes/coir-cord-types';
import {
  createIntegerCordDamageModel, currentIntegerCordStrength,
} from '../src/science/prototypes/coir-cord-damage';

let groups = 0;
function test(name: string, body: () => void) {
  body();
  groups++;
  console.log('PASS ' + name);
}
const json = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const ctx: VoyageContext = {
  worldId: 'fixture', worldEpoch: 'epoch', runId: 'voyage', seed: 12345,
  openedAtWorldMs: 1000, openedAtIslandMs: 10000,
};
function rig(): SailRig {
  return {
    lotId: 'rig', material: 'sail_raft',
    hull: { lotId: 'hull', material: 'raft', dryMg: 51000000, waterMg: 3000000 },
    mat: {
      lotId: 'mat', material: 'sail_mat', dryMg: 900000, waterMg: 180000,
      areaCm2: 20000, baseStrengthGf: 60000, torn: false,
      damage: { sunMs: 0, shadeMs: 0, rainMs: 0 },
    },
    mast: {
      lotId: 'mast', material: 'bamboo_mast', dryMg: 2000000, waterMg: 100000,
      lengthMm: 2500, baseStrengthGf: 40000, broken: false,
    },
    cords: [{
      lotId: 'cord', material: 'coir_rope', fiberDryMg: 136000, pithDryMg: 7000,
      waterMg: 14000, lengthMm: 8000, baseStrengthGf: 100000,
      damage: { sunMs: 0, shadeMs: 0, abrasions: 0 },
    }],
    cordUseRemainders: [{ lotId: 'cord', worldMs: 0 }],
  };
}
function cell(i: number, patch: Partial<SailCellV2> = {}): SailCellV2 {
  return {
    cellId: 'cell:' + i, worldId: ctx.worldId, worldEpoch: ctx.worldEpoch, runId: ctx.runId,
    fromWorldMs: 1000 + i * 30000, toWorldMs: 1000 + (i + 1) * 30000,
    confirmedAtWorldMs: 1000 + (i + 1) * 30000,
    fromIslandMs: 10000 + i * 390000, toIslandMs: 10000 + (i + 1) * 390000,
    aboard: true, windMmS: 5000, windToDeg: 0, gustMmS: null,
    headingDeg: 0, rain: false, sailUp: true, ...patch,
  };
}
function integers(value: unknown): boolean {
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (value === null || typeof value !== 'object') return typeof value !== 'bigint';
  return Object.values(value).every(integers);
}
function privateIds(pieces: CoirPiece[], i: number): CoirPiece[] {
  return pieces.map((p, n) => ({
    ...p, lotId: pieces.length === 1 ? p.lotId : ctx.runId + ':cord:' + i + ':' + (n + 1),
  }));
}
/** Independent full-array reference: PR21's event model owns each cord mutation.
 * No checkpoint step/project/replay function is used by this oracle. */
function fullReplay(original: SailRig, cells: SailCellV2[], clock: 'island' | 'world') {
  const out = json(original);
  const effects = original.cords.map((p, i) => ({
    sourceLotId: p.lotId, initial: json(p), pieces: [json(p)], sunMs: 0, shadeMs: 0,
    abrasions: 0, maxLoadGf: 0, carry: original.cordUseRemainders[i].worldMs,
    fracture: undefined as undefined | {
      gf: number; atWorldMs: number; atIslandMs: number; breakAtMm: number;
    },
  }));
  let east = 0n, north = 0n, along = 0n, sailingMs = 0;
  const broken: { cellId: string; part: 'sail' | 'mast' | 'cord'; lotId: string; marginGf: number }[] = [];
  const maxLoads = [
    { part: 'sail', lotId: out.mat.lotId, gf: 0 },
    { part: 'mast', lotId: out.mast.lotId, gf: 0 },
    ...effects.map(p => ({ part: 'cord', lotId: p.sourceLotId, gf: 0 })),
  ];
  let last: { powered: boolean; paddling: boolean; speedMmS: number; forceGf: number } | null = null;
  for (const x of cells) {
    const known = x.windMmS !== null && x.windToDeg !== null;
    const up = x.sailUp && !out.mat.torn && !out.mast.broken && !effects.some(p => p.fracture);
    const v = up && known
      ? equilibriumSpeedMmS(x.windMmS!, out.mat.areaCm2, angleDelta(x.windToDeg!, x.headingDeg)) : 0;
    const gust = x.gustMmS ?? Number(BigInt(x.windMmS ?? 0) * 14n / 10n);
    const force = up && known ? sailForceGf(out.mat.areaCm2, Math.max(0, gust - Math.max(PADDLE_MM_S, v))) : 0;
    const candidates: typeof broken = [];
    if (up) {
      const ms = sailStrength(out.mat);
      if (force > ms) candidates.push({
        cellId: x.cellId, part: 'sail', lotId: out.mat.lotId, marginGf: ms - force,
      });
      if (force > out.mast.baseStrengthGf) candidates.push({
        cellId: x.cellId, part: 'mast', lotId: out.mast.lotId,
        marginGf: out.mast.baseStrengthGf - force,
      });
      for (let i = 0; i < effects.length; i++) {
        const p = effects[i], before = p.pieces[0];
        const dc = {
          worldId: ctx.worldId, worldEpoch: ctx.worldEpoch, runId: ctx.runId + ':ref:' + i,
          openedAtWorldMs: x.fromWorldMs, openedAtIslandMs: x.fromIslandMs,
        };
        const dm = createIntegerCordDamageModel(before, COIR_CORD_ASSUMPTION_ID, dc);
        const common = {
          worldId: dc.worldId, worldEpoch: dc.worldEpoch, runId: dc.runId,
        };
        const strength = currentIntegerCordStrength(before);
        const ds = dm.commit(dm.start(), {
          ...common, kind: 'load', clock: 'world', eventId: x.cellId + ':load',
          atMs: x.fromWorldMs, gf: force * 2,
        });
        p.maxLoadGf = Math.max(p.maxLoadGf, force * 2);
        const result = dm.project(ds);
        p.pieces = privateIds(result.pieces, i);
        if (result.status === 'broken') {
          p.fracture = {
            gf: force * 2, atWorldMs: x.fromWorldMs, atIslandMs: x.fromIslandMs,
            breakAtMm: Math.floor(before.lengthMm / 2),
          };
          candidates.push({
            cellId: x.cellId, part: 'cord', lotId: p.sourceLotId, marginGf: strength - force * 2,
          });
        }
        maxLoads[i + 2].gf = Math.max(maxLoads[i + 2].gf, force * 2);
      }
      maxLoads[0].gf = Math.max(maxLoads[0].gf, force);
      maxLoads[1].gf = Math.max(maxLoads[1].gf, force);
    }
    candidates.sort((a, b) => a.marginGf !== b.marginGf
      ? a.marginGf < b.marginGf ? -1 : 1
      : a.part + ':' + a.lotId < b.part + ':' + b.lotId ? -1 : 1);
    for (const b of candidates) {
      broken.push(b);
      if (b.part === 'sail') out.mat.torn = true;
      if (b.part === 'mast') out.mast.broken = true;
    }
    const survives = up && candidates.length === 0;
    const dt = clock === 'island' ? x.toIslandMs - x.fromIslandMs : x.toWorldMs - x.fromWorldMs;
    const speed = survives && known ? Math.max(PADDLE_MM_S, v) : PADDLE_MM_S;
    east += BigInt(speed) * BigInt(dt) * BigInt(cosDeg(x.headingDeg));
    north += BigInt(speed) * BigInt(dt) * BigInt(sinDeg(x.headingDeg));
    along += BigInt(speed) * BigInt(dt) * 1000000n;
    if (survives) {
      sailingMs += dt;
      out.mat.damage[x.rain === true ? 'rainMs' : 'sunMs'] += x.toIslandMs - x.fromIslandMs;
      for (const p of effects) {
        const dcSun = {
          worldId: ctx.worldId, worldEpoch: ctx.worldEpoch, runId: ctx.runId + ':sun',
          openedAtWorldMs: x.fromWorldMs, openedAtIslandMs: x.fromIslandMs,
        };
        const dmSun = createIntegerCordDamageModel(p.pieces[0], COIR_CORD_ASSUMPTION_ID, dcSun);
        p.pieces = dmSun.project(dmSun.commit(dmSun.start(), {
          kind: 'exposure', clock: 'island', eventId: x.cellId + ':sun',
          worldId: dcSun.worldId, worldEpoch: dcSun.worldEpoch, runId: dcSun.runId,
          fromIslandMs: x.fromIslandMs, toIslandMs: x.toIslandMs,
          atMs: x.toIslandMs, shade: false,
        })).pieces;
        p.sunMs += x.toIslandMs - x.fromIslandMs;
        const used = p.carry + dt, abrasion = Math.floor(used / 3600000);
        p.carry = used % 3600000;
        if (abrasion) {
          const dc = {
            worldId: ctx.worldId, worldEpoch: ctx.worldEpoch, runId: ctx.runId + ':abrasion',
            openedAtWorldMs: x.fromWorldMs, openedAtIslandMs: x.toIslandMs,
          };
          const m = createIntegerCordDamageModel(p.pieces[0], COIR_CORD_ASSUMPTION_ID, dc);
          p.pieces = m.project(m.commit(m.start(), {
            kind: 'abrasion', clock: 'world', eventId: x.cellId + ':abrasion',
            worldId: dc.worldId, worldEpoch: dc.worldEpoch, runId: dc.runId,
            atMs: x.toWorldMs, count: abrasion,
          })).pieces;
          p.abrasions += abrasion;
        }
      }
    }
    last = {
      powered: survives && known && v >= PADDLE_MM_S,
      paddling: !survives || !known || v < PADDLE_MM_S,
      speedMmS: speed, forceGf: force,
    };
  }
  out.cords = effects.flatMap(p => p.pieces);
  out.cordUseRemainders = effects.flatMap(p => p.pieces.map(piece => ({
    lotId: piece.lotId, worldMs: p.carry,
  })));
  return {
    rig: out, maxLoads, broken, sailingMs, last,
    numerators: [east.toString(), north.toString(), along.toString()],
    distance: {
      eastMm: Number(east / 1000000000n), northMm: Number(north / 1000000000n),
      alongHeadingMm: Number(along / 1000000000n), sidewaysMm: 0,
    },
    effects: effects.map(({ carry: _carry, fracture, ...p }) => ({
      ...p, ...(fracture ? { break: fracture } : {}),
    })),
  };
}

test('explicit clock IDs bind saves and the configured initial clock is island', () => {
  assert.equal(SAIL_MOTION_CLOCK, 'island');
  const a = createSailRaftVoyage(rig(), SAIL_RAFT_ISLAND_ID, ctx);
  const b = createSailRaftVoyage(rig(), SAIL_RAFT_WORLD_ID, ctx);
  assert.throws(() => b.restoreCheckpoint(a.startCheckpoint()));
  assert.throws(() => a.restoreCheckpoint({ ...a.startCheckpoint(), assumptionId: SAIL_RAFT_WORLD_ID }));
  assert.throws(() => createCheckpointVoyage(rig(), SAIL_RAFT_ID, ctx));
});
test('fold equals independent full replay for 240 seeded voyages under both clocks', () => {
  let seed = 12345;
  const random = (n: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  for (let trial = 0; trial < 240; trial++) {
    const source = rig();
    source.mat.baseStrengthGf = 20000 + random(100000);
    source.mast.baseStrengthGf = 10000 + random(90000);
    source.cords[0].baseStrengthGf = 5000 + random(160000);
    const cells = Array.from({ length: 5 + random(30) }, (_, i) => {
      const missing = random(9) === 0, wind = random(23000);
      return cell(i, {
        windMmS: missing ? null : wind, windToDeg: missing ? null : random(360),
        gustMmS: missing || random(3) === 0 ? null : wind + random(10000),
        rain: random(3) === 0 ? null : random(2) === 0,
        sailUp: random(5) !== 0, headingDeg: random(360),
      });
    });
    // Ensure calm, outside sector and unknown weather remain represented even
    // in voyages where an early gust breaks the rig.
    cells[0] = cell(0, { windMmS: 0, gustMmS: 0 });
    if (cells.length > 1) cells[1] = cell(1, { headingDeg: 61, rain: true });
    if (cells.length > 2) cells[2] = cell(2, {
      windMmS: null, windToDeg: null, gustMmS: null, rain: null,
    });
    for (const clock of ['island', 'world'] as const) {
      const m = createCheckpointVoyage(source,
        clock === 'island' ? SAIL_RAFT_ISLAND_ID : SAIL_RAFT_WORLD_ID, ctx);
      let saved = m.startCheckpoint();
      for (const c of cells) {
        saved = m.step(m.restoreCheckpoint(json(saved)), c);
        assert.ok(integers(saved));
        assert.deepEqual(m.step(saved, c), saved);
      }
      const actual = m.projectCheckpoint(saved), expected = fullReplay(source, cells, clock);
      assert.deepEqual(actual.rig, expected.rig);
      assert.deepEqual(actual.distance, expected.distance);
      assert.deepEqual(actual.maxLoads, expected.maxLoads);
      assert.deepEqual(actual.broken, expected.broken);
      assert.equal(actual.sailingMs, expected.sailingMs);
      assert.deepEqual(actual.cordEffects, expected.effects);
      assert.deepEqual([saved.eastNumerator, saved.northNumerator, saved.alongNumerator],
        expected.numerators);
      const { powered, paddling, speedMmS, forceGf } = actual.last!;
      assert.deepEqual({ powered, paddling, speedMmS, forceGf }, expected.last);
      assert.deepEqual(m.replayCheckpoint(cells), saved);
      assert.ok(m.observeCheckpoint(saved).every(s => !/[0-9]|gf|mm|seed|係数|強さ/.test(s)));
    }
  }
});
test('v1 replay and words remain identical to the pinned original in 200 voyages including drift', () => {
  for (let trial = 0; trial < 200; trial++) {
    const source = rig(), cells: SailCell[] = Array.from({ length: 4 }, (_, i) => cell(i, {
      headingDeg: (trial * 7 + i * 37) % 360,
      windToDeg: (trial * 19) % 360, windMmS: trial % 5 === 0 ? 0 : 1000 + trial * 60,
      gustMmS: null, rain: trial % 2 === 0, sailUp: i % 3 !== 0,
    }) as SailCell);
    const a = createSailRaftVoyage(source, SAIL_RAFT_ID, ctx);
    const b = frozenV1(source, SAIL_RAFT_ID, ctx);
    const sa = a.commit(a.start(), cells), sb = b.commit(b.start(), cells);
    assert.deepEqual(sa, sb);
    assert.deepEqual(a.project(sa), b.project(sb));
    assert.deepEqual(a.observe(sa), b.observe(sb));
  }
});
test('paddling, frozen wind load and island/world distance selection obey the v2 policy', () => {
  for (const clock of ['island', 'world'] as const) {
    const m = createCheckpointVoyage(rig(),
      clock === 'island' ? SAIL_RAFT_ISLAND_ID : SAIL_RAFT_WORLD_ID, ctx);
    const dt = clock === 'island' ? 390000 : 30000;
    for (const patch of [
      { windMmS: null, windToDeg: null, gustMmS: null, rain: null },
      { sailUp: false }, { windMmS: 0, gustMmS: 0 }, { headingDeg: 61 },
    ] as Partial<SailCellV2>[]) {
      const p = m.projectCheckpoint(m.step(m.startCheckpoint(), cell(0, patch)));
      assert.equal(p.distance.alongHeadingMm, Number(BigInt(PADDLE_MM_S) * BigInt(dt) / 1000n));
      assert.equal(p.last!.paddling, true);
    }
    const fast = m.projectCheckpoint(m.step(m.startCheckpoint(), cell(0, { windMmS: 10000 })));
    assert.equal(fast.last!.speedMmS, 882);
    assert.equal(fast.last!.powered, true);
    const unknown = m.projectCheckpoint(m.step(m.startCheckpoint(), cell(0, {
      windMmS: null, windToDeg: null, rain: null,
    })));
    assert.equal(unknown.rig.mat.damage.sunMs, 390000);
    assert.equal(unknown.rig.cords[0].damage.sunMs, 390000);
    assert.equal(unknown.maxLoads[0].gf, 0);
  }
});
test('gaps do not advance distance or abrasion, and malformed saves and duplicate edits reject', () => {
  const m = createCheckpointVoyage(rig(), SAIL_RAFT_ISLAND_ID, ctx);
  const first = m.step(m.startCheckpoint(), cell(0));
  const gap = cell(8);
  const next = m.step(first, gap);
  assert.equal(next.sailingMs, 780000);
  assert.equal(m.projectCheckpoint(next).distance.eastMm, 433680);
  assert.throws(() => m.step(first, { ...cell(0), windMmS: 9999 }));
  assert.throws(() => m.step(first, cell(0, { cellId: 'old' })));
  assert.throws(() => m.restoreCheckpoint({ ...first, schema: 'prototype-sail-raft-checkpoint/1' }));
  assert.throws(() => m.restoreCheckpoint({ ...first, eastNumerator: '1.5' }));
  assert.throws(() => m.restoreCheckpoint({ ...first, cords: [{}] }));
  assert.throws(() => m.restoreCheckpoint({ ...first, mat: { ...first.mat, baseStrengthGf: 1 } }));
  assert.throws(() => m.restoreCheckpoint({ ...first, last: [] }));
});
test('load-surviving-exposure-abrasion and fracture metadata agree with integer PR21 without lost mass', () => {
  const source = rig();
  source.cords[0].baseStrengthGf = 1000;
  const m = createCheckpointVoyage(source, SAIL_RAFT_ISLAND_ID, ctx);
  const p = m.projectCheckpoint(m.step(m.startCheckpoint(), cell(0)));
  const effect = p.cordEffects[0];
  assert.ok(effect.break);
  assert.equal(effect.pieces.length, 2);
  assert.equal(effect.sunMs, 0);
  assert.equal(p.rig.mat.damage.sunMs, 0);
  for (const key of ['fiberDryMg', 'pithDryMg', 'waterMg', 'lengthMm'] as const) {
    assert.equal(effect.pieces.reduce((n, v) => n + v[key], 0), source.cords[0][key]);
  }
  assert.ok(effect.break!.gf > currentIntegerCordStrength(effect.pieces[0]));
});
test('six-hour and longer checkpoint storage is bounded and per-cell folding stays under 5 ms', () => {
  const source = rig(), m = createCheckpointVoyage(source, SAIL_RAFT_ISLAND_ID, ctx);
  let p = m.startCheckpoint(), earlyBytes = 0, sixBytes = 0;
  const costs: number[] = [];
  for (let i = 0; i < 1440; i++) {
    const x = cell(i, { windMmS: 0, gustMmS: null, rain: null });
    const t = performance.now();
    p = m.step(p, x);
    costs.push(performance.now() - t);
    if (i === 63) earlyBytes = Buffer.byteLength(JSON.stringify(p));
    if (i === 719) sixBytes = Buffer.byteLength(JSON.stringify(p));
  }
  const bytes = Buffer.byteLength(JSON.stringify(p));
  assert.ok(sixBytes < 10000 && bytes < 10000);
  assert.ok(bytes - earlyBytes < 256);
  // Warm batch averages are insensitive to scheduler pauses; report maximum too.
  const first = costs.slice(64, 364).reduce((a, b) => a + b, 0) / 300;
  const last = costs.slice(-300).reduce((a, b) => a + b, 0) / 300;
  assert.ok(first <= 5 && last <= 5, JSON.stringify({ first, last }));
  console.log(JSON.stringify({
    sixHourCheckpointBytes: sixBytes, twelveHourCheckpointBytes: bytes,
    earlyMeanCellMs: first, lateMeanCellMs: last, maxCellMs: Math.max(...costs),
  }));
});
console.log('PASS sail raft checkpoint: ' + groups + ' groups.');
