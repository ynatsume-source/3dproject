import { measurementFields } from './measurements.mjs';
import { createMeasurementRecord, dryingMethods, inputOrigins } from './measurement-record.mjs';

const labels = {
  waterWetBasisPct: '含水率（成形時質量が分母）',
  waterDryBasisPct: '含水率（乾燥後質量が分母）',
  dryingShrinkagePct: '乾燥収縮率（成形時距離が分母）',
  firingShrinkagePct: '焼成収縮率（乾燥後距離が分母）',
  totalShrinkagePct: '全収縮率（成形時距離が分母）',
  absorptionDryBasisPct: '吸水率（焼成後質量が分母）',
  netFiringMassLossPct: '正味の焼成質量減少率（乾燥後質量が分母）',
};
const form = document.querySelector('#measurements');
const results = document.querySelector('#results');
const download = document.querySelector('#download-record');
let currentRecord = null;
const clearRecord = () => { currentRecord = null; download.disabled = true; };
const invalidateRecord = () => {
  if (currentRecord) results.textContent = '入力が変わりました。もう一度計算してから記録を保存してください。';
  clearRecord();
};
form.addEventListener('input', invalidateRecord);
form.addEventListener('change', invalidateRecord);
form.addEventListener('submit', event => {
  event.preventDefault();
  clearRecord();
  results.replaceChildren();
  try {
    const fields = Object.fromEntries(new FormData(form));
    const values = Object.fromEntries(Object.keys(measurementFields).map(key =>
      [key, fields[key] === '' ? undefined : Number(fields[key])]));
    const record = createMeasurementRecord(values, fields);
    const rows = Object.entries(record.calculatedPercent);
    if (!rows.length) { results.textContent = '計算に必要な測定値の組を入力してください。'; return; }
    const context = document.createElement('p');
    context.className = 'record-context';
    context.textContent = `試料: ${record.sampleId ?? '未記録'} / 値の由来: ${inputOrigins[record.inputOrigin]} / 乾燥方法: ${dryingMethods[record.drying.method]}\n乾燥条件・終点: ${record.drying.protocol ?? '未記録'}\n測定メモ: ${record.notes ?? '未記録'}`;
    results.append(context);
    const list = document.createElement('dl');
    for (const [key, value] of rows) {
      const term = document.createElement('dt');
      term.textContent = labels[key];
      const definition = document.createElement('dd');
      definition.textContent = `${value.toFixed(4)} %`;
      list.append(term, definition);
    }
    results.append(list);
    if (record.warnings.length) {
      const warnings = document.createElement('ul');
      warnings.className = 'record-warnings';
      for (const message of record.warnings) {
        const item = document.createElement('li');
        item.textContent = message;
        warnings.append(item);
      }
      results.append(warnings);
    }
    currentRecord = record;
    download.disabled = false;
  } catch (error) { results.textContent = error.message; }
});
form.addEventListener('reset', () => {
  clearRecord();
  results.textContent = '測定値を入力してください。自動保存はしません。';
});
download.addEventListener('click', () => {
  if (!currentRecord) return;
  const blob = new Blob([JSON.stringify(currentRecord, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'science-lab-measurement.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

const sources = document.querySelector('#sources');
try {
  const response = await fetch('../../data/science/sources.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  sources.replaceChildren();
  for (const source of data.sources) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const archived = source.verification === 'archived-text-passages-read-original-unverified';
    summary.textContent = `${source.title} — ${archived ? '保存コピーを確認・原典未照合' : '公式ソース本文を確認'}`;
    const link = document.createElement('a');
    link.href = source.url;
    link.textContent = `取得した本文（${source.commit.slice(0,7)}）`;
    const support = document.createElement('p');
    support.textContent = source.supports;
    const limit = document.createElement('p');
    limit.textContent = `未確認の範囲: ${source.doesNotVerify}`;
    details.append(summary, link, support, limit);
    sources.append(details);
  }
} catch (error) { sources.textContent = `出典を取得できませんでした: ${error.message}。リポジトリのルートで npm run dev を実行して開いてください。`; }
