// Checks for the test air-and-water barometer (m02x_air_barometer_test).
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-barometer-check.ts
import { readFileSync } from 'node:fs';
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
  const out = hours(5, (h) => ({ p: 1010, t: 28, source: h === 1 ? 'unknown' : 'simulation' }), () => true);
  ok(!out.reads.has(1) && !out.reads.has(4) && (out.last.diagnostics as { condition: string; historyComplete: boolean }).condition === 'unknown'
    && (out.last.diagnostics as { historyComplete: boolean }).historyComplete === false,
    'an hour of unknown weather: no reading in it; the bulb might have gone anywhere the air can, a spill cannot be ruled out: no numbers until it is set again');
  // a short gap: five minutes without the air temperature, then the same weather; readings come back, equal to the control
  const shortGap = (hide: boolean) => {
    let st: ScienceStepRequest['state'] = null; const vals: (number | undefined)[] = [];
    for (let t = 0; t < 3 * H; t += 30_000) {
      const rq = req(t, t + 30_000, { p: 1010, t: 28 }, st, [t]);
      const r = step(hide && t >= H && t < H + 300_000 ? { ...rq, environment: { ...rq.environment, airTempC: undefined } } : rq);
      st = r.state; vals.push(r.observations[0]?.value as number | undefined);
    }
    return vals;
  };
  const hid = shortGap(true), ctl = shortGap(false);
  const back = hid.findIndex((v, i) => i > 130 && v !== undefined);
  ok(hid.every((v, i) => v === undefined || v === ctl[i]) && back > 0 && hid.slice(-1)[0] === ctl.slice(-1)[0],
    'five minutes without the air temperature: no number while the bulb is uncertain, then the same numbers as the control', `back after ${((back - 130) * 30 / 60).toFixed(1)} min`);
  const big = hours(3, (h) => ({ p: h === 1 ? 940 : 1010, t: 28 }), () => true, { equipment: [GAUGE({ tubeLengthMm: 200 })] });
  ok(big.reads.get(1)?.value === undefined && /あふれ/.test(big.reads.get(1)?.text ?? '') && big.reads.get(2)?.value === undefined && /置いたときの印と合わない/.test(big.reads.get(2)?.text ?? ''),
    'a short tube and a deep low: the water spills out of the open mouth, said in words; back at 1010 hPa it does not return to 0 marks', `${big.reads.get(1)?.text} / ${big.reads.get(2)?.text}`);
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

console.log('7. Codex review of 5971025 (A1–A3)');
{
  const H30 = 30_000;
  // A1: lost at 90 s, read at 45 s and 75 s; one request 30–90 s vs two (30–60, 60–90); the gauge stays in the requests
  const set = step(req(0, H30, { p: 1010, t: 28 }, null, []));
  const one = step(req(H30, 3 * H30, { p: 980, t: 38 }, set.state, [45_000, 75_000], { stop: 'equipment-lost' }));
  const a = step(req(H30, 2 * H30, { p: 980, t: 38 }, set.state, [45_000]));
  const b = step(req(2 * H30, 3 * H30, { p: 980, t: 38 }, a.state, [75_000], { stop: 'equipment-lost' }));
  const two = [...a.observations, ...b.observations];
  ok(one.status === 'stopped' && one.observations.length === 2 && JSON.stringify(one.observations) === JSON.stringify(two) && JSON.stringify(one.state) === JSON.stringify(b.state),
    'A1: a gauge lost at the end of an interval: the readings before it stay, and one request = two requests', one.observations.map((o) => o.value).join(', '));
  const gone = step(req(2 * H30, 3 * H30, { p: 980, t: 38 }, a.state, [75_000], { stop: 'equipment-lost', equipment: [] }));
  ok(gone.status === 'stopped' && JSON.stringify(gone.observations) === JSON.stringify(b.observations),
    'A1: the same when the host no longer lists the lost gauge (the state keeps what the gauge was)');
  // A2: set at 28 °C; an hour at 33 °C with the pressure missing; back to 1010 hPa / 28 °C, read at its start
  const gap = (missing: boolean) => {
    const s0 = step(req(0, H, { p: 1010, t: 28 }, null, []));
    const rq = req(H, 2 * H, { p: 1010, t: 33 }, s0.state, []);
    const s1 = step(missing ? { ...rq, environment: { ...rq.environment, pressureHPa: undefined } } : rq);
    const s2 = step(req(2 * H, 3 * H, { p: 1010, t: 28 }, s1.state, [2 * H]));
    return { bulb: (s1.diagnostics as { bulbC: number[] }).bulbC, mark: s2.observations[0]?.value, during: s1.observations.length };
  };
  const miss = gap(true), ctrl = gap(false);
  ok(miss.during === 0 && miss.mark === ctrl.mark && miss.mark === 11 && miss.bulb[0] === ctrl.bulb[0] && miss.bulb[0] > 32.9,
    'A2: with only the pressure missing, the known warmth still warms the bulb; back again it reads like the control', `${miss.mark} vs ${ctrl.mark} marks, bulb ${miss.bulb[0].toFixed(4)} °C`);
  // A2 (the overflow nobody saw): a short tube, the pressure missing for 6 h: a deep low cannot be ruled out
  const long = (hrs: number, tube: number) => {
    let st = step(req(0, H, { p: 1010, t: 28 }, null, [], { equipment: [GAUGE({ tubeLengthMm: tube })] })).state;
    for (let h = 1; h <= hrs; h++) { const rq = req(h * H, (h + 1) * H, { p: 1010, t: 28 }, st, [], { equipment: [GAUGE({ tubeLengthMm: tube })] }); st = step({ ...rq, environment: { ...rq.environment, pressureHPa: undefined } }).state; }
    const r = step(req((hrs + 1) * H, (hrs + 2) * H, { p: 1010, t: 28 }, st, [(hrs + 1) * H], { equipment: [GAUGE({ tubeLengthMm: tube })] }));
    return r;
  };
  const shortGap = long(1, 600), deepGap = long(6, 200);
  ok(shortGap.observations[0]?.value === 0, 'A2: an hour without the pressure, a long tube: no low that fast could spill it, readings go on');
  ok(deepGap.observations.length === 0 && (deepGap.diagnostics as { condition: string }).condition === 'unknown',
    'A2: six hours without the pressure, a short tube: a spill cannot be ruled out, so no number is given (until it is set again)');
  // A3: past the end of the tube even with nobody reading, then back to 1010 hPa
  for (const [tube, p] of [[600, 900], [200, 940], [200, 980]] as const) {
    const r = hours(3, (h) => ({ p: h === 1 ? p : 1010, t: 28 }), (h) => h === 2, { equipment: [GAUGE({ tubeLengthMm: tube })] });
    const ob = r.reads.get(2);
    ok(ob && ob.value === undefined && /合わない/.test(ob.text ?? '') && (r.last.diagnostics as { condition: string }).condition === 'spilled-top',
      `A3: ${tube} mm tube, ${p} hPa unread, then 1010 hPa: the spill is remembered, not 0 marks`, ob?.text);
  }
  const now = step(req(H, 2 * H, { p: 940, t: 28 }, step(req(0, H, { p: 1010, t: 28 }, null, [], { equipment: [GAUGE({ tubeLengthMm: 200 })] })).state, [H, H + 60_000], { equipment: [GAUGE({ tubeLengthMm: 200 })] }));
  ok(/あふれた$/.test(now.observations[0]?.text ?? '') && /減ったまま/.test(now.observations[1]?.text ?? ''), 'A3: read at the moment it spills: "it spilled"; a minute later: "still short of water"',
    now.observations.map((o) => o.text).join(' / '));
  // the same storm with a pressure gap and a short tube, in 30 s, 1 h and 3 h pieces: the same readings and the same state
  const env = (h: number): Env => { const k = Math.floor(h / 3); return { p: k === 1 ? (undefined as unknown as number) : 1010 - k * 12, t: 28 + 2 * (k % 2) }; }; // changes every 3 h
  for (const tube of [260, 600]) {
    const run = (chunk: number) => hours(12, env, () => true, { equipment: [GAUGE({ tubeLengthMm: tube })] }, chunk);
    const key = (x: ReturnType<typeof hours>) => JSON.stringify([[...x.reads.entries()], x.last.state]);
    const c1 = run(H), c2 = run(30_000), c3 = run(3 * H);
    ok(key(c1) === key(c2) && key(c1) === key(c3), `${tube} mm tube, a pressure gap and a falling pressure: 30 s = 1 h = 3 h pieces`,
      `condition ${(c1.last.diagnostics as { condition: string }).condition}, ${c1.reads.size} readings`);
  }
}

console.log('8. Codex review of 0e7c023 (A2a): measured island weather, one hour hidden');
{
  // JMA Ishigaki 2016-01-24, hourly (data/science/evidence): each value held until the next hour; set at 01:00
  const rows = readFileSync(new URL('../data/science/evidence/jma-ishigaki-20160124-hourly.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',').map(Number));
  const at = (h: number) => rows.find((r) => r[0] === h)!; // hour_jst, station pressure, sea-level pressure, air temp, rh
  for (const tau of [900, 6 * 3600]) {
    const run = (hide: boolean) => {
      let st: ScienceStepRequest['state'] = null; const vals = new Map<number, number | undefined>(); const bulbs: number[][] = [];
      for (let h = 1; h < 24; h++) {
        const from = (h - 1) * H, reads = Array.from({ length: 120 }, (_, i) => from + i * 30_000);
        const rq = req(from, from + H, { p: at(h)[1], t: at(h)[3] }, st, reads, { equipment: [GAUGE({ bulbTauS: tau })] });
        const r = step(hide && h === 18 ? { ...rq, environment: { ...rq.environment, airTempC: undefined } } : rq);
        st = r.state; for (const o of r.observations) vals.set(o.at, o.value as number | undefined);
        bulbs.push((r.diagnostics as { bulbC: number[] }).bulbC);
      }
      return { vals, bulbs };
    };
    const ctl = run(false), hid = run(true);
    const given = [...hid.vals].filter(([t, v]) => t >= 17 * H && v !== undefined);
    ok(given.every(([t, v]) => v === ctl.vals.get(t)), `${tau} s bulb: after the hidden hour, every number given equals the control's (none invented)`,
      `${given.length} numbers after 18:00; at 20:26:30 ${hid.vals.get(19 * H + 26 * 60_000 + 30_000)} vs ${ctl.vals.get(19 * H + 26 * 60_000 + 30_000)}`);
    ok(hid.bulbs.every((b, i) => b[0] <= ctl.bulbs[i][0] + 1e-9 && ctl.bulbs[i][1] <= b[1] + 1e-9), `${tau} s bulb: the bulb's range always holds the control's bulb temperature`);
  }
  const old = scienceStep(req(H, 2 * H, { p: 1010, t: 28 }, { schema: 'civ-sci.air-barometer/2', data: {} }, []));
  ok(old.status === 'failed' && /unsupported-state-schema/.test(String(old.evidence.notes)), 'a /2 state (bounds from the old 10..38 °C assumption) is refused: the gauge is set again');
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation', violations.slice(0, 3).join(' / '));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
