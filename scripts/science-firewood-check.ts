// Checks for drying firewood in a stack (p15x_firewood_dry, island clock, contract 0.2.x).
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-firewood-check.ts
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { EMC_RANGE, FIREWOOD_DRY_PROCESS, woodEmc } from '../src/science/step/firewood';
import { fuelComp } from '../src/science/step/wood-fire';
import { fuelLhvJPerMg } from '../src/science/physics';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const H = 3600_000, D = 24 * H, W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const violations: string[] = [];
const step = (q: ScienceStepRequest) => { const r = scienceStep(q); violations.push(...validateResult(q, r).map((v) => `${q.requestId}: ${v}`)); return r; };
type Drawn = { drawn: { materialId: string; amount: { value: number } }[] };
const sum = (xs: { amount: { value: number } }[] = []) => xs.reduce((s, x) => s + x.amount.value, 0);

// freshly cut branches, as main makes them: 4 kg, 45 % water
const WOOD = (q: Record<string, number> = {}, mg = 4_000_000): LotView => ({ lotId: 'lot:wood', materialId: 'firewood', amount: { value: mg, unit: 'mg' }, location: 'site:woodpile', quality: { water_ppm: 450_000, ...q } });
const STACK = (p: Record<string, number> = {}) => ({ equipmentId: 'eq:stack', kind: 'firewood_stack', catalogEntry: 'firewood_stack', catalogVersion: 'civ-sci-test-2', condition: 1, params: { covered: 1, sunExposure: 0, ...p } });
type Env = { t: number; rh: number; wind: number; rain?: number; source?: string };
const SHADE: Env = { t: 28, rh: 0.75, wind: 2, rain: 0 };
const req = (from: number, to: number, state: ScienceStepRequest['state'], lots: LotView[], acts: [number, string][], env: Env, o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.2.0', requestId: `f@${from}`, world: W, runId: 'run:wood', ...FIREWOOD_DRY_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
  environment: { sampleId: `env:${from}`, source: (env.source ?? 'record') as 'record', effectiveAt: from, airTempC: env.t, humidity: env.rh, windMs: env.wind, ...(env.rain !== undefined ? { rainMmH: env.rain } : {}) },
  lots, equipment: [STACK()], energy: [], seed: 1, actions: acts.map(([at, action]) => ({ at, residentId: 'res:lantern', action })), ...o });
function stackFor(until: number, lots: LotView[], acts: [number, string][], o: Partial<ScienceStepRequest> = {}, chunk = H, env: (t: number) => Env = () => SHADE) {
  let st: ScienceStepRequest['state'] = null; const all: ScienceStepResult[] = [];
  for (let t = 0; t < until; t += chunk) {
    const end = Math.min(until, t + chunk);
    const r = step(req(t, end, st, lots, acts.filter(([at]) => at >= t && at < end), env(t), { ...o, ...(end === until && !acts.some(([, a]) => a === 'take_out') ? { stop: 'operator' } : {}) }));
    all.push(r); st = JSON.parse(JSON.stringify(r.state));
    if (r.status !== 'running') break;
  }
  const last = all[all.length - 1];
  return { all, last, obs: all.flatMap((r) => r.observations) };
}
const wetBasis = (r: { last: ScienceStepResult }) => (r.last.produced[0]?.quality?.water_ppm ?? NaN) / 1e6;
const balanced = (r: ScienceStepResult) => sum(r.consumed) + sum((r as unknown as Drawn).drawn) === sum(r.produced) + sum(r.released);
const asLot = (r: ScienceStepResult): LotView => ({ lotId: 'lot:back', materialId: 'firewood', amount: r.produced[0].amount, location: 'site:woodpile', quality: r.produced[0].quality });

console.log('1. the air sets how dry wood can get');
{
  const e = woodEmc(28, 0.75)!, dryAir = woodEmc(28, 0.4)!, damp = woodEmc(28, 0.95)!;
  ok(e > 0.12 && e < 0.16 && dryAir < e && damp > e, 'equilibrium moisture (Wood Handbook form): about 14 % at 28 °C and 75 %, lower in dry air, higher in damp', `${(dryAir * 100).toFixed(1)} / ${(e * 100).toFixed(1)} / ${(damp * 100).toFixed(1)} %`);
}

console.log('2. stacked under a roof in the shade');
const shade = stackFor(120 * D, [WOOD()], [[D, 'look'], [30 * D, 'look'], [60 * D, 'look'], [119 * D, 'take_out']], {}, D);
{
  const wb = wetBasis(shade), back = shade.last;
  const words = shade.obs.map((o) => o.text);
  ok(back.status === 'completed' && wb < 0.2 && wb > 0.1, 'fresh wood (45 % water) under a roof dries to seasoned firewood in about four months (island time)', `${(wb * 100).toFixed(1)} % water at 119 days`);
  ok(/湿って/.test(words[0] ?? '') && /乾いて|ひび/.test(words.at(-1) ?? ''), 'it feels heavy and wet at first, light and dry at the end', words.join(' / '));
  ok(balanced(back) && sum(back.released) > 1_000_000 && (back as unknown as Drawn).drawn.length === 0, 'wood = drier wood + vapour (no rain under a roof)', `${(sum(back.released) / 1e6).toFixed(2)} kg of water gone`);
  const heat = shade.all.reduce((s, r) => s + r.energy.reduce((x, e) => x + e.usedJ, 0), 0);
  ok(Math.abs(heat - (sum(back.released) / 1e6) * 2.442e6) < 2e4, 'the heat to dry it comes from the air (latent heat of the vapour)', `${(heat / 1e6).toFixed(2)} MJ`);
  const before = fuelLhvJPerMg(fuelComp(WOOD()) as never), after = fuelLhvJPerMg(fuelComp(asLot(back)) as never);
  ok(after > before * 1.4, 'dried, a kilogram of it gives far more heat in a fire', `${before.toFixed(1)} → ${after.toFixed(1)} MJ/kg`);
  const again = stackFor(10 * D, [asLot(back)], [[9 * D, 'take_out']], {}, D);
  ok(again.last.status === 'completed' && wetBasis(again) <= wb + 1e-9, 'the dried lot handed back goes onto the stack again (and gets no wetter)');
}

console.log('3. sun, size, rain');
{
  const days = 40 * D, dryDay: Env = { t: 30, rh: 0.6, wind: 3, rain: 0 };
  const sun = stackFor(days, [WOOD()], [], { equipment: [STACK({ covered: 0, sunExposure: 1 })] }, D, () => dryDay);
  const roof = stackFor(days, [WOOD()], [], {}, D, () => dryDay);
  ok(wetBasis(sun) < wetBasis(roof) - 0.03, 'in the open sun it dries faster than under the roof', `${(wetBasis(sun) * 100).toFixed(1)} vs ${(wetBasis(roof) * 100).toFixed(1)} % at 40 days`);
  const thick = stackFor(days, [WOOD({ piece_mm: 120 })], [], {}, D);
  const thin = stackFor(days, [WOOD()], [], {}, D);
  ok(wetBasis(thick) > wetBasis(thin) + 0.08, 'logs twice as thick dry much more slowly (split the wood)', `${(wetBasis(thick) * 100).toFixed(1)} vs ${(wetBasis(thin) * 100).toFixed(1)} %`);
  const seasoned = WOOD({ water_ppm: 150_000 });
  const rainy: Env = { t: 26, rh: 0.95, wind: 2, rain: 8 };
  const open = stackFor(D, [seasoned], [[12 * H, 'look']], { equipment: [STACK({ covered: 0 })] }, H, () => rainy);
  const roofed = stackFor(D, [seasoned], [], {}, H, () => rainy);
  const rainIn = sum((open.last as unknown as Drawn).drawn);
  ok(rainIn > 300_000 && wetBasis(open) > 0.2 && balanced(open.last) && /雨で表面が濡れて/.test(open.obs.map((o) => o.text).join()), 'a day of rain on an open stack soaks dry wood again (rain drawn from the air)', `${(rainIn / 1000).toFixed(0)} g taken up, ${(wetBasis(open) * 100).toFixed(1)} % water`);
  ok((roofed.last as unknown as Drawn).drawn.length === 0 && wetBasis(roofed) <= 0.15 + 1e-9, 'under the roof the same day leaves it dry');
  const noRain = stackFor(D, [WOOD()], [], { equipment: [STACK({ covered: 0 })] }, H, () => ({ t: 28, rh: 0.75, wind: 2 }));
  const noRainRoof = stackFor(D, [WOOD()], [], {}, H, () => ({ t: 28, rh: 0.75, wind: 2 }));
  ok(noRain.last.produced[0].quality!.history_complete === 0 && sum(noRain.last.released) === 0 && noRainRoof.last.produced[0].quality!.history_complete === 1,
    'an open stack with the rain unknown is not computed (nothing invented); a roofed one does not need the rain');
  const already = stackFor(10 * D, [WOOD({ water_ppm: 100_000 })], [], {}, D);
  ok(sum(already.last.released) === 0 && Math.abs(wetBasis(already) - 0.1) < 1e-9, 'wood already drier than the air allows stays as it is (taking moisture back from humid air is not modelled)');
}

console.log('4. pieces, looks, unknown weather');
{
  const key = (r: ReturnType<typeof stackFor>) => JSON.stringify([r.last.produced, r.last.released, (r.last as unknown as Drawn).drawn, r.obs]);
  const acts: [number, string][] = [[D + 7 * 60_000 + 13_000, 'look'], [3 * D + 1_000, 'look'], [5 * D + 17_000, 'take_out']];
  const open = { equipment: [STACK({ covered: 0, sunExposure: 0.5 })] }, wet = (t: number): Env => (Math.floor(t / (6 * H)) % 3 === 0 ? { t: 27, rh: 0.9, wind: 3, rain: 4 } : SHADE);
  const a = stackFor(6 * D, [WOOD()], acts, open, H, wet), b = stackFor(6 * D, [WOOD()], acts, open, 30_000, wet), c = stackFor(6 * D, [WOOD()], acts, open, 3 * H, wet);
  ok(key(a) === key(b) && key(a) === key(c), '1 h = 30 s = 3 h pieces (rain, sun, looks between the grid points): the same wood and words');
  const looks: [number, string][] = Array.from({ length: 40 }, (_, i) => [i * 3 * H + 17_000, 'look']);
  const settle = (r: ReturnType<typeof stackFor>) => JSON.stringify([r.last.produced, r.last.released, r.all.map((x) => x.energy)]);
  ok(settle(stackFor(5 * D, [WOOD()], looks)) === settle(stackFor(5 * D, [WOOD()], [])), 'looking changes nothing');
  // a look between grid points sees its own time: thin sticks cross from "wet" to "drying" within hours
  const sticks = [WOOD({ piece_mm: 5 })];
  let st: ScienceStepRequest['state'] = null, cross = 0;
  for (let t = 0; t < 2 * D && !cross; t += 1000) {
    const r = step(req(t, t + 1000, st, sticks, [], SHADE)); st = r.state;
    const d = r.diagnostics as { waterRatio: number }; if (d.waterRatio / (1 + d.waterRatio) <= 0.35) cross = t + 1000;
  }
  const at = cross - 1000, lookAt = (chunk: number) => stackFor(cross + 60_000, sticks, [[at, 'look']], {}, chunk).obs[0]?.text;
  ok(cross > 0 && at % 30_000 !== 0 && lookAt(cross + 60_000) === lookAt(1000), 'a look between grid points reads the wood at its own time (one piece = 1-second pieces)', `${(at / 1000).toFixed(0)} s: ${lookAt(1000)}`);
  const gap = stackFor(4 * D, [WOOD()], [[3 * D, 'look'], [4 * D - 30_000, 'take_out']], {}, H, (t) => (t >= D && t < 2 * D ? { ...SHADE, source: 'unknown' } : SHADE));
  const ref = stackFor(4 * D, [WOOD()], [[4 * D - 30_000, 'take_out']]);
  ok(gap.obs.length === 0 && gap.last.produced[0].quality!.history_complete === 0 && sum(gap.last.released) < sum(ref.last.released),
    'a day of unknown weather: nothing dries in it (nothing invented), and the run tells nothing more after it');
}

console.log('6. fixes from the review (Codex 29521cb A1, A2, C1)');
{
  // A1: outside the EMC fit's temperatures nothing is computed, and the water never goes below 0
  const cold = stackFor(H, [WOOD({ water_ppm: 0 })], [[30 * 60_000, 'look']], {}, H, () => ({ t: -60, rh: 0.95, wind: 2, rain: 0 }));
  ok(woodEmc(-60, 0.95) === null && sum(cold.last.released) === 0 && cold.last.energy.length === 0 && cold.last.produced[0].quality!.water_ppm === 0 && cold.last.produced[0].quality!.history_complete === 0 && cold.obs.length === 0,
    'A1: −60 °C, RH 95 %: outside the fit (−1.1..98.9 °C), not computed — no vapour, no heat, water stays 0, history incomplete');
  let minEmc = Infinity;
  for (let T = EMC_RANGE.minC; T <= EMC_RANGE.maxC; T += 0.5) for (let h = 0; h <= 1.0001; h += 0.01) minEmc = Math.min(minEmc, woodEmc(T, Math.min(h, 1))!);
  ok(minEmc >= 0, 'A1: inside the fit the equilibrium moisture is never negative', `min ${minEmc.toFixed(5)}`);
  const bone = stackFor(D, [WOOD({ water_ppm: 0 })], [], {}, H, () => ({ t: 35, rh: 0.05, wind: 10, rain: 0 }));
  ok(sum(bone.last.released) === 0 && bone.last.produced[0].quality!.water_ppm === 0 && bone.last.status !== 'failed', 'A1: wood with no water in very dry air gives no vapour (water never below 0)');
  // A2: a missing wind is unknown; an explicit 0 is calm
  const noWind = stackFor(D, [WOOD()], [[12 * H, 'look']], {}, H, () => ({ t: 28, rh: 0.75, wind: undefined as unknown as number, rain: 0 }));
  const calm = stackFor(D, [WOOD()], [[12 * H, 'look']], {}, H, () => ({ t: 28, rh: 0.75, wind: 0, rain: 0 }));
  ok(sum(noWind.last.released) === 0 && noWind.last.produced[0].quality!.history_complete === 0 && noWind.obs.length === 0, 'A2: the wind missing: not computed (history incomplete, nothing seen)');
  ok(sum(calm.last.released) > 0 && calm.last.produced[0].quality!.history_complete === 1 && sum(calm.last.released) < sum(stackFor(D, [WOOD()], []).last.released),
    'A2: an explicit calm (0 m/s) is computed, and dries more slowly than a breeze');
  // C1: above 98 % the form is held at h = 0.98 (this step's own assumption; the source table stops at 95 %)
  ok(woodEmc(25, 0.99) === woodEmc(25, 0.98) && woodEmc(25, 1) === woodEmc(25, 0.98), 'C1: above 98 % RH the form evaluated at h = 0.98 is held (an assumption of this step, not a table value)');
}

console.log('5. requests that are refused');
{
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  refused('contract 0.1.x (rain needs drawn)', step({ ...req(0, H, null, [WOOD()], [], SHADE), contract: '0.1.0' }), /unknown contract/);
  refused('no stack', step(req(0, H, null, [WOOD()], [], SHADE, { equipment: [] })), /firewood_stack/);
  refused('a stack without saying roof or not', step(req(0, H, null, [WOOD()], [], SHADE, { equipment: [{ ...STACK(), params: { sunExposure: 0 } }] })), /covered/);
  refused('firewood without its water', step(req(0, H, null, [{ ...WOOD(), quality: {} }], [], SHADE)), /water_ppm/);
  refused('an unknown action', step(req(0, H, null, [WOOD()], [[0, 'turn']], SHADE)), /unknown action/);
  const s0 = step(req(0, H, null, [WOOD()], [], SHADE));
  refused('the stack changed under the run', step(req(H, 2 * H, s0.state, [WOOD()], [], SHADE, { equipment: [STACK({ covered: 0 })] })), /changed-input/);
  refused('a missing interval', step(req(2 * H, 3 * H, s0.state, [WOOD()], [], SHADE)), /noncontiguous/);
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation', violations.slice(0, 3).join(' / '));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
