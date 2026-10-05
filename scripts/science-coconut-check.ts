// Checks for coconut oil: p30x_coconut_milk (world clock, hand work) and p31x_coconut_oil_boil (island clock, wood fire).
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-coconut-check.ts
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { COCONUT_BOIL_PROCESS, COCONUT_MILK_PROCESS } from '../src/science/step/coconut';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const H = 3600_000, M10 = 600_000, W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const violations: string[] = [];
const step = (q: ScienceStepRequest) => { const r = scienceStep(q); violations.push(...validateResult(q, r).map((v) => `${q.processId}@${q.interval.from}: ${v}`)); return r; };
const sum = (xs: { amount: { value: number } }[]) => xs.reduce((s, x) => s + x.amount.value, 0);
const drawnSum = (r: ScienceStepResult) => sum((r as ScienceStepResult & { drawn?: { amount: { value: number } }[] }).drawn ?? []);

// four drift coconuts, about 1.3 kg each, and as much water as there is meat
const NUTS = (q: Record<string, number> = {}): LotView => ({ lotId: 'lot:nuts', materialId: 'coconut', amount: { value: 5_200_000, unit: 'mg' }, location: 'site:hut', quality: { count: 4, ...q } });
const WATER = (mg = 1_560_000): LotView => ({ lotId: 'lot:water', materialId: 'process_water', amount: { value: mg, unit: 'mg' }, location: 'site:jar' });
const TOOLS = { equipmentId: 'eq:tools', kind: 'fixture_coconut_tools', catalogEntry: 'fixture_coconut_tools', catalogVersion: 'civ-sci-test-2', condition: 1 };
const mreq = (from: number, to: number, state: ScienceStepRequest['state'], lots: LotView[], o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.2.0', requestId: `m@${from}`, world: W, runId: 'run:milk', ...COCONUT_MILK_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
  environment: { sampleId: `env:${from}`, source: 'simulation', effectiveAt: from }, lots, equipment: [TOOLS],
  energy: [{ sourceId: 'src:dot-hands', kind: 'mechanical', maxJ: Math.round(((to - from) / 1000) * 30) }], seed: 1, actions: [], ...o });

console.log('1. coconut milk (world clock, by hand)');
const milkRun = step(mreq(0, 2 * H, null, [NUTS(), WATER()]));
const out = (r: ScienceStepResult, m: string) => r.produced.find((p) => p.materialId === m);
const MILK = out(milkRun, 'coconut_milk')!;
{
  ok(milkRun.status === 'completed' && milkRun.simulated.to === 4 * 1200_000 && sum(milkRun.consumed) === sum(milkRun.produced),
    'four nuts take 80 minutes of hand work; everything that went in comes out', milkRun.produced.map((p) => `${p.materialId} ${(p.amount.value / 1000).toFixed(0)} g`).join(', '));
  ok(out(milkRun, 'coconut_shell')!.quality!.count === 8 && out(milkRun, 'coconut_husk')!.quality!.ash_dry_ppm! > 0,
    'the husk and the shell come out as woody lots (eight half shells: cups, and later fuel or charcoal)');
  const dry = step(mreq(0, 2 * H, null, [NUTS()]));
  const fatIn = (r: ScienceStepResult) => { const p = out(r, 'coconut_milk')!; return p.amount.value * p.quality!.x_coconut_fat_ppm / 1e6; };
  ok(fatIn(milkRun) > fatIn(dry) * 1.3 && /薄い/.test(milkRun.observations[0].text ?? '') && /濃い/.test(dry.observations[0].text ?? ''),
    'squeezed with water, more of the fat comes out (a thinner milk); without, a thick milk and an oily pulp', `${(fatIn(milkRun) / 1000).toFixed(0)} g vs ${(fatIn(dry) / 1000).toFixed(0)} g of fat`);
  let st: ScienceStepRequest['state'] = null, r!: ScienceStepResult;
  for (let t = 0; ; t += 60_000) { r = step(mreq(t, t + 60_000, st, [NUTS(), WATER()])); st = r.state; if (r.status !== 'running') break; }
  ok(JSON.stringify(r.produced) === JSON.stringify(milkRun.produced) && r.simulated.to === milkRun.simulated.to, 'a minute at a time gives the same lots at the same moment');
  const weak = step(mreq(0, 60_000, null, [NUTS()], { energy: [{ sourceId: 'src:dot-hands', kind: 'mechanical', maxJ: 600 }] }));
  ok(weak.status === 'needs-input' && weak.energy.length === 0, 'tired hands (less than the work needs): nothing happens in that interval');
  const stop = step(mreq(0, 60_000, null, [NUTS()], { stop: 'operator' }));
  ok(stop.status === 'stopped' && stop.consumed.length + stop.produced.length === 0 && stop.energy[0]?.usedJ === 1800, 'stopped half way: the work is counted, the nuts are not settled');
  const v1 = scienceStep({ ...mreq(0, 2 * H, null, [NUTS(), WATER()]), contract: '0.1.0' });
  const { contract: _a, ...b1 } = v1; const { contract: _b, drawn: _c, ...b2 } = milkRun as typeof milkRun & { drawn: unknown };
  ok(JSON.stringify(b1) === JSON.stringify(b2), 'contract 0.1.0 and 0.2.0 give the same answer');
}

console.log('2. boiling it into oil (island clock, a wood fire)');
const fat0 = () => MILK.amount.value * MILK.quality!.x_coconut_fat_ppm / 1e6;
const pv_oilMax = 0.9; // oilRecoverMax (params.ts)
let crack = 0;
const MILKLOT: LotView = { lotId: 'lot:milk', materialId: 'coconut_milk', amount: MILK.amount, location: 'site:hut', quality: MILK.quality };
const WOOD = (mg = 12_000_000, water = 150_000): LotView => ({ lotId: 'lot:wood', materialId: 'firewood', amount: { value: mg, unit: 'mg' }, location: 'site:woodpile', quality: { water_ppm: water } });
const POT = (p: Record<string, number> = {}) => ({ equipmentId: 'eq:pot', kind: 'fixture_cook_pot', catalogEntry: 'fixture_cook_pot', catalogVersion: 'civ-sci-test-2', condition: 1,
  params: { heatCapJPerK: 1800, uaWPerK: 3, heatShare: 0.2, capacityMl: 5000, ...p } });
const PIT = { equipmentId: 'eq:pit', kind: 'open_fire_pit', catalogEntry: 'open_fire_pit', catalogVersion: 'civ-sci-test-2', condition: 1, params: { maxBurnKgPerH: 3 } };
type Act = [number, string, number?];
const breq = (from: number, to: number, state: ScienceStepRequest['state'], acts: Act[], o: Partial<ScienceStepRequest> = {}, source = 'record'): ScienceStepRequest => ({
  contract: '0.2.0', requestId: `b@${from}`, world: W, runId: 'run:boil', ...COCONUT_BOIL_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
  environment: { sampleId: `env:${from}`, source: source as 'simulation', effectiveAt: from, airTempC: 28, humidity: 0.75, windMs: 2 },
  lots: [MILKLOT, WOOD()], equipment: [POT(), PIT], energy: [], seed: 1,
  actions: acts.map(([at, action, level]) => ({ at, residentId: 'res:dot', action, ...(level === undefined ? {} : { params: { level } }) })), ...o });
function boil(until: number, acts: Act[], o: Partial<ScienceStepRequest> = {}, chunk = M10, src: (t: number) => string = () => 'record') {
  let st: ScienceStepRequest['state'] = null; const all: ScienceStepResult[] = [];
  for (let t = 0; t < until; t += chunk) {
    const r = step(breq(t, Math.min(until, t + chunk), st, acts.filter(([at]) => at >= t && at < Math.min(until, t + chunk)), o, src(t)));
    all.push(r); st = r.state; if (r.status !== 'running') break;
  }
  const last = all[all.length - 1];
  return { all, last, obs: all.flatMap((r) => r.observations), out: (m: string) => out(last, m), diag: last.diagnostics as { tC: number; brown: number; scorch: number; waterRatio: number } };
}
/** Find when the crackling starts on a fire level (looking every 10 minutes). */
const lookEvery = (until: number, every = M10) => Array.from({ length: Math.floor(until / every) }, (_, i) => [i * every + 1000, 'look'] as Act);
{
  // a watchful tender looks every minute
  const watch = boil(6 * H, [[0, 'fire_level', 1], ...lookEvery(6 * H, 60_000)]);
  const sounds = watch.obs.filter((o) => o.channel === 'sound').map((o) => [o.at, o.text] as const);
  const firstCrackle = sounds.find(([, s]) => /ぱちぱち/.test(s ?? ''))?.[0];
  ok(sounds.some(([, s]) => /ぐつぐつ/.test(s ?? '')) && firstCrackle !== undefined, 'on a medium fire it boils for hours, then the bubbling turns to crackling: the water is nearly gone',
    `crackling from ${((firstCrackle ?? 0) / H).toFixed(1)} h`);
  crack = Math.ceil((firstCrackle ?? 0) / 30_000) * 30_000;
  // the good way: turn the fire down when it crackles, lift the pot when the solids are golden-brown
  const good = boil(crack + H, [[0, 'fire_level', 1], [crack, 'fire_level', 0], ...lookEvery(crack + H, 60_000).filter(([at]) => at > crack)]);
  const goldenAt = good.obs.find((o) => o.channel === 'sight' && /茶色|金色/.test(o.text ?? ''))?.at;
  ok(goldenAt !== undefined, 'turned down at the crackle, the solids turn golden and clear oil floats', `${(((goldenAt ?? 0) - crack) / 60_000).toFixed(0)} min after the crackle`);
  const lift = Math.ceil(((goldenAt ?? crack) + 10 * 60_000) / 30_000) * 30_000;
  const done = boil(lift + M10, [[0, 'fire_level', 1], [crack, 'fire_level', 0], [lift, 'take_off']]);
  const oil = done.out('coconut_oil'), latik = done.out('coconut_latik');
  const fat = MILK.amount.value * MILK.quality!.x_coconut_fat_ppm / 1e6;
  ok(done.last.status === 'completed' && oil && oil.quality!.scorch_ppm! < 100_000 && oil.amount.value > 0.7 * fat && /澄んだ/.test(done.obs.at(-1)?.text ?? ''),
    'lifted off then: clear, pale oil, about three quarters of the fat', `${(oil!.amount.value / 1000).toFixed(0)} g of oil from ${(fat / 1000).toFixed(0)} g of fat, scorch ${oil!.quality!.scorch_ppm}`);
  ok(latik && latik.quality!.x_coconut_fat_ppm! > 0, 'the browned solids (latik) keep the rest of the fat');
  ok(sum(done.last.consumed) + drawnSum(done.last) === sum(done.last.produced) + sum(done.last.released) && done.last.released.some((x) => x.materialId === 'process_co2'),
    'milk + firewood + the O2 drawn = oil + latik + firewood left + ash + vapour + CO2');
  // the same fire, but looking only every ten minutes: the water goes, the pot climbs fast, and the moment is missed
  const lax = boil(crack + H, [[0, 'fire_level', 1], ...lookEvery(crack + H)]);
  const laxLift = lax.obs.find((o) => o.at > crack - M10 && o.channel === 'sight' && /金色|茶色|黒ずみ/.test(o.text ?? ''))?.at ?? crack;
  const late = boil(crack + H, [[0, 'fire_level', 1], [Math.ceil(laxLift / 30_000) * 30_000, 'take_off']]);
  ok((late.out('coconut_oil')?.quality!.scorch_ppm ?? 0) > 4 * (oil?.quality!.scorch_ppm ?? 1), 'looking only every ten minutes on a medium fire: by the time it shows, the oil is already darker',
    `scorch ${late.out('coconut_oil')?.quality!.scorch_ppm} vs ${oil?.quality!.scorch_ppm}`);
  // left on a strong fire: it scorches
  const burnt = boil(crack + H, [[0, 'fire_level', 2], [crack + 30 * 60_000, 'take_off']]);
  ok(burnt.out('coconut_oil') && burnt.out('coconut_oil')!.quality!.scorch_ppm! > 400_000 && /焦げ/.test(burnt.obs.at(-1)?.text ?? ''),
    'a strong fire left on after the water has gone: dark oil that smells burnt', `scorch ${burnt.out('coconut_oil')?.quality!.scorch_ppm}`);
  // lifted off too early: still milk, thicker
  const early = boil(2 * H, [[0, 'fire_level', 1], [H, 'take_off']]);
  ok(early.out('coconut_milk') && !early.out('coconut_oil') && early.out('coconut_milk')!.quality!.x_water_ppm! < MILK.quality!.x_water_ppm!,
    'lifted off while it still boils: thicker milk, no oil yet (it can be boiled again)');
  // lifted off early, the thicker milk goes back on the fire, three times: it always reads back
  let again: LotView = MILKLOT, rounds = 0;
  for (let i = 0; i < 3; i++) {
    const r = boil(H, [[0, 'fire_level', 1], [H - 30_000, 'take_off']], { lots: [again, { ...WOOD(), lotId: `lot:wood${i}` }] });
    const m = r.out('coconut_milk'); if (r.last.status !== 'completed' || !m) break;
    again = { lotId: `lot:milk${i}`, materialId: 'coconut_milk', amount: m.amount, location: 's', quality: m.quality }; rounds++;
  }
  ok(rounds === 3, 'thicker milk handed back goes on the fire again, three times over (it reads back)', `${(again.amount.value / 1000).toFixed(0)} g left`);
  const low = boil(6 * H, [[0, 'fire_level', 0], [6 * H - 30_000, 'look']]);
  ok(low.diag.waterRatio > 2 && /ぐつぐつ|湯気/.test(low.obs[0]?.text ?? ''), 'a low fire from the start: six hours and still mostly water', `water ${low.diag.waterRatio.toFixed(2)} of the rest`);
  const short = boil(8 * H, [[0, 'fire_level', 1]], { lots: [MILKLOT, WOOD(1_000_000)] });
  ok(short.obs.some((o) => /薪が尽きて/.test(o.text ?? '')) || (short.last.diagnostics as { outcome: string }).outcome === 'fuel_exhausted',
    'too little wood: the fire dies and the milk cools');
}

console.log('3. pieces, outages, ends');
{
  const plan: Act[] = [[0, 'fire_level', 1], [4 * H + 7 * 60_000 + 13_000, 'fire_level', 0], [4 * H + 31 * 60_000 + 30_000, 'look'], [5 * H + 3 * 60_000 + 7_000, 'take_off']];
  const key = (r: ReturnType<typeof boil>) => JSON.stringify([r.last.produced, r.last.released, r.obs, r.last.state]);
  const a = boil(6 * H, plan, {}, M10), b = boil(6 * H, plan, {}, H), c = boil(6 * H, plan, {}, 30_000);
  ok(key(a) === key(b) && key(a) === key(c), '10 min = 1 h = 30 s pieces, with actions between the grid points: the same lots, observations and state');
  const untended = boil(3 * H, [[0, 'fire_level', 1]], {}, H, (t) => (t === H ? 'unknown' : 'record'));
  ok(untended.last.status === 'stopped' && untended.obs.some((o) => /火が落ちて/.test(o.text ?? '')) && untended.last.produced.every((p) => p.quality?.history_complete !== 1),
    'an hour nobody can see (unknown weather): the fire is not left burning on its own, the run stops, the history is incomplete');
  const s1 = step(breq(0, H, null, [[0, 'fire_level', 1]]));
  const lost = step(breq(H, 2 * H, s1.state, [], { stop: 'equipment-lost', equipment: [PIT] }));
  const kept = step(breq(H, 2 * H, s1.state, [], { stop: 'operator' }));
  ok(lost.status === 'stopped' && JSON.stringify(lost.produced) === JSON.stringify(kept.produced) && sum(lost.released) > 0,
    'the pot lost at the end of an interval: the hour of boiling counts, as at a stop');
  const v1 = scienceStep({ ...breq(0, H, null, []), contract: '0.1.0' });
  ok(v1.status === 'failed' && /unknown contract/.test(String(v1.evidence.notes)), 'contract 0.1.x is refused (the fire draws O2: drawn is 0.2.x)');
}

console.log('5. Codex review of eaa2a84 (A1, A2, B1)');
{
  const run = (chunk: number, looks: Act[] = []) => boil(4 * H, [[0, 'fire_level', 1], [195 * 60_000, 'take_off'], ...looks], {}, chunk);
  const oilOf = (r: ReturnType<typeof boil>) => r.out('coconut_oil')?.amount.value ?? 0;
  const base = run(H);
  // A1: looking does not change the oil
  const looked = run(H, Array.from({ length: 190 }, (_, i) => [17_000 + i * 60_000, 'look'] as Act));
  ok(oilOf(looked) === oilOf(base) && JSON.stringify(looked.last.state) === JSON.stringify(base.last.state) && oilOf(base) > 0,
    'A1: looking every minute (at 17 s past) changes nothing in the pot: the same oil and state', `${oilOf(base)} mg`);
  // A1: any split of the same run agrees (on and off the grid)
  const splits = [30_000, M10, 37_001, 7_300, 1_000].map((c) => oilOf(run(c)));
  const spread = (Math.max(...splits) - Math.min(...splits)) / oilOf(base);
  ok(splits.slice(0, 2).every((v) => v === oilOf(base)) && spread < 0.005, 'A1: 30 s, 10 min, 1 h agree exactly; 37.001 s, 7.3 s and 1 s pieces within 0.5 %',
    `${splits.join(', ')} mg (spread ${(spread * 100).toFixed(3)} %)`);
  // A2: heat the pot holds is stored, not lost; while it cools, stored falls and the loss shows
  const warm = step(breq(0, 60_000, null, [[0, 'fire_level', 1]]));
  const e = warm.energy[0]!, held = (warm.diagnostics as { heldJ: number }).heldJ;
  ok(e.storedJ !== undefined && Math.abs(e.storedJ - held) <= 1 && e.storedJ > 30_000 && e.usedJ === e.storedJ! + e.lostJ,
    'A2: the first minute of heating: the heat the pot and milk now hold is storedJ', `stored ${e.storedJ} J of used ${e.usedJ} J`);
  let st: ScienceStepRequest['state'] = null; const ens: { usedJ: number; storedJ?: number; lostJ: number }[] = [];
  for (let t = 0; t < 80 * 60_000; t += M10) {
    const r = step(breq(t, t + M10, st, t === 0 ? [[0, 'fire_level', 1]] : [], { lots: [MILKLOT, WOOD(400_000)] })); st = r.state; ens.push(...r.energy);
  }
  const cooling = ens.at(-1)!;
  ok(cooling.usedJ === 0 && (cooling.storedJ ?? 0) < 0 && cooling.lostJ === -(cooling.storedJ ?? 0), 'A2: the wood gone, the pot cools: stored goes down, the same heat is lost',
    `stored ${cooling.storedJ} J, lost ${cooling.lostJ} J`);
  const whole = boil(4 * H, [[0, 'fire_level', 1], [195 * 60_000, 'take_off']], {}, M10);
  const sums = whole.all.flatMap((r) => r.energy).reduce((a, x) => ({ u: a.u + x.usedJ, s: a.s + (x.storedJ ?? 0), l: a.l + x.lostJ }), { u: 0, s: 0, l: 0 });
  ok(sums.s === 0 && sums.u === sums.l, 'A2: over the whole run, stored comes back to zero: everything the wood gave ends in the air', `used ${sums.u} J`);
  // B1: lifted off before any oil separates, the milk comes back and goes on the fire again
  const early = boil(4 * H, [[0, 'fire_level', 1], [189 * 60_000, 'take_off']]);
  const back = early.out('coconut_milk');
  ok(back && !early.out('coconut_latik') && !early.out('coconut_oil'), 'B1: lifted off at 189 min (the water nearly gone, no oil yet): it comes back as milk, not as latik',
    early.obs.at(-1)?.text);
  const again = boil(2 * H, [[0, 'fire_level', 1], ...lookEvery(2 * H, 60_000)], { lots: [{ lotId: 'lot:back', materialId: 'coconut_milk', amount: back!.amount, location: 's', quality: back!.quality }, WOOD()] });
  const crack2 = again.obs.find((o) => /ぱちぱち|静か/.test(o.text ?? ''))?.at ?? 0;
  const fin = boil(crack2 + 40 * 60_000, [[0, 'fire_level', 1], [crack2, 'fire_level', 0], [crack2 + 30 * 60_000, 'take_off']], { lots: [{ lotId: 'lot:back', materialId: 'coconut_milk', amount: back!.amount, location: 's', quality: back!.quality }, WOOD()] });
  ok(oilOf(fin) > 0.6 * fat0(), 'B1: back on the fire, it goes on from where it was and gives its oil', `${oilOf(fin)} mg`);
  // B1: latik (pulled off half browned) gives up more oil on the fire
  const half = boil(crack + H, [[0, 'fire_level', 1], [crack, 'fire_level', 0], [crack + 4 * 60_000, 'take_off']]);
  const lat = half.out('coconut_latik');
  const more = lat && boil(H, [[0, 'fire_level', 0], [40 * 60_000, 'take_off']], { lots: [{ lotId: 'lot:lat', materialId: 'coconut_latik', amount: lat.amount, location: 's', quality: lat.quality }, WOOD()] });
  ok(lat && more && oilOf(more) > 0 && oilOf(half) + oilOf(more) <= fat0() * pv_oilMax + 1, 'B1: latik lifted off half-browned goes back on the fire and gives more oil (never more than the fat allows)',
    `${oilOf(half)} + ${more ? oilOf(more) : 0} mg`);
  const old = scienceStep(breq(H, 2 * H, { schema: 'civ-sci.coconut-boil/1', data: {} }, []));
  ok(old.status === 'failed' && /unsupported-state-schema/.test(String(old.evidence.notes)), 'a /1 run (from 0.1.0) is refused: the host cancels it and releases its lots');
}

console.log('4. requests that are refused');
{
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  refused('a coconut lot without a count', step(mreq(0, H, null, [{ ...NUTS(), quality: {} }])), /count/);
  refused('parts larger than the nut', step(mreq(0, H, null, [NUTS({ husk_ppm: 600_000, meat_ppm: 500_000 })])), /within the nut/);
  refused('no tools', step(mreq(0, H, null, [NUTS()], { equipment: [] })), /no fixture_coconut_tools/);
  refused('boiling without a pot', step(breq(0, H, null, [], { equipment: [PIT] })), /needs a fixture_cook_pot/);
  refused('more milk than the pot holds', step(breq(0, H, null, [], { equipment: [POT({ capacityMl: 1000 }), PIT] })), /does not fit/);
  refused('a heat offer as well as the wood', step(breq(0, H, null, [], { energy: [{ sourceId: 'src:x', kind: 'heat', maxJ: 1 }] })), /never count the same fire twice/);
  refused('an unknown fire level', step(breq(0, H, null, [[0, 'fire_level', 5]])), /fire_level needs/);
  refused('an unknown species in the milk', step(breq(0, H, null, [], { lots: [{ ...MILKLOT, quality: { x_gold_ppm: 10 } }, WOOD()] })), /food-unknown-species/);
  refused('lighting a fire in unknown weather', step(breq(0, H, null, [], {}, 'unknown')), /known weather/);
  const s0 = step(breq(0, H, null, []));
  refused('the milk changed under the run', step(breq(H, 2 * H, s0.state, [], { lots: [{ ...MILKLOT, amount: { value: 1000, unit: 'mg' } }, WOOD()] })), /changed-input/);
  refused('a missing interval', step(breq(2 * H, 3 * H, s0.state, [])), /noncontiguous/);
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation', violations.slice(0, 3).join(' / '));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
