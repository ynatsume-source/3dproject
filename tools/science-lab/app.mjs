import { summarizeMeasurements } from './measurements.mjs';

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
form.addEventListener('submit', event => {
  event.preventDefault();
  results.replaceChildren();
  try {
    const values = Object.fromEntries([...new FormData(form)].map(([key, value]) =>
      [key, value === '' ? undefined : Number(value)]));
    const rows = Object.entries(summarizeMeasurements(values));
    if (!rows.length) { results.textContent = '計算に必要な測定値の組を入力してください。'; return; }
    const list = document.createElement('dl');
    for (const [key, value] of rows) {
      const term = document.createElement('dt');
      term.textContent = labels[key];
      const definition = document.createElement('dd');
      definition.textContent = `${value.toFixed(4)} %`;
      list.append(term, definition);
    }
    results.append(list);
  } catch (error) { results.textContent = error.message; }
});
form.addEventListener('reset', () => { results.textContent = '測定値を入力してください。入力内容は保存されません。'; });

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
