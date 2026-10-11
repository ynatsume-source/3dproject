// Regression check for the actual main.ts loading/resume/URL code, without WebGL.
// Extract its functions with the TypeScript parser; stub only rendering, timing and terrain construction.
// Usage: node --import tsx --import ./scripts/node-assets.mjs scripts/world-switch-check.ts
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { LOCATIONS, DOTWORLD } from '../src/data/locations';
import { shareUrl } from '../src/ui/share';
import { createHashNavigation } from '../src/world/hash-navigation';

// WORLD_SWITCH_MAIN can point at a baseline copy to reproduce the old application's failure.
const mainPath = process.env.WORLD_SWITCH_MAIN ?? new URL('../src/main.ts', import.meta.url);
const source = fs.readFileSync(mainPath, 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const functionNode = (name: string) => {
  const n = ast.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === name);
  if (!n) throw new Error(`main.ts function missing: ${name}`);
  return n;
};
function find(root: ts.Node, predicate: (n: ts.Node) => boolean): ts.Node {
  const found: ts.Node[] = [];
  const walk = (n: ts.Node) => { if (predicate(n)) found.push(n); ts.forEachChild(n, walk); };
  walk(root);
  if (found.length !== 1) throw new Error(`main.ts extraction needs exactly one node, got ${found.length}`);
  return found[0];
}
const compile = (code: string, env: any) => {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function('env', `with (env) { ${js} }`)(env);
};
const actual = (name: string, env: any) => compile(`${functionNode(name).getText(ast)}\nreturn ${name};`, env);
const historyWrite = find(functionNode('enterOcean'), (n) => (ts.isIfStatement(n) && n.expression.getText(ast).includes('writeUrl')) ||
  (!source.includes('writeUrl = true') && ts.isTryStatement(n) && n.getText(ast).includes('history.replaceState'))).getText(ast);
const start = ast.statements.flatMap((n) => ts.isVariableStatement(n) ? [...n.declarationList.declarations] : [])
  .find((n) => n.name.getText(ast) === 'start')?.initializer?.getText(ast);
if (!start) throw new Error('main.ts start location missing');
const shared = find(functionNode('shareMoment'), (n) => ts.isCallExpression(n) && n.expression.getText(ast) === 'shareUrl').getText(ast);
const hashListener = source.includes("addEventListener('hashchange', navigateHash)");
const earth = LOCATIONS.find((l) => l.id === 'kayama')!;
const helperPath = new URL('../src/world/location-id.ts', import.meta.url);
const helpers = fs.existsSync(helperPath) ? await import(pathToFileURL(helperPath.pathname).href) : {};
let bad = 0;
const want = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) bad++; };
want('hash-only navigation is wired into the application', hashListener);
const storage = () => {
  const m = new Map<string, string>([['seaglass.residents.v1', '{"memory":"keep me"}']]);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v) };
};
function fixture() {
  const no = () => {}, counts: any[] = [], shaders: any[] = [], freed: any[] = [];
  const env: any = {
    ...helpers, LOCATIONS, DOTWORLD, oceans: {}, busy: false, job: null, aheadTimer: 0, globeHidden: 0,
    prepared: new Set(), visited: new Set(), lastIn: new Map(), KEEP_SEAS: 2, cur: null, mode: 'globe',
    keepAwake: no, clearNewMark: no, setHot: no, clearTimeout: no, reduceMotion: false,
    tweenGlobe: async () => {}, performance, veil: no, nextFrame: async () => {}, wait: async () => {},
    fmtLL: () => '', localTimeString: () => '', clock: { ms: Date.now(), speed: 1, live: true },
    dbg: false, track: no, STAGE_JA: {}, $: () => ({ textContent: '' }), loadLand: async () => {},
    preparedCount: shaders, shareUrl, wxFixed: 'clear', wxKindOf: () => 'clear', liveWeather: () => ({}),
    persona: { id: 'calm' }, viewMode: 'fpv', shared: false,
    location: { hash: '', search: '', origin: 'https://example.test', pathname: '/' },
    history: { replaceState: (_s: any, _t: string, hash: string) => { env.location.hash = hash; } },
    localStorage: storage(), OPEN_KEY: 'seaglass.opening', RESUME_KEY: 'seaglass.resume',
    dayLog: [], dayKey: '', logSaveT: 0, guideEl: { hidden: true }, panelTab: 'log', seen: new Set(), say: no, renderGuide: no,
    drone: { pos: { values: [1, -2, 3], toArray() { return this.values; }, set(...p: number[]) { this.values = p; } },
      vel: { set: no }, yaw: 0.1, pitch: 0.2, sky: false, mode: 'manual' },
    ZONE: { x: 0 }, endOpening: no, nearestS: () => 0, forgetLand: (id: string) => freed.push(id), freeOcean: no,
    aheadLast: 0, aheadGap: 16, globeGap: 16, globeLast: 0, aheadBudget: 10, aheadId: null,
    gv: { dragging: false, lastUser: -1e12 }, renderer: { extensions: { get: () => false } }, SAFE: 0,
    hashNavigation: { flush: async () => {}, hasPending: () => false },
    restoreStartup: true,
  };
  const ocean = (loc: any) => { counts.push(loc); return { loc, residents: loc.residents ? { memory: 'resident' } : null }; };
  env.buildOcean = ocean;
  env.startJob = (loc: any) => (env.job = { loc, done: ocean(loc), failed: false });
  env.stepJob = () => true;
  env.prepareShaders = async (oc: any) => { shaders.push(oc); };
  env.enterOcean = (oc: any, writeUrl = true) => { env.cur = oc; env.mode = 'ocean'; compile(`${historyWrite}`, { ...env, oc, writeUrl }); };
  env.letGo = actual('letGo', env); env.keepFew = actual('keepFew', env);
  env.localDate = actual('localDate', env); env.saveLog = actual('saveLog', env);
  env.ensureDay = actual('ensureDay', env); env.recordLog = actual('recordLog', env);
  return { env, dive: actual('dive', env), counts, shaders, freed };
}
for (const order of [[earth, DOTWORLD], [DOTWORLD, earth]]) {
  const { env, dive, counts, shaders } = fixture();
  const name = order[0] === earth ? 'Earth then planet' : 'planet then Earth';
  for (const loc of order) { await dive(loc); want(`${name}: opens requested world`, env.cur.loc === loc && !!env.cur.residents === !!loc.residents); }
  want(`${name}: separate oceans, preparation and visit history`, counts.length === 2 && shaders.length === 2 && env.visited.size === 2 && env.lastIn.size === 2);
  await dive(order[0]);
  want(`${name}: returning reuses the correct ocean`, env.cur.loc === order[0] && counts.length === 2);
  want(`${name}: residents' saved memory survives`, env.localStorage.getItem('seaglass.residents.v1') === '{"memory":"keep me"}');
}
{
  const { env, dive, counts } = fixture();
  env.job = { loc: earth, done: { loc: earth, residents: null }, failed: false };
  actual('aheadStep', env)();
  await dive(DOTWORLD);
  want('Earth prefetch does not satisfy a planet visit', env.cur.loc === DOTWORLD && !!env.cur.residents && counts.length === 1);
}
{
  const { env, dive, freed } = fixture();
  await dive(DOTWORLD); await dive(earth);
  const earthEntry = Object.entries(env.oceans).find(([, oc]: any) => oc.loc === earth);
  env.cur = Object.values(env.oceans).find((oc: any) => oc.loc === DOTWORLD);
  if (earthEntry) env.letGo(earthEntry[0]);
  want('releasing Earth keeps the planet ocean and its shared CPU land data', !!earthEntry && !env.oceans[earthEntry[0]] && !!env.cur?.residents && !freed.includes('kayama'));
}
for (const loc of [earth, DOTWORLD]) {
  const { env, dive } = fixture(); await dive(loc);
  want(`${loc.world ?? 'Earth'} URL reload chooses the same world`, compile(`return ${start};`, env) === loc);
  const link = new URL(compile(`return ${shared};`, env));
  // Earth links go through their generated OG page, which redirects to the app with #<sea>.
  env.location.hash = link.hash || '#' + link.pathname.split('/').filter(Boolean).at(-1);
  want(`${loc.world ?? 'Earth'} shared link chooses the same world`, compile(`return ${start};`, env) === loc);
}
{
  const { env, dive } = fixture(); await dive(DOTWORLD);
  const keepPlace = actual('keepPlace', env), takeUpPlace = actual('takeUpPlace', env);
  keepPlace(); env.drone.pos.values = [9, -2, 9]; takeUpPlace(earth);
  want('saved planet view is not restored in Earth Kayama', env.drone.pos.values[0] === 9);
  takeUpPlace(DOTWORLD);
  want('saved planet view is restored in the same world', env.drone.pos.values[0] === 1);
  env.localStorage.setItem('seaglass.resume', JSON.stringify({ sea: 'kayama', p: [8, -2, 8], yaw: 0, pitch: 0, sky: false, at: Date.now() }));
  env.drone.pos.values = [9, -2, 9]; takeUpPlace(DOTWORLD); takeUpPlace(earth);
  want('ambiguous legacy view cache is discarded, resident save retained', env.drone.pos.values[0] === 9 && env.localStorage.getItem('seaglass.residents.v1') === '{"memory":"keep me"}');
  env.location.search = '';
  env.localStorage.setItem('seaglass.opening', JSON.stringify({ kayama: new Date().toDateString() }));
  const wantOpening = actual('wantOpening', env);
  want('legacy shared opening marker does not hide either world intro', wantOpening(earth) && wantOpening(DOTWORLD));
  env.localStorage.setItem('seaglass.opening', JSON.stringify({ 'planet:kayama': new Date().toDateString() }));
  want('new planet opening marker does not hide Earth intro', !wantOpening(DOTWORLD) && wantOpening(earth));
}
{
  const { env, dive } = fixture();
  const day = env.localDate(env.clock.ms, earth.tz);
  env.localStorage.setItem(`seaglass.log.kayama.${day}`, JSON.stringify([{ ms: env.clock.ms, kind: 'robot', text: 'ambiguous old log' }]));
  await dive(DOTWORLD); env.recordLog('robot', 'planet resident'); env.saveLog();
  want('ambiguous old Kayama viewing log is not inherited', !env.dayLog.some((x: any) => x.text === 'ambiguous old log'));
  await dive(earth); env.recordLog('phase', 'Earth sea'); env.saveLog();
  want('Earth viewing log does not inherit planet residents', env.dayLog.length === 1 && env.dayLog[0].text === 'Earth sea');
  await dive(DOTWORLD); env.ensureDay();
  want('planet viewing log remains its own on return', env.dayLog.length === 1 && env.dayLog[0].text === 'planet resident');
  const discover = actual('discover', env);
  discover({ id: 'testfish', ja: 'testfish', sci: 'testfish' });
  await dive(earth); discover({ id: 'testfish', ja: 'testfish', sci: 'testfish' });
  want('sighting cache records each world independently', env.seen.has('planet:kayama:testfish') && env.seen.has('earth:kayama:testfish') && env.seen.size === 2);
  const old = ['miyako:testfish', 'kayama:testfish', 'planet:kayama:testfish'];
  const migrated = helpers.migrateSeen ? helpers.migrateSeen(old, LOCATIONS) : old;
  want('legacy Earth sightings migrate; ambiguous Kayama sightings reset', migrated.includes('earth:miyako:testfish') && migrated.includes('planet:kayama:testfish') && !migrated.includes('kayama:testfish'));
  want('viewing log and sighting migration leave resident memory unchanged', env.localStorage.getItem('seaglass.residents.v1') === '{"memory":"keep me"}');
}
// Drive the application's real hash callback and controller setup. Rendering is
// stubbed, but URL writes, busy states, entry/exit and cache selection are real.
const navigationInit = ast.statements.flatMap((n) => ts.isVariableStatement(n) ? [...n.declarationList.declarations] : [])
  .find((n) => n.name.getText(ast) === 'hashNavigation')?.initializer?.getText(ast);
const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const deferred = () => { let release!: () => void; const promise = new Promise<void>((r) => { release = r; }); return { promise, release }; };
function navigationFixture() {
  const f = fixture(), { env } = f, errors: unknown[] = [], writes: string[] = [];
  Object.assign(env, {
    createHashNavigation, restoreStartup: true, console: { error: (...e: unknown[]) => errors.push(e) },
    lanternStudyPanel: { close() {} }, syncReplay() {}, document: { body: { classList: { add() {}, remove() {} } } },
    setGuide() {}, setTimePanel() {}, setVolPanel() {}, watch: { r: null }, setPov() {}, resize() {}, clamp: (x: number) => x,
  });
  env.history.replaceState = (_s: unknown, _t: string, url: string) => { writes.push(url); env.location.hash = new URL(url, 'https://example.test').hash; };
  env.dive = f.dive; env.toGlobe = actual('toGlobe', env); env.takeUpPlace = actual('takeUpPlace', env);
  // The real frame only advances globe tweens in globe mode. Catch an ocean-to-
  // ocean dive that would otherwise hang despite the fixture's instant tweens.
  env.tweenGlobe = async (_lat: number, _lon: number, distance: number) => {
    if (distance < 1.2 && env.mode !== 'globe') throw new Error('dive must start in globe mode');
  };
  if (navigationInit) env.hashNavigation = compile(`return ${navigationInit};`, env);
  const handler = hashListener ? actual('navigateHash', env) : () => {};
  const hash = (value: string) => { env.location.hash = value; handler(); };
  return { ...f, hash, handler, errors, writes };
}
for (const order of [[earth, DOTWORLD], [DOTWORLD, earth]]) {
  const f = navigationFixture(), { env, hash } = f;
  env.location.pathname = '/app/'; env.location.search = '?debug&nollm';
  for (const loc of order) {
    hash(helpers.seaHash(loc)); await settle();
    want(`hash only: enters ${helpers.worldKey(loc)}`, env.mode === 'ocean' && env.cur?.loc === loc && !!env.cur.residents === !!loc.residents);
  }
  want('hash navigation preserves history, path, query and resident save', f.writes.length === 0 && env.location.pathname === '/app/' && env.location.search === '?debug&nollm' && env.localStorage.getItem('seaglass.residents.v1') === '{"memory":"keep me"}');
  const before = f.counts.length;
  f.handler(); await settle();
  want('same hash notification reuses the active world', f.counts.length === before && !env.busy);
  hash('#unknown-world'); await settle();
  want('unknown fragment leaves the world unchanged', env.cur?.loc === order[1] && !env.busy);
  hash(''); await settle();
  want('empty fragment surfaces to globe without replacing history', env.mode === 'globe' && env.location.hash === '');
  hash(helpers.seaHash(order[1])); await settle();
  want('globe can re-enter the world retained in cur', env.mode === 'ocean' && env.cur?.loc === order[1] && f.counts.length === before);
  want('world transitions do not leave a busy loader or errors', !env.busy && f.errors.length === 0);
}
{
  const f = navigationFixture(), gate = deferred();
  f.env.wait = () => gate.promise;
  f.hash('#kayama'); f.hash('#planet'); f.hash('#miyako');
  gate.release(); await settle();
  want('rapid hash requests finish in the latest world', f.env.cur?.loc.id === 'miyako' && !f.env.cur.loc.world && !f.env.busy);
  want('superseded planet request is not built', !f.counts.includes(DOTWORLD));
}
{
  const f = navigationFixture(), gate = deferred();
  f.env.wait = () => gate.promise;
  const loading = f.dive(earth); await settle();
  f.hash('#planet'); gate.release(); await loading; await settle();
  want('hash change during UI loading is queued and cannot be overwritten', f.env.cur?.loc === DOTWORLD && f.env.location.hash === '#planet' && f.writes.length === 0);
}
{
  const f = navigationFixture(), gate = deferred();
  f.env.wait = () => gate.promise;
  const loading = f.dive(earth); await settle();
  f.hash('#planet'); f.hash('#unknown-world'); gate.release(); await loading; await settle();
  want('latest invalid fragment cancels an older queued destination', f.env.cur?.loc === earth && !f.counts.includes(DOTWORLD) && f.env.location.hash === '#unknown-world');
}
{
  const f = navigationFixture();
  let timer!: () => void;
  const startup = ast.statements.find((n) => ts.isIfStatement(n) && n.expression.getText(ast) === 'start')!;
  Object.assign(f.env, { start: DOTWORLD, probe: false, gputest: false, setTimeout: (fn: () => void) => { timer = fn; } });
  compile(startup.getText(ast), f.env);
  f.hash('#kayama'); timer(); await settle();
  want('startup delay uses the current hash instead of its old snapshot', f.env.cur?.loc === earth && !f.counts.includes(DOTWORLD));
}
{
  const f = navigationFixture(), gate = deferred();
  let timer!: () => void;
  const startup = ast.statements.find((n) => ts.isIfStatement(n) && n.expression.getText(ast) === 'start')!;
  Object.assign(f.env, { start: DOTWORLD, probe: false, gputest: false, setTimeout: (fn: () => void) => { timer = fn; }, wait: () => gate.promise });
  f.env.location.hash = '#planet';
  compile(startup.getText(ast), f.env);
  const loading = f.dive(earth); await settle(); timer(); gate.release(); await loading; await settle();
  want('explicit UI navigation cancels a delayed startup destination', f.env.cur?.loc === earth && f.env.location.hash === '#kayama' && !f.counts.includes(DOTWORLD));
}
{
  const f = navigationFixture();
  if (navigationInit) {
    let fail = true;
    f.env.prepareShaders = async () => { if (fail) { fail = false; throw new Error('test preparation failure'); } };
    f.hash('#planet'); await settle();
    want('failed URL loading releases busy and reports the error', !f.env.busy && f.errors.length === 1);
    f.hash('#kayama'); await settle();
    want('URL navigation can retry after a preparation failure', f.env.cur?.loc === earth && !f.env.busy);
  }
}
console.log(bad ? `FAIL (${bad})` : 'PASS (world switch)');
process.exit(bad ? 1 : 0);
