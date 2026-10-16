import { createManualHuskSeparation } from '../src/science/prototypes/manual-husk-separation';
let rnd = 12345; const r = (n: number) => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd % n; };
let cases = 0, bad: string[] = [];
for (let c = 0; c < 3000; c++) {
  const dry = 1 + r(5000), water = 1 + r(5000);
  const nk = 2 + r(5); let ok = true;
  const FD = 1 + r(dry), PD = r(dry - FD + 1), FW = r(water + 1), PW = PD > 0 ? r(water - FW + 1) : 0, DW = r(water - FW - PW + 1);
  const series = (F: number, positive: boolean) => { const v = Array.from({ length: nk - 1 }, () => (positive ? 1 : 0) + r(Math.max(1, F))).map((x) => Math.min(F, x)).sort((a, b) => a - b); v[v.length - 1] = F; return [0, ...v]; };
  const fd = series(FD, true), pd = series(PD, false), fw = series(FW, false), pw = series(PW, false), dw = series(DW, false);
  const knots: any[] = []; let w = 0;
  for (let i = 0; i < nk; i++) { if (i) w += 1 + r(60); knots.push({ workMs: w, fiberDryMg: fd[i], attachedPithDryMg: pd[i], fiberWaterMg: fw[i], attachedPithWaterMg: pd[i] > 0 ? pw[i] : 0, dischargedWaterMg: dw[i] }); }
  for (let i = 1; i < nk; i++) if (knots[i].attachedPithWaterMg < knots[i - 1].attachedPithWaterMg) ok = false;
  if (!ok) continue;
  let m: any;
  try { m = createManualHuskSeparation({ materialId: 'wet_unseparated_coconut_husk', lotId: 'l', separation: 'never-separated', dryMg: dry, waterMg: water, soakHistory: [] }, { kind: 'uncalibrated-test-profile', profileId: 'p', knots }, { worldId: 'w', worldEpoch: 'e', runId: 'r', openedAtWorldMs: 0 }); }
  catch { continue; }
  cases++;
  const H = knots.at(-1).workMs + 5; let prev: any = null;
  for (let t = 0; t <= H; t++) {
    const s = t === 0 ? m.start() : m.commit(m.start(), { kind: 'host-confirmed-manual-work', confirmationId: 'x', worldId: 'w', worldEpoch: 'e', runId: 'r', actorId: 'a', attendance: 'present', operation: 'separate-wet-husk', fromWorldMs: 0, toWorldMs: t, confirmedAtWorldMs: t });
    const p = s.pools;
    if (p.fiber.dryMg + p.attachedPith.dryMg + p.residualHusk.dryMg !== dry) bad.push(`dry c${c} t${t}`);
    if (p.fiber.waterMg + p.attachedPith.waterMg + p.residualHusk.waterMg + p.dischargedWaterMg !== water) bad.push(`water c${c} t${t}`);
    if (Object.values(p).flatMap((v: any) => typeof v === 'number' ? [v] : Object.values(v)).some((v: any) => !(Number.isSafeInteger(v) && v >= 0))) bad.push(`neg c${c} t${t}`);
    if ((p.fiber.dryMg === 0 && (p.fiber.waterMg || p.attachedPith.dryMg || p.attachedPith.waterMg)) || (p.attachedPith.dryMg === 0 && p.attachedPith.waterMg)) bad.push(`carrier c${c} t${t}`);
    if (prev && (p.fiber.dryMg < prev.fiber.dryMg || p.attachedPith.dryMg < prev.attachedPith.dryMg || p.fiber.waterMg < prev.fiber.waterMg || p.attachedPith.waterMg < prev.attachedPith.waterMg || p.dischargedWaterMg < prev.dischargedWaterMg || p.residualHusk.dryMg > prev.residualHusk.dryMg || p.residualHusk.waterMg > prev.residualHusk.waterMg)) bad.push(`monotone c${c} t${t} ${JSON.stringify(prev)} -> ${JSON.stringify(p)}`);
    prev = p;
  }
}
console.log({ cases, bad: bad.length, first: bad.slice(0, 3) });
