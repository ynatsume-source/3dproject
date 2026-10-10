// Checks for the sealed vessel: p16x_vessel_tar_seal (world clock, hand work + warming fire) and
// p17x_vessel_leak_test (island clock, waiting).
// Run: npx tsx --import ./scripts/node-assets.mjs scripts/science-vessel-check.ts
import type { LotView, ScienceStepRequest, ScienceStepResult } from '../src/world/science-contract';
import { scienceStep } from '../src/science/step';
import { validateResult } from '../src/science/step/validate';
import { LEAK_TEST_PROCESS, POT_ASSEMBLY_TABLE, potQualityOnReturn, potSherdsQuality, potToEquipmentParams, readPot, TAR_SEAL_PROCESS } from '../src/science/step/vessel';

let pass = 0, fail = 0;
const ok = (c: unknown, name: string, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const H = 3600_000, D = 24 * H, W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const violations: string[] = [];
const step = (q: ScienceStepRequest) => { const r = scienceStep(q); violations.push(...validateResult(q, r).map((v) => `${q.processId}@${q.interval.from}: ${v}`)); return r; };
const sum = (xs: { amount: { value: number } }[]) => xs.reduce((s, x) => s + x.amount.value, 0);
type Drawn = { drawn?: { amount: { value: number } }[] };

// a 500 mL test pot of earthenware that takes up 12 % water
const POT = (q: Record<string, number> = {}, mg = 600_000): LotView => ({ lotId: 'lot:pot', materialId: 'fired_pot_test', amount: { value: mg, unit: 'mg' }, location: 'site:shelf',
  quality: { capacity_ml: 500, absorption_ppm: 120_000, ...q } });
const TAR = (mg = 15_000): LotView => ({ lotId: 'lot:tar', materialId: 'wood_tar', amount: { value: mg, unit: 'mg' }, location: 'eq:retort', quality: { x_wood_tar_ppm: 1_000_000 } });
const WOOD = (): LotView => ({ lotId: 'lot:wood', materialId: 'firewood', amount: { value: 2_000_000, unit: 'mg' }, location: 'site:woodpile', quality: { water_ppm: 150_000 } });
const WATER = (mg = 450_000): LotView => ({ lotId: 'lot:water', materialId: 'process_water', amount: { value: mg, unit: 'mg' }, location: 'site:jar' });
const BRUSH = { equipmentId: 'eq:brush', kind: 'fixture_tar_brush', catalogEntry: 'fixture_tar_brush', catalogVersion: 'civ-sci-test-2', condition: 1 };
const PIT = { equipmentId: 'eq:pit', kind: 'open_fire_pit', catalogEntry: 'open_fire_pit', catalogVersion: 'civ-sci-test-2', condition: 1, params: { maxBurnKgPerH: 3 } };
const STAND = (sun = 0) => ({ equipmentId: 'eq:stand', kind: 'fixture_vessel_stand', catalogEntry: 'fixture_vessel_stand', catalogVersion: 'civ-sci-test-2', condition: 1, params: { sunExposure: sun } });

const sealReq = (lots: LotView[], seal: boolean, o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.2.0', requestId: 's', world: W, runId: 'run:seal', ...TAR_SEAL_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from: 0, to: H }, state: null,
  environment: { sampleId: 'env:0', source: 'simulation', effectiveAt: 0 }, lots, equipment: lots.some((l) => l.materialId === 'firewood') ? [BRUSH, PIT] : [BRUSH],
  energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: 3600 * 20 }], seed: 1, actions: seal ? [{ at: 60_000, residentId: 'res:lantern', action: 'seal' }] : [], ...o });
const potOf = (r: ScienceStepResult, id = 'lot:pot'): LotView => { const p = r.produced.find((x) => x.materialId === 'fired_pot_test')!; return { lotId: id, materialId: p.materialId, amount: p.amount, location: 'site:shelf', quality: p.quality }; };

type Env = { t: number; rh: number; wind: number; source?: string };
const SHADE: Env = { t: 28, rh: 0.75, wind: 2 };
const leakReq = (from: number, to: number, state: ScienceStepRequest['state'], lots: LotView[], acts: [number, string][], env: Env, o: Partial<ScienceStepRequest> = {}): ScienceStepRequest => ({
  contract: '0.2.0', requestId: `l@${from}`, world: W, runId: 'run:leak', ...LEAK_TEST_PROCESS, catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
  environment: { sampleId: `env:${from}`, source: (env.source ?? 'record') as 'simulation', effectiveAt: from, airTempC: env.t, humidity: env.rh, windMs: env.wind },
  lots, equipment: [STAND()], energy: [], seed: 1, actions: acts.map(([at, action]) => ({ at, residentId: 'res:lantern', action })), ...o });
function wait(until: number, lots: LotView[], acts: [number, string][], o: Partial<ScienceStepRequest> = {}, chunk = H, env: (t: number) => Env = () => SHADE) {
  let st: ScienceStepRequest['state'] = null; const all: ScienceStepResult[] = [];
  for (let t = 0; t < until; t += chunk) {
    const end = Math.min(until, t + chunk);
    const r = step(leakReq(t, end, st, lots, acts.filter(([at]) => at >= t && at < end), env(t), o)); all.push(r); st = r.state;
    if (r.status !== 'running') break;
  }
  const last = all[all.length - 1];
  return { all, last, obs: all.flatMap((r) => r.observations) };
}
const waterLeft = (r: ReturnType<typeof wait>) => r.last.produced.find((p) => p.materialId === 'process_water')?.amount.value ?? 0;
const test3d = (pot: LotView, o: Partial<ScienceStepRequest> = {}) => wait(3 * D + H, [pot, WATER()], [[2 * D, 'look'], [3 * D, 'take_out']], o);

console.log('1. tar on a warm pot, and what it does to the water');
const warmSeal = step(sealReq([POT(), TAR(), WOOD()], false));
const coldSeal = step(sealReq([POT(), TAR()], false));
const warmPot = potOf(warmSeal), coldPot = potOf(coldSeal);
{
  ok(warmSeal.status === 'completed' && warmSeal.simulated.to === 900_000 && sum(warmSeal.consumed) + sum((warmSeal as Drawn).drawn ?? []) === sum(warmSeal.produced) + sum(warmSeal.released),
    'brushing tar on, warmed at the fire: 15 minutes of hand work; pot + tar + wood (+ O2) = tarred pot + wood left + ash + smoke');
  ok(warmPot.amount.value === 615_000 && warmPot.quality!.x_wood_tar_ppm! > 0, 'the tar goes onto the pot: it is 15 g heavier');
  ok(warmPot.quality!.coverage_ppm! > 900_000 && coldPot.quality!.coverage_ppm! < 650_000 && /しみこみ/.test(warmSeal.observations[0].text ?? '') && /乗っているだけ/.test(coldSeal.observations[0].text ?? ''),
    'warm tar runs into the pores; cold tar only sits on top', `covered ${warmPot.quality!.coverage_ppm} vs ${coldPot.quality!.coverage_ppm} ppm`);
  const raw = test3d(POT()), warm = test3d(warmPot), cold = test3d(coldPot);
  const lost = (r: ReturnType<typeof wait>) => 450_000 - waterLeft(r);
  ok(lost(raw) > 80_000 && /はっきり減って/.test(raw.obs.at(-1)?.text ?? '') && /しっとり/.test(raw.obs.find((o) => o.quantity === 'pot')?.text ?? ''),
    'an untarred pot of water: the outside is damp and cool, and the water clearly goes down in three days', `${(lost(raw) / 1000).toFixed(0)} g gone`);
  ok(lost(warm) < lost(cold) && lost(cold) < lost(raw) && /乾いて|少し湿って/.test(warm.obs.find((o) => o.quantity === 'pot')?.text ?? ''),
    'tarred warm, it keeps its water best; tarred cold, in between', `${(lost(raw) / 1000).toFixed(0)} / ${(lost(cold) / 1000).toFixed(0)} / ${(lost(warm) / 1000).toFixed(0)} g`);
  ok([raw, warm, cold].every((r) => sum(r.last.consumed) === sum(r.last.produced) + sum(r.last.released)), 'pot + water = pot (with the water its walls took up) + water left + vapour');
  const dry = wait(3 * D + H, [POT(), WATER()], [[3 * D, 'take_out']], {}, H, () => ({ t: 28, rh: 0.95, wind: 0 }));
  ok(lost(dry) < lost(raw), 'in damp, still air less water seeps away', `${(lost(dry) / 1000).toFixed(0)} g`);
}

console.log('2. stopping the mouth');
{
  const plugOnly = potOf(step(sealReq([POT(), TAR(5_000)], true)));
  const once = potOf(step(sealReq([POT(), TAR(), WOOD()], true)));
  const twice = potOf(step(sealReq([warmPot, { ...TAR(), lotId: 'lot:tar2' }, WOOD()], true)));
  ok(plugOnly.quality!.sealed === 1 && warmPot.quality!.sealed === 0 && warmPot.quality!.air_leak_tau_min === 0, 'stopped with a plug and tar; not stopped, the pot holds no air (0: not usable as a bulb)');
  const sub = step(leakReq(0, H, null, [plugOnly], [[60_000, 'submerge']], SHADE));
  ok(sub.status === 'failed' && /held back/.test(String(sub.evidence.notes)), 'holding it under water (submerge) is held back until air, pressure and water let in are modelled (Codex A4)', String(sub.evidence.notes));
  ok(twice.quality!.air_leak_tau_min! > once.quality!.air_leak_tau_min! && once.quality!.air_leak_tau_min! > plugOnly.quality!.air_leak_tau_min!,
    'the pot carries how long it holds its air (for the world: a barometer bulb made from it)', `${plugOnly.quality!.air_leak_tau_min} / ${once.quality!.air_leak_tau_min} / ${twice.quality!.air_leak_tau_min} min`);
  ok(step(sealReq([twice, { ...TAR(), lotId: 'lot:tar3' }], false)).status === 'failed', 'a stopped pot is not tarred inside again (open it first)');
  const thin = step(sealReq([POT(), TAR(3_000)], true));
  ok(potOf(thin).quality!.sealed === 0 && /ふさぎきれなかった/.test(thin.observations.map((o) => o.text).join()), 'too little tar to stop the mouth: it stays open');
}

console.log('3. sun and heat');
{
  const sunny = wait(3 * D + H, [warmPot, WATER()], [[2 * D, 'look'], [3 * D, 'take_out']], { equipment: [STAND(1)] }, H, () => ({ t: 33, rh: 0.7, wind: 2 }));
  const back = potOf(sunny.last);
  ok(back.quality!.coverage_ppm! < warmPot.quality!.coverage_ppm! && sunny.obs.some((o) => /垂れて/.test(o.text ?? '')), 'in the sun the tar softens and runs: less of the pot stays covered',
    `${warmPot.quality!.coverage_ppm} → ${back.quality!.coverage_ppm} ppm`);
}

console.log('4. pieces, outages, the pot handed on');
{
  const key = (r: ReturnType<typeof wait>) => JSON.stringify([r.last.produced, r.last.released, r.obs, r.last.state]);
  const acts: [number, string][] = [[D + 7 * 60_000 + 13_000, 'look'], [2 * D + 1_000, 'look'], [3 * D + 17_000, 'take_out']];
  const a = wait(3 * D + H, [coldPot, WATER()], acts, {}, H), b = wait(3 * D + H, [coldPot, WATER()], acts, {}, 30_000), c = wait(3 * D + H, [coldPot, WATER()], acts, {}, 3 * H);
  ok(key(a) === key(b) && key(a) === key(c), '1 h = 30 s = 3 h pieces (actions between the grid points): the same water, pot and words');
  const gap = wait(2 * D, [POT(), WATER()], [[2 * D - 30_000, 'take_out']], {}, H, (t) => (t >= 10 * H && t < 20 * H ? { ...SHADE, source: 'unknown' } : SHADE));
  const ref = wait(2 * D, [POT(), WATER()], [[2 * D - 30_000, 'take_out']]);
  ok(waterLeft(gap) > waterLeft(ref) && gap.last.produced.every((p) => p.quality?.history_complete === 0), 'hours of unknown weather: nothing seeps in them (nothing invented), the history is incomplete');
  const raw = test3d(POT());
  let reread = false; try { reread = readPot(potOf(raw.last)).water > 0; } catch { reread = false; }
  const again = test3d(potOf(raw.last));
  ok(reread && again.last.status === 'completed', 'the pot handed back (its walls still holding water) goes into the next test');
  const v1 = scienceStep({ ...leakReq(0, H, null, [POT(), WATER()], [[H - 30_000, 'take_out']], SHADE), contract: '0.1.0' });
  const v2 = scienceStep(leakReq(0, H, null, [POT(), WATER()], [[H - 30_000, 'take_out']], SHADE));
  const { contract: _a, ...b1 } = v1; const { contract: _b, drawn: _c, ...b2 } = v2 as typeof v2 & { drawn: unknown };
  ok(JSON.stringify(b1) === JSON.stringify(b2), 'the leak test: contract 0.1.0 and 0.2.0 give the same answer');
}

console.log('6. assembly (ADR 0006): a pot lot becomes equipment and back');
{
  const sealed = potOf(step(sealReq([warmPot, { ...TAR(), lotId: 'lot:tar4' }, WOOD()], true)));
  const params = potToEquipmentParams(sealed);
  ok(params.capacityMl === 500 && params.sealed === 1 && params.airtightKnown === 1 && params.airLeakTauMin === sealed.quality!.air_leak_tau_min && params.crackPpm === 0 && POT_ASSEMBLY_TABLE === 'civ-sci.pot-assembly/4',
    'a sealed pot lot gives the equipment its capacity and how long it holds its air (table civ-sci.pot-assembly/4)', JSON.stringify(params));
  const whole = potQualityOnReturn(sealed.quality!, 1);
  ok(JSON.stringify(whole) === JSON.stringify(sealed.quality), 'back whole (condition 1): the lot is as it was');
  const worn = potQualityOnReturn(sealed.quality!, 0.9);
  ok(worn.sealed === 1 && worn.airtight_known === 0 && worn.air_leak_tau_min === undefined && worn.crack_ppm === 100_000 && worn.coverage_ppm === sealed.quality!.coverage_ppm,
    'back worn (condition 0.9): still stopped (nobody opened it), only its air-holding is no longer known; a crack index of 10 % added', JSON.stringify(worn));
  const twiceWorn = potQualityOnReturn({ ...worn, crack_ppm: 120_000 }, 0.97);
  ok(twiceWorn.crack_ppm === 150_000 && potQualityOnReturn({ ...worn, crack_ppm: 990_000 }, 0.5).crack_ppm === 1_000_000, 'the crack index adds up over uses and is capped at 1,000,000');
  // Codex A6: really sealed → assembled → worn → back to a lot → fill / look / tar again: it is not taken for an open pot
  const wornLot: LotView = { ...sealed, lotId: 'lot:worn', quality: worn };
  const wp = potToEquipmentParams(wornLot);
  ok(readPot(wornLot).sealed && !readPot(wornLot).airtightKnown && wp.sealed === 1 && wp.airtightKnown === 0 && wp.airLeakTauMin === 0, 'read back: stopped, air-holding not known (params airLeakTauMin 0: not usable as a bulb)', JSON.stringify(wp));
  ok(/cannot be filled/.test(String(step(leakReq(0, H, null, [wornLot, WATER()], [], SHADE)).evidence.notes)), 'the worn stopped pot cannot be filled (the plug is still in)');
  ok(/held back/.test(String(step(leakReq(0, H, null, [wornLot], [[60_000, 'submerge']], SHADE)).evidence.notes)), 'nor held under water to guess at its air');
  ok(/already stopped/.test(String(step(sealReq([wornLot, { ...TAR(), lotId: 'lot:tar6' }], true)).evidence.notes)), 'nor tarred inside again (it is stopped: opening is a step of its own)');
  const stood = wait(D, [wornLot], [[D - 30_000, 'take_out']]);
  const stoodQ = potOf(stood.last).quality!;
  ok(stood.last.status === 'completed' && stoodQ.sealed === 1 && stoodQ.airtight_known === 0 && stoodQ.air_leak_tau_min === undefined, 'stood empty for a day it stays stopped and not known', JSON.stringify(stoodQ));
  // an open pot that was worn: its crack lets water through, and tar does not close it
  const wornOpen: LotView = { ...warmPot, lotId: 'lot:worn-open', quality: potQualityOnReturn(warmPot.quality!, 0.9) };
  ok(wornOpen.quality!.sealed === 0 && wornOpen.quality!.airtight_known === undefined, 'an open pot comes back open');
  const cracked = test3d(wornOpen), sound = test3d(warmPot);
  ok(450_000 - waterLeft(cracked) > 3 * (450_000 - waterLeft(sound)) && readPot(potOf(cracked.last)).crack === 0.1, 'the leak test shows the crack: much more water lost than from the sound pot, and the crack stays with the pot',
    `${((450_000 - waterLeft(cracked)) / 1000).toFixed(0)} g vs ${((450_000 - waterLeft(sound)) / 1000).toFixed(0)} g`);
  const resealed = potOf(step(sealReq([wornOpen, { ...TAR(20_000), lotId: 'lot:tar5' }], true)));
  ok(resealed.quality!.sealed === 1 && resealed.quality!.air_leak_tau_min! < sealed.quality!.air_leak_tau_min! / 10, 'stopped, the cracked pot holds its air far less long: tar inside does not close a crack',
    `${resealed.quality!.air_leak_tau_min} vs ${sealed.quality!.air_leak_tau_min} min`);
  const sherds = potSherdsQuality(sealed.quality!);
  ok(sherds.absorption_ppm === 120_000 && sherds.x_wood_tar_ppm === sealed.quality!.x_wood_tar_ppm && sherds.capacity_ml === undefined && sherds.sealed === undefined,
    'broken: the sherds (same mass, by main) keep what the body was and the tar it carried, nothing of the pot', JSON.stringify(sherds));
}

console.log('7. fixes from the vessel review (Codex e6668fb A1–A5, C1)');
{
  const tarAt = (to: number, at?: number) => step(sealReq([POT(), TAR()], false, { interval: { from: 0, to }, energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: (to / 1000) * 20 }],
    actions: at === undefined ? [] : [{ at, residentId: 'res:lantern', action: 'seal' }] }));
  const late = tarAt(H, 20 * 60_000), split = tarAt(15 * 60_000), atEnd = tarAt(H, 15 * 60_000), before = tarAt(H, 14 * 60_000);
  ok(JSON.stringify(late.produced) === JSON.stringify(split.produced) && late.produced[0].quality!.sealed === 0 && atEnd.produced[0].quality!.sealed === 0 && before.produced[0].quality!.sealed === 1,
    'A1: a seal after the work is done (20 min, or at the 15-minute end) is never reached; one at 14 min is', `${late.produced[0].quality!.sealed}/${atEnd.produced[0].quality!.sealed}/${before.produced[0].quality!.sealed}`);
  // A2: a look between grid points sees its own time. Find when 1 g of water is gone in 1-second pieces, read just before
  let st: ScienceStepRequest['state'] = null, gone = 0;
  for (let t = 0; t < 10 * 60_000 && !gone; t += 1000) {
    const r = step(leakReq(t, t + 1000, st, [POT(), WATER(1000)], [], SHADE)); st = r.state;
    if ((r.diagnostics as { waterInMg: number }).waterInMg === 0) gone = t + 1000;
  }
  const at = gone - 1000;
  const lookOf = (chunk: number) => wait(10 * 60_000, [POT(), WATER(1000)], [[at, 'look']], {}, chunk).obs.find((o) => o.quantity === 'pot')?.text;
  ok(gone > 0 && at % 30_000 !== 0 && lookOf(10 * 60_000) === lookOf(1000), 'A2: a look between grid points reads the state at its own time (one piece = 1-second pieces)', `${at / 1000} s: ${lookOf(10 * 60_000)}`);
  const settle = (r: ReturnType<typeof wait>) => JSON.stringify([r.last.produced, r.last.released, r.all.map((x) => x.energy)]);
  const looks: [number, string][] = Array.from({ length: 72 }, (_, i) => [i * H + 17_000, 'look']);
  ok(settle(wait(3 * D, [POT(), WATER()], looks)) === settle(wait(3 * D, [POT(), WATER()], [])), 'A2: 72 looks between grid points change nothing in the settlement');
  // A3: the wet pot handed back dries with no water in it, and goes into the next test
  const wetPot = potOf(test3d(POT()).last);
  const sunDry = (o: Partial<ScienceStepRequest>) => wait(7 * D, [wetPot], [[6 * D, 'look'], [7 * D - 30_000, 'take_out']], { equipment: [STAND(1)], ...o }, H, () => ({ t: 33, rh: 0.4, wind: 2 }));
  const dried = sunDry({}), heat = dried.all.reduce((s, r) => s + r.energy.reduce((x, e) => x + e.usedJ, 0), 0);
  const w0 = readPot(wetPot).water, w1 = readPot(potOf(dried.last)).water;
  ok(w0 > 50_000 && w1 < w0 / 10 && sum(dried.last.released) === w0 - (dried.last.produced[0].amount.value - (wetPot.amount.value - w0)) && heat > 0 && sum(dried.last.consumed) === sum(dried.last.produced) + sum(dried.last.released),
    'A3: the wet pot dries with no water in it: its walls give their water to the air (and take the heat)', `${(w0 / 1000).toFixed(1)} → ${(w1 / 1000).toFixed(1)} g, ${heat} J`);
  const early = wait(H, [wetPot], [[60_000, 'look']], { equipment: [STAND(1)] }, H, () => ({ t: 33, rh: 0.4, wind: 2 })).obs[0]?.text ?? '';
  ok(/湿って|濡れて/.test(early) && /乾いて/.test(dried.obs[0]?.text ?? ''), 'A3: just emptied the outside is still damp; after six days in the sun it is dry', `${early} / ${dried.obs[0]?.text}`);
  ok(test3d(potOf(dried.last)).last.status === 'completed', 'A3: the dried pot is filled again');
  // A5: unknown weather never becomes an observation, nor does a decrease that could not be computed
  const allUnknown = wait(3 * D, [POT(), WATER()], [[D, 'look']], { stop: undefined }, H, () => ({ ...SHADE, source: 'unknown' }));
  const stopAll = step(leakReq(3 * D, 3 * D + H, allUnknown.last.state, [POT(), WATER()], [], { ...SHADE, source: 'unknown' }, { stop: 'operator' }));
  ok(allUnknown.obs.length === 0 && stopAll.observations.length === 0 && stopAll.produced.every((p) => p.quality?.history_complete === 0), 'A5: three days all unknown: nothing seen, not even how much water is left at the end');
  const gapThenKnown = wait(2 * D, [POT(), WATER()], [[30 * H, 'look'], [2 * D - 30_000, 'take_out']], {}, H, (t) => (t >= 10 * H && t < 20 * H ? { ...SHADE, source: 'unknown' } : SHADE));
  ok(gapThenKnown.obs.length === 0 && gapThenKnown.last.status === 'completed', 'A5: after an unknown stretch the run tells nothing more (take it out and set it up again to observe)');
  // C1: firewood that cannot burn (all water) does not warm, and comes back as it was
  const soaked: LotView = { ...WOOD(), amount: { value: 300_000, unit: 'mg' }, quality: { water_ppm: 1_000_000 } };
  const c1 = step(sealReq([POT(), TAR(), soaked], false));
  ok(c1.status === 'completed' && c1.released.length === 0 && c1.produced.find((p) => p.materialId === 'firewood')?.amount.value === 300_000 && /乗っているだけ/.test(c1.observations[0].text ?? ''),
    'C1: wood that is all water does not burn: no steam, no heat, the wood back, the tar cold');
}

console.log('5. requests that are refused');
{
  const refused = (name: string, r: ScienceStepResult, why: RegExp) => ok(r.status === 'failed' && why.test(String(r.evidence.notes)), name, String(r.evidence.notes));
  refused('a pot without its capacity', step(sealReq([{ ...POT(), quality: { absorption_ppm: 120_000 } }, TAR()], false)), /capacity_ml/);
  refused('no brush', step(sealReq([POT(), TAR()], false, { equipment: [] })), /fixture_tar_brush/);
  refused('warming without a fire pit', step(sealReq([POT(), TAR(), WOOD()], false, { equipment: [BRUSH] })), /open_fire_pit/);
  refused('tarring under contract 0.1.x', step({ ...sealReq([POT(), TAR()], false), contract: '0.1.0' }), /unknown contract/);
  refused('more water than the pot holds', step(leakReq(0, H, null, [POT(), WATER(600_000)], [], SHADE)), /does not fit/);
  const stopped = potOf(step(sealReq([POT(), TAR(20_000)], true)));
  refused('filling a stopped pot', step(leakReq(0, H, null, [stopped, WATER()], [], SHADE)), /cannot be filled/);
  refused('no stand', step(leakReq(0, H, null, [POT(), WATER()], [], SHADE, { equipment: [] })), /fixture_vessel_stand/);
  refused('an unknown action', step(leakReq(0, H, null, [POT(), WATER()], [[0, 'shake']], SHADE)), /unknown action/);
  const s0 = step(leakReq(0, H, null, [POT(), WATER()], [], SHADE));
  refused('the stand changed under the run', step(leakReq(H, 2 * H, s0.state, [POT(), WATER()], [], SHADE, { equipment: [STAND(1)] })), /changed-input/);
  refused('a missing interval', step(leakReq(2 * H, 3 * H, s0.state, [POT(), WATER()], [], SHADE)), /noncontiguous/);
  refused('a leak-test state from 0.1.0 (schema /1: no wall drying, sealed meant something else)', step(leakReq(H, 2 * H, { schema: 'civ-sci.vessel-leak/1', data: s0.state!.data }, [POT(), WATER()], [], SHADE)), /unsupported-state-schema/);
  refused('a tar-seal state from 0.1.0 (schema /1: seal taken ahead of time)', step(sealReq([POT(), TAR()], false, { state: { schema: 'civ-sci.vessel-seal/1', data: {} } })), /unsupported-state-schema/);
}

console.log('9. a missing wind (p17x 0.1.2)');
{
  const acts: [number, string][] = [[2 * D, 'look'], [3 * D, 'take_out']];
  const key = (r: ReturnType<typeof wait>) => JSON.stringify([r.last.produced, r.last.released, r.obs]);
  const gapEnv = (e: Env) => (t: number) => (t >= D && t < D + 6 * H ? e : SHADE);
  const noWind = wait(3 * D + H, [POT(), WATER()], acts, {}, H, gapEnv({ ...SHADE, wind: undefined } as unknown as Env));
  const unknown = wait(3 * D + H, [POT(), WATER()], acts, {}, H, gapEnv({ ...SHADE, source: 'unknown' }));
  const calm = wait(3 * D + H, [POT(), WATER()], acts, {}, H, gapEnv({ ...SHADE, wind: 0 }));
  ok(key(noWind) === key(unknown) && key(calm) !== key(unknown), 'a missing wind is unknown weather for the pot (nothing computed, history incomplete); wind 0 is calm');
}

console.log('—   every result above passed the contract checker');
ok(violations.length === 0, 'validateResult: no violation', violations.slice(0, 3).join(' / '));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
