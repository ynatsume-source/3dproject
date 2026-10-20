// Headless check (the sail's places in the worksite window, 2026-10-19: robots/worksite-looks.ts, world/worksite-look.ts;
// nature proposal sail-look). Test data only, in a ledger of its own.
//  1 a pandanus full, thinned (a cutting off it, or one under way), stripped — never a count
//  2 cut leaves fresh; laid out drying (held by the roofed wait at the drying place); dry once a wait finished them
//  3 at the bench: strips, scrap; strips held by the weaving are the mat being woven; a mat woven, or torn; a mast cut,
//    or broken
//  4 the raft: bare, or rigged with the rig's parts on it (and its lashing); none before the raft stands
//  5 no sail places before the world has found them; no number in what the window says (ids aside)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/sail-look-check.ts
import { emptyLedger, addLot } from '../src/world/process-runner';
import { readWorksiteLooks } from '../src/robots/worksite-looks';

let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const L = emptyLedger('w', 'look');
const lot = (materialId: string, location: string, quality: Record<string, number> = {}, reservedBy?: string) => {
  const l: any = addLot(L, { materialId, amount: { value: 1000, unit: 'mg' }, location, quality }); if (reservedBy) l.reservedBy = reservedBy; return l.lotId as string;
};
const T0 = 'site:sail-tree-0', T1 = 'site:sail-tree-1', T2 = 'site:sail-tree-2', DRY = 'site:sail-dry', WORK = 'site:sail-work', RAFT = 'site:raft';
for (let k = 0; k < 3; k++) lot('pandanus_standing_leaves', T0);
lot('pandanus_standing_leaves', T1); lot('pandanus_standing_leaves', T1, {}, 'run:cut');   // (one off it, one being cut)
const fresh = lot('pandanus_leaves', T1), drying = lot('pandanus_leaves', DRY, {}, 'run:dry'), dried = lot('pandanus_leaves', DRY);
lot('pandanus_strips', WORK); lot('pandanus_leaf_scrap', WORK); lot('pandanus_strips', WORK, {}, 'run:weave');
lot('sail_mat', WORK, { torn: 1 }); lot('bamboo_mast', WORK, { broken: 1 });
const mat = lot('sail_mat', RAFT, { torn: 0 }), mast = lot('bamboo_mast', RAFT, { broken: 0 });
const places = (sail: any) => ({ husk: { pool: 'site:husk-pool', work: 'site:husk-work', board: false }, cord: { dry: 'site:cord-dry', work: 'site:cord-work', hang: 'site:cord-hang', rack: false }, ...(sail ? { sail } : {}) });
const sail = { trees: [T0, T1, T2], dry: DRY, work: WORK, raft: RAFT, rigged: true, dried: [dried], perTree: 3 };
const looks = readWorksiteLooks(L, places(sail)), at = (id: string) => looks.find((x) => x.siteId === id)!;
const items = (id: string) => at(id).items.map((t) => `${t.kind}:${t.look}${t.on ? '@' + t.on : ''}`).sort().join(',');
{ // 1
  const tree = (id: string) => at(id).fixtures.map((f) => `${f.kind}:${f.look}`).join(',');
  want('1 a pandanus full, thinned, stripped', tree(T0) === 'pandanus-tree:full' && tree(T1) === 'pandanus-tree:thinned' && tree(T2) === 'pandanus-tree:stripped', [T0, T1, T2].map(tree).join(' / '));
}
{ // 2
  want('2 cut leaves fresh at the tree; drying and dry under the back eaves', items(T1) === 'pandanus-leaves:fresh' && items(DRY) === 'pandanus-leaves:dry,pandanus-leaves:drying', `${items(T1)} / ${items(DRY)}`);
  void fresh; void drying;
}
{ // 3
  want('3 the bench: strips, scrap, the mat being woven, a torn mat, a broken mast', items(WORK) === 'bamboo-mast:broken,leaf-scrap:dry,pandanus-strips:dry,sail-mat:torn,sail-mat:weaving', items(WORK));
}
{ // 4
  lot('coir_rope', RAFT, { fiber_dry_mg: 900, attached_pith_dry_mg: 50, water_mg: 50, length_mm: 2000, base_strength_gf: 1, sun_ms: 0, shade_ms: 0, abrasions: 0, inherited_faded: 0, inherited_abraded: 0, history_complete: 1, cord_codec: 1 });
  const r = readWorksiteLooks(L, places(sail)).find((x) => x.siteId === RAFT)!;
  want('4 the raft rigged, the mat, the mast and its cord on it', r.fixtures[0]?.look === 'rigged' && r.items.length === 3 && r.items.every((t) => t.on === 'fixture:raft') && r.items.some((t) => t.kind === 'sail-mat' && t.look === 'done') && r.items.some((t) => t.kind === 'bamboo-mast' && t.look === 'cut'), JSON.stringify(r.fixtures));
  const bare = readWorksiteLooks(L, places({ ...sail, rigged: false })).find((x) => x.siteId === RAFT)!;
  want('4 bare when not rigged', bare.fixtures[0]?.look === 'bare');
  want('4 no raft place before the raft stands', !readWorksiteLooks(L, places({ ...sail, raft: null })).some((x) => x.siteId === RAFT));
  void mat; void mast;
}
{ // 5
  const none = readWorksiteLooks(L, places(null));
  want('5 no sail places before the world has found them', !none.some((x) => x.siteId.startsWith('site:sail') || x.siteId === RAFT), none.map((x) => x.siteId).join(','));
  const text = JSON.stringify(looks.map((x) => ({ ...x, fixtures: x.fixtures.map(({ id: _, ...f }) => f), items: x.items.map(({ id: _, on: __, ...t }) => t) })));
  want('5 no number in what the window says (ids aside)', !/[0-9]/.test(text.replace(/site:sail-tree-\d/g, '')), text.slice(0, 120));
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
