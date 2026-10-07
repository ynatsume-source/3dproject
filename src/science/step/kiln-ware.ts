// The test tile inside a heated chamber, shared by the firing steps (offered heat: firing.ts; burning wood: wood-fire.ts).
// One place for what happens to the piece — its lag behind the chamber, drying out, dehydroxylation, calcite
// decomposition, sintering, the crack risks — and for how the piece is settled when the run ends.

import type { LotView, Observation, ScienceStepResult } from '../../world/science-contract';
import { totalMg, type Composition } from '../chem';
import { wareComp } from '../ceramic';
import { pv } from '../params';
import { crackP, dehydroxExtent, glowCategory, KINETICS, waterRatio } from '../physics';
import { draw } from '../rng';
import { tileQuality } from './common';

export type Ext = { water: number; organic: number; dehydrox: number; calc: number };

export interface WareState {
  base: Composition; ext: Ext; sinter: number; thicknessMm: number;
  wareC: number; maxWareC: number; steamRatioMax: number; duntRatioMax: number;
}

/** Advance the piece by dt seconds in a chamber at kilnC; returns the heat it took (J) by kind. With burnOrganic
 *  (open-fired pots, pit-fire.ts) organic matter in the body burns out in the air (the O2 is the caller's to draw);
 *  without it (the tile steps, which refuse organic bodies) nothing about organics changes. */
export function advanceWare(w: WareState, kilnC: number, dt: number, o: { burnOrganic?: boolean } = {}): { sens: number; latent: number; chem: number } {
  const now = wareComp(w.base, w.ext).comp;
  const tau = pv('wareLagS10mm') * (w.thicknessMm / 10) ** 2;
  const Tw = w.wareC + (kilnC - w.wareC) * (1 - Math.exp(-dt / tau));
  const dTw = Tw - w.wareC;
  const sens = (totalMg(now) / 1000) * pv('cpCeramic') * dTw;
  const rateKh = (dTw / dt) * 3600, wr = waterRatio(now);
  if (Tw >= 90 && Tw <= 250 && wr > pv('steamMoistureLimit') && rateKh > 0) {
    w.steamRatioMax = Math.max(w.steamRatioMax, (wr / pv('steamMoistureLimit')) * (rateKh / pv('steamRateLimit')));
  }
  const qi = pv('quartzInversionC');
  if ((w.wareC - qi) * (Tw - qi) <= 0 && dTw !== 0 && (w.base.quartz ?? 0) > 0) {
    w.duntRatioMax = Math.max(w.duntRatioMax, Math.abs(rateKh) / (pv('duntRateLimit10mm') * (10 / w.thicknessMm)));
  }
  const adv = (x: number, k: number) => x + (1 - x) * (1 - Math.exp(-k * dt));
  const e = w.ext;
  const ne: Ext = { water: adv(e.water, KINETICS.water(Tw)), organic: o.burnOrganic ? adv(e.organic, KINETICS.organic(Tw)) : 0, dehydrox: adv(e.dehydrox, KINETICS.dehydrox(Tw)), calc: adv(e.calc, KINETICS.calcination(Tw)) };
  const latent = ((ne.water - e.water) * (w.base.water ?? 0) / 1e6) * pv('latentHeatWater100');
  const chem = ((ne.dehydrox - e.dehydrox) * (w.base.kaolinite ?? 0) / 1e6) * pv('dHDehydroxylation')
    + ((ne.calc - e.calc) * (w.base.calcite ?? 0) / 1000 / 100.09) * pv('dHCalcination');
  w.ext = ne;
  if (dehydroxExtent(wareComp(w.base, ne).comp) >= pv('slakeIfDehydroxBelow')) w.sinter += (1 - w.sinter) * (1 - Math.exp(-KINETICS.sinter(Tw) * dt));
  w.wareC = Tw; w.maxWareC = Math.max(w.maxWareC, Tw);
  return { sens, latent, chem };
}

/** Settle the piece once, at the end of the run: what is consumed, produced, released, and what the resident sees. */
export function settleWare(o: {
  w: WareState; lot: LotView; location: string; seed: number; runId: string; endAt: number;
  done: boolean; peakKilnC: number; historyComplete: boolean;
}): Pick<ScienceStepResult, 'consumed' | 'produced' | 'released' | 'observations'> {
  const { w: d, lot } = o;
  const wc = wareComp(d.base, d.ext);
  // crack draws, keyed by the run's seed: chunking and resends never change them
  let crack = 0;
  for (const [mech, ratio] of [['steam', d.steamRatioMax], ['dunting', d.duntRatioMax]] as const) {
    const pc = crackP(ratio);
    if (pc > 0 && draw(o.seed, o.runId, lot.lotId, mech) < pc) {
      crack = Math.max(crack, draw(o.seed, o.runId, lot.lotId, mech, 'severity') < Math.min(0.8, 0.25 * ratio) ? 2 : 1);
    }
  }
  // fired means the piece was actually heated: a run that ended without heat (the wood never caught) hands the
  // piece back as it came, to be fired again (Codex A on 451ea82). The end of a run is not the same as a firing.
  const fired = d.maxWareC > 300;
  crack = Math.max(crack, lot.quality?.crack ?? 0); // cracks the piece already had stay, and are what the resident sees
  const tq = tileQuality(wc.comp);
  const q: Record<string, number> = { ...(lot.quality ?? {}), ...tq, sinter_ppm: Math.round(d.sinter * 1e6), crack,
    overfired: d.maxWareC > pv('overfireC') ? 1 : 0, history_complete: o.historyComplete ? 1 : 0 };
  for (const k of Object.keys(q)) if (/^xd_/.test(k) && !(k in tq)) delete q[k];
  const released: ScienceStepResult['released'] = [];
  if (wc.out.water) released.push({ materialId: 'water_vapour', amount: { value: wc.out.water, unit: 'mg' }, to: 'air' });
  if (wc.out.co2) released.push({ materialId: 'process_co2', amount: { value: wc.out.co2, unit: 'mg' }, to: 'air' });
  const obs: Observation[] = [{ at: o.endAt, channel: 'sight', quantity: 'glow', text: `いちばん熱いときの火の色：${glowCategory(o.peakKilnC)}` }];
  obs.push({ at: o.endAt, channel: 'sight', quantity: 'crack', text: crack === 2 ? '割れて分かれている' : crack === 1 ? '細いひびが見える' : 'ひびは見当たらない' });
  if (o.done) obs.push({ at: o.endAt, channel: 'sound', quantity: 'tap',
    text: crack === 2 ? '濁ってびりつく音' : d.sinter > 0.5 ? '高く澄んだ音' : dehydroxExtent(wc.comp) >= pv('slakeIfDehydroxBelow') ? 'やや鈍い音' : 'こもった音' });
  return {
    consumed: [{ lotId: lot.lotId, amount: { value: totalMg(d.base), unit: 'mg' } }],
    produced: [{ materialId: fired ? 'test_tile_fired' : lot.materialId, amount: { value: totalMg(wc.comp), unit: 'mg' }, quality: q, into: o.location }],
    released, observations: obs,
  };
}
