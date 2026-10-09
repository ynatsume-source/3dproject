// Checks for the oil lamp (p40x_oil_lamp 0.1.0).
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-oil-lamp-check.ts
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { OIL_LAMP_PROCESS, WICK_RECIPES, wickQuality } from '../src/science/step/oil-lamp';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const M = 60_000, H = 3600_000, W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const violations: string[] = [];
const step = (q: ScienceStepRequest) => { const r = scienceStep(q); violations.push(...validateResult(q, r).map((v) => `${q.requestId}: ${v}`)); return r; };
type Drawn = { drawn: { materialId: string; amount: { value: number } }[] };
const sum = (xs: { amount: { value: number } }[] = []) => xs.reduce((s, x) => s + x.amount.value, 0);
const balanced = (r: ScienceStepResult) => sum(r.consumed) + sum((r as unknown as Drawn).drawn) === sum(r.produced) + sum(r.released);

const OIL = (mg = 60_000, q: Record<string, number> = {}): LotView => ({ lotId: 'lot:oil', materialId: 'coconut_oil', amount: { value: mg, unit: 'mg' }, location: 'site:jar', quality: { x_coconut_fat_ppm: 1_000_000, scorch_ppm: 20_000, history_complete: 1, ...q } });
const WICK = (fiber: 1 | 2 | 3 = 1, dia = 4, mg = 2_000): LotView => ({ lotId: 'lot:wick', materialId: 'lamp_wick', amount: { value: mg, unit: 'mg' }, location: 'site:shelf', quality: wickQuality(fiber, dia) });
// a lamp dish as lampDishParams gives it (80 mL, an unglazed body soaking 13 %), and where it stands
const DISH = (p: Record<string, number> = {}) => ({ equipmentId: 'eq:dish', kind: 'lamp_dish', catalogEntry: 'lamp_dish', catalogVersion: 'civ-sci-test-2', condition: 1,
  params: { capacityMl: 80, absorptionPpm: 130_000, massG: 120, shelter: 0.8, roofed: 1, ...p } });
type Env = { t: number; wind?: number; rain?: number; source?: string };
const NIGHT: Env = { t: 27, wind: 2, rain: 0 };
const req = (from: number, to: number, state: ScienceStepRequest['state'], lots: LotView[], acts: ScienceStepRequest['actions'], env: Env, o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.2.0', requestId: `l@${from}`, world: W, runId: 'run:lamp', ...OIL_LAMP_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
  environment: { sampleId: `env:${from}`, source: (env.source ?? 'record') as 'record', effectiveAt: from, airTempC: env.t, humidity: 0.8,
    ...(env.wind !== undefined ? { windMs: env.wind } : {}), ...(env.rain !== undefined ? { rainMmH: env.rain } : {}) },
  lots, equipment: [DISH()], energy: [], seed: 1, actions: acts, ...o });
type A = [number, string, Record<string, number>?];
const acts = (xs: A[]) => xs.map(([at, action, params]) => ({ at, residentId: 'res:lantern', action, ...(params ? { params } : {}) }));
/** A night with the lamp, in pieces of chunk ms; actions at absolute times; env per piece. */
function night(until: number, xs: A[], o: Partial<ScienceStepRequest> = {}, chunk = H, env: (t: number) => Env = () => NIGHT, lots: LotView[] = [OIL(), WICK()]) {
  let st: ScienceStepRequest['state'] = null; const all: ScienceStepResult[] = [];
  for (let t = 0; t < until; t += chunk) {
    const end = Math.min(until, t + chunk);
    const r = step(req(t, end, st, lots, acts(xs.filter(([at]) => at >= t && at < end)), env(t), o));
    all.push(r); st = JSON.parse(JSON.stringify(r.state));
    if (r.status !== 'running') break;
  }
  const last = all[all.length - 1];
  return { all, last, obs: all.flatMap((r) => r.observations), diag: last.diagnostics as Record<string, number | string>,
    out: (m: string, soaked = false) => last.produced.find((p) => p.materialId === m && ((p.quality?.soaked_in_dish ?? 0) === 1) === soaked) };
}
const words = (r: { obs: ScienceStepResult['observations'] }) => r.obs.map((o) => o.text).join(' / ');
const hourly = Array.from({ length: 6 }, (_, i) => [i * H + 20 * M, 'look'] as A);

console.log('1. a night by the lamp (pandanus wick, medium, a warm night under the roof)');
const base = night(6 * H + M, [[0, 'light', { wickOut: 1 }], ...hourly, [6 * H, 'put_out']]);
{
  const g = (Number(base.diag.burnedMg) / 1000), hours = Number(base.diag.litSeconds) / 3600;
  ok(base.last.status === 'completed' && hours > 5.9 && g / hours > 2.5 && g / hours < 5.5, 'it burns the night through, a few grams of oil an hour', `${hours.toFixed(1)} h, ${(g / hours).toFixed(2)} g/h`);
  const lights = base.obs.filter((o) => o.quantity === 'light').map((o) => o.text);
  ok(/顔|手元/.test(lights[0] ?? '') && lights[lights.length - 1] !== lights[0] && base.obs.some((o) => /芯の先が黒く固まっている/.test(o.text ?? '')), 'the light fades as the wick tip chars', lights.join(' → '));
  const soaked = base.out('coconut_oil', true)!;
  ok(soaked && soaked.amount.value > 10_000 && soaked.into === 'eq:dish' && base.obs.some((o) => /しみこんで|しっとり/.test(o.text ?? '')), 'a new unglazed dish soaks oil into its wall first (handed back as its own lot, kept with the dish)', `${(soaked.amount.value / 1000).toFixed(1)} g`);
  ok(balanced(base.last) && base.last.released.some((r) => r.materialId === 'process_co2') && sum((base.last as unknown as Drawn).drawn) > 0, 'oil + wick + O2 = oil left + soaked oil + wick left + CO2 + water + soot (whole mg)');
  const trimmed = night(6 * H + M, [[0, 'light', { wickOut: 1 }], [3 * H, 'trim'], ...hourly, [6 * H, 'put_out']]);
  ok(Number(trimmed.diag.lumenSeconds) > Number(base.diag.lumenSeconds) && trimmed.out('wick_char')!.amount.value > 0, 'trimming the charred tip brings the light back (more light over the night)',
    `${(Number(base.diag.lumenSeconds) / 3600).toFixed(0)} → ${(Number(trimmed.diag.lumenSeconds) / 3600).toFixed(0)} lm·h`);
  // the next evening: the oil left, the soaked oil and the wick go back in, and the dish soaks no more
  const back = (p: ScienceStepResult['produced'][number], id: string): LotView => ({ lotId: id, materialId: p.materialId, amount: p.amount, location: p.into ?? 'eq:dish', quality: p.quality });
  const lots2 = [back(base.out('coconut_oil')!, 'lot:oil2'), back(soaked, 'lot:soaked'), back(base.out('lamp_wick')!, 'lot:wick2')];
  const again = night(H + M, [[0, 'trim'], [0, 'light', { wickOut: 1 }], [H, 'put_out']], {}, H, () => NIGHT, lots2);
  ok(again.last.status === 'completed' && Number(again.diag.soakedMg) === 0 && balanced(again.last), 'the lots handed back light again the next evening; a dish that has soaked takes no more', `${(Number(again.diag.burnedMg) / 1000).toFixed(1)} g burned`);
}

console.log('2. the wick: how far out, and what it is made of');
{
  const run = (wickOut: number, fiber: 1 | 2 | 3 = 1) => night(3 * H + M, [[0, 'light', { wickOut }], [30 * M, 'look'], [3 * H, 'put_out']], {}, H, () => NIGHT, [OIL(), WICK(fiber)]);
  const s = run(0), m = run(1), l = run(2);
  const lm = (r: ReturnType<typeof run>) => Number(r.diag.lumenSeconds) / Number(r.diag.litSeconds);
  const soot = (r: ReturnType<typeof run>) => r.last.released.find((x) => x.materialId === 'soot')?.amount.value ?? 0;
  ok(lm(s) < lm(m) && lm(m) < lm(l), 'further out, more light', `${lm(s).toFixed(1)} / ${lm(m).toFixed(1)} / ${lm(l).toFixed(1)} lm`);
  ok(soot(l) > 3 * soot(m) && l.obs.some((o) => /黒い煙/.test(o.text ?? '')) && !m.obs.some((o) => /黒い煙/.test(o.text ?? '')), 'a long wick smokes (soot)', `soot ${soot(m)} / ${soot(l)} mg`);
  const fibres = ([1, 2, 3] as const).map((f) => Number(run(1, f).diag.lumenSeconds) / 3600);
  ok(new Set(fibres.map((x) => x.toFixed(0))).size === 3, 'pandanus, coir and reed pith wicks give different nights (the world decides; nobody is told)', fibres.map((x) => `${x.toFixed(0)} lm·h`).join(' / '));
}

console.log('3. coconut oil sets on a cool night');
{
  const cool: Env = { t: 18, wind: 1, rain: 0 }, cold: Env = { t: 12, wind: 1, rain: 0 };
  const noWarm = night(2 * H, [[0, 'light'], [H, 'put_out']], {}, H, () => cool);
  ok(noWarm.obs.some((o) => /白く固まっていて、芯に火がつかない/.test(o.text ?? '')) && Number(noWarm.diag.litSeconds) === 0, 'at 18 °C the oil is set: the wick will not light', words(noWarm));
  const warmed = night(3 * H, [[0, 'warm'], [M, 'light'], [2 * H, 'look'], [2 * H + M, 'put_out']], {}, H, () => cool);
  ok(Number(warmed.diag.litSeconds) > 1.9 * 3600, 'warmed by the fire first, it lights, and the flame keeps the oil soft enough', `${(Number(warmed.diag.litSeconds) / 3600).toFixed(1)} h; ${warmed.obs.filter((o) => o.quantity === 'oil').map((o) => o.text).join(' / ')}`);
  const coldNight = night(4 * H, [[0, 'warm'], [M, 'light'], [3 * H, 'look'], [3 * H + M, 'put_out']], {}, H, () => cold);
  ok(Number(coldNight.diag.litSeconds) < 2 * 3600 && coldNight.obs.some((o) => /固まって、灯が細くなって消えた/.test(o.text ?? '')), 'on a cold night (12 °C) it starves and goes out as the oil sets again', `${(Number(coldNight.diag.litSeconds) / 3600).toFixed(1)} h`);
}

console.log('4. wind and rain');
{
  const windy: Env = { t: 27, wind: 6, rain: 0 };
  const open = night(2 * H, [[0, 'light'], [30 * M, 'look'], [H, 'put_out']], { equipment: [DISH({ shelter: 0 })] }, H, () => windy);
  const inside = night(2 * H, [[0, 'light'], [30 * M, 'look'], [H, 'put_out']], { equipment: [DISH({ shelter: 0.8 })] }, H, () => windy);
  ok(Number(open.diag.litSeconds) < 60 && Number(inside.diag.litSeconds) > 3500, 'in the open the wind blows it out; sheltered it burns', `${words(open)}`);
  const rain: Env = { t: 27, wind: 1, rain: 3 };
  const noRoof = night(2 * H, [[0, 'light'], [H, 'put_out']], { equipment: [DISH({ roofed: 0, shelter: 0.5 })] }, H, () => rain);
  const roof = night(2 * H, [[0, 'light'], [H, 'put_out']], { equipment: [DISH({ roofed: 1, shelter: 0.5 })] }, H, () => rain);
  ok(Number(noRoof.diag.litSeconds) === 0 && Number(roof.diag.litSeconds) > 3500, 'rain puts out a lamp with no roof over it');
  const noRain = step(req(0, H, null, [OIL(), WICK()], acts([[0, 'light']]), { t: 27, wind: 1 }, { equipment: [DISH({ roofed: 0 })] }));
  const missingWind = step(req(0, H, null, [OIL(), WICK()], acts([[0, 'light']]), { t: 27, rain: 0 }));
  ok(noRain.status === 'stopped' && missingWind.status === 'stopped' && noRain.simulated.to === 0, 'with no roof the rain must be known, and the wind always (a missing value is unknown weather: nothing is computed)');
}

console.log('5. the oil runs out');
{
  const little = night(10 * H, [[0, 'light', { wickOut: 2 }], [9 * H, 'look'], [9 * H + M, 'put_out']], {}, H, () => NIGHT, [OIL(30_000), WICK()]);
  ok(little.obs.some((o) => /油が尽きて灯が消えた|皿の油がほとんどない/.test(o.text ?? '')) && balanced(little.last), 'a little oil in a new dish (it soaks some first) burns out before the night ends', `${(Number(little.diag.litSeconds) / 3600).toFixed(1)} h`);
}

console.log('6. pieces, looks, unknown weather, a lost dish');
{
  const xs: A[] = [[0, 'light', { wickOut: 1 }], [97 * M + 13_000, 'trim'], [2 * H + 7_000, 'wick_out', { wickOut: 2 }], [3 * H + 1_234, 'put_out'], [37 * M + 13_000, 'look'], [2 * H + 7_000, 'look'], [2 * H + 30 * M, 'look']];
  const key = (r: ReturnType<typeof night>) => JSON.stringify([r.last.produced, r.last.released, (r.last as unknown as Drawn).drawn, r.last.simulated.to, r.obs, r.all.reduce((s, x) => s + (x.energy[0]?.usedJ ?? 0), 0)]);
  const a = night(4 * H, xs), b = night(4 * H, xs, {}, 30_000), c = night(4 * H, xs, {}, 3 * H), d = night(4 * H, xs, {}, 17 * M + 3);
  ok(key(a) === key(b) && key(a) === key(c) && key(a) === key(d), '1 h = 30 s = 3 h = 17 min pieces (actions and looks between the grid points): the same lamp, gases, heat and words');
  const noLooks = night(4 * H, xs.filter(([, x]) => x !== 'look'));
  ok(JSON.stringify([noLooks.last.produced, noLooks.last.released]) === JSON.stringify([a.last.produced, a.last.released]), 'looking changes nothing');
  ok(a.obs.findIndex((o) => o.at === 2 * H + 7_000 && o.quantity === 'smoke') >= 0, 'at the same moment the hands act first: the look sees the wick already pulled out (smoke)');
  const gap = night(4 * H, [[0, 'light'], [3 * H, 'put_out']], {}, H, (t) => (t >= H ? { ...NIGHT, source: 'unknown' } : NIGHT));
  ok(gap.last.status === 'stopped' && gap.last.simulated.to === H && /見ていない間に灯が消えていた/.test(words({ obs: gap.last.observations })) && gap.out('coconut_oil')!.quality!.history_complete === 0 && balanced(gap.last),
    'weather unknown: the run stops where it was known; only "the lamp went out while nobody watched"');
  const lostWhole = step(req(0, 2 * H, null, [OIL(), WICK()], acts([[0, 'light']]), NIGHT, { stop: 'equipment-lost' }));
  const first = step(req(0, H, null, [OIL(), WICK()], acts([[0, 'light']]), NIGHT));
  const lostSplit = step(req(H, 2 * H, JSON.parse(JSON.stringify(first.state)), [OIL(), WICK()], [], NIGHT, { stop: 'equipment-lost', equipment: [] }));
  ok(JSON.stringify([lostWhole.produced, lostWhole.released]) === JSON.stringify([lostSplit.produced, lostSplit.released]) && lostWhole.status === 'stopped' && Number((lostWhole.diagnostics as Record<string, number>).litSeconds) === 7200,
    'a dish lost at 2 h: it burned until then, in one request or two');
}

console.log('7. requests that are refused');
{
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  refused('no wick', step(req(0, H, null, [OIL()], [], NIGHT)), /lamp_wick/);
  refused('milk, not oil', step(req(0, H, null, [{ ...OIL(), quality: { x_coconut_fat_ppm: 300_000, x_water_ppm: 600_000 } }, WICK()], [], NIGHT)), /clear oil/);
  refused('too much oil for the dish', step(req(0, H, null, [OIL(100_000), WICK()], [], NIGHT)), /does not fit/);
  refused('a dish without where it stands', step(req(0, H, null, [OIL(), WICK()], [], NIGHT, { equipment: [{ ...DISH(), params: { capacityMl: 80, absorptionPpm: 130_000, massG: 120 } }] })), /shelter/);
  refused('a wick of no known fibre', step(req(0, H, null, [OIL(), { ...WICK(), quality: { fiber: 7, diameter_mm: 4 } }], [], NIGHT)), /fiber/);
  refused('energy offered', step(req(0, H, null, [OIL(), WICK()], [], NIGHT, { energy: [{ sourceId: 'src:x', kind: 'heat', maxJ: 1 }] })), /no energy/);
  refused('an unknown action', step(req(0, H, null, [OIL(), WICK()], acts([[0, 'blow']]), NIGHT)), /unknown action/);
  refused('wick_out without a level', step(req(0, H, null, [OIL(), WICK()], acts([[0, 'wick_out']]), NIGHT)), /wickOut/);
  const s0 = step(req(0, H, null, [OIL(), WICK()], acts([[0, 'light']]), NIGHT));
  refused('a missing interval', step(req(2 * H, 3 * H, s0.state, [OIL(), WICK()], [], NIGHT)), /noncontiguous/);
  refused('the dish changed under the run', step(req(H, 2 * H, s0.state, [OIL(), WICK()], [], NIGHT, { equipment: [DISH({ shelter: 0 })] })), /changed-input/);
  refused('contract 0.1 (the flame draws O2)', step(req(0, H, null, [OIL(), WICK()], [], NIGHT, { contract: '0.1.0' })), /contract|0\.2/);
}

console.log('8. wicks main makes');
ok(WICK_RECIPES.length === 3 && WICK_RECIPES.every((w) => w.mg > 0 && w.handSeconds > 0 && w.diameterMm >= 2), 'three wicks from what the island has', WICK_RECIPES.map((w) => `${w.materialId} ${w.mg / 1000} g`).join(' / '));

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation', violations.slice(0, 3).join(' / '));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
