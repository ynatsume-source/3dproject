import { measurementFields, summarizeMeasurements } from './measurements.mjs';

export const dryingMethods = Object.freeze({
  unrecorded: '未記録', ambient: '常温乾燥', heated: '加熱乾燥', other: 'その他',
});
export const inputOrigins = Object.freeze({
  unspecified: '未記録', measurement: '実測値の転記', simulation: 'モデルの出力', example: '計算例',
});

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
  const warnings = [];
  if (!sampleId) warnings.push('試料IDが未記録です。');
  if (inputOrigin === 'unspecified') warnings.push('値の由来が未記録です。');
  if (measurements.dryMassG !== null || measurements.dryLengthMm !== null) {
    if (drying.method === 'unrecorded') warnings.push('乾燥後の測定値がありますが、乾燥方法が未記録です。');
    if (!drying.protocol) warnings.push('乾燥温度・時間・終点の確認方法を記録してください。');
  }
  return {
    format: 'science-lab-measurement', version: 1, sampleId, inputOrigin,
    drying, notes, units: { mass: 'g', length: 'mm', calculated: '%' },
    measurements, calculatedPercent, warnings,
    evidenceStatus: 'unverified-user-entry', calibrationEligible: false,
  };
}
