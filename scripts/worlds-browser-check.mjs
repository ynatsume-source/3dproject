// Real-app regression check for Earth Kayama and the resident planet. This is separate from the headless suite.
// Run after npm run build. BROWSER_CHECK_URL can select an already running app instead of starting Vite preview.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/worlds-browser-check.mjs [--out DIR] [--timeout-ms N]\n' +
    'Env: BROWSER_CHECK_URL, CHROMIUM (or CHROME), PLAYWRIGHT_MODULE\n' +
    'Default: low tier, local Vite preview on port 5317; JSON and screenshots in check-results/worlds-browser.');
  process.exit(0);
}
const arg = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const timeout = Number(arg('--timeout-ms', '600000'));
assert(Number.isFinite(timeout) && timeout > 0, '--timeout-ms must be positive');
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(arg('--out', path.join(root, 'check-results/worlds-browser')));
fs.mkdirSync(out, { recursive: true });
const report = { started: new Date().toISOString(), status: 'running', steps: [], failures: [], diagnostics: [] };
const marker = `codex-worlds-browser-${Date.now()}`;
let browser, server, appReady = false;
const stopServer = () => { if (server && server.exitCode === null && !server.killed) server.kill('SIGTERM'); };
process.on('exit', stopServer);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  stopServer();
  if (browser) await browser.close().catch(() => {});
  process.exit(130);
});

async function playwright() {
  let module;
  try { module = await import('playwright'); }
  catch (error) {
    if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Playwright is unavailable; install it or set PLAYWRIGHT_MODULE.', { cause: error });
    module = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
  }
  const chromium = module.chromium ?? module.default?.chromium;
  assert(chromium, 'The Playwright module does not export chromium');
  return { chromium };
}

async function appUrl() {
  if (process.env.BROWSER_CHECK_URL) return new URL(process.env.BROWSER_CHECK_URL);
  assert(fs.existsSync(path.join(root, 'dist/index.html')), 'dist/index.html is missing; run npm run build first');
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5317', '--strictPort'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Vite preview did not start within 30 seconds')), 30000);
    const ready = (data) => {
      output = (output + String(data)).slice(-4000);
      if (output.includes('Local:')) { clearTimeout(timer); resolve(); }
    };
    server.stdout.on('data', ready); server.stderr.on('data', ready);
    server.once('error', (error) => { clearTimeout(timer); reject(error); });
    server.once('exit', (code, signal) => { clearTimeout(timer); reject(new Error(`Vite preview exited (${code ?? signal}): ${output.trim()}`)); });
  });
  return new URL('http://127.0.0.1:5317/');
}

function worldUrl(base, hash) {
  const url = new URL(base);
  for (const [key, value] of Object.entries({ debug: '', nointro: '', wx: 'clear', tier: 'low', nopip: '' })) url.searchParams.set(key, value);
  url.hash = hash;
  return url.href;
}

async function context(base, storageState) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, ...(storageState ? { storageState } : {}) });
  // Only a fresh browser profile is used. Keep the test offline, including any AI/telemetry requests.
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === base.origin ? route.continue() : route.abort();
  });
  await ctx.addInitScript(() => {
    window.__worldCheckDocument = `${Date.now()}:${Math.random()}`;
    document.addEventListener('webglcontextlost', () => console.error('__WORLD_CHECK_CONTEXT_LOST__'), true);
  });
  return ctx;
}

function collectErrors(page, label) {
  const critical = /WebGLProgram|Shader Error|VALIDATE_STATUS|Program Info Log|WebGL.*(?:error|lost|failed|INVALID_)|GL_INVALID_|INVALID_OPERATION|__WORLD_CHECK_CONTEXT_LOST__|World navigation failed|\b(?:Error|TypeError|ReferenceError|SyntaxError|RangeError):/i;
  page.on('pageerror', (error) => report.failures.push(`${label}: JavaScript ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const text = message.text().slice(0, 3000);
    if (critical.test(text) || (message.type() === 'error' && /^THREE\./.test(text))) report.failures.push(`${label}: ${text}`);
    else report.diagnostics.push(`${label}: ${text}`);
  });
  page.on('crash', () => report.failures.push(`${label}: browser page crashed`));
}

async function state(page) {
  return await page.evaluate((token) => {
    const cur = window.seaglass?.cur, residents = cur?.residents;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('seaglass.residents.v1') || 'null'); } catch { /* reported by marker assertion */ }
    return {
      hash: location.hash, document: window.__worldCheckDocument,
      mode: document.body.classList.contains('mode-ocean') ? 'ocean' : document.body.classList.contains('mode-globe') ? 'globe' : 'loading',
      id: cur?.loc.id, world: cur?.loc.world ?? 'earth', hasResidents: !!residents, residents: residents?.list?.map((r) => r.id) ?? [],
      cached: window.seaglass?.gpu?.().seas ?? [],
      savedMarker: !!saved?.list?.find((r) => r.id === 'dot')?.diary?.some((e) => e.text === token),
      liveMarker: !!residents?.list?.find((r) => r.id === 'dot')?.diary?.some((e) => e.text === token),
      contextLost: window.seaglass?.renderer?.getContext()?.isContextLost() ?? false,
    };
  }, marker);
}

async function ocean(page, hash, label, { saved = true, documentId, fragment = hash } = {}) {
  await page.waitForFunction((wanted) => {
    const cur = window.seaglass?.cur;
    return document.body.classList.contains('mode-ocean') && location.hash === wanted.fragment && cur?.loc.id === 'kayama' &&
      (cur.loc.world ?? 'earth') === (wanted.hash === '#planet' ? 'planet' : 'earth') && !document.getElementById('veil')?.classList.contains('on');
  }, { hash, fragment }, { timeout });
  const got = await state(page);
  assert.equal(got.hasResidents, hash === '#planet', `${label}: residents must exist only on the planet`);
  assert.deepEqual(got.residents.slice().sort(), hash === '#planet' ? ['dot', 'kame', 'lantern', 'rakko'] : [], `${label}: resident membership`);
  assert(!got.contextLost, `${label}: WebGL context lost`);
  if (saved) assert(got.savedMarker && (hash !== '#planet' || got.liveMarker), `${label}: resident diary was lost`);
  if (documentId) assert.equal(got.document, documentId, `${label}: unexpectedly reloaded the document`);
  const cache = await page.evaluate(() => {
    const cur = window.seaglass.cur, key = `${cur.loc.world ?? 'earth'}:${cur.loc.id}`;
    const seen = window.__worldCheckOceans ??= {};
    const same = !seen[key] || seen[key] === cur;
    const other = seen[key === 'earth:kayama' ? 'planet:kayama' : 'earth:kayama'];
    const distinct = !other || (other !== cur && other.group !== cur.group);
    seen[key] = cur;
    return { same, distinct, keys: Object.keys(seen) };
  });
  assert(cache.same && cache.distinct, `${label}: wrong cached ocean reused`);
  if (cache.keys.length === 2) assert(got.cached.includes('earth:kayama') && got.cached.includes('planet:kayama'), `${label}: both cache identities must exist`);
  report.steps.push({ label, ...got }); console.log(`PASS ${label}`);
  return got;
}

async function globe(page, hash, label, documentId) {
  await page.waitForFunction((wanted) => !!window.seaglass && document.body.classList.contains('mode-globe') && location.hash === wanted &&
    !document.getElementById('veil')?.classList.contains('on'), hash, { timeout });
  const got = await state(page);
  assert(got.savedMarker, `${label}: resident save was lost`);
  assert.equal(got.document, documentId, `${label}: unexpectedly reloaded the document`);
  assert(!got.contextLost, `${label}: WebGL context lost`);
  report.steps.push({ label, ...got }); console.log(`PASS ${label}`);
}

const hashOnly = (page, hash) => page.evaluate((value) => { location.hash = value; }, hash);

async function seed(base) {
  const ctx = await context(base), page = await ctx.newPage(); collectErrors(page, 'resident seed');
  try {
    await page.goto(worldUrl(base, '#planet'), { waitUntil: 'commit', timeout });
    await ocean(page, '#planet', 'resident seed', { saved: false });
    await page.evaluate((token) => {
      const r = window.seaglass.cur.residents.list.find((resident) => resident.id === 'dot');
      r.diary.push({ at: window.seaglass.clock.ms, text: token, key: 'codex-worlds-browser' });
      window.seaglass.cur.residents.save();
    }, marker);
    assert((await state(page)).savedMarker, 'resident seed was not saved');
    return await ctx.storageState();
  } finally { await ctx.close(); }
}

async function order(base, storageState, first, second) {
  const label = `${first.slice(1)} then ${second.slice(1)}`;
  const ctx = await context(base, storageState), page = await ctx.newPage(); collectErrors(page, label);
  try {
    await page.goto(worldUrl(base, first), { waitUntil: 'commit', timeout });
    const initial = await ocean(page, first, `${label}: direct entry`);
    await page.screenshot({ path: path.join(out, `${first.slice(1)}-entry.png`) });
    await hashOnly(page, second);
    await ocean(page, second, `${label}: hash-only switch`, { documentId: initial.document });
    await page.evaluate(() => history.back());
    await ocean(page, first, `${label}: Back`, { documentId: initial.document });
    await page.evaluate(() => history.forward());
    await ocean(page, second, `${label}: Forward`, { documentId: initial.document });
    await hashOnly(page, first);
    await ocean(page, first, `${label}: cached return`, { documentId: initial.document });
    await page.reload({ waitUntil: 'commit', timeout });
    const reloadedFirst = await ocean(page, first, `${label}: first reload`);
    assert.notEqual(reloadedFirst.document, initial.document, `${label}: reload must create a document`);
    await hashOnly(page, second);
    await ocean(page, second, `${label}: switch after reload`, { documentId: reloadedFirst.document });
    await page.reload({ waitUntil: 'commit', timeout });
    const reloadedSecond = await ocean(page, second, `${label}: second reload`);
    assert.notEqual(reloadedSecond.document, reloadedFirst.document, `${label}: reload must create a document`);

    // Start a genuine transition, then issue several requests while the veil is still up.
    await hashOnly(page, first);
    await page.waitForFunction(() => document.getElementById('veil')?.classList.contains('on'), null, { timeout: Math.min(timeout, 30000) });
    await page.evaluate(async ([a, b]) => {
      for (const hash of [b, a, b]) { location.hash = hash; await new Promise((resolve) => setTimeout(resolve, 50)); }
    }, [first, second]);
    await ocean(page, second, `${label}: latest rapid request`, { documentId: reloadedSecond.document });
    await page.waitForTimeout(2500);
    await ocean(page, second, `${label}: rapid request remains settled`, { documentId: reloadedSecond.document });

    await hashOnly(page, '#codex-unknown-world');
    await ocean(page, second, `${label}: unknown hash keeps current ocean`, { documentId: reloadedSecond.document, fragment: '#codex-unknown-world' });

    await hashOnly(page, '');
    await globe(page, '', `${label}: empty hash`, reloadedSecond.document);
    await hashOnly(page, '#codex-unknown-world');
    await globe(page, '#codex-unknown-world', `${label}: unknown hash`, reloadedSecond.document);
    await hashOnly(page, first);
    await ocean(page, first, `${label}: return from globe`, { documentId: reloadedSecond.document });
    await page.waitForTimeout(2500); // Allow actual rendering and late shader/JavaScript errors to surface.
    await ocean(page, first, `${label}: final rendered state`, { documentId: reloadedSecond.document });
  } catch (error) {
    report.failures.push(`${label}: ${error.message}`);
    try { await page.screenshot({ path: path.join(out, `${first.slice(1)}-failure.png`) }); } catch { /* a crashed page cannot be captured */ }
  } finally { await ctx.close(); }
}

try {
  const { chromium } = await playwright();
  const executablePath = process.env.CHROMIUM || process.env.CHROME;
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), timeout: 30000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const base = await appUrl(); appReady = true; report.url = base.href;
  const storageState = await seed(base);
  await order(base, storageState, '#kayama', '#planet');
  await order(base, storageState, '#planet', '#kayama');
  report.status = report.failures.length ? 'fail' : 'pass';
} catch (error) {
  report.status = appReady ? 'fail' : 'blocked';
  report.failures.push(error.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  stopServer();
  report.finished = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.status.toUpperCase()} (${report.steps.length} completed steps)`);
  for (const error of report.failures) console.error(error);
  console.log(`Results: ${path.join(out, 'results.json')}`);
  process.exitCode = report.status === 'pass' ? 0 : report.status === 'blocked' ? 2 : 1;
}
