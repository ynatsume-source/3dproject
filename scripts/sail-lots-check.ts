import assert from 'node:assert/strict';
import {
  addLot,
  assembleParts,
  disassembleParts,
  emptyLedger,
  type AssemblyTable
} from '../src/world/process-runner';
import type { LotView, ScienceStepResult } from '../src/world/science-contract';
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

console.log('sail-lots-check: ' + groups + ' groups passed');
