// What a worksite's things look like, for drawing only (the nature team's meshes, the stream's HUD): which things lie
// there and in what visible state. Main fills it from the science side's public reads (readHuskWorksite,
// readHuskMaterialLabel, and the cord work's views) and what the residents have seen; it never carries a number — no
// strength, water, mass, count or time — and it is never given to a resident's mind (2026-10-17, main ↔ nature).
// Randomness for a thing's look comes from its id (draw(seed, id, 'look') in science/rng.ts), never Math.random or
// the island's draws, so drawing more never moves the world's random sequence.

/** The kinds of thing a worksite can show. */
export type WorksiteThingKind = 'wet-husk' | 'partial-husk' | 'fiber-bundle' | 'yarn' | 'cord'
  | 'pandanus-leaves' | 'pandanus-strips' | 'leaf-scrap' | 'sail-mat' | 'bamboo-mast';   // (the sail's: 2026-10-19, nature proposal sail-look)
/** Its visible state: what a viewer could tell by looking. */
export type WorksiteThingLook = 'wet' | 'dry' | 'fuzzy' | 'smooth' | 'frayed' | 'broken'
  // (cut leaves: just cut, laid out drying, dried; the mat: being woven, woven, torn; the mast: cut, or broken)
  | 'fresh' | 'drying' | 'weaving' | 'done' | 'torn' | 'cut';
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
export type WorksiteFixtureKind = 'beat-board' | 'drying-rack' | 'pandanus-tree' | 'raft';
/** A fixture's visible state, for those that have one: a pandanus as full of standing leaves as it grew, thinned by
 *  cutting, or stripped (its leaves do not grow back: v1); the raft bare, or rigged — its mast stepped and the sail
 *  furled on it, ashore. No count of cuttings. */
export type WorksiteFixtureLook = 'full' | 'thinned' | 'stripped' | 'bare' | 'rigged';
export interface WorksiteFixture {
  /** Stable while it stands (the seed of its look). */
  id: string;
  kind: WorksiteFixtureKind;
  look?: WorksiteFixtureLook;
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
    case 'pandanus_leaves': return 'pandanus-leaves';
    case 'pandanus_strips': return 'pandanus-strips';
    case 'pandanus_leaf_scrap': return 'leaf-scrap';
    case 'sail_mat': return 'sail-mat';
    case 'bamboo_mast': return 'bamboo-mast';
    default: return null;
  }
}

/** Fixed looks for drawing before main's connection fills them (the nature team's first item: the fibre bundle,
 *  wet and dry). Test data only. */
export const WORKSITE_LOOK_FIXTURES: Readonly<Record<string, WorksiteLook>> = Object.freeze({
  'fiber-wet': { siteId: 'fixture:husk-site', fixtures: [{ id: 'fixture:board-1', kind: 'beat-board' }], items: [{ id: 'fixture:bundle-1', kind: 'fiber-bundle', look: 'wet' }, { id: 'fixture:husk-1', kind: 'partial-husk', look: 'wet' }] },
  'fiber-dry': { siteId: 'fixture:cord-dry', fixtures: [{ id: 'fixture:rack-1', kind: 'drying-rack' }], items: [{ id: 'fixture:bundle-1', kind: 'fiber-bundle', look: 'dry' }] },
  'bare-site': { siteId: 'fixture:husk-site', fixtures: [], items: [] },   // (nothing put there yet: nothing drawn)
  // (the sail's places: a pandanus thinned with its cut leaves beside it; leaves drying under the back eaves, and dried;
  // the bench with strips, scrap, a mat being woven and the mast; the raft rigged, the mat and mast on it)
  'sail-tree': { siteId: 'fixture:sail-tree', fixtures: [{ id: 'fixture:pandanus-1', kind: 'pandanus-tree', look: 'thinned' }], items: [{ id: 'fixture:leaves-1', kind: 'pandanus-leaves', look: 'fresh' }] },
  'sail-dry': { siteId: 'fixture:sail-dry', fixtures: [], items: [{ id: 'fixture:leaves-2', kind: 'pandanus-leaves', look: 'drying' }, { id: 'fixture:leaves-3', kind: 'pandanus-leaves', look: 'dry' }] },
  'sail-work': { siteId: 'fixture:sail-work', fixtures: [], items: [{ id: 'fixture:strips-1', kind: 'pandanus-strips', look: 'dry' }, { id: 'fixture:scrap-1', kind: 'leaf-scrap', look: 'dry' }, { id: 'fixture:mat-1', kind: 'sail-mat', look: 'weaving' }, { id: 'fixture:mast-1', kind: 'bamboo-mast', look: 'cut' }] },
  'sail-raft': { siteId: 'fixture:raft', fixtures: [{ id: 'fixture:raft-1', kind: 'raft', look: 'rigged' }], items: [{ id: 'fixture:mat-2', kind: 'sail-mat', look: 'done', on: 'fixture:raft-1' }, { id: 'fixture:mast-2', kind: 'bamboo-mast', look: 'cut', on: 'fixture:raft-1' }, { id: 'fixture:cord-1', kind: 'cord', look: 'smooth', on: 'fixture:raft-1' }] },
});
