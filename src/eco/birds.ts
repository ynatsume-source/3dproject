// Seabirds over the sea: they glide and flap in bursts, bank into their turns, settle on the water to
// rest (bobbing on the swell, wings folded) and take off again. Albatrosses skim the swell in long arcs
// without a wingbeat; frigatebirds soar high and never land on the sea.
import * as THREE from 'three';
import { mat, U } from '../render/common';
import { swellAt } from '../ocean/air';
import { clamp, R, rr } from '../core/math';
import type { BirdSpec } from '../data/locations';

// A bird one unit across the wings, facing +z. aW: signed position along the wing (0 on the body).
function birdGeometry(kind: BirdSpec['kind']) {
  const pos: number[] = [], w: number[] = [], part: number[] = [], idx: number[] = [];
  const add = (x: number, y: number, z: number, ww: number, pt: number) => { pos.push(x, y, z); w.push(ww); part.push(pt); return pos.length / 3 - 1; };
  const len = kind === 'albatross' ? 0.4 : kind === 'frigate' ? 0.42 : kind === 'tern' ? 0.46 : 0.52;
  const thick = kind === 'tern' ? 0.05 : 0.065;
  // body: a spindle of rings along z
  const RING = 8, ST = 9;
  const bodyR = (t: number) => thick * Math.sin(Math.PI * Math.min(1, Math.max(0, (t + 0.06) / 1.02))) ** 0.8;
  for (let i = 0; i <= ST; i++) {
    const t = i / ST, z = (t - 0.55) * len;
    const r = bodyR(t) * (t > 0.8 ? 0.8 : 1);
    for (let j = 0; j < RING; j++) { const a = j / RING * Math.PI * 2; add(Math.cos(a) * r, Math.sin(a) * r * 0.9, z, 0, t > 0.86 ? 2 : 0); }
  }
  for (let i = 0; i < ST; i++) for (let j = 0; j < RING; j++) {
    const a = i * RING + j, b = i * RING + (j + 1) % RING;
    idx.push(a, b, a + RING, b, b + RING, a + RING);
  }
  // bill
  const tipZ = 0.45 * len + (kind === 'albatross' ? 0.09 : kind === 'booby' ? 0.08 : 0.07);
  const bill = add(0, -0.004, tipZ, 0, 3), base = (ST - 1) * RING;
  for (let j = 0; j < RING; j++) idx.push(base + j, base + (j + 1) % RING, bill);
  // tail: a flat wedge (the frigatebird's deeply forked)
  const tz = -0.55 * len;
  if (kind === 'frigate') {
    for (const sx of [-1, 1]) { const a = add(0, 0, tz + 0.02, 0, 1), b = add(sx * 0.03, 0, tz, 0, 1), c = add(sx * 0.07, 0, tz - 0.28, 0, 1); idx.push(a, b, c); }
  } else {
    const a = add(-0.02, 0, tz + 0.03, 0, 1), b = add(0.02, 0, tz + 0.03, 0, 1), c = add(-0.05, 0, tz - 0.1, 0, 1), d = add(0.05, 0, tz - 0.1, 0, 1);
    idx.push(a, c, b, b, c, d);
  }
  // wings: four stations from root to tip, swept back, narrowing; long and narrow for the gliders
  const chord = kind === 'albatross' ? [0.13, 0.12, 0.09, 0.03] : kind === 'frigate' ? [0.16, 0.13, 0.09, 0.02] : kind === 'tern' ? [0.17, 0.15, 0.1, 0.03] : [0.18, 0.16, 0.11, 0.035];
  const xs = [0.03, 0.18, 0.34, 0.5], sweep = kind === 'frigate' ? [0, 0.02, -0.05, -0.16] : kind === 'tern' ? [0, 0.01, -0.03, -0.1] : [0, 0.01, -0.02, -0.07];
  for (const sx of [-1, 1]) {
    const lead: number[] = [], trail: number[] = [];
    xs.forEach((x, i) => {
      const zl = 0.06 + sweep[i];
      lead.push(add(sx * x, 0.005, zl, sx * x / 0.5, 1)); trail.push(add(sx * x, 0, zl - chord[i], sx * x / 0.5, 1));
    });
    for (let i = 0; i < 3; i++) {
      const a = lead[i], b = lead[i + 1], c = trail[i], d = trail[i + 1];
      if (sx > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(w, 1));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function birdMaterial(sp: BirdSpec) {
  return mat(
    `attribute float aW; attribute float aPart; attribute vec3 aFly; uniform float uDihedral;
     varying vec3 vN; varying vec3 vWp; varying float vPart; varying float vUp; varying vec3 vL;
     void main(){
       vec3 p = position, n = normal;
       float flapA = aFly.x * sin(aFly.y), fold = aFly.z, s = abs(aW);
       if (aPart > 0.5 && aPart < 1.5 && s > 0.0) {
         // the wing beats about the shoulder and bends further at the wrist; folded at rest along the back
         float a = flapA * (0.7 + 0.5 * s) + uDihedral * (1.0 - fold) * (s > 0.6 ? -0.6 : 1.0);
         p.y += s * 0.5 * sin(a);
         p.x = sign(aW) * s * 0.5 * cos(a);
         p.x *= 1.0 - fold * 0.86; p.z -= fold * s * 0.28; p.y += fold * 0.03;
       }
       vL = position; vPart = aPart; vUp = normal.y;
       vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
       gl_Position = projectionMatrix * viewMatrix * w;
     }`,
    `uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uCap;
     varying vec3 vN; varying vec3 vWp; varying float vPart; varying float vUp; varying vec3 vL;
     void main(){
       vec3 n = normalize(vN), V = normalize(uCamPos - vWp);
       if (dot(n, V) < 0.0) n = -n;
       vec3 alb = mix(uC2, uC1, smoothstep(-0.2, 0.2, vUp));
       if (vPart > 2.5) alb = uC3;                                               // bill
       else if (vPart > 1.5) alb = mix(alb, uC3, uCap * step(0.0, vL.y));       // a dark cap (terns)
       // the dark trailing edge and wingtips most seabirds have
       if (vPart > 0.5 && vPart < 1.5) alb = mix(alb, uC1 * 0.5, smoothstep(0.38, 0.5, abs(vL.x)) * 0.6);
       vec3 sun = sunAirCol() * max(dot(n, uAirSun), 0.0) * (1.0 - 0.7 * uCloud);
       vec3 moon = vec3(0.5, 0.55, 0.65) * max(dot(n, uAirMoon), 0.0) * uMoonI * 0.4;
       vec3 sky = skyAir(vec3(0.0, 1.0, 0.0), -1.0) * (0.55 + 0.25 * n.y) + vec3(0.02, 0.025, 0.03);
       vec3 col = alb * (sun * 1.2 + moon + sky * 0.9);
       gl_FragColor = vec4(fogIt(col, vWp), 1.0);
     }`,
    { uniforms: { uC1: { value: new THREE.Color(...sp.c1) }, uC2: { value: new THREE.Color(...sp.c2) }, uC3: { value: new THREE.Color(...sp.c3) },
      uCap: { value: sp.kind === 'tern' && sp.c3[0] < 0.2 ? 1 : 0 }, uDihedral: { value: sp.kind === 'frigate' ? 0.22 : sp.kind === 'albatross' ? -0.03 : 0.06 } },
      opts: { side: THREE.DoubleSide } });
}

// a single bird for the field guide
export function birdModel(sp: BirdSpec) {
  const g = birdGeometry(sp.kind);
  g.setAttribute('aFly', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 0]), 3));
  const m = new THREE.InstancedMesh(g, birdMaterial(sp), 1); m.setMatrixAt(0, new THREE.Matrix4());
  return m;
}

interface Bird { p: THREE.Vector3; h: number; vy: number; state: 'fly' | 'land' | 'rest' | 'takeoff'; t: number; seed: number; altT: number; flap: number; flapping: number; ph: number; fold: number; bank: number; pitch: number; stateT: number; speed: number; placed: boolean }

export function makeBirds(specs: BirdSpec[], group: THREE.Object3D) {
  const flocks = specs.map((sp) => {
    const g = birdGeometry(sp.kind);
    const fly = new THREE.InstancedBufferAttribute(new Float32Array(sp.count * 3), 3);
    fly.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aFly', fly);
    const mesh = new THREE.InstancedMesh(g, birdMaterial(sp), sp.count);
    mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    const birds: Bird[] = [];
    for (let i = 0; i < sp.count; i++) birds.push({ p: new THREE.Vector3(), h: R() * 6.28, vy: 0, state: 'fly', t: R() * 100, seed: R() * 50, altT: rr(sp.alt[0], sp.alt[1]), flap: 0, flapping: 0, ph: 0, fold: 0, bank: 0, pitch: 0, stateT: 0, speed: sp.speed, placed: false });
    return { sp, mesh, fly, birds };
  });
  const _o = new THREE.Object3D();

  function place(b: Bird, sp: BirdSpec, cam: THREE.Vector3, fx: number, fz: number, first: boolean) {
    const d = first ? rr(12, 70) : rr(70, 120), lat = (R() * 2 - 1) * 60;
    b.p.set(cam.x + fx * d - fz * lat, 0, cam.z + fz * d + fx * lat);
    // on first sight some are already sitting on the water
    if (first && sp.rest > 0 && R() < sp.rest * 0.8) { b.state = 'rest'; b.fold = 1; b.stateT = rr(0, 60); }
    else { b.state = 'fly'; b.p.y = rr(sp.alt[0], sp.alt[1]); b.fold = 0; }
    b.h = R() * 6.28; b.placed = true;
  }

  function update(dt: number, cam: THREE.Vector3, fx: number, fz: number, show: boolean, log: (sp: BirdSpec, text: string) => void) {
    const wa = Math.atan2(U.uCurrent.value.y, U.uCurrent.value.x) + 0.6;   // the wind blows along the swell
    for (const F of flocks) {
      const sp = F.sp, arr = F.fly.array as Float32Array;
      F.mesh.visible = show;
      F.birds.forEach((b, i) => {
        b.t += dt; b.stateT += dt;
        const dx = b.p.x - cam.x, dz = b.p.z - cam.z;
        if (!b.placed || dx * dx + dz * dz > 170 * 170) place(b, sp, cam, fx, fz, !b.placed);
        const sea = swellAt(b.p.x, b.p.z);
        if (b.state === 'rest') {
          // floating: bob on the swell, turn to face the wind, drift
          b.p.y = sea + 0.02; b.fold = Math.min(1, b.fold + dt * 1.5); b.flap = 0;
          let d = wa + Math.PI - b.h; d = Math.atan2(Math.sin(d), Math.cos(d)); b.h += d * dt * 0.2;
          b.p.x += Math.cos(wa) * 0.05 * dt; b.p.z += Math.sin(wa) * 0.05 * dt;
          b.bank = Math.sin(b.t * 0.9 + b.seed) * 0.08; b.pitch = Math.sin(b.t * 0.7) * 0.06;
          if (b.stateT > (b.seed % 1 + 1) * 70) { b.state = 'takeoff'; b.stateT = 0; b.h = wa + Math.PI; b.speed = 2; }
        } else {
          if (b.state === 'takeoff') {
            // run and flap into the wind until airborne
            b.fold = Math.max(0, b.fold - dt * 3); b.speed = Math.min(sp.speed, b.speed + dt * 4); b.flapping = 1;
            b.altT = sea + (b.speed / sp.speed) * 3;
            if (b.speed >= sp.speed * 0.95) { b.state = 'fly'; b.stateT = 0; b.altT = rr(sp.alt[0], sp.alt[1]); }
          } else {
            b.fold = Math.max(0, b.fold - dt * 2);
            // wander: slow meanders; the soaring birds carve long arcs
            const arc = sp.kind === 'albatross' || sp.kind === 'frigate' ? 0.35 : 0.5;
            let turn = (Math.sin(b.t * 0.23 + b.seed) * 0.6 + Math.sin(b.t * 0.071 + b.seed * 3) * 0.5) * arc;
            if (dx * dx + dz * dz > 75 * 75) { let d = Math.atan2(-dz, -dx) - b.h; d = Math.atan2(Math.sin(d), Math.cos(d)); turn += d * 0.6; }
            b.h += turn * dt;
            b.bank += (clamp(-turn * (sp.kind === 'albatross' ? 2.2 : 1.3), -0.9, 0.9) - b.bank) * Math.min(1, dt * 2);
            if (sp.kind === 'albatross') b.altT = sea + 0.8 + 6 * Math.abs(Math.sin(b.t * 0.32 + b.seed));     // dynamic soaring: dip to the crests, climb into the wind
            else if (b.stateT > 20 && R() < dt / 25) b.altT = rr(sp.alt[0], sp.alt[1]);
            if (b.state === 'land') {
              b.altT = sea; b.speed = Math.max(2.5, b.speed - dt * 2);
              if (b.p.y < sea + 0.25) { b.state = 'rest'; b.stateT = 0; b.p.y = sea; if (dx * dx + dz * dz < 60 * 60) log(sp, `${sp.ja}が水面に降りて羽を休めている`); }
            } else if (sp.rest > 0 && b.stateT > 30 && R() < dt * sp.rest / 90) { b.state = 'land'; b.stateT = 0; }
            // flap in bursts between glides; always when climbing or slow
            if (b.flapping > 0) b.flapping -= dt; else if (R() < dt * (1 - sp.glide) * 0.8) b.flapping = rr(0.8, 2.2);
          }
          const vyT = clamp((Math.max(b.altT, sea + 0.4) - b.p.y) * 0.6, -3, 2.5);
          b.vy += (vyT - b.vy) * Math.min(1, dt * 1.5);
          if (b.vy > 0.8 || b.speed < sp.speed * 0.7) b.flapping = Math.max(b.flapping, 0.3);
          b.p.x += Math.cos(b.h) * b.speed * dt; b.p.z += Math.sin(b.h) * b.speed * dt; b.p.y += b.vy * dt;
          b.p.y = Math.max(b.p.y, sea + 0.12);
          b.pitch = -Math.atan2(b.vy, b.speed) * 0.8;
          if (b.state === 'fly' && b.speed < sp.speed) b.speed = Math.min(sp.speed, b.speed + dt);
        }
        // wingbeat: frequency scales with size (terns quick, albatrosses slow and rare)
        const hz = 5.2 / Math.sqrt(sp.span);
        b.flap += (((b.flapping > 0 && b.state !== 'rest') ? (sp.kind === 'albatross' ? 0.45 : 0.75) : 0) - b.flap) * Math.min(1, dt * 6);
        b.ph += dt * hz * 6.28;
        arr[i * 3] = b.flap; arr[i * 3 + 1] = b.ph; arr[i * 3 + 2] = b.fold;
        if (show) {
          _o.position.copy(b.p);
          _o.rotation.set(0, 0, 0);
          _o.rotation.order = 'YXZ';
          _o.rotation.set(b.pitch, Math.atan2(Math.cos(b.h), Math.sin(b.h)), b.bank);
          _o.scale.setScalar(sp.span);
          _o.updateMatrix();
          F.mesh.setMatrixAt(i, _o.matrix);
        }
      });
      if (show) { F.mesh.instanceMatrix.needsUpdate = true; F.fly.needsUpdate = true; }
    }
  }
  const inView = (cam: THREE.Vector3, fwd: THREE.Vector3, maxD: number) => {
    const out: BirdSpec[] = [];
    for (const F of flocks) if (F.birds.some((b) => { const v = b.p.clone().sub(cam), d = v.length(); return d < maxD && v.dot(fwd) / d > 0.6; })) out.push(F.sp);
    return out;
  };
  return { flocks, update, inView };
}
export type Birds = ReturnType<typeof makeBirds>;
