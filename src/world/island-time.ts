// Dot's world's own time (ADR 0006, 0007). The day — light and dark, the residents' doings, their bodies, the posts —
// keeps the real clock. The calendar and everything that is only waited for (seasons, weather, regrowth, crops,
// drying, firing) run ISLAND_RATE times as fast: a season a real week, an island year four real weeks.
// The weather is the Earth's past weather replayed on that calendar: the record for the island's date, at the real
// hour of the day — measured at the nearest station (JMA, Ishigaki), with the sky's cloud and gusts from the ERA5
// reanalysis for the look of things only (src/data/weather/, scripts/bake-island-weather.py).
import type { Weather } from '../time/weather';

/** How much faster the island's calendar (and what is only waited for) runs than the real clock. */
export const ISLAND_RATE = 365 / 28;
/** The real moment the island's calendar began, and the day of its year it began on (island June 1st: the typhoon
 *  season is days away, not weeks). */
export const ISLAND_EPOCH = Date.parse('2026-10-05T00:00:00+09:00');
const EPOCH = ISLAND_EPOCH, EPOCH_DAY = 151;
const DAY = 86400000;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** A real duration that is only waited for, as it runs on the island's clock (e.g. 30 island hours of regrowth). */
export const islandWait = (islandMs: number) => islandMs / ISLAND_RATE;

export type IslandSeason = '春' | '夏' | '秋' | '冬';
export interface IslandDate { year: number; dayOfYear: number; month: number; day: number; season: IslandSeason; label: string }
/** The island's date at a real moment. Its year is 365 days; island year 1 began on island June 1st. */
export function islandDate(realMs: number): IslandDate {
  const days = EPOCH_DAY + ((realMs - EPOCH) / DAY) * ISLAND_RATE;
  const year = Math.floor(days / 365) + 1, dayOfYear = ((Math.floor(days) % 365) + 365) % 365;
  let m = 0, d = dayOfYear; while (d >= MONTH_DAYS[m]) { d -= MONTH_DAYS[m]; m++; }
  const month = m + 1, season: IslandSeason = month >= 3 && month <= 5 ? '春' : month <= 8 && month >= 6 ? '夏' : month >= 9 && month <= 11 ? '秋' : '冬';
  return { year, dayOfYear, month, day: d + 1, season, label: `島暦${year}年 ${month}月${d + 1}日（${season}）` };
}

/* ---------- the weather ---------- */
export interface IslandWeather extends Weather {
  pressure: number;   // hPa (sea level), as measured — or, missing from the record, a fair 1010 for the look of things
  typhoon: boolean;   // a storm the island cannot work or feed through (low pressure or a gale)
  source: string;
  /** Where the measured values come from (for the science core's environment, source 'record'): the station and the
   *  original time of the reading. Only the values measured there are in air / humidity / windMeasured / pressureMeasured. */
  record: { station: string; at: string };
  pressureMeasured?: number;
}
type Record_ = { year: number; source: string; station: string; na: number; rows: number[] };
const YEARS = ['2024', '2023'];   // (each island year replays the next, in turn; more years to come)
const loaded = new Map<string, Record_>();
let loading: Promise<void> | null = null;
/** Load the records (once). Until they are in, the island has fair weather. */
export function loadIslandWeather(): Promise<void> {
  return (loading ??= Promise.all(YEARS.map(async (y) => {
    const m = await import(`../data/weather/kayama-${y}.json`);
    loaded.set(y, (m.default ?? m) as Record_);
  })).then(() => undefined));
}
const F = 8;   // fields a row
/** The island's weather at a real moment: the record for the island's date, at the real hour of the day. */
export function islandWeather(realMs: number): IslandWeather | null {
  const d = islandDate(realMs), rec = loaded.get(YEARS[(d.year - 1) % YEARS.length]); if (!rec) return null;
  const hour = new Date(realMs + 9 * 3600000).getUTCHours(), i = (d.dayOfYear * 24 + hour) * F, r = rec.rows, NA = rec.na ?? -32768;
  if (i + F > r.length) return null;
  const val = (k: number, s: number, off = 0) => (r[i + k] === NA ? undefined : (r[i + k] + off) / s);
  const air = val(0, 10), rh = val(1, 100), rain = val(2, 10) ?? 0, p = val(3, 10, 9000), windM = val(4, 10), dir = r[i + 5] === NA ? 90 : r[i + 5] * 2;
  const gust = val(6, 10) ?? (windM ?? 4) * 1.5, cloud = val(7, 100) ?? (rain > 0.1 ? 0.9 : rh !== undefined && rh > 0.85 ? 0.65 : rh !== undefined && rh > 0.75 ? 0.4 : 0.2), /* (no reanalysis for the year: the sky as rain and humidity show it) */ wind = windM ?? 4, pressure = p ?? 1010;
  const typhoon = (p !== undefined && p < 996) || (windM !== undefined && windM >= 15) || gust >= 25;
  const code = typhoon && rain > 2 ? 65 : rain >= 4 ? 65 : rain >= 1 ? 63 : rain > 0.1 ? 61 : cloud > 0.85 ? 3 : cloud > 0.45 ? 2 : 1;
  const day0 = new Date(Date.UTC(rec.year, 0, 1 + d.dayOfYear + (rec.year % 4 === 0 && d.dayOfYear >= 59 ? 1 : 0)));
  const at = `${day0.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00+09:00`;
  return { ok: true, at: realMs, cloud, rain, code, wind, windDir: dir, gust, air, humidity: rh, windMeasured: windM, pressure, pressureMeasured: p, typhoon, source: rec.source, record: { station: rec.station ?? 'era5', at } };
}
