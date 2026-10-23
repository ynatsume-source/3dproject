import assert from 'node:assert/strict';
import {
  addLot,
  assembleParts,
  disassembleParts,
  emptyLedger,
  type AssemblyTable
} from '../src/world/process-runner';
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import {
  readPlantMass,
  readSailMat,
  readBambooMast,
  readSailHistory,
  writePlantMass,
  writeSailMat,
  writeBambooMast,
  raftHullFromPieces,
  RAFT_PIECE,
  SailLotError
} from '../src/world/sail-lots';
import { SAIL_RIG_PARTS, sailRigParts } from '../src/world/sail-rig-parts';
import { readCordPiece, writeCordPiece } from '../src/world/coir-cord-lots';
import type { CoirPiece } from '../src/science/prototypes/coir-cord-types';
import type {
  PlantMass,
  SailMat,
  BambooMast
} from '../src/science/prototypes/sail-raft-rules';


import {
  BAMBOO_TUBE_PROCESS,
  bambooTubeStep
} from '../src/science/step/bamboo-tube';
import { bambooTubeStep as legacyBambooTubeStep } from './fixtures/bamboo-tube-v010';
import { validateResult } from '../src/science/step/validate';
import { CATALOG, canResumeProcessVersion } from '../src/world/process-catalog';
import {
  createSailManufacturingModel
} from '../src/science/prototypes/sail-raft-manufacturing';
import { SAIL_RAFT_ID, SAIL_RULES } from '../src/science/prototypes/sail-raft-rules';

type Produced = ScienceStepResult['produced'][number];
let groups = 0;
function test(name: string, body: () => void): void {
  body();
  groups++;
  console.log('PASS ' + name);
}
function json<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
function lot(id: string, produced: Produced): LotView {
  return {
    lotId: id,
    materialId: produced.materialId,
    amount: produced.amount,
    quality: produced.quality,
    location: produced.into!
  };
}
const mat = (): SailMat => ({
  lotId: 'mat',
  material: 'sail_mat',
  dryMg: 900000,
  waterMg: 180000,
  areaCm2: 20000,
  baseStrengthGf: 60000,
  torn: false,
  damage: { sunMs: 4321000, shadeMs: 97000, rainMs: 27000 }
});
const mast = (): BambooMast => ({
  lotId: 'mast',
  material: 'bamboo_mast',
  dryMg: 2083680,
  waterMg: 833472,
  lengthMm: 2500,
  baseStrengthGf: 40000,
  broken: false
});
const cord = (id: string, material: CoirPiece['material'], lengthMm: number): CoirPiece => ({
  lotId: id,
  material,
  fiberDryMg: 40000,
  pithDryMg: 4000,
  waterMg: 4400,
  lengthMm,
  baseStrengthGf: 92000,
  damage: { sunMs: 123456, shadeMs: 654321, abrasions: 9 },
  inheritedWear: { faded: true, abraded: false }
});
function fixture(twoCords = false) {
  const L = emptyLedger('sail-fixture', 'epoch');
  const cords = twoCords
    ? [cord('rope', 'coir_rope', 4500), cord('strand', 'coir_strand', 3500)]
    : [cord('rope', 'coir_rope', 8000)];
  const materials = [
    lot('mat', writeSailMat(mat(), 'beach', 0)),
    lot('mast', writeBambooMast(mast(), 'beach', 1)),
    ...cords.map(piece => lot(piece.lotId, writeCordPiece(piece, 'beach', 1)))
  ];
  for (const material of materials) addLot(L, material);
  const table = sailRigParts(cords.length, cords.map(piece => piece.material));
  return { L, materials, table };
}
function assemble(f: ReturnType<typeof fixture>): string {
  const result = assembleParts(f.L, f.materials.map(part => part.lotId), f.table, 1000);
  assert.ok(result.equipment, result.why);
  return result.equipment.equipmentId;
}

test('plant codecs close integer mass, preserve history, and round-trip all material kinds', () => {
  const plants: PlantMass[] = [
    ...(['pandanus_standing_leaves', 'pandanus_leaves', 'pandanus_strips', 'pandanus_leaf_scrap'] as const)
      .map(material => ({ lotId: material, material, dryMg: 900001, waterMg: 180007 })),
    { lotId: 'bamboo', material: 'bamboo', dryMg: 5000000, waterMg: 2000000, lengthMm: 6000 }
  ];
  for (const plant of plants) {
    for (const history of [0, 1] as const) {
      const saved = lot(plant.lotId, writePlantMass(plant, 'beach', history));
      assert.deepEqual(readPlantMass(json(saved)), plant);
      assert.equal(readSailHistory(saved), history);
      assert.equal(saved.amount.value, plant.dryMg + plant.waterMg);
      assert.ok(Object.values(saved.quality!).every(Number.isSafeInteger));
    }
  }
});

test('mat and mast retain hidden wear, strength, broken flags, water and provenance', () => {
  const m = mat();
  m.torn = true;
  const b = mast();
  b.broken = true;
  assert.deepEqual(readSailMat(lot(m.lotId, writeSailMat(m, 'site', 0))), m);
  assert.deepEqual(readBambooMast(lot(b.lotId, writeBambooMast(b, 'site', 1))), b);
});

test('legacy bamboo conversion uses integer mass and does not invent provenance', () => {
  const legacy: LotView = {
    lotId: 'old-bamboo',
    materialId: 'bamboo',
    amount: { value: 6000000, unit: 'mg' },
    location: 'beach'
  };
  assert.deepEqual(readPlantMass(legacy), {
    lotId: 'old-bamboo',
    material: 'bamboo',
    dryMg: 4285714,
    waterMg: 1714286,
    lengthMm: 5142
  });
  assert.equal(readSailHistory(legacy), 0);
  const canonical = lot('old-bamboo', writePlantMass(readPlantMass(legacy), 'beach', 0));
  assert.deepEqual(readPlantMass(canonical), readPlantMass(legacy));
});

test('strict material quality refuses unknown keys, fractional mass, wrong sums and versions', () => {
  const original = lot('mat', writeSailMat(mat(), 'site', 1));
  for (const mutate of [
    (q: Record<string, number>) => { q.hidden_other_value = 42; },
    (q: Record<string, number>) => { q.water_mg += 0.5; },
    (q: Record<string, number>) => { q.water_mg++; },
    (q: Record<string, number>) => { q.sail_codec = 2; },
    (q: Record<string, number>) => { q.history_complete = 2; }
  ]) {
    const bad = json(original);
    mutate(bad.quality!);
    assert.throws(() => readSailMat(bad));
  }
  assert.throws(() => writePlantMass({
    lotId: 'leaf', material: 'pandanus_leaves',
    dryMg: Number.MAX_SAFE_INTEGER, waterMg: 1
  }, 'site', 1), SailLotError);
});

test('virtual raft hull has six exact pieces and rejects nonintegers and overflow', () => {
  assert.deepEqual(RAFT_PIECE, { dryMg: 8500000, waterMg: 500000 });
  assert.deepEqual(raftHullFromPieces('raft', 6), {
    lotId: 'raft', material: 'raft', dryMg: 51000000, waterMg: 3000000
  });
  for (const pieces of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => raftHullFromPieces('raft', pieces), SailLotError);
  }
});

test('rig takes whole mat, mast and mixed cords; the virtual hull is not a part', () => {
  const f = fixture(true);
  const id = assemble(f);
  const equipment = f.L.equipment[id];
  assert.equal(equipment.kind, 'sail_rig');
  assert.equal(equipment.assembled!.parts!.length, 4);
  assert.deepEqual(equipment.assembled!.parts, f.materials);
  assert.equal(equipment.params.cord_count, 2);
  assert.equal(equipment.params.rig_ms, 1800000);
  assert.equal(equipment.params.cord_use_ms_0, 0);
  assert.equal(equipment.params.cord_use_ms_1, 0);
  assert.deepEqual(Object.keys(f.L.lots), []);
});

test('keepLotIds returns exact original IDs, mixed cord materials, current wear and all mass', () => {
  const f = fixture(true);
  const id = assemble(f);
  const parts = f.L.equipment[id].assembled!.parts!;
  parts[0].quality!.sun_ms += 600000;
  parts[0].quality!.torn = 1;
  parts[1].quality!.broken = 1;
  parts[2].quality!.abrasions += 1;
  const expected = json(parts);
  const beforeSeq = f.L.seq;
  const result = disassembleParts(f.L, id, f.table, undefined, { keepLotIds: true });
  assert.ok(result.lots, result.why);
  assert.deepEqual(result.lots, expected);
  assert.equal(f.L.seq, beforeSeq);
  assert.ok(!f.L.equipment[id]);
  assert.equal(readSailHistory(result.lots[0]), 0);
  assert.equal(readCordPiece(result.lots[3]).material, 'coir_strand');
  assert.equal(readCordPiece(result.lots[2]).damage.abrasions, 10);
  assert.equal(readSailMat(result.lots[0]).torn, true);
});

test('default disassembly continues to allocate fresh IDs and equal mass', () => {
  const f = fixture();
  const id = assemble(f);
  const beforeSeq = f.L.seq;
  const result = disassembleParts(f.L, id, SAIL_RIG_PARTS);
  assert.ok(result.lots, result.why);
  assert.equal(f.L.seq, beforeSeq + 3);
  assert.ok(result.lots.every(part => !f.materials.some(old => old.lotId === part.lotId)));
  assert.deepEqual(result.lots.map(part => part.amount), f.materials.map(part => part.amount));
  assert.deepEqual(result.lots.map(part => part.quality), f.materials.map(part => part.quality));
});

test('retained ID collision, repeated ID and reserved equipment refuse atomically', () => {
  for (const kind of ['collision', 'repeat', 'reserved'] as const) {
    const f = fixture();
    const id = assemble(f);
    if (kind === 'collision') addLot(f.L, f.materials[1]);
    if (kind === 'repeat') f.L.equipment[id].assembled!.parts![1].lotId = 'mat';
    if (kind === 'reserved') f.L.equipment[id].reservedBy = 'other-run';
    const before = JSON.stringify(f.L);
    assert.ok(disassembleParts(f.L, id, f.table, undefined, { keepLotIds: true }).why);
    assert.equal(JSON.stringify(f.L), before);
  }
});

test('broken override keeps ID and mass; a table failure leaves everything untouched', () => {
  const f = fixture();
  const id = assemble(f);
  const broken: AssemblyTable = {
    version: 'fixture/1', kind: 'sail-rig-part', catalogEntry: 'fixture',
    catalogVersion: 'fixture', materials: [],
    toParams: () => ({}),
    qualityOnReturn: quality => quality,
    brokenMaterial: 'bamboo_fragments',
    brokenQuality: quality => quality
  };
  const result = disassembleParts(
    f.L, id, f.table, { parts: [1], as: broken }, { keepLotIds: true }
  );
  assert.ok(result.lots, result.why);
  assert.equal(result.lots[1].lotId, 'mast');
  assert.equal(result.lots[1].materialId, 'bamboo_fragments');
  assert.deepEqual(result.lots[1].amount, f.materials[1].amount);

  const other = fixture();
  const otherId = assemble(other);
  const before = JSON.stringify(other.L);
  const bad = { ...other.table, partsOnReturn: () => { throw Error('not ready'); } };
  assert.ok(disassembleParts(other.L, otherId, bad, undefined, { keepLotIds: true }).why);
  assert.equal(JSON.stringify(other.L), before);
});

test('too little cord, wrong material roles, torn mat and broken mast refuse before mutation', () => {
  for (const kind of ['short', 'wrong-role', 'torn', 'broken'] as const) {
    const f = fixture();
    if (kind === 'short') f.L.lots.rope.quality!.length_mm = 7999;
    if (kind === 'wrong-role') f.L.lots.rope.materialId = 'coir_strand';
    if (kind === 'torn') f.L.lots.mat.quality!.torn = 1;
    if (kind === 'broken') f.L.lots.mast.quality!.broken = 1;
    const before = JSON.stringify(f.L);
    assert.ok(assembleParts(f.L, ['mat', 'mast', 'rope'], f.table, 1000).why);
    assert.equal(JSON.stringify(f.L), before);
  }
});


function bambooSource(dryMg = 5_000_003, waterMg = 2_000_004, lengthMm = 6_001): LotView {
  return lot('lot:bamboo-cut', writePlantMass({
    lotId: 'lot:bamboo-cut', material: 'bamboo', dryMg, waterMg, lengthMm
  }, 'site:bamboo', 0));
}

function cutRequest(
  bamboo: LotView,
  seed = 1,
  from = 0,
  to = 600_000,
  state: ScienceStepRequest['state'] = null
): ScienceStepRequest {
  return {
    contract: '0.2.1',
    requestId: 'cut@' + from,
    world: { worldId: 'world:bamboo', worldEpoch: 'epoch:bamboo', worldVersion: 1 },
    runId: 'run:cut',
    ...BAMBOO_TUBE_PROCESS,
    catalogVersion: 'civ-sci-test-2',
    interval: { from, to },
    state,
    environment: { sampleId: 'env:cut', source: 'record', effectiveAt: from },
    lots: [bamboo],
    equipment: [],
    energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: (to - from) * 20 / 1_000 }],
    actions: state === null
      ? [{ at: from, residentId: 'res:worker', action: 'cut', params: { lengthMm: 350 } }]
      : [],
    seed
  };
}

function finishedCut(source: LotView): ScienceStepResult {
  for (let seed = 1; seed <= 100; seed++) {
    const req = cutRequest(source, seed);
    const out = bambooTubeStep(req);
    assert.equal(out.status, 'completed');
    assert.deepEqual(validateResult(req, out), []);
    if (out.produced.some(p => p.materialId === 'bamboo_tube')) return out;
  }
  throw Error('No successful cut in fixed seeds');
}

test('tube remainders preserve mass and proportions and can become a mast', () => {
  for (const codec of [true, false]) {
    const source = bambooSource();
    if (!codec) {
      delete source.quality!.sail_codec;
      delete source.quality!.history_complete;
    }
    const before = json(source);
    const out = finishedCut(source);
    assert.deepEqual(source, before);
    const remainder = lot('lot:remaining', out.produced.find(p => p.materialId === 'bamboo')!);
    const p = readPlantMass(remainder);
    const r = BigInt(remainder.amount.value);
    const m = BigInt(source.amount.value);
    assert.equal(p.waterMg, Number(BigInt(source.quality!.water_mg) * r / m));
    assert.equal(p.dryMg, remainder.amount.value - p.waterMg);
    assert.equal(p.lengthMm, Number(BigInt(source.quality!.length_mm) * r / m));
    assert.deepEqual(Object.keys(remainder.quality!).sort(), Object.keys(source.quality!).sort());
    assert.equal(readSailHistory(remainder), 0);
    assert.equal(out.produced.reduce((n, x) => n + x.amount.value, 0), source.amount.value);
    const model = createSailManufacturingModel(
      { operation: 'mast', source: p },
      SAIL_RAFT_ID,
      { worldId: 'world:bamboo', worldEpoch: 'epoch:bamboo', runId: 'run:mast',
        seed: 1, clock: 'world', openedAtMs: 0 }
    );
    const state = model.commit(model.start(), {
      confirmationId: 'work:mast', worldId: 'world:bamboo', worldEpoch: 'epoch:bamboo',
      runId: 'run:mast', clock: 'world', fromMs: 0, toMs: SAIL_RULES.mastMs,
      confirmedAtMs: SAIL_RULES.mastMs, kind: 'host-confirmed-manual-work',
      actorId: 'res:worker', attendance: 'present'
    });
    const result = model.project(state);
    assert.equal(result.status, 'completed');
    assert.equal(result.material!.material, 'bamboo_mast');
    assert.equal(
      result.material!.dryMg + result.material!.waterMg
        + result.remaining!.dryMg + result.remaining!.waterMg,
      remainder.amount.value
    );
  }
});

test('qualityless legacy bamboo stays qualityless and keeps the frozen cutting result', () => {
  const comparable = (out: ScienceStepResult) => {
    const value = json(out);
    value.evidence.evaluatorVersion = 'comparison';
    for (const p of value.produced) {
      if (p.quality && Object.keys(p.quality).length === 0) delete p.quality;
    }
    return value;
  };
  const qualities: (Record<string, number> | undefined)[] = [
    undefined, {}, { water_ppm: 450_000, history_complete: 0 }
  ];
  for (const quality of qualities) {
    const source: LotView = {
      lotId: 'lot:bamboo-cut', materialId: 'bamboo',
      amount: { value: 7_000_000, unit: 'mg' }, location: 'site:bamboo',
      ...(quality === undefined ? {} : { quality })
    };
    for (let seed = 1; seed <= 64; seed++) {
      const req = cutRequest(source, seed);
      const actual = bambooTubeStep(req);
      const expected = legacyBambooTubeStep({ ...req, processVersion: '0.1.0' });
      assert.deepEqual(comparable(actual), comparable(expected));
      const stopReq = { ...cutRequest(source, seed, 0, 30_000), stop: 'operator' as const };
      const stopped = bambooTubeStep(stopReq);
      assert.deepEqual(comparable(stopped), comparable(legacyBambooTubeStep({
        ...stopReq, processVersion: '0.1.0'
      })));
      if (quality === undefined || Object.keys(quality).length === 0) {
        for (const out of [actual, stopped]) {
          const rest = lot('lot:remaining', out.produced.find(p => p.materialId === 'bamboo')!);
          assert.equal(rest.quality, undefined);
          assert.doesNotThrow(() => readPlantMass(rest));
        }
      }
    }
  }
});

test('old bamboo work saves resume under the original or current version without state migration', () => {
  const source = bambooSource();
  const req = { ...cutRequest(source, 1, 0, 240_000), processVersion: '0.1.0' };
  const first = legacyBambooTubeStep(req);
  assert.equal(first.status, 'running');
  assert.equal(first.state.schema, 'civ-sci.bamboo-tube/1');
  const expected = bambooTubeStep(cutRequest(source));
  for (const version of ['0.1.0', BAMBOO_TUBE_PROCESS.processVersion]) {
    const next = cutRequest(source, 1, 240_000, 600_000, json(first.state));
    next.processVersion = version;
    const out = bambooTubeStep(next);
    assert.equal(out.status, 'completed');
    assert.deepEqual(out.produced, expected.produced);
    assert.deepEqual(out.state, expected.state);
    assert.deepEqual(bambooTubeStep(next), out);
    assert.deepEqual(validateResult(next, out), []);
  }
  const entry = CATALOG.find(e => e.processId === BAMBOO_TUBE_PROCESS.processId)!;
  assert.equal(entry.processVersion, '0.1.1');
  assert.equal(canResumeProcessVersion(entry, '0.1.0'), true);
  assert.equal(canResumeProcessVersion(entry, '0.1.1'), true);
  assert.equal(canResumeProcessVersion(entry, '0.0.9'), false);
  assert.equal(bambooTubeStep({ ...cutRequest(source), processVersion: '0.1.2' }).status, 'failed');
  const other = CATALOG.find(e => e.processId !== entry.processId)!;
  assert.equal(canResumeProcessVersion(other, other.processVersion), true);
  assert.equal(canResumeProcessVersion(other, 'unknown'), false);
});

test('bamboo cut ratios use BigInt at safe-integer limits and preserve positive dry matter', () => {
  for (const [dryMg, waterMg] of [
    [6_000_000_000_000_001, 2_000_000_000_000_001],
    [1, 7_000_002],
    [7_000_003, 0]
  ]) {
    const source = bambooSource(dryMg, waterMg, 6_000_000_000_001);
    const out = finishedCut(source);
    const rest = lot('lot:remaining', out.produced.find(p => p.materialId === 'bamboo')!);
    const p = readPlantMass(rest);
    const r = BigInt(rest.amount.value);
    const m = BigInt(source.amount.value);
    assert.equal(p.waterMg, Number(BigInt(waterMg) * r / m));
    assert.equal(p.dryMg, rest.amount.value - p.waterMg);
    assert.equal(p.lengthMm, Number(BigInt(source.quality!.length_mm) * r / m));
    assert.ok(p.dryMg >= 1);
    assert.ok(p.waterMg <= waterMg && p.dryMg <= dryMg);
  }
});

test('returned bamboo remains readable after repeated cuts; split and stop preserve quality', () => {
  let source = bambooSource();
  for (let i = 0; i < 30; i++) {
    const out = finishedCut(source);
    source = lot('lot:bamboo-cut', out.produced.find(p => p.materialId === 'bamboo')!);
    const mass = readPlantMass(source);
    assert.equal(mass.dryMg + mass.waterMg, source.amount.value);
  }
  let split = false;
  for (let seed = 1; seed <= 100; seed++) {
    const out = bambooTubeStep(cutRequest(source, seed));
    if (out.produced.length === 1) {
      split = true;
      assert.deepEqual(out.produced[0].quality, source.quality);
      assert.deepEqual(out.produced[0].amount, source.amount);
      break;
    }
  }
  assert.ok(split);
  const req = { ...cutRequest(source, 1, 0, 30_000), stop: 'operator' as const };
  const stopped = bambooTubeStep(req);
  assert.equal(stopped.status, 'stopped');
  assert.deepEqual(stopped.produced[0].quality, source.quality);
  assert.deepEqual(stopped.produced[0].amount, source.amount);
});

test('partial, fractional or nonclosing bamboo mass metadata is refused before BigInt settlement', () => {
  for (const mutate of [
    (q: Record<string, number>) => { delete q.water_mg; },
    (q: Record<string, number>) => { q.dry_mg += 0.5; },
    (q: Record<string, number>) => { q.length_mm = -1; },
    (q: Record<string, number>) => { q.water_mg++; }
  ]) {
    const source = bambooSource();
    mutate(source.quality!);
    const out = bambooTubeStep(cutRequest(source));
    assert.equal(out.status, 'failed');
    assert.deepEqual(out.consumed, []);
    assert.deepEqual(out.produced, []);
  }
});

console.log('sail-lots-check: ' + groups + ' groups passed');
