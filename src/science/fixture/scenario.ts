// A reproducible two-round experiment in the clay test world. No AI: the resident's choices are
// written out below as a rule-based stand-in, so only the world rules decide the outcomes.

import type { Command, EnvSample, FiringPlan, Observation } from '../types';
import { createClayTestWorld } from './clay-world';
import { TestWorld } from './world';

export const T0 = Date.UTC(2026, 9, 5, 0, 0, 0); // fixed start, passed in — the core has no clock
const H = 3600_000;

export const ENV_DAY: EnvSample = { id: 'env-fixture-day', source: 'test-fixture', airTempC: 28, rh: 0.72, windMs: 3, solar: 0.8 };
export const ENV_NIGHT: EnvSample = { id: 'env-fixture-night', source: 'test-fixture', airTempC: 25, rh: 0.88, windMs: 2, solar: 0 };

type DistOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type Draft = DistOmit<Command, 'commandId' | 'actorId'> & { commandId?: string; actorId?: string };

export interface LogLine { cmd: string; type: string; ok: boolean; replayed: boolean; note: string }

export class Driver {
  w: TestWorld;
  log: LogLine[] = [];
  n = 0;
  actor = 'dot';
  /** called between commands; lets tests save/load at arbitrary points */
  hook?: (d: Driver) => void;
  constructor(w: TestWorld) { this.w = w; }

  send(c: Draft, expect: 'ok' | 'reject' = 'ok') {
    const cmd = { commandId: c.commandId ?? `c${String(++this.n).padStart(3, '0')}`, actorId: c.actorId ?? this.actor, ...c } as Command;
    const r = this.w.submit(cmd);
    this.log.push({ cmd: cmd.commandId, type: cmd.type, ok: r.ok, replayed: r.replayed, note: r.rejection ? `${r.rejection.code}: ${r.rejection.detail}` : '' });
    if (expect === 'ok' && !r.ok) throw new Error(`${cmd.commandId} ${cmd.type} rejected: ${r.rejection?.code} ${r.rejection?.detail}`);
    if (expect === 'reject' && r.ok) throw new Error(`${cmd.commandId} ${cmd.type} unexpectedly accepted`);
    this.hook?.(this);
    return { ...r, cmd };
  }

  obsIds(pred: (o: Observation) => boolean): string[] {
    return Object.values(this.w.state.view.observations).filter((o) => o.residentId === this.actor && pred(o)).map((o) => o.id).sort();
  }

  /** Advance a run in chunks, alternating day/night weather every 12 h. */
  advanceDrying(runId: string, fromMs: number, days: number) {
    for (let t = fromMs; t < fromMs + days * 24 * H; t += 12 * H) {
      const isDay = ((t - T0) / (12 * H)) % 2 === 0;
      this.send({ type: 'advance', runId, untilMs: t + 12 * H, env: isDay ? ENV_DAY : ENV_NIGHT, atMs: t + 12 * H });
    }
  }

  advanceUntilDone(runId: string, fromMs: number, chunkH: number, env: EnvSample, maxH = 72): number {
    let t = fromMs;
    while (this.w.state.view.runs[runId].status === 'active' && t < fromMs + maxH * H) {
      t += chunkH * H;
      this.send({ type: 'advance', runId, untilMs: t, env, atMs: t });
    }
    return t;
  }
}

const tile = (id: string, label: string, t = 10) => ({ sampleId: id, label, massMg: Math.round(45_000 * t / 10), dimsMm: { w: 50, l: 50, t } });

export interface ScenarioOptions { hook?: (d: Driver) => void; world?: TestWorld }

export function runScenario(opt: ScenarioOptions = {}): Driver {
  const d = new Driver(opt.world ?? createClayTestWorld());
  d.hook = opt.hook;
  let t = T0;

  // ---------------- round 1: does a stronger fire change how much water a tile takes up? -------------
  d.send({ type: 'open_research', atMs: t, record: {
    id: 'r1', residentId: 'dot',
    question: '火の強さで、焼いた試験片の水の吸い方は変わるか',
    hypothesis: { text: 'よく焼けた（明るく光るまで焼いた）方が水を吸わない', variable: '焼く設備と火の色', expect: '焚き火 > 小窯（吸水）' },
    basis: [{ kind: 'prior-knowledge', ref: 'model-general', note: 'AIの一般知識として「高温ほど焼き締まる」と知っている。島の材料では未確認' }],
    controls: { clayLot: 'clay-A', thicknessMm: 10, drying: '日陰の棚で5日' },
  } });

  // research allocation is reserved before trying; protected stocks cannot be used
  d.send({ type: 'reserve', atMs: t, reservationId: 'res-water-life', researchId: 'r1', purpose: '浸漬', lotId: 'water-life', mg: 1_000_000 }, 'reject');
  d.send({ type: 'reserve', atMs: t, reservationId: 'res-clay', researchId: 'r1', purpose: '試験片', lotId: 'clay-A', mg: 600_000 });
  d.send({ type: 'reserve', atMs: t, reservationId: 'res-water', researchId: 'r1', purpose: '練り水', lotId: 'water-work', mg: 400_000 });
  d.send({ type: 'prepare_clay', atMs: t, clayReservationId: 'res-clay', waterReservationId: 'res-water', rawMg: 550_000, targetWaterRatio: 0.24, outLotId: 'clay-A-prepared' });
  d.send({ type: 'shape_tiles', atMs: t, lotId: 'clay-A-prepared', researchId: 'r1', scrapLotId: 'scrap-r1', trimFraction: 0.05,
    tiles: [tile('T1', '試験片T1（焚き火）'), tile('T2', '試験片T2（小窯・橙）'), tile('T3', '試験片T3（焼かない対照）')] });
  d.send({ type: 'start_drying', atMs: t, runId: 'dry-1', researchId: 'r1', sampleIds: ['T1', 'T2', 'T3'], facilityId: 'rack-shade', seed: 11 });
  d.advanceDrying('dry-1', t, 5);
  t += 5 * 24 * H;
  d.send({ type: 'finish_drying', atMs: t, runId: 'dry-1' });

  // facility that is only planned, and a firing without fuel: both refused
  const plan: FiringPlan = { pace: 'normal', targetGlow: 'orange', holdMin: 30, cooling: 'natural' };
  d.send({ type: 'start_firing', atMs: t, runId: 'fire-x', researchId: 'r1', sampleIds: ['T2'], facilityId: 'kiln-brick-planned', fuelReservationId: 'none',
    plan, seed: 21, env: ENV_DAY, ashLotId: 'ash-x' }, 'reject');
  d.send({ type: 'start_firing', atMs: t, runId: 'fire-x', researchId: 'r1', sampleIds: ['T2'], facilityId: 'kiln-fixture', fuelReservationId: 'none',
    plan, seed: 21, env: ENV_DAY, ashLotId: 'ash-x' }, 'reject');
  // research may not take the cooking firewood
  d.send({ type: 'reserve', atMs: t, reservationId: 'res-wood-life', researchId: 'r1', purpose: '焼成', lotId: 'wood-life', mg: 10_000_000 }, 'reject');

  d.send({ type: 'reserve', atMs: t, reservationId: 'res-wood-1', researchId: 'r1', purpose: '焚き火焼成', lotId: 'wood-research', mg: 20_000_000 });
  d.send({ type: 'start_firing', atMs: t, runId: 'fire-1', researchId: 'r1', sampleIds: ['T1'], facilityId: 'open-fire', fuelReservationId: 'res-wood-1',
    plan: { pace: 'fast', targetGlow: 'orange', holdMin: 30, cooling: 'natural' }, seed: 31, env: ENV_DAY, ashLotId: 'ash-1' });
  d.send({ type: 'reserve', atMs: t, reservationId: 'res-wood-2', researchId: 'r1', purpose: '小窯焼成', lotId: 'wood-research', mg: 40_000_000 });
  d.send({ type: 'start_firing', atMs: t, runId: 'fire-2', researchId: 'r1', sampleIds: ['T2'], facilityId: 'kiln-fixture', fuelReservationId: 'res-wood-2',
    plan, seed: 32, env: ENV_DAY, ashLotId: 'ash-2' });
  const t1 = d.advanceUntilDone('fire-1', t, 1, ENV_DAY);
  const t2 = d.advanceUntilDone('fire-2', t, 2, ENV_DAY);
  t = Math.max(t1, t2);

  d.send({ type: 'reserve', atMs: t, reservationId: 'res-soak-1', researchId: 'r1', purpose: '浸漬', lotId: 'water-work', mg: 2_000_000 });
  d.send({ type: 'reserve', atMs: t, reservationId: 'res-soak-2', researchId: 'r1', purpose: '浸漬', lotId: 'water-work', mg: 2_000_000 });
  for (const s of ['T1', 'T2', 'T3']) d.send({ type: 'inspect', atMs: t, sampleId: s, seed: 1 });
  d.send({ type: 'start_soak', atMs: t, runId: 'soak-T1', researchId: 'r1', sampleId: 'T1', facilityId: 'basin', waterReservationId: 'res-soak-1', balanceId: 'balance', seed: 1, slurryLotId: 'x' });
  d.send({ type: 'start_soak', atMs: t, runId: 'soak-T2', researchId: 'r1', sampleId: 'T2', facilityId: 'basin-2', waterReservationId: 'res-soak-2', balanceId: 'balance', seed: 1, slurryLotId: 'x' });
  t += 24 * H;
  d.send({ type: 'advance', atMs: t, runId: 'soak-T1', untilMs: t, env: ENV_DAY });
  d.send({ type: 'advance', atMs: t, runId: 'soak-T2', untilMs: t, env: ENV_DAY });
  d.send({ type: 'reserve', atMs: t, reservationId: 'res-soak-3', researchId: 'r1', purpose: '浸漬', lotId: 'water-work', mg: 2_000_000 });
  d.send({ type: 'start_soak', atMs: t, runId: 'soak-T3', researchId: 'r1', sampleId: 'T3', facilityId: 'basin', waterReservationId: 'res-soak-3', seed: 1, slurryLotId: 'x' });
  t += 24 * H;
  d.send({ type: 'advance', atMs: t, runId: 'soak-T3', untilMs: t, env: ENV_DAY });

  const absorb = (s: string) => d.obsIds((o) => o.sampleId === s && o.kind === 'absorption');
  for (const [s, runs] of [['T1', ['dry-1', 'fire-1', 'soak-T1']], ['T2', ['dry-1', 'fire-2', 'soak-T2']], ['T3', ['dry-1', 'soak-T3']]] as const) {
    d.send({ type: 'add_trial', atMs: t, researchId: 'r1', trial: { sampleId: s, condition: s === 'T1' ? { facility: 'open-fire', glowAim: 'orange' } : s === 'T2' ? { facility: 'kiln-fixture', glowAim: 'orange' } : { facility: 'none' },
      runIds: [...runs], observationIds: d.obsIds((o) => o.sampleId === s || (o.runId !== undefined && runs.includes(o.runId as never))) } });
  }
  const v = d.w.state.view;
  const a1 = v.observations[absorb('T1')[0]]?.value as number | undefined;
  const a2 = v.observations[absorb('T2')[0]]?.value as number | undefined;
  const verdict = a1 !== undefined && a2 !== undefined ? (a2 < a1 ? 'supported' : 'not-supported') : 'inconclusive';
  const t2ok = v.samples.T2.stage === 'fired' && !v.samples.T2.cracks.some((k) => k.severity === 'through');
  d.send({ type: 'conclude_research', atMs: t, researchId: 'r1',
    conclusion: { verdict, text: `量った吸水率：焚き火 ${a1 ?? '測れず'}%、小窯 ${a2 ?? '測れず'}%。焼かない対照は水で崩れた`, observationIds: [...absorb('T1'), ...absorb('T2'), ...d.obsIds((o) => o.sampleId === 'T3' && o.kind === 'slaked')] },
    next: '小窯で橙まで焼く条件を、保持を長くして二回くり返す',
    procedure: t2ok ? { id: 'proc-tile', goal: '水を吸いにくい試験片（試験粘土A）', steps: { drying: '日陰の棚で5日', facility: 'kiln-fixture', pace: 'normal', glow: 'orange', holdMin: 30, cooling: 'natural' },
      scope: { clayLotIds: ['clay-A'], facilityIds: ['kiln-fixture'], thicknessMm: [10] }, evidence: [{ researchId: 'r1', sampleId: 'T2', ok: true }],
      unknowns: ['別の粘土ロット', '厚い器', '燃料の質の違い', 'れんがの窯での再現'] } : undefined,
  });

  // ---------------- round 2: repeat in separate firings with a longer hold -------------------------
  d.send({ type: 'open_research', atMs: t, record: {
    id: 'r2', residentId: 'dot', question: '小窯・橙で保持を90分にすると、割れずにもっと吸わなくなり、別の回でも同じになるか',
    hypothesis: { text: '保持を長くすると吸水がさらに下がる', variable: '保持時間', expect: '90分 < 30分（吸水）' },
    basis: [{ kind: 'own-trial', ref: absorb('T2')[0], note: 'r1で小窯・30分保持のT2を量った結果' }],
    controls: { clayLot: 'clay-A', thicknessMm: 10, drying: '日陰の棚で5日', facility: 'kiln-fixture', glow: 'orange' },
  } });
  d.send({ type: 'reserve', atMs: t, reservationId: 'res-clay-2', researchId: 'r2', purpose: '試験片', lotId: 'clay-A', mg: 200_000 });
  d.send({ type: 'reserve', atMs: t, reservationId: 'res-water-2', researchId: 'r2', purpose: '練り水', lotId: 'water-work', mg: 200_000 });
  d.send({ type: 'prepare_clay', atMs: t, clayReservationId: 'res-clay-2', waterReservationId: 'res-water-2', rawMg: 140_000, targetWaterRatio: 0.24, outLotId: 'clay-A-prepared-2' });
  d.send({ type: 'shape_tiles', atMs: t, lotId: 'clay-A-prepared-2', researchId: 'r2', scrapLotId: 'scrap-r2', trimFraction: 0.05,
    tiles: [tile('T4', '試験片T4（90分・1回目）'), tile('T5', '試験片T5（90分・2回目）')] });
  d.send({ type: 'start_drying', atMs: t, runId: 'dry-2', researchId: 'r2', sampleIds: ['T4', 'T5'], facilityId: 'rack-shade', seed: 12 });
  d.advanceDrying('dry-2', t, 5);
  t += 5 * 24 * H;
  d.send({ type: 'finish_drying', atMs: t, runId: 'dry-2' });
  const plan90: FiringPlan = { ...plan, holdMin: 90 };
  for (const [i, s] of [[3, 'T4'], [4, 'T5']] as const) {
    d.send({ type: 'reserve', atMs: t, reservationId: `res-wood-${i}`, researchId: 'r2', purpose: '小窯焼成', lotId: 'wood-research', mg: 40_000_000 });
    d.send({ type: 'start_firing', atMs: t, runId: `fire-${i}`, researchId: 'r2', sampleIds: [s], facilityId: 'kiln-fixture', fuelReservationId: `res-wood-${i}`,
      plan: plan90, seed: 40 + i, env: ENV_DAY, ashLotId: `ash-${i}` });
    t = d.advanceUntilDone(`fire-${i}`, t, 3, ENV_DAY);
    d.send({ type: 'inspect', atMs: t, sampleId: s, seed: 1 });
    d.send({ type: 'reserve', atMs: t, reservationId: `res-soak-${s}`, researchId: 'r2', purpose: '浸漬', lotId: 'water-work', mg: 2_000_000 });
    d.send({ type: 'start_soak', atMs: t, runId: `soak-${s}`, researchId: 'r2', sampleId: s, facilityId: 'basin', waterReservationId: `res-soak-${s}`, balanceId: 'balance', seed: 1, slurryLotId: 'x' });
    t += 24 * H;
    d.send({ type: 'advance', atMs: t, runId: `soak-${s}`, untilMs: t, env: ENV_DAY });
    d.send({ type: 'add_trial', atMs: t, researchId: 'r2', trial: { sampleId: s, condition: { holdMin: 90 }, runIds: ['dry-2', `fire-${i}`, `soak-${s}`],
      observationIds: d.obsIds((o) => o.sampleId === s || o.runId === `fire-${i}`) } });
  }
  const a4 = v4(d, 'T4'), a5 = v4(d, 'T5');
  const ok = (s: string) => d.w.state.view.samples[s].stage === 'fired' && !d.w.state.view.samples[s].cracks.some((k) => k.severity === 'through');
  d.send({ type: 'conclude_research', atMs: t, researchId: 'r2',
    conclusion: { verdict: a4 !== undefined && a2 !== undefined && a4 < a2 && a5 !== undefined && a5 < a2 ? 'supported' : 'inconclusive',
      text: `90分保持：${a4}% と ${a5}%（30分保持のT2は ${a2}%）`, observationIds: [...absorb('T4'), ...absorb('T5')] },
    procedure: { id: 'proc-tile-90', goal: '水を吸いにくい試験片（試験粘土A・保持90分）',
      steps: { drying: '日陰の棚で5日', facility: 'kiln-fixture', pace: 'normal', glow: 'orange', holdMin: 90, cooling: 'natural' },
      scope: { clayLotIds: ['clay-A'], facilityIds: ['kiln-fixture'], thicknessMm: [10] },
      evidence: [{ researchId: 'r2', sampleId: 'T4', ok: ok('T4') }, { researchId: 'r2', sampleId: 'T5', ok: ok('T5') }],
      unknowns: ['別の粘土ロット', '厚い器', 'れんがの窯での再現', '煮沸法との差'] },
  });
  return d;
}

function v4(d: Driver, s: string): number | undefined {
  const id = d.obsIds((o) => o.sampleId === s && o.kind === 'absorption')[0];
  return id ? (d.w.state.view.observations[id].value as number) : undefined;
}

export { TestWorld };
