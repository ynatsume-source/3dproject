// The world's sea level (ADR 0009): one value, from the clock's time alone, that the drawn sea (U.uSeaH, ocean/air.ts
// setSeaLevel) and the CPU's surface (swellAt, surfaceAt) both read. Never saved, and no random draws: after a
// catch-up or a reload, the same moment has the same sea.
//  - Step 1 (now): always 0, mean sea level. The look and the fingerprint are unchanged.
//  - Step 2: the tide (time/astro.ts tide) in Dot's world, shown to the science team before it goes in. Tide pools cut
//    off from the sea (water.ts 'pool' and 'inland', site:husk-pool among them) keep to mean sea level: their water does
//    not follow the tide. CORAL_CEIL stays against mean sea level (coral heads come out of the water at low tide).
import { tide } from './astro';

export interface SeaSite { id: string; residents?: unknown }
/** A sea's tide, as locations.ts gives it (time/astro.ts tide). */
export interface TideSite { lat: number; lon: number; tide?: { amp: number; lag: number; diurnal?: { d: number; lag: number } } }
/** The waves' run-up above the highest tide (m): how much further up the shore the water comes. */
export const RUN_UP_M = 0.2;
const tops = new Map<string, number>();
/** The highest the tide comes up this sea's shore (m above mean sea level): the year's highest tide by its own tide
 *  (2026, every 20 minutes) and the waves' run-up — Kayama's +0.91 m + 0.2 m. Ground below it, joined to the sea, is the
 *  tide's (ocean/water.ts). The time alone: the same sea, the same answer. */
export function tideTop(site: TideSite): number {
  const t = site.tide; if (!t) return RUN_UP_M;
  const key = JSON.stringify([site.lat, site.lon, t]);
  let hi = tops.get(key);
  if (hi === undefined) {
    hi = -Infinity;
    for (let ms = Date.UTC(2026, 0, 1); ms < Date.UTC(2027, 0, 1); ms += 1_200_000) hi = Math.max(hi, tide(ms, site.lat, site.lon, t.amp, t.lag, t.diurnal).h);
    tops.set(key, hi);
  }
  return hi + RUN_UP_M;
}

/** The sea's height at `ms` (m above mean sea level) in the world of `site`. */
export function seaLevel(ms: number, site: SeaSite | null | undefined): number {
  void ms; void site;
  return 0;
}
/** Where water of `kind` (ocean/water.ts) stands when the sea is at `level`: a pool or an inland pond keeps to mean sea
 *  level, the sea and the lagoon follow it. */
export function waterTop(kind: string, level: number): number {
  return kind === 'pool' || kind === 'inland' ? 0 : level;
}
