import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMeasurementRecord as record } from './measurement-record.mjs';

test('乾燥方法・単位・測定値・計算結果を一つのJSONに保持する', () => {
  const value = record({ wetMassG: 120, dryMassG: 100 }, {
    sampleId: ' A-01 ', inputOrigin: 'example', dryingMethod: 'heated',
    dryingProtocol: '設定110°C、24時間\n恒量は未確認', notes: '算術検証用の合成値',
  });
  const parsed = JSON.parse(JSON.stringify(value));
  assert.equal(parsed.format, 'science-lab-measurement');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.sampleId, 'A-01');
  assert.deepEqual(parsed.drying, { method: 'heated', protocol: '設定110°C、24時間\n恒量は未確認' });
  assert.deepEqual(parsed.units, { mass: 'g', length: 'mm', calculated: '%' });
  assert.equal(parsed.calculatedPercent.waterDryBasisPct, 20);
  assert.deepEqual(parsed.warnings, []);
});

test('常温と加熱を区別するが、乾燥質量や計算値を補正しない', () => {
  const values = { wetMassG: 120, dryMassG: 100 };
  const ambient = record(values, { dryingMethod: 'ambient', dryingProtocol: '25°C・RH60%、48時間、平衡は未確認' });
  const heated = record(values, { dryingMethod: 'heated', dryingProtocol: '110°C設定、24時間、恒量は未確認' });
  assert.notEqual(ambient.drying.method, heated.drying.method);
  assert.deepEqual(ambient.measurements, heated.measurements);
  assert.deepEqual(ambient.calculatedPercent, heated.calculatedPercent);
});

test('未記録や欠測はnullのまま残し、条件を推測しない', () => {
  const r = record({ wetMassG: 120, dryMassG: 100, firedMassG: '' });
  assert.deepEqual(r.drying, { method: 'unrecorded', protocol: null });
  assert.equal(r.measurements.firedMassG, null);
  assert.equal(r.measurements.saturatedMassG, null);
  assert.equal(r.sampleId, null);
  assert.equal(r.inputOrigin, 'unspecified');
  assert.equal(r.warnings.length, 4);
  assert.equal(Object.hasOwn(r.calculatedPercent, 'absorptionDryBasisPct'), false);
});

test('乾燥後の長さだけの場合も乾燥条件の不足を知らせる', () => {
  const r = record({ wetLengthMm: 100, dryLengthMm: 94 }, { sampleId: 'A', inputOrigin: 'example' });
  assert.equal(r.warnings.length, 2);
});

test('吸水だけを計算する場合に乾燥方法を要求しない', () => {
  const r = record({ firedMassG: 80, saturatedMassG: 100 }, { sampleId: 'A', inputOrigin: 'example' });
  assert.deepEqual(r.warnings, []);
  assert.equal(r.calculatedPercent.absorptionDryBasisPct, 25);
});

test('実測と自己申告しても確認済み・校正済みへ昇格しない', () => {
  for (const origin of ['measurement', 'simulation', 'example', 'unspecified']) {
    const r = record({ wetMassG: 120, dryMassG: 100 }, {
      inputOrigin: origin, evidenceStatus: 'verified', calibrationEligible: true,
    });
    assert.equal(r.evidenceStatus, 'unverified-user-entry');
    assert.equal(r.calibrationEligible, false);
  }
});

test('無効な測定・方法・文字列を拒否する', () => {
  assert.throws(() => record({ dryMassG: NaN }));
  assert.throws(() => record({ wetMassG: 10, dryMassG: 11 }));
  for (const dryingMethod of ['unknown', '__proto__', 'toString', 1])
    assert.throws(() => record({}, { dryingMethod }));
  assert.throws(() => record({}, { inputOrigin: 'verified' }));
  assert.throws(() => record({}, { sampleId: 123 }));
  assert.throws(() => record({}, { dryingProtocol: 'x'.repeat(2001) }));
});

test('記録作成で元の入力を変えず、外部への参照を残さない', () => {
  const values = Object.freeze({ wetMassG: 120, dryMassG: 100 });
  const metadata = Object.freeze({ dryingMethod: 'ambient', notes: '<script>not markup</script>' });
  const r = record(values, metadata);
  r.measurements.dryMassG = 50;
  assert.equal(values.dryMassG, 100);
  assert.equal(r.notes, '<script>not markup</script>');
});
