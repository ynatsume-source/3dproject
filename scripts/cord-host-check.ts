// Headless check (the residents' hands on the coir cord, 2026-10-17: robots/cord-host.ts wired to the science side's
// coir-cord-work and coir-cord-load). Test data only, in a stand-in localStorage; Dot's mind a stand-in that picks the
// step named.
//  1 the options: the cord's hand actions offered when the materials and places allow, with no number in them (the two
//    lengths are the uses they are for); the order seeded, not the work's
//  2 twisting a wet bundle: "繊維が湿っていて、撚れない" as felt, only because it was there and tried; the code in the
//    developer's log only
//  3 dried under the eaves: a drying run on the island's clock, the roof's time confirmed as it passes; saved and loaded
//    three hours later — no hand work in the hours caught up on, and the roof's time across the load one span
//  4 twisted three strands of the pot's length, plied into a rope at the worksite
//  5 a pot hung by the rope: its weight from the ledger sent as a load, once; the same load sent again is the same record;
//    the rope that held keeps its lotId; a heavier pot (water in it) a new load; the sun sent before a load, a move or
//    plying, not hourly; the pot taken down
//  6 a raft lashed with a weak rope: a crossing's load and its rubbing; the rope gave — two new pieces, the old id gone
//  7 no number in any cord option offered along the way; nothing a resident is told carries the amounts (marker masses) or a code: not its diary, not what its mind is
//    given, not the day's post prompt, not its saved memory
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/cord-host-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather, islandWeather, islandWait } from '../src/world/island-time';
import { addLot } from '../src/world/process-runner';
import { writeCordBundle, writeCordPiece } from '../src/world/coir-cord-lots';
import { projectCordWork } from '../src/world/coir-cord-work';
import { applyCordLoad } from '../src/world/coir-cord-load';
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
// (marker masses: no resident may ever be told these digits)
const FIBER = 72_017, PITH = 7_013, WET = 115_219, POT = 1_234_567, WATER = 2_345_671;
const MARKS = ['72017', '7013', '115219', '1234567', '2345671', '1235', '3581'];   // (the last two: the pot's weight, sent as loads)

const ledgerMarkers = new Set<string>();
function rememberLedgerMarkers(ledger: unknown): void {
  const text = JSON.stringify(ledger);
  for (const mark of MARKS.slice(0, 5)) {
    if (text.includes(mark)) ledgerMarkers.add(mark);
  }
}
const inputs: any[] = [], allCodes = new Set<string>();
let pick: string | null = null;
const make = () => {
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  R.setBrain(async (i: any) => { inputs.push(i); if (i.who !== 'dot' || !pick) return null; const p = pick; pick = null; return { goal: { text: 'テスト', why: 'テスト' }, plan: [p] }; });
  R.list.find((r: any) => r.id === 'dot').stats.built = 99;   // (the hut is up: a roof over the eaves)
  return R;
};
let R: any = make();
const dot = () => R.list.find((r: any) => r.id === 'dot');
const lots = (m: string) => Object.values(R.lab.lots).filter((l: any) => l.materialId === m) as any[];
const runsOf = (op: string) => Object.values(R.lab.runs).filter((r: any) => r.processId === 'prototype_coir_work' && r.state?.data?.spec?.operation === op) as any[];
// Inspect only the bounded receipts retained by each physical cord.
const records = () => Object.values(R.lab.coirCordLoads?.cords ?? {})
  .flatMap((checkpoint: any) => checkpoint.recent.map((receipt: any) =>
    ({ request: receipt.request, ...receipt.result })))
  .sort((a: any, b: any) => Number(a.runId.slice(4)) - Number(b.runId.slice(4)));
const step = (secs: number, until?: () => boolean) => { for (let i = 0; i < secs; i++) { now += 1000; R.update(1, now, new THREE.Vector3(0, 50, 0)); if (i % 60 === 0) R.setWeather(islandWeather(now)); for (const r of R.list) if (!r.sp.living) { r.battery = 1; r.hunger = 0.2; } if (until?.()) return true; } return false; };
const choose = async (id: string, until: () => boolean, secs = 3600) => {
  pick = id; const a = R.mind(dot()); a.why = 'テスト'; a.lastCall = -1e12;
  for (let i = 0; i < secs; i++) { step(1); await Promise.resolve(); await Promise.resolve(); if (until()) return true; }
  return false;
};
const said = (re: RegExp) => dot().diary.some((d: any) => re.test(d.text));
const b = writeCordBundle({ fiberDryMg: FIBER, pithDryMg: PITH, waterMg: WET }, 'site:husk-work', 1);
addLot(R.lab, { materialId: b.materialId, amount: b.amount, location: b.into!, quality: b.quality });
rememberLedgerMarkers(R.lab);
step(5);

{ // 1
  const n0 = inputs.length; { const a = R.mind(dot()); a.why = 'テスト'; a.lastCall = -1e12; }
  for (let i = 0; i < 3600 && !inputs.slice(n0).some((x) => x.who === 'dot'); i++) { step(1); await Promise.resolve(); await Promise.resolve(); }
  step(120);   // (its mind's answer — nothing — taken, before the next step is chosen)
  const opts = (inputs.slice(n0).find((i) => i.who === 'dot')?.options ?? []).filter((o: any) => o.id.startsWith('cord:'));
  want('1 offered what the materials allow: drying, sieving, twisting for either use (no plying, no hanging yet)', ['cord:dry', 'cord:sieve', 'cord:twist:pot', 'cord:twist:raft'].every((id) => opts.some((o: any) => o.id === id)) && !opts.some((o: any) => ['cord:ply', 'cord:hang', 'cord:lash'].includes(o.id)), opts.map((o: any) => o.id).join(','));
  want('1 no number in an option (the length is the use it is for)', opts.every((o: any) => !/[0-9０-９]/.test(o.id + o.label)), opts.map((o: any) => o.label).join(' / '));
}
{ // 2
  const dev0 = R.cordDev.length;
  await choose('cord:twist:pot', () => said(/繊維が湿っていて、撚れない/));
  want('2 twisting the wet bundle: what it felt, in the science side\'s words; the code for the developer only', said(/繊維が湿っていて、撚れない/) && R.cordDev.slice(dev0).some((d: any) => d.code === 'wet-fiber-cannot-twist') && runsOf('twist').length === 0, R.cordDev.slice(dev0).map((d: any) => d.code).join(','));
}
{ // 3
  await choose('cord:dry', () => runsOf('dry').some((r) => r.status === 'running'));
  const run = runsOf('dry')[0], lot = lots('coir_fiber_bundle')[0];
  want('3 put under the eaves: a drying run, the bundle at the drying place', run?.status === 'running' && lot?.location === 'site:cord-dry' && lot.reservedBy === run.runId, `${run?.status} ${lot?.location}`);
  step(600);
  const fr = R.lab.runs[run.runId].state.data.frames;
  want('3 the roof\'s time confirmed as it passes', fr.length > 0 && fr.every((x: any) => x.kind === 'confirmed-roofed-wait' && x.roofed), `${fr.length} spans`);
  R.save(); const s = JSON.parse(store.get(KEY)!), from = s.village.cordHost.dry[run.runId], runs0 = Object.keys(s.lab.runs).length;
  addLot(R.lab, { ...(() => { const w = writeCordBundle({ fiberDryMg: FIBER, pithDryMg: PITH, waterMg: 7_000 }, 'site:husk-work', 1); return { materialId: w.materialId, amount: w.amount, location: w.into!, quality: w.quality }; })() });
  R.save(); const s2 = JSON.parse(store.get(KEY)!);
  for (const d of R.cordDev) allCodes.add(d.code);   // (the developer's log is not saved)
  now += 3 * 3600e3; R = make();
  want('3 caught up on by habit: no hand work (no new run, the second bundle where it was)', Object.keys(R.lab.runs).length === Object.keys(s2.lab.runs).length && lots('coir_fiber_bundle').filter((l) => l.location === 'site:husk-work').length === 1 && R.lab.runs[run.runId].status === 'running', `runs ${runs0}→${Object.keys(R.lab.runs).length}`);
  for (const l of lots('coir_fiber_bundle').filter((l) => l.location === 'site:husk-work')) delete R.lab.lots[l.lotId];
  const back = now; step(2);
  const fr2 = R.lab.runs[run.runId].state.data.frames, one = fr2.find((x: any) => x.fromWorldMs === from);
  want('3 the roof\'s time across the load: one span, from the last confirmed moment to the first one back', !!one && one.toWorldMs >= back, one ? `${Math.round((one.toWorldMs - one.fromWorldMs) / 60e3)} min` : `(no span from ${from})`);
  step(Math.ceil(islandWait(3.1 * 86400e3) / 1000), () => projectCordWork(R.lab, run.runId).status === 'completed');
  const dried = lots('coir_fiber_bundle')[0];
  want('3 dried: the bundle back under the eaves, drier', projectCordWork(R.lab, run.runId).status === 'completed' && !!dried && dried.quality.water_mg < WET, `${projectCordWork(R.lab, run.runId).status}`);
}
{ // 4
  for (let k = 0; k < 3; k++) await choose('cord:twist:pot', () => lots('coir_strand').length === k + 1);
  want('4 three strands of the pot\'s length twisted at the worksite', lots('coir_strand').length === 3 && lots('coir_strand').every((l) => l.location === 'site:cord-work'), lots('coir_strand').map((l) => l.location).join(','));
  const strands = lots('coir_strand').map((l) => l.lotId);
  await choose('cord:ply', () => lots('coir_rope').length === 1);
  want('4 plied into a rope', lots('coir_rope').length === 1 && lots('coir_strand').length === 0, `${lots('coir_rope').length} rope`);
  const sunBefore = records().filter((x: any) => x.request.event.kind === 'exposure' && strands.includes(x.request.lotId));
  want('4 the strands\' sun sent before they were plied (out by the bench: not in the shade)', sunBefore.length >= 2 && sunBefore.every((x: any) => x.request.event.shade === false), sunBefore.map((x: any) => `${x.request.lotId}:${x.request.event.shade}`).join(','));
}
{ // 5
  addLot(R.lab, { materialId: 'fired_pot', amount: { value: POT, unit: 'mg' }, location: 'shelf', quality: { form: 7, capacity_ml: 900, history_complete: 1 } });
  rememberLedgerMarkers(R.lab);
  const rope = lots('coir_rope')[0].lotId;
  await choose('cord:hang', () => !!R.village.cordHost.hang);
  const loads = () => records().filter((x: any) => x.request.event.kind === 'load');
  want('5 hung: the pot\'s weight from the ledger, sent as a load, once', loads().length === 1 && loads()[0].request.event.gf === Math.ceil(POT / 1000) && said(/鍋を縄で軒下に吊るした/), `${loads().map((x: any) => x.request.event.gf).join(',')}`);
  const n = records().length, again = applyCordLoad(R.lab, loads()[0].request);
  want('5 the same load sent again: the same record, nothing doubled', records().length === n && again.runId === loads()[0].runId, `${n} → ${records().length}`);
  want('5 the first rope and the first pot hung marked as the island\'s firsts (world/milestones.ts)', R.village.firsts?.rope > 0 && R.village.firsts?.hang > 0, JSON.stringify(R.village.firsts));
  want('5 the rope that held keeps its lotId', R.village.cordHost.hang?.cordLotId === rope && !!R.lab.lots[rope], rope);
  addLot(R.lab, { materialId: 'process_water', amount: { value: WATER, unit: 'mg' }, location: R.village.cordHost.hang.potLotId });
  rememberLedgerMarkers(R.lab);
  step(3);
  want('5 water in the pot: the heavier weight a new load', loads().length === 2 && loads()[1].request.event.gf === Math.ceil((POT + WATER) / 1000), loads().map((x: any) => x.request.event.gf).join(','));
  const sun = () => records().filter((x: any) => x.request.event.kind === 'exposure' && x.request.lotId === rope);
  want('5 the rope\'s sun sent before the new weight, under the eaves (and, if any time had passed, before it was carried from the bench)', sun().length >= 1 && sun().at(-1).request.event.shade === true && sun().slice(0, -1).every((x: any) => x.request.event.shade === false), sun().map((x: any) => `${x.request.event.shade}`).join(','));
  const n5 = sun().length; step(3 * 3600);
  want('5 three hours hanging, nothing else: no sun sent (once a day at most, or before a load or a move)', R.village.cordHost.hang?.cordLotId !== rope || sun().length === n5, `${n5} → ${sun().length}${R.village.cordHost.hang ? '' : ' (taken down meanwhile)'}`);
  if (R.village.cordHost.hang) {
    const n = sun().length, w = R.cordHost.unhang('dot', now), potId = Object.values(R.lab.lots).find((l: any) => l.materialId === 'fired_pot')!;
    want('5 the pot taken down to the shelf, the rope with it, its sun sent first', !!w && !R.village.cordHost.hang && (potId as any).location === 'shelf' && R.lab.lots[rope].location === 'shelf' && sun().length === n + 1 && sun().at(-1).request.event.shade === true, `${w}`);
    // (hung again, the same pot on the same rope: a new hanging, its own load; a refusal not tried again)
    now += 60e3; step(1);
    const loads0 = loads().length, dev0 = R.cordDev.length, again = R.cordHost.hang('dot', now);
    want('5 taken down and hung again, the same pot on the same rope: the second hanging\'s load is sent', !!again && R.village.cordHost.hang?.cordLotId === rope && loads().length === loads0 + 1 && loads().at(-1).request.event.gf === Math.ceil((POT + WATER) / 1000) && R.cordDev.length === dev0, `${again} loads ${loads0}→${loads().length} refusals ${R.cordDev.slice(dev0).map((d: any) => d.code).join(',')}`);
    const h = R.village.cordHost.hang, dev1 = R.cordDev.length, n1 = records().length;
    R.lab.lots[rope].reservedBy = 'run:test'; h.maxGf = 0;   // (the rope in use elsewhere for a moment: a load on it refused)
    step(5); delete R.lab.lots[rope].reservedBy;
    want('5 a load refused is not sent again and again: tried once, then left (the developer\'s log has it once)', R.cordDev.length - dev1 === 1 && records().length === n1 && h.maxGf === Math.ceil((POT + WATER) / 1000), `refusals ${R.cordDev.length - dev1} (${R.cordDev.slice(dev1).map((d: any) => d.code).join(',')}), records ${n1}→${records().length}`);
  }
}
{ // 6
  const p = writeCordPiece({ lotId: 'x', material: 'coir_rope', fiberDryMg: 30_000, pithDryMg: 1_000, waterMg: 1_000, lengthMm: 1_800, baseStrengthGf: 30_000, damage: { sunMs: 0, shadeMs: 0, abrasions: 0 } }, 'shelf', 1);
  const weak = addLot(R.lab, { materialId: p.materialId, amount: p.amount, location: 'shelf', quality: p.quality }).lotId;
  R.village.raft.parts = 6; R.village.raft.x = dot().pos.x; R.village.raft.z = dot().pos.z;
  const H = R.cordHost, w = H.lash('dot', now);
  want('6 the raft lashed with the long rope', !!w && R.village.cordHost.raft?.cordLotId === weak && R.lab.lots[weak].location === 'site:raft', `${w} ${R.village.cordHost.raft?.cordLotId}`);
  H.voyageOut(now); now += 60e3; H.tick(now, 7.3); now += 60e3; H.tick(now, 5.1);
  const said6 = H.voyageHome(now), raftLoads = records().filter((x: any) => x.request.lotId === weak && x.request.event.kind === 'load');
  want('6 home: the crossing\'s load from its strongest wind', raftLoads.length === 1 && raftLoads[0].request.event.gf === 20_000 + 4_000 * 8, raftLoads.map((x: any) => x.request.event.gf).join(','));
  want('6 the weak rope gave: two new pieces, the old id gone, the raft unlashed; told in words', !R.lab.lots[weak] && raftLoads[0].lotIds.length === 2 && raftLoads[0].lotIds.every((id: string) => R.lab.lots[id]?.location === 'ground') && !R.village.cordHost.raft && /切れた/.test(said6 ?? ''), `${raftLoads[0]?.lotIds.join(',')} / ${said6}`);
}
for (const d of R.cordDev) allCodes.add(d.code);
{ // 7
  R.save();
  const d = dot(), diary = JSON.stringify(d.diary), minds = JSON.stringify(inputs), saved = store.get(KEY) ?? '';
  const mem = JSON.stringify({ minds: JSON.parse(saved).minds, list: JSON.parse(saved).list });
  const prompts: string[] = [];
  await writePost({ who: 'dot', name: d.v.name, profile: 'テスト', day: '2026-10-06', entries: d.diary.map((e: any) => ({ time: '12:00', text: e.text, key: e.key })), photos: [], talks: [] }, async (sys: string, user: string) => { prompts.push(sys + user); return null; }, 'stub');
  const codes = [...allCodes], leaks = (t: string) => [...MARKS.filter((m) => new RegExp(`(?<![\\d.])${m}(?![\\d.])`).test(t)), ...codes.filter((c) => t.includes(c))];   // (a number on its own, not a piece of a time or a place)
  want('7 (the marker inputs really entered the ledger, the developer\'s log a code)', MARKS.slice(0, 5).every((m) => ledgerMarkers.has(m)) && codes.length > 0, codes.join(','));
  want('7 no amount or code in its diary, its mind\'s input, the day\'s post prompt or its saved memory', [diary, minds, prompts.join(''), mem].every((t) => leaks(t).length === 0), [diary, minds, prompts.join(''), mem].map(leaks).map((x) => x.join('|')).join(' / '));
  const cordOpts = [...new Map(inputs.flatMap((i) => i.options ?? []).filter((o: any) => o.id.startsWith('cord:')).map((o: any) => [o.id, o])).values()] as any[];
  want('7 no number in any cord option it was offered, all along', cordOpts.length >= 6 && cordOpts.every((o) => !/[0-9０-９]/.test(o.id + o.label)), cordOpts.map((o) => o.label).join(' / '));
  want('7 the cord\'s words in its diary', said(/繊維の束を軒下に広げた/) && said(/鍋を縄で軒下に吊るした/), d.diary.filter((e: any) => /繊維|縄|撚/.test(e.text)).slice(-6).map((e: any) => e.text).join(' / '));
}
want('8 completed load runs do not accumulate in the world ledger',
  !Object.values(R.lab.runs).some((run: any) => run.processId === 'prototype_coir_cord_load'));
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
