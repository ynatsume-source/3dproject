import {
  check,
  uint,
  safe
} from './sail-raft-rules';

/** Raw measured fields only. Do not pass islandWeather's display fallbacks. */
export interface SailWeatherRecord {
  windMeasuredMs?: number | null;
  windFromDeg?: number | null;
  gustMs?: number | null;
  rainMeasuredMm?: number | null;
}

export interface SailCellWeather {
  windMmS: number;
  windToDeg: number;
  gustMmS: number | null;
  rain: boolean | null;
}

/** Missing wind or direction means no known sailing weather. In v2 the host
 * still sends a null-weather cell and the model paddles. Missing rain stays
 * null; the explicit v2 assumption counts it as sunshine, never as a reading.
 */
export function sailCellWeather(
  rec: SailWeatherRecord
): SailCellWeather | null {
  check(rec !== null && typeof rec === 'object' && !Array.isArray(rec), 'invalid-sail-weather');
  if (rec.windMeasuredMs == null || rec.windFromDeg == null) return null;
  check(
    Number.isFinite(rec.windMeasuredMs) &&
    rec.windMeasuredMs >= 0 &&
    Number.isFinite(rec.windFromDeg) &&
    rec.windFromDeg >= 0 &&
    rec.windFromDeg <= 360,
    'invalid-sail-weather'
  );
  const windMmS = Math.round(rec.windMeasuredMs * 1000);
  const windToDeg = ((270 - Math.round(rec.windFromDeg)) % 360 + 360) % 360;
  check(uint(windMmS), 'invalid-sail-weather');
  let gustMmS: number | null = null;
  if (rec.gustMs != null) {
    check(Number.isFinite(rec.gustMs) && rec.gustMs >= 0, 'invalid-sail-gust');
    gustMmS = Math.round(rec.gustMs * 1000);
    check(uint(gustMmS), 'invalid-sail-gust');
    // A measured gust lower than the measured mean is inconsistent. Refuse
    // the weather as a whole rather than fabricating or clamping a gust.
    if (gustMmS < windMmS) return null;
  }
  let rain: boolean | null = null;
  if (rec.rainMeasuredMm != null) {
    check(
      Number.isFinite(rec.rainMeasuredMm) && rec.rainMeasuredMm >= 0,
      'invalid-sail-rain'
    );
    rain = rec.rainMeasuredMm > 0;
  }
  return { windMmS, windToDeg, gustMmS, rain };
}

/** Owner assumption v2, 2026-10-18. Mass m is mg, length is mm.
 * Multiplication starts in BigInt so all safe integer legacy masses conserve
 * mass and produce the same dry/water allocation after JSON restoration.
 */
export function bambooQualityFromLegacyMass(m: number): {
  dry_mg: number;
  water_mg: number;
  length_mm: number;
} {
  check(uint(m, 1), 'invalid-legacy-bamboo-mass');
  const mass = BigInt(m);
  const dry_mg = safe(mass * 5n / 7n);
  return {
    dry_mg,
    water_mg: m - dry_mg,
    length_mm: safe(mass * 6000n / 7000000n)
  };
}
