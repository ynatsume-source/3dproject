// Headless check (science review 2026-10-19, specs/tide-diurnal): Kayama's tide with its once-a-day share
// (astro.ts tide, the sea's tide.diurnal). The two low waters of a day are no longer alike: in winter the deep ones
// (below −0.7 m) fall in the evening, in summer in the morning; the year's lowest stays above −1.1 m; and the same
// moment always gives the same height (no randomness: Math.random is never drawn).
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/tide-check.ts
const { tide } = await import('../src/time/astro');
const { LOCATIONS } = await import('../src/data/locations');
const sea = LOCATIONS.find((l) => l.id === 'kayama')!;
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
let draws = 0; const keep = Math.random; Math.random = () => { draws++; return keep(); };
const h = (ms: number) => tide(ms, sea.lat, sea.lon, sea.tide.amp, sea.tide.lag, sea.tide.diurnal).h;

ok(!!sea.tide.diurnal, `Kayama has a diurnal share (${JSON.stringify(sea.tide.diurnal)})`);
// the low waters between two dates (every 10 min), with their local hour
const lows = (from: number, to: number) => {
  const out: { at: number; h: number; hour: number }[] = [];
  let a = h(from - 6e5), b = h(from);
  for (let t = from; t < to; t += 6e5) { const c = h(t + 6e5); if (b < a && b <= c) out.push({ at: t, h: b, hour: new Date(t + sea.tz * 3600e3).getUTCHours() }); a = b; b = c; }
  return out;
};
const eve = (x: { hour: number }) => x.hour >= 12, morn = (x: { hour: number }) => x.hour < 12;
const deep = (L: { h: number }[]) => L.filter((x) => x.h < -0.7);

// winter (December to February): the deep lows in the evening
const W = deep(lows(Date.UTC(2026, 11, 1, -9), Date.UTC(2027, 2, 1, -9)));
const we = W.filter(eve).length, wm = W.filter(morn).length;
ok(we > 3 * Math.max(1, wm), `winter: deep lows in the evening ${we}, in the morning ${wm}`);
// the stream's first weeks (12/20–1/31): evening deep lows from 19:00 to 21:59 (9 with M2 and S2 alone, 13 with the
// diurnal share: the science review's figures)
const S = deep(lows(Date.UTC(2026, 11, 20, -9), Date.UTC(2027, 1, 1, -9))).filter((x) => x.hour >= 19 && x.hour <= 21).length;
ok(S >= 12, `12/20–1/31: deep lows from 19:00 to 21:59 on ${S} evenings (9 without the diurnal share)`);
// summer (June to August): the deep lows in the morning
const Su = deep(lows(Date.UTC(2027, 5, 1, -9), Date.UTC(2027, 8, 1, -9)));
const se = Su.filter(eve).length, sm = Su.filter(morn).length;
ok(sm > 3 * Math.max(1, se), `summer: deep lows in the morning ${sm}, in the evening ${se}`);
// the year's lowest
const Y = lows(Date.UTC(2026, 11, 1, -9), Date.UTC(2027, 11, 1, -9)), lo = Math.min(...Y.map((x) => x.h));
ok(lo > -1.1 && lo < -0.8, `the year's lowest ${lo.toFixed(3)} m (deeper than −0.8, not below −1.1)`);
// the same moment, the same height: twice over, and against values fixed here
const T0 = Date.UTC(2026, 11, 24, 10, 30);   // (19:30 JST on 12/24, an evening low)
ok(h(T0) === h(T0), `the same moment gives the same height (${h(T0).toFixed(6)} m)`);
const FIXED: [number, number][] = [[Date.UTC(2026, 11, 24, 10, 30), -1.034928], [Date.UTC(2027, 0, 8, 10, 40), -1.014504], [Date.UTC(2027, 6, 1, 0, 0), 0.147132]];
for (const [t, v] of FIXED) ok(Math.abs(h(t) - v) < 1e-5, `${new Date(t + 9 * 3600e3).toISOString().slice(0, 16)} JST: ${h(t).toFixed(6)} m (fixed ${v})`);
ok(draws === 0, `Math.random drawn ${draws} times`);
// another sea, with no diurnal share, is as it was
const gbr = LOCATIONS.find((l) => l.id === 'gbr')!;
ok(!gbr.tide.diurnal && tide(T0, gbr.lat, gbr.lon, gbr.tide.amp, gbr.tide.lag).h === tide(T0, gbr.lat, gbr.lon, gbr.tide.amp, gbr.tide.lag, undefined).h, 'a sea without a diurnal share is unchanged');
console.log(fails ? `${fails} FAILED` : 'PASS');
process.exit(fails ? 1 : 0);
