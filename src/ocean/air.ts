// Above the water: the sea surface seen from the air, the open ocean beyond the modelled reef, the
// real stars over the site, and rain.
import * as THREE from 'three';
import { mat, U } from '../render/common';
import { oceanScene } from './scenery';
import type { Water } from './water';

// A disc of rings, dense near the camera and stretching to the horizon (huge two-triangle planes clip
// badly), lying flat at y = 0 and following the camera.
function discGeo(r0: number, r1: number, rings: number, seg: number) {
  const pos: number[] = [0, 0, 0], idx: number[] = [];
  for (let i = 0; i < rings; i++) {
    const r = r0 * Math.pow(r1 / r0, i / (rings - 1));
    for (let j = 0; j < seg; j++) { const a = j / seg * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
  }
  for (let j = 0; j < seg; j++) idx.push(0, 1 + (j + 1) % seg, 1 + j);
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < seg; j++) {
    const a = 1 + i * seg + j, b = 1 + i * seg + (j + 1) % seg, c = a + seg, d = b + seg;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
const DISC = discGeo(0.5, 70000, 170, 192);

// The swell: long ocean swell from distant weather (two close wavelengths that beat into sets), and a
// shorter wind sea across it, lifting the surface itself; the water moves toward each crest (Gerstner),
// sharpening crests and widening troughs. Each train fades out once the ring spacing can no longer carry it.
// Mirrored in swellAt() so the camera can ride it. swell() returns (height, dh/dx, dh/dz).
const SW: [number, number, number][] = [[140, 0.55, 0], [118, 0.45, 0.12], [72, 0.35, 0.5], [47, 0.22, -0.6], [31, 0.14, 0.9], [21, 0.08, -0.3]];
export const SWELL = /* glsl */ `
uniform sampler2D uSeaK; uniform vec4 uSeaKBox;
float seaK(vec2 p){   // how much of the sea's swell reaches here: none into a pool, a little into a lagoon (src/ocean/water.ts)
  // (no early return and no read inside a branch: the texture is always read, and outside the map — or with
  // no map — the full swell is chosen by mix; ANGLE/D3D11 has gone white on a texture read behind a branch)
  vec2 uv = (p - uSeaKBox.xy) / max(uSeaKBox.z, 1e-3);
  float k = texture2D(uSeaK, clamp(uv, 0.0, 1.0)).r;
  float inside = step(0.5, uSeaKBox.w) * step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  return mix(1.0, k, inside);
}
const float SW_L[6] = float[](${SW.map((w) => w[0].toFixed(1)).join(', ')});
const float SW_A[6] = float[](${SW.map((w) => w[1].toFixed(2)).join(', ')});
const float SW_D[6] = float[](${SW.map((w) => w[2].toFixed(2)).join(', ')});
float swPh(int i, vec2 p, float t, out vec2 d, out float k){
  float a = atan(uCurrent.y, uCurrent.x) + 0.6 + SW_D[i];
  d = vec2(cos(a), sin(a)); k = 6.28318 / SW_L[i];
  return dot(d, p) * k - sqrt(9.81 * k) * t + float(i) * 2.1;
}
vec3 swell(vec2 p, float t, float dist){
  vec3 s = vec3(0.0); vec2 d; float k; float K = seaK(p);
  for (int i = 0; i < 6; i++) {
    float ph = swPh(i, p, t, d, k), A = SW_A[i] * uSwell * K * (1.0 - smoothstep(SW_L[i] * 6.0, SW_L[i] * 16.0, dist));
    s += vec3(A * cos(ph), -A * k * sin(ph) * d);
  }
  return s;
}
vec2 swellShift(vec2 p, float t, float dist){
  vec2 s = vec2(0.0), d; float k; float K = seaK(p);
  for (int i = 0; i < 6; i++) {
    float ph = swPh(i, p, t, d, k), A = SW_A[i] * uSwell * K * (1.0 - smoothstep(SW_L[i] * 6.0, SW_L[i] * 16.0, dist));
    s -= d * A * sin(ph) * 0.9;
  }
  return s;
}`;
// (the CPU's copy of seaK: set for the sea the camera is in, useWater)
let seaK: (x: number, z: number) => number = () => 1;
export function useWater(w: Water | null) {
  seaK = w?.tex ? (x, z) => w.swellK(x, z) : () => 1;
  if (w?.tex) { U.uSeaK.value = w.tex; U.uSeaKBox.value.set(w.x0, w.z0, w.size, 1); } else U.uSeaKBox.value.w = 0;
}
export function swellAt(x: number, z: number): number {
  const cu = U.uCurrent.value, t = U.uTime.value, S = U.uSwell.value * seaK(x, z);
  let h = 0;
  SW.forEach(([lam, A, da], i) => {
    const a = Math.atan2(cu.y, cu.x) + 0.6 + da, k = 2 * Math.PI / lam;
    h += A * S * Math.cos((Math.cos(a) * x + Math.sin(a) * z) * k - Math.sqrt(9.81 * k) * t + i * 2.1);
  });
  return h;
}

// The height of the drawn surface right above (x, z): the drawn waves also lean to and fro (swellShift), so the
// water over a point came from a little way off; that point is found once, which is close enough.
export function surfaceAt(x: number, z: number): number {
  const cu = U.uCurrent.value, t = U.uTime.value, S = U.uSwell.value * seaK(x, z);
  let sx = 0, sz = 0;
  SW.forEach(([lam, A, da], i) => {
    const a = Math.atan2(cu.y, cu.x) + 0.6 + da, k = 2 * Math.PI / lam, dx = Math.cos(a), dz = Math.sin(a);
    const s = Math.sin((dx * x + dz * z) * k - Math.sqrt(9.81 * k) * t + i * 2.1) * A * S * 0.9;
    sx -= dx * s; sz -= dz * s;
  });
  return swellAt(x - sx, z - sz);
}

// The sea from above. With the refraction copy (post-processing on): what lies beneath, bent by the waves,
// mixed with the sky it reflects by Fresnel. Without it, premultiplied: the colour is the reflection and
// glitter, the alpha how much of the water below it hides.
export const topScene = new THREE.Scene();
export const seaTop = new THREE.Mesh(DISC, mat(
  SWELL + `varying vec3 vWp; varying float vFade; uniform float uDrop;
   void main(){
     vec4 w = modelMatrix * vec4(position, 1.0);
     float dist = length(w.xz - uCamPos.xz); vFade = dist;
     vec2 p0 = w.xz;
     w.xz += swellShift(p0, uTime, dist);
     w.y += swell(p0, uTime, dist).x;
     w.y -= uDrop * (1.0 - smoothstep(1.5, 10.0, dist));   // (lowered round the lens only: see the split view)
     vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
   }`,
  SWELL + `varying vec3 vWp; varying float vFade;
   uniform float uPxA; uniform sampler2D tRefr; uniform float uRefrOn; uniform vec2 uRes; uniform mat4 uProj;
   void main(){
     vec3 v = vWp - uCamPos; float d = length(v); vec3 dir = v / d, V = -dir;
     float fp = d * uPxA / max(V.y, 0.04);                 // how much sea one pixel covers
     // a wind sea on the swell: wave trains around the wind direction, each dropped (and its slope kept as
     // roughness) once it is smaller than a pixel
     vec2 p = vWp.xz; float t = uTime; float rough = 0.0025 + uRain * 0.02;
     vec3 sw = swell(p, t, vFade);
     vec2 g = sw.yz;
     float wa = atan(uCurrent.y, uCurrent.x) + 0.6;
     for (int i = 0; i < 16; i++) {
       float fi = float(i), a = wa + (hash2(vec2(fi, 3.7)) - 0.5) * 2.8;
       vec2 wd = vec2(cos(a), sin(a));
       float k = 0.3 * pow(1.3, fi) * (0.85 + 0.3 * hash2(vec2(fi, 1.3))), lam = 6.28318 / k;
       float sl = 0.07 * uWave / (1.0 + fi * 0.12);
       float keep = 1.0 - smoothstep(0.12 * lam, 0.45 * lam, fp);
       // each train comes in groups: its amplitude swells and fades across the sea
       float grp = 0.35 + 0.65 * vn2(p * k * 0.09 + vec2(fi * 7.1, t * 0.05));
       g += wd * cos(dot(wd, p) * k - sqrt(9.81 * k) * t + hash2(vec2(fi, 9.1)) * 6.28) * sl * keep * grp;
       rough += sl * sl * 0.5 * (1.0 - keep);
     }
     // cat's-paws of wind ripple, darkening and brightening patches of the sea
     float paw = fbm2(p * 0.02 + vec2(t * 0.02, -t * 0.013));
     rough *= 0.6 + 0.9 * paw;
     vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
     float nv = max(dot(n, V), 0.02);
     float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
     vec3 r = reflect(dir, n); r.y = abs(r.y);
     vec3 col = skyAir(r, 0.0) * F;
     // glitter of the sun and the moon: a microfacet highlight that spreads into a path with distance
     vec3 sc = sunAirCol() * (1.0 - 0.85 * uCloud);
     for (int k = 0; k < 2; k++) {
       vec3 L = k == 0 ? uAirSun : uAirMoon;
       if (L.y <= 0.0) continue;
       vec3 H = normalize(V + L); float nh = max(dot(n, H), 1e-3), nh2 = nh * nh;
       float D = exp(-(1.0 - nh2) / (nh2 * rough)) / (3.14159 * rough * nh2 * nh2);
       vec3 rad = k == 0 ? sc * 7.0 : vec3(0.75, 0.8, 0.9) * uMoonIllum * 1.5 * (1.0 - dayAir()) * (1.0 - 0.5 * uCloud) * (1.0 - 0.95 * uMoonVeil);
       // the path breaks into glints that come and go with the small waves
       float glint = mix(1.0, 0.25 + 2.2 * smoothstep(0.55, 0.9, vn2(p * 2.7 + vec2(t * 1.3, -t * 0.9))), 1.0 - smoothstep(0.3, 2.0, fp));
       col += rad * D * F / (4.0 * nv) * smoothstep(0.0, 0.05, L.y) * 0.25 * glint;
     }
     // a night sea seen from above keeps a faint sheen of the sky on it, cloudy or not (not quite real: a
     // night-adapted eye's view), broken by the ripples, so the surface reads as a surface and not a void
     float sheenF = 0.06 + 0.22 * pow(1.0 - nv, 2.0);
     vec3 nightSheen = (skyAir(vec3(0.0, 1.0, 0.0), -1.0) * 0.9 + vec3(0.03, 0.04, 0.06)) * sheenF * uNight
       * (0.7 + 0.6 * smoothstep(0.3, 0.8, vn2(p * 1.9 + vec2(t * 0.7, -t * 0.5))));
     // whitecaps once the wind picks up, riding the crests
     float foam = smoothstep(0.68, 0.78, fbm2(p * 0.09 + vec2(t * 0.03, t * 0.01)) + g.x * 0.4 + sw.x * 0.3) * clamp((uWave - 1.2) * 1.2, 0.0, 1.0);
     // a bait ball: the surface churned white and nervous where it is packed against it
     float bd = length(p - uBoil.xy), boil = uBoil.w * smoothstep(uBoil.z, uBoil.z * 0.3, bd);
     if (boil > 0.0) {
       foam = max(foam, boil * smoothstep(0.52, 0.8, fbm2(p * 1.3 + vec2(t * 0.9, -t * 0.7)) * 0.7 + fbm2(p * 3.1 - vec2(t * 1.7, t * 1.1)) * 0.45));
       rough += boil * 0.06;
     }
     float lf = seaFoam(p); foam = max(foam, lf); rough += lf * 0.05;
     vec3 foamC = (sunAirCol() * max(uAirSun.y, 0.0) * 0.9 + skyAir(vec3(0.0, 1.0, 0.0), -1.0) * 0.8) * (1.0 + uFlash);
     // far off, the air itself: the sea melts into the sky at the horizon
     float fh = 1.0 - exp(-d / 18000.0);
     vec3 haze = skyAir(normalize(vec3(dir.x, 0.004, dir.z)), -1.0);
     if (uRefrOn > 0.5) {
       // what lies below, displaced by the slope of the surface in proportion to how deep it is
       vec2 uv = gl_FragCoord.xy / uRes;
       float zs = -(viewMatrix * vec4(vWp, 1.0)).z;
       vec4 b = texture2D(tRefr, uv);
       float below = clamp(b.a * 1000.0 - zs, 0.0, 20.0);
       vec4 c2 = uProj * viewMatrix * vec4(vWp + vec3(n.x, 0.0, n.z) * below * 0.25, 1.0);   // refraction bends the view by about a quarter of the slope
       vec4 b2 = texture2D(tRefr, c2.xy / c2.w * 0.5 + 0.5);
       if (b2.a * 1000.0 < zs + 0.05) b2 = b;          // it landed on something in front of the water: keep the straight view
       // the dive's night is lit for the camera; seen from the air the night sea is darker, lit by the moon —
       // but not black: looking down close by, it keeps most of the light it will have once in the water
       // (no plunge from black into a lit sea), fading toward the moonlit level further off
       float downK = smoothstep(0.3, 0.85, nv) * exp(-d / 40.0);
       vec3 under = b2.rgb * mix(1.0, mix(0.4 + 0.3 * uMoonI, 1.0, downK), uNight);
       // light through the thin water of a crest glows green-blue when the sun is behind it
       under += vec3(0.0, 0.16, 0.14) * max(sw.x, 0.0) / max(uSwell, 0.2) * 0.4 * max(dot(dir, uAirSun) * 0.5 + 0.5, 0.0) * max(uAirSun.y, 0.0) * (1.0 - uCloud * 0.7);
       vec3 o = under * (1.0 - F) * (1.0 - foam) + col + foamC * foam + nightSheen;
       gl_FragColor = vec4(mix(o, haze, fh), 1.0);
     } else {
       vec4 o = vec4(col + foamC * foam + nightSheen, min(1.0, F + foam));
       gl_FragColor = vec4(mix(o.rgb, haze, fh), mix(o.a, 1.0, fh));
     }
   }`,
  { uniforms: { uDrop: { value: 0 }, uPxA: { value: 0.0012 }, tRefr: { value: null }, uRefrOn: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uProj: { value: new THREE.Matrix4() } },
    opts: { side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } }));
seaTop.frustumCulled = false;
topScene.add(seaTop);

// the open ocean floor far below: all we see of it is deep blue water
export const abyss = new THREE.Mesh(DISC, mat(
  `varying vec3 vWp; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  `varying vec3 vWp; void main(){ gl_FragColor = vec4(fogIt(vec3(0.0), vWp), 1.0); }`, { opts: { side: THREE.DoubleSide } }));
abyss.frustumCulled = false;
oceanScene.add(abyss);

// The stars: the ~5000 naked-eye stars of the Yale Bright Star Catalogue (via d3-celestial), placed by
// the real sidereal time and latitude of the site.
const starMat = mat(
  `attribute float aMag; attribute float aBV; attribute float aPl; uniform float uDpr; varying vec3 vC; varying float vA;
   void main(){
     vec3 d = uStarM * position;
     float dark = 1.0 - smoothstep(-0.26, -0.06, uAirSun.y);
     float lim = mix(6.6, 3.0, uMoonI * 0.6) - (1.0 - dark) * 9.5;             // the moon and twilight wash out faint stars (only Venus survives into bright twilight)
     float h = hash2(position.xy * 91.0);
     float tw = 1.0 + (0.22 + 0.5 * (1.0 - smoothstep(0.0, 0.4, d.y))) * sin(uTime * (7.0 + h * 11.0) + h * 60.0) * (1.0 - 0.85 * aPl);   // stars twinkle, most low down; planets hardly
     float b = pow(10.0, -0.4 * (aMag - 3.3)) * smoothstep(lim, lim - 1.2, aMag);
     vA = min(sqrt(b) * 0.85, 2.6) * tw * smoothstep(0.0, 0.1, d.y) * (1.0 - cloudAt(d)) * step(0.0, uCamPos.y);
     vC = mix(vec3(0.68, 0.8, 1.0), vec3(1.0, 0.72, 0.45), smoothstep(-0.1, 1.5, aBV));
     gl_PointSize = uDpr * clamp(1.9 + (4.5 - aMag) * 0.65, 1.6, 6.0);
     gl_Position = projectionMatrix * viewMatrix * vec4(uCamPos + d * 380.0, 1.0);
     if (vA < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
   }`,
  `varying vec3 vC; varying float vA;
   void main(){ float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC * vA * smoothstep(0.5, 0.1, r) * 1.4, 1.0); }`,
  { uniforms: { uDpr: { value: 1 } }, opts: { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } });
export const stars = new THREE.Points(new THREE.BufferGeometry(), starMat);
stars.frustumCulled = false;
stars.renderOrder = -0.5;
oceanScene.add(stars);
// the naked-eye planets, drawn like stars but hardly twinkling; moved by setPlanets()
const planetGeo = new THREE.BufferGeometry();
planetGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(15), 3));
planetGeo.setAttribute('aMag', new THREE.BufferAttribute(new Float32Array(5), 1));
planetGeo.setAttribute('aBV', new THREE.BufferAttribute(new Float32Array(5), 1));
planetGeo.setAttribute('aPl', new THREE.BufferAttribute(new Float32Array(5).fill(1), 1));
export const planetPts = new THREE.Points(planetGeo, starMat);
planetPts.frustumCulled = false; planetPts.renderOrder = -0.5;
oceanScene.add(planetPts);
export function setPlanets(list: { dir: number[]; mag: number; bv: number }[]) {
  const P = planetGeo.attributes.position as THREE.BufferAttribute, M = planetGeo.attributes.aMag as THREE.BufferAttribute, B = planetGeo.attributes.aBV as THREE.BufferAttribute;
  list.forEach((p, i) => { P.setXYZ(i, p.dir[0], p.dir[1], p.dir[2]); M.setX(i, p.mag); B.setX(i, p.bv); });
  P.needsUpdate = M.needsUpdate = B.needsUpdate = true;
}
if (typeof document !== 'undefined') fetch(`${import.meta.env.BASE_URL}stars.bin`).then((r) => r.arrayBuffer()).then((buf) => {
  const dv = new DataView(buf), n = buf.byteLength / 6;
  const pos = new Float32Array(n * 3), mag = new Float32Array(n), bv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ra = dv.getUint16(i * 6, true) / 65535 * Math.PI * 2, dec = dv.getInt16(i * 6 + 2, true) / 32767 * Math.PI / 2;
    pos[i * 3] = Math.cos(dec) * Math.cos(ra); pos[i * 3 + 1] = Math.cos(dec) * Math.sin(ra); pos[i * 3 + 2] = Math.sin(dec);
    mag[i] = dv.getUint8(i * 6 + 4) / 25 - 2; bv[i] = dv.getUint8(i * 6 + 5) / 100 - 0.5;
  }
  stars.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stars.geometry.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  stars.geometry.setAttribute('aBV', new THREE.BufferAttribute(bv, 1));
  stars.geometry.setAttribute('aPl', new THREE.BufferAttribute(new Float32Array(n), 1));
}).catch(() => {});

// rain falling past the drone
const DROPS = 2400;
const rainGeo = new THREE.BufferGeometry();
{
  const p = new Float32Array(DROPS * 6), e = new Float32Array(DROPS * 2);
  for (let i = 0; i < DROPS; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    p.set([x, y, z, x, y, z], i * 6); e[i * 2 + 1] = 1;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  rainGeo.setAttribute('aEnd', new THREE.BufferAttribute(e, 1));
}
export const rain = new THREE.LineSegments(rainGeo, mat(
  `attribute float aEnd; varying float vA;
   void main(){
     float B = 26.0;
     vec3 fall = vec3(uCurrent.x * 1.5, -9.0, uCurrent.y * 1.5);
     vec3 wp = uCamPos + mod(position * B + fall * uTime - uCamPos + B * 0.5, B) - B * 0.5;
     wp -= fall * 0.045 * aEnd;
     float d = length(wp - uCamPos);
     vA = step(hash2(position.xz * 57.0), uRain) * smoothstep(0.4, 2.0, d) * (1.0 - smoothstep(8.0, 13.0, d)) * step(0.0, wp.y);
     gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
   }`,
  `varying float vA; void main(){ gl_FragColor = vec4(skyAir(vec3(0.0, 0.6, 0.8), -1.0) * vA * 0.35 * (1.0 + uFlash * 3.0), 1.0); }`,
  { opts: { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } }));
rain.frustumCulled = false;
oceanScene.add(rain);

// once a frame: follow the camera, and show only what belongs on this side of the surface
export function updateAir(cam: THREE.PerspectiveCamera, px: number, dpr: number) {
  const up = cam.position.y > 0;
  seaTop.visible = abyss.visible = stars.visible = planetPts.visible = up;
  rain.visible = up && U.uRain.value > 0.01;
  seaTop.position.set(cam.position.x, 0, cam.position.z);
  abyss.position.set(cam.position.x, -200, cam.position.z);
  const su = (seaTop.material as THREE.ShaderMaterial).uniforms;
  su.uPxA.value = 2 * Math.tan(cam.fov * Math.PI / 360) / Math.max(px, 1);
  su.uProj.value.copy(cam.projectionMatrix);
  (starMat.uniforms.uDpr as { value: number }).value = dpr;
}

// the refraction copy from post-processing, or none (the surface then blends over the scene)
export function setRefraction(tex: THREE.Texture | null, w = 1, h = 1) {
  const su = (seaTop.material as THREE.ShaderMaterial).uniforms;
  su.tRefr.value = tex; su.uRefrOn.value = tex ? 1 : 0; su.uRes.value.set(w, h);
}
