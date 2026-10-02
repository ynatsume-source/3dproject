import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMeasurements as measure } from './measurements.mjs';
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('LDWの記載例は湿量基準51.2%に丸まるが乾量基準では異なる', () => {
  const r = measure({ wetMassG: 5.04, dryMassG: 2.46 });
  assert.equal(r.waterWetBasisPct.toFixed(1), '51.2');
  near(r.waterDryBasisPct, 104.8780487804878);
  near(r.waterDryBasisPct / (100 + r.waterDryBasisPct) * 100, r.waterWetBasisPct);
});
test('仮の試料で収縮の合成と吸水率の分母を確認する', () => {
  const r = measure({ wetLengthMm: 100, dryLengthMm: 90, firedLengthMm: 81,
    firedMassG: 80, saturatedMassG: 100 });
  near(r.dryingShrinkagePct, 10); near(r.firingShrinkagePct, 10);
  near(r.totalShrinkagePct, 19); near(r.absorptionDryBasisPct, 25);
  assert.notEqual(r.totalShrinkagePct, r.dryingShrinkagePct + r.firingShrinkagePct);
});
test('膨張と正味の焼成増量を切り捨てない', () => {
  const r = measure({ dryLengthMm: 100, firedLengthMm: 102, dryMassG: 50, firedMassG: 51 });
  near(r.firingShrinkagePct, -2); near(r.netFiringMassLossPct, -2);
});
test('空欄・一部の測定を0や完了済みに読み替えない', () => {
  assert.deepEqual(measure({}), {});
  assert.deepEqual(measure({ wetMassG: 100, dryMassG: '' }), {});
  assert.deepEqual(measure({ firedMassG: 100, saturatedMassG: 100 }), { absorptionDryBasisPct: 0 });
});
test('無効な数値・質量の組を拒否する', () => {
  for (const value of [0, -1, NaN, Infinity, '100', false])
    assert.throws(() => measure({ wetMassG: value }));
  assert.throws(() => measure({ wetMassG: 100, dryMassG: 101 }));
  assert.throws(() => measure({ firedMassG: 100, saturatedMassG: 99 }));
  assert.throws(() => measure({ wetMassG: 1e308, dryMassG: Number.MIN_VALUE }));
});
test('入力を変更せず、同じ単位での比例拡大に結果が依存しない', () => {
  const small = Object.freeze({ wetMassG: 120, dryMassG: 100, wetLengthMm: 100, dryLengthMm: 94 });
  assert.deepEqual(measure(small), measure({ wetMassG: 240, dryMassG: 200, wetLengthMm: 200, dryLengthMm: 188 }));
});
