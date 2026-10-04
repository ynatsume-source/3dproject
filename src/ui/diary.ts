// The residents' diaries, as each of them keeps it: Dot a work report on squared paper (a checklist, the
// numbers, progress, tomorrow's plan); Kamemaru a naturalist's notebook crammed with observations and
// notes in the margin; Lantern a night book with a line or two under its own stars; Rakko a picture
// diary, drawn in crayon from what happened that day, with a few big, happy words. One day to a page.
import type { Entry } from '../robots/residents';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const dayOf = (ms: number, tz: number) => new Date(ms + tz * 3600e3).toISOString().slice(0, 10);
const hm = (ms: number, tz: number) => new Date(ms + tz * 3600e3).toISOString().slice(11, 16);
const md = (day: string) => { const [, m, d] = day.split('-').map(Number); return `${m}月${d}日`; };
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const wd = (day: string) => WEEK[new Date(day + 'T00:00:00Z').getUTCDay()];
function seeded(str: string) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }

interface Ctx { r: any; R: any; day: string; entries: Entry[]; tz: number; n: number; today: boolean }

/* ---------- Dot: a work report ---------- */
function dotPage(c: Ctx) {
  const e = c.entries, count = (k: string[]) => e.filter((x) => x.key && k.includes(x.key)).length;
  const rows = e.map((x) => `<li><time>${hm(x.at, c.tz)}</time><span class="ck">${x.key === 'met' || x.key === 'fire' ? '◇' : '☑'}</span>${esc(x.text)}</li>`).join('');
  const s = c.r.stats, hutK = Math.min(1, s.built / 24);
  const bar = (k: number) => `<span class="bar"><i style="width:${Math.round(k * 100)}%"></i></span>`;
  const plan = c.today ? esc(c.R.status(c.r)) : '―';
  return `<header><b>作業日報 No.${c.n}</b><span>${md(c.day)}（${wd(c.day)}）</span><span>記録者：ドット</span></header>
    <section class="nums">
      <div><small>流木 回収</small><b>${count(['gather'])}</b><small>本</small></div>
      <div><small>部材 取付</small><b>${count(['build', 'done', 'deck'])}</b><small>本</small></div>
      <div><small>畑 作業</small><b>${count(['till', 'plant', 'harvest', 'chop'])}</b><small>件</small></div>
      <div><small>交流</small><b>${count(['met', 'fire'])}</b><small>回</small></div>
    </section>
    ${c.today ? `<p class="prog">小屋 ${s.built}/24 ${bar(hutK)} ${Math.round(hutK * 100)}%</p>` : ''}
    <h4>作業記録</h4><ol class="log">${rows}</ol>
    <h4>明日ノ計画</h4><p class="plan">${c.today ? `次ノ作業：${plan}。継続シマス。` : '（コノ日ノ計画、ページ外ニ 記載）'}</p>
    <p class="stamp">確認済</p>`;
}

/* ---------- Kamemaru: a naturalist's notebook, crammed ---------- */
function kamePage(c: Ctx) {
  const rnd = seeded('kame' + c.day);
  const words = [...new Set(c.entries.flatMap((x) => x.text.match(/[ァ-ヴー]{3,}/g) ?? []))].filter((w) => !['カメマル', 'ラグーン'].includes(w));
  const NOTES = ['風向きが変わると、浜の匂いも変わる。記録に残せないのが惜しい。',
    '若い個体ほど群れの外縁を泳ぐ傾向がある、ような気がする（要確認）。', '夕方、水面の色が一瞬だけ緑がかった。光の具合か、プランクトンか。', 
    'ドットさんの小屋、柱の影の長さで時刻がわかりそうだ。', 'ラッコくんの貝殻の山、どうやら大きさ順に並んでいる。'];
    // (the margin: its wonderings, not its findings — nothing in it claims a measurement it did not make)
  const margin = [0, 1, 2].map(() => NOTES[Math.floor(rnd() * NOTES.length)]).filter((v, i, a) => a.indexOf(v) === i);
  const body = c.entries.map((x) => `<p><time>${hm(x.at, c.tz)}</time>${esc(x.text)}${x.obs ? `<span class="add">（${esc(x.obs)}）</span>` : ''}</p>`).join('');
  return `<header><b>観察ノート　第${c.n}頁</b><span>${md(c.day)}（${wd(c.day)}）</span></header>
    <div class="cols"><div class="main">${body}
      ${words.length ? `<p class="list"><b>本日見かけたもの：</b>${words.map(esc).join('、')}</p>` : ''}
      <p class="sum">記録 ${c.entries.length}件。……書き足りない。</p></div>
      <aside>${margin.map((m) => `<p>※ ${m}</p>`).join('')}</aside></div>`;
}

/* ---------- Lantern: a line or two under its own stars ---------- */
function lanternPage(c: Ctx) {
  const rnd = seeded('lantern' + c.day), W = 300, H = 150;
  const stars = Array.from({ length: 26 }, () => [rnd() * W, rnd() * H, 0.6 + rnd() * 1.6]);
  const chain = stars.slice(0, 5 + Math.floor(rnd() * 3));
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="sky">${stars.map(([x, y, r]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`).join('')}
    <polyline points="${chain.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}"/></svg>`;
  const pick = c.entries.filter((x) => x.key === 'think' || x.key === 'fire' || x.key === 'pierDone' || x.key === 'find').concat(c.entries);
  const line = pick[0]?.text ?? '';
  const second = c.entries.length > 3 ? '……歩いた。' : '';
  return `<div class="night">${svg}<p class="date">${md(c.day)}の夜　<small>（思い出して描いた空）</small></p><p class="one">${esc(line.replace(/^.*?。(?=.)/, (m) => (line.length > 44 ? '' : m)))}</p>${second ? `<p class="two">${second}</p>` : ''}</div>`;
}

/* ---------- Rakko: a picture diary in crayon ---------- */
function rakkoPage(c: Ctx) {
  const all = c.entries.map((x) => x.text).join(' '), rnd = seeded('rakko' + c.day), has = (re: RegExp) => re.test(all);
  const W = 320, H = 200, night = has(/焚き火|おやすみ|星/);
  const g: string[] = [];
  g.push(`<rect width="${W}" height="${H}" fill="${night ? '#2d3a6e' : '#bfe6ff'}"/>`);
  g.push(night ? `<circle cx="270" cy="38" r="16" fill="#fff4b0"/>` : `<circle cx="270" cy="40" r="20" fill="#ffd34d"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const a = k / 8 * 6.28; return `<line x1="${270 + Math.cos(a) * 26}" y1="${40 + Math.sin(a) * 26}" x2="${270 + Math.cos(a) * 36}" y2="${40 + Math.sin(a) * 36}" stroke="#ffc41a" stroke-width="4"/>`; }).join('')}`);
  g.push(`<path d="M0 118 Q40 108 80 118 T160 118 T240 118 T320 118 V200 H0Z" fill="#4fb4e8"/><path d="M0 128 Q40 120 80 128 T160 128 T240 128 T320 128" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/>`);
  g.push(`<path d="M0 165 Q120 150 200 162 T320 158 V200 H0Z" fill="#f4dca0"/>`);
  // the otter itself, floating on its back or sitting on the sand
  const otter = (x: number, y: number) => `<g transform="translate(${x} ${y})"><ellipse rx="30" ry="14" fill="#a8683a"/><circle cx="-26" cy="-6" r="12" fill="#a8683a"/><circle cx="-26" cy="-4" r="7" fill="#f3d9b6"/><circle cx="-30" cy="-9" r="2" fill="#222"/><circle cx="-22" cy="-9" r="2" fill="#222"/><path d="M-29 -2 Q-26 1 -23 -2" stroke="#222" stroke-width="1.5" fill="none"/></g>`;
  g.push(has(/浮い|昼寝|泳/) ? otter(150, 120) : otter(160, 168));
  const shells = Math.min(6, (all.match(/貝/g) ?? []).length * 2);
  for (let k = 0; k < shells; k++) { const x = 30 + k * 22 + rnd() * 6, y = 180 + rnd() * 8; g.push(`<path d="M${x - 7} ${y} Q${x} ${y - 12} ${x + 7} ${y} Z" fill="${['#ffb3c7', '#fff', '#ffd9a0', '#c9b3ff'][k % 4]}" stroke="#d98aa0" stroke-width="1.5"/>`); }
  // friends met today, as little round faces
  const FR: Record<string, string> = { ドット: '#ffd98a', カメマル: '#7fe0c0', ランタン: '#8ff6ff' };
  Object.keys(FR).filter((n) => all.includes(n)).forEach((n, k) => { const x = 230 + k * 30, y = 150 - (k % 2) * 8; g.push(`<g transform="translate(${x} ${y})"><circle r="11" fill="${FR[n]}" stroke="#555" stroke-width="1.5"/><circle cx="-4" cy="-2" r="1.6" fill="#222"/><circle cx="4" cy="-2" r="1.6" fill="#222"/><path d="M-4 4 Q0 7 4 4" stroke="#222" stroke-width="1.4" fill="none"/></g>`); });
  if (has(/焚き火/)) g.push(`<g transform="translate(205 170)"><path d="M-10 0 L0 -26 L10 0Z" fill="#ff8a2a"/><path d="M-5 0 L0 -14 L5 0Z" fill="#ffe06a"/><line x1="-14" y1="3" x2="14" y2="0" stroke="#7a5230" stroke-width="4"/></g>`);
  if (has(/桟橋/)) g.push(`<g stroke="#8a6440" stroke-width="5">${[0, 1, 2, 3].map((k) => `<line x1="${40 + k * 24}" y1="112" x2="${40 + k * 24}" y2="140"/>`).join('')}<line x1="30" y1="110" x2="120" y2="110" stroke-width="7"/></g>`);
  if (has(/手紙|瓶|浮き玉|歯車|木札/)) g.push(`<g transform="translate(110 176) rotate(-20)"><rect x="-12" y="-5" width="24" height="10" rx="4" fill="#9fe3d6" stroke="#3a8a80" stroke-width="1.5"/><rect x="-4" y="-3" width="8" height="6" fill="#fff"/></g>`);
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="crayon"><defs><filter id="cray"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${Math.floor(rnd() * 99)}"/><feDisplacementMap in="SourceGraphic" scale="3.5"/></filter></defs><g filter="url(#cray)">${g.join('')}</g></svg>`;
  // a few words, the way it talks
  const kid = (t: string) => t.replace(/[。！]$/, '').replace(/。/g, '、');
  const lines = c.entries.slice(-3).map((x) => kid(x.text));
  // (the weather only as far as the day's own record says: night, or nothing — not a guess)
  const weather = night ? 'よる' : '';
  return `<header><b>えにっき</b><span>${md(c.day)}（${wd(c.day)}）${weather ? `　てんき：${weather}` : ''}</span></header>${svg}
    <div class="words">${lines.map((l) => `<p>${esc(l)}！</p>`).join('')}</div>`;
}

const PAGE: Record<string, (c: Ctx) => string> = { dot: dotPage, kame: kamePage, lantern: lanternPage, rakko: rakkoPage };
const BOOK: Record<string, string> = { dot: 'ドットの作業日報', kame: 'カメマルの観察ノート', lantern: 'ランタンの夜の手帖', rakko: 'ラッコのえにっき' };

export function makeDiaryBook(root: HTMLElement) {
  let R: any = null, who = 'dot', tz = 9, idx = -1;
  const days = (r: any) => [...new Set((r.diary as Entry[]).map((e) => dayOf(e.at, tz)))].sort();
  function render() {
    const r = R.list.find((x: any) => x.id === who), ds = days(r);
    if (idx < 0 || idx >= ds.length) idx = ds.length - 1;
    const day = ds[idx], entries = day ? (r.diary as Entry[]).filter((e) => dayOf(e.at, tz) === day) : [];
    const today = !!day && day === dayOf(Date.now(), tz);
    const tabs = R.list.map((x: any) => `<button type="button" data-who="${x.id}" aria-pressed="${x.id === who}" style="--c:${x.sp.color}"><i></i>${x.v.name}</button>`).join('');
    const page = day ? PAGE[who]({ r, R, day, entries, tz, n: idx + 1, today }) : '<p class="empty">まだ何も書いていないようです。</p>';
    root.innerHTML = `<div class="shade" data-close></div><div class="book b-${who}" role="dialog" aria-label="${BOOK[who]}">
      <nav>${tabs}<button type="button" class="x" data-close aria-label="閉じる">×</button></nav>
      <h2>${BOOK[who]}</h2>
      <article class="pg">${page}</article>
      <footer><button type="button" data-step="-1" ${idx <= 0 ? 'disabled' : ''}>‹ 前の日</button><span>${ds.length ? `${idx + 1} / ${ds.length} 日目` : ''}</span><button type="button" data-step="1" ${idx >= ds.length - 1 ? 'disabled' : ''}>次の日 ›</button></footer></div>`;
  }
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) { api.close(); return; }
    const w = t.closest('[data-who]') as HTMLElement | null; if (w) { who = w.dataset.who!; idx = -1; render(); return; }
    const st = t.closest('[data-step]') as HTMLElement | null; if (st) { idx += +st.dataset.step!; render(); root.querySelector('.pg')?.classList.add('turn'); }
  });
  const api = {
    get open() { return !root.hidden; },
    show(res: any, id: string, zone: number) { R = res; who = id; tz = zone; idx = -1; render(); root.hidden = false; },
    close() { root.hidden = true; },
    step(d: number) { if (!root.hidden) { idx += d; render(); } },
  };
  return api;
}
