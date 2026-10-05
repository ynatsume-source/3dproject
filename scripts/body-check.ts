// Headless check (ADR 0004, addendum: body and food) — Rakko's and Kamemaru's bodies, on controlled ground (sea to the
// west of x = 0 and east of x = 300, land between).
//  1 diving costs more than floating; a patch gives what it has, runs out, and comes back with time
//  2 very hungry: weak dives come up empty — told to its mind with how hungry it was; its own mark to eat moves earlier
//  3 Rakko chilled: it floats and grooms, nothing else; Kamemaru too hungry: hauls out and lies still
//  4 very sleepy: it dozes off where it is (Rakko wakes somewhere else); half asleep, what it carries slips
//  5 a quiet day: the marks ease back; its mind is given its body, and places to eat it knows
//  6 by habit, it goes to eat when past its own mark
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/body-check.ts
import * as THREE from 'three';
import { makeResidents } from '../src/robots/residents';
import { Solids } from '../src/robots/solids';
import { mulberry32 } from '../src/core/math';
import { drain, dive, regrow, makePatch, newDay, bodyState, trouble, BODY } from '../src/robots/body';
import type { BrainInput } from '../src/robots/agent/types';

let now = Date.parse('2026-10-03T01:00:00Z');   // (10:00 at the island)
Date.now = () => now;
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }), getElementById: () => null } });
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
function island(brain: any = null) {
  store.clear(); now = Date.parse('2026-10-03T01:00:00Z'); Math.random = mulberry32(31);
  const f = (x: number) => (x < 0 || x > 300 ? -3 : 2), T: any = { ground: f, floor: f, top: f, landCover: () => ({ can: 0, sand: 1 }), vegH: () => 0, solids: new Solids() };
  const R: any = makeResidents({ id: 'kayama', lat: 24.37, lon: 124.03, f } as any, T, ['テスト魚'], ['テスト鳥']);
  R.setBrain(brain);
  const by = (id: string) => R.list.find((r: any) => r.id === id);
  for (const r of R.list) if (r.id === 'dot' || r.id === 'lantern') { r.pos.set(150, 2, 0); r.task = { kind: 'wander', x: 150, z: 0, act: 'idle', dur: 1e9, t: 0, arrived: true }; }
  return { R, rakko: by('rakko'), kame: by('kame') };
}
async function run(R: any, secs: number, until?: () => boolean) {
  for (let i = 0; i < secs * 4; i++) { now += 250; R.update(0.25, now, new THREE.Vector3(0, 50, 0)); await Promise.resolve(); await Promise.resolve(); if (until?.()) return true; }
  return false;
}
const lines = (r: any, key = 'body') => r.diary.filter((e: any) => e.key === key).map((e: any) => e.text);

{ // 1 the body's costs, and the food's own stock
  const d = drain('rakko', 'dive', 'forage').hunger, f = drain('rakko', 'float', 'float').hunger;
  want('1 a dive costs more than floating', d > 3 * f, `${(d / f).toFixed(1)}x`);
  const rnd = mulberry32(5), p = makePatch('p', 0, 0, rnd, 0); let got = 0;
  for (let i = 0; i < 40; i++) if (dive(p, 0.3, rnd).prey) got++;
  const total = p.max.urchin + p.max.crab + p.max.clam, left = p.stock.urchin + p.stock.crab + p.stock.clam;
  want('1 a patch gives what it has and runs out', got === total && left === 0, `${got}/${total}`);
  regrow(p, 3 * BODY.regrowMin * 60e3);
  want('1 and comes back with time', p.stock.urchin + p.stock.crab + p.stock.clam === 3);
}
{ // 2 too hungry: weak dives, told with how hungry it was; its mark moves
  const { R, rakko } = island();
  const p = R.patches[0]; rakko.pos.set(p.x, -3, p.z); rakko.wet = true; rakko.task = null; rakko.hunger = 0.84; rakko.sleepy = 0.1;
  for (const pp of R.patches) for (const k of ['urchin', 'crab', 'clam']) pp.stock[k] = 0;   // (nothing there now)
  const eat0 = rakko.body.learn.eatAt;
  await run(R, 1800, () => (rakko.body.troubles.weak ?? 0) > 0);
  want('2 weak dives come up short: a trouble, in its diary with how hungry', (rakko.body.troubles.weak ?? 0) > 0 && lines(rakko).some((t: string) => /力が出なかった.*おなか/.test(t)), lines(rakko).slice(-1)[0] ?? 'none');
  want('2 its own mark to go and eat moves earlier', rakko.body.learn.eatAt < eat0, `${eat0} → ${rakko.body.learn.eatAt.toFixed(2)}`);
}
{ // 3 chilled (Rakko), stuck (Kamemaru)
  const { R, rakko, kame } = island();
  rakko.pos.set(-60, -3, -60); rakko.wet = true; rakko.hunger = 0.95; rakko.sleepy = 0.1; rakko.task = { kind: 'float', x: -60, z: -60, act: 'float', dur: 1e9, t: 0, arrived: true, wet: true };
  for (const p of R.patches) for (const k of ['urchin', 'crab', 'clam']) p.stock[k] = 0;
  await run(R, 30);
  want('3 Rakko chilled: floats and grooms, nothing else', (rakko.body.troubles.cold ?? 0) === 1 && rakko.task?.kind === 'shiver', rakko.task?.kind);
  kame.pos.set(250, 2, 0); kame.wet = false; kame.hunger = 0.97; kame.sleepy = 0.1; kame.task = null;
  await run(R, 30, () => kame.task?.kind === 'rest');
  want('3 Kamemaru too hungry: hauls out and lies still', kame.task?.kind === 'rest' && (kame.body.troubles.stuck ?? 0) === 1, kame.task?.kind);
}
{ // 4 dozing off; things slipping
  const { R, rakko } = island();
  rakko.pos.set(-60, -3, -60); rakko.wet = true; rakko.hunger = 0.2; rakko.sleepy = 0.95; rakko.task = { kind: 'float', x: -60, z: -60, act: 'float', dur: 1e9, t: 0, arrived: true, wet: true };
  const sleep0 = rakko.body.learn.sleepAt;
  await run(R, 10);
  want('4 very sleepy: dozes off where it is', rakko.task?.kind === 'doze' && (rakko.body.troubles.doze ?? 0) === 1, rakko.task?.kind);
  want('4 and rests sooner after', rakko.body.learn.sleepAt < sleep0);
  rakko.sleepy = 0.5; const at0 = rakko.pos.clone(); rakko.task.t = rakko.task.dur;
  await run(R, 2);
  want('4 Rakko wakes somewhere else', rakko.pos.distanceTo(at0) > 20 && lines(rakko).some((t: string) => /流されて/.test(t)), `${rakko.pos.distanceTo(at0).toFixed(0)} m`);
  rakko.pos.set(20, 2, 10); rakko.wet = false; rakko.sleepy = 0.85; rakko.holding = 'shell'; R.items.list.length = 0;
  rakko.task = { kind: 'pile', x: 295, z: 10, act: 'carry', dur: 3, t: 0, arrived: false };
  await run(R, 1800, () => !rakko.holding);
  want('4 half asleep, what it carries slips from its paws', !rakko.holding && (rakko.body.troubles.fumble ?? 0) === 1 && R.items.list.some((it: any) => it.kind === 'shell'), lines(rakko).slice(-1)[0] ?? '');
}
{ // 5 a quiet day eases the marks back; its mind gets its body and its places
  const b = bodyState('rakko'); newDay(b, 'rakko', '2026-10-01'); trouble(b, 'weak'); const low = b.learn.eatAt;
  newDay(b, 'rakko', '2026-10-02'); const kept = b.learn.eatAt; newDay(b, 'rakko', '2026-10-03');
  want('5 a day with trouble keeps the mark; a quiet day eases it back', kept === low && b.learn.eatAt > low, `${low.toFixed(2)} ${kept.toFixed(2)} ${b.learn.eatAt.toFixed(2)}`);
  let seen: BrainInput | null = null;
  const { R, rakko } = island(async (i: BrainInput) => { if (i.who === 'rakko') seen = i; return null; });
  rakko.pos.set(-60, -3, -60); rakko.wet = true; rakko.hunger = 0.6; rakko.task = null; (R.mind(rakko) as any).lastCall = -1e12; (R.mind(rakko) as any).why = '次にすること';
  await run(R, 30, () => !!seen);
  const s: any = seen;
  want('5 its mind is given its body and places to eat', !!s?.now.body && s.now.body['おなか'] === 40 && s.options.some((o: any) => o.action === 'eat') && !JSON.stringify(s).includes('weakAt'), s ? JSON.stringify(s.now.body) : 'no call');
}
{ // 6 by habit: past its own mark, it goes to eat
  const { R, rakko } = island();
  rakko.pos.set(-60, -3, -60); rakko.wet = true; rakko.hunger = rakko.body.learn.eatAt + 0.05; rakko.sleepy = 0.1; rakko.task = null;
  await run(R, 120, () => rakko.task?.kind === 'forage' || rakko.task?.kind === 'eat');
  want('6 by habit, past its own mark: it goes to eat', rakko.task?.kind === 'forage' || rakko.task?.kind === 'eat', rakko.task?.kind);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
