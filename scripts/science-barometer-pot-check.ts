// Checks for the self-made barometer: a gauge tube through the plug (p16x 0.1.3, table civ-sci.pot-assembly/4) and the
// barometer on the residents' pot (m03x_air_barometer_pot 0.1.0); 7: the bamboo tube (p18x) and the weather pot (m03x 0.2.0).
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-barometer-pot-check.ts
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { BAROMETER_PROCESS } from '../src/science/step/barometer';
import { BAROMETER_POT_PROCESS } from '../src/science/step/barometer-pot';
import { airLeakTauMin, LEAK_TEST_PROCESS, potSherdsQuality, potToEquipmentParams, readPot, TAR_SEAL_PROCESS } from '../src/science/step/vessel';
import { BAMBOO_TUBE_PROCESS } from '../src/science/step/bamboo-tube';
import { pv } from '../src/science/params';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const M = 60_000, H = 3600_000, D = 24 * H, W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const violations: string[] = [];
const step = (q: ScienceStepRequest) => { const r = scienceStep(q); violations.push(...validateResult(q, r).map((v) => `${q.requestId}: ${v}`)); return r; };
const sum = (xs: { amount: { value: number } }[] = []) => xs.reduce((t, x) => t + x.amount.value, 0);

// ---- the pot with a tube through its plug ----
const POT = (cap = 500, mg = 600_000): LotView => ({ lotId: 'lot:pot', materialId: 'fired_pot_test', amount: { value: mg, unit: 'mg' }, location: 'site:shelf', quality: { capacity_ml: cap, absorption_ppm: 120_000 } });
const TUBE: LotView = { lotId: 'lot:tube', materialId: 'gauge_tube_test', amount: { value: 40_000, unit: 'mg' }, location: 'site:shelf', quality: { bore_mm: 8, length_mm: 600 } };
const TAR = (mg: number): LotView => ({ lotId: 'lot:tar', materialId: 'wood_tar', amount: { value: mg, unit: 'mg' }, location: 'eq:retort', quality: { x_wood_tar_ppm: 1_000_000 } });
const WOOD: LotView = { lotId: 'lot:wood', materialId: 'firewood', amount: { value: 2_000_000, unit: 'mg' }, location: 'site:woodpile', quality: { water_ppm: 150_000 } };
const BRUSH = { equipmentId: 'eq:brush', kind: 'fixture_tar_brush', catalogEntry: 'fixture_tar_brush', catalogVersion: 'civ-sci-test-2', condition: 1 };
const PIT = { equipmentId: 'eq:pit', kind: 'open_fire_pit', catalogEntry: 'open_fire_pit', catalogVersion: 'civ-sci-test-2', condition: 1, params: { maxBurnKgPerH: 3 } };
function seal(o: { pot?: LotView; tarMg?: number; warm?: boolean; jointTarG?: number; tube?: LotView | null; seal?: boolean }) {
  const lots = [o.pot ?? POT(), TAR(o.tarMg ?? 30_000), ...(o.tube === null ? [] : [o.tube ?? TUBE]), ...(o.warm ? [WOOD] : [])];
  return step({ contract: '0.2.0', requestId: 's', world: W, runId: 'run:seal', ...TAR_SEAL_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: 0, to: H }, state: null,
    environment: { sampleId: 'env:0', source: 'simulation', effectiveAt: 0, airTempC: 28 }, lots, equipment: o.warm ? [BRUSH, PIT] : [BRUSH],
    energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: 3600 * 20 }], seed: 1,
    actions: o.seal === false ? [] : [{ at: M, residentId: 'res:lantern', action: 'seal', params: { jointTarG: o.jointTarG ?? 0 } }] });
}
const potOf = (r: ScienceStepResult): LotView => { const p = r.produced.find((x) => x.materialId === 'fired_pot_test' || x.materialId === 'fired_pot')!; return { lotId: 'lot:bulb', materialId: p.materialId, amount: p.amount, location: 'site:shelf', quality: p.quality }; };

console.log('1. a tube through the plug: the joint leaks apart from the walls (p16x 0.1.3, table /4)');
const warmWell = seal({ warm: true, jointTarG: 6 }), warmLittle = seal({ warm: true, jointTarG: 1 }), coldBare = seal({ jointTarG: 0 });
const best = seal({ warm: true, tarMg: 90_000, jointTarG: 60 }); // walls well tarred, the joint heaped high
{
  const tau = (r: ScienceStepResult) => potOf(r).quality!.air_leak_tau_min;
  const p = potOf(warmWell);
  ok(warmWell.status === 'completed' && p.quality!.tube_bore_mm === 8 && p.quality!.x_tube_ppm! > 0 && sum(warmWell.consumed) + sum((warmWell as unknown as { drawn: { amount: { value: number } }[] }).drawn) === sum(warmWell.produced) + sum(warmWell.released),
    'the tube goes into the pot through the plug: its mass joins the pot lot (x_tube_ppm), the mass closes', JSON.stringify({ tube: p.quality!.x_tube_ppm, joint: p.quality!.joint_cover_ppm }));
  ok(tau(coldBare) < tau(warmLittle) && tau(warmLittle) < tau(warmWell), 'the more (and warmer) tar heaped on the joint, the longer the pot holds its air',
    `bare joint ${tau(coldBare)} min / 1 g warm ${tau(warmLittle)} / 6 g warm ${tau(warmWell)}`);
  const noTube = potOf(seal({ warm: true, tube: null, tarMg: 90_000 })), heavy = potOf(seal({ warm: true, tarMg: 90_000, jointTarG: 60 }));
  ok(noTube.quality!.air_leak_tau_min > heavy.quality!.air_leak_tau_min && heavy.quality!.air_leak_tau_min < 100_000, 'walls sealed perfectly, the joint still leaks a little: a tubed pot is never perfect (jointLeakFloor)',
    `no tube ${noTube.quality!.air_leak_tau_min} min / tube with 60 g on the joint ${heavy.quality!.air_leak_tau_min} min`);
  const notThrough = seal({ seal: false });
  ok(notThrough.status === 'completed' && notThrough.produced.some((x) => x.materialId === 'gauge_tube_test') && potOf(notThrough).quality!.x_tube_ppm === undefined,
    'no seal reached: the tube comes back as it was, the pot unstopped (0.1.4, Codex SB-A2)');
  const small = { absorption: 0.12, coverage: 0.9, sealed: true, capacityMl: 500 }, big = { ...small, capacityMl: 2000 };
  ok(airLeakTauMin(small) === airLeakTauMin({ absorption: 0.12, coverage: 0.9, sealed: true }) && airLeakTauMin(big) > airLeakTauMin(small),
    'the same walls hold the air longer in a bigger pot (more air behind the same leak per area); the 500 mL reference pot is as before', `${airLeakTauMin(small)} → ${airLeakTauMin(big)} min`);
  const bp = readPot(p), sherds = potSherdsQuality(p.quality!);
  ok(bp.tube?.mg === Math.floor((p.amount.value * p.quality!.x_tube_ppm!) / 1e6) && sherds.x_tube_ppm === p.quality!.x_tube_ppm, 'the tubed pot reads back (body, tar, tube apart); broken, the tube stays in the pieces');
  const leak = step({ contract: '0.2.0', requestId: 'l', world: W, runId: 'run:leak', ...LEAK_TEST_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: 0, to: 6 * H }, state: null,
    environment: { sampleId: 'e', source: 'record', effectiveAt: 0, airTempC: 28, humidity: 0.75, windMs: 2 }, lots: [p],
    equipment: [{ equipmentId: 'eq:stand', kind: 'fixture_vessel_stand', catalogEntry: 'fixture_vessel_stand', catalogVersion: 'civ-sci-test-2', condition: 1, params: { sunExposure: 0 } }], energy: [], seed: 1,
    actions: [{ at: 6 * H - 30_000, residentId: 'res:lantern', action: 'take_out' }] });
  ok(leak.status === 'completed' && potOf(leak).quality!.tube_bore_mm === 8 && sum(leak.consumed) === sum(leak.produced) + sum(leak.released), 'the leak test reads a tubed pot and hands it back with its tube');
}

// ---- the barometer on the pot ----
const bulb = (r: ScienceStepResult, o: Record<string, number> = {}) => ({ equipmentId: 'eq:bulb', kind: 'assembled_pot', catalogEntry: 'assembled_pot', catalogVersion: 'civ-sci-test-2', condition: 1,
  params: { ...potToEquipmentParams(potOf(r)), markMm: 5, ...o } });
const WATER = (mg = 20_000): LotView => ({ lotId: 'lot:tubewater', materialId: 'process_water', amount: { value: mg, unit: 'mg' }, location: 'site:jar' });
type Env = { p?: number; t?: number; source?: string };
const greq = (from: number, to: number, env: Env, state: ScienceStepRequest['state'], acts: [number, string][], o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.2.0', requestId: `g@${from}`, world: W, runId: 'run:gauge', ...BAROMETER_POT_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
  environment: { sampleId: `env:${from}`, source: (env.source ?? 'record') as 'record', effectiveAt: from, ...(env.t !== undefined ? { airTempC: env.t } : {}), ...(env.p !== undefined ? { pressureHPa: env.p } : {}) },
  lots: [WATER()], equipment: [bulb(warmWell)], energy: [], seed: 1, actions: acts.map(([at, action]) => ({ at, residentId: 'res:lantern', action })), ...o });
/** The pressure falls 30 hPa over 24 h, then holds (the design's example), at 28 °C. */
const storm = (t: number): Env => ({ p: 1010 - Math.min(30, (30 * t) / D), t: 28 });
function gauge(until: number, env: (t: number) => Env, readsAt: number[], o: Partial<ScienceStepRequest> = {}, chunk = H) {
  let st: ScienceStepRequest['state'] = null; const all: ScienceStepResult[] = [];
  for (let t = 0; t < until; t += chunk) {
    const e = Math.min(until, t + chunk);
    const acts: [number, string][] = [...readsAt.filter((x) => x >= t && x < e).map((x) => [x, 'read_gauge'] as [number, string]), ...(e === until ? [[until - 1000, 'take_out'] as [number, string]] : [])];
    const r = step(greq(t, e, env(t), st, acts, o)); all.push(r); st = JSON.parse(JSON.stringify(r.state));
    if (r.status !== 'running') break;
  }
  const last = all[all.length - 1];
  return { all, last, marks: new Map(all.flatMap((r) => r.observations).filter((x) => x.value !== undefined).map((x) => [Math.round(x.at / H), x.value as number])) };
}
const every6h = Array.from({ length: 8 }, (_, i) => i * 6 * H + 6 * H - 2000);

console.log('2. the barometer on the residents\' pot (m03x 0.1.0)');
{
  // the test gauge with the same bulb, tube and stick: what a pot that never leaks reads
  const testGauge = (() => {
    const p = bulb(warmWell).params; let st: ScienceStepRequest['state'] = null; const m = new Map<number, number>();
    for (let t = 0; t < 2 * D; t += H) {
      const r = step({ contract: '0.2.0', requestId: `t${t}`, world: W, runId: 'run:test', ...BAROMETER_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: t, to: t + H }, state: st,
        environment: { sampleId: `e${t}`, source: 'record', effectiveAt: t, airTempC: 28, pressureHPa: storm(t).p }, lots: [],
        equipment: [{ equipmentId: 'eq:test', kind: 'fixture_air_barometer', catalogEntry: 'fixture_air_barometer', catalogVersion: 'civ-sci-test-2', condition: 1,
          params: { bulbVolumeMl: p.capacityMl, tubeBoreMm: p.tubeBoreMm, tubeLengthMm: p.tubeLengthMm, markMm: 5, bulbTauS: p.bulbTauS } }], energy: [], seed: 1,
        actions: every6h.filter((x) => x >= t && x < t + H).map((at) => ({ at, residentId: 'res:lantern', action: 'read_gauge' })) });
      st = r.state; for (const o of r.observations) m.set(Math.round(o.at / H), o.value as number);
    }
    return m;
  })();
  const good = gauge(2 * D, storm, every6h, { equipment: [bulb(best)] });
  const leaky = gauge(2 * D, storm, every6h, { equipment: [bulb(coldBare)] });
  const g = (r: ReturnType<typeof gauge>) => every6h.map((x) => r.marks.get(Math.round(x / H)));
  const tg = every6h.map((x) => testGauge.get(Math.round(x / H)));
  const gd = g(good);
  ok(gd.every((v, i) => v !== undefined && Math.abs(v - tg[i]!) <= 3) && gd[7]! >= gd[3]! - 2, 'the best pot (walls well tarred, the joint heaped high) reads near the test gauge and creeps back only slowly (the joint still leaks a little)',
    `pot ${gd.join(',')} / test ${tg.join(',')} (τ ${bulb(best).params.airLeakTauMin} min)`);
  const lk = g(leaky);
  ok(lk[3]! < tg[3]! && lk[7]! < lk[3]! && lk[7]! <= 2, 'a pot with a bare joint rises less while the pressure falls and creeps back once it stops: it shows the change, not the height',
    `leaky ${lk.join(',')} marks (τ ${bulb(coldBare).params.airLeakTauMin} min)`);
  ok(good.last.status === 'completed' && good.last.produced[0]?.amount.value === 20_000 && sum(good.last.consumed) === sum(good.last.produced) + sum(good.last.released), 'taken out, the tube\'s water comes back');
}

console.log('3. pieces, reads, unknown weather, a spill');
{
  const reads = [37 * M + 13_000, 6 * H + 7_000, 6 * H + 7_001, 20 * H + 29_999];
  const key = (r: ReturnType<typeof gauge>) => JSON.stringify([r.last.produced, r.all.flatMap((x) => x.observations), r.last.state.data]);
  // the weather changes at 6 h steps (every split below shares them); reads fall between the cells
  const steps = (t: number): Env => ({ p: 1010 - 8 * Math.floor(t / (6 * H)), t: 28 + (Math.floor(t / (6 * H)) % 2) });
  const a = gauge(D, steps, reads), b = gauge(D, steps, reads, {}, 30_000), c = gauge(D, steps, reads, {}, 432_000 + 0), d = gauge(D, steps, reads, {}, 2 * H), e = gauge(D, steps, reads, {}, 30 * M);
  ok(key(a) === key(b) && key(a) === key(c) && key(a) === key(d) && key(a) === key(e), '1 h = 30 s = 7.2 min = 2 h = 30 min pieces (reads between the cells): the same readings and state, to the last decimal');
  const quiet = gauge(D, steps, []);
  ok(JSON.stringify(quiet.last.state.data) === JSON.stringify(a.last.state.data), 'reading changes nothing');
  const gap = gauge(D, (t) => (t >= 6 * H && t < 9 * H ? { source: 'unknown' } : storm(t)), [5 * H, 7 * H, 12 * H], { equipment: [bulb(coldBare)] });
  const air = (gap.all[8].diagnostics as { airLeft: number[] }).airLeft;
  ok(!gap.marks.has(7) && air[1] > air[0] && gap.last.produced[0]?.quality?.history_complete === 0, 'weather unknown: no reading; the air left is carried as a range (it may have leaked either way)', `air ${air.map((x) => x.toFixed(6)).join('..')}`);
  const spill = gauge(3 * H, (t) => ({ p: t >= H ? 950 : 1010, t: 28 }), [2 * H], { equipment: [bulb(warmWell, { tubeLengthMm: 200 })] });
  const lost = spill.last.released.find((x) => x.materialId === 'process_water' && x.to === 'ground');
  ok(lost && lost.amount.value > 0 && sum(spill.last.consumed) === sum(spill.last.produced) + sum(spill.last.released) && /あふれ/.test(spill.all.flatMap((x) => x.observations).map((x) => x.text).join()),
    'a short tube and a deep fall: the water spills over the mouth, to the ground, and the gauge says so', `${lost?.amount.value} mg spilled`);
}

console.log('5. what was done is kept; what passed an end stays passed (p16x 0.1.4, m03x 0.1.1: Codex SB-A1–A4 on 7f4d1e3)');
{
  // SB-A1/A2: the seal reached (60 s, 6 g on the joint) decides, however the 15 minutes of hand work are split, and an
  // action never reached (1800 s) does not, whatever the order it is sent in
  const sealRun = (bounds: number[], acts: { at: number; jointTarG: number }[], warm: boolean) => {
    let st: ScienceStepRequest['state'] = null, r!: ScienceStepResult;
    const lots = [POT(), TAR(41_000), { ...TUBE, amount: { value: 30_000, unit: 'mg' as const } }, ...(warm ? [WOOD] : [])];
    for (let i = 0; i < bounds.length - 1; i++) {
      r = step({ contract: '0.2.0', requestId: `s${i}`, world: W, runId: 'run:sealsplit', ...TAR_SEAL_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: bounds[i], to: bounds[i + 1] }, state: st,
        environment: { sampleId: 'e', source: 'simulation', effectiveAt: bounds[i], airTempC: 28 }, lots, equipment: warm ? [BRUSH, PIT] : [BRUSH],
        energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: ((bounds[i + 1] - bounds[i]) / 1000) * 20 }], seed: 1,
        actions: acts.filter((a) => a.at >= bounds[i] && a.at < bounds[i + 1]).map((a) => ({ at: a.at, residentId: 'res:lantern', action: 'seal', params: { jointTarG: a.jointTarG } })) });
      st = JSON.parse(JSON.stringify(r.state)); if (r.status !== 'running') break;
    }
    return r;
  };
  const q = (r: ScienceStepResult) => JSON.stringify(potOf(r).quality);
  for (const warm of [false, true]) {
    const one = sealRun([0, H], [{ at: M, jointTarG: 6 }], warm), split = sealRun([0, 10 * M, H], [{ at: M, jointTarG: 6 }], warm), late = sealRun([0, 30_000, 10 * M, H], [{ at: M, jointTarG: 6 }], warm);
    ok(one.status === 'completed' && q(one) === q(split) && q(one) === q(late), `${warm ? 'warm' : 'cold'}: the joint tar of the seal reached is kept; one request = 10 min + the rest = a first 30 s with no seal yet`,
      `τ ${potOf(one).quality!.air_leak_tau_min} min, joint ${potOf(one).quality!.joint_cover_ppm} ppm`);
  }
  const ab = sealRun([0, H], [{ at: M, jointTarG: 6 }, { at: 30 * M, jointTarG: 60 }], false), ba = sealRun([0, H], [{ at: 30 * M, jointTarG: 60 }, { at: M, jointTarG: 6 }], false);
  ok(q(ab) === q(ba) && q(ab) === q(sealRun([0, H], [{ at: M, jointTarG: 6 }], false)), 'an action after the work is done (1800 s, never reached) changes nothing, in either order');

  // SB-A3: a bulb warming slowly spills inside a cell: stopped right after, the spill is settled (water to the ground)
  const shortTube = bulb(warmWell, { tubeLengthMm: 200 });
  const warming = (t: number): Env => ({ p: 1010, t: 28 + 0.25 * Math.floor(t / (5 * M)) });
  const probe = gauge(6 * H, warming, Array.from({ length: 6 * 3600 }, (_, i) => i * 1000 + 500), { equipment: [shortTube] }, 5 * M);
  const firstSpill = probe.all.flatMap((x) => x.observations).find((x) => /あふれ/.test(x.text ?? ''));
  ok(firstSpill !== undefined, 'a slowly warming bulb on a short tube spills over at some moment', `${firstSpill ? (firstSpill.at / 1000).toFixed(1) : '-'} s`);
  if (firstSpill) {
    const cellEnd = Math.ceil((firstSpill.at + 1) / 30_000) * 30_000;
    let st: ScienceStepRequest['state'] = null, r!: ScienceStepResult;
    for (let t = 0; t < cellEnd; t += 5 * M) {
      const e = Math.min(cellEnd, t + 5 * M);
      r = step(greq(t, e, warming(t), st, [], { equipment: [shortTube], ...(e === cellEnd ? { stop: 'operator' } : {}) })); st = JSON.parse(JSON.stringify(r.state));
    }
    const ground = r.released.find((x) => x.to === 'ground')?.amount.value ?? 0;
    ok(ground > 0 && sum(r.consumed) === sum(r.produced) + sum(r.released) && (r.diagnostics as { condition: string }).condition === 'spilled-top',
      'stopped at the next cell\'s start, the spill inside the cell is settled once (to the ground), the mass closes', `${ground} mg`);
    // the next cell's slightly higher pressure does not take it back: no number until the gauge is set again
    const after = (t: number): Env => (t >= cellEnd ? { ...warming(t), p: 1010.1 } : warming(t));
    const later = gauge(cellEnd + 2 * H, after, [cellEnd + 30 * M, cellEnd + 90 * M], { equipment: [shortTube] }, 5 * M);
    const tail = later.all.flatMap((x) => x.observations).filter((x) => x.at >= cellEnd);
    ok(tail.length > 0 && tail.every((x) => x.value === undefined), 'a passed end stays passed: the next weather does not bring the numbers back', tail.map((x) => x.text).join(' / '));
  }

  // SB-A4: the pressure hidden for a moment while the level is close to the top: the return looks at the whole gap,
  // up to its very end, and never gives a number the hidden stretch could have spilled
  const edgeTube = bulb(best, { tubeLengthMm: 100 });
  const edge = (t: number): Env => ({ p: t < H ? 1010 : 995.4, t: 28 + 0.5 * Math.min(1, Math.max(0, (t - H) / (10 * M))) });
  const control = gauge(H + 20 * M, edge, Array.from({ length: 1200 }, (_, i) => H + i * 1000 + 500), { equipment: [edgeTube] }, 1000);
  const cSpill = control.all.flatMap((x) => x.observations).find((x) => /あふれ/.test(x.text ?? ''));
  ok(cSpill !== undefined, 'the control (pressure always known) spills while the bulb warms', `${cSpill ? ((cSpill.at - H) / 1000).toFixed(1) : '-'} s after the drop`);
  if (cSpill) {
    const hideFrom = cSpill.at - 20_000, hideTo = cSpill.at + 8_000;
    const masked = (t: number): Env => (t >= hideFrom && t < hideTo ? { ...edge(t), p: undefined } : edge(t));
    const m = gauge(H + 20 * M, masked, [hideTo + 500, hideTo + 60_000], { equipment: [edgeTube] }, 1000);
    const back = m.all.flatMap((x) => x.observations).filter((x) => x.at >= hideTo);
    ok(back.every((x) => x.value === undefined), 'pressure hidden over the spill (28 s): after it returns no number is given (the spill cannot be ruled out)',
      `${back.map((x) => x.text ?? x.value).join(' / ') || '(nothing read)'}; condition ${(m.last.diagnostics as { condition: string }).condition}`);
  }
}

console.log('6. the reading follows the held pressure (m03x 0.1.2, Codex FX-SB-A1 on 7318506)');
{
  const tube100 = (mark: number) => bulb(best, { tubeLengthMm: 100, markMm: mark });
  // a known pressure that changes inside a cell (3661 s) reads and moves exactly as one that changes at the next cell (3690 s)
  const runSplit = (changeAt: number, mark: number, reads: number[], until = 3780_000) => {
    const bounds = [0, H, changeAt, until];
    let st: ScienceStepRequest['state'] = null; const all: ScienceStepResult[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const env: Env = { p: bounds[i] < H ? 1010 : bounds[i] < changeAt ? 995.6 : 995.3, t: 28 };
      const acts: [number, string][] = [...reads.filter((x) => x >= bounds[i] && x < bounds[i + 1]).map((x) => [x, 'read_gauge'] as [number, string])];
      const r = step(greq(bounds[i], bounds[i + 1], env, st, acts, { equipment: [tube100(mark)], ...(i === bounds.length - 2 ? { stop: 'operator' } : {}) }));
      all.push(r); st = JSON.parse(JSON.stringify(r.state));
    }
    const last = all[all.length - 1];
    return { all, last, obs: all.flatMap((x) => x.observations) };
  };
  const reads = Array.from({ length: 110 }, (_, i) => H + 1000 + i * 1000);
  const key = (r: ReturnType<typeof runSplit>, from: number) => JSON.stringify([r.obs.filter((o) => o.at >= from), r.last.produced, r.last.released, r.last.state.data]);
  const mid = runSplit(3661_000, 5, reads), edgeOfCell = runSplit(3690_000, 5, reads);
  ok(JSON.stringify(mid.obs.filter((o) => o.at >= 3661_000 && o.at < 3690_000)) === JSON.stringify(edgeOfCell.obs.filter((o) => o.at >= 3661_000 && o.at < 3690_000)) && key(mid, 3690_000) === key(edgeOfCell, 3690_000),
    'a known pressure changing inside a cell is read, leaks and spills from the next cell, exactly as one changing at that cell (5 mm marks)');
  const quiet = runSplit(3661_000, 5, []);
  ok(JSON.stringify([quiet.last.produced, quiet.last.released, quiet.last.state.data]) === JSON.stringify([mid.last.produced, mid.last.released, mid.last.state.data]), 'reading changes nothing');
  // fine marks (0.5 mm) near the mouth (100 marks): a number never stands past the mouth, and what is seen spilling is settled
  const fine = runSplit(3661_000, 0.5, reads);
  const nums = fine.obs.filter((o) => o.value !== undefined).map((o) => o.value as number), spilledSeen = fine.obs.some((o) => /あふれ/.test(o.text ?? ''));
  const ground = fine.last.released.find((x) => x.to === 'ground')?.amount.value ?? 0;
  ok(nums.every((v) => v <= 100) && (!spilledSeen || ground > 0) && sum(fine.last.consumed) === sum(fine.last.produced) + sum(fine.last.released),
    'fine marks near the mouth: no number past the mouth (100 marks); a spill that is seen is settled to the ground', `max ${Math.max(...nums)} marks, spill seen ${spilledSeen}, ground ${ground} mg`);
}

console.log('4. requests that are refused');
{
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  refused('a pot without a tube', step(greq(0, H, storm(0), null, [], { equipment: [{ ...bulb(warmWell), params: { ...potToEquipmentParams(potOf(seal({ warm: true, tube: null }))), markMm: 5 } }] })), /tubeBoreMm/);
  refused('no stick (markMm)', step(greq(0, H, storm(0), null, [], { equipment: [{ ...bulb(warmWell), params: { ...potToEquipmentParams(potOf(warmWell)) } }] })), /markMm/);
  refused('a pot whose air-holding is not known', step(greq(0, H, storm(0), null, [], { equipment: [bulb(warmWell, { airtightKnown: 0, airLeakTauMin: 0 })] })), /airtightKnown/);
  refused('too little water for the tube', step(greq(0, H, storm(0), null, [], { lots: [WATER(1_000)] })), /at least/);
  refused('set without the pressure', step(greq(0, H, { t: 28 }, null, [])), /known weather/);
  refused('energy offered', step(greq(0, H, storm(0), null, [], { energy: [{ sourceId: 'src:x', kind: 'heat', maxJ: 1 }] })), /no energy/);
  refused('an unknown action', step(greq(0, H, storm(0), null, [[0, 'vent']])), /unknown action/);
  const s0 = step(greq(0, H, storm(0), null, []));
  refused('a missing interval', step(greq(2 * H, 3 * H, storm(0), s0.state, [])), /noncontiguous/);
  refused('the bulb changed under the run', step(greq(H, 2 * H, storm(0), s0.state, [], { equipment: [bulb(coldBare)] })), /changed-input/);
}

console.log('7. the bamboo tube and the weather pot (p18x 0.1.0, p16x 0.1.5, table /5, m03x 0.2.0; owner\'s decisions 2026-10-10)');
{
  const BAMBOO = (mg = 30_000_000, q: Record<string, number> = {}): LotView => ({ lotId: 'lot:bamboo', materialId: 'bamboo', amount: { value: mg, unit: 'mg' }, location: 'site:shelf', quality: q });
  const cutReq = (from: number, to: number, state: ScienceStepRequest['state'], lot: LotView, lengthMm: number | null, o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
    contract: '0.2.0', requestId: `c@${from}`, world: W, runId: 'run:cut', ...BAMBOO_TUBE_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
    environment: { sampleId: 'e', source: 'simulation', effectiveAt: from }, lots: [lot], equipment: [], energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: ((to - from) / 1000) * 20 }], seed: 1,
    actions: lengthMm === null ? [] : [{ at: from, residentId: 'res:lantern', action: 'cut', params: { lengthMm } }], ...o });
  const cut = step(cutReq(0, H, null, BAMBOO(), 350));
  const tube = cut.produced.find((p) => p.materialId === 'bamboo_tube')!;
  ok(cut.status === 'completed' && tube && tube.quality!.length_mm === 350 && tube.quality!.bore_mm >= pv('bambooBoreMinMm') && tube.quality!.bore_mm <= pv('bambooBoreMaxMm') && sum(cut.consumed) === sum(cut.produced),
    'one internode cut at both ends: a straight bamboo tube, its bore the bamboo\'s; the rest of the bamboo comes back (mass closes)', `${tube?.quality?.bore_mm} mm bore, ${tube?.amount.value} mg`);
  const part1 = step(cutReq(0, 4 * M, null, BAMBOO(), 350)), part2 = step(cutReq(4 * M, H, JSON.parse(JSON.stringify(part1.state)), BAMBOO(), null));
  ok(part1.status === 'running' && JSON.stringify(part2.produced) === JSON.stringify(cut.produced), 'the hand work may span requests: the same tube');
  let splits = 0, greenSplits = 0;
  for (let sd = 1; sd <= 60; sd++) {
    if (step(cutReq(0, H, null, BAMBOO(), 300, { seed: sd })).produced.every((p) => p.materialId === 'bamboo')) splits++;
    if (step(cutReq(0, H, null, BAMBOO(30_000_000, { water_ppm: 450_000 }), 300, { seed: sd })).produced.every((p) => p.materialId === 'bamboo')) greenSplits++;
  }
  ok(splits > 0 && splits < greenSplits, 'some pieces split along their length and are no tube (all the bamboo comes back); green bamboo splits more', `dry ${splits}/60, green ${greenSplits}/60`);
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  refused('longer than one internode is refused (no node is pierced)', step(cutReq(0, H, null, BAMBOO(), 600)), /internode/);
  refused('too little bamboo', step(cutReq(0, H, null, BAMBOO(10_000), 350)), /not enough bamboo/);
  // through the plug of a sealed pot
  const tubeLot: LotView = { lotId: 'lot:btube', materialId: 'bamboo_tube', amount: tube.amount, location: 'site:shelf', quality: { ...tube.quality, bore_mm: 8, outer_mm: 13 } };
  const bSeal = seal({ warm: true, jointTarG: 6, tube: tubeLot }), tSeal = warmWell;
  const bp = potOf(bSeal);
  ok(bSeal.status === 'completed' && bp.quality!.tube_form === 2 && bp.quality!.tube_outer_mm === 13 && bp.quality!.x_tube_ppm! > 0 && bp.quality!.air_leak_tau_min < potOf(tSeal).quality!.air_leak_tau_min,
    'the bamboo tube goes through the plug (tube_form 2); its uneven outside leaks more at the joint than the test tube with the same tar', `${bp.quality!.air_leak_tau_min} vs ${potOf(tSeal).quality!.air_leak_tau_min} min`);
  const noSeal = seal({ tube: tubeLot, seal: false });
  ok(noSeal.produced.some((p) => p.materialId === 'bamboo_tube' && p.amount.value === tubeLot.amount.value), 'no seal reached: the bamboo tube comes back as it was');
  const pb = potToEquipmentParams(bp), pu = potToEquipmentParams(potOf(tSeal));
  ok(pb.tubeForm === 2 && pb.tubeOuterMm === 13 && pb.bulbHeatJPerK > 0 && pu.tubeForm === undefined && pu.bulbHeatJPerK === undefined,
    'table /5: the bamboo pot is a weather pot (tubeForm, tubeOuterMm, bulbHeatJPerK); the U-tube pot\'s params are as before', JSON.stringify(pb));
  // the weather pot: 250 mL of water in the 500 mL pot, the tube 350 mm
  const wpEq = (o: Record<string, number> = {}) => ({ equipmentId: 'eq:wpot', kind: 'assembled_pot', catalogEntry: 'assembled_pot', catalogVersion: 'civ-sci-test-2', condition: 1, params: { ...pb, markMm: 5, ...o } });
  const wreq = (from: number, to: number, env: Env, state: ScienceStepRequest['state'], acts: [number, string][], waterMg = 250_000, eqo: Record<string, number> = {}): ScienceStepRequest => ({
    ...greq(from, to, env, state, acts), runId: 'run:wpot', lots: [{ ...WATER(waterMg), lotId: 'lot:potwater' }], equipment: [wpEq(eqo)] });
  function wgauge(until: number, env: (t: number) => Env, readsAt: number[], chunk = H, waterMg = 250_000, eqo: Record<string, number> = {}) {
    let st: ScienceStepRequest['state'] = null; const all: ScienceStepResult[] = [];
    for (let t = 0; t < until; t += chunk) {
      const e = Math.min(until, t + chunk);
      const acts: [number, string][] = [...readsAt.filter((x) => x >= t && x < e).map((x) => [x, 'read_gauge'] as [number, string]), ...(e === until ? [[until - 1000, 'take_out'] as [number, string]] : [])];
      const r = step(wreq(t, e, env(t), st, acts, waterMg, eqo)); all.push(r); st = JSON.parse(JSON.stringify(r.state));
      if (r.status !== 'running') break;
    }
    const last = all[all.length - 1];
    return { all, last, obs: all.flatMap((r) => r.observations), marks: all.flatMap((r) => r.observations).filter((x) => x.value !== undefined).map((x) => x.value as number) };
  }
  const w = wgauge(2 * D, storm, every6h);
  // the column a still, leak-free weather pot would show for 30 hPa (its own geometry, the same ideal gas)
  const V = 500e-6, Dm = Math.cbrt((6 * V) / Math.PI), Ares = (Math.PI * Dm * Dm) / 4, A = Math.PI * 0.004 * 0.004, W0 = 250e-6, dip = W0 / Ares - 0.01;
  const V0 = V - W0 - Math.PI * 0.0065 * 0.0065 * (Dm - 0.01), k = (1 + A / Ares) * 1000 * pv('gravity');
  const xAt = (P: number) => { const s0 = 101000 * V0, a = k * A, b = P * A + k * V0, c = P * V0 - s0; return (-2 * c) / (b + Math.sqrt(b * b - 4 * a * c)); };
  const ideal = Math.round(xAt(98000) / 0.005);
  ok(w.last.status === 'completed' && w.marks.length === 8 && w.marks[3] > w.marks[0] && Math.abs(w.marks[3] - ideal) <= 3,
    'the weather pot: as the pressure falls 30 hPa the water climbs the bamboo tube (about 3 mm/hPa), close to the leak-free column', `marks ${w.marks.join(', ')}; leak-free ${ideal} (dip ${(dip * 1000).toFixed(1)} mm)`);
  const back = w.last.produced.find((p) => p.materialId === 'process_water');
  ok(back?.amount.value === 250_000 && w.last.released.length === 0, 'the pot\'s water comes back whole at the end (nothing spilled)');
  const warm = wgauge(12 * H, (t) => ({ p: 1010, t: t < 6 * H ? 28 : 29 }), [6 * H - 2000, 12 * H - 2000]);
  ok(warm.marks[1] - warm.marks[0] >= 1, 'it is a thermometer as well: 1 °C warmer in the shade, the water climbs too (keep it in the shade, note the temperature)', `${warm.marks.join(' → ')}`);
  // the weather in 6 h steps (each request carries its own weather; both chunkings start a request at every step)
  const storm6 = (t: number) => storm(Math.floor(t / (6 * H)) * 6 * H);
  const byCuts = (cuts: number[], readsAt: number[]) => {
    let st: ScienceStepRequest['state'] = null, from = 0; let last!: ScienceStepResult; const marks: number[] = [];
    for (const to of cuts) {
      const acts: [number, string][] = [...readsAt.filter((x) => x >= from && x < to).map((x) => [x, 'read_gauge'] as [number, string]), ...(to === cuts[cuts.length - 1] ? [[to - 1000, 'take_out'] as [number, string]] : [])];
      last = step(wreq(from, to, storm6(from), st, acts)); st = JSON.parse(JSON.stringify(last.state)); from = to;
      marks.push(...last.observations.filter((x) => x.value !== undefined).map((x) => x.value as number));
    }
    return { last, marks };
  };
  const hourly = byCuts(Array.from({ length: 48 }, (_, i) => (i + 1) * H), every6h);
  const odd = byCuts([...new Set([...Array.from({ length: 8 }, (_, i) => (i + 1) * 6 * H), ...Array.from({ length: 300 }, (_, i) => (i + 1) * (9 * M + 7_013)).filter((x) => x < 2 * D)])].sort((x, y) => x - y), every6h);
  const silent = byCuts(Array.from({ length: 48 }, (_, i) => (i + 1) * H), []);
  ok(JSON.stringify(odd.last.produced) === JSON.stringify(hourly.last.produced) && JSON.stringify(odd.marks) === JSON.stringify(hourly.marks) && JSON.stringify(silent.last.state) === JSON.stringify(hourly.last.state),
    'requests off the 30 s grid and reads change nothing (fixed cells, as the U-tube)', `${hourly.marks.join(', ')}`);
  const plunge = wgauge(2 * D, (t) => ({ p: 1010 - Math.min(70, (70 * t) / D), t: 28 }), every6h, H, 250_000, { tubeLengthMm: 200 });
  ok(plunge.last.released.some((r) => r.to === 'ground' && r.amount.value > 0) && plunge.obs.some((o) => /管の上から水があふれた|水があふれて減ったまま/.test(o.text ?? '')),
    'a deep low with a short tube: the water spills from the top (to the ground) and the weather pot says so', `${plunge.last.released.map((r) => r.amount.value).join(',')} mg`);
  const high = wgauge(D, (t) => ({ p: 1010 + Math.min(20, (20 * t) / (6 * H)), t: 28 }), every6h);
  ok(high.obs.some((o) => /外の空気が泡になって壺に入った|壺に空気が入ったまま/.test(o.text ?? '')), 'a high: the water is pushed down to the tube\'s end and outside air bubbles into the pot');
  const setFail = (name: string, waterMg: number, eqo: Record<string, number>, why: RegExp) => refused(name, step(wreq(0, H, storm(0), null, [], waterMg, eqo)), why);
  setFail('too little water: the tube\'s end must stand in it', 60_000, {}, /too little water/);
  setFail('too much water: air must stay above it', 400_000, {}, /too much water/);
  setFail('a tube too short to reach the water and stand out of the plug', 250_000, { tubeLengthMm: 120 }, /too short/);
  refused('an old run (0.1.2, state /2) is refused', step({ ...greq(0, H, storm(0), { schema: 'civ-sci.air-barometer-pot/2', data: {} }, []), processVersion: '0.1.2' }), /processVersion 0\.1\.2/);
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation', violations.slice(0, 3).join(' / '));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
