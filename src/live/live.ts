// The live screen (?live): the island streamed as it is, through "the observation window" (docs/proposals/viewer-
// design-2026-10-16/screens/README.md, v2 2026-10-17). It only reads the world as it already is — who is being followed,
// the words the world has for what it is doing, the island's date and time — and gives nothing back: no sense(), no
// options, nothing to a resident's mind. The app's own controls are put away; the drone follows the residents by what is
// going on with each (director.ts).
// Fonts are the stream PC's own files (OFL, @fontsource): no request leaves the machine for them.
import '@fontsource/zen-old-mincho/500.css';
import '@fontsource/zen-old-mincho/600.css';
import '@fontsource/cormorant-sc/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import './live.css';
import { islandDate } from '../world/island-time';
import { localTimeString } from '../time/clock';
import { trimStatus, wrapStatus, subtitleLines } from './status-line';
import { glyphs, LEX } from '../robots/islandlang';
import { luminance, brightTenth, hazeFor, hazeStyle } from './scrim';
import { statusEn, firstEn, asLine, FIXED_EN, NAMES_EN } from './en';
import { captionSender } from './captions';
import { makeDirector } from './director';
import { chapter1 } from '../world/chapter1';
import { chapterView, startCard, endCard, goneCard } from './chapter-line';

export interface LiveCtx {
  residents(): any | null;           // the island's residents, once the island is built
  watched(): any | null;             // the one the drone follows now
  watch(r: any): void;               // follow this one
  clockMs(): number;
  tz(): number;
  cam?(who: string, pri: number, kind: string, why: string): void;   // (each change of who is followed, for the log: ?rehearsal)
}
/** The drone's number for each one it follows (01–04; 13 is the island round, later). */
const DORON: Record<string, string> = { dot: '01', rakko: '02', kame: '03', lantern: '04' };
export function makeLive(ctx: LiveCtx) {
  document.body.classList.add('live');
  // (?lang=en: the same window in English — the world's words turned on this side only: src/live/en.ts; ?captions=<url>:
  // what is said, and the island's firsts, sent as captions to the stream PC's own sender, tools/live/captions.mjs — in
  // their own language, English unless ?captionLang=ja: a Japanese screen carries English captions, viewer design v2 §6)
  const q = new URLSearchParams(location.search), en = q.get('lang') === 'en', captions = captionSender(q.get('captions'));
  const capEn = q.get('captionLang') !== 'ja';
  const nameIn = (r: any, inEn: boolean) => (inEn ? NAMES_EN[r?.v?.name] ?? r?.v?.name : r?.v?.name) ?? '';
  const nameOf = (r: any) => nameIn(r, en);
  const dateOf = (ms: number) => { const d = islandDate(ms); return en ? FIXED_EN.date(d.year, d.month, d.day) : `島暦${d.year}年 ${d.month}月${d.day}日`; };
  const root = document.createElement('div'); root.id = 'live'; if (en) root.classList.add('en');
  root.innerHTML = `
    <div class="brand"><div class="en">UTSUSHIYO PROJECT</div><div class="ja"><i class="ser">Series 1</i>${en ? FIXED_EN.brand : 'ルマウ'}</div></div>
    <div class="when"><div><span class="date"></span><span class="time"></span></div><div class="ai">${en ? FIXED_EN.ai : '住人はAIです ・ 映像は自動で撮影しています'}</div></div>
    <div class="chap fade off"><div class="c1"><span class="no"></span><span class="nm"></span><span class="dy"></span></div><div class="way fade"></div><div class="cargo fade"></div></div>
    <div class="band fade off"><div class="doron"><span class="n"></span>DORON</div>
      <div class="who"><span class="isl-name"></span><span class="name"></span><span class="line"></span></div><div class="status fade"></div><div class="trial fade off"><span class="k"></span><span class="t"></span></div></div>
    <div class="card fade off"><div class="rule"></div><div class="head">${en ? FIXED_EN.first : '島で初めて'}</div><div class="what"></div><div class="at"></div><div class="rule"></div></div>
    <div class="sub fade off"><div class="who"><span class="line"></span><span class="name"></span></div><div class="isl-line"></div><div class="tr"></div></div>`;
  document.body.appendChild(root);
  const $ = (s: string) => root.querySelector(s) as HTMLElement;
  const band = $('.band'), status = $('.status'), trialEl = $('.band .trial');
  const measure = document.createElement('canvas').getContext('2d')!;
  let tick = 0, shownFor = '', shownText = '', swapT = 0;

  // (the line fits the band's width at its own size and face: broken after a 、 or 。 if not)
  const fits = (line: string) => { measure.font = `500 ${status.style.fontSize || getComputedStyle(status).fontSize} ${en ? "'Cormorant Garamond'" : "'Zen Old Mincho'"}`; return measure.measureText(line).width <= innerWidth * 0.5 - innerHeight / 1080 * 24; };
  function show(r: any, text: string) {
    const line = en ? statusEn(trimStatus(text)) : trimStatus(text);   // (English the table does not have: no line, the name alone)
    const lines = line ? wrapStatus(en ? asLine(line) : line, fits) : [];
    status.innerHTML = lines.map((l) => `<span>${l.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</span>`).join('');
    $('.doron .n').textContent = DORON[r.id] ?? '13';
    $('.band .who .name').textContent = nameOf(r);
    $('.band .who .isl-name').innerHTML = islName(r);
    ($('.band .who .line')).style.setProperty('--c', r.sp?.color ?? '#fff');
  }

  const esc = (t: string) => t.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));
  const islName = (r: any) => { const w = (LEX as Record<string, string>)[r.id]; return w ? glyphs([w], 'isl', 1.25) : ''; };
  // (who is speaking, of the one followed and whoever it is with: the followed one, the one it talks with, or one
  // speaking near it at the fire)
  const speaker = (R: any, r: any) => {
    if (r.saying) return r;
    const o = r.talk ? (r.talk.a === r ? r.talk.b : r.talk.a) : null; if (o?.saying) return o;
    return R.list.find((x: any) => x !== r && x.saying && Math.hypot(x.pos.x - r.pos.x, x.pos.z - r.pos.z) < 20) ?? null;
  };
  // The subtitle (viewer design v2 §4): while someone speaks the band steps back, and at the bottom centre — who speaks,
  // the line in the island's letters, its meaning (broken after its first sentence when long). Instead of the bubbles.
  const sub = $('.sub');
  let subKey = '';
  function subtitle(R: any, r: any) {
    const sp = r ? speaker(R, r) : null, key = sp ? `${sp.id}|${sp.saying}` : '';
    if (key === subKey) return; subKey = key;
    if (!sp) { sub.classList.add('off'); if (r) band.classList.remove('off'); return; }
    const said = en ? sp.sayEn ?? '' : sp.saying;   // (in English, its own English line: none, and only the island's letters show)
    const cap = capEn ? sp.sayEn ?? '' : sp.saying;
    if (cap) captions.send(`${nameIn(sp, capEn)}: ${cap}`, ctx.clockMs());
    band.classList.add('off');
    const fill = () => {
      ($('.sub .who .line')).style.setProperty('--c', sp.sp?.color ?? '#fff');
      $('.sub .who .name').textContent = nameOf(sp);
      $('.sub .isl-line').innerHTML = sp.sayIsl?.length ? glyphs(sp.sayIsl, 'isl', 1.25) : '';
      $('.sub .tr').innerHTML = said ? subtitleLines(said, en ? 'en' : 'ja').map((l) => `<span>${esc(l)}</span>`).join('') : '';
      sub.classList.remove('off');
    };
    if (sub.classList.contains('off')) fill(); else { sub.classList.add('off'); setTimeout(() => { if (subKey === key) fill(); }, 600); }
  }

  const director = makeDirector({ residents: ctx.residents, watched: ctx.watched, watch: ctx.watch, cam: ctx.cam, speaking: () => !!subKey });
  function update(dt: number) {
    const R = ctx.residents();
    if (!R) return;
    director.tick(dt);   // (whom the drone follows: director.ts)
    const r = ctx.watched();
    subtitle(R, r);   // (every frame: a line begins and ends with the voice)
    if ((tick -= dt) > 0) return; tick = 1;   // (the words read once a second)
    $('.when .date').textContent = dateOf(ctx.clockMs());
    $('.when .time').textContent = localTimeString(ctx.clockMs(), ctx.tz());
    chapterLine(R);
    if (!r) { band.classList.add('off'); return; }
    trialLine(r);
    const text = trimStatus(R.status(r) as string);   // (as it is shown: the metres still to go taken out, or the line would fade out and back with the same words each time they change — science, #121)
    if (r.id !== shownFor) {   // (another one followed: the band fades out, changes, fades in)
      band.classList.add('off'); shownFor = r.id; shownText = text; swapT = 0.6;
      setTimeout(() => { show(r, text); if (!subKey) band.classList.remove('off'); }, 600);
    } else if (text !== shownText && (swapT -= 1) <= 0) {   // (its doing changed: the line alone fades and changes)
      shownText = text; status.classList.add('off');
      setTimeout(() => { show(r, text); status.classList.remove('off'); }, 600);
    }
  }
  // The trial line under the status (PROGRAM.md §1-2, R-030): what the one followed is trying, in its own words, while a
  // goal of its own lasts (never its habits); for 12 s after a result, how its last try came out, in the words that try
  // was shown in — 確かめた, 違っていた, やりとげた (only as the world checked it), まだ届かない, やってみた (its steps
  // taken, nothing to check), うまくいかなかった ・ the world's reason — then what it is trying now, or nothing until
  // it decides. Its words only: none that fail the rule (residents.ts trialWords), and none on the English screen until
  // there are English words. Two lines at most (live.css).
  const TRIAL_K: Record<string, [string, string, boolean]> = { confirmed: ['確かめた', 'Confirmed', true], refuted: ['違っていた', 'Not so', false], done: ['やりとげた', 'Done', true], 'not-yet': ['まだ届かない', 'Not there yet', false], 'steps-done': ['やってみた', 'Tried it', false], failed: ['うまくいかなかった', "Didn't work", false] };
  let trialShown = '';
  function trialLine(r: any) {
    const d = r?.tried, fresh = !!d?.text && ctx.clockMs() - d.at < 12e3, t = r?.trial;
    const k = fresh ? TRIAL_K[d.result] : t?.active ? (['試み', 'Trying', true] as [string, string, boolean]) : null;
    const head = k ? `${k[0]}${fresh && d.result === 'failed' && d.outcome ? ` ・ ${d.outcome}` : ''}` : '';
    const words = (fresh ? d.text : t?.active ? t.text : '') ?? '';
    const key = k && words && !en ? `${r.id}|${head}|${words}` : '';
    if (key === trialShown) return; trialShown = key;
    if (!key) { trialEl.classList.add('off'); return; }
    $('.band .trial .k').textContent = head; trialEl.classList.toggle('gold', k![2]);
    $('.band .trial .t').textContent = words;
    trialEl.classList.remove('off');
  }
  // The chapter at the top left (PROGRAM.md §2-1, plan B — CHAPTER1_END.md §4): its name and day, the way (done in sea
  // green, the next underlined in sand, the rest faint), what was brought in four words (sand when nearly gone or gone);
  // a word changed is swapped over 0.6 s. Its cards: the start (the question) when the first load has just come, the end
  // when the south island's load is on the shelf — each once (kept in this browser), and only as it happens, not on
  // opening the page later. After the end the block stays two minutes, then goes until chapter 2 has its words.
  const chap = $('.chap'), shownPart: Record<string, string> = {}, sep = `<span class="sep">${en ? '·' : '・'}</span>`;
  const once = (k: string) => { try { if (localStorage.getItem(k)) return false; localStorage.setItem(k, '1'); } catch { /* the card all the same */ } return true; };
  const swap = (sel: string, html: string) => {
    if (shownPart[sel] === html) return; const el = $(sel), first = shownPart[sel] === undefined; shownPart[sel] = html;
    if (first) { el.innerHTML = html; return; }
    el.classList.add('off'); setTimeout(() => { if (shownPart[sel] === html) { el.innerHTML = html; el.classList.remove('off'); } }, 600);
  };
  function chapterLine(R: any) {
    const c = R.village ? chapter1(R.village) : null, now = ctx.clockMs();
    if (!c || (c.ended !== null && now - c.ended > 120e3)) { chap.classList.add('off'); return; }
    if (now - c.began < 5 * 60e3 && once(`seaglass.chapter1:${c.began}:start`)) { const k = startCard(en); queue.push({ head: k.head, text: esc(k.what), at: c.began }); }
    if (c.ended !== null && now - c.ended < 5 * 60e3 && once(`seaglass.chapter1:${c.began}:end`)) { const k = endCard(c, en); queue.push({ head: k.head, text: esc(k.what), at: c.ended }); }
    // (what was brought run out: a world's event in the milestone's card, not the chapter's end — D33)
    for (const m of ['clay', 'bamboo'] as const) { const at = c.gone[m]; if (at !== null && at > 0 && now - at < 5 * 60e3 && once(`seaglass.chapter1:${c.began}:${m}-gone`)) queue.push({ text: esc(goneCard(m, en).what), at }); }
    const v = chapterView(c, now, ctx.tz(), en);
    $('.chap .no').textContent = v.no; $('.chap .nm').textContent = v.name; $('.chap .dy').textContent = v.day;
    swap('.chap .way', v.way.map((x) => `<span class="${x.k}">${esc(x.w)}</span>`).join(sep));
    swap('.chap .cargo', v.cargo ? `${esc(v.cargo.label)}${v.cargo.items.map((x) => `<span class="lv${x.low ? ' low' : ''}">${esc(x.w)}</span>`).join(sep)}` : '');
    chap.classList.remove('off');
  }
  // The haze under each group of words (src/live/scrim.ts): once a second, right after the frame is drawn, the picture
  // shrunk to 64 × 36; the bright tenth of what lies behind each group sets its haze, eased over a second (CSS).
  const SW = 64, SH = 36, shrink = document.createElement('canvas'); shrink.width = SW; shrink.height = SH;
  const sctx = shrink.getContext('2d', { willReadFrequently: true })!;
  const groups = ['.brand', '.when', '.chap', '.band', '.sub', '.card'].map((sel) => { const el = $(sel), haze = document.createElement('div'); haze.className = 'haze'; root.insertBefore(haze, root.firstChild); return { el, haze, h: 0 }; });
  let sampleAt = 0;
  function sample(canvas: HTMLCanvasElement) {
    const now = performance.now(); if (now - sampleAt < 1000) return; sampleAt = now;
    try { sctx.drawImage(canvas, 0, 0, SW, SH); } catch (e) { return; }
    const px = sctx.getImageData(0, 0, SW, SH).data, sx = SW / innerWidth, sy = SH / innerHeight;
    for (const g of groups) {
      const r = g.el.getBoundingClientRect(), shown = r.width > 0 && !g.el.classList.contains('off');
      const pad = innerHeight / 1080 * 28, x0 = Math.max(r.left - pad * 1.5, r.left - (innerWidth - r.right)), y0 = r.top - pad, w = Math.min(r.width + pad * 3, innerWidth - x0), hh = r.height + pad * 2;   // (never past the screen's edge)
      Object.assign(g.haze.style, { left: `${x0}px`, top: `${y0}px`, width: `${w}px`, height: `${hh}px` });
      const lum: number[] = [];
      for (let y = Math.max(0, Math.floor(r.top * sy)); y <= Math.min(SH - 1, Math.floor(r.bottom * sy)); y++)
        for (let x = Math.max(0, Math.floor(r.left * sx)); x <= Math.min(SW - 1, Math.floor(r.right * sx)); x++) { const i = (y * SW + x) * 4; lum.push(luminance(px[i], px[i + 1], px[i + 2])); }
      g.h = shown ? hazeFor(brightTenth(lum)) : 0;
      const st = hazeStyle(g.h), u = innerHeight / 1080;
      g.haze.style.setProperty('--black', st.black.toFixed(3));
      g.haze.style.setProperty('--bright', st.bright.toFixed(3));
      g.haze.style.setProperty('--blur', `${(st.blurPx * u).toFixed(2)}px`);
    }
  }
  /** For the stream's log (the test week): how hazy each group is now, 0–1. */
  const haze = () => Object.fromEntries(groups.map((g, i) => [['brand', 'when', 'chap', 'band', 'sub', 'card'][i], +g.h.toFixed(3)]));

  // The milestone card (viewer design v2 §4): when the world marks an event the first of its kind on the island, at the
  // upper centre between two gold hair lines — "島で初めて", the event's own sentence (to its first 。), the island's
  // date and time — for about eight seconds, then it fades. Several at once wait their turn. The chapter's own cards
  // (its start and end) take the same place with their own heading.
  const card = $('.card'), queue: { head?: string; text: string; at: number }[] = [];
  let cardT = 0;
  function event(kind: string, text: string, r: any, meta?: { milestone?: string; trial?: { kind: string; result?: string; text: string | null } }) {
    director.event(kind, text, r, meta);   // (ranked for the drone)
    // (a trial begun or come out, with words to show: rank 1 — not its steps taken with nothing to check, which may be many:
    // on one already followed, only the heading changes, PROGRAM.md §4)
    if (meta?.trial?.text && meta.trial.result !== 'steps-done') director.trial(r, meta.trial.result ?? 'start', meta.trial.text);
    if (!meta?.milestone) return;
    const ja = trimStatus(text.split('。')[0]), esc1 = (t: string) => t.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));
    const html = en ? firstEn(meta.milestone, r?.v?.name ?? '', true) : esc1(ja);
    if (html) queue.push({ text: html, at: ctx.clockMs() });   // (a first the English table does not have: no card rather than one in the wrong tongue)
    const cap = capEn ? firstEn(meta.milestone, r?.v?.name ?? '') : ja;
    if (cap) captions.send(`${capEn ? FIXED_EN.first : '島で初めて'}: ${cap}`, ctx.clockMs());
  }
  function cardTick(dt: number) {
    if (cardT > 0) { cardT -= dt; if (cardT <= 0) card.classList.add('off'); return; }
    if (cardT > -0.8) { cardT -= dt; return; }   // (a breath between two cards)
    const m = queue.shift(); if (!m) return;
    $('.card .head').textContent = m.head ?? (en ? FIXED_EN.first : '島で初めて');
    $('.card .what').innerHTML = m.text;   // (escaped as it was made: only an island's word in italics)
    $('.card .at').innerHTML = `${esc(dateOf(m.at))} <span class="t">${localTimeString(m.at, ctx.tz())}</span>`;
    card.classList.remove('off'); cardT = 8;
  }

  /** A try's result, for the trials' screen (PROGRAM.md §1): the drone goes to the one whose try it was (rank 1). */
  const trial = (r: any, outcome: string, text: string) => director.trial(r, outcome, text);
  return { update: (dt: number) => { update(dt); cardTick(dt); }, sample, haze, event, trial };
}
