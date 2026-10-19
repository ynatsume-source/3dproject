// ScienceStep for cutting a bamboo tube for the weather pot (p18x_bamboo_tube), world clock: hand work.
// BAMBOO_TUBE_DESIGN.md, owner's decisions 2026-10-10 (all as recommended): a straight tube, one internode cut at both
// ends (no node pierced, nothing bent), put through the plug of a sealed pot and dipped into the water inside it.
//
// One bamboo lot (main's: the leftovers of the house, mass only) and the hands. The first request carries one `cut` at
// interval.from with params.lengthMm (150 .. bambooInternodeMaxMm). The resident picks an internode of that length; its
// bore is the bamboo's, not chosen (bambooBoreMinMm..bambooBoreMaxMm, drawn by seed and lot). While it is cut and its
// ends trimmed it may split along its length (bambooSplitP; green bamboo, water above 30 %, more: bambooGreenSplitP):
// a split piece is no tube and goes back with the rest of the bamboo. All values assumed (no source read yet: the
// island's bamboo species, bores and walls are for Codex to check).
// Not modelled: a green tube drying and shrinking after it is made, the bore's taper (it hardly matters to the weather
// pot: the reading is the column's height, and the tube's area only enters through the small volume it moves).

import type { LotView, Observation, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { pv } from '../params';
import { draw } from '../rng';
import { allFinite, checkCommon, contractExtras, failed, fingerprint, finite, intDeltaFloor, isInt } from './common';

export const BAMBOO_TUBE_PROCESS = { processId: 'p18x_bamboo_tube', processVersion: '0.1.1' } as const;
// The work-state shape is unchanged; saved 0.1.0 cuts may finish with the fix.
export const BAMBOO_TUBE_RESUME_VERSIONS = ['0.1.0'] as const;
const SCHEMA = 'civ-sci.bamboo-tube/1', EVAL = 'bamboo-tube-eval/0.1.1';
export const BAMBOO = 'bamboo', BAMBOO_TUBE = 'bamboo_tube';

interface TubeData { fps: string[]; lastTo: number; elapsedMs: number; durationMs: number; reportedHands: number; lengthMm: number; seed: number }

/** The mass (mg) of a tube of this bore and length, with water_ppm of the bamboo's own water. */
export function bambooTubeMg(boreMm: number, lengthMm: number, waterPpm = 0): number {
  const ri = boreMm / 2, ro = ri + pv('bambooWallMm');
  const dryMg = Math.PI * (ro * ro - ri * ri) * lengthMm * pv('bambooDensityGPerCm3'); // mm³ × g/cm³ = mg
  return Math.round(dryMg / (1 - waterPpm / 1e6));
}

/** Keep absolute mass/length metadata consistent without inventing it for old bamboo. */
function remainingBambooQuality(
  lot: LotView,
  remainingMg: number
): Record<string, number> | undefined {
  const q = lot.quality;
  if (!q || Object.keys(q).length === 0) return undefined;
  if (q.dry_mg === undefined) return { ...q };
  const mass = BigInt(lot.amount.value);
  const remaining = BigInt(remainingMg);
  // Floor water, assigning the sub-mg residual to dry matter. The sum is exact
  // and a positive dry input retains at least 1 mg even at the smallest remainder.
  const waterMg = Number(BigInt(q.water_mg) * remaining / mass);
  return {
    ...q,
    dry_mg: remainingMg - waterMg,
    water_mg: waterMg,
    length_mm: Number(BigInt(q.length_mm) * remaining / mass)
  };
}

export function bambooTubeStep(req: ScienceStepRequest): ScienceStepResult {
  const fail = (why: string) => failed(req, EVAL, why, SCHEMA);
  const supportedVersion = req.processVersion === BAMBOO_TUBE_RESUME_VERSIONS[0]
    ? req.processVersion
    : BAMBOO_TUBE_PROCESS.processVersion;
  const bad = checkCommon(req, BAMBOO_TUBE_PROCESS.processId, supportedVersion, SCHEMA);
  if (bad) return fail(bad);
  if (req.lots.length !== 1 || req.lots[0].materialId !== BAMBOO) return fail(`expected one ${BAMBOO} lot`);
  const lot = req.lots[0], q = lot.quality ?? {};
  if (!isInt(lot.amount.value, 1)) return fail('the bamboo lot needs a whole positive mg');
  const hasMassQuality = q.dry_mg !== undefined || q.water_mg !== undefined;
  if (hasMassQuality) {
    if (!isInt(q.dry_mg, 1) || !isInt(q.water_mg) || !isInt(q.length_mm)) {
      return fail('bamboo dry_mg, water_mg and length_mm must be whole non-negative values (dry_mg positive)');
    }
    if (BigInt(q.dry_mg) + BigInt(q.water_mg) !== BigInt(lot.amount.value)) {
      return fail('bamboo dry_mg + water_mg must match the lot mass');
    }
  }
  if (!finite(q.water_ppm ?? 0, 0, 800_000)) return fail('bamboo water_ppm must be within 0..800000');
  for (const a of req.actions) {
    if (a.action !== 'cut') return fail(`unknown action ${a.action} (cut: choose an internode and cut it at both ends)`);
    if (!(a.at >= req.interval.from && a.at < req.interval.to)) return fail('cut must fall inside the interval');
  }
  const hands = req.energy.filter((e) => e.kind === 'mechanical');
  if (hands.length !== 1 || req.energy.length !== 1) return fail('expected one mechanical energy offer (the hands)');
  const fps = req.lots.map(fingerprint);
  let d: TubeData;
  if (req.state === null) {
    const cuts = req.actions.filter((a) => a.action === 'cut');
    if (cuts.length !== 1 || cuts[0].at !== req.interval.from) return fail('the first request carries one cut at interval.from {lengthMm}');
    const L = cuts[0].params?.lengthMm;
    if (!finite(L, 150, pv('bambooInternodeMaxMm'))) return fail(`cut params.lengthMm must be within 150..${pv('bambooInternodeMaxMm')} (one internode: longer needs its nodes pierced)`);
    const need = Math.ceil(bambooTubeMg(pv('bambooBoreMaxMm'), L, q.water_ppm ?? 0) * (1 + pv('bambooOffcutShare')));
    if (lot.amount.value < need) return fail(`not enough bamboo: a ${L} mm internode with its node ends needs up to ${need} mg`);
    d = { fps, lastTo: req.interval.from, elapsedMs: 0, durationMs: pv('bambooTubeHandSeconds') * 1000, reportedHands: 0, lengthMm: L, seed: req.seed };
  } else {
    if (req.actions.length) return fail('the cut is chosen once, at the start');
    d = structuredClone(req.state.data as TubeData);
    if (d.fps.join('|') !== fps.join('|')) return fail('changed-input: a reserved lot changed under a running run');
    if (req.interval.from !== d.lastTo) return fail(`noncontiguous-interval: expected from=${d.lastTo}`);
  }
  const span = req.interval.to - req.interval.from, power = pv('vesselHandPowerW');
  const worked = span > 0 && (hands[0].maxJ * 1000) / span >= power ? Math.min(span, d.durationMs - d.elapsedMs) : 0;
  d.elapsedMs += worked;
  const done = d.elapsedMs >= d.durationMs, endAt = done ? req.interval.from + worked : req.interval.to;
  const h = intDeltaFloor((power * d.elapsedMs) / 1000, d.reportedHands);
  d.reportedHands = h.reported; d.lastTo = endAt;
  if (!allFinite(d)) return fail('non-finite state: refusing to return it');
  const stopped = !done && (req.stop === 'operator' || req.stop === 'equipment-lost');
  const observations: Observation[] = [];
  const res: ScienceStepResult = {
    ...contractExtras(req), contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from: req.interval.from, to: endAt },
    state: { schema: SCHEMA, data: d }, status: done ? 'completed' : stopped ? 'stopped' : worked === 0 && span > 0 ? 'needs-input' : 'running',
    consumed: [], produced: [], released: [], observations, equipmentWear: [],
    energy: h.delta > 0 ? [{ sourceId: hands[0].sourceId, kind: 'mechanical', usedJ: h.delta, lostJ: h.delta, storedJ: 0 }] : [],
    evidence: { evaluatorVersion: EVAL, sourceRefs: [], notes: '竹の内径・壁・節の間の長さ・密度・割れやすさ・手間はすべて仮定（島の竹の資料は未照合）' },
    diagnostics: { elapsedS: d.elapsedMs / 1000, durationS: d.durationMs / 1000 },
  };
  if (!done && !stopped) return res;
  res.consumed = [{ lotId: lot.lotId, amount: { ...lot.amount } }];
  const hist = (q.history_complete ?? 1) === 1 ? 1 : 0;
  if (stopped) { // stopped before the cut was finished: the bamboo comes back as it was
    res.produced = [{ materialId: BAMBOO, amount: { ...lot.amount }, into: lot.location, quality: { ...q } }];
    return res;
  }
  const lo = pv('bambooBoreMinMm'), hi = pv('bambooBoreMaxMm');
  const bore = Math.round((lo + (hi - lo) * draw(d.seed, req.runId, lot.lotId, 'bore')) * 10) / 10;
  const water = q.water_ppm ?? 0;
  const splitP = water > 300_000 ? pv('bambooGreenSplitP') : pv('bambooSplitP');
  const split = draw(d.seed, req.runId, lot.lotId, 'split') < splitP;
  const tubeMg = bambooTubeMg(bore, d.lengthMm, water);
  const o = (quantity: string, text: string) => observations.push({ at: endAt, channel: 'sight', quantity, text });
  if (split) {
    res.produced = [{ materialId: BAMBOO, amount: { ...lot.amount }, into: lot.location, quality: { ...q } }];
    o('tube', '切っているうちに、竹が縦に割れてしまった（管にならない）');
    return res;
  }
  res.produced = [{ materialId: BAMBOO_TUBE, amount: { value: tubeMg, unit: 'mg' }, into: lot.location,
    quality: { bore_mm: bore, length_mm: d.lengthMm, outer_mm: Math.round((bore + 2 * pv('bambooWallMm')) * 10) / 10, ...(water ? { water_ppm: water } : {}), history_complete: hist } }];
  const remainingMg = lot.amount.value - tubeMg;
  if (remainingMg > 0) {
    const quality = remainingBambooQuality(lot, remainingMg);
    res.produced.push({
      materialId: BAMBOO,
      amount: { value: remainingMg, unit: 'mg' },
      into: lot.location,
      ...(quality === undefined ? {} : { quality })
    });
  }
  o('tube', `節の間を切って、まっすぐな管ができた（穴は${bore < 8 ? '細い' : bore < 10 ? '指の先ほど' : 'やや太い'}）`);
  return res;
}
