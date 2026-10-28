// Science probe (not committed): a fresh island with the first cargo (clay, bamboo) on the shelf; when the clay
// work happens, when the stock runs out, and when a raft with a sail first reaches the island to the south.
import './node-land';
import * as THREE from 'three';
let now = Date.parse(process.env.START ?? '2026-11-05T06:00:00+09:00'); Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(Number(process.env.SEED ?? 5));
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const loc: any = DOTWORLD; await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {} });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const { loadIslandWeather, islandWeather } = await import('../src/world/island-time');
const { addLot } = await import('../src/world/process-runner');
const { RAW_CLAY_SOUTH, BAMBOO_SOUTH } = await import('../src/world/planet-map');
await loadIslandWeather();
const pick = mulberry32(99), BR = process.env.BRAIN ?? 'rand';
const R: any = buildOcean(loc).residents;
R.setBrain(async (i: any) => { const o = (i.options ?? []).filter((x: any) => x.ready !== false); if (BR === 'none' || !o.length) return null; const p = o[Math.floor(pick() * o.length)]; return { goal: { text: 'テスト', why: 'テスト' }, plan: [p.id] }; });
const CLAY = Number(process.env.CLAY ?? 25e6), BAMBOO = Number(process.env.BAMBOO ?? 7e6);
if (CLAY) addLot(R.lab, { materialId: 'raw_clay', amount: { value: CLAY, unit: 'mg' }, location: 'shelf', quality: { ...RAW_CLAY_SOUTH } });
if (BAMBOO) addLot(R.lab, { materialId: 'bamboo', amount: { value: BAMBOO, unit: 'mg' }, location: 'shelf', quality: { ...BAMBOO_SOUTH } });
const t0 = now, hrs = () => ((now - t0) / 3600e3).toFixed(1);
const log: string[] = [], firsts: string[] = [];
R.onEvent = (kind: string, text: string, r: any, meta?: any) => { if (meta?.milestone) firsts.push(`${hrs()}h ${r?.id} ${meta.milestone}`); if (/storm|fire|haul|prep|weather|raft|voyage/.test(kind) && log.length < 400) log.push(`${hrs()}h ${kind} ${String(text).slice(0, 70)}`); };
const mass = (id: string) => (Object.values(R.lab.lots) as any[]).filter((l) => l.materialId === id).reduce((n, l) => n + l.amount.value, 0) / 1e6;
const cam = new THREE.Vector3(0, 50, 0), HOURS = Number(process.env.HOURS ?? 96); const rows: string[] = []; let pitAt = '', errors = 0;
for (let s = 0; s < HOURS * 3600; s++) {
  now += 1000;
  try { R.update(1, now, cam); } catch (e) { errors++; }
  if (s % 60 === 0) R.setWeather(islandWeather(now));
  for (const r of R.list) if (!r.sp.living) r.battery = Math.max(r.battery, 0.3);
  if (!pitAt && R.village.clayPit) pitAt = hrs();
  if (s % 1800 === 0) { const v = R.village, w = islandWeather(now), h = ((now / 3.6e6 + 9) % 24); const kame = R.list.find((r: any) => r.id === 'kame'); rows.push(`W ${hrs()}h jst${h.toFixed(1)} gust ${w?.gust?.toFixed(0)} p ${w?.pressure?.toFixed(0)} swell ${w?.swell?.toFixed(1)}m/${w?.swellPeriod?.toFixed(0)}s rain ${w?.rain?.toFixed(1)} prep ${v.stormPrep ? ((v.stormPrep - t0) / 3.6e6).toFixed(1) : 0} alarm ${v.swellGuess?.alarm ? ((v.swellGuess.alarm - t0) / 3.6e6).toFixed(1) : 0} storms ${v.stormLog?.length ?? 0} raft ${v.raft.parts}${v.raft.hauled ? 'H' : ''} kame ${kame.task?.kind ?? kame.act}`); }
  if (s % (6 * 3600) === 0) { const v = R.village; rows.push(`${hrs()}h clay ${mass('raw_clay').toFixed(1)} settled ${mass('settled_clay').toFixed(1)} prepared ${mass('prepared_clay').toFixed(1)} bamboo ${mass('bamboo').toFixed(1)} pots ${['green_pot','dry_pot','fired_pot'].map(mass).map((x) => x.toFixed(1)).join('/')} hut ${R.list.find((r: any) => r.id === 'dot').stats.built} raft ${v.raft?.parts} reached ${Object.keys(v.map?.reached ?? {}).join(',')} labDone ${v.labDone?.length}`); }
  await Promise.resolve(); await Promise.resolve();
}
console.log(JSON.stringify({ BR, HOURS, CLAY, BAMBOO, errors, pitAt, labDone: (R.village.labDone ?? []).map((x: any) => `${((x.at - t0) / 3600e3).toFixed(1)}h ${x.processId}${x.ok ? '' : ' ✗'}`) }));
console.log(rows.join('\n')); console.log('firsts', firsts.join(' | ')); console.log('log', log.slice(0, 120).join('\n'));
process.exit(0);
