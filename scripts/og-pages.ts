// After the build: one small page per sea at /<sea>/, so a link shared on SNS shows that sea's own card
// (title, description, picture). Crawlers read these tags without running scripts; a person is sent on
// to the app at once, with any conditions in the link kept (/miyako/?time=15:00 → /?time=15:00#miyako).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { LOCATIONS } from '../src/data/locations';

const SITE = 'https://utsushiyo.earth';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
for (const l of LOCATIONS) {
  const title = `${l.name}・${l.site} — ウツシヨ`;
  const desc = l.blurb.replace(/\s+/g, ' ').slice(0, 110) + (l.blurb.length > 110 ? '…' : '');
  const img = existsSync(`public/og/${l.id}.jpg`) ? `${SITE}/og/${l.id}.jpg` : `${SITE}/og/miyako.jpg`;
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="ウツシヨ Utsushiyo">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/${l.id}/"><meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${img}">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#03161d">
<script>location.replace('../' + location.search + '#${l.id}');</script>
</head><body style="background:#03161d;color:#cfe">
<noscript><a href="../#${l.id}" style="color:#9de">${esc(title)}</a></noscript>
</body></html>
`;
  mkdirSync(`dist/${l.id}`, { recursive: true });
  writeFileSync(`dist/${l.id}/index.html`, html);
}
console.log('og pages:', LOCATIONS.map((l) => l.id).join(', '));
