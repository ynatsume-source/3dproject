// Flying fish: a few at a time burst out of the sea ahead of something coming (a tuna, a dolphinfish,
// a boat, the drone skimming low), taxi along the surface on the beating lower lobe of the tail until
// they are fast enough, spread their great pectoral fins and glide a metre or so over the swell. A
// glide lasts a few seconds and covers thirty to fifty metres; often the fish drops its tail back in,
// sculls again and carries on, leaving a dotted line of little wakes, before it falls back with a plop.
import * as THREE from 'three';
import { mat } from '../render/common';
import { swellAt } from '../ocean/air';
import { R, rr, hyp } from '../core/math';

// One unit long, facing +z. aPart: 0 body, 1 pectoral fin, 2 pelvic fin, 3 tail; aW: signed position along the fin.
function flyingFishGeometry() {
  const pos: number[] = [], w: number[] = [], part: number[] = [], idx: number[] = [];
  const add = (x: number, y: number, z: number, ww: number, pt: number) => { pos.push(x, y, z); w.push(ww); part.push(pt); return pos.length / 3 - 1; };
  // body: a torpedo, flat-bellied, the head blunt
  const RING = 10, ST = 12;
  for (let i = 0; i <= ST; i++) {
    const t = i / ST, z = 0.5 - t * 0.86;
    const r = 0.075 * Math.pow(Math.sin(Math.PI * Math.min(1, (t + 0.04) / 1.0)), 0.7) * (t < 0.12 ? 0.75 + 2 * t : 1) * (1 - 0.55 * Math.max(0, t - 0.6) / 0.4);
    for (let j = 0; j < RING; j++) { const a = j / RING * Math.PI * 2; add(Math.cos(a) * r * 0.85, Math.sin(a) * r * (Math.sin(a) < 0 ? 0.8 : 1), z, 0, 0); }
  }
  for (let i = 0; i < ST; i++) for (let j = 0; j < RING; j++) { const a = i * RING + j, b = i * RING + (j + 1) % RING; idx.push(a, b, a + RING, b, b + RING, a + RING); }
  const nose = add(0, -0.005, 0.53, 0, 0);
  for (let j = 0; j < RING; j++) idx.push(j, nose, (j + 1) % RING);
  // a fin: a fan of points from a root, each side
  const fin = (pt: number, root: [number, number, number], tips: [number, number][], y: number) => {
    for (const sx of [-1, 1]) {
      const r0 = add(sx * root[0], root[1], root[2], 0, pt), r1 = add(sx * root[0], root[1], root[2] - 0.08, 0, pt);
      const mx = Math.max(...tips.map((q) => q[0]));
      const t = tips.map(([x, z]) => add(sx * x, y, z, sx * x / mx, pt));
      for (let k = 0; k < t.length - 1; k++) if (sx > 0) idx.push(r0, t[k], t[k + 1]); else idx.push(r0, t[k + 1], t[k]);
      if (sx > 0) idx.push(r0, t[t.length - 1], r1); else idx.push(r0, r1, t[t.length - 1]);
    }
  };
  // the pectorals: long and broad, reaching back past the pelvics; the pelvics a second, smaller pair
  fin(1, [0.06, 0.02, 0.28], [[0.16, 0.3], [0.38, 0.2], [0.58, 0.02], [0.62, -0.12], [0.5, -0.24], [0.3, -0.22], [0.12, 0.08]], 0.03);
  fin(2, [0.04, -0.03, -0.12], [[0.08, -0.12], [0.2, -0.2], [0.24, -0.3], [0.14, -0.3]], -0.03);
  // the tail: deeply forked, the lower lobe much longer (it is what drives the taxiing)
  const tz = -0.36;
  const tr = add(0, 0, tz, 0, 3), up = add(0, 0.16, tz - 0.2, 0, 3), um = add(0, 0.02, tz - 0.08, 0, 3), lo = add(0, -0.24, tz - 0.24, 0, 3);
  idx.push(tr, up, um, tr, um, lo);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(w, 1));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function flyingFishMaterial() {
  return mat(
    `attribute float aW; attribute float aPart; attribute vec3 aFin;
     varying vec3 vN; varying vec3 vWp; varying float vPart; varying vec3 vL; varying float vUp;
     void main(){
       vec3 p = position; float spread = aFin.x, s = abs(aW);
       if (aPart > 0.5 && aPart < 2.5) {
         // folded flat along the flanks under the water, spread out stiff to glide (with a little quiver)
         float k = aPart < 1.5 ? 1.0 : 0.7;
         float x = p.x, z = p.z;
         p.x = mix(sign(x) * (0.07 + s * 0.08), x, spread);
         p.z = mix(z - s * 0.5 * k, z, spread);
         p.y += spread * (s * 0.06 + sin(aFin.y * 3.0 + s * 4.0) * 0.008 * s);
       }
       // the tail sculls from side to side, hardest while taxiing
       float back = max(0.0, -position.z - 0.05);
       p.x += sin(aFin.y) * aFin.z * back * back * 1.6;
       vL = position; vPart = aPart; vUp = normal.y;
       vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
       gl_Position = projectionMatrix * viewMatrix * w;
     }`,
    `varying vec3 vN; varying vec3 vWp; varying float vPart; varying vec3 vL; varying float vUp;
     void main(){
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp);
       if (dot(n, V) < 0.0) n = -n;
       // a deep blue back, bright silver flanks and belly; the fins smoky blue-grey with fine dark rays
       vec3 back = vec3(0.04, 0.1, 0.24), belly = vec3(0.78, 0.82, 0.86);
       vec3 alb = mix(belly, back, smoothstep(-0.01, 0.035, vL.y));
       float spec = 0.0;
       if (vPart > 0.5) {
         float ray = smoothstep(0.6, 0.95, sin(atan(vL.z - 0.28, abs(vL.x)) * 40.0));
         alb = mix(vec3(0.46, 0.54, 0.64), vec3(0.22, 0.28, 0.38), ray * 0.5 + 0.3 * smoothstep(0.3, 0.6, abs(vL.x)));
       } else spec = 0.6 * (1.0 - smoothstep(-0.01, 0.03, vL.y));   // (the silver catches the light)
       vec3 col;
       if (vWp.y > 0.0) {
         vec3 sun = sunAirCol() * max(dot(n, uAirSun), 0.0) * (1.0 - 0.7 * uCloud);
         vec3 sky = skyAir(vec3(0.0, 1.0, 0.0), -1.0) * (0.55 + 0.3 * n.y) + vec3(0.02, 0.025, 0.03);
         vec3 H = normalize(V + uAirSun);
         col = alb * (sun * 1.2 + sky * 0.9) + sunAirCol() * pow(max(dot(n, H), 0.0), 40.0) * spec * 1.5 + skyAir(reflect(-V, n), -1.0) * spec * 0.25;
         if (vPart > 0.5) col += skyAir(normalize(V * -1.0 + vec3(0.0, 0.3, 0.0)), -1.0) * 0.18 + sunAirCol() * pow(max(dot(-V, uAirSun), 0.0), 6.0) * 0.25;   // (thin fins: the light comes through)
         col = fogIt(col, vWp);
       } else col = shade(alb, vWp, n, 0.6) + absorb(vec3(0.5, 0.6, 0.65), vWp.y) * spec * 0.2 * uSunI;
       gl_FragColor = vec4(col, 1.0);
     }`,
    { opts: { side: THREE.DoubleSide } });
}

// one for the field guide
export function flyingFishModel() {
  const g = flyingFishGeometry();
  g.setAttribute('aFin', new THREE.InstancedBufferAttribute(new Float32Array([1, 0, 0]), 3));
  const m = new THREE.InstancedMesh(g, flyingFishMaterial(), 1); m.setMatrixAt(0, new THREE.Matrix4().makeScale(0.32, 0.32, 0.32));
  return m;
}

interface Fish {
  p: THREE.Vector3; h: number; sp: number; vy: number; len: number;
  state: 'wait' | 'up' | 'taxi' | 'glide' | 'down' | 'gone'; t: number; wait: number; glideT: number; again: number;
  spread: number; ph: number; amp: number; bank: number; pitch: number;
}
export interface FlyFx { splash(x: number, z: number, big: number): void; stream(x: number, y: number, z: number, vx: number, vz: number, n?: number): void; plop(p: THREE.Vector3): void }

const MAX = 12;
export function makeFlyingFish(group: THREE.Object3D) {
  const g = flyingFishGeometry();
  const finA = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3); finA.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aFin', finA);
  const mesh = new THREE.InstancedMesh(g, flyingFishMaterial(), MAX);
  mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; group.add(mesh);
  const fish: Fish[] = [];
  const _o = new THREE.Object3D();
  const lead = new THREE.Vector3(), dir = new THREE.Vector3();
  const st = { active: false, t: 0, fresh: false, leadI: -1 };

  // a flight bursts out about here, heading along h (rad, 0 = +x)
  function burst(x: number, z: number, h: number, n = 3 + Math.floor(R() * 6)) {
    fish.length = 0;
    for (let i = 0; i < Math.min(n, MAX); i++) {
      const a = h + rr(-0.35, 0.35), lat = rr(-3, 3), back = rr(-2, 3);
      fish.push({ p: new THREE.Vector3(x + Math.cos(h) * -back - Math.sin(h) * lat, -0.8, z + Math.sin(h) * -back + Math.cos(h) * lat), h: a, sp: 6, vy: 0, len: rr(0.3, 0.42),
        state: 'wait', t: 0, wait: i === 0 ? 0 : rr(0.1, 1.6), glideT: 0, again: R() < 0.5 ? 1 + (R() < 0.3 ? 1 : 0) : 0, spread: 0, ph: R() * 6, amp: 0.2, bank: 0, pitch: 0 });
    }
    st.active = true; st.t = 0; st.fresh = true; st.leadI = -1;
  }

  function update(dt: number, fx: FlyFx) {
    if (!st.active) { mesh.count = 0; return; }
    st.t += dt;
    const arr = finA.array as Float32Array;
    let alive = 0;
    fish.forEach((f, i) => {
      f.t += dt;
      const sea = swellAt(f.p.x, f.p.z);
      if (f.state === 'wait') { if (f.t > f.wait) { f.state = 'up'; f.t = 0; } }
      else if (f.state === 'up') {
        // racing up at a slant to the surface
        f.sp = Math.min(11, f.sp + dt * 14); f.vy = 2.2; f.amp = 0.35;
        if (f.p.y >= sea - 0.05) { f.state = 'taxi'; f.t = 0; fx.splash(f.p.x, f.p.z, 0.12); }
      } else if (f.state === 'taxi') {
        // the body clear, the lower lobe still in the water, beating fast: faster and faster, then up
        f.sp = Math.min(17, f.sp + dt * 18); f.spread = Math.min(1, f.spread + dt * 4); f.amp = 0.55;
        f.p.y = sea + 0.05; f.vy = 0;
        if (R() < dt * 30) fx.stream(f.p.x - Math.cos(f.h) * f.len * 0.6, sea + 0.02, f.p.z - Math.sin(f.h) * f.len * 0.6, -Math.cos(f.h) * 1.5, -Math.sin(f.h) * 1.5, 1);
        if (f.sp > 15.5) { f.state = 'glide'; f.t = 0; f.vy = rr(1.8, 2.8); f.glideT = rr(2.2, 4.2); }
      } else if (f.state === 'glide') {
        // gliding: settling to a metre or so above the swell, slowing; banking gently as it curves
        f.amp *= 1 - dt * 6; f.spread = 1;
        const hT = sea + 0.6 + 0.6 * Math.min(1, f.t / 0.8) * (1 - Math.max(0, (f.t - f.glideT + 1) / 1.2));
        f.vy += ((hT - f.p.y) * 2.5 - f.vy) * Math.min(1, dt * 3);
        f.sp = Math.max(9, f.sp - dt * 1.6);
        const turn = Math.sin(f.t * 0.7 + f.ph) * 0.12; f.h += turn * dt; f.bank += (-turn * 2.5 - f.bank) * Math.min(1, dt * 2);
        if (f.t > f.glideT) {
          if (f.again > 0) { f.again--; f.state = 'taxi'; f.t = 0; f.sp = Math.max(f.sp, 11); fx.splash(f.p.x, f.p.z, 0.04); }   // tail back in: scull and go on
          else { f.state = 'down'; f.t = 0; }
        }
      } else if (f.state === 'down') {
        // the fins fold, and in it goes
        f.spread = Math.max(0, f.spread - dt * 5); f.vy -= dt * 9; f.sp *= 1 - dt * 2;
        if (f.p.y < sea) { f.state = 'gone'; f.t = 0; fx.splash(f.p.x, f.p.z, 0.15); fx.plop(f.p); }
      } else if (f.state === 'gone') { f.vy = -1.5; f.sp *= 1 - dt * 3; f.spread = 0; }
      if (f.state !== 'wait') { f.p.x += Math.cos(f.h) * f.sp * dt; f.p.z += Math.sin(f.h) * f.sp * dt; f.p.y += f.vy * dt; }
      f.pitch += ((f.state === 'up' ? 0.35 : f.state === 'down' ? -0.3 : Math.atan2(f.vy, f.sp) * 0.6) - f.pitch) * Math.min(1, dt * 6);
      f.ph += dt * (f.state === 'taxi' ? 50 : f.state === 'up' ? 30 : 8);
      const show = f.state !== 'wait' && !(f.state === 'gone' && f.t > 1.2);
      if (show) {
        alive++;
        _o.position.copy(f.p); _o.rotation.order = 'YXZ';
        _o.rotation.set(-f.pitch, Math.atan2(Math.cos(f.h), Math.sin(f.h)), f.bank);
        _o.scale.setScalar(f.len); _o.updateMatrix();
        mesh.setMatrixAt(alive - 1, _o.matrix);
        arr[(alive - 1) * 3] = f.spread; arr[(alive - 1) * 3 + 1] = f.ph; arr[(alive - 1) * 3 + 2] = f.amp;
      }
    });
    mesh.count = alive; mesh.instanceMatrix.needsUpdate = true; finA.needsUpdate = true;
    // the one the camera keeps with: the first up, until it is down; then of those still going, the one that
    // will fly on longest, but much rather one close to where the camera was already looking (a short pan,
    // not a swing across the sky)
    const up = (f: Fish) => f.state === 'glide' || f.state === 'taxi';
    if (st.leadI < 0 || !up(fish[st.leadI])) {
      const had = st.leadI >= 0 || st.t > 0.5; st.leadI = -1; let bd = -1e9;
      fish.forEach((f, i) => { if (up(f)) { const d = f.glideT - f.t + f.again * 3 - (had ? hyp(f.p.x - lead.x, f.p.z - lead.z) * 0.35 : 0); if (d > bd) { bd = d; st.leadI = i; } } });
    }
    if (st.leadI >= 0) { const b = fish[st.leadI]; lead.copy(b.p); dir.set(Math.cos(b.h), 0, Math.sin(b.h)); }
    if (st.t > 2 && !fish.some((f) => f.state !== 'gone' || f.t < 1.2)) st.active = false;
  }
  // in the air right now (for the camera to chase): the one out in front, and its line
  const flying = () => st.active && fish.some((f) => f.state === 'glide' || f.state === 'taxi');
  return { mesh, fish, st, burst, update, flying, lead, dir };
}
export type FlyingFish = ReturnType<typeof makeFlyingFish>;
