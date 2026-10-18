import assert from 'node:assert/strict';
import { emptyLedger, addLot } from '../src/world/process-runner';
import {
  applyCordLoad, validateCordLoadLedger, type CordLoadLedger,
} from '../src/world/coir-cord-load';
import { applyCordVoyageSummary } from '../src/world/sail-cord-settlement';
import { writeCordPiece, readCordPiece } from '../src/world/coir-cord-lots';
import {
  createIntegerCordDamageModel, currentIntegerCordStrength, type CordDamageEvent,
} from '../src/science/prototypes/coir-cord-damage';
import { COIR_CORD_ASSUMPTION_ID as ID, type CoirPiece } from '../src/science/prototypes/coir-cord-types';

let groups = 0;
function test(name: string, run: () => void) {
  run();
  groups++;
  console.log('PASS ' + name);
}
const json = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const semantic = (p: CoirPiece) => {
  const out = writeCordPiece(p, 'site:check', 1);
  const q = readCordPiece({ lotId: p.lotId, materialId: out.materialId,
    amount: out.amount, quality: out.quality, location: out.into! });
  const { lotId, ...rest } = q;
  return rest;
};
function fixture(): { L: CordLoadLedger; initial: CoirPiece } {
  const initial: CoirPiece = {
    lotId: 'cord', material: 'coir_rope', lengthMm: 10000,
    fiberDryMg: 72000, pithDryMg: 7200, waterMg: 3000,
    baseStrengthGf: 40000, damage: { sunMs: 0, shadeMs: 0, abrasions: 0 },
  };
  const L = emptyLedger('world', 'epoch');
  const p = writeCordPiece(initial, 'site:raft', 1);
  addLot(L, { lotId: 'cord', materialId: p.materialId, amount: p.amount,
    quality: p.quality, location: p.into! });
  return { L, initial };
}

test('150 histories preserve exact wear, threshold outcomes, mass and world IDs', () => {
  let seed = 12345;
  const draw = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  let fractures = 0;
  for (let scene = 0; scene < 150; scene++) {
    const { L, initial } = fixture();
    const model = createIntegerCordDamageModel(initial, ID, {
      worldId: 'world', worldEpoch: 'epoch', runId: 'reference',
      openedAtWorldMs: 0, openedAtIslandMs: 0,
    });
    let state = model.start();
    let sunMs = 0;
    let shadeMs = 0;
    let abrasions = 0;
    let island = 0;
    let world = 0;
    let maxLoadGf = 0;
    let fracture: { gf: number; atWorldMs: number; atIslandMs: number } | undefined;
    const event = (e: Omit<CordDamageEvent, 'eventId' | 'worldId' | 'worldEpoch' | 'runId'>) => {
      state = model.commit(state, { ...e, eventId: 'event:' + world + ':' + island + ':' + draw(),
        worldId: 'world', worldEpoch: 'epoch', runId: 'reference' } as CordDamageEvent);
    };
    for (let n = 0; n < 12; n++) {
      world += 30000;
      const strength = currentIntegerCordStrength(model.project(state).pieces[0]);
      const gf = (scene % 3 === 0 && n === 8) ? strength + 1
        : n === 0 ? strength : Math.min(strength, draw() % 10000);
      maxLoadGf = Math.max(maxLoadGf, gf);
      event({ kind: 'load', clock: 'world', atMs: world, gf } as any);
      if (model.project(state).status === 'broken') {
        fracture = { gf, atWorldMs: world, atIslandMs: island };
        fractures++;
        break;
      }
      const dt = draw() % 10000000 + 1;
      const shade = scene % 2 === 0;
      event({ kind: 'exposure', clock: 'island', atMs: island + dt,
        fromIslandMs: island, toIslandMs: island + dt, shade } as any);
      island += dt;
      if (shade) shadeMs += dt; else sunMs += dt;
      const count = draw() % 3;
      event({ kind: 'abrasion', clock: 'world', atMs: world, count } as any);
      abrasions += count;
    }
    const expected = model.project(state).pieces;
    const q = { commandId: 'voyage:scene:' + scene + ':0', assumptionId: ID,
      lotId: 'cord', worldAtMs: world, islandAtMs: island, initial,
      pieces: expected, sunMs, shadeMs, abrasions, maxLoadGf, break: fracture };
    const result = applyCordVoyageSummary(L, q);
    assert.deepEqual(result.lotIds.map(id => semantic(readCordPiece(L.lots[id]))),
      expected.map(semantic));
    assert.equal(result.lotIds.length, fracture ? 2 : 1);
    assert.equal(result.lotIds.reduce((n, id) => n + L.lots[id].amount.value, 0), 82200);
    if (!fracture) assert.deepEqual(result.lotIds, ['cord']);
    const stable = JSON.stringify(L);
    assert.deepEqual(applyCordVoyageSummary(L, q), result);
    assert.equal(JSON.stringify(L), stable);
    const restored = json(L);
    validateCordLoadLedger(restored);
    assert.deepEqual(applyCordVoyageSummary(restored, q), result);
    assert.equal(Object.keys(L.runs).length, 0);
  }
  assert.equal(fractures, 50);
});
test('an old maximum load is never retested against later weakened intact cord', () => {
  const { L, initial } = fixture();
  const final = json(initial);
  final.damage.abrasions = 100;
  assert.ok(currentIntegerCordStrength(final) < 39999);
  const q = { commandId: 'voyage:old-max:0', assumptionId: ID, lotId: 'cord',
    worldAtMs: 100000, islandAtMs: 0, initial, pieces: [final],
    sunMs: 0, shadeMs: 0, abrasions: 100, maxLoadGf: 39999 };
  const out = applyCordVoyageSummary(L, q);
  assert.deepEqual(out.lotIds, ['cord']);
  assert.equal(readCordPiece(L.lots.cord).damage.abrasions, 100);
});
test('invalid cumulative state and conflicting receipt fail before mutation', () => {
  const { L, initial } = fixture();
  const bad = json(initial);
  bad.damage.abrasions = 10;
  const q = { commandId: 'voyage:invalid:0', assumptionId: ID, lotId: 'cord',
    worldAtMs: 100, islandAtMs: 100, initial, pieces: [bad],
    sunMs: 0, shadeMs: 0, abrasions: 0, maxLoadGf: 0 };
  const before = JSON.stringify(L);
  assert.throws(() => applyCordVoyageSummary(L, q));
  assert.equal(JSON.stringify(L), before);
  q.pieces = [initial];
  const out = applyCordVoyageSummary(L, q);
  assert.deepEqual(out.lotIds, ['cord']);
  const stable = JSON.stringify(L);
  assert.throws(() => applyCordVoyageSummary(L, { ...q, maxLoadGf: 1 }));
  assert.equal(JSON.stringify(L), stable);
});
test('a later ordinary load uses the same updated /4 checkpoint', () => {
  const { L, initial } = fixture();
  const final = json(initial);
  final.damage.abrasions = 1;
  applyCordVoyageSummary(L, { commandId: 'voyage:then-load:0', assumptionId: ID,
    lotId: 'cord', worldAtMs: 100, islandAtMs: 0, initial, pieces: [final],
    sunMs: 0, shadeMs: 0, abrasions: 1, maxLoadGf: 0 });
  const same = applyCordLoad(L, { commandId: 'ordinary', assumptionId: ID,
    lotId: 'cord', worldAtMs: 101, islandAtMs: 0,
    event: { kind: 'load', gf: currentIntegerCordStrength(final) } });
  assert.deepEqual(same.lotIds, ['cord']);
});
console.log('PASS sail cord settlement: ' + groups + ' groups.');
