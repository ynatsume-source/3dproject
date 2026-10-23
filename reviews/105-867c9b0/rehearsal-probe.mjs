import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); }
const url = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await p.goto(url, { waitUntil: 'load' });
await p.waitForTimeout(+(process.env.WAIT ?? 90000));
const corner = await p.evaluate(() => [...document.querySelectorAll('div')].map((d) => d.textContent).find((t) => /^JST \d\d:\d\d:\d\d$/.test(t ?? '')) ?? null);
const text = await p.evaluate(async () => (window).seaglassRehearsal ? await (window).seaglassRehearsal.text() : null);
await b.close(); (await import('node:fs')).writeFileSync(process.env.OUT ?? '/dev/null', text ?? '');
const rows = (text ?? '').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const by = {}; for (const r of rows) by[r.t] = (by[r.t] ?? 0) + 1;
console.log(JSON.stringify({ corner, rows: rows.length, byType: by, sample: Object.fromEntries(Object.keys(by).map((t) => [t, rows.find((r) => r.t === t)])), pageErrors: errs }, null, 1));
