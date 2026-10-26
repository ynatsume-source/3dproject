// Science probe (not committed): a fresh island for one real day; what each resident's time goes to, and how often
// trouble, failure, decisions and results happen. BRAIN=none | rand (a stand-in mind that picks any offered option).
import './node-land';
import * as THREE from 'three';
let now = Date.parse(process.env.START ?? '2026-10-26T00:00:00+09:00'); Date.now = () => now;
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
await loadIslandWeather();
const pick = mulberry32(99), BR = process.env.BRAIN ?? 'rand';
const oc: any = buildOcean(loc); const R: any = oc.residents;
R.setBrain(async (i: any) => { const o = (i.options ?? []).filter((x: any) => x.ready !== false); if (BR === 'none' || !o.length) return null; const p = o[Math.floor(pick() * o.length)]; return { goal: { text: 'テスト', why: 'テスト' }, plan: [p.id] }; });
const time: Record<string, Record<string, number>> = {}, ev: Record<string, number> = {}, diary: Record<string, Record<string, number>> = {}, firsts: string[] = [];
R.onEvent = (kind: string, _t: string, r: any, meta?: any) => { ev[`${r?.id}:${kind}`] = (ev[`${r?.id}:${kind}`] ?? 0) + 1; if (meta?.milestone) firsts.push(`${new Date(now + 9 * 3600e3).toISOString().slice(11, 16)} ${r?.id} ${meta.milestone}`); };
for (const r of R.list) { const d = diary[r.id] = {}; const push = r.diary.push.bind(r.diary); r.diary.push = (e: any) => { const k = /うまくいかなかった|ラッコ/.test(String(e.text)) ? `${e.key}:${String(e.text).slice(0, 60)}` : `${e.key ?? "-"}:${String(e.text).replace(/[：:].*$/, "").slice(0, 14)}`; d[k] = (d[k] ?? 0) + 1; return push(e); }; }
const cam = new THREE.Vector3(0, 50, 0), HOURS = Number(process.env.HOURS ?? 24); let errors = 0;
for (let s = 0; s < HOURS * 3600; s++) {
  now += 1000;
  try { R.update(1, now, cam); } catch (e) { errors++; }
  if (s % 60 === 0) R.setWeather(islandWeather(now));
  if (s % 10 === 0) for (const r of R.list) { const k = r.act === 'sleep' ? 'sleep' : (r.talk ? 'talk' : r.task?.kind ?? 'none'); const t = time[r.id] ??= {}; t[k] = (t[k] ?? 0) + 10; }
  await Promise.resolve(); await Promise.resolve();
}
const v = R.village;
console.log(JSON.stringify({ BR, HOURS, errors, fires: v.fires, mornings: v.mornings, storms: v.stormLog?.length, labDone: v.labDone?.length, labOk: v.labDone?.filter((x: any) => x.ok).length, treasures: v.treasures?.length }));
for (const [id, t] of Object.entries(time)) { const tot = Object.values(t).reduce((a, b) => a + b, 0); console.log(id, Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, x]) => `${k} ${(100 * x / tot).toFixed(0)}%`).join(', ')); }
console.log('events', JSON.stringify(Object.entries(ev).sort((a, b) => b[1] - a[1]).slice(0, 40)));
for (const [id, d] of Object.entries(diary)) console.log('diary', id, JSON.stringify(Object.entries(d).sort((a, b) => b[1] - a[1]).slice(0, 18)));
console.log('firsts', JSON.stringify(firsts));
try { const rd = (R as any).labReady?.(); console.log("labReady", JSON.stringify(rd)); } catch (e) { console.log("labReady err", String(e)); }
console.log("lots", JSON.stringify(Object.values(R.lab.lots).map((l: any) => l.materialId)));
process.exit(0);
