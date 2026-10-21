// Deterministic regressions for the actual resident hypothesis/report functions, with synthetic observations.
// Full ledger, save/load and reinstallation are exercised separately by gauge-epoch-check.
// GAUGE_RESIDENTS can point at the fixed review SHA's residents.ts to reproduce the two reported failures.
import fs from 'node:fs';
import ts from 'typescript';
import { emptyLedger } from '../src/world/process-runner';
import { recentScienceRuns } from '../src/world/science-records';
const source = fs.readFileSync(process.env.GAUGE_RESIDENTS ?? new URL('../src/robots/residents.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('residents.ts', source, ts.ScriptTarget.Latest, true);
const host = ast.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === 'makeResidents')!;
const functions = host.body!.statements;
const morning = functions.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === 'morningNight')!;
const start = source.indexOf('  /** The readings of one setup');
const end = source.indexOf('  // A storm runs', start);
if (start < 0 || end < 0 || !morning) throw new Error('Resident function extraction failed');
const extra = ['gaugePlaced', 'catchRain'].map((name) => functions.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === name)!.getText(ast)).join('\n');
const code = source.slice(start, end) + morning.getText(ast) + extra
  + '\nreturn { hypoRead, hypoRead2, dayAgo, morningNight, gaugePlaced, catchRain };';
const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const M2 = 'm02x_air_barometer_test', M3 = 'm03x_air_barometer_pot', DAY = 86400000;
let bad = 0;
const want = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) bad++; };
const copy = (x: any) => JSON.parse(JSON.stringify(x));
const hypothesis = (runId?: string) => ({ at: 10, by: 'lantern', ...(runId ? { processId: M2, runId } : {}), mark: 5, airs: [20], alarm: null, storms: [], hits: 2, falses: 1, misses: 0, leads: [3], status: 'held', heat: true });
function fixture() {
  const lantern = { id: 'lantern', diary: [] }, listener = { id: 'dot', diary: [] as any[] }, frames: any[] = [], notes: string[] = [];
  const env: any = { village: { gaugeLog: [], hypo: null, hypo2: null, hypoHistory: [], taught: {} },
    recentScienceRuns, clockMs: DAY * 3, HYPO_DAY: DAY, HYPO_READS: 16, ISLAND_RATE: 1, islandWait: (x: number) => x,
    islandWeather: () => ({ air: 20, pressureMeasured: 1001, rainMeasured: 0 }), wxNow: { air: 99, pressureMeasured: 999 }, hypoNote: (s: string) => notes.push(s),
    byId: { lantern }, lastNight: null, fireQueue: [],
    say_: (who: string, frame: any) => { frames.push(frame); return { who, line: frame.act }; },
    prepActive: () => true, settleLines: () => [], agentOf: () => null,
  };
  const api = new Function('env', `with (env) { ${js} }`)(env);
  const read = (at: number, mark: number, runId?: string, processId = M2) => env.village.gaugeLog.push({ at, mark, processId, ...(runId ? { runId } : {}) });
  return { env, api, read, listener, frames, notes };
}
for (const legacy of [false, true]) {
  const { env, api, read } = fixture(), old = hypothesis(legacy ? undefined : 'old'), snapshot = copy(old);
  old.alarm = { at: 5, mark: 8, matched: false } as any; snapshot.alarm = copy(old.alarm);
  env.village.hypo = old;
  read(1, 900, 'old'); read(2, 800, 'new', M3); read(3, 700);
  const oldLog = copy(env.village.gaugeLog);
  read(100, 100, 'new'); api.hypoRead(100, 100, 'new');
  want(`${legacy ? 'legacy' : 'tagged'} absolute threshold and pending alarm are not applied to new setup`, env.village.hypo === null);
  want(`${legacy ? 'legacy' : 'tagged'} hypothesis retained unchanged in history`, env.village.hypoHistory.some((x: any) => JSON.stringify(x.hypothesis) === JSON.stringify(snapshot)));
  for (let i = 1; i < 16; i++) { read(100 + i, 100 + i, 'new'); api.hypoRead(100 + i, 100 + i, 'new'); }
  const h = env.village.hypo;
  want('new absolute threshold uses only its own first 16 observations', h?.mark === 117 && h.runId === 'new' && h.processId === M2 && h.hits === 0 && h.alarm === null);
  want('observations and earlier heat insight retained', JSON.stringify(env.village.gaugeLog.slice(0, 3)) === JSON.stringify(oldLog) && h?.heat === true);
  read(116, 118, 'new'); api.hypoRead(116, 118, 'new');
  want('new setup can alarm immediately once its own threshold exists', env.village.hypo?.alarm?.mark === 118);
}
{
  const { env, api, read } = fixture(); env.village.hypo = hypothesis('same');
  read(20, 6, 'same'); api.hypoRead(20, 6, 'same');
  want('same setup keeps learned threshold, tallies and normal alarms', env.village.hypo.mark === 5 && env.village.hypo.hits === 2 && env.village.hypo.alarm?.mark === 6 && !env.village.hypoHistory.length);
}
{
  const { env, api, read } = fixture(); env.village.hypo2 = { ...hypothesis(), kind: 'day' };
  read(DAY, 0, 'old'); read(DAY, 0, 'new', M3); read(DAY, 0);
  api.hypoRead2(2 * DAY, 20, 'new');
  want('day difference excludes other setups, gauges and untagged history', env.village.hypo2.alarm === null && api.dayAgo(2 * DAY, 'new') === undefined);
  read(DAY, 10, 'new'); api.hypoRead2(2 * DAY, 20, 'new');
  want('day comparison is available from the first valid same-setup pair', env.village.hypo2.alarm?.mark === 10);
}
{
  const { env, api, read } = fixture(); env.village.hypo = hypothesis('old');
  read(100, 100, 'new'); api.hypoRead(100, 100, 'new');
  want('first new reading above the old absolute threshold raises no alarm', env.village.hypo === null);
}
{
  const { env, api } = fixture(); env.village.hypo = hypothesis('old');
  const saved = copy(env.village.hypo);
  env.lab = { ...emptyLedger('world', 'epoch'), runs: { old: { processId: M2, runId: 'old', lastTo: 1, lotIds: [], status: 'stopped', why: 'version' } } };
  api.gaugePlaced(env.byId.lantern, { processId: M2, ja: '試験用の気圧計' }, 'new', []);
  want('placing retires the old absolute guess before any new reading', env.village.hypo === null && JSON.stringify(env.village.hypoHistory[0]?.hypothesis) === JSON.stringify(saved));
  const p = env.village.gaugeLog[0];
  want('placing diagnostic uses weather at recorded time, not stale view weather', p.airC === 20 && p.placed.pressureHPa === 1001);
  want('resident only hears reinstallation fact, no diagnostic values', env.byId.lantern.diary[0]?.text === '試験用の気圧計：置き直した');
}
{
  const { env, api } = fixture();
  const lot = (lotId: string, value: number, reservedBy?: string) => ({ lotId, materialId: 'process_water', amount: { value, unit: 'mg' }, quality: { history_complete: 1 }, reservedBy });
  env.lab = { ...emptyLedger('world', 'epoch'), lots: { oldWater: lot('oldWater', 250000), jar: lot('jar', 500000), newWater: lot('newWater', 250000, 'pot2') },
    runs: { pot1: { processId: M3, runId: 'pot1', lastTo: 1, lotIds: ['oldWater'], status: 'failed', why: 'corrupt-state' } } };
  env.village.catcher = { areaM2: 1, capMg: 20000000 }; env.rainCarry = 0; env.wetting = 0;
  env.shelfLots = () => Object.values(env.lab.lots); env.drawStore = () => {};
  api.catchRain(0);
  api.gaugePlaced(env.byId.lantern, { processId: M3, ja: '天気の壺' }, 'pot2', ['newWater']);
  const p = env.village.gaugeLog[0];
  want('rain jar consolidation conserves free plus reserved water without duplicating old lot', !env.lab.lots.oldWater && env.lab.lots.jar.amount.value === 750000 && env.lab.lots.newWater.amount.value === 250000 && env.lab.lots.newWater.reservedBy === 'pot2');
  want('reinstallation records old water ID even after consolidation removed it', p.placed.lotsOut[0] === 'oldWater' && p.placed.lotsIn[0] === 'newWater' && p.placed.from === 'pot1' && /corrupt-state/.test(p.placed.why));
}
for (const hasRead of [true, false]) {
  const { env, api, read, listener, frames } = fixture();
  read(env.clockMs - 10000, 999, 'old');
  env.village.gaugeLog.push({ at: env.clockMs - 1000, processId: M2, runId: 'new', placed: { why: 'stopped' } });
  if (hasRead) read(env.clockMs - 500, 7, 'new');
  read(env.clockMs - 100, 888, 'pot', M3);
  api.morningNight([env.byId.lantern, listener]);
  const report = frames.find((f: any) => f.act === 'tell-night');
  want(`morning report ${hasRead ? 'uses test gauge and current setup only' : 'does not substitute pot or old setup before first read'}`,
    report?.reads === (hasRead ? 1 : 0) && report.mark === (hasRead ? 7 : undefined)
    && (hasRead ? listener.diary.length === 1 && /目盛り7/.test(listener.diary[0].text) : !listener.diary.length));
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exitCode = bad ? 1 : 0;
