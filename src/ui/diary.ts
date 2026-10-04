// The residents' records, one day to a page: what happened as it was kept, with the numbers the island keeps for
// each (progress, body, battery) — the same plain record for all four.
import type { Entry } from '../robots/residents';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const dayOf = (ms: number, tz: number) => new Date(ms + tz * 3600e3).toISOString().slice(0, 10);
const hm = (ms: number, tz: number) => new Date(ms + tz * 3600e3).toISOString().slice(11, 16);
const md = (day: string) => { const [, m, d] = day.split('-').map(Number); return `${m}月${d}日`; };
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const wd = (day: string) => WEEK[new Date(day + 'T00:00:00Z').getUTCDay()];

interface Ctx { r: any; R: any; day: string; entries: Entry[]; tz: number; n: number; today: boolean }

/* ---------- one record for each of them: what happened, as it was kept ---------- */
// (ADR 0004, addendum 2026-10-04: no character put on — not a crayon picture diary, not a robot's broken speech;
// the same plain record for all four, with the numbers the island keeps for each)
const FAIL = /できなかった|道がなかった|進めなかった|もうなかった|断られた|うまくいかなかった|獲れなかった/;
function progress(r: any) {
  const s = r.stats, full = Math.round(100 * (1 - r.hunger));
  return r.id === 'dot' ? `小屋 ${s.built}/24　収穫 ${s.food}　電池 ${Math.round(r.battery * 100)}%`
    : r.id === 'rakko' ? `貝殻 ${s.shells}個　おなか ${full}　ねむけ ${Math.round(r.sleepy * 100)}`
      : r.id === 'kame' ? `記録 ${s.notes}件　おなか ${full}　ねむけ ${Math.round(r.sleepy * 100)}`
        : `記録 ${s.notes}件　目印 ${s.cairns}　電池 ${Math.round(r.battery * 100)}%`;
}
function recordPage(c: Ctx) {
  const e = c.entries;
  const rows = e.map((x) => `<li><time>${hm(x.at, c.tz)}</time><span class="ck">${x.key === 'met' || x.key === 'fire' ? '◇' : FAIL.test(x.text) ? '×' : '☑'}</span>${esc(x.text)}${x.obs ? `<span class="add">（${esc(x.obs)}）</span>` : ''}</li>`).join('');
  const n = (f: (x: Entry) => boolean) => e.filter(f).length;
  return `<header><b>記録 No.${c.n}</b><span>${md(c.day)}（${wd(c.day)}）</span><span>${esc(c.r.v.name)}</span></header>
    <section class="nums">
      <div><small>記録</small><b>${e.length}</b><small>件</small></div>
      <div><small>うまくいかなかった</small><b>${n((x) => FAIL.test(x.text))}</b><small>件</small></div>
      <div><small>情報の交換</small><b>${n((x) => x.key === 'met' || x.key === 'fire')}</b><small>回</small></div>
    </section>
    ${c.today ? `<p class="prog">${esc(progress(c.r))}</p>` : ''}
    <h4>記録</h4><ol class="log">${rows}</ol>
    ${c.today ? `<h4>いま</h4><p class="plan">${esc(c.R.status(c.r))}</p>` : ''}`;
}

export function makeDiaryBook(root: HTMLElement) {
  let R: any = null, who = 'dot', tz = 9, idx = -1;
  const days = (r: any) => [...new Set((r.diary as Entry[]).map((e) => dayOf(e.at, tz)))].sort();
  function render() {
    const r = R.list.find((x: any) => x.id === who), ds = days(r);
    if (idx < 0 || idx >= ds.length) idx = ds.length - 1;
    const day = ds[idx], entries = day ? (r.diary as Entry[]).filter((e) => dayOf(e.at, tz) === day) : [];
    const today = !!day && day === dayOf(Date.now(), tz);
    const tabs = R.list.map((x: any) => `<button type="button" data-who="${x.id}" aria-pressed="${x.id === who}" style="--c:${x.sp.color}"><i></i>${x.v.name}</button>`).join('');
    const page = day ? recordPage({ r, R, day, entries, tz, n: idx + 1, today }) : '<p class="empty">まだ何も書いていないようです。</p>';
    root.innerHTML = `<div class="shade" data-close></div><div class="book b-dot" role="dialog" aria-label="${esc(R.list.find((x: any) => x.id === who).v.name)}の記録">
      <nav>${tabs}<button type="button" class="x" data-close aria-label="閉じる">×</button></nav>
      <h2>${esc(R.list.find((x: any) => x.id === who).v.name)}の記録</h2>
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
