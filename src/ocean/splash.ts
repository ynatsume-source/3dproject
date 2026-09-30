// Spray and bubbles: droplets thrown up where a bird plunges or a fish breaks the surface, and bubble
// trails left under the water by diving birds and slashing predators.
import * as THREE from 'three';
import { mat } from '../render/common';
import { oceanScene } from './scenery';

const N = 900;
const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), size = new Float32Array(N), kind = new Float32Array(N), age = new Float32Array(N);
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('aLife', new THREE.BufferAttribute(age, 1).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
const spray = new THREE.Points(geo, mat(
  `attribute float aLife; attribute float aSize; attribute float aKind; uniform float uPx; varying float vA; varying float vK; varying vec3 vWp;
   void main(){
     vec4 mv = viewMatrix * vec4(position, 1.0); float d = -mv.z;
     vA = aLife; vK = aKind; vWp = position;
     gl_PointSize = aLife > 0.0 ? clamp(uPx * aSize / max(d, 0.2), 1.0, 40.0) : 0.0;
     gl_Position = projectionMatrix * mv;
   }`,
  `varying float vA; varying float vK; varying vec3 vWp;
   void main(){
     vec2 q = gl_PointCoord - 0.5; float r = length(q);
     if (vK > 0.5) {
       // a bubble: a bright rim catching the light from above
       float ring = smoothstep(0.5, 0.36, r) * (0.35 + 0.65 * smoothstep(0.2, 0.42, r));
       vec3 c = fogIt(vec3(0.75, 0.9, 0.95) * (0.4 + 0.8 * uSunI) + 0.15, vWp);
       gl_FragColor = vec4(c * ring * vA * 0.9, 1.0);
     } else {
       // a droplet or a puff of spray, lit by the sky and the sun
       float a = smoothstep(0.5, 0.1, r) * vA;
       vec3 c = sunAirCol() * max(uAirSun.y, 0.0) * 0.8 + skyAir(vec3(0.0, 1.0, 0.0), -1.0) * 0.9 + 0.05;
       gl_FragColor = vec4(c * a, 1.0);
     }
   }`,
  { uniforms: { uPx: { value: 600 } }, opts: { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } }));
spray.frustumCulled = false;
oceanScene.add(spray);
let next = 0;

function emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, l: number, s: number, k: number) {
  const i = next; next = (next + 1) % N;
  pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
  vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
  life[i] = l; age[i] = 1; size[i] = s; kind[i] = k;
}

// a splash at the surface: a crown of droplets, and bubbles driven down under it
export function splashAt(x: number, z: number, big: number) {
  const n = Math.round(14 + big * 30);
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random() * 1.6) * (0.6 + big);
    emit(x, 0.05, z, Math.cos(a) * sp, (2 + Math.random() * 3.5) * (0.5 + big), Math.sin(a) * sp, 0.6 + Math.random() * 0.8, 0.05 + Math.random() * 0.06, 0);
  }
  for (let k = 0; k < n; k++) emit(x + (Math.random() - 0.5) * 0.4, -0.2 - Math.random() * (0.5 + big * 1.5), z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, 1.5 + Math.random() * 1.5, 0.03 + Math.random() * 0.05, 1);
}
// a few bubbles streaming off something moving under the water
export function bubblesAt(x: number, y: number, z: number, n = 2) {
  if (y > -0.1) return;
  for (let k = 0; k < n; k++) emit(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2, 1.2 + Math.random() * 1.8, 0.02 + Math.random() * 0.04, 1);
}

export function updateSplash(dt: number, pxScale: number) {
  (spray.material as THREE.ShaderMaterial).uniforms.uPx.value = pxScale;
  let any = false;
  for (let i = 0; i < N; i++) {
    if (age[i] <= 0) continue;
    any = true;
    const bub = kind[i] > 0.5;
    if (bub) {
      // bubbles rise, faster as they go, wobbling; gone at the surface
      vel[i * 3 + 1] += dt * 0.6;
      pos[i * 3] += (vel[i * 3] + Math.sin(age[i] * 30 + i) * 0.1) * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] > -0.05) age[i] = 0;
    } else {
      vel[i * 3 + 1] -= 9.8 * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0) age[i] = 0;
    }
    if (age[i] > 0) age[i] = Math.max(0, age[i] - dt / life[i]);
  }
  spray.visible = any;
  if (any) { geo.attributes.position.needsUpdate = true; geo.attributes.aLife.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aKind.needsUpdate = true; }
}
