import { createManualHuskSeparation } from '../src/science/prototypes/manual-husk-separation';
let rnd = 12345; const r = (n: number) => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd % n; };
let cases = 0, bad: string[] = [];
for (let c = 0; c < 400; c++) {
  const dry = 1 + r(5000), water = 1 + r(5000);
  const nk = 2 + r(5); const knots: any[] = [{ workMs: 0, fiberDryMg: 0, attachedPithDryMg: 0, fiberWaterMg: 0, attachedPithWaterMg: 0, dischargedWaterMg: 0 }];
  let ok = true;
  for (let i = 1; i < nk; i++) {
    const p = knots[i - 1];
    const fd = Math.min(dry, p.fiberDryMg + r(dry / nk + 2)), pd = Math.min(dry - fd, p.attachedPithDryMg + r(dry / nk + 2));
    const fw = p.fiberWaterMg + r(water / (3 * nk) + 2), pw = p.attachedPithWaterMg + r(water / (3 * nk) + 2), dw = p.dischargedWaterMg + r(water / (3 * nk) + 2);
    const k = { workMs: p.workMs + 1 + r(50), fiberDryMg: fd, attachedPithDryMg: Math.max(pd, p.attachedPithDryMg), fiberWaterMg: fd > 0 ? fw : 0, attachedPithWaterMg: (pd > 0 && fd > 0) ? pw : 0, dischargedWaterMg: dw };
    if (k.fiberDryMg === 0) { k.attachedPithDryMg = 0; }
    if (k.attachedPithDryMg < p.attachedPithDryMg || k.fiberWaterMg < p.fiberWaterMg || k.attachedPithWaterMg < p.attachedPithWaterMg) ok = false;
    if (k.fiberDryMg + k.attachedPithDryMg > dry || k.fiberWaterMg + k.attachedPithWaterMg + k.dischargedWaterMg > water) ok = false;
    knots.push(k);
  }
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
