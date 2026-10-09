// What the clays the residents dig are made of, as raw_clay quality (the science side owns these; main reads them).
// Read by p10x_clay_slake as dug: water_ppm, the dry make-up xd_<species>_ppm (the rest of the dry part is inert
// mineral) and the coarse share of it xc_<species>_ppm (stones, sand, roots: they stay on the sieve).
//
// status 'assumed': no source describes this clay yet. The values are the science checks' own example raw clay
// (scripts/science-clay-prep-check.ts RAW), which main already uses for the island to the south. They are a plausible
// sandy, kaolinitic earthenware clay with a little organic matter (roots, leaf bits), nothing more. No claim is made about
// the real island's geology. Codex is asked to check them against sources on the Yaeyama soils and old local pottery;
// a change of values gets a new table version, and a lot keeps the quality it was dug with.
// Codex on 0a3de47: sources on Ishigaki and Yonaguni clays support a mix of kaolin minerals, quartz and other minerals,
// but not this deposit's make-up. Their kaolin share (e.g. 340–480 g/kg) is of the separated clay fraction, not of the
// dry raw earth as here, so a similar number is not a match. organic_c is carbon, not soil organic matter; calcite is
// not derived from exchangeable Ca or nearby limestone. Quartz 35 %, organic C 1 %, calcite 0 and the coarse part stay
// uncalibrated.

import type { ParamStatus } from './params';

export const ISLAND_CLAY_TABLE = 'civ-sci.island-clay/1';

export interface ClayDeposit {
  /** Main's isle id (src/world/planet-map.ts ISLES). */
  isle: string;
  ja: string;
  status: ParamStatus;
  quality: Readonly<Record<string, number>>;
  note: string;
}

export const ISLAND_CLAYS: readonly ClayDeposit[] = [
  {
    isle: 'south-near',
    ja: '南のすぐ近くの島の粘土（掘ったまま）',
    status: 'assumed',
    quality: { water_ppm: 200_000, xd_kaolinite_ppm: 450_000, xd_quartz_ppm: 350_000, xd_organic_c_ppm: 10_000,
      xc_quartz_ppm: 150_000, xc_inert_mineral_ppm: 50_000, xc_organic_c_ppm: 5_000 },
    note: 'the checks\' example raw clay; 1 % organic carbon burns out in the open fire (p13y 0.1.1); no calcite assumed',
  },
];

export function islandClay(isle: string): ClayDeposit | undefined {
  return ISLAND_CLAYS.find((c) => c.isle === isle);
}
