// A pure checker for ScienceStep results against the 0.1.0 rules (src/world/science-contract.ts), and the proposed
// 0.2.0 rules for a result whose contract is 0.2.x: `drawn` (taken from the surroundings) joins the mass balance.
// The world side can run it before committing a result; the science side runs it on every result in tests.
// It returns the list of violations; an empty list means "nothing found", not "scientifically correct".

import type { ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';

/** Energy sources the science side may report without a matching offer: exchanges inside the run. */
const INTERNAL_SOURCE = /^src:(env-heat|reaction|combustion):/;

export function validateResult(req: ScienceStepRequest, res: ScienceStepResult): string[] {
  const v: string[] = [];
  const isInt = (n: number) => Number.isSafeInteger(n);
  if (res.requestId !== req.requestId) v.push('requestId is not echoed');
  if (res.runId !== req.runId) v.push('runId is not echoed');
  if (res.contract !== req.contract) v.push('contract is not echoed');
  if (!['running', 'completed', 'failed', 'stopped', 'needs-input'].includes(res.status)) v.push(`unknown status ${res.status}`);
  for (const [name, t] of [['interval.from', req.interval.from], ['interval.to', req.interval.to], ['simulated.from', res.simulated?.from], ['simulated.to', res.simulated?.to]] as const) {
    if (!(typeof t === 'number' && isInt(t) && t >= 0)) v.push(`${name} is not a non-negative integer time (${t})`);
  }
  if (!(res.simulated.from === req.interval.from && res.simulated.to >= res.simulated.from && res.simulated.to <= req.interval.to)) {
    v.push(`simulated [${res.simulated.from},${res.simulated.to}) is outside the requested interval`);
  }
  if (!res.state || typeof res.state.schema !== 'string') v.push('state has no schema');

  // rule 1: consumed only from reserved lots, never more than they hold, same unit
  const lots = new Map(req.lots.map((l) => [l.lotId, l]));
  const used = new Map<string, number>();
  for (const c of res.consumed) {
    const lot = lots.get(c.lotId);
    if (!lot) { v.push(`consumed ${c.lotId} was not reserved`); continue; }
    if (c.amount.unit !== lot.amount.unit) v.push(`consumed ${c.lotId} in ${c.amount.unit}, lot is in ${lot.amount.unit}`);
    used.set(c.lotId, (used.get(c.lotId) ?? 0) + c.amount.value);
  }
  for (const [id, n] of used) if (n > lots.get(id)!.amount.value) v.push(`consumed ${n} of ${id}, only ${lots.get(id)!.amount.value} reserved`);

  // 0.2.x: what the run drew from its surroundings (O2 for burning, CO2 for carbonation); 0.1.x has no such field
  const v02 = /^0\.2\.\d+$/.test(req.contract);
  const drawn = (res as { drawn?: { materialId: string; amount: { value: number; unit: string }; from: string }[] }).drawn;
  if (v02 && !Array.isArray(drawn)) v.push('a 0.2.x result must carry drawn (an empty list when nothing was drawn)');
  if (!v02 && drawn !== undefined) v.push('drawn is a 0.2.x field: a 0.1.x result must not carry it');
  const drawnList = Array.isArray(drawn) ? drawn : [];
  for (const x of drawnList) if (!['air', 'water', 'ground'].includes(x.from)) v.push(`drawn ${x.materialId} from ${x.from}`);

  // integers and a single mass unit
  const flows = [...res.consumed.map((x) => x.amount), ...res.produced.map((x) => x.amount), ...res.released.map((x) => x.amount), ...drawnList.map((x) => x.amount)];
  for (const q of flows) {
    if (!isInt(q.value) || q.value < 0) v.push(`amount ${q.value} ${q.unit} is not a non-negative integer`);
    if (q.unit !== 'mg') v.push(`unit ${q.unit}: this core reports mass in mg only`);
  }

  // rule 2: Σconsumed (+ Σdrawn in 0.2.x) = Σproduced + Σreleased
  const sum = (xs: { amount: { value: number } }[]) => xs.reduce((s, x) => s + x.amount.value, 0);
  const cin = sum(res.consumed) + sum(drawnList), cout = sum(res.produced) + sum(res.released);
  if (cin !== cout) v.push(`mass does not close: consumed${v02 ? '+drawn' : ''} ${cin} mg, produced+released ${cout} mg`);

  // rule 3: integer J, used = stored + lost, offered sources not exceeded, no battery
  const offers = new Map(req.energy.map((e) => [e.sourceId, e]));
  const usedBySource = new Map<string, number>();
  for (const e of res.energy) {
    const stored = e.storedJ ?? 0;
    if (![e.usedJ, e.lostJ, stored].every((n) => typeof n === 'number' && isInt(n))) v.push(`energy ${e.sourceId}: J must be integers`);
    // energy taken from a source is never negative (no cancelling one entry against another); stored may be,
    // e.g. while things cool down
    if (!(e.usedJ >= 0)) v.push(`energy ${e.sourceId}: usedJ ${e.usedJ} is negative`);
    if (e.usedJ !== stored + e.lostJ) v.push(`energy ${e.sourceId}: used ${e.usedJ} ≠ stored ${stored} + lost ${e.lostJ}`);
    if (/battery|robot/i.test(e.sourceId)) v.push(`energy ${e.sourceId}: robot battery is not a source`);
    const offer = offers.get(e.sourceId);
    if (offer) {
      if (offer.kind !== e.kind) v.push(`energy ${e.sourceId}: kind ${e.kind} ≠ offered ${offer.kind}`);
      usedBySource.set(e.sourceId, (usedBySource.get(e.sourceId) ?? 0) + e.usedJ);
    } else if (!INTERNAL_SOURCE.test(e.sourceId)) {
      v.push(`energy ${e.sourceId} was neither offered nor an internal exchange`);
    }
  }
  for (const [id, n] of usedBySource) if (n > offers.get(id)!.maxJ) v.push(`energy ${id}: used ${n} J > offered ${offers.get(id)!.maxJ} J`);

  // failed results carry no flows
  if (res.status === 'failed' && (res.consumed.length || res.produced.length || res.released.length || drawnList.length || res.energy.length)) {
    v.push('a failed result must not carry flows');
  }
  // equipment wear only on equipment that was given
  const eq = new Set(req.equipment.map((e) => e.equipmentId));
  for (const w of res.equipmentWear) if (!eq.has(w.equipmentId)) v.push(`wear on unknown equipment ${w.equipmentId}`);
  // observations: numbers only through an instrument channel
  for (const o of res.observations) {
    if (o.value !== undefined && !o.channel.startsWith('instrument:')) v.push(`observation with a number through ${o.channel}`);
    if (!(typeof o.at === 'number' && isInt(o.at))) v.push('observation time is not an integer');
    if (o.value !== undefined && !Number.isFinite(o.value)) v.push('observation value is not finite');
  }
  return v;
}
