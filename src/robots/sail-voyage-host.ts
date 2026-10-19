// The raft under sail (the science side's sail-voyage, wired to the island: 2026-10-19, main ↔ science, spec v2 §3–§5
// and §9). What a resident chooses and where it goes are the world's (residents.ts); how the raft moves under its sail
// or its paddle, and what the wind does to the mat, the mast and the cords, are the science side's. This file is the
// only place that calls them, and it passes them nothing but:
//  - the rigging: half an hour of a resident's hands at the raft (counted here, as hand work: 30 s spans, never while
//    the hours are caught up on), the mat, the mast and the cords then laid by the raft;
//  - at the moment it sets off, the cords' sun sent up to then (cord-host), the rig assembled from those lots, the hull
//    from the raft's pieces, and the voyage begun with the resident aboard (presence 'here');
//  - a cell every 30 s of the world's clock, with both clocks' times, the raw record's wind, gust and rain through the
//    science side's own conversion (sailCellWeather: a gap, or a gust below the mean, is no weather — it paddles), the
//    heading to where it is going, and whether the sail is up (down in a gale: mean 10 m/s or a gust of 14);
//  - home again (or turned back): the voyage settled. The rig is taken apart with its lots' ids kept, so the cords' sun
//    on the beach goes on being counted by cord-host — from the settling, not again (the voyage counted it).
// It takes back only the words a resident could see or feel. The distance, the speed, the loads, a part's strength
// stay out of a resident's mind; refusal codes go to the developer's log.
import type { Ledger } from '../world/process-runner';
import type { LotView } from '../world/science-contract';
import { assembleParts, disassembleParts, moveLot, toClock } from '../world/process-runner';
import type { Option } from './agent/types';
import type { IslandWeather } from '../world/island-time';
import type { CordHost } from './cord-host';
import type { SailHostState, SailDevEntry } from './sail-host';
import { SAIL_RULES } from '../science/prototypes/sail-raft-rules';
import { sailCellWeather } from '../science/prototypes/sail-raft-inputs';
import { readSailMat, readBambooMast, raftHullFromPieces } from '../world/sail-lots';
import { readCordPiece } from '../world/coir-cord-lots';
import { sailRigParts } from '../world/sail-rig-parts';
import { beginSailVoyage, recordSailCell, readSailVoyage, settleSailVoyage, restoreSailVoyage, SAIL_VOYAGE, type SailVoyageLedger } from '../world/sail-voyage';
import { draw } from '../science/rng';

/** The world's own record of the rig and a voyage under way (saved with the village, in SailHostState). */
export interface SailRigState { lotIds: string[]; workMs: number; done: boolean }
export interface SailVoyageState {
  runId: string; rigId: string; actorId: string;
  target: { e: number; n: number };   // mm east and north of where it set off: the island it is going to
  phase: 'out' | 'back'; turned: string | null;   // (why it turned back, in words: or null)
  next: { w: number; i: number }; n: number;   // (the next cell: its world and island times, its number)
}

const SEED = 0x7361696d;
const RAFT = 'site:raft', CELL_MS = SAIL_VOYAGE.cellWorldMs, NEAR_MM = 50_000;   // (within 50 m: there)
const GALE_MEAN_MS = 10, GALE_GUST_MS = 14;   // (spec v2 §9.3: the sail comes down)
const PADDLE_MM_S = 556;   // (spec v2 §9.2: the paddle, for judging whether it can be back in the light — never faster than that)
const codeOf = (e: unknown) => (e as { code?: string })?.code ?? (e instanceof Error ? e.message : String(e));
const CORDS = ['coir_rope', 'coir_strand'];

export interface SailVoyageHost {
  options(actorId: string, nowWorldMs: number): Option[];
  beginRig(actorId: string, at: { x: number; z: number }, nowWorldMs: number): boolean;
  rigging(actorId: string, nowWorldMs: number): { done: false } | { done: true; words: string[] };
  stopRig(actorId: string, nowWorldMs: number): void;
  isRigging(actorId: string): boolean;
  /** Lots the rig holds (not for another use). */
  inUse(): string[];
  rigged(): boolean;
  /** Setting off under sail to an island (km, compass bearing from home): false if it cannot (it paddles, as before). */
  depart(actorId: string, isle: { km: number; bearing: number }, nowWorldMs: number): boolean;
  /** The voyage's cells up to now: home (and why it turned back, if it did), or still at sea. */
  sail(nowWorldMs: number, storm: boolean): { home: false } | { home: true; turned: string | null; reached: boolean; words: string[] };
  /** Words seen aboard since last asked (the science side's own). */
  words(): string[];
  voyaging(): boolean;
  restore(nowWorldMs: number): { actorId: string; words: string[] } | null;
}

export function makeSailVoyageHost(ctx: {
  lab: Ledger;
  state: () => SailHostState & { rig?: SailRigState | null; voyage?: SailVoyageState | null };
  cord: CordHost;
  raftPieces: () => number;
  raftWhole: () => boolean;
  weather: (realMs: number) => IslandWeather | null;
  hourNow: (realMs: number) => number;            // (the hour of the island's day: the same as the real one)
  islandWait: (islandMs: number) => number;      // (real ms for so long on the island's clock)
  dev: SailDevEntry[];
}): SailVoyageHost {
  const L = () => ctx.lab as SailVoyageLedger;
  const st = () => ctx.state();
  const log = (at: number, actorId: string, action: string, e: unknown) => { ctx.dev.push({ at, actorId, action, code: codeOf(e) }); if (ctx.dev.length > 200) ctx.dev.shift(); };
  const island = (ms: number) => Math.round(toClock('island', ms));
  const lots = () => Object.values(L().lots) as (LotView & { reservedBy?: string })[];
  const byId = (a: { lotId: string }, b: { lotId: string }) => a.lotId.localeCompare(b.lotId, 'en', { numeric: true });
  const ok = <T>(f: () => T) => { try { return f(); } catch { return null; } };
  let engaged: Record<string, { from: number }> = {};
  let seen: string[] = [];

  // (what a rig could be made of now: a whole mat, a whole mast, and the longest free cords until there is enough)
  function partsFree(): string[] | null {
    const free = (m: string) => lots().filter((l) => l.materialId === m && !l.reservedBy).sort(byId);
    const mat = free('sail_mat').find((l) => ok(() => !readSailMat(l).torn)), mast = free('bamboo_mast').find((l) => ok(() => !readBambooMast(l).broken));
    if (!mat || !mast) return null;
    const busy = new Set(ctx.cord.busy()), cords: string[] = []; let mm = 0;
    const cs = lots().filter((l) => CORDS.includes(l.materialId) && !l.reservedBy && !busy.has(l.lotId))
      .map((l) => ({ l, p: ok(() => readCordPiece(l)) })).filter((x) => x.p).sort((a, b) => b.p!.lengthMm - a.p!.lengthMm || byId(a.l, b.l));
    for (const c of cs) { if (mm >= SAIL_RULES.minRigCordMm) break; cords.push(c.l.lotId); mm += c.p!.lengthMm; }
    return mm >= SAIL_RULES.minRigCordMm ? [mat.lotId, mast.lotId, ...cords] : null;
  }
  const rig = () => st().rig ?? null;
  // (the rig as it was laid: every lot still there by the raft, none in use)
  const rigIntact = () => { const g = rig(); return !!g && g.lotIds.every((id) => { const l = L().lots[id]; return !!l && !l.reservedBy && l.location === RAFT; }); };

  function options(actorId: string, nowWorldMs: number): Option[] {
    if (!ctx.raftWhole() || st().voyage) return [];
    const o: Option[] = [], g = rig();
    if (g && !rigIntact()) st().rig = null;   // (a part went elsewhere: the rigging is undone)
    if (!rig()?.done && (rig() || partsFree())) o.push({ id: 'sail:rig', action: 'sail-rig', label: rig() ? '筏に帆とマストを取りつける作業を続ける' : '筏に帆とマストを取りつける', targetId: 'raft' });
    return o.map((x) => [x, draw(SEED, actorId, String(nowWorldMs), 'options', x.id)] as const).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  }

  function beginRig(actorId: string, _at: { x: number; z: number }, nowWorldMs: number): boolean {
    if (!ctx.raftWhole() || st().voyage) return false;
    if (rig() && !rigIntact()) st().rig = null;
    if (!rig()) {
      const ids = partsFree(); if (!ids) return false;
      ctx.cord.sunUpTo(ids, nowWorldMs);   // (a cord's sun up to the moment it is carried: cord-host)
      for (const id of ids) { const m = moveLot(L(), id, RAFT); if (!m.lot) { log(nowWorldMs, actorId, 'rig-carry', m.why); return false; } }
      st().rig = { lotIds: ids, workMs: 0, done: false };
    }
    if (rig()!.done) return false;
    engaged[actorId] = { from: nowWorldMs };
    return true;
  }
  function confirmRig(actorId: string, nowWorldMs: number) {
    const e = engaged[actorId], g = rig(); if (!e || !g) return;
    const n = Math.floor((nowWorldMs - e.from) / 30_000); if (n <= 0) return;   // (in whole 30 s spans of its hands at it)
    g.workMs += n * 30_000; e.from += n * 30_000;
    if (g.workMs >= SAIL_RULES.rigMs) g.done = true;
  }
  function rigging(actorId: string, nowWorldMs: number): { done: false } | { done: true; words: string[] } {
    if (!engaged[actorId]) return { done: false };
    if (!rigIntact()) { delete engaged[actorId]; st().rig = null; return { done: true, words: [] }; }
    confirmRig(actorId, nowWorldMs);
    if (rig()?.done) { delete engaged[actorId]; return { done: true, words: ['筏に帆とマストを取りつけた'] }; }
    return { done: false };
  }
  function stopRig(actorId: string, nowWorldMs: number) { confirmRig(actorId, nowWorldMs); delete engaged[actorId]; }

  function depart(actorId: string, isle: { km: number; bearing: number }, nowWorldMs: number): boolean {
    if (st().voyage || !rig()?.done || !rigIntact()) return false;
    const ids = rig()!.lotIds, b = isle.bearing * Math.PI / 180, mm = Math.round(isle.km * 1e6);
    ctx.cord.sunUpTo(ids, nowWorldMs);   // (rule 1: the cords' sun sent through to the moment it sets off)
    const parts = ids.map((id) => L().lots[id]);
    const T = sailRigParts(parts.length - 2, parts.slice(2).map((l) => l.materialId as 'coir_rope' | 'coir_strand'));
    const made = assembleParts(L(), ids, T, nowWorldMs);
    if (!made.equipment) { log(nowWorldMs, actorId, 'rig-assemble', made.why); return false; }
    const rigId = made.equipment.equipmentId;
    try {
      const { runId } = beginSailVoyage(L(), { commandId: `voyage:${actorId}:${nowWorldMs}`, rigEquipmentId: rigId, hull: raftHullFromPieces('raft:hull', ctx.raftPieces()), actorId, presence: 'here', atWorldMs: nowWorldMs, atIslandMs: island(nowWorldMs) });
      st().voyage = { runId, rigId, actorId, target: { e: Math.round(mm * Math.sin(b)), n: Math.round(mm * Math.cos(b)) }, phase: 'out', turned: null, next: { w: nowWorldMs, i: island(nowWorldMs) }, n: 0 };
      seen = [];
      return true;
    } catch (e) {
      log(nowWorldMs, actorId, 'voyage-begin', e);
      const back = disassembleParts(L(), rigId, T, undefined, { keepLotIds: true }); if (!back.lots) log(nowWorldMs, actorId, 'rig-undo', back.why);
      return false;
    }
  }

  // (the raw record's values, as measured: a gap stays a gap — islandWeather fills them for the look of things)
  function cellWeather(at: number) {
    const w = ctx.weather(at);
    return ok(() => sailCellWeather({ windMeasuredMs: w?.windMeasured ?? null, windFromDeg: w?.windDirMeasured ?? null, gustMs: w?.gustMeasured ?? null, rainMeasuredMm: w?.rainMeasured ?? null }));
  }
  function cell(v: SailVoyageState, nowWorldMs: number, storm: boolean): boolean {
    const from = v.next.w, to = from + CELL_MS, fi = v.next.i, ti = Math.max(fi + 1, island(to));
    const pos = ok(() => readSailVoyage(L(), v.runId)); if (!pos) return false;
    const goal = v.phase === 'out' ? v.target : { e: 0, n: 0 }, de = goal.e - pos.eastMm, dn = goal.n - pos.northMm;
    const heading = ((Math.round(Math.atan2(dn, de) * 180 / Math.PI) % 360) + 360) % 360;   // (0 east, 90 north: spec v2 §9.6)
    const wx = cellWeather(from), raw = ctx.weather(from);
    const gale = (raw?.windMeasured ?? 0) >= GALE_MEAN_MS || (raw?.gustMeasured ?? 0) >= GALE_GUST_MS || storm;
    try {
      const r = recordSailCell(L(), v.runId, { cellId: `${v.runId}:${v.n}`, fromWorldMs: from, toWorldMs: to, fromIslandMs: fi, toIslandMs: ti,
        windMmS: wx?.windMmS ?? null, windToDeg: wx?.windToDeg ?? null, gustMmS: wx?.gustMmS ?? null, headingDeg: heading, rain: wx?.rain ?? null, sailUp: !gale }, nowWorldMs);
      for (const w of r.observations) if (!seen.includes(w)) seen.push(w);
    } catch (e) { log(nowWorldMs, v.actorId, 'voyage-cell', e); return false; }
    v.next = { w: to, i: ti }; v.n++;
    return true;
  }
  const distTo = (v: SailVoyageState, goal: { e: number; n: number }) => { const p = readSailVoyage(L(), v.runId); return Math.hypot(goal.e - p.eastMm, goal.n - p.northMm); };

  function sail(nowWorldMs: number, storm: boolean): { home: false } | { home: true; turned: string | null; reached: boolean; words: string[] } {
    const v = st().voyage; if (!v) return { home: false };
    while (v.next.w + CELL_MS <= nowWorldMs) {
      if (!cell(v, nowWorldMs, storm)) break;
      if (v.phase === 'out') {
        if (distTo(v, v.target) <= NEAR_MM) v.phase = 'back';   // (there: and straight back)
        else {
          // (can it still be back in the light, at the paddle's pace? if not, it turns for home)
          const left = distTo(v, v.target) + Math.hypot(v.target.e, v.target.n), hours = ctx.islandWait(left / PADDLE_MM_S * 1000) / 3.6e6;
          const why = storm ? '台風' : ctx.hourNow(v.next.w) + hours > 18.5 ? '日のあるうちに戻れない' : null;
          if (why) { v.phase = 'back'; v.turned = why; }
        }
      } else if (distTo(v, { e: 0, n: 0 }) <= NEAR_MM) return settle(v, v.next.w, v.turned ? 'turned' : 'arrived');
    }
    return { home: false };
  }

  function settle(v: SailVoyageState, atWorldMs: number, reason: 'arrived' | 'turned' | 'interrupted'): { home: true; turned: string | null; reached: boolean; words: string[] } {
    const out = { home: true as const, turned: v.turned, reached: reason === 'arrived', words: [...seen] };
    st().voyage = null; seen = [];
    let result;
    try { result = settleSailVoyage(L(), v.runId, { commandId: `settle:${v.runId}`, actorId: v.actorId, atWorldMs, reason }); }
    catch (e) { log(atWorldMs, v.actorId, 'voyage-settle', e); st().rig = null; return out; }
    for (const w of result.observations) if (!out.words.includes(w)) out.words.push(w);
    let ids = result.lotIds;
    if (result.rigEquipmentId) {   // (whole: taken down off the raft, each part the same lot as before)
      const e = L().equipment[result.rigEquipmentId], parts = e?.assembled?.parts ?? [];
      const T = sailRigParts(parts.length - 2, parts.slice(2).map((l) => l.materialId as 'coir_rope' | 'coir_strand'));
      const back = disassembleParts(L(), result.rigEquipmentId, T, undefined, { keepLotIds: true });
      if (!back.lots) { log(atWorldMs, v.actorId, 'rig-apart', back.why); st().rig = null; return out; }
      ids = back.lots.map((l) => l.lotId);
      st().rig = { lotIds: ids, workMs: SAIL_RULES.rigMs, done: true };   // (rigged as before: it is laid out by the raft again)
    } else st().rig = null;   // (something gave: the parts are lots again, as they are)
    for (const id of ids) if (L().lots[id]) moveLot(L(), id, RAFT);
    ctx.cord.sunCountedTo(ids, atWorldMs);   // (rule 2: the voyage counted the cords' sun up to its settling)
    return out;
  }

  function restore(nowWorldMs: number): { actorId: string; words: string[] } | null {
    engaged = {}; seen = [];
    const v = st().voyage;
    if (L().sailVoyages) { try { Object.assign(ctx.lab, restoreSailVoyage(L(), nowWorldMs)); } catch (e) { log(nowWorldMs, '', 'restore-voyage', e); } }
    if (!v) return null;
    // (the app was closed at sea: no motion is made up for the time it was away — the crossing ends where it was confirmed)
    const r = settle(v, nowWorldMs, 'interrupted');
    return { actorId: v.actorId, words: r.words };
  }

  return { options, beginRig, rigging, stopRig, isRigging: (a) => !!engaged[a], inUse: () => [...(rig()?.lotIds ?? [])], rigged: () => !!rig()?.done && rigIntact(),
    depart, sail, words: () => [...seen], voyaging: () => !!st().voyage, restore };
}
