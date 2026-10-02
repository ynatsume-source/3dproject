import { pathToFileURL } from 'node:url';
import { createFixture } from './fixtures.ts';
import { applyCommand, audit, checkpoint, restoreCheckpoint } from './kernel.ts';
import { PROCESS } from '../../src/science/fixture-profile.ts';

export function runDemo() {
  let world = createFixture();
  let serial = 0;
  const send = action => {
    world = applyCommand(world, { commandId: `demo-${++serial}`, worldId: world.worldId,
      worldEpoch: world.worldEpoch, expectedVersion: world.worldVersion, ...action });
  };
  const start = (processId, lotId, equipmentId, extra = {}) => {
    send({ kind: 'start', processId, lotId, equipmentId, expectedLotRevision: world.lots[lotId].revision,
      expectedEquipmentRevision: world.equipment[equipmentId].revision, ...extra });
  };
  const weigh = lotId => { start(PROCESS.weigh.id, lotId, 'balance'); send({ kind: 'advance', seconds: 10 }); };
  for (const [lotId, thicknessMm] of [['a', 5], ['b', 10]]) {
    start(PROCESS.shape.id, lotId, 'bench', { thicknessMm });
    send({ kind: 'advance', seconds: 60 });
    weigh(lotId);
    start(PROCESS.dry.id, lotId, 'dryer', { durationLimitS: 2400 });
    send({ kind: 'advance', seconds: 1200 });
    // Operational checkpoint: no wall-clock catch-up, no invented heat while offline.
    send({ kind: 'pause' });
    world = restoreCheckpoint(checkpoint(world));
    send({ kind: 'resume' });
    send({ kind: 'advance', seconds: 2000 });
    weigh(lotId);
  }
  const trials = ['a', 'b'].map(lotId => {
    const measurements = world.observations.filter(o => o.lotId === lotId);
    const drying = Object.values(world.runs).find(r => r.lotId === lotId && r.processId === PROCESS.dry.id);
    return { lotId, thicknessMm: world.lots[lotId].thicknessMm,
      beforeMg: measurements[0].measuredMassMg, afterMg: measurements[1].measuredMassMg,
      observedMassLossMg: measurements[0].measuredMassMg - measurements[1].measuredMassMg,
      measurementRunIds: measurements.map(o => o.runId), dryingRunId: drying.id,
      outcome: drying.status, reason: drying.failure, durationS: drying.elapsedS, inputJ: drying.inputJ };
  });
  return { world, report: {
    scope: 'test-fixture', modelVersion: world.modelVersion,
    question: '同じ組成・質量の試験片で、厚みを変えると、同じ乾燥時間上限内の質量減少はどう変わるか。',
    hypothesis: '合成した移動速度モデルでは、薄い試験片ほど質量が減る。実物の粘土では未検証。',
    comparison: { changed: 'thicknessMm', controlled: ['initial composition and mass', '60 C target', '100 W source', '2400 s heating/drying limit'], resolutionMg: 100 },
    trials, conclusion: 'このfixtureでは5 mmの試験片の質量減少が大きい。乾燥曲線・割れ・焼成品質の実測結果ではなく、作り方の解禁もしない。',
    audit: audit(world), sourceRemainingJ: world.equipment.dryer.energyJ,
    firstLightAchieved: false, firingEnabled: false,
  } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(runDemo().report, null, 2));
}
