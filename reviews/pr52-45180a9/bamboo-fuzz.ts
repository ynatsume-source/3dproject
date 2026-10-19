import { bambooQualityFromLegacyMass } from '../src/science/prototypes/sail-raft-inputs';
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

let sd = 77; const rr = (n: number) => { sd = (sd * 1103515245 + 12345) >>> 0; return Math.floor((sd / 4294967296) * n); };
let cuts = 0, chains = 0, tubes = 0, legacy = 0;
for (let k = 0; k < 400; k++) {
  const m = 3_000_000 + rr(20_000_000);
  const q = rr(3) === 0 ? bambooQualityFromLegacyMass(m) : { dry_mg: 1 + rr(m - 1), water_mg: 0, length_mm: 2000 + rr(9000) };
  if (q.water_mg === 0) q.water_mg = m - q.dry_mg;
  let cur = bambooSource(q.dry_mg, q.water_mg, q.length_mm); const ratio0 = q.water_mg / m, len0 = q.length_mm / m;
  for (let c = 0; c < 6; c++) {
    const before = readPlantMass(cur); let out: ScienceStepResult | null = null;
    for (let seed = 1 + rr(1000), i = 0; i < 50; i++, seed++) { const req = cutRequest(cur, seed); const o = bambooTubeStep(req); assert.equal(o.status, 'completed'); assert.deepEqual(validateResult(req, o), []); if (o.produced.some(p => p.materialId === 'bamboo_tube')) { out = o; break; } }
    if (!out) break;
    tubes++; cuts++;
    const rem = out.produced.find(p => p.materialId === 'bamboo'); if (!rem) break;
    cur = lot('lot:bamboo-cut', rem); const p = readPlantMass(cur);
    assert.equal(p.dryMg + p.waterMg, rem.amount.value, 'mass closes');
    assert.ok(p.dryMg > 0, 'dry positive');
    assert.ok(Math.abs(p.waterMg - ratio0 * rem.amount.value) <= c + 2, `water ratio kept within rounding (cut ${c})`);
    assert.ok(p.lengthMm <= before.lengthMm! && Math.abs(p.lengthMm! - len0 * rem.amount.value) <= c + 2, 'length scaled');
    assert.equal(rem.quality!.history_complete, 0); assert.equal(rem.quality!.sail_codec, 1);
  }
  chains++;
}
// old bamboo with no quality: the remainder still carries none, as before
for (let k = 0; k < 50; k++) { const m = 3_000_000 + rr(5_000_000); const src: LotView = { lotId: 'lot:old', materialId: 'bamboo', amount: { value: m, unit: 'mg' }, location: 'shelf' } as any;
  for (let seed = 1; seed < 60; seed++) { const o = bambooTubeStep(cutRequest(src, seed)); const rem = o.produced.find(p => p.materialId === 'bamboo'); if (o.produced.some(p => p.materialId === 'bamboo_tube') && rem) { assert.equal(rem.quality, undefined); const p = readPlantMass(lot('x', rem)); assert.equal(p.dryMg + p.waterMg, rem.amount.value); legacy++; break; } } }
console.log(`PASS chains ${chains}, cuts ${cuts}, tubes ${tubes}, old bamboo remainders ${legacy}`);
