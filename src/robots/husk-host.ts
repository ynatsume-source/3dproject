// The residents' hands on the coconut husk (the science side's PR20/PR22/PR31 parts, wired to the island's bodies:
// 2026-10-17, main ↔ science). What a resident chooses (an option), where it stands and what its hands are doing are
// the world's (residents.ts); the soaking, the separating and what comes of them are the science side's. This file is the
// only place that calls them, and it passes them nothing but:
//  - an intent (put the husks in the tide pool, take them out, start / go on with / hand over / stop / clear away the
//    beating), made when the body is there (presence 'here' — never a plan, never a guess);
//  - spans the executor has confirmed: the island-clock time the husks lay in the pool, and the world-clock time a
//    resident's hands were at the husk at the worksite (split at every stop, every 30 s, never across a gap);
// and it takes back only the words a resident could see or feel (observations), and the lots the work settled.
// The science side's refusal codes, the amounts, the recipe and the times stay out of a resident's mind: they go to
// the developer's log here (not saved, never in a diary, never in a post's prompt). The options are every hand action
// the materials and places allow, not those the science side would accept, in an order seeded by the island, the
// resident and the moment it decides — never in the order the work is done.
import type { Ledger } from '../world/process-runner';
import { toClock, moveLot } from '../world/process-runner';
import type { Option } from './agent/types';
import { draw } from '../science/rng';
import { HUSK_SOAK_ASSUMPTION } from '../science/prototypes/husk-soak';
import { MANUAL_HUSK_ASSUMPTION } from '../science/prototypes/manual-husk-assumptions';
import { beginHuskSoak, recordHuskSoakSpan, takeOutHuskSoak, readSoakedHuskInput, readHuskSoakWorksite, huskWorkFailureObservations, restoreHuskSoak, HUSK_SOAK_WORK } from '../world/husk-soak-work';
import { applyHuskIntent, huskArrangementRevision, recordHuskWorkflowSpan, restoreHuskArrangement, readHuskResidentObservations, type HuskWorkflowLedger, type HuskStartFacts } from '../world/manual-husk-workflow';
import { beginManualHuskWork, MANUAL_HUSK_WORK, type HuskExecutorSpan } from '../world/manual-husk-work';

export interface HuskSite { id: string; x: number; z: number }
/** The world's own bookkeeping for the husk work (saved with the village): where the pool and the worksite are, how far
 *  the pool's time has been confirmed, and who is at the husk now. Nothing in it is told to a resident. */
export interface HuskHostState {
  sites: { pool: HuskSite; work: HuskSite & { reachM: number } } | null;
  soak: Record<string, number>;                         // runId → the world time confirmed so far
  engaged: Record<string, { runId: string; from: number; at: { x: number; z: number } }>;   // actor → its hands on a husk
  decisions: Record<string, number>;                     // actor → how many times it has been offered the husk work
  looked?: Record<string, string>;                       // actor → what it last saw at the pool (so a sight is noted once)
}
export const emptyHuskHostState = (): HuskHostState => ({ sites: null, soak: {}, engaged: {}, decisions: {}, looked: {} });
/** The developer's record of what the science side said no to, and why (codes). Not saved; not a resident's. */
export interface HuskDevEntry { at: number; actorId: string; action: string; code: string }

const SEED = 0x6875736b;   // 'husk'
const SOAK_EVERY_MS = 60_000, WORK_EVERY_MS = 30_000;
/** How near the pool a body must stand to see into it (presence 'here'). */
export const POOL_REACH_M = 3;
const WET = 'wet_unseparated_coconut_husk';
const codeOf = (e: unknown) => (e as { code?: string })?.code ?? (e instanceof Error ? e.message : String(e));
const live = (status: string) => ['starting', 'running', 'needs-input'].includes(status);

export interface HuskHost {
  /** Every hand action on the husk the materials and places allow now, in a seeded order. */
  options(actorId: string, nowWorldMs: number): Option[];
  /** At the pool, the husks from the shelf put in: the words for what it did, or null (it could not). */
  putInPool(actorId: string, nowWorldMs: number): string | null;
  /** At the pool, the husks taken out. */
  takeOut(actorId: string, nowWorldMs: number): string | null;
  /** At the worksite, its hands on a husk: going on with its own, taking over another's, or a new one. */
  beginBeating(actorId: string, at: { x: number; z: number }, nowWorldMs: number): { ok: true } | { ok: false; felt: string | null };
  /** Each frame its hands are at it: the span confirmed every 30 s. Completed: the words for what lies there now. */
  beating(actorId: string, at: { x: number; z: number }, nowWorldMs: number): { done: false } | { done: true; words: string[] };
  /** It has stopped (any reason): the span so far confirmed, then the stop. */
  stopBeating(actorId: string, at: { x: number; z: number }, nowWorldMs: number): void;
  /** At the worksite, a husk left half done cleared away. */
  clearAway(actorId: string, nowWorldMs: number): string | null;
  isBeating(actorId: string): boolean;
  /** What a body at the pool sees of the husks lying in it (presence 'here' only; away, nothing): new since it last
   *  looked, or null. */
  lookIntoPool(actorId: string, presence: 'here' | 'away', nowWorldMs: number): string | null;
  /** The island's clock goes on: the time the husks lay in the pool, confirmed. */
  tick(nowWorldMs: number): void;
  /** At a load: open attendance closed (no work counted for the time it was off), the saved state checked. */
  restore(nowWorldMs: number): void;
  sites(): NonNullable<HuskHostState['sites']>;
}

export function makeHuskHost(ctx: {
  lab: Ledger;
  state: () => HuskHostState;
  placeSites: () => NonNullable<HuskHostState['sites']>;
  dev: HuskDevEntry[];
}): HuskHost {
  const L = () => ctx.lab as HuskWorkflowLedger;
  const st = () => ctx.state();
  const sites = () => (st().sites ??= ctx.placeSites());
  const log = (at: number, actorId: string, action: string, e: unknown) => { ctx.dev.push({ at, actorId, action, code: codeOf(e) }); if (ctx.dev.length > 200) ctx.dev.shift(); };
  const island = (ms: number) => Math.round(toClock('island', ms));
  const soakRuns = () => Object.values(L().runs).filter((r) => r.processId === HUSK_SOAK_WORK.processId && live(r.status));
  const jobs = () => L().manualHuskArrangement?.jobs ?? [];
  const engagedNow = (j: { controls: { kind: string }[] }) => ['start', 'resume', 'takeover'].includes(j.controls.at(-1)!.kind);
  // (a place is full when a body could not put anything more there: the pool holds one soaking, the worksite one husk
  // in someone's hands — what the science side would accept is not asked here)
  const poolFull = () => soakRuns().some((r) => (r.state?.data as any)?.spec?.site?.locationId === sites().pool.id);
  const workTakenBy = (actorId: string) => jobs().some((j) => live(L().runs[j.runId]?.status ?? '') && engagedNow(j) && j.actorId !== actorId);
  const pausedJobs = () => jobs().filter((j) => live(L().runs[j.runId]?.status ?? '') && !engagedNow(j));
  const shelfHusk = () => Object.values(L().lots).filter((l: any) => l.materialId === 'coconut_husk' && l.location === 'shelf' && !l.reservedBy).sort((a, b) => a.lotId.localeCompare(b.lotId))[0];
  const wetHusks = () => Object.values(L().lots).filter((l: any) => l.materialId === WET && !l.reservedBy && [sites().pool.id, sites().work.id].includes(l.location)).sort((a, b) => a.lotId.localeCompare(b.lotId));

  function options(actorId: string, nowWorldMs: number): Option[] {
    const o: Option[] = [];
    if (shelfHusk() && !poolFull()) o.push({ id: 'soak:pool', action: 'soak', label: '棚のヤシの殻を潮だまりに浸ける', targetId: 'pool' });
    if (soakRuns().length) o.push({ id: 'takeout:pool', action: 'takeout', label: '潮だまりの殻を引き上げる', targetId: 'pool' });
    if ((wetHusks().length || pausedJobs().length) && !workTakenBy(actorId)) o.push({ id: 'beat:husk', action: 'beat', label: '濡れた殻を打ってほぐす', targetId: 'husk-site' });
    if (pausedJobs().length && !workTakenBy(actorId)) o.push({ id: 'clear:husk', action: 'clear', label: '打ちかけの殻を片付ける', targetId: 'husk-site' });
    // (no order of the work: shuffled by the island, the one deciding and the moment — the same moment, the same order)
    const n = (st().decisions[actorId] = (st().decisions[actorId] ?? 0) + 1);
    return o.map((x) => [x, draw(SEED, actorId, String(nowWorldMs), String(n), 'options', x.id)] as const).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  }

  function putInPool(actorId: string, nowWorldMs: number): string | null {
    const lot = shelfHusk(); if (!lot) return null;
    const pool = sites().pool, was = lot.location;
    // (carried there first: the world's own move, before the science side is told)
    const moved = moveLot(L(), lot.lotId, pool.id); if (!moved.lot) { log(nowWorldMs, actorId, 'soak-carry', moved.why); return null; }
    try {
      beginHuskSoak(L(), { commandId: `soak:${actorId}:${nowWorldMs}`, assumptionId: HUSK_SOAK_ASSUMPTION.id, actorId, lotId: lot.lotId,
        site: { locationId: pool.id, kind: 'coastal-tide-pool' }, atWorldMs: nowWorldMs, atIslandMs: island(nowWorldMs), presence: 'here' }, nowWorldMs);
      for (const r of soakRuns()) st().soak[r.runId] ??= nowWorldMs;
      return '殻を潮だまりに沈めた';
    } catch (e) { moveLot(L(), lot.lotId, was); log(nowWorldMs, actorId, 'soak', e); return null; }
  }

  function tick(nowWorldMs: number) {
    for (const r of soakRuns()) {
      const from = st().soak[r.runId]; if (from === undefined) { st().soak[r.runId] = nowWorldMs; continue; }
      if (nowWorldMs - from < SOAK_EVERY_MS) continue;
      // (v1, science 2026-10-17: in the pool the whole time it lies there — the tide and a storm do not cut the span)
      try {
        recordHuskSoakSpan(L(), r.runId, { recordId: `${r.runId}:${from}`, worldId: L().world.worldId, worldEpoch: L().world.worldEpoch, runId: r.runId,
          siteId: sites().pool.id, fromWorldMs: from, toWorldMs: nowWorldMs, fromIslandMs: island(from), toIslandMs: island(nowWorldMs), confirmedAtWorldMs: nowWorldMs, immersed: true }, nowWorldMs);
        st().soak[r.runId] = nowWorldMs;
      } catch (e) { log(nowWorldMs, '', 'soak-span', e); }
    }
  }

  function takeOut(actorId: string, nowWorldMs: number): string | null {
    const r = soakRuns()[0]; if (!r) return null;
    tick(nowWorldMs);   // (up to the moment it lifts them out: no time left unconfirmed, none made up)
    try {
      takeOutHuskSoak(L(), r.runId, { intentId: `takeout:${actorId}:${nowWorldMs}`, kind: 'take-out', actorId, presence: 'here', atWorldMs: nowWorldMs, atIslandMs: island(nowWorldMs) }, nowWorldMs);
      delete st().soak[r.runId];
      return readHuskSoakWorksite(L(), r.runId).observations[0]?.text ?? null;
    } catch (e) { log(nowWorldMs, actorId, 'takeout', e); return null; }
  }

  function intent(i: Parameters<typeof applyHuskIntent>[1], nowWorldMs: number, facts?: HuskStartFacts) {
    return applyHuskIntent(L(), i, huskArrangementRevision(L()), nowWorldMs, facts);
  }

  function beginBeating(actorId: string, at: { x: number; z: number }, nowWorldMs: number): { ok: true } | { ok: false; felt: string | null } {
    const work = sites().work, base = { atWorldMs: nowWorldMs, actorId };
    try {
      const own = pausedJobs().find((j) => j.actorId === actorId), other = pausedJobs().find((j) => j.actorId !== actorId);
      let runId: string;
      if (own) runId = intent({ intentId: `resume:${actorId}:${nowWorldMs}`, kind: 'resume', runId: own.runId, presence: 'here', ...base }, nowWorldMs).runId;
      else if (other) runId = intent({ intentId: `takeover:${actorId}:${nowWorldMs}`, kind: 'takeover', runId: other.runId, presence: 'here', ...base }, nowWorldMs).runId;
      else {
        const lot = wetHusks()[0]; if (!lot) return { ok: false, felt: null };
        // (it carries the husk to the worksite: the world's own move)
        const moved = moveLot(L(), lot.lotId, work.id); if (!moved.lot) { log(nowWorldMs, actorId, 'beat-carry', moved.why); return { ok: false, felt: null }; }
        const facts: HuskStartFacts = { assumptionId: MANUAL_HUSK_ASSUMPTION.id, huskCount: 1, input: readSoakedHuskInput(L(), lot.lotId) as any,
          worksite: { locationId: work.id, x: work.x, z: work.z, reachM: work.reachM } };
        // (it puts its hands to the husk: if the husk will not come apart, the science side's own refusal, as it felt —
        // tried on a copy, since the arrangement's transaction hides that refusal behind its own code)
        try { beginManualHuskWork(structuredClone(L()), { ...facts, commandId: 'trial', operatorId: actorId, openedAtWorldMs: nowWorldMs }); }
        catch (e) {
          log(nowWorldMs, actorId, 'beat-trial', e);
          const felt = huskWorkFailureObservations(e, { kind: 'executor-confirmed-husk-attempt', actorId, lotId: lot.lotId, presence: 'here', attempted: true, atWorldMs: nowWorldMs, confirmedAtWorldMs: nowWorldMs }, nowWorldMs);
          return { ok: false, felt: felt[0]?.text ?? null };
        }
        runId = intent({ intentId: `start:${actorId}:${nowWorldMs}`, kind: 'start', processId: MANUAL_HUSK_WORK.processId, lotId: lot.lotId, siteId: work.id, presence: 'here', ...base }, nowWorldMs, facts).runId;
      }
      st().engaged[actorId] = { runId, from: nowWorldMs, at: { x: at.x, z: at.z } };
      return { ok: true };
    } catch (e) { log(nowWorldMs, actorId, 'beat', e); return { ok: false, felt: null }; }
  }

  function confirm(actorId: string, at: { x: number; z: number }, nowWorldMs: number) {
    const e = st().engaged[actorId]; if (!e || nowWorldMs <= e.from) return;
    const span: HuskExecutorSpan = { kind: 'executor-activity-span', spanId: `${actorId}:${e.from}`, worldId: L().world.worldId, worldEpoch: L().world.worldEpoch, runId: e.runId, actorId,
      fromWorldMs: e.from, toWorldMs: nowWorldMs, confirmedAtWorldMs: nowWorldMs, activity: 'separate-wet-husk', targetLotId: jobs().find((j) => j.runId === e.runId)?.lotId ?? null,
      targetSiteId: sites().work.id, arrived: true, fromPosition: { ...e.at }, toPosition: { x: at.x, z: at.z } };
    try { recordHuskWorkflowSpan(L(), e.runId, span, huskArrangementRevision(L()), nowWorldMs); } catch (err) { log(nowWorldMs, actorId, 'beat-span', err); }
    e.from = nowWorldMs; e.at = { x: at.x, z: at.z };
  }

  function beating(actorId: string, at: { x: number; z: number }, nowWorldMs: number): { done: false } | { done: true; words: string[] } {
    const e = st().engaged[actorId]; if (!e) return { done: false };
    if (nowWorldMs - e.from >= WORK_EVERY_MS) confirm(actorId, at, nowWorldMs);
    const run = L().runs[e.runId];
    if (run && !live(run.status)) {
      delete st().engaged[actorId];
      const words = (() => { try { return readHuskResidentObservations(L(), e.runId, actorId).map((o) => o.text); } catch (err) { log(nowWorldMs, actorId, 'observe', err); return []; } })();
      return { done: true, words };
    }
    return { done: false };
  }

  function stopBeating(actorId: string, at: { x: number; z: number }, nowWorldMs: number) {
    const e = st().engaged[actorId]; if (!e) return;
    confirm(actorId, at, nowWorldMs);
    delete st().engaged[actorId];
    if (!live(L().runs[e.runId]?.status ?? '')) return;
    try { intent({ intentId: `stop:${actorId}:${nowWorldMs}`, kind: 'stop', runId: e.runId, atWorldMs: nowWorldMs, actorId }, nowWorldMs); } catch (err) { log(nowWorldMs, actorId, 'stop', err); }
  }

  function clearAway(actorId: string, nowWorldMs: number): string | null {
    const j = pausedJobs().find((x) => x.actorId === actorId) ?? pausedJobs()[0]; if (!j) return null;
    try {
      if (j.actorId !== actorId) {   // (another's half-done husk: it takes it on, puts it down, and clears it away)
        intent({ intentId: `takeover:${actorId}:${nowWorldMs}`, kind: 'takeover', runId: j.runId, presence: 'here', atWorldMs: nowWorldMs, actorId }, nowWorldMs);
        intent({ intentId: `stop:${actorId}:${nowWorldMs}`, kind: 'stop', runId: j.runId, atWorldMs: nowWorldMs, actorId }, nowWorldMs);
      }
      intent({ intentId: `abandon:${actorId}:${nowWorldMs}`, kind: 'abandon', runId: j.runId, atWorldMs: nowWorldMs, actorId }, nowWorldMs);
      return readHuskResidentObservations(L(), j.runId, actorId)[0]?.text ?? null;
    } catch (e) { log(nowWorldMs, actorId, 'clear', e); return null; }
  }

  function lookIntoPool(actorId: string, presence: 'here' | 'away', nowWorldMs: number): string | null {
    if (presence !== 'here') return null;
    const r = soakRuns().find((x) => (x.state?.data as any)?.spec?.site?.locationId === sites().pool.id); if (!r) return null;
    let text: string | undefined;
    try { text = readHuskSoakWorksite(L(), r.runId).observations[0]?.text; } catch (e) { log(nowWorldMs, actorId, 'look', e); return null; }
    const seen = (st().looked ??= {}), key = `${r.runId}|${text}`;
    if (!text || seen[actorId] === key) return null;
    seen[actorId] = key; return text.replace(/。$/, '');
  }

  function restore(nowWorldMs: number) {
    st().engaged = {};   // (no hands are at a husk across a load: its time off is not work)
    try { restoreHuskSoak(L()); } catch (e) { log(nowWorldMs, '', 'restore-soak', e); }
    if (!L().manualHuskArrangement) return;
    try { Object.assign(ctx.lab, restoreHuskArrangement(L(), nowWorldMs)); } catch (e) { log(nowWorldMs, '', 'restore-husk', e); }
  }

  return { options, putInPool, takeOut, beginBeating, beating, stopBeating, clearAway, isBeating: (a) => !!st().engaged[a], lookIntoPool, tick, restore, sites };
}
