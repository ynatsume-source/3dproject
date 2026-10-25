// A v2 trial: same rules as A-fire-making.md v2. Draws by hash(seed, hearth, JST date, purpose, try, spec);
// missing rain while banked → out (gap); missing temp/RH or EMC out of range → no try.
import { readFileSync } from 'node:fs';
import { woodEmc } from './pr73/src/science/step/firewood.ts';
const LIFE_H = 12, RAIN_OUT = 8, P0 = 0.5, TRIES = 6, W_FULL = 0.12, W_ZERO = 0.22, STORM_MS = 15, SPEC = 'hearth/2';
const SEED = process.env.SEED ?? 'world-1';
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h / 2 ** 32; };
const draw = (date: string, use: string, k: number) => fnv(`${SEED}|eq:hearth|${date}|${use}|${k}|${SPEC}`);
const tot: any = { days: 0, evOut: 0, evFail: 0, gapOut: 0, noTryHours: 0, tries: 0, noonLit: 0, streakMax: 0 };
for (const y of [2022, 2023, 2024]) {
  const j = JSON.parse(readFileSync(`./pr73/src/data/weather/kayama-${y}.json`, 'utf8')); const n = j.fields.length, NA = j.na, R = j.rows as number[];
  const H = R.length / n, at = (h: number, f: number) => { const v = R[h * n + f]; return v === NA ? NaN : v; };
  let st: 'burning' | 'embers' | 'out' = 'embers', dieAt = 21.1 + LIFE_H, rain = 0, streak = 0;
  // rain while banked, hour by hour; a missing hour makes the embers unknown → treated as out (gap)
  const rainOn = (a: number, b: number) => { if (st !== 'embers') return; for (let h = Math.floor(a); h < Math.ceil(b); h++) { const r = at(h, 2); if (Number.isNaN(r)) { st = 'out'; tot.gapOut++; return; } rain += r / 10; if (rain >= RAIN_OUT || h + 1 >= dieAt) { st = 'out'; return; } } if (b >= dieAt) st = 'out'; };
  const bank = (t: number) => { st = 'embers'; dieAt = t + LIFE_H; rain = 0; };
  const tryLight = (h: number, date: string, use: string) => {
    const T = at(h, 0) / 10, rh = at(h, 1) / 100; if (!(Number.isFinite(T) && Number.isFinite(rh))) { tot.noTryHours++; return false; }
    const w = woodEmc(T, rh); if (w === null) { tot.noTryHours++; return false; }
    const p = P0 * Math.max(0, Math.min(1, (W_ZERO - w) / (W_ZERO - W_FULL)));
    for (let k = 1; k <= TRIES; k++) { tot.tries++; if (draw(date, use, k) < p) return true; } return false;
  };
  for (let d = 1; d < Math.floor(H / 24) - 1; d++) {
    tot.days++; const h0 = d * 24, date = `${y}-${d}`;
    rainOn(h0 - 2.9, h0 + 8.85);
    const storm = at(h0 + 9, 4) / 10 >= STORM_MS;
    if (st === 'embers' && !storm) bank(h0 + 9.5);                 // morning: renew under the ash
    rainOn(h0 + 9.5, h0 + 13);
    if (st === 'out' && tryLight(h0 + 13, date, 'noon')) { tot.noonLit++; bank(h0 + 13.5); }   // noon: light, bank at 13:30
    rainOn(h0 + 13.5, h0 + 19.4);
    let lit = false;
    if (st === 'embers') lit = true;
    else { tot.evOut++; lit = tryLight(h0 + 19, date, 'eve'); if (!lit) { tot.evFail++; streak++; tot.streakMax = Math.max(tot.streakMax, streak); } }
    if (lit) { streak = 0; bank(h0 + 21.1); }
  }
}
console.log(JSON.stringify({ SEED, ...tot, outPerMonth: +(tot.evOut / tot.days * 30).toFixed(1), failPerMonth: +(tot.evFail / tot.days * 30).toFixed(2), firePct: +(100 - tot.evFail / tot.days * 100).toFixed(1) }));
