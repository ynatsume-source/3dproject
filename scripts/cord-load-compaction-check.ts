import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { addLot, emptyLedger, startRun } from '../src/world/process-runner';
import {
  COIR_CORD_ASSUMPTION_ID as ID, COIR_CORD_RULES as RULES, type CoirPiece,
} from '../src/science/prototypes/coir-cord-types';
import { currentIntegerCordStrength } from '../src/science/prototypes/coir-cord-damage';
import { readCordPiece, writeCordPiece } from '../src/world/coir-cord-lots';
import {
  applyCordLoad, applyCordLoadForResident, compactCordLoadLedger,
  validateCordLoadLedger, COIR_CORD_LOAD, CordLoadError,
  type CordHostEvent, type CordLoadLedger, type CordLoadRequest, type CordLoadResult,
} from '../src/world/coir-cord-load';
import { applyCordLoad as applyV3 } from './fixtures/coir-cord-load-v3';

const DAY = 86_400_000;
const LIMIT = 64;
let groups = 0;
function test(name: string, run: () => void) {
  run();
  groups++;
  console.log('PASS ' + name);
}
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const store = (L: CordLoadLedger): any => L.coirCordLoads;
const oldApply = applyV3 as unknown as (
  ledger: CordLoadLedger, request: CordLoadRequest,
) => CordLoadResult;
function piece(lotId: string): CoirPiece {
  return {
    lotId, material: 'coir_rope', lengthMm: 10_000,
    fiberDryMg: 72_000, pithDryMg: 7_200, waterMg: 3_000, baseStrengthGf: 40_000,
    damage: { sunMs: 0, shadeMs: 0, abrasions: 0 },
  };
}
function fixture(count = 1): CordLoadLedger {
  const L: CordLoadLedger = emptyLedger('compaction', 'epoch');
  for (let i = 0; i < count; i++) {
    const p = piece('cord:' + i);
    const out = writeCordPiece(p, 'site:shore', i % 2);
    addLot(L, {
      lotId: p.lotId, materialId: out.materialId,
      amount: out.amount, quality: out.quality, location: out.into!,
    });
  }
  return L;
}
function request(
  lotId: string, commandId: string, event: CordHostEvent,
  worldAtMs: number, islandAtMs = worldAtMs,
): CordLoadRequest {
  return { commandId, assumptionId: ID, lotId, worldAtMs, islandAtMs, event };
}
function reject(L: CordLoadLedger, q: CordLoadRequest, code?: string) {
  const before = JSON.stringify(L);
  assert.throws(() => applyCordLoad(L, q),
    (error: unknown) => error instanceof CordLoadError
      && (code === undefined || error.code === code));
  assert.equal(JSON.stringify(L), before, 'a refusal must not modify the ledger');
}
function samePhysical(a: CordLoadLedger, b: CordLoadLedger) {
  assert.deepEqual(a.lots, b.lots);
  assert.deepEqual(a.world, b.world);
  assert.equal(a.seq, b.seq);
  for (const lot of Object.values(a.lots)) {
    assert.equal(currentIntegerCordStrength(readCordPiece(lot)),
      currentIntegerCordStrength(readCordPiece(b.lots[lot.lotId])));
  }
}
function legacy(count: number) {
  const L = fixture();
  const requests: CordLoadRequest[] = [];
  const results: CordLoadResult[] = [];
  for (let i = 0; i < count; i++) {
    const q = request('cord:0', 'legacy:' + i,
      { kind: 'abrasion', count: i % 3 === 0 ? 1 : 0 }, i + 1);
    requests.push(q);
    results.push(oldApply(L, q));
  }
  return { L, requests, results };
}

test('version identifies bounded format and explicit integer policy', () => {
  assert.equal(COIR_CORD_LOAD.processVersion, 'host-4');
  assert.equal(COIR_CORD_LOAD.schema, 'civ-world.coir-cord-load/4');
  assert.equal(COIR_CORD_LOAD.ledgerSchema, 'civ-world.coir-cord-load-ledger/4');
  assert.equal(COIR_CORD_LOAD.receiptLimit, LIMIT);
  assert.equal(typeof COIR_CORD_LOAD.strengthPolicyId, 'string');
});
test('/3 migration preserves lots, IDs, wear, sequence and world metadata', () => {
  const { L, requests, results } = legacy(80);
  const before = json(L);
  const oldRunIds = Object.keys(L.runs);
  compactCordLoadLedger(L);
  assert.equal(store(L).schema, COIR_CORD_LOAD.ledgerSchema);
  assert.deepEqual(L.lots, before.lots);
  assert.equal(L.seq, before.seq);
  assert.deepEqual(L.world, before.world);
  assert.deepEqual(L.committed, before.committed);
  assert.equal(Object.keys(L.runs).length, 0);
  assert.equal(oldRunIds.length, 80);
  assert.equal(store(L).cords['cord:0'].recent.length, LIMIT);
  assert.equal(Object.keys(store(L).commands).length, LIMIT);
  assert.equal(store(L).cords['cord:0'].latest.lotId, 'cord:0');
  assert.equal(Object.hasOwn(store(L), 'records'), false);
  for (let i = 16; i < 80; i++) {
    const stable = JSON.stringify(L);
    assert.deepEqual(applyCordLoad(L, requests[i]), results[i]);
    assert.equal(JSON.stringify(L), stable);
  }
  reject(L, requests[15], 'expired-command');
  const migrated = json(L);
  compactCordLoadLedger(L);
  assert.deepEqual(L, migrated);
  validateCordLoadLedger(json(L));
});
test('first apply reads /3 and preserves next legacy run and fracture IDs', () => {
  const { L } = legacy(12);
  const old = json(L);
  const before = json(L.lots);
  const gf = currentIntegerCordStrength(readCordPiece(L.lots['cord:0']));
  const q = request('cord:0', 'migration:fracture',
    { kind: 'load', gf: gf + 1, breakAtMm: 3_333 }, 13);
  const expected = oldApply(old, q);
  const actual = applyCordLoad(L, q);
  assert.deepEqual(actual, expected);
  samePhysical(L, old);
  assert.equal(L.runs[actual.runId], undefined);
  const parent = store(L).cords['cord:0'];
  assert.equal(parent.kind, 'retired');
  assert.equal(parent.latest, null);
  assert.deepEqual(parent.children, actual.lotIds);
  assert.equal(Object.hasOwn(parent, 'source'), false);
  assert.equal(L.lots['cord:0'], undefined);
  assert.equal(actual.lotIds.reduce((sum, key) => sum + L.lots[key].amount.value, 0),
    before['cord:0'].amount.value);
  assert.deepEqual(applyCordLoad(json(L), q), actual);
});
test('migration removes only old completed load runs and retains other reservations', () => {
  const { L } = legacy(5);
  const out = writeCordPiece(piece('unrelated'), 'site:other', 1);
  addLot(L, {
    lotId: 'unrelated', materialId: out.materialId, amount: out.amount,
    quality: out.quality, location: out.into!,
  });
  const begun = startRun(L, {
    processId: 'unrelated-process', processVersion: '1', catalogVersion: 'test',
    contract: '0.2.1', clock: 'world', lotIds: ['unrelated'],
    equipmentIds: [], operator: 'other',
  }, 6);
  assert.ok(begun.run);
  const run = json(begun.run);
  const source = json(L.lots.unrelated);
  compactCordLoadLedger(L);
  assert.deepEqual(Object.keys(L.runs), [run.runId]);
  assert.deepEqual(L.runs[run.runId], run);
  assert.deepEqual(L.lots.unrelated, source);
});
test('legacy parity includes thresholds, fracture, child and observations', () => {
  const modern = fixture(2);
  const original = fixture(2);
  let active = 'cord:0';
  for (let i = 0; i < 28; i++) {
    const p = readCordPiece(original.lots[active]);
    const event: CordHostEvent = i % 4 === 0
      ? { kind: 'exposure', fromIslandMs: i * 1000, toIslandMs: (i + 1) * 1000, shade: i % 8 === 0 }
      : i % 4 === 1
        ? { kind: 'abrasion', count: 1 }
        : { kind: 'load', gf: currentIntegerCordStrength(p) + (i === 23 ? 1 : 0) };
    const q = request(active, 'oracle:' + i, event, (i + 1) * 1000);
    const expected = oldApply(original, q);
    const actual = applyCordLoad(modern, q);
    assert.deepEqual(actual, expected);
    samePhysical(modern, original);
    if (actual.lotIds.length === 2) active = actual.lotIds[0];
  }
  assert.equal(store(modern).cords['cord:0'].kind, 'retired');
  assert.equal(Object.keys(modern.runs).length, 0);
  const migrated = json(original);
  compactCordLoadLedger(migrated);
  samePhysical(migrated, original);
  assert.deepEqual(store(migrated), store(modern));
});
test('replay survives JSON and conflicting reuse is refused', () => {
  const L = fixture(2);
  const q = request('cord:0', 'retained-command', { kind: 'abrasion', count: 2 }, 10);
  const expected = applyCordLoad(L, q);
  const restored = json(L);
  const before = JSON.stringify(restored);
  assert.deepEqual(applyCordLoad(restored, q), expected);
  assert.equal(JSON.stringify(restored), before);
  reject(restored, { ...q, event: { kind: 'abrasion', count: 3 } }, 'conflicting-replay');
  reject(restored, { ...q, lotId: 'cord:1' }, 'conflicting-replay');
});
test('different confirmed events at same clocks remain distinct', () => {
  const L = fixture();
  for (let i = 0; i < 3; i++) {
    applyCordLoad(L, request('cord:0', 'same-clock:' + i,
      { kind: 'abrasion', count: 1 }, 10, 20));
  }
  assert.equal(readCordPiece(L.lots['cord:0']).damage.abrasions, 3);
  assert.equal(store(L).cords['cord:0'].recent.length, 3);
});
test('per-cord windows reject evicted commands without duplicate effects', () => {
  const L = fixture(2);
  const all: CordLoadRequest[] = [];
  for (let i = 0; i < 80; i++) {
    const q = request('cord:0', 'window:' + i, { kind: 'abrasion', count: 1 }, i + 1);
    all.push(q);
    applyCordLoad(L, q);
  }
  const other = request('cord:1', 'other-cord', { kind: 'abrasion', count: 1 }, 1);
  const result = applyCordLoad(L, other);
  assert.deepEqual(applyCordLoad(json(L), other), result);
  assert.equal(store(L).cords['cord:0'].recent.length, LIMIT);
  assert.equal(store(L).cords['cord:1'].recent.length, 1);
  reject(L, all[0], 'expired-command');
  assert.equal(readCordPiece(L.lots['cord:0']).damage.abrasions, 80);
});
test('eviction at identical clocks fails closed while either clock may advance', () => {
  const L = fixture();
  const requests: CordLoadRequest[] = [];
  for (let i = 0; i < 65; i++) {
    const q = request('cord:0', 'equal-clock:' + i, { kind: 'abrasion', count: 0 }, 10, 20);
    requests.push(q);
    applyCordLoad(L, q);
  }
  const last = requests.at(-1)!;
  const stable = JSON.stringify(L);
  const replay = applyCordLoad(L, last);
  assert.equal(JSON.stringify(L), stable);
  assert.deepEqual(applyCordLoad(json(L), last), replay);
  reject(L, requests[0], 'expired-command');
  reject(L, request('cord:0', 'unknown-at-floor', { kind: 'load', gf: 0 }, 10, 20),
    'expired-command');
  applyCordLoad(L, request('cord:0', 'world-advanced', { kind: 'load', gf: 0 }, 11, 20));
  applyCordLoad(L, request('cord:0', 'island-advanced', { kind: 'load', gf: 0 }, 11, 21));
});
test('invalid first /3 apply leaves the complete old save unchanged', () => {
  const { L } = legacy(3);
  reject(L, request('cord:missing', 'bad-migration', { kind: 'load', gf: 0 }, 10),
    'missing-material');
  assert.equal(store(L).schema, 'civ-world.coir-cord-load-ledger/3');
  reject(L, request('cord:0', 'backward-migration', { kind: 'load', gf: 0 }, 0),
    'out-of-order-event');
  assert.equal(Object.keys(L.runs).length, 3);
});
test('schema-only relabel, inner corruption and incomplete checkpoints are refused', () => {
  const old = legacy(2).L;
  store(old).schema = COIR_CORD_LOAD.ledgerSchema;
  assert.throws(() => validateCordLoadLedger(old), CordLoadError);
  const good = fixture();
  applyCordLoad(good, request('cord:0', 'valid', { kind: 'load', gf: 0 }, 1));
  const mutations: ((L: any) => void)[] = [
    L => { delete L.coirCordLoads.receiptLimit; },
    L => { L.coirCordLoads.receiptLimit = 65; },
    L => { L.coirCordLoads.cords['cord:0'].latest.quality.sun_ms++; },
    L => { L.coirCordLoads.cords['cord:0'].cursor.worldAtMs = -1; },
    L => { L.coirCordLoads.cords['cord:0'].recent[0].request.event.gf = -1; },
    L => { L.coirCordLoads.cords['cord:0'].recent[0].result.lotIds = ['invented']; },
    L => { L.coirCordLoads.commands.valid = 'missing-cord'; },
  ];
  for (const mutate of mutations) {
    const bad = json(good);
    mutate(bad);
    const before = JSON.stringify(bad);
    assert.throws(() => validateCordLoadLedger(bad), CordLoadError);
    assert.equal(JSON.stringify(bad), before);
  }
});
test('warm apply neither traverses other checkpoints nor scans or clones ledger maps', () => {
  const L = fixture(2);
  for (let i = 0; i < 2; i++) {
    applyCordLoad(L, request('cord:' + i, 'warm:' + i, { kind: 'load', gf: 0 }, 1));
  }
  const runs = L.runs;
  const lots = L.lots;
  const checkpoints = store(L).cords;
  const other = checkpoints['cord:1'];
  const noScan = () => { throw new Error('unrelated collection traversed'); };
  L.runs = new Proxy(runs, { ownKeys: noScan });
  L.lots = new Proxy(lots, { ownKeys: noScan });
  checkpoints['cord:1'] = new Proxy(other, { get: noScan, ownKeys: noScan });
  try {
    const result = applyCordLoad(L, request('cord:0', 'warm:target',
      { kind: 'abrasion', count: 1 }, 2));
    assert.deepEqual(result.lotIds, ['cord:0']);
    assert.equal(readCordPiece(L.lots['cord:0']).damage.abrasions, 1);
  } finally {
    L.runs = runs;
    L.lots = lots;
    checkpoints['cord:1'] = other;
  }
});
test('six cords for a full year: bounded saves, no retained runs and steady work', () => {
  const L = fixture(6);
  const early: number[] = [];
  const late: number[] = [];
  let plateauBytes = 0;
  let last: CordLoadRequest | undefined;
  let lastResult: CordLoadResult | undefined;
  for (let day = 1; day <= 365; day++) {
    for (let i = 0; i < 6; i++) {
      const q = request('cord:' + i, 'daily:' + day + ':' + i, {
        kind: 'exposure', fromIslandMs: (day - 1) * DAY,
        toIslandMs: day * DAY, shade: i % 2 === 1,
      }, day * 1000, day * DAY);
      const started = performance.now();
      const result = applyCordLoad(L, q);
      const elapsed = performance.now() - started;
      if (day >= 65 && day <= 94) early.push(elapsed);
      if (day >= 336) late.push(elapsed);
      assert.deepEqual(result.lotIds, ['cord:' + i]);
      last = q;
      lastResult = result;
    }
    if (day === 94) plateauBytes = JSON.stringify(L).length * 2;
  }
  const bytes = JSON.stringify(L).length * 2;
  assert.ok(bytes < 512 * 1024, 'UTF-16 storage must remain below 512 KiB');
  assert.ok(bytes <= plateauBytes + 20_000, 'size must plateau after receipt windows fill');
  assert.equal(Object.keys(store(L).commands).length, 6 * LIMIT);
  assert.equal(Object.keys(store(L).cords).length, 6);
  assert.equal(Object.keys(L.runs).length, 0);
  assert.ok(L.committed.length <= 500);
  for (let i = 0; i < 6; i++) {
    const p = readCordPiece(L.lots['cord:' + i]);
    assert.equal(L.lots[p.lotId].amount.value, 82_200);
    assert.equal(p.damage[i % 2 === 1 ? 'shadeMs' : 'sunMs'], RULES.yearIslandMs);
    assert.equal(store(L).cords[p.lotId].recent.length, LIMIT);
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const earlyMean = mean(early);
  const lateMean = mean(late);
  assert.ok(lateMean <= Math.max(20, earlyMean * 8), 'bounded-work timing guard');
  const restored = json(L);
  validateCordLoadLedger(restored);
  const stable = JSON.stringify(restored);
  assert.deepEqual(applyCordLoad(restored, last!), lastResult);
  assert.equal(JSON.stringify(restored), stable);
  console.log(JSON.stringify({
    events: 6 * 365, utf16SaveBytes: bytes,
    earlyMeanMs: earlyMean, lateMeanMs: lateMean, deterministicTraversalGuard: true,
  }));
});
test('retired summary replays break but cannot resurrect consumed parent', () => {
  const L = fixture();
  const q = request('cord:0', 'retire', { kind: 'load', gf: 40_001, breakAtMm: 4_000 }, 1);
  const result = applyCordLoad(L, q);
  const restored = json(L);
  assert.deepEqual(applyCordLoad(restored, q), result);
  assert.equal(store(restored).cords['cord:0'].latest, null);
  restored.lots['cord:0'] = fixture().lots['cord:0'];
  reject(restored, request('cord:0', 'resurrection', { kind: 'load', gf: 0 }, 2));
});
test('resident sees sensory words without checkpoint data', () => {
  const L = fixture();
  const result = applyCordLoadForResident(L, request('cord:0', 'seen', { kind: 'load', gf: 40_001 }, 1));
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result).sort(), ['observations', 'ok']);
  assert.ok(!/\d|strength|seed|gf|mg|lot:|run:|receipt/.test(JSON.stringify(result)));
});
console.log('PASS cord load compaction: ' + groups + ' groups.');
