import { createManualHuskSeparation } from '../src/science/prototypes/manual-husk-separation';
import { createManualHuskAssumptionProfile, MANUAL_HUSK_ASSUMPTION as A } from '../src/science/prototypes/manual-husk-assumptions';
let rnd = 20261015n; const r = (n: number) => { rnd = (rnd * 6364136223846793005n + 1442695040888963407n) % (1n << 64n); return Number((rnd >> 11n) % BigInt(Math.max(1, n))); };
const MAX = Number.MAX_SAFE_INTEGER; const bad: string[] = []; let cases = 0, rejectOk = 0, evals = 0;
const ctx = { worldId: 'w', worldEpoch: 'e', runId: 'r', openedAtWorldMs: 0 };
const iv = (id: string, from: number, to: number) => ({ kind: 'host-confirmed-manual-work', confirmationId: id, worldId: 'w', worldEpoch: 'e', runId: 'r', actorId: 'a', attendance: 'present', operation: 'separate-wet-husk', fromWorldMs: from, toWorldMs: to, confirmedAtWorldMs: to }) as any;
const pick = () => { const m = r(5); return m === 0 ? 1 + r(400) : m === 1 ? 1 + r(3_000_000) : m === 2 ? 1 + r(1e12) : m === 3 ? 300_000 * (1 + r(50)) : Math.floor(MAX / 3) - r(1e6); };
for (let c = 0; c < 2500; c++) {
  const D = pick();
  const need = BigInt(D) * 295_200n / 300_000n; // approx; exact check via rejection test below
  let W = Number(need) + r(3) * r(1e6) + 1; if (W + D > MAX) W = MAX - D;
  let prof: any; try { prof = createManualHuskAssumptionProfile({ dryMg: D, waterMg: W }, A.id); } catch (e) { continue; }
  const last = prof.knots.at(-1), req = last.fiberWaterMg + last.attachedPithWaterMg + last.dischargedWaterMg;
  // insufficient water must reject
  if (req > 1) { try { createManualHuskAssumptionProfile({ dryMg: D, waterMg: req - 1 }, A.id); bad.push(`no-reject D${D}`); } catch { rejectOk++; } }
  // ratios vs standard (only meaningful for D >= 300000): end fiber ~ 0.24 D, end time ~ 0.8 D ms
  if (D >= 300_000 && (Math.abs(last.fiberDryMg - 0.24 * D) > 1 || Math.abs(last.workMs - 0.8 * D) > 1)) bad.push(`ratio D${D}`);
  const input = { materialId: 'wet_unseparated_coconut_husk', lotId: 'l', separation: 'never-separated', dryMg: D, waterMg: W, soakHistory: [] } as any;
  let m: any; try { m = createManualHuskSeparation(input, prof, ctx); } catch (e) { bad.push(`core rejects D${D}: ${e}`); continue; }
  cases++;
  const H = last.workMs; const ts = new Set<number>([0, H, H + 1, H + 5]);
  for (const k of prof.knots) for (const d of [-1, 0, 1]) if (k.workMs + d >= 0) ts.add(k.workMs + d);
  if (H <= 1500) for (let t = 0; t <= H + 2; t++) ts.add(t); else for (let i = 0; i < 60; i++) ts.add(r(H + 3));
  let prev: any = null;
  for (const t of [...ts].sort((a, b) => a - b)) {
    const p = (t === 0 ? m.start() : m.commit(m.start(), iv('x', 0, t))).pools; evals++;
    if (p.fiber.dryMg + p.attachedPith.dryMg + p.residualHusk.dryMg !== D) bad.push(`dry D${D} t${t}`);
    if (p.fiber.waterMg + p.attachedPith.waterMg + p.residualHusk.waterMg + p.dischargedWaterMg !== W) bad.push(`water D${D} t${t}`);
    const vals = [p.fiber.dryMg, p.fiber.waterMg, p.attachedPith.dryMg, p.attachedPith.waterMg, p.residualHusk.dryMg, p.residualHusk.waterMg, p.dischargedWaterMg];
    if (vals.some((v) => !(Number.isSafeInteger(v) && v >= 0))) bad.push(`int D${D} t${t}`);
    if ((p.fiber.dryMg === 0 && (p.fiber.waterMg || p.attachedPith.dryMg || p.attachedPith.waterMg)) || (p.attachedPith.dryMg === 0 && p.attachedPith.waterMg)) bad.push(`carrier D${D} t${t}`);
    if (prev && (p.fiber.dryMg < prev.fiber.dryMg || p.attachedPith.dryMg < prev.attachedPith.dryMg || p.fiber.waterMg < prev.fiber.waterMg || p.attachedPith.waterMg < prev.attachedPith.waterMg || p.dischargedWaterMg < prev.dischargedWaterMg || p.residualHusk.dryMg > prev.residualHusk.dryMg || p.residualHusk.waterMg > prev.residualHusk.waterMg)) bad.push(`monotone D${D} t${t}`);
    prev = p;
  }
  // random partition with gaps + JSON resume + replay, vs lumped
  const end = H + r(5); let s = m.start(), at = 0, total = 0, n = 0;
  while (total < end) { const gap = r(3) ? 0 : 1 + r(1000); const len = Math.min(end - total, 1 + r(Math.max(1, Math.ceil(end / 4)))); at += gap;
    const c1 = iv(`i${n++}`, at, at + len); s = m.commit(m.restore(JSON.parse(JSON.stringify(s))), c1); if (r(4) === 0) s = m.commit(s, c1); at += len; total += len; }
  const lump = m.commit(m.start(), iv('L', 0, end));
  if (JSON.stringify(s.pools) !== JSON.stringify(lump.pools) || s.totalWorkMs !== end) bad.push(`split D${D}`);
}
console.log(JSON.stringify({ cases, evals, rejectOk, bad: bad.length, first: bad.slice(0, 5) }));
