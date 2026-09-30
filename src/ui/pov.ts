// Through a resident's own eyes: the camera sits where its eyes are, and over the view each of them has
// its own kind of AR — Dot a work display of plans, measurements and progress; Kamemaru an observer's
// notebook that names what swims by; Lantern a night-sight that marks what is not yet on its map;
// Rakko something bright and playful. What it has its eye on is marked, what it means to do next is
// spelled out, and now and then it mutters to itself (in its own language, with what it means).
import * as THREE from 'three';
import type { Sense, Mark } from '../robots/residents';

interface Look { title: string; sub: string; bullets: (s: Sense, r: any) => string[]; label: (m: Mark, d: number) => string; stat: (s: Sense, r: any) => string }
const pct = (k: number) => `${Math.round(k * 100)}%`;
const bar = (k: number, n = 8) => '▮'.repeat(Math.round(k * n)) + '▯'.repeat(n - Math.round(k * n));

// what each of them means to do, step by step, for what it is doing now
const PLAN: Record<string, Record<string, string[]>> = {
  dot: {
    gather: ['① 流木 回収', '② 作業台デ 削ル', '③ 部材 #{n} 取付'], craft: ['① 部材 #{n} 成形', '② 小屋ヘ 運搬', '③ 取付 → 次ノ流木'],
    place: ['① 部材 #{n} 取付', '② 固定 確認', '③ 次ノ流木 探索'], chop: ['① 若木 伐採', '② 丸太 回収', '③ 畑ノ 区画 確保'],
    till: ['① 区画 耕起', '② 種マキ', '③ 収穫 マデ 1.5日'], plant: ['① 種マキ', '② 生育 監視', '③ 収穫'], harvest: ['① 収穫', '② 食料 備蓄', '③ 再ビ 種マキ'],
    look: ['① 海 監視', '② 流木 漂着 待チ'], fire: ['① 焚キ火ノ会', '② 今日ノ報告', '③ 明日ノ計画 共有'], idle: ['① 休憩', '② 次ノ計画 立案'],
  },
  kame: { watch: ['浜から海を記録する', '雲と潮の変わり目を見る'], swim: ['ラグーンの魚を数える', '根のまわりを一周'], fire: ['みなの話を聞く'], idle: ['ひと休み'] },
  lantern: { explore: ['地図の空白へ', '見つけたものを記す'], think: ['星を見上げる', '問いをひとつ考える'], fetch: ['石をひとつ拾う', '石積みへ運ぶ'], stack: ['石を積む', '目印をひとつ残す'], rest: ['夜を待つ'], fire: ['灯りを分け合う'] },
  rakko: { collect: ['きれいな貝殻さがし！', '山にならべる'], pile: ['貝殻ならべる♪', 'つぎさがす！'], float: ['ぷかぷかする', 'お空みる'], crack: ['貝をわる！', 'たべる！'], nap: ['おひるね…'], fire: ['みんなとおしゃべり！'] },
};
const LOOK: Record<string, Look> = {
  dot: {
    title: 'DOT-OS 0.3 ▸ 作業視界', sub: 'ドットの目',
    bullets: (s, r) => (PLAN.dot[s.task] ?? PLAN.dot.idle).map((l) => l.replace('{n}', String(s.built + 1))),
    label: (m, d) => (m.kind === 'friend' ? `${m.label} ／ ${m.sub}` : `${m.label}${m.sub ? ' ／ ' + m.sub : ''} ▸ ${d.toFixed(1)}m`),
    stat: (s, r) => `電池 ${bar(r.battery)} ${pct(r.battery)}　小屋 ${s.built}/${s.hutN}　食料 ${s.food}`,
  },
  kame: {
    title: 'カメマルの観察帳', sub: 'ゆっくり見る目',
    bullets: (s) => PLAN.kame[s.task] ?? PLAN.kame.idle,
    label: (m, d) => (m.kind === 'friend' ? `${m.label}さん（${m.sub}）` : m.kind === 'fish' ? `${m.label}${m.sub ? ' · ' + m.sub : ''}` : `${m.label}　${Math.round(d)}m`),
    stat: (s, r) => `記録 ${r.stats.notes}件　甲羅の電池 ${pct(r.battery)}`,
  },
  lantern: {
    title: 'LANTERN ／ 夜目', sub: '灯りの届くところ',
    bullets: (s) => PLAN.lantern[s.task] ?? ['……'],
    label: (m, d) => (m.kind === 'friend' ? `◇ ${m.label}` : `◇ ${m.label}${m.sub ? '  ' + m.sub : ''}`),
    stat: (s, r) => `灯り ${pct(r.battery)}　目印 ${r.stats.cairns}`,
  },
  rakko: {
    title: 'らっこアイ♪', sub: 'きらきら見える',
    bullets: (s) => PLAN.rakko[s.task] ?? ['なにしよっかな〜'],
    label: (m, d) => (m.kind === 'shell' ? `✧ ${m.label}！` : m.kind === 'friend' ? `♥ ${m.label}（${m.sub}）` : `${m.label}`),
    stat: (s, r) => `貝殻 ${r.stats.shells}個　げんき ${pct(r.battery)}`,
  },
};
// which mutters fit what it is doing
function mutterKey(task: string, act: string) {
  if (task === 'fire') return 'fire';
  if (act === 'carry') return 'carry';
  if (['pick', 'hammer', 'chop', 'dig', 'swim', 'float', 'think', 'look'].includes(act)) return act;
  if (task === 'watch' || task === 'look' || task === 'explore') return 'look';
  if (act === 'work') return 'work';
  if (act === 'walk') return 'walk';
  return 'idle';
}

export function makePov(root: HTMLElement) {
  root.innerHTML = `<div class="frame"></div><div class="marks"></div>
    <header><b class="t"></b><span class="s"></span><span class="st"></span></header>
    <aside class="plan"><div class="k">いまの目的</div><div class="now"></div><ol></ol></aside>
    <div class="mutter"><i></i><span></span></div>`;
  const marksEl = root.querySelector('.marks') as HTMLElement, pool: HTMLElement[] = [];
  const $ = (q: string) => root.querySelector(q) as HTMLElement;
  let who = '', mutT = 0, planT = 0, lastSay = '', offT = 0;
  const _p = new THREE.Vector3();
  return {
    get on() { return !!who; },
    show(r: any) { who = r.id; root.className = 'pov-' + r.id; root.hidden = false; mutT = 1.5; planT = 0; $('.mutter').classList.remove('on'); },
    hide() { who = ''; root.hidden = true; },
    update(r: any, s: Sense, status: string, camera: THREE.Camera, w: number, h: number, dt: number, extra: Mark[], gibber: (id: string, t: string) => string) {
      if (!who) return;
      const L = LOOK[r.id];
      // the marks: what is in view, projected onto the screen
      const all = [...s.marks, ...extra];
      let n = 0;
      for (const m of all) {
        _p.set(m.x, m.y, m.z);
        const d = _p.distanceTo(camera.position);
        _p.project(camera);
        if (_p.z > 1 || Math.abs(_p.x) > 1.05 || Math.abs(_p.y) > 1.05 || d < 0.6) continue;
        const el = pool[n] ?? (pool[n] = marksEl.appendChild(document.createElement('div')));
        el.className = `mk ${m.kind}${m.hot ? ' hot' : ''}`;
        el.style.setProperty('--c', m.color ?? '');
        el.style.transform = `translate(${((_p.x * 0.5 + 0.5) * w).toFixed(0)}px, ${((-_p.y * 0.5 + 0.5) * h).toFixed(0)}px)`;
        el.style.opacity = String(Math.max(0.35, 1 - d / 60));
        const txt = L.label(m, d) + (m.hot ? (r.id === 'dot' ? '　◀ TARGET' : r.id === 'rakko' ? '　← これ！' : '　← めあて') : '');
        if (el.dataset.t !== txt) { el.dataset.t = txt; el.innerHTML = `<i></i><span>${txt}</span>`; }
        el.hidden = false;
        if (++n >= 28) break;
      }
      for (let i = n; i < pool.length; i++) pool[i].hidden = true;
      // what it is up to, and how it is doing (a few times a second is enough)
      if ((planT -= dt) < 0) {
        planT = 0.4;
        $('.t').textContent = L.title; $('.s').textContent = L.sub; $('.st').textContent = L.stat(s, r);
        $('.now').textContent = status;
        const ol = $('.plan ol'), items = L.bullets(s, r);
        ol.innerHTML = items.map((b, i) => `<li${i === 0 ? ' class="cur"' : ''}>${b}</li>`).join('');
      }
      // what it says to the others (its own bubble is not drawn from inside its head)
      if (r.saying && r.saying !== lastSay) {
        lastSay = r.saying; mutT = 9;
        $('.mutter i').textContent = gibber(r.id, r.saying); $('.mutter span').textContent = '「' + r.saying + '」';
        $('.mutter').classList.add('on');
        clearTimeout(offT); offT = window.setTimeout(() => $('.mutter').classList.remove('on'), 5000);
      } else if (!r.saying) lastSay = '';
      // and every so often, a word to itself
      if ((mutT -= dt) < 0) {
        mutT = 7 + Math.random() * 6;
        const lines = r.v.mutter?.[mutterKey(s.task, r.act)] ?? r.v.mutter?.idle ?? [];
        if (lines.length && !r.saying) {
          const line = lines[Math.floor(Math.random() * lines.length)].replace('{built}', String(s.built));
          $('.mutter i').textContent = gibber(r.id, line); $('.mutter span').textContent = line;
          $('.mutter').classList.add('on');
          clearTimeout(offT); offT = window.setTimeout(() => $('.mutter').classList.remove('on'), 4200);
        }
      }
    },
  };
}
