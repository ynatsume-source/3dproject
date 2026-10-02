// The clay test-tile loop: prepare → shape → dry → fire (incl. controlled cooling) → soak test / inspect.
// Every function reads a WorldView and a command and returns a Proposal. Nothing here mutates the view.

import { addComp, react, REACTIONS, splitComp, totalMg, type Composition } from './chem';
import { pv } from './params';
import {
  crackP, dehydroxExtent, dryMg, dryPhysics, fuelLhvJPerMg, glowCategory, GLOW_TARGET_C, KINETICS, PACE_K_PER_H, waterRatio,
} from './physics';
import { draw } from './rng';
import {
  emptyProposal, reject, type Command, type EnergyAccount, type EnvSample, type Facility, type MaterialLot,
  type Observation, type ProcessRun, type Proposal, type Reservation, type Sample, type WorldView,
} from './types';

type Cmd<T extends Command['type']> = Extract<Command, { type: T }>;

export const PROCESS_VERSIONS = {
  prepare: { id: 'p10_clay_prepare', version: 1 },
  shape: { id: 'p11x_test_tile_shape', version: 1 },
  drying: { id: 'p12x_test_tile_dry', version: 1 },
  firing: { id: 'p13x_test_tile_fire', version: 1 },
  soak: { id: 'm01_cold_soak_absorption', version: 1 },
};

const DRY_STEP_S = 600;
const FIRE_STEP_S = 30;
const SOAK_S = 24 * 3600;
const UNLOAD_C = 60;
const RAMP_GIVE_UP_S = 2 * 3600;

const zeroEnergy = (): EnergyAccount =>
  ({ releasedJ: 0, flueLossJ: 0, wallLossJ: 0, wareSensibleJ: 0, reactionsNetJ: 0, structureStoredJ: 0, envHeatInJ: 0 });

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const remaining = (r: Reservation) => r.mg - r.consumedMg;

function ev(p: Proposal, cmd: Command, type: string, subjectIds: string[], summary: string) {
  p.events.push({ id: `${cmd.commandId}:ev${p.events.length}`, commandId: cmd.commandId, atMs: cmd.atMs, type, subjectIds, summary });
}
function obs(p: Proposal, cmd: Command, o: Omit<Observation, 'id' | 'atMs' | 'residentId'> & { atMs?: number }) {
  p.observations.push({ id: `${cmd.commandId}:obs${p.observations.length}`, residentId: cmd.actorId, atMs: o.atMs ?? cmd.atMs, ...o });
}
const putLot = (p: Proposal, w: WorldView, lot: MaterialLot) => p.lots.push({ entity: lot, expectVersion: w.lots[lot.id]?.version ?? null });
const putSample = (p: Proposal, w: WorldView, s: Sample) => p.samples.push({ entity: s, expectVersion: w.samples[s.id]?.version ?? null });
const putFac = (p: Proposal, w: WorldView, f: Facility) => p.facilities.push({ entity: f, expectVersion: w.facilities[f.id].version });
const putRes = (p: Proposal, w: WorldView, r: Reservation) => p.reservations.push({ entity: r, expectVersion: w.reservations[r.id]?.version ?? null });
const putRun = (p: Proposal, w: WorldView, r: ProcessRun) => p.runs.push({ entity: r, expectVersion: w.runs[r.id]?.version ?? null });

// ---- reservations ---------------------------------------------------------------------

export function reserve(w: WorldView, cmd: Cmd<'reserve'>): Proposal {
  const lot = w.lots[cmd.lotId];
  if (!lot) return reject('unknown_lot', cmd.lotId);
  if (lot.protected) return reject('protected_resource', `${lot.label} は暮らし・回復用の保護資源で、研究には予約できない`);
  if (w.reservations[cmd.reservationId]) return reject('duplicate_id', cmd.reservationId);
  if (!w.research[cmd.researchId]) return reject('unknown_research', cmd.researchId);
  const held = Object.values(w.reservations).filter((r) => r.open && r.lotId === lot.id).reduce((s, r) => s + remaining(r), 0);
  const free = totalMg(lot.comp) - held;
  if (cmd.mg <= 0 || cmd.mg > free) return reject('insufficient', `${lot.label}: 予約可能 ${free} mg、要求 ${cmd.mg} mg`);
  const p = emptyProposal();
  putRes(p, w, { id: cmd.reservationId, researchId: cmd.researchId, purpose: cmd.purpose, lotId: lot.id, mg: cmd.mg, consumedMg: 0, open: true, version: 0 });
  ev(p, cmd, 'ResearchAllocationReserved', [lot.id, cmd.reservationId], `${lot.label} を ${cmd.mg / 1000} g 研究用に予約（${cmd.purpose}）`);
  return p;
}

export function release(w: WorldView, cmd: Cmd<'release'>): Proposal {
  const r = w.reservations[cmd.reservationId];
  if (!r) return reject('unknown_reservation', cmd.reservationId);
  if (!r.open) return emptyProposal();
  const p = emptyProposal();
  putRes(p, w, { ...r, open: false });
  ev(p, cmd, 'ReservationReleased', [r.id], `未使用 ${remaining(r) / 1000} g を解放`);
  return p;
}

function consume(p: Proposal, w: WorldView, r: Reservation, mg: number): Reservation | string {
  const prior = p.reservations.find((x) => x.entity.id === r.id)?.entity ?? r;
  if (!prior.open) return `reservation ${r.id} is closed`;
  if (mg > remaining(prior)) return `reservation ${r.id}: need ${mg} mg, left ${remaining(prior)} mg`;
  const next = { ...prior, consumedMg: prior.consumedMg + mg };
  p.reservations = p.reservations.filter((x) => x.entity.id !== r.id);
  putRes(p, w, next);
  return next;
}

// ---- prepare & shape ------------------------------------------------------------------

export function prepareClay(w: WorldView, cmd: Cmd<'prepare_clay'>): Proposal {
  const cr = w.reservations[cmd.clayReservationId], wr = w.reservations[cmd.waterReservationId];
  if (!cr || !wr) return reject('unknown_reservation', 'clay or water reservation missing');
  const clay = w.lots[cr.lotId], water = w.lots[wr.lotId];
  if (clay.kind !== 'clay') return reject('wrong_material', `${clay.label} is not clay`);
  if (water.kind !== 'water') return reject('wrong_material', `${water.label} is not water`);
  if (w.lots[cmd.outLotId]) return reject('duplicate_id', cmd.outLotId);
  const { taken, rest } = splitComp(clay.comp, cmd.rawMg);
  const need = Math.round(cmd.targetWaterRatio * dryMg(taken) - (taken.water ?? 0));
  if (need < 0) return reject('too_wet', `原土の含水がすでに目標を超えている（${waterRatio(taken).toFixed(2)}）。乾かす工程はv0にない`);
  const p = emptyProposal();
  const c1 = consume(p, w, cr, cmd.rawMg); if (typeof c1 === 'string') return reject('reservation', c1);
  const c2 = consume(p, w, wr, need); if (typeof c2 === 'string') return reject('reservation', c2);
  const wTake = splitComp(water.comp, need);
  putLot(p, w, { ...clay, comp: rest });
  putLot(p, w, { ...water, comp: wTake.rest });
  const out = addComp(taken, wTake.taken);
  putLot(p, w, {
    id: cmd.outLotId, kind: 'clay', label: `調整した粘土（${clay.label}）`, comp: out, location: `research:${cr.researchId}`,
    provenance: clay.provenance, protected: false, version: 0,
  });
  ev(p, cmd, 'MaterialProcessed', [clay.id, water.id, cmd.outLotId],
    `原土 ${cmd.rawMg / 1000} g に水 ${need / 1000} g を加えて練る（含水比 ${waterRatio(out).toFixed(3)}）`);
  p.evidence.push({ params: ['clayWaterPlastic'], note: '成形に適した含水比の目安' });
  return p;
}

export function shapeTiles(w: WorldView, cmd: Cmd<'shape_tiles'>): Proposal {
  const lot = w.lots[cmd.lotId];
  if (!lot || lot.kind !== 'clay') return reject('wrong_material', cmd.lotId);
  if (lot.location !== `research:${cmd.researchId}`) return reject('not_allocated', `${lot.id} は研究 ${cmd.researchId} の手元にない`);
  const wr = waterRatio(lot.comp), target = pv('clayWaterPlastic');
  if (Math.abs(wr - target) > 0.06) return reject('not_plastic', `含水比 ${wr.toFixed(2)} では形を保てない（目安 ${target}±0.06）`);
  const sum = cmd.tiles.reduce((s, t) => s + t.massMg, 0);
  const trim = Math.round(sum * cmd.trimFraction);
  if (sum + trim > totalMg(lot.comp)) return reject('insufficient', `必要 ${(sum + trim) / 1000} g、手元 ${totalMg(lot.comp) / 1000} g`);
  const p = emptyProposal();
  let comp = lot.comp;
  for (const t of cmd.tiles) {
    if (w.samples[t.sampleId]) return reject('duplicate_id', t.sampleId);
    const s = splitComp(comp, t.massMg); comp = s.rest;
    putSample(p, w, {
      id: t.sampleId, label: t.label, researchId: cmd.researchId, comp: s.taken, shapedWaterRatio: waterRatio(s.taken),
      greenDimsMm: t.dimsMm, linearShrink: 0, stage: 'formed', location: `research:${cmd.researchId}`,
      maxWareTempC: -273, sinter: 0, dehydrox: dehydroxExtent(s.taken), deformed: false, cracks: [],
      risk: { dryFluxRatioMax: 0, steamRatioMax: 0, duntRatioMax: 0 }, historyComplete: true,
      history: [{ runId: '-', process: PROCESS_VERSIONS.shape.id, atMs: cmd.atMs, summary: `${t.dimsMm.w}×${t.dimsMm.l}×${t.dimsMm.t} mm に成形` }],
      version: 0,
    });
  }
  const tr = splitComp(comp, trim);
  putLot(p, w, { ...lot, comp: tr.rest });
  const scrap = w.lots[cmd.scrapLotId];
  putLot(p, w, scrap ? { ...scrap, comp: addComp(scrap.comp, tr.taken) } : {
    id: cmd.scrapLotId, kind: 'clay_scrap', label: '削りくず（未焼成・水で戻せる）', comp: tr.taken,
    location: `research:${cmd.researchId}`, provenance: lot.provenance, protected: false, version: 0,
  });
  ev(p, cmd, 'SamplesShaped', cmd.tiles.map((t) => t.sampleId), `${cmd.tiles.length}枚の試験片を成形、削りくず ${trim / 1000} g`);
  return p;
}

// ---- drying ---------------------------------------------------------------------------

function checkFacility(w: WorldView, id: string, kinds: Facility['kind'][], n: number): Facility | string {
  const f = w.facilities[id];
  if (!f) return `設備 ${id} は存在しない`;
  if (!kinds.includes(f.kind)) return `${f.label} はこの工程に使えない`;
  if (!f.exists) return `${f.label} はまだ実在しない（計画のみ／失われた）`;
  if (f.condition !== 'ok') return `${f.label} は損傷している`;
  if (f.occupiedBy) return `${f.label} は ${f.occupiedBy} が使用中`;
  if (n > f.capacitySamples) return `${f.label} に入るのは ${f.capacitySamples} 枚まで`;
  return f;
}

function newRun(cmd: Command & { runId: string; researchId: string }, kind: ProcessRun['kind'], facilityId: string,
  sampleIds: string[], stepS: number, seed: number, proc: { id: string; version: number }): ProcessRun {
  return {
    id: cmd.runId, kind, processId: proc.id, processVersion: proc.version, status: 'active', researchId: cmd.researchId,
    actorId: cmd.actorId, facilityId, sampleIds, seed, startMs: cmd.atMs, lastMs: cmd.atMs, stepS, stepIndex: 0, envIds: [],
    energy: zeroEnergy(), checkpoints: [], version: 0,
  };
}

export function startDrying(w: WorldView, cmd: Cmd<'start_drying'>): Proposal {
  if (w.runs[cmd.runId]) return reject('duplicate_id', cmd.runId);
  const f = checkFacility(w, cmd.facilityId, ['drying_shade', 'drying_sun'], cmd.sampleIds.length);
  if (typeof f === 'string') return reject('facility', f);
  const p = emptyProposal();
  for (const id of cmd.sampleIds) {
    const s = w.samples[id];
    if (!s) return reject('unknown_sample', id);
    if (s.stage !== 'formed' && s.stage !== 'leather') return reject('wrong_stage', `${s.label} は ${s.stage}`);
    if (s.location.startsWith('facility:')) return reject('busy', `${s.label} は別の工程中`);
    putSample(p, w, { ...s, location: `facility:${f.id}` });
  }
  putFac(p, w, { ...f, occupiedBy: cmd.runId });
  putRun(p, w, newRun(cmd, 'drying', f.id, cmd.sampleIds, DRY_STEP_S, cmd.seed, PROCESS_VERSIONS.drying));
  ev(p, cmd, 'ProcessStarted', [cmd.runId, ...cmd.sampleIds], `${f.label} で乾燥を開始`);
  return p;
}

function dryStep(s: Sample, env: EnvSample, sunny: boolean, dt: number): { s: Sample; evapMg: number; crossedCritical: boolean } {
  const o = dryPhysics({ waterMg: s.comp.water ?? 0, dryMg: dryMg(s.comp), shapedWaterRatio: s.shapedWaterRatio, linearShrink: s.linearShrink,
    dimsMm: s.greenDimsMm, airTempC: env.airTempC, rh: env.rh, windMs: env.windMs, sun: sunny ? env.solar : 0, dtS: dt });
  const ns: Sample = clone(s);
  ns.comp = addComp(s.comp, { water: o.evapMg }, -1);
  if (o.fluxRatio !== null) ns.risk.dryFluxRatioMax = Math.max(ns.risk.dryFluxRatioMax, o.fluxRatio);
  ns.linearShrink = o.linearShrink;
  ns.stage = o.stage;
  return { s: ns, evapMg: o.evapMg, crossedCritical: o.crossedCritical };
}

function drawCrack(s: Sample, run: ProcessRun, mech: 'drying' | 'steam' | 'dunting', ratio: number) {
  const p = crackP(ratio);
  if (p <= 0) return;
  const u = draw(run.seed, run.id, s.id, mech);
  if (u >= p) return;
  const severe = draw(run.seed, run.id, s.id, mech, 'severity') < Math.min(0.8, 0.25 * ratio);
  const visible = severe || draw(run.seed, run.id, s.id, mech, 'visible') < 0.5;
  s.cracks.push({ mechanism: mech, severity: severe ? 'through' : 'hairline', runId: run.id, ratio: +ratio.toFixed(3), p: +p.toFixed(3), visibleDry: visible });
}

function advanceDrying(w: WorldView, cmd: Cmd<'advance'>, run: ProcessRun): Proposal {
  const p = emptyProposal();
  const f = w.facilities[run.facilityId];
  const sunny = f.kind === 'drying_sun';
  const r = clone(run);
  const samples = run.sampleIds.map((id) => clone(w.samples[id]));
  let evapTotal = 0;
  const stepTo = (limitMs: number) => {
    while (r.lastMs + r.stepS * 1000 <= limitMs) {
      for (let i = 0; i < samples.length; i++) {
        const out = dryStep(samples[i], cmd.env, sunny, r.stepS);
        samples[i] = out.s; evapTotal += out.evapMg;
        if (out.crossedCritical) drawCrack(samples[i], r, 'drying', samples[i].risk.dryFluxRatioMax);
      }
      r.lastMs += r.stepS * 1000; r.stepIndex++;
      if (r.stepIndex % 36 === 0) r.checkpoints.push({ tMin: (r.lastMs - r.startMs) / 60000, kilnC: cmd.env.airTempC, wareC: cmd.env.airTempC, burnKgPerH: 0,
        waterRatio: +waterRatio(samples[0].comp).toFixed(4) });
    }
  };
  if (cmd.outage && cmd.outage.toMs > r.lastMs) {
    stepTo(Math.min(cmd.outage.fromMs, cmd.untilMs));
    // Drying is passive, but the weather during the outage is unknown: do not invent it.
    const skipTo = r.startMs + Math.ceil((cmd.outage.toMs - r.startMs) / (r.stepS * 1000)) * r.stepS * 1000;
    if (skipTo > r.lastMs) {
      r.stepIndex += Math.round((skipTo - r.lastMs) / (r.stepS * 1000));
      r.lastMs = skipTo;
      r.gap = { fromMs: cmd.outage.fromMs, toMs: cmd.outage.toMs };
      samples.forEach((s) => { s.historyComplete = false; s.history.push({ runId: r.id, process: run.processId, atMs: cmd.outage!.fromMs, summary: '運用停止で乾燥の経過が不明な区間がある（試験の根拠から除外）' }); });
      ev(p, cmd, 'OperationalGap', [r.id], `運用停止 ${(cmd.outage.toMs - cmd.outage.fromMs) / 3600000} h：天候不明のため乾燥を計算していない`);
    }
  }
  stepTo(cmd.untilMs);
  if (!r.envIds.includes(cmd.env.id)) r.envIds.push(cmd.env.id);
  const heat = (evapTotal / 1e6) * pv('latentHeatWater25');
  r.energy.envHeatInJ += heat;
  samples.forEach((s) => putSample(p, w, { ...s, version: w.samples[s.id].version }));
  putRun(p, w, r);
  if (evapTotal > 0) {
    p.boundary.push({ id: `${cmd.commandId}:b0`, runId: r.id, atMs: r.lastMs, direction: 'out', medium: 'atmosphere', comp: { water: evapTotal }, note: '乾燥で大気へ出た水蒸気' });
    p.energy.push({ id: `${cmd.commandId}:e0`, runId: r.id, fromMs: run.lastMs, toMs: r.lastMs, kind: 'heat', source: `environment:${cmd.env.id}`,
      account: { ...zeroEnergy(), envHeatInJ: heat } });
  }
  p.evidence.push({ params: ['evapCoeff', 'clayWaterCritical', 'clayShrinkLinear', 'dryCrackFluxRef', 'sunSurfaceExcessC', 'latentHeatWater25'], note: '乾燥：Dalton型蒸発・二段乾燥・収縮期の速度で割れ' });
  return p;
}

export function finishDrying(w: WorldView, cmd: Cmd<'finish_drying'>): Proposal {
  const run = w.runs[cmd.runId];
  if (!run || run.kind !== 'drying') return reject('unknown_run', cmd.runId);
  if (run.status !== 'active') return emptyProposal();
  const p = emptyProposal();
  const days = (run.lastMs - run.startMs) / 86400000;
  for (const id of run.sampleIds) {
    const s = clone(w.samples[id]);
    s.location = `research:${run.researchId}`;
    s.history.push({ runId: run.id, process: run.processId, atMs: cmd.atMs, summary: `${days.toFixed(1)} 日乾燥、含水比 ${waterRatio(s.comp).toFixed(3)}、収縮 ${(s.linearShrink * 100).toFixed(1)}%` });
    putSample(p, w, { ...s, version: w.samples[id].version });
    obs(p, cmd, { sampleId: id, runId: run.id, kind: 'dryness', value: s.stage === 'dry' ? '白っぽく乾き、持っても冷たくない' : s.stage === 'leather' ? '色は濃さが残り、触るとまだひんやりする' : 'まだ柔らかく湿っている', text: `${s.label}：乾き具合` });
    obs(p, cmd, { sampleId: id, runId: run.id, kind: 'duration', value: +days.toFixed(1), unit: '日', text: `${s.label}：乾燥した日数` });
  }
  putRun(p, w, { ...run, status: 'completed', outcome: 'taken_off_rack' });
  putFac(p, w, { ...w.facilities[run.facilityId], occupiedBy: null });
  ev(p, cmd, 'ProcessCompleted', [run.id], `乾燥を終了（${days.toFixed(1)} 日）`);
  return p;
}

// ---- firing ---------------------------------------------------------------------------

export function startFiring(w: WorldView, cmd: Cmd<'start_firing'>): Proposal {
  if (w.runs[cmd.runId]) return reject('duplicate_id', cmd.runId);
  const f = checkFacility(w, cmd.facilityId, ['open_fire', 'kiln'], cmd.sampleIds.length);
  if (typeof f === 'string') return reject('facility', f);
  if (!f.thermal) return reject('facility', `${f.label} に熱の仕様がない`);
  const fr = w.reservations[cmd.fuelReservationId];
  if (!fr || !fr.open) return reject('no_fuel', '燃料の予約がない：設備があっても、この回に燃やせる燃料がなければ焼成できない');
  const fuel = w.lots[fr.lotId];
  if (fuel.kind !== 'fuel') return reject('wrong_material', `${fuel.label} は燃料ではない`);
  if (remaining(fr) <= 0) return reject('no_fuel', '予約した燃料が残っていない');
  if (w.lots[cmd.ashLotId]) return reject('duplicate_id', cmd.ashLotId);
  const p = emptyProposal();
  const wareC: Record<string, number> = {};
  for (const id of cmd.sampleIds) {
    const s = w.samples[id];
    if (!s) return reject('unknown_sample', id);
    if (!['formed', 'leather', 'dry'].includes(s.stage)) return reject('wrong_stage', `${s.label} は ${s.stage}（未焼成の素地だけを焼成できる）`);
    if (s.location.startsWith('facility:')) return reject('busy', `${s.label} は別の工程中`);
    putSample(p, w, { ...s, location: `facility:${f.id}` });
    wareC[id] = cmd.env.airTempC;
  }
  const schedule = { rampKPerH: PACE_K_PER_H[cmd.plan.pace], peakC: GLOW_TARGET_C[cmd.plan.targetGlow], holdMin: cmd.plan.holdMin, cooling: cmd.plan.cooling };
  const run = newRun(cmd, 'firing', f.id, cmd.sampleIds, FIRE_STEP_S, cmd.seed, PROCESS_VERSIONS.firing);
  Object.assign(run, {
    plan: cmd.plan, schedule, fuelReservationId: fr.id, fuelBurnedMg: 0, kilnC: cmd.env.airTempC, ambientC: cmd.env.airTempC,
    wareC, phase: 'ramp', peakKilnC: cmd.env.airTempC, ashLotId: cmd.ashLotId, envIds: [cmd.env.id],
    ware: Object.fromEntries(cmd.sampleIds.map((id) => [id, { base: w.samples[id].comp, ext: { water: 0, organic: 0, dehydrox: 0, calc: 0 } }])),
    fuelBurnedComp: {}, emitted: { out: {}, in: {} },
  });
  putRun(p, w, run);
  putFac(p, w, { ...f, occupiedBy: cmd.runId });
  putLot(p, w, { id: cmd.ashLotId, kind: 'ash', label: `灰（${f.label}・${cmd.runId}）`, comp: {}, location: `facility:${f.id}`,
    provenance: fuel.provenance, protected: false, version: 0 });
  ev(p, cmd, 'ProcessStarted', [cmd.runId, f.id, ...cmd.sampleIds], `${f.label} で焼成を開始（${cmd.plan.pace}、目標の色 ${cmd.plan.targetGlow}、保持 ${cmd.plan.holdMin} 分）`);
  return p;
}

interface FireCtx {
  run: ProcessRun; fac: Facility; samples: Sample[]; fuel: MaterialLot; fuelRes: Reservation; env: EnvSample; log: string[];
}

type Ext = { water: number; organic: number; dehydrox: number; calc: number };

/**
 * Composition of a piece from its composition at the start of firing and cumulative extents.
 * Rounded once from totals (not step by step), so mass closes exactly and elements within ~1 mg.
 */
export function wareComp(base: Composition, ext: Ext): { comp: Composition; out: Composition; inn: Composition } {
  let comp: Composition = { ...base };
  let out: Composition = {}, inn: Composition = {};
  const conv = (sp: 'water' | 'organic_c' | 'kaolinite' | 'calcite', e: number) => (base[sp] ?? 0) - Math.round((base[sp] ?? 0) * (1 - e));
  const w = conv('water', ext.water);
  if (w > 0) { comp = addComp(comp, { water: w }, -1); out = addComp(out, { water: w }); }
  const o = conv('organic_c', ext.organic);
  if (o > 0) {
    const r = react('organic_c', o, REACTIONS.organicBurnout.coeffs, 'co2');
    comp = addComp(comp, { organic_c: o }, -1); inn = addComp(inn, { o2: r.consumed.o2 ?? 0 }); out = addComp(out, r.produced);
  }
  const k = conv('kaolinite', ext.dehydrox);
  if (k > 0) {
    const r = react('kaolinite', k, REACTIONS.dehydroxylation.coeffs, 'water');
    comp = addComp(addComp(comp, { kaolinite: k }, -1), { metakaolin: r.produced.metakaolin ?? 0 }); out = addComp(out, { water: r.produced.water ?? 0 });
  }
  const c = conv('calcite', ext.calc);
  if (c > 0) {
    const r = react('calcite', c, REACTIONS.calcination.coeffs, 'co2');
    comp = addComp(addComp(comp, { calcite: c }, -1), { lime: r.produced.lime ?? 0 }); out = addComp(out, { co2: r.produced.co2 ?? 0 });
  }
  return { comp, out, inn };
}

/** Gases from everything burned so far (cumulative), plus the ash. */
function fuelProducts(burned: Composition): { out: Composition; inn: Composition; ash: Composition } {
  let out: Composition = {}, inn: Composition = {};
  if (burned.wood_dry) {
    const r = react('wood_dry', burned.wood_dry, REACTIONS.woodCombustion.coeffs, 'water');
    inn = { o2: r.consumed.o2 ?? 0 }; out = r.produced;
  }
  if (burned.water) out = addComp(out, { water: burned.water });
  return { out, inn, ash: burned.ash ? { ash: burned.ash } : {} };
}

function fireStep(c: FireCtx) {
  const { run, fac, env } = c;
  const th = fac.thermal!;
  const sch = run.schedule!;
  const dt = run.stepS;
  const Ta = env.airTempC;
  const tS = run.stepIndex * dt;
  const Tk = run.kilnC!;
  // ---- operator control (world-side law from the resident's plan)
  let target: number | null = null, rampKs = 0;
  if (run.phase === 'ramp') {
    target = Math.min(sch.peakC, run.ambientC! + (sch.rampKPerH * tS) / 3600);
    rampKs = target < sch.peakC ? sch.rampKPerH / 3600 : 0;
    if (Tk >= sch.peakC - 3) { run.phase = 'hold'; run.holdStartStep = run.stepIndex; c.log.push(`目標の色に達した（${(tS / 3600).toFixed(1)} h）`); }
    else if (tS > (sch.peakC - run.ambientC!) / sch.rampKPerH * 3600 + RAMP_GIVE_UP_S) {
      run.phase = 'cool'; run.outcome = 'peak_not_reached';
      c.log.push(`いくら薪を足しても目標の色にならず、あきらめて冷ます（${(tS / 3600).toFixed(1)} h）`);
    }
  }
  if (run.phase === 'hold') {
    target = sch.peakC;
    if ((run.stepIndex - run.holdStartStep!) * dt >= sch.holdMin * 60) { run.phase = 'cool'; c.log.push(`保持を終えて冷却へ（${(tS / 3600).toFixed(1)} h）`); }
  }
  const lhv = fuelLhvJPerMg(c.fuel.comp);
  let burnMg = 0;
  if ((run.phase === 'ramp' || run.phase === 'hold') && target !== null) {
    const want = th.heatCapJPerK * rampKs + th.uaWPerK * (target - Ta) + (th.heatCapJPerK * (target - Tk)) / 600;
    const kgS = Math.min(Math.max(0, want / (lhv * 1e6 * th.chamberFraction)), th.maxBurnKgPerH / 3600);
    burnMg = Math.min(Math.round(kgS * dt * 1e6), remaining(c.fuelRes), totalMg(c.fuel.comp));
    if (burnMg === 0 && remaining(c.fuelRes) <= 0) {
      run.phase = 'cool'; run.outcome = 'fuel_exhausted';
      c.log.push(`予約した薪を使い切った（${(tS / 3600).toFixed(1)} h）`);
    }
  }
  // ---- fuel taken from the lot (gases and ash are derived from the cumulative total later)
  let released = 0;
  if (burnMg > 0) {
    const b = splitComp(c.fuel.comp, burnMg);
    c.fuel = { ...c.fuel, comp: b.rest };
    c.fuelRes = { ...c.fuelRes, consumedMg: c.fuelRes.consumedMg + burnMg };
    run.fuelBurnedMg! += burnMg;
    run.fuelBurnedComp = addComp(run.fuelBurnedComp!, b.taken);
    released = burnMg * lhv;
  }
  const chamberIn = released * th.chamberFraction;
  const flue = released - chamberIn;
  const ua = run.phase === 'cool' && sch.cooling === 'forced' ? th.uaWPerK * th.forcedCoolingUaFactor : th.uaWPerK;
  const wall = ua * (Tk - Ta) * dt;
  // ---- ware
  let wareSens = 0, wareRx = 0;
  for (const s of c.samples) {
    const wr0 = run.ware![s.id];
    const base = wr0.base, e = wr0.ext;
    const now = wareComp(base, e).comp;
    const prev = run.wareC![s.id];
    const tau = pv('wareLagS10mm') * (s.greenDimsMm.t / 10) ** 2;
    const Tw = prev + (Tk - prev) * (1 - Math.exp(-dt / tau));
    const dTw = Tw - prev;
    wareSens += (totalMg(now) / 1000) * pv('cpCeramic') * dTw;
    const rateKh = (dTw / dt) * 3600;
    const wr = waterRatio(now);
    if (Tw >= 90 && Tw <= 250 && wr > pv('steamMoistureLimit') && rateKh > 0) {
      s.risk.steamRatioMax = Math.max(s.risk.steamRatioMax, (wr / pv('steamMoistureLimit')) * (rateKh / pv('steamRateLimit')));
    }
    const qi = pv('quartzInversionC');
    if ((prev - qi) * (Tw - qi) <= 0 && dTw !== 0 && (base.quartz ?? 0) > 0) {
      const lim = pv('duntRateLimit10mm') * (10 / s.greenDimsMm.t);
      s.risk.duntRatioMax = Math.max(s.risk.duntRatioMax, Math.abs(rateKh) / lim);
    }
    const adv = (x: number, k: number) => x + (1 - x) * (1 - Math.exp(-k * dt));
    const ne: Ext = { water: adv(e.water, KINETICS.water(Tw)), organic: adv(e.organic, KINETICS.organic(Tw)),
      dehydrox: adv(e.dehydrox, KINETICS.dehydrox(Tw)), calc: adv(e.calc, KINETICS.calcination(Tw)) };
    wareRx += ((ne.water - e.water) * (base.water ?? 0) / 1e6) * pv('latentHeatWater100');
    wareRx -= ((ne.organic - e.organic) * (base.organic_c ?? 0) / 1000 / 12.011) * pv('dHCarbonCombustion');
    wareRx += ((ne.dehydrox - e.dehydrox) * (base.kaolinite ?? 0) / 1e6) * pv('dHDehydroxylation');
    wareRx += ((ne.calc - e.calc) * (base.calcite ?? 0) / 1000 / 100.09) * pv('dHCalcination');
    wr0.ext = ne;
    if (ne.dehydrox >= pv('slakeIfDehydroxBelow')) s.sinter += (1 - s.sinter) * (1 - Math.exp(-KINETICS.sinter(Tw) * dt));
    s.maxWareTempC = Math.max(s.maxWareTempC, Tw);
    run.wareC![s.id] = Tw;
  }
  const nextTk = Tk + (chamberIn - wall - wareSens - wareRx) / th.heatCapJPerK;
  run.kilnC = nextTk;
  run.peakKilnC = Math.max(run.peakKilnC!, nextTk);
  const en = run.energy;
  en.releasedJ += released; en.flueLossJ += flue; en.wallLossJ += wall; en.wareSensibleJ += wareSens; en.reactionsNetJ += wareRx;
  en.structureStoredJ += th.heatCapJPerK * (nextTk - Tk);
  run.stepIndex++;
  run.lastMs += dt * 1000;
  if (run.stepIndex % 10 === 0) {
    run.checkpoints.push({ tMin: +(run.stepIndex * dt / 60).toFixed(1), kilnC: +nextTk.toFixed(1),
      wareC: +Math.max(...c.samples.map((s) => run.wareC![s.id])).toFixed(1), burnKgPerH: +((burnMg / 1e6) / dt * 3600).toFixed(2) });
  }
  if (run.phase === 'cool' && Math.max(...c.samples.map((s) => run.wareC![s.id])) < UNLOAD_C) run.phase = 'done';
}

/** Split a signed difference (now − before) into an out-flow and an in-flow of non-negative amounts. */
function delta(now: Composition, before: Composition): { pos: Composition; neg: Composition } {
  const pos: Composition = {}, neg: Composition = {};
  for (const k of new Set([...Object.keys(now), ...Object.keys(before)]) as Set<keyof Composition>) {
    const d = (now[k] ?? 0) - (before[k] ?? 0);
    if (d > 0) pos[k] = d; else if (d < 0) neg[k] = -d;
  }
  return { pos, neg };
}

function advanceFiring(w: WorldView, cmd: Cmd<'advance'>, run0: ProcessRun): Proposal {
  const run = clone(run0);
  const c: FireCtx = {
    run, fac: w.facilities[run.facilityId], samples: run.sampleIds.map((id) => clone(w.samples[id])),
    fuel: clone(w.lots[w.reservations[run.fuelReservationId!].lotId]),
    fuelRes: clone(w.reservations[run.fuelReservationId!]), env: cmd.env, log: [],
  };
  const p = emptyProposal();
  const fromMs = run.lastMs;
  const limit = cmd.outage ? Math.min(cmd.outage.fromMs, cmd.untilMs) : cmd.untilMs;
  while (run.phase !== 'done' && run.lastMs + run.stepS * 1000 <= limit) fireStep(c);
  if (!run.envIds.includes(cmd.env.id)) run.envIds.push(cmd.env.id);
  for (const line of c.log) ev(p, cmd, 'FiringProgress', [run.id], line);

  // materialise compositions from cumulative totals
  let totOut: Composition = {}, totIn: Composition = {};
  for (const s of c.samples) {
    const r = wareComp(run.ware![s.id].base, run.ware![s.id].ext);
    s.comp = r.comp; s.dehydrox = dehydroxExtent(r.comp);
    totOut = addComp(totOut, r.out); totIn = addComp(totIn, r.inn);
  }
  const fp = fuelProducts(run.fuelBurnedComp!);
  totOut = addComp(totOut, fp.out); totIn = addComp(totIn, fp.inn);
  const dOut = delta(totOut, run.emitted!.out), dIn = delta(totIn, run.emitted!.in);
  const flowOut = addComp(dOut.pos, dIn.neg), flowIn = addComp(dIn.pos, dOut.neg);
  run.emitted = { out: totOut, in: totIn };
  const ash = { ...w.lots[run.ashLotId!], comp: fp.ash };

  const done = run.phase === 'done';
  const halted = !done && !!cmd.outage && cmd.outage.toMs > run.lastMs;
  if (done) finishFiring(p, w, cmd, c);
  if (halted) {
    run.status = 'halted_operational';
    run.gap = { fromMs: cmd.outage!.fromMs, toMs: cmd.outage!.toMs };
    run.outcome = 'operational_gap';
    c.samples.forEach((s) => { s.historyComplete = false; s.history.push({ runId: run.id, process: run.processId, atMs: run.lastMs, summary: '運用停止：焼成中の温度と燃焼が不明。結果を研究の根拠にしない' }); });
    ev(p, cmd, 'OperationalGap', [run.id], `焼成中に運用停止（${(cmd.outage!.toMs - cmd.outage!.fromMs) / 60000} 分）。停止中の燃焼・温度は創作せず、最後の確定状態で保留`);
  }
  c.samples.forEach((s) => putSample(p, w, { ...s, version: w.samples[s.id].version }));
  putLot(p, w, c.fuel);
  putLot(p, w, ash);
  p.reservations = p.reservations.filter((x) => x.entity.id !== c.fuelRes.id);
  putRes(p, w, c.fuelRes);
  putRun(p, w, { ...run, version: run0.version });
  if (totalMg(flowOut) > 0) p.boundary.push({ id: `${cmd.commandId}:bout`, runId: run.id, atMs: run.lastMs, direction: 'out', medium: 'atmosphere', comp: flowOut, note: '燃焼ガス・素地から出た水蒸気とCO2' });
  if (totalMg(flowIn) > 0) p.boundary.push({ id: `${cmd.commandId}:bin`, runId: run.id, atMs: run.lastMs, direction: 'in', medium: 'atmosphere', comp: flowIn, note: '燃焼と有機物の酸化に使った空気中の酸素' });
  const d = run.energy, d0 = run0.energy;
  p.energy.push({ id: `${cmd.commandId}:e`, runId: run.id, fromMs, toMs: run.lastMs, kind: 'heat', source: `fuel:${c.fuel.id}`, account: {
    releasedJ: d.releasedJ - d0.releasedJ, flueLossJ: d.flueLossJ - d0.flueLossJ, wallLossJ: d.wallLossJ - d0.wallLossJ,
    wareSensibleJ: d.wareSensibleJ - d0.wareSensibleJ, reactionsNetJ: d.reactionsNetJ - d0.reactionsNetJ,
    structureStoredJ: d.structureStoredJ - d0.structureStoredJ, envHeatInJ: 0 } });
  p.evidence.push({ params: ['woodLhvDry', 'combustionToChamber', 'cpCeramic', 'latentHeatWater100', 'dHDehydroxylation', 'dHCalcination',
    'dHCarbonCombustion', 'kinDehydroxTref', 'kinCalcTref', 'kinSinterTref', 'kinOrganicTref', 'steamMoistureLimit', 'duntRateLimit10mm', 'quartzInversionC'],
    note: '焼成：集中定数の炉モデル、一次反応速度、昇温・冷却速度による割れ' });
  return p;
}

function finishFiring(p: Proposal, w: WorldView, cmd: Command, c: FireCtx) {
  const { run } = c;
  run.status = 'completed';
  run.outcome = run.outcome ?? 'schedule_completed';
  for (const s of c.samples) {
    drawCrack(s, run, 'steam', s.risk.steamRatioMax);
    drawCrack(s, run, 'dunting', s.risk.duntRatioMax);
    s.deformed = s.deformed || s.maxWareTempC > pv('overfireC');
    s.stage = s.cracks.some((k) => k.severity === 'through') ? 'broken' : 'fired';
    s.location = `research:${run.researchId}`;
    s.history.push({ runId: run.id, process: run.processId, atMs: run.lastMs,
      summary: `焼成：最高 ${s.maxWareTempC.toFixed(0)} °C、脱水 ${(s.dehydrox * 100).toFixed(0)}%、焼結 ${(s.sinter * 100).toFixed(0)}%、割れ ${s.cracks.length}` });
  }
  c.fuelRes = { ...c.fuelRes, open: false };
  p.facilities.push({ entity: { ...c.fac, occupiedBy: null }, expectVersion: c.fac.version });
  const bundles = c.fuel.unitMg ? Math.round(run.fuelBurnedMg! / c.fuel.unitMg) : null;
  obs(p, cmd, { runId: run.id, atMs: run.lastMs, kind: 'glow', value: glowCategory(run.peakKilnC!), text: 'いちばん熱いときの火の色' });
  if (bundles !== null) obs(p, cmd, { runId: run.id, atMs: run.lastMs, kind: 'fuel_used', value: bundles, unit: c.fuel.unitLabel ?? '束', text: '燃やした薪の量' });
  obs(p, cmd, { runId: run.id, atMs: run.lastMs, kind: 'duration', value: +(((run.lastMs - run.startMs) / 3600000)).toFixed(1), unit: '時間', text: '火を入れてから取り出せるまで' });
  ev(p, cmd, 'ProcessCompleted', [run.id, ...run.sampleIds], `焼成終了（${run.outcome}）：薪 ${(run.fuelBurnedMg! / 1e6).toFixed(2)} kg、炉内最高 ${run.peakKilnC!.toFixed(0)} °C`);
}

// ---- soak test ------------------------------------------------------------------------

export function startSoak(w: WorldView, cmd: Cmd<'start_soak'>): Proposal {
  if (w.runs[cmd.runId]) return reject('duplicate_id', cmd.runId);
  const f = checkFacility(w, cmd.facilityId, ['soak_basin'], 1);
  if (typeof f === 'string') return reject('facility', f);
  const s = w.samples[cmd.sampleId];
  if (!s) return reject('unknown_sample', cmd.sampleId);
  if (s.stage === 'slaked') return reject('wrong_stage', 'すでに崩れている');
  if (s.location.startsWith('facility:')) return reject('busy', `${s.label} は別の工程中`);
  const wr = w.reservations[cmd.waterReservationId];
  if (!wr || !wr.open || w.lots[wr.lotId].kind !== 'water') return reject('no_water', '浸漬用の水の予約がない');
  if (remaining(wr) < 3 * totalMg(s.comp)) return reject('no_water', '試験片を沈める水が足りない（質量の3倍以上を予約する）');
  if (w.lots[cmd.slurryLotId]) return reject('duplicate_id', cmd.slurryLotId);
  const p = emptyProposal();
  const run = newRun(cmd, 'soak', f.id, [s.id], 3600, cmd.seed, PROCESS_VERSIONS.soak);
  run.waterReservationId = wr.id; run.durationS = SOAK_S;
  if (cmd.balanceId) {
    const b = checkFacility(w, cmd.balanceId, ['balance'], 1);
    if (typeof b === 'string') return reject('instrument', b);
    const res = b.instrument!.resolutionMg;
    run.balanceId = b.id;
    run.measuredDryMg = Math.round(totalMg(s.comp) / res) * res;
    obs(p, cmd, { sampleId: s.id, runId: run.id, kind: 'mass', value: run.measuredDryMg / 1000, unit: 'g', instrumentId: b.id, resolution: res / 1000, text: `${s.label}：浸ける前の質量` });
  }
  putSample(p, w, { ...s, location: `facility:${f.id}` });
  putFac(p, w, { ...f, occupiedBy: run.id });
  putRun(p, w, run);
  ev(p, cmd, 'ProcessStarted', [run.id, s.id], `${s.label} を水に24時間浸ける`);
  return p;
}

function advanceSoak(w: WorldView, cmd: Cmd<'advance'>, run0: ProcessRun): Proposal {
  // Soaking does not depend on weather; an outage during it changes nothing physical, so it is not a gap.
  const run = clone(run0);
  const p = emptyProposal();
  const end = run.startMs + run.durationS! * 1000;
  run.lastMs = Math.min(end, Math.max(run.lastMs, cmd.untilMs));
  if (run.lastMs < end) { putRun(p, w, run); return p; }
  const s = clone(w.samples[run.sampleIds[0]]);
  const wr = w.reservations[run.waterReservationId!];
  const waterLot = w.lots[wr.lotId];
  if (s.dehydrox < pv('slakeIfDehydroxBelow')) {
    const use = remaining(wr);
    const wt = splitComp(waterLot.comp, use);
    putLot(p, w, { ...waterLot, comp: wt.rest });
    putRes(p, w, { ...wr, consumedMg: wr.consumedMg + use, open: false });
    putLot(p, w, { id: `${run.id}:slurry`, kind: 'slurry', label: `泥水（${s.label} が崩れたもの・未焼成なので粘土に戻せる）`,
      comp: addComp(s.comp, wt.taken), location: `research:${run.researchId}`, provenance: waterLot.provenance, protected: false, version: 0 });
    putSample(p, w, { ...s, comp: {}, stage: 'slaked', location: `lot:${run.id}:slurry`, version: w.samples[s.id].version,
      history: [...s.history, { runId: run.id, process: run.processId, atMs: end, summary: '水中で崩れて泥水のロットになった' }] });
    obs(p, cmd, { sampleId: s.id, runId: run.id, atMs: end, kind: 'slaked', value: '崩れた', text: `${s.label}：水の中で形が崩れ、泥に戻った` });
    ev(p, cmd, 'SampleSlaked', [s.id], `${s.label} は脱水が ${(s.dehydrox * 100).toFixed(0)}% で、水中で崩れた`);
  } else {
    const dry = dryMg(s.comp);
    const aBoil = pv('absorptionLowFire') * (1 - s.sinter) + pv('absorptionVitrified') * s.sinter;
    const targetWater = Math.round(aBoil * pv('coldSoakFraction') * dry);
    const take = Math.max(0, targetWater - (s.comp.water ?? 0));
    const wt = splitComp(waterLot.comp, take);
    s.comp = addComp(s.comp, wt.taken);
    putLot(p, w, { ...waterLot, comp: wt.rest });
    putRes(p, w, { ...wr, consumedMg: wr.consumedMg + take, open: false });
    s.location = `research:${run.researchId}`;
    s.history.push({ runId: run.id, process: run.processId, atMs: end, summary: `24時間浸漬：吸水 ${(take / 1000).toFixed(2)} g（真値・煮沸換算 ${(aBoil * 100).toFixed(1)}%）` });
    s.cracks.forEach((k) => { k.visibleDry = true; });
    if (run.balanceId) {
      const res = w.facilities[run.balanceId].instrument!.resolutionMg;
      const wet = Math.round(totalMg(s.comp) / res) * res;
      const a = (wet - run.measuredDryMg!) / run.measuredDryMg!;
      obs(p, cmd, { sampleId: s.id, runId: run.id, atMs: end, kind: 'mass', value: wet / 1000, unit: 'g', instrumentId: run.balanceId, resolution: res / 1000, text: `${s.label}：浸けた後の質量（表面を拭いて）` });
      obs(p, cmd, { sampleId: s.id, runId: run.id, atMs: end, kind: 'absorption', value: +(a * 100).toFixed(1), unit: '%', instrumentId: run.balanceId,
        text: `${s.label}：自分で量った前後の質量から出した吸水率（24時間冷水、事前の乾燥なし）` });
    } else {
      const a = aBoil * pv('coldSoakFraction');
      obs(p, cmd, { sampleId: s.id, runId: run.id, atMs: end, kind: 'soak_look',
        value: a < 0.06 ? '泡はほとんど出ず、色もあまり変わらない' : a < 0.11 ? 'しばらく細かい泡が出て、少し色が濃くなった' : '泡が勢いよく出て、全体が濃く湿った色になった',
        text: `${s.label}：水に浸けたときの様子（はかりなし）` });
    }
    if (s.cracks.some((k) => k.severity === 'hairline')) obs(p, cmd, { sampleId: s.id, runId: run.id, atMs: end, kind: 'visual', value: '細いひび', text: `${s.label}：濡れると細いひびが浮かび上がった` });
    putSample(p, w, { ...s, version: w.samples[s.id].version });
    ev(p, cmd, 'MeasurementCompleted', [s.id, run.id], `${s.label} の浸漬試験を終了`);
    p.evidence.push({ params: ['absorptionLowFire', 'absorptionVitrified', 'coldSoakFraction', 'slakeIfDehydroxBelow'], note: '吸水率：焼結度で線形補間、冷水24時間は煮沸の0.8倍' });
  }
  putRun(p, w, { ...run, status: 'completed', outcome: s.dehydrox < pv('slakeIfDehydroxBelow') ? 'slaked' : 'measured' });
  putFac(p, w, { ...w.facilities[run.facilityId], occupiedBy: null });
  return p;
}

export function advance(w: WorldView, cmd: Cmd<'advance'>): Proposal {
  const run = w.runs[cmd.runId];
  if (!run) return reject('unknown_run', cmd.runId);
  if (run.status !== 'active') return emptyProposal();
  if (cmd.untilMs <= run.lastMs) return emptyProposal();
  if (run.kind === 'drying') return advanceDrying(w, cmd, run);
  if (run.kind === 'firing') return advanceFiring(w, cmd, run);
  return advanceSoak(w, cmd, run);
}

export function resolveHalt(w: WorldView, cmd: Cmd<'resolve_halt'>): Proposal {
  const run = w.runs[cmd.runId];
  if (!run || run.status !== 'halted_operational') return reject('not_halted', cmd.runId);
  const p = emptyProposal();
  for (const id of run.sampleIds) {
    const s = clone(w.samples[id]);
    s.location = `research:${run.researchId}`;
    s.history.push({ runId: run.id, process: run.processId, atMs: cmd.atMs, summary: '運用停止後に取り出した。停止中の熱履歴は不明のまま' });
    putSample(p, w, { ...s, version: w.samples[id].version });
  }
  if (run.fuelReservationId) {
    const r = w.reservations[run.fuelReservationId];
    if (r.open) putRes(p, w, { ...r, open: false });
  }
  putFac(p, w, { ...w.facilities[run.facilityId], occupiedBy: null });
  putRun(p, w, { ...run, status: 'abandoned' });
  ev(p, cmd, 'ProcessAbandoned', [run.id], '運用停止のため試行を中止（世界内の失敗ではない）。未燃の予約燃料を解放');
  return p;
}

// ---- inspection (no instrument) -------------------------------------------------------

export function inspect(w: WorldView, cmd: Cmd<'inspect'>): Proposal {
  const s = w.samples[cmd.sampleId];
  if (!s) return reject('unknown_sample', cmd.sampleId);
  const p = emptyProposal();
  const vis = s.cracks.filter((k) => k.visibleDry);
  const through = vis.some((k) => k.severity === 'through');
  obs(p, cmd, { sampleId: s.id, kind: 'visual', value: through ? '割れて分かれている' : vis.length ? '細いひびが見える' : 'ひびは見当たらない', text: `${s.label}：見た目` });
  if (s.deformed) obs(p, cmd, { sampleId: s.id, kind: 'visual', value: '形がゆがんでいる', text: `${s.label}：形` });
  let tap: string;
  if (through) tap = '濁ってびりつく音';
  else if (s.stage === 'fired' && s.sinter > 0.5) tap = '高く澄んだ音';
  else if (s.stage === 'fired' && s.dehydrox >= pv('slakeIfDehydroxBelow')) tap = 'やや鈍い音';
  else tap = 'こもった音';
  obs(p, cmd, { sampleId: s.id, kind: 'tap', value: tap, text: `${s.label}：指ではじいた音` });
  return p;
}
