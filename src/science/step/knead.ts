// ScienceStep for kneading clay by hand on the bench (process p10y_clay_knead), contract 0.1.x / 0.2.x.
// Work done by hand: requests come on the world (real) clock, as weighing and shaping.
//
// Takes one or more lots of settled_clay / prepared_clay and, if wanted, one process_water lot, and kneads them into
// one even prepared_clay lot (water_ppm and the dry make-up xd_<species>_ppm, as shaping takes it). Too wet clay is not
// dried here: that is waiting (p10x_clay_slake, or the drying rack), on the island clock. Too stiff clay takes water.
// The hands' work (kneadPowerW, assumed) arrives as an offer spread evenly over the interval, like the bench's power for
// shaping: offered less, nothing happens in that interval (needs-input). Kneading time grows with the mass
// (kneadSecondsPerKg, assumed). The lots settle once, when the kneading is done. Not modelled: water lost to the air
// and to the board while kneading, air bubbles, how evenly it was kneaded.

import type { ScienceStepRequest, ScienceStepResult } from '../../world/science-contract';
import { addComp, totalMg, type Composition } from '../chem';
import { pv } from '../params';
import { allFinite, checkCommon, contractExtras, failed, fingerprint } from './common';
import { clayFeel, clayQuality, readClayBody } from './slake';

export const KNEAD_PROCESS = { processId: 'p10y_clay_knead', processVersion: '0.1.1' } as const; // 0.1.1: reads and writes clay as the tub does (Codex B1 on dd781fc)
const SCHEMA = 'civ-sci.clay-knead/1';
const EVAL = 'clay-knead-eval/0.1.1';
const BENCH = 'fixture_bench';
const CLAYS = ['settled_clay', 'prepared_clay'];

interface KneadData { fps: string[]; eqId: string; startMs: number; lastTo: number; durationMs: number; elapsedMs: number; reportedJ: number }

export function kneadStep(req: ScienceStepRequest): ScienceStepResult {
  const bad = checkCommon(req, KNEAD_PROCESS.processId, KNEAD_PROCESS.processVersion, SCHEMA);
  if (bad) return failed(req, EVAL, bad, SCHEMA);
  const clays = req.lots.filter((l) => CLAYS.includes(l.materialId)), waters = req.lots.filter((l) => l.materialId === 'process_water');
  if (clays.length < 1 || waters.length > 1 || clays.length + waters.length !== req.lots.length) {
    return failed(req, EVAL, 'expected one or more settled_clay / prepared_clay lots and at most one process_water lot', SCHEMA);
  }
  for (const c of clays) {
    const q = c.quality ?? {};
    if (!Number.isSafeInteger(q.water_ppm) || q.water_ppm < 0 || q.water_ppm >= 1e6 || !Object.keys(q).some((k) => /^xd_.+_ppm$/.test(k))) {
      return failed(req, EVAL, `clay-make-up-missing: lot ${c.lotId} needs water_ppm and xd_<species>_ppm`, SCHEMA);
    }
  }
  let comp: Composition = {};
  try { for (const c of clays) { const b = readClayBody(c, false); comp = addComp(comp, addComp(b.fine, b.water ? { water: b.water } : {})); } } catch (e) { return failed(req, EVAL, (e as Error).message, SCHEMA); }
  if (waters.length) comp = addComp(comp, { water: waters[0].amount.value });
  if (totalMg(comp) - (comp.water ?? 0) <= 0) return failed(req, EVAL, 'no clay solids to knead', SCHEMA);

  const bench = req.equipment.find((e) => e.kind === BENCH);
  if (!bench && req.stop !== 'equipment-lost') return failed(req, EVAL, `no ${BENCH}`, SCHEMA);
  if (req.actions.length) return failed(req, EVAL, `unknown action ${req.actions[0].action} (kneading takes no actions: it is done when the time is worked)`, SCHEMA);
  const fps = req.lots.map(fingerprint).sort();

  let d: KneadData;
  if (req.state === null) {
    if (!bench) return failed(req, EVAL, 'the bench was lost before the kneading began: nothing happened', SCHEMA);
    const total = req.lots.reduce((s, l) => s + l.amount.value, 0);
    d = { fps, eqId: bench.equipmentId, startMs: req.interval.from, lastTo: req.interval.from,
      durationMs: Math.max(1000, Math.ceil((pv('kneadSecondsPerKg') * total) / 1e6) * 1000), elapsedMs: 0, reportedJ: 0 };
  } else {
    d = structuredClone(req.state.data as KneadData);
    if (d.fps.join('|') !== fps.join('|')) return failed(req, EVAL, 'changed-input: a reserved lot changed under a running run', SCHEMA);
    if (bench && bench.equipmentId !== d.eqId) return failed(req, EVAL, 'changed-input: the bench changed under a running run', SCHEMA);
    if (req.interval.from !== d.lastTo) return failed(req, EVAL, `noncontiguous-interval: expected from=${d.lastTo}`, SCHEMA);
  }
  const offers = req.energy.filter((e) => e.kind === 'mechanical');
  if (offers.length !== 1 || req.energy.length !== 1) return failed(req, EVAL, 'expected one mechanical energy offer (the hands)', SCHEMA);
  const offer = offers[0];

  // the hands' work arrives evenly; kneading goes on only while the needed power arrives
  const span = req.interval.to - req.interval.from, power = pv('kneadPowerW');
  const enough = span > 0 && (offer.maxJ * 1000) / span >= power;
  const worked = enough ? Math.min(span, d.durationMs - d.elapsedMs) : 0; // a stop is at interval.to: the work before it counts
  d.elapsedMs += worked;
  const done = d.elapsedMs >= d.durationMs;
  const endAt = worked > 0 ? req.interval.from + worked : req.interval.to;
  const cumJ = Math.floor((power * d.elapsedMs) / 1000 + 1e-9), usedJ = cumJ - d.reportedJ;
  d.reportedJ = cumJ;
  d.lastTo = done ? endAt : req.interval.to;
  if (!allFinite(d)) return failed(req, EVAL, 'non-finite state: refusing to return it', SCHEMA);
  const stopped = !done && (req.stop === 'operator' || req.stop === 'equipment-lost');

  const res: ScienceStepResult = {
    ...contractExtras(req), contract: req.contract, requestId: req.requestId, runId: req.runId,
    simulated: { from: req.interval.from, to: done ? endAt : req.interval.to }, state: { schema: SCHEMA, data: d },
    status: done ? 'completed' : stopped ? 'stopped' : worked === 0 && span > 0 ? 'needs-input' : 'running',
    consumed: [], produced: [], released: [],
    energy: usedJ > 0 ? [{ sourceId: offer.sourceId, kind: 'mechanical', usedJ, lostJ: usedJ, storedJ: 0 }] : [],
    equipmentWear: [], observations: [],
    evidence: { evaluatorVersion: EVAL, sourceRefs: [], notes: '練る時間と手の仕事率は仮定。練っている間の水の出入り・気泡・練りむらは扱わない' },
    diagnostics: { elapsedS: d.elapsedMs / 1000, durationS: d.durationMs / 1000, waterRatio: (comp.water ?? 0) / (totalMg(comp) - (comp.water ?? 0)) },
  };
  if (!done) return res;
  const hist = req.lots.every((l) => (l.quality?.history_complete ?? 1) === 1) ? 1 : 0;
  res.consumed = req.lots.map((l) => ({ lotId: l.lotId, amount: { ...l.amount } }));
  res.produced = [{ materialId: 'prepared_clay', amount: { value: totalMg(comp), unit: 'mg' }, into: clays[0].location,
    quality: { ...clayQuality(comp), history_complete: hist } }];
  const wr = (comp.water ?? 0) / (totalMg(comp) - (comp.water ?? 0));
  res.observations = [{ at: endAt, channel: 'touch', quantity: 'feel', text: clayFeel(wr) }];
  return res;
}
