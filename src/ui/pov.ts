// Through a resident's own eyes: the camera sits where its eyes are, and over the view each of them has
// its own kind of AR — Dot a work display of plans, measurements and progress; Kamemaru an observer's
// notebook that names what swims by; Lantern a night-sight that marks what is not yet on its map;
// Rakko something bright and playful. What it has its eye on is marked, what it means to do next is
// spelled out, and what it says to the others (in its own language, with what it means).
import * as THREE from 'three';
import type { Sense, Mark } from '../robots/residents';

interface Look { title: string; sub: string; bullets: (s: Sense, r: any) => string[]; label: (m: Mark, d: number) => string; stat: (s: Sense, r: any) => string }
const pct = (k: number) => `${Math.round(k * 100)}%`;
const bar = (k: number, n = 8) => '▮'.repeat(Math.round(k * n)) + '▯'.repeat(n - Math.round(k * n));

// what each of them means to do, step by step, for what it is doing now
const PLAN: Record<string, Record<string, string[]>> = {
  dot: {
    gather: ['① 流木を拾う', '② 作業台で削る', '③ 部材 #{n} を取りつける'], craft: ['① 部材 #{n} を削る', '② 小屋へ運ぶ', '③ 取りつけ → 次の流木'],
    place: ['① 部材 #{n} を取りつける', '② 固定を確かめる', '③ 次の流木を探す'], chop: ['① 若木を切る', '② 丸太を回収', '③ 畑の区画を空ける'],
    till: ['① 区画を耕す', '② 種をまく', '③ 収穫まで 1.5日'], plant: ['① 種をまく', '② 育ちを見る', '③ 収穫'], harvest: ['① 収穫', '② 食料を蓄える', '③ また種をまく'],
    look: ['① 浜を見る', '② 流木の漂着を待つ'], chart: ['① 水平線を見渡す', '② 見える島を地図に記す', '③ 島に名前を付ける'], lash: ['① 部材を筏に組む', '② 筏の完成', '③ 見えている島へ渡る'], voyage: ['① 筏を出す', '② 島へ渡る', '③ 地図を広げて戻る'], deck: ['① 桟橋の板 #{d} を張る', '② 次の流木', '③ 桟橋の完成'], find: ['① 漂着物を回収', '② 調べる', '③ 棚に置く'], shelve: ['① 棚に置く', '② 焚き火の会で報告'], fire: ['① 焚き火の会', '② 今日の報告', '③ 情報の共有'], idle: ['① 休む', '② 次の計画'],
  },
  kame: { graze: ['藻場で海草を食べる', '息つぎに浮かぶ', '底へ戻る'], bask: ['浜で甲羅を干す', '休む'], sleep: ['海の中で眠る', 'ときどき息つぎ'], survey: ['潮の流れを見る', '底の砂を確かめる', '桟橋の位置を決める'], inspect: ['工事を見る', '潮の時刻を伝える'], find: ['拾う', '棚に置く', '焚き火の会で報告'], watch: ['浜から海を記録する'], swim: ['ラグーンの魚を数える', '根のまわりを一周'], fire: ['焚き火の会', '報告'], idle: ['休む'] },
  lantern: { base: ['石を浜から運ぶ', '土台をひとつ据える'], find: ['拾う', '棚に置く', '焚き火の会で報告'], explore: ['未踏の場所へ', '地図に書き足す'], think: ['星を観測する', '手帖に記録する'], fetch: ['石をひとつ拾う', '石積みへ運ぶ'], stack: ['石を積む', '目印をひとつ残す'], rest: ['夜を待つ'], fire: ['焚き火の会', '報告'] },
  rakko: { forage: ['潜る', '岩の下を探る', '獲って浮かぶ'], eat: ['お腹の上で食べる', '次を獲りに潜る'], groom: ['毛づくろい'], sleep: ['仰向けで眠る'], gather: ['柱にする木を拾う', '泳いで運ぶ'], post: ['泳いで運ぶ', '柱を立てる', '次の木を探す'], find: ['拾う', '棚に置く', '焚き火の会で報告'], collect: ['貝殻を探す', '浜に並べる'], pile: ['貝殻を並べる', '次を探す'], float: ['浮いて休む'], crack: ['石で貝を割る', '食べる'], nap: ['浮いたまま眠る'], fire: ['焚き火の会', '報告'] },
};
const LOOK: Record<string, Look> = {
  dot: {
    title: 'DOT ▸ 視界', sub: '地図の作成',
    bullets: (s, r) => (s.built >= s.hutN && (s.task === 'gather' || s.task === 'craft') ? ['① 流木 回収', '② 板ニ 削ル', '③ 桟橋ニ 張ル'] : (PLAN.dot[s.task] ?? PLAN.dot.idle)).map((l) => l.replace('{n}', String(s.built + 1)).replace('{d}', '')),
    label: (m, d) => (m.kind === 'friend' ? `${m.label} ／ ${m.sub}` : `${m.label}${m.sub ? ' ／ ' + m.sub : ''} ▸ ${d.toFixed(1)}m`),
    stat: (s, r) => `電池 ${bar(r.battery)} ${pct(r.battery)}　小屋 ${s.built}/${s.hutN}　食料 ${s.food}`,
  },
  kame: {
    title: 'カメマルの視界', sub: 'アオウミガメ',
    bullets: (s) => PLAN.kame[s.task] ?? PLAN.kame.idle,
    label: (m, d) => (m.kind === 'friend' ? `${m.label}（${m.sub}）` : m.kind === 'fish' ? `${m.label}${m.sub ? ' · ' + m.sub : ''}` : `${m.label}　${Math.round(d)}m`),
    stat: (s, r) => `記録 ${r.stats.notes}件　おなか ${bar(1 - r.hunger, 6)}　ねむけ ${bar(r.sleepy, 6)}`,
  },
  lantern: {
    title: 'LANTERN ／ 視界', sub: '火と灯りの研究',
    bullets: (s) => PLAN.lantern[s.task] ?? ['待機'],
    label: (m, d) => (m.kind === 'friend' ? `◇ ${m.label}` : `◇ ${m.label}${m.sub ? '  ' + m.sub : ''}`),
    stat: (s, r) => `灯り ${pct(r.battery)}　目印 ${r.stats.cairns}`,
  },
  rakko: {
    title: 'ラッコの視界', sub: 'ラッコ',
    bullets: (s) => PLAN.rakko[s.task] ?? ['待機'],
    label: (m, d) => (m.kind === 'shell' ? `${m.label}` : m.kind === 'friend' ? `${m.label}（${m.sub}）` : `${m.label}`),
    stat: (s, r) => `貝殻 ${r.stats.shells}個　おなか ${bar(1 - r.hunger, 6)}　ねむけ ${bar(r.sleepy, 6)}`,
  },
};

export function makePov(root: HTMLElement) {
  root.innerHTML = `<div class="frame"></div><div class="marks"></div>
    <header><b class="t"></b><span class="s"></span><span class="st"></span></header>
    <aside class="plan"><div class="k">いまの目的</div><div class="now"></div><ol></ol></aside>
    <div class="mutter"><i></i><span></span></div>`;
  const marksEl = root.querySelector('.marks') as HTMLElement, pool: HTMLElement[] = [];
  const $ = (q: string) => root.querySelector(q) as HTMLElement;
  let who = '', mutT = 0, planT = 0, lastSay = '', offT = 0, boxT = 0;
  const keep: number[][] = [];   // (the panels' boxes on screen: no mark's label over them)
  const _p = new THREE.Vector3();
  return {
    get on() { return !!who; },
    show(r: any) { who = r.id; root.className = 'pov-' + r.id; root.hidden = false; mutT = 1.5; planT = 0; $('.mutter').classList.remove('on'); },
    hide() { who = ''; root.hidden = true; },
    update(r: any, s: Sense, status: string, camera: THREE.Camera, w: number, h: number, dt: number, extra: Mark[], gibber: (id: string, t: string) => string) {
      if (!who) return;
      const L = LOOK[r.id];
      // the marks: what is in view, projected onto the screen. On a small screen only as many as are readable:
      // what it is after first, then the nearest; a label that would run off the right edge goes on the left of
      // its mark; one that would lie over another, or over the title, the plan or its words, is left out.
      const all = [...s.marks, ...extra], small = w < 760, fs = small ? 10 : 11;
      const cand: { m: Mark; x: number; y: number; d: number }[] = [];
      for (const m of all) {
        _p.set(m.x, m.y, m.z);
        const d = _p.distanceTo(camera.position);
        _p.project(camera);
        if (_p.z > 1 || Math.abs(_p.x) > 1.05 || Math.abs(_p.y) > 1.05 || d < 0.6) continue;
        cand.push({ m, x: (_p.x * 0.5 + 0.5) * w, y: (-_p.y * 0.5 + 0.5) * h, d });
      }
      cand.sort((a, b) => (b.m.hot ? 1 : 0) - (a.m.hot ? 1 : 0) || a.d - b.d);
      if ((boxT -= dt) < 0) {   // (where the panels are, now and then)
        boxT = 0.5; keep.length = 0;
        for (const q of ['header', '.plan', '.mutter.on']) { const e = root.querySelector(q) as HTMLElement | null; if (e && !e.hidden) { const b = e.getBoundingClientRect(); if (b.width) keep.push([b.left, b.top, b.right, b.bottom]); } }
      }
      const placed: number[][] = [...keep];
      let n = 0;
      for (const c of cand) {
        const m = c.m, txt = L.label(m, c.d) + (m.hot ? (r.id === 'dot' ? '　◀ TARGET' : r.id === 'rakko' ? '　← これ！' : '　← めあて') : '');
        const tw = [...txt].length * fs + 22, left = c.x + tw > w - 6;
        const box = left ? [c.x - tw, c.y - 16, c.x + 8, c.y + 8] : [c.x - 8, c.y - 16, c.x + tw, c.y + 8];
        if (!m.hot && placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
        placed.push(box);
        const el = pool[n] ?? (pool[n] = marksEl.appendChild(document.createElement('div')));
        el.className = `mk ${m.kind}${m.hot ? ' hot' : ''}${left ? ' l' : ''}`;
        el.style.setProperty('--c', m.color ?? '');
        el.style.transform = `translate(${c.x.toFixed(0)}px, ${c.y.toFixed(0)}px)${left ? ' translateX(-100%)' : ''}`;
        el.style.opacity = String(Math.max(0.35, 1 - c.d / 60));
        if (el.dataset.t !== txt) { el.dataset.t = txt; el.innerHTML = `<i></i><span>${txt}</span>`; }
        el.hidden = false;
        if (++n >= (small ? 6 : 24)) break;
      }
      for (let i = n; i < pool.length; i++) pool[i].hidden = true;
      // what it is up to, and how it is doing (a few times a second is enough)
      if ((planT -= dt) < 0) {
        planT = 0.4;
        $('.t').textContent = L.title; $('.s').textContent = L.sub; $('.st').textContent = L.stat(s, r);
        // (one with a mind of its own: its own goal, and the steps it has left — otherwise what it is doing)
        $('.now').textContent = s.goal ? `${s.goal.text}　— ${status}` : status;
        const ol = $('.plan ol'), items = s.goal?.steps.length ? s.goal.steps.slice(0, 4).map((t, i) => `${'①②③④'[i]} ${t}`) : L.bullets(s, r);
        ol.innerHTML = items.map((b, i) => `<li${i === 0 ? ' class="cur"' : ''}>${b}</li>`).join('');
      }
      // what it says to the others (its own bubble is not drawn from inside its head)
      if (r.saying && r.saying !== lastSay) {
        lastSay = r.saying; mutT = 9;
        $('.mutter i').innerHTML = gibber(r.id, r.saying); $('.mutter span').textContent = r.saying;
        $('.mutter').classList.add('on');
        clearTimeout(offT); offT = window.setTimeout(() => $('.mutter').classList.remove('on'), 5000);
      } else if (!r.saying) lastSay = '';
    },
  };
}
