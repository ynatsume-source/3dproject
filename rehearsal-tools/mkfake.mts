// A synthetic log to test analyze.mts (not real data).
import { writeFileSync } from 'node:fs';
const L: string[] = []; const t0 = Date.parse('2026-10-31T08:00:00+09:00');
const j = (ms: number, m = false) => new Date(ms + 9 * 3600e3).toISOString().slice(0, m ? 23 : 19) + '+09:00';
const row = (t: string, at: number, o: object) => L.push(JSON.stringify({ t, jst: j(at), isl: j(at), world: j(at), ...o }));
row('event', t0, { kind: 'start', text: '/?rehearsal 1920x1080@1 Chrome' });
let s = 1; for (let k = 0; k < 7200; k++) { const at = t0 + k * 1000; s = (s * 16807) % 2147483647; const r = s / 2147483647;
  row('sec', at, { n: r < 0.01 ? 14 : 58 + Math.round(r * 4), med: 16.7, p95: r < 0.02 ? 80 : 20, max: r < 0.01 ? 400 : 25, workMax: 9 });
  if (r < 0.004) row('slow', at, { ms: 300 + r * 1e5, work: 280, parts: { 住人: 250, 描画: 12, 画面読み: 3, その他: 15 } });
  if (k % 300 === 0) row('sea', at, { seaWorld: 0, seaDrawn: 0 });
  if (k % 90 === 0) row('ai', at, { ms: 2000 + r * 3000, ok: r > 0.05, why: r > 0.05 ? undefined : 'busy', model: 'claude-sonnet-5-5', pool: 'dot:deep', input: 3000, output: 400 });
  if (k % 240 === 0) row('ai', at, { ms: 900, ok: true, model: 'claude-haiku-4-5-20251001', pool: 'rakko:light', input: 1500, output: 200 });
  if (k % 600 === 0) row('event', at, { kind: 'diary', text: 'ドットが歩いた', shown: k % 1200 === 0 });
}
row('event', t0 + 3600e3, { kind: 'error', text: 'TypeError: x is undefined' });
writeFileSync('fake.ndjson', L.join('\n') + '\n');
writeFileSync('fake-save.json', JSON.stringify({ at: j(t0), store: { 'seaglass.residents': 'x'.repeat(300000), 'seaglass.ledger': 'y'.repeat(500000), 'seaglass.aipool': '{}' } }));
