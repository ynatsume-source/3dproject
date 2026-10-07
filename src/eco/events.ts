// Rare scenes: the moments a diver meets once in ten dives, or once in a hundred — a train of mantas
// where there is usually one, a wall of fish that fills the whole view, a tornado of jacks, a school of
// hammerheads passing overhead, a heat run of humpbacks, the reef spawning on one night of the year, a
// huge bait ball. Every ten to fifteen minutes in a sea, one of those that can really happen there (at
// this season and hour) is staged near the camera; the rarer ones come up less often. (The bait ball and the
// jacks' tornado are part of the sea itself, ADR 0005: their entries only stir it — hungry hunters, a hard-running
// tide — and are not announced; they tell themselves once they show.)
import * as THREE from 'three';
import type { Species } from '../data/locations';
import { R, rr, clamp, hyp } from '../core/math';
import { makeShoalSystem } from './shoal';
import { makeSchoolShade } from './schoolshade';
import { sightRange, unseen, behind, clearDepth } from './unseen';
import { MANTA_GEO, mantaMaterial, WHALE_GEO, whaleMaterial, SHAPES, fishGeometry, fishMaterial } from '../ocean/models';
import { mat } from '../render/common';
import type { Env, Subject } from './env';

export interface RareInfo { id: string; ja: string; note: string }
// gone(): once its time is up, whether all of it has left the scene, out of sight (until then it goes on, leaving;
// nothing is taken away in view: src/eco/unseen.ts)
// bodies(): each of its animals as it is (where, how long), for the app to tell when the first of them can be seen —
// a rare sight is announced, and filmed, only from then (nothing is told of what no one can see yet). seen: since then.
// comes: it swims past the camera, which stops and waits for it once it is in view: how near before it is filmed close.
interface Running { info: RareInfo; t: number; dur: number; update(dt: number, env: Env, cam: THREE.Vector3, fx: number, fz: number): void; pos(): THREE.Vector3 | null; status(): string; size: number; kind: Subject['kind']; dispose(): void; gone?(cam: THREE.Vector3, fx: number, fz: number): boolean; quiet?: boolean; seen?: boolean; comes?: number; bodies?(cb: (x: number, y: number, z: number, len: number) => boolean | void): void }
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

// Where something that swims past comes in from: out of sight just behind the camera's side (100-125° off the way it
// looks, d metres off), on a line across the way ahead of it (crossing `cross` m ahead, `pass` m to the far side) —
// so it swims into the picture from the side, as things do, and is seen coming for a while before it is near. The
// line needs water `need` deep along `len` metres of it. null if there is no such line here.
function sideLine(oc: any, cam: THREE.Vector3, fx: number, fz: number, d: number, need: number, cross: number, pass: number, len: number, wide = 0, r = 6) {
  const fl = hyp(fx, fz) || 1, ux = fx / fl, uz = fz / fl, h = Math.atan2(uz, ux);
  for (let k = 0; k < 24; k++) {
    const sd = R() < 0.5 ? 1 : -1, a = h + sd * rr(100, 125) * Math.PI / 180, dd = d * rr(0.9, 1.15);
    const st = new THREE.Vector3(cam.x + Math.cos(a) * dd, 0, cam.z + Math.sin(a) * dd);
    const aim = new THREE.Vector3(cam.x + ux * cross - uz * sd * pass, 0, cam.z + uz * cross + ux * sd * pass);
    const dir = aim.clone().sub(st).setY(0).normalize();
    if (!unseen(oc, st.x, cam.y, st.z, cam, ux, uz, r)) continue;   // (r: how far it spreads round its line)
    let ok = true;
    if (!oc.loc.pelagic) for (let t = -10; t < len && ok; t += 4) for (const o of wide ? [0, -wide, wide] : [0]) if (oc.T.top(st.x + dir.x * t - dir.z * o, st.z + dir.z * t + dir.x * o) > -need) ok = false;
    if (ok) return { st, dir, aim };
  }
  return null;
}
// Until anyone has caught sight of it, something swimming in from out of sight keeps turning (10°/s at most) to cross
// the way ahead of where the camera is now — the camera's own way turns as it cruises, and a line laid down at the
// start would pass behind it unseen. (Out of sight, its turning is no one's to see.) Returns the new heading.
function reaim(from: THREE.Vector3, dir: THREE.Vector3, cam: THREE.Vector3, fx: number, fz: number, cross: number, pass: number, dt: number) {
  const fl = hyp(fx, fz) || 1, ux = fx / fl, uz = fz / fl, sd = (from.x - cam.x) * -uz + (from.z - cam.z) * ux >= 0 ? -1 : 1;
  const ax = cam.x + ux * cross - uz * sd * pass, az = cam.z + uz * cross + ux * sd * pass;
  const want = Math.atan2(az - from.z, ax - from.x), now = Math.atan2(dir.z, dir.x);
  const turn = clamp(Math.atan2(Math.sin(want - now), Math.cos(want - now)), -dt * 0.17, dt * 0.17);
  dir.set(Math.cos(now + turn), 0, Math.sin(now + turn));
  return now + turn;
}

// what is drawn of a school (its fish, as each() gives them), as bodies for the sighting
const schoolBodies = (sys: any) => (cb: (x: number, y: number, z: number, len: number) => boolean | void) => sys.each?.(cb, 120);

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
      // They are out there already: the train comes in from out of sight beside the camera and swims across the
      // way ahead, along a line through open water (each manta keeping clear of the reef under its wings). The first
      // to come is the female they follow, alone, some 12 s ahead of the rest: one manta, and then — the train.
      const LINE = 40 + 20 + sightRange(oc) * 0.5 + 60;
      const cross = rr(18, 28), pass = rr(4, 9); let aimed = false;
      const ln = sideLine(oc, cam, fx, fz, 40, 4.5, cross, pass, LINE, 5);
      if (!ln) return null;
      const st = ln.st, dir = ln.dir;
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const depth = Math.min(-3, Math.max(oc.T.top(cam.x, cam.z) + 4, -12));
      const ms = Array.from({ length: n }, (_, i) => {
        const mesh = new THREE.Mesh(MANTA_GEO, mantaMaterial(giant)); mesh.frustumCulled = false;
        const s = (giant ? rr(2.2, 2.8) : rr(1.4, 2.1)); mesh.scale.setScalar(s); oc.group.add(mesh);
        return { mesh, span: s * 2, lag: i === 0 ? 0 : 12 + i * rr(4, 6), off: new THREE.Vector3(rr(-3, 3) * (i > 0 ? 1 : 0), rr(-1.5, 1.5), 0), ph: R() * 6, y: NaN };
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
        info: KINDS[0].info, t: 0, dur: (run + (12 + n * 5) * speed) / speed, size: 9, kind: 'manta', comes: 22,   // (framed as one long animal: several mantas in the picture)
        bodies: (cb) => { for (const m of ms) if (cb(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, m.span) === true) return; },
        update(dt, _e, c, gx, gz) {
          this.t += dt;
          // (not seen yet, and every one of them still out of sight: still turning to cross the way ahead, the line kept
          // through the lead; once any could be seen, its way is fixed)
          if (!aimed && (this.seen || (this as any).noticed || !ms.every((m) => unseen(oc, m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, c, gx, gz, m.span)))) aimed = true;
          if (!aimed) {
            const dl = this.t * speed, at0 = st.clone().addScaledVector(dir, dl);
            reaim(at0, dir, c, gx, gz, cross, pass, dt); st.copy(at0).addScaledVector(dir, -dl); side.set(-dir.z, 0, dir.x);
          }
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
          // (what is filmed: the one nearest the camera — the female alone at first, then the train coming on behind her)
          let bd = Infinity; for (const m of ms) { const d = m.mesh.position.distanceTo(c); if (d < bd) { bd = d; lead.copy(m.mesh.position); } }
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
      // A river of fish some 24 m wide and 8 m deep. It comes in from out of sight beside the camera and flows across
      // the way ahead (and on, through where the camera is going), its head first: a few dozen stragglers drawing ahead
      // of the rest, loose and wide — a handful of fish, then more, then the wall. It flows past for a minute or so and
      // on out the far side; no fish appears or vanishes where it can be seen (each is let go only once out of sight).
      const n = sp.size[1] > 0.4 ? 900 : 2800, speed = sp.size[1] > 0.4 ? 3 : 2, Lb = sp.size[1] > 0.4 ? 110 : 64;
      const cross = rr(14, 22); let aimed = false;
      const ln = sideLine(oc, cam, fx, fz, 45, 6, cross, 0, 120, 0, 24) ?? sideLine(oc, cam, fx, fz, 50, 4, cross, 0, 90, 0, 24);   // (24: the stragglers' spread)   // (over a shallower reef: a shallower river)
      if (!ln) return null;
      const st = ln.st, dir = ln.dir, side = new THREE.Vector3(-dir.z, 0, dir.x), y0 = Math.min(cam.y, -3);
      const far = 2 * ln.aim.distanceTo(st);   // (where it has gone on past: from here each fish is let go once unseen)
      const seed = Array.from({ length: n }, (_, i) => [i < n * 0.03 ? rr(0, 0.06) : R(), R() * 2 - 1, R() * 2 - 1, R() * 6.28, R(), i < n * 0.03 ? 1.8 : 1]);
      const look = { cam: cam.clone(), fx, fz };
      let shown = 0; const on = new Uint8Array(n);   // (which fish are in the scene now)
      const fl = flowSchool(oc, sp, n, (i, t, p, v) => {
        const [a, b, h, ph, rag, wide] = seed[i];
        // (a ragged head and tail: each fish a little ahead or behind its place; the stragglers well ahead and wide)
        // (the stragglers set out from the same way in as the rest, a little quicker: they draw ahead as it comes)
        const along = t * speed * (wide > 1 ? 1.35 : 1) - a * Lb + (rag - 0.5) * 6;
        if (along < 0) { on[i] = 0; return false; }   // (still out there beside the camera, unseen)
        const wave = Math.sin(along * 0.15 + t * 0.4) * 2;   // the whole river snakes a little
        p.copy(st).addScaledVector(dir, along).addScaledVector(side, (b * 12 + wave) * wide);
        p.y = y0 + h * 2.6 * wide + Math.sin(t * 0.7 + ph) * 0.3;
        if (along > far && unseen(oc, p.x, p.y, p.z, look.cam, look.fx, look.fz, 3)) { on[i] = 0; return false; }   // (gone on past, out of sight — a little beyond it, not on its edge)
        v.copy(dir).addScaledVector(side, Math.cos(along * 0.15 + t * 0.4) * 0.3);
        shown++; on[i] = 1;
        return true;
      });
      const at = new THREE.Vector3(), dur = (far + Lb + 6) / speed;
      const run: Running = {
        info: { ...KINDS[1].info, ja: `${sp.ja}の大群` }, t: 0, dur, size: 6, kind: 'school', comes: 12,
        update(dt, _e, c, gx, gz) {
          this.t += dt; look.cam.copy(c); look.fx = gx; look.fz = gz; shown = 0;
          // (unseen: the whole river turned to cross the way ahead — only while every fish of it in the scene, and its way in,
          // are out of sight; once any could be seen, its way is fixed)
          if (!aimed) { let all = unseen(oc, st.x, y0, st.z, c, gx, gz, 24); const L = fl.last; for (let i = 0; i < n && all; i += 7) if (on[i] && !unseen(oc, L[i * 6], L[i * 6 + 1], L[i * 6 + 2], c, gx, gz, 1)) all = false; if (this.seen || (this as any).noticed || !all) aimed = true; }
          if (!aimed) {
            const hd = this.t * speed + 0.4 * Lb, at0 = st.clone().addScaledVector(dir, hd), d0 = dir.clone(), s0 = st.clone();
            reaim(at0, dir, c, gx, gz, cross, 0, dt); st.copy(at0).addScaledVector(dir, -hd);
            if (!unseen(oc, st.x, y0, st.z, c, gx, gz, 24)) { dir.copy(d0); st.copy(s0); aimed = true; }   // (its way in would come into sight: as it was)
            side.set(-dir.z, 0, dir.x);
          }
          fl.update(this.t);
        },
        // (what is filmed: the river where it is nearest the camera — its head, coming, until it is here)
        pos: () => {
          const head = run.t * speed + 0.4 * Lb, tail = run.t * speed - Lb, mine = (look.cam.x - st.x) * dir.x + (look.cam.z - st.z) * dir.z;
          const al = Math.max(0, Math.min(head, Math.max(tail, mine - 10)));   // (in it: a little upstream, where the rest of it comes from)
          return at.copy(st).addScaledVector(dir, al).setY(y0 + 1.3);
        },
        bodies: (cb) => { const L = fl.last; for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 150))) if (on[i]) { if (cb(L[i * 6], L[i * 6 + 1], L[i * 6 + 2], (sp.size[0] + sp.size[1]) / 2) === true) return; } },
        status: () => '何千匹もの群れが、あたり一面を埋めつくしている',
        gone: () => shown === 0,
        dispose() { fl.dispose(); },
      };
      return run;
    },
  },
  {
    info: { id: 'tornado', ja: 'ギンガメアジのトルネード', note: '何百匹ものギンガメアジが、渦を巻くように回りつづける。その中心から見上げると、銀色の竜巻のなかにいるよう。' },
    weight: (loc) => (loc.species.some((s: Species) => s.id === 'gingameaji') ? 3 : 0),
    start(oc) {
      // The school lives at its spot on the reef's edge every day (eco/jacks.ts, ADR 0005): a day the tide runs
      // hard over the edge winds it up tight for a while. Nothing is put in front of the camera, and nothing is
      // announced: the sea log speaks once the column has formed and is seen.
      const J = oc.jacks;
      if (!J) return null;
      J.surge();
      return {
        info: KINDS[2].info, t: 0, dur: 300, size: 7, kind: 'school', quiet: true,
        update(dt: number) { this.t += dt; },
        pos: () => (J.st.k > 0.65 ? J.st.c : null), status: () => '渦を巻いている',
        dispose() { /* (the school stays: it is part of the sea) */ },
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
      if (!sp) return null;
      // The school comes in from out of sight beside the camera, high in the blue, and crosses the way ahead, over the
      // reef; its time up, it heads off the way it was going and is gone only once out of sight. Before it, a lone
      // hammerhead, some 15 m ahead of the rest; and as they come over, the reef's small fish below dive into the
      // coral (they are taken for hunters: a shark overhead is one).
      const cross = rr(16, 26), pass = rr(0, 6); let aimed = false;
      const ln = sideLine(oc, cam, fx, fz, 42, 14, cross, pass, 90);
      if (!ln) return null;
      const at = ln.st, head = Math.atan2(ln.dir.z, ln.dir.x), hd = ln.dir.clone();
      const y = Math.min(Math.max(cam.y + 6, oc.T.top(at.x, at.z) + 12), -5);   // (well up in the blue, over the camera)
      const sys = tempSchool(oc, { ...sp, alt: [10, 14], speed: 0.9 }, 60 + Math.floor(R() * 40), at, y, head, 14);
      sys.steerTo(head);
      // (the one ahead: put down further along the line, if that is out of sight too)
      const sAt = at.clone().addScaledVector(ln.dir, 15), fl0 = hyp(fx, fz) || 1;
      const scout = unseen(oc, sAt.x, y, sAt.z, cam, fx / fl0, fz / fl0, 3) ? tempSchool(oc, { ...sp, alt: [10, 14], speed: 0.9 }, 1, sAt, y + rr(-1, 1), head, 1) : null;
      scout?.steerTo(head);
      return {
        info: KINDS[3].info, t: 0, dur: 120, size: 10, kind: 'school', comes: 24,
        update(dt, env2, cam2, fx2, fz2) {
          this.t += dt;
          if (!aimed) { let all = true; for (const q of [sys, scout]) q?.each?.((x: number, y2: number, z: number) => { if (!unseen(oc, x, y2, z, cam2, fx2, fz2, 2)) { all = false; return true; } }, 40); if (this.seen || (this as any).noticed || !all) aimed = true; }
          if (!aimed) { const L = scout?.leader() ?? sys.leader(), h = reaim(L, hd, cam2, fx2, fz2, cross, pass, dt); sys.steerTo(h); scout?.steerTo(h); }
          sys.update(dt, env2, cam2, fx2, fz2); scout?.update(dt, env2, cam2, fx2, fz2);
          for (const L of [sys.leader(), scout?.leader()]) if (L) env2.threatsOut.push({ x: L.x, y: L.y, z: L.z, r: 16 });   // (felt below)
        },
        // (what is filmed: the school, or before it, the one ahead of it, whichever is nearer)
        pos: () => { const L = sys.leader(), S0 = scout?.leader(); return S0 && S0.distanceTo(cam) < L.distanceTo(cam) - 6 ? S0 : L; },
        bodies: (cb) => { let stop = false; for (const q of [sys, scout]) if (q && !stop) q.each?.((x: number, y2: number, z: number, len: number) => { if (cb(x, y2, z, len) === true) { stop = true; return true; } }, 80); },
        status: () => 'ハンマーの頭を並べて、群れが通り過ぎていく',
        gone: (c, gx, gz) => { let all = true; for (const q of [sys, scout]) q?.each?.((x: number, y2: number, z: number) => { if (!unseen(oc, x, y2, z, c, gx, gz, 2)) { all = false; return true; } }, 400); return all; },   // (every one of them out of sight)
        dispose() { for (const m of scout ? [sys.mesh, scout.mesh] : [sys.mesh]) { oc.group.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); } },   // (their material too: made for them, one each)
      };
    },
  },
  {
    info: { id: 'heatrun', ja: 'ザトウクジラの群れ（ヒートラン）', note: '一頭のメスを何頭ものオスが追いかけて、全速力で泳いでいく。体をぶつけ合い、泡を吐き、水面を割って進む、繁殖期のクジラの競争。' },
    weight: (loc, env) => (loc.whales && inMonths(env.month, [1, 2, 3]) ? 3 : loc.pelagic && inMonths(env.month, [1, 2, 3, 4]) ? 1 : 0),
    start(oc, env, cam, fx, fz) {
      // The pod comes racing in from out of sight beside the camera and on across the way ahead, along a line with
      // deep water all the way; taken away only once every whale is out of sight again. They are heard before they
      // are seen: each breaking the surface to blow, a long rush of breath carried far through the water.
      const n = 4 + Math.floor(R() * 3);
      const cross = rr(26, 34), pass = rr(10, 18); let aimed = false;
      const ln = sideLine(oc, cam, fx, fz, 70, 9, cross, pass, 220);
      if (!ln) return null;
      const st = ln.st, dir = ln.dir;
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const ws = Array.from({ length: n }, (_, i) => {
        const len = i === 0 ? rr(12.5, 14) : rr(11, 13.5), m = whaleMaterial(R()), mesh = new THREE.Mesh(WHALE_GEO, m);
        mesh.scale.setScalar(len); mesh.frustumCulled = false; oc.group.add(mesh);
        return { mesh, m, off: new THREE.Vector3(rr(-8, 8) * (i ? 1 : 0), 0, -i * rr(8, 14)), ph: R() * 6, up: rr(4, 16) };
      });
      const speed = 2.6, run = 150, lead = new THREE.Vector3();
      return {
        info: KINDS[4].info, t: 0, dur: run / speed + 20, size: 13, kind: 'giant', comes: 40,
        bodies: (cb) => { for (const w of ws) if (cb(w.mesh.position.x, w.mesh.position.y, w.mesh.position.z, w.mesh.scale.x) === true) return; },
        update(dt, env, c, gx, gz) {
          this.t += dt;
          const d = this.t * speed;
          if (!aimed && (this.seen || (this as any).noticed || !ws.every((w) => unseen(oc, w.mesh.position.x, w.mesh.position.y, w.mesh.position.z, c, gx, gz, 14)))) aimed = true;
          if (!aimed) { const at0 = st.clone().addScaledVector(dir, d); reaim(at0, dir, c, gx, gz, cross, pass, dt); st.copy(at0).addScaledVector(dir, -d); side.set(-dir.z, 0, dir.x); }
          for (const w of ws) {
            // racing along just under the surface, each now and then breaking it to blow
            const was = w.up; w.up -= dt; const surf = w.up < 0 ? Math.sin(Math.min(1, -w.up / 6) * Math.PI) : 0; if (w.up < -6) w.up = rr(8, 20);
            if (was >= 2.5 && w.up < 2.5) env.blow?.(w.mesh.position.distanceTo(c));   // (the blow, at the top of its rise: heard however far)
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
        info: KINDS[5].info, t: 0, dur: 150, size: 3, kind: 'critter', seen: true,   // (all round the camera: there to be seen at once)
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
        // (over: past its time, so the controller lets it go — set to its time exactly, it was held there for ever)
        update(dt: number) { this.t += dt; if (oc.bait.st.active) (this as any).seen = true; else if ((this as any).seen || this.t > 180) this.t = Math.max(this.t, this.dur + 0.01); },
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
      // (one grown out of the sea is not announced: it tells itself, once it shows; the others are told once the first
      // of them can be seen — markSeen, by the app, which knows what the camera sees)
      if (run && !run.quiet && run.seen) started = run;
      return !!run;
    },
    markSeen() { if (run && !run.quiet && !run.seen) { run.seen = true; started = run; } },
    // the camera's operator has caught it at the edge of their eye (wider than the picture): the camera may turn to
    // it, but nothing is told yet (markSeen: once it is in the picture)
    markNoticed() { if (run && !run.quiet) (run as any).noticed = true; },
    // what it is to look out for: the one going on that has not been seen yet
    get pending() { return run && !run.quiet && !run.seen ? run : null;
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
      if (r.t > r.dur || r.quiet || !(r.seen || (r as any).noticed)) return;   // (leaving now: not a thing to go and film; or filmed as part of the sea; or not seen yet)
      out.push({ key: 'rare:' + r.info.id, label: r.info.ja, kind: r.kind, prio: 6, size: r.size, reach: 120, pos: () => r.pos(), status: () => r.status(), note: () => r.info.note, comes: r.comes, live: () => run === r && !!r.pos(), hold: Math.min(r.dur, 90), under: r.info.id === 'tornado' ? 6.5 : undefined });
    },
  };
}
