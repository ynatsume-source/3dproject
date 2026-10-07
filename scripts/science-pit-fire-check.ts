// Checks for firing the residents' pots in an open fire (p13y_pot_pit_fire, island clock, contract 0.2.x).
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-pit-fire-check.ts
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { POT_DRY_PROCESS, POT_SHAPE_PROCESS } from '../src/science/step/pottery';
import { PIT_FIRE_PROCESS } from '../src/science/step/pit-fire';
import { fuelComp } from '../src/science/step/wood-fire';
import { totalMg } from '../src/science/chem';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const H = 3600_000, D = 24 * H, M = 60_000, W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const violations: string[] = [];
const step = (q: ScienceStepRequest) => { const r = scienceStep(q); violations.push(...validateResult(q, r).map((v) => `${q.processId}@${q.interval.from}: ${v}`)); return r; };
type Drawn = { drawn: { materialId: string; amount: { value: number } }[] };
const sum = (xs: { amount: { value: number } }[] = []) => xs.reduce((s, x) => s + x.amount.value, 0);
const balanced = (r: ScienceStepResult) => sum(r.consumed) + sum((r as unknown as Drawn).drawn) === sum(r.produced) + sum(r.released);
const asLot = (p: ScienceStepResult['produced'][number], id: string): LotView => ({ lotId: id, materialId: p.materialId, amount: p.amount, location: 'site:fire', quality: p.quality });

// a real 4 L cook pot: shaped from kneaded clay, dried in the shade (8 days) or only one day (leather hard, damp)
const shaped = step({ contract: '0.2.0', requestId: 's', world: W, runId: 'run:shape', ...POT_SHAPE_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: 0, to: 4 * H }, state: null,
  environment: { sampleId: 'env:0', source: 'record', effectiveAt: 0 }, lots: [{ lotId: 'lot:clay', materialId: 'prepared_clay', amount: { value: 5_000_000, unit: 'mg' }, location: 's', quality: { water_ppm: 200_000, xd_kaolinite_ppm: 600_000, xd_quartz_ppm: 380_000 } }],
  equipment: [], energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: 4 * 3600 * 20 }], seed: 1, actions: [{ at: 0, residentId: 'res:lantern', action: 'plan', params: { form: 1, capacityMl: 4000 } }] });
function dried(days: number): LotView {
  let st: ScienceStepRequest['state'] = null, last!: ScienceStepResult;
  const green = asLot(shaped.produced[0], 'lot:green');
  for (let t = 0; t < days * D; t += 6 * H) {
    last = step({ contract: '0.2.0', requestId: `d${t}`, world: W, runId: 'run:dry', ...POT_DRY_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: t, to: t + 6 * H }, state: st,
      environment: { sampleId: `e${t}`, source: 'record', effectiveAt: t, airTempC: 28, humidity: 0.75, windMs: 2 }, lots: [green],
      equipment: [{ equipmentId: 'eq:rack', kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: 'civ-sci-test-2', condition: 1, params: { sunExposure: 0 } }], energy: [], seed: 1,
      actions: t + 6 * H >= days * D ? [{ at: t + 6 * H - 30_000, residentId: 'res:lantern', action: 'take_off' }] : [] });
    st = last.state; if (last.status !== 'running') break;
  }
  return asLot(last.produced[0], 'lot:pot');
}
const dryPot = dried(8), dampPot = dried(1);
const WOOD = (water = 150_000, mg = 40_000_000): LotView => ({ lotId: 'lot:wood', materialId: 'firewood', amount: { value: mg, unit: 'mg' }, location: 'site:woodpile', quality: { water_ppm: water } });
const PIT = { equipmentId: 'eq:pit', kind: 'open_fire_pit', catalogEntry: 'open_fire_pit', catalogVersion: 'civ-sci-test-2', condition: 1, params: { heatCapJPerK: 20_000, uaWPerK: 30, chamberFraction: 0.2, maxBurnKgPerH: 25, forcedCoolingUaFactor: 2 } };
type Env = { t: number; rh: number; wind?: number; rain?: number; source?: string };
const CALM: Env = { t: 28, rh: 0.75, wind: 1, rain: 0 };
const CAREFUL = { preheatMin: 60, pace: 0, targetGlow: 1, holdMin: 30, forcedCooling: 0 }, CARELESS = { preheatMin: 0, pace: 2, targetGlow: 1, holdMin: 30, forcedCooling: 1 };
const req = (from: number, to: number, state: ScienceStepRequest['state'], lots: LotView[], acts: ScienceStepRequest['actions'], env: Env, o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.2.0', requestId: `f@${from}`, world: W, runId: 'run:fire', ...PIT_FIRE_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
  environment: { sampleId: `env:${from}`, source: (env.source ?? 'record') as 'record', effectiveAt: from, airTempC: env.t, humidity: env.rh, ...(env.wind !== undefined ? { windMs: env.wind } : {}), ...(env.rain !== undefined ? { rainMmH: env.rain } : {}) },
  lots, equipment: [PIT], energy: [], seed: 1, actions: acts, ...o });
const planAct = (plan: Record<string, number>) => [{ at: 0, residentId: 'res:lantern', action: 'fire_plan', params: plan }];
function fire(plan: Record<string, number>, o: Partial<ScienceStepRequest> = {}, env: (t: number) => Env = () => CALM, chunk = H, lots: LotView[] = [dryPot, WOOD()], looks: number[] = []) {
  let st: ScienceStepRequest['state'] = null; const all: ScienceStepResult[] = [];
  for (let t = 0; t < 2 * D; t += chunk) {
    const acts = [...(t === 0 ? planAct(plan) : []), ...looks.filter((at) => at >= t && at < t + chunk).map((at) => ({ at, residentId: 'res:lantern', action: 'look' }))];
    const r = step(req(t, t + chunk, st, lots, acts, env(t), o)); all.push(r); st = JSON.parse(JSON.stringify(r.state));
    if (r.status !== 'running') break;
  }
  const last = all[all.length - 1];
  return { all, last, obs: all.flatMap((r) => r.observations), pot: last.produced[0], diag: last.diagnostics as Record<string, number> };
}
const cracked = (plan: Record<string, number>, env: (t: number) => Env, lots?: LotView[]) => {
  let any = 0, broke = 0;
  for (let s = 1; s <= 20; s++) { const r = fire(plan, { seed: s }, env, H, lots); if (r.pot.materialId === 'pot_sherds') broke++; if (r.pot.materialId === 'pot_sherds' || (r.pot.quality?.crack ?? 0) >= 1) any++; }
  return { any, broke };
};

console.log('1. a careful firing');
const good = fire(CAREFUL);
{
  const q = good.pot.quality!;
  ok(good.last.status === 'completed' && good.pot.materialId === 'fired_pot' && good.diag.peakKilnC > 800 && q.form === 1 && q.capacity_ml === 4000 && q.wall_mm === 8,
    'warmed an hour, built up slowly to a cherry glow, held, left to cool in the ashes: a fired cook pot', `peak ${good.diag.peakKilnC.toFixed(0)} °C, ${(good.last.simulated.to / H).toFixed(1)} h (island clock)`);
  ok(q.absorption_ppm > 120_000 && q.absorption_ppm < 160_000 && q.crack === 0, 'low-fired earthenware: it takes up about 14 % water', `${q.absorption_ppm} ppm`);
  ok(balanced(good.last) && sum((good.last as unknown as Drawn).drawn) > 0 && good.last.produced.some((p) => p.materialId === 'wood_ash'),
    'pot + wood (+ O2) = fired pot + wood left + ash + vapour + CO2', `${(good.diag.burnedMg / 1e6).toFixed(1)} kg of wood burned`);
  ok(good.pot.amount.value < dryPot.amount.value && good.last.released.some((x) => x.materialId === 'water_vapour'), 'the pot is lighter: its last water and the clay\'s bound water have gone');
  const words = good.obs.map((o) => o.text).join(' / ');
  ok(/火の色：/.test(words) && /ひびは見当たらない/.test(words) && /焼けた音|澄んだ音/.test(words), 'the resident sees the glow and the pot whole, and hears it ring', words);
  const rest = good.last.produced.find((p) => p.materialId === 'firewood');
  ok(!rest || totalMg(fuelComp(asLot(rest, 'lot:rest')) as never) === rest.amount.value, 'the wood left over reads back');
}

console.log('2. carelessness, wind and haste crack pots');
{
  const careless = cracked(CARELESS, () => CALM), careful = cracked(CAREFUL, () => CALM), windy = cracked(CAREFUL, () => ({ ...CALM, wind: 6 }));
  ok(careless.any >= 8 && careless.any <= 16, 'no warming, a fast fire, pulled out of the embers: half to two-thirds crack', `${careless.any}/20 (${careless.broke} in pieces)`);
  ok(careful.any <= 4, 'with care, about one in ten (flaws of hand-built ware remain)', `${careful.any}/20`);
  ok(windy.any > careful.any, 'on a windy day the fire burns one side: more cracks', `${windy.any}/20 vs ${careful.any}/20`);
  let sherds: ScienceStepResult | null = null;
  for (let s = 1; s <= 20 && !sherds; s++) { const r = fire(CARELESS, { seed: s }); if (r.pot.materialId === 'pot_sherds') sherds = r.last; }
  const sh = sherds!.produced[0];
  ok(sh && sh.quality!.absorption_ppm > 0 && sh.quality!.capacity_ml === undefined && balanced(sherds!) && /かけら/.test(sherds!.observations.map((o) => o.text).join()),
    'a pot broken apart comes back as pot_sherds (its fired mass, no pot left)', JSON.stringify(sh.quality));
  const damp = cracked({ ...CARELESS, forcedCooling: 0 }, () => CALM, [dampPot, WOOD()]), dampWarmed = cracked({ ...CAREFUL, preheatMin: 180 }, () => CALM, [dampPot, WOOD()]);
  ok(dampPot.materialId === 'green_pot' && damp.any > dampWarmed.any, 'a pot not yet dry, thrown into a fast fire, bursts with steam; warmed beside the fire first, it does not', `${damp.any}/20 vs ${dampWarmed.any}/20`);
}

console.log('3. wood and weather');
{
  const green = fire(CAREFUL, {}, () => CALM, H, [dryPot, WOOD(450_000)]);
  ok(green.diag.peakKilnC < 550 && green.pot.materialId === 'dry_pot' && /煙ばかり|焼きが足りず|火が育たなかった/.test(green.obs.map((o) => o.text).join()),
    'fresh-cut wood (45 % water): smoke and a weak flame, the pot never turns to ceramic', `peak ${green.diag.peakKilnC.toFixed(0)} °C; ${green.obs.map((o) => o.text).join(' / ')}`);
  const rain = fire(CAREFUL, {}, () => ({ ...CALM, rain: 8 }));
  ok(rain.diag.peakKilnC < good.diag.peakKilnC - 100, 'in heavy rain the fire cannot get hot', `peak ${rain.diag.peakKilnC.toFixed(0)} °C`);
  const noRain = step(req(0, H, null, [dryPot, WOOD()], planAct(CAREFUL), { t: 28, rh: 0.75, wind: 1 }));
  const noWind = step(req(0, H, null, [dryPot, WOOD()], planAct(CAREFUL), { t: 28, rh: 0.75, rain: 0 }));
  ok(noRain.status === 'failed' && noWind.status === 'failed', 'a fire is lit only with the rain and the wind known (an explicit 0 is fine)');
}

console.log('4. pieces, looks, unknown weather');
{
  const key = (r: ReturnType<typeof fire>) => JSON.stringify([r.last.produced, r.last.released, (r.last as unknown as Drawn).drawn, r.last.simulated.to, r.obs]);
  const looks = [37 * M + 13_000, 2 * H + 7_000];
  const a = fire(CAREFUL, {}, () => CALM, H, undefined, looks), b = fire(CAREFUL, {}, () => CALM, 30_000, undefined, looks), c = fire(CAREFUL, {}, () => CALM, 3 * H, undefined, looks);
  ok(key(a) === key(b) && key(a) === key(c), '1 h = 30 s = 3 h pieces (looks between the grid points): the same pot, gases and words');
  const settle = (r: ReturnType<typeof fire>) => JSON.stringify([r.last.produced, r.last.released, r.all.map((x) => x.energy)]);
  ok(settle(fire(CAREFUL, {}, () => CALM, H, undefined, Array.from({ length: 20 }, (_, i) => i * 20 * M + 17_000))) === settle(good), 'looking changes nothing');
  ok(a.obs.some((o) => /湯気|あたたまって|火の色/.test(o.text ?? '')), 'a look sees the fire and the pot', a.obs.slice(0, 2).map((o) => o.text).join(' / '));
  const out = fire(CAREFUL, {}, (t) => (t >= 2 * H ? { ...CALM, source: 'unknown' } : CALM));
  ok(out.last.status === 'stopped' && out.obs.filter((o) => o.at >= 2 * H).every((o) => /見ていない間に火が落ちていた/.test(o.text ?? '')) && out.pot.quality!.history_complete === 0 && balanced(out.last),
    'weather unknown mid-fire: the run stops (a fire never burns on by itself); only "the fire fell while nobody watched"');
}

console.log('6. clay with organic matter (the island\'s clay, 0.1.1)');
{
  const organicPot: LotView = { ...dryPot, lotId: 'lot:organic', quality: { ...dryPot.quality, xd_organic_c_ppm: 10_000 } };
  let r = fire(CAREFUL, {}, () => CALM, H, [organicPot, WOOD()]);
  for (let seed = 2; seed < 30 && r.pot.materialId !== 'fired_pot'; seed++) r = fire(CAREFUL, { seed }, () => CALM, H, [organicPot, WOOD()]);
  const o2 = sum((r.last as unknown as Drawn).drawn), o2Plain = sum((good.last as unknown as Drawn).drawn);
  ok(r.pot.materialId === 'fired_pot' && (r.pot.quality!.xd_organic_c_ppm ?? 0) < 1000 && o2 > o2Plain && balanced(r.last),
    'roots and leaf bits in the clay burn out in the open fire: more O2 drawn, the mass still closes', `organic left ${r.pot.quality!.xd_organic_c_ppm ?? 0} ppm, O2 +${((o2 - o2Plain) / 1000).toFixed(1)} g`);
  const cool = fire(CAREFUL, {}, () => CALM, H, [organicPot, WOOD(450_000)]);
  // Organic matter burns out from about 400 °C, below the clay's turn to ceramic: a fire on fresh-cut wood may clear it
  // and still leave the pot unfired (dry_pot, or sherds if it cracked). The mass closes either way.
  ok(cool.pot.materialId !== 'fired_pot' && cool.diag.peakKilnC < 550 && balanced(cool.last), 'a fire that never gets hot (fresh-cut wood) does not make ceramic, organic matter or not',
    `peak ${cool.diag.peakKilnC.toFixed(0)} °C, ${cool.pot.materialId}, organic left ${cool.pot.quality!.xd_organic_c_ppm ?? 0} ppm`);
}

console.log('5. requests that are refused');
{
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  refused('no fire_plan', step(req(0, H, null, [dryPot, WOOD()], [], CALM)), /fire_plan/);
  refused('a plan after the start', step(req(0, H, null, [dryPot, WOOD()], [{ at: M, residentId: 'r', action: 'fire_plan', params: CAREFUL }], CALM)), /fire_plan/);
  refused('contract 0.1.x', step({ ...req(0, H, null, [dryPot, WOOD()], planAct(CAREFUL), CALM), contract: '0.1.0' }), /unknown contract/);
  refused('no fire pit', step(req(0, H, null, [dryPot, WOOD()], planAct(CAREFUL), CALM, { equipment: [] })), /open_fire_pit/);
  refused('a broken pot', step(req(0, H, null, [{ ...dryPot, quality: { ...dryPot.quality, crack: 2 } }, WOOD()], planAct(CAREFUL), CALM)), /broken/);
  refused('heat offered as well', step(req(0, H, null, [dryPot, WOOD()], planAct(CAREFUL), CALM, { energy: [{ sourceId: 'src:x', kind: 'heat', maxJ: 1 }] })), /offer no heat/);
  refused('an unknown action', step(req(0, H, null, [dryPot, WOOD()], [...planAct(CAREFUL), { at: 0, residentId: 'r', action: 'blow' }], CALM)), /unknown action/);
  const s0 = step(req(0, H, null, [dryPot, WOOD()], planAct(CAREFUL), CALM));
  refused('a second plan', step(req(H, 2 * H, s0.state, [dryPot, WOOD()], planAct(CAREFUL).map((a) => ({ ...a, at: H })), CALM)), /once/);
  refused('a missing interval', step(req(2 * H, 3 * H, s0.state, [dryPot, WOOD()], [], CALM)), /noncontiguous/);
  refused('the hearth changed', step(req(H, 2 * H, s0.state, [dryPot, WOOD()], [], CALM, { equipment: [{ ...PIT, equipmentId: 'eq:other' }] })), /changed-input/);
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation', violations.slice(0, 3).join(' / '));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
