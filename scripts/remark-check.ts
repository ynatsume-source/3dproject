// A remark on its own goes away (rehearsal finding R-023: Rakko's "ドット、流木を運ぼうか。" stayed under the picture for
// hours). On the island as built, Dot and Rakko side by side, no mind:
//   remark       Rakko offers to carry wood (a remark outside a conversation): it is up at once, and gone after 4 s and
//                0.15 s a character, 10 s at most — not before 4 s, gone by 10.5 s
//   talk         a conversation started right after another remark: every line is said once (none said again because
//                it was let go), and nobody's line goes while the conversation lasts
//   jump         a remark, then the clock moved on an hour in one step (as after catching up): nothing left up
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/remark-check.ts
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
const dev = R.talkDev, cam = new THREE.Vector3(0, 50, 0), dt = 1 / 30;
const dot = R.list.find((r: any) => r.id === 'dot'), rakko = R.list.find((r: any) => r.id === 'rakko');
const others = R.list.filter((r: any) => r !== dot && r !== rakko);
let near = false;
const hold = () => {   // (the two kept idle, side by side only for the conversation — apart, so no meeting starts one of
  // its own; the others far off)
  for (const r of [dot, rakko]) { r.task = null; r.path = undefined; r.act = 'idle'; }
  rakko.pos.set(dot.pos.x + (near ? 1.5 : 300), dot.pos.y, dot.pos.z);
  others.forEach((r: any, i: number) => r.pos.set(dot.pos.x + 400 + i * 50, r.pos.y, dot.pos.z + 400));
};
const tick = (s: number, each?: (t: number) => void) => { for (let t = 0; t < s; t += dt) { sim += dt * 1000; if (!dot.talk) hold(); R.update(dt, sim, cam); each?.(t); } };
let fail = 0;
const row = (ok: boolean, text: string) => { if (!ok) fail++; console.log(`${text} — ${ok ? 'PASS' : 'FAIL'}`); };

// remark
tick(1);
dev.utter(rakko, { act: 'offer-help', to: 'dot', what: 'wood' });
let upAt = -1, goneAt = -1, said = '';
tick(14, (t) => { if (upAt < 0 && rakko.saying) { upAt = t; said = rakko.saying; } if (upAt >= 0 && goneAt < 0 && !rakko.saying) goneAt = t; });
const want = Math.min(10, 4 + said.length * 0.15), up = goneAt - upAt;
row(upAt >= 0 && upAt < 0.1 && goneAt > 0 && up >= 4 && up <= 10.5 && Math.abs(up - want) < 0.2, `remark: "${said}" up at ${upAt.toFixed(2)} s, for ${up.toFixed(2)} s (want ${want.toFixed(2)})`);

// talk, right after another remark
dev.utter(dot, { act: 'noted' }); tick(1);
const n0 = R.talks.length;
near = true; hold(); dev.startTalk(dot, rakko, false);
const conv = dot.talk?.conv, lines = dot.talk?.lines.length ?? 0;
let dropped = 0, steps = 0;
tick(120, () => { if (dot.talk) { steps++; const tk = dot.talk, line = tk.lines[tk.i]; if (line && tk.t > dt * 2 && !R.list.find((r: any) => r.id === line.who).saying) dropped++; } });
const said2 = R.talks.slice(n0).filter((e: any) => e.conv === conv && !e.head), texts = said2.map((e: any) => e.text);
row(lines > 0 && said2.length === lines && new Set(texts).size === texts.length && dropped === 0 && !dot.talk, `talk: ${lines} lines, said ${said2.length} times, ${dropped} frames with the line gone, ${dot.talk ? 'still talking' : 'over'}`);

// jump
near = false; tick(30);
dev.utter(rakko, { act: 'offer-help', to: 'dot', what: 'wood' }); tick(0.5);
const before = rakko.saying;
sim += 3600e3; R.update(dt, sim, cam);
row(!!before && !rakko.saying && !dot.saying, `jump: "${before}" before the hour, "${rakko.saying}" after`);
process.exit(fail ? 1 : 0);
