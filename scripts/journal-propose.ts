// The day's posts, put forward for approval: copies DATA/drafts/<day>-*.json and the photographs they use (record and
// image) into content/journal/, and writes the pull request's description (what was written, what it cost, what they
// set out to do that day) to DATA/pr-<day>.md. Drafts written without a model (by: "draft") are never put forward.
// Usage: npx tsx scripts/journal-propose.ts --data DIR --day YYYY-MM-DD
import fs from 'node:fs';
import path from 'node:path';

const arg = (k: string, d = '') => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(arg('--data', 'journal-data')), DAY = arg('--day');
const OUT = path.resolve('content/journal');
fs.mkdirSync(path.join(OUT, 'posts'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'photos'), { recursive: true });
const drafts = fs.readdirSync(path.join(DATA, 'drafts')).filter((f) => f.startsWith(DAY) && f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(DATA, 'drafts', f), 'utf8')));
const lines: string[] = [];
let n = 0;
for (const p of drafts) {
  if (p.by === 'draft') { lines.push(`- ${p.name}：AIなしの下書きのため出していません`); continue; }
  const missing = p.photos.filter((x: any) => !fs.existsSync(path.join(DATA, 'photos', `${x.id}.jpg`)));
  if (missing.length) { lines.push(`- ${p.name}：写真が描けなかったため出していません（${missing.map((x: any) => x.id).join(', ')}）`); continue; }
  fs.writeFileSync(path.join(OUT, 'posts', `${p.id}.json`), JSON.stringify(p, null, 1));
  for (const x of p.photos) for (const ext of ['json', 'jpg']) fs.copyFileSync(path.join(DATA, 'photos', `${x.id}.${ext}`), path.join(OUT, 'photos', `${x.id}.${ext}`));
  lines.push(`### ${p.name}「${p.title}」\n\n${p.body.map((b: string) => `> ${b.replace(/\n/g, '\n> ')}`).join('\n>\n')}\n\n写真：${p.photos.map((x: any) => `${x.caption}（${x.id}）`).join('、')}\nタグ：${p.tags.join('、') || 'なし'}　書いたモデル：${p.by}`);
  n++;
}
const run = fs.existsSync(path.join(DATA, 'runs', `${DAY}.json`)) ? JSON.parse(fs.readFileSync(path.join(DATA, 'runs', `${DAY}.json`), 'utf8')) : null;
const body = `嘉弥真島の${DAY}の一日から、ドットとラッコが書いた記事です。マージすると utsushiyo.earth/journal/ に公開されます。直したいところがあればこのブランチで直してからマージ、出したくなければクローズしてください。

${lines.join('\n\n')}

---
${run ? `この日の島：AIの呼び出し ${run.calls} 回（ドット ${run.byWho.dot}・ラッコ ${run.byWho.rakko}）、推定 $${run.usd}、実行 ${run.minutes} 分。
撮った写真：ドット ${run.photos.dot.join('、') || 'なし'}／ラッコ ${run.photos.rakko.join('、') || 'なし'}
自分で決めたこと（抜粋）：
${Object.entries(run.goals).map(([w, g]: any) => `- ${w}：${g.slice(-4).join(' ／ ') || 'なし'}`).join('\n')}` : ''}`;
fs.writeFileSync(path.join(DATA, `pr-${DAY}.md`), body);
console.log(`${n} post(s) put forward`);
fs.writeFileSync(path.join(DATA, `pr-${DAY}.count`), String(n));
