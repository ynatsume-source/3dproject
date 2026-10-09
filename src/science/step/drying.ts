// ScienceStep for drying clay test tiles (process p12x_test_tile_dry), against src/world/science-contract.ts 0.1.0.
//
// How a drying run touches the world (the answer to "who updates the lot while it dries"):
//   - While the run is 'running', every result has consumed = produced = released = [] (mass closes trivially).
//     The tile lot keeps its committed amount/quality; it is reserved to the run, so nothing else uses it.
//     The evolving water content, shrinkage and crack risk live in ScienceState only.
//   - When the run ends ('completed' by the operator's take-off action, or 'stopped' by operator/equipment loss),
//     ONE result settles it: consume the whole tile lot, produce one lot (same material, new quality), release
//     the evaporated water to the air. Σconsumed = Σproduced + Σreleased exactly, in mg.
//     The world links consumed → produced through its commit event: one lineage edge per run.
//   - Heat: evaporation draws heat from the surrounding air (`env:` source, not an EnergyOffer) and that heat
//     leaves with the vapour, so usedJ = lostJ, storedJ = 0. It is reported per interval as integer J using
//     cumulative rounding (report round(cum_to) − round(cum_from)), so any chunking sums to the same integers.
// environment.windMs is the wind measured at windHeightM (default 10 m), brought to 10 m (wind10m) and then to the
// rack: the rack feels windRackFactor of the 10 m wind (0.3.0).
// Operational stops ('world-pause' / 'shutdown') do not settle and do not invent weather: the world simply keeps
// the state; an interval whose environment is 'unknown' or 'stale' is not integrated and marks the history incomplete.

import type {
  EquipmentView, LotView, Observation, ScienceStepRequest, ScienceStepResult, ScienceState,
} from '../../world/science-contract';
import { pv } from '../params';
import { allFinite, contractExtras, envUsable, finite, SCIENCE_CATALOG_VERSION, stateSchemaProblem, subStepEnd, wind10m } from './common';
import { crackP, dryPhysics } from '../physics';
import { draw } from '../rng';

export const DRYING_PROCESS = { processId: 'p12x_test_tile_dry', processVersion: '0.3.1' } as const; // 0.3.1: a missing wind is unknown (not calm)
export { SCIENCE_CATALOG_VERSION };
export const DRYING_STATE_SCHEMA = 'civ-sci.drying/3';
const EVALUATOR = 'drying-eval/0.1.0';
const STEP_MS = 30_000; // divides 30 s: 30 s-aligned requests are exact for every process
export const TILE_MATERIAL = 'test_tile_green';
export const TILE_DRY_MATERIAL = 'test_tile_dry';
export const RACK_KIND = 'drying_rack';

/** Quality keys of a test_tile_green lot (catalog units, integers). */
export interface TileQuality {
  water_ppm: number;              // water / lot mass, ppm
  shaped_water_ratio_ppm: number; // water / dry solids at shaping, ppm
  width_mm: number; length_mm: number; thickness_mm: number;
  linear_shrink_ppm: number;
  crack: number;                  // 0 none, 1 hairline, 2 through
  history_complete: number;       // 1 if every interval of its life was simulated
}

interface DryingData {
  lotId: string;
  startMs: number;          // grid origin
  seed: number;             // fixed from the first request: later seeds do not change outcomes
  amountMg: number;         // lot amount at start (committed value)
  dryMg: number;
  waterMg: number;          // current water (float until settlement)
  evaporatedMg: number;     // cumulative (float until settlement)
  shapedWaterRatio: number;
  dims: { w: number; l: number; t: number };
  linearShrink: number;
  fluxRatioMax: number;
  crack: 0 | 1 | 2;
  stage: 'formed' | 'leather' | 'dry';
  historyComplete: boolean;
  latentJ: number;          // cumulative heat drawn from air (float)
  reportedJ: number;        // cumulative integer J already reported
  quality0: Record<string, number>;
  lastTo: number;           // end of the last interval answered: the next request must start here
  lotFingerprint: string;   // the reserved lot may not change under a running run
}

const fail = (req: ScienceStepRequest, why: string, state?: ScienceState): ScienceStepResult => ({
  ...contractExtras(req),
  contract: req.contract, requestId: req.requestId, runId: req.runId,
  simulated: { from: req.interval.from, to: req.interval.from },
  state: state ?? req.state ?? { schema: DRYING_STATE_SCHEMA, data: null },
  status: 'failed', consumed: [], produced: [], released: [], energy: [], equipmentWear: [], observations: [],
  evidence: { evaluatorVersion: EVALUATOR, sourceRefs: [], notes: why }, diagnostics: { error: why },
});

function checkVersions(req: ScienceStepRequest): string | null {
  if (!/^0\.[12]\.\d+$/.test(req.contract)) return `unknown contract ${req.contract}`;
  if (req.processId !== DRYING_PROCESS.processId) return `unknown process ${req.processId}`;
  if (req.processVersion !== DRYING_PROCESS.processVersion) return `unknown processVersion ${req.processVersion}`;
  if (req.catalogVersion !== SCIENCE_CATALOG_VERSION) return `unknown catalogVersion ${req.catalogVersion}`;
  const sp = stateSchemaProblem(req, DRYING_STATE_SCHEMA);
  if (sp) return sp;
  if (!isInt(req.interval.from) || !isInt(req.interval.to) || req.interval.to < req.interval.from) return 'invalid interval';
  if (!isInt(req.seed)) return 'invalid seed';
  return null;
}

// Input checks adopted from codex/civilization-lab@13a35fa: integer amounts, contiguous intervals, unchanged lot.
const isInt = (n: unknown, min = 0) => typeof n === 'number' && Number.isSafeInteger(n) && n >= min;
const fingerprint = (lot: LotView) => JSON.stringify([lot.lotId, lot.materialId, lot.amount, lot.location,
  Object.entries(lot.quality ?? {}).sort(([a], [b]) => a.localeCompare(b))]);

function initState(req: ScienceStepRequest, lot: LotView): DryingData | string {
  if (lot.amount.unit !== 'mg' || !isInt(lot.amount.value, 1)) return `lot ${lot.lotId} must be a positive integer of mg`;
  if (Object.values(lot.quality ?? {}).some((v) => !Number.isFinite(v))) return 'non-finite quality value';
  const q = lot.quality ?? {};
  for (const k of ['water_ppm', 'width_mm', 'length_mm', 'thickness_mm']) if (!(k in q)) return `lot ${lot.lotId} lacks quality.${k}`;
  const amount = lot.amount.value;
  const water = Math.round((amount * q.water_ppm) / 1e6);
  const dry = amount - water;
  if (dry <= 0) return 'no dry solids in the lot';
  return {
    lotId: lot.lotId, startMs: req.interval.from, seed: req.seed,
    amountMg: amount, dryMg: dry, waterMg: water, evaporatedMg: 0,
    shapedWaterRatio: (q.shaped_water_ratio_ppm ?? (water * 1e6) / dry) / 1e6,
    dims: { w: q.width_mm, l: q.length_mm, t: q.thickness_mm },
    linearShrink: (q.linear_shrink_ppm ?? 0) / 1e6, fluxRatioMax: 0, crack: (q.crack ?? 0) as 0 | 1 | 2,
    stage: 'formed', historyComplete: (q.history_complete ?? 1) === 1, latentJ: 0, reportedJ: 0, quality0: { ...q },
    lastTo: req.interval.from, lotFingerprint: fingerprint(lot),
  };
}

export function dryingStep(req: ScienceStepRequest): ScienceStepResult {
  const bad = checkVersions(req);
  if (bad) return fail(req, bad);
  const tiles = req.lots.filter((l) => l.materialId === TILE_MATERIAL);
  if (tiles.length !== 1) return fail(req, `expected exactly one reserved ${TILE_MATERIAL} lot, got ${tiles.length}`);
  const lot = tiles[0];
  const rack: EquipmentView | undefined = req.equipment.find((e) => e.kind === RACK_KIND);
  if (!rack && req.stop !== 'equipment-lost') return fail(req, 'no drying rack among the equipment');
  if (req.energy.some((e) => /battery|robot/i.test(e.sourceId))) return fail(req, 'robot battery is not an energy source (legacy / sealed_bootstrap)');

  let d: DryingData;
  if (req.state === null) {
    const s = initState(req, lot);
    if (typeof s === 'string') return fail(req, s);
    d = s;
  } else {
    d = structuredClone(req.state.data as DryingData);
    if (d.lotId !== lot.lotId) return fail(req, `state belongs to ${d.lotId}, request reserves ${lot.lotId}`);
    if (d.lotFingerprint !== fingerprint(lot)) return fail(req, 'changed-input: the reserved lot changed under a running run');
    if (req.interval.from !== d.lastTo) return fail(req, `noncontiguous-interval: expected from=${d.lastTo}; send a missed interval with environment.source 'unknown'`);
  }

  // when does this interval end for us? the operator taking the tiles off, or a stop at interval.to
  const takeOff = req.actions.filter((a) => a.action === 'take_off' && a.at >= req.interval.from && a.at < req.interval.to)
    .map((a) => a.at).sort((a, b) => a - b)[0];
  const settleStop = req.stop === 'operator' || req.stop === 'equipment-lost';
  const endAt = takeOff !== undefined ? takeOff : req.interval.to;

  const env = req.environment;
  const known = envUsable(req) && env.humidity !== undefined && env.windMs !== undefined; // 0.3.1: a missing wind is unknown, not calm
  const sun = rack?.params?.sunExposure ?? 0;
  if (!finite(sun, 0, 1)) return fail(req, 'drying_rack params.sunExposure must be within 0..1');
  const diagnostics: Record<string, unknown> = {};

  if (!known) {
    // Do not integrate: the time passes, nothing is invented, the history is marked incomplete.
    if (endAt > req.interval.from) d.historyComplete = false;
    diagnostics.skipped = `environment ${env.source}: interval not integrated`;
  } else {
    // integrate exactly to endAt, in sub-steps cut at the fixed grid and at the interval boundary
    let t = d.lastTo;
    while (t < endAt) {
      const tEnd = subStepEnd(t, d.startMs, STEP_MS, endAt);
      const o = dryPhysics({ waterMg: d.waterMg, dryMg: d.dryMg, shapedWaterRatio: d.shapedWaterRatio, linearShrink: d.linearShrink,
        dimsMm: d.dims, airTempC: env.airTempC!, rh: env.humidity!, windMs: wind10m(req) * pv('windRackFactor'), sun, dtS: (tEnd - t) / 1000 });
      d.waterMg -= o.evapExactMg;
      d.evaporatedMg += o.evapExactMg;
      d.latentJ += (o.evapExactMg / 1e6) * pv('latentHeatWater25');
      d.linearShrink = o.linearShrink;
      d.stage = o.stage;
      if (o.fluxRatio !== null) d.fluxRatioMax = Math.max(d.fluxRatioMax, o.fluxRatio);
      if (o.crossedCritical && d.crack === 0) {
        const p = crackP(d.fluxRatioMax);
        if (p > 0 && draw(d.seed, req.runId, d.lotId, 'drying') < p) {
          d.crack = draw(d.seed, req.runId, d.lotId, 'drying', 'severity') < Math.min(0.8, 0.25 * d.fluxRatioMax) ? 2 : 1;
        }
      }
      t = tEnd;
    }
  }

  d.lastTo = endAt;
  if (!allFinite(d)) return fail(req, 'non-finite state: refusing to return it');
  // Integer J for this interval, derived from the whole mg of vapour evaporated so far (floor, never decreasing):
  // every entry is ≥ 0 and the total equals the heat carried by the vapour that is finally released.
  const evapSoFar = Math.floor(d.evaporatedMg + 1e-6);
  d.latentJ = (evapSoFar / 1e6) * pv('latentHeatWater25');
  const cumInt = Math.floor(d.latentJ + 1e-9);
  const usedJ = cumInt - d.reportedJ;
  d.reportedJ = cumInt;

  const ending = takeOff !== undefined || settleStop;
  const result: ScienceStepResult = {
    ...contractExtras(req),
    contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: endAt },
    state: { schema: DRYING_STATE_SCHEMA, data: d },
    status: ending ? (takeOff !== undefined ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [],
    energy: usedJ > 0 ? [{ sourceId: `src:env-heat:${req.runId}`, kind: 'heat', usedJ, lostJ: usedJ, storedJ: 0 }] : [],
    equipmentWear: [],
    observations: [],
    evidence: { evaluatorVersion: EVALUATOR, sourceRefs: ['S-dry', 'S-latent'],
      notes: 'Dalton型蒸発・二段乾燥・収縮期の蒸発速度で割れ。係数は校正値・仮定（原典未照合）' },
    diagnostics: { ...diagnostics, waterRatio: d.waterMg / d.dryMg, fluxRatioMax: d.fluxRatioMax, stage: d.stage, evaporatedMg: d.evaporatedMg },
  };

  if (ending) {
    const evap = evapSoFar;
    const producedMg = d.amountMg - evap;
    const quality: Record<string, number> = {
      ...d.quality0,
      water_ppm: Math.round(((d.waterMg + d.evaporatedMg - evap) * 1e6) / producedMg),
      shaped_water_ratio_ppm: Math.round(d.shapedWaterRatio * 1e6),
      linear_shrink_ppm: Math.round(d.linearShrink * 1e6),
      crack: d.crack,
      history_complete: d.historyComplete ? 1 : 0,
    };
    result.consumed = [{ lotId: d.lotId, amount: { value: d.amountMg, unit: 'mg' } }];
    result.produced = [{ materialId: d.stage === 'dry' ? TILE_DRY_MATERIAL : TILE_MATERIAL, amount: { value: producedMg, unit: 'mg' }, quality, into: lot.location }];
    if (evap > 0) result.released = [{ materialId: 'water_vapour', amount: { value: evap, unit: 'mg' }, to: 'air' }];
    const obs: Observation[] = [
      { at: endAt, channel: 'sight', quantity: 'dryness',
        text: d.stage === 'dry' ? '白っぽく乾いている' : d.stage === 'leather' ? '色の濃さが残り、まだ少し湿っている' : 'まだ柔らかく湿っている' },
      { at: endAt, channel: 'touch', quantity: 'coolness', text: d.stage === 'dry' ? '持っても冷たくない' : 'ひんやりする' },
    ];
    if (d.crack === 2) obs.push({ at: endAt, channel: 'sight', quantity: 'crack', text: '割れて分かれている' });
    else if (d.crack === 1 && draw(d.seed, req.runId, d.lotId, 'drying', 'visible') < 0.5) obs.push({ at: endAt, channel: 'sight', quantity: 'crack', text: '細いひびが見える' });
    result.observations = obs;
  }
  return result;
}
