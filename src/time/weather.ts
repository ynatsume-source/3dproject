// The weather at the real site right now, from Open-Meteo (https://open-meteo.com, CC BY 4.0): cloud,
// rain, thunder, wind, air temperature and relative humidity, and from its marine service the wave height and sea
// temperature. Fetched when you arrive and every 15 minutes; if it cannot be reached the sea simply
// keeps fair weather.
export interface Weather {
  ok: boolean; at: number;
  cloud: number;        // 0..1
  rain: number;         // mm/h
  code: number;         // WMO weather code (95+ thunderstorm)
  wind: number; windDir: number; gust: number;   // m/s, degrees
  air?: number; wave?: number; sst?: number;
  humidity?: number;    // relative, 0..1 (only when measured: never filled in with a guess — the science core's drying needs it)
  windMeasured?: number;  // the 10 m wind (m/s) as measured; `wind` above falls back to a fair-weather value for the look of things,
                          // this does not (what goes to the science core's EnvironmentSample.windMs)
}
export const FAIR: Weather = { ok: false, at: 0, cloud: 0.15, rain: 0, code: 1, wind: 4, windDir: 90, gust: 6 };

const cache = new Map<string, Weather>();
export async function fetchWeather(id: string, lat: number, lon: number): Promise<Weather> {
  const have = cache.get(id);
  if (have && Date.now() - have.at < 15 * 60000) return have;
  const w: Weather = { ...FAIR, at: Date.now() };
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,cloud_cover,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m&wind_speed_unit=ms`);
    const c = (await r.json()).current;
    Object.assign(w, { ok: true, cloud: (c.cloud_cover ?? 20) / 100, rain: c.rain ?? c.precipitation ?? 0, code: c.weather_code ?? 1, wind: c.wind_speed_10m ?? 4, windDir: c.wind_direction_10m ?? 90, gust: c.wind_gusts_10m ?? 6, air: c.temperature_2m,
      windMeasured: typeof c.wind_speed_10m === 'number' ? c.wind_speed_10m : undefined,
      humidity: typeof c.relative_humidity_2m === 'number' ? c.relative_humidity_2m / 100 : undefined });
  } catch (e) { /* offline or blocked: fair weather */ }
  try {
    const r = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=wave_height,sea_surface_temperature`);
    const c = (await r.json()).current;
    if (c) { w.wave = c.wave_height ?? undefined; w.sst = c.sea_surface_temperature ?? undefined; }
  } catch (e) { /* marine data is optional */ }
  cache.set(id, w);
  return w;
}

export function weatherLabel(w: Weather) {
  const c = w.code;
  if (c >= 95) return '雷雨';
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return w.rain > 4 ? '強い雨' : '雨';
  if (c >= 51 && c <= 57) return '霧雨';
  if (c === 45 || c === 48) return '霧';
  return w.cloud > 0.85 ? '曇り' : w.cloud > 0.45 ? '晴れ時々曇り' : '晴れ';
}
export const isStorm = (w: Weather) => w.code >= 95;
