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
  assert.equal(parsed.version, 2);
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
  const r = record({ firedMassG: 80, saturatedMassG: 100 }, {
    sampleId: 'A', inputOrigin: 'example', absorptionMethod: 'immersion', soakingHours: 24,
    surfaceWaterRemoval: 'blotted', absorptionProtocol: '水温20°Cの例。湿らせた布で拭き取り。',
  });
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

test('記録の版と、実際に使った計算式の版を区別する', () => {
  const r = record({ firedMassG: 80, saturatedMassG: 100 }, {
    version: 99, calculator: { id: 'injected', version: 99 },
  });
  assert.equal(r.version, 2);
  assert.deepEqual(r.calculator, { id: 'measurements', version: 1 });
  assert.equal(r.calculatedPercent.absorptionDryBasisPct, 25);
  r.calculator.version = 99;
  assert.deepEqual(record({}).calculator, { id: 'measurements', version: 1 });
});

test('煮沸とその後の浸漬を別々の時間としてJSONに残す', () => {
  const r = JSON.parse(JSON.stringify(record({ firedMassG: 80, saturatedMassG: 100 }, {
    sampleId: 'A', inputOrigin: 'example', absorptionMethod: 'boiling-then-soak',
    boilingHours: 5, soakingHours: 19, surfaceWaterRemoval: 'blotted',
    absorptionProtocol: '合成例。煮沸後に冷却・浸漬し、布で拭いて秤量。',
  })));
  assert.deepEqual(r.absorption, {
    method: 'boiling-then-soak', boilingHours: 5, soakingHours: 19, surfaceWaterRemoval: 'blotted',
    protocol: '合成例。煮沸後に冷却・浸漬し、布で拭いて秤量。',
  });
  assert.deepEqual(r.warnings, []);
  assert.equal(r.evidenceStatus, 'unverified-user-entry');
  assert.equal(r.calibrationEligible, false);
});

test('手順や表面水処理が違っても吸水率の数値を換算しない', () => {
  const values = { firedMassG: 80, saturatedMassG: 100 };
  const a = record(values, { absorptionMethod: 'immersion', soakingHours: 24, surfaceWaterRemoval: 'none' });
  const b = record(values, { absorptionMethod: 'boiling-then-soak', boilingHours: 5, soakingHours: 19, surfaceWaterRemoval: 'blotted' });
  assert.deepEqual(a.calculatedPercent, b.calculatedPercent);
  assert.ok(a.warnings.some(message => message.includes('表面水が含まれる')));
});

test('時間の欠測と明示した0を区別し、手順の標準値を補わない', () => {
  const values = { firedMassG: 80, saturatedMassG: 100 };
  const missing = record(values, { absorptionMethod: 'boiling-then-soak' });
  assert.equal(missing.absorption.boilingHours, null);
  assert.equal(missing.absorption.soakingHours, null);
  assert.ok(missing.warnings.some(message => message.includes('煮沸時間が未記録')));
  assert.ok(missing.warnings.some(message => message.includes('浸漬時間が未記録')));
  const zero = record(values, { absorptionMethod: 'immersion', boilingHours: 0, soakingHours: 0 });
  assert.equal(zero.absorption.boilingHours, 0);
  assert.equal(zero.absorption.soakingHours, 0);
  assert.ok(zero.warnings.some(message => message.includes('浸漬する方法で時間が0')));
});

test('方法が未記録でも吸水後質量のある記録では未記録事項を知らせる', () => {
  const r = record({ saturatedMassG: 100 }, { sampleId: 'A', inputOrigin: 'example' });
  assert.deepEqual(r.absorption, { method: 'unrecorded', boilingHours: null, soakingHours: null, surfaceWaterRemoval: 'unrecorded', protocol: null });
  assert.equal(r.warnings.length, 3);
  assert.equal(Object.hasOwn(r.calculatedPercent, 'absorptionDryBasisPct'), false);
});

test('手順と時間の不一致を知らせ、入力値を勝手に消さない', () => {
  const values = { firedMassG: 80, saturatedMassG: 100 };
  const a = record(values, { absorptionMethod: 'immersion', boilingHours: 5, soakingHours: 19 });
  const b = record(values, { absorptionMethod: 'boiling', boilingHours: 5, soakingHours: 19 });
  assert.ok(a.warnings.some(message => message.includes('浸漬のみの選択に煮沸時間')));
  assert.ok(b.warnings.some(message => message.includes('煮沸のみの選択に浸漬時間')));
  assert.equal(a.absorption.boilingHours, 5);
  assert.equal(b.absorption.soakingHours, 19);
});

test('不正な時間や方法を拒否し、小数時間はそのまま保存する', () => {
  for (const value of [-1, NaN, Infinity, '5', false]) {
    assert.throws(() => record({}, { boilingHours: value }));
    assert.throws(() => record({}, { soakingHours: value }));
  }
  for (const value of ['toString', '__proto__', 'standard', 1]) {
    assert.throws(() => record({}, { absorptionMethod: value }));
    assert.throws(() => record({}, { surfaceWaterRemoval: value }));
  }
  assert.throws(() => record({}, { absorptionProtocol: 110 }));
  assert.throws(() => record({}, { absorptionProtocol: 'x'.repeat(2001) }));
  assert.equal(record({}, { soakingHours: .5 }).absorption.soakingHours, .5);
});

test('吸水を測っていない記録に吸水手順を要求しない', () => {
  const r = record({ wetLengthMm: 100, firedLengthMm: 90 }, { sampleId: 'A', inputOrigin: 'example' });
  assert.deepEqual(r.warnings, []);
  assert.equal(r.absorption.method, 'unrecorded');
});
