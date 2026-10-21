// The residents' hands on the raft's sail (the science side's sail-work, wired to the island's bodies: 2026-10-19,
// main ↔ science, the same terms as the cord: robots/cord-host.ts). What a resident chooses, where it stands and what its
// hands are doing are the world's (residents.ts); how long a leaf takes to cut, dry, split and weave, and what comes of
// it, are the science side's. This file is the only place that calls them, and it passes them nothing but:
//  - an intent (start / go on with / hand over / stop / clear away), made when the body is there (presence 'here');
//  - spans the executor has confirmed: the world-clock time a resident's hands were at the work (every 30 s, split at
//    every stop, never across a gap), and the time the leaves lay under the roof (every 60 s; across a load, one span);
// and it takes back only the words a resident could see or feel, and the lots the work settled. The science side's
// codes, the amounts, the mat's size and strength stay out of a resident's mind: codes go to the developer's log here.
// The mat's size is the raft's one sail, fixed here and by the science side, never a number its mind picks. The options
// are every hand action the materials and places allow, in an order seeded by the island, the resident and the moment.
import type { Ledger } from '../world/process-runner';
import type { LotView } from '../world/science-contract';
import { addLot, moveLot } from '../world/process-runner';
import type { Option } from './agent/types';
import { draw } from '../science/rng';
import { sailAssumptionId, SAIL_RULES } from '../science/prototypes/sail-raft-rules';
import { readPlantMass } from '../world/sail-lots';
import { applySailIntent, recordSailSpan, restoreSailWork, sailWorkRevision, readSailWorksite, readSailWorkerObservations, sailFailureObservations, projectSailWork,
  SAIL_WORK, type SailWorkLedger, type SailStartFacts, type SailManualSpan, type Operation } from '../world/sail-work';

export interface SailSite { id: string; x: number; z: number; reachM: number }
type Hand = Exclude<Operation, 'dry'>;
/** The world's own bookkeeping for the sail (saved with the village). Nothing in it is told to a resident. */
export interface SailHostState {
  sites: { trees: SailSite[]; dry: SailSite; work: SailSite } | null;
  dry: Record<string, number>;                                                   // dry runId → the world time confirmed so far
  dried: string[];                                                               // leaves a roofed wait finished drying (lotIds)
  engaged: Record<string, { runId: string; from: number; at: { x: number; z: number } }>;   // actor → its hands at the work
  decisions: Record<string, number>;
  looked: Record<string, string>;                                                // actor → what it last saw at a sail place
}
export const emptySailHostState = (): SailHostState => ({ sites: null, dry: {}, dried: [], engaged: {}, decisions: {}, looked: {} });
export interface SailDevEntry { at: number; actorId: string; action: string; code: string }

const SEED = 0x7361696c;   // 'sail'
const DRY_EVERY_MS = 60_000, WORK_EVERY_MS = 30_000;
/** The pandanus by the shore: three cuttings' worth of standing leaves on each tree (the world's own stock, 2026-10-19). */
export const PANDANUS = { lotsPerTree: 3, dryMg: 1_000_000, waterMg: 2_000_000 } as const;
const TREES = ['near', 'far'] as const, TREE_JA = ['手前の木', '奥の木'];   // (the places' names in an option: no number in them)
const SAIL_AREA_CM2 = 20_000;   // (the one sail's area: world/sail-work.ts, fixed-sail-area-required)
const STANDING = 'pandanus_standing_leaves', LEAVES = 'pandanus_leaves', STRIPS = 'pandanus_strips', MAT = 'sail_mat', MAST = 'bamboo_mast';
const ACTIVITY: Record<Hand, SailManualSpan['activity']> = { harvest: 'harvest-leaves', split: 'split-leaves', weave: 'weave-mat', mast: 'cut-mast' };
const codeOf = (e: unknown) => (e as { code?: string })?.code ?? (e instanceof Error ? e.message : String(e));
const live = (status: string) => ['starting', 'running', 'needs-input'].includes(status);

export interface SailHost {
  options(actorId: string, nowWorldMs: number): Option[];
  /** Under the back eaves, the cut leaves laid out to dry: the words for what it did, or null. */
  putToDry(actorId: string, nowWorldMs: number): string | null;
  takeIn(actorId: string, nowWorldMs: number): string | null;
  /** Where the work is (a tree for cutting, the bench for the rest), its hands to it: its own half-done work, another's, or new. */
  beginWork(actorId: string, op: Hand | 'resume', place: string, at: { x: number; z: number }, nowWorldMs: number): { ok: true } | { ok: false; felt: string | null };
  working(actorId: string, at: { x: number; z: number }, nowWorldMs: number): { done: false } | { done: true; words: string[] };
  stopWork(actorId: string, at: { x: number; z: number }, nowWorldMs: number): void;
  clearAway(actorId: string, place: string, nowWorldMs: number): string | null;
  isWorking(actorId: string): boolean;
  /** What a body at a sail place sees there (presence 'here' only): new since it last looked, or null. */
  look(actorId: string, at: { x: number; z: number }, nowWorldMs: number): string | null;
  /** The island's clock goes on: the leaves' time under the roof. */
  tick(nowWorldMs: number): void;
  restore(nowWorldMs: number): void;
  sites(): NonNullable<SailHostState['sites']>;
  /** A place named in an option (near, far: the two trees; work, dry). */
  site(place: string): SailSite | null;
}

export function makeSailHost(ctx: {
  lab: Ledger;
  state: () => SailHostState;
  placeSites: () => NonNullable<SailHostState['sites']>;
  roofed: () => boolean;           // (the hut's roof is up: the drying place is under it)
  wanted: () => boolean;           // (a raft stands: a sail is something to make)
  dev: SailDevEntry[];
}): SailHost {
  const L = () => ctx.lab as SailWorkLedger;
  const st = () => ctx.state();
  // (found once and kept with the village; the trees' standing leaves put on them then, under fixed ids)
  const sites = () => {
    const s = st();
    if (!s.sites) {
      s.sites = ctx.placeSites();
      s.sites.trees.forEach((t, i) => { for (let k = 0; k < PANDANUS.lotsPerTree; k++) { const lotId = `lot:pandanus:${i}:${k}`; if (!L().lots[lotId]) addLot(L(), { lotId, materialId: STANDING, amount: { value: PANDANUS.dryMg + PANDANUS.waterMg, unit: 'mg' }, location: t.id,
        quality: { dry_mg: PANDANUS.dryMg, water_mg: PANDANUS.waterMg, history_complete: 1, sail_codec: 1 } }); } });
    }
    return s.sites;
  };
  const site = (place: string): SailSite | null => { const s = sites(); return place === 'work' ? s.work : place === 'dry' ? s.dry : s.trees[TREES.indexOf(place as never)] ?? null; };
  const log = (at: number, actorId: string, action: string, e: unknown) => { ctx.dev.push({ at, actorId, action, code: codeOf(e) }); if (ctx.dev.length > 200) ctx.dev.shift(); };
  const lots = () => Object.values(L().lots) as (LotView & { reservedBy?: string })[];
  const byId = (a: { lotId: string }, b: { lotId: string }) => a.lotId.localeCompare(b.lotId, 'en', { numeric: true });
  const free = (m: string, where?: string) => lots().filter((l) => l.materialId === m && !l.reservedBy && (where === undefined || l.location === where)).sort(byId);
  const runs = () => Object.values(L().runs).filter((r) => r.processId === SAIL_WORK.processId && live(r.status));
  const dataOf = (r: { state?: { data?: unknown } | null }) => r.state?.data as any;
  const runAt = (siteId: string) => runs().find((r) => dataOf(r)?.spec?.facts.worksite.locationId === siteId);
  const dryRun = () => runAt(sites().dry.id);
  const wetLeaves = () => free(LEAVES).filter((l) => !st().dried.includes(l.lotId));
  const intent = (i: Parameters<typeof applySailIntent>[1], now: number, facts?: SailStartFacts) => applySailIntent(L(), i, sailWorkRevision(L()), now, facts);
  const facts = (s: SailSite, extra: Partial<SailStartFacts> = {}): SailStartFacts => ({ assumptionId: sailAssumptionId(), worksite: { locationId: s.id, x: s.x, z: s.z, reachM: s.reachM }, ...extra });
  // (a bamboo shorter than a mast can never be one: its length is plain to see — not offered; science review of PR #50)
  const longEnough = (l: LotView) => { try { return (readPlantMass(l).lengthMm ?? 0) >= SAIL_RULES.mastMm; } catch { return false; } };
  // The existing offer guard applies to a whole same-place group, not each
  // partial bundle. It still refuses an insufficient aggregate before carrying.
  const enoughToWeave = (bundles: LotView[]): boolean => {
    try {
      let dry = 0n, water = 0n;
      for (const lot of bundles) {
        const mass = readPlantMass(lot);
        dry += BigInt(mass.dryMg);
        water += BigInt(mass.waterMg);
      }
      return dry + water <= BigInt(Number.MAX_SAFE_INTEGER)
        && dry >= BigInt(SAIL_AREA_CM2) * BigInt(SAIL_RULES.weaveDryMgPerCm2);
    } catch {
      return false;
    }
  };
  // (what a piece of work at the bench would take: the oldest of its kind; a mast from the bamboo on the shelf)
  // (leaves still wet cannot be split — science soak 2026-10-21, dry-leaves-required 17 to 24 times in 12 hours, and no
  // mat in 36 hours: not offered until they are dry, at the science side's own line, water at most a fifth of the dry)
  const dryEnough = (l: LotView) => { try { const m = readPlantMass(l); return m.waterMg * 5 <= m.dryMg; } catch { return false; } };
  const sourceFor = (op: Hand, place: string): LotView | undefined =>
    op === 'harvest' ? free(STANDING, site(place)?.id)[0] : op === 'split' ? free(LEAVES).filter((l) => (l.location !== sites().dry.id || st().dried.includes(l.lotId)) && dryEnough(l))[0]
      : op === 'weave' ? weaveSources()[0] : free('bamboo', 'shelf').find(longEnough);

  // A single intent may gather several bundles from the same place. The list is
  // explicit at the science boundary; reserved lots and other places stay put.
  const together = (candidates: LotView[], place: string): LotView[] => {
    const first = candidates.find(l => l.location === place) ?? candidates[0];
    return first ? candidates.filter(l => l.location === first.location) : [];
  };
  function weaveSources(): LotView[] {
    const candidates = free(STRIPS);
    const places = [...new Set([sites().work.id, ...candidates.map(l => l.location)])];
    for (const place of places) {
      const group = candidates.filter(l => l.location === place);
      if (enoughToWeave(group)) return group;
    }
    return [];
  }
  const sourcesFor = (op: Hand, place: string): LotView[] => {
    if (op === 'weave') return weaveSources();
    const source = sourceFor(op, place);
    return source ? [source] : [];
  };
  function carryBatch(
    sources: LotView[], to: string, at: number, actorId: string
  ): {lotId: string; location: string}[] | null {
    const previous = sources.map(l => ({lotId: l.lotId, location: l.location}));
    const moved: typeof previous = [];
    for (const original of previous) {
      if (!carry(original.lotId, to, at, actorId)) {
        for (const back of moved) moveLot(L(), back.lotId, back.location);
        return null;
      }
      moved.push(original);
    }
    return previous;
  }
  function putBatchBack(previous: {lotId: string; location: string}[]): void {
    for (const original of previous) moveLot(L(), original.lotId, original.location);
  }


  function options(actorId: string, nowWorldMs: number): Option[] {
    if (!ctx.wanted()) return [];
    const o: Option[] = [], s = sites();
    const paused = (siteId: string, ja: string, place: string) => {   // (half-done work no one's hands are at: its own, or another's to take on)
      const r = runAt(siteId); if (!r) return false;
      if (!dataOf(r).engaged) {
        o.push({ id: `sail:resume:${place}`, action: 'sail-work', label: `やりかけの${ja}を続ける`, targetId: `sail-${place}` });
        o.push({ id: `sail:clear:${place}`, action: 'sail-clear', label: `やりかけの${ja}を片付ける`, targetId: `sail-${place}` });
      }
      return true;
    };
    s.trees.forEach((t, i) => { if (!paused(t.id, `アダンの葉の刈り取り（${TREE_JA[i]}）`, TREES[i]) && free(STANDING, t.id).length) o.push({ id: `sail:harvest:${TREES[i]}`, action: 'sail-work', label: `アダンの葉を刈り取る（${TREE_JA[i]}）`, targetId: `sail-${TREES[i]}` }); });
    if (ctx.roofed() && wetLeaves().length && !dryRun()) o.push({ id: 'sail:dry', action: 'sail-dry', label: '刈ったアダンの葉を裏の軒下に干す', targetId: 'sail-dry' });
    if (dryRun()) o.push({ id: 'sail:takein', action: 'sail-takein', label: '裏の軒下に干したアダンの葉を取り込む', targetId: 'sail-dry' });
    if (!paused(s.work.id, '帆の仕事', 'work')) {   // (the bench holds one piece of work at a time)
      if (sourceFor('split', 'work')) o.push({ id: 'sail:split:work', action: 'sail-work', label: 'アダンの葉を細く裂く', targetId: 'sail-work' });
      if (sourceFor('weave', 'work')) o.push({ id: 'sail:weave:work', action: 'sail-work', label: '裂いた葉で帆のむしろを編む', targetId: 'sail-work' });
      if (sourceFor('mast', 'work') && !lots().some((l) => l.materialId === MAST) && !Object.values(L().equipment).some((e) => e.assembled?.parts?.some((p) => p.materialId === MAST)))   // (one mast: on the beach, or up in the rig at sea)
      o.push({ id: 'sail:mast:work', action: 'sail-work', label: '竹を切ってマストにする', targetId: 'sail-work' });
    }
    const n = (st().decisions[actorId] = (st().decisions[actorId] ?? 0) + 1);
    return o.map((x) => [x, draw(SEED, actorId, String(nowWorldMs), String(n), 'options', x.id)] as const).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  }

  function carry(lotId: string, to: string, at: number, actorId: string): boolean {
    const m = moveLot(L(), lotId, to); if (!m.lot) log(at, actorId, 'carry', m.why); return !!m.lot;
  }

  function putToDry(actorId: string, nowWorldMs: number): string | null {
    const s = sites().dry, sources = together(wetLeaves(), s.id);
    if (!sources.length || !ctx.roofed() || dryRun()) return null;
    const previous = carryBatch(sources, s.id, nowWorldMs, actorId);
    if (!previous) return null;
    try {
      const { runId } = intent({ intentId: `dry:${actorId}:${nowWorldMs}`, kind: 'start', actorId, atWorldMs: nowWorldMs, operation: 'dry', lotIds: sources.map(l => l.lotId), siteId: s.id, presence: 'here' }, nowWorldMs, facts(s, { roofed: true }));
      st().dry[runId] = nowWorldMs;
      return 'アダンの葉を軒下に広げた';
    } catch (e) { putBatchBack(previous); log(nowWorldMs, actorId, 'dry', e); return null; }   // (it could not be laid out: back where it was)
  }

  // (a dry run that finished: the leaves it left are dry — the world remembers which, a resident sees how they are)
  function settled(runId: string, nowWorldMs: number) {
    delete st().dry[runId];
    try { const f: any = projectSailWork(L(), runId); if (f.status === 'completed') st().dried.push(...f.lotIds); } catch (e) { log(nowWorldMs, '', 'dry-settled', e); }
  }

  function confirmDry(nowWorldMs: number) {
    const r = dryRun(); if (!r) return;
    const from = st().dry[r.runId]; if (from === undefined) { st().dry[r.runId] = nowWorldMs; return; }
    if (nowWorldMs <= from) return;
    try {
      recordSailSpan(L(), r.runId, { kind: 'confirmed-roofed-wait', spanId: `${r.runId}:${from}`, worldId: L().world.worldId, worldEpoch: L().world.worldEpoch, runId: r.runId,
        fromWorldMs: from, toWorldMs: nowWorldMs, confirmedAtWorldMs: nowWorldMs, siteId: sites().dry.id, roofed: ctx.roofed() }, sailWorkRevision(L()), nowWorldMs);
      st().dry[r.runId] = nowWorldMs;
    } catch (e) { log(nowWorldMs, '', 'dry-span', e); }
    if (!dryRun()) settled(r.runId, nowWorldMs);
  }

  function takeIn(actorId: string, nowWorldMs: number): string | null {
    const r = dryRun(); if (!r) return null;
    confirmDry(nowWorldMs);   // (up to the moment it takes them in: nothing left unconfirmed, nothing made up)
    if (!dryRun()) return '乾いたアダンの葉を取り込んだ';
    try {
      const owner = dataOf(r).actorId;
      if (dataOf(r).engaged) intent({ intentId: `dry-stop:${actorId}:${nowWorldMs}`, kind: 'stop', actorId: owner, atWorldMs: nowWorldMs, runId: r.runId }, nowWorldMs);
      intent({ intentId: `dry-abandon:${actorId}:${nowWorldMs}`, kind: 'abandon', actorId: owner, atWorldMs: nowWorldMs, runId: r.runId }, nowWorldMs);
      delete st().dry[r.runId];
      return readSailWorksite(L(), sites().dry.id, nowWorldMs).observations[0]?.text.replace(/。$/, '') ?? null;
    } catch (e) { log(nowWorldMs, actorId, 'takein', e); return null; }
  }

  function beginWork(actorId: string, op: Hand | 'resume', place: string, at: { x: number; z: number }, nowWorldMs: number): { ok: true } | { ok: false; felt: string | null } {
    const s = site(place); if (!s || place === 'dry') return { ok: false, felt: null };
    const w = runAt(s.id), base = { actorId, atWorldMs: nowWorldMs };
    try {
      let runId: string;
      if (w) {
        const d = dataOf(w); if (d.engaged) return { ok: false, felt: null };   // (another's hands are at it)
        const mine = d.actorId === actorId;
        runId = intent({ intentId: `${mine ? 'resume' : 'takeover'}:${actorId}:${nowWorldMs}`, kind: mine ? 'resume' : 'takeover', runId: w.runId, presence: 'here', ...base }, nowWorldMs).runId;
      } else {
        if (op === 'resume' || (op === 'harvest') !== TREES.includes(place as never)) return { ok: false, felt: null };
        const sources = sourcesFor(op, place);
        if (!sources.length) return { ok: false, felt: null };
        const previous = carryBatch(sources, s.id, nowWorldMs, actorId);
        if (!previous) return { ok: false, felt: null };
        try { runId = intent({ intentId: `start:${actorId}:${nowWorldMs}`, kind: 'start', operation: op, lotIds: sources.map(l => l.lotId), siteId: s.id, presence: 'here', ...base }, nowWorldMs, facts(s, op === 'weave' ? { requestedAreaCm2: SAIL_AREA_CM2 } : {})).runId; }
        catch (e) {   // (it put its hands to it, and it would not go: what it felt, from the science side's own words)
          log(nowWorldMs, actorId, `start-${op}`, e); putBatchBack(previous);   // (back where it was)
          return { ok: false, felt: sailFailureObservations(e, { kind: 'host-confirmed-on-site-attempt' })[0]?.text.replace(/。$/, '') ?? null };
        }
      }
      st().engaged[actorId] = { runId, from: nowWorldMs, at: { x: at.x, z: at.z } };
      return { ok: true };
    } catch (e) { log(nowWorldMs, actorId, 'work', e); return { ok: false, felt: null }; }
  }

  function confirm(actorId: string, at: { x: number; z: number }, nowWorldMs: number) {
    const e = st().engaged[actorId]; if (!e || nowWorldMs <= e.from) return;
    const d = dataOf(L().runs[e.runId] ?? {}); if (!d) return;
    const span: SailManualSpan = { kind: 'executor-activity-span', spanId: `${actorId}:${e.from}`, worldId: L().world.worldId, worldEpoch: L().world.worldEpoch, runId: e.runId, actorId,
      fromWorldMs: e.from, toWorldMs: nowWorldMs, confirmedAtWorldMs: nowWorldMs, activity: ACTIVITY[d.spec.operation as Hand], targetLotId: d.spec.lotIds[0], targetSiteId: d.spec.facts.worksite.locationId, arrived: true,
      fromPosition: { ...e.at }, toPosition: { x: at.x, z: at.z } };
    if (live(L().runs[e.runId].status)) { try { recordSailSpan(L(), e.runId, span, sailWorkRevision(L()), nowWorldMs); } catch (err) { log(nowWorldMs, actorId, 'work-span', err); } }
    e.from = nowWorldMs; e.at = { x: at.x, z: at.z };
  }

  function working(actorId: string, at: { x: number; z: number }, nowWorldMs: number): { done: false } | { done: true; words: string[] } {
    const e = st().engaged[actorId]; if (!e) return { done: false };
    if (nowWorldMs - e.from >= WORK_EVERY_MS) confirm(actorId, at, nowWorldMs);
    const run = L().runs[e.runId];
    if (!run || !live(run.status)) {
      delete st().engaged[actorId];
      const words = (() => { try { return readSailWorkerObservations(L(), e.runId, actorId).map((o) => o.text); } catch (err) { log(nowWorldMs, actorId, 'observe', err); return []; } })();
      return { done: true, words };
    }
    return { done: false };
  }

  function stopWork(actorId: string, at: { x: number; z: number }, nowWorldMs: number) {
    const e = st().engaged[actorId]; if (!e) return;
    confirm(actorId, at, nowWorldMs);
    delete st().engaged[actorId];
    if (!live(L().runs[e.runId]?.status ?? '') || !dataOf(L().runs[e.runId]).engaged) return;
    try { intent({ intentId: `stop:${actorId}:${nowWorldMs}`, kind: 'stop', actorId, atWorldMs: nowWorldMs, runId: e.runId }, nowWorldMs); } catch (err) { log(nowWorldMs, actorId, 'stop', err); }
  }

  function clearAway(actorId: string, place: string, nowWorldMs: number): string | null {
    const s = site(place), w = s && runAt(s.id); if (!s || !w || dataOf(w).engaged || place === 'dry') return null;
    try {
      if (dataOf(w).actorId !== actorId) {   // (another's half-done work: it takes it on, puts it down, and clears it away)
        intent({ intentId: `takeover:${actorId}:${nowWorldMs}`, kind: 'takeover', actorId, atWorldMs: nowWorldMs, runId: w.runId, presence: 'here' }, nowWorldMs);
        intent({ intentId: `stop:${actorId}:${nowWorldMs}`, kind: 'stop', actorId, atWorldMs: nowWorldMs, runId: w.runId }, nowWorldMs);
      }
      intent({ intentId: `abandon:${actorId}:${nowWorldMs}`, kind: 'abandon', actorId, atWorldMs: nowWorldMs, runId: w.runId }, nowWorldMs);
      return readSailWorksite(L(), s.id, nowWorldMs).observations[0]?.text.replace(/。$/, '') ?? null;
    } catch (e) { log(nowWorldMs, actorId, 'clear', e); return null; }
  }

  function look(actorId: string, at: { x: number; z: number }, nowWorldMs: number): string | null {
    const s = sites();
    for (const p of [s.dry, s.work, ...s.trees]) {
      if (Math.hypot(at.x - p.x, at.z - p.z) > Math.max(p.reachM, 2.5)) continue;   // (presence 'here' only)
      let text: string | undefined;
      try { text = readSailWorksite(L(), p.id, nowWorldMs).observations[0]?.text; } catch (e) { log(nowWorldMs, actorId, 'look', e); continue; }
      const key = `${p.id}|${text ?? ''}`;
      if (!text || st().looked[actorId] === key) continue;
      st().looked[actorId] = key; return text.replace(/。$/, '');
    }
    return null;
  }

  function tick(nowWorldMs: number) {
    if (!st().sites) return;   // (nothing to dry before there is anywhere to dry it)
    const d = dryRun(); if (d && nowWorldMs - (st().dry[d.runId] ?? -Infinity) >= DRY_EVERY_MS) confirmDry(nowWorldMs);
    if (st().dried.some((id) => !L().lots[id])) st().dried = st().dried.filter((id) => !!L().lots[id]);
  }

  function restore(nowWorldMs: number) {
    st().engaged = {};   // (no hands are at the sail across a load: its time off is not work; the roof's time goes on in one span)
    st().looked ??= {}; st().dried ??= []; st().dry ??= {};
    if (!L().sailArrangement) return;
    try { Object.assign(ctx.lab, restoreSailWork(L(), nowWorldMs)); } catch (e) { log(nowWorldMs, '', 'restore-sail', e); }
  }

  return { options, putToDry, takeIn, beginWork, working, stopWork, clearAway, isWorking: (a) => !!st().engaged[a], look, tick, restore, sites, site };
}
