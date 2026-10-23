import {
  bambooQualityFromLegacyMass,
  sailCellWeather
} from '../src/science/prototypes/sail-raft-inputs';
import {
  createCompactSailManufacturingModel,
  createSailManufacturingModel,
  SAIL_MANUFACTURE_RECEIPT_LIMIT,
  SAIL_LEAF_DRYING_ID,
  type SailManufactureInput
} from '../src/science/prototypes/sail-raft-manufacturing';
import {
  canonical,
  SAIL_RAFT_ID,
  SAIL_RAFT_ISLAND_ID,
  SAIL_RAFT_WORLD_ID
} from '../src/science/prototypes/sail-raft-rules';
import type { CoirContext, CoirInterval } from '../src/science/prototypes/coir-cord';

let groups = 0;
function check(ok: unknown, why: string): asserts ok {
  if (!ok) throw Error(why);
}
function equal(a: unknown, b: unknown, why: string) {
  check(canonical(a) === canonical(b), why);
}
function rejects(fn: () => unknown, why: string) {
  let rejected = false;
  try { fn(); } catch { rejected = true; }
  check(rejected, why);
}
function test(name: string, fn: () => void) {
  fn();
  groups++;
  console.log('PASS ' + name);
}
let seed = 1357911;
function random(n: number) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % n;
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

test('raw measured weather uses mathematical wind-to coordinates', () => {
  for (const [from, to] of [[0, 270], [90, 180], [180, 90], [270, 0], [360, 270], [22.5, 248]]) {
    equal(
      sailCellWeather({ windMeasuredMs: 5.1234, windFromDeg: from, rainMeasuredMm: 0 }),
      { windMmS: 5123, windToDeg: to, gustMmS: null, rain: false },
      'wind convention'
    );
  }
  equal(
    sailCellWeather({ windMeasuredMs: 0, windFromDeg: 45, gustMs: 1.2345, rainMeasuredMm: 0.2 }),
    { windMmS: 0, windToDeg: 225, gustMmS: 1235, rain: true },
    'calm is measured, gust rounds once'
  );
});

test('missing weather remains unknown and display fallbacks are ignored', () => {
  equal(sailCellWeather({ windFromDeg: 90 }), null, 'missing measured mean');
  equal(sailCellWeather({ windMeasuredMs: 5 }), null, 'missing direction');
  equal(sailCellWeather({ windMeasuredMs: null, windFromDeg: 90 }), null, 'null measured mean');
  const raw = { windMeasuredMs: 5, windFromDeg: 90, windMs: 8, gust: 20 };
  equal(
    sailCellWeather(raw),
    { windMmS: 5000, windToDeg: 180, gustMmS: null, rain: null },
    'no invented gust or rain'
  );
  equal(
    sailCellWeather({ windMeasuredMs: 5, windFromDeg: 90, gustMs: 4 }),
    null,
    'inconsistent gust refuses known weather'
  );
});

test('malformed measured values are refused', () => {
  for (const bad of [-1, NaN, Infinity, Number.MAX_VALUE]) {
    rejects(() => sailCellWeather({ windMeasuredMs: bad, windFromDeg: 90 }), 'mean validation');
    rejects(() => sailCellWeather({ windMeasuredMs: 5, windFromDeg: 90, gustMs: bad }), 'gust validation');
  }
  for (const bad of [-1, 361, NaN, Infinity]) {
    rejects(() => sailCellWeather({ windMeasuredMs: 5, windFromDeg: bad }), 'direction validation');
  }
  for (const bad of [-1, NaN, Infinity]) {
    rejects(() => sailCellWeather({ windMeasuredMs: 5, windFromDeg: 90, rainMeasuredMm: bad }), 'rain validation');
  }
});

test('legacy bamboo conserves every integer mg with BigInt before multiplication', () => {
  equal(
    bambooQualityFromLegacyMass(6000000),
    { dry_mg: 4285714, water_mg: 1714286, length_mm: 5142 },
    'specified legacy example'
  );
  for (const m of [1, 6, 7, 2920000, 2930000, 7000000, Number.MAX_SAFE_INTEGER]) {
    const q = bambooQualityFromLegacyMass(m);
    check(q.dry_mg + q.water_mg === m, 'bamboo mass closes');
    check(BigInt(q.dry_mg) === BigInt(m) * 5n / 7n, 'dry exact floor');
    check(BigInt(q.length_mm) === BigInt(m) * 6000n / 7000000n, 'length exact floor');
  }
  for (const bad of [0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    rejects(() => bambooQualityFromLegacyMass(bad), 'bamboo invalid mass');
  }
});

const cases: SailManufactureInput[] = [
  { operation: 'harvest', source: { lotId: 'standing', material: 'pandanus_standing_leaves', dryMg: 1000000, waterMg: 2000000 } },
  { operation: 'dry', source: { lotId: 'leaves', material: 'pandanus_leaves', dryMg: 1000000, waterMg: 2000000 }, roofed: true },
  { operation: 'split', source: { lotId: 'leaves', material: 'pandanus_leaves', dryMg: 1000000, waterMg: 200000 } },
  { operation: 'weave', source: { lotId: 'strips', material: 'pandanus_strips', dryMg: 900000, waterMg: 180000 }, requestedAreaCm2: 20000 },
  { operation: 'mast', source: { lotId: 'bamboo', material: 'bamboo', dryMg: 5000000, waterMg: 2000000, lengthMm: 6000 } }
];

function context(input: SailManufactureInput, n: number): CoirContext {
  return {
    worldId: 'world', worldEpoch: 'epoch', runId: 'manufacture:' + n,
    seed: n, clock: input.operation === 'dry' ? 'island' : 'world', openedAtMs: 1000
  };
}
function receipt(c: CoirContext, n: number, fromMs: number, toMs: number): CoirInterval {
  return {
    confirmationId: 'span:' + n, worldId: c.worldId, worldEpoch: c.worldEpoch,
    runId: c.runId, clock: c.clock, fromMs, toMs, confirmedAtMs: toMs + 1,
    kind: c.clock === 'island' ? 'host-confirmed-roofed-wait' : 'host-confirmed-manual-work',
    ...(c.clock === 'island' ? {} : { actorId: 'worker', attendance: 'present' as const })
  };
}

test('compact projections match accepted cumulative arithmetic for 250 random works', () => {
  for (let n = 0; n < 250; n++) {
    const input = cases[n % cases.length];
    const c = context(input, n);
    const old = createSailManufacturingModel(input, SAIL_RAFT_ID, c);
    const compact = createCompactSailManufacturingModel(input, SAIL_RAFT_ISLAND_ID, c);
    let a = old.start(), b = compact.start(), at = c.openedAtMs;
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const gap = random(60000), dt = random(20000000) + 1;
      const r = receipt(c, i, at + gap, at + gap + dt);
      a = old.commit(a, r);
      b = compact.commit(b, r);
      total += dt;
      at = r.toMs;
      equal(compact.project(b), old.project(a), 'checkpoint parity');
      equal(compact.projectTotal(total), old.project(a), 'host total parity');
      equal(compact.observeTotal(total), old.observe(a), 'observation parity');
      b = compact.restore(clone(b));
      equal(compact.commit(b, r), b, 'exact repeated receipt');
    }
  }
});

test('compact work history stays bounded and rejects expired or conflicting receipts', () => {
  const input = cases[2], c = context(input, 777);
  const model = createCompactSailManufacturingModel(input, SAIL_RAFT_ISLAND_ID, c);
  let state = model.start();
  const first = receipt(c, 0, 1000, 31000);
  for (let i = 0; i < 2200; i++) {
    state = model.commit(state, receipt(c, i, 1000 + i * 30000, 31000 + i * 30000));
    if (i % 97 === 0) state = model.restore(clone(state));
  }
  check(state.recent.length === SAIL_MANUFACTURE_RECEIPT_LIMIT, 'only recent receipts retained');
  check(!('intervals' in state), 'no full interval history');
  check(JSON.stringify(state).length < 13000, 'bounded compact work save');
  const last = receipt(c, 2199, 1000 + 2199 * 30000, 31000 + 2199 * 30000);
  equal(model.commit(state, last), state, 'last retained replay');
  rejects(() => model.commit(state, first), 'evicted work cannot run again');
  rejects(() => model.commit(state, { ...last, confirmedAtMs: last.confirmedAtMs + 1 }), 'conflicting replay');
});

test('v2 clock identities and schemas cannot be relabeled into compatible saves', () => {
  const input = cases[0], c = context(input, 20);
  const island = createCompactSailManufacturingModel(input, SAIL_RAFT_ISLAND_ID, c);
  const world = createCompactSailManufacturingModel(input, SAIL_RAFT_WORLD_ID, c);
  rejects(() => island.restore(world.start()), 'clock assumption bound');
  const legacy = createSailManufacturingModel(input, SAIL_RAFT_ID, c);
  rejects(() => island.restore(legacy.start()), 'legacy history not compact state');
  rejects(() => island.restore({ ...legacy.start(), schema: 'prototype-sail-manufacture/2' }), 'schema-only relabel');
  rejects(() => createCompactSailManufacturingModel(input, SAIL_RAFT_ID, c), 'no silent v1 compact choice');
  rejects(() => island.projectTotal(-1), 'negative total');
  rejects(() => island.projectTotal(0.5), 'fractional total');
});

test('abandon products preserve mass without declaring unfinished strips completed', () => {
  for (let n = 0; n < cases.length; n++) {
    const input = cases[n], model = createCompactSailManufacturingModel(input, SAIL_RAFT_ISLAND_ID, context(input, n));
    const required = model.projectTotal(0).requiredMs;
    const p = model.projectTotalForAbandon(Math.floor(required / 2));
    check(input.operation !== 'rig', 'fixture source');
    const dry = (p.material?.dryMg ?? 0) + (p.remaining?.dryMg ?? 0) + (p.scrap?.dryMg ?? 0);
    const water = (p.material?.waterMg ?? 0) + (p.remaining?.waterMg ?? 0) + (p.scrap?.waterMg ?? 0) + p.releasedWaterMg;
    check(dry === input.source.dryMg && water === input.source.waterMg, 'abandon mass closes');
    if (input.operation === 'split') check(p.material?.material === 'pandanus_leaves', 'partial split remains leaves');
    if (input.operation === 'weave') check(p.material?.material === 'sail_mat' && p.areaCm2 === 10000, 'partial area retained');
    if (input.operation === 'mast') check(p.material === null, 'unfinished mast not produced');
  }
});


test('explicit remaining-water drying is proportional with exact fresh-leaf and floor boundaries', () => {
  const dryValues = [1, 2, 5, 7, 999999, 1000000, Math.floor(Number.MAX_SAFE_INTEGER / 4)];
  for (const dryMg of dryValues) {
    const target = Math.floor(dryMg / 5);
    for (const waterMg of [0, target, target + 1, dryMg, 2 * dryMg, 3 * dryMg]) {
      const input: SailManufactureInput = {operation: 'dry', roofed: true,
        source: {lotId: 'leaves', material: 'pandanus_leaves', dryMg, waterMg}};
      const c = context(input, 1);
      const model = createCompactSailManufacturingModel(input, SAIL_RAFT_ISLAND_ID,
        c, SAIL_LEAF_DRYING_ID);
      const fifths = 5n * BigInt(waterMg) - BigInt(dryMg);
      const denominator = 9n * BigInt(dryMg);
      const required = fifths <= 0n ? 0 :
        Number((fifths * 172800000n + denominator - 1n) / denominator);
      equal(model.projectTotal(0).requiredMs, required, 'rational ceil milliseconds');
      if (waterMg === 2 * dryMg) equal(required, 172800000, 'fresh leaves take exactly two days');
      if (waterMg > target) check(required >= 1, 'positive surplus never vanishes in time rounding');
      let previous = waterMg;
      for (const work of [0, Math.floor(required / 2), required, required + 1]) {
        const p = model.projectTotal(work);
        check(p.product.waterMg <= previous, 'drying stays monotone');
        check(p.product.waterMg >= Math.min(waterMg, target), 'no target overshoot');
        check(BigInt(p.product.dryMg) + BigInt(p.product.waterMg) +
          BigInt(p.releasedWaterMg) === BigInt(dryMg) + BigInt(waterMg), 'integer mass closes');
        previous = p.product.waterMg;
      }
      equal(model.projectTotal(required).product.waterMg, Math.min(waterMg, target),
        'same integer final water');
    }
  }
  const source = {lotId: 'example', material: 'pandanus_leaves' as const,
    dryMg: 1000000, waterMg: 201009};
  const i = {operation: 'dry' as const, source, roofed: true as const};
  equal(createCompactSailManufacturingModel(i, SAIL_RAFT_ISLAND_ID,
    context(i, 2), SAIL_LEAF_DRYING_ID).projectTotal(0).requiredMs, 96864, 'reported almost-dry example');
});

test('new drying checkpoints bind the explicit policy and cannot relabel old timing', () => {
  const i: SailManufactureInput = {operation: 'dry', roofed: true,
    source: {lotId: 'leaves', material: 'pandanus_leaves', dryMg: 1000000, waterMg: 201009}};
  const c = context(i, 3);
  const old = createCompactSailManufacturingModel(i, SAIL_RAFT_ISLAND_ID, c);
  const current = createCompactSailManufacturingModel(i, SAIL_RAFT_ISLAND_ID,
    c, SAIL_LEAF_DRYING_ID);
  equal(old.start().schema, 'prototype-sail-manufacture/2', 'old checkpoint schema unchanged');
  equal(current.start().schema, 'prototype-sail-manufacture/3', 'new explicit checkpoint schema');
  equal(old.projectTotal(1000000).status, 'partial', 'old calls retain two-day timing');
  equal(current.projectTotal(1000000).status, 'completed', 'new calls finish remaining water');
  rejects(() => current.restore({...old.start(), schema: 'prototype-sail-manufacture/3'}),
    'schema-only relabel is refused');
  rejects(() => old.restore({...current.start(), schema: 'prototype-sail-manufacture/2'}),
    'new state cannot be downgraded');
  rejects(() => createCompactSailManufacturingModel(i, SAIL_RAFT_ISLAND_ID,
    c, 'default'), 'unknown drying policy refused');
  const weave = cases.find(x => x.operation === 'weave')!;
  rejects(() => createCompactSailManufacturingModel(weave, SAIL_RAFT_ISLAND_ID,
    context(weave, 4), SAIL_LEAF_DRYING_ID), 'drying policy cannot change another operation');
});

test('remaining-water dry confirms, partitions, resumes and replays without changing the projection', () => {
  for (let n = 0; n < 200; n++) {
    const dryMg = 5 * (random(1000000) + 1);
    const waterMg = Math.floor(dryMg / 5) + random(dryMg * 2) + 1;
    const i: SailManufactureInput = {operation: 'dry', roofed: true,
      source: {lotId: 'leaves', material: 'pandanus_leaves', dryMg, waterMg}};
    const c = context(i, 1000 + n);
    const model = createCompactSailManufacturingModel(i, SAIL_RAFT_ISLAND_ID,
      c, SAIL_LEAF_DRYING_ID);
    const required = model.projectTotal(0).requiredMs;
    const total = Math.max(3, required);
    const cuts = [0, Math.floor(total / 3), Math.floor(total * 2 / 3), total];
    let state = model.start();
    for (let part = 0; part < 3; part++) {
      const r = receipt(c, part, c.openedAtMs + cuts[part], c.openedAtMs + cuts[part + 1]);
      state = model.commit(clone(state), r);
      equal(model.commit(clone(state), r), state, 'same confirmation replays once');
    }
    equal(model.project(state), model.projectTotal(total), 'partition/JSON and cumulative agree');
    equal(model.project(state).status, 'completed', 'new proportional drying completes');
  }
});

console.log('PASS sail inputs: ' + groups + ' groups.');
