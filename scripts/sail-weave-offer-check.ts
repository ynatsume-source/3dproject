// Main's insufficient-weave offer guard, extended to explicit same-place bundles; and no splitting of leaves still wet.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/sail-weave-offer-check.ts
import assert from 'node:assert/strict';
import {emptyLedger, addLot} from '../src/world/process-runner';
import {makeSailHost, emptySailHostState} from '../src/robots/sail-host';
import {SAIL_RULES} from '../src/science/prototypes/sail-raft-rules';

let groups = 0;
function test(name: string, body: () => void): void {
  body();
  groups++;
  console.log('PASS ' + name);
}
const need = 20_000 * SAIL_RULES.weaveDryMgPerCm2;
function fixture() {
  const L = emptyLedger('w', 'weave-offer'), state = emptySailHostState();
  const at = (id: string, x: number) => ({id, x, z: 0, reachM: 2});
  const host = makeSailHost({lab: L, state: () => state, dev: [],
    roofed: () => true, wanted: () => true,
    placeSites: () => ({trees: [at('site:sail-tree-0', 0), at('site:sail-tree-1', 10)],
      dry: at('site:sail-dry', 20), work: at('site:sail-work', 30)})});
  const strips = (lotId: string, dry: number, location = 'site:sail-work') => {
    const water = Math.floor(dry / 5);
    return addLot(L, {lotId, materialId: 'pandanus_strips',
      amount: {value: dry + water, unit: 'mg'}, location,
      quality: {dry_mg: dry, water_mg: water, history_complete: 1, sail_codec: 1}});
  };
  const weave = () => host.options('dot', 1_000_000)
    .some(o => o.id === 'sail:weave:work');
  return {L, host, strips, weave};
}
test('a single short bundle is never offered; equality is offered', () => {
  for (const dry of [need / 2, need - 1, need]) {
    const a = fixture();
    a.strips('lot:strips', dry);
    assert.equal(a.weave(), dry >= need);
    if (dry < need) {
      const before = JSON.stringify(a.L);
      assert.deepEqual(a.host.beginWork('dot', 'weave', 'work',
        {x: 30, z: 0}, 1_000_001), {ok: false, felt: null});
      assert.equal(JSON.stringify(a.L), before);
    }
  }
});
test('partial bundles at one worksite are offered by their total', () => {
  const a = fixture();
  a.strips('lot:half', need / 2);
  a.strips('lot:quarter', need / 2 - 1);
  assert.equal(a.weave(), false);
  a.strips('lot:last-mg', 1);
  assert.equal(a.weave(), true);
  assert.deepEqual(a.host.beginWork('dot', 'weave', 'work',
    {x: 30, z: 0}, 1_000_001), {ok: true});
  const run = Object.values(a.L.runs).find(r => r.processId === 'prototype_sail_work')!;
  assert.equal(run.lotIds.length, 3);
});
test('different places do not make a sufficient group', () => {
  const a = fixture();
  a.strips('lot:here', need / 2);
  a.strips('lot:there', need / 2, 'site:elsewhere');
  assert.equal(a.weave(), false);
  a.strips('lot:whole-elsewhere', need, 'site:elsewhere');
  assert.equal(a.weave(), true);
});
test('leaves still wet are not offered for splitting; dry ones are (science soak 2026-10-21, dry-leaves-required)', () => {
  const a = fixture();
  const leaves = (lotId: string, dry: number, water: number) => addLot(a.L, {lotId, materialId: 'pandanus_leaves',
    amount: {value: dry + water, unit: 'mg'}, location: 'site:sail-work', quality: {dry_mg: dry, water_mg: water, history_complete: 1, sail_codec: 1}});
  const split = () => a.host.options('dot', 1_000_000).some(o => o.id === 'sail:split:work');
  leaves('lot:leaves:wet', 1_000_000, 2_000_000);
  assert.equal(split(), false);
  leaves('lot:leaves:damp', 1_000_000, 200_001);
  assert.equal(split(), false);
  leaves('lot:leaves:dry', 1_000_000, 200_000);
  assert.equal(split(), true);
});
console.log('PASS sail weave offer: ' + groups + ' groups');
