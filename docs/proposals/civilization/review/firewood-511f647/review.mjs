// Targeted confirmation of A1/A2/C1. Run from a checkout with tsx installed:
// node --import tsx /path/to/this/review.mjs /absolute/511f647-checkout [/absolute/29521cb-checkout]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { run, metric, env, eq, wood, H, req, scienceStep, validateResult, woodEmc } from '../firewood-29521cb/review-lib.mjs';

const out = { target: globalThis.process.argv[2], checks: 0, failures: [], cases: {} };
const check = (name, ok, detail) => { out.checks++; if (!ok) out.failures.push({ name, detail }); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const look = at => ({ at, action: 'look', residentId: 'lantern' });
const copy = x => JSON.parse(JSON.stringify(x));
const noEffects = r => ['consumed', 'produced', 'released', 'drawn', 'energy', 'observations'].every(k => !(r[k] ?? []).length);

// The old negative-water counterexample and wet wood outside the declared range.
for (const waterPpm of [0, 450000]) {
  const r = run(H, H, { lots: [wood({ water_ppm: waterPpm })], environment: env({ airTempC: -60, humidity: .95 }) }, [look(17000)]);
  out.cases[`cold-${waterPpm}`] = metric(r);
  check('A1: out-of-range wood has no water/heat movement or observations', r.last.produced[0]?.amount.value === 4000000 && r.last.produced[0]?.quality.water_ppm === waterPpm && !r.heat && !r.last.released.length && !r.last.drawn.length && !r.obs.length && r.last.produced[0]?.quality.history_complete === 0 && !r.violations.length, metric(r));
}
for (const [T, expected] of [[-1.100001, false], [-1.1, true], [98.9, true], [98.900001, false]]) {
  const value = woodEmc(T, .95);
  check('A1: exact temperature boundary', expected ? Number.isFinite(value) && value >= 0 : value === null, { T, value });
}
for (const [T, h] of [[NaN, .5], [Infinity, .5], [28, NaN], [28, -.001], [28, 1.001]]) check('A1: invalid formula argument is unknown', woodEmc(T, h) === null, { T, h });
let invalid = 0, scanned = 0, minimum = Infinity, maximum = -Infinity;
for (let i = 0; i <= 1000; i++) for (let j = 0; j <= 1000; j++) {
  const value = woodEmc(-1.1 + i / 10, j / 1000);
  scanned++;
  if (value === null || !Number.isFinite(value) || value < 0) invalid++;
  else { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); }
}
out.formulaDomain = { scanned, invalid, minimum, maximum };
check('A1: finite nonnegative EMC throughout sampled declared domain', !invalid, out.formulaDomain);
const sunny = run(H, H, { equipment: [eq({ covered: 0, sunExposure: 1 })], environment: env({ airTempC: -10, humidity: .5 }) });
check('A1: range applies to wood temperature (air -10 C plus sun = 5 C)', Number.isFinite(sunny.last.diagnostics.emc) && sunny.last.produced[0]?.quality.history_complete === 1 && sunny.last.released.length > 0 && !sunny.violations.length, metric(sunny));
const coldRain = run(H, H, { equipment: [eq({ covered: 0 })], environment: env({ airTempC: -10, rainMmH: 10 }) });
check('A1: unknown interval also freezes rain uptake', !coldRain.last.drawn.length && !coldRain.last.released.length && !coldRain.heat && coldRain.last.produced[0]?.quality.history_complete === 0, metric(coldRain));
const dryHot = run(H, H, { lots: [wood({ water_ppm: 1, piece_mm: 5 })], equipment: [eq({ covered: 0, sunExposure: 1 })], environment: env({ airTempC: 70, humidity: 0 }) });
check('A1: evaporation cannot exceed initially available 4 mg', dryHot.last.released.reduce((s, x) => s + x.amount.value, 0) <= 4 && dryHot.last.state.data.water >= 0 && dryHot.last.produced[0]?.quality.water_ppm >= 0 && !dryHot.violations.length, metric(dryHot));

// Distinguish absent wind from an explicitly observed calm interval.
const missingEnv = env(); delete missingEnv.windMs;
const missing = run(H, H, { environment: missingEnv }, [look(17000)]);
const calm = run(H, H, { environment: env({ windMs: 0 }) }, [look(17000)]);
out.cases.missingWind = metric(missing); out.cases.calm = metric(calm);
check('A2: missing wind is unknown', !missing.heat && !missing.last.released.length && !missing.obs.length && missing.last.produced[0]?.quality.history_complete === 0 && !missing.violations.length, metric(missing));
check('A2: explicit zero still dries and can be observed', calm.heat > 0 && calm.last.released.length > 0 && calm.obs.length > 0 && calm.last.produced[0]?.quality.history_complete === 1 && !calm.violations.length, metric(calm));
for (const environment of [missingEnv, env({ airTempC: -60 })]) {
  const whole = run(H, H, { environment }), split = run(H, 17000, { environment });
  check('A1/A2: invalid interval gives same state and settlement when split off-grid', same(whole.last.state, split.last.state) && same(whole.last.produced, split.last.produced) && same(whole.last.released, split.last.released) && whole.heat === split.heat, { whole: metric(whole), split: metric(split) });
}
const first = scienceStep(req(0, H));
for (const environment of [missingEnv, env({ airTempC: -60 })]) {
  const gap = scienceStep(req(H, 2 * H, copy(first.state), { environment, actions: [look(H + 17000)] }));
  const endQ = req(2 * H, 3 * H, copy(gap.state), { stop: 'operator', actions: [look(2 * H + 17000)] });
  const end = scienceStep(endQ);
  check('A1/A2: saved unknown gap preserves water and records incomplete history after recovery', gap.state.data.water === first.state.data.water && !gap.energy.length && !gap.observations.length && !end.observations.length && end.produced[0]?.quality.history_complete === 0 && !validateResult(endQ, end).length, { gap: gap.diagnostics, end: end.diagnostics });
  const nextLot = { lotId: 'returned', ...end.produced[0], location: end.produced[0].into };
  const reused = run(H, H, { lots: [nextLot] });
  check('A1/A2: returned wood is readable and retains incomplete provenance', reused.last.status === 'stopped' && reused.last.produced[0]?.quality.history_complete === 0 && !reused.violations.length, metric(reused));
}

// Schema shape stays /1; version checking, not schema migration, rejects an old run.
const resumed = scienceStep(req(H, 2 * H, copy(first.state), { stop: 'operator' }));
const uninterrupted = scienceStep(req(0, 2 * H, null, { stop: 'operator' }));
check('state: fresh /1 survives JSON save and resume unchanged', first.state.schema === 'civ-sci.firewood-dry/1' && same(resumed.state, uninterrupted.state) && same(resumed.produced, uninterrupted.produced) && same(resumed.released, uninterrupted.released));
let oldState = first.state;
if (globalThis.process.argv[3]) {
  const { scienceStep: oldStep } = await import(pathToFileURL(`${globalThis.process.argv[3]}/src/science/step/index.ts`));
  oldState = oldStep(req(0, H, null, { processVersion: '0.1.0' })).state;
  out.oldStateSource = globalThis.process.argv[3];
}
const oldQ = req(H, 2 * H, copy(oldState), { processVersion: '0.1.0' });
const rejected = scienceStep(oldQ);
out.oldRun = { status: rejected.status, diagnostics: rejected.diagnostics };
check('state: run pinned to 0.1.0 is refused without effects', rejected.status === 'failed' && noEffects(rejected) && !validateResult(oldQ, rejected).length, out.oldRun);

const handbook = JSON.parse(readFileSync(new URL('../firewood-29521cb/data/science/evidence/wood-handbook-2021.json', import.meta.url), 'utf8'));
out.C1 = { tableMaxRh: Math.max(...handbook.relativeHumidity), capRh: .98, emcAt25C95PercentDry: 100 * woodEmc(25, .95), emcAt25C98PercentDry: 100 * woodEmc(25, .98), note: 'The table ends at 95% RH. Evaluating the formula at 98% and holding it above 98% is an independent assumption, not using the last table row.' };
check('C1: implementation actually clamps the equation at 98%', woodEmc(25, 1) === woodEmc(25, .98) && woodEmc(25, .99) === woodEmc(25, .98), out.C1);
console.log(JSON.stringify(out, null, 2));
if (out.failures.length) globalThis.process.exitCode = 1;
