import {
  emptyLedger, addLot, assembleParts, disassembleParts,
} from '../src/world/process-runner';
import type { LotView, ScienceStepResult } from '../src/world/science-contract';
import {
  beginSailVoyage, recordSailCell, resumeSailVoyage, settleSailVoyage,
  readSailVoyage, readSailVoyageObservations, restoreSailVoyage,
  SAIL_VOYAGE, type SailVoyageLedger, type SailCellInput,
} from '../src/world/sail-voyage';
import {
  raftHullFromPieces, writeSailMat, writeBambooMast,
} from '../src/world/sail-lots';
import { sailRigParts } from '../src/world/sail-rig-parts';
import { writeCordPiece, readCordPiece } from '../src/world/coir-cord-lots';
import { validateCordLoadLedger } from '../src/world/coir-cord-load';
import { createSailRaftVoyage } from '../src/science/prototypes/sail-raft-voyage';
import {
  sailAssumptionId, canonical, SAIL_MOTION_CLOCK, PADDLE_MM_S,
} from '../src/science/prototypes/sail-raft-rules';
import type { SailRig } from '../src/science/prototypes/sail-raft-manufacturing';
import type { CoirPiece } from '../src/science/prototypes/coir-cord-types';

let groups = 0;
function expect(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function same(a: unknown, b: unknown, message: string): void {
  expect(canonical(a) === canonical(b), message);
}
function test(name: string, f: () => void): void {
  f();
  groups++;
  console.log('PASS ' + name);
}
function refused(L: SailVoyageLedger, f: () => void): void {
  const before = canonical(L);
  let threw = false;
  try { f(); } catch { threw = true; }
  expect(threw, 'expected refusal');
  same(L, JSON.parse(before), 'refusal changed ledger');
}
type Produced = ScienceStepResult['produced'][number];
function add(L: SailVoyageLedger, p: Produced, lotId: string): LotView {
  return addLot(L, {
    lotId, materialId: p.materialId, amount: p.amount,
    quality: p.quality, location: p.into!,
  });
}
function fixture(strength = 400_000, openedAtWorldMs = 0, openedAtIslandMs = 0) {
  const L = emptyLedger('world:sail', 'epoch:sail') as SailVoyageLedger;
  const hull = raftHullFromPieces('raft:host', 6);
  const mat = {
    lotId: 'mat', material: 'sail_mat' as const, dryMg: 900_000,
    waterMg: 180_000, areaCm2: 20_000, baseStrengthGf: 60_000,
    torn: false, damage: { sunMs: 0, shadeMs: 0, rainMs: 0 },
  };
  const mast = {
    lotId: 'mast', material: 'bamboo_mast' as const, dryMg: 2_100_000,
    waterMg: 300_000, lengthMm: 2500, baseStrengthGf: 40_000, broken: false,
  };
  const cord: CoirPiece = {
    lotId: 'cord', material: 'coir_rope', fiberDryMg: 60_000,
    pithDryMg: 6000, waterMg: 6600, lengthMm: 12_000,
    baseStrengthGf: strength, damage: { sunMs: 0, shadeMs: 0, abrasions: 0 },
    inheritedWear: { faded: false, abraded: false },
  };
  add(L, writeSailMat(mat, 'shore', 1), 'mat');
  add(L, writeBambooMast(mast, 'shore', 1), 'mast');
  add(L, writeCordPiece(cord, 'shore', 1), 'cord');
  const T = sailRigParts(1), made = assembleParts(L, ['mat', 'mast', 'cord'], T, 0);
  expect(made.equipment, 'assemble');
  const equipmentId = made.equipment.equipmentId;
  const rig: SailRig = {
    lotId: equipmentId, material: 'sail_raft', hull, mat, mast,
    cords: [cord], cordUseRemainders: [{ lotId: 'cord', worldMs: 0 }],
  };
  const q = {
    commandId: 'depart', rigEquipmentId: equipmentId, hull, actorId: 'dot',
    presence: 'here' as const, atWorldMs: openedAtWorldMs, atIslandMs: openedAtIslandMs,
  };
  const out = beginSailVoyage(L, q);
  return { L, hull, rig, equipmentId, runId: out.runId, q, T };
}
function cell(runId: string, n: number, changes: Partial<SailCellInput> = {}): SailCellInput {
  return {
    cellId: runId + ':' + n, fromWorldMs: n * 30_000, toWorldMs: (n + 1) * 30_000,
    fromIslandMs: n * 390_000, toIslandMs: (n + 1) * 390_000,
    windMmS: 5000, windToDeg: 0, gustMmS: 7000,
    headingDeg: 0, rain: false, sailUp: true, ...changes,
  };
}
function projection(f: ReturnType<typeof fixture>) {
  const r = f.L.runs[f.runId], m = createSailRaftVoyage(f.rig, sailAssumptionId(), {
    worldId: f.L.world.worldId, worldEpoch: f.L.world.worldEpoch,
    runId: r.runId, seed: r.seed, openedAtWorldMs: 0, openedAtIslandMs: 0,
  });
  return { m, project: () => m.projectCheckpoint((r.state!.data as any).checkpoint) };
}
function stripId(p: CoirPiece) {
  const { lotId: _, ...body } = p;
  return body;
}
test('begin reserves only the assembled equipment and preserves material IDs', () => {
  const f = fixture();
  expect(f.L.equipment[f.equipmentId].reservedBy === f.runId, 'reservation');
  expect(f.L.runs[f.runId].lotIds.length === 0, 'no duplicated part reservations');
  same(beginSailVoyage(f.L, f.q), { runId: f.runId }, 'begin retry');
  refused(f.L, () => beginSailVoyage(f.L, { ...f.q, actorId: 'other' }));
  refused(f.L, () => beginSailVoyage(f.L, { ...f.q, commandId: 'again' }));
});
test('64 exact cell receipts replay without mutation and reject conflicts or eviction', () => {
  const f = fixture(), outputs: string[][] = [];
  for (let n = 0; n < 90; n++) {
    const c = cell(f.runId, n, { sailUp: n % 3 !== 0, rain: n % 2 === 0 });
    outputs.push(recordSailCell(f.L, f.runId, c, c.toWorldMs).observations);
  }
  const before = canonical(f.L);
  for (let n = 26; n < 90; n++) {
    const c = cell(f.runId, n, { sailUp: n % 3 !== 0, rain: n % 2 === 0 });
    same(recordSailCell(f.L, f.runId, c, c.toWorldMs).observations, outputs[n], 'replay words');
  }
  expect(canonical(f.L) === before, 'replay mutation');
  refused(f.L, () => recordSailCell(f.L, f.runId, cell(f.runId, 25), 2_700_000));
  refused(f.L, () => recordSailCell(f.L, f.runId,
    cell(f.runId, 89, { headingDeg: 1, sailUp: true, rain: false }), 2_700_000));
  expect((f.L.runs[f.runId].state!.data as any).cells.length === 64, 'receipt bound');
});
test('world folding equals the scientific checkpoint and public payloads stay narrow', () => {
  const f = fixture(), { m } = projection(f);
  let cp = m.startCheckpoint();
  for (let n = 0; n < 240; n++) {
    const c = cell(f.runId, n, n % 7 === 0
      ? { windMmS: null, windToDeg: null, gustMmS: null, rain: null }
      : { windMmS: n % 2 ? 5000 : 9000, gustMmS: 9000,
        sailUp: n % 9 !== 0, headingDeg: n % 4 === 0 ? 95 : 0, rain: n % 3 === 0 });
    recordSailCell(f.L, f.runId, c, c.toWorldMs);
    cp = m.step(cp, {
      ...c, worldId: f.L.world.worldId, worldEpoch: f.L.world.worldEpoch,
      runId: f.runId, aboard: true, confirmedAtWorldMs: c.toWorldMs,
    });
  }
  same((f.L.runs[f.runId].state!.data as any).checkpoint, cp, 'fold parity');
  const view = readSailVoyage(f.L, f.runId), p = m.projectCheckpoint(cp);
  same(Object.keys(view).sort(), ['eastMm', 'northMm', 'sailUp', 'matTorn',
    'mastBroken', 'cordBroken', 'moving'].sort(), 'private view leaked values');
  expect(view.eastMm === p.distance.eastMm && view.northMm === p.distance.northMm, 'view position');
  const words = readSailVoyageObservations(f.L, f.runId);
  expect(words.length > 0 && words.every(w => !/[0-9]/.test(w)), 'numeric observations');
});
test('restore pauses; resume skips the offline gap and preserves distance fractions', () => {
  const f = fixture();
  const first = cell(f.runId, 0, { headingDeg: 37 });
  recordSailCell(f.L, f.runId, first, first.toWorldMs);
  const before = readSailVoyage(f.L, f.runId);
  f.L = restoreSailVoyage(JSON.parse(JSON.stringify(f.L)), 7_200_000);
  same(readSailVoyage(f.L, f.runId), before, 'restore advanced voyage');
  refused(f.L, () => recordSailCell(f.L, f.runId, cell(f.runId, 1), 7_230_000));
  const q = {
    commandId: 'return-to-oar', actorId: 'dot', presence: 'here' as const,
    atWorldMs: 7_200_000, atIslandMs: 93_600_000,
  };
  resumeSailVoyage(f.L, f.runId, q);
  const saved = canonical(f.L);
  resumeSailVoyage(f.L, f.runId, q);
  expect(canonical(f.L) === saved, 'resume replay');
  const second = cell(f.runId, 1, {
    fromWorldMs: 7_200_000, toWorldMs: 7_230_000,
    fromIslandMs: 93_600_000, toIslandMs: 93_990_000, headingDeg: 37,
  });
  recordSailCell(f.L, f.runId, second, second.toWorldMs);
  const p = readSailVoyage(f.L, f.runId);
  expect(Math.abs(p.eastMm - 2 * before.eastMm) <= 1
    && Math.abs(p.northMm - 2 * before.northMm) <= 1, 'offline distance counted');
});
test('healthy settlement agrees with cord /4 and preserves equipment and original IDs', () => {
  const f = fixture();
  for (let n = 0; n < 25; n++) {
    const c = cell(f.runId, n);
    recordSailCell(f.L, f.runId, c, c.toWorldMs);
  }
  const p = projection(f).project(), q = {
    commandId: 'arrive', actorId: 'dot', atWorldMs: 750_000, reason: 'arrived' as const,
  };
  const result = settleSailVoyage(f.L, f.runId, q);
  expect(result.rigEquipmentId === f.equipmentId && result.lotIds.length === 0, 'healthy gear');
  expect(!f.L.runs[f.runId], 'completed run retained');
  const gear = f.L.equipment[f.equipmentId];
  expect(!gear.reservedBy, 'reservation retained');
  same(gear.assembled!.parts!.map(l => l.lotId), ['mat', 'mast', 'cord'], 'part IDs');
  same(stripId(readCordPiece(gear.assembled!.parts![2])),
    stripId(p.cordEffects[0].pieces[0]), 'cord summary differs');
  validateCordLoadLedger(f.L);
  const saved = canonical(f.L);
  same(settleSailVoyage(f.L, f.runId, q), result, 'settle replay result');
  expect(canonical(f.L) === saved, 'settle replay mutation');
  const loaded = restoreSailVoyage(JSON.parse(JSON.stringify(f.L)), q.atWorldMs);
  const apart = disassembleParts(loaded, f.equipmentId, f.T, undefined, { keepLotIds: true });
  expect(apart.lots, 'later disassembly');
  validateCordLoadLedger(loaded);
  same(settleSailVoyage(loaded, f.runId, q), result, 'settle replay after disassembly');
});
test('two healthy voyages carry abrasion fractions through JSON and same equipment', () => {
  const f = fixture();
  const a = cell(f.runId, 0);
  recordSailCell(f.L, f.runId, a, a.toWorldMs);
  const p1 = projection(f).project(), firstCarry = p1.rig.cordUseRemainders[0].worldMs;
  settleSailVoyage(f.L, f.runId, {
    commandId: 'finish-one', actorId: 'dot', atWorldMs: a.toWorldMs, reason: 'arrived',
  });
  f.L = restoreSailVoyage(JSON.parse(JSON.stringify(f.L)), 60_000);
  const second = beginSailVoyage(f.L, {
    ...f.q, commandId: 'depart-two', atWorldMs: 60_000, atIslandMs: 780_000,
  });
  const b = cell(second.runId, 0, {
    fromWorldMs: 60_000, toWorldMs: 90_000,
    fromIslandMs: 780_000, toIslandMs: 1_170_000,
  });
  recordSailCell(f.L, second.runId, b, b.toWorldMs);
  const d = f.L.runs[second.runId].state!.data as any;
  expect(d.checkpoint.cords[0].carryMs ===
    (firstCarry + (SAIL_MOTION_CLOCK === 'island' ? 390_000 : 30_000)) % 3_600_000,
  'carry lost or doubled');
  settleSailVoyage(f.L, second.runId, {
    commandId: 'finish-two', actorId: 'dot', atWorldMs: 90_000, reason: 'arrived',
  });
  validateCordLoadLedger(f.L);
});
test('breaks release material exactly once with mat/mast IDs and real cord children', () => {
  const f = fixture(), total = f.L.equipment[f.equipmentId].assembled!.parts!
    .reduce((n, p) => n + p.amount.value, 0);
  const c = cell(f.runId, 0, { gustMmS: 40_000 });
  recordSailCell(f.L, f.runId, c, c.toWorldMs);
  const p = projection(f).project();
  expect(p.broken.some(x => x.part === 'cord'), 'fixture should break cord');
  const result = settleSailVoyage(f.L, f.runId, {
    commandId: 'storm-end', actorId: 'dot', atWorldMs: 30_000, reason: 'interrupted',
  });
  expect(result.rigEquipmentId === null && !f.L.equipment[f.equipmentId], 'broken gear kept');
  expect(result.lotIds.includes('mat') && result.lotIds.includes('mast')
    && !result.lotIds.includes('cord'), 'physical IDs');
  const cords = result.lotIds.filter(l => f.L.lots[l].materialId === 'coir_rope');
  expect(cords.length === 2 && new Set(cords).size === 2, 'cord children');
  same(cords.map(l => stripId(readCordPiece(f.L.lots[l]))),
    p.cordEffects[0].pieces.map(stripId), 'break summary physical parity');
  expect(result.lotIds.reduce((n, id) => n + f.L.lots[id].amount.value, 0) === total, 'settlement mass');
  validateCordLoadLedger(f.L);
});
test('null weather and lowered sails paddle on the selected motion clock', () => {
  for (const nullWeather of [true, false]) {
    const f = fixture(), c = cell(f.runId, 0, nullWeather
      ? { windMmS: null, windToDeg: null, gustMmS: null, rain: null }
      : { sailUp: false });
    recordSailCell(f.L, f.runId, c, c.toWorldMs);
    const dt = SAIL_MOTION_CLOCK === 'island' ? 390_000 : 30_000;
    expect(readSailVoyage(f.L, f.runId).eastMm === PADDLE_MM_S * dt / 1000, 'paddle distance');
  }
});
test('invalid cells, ownership and corrupt restore are atomic', () => {
  const f = fixture();
  refused(f.L, () => recordSailCell(f.L, f.runId, cell(f.runId, 0), 29_999));
  refused(f.L, () => recordSailCell(f.L, f.runId, cell(f.runId, 1), 60_000));
  refused(f.L, () => settleSailVoyage(f.L, f.runId, {
    commandId: 'wrong-person', actorId: 'other', atWorldMs: 0, reason: 'arrived',
  }));
  const corrupt = JSON.parse(JSON.stringify(f.L));
  corrupt.runs[f.runId].state.data.checkpoint.schema = 'prototype-sail-raft-checkpoint/1';
  let failed = false;
  try { restoreSailVoyage(corrupt, 0); } catch { failed = true; }
  expect(failed, 'old save relabel accepted');
});
test('6-hour cell cost and whole-session storage stay bounded', () => {
  const epoch = 1_792_300_000_000, cells = 720;
  const f = fixture(400_000, epoch, epoch), begun = { runId: f.runId };
  // Retained inputs use lossless compact integers; epoch-sized times exercise actual saves.
  let firstMs = 0, lastMs = 0, at64Bytes = 0, atEndBytes = 0;
  for (let n = 0; n < cells; n++) {
    const c = cell(begun.runId, n, {
      fromWorldMs: epoch + n * 30_000, toWorldMs: epoch + (n + 1) * 30_000,
      fromIslandMs: epoch + n * 390_000, toIslandMs: epoch + (n + 1) * 390_000,
      sailUp: n % 8 !== 0, rain: n % 3 === 0,
    });
    const at = performance.now();
    recordSailCell(f.L, begun.runId, c, c.toWorldMs);
    const elapsed = performance.now() - at;
    if (n < 64) firstMs += elapsed;
    if (n >= cells - 64) lastMs += elapsed;
    if (n === 63) at64Bytes = new TextEncoder().encode(JSON.stringify(f.L)).length;
    if (n === cells - 1) atEndBytes = new TextEncoder().encode(JSON.stringify(f.L)).length;
  }
  const meanMs = lastMs / 64;
  expect(meanMs <= 5, 'per-cell mean > 5 ms: ' + meanMs);
  expect(atEndBytes <= 10_240, 'session save > 10 KB: ' + atEndBytes);
  expect(atEndBytes - at64Bytes < 1024, 'save grows with voyage duration');
  expect(lastMs / 64 <= Math.max(5, firstMs / 64 * 4), 'cell work grows with history');
  console.log(JSON.stringify({ cells, firstMeanMs: firstMs / 64, lastMeanMs: meanMs,
    at64Bytes, atEndBytes, boundedReceipts: SAIL_VOYAGE.receiptLimit }));
});
console.log('sail-voyage-check: ' + groups + ' groups PASS');
