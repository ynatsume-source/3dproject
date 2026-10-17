// Wet wick conservation, timing and return-chain checks.
import assert from 'node:assert/strict';
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { oilLampStep, OIL_LAMP_PROCESS, wickQuality } from '../src/science/step/oil-lamp';
import {
  readLampWick,
  settleLampWick,
  wickCanLight,
  wickCompositionQuality,
  type WickComposition,
} from '../src/science/step/lamp-wick';
import { validateResult } from '../src/science/step/validate';
import { pv } from '../src/science/params';

const M = 60_000;
const H = 60 * M;
const WET: WickComposition = { fiberDryMg: 1600, pithDryMg: 400, waterMg: 200 };
let groups = 0;

function test(name: string, body: () => void) {
  body();
  console.log('PASS ' + name);
  groups++;
}

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const parts = (value: WickComposition) => ({
  fiberDryMg: value.fiberDryMg,
  pithDryMg: value.pithDryMg,
  waterMg: value.waterMg,
});
const mass = (value: WickComposition) =>
  value.fiberDryMg + value.pithDryMg + value.waterMg;

function wick(composition: WickComposition | null = WET, extra = {}): LotView {
  return {
    lotId: 'wick',
    materialId: 'lamp_wick',
    amount: { value: composition ? mass(composition) : 2000, unit: 'mg' },
    location: 'shelf',
    quality: {
      ...wickQuality(2, 4, composition ?? undefined),
      history_complete: 1,
      ...extra,
    },
  };
}

function oil(): LotView {
  return {
    lotId: 'oil',
    materialId: 'coconut_oil',
    amount: { value: 60_000, unit: 'mg' },
    location: 'shelf',
    quality: { x_coconut_fat_ppm: 1_000_000, history_complete: 1 },
  };
}

type Action = [number, string, Record<string, number>?];

function request(
  from: number,
  to: number,
  state: ScienceStepRequest['state'],
  lots: LotView[],
  actions: Action[] = [],
): ScienceStepRequest {
  return {
    contract: '0.2.0',
    requestId: 'wet:' + from + ':' + to,
    world: { worldId: 'wet', worldEpoch: 'test', worldVersion: 1 },
    runId: 'lamp',
    ...OIL_LAMP_PROCESS,
    catalogVersion: 'civ-sci-test-2',
    interval: { from, to },
    state,
    environment: {
      sampleId: 'weather:' + from,
      source: 'record',
      effectiveAt: from,
      airTempC: 27,
      humidity: 0.8,
      windMs: 1,
      rainMmH: 0,
    },
    lots,
    equipment: [{
      equipmentId: 'dish',
      kind: 'lamp_dish',
      catalogEntry: 'lamp_dish',
      catalogVersion: 'civ-sci-test-2',
      condition: 1,
      params: {
        capacityMl: 80,
        absorptionPpm: 0,
        massG: 120,
        shelter: 0.8,
        roofed: 1,
      },
    }],
    energy: [],
    seed: 17,
    actions: actions.map(([at, action, params]) => ({
      at,
      residentId: 'resident',
      action,
      ...(params ? { params } : {}),
    })),
  };
}

function step(q: ScienceStepRequest) {
  const r = oilLampStep(q);
  assert.deepEqual(validateResult(q, r), []);
  return r;
}

function run(
  end: number,
  actions: Action[],
  chunk = end,
  lots: LotView[] = [oil(), wick()],
) {
  let state: ScienceStepRequest['state'] = null;
  const results: ScienceStepResult[] = [];
  for (let from = 0; from < end; from += chunk) {
    const to = Math.min(end, from + chunk);
    const q = request(from, to, state, lots, actions.filter(([at]) => at >= from && at < to));
    const r = step(q);
    assert.deepEqual(step(q), r);
    results.push(r);
    state = json(r.state);
    if (r.status !== 'running') break;
  }
  return {
    results,
    last: results.at(-1)!,
    observations: results.flatMap((r) => r.observations),
    usedJ: results.reduce((n, r) => n + r.energy.reduce((s, e) => s + e.usedJ, 0), 0),
    lostJ: results.reduce((n, r) => n + r.energy.reduce((s, e) => s + e.lostJ, 0), 0),
  };
}

function d(r: ScienceStepResult, key: string): number {
  const value = (r.diagnostics as Record<string, unknown>)[key];
  assert.equal(typeof value, 'number', key);
  assert.ok(Number.isFinite(value), key);
  return value as number;
}

function balance(r: ScienceStepResult) {
  const sum = (xs: { amount: { value: number } }[]) =>
    xs.reduce((n, x) => n + x.amount.value, 0);
  assert.equal(sum(r.consumed) + sum(r.drawn ?? []), sum(r.produced) + sum(r.released));
}

function back(r: ScienceStepResult, materialId: string, lotId = materialId): LotView {
  const p = r.produced.find((x) => x.materialId === materialId)!;
  assert.ok(p, materialId);
  return { lotId, materialId, amount: p.amount, location: p.into!, quality: p.quality };
}

function key(r: ReturnType<typeof run>, observations = true) {
  return [
    r.last.produced,
    r.last.released,
    r.last.drawn,
    r.last.status,
    r.last.simulated.to,
    r.last.state,
    r.last.diagnostics,
    r.usedJ,
    r.lostJ,
    ...(observations ? [r.observations] : []),
  ];
}

test('legacy dry and explicit components read as exact integer mg', () => {
  const legacy = readLampWick(wick(null));
  assert.equal(legacy.explicit, false);
  assert.deepEqual(parts(legacy), { fiberDryMg: 2000, pithDryMg: 0, waterMg: 0 });
  const wet = readLampWick(wick());
  assert.equal(wet.explicit, true);
  assert.deepEqual(parts(wet), WET);
  assert.deepEqual(wickCompositionQuality(WET), {
    fiber_dry_mg: 1600,
    attached_pith_dry_mg: 400,
    water_mg: 200,
  });
});

test('malformed components fail before consumption', () => {
  for (const change of [
    { fiber_dry_mg: -1 },
    { fiber_dry_mg: 1.5 },
    { fiber_dry_mg: NaN },
    { fiber_dry_mg: Infinity },
    { attached_pith_dry_mg: 401 },
    { water_mg: -1 },
  ]) {
    const bad = wick(WET, change);
    assert.throws(() => readLampWick(bad));
    const result = step(request(0, 1000, null, [oil(), bad], [[0, 'light']]));
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.consumed, []);
    assert.deepEqual(result.produced, []);
  }
  const partial = wick();
  delete partial.quality!.water_mg;
  assert.throws(() => readLampWick(partial));
});

test('ten percent includes pith; one mg above returns sensory refusal', () => {
  assert.ok(wickCanLight(WET));
  assert.equal(wickCanLight({ ...WET, waterMg: 201 }), false);
  const lit = run(1001, [[0, 'light'], [1000, 'put_out']]);
  assert.ok(d(lit.last, 'litSeconds') > 0);
  const wet = run(1001, [[0, 'light'], [1000, 'put_out']], 1001,
    [oil(), wick({ ...WET, waterMg: 201 })]);
  assert.equal(d(wet.last, 'litSeconds'), 0);
  assert.equal(wet.usedJ, 0);
  assert.ok(wet.observations.some((o) => o.text === '湿っていて火がつかない'));
  balance(wet.last);
});

test('waiting and looking evaporate no wick water', () => {
  const r = run(H + 1, [[17, 'look'], [M, 'look'], [H, 'put_out']]);
  assert.deepEqual(parts(readLampWick(back(r.last, 'lamp_wick'))), WET);
  assert.equal(d(r.last, 'wickWaterEvaporatedMg'), 0);
  assert.equal(r.usedJ, 0);
  balance(r.last);
});

test('a trimmed damp tip retains its water and generates no heat', () => {
  const r = run(1001, [[0, 'trim'], [1000, 'put_out']], 1001,
    [oil(), wick(WET, { char_ppm: 1_000_000 })]);
  const left = readLampWick(back(r.last, 'lamp_wick'));
  const cut = back(r.last, 'wick_char').quality!;
  assert.ok(cut.water_mg > 0);
  assert.equal(left.waterMg + cut.water_mg, WET.waterMg);
  assert.equal(left.fiberDryMg + cut.fiber_dry_mg, WET.fiberDryMg);
  assert.equal(left.pithDryMg + cut.attached_pith_dry_mg, WET.pithDryMg);
  assert.equal(d(r.last, 'wickWaterEvaporatedMg'), 0);
  assert.equal(r.usedJ, 0);
  balance(r.last);
});

test('combustion closes O2 and spends latent heat once within total loss', () => {
  const r = run(20 * M + 1, [[0, 'light'], [20 * M, 'put_out']]);
  assert.equal(r.last.status, 'completed');
  balance(r.last);
  assert.ok(r.last.drawn!.some((x) => x.materialId === 'o2' && x.amount.value > 0));
  const water = d(r.last, 'wickWaterEvaporatedMg');
  const latent = d(r.last, 'wickLatentHeatJ');
  assert.ok(water > 0);
  assert.ok(Math.abs(latent - water * pv('latentHeatWater100') / 1e6) < 1e-8);
  assert.ok(d(r.last, 'otherAirHeatJ') >= 0);
  assert.ok(Math.abs(d(r.last, 'otherAirHeatJ') + d(r.last, 'latentHeatJ') - r.usedJ) < 1.01);
  assert.equal(r.usedJ, r.lostJ);
});

test('fiber and attached pith have the same dry combustion chemistry', () => {
  const actions: Action[] = [[0, 'light'], [10 * M, 'put_out']];
  const a = run(10 * M + 1, actions);
  const b = run(10 * M + 1, actions, 10 * M + 1,
    [oil(), wick({ fiberDryMg: 2000, pithDryMg: 0, waterMg: 200 })]);
  assert.deepEqual(a.last.released, b.last.released);
  assert.deepEqual(a.last.drawn, b.last.drawn);
  assert.equal(a.usedJ, b.usedJ);
});

test('returned damp wick can be read and lit again', () => {
  const a = run(20 * M + 1, [[0, 'light'], [20 * M, 'put_out']]);
  const returned = back(a.last, 'lamp_wick', 'again');
  const composition = readLampWick(returned);
  assert.ok(composition.waterMg > 0);
  assert.ok(wickCanLight(composition));
  const b = run(10 * M + 1, [[0, 'light'], [10 * M, 'put_out']], 10 * M + 1,
    [back(a.last, 'coconut_oil', 'again-oil'), returned]);
  assert.ok(d(b.last, 'litSeconds') > 0);
  balance(a.last);
  balance(b.last);
});

test('odd cuts, JSON and repeated confirmation preserve every physical result', () => {
  const end = 17 * M + 1119;
  const actions: Action[] = [
    [7, 'light'],
    [1107, 'look'],
    [3 * M + 13, 'wick_out', { wickOut: 2 }],
    [7 * M + 19, 'trim'],
    [13 * M + 29, 'look'],
    [end - 1, 'put_out'],
  ];
  const whole = run(end, actions);
  for (const chunk of [737, 29_003]) {
    assert.deepEqual(key(run(end, actions, chunk)), key(whole));
  }
});

test('extra looks do not change the wet flame', () => {
  const end = 4 * M + 17;
  const actions: Action[] = [[7, 'light'], [end - 1, 'put_out']];
  const looks: Action[] = [[8, 'look'], [999, 'look'], [1007, 'look'], [2501, 'look']];
  assert.deepEqual(key(run(end, [...actions, ...looks], 737), false),
    key(run(end, actions), false));
});

test('small integer settlements conserve each component without negative mass', () => {
  for (let f = 1; f <= 7; f++) {
    for (let p = 0; p <= 3; p++) {
      for (let w = 0; w <= 3; w++) {
        const source = { fiberDryMg: f, pithDryMg: p, waterMg: w };
        for (let b = 0; b <= f + p; b++) {
          for (let t = 0; t <= f + p - b; t++) {
            const r = settleLampWick(source, b, t);
            for (const part of [r.burned, r.trimmed, r.left]) {
              assert.ok(Object.values(part).every((n) => Number.isSafeInteger(n) && n >= 0));
            }
            for (const k of ['fiberDryMg', 'pithDryMg', 'waterMg'] as const) {
              assert.equal(r.burned[k] + r.trimmed[k] + r.left[k], source[k]);
            }
            assert.equal(r.burned.fiberDryMg + r.burned.pithDryMg, b);
            assert.equal(r.trimmed.fiberDryMg + r.trimmed.pithDryMg, t);
            if (b === 0) assert.equal(r.burned.waterMg, 0);
          }
        }
      }
    }
  }
});

test('repeated tiny wet burns charge dry fuel and fund the evaporated water', () => {
  let current = wick({ fiberDryMg: 100, pithDryMg: 10, waterMg: 11 });
  for (let n = 0; n < 15; n++) {
    const before = readLampWick(current);
    const r = run(2, [[0, 'light'], [1, 'put_out']], 2, [oil(), current]);
    balance(r.last);
    const next = back(r.last, 'lamp_wick', 'tiny:' + n);
    const after = readLampWick(next);
    const burnedDry = before.dryMg - after.dryMg;
    const evaporated = before.waterMg - after.waterMg;
    assert.ok(burnedDry >= 0 && evaporated >= 0);
    if (evaporated > 0) {
      assert.ok(burnedDry > 0);
      assert.ok(r.usedJ >= Math.floor(evaporated * pv('latentHeatWater100') / 1e6));
    }
    assert.ok(wickCanLight(after));
    assert.equal(d(r.last, 'wickWaterEvaporatedMg'), evaporated);
    const chargedOil = 60_000 - back(r.last, 'coconut_oil').amount.value;
    assert.ok(r.usedJ <= Math.ceil(
      burnedDry * pv('woodLhvDry') / 1e6
      + chargedOil * pv('lampOilHeatJPerKg') / 1e6,
    ));
    current = next;
  }
});

test('old runs are refused and observations contain no hidden numbers', () => {
  const fresh = step(request(0, 1000, null, [oil(), wick()], [[0, 'light']]));
  assert.equal(fresh.state.schema, 'civ-sci.oil-lamp/3');
  const relabelled = json(fresh.state);
  delete (relabelled.data as Record<string, unknown>).wickParts;
  const forged = step(request(1000, 2000, relabelled, [oil(), wick()]));
  assert.equal(forged.status, 'failed');
  assert.match(forged.evidence.notes!, /corrupt-state/);
  const q = request(1000, 2000, { schema: 'civ-sci.oil-lamp/2', data: {} }, [oil(), wick()]);
  const old = step(q);
  assert.equal(old.status, 'failed');
  assert.match(old.evidence.notes!, /unsupported-state-schema/);
  q.state = null;
  q.interval = { from: 0, to: 1000 };
  q.processVersion = '0.1.1';
  assert.equal(step(q).status, 'failed');
  const r = run(M + 1, [[0, 'light'], [1007, 'look'], [M, 'put_out']]);
  for (const o of r.observations) {
    assert.equal(o.value, undefined);
    assert.doesNotMatch(o.text ?? '', /[0-9]|ppm|mg|潜熱|係数|water_mg|fiber_dry_mg/);
  }
});

console.log('PASS wet wick: ' + groups + ' groups.');
