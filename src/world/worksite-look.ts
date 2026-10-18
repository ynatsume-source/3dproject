// What a worksite's things look like, for drawing only (the nature team's meshes, the stream's HUD): which things lie
// there and in what visible state. Main fills it from the science side's public reads (readHuskWorksite,
// readHuskMaterialLabel, and the cord work's views) and what the residents have seen; it never carries a number — no
// strength, water, mass, count or time — and it is never given to a resident's mind (2026-10-17, main ↔ nature).
// Randomness for a thing's look comes from its id (draw(seed, id, 'look') in science/rng.ts), never Math.random or
// the island's draws, so drawing more never moves the world's random sequence.

/** The kinds of thing a worksite can show. */
export type WorksiteThingKind = 'wet-husk' | 'partial-husk' | 'fiber-bundle' | 'yarn' | 'cord';
/** Its visible state: what a viewer could tell by looking. */
export type WorksiteThingLook = 'wet' | 'dry' | 'fuzzy' | 'smooth' | 'frayed' | 'broken';
export interface WorksiteThing {
  /** Stable while the thing exists (the seed of its look). Not a lot id a viewer is shown. */
  id: string;
  kind: WorksiteThingKind;
  look: WorksiteThingLook;
  /** The fixture it lies on or hangs from (a WorksiteFixture's id), when it does: the husk being beaten on the board,
   *  the fibre hung on the drying rack. Absent: it lies on the ground beside. */
  on?: string;
}
/** What stands at a worksite for the work, when it is there: the board the husks are beaten on, the rack the fibre
 *  dries on under the eaves. Listed only once the world has put it there — a viewer is never shown a thing to come. */
export type WorksiteFixtureKind = 'beat-board' | 'drying-rack';
export interface WorksiteFixture {
  /** Stable while it stands (the seed of its look). */
  id: string;
  kind: WorksiteFixtureKind;
}
export interface WorksiteLook {
  siteId: string;
  fixtures: WorksiteFixture[];
  items: WorksiteThing[];
}

/** The kind a material is drawn as, or null for one a worksite does not draw. */
export function thingKindOf(materialId: string): WorksiteThingKind | null {
  switch (materialId) {
    case 'wet_unseparated_coconut_husk': return 'wet-husk';
    case 'partially_separated_coconut_husk': return 'partial-husk';
    case 'coir_fiber_bundle': return 'fiber-bundle';
    case 'coir_strand': return 'yarn';
    case 'coir_rope': return 'cord';
    default: return null;
  }
}

/** Fixed looks for drawing before main's connection fills them (the nature team's first item: the fibre bundle,
 *  wet and dry). Test data only. */
export const WORKSITE_LOOK_FIXTURES: Readonly<Record<string, WorksiteLook>> = Object.freeze({
  'fiber-wet': { siteId: 'fixture:husk-site', fixtures: [{ id: 'fixture:board-1', kind: 'beat-board' }], items: [{ id: 'fixture:bundle-1', kind: 'fiber-bundle', look: 'wet' }, { id: 'fixture:husk-1', kind: 'partial-husk', look: 'wet' }] },
  'fiber-dry': { siteId: 'fixture:cord-dry', fixtures: [{ id: 'fixture:rack-1', kind: 'drying-rack' }], items: [{ id: 'fixture:bundle-1', kind: 'fiber-bundle', look: 'dry' }] },
  'bare-site': { siteId: 'fixture:husk-site', fixtures: [], items: [] },   // (nothing put there yet: nothing drawn)
});
