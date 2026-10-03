// Quiet hints: now and then, as time goes by in the sea, one small line beside one control — "time of day and
// season can be changed here" — in the captions' own hand, for a few seconds, then gone. No tour, no
// overlay: each is shown once per device (the sound one on the first few visits), only while the HUD is up
// and nothing else is open, never two at once, and not at all for something already used.
const CSS = `
#hintTip { position: fixed; z-index: 7; max-width: min(220px, 60vw); padding: 6px 11px 7px; border-radius: 10px; pointer-events: none;
  background: rgba(4, 22, 30, 0.5); border: 1px solid rgba(214, 238, 233, 0.12); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  color: rgba(214, 238, 233, 0.86); font-size: 11.5px; line-height: 1.55; letter-spacing: .05em; opacity: 0; transform: translateY(4px);
  transition: opacity 1.2s ease, transform 1.2s ease; }
#hintTip.on { opacity: 1; transform: none; }
#hintTip::after { content: ''; position: absolute; width: 7px; height: 7px; background: inherit; border: inherit; border-width: 0 1px 1px 0; }
#hintTip.left::after { right: -4.5px; top: calc(50% - 4px); transform: rotate(-45deg); }
#hintTip.above::after { bottom: -4.5px; left: calc(var(--ax, 50%) - 4px); transform: rotate(45deg); }
.hinted { animation: hintGlow 2.6s ease-in-out 2; }
@keyframes hintGlow { 50% { box-shadow: 0 0 0 1px rgba(160, 240, 225, 0.45), 0 0 16px rgba(120, 240, 220, 0.28); } }
@media (prefers-reduced-motion: reduce) { .hinted { animation: none; } #hintTip { transition: opacity .6s; transform: none; } }
`;

export interface HintDef {
  id: string;
  at: number;                       // seconds of looking (in the sea, the HUD up) before it may show
  target: string;                   // the control it is about (#id)
  text: string;
  times?: number;                   // shown on this many visits (default once)
  stay?: number;                    // seconds on screen (default 8)
  when?: () => boolean;             // only now (e.g. the sound still off)
}

export function makeHints(defs: HintDef[], ready: () => boolean) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const tip = document.createElement('div'); tip.id = 'hintTip'; tip.setAttribute('role', 'status'); document.body.appendChild(tip);
  const load = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem('seaglass.hints') || '{}'); } catch (e) { return {}; } };
  const save = () => { try { localStorage.setItem('seaglass.hints', JSON.stringify(seen)); } catch (e) { /* ignore */ } };
  const seen = load();                // id → times shown (99: used, never again)
  let t = 0, gap = 0, showing: { d: HintDef; el: HTMLElement; left: number } | null = null;

  // using a control is better than any hint about it: that one is never shown
  for (const d of defs) document.querySelector(d.target)?.addEventListener('click', () => { used(d.id); });
  function used(id: string) {
    seen[id] = 99; save();
    if (showing?.d.id === id) hide();
  }
  function hide() {
    if (!showing) return;
    tip.classList.remove('on'); showing.el.classList.remove('hinted'); showing = null; gap = 18;
  }
  function place(el: HTMLElement) {
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.classList.remove('left', 'above');
    if (r.left > innerWidth * 0.75) {   // a button down the right side: beside it, to its left
      tip.classList.add('left');
      tip.style.left = `${Math.max(8, r.left - w - 12)}px`; tip.style.top = `${Math.min(innerHeight - h - 8, Math.max(8, r.top + r.height / 2 - h / 2))}px`;
    } else {                            // one on the bar: above it
      tip.classList.add('above');
      const x = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
      // (over the caption when one is up there, never across its words: the glow on the button says which it means)
      let top = r.top - h - 12;
      const cap = document.querySelector('#caption.on') as HTMLElement | null;
      if (cap) { const c = cap.getBoundingClientRect(); if (c.width && x < c.right && x + w > c.left && top + h > c.top && top < c.bottom) top = c.top - h - 8; }
      tip.style.left = `${x}px`; tip.style.top = `${Math.max(8, top)}px`;
      tip.style.setProperty('--ax', `${Math.min(w - 10, Math.max(10, r.left + r.width / 2 - x))}px`);
    }
  }
  const visible = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
    for (let e: HTMLElement | null = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.3) return false; }
    return true;
  };

  return {
    used,
    advance(sec: number) { t += sec; gap = 0; },   // (checking only: as if that much longer had been spent)
    update(dt: number) {
      if (!ready()) { if (showing) hide(); return; }
      t += dt;
      if (showing) {
        showing.left -= dt;
        if (showing.left <= 0 || !visible(showing.el)) hide(); else place(showing.el);
        return;
      }
      if ((gap -= dt) > 0) return;
      for (const d of defs) {
        if (t < d.at || (seen[d.id] ?? 0) >= (d.times ?? 1) || (d.when && !d.when())) continue;
        const el = document.querySelector(d.target) as HTMLElement | null;
        if (!el || !visible(el)) continue;
        tip.textContent = d.text; place(el);
        requestAnimationFrame(() => tip.classList.add('on'));
        el.classList.remove('hinted'); void el.offsetWidth; el.classList.add('hinted');
        showing = { d, el, left: d.stay ?? 8 };
        seen[d.id] = (seen[d.id] ?? 0) + 1; save();
        break;
      }
    },
  };
}
