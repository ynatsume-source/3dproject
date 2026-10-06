// Headless check (ADR 0006, stage 4: Dot's purpose — the world widened), on the real island of Dot's world.
//  1 from the beach Dot puts the islands it can see on its map, each with a word of its own in the island's language;
//    the map grown is its reward
//  2 pieces lashed on the beach: a raft
//  3 the crossing, as the world judges the day: too far for a raft, or a strong wind — not today; a calm morning to
//    the near island — away from the island while it crosses, back with what is there, the map wider; with the
//    bamboo home, Lantern sets up a rain catcher
//  4 a typhoon while it is out: it turns back
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/map-check.ts
import './node-land';
import * as THREE from 'three';

let sim = Date.parse('2026-10-06T07:30:00+09:00');
Date.now = () => sim;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
const { mulberry32 } = await import('../src/core/math'); Math.random = mulberry32(7);
const { loadLand } = await import('../src/ocean/land');
const { DOTWORLD } = await import('../src/data/locations');
const { syllables, LEX } = await import('../src/robots/islandlang');
const { ISLES } = await import('../src/world/planet-map');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {}, width: 64, height: 64 });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const R: any = buildOcean(loc).residents;
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const dot = R.list.find((r: any) => r.id === 'dot'), dm = R.mind(dot);
const cam = new THREE.Vector3();
const run = async (secs: number, until?: () => boolean) => { for (let i = 0; i < secs * 2; i++) { sim += 500; cam.set(dot.pos.x, 30, dot.pos.z); R.update(0.5, sim, cam); await Promise.resolve(); await Promise.resolve(); if (until?.()) return true; } return false; };
let want_: (i: any) => string | undefined = () => undefined;
R.setBrain(async (i: any) => i.who === 'dot' ? ({ goal: { text: 'テスト', why: 'テスト' }, plan: [want_(i) ?? 'look:shore'] }) : null);
const think = () => { dm.why = 'テスト'; dm.lastCall = -1e12; };
const calm = { ok: true, at: 0, cloud: 0.2, rain: 0, code: 1, wind: 3, windDir: 90, gust: 5, pressure: 1012, typhoon: false, source: 'test', record: { station: 'test', at: '' } };
R.setWeather(calm);
const V = R.village;
{ // 1
  want_ = (i) => i.options.find((o: any) => o.id === 'survey:horizon')?.id; think();
  await run(1800, () => Object.keys(V.map.seen).length > 0);
  const words = Object.values(V.map.seen).map((x: any) => x.word);
  want('1 the islands it can see are on its map', Object.keys(V.map.seen).length === ISLES.length, words.join(' '));
  want('1 each with a word of its own, in the island\'s sounds, none the language had', new Set(words).size === words.length && words.every((w: string) => syllables(w).map(([c, v]) => c + v).join('') === w && !Object.values(LEX).includes(w as any)));
  want('1 the map grown is its reward', (dm.values.m.get('survey:horizon')?.sum ?? 0) > 1, String(dm.values.m.get('survey:horizon')?.sum));
  want('1 its record says what it saw, where', dot.diary.some((e: any) => /に島が見えた（約[\d.]+km/.test(e.text)));
}
{ // 2
  want_ = (i) => i.options.find((o: any) => o.id === 'lash:raft' && o.ready !== false)?.id;
  for (let k = 0; k < 10 && V.raft.parts < 6; k++) { const p = V.raft.parts; dot.holding = 'piece'; think(); await run(600, () => V.raft.parts > p); }
  want('2 six pieces lashed: a raft', V.raft.parts === 6 && dot.diary.some((e: any) => /筏ができた/.test(e.text)), `${V.raft.parts}/6`);
}
{ // 3
  const far = ISLES.find((i: any) => i.id === 'west-big')!, near = ISLES.find((i: any) => i.id === 'south-near')!;
  want_ = (i) => i.options.find((o: any) => o.id === `voyage:${far.id}`)?.id; think();
  await run(1200, () => dm.results.some((r: any) => r.optionId === `voyage:${far.id}`));
  const r1 = dm.results.find((r: any) => r.optionId === `voyage:${far.id}`);
  want('3 too far for a raft: not today, and why', r1?.outcome === 'blocked' && /遠すぎる/.test(r1.detail ?? ''), r1?.detail ?? 'none');
  R.setWeather({ ...calm, wind: 11 }); want_ = (i) => i.options.find((o: any) => o.id === `voyage:${near.id}`)?.id; think();
  await run(1200, () => dm.results.some((r: any) => r.optionId === `voyage:${near.id}`));
  const r2 = dm.results.find((r: any) => r.optionId === `voyage:${near.id}`);
  want('3 a strong wind: not today', r2?.outcome === 'blocked' && /風が強い/.test(r2.detail ?? ''), r2?.detail ?? 'none');
  R.setWeather(calm); dot.battery = 1; sim = Date.parse('2026-10-06T08:00:00+09:00'); think();
  let away = false;
  await run(4 * 3600, () => { if (dot.task?.kind === 'voyage' && dot.task.data?.started && !dot.model.root.visible) away = true; return !!V.map.reached[near.id]; });
  want('3 on a calm morning it crosses — away from the island while it is out', away && !!V.map.reached[near.id]);
  want('3 what the raft brought home is on the shelf, as lots for Lantern\'s science', ['raw_clay', 'bamboo', 'reed'].every((m) => Object.values(R.lab.lots).some((l: any) => l.materialId === m && l.amount.unit === 'mg' && l.amount.value > 0 && l.location === 'shelf')), Object.values(R.lab.lots).map((l: any) => `${l.materialId} ${l.amount.value / 1e6}kg`).join(', '));
  want('3 back with what is there, and its map wider is its reward', dot.diary.some((e: any) => /にたどり着いて戻った。あったもの：竹.*持ち帰った：粘土 10kg/.test(e.text)) && (dm.values.m.get(`voyage:${near.id}`)?.sum ?? 0) > 1 && dot.model.root.visible, dot.diary.filter((e: any) => /筏で|たどり着いて/.test(e.text)).map((e: any) => e.text).join(' / '));
  const lantern = R.list.find((r: any) => r.id === 'lantern');
  await run(12 * 3600, () => !!V.catcher);
  want('3 with the bamboo home, Lantern sets up a rain catcher by the shelf', !!V.catcher && lantern.diary.some((e: any) => /雨受けを作った/.test(e.text)) && Object.values(R.lab.lots).some((l: any) => l.materialId === 'bamboo' && l.amount.value === 4e6), lantern.diary.filter((e: any) => /雨受け/.test(e.text)).map((e: any) => e.text).join(' / ') || 'none');
}
{ // 4
  const isle = ISLES.find((i: any) => i.id === 'east-flat')!;   // (too far today — so: as if it were near, to see a storm turn it back)
  isle.lat = 24.35; isle.lon = 124.0;
  dot.battery = 1; sim = Date.parse('2026-10-07T08:00:00+09:00'); R.setWeather(calm);
  want_ = (i) => i.options.find((o: any) => o.id === `voyage:${isle.id}`)?.id; think();
  await run(3600, () => dot.task?.kind === 'voyage' && !!dot.task.data?.started);
  R.setWeather({ ...calm, typhoon: true, wind: 18, pressure: 985 }); await run(30);
  want('4 a typhoon while it is out: it turns back', dot.diary.some((e: any) => /引き返した（台風）/.test(e.text)) && !V.map.reached[isle.id] && dot.model.root.visible);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
