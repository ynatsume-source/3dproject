// Read-only addition to the vessel review. No source mutations.
// node --import tsx THIS_FILE /science/ce0cfc1 /host/e14eeba [/science/e6668fb]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(process.argv[2] ?? process.cwd());
const host = resolve(process.argv[3]);
const load = (base, p) => import(pathToFileURL(`${base}/${p}`));
const { scienceStep } = await load(root, 'src/science/step/index.ts');
const { TAR_SEAL_PROCESS: seal, LEAK_TEST_PROCESS: leak, readPot, potToEquipmentParams, potQualityOnReturn, airLeakTauMin, POT_ASSEMBLY_TABLE, ASSEMBLED_POT } = await load(root, 'src/science/step/vessel.ts');
const { validateResult } = await load(root, 'src/science/step/validate.ts');
const { emptyLedger, addLot, assemble, disassemble } = await load(host, 'src/world/process-runner.ts');
const H = 3600000, D = 24 * H, violations = [];
const step = q => { const r = scienceStep(q); violations.push(...validateResult(q, r)); return r; };
const env = (humidity = .75) => ({ source: 'record', sampleId: 'env', effectiveAt: 0, airTempC: 28, humidity, windMs: 2 });
const pot = (quality = {}) => ({ lotId: 'lot:pot', materialId: 'fired_pot_test', amount: { value: 615000, unit: 'mg' }, location: 'shelf', quality: { capacity_ml: 500, absorption_ppm: 120000, coverage_ppm: 935131, sealed: 1, x_wood_tar_ppm: 24390, history_complete: 0, ...quality } });
const lotOf = p => ({ lotId: 'lot:return', materialId: p.materialId, amount: p.amount, location: p.into, quality: p.quality });
const water = { lotId: 'lot:water', materialId: 'process_water', amount: { value: 450000, unit: 'mg' }, location: 'shelf' };
const table = { version: POT_ASSEMBLY_TABLE, kind: ASSEMBLED_POT, catalogEntry: ASSEMBLED_POT, catalogVersion: 'civ-sci-test-2',
  materials: ['fired_pot_test'], toParams: potToEquipmentParams, qualityOnReturn: potQualityOnReturn };
const req = (process, from, to, lots, state = null, actions = [], over = {}) => ({
  contract: '0.2.0', requestId: `req:${from}`, runId: 'run:vessel', world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 },
  ...process, catalogVersion: 'civ-sci-test-2', seed: 1, interval: { from, to }, lots, state, actions, environment: env(),
  energy: process === seal ? [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: (to - from) * .02 }] : [],
  equipment: [{ equipmentId: 'eq:tools', kind: process === seal ? 'fixture_tar_brush' : 'fixture_vessel_stand', condition: 1, params: process === seal ? {} : { sunExposure: 0 } }], ...over,
});
const act = (at, action) => ({ at, action, residentId: 'res:lantern' });
const sum = xs => (xs ?? []).reduce((a, x) => a + x.amount.value, 0);
const massError = r => sum(r.consumed) + sum(r.drawn) - sum(r.produced) - sum(r.released);
const out = { target: root, host, table: table.version };

// Use the real host assembly implementation, with the science table injected only into this diagnostic.
const L = emptyLedger('w', 'e');
const original = addLot(L, pot({ crack_ppm: 20000, air_leak_tau_min: 258 }));
const snapshot = JSON.stringify(original);
const initial = assemble(L, original.lotId, table, 0).equipment;
const afterWhole = disassemble(L, initial.equipmentId, table).lot;
out.wholeRoundTrip = { conditionAtAssembly: initial.condition, massMg: afterWhole.amount.value, sameQuality: JSON.stringify(afterWhole.quality) === JSON.stringify(original.quality), sourceUnchanged: snapshot === JSON.stringify(original) };
let current = afterWhole; const chain = [];
for (const condition of [.9, 1, .97]) {
  const e = assemble(L, current.lotId, table, chain.length * 1000).equipment;
  L.equipment[e.equipmentId].condition = condition;
  current = disassemble(L, e.equipmentId, table).lot;
  chain.push({ usedCondition: condition, lotMassMg: current.amount.value, quality: current.quality, nextParams: potToEquipmentParams(current) });
}
out.returnChain = chain;

const tar = { lotId: 'lot:tar', materialId: 'wood_tar', amount: { value: 20000, unit: 'mg' }, location: 'shelf', quality: { x_wood_tar_ppm: 1000000 } };
const raw = { ...pot({ sealed: 0, coverage_ppm: 0, x_wood_tar_ppm: 0, history_complete: 1 }), amount: { value: 600000, unit: 'mg' } };
const actuallySealed = step(req(seal, 0, H, [raw, tar], null, [act(60000, 'seal')]));
const healthy = lotOf(actuallySealed.produced[0]);
const sealLedger = emptyLedger('w', 'e');
addLot(sealLedger, healthy);
const sealedEquipment = assemble(sealLedger, healthy.lotId, table, 0).equipment;
sealLedger.equipment[sealedEquipment.equipmentId].condition = .9;
const unknownSeal = disassemble(sealLedger, sealedEquipment.equipmentId, table).lot;
const healthyFill = step(req(leak, 0, H, [healthy, water]));
const wornFill = step(req(leak, 0, H, [unknownSeal, water], null, [], { stop: 'operator' }));
const retest = step(req(leak, 0, H, [unknownSeal], null, [act(60000, 'submerge')], { stop: 'operator' }));
out.A6_unknownSealBecomesOpen = {
  sealedByProcess: { status: actuallySealed.status, quality: healthy.quality },
  healthyFill: { status: healthyFill.status, notes: healthyFill.evidence.notes },
  afterWearQuality: unknownSeal.quality, readSealed: readPot(unknownSeal).sealed,
  wornFill: { status: wornFill.status, consumedMg: sum(wornFill.consumed), produced: wornFill.produced },
  retest: { observations: retest.observations, quality: retest.produced[0]?.quality, params: potToEquipmentParams(lotOf(retest.produced[0])) },
};

const resealed = step(req(seal, 0, H, [unknownSeal, tar], null, [act(60000, 'seal')]));
out.reseal = { status: resealed.status, quality: resealed.produced[0]?.quality, massErrorMg: massError(resealed) };

// Increasing cracks cannot improve the assumed air seal. Return never changes composition or erases old damage.
const checks = { returnCases: 0, airCases: 0, failures: [] };
for (const oldCrack of [0, 1, 20000, 500000, 999999, 1000000]) for (let i = 0; i <= 100; i++) {
  const condition = i / 100, before = pot({ crack_ppm: oldCrack }).quality;
  const copy = JSON.stringify(before), after = potQualityOnReturn(before, condition);
  checks.returnCases++;
  if (JSON.stringify(before) !== copy || after.x_wood_tar_ppm !== before.x_wood_tar_ppm || after.history_complete !== 0 || after.crack_ppm < oldCrack || after.crack_ppm > 1000000) checks.failures.push({ oldCrack, condition, after });
}
for (const absorption of [0, .12, .4]) for (const coverage of [0, .5, .935131, 1]) {
  let prev = Infinity;
  for (let i = 0; i <= 100; i++) {
    const tau = airLeakTauMin({ absorption, coverage, sealed: true, crack: i / 100 }); checks.airCases++;
    if (!Number.isSafeInteger(tau) || tau <= 0 || tau > prev) checks.failures.push({ absorption, coverage, crack: i / 100, tau, prev });
    prev = tau;
  }
}
out.properties = checks;
out.invalidConditions = [-1, 1.1, NaN, Infinity].map(condition => { try { potQualityOnReturn(healthy.quality, condition); return { condition: String(condition), rejected: false }; } catch { return { condition: String(condition), rejected: true }; } });
out.crackVsHumidity = [];
for (const rh of [.75, 1]) {
  const q = req(leak, 0, 3 * D, [pot({ sealed: 0, crack_ppm: 100000, coverage_ppm: 1000000 }), water], null, [], { stop: 'operator', environment: env(rh) });
  const r = step(q);
  out.crackVsHumidity.push({ rh, leftMg: r.produced.find(p => p.materialId === 'process_water')?.amount.value ?? 0, vapourMg: sum(r.released), energy: r.energy, observations: r.observations, massErrorMg: massError(r) });
}
if (process.argv[4]) {
  const { scienceStep: oldStep } = await load(resolve(process.argv[4]), 'src/science/step/index.ts');
  const lots = [pot({ sealed: 0 }), water];
  const first = req(leak, 0, H, lots);
  const old = oldStep(first);
  const restored = step(req(leak, H, 2 * H, lots, JSON.parse(JSON.stringify(old.state)), [], { stop: 'operator' }));
  const fresh = step(req(leak, H, 2 * H, lots, step(first).state, [], { stop: 'operator' }));
  const key = r => JSON.stringify([r.produced, r.released, r.energy, r.observations]);
  out.oldState = { schema: old.state.schema, status: restored.status, settlementUnchanged: key(restored) === key(fresh) };
}
out.validatorViolations = violations;
console.log(JSON.stringify(out, null, 2));
