// C trial: piston bellows → air → charcoal burn rate → flame temperature (C0 form) → piece ceiling in the bed (F 0.9).
const sig = 5.67e-8, Ta = 301.15, CP = 1250, LHV = 30e6, AFR = 11, RAD = 0.3, F = 0.9, RHO = 1.16;
const tube = (boreMm: number, strokeM: number, perMin: number, tubes = 2, vol = 0.6) => tubes * Math.PI * (boreMm / 2000) ** 2 * strokeM * perMin * vol * 1000; // L/min (vol: volumetric efficiency, leaks; assumed)
// effective excess air: 1.40 with natural draft (≤ 60 L/min), 1.12 at ≥ 300 L/min (C0 anchors), linear between (assumed)
const lam = (q: number) => q <= 60 ? 1.4 : q >= 300 ? 1.12 : 1.4 - (0.28 * (q - 60)) / 240;
const AOPEN = +(process.env.AOPEN ?? 0.03), UA = +(process.env.UA ?? 5); // open top of a 20 cm bed (m²), clay wall loss W/K (assumed)
// heat balance of the bed: what the fire gives the bed = what leaves by the open top (radiation) and the wall
const powerCeil = (W: number) => { let lo = Ta, hi = 3000; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (AOPEN * 0.9 * sig * (m ** 4 - Ta ** 4) + UA * (m - Ta) < W) lo = m; else hi = m; } return lo; };
const C = (K: number) => Math.round(K - 273.15);
const show = (name: string, q: number, dp = 1500, eta = 0.25) => {
  const l = lam(q), Tg = Ta + (LHV * (1 - RAD)) / ((1 + l * AFR) * CP), Tp = (F * Tg ** 4 + (1 - F) * Ta ** 4) ** 0.25;
  const kgAirH = (q / 1000) * RHO * 60, coal = kgAirH / (l * AFR), kW = (coal * LHV) / 3600 / 1000, inW = (dp * q / 60000) / eta;
  const Tpow = powerCeil(kW * 1000 * (1 - RAD) * 0.5), Tb = Math.min(Tp, Tpow); // half of it stays in the bed (assumed)
  console.log(`${name.padEnd(28)} 空気 ${q.toFixed(0).padStart(4)} L/分  λ ${l.toFixed(2)}  炭 ${coal.toFixed(2)} kg/時 (${kW.toFixed(1)} kW)  炎で決まる ${C(Tp)} °C  熱で決まる ${C(Tpow)} °C → 炉の中 ${C(Tb)} °C  要る仕事 ${inW.toFixed(0)} W`);
};
show('自然の通風（小さな炭の床）', 60);
show('細い竹 10mm×2本（島の竹）', tube(10, 0.3, 80));
show('竹 40mm×2本', tube(40, 0.5, 70));
show('竹 80mm×2本', tube(80, 0.6, 60));
show('竹 100mm×2本', tube(100, 0.6, 60));
show('木をくり抜いた筒 120mm×2本', tube(120, 0.6, 50));
