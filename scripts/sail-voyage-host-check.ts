// Headless check (the raft under sail, 2026-10-19: robots/sail-voyage-host.ts wired to the science side's sail voyage).
// Test data only, in a stand-in localStorage; Dot's mind a stand-in that picks the step named.
//  1 the rigging offered once a raft stands and a whole mat, a whole mast and cords enough lie free; no number in it
//  2 rigged by the raft over two quarter hours of Dot's hands; the parts laid by the raft, the cords' sun sent first
//  3 a crossing with the raft rigged goes under sail: the cords' sun sent through to the moment it sets off (rule 1),
//    a cell every 30 s of the world's clock, the raw record's weather through the science side's conversion
//  4 home: settled; the rig taken apart with the same lots (mat, mast, cords), laid by the raft, still rigged; the
//    cords' sun counted by cord-host from the settling (rule 2); the voyage's cord summary in the cords' record; no load
//    of the cord's own on the raft's lashing; what it saw aboard in its diary; the island's firsts
//  5 closed at sea: on loading, the crossing ends where it was last confirmed — no motion made up, no run left
//  7 every crossing in reach comes home: by paddle and under sail, 1.0–4.0 km, five bearings (science review B1)
//  6 nothing a resident is told carries the amounts (marker masses) or a code
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/sail-voyage-host-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { loadIslandWeather, islandWeather, islandWait } from '../src/world/island-time';
import { addLot, toClock, emptyLedger } from '../src/world/process-runner';
import { makeSailVoyageHost } from '../src/robots/sail-voyage-host';
import { emptySailHostState } from '../src/robots/sail-host';
import { writeSailMat, writeBambooMast } from '../src/world/sail-lots';
import { writeCordPiece } from '../src/world/coir-cord-lots';
import { writePost } from '../src/journal/write';

let now = Date.parse('2026-10-06T01:00:00Z');   // (10:00 on the island: after the morning gathering)
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
const MAST_DRY = 2_083_687, MAST_WATER = 800_009, FIBER = 30_011, MARKS = ['2083687', '800009', '30011'];
const inputs: any[] = [], allCodes = new Set<string>();
let pick: string | null = null;
const make = () => {
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  R.setBrain(async (i: any) => { inputs.push(i); if (i.who !== 'dot' || !pick) return null; const p = pick; pick = null; return { goal: { text: 'テスト', why: 'テスト' }, plan: [p] }; });
  R.list.find((r: any) => r.id === 'dot').stats.built = 99;
  return R;
};
let R: any = make();
const dot = () => R.list.find((r: any) => r.id === 'dot');
const lots = (m: string) => Object.values(R.lab.lots).filter((l: any) => l.materialId === m) as any[];
const voyageRuns = () => Object.values(R.lab.runs).filter((r: any) => r.processId === 'prototype_sail_voyage') as any[];
const step = (secs: number, until?: () => boolean) => { for (let i = 0; i < secs; i++) { now += 1000; R.update(1, now, new THREE.Vector3(0, 50, 0)); if (i % 60 === 0) R.setWeather(islandWeather(now)); for (const r of R.list) if (!r.sp.living) { r.battery = 1; r.hunger = 0.2; r.sleepy = 0; } if (until?.()) return true; } return false; };
const choose = async (id: string, until: () => boolean, secs = 3600) => {
  pick = id; const a = R.mind(dot()); a.why = 'テスト'; a.lastCall = -1e12;
  for (let i = 0; i < secs; i++) { step(1); await Promise.resolve(); await Promise.resolve(); if (until()) return true; }
  return false;
};
const said = (re: RegExp) => dot().diary.some((d: any) => re.test(d.text));
const options = async () => {
  const n0 = inputs.length; { const a = R.mind(dot()); a.why = 'テスト'; a.lastCall = -1e12; }
  for (let i = 0; i < 3600 && !inputs.slice(n0).some((x) => x.who === 'dot'); i++) { step(1); await Promise.resolve(); await Promise.resolve(); }
  step(60);
  return (inputs.slice(n0).find((i) => i.who === 'dot')?.options ?? []);
};
const cordRecords = () => Object.values(R.lab.coirCordLoads?.cords ?? {}).flatMap((c: any) => c.recent.map((x: any) => x.request));
const island = (ms: number) => Math.round(toClock('island', ms));
const put = (p: { materialId: string; amount: any; into?: string; quality?: any }) => addLot(R.lab, { materialId: p.materialId, amount: p.amount, location: 'shelf', quality: p.quality }).lotId;

step(5);
R.village.raft.parts = 6; R.village.raft.x = dot().pos.x + 3; R.village.raft.z = dot().pos.z;
R.village.map.seen['south-near'] = { word: 'テスト島', at: now };
{ // 1
  const o0 = (await options()).filter((o: any) => o.id === 'sail:rig');
  want('1 no mat, mast or cords yet: no rigging offered', o0.length === 0);
  const mat = put(writeSailMat({ lotId: 'x', material: 'sail_mat', dryMg: 900_000, waterMg: 50_000, areaCm2: 20_000, baseStrengthGf: 60_000, torn: false, damage: { sunMs: 0, shadeMs: 0, rainMs: 0 } }, 'shelf', 1));
  const mast = put(writeBambooMast({ lotId: 'x', material: 'bamboo_mast', dryMg: MAST_DRY, waterMg: MAST_WATER, lengthMm: 2500, baseStrengthGf: 40_000, broken: false }, 'shelf', 1));
  const cords = [0, 1, 2, 3].map(() => put(writeCordPiece({ lotId: 'x', material: 'coir_strand', fiberDryMg: FIBER, pithDryMg: 1_000, waterMg: 1_000, lengthMm: 2_000, baseStrengthGf: 400_000, damage: { sunMs: 0, shadeMs: 0, abrasions: 0 } }, 'shelf', 1)));
  R.parts = { mat, mast, cords };
  step(120);   // (the cords seen by cord-host: their sun counted from here)
  const o1 = (await options()).filter((o: any) => o.id.startsWith('sail:rig'));
  want('1 a whole mat, a whole mast and cords enough: the rigging offered, no number in it', o1.length === 1 && !/[0-9０-９]/.test(o1[0].id + o1[0].label), o1.map((o: any) => o.label).join(','));
}
{ // 2
  const { mat, mast, cords } = R.parts, sun0 = cordRecords().length;
  for (let k = 0; k < 4 && !R.village.sailHost.rig?.done; k++) { let began = false; await choose('sail:rig', () => { if (dot().task?.kind === 'sail-rig') began = true; return R.village.sailHost.rig?.done || (began && dot().task?.kind !== 'sail-rig'); }, 2400); }
  const g = R.village.sailHost.rig;
  want('2 rigged by the raft with Dot\'s hands (half an hour, in quarter hours)', !!g?.done && g.lotIds.join() === [mat, mast, ...cords].join() && g.lotIds.every((id: string) => R.lab.lots[id]?.location === 'site:raft') && said(/筏に帆とマストを取りつけた/), `${g?.workMs} ${g?.lotIds.length}`);
  const sent = cordRecords().slice(sun0).filter((q: any) => cords.includes(q.lotId) && q.event.kind === 'exposure');
  want('2 the cords\' sun sent before they were carried to the raft', sent.length === 4, `${sent.length}`);
  want('2 rigged: not offered again', !(await options()).some((o: any) => o.id === 'sail:rig'));
}
{ // 3
  const { cords } = R.parts, n0 = cordRecords().length;
  { // (ashore: the raft's place in the window where the raft is drawn — 1.2 m seaward of its ledger place — rigged)
    const spot = R.worksiteSpots()['site:raft'], look = R.worksiteLooks().find((x: any) => x.siteId === 'site:raft');
    want('3 ashore: the raft in the window where it is drawn, rigged', !!spot && Math.abs(spot.x - (R.village.raft.x + 1.2)) < 1e-9 && spot.z === R.village.raft.z && look?.fixtures[0]?.look === 'rigged', JSON.stringify(spot));
  }
  let departAt = 0;
  await choose('voyage:south-near', () => { if (!departAt && R.village.sailHost.voyage) departAt = now; return !!R.village.sailHost.voyage; }, 1200);
  const v = R.village.sailHost.voyage, run = v && R.lab.runs[v.runId];
  want('3 set off under sail: a voyage run with the rig, Dot aboard', !!run && run.processId === 'prototype_sail_voyage' && run.operator === 'dot' && said(/帆を張った筏でテスト島へ出た/), `${v?.runId}`);
  const last = cords.map((id: string) => Math.max(...cordRecords().filter((q: any) => q.lotId === id && q.event.kind === 'exposure').map((q: any) => q.islandAtMs)));
  want('3 rule 1: the cords\' sun sent through to the moment it set off', last.every((t: number) => t === island(departAt)), last.map((t: number) => t - island(departAt)).join(','));
  void n0;
  want('3 at sea: no raft in the window (its mast and sail are not left on the beach)', !R.worksiteSpots()['site:raft'] && !R.worksiteLooks().some((x: any) => x.siteId === 'site:raft'));
  step(300);
  const cells = R.village.sailHost.voyage?.n ?? 0;
  want('3 a cell every 30 s of the world\'s clock', cells >= 9 && cells <= 10, `${cells} cells in 300 s`);
}
let settleAt = 0;
{ // 4
  const { mat, mast, cords } = R.parts;
  const runId = R.village.sailHost.voyage?.runId;
  step(4 * 3600, () => { if (!R.village.sailHost.voyage) { settleAt = now; return true; } return false; });
  want('4 home again: the voyage settled, no run left', !R.village.sailHost.voyage && voyageRuns().length === 0 && (said(/テスト島にたどり着いて戻った/) || said(/テスト島への渡航を途中で引き返した/)), dot().diary.slice(-4).map((e: any) => e.text).join(' / '));
  const g = R.village.sailHost.rig, ids = [mat, mast, ...cords];
  want('4 the rig taken apart with the same lots, laid by the raft, still rigged', !!g?.done && g.lotIds.join() === ids.join() && ids.every((id) => R.lab.lots[id]?.location === 'site:raft') && Object.values(R.lab.equipment).every((e: any) => e.kind !== 'sail_rig'), `${g?.lotIds.join(',')}`);
  const summaries = cordRecords().filter((q: any) => q.commandId.startsWith(`voyage:${runId}:`));
  want('4 the voyage\'s cord summary written to each cord\'s record', summaries.length === 4 && summaries.every((q: any) => q.event.kind === 'voyage-summary'), `${summaries.length}`);
  const sun = R.village.cordHost.sun;
  want('4 rule 2: cord-host counts the cords\' sun from the settling', cords.every((id: string) => sun[id] === island(settleAt) || sun[id] === island(R.lab.sailVoyages.recent.at(-1).atWorldMs)), cords.map((id: string) => sun[id] - island(settleAt)).join(','));
  want('4 no load of the cord\'s own on the raft (the voyage counted the cords)', !cordRecords().some((q: any) => q.commandId.startsWith('raft:')));
  want('4 what it saw aboard in its diary', said(/^帆の筏：/), dot().diary.filter((e: any) => /^帆の筏/.test(e.text)).map((e: any) => e.text).join(' / '));
  want('4 the island\'s firsts: rigged, and (if it got there) a crossing under sail', typeof R.village.firsts?.rig === 'number' && (said(/テスト島への渡航を途中で引き返した/) || typeof R.village.firsts?.['sail-crossing'] === 'number'), JSON.stringify({ rig: R.village.firsts?.rig, crossing: R.village.firsts?.['sail-crossing'] }));
}
{ // 5
  delete R.village.map.reached['south-near'];
  now += 3600e3; step(60);
  await choose('voyage:south-near', () => !!R.village.sailHost.voyage, 1200);
  step(120);
  const v = R.village.sailHost.voyage, lastCell = v?.next.w, cords5 = [...(R.village.sailHost.rig?.lotIds ?? [])].slice(2);
  R.save(); for (const d of R.sailDev) allCodes.add(d.code); for (const d of R.cordDev) allCodes.add(d.code);
  now += 2 * 3600e3; R = make();
  want('5 closed at sea: on loading the crossing ended where it was last confirmed, no run left, the parts back by the raft', !!v && !R.village.sailHost.voyage && voyageRuns().length === 0 && said(/帆の筏での渡航は途中で終わった/) && Object.values(R.lab.equipment).every((e: any) => e.kind !== 'sail_rig'), dot().diary.slice(-2).map((e: any) => e.text).join(' / '));
  const last = R.lab.sailVoyages?.recent?.at(-1);
  want('5 no motion made up for the time away: settled at the last confirmed cell, not at the load', !!last && last.atWorldMs === lastCell, `${last && Math.round((now - last.atWorldMs) / 1000)} s before the load`);
  const sun5 = R.village.cordHost.sun;
  want('5 the cords\' sun counted by cord-host from that cell (the time closed is its usual span)', cords5.length === 4 && cords5.every((id: string) => sun5[id] === island(lastCell)), cords5.map((id: string) => sun5[id] - island(lastCell)).join(','));
}
for (const d of R.sailDev) allCodes.add(d.code); for (const d of R.cordDev) allCodes.add(d.code);
{ // 6
  R.save();
  const d = dot(), diary = JSON.stringify(d.diary), minds = JSON.stringify(inputs), saved = store.get(KEY) ?? '';
  const mem = JSON.stringify({ minds: JSON.parse(saved).minds, list: JSON.parse(saved).list });
  const prompts: string[] = [];
  await writePost({ who: 'dot', name: d.v.name, profile: 'テスト', day: '2026-10-06', entries: d.diary.map((e: any) => ({ time: '12:00', text: e.text, key: e.key })), photos: [], talks: [] }, async (sys: string, user: string) => { prompts.push(sys + user); return null; }, 'stub');
  const codes = [...allCodes], leaks = (t: string) => [...MARKS.filter((m) => new RegExp(`(?<![\\d.])${m}(?![\\d.])`).test(t)), ...codes.filter((c) => t.includes(c))];
  want('6 (the markers are real: the ledger holds them)', MARKS.slice(0, 2).every((m) => JSON.stringify(JSON.parse(saved).lab).includes(m)), codes.join(','));
  want('6 no amount or code in its diary, its mind\'s input, the day\'s post prompt or its saved memory', [diary, minds, prompts.join(''), mem].every((t) => leaks(t).length === 0), [diary, minds, prompts.join(''), mem].map(leaks).map((x) => x.join('|')).join(' / '));
}
{ // 7 (science review of PR #51, B1: every crossing in reach comes home — by paddle and under sail, 1.0–4.0 km, five bearings)
  const fails: string[] = [];
  for (const sailing of [false, true]) for (let km10 = 10; km10 <= 40; km10++) for (const bearing of [0, 77, 151, 221, 300]) {
    const L = emptyLedger('w', 'sweep'), st: any = { ...emptySailHostState() }, dev: any[] = [];
    const ids = [writeSailMat({ lotId: 'x', material: 'sail_mat', dryMg: 900_000, waterMg: 50_000, areaCm2: 20_000, baseStrengthGf: 60_000, torn: false, damage: { sunMs: 0, shadeMs: 0, rainMs: 0 } }, 'site:raft', 1),
      writeBambooMast({ lotId: 'x', material: 'bamboo_mast', dryMg: MAST_DRY, waterMg: MAST_WATER, lengthMm: 2500, baseStrengthGf: 40_000, broken: false }, 'site:raft', 1),
      ...[0, 1, 2, 3].map(() => writeCordPiece({ lotId: 'x', material: 'coir_strand', fiberDryMg: FIBER, pithDryMg: 1_000, waterMg: 1_000, lengthMm: 2_000, baseStrengthGf: 400_000, damage: { sunMs: 0, shadeMs: 0, abrasions: 0 } }, 'site:raft', 1))]
      .map((p) => addLot(L, { materialId: p.materialId, amount: p.amount, location: 'site:raft', quality: p.quality }).lotId);
    st.rig = { lotIds: ids, workMs: 1_800_000, done: true };
    const cordStub: any = { sunUpTo() {}, sunCountedTo() {}, busy: () => [] };
    const wx = sailing ? { windMeasured: 9, windDirMeasured: (bearing + 200) % 360, gustMeasured: 11, rainMeasured: 0 } : null;
    const H = makeSailVoyageHost({ lab: L, state: () => st, cord: cordStub, raftPieces: () => 6, raftWhole: () => true, weather: () => wx as any, hourNow: () => 10, islandWait, dev });
    let t = Date.parse('2026-10-06T01:00:00Z');
    if (!H.depart('dot', { km: km10 / 10, bearing }, t)) { fails.push(`${sailing ? 'sail' : 'paddle'} ${km10 / 10}km ${bearing}°: no departure ${dev.map((d) => d.code)}`); continue; }
    let home = false;
    for (let k = 0; k < 2000 && !home; k++) { t += 30_000; home = H.sail(t, false).home; }
    if (!home) fails.push(`${sailing ? 'sail' : 'paddle'} ${km10 / 10}km ${bearing}°`);
  }
  want('7 every crossing in reach comes home (paddle and sail, 1.0–4.0 km by 0.1, five bearings)', fails.length === 0, fails.slice(0, 6).join(' / ') || '310 crossings');
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
