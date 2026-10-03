import { measurementCalculator, measurementFields, summarizeMeasurements } from './measurements.mjs';

export const dryingMethods = Object.freeze({
  unrecorded: '未記録', ambient: '常温乾燥', heated: '加熱乾燥', other: 'その他',
});
export const inputOrigins = Object.freeze({
  unspecified: '未記録', measurement: '実測値の転記', simulation: 'モデルの出力', example: '計算例',
});
export const absorptionMethods = Object.freeze({
  unrecorded: '未記録', immersion: '浸漬のみ（煮沸なし）', boiling: '煮沸のみ',
  'boiling-then-soak': '煮沸後に浸漬', other: 'その他',
});
export const surfaceWaterMethods = Object.freeze({
  unrecorded: '未記録', blotted: '布などで拭き取り', drained: '水切りのみ',
  none: '除去せず', other: 'その他',
});

function hours(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label}は0以上の有限の数で入力してください（単位：時間）。`);
  }
  return value;
}

function text(value, label, limit) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > limit) {
    throw new Error(`${label}は${limit}文字以内の文字列で入力してください。`);
  }
  return value.trim() || null;
}

function choice(value, choices, fallback, label) {
  const selected = value ?? fallback;
  if (typeof selected !== 'string' || !Object.hasOwn(choices, selected)) {
    throw new Error(`${label}を選び直してください。`);
  }
  return selected;
}

// A portable observation note, not a world save or verified scientific dataset.
// Keep input units and missing values explicit; never infer a drying endpoint.
export function createMeasurementRecord(values, metadata = {}) {
  const calculatedPercent = summarizeMeasurements(values);
  const measurements = Object.fromEntries(Object.keys(measurementFields).map(key =>
    [key, values[key] === undefined || values[key] === '' || values[key] === null ? null : values[key]]));
  const sampleId = text(metadata.sampleId, '試料ID', 120);
  const inputOrigin = choice(metadata.inputOrigin, inputOrigins, 'unspecified', '値の由来');
  const drying = {
    method: choice(metadata.dryingMethod, dryingMethods, 'unrecorded', '乾燥方法'),
    protocol: text(metadata.dryingProtocol, '乾燥条件・終点', 2000),
  };
  const notes = text(metadata.notes, '測定メモ', 4000);
  const absorption = {
    method: choice(metadata.absorptionMethod, absorptionMethods, 'unrecorded', '吸水方法'),
    boilingHours: hours(metadata.boilingHours, '煮沸時間'),
    soakingHours: hours(metadata.soakingHours, '浸漬時間'),
    surfaceWaterRemoval: choice(metadata.surfaceWaterRemoval, surfaceWaterMethods, 'unrecorded', '表面水の処理'),
    protocol: text(metadata.absorptionProtocol, '吸水の条件・手順', 2000),
  };
  const warnings = [];
  if (!sampleId) warnings.push('試料IDが未記録です。');
  if (inputOrigin === 'unspecified') warnings.push('値の由来が未記録です。');
  if (measurements.dryMassG !== null || measurements.dryLengthMm !== null) {
    if (drying.method === 'unrecorded') warnings.push('乾燥後の測定値がありますが、乾燥方法が未記録です。');
    if (!drying.protocol) warnings.push('乾燥温度・時間・終点の確認方法を記録してください。');
  }
  if (measurements.saturatedMassG !== null) {
    if (absorption.method === 'unrecorded') warnings.push('吸水後の測定値がありますが、吸水方法が未記録です。');
    const boils = ['boiling', 'boiling-then-soak'].includes(absorption.method);
    const soaks = ['immersion', 'boiling-then-soak'].includes(absorption.method);
    if (boils && absorption.boilingHours === null) warnings.push('煮沸時間が未記録です。');
    if (soaks && absorption.soakingHours === null) warnings.push('浸漬時間が未記録です。');
    if (boils && absorption.boilingHours === 0) warnings.push('煮沸する方法で時間が0です。手順と時間を確認してください。');
    if (soaks && absorption.soakingHours === 0) warnings.push('浸漬する方法で時間が0です。手順と時間を確認してください。');
    if (absorption.method === 'immersion' && absorption.boilingHours > 0) warnings.push('浸漬のみの選択に煮沸時間があります。方法を確認してください。');
    if (absorption.method === 'boiling' && absorption.soakingHours > 0) warnings.push('煮沸のみの選択に浸漬時間があります。方法を確認してください。');
    if (absorption.surfaceWaterRemoval === 'unrecorded') warnings.push('秤量前の表面水の処理が未記録です。');
    if (absorption.surfaceWaterRemoval === 'none') warnings.push('表面水を除去していないため、質量増加に表面水が含まれる可能性があります。');
    if (!absorption.protocol) warnings.push('吸水の水温・処理の詳細を記録してください。');
  }
  return {
    format: 'science-lab-measurement', version: 2,
    calculator: { ...measurementCalculator }, sampleId, inputOrigin,
    drying, absorption, notes, units: { mass: 'g', length: 'mm', calculated: '%' },
    measurements, calculatedPercent, warnings,
    evidenceStatus: 'unverified-user-entry', calibrationEligible: false,
  };
}
