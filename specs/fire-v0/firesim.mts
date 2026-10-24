import { readFileSync } from 'node:fs';
import { woodEmc } from './pr73/src/science/step/firewood.ts';
// hourly rows, JST, from the island's baked weather; params under test
const LIFE_H = +(process.env.LIFE ?? 12), RAIN_OUT = +(process.env.RAIN ?? 8), P0 = +(process.env.P0 ?? 0.5), TRIES = +(process.env.TRIES ?? 6);
const W_FULL = 0.12, W_ZERO = +(process.env.WZ ?? 0.22), RAIN_P = +(process.env.RP ?? 0.2), NOON = process.env.NOON === '1', STORM_MS = 15;
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const tot: any = { days: 0, evOut: 0, evFail: 0, morningOut: 0, tries: 0, lit: 0, streakMax: 0, evNoData: 0 };
for (const y of [2022, 2023, 2024]) {
  const j = JSON.parse(readFileSync(`./pr73/src/data/weather/kayama-${y}.json`, 'utf8')); const n = j.fields.length, NA = j.na, R = j.rows as number[];
  const H = R.length / n, at = (h: number, f: number) => { const v = R[h * n + f]; return v === NA ? NaN : v; };
  let embersDie = 21 + LIFE_H, rainSince = 0, streak = 0;   // hours since Jan 1 00:00
  for (let d = 1; d < Math.floor(H / 24) - 1; d++) {
    tot.days++;
    const h0 = d * 24;
    // night + morning: rain on the banked pit since last bank
    const rainH = (a: number, b: number) => { let s = 0; for (let h = a; h < b; h++) { const r = at(h, 2); if (r > 0) s += r / 10; } return s; };
    // morning 8.85 renewal (skipped in storm)
    const mh = h0 + 9, storm = at(mh, 4) / 10 >= STORM_MS;
    rainSince += rainH(h0 - 3, h0 + 9);
    let alive = embersDie > h0 + 8.85 && rainSince < RAIN_OUT;
    if (!alive) tot.morningOut++;
    if (alive && !storm) { embersDie = h0 + 9.5 + LIFE_H; rainSince = 0; }
    const tryAt = (hh: number) => { const T = at(hh, 0) / 10, rh = at(hh, 1) / 100, rain = at(hh, 2) / 10;
      const w = woodEmc(T, Math.min(0.98, rh)) ?? 0.2, fw = Math.max(0, Math.min(1, (W_ZERO - w) / (W_ZERO - W_FULL)));
      const p = P0 * fw * (rain > 0.2 ? RAIN_P : 1); for (let k = 0; k < TRIES; k++) { tot.tries++; if (rnd() < p) return true; } return false; };
    if (!alive && NOON && tryAt(h0 + 13)) { alive = true; tot.noonLit = (tot.noonLit ?? 0) + 1; embersDie = h0 + 13.5 + LIFE_H; rainSince = 0; }
    rainSince += rainH(h0 + 9, h0 + 19);
    alive = alive && embersDie > h0 + 19.4 && rainSince < RAIN_OUT;
    let lit = alive;
    if (!alive) {
      tot.evOut++;
      const T = at(h0 + 19, 0) / 10, rh = at(h0 + 19, 1) / 100, rain = at(h0 + 19, 2) / 10;
      if (!(T > 0) || !(rh > 0)) { tot.evNoData++; }
      const w = woodEmc(T, Math.min(0.98, rh)) ?? 0.2;
      const fw = Math.max(0, Math.min(1, (W_ZERO - w) / (W_ZERO - W_FULL)));
      const p = P0 * fw * (rain > 0.2 ? RAIN_P : 1);
      for (let k = 0; k < TRIES && !lit; k++) { tot.tries++; if (rnd() < p) lit = true; }
      if (!lit) { tot.evFail++; streak++; tot.streakMax = Math.max(tot.streakMax, streak); } else streak = 0;
    } else streak = 0;
    if (lit) { tot.lit++; embersDie = h0 + 21.1 + LIFE_H; rainSince = 0; }
  }
}
console.log(JSON.stringify({ LIFE_H, RAIN_OUT, P0, TRIES, ...tot, outPerMonth: +(tot.evOut / tot.days * 30).toFixed(1), failPerMonth: +(tot.evFail / tot.days * 30).toFixed(2) }));
