// Focused review of 70fed2f: version compatibility, drawn envelopes, and the proposed uniform energy delivery rule.
// Usage: node --import tsx <this file> /absolute/science [/absolute/copy-with-0.2.0-proposal]
// Read-only. Exit 0 means the diagnostic completed; inspect deliveryWithinReportedInterval for the energy finding.
import { pathToFileURL } from 'node:url';
const roots = process.argv.slice(2);
if (!roots.length || roots.some(p => !p.startsWith('/'))) throw new Error('Pass absolute checkout/copy paths.');
const world = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const lot = { lotId: 'lot:clay', materialId: 'prepared_clay', amount: { value: 45000, unit: 'mg' }, location: 'site:bench',
  quality: { water_ppm: 193548, xd_kaolinite_ppm: 450000, xd_quartz_ppm: 300000, xd_calcite_ppm: 20000, history_complete: 1 } };
const shape = { contract: '0.1.0', requestId: 'r:shape', runId: 'run:shape', world,
  processId: 'p11x_test_tile_shape', processVersion: 'fixture-2', catalogVersion: 'civ-sci-test-2',
  interval: { from: 0, to: 60000 }, state: null, seed: 3,
  environment: { sampleId: 'env:review', source: 'simulation', effectiveAt: 0 }, lots: [lot],
  equipment: [{ equipmentId: 'eq:bench', kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: 'civ-sci-test-2',
    condition: 1, params: { widthMm: 50, lengthMm: 50, thicknessMm: 10 } }],
  energy: [{ sourceId: 'src:work', kind: 'mechanical', maxJ: 120 }], actions: [] };
const weigh = { ...shape, requestId: 'r:weigh', runId: 'run:weigh', processId: 'fixture_mass_measure',
  interval: { from: 0, to: 10000 },
  equipment: [{ equipmentId: 'eq:balance', kind: 'fixture_balance', catalogEntry: 'fixture_balance', catalogVersion: 'civ-sci-test-2', condition: 1 }],
  energy: [{ sourceId: 'src:fixture-mains', kind: 'electric', maxJ: 10 }],
  actions: [{ at: 0, residentId: 'res:dot', action: 'read-balance' }] };
const strip = ({ contract, drawn, ...rest }) => rest;
const report = [];
for (const root of roots) {
  const get = p => import(pathToFileURL(`${root}/${p}`));
  const { scienceStep } = await get('src/science/step/index.ts');
  const { validateResult } = await get('src/science/step/validate.ts');
  const { SCIENCE_CONTRACT_VERSION } = await get('src/world/science-contract.ts');
  function check(request) {
    const result = scienceStep(request);
    return { request, result, violations: validateResult(request, result) };
  }
  const cases = [
    ['weigh-completed', weigh], ['shape-completed', shape],
    ['pot-completed', { ...shape, processId: 'p11_pottery_shape' }],
    ['shape-running', { ...shape, interval: { from: 0, to: 30000 }, energy: [{ ...shape.energy[0], maxJ: 60 }] }],
    ['shape-needs-input', { ...shape, energy: [{ ...shape.energy[0], maxJ: 60 }] }],
    ['shape-stopped', { ...shape, interval: { from: 0, to: 30000 }, stop: 'operator' }],
    ['shape-failed', { ...shape, lots: [{ ...lot, quality: { ...lot.quality, xd_quartz_ppm: -1 } }] }],
  ];
  const compatibility = [];
  for (const [name, input] of cases) {
    const runs = ['0.1.0', '0.2.0', '0.1.7', '0.2.7'].map(contract => check({ ...input, contract }));
    compatibility.push({ name, equalExceptEnvelope: runs.every(r => JSON.stringify(strip(r.result)) === JSON.stringify(strip(runs[0].result))),
      runs: runs.map(r => ({ contract: r.result.contract, status: r.result.status, hasDrawn: Object.hasOwn(r.result, 'drawn'), drawn: r.result.drawn, violations: r.violations })) });
  }
  const first = check({ ...shape, interval: { from: 0, to: 30000 }, energy: [{ ...shape.energy[0], maxJ: 60 }] });
  const resumed = ['0.1.0', '0.2.0'].map(contract => check({ ...shape, contract, requestId: 'r:resume',
    interval: { from: 30000, to: 60000 }, energy: [{ ...shape.energy[0], maxJ: 60 }], state: JSON.parse(JSON.stringify(first.result.state)) }));
  const rejectedEnvelopes = [];
  for (const processId of ['fixture_mass_measure', 'p11x_test_tile_shape', 'p11_pottery_shape', 'p12x_test_tile_dry',
    'p13x_test_tile_fire', 'p20x_lime_calcine_test', 'p21x_lime_hydrate_test', 'm01x_tile_soak_test', 'p13w_test_tile_wood_fire', 'not-implemented']) {
    for (const contract of ['0.1.0', '0.2.0']) {
      const r = check({ ...shape, contract, processId, processVersion: 'unsupported' });
      rejectedEnvelopes.push({ processId, contract, status: r.result.status, hasDrawn: Object.hasOwn(r.result, 'drawn'), drawn: r.result.drawn, violations: r.violations });
    }
  }
  const ok02 = check({ ...weigh, contract: '0.2.0' });
  const { drawn, ...missing } = ok02.result;
  const ok01 = check(weigh);
  const validatorMutations = { missing02: validateResult(ok02.request, missing), extra01: validateResult(weigh, { ...ok01.result, drawn: [] }) };
  const energyDelivery = [];
  for (const [name, input] of [['weigh-30s-10J', { ...weigh, interval: { from: 0, to: 30000 } }],
    ['shape-120s-120J', { ...shape, interval: { from: 0, to: 120000 } }]]) {
    const { request, result, violations } = check({ ...input, contract: '0.2.0' });
    const duration = request.interval.to - request.interval.from;
    const elapsed = result.simulated.to - request.interval.from;
    const usedJ = result.energy.reduce((sum, e) => sum + e.usedJ, 0);
    const deliveredJ = request.energy[0].maxJ * elapsed / duration;
    energyDelivery.push({ name, request, result, usedJ, deliveredJ,
      deliveryWithinReportedInterval: usedJ <= deliveredJ, violations });
  }
  report.push({ root, declaredContract: SCIENCE_CONTRACT_VERSION, compatibility,
    resumedAcrossAdoption: { equalExceptEnvelope: JSON.stringify(strip(resumed[0].result)) === JSON.stringify(strip(resumed[1].result)),
      statuses: resumed.map(r => r.result.status), violations: resumed.map(r => r.violations) },
    rejectedEnvelopes, validatorMutations, energyDelivery });
}
console.log(JSON.stringify(report, null, 2));
