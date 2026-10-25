// Rehearsal analysis (science team). Reads the ?rehearsal log (ndjson, src/ui/rehearsal-log.ts) and, optionally, saveOut
// files (save-*.json). Prints a Markdown report. Usage:
//   npx tsx analyze.mts rehearsal-XXXX.ndjson [save-before.json save-after.json ...] [--yen 150]
// Prices: per million tokens, USD — the same table as src/robots/agent/config.ts PRICE (input/output only: the log does
// not carry cache tokens, so a cached prompt is costed at the full input price: an upper bound).
import { readFileSync } from 'node:fs';

const PRICE: Record<string, { in: number; out: number }> = {
  'claude-opus-5-5': { in: 4, out: 20 }, 'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 }, 'claude-haiku-4-5': { in: 1, out: 5 }, 'claude-haiku-5-5': { in: 0.1, out: 0.5 },
};
const args = process.argv.slice(2);
const yi = args.indexOf('--yen'); const YEN = yi >= 0 ? +args[yi + 1] : 150; if (yi >= 0) args.splice(yi, 2);
const [logPath, ...savePaths] = args;
if (!logPath) { console.error('usage: analyze.mts log.ndjson [save.json ...] [--yen 150]'); process.exit(2); }

type Row = { t: string; jst: string; isl: string; world: string | null; [k: string]: any };
const rows: Row[] = []; let bad = 0;
for (const line of readFileSync(logPath, 'utf8').split('\n')) { if (!line.trim()) continue; try { rows.push(JSON.parse(line)); } catch { bad++; } }
const ms = (s: string) => Date.parse(s);
const by = (t: string) => rows.filter((r) => r.t === t);
const out: string[] = []; const p = (s = '') => out.push(s);
const q = (a: number[], k: number) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(k * s.length))]; };
const f1 = (x: number) => Number.isFinite(x) ? x.toFixed(1) : '—';

const t0 = Math.min(...rows.map((r) => ms(r.jst))), t1 = Math.max(...rows.map((r) => ms(r.jst)));
p(`# リハーサルの記録の分析`); p();
p(`- ファイル：${logPath}（${rows.length} 行、読めない行 ${bad}）`);
p(`- 期間（JST）：${new Date(t0 + 9 * 3600e3).toISOString().slice(0, 19)} 〜 ${new Date(t1 + 9 * 3600e3).toISOString().slice(0, 19)}（${((t1 - t0) / 3600e3).toFixed(2)} 時間）`);
const starts = by('event').filter((r) => r.kind === 'start'); p(`- 開始の記録：${starts.length} 件${starts.length > 1 ? '（途中で読み込み直し・clear あり）' : ''}`);
for (const s of starts.slice(0, 3)) p(`  - ${s.jst} ${String(s.text).slice(0, 160)}`);
p();

// frames
const sec = by('sec'); const n = sec.map((r) => r.n), med = sec.map((r) => r.med), p95 = sec.map((r) => r.p95), mx = sec.map((r) => r.max);
p(`## 描画（1 秒ごとの行 ${sec.length}）`); p();
p(`| | 中央 | 5% 点 | 1% 点 |`); p(`|---|---|---|---|`);
p(`| 1 秒のフレーム数 | ${f1(q(n, 0.5))} | ${f1(q(n, 0.05))} | ${f1(q(n, 0.01))} |`);
p(`| フレーム間隔の中央値 ms | ${f1(q(med, 0.5))} | （95% 点）${f1(q(med, 0.95))} | （99%）${f1(q(med, 0.99))} |`);
p(`| 1 秒内の 95% 点 ms | ${f1(q(p95, 0.5))} | （95% 点）${f1(q(p95, 0.95))} | （99%）${f1(q(p95, 0.99))} |`);
p(`| 1 秒内の最長 ms | ${f1(q(mx, 0.5))} | （95% 点）${f1(q(mx, 0.95))} | （99%）${f1(q(mx, 0.99))} |`);
p(); p(`- 1 秒のフレーム数が 30 未満の秒：${n.filter((x) => x < 30).length}（${f1(100 * n.filter((x) => x < 30).length / Math.max(1, n.length))} %）、20 未満：${n.filter((x) => x < 20).length}`);
const slow = by('slow'), slowVis = slow.filter((r) => !r.hidden);
p(`- 250 ms を超えた間隔：${slow.length} 回（タブが隠れていたもの ${slow.length - slowVis.length} を除くと ${slowVis.length} 回）`);
if (slowVis.length) {
  const parts: Record<string, number[]> = {}; for (const r of slowVis) for (const [k, v] of Object.entries(r.parts ?? {})) (parts[k] ??= []).push(v as number);
  p(`  - 長かった間隔：中央 ${f1(q(slowVis.map((r) => r.ms), 0.5))} ms、最長 ${f1(Math.max(...slowVis.map((r) => r.ms)))} ms`);
  p(`  - その間隔の直前のフレームの仕事（中央 / 最大 ms）：` + Object.entries(parts).map(([k, v]) => `${k} ${f1(q(v, 0.5))} / ${f1(Math.max(...v))}`).join('、'));
  const top = [...slowVis].sort((a, b) => b.ms - a.ms).slice(0, 5);
  for (const r of top) p(`  - ${r.jst} ${f1(r.ms)} ms（仕事 ${f1(r.work)} ms：${Object.entries(r.parts ?? {}).map(([k, v]) => `${k} ${v}`).join(' ')}）`);
  const hrs: Record<string, number> = {}; for (const r of slowVis) { const h = r.jst.slice(0, 13); hrs[h] = (hrs[h] ?? 0) + 1; }
  p(`  - 時間ごと：` + Object.entries(hrs).map(([h, c]) => `${h.slice(5).replace('T', ' ')}時 ${c}`).join('、'));
}
p();

// events
const ev = by('event'), errs = ev.filter((r) => r.kind === 'error'), hid = ev.filter((r) => r.kind === 'hidden');
p(`## 出来事`); p();
p(`- 日誌の行：${ev.filter((r) => !['start', 'error', 'hidden', 'shown'].includes(r.kind)).length}（字幕に出したもの shown=true ${ev.filter((r) => r.shown === true).length}、控えたもの ${ev.filter((r) => r.shown === false).length}）`);
p(`- エラー：${errs.length}`); for (const e of errs.slice(0, 10)) p(`  - ${e.jst} ${e.text}`);
p(`- タブが隠れた：${hid.length} 回`);
p(`- カード：${by('card').length}、字幕：${by('sub').length}、状態の行の変化：${by('status').length}`);
p();

// AI
const ai = by('ai'); p(`## AI の呼び出し（${ai.length} 回）`); p();
type Agg = { calls: number; ok: number; why: Record<string, number>; inT: number; outT: number; usd: number; msList: number[]; model: string };
const days: Record<string, Record<string, Agg>> = {}; let unpriced = new Set<string>();
for (const r of ai) {
  const day = r.jst.slice(0, 10), pool = r.pool ?? '(no pool)', who = pool.split(':')[0];
  const a = ((days[day] ??= {})[pool] ??= { calls: 0, ok: 0, why: {}, inT: 0, outT: 0, usd: 0, msList: [], model: r.model });
  a.calls++; if (r.ok) a.ok++; else a.why[r.why ?? '?'] = (a.why[r.why ?? '?'] ?? 0) + 1;
  a.inT += r.input ?? 0; a.outT += r.output ?? 0; a.msList.push(r.ms);
  const pr = PRICE[r.model]; if (!pr) unpriced.add(r.model); else a.usd += ((r.input ?? 0) * pr.in + (r.output ?? 0) * pr.out) / 1e6;
  void who;
}
p(`| 日（JST） | 呼び先 | モデル | 回数 | 成功 | 失敗の内訳 | 入力 tok | 出力 tok | 応答 中央 ms | 費用 USD | 円（¥${YEN}/$） |`);
p(`|---|---|---|---|---|---|---|---|---|---|---|`);
const perWhoDay: Record<string, Record<string, number>> = {};
for (const [day, pools] of Object.entries(days).sort()) for (const [pool, a] of Object.entries(pools).sort()) {
  p(`| ${day} | ${pool} | ${a.model} | ${a.calls} | ${a.ok} | ${Object.entries(a.why).map(([k, v]) => `${k} ${v}`).join(', ') || '—'} | ${a.inT} | ${a.outT} | ${f1(q(a.msList, 0.5))} | ${a.usd.toFixed(3)} | ${(a.usd * YEN).toFixed(0)} |`);
  const who = pool.split(':')[0]; ((perWhoDay[who] ??= {})[day] = (perWhoDay[who][day] ?? 0) + a.usd * YEN);
}
if (unpriced.size) p(`\n値段表にないモデル（費用に入っていない）：${[...unpriced].join(', ')}`);
p(); p(`### 住民 1 体あたり 1 日（目安 150〜200 円）`); p();
const hours = (t1 - t0) / 3600e3;
// daily caps per pool (src/robots/agent/config.ts MINDS at main 6a3b0fc): a straight-line projection can't go past them
const CAP: Record<string, number> = { 'dot:deep': 200, 'dot:light': 400, 'rakko:light': 100, 'kame:light': 100, 'lantern:light': 100 };
const capped: Record<string, number> = {};
for (const pools of Object.values(days)) for (const [pool, a] of Object.entries(pools)) {
  const perCall = a.usd * YEN / Math.max(1, a.calls), callsDay = Math.min(a.calls / hours * 24, CAP[pool] ?? Infinity);
  const who = pool.split(':')[0]; capped[who] = (capped[who] ?? 0) + perCall * callsDay / Object.keys(days).length;
}
for (const [who, d] of Object.entries(perWhoDay)) {
  const tot = Object.values(d).reduce((x, y) => x + y, 0);
  p(`- ${who}：記録の間に ${tot.toFixed(0)} 円（${hours.toFixed(1)} 時間）→ 24 時間に直すと ${(tot / hours * 24).toFixed(0)} 円／日、1 日の上限回数（dailyCap）で止まるとして ${capped[who].toFixed(0)} 円／日${capped[who] > 200 ? '（**目安の上限 200 円を超える**）' : ''}`);
}
const all = Object.values(perWhoDay).flatMap((d) => Object.values(d)).reduce((x, y) => x + y, 0);
const capAll = Object.values(capped).reduce((x, y) => x + y, 0);
p(`- 全体：${all.toFixed(0)} 円 → 30 日に直すと ${(all / hours * 24 * 30).toFixed(0)} 円／月、上限回数で止まるとして ${(capAll * 30).toFixed(0)} 円／月（全体の上限 15,000 円）`);
p(`- 注意：記録には cache の tokens がないので、キャッシュが効いた分も全額で数えている（上側の見積もり）。日をまたぐ上限（dailyCap）の効き方は日ごとの回数で見る。`);
p();

// sea
const sea = by('sea'); p(`## 海面（5 分ごと ${sea.length} 行）`); p();
if (sea.length) {
  const w = sea.map((r) => r.seaWorld).filter((x) => x != null), d = sea.map((r) => r.seaDrawn);
  p(`- 世界の海面（住民の海）：最小 ${f1(Math.min(...w))}、最大 ${f1(Math.max(...w))} m（潮の第1段では 0 のはず）`);
  p(`- 描いた海面：最小 ${f1(Math.min(...d))}、最大 ${f1(Math.max(...d))} m（オーナー決定：リハは 0）`);
  const off = sea.filter((r) => r.seaWorld == null).length; if (off) p(`- 世界の海面がない行：${off}（島が開く前など）`);
}
p();

// saves
if (savePaths.length) {
  p(`## 保存（saveOut）`); p();
  p(`| ファイル | 書き出した時刻 | キーの数 | 合計 KB | 大きいキー（KB） | aikey が入っていないか |`); p(`|---|---|---|---|---|---|`);
  for (const sp of savePaths) {
    const j = JSON.parse(readFileSync(sp, 'utf8')); const st = j.store ?? {};
    const sizes = Object.entries(st).map(([k, v]) => [k, Buffer.byteLength(k + String(v), 'utf8') / 1024] as [string, number]).sort((a, b) => b[1] - a[1]);
    const total = sizes.reduce((x, [, v]) => x + v, 0);
    p(`| ${sp.split('/').pop()} | ${j.at} | ${sizes.length} | ${total.toFixed(1)} | ${sizes.slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('、')} | ${'seaglass.aikey' in st ? '**入っている（要確認）**' : 'OK'} |`);
  }
}
console.log(out.join('\n'));
