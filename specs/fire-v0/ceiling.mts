// C0 trial: flame (gas) temperature from fuel and air excess, then the piece's radiative equilibrium with view factor F.
const sig = 5.67e-8, Ta = 28 + 273.15, CP = 1250; // J/(kg K), flue gas at high T (assumed)
const fuels = { wood28: { lhv: 0.72 * 18e6 - 0.28 * 2.256e6, afr: 0.72 * 6.0 }, wood12: { lhv: 0.88 * 18e6 - 0.12 * 2.256e6, afr: 0.88 * 6.0 }, charcoal: { lhv: 30e6, afr: 11.0 } };
// fraction of released heat lost by flame radiation before the gas reaches the piece (assumed)
const tg = (f: keyof typeof fuels, lam: number, rad: number) => Ta + (fuels[f].lhv * (1 - rad)) / ((1 + lam * fuels[f].afr) * CP);
const eq = (Tg: number, F: number) => Math.pow(F * Tg ** 4 + (1 - F) * Ta ** 4, 0.25);
const C = (K: number) => Math.round(K - 273.15);
const rows: [string, keyof typeof fuels, number, number, number][] = [
  ['焚き火・炎の上に置く', 'wood28', 2.5, 0.25, 0.45],
  ['焚き火・熾に埋める', 'wood28', 2.0, 0.25, 0.65],
  ['野焼き（薪で囲む）', 'wood28', 2.0, 0.25, 0.8],
  ['野焼き・よく乾いた薪', 'wood12', 2.0, 0.25, 0.8],
  ['石灰の積み焼き（薪とサンゴを交互）', 'wood12', 1.8, 0.2, 0.85],
  ['炭・自然の通風', 'charcoal', 2.5, 0.3, 0.85],
  ['炭・竹のふいご', 'charcoal', 1.2, 0.3, 0.9],
];
for (const [name, f, lam, rad, F] of rows) { const g = tg(f, lam, rad); console.log(`${name}\tλ${lam}\t炎 ${C(g)} °C\tF ${F}\t置いた物の天井 ${C(eq(g, F))} °C`); }
console.log('--- calibrate λ to anchors (piece ceiling)');
const solve = (f: keyof typeof fuels, rad: number, F: number, targetC: number) => { let lo = 1, hi = 6; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (C(eq(tg(f, m, rad), F)) > targetC) lo = m; else hi = m; } return (lo + hi) / 2; };
const anchors: [string, keyof typeof fuels, number, number, number][] = [
  ['焚き火・熾に埋める', 'wood28', 0.25, 0.65, 700], ['野焼き（囲む）', 'wood28', 0.25, 0.8, 900],
  ['炭・自然の通風（床の中）', 'charcoal', 0.3, 0.85, 1000], ['炭・ふいご', 'charcoal', 0.3, 0.9, 1250]];
for (const [n, f, rad, F, t] of anchors) { const l = solve(f, rad, F, t); const w12 = C(eq(tg('wood12', l, rad), F)); console.log(n, `λ=${l.toFixed(2)}`, `炎 ${C(tg(f, l, rad))} °C`, f.startsWith('wood') ? `→ 乾いた薪12%なら ${w12} °C` : ''); }
// approach: pit heaped, seasoned wood, how long from 150 °C to cherry 830 °C at max burn 40 kg/h (heat capacity 30 kJ/K + pot)
const lam = solve('wood28', 0.25, 0.8, 900), Tg = tg('wood28', lam, 0.25), A = 0.6, hc = 30000 + 3000; let T = 423, t = 0;
while (T < 830 + 273.15 && t < 6 * 3600) { const net = A * 0.9 * sig * (0.8 * (Tg ** 4 - T ** 4) - 0.2 * (T ** 4 - Ta ** 4)); T += (net * 10) / hc; t += 10; }
console.log('pit approach 150→830 °C (radiative only, A 0.6 m²):', (t / 60).toFixed(0), 'min');
