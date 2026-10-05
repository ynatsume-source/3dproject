// ScienceStep for charcoal and wood tar in a double-pot retort (p14x_charcoal_tar_retort), contract 0.2.x only (the
// fire draws O2). Waiting by the fire: on the island clock.
//
// A fired pot packed with wood (the charge) sits mouth down, its holes over a second pot buried in the ground; a wood
// fire burns around the upper pot. The charge cannot burn (no air reaches it): it dries, then above about 200 °C it
// breaks down into charcoal, tar, water and gas. What drips down is caught in the lower pot (collectShare of it); the
// rest leaves as smoke. The lower the temperature the charge broke down at, the more charcoal and the less finished it
// is; left too cool, the core stays wood. Open the retort while it is still hot and the charcoal catches fire in the air.
//
// Lots: the charge (firewood, coconut_shell or coconut_husk) lies IN the retort: its location is the retort's
// equipmentId. The fuel is a firewood lot anywhere else. Actions: fire_level {level 0 low, 1 medium, 2 high},
// put_out (stop feeding the fire; the retort cools in place), look (smoke, smell, the lower pot, the warmth), open
// (take everything out: the end). The world settles once, at open (or a stop at interval.to, which opens it too).
// Looking never touches the retort; it is integrated on a fixed 0.25 s grid from the run's start (as the coconut pot).
// Heat: usedJ is the fuel's dry wood (and charcoal that burns on opening), storedJ the warmth the retort and charge hold
// above where they started (negative while they cool, zero at the end), the rest lost.
// 0.1.1 (Codex A1, B1, C1, C2 on 5555989): only an explicit open, an operator stop (the resident takes it out) or a
// lost retort lets air at the charcoal; an interval of unknown weather stops the run with the pot still closed (the
// contents as they were at the last known moment, nothing burnt, history incomplete). Charcoal that is not finished
// (wood left in it) goes back into the retort and keeps the charcoal it already has. Exactly one lot lies in the
// retort; the fuel lies elsewhere. The retort and the fire pit may not change under a running run.
// Every constant is assumed (params.ts). Not modelled either: charcoal losing more volatiles when heated again
// after it formed (its yield is fixed by the temperature it formed at). Not modelled: the heat of the breakdown itself, cracks letting air in, tar
// re-cracking at high temperature, the size of the pieces, the acids in the wood vinegar (it is kept as water).

import type { Observation, ScienceStepRequest } from '../../world/science-contract';
import { addComp, react, REACTIONS, totalMg, type Composition } from '../chem';
import { pv } from '../params';
import { fuelLhvJPerMg } from '../physics';
import { allFinite, checkCommon, envUsable, failed, fingerprint, finite, intDeltaFloor, subStepEnd } from './common';
import { foodQuality } from './coconut';
import { fuelComp, type ScienceStepResultV02 } from './wood-fire';

export const CHARCOAL_PROCESS = { processId: 'p14x_charcoal_tar_retort', processVersion: '0.1.2' } as const; // 0.1.2: equipment fingerprint independent of params key order (Codex C3)
// /2 since 0.1.1 (the charcoal already in a charge, the equipment's identity): a /1 run is refused; the host cancels it
const SCHEMA = 'civ-sci.charcoal-retort/2', EVAL = 'charcoal-retort-eval/0.1.2';
const RETORT = 'fixture_tar_retort', HEARTH = 'open_fire_pit';
const CHARGES = ['firewood', 'coconut_shell', 'coconut_husk', 'charcoal'];
const COAL = ['char', 'wood_dry', 'ash', 'water'] as const;
const FINE_MS = 250;
const FIRE_KG_PER_H = [0.4, 0.8, 1.6] as const;
const CP = { wood: 1.5, char: 1.0, water: 4.18, ash: 0.8 } as const; // J/(g·K), assumed
const BULK_G_PER_ML = 0.4; // stacked pieces in the pot, for its capacity only (assumed)

interface RetortData {
  chargeId: string; chargeMaterial: string; chargeFp: string; eqFp: string; char0: number; charredC0: number; fuelId: string; fuelFp: string; location: string; fuelLocation: string;
  retort: { heatCapJPerK: number; uaWPerK: number; heatShare: number; collectShare: number }; maxBurnKgPerH: number;
  startMs: number; lastTo: number; level: number; fireOut: boolean;
  charge0: Composition; woodF: number; waterF: number; evapF: number; charF: number; pyroF: number; tarF: number; tarCollF: number; vinF: number; vinCollF: number;
  tC: number; refC: number; maxC: number;
  fuel: Composition; burnedMg: number; cumUsedJ: number; reportedUsed: number; reportedStored: number;
  outcome: 'running' | 'fuel_exhausted'; historyComplete: boolean;
}

const pyroRate = (tC: number) => (tC < 200 ? 0 : Math.pow(2, (tC - pv('pyroRefC')) / 15) / pv('pyroTauRefS'));
const charYield = (tC: number) => {
  const lo = pv('charYieldLowT'), hi = pv('charYieldHighT'), f = Math.min(1, Math.max(0, (tC - 300) / 250));
  return lo + (hi - lo) * f;
};

export function charcoalStep(req: ScienceStepRequest): ScienceStepResultV02 {
  const fail = (why: string) => failed(req, EVAL, why, SCHEMA) as ScienceStepResultV02;
  const bad = checkCommon(req, CHARCOAL_PROCESS.processId, CHARCOAL_PROCESS.processVersion, SCHEMA, /^0\.2\.\d+$/);
  if (bad) return fail(bad);
  if (req.energy.length) return fail('the fire burns its reserved firewood: offer no heat source as well (never count the same fire twice)');
  for (const a of req.actions) {
    if (!['fire_level', 'put_out', 'look', 'open'].includes(a.action)) return fail(`unknown action ${a.action} (fire_level, put_out, look, open)`);
    if (!(a.at >= req.interval.from && a.at < req.interval.to)) return fail(`${a.action} must fall inside the interval`);
    if (a.action === 'fire_level' && ![0, 1, 2].includes(a.params?.level as number)) return fail('fire_level needs params.level 0 (low), 1 (medium) or 2 (high)');
  }
  const retort = req.equipment.find((e) => e.kind === RETORT), hearth = req.equipment.find((e) => e.kind === HEARTH);

  if (req.state === null && (!retort || !hearth)) return fail(`needs a ${RETORT} on an ${HEARTH}`);
  let d: RetortData;
  const prev = req.state?.data as RetortData | undefined;
  const inRetort = (l: ScienceStepRequest['lots'][number]) => (prev ? l.location === prev.location : retort !== undefined && l.location === retort.equipmentId);
  const charge = prev ? req.lots.find((l) => l.lotId === prev.chargeId) : req.lots.find((l) => CHARGES.includes(l.materialId) && inRetort(l));
  const fuel = req.lots.find((l) => l !== charge && l.materialId === 'firewood');
  // exactly one lot in the retort (the charge), the fuel outside it (Codex C2): otherwise which is which is not known
  if (!charge || !fuel || req.lots.length !== 2 || req.lots.filter(inRetort).length !== 1 || inRetort(fuel)) {
    return fail(`expected two lots: the charge in the retort (firewood, coconut_shell, coconut_husk or unfinished charcoal whose location is the ${RETORT}'s equipmentId) and a firewood lot for the fire, outside it`);
  }
  const eqFp = equipmentFp([retort?.equipmentId, retort?.params, hearth?.equipmentId, hearth?.params]);
  if (req.state === null) {
    if (!retort || !hearth) return fail(`needs a ${RETORT} on an ${HEARTH}`);
    const rp = retort.params ?? {};
    if (!finite(rp.heatCapJPerK, 1e-9) || !finite(rp.uaWPerK, 0) || !finite(rp.heatShare, 0, 1) || !finite(rp.capacityMl, 1) || !finite(rp.collectShare ?? 0.6, 0, 1)) {
      return fail(`${RETORT} needs params heatCapJPerK > 0, uaWPerK ≥ 0, heatShare 0..1, capacityMl > 0, collectShare 0..1 (optional)`);
    }
    if (!finite(hearth.params?.maxBurnKgPerH, 0)) return fail(`${HEARTH} params.maxBurnKgPerH must be finite and ≥ 0`);
    const cc = charge.materialId === 'charcoal' ? readCoal(charge) : fuelComp(charge), fc = fuelComp(fuel);
    if (typeof cc === 'string') return fail(cc);
    if (typeof fc === 'string') return fail(fc);
    if (charge.amount.value / 1000 / BULK_G_PER_ML > rp.capacityMl) return fail('the charge does not fit in the retort');
    if (!envUsable(req)) return fail(`a fire is lit only with known weather (environment ${req.environment.source})`);
    const first = req.actions.filter((a) => a.action === 'fire_level').sort((x, y) => x.at - y.at)[0];
    const Ta = req.environment.airTempC!;
    d = { chargeId: charge.lotId, chargeMaterial: charge.materialId, chargeFp: fingerprint(charge), eqFp, char0: cc.char ?? 0, charredC0: charge.quality?.charred_c ?? 0, fuelId: fuel.lotId, fuelFp: fingerprint(fuel),
      location: charge.location, fuelLocation: fuel.location,
      retort: { heatCapJPerK: rp.heatCapJPerK, uaWPerK: rp.uaWPerK, heatShare: rp.heatShare, collectShare: rp.collectShare ?? 0.6 }, maxBurnKgPerH: hearth.params!.maxBurnKgPerH,
      startMs: req.interval.from, lastTo: req.interval.from, level: first?.at === req.interval.from ? (first.params!.level as number) : 1, fireOut: false,
      charge0: cc, woodF: cc.wood_dry ?? 0, waterF: cc.water ?? 0, evapF: 0, charF: cc.char ?? 0, pyroF: 0, tarF: 0, tarCollF: 0, vinF: 0, vinCollF: 0,
      tC: Ta, refC: Ta, maxC: Ta, fuel: fc, burnedMg: 0, cumUsedJ: 0, reportedUsed: 0, reportedStored: 0, outcome: 'running',
      historyComplete: (charge.quality?.history_complete ?? 1) === 1 && (fuel.quality?.history_complete ?? 1) === 1 };
  } else {
    d = structuredClone(req.state.data as RetortData);
    if (d.chargeFp !== fingerprint(charge) || d.fuelFp !== fingerprint(fuel)) return fail('changed-input: a reserved lot changed under a running run');
    // the retort and the fire may only disappear with a stop that says so (Codex C1)
    if (req.stop !== 'equipment-lost' && eqFp !== d.eqFp) return fail('changed-input: the retort or the fire pit changed under a running run (send stop equipment-lost when one is lost)');
    if (req.interval.from !== d.lastTo) return fail(`noncontiguous-interval: expected from=${d.lastTo}`);
  }

  const known = envUsable(req);
  const openAt = req.actions.filter((a) => a.action === 'open').map((a) => a.at).sort((x, y) => x - y)[0];
  const endAt = !known ? req.interval.from : openAt ?? req.interval.to;
  const physical = req.actions.filter((a) => (a.action === 'fire_level' || a.action === 'put_out') && a.at < endAt).sort((x, y) => x.at - y.at);
  const looks = req.actions.filter((a) => a.action === 'look' && a.at < endAt).map((a) => a.at).sort((x, y) => x - y);
  const fuelTotal = totalMg(d.fuel), lhv = fuelLhvJPerMg(d.fuel), dryShare = (d.fuel.wood_dry ?? 0) / fuelTotal;
  const wood0 = d.charge0.wood_dry ?? 0, ash = d.charge0.ash ?? 0;
  const heldJ = () => (d.retort.heatCapJPerK + (CP.wood * d.woodF + CP.char * d.charF + CP.water * d.waterF + CP.ash * ash) / 1000) * (d.tC - d.refC);
  const observations: Observation[] = [];
  const look = (at: number) => {
    const o = (channel: Observation['channel'], quantity: string, text: string) => observations.push({ at, channel, quantity, text });
    const left = wood0 > 0 ? d.woodF / wood0 : 0;
    if (d.fireOut) o('touch', 'retort', d.tC < 60 ? '器は冷えている' : '火は消えているが、器はまだ熱い');
    if (d.waterF > 0 && d.tC >= 95) o('sight', 'smoke', '穴から白い湯気が出ている');
    else if (d.tC >= 200 && left > 0.05) { o('sight', 'smoke', '黄色っぽい濃い煙が出ている'); o('smell', 'smoke', 'いぶした、酸っぱいにおい'); }
    else if (d.tC >= 200) o('sight', 'smoke', '煙が細く、青っぽく澄んできた');
    else if (d.waterF <= 0 && d.tC >= 100) o('sight', 'smoke', '湯気が止まり、煙はまだ出ない');
    else if (!d.fireOut) o('sight', 'retort', '器が温まってきた');
    if (wood0 > 0 && d.tarCollF > 0.01 * wood0) o('sight', 'pot', '下の壺に黒い液がたまってきた');
  };

  let t = d.lastTo, kp = 0, ko = 0;
  if (known) {
    const Ta = req.environment.airTempC!, latent = pv('latentHeatWater100') / 1e6;
    while (t < endAt) {
      for (; kp < physical.length && physical[kp].at <= t; kp++) {
        if (physical[kp].action === 'put_out') d.fireOut = true; else { d.level = physical[kp].params!.level as number; d.fireOut = false; }
      }
      const tEnd = Math.min(subStepEnd(t, d.startMs, FINE_MS, endAt), kp < physical.length ? physical[kp].at : Infinity);
      for (; ko < looks.length && looks[ko] < tEnd; ko++) look(looks[ko]); // sees the retort as at the step's start
      const dt = (tEnd - t) / 1000;
      const feedKgS = !d.fireOut && lhv > 0 ? Math.min(FIRE_KG_PER_H[d.level], d.maxBurnKgPerH) / 3600 : 0;
      const burn = Math.min(feedKgS * dt * 1e6, fuelTotal - d.burnedMg);
      if (!d.fireOut && fuelTotal - d.burnedMg < 1 && d.outcome === 'running') d.outcome = 'fuel_exhausted';
      d.burnedMg += burn; d.cumUsedJ += burn * dryShare * (pv('woodLhvDry') / 1e6);
      const t0 = d.tC;
      let heat = burn * lhv * d.retort.heatShare - d.retort.uaWPerK * (d.tC - Ta) * dt;
      const C = d.retort.heatCapJPerK + (CP.wood * d.woodF + CP.char * d.charF + CP.water * d.waterF + CP.ash * ash) / 1000;
      if (d.waterF > 0) {
        // the charge dries first: up to 100 °C, then the heat boils its water off
        const toBoil = Math.max(0, (100 - d.tC) * C);
        if (heat <= toBoil) d.tC += heat / C;
        else { d.tC = 100; heat -= toBoil; const e = Math.min(d.waterF, heat / latent); d.waterF -= e; d.evapF += e; heat -= e * latent; d.tC += heat / C; }
      } else d.tC += heat / C;
      const tMid = (t0 + d.tC) / 2;
      d.maxC = Math.max(d.maxC, d.tC);
      // the dry wood breaks down: charcoal (more of it, the cooler), tar, water, gas
      const dW = d.woodF * (1 - Math.exp(-pyroRate(tMid) * dt));
      if (dW > 0) {
        d.woodF -= dW; d.pyroF += dW; d.charF += charYield(tMid) * dW;
        d.tarF += pv('tarYield') * dW; d.tarCollF += pv('tarYield') * d.retort.collectShare * dW;
        d.vinF += pv('pyroWaterYield') * dW; d.vinCollF += pv('pyroWaterYield') * d.retort.collectShare * dW;
      }
      t = tEnd;
    }
    for (; ko < looks.length; ko++) look(looks[ko]);
  } else d.historyComplete = false;
  d.lastTo = endAt;
  if (!allFinite(d)) return fail('non-finite state: refusing to return it');
  const ending = !known || openAt !== undefined || req.stop === 'operator' || req.stop === 'equipment-lost';

  // settle (at the end only): whole mg of what the charge became
  let burnChar = 0, charLeft = 0;
  const s: { [k: string]: number } = {};
  if (ending) {
    const evap = Math.min(d.charge0.water ?? 0, Math.floor(d.evapF + 1e-6));
    const woodLeft = Math.min(wood0, Math.round(d.woodF)), P = wood0 - woodLeft;
    let charInt = Math.floor(d.charF), tarAll = Math.floor(d.tarF), tarColl = Math.min(tarAll, Math.floor(d.tarCollF));
    const vinAll = Math.floor(d.vinF), vinColl = Math.min(vinAll, Math.floor(d.vinCollF));
    let gas = P - (charInt - d.char0) - tarAll - vinAll;
    if (gas < 0) { charInt = Math.max(d.char0, charInt + gas); gas = Math.max(0, P - (charInt - d.char0) - tarAll - vinAll); } // only with a few mg broken down: the rounding comes out of the charcoal
    // opened hot, the charcoal catches fire in the air: only when it is opened (open, the operator taking it out) or
    // the retort is lost. Unknown weather opens nothing: the pot stays closed (Codex A1)
    const opened = known && (openAt !== undefined || req.stop === 'operator' || req.stop === 'equipment-lost');
    const hot = opened ? d.tC - pv('charIgniteC') : 0;
    burnChar = hot > 0 ? Math.floor(charInt * Math.min(0.6, 0.2 + hot / 500)) : 0;
    charLeft = charInt - burnChar;
    Object.assign(s, { evap, woodLeft, P, charInt, tarAll, tarColl, vinAll, vinColl, gas });
    d.cumUsedJ += burnChar * (pv('charLhv') / 1e6);
  }
  const u = intDeltaFloor(d.cumUsedJ, d.reportedUsed);
  const storedNow = ending ? 0 : Math.round(heldJ());
  const sDelta = storedNow - d.reportedStored;
  d.reportedUsed = u.reported; d.reportedStored = storedNow;
  const res: ScienceStepResultV02 = {
    contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from: req.interval.from, to: endAt },
    state: { schema: SCHEMA, data: d }, status: ending ? (openAt !== undefined && known ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [], drawn: [],
    energy: u.delta === 0 && sDelta === 0 ? [] : [{ sourceId: `src:combustion:${req.runId}`, kind: 'heat', usedJ: u.delta, lostJ: u.delta - sDelta, storedJ: sDelta }],
    equipmentWear: [], observations,
    evidence: { evaluatorVersion: EVAL, sourceRefs: ['S-latent', 'S-wood'],
      notes: '水の蒸発熱は出典あり。分解の速さ、炭・タール・水の割合、受け壺に落ちる割合、器に入る火の熱の割合、炭が燃え出す温度は仮定（出典未照合）。分解そのものの熱、ひびからの空気、木酢液の酸は扱わない' },
    diagnostics: { tC: d.tC, maxC: d.maxC, woodLeft: wood0 > 0 ? d.woodF / wood0 : 0, charMg: d.charF, tarCollectedMg: d.tarCollF, level: d.level, fireOut: d.fireOut, burnedMg: d.burnedMg, heldJ: heldJ(), outcome: d.outcome },
  };
  if (!ending) return res;

  res.consumed = [{ lotId: charge.lotId, amount: { ...charge.amount } }, { lotId: fuel.lotId, amount: { ...fuel.amount } }];
  const hist = d.historyComplete ? 1 : 0;
  const coal: Composition = {};
  if (charLeft) coal.char = charLeft;
  if (s.woodLeft) coal.wood_dry = s.woodLeft;
  if (ash) coal.ash = ash;
  const wetLeft = (d.charge0.water ?? 0) - s.evap;
  if (wetLeft) coal.water = wetLeft;
  if (totalMg(coal) > 0) {
    const q: Record<string, number> = {};
    for (const [k, mg] of Object.entries(coal)) q[`x_${k}_ppm`] = Math.floor(((mg ?? 0) * 1e6) / totalMg(coal));
    const isCoal = (coal.char ?? 0) > 0 || d.chargeMaterial === 'charcoal';
    res.produced.push({ materialId: isCoal ? 'charcoal' : d.chargeMaterial, amount: { value: totalMg(coal), unit: 'mg' }, into: d.location,
      quality: isCoal ? { ...q, charred_c: Math.max(d.charredC0, s.P > 0 ? Math.round(d.maxC) : 0), history_complete: hist }
        : { ...fuelQualityOf(coal), history_complete: hist } });
  }
  if (s.tarColl) res.produced.push({ materialId: 'wood_tar', amount: { value: s.tarColl, unit: 'mg' }, into: d.location, quality: { x_wood_tar_ppm: 1_000_000, history_complete: hist } });
  if (s.vinColl) res.produced.push({ materialId: 'wood_vinegar', amount: { value: s.vinColl, unit: 'mg' }, into: d.location, quality: { ...foodQuality({ water: s.vinColl }), history_complete: hist } });
  // the fire's wood, as the wood fire settles it
  const taken: Composition = {};
  for (const part of ['wood_dry', 'water', 'ash'] as const) {
    const n = Math.min(d.fuel[part] ?? 0, Math.ceil((d.burnedMg * (d.fuel[part] ?? 0)) / fuelTotal - 1e-6));
    if (n > 0) taken[part] = n;
  }
  const left = addComp(d.fuel, taken, -1);
  const rw = react('wood_dry', taken.wood_dry ?? 0, REACTIONS.woodCombustion.coeffs, REACTIONS.woodCombustion.closeInto);
  const rc = react('char', burnChar, REACTIONS.charCombustion.coeffs, REACTIONS.charCombustion.closeInto);
  if (totalMg(left) > 0) {
    const leftDry = totalMg(left) - (left.water ?? 0);
    res.produced.push({ materialId: 'firewood', amount: { value: totalMg(left), unit: 'mg' }, into: d.fuelLocation,
      quality: { ...(fuel.quality ?? {}), water_ppm: ((left.water ?? 0) * 1e6) / totalMg(left), ash_dry_ppm: leftDry > 0 ? ((left.ash ?? 0) * 1e6) / leftDry : 0 } });
  }
  if (taken.ash) res.produced.push({ materialId: 'wood_ash', amount: { value: taken.ash, unit: 'mg' }, into: d.fuelLocation });
  const rel = (materialId: string, mg: number) => { if (mg > 0) res.released.push({ materialId, amount: { value: mg, unit: 'mg' }, to: 'air' }); };
  rel('water_vapour', s.evap + (s.vinAll - s.vinColl) + (taken.water ?? 0) + (rw.produced.water ?? 0) + (rc.produced.water ?? 0));
  rel('wood_tar', s.tarAll - s.tarColl); // as smoke
  rel('pyrolysis_gas', s.gas);
  rel('process_co2', (rw.produced.co2 ?? 0) + (rc.produced.co2 ?? 0));
  const o2 = (rw.consumed.o2 ?? 0) + (rc.consumed.o2 ?? 0);
  if (o2 > 0) res.drawn = [{ materialId: 'o2', amount: { value: o2, unit: 'mg' }, from: 'air' }];

  const o = (quantity: string, text: string) => res.observations.push({ at: endAt, channel: 'sight', quantity, text });
  if (!known) o('fire', '見ていない間に火が落ちていた。壺は閉じたまま');
  if (d.outcome === 'fuel_exhausted') o('fire', '薪が尽きて、火が小さくなっていった');
  if (burnChar > 0) o('charcoal', '開けたとたん、炭が赤くなって燃え出した');
  if (!known) return res; // nobody opened the pot or saw inside it: nothing to say about what is in it
  const solids = s.woodLeft + charLeft, leftShare = solids > 0 ? s.woodLeft / solids : 0;
  o('charcoal', s.P === 0 && charLeft === 0 ? '中身はまだ木のまま' : leftShare > 0.5 ? '茶色い木のかけらのまま。ほとんど炭になっていない'
    : leftShare > 0.02 ? '外は黒いが、割ると芯が茶色い' : '黒く軽い炭。打つと澄んだ音がする');
  if (s.tarColl > 0) o('pot', '下の壺に、黒くねばる液と、酸っぱいにおいの水がたまっていた');
  return res;
}

/** Read a charcoal lot: x_char, x_wood_dry, x_ash, x_water in whole ppm (written rounded down); the few mg the rounding
 *  leaves go to the largest part. */
function readCoal(lot: ScienceStepRequest['lots'][number]): Composition | string {
  const c: Composition = {};
  let listed = 0, ppm = 0;
  for (const [k, v] of Object.entries(lot.quality ?? {})) {
    const m = /^x_(.+)_ppm$/.exec(k);
    if (!m) continue;
    if (!(COAL as readonly string[]).includes(m[1])) return `charcoal ${lot.lotId}: unknown part ${m[1]} (char, wood_dry, ash, water)`;
    if (!Number.isSafeInteger(v) || v < 0) return `charcoal ${lot.lotId}: x_${m[1]}_ppm must be a whole ppm`;
    ppm += v;
    const mg = Math.floor((lot.amount.value * v) / 1e6);
    if (mg > 0) { c[m[1] as keyof Composition] = mg; listed += mg; }
  }
  if (ppm === 0 || ppm > 1e6) return `charcoal ${lot.lotId}: its parts must add up to at most 1000000 ppm`;
  const rest = lot.amount.value - listed;
  if (rest > 0) {
    const big = (Object.keys(c) as (keyof Composition)[]).sort((a, b) => (c[b] ?? 0) - (c[a] ?? 0) || String(a).localeCompare(String(b)))[0];
    c[big] = (c[big] ?? 0) + rest;
  }
  return c;
}

/** The equipment's identity: ids as they are, params as key-sorted entries, so the same params in another key order are
 *  the same equipment (Codex C3). A 0.1.1 run is refused by its version (the host cancels it, as for any old run). */
function equipmentFp(parts: unknown[]): string {
  return JSON.stringify(parts.map((x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)) : x)));
}

/** A woody lot handed back untouched by the fire (nothing broke down): in the firewood make-up again. */
function fuelQualityOf(c: Composition): Record<string, number> {
  const t = totalMg(c), w = c.water ?? 0, dry = t - w;
  return { water_ppm: (w * 1e6) / t, ash_dry_ppm: dry > 0 ? ((c.ash ?? 0) * 1e6) / dry : 0 };
}
