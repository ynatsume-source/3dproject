// Run the clay test-world scenario and write a reproducible record:
//   npx tsx scripts/science-clay-report.ts [outDir]
// Writes clay-loop-v0.json (inputs, final state, ledgers, params, sources) and clay-loop-v0.html (observation page).
// Output is deterministic: running it twice gives byte-identical files.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { totalMg, SPECIES, type Composition } from '../src/science/chem';
import { PARAMS } from '../src/science/params';
import { SOURCES } from '../src/science/sources';
import { runScenario } from '../src/science/fixture/scenario';
import { hashOf } from '../src/science/fixture/world';
import { CONTRACT_VERSION, type ProcessRun } from '../src/science/types';

const outDir = process.argv[2] ?? 'docs/proposals/civilization/science/runs';
mkdirSync(outDir, { recursive: true });

const d = runScenario();
const st = d.w.state, v = st.view;
const record = {
  contract: CONTRACT_VERSION, worldId: st.worldId, worldVersion: st.worldVersion, stateHash: hashOf(st),
  note: '試験世界の記録。全ての材料・設備は test-fixture で、本世界の在庫・歴史には混ぜない。実AIは使っていない。',
  commands: d.log, invariants: d.w.check(),
  massBaseline: st.massBaseline, atmosphereOut: st.atmosphereOut, atmosphereIn: st.atmosphereIn,
  view: v, events: st.events, energy: st.energy, boundary: st.boundary,
  params: PARAMS, sources: SOURCES,
};
writeFileSync(join(outDir, 'clay-loop-v0.json'), JSON.stringify(record, null, 1) + '\n');

// ---------------- HTML ----------------
const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const g = (mg: number) => (mg / 1000).toFixed(1);
const kg = (mg: number) => (mg / 1e6).toFixed(2);
const MJ = (j: number) => (j / 1e6).toFixed(2);
const comp = (c: Composition) => Object.entries(c).filter(([, x]) => x).map(([k, x]) => `${esc(SPECIES[k as keyof typeof SPECIES].label.split(' ')[0])} ${g(x!)} g`).join('、') || '—';
const table = (head: string[], rows: (string | number)[][]) =>
  `<div class="tw"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

function curve(runs: ProcessRun[]): string {
  const W = 640, Hh = 240, pad = 36;
  const maxT = Math.max(...runs.flatMap((r) => r.checkpoints.map((c) => c.tMin)));
  const x = (t: number) => pad + ((W - pad - 8) * t) / maxT;
  const y = (c: number) => Hh - pad + (-(Hh - pad - 10) * c) / 1100;
  const colors = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];
  const grid = [0, 200, 400, 573, 800, 1000].map((c) => `<line x1="${pad}" x2="${W - 8}" y1="${y(c)}" y2="${y(c)}" class="${c === 573 ? 'q' : 'gl'}"/><text x="4" y="${y(c) + 4}" class="ax">${c}</text>`).join('');
  const hours = Array.from({ length: Math.floor(maxT / 120) + 1 }, (_, i) => i * 2).map((h) => `<text x="${x(h * 60) - 4}" y="${Hh - 18}" class="ax">${h}h</text>`).join('');
  const lines = runs.map((r, i) => {
    const k = r.checkpoints.map((c) => `${x(c.tMin).toFixed(1)},${y(c.kilnC).toFixed(1)}`).join(' ');
    const w = r.checkpoints.map((c) => `${x(c.tMin).toFixed(1)},${y(c.wareC).toFixed(1)}`).join(' ');
    return `<polyline points="${k}" fill="none" stroke="${colors[i]}" stroke-width="2"/><polyline points="${w}" fill="none" stroke="${colors[i]}" stroke-width="1" stroke-dasharray="3 3"/>`;
  }).join('');
  const legend = runs.map((r, i) => `<span class="lg"><i style="background:${colors[i]}"></i>${esc(r.id)}（${esc(v.facilities[r.facilityId].label)}）</span>`).join('');
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="焼成の温度経過">${grid}${hours}${lines}</svg><p class="legend">${legend}<span class="lg">実線＝炉内、点線＝試験片（°C）、赤い線＝石英転移 573 °C</span></p>`;
}

const fires = Object.values(v.runs).filter((r) => r.kind === 'firing');
const sampleRows = Object.values(v.samples).map((s) => {
  const seen = Object.values(v.observations).filter((o) => o.sampleId === s.id && o.kind !== 'duration' && o.kind !== 'dryness').map((o) => `${esc(o.value)}${o.unit ? esc(o.unit) : ''}`).join(' / ');
  return [esc(s.label), esc(s.stage), s.maxWareTempC > 0 ? s.maxWareTempC.toFixed(0) : '—', (s.dehydrox * 100).toFixed(0) + '%', (s.sinter * 100).toFixed(0) + '%',
    s.cracks.map((k) => `${k.mechanism}/${k.severity}（比 ${k.ratio}, p ${k.p}）`).join('<br>') || 'なし',
    `乾燥 ${s.risk.dryFluxRatioMax.toFixed(2)} / 蒸気 ${s.risk.steamRatioMax.toFixed(2)} / 転移 ${s.risk.duntRatioMax.toFixed(2)}`, seen || '—'];
});
const fireRows = fires.map((r) => [esc(r.id), esc(v.facilities[r.facilityId].label), esc(`${r.plan!.pace}・${r.plan!.targetGlow}・${r.plan!.holdMin}分・${r.plan!.cooling}`),
  esc(r.outcome), r.peakKilnC!.toFixed(0), kg(r.fuelBurnedMg!), MJ(r.energy.releasedJ), MJ(r.energy.flueLossJ), MJ(r.energy.wallLossJ),
  (r.energy.wareSensibleJ + r.energy.reactionsNetJ).toFixed(0) + ' J', MJ(r.energy.structureStoredJ)]);
const lotRows = Object.values(v.lots).map((l) => [esc(l.id), esc(l.label), esc(l.kind), g(totalMg(l.comp)), comp(l.comp), l.protected ? '保護' : '', esc(l.provenance.kind)]);
const resRows = Object.values(v.reservations).map((r) => [esc(r.id), esc(r.lotId), esc(r.purpose), g(r.mg), g(r.consumedMg), r.open ? '予約中' : '閉じた']);
const obsRows = Object.values(v.observations).map((o) => [esc(o.residentId), esc(o.sampleId ?? o.runId ?? ''), esc(o.kind), esc(o.value) + (o.unit ? esc(o.unit) : ''), o.instrumentId ? `${esc(o.instrumentId)}（${o.resolution}）` : '感覚・計数', esc(o.text)]);
const research = Object.values(v.research).map((r) => `<div class="card"><h3>${esc(r.id)}：${esc(r.question)}</h3>
<p><b>仮説</b> ${esc(r.hypothesis.text)}（変える条件：${esc(r.hypothesis.variable)}）</p>
<p><b>出発点</b> ${r.basis.map((b) => `${esc(b.kind)} — ${esc(b.note)}`).join('；')}</p>
<p><b>揃えた条件</b> ${esc(JSON.stringify(r.controls))}</p>
<p><b>試料</b> ${r.trials.map((t) => `${esc(t.sampleId)} ${esc(JSON.stringify(t.condition))}`).join('、')}</p>
<p><b>結論</b> ${esc(r.conclusion?.verdict ?? '')}：${esc(r.conclusion?.text ?? '')}</p>${r.next ? `<p><b>次</b> ${esc(r.next)}</p>` : ''}</div>`).join('');
const procs = Object.values(v.procedures).map((p) => [esc(p.id), esc(p.goal), esc(JSON.stringify(p.steps)), esc(p.status), esc(p.evidence.map((e) => `${e.sampleId}:${e.ok ? '成功' : '失敗'}`).join(' ')), esc(p.unknowns.join('、'))]);
const paramRows = Object.values(PARAMS).map((p) => [esc(p.id), String(p.value), esc(p.unit), `<span class="st ${p.status}">${p.status}</span>`, esc(p.sources.join(', ')), esc(p.note)]);
const srcRows = SOURCES.map((s) => [esc(s.id), esc(s.topic), `<span class="st ${s.retrieval}">${s.retrieval}</span>`, esc(s.candidates.join('；')), esc(s.summaryClaims.join('；')), esc(s.modelUse)]);
const rejRows = d.log.filter((l) => !l.ok).map((l) => [esc(l.cmd), esc(l.type), esc(l.note)]);
const out = st.atmosphereOut, inn = st.atmosphereIn;

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>粘土試験片の記録</title>
<style>
:root{--bg:#f7f5f0;--fg:#1f1d1a;--mut:#6b665e;--line:#d9d3c7;--card:#fffdf8;--c1:#b4532a;--c2:#2f6f8f;--c3:#5d8a3a;--c4:#8a4f9e;--q:#c0392b;--ok:#2e7d32;--warn:#a15c00;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1b1a18;--fg:#ece8e1;--mut:#a39d93;--line:#3a3732;--card:#24221f;--c1:#e48a5e;--c2:#6fb2d4;--c3:#9cc76f;--c4:#c48fd6;--q:#ff6b5b;--ok:#7bc47f;--warn:#e0a23c;--bad:#ff8a80}}
:root[data-theme="dark"]{--bg:#1b1a18;--fg:#ece8e1;--mut:#a39d93;--line:#3a3732;--card:#24221f;--c1:#e48a5e;--c2:#6fb2d4;--c3:#9cc76f;--c4:#c48fd6;--q:#ff6b5b;--ok:#7bc47f;--warn:#e0a23c;--bad:#ff8a80}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,"Hiragino Sans","Noto Sans JP",sans-serif}
main{max-width:1080px;margin:0 auto;padding:24px 16px 64px;overflow-wrap:anywhere}
h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.15rem;margin:32px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}h3{font-size:1rem;margin:0 0 6px}
p{margin:6px 0}.mut{color:var(--mut)}.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:680px;font-size:13px;overflow-wrap:normal}
th,td{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top}th{color:var(--mut);font-weight:600;white-space:nowrap}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin:10px 0}
svg{width:100%;height:auto;background:var(--card);border:1px solid var(--line);border-radius:8px}
.gl{stroke:var(--line);stroke-width:1}.q{stroke:var(--q);stroke-width:1;stroke-dasharray:4 3}.ax{fill:var(--mut);font-size:10px}
.legend{font-size:12px;color:var(--mut)}.lg{display:inline-flex;align-items:center;gap:4px;margin-right:12px}.lg i{display:inline-block;width:14px;height:3px}
.st{font-size:11px;padding:1px 6px;border-radius:9px;border:1px solid currentColor;white-space:nowrap}
.st.sourced,.st.retrieved{color:var(--ok)}.st.calibrated,.st.search-summary{color:var(--warn)}.st.assumed,.st.not-found{color:var(--bad)}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.kpi div{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px}.kpi b{display:block;font-size:1.1rem}
</style></head><body><main>
<h1>粘土試験片の研究一周（試験世界）</h1>
<p class="mut">契約 ${CONTRACT_VERSION} / 世界 ${esc(st.worldId)} / 確定版 ${st.worldVersion} / 状態ハッシュ ${record.stateHash}</p>
<div class="card"><p><b>これは何か。</b>科学コアが試験世界で、成形→乾燥→焼成→冷却→吸水・割れの評価→条件の見直しを、規則だけで実行した記録です。実AIは使っていません。材料・設備はすべて <code>test-fixture</code>（嘉弥真島の資源ではない）で、本世界の在庫や歴史には入りません。</p>
<p><b>数値の確からしさ。</b>原典の本文は今回も取得できず（ネットワーク遮断）、全ての数値は「仮定」か「範囲に合わせた校正値」です。下の表で区別しています。</p></div>

<h2>まとめ</h2>
<div class="kpi">
<div>質量収支<b>${record.invariants.length === 0 ? '一致' : '不一致'}</b><span class="mut">初期 ${kg(st.massBaseline.initialMg)} kg ＋流入 ${kg(st.massBaseline.inflowMg)} − 流出 ${kg(st.massBaseline.outflowMg)}</span></div>
<div>大気へ<b>CO2 ${kg(out.co2 ?? 0)} kg</b><span class="mut">水蒸気 ${kg(out.water ?? 0)} kg</span></div>
<div>大気から<b>O2 ${kg(inn.o2 ?? 0)} kg</b><span class="mut">燃焼と有機物の酸化</span></div>
<div>薪<b>${kg(fires.reduce((s, r) => s + r.fuelBurnedMg!, 0))} kg</b><span class="mut">${fires.length} 回の焼成</span></div>
<div>拒否された操作<b>${rejRows.length}</b><span class="mut">設備なし・燃料なし・保護資源</span></div>
</div>

<h2>焼成の温度経過</h2>${curve(fires)}
${table(['回', '設備', '住民の計画', '結果', '炉内最高 °C', '薪 kg', '放出 MJ', '排気 MJ', '壁 MJ', '試験片へ（顕熱＋反応）', '構造に残る MJ'], fireRows)}
<p class="mut">熱は「放出＝排気＋壁からの損失＋試験片の顕熱＋反応熱＋炉体の蓄熱」で毎ステップ閉じる。試験片に入る熱は放出熱の1万分の1以下。試験片の欄が負なのは、冷えて顕熱が戻ったうえで、有機物の燃焼熱が脱水・分解・蒸発の吸熱を上回ったため。fire-3 と fire-4 は同じ条件・同じ燃料で、曲線が重なる（v0にはロットごとのばらつきがない）。</p>

<h2>試験片：世界の真の状態と、住民が知ったこと</h2>
${table(['試験片', '段階', '最高温度 °C', '脱水', '焼結', '割れ（機構/程度、危険比、確率）', '危険比 乾燥/蒸気/転移', '住民の観察'], sampleRows)}

<h2>研究記録</h2>${research}
<h2>身につけた作り方</h2>${table(['ID', '目的', '手順（住民が操作できる条件のみ）', '状態', '根拠', '未確認'], procs)}
<h2>住民の観察（本人が知ったことだけ）</h2>${table(['住民', '対象', '種類', '値', '測り方', '説明'], obsRows)}
<h2>拒否された操作</h2>${table(['命令', '種類', '理由'], rejRows)}
<h2>材料ロット（最終）</h2>${table(['ID', '名前', '種類', '量 g', '組成', '', '出所'], lotRows)}
<h2>研究用の予約</h2>${table(['ID', 'ロット', '目的', '予約 g', '使用 g', '状態'], resRows)}
<h2>使った数値と、その確からしさ</h2>${table(['ID', '値', '単位', '状態', '出典カード', '意味'], paramRows)}
<h2>出典カード（照合の状態）</h2>${table(['ID', '主題', '取得', '確認先の候補', '検索要約が述べたこと（未照合）', 'モデルでの使い方'], srcRows)}
</main></body></html>
`;
writeFileSync(join(outDir, 'clay-loop-v0.html'), html);
console.log(`wrote ${outDir}/clay-loop-v0.{json,html} — state ${record.stateHash}, ${d.log.length} commands, invariants ${record.invariants.length ? record.invariants.join(';') : 'ok'}`);
