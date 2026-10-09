// Checks for preparing raw clay: soak, sieve, settle, pour off, thicken (p10x_clay_slake, island clock) and knead
// (p10y_clay_knead, world clock), then the chain into shaping.
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-clay-prep-check.ts
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { SLAKE_PROCESS, readRawClay } from '../src/science/step/slake';
import { CLAY_PIT, CLAY_PIT_TABLE, clayPitMaterials, clayPitParams } from '../src/science/step/clay-pit';
import { KNEAD_PROCESS } from '../src/science/step/knead';
import { ISLAND_CLAY_TABLE, islandClay } from '../src/science/island-clay';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const H = 3600_000, D = 24 * H, W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const violations: string[] = [];
const step = (q: ScienceStepRequest) => { const r = scienceStep(q); violations.push(...validateResult(q, r).map((v) => `${q.processId}@${q.interval.from}: ${v}`)); return r; };
const sum = (xs: { amount: { value: number } }[]) => xs.reduce((s, x) => s + x.amount.value, 0);

// 10 kg of clay as dug (Dot's unit), a fifth of it water; of the dry part, some sand, stones and roots
const RAW = (q: Record<string, number> = {}, mg = 10_000_000): LotView => ({ lotId: 'lot:raw', materialId: 'raw_clay', amount: { value: mg, unit: 'mg' }, location: 'site:hut-shelf',
  quality: { water_ppm: 200_000, xd_kaolinite_ppm: 450_000, xd_quartz_ppm: 350_000, xd_organic_c_ppm: 10_000, xc_quartz_ppm: 150_000, xc_inert_mineral_ppm: 50_000, xc_organic_c_ppm: 5_000, ...q } });
const WATER = (mg = 15_000_000): LotView => ({ lotId: 'lot:water', materialId: 'process_water', amount: { value: mg, unit: 'mg' }, location: 'site:hut-jar' });
const TUB = (p: Record<string, number> = {}) => ({ equipmentId: 'eq:tub', kind: 'fixture_clay_tub', catalogEntry: 'fixture_clay_tub', catalogVersion: 'civ-sci-test-2', condition: 1,
  params: { capacityMl: 40_000, surfaceCm2: 1500, sunExposure: 0, ...p } });
type Env = { t: number; rh: number; wind: number; source?: string };
const CALM: Env = { t: 28, rh: 0.75, wind: 3 };
const sreq = (from: number, to: number, state: ScienceStepRequest['state'], acts: [number, string][], o: Partial<ScienceStepRequest> = {}, env: Env = CALM): ScienceStepRequest => ({
  contract: '0.2.0', requestId: `s@${from}`, world: W, runId: 'run:slake', ...SLAKE_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
  environment: { sampleId: `env:${from}`, source: (env.source ?? 'record') as 'simulation', effectiveAt: from, airTempC: env.t, humidity: env.rh, windMs: env.wind },
  lots: [RAW(), WATER()], equipment: [TUB()], energy: [], seed: 1, actions: acts.map(([at, action]) => ({ at, residentId: 'res:dot', action })), ...o });

/** Run the tub in pieces of chunkMs; actions at absolute times; env per piece. Ends at take_out or `until`. */
function tub(until: number, acts: [number, string][], o: Partial<ScienceStepRequest> = {}, chunkMs = H, env: (t: number) => Env = () => CALM) {
  let st: ScienceStepRequest['state'] = null; const all: ScienceStepResult[] = [];
  for (let t = 0; t < until; t += chunkMs) {
    const end = Math.min(until, t + chunkMs);
    const r = step(sreq(t, end, st, acts.filter(([at]) => at >= t && at < end), o, env(t)));
    all.push(r); st = r.state;
    if (r.status !== 'running') break;
  }
  const last = all[all.length - 1];
  return { all, last, obs: all.flatMap((r) => r.observations), out: (m: string) => last.produced.find((p) => p.materialId === m) };
}
const wr = (q: Record<string, number>) => q.water_ppm / (1e6 - q.water_ppm);

console.log('1. from raw clay to clay that holds its shape');
const plan: [number, string][] = [[D, 'sieve'], [2 * D + 12 * H, 'decant'], [4 * D, 'decant'], [9 * D + 6 * H, 'take_out']];
const main = tub(10 * D, plan);
{
  const r = main.last, rc = readRawClay(RAW());
  const coarse = Object.values(rc.coarse).reduce((s, v) => s + (v ?? 0), 0);
  ok(r.status === 'completed' && sum(r.consumed) === sum(r.produced) + sum(r.released), 'the run ends at take_out; everything that went in comes out (clay, residue, poured water, vapour)',
    r.produced.map((p) => `${p.materialId} ${(p.amount.value / 1e6).toFixed(2)} kg`).join(', ') + `, vapour ${(sum(r.released) / 1e6).toFixed(2)} kg`);
  const res = main.out('clay_sieve_residue')!, clay = main.out('settled_clay')!;
  const resDry = res.amount.value * (1 - res.quality!.water_ppm / 1e6);
  ok(Math.abs(resDry - coarse) / coarse < 0.05, 'what stays on the cloth is the coarse part (sieved after a day: hardly any lumps)', `${(resDry / 1000).toFixed(0)} g dry vs ${(coarse / 1000).toFixed(0)} g coarse`);
  ok(clay.quality!.xd_kaolinite_ppm > 450_000 && clay.quality!.xd_quartz_ppm < 350_000 && clay.quality!.xd_organic_c_ppm < 10_000,
    'the clay is finer than what was dug: more clay mineral, less sand and roots', `kaolinite ${clay.quality!.xd_kaolinite_ppm}, quartz ${clay.quality!.xd_quartz_ppm} ppm`);
  const w = wr(clay.quality!);
  ok(w > 0.18 && w < 0.3, 'after nine days under the roof it has thickened into a workable clay', `water ratio ${w.toFixed(3)}; "${main.obs.at(-1)?.text}"`);
  ok(main.obs.some((o) => /小石や砂がたくさん/.test(o.text ?? '') && /根や草/.test(o.text ?? '')), 'the sieve shows the stones, sand and roots', main.obs.find((o) => o.quantity === 'sieve')?.text);
  const pours = main.obs.filter((o) => o.quantity === 'decant').map((o) => o.text);
  ok(pours.length === 2 && main.out('process_water')!.amount.value > 0, 'pouring off the clear water after it settled', pours.join(' / '));
  ok(r.energy.every((e) => e.sourceId.startsWith('src:env-heat:')) && main.all.every((x) => x.energy.every((e) => e.kind === 'heat')), 'the only energy is the air\'s heat that leaves with the vapour');
}

console.log('2. what the resident can learn');
{
  const early = tub(H, [[10 * 60_000, 'sieve'], [30 * 60_000, 'take_out']]);
  const late = tub(D + H, [[D, 'sieve'], [D + 60_000, 'take_out']]);
  const dry = (r: ReturnType<typeof tub>) => { const p = r.out('clay_sieve_residue')!; return p.amount.value * (1 - p.quality!.water_ppm / 1e6); };
  ok(dry(early) > 2 * dry(late) && /塊/.test(early.obs[0].text ?? '') && !/塊/.test(late.obs[0].text ?? ''), 'sieved too soon, lumps stay on the cloth: waiting lets the clay fall apart',
    `${(dry(early) / 1000).toFixed(0)} g vs ${(dry(late) / 1000).toFixed(0)} g on the cloth`);
  const after = (q: Record<string, number>) => (tub(2 * H, [[2 * H - 60_000, 'take_out']], { lots: [RAW(q), WATER()] }).last.diagnostics as { dispersed: number }).dispersed;
  const sunDried = after({ water_ppm: 20_000 }), moist = after({});
  ok(sunDried > moist + 0.2, 'clay dried in the sun first falls apart much faster than moist clay', `after 2 h: ${(sunDried * 100).toFixed(0)}% vs ${(moist * 100).toFixed(0)}%`);
  const soon = tub(13 * H, [[12 * H, 'sieve'], [12 * H + 30 * 60_000, 'decant'], [12 * H + 31 * 60_000, 'take_out']]);
  const later = tub(3 * D, [[12 * H, 'sieve'], [2 * D + 12 * H, 'decant'], [2 * D + 12 * H + 60_000, 'take_out']]);
  const poured = (r: ReturnType<typeof tub>) => r.out('process_water')?.amount.value ?? 0;
  ok(poured(soon) < poured(later) / 5 && /濁って/.test(soon.obs.find((o) => o.quantity === 'decant')?.text ?? ''), 'poured too soon, the water is cloudy and little comes off',
    `${(poured(soon) / 1e6).toFixed(2)} kg vs ${(poured(later) / 1e6).toFixed(2)} kg after two days`);
  const sunny = tub(4 * D, [[12 * H, 'sieve'], [D + 12 * H, 'decant'], [3 * D, 'take_out']], { equipment: [TUB({ sunExposure: 1 })] });
  const shade = tub(4 * D, [[12 * H, 'sieve'], [D + 12 * H, 'decant'], [3 * D, 'take_out']]);
  ok(wr(sunny.out('settled_clay')!.quality!) < wr(shade.out('settled_clay')!.quality!) - 0.2, 'a tub in the sun thickens faster than one in the shade',
    `${wr(sunny.out('settled_clay')!.quality!).toFixed(2)} vs ${wr(shade.out('settled_clay')!.quality!).toFixed(2)}`);
  const unsieved = tub(2 * H, [[H, 'take_out']]);
  const back = unsieved.out('raw_clay')!;
  let reread = false; try { reread = readRawClay({ ...back, lotId: 'lot:back', location: 's' } as LotView).coarse.quartz! > 0; } catch { reread = false; }
  ok(back && back.amount.value === 25_000_000 - sum(unsieved.last.released) && reread, 'taken out before sieving: the raw clay comes back wetter, with its stones still in it, and can be soaked again');
  const thick = tub(H, [[30 * 60_000, 'decant']]);
  ok(/こす前/.test(thick.obs[0]?.text ?? '') && !thick.last.produced.length, 'pouring off before sieving does nothing (the mud has not settled out of a sieved slip)');
}

console.log('3. pieces, outages, ends');
{
  const key = (r: ReturnType<typeof tub>) => JSON.stringify([r.last.produced, r.last.released, r.obs, r.last.state]);
  const wx = (t: number): Env => ({ t: 26 + ((Math.floor(t / (3 * H)) % 4)), rh: 0.7 + 0.05 * (Math.floor(t / (3 * H)) % 3), wind: 2 + (Math.floor(t / (3 * H)) % 2) });
  const offGrid: [number, string][] = [[D + 17_000, 'sieve'], [2 * D + 12 * H + 5_500, 'decant'], [2 * D + 13 * H + 7 * 60_000 + 13_000, 'take_out']];
  const a = tub(3 * D, offGrid, {}, H, wx);
  const b = tub(3 * D, offGrid, {}, 3 * H, wx);
  const c = tub(3 * D, offGrid, {}, 30_000, wx);
  ok(key(a) === key(b) && key(a) === key(c), 'hour by hour = 3 h = 30 s pieces, with actions between the grid points: the same lots, observations and state');
  const out = tub(2 * D, [[12 * H, 'sieve'], [D + 12 * H, 'take_out']], {}, H, (t) => (t >= 20 * H && t < 30 * H ? { ...CALM, source: 'unknown' } : CALM));
  const ref = tub(2 * D, [[12 * H, 'sieve'], [D + 12 * H, 'take_out']]);
  ok(out.out('settled_clay')!.quality!.history_complete === 0 && sum(out.last.released) < sum(ref.last.released),
    'hours of unknown weather: nothing evaporates in them (nothing invented), the clay\'s history is marked incomplete');
  // the tub lost at interval.to: what happened before still counts, the contents come back
  const s1 = step(sreq(0, 12 * H, null, [[11 * H, 'sieve']]));
  const lost = step(sreq(12 * H, D, s1.state, [], { stop: 'equipment-lost', equipment: [] }));
  const kept = step(sreq(12 * H, D, s1.state, [], { stop: 'operator' }));
  ok(lost.status === 'stopped' && sum(lost.released) > 0 && JSON.stringify(lost.produced) === JSON.stringify(kept.produced), 'the tub lost at the end of an interval: the day\'s evaporation counts and the contents come back as at a stop');
  const v1 = scienceStep({ ...sreq(0, 13 * H, null, [[12 * H, 'sieve'], [12 * H + 60_000, 'take_out']]), contract: '0.1.0' });
  const v2 = scienceStep(sreq(0, 13 * H, null, [[12 * H, 'sieve'], [12 * H + 60_000, 'take_out']]));
  const { contract: _a, ...b1 } = v1; const { contract: _b, drawn: _c, ...b2 } = v2 as typeof v2 & { drawn: unknown };
  ok(JSON.stringify(b1) === JSON.stringify(b2), 'contract 0.1.0 and 0.2.0 give the same answer');
}

console.log('4. kneading (world clock) and on into shaping');
const kreq = (from: number, to: number, state: ScienceStepRequest['state'], lots: LotView[], o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.2.0', requestId: `k@${from}`, world: W, runId: 'run:knead', ...KNEAD_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
  environment: { sampleId: `env:${from}`, source: 'simulation', effectiveAt: from }, lots,
  equipment: [{ equipmentId: 'eq:bench', kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: 'civ-sci-test-2', condition: 1 }],
  energy: [{ sourceId: 'src:dot-hands', kind: 'mechanical', maxJ: Math.round(((to - from) / 1000) * 25) }], seed: 1, actions: [], ...o });
{
  const sc = main.out('settled_clay')!;
  const clayLot: LotView = { lotId: 'lot:settled', materialId: 'settled_clay', amount: sc.amount, location: 'site:hut-shelf', quality: sc.quality };
  const kg = sc.amount.value / 1e6;
  const one = step(kreq(0, 3600_000, null, [clayLot]));
  ok(one.status === 'completed' && one.produced[0].materialId === 'prepared_clay' && one.simulated.to === Math.ceil(300 * kg) * 1000 && sum(one.consumed) === sum(one.produced),
    'kneading takes about five minutes a kilo, then the clay is one even prepared_clay lot', `${kg.toFixed(2)} kg in ${one.simulated.to / 1000} s, ${one.energy[0]?.usedJ} J; "${one.observations[0]?.text}"`);
  let st: ScienceStepRequest['state'] = null, r!: ScienceStepResult;
  for (let t = 0; ; t += 60_000) { r = step(kreq(t, t + 60_000, st, [clayLot])); st = r.state; if (r.status !== 'running') break; }
  ok(JSON.stringify(r.produced) === JSON.stringify(one.produced) && r.simulated.to === one.simulated.to, 'a minute at a time gives the same clay at the same moment');
  const weak = step(kreq(0, 60_000, null, [clayLot], { energy: [{ sourceId: 'src:dot-hands', kind: 'mechanical', maxJ: 600 }] }));
  ok(weak.status === 'needs-input' && weak.energy.length === 0 && weak.simulated.to === 60_000, 'hands offering less than the work needs: nothing happens in that interval');
  const stop = step(kreq(0, 60_000, null, [clayLot], { stop: 'operator' }));
  ok(stop.status === 'stopped' && stop.consumed.length + stop.produced.length === 0 && stop.energy[0]?.usedJ === 1200, 'stopped half way: the work done is counted, the clay is not settled (it stays as it was)');
  const stiff: LotView = { ...clayLot, lotId: 'lot:stiff', quality: { ...clayLot.quality, water_ppm: 140_000 } };
  const wetter = step(kreq(0, 3600_000, null, [stiff, { ...WATER(300_000), lotId: 'lot:w2' }]));
  ok(wr(wetter.produced[0].quality!) > wr(stiff.quality!) + 0.03 && sum(wetter.consumed) === sum(wetter.produced), 'too stiff clay takes the water kneaded in',
    `${wr(stiff.quality!).toFixed(3)} → ${wr(wetter.produced[0].quality!).toFixed(3)}`);
  const pc = one.produced[0];
  const piece = { lotId: 'lot:piece', materialId: 'prepared_clay', amount: { value: 45_000, unit: 'mg' as const }, location: 'site:bench', quality: pc.quality };
  const tile = step({ contract: '0.2.0', requestId: 't', world: W, runId: 'run:tile', processId: 'p11x_test_tile_shape', processVersion: 'fixture-4', catalogVersion: 'civ-sci-test-2',
    interval: { from: 0, to: 60_000 }, state: null, environment: { sampleId: 'env:fixture', source: 'record' as 'simulation', effectiveAt: 0 }, lots: [piece],
    equipment: [{ equipmentId: 'eq:bench', kind: 'fixture_bench', catalogEntry: 'fixture_bench', catalogVersion: 'civ-sci-test-2', condition: 1, params: { thicknessMm: 10, widthMm: 50, lengthMm: 50 } }],
    energy: [{ sourceId: 'src:dot-hands', kind: 'mechanical', maxJ: 120 }], actions: [], seed: 1 });
  ok(tile.status === 'completed' && tile.produced[0].materialId === 'test_tile_green' && tile.produced[0].quality!.xd_kaolinite_ppm === pc.quality!.xd_kaolinite_ppm,
    'a piece of it shapes into a test tile, carrying the make-up of the island clay', `${tile.status} ${JSON.stringify(tile.diagnostics ?? {})}`);
}

console.log('5. requests that are refused');
{
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  const base = sreq(0, H, null, []);
  refused('raw clay without its make-up', step({ ...base, lots: [{ ...RAW(), quality: { water_ppm: 200_000 } }, WATER()] }), /make-up-missing/);
  refused('more coarse quartz than quartz', step({ ...base, lots: [RAW({ xc_quartz_ppm: 400_000 }), WATER()] }), /coarse-exceeds-quartz/);
  refused('an unknown species', step({ ...base, lots: [RAW({ xd_gold_ppm: 1000 }), WATER()] }), /unknown-species/);
  refused('too little water to make a slip', step({ ...base, lots: [RAW(), WATER(8_000_000)] }), /not enough water/);
  refused('more than the tub holds', step({ ...base, equipment: [TUB({ capacityMl: 15_000 })] }), /do not fit/);
  refused('no tub', step({ ...base, equipment: [] }), /no fixture_clay_tub/);
  refused('an energy offer', step({ ...base, energy: [{ sourceId: 'src:x', kind: 'heat', maxJ: 1 }] }), /no offered energy/);
  refused('an unknown action', step(sreq(0, H, null, [[0, 'stir']])), /unknown action/);
  const s0 = step(base);
  refused('the clay lot changed under the run', step(sreq(H, 2 * H, s0.state, [], { lots: [RAW({}, 9_000_000), WATER()] })), /changed-input/);
  refused('a missing interval', step(sreq(2 * H, 3 * H, s0.state, [])), /noncontiguous/);
  refused('kneading the sieve residue', step(kreq(0, H, null, [{ lotId: 'lot:r', materialId: 'clay_sieve_residue', amount: { value: 1000, unit: 'mg' }, location: 's', quality: { water_ppm: 1000, xd_quartz_ppm: 900_000 } }])), /expected one or more/);
  refused('kneading clay without its make-up', step(kreq(0, H, null, [{ lotId: 'lot:c', materialId: 'settled_clay', amount: { value: 1000, unit: 'mg' }, location: 's', quality: { water_ppm: 200_000 } }])), /make-up-missing/);
}

console.log('6. Codex review of dd781fc: what comes out goes on into the next run');
{
  const sight = (r: ReturnType<typeof tub>) => r.obs.find((o) => o.quantity === 'sieve')?.text ?? '';
  // A1: what is seen on the cloth is what is there
  const clean = tub(D + H, [[D, 'sieve'], [D + 60_000, 'take_out']], { lots: [RAW({ xd_kaolinite_ppm: 1_000_000, xd_quartz_ppm: 0, xd_organic_c_ppm: 0, xc_quartz_ppm: 0, xc_inert_mineral_ppm: 0, xc_organic_c_ppm: 0, water_ppm: 0 }), WATER()] });
  const roots = tub(D + H, [[D, 'sieve'], [D + 60_000, 'take_out']], { lots: [RAW({ water_ppm: 0, xc_quartz_ppm: 0, xc_inert_mineral_ppm: 0 }), WATER()] });
  const lumps = tub(H, [[10 * 60_000, 'sieve'], [11 * 60_000, 'take_out']], { lots: [RAW({ xc_quartz_ppm: 0, xc_inert_mineral_ppm: 0, xc_organic_c_ppm: 0 }), WATER()] });
  ok(sight(clean) === 'こし布には何も残らなかった' && !clean.out('clay_sieve_residue'), 'A1: pure clay, fully fallen apart: nothing on the cloth, and nothing said to be there', sight(clean));
  ok(/根や草/.test(sight(roots)) && !/小石|砂/.test(sight(roots)), 'A1: only roots on the cloth: roots, not stones or sand', sight(roots));
  ok(/塊/.test(sight(lumps)) && !/小石|砂|根/.test(sight(lumps)), 'A1: only lumps on the cloth: lumps', sight(lumps));
  // A2: the poured-off water of a run with a gap in its history carries that gap into the next clay
  const gap = tub(3 * D, [[D, 'sieve'], [2 * D + 12 * H, 'decant'], [2 * D + 13 * H, 'take_out']], {}, H, (t) => (t >= 30 * H && t < 31 * H ? { ...CALM, source: 'unknown' } : CALM));
  const poured = gap.out('process_water')!;
  ok(poured.quality?.history_complete === 0, 'A2: water poured off a run with a gap carries history_complete 0');
  const firm: LotView = { lotId: 'lot:firm', materialId: 'settled_clay', amount: { value: 1_000_000, unit: 'mg' }, location: 's', quality: { water_ppm: 150_000, xd_kaolinite_ppm: 600_000, history_complete: 1 } };
  const k = step(kreq(0, H, null, [firm, { lotId: 'lot:poured', materialId: 'process_water', amount: { value: 150_000, unit: 'mg' }, location: 's', quality: poured.quality }]));
  ok(k.produced[0]?.quality?.history_complete === 0, 'A2: kneaded with that water, the clay\'s history is incomplete too');
  // B1: raw clay handed back (taken out before sieving) goes into the next run, five times over
  let lot: LotView = RAW({ water_ppm: 200_000, xd_kaolinite_ppm: 450_000, xd_quartz_ppm: 400_000, xd_calcite_ppm: 150_000, xd_organic_c_ppm: 0, xc_quartz_ppm: 0, xc_inert_mineral_ppm: 0, xc_organic_c_ppm: 0 });
  let rounds = 0, why = '';
  for (let i = 0; i < 5; i++) {
    const r = tub(H, [[H - 30_000, 'take_out']], { lots: [lot, { ...WATER(i === 0 ? 15_000_000 : 100_000), lotId: `lot:w${i}` }] });
    if (r.last.status !== 'completed') { why = String(r.last.evidence.notes); break; }
    const back = r.out('raw_clay')!; lot = { lotId: `lot:back${i}`, materialId: 'raw_clay', amount: back.amount, location: 's', quality: back.quality }; rounds++;
  }
  ok(rounds === 5, 'B1: raw clay handed back is read by the next run, five times in a row (no "exceeds the dry part")', why || `${(lot.amount.value / 1e6).toFixed(2)} kg after 5 soaks`);
  let coarseLot: LotView = RAW(), cr = 0;
  for (let i = 0; i < 3; i++) {
    const r = tub(H, [[H - 30_000, 'take_out']], { lots: [coarseLot, { ...WATER(i === 0 ? 15_000_000 : 100_000), lotId: `lot:cw${i}` }] });
    if (r.last.status !== 'completed') break;
    const back = r.out('raw_clay')!; coarseLot = { lotId: `lot:cb${i}`, materialId: 'raw_clay', amount: back.amount, location: 's', quality: back.quality }; cr++;
  }
  ok(cr === 3 && readRawClay(coarseLot).coarse.quartz! > 0, 'B1: the same with stones and sand in it: the coarse part reads back too');
  // B2: sieved at once (all still lumps), water poured off: an empty tub is a result, not an error
  const empty = tub(H, [[0, 'sieve'], [60_000, 'decant'], [120_000, 'take_out']]);
  ok(empty.last.status === 'completed' && !empty.out('settled_clay') && empty.out('clay_sieve_residue') && /空|水しか/.test(empty.obs.at(-1)?.text ?? ''),
    'B2: sieved at once and poured off: everything is on the cloth, the tub is empty, the run settles', `${empty.last.status}: ${empty.obs.map((o) => o.text).join(' / ')}`);
  const emptyChunks = tub(H, [[0, 'sieve'], [60_000, 'decant'], [120_000, 'take_out']], {}, 30_000);
  ok(JSON.stringify(emptyChunks.last.produced) === JSON.stringify(empty.last.produced), 'B2: the same in 30 s pieces');
  // B3: taken out too wet, the settled clay goes back into the tub (no water needed), waits, and then kneads into clay that holds
  const wet = tub(D + H, [[D, 'sieve'], [D + 30_000, 'take_out']]);
  const sc = wet.out('settled_clay')!;
  ok(/どろどろ/.test(wet.obs.at(-1)?.text ?? ''), 'B3: taken out half a minute after sieving: runny');
  const again = tub(9 * D, [[D, 'decant'], [8 * D + 12 * H, 'take_out']], { lots: [{ lotId: 'lot:wet', materialId: 'settled_clay', amount: sc.amount, location: 's', quality: sc.quality }] });
  const back = again.out('settled_clay')!;
  const kk = step(kreq(0, 2 * H, null, [{ lotId: 'lot:back', materialId: 'settled_clay', amount: back.amount, location: 's', quality: back.quality }]));
  ok(again.last.status === 'completed' && wr(back.quality!) < 0.35 && kk.status === 'completed' && /まとまる/.test(kk.observations[0]?.text ?? ''),
    'B3: back in the tub it settles, the water is poured off, it thickens, and kneads into clay that holds', `${wr(sc.quality!).toFixed(2)} → ${wr(back.quality!).toFixed(2)}; "${kk.observations[0]?.text}"`);
  const pc: LotView = { lotId: 'lot:pc', materialId: 'prepared_clay', amount: { value: 2_000_000, unit: 'mg' }, location: 's', quality: { water_ppm: 400_000, xd_kaolinite_ppm: 600_000 } };
  const pcBack = tub(2 * D, [[2 * D - 30_000, 'take_out']], { lots: [pc] });
  ok(pcBack.last.status === 'completed' && wr(pcBack.out('settled_clay')!.quality!) < wr(pc.quality!), 'B3: too soft prepared clay can wait in the tub too');
  ok(step(sreq(0, H, null, [], { lots: [RAW()] })).status === 'failed', 'raw clay still needs water to soak in');
  ok(step(sreq(0, H, null, [], { lots: [{ ...pc, quality: { ...pc.quality, xc_quartz_ppm: 1000 } }] })).status === 'failed', 'sieved clay with coarse parts listed is refused (it has been sieved)');
}

console.log('9. the clay pit (the island\'s first tub)');
{
  const pitParams = clayPitParams({ diameterCm: 50, depthCm: 25 }), m = clayPitMaterials({ diameterCm: 50, depthCm: 25 });
  ok(CLAY_PIT_TABLE === 'civ-sci.clay-pit/1' && pitParams.capacityMl > 25_000 && pitParams.capacityMl < 35_000 && pitParams.surfaceCm2 > 1200 && pitParams.surfaceCm2 < 1700,
    'a pit 50 cm across and 25 cm deep, lined with 2 cm of clay, holds about 30 L under a water surface of about 1500 cm²', JSON.stringify(pitParams));
  ok(m.rawClayMg > 15_000_000 && m.rawClayMg < 30_000_000 && m.handSeconds > 1800 && m.handSeconds < 4 * 3600,
    'it takes about two raft loads of raw clay for the lining, and an hour or two of digging and treading', `${(m.rawClayMg / 1e6).toFixed(1)} kg, ${(m.handSeconds / 60).toFixed(0)} min at ${m.handPowerW} W`);
  const PIT = (p = pitParams) => ({ equipmentId: 'eq:pit', kind: CLAY_PIT, catalogEntry: CLAY_PIT, catalogVersion: 'civ-sci-test-2', condition: 1, params: p });
  const inPit = tub(10 * D, plan, { equipment: [PIT()] }), inTub = tub(10 * D, plan, { equipment: [TUB(pitParams)] });
  ok(JSON.stringify([inPit.last.produced, inPit.last.released, inPit.obs]) === JSON.stringify([inTub.last.produced, inTub.last.released, inTub.obs]) && inPit.out('settled_clay') !== undefined,
    'the soaking step takes the pit as its tub: 10 kg of raw clay and 15 L of water give the same clay as in a test tub of the same size');
  const small = step(sreq(0, H, null, [], { equipment: [PIT(clayPitParams({ diameterCm: 30, depthCm: 15 }))] }));
  ok(small.status === 'failed' && /do not fit/.test(String(small.evidence.notes)), 'a pit too small for the clay and the water is refused', String(small.evidence.notes));
  let threw = 0;
  for (const bad of [{ diameterCm: 5, depthCm: 25 }, { diameterCm: 50, depthCm: 100 }, { diameterCm: 50, depthCm: 25, sunExposure: 2 }, { diameterCm: NaN, depthCm: 25 }]) { try { clayPitParams(bad); } catch { threw++; } }
  ok(threw === 4, 'sizes outside the table are refused');
}

console.log('10. feeling the clay in the pit (look, 0.1.3)');
{
  const pitP = clayPitParams({ diameterCm: 50, depthCm: 25 });
  const PIT = { equipmentId: 'eq:pit', kind: CLAY_PIT, catalogEntry: CLAY_PIT, catalogVersion: 'civ-sci-test-2', condition: 1, params: pitP };
  const looks: [number, string][] = Array.from({ length: 20 }, (_, n) => [4 * D + n * 12 * H + 1_000, 'look'] as [number, string]);
  const withLooks = tub(10 * D, [...plan, ...looks], { equipment: [PIT] }), without = tub(10 * D, plan, { equipment: [PIT] });
  ok(JSON.stringify([withLooks.last.produced, withLooks.last.released]) === JSON.stringify([without.last.produced, without.last.released]), 'looking changes nothing in the pit');
  const feels = withLooks.obs.filter((o) => o.quantity === 'feel' && o.at < 9 * D).map((o) => o.text);
  ok(feels.some((f) => /べったり/.test(f ?? '')) && feels.some((f) => /よくまとまる/.test(f ?? '')), 'day by day the clay in the pit goes from sticky to firm in the hand', [...new Set(feels)].join(' → '));
  // a resident who takes it out when it feels right gets clay that holds its shape, where the fixed 9.25-day plan overshoots in the pit
  let at = 0;
  for (const o of withLooks.obs) if (o.quantity === 'feel' && /よくまとまる/.test(o.text ?? '')) { at = o.at; break; }
  const byFeel = tub(10 * D, [[D, 'sieve'], [2.5 * D, 'decant'], [4 * D, 'decant'], [at + 30_000, 'take_out']], { equipment: [PIT] });
  ok(at > 0 && /よくまとまる/.test(byFeel.obs.find((o) => o.quantity === 'feel')?.text ?? '') && /固く|乾いて/.test(without.obs.find((o) => o.quantity === 'feel')?.text ?? ''),
    'taken out when it feels firm, it is ready to knead (on a fixed 9.25-day plan the pit dries it too far)', `${(at / D).toFixed(1)} days: ${byFeel.obs.find((o) => o.quantity === 'feel')?.text} / fixed plan: ${without.obs.find((o) => o.quantity === 'feel')?.text}`);
  const unknown = tub(2 * D, [[D, 'look'], [2 * D - 30_000, 'take_out']], { equipment: [PIT] }, H, (t) => (t < D ? { ...CALM, source: 'unknown' } : CALM));
  ok(unknown.obs.every((o) => o.quantity !== 'feel' || o.at >= 2 * D - 30_000) && unknown.obs.filter((o) => o.quantity === 'feel' && o.at < 2 * D - 30_000).length === 0, 'after unknown weather a look tells nothing');
}

console.log('12. looks: history and order (0.1.4, Codex A-S1 and A-S2 on 0a3de47)');
{
  const feel = (r: ReturnType<typeof tub>) => r.obs.filter((o) => o.quantity === 'feel');
  const atLook = (r: ReturnType<typeof tub>) => feel(r).filter((o) => o.at === D);
  const look1: [number, string][] = [[D, 'look'], [D + H, 'take_out']];
  const sure = tub(2 * D, look1), clayGap = tub(2 * D, look1, { lots: [RAW({ history_complete: 0 }), WATER()] }),
    waterGap = tub(2 * D, look1, { lots: [RAW(), { ...WATER(), quality: { history_complete: 0 } }] });
  ok(atLook(sure).length === 1 && atLook(clayGap).length === 0 && atLook(waterGap).length === 0,
    'clay or water that came in with an incomplete history is not felt as if its water were known (only the closing words)', `${atLook(sure)[0]?.text} / clay ${atLook(clayGap).length}, water ${atLook(waterGap).length}`);
  const both: [number, string][] = [[12 * H, 'look'], [12 * H, 'sieve'], [12 * H + 17_003, 'look'], [D + H, 'take_out']];
  const key = (r: ReturnType<typeof tub>) => JSON.stringify(r.obs.map((o) => [o.at, o.quantity, o.text]));
  const one = tub(2 * D, both, {}, 2 * D), halves = tub(2 * D, both, {}, 12 * H), odd = tub(2 * D, both, {}, 12 * H + 17_003);
  ok(key(one) === key(halves) && key(one) === key(odd) && /^どろ|^やわ/.test(feel(one)[0]?.text ?? ''),
    'sieve and look at the same moment: the hands act first, whether the moment opens a request or falls inside one', feel(one).map((o) => o.text).join(' / '));
}

console.log('13. a missing wind (0.1.5)');
{
  const acts: [number, string][] = [[D, 'sieve'], [2 * D, 'decant'], [3 * D, 'take_out']];
  const key = (r: ReturnType<typeof tub>) => JSON.stringify([r.last.produced, r.last.released, r.obs]);
  const noWind = tub(4 * D, acts, {}, H, (t) => (t >= D + H && t < 2 * D ? ({ ...CALM, wind: undefined } as unknown as Env) : CALM));
  const unknown = tub(4 * D, acts, {}, H, (t) => (t >= D + H && t < 2 * D ? { ...CALM, source: 'unknown' } : CALM));
  const calm = tub(4 * D, acts, {}, H, (t) => (t >= D + H && t < 2 * D ? { ...CALM, wind: 0 } : CALM));
  ok(key(noWind) === key(unknown) && key(calm) !== key(unknown), 'a missing wind is unknown weather in the tub (no evaporation, history incomplete); wind 0 is calm');
}

console.log('11. the island\'s clay (table civ-sci.island-clay/1, assumed)');
{
  const c = islandClay('south-near');
  ok(ISLAND_CLAY_TABLE === 'civ-sci.island-clay/1' && c?.status === 'assumed' && JSON.stringify(c.quality) === JSON.stringify(RAW().quality) && readRawClay({ ...RAW(), quality: { ...c.quality } }).water === 2_000_000,
    'the clay of the island to the south is the checks\' example raw clay (what main uses), marked assumed, and it reads as raw_clay');
  ok(islandClay('east-flat') === undefined, 'an island with no clay described has none');
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation', violations.slice(0, 3).join(' / '));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
