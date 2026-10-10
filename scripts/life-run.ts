// Report (not a pass/fail check): the island from nothing, on the real island and its replayed weather, and how far its
// residents get on their own toward boiling coconut oil in a pot of their own — the day each step is first reached, and,
// where it stops, what is waiting for what. Dot's mind is a stand-in that takes the first ready step from a fixed order
// (the real mind chooses for itself; this finds where the world's own steps stall). Rakko and Lantern by their habits.
// Usage: DAYS=60 npx tsx --import ./scripts/node-assets.mjs scripts/life-run.ts
//   SNAP=40 SNAPFILE=/tmp/i.json: the island saved at day 40 to a file; FROM=/tmp/i.json: carried on from one (DAYS then
//   SNAPDIR=/dir: the island saved at each step reached, in daylight, for a digest film.
//   WHY=1: each failure as it happens, where. DAYS counts from the start of the first run, so DAYS=50 FROM=… runs days 40 to 50)
import './node-land';
import * as THREE from 'three';

const DAYS = Number(process.env.DAYS ?? 20);
let sim = Date.parse('2026-10-06T08:00:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
const { readFileSync, writeFileSync } = await import('node:fs');
const FROM = process.env.FROM ? JSON.parse(readFileSync(process.env.FROM, 'utf8')) : null;
if (FROM) { sim = FROM.sim; for (const [k, v] of FROM.store) store.set(k, v); }
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(Number(process.env.SEED ?? 1));
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const { loadIslandWeather, islandWeather, ISLAND_RATE } = await import('../src/world/island-time');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
await loadIslandWeather();
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const R: any = buildOcean(loc).residents, V = R.village, lab = R.lab;
const dot = R.list.find((r: any) => r.id === 'dot');
const ORDER = ['place:', 'take:', 'craft:', 'lash:', 'house:', 'wall:', 'wallfetch:', 'shelve:', 'find:', 'survey:', 'stow:', 'voyage:', 'twist:', 'cut:', 'harvest:', 'gather:', 'fell:', 'plant:', 'till:', 'chop:', 'charge:'];
R.setBrain(async (i: any) => {
  if (i.who !== 'dot') return null;
  // (a dry pot waiting and not wood enough for its fire — 45 kg green to stack, or 30 kg seasoned: the trees before the beach)
  const wood = (dry: boolean) => Object.values(lab.lots).filter((l: any) => l.materialId === 'firewood' && ((l.quality?.water_ppm ?? 1e6) <= 300_000) === dry).reduce((n: number, l: any) => n + l.amount.value, 0);
  const pot = Object.values(lab.lots).some((l: any) => l.materialId === 'dry_pot'), stacking = Object.values(lab.runs).some((x: any) => x.processId.includes('firewood') && x.status === 'running');
  if (pot && !stacking && wood(true) < 30e6 && wood(false) < 45e6) { const o = i.options.find((x: any) => x.id.startsWith('fell:') && x.ready !== false); if (o) return { goal: { text: '薪を集める', why: '器を焼く薪が足りない' }, plan: [o.id] }; }
  for (const p of ORDER) { const o = i.options.find((x: any) => x.id.startsWith(p) && x.ready !== false); if (o) return { goal: { text: '暮らしを進める', why: '順に' }, plan: [o.id] }; }
  return { goal: { text: '見回る', why: 'することがない' }, plan: ['look:shore'] };
});
const cam = new THREE.Vector3();
const t0 = FROM?.t0 ?? sim, dayOf = () => (sim - t0) / (86_400_000 / ISLAND_RATE);
const lots = (m: string) => Object.values(lab.lots).filter((l: any) => l.materialId === m) as any[];
const kg = (m: string) => lots(m).reduce((n, l) => n + l.amount.value, 0) / 1e6;
const lampLit = () => Object.values(lab.runs).some((x: any) => x.processId === 'p40x_oil_lamp' && x.status === 'running');
const marks: [string, () => boolean][] = [
  ['hut', () => dot.stats.built >= 24], ['raft', () => V.raft.parts >= 4], ['island reached', () => Object.keys(V.map.reached).length > 0],
  ['raw clay', () => kg('raw_clay') > 0], ['rain catcher', () => !!V.catcher], ['clay pit', () => !!V.clayPit], ['settled clay', () => lots('settled_clay').length > 0],
  ['prepared clay', () => lots('prepared_clay').length > 0], ['green pot', () => lots('green_pot').length > 0], ['dry pot', () => lots('dry_pot').length > 0],
  ['house walls', () => V.house.n >= 40], ['firewood 45 kg', () => kg('firewood') >= 45], ['woodpile roof', () => !!lab.equipment['eq:firewood_stack']],
  ['seasoned wood', () => lots('firewood').some((l) => (l.quality?.water_ppm ?? 1e6) <= 300_000)], ['pot fired', () => lots('fired_pot').length > 0 || !!lab.equipment['eq:cook_pot']],
  ['cook pot', () => !!lab.equipment['eq:cook_pot']], ['coconut milk', () => lots('coconut_milk').length > 0], ['coconut oil', () => lots('coconut_oil').length > 0],
  ['lamp dish', () => !!lab.equipment['eq:lamp_dish']], ['lamp lit', () => V.lampLog.length > 0 || lampLit()],
  ['retort', () => !!lab.equipment['eq:tar_retort']], ['wood tar', () => lots('wood_tar').length > 0], ['sealed jar', () => lots('fired_pot').some((l) => l.quality?.sealed === 1)],
];
const got: Record<string, number> = {};
const SNAPDIR = process.env.SNAPDIR, shots: string[] = SNAPDIR ? ['start'] : []; let nShot = 0;
const wall = Date.now.call(null), start = performance.now();
let lastLog = 0;
for (let i = 0; dayOf() < DAYS; i++) {
  sim += 1000; cam.set(dot.pos.x, 30, dot.pos.z);
  if (i % 60 === 0) R.setWeather(islandWeather(sim));
  R.update(1, sim, cam);
  if (i % 10 === 0) await Promise.resolve();
  if (process.env.WHY) for (const r of R.list) for (const e of r.diary.slice(-3)) if (/(道がなかった|進めなかった|できなかった|時間がかかりすぎた)/.test(e.text) && !(e as any).__seen && ((e as any).__seen = 1)) console.log('WHY', dayOf().toFixed(2), r.id, e.text, `at ${r.pos.x.toFixed(1)},${r.pos.z.toFixed(1)} y ${r.pos.y.toFixed(2)} hold ${r.holding || '-'} went ${r.went ?? '-'}`);
  if (process.env.SNAP && !(globalThis as any).__snapped && dayOf() >= +process.env.SNAP) { (globalThis as any).__snapped = 1; R.save(); writeFileSync(process.env.SNAPFILE ?? '/tmp/island.json', JSON.stringify({ sim, t0, store: [...store] })); console.log(`  (saved at day ${dayOf().toFixed(1)})`); }
  // (LITFILE=/tmp/l.json: the island saved the first evening its lamp burns, an hour after it was lit — to look at it)
  if (process.env.LITFILE && !(globalThis as any).__lit && lampLit()) (globalThis as any).__lit = sim;
  if (process.env.LITFILE && (globalThis as any).__lit > 0 && sim - (globalThis as any).__lit >= 3.6e6) { (globalThis as any).__lit = -1; R.save(); writeFileSync(process.env.LITFILE, JSON.stringify({ sim, t0, day: dayOf(), marks: ['lamp lit'], store: [...store] })); console.log(`  (lamp: saved at day ${dayOf().toFixed(1)})`); }
  if (i % 600 === 0) for (const [k, f] of marks) if (got[k] === undefined && f()) { got[k] = dayOf(); console.log(`day ${dayOf().toFixed(1)}: ${k}`); if (SNAPDIR) shots.push(k); }
  // (SNAPDIR: the island saved at each step reached, at the next hour of good light — for a digest, scripts/digest-shots.mjs)
  if (SNAPDIR && i % 600 === 0 && shots.length) { const hr = ((sim / 3.6e6 + 9) % 24 + 24) % 24; if (hr >= 10 && hr <= 15) { R.save(); const k = shots.join('+'); writeFileSync(`${SNAPDIR}/${String(nShot++).padStart(2, '0')}-${shots[0].replace(/\s+/g, '-')}.json`, JSON.stringify({ sim, t0, day: dayOf(), marks: shots, store: [...store] })); console.log(`  (saved ${k} at day ${dayOf().toFixed(1)})`); shots.length = 0; } }
  if (dayOf() - lastLog >= 5) { lastLog = dayOf(); console.log(`  … day ${dayOf().toFixed(0)} (${((performance.now() - start) / 1000).toFixed(0)} s) dot ${dot.task?.kind ?? '-'} built ${dot.stats.built} house ${V.house.n} shelf ${[...new Set(Object.values(lab.lots).map((l: any) => l.materialId))].join(',')}`); }
}
void wall;
console.log('\n— reached —'); for (const [k] of marks) console.log(`  ${k}: ${got[k] !== undefined ? 'day ' + got[k].toFixed(1) : 'not yet'}`);
console.log('— where it stands —');
console.log('  shelf:', Object.values(lab.lots).map((l: any) => `${l.materialId} ${(l.amount.value / 1e6).toFixed(2)}kg${l.reservedBy ? '*' : ''}`).join(', '));
console.log('  equipment:', Object.keys(lab.equipment).join(', '), '| ready:', R.labReady().join(', '));
console.log('  runs:', Object.values(lab.runs).map((r: any) => `${r.processId} ${r.status}${r.why ? ' (' + r.why + ')' : ''}`).slice(-12).join('; '));
console.log('  house:', JSON.stringify(V.house), 'raft', JSON.stringify(V.raft), 'map', Object.keys(V.map.seen).length, 'seen', Object.keys(V.map.reached).length, 'reached');
console.log('  dot last:', dot.diary.slice(-6).map((e: any) => e.text).join(' / '));
{ const tally = new Map<string, number>(); for (const r of R.list) for (const e of r.diary) { const m = /^(.+?)：(?:.*?)(進めなかった|道がなかった|立てる場所がなかった|時間がかかりすぎた|始められなかった|うまくいかなかった)/.exec(e.text); if (m) { const k = `${r.id} ${m[1].replace(/（.*$/, '')} — ${m[2]}`; tally.set(k, (tally.get(k) ?? 0) + 1); } }
  console.log('— what went wrong, how often —'); for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${n}× ${k}`);
  const why = new Map<string, number>(); for (const r of R.list) for (const e of r.diary) if (/(進めなかった|道がなかった|立てる場所がなかった|始められなかった)/.test(e.text)) { const k = `${r.id} ${e.text.replace(/（\d+m）/, '')}`; why.set(k, (why.get(k) ?? 0) + 1); }
  console.log('— in its own words —'); for (const [k, n] of [...why].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${n}× ${k}`); }
console.log(`  (${((performance.now() - start) / 1000).toFixed(0)} s for ${DAYS} island days)`);
