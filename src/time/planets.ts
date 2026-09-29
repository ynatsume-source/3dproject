// The naked-eye planets, from JPL's approximate Keplerian elements (Standish, valid 1800-2050, good to
// well under a degree): geocentric direction in the equatorial frame of the star catalogue, and an
// approximate visual magnitude.
const D2R = Math.PI / 180;
// a, e, I, L, long. perihelion, long. ascending node — and their rates per Julian century
type El = [number, number, number, number, number, number];
const EL: Record<string, [El, El]> = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
};
// absolute magnitude, phase coefficient (mag per degree), colour index B-V
const PHOT: Record<string, [number, number, number]> = {
  mercury: [-0.613, 0, 0.93], venus: [-4.384, 0, 0.82], mars: [-1.52, 0.016, 1.36], jupiter: [-9.40, 0.005, 0.83], saturn: [-8.88, 0.044, 1.04],
};
export const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const;
export const PLANET_JA: Record<string, string> = { mercury: '水星', venus: '金星', mars: '火星', jupiter: '木星', saturn: '土星' };

function helio(name: string, T: number): [number, number, number] {
  const [e0, r] = EL[name];
  const a = e0[0] + r[0] * T, e = e0[1] + r[1] * T, I = (e0[2] + r[2] * T) * D2R;
  const L = e0[3] + r[3] * T, peri = e0[4] + r[4] * T, node = (e0[5] + r[5] * T) * D2R;
  const w = peri * D2R - node;
  let M = ((L - peri) % 360) * D2R;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(node), sO = Math.sin(node), cI = Math.cos(I), sI = Math.sin(I);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

export interface PlanetPos { name: string; dir: [number, number, number]; mag: number; bv: number }
export function planets(ms: number): PlanetPos[] {
  const T = (ms / 86400000 + 2440587.5 - 2451545.0) / 36525;
  const ea = helio('earth', T), eps = 23.43928 * D2R;
  return PLANETS.map((name) => {
    const p = helio(name, T);
    const g = [p[0] - ea[0], p[1] - ea[1], p[2] - ea[2]];
    const delta = Math.hypot(g[0], g[1], g[2]), rr = Math.hypot(p[0], p[1], p[2]), re = Math.hypot(ea[0], ea[1], ea[2]);
    // phase angle sun-planet-earth
    const cosi = (rr * rr + delta * delta - re * re) / (2 * rr * delta);
    const i = Math.acos(Math.max(-1, Math.min(1, cosi))) / D2R;
    const [H, k, bv] = PHOT[name];
    // inner planets change brightness strongly with phase: Mallama & Hilton (2018) phase curves
    const ph = name === 'venus' ? -1.044e-3 * i + 3.687e-4 * i ** 2 - 2.814e-6 * i ** 3 + 8.938e-9 * i ** 4
      : name === 'mercury' ? 6.328e-2 * i - 1.6336e-3 * i ** 2 + 3.3644e-5 * i ** 3 - 3.4265e-7 * i ** 4 + 1.6893e-9 * i ** 5 - 3.0334e-12 * i ** 6
      : k * i;
    const mag = H + 5 * Math.log10(rr * delta) + ph;
    const x = g[0] / delta, y = (g[1] * Math.cos(eps) - g[2] * Math.sin(eps)) / delta, z = (g[1] * Math.sin(eps) + g[2] * Math.cos(eps)) / delta;
    return { name, dir: [x, y, z], mag, bv };
  });
}
