// The test panel (?lab): the app's scenes, conditions and camera within reach of a few buttons, for checking
// on a real device what is otherwise a long wait — a rare scene, a leap, the dark, another tier — and a
// "repro" that copies a link to the same conditions with what was pressed, the device, and how it ran.
// Loaded only with ?lab (the page is then noindex, and no analytics are sent). It never touches saves or the
// world's record: what it starts is what the app itself would start, only sooner.
import type * as THREE from 'three';
import type { Preset } from '../time/clock';
import type { Tier } from '../quality';
import type { WxKind } from './share';

export interface LabApi {
  sea(): { id: string; name: string } | null;
  seas: { id: string; name: string }[];
  dive(id: string): Promise<void>;
  rare(): { id: string; ja: string; w: number }[];
  startRare(id: string): boolean;
  breach(kind: 'whale' | 'manta'): boolean;
  flyfish(): boolean;
  bait(): void;
  seal(): boolean;
  meteors(): void;
  preset(p: Preset): void;
  season(k: 'now' | 'spring' | 'summer' | 'autumn' | 'winter'): void;
  speed(k: number): void;
  live(): void;
  weather(k: WxKind | null): void;
  mode(m: 'auto' | 'manual'): void;
  sky(on: boolean): void;
  hud(on: boolean): void;
  guide(): { id: string; ja: string }[];
  goTo(id: string): void;
  tier(): Tier;
  setTier(t: Tier): void;
  renderer: THREE.WebGLRenderer;
  state(): Record<string, string | number>;
  reproUrl(): string;
}

const CSS = `
#lab { position: fixed; z-index: 30; left: calc(8px + env(safe-area-inset-left, 0px)); top: calc(76px + env(safe-area-inset-top, 0px)); font: 12px/1.35 system-ui, sans-serif; color: #e6f4f2; }
#lab > button.tg { border: 1px solid rgba(255, 200, 120, .6); background: rgba(40, 24, 8, .78); color: #ffd9a0; border-radius: 8px; padding: 6px 10px; font: 600 11px/1 ui-monospace, monospace; letter-spacing: .1em; touch-action: manipulation; }
#lab .pn { margin-top: 6px; width: min(340px, calc(100vw - 16px)); max-height: min(70dvh, calc(100dvh - 140px)); overflow-y: auto; overscroll-behavior: contain;
  background: rgba(6, 18, 24, .92); border: 1px solid rgba(255, 200, 120, .35); border-radius: 10px; padding: 8px 10px 10px; }
#lab .pn[hidden] { display: none; }
#lab h4 { margin: 10px 0 4px; font: 600 10px/1 ui-monospace, monospace; letter-spacing: .14em; color: #ffd9a0; }
#lab h4:first-child { margin-top: 2px; }
#lab .row { display: flex; flex-wrap: wrap; gap: 4px; }
#lab .row button, #lab select { border: 1px solid rgba(255, 255, 255, .16); background: rgba(255, 255, 255, .06); color: #e6f4f2; border-radius: 6px; padding: 6px 8px; font: 12px/1 system-ui, sans-serif; touch-action: manipulation; }
#lab .row button.dim { opacity: .55; }
#lab .row button:active { background: rgba(255, 200, 120, .3); }
#lab select { max-width: 100%; }
#lab .st { font: 10.5px/1.5 ui-monospace, monospace; color: #bfe3dc; white-space: pre-wrap; margin: 0; }
#lab .lg { font: 10.5px/1.5 ui-monospace, monospace; color: #9fb8b3; max-height: 7.5em; overflow-y: auto; white-space: pre-wrap; margin: 4px 0 0; }
#lab .ok { color: #9ff0c0; } #lab .ng { color: #ffb0a0; }
`;

export function mountLab(api: LabApi) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'lab';
  root.innerHTML = `<button class="tg" type="button">LAB</button><div class="pn" hidden></div>`;
  document.body.appendChild(root);
  const tg = root.querySelector('.tg') as HTMLButtonElement, pn = root.querySelector('.pn') as HTMLDivElement;
  let open = false;
  try { open = localStorage.getItem('seaglass.lab') === '1'; } catch (e) { /* storage unavailable */ }
  const setOpen = (on: boolean) => { open = on; pn.hidden = !on; try { localStorage.setItem('seaglass.lab', on ? '1' : '0'); } catch (e) { /* ignore */ } if (on) render(); };
  tg.onclick = () => setOpen(!open);
  // (taps on the panel are the panel's: they must not also turn the view or pick an animal underneath)
  for (const ev of ['pointerdown', 'pointermove', 'wheel'] as const) root.addEventListener(ev, (e) => e.stopPropagation());

  // what was pressed, for the repro
  const log: string[] = [];
  const t0 = performance.now();
  const note = (what: string, ok = true) => {
    log.push(`${((performance.now() - t0) / 1000).toFixed(1).padStart(6)}s ${ok ? '' : '✗ '}${what}`);
    if (log.length > 60) log.shift();
    const el = pn.querySelector('.lg'); if (el) { el.textContent = log.join('\n'); el.scrollTop = 1e6; }
  };
  const act = (what: string, fn: () => boolean | void) => () => {
    let ok = true;
    try { ok = fn() !== false; } catch (e) { ok = false; console.error(e); }
    note(what, ok);
  };

  const b = (label: string, what: string, fn: () => boolean | void, dim = false) => {
    const el = document.createElement('button'); el.type = 'button'; el.textContent = label; if (dim) el.className = 'dim';
    el.onclick = act(what, fn); return el;
  };
  const row = (...els: HTMLElement[]) => { const r = document.createElement('div'); r.className = 'row'; r.append(...els); return r; };
  const h = (t: string) => { const e = document.createElement('h4'); e.textContent = t; return e; };

  let shownSea = '';
  function render() {
    pn.textContent = '';
    const sea = api.sea(); shownSea = sea?.id ?? '';
    // the seas
    pn.append(h('海'));
    const sel = document.createElement('select');
    sel.innerHTML = api.seas.map((s) => `<option value="${s.id}"${sea?.id === s.id ? ' selected' : ''}>${s.name}</option>`).join('');
    sel.onchange = () => act(`海: ${sel.value}`, () => { api.dive(sel.value).then(() => render()); })();
    pn.append(row(sel));
    if (!sea) { pn.append(h('（地球儀にいます。海を選んでください）')); return; }

    // scenes: the rare ones (dim: not something this sea or this hour would bring by itself)
    pn.append(h('レアな場面（灰色：いまこの海では自然には起きない）'));
    pn.append(row(...api.rare().map((r) => b(r.ja, `レア: ${r.id}`, () => api.startRare(r.id), r.w <= 0))));
    pn.append(h('できごと'));
    pn.append(row(
      b('クジラのジャンプ', 'ジャンプ: whale（近くに深い所がないと起きない）', () => api.breach('whale')),
      b('マンタのジャンプ', 'ジャンプ: manta（近くに深い所がないと起きない）', () => api.breach('manta')),
      b('トビウオ', 'トビウオ', () => api.flyfish()),
      b('ベイトボール', 'ベイトボール', () => api.bait()),
      b('アザラシ', 'アザラシの来訪', () => api.seal()),
      b('流星', '流星', () => api.meteors()),
    ));

    // conditions
    pn.append(h('時刻・季節・天気'));
    pn.append(row(
      b('夜明け', '時刻: dawn', () => api.preset('dawn')), b('昼', '時刻: noon', () => api.preset('noon')),
      b('夕方', '時刻: dusk', () => api.preset('dusk')), b('夜', '時刻: night', () => api.preset('night')),
      b('実時間', '実時間', () => api.live()),
    ));
    pn.append(row(
      b('春', '季節: spring', () => api.season('spring')), b('夏', '季節: summer', () => api.season('summer')),
      b('秋', '季節: autumn', () => api.season('autumn')), b('冬', '季節: winter', () => api.season('winter')),
      b('今', '季節: now', () => api.season('now')),
    ));
    pn.append(row(...[1, 10, 60, 360].map((k) => b(`×${k}`, `早回し ×${k}`, () => api.speed(k)))));
    pn.append(row(
      b('晴れ', '天気: clear', () => api.weather('clear')), b('くもり', '天気: cloudy', () => api.weather('cloudy')),
      b('雨', '天気: rain', () => api.weather('rain')), b('雷雨', '天気: storm', () => api.weather('storm')),
      b('実天気', '天気: live', () => api.weather(null)),
    ));

    // the camera
    pn.append(h('カメラ'));
    pn.append(row(
      b('自動巡航', 'カメラ: auto', () => api.mode('auto')), b('手動', 'カメラ: manual', () => api.mode('manual')),
      b('空へ', '空へ', () => api.sky(true)), b('水中へ', '水中へ', () => api.sky(false)),
      b('HUD隠す', 'HUD off', () => api.hud(false)), b('HUD出す', 'HUD on', () => api.hud(true)),
    ));
    const gsel = document.createElement('select');
    gsel.innerHTML = `<option value="">生き物・場所へ行く…</option>` + api.guide().map((g) => `<option value="${g.id}">${g.ja}</option>`).join('');
    gsel.onchange = () => { const id = gsel.value; if (!id) return; act(`見に行く: ${id}`, () => api.goTo(id))(); gsel.value = ''; };
    pn.append(row(gsel));

    // the device
    pn.append(h('画質・状態'));
    pn.append(row(...(['low', 'lite', 'medium', 'high', 'ultra'] as Tier[]).map((t) => b({ low: '最軽量', lite: 'バランス', medium: '標準', high: '高画質', ultra: '最高' }[t], `画質: ${t}`, () => api.setTier(t)))));
    const stEl = document.createElement('pre'); stEl.className = 'st'; pn.append(stEl);
    pn.append(h('再現'));
    const copy = b('再現情報をコピー', 'コピー', () => { copyRepro(); });
    pn.append(row(copy));
    const lg = document.createElement('pre'); lg.className = 'lg'; lg.textContent = log.join('\n'); pn.append(lg);
  }

  // how it is running: frame rate over the last second (and the slowest frame), draw calls, triangles
  let frames = 0, worst = 0, last = performance.now(), fps = 0, slow = 0;
  const tick = (now: number) => {
    frames++; worst = Math.max(worst, now - last); last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setInterval(() => {
    fps = frames; slow = worst; frames = 0; worst = 0;
    if (!open) return;
    // (arrived in a sea, or moved to another: its own scenes and creatures)
    const sid = api.sea()?.id ?? '';
    if (sid !== shownSea) render();
    const el = pn.querySelector('.st'); if (!el) return;
    const inf = api.renderer.info.render, s = api.state();
    el.textContent = `${fps} fps（最も遅いフレーム ${slow.toFixed(0)} ms） 画質 ${api.tier()}  dpr ${devicePixelRatio}\n`
      + `描画 ${inf.calls} 回 / ${(inf.triangles / 1e3).toFixed(0)}k 三角形\n`
      + Object.entries(s).map(([k, v]) => `${k} ${v}`).join('  ');
  }, 1000);

  async function copyRepro() {
    const inf = api.renderer.info.render, s = api.state();
    const text = [
      `再現リンク: ${api.reproUrl()}`,
      `端末: ${navigator.userAgent}`,
      `画面: ${innerWidth}×${innerHeight} dpr ${devicePixelRatio}  画質 ${api.tier()}  ${fps} fps（最遅 ${slow.toFixed(0)} ms）  描画 ${inf.calls} 回 / ${(inf.triangles / 1e3).toFixed(0)}k`,
      `状態: ${Object.entries(s).map(([k, v]) => `${k}=${v}`).join(' ')}`,
      `操作:`, ...log,
    ].join('\n');
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { /* (no clipboard: shown below) */ }
    if (!ok) { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;inset:10% 5%;z-index:40;font:11px monospace'; ta.onblur = () => ta.remove(); document.body.appendChild(ta); ta.select(); }
    const btn = [...pn.querySelectorAll('button')].find((x) => x.textContent?.startsWith('再現情報')); if (btn) { btn.textContent = ok ? 'コピーしました' : '下の文字を選んでコピー'; setTimeout(() => { btn.textContent = '再現情報をコピー'; }, 2500); }
  }

  if (open) setOpen(true);
  return { refresh: () => { if (open) render(); } };
}
