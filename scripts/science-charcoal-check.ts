// Checks for charcoal and wood tar in a double-pot retort (p14x_charcoal_tar_retort, island clock, wood fire).
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-charcoal-check.ts
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { CHARCOAL_PROCESS } from '../src/science/step/charcoal';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const H = 3600_000, M = 60_000, M10 = 600_000, W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const violations: string[] = [];
const step = (q: ScienceStepRequest) => { const r = scienceStep(q); violations.push(...validateResult(q, r).map((v) => `${q.interval.from}: ${v}`)); return r; };
const sum = (xs: { amount: { value: number } }[]) => xs.reduce((s, x) => s + x.amount.value, 0);
type Drawn = { drawn?: { amount: { value: number } }[] };

const CHARGE = (o: Partial<LotView> = {}): LotView => ({ lotId: 'lot:charge', materialId: 'firewood', amount: { value: 2_000_000, unit: 'mg' }, location: 'eq:retort', quality: { water_ppm: 150_000 }, ...o });
const FUEL = (mg = 12_000_000): LotView => ({ lotId: 'lot:fuel', materialId: 'firewood', amount: { value: mg, unit: 'mg' }, location: 'site:woodpile', quality: { water_ppm: 150_000 } });
const RETORT = (p: Record<string, number> = {}) => ({ equipmentId: 'eq:retort', kind: 'fixture_tar_retort', catalogEntry: 'fixture_tar_retort', catalogVersion: 'civ-sci-test-2', condition: 1,
  params: { heatCapJPerK: 4000, uaWPerK: 2.5, heatShare: 0.35, capacityMl: 8000, collectShare: 0.6, ...p } });
const PIT = { equipmentId: 'eq:pit', kind: 'open_fire_pit', catalogEntry: 'open_fire_pit', catalogVersion: 'civ-sci-test-2', condition: 1, params: { maxBurnKgPerH: 3 } };
type Act = [number, string, number?];
const req = (from: number, to: number, state: ScienceStepRequest['state'], acts: Act[], o: Partial<ScienceStepRequest> = {}, source = 'record'): ScienceStepRequest => ({
  contract: '0.2.0', requestId: `c@${from}`, world: W, runId: 'run:char', ...CHARCOAL_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
  environment: { sampleId: `env:${from}`, source: source as 'simulation', effectiveAt: from, airTempC: 28, humidity: 0.75, windMs: 2 },
  lots: [CHARGE(), FUEL()], equipment: [RETORT(), PIT], energy: [], seed: 1,
  actions: acts.map(([at, action, level]) => ({ at, residentId: 'res:lantern', action, ...(level === undefined ? {} : { params: { level } }) })), ...o });
function burn(until: number, acts: Act[], o: Partial<ScienceStepRequest> = {}, chunk = M10, src: (t: number) => string = () => 'record') {
  let st: ScienceStepRequest['state'] = null; const all: ScienceStepResult[] = [];
  for (let t = 0; t < until; t += chunk) {
    const end = Math.min(until, t + chunk);
    const r = step(req(t, end, st, acts.filter(([at]) => at >= t && at < end), o, src(t))); all.push(r); st = r.state;
    if (r.status !== 'running') break;
  }
  const last = all[all.length - 1];
  return { all, last, obs: all.flatMap((r) => r.observations), out: (m: string) => last.produced.find((p) => p.materialId === m) };
}
const mg = (r: ReturnType<typeof burn>, m: string) => r.out(m)?.amount.value ?? 0;
const looks = (until: number, every = 5 * M) => Array.from({ length: Math.floor(until / every) }, (_, i) => [i * every + 1000, 'look'] as Act);
const STD: Act[] = [[0, 'fire_level', 1], [200 * M, 'put_out'], [360 * M, 'open']];

console.log('1. a medium fire, put out, left to cool, then opened');
const good = burn(7 * H, STD);
{
  const r = good.last, dry = 2_000_000 * 0.85 * 0.99;
  ok(r.status === 'completed' && mg(good, 'charcoal') > 0.25 * dry && mg(good, 'charcoal') < 0.45 * dry && good.out('charcoal')!.quality!.x_wood_dry_ppm === undefined,
    'charcoal: a quarter to under half of the dry wood, nothing left as wood', `${(mg(good, 'charcoal') / 1000).toFixed(0)} g from ${(dry / 1000).toFixed(0)} g of dry wood, made at up to ${good.out('charcoal')!.quality!.charred_c} °C`);
  ok(mg(good, 'wood_tar') > 0 && mg(good, 'wood_vinegar') > 0 && /黒くねばる液/.test(good.obs.at(-1)?.text ?? ''), 'the lower pot holds tar and wood vinegar',
    `${(mg(good, 'wood_tar') / 1000).toFixed(0)} g tar, ${(mg(good, 'wood_vinegar') / 1000).toFixed(0)} g vinegar`);
  ok(sum(r.consumed) + sum((r as Drawn).drawn ?? []) === sum(r.produced) + sum(r.released), 'charge + fuel + the O2 drawn = charcoal + tar + vinegar + wood left + ash + smoke, vapour, gas, CO2');
  ok(r.released.some((x) => x.materialId === 'wood_tar') && r.released.some((x) => x.materialId === 'pyrolysis_gas'), 'what the lower pot does not catch leaves as smoke (tar) and gas');
  const e = good.all.flatMap((x) => x.energy).reduce((a, x) => ({ u: a.u + x.usedJ, s: a.s + (x.storedJ ?? 0), l: a.l + x.lostJ }), { u: 0, s: 0, l: 0 });
  ok(e.s === 0 && e.u === e.l && e.u > 0, 'heat: what the retort held while hot comes back to zero by the end', `used ${e.u} J`);
}

console.log('2. what the resident can learn');
{
  const watch = burn(4 * H, [[0, 'fire_level', 1], ...looks(4 * H)]);
  const said = watch.obs.map((o) => o.text ?? '');
  const iSteam = said.findIndex((t) => /湯気/.test(t)), iYellow = said.findIndex((t) => /黄色っぽい/.test(t)), iBlue = said.findIndex((t) => /青っぽく/.test(t));
  ok(iSteam >= 0 && iYellow > iSteam && iBlue > iYellow, 'the smoke tells the stages: steam, thick yellow smoke, then thin and bluish (done)');
  const low = burn(7 * H, [[0, 'fire_level', 0], [250 * M, 'put_out'], [360 * M, 'open']]);
  ok(low.out('charcoal')!.quality!.x_wood_dry_ppm! > 500_000 && low.obs.some((o) => /木のかけら|芯が茶色/.test(o.text ?? '')),
    'a low fire: the retort never gets hot enough, the pieces stay brown wood', low.obs.map((o) => o.text).join(' / '));
  const hot = burn(7 * H, [[0, 'fire_level', 1], [200 * M, 'put_out'], [210 * M, 'open']]);
  ok(mg(hot, 'charcoal') < 0.8 * mg(good, 'charcoal') && hot.obs.some((o) => /燃え出した/.test(o.text ?? '')),
    'opened ten minutes after the fire is out: the charcoal catches fire in the air and much of it is lost', `${(mg(hot, 'charcoal') / 1000).toFixed(0)} g vs ${(mg(good, 'charcoal') / 1000).toFixed(0)} g`);
  const strong = burn(7 * H, [[0, 'fire_level', 2], [150 * M, 'put_out'], [360 * M, 'open']]);
  ok(mg(strong, 'charcoal') < mg(good, 'charcoal') && strong.out('charcoal')!.quality!.charred_c! > good.out('charcoal')!.quality!.charred_c!,
    'a strong fire: hotter, and a little less charcoal', `${(mg(strong, 'charcoal') / 1000).toFixed(0)} g at up to ${strong.out('charcoal')!.quality!.charred_c} °C`);
  const shells = burn(7 * H, STD, { lots: [CHARGE({ lotId: 'lot:shells', materialId: 'coconut_shell', amount: { value: 676_000, unit: 'mg' }, quality: { water_ppm: 100_000, ash_dry_ppm: 10_000, count: 8 } }), FUEL()] });
  ok(mg(shells, 'charcoal') > 0.25 * 676_000 * 0.9 && /黒く軽い炭/.test(shells.obs.map((o) => o.text).join()), 'the eight half shells from the coconut oil make charcoal too',
    `${(mg(shells, 'charcoal') / 1000).toFixed(0)} g`);
  const short = burn(H, [[0, 'fire_level', 1], [20 * M, 'put_out'], [50 * M, 'open']]);
  ok(short.out('firewood') && !short.out('charcoal') && short.last.produced.filter((p) => p.materialId === 'firewood').length === 2 && /木のまま/.test(short.obs.at(-1)?.text ?? ''),
    'put out before anything broke down: the charge comes back as it was (drier)');
  const back = short.last.produced.find((p) => p.materialId === 'firewood' && p.into === 'eq:retort')!;
  const again = burn(7 * H, STD, { lots: [CHARGE({ lotId: 'lot:again', amount: back.amount, quality: back.quality }), FUEL()] });
  ok(again.last.status === 'completed' && mg(again, 'charcoal') > 0, 'the charge handed back goes into the next run and becomes charcoal', `${(mg(again, 'charcoal') / 1000).toFixed(0)} g`);
  const scant = burn(7 * H, STD, { lots: [CHARGE(), FUEL(1_000_000)] });
  ok(scant.obs.some((o) => /薪が尽きて/.test(o.text ?? '')), 'too little firewood: the fire dies down');
}

console.log('3. looking, pieces, outages, ends');
{
  const key = (r: ReturnType<typeof burn>) => JSON.stringify([r.last.produced, r.last.released, r.last.state]);
  const seen = burn(7 * H, [...STD, ...looks(6 * H, M + 17_000)]);
  ok(key(seen) === key(good), 'looking every 77 s changes nothing in the retort');
  const plan: Act[] = [[0, 'fire_level', 1], [97 * M + 13_000, 'fire_level', 2], [150 * M + 7_000, 'put_out'], [330 * M + 3_000, 'open']];
  const a = burn(6 * H, plan, {}, M10), b = burn(6 * H, plan, {}, H), c = burn(6 * H, plan, {}, 30_000), dd = burn(6 * H, plan, {}, 37_001);
  ok(key(a) === key(b) && key(a) === key(c), '10 min = 1 h = 30 s pieces (actions between the grid points): the same lots and state');
  ok(Math.abs(mg(dd, 'charcoal') - mg(a, 'charcoal')) <= 2, '37.001 s pieces: the same charcoal within 2 mg', `${mg(dd, 'charcoal')} vs ${mg(a, 'charcoal')}`);
  const untended = burn(3 * H, [[0, 'fire_level', 1]], {}, H, (t) => (t === 2 * H ? 'unknown' : 'record'));
  ok(untended.last.status === 'stopped' && untended.obs.some((o) => /火が落ちて/.test(o.text ?? '')), 'an hour nobody can see: the fire is not left burning on its own, the run stops');
  const s1 = step(req(0, H, null, [[0, 'fire_level', 1]]));
  const lost = step(req(H, 2 * H, s1.state, [], { stop: 'equipment-lost', equipment: [PIT] }));
  const kept = step(req(H, 2 * H, s1.state, [], { stop: 'operator' }));
  ok(lost.status === 'stopped' && JSON.stringify(lost.produced) === JSON.stringify(kept.produced), 'the retort lost at the end of an interval: that hour counts, as at a stop');
  ok(scienceStep({ ...req(0, H, null, []), contract: '0.1.0' }).status === 'failed', 'contract 0.1.x is refused (the fire draws O2)');
}

console.log('5. Codex review of 5555989 (A1, B1, C1, C2)');
{
  // A1: two hours on a medium fire, then an hour of unknown weather with no action and no stop
  const s2 = burn(2 * H, [[0, 'fire_level', 1]], {}, H);
  const st2 = s2.last.state, char2 = (st2.data as { charF: number }).charF;
  const gap = step(req(2 * H, 3 * H, st2, [], {}, 'unknown'));
  const coal = gap.produced.find((p) => p.materialId === 'charcoal')!;
  const coalChar = coal.amount.value * coal.quality!.x_char_ppm! / 1e6;
  const fuelO2 = (gap as Drawn).drawn?.[0]?.amount.value ?? 0;
  const ref = step(req(2 * H, 2 * H + 1, st2, [], { stop: 'operator' }));  // the same moment, opened by hand (burns)
  ok(gap.status === 'stopped' && Math.abs(coalChar - Math.floor(char2)) < 2 && gap.observations.length === 1 && /閉じたまま/.test(gap.observations[0].text ?? ''),
    'A1: an hour nobody can see: the run stops with the pot closed, the charcoal as it was; only the fire is said to have gone out (nobody saw inside)', `${(coalChar / 1000).toFixed(0)} g of char kept`);
  ok(fuelO2 < ((ref as Drawn).drawn?.[0]?.amount.value ?? 0) && gap.produced.every((p) => p.quality?.history_complete !== 1 || p.materialId === 'firewood' || p.materialId === 'wood_ash'),
    'A1: no extra O2 is drawn for charcoal that never met the air; the products are marked incomplete', `O2 ${fuelO2} mg vs ${(ref as Drawn).drawn?.[0]?.amount.value} mg when opened hot`);
  // B1: the low fire's brown pieces and the wood that run handed back go into the next run
  const low = burn(7 * H, [[0, 'fire_level', 0], [250 * M, 'put_out'], [360 * M, 'open']]);
  const brown = low.out('charcoal')!, wood = low.last.produced.find((p) => p.materialId === 'firewood' && p.into !== 'eq:retort')!;
  const again = burn(7 * H, STD, { lots: [
    { lotId: 'lot:brown', materialId: 'charcoal', amount: brown.amount, location: 'eq:retort', quality: brown.quality },
    { lotId: 'lot:wood2', materialId: 'firewood', amount: wood.amount, location: 'site:woodpile', quality: wood.quality }] });
  const done = again.out('charcoal');
  ok(again.last.status === 'completed' && done && (done.quality!.x_wood_dry_ppm ?? 0) < 20_000 && done.quality!.x_char_ppm! > brown.quality!.x_char_ppm!,
    'B1: the brown pieces of a low fire go back in with the wood that run returned, and come out as charcoal', `wood ${brown.quality!.x_wood_dry_ppm} → ${done?.quality!.x_wood_dry_ppm ?? 0} ppm`);
  ok(sum(again.last.consumed) + sum((again.last as Drawn).drawn ?? []) === sum(again.last.produced) + sum(again.last.released), 'B1: the mass still closes with charcoal already in the charge');
  const twice = burn(7 * H, STD, { lots: [{ lotId: 'lot:done', materialId: 'charcoal', amount: done!.amount, location: 'eq:retort', quality: done!.quality }, FUEL()] });
  ok(twice.last.status === 'completed' && Math.abs(mg(twice, 'charcoal') - done!.amount.value) <= done!.amount.value * 0.03, 'finished charcoal heated again comes back as charcoal (no more breaks down)');
  // C2: both lots in the retort is refused; a valid pair in either order gives the same
  const both = step(req(0, H, null, [], { lots: [CHARGE(), { ...FUEL(), location: 'eq:retort' }] }));
  ok(both.status === 'failed' && /outside it/.test(String(both.evidence.notes)), 'C2: both lots in the retort: refused (which is the fuel is not known)');
  const swapped = burn(7 * H, STD, { lots: [FUEL(), CHARGE()] });
  ok(JSON.stringify(swapped.last.produced) === JSON.stringify(good.last.produced), 'C2: a valid pair listed in the other order gives the same');
  // C1: the retort swapped or gone without a stop that says so
  const s1 = step(req(0, H, null, [[0, 'fire_level', 1]]));
  ok(step(req(H, 2 * H, s1.state, [], { equipment: [RETORT({ heatShare: 0 }), PIT] })).status === 'failed' && step(req(H, 2 * H, s1.state, [], { equipment: [PIT] })).status === 'failed',
    'C1: the retort changed or missing under a running run, with no stop: refused');
  // C3: the same retort with its params in another key order is the same retort; a run saved by 0.1.1 goes on
  const reordered = { ...RETORT(), params: Object.fromEntries(Object.entries(RETORT().params).reverse()) };
  ok(step(req(H, 2 * H, s1.state, [], { equipment: [reordered, PIT] })).status === 'running', 'C3: the same params in another key order: the run goes on');
  const old = scienceStep(req(H, 2 * H, { schema: 'civ-sci.charcoal-retort/1', data: {} }, []));
  ok(old.status === 'failed' && /unsupported-state-schema/.test(String(old.evidence.notes)), 'a /1 run (from 0.1.0) is refused: the host cancels it and releases its lots');
}

console.log('4. requests that are refused');
{
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  refused('no charge in the retort', step(req(0, H, null, [], { lots: [CHARGE({ location: 'site:shelf' }), FUEL()] })), /charge in the retort/);
  refused('no retort', step(req(0, H, null, [], { equipment: [PIT] })), /needs a fixture_tar_retort/);
  refused('too much to fit', step(req(0, H, null, [], { equipment: [RETORT({ capacityMl: 1000 }), PIT] })), /does not fit/);
  refused('a heat offer as well', step(req(0, H, null, [], { energy: [{ sourceId: 'src:x', kind: 'heat', maxJ: 1 }] })), /never count the same fire twice/);
  refused('an unknown action', step(req(0, H, null, [[0, 'stir']])), /unknown action/);
  refused('lighting it in unknown weather', step(req(0, H, null, [], {}, 'unknown')), /known weather/);
  const s0 = step(req(0, H, null, []));
  refused('the charge changed under the run', step(req(H, 2 * H, s0.state, [], { lots: [CHARGE({ amount: { value: 1_000_000, unit: 'mg' } }), FUEL()] })), /changed-input/);
  refused('a missing interval', step(req(2 * H, 3 * H, s0.state, [])), /noncontiguous/);
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation', violations.slice(0, 3).join(' / '));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
