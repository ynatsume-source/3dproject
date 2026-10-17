// The residents' hands on the coir cord (the science side's coir-cord-work / coir-cord-load, wired to the island's bodies:
// 2026-10-17, main ↔ science, the same terms as the husk: robots/husk-host.ts). What a resident chooses, where it stands
// and what its hands are doing are the world's (residents.ts); drying, sieving, twisting and plying, and what a load does
// to a cord, are the science side's. This file is the only place that calls them, and it passes them nothing but:
//  - an intent (start / go on with / hand over / stop / clear away), made when the body is there (presence 'here');
//  - spans the executor has confirmed: the world-clock time a resident's hands were at the work (every 30 s, split at
//    every stop, never across a gap), and the time a bundle lay under the roof (every 60 s; across a load, one span);
//  - the world's own events on a cord: a pot hung from it (its weight from the ledger), a crossing lashed with it (the
//    day's strongest wind), the sun on it (island clock, in the shade or not: before a load, a rubbing, a move or its use, else once a day);
// and it takes back only the words a resident could see or feel, and the lots the work settled. The science side's
// codes, the amounts, a cord's strength and wear stay out of a resident's mind: codes go to the developer's log here.
// The lengths a resident may twist are two fixed uses (a pot's hanging cord, a raft's lashing), never a number its mind
// picks. The options are every hand action the materials and places allow, in an order seeded by the island, the
// resident and the moment — never the order of the work.
import type { Ledger } from '../world/process-runner';
import type { LotView } from '../world/science-contract';
import { toClock, moveLot } from '../world/process-runner';
import type { Option } from './agent/types';
import { draw } from '../science/rng';
import { COIR_CORD_ASSUMPTION_ID } from '../science/prototypes/coir-cord-types';
import { applyCordIntent, recordCordSpan, restoreCordWork, cordWorkRevision, readCordWorksite, readCordWorkerObservations, cordFailureObservations,
  CORD_WORK, type CordWorkLedger, type CordStartFacts, type CordManualSpan } from '../world/coir-cord-work';
import { applyCordLoad, type CordLoadLedger, type CordHostEvent } from '../world/coir-cord-load';

export interface CordSite { id: string; x: number; z: number; reachM: number }
type Op = 'sieve' | 'twist' | 'ply';
/** The world's own bookkeeping for the cord (saved with the village). Nothing in it is told to a resident. */
export interface CordHostState {
  sites: { dry: CordSite; work: CordSite; hang: CordSite } | null;
  dry: Record<string, number>;                                                   // dry runId → the world time confirmed so far
  engaged: Record<string, { runId: string; from: number; at: { x: number; z: number } }>;   // actor → its hands at the cord work
  decisions: Record<string, number>;
  looked: Record<string, string>;                                                // actor → what it last saw at a cord site
  sun: Record<string, number>;                                                   // cord lotId → the island time its sun was sent through
  sunAt: number;                                                                 // the world time the sun was last sent to all
  newAt?: number;                                                                // the world time new cords were last looked for
  rack?: boolean;                                                                // the drying rack stands under the eaves (once fibre was laid out)
  hang: { potLotId: string; cordLotId: string; maxGf: number } | null;           // a pot hung by a cord under the eaves
  raft: { cordLotId: string; out: number | null; wind: number } | null;          // the raft's lashing (and a crossing under way)
}
export const emptyCordHostState = (): CordHostState => ({ sites: null, dry: {}, engaged: {}, decisions: {}, looked: {}, sun: {}, sunAt: 0, hang: null, raft: null });
export interface CordDevEntry { at: number; actorId: string; action: string; code: string }

const SEED = 0x636f7264;   // 'cord'
// (the sun on a cord is sent before each load or rubbing, before it is moved or used, and otherwise once a day at
// most: the record of each sending is kept with the island, and the cord's wear is the same however it is cut up —
// science, PR #35 review B1)
const DRY_EVERY_MS = 60_000, WORK_EVERY_MS = 30_000, SUN_EVERY_MS = 86_400_000, NEW_CORD_EVERY_MS = 60_000;
/** The two uses a resident twists for: the length is the use's, fixed here (science 2026-10-17), never its mind's. */
export const CORD_USES = { pot: { mm: 1000, ja: '鍋吊り用の長さ' }, raft: { mm: 2000, ja: '筏の縛り用の長さ' } } as const;
const RAFT_ROPE_MIN_MM = 1500;   // (a rope long enough to go round a raft's pieces: a strand of the raft's length, plied)
const SHADED = (s: NonNullable<CordHostState['sites']>) => [s.dry.id, s.hang.id, 'shelf'];   // (under the hut's eaves or in it)
const BUNDLE = 'coir_fiber_bundle', STRAND = 'coir_strand', ROPE = 'coir_rope';
const codeOf = (e: unknown) => (e as { code?: string })?.code ?? (e instanceof Error ? e.message : String(e));
const live = (status: string) => ['starting', 'running', 'needs-input'].includes(status);
const engagedNow = (d: any) => ['start', 'resume', 'takeover'].includes(d.controls.at(-1).kind);

export interface CordHost {
  options(actorId: string, nowWorldMs: number): Option[];
  /** At the drying place, a bundle put under the roof: the words for what it did, or null. */
  putToDry(actorId: string, nowWorldMs: number): string | null;
  /** At the drying place, the bundle taken in (dry or not). */
  takeIn(actorId: string, nowWorldMs: number): string | null;
  /** At the worksite, its hands to the cord work: its own half-done work, another's, or a new one of the kind chosen. */
  beginWork(actorId: string, op: Op | 'resume', use: keyof typeof CORD_USES | undefined, at: { x: number; z: number }, nowWorldMs: number): { ok: true } | { ok: false; felt: string | null };
  working(actorId: string, at: { x: number; z: number }, nowWorldMs: number): { done: false } | { done: true; words: string[] };
  stopWork(actorId: string, at: { x: number; z: number }, nowWorldMs: number): void;
  clearAway(actorId: string, nowWorldMs: number): string | null;
  isWorking(actorId: string): boolean;
  /** Under the eaves, a pot from the shelf hung by a cord. */
  hang(actorId: string, nowWorldMs: number): string | null;
  /** Under the eaves, the hung pot taken down to the shelf. */
  unhang(actorId: string, nowWorldMs: number): string | null;
  /** At the raft, its pieces lashed with a rope. */
  lash(actorId: string, nowWorldMs: number): string | null;
  voyageOut(nowWorldMs: number): void;
  /** Home from a crossing (or turned back): the lashing took the day's load. Words for the one aboard, or null. */
  voyageHome(nowWorldMs: number): string | null;
  /** What a body at a cord place sees there (presence 'here' only): new since it last looked, or null. */
  look(actorId: string, at: { x: number; z: number }, nowWorldMs: number): string | null;
  /** The island's clock goes on: the bundle's time under the roof, the sun on the cords, the pot's weight. */
  tick(nowWorldMs: number, windMs: number | null): void;
  restore(nowWorldMs: number): void;
  sites(): NonNullable<CordHostState['sites']>;
  raftLashed(): boolean;
}

export function makeCordHost(ctx: {
  lab: Ledger;
  state: () => CordHostState;
  placeSites: () => NonNullable<CordHostState['sites']>;
  roofed: () => boolean;           // (the hut's roof is up: the drying place is under it)
  raftWhole: () => boolean;
  raftAt: () => { x: number; z: number } | null;
  dev: CordDevEntry[];
}): CordHost {
  const L = () => ctx.lab as CordWorkLedger & CordLoadLedger;
  const st = () => ctx.state();
  const sites = () => (st().sites ??= ctx.placeSites());
  const log = (at: number, actorId: string, action: string, e: unknown) => { ctx.dev.push({ at, actorId, action, code: codeOf(e) }); if (ctx.dev.length > 200) ctx.dev.shift(); };
  const island = (ms: number) => Math.round(toClock('island', ms));
  const lots = () => Object.values(L().lots) as (LotView & { reservedBy?: string })[];
  const byId = (a: { lotId: string }, b: { lotId: string }) => a.lotId.localeCompare(b.lotId, 'en', { numeric: true });
  const runs = () => Object.values(L().runs).filter((r) => r.processId === CORD_WORK.processId && live(r.status));
  const dataOf = (r: { state?: { data?: unknown } | null }) => r.state?.data as any;
  const dryRun = () => runs().find((r) => dataOf(r)?.spec?.operation === 'dry' && dataOf(r).spec.facts.worksite.locationId === sites().dry.id);
  const workRun = () => runs().find((r) => dataOf(r)?.spec?.operation !== 'dry' && dataOf(r)?.spec?.facts.worksite.locationId === sites().work.id);
  const inUse = () => new Set([st().hang?.cordLotId, st().raft?.cordLotId].filter(Boolean) as string[]);
  const isCord = (l?: LotView) => !!l && (l.materialId === STRAND || l.materialId === ROPE);
  const bundle = () => lots().filter((l) => l.materialId === BUNDLE && !l.reservedBy).sort(byId)[0];
  const cords = (m: string) => lots().filter((l) => l.materialId === m && !l.reservedBy && !inUse().has(l.lotId)).sort(byId);
  const lengthOf = (l: LotView) => Number(l.quality?.length_mm ?? 0);   // (the world's own measure of a piece: never told)
  // (three strands of one length lying in one place: the oldest three)
  const plyable = () => {
    const g = new Map<string, LotView[]>();
    for (const l of cords(STRAND)) { const k = `${l.location}|${lengthOf(l)}`; g.set(k, [...(g.get(k) ?? []), l]); }
    return [...g.values()].filter((x) => x.length >= 3).map((x) => x.slice(0, 3)).sort((a, b) => byId(a[0], b[0]))[0];
  };
  const pot = () => lots().filter((l) => l.materialId === 'fired_pot' && l.location === 'shelf' && !l.reservedBy && !l.quality?.crack).sort(byId)[0];
  const intent = (i: Parameters<typeof applyCordIntent>[1], now: number, facts?: CordStartFacts) => applyCordIntent(L(), i, cordWorkRevision(L()), now, facts);

  function options(actorId: string, nowWorldMs: number): Option[] {
    const o: Option[] = [], w = workRun(), wd = w && dataOf(w), takenByOther = !!wd && engagedNow(wd) && wd.controls.at(-1).actorId !== actorId;
    if (ctx.roofed() && bundle() && !dryRun()) o.push({ id: 'cord:dry', action: 'cord-dry', label: 'ヤシの繊維の束を軒下に干す', targetId: 'cord-dry' });
    if (dryRun()) o.push({ id: 'cord:takein', action: 'cord-takein', label: '軒下に干した繊維を取り込む', targetId: 'cord-dry' });
    if (!w) {   // (the worksite holds one piece of work at a time)
      if (bundle()) {
        o.push({ id: 'cord:sieve', action: 'cord-work', label: 'ヤシの繊維を振るって髄を落とす', targetId: 'cord-work' });
        for (const [use, u] of Object.entries(CORD_USES)) o.push({ id: `cord:twist:${use}`, action: 'cord-work', label: `ヤシの繊維を撚って糸にする（${u.ja}）`, targetId: 'cord-work' });
      }
      if (plyable()) o.push({ id: 'cord:ply', action: 'cord-work', label: '撚り糸を三本合わせて縄にする', targetId: 'cord-work' });
    } else if (!takenByOther && !engagedNow(wd)) {
      o.push({ id: 'cord:resume', action: 'cord-work', label: 'やりかけの縄仕事を続ける', targetId: 'cord-work' });
      o.push({ id: 'cord:clear', action: 'cord-clear', label: 'やりかけの縄仕事を片付ける', targetId: 'cord-work' });
    }
    if (!st().hang && pot() && cords(ROPE).length) o.push({ id: 'cord:hang', action: 'cord-hang', label: '縄で鍋を軒下に吊るす', targetId: 'cord-hang' });
    if (st().hang) o.push({ id: 'cord:unhang', action: 'cord-unhang', label: '軒下に吊るした鍋を下ろす', targetId: 'cord-hang' });
    if (ctx.raftWhole() && !st().raft && cords(ROPE).some((l) => lengthOf(l) >= RAFT_ROPE_MIN_MM)) o.push({ id: 'cord:lash', action: 'cord-lash', label: '縄で筏の部材を縛る', targetId: 'raft' });
    const n = (st().decisions[actorId] = (st().decisions[actorId] ?? 0) + 1);
    return o.map((x) => [x, draw(SEED, actorId, String(nowWorldMs), String(n), 'options', x.id)] as const).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  }

  // (a cord's sun up to the moment it is moved or used: its place — in the shade or not — changes after)
  function carry(lotId: string, to: string, at: number, actorId: string): boolean {
    if (isCord(L().lots[lotId])) sunOn(lotId, at);
    const m = moveLot(L(), lotId, to); if (!m.lot) log(at, actorId, 'carry', m.why); return !!m.lot;
  }
  function ground(lotId: string, at: number) { if (isCord(L().lots[lotId])) sunOn(lotId, at); moveLot(L(), lotId, 'ground'); }
  const facts = (site: CordSite, extra: Partial<CordStartFacts> = {}): CordStartFacts => ({ assumptionId: COIR_CORD_ASSUMPTION_ID, worksite: { locationId: site.id, x: site.x, z: site.z, reachM: site.reachM }, ...extra });

  function putToDry(actorId: string, nowWorldMs: number): string | null {
    const b = bundle(), s = sites().dry, was = b?.location; if (!b || !ctx.roofed() || dryRun()) return null;
    if (!carry(b.lotId, s.id, nowWorldMs, actorId)) return null;
    try {
      const { runId } = intent({ intentId: `dry:${actorId}:${nowWorldMs}`, kind: 'start', actorId, atWorldMs: nowWorldMs, operation: 'dry', lotIds: [b.lotId], siteId: s.id, presence: 'here' }, nowWorldMs, facts(s, { roofed: true }));
      st().dry[runId] = nowWorldMs; st().rack = true;
      return '繊維の束を軒下に広げた';
    } catch (e) { moveLot(L(), b.lotId, was!); log(nowWorldMs, actorId, 'dry', e); return null; }   // (it could not be laid out: back where it was)
  }

  function confirmDry(nowWorldMs: number) {
    const r = dryRun(); if (!r) return;
    const from = st().dry[r.runId]; if (from === undefined) { st().dry[r.runId] = nowWorldMs; return; }
    if (nowWorldMs <= from) return;
    try {
      recordCordSpan(L(), r.runId, { kind: 'confirmed-roofed-wait', spanId: `${r.runId}:${from}`, worldId: L().world.worldId, worldEpoch: L().world.worldEpoch, runId: r.runId,
        fromWorldMs: from, toWorldMs: nowWorldMs, confirmedAtWorldMs: nowWorldMs, siteId: sites().dry.id, roofed: ctx.roofed() }, cordWorkRevision(L()), nowWorldMs);
      st().dry[r.runId] = nowWorldMs;
    } catch (e) { log(nowWorldMs, '', 'dry-span', e); }
    if (!dryRun()) delete st().dry[r.runId];
  }

  function takeIn(actorId: string, nowWorldMs: number): string | null {
    const r = dryRun(); if (!r) return null;
    confirmDry(nowWorldMs);   // (up to the moment it takes them in: nothing left unconfirmed, nothing made up)
    if (!dryRun()) return '乾いた繊維の束を取り込んだ';
    try {
      intent({ intentId: `dry-stop:${actorId}:${nowWorldMs}`, kind: 'stop', actorId: dataOf(r).controls.at(-1).actorId, atWorldMs: nowWorldMs, runId: r.runId }, nowWorldMs);
      intent({ intentId: `dry-abandon:${actorId}:${nowWorldMs}`, kind: 'abandon', actorId: dataOf(L().runs[r.runId]).controls.at(-1).actorId, atWorldMs: nowWorldMs, runId: r.runId }, nowWorldMs);
      delete st().dry[r.runId];
      return readCordWorksite(L(), sites().dry.id, nowWorldMs).observations[0]?.text.replace(/。$/, '') ?? null;
    } catch (e) { log(nowWorldMs, actorId, 'takein', e); return null; }
  }

  function beginWork(actorId: string, op: Op | 'resume', use: keyof typeof CORD_USES | undefined, at: { x: number; z: number }, nowWorldMs: number): { ok: true } | { ok: false; felt: string | null } {
    const s = sites().work, w = workRun(), base = { actorId, atWorldMs: nowWorldMs };
    try {
      let runId: string;
      if (w) {
        const d = dataOf(w); if (engagedNow(d)) return { ok: false, felt: null };   // (another's hands are at it)
        const mine = d.controls.at(-1).actorId === actorId;
        runId = intent({ intentId: `${mine ? 'resume' : 'takeover'}:${actorId}:${nowWorldMs}`, kind: mine ? 'resume' : 'takeover', runId: w.runId, presence: 'here', ...base }, nowWorldMs).runId;
      } else {
        if (op === 'resume') return { ok: false, felt: null };
        const src = op === 'ply' ? plyable() : [bundle()].filter(Boolean) as LotView[]; if (!src?.length) return { ok: false, felt: null };
        for (const l of src) if (!carry(l.lotId, s.id, nowWorldMs, actorId)) return { ok: false, felt: null };   // (it brings them to the worksite)
        const extra = op === 'twist' ? { requestedLengthMm: CORD_USES[use ?? 'pot'].mm } : {};
        try { runId = intent({ intentId: `start:${actorId}:${nowWorldMs}`, kind: 'start', operation: op, lotIds: src.map((l) => l.lotId), siteId: s.id, presence: 'here', ...base }, nowWorldMs, facts(s, extra)).runId; }
        catch (e) {   // (it put its hands to the fibre, and it would not go: what it felt, from the science side's own words)
          log(nowWorldMs, actorId, `start-${op}`, e);
          return { ok: false, felt: cordFailureObservations(e, { kind: 'host-confirmed-on-site-attempt' })[0]?.text.replace(/。$/, '') ?? null };
        }
      }
      st().engaged[actorId] = { runId, from: nowWorldMs, at: { x: at.x, z: at.z } };
      return { ok: true };
    } catch (e) { log(nowWorldMs, actorId, 'work', e); return { ok: false, felt: null }; }
  }

  function confirm(actorId: string, at: { x: number; z: number }, nowWorldMs: number) {
    const e = st().engaged[actorId]; if (!e || nowWorldMs <= e.from) return;
    const d = dataOf(L().runs[e.runId] ?? {}); if (!d) { delete st().engaged[actorId]; return; }
    const op = d.spec.operation as Op, activity = op === 'sieve' ? 'sieve-coir' : op === 'twist' ? 'twist-coir' : 'ply-coir';
    const span: CordManualSpan = { kind: 'executor-activity-span', spanId: `${actorId}:${e.from}`, worldId: L().world.worldId, worldEpoch: L().world.worldEpoch, runId: e.runId, actorId,
      fromWorldMs: e.from, toWorldMs: nowWorldMs, confirmedAtWorldMs: nowWorldMs, activity, targetLotId: d.spec.lotIds[0], targetSiteId: sites().work.id, arrived: true,
      fromPosition: { ...e.at }, toPosition: { x: at.x, z: at.z } };
    if (live(L().runs[e.runId].status)) { try { recordCordSpan(L(), e.runId, span, cordWorkRevision(L()), nowWorldMs); } catch (err) { log(nowWorldMs, actorId, 'work-span', err); } }
    e.from = nowWorldMs; e.at = { x: at.x, z: at.z };
  }

  function working(actorId: string, at: { x: number; z: number }, nowWorldMs: number): { done: false } | { done: true; words: string[] } {
    const e = st().engaged[actorId]; if (!e) return { done: false };
    if (nowWorldMs - e.from >= WORK_EVERY_MS) confirm(actorId, at, nowWorldMs);
    const run = L().runs[e.runId];
    if (run && !live(run.status)) {
      delete st().engaged[actorId];
      const words = (() => { try { return readCordWorkerObservations(L(), e.runId, actorId).map((o) => o.text); } catch (err) { log(nowWorldMs, actorId, 'observe', err); return []; } })();
      return { done: true, words };
    }
    return { done: false };
  }

  function stopWork(actorId: string, at: { x: number; z: number }, nowWorldMs: number) {
    const e = st().engaged[actorId]; if (!e) return;
    confirm(actorId, at, nowWorldMs);
    delete st().engaged[actorId];
    if (!live(L().runs[e.runId]?.status ?? '')) return;
    try { intent({ intentId: `stop:${actorId}:${nowWorldMs}`, kind: 'stop', actorId, atWorldMs: nowWorldMs, runId: e.runId }, nowWorldMs); } catch (err) { log(nowWorldMs, actorId, 'stop', err); }
  }

  function clearAway(actorId: string, nowWorldMs: number): string | null {
    const w = workRun(); if (!w || engagedNow(dataOf(w))) return null;
    try {
      if (dataOf(w).controls.at(-1).actorId !== actorId) {   // (another's half-done work: it takes it on, puts it down, and clears it away)
        intent({ intentId: `takeover:${actorId}:${nowWorldMs}`, kind: 'takeover', actorId, atWorldMs: nowWorldMs, runId: w.runId, presence: 'here' }, nowWorldMs);
        intent({ intentId: `stop:${actorId}:${nowWorldMs}`, kind: 'stop', actorId, atWorldMs: nowWorldMs, runId: w.runId }, nowWorldMs);
      }
      intent({ intentId: `abandon:${actorId}:${nowWorldMs}`, kind: 'abandon', actorId, atWorldMs: nowWorldMs, runId: w.runId }, nowWorldMs);
      return readCordWorksite(L(), sites().work.id, nowWorldMs).observations[0]?.text.replace(/。$/, '') ?? null;
    } catch (e) { log(nowWorldMs, actorId, 'clear', e); return null; }
  }

  /* ---------- the world's own events on a cord ---------- */
  // (one event on one cord: the sun first, up to now, then the event; a cord that broke is two new lots, and the old id
  // is gone — the world keeps track of where its pieces are, a resident of where the cord was)
  function event(lotId: string, commandId: string, ev: CordHostEvent, nowWorldMs: number, actorId = ''): { lotIds: string[]; words: string[] } | null {
    try {
      const r = applyCordLoad(L(), { commandId, assumptionId: COIR_CORD_ASSUMPTION_ID, lotId, worldAtMs: nowWorldMs, islandAtMs: island(nowWorldMs), event: ev });
      if (r.lotIds[0] !== lotId) { const to = st().sun[lotId]; delete st().sun[lotId]; for (const id of r.lotIds) st().sun[id] = to ?? island(nowWorldMs); }
      return { lotIds: r.lotIds, words: r.observations };
    } catch (e) { log(nowWorldMs, actorId, `cord-${ev.kind}`, e); return null; }
  }
  function sunOn(lotId: string, nowWorldMs: number) {
    const to = island(nowWorldMs), from = st().sun[lotId];
    if (from === undefined || L().lots[lotId]?.reservedBy) { st().sun[lotId] = to; return; }   // (first seen, or in someone's hands: from now)
    if (to <= from) return;
    const shade = SHADED(sites()).includes(L().lots[lotId].location);
    if (event(lotId, `sun:${lotId}:${from}:${to}`, { kind: 'exposure', fromIslandMs: from, toIslandMs: to, shade }, nowWorldMs)) st().sun[lotId] = to;
    else st().sun[lotId] = to;   // (refused: the developer's log has it; not tried again for the same hours)
  }
  const potGf = () => {
    const h = st().hang; if (!h) return 0;
    const mg = [h.potLotId, ...lots().filter((l) => l.location === h.potLotId).map((l) => l.lotId)].reduce((s, id) => s + (L().lots[id]?.amount.value ?? 0), 0);
    return Math.ceil(mg / 1000);
  };
  function loadPot(nowWorldMs: number, actorId = ''): string | null {
    const h = st().hang!; const gf = potGf();
    sunOn(h.cordLotId, nowWorldMs);
    const r = event(h.cordLotId, `hang:${h.cordLotId}:${h.potLotId}:${gf}`, { kind: 'load', gf }, nowWorldMs, actorId); if (!r) return null;
    h.maxGf = Math.max(h.maxGf, gf);
    if (r.lotIds.length > 1) {   // (the cord gave: the pot is on the ground below, and so are the pieces)
      moveLot(L(), h.potLotId, 'ground');
      for (const id of r.lotIds) ground(id, nowWorldMs);
      st().hang = null;
    } else h.cordLotId = r.lotIds[0];
    return r.words[0]?.replace(/。$/, '') ?? null;   // (whether it held: the wear is for the one who looks at it closely)
  }

  function hang(actorId: string, nowWorldMs: number): string | null {
    const p = pot(), c = cords(ROPE)[0], s = sites().hang; if (!p || !c || st().hang) return null;
    if (!carry(p.lotId, s.id, nowWorldMs, actorId) || !carry(c.lotId, s.id, nowWorldMs, actorId)) return null;
    st().hang = { potLotId: p.lotId, cordLotId: c.lotId, maxGf: 0 };
    const w = loadPot(nowWorldMs, actorId);
    return st().hang ? `鍋を縄で軒下に吊るした${w ? `。${w}` : ''}` : `鍋を縄で吊るそうとした${w ? `。${w}` : ''}`;
  }

  // (the pot taken down: back on the shelf, and the rope with it — the sun on the rope up to then)
  function unhang(actorId: string, nowWorldMs: number): string | null {
    const h = st().hang; if (!h) return null;
    if (!carry(h.cordLotId, 'shelf', nowWorldMs, actorId)) return null;
    moveLot(L(), h.potLotId, 'shelf'); st().hang = null;
    return '吊るしていた鍋を下ろして棚に戻した';
  }

  function lash(actorId: string, nowWorldMs: number): string | null {
    const c = cords(ROPE).filter((l) => lengthOf(l) >= RAFT_ROPE_MIN_MM)[0]; if (!c || st().raft || !ctx.raftWhole()) return null;
    if (!carry(c.lotId, 'site:raft', nowWorldMs, actorId)) return null;
    st().raft = { cordLotId: c.lotId, out: null, wind: 0 };
    return '筏の部材を縄で縛った';
  }
  function voyageOut(nowWorldMs: number) { const r = st().raft; if (r) { r.out = nowWorldMs; r.wind = 0; } }
  function voyageHome(nowWorldMs: number): string | null {
    const r = st().raft; if (!r || r.out === null) return null;
    const out = r.out; r.out = null;
    sunOn(r.cordLotId, nowWorldMs);
    const gf = 20_000 + 4_000 * Math.ceil(r.wind);
    const a = event(r.cordLotId, `raft:${r.cordLotId}:${out}:load`, { kind: 'load', gf }, nowWorldMs); if (!a) return null;
    const words = [...a.words];
    if (a.lotIds.length === 1) {
      const b = event(a.lotIds[0], `raft:${a.lotIds[0]}:${out}:abrasion`, { kind: 'abrasion', count: 1 }, nowWorldMs);
      if (b) words.push(...b.words);
      const now = (b ?? a).lotIds;
      if (now.length === 1) r.cordLotId = now[0]; else { st().raft = null; for (const id of now) ground(id, nowWorldMs); }
    } else { st().raft = null; for (const id of a.lotIds) ground(id, nowWorldMs); }
    return words.length ? `筏の縄：${words.map((w) => w.replace(/。$/, '')).join('。')}` : null;
  }

  function look(actorId: string, at: { x: number; z: number }, nowWorldMs: number): string | null {
    const s = sites();
    for (const site of [s.dry, s.work]) {
      if (Math.hypot(at.x - site.x, at.z - site.z) > Math.max(site.reachM, 2.5)) continue;   // (presence 'here' only)
      let text: string | undefined;
      try { text = readCordWorksite(L(), site.id, nowWorldMs).observations[0]?.text; } catch (e) { log(nowWorldMs, actorId, 'look', e); continue; }
      const key = `${site.id}|${text ?? ''}`;
      if (!text || st().looked[actorId] === key) continue;
      st().looked[actorId] = key; return text.replace(/。$/, '');
    }
    return null;
  }

  function tick(nowWorldMs: number, windMs: number | null) {
    const r = st().raft; if (r && r.out !== null && windMs !== null) r.wind = Math.max(r.wind, windMs);
    const d = dryRun(); if (d && nowWorldMs - (st().dry[d.runId] ?? -Infinity) >= DRY_EVERY_MS) confirmDry(nowWorldMs);
    if (st().hang && potGf() > st().hang!.maxGf) loadPot(nowWorldMs);   // (heavier than it has yet been: the cord takes the new weight)
    if (nowWorldMs - (st().newAt ?? 0) >= NEW_CORD_EVERY_MS) {   // (a cord just made: its sun counted from now — nothing sent)
      st().newAt = nowWorldMs;
      for (const l of lots()) if (isCord(l) && st().sun[l.lotId] === undefined) st().sun[l.lotId] = island(nowWorldMs);
    }
    if (nowWorldMs - st().sunAt < SUN_EVERY_MS) return;
    st().sunAt = nowWorldMs;
    for (const l of lots().filter(isCord)) if (L().lots[l.lotId]) sunOn(l.lotId, nowWorldMs);
    for (const id of Object.keys(st().sun)) if (!L().lots[id]) delete st().sun[id];
  }

  function restore(nowWorldMs: number) {
    st().engaged = {};   // (no hands are at the cord across a load: its time off is not work; the roof's time goes on in one span)
    st().looked ??= {}; st().sun ??= {}; st().sunAt ??= 0;
    if (!L().cordArrangement) return;
    try { Object.assign(ctx.lab, restoreCordWork(L(), nowWorldMs)); } catch (e) { log(nowWorldMs, '', 'restore-cord', e); }
  }

  return { options, putToDry, takeIn, beginWork, working, stopWork, clearAway, isWorking: (a) => !!st().engaged[a], hang, unhang, lash, voyageOut, voyageHome, look, tick, restore, sites, raftLashed: () => !!st().raft };
}
