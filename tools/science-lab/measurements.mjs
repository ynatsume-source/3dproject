// Observation arithmetic only. No process, elapsed-time model, inventory or state.
export const measurementFields = Object.freeze({
  wetMassG: '成形時質量', dryMassG: '乾燥後質量', firedMassG: '焼成後質量',
  saturatedMassG: '吸水後質量', wetLengthMm: '成形時標点間距離',
  dryLengthMm: '乾燥後標点間距離', firedLengthMm: '焼成後標点間距離',
});

export function summarizeMeasurements(input) {
  const values = {};
  for (const [key, label] of Object.entries(measurementFields)) {
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${label}は0より大きい有限の数で入力してください。`);
    }
    values[key] = value;
  }
  const { wetMassG: wet, dryMassG: dry, firedMassG: fired,
    saturatedMassG: saturated, wetLengthMm: lw, dryLengthMm: ld,
    firedLengthMm: lf } = values;
  const result = {};
  if (wet !== undefined && dry !== undefined) {
    if (dry > wet) throw new Error('乾燥後質量が成形時質量を超えています。試料・単位・風袋を確認してください。');
    result.waterWetBasisPct = (wet - dry) / wet * 100;
    result.waterDryBasisPct = (wet - dry) / dry * 100;
  }
  if (lw !== undefined && ld !== undefined) result.dryingShrinkagePct = (lw - ld) / lw * 100;
  if (ld !== undefined && lf !== undefined) result.firingShrinkagePct = (ld - lf) / ld * 100;
  if (lw !== undefined && lf !== undefined) result.totalShrinkagePct = (lw - lf) / lw * 100;
  if (fired !== undefined && saturated !== undefined) {
    if (saturated < fired) throw new Error('吸水後質量が焼成後質量より小さくなっています。測定条件を確認してください。');
    result.absorptionDryBasisPct = (saturated - fired) / fired * 100;
  }
  // Negative values remain visible: expansion or a net firing mass gain is possible.
  if (dry !== undefined && fired !== undefined) result.netFiringMassLossPct = (dry - fired) / dry * 100;
  if (Object.values(result).some(value => !Number.isFinite(value))) {
    throw new Error('数値の桁が計算範囲を超えています。単位と入力値を確認してください。');
  }
  return result;
}
