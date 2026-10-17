// Headless check (the residents' hands on the coconut husk, 2026-10-17: robots/husk-host.ts wired to the science side's
// soaking and separating). Test data only, in a stand-in localStorage; Dot's mind a stand-in that picks the step named.
//  1 the options: the husk's hand actions offered when the materials and places allow, set among the rest; their order
//    seeded by the island, the one deciding and the moment (the same moment, the same order) — not the work's order
//  2 the husks put in the tide pool from the shelf, when Dot is there: a soaking run; the pool's time confirmed as it passes
//  3 taken out too early and tried: "殻が硬く、ほぐれない" as felt, only because it was there and tried; the science
//    side's code in the developer's log only
//  4 soaked five island days, taken out, beaten: the husk comes apart into a fibre bundle at the worksite
//  5 stopped half way (another task), saved and loaded an hour later: no work counted for the time away; resumed, it is finished
//  7 a place full is not offered (the pool with husks in it, the worksite with another's hands at a husk); what lies in
//    the pool is seen only by one standing at it (presence 'here'), noted once as it changes
//  8 the hours caught up on by habit after a load do no hand work: nothing put in, taken out or beaten, no work counted;
//    the pool's time across the load is sent as one span, from the last confirmed moment to the first one back
//  6 nothing a resident is told carries the amounts (marker masses) or a code: not its diary, not what its mind is
//    given, not the day's post prompt, not its saved memory
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/husk-host-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { makeHuskHost, emptyHuskHostState } from '../src/robots/husk-host';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather, islandWeather, islandWait } from '../src/world/island-time';
import { addLot, emptyLedger } from '../src/world/process-runner';
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
const MASS = 2_400_017, MARKS = ['2400017', '720005', '1680012', '840006', '360003', '360002'];   // (water 30 %: about 0.43 of the dry, as a freshly split husk)
const inputs: any[] = [], allCodes = new Set<string>();   // (codes from every island of the check: the developer's log is not saved)
let pick: string | null = null;
const make = () => {
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  R.setBrain(async (i: any) => { inputs.push(i); if (i.who !== 'dot' || !pick) return null; const p = pick; pick = null; return { goal: { text: 'テスト', why: 'テスト' }, plan: [p] }; });
  return R;
};
let R: any = make();
const dot = () => R.list.find((r: any) => r.id === 'dot');
const lots = (m: string) => Object.values(R.lab.lots).filter((l: any) => l.materialId === m) as any[];
const runsOf = (p: string) => Object.values(R.lab.runs).filter((r: any) => r.processId === p) as any[];
const step = (secs: number, until?: () => boolean) => { for (let i = 0; i < secs; i++) { now += 1000; R.update(1, now, new THREE.Vector3(0, 50, 0)); if (i % 60 === 0) R.setWeather(islandWeather(now)); for (const r of R.list) if (!r.sp.living) { r.battery = 1; r.hunger = 0.2; } if (until?.()) return true; } return false; };
const choose = async (id: string, until: () => boolean, secs = 3600) => {
  pick = id; const a = R.mind(dot()); a.why = 'テスト'; a.lastCall = -1e12;
  for (let i = 0; i < secs; i++) { step(1); await Promise.resolve(); await Promise.resolve(); if (until()) return true; }
  return false;
};
const said = (re: RegExp) => dot().diary.some((d: any) => re.test(d.text));
const husk = () => addLot(R.lab, { materialId: 'coconut_husk', amount: { value: MASS, unit: 'mg' }, location: 'shelf', quality: { count: 2, water_ppm: 300_000, ash_dry_ppm: 20_000, history_complete: 1 } });

{ // 1
  const L = emptyLedger('w', '1'), state = emptyHuskHostState();
  addLot(L, { materialId: 'coconut_husk', amount: { value: MASS, unit: 'mg' }, location: 'shelf', quality: { count: 2, water_ppm: 300_000, ash_dry_ppm: 20_000, history_complete: 1 } });
  const host = (s: any) => makeHuskHost({ lab: L, state: () => s, dev: [], placeSites: () => ({ pool: { id: 'p', x: 0, z: 0 }, work: { id: 'w', x: 1, z: 0, reachM: 2 } }) });
  const a = host(structuredClone(state)).options('dot', 1000).map((o) => o.id), b = host(structuredClone(state)).options('dot', 1000).map((o) => o.id);
  want('1 only what the materials allow: with husks on the shelf, putting them in the pool', a.join() === 'soak:pool' && b.join() === a.join(), a.join());
  husk(); step(5);
}
{ // 2
  const n0 = inputs.length, ok = await choose('soak:pool', () => runsOf('prototype_husk_soak').length > 0 && said(/潮だまり/));
  const opts = inputs.slice(n0).find((i) => i.who === 'dot' && i.options.some((o: any) => o.id === 'soak:pool'))?.options ?? [];
  want('1 Dot is offered the husk among its other options (nothing it cannot do yet: no beating, no taking out)', opts.length > 2 && !opts.some((o: any) => ['beat:husk', 'takeout:pool', 'clear:husk'].includes(o.id)), opts.map((o: any) => o.id).slice(0, 14).join(','));
  const run = runsOf('prototype_husk_soak')[0], lot = lots('coconut_husk')[0];
  want('2 put in the tide pool when Dot was there: a soaking run, the husks at the pool', ok && run?.status === 'running' && lot?.location === 'site:husk-pool' && lot.reservedBy === run.runId, `${run?.status} ${lot?.location}`);
  const extra = husk(), o7 = R.huskHost.options('dot', now).map((o: any) => o.id); delete R.lab.lots[extra.lotId];
  want('7 the pool full (husks soaking in it): putting more in not offered, with husks still on the shelf', !o7.includes('soak:pool') && o7.includes('takeout:pool'), o7.join(','));
  step(2);
  const p = R.huskHost.sites().pool, at = Math.hypot(dot().pos.x - p.x, dot().pos.z - p.z);
  want('7 standing at the pool: what it sees of the husks, in words', at > 3 || said(/潮だまりの殻を見た：(殻は水を含み、重い|まだ硬く、乾いている|殻が水を吸って重くなってきた)$/), `${at.toFixed(1)} m; ${dot().diary.filter((e: any) => /潮だまりの殻を見た/.test(e.text)).map((e: any) => e.text).join(' / ')}`);
  step(600);
  const fr = R.lab.runs[run.runId].state.data.frames;
  want('2 the pool\'s time confirmed as it passes', (fr?.length ?? 0) > 0, `${fr?.length} spans`);
}
{ // 3
  await choose('takeout:pool', () => lots('wet_unseparated_coconut_husk').length === 2);
  want('3 taken out early: two husks, one by one', lots('wet_unseparated_coconut_husk').length === 2 && said(/浸けた殻を引き上げた/), lots('wet_unseparated_coconut_husk').map((l) => l.location).join(','));
  const dev0 = R.huskDev.length;
  await choose('beat:husk', () => said(/殻が硬く、ほぐれない/), 600);
  want('3 tried at the worksite, too little soaked: what it felt, from the science side\'s own words', said(/殻が硬く、ほぐれない/) && R.huskDev.length > dev0, `${R.huskDev.slice(dev0).map((d: any) => d.code).join(',')}`);
}
for (const d of R.huskDev) allCodes.add(d.code);
// (afresh, for the full course: a new island with its husks)
store.clear(); inputs.length = 0; now = Date.parse('2026-10-06T21:00:00Z'); Math.random = mulberry32(7); R = make(); husk(); step(5);   // (6:00 on the island: the taking out and the beating fall in the afternoon)
{ // 4
  await choose('soak:pool', () => runsOf('prototype_husk_soak').length > 0);
  const soakId = runsOf('prototype_husk_soak')[0].runId, half = Math.ceil(islandWait(2.6 * 86400e3) / 1000);
  step(half);
  // (saved and loaded three hours later: the hours caught up on by habit)
  const shelf0 = lots('coconut_husk').filter((l) => l.location === 'shelf').length;
  addLot(R.lab, { materialId: 'coconut_husk', amount: { value: MASS, unit: 'mg' }, location: 'shelf', quality: { count: 2, water_ppm: 300_000, ash_dry_ppm: 20_000, history_complete: 1 } });
  R.save(); const s8 = JSON.parse(store.get(KEY)!), from8 = s8.village.huskHost.soak[soakId], runs8 = Object.keys(s8.lab.runs).length;
  now += 3 * 3600e3; R = make();
  want('8 caught up on by habit: no hand work — nothing put in, taken out or started, the husks where they were', Object.keys(R.lab.runs).length === runs8 && R.lab.runs[soakId].status === 'running' && lots('coconut_husk').filter((l) => l.location === 'shelf').length === shelf0 + 1 && R.huskDev.length === 0, `runs ${runs8}→${Object.keys(R.lab.runs).length}, ${R.lab.runs[soakId].status}, on the shelf ${lots('coconut_husk').filter((l) => l.location === 'shelf').length}, refusals ${R.huskDev.map((d: any) => d.code).join(',')}`);
  for (const l of lots('coconut_husk').filter((l) => l.location === 'shelf')) delete R.lab.lots[l.lotId];
  const back = now; step(2);
  const fr8 = R.lab.runs[soakId].state.data.frames, one = fr8.find((f: any) => f.fromWorldMs === from8);
  want('8 the pool\'s time across the load: one span, from the last confirmed moment to the first one back', !!one && one.toWorldMs >= back && fr8.filter((f: any) => f.fromWorldMs < back && f.toWorldMs > from8 + 1000).length === 1, one ? `${Math.round((one.toWorldMs - one.fromWorldMs) / 60e3)} min` : `(no span from ${from8})`);
  step(Math.ceil(islandWait(2.6 * 86400e3) / 1000) - half);
  { // (seen only from the pool: away, nothing; there, what it sees now)
    const p = R.huskHost.sites().pool, d = dot(), n0 = d.diary.length;
    delete R.village.huskHost.looked.dot;   // (as if it had not looked since: it may have passed by the pool on the way)
    d.task = null; d.pos.x = p.x + 20; d.pos.z = p.z; step(3);
    const away = d.diary.slice(n0).filter((e: any) => /潮だまりの殻を見た/.test(e.text));
    d.task = null; d.pos.x = p.x + 0.5; d.pos.z = p.z; step(2);
    const there = d.diary.slice(n0).filter((e: any) => /潮だまりの殻を見た/.test(e.text));
    want('7 away from the pool nothing seen of it; at it, how the husks are now', away.length === 0 && there.some((e: any) => /水を吸って重くなってきた/.test(e.text)), there.map((e: any) => e.text).join(' / '));
  }
  await choose('takeout:pool', () => lots('wet_unseparated_coconut_husk').length === 2);
  await choose('beat:husk', () => lots('coir_fiber_bundle').length > 0);
  const fb = lots('coir_fiber_bundle')[0];
  want('4 soaked five island days, taken out, beaten: a fibre bundle at the worksite', !!fb && fb.location === 'site:husk-work', `${fb?.location}`);
  const site = R.worksiteLooks().find((x: any) => x.siteId === 'site:husk-work');
  want('4 drawn at the worksite: the beating board (a husk was beaten there), the fibre bundle on it', site?.fixtures.some((x: any) => x.kind === 'beat-board') && site.items.some((x: any) => x.kind === 'fiber-bundle'), JSON.stringify(site));
}
{ // 5
  await choose('beat:husk', () => runsOf('prototype_manual_husk_work').some((r) => ['running', 'starting'].includes(r.status)) && dot().task?.data?.engaged, 600);
  step(60);
  const run = runsOf('prototype_manual_husk_work').find((r) => ['running', 'starting'].includes(r.status));
  const wet = addLot(R.lab, { materialId: 'wet_unseparated_coconut_husk', amount: { value: MASS, unit: 'mg' }, location: 'site:husk-pool', quality: { water_ppm: 600_000, history_complete: 1 } });
  const o7 = R.huskHost.options('lantern', now).map((o: any) => o.id), mine = R.huskHost.options('dot', now).map((o: any) => o.id); delete R.lab.lots[wet.lotId];
  want('7 the worksite taken (Dot\'s hands at a husk): beating or clearing not offered to another, a wet husk free all the same', !o7.includes('beat:husk') && !o7.includes('clear:husk') && mine.includes('beat:husk'), `lantern ${o7.join(',') || '(none)'}; dot ${mine.join(',')}`);
  dot().task = null;   // (called away: another task)
  step(2);
  const job = () => R.lab.manualHuskArrangement.jobs.find((j: any) => j.runId === run.runId);
  const kinds = () => job()?.controls.map((c: any) => c.kind) ?? [];
  want('5 stopped half way: the stop told (its mind may take it up again at once), the husk kept', !!run && kinds().indexOf('stop') > kinds().indexOf('start') && kinds().indexOf('start') === 0, kinds().join(','));
  R.save(); const s = store.get(KEY)!;
  now += 3600e3; R = make();
  const j2 = R.lab.manualHuskArrangement.jobs.find((j: any) => j.runId === run.runId);
  want('5 saved and loaded an hour later: paused (its hands left the husk at the load), no work counted for the time away', ['stop', 'restore'].includes(j2?.controls.at(-1).kind) && JSON.parse(s).lab.runs[run.runId].state.data.science.totalWorkMs === R.lab.runs[run.runId].state.data.science.totalWorkMs, j2?.controls.map((c: any) => c.kind).join(','));
  await choose('beat:husk', () => R.lab.runs[run.runId].status === 'completed');
  want('5 resumed: the second husk finished', R.lab.runs[run.runId].status === 'completed' && lots('coir_fiber_bundle').length === 2, `${R.lab.runs[run.runId].status} bundles ${lots('coir_fiber_bundle').length}`);
}
{ // 6
  const d = dot(), diary = JSON.stringify(d.diary), minds = JSON.stringify(inputs), saved = store.get(KEY) ?? '';
  const mem = JSON.stringify({ minds: JSON.parse(saved).minds, list: JSON.parse(saved).list });
  const prompts: string[] = [];
  await writePost({ who: 'dot', name: d.v.name, profile: 'テスト', day: '2026-10-06', entries: d.diary.map((e: any) => ({ time: '12:00', text: e.text, key: e.key })), photos: [], talks: [] }, async (sys: string, user: string) => { prompts.push(sys + user); return null; }, 'stub');
  for (const x of R.huskDev) allCodes.add(x.code); const codes = [...allCodes];
  const leaks = (t: string) => [...MARKS.filter((m) => t.includes(m)), ...codes.filter((c) => t.includes(c))];
  want('6 (the markers are real: the world\'s own ledger holds them, and the developer\'s log holds a code)', MARKS.some((m) => JSON.stringify(JSON.parse(saved).lab).includes(m)) && codes.length > 0, codes.join(','));
  want('6 no amount or code in its diary, its mind\'s input, the day\'s post prompt or its saved memory', [diary, minds, prompts.join(''), mem].every((t) => leaks(t).length === 0), [diary, minds, prompts.join(''), mem].map(leaks).map((x) => x.join('|')).join(' / '));
  want('6 the husk\'s words in its diary', said(/潮だまり/) && said(/ほぐれた繊維が束になっている|殻には繊維の筋/), d.diary.filter((e: any) => /殻|繊維/.test(e.text)).slice(-4).map((e: any) => e.text).join(' / '));
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
