// How high the sea stood a little while ago (U.uWetH, for the reef out of the water: render/reef-lit.ts). What lies
// between the sea now and that line was under water within the last WET_MIN minutes, and is still wet; above it the reef
// has dried. One value for the sea: the reef's shader takes the share of it that reaches each point (tideReach — none in a
// pool cut off from the sea, whose water stays at mean sea level). From the clock's time alone (time/sea-level.ts
// seaLevel): never saved, no random draws, the same moment the same line. The look only.
import { U } from '../render/common';
import { seaLevel, type SeaSite } from '../time/sea-level';

/** How long a reef surface left by the falling tide takes to dry in the open air (minutes). */
export const WET_MIN = 45;
// (LAB: ?wetfrom= — with ?sealevel= holding the sea, where it stood WET_MIN minutes before: −3..+3 m)
const WET_FROM = (() => { const m = typeof location === 'undefined' ? null : /[?&]wetfrom=(-?\d+(?:\.\d+)?)/.exec(location.search); return m ? Math.max(-3, Math.min(3, +m[1])) : null; })();

/** The highest the sea stood over the last WET_MIN minutes before `ms` (every 5 minutes, and now). */
export function wetLine(ms: number, site: SeaSite | null | undefined): number {
  let h = seaLevel(ms, site);
  for (let k = 5; k <= WET_MIN; k += 5) h = Math.max(h, seaLevel(ms - k * 60_000, site));
  return h;
}
/** Sets the wet line for the frame: from the clock, or, with the sea held (?sealevel=, LAB), from ?wetfrom= (else the
 *  held sea itself: nothing left wet but what the waves wash). */
export function setWetLine(held: number | null, ms: number, site: SeaSite | null | undefined) {
  U.uWetH.value = held != null ? Math.max(held, WET_FROM ?? held) : wetLine(ms, site);
}
