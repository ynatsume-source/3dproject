// Checks for the test air-and-water barometer (m02x_air_barometer_test).
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-barometer-check.ts
import type { ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { BAROMETER_PROCESS } from '../src/science/step/barometer';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const H = 3600_000, W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const violations: string[] = [];
const GAUGE = (o: Record<string, number> = {}) => ({ equipmentId: 'eq:baro', kind: 'fixture_air_barometer', catalogEntry: 'fixture_air_barometer', catalogVersion: 'civ-sci-test-2',
  condition: 1, params: { bulbVolumeMl: 500, tubeBoreMm: 8, tubeLengthMm: 600, markMm: 5, bulbTauS: 900, ...o } });
type Env = { p: number; t: number; source?: 'simulation' | 'unknown' };
const req = (from: number, to: number, env: Env, state: ScienceStepRequest['state'], reads: number[], o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.1.0', requestId: `b@${from}`, world: W, runId: 'run:baro', processId: BAROMETER_PROCESS.processId, processVersion: BAROMETER_PROCESS.processVersion,
  catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
  environment: { sampleId: `env:${from}`, source: env.source ?? 'simulation', effectiveAt: from, airTempC: env.t, pressureHPa: env.p },
  lots: [], equipment: [GAUGE()], energy: [], seed: 1, actions: reads.map((at) => ({ at, residentId: 'res:lantern', action: 'read_gauge' })), ...o });
const step = (q: ScienceStepRequest) => { const r = scienceStep(q); violations.push(...validateResult(q, r).map((v) => `${q.requestId}: ${v}`)); return r; };
/** Run hour by hour with env(h); read at the given hours (at the end of the hour). Returns the readings by hour. */
function hours(n: number, env: (h: number) => Env, readAt: (h: number) => boolean, o: Partial<ScienceStepRequest> = {}, chunkMs = H) {
  let st: ScienceStepRequest['state'] = null; const reads = new Map<number, ScienceStepResult['observations'][number]>(); let last!: ScienceStepResult;
  for (let t = 0; t < n * H; t += chunkMs) {
    const h = Math.floor(t / H), end = t + chunkMs;
    const times: number[] = [];
    for (let hh = h; hh * H < end; hh++) { const rt = hh * H + H - 1000; if (readAt(hh) && rt >= t && rt < end) times.push(rt); }
    last = step(req(t, end, env(h), st, times, o));
    st = last.state;
    for (const ob of last.observations) reads.set(Math.floor(ob.at / H), ob);
    if (last.status === 'failed') break;
  }
  return { reads, last };
}
const marks = (r: ReturnType<typeof hours>, h: number) => r.reads.get(h)?.value as number;

console.log('1. what moves the water');
{
  const calm = hours(2, () => ({ p: 1010, t: 28 }), () => true);
  ok(marks(calm, 0) === 0 && marks(calm, 1) === 0 && calm.last.status === 'running', 'set at 1010 hPa, 28 °C: the levels stay equal (0 marks) while nothing changes');
  const drop = hours(2, (h) => ({ p: h === 0 ? 1010 : 980, t: 28 }), () => true);
  const dropMm = (drop.last.diagnostics as { riseMm: number }).riseMm;
  ok(dropMm > 95 && dropMm < 105 && marks(drop, 1) === Math.round(dropMm / 5), '30 hPa lower at the same temperature: the open leg rises about 10 cm (20 marks of 5 mm)', `${dropMm.toFixed(1)} mm, ${marks(drop, 1)} marks`);
  const warm = hours(4, (h) => ({ p: 1010, t: h === 0 ? 28 : 33 }), () => true);
  const warmMm = (warm.last.diagnostics as { riseMm: number }).riseMm;
  ok(warmMm > 50 && warmMm < 60 && marks(warm, 3) > 0, '5 °C warmer at the same pressure: it rises too (about 1.1 cm per °C), in the same direction as a falling pressure', `${warmMm.toFixed(1)} mm, ${marks(warm, 3)} marks`);
}

console.log('2. the bulb follows the air with a lag');
{
  const jump = (tau: number) => hours(4, (h) => ({ p: 1010, t: h === 0 ? 28 : 33 }), () => true, { equipment: [GAUGE({ bulbTauS: tau })] });
  const air = jump(900), water = jump(6 * 3600);
  ok(marks(air, 1) > marks(water, 1) * 2 && marks(water, 3) < marks(air, 3), 'a bulb kept in water (6 h) moves much less with a warm afternoon than one in the air (15 min)',
    `after 1 h: ${marks(air, 1)} vs ${marks(water, 1)} marks; after 3 h: ${marks(air, 3)} vs ${marks(water, 3)}`);
}

console.log('3. a storm on a warm island: what the resident has to tell apart');
{
  // 6 days: daily air 26–32 °C (warmest at 14:00); the pressure holds at 1010, falls to 975 over day 4, recovers on day 5
  const env = (h: number): Env => {
    const day = Math.floor(h / 24), hod = h % 24;
    const t = 29 + 3 * Math.cos(((hod - 14) / 24) * 2 * Math.PI);
    const p = day < 3 ? 1010 : day === 3 ? 1010 - (35 * hod) / 24 : day === 4 ? 975 + (35 * hod) / 24 : 1010;
    return { p, t };
  };
  const r = hours(6 * 24, env, () => true);
  const at = (d: number, hod: number) => marks(r, d * 24 + hod);
  const calmSwing = at(1, 14) - at(1, 5);
  ok(calmSwing >= 8, 'on a calm day, the afternoon reading is well above the dawn reading (the warmth alone)', `${calmSwing} marks between 05:00 and 14:00`);
  const dawn = [0, 1, 2, 3, 4, 5].map((d) => at(d, 5));
  ok(dawn[1] === dawn[2] && dawn[4] - dawn[2] >= 15 && dawn[5] <= dawn[2] + 1, 'read at dawn every day, the storm stands out: flat, a big rise, back again', `dawn readings ${dawn.join(', ')}`);
  ok(at(3, 23) - at(3, 5) > calmSwing, 'as the pressure falls, the climb through the day is larger than any calm day gives', `${at(3, 23) - at(3, 5)} vs ${calmSwing} marks`);
}

console.log('4. chunking, outages, the ends of the tube');
{
  const env = (h: number): Env => { const k = Math.floor(h / 3); return { p: 1010 - k * 6, t: 28 + (k % 2) * 3 }; }; // weather changes every 3 h
  const a = hours(6, env, () => true), b = hours(6, env, () => true, {}, 30_000), c = hours(6, env, () => true, {}, 3 * H);
  const key = (x: ReturnType<typeof hours>) => JSON.stringify([[...x.reads.entries()], x.last.state]);
  ok(key(a) === key(b) && key(a) === key(c), 'hour by hour = every 30 s = 3 h at a time (weather changing every 3 h): the same readings and the same state');
  const out = hours(4, (h) => ({ p: 1010, t: 28, source: h === 1 ? 'unknown' : 'simulation' }), () => true);
  ok(!out.reads.has(1) && out.reads.has(2) && (out.last.diagnostics as { historyComplete: boolean }).historyComplete === false,
    'an hour of unknown weather: no reading in it (nothing invented), readings resume, the history is marked incomplete');
  const big = hours(2, (h) => ({ p: h === 0 ? 1010 : 940, t: 28 }), () => true, { equipment: [GAUGE({ tubeLengthMm: 200 })] });
  const ob = big.reads.get(1)!;
  ok(ob.value === undefined && /目盛りの外/.test(ob.text ?? ''), 'a short tube and a deep low: the water is past the end of the scale, said in words, no number', ob.text);
}

console.log('5. what the resident gets');
{
  const r = hours(2, (h) => ({ p: h === 0 ? 1010 : 990, t: 28 }), () => true);
  const ob = r.reads.get(1)!;
  ok(ob.channel === 'instrument:eq:baro' && ob.unit === 'mark' && ob.precision === 1 && Number.isInteger(ob.value),
    'a reading is a whole number of marks from the instrument: no hPa, no centimetres');
  const v2 = scienceStep({ ...req(0, H, { p: 1010, t: 28 }, null, [H - 1000]), contract: '0.2.0' }) as ScienceStepResult & { drawn?: unknown[] };
  const v1 = scienceStep(req(0, H, { p: 1010, t: 28 }, null, [H - 1000]));
  const { contract: _a, drawn: _b, ...b2 } = v2; const { contract: _c, ...b1 } = v1;
  ok(JSON.stringify(b1) === JSON.stringify(b2) && Array.isArray(v2.drawn) && v2.drawn.length === 0, 'contract 0.1.0 and 0.2.0 give the same answer (0.2.0 adds drawn: [])');
  ok(JSON.stringify(scienceStep(req(0, H, { p: 1010, t: 28 }, null, [H - 1000]))) === JSON.stringify(v1), 'the same request gives the same result');
  const rq = req(0, H, { p: 1010, t: 28 }, null, [H - 1000]);
  const rec = scienceStep({ ...rq, environment: { ...rq.environment, source: 'record', sampleId: 'env:record:jma-47918:2019-08-23T05' } as unknown as ScienceStepRequest['environment'] });
  ok(rec.status === 'running' && rec.observations[0]?.value === v1.observations[0]?.value, 'the island replayed weather (record) is read like any measured weather');
  const stop = step(req(H, 2 * H, { p: 1010, t: 28 }, v1.state, [], { stop: 'operator' }));
  ok(stop.status === 'stopped' && stop.consumed.length + stop.produced.length + stop.energy.length === 0, 'taking the gauge down: stopped, nothing settled, no energy');
}

console.log('6. requests that are refused');
{
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  const base = req(0, H, { p: 1010, t: 28 }, null, []);
  refused('setting it without the pressure', step({ ...base, environment: { ...base.environment, pressureHPa: undefined } }), /known weather/);
  refused('setting it with unknown weather', step({ ...base, environment: { ...base.environment, source: 'unknown' } }), /known weather/);
  refused('no gauge', step({ ...base, equipment: [] }), /no fixture_air_barometer/);
  refused('a gauge with no bulb', step({ ...base, equipment: [GAUGE({ bulbVolumeMl: 0 })] }), /bulbVolumeMl/);
  refused('material lots', step({ ...base, lots: [{ lotId: 'lot:w', materialId: 'process_water', amount: { value: 100, unit: 'mg' }, location: 's' }] }), /no material lots/);
  refused('an energy offer', step({ ...base, energy: [{ sourceId: 'src:x', kind: 'heat', maxJ: 10 }] }), /uses no energy/);
  refused('an unknown action', step({ ...base, actions: [{ at: 0, residentId: 'res:x', action: 'shake' }] }), /unknown action/);
  refused('lost before it was set', step({ ...base, equipment: [], stop: 'equipment-lost' }), /lost before it was set/);
  const set = step(base);
  refused('the gauge swapped under a running run', step(req(H, 2 * H, { p: 1010, t: 28 }, set.state, [], { equipment: [GAUGE({ bulbVolumeMl: 600 })] })), /changed-input/);
  refused('a missing interval', step(req(2 * H, 3 * H, { p: 1010, t: 28 }, set.state, [])), /noncontiguous/);
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation', violations.slice(0, 3).join(' / '));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
