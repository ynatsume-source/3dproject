// Rare scenes: the moments a diver meets once in ten dives, or once in a hundred — a train of mantas
// where there is usually one, a wall of fish that fills the whole view, a tornado of jacks, a school of
// hammerheads passing overhead, a heat run of humpbacks, the reef spawning on one night of the year, a
// huge bait ball. Every ten to fifteen minutes in a sea, one of those that can really happen there (at
// this season and hour) is staged near the camera; the rarer ones come up less often.
import * as THREE from 'three';
import type { Species } from '../data/locations';
import { R, rr, clamp } from '../core/math';
import { makeShoalSystem } from './shoal';
import { makeSchoolShade } from './schoolshade';
import { sightRange, unseen, behind, clearDepth } from './unseen';
import { MANTA_GEO, mantaMaterial, WHALE_GEO, whaleMaterial, SHAPES, fishGeometry, fishMaterial } from '../ocean/models';
import { mat } from '../render/common';
import type { Env, Subject } from './env';

export interface RareInfo { id: string; ja: string; note: string }
// gone(): once its time is up, whether all of it has left the scene, out of sight (until then it goes on, leaving;
// nothing is taken away in view: src/eco/unseen.ts)
interface Running { info: RareInfo; t: number; dur: number; update(dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number): void; pos(): THREE.Vector3 | null; status(): string; size: number; kind: Subject['kind']; dispose(): void; gone?(cam: THREE.Vector3, fx: number, fz: number): boolean; quiet?: boolean }
interface Kind { info: RareInfo; weight(loc: any, env: Env): number; start(oc: any, env: Env, cam: THREE.Vector3, fx: number, fz: number): Running | null }

const inMonths = (m: number, list: number[]) => list.includes(m);
// a point some way ahead of the camera, in open water deep enough for it
function ahead(oc: any, cam: THREE.Vector3, fx: number, fz: number, d: number, need: number) {
  for (let k = 0; k < 30; k++) {
    const dd = d * rr(0.8, 1.2), a = Math.atan2(fz, fx) + rr(-0.6, 0.6);
    const x = clamp(cam.x + Math.cos(a) * dd, -125, 125), z = clamp(cam.z + Math.sin(a) * dd, -125, 125);
    if (oc.loc.pelagic || oc.T.top(x, z) < -need) return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(cam.x + fx * d, 0, cam.z + fz * d);
}

// a school, made for the occasion: n fish of this species, all together, active whatever the hour
function tempSchool(oc: any, sp: Species, n: number, at: THREE.Vector3, y: number, head: number, spread: number) {
  const sys: any = makeShoalSystem({ ...sp, schools: 1, n, habitat: 'shoal' }, oc);
  sys.setAlways(true); sys.placeAt(at.x, y, at.z, head, spread);
  oc.group.add(sys.mesh);
  return sys;
}

// a choreographed school: n fish whose every position and heading is given by where(i, t) — a river of
// fish flowing past, a tornado — rather than flocking (a flock bunches into a ball; these fill the view)
// (where() returns false for a fish not in the scene — only ever somewhere it cannot be seen; each fish is also
// kept over the reef under it and under the surface)
function flowSchool(oc: any, sp: Species, n: number, where: (i: number, t: number, p: THREE.Vector3, v: THREE.Vector3) => boolean | void) {
  const g = fishGeometry(SHAPES[sp.shape], true), sw = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) sw.set([R() * 6.28, rr((sp.freq || [7, 10])[0], (sp.freq || [7, 10])[1]), rr(0.9, 1.08)], i * 3);
  g.setAttribute('aSwim', new THREE.InstancedBufferAttribute(sw, 3));
  const shade = makeSchoolShade(g, n, 1, { round: false });   // (a river or a tornado: its depth, not its width)
  const mesh = new THREE.InstancedMesh(g, fishMaterial(sp, true), n); mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  oc.group.add(mesh);
  const size = Array.from({ length: n }, () => rr(sp.size[0], sp.size[1]) / 1.28);
  const p = new THREE.Vector3(), v = new THREE.Vector3(), m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), tgt = new THREE.Vector3();
  const gone = new Uint8Array(n), last = new Float32Array(n * 6);   // (fish taken by a hunter; where each one is and its velocity)
  const flC = new Float32Array(n).fill(NaN);   // (the reef under each fish, read every few frames in turn)
  let frame = 0;
  return {
    mesh, gone, last,
    update(t: number) {
      frame++;
      shade.begin();
      for (let i = 0; i < n; i++) {
        if (gone[i] || where(i, t, p, v) === false) { mesh.setMatrixAt(i, m.makeScale(0, 0, 0)); continue; }
        if ((frame + i) % 8 === 0 || flC[i] !== flC[i]) flC[i] = oc.T.top(p.x, p.z);
        p.y = Math.min(Math.max(p.y, flC[i] + 0.6), -0.6);
        last[i * 6] = p.x; last[i * 6 + 1] = p.y; last[i * 6 + 2] = p.z; last[i * 6 + 3] = v.x; last[i * 6 + 4] = v.y; last[i * 6 + 5] = v.z;
        m.lookAt(tgt.copy(p).add(v), p, up); m.scale(s.setScalar(size[i])); m.setPosition(p);
        mesh.setMatrixAt(i, m);
        shade.set(i, 0, p.x, p.y, p.z);
      }
      shade.end();
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { oc.group.remove(mesh); g.dispose(); (mesh.material as THREE.Material).dispose(); },
  };
}

const KINDS: Kind[] = [
  {
    info: { id: 'mantatrain', ja: 'マンタの群れ', note: 'ふだんは一枚で回っているマンタが、十枚近くも連なってやってくる。繁殖期にメスを追うオスたちの「マンタトレイン」か、プランクトンの濃い潮に集まった群れ。' },
    weight: (loc) => (loc.animals?.manta ? 3 : 0),
    start(oc, env, cam, fx, fz) {
      const n = 7 + Math.floor(R() * 5), giant = (oc.loc.extraGuide || []).some((e: any) => e.id === 'manta' && e.ja === 'オニイトマキエイ');
      // They are out there already: the train comes up from behind the camera, out of sight, and swims on past
      // it into view along a line through open water; each manta keeps clear of the reef under its wings.
      const sp = Math.hypot(fx, fz) || 1, ux = fx / sp, uz = fz / sp;
      // (a line with water deep enough for them the whole way: past an island or over a reef flat, another)
      const st = new THREE.Vector3(), dir = new THREE.Vector3(), aim = new THREE.Vector3();
      const LINE = 38 + 20 + sightRange(oc) * 0.5 + 60;
      let ok = false;
      for (let k = 0; k < 16 && !ok; k++) {
        const b = behind(oc, cam, ux, uz, 38, 9, rr(-0.6, 0.6));
        if (!b) break;
        const pass = rr(4, 9) * (R() < 0.5 ? 1 : -1);
        st.set(b.x, 0, b.z); aim.set(cam.x + ux * 20 - uz * pass, 0, cam.z + uz * 20 + ux * pass);
        dir.subVectors(aim, st).setY(0).normalize();
        ok = true;
        // (and wide enough for the ones swimming beside the line, wingtips and all)
        for (let d = -40; d < LINE && ok; d += 4) for (const o of [0, -5, 5]) if (!oc.loc.pelagic && oc.T.top(st.x + dir.x * d - dir.z * o, st.z + dir.z * d + dir.x * o) > -4.5) ok = false;
      }
      if (!ok) return null;
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const depth = Math.min(-3, Math.max(oc.T.top(cam.x, cam.z) + 4, -12));
      const ms = Array.from({ length: n }, (_, i) => {
        const mesh = new THREE.Mesh(MANTA_GEO, mantaMaterial(giant)); mesh.frustumCulled = false;
        const s = (giant ? rr(2.2, 2.8) : rr(1.4, 2.1)); mesh.scale.setScalar(s); oc.group.add(mesh);
        return { mesh, span: s * 2, lag: i * rr(4, 6), off: new THREE.Vector3(rr(-3, 3) * (i > 0 ? 1 : 0), rr(-1.5, 1.5), 0), ph: R() * 6, y: NaN };
      });
      const lead = new THREE.Vector3(), speed = 1.3, run = 38 + 20 + sightRange(oc) * 0.5;
      const P = new THREE.Vector3();
      const place = (m: typeof ms[number], t: number, dt: number) => {
        const d = (t - m.lag) * speed;   // each follows the one ahead along the same line, a few seconds behind (before it: further back, unseen)
        P.set(st.x + dir.x * d + side.x * m.off.x + Math.sin(t * 0.2 + m.ph) * 0.8, 0, st.z + dir.z * d + side.z * m.off.x + Math.cos(t * 0.17 + m.ph) * 0.8);
        // (over the reef: up and over it in good time, wingtips and all; then back down to its depth)
        const want = clearDepth(oc, P.x, P.z, dir.x, dir.z, depth + m.off.y + Math.sin(t * 0.3 + m.ph) * 0.6, m.span * 0.55, m.span * 0.35 + 0.8, 8);
        m.y = Number.isNaN(m.y) ? want : m.y + (want - m.y) * Math.min(1, dt * 1.2);
        const hard = clearDepth(oc, P.x, P.z, dir.x, dir.z, -1e3, m.span * 0.55, m.span * 0.3 + 0.4, 0);   // (and never in it, whatever the easing)
        P.y = Math.max(m.y, hard);
        return P;
      };
      for (const m of ms) place(m, 0, 1);
      return {
        info: KINDS[0].info, t: 0, dur: (run + n * 5 * speed) / speed, size: 9, kind: 'manta',   // (framed as one long animal: several mantas in the picture)
        update(dt) {
          this.t += dt;
          for (const m of ms) {
            const prevY = m.mesh.position.y, p = place(m, this.t, dt);
            m.mesh.position.copy(p);
            const vy = (p.y - prevY) / Math.max(dt, 1e-3);
            m.mesh.rotation.set(-0.05 + Math.sin(this.t * 0.3 + m.ph) * 0.06 - Math.atan2(vy, speed) * 0.7, Math.atan2(dir.x, dir.z), Math.sin(this.t * 0.25 + m.ph) * 0.15, 'YXZ');
            const U = (m.mesh.material as THREE.ShaderMaterial).uniforms;
            U.uBeat.value = 0; U.uPhase.value += dt * (0.97 + 0.06 * Math.sin(m.ph));
            U.uFeed.value = 0; U.uMouth.value = 0.10 + 0.018 * Math.sin(this.t * 0.7 + m.ph);
            U.uBank.value = Math.sin(this.t * 0.25 + m.ph) * 0.10; U.uAir.value = 0;
          }
          lead.copy(ms[Math.floor(n / 2)].mesh.position);
        },
        pos: () => lead, status: () => `${n}枚のマンタが連なって泳いでいく`,
        // (on its way, it is taken away only once every one of them is out of sight)
        gone: (c, gx, gz) => ms.every((m) => unseen(oc, m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, c, gx, gz, m.span)),
        dispose() { for (const m of ms) { oc.group.remove(m.mesh); (m.mesh.material as THREE.Material).dispose(); } },
      };
    },
  },
  {
    info: { id: 'fishwall', ja: '視界を埋めつくす魚の大群', note: '何千匹もの小魚が、壁のように目の前を通り過ぎていく。群れの中に入ると、あたり一面が魚だけになる。' },
    weight: (loc) => (loc.pelagic || loc.species.some((s: Species) => ['umeiro', 'hanatakasago', 'katsuo'].includes(s.id)) || loc.bait ? 4 : 0),
    start(oc, env, cam, fx, fz) {
      const sp: Species = oc.loc.species.find((s: Species) => ['umeiro', 'hanatakasago', 'katsuo'].includes(s.id)) ?? oc.loc.bait?.sp;
      if (!sp) return null;
      // a river of fish some 24 m wide and 8 m deep, flowing across the view and right through the camera. It
      // comes in from the side, out of sight, its head first, flows past for a minute or so and goes on out the
      // other side; no fish appears or vanishes where it can be seen
      const n = sp.size[1] > 0.4 ? 900 : 2800, c = new THREE.Vector3(cam.x, Math.min(cam.y, -3), cam.z);
      const dir = new THREE.Vector3(-fz, 0, fx).normalize(), side = new THREE.Vector3(fx, 0, fz).normalize(), speed = sp.size[1] > 0.4 ? 3 : 1.4;
      const EDGE = 45, Lb = sp.size[1] > 0.4 ? 110 : 64;   // (in and out this far to the side; the river this long)
      const seed = Array.from({ length: n }, () => [R(), R() * 2 - 1, R() * 2 - 1, R() * 6.28, R()]);
      const fl = flowSchool(oc, sp, n, (i, t, p, v) => {
        const [a, b, h, ph, rag] = seed[i];
        // (a ragged head and tail: each fish a little ahead or behind its place)
        const along = t * speed - EDGE - a * Lb + (rag - 0.5) * 6;
        if (along < -EDGE || along > EDGE) return false;   // (still out there to the side, or gone on past: unseen)
        const wave = Math.sin(along * 0.15 + t * 0.4) * 2;                  // the whole river snakes a little
        p.copy(c).addScaledVector(dir, along).addScaledVector(side, 2 + b * 7 + wave);
        p.y = c.y + h * 2.6 + Math.sin(t * 0.7 + ph) * 0.3;
        v.copy(dir).addScaledVector(side, Math.cos(along * 0.15 + t * 0.4) * 0.3);
        return true;
      });
      const at = new THREE.Vector3(), dur = (2 * EDGE + Lb + 6) / speed;
      const run: Running = {
        info: { ...KINDS[1].info, ja: `${sp.ja}の大群` }, t: 0, dur, size: 6, kind: 'school',
        update(dt) { this.t += dt; fl.update(this.t); },
        // (the camera stays facing across the river's way, so its head comes in from out of the picture)
        pos: () => at.copy(c).addScaledVector(side, 2),
        status: () => '何千匹もの群れが、あたり一面を埋めつくしている',
        dispose() { fl.dispose(); },
      };
      return run;
    },
  },
  {
    info: { id: 'tornado', ja: 'ギンガメアジのトルネード', note: '何百匹ものギンガメアジが、渦を巻くように回りつづける。その中心から見上げると、銀色の竜巻のなかにいるよう。' },
    weight: (loc) => (loc.species.some((s: Species) => s.id === 'gingameaji') ? 3 : 0),
    start(oc, env, cam, fx, fz) {
      const sp: Species = oc.loc.species.find((s: Species) => s.id === 'gingameaji');
      if (!sp) return null;   // (none in this sea: asked for by name, from the test panel)
      // The school is out there already: it comes in from the blue as one long school, and as it arrives
      // the fish at its head start to circle, then the rest, until the whole school is turning in a column;
      // the hunters round about notice and close in. After a couple of minutes the column loosens, the
      // fish fall back into a school, and it swims off the way it was going. Nothing appears or vanishes.
      const c = ahead(oc, cam, fx, fz, 10, 9), base = Math.max(oc.T.top(c.x, c.z) + 3.5, -16), top = Math.min(base + 9, -1.5), mid = (base + top) / 2;
      const n = 1300, dir = R() < 0.5 ? 1 : -1;
      // (in from one side, off along much the same line: from somewhere it cannot yet be seen)
      const SPEED = 1.9, FAR = 58;
      let ina = 0;
      for (let k = 0; k < 24; k++) {
        ina = Math.atan2(fz, fx) + rr(1.2, 2.6) * (R() < 0.5 ? 1 : -1);
        if (unseen(oc, c.x - Math.cos(ina) * FAR, mid, c.z - Math.sin(ina) * FAR, cam, fx, fz, 12)) break;
      }
      const outa = ina + rr(-0.6, 0.6);
      const A = new THREE.Vector3(Math.cos(ina), 0, Math.sin(ina)), E = new THREE.Vector3(Math.cos(outa), 0, Math.sin(outa));
      const tA = FAR / SPEED, dur = tA + 120, tD = dur - 45;
      const seed = Array.from({ length: n }, () => [R(), R(), R() * 6.28, rr(0.8, 1.2), R(), R(), R() * 2 - 1, R() * 2 - 1, R() * 2 - 1]);
      const ss = (a: number, b: number, x: number) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
      const sc = new THREE.Vector3(), q = new THREE.Vector3();
      // the travelling school: its middle, and the way it heads, at time t
      const school = (t: number, out: THREE.Vector3) => {
        if (t < tD) { const d = Math.max(0, FAR - t * SPEED); out.set(c.x - A.x * d, mid, c.z - A.z * d); return t < tA ? A : E; }
        const d = (t - tD) * SPEED * 0.9; out.set(c.x + E.x * d, mid, c.z + E.z * d); return E;
      };
      const where = (i: number, t: number, p: THREE.Vector3) => {
        const [h, rj, a0, sp2, jn, lv, ox, oy, oz] = seed[i];
        // in the column: every fish the same way round, each on its own slightly tilted circle
        const y0 = base + (top - base) * h, md = Math.sin(h * Math.PI);
        const rb = (2.6 + 3.2 * md) * (0.7 + 0.6 * rj), w = dir * 0.85 * sp2 / rb, a = a0 + w * t;
        const r = rb + Math.sin(t * 0.3 + h * 5) * 0.4, ph = a + h * 9;
        p.set(c.x + Math.cos(a) * r, y0 + 0.45 * Math.sin(ph), c.z + Math.sin(a) * r);
        // in the school: a long, loose shoal along its heading, the fish weaving a little
        const hd = school(t, sc), sx = -hd.z, sz = hd.x;
        q.set(sc.x + hd.x * ox * 9 + sx * oz * 4.5 + Math.sin(t * 0.6 + a0) * 0.4, sc.y + oy * 2.2 + Math.sin(t * 0.5 + a0 * 2) * 0.3, sc.z + hd.z * ox * 9 + sz * oz * 4.5 + Math.cos(t * 0.55 + a0) * 0.4);
        // which it is in: the head of the school (ox > 0) joins first, the tail last; they leave in their own order
        const join = ss(tA - 8 + (1 - ox) * 7 + jn * 4, tA - 2 + (1 - ox) * 7 + jn * 4, t), leave = ss(tD + lv * 14, tD + 6 + lv * 14, t);
        const k = join * (1 - leave);
        p.lerp(q, 1 - k);
      };
      const _p2 = new THREE.Vector3();
      const fl = flowSchool(oc, sp, n, (i, t, p, v) => { where(i, t, p); where(i, t + 0.05, _p2); v.subVectors(_p2, p).multiplyScalar(20); });
      // to the hunters it is a school like any other: they pick off stragglers at its edge
      const prey = {
        x: c.x, y: mid, z: c.z, alive: n, label: sp.ja,
        scare() { /* (a tornado holds together: it just tightens) */ },
        take() { const i = Math.floor(R() * n); if (fl.gone[i]) return false; fl.gone[i] = 1; prey.alive--; return true; },
        pick(x: number, y: number, z: number) { let b = -1, bs = Infinity; for (let k = 0; k < 40; k++) { const i = Math.floor(R() * n); if (fl.gone[i]) continue; const L = fl.last, d = Math.hypot(L[i * 6] - x, L[i * 6 + 1] - y, L[i * 6 + 2] - z); if (d < bs) { bs = d; b = i; } } return b; },
        at(i: number, out: any, vel?: any) { if (i < 0 || fl.gone[i]) return false; const L = fl.last; out.x = L[i * 6]; out.y = L[i * 6 + 1]; out.z = L[i * 6 + 2]; if (vel) { vel.x = L[i * 6 + 3]; vel.y = L[i * 6 + 4]; vel.z = L[i * 6 + 5]; } return true; },
        chased() { /* (it stays in the wall of fish) */ },
        safe() { return false; },
        kill(i: number) { if (fl.gone[i] || prey.alive <= 2) return false; fl.gone[i] = 1; prey.alive--; return true; },
      };
      env.prey.push(prey as any);
      const at = new THREE.Vector3();
      let excited = 0;
      const run: Running = {
        info: KINDS[2].info, t: 0, dur, size: 7, kind: 'school',
        update(dt) {
          this.t += dt; fl.update(this.t);
          const hd = school(this.t, sc);
          if (this.t > tA && this.t < tD) { prey.x = c.x; prey.z = c.z; prey.y = mid; } else { prey.x = sc.x; prey.z = sc.z; prey.y = sc.y; }
          // once it is turning, the hunters round about take notice (now and again, while it lasts)
          if (this.t > tA + 6 && this.t < tD && (excited -= dt) < 0) { excited = 20; for (const f of oc.fish) f.excite?.(c.x, c.z, 60); }
          void hd;
        },
        pos: () => (run.t < tA - 6 || run.t > tD + 15 ? (school(run.t, sc), at.copy(sc)) : at.set(c.x, mid, c.z)),
        // (swimming off: taken away only once the school is out of sight)
        gone: (cc, gx, gz) => { school(run.t, sc); return unseen(oc, sc.x, sc.y, sc.z, cc, gx, gz, 12); },
        status() { return this.t < tA - 6 ? '沖から、ギンガメアジの大群が近づいてくる' : this.t < tA + 8 ? '群れの先頭から、渦を巻きはじめた' : this.t < tD ? '銀色の渦が、ゆっくりと回りつづけている' : '渦がほどけ、群れになって沖へ泳ぎ去っていく'; },
        dispose() { fl.dispose(); const k = env.prey.indexOf(prey as any); if (k >= 0) env.prey.splice(k, 1); },
      };
      return run;
    },
  },
  {
    info: { id: 'hammers', ja: 'シュモクザメの大群', note: '何十匹ものアカシュモクザメが、群れをつくって頭上を通り過ぎていく。昼に群れて休み、夜に散って狩りをする彼らの、昼の姿。' },
    weight: (loc, env) => {
      const sp = loc.species.find((s: Species) => s.id === 'akashumoku'); if (!sp || env.night > 0.5) return 0;
      if (loc.id === 'galapagos') return 3;
      if (loc.id === 'miyako' || loc.id === 'kayama') return inMonths(env.month, [12, 1, 2, 3]) ? 2 : 0;   // (Okinawa: winter)
      if (loc.id === 'redsea') return inMonths(env.month, [6, 7, 8]) ? 1.5 : 0;                           // (Elphinstone: early summer)
      return 0.6;
    },
    start(oc, env, cam, fx, fz) {
      const sp: Species = oc.loc.species.find((s: Species) => s.id === 'akashumoku');
      if (!sp) return null;
      // the school comes over from behind the camera, out of sight, high in the blue, and passes on over it into
      // view; its time up, it heads off the way it was going and is gone only once out of sight
      const b = behind(oc, cam, fx, fz, 40, 14, rr(-0.6, 0.6));
      if (!b) return null;
      const at = new THREE.Vector3(b.x, 0, b.z), head = Math.atan2(cam.z + fz * 30 - at.z, cam.x + fx * 30 - at.x);
      const y = Math.min(Math.max(cam.y + 6, oc.T.top(at.x, at.z) + 12), -5);   // (well up in the blue, over the camera)
      const sys = tempSchool(oc, { ...sp, alt: [10, 14], speed: 0.9 }, 60 + Math.floor(R() * 40), at, y, head, 14);
      sys.steerTo(head);
      return {
        info: KINDS[3].info, t: 0, dur: 120, size: 10, kind: 'school',
        update(dt, env2, cam2, fx2, fz2) { this.t += dt; sys.update(dt, env2, cam2, fx2, fz2); },
        pos: () => sys.leader(), status: () => 'ハンマーの頭を並べて、群れが通り過ぎていく',
        gone: (c, gx, gz) => { const L = sys.leader(); return unseen(oc, L.x, L.y, L.z, c, gx, gz, 16); },
        dispose() { oc.group.remove(sys.mesh); sys.mesh.geometry.dispose(); },
      };
    },
  },
  {
    info: { id: 'heatrun', ja: 'ザトウクジラの群れ（ヒートラン）', note: '一頭のメスを何頭ものオスが追いかけて、全速力で泳いでいく。体をぶつけ合い、泡を吐き、水面を割って進む、繁殖期のクジラの競争。' },
    weight: (loc, env) => (loc.whales && inMonths(env.month, [1, 2, 3]) ? 3 : loc.pelagic && inMonths(env.month, [1, 2, 3, 4]) ? 1 : 0),
    start(oc, env, cam, fx, fz) {
      // the pod comes racing up from behind the camera, out of sight, and on past it, along a line with deep
      // water all the way; taken away only once every whale is out of sight again
      const n = 4 + Math.floor(R() * 3), sp0 = Math.hypot(fx, fz) || 1, ux = fx / sp0, uz = fz / sp0;
      const st = new THREE.Vector3(), dir = new THREE.Vector3();
      let ok = false;
      for (let k = 0; k < 16 && !ok; k++) {
        const b = behind(oc, cam, ux, uz, 70, 10, rr(-0.5, 0.5)); if (!b) break;
        const pass = rr(10, 18) * (R() < 0.5 ? 1 : -1);
        st.set(b.x, 0, b.z); dir.set(cam.x + ux * 30 - uz * pass - b.x, 0, cam.z + uz * 30 + ux * pass - b.z).normalize();
        ok = true;
        for (let d = -60; d < 220 && ok; d += 5) if (!oc.loc.pelagic && oc.T.top(st.x + dir.x * d, st.z + dir.z * d) > -9) ok = false;
      }
      if (!ok) return null;
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const ws = Array.from({ length: n }, (_, i) => {
        const len = i === 0 ? rr(12.5, 14) : rr(11, 13.5), m = whaleMaterial(R()), mesh = new THREE.Mesh(WHALE_GEO, m);
        mesh.scale.setScalar(len); mesh.frustumCulled = false; oc.group.add(mesh);
        return { mesh, m, off: new THREE.Vector3(rr(-8, 8) * (i ? 1 : 0), 0, -i * rr(8, 14)), ph: R() * 6, up: rr(10, 25) };
      });
      const speed = 2.6, run = 150, lead = new THREE.Vector3();
      return {
        info: KINDS[4].info, t: 0, dur: run / speed + 20, size: 13, kind: 'giant',
        update(dt) {
          this.t += dt;
          const d = this.t * speed;
          for (const w of ws) {
            // racing along just under the surface, each now and then breaking it to blow
            w.up -= dt; const surf = w.up < 0 ? Math.sin(Math.min(1, -w.up / 6) * Math.PI) : 0; if (w.up < -6) w.up = rr(8, 20);
            const y = -3.5 - 1.5 * Math.sin(this.t * 0.3 + w.ph) + 3.2 * surf;
            const x = st.x + dir.x * (d + w.off.z) + side.x * (w.off.x + Math.sin(this.t * 0.25 + w.ph) * 2), z = st.z + dir.z * (d + w.off.z) + side.z * (w.off.x + Math.sin(this.t * 0.25 + w.ph) * 2);
            const vy = (y - w.mesh.position.y) / Math.max(dt, 1e-3);
            w.mesh.position.set(x, y, z);
            w.mesh.rotation.set(-Math.atan2(vy, speed) * 0.6, Math.atan2(dir.x, dir.z), Math.sin(this.t * 0.4 + w.ph) * 0.12, 'YXZ');
            (w.m.uniforms.uStroke as { value: number }).value = 1.6;
          }
          lead.copy(ws[0].mesh.position);
        },
        pos: () => lead, status: () => `${n}頭のザトウクジラが、水面を割って全速力で泳いでいく`,
        gone: (c, gx, gz) => ws.every((w) => unseen(oc, w.mesh.position.x, w.mesh.position.y, w.mesh.position.z, c, gx, gz, 14)),
        dispose() { for (const w of ws) { oc.group.remove(w.mesh); w.m.dispose(); } },
      };
    },
  },
  {
    info: { id: 'spawning', ja: 'サンゴの一斉産卵', note: '一年に一度、満月のあとの夜、リーフじゅうのサンゴがいっせいに卵と精子の小さな粒を放つ。ピンクや橙の粒が、雪が逆さに降るように水面へ昇っていく。' },
    weight: (loc, env) => {
      if (env.night < 0.6 || loc.pelagic) return 0;
      const season: Record<string, number[]> = { gbr: [11, 12], miyako: [5, 6], kayama: [5, 6], maldives: [3, 4], redsea: [7, 8] };
      return inMonths(env.month, season[loc.id] || []) ? 4 : 0;
    },
    start(oc, env, cam) {
      // tens of thousands of little bundles rising from the reef around the camera
      const N = 14000, pos = new Float32Array(N * 3), sd = new Float32Array(N);
      for (let i = 0; i < N; i++) { const x = cam.x + rr(-25, 25), z = cam.z + rr(-25, 25); pos.set([x, oc.T.top(x, z) + R() * 0.3, z], i * 3); sd[i] = R(); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1));
      const m = mat(
        `attribute float aSeed; uniform float uAge; varying float vSeed; varying vec3 vWp;
         void main(){
           vec3 p = position;
           float t0 = uAge - aSeed * 40.0, t = t0 < 0.0 ? 0.0 : mod(t0, 50.0);   // each colony lets go in its own moment, over and over
           p.y = p.y + t * (0.12 + 0.1 * fract(aSeed * 7.3)); if (p.y > -0.3) t = 0.0;   // rising slowly to the surface
           p.x += sin(uTime * 0.6 + aSeed * 40.0) * 0.15 * min(t, 3.0); p.z += cos(uTime * 0.5 + aSeed * 31.0) * 0.15 * min(t, 3.0);
           vec4 wp = modelMatrix * vec4(p, 1.0); vWp = wp.xyz; vSeed = step(0.001, t);
           vec4 mv = viewMatrix * wp; gl_Position = projectionMatrix * mv;
           gl_PointSize = vSeed * clamp(40.0 / -mv.z, 1.5, 7.0);
         }`,
        `varying float vSeed; varying vec3 vWp;
         void main(){
           vec2 q = gl_PointCoord - 0.5; if (dot(q, q) > 0.25 || vSeed < 0.5) discard;
           vec3 col = mix(vec3(1.0, 0.55, 0.6), vec3(1.0, 0.75, 0.45), fract(vWp.x * 3.1)) * (0.35 + 0.4 * uAmb) + lamp(vec3(1.0, 0.7, 0.7), vWp, vec3(0.0, 1.0, 0.0));
           gl_FragColor = vec4(fogIt(col, vWp), 0.9);
         }`,
        { uniforms: { uAge: { value: 0 } }, opts: { transparent: true, depthWrite: false } });
      const pts = new THREE.Points(g, m); pts.frustumCulled = false; oc.group.add(pts);
      const c = new THREE.Vector3(cam.x, cam.y, cam.z);
      return {
        info: KINDS[5].info, t: 0, dur: 150, size: 3, kind: 'critter',
        update(dt) { this.t += dt; (m.uniforms.uAge as { value: number }).value = this.t; },
        pos: () => c, status: () => 'サンゴの卵と精子の粒が、いっせいに昇っていく',
        dispose() { oc.group.remove(pts); g.dispose(); m.dispose(); },
      };
    },
  },
  {
    info: { id: 'bigbait', ja: '大規模なベイトボール', note: '小魚の大群が捕食者に追い上げられ、水面近くで球のように固まる。四方から魚が突っ込み、空からは海鳥が飛び込む。' },
    weight: (loc, env) => (loc.bait && env.night < 0.5 ? 2 : 0),
    start(oc, env, cam, fx, fz) {
      if (!oc.bait || oc.bait.st.active) return null;
      if (!oc.bait.start(cam, fx, fz, env)) return null;
      return {
        // (a day the hunters are out in numbers and hungry: they come to the school, and the ball is theirs to make —
        // ADR 0005. Over once a ball has come and gone, or if none has formed in three minutes)
        info: KINDS[6].info, t: 0, dur: 600, size: 6, kind: 'hunt', seen: false, quiet: true,
        update(dt: number) { this.t += dt; if (oc.bait.st.active) (this as any).seen = true; else if ((this as any).seen || this.t > 180) this.t = this.dur; },
        pos: () => (oc.bait.st.active ? oc.bait.st.c : null), status: () => '捕食者と海鳥が、四方から突っ込んでいる',
        dispose() { /* the bait ball winds itself down */ },
      };
    },
  },
];
export const RARE_LIST: RareInfo[] = KINDS.map((k) => k.info);

export function makeRareEvents(oc: any) {
  let wait = rr(480, 720), run: Running | null = null, started: Running | null = null;
  return {
    get running() { return run; },
    // the one that has just begun (read once by the app, to announce it and go and film it)
    takeStarted() { const s = started; started = null; return s; },
    // every kind, with how likely it is here now (0: not at this sea or not at this time): for the test panel
    kinds(env: Env) { return KINDS.map((k) => ({ id: k.info.id, ja: k.info.ja, w: k.weight(oc.loc, env) })); },
    // what could happen here now, and how likely each is
    options(env: Env) { return KINDS.map((k) => ({ k, w: k.weight(oc.loc, env) })).filter((o) => o.w > 0); },
    start(id: string | null, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
      if (run) { run.dispose(); run = null; }
      const opts = this.options(env).filter((o) => !id || o.k.info.id === id);
      const all = id ? KINDS.filter((k) => k.info.id === id).map((k) => ({ k, w: 1 })) : opts;
      let q = R() * all.reduce((a, o) => a + o.w, 0);
      for (const o of all) { if ((q -= o.w) <= 0) { run = o.k.start(oc, env, cam, fx, fz); break; } }
      if (run && !run.quiet) started = run;   // (one grown out of the sea is not announced: it tells itself, once it shows)
      return !!run;
    },
    update(dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
      if (run) {
        run.update(dt, env, cam, fx, fz);
        if (run.t > run.dur && (!run.gone || run.gone(cam, fx, fz))) { run.dispose(); run = null; wait = rr(600, 900); }
        return;
      }
      if ((wait -= dt) > 0) return;
      if (!this.start(null, env, cam, fx, fz)) wait = 60;
    },
    subjects(out: Subject[]) {
      if (!run) return;
      const r = run;
      if (r.t > r.dur || r.quiet) return;   // (leaving now: not a thing to go and film; or filmed as part of the sea)
      out.push({ key: 'rare:' + r.info.id, label: r.info.ja, kind: r.kind, prio: 6, size: r.size, reach: 120, pos: () => r.pos(), status: () => r.status(), live: () => run === r && !!r.pos(), hold: Math.min(r.dur, 90), under: r.info.id === 'tornado' ? 6.5 : undefined });
    },
  };
}
