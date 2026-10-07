// Read-only review: the 9c3b611 helper, with actual host assembly and reviewed vessel fixtures.
// Run from a checkout with tsx installed:
// node --import tsx --import /host/scripts/node-assets.mjs THIS_FILE /science/9c3b611 /host/a58a1a0 /science/355de03
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [target, host, fixtures] = process.argv.slice(2).map(p => resolve(p));
if (!fixtures) throw new Error('Three checkout paths required: target, host, fixture science');
const load = (base, p) => import(pathToFileURL(`${base}/${p}`));
const { potSherdsQuality } = await load(target, 'src/science/step/vessel.ts');
const { scienceStep } = await load(fixtures, 'src/science/step/index.ts');
const { readPot, TAR_SEAL_PROCESS: seal, LEAK_TEST_PROCESS: leak } = await load(fixtures, 'src/science/step/vessel.ts');
const { validateResult } = await load(fixtures, 'src/science/step/validate.ts');
const { emptyLedger, addLot, assemble, disassemble } = await load(host, 'src/world/process-runner.ts');
const { POT_ASSEMBLY } = await load(host, 'src/world/process-catalog.ts');
// Only an in-memory copy of the real table: neither science nor main is edited.
const table = { ...POT_ASSEMBLY, brokenMaterial: 'pot_sherds', brokenQuality: potSherdsQuality };
const out = { target, host, fixtures, checks: 0, failures: [], chains: [], validatorViolations: [] };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, ok, detail) { out.checks++; if (!ok) out.failures.push({ name, detail }); }
const helperText = base => readFileSync(`${base}/src/science/step/vessel.ts`, 'utf8').match(/export function potSherdsQuality\([\s\S]*?\n\}/)?.[0];
check('target helper unchanged in reviewed 355de03', helperText(target) === helperText(fixtures));
out.helperSHA256 = createHash('sha256').update(helperText(target)).digest('hex');
out.mainBrokenRouteConnectedBeforeReview = !!POT_ASSEMBLY.brokenMaterial;

// This is the proposed reading rule for composition, not a production consumer of sherds (none exists yet).
// Use BigInt division as an independent reference to integer mg rounded down from whole-lot ppm.
function components(lot) {
  const M = lot.amount.value, q = lot.quality ?? {};
  const mg = key => Number(BigInt(M) * BigInt(q[key] ?? 0) / 1000000n);
  const tar = mg('x_wood_tar_ppm'), water = mg('x_water_ppm');
  return { body: M - tar - water, tar, water };
}
const lot = (id, materialId, mg, quality = {}) => ({ lotId: `lot:${id}`, materialId, amount: { value: mg, unit: 'mg' }, location: 'shelf', quality });
const pot = (quality = {}, mg = 600000) => lot('pot', 'fired_pot_test', mg, { capacity_ml: 500, absorption_ppm: 120000, ...quality });
const tar = mg => lot('tar', 'wood_tar', mg, { x_wood_tar_ppm: 1000000 });
const water = () => lot('water', 'process_water', 450000);
const H = 3600000, D = 24 * H;
const req = (process, lots, from = 0, to = H, state = null, extra = {}) => ({
  contract: '0.2.0', requestId: `${process.processId}:${from}`, runId: 'run:sherds-fixture', ...process,
  world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, catalogVersion: 'civ-sci-test-2', seed: 1,
  interval: { from, to }, lots, state, actions: [],
  equipment: [{ equipmentId: 'eq:tool', kind: process === seal ? 'fixture_tar_brush' : 'fixture_vessel_stand', condition: 1, params: { sunExposure: 0 } }],
  energy: process === seal ? [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: (to - from) * .02 }] : [],
  environment: { source: 'record', sampleId: 'weather', effectiveAt: from, airTempC: 28, humidity: .75, windMs: 2 }, ...extra,
});
function step(q) {
  const r = scienceStep(q); out.validatorViolations.push(...validateResult(q, r));
  if (r.status === 'failed') throw new Error(`Fixture refused: ${r.evidence.notes}`);
  return r;
}
function potOf(r) {
  const p = r.produced.find(p => p.materialId === 'fired_pot_test');
  return { ...lot('returned', p.materialId, p.amount.value, p.quality), location: p.into };
}
const forbidden = ['capacity_ml', 'coverage_ppm', 'sealed', 'airtight_known', 'air_leak_tau_min', 'crack_ppm'];
function breakViaHost(source, name) {
  let L = emptyLedger('w', 'e');
  // A fresh test ledger has a fresh ID counter; imported fixture IDs must not collide with its lot:<seq> IDs.
  const original = addLot(L, { ...structuredClone(source), lotId: `lot:fixture:${name}` }), before = JSON.stringify(original);
  const e = assemble(L, original.lotId, table, 1000).equipment;
  if (!e) throw new Error(`Assembly refused: ${name}`);
  L.equipment[e.equipmentId].condition = 0;
  // Break after a real JSON save/load, using the snapshot of the original lot.
  L = JSON.parse(JSON.stringify(L));
  const copy = L.equipment[e.equipmentId].assembled.from;
  const r = disassemble(L, e.equipmentId, table);
  if (!r.lot) throw new Error(`Broken return refused: ${name}: ${r.why}`);
  const s = r.lot, c = components(s), read = readPot(original);
  check(`${name}: mass, material, location and inventory`, s.materialId === 'pot_sherds' && same(s.amount, original.amount) && s.location === original.location &&
    !L.equipment[e.equipmentId] && !L.lots[original.lotId] && Object.keys(L.lots).length === 1);
  check(`${name}: composition after decode`, same(c, { body: read.body, tar: read.tar, water: read.water }) &&
    c.body >= 0 && c.body + c.tar + c.water === original.amount.value, { before: components(original), after: c });
  check(`${name}: material quality and unknown history`, s.quality.absorption_ppm === original.quality.absorption_ppm &&
    s.quality.history_complete === original.quality.history_complete && forbidden.every(k => !Object.hasOwn(s.quality, k)));
  check(`${name}: source snapshots unchanged`, JSON.stringify(original) === before && same(copy, original));
  const saved = JSON.stringify(L), again = disassemble(L, e.equipmentId, table);
  check(`${name}: duplicate return does not duplicate mass`, !!again.why && JSON.stringify(L) === saved);
  check(`${name}: sherds cannot be reassembled as a pot`, !!assemble(L, s.lotId, table, 2000).why && JSON.stringify(L) === saved);
  return { name, massMg: s.amount.value, componentsMg: c, quality: s.quality };
}

const coated = potOf(step(req(seal, [pot(), tar(15000)])));
const rawWet = potOf(step(req(leak, [pot(), water()], 0, 3 * D, null, { stop: 'operator' })));
const coatedWet = potOf(step(req(leak, [coated, water()], 0, 3 * D, null, { stop: 'operator' })));
const sealedWet = potOf(step(req(seal, [coatedWet, tar(5000)], 0, H, null, { actions: [{ at: 60000, action: 'seal', residentId: 'lantern' }] })));
const wetFirst = step(req(leak, [coated, water()]));
const unknownWet = potOf(step(req(leak, [coated, water()], H, 2 * H, wetFirst.state, { stop: 'operator', environment: { source: 'unknown' } })));
for (const [name, p] of [['raw', pot()], ['coated', coated], ['raw-wet', rawWet], ['coated-wet', coatedWet], ['sealed-wet', sealedWet], ['incomplete-wet', unknownWet]]) {
  out.chains.push(breakViaHost(p, name));
}
// Preserve incomplete history even through the previously reviewed worn-sealed return route.
let L = emptyLedger('w', 'e');
const uncertain = { ...sealedWet, quality: { ...sealedWet.quality, history_complete: 0 } };
const inserted = addLot(L, uncertain), e = assemble(L, inserted.lotId, table, 0).equipment;
L.equipment[e.equipmentId].condition = .9;
const worn = disassemble(L, e.equipmentId, table).lot;
check('fixture: sealed, worn, incomplete', worn.quality.sealed === 1 && worn.quality.airtight_known === 0 && worn.quality.history_complete === 0);
out.chains.push(breakViaHost(worn, 'worn-sealed-incomplete'));

// Whole ppm are copied, not decoded then re-encoded. Include zero vs absent, sum exactly one million,
// ppm granularity boundaries, and lots heavier than a million mg. Mutating the input is forbidden.
out.ppmCases = 0;
for (const mg of [1, 13, 600000, 615001, 672001, 1000001, 1500003]) {
  for (const [t, w] of [[0, 0], [1, 0], [0, 1], [24390, 107142], [333333, 666667], [499999, 500001], [1000000, 0], [0, 1000000]]) {
    for (const history of [undefined, 0, 1]) {
      const q = { absorption_ppm: 0, x_wood_tar_ppm: t, x_water_ppm: w,
        ...(history === undefined ? {} : { history_complete: history }), capacity_ml: 500, sealed: 1, airtight_known: 0 };
      const before = JSON.stringify(q), after = potSherdsQuality(Object.freeze(q));
      const original = lot('q', 'fired_pot_test', mg, q), result = lot('s', 'pot_sherds', mg, JSON.parse(JSON.stringify(after)));
      const decoded = readPot(original);
      out.ppmCases++;
      check('ppm matrix: exact readback and independent copy', same(components(original), components(result)) &&
        same(components(result), { body: decoded.body, tar: decoded.tar, water: decoded.water }) &&
        JSON.stringify(q) === before && q !== after && after.absorption_ppm === 0 && after.history_complete === history &&
        Number.isInteger(after.x_wood_tar_ppm ?? 0) && Number.isInteger(after.x_water_ppm ?? 0) && forbidden.every(k => !Object.hasOwn(after, k)), { mg, t, w, history });
    }
  }
}
// Invalid composition is the input gate's job: it must never enter the host's stored snapshot.
out.refusedInvalidInputs = 0;
for (const quality of [{ x_water_ppm: .5 }, { x_wood_tar_ppm: -1 }, { x_water_ppm: NaN }, { x_water_ppm: Infinity }, { x_water_ppm: 600000, x_wood_tar_ppm: 600000 }]) {
  const ledger = emptyLedger('w', 'e'), p = addLot(ledger, pot(quality));
  const result = assemble(ledger, p.lotId, table, 0);
  check('invalid composition refused before snapshot', !!result.why && !!ledger.lots[p.lotId] && Object.keys(ledger.equipment).length === 0, quality);
  out.refusedInvalidInputs++;
}
check('fixture steps satisfy contract', out.validatorViolations.length === 0, out.validatorViolations);
console.log(JSON.stringify(out, null, 2));
if (out.failures.length) process.exitCode = 1;
