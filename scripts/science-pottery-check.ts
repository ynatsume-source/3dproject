// Checks for the pots the residents make: p11y_pot_shape (world clock, hands) and p12y_pot_dry (island clock, waiting).
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-pottery-check.ts
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { tileComp } from '../src/science/step/common';
import { minWallMm, POT_DRY_PROCESS, POT_SHAPE_PROCESS } from '../src/science/step/pottery';
import { totalMg } from '../src/science/chem';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const H = 3600_000, D = 24 * H, M = 60_000, W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const violations: string[] = [];
const step = (q: ScienceStepRequest) => { const r = scienceStep(q); violations.push(...validateResult(q, r).map((v) => `${q.processId}@${q.interval.from}: ${v}`)); return r; };
const sum = (xs: { amount: { value: number } }[] = []) => xs.reduce((s, x) => s + x.amount.value, 0);
const balanced = (r: ScienceStepResult) => sum(r.consumed) === sum(r.produced) + sum(r.released);

// kneaded clay as p10y returns it: 5 kg, water 0.25 of the dry clay
const CLAY = (water = 200_000, mg = 5_000_000): LotView => ({ lotId: 'lot:clay', materialId: 'prepared_clay', amount: { value: mg, unit: 'mg' }, location: 'site:bench',
  quality: { water_ppm: water, xd_kaolinite_ppm: 600_000, xd_quartz_ppm: 380_000 } });
const plan = (form: number, capacityMl: number, wallMm?: number, at = 0) => ({ at, residentId: 'res:lantern', action: 'plan', params: { form, capacityMl, ...(wallMm ? { wallMm } : {}) } });
const shapeReq = (lots: LotView[], acts: ScienceStepRequest['actions'], o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.2.0', requestId: 's', world: W, runId: 'run:shape', ...POT_SHAPE_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: 0, to: 4 * H }, state: null,
  environment: { sampleId: 'env:0', source: 'record', effectiveAt: 0 }, lots, equipment: [], energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: 4 * 3600 * 20 }], seed: 1, actions: acts, ...o });
const potOf = (r: ScienceStepResult, id = 'lot:pot'): LotView => { const p = r.produced.find((x) => x.materialId === 'green_pot' || x.materialId === 'dry_pot')!; return { lotId: id, materialId: p.materialId, amount: p.amount, location: 'site:rack', quality: p.quality }; };

console.log('1. building pots by coiling');
const cook = step(shapeReq([CLAY()], [plan(1, 4000)]));
const jar = step(shapeReq([CLAY()], [plan(2, 500)]));
const lamp = step(shapeReq([CLAY()], [plan(3, 80)]));
{
  const g = (r: ScienceStepResult) => r.produced.find((p) => p.materialId === 'green_pot')!;
  ok(cook.status === 'completed' && g(cook).amount.value > 1_500_000 && g(cook).amount.value < 2_000_000 && balanced(cook) && cook.produced.some((p) => p.materialId === 'prepared_clay'),
    'a 4 L cook pot takes about 1.7 kg of the clay; the rest comes back as clay', `${(g(cook).amount.value / 1000).toFixed(0)} g, ${(cook.simulated.to / M).toFixed(0)} min of hand work`);
  ok(Math.abs(g(jar).amount.value - 625_000) < 30_000 && g(lamp).amount.value < 150_000, 'a 500 mL jar weighs about what the test pot does (600 g); a lamp dish about 100 g',
    `${(g(jar).amount.value / 1000).toFixed(0)} g / ${(g(lamp).amount.value / 1000).toFixed(0)} g`);
  ok(cook.simulated.to > lamp.simulated.to && cook.energy[0].usedJ === Math.floor(15 * cook.simulated.to / 1000) && Number.isInteger(cook.simulated.to), 'a bigger pot is more hand work (15 W of the hands)');
  const q = g(cook).quality!;
  ok(q.form === 1 && q.capacity_ml === 4000 && q.wall_mm === 8 && q.crack === 0 && q.xd_kaolinite_ppm > 0 && /鍋の形ができた/.test(cook.observations[0].text ?? ''), 'the pot carries its form, size and wall, and the clay\'s make-up', cook.observations[0].text);
  const back = tileComp(potOf(cook)), left = tileComp({ ...CLAY(), amount: cook.produced.find((p) => p.materialId === 'prepared_clay')!.amount, quality: cook.produced.find((p) => p.materialId === 'prepared_clay')!.quality });
  ok(totalMg(back) === g(cook).amount.value && Math.abs((back.water ?? 0) / (totalMg(back) - (back.water ?? 0)) - 0.25) < 0.001 && Math.abs((left.water ?? 0) / (totalMg(left) - (left.water ?? 0)) - 0.25) < 0.001,
    'the pot and the clay left over both read back, with the clay\'s own water');
}

console.log('2. clay that will not stand');
{
  const wet = step(shapeReq([CLAY(280_000)], [plan(1, 4000)]));
  const dry = step(shapeReq([CLAY(120_000)], [plan(1, 4000)]));
  const thin = step(shapeReq([CLAY()], [plan(1, 6000, 3)]));
  const whole = (r: ScienceStepResult) => r.status === 'completed' && r.produced.length === 1 && r.produced[0].materialId === 'prepared_clay' && r.produced[0].amount.value === 5_000_000;
  ok(whole(wet) && /つぶれた/.test(wet.observations[0].text ?? ''), 'too wet: the walls slump, the clay comes back', wet.observations[0].text);
  ok(whole(dry) && /ひび割れて/.test(dry.observations[0].text ?? ''), 'too dry: the coils crack and will not join', dry.observations[0].text);
  ok(whole(thin) && /たわんで/.test(thin.observations[0].text ?? '') && minWallMm(6000) > 3, 'too thin for its size: it sags', `needs ${minWallMm(6000).toFixed(1)} mm`);
}

console.log('3. the plan, the hands, the pieces');
{
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  refused('no plan', step(shapeReq([CLAY()], [])), /plan action/);
  refused('a plan after the start (a recipe, not a timed act)', step(shapeReq([CLAY()], [plan(1, 4000, undefined, M)])), /plan action/);
  refused('an unknown form', step(shapeReq([CLAY()], [plan(4, 4000)])), /form must be/);
  refused('a lamp dish of 2 L', step(shapeReq([CLAY()], [plan(3, 2000)])), /capacityMl/);
  refused('not enough clay', step(shapeReq([CLAY(200_000, 500_000)], [plan(1, 4000)])), /not enough clay/);
  refused('clay without its make-up', step(shapeReq([{ ...CLAY(), quality: { water_ppm: 200_000 } }], [plan(1, 4000)])), /make-up/);
  const s0 = step(shapeReq([CLAY()], [plan(1, 4000)], { interval: { from: 0, to: 10 * M } }));
  refused('a later action', step(shapeReq([CLAY()], [plan(1, 4000, undefined, 10 * M)], { interval: { from: 10 * M, to: 20 * M }, state: s0.state })), /no later actions/);
  // the same work in one-minute pieces as in one request
  let st: ScienceStepRequest['state'] = null, last!: ScienceStepResult, J = 0;
  for (let t = 0; t < 4 * H; t += M) {
    last = step(shapeReq([CLAY()], t === 0 ? [plan(1, 4000)] : [], { interval: { from: t, to: t + M }, state: st, energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: 60 * 20 }] }));
    J += last.energy.reduce((s, e) => s + e.usedJ, 0); st = JSON.parse(JSON.stringify(last.state));
    if (last.status === 'completed') break;
  }
  ok(JSON.stringify(last.produced) === JSON.stringify(cook.produced) && J === cook.energy[0].usedJ && last.simulated.to === cook.simulated.to, 'one-minute pieces = one request: the same pot, clay and hand work');
  const tired = step(shapeReq([CLAY()], [plan(1, 4000)], { energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: 0 }] }));
  ok(tired.status === 'needs-input' && tired.energy.length === 0, 'no hands offered: nothing happens (needs-input)');
}

// ---- drying ----
type Env = { t: number; rh: number; wind?: number; source?: string };
const SHADE: Env = { t: 28, rh: 0.75, wind: 2 };
const RACK = (p: Record<string, number> = {}) => ({ equipmentId: 'eq:rack', kind: 'drying_rack', catalogEntry: 'drying_rack', catalogVersion: 'civ-sci-test-2', condition: 1, params: { sunExposure: 0, ...p } });
const dryReq = (from: number, to: number, state: ScienceStepRequest['state'], lots: LotView[], acts: [number, string][], env: Env, o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.2.0', requestId: `d@${from}`, world: W, runId: 'run:dry', ...POT_DRY_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
  environment: { sampleId: `env:${from}`, source: (env.source ?? 'record') as 'record', effectiveAt: from, airTempC: env.t, humidity: env.rh, ...(env.wind !== undefined ? { windMs: env.wind } : {}) },
  lots, equipment: [RACK()], energy: [], seed: 1, actions: acts.map(([at, action]) => ({ at, residentId: 'res:lantern', action })), ...o });
function dryFor(until: number, lots: LotView[], acts: [number, string][], o: Partial<ScienceStepRequest> = {}, chunk = 6 * H, env: (t: number) => Env = () => SHADE) {
  let st: ScienceStepRequest['state'] = null; const all: ScienceStepResult[] = [];
  const end = acts.some(([, a]) => a === 'take_off') ? [] : [[until - 30_000, 'take_off'] as [number, string]];
  const A = [...acts, ...end];
  for (let t = 0; t < until; t += chunk) {
    const e = Math.min(until, t + chunk);
    const r = step(dryReq(t, e, st, lots, A.filter(([at]) => at >= t && at < e), env(t), o));
    all.push(r); st = JSON.parse(JSON.stringify(r.state));
    if (r.status !== 'running') break;
  }
  return { all, last: all[all.length - 1], obs: all.flatMap((r) => r.observations) };
}
const greenCook = potOf(cook), greenLamp = potOf(lamp);

console.log('4. drying the pot');
{
  const shade = dryFor(8 * D, [greenCook], [[12 * H, 'look'], [2 * D, 'look']]);
  const back = shade.last.produced[0];
  ok(back.materialId === 'dry_pot' && back.quality!.crack === 0 && balanced(shade.last) && sum(shade.last.released) > 250_000,
    'a 4 L pot in the shade is dry in about a week: dry_pot, no crack, its water gone to the air', `${(sum(shade.last.released) / 1000).toFixed(0)} g of water`);
  const words = shade.obs.map((o) => o.text);
  ok(/やわらかく|革のかたさ/.test(words[0] ?? '') && /革のかたさ|白っぽく/.test(words[1] ?? '') && /白っぽく乾いて/.test(words.at(-1) ?? ''), 'soft and dark, the rim lighter first (leather hard), then pale and light all over', words.join(' / '));
  const heat = shade.all.reduce((s, r) => s + r.energy.reduce((x, e) => x + e.usedJ, 0), 0);
  ok(Math.abs(heat - (sum(shade.last.released) / 1e6) * 2.442e6) < 1e4, 'the heat comes from the air (latent heat of the vapour)');
  const early = dryFor(2 * D, [greenCook], []);
  const covered = dryFor(8 * D, [greenCook], [], { equipment: [RACK({ covered: 1 })] });
  ok(covered.last.produced[0].materialId === 'green_pot' && sum(covered.last.released) < sum(shade.last.released), 'leaves over the pot slow the drying: after the same week it is still not dry',
    `${(sum(covered.last.released) / 1000).toFixed(0)} vs ${(sum(shade.last.released) / 1000).toFixed(0)} g in 8 days`);
  const lampDry = dryFor(4 * D, [greenLamp], []);
  ok(lampDry.last.produced[0].materialId === 'dry_pot' && early.last.produced[0].materialId === 'green_pot', 'a thin lamp dish is dry before the cook pot is');
  const back2 = potOf(early.last, 'lot:again');
  const again = dryFor(6 * D, [back2], []);
  ok(again.last.produced[0].materialId === 'dry_pot' && balanced(again.last), 'a pot taken off still damp dries on in the next run');
}

console.log('5. drying too fast cracks the pot');
{
  const harsh: Env = { t: 32, rh: 0.55, wind: 6 };
  let fast = 0, broke = 0, slow = 0;
  for (let s = 1; s <= 20; s++) {
    const f = dryFor(D, [greenCook], [], { seed: s, equipment: [RACK({ sunExposure: 1 })] }, 6 * H, () => harsh).last.produced[0].quality!.crack;
    if (f >= 1) fast++; if (f === 2) broke++;
    const c = dryFor(8 * D, [greenCook], [], { seed: s, equipment: [RACK({ covered: 1 })] }).last.produced[0].quality!.crack;
    if (c >= 1) slow++;
  }
  ok(fast >= 6 && fast <= 16 && slow === 0, 'in hot wind and sun about half the pots crack; covered in the shade none do', `${fast}/20 cracked (${broke} in pieces) vs ${slow}/20`);
  const r = dryFor(D, [greenCook], [[18 * H, 'look']], { seed: 3, equipment: [RACK({ sunExposure: 1 })] }, 6 * H, () => harsh);
  const crackWord = r.obs.find((o) => o.quantity === 'crack')?.text;
  ok(r.last.produced[0].quality!.crack === 0 || /ひび|割れて/.test(crackWord ?? ''), 'a crack is seen when it is there', crackWord ?? '(no crack)');
}

console.log('6. pieces, looks, unknown weather');
{
  const key = (r: ReturnType<typeof dryFor>) => JSON.stringify([r.last.produced, r.last.released, r.obs]);
  const acts: [number, string][] = [[D + 7 * M + 13_000, 'look'], [2 * D + 1_000, 'look'], [3 * D + 17_000, 'take_off']];
  const a = dryFor(4 * D, [greenCook], acts, {}, H), b = dryFor(4 * D, [greenCook], acts, {}, 30_000), c = dryFor(4 * D, [greenCook], acts, {}, 3 * H);
  ok(key(a) === key(b) && key(a) === key(c), '1 h = 30 s = 3 h pieces (looks between the grid points): the same pot and words');
  const settle = (r: ReturnType<typeof dryFor>) => JSON.stringify([r.last.produced, r.last.released, r.all.map((x) => x.energy)]);
  const looks: [number, string][] = Array.from({ length: 30 }, (_, i) => [i * 3 * H + 17_000, 'look']);
  ok(settle(dryFor(4 * D, [greenCook], looks)) === settle(dryFor(4 * D, [greenCook], [])), 'looking changes nothing');
  const gap = dryFor(4 * D, [greenCook], [[3 * D, 'look']], {}, H, (t) => (t >= D && t < 2 * D ? { ...SHADE, source: 'unknown' } : SHADE));
  ok(gap.obs.length === 0 && gap.last.produced[0].quality!.history_complete === 0 && sum(gap.last.released) < sum(dryFor(4 * D, [greenCook], []).last.released),
    'a day of unknown weather: nothing dries in it, the history is incomplete, and the run tells nothing more');
  const noWind = dryFor(D, [greenCook], [[12 * H, 'look']], {}, H, () => ({ t: 28, rh: 0.75 }));
  const calm = dryFor(D, [greenCook], [], {}, H, () => ({ t: 28, rh: 0.75, wind: 0 }));
  ok(sum(noWind.last.released) === 0 && noWind.obs.length === 0 && noWind.last.produced[0].quality!.history_complete === 0 && sum(calm.last.released) > 0,
    'the wind missing: not computed; an explicit calm (0) is computed');
}

console.log('8. fixes from the review (Codex 042cc53 A1, A2, C1)');
{
  // A1: a pot taken off leather hard is leather hard when it is put back
  let st: ScienceStepRequest['state'] = null, r!: ScienceStepResult, t = 0;
  for (; t < 8 * D; t += H) { r = step(dryReq(t, t + H, st, [greenCook], [], SHADE)); st = r.state; if ((r.diagnostics as { stage: string }).stage === 'leather') break; }
  const off = step(dryReq(t + H, t + 2 * H, st, [greenCook], [[t + H, 'take_off']], SHADE));
  const leather = potOf(off, 'lot:leather');
  const back = dryFor(H, [leather], [[0, 'look']]);
  ok(leather.quality!.dry_stage === 1 && /革のかたさ/.test(back.obs[0]?.text ?? ''), 'A1: a pot taken off leather hard reads leather hard when it is put back', back.obs[0]?.text);
  // A2: the fastest drying it has had goes with the pot: hot wind for ten minutes (still soft), then gentle shade under leaves
  const harsh: Env = { t: 32, rh: 0.55, wind: 6 };
  let carried = 0, fresh = 0;
  for (let s = 1; s <= 20; s++) {
    const first = dryFor(10 * M, [greenCook], [], { seed: s, equipment: [RACK({ sunExposure: 1 })] }, 10 * M, () => harsh);
    const p1 = potOf(first.last, 'lot:p1');
    if ((p1.quality!.dry_stage ?? 0) !== 0) continue;
    if (dryFor(10 * D, [p1], [], { seed: s, equipment: [RACK({ covered: 1 })] }).last.produced[0].quality!.crack >= 1) carried++;
    if (dryFor(10 * D, [greenCook], [], { seed: s, equipment: [RACK({ covered: 1 })] }).last.produced[0].quality!.crack >= 1) fresh++;
  }
  ok(carried >= 5 && fresh === 0, 'A2: ten minutes of hot wind stay with the pot: put back under leaves, it still cracks at leather hard (a fresh pot under leaves does not)', `${carried}/20 vs ${fresh}/20`);
  // C1: the time to dry goes as the wall squared (diffusion), not its cube
  const daysToDry = (wall: number) => {
    const p = potOf(step(shapeReq([CLAY(200_000, 9_000_000)], [plan(1, 4000, wall)])));
    let s2: ScienceStepRequest['state'] = null;
    for (let t2 = 0; t2 < 120 * D; t2 += 6 * H) { const x = step(dryReq(t2, t2 + 6 * H, s2, [p], [], SHADE, { equipment: [RACK({ covered: 1 })] })); s2 = x.state; if ((x.diagnostics as { stage: string }).stage === 'dry') return (t2 + 6 * H) / D; }
    return Infinity;
  };
  const d8 = daysToDry(8), d16 = daysToDry(16);
  ok(d16 / d8 > 3 && d16 / d8 < 5, 'C1: a wall twice as thick takes about four times as long to dry (wall², not wall³)', `${d8} → ${d16} days under leaves`);
  const bad = step(dryReq(0, H, null, [{ ...greenCook, quality: { ...greenCook.quality, dry_stage: 5 } }], [], SHADE));
  ok(bad.status === 'failed' && /dry_stage/.test(String(bad.evidence.notes)), 'a drying history that cannot be is refused');
}

console.log('7. requests that are refused');
{
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  refused('a tile, not a pot', step(dryReq(0, H, null, [{ ...greenCook, materialId: 'test_tile_green' }], [], SHADE)), /green_pot/);
  refused('no rack', step(dryReq(0, H, null, [greenCook], [], SHADE, { equipment: [] })), /drying_rack/);
  refused('an unknown action', step(dryReq(0, H, null, [greenCook], [[0, 'turn']], SHADE)), /unknown action/);
  const s0 = step(dryReq(0, H, null, [greenCook], [], SHADE));
  refused('the rack changed under the run', step(dryReq(H, 2 * H, s0.state, [greenCook], [], SHADE, { equipment: [RACK({ covered: 1 })] })), /changed-input/);
  refused('a missing interval', step(dryReq(2 * H, 3 * H, s0.state, [greenCook], [], SHADE)), /noncontiguous/);
  refused('a pot without its shape', step(dryReq(0, H, null, [{ ...greenCook, quality: { water_ppm: 200_000, xd_kaolinite_ppm: 600_000 } }], [], SHADE)), /form, capacity_ml and wall_mm/);
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation', violations.slice(0, 3).join(' / '));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
