// Scenery shared by every sea: open-water backdrop, the surface seen from below, light shafts,
// marine snow (bioluminescent at night) and the travelling seagrass tile.
import * as THREE from 'three';
import { mat } from '../render/common';

export const WORLD = 260;   // half-size of a sea's seabed (m)
export const LIMIT = 130;   // how far the drone and animals roam
export const HN = 512;      // seagrass heightmap resolution

export const oceanScene = new THREE.Scene();

export const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), mat(
  `varying vec3 vWp; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  `varying vec3 vWp; void main(){ gl_FragColor = vec4(waterCol(normalize(vWp - uCamPos)), 1.0); }`,
  { opts: { side: THREE.BackSide, depthWrite: false } }));
sky.renderOrder = -1;
oceanScene.add(sky);

export const surface = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1).rotateX(Math.PI / 2), mat(
  `varying vec3 vWp; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  `varying vec3 vWp;
   vec3 airDir(vec3 d){ return normalize(vec3(d.x, sqrt(max(1.0 - 1.777 * (1.0 - d.y * d.y), 0.0)), d.z)); }
   void main(){
     vec3 v = vWp - uCamPos; float dist = length(v); vec3 dir = v / dist;
     vec2 p = vWp.xz; float t = uTime; vec2 g = vec2(0.0);
     vec2 d1 = vec2(0.86, 0.5), d2 = vec2(-0.3, 0.95), d3 = vec2(0.6, -0.8), d4 = vec2(-0.95, -0.2);
     g += d1 * cos(dot(d1, p) * 0.45 + t * 1.1) * 0.08;
     g += d2 * cos(dot(d2, p) * 0.9 + t * 1.6) * 0.06;
     g += d3 * cos(dot(d3, p) * 1.7 + t * 2.3) * 0.04;
     g += d4 * cos(dot(d4, p) * 3.1 + t * 3.1) * 0.025;
     vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
     float cosT = clamp(dot(dir, n), 0.0, 1.0);
     float sinT = sqrt(1.0 - cosT * cosT);
     float tr = smoothstep(0.0, 0.12, 1.0 - 1.333 * sinT);
     vec3 refr = refract(dir, -n, 1.333);
     vec3 sunAir = airDir(SUN), moonAir = airDir(uMoonDir);
     float sd = max(dot(refr, sunAir), 0.0);
     float sunGlow = (pow(sd, 180.0) * 3.0 + pow(sd, 6.0) * 0.35) * uSunI;
     float moonGlow = pow(max(dot(refr, moonAir), 0.0), 400.0) * 2.0 * uMoonI;
     vec3 air = mix(uSkyLo, uSkyHi, cosT) + sunGlow * uTint + moonGlow * vec3(0.8, 0.85, 0.9);
     vec3 tir = waterCol(reflect(dir, -n)) * 0.9 + vec3(0.02, 0.05, 0.05) * uAmb;
     vec3 col = mix(tir, air, tr);
     col *= exp(-max(-uCamPos.y, 0.0) * vec3(0.05, 0.02, 0.015));
     gl_FragColor = vec4(fogIt(col, vWp), 1.0);
   }`, { opts: { side: THREE.DoubleSide } }));
oceanScene.add(surface);

function buildShafts(N: number) {
  const base: number[] = [], corner: number[] = [], rnd: number[] = [], idx: number[] = [], pos: number[] = [];
  for (let i = 0; i < N; i++) {
    const bx = Math.random(), bz = Math.random(), w = 0.6 + Math.random() * 2.6, ph = Math.random() * 6.28, s = i * 4;
    for (const [cx, cy] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) { base.push(bx, bz); corner.push(cx, cy); rnd.push(w, ph); pos.push(0, 0, 0); }
    idx.push(s, s + 1, s + 2, s + 2, s + 1, s + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 2));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('aRnd', new THREE.Float32BufferAttribute(rnd, 2));
  g.setIndex(idx);
  return g;
}
export const shafts = new THREE.Mesh(buildShafts(70), mat(
  `attribute vec2 aBase; attribute vec2 aCorner; attribute vec2 aRnd; varying vec2 vC; varying float vA;
   void main(){
     float R = 42.0;
     vec2 drift = vec2(uTime * 0.25, uTime * 0.12);
     vec2 base = uCamPos.xz + mod(aBase * 2.0 * R + drift - uCamPos.xz + R, 2.0 * R) - R;
     vec3 rayDir = -SUN;
     vec3 along = vec3(base.x, 0.0, base.y) + rayDir * 48.0 * aCorner.y;
     vec3 side = normalize(cross(rayDir, normalize(uCamPos - along)));
     vec3 wp = along + side * aCorner.x * aRnd.x * (0.55 + 0.7 * aCorner.y);
     vA = (0.5 + 0.5 * sin(uTime * 0.5 + aRnd.y)) * smoothstep(1.5, 7.0, length(wp - uCamPos)) * (1.0 - smoothstep(22.0, 42.0, length(base - uCamPos.xz)));
     vC = aCorner;
     gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
   }`,
  `varying vec2 vC; varying float vA;
   void main(){
     float a = pow(1.0 - abs(vC.x), 1.8) * pow(1.0 - vC.y, 1.6) * vA * 0.085 * mix(0.45, 1.0, exp(min(uCamPos.y, 0.0) * 0.03)) * uSunI;
     gl_FragColor = vec4(vec3(0.75, 0.95, 0.92) * uTint * a, 1.0);
   }`,
  { opts: { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } }));
shafts.frustumCulled = false;
oceanScene.add(shafts);

export const SNOW = 2600;
export const snowGeo = new THREE.BufferGeometry();
{
  const p = new Float32Array(SNOW * 3), r = new Float32Array(SNOW);
  for (let i = 0; i < SNOW; i++) { p[i * 3] = Math.random(); p[i * 3 + 1] = Math.random(); p[i * 3 + 2] = Math.random(); r[i] = Math.random(); }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  snowGeo.setAttribute('aR', new THREE.BufferAttribute(r, 1));
}
export const snowMat = mat(
  `attribute float aR; uniform float uPx; varying float vA; varying float vGlow;
   void main(){
     float B = 28.0;
     vec3 drift = vec3(sin(uTime * 0.13 + aR * 20.0) * 0.6 + uTime * uCurrent.x * 0.12, -uTime * 0.04 * (0.5 + aR), cos(uTime * 0.11 + aR * 13.0) * 0.6 + uTime * uCurrent.y * 0.12);
     vec3 wp = uCamPos + mod(position * B + drift - uCamPos + B * 0.5, B) - B * 0.5;
     wp.y = min(wp.y, -0.2);
     vec4 mv = viewMatrix * vec4(wp, 1.0); float d = -mv.z;
     vA = smoothstep(0.3, 1.5, d) * (1.0 - smoothstep(9.0, 14.0, d)) * (0.35 + 0.65 * aR);
     // dinoflagellates flash when stirred: brightest close to the drone, twinkling
     float tw = pow(max(sin(uTime * (1.5 + aR * 3.0) + aR * 50.0), 0.0), 12.0);
     vGlow = uNight * step(0.55, aR) * (tw * 0.8 + (1.0 - smoothstep(0.5, 3.5, d)) * 0.9);
     gl_PointSize = uPx * (0.018 + 0.03 * aR) / max(d, 0.1) * (1.0 + vGlow);
     gl_Position = projectionMatrix * mv;
   }`,
  `varying float vA; varying float vGlow;
   void main(){
     float r = length(gl_PointCoord - 0.5);
     vec3 c = vec3(0.85, 0.95, 0.9) * max(uAmb, 0.08) * vA * 0.5 + vec3(0.3, 0.95, 1.0) * vGlow * 0.9;
     gl_FragColor = vec4(c * smoothstep(0.5, 0.1, r), 1.0);
   }`,
  { uniforms: { uPx: { value: 800 } }, opts: { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } });
const snow = new THREE.Points(snowGeo, snowMat);
snow.frustumCulled = false;
oceanScene.add(snow);

export const BLADES = 50000, SEG = 3, TILE = 60;
function buildGrass() {
  const vpb = (SEG + 1) * 2, n = BLADES * vpb;
  const off = new Float32Array(n * 2), rnd = new Float32Array(n * 4), vv = new Float32Array(n * 2), dummy = new Float32Array(n * 3);
  const idx = new Uint32Array(BLADES * SEG * 6);
  let vi = 0, ii = 0;
  for (let b = 0; b < BLADES; b++) {
    const ox = Math.random() * TILE, oz = Math.random() * TILE;
    const th = Math.random(), h = 0.4 + Math.pow(Math.random(), 1.6) * 0.8, w = 0.03 + Math.random() * 0.04, a = Math.random() * Math.PI * 2, start = vi;
    for (let s = 0; s <= SEG; s++) for (let side = -1; side <= 1; side += 2) {
      off[vi * 2] = ox; off[vi * 2 + 1] = oz;
      rnd[vi * 4] = th; rnd[vi * 4 + 1] = h; rnd[vi * 4 + 2] = w; rnd[vi * 4 + 3] = a;
      vv[vi * 2] = side; vv[vi * 2 + 1] = s / SEG; vi++;
    }
    for (let s = 0; s < SEG; s++) { const r0 = start + s * 2, r1 = r0 + 2; idx[ii++] = r0; idx[ii++] = r0 + 1; idx[ii++] = r1; idx[ii++] = r1; idx[ii++] = r0 + 1; idx[ii++] = r1 + 1; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(dummy, 3));
  geo.setAttribute('aOff', new THREE.BufferAttribute(off, 2));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  geo.setAttribute('aV', new THREE.BufferAttribute(vv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}
export const grassGeo = buildGrass();
export const grassMat = mat(
  `attribute vec2 aOff; attribute vec4 aRnd; attribute vec2 aV;
   uniform sampler2D uHeight; uniform float uTile;
   varying vec3 vWp; varying float vT; varying float vCaus; varying float vShade;
   vec2 terr(vec2 xz){
     vec2 p = (xz + ${WORLD.toFixed(1)}) / ${(2 * WORLD).toFixed(1)} * ${HN.toFixed(1)} - 0.5;
     vec2 i = floor(p), f = p - i; float inv = 1.0 / ${HN.toFixed(1)};
     vec2 a = texture2D(uHeight, (i + vec2(0.5, 0.5)) * inv).rg;
     vec2 b = texture2D(uHeight, (i + vec2(1.5, 0.5)) * inv).rg;
     vec2 c = texture2D(uHeight, (i + vec2(0.5, 1.5)) * inv).rg;
     vec2 d = texture2D(uHeight, (i + vec2(1.5, 1.5)) * inv).rg;
     return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
   }
   void main(){
     vec2 base = uCamPos.xz + mod(aOff - uCamPos.xz + uTile * 0.5, uTile) - uTile * 0.5;
     vec2 td = terr(base);
     float alive = step(aRnd.x, td.y) * (1.0 - smoothstep(uTile * 0.34, uTile * 0.5, length(base - uCamPos.xz)));
     float t = aV.y;
     float h = aRnd.y * (0.55 + 0.6 * td.y) * alive;
     float w = aRnd.z * (1.0 - pow(t, 1.7)) * alive;
     float a = aRnd.w;
     vec3 p = vec3(base.x, td.x - 0.15, base.y) + vec3(cos(a), 0.0, sin(a)) * aV.x * w + vec3(0.0, t * h, 0.0);
     float cs = length(uCurrent);
     float sway = sin(uTime * 0.8 + base.x * 0.11 + base.y * 0.07) * 0.4 + cs * 0.6 + sin(uTime * 1.9 + a * 7.0) * 0.15;
     float bend = t * t * h * 0.55;
     p.xz += normalize(uCurrent + vec2(1e-4)) * sway * bend; p.y -= abs(sway) * bend * 0.35;
     vec3 dc = p - uCamPos;
     p.xz += normalize(dc.xz + 1e-4) * (1.0 - smoothstep(0.5, 2.4, length(dc.xz))) * t * t * step(abs(dc.y), 2.6);
     vWp = p; vT = t; vCaus = caus2(p); vShade = 0.7 + 0.3 * fract(a * 3.7);
     gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
   }`,
  `varying vec3 vWp; varying float vT; varying float vCaus; varying float vShade;
   void main(){
     vec3 alb = mix(vec3(0.10, 0.25, 0.11), vec3(0.44, 0.64, 0.27), vT) * vShade;
     vec3 col = absorb(alb * lightAt(vec3(0.0, 1.0, 0.0)) * 1.2, vWp.y) + absorb(vec3(0.9, 1.0, 0.9), vWp.y) * vCaus * 0.55 * alb * (0.4 + vT);
     col += lamp(alb, vWp, normalize(uCamPos - vWp));
     gl_FragColor = vec4(fogIt(col, vWp), 1.0);
   }`,
  { uniforms: { uHeight: { value: null }, uTile: { value: TILE } }, opts: { side: THREE.DoubleSide } });
export const grass = new THREE.Mesh(grassGeo, grassMat);
grass.frustumCulled = false;
grass.visible = false;
oceanScene.add(grass);
