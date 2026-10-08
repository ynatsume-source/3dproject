// Headless check (dwelling theme, step 2: Dot's house — docs/proposals/sumika-2026-10-07.md §2, robots/house.ts), on the
// real island of Dot's world, with a stand-in mind that takes the first step it can.
//  1 the house's place: beside the hut, on land, near level, clear of the field, the fire and the bench
//  2 its steps, in order: each needs what it needs (a shaped piece, rope it twists, a load of cut grass) — not offered
//    as ready until it has it; each step done shows its part and is its reward
//  3 with the roof whole: no rain inside; a worn robot in the rain goes in under it
//  4 the walls need bamboo and clay from the island to the south: a crossing for them brings a raft load home
//  5 the walls daubed: a typhoon inside wears it only a tenth, less than it dries there; both robots shelter in it
//  6 a typhoon takes a course or two of thatch off a roof not weighed down — laid again first; weighed down, none
//  7 the floor and Lantern's table: the house is done, and kept across a save
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/house-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-06T10:00:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(7);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const { ISLES } = await import('../src/world/planet-map');
const { HOUSE_N, HOUSE_STEPS, stepsBefore, HW, HD, insideHouse } = await import('../src/robots/house');
const { ISLAND_RATE } = await import('../src/world/island-time');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const R: any = buildOcean(loc).residents;
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const by = (id: string) => R.list.find((r: any) => r.id === id);
const dot = by('dot'), lantern = by('lantern'), dm = R.mind(dot), V = R.village, H = V.house;
const cam = new THREE.Vector3();
let wx: any = { ok: true, at: 0, cloud: 0.2, rain: 0, rainMeasured: 0, code: 1, wind: 3, windMeasured: 3, windDir: 90, gust: 5, pressure: 1012, typhoon: false, source: 'test', record: { station: 'test', at: '' } };
const calm = { ...wx };
const run = async (secs: number, until?: () => boolean) => { for (let i = 0; i < secs * 2; i++) { sim += 500; cam.set(dot.pos.x, 30, dot.pos.z); R.setWeather(wx); R.update(0.5, sim, cam); await Promise.resolve(); await Promise.resolve(); if (until?.()) return true; } return false; };
let pick: (i: any) => string | undefined = () => undefined;
R.setBrain(async (i: any) => i.who === 'dot' ? ({ goal: { text: 'テスト', why: 'テスト' }, plan: [pick(i) ?? 'look:shore'] }) : null);
const think = () => { dm.why = 'テスト'; dm.lastCall = -1e12; };
const ready = (i: any, id: string) => i.options.find((o: any) => o.id === id && o.ready !== false)?.id;
// the house as the world placed it (its group: the one with as many parts as the steps)
const houseG = R.group.children.find((g: any) => g.children?.length === HOUSE_N);
const local = (x: number, z: number) => houseG.worldToLocal(new THREE.Vector3(x, houseG.position.y, z));
const lines = (r: any) => r.diary.filter((e: any) => e.key === 'house').map((e: any) => e.text);
dot.stats.built = 24;   // (the hut stands)
for (const r of [dot, lantern]) { r.battery = 1; r.wear = 0; }

{ // 1
  const hutG = R.group.children.find((g: any) => g !== houseG && g.children?.length >= 24 && g.children.slice(0, 24).every((m: any) => m.isMesh));
  const d = Math.hypot(houseG.position.x - hutG.position.x, houseG.position.z - hutG.position.z);
  const hs: number[] = []; for (const fx of [-1, 0, 1]) for (const fz of [-1, 0, 1]) { const w = houseG.localToWorld(new THREE.Vector3(fx * HW, 0, fz * HD)); hs.push(R.groundAt ? R.groundAt(w.x, w.z) : w.y); }
  want('1 beside the hut', !!houseG && d > 4 && d < 12, `${d.toFixed(1)} m from the hut`);
  const inWay: string[] = []; R.solids.each(houseG.position.x, houseG.position.z, 4, (s: any) => { const v = local(s.x, s.z); if (Math.abs(v.x) < HW + 0.7 && Math.abs(v.z) < HD + 0.7) inWay.push(s.kind); });
  want('1 nothing in the way where it stands (no trees)', !inWay.length, inWay.join(',') || 'clear');
}
{ // 2 the frame and the roof
  const sawNeeds = { piece: false, grass: false };
  pick = (i) => {
    const h = i.options.find((o: any) => o.id === 'house:next');
    if (h?.ready === false) { if (/削った部材/.test(h.needs)) sawNeeds.piece = true; if (/刈った草/.test(h.needs)) sawNeeds.grass = true; }
    return ready(i, 'house:next') ?? (H.rope < (HOUSE_STEPS[H.n]?.rope ?? 0) ? ready(i, 'twist:bench') : undefined) ?? ready(i, 'cut:grass');
  };
  const ROOF = stepsBefore('wattle');
  for (let k = 0; k < 120 && H.n < ROOF; k++) {
    if (HOUSE_STEPS[H.n].need === 'piece' && !dot.holding) dot.holding = 'piece';   // (shaped at the bench: as the hut's)
    const n = H.n, rope = H.rope, g0 = dot.holding; think(); await run(900, () => H.n > n || H.rope > rope || (g0 !== 'grass' && dot.holding === 'grass' && dot.task?.kind !== 'cut'));
  }
  await run(5);
  want('2 every step not ready until it has what it needs', sawNeeds.grass && dm.results.some((x: any) => x.optionId === 'twist:bench'), JSON.stringify(sawNeeds));
  want('2 posts, frame, braces, rafters and thatch, one at a time: the roof', H.n === ROOF && houseG.children.slice(0, ROOF).every((p: any) => p.visible) && !houseG.children[ROOF].visible, `${H.n}/${HOUSE_N}, rope ${H.rope}m`);
  want('2 each step in its record, and its reward', lines(dot).filter((t: string) => /柱を立てた|桁と梁|筋交い|垂木|茅を束ねて/.test(t)).length === ROOF && (dm.values.m.get('house:next')?.sum ?? 0) >= ROOF - 1 && lines(dot).some((t: string) => /屋根が葺き上がった/.test(t)), lines(dot).slice(-2).join(' / '));
}
{ // 3 rain: none inside; a worn robot goes in
  pick = () => 'look:shore';
  const inn = houseG.localToWorld(new THREE.Vector3(0.5, 0, 0.5));
  wx = { ...calm, rain: 6, rainMeasured: 6 }; lantern.wear = 0.2;
  for (let s = 0; s < Math.round(2 * 3600 / ISLAND_RATE); s++) { lantern.pos.set(inn.x, lantern.pos.y, inn.z); lantern.task = { kind: 'wander', x: inn.x, z: inn.z, act: 'idle', dur: 1e9, t: 0, arrived: true }; await run(1); }
  want('3 with the roof whole, no rain inside: it does not wear (it dries there)', lantern.wear <= 0.2, `0.200 → ${lantern.wear.toFixed(3)}`);
  const out = houseG.localToWorld(new THREE.Vector3(6, 0, 3)); dot.pos.set(out.x, dot.pos.y, out.z); dot.wear = 0.45; dot.wearLv = 1; dot.task = null; dot.holding = '';
  const went = await run(400, () => dot.task?.kind === 'shelter' && dot.task.arrived);
  const v = local(dot.pos.x, dot.pos.z);
  want('3 worn, in the rain, it goes in under the roof (through the door)', went && insideHouse(v.x, v.z), `${dot.task?.kind} at ${v.x.toFixed(2)},${v.z.toFixed(2)}`);
  wx = calm; await run(20);
}
{ // 4 bamboo and clay, by raft
  const near = ISLES.find((i: any) => i.id === 'south-near')!;
  V.map.seen[near.id] = { word: 'sopunu', at: sim }; V.map.reached[near.id] = { at: sim }; V.raft.parts = 6;
  dot.holding = ''; dot.wear = 0; dot.wearLv = 0; dot.battery = 1;
  let i0: any = null; pick = (i) => { i0 = i; return undefined; }; think(); await run(5);
  const h = i0?.options.find((o: any) => o.id === 'house:next'), voy = i0?.options.find((o: any) => o.id === `voyage:${near.id}`);
  want('4 the walls need bamboo: not ready, and a crossing for it offered', h?.ready === false && /竹8本/.test(h.needs) && /家の竹と粘土を取りに行く/.test(voy?.label ?? ''), `${h?.needs} | ${voy?.label}`);
  sim = Date.parse('2026-10-07T09:40:00+09:00'); wx = calm;
  pick = (i) => i.options.find((o: any) => o.id === `voyage:${near.id}`)?.id; think();
  await run(3 * 3600, () => H.bamboo > 0);
  want('4 a raft load home, by the house', H.bamboo === 20 && H.clay === 80 && dot.diary.some((e: any) => /家の材料を筏で運んだ：竹20本・粘土80kg/.test(e.text)), `bamboo ${H.bamboo}, clay ${H.clay}`);
}
{ // 5 the walls
  H.bamboo = 40; H.clay = 600; H.rope = Math.max(H.rope, 40);   // (the rest of the crossings)
  pick = (i) => ready(i, 'house:next') ?? ready(i, 'twist:bench');
  const WALLS = stepsBefore('floor');
  for (let k = 0; k < 40 && H.n < WALLS; k++) { const n = H.n; think(); await run(900, () => H.n > n); }
  want('5 a bamboo lattice, then clay on it, side by side', H.n === WALLS && lines(dot).some((t: string) => /土壁が塗り上がった/.test(t)), `${H.n}/${HOUSE_N}`);
  pick = () => 'look:shore';
  wx = { ...calm, typhoon: true, rain: 12, rainMeasured: 12, wind: 22, windMeasured: 22, wave: 5, pressure: 975 };
  for (const r of [dot, lantern]) { r.task = null; r.wear = 0; r.wearLv = 0; r.stuck = false; }
  { const h = houseG.position; lantern.pos.x = h.x + 12; lantern.pos.z = h.z - 6; }   // (Lantern near by, as it is once it comes to live there — not 350 m off at its old place, where a typhoon would wear it to a crawl on the way)
  let both = false;
  for (let t = 0; t < 1800 && !both; t += 30) { both = await run(30, () => [dot, lantern].every((r: any) => r.task?.kind === 'shelter' && r.task.arrived)); }
  want('5 a typhoon: both robots shelter in the house', both && [dot, lantern].every((r: any) => { const v = local(r.pos.x, r.pos.z); return insideHouse(v.x, v.z); }), [dot, lantern].map((r: any) => `${r.id} ${r.task?.kind} ${r.task?.arrived}`).join(', '));
  dot.wear = 0.5; dot.wearLv = 1; const w0 = dot.wear; await run(Math.round(4 * 3600 / ISLAND_RATE));
  want('5 inside the walls, a typhoon wears it only a tenth — less than it dries there', dot.wear < w0 && w0 - dot.wear < 0.2, `${(dot.wear - w0).toFixed(3)} in 4 island hours (outside ≈ +0.80)`);
}
{ // 6 thatch blown off, laid again; weighed down, kept
  wx = calm; await run(10);
  want('6 not weighed down: a course of thatch blown off', H.lost === 1 && dot.diary.some((e: any) => /家の茅（1段）は失った|家の茅（1段）を失った/.test(e.text)), `lost ${H.lost}`);
  const top = stepsBefore('wattle') - 1;
  want('6 it shows', !houseG.children[top].visible && houseG.children[top - 1].visible);
  pick = (i) => ready(i, 'house:next') ?? ready(i, 'cut:grass') ?? ready(i, 'twist:bench');
  dot.holding = ''; for (let k = 0; k < 6 && H.lost > 0; k++) { const g0 = dot.holding; think(); await run(900, () => H.lost === 0 || (g0 !== 'grass' && dot.holding === 'grass' && dot.task?.kind !== 'cut')); }
  await run(5);   // (the course swings up into its place)
  want('6 laid again first', H.lost === 0 && houseG.children[top].visible && lines(dot).some((t: string) => /葺き直した/.test(t)));
  V.stormPrep = sim; V.prepBy = 'lantern'; dot.task = null; dot.holding = ''; pick = () => 'look:shore';
  await run(600, () => H.weighed);
  wx = { ...calm, typhoon: true, rain: 10, rainMeasured: 10, wind: 20, windMeasured: 20, pressure: 980 }; await run(30); wx = calm; await run(10);
  want('6 weighed down before the typhoon: nothing blown off', H.lost === 0 && dot.diary.some((e: any) => /家の屋根（重しをかけていた）は無事/.test(e.text)), dot.diary.filter((e: any) => e.key === 'weather').slice(-1).map((e: any) => e.text)[0]);
}
{ // 7 the floor and the table; kept
  pick = (i) => ready(i, 'house:next');
  for (let k = 0; k < 6 && H.n < HOUSE_N; k++) { if (HOUSE_STEPS[H.n].need === 'piece') dot.holding = 'piece'; const n = H.n; think(); await run(900, () => H.n > n); }
  want('7 the floor and Lantern\'s table: the house is done', H.n === HOUSE_N && lines(dot).some((t: string) => /家ができた/.test(t)) && houseG.children.every((p: any) => p.visible), `${H.n}/${HOUSE_N}`);
  R.save(); const saved = JSON.parse([...store.values()].find((v) => v.includes('"house"')) ?? '{}');
  want('7 kept across a save', saved.village?.house?.n === HOUSE_N);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
