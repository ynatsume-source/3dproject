import { createCoirCordModel } from '../src/science/prototypes/coir-cord';
import { createCordDamageModel, currentCordStrength } from '../src/science/prototypes/coir-cord-damage';
import { COIR_CORD_ASSUMPTION_ID as ID } from '../src/science/prototypes/coir-cord-types';
let rs = 7n; const r = (n: number) => { rs = (rs * 6364136223846793005n + 1442695040888963407n) % (1n << 64n); return Number((rs >> 11n) % BigInt(Math.max(1, Math.floor(n)))); };
const bad: string[] = []; const B = (s: string) => { if (bad.length < 2000) bad.push(s); };
const cnt: Record<string, number> = {};
const tot = (m: any) => m.fiberDryMg + m.pithDryMg + m.waterMg;
const add = (a: any, b: any) => ({ fiberDryMg: a.fiberDryMg + b.fiberDryMg, pithDryMg: a.pithDryMg + b.pithDryMg, waterMg: a.waterMg + b.waterMg });
const Z = { fiberDryMg: 0, pithDryMg: 0, waterMg: 0 };
const eq = (a: any, b: any) => a.fiberDryMg === b.fiberDryMg && a.pithDryMg === b.pithDryMg && a.waterMg === b.waterMg;
const ctx = (op: string, seed = r(2 ** 32)) => ({ worldId: 'w', worldEpoch: 'e', runId: 'run' + r(1e9), seed, clock: op === 'dry' ? 'island' : 'world', openedAtMs: 0 } as any);
const iv = (c: any, id: string, from: number, to: number, op: string) => op === 'dry'
  ? { confirmationId: id, worldId: 'w', worldEpoch: 'e', runId: c.runId, clock: 'island', fromMs: from, toMs: to, confirmedAtMs: to, kind: 'host-confirmed-roofed-wait' }
  : { confirmationId: id, worldId: 'w', worldEpoch: 'e', runId: c.runId, clock: 'world', fromMs: from, toMs: to, confirmedAtMs: to, kind: 'host-confirmed-manual-work', actorId: 'a', attendance: 'present' };
function runAll(m: any, c: any, op: string, input: any, D: number, check: (p: any, t: number) => void) {
  const ts = new Set<number>([0, 1, D, D + 1, D + 7]);
  for (let i = 0; i < 40; i++) ts.add(r(D + 10));
  let prev: any = null;
  for (const t of [...ts].sort((a, b) => a - b)) {
    const s = t ? m.commit(m.start(), iv(c, 'x', 0, t, op)) : m.start(); const p = m.project(s); check(p, t);
    if (prev) { if (p.lengthMm < prev.lengthMm) B(`${op} len nonmono`); if (tot(p.product) < tot(prev.product) && op !== 'dry' && op !== 'sieve') B(`${op} product shrinks`); }
    const o = m.observe(s); if (Object.keys(o).join() !== 'text' || /\d/.test(o.text)) B(`${op} observe leak ${JSON.stringify(o)}`);
    prev = p;
  }
  // partition with gaps, JSON, replay vs lump
  const end = D + r(5); let s = m.start(), at = 0, done = 0, n = 0;
  while (done < end) { at += r(3) ? 0 : 1 + r(1e5); const len = Math.min(end - done, 1 + r(Math.max(1, end / 3))); const rc = iv(c, 'i' + n++, at, at + len, op);
    s = m.commit(m.restore(JSON.parse(JSON.stringify(s))), rc); if (!r(4)) s = m.commit(s, rc); at += len; done += len; }
  const lump = m.project(m.commit(m.start(), iv(c, 'L', 0, end, op)));
  if (JSON.stringify(m.project(s)) !== JSON.stringify({ ...lump, totalTimeMs: lump.totalTimeMs })) B(`${op} split mismatch`);
}
function bundle(maxPithPpm = 200000, wet = false) {
  const f = 1 + (r(3) ? r(200000) : r(50)); const p = r(Math.floor(f * maxPithPpm / 1e6) + 1); const D = f + p;
  const w = wet ? r(3 * D) : r(Math.floor(D / 10) + 1);
  return { lotId: 'b' + r(1e9), fiberDryMg: f, pithDryMg: p, waterMg: w };
}
// DRY
for (let k = 0; k < 400; k++) { const b = bundle(1e6, true), c = ctx('dry'); const m = createCoirCordModel({ operation: 'dry', bundle: b, roofed: true } as any, ID, c); cnt.dry = (cnt.dry || 0) + 1;
  runAll(m, c, 'dry', b, 3 * 86400000, (p) => { if (tot(p.product) + p.releasedWaterMg !== tot(b) || p.product.fiberDryMg !== b.fiberDryMg || p.product.pithDryMg !== b.pithDryMg) B('dry balance');
    if (p.status === 'completed' && p.product.waterMg * 10 > p.product.fiberDryMg + p.product.pithDryMg) B('dry end too wet'); if (p.product.waterMg > b.waterMg) B('dry adds water'); }); }
// SIEVE
for (let k = 0; k < 400; k++) { const b = bundle(1e6 * 3, r(2) === 0), c = ctx('sieve'); const m = createCoirCordModel({ operation: 'sieve', bundle: b } as any, ID, c); cnt.sieve = (cnt.sieve || 0) + 1;
  const D = Math.ceil(b.fiberDryMg * 60000 / 72000);
  runAll(m, c, 'sieve', b, D, (p) => { if (!eq(add(p.product, p.fallenPith), b)) B('sieve balance');
    if (p.fallenPith.fiberDryMg) B('sieve loses fiber');
    if (p.status === 'completed' && p.product.pithDryMg > Math.max(Math.floor(b.fiberDryMg / 10), 0) && b.pithDryMg > Math.floor(b.fiberDryMg / 10)) B('sieve end pith');
    if (BigInt(p.product.waterMg) * BigInt(b.fiberDryMg + b.pithDryMg) > BigInt(b.waterMg) * BigInt(p.product.fiberDryMg + p.product.pithDryMg) + BigInt(b.fiberDryMg + b.pithDryMg)) B('sieve wetter'); }); }
// TWIST + reuse remainder + PLY + DAMAGE chain
for (let k = 0; k < 600; k++) {
  const b = bundle(); const D = b.fiberDryMg + b.pithDryMg; const maxL = Math.floor(D / 5); if (maxL < 1) continue;
  const L = 1 + r(maxL); const c = ctx('twist'); let m: any;
  try { m = createCoirCordModel({ operation: 'twist', bundle: b, requestedLengthMm: L } as any, ID, c); } catch (e) { B('twist reject valid ' + e); continue; }
  cnt.twist = (cnt.twist || 0) + 1;
  runAll(m, c, 'twist', b, L * 120, (p) => { const rem = p.remaining.reduce(add, Z); if (!eq(add(p.product, rem), b)) B('twist balance');
    if (p.product.fiberDryMg + p.product.pithDryMg !== p.lengthMm * 5) B('twist dry per mm');
    for (const x of p.remaining) if (BigInt(x.waterMg) * BigInt(D) > BigInt(b.waterMg) * BigInt(x.fiberDryMg + x.pithDryMg)) B('twist remainder wetter'); });
  const done = m.project(m.commit(m.start(), iv(c, 'z', 0, L * 120, 'twist')));
  const piece = done.piece; if (!piece || piece.lengthMm !== L) { B('twist piece'); continue; }
  const s0 = currentCordStrength(piece); if (s0 < 28000 * 0.85 - 1 || s0 > 40000 * 1.15) B('twist strength range ' + s0);
  // same seed same strength, different runId same seed -> ?
  const c2 = { ...c, runId: c.runId + 'b' }; const p2 = createCoirCordModel({ operation: 'twist', bundle: b, requestedLengthMm: L } as any, ID, c2);
  const piece2 = p2.project(p2.commit(p2.start(), iv(c2, 'z', 0, L * 120, 'twist'))).piece; if (piece2.baseStrengthGf === piece.baseStrengthGf) cnt.sameSeedDiffRunSame = (cnt.sameSeedDiffRunSame || 0) + 1;
  // damage
  const dc = { worldId: 'w', worldEpoch: 'e', runId: 'd' + k, openedAtIslandMs: 0, openedAtWorldMs: 0 };
  const dm = createCordDamageModel(piece, ID, dc); let ds = dm.start(), isl = 0, wt = 0, last = s0, broke = false;
  for (let j = 0; j < 12 && !broke; j++) {
    const kind = r(3); let e: any;
    if (kind === 0) { const a = isl + r(1e9), b2 = a + 1 + r(200 * 86400000); e = { eventId: 'e' + j, worldId: 'w', worldEpoch: 'e', runId: dc.runId, atMs: b2, kind: 'exposure', clock: 'island', fromIslandMs: a, toIslandMs: b2, shade: !!r(2) }; isl = b2; }
    else if (kind === 1) { wt += r(1000); e = { eventId: 'e' + j, worldId: 'w', worldEpoch: 'e', runId: dc.runId, atMs: wt, kind: 'abrasion', clock: 'world', count: r(20) }; }
    else { wt += r(1000); e = { eventId: 'e' + j, worldId: 'w', worldEpoch: 'e', runId: dc.runId, atMs: wt, kind: 'load', clock: 'world', gf: r(45000) }; }
    try { ds = dm.commit(dm.restore(JSON.parse(JSON.stringify(ds))), e); } catch (err) { if (String(err).includes('unsplittable')) { cnt.unsplit = (cnt.unsplit || 0) + 1; break; } B('damage ' + err); break; }
    ds = dm.commit(ds, e); const pr = dm.project(ds);
    if (pr.status === 'broken') { broke = true; const [a, b3] = pr.pieces; if (a.lengthMm + b3.lengthMm !== piece.lengthMm || !eq(add(a, b3), piece) || currentCordStrength(a) !== currentCordStrength(b3) || a.lengthMm < 1 || b3.lengthMm < 1) B('break conserve');
      if (!(e.gf > last)) B('broke at/below strength'); cnt.broke = (cnt.broke || 0) + 1; }
    else { if (pr.strengthGf > last) B('strength rose'); if (e.kind === 'load' && e.gf > pr.strengthGf) B('should have broken'); last = pr.strengthGf; }
    const ob = dm.observe(ds); if (ob.some((x: string) => /\d/.test(x))) B('damage observe digits');
  }
}
// PLY
for (let k = 0; k < 400; k++) {
  const base = 3 + r(r(2) ? 5000 : 40); const tol = Math.max(1, Math.floor(base / 10));
  const strands = [0, 1, 2].map((i) => { const L = base + (i ? r(tol + 1) : 0); const f = L * 5 - r(L); const p = L * 5 - f; return { lotId: 's' + i + k, material: 'coir_strand', lengthMm: L, fiberDryMg: f, pithDryMg: p, waterMg: r(L), baseStrengthGf: 20000 + r(30000), damage: { sunMs: r(2) ? 0 : r(4e10), shadeMs: 0, abrasions: r(3) } }; });
  const c = ctx('ply'); let m: any; try { m = createCoirCordModel({ operation: 'ply', strands } as any, ID, c); } catch (e) { B('ply reject ' + e); continue; } cnt.ply = (cnt.ply || 0) + 1;
  const fin = Math.floor(base * 9 / 10); const all = strands.reduce(add, Z);
  runAll(m, c, 'ply', strands, fin * 60, (p) => { const rem = p.remaining.reduce(add, Z); if (!eq(add(p.product, rem), all)) B('ply balance');
    if (p.leftovers) { const lsum = p.leftovers.reduce(add, Z); if (!eq(lsum, rem)) { if (!(p.leftovers.length < 3 && rem.fiberDryMg + rem.pithDryMg + rem.waterMg - tot(lsum) >= 0)) B('ply leftover mass'); else if (tot(lsum) !== tot(rem)) cnt.zeroLenLeftoverMass = (cnt.zeroLenLeftoverMass || 0) + 1; } } });
  const done = m.project(m.commit(m.start(), iv(c, 'z', 0, fin * 60, 'ply')));
  const want = Math.floor(Math.min(...strands.map((s: any) => currentCordStrength(s))) * 255 / 100);
  if (done.piece.baseStrengthGf !== want || done.piece.lengthMm !== fin) B('ply strength/len');
  if (done.piece.baseStrengthGf > strands.reduce((a: number, s: any) => a + currentCordStrength(s), 0)) B('rope > sum');
  for (const lo of done.leftovers) { if (lo.lengthMm !== strands.find((s: any) => lo.lotId.endsWith(String(strands.indexOf(s))))!.lengthMm - base) {}
    try { currentCordStrength(lo); } catch (e) { B('leftover invalid ' + e + JSON.stringify(lo)); } }
  try { currentCordStrength(done.piece); } catch (e) { B('rope invalid ' + e); }
}
console.log(JSON.stringify({ cnt, bad: bad.length, first: [...new Set(bad.map((x) => x.slice(0, 160)))].slice(0, 12) }));
