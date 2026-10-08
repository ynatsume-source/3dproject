// Browser check: every shader of a sea compiles. Loading a sea prepares every material in it (main.ts prepareShaders),
// so a shader that fails to compile shows on the console as a THREE.WebGLProgram error — this opens each sea in
// Chromium (software GL) and fails on any. Headless checks never compile GLSL; a redeclared variable in the land
// shader (2026-10-07) reached the site that way.
// Usage: node scripts/shader-check.mjs [--all] [--tier low|high|both]   (default: the island, Kayama and the reef; both tiers)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); }

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ALL = ['planet', 'pointlobos', 'gbr', 'miyako', 'maldives', 'pacific', 'kayama', 'redsea', 'galapagos', 'carnatic'];
const seas = args.includes('--all') ? ALL : ['planet', 'kayama', 'gbr'];
const tiers = { low: ['low'], high: ['high'], both: ['low', 'high'] }[arg('--tier', 'both')];
const port = 5300 + Math.floor(Math.random() * 400);
const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
const stop = () => { try { vite.kill('SIGTERM'); } catch { /* gone */ } };
process.on('exit', stop);
await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('vite did not start')), 60000); vite.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); ok(); } }); });

const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const tier of tiers) for (const sea of seas) {
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } }), p = await ctx.newPage(), errs = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && /WebGLProgram|Shader Error|VALIDATE_STATUS|Program Info Log/.test(t)) errs.push(t.split('\n').filter((l) => /ERROR|Material Type|^> /.test(l.trim()) || /^>/.test(l)).slice(0, 8).join(' | ')); });
  p.on('pageerror', (e) => errs.push('page: ' + e.message));
  const t0 = Date.now();
  let loaded = true;
  try {
    await p.goto(`http://127.0.0.1:${port}/?debug&nopost&nopip&tier=${tier}#${sea}`, { timeout: 240000, waitUntil: 'commit' });
    await p.waitForFunction(() => !!window.seaglass?.cur?.loc, null, { timeout: 300000 });
    await p.waitForTimeout(6000);   // (a few frames drawn: what is first drawn compiles then)
  } catch (e) { loaded = false; errs.push('did not load: ' + e.message.split('\n')[0]); }
  const ok = loaded && !errs.length; if (!ok) bad++;
  console.log(`${sea} (${tier}): ${ok ? 'ok' : 'FAIL'} ${((Date.now() - t0) / 1000).toFixed(0)} s${errs.length ? '\n  ' + [...new Set(errs)].slice(0, 5).join('\n  ') : ''}`);
  await ctx.close();
}
await b.close(); stop();
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
