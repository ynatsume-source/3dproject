// Headless check (the residents' hands on the raft's sail, 2026-10-19: robots/sail-host.ts wired to the science side's
// sail-work). Test data only, in a stand-in localStorage; Dot's mind a stand-in that picks the step named.
//  1 the options: none before there is a raft; then the cutting at each pandanus, with no number in them; the order seeded
//  2 the leaves cut over two quarter hours (its hands off between, and across a save and load: no work counted for the
//    time away), then resumed until cut; the standing leaves become cut leaves at the tree
//  3 wet leaves are not offered for splitting (science soak 2026-10-21: dry-leaves-required, no mat in 36 hours): nothing
//    tried, nothing refused, the leaves where they were
//  4 dried under the back eaves on the island's clock; saved and loaded three hours later — no hand work in the hours
//    caught up on, the roof's time across the load one span; dried, the world knows those leaves are dry
//  5 split at the bench, then woven into the sail's mat (one fixed size), each over several quarter hours
//  6 a mast cut from bamboo brought home before the sail (an old lot, no recorded quality); the mat and the mast are
//    the island's firsts (world/milestones.ts)
//  7 no number in any sail option; nothing a resident is told carries the amounts (marker masses) or a code: not its
//    diary, not what its mind is given, not the day's post prompt, not its saved memory
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/sail-host-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather, islandWeather, islandWait } from '../src/world/island-time';
import { addLot } from '../src/world/process-runner';
import { projectSailWork } from '../src/world/sail-work';
import { writePost } from '../src/journal/write';

let now = Date.parse('2026-10-06T00:00:00Z');   // (9:00 on the island)
Date.now = () => now;
const store = new Map<string, string>(), KEY = 'seaglass.residents.v1';
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
await loadIslandWeather();
Math.random = mulberry32(7);
const f = () => 2, T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
// (marker mass: the bamboo brought home, and what the science side makes of it — no resident may ever be told these digits)
const BAMBOO = 6_000_017, MARKS = ['6000017', '4285726', '5142'];
const inputs: any[] = [], allCodes = new Set<string>();
let pick: string | null = null, marked = false;
const make = () => {
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  for (const k of Object.keys(R.lab.lots)) if (k.startsWith('lot:south-near:first:')) delete R.lab.lots[k];   // (this check starts from an empty shelf, as before the first load from the south island — 案 A, 2026-10-27)
  R.setBrain(async (i: any) => { inputs.push(i); if (i.who !== 'dot' || !pick) return null; const p = pick; pick = null; return { goal: { text: 'テスト', why: 'テスト' }, plan: [p] }; });
  R.list.find((r: any) => r.id === 'dot').stats.built = 99;   // (the hut is up: a roof over the eaves)
  return R;
};
let R: any = make();
const dot = () => R.list.find((r: any) => r.id === 'dot');
const lots = (m: string) => Object.values(R.lab.lots).filter((l: any) => l.materialId === m) as any[];
const runsOf = (op: string) => Object.values(R.lab.runs).filter((r: any) => r.processId === 'prototype_sail_work' && r.state?.data?.spec?.operation === op) as any[];
const step = (secs: number, until?: () => boolean) => { for (let i = 0; i < secs; i++) { now += 1000; R.update(1, now, new THREE.Vector3(0, 50, 0)); if (i % 60 === 0) R.setWeather(islandWeather(now)); for (const r of R.list) if (!r.sp.living) { r.battery = 1; r.hunger = 0.2; r.sleepy = 0; } if (until?.()) return true; } return false; };
const choose = async (id: string, until: () => boolean, secs = 3600) => {
  pick = id; const a = R.mind(dot()); a.why = 'テスト'; a.lastCall = -1e12;
  for (let i = 0; i < secs; i++) { step(1); await Promise.resolve(); await Promise.resolve(); if (until()) return true; }
  return false;
};
// (one piece of work over as many quarter hours as it takes: begun, then gone on with until it is done)
const workUntil = async (first: string, place: string, done: () => boolean, rounds = 24) => {
  let n = 0;
  for (let k = 0; k < rounds && !done(); k++) {
    n++; let began = false;
    if (process.env.DEBUG) { const r: any = Object.values(R.lab.runs).find((x: any) => x.processId === 'prototype_sail_work' && x.state?.data?.spec?.operation !== 'dry'); if (r) { const p: any = projectSailWork(R.lab, r.runId); console.log('  round', k, r.state.data.spec.operation, p.certifiedMs, p.projection?.requiredMs, p.projection?.status, R.sailDev.slice(-2).map((d: any) => d.code).join(','), dot().task?.kind, dot().diary.at(-1)?.text); } }
    await choose(k === 0 ? first : `sail:resume:${place}`, () => { if (dot().task?.kind === 'sail-work') began = true; return done() || (began && dot().task?.kind !== 'sail-work'); }, 2400);
  }
  return n;
};
const said = (re: RegExp) => dot().diary.some((d: any) => re.test(d.text));
const options = async () => {
  const n0 = inputs.length; { const a = R.mind(dot()); a.why = 'テスト'; a.lastCall = -1e12; }
  for (let i = 0; i < 3600 && !inputs.slice(n0).some((x) => x.who === 'dot'); i++) { step(1); await Promise.resolve(); await Promise.resolve(); }
  step(120);
  return (inputs.slice(n0).find((i) => i.who === 'dot')?.options ?? []).filter((o: any) => o.id.startsWith('sail:'));
};
step(5);

{ // 1
  const before = await options();
  want('1 no raft yet: no sail work offered', before.length === 0, before.map((o: any) => o.id).join(','));
  R.village.raft.parts = 6; R.village.raft.x = dot().pos.x; R.village.raft.z = dot().pos.z;
  const opts = await options();
  want('1 a raft: the cutting at either pandanus offered (nothing to dry, split, weave or cut a mast from yet)', ['sail:harvest:near', 'sail:harvest:far'].every((id) => opts.some((o: any) => o.id === id)) && opts.length === 2, opts.map((o: any) => o.id).join(','));
  want('1 no number in an option', opts.every((o: any) => !/[0-9０-９]/.test(o.id + o.label + (o.targetId ?? ''))), opts.map((o: any) => o.label).join(' / '));
  want('1 the standing leaves on the trees, three cuttings each', lots('pandanus_standing_leaves').length === 6, `${lots('pandanus_standing_leaves').length}`);
}
{ // 2
  const near = R.village.sailHost.sites.trees[0].id;
  await choose('sail:harvest:near', () => runsOf('harvest').length === 1 && R.sailHost.isWorking('dot'));
  const run = runsOf('harvest')[0];
  want('2 cutting at the near tree: a run there, Dot\'s hands at it', !!run && run.state.data.spec.facts.worksite.locationId === near && R.sailHost.isWorking('dot'), `${run?.runId}`);
  step(300);
  const c0 = projectSailWork(R.lab, run.runId) as any;
  R.save(); for (const d of R.sailDev) allCodes.add(d.code);
  now += 3600e3; R = make();
  const c1 = projectSailWork(R.lab, run.runId) as any, d1 = R.lab.runs[run.runId].state.data;
  want('2 saved and loaded an hour later: hands off, no work counted for the hour away', !d1.engaged && c1.certifiedMs === c0.certifiedMs && c0.certifiedMs > 0, `${c0.certifiedMs} → ${c1.certifiedMs} engaged ${d1.engaged}`);
  const n = await workUntil('sail:resume:near', 'near', () => !R.lab.runs[run.runId]);
  const leaves = lots('pandanus_leaves');
  want('2 gone on with until cut: cut leaves at the tree, one cutting fewer standing', !R.lab.runs[run.runId] && leaves.length === 1 && leaves[0].location === near && lots('pandanus_standing_leaves').length === 5, `${n} rounds, ${leaves.map((l) => l.location).join(',')}`);
  want('2 what it saw when the cutting was done, in its diary', said(/葉を取り終えた/), dot().diary.slice(-3).map((e: any) => e.text).join(' / '));
}
{ // 3
  const dev0 = R.sailDev.length;
  await choose('sail:split:work', () => false, 120);   // (its mind names it: it is not there to be done)
  want('3 the wet leaves: not offered for splitting — nothing tried, nothing refused, no run', !said(/葉がまだ湿っていて、うまく裂けない/) && !R.sailDev.slice(dev0).some((d: any) => d.code === 'dry-leaves-required') && runsOf('split').length === 0 && !R.sailHost.options('dot', now).some((o: any) => o.id === 'sail:split:work'), R.sailDev.slice(dev0).map((d: any) => d.code).join(',') || '(none)');
  want('3 the leaves put back where they were', lots('pandanus_leaves')[0].location === R.village.sailHost.sites.trees[0].id, lots('pandanus_leaves')[0].location);
}
{ // 4
  await choose('sail:dry', () => runsOf('dry').length === 1);
  const run = runsOf('dry')[0], lot = lots('pandanus_leaves')[0];
  want('4 laid out under the back eaves: a drying run on the island\'s clock', run?.clock === 'island' && lot.location === 'site:sail-dry' && lot.reservedBy === run.runId && said(/アダンの葉を軒下に広げた/), `${run?.clock} ${lot.location}`);
  step(600);
  const seen = R.lab.runs[run.runId].state.data.observedThroughWorldMs;
  want('4 the roof\'s time confirmed as it passes', seen > run.state.data.spec.openedAtWorldMs, `${Math.round((seen - run.state.data.spec.openedAtWorldMs) / 60e3)} min`);
  // (drying under the roof: not offered to be taken in half way — science soak 2026-10-21, 26 dryings and 26 takings-in)
  const takein = R.sailHost.options('dot', now).some((o: any) => o.id === 'sail:takein');
  want('4 drying under the roof: not offered to be taken in half way', !takein);
  R.save(); const s = JSON.parse(store.get(KEY)!), from = s.village.sailHost.dry[run.runId], runs0 = Object.keys(s.lab.runs).length;
  for (const d of R.sailDev) allCodes.add(d.code);
  now += 3 * 3600e3; R = make();
  want('4 caught up on by habit: no hand work (no new run)', Object.keys(R.lab.runs).length === runs0 && R.lab.runs[run.runId], `runs ${runs0}→${Object.keys(R.lab.runs).length}`);
  const back = now, rev0 = R.lab.sailArrangement.revision; step(2);
  const d = R.lab.runs[run.runId]?.state.data;
  want('4 the roof\'s time across the load: one span, from the last confirmed moment to the first one back', !!d && d.observedThroughWorldMs >= back && R.lab.sailArrangement.revision === rev0 + 1 && R.village.sailHost.dry[run.runId] >= back && from < back - 3 * 3600e3 + 1, `rev ${rev0}→${R.lab.sailArrangement.revision}`);
  step(Math.ceil(islandWait(2.1 * 86400e3) / 1000), () => !R.lab.runs[run.runId]);
  const dried = lots('pandanus_leaves')[0];
  want('4 dried: the leaves under the eaves, drier, and the world knows they are', !R.lab.runs[run.runId] && dried?.quality.water_mg < 2_000_000 && R.village.sailHost.dried.includes(dried.lotId), `${dried?.quality.water_mg}`);
  await choose('sail:takein', () => false, 5);
}
{ // 5
  const n1 = await workUntil('sail:split:work', 'work', () => lots('pandanus_strips').length === 1);
  want('5 split at the bench: strips, and the scrap', lots('pandanus_strips').length === 1 && lots('pandanus_strips')[0].location === 'site:sail-work' && lots('pandanus_leaves').length === 0 && said(/葉を細く裂いた/), `${n1} rounds`);
  const n2 = await workUntil('sail:weave:work', 'work', () => lots("sail_mat").length === 1, 80);
  want('5 woven over several quarter hours: the sail\'s mat at the bench', lots('sail_mat').length === 1 && lots('sail_mat')[0].quality.area_cm2 === 20_000 && said(/編んだむしろが広がっている/), `${n2} rounds`);
}
{ // 6
  addLot(R.lab, { materialId: 'bamboo', amount: { value: 2_000_000, unit: 'mg' }, location: 'shelf' });   // (too short for a mast)
  const short = await options();
  want('6 a bamboo too short for a mast: no mast offered', !short.some((o: any) => o.id === 'sail:mast:work'), short.map((o: any) => o.id).join(','));
  addLot(R.lab, { materialId: 'bamboo', amount: { value: BAMBOO, unit: 'mg' }, location: 'shelf' });
  R.save(); marked = (store.get(KEY) ?? '').includes(MARKS[0]);
  const opts = await options();
  want('6 bamboo on the shelf: the mast offered', opts.some((o: any) => o.id === 'sail:mast:work'), opts.map((o: any) => o.id).join(','));
  await workUntil('sail:mast:work', 'work', () => lots('bamboo_mast').length === 1);
  want('6 a mast cut from the old bamboo; no second mast offered', lots('bamboo_mast').length === 1 && said(/竹のマストを切り出した/) && !(await options()).some((o: any) => o.id === 'sail:mast:work'), `${lots('bamboo_mast').length}`);
}
want('6 the island\'s firsts: the sail\'s mat and the mast, each marked once', typeof R.village.firsts?.sail === 'number' && R.village.firsts.sail > 0 && typeof R.village.firsts?.mast === 'number' && R.village.firsts.mast > 0, JSON.stringify({ sail: R.village.firsts?.sail, mast: R.village.firsts?.mast }));
for (const d of R.sailDev) allCodes.add(d.code);
{ // 7
  R.save();
  const d = dot(), diary = JSON.stringify(d.diary), minds = JSON.stringify(inputs), saved = store.get(KEY) ?? '';
  const mem = JSON.stringify({ minds: JSON.parse(saved).minds, list: JSON.parse(saved).list });
  const prompts: string[] = [];
  await writePost({ who: 'dot', name: d.v.name, profile: 'テスト', day: '2026-10-06', entries: d.diary.map((e: any) => ({ time: '12:00', text: e.text, key: e.key })), photos: [], talks: [] }, async (sys: string, user: string) => { prompts.push(sys + user); return null; }, 'stub');
  // (the codes: those the developer's log took, and the sail work's own refusals whether or not one came up — none is
  // ever a resident's)
  const codes = [...new Set([...allCodes, 'dry-leaves-required', 'dry-strips-required', 'insufficient-weave-material', 'long-bamboo-required', 'insufficient-mast-dry-mass', 'invalid-world-or-material-state'])], leaks = (t: string) => [...MARKS.filter((m) => new RegExp(`(?<![\\d.])${m}(?![\\d.])`).test(t)), ...codes.filter((c) => t.includes(c))];
  want('7 (the markers are real: the ledger holds them; the codes looked for)', marked && codes.length > 0, codes.join(','));
  want('7 no amount or code in its diary, its mind\'s input, the day\'s post prompt or its saved memory', [diary, minds, prompts.join(''), mem].every((t) => leaks(t).length === 0), [diary, minds, prompts.join(''), mem].map(leaks).map((x) => x.join('|')).join(' / '));
  const sailOpts = [...new Map(inputs.flatMap((i) => i.options ?? []).filter((o: any) => o.id.startsWith('sail:')).map((o: any) => [o.id, o])).values()] as any[];
  want('7 no number in any sail option it was offered, all along', sailOpts.length >= 6 && sailOpts.every((o) => !/[0-9０-９]/.test(o.id + o.label + (o.targetId ?? ''))), sailOpts.map((o) => o.label).join(' / '));
}
want('8 no sail work left running in the world ledger', runsOf('harvest').length + runsOf('split').length + runsOf('weave').length + runsOf('mast').length === 0);
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
