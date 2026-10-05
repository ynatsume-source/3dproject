// The captions written out by captext.cjs (JSON lines), as one list to read through, with the plain faults marked:
//   出所: the heading names a way in that is not how it was asked (the guide on a tap, the guide while cruising)
//   状態なし: arrived and filming, and nothing said about what it is doing
//   解説なし: asked for, and no note about it at all
//   大きさ混在: its size run on in the line about what it is doing
//   初見: "初めて見つけた" said as what it is doing
//   途切れ: a note cut off mid-sentence
// Usage: node tools/lab/captext-md.cjs captext.jsonl [more.jsonl] > list.md
const fs = require('fs');
const rows = process.argv.slice(2).flatMap((f) => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((e) => e.what === 'caption');
const faults = (e) => {
  const f = [];
  const tap = e.how.startsWith('tap'), guide = e.how.startsWith('guide:'), cruise = e.how === 'cruise';
  if ((tap || cruise) && /図鑑/.test(e.k)) f.push('出所');
  if (guide && /タップ/.test(e.k)) f.push('出所');
  const head = /向かっています/.test(e.k);
  if (!head && !(e.s || '').trim()) f.push('状態なし');
  if (/から|初めて|めったに/.test(e.k) && !head && !e.n) f.push('解説なし');   // (arrived at what was asked for)
  if (/　(全長|甲長|翼幅|体長)/.test(e.s || '')) f.push('大きさ混在');
  if (/初めて見つけた/.test(e.s || '')) f.push('初見');
  if (e.n && !/[。！）」]$/.test(e.n)) f.push('途切れ');
  return f;
};
const by = new Map();
for (const e of rows) {
  const key = [e.k, e.t, (e.s || '').replace(/[0-9０-９]+/g, '#'), e.n].join('|');
  const x = by.get(key) ?? { ...e, seas: new Set(), hows: new Set(), f: faults(e) };
  x.seas.add(e.sea); x.hows.add(e.how.replace(/:.*$/, '')); by.set(key, x);
}
const all = [...by.values()].sort((a, b) => a.t.localeCompare(b.t, 'ja') || a.k.localeCompare(b.k, 'ja'));
const count = {}; for (const x of all) for (const f of x.f) count[f] = (count[f] ?? 0) + 1;
const esc = (s) => (s || '').replace(/\|/g, '｜');
console.log(`${all.length} 通り（${rows.length} 件から）。印：${Object.entries(count).map(([k, v]) => `${k} ${v}`).join('、') || 'なし'}\n`);
console.log('| 見出し | 名前 | 状態 | 大きさ | 解説 | 海 | 入口 | 印 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const x of all) console.log(`| ${esc(x.k)} | ${esc(x.t)} | ${esc(x.s)} | ${esc(x.m)} | ${esc(x.n)} | ${[...x.seas].join(' ')} | ${[...x.hows].join(' ')} | ${x.f.join('・')} |`);
