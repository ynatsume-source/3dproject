// The world's sea level (ADR 0009): one value, from the clock's time alone, that the drawn sea (U.uSeaH, ocean/air.ts
// setSeaLevel) and the CPU's surface (swellAt, surfaceAt) both read. Never saved, and no random draws: after a
// catch-up or a reload, the same moment has the same sea.
//  - Step 1 (now): always 0, mean sea level. The look and the fingerprint are unchanged.
//  - Step 2: the tide (time/astro.ts tide) in Dot's world, shown to the science team before it goes in. Tide pools cut
//    off from the sea (water.ts 'pool' and 'inland', site:husk-pool among them) keep to mean sea level: their water does
//    not follow the tide. CORAL_CEIL stays against mean sea level (coral heads come out of the water at low tide).
export interface SeaSite { id: string; residents?: unknown }

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
