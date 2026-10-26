// Rakko's offer of wood to Dot, and a promise it cannot keep (rehearsal finding R-026: it offered with none, went to
// hand none over, failed, and nothing closed the promise or told either of them). On the island as built, no mind,
// Dot and Rakko side by side, Dot at the hut with nothing in hand:
//   empty      Rakko holding nothing and knowing of no wood: no offer
//   known      Rakko holding nothing but knowing of a piece of wood to pick up: the offer is there
//   holding    Rakko holding wood: the offer is there
//   refused    Rakko said no to Dot's own asking: no offer for 30 min (world's clock), then again
//   timeout    an accepted promise it does nothing about: closed as not kept after an hour, the reason a result for both
//              (Rakko's give:dot, Dot's ask:rakko:bring-wood, both unavailable); then no offer for 40 min
//   tries      three tries at handing over that came to nothing: closed at once
//   asking     Dot's own asking: not again for an hour after a no, or after a promise Rakko could not keep, and three
//              times a day at most (it was every ten minutes: 24 noes a day in the soak of 2026-10-26)
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/offer-check.ts
import './node-land';
import * as THREE from 'three';
let sim = Date.parse('2026-12-04T10:00:00+09:00'); Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(7);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const loc: any = DOTWORLD; await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const oc: any = buildOcean(loc), R: any = oc.residents; R.setBrain(null);
const dev = R.talkDev, cam = new THREE.Vector3(0, 50, 0), dt = 1 / 20;
const dot = R.list.find((r: any) => r.id === 'dot'), rakko = R.list.find((r: any) => r.id === 'rakko');
const others = R.list.filter((r: any) => r !== dot && r !== rakko);
const hold = () => {   // (the two idle side by side, Dot with nothing in hand; the others far off)
  for (const r of [dot, rakko]) { r.task = null; r.path = undefined; r.act = 'idle'; r.talk = null; r.hunger = 0.1; r.sleepy = 0.1; }
  dot.holding = ''; rakko.pos.set(dot.pos.x + 2, dot.pos.y, dot.pos.z);
  others.forEach((r: any, i: number) => r.pos.set(dot.pos.x + 400 + i * 50, r.pos.y, dot.pos.z + 400));
};
const tick = (s: number) => { for (let t = 0; t < s; t += dt) { sim += dt * 1000; hold(); R.update(dt, sim, cam); } };
const jump = (min: number) => { sim += min * 60e3; hold(); R.update(dt, sim, cam); };
const offers = () => { dot.talk = rakko.talk = null; dot.holding = ''; return dev.sayables(rakko).some((o: any) => o.id === 'say:offer:wood:dot'); };   // (as they stand: not in a talk the last step began)
const forgetWood = () => { const a = dev.agentOf(rakko); for (const k of [...a.seen.keys()]) if (String(k).startsWith('wood#')) a.seen.delete(k); };
let fail = 0;
const row = (ok: boolean, text: string) => { if (!ok) fail++; console.log(`${text} — ${ok ? 'PASS' : 'FAIL'}`); };
tick(1);
if (dot.stats.built >= 24) dot.stats.built = 20;

// empty
rakko.holding = ''; forgetWood(); dev.requests.length = 0; rakko.saidAt = {};
row(!offers(), `empty: holding nothing, knowing of no wood — offer ${offers() ? 'there' : 'not there'}`);
// known
const wood = R.items.list.find((it: any) => it.kind === 'wood' && !it.by);
if (wood) dev.agentOf(rakko).seen.set(`wood#${wood.id}`, { id: `wood#${wood.id}`, kind: 'wood', label: '流木', x: wood.x, z: wood.z, dist: 10, at: sim });
row(!!wood && offers(), `known: holding nothing, knowing of a piece of wood — offer ${offers() ? 'there' : 'not there'}${wood ? '' : ' (no free wood on the island)'}`);
forgetWood();
// holding
rakko.holding = 'wood';
row(offers(), `holding: wood in hand — offer ${offers() ? 'there' : 'not there'}`);
// refused
dev.requests.push({ id: 'req#t1', from: 'dot', to: 'rakko', what: 'bring-wood', at: sim, status: 'refused' });
const r0 = offers(); jump(29); const r29 = offers(); jump(2); const r31 = offers();
row(!r0 && !r29 && r31, `refused: offer just after ${r0}, at 29 min ${r29}, at 31 min ${r31}`);
// timeout
dev.requests.length = 0; rakko.holding = ''; forgetWood();
const q: any = { id: 'req#t2', from: 'dot', to: 'rakko', what: 'bring-wood', at: sim, status: 'accepted' }; dev.requests.push(q);
jump(59); const open59 = q.status; jump(2); const at61 = q.status;
const ra = dev.agentOf(rakko).results.at(-1), da = dev.agentOf(dot).results.filter((x: any) => x.optionId === 'ask:rakko:bring-wood').at(-1);
rakko.holding = 'wood';
const o0 = offers(); jump(39); const o39 = offers(); jump(2); const o41 = offers();
row(open59 === 'accepted' && at61 === 'failed' && ra?.optionId === 'give:dot' && ra?.outcome === 'unavailable' && da?.outcome === 'unavailable' && !o0 && !o39 && o41,
  `timeout: ${open59} at 59 min, ${at61} at 61 min (${q.reason}); Rakko's result ${ra?.optionId} ${ra?.outcome}, Dot's ${da?.optionId} ${da?.outcome}; offer after ${o0}/${o39}/${o41} (0/39/41 min)`);
// tries
dev.requests.length = 0; rakko.saidAt = {};
const q2: any = { id: 'req#t3', from: 'dot', to: 'rakko', what: 'bring-wood', at: sim, status: 'accepted' }; dev.requests.push(q2);
const ag = dev.agentOf(rakko);
for (let i = 0; i < 3; i++) { sim += 60e3; ag.result('give:dot', 'give', 'unavailable', sim, 'test'); }
tick(0.2);
row(q2.status === 'failed', `tries: three tries that came to nothing — ${q2.status} (${q2.reason})`);
// asking (Dot's side of the same: asked every ten minutes after a no, it was 24 noes a day)
dev.requests.length = 0; dot.holding = '';
const asks = () => { dot.talk = rakko.talk = null; dot.holding = ''; rakko.act = 'idle'; return dev.optionsFor(dot, dev.agentOf(dot)).some((o: any) => o.id === 'ask:rakko:bring-wood'); };
const k0 = asks();
dev.requests.push({ id: 'req#t4', from: 'dot', to: 'rakko', what: 'bring-wood', at: sim, status: 'refused' });
const k1 = asks(); jump(30); const k30 = asks(); jump(31); const k61 = asks();
dev.requests.length = 0; dev.requests.push({ id: 'req#t5', from: 'dot', to: 'rakko', what: 'bring-wood', at: sim - 120 * 60e3, status: 'failed', endedAt: sim });
const f1 = asks(); jump(61); const f61 = asks();
dev.requests.length = 0; for (let i = 0; i < 3; i++) dev.requests.push({ id: `req#t6${i}`, from: 'dot', to: 'rakko', what: 'bring-wood', at: sim - (20 - i * 3) * 3600e3, status: 'done' });
const d3 = asks(); dev.requests.shift(); const d2 = asks();
row(k0 && !k1 && !k30 && k61 && !f1 && f61 && !d3 && d2, `asking: Dot may ask ${k0}; after a no ${k1}, at 30 min ${k30}, at 61 min ${k61}; after a promise not kept ${f1}, at 61 min ${f61}; with three asked in the last day ${d3}, two ${d2}`);
process.exit(fail ? 1 : 0);
