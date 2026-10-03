// Checks for firing a test tile with burning wood (p13w_test_tile_wood_fire, contract 0.2.x proposed).
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-wood-fire-check.ts
import type { ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { molarMass } from '../src/science/chem';
import type { ScienceStepResultV02 } from '../src/science/step/wood-fire';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const H = 3600_000, W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const violations: string[] = [];
const step = (req: ScienceStepRequest) => { const r = scienceStep(req) as ScienceStepResultV02; violations.push(...validateResult(req, r).map((v) => `${req.requestId}: ${v}`)); return r; };

const TILE = { lotId: 'lot:tile', materialId: 'test_tile_dry', amount: { value: 37_037, unit: 'mg' as const }, location: 'site:hearth',
  quality: { water_ppm: 20_169, thickness_mm: 10, width_mm: 50, length_mm: 50, xd_kaolinite_ppm: 450_000, xd_quartz_ppm: 300_000, xd_calcite_ppm: 20_000, crack: 0, history_complete: 1 } };
const wood = (kg: number, water = 150_000) => ({ lotId: 'lot:wood', materialId: 'firewood', amount: { value: Math.round(kg * 1e6), unit: 'mg' as const }, location: 'site:woodpile', quality: { water_ppm: water } });
const PIT = { equipmentId: 'eq:pit', kind: 'open_fire_pit', catalogEntry: 'open_fire_pit', catalogVersion: 'civ-sci-test-2', condition: 1,
  params: { heatCapJPerK: 20_000, uaWPerK: 30, chamberFraction: 0.2, maxBurnKgPerH: 25, forcedCoolingUaFactor: 2 } };
const KILN = { equipmentId: 'eq:wk', kind: 'fixture_wood_kiln', catalogEntry: 'fixture_wood_kiln', catalogVersion: 'civ-sci-test-2', condition: 1,
  params: { heatCapJPerK: 40_000, uaWPerK: 8, chamberFraction: 0.3, maxBurnKgPerH: 15, forcedCoolingUaFactor: 5 } };
const env = (at: number, source: 'live' | 'unknown' = 'live') => ({ sampleId: `env:${at}`, source, effectiveAt: at, airTempC: 28, humidity: 0.7, windMs: 3 });
const plan = (glow = 2, hold = 90, pace = 1) => [{ at: 0, residentId: 'res:dot', action: 'fire_plan', params: { pace, targetGlow: glow, holdMin: hold, forcedCooling: 0 } }];
const base = (o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.2.0', requestId: 'r0', world: W, runId: 'run:wf', processId: 'p13w_test_tile_wood_fire', processVersion: '0.1.0', catalogVersion: 'civ-sci-test-2',
  interval: { from: 0, to: H }, state: null, environment: env(0), lots: [TILE, wood(60)], equipment: [KILN], energy: [], actions: plan(), seed: 3, ...o });

/** Run in equal chunks until the run ends; the plan goes with the first request only. */
function run(chunkMs: number, o: Partial<ScienceStepRequest> = {}, opt: { envAt?: (from: number) => ReturnType<typeof env>; stopAt?: number; maxH?: number } = {}) {
  let state: ScienceStepRequest['state'] = null, usedJ = 0, storedJ = 0, last!: ScienceStepResultV02, n = 0;
  for (let from = 0; from < (opt.maxH ?? 48) * H; from += chunkMs) {
    const to = from + chunkMs;
    const req = base({ ...o, requestId: `r@${from}`, interval: { from, to }, state, environment: opt.envAt?.(from) ?? env(from),
      actions: from === 0 ? (o.actions ?? plan()) : [], ...(opt.stopAt !== undefined && to === opt.stopAt ? { stop: 'operator' as const } : {}) });
    last = step(req); state = last.state; n++;
    for (const e of last.energy) { usedJ += e.usedJ; storedJ += e.storedJ ?? 0; }
    if (last.status !== 'running') break;
  }
  return { last, usedJ, storedJ, n, dg: last.diagnostics as Record<string, number | string> };
}
const amount = (xs: { materialId: string; amount: { value: number } }[], id: string) => xs.filter((x) => x.materialId === id).reduce((s, x) => s + x.amount.value, 0);

console.log('1. a wood kiln reaches orange; the result balances with the O2 drawn from the air');
const k = run(H);
{
  const r = k.last;
  ok(r.status === 'completed' && k.dg.outcome === 'done' && (k.dg.peakKilnC as number) > 950, 'kiln, 60 kg of wood, orange 90 min: completed', `peak ${Math.round(k.dg.peakKilnC as number)} °C, ${((k.dg.burnedMg as number) / 1e6).toFixed(1)} kg burned`);
  ok(r.consumed.length === 2 && amount(r.produced, 'test_tile_fired') > 0 && amount(r.produced, 'wood_ash') > 0 && amount(r.produced, 'firewood') > 0,
    'settles once: tile → fired tile, firewood → what is left + ash');
  const cin = r.consumed.reduce((s, x) => s + x.amount.value, 0) + r.drawn.reduce((s, x) => s + x.amount.value, 0);
  const cout = r.produced.reduce((s, x) => s + x.amount.value, 0) + r.released.reduce((s, x) => s + x.amount.value, 0);
  ok(cin === cout && r.drawn[0]?.materialId === 'o2' && r.drawn[0].from === 'air', 'consumed + drawn O2 = produced + released, to the mg', `${cin} = ${cout}`);
  const burnedDry = (k.dg.burnedMg as number) * (1 - 0.15) * (1 - 0.01);
  const o2Ratio = r.drawn[0].amount.value / burnedDry, expect = (1.03 * molarMass('o2')) / molarMass('wood_dry');
  ok(Math.abs(o2Ratio / expect - 1) < 0.002, 'O2 drawn per kg of dry wood follows CH1.44O0.66 + 1.03 O2', `${o2Ratio.toFixed(4)} vs ${expect.toFixed(4)} kg/kg`);
  ok(Math.abs(amount(r.produced, 'wood_ash') / burnedDry - 0.01) < 0.001, 'ash is 1% of the dry wood burned (assumed)');
  ok(Math.abs(k.usedJ / ((k.dg.burnedMg as number) * (0.85 * 0.99 * 18e6 - 0.15 * 2.43e6) / 1e6) - 1) < 1e-4, 'heat released = mass burned × LHV as burned (dry wood 18 MJ/kg, ash none, less the latent heat of the moisture)',
    `${(k.usedJ / 1e6).toFixed(1)} MJ`);
  ok(r.energy.every((e) => e.sourceId === 'src:combustion:run:wf'), 'heat is reported from src:combustion (not an offer)');
  ok(r.observations.some((o) => o.text?.includes('橙')) && r.observations.some((o) => o.text === '白っぽい灰が残った') && !r.observations.some((o) => o.value !== undefined),
    'the resident sees the glow, the ash, the tile: no numbers without an instrument', r.observations.map((o) => o.text).join(' / '));
}

console.log('2. chunking does not change the result (30 s grid from the run start)');
{
  const a = run(30_000), b = run(7 * H), c = run(H, { interval: { from: 0, to: H } });
  const key = (x: typeof k) => JSON.stringify([x.last.produced, x.last.released, x.last.drawn, x.usedJ]);
  ok(key(a) === key(k) && key(b) === key(k) && key(c) === key(k), 'one hour at a time = 30 s at a time = 7 h at a time (identical)', `${a.n} / ${k.n} / ${b.n} requests`);
}

console.log('3. what the hearth and the woodpile allow');
{
  const pit = run(H, { equipment: [PIT], lots: [TILE, wood(140)] });
  ok(pit.dg.outcome === 'peak_not_reached' && (pit.dg.peakKilnC as number) < 800, 'an open fire pit never reaches orange, even with 140 kg of wood: the tender gives up',
    `peak ${Math.round(pit.dg.peakKilnC as number)} °C`);
  ok(pit.last.observations.some((o) => o.text === 'いくら薪を足しても、思った火の色にならなかった'), 'and the resident sees that the fire would not get there');
  const short = run(H, { lots: [TILE, wood(8)] });
  ok(short.dg.outcome === 'fuel_exhausted' && amount(short.last.produced, 'firewood') === 0 && (short.dg.peakKilnC as number) < 700,
    'too little wood: it all burns, the fire dies down before orange', `peak ${Math.round(short.dg.peakKilnC as number)} °C`);
  ok(short.last.observations.some((o) => o.text === '薪が尽きて、火が小さくなっていった'), 'and the resident sees the fire die down');
  const wet = run(H, { lots: [TILE, wood(60, 300_000)] });
  ok((wet.dg.burnedMg as number) > (k.dg.burnedMg as number) * 1.15, 'wetter wood (30% water): more of it burns for the same firing',
    `${((wet.dg.burnedMg as number) / 1e6).toFixed(1)} vs ${((k.dg.burnedMg as number) / 1e6).toFixed(1)} kg`);
}

console.log('4. stopping, outages and changed inputs');
{
  const st = run(H, {}, { stopAt: 3 * H });
  ok(st.last.status === 'stopped' && st.last.consumed.length === 2 && amount(st.last.produced, 'firewood') > 0 && st.last.drawn.length === 1,
    'operator stop at 3 h: settles what burned so far, the rest of the wood goes back');
  const out = run(H, {}, { envAt: (from) => env(from, from === 2 * H ? 'unknown' : 'live') });
  ok(out.last.status === 'stopped' && out.dg.outcome === 'untended' && out.last.produced.find((p) => p.materialId.startsWith('test_tile'))?.quality?.history_complete === 0,
    'an hour with unknown weather (an outage): the untended fire ends, the history is marked incomplete');
  ok(out.last.simulated.to === 2 * H && out.last.observations.some((o) => o.text === '見ていない間に火が落ちていた'), 'nothing is simulated over the unknown hour, and the resident finds the fire out');
  const first = step(base());
  const changed = step(base({ requestId: 'r-ch', interval: { from: H, to: 2 * H }, state: first.state, actions: [], lots: [TILE, wood(59)] }));
  ok(changed.status === 'failed' && String(changed.evidence.notes).startsWith('changed-input'), 'the woodpile changing under a running fire is refused');
  const gap = step(base({ requestId: 'r-gap', interval: { from: 2 * H, to: 3 * H }, state: first.state, actions: [] }));
  ok(gap.status === 'failed' && String(gap.evidence.notes).startsWith('noncontiguous'), 'a missing interval is refused (send it with unknown weather instead)');
}

console.log('5. requests that are refused');
{
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  refused('contract 0.1.0 (no drawn field)', step(base({ contract: '0.1.0' })), /unknown contract/);
  refused('a heat offer as well as the wood', step(base({ energy: [{ sourceId: 'src:heat', kind: 'heat', maxJ: 1e6 }] })), /offer no heat source/);
  refused('firewood without its moisture', step(base({ lots: [TILE, { ...wood(60), quality: {} }] })), /water_ppm/);
  refused('no hearth', step(base({ equipment: [] })), /no hearth/);
  refused('a body with organic matter', step(base({ lots: [{ ...TILE, quality: { ...TILE.quality, xd_organic_c_ppm: 10_000 } }, wood(60)] })), /organic/);
  refused('lighting a fire with unknown weather', step(base({ environment: env(0, 'unknown') })), /known weather/);
  refused('no fire plan', step(base({ actions: [] })), /fire_plan/);
  const again = step(base());
  ok(JSON.stringify(again) === JSON.stringify(step(base())), 'the same request gives the same result');
}

console.log('6. the result checker knows the 0.2.x mass rule');
{
  const req = base(), r = step(req);
  const no = { ...r } as Partial<ScienceStepResultV02>; delete no.drawn;
  ok(validateResult(req, no as ScienceStepResult).some((v) => v.includes('must carry drawn')), 'a 0.2.x result without drawn is flagged');
  const req01 = { ...req, contract: '0.1.0' };
  ok(validateResult(req01, { ...r, contract: '0.1.0' }).some((v) => v.includes('0.1.x result must not carry')), 'a 0.1.x result with drawn is flagged');
  const end = k.last, endReq = base({ requestId: end.requestId });
  const bent = { ...end, requestId: endReq.requestId, drawn: [{ ...end.drawn[0], amount: { value: end.drawn[0].amount.value + 1, unit: 'mg' as const } }] };
  ok(validateResult(endReq, bent).some((v) => v.includes('mass does not close')), 'one extra mg of O2 breaks the balance');
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation', violations.slice(0, 3).join(' / '));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
