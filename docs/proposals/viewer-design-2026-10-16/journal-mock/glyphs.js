// The island's letters for the mock pages (as src/robots/islandlang.ts draws them). On the real pages these would be
// written into the HTML when the pages are built, so the pages need no script.
(() => {
  const BASE = { '': '<circle cx="5" cy="8" r="3"/>', p: '<path d="M5 3V13"/>', t: '<path d="M2 3H8M5 3V13"/>', k: '<path d="M8 3L2 8L8 13"/>', m: '<path d="M2 13V7Q5 1 8 7V13"/>', n: '<path d="M1.5 8Q3.25 4.5 5 8T8.5 8"/>', s: '<path d="M8 3L2 13"/>', h: '<path d="M3 3V13M7 3V13"/>', l: '<path d="M6 3V11Q6 13 3.5 13"/>', w: '<path d="M2 3L5 13L8 3"/>' };
  const MARK = { a: '', i: '<circle cx="5" cy="1" r="0.9" class="f"/>', u: '<circle cx="5" cy="15.2" r="0.9" class="f"/>', e: '<path d="M11 6V10"/>', o: '<circle cx="11" cy="8" r="1.3"/>' };
  const glyphs = (w) => { let x = 0; const parts = []; for (const [, c, v] of w.matchAll(/([ptkmnshlw]?)([aiueo])/g)) { parts.push(`<g transform="translate(${x} 0)">${BASE[c]}${MARK[v]}</g>`); x += 12; }
    return `<svg viewBox="-1 -1 ${x + 2} 18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><style>.f{fill:currentColor;stroke:none}</style>${parts.join('')}</svg>`; };
  for (const e of document.querySelectorAll('.who[data-w]')) e.innerHTML = `${glyphs(e.dataset.w)}<span>${e.textContent}</span><span class="c" style="background:${e.dataset.c}"></span>`;
})();
