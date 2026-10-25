// B trial: shrinking-core calcination of coral lumps, driven by the CO2 equilibrium pressure (log10 p_atm = 7.079 − 8308/T).
const peq = (C: number) => 10 ** (7.079 - 8308 / (C + 273.15));
const V0 = +(process.env.V0 ?? 4), PHEAP = +(process.env.PHEAP ?? 0.2); // mm/h at full drive (assumed, porous coral); CO2 in the heap, atm (assumed)
const v = (C: number) => V0 * Math.max(0, Math.min(1, 1 - PHEAP / peq(C)));
console.log('p_eq(atm):', [700, 750, 800, 850, 900, 950].map((c) => `${c}°C ${peq(c).toFixed(3)}`).join('  '));
console.log('front mm/h:', [750, 800, 850, 900, 950, 1000].map((c) => `${c}°C ${v(c).toFixed(2)}`).join('  '));
for (const dCm of [2, 4, 6, 10]) console.log(`lump ${dCm} cm: hours to the core at`, [850, 900, 950].map((c) => `${c}°C ${(dCm * 5 / v(c)).toFixed(1)} h`).join('  '));
// burned share of mass after t hours at T (sphere: unburned core (1 − x/R)^3)
const left = (dCm: number, C: number, h: number) => Math.max(0, 1 - v(C) * h / (dCm * 5)) ** 3;
console.log('6 cm, 900°C, 8 h: core left', (left(6, 900, 8) * 100).toFixed(0), '%');
// energy: CaCO3 → CaO + CO2  ΔH 178 kJ/mol; heat of coral to 900 °C (cp ~1.0 J/gK)
const mol = 1000 / 100.09, dH = mol * 178e3, sens = 1000 * 1.0 * 870;
console.log('per kg coral: calcination', (dH / 1e6).toFixed(2), 'MJ, heating', (sens / 1e6).toFixed(2), 'MJ; Sri Lanka 0.5 kg wood/kg coral ≈', (0.5 * 0.85 * 18e6 / 1e6 - 0.5*0.15*2.256).toFixed(1), 'MJ → efficiency', ((dH + sens) / (0.5 * (0.85 * 18e6 - 0.15 * 2.256e6)) * 100).toFixed(0), '%');
console.log('mass: CaO/CaCO3 =', (56.077 / 100.09).toFixed(3), '; water to slake 1 kg CaO:', (18.015 / 56.077).toFixed(3), 'kg; heat', (65.2e3 * 1000 / 56.077 / 1e6).toFixed(2), 'MJ');
