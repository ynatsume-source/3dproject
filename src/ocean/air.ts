// Above the water: the sea surface seen from the air, the open ocean beyond the modelled reef, the
// real stars over the site, and rain.
import * as THREE from 'three';
import { mat, U } from '../render/common';
import { oceanScene } from './scenery';

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
const DISC = discGeo(0.5, 70000, 72, 96);

// The sea from above. Premultiplied: the colour is what the surface reflects and sparkles with, the
// alpha how much of the water below it hides (Fresnel), so the reef shows through where we look down.
export const seaTop = new THREE.Mesh(DISC, mat(
  `varying vec3 vWp; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  `varying vec3 vWp;
   uniform float uPxA;
   void main(){
     vec3 v = vWp - uCamPos; float d = length(v); vec3 dir = v / d, V = -dir;
     float fp = d * uPxA / max(V.y, 0.04);                 // how much sea one pixel covers
     // a wind sea: a dozen wave trains around the wind direction, each dropped (and its slope kept as
     // roughness) once it is smaller than a pixel
     vec2 p = vWp.xz; float t = uTime; vec2 g = vec2(0.0); float rough = 0.0025 + uRain * 0.02;
     float wa = atan(uCurrent.y, uCurrent.x) + 0.6;
     for (int i = 0; i < 16; i++) {
       float fi = float(i), a = wa + (hash2(vec2(fi, 3.7)) - 0.5) * 2.8;
       vec2 wd = vec2(cos(a), sin(a));
       float k = 0.14 * pow(1.33, fi) * (0.85 + 0.3 * hash2(vec2(fi, 1.3))), lam = 6.28318 / k;
       float sl = 0.085 * uWave / (1.0 + fi * 0.15);
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
       vec3 rad = k == 0 ? sc * 7.0 : vec3(0.75, 0.8, 0.9) * uMoonIllum * 1.5 * (1.0 - dayAir()) * (1.0 - 0.9 * uCloud);
       col += rad * D * F / (4.0 * nv) * smoothstep(0.0, 0.05, L.y) * 0.25;
     }
     // whitecaps once the wind picks up
     float foam = smoothstep(0.68, 0.78, fbm2(p * 0.09 + vec2(t * 0.03, t * 0.01)) + g.x * 0.4) * clamp((uWave - 1.2) * 1.2, 0.0, 1.0);
     vec3 foamC = (sunAirCol() * max(uAirSun.y, 0.0) * 0.9 + skyAir(vec3(0.0, 1.0, 0.0), -1.0) * 0.8) * (1.0 + uFlash);
     vec4 o = vec4(col + foamC * foam, min(1.0, F + foam));
     // far off, the air itself: the sea melts into the sky at the horizon
     float fh = 1.0 - exp(-d / 18000.0);
     vec3 haze = skyAir(normalize(vec3(dir.x, 0.004, dir.z)), -1.0);
     gl_FragColor = vec4(mix(o.rgb, haze, fh), mix(o.a, 1.0, fh));
   }`,
  { uniforms: { uPxA: { value: 0.0012 } }, opts: { side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } }));
seaTop.frustumCulled = false;
seaTop.renderOrder = 5;
oceanScene.add(seaTop);

// the open ocean floor far below: all we see of it is deep blue water
export const abyss = new THREE.Mesh(DISC, mat(
  `varying vec3 vWp; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  `varying vec3 vWp; void main(){ gl_FragColor = vec4(fogIt(vec3(0.0), vWp), 1.0); }`, { opts: { side: THREE.DoubleSide } }));
abyss.frustumCulled = false;
oceanScene.add(abyss);

// The stars: the ~5000 naked-eye stars of the Yale Bright Star Catalogue (via d3-celestial), placed by
// the real sidereal time and latitude of the site.
const starMat = mat(
  `attribute float aMag; attribute float aBV; uniform float uDpr; varying vec3 vC; varying float vA;
   void main(){
     vec3 d = uStarM * position;
     float dark = 1.0 - smoothstep(-0.26, -0.06, uAirSun.y);
     float lim = mix(6.3, 3.0, uMoonI * 0.6) - (1.0 - dark) * 4.0;             // the moon and twilight wash out faint stars
     float h = hash2(position.xy * 91.0);
     float tw = 1.0 + (0.22 + 0.5 * (1.0 - smoothstep(0.0, 0.4, d.y))) * sin(uTime * (7.0 + h * 11.0) + h * 60.0);   // they twinkle most low down
     float b = pow(10.0, -0.4 * (aMag - 3.3)) * smoothstep(lim, lim - 1.2, aMag);
     vA = min(sqrt(b) * 0.6, 2.2) * tw * smoothstep(0.0, 0.1, d.y) * (1.0 - cloudAt(d)) * step(0.0, uCamPos.y);
     vC = mix(vec3(0.68, 0.8, 1.0), vec3(1.0, 0.72, 0.45), smoothstep(-0.1, 1.5, aBV));
     gl_PointSize = uDpr * clamp(1.6 + (4.5 - aMag) * 0.6, 1.4, 5.5);
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
fetch(`${import.meta.env.BASE_URL}stars.bin`).then((r) => r.arrayBuffer()).then((buf) => {
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
  seaTop.visible = abyss.visible = stars.visible = up;
  rain.visible = up && U.uRain.value > 0.01;
  seaTop.position.set(cam.position.x, 0, cam.position.z);
  abyss.position.set(cam.position.x, -200, cam.position.z);
  (seaTop.material as THREE.ShaderMaterial).uniforms.uPxA.value = 2 * Math.tan(cam.fov * Math.PI / 360) / Math.max(px, 1);
  (starMat.uniforms.uDpr as { value: number }).value = dpr;
}
