// ScienceStep for soaking a test tile in cold water (m01x_tile_soak_test), contract 0.1.0. State schema /2 (0.2.0); /1 states are refused like the other steps.
// No measurement happens here: weighing before/after is the separate fixture_mass_measure step, and the
// absorption percentage is the resident's own calculation (tools/science-lab/measurements.mjs definition).
// Uptake approaches the cold-soak saturation exponentially (time constant assumed). A piece whose clay
// mineral is not yet dehydroxylated collapses into slurry. The lots are settled once, at take-out.

import type { Observation, ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { addComp, splitComp, totalMg, type Composition } from '../chem';
import { pv } from '../params';
import { dehydroxExtent, dryMg } from '../physics';
import { checkCommon, failed, fingerprint, tileComp, tileQuality } from './common';

export const SOAK_PROCESS = { processId: 'm01x_tile_soak_test', processVersion: '0.2.0' } as const;
const SCHEMA = 'civ-sci.tile-soak/2';
const EVAL = 'tile-soak-eval/0.1.0';
const UPTAKE_TAU_S = 2 * 3600; // assumed: most of the cold-soak uptake within a few hours

interface SoakData { tileId: string; waterId: string; fps: string[]; startMs: number; lastTo: number; historyComplete: boolean }

export function soakStep(req: ScienceStepRequest): ScienceStepResult {
  const bad = checkCommon(req, SOAK_PROCESS.processId, SOAK_PROCESS.processVersion, SCHEMA);
  if (bad) return failed(req, EVAL, bad, SCHEMA);
  const tiles = req.lots.filter((l) => ['test_tile_fired', 'test_tile_dry', 'test_tile_green'].includes(l.materialId));
  const waters = req.lots.filter((l) => l.materialId === 'process_water');
  if (tiles.length !== 1 || waters.length !== 1 || req.lots.length !== 2) return failed(req, EVAL, 'expected one test tile lot and one process_water lot', SCHEMA);
  if (!req.equipment.some((e) => e.kind === 'fixture_soak_basin') && req.stop !== 'equipment-lost') return failed(req, EVAL, 'no fixture_soak_basin', SCHEMA);
  const tile = tiles[0], water = waters[0];
  if (water.amount.value < 3 * tile.amount.value) return failed(req, EVAL, 'reserve at least three times the tile mass of water to cover it', SCHEMA);
  const fps = [fingerprint(tile), fingerprint(water)];
  let d: SoakData;
  if (req.state === null) {
    d = { tileId: tile.lotId, waterId: water.lotId, fps, startMs: req.interval.from, lastTo: req.interval.from, historyComplete: true };
  } else {
    d = structuredClone(req.state.data as SoakData);
    if (d.fps.join('|') !== fps.join('|')) return failed(req, EVAL, 'changed-input: a reserved lot changed under a running run', SCHEMA);
    if (req.interval.from !== d.lastTo) return failed(req, EVAL, `noncontiguous-interval: expected from=${d.lastTo}`, SCHEMA);
  }
  // soaking does not depend on the weather: an unknown environment changes nothing here
  const takeOut = req.actions.filter((a) => a.action === 'take_out' && a.at >= req.interval.from && a.at < req.interval.to).map((a) => a.at).sort((a, b) => a - b)[0];
  const ending = takeOut !== undefined || req.stop === 'operator' || req.stop === 'equipment-lost';
  const endAt = takeOut ?? req.interval.to;
  d.lastTo = endAt;
  const res: ScienceStepResult = {
    contract: req.contract, requestId: req.requestId, runId: req.runId, simulated: { from: req.interval.from, to: endAt },
    state: { schema: SCHEMA, data: d }, status: ending ? (takeOut !== undefined ? 'completed' : 'stopped') : 'running',
    consumed: [], produced: [], released: [], energy: [], equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: EVAL, sourceRefs: ['S-abs', 'S-slake'], notes: '吸水の上限は焼結度からの校正値、冷水と煮沸の比0.8と吸水の時定数は仮定' },
    diagnostics: { soakedS: (endAt - d.startMs) / 1000 },
  };
  if (!ending) return res;

  let comp: Composition;
  try { comp = tileComp(tile); } catch (e) { return failed(req, EVAL, (e as Error).message, SCHEMA); }
  const waterComp: Composition = { water: water.amount.value };
  res.consumed = [{ lotId: tile.lotId, amount: { ...tile.amount } }, { lotId: water.lotId, amount: { ...water.amount } }];
  const obs: Observation[] = [];
  if (dehydroxExtent(comp) < pv('slakeIfDehydroxBelow')) {
    const slurry = addComp(comp, waterComp);
    const hist = Math.min(tile.quality?.history_complete ?? 1, water.quality?.history_complete ?? 1);
    res.produced = [{ materialId: 'clay_slurry_test', amount: { value: totalMg(slurry), unit: 'mg' }, quality: { ...tileQuality(slurry), history_complete: hist }, into: tile.location }];
    obs.push({ at: endAt, channel: 'sight', quantity: 'shape', text: '水の中で形が崩れ、泥に戻った' });
  } else {
    const s = (tile.quality?.sinter_ppm ?? 0) / 1e6;
    const aCold = (pv('absorptionLowFire') * (1 - s) + pv('absorptionVitrified') * s) * pv('coldSoakFraction');
    const t = (endAt - d.startMs) / 1000;
    // start from the water the piece already holds: W(t) = W0 + max(0, W∞ − W0)·(1 − e^(−t/τ))
    const w0 = comp.water ?? 0, wInf = aCold * dryMg(comp);
    const take = Math.max(0, Math.min(water.amount.value, Math.round(Math.max(0, wInf - w0) * (1 - Math.exp(-t / UPTAKE_TAU_S)))));
    const w = splitComp(waterComp, take);
    const soaked = addComp(comp, w.taken);
    res.produced = [
      { materialId: tile.materialId, amount: { value: totalMg(soaked), unit: 'mg' }, quality: { ...(tile.quality ?? {}), ...tileQuality(soaked) }, into: tile.location },
      { materialId: 'process_water', amount: { value: totalMg(w.rest), unit: 'mg' }, quality: { ...(water.quality ?? {}) }, into: water.location },
    ];
    const a = take / dryMg(comp);
    obs.push({ at: endAt, channel: 'sight', quantity: 'soak',
      text: a < 0.06 ? '泡はほとんど出ず、色もあまり変わらない' : a < 0.11 ? 'しばらく細かい泡が出て、少し色が濃くなった' : '泡が勢いよく出て、全体が濃く湿った色になった' });
    if ((tile.quality?.crack ?? 0) === 1) obs.push({ at: endAt, channel: 'sight', quantity: 'crack', text: '濡れると細いひびが浮かび上がった' });
  }
  res.observations = obs;
  return res;
}
