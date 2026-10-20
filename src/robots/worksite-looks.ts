// What the husk and cord worksites look like, for drawing (world/worksite-look.ts: the nature team's meshes, the stream's
// HUD), filled from the world's own ledger (2026-10-17, main ↔ nature ↔ science, PR③). Which things lie at each place
// and in what visible state — never a number, and never given to a resident's mind (residents.ts reads it only to hand
// it to the renderer). A thing's visible state is read from its lot the way the science side's own rules tell it
// (COIR_CORD_RULES: a bundle dry once its water is a tenth of its dry mass or less, as the drying ends; a cord faded
// after a year of sun, a tenth as fast in the shade; rubbed once it has been rubbed; fuzzy while its pith is over the
// baseline): the look follows the world, not the other way round.
import type { Ledger } from '../world/process-runner';
import type { LotView } from '../world/science-contract';
import { thingKindOf, type WorksiteLook, type WorksiteThing, type WorksiteThingLook, type WorksiteFixture } from '../world/worksite-look';
import { COIR_CORD_RULES as R } from '../science/prototypes/coir-cord-types';

export interface WorksitePlaces {
  husk: { pool: string; work: string; board: boolean };     // board: the beating board, once a husk has been beaten there
  cord: { dry: string; work: string; hang: string; rack: boolean };   // rack: the drying rack, once fibre has been laid out on it
  // the sail's places, once the world has found them: the pandanus trees, where leaves dry, the bench's far side; the
  // raft's place (raft: once it stands; rigged: the rig laid on it); dried: leaves a finished roofed wait dried
  sail?: { trees: string[]; dry: string; work: string; raft: string | null; rigged: boolean; dried: string[]; perTree: number };
}

const n = (q: Record<string, unknown> | undefined, k: string) => { const v = q?.[k]; return typeof v === 'number' && Number.isFinite(v) ? v : 0; };
// (a stable id for a thing, seeded from its lot: not the lot id a viewer would be shown)
function idOf(lotId: string): string {
  let h = 2166136261; for (let i = 0; i < lotId.length; i++) h = Math.imul(h ^ lotId.charCodeAt(i), 16777619) >>> 0;
  return `thing:${h.toString(36)}`;
}
const wet = (waterMg: number, dryMg: number) => waterMg * R.waterPerDryDenominator > dryMg;

/** The visible state of a lot drawn at a worksite, or null for one a worksite does not draw. */
export function lookOf(l: LotView): WorksiteThing | null {
  const kind = thingKindOf(l.materialId); if (!kind) return null;
  const q = l.quality;
  let look: WorksiteThingLook;
  switch (kind) {
    case 'wet-husk': look = 'wet'; break;
    case 'partial-husk': look = wet(n(q, 'water_mg'), n(q, 'dry_mg')) ? 'wet' : 'dry'; break;
    case 'fiber-bundle': look = wet(n(q, 'water_mg'), n(q, 'fiber_dry_mg') + n(q, 'attached_pith_dry_mg')) ? 'wet' : 'dry'; break;
    // (the sail's things, away from the sail's places: as they plainly are — the drying is told at its own place)
    case 'pandanus-leaves': look = 'fresh'; break;
    case 'pandanus-strips': case 'leaf-scrap': look = 'dry'; break;
    case 'sail-mat': look = n(q, 'torn') === 1 ? 'torn' : 'done'; break;
    case 'bamboo-mast': look = n(q, 'broken') === 1 ? 'broken' : 'cut'; break;
    default: {   // (yarn and cord)
      const fiber = n(q, 'fiber_dry_mg'), pith = n(q, 'attached_pith_dry_mg');
      const faded = n(q, 'inherited_faded') === 1 || 10 * n(q, 'sun_ms') + n(q, 'shade_ms') >= 10 * R.yearIslandMs;
      const rubbed = n(q, 'inherited_abraded') === 1 || n(q, 'abrasions') > 0;
      look = l.location === 'ground' ? 'broken' : faded || rubbed ? 'frayed' : pith * 1_000_000 > fiber * R.pithBaselinePpm ? 'fuzzy' : 'smooth';
    }
  }
  return { id: idOf(l.lotId), kind, look };
}

// The sail's things (2026-10-19, nature proposal sail-look): leaves fresh, drying (laid out in a roofed wait — its lot
// held by the drying), or dry (a wait finished: the world's own record); strips being woven are the mat being woven;
// a mat torn or a mast broken shows so (written on it by the voyage). A pandanus by how many cuttings are still on it —
// all, some, none — never the number; a cutting under way is already off it.
function sailLooks(lots: (LotView & { reservedBy?: string })[], p: NonNullable<WorksitePlaces['sail']>): WorksiteLook[] {
  const thing = (l: LotView & { reservedBy?: string }): WorksiteThing | null => {
    const id = idOf(l.lotId), q = l.quality;
    switch (l.materialId) {
      case 'pandanus_leaves': return { id, kind: 'pandanus-leaves', look: p.dried.includes(l.lotId) ? 'dry' : l.reservedBy && l.location === p.dry ? 'drying' : 'fresh' };
      case 'pandanus_strips': return l.reservedBy ? { id, kind: 'sail-mat', look: 'weaving' } : { id, kind: 'pandanus-strips', look: 'dry' };
      case 'pandanus_leaf_scrap': return { id, kind: 'leaf-scrap', look: 'dry' };
      case 'sail_mat': return { id, kind: 'sail-mat', look: n(q, 'torn') === 1 ? 'torn' : 'done' };
      case 'bamboo_mast': return { id, kind: 'bamboo-mast', look: n(q, 'broken') === 1 ? 'broken' : 'cut' };
      default: return lookOf(l);   // (a cord by the raft: its lashing, or the rig's)
    }
  };
  const at = (siteId: string, fixtures: WorksiteFixture[], on?: string): WorksiteLook => ({ siteId, fixtures,
    items: lots.filter((l) => l.location === siteId).sort((a, b) => a.lotId.localeCompare(b.lotId, 'en', { numeric: true }))
      .map((l) => { const t = thing(l); return t && on ? { ...t, on } : t; }).filter(Boolean) as WorksiteThing[] });
  const trees = p.trees.map((siteId, i) => {
    const left = lots.filter((l) => l.location === siteId && l.materialId === 'pandanus_standing_leaves' && !l.reservedBy).length;
    return at(siteId, [{ id: `fixture:pandanus-${i}`, kind: 'pandanus-tree', look: left >= p.perTree ? 'full' : left > 0 ? 'thinned' : 'stripped' }]);
  });
  const raft = p.raft === null ? [] : [at(p.raft, [{ id: 'fixture:raft', kind: 'raft', look: p.rigged ? 'rigged' : 'bare' }], 'fixture:raft')];
  return [...trees, at(p.dry, []), at(p.work, []), ...raft];
}

/** Every husk, cord and sail place, what stands there and what lies there now. */
export function readWorksiteLooks(L: Ledger, p: WorksitePlaces): WorksiteLook[] {
  const lots = Object.values(L.lots) as LotView[];
  // (on: what lies on a fixture — at the beating place the husk in someone's work (its lot held by a running job) is on
  // the board, the rest beside it; at the drying place all the fibre there hangs on the rack)
  const site = (siteId: string, fixtures: WorksiteFixture[], onIt: (l: LotView & { reservedBy?: string }) => boolean = () => false): WorksiteLook => ({
    siteId, fixtures,
    items: lots.filter((l) => l.location === siteId).sort((a, b) => a.lotId.localeCompare(b.lotId, 'en', { numeric: true }))
      .map((l) => { const t = lookOf(l); return t && fixtures[0] && onIt(l) ? { ...t, on: fixtures[0].id } : t; }).filter(Boolean) as WorksiteThing[],
  });
  const sail = p.sail ? sailLooks(lots as (LotView & { reservedBy?: string })[], p.sail) : [];
  return [
    ...sail,
    site(p.husk.pool, []),
    site(p.husk.work, p.husk.board ? [{ id: 'fixture:husk-board', kind: 'beat-board' }] : [], (l) => !!l.reservedBy),
    site(p.cord.dry, p.cord.rack ? [{ id: 'fixture:cord-rack', kind: 'drying-rack' }] : [], () => true),
    site(p.cord.work, []),
    site(p.cord.hang, []),
  ];
}
