// Compare the new lamp with the pinned 0.1.1 implementation for legacy dry wicks.
import assert from 'node:assert/strict';
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { oilLampStep, OIL_LAMP_PROCESS, wickQuality } from '../src/science/step/oil-lamp';
import { oilLampStep as oldStep, OIL_LAMP_PROCESS as OLD } from './fixtures/oil-lamp-0.1.1';
import { validateResult } from '../src/science/step/validate';

type Action = [number, string, Record<string, number>?];
type Scenario = {
  name: string;
  temperature: number;
  end: number;
  actions: Action[];
  oilWaterPpm?: number;
  charPpm?: number;
  wind?: number;
  rain?: number;
  roofed?: number;
  lost?: boolean;
};
const H = 3_600_000;
const scenarios: Scenario[] = [
  {
    name: 'warm night with trim and looks',
    temperature: 27,
    end: 2 * H + 1234,
    actions: [[7, 'light'], [H + 13, 'trim'], [H + 19, 'look'], [2 * H + 1233, 'put_out']],
  },
  {
    name: 'cool oil warmed before lighting',
    temperature: 10,
    end: 20 * 60_000 + 17,
    actions: [[0, 'warm'], [0, 'light'], [737, 'look'], [20 * 60_000 + 16, 'put_out']],
  },
  {
    name: 'cold oil refuses ignition',
    temperature: 10,
    end: 60_017,
    actions: [[0, 'light'], [60_016, 'put_out']],
  },
  {
    name: 'wet oil and an already charred dry wick',
    temperature: 27,
    end: H + 17,
    oilWaterPpm: 20_000,
    charPpm: 700_000,
    actions: [[0, 'trim'], [0, 'light'], [17_019, 'wick_out', { wickOut: 2 }], [H + 16, 'put_out']],
  },
  {
    name: 'unroofed rain',
    temperature: 27,
    roofed: 0,
    rain: 5,
    end: 60_017,
    actions: [[0, 'light'], [60_016, 'put_out']],
  },
  {
    name: 'dish loss at the end of an odd request',
    temperature: 27,
    end: 12 * 60_000 + 19,
    actions: [[0, 'light'], [7_003, 'look']],
    lost: true,
  },
];

const extraDiagnostics = [
  'wickWaterEvaporatedMg',
  'wickLatentHeatJ',
  'oilLatentHeatJ',
  'latentHeatJ',
  'directAirHeatJ',
];

function normal(result: ScienceStepResult) {
  const r = structuredClone(result);
  r.evidence.evaluatorVersion = 'compared-evaluator';
  r.state.schema = 'compared-state';
  if (r.state.data && typeof r.state.data === 'object') {
    delete (r.state.data as Record<string, unknown>).wickParts;
  }
  for (const key of extraDiagnostics) {
    delete (r.diagnostics as Record<string, unknown>)[key];
  }
  return r;
}

function lots(fiber: 1 | 2 | 3, scenario: Scenario): LotView[] {
  const water = scenario.oilWaterPpm ?? 0;
  return [
    {
      lotId: 'oil',
      materialId: 'coconut_oil',
      amount: { value: 60_000, unit: 'mg' },
      location: 'shelf',
      quality: {
        x_coconut_fat_ppm: 1_000_000 - water,
        ...(water ? { x_water_ppm: water } : {}),
        history_complete: 1,
      },
    },
    {
      lotId: 'wick',
      materialId: 'lamp_wick',
      amount: { value: 2000, unit: 'mg' },
      location: 'shelf',
      quality: {
        ...wickQuality(fiber, 4),
        char_ppm: scenario.charPpm ?? 0,
        history_complete: 1,
      },
    },
  ];
}

function compare(
  fiber: 1 | 2 | 3,
  scenario: Scenario,
  chunk: number,
  inputs = lots(fiber, scenario),
): ScienceStepResult {
  let oldState: ScienceStepRequest['state'] = null;
  let newState: ScienceStepRequest['state'] = null;
  let last: ScienceStepResult | undefined;
  for (let from = 0; from < scenario.end; from += chunk) {
    const to = Math.min(scenario.end, from + chunk);
    const q: ScienceStepRequest = {
      contract: '0.2.0',
      requestId: 'compare:' + from,
      world: { worldId: 'comparison', worldEpoch: 'test', worldVersion: 1 },
      runId: 'lamp',
      ...OIL_LAMP_PROCESS,
      catalogVersion: 'civ-sci-test-2',
      interval: { from, to },
      state: newState,
      environment: {
        sampleId: 'weather:' + from,
        source: 'record',
        effectiveAt: from,
        airTempC: scenario.temperature,
        humidity: 0.8,
        windMs: scenario.wind ?? 1,
        rainMmH: scenario.rain ?? 0,
      },
      lots: inputs,
      equipment: [{
        equipmentId: 'dish',
        kind: 'lamp_dish',
        catalogEntry: 'lamp_dish',
        catalogVersion: 'civ-sci-test-2',
        condition: 1,
        params: {
          capacityMl: 100,
          absorptionPpm: 50_000,
          massG: 100,
          shelter: 0.8,
          roofed: scenario.roofed ?? 1,
        },
      }],
      energy: [],
      actions: scenario.actions.filter(([at]) => at >= from && at < to)
        .map(([at, action, params]) => ({
          at,
          action,
          residentId: 'resident',
          ...(params ? { params } : {}),
        })),
      seed: 9,
      ...(scenario.lost && to === scenario.end ? { stop: 'equipment-lost' as const } : {}),
    };
    const oldRequest = { ...q, processVersion: OLD.processVersion, state: oldState };
    const oldResult = oldStep(oldRequest);
    const newResult = oilLampStep(q);
    assert.deepEqual(validateResult(oldRequest, oldResult), []);
    assert.deepEqual(validateResult(q, newResult), []);
    assert.deepEqual(normal(newResult), normal(oldResult),
      scenario.name + ' fiber=' + fiber + ' chunk=' + chunk + ' from=' + from);
    oldState = JSON.parse(JSON.stringify(oldResult.state));
    newState = JSON.parse(JSON.stringify(newResult.state));
    last = newResult;
    if (last.status !== 'running') break;
  }
  assert.ok(last);
  return last;
}

let cases = 0;
for (const fiber of [1, 2, 3] as const) {
  for (const scenario of scenarios) {
    for (const chunk of [scenario.end, 737, 29 * 60_000 + 13]) {
      compare(fiber, scenario, chunk);
      cases++;
    }
  }
}

// The baseline and the new step both receive the same physically returned dry lots.
for (const fiber of [1, 2, 3] as const) {
  const first = compare(fiber, scenarios[0], scenarios[0].end);
  const inputs = first.produced
    .filter((p) => p.materialId === 'coconut_oil' || p.materialId === 'lamp_wick')
    .map((p, i): LotView => ({
      lotId: 'returned:' + i,
      materialId: p.materialId,
      amount: p.amount,
      location: p.into!,
      quality: p.quality,
    }));
  compare(fiber, { ...scenarios[0], end: 60_017, actions: [[0, 'light'], [60_016, 'put_out']] },
    737, inputs);
  cases++;
}

console.log('PASS legacy dry comparison: ' + cases + ' trajectories, every interval identical after version and additional-metadata normalization.');
