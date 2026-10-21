import { applyCordLoad as applyLegacyCordLoad } from './fixtures/coir-cord-load-v3';
import assert from 'node:assert/strict';
import { addLot, emptyLedger } from '../src/world/process-runner';
import {
  applyCordLoad, applyCordLoadForResident, validateCordLoadLedger, COIR_CORD_LOAD,
  CordLoadError, type CordLoadLedger, type CordLoadRequest,
} from '../src/world/coir-cord-load';
import { readCordPiece, writeCordPiece } from '../src/world/coir-cord-lots';
import {
  COIR_CORD_ASSUMPTION_ID as ID, COIR_CORD_RULES as RULES, type CoirPiece,
} from '../src/science/prototypes/coir-cord-types';
import {
  currentCordStrength, currentIntegerCordStrength,
  createCordDamageModel, createIntegerCordDamageModel,
} from '../src/science/prototypes/coir-cord-damage';
import { INTEGER_HALF_LIFE_POLICY_ID } from '../src/science/prototypes/integer-half-life';

let groups = 0;
function test(name: string, check: () => void): void {
  check();
  groups += 1;
  console.log('PASS ' + name);
}
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const legacyApply = applyLegacyCordLoad as unknown as typeof applyCordLoad;
function aged(): CoirPiece {
  return {
    lotId: 'cord:aged', material: 'coir_rope', lengthMm: 7_000,
    fiberDryMg: 31_000, pithDryMg: 4_000, waterMg: 3_000, baseStrengthGf: 40_000,
    damage: { sunMs: 786_823_200, shadeMs: 617_280, abrasions: 4 },
  };
}
function fixture(piece = aged()): CordLoadLedger {
  const L: CordLoadLedger = emptyLedger('world:integer-load', 'epoch:integer-load');
  const out = writeCordPiece(piece, 'site:cord', 1);
  addLot(L, {
    lotId: piece.lotId, materialId: out.materialId, amount: out.amount,
    quality: out.quality, location: out.into!,
  });
  return L;
}
function request(gf: number, commandId = 'load'): CordLoadRequest {
  return {
    commandId, assumptionId: ID, lotId: 'cord:aged', worldAtMs: 1_000,
    islandAtMs: 2_000, event: { kind: 'load', gf },
  };
}
function semantic(p: CoirPiece) {
  const { lotId: _, ...rest } = p;
  return rest;
}
function atomic(L: CordLoadLedger, action: () => unknown): void {
  const before = json(L);
  assert.throws(action, CordLoadError);
  assert.deepEqual(L, before);
}
function direct(L: CordLoadLedger, q: CordLoadRequest, runId: string, integer = true) {
  const piece = readCordPiece(L.lots[q.lotId]);
  // The APIs deliberately have distinct state types; instantiate separately.
  const event = {
    eventId: q.commandId, worldId: L.world.worldId, worldEpoch: L.world.worldEpoch,
    runId, atMs: q.worldAtMs, clock: 'world' as const, kind: 'load' as const,
    gf: (q.event as { gf: number }).gf,
  };
  if (integer) {
    const m = createIntegerCordDamageModel(piece, ID, {
      worldId: L.world.worldId, worldEpoch: L.world.worldEpoch, runId,
      openedAtWorldMs: q.worldAtMs, openedAtIslandMs: q.islandAtMs,
    });
    const state = m.commit(m.start(), event);
    return { state, projection: m.project(state), observations: m.observe(state) };
  }
  const m = createCordDamageModel(piece, ID, {
    worldId: L.world.worldId, worldEpoch: L.world.worldEpoch, runId,
    openedAtWorldMs: q.worldAtMs, openedAtIslandMs: q.islandAtMs,
  });
  const state = m.commit(m.start(), event);
  return { state, projection: m.project(state), observations: m.observe(state) };
}

test('load and receipt versions bind the operational integer policy', () => {
  assert.equal(COIR_CORD_LOAD.processVersion, 'host-5');
  assert.equal(COIR_CORD_LOAD.schema, 'civ-world.coir-cord-load/5');
  assert.equal(COIR_CORD_LOAD.ledgerSchema, 'civ-world.coir-cord-load-ledger/5');
  assert.equal(COIR_CORD_LOAD.strengthPolicyId, INTEGER_HALF_LIFE_POLICY_ID);
  const L = fixture();
  const q = request(0);
  const out = applyCordLoad(L, q);
  const saved = L.coirCordLoads as any;
  const checkpoint = saved.cords[q.lotId];
  assert.equal(L.coirCordLoadFormat, COIR_CORD_LOAD.ledgerSchema);
  assert.equal(saved.strengthPolicyId, INTEGER_HALF_LIFE_POLICY_ID);
  assert.equal(saved.receiptLimit, 64);
  assert.equal(checkpoint.kind, 'live');
  assert.equal(checkpoint.latest.lotId, q.lotId);
  assert.deepEqual(checkpoint.recent[0].request, q);
  assert.deepEqual(checkpoint.recent[0].result, out);
  assert.equal(typeof checkpoint.digest, 'number');
  assert.equal(L.runs[out.runId], undefined);
  validateCordLoadLedger(json(L));
});

test('the aged witness detects any remaining floating-point load path', () => {
  const piece = aged();
  assert.equal(currentCordStrength(piece), 37_764);
  assert.equal(currentIntegerCordStrength(piece), 37_765);
  for (const gf of [37_765, 37_766]) {
    const L = fixture();
    const before = json(L);
    const q = request(gf);
    const out = applyCordLoad(L, q);
    const expected = direct(before, q, out.runId);
    assert.equal(out.lotIds.length, gf === 37_765 ? 1 : 2);
    if (gf === 37_765) assert.deepEqual(out.lotIds, [piece.lotId]);
    assert.deepEqual(out.lotIds.map(id => semantic(readCordPiece(L.lots[id]))),
      expected.projection.pieces.map(semantic));
    assert.deepEqual(out.observations, expected.observations);
    validateCordLoadLedger(json(L));
  }
});

test('cumulative exposure and abrasion preserve integer decisions after JSON and replay', () => {
  const piece = aged();
  const L = fixture();
  let previous = currentIntegerCordStrength(piece);
  for (let index = 0; index < 12; index += 1) {
    const q: CordLoadRequest = {
      ...request(0, 'abrasion:' + index), worldAtMs: 1_000 + index,
      event: { kind: 'abrasion', count: 1 },
    };
    const out = applyCordLoad(L, q);
    assert.deepEqual(out.lotIds, [piece.lotId]);
    const current = readCordPiece(L.lots[piece.lotId]);
    const strength = currentIntegerCordStrength(current);
    assert.ok(strength <= previous);
    assert.equal(current.fiberDryMg + current.pithDryMg + current.waterMg, 38_000);
    previous = strength;
    Object.assign(L, json(L));
    const saved = json(L);
    assert.deepEqual(applyCordLoad(L, q), out);
    assert.deepEqual(L, saved);
  }
  const year = RULES.yearIslandMs;
  applyCordLoad(L, {
    ...request(0, 'exposure'), worldAtMs: 2_000, islandAtMs: 2_000 + year,
    event: { kind: 'exposure', fromIslandMs: 2_000, toIslandMs: 2_000 + year, shade: false },
  });
  const current = readCordPiece(L.lots[piece.lotId]);
  const atStrength = currentIntegerCordStrength(current);
  const intact = applyCordLoad(L, {
    ...request(atStrength, 'equal-after-year'), worldAtMs: 2_001, islandAtMs: 2_000 + year,
  });
  assert.deepEqual(intact.lotIds, [piece.lotId]);
  const broken = applyCordLoad(L, {
    ...request(atStrength + 1, 'over-after-year'), worldAtMs: 2_002, islandAtMs: 2_000 + year,
  });
  assert.equal(broken.lotIds.length, 2);
  assert.equal(broken.lotIds.reduce((n, id) => n + L.lots[id].amount.value, 0), 38_000);
  validateCordLoadLedger(json(L));
});

test('old ledger and run versions are rejected without replay or mutation', () => {
  const original = fixture();
  const out = legacyApply(original, request(0));
  for (const schema of [
    'civ-world.coir-cord-load-ledger/1', 'civ-world.coir-cord-load-ledger/2',
  ]) {
    const L = json(original);
    L.coirCordLoads!.schema = schema;
    assert.throws(() => validateCordLoadLedger(L),
      (error: unknown) => error instanceof CordLoadError && error.code === 'unsupported-load-schema');
    atomic(L, () => applyCordLoad(L, request(0, 'next')));
  }
  for (const patch of [
    { schema: 'civ-world.coir-cord-load/1' },
    { schema: 'civ-world.coir-cord-load/2' },
    { processVersion: 'host-1' }, { processVersion: 'host-2' },
  ]) {
    const L = json(original);
    if (patch.schema) L.runs[out.runId].state!.schema = patch.schema;
    if (patch.processVersion) L.runs[out.runId].processVersion = patch.processVersion;
    atomic(L, () => applyCordLoad(L, request(0, 'next')));
  }
});

test('outer version relabeling cannot hide a legacy damage binding', () => {
  const original = fixture();
  const before = json(original);
  const q = request(0);
  const out = legacyApply(original, q);
  const legacy = direct(before, q, out.runId, false).state;
  for (const relabelInner of [false, true]) {
    const L = json(original);
    const damage: any = json(legacy);
    if (relabelInner) damage.schema = 'prototype-coir-cord-damage/2';
    (L.runs[out.runId].state!.data as any).damage = damage;
    assert.throws(() => validateCordLoadLedger(L), CordLoadError);
    atomic(L, () => applyCordLoad(L, request(0, 'next')));
  }
});

test('hidden numeric policy never enters witnessed sensory observations', () => {
  for (const gf of [37_765, 37_766]) {
    const L = fixture();
    const q = request(gf);
    const out = applyCordLoad(L, q);
    assert.ok(out.observations.every(text => !/[0-9]|gf|mg|policy|strength|seed/.test(text)));
    const before = json(L);
    const publicView = applyCordLoadForResident(L, q);
    assert.equal(publicView.ok, true);
    assert.deepEqual(Object.keys(publicView).sort(), ['observations', 'ok']);
    assert.deepEqual(publicView.observations, out.observations);
    assert.deepEqual(L, before);
    assert.equal(L.runs[out.runId], undefined);
  }
});

console.log('PASS integer cord load: ' + groups + ' groups.');
