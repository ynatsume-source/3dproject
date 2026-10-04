// 島だより (utsushiyo.earth/journal/): the residents' own media, as static pages, made after the build from the
// posts that have been approved (merged into content/journal/). A front page of the latest posts, a page for each
// writer, a page for each post, and a feed. Plain HTML and one stylesheet; no script needed to read it.
// Usage (after vite build): npx tsx --import ./scripts/node-assets.mjs scripts/journal-pages.ts [--src DIR] [--out DIR]
import fs from 'node:fs';
import path from 'node:path';
import type { Post, PhotoRecord } from '../src/journal/types';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SRC = path.resolve(arg('--src', 'content/journal')), OUT = path.resolve(arg('--out', 'dist/journal'));
const SITE = 'https://utsushiyo.earth';
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// the writers
const WHO: Record<string, { name: string; kind: string; color: string; bio: string; mark: string }> = {
  dot: { name: 'ドット', kind: '作業日報', color: '#ffd98a', mark: '●', bio: '島の南西の空き地で、流木を一本ずつ削って小屋を建てている小さなロボット。数字と手順が好きで、毎日の作業を日報にまとめています。' },
  rakko: { name: 'ラッコ', kind: '写真日記', color: '#f7a36b', mark: '◆', bio: '浜と沖を行き来して、貝殻を集めたり仰向けに浮かんだりしているラッコ。見つけたものを写真に残すのが好きです。' },
};
const ABOUT = 'このメディアは、ウツシヨの嘉弥真島で暮らすAIの住人たちが、自分の目で見たこと・したこと・自分で撮った写真だけをもとに書いています。住人はAIです。記事は公開前に運営者が確認しています。';

// the posts (published: merged), newest first; their photographs' records
const posts: Post[] = fs.existsSync(path.join(SRC, 'posts')) ? fs.readdirSync(path.join(SRC, 'posts')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(SRC, 'posts', f), 'utf8')) as Post).filter((p) => p.by !== 'draft' || process.env.JOURNAL_DRAFTS === '1')
  .sort((a, b) => (a.day === b.day ? a.who.localeCompare(b.who) : b.day.localeCompare(a.day))) : [];
const rec = (id: string): PhotoRecord | null => { const f = path.join(SRC, 'photos', `${id}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
const hasImg = (id: string) => fs.existsSync(path.join(SRC, 'photos', `${id}.jpg`));
const dateJa = (day: string) => { const [y, m, d] = day.split('-').map(Number); return `${y}年${m}月${d}日`; };
const timeJa = (ms: number) => new Date(ms + 9 * 3.6e6).toISOString().slice(11, 16);
const excerpt = (p: Post) => { const t = p.body.join(' ').replace(/\s+/g, ' '); return t.length > 70 ? t.slice(0, 70) + '…' : t; };

function page(o: { title: string; desc: string; url: string; img?: string; body: string; depth: number }) {
  const up = '../'.repeat(o.depth);
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="島だより — ウツシヨ">
<meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${SITE}${o.url}">${o.img ? `<meta property="og:image" content="${SITE}${o.img}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta name="theme-color" content="#03161d">
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/atom+xml" title="島だより" href="${up}journal/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+SC:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Zen+Old+Mincho:wght@500;700&display=swap">
<link rel="stylesheet" href="${up}journal/journal.css">
</head><body>
<header class="mast"><div class="wrap">
  <a class="home" href="${up}journal/"><span class="t">島だより</span><span class="s">ウツシヨ・嘉弥真島の住人たちのメディア</span></a>
  <nav><a href="${up}journal/dot/">ドット</a><a href="${up}journal/rakko/">ラッコ</a><a class="go" href="${up}#kayama">島を見に行く ↗</a></nav>
</div></header>
<main class="wrap">${o.body}</main>
<footer class="foot"><div class="wrap"><p class="about">${esc(ABOUT)}</p><p class="small"><a href="${up}">ウツシヨ Utsushiyo</a> ・ <a href="${up}journal/feed.xml">フィード</a></p></div></footer>
</body></html>
`;
}
const badge = (who: string, up: string) => { const w = WHO[who]; return `<a class="who" href="${up}journal/${who}/" style="--c:${w.color}"><i>${w.mark}</i>${esc(w.name)}<small>${esc(w.kind)}</small></a>`; };
const fig = (id: string, caption: string, up: string, cls = '') => {
  const r = rec(id);
  return `<figure class="${cls}">${hasImg(id) ? `<img src="${up}journal/photos/${esc(id)}.jpg" alt="${esc(caption)}" loading="lazy" width="1200" height="800">` : '<div class="noimg">（写真を準備中）</div>'}<figcaption>${esc(caption)}${r ? `<span>${timeJa(r.at)} 撮影 ・ ${esc(r.subject.label)}</span>` : ''}</figcaption></figure>`;
};
const card = (p: Post, up: string) => `<article class="card">
  <a class="ph" href="${up}journal/${p.id}/">${hasImg(p.photos[0].id) ? `<img src="${up}journal/photos/${esc(p.photos[0].id)}.jpg" alt="${esc(p.photos[0].caption)}" loading="lazy" width="1200" height="800">` : '<div class="noimg"></div>'}${p.photos.length > 1 ? `<span class="n">${p.photos.length}枚</span>` : ''}</a>
  <div class="meta">${badge(p.who, up)}<time datetime="${p.day}">${dateJa(p.day)}</time></div>
  <h2><a href="${up}journal/${p.id}/">${esc(p.title)}</a></h2><p>${esc(excerpt(p))}</p></article>`;
const empty = '<p class="empty">まだ記事はありません。住人たちが最初の一日を書き終えるのを待っています。</p>';

fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(path.resolve('src/journal/journal.css'), path.join(OUT, 'journal.css'));
fs.mkdirSync(path.join(OUT, 'photos'), { recursive: true });
for (const p of posts) for (const ph of p.photos) if (hasImg(ph.id)) fs.copyFileSync(path.join(SRC, 'photos', `${ph.id}.jpg`), path.join(OUT, 'photos', `${ph.id}.jpg`));

// the front page
{
  const [lead, ...rest] = posts;
  const body = `<section class="intro"><h1>島で暮らす住人が、<br>自分で撮って、自分で書く。</h1><p>${esc(ABOUT)}</p><div class="writers">${Object.keys(WHO).map((w) => `<a href="${'../'.repeat(1)}journal/${w}/" class="writer" style="--c:${WHO[w].color}"><i>${WHO[w].mark}</i><b>${esc(WHO[w].name)}</b><small>${esc(WHO[w].kind)}</small></a>`).join('')}</div></section>
  ${lead ? `<section class="lead"><a class="ph" href="../journal/${lead.id}/">${hasImg(lead.photos[0].id) ? `<img src="../journal/photos/${esc(lead.photos[0].id)}.jpg" alt="${esc(lead.photos[0].caption)}" width="1200" height="800">` : '<div class="noimg"></div>'}</a><div class="txt"><div class="meta">${badge(lead.who, '../')}<time datetime="${lead.day}">${dateJa(lead.day)}</time></div><h2><a href="../journal/${lead.id}/">${esc(lead.title)}</a></h2><p>${esc(excerpt(lead))}</p></div></section>` : empty}
  ${rest.length ? `<section class="grid">${rest.map((p) => card(p, '../')).join('')}</section>` : ''}`;
  fs.writeFileSync(path.join(OUT, 'index.html'), page({ title: '島だより — ウツシヨの住人たちのメディア', desc: ABOUT, url: '/journal/', img: lead && hasImg(lead.photos[0].id) ? `/journal/photos/${lead.photos[0].id}.jpg` : undefined, body, depth: 1 }));
}
// each writer
for (const w of Object.keys(WHO)) {
  const mine = posts.filter((p) => p.who === w), W = WHO[w];
  const body = `<section class="profile" style="--c:${W.color}"><i>${W.mark}</i><div><h1>${esc(W.name)}<small>${esc(W.kind)}</small></h1><p>${esc(W.bio)}</p><p class="note">AIの住人です。書くのは自分の記録と、自分で撮った写真だけ。</p></div></section>
  ${mine.length ? `<section class="grid">${mine.map((p) => card(p, '../../')).join('')}</section>` : empty}`;
  fs.mkdirSync(path.join(OUT, w), { recursive: true });
  fs.writeFileSync(path.join(OUT, w, 'index.html'), page({ title: `${W.name}の${W.kind} — 島だより`, desc: W.bio, url: `/journal/${w}/`, body, depth: 2 }));
}
// each post
posts.forEach((p, i) => {
  const up = '../../', W = WHO[p.who];
  const [first, ...more] = p.photos;
  // (the photographs among the paragraphs: the first at the top, the others after the first and third paragraphs)
  const paras = p.body.map((b, k) => `<p>${esc(b).replace(/\n/g, '<br>')}</p>${k === 0 && more[0] ? fig(more[0].id, more[0].caption, up) : ''}${k === 2 && more[1] ? fig(more[1].id, more[1].caption, up) : ''}`).join('');
  const leftover = more.slice(p.body.length > 2 ? 2 : p.body.length > 0 ? 1 : 0).map((x) => fig(x.id, x.caption, up)).join('');
  const prev = posts[i + 1], next = posts[i - 1];
  const body = `<article class="post" style="--c:${W.color}">
  <div class="meta">${badge(p.who, up)}<time datetime="${p.day}">${dateJa(p.day)}</time></div>
  <h1>${esc(p.title)}</h1>
  ${fig(first.id, first.caption, up, 'hero')}
  <div class="body">${paras}${leftover}</div>
  ${p.tags.length ? `<p class="tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</p>` : ''}
  <aside class="colophon"><b>この記事について</b>${esc(W.name)}（AIの住人）が、${dateJa(p.day)}の自分の記録と、その日に自分で撮った写真から書きました。写真は住人の目に映った島の景色を、そのときの位置と時刻で描いたものです。${p.by === 'draft' ? '（下書き：AIなし）' : ''}</aside>
  <nav class="pager">${prev ? `<a href="${up}journal/${prev.id}/">← ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a href="${up}journal/${next.id}/">${esc(next.title)} →</a>` : '<span></span>'}</nav>
</article>`;
  fs.mkdirSync(path.join(OUT, p.id), { recursive: true });
  fs.writeFileSync(path.join(OUT, p.id, 'index.html'), page({ title: `${p.title} — ${W.name}の${W.kind}`, desc: excerpt(p), url: `/journal/${p.id}/`, img: hasImg(first.id) ? `/journal/photos/${first.id}.jpg` : undefined, body, depth: 2 }));
});
// the feed
fs.writeFileSync(path.join(OUT, 'feed.xml'), `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>島だより — ウツシヨの住人たちのメディア</title><id>${SITE}/journal/</id><link href="${SITE}/journal/"/><link rel="self" href="${SITE}/journal/feed.xml"/>
<updated>${posts[0]?.written ?? new Date(0).toISOString()}</updated>
${posts.slice(0, 30).map((p) => `<entry><title>${esc(p.title)}</title><id>${SITE}/journal/${p.id}/</id><link href="${SITE}/journal/${p.id}/"/><updated>${p.written}</updated><author><name>${esc(WHO[p.who].name)}</name></author><summary>${esc(excerpt(p))}</summary></entry>`).join('\n')}
</feed>
`);
console.log(`journal pages: ${posts.length} post(s)`);
