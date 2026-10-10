// Headless check (島だより): the residents' photographs, the posts and the pages.
//  1 a photograph is of something in its own view, kept with its eyes, where it looked and the others; at most three a
//    day — a fourth is not offered (and none at all is fine)
//  2 a post: written only from what was given, with one to three of that day's own photographs — or, on a day without,
//    a picture it drew (an SVG of shapes only); one naming a photo it did not take, with a link in it, or a drawing
//    that loads or runs anything, is asked for again, and given up if it will not do
//  3 the pages: the front page, each writer's, each post's and the feed; a drawing shown whole; drafts left out; AI noted
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/journal-check.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { writePost, checkPost, type PostInput } from '../src/journal/write';
import type { BrainInput, Thought } from '../src/robots/agent/types';

let now = Date.parse('2026-10-03T01:00:00Z');   // (10:00 at the island)
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
function island(at: string) {
  store.clear(); now = Date.parse(at); Math.random = mulberry32(77);
  const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  const dot = R.list.find((r: any) => r.id === 'dot');
  R.list.forEach((o: any, i: number) => { if (o !== dot) { o.pos.set(2000 + i * 200, 2, 2000); o.task = { kind: 'wander', x: o.pos.x, z: o.pos.z, act: 'idle', dur: 1e9, t: 0, arrived: true }; } });
  R.items.list.length = 0;
  dot.pos.set(61, 2, -145); dot.head = 0; dot.battery = 1; dot.task = null;
  return { R, dot, mind: R.mind(dot) };
}
async function run(R: any, secs: number, until?: () => boolean) {
  for (let i = 0; i < secs * 4; i++) { now += 250; R.update(0.25, now, new THREE.Vector3(0, 50, 0)); await Promise.resolve(); await Promise.resolve(); if (until?.()) return true; }
  return false;
}

{ // 1 photographs
  const { R, dot } = island('2026-10-03T01:00:00Z');
  for (let k = 0; k < 6; k++) R.items.addAt('shell', 58 + k * 1.5, -136 - k);
  let offeredAfter3 = true;
  R.setBrain(async (i: BrainInput) => {
    const ph = i.options.filter((o) => o.action === 'photo');
    if ((dot.photos ?? []).length >= 3) offeredAfter3 = ph.length > 0;
    return ph.length ? ({ goal: { text: '記録に残す', why: 'テスト' }, plan: [ph[0].id] } as Thought) : ({ goal: { text: '休む', why: 'テスト' }, plan: ['look:shore'] } as Thought);
  });
  for (let k = 0; k < 8 && (dot.photos ?? []).length < 3; k++) { (R.mind(dot) as any).why = '写真を撮る'; (R.mind(dot) as any).lastCall = -1e12; await run(R, 60, () => (dot.photos ?? []).length > k); }
  (R.mind(dot) as any).why = 'もう一枚？'; (R.mind(dot) as any).lastCall = -1e12; await run(R, 30);
  const p = dot.photos?.[0];
  want('1 three photographs, of things in its own view', (dot.photos ?? []).length === 3 && !!p && p.eye.length === 3 && p.look.length === 3 && p.others.length === 3 && !!p.subject.label, (dot.photos ?? []).map((x: any) => x.subject.label).join('、'));
  want('1 a fourth is not offered', !offeredAfter3);
  want('1 its diary says so', dot.diary.filter((e: any) => e.key === 'photo').length === 3);
}
{ // 2 posts
  const inp: PostInput = { who: 'rakko', name: 'ラッコ', profile: 'ラッコ', day: '2026-10-03', entries: [{ time: '10:00', text: '目的：貝殻を集める（浜に3つ並べる）', key: 'mind' }, { time: '10:00', text: '貝殻を拾った', key: 'got' }, { time: '10:01', text: '浜を見た', key: 'got' }, { time: '10:02', text: '浜を見た', key: 'got' }, { time: '10:03', text: '浜を見た', key: 'got' }, { time: '10:04', text: 'うまくいかなかった：道がなかった', key: 'mind' }, { time: '10:05', text: '写真を撮った：貝殻', key: 'photo' }], photos: [{ id: 'rakko-2026-10-03-1', subject: { id: 'shell#1', kind: 'shell', label: '貝殻' }, time: '10:05' }], talks: [] };
  const good = { title: 'きれいな貝殻', sns: '貝殻を1つ拾って浜に並べた。明日は北の浜を探す。', review: { summary: ['貝殻をひろって写真をとった日。'], state: ['貝殻 1つ'], unknown: [], outlook: ['あしたはドットに見せる。'] }, photos: [{ id: 'rakko-2026-10-03-1', caption: 'ぴかぴか' }], tags: ['貝殻'] };
  let asks = 0;
  const p1 = await writePost(inp, async () => { asks++; return asks === 1 ? JSON.stringify({ ...good, photos: [{ id: 'rakko-2026-10-02-9', caption: 'x' }] }) : JSON.stringify(good); }, 'stub');
  want('2 a photo it did not take is asked again, then the post stands', !!p1 && asks === 2 && p1.photos[0].id === 'rakko-2026-10-03-1', `${asks} asks`);
  const p2 = await writePost(inp, async () => JSON.stringify({ ...good, review: { ...good.review, outlook: ['見に来てね https://example.com'] } }), 'stub');
  want('2 a link: given up', p2 === null);
  // (a day without photographs: a picture it drew instead — shapes only; one that loads or runs something is asked again)
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#9fd3e0"/><circle cx="400" cy="300" r="80" fill="#f2e3c6"/></svg>';
  const drew = { title: '貝殻の絵', sns: good.sns, review: good.review, photos: [], drawing: { svg, caption: '浜でひろった貝殻' }, tags: [] };
  let asks2 = 0;
  const p3 = await writePost({ ...inp, photos: [] }, async () => { asks2++; return JSON.stringify(asks2 === 1 ? { ...drew, drawing: { svg: svg.replace('</svg>', '<script>alert(1)</script></svg>'), caption: 'x' } } : drew); }, 'stub');
  want('2 no photograph that day: a drawing instead; one with a script is asked again', !!p3 && asks2 === 2 && !!p3.drawing && p3.photos.length === 0 && !/script/.test(p3.drawing.svg), `${asks2} asks`);
  want('2 no photograph and no drawing: asked again, then given up', (await writePost({ ...inp, photos: [] }, async () => JSON.stringify(good), 'stub')) === null);
  want('2 a drawing may not reach outside', /外|画像/.test(checkPost({ ...drew, drawing: { svg: svg.replace('<rect', '<image href="https://x.example/a.png"/><rect'), caption: 'x' } }, { ...inp, photos: [] })));
  want('2 a feeling the island does not have is asked again', /世界にない/.test(checkPost({ ...good, review: { ...good.review, summary: ['ひとりで少し寂しい。'] } }, inp)));
  want('2 it does not write the log: one that tries is asked again', /log/.test(checkPost({ ...good, log: [] }, inp)));
  { // (the log is the records as kept: what happened, and its mind's lines beside it; repeats as one; the photo where it was taken)
    const L = p1?.log ?? [];
    want('2 the log is its records, not written afterwards', L.length === 3 && L[0].world === '貝殻を拾った' && L[0].me === '目的：貝殻を集める（浜に3つ並べる）' && L[1].world === '浜を見た（3回、10:03まで）' && !L.some((r) => /うまくいかなかった/.test(r.world + r.me)) && L[2].photo === 'rakko-2026-10-03-1', JSON.stringify(L));
  }
  want('2 the checks name what is wrong', /写真/.test(checkPost({ ...good, photos: [] }, inp)) && checkPost(good, inp) === '');
}
{ // 3 pages
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'jsrc-')), out = fs.mkdtempSync(path.join(os.tmpdir(), 'jout-'));
  fs.mkdirSync(path.join(src, 'posts')); fs.mkdirSync(path.join(src, 'photos'));
  const post = { id: '2026-10-03-rakko', who: 'rakko', name: 'ラッコ', day: '2026-10-03', title: 'きれいな貝殻', body: [], log: [{ t: '10:00', world: '浜で貝殻をひろった。', me: 'きれいなのは浜にならべる。' }, { t: '10:05', world: '貝殻の写真をとった。', me: 'ぴかぴかだった。', photo: 'rakko-2026-10-03-1' }, { t: '11:00', world: 'ドットに会えなかった。', me: 'あとでまた行く。' }], review: { summary: ['貝殻をひろって写真をとった日。'], state: ['貝殻 1つ'], unknown: [], outlook: ['あしたはドットに見せる。'] }, photos: [{ id: 'rakko-2026-10-03-1', caption: 'ぴかぴか' }], tags: ['貝殻'], written: '2026-10-03T12:00:00Z', by: 'claude-haiku-4-5-20251001' };
  fs.writeFileSync(path.join(src, 'posts', `${post.id}.json`), JSON.stringify(post));
  fs.writeFileSync(path.join(src, 'posts', '2026-10-03-dot.json'), JSON.stringify({ ...post, id: '2026-10-03-dot', who: 'dot', name: 'ドット', title: '下書き', by: 'draft' }));
  fs.writeFileSync(path.join(src, 'posts', '2026-10-02-rakko.json'), JSON.stringify({ ...post, id: '2026-10-02-rakko', day: '2026-10-02', title: '絵をかいた日', photos: [], drawing: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#9fd3e0"/></svg>', caption: '海の絵' } }));
  fs.writeFileSync(path.join(src, 'photos', 'rakko-2026-10-03-1.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.writeFileSync(path.join(src, 'photos', 'rakko-2026-10-03-1.json'), JSON.stringify({ id: 'rakko-2026-10-03-1', at: Date.parse('2026-10-03T01:05:00Z'), subject: { label: '貝殻' } }));
  await promisify(execFile)(process.execPath, ['--import', 'tsx', '--import', './scripts/node-assets.mjs', 'scripts/journal-pages.ts', '--src', src, '--out', out]);
  const has = (f: string, s?: string) => fs.existsSync(path.join(out, f)) && (!s || fs.readFileSync(path.join(out, f), 'utf8').includes(s));
  want('3 the front page, with the post and the note that they are AI', has('index.html', 'きれいな貝殻') && has('index.html', '住人はAI'));
  want('3 the post page, its photograph and its time', has('2026-10-03-rakko/index.html', 'photos/rakko-2026-10-03-1.jpg') && has('2026-10-03-rakko/index.html', '10:05 撮影') && has('photos/rakko-2026-10-03-1.jpg'));
  want('3 the writers and the feed', has('rakko/index.html', 'きれいな貝殻') && has('dot/index.html') && has('feed.xml', '2026-10-03-rakko') && has('journal.css'));
  want('3 a day without photographs: its drawing at the top, and as its picture in the list', has('2026-10-02-rakko/index.html', 'drawings/2026-10-02-rakko.svg') && has('2026-10-02-rakko/index.html', 'ラッコが描いた絵') && has('drawings/2026-10-02-rakko.svg', '<svg') && has('rakko/index.html', 'drawings/2026-10-02-rakko.svg'));
  want('3 a post written as a log: the island and it by the hour, then the day as a whole', has('2026-10-03-rakko/index.html', 'class="xlog"') && has('2026-10-03-rakko/index.html', 'ふりかえり') && has('2026-10-03-rakko/index.html', '事象') && has('2026-10-03-rakko/index.html', 'これから'));
  want('3 a draft is not published', !has('2026-10-03-dot/index.html') && !has('index.html', '下書き'));
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
