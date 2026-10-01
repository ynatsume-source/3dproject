// Rare scenes: the moments a diver meets once in ten dives, or once in a hundred — a train of mantas
// where there is usually one, a wall of fish that fills the whole view, a tornado of jacks, a school of
// hammerheads passing overhead, a heat run of humpbacks, the reef spawning on one night of the year, a
// huge bait ball. Every ten to fifteen minutes in a sea, one of those that can really happen there (at
// this season and hour) is staged near the camera; the rarer ones come up less often.
import * as THREE from 'three';
import type { Species } from '../data/locations';
import { R, rr, clamp } from '../core/math';
import { makeShoalSystem } from './shoal';
import { MANTA_GEO, mantaMaterial, WHALE_GEO, whaleMaterial, SHAPES, fishGeometry, fishMaterial } from '../ocean/models';
import { mat } from '../render/common';
import type { Env, Subject } from './env';

export interface RareInfo { id: string; ja: string; note: string }
interface Running { info: RareInfo; t: number; dur: number; update(dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number): void; pos(): THREE.Vector3 | null; status(): string; size: number; kind: Subject['kind']; dispose(): void }
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
function flowSchool(oc: any, sp: Species, n: number, where: (i: number, t: number, p: THREE.Vector3, v: THREE.Vector3) => void) {
  const g = fishGeometry(SHAPES[sp.shape], true), sw = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) sw.set([R() * 6.28, rr((sp.freq || [7, 10])[0], (sp.freq || [7, 10])[1]), rr(0.9, 1.08)], i * 3);
  g.setAttribute('aSwim', new THREE.InstancedBufferAttribute(sw, 3));
  const mesh = new THREE.InstancedMesh(g, fishMaterial(sp), n); mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  oc.group.add(mesh);
  const size = Array.from({ length: n }, () => rr(sp.size[0], sp.size[1]) / 1.28);
  const p = new THREE.Vector3(), v = new THREE.Vector3(), m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), tgt = new THREE.Vector3();
  return {
    mesh,
    update(t: number, show: number) {
      const k = Math.floor(n * clamp(show, 0, 1));
      for (let i = 0; i < n; i++) {
        if (i >= k) { mesh.setMatrixAt(i, m.makeScale(0, 0, 0)); continue; }
        where(i, t, p, v);
        m.lookAt(tgt.copy(p).add(v), p, up); m.scale(s.setScalar(size[i])); m.setPosition(p);
        mesh.setMatrixAt(i, m);
      }
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
      const st = ahead(oc, cam, fx, fz, 45, 9), dir = new THREE.Vector3(cam.x - st.x, 0, cam.z - st.z).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x), pass = rr(4, 9) * (R() < 0.5 ? 1 : -1);
      st.addScaledVector(side, pass);
      const depth = Math.min(-3, Math.max(oc.T.top(cam.x, cam.z) + 4, -12));
      const ms = Array.from({ length: n }, (_, i) => {
        const mesh = new THREE.Mesh(MANTA_GEO, mantaMaterial()); mesh.frustumCulled = false;
        const s = (giant ? rr(2.2, 2.8) : rr(1.4, 2.1)); mesh.scale.setScalar(s); oc.group.add(mesh);
        return { mesh, lag: i * rr(4, 6), off: new THREE.Vector3(rr(-3, 3) * (i > 0 ? 1 : 0), rr(-1.5, 1.5), 0), ph: R() * 6 };
      });
      const lead = new THREE.Vector3(), speed = 1.3, run = 100;
      return {
        info: KINDS[0].info, t: 0, dur: (run + n * 5 * speed) / speed, size: 9, kind: 'manta',   // (framed as one long animal: several mantas in the picture)
        update(dt) {
          this.t += dt;
          for (const m of ms) {
            const d = (this.t - m.lag) * speed;   // each follows the one ahead along the same line, a few seconds behind
            const x = st.x + dir.x * d + side.x * m.off.x + Math.sin(this.t * 0.2 + m.ph) * 0.8, z = st.z + dir.z * d + side.z * m.off.x + Math.cos(this.t * 0.17 + m.ph) * 0.8;
            m.mesh.position.set(x, depth + m.off.y + Math.sin(this.t * 0.3 + m.ph) * 0.6, z);
            m.mesh.rotation.set(-0.05 + Math.sin(this.t * 0.3 + m.ph) * 0.06, Math.atan2(dir.x, dir.z), Math.sin(this.t * 0.25 + m.ph) * 0.15, 'YXZ');
            m.mesh.visible = d > -5 && d < run + 10;
          }
          lead.copy(ms[Math.floor(n / 2)].mesh.position);
        },
        pos: () => lead, status: () => `${n}枚のマンタが連なって泳いでいく`,
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
      // a river of fish some 24 m wide and 8 m deep, flowing across the view and right through the camera
      const n = sp.size[1] > 0.4 ? 900 : 2800, c = new THREE.Vector3(cam.x, Math.min(cam.y, -3), cam.z);
      const dir = new THREE.Vector3(-fz, 0, fx), side = new THREE.Vector3(fx, 0, fz), L = 48, speed = sp.size[1] > 0.4 ? 3 : 1.4;
      const seed = Array.from({ length: n }, () => [R(), R() * 2 - 1, R() * 2 - 1, R() * 6.28]);
      const floorY = oc.T.top(c.x, c.z);
      const fl = flowSchool(oc, sp, n, (i, t, p, v) => {
        const [a, b, h, ph] = seed[i];
        const along = ((a * L + t * speed) % L) - L / 2;                   // (each fish loops round the length of the band)
        const wave = Math.sin(along * 0.15 + t * 0.4) * 2;                  // the whole river snakes a little
        p.copy(c).addScaledVector(dir, along).addScaledVector(side, 2 + b * 7 + wave);
        p.y = Math.max(c.y + h * 2.6 + Math.sin(t * 0.7 + ph) * 0.3, floorY + 0.8); if (p.y > -0.6) p.y = -0.6;
        v.copy(dir).addScaledVector(side, Math.cos(along * 0.15 + t * 0.4) * 0.3);
      });
      const at = new THREE.Vector3();
      return {
        info: { ...KINDS[1].info, ja: `${sp.ja}の大群` }, t: 0, dur: 90, size: 6, kind: 'school',
        update(dt) { this.t += dt; fl.update(this.t, Math.min(this.t / 6, (this.dur - this.t) / 10)); },
        pos: () => at.copy(c).addScaledVector(side, 2), status: () => '何千匹もの群れが、あたり一面を埋めつくしている',
        dispose() { fl.dispose(); },
      };
    },
  },
  {
    info: { id: 'tornado', ja: 'ギンガメアジのトルネード', note: '何百匹ものギンガメアジが、渦を巻くように回りつづける。その中心から見上げると、銀色の竜巻のなかにいるよう。' },
    weight: (loc) => (loc.species.some((s: Species) => s.id === 'gingameaji') ? 3 : 0),
    start(oc, env, cam, fx, fz) {
      const sp: Species = oc.loc.species.find((s: Species) => s.id === 'gingameaji');
      // a column of jacks circling, wider in the middle, slowly turning over itself
      const c = ahead(oc, cam, fx, fz, 10, 9), base = Math.max(oc.T.top(c.x, c.z) + 3.5, -16), top = Math.min(base + 9, -1.5);
      const n = 1300, dir = R() < 0.5 ? 1 : -1;
      const seed = Array.from({ length: n }, () => [R(), R(), R() * 6.28, rr(0.8, 1.2)]);
      const fl = flowSchool(oc, sp, n, (i, t, p, v) => {
        const [h, rj, a0, sp2] = seed[i];
        const y0 = base + (top - base) * h, mid = Math.sin(h * Math.PI);
        // every fish the same way round, at a jack's easy cruising speed (well under a metre a second),
        // each on its own slightly tilted circle, so together they wind upward in a spiral; the wall
        // breathes in and out a little (the turning rate is set by its usual radius, so none ever turns back)
        const rb = (2.6 + 3.2 * mid) * (0.7 + 0.6 * rj), w = dir * 0.85 * sp2 / rb, a = a0 + w * t;
        const br = Math.sin(t * 0.3 + h * 5) * 0.4, r = rb + br, dr = Math.cos(t * 0.3 + h * 5) * 0.12;   // (a wall of fish round a hollow core)
        const tilt = 0.45, ph = a + h * 9;
        p.set(c.x + Math.cos(a) * r, y0 + tilt * Math.sin(ph), c.z + Math.sin(a) * r);
        v.set(-Math.sin(a) * r * w + Math.cos(a) * dr, tilt * Math.cos(ph) * w, Math.cos(a) * r * w + Math.sin(a) * dr);   // (the way it is actually moving)
      });
      const at = new THREE.Vector3(c.x, (base + top) / 2, c.z);
      return {
        info: KINDS[2].info, t: 0, dur: 110, size: 7, kind: 'school',
        update(dt) { this.t += dt; fl.update(this.t, Math.min(this.t / 6, (this.dur - this.t) / 10)); },
        pos: () => at, status: () => '銀色の渦が、ゆっくりと回りつづけている',
        dispose() { fl.dispose(); },
      };
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
      const at = ahead(oc, cam, fx, fz, 35, 14), head = Math.atan2(cam.z - at.z, cam.x - at.x);
      const y = Math.min(Math.max(cam.y + 6, oc.T.top(at.x, at.z) + 12), -5);   // (well up in the blue, over the camera)
      const sys = tempSchool(oc, { ...sp, alt: [10, 14], speed: 0.9 }, 60 + Math.floor(R() * 40), at, y, head, 14);
      return {
        info: KINDS[3].info, t: 0, dur: 120, size: 10, kind: 'school',
        update(dt, env2, cam2, fx2, fz2) { this.t += dt; sys.update(dt, env2, cam2, fx2, fz2); },
        pos: () => sys.leader(), status: () => 'ハンマーの頭を並べて、群れが通り過ぎていく',
        dispose() { oc.group.remove(sys.mesh); sys.mesh.geometry.dispose(); },
      };
    },
  },
  {
    info: { id: 'heatrun', ja: 'ザトウクジラの群れ（ヒートラン）', note: '一頭のメスを何頭ものオスが追いかけて、全速力で泳いでいく。体をぶつけ合い、泡を吐き、水面を割って進む、繁殖期のクジラの競争。' },
    weight: (loc, env) => (loc.whales && inMonths(env.month, [1, 2, 3]) ? 3 : loc.pelagic && inMonths(env.month, [1, 2, 3, 4]) ? 1 : 0),
    start(oc, env, cam, fx, fz) {
      const n = 4 + Math.floor(R() * 3), st = ahead(oc, cam, fx, fz, 60, 10), dir = new THREE.Vector3(cam.x - st.x, 0, cam.z - st.z).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x); st.addScaledVector(side, rr(10, 18) * (R() < 0.5 ? 1 : -1));
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
        info: KINDS[6].info, t: 0, dur: 150, size: 6, kind: 'hunt',
        update(dt) { this.t += dt; if (!oc.bait.st.active) this.t = this.dur; },
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
    // what could happen here now, and how likely each is
    options(env: Env) { return KINDS.map((k) => ({ k, w: k.weight(oc.loc, env) })).filter((o) => o.w > 0); },
    start(id: string | null, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
      if (run) { run.dispose(); run = null; }
      const opts = this.options(env).filter((o) => !id || o.k.info.id === id);
      const all = id ? KINDS.filter((k) => k.info.id === id).map((k) => ({ k, w: 1 })) : opts;
      let q = R() * all.reduce((a, o) => a + o.w, 0);
      for (const o of all) { if ((q -= o.w) <= 0) { run = o.k.start(oc, env, cam, fx, fz); break; } }
      if (run) started = run;
      return !!run;
    },
    update(dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number) {
      if (run) {
        run.update(dt, env, cam, fx, fz);
        if (run.t > run.dur) { run.dispose(); run = null; wait = rr(600, 900); }
        return;
      }
      if ((wait -= dt) > 0) return;
      if (!this.start(null, env, cam, fx, fz)) wait = 60;
    },
    subjects(out: Subject[]) {
      if (!run) return;
      const r = run;
      out.push({ key: 'rare:' + r.info.id, label: r.info.ja, kind: r.kind, prio: 6, size: r.size, reach: 120, pos: () => r.pos(), status: () => r.status(), live: () => run === r && !!r.pos(), hold: Math.min(r.dur, 90), under: r.info.id === 'tornado' ? 6.5 : undefined });
    },
  };
}
