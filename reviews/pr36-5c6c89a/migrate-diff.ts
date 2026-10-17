import assert from 'node:assert/strict';
import { addLot, emptyLedger } from '../src/world/process-runner';
import * as NEW from '../src/world/coir-cord-load';
import { readCordPiece, writeCordPiece } from '../src/world/coir-cord-lots';
import { COIR_CORD_ASSUMPTION_ID as ID } from '../src/science/prototypes/coir-cord-types';
import { currentIntegerCordStrength } from '../src/science/prototypes/coir-cord-damage';
import * as OLD from '/tmp/claude-0/-home-user-3dproject/4db7e567-5529-5795-9b08-c7b02441b831/scratchpad/pr36-5c6c89a/old/src/world/coir-cord-load';
let s = 7; const r = (n: number) => { s = (s * 1103515245 + 12345) >>> 0; return Math.floor((s / 4294967296) * n); };
const lotsView = (L: any) => JSON.stringify(Object.keys(L.lots).sort().map((k) => [k, L.lots[k].materialId, L.lots[k].amount, L.lots[k].quality, L.lots[k].location, L.lots[k].reservedBy ?? null]));
let scen = 0, evOld = 0, evNew = 0, breaks = 0, replays = 0;
for (let sc = 0; sc < 150; sc++) {
  const L: any = emptyLedger('w:m' + sc, 'e:m'); const K = 1 + r(4);
  for (let i = 0; i < K; i++) { const p = { lotId: 'c' + i, material: 'coir_rope', lengthMm: 800 + r(3000), fiberDryMg: 8000 + r(20000), pithDryMg: r(3000), waterMg: r(3000), baseStrengthGf: 20000 + r(60000), damage: { sunMs: r(1e9), shadeMs: r(1e9), abrasions: r(5) } } as any;
    const o = writeCordPiece(p, r(2) ? 'shelf' : 'site:raft', 1); addLot(L, { lotId: p.lotId, materialId: o.materialId, amount: o.amount, quality: o.quality, location: o.into! }); }
  const clock: Record<string, number> = {}; let w = 1_000_000, cmd = 0; const sent: any[] = [];
  const next = (L: any) => { const ids = Object.keys(L.lots).filter((k) => L.lots[k].materialId === 'coir_rope' || L.lots[k].materialId === 'coir_strand'); if (!ids.length) return null;
    const id = ids[r(ids.length)]; w += 1000 + r(3_600_000); const isl = 10_000_000 + w * 13; const k = r(3); cmd++;
    let ev: any; if (k === 0) { const from = clock[id] ?? isl - 1 - r(1e8); ev = { kind: 'exposure', fromIslandMs: Math.max(0, from), toIslandMs: isl, shade: !!r(2) }; }
    else if (k === 1) { const S = currentIntegerCordStrength(readCordPiece(L.lots[id])); ev = { kind: 'load', gf: Math.max(1, S - 2000 + r(3000)) }; } else ev = { kind: 'abrasion', count: 1 + r(2) };
    return { q: { commandId: 'k' + cmd, assumptionId: ID, lotId: id, worldAtMs: w, islandAtMs: isl, event: ev }, id };
  };
  const apply = (mod: any, L: any, q: any) => { try { const x = mod.applyCordLoad(L, q); return { ok: true, lotIds: x.lotIds, obs: x.observations }; } catch (e: any) { return { ok: false, code: e.code }; } };
  const n1 = 2 + r(12);
  for (let i = 0; i < n1; i++) { const e = next(L); if (!e) break; const res = apply(OLD, L, e.q); evOld++; if (res.ok) { sent.push({ q: e.q, res }); if (e.q.event.kind === 'exposure') clock[e.id] = e.q.islandAtMs; if (res.lotIds.length > 1) { breaks++; for (const c of res.lotIds) clock[c] = e.q.islandAtMs; } } }
  if (!L.coirCordLoads) continue; assert.equal(L.coirCordLoads.schema, 'civ-world.coir-cord-load-ledger/3');
  const saved = JSON.stringify(L); const A: any = JSON.parse(saved), B: any = JSON.parse(saved); const cA = { ...clock }, sBefore = s;
  // a replay of the last /3 command on the new code: the same answer
  const last = sent.at(-1); if (last) { const x = apply(NEW, B, last.q); assert.deepEqual({ ok: x.ok, lotIds: x.lotIds, obs: x.obs }, { ok: true, lotIds: last.res.lotIds, obs: last.res.obs }, 'replay sc' + sc); replays++; }
  assert.equal(lotsView(B), lotsView(A), 'migration keeps lots sc' + sc); assert.equal(B.seq, A.seq, 'seq sc' + sc);
  const n2 = 1 + r(15);
  for (let i = 0; i < n2; i++) { const e = next(A); if (!e) break; const ra = apply(OLD, A, e.q), rb = apply(NEW, B, e.q); evNew++;
    assert.deepEqual(rb, ra, `event sc${sc} i${i} ${JSON.stringify(e.q.event)}`);
    if (ra.ok && e.q.event.kind === 'exposure') clock[e.id] = e.q.islandAtMs; if (ra.ok && ra.lotIds.length > 1) { breaks++; for (const c of ra.lotIds) clock[c] = e.q.islandAtMs; }
    assert.equal(lotsView(B), lotsView(A), 'lots after sc' + sc + ' i' + i); assert.equal(B.seq, A.seq, 'seq after sc' + sc); }
  assert.ok(!Object.values(B.runs).some((x: any) => x.processId === 'prototype_coir_cord_load'), 'no load runs kept sc' + sc);
  assert.ok(JSON.stringify(B).length <= JSON.stringify(A).length, 'not larger sc' + sc);
  scen++;
}
console.log(`PASS scenarios ${scen} oldEvents ${evOld} comparedEvents ${evNew} breaks ${breaks} replays ${replays}`);
