// A few wild southern sea otters keep to the kelp canopy at Point Lobos. They float on their backs, groom,
// dive to forage on the bottom and come up to eat off their chests, and sleep. They are there from the start
// and stay (nothing appears or leaves in view). How many, and how they spend their time, are design values,
// never a local count. A plain otter body, not the island's resident Rakko: no look or identity is shared.
import * as THREE from 'three';
import { mulberry32, hyp } from '../core/math';
import { creatureKit, type Food } from '../robots/creatures';
import { cmats } from '../robots/residents';
import type { Robot, Act } from '../robots/models';
import { swellAt, surfaceAt } from '../ocean/air';
import { logEvent, type Env, type Subject } from './env';

export interface OtterTerrain { top(x: number, z: number): number }
type Doing = 'float' | 'groom' | 'swim' | 'dive' | 'eat' | 'sleep';
const STATUS: Record<Doing, string> = {
  float: '仰向けに浮かんでいる', groom: '毛づくろいをしている', swim: '腹ばいで泳いでいる',
  dive: '海底へ潜って餌を探している', eat: '胸の上で獲物を食べている', sleep: '仰向けで眠っている',
};
const SCALE = 1.15;   // the shared body is about a metre nose to tail; an adult southern sea otter, a little more
const SEE = 85;       // beyond this it is a speck at most (and lost in the fog under water): not drawn
const ease = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

interface Otter {
  body: Robot; home: THREE.Vector3; pos: THREE.Vector3; heading: number; turn: number;
  doing: Doing; t: number; dur: number; food: Food; key: number;
  to: THREE.Vector3; floor: number; clock: number; sink?: number;
}

export class LobosOtters {
  readonly list: Otter[] = [];
  private random: () => number;
  constructor(private T: OtterTerrain, group: THREE.Group, anchors: { pos: THREE.Vector3; top: THREE.Vector3 }[], seed: number, n = 3) {
    this.random = mulberry32(seed ^ 0x4f545452);
    const kit = creatureKit(cmats());
    // where the canopy reaches the surface over water deep enough to forage in, inside the sea
    const ok = (x: number, z: number) => Math.abs(x) < 80 && Math.abs(z) < 80 && this.T.top(x, z) < -7;
    const canopy = anchors.filter((a) => a.top.y > -1.5 && ok(a.pos.x, a.pos.z));
    if (!canopy.length) return;
    const first = canopy[Math.floor(this.random() * canopy.length)].pos;
    const near = canopy.filter((a) => { const d = hyp(a.pos.x - first.x, a.pos.z - first.z); return d > 5 && d < 24; });
    for (let i = 0; i < n; i++) {
      const a = i === 0 || !near.length ? first : near[Math.floor(this.random() * near.length)].pos;
      const home = new THREE.Vector3(a.x + (this.random() - 0.5) * 3, 0, a.z + (this.random() - 0.5) * 3);
      const body = kit.makeSeaOtter(); body.root.scale.setScalar(SCALE); group.add(body.root);
      const o: Otter = { body, home, pos: home.clone(), heading: this.random() * Math.PI * 2, turn: 0,
        doing: 'float', t: 0, dur: 0, food: '', key: i * 7 + 1, to: home.clone(), floor: 0, clock: this.random() * 100 };
      this.next(o, 0, true); o.t = this.random() * o.dur * 0.8;   // (each already part way through something)
      this.list.push(o);
    }
  }

  // what it does next: a spell of floating, grooming, a dive (always followed by eating what it brought up),
  // a short swim to another spot in the canopy, or sleep (more of it at night)
  private next(o: Otter, night: number, first = false) {
    const r = this.random, prev = o.doing;
    let d: Doing;
    if (prev === 'dive' && !first) d = 'eat';
    else {
      const w: [Doing, number][] = [['float', 0.22], ['groom', 0.16], ['dive', 0.3 * (1 - night * 0.4)], ['swim', 0.12], ['sleep', 0.12 + night * 0.4]];
      let s = r() * w.reduce((a, b) => a + b[1], 0); d = w[w.length - 1][0];
      for (const [k, v] of w) { s -= v; if (s <= 0) { d = k; break; } }
      if (first && d === 'dive') d = 'float';
    }
    o.doing = d; o.t = 0; o.key++;
    o.dur = d === 'float' ? 30 + r() * 50 : d === 'groom' ? 16 + r() * 18 : d === 'dive' ? 55 + r() * 30 : d === 'eat' ? 28 + r() * 30 : d === 'sleep' ? 70 + r() * 90 : 0;
    if (d === 'eat') o.food = (['urchin', 'crab', 'clam'] as Food[])[Math.floor(r() * 3)];
    else if (d !== 'dive') o.food = '';
    if (d === 'swim') {
      // somewhere else in the canopy near home, over open water
      for (let k = 0; k < 12; k++) {
        const a = r() * Math.PI * 2, rr = 3 + r() * 9, x = o.home.x + Math.cos(a) * rr, z = o.home.z + Math.sin(a) * rr;
        if (this.T.top(x, z) < -4 && Math.abs(x) < 90 && Math.abs(z) < 90) { o.to.set(x, 0, z); break; }
      }
      o.dur = hyp(o.to.x - o.pos.x, o.to.z - o.pos.z) / 0.55 + 2;
    }
    if (d === 'dive') o.floor = this.T.top(o.pos.x, o.pos.z);
  }

  update(dt: number, env: Env, cam: THREE.Vector3) {
    if (!(dt > 0)) return;
    for (const o of this.list) {
      o.t += dt; o.clock += dt;
      if (o.t >= o.dur) {
        const was = o.doing;
        this.next(o, env.night);
        if (was === 'dive') logEvent(env, 'otter', 'ラッコが獲物を抱えて水面へ戻り、仰向けで食べはじめる', o.pos.x, o.pos.z, () => o.pos);
      }
      const k = o.dur > 0 ? o.t / o.dur : 0;
      const y0 = swellAt(o.pos.x, o.pos.z); let y = y0, speed = 0;
      if (o.doing === 'swim') {
        const dx = o.to.x - o.pos.x, dz = o.to.z - o.pos.z, d = hyp(dx, dz);
        if (d > 0.3) { o.turn = Math.atan2(dx, dz); speed = Math.min(0.55, d * 0.4); }
      } else if (o.doing === 'dive') {
        // head first down, along the bottom feeling for food, then straight up with the catch
        const bottom = this.T.top(o.pos.x, o.pos.z) + 0.3 * SCALE;
        o.floor += (bottom - o.floor) * Math.min(1, dt * 2);
        const down = ease(k / 0.12) * (1 - ease((k - 0.86) / 0.14));
        y = Math.max(y + (o.floor - y) * down, bottom);
        speed = k < 0.12 ? 0.6 : k > 0.86 ? 0.2 : 0.22;
        if (k > 0.12 && k < 0.86 && Math.sin(o.clock * 0.23 + o.key) > 0.6) o.turn += dt * 0.4;   // (searching: wandering to and fro)
        if (k > 0.86) o.food = (['urchin', 'crab', 'clam'] as Food[])[o.key % 3];
        // never off into the rock ahead, nor away from the canopy
        // (a step of rock ahead, or straying from the canopy: it stops and turns rather than climbing it)
        const here = this.T.top(o.pos.x, o.pos.z);
        const blocked = [0.5, 1, 1.6].some((d) => this.T.top(o.pos.x + Math.sin(o.heading) * d, o.pos.z + Math.cos(o.heading) * d) > here + 0.25 * d)
          || hyp(o.pos.x + Math.sin(o.heading) * 1.6 - o.home.x, o.pos.z + Math.cos(o.heading) * 1.6 - o.home.z) > 16;
        if (blocked) { o.turn = o.heading + 1.2; speed *= 0.1; }
      } else {
        // floating: a slow drift round on the swell, staying by its spot in the kelp
        o.turn += Math.sin(o.clock * 0.05 + o.key) * dt * 0.08;
        const dx = o.home.x - o.pos.x, dz = o.home.z - o.pos.z, d = hyp(dx, dz);
        if (d > 10) { o.pos.x += dx / d * dt * 0.05; o.pos.z += dz / d * dt * 0.05; }
      }
      const dh = Math.atan2(Math.sin(o.turn - o.heading), Math.cos(o.turn - o.heading));
      o.heading += dh * Math.min(1, dt * 1.2);
      o.pos.x += Math.sin(o.heading) * speed * dt; o.pos.z += Math.cos(o.heading) * speed * dt;
      // (on the drawn water, not a hand's breadth above a trough of it; lying back, settled in it a little)
      const back = o.doing === 'float' || o.doing === 'sleep' || o.doing === 'groom' || o.doing === 'eat';
      o.sink = (o.sink ?? 0) + ((back ? 0.07 * SCALE : 0) - (o.sink ?? 0)) * Math.min(1, dt * 1.5);
      const w = surfaceAt(o.pos.x, o.pos.z) - o.sink; o.pos.y = Math.min(w, y + w - y0);
      if (o.doing === 'dive') o.pos.y = Math.max(o.pos.y, Math.min(w, this.T.top(o.pos.x, o.pos.z) + 0.3 * SCALE));   // (never into the rock it moved over)
      const r = o.body.root, far = o.pos.distanceTo(cam) > SEE;
      r.visible = !far;
      r.position.copy(o.pos); r.rotation.y = o.heading;
      if (far) continue;
      const act: Act = o.doing === 'swim' ? 'swim' : o.doing;
      o.body.update(o.clock, dt, { act, walk: o.doing === 'swim' ? 1 : 0, wet: true, k, food: o.doing === 'dive' || o.doing === 'eat' ? o.food : '', elapsed: o.t, key: o.key });
    }
  }

  subjects(out: Subject[]) {
    this.list.forEach((o, i) => out.push({ key: `sea-otter:${i}`, label: 'ラッコ', kind: 'big', prio: 2.6,
      size: 1.2, len: 1.2, adult: 1.25, lenK: 0, lenWhat: '体長', reach: 40, hold: 28,
      pos: () => o.pos, live: () => true, status: () => STATUS[o.doing] }));
  }
}

export function makeLobosOtters(oc: { loc: { id: string; seed?: number }; T: OtterTerrain; group: THREE.Group; kelp?: { anchors: { pos: THREE.Vector3; top: THREE.Vector3 }[] } }): LobosOtters | undefined {
  if (oc.loc.id !== 'pointlobos' || !oc.kelp) return undefined;
  const o = new LobosOtters(oc.T, oc.group, oc.kelp.anchors, oc.loc.seed ?? 317);
  return o.list.length ? o : undefined;
}
