// Independent equilibrium-root and leakage integration checks at 7f4d1e3.
// Run from target: node --import tsx --import ./scripts/node-assets.mjs /path/repro.mjs /path/target /path/result.json
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const target = resolve(process.argv[2] ?? process.cwd());
const load = (p) => import(pathToFileURL(resolve(target, p)).href);
const { rise } = await load('src/science/step/barometer.ts');
const { barometerPotStep, BAROMETER_POT_PROCESS } = await load('src/science/step/barometer-pot.ts');
const { SCIENCE_CATALOG_VERSION } = await load('src/science/step/common.ts');
const { potToEquipmentParams } = await load('src/science/step/vessel.ts');
const { pv } = await load('src/science/params.ts');
const { validateResult } = await load('src/science/step/validate.ts');
const k2 = 2 * pv('waterDensity') * pv('gravity');
const failures = [], roots = [];
function rootReference(g, s, Pa, T) {
  const bound = Math.max(-g.V0 / g.A, -Pa / k2);
  const f = (x) => (Pa + k2 * x) * (g.V0 + g.A * x) - s * T;
  let lo = bound, hi = 1;
  while (f(hi) < 0) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
for (const volumeMl of [1, 20, 100, 500, 2000, 1000000]) for (const boreMm of [1, 8, 30]) for (const Ta of [-60, 0, 28, 70])
  for (const pressureHPa of [800, 990, 1010, 1100]) for (const airFactor of [0.6, 0.99, 1, 1.03, 1.4]) {
    const T = Ta + 273.15, g = { V0: volumeMl * 1e-6, A: Math.PI * (boreMm / 2000) ** 2, halfLengthM: 0.3, markM: 0.005, tauS: 600 };
    const s = 101000 * g.V0 / T * airFactor;
    const actual = rise(g, s, pressureHPa * 100, T), reference = rootReference(g, s, pressureHPa * 100, T);
    const residual = (pressureHPa * 100 + k2 * actual) * (g.V0 + g.A * actual) - s * T;
    roots.push({ volumeMl, boreMm, Ta, pressureHPa, airFactor, actual, reference, errorM: actual - reference, residual });
    if (!Number.isFinite(actual) || Math.abs(actual - reference) > 1e-8 * Math.max(1, Math.abs(reference))) failures.push({ kind: 'root', volumeMl, boreMm, Ta, pressureHPa, airFactor, actual, reference });
  }
function geometry(p) { return { V0: p.capacityMl * 1e-6, A: Math.PI * (p.tubeBoreMm / 2000) ** 2, halfLengthM: p.tubeLengthMm / 2000, markM: p.markMm / 1000, tauS: p.bulbTauS }; }
const PARAMS = (overrides = {}) => ({ capacityMl: 500, airLeakTauMin: 95, tubeBoreMm: 8, tubeLengthMm: 600, bulbTauS: 600, markMm: 5,
  sealed: 1, airtightKnown: 1, ...overrides });
function request(from, to, state, params, pressureHPa, airTempC, actions = [], stop) {
  return { contract: '0.2.0', requestId: `physics:${from}:${to}`, runId: 'physics:gauge', world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 },
    ...BAROMETER_POT_PROCESS, catalogVersion: SCIENCE_CATALOG_VERSION, interval: { from, to }, state,
    environment: { sampleId: 'known', source: 'record', effectiveAt: from, airTempC, pressureHPa },
    equipment: [{ equipmentId: 'bulb', kind: 'assembled_pot', catalogEntry: 'assembled_pot', catalogVersion: SCIENCE_CATALOG_VERSION, condition: 1, params }],
    lots: [{ lotId: 'water', materialId: 'process_water', amount: { value: 1000000, unit: 'mg' }, location: 'jar' }],
    actions, energy: [], seed: 1, ...(stop ? { stop } : {}) };
}
const read = (at) => ({ at, residentId: 'r', action: 'read_gauge' });
function runFromSet(params, elapsedS, pressure = 1000, temp = 28) {
  const setupReq = request(0, 30000, null, params, 1010, 28);
  const setup = barometerPotStep(setupReq);
  const to = 30000 + Math.round(elapsedS * 1000);
  const q = request(30000, to, structuredClone(setup.state), params, pressure, temp,
    [read(30000), ...(to - 1 > 30000 ? [read(to - 1)] : [])], 'operator');
  const res = barometerPotStep(q);
  const violations = validateResult(q, res);
  if (res.status === 'failed' || violations.length) failures.push({ kind: 'step', params, elapsedS, notes: res.evidence.notes, violations });
  const d = res.state.data;
  const actualM = rise(d.g, d.s.sLo, pressure * 100, d.s.bLo);
  return { res, d, actualM, marks: res.observations, status: res.status, condition: d.condition };
}
/** Exact constant-temperature/pressure solution for this same leakage ODE.
 * (1 + Pa*A/(k*V0))*ln(x0/x) + (2*A/V0)*(x0-x) = elapsed/tau.
 * Bisection is in ln(x0/x), avoiding precision loss as x approaches zero. */
function exactConstant(g, tauS, x0, pressurePa, elapsedS) {
  const a = 1 + pressurePa * g.A / (k2 * g.V0), b = 2 * g.A / g.V0;
  let lo = 0, hi = elapsedS / tauS / Math.min(a, a + b * x0) + 1;
  for (let i = 0; i < 100; i++) {
    const y = (lo + hi) / 2;
    const f = a * y + b * x0 * (1 - Math.exp(-y));
    if (f < elapsedS / tauS) lo = y; else hi = y;
  }
  return x0 * Math.exp(-(lo + hi) / 2);
}
const samples = [], timeConstants = [];
for (const tauMin of [1, 5, 95, 3096, 7756]) {
  const p = PARAMS({ airLeakTauMin: tauMin }), g = geometry(p), T = 301.15, Pa = 100000, tauS = tauMin * 60;
  const x0 = rootReference(g, 101000 * g.V0 / T, Pa, T), a = 1 + Pa * g.A / (k2 * g.V0), b = 2 * g.A / g.V0;
  const eFoldS = tauS * (a + b * x0 * (1 - Math.exp(-1)));
  timeConstants.push({ volumeMl: p.capacityMl, boreMm: p.tubeBoreMm, tauMin, linearRatio: a, exactEFoldRatio: eFoldS / tauS, exactEFoldS: eFoldS });
  for (const elapsedS of [30, 60, 120, Math.round(eFoldS), Math.round(2 * eFoldS)]) {
    const r = runFromSet(p, elapsedS);
    const referenceM = exactConstant(g, tauS, x0, Pa, elapsedS);
    samples.push({ tauMin, elapsedS, initialM: x0, actualM: r.actualM, referenceM, errorMm: (r.actualM - referenceM) * 1000,
      actualMark: Math.round(r.actualM / g.markM), referenceMark: Math.round(referenceM / g.markM), condition: r.condition });
  }
}
for (const volumeMl of [20, 100, 500, 2000, 10000]) for (const boreMm of [1, 8, 30]) {
  const g = geometry(PARAMS({ capacityMl: volumeMl, tubeBoreMm: boreMm }));
  timeConstants.push({ volumeMl, boreMm, linearRatio: 1 + 101000 * g.A / (k2 * g.V0) });
}
const wornLot = { lotId: 'worn-but-known', materialId: 'fired_pot_test', amount: { value: 600000, unit: 'mg' }, location: 'shelf',
  quality: { capacity_ml: 20, absorption_ppm: 400000, sealed: 1, crack_ppm: 1000000, x_tube_ppm: 100000, tube_bore_mm: 1, tube_length_mm: 600, joint_cover_ppm: 0 } };
const tableParams = { ...potToEquipmentParams(wornLot), markMm: 5 };
const tableCase = [];
for (const elapsedS of [30, 60, 120, 300]) {
  const r = runFromSet(tableParams, elapsedS), g = geometry(tableParams), T = 301.15;
  const x0 = rootReference(g, 101000 * g.V0 / T, 100000, T);
  const referenceM = exactConstant(g, tableParams.airLeakTauMin * 60, x0, 100000, elapsedS);
  tableCase.push({ elapsedS, actualM: r.actualM, referenceM, errorMm: (r.actualM - referenceM) * 1000, condition: r.condition,
    actualMark: Math.round(r.actualM / g.markM), referenceMark: Math.round(referenceM / g.markM) });
}
// Fractional minute tau is accepted by m03x's direct equipment contract, but airLeakTauMin() writes rounded minutes.
// Keep this synthetic-entry example distinct from a table-produced parameter case.
const synthetic = [];
for (const tauMin of [1 / 60, 0.1, 0.2]) for (const elapsedS of [30, 60, 120]) {
  const p = PARAMS({ airLeakTauMin: tauMin }), r = runFromSet(p, elapsedS), g = geometry(p), T = 301.15;
  const x0 = rootReference(g, 101000 * g.V0 / T, 100000, T);
  const referenceM = exactConstant(g, tauMin * 60, x0, 100000, elapsedS);
  synthetic.push({ tauMin, elapsedS, actualM: r.actualM, referenceM, condition: r.condition, marks: r.marks, spilledMg: r.d.spilledMg });
}
// Non-constant bulb temperature: RK4 reference, checked with two step sizes (not a new ScienceStep).
function rk4(g, leakK, s0, P, T0, Ta, endS, dt) {
  let s = s0;
  const f = (t, v) => -leakK * rootReference(g, v, P, Ta + (T0 - Ta) * Math.exp(-t / g.tauS));
  for (let t = 0; t < endS; t += dt) {
    const h = Math.min(dt, endS - t), a = f(t, s), b = f(t + h / 2, s + h * a / 2), c = f(t + h / 2, s + h * b / 2), d = f(t + h, s + h * c);
    s += h * (a + 2 * b + 2 * c + d) / 6;
  }
  return s;
}
const temperatureCases = [];
for (const elapsedS of [600, 1800, 7200]) {
  const p = PARAMS(), g = geometry(p), T0 = 301.15, Ta = 302.15, P = 101000, s0 = P * g.V0 / T0;
  const leakK = g.V0 / (T0 * p.airLeakTauMin * 60) * k2;
  const coarse = rk4(g, leakK, s0, P, T0, Ta, elapsedS, 1), fine = rk4(g, leakK, s0, P, T0, Ta, elapsedS, 0.5);
  const r = runFromSet(p, elapsedS, 1010, 29), Tb = Ta + (T0 - Ta) * Math.exp(-elapsedS / g.tauS);
  const coarseM = rootReference(g, coarse, P, Tb), referenceM = rootReference(g, fine, P, Tb);
  temperatureCases.push({ elapsedS, actualM: r.actualM, referenceM, errorMm: (r.actualM - referenceM) * 1000, referenceConvergenceMm: (coarseM - referenceM) * 1000 });
  if (Math.abs(coarseM - referenceM) > 1e-8) failures.push({ kind: 'reference-convergence', elapsedS, coarseM, referenceM });
}
const result = { target: '7f4d1e3c50e29f1ecde7382219f13f19c32777d4', process: BAROMETER_POT_PROCESS,
  equation: '(Pa+2*rho*g*x)*(V0+A*x) = nR*Tb; dnR/dt = -V0/(T0*tau)*2*rho*g*x',
  rootSummary: { cases: roots.length, maxAbsoluteErrorM: Math.max(...roots.map((r) => Math.abs(r.errorM))), maxRelativeResidual: Math.max(...roots.map((r) => Math.abs(r.residual) / (101000 * r.volumeMl * 1e-6 * r.airFactor))) },
  samples, timeConstants, tableProducedShortTau: { input: wornLot, params: tableParams, cases: tableCase },
  syntheticShortTau: synthetic, temperatureCases, failures };
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
