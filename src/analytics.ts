// Google Analytics 4: only on the public site (never local builds, previews, ?debug sessions or the ?lab test panel), and only
// what the app itself reports — which sea, what was looked at, what was seen. Nothing typed is ever sent.
const ID = 'G-LFRNWDFS1T';
const on = typeof location !== 'undefined' && /(^|\.)utsushiyo\.earth$/.test(location.hostname) && !location.search.includes('debug') && !/[?&]lab\b/.test(location.search);   // (nor the test panel)
type Gtag = (...a: unknown[]) => void;
let gtag: Gtag | null = null;

export function initAnalytics() {
  if (!on || gtag) return;
  const w = window as unknown as { dataLayer: unknown[]; gtag: Gtag };
  w.dataLayer = w.dataLayer || [];
  // (gtag.js reads the arguments objects themselves off the queue)
  w.gtag = function () { w.dataLayer.push(arguments); }; gtag = w.gtag;
  gtag('js', new Date()); gtag('config', ID);
  const s = document.createElement('script'); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${ID}`;
  document.head.appendChild(s);
}
export function track(name: string, params: Record<string, string | number | boolean> = {}) {
  if (!gtag) return;
  try { gtag('event', name, params); } catch (e) { /* never let measuring get in the way */ }
}
