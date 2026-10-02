import type { StudyAction, StudyFocus, StudyState, StudyWork } from '../robots/lantern-study-types';
import { renderStudySvg } from '../robots/lantern-sky';
import './lantern-study.css';

export interface LanternStudyPanelOptions {
  getState: () => StudyState | null;
  getStatus: () => string;
  setAiEnabled: (enabled: boolean) => void;
  hasApiKey: () => boolean;
  follow: () => void;
  getWorldTime: () => number;
  getViewingTime?: () => number;
}

const FOCUS: Record<StudyFocus, string> = { patterns: '星の並び', brightness: '明るさの違い', horizon: '水平線の近く' };
const ACTION: Record<StudyAction, string> = { observe: '星を観察する', draw: '星図を描く', explore: '観察する場所を探す', rest: 'ひと休みする', share: '作品を見せる' };
const utc = new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const japanTime = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const stamp = (at: number) => Number.isFinite(at) ? utc.format(at) : '—';
const japanStamp = (at: number) => Number.isFinite(at) ? japanTime.format(at) : '—';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) {
  const el = document.createElement(tag); el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function write(el: HTMLElement, value: string) { if (el.textContent !== value) el.textContent = value; }

/** All saved/model-authored strings enter the DOM as text. The SVG is an image resource,
 * never executable inline markup; the renderer also escapes its XML text for downloads. */
export function makeLanternStudyPanel(opts: LanternStudyPanelOptions) {
  const root = node('div', 'lantern-study');
  root.hidden = true;
  // Static structure only. No resident content or generated text is interpolated here.
  root.innerHTML = `<div class="ls-shade" data-ls-close></div>
    <section class="ls-book" role="dialog" aria-modal="true" aria-labelledby="ls-title" aria-describedby="ls-intro" tabindex="-1">
      <header class="ls-head">
        <div><p class="ls-eyebrow">LANTERN · FIELD NOTES</p><h2 id="ls-title">夜のアトリエ</h2><p id="ls-intro">見つけたことを、次の一枚へ。</p></div>
        <button type="button" class="ls-close" data-ls-close aria-label="夜のアトリエを閉じる">×</button>
      </header>
      <div class="ls-scroll">
        <section class="ls-curiosity" aria-labelledby="ls-question-heading">
          <h3 id="ls-question-heading">いま、気になっていること</h3><p class="ls-question"></p><ul class="ls-interests" aria-label="関心のあること"></ul>
          <div class="ls-present"><span class="ls-live-dot" aria-hidden="true"></span><p class="ls-action"></p><span class="ls-source"></span></div>
          <p class="ls-reason"></p>
          <button type="button" class="ls-follow">ランタンを見守る <span aria-hidden="true">↗</span></button>
        </section>
        <div class="ls-pages">
          <section class="ls-work" aria-labelledby="ls-work-heading">
            <div class="ls-section-head"><h3 id="ls-work-heading">つくっているもの</h3><span class="ls-work-status"></span></div>
            <label class="ls-select-label">作品を選ぶ<select class="ls-work-select" aria-label="作品を選ぶ"></select></label>
            <figure class="ls-art"><img class="ls-art-image" alt="" hidden><div class="ls-blank"><span aria-hidden="true">—</span><p>まだ、白紙のまま。</p><small>夜の観察が、最初の一枚になる。</small></div></figure>
            <h4 class="ls-work-title"></h4><p class="ls-caption"></p><p class="ls-work-meta"></p>
            <button type="button" class="ls-download" disabled>完成した星図を保存する <span aria-hidden="true">↓</span></button>
            <p class="ls-art-note">星の位置は、観察した日時と緯度・経度から計算。観察の記録と添えた言葉は、この世界のランタンによるものです。</p>
            <p class="ls-art-provenance" hidden></p>
          </section>
          <section class="ls-memory" aria-labelledby="ls-memory-heading">
            <div class="ls-section-head"><h3 id="ls-memory-heading">覚えていること</h3><span class="ls-memory-count"></span></div>
            <ol class="ls-memories"></ol><p class="ls-memory-empty">これからの経験が、ここに残ります。</p>
            <details class="ls-decisions"><summary>最近、選んだこと</summary><ol class="ls-decisions-list"></ol><p class="ls-decision-note">行動を選んだときの短い説明と、その結果です。</p></details>
          </section>
        </div>
        <details class="ls-settings"><summary>ランタンの行動の選び方</summary>
          <p>ふだんは、記憶・関心・体の状態に応じた、決まった手順で行動を選びます。AIを使わなくても観察や制作は続きます。</p>
          <label class="ls-ai-label"><input type="checkbox" class="ls-ai" aria-describedby="ls-ai-note ls-key-note"><span>AIにも、次の行動を考えてもらう</span></label>
          <p id="ls-ai-note">既存のAnthropic APIキーを使い、住民の記憶と現在の状況を送ります。API利用料が発生します。単一タブでの利用では、実時間で最短5分間隔、会話と合わせて1日120回までです。</p>
          <p id="ls-key-note" class="ls-key-note"></p><p class="ls-issue" role="status" aria-live="polite"></p>
        </details>
        <footer class="ls-foot"><p class="ls-clocks"></p><p>記録の日時は世界の時刻です。不在中の記録は、経過時間から進めた暮らしの推定です。</p><p>通常の暮らしとは別に保存される試作です。</p></footer>
      </div>
    </section>`;
  document.body.append(root);
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const book = q('.ls-book'), closeButton = q<HTMLButtonElement>('.ls-close');
  const question = q('.ls-question'), interests = q('.ls-interests'), action = q('.ls-action'), source = q('.ls-source'), reason = q('.ls-reason');
  const select = q<HTMLSelectElement>('.ls-work-select'), selectLabel = q('.ls-select-label');
  const workStatus = q('.ls-work-status'), art = q<HTMLImageElement>('.ls-art-image'), blank = q('.ls-blank');
  const workTitle = q('.ls-work-title'), caption = q('.ls-caption'), meta = q('.ls-work-meta'), provenance = q('.ls-art-provenance');
  const download = q<HTMLButtonElement>('.ls-download');
  const memories = q('.ls-memories'), empty = q('.ls-memory-empty'), count = q('.ls-memory-count');
  const decisions = q('.ls-decisions-list');
  const ai = q<HTMLInputElement>('.ls-ai'), keyNote = q('.ls-key-note'), issue = q('.ls-issue'), clocks = q('.ls-clocks');
  const inertBefore = new Map<HTMLElement, boolean>();
  let returnFocus: HTMLElement | null = null, selectedId = '', selectedPinned = false;
  let lastUpdate = -Infinity, lastSnapshot = '', lastWorks = '', lastSvg = '', artUrl = '', renderedWork: StudyWork | null = null;

  function showArtwork(state: StudyState, work: StudyWork | null) {
    renderedWork = work;
    workStatus.hidden = !work;
    download.disabled = !work?.completedAt;
    blank.hidden = !!work; art.hidden = !work;
    write(workTitle, work?.title || '');
    write(caption, work?.caption || ''); caption.hidden = !work?.caption;
    if (!work) {
      provenance.hidden = true; write(provenance, '');
      write(meta, '観察して、描いて、また見直す。ゆっくり形になっていきます。');
      if (artUrl) URL.revokeObjectURL(artUrl);
      artUrl = ''; lastSvg = ''; art.removeAttribute('src');
      return;
    }
    const observations = work.observationIds.map(id => state.observations.find(o => o.id === id)).filter(o => !!o);
    const cloudSources = { live: '現地天気データ', simulation: '演出用の設定', unknown: '不明' };
    const sources = [...new Set(observations.map(o => cloudSources[o.cloudSource] || cloudSources.unknown))];
    provenance.hidden = !observations.length;
    write(provenance, observations.length ? `雲量：${sources.join('・')}。${observations.some(o => o.offline) ? '不在中の推定を含みます。' : ''}個々の星が雲に隠れる様子は再現していません。` : '');
    const complete = !!work.completedAt;
    write(workStatus, complete ? '完成' : '制作中'); workStatus.dataset.complete = String(complete);
    write(meta, `観察 ${observations.length}回 · 描き直し ${work.revisions}回${work.sharedWith.length ? ` · ${work.sharedWith.length}人に見せた` : ''}${work.completedAt ? ` · ${stamp(work.completedAt)} UTC 完成` : ' · 下書きはまだ保存できません'}`);
    const svg = renderStudySvg({
      title: work.title, siteName: observations[0]?.placeName || '島の観察場所',
      observations: observations.map(o => ({ atMs: o.atMs, lat: o.lat, lon: o.lon, starIds: o.starIds, cloud: o.cloud, cloudSource: o.cloudSource, offline: o.offline })),
      caption: work.caption, status: complete ? 'complete' : 'draft',
    });
    art.alt = `${work.title}。${complete ? '完成した星図' : '制作途中の星図'}。${observations.length}回の観察をもとに描いたもの。`;
    if (svg !== lastSvg) {
      const previous = artUrl;
      artUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      art.src = artUrl; lastSvg = svg;
      if (previous) URL.revokeObjectURL(previous);
    }
  }

  function render(force = false) {
    if (root.hidden) return;
    const now = performance.now();
    if (!force && now - lastUpdate < 500) return;
    lastUpdate = now;
    const state = opts.getState(), hasKey = opts.hasApiKey();
    write(clocks, `住民の時刻 ${japanStamp(opts.getWorldTime())} JST${opts.getViewingTime ? `　／　空の表示 ${japanStamp(opts.getViewingTime())} JST` : ''}`);
    ai.disabled = !state || (!hasKey && !state.aiEnabled);
    ai.checked = !!state?.aiEnabled;
    write(keyNote, hasKey ? '「島の住人」で設定したキーを利用します。いつでもオフにできます。' : '使う場合は「島の住人」の「AIで言葉を書く」でAPIキーを設定してください。');
    write(action, opts.getStatus() || '次の行動を待っています');
    if (!state) {
      write(question, '島で、ランタンの暮らしを見守ろう。');
      write(source, '待機中'); write(reason, 'ランタンのいる島に入ると、観察と制作の記録を開けます。');
      interests.replaceChildren(); memories.replaceChildren(); decisions.replaceChildren();
      selectLabel.hidden = true; workStatus.hidden = true; art.hidden = true; blank.hidden = false;
      workTitle.textContent = ''; caption.textContent = ''; meta.textContent = ''; count.textContent = ''; issue.textContent = ''; provenance.textContent = ''; provenance.hidden = true;
      empty.hidden = false; download.disabled = true; renderedWork = null; lastSnapshot = '';
      return;
    }
    const works = [...state.works].reverse();
    if (!selectedPinned || !works.some(w => w.id === selectedId)) selectedId = works[0]?.id || '';
    const work = works.find(w => w.id === selectedId) || null;
    const snapshot = JSON.stringify([state.interest, state.active, state.memories.slice(-8), state.decisions.slice(-5), state.lastIssue, work, state.observations.filter(o => work?.observationIds.includes(o.id)), works.map(w => [w.id, w.title, w.completedAt])]);
    if (!force && snapshot === lastSnapshot) return;
    lastSnapshot = snapshot;
    write(question, state.active?.question || works.find(w => !w.completedAt)?.question || works[0]?.question || 'まだ、問いを探している。');
    write(source, state.active ? (state.active.source === 'ai' ? 'AIが選んだ行動' : '習慣から選んだ行動') : '次の行動を待つ');
    write(reason, state.active?.reason || '経験を重ねながら、次にしたいことを選びます。');
    interests.replaceChildren(...(Object.keys(FOCUS) as StudyFocus[]).sort((a, b) => state.interest[b] - state.interest[a]).map((focus, i) => {
      const li = node('li', i === 0 ? 'ls-interest ls-interest-first' : 'ls-interest', FOCUS[focus]);
      if (i === 0) li.setAttribute('aria-label', `${FOCUS[focus]}、いま最も関心があること`);
      return li;
    }));
    const workSignature = JSON.stringify(works.map(w => [w.id, w.title, w.completedAt]));
    if (workSignature !== lastWorks) {
      select.replaceChildren(...works.map(w => {
        const option = document.createElement('option'); option.value = w.id; option.textContent = `${w.completedAt ? '完成' : '制作中'} · ${w.title}`; return option;
      }));
      lastWorks = workSignature;
    }
    selectLabel.hidden = works.length < 2; select.value = selectedId;
    showArtwork(state, work);
    const recent = state.memories.slice(-8).reverse();
    empty.hidden = recent.length > 0; write(count, recent.length ? `最近の${recent.length}件` : '');
    memories.replaceChildren(...recent.map(memory => {
      const li = node('li', `ls-memory-item ls-memory-${memory.kind}`);
      const time = node('time', '', `${stamp(memory.atMs)} UTC${memory.offline ? ' · 不在中の推定' : ''}`);
      if (Number.isFinite(memory.atMs)) time.dateTime = new Date(memory.atMs).toISOString();
      li.append(time, node('p', '', memory.text)); return li;
    }));
    const OUTCOME = { started: '取り組み中', completed: 'できた', interrupted: '中断', failed: 'できなかった' };
    decisions.replaceChildren(...state.decisions.slice(-5).reverse().map(decision => {
      const li = node('li', ''), title = node('p', 'ls-decision-title', `${ACTION[decision.action]} · ${OUTCOME[decision.outcome]}`);
      li.append(title, node('p', '', decision.reason), node('small', '', `${stamp(decision.atMs)} UTC · ${decision.source === 'ai' ? 'AIが選択' : '決まった手順で選択'}`));
      return li;
    }));
    write(issue, state.lastIssue ? `${state.lastIssue}　AIを使えないときは、決まった手順で暮らしを続けます。` : '');
  }

  function close() {
    if (root.hidden) return;
    root.hidden = true;
    for (const [el, wasInert] of inertBefore) el.inert = wasInert;
    inertBefore.clear();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function show() {
    if (!root.hidden) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    for (const child of document.body.children) if (child instanceof HTMLElement && child !== root) {
      inertBefore.set(child, child.inert); child.inert = true;
    }
    root.hidden = false; render(true); closeButton.focus({ preventScroll: true });
  }
  root.addEventListener('click', event => {
    if ((event.target as HTMLElement).closest('[data-ls-close]')) close();
  });
  q('.ls-follow').addEventListener('click', () => { close(); opts.follow(); });
  ai.addEventListener('change', () => { opts.setAiEnabled(ai.checked); render(true); });
  select.addEventListener('change', () => { selectedId = select.value; selectedPinned = true; render(true); });
  download.addEventListener('click', () => {
    if (!renderedWork?.completedAt || !artUrl) return;
    const link = document.createElement('a'); link.href = artUrl;
    link.download = `lantern-star-study-${new Date(renderedWork.completedAt).toISOString().slice(0, 10)}.svg`;
    document.body.append(link); link.click(); link.remove();
  });
  document.addEventListener('keydown', event => {
    if (root.hidden) return;
    // Keep world shortcuts from firing while a visitor reads or changes the controls.
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(book.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href], [tabindex="0"]'))
      .filter(el => el.getClientRects().length > 0);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) { event.preventDefault(); book.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || !book.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !book.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }, true);
  return { show, close, toggle: () => root.hidden ? show() : close(), update: (_dt?: number) => render(), get open() { return !root.hidden; } };
}
