// The globe you pick a sea from, lit by the real sun (day/night terminator follows the sim clock).
import * as THREE from 'three';
import { U } from './render/common';
import { clamp } from './core/math';
import { LOCATIONS } from './data/locations';
import { subsolar } from './time/astro';
import earthUrl from './earth.jpg';
import nightUrl from './night.jpg';
import marbleUrl from './bluemarble.jpg';   // NASA Blue Marble shaded relief + bathymetry (public domain)   // NASA Black Marble 2016 (VIIRS, public domain)

const D2R = Math.PI / 180;
export const globeScene = new THREE.Scene();
export const gcam = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
export const ll2v = (lat: number, lon: number, r = 1) =>
  new THREE.Vector3(Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R), Math.cos(lat * D2R) * Math.cos(lon * D2R)).multiplyScalar(r);

const earthTex = new THREE.TextureLoader().load(earthUrl);
earthTex.minFilter = THREE.LinearFilter;
earthTex.generateMipmaps = false;
const nightTex = new THREE.TextureLoader().load(nightUrl);
const marbleTex = new THREE.TextureLoader().load(marbleUrl);
marbleTex.anisotropy = 4;
const GBR_A = ll2v(-10.8, 143.9), GBR_B = ll2v(-24.2, 152.6), MV_A = ll2v(7.0, 72.9), MV_B = ll2v(-0.6, 73.2);

export const earthMat = new THREE.ShaderMaterial({
  uniforms: {
    uEarth: { value: earthTex }, uTime: U.uTime, uLight: { value: new THREE.Vector3(0, 0, 1) }, uCam: { value: new THREE.Vector3() },
    uM: { value: LOCATIONS.map((l) => ll2v(l.lat, l.lon)) }, uHot: { value: -1 }, uNightTex: { value: nightTex }, uRings: { value: 1 }, uMarble: { value: marbleTex },
    uGa: { value: GBR_A }, uGb: { value: GBR_B }, uMa: { value: MV_A }, uMb: { value: MV_B },
  },
  vertexShader: `varying vec3 vN; varying vec3 vWp; void main(){ vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    uniform sampler2D uEarth; uniform float uTime; uniform vec3 uLight; uniform vec3 uCam; uniform vec3 uM[${LOCATIONS.length}]; uniform float uHot; uniform sampler2D uNightTex; uniform float uRings; uniform sampler2D uMarble;
    uniform vec3 uGa; uniform vec3 uGb; uniform vec3 uMa; uniform vec3 uMb;
    varying vec3 vN; varying vec3 vWp;
    float seg(vec3 n, vec3 a, vec3 b, float w){ vec3 ab = b - a; float t = clamp(dot(n - a, ab) / dot(ab, ab), 0.0, 1.0); return exp(-pow(length(n - (a + ab * t)) / w, 2.0)); }
    float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec3 n = normalize(vN);
      float lat = asin(clamp(n.y, -1.0, 1.0)), lon = atan(n.x, n.z);
      vec4 e = texture2D(uEarth, vec2(lon / 6.28318 + 0.5, lat / 3.14159 + 0.5));
      float land = smoothstep(0.35, 0.65, e.r);
      float coast = clamp(e.g - e.r, 0.0, 1.0);
      vec3 ocean = mix(vec3(0.012, 0.045, 0.11), vec3(0.03, 0.15, 0.25), e.b);
      ocean = mix(ocean, vec3(0.10, 0.52, 0.60), coast * 0.5);
      float reef = seg(n, uGa, uGb, 0.02) * 0.8 + seg(n, uMa, uMb, 0.012);
      for (int i = 0; i < ${LOCATIONS.length}; i++) if (${LOCATIONS.map((l, i) => l.pelagic ? `i != ${i}` : '').filter(Boolean).join(' && ') || 'true'}) reef += exp(-pow(length(n - uM[i]) / 0.012, 2.0));   // open-ocean sites have no reef to light up
      ocean = mix(ocean, vec3(0.30, 0.95, 0.85), clamp(reef, 0.0, 1.0) * 0.7);
      float nz = h1(floor(vec2(lon, lat) * 180.0));
      vec3 landc = mix(vec3(0.36, 0.34, 0.27), vec3(0.20, 0.27, 0.17), smoothstep(0.55, 0.95, e.b) * (0.6 + 0.4 * nz));
      landc = mix(landc, vec3(0.85, 0.88, 0.9), smoothstep(1.1, 1.3, abs(lat)));
      vec3 col = mix(ocean, landc, land);
      // the real Earth underneath: true colour relief + bathymetry, tinted slightly towards the old palette so reefs still read
      vec3 bm = pow(texture2D(uMarble, vec2(lon / 6.28318 + 0.5, lat / 3.14159 + 0.5)).rgb, vec3(2.0)) * 1.15;
      col = mix(bm, col, 0.18) + vec3(0.30, 0.95, 0.85) * clamp(reef, 0.0, 1.0) * 0.12 * (1.0 - land);
      vec3 V = normalize(uCam - vWp);
      float ld = dot(n, uLight);
      float day = smoothstep(-0.12, 0.12, ld);
      col *= mix(0.32, 0.3 + 0.9 * max(ld, 0.0), day);
      col += vec3(1.0, 0.5, 0.25) * exp(-pow(ld / 0.06, 2.0)) * 0.08;
      // city lights on the night side (NASA Black Marble)
      vec3 nl = texture2D(uNightTex, vec2(lon / 6.28318 + 0.5, lat / 3.14159 + 0.5)).rgb;
      col += vec3(1.0, 0.76, 0.42) * smoothstep(0.08, 0.5, (nl.r + nl.g) * 0.5 - nl.b * 0.45) * (1.0 - day) * 1.1;
      col += vec3(0.6, 0.8, 0.9) * pow(max(dot(reflect(-uLight, n), V), 0.0), 90.0) * 0.18 * (1.0 - land) * day;
      float gl = max(1.0 - smoothstep(0.0, 0.0035, abs(fract(lat / 0.2618 + 0.5) - 0.5) * 0.2618), 1.0 - smoothstep(0.0, 0.0035 / max(cos(lat), 0.2), abs(fract(lon / 0.2618 + 0.5) - 0.5) * 0.2618));
      col += vec3(0.4, 0.7, 0.8) * gl * 0.06 * uRings;
      for (int i = 0; i < ${LOCATIONS.length}; i++) {
        float dd = length(n - uM[i]);
        float ph = fract(uTime * 0.5 + float(i) * 0.33);
        float ring = exp(-pow((dd - ph * 0.06) / 0.004, 2.0)) * (1.0 - ph);
        col += vec3(0.4, 1.0, 0.9) * ring * (uHot == float(i) ? 1.4 : 0.7) * uRings;
      }
      float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
      col += vec3(0.25, 0.55, 0.9) * rim * 0.5;
      gl_FragColor = vec4(col, 1.0);
    }`,
});
globeScene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), earthMat));

const halo = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShaderMaterial({
  vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec2 vUv; void main(){ float r = length(vUv); float g = r < 1.0 ? 0.0 : exp(-(r - 1.0) * 14.0); gl_FragColor = vec4(vec3(0.3, 0.6, 1.0) * g * 0.55, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
halo.renderOrder = -1;
globeScene.add(halo);
{
  const N = 2500, p = new Float32Array(N * 3), s = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(60);
    p.set([v.x, v.y, v.z], i * 3); s[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  globeScene.add(new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime },
    vertexShader: `attribute float aS; uniform float uTime; varying float vA; void main(){ vA = (0.3 + 0.7 * aS) * (0.75 + 0.25 * sin(uTime * (0.5 + aS * 2.0) + aS * 40.0)); gl_PointSize = 1.0 + aS * 1.8; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.8, 0.88, 1.0) * vA * smoothstep(0.5, 0.0, r), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));
}

interface Tween { t0: number; dur: number; lat0: number; lat1: number; lon0: number; dlon: number; d0: number; d1: number; done: () => void }
export const gv = { lat: 12, lon: 116, dist: 3.5, vlat: 0, vlon: 0, dragging: false, lastUser: -1e9, tween: null as Tween | null };

export function updateGlobe(dt: number, now: number, ms: number, reduceMotion: boolean) {
  if (gv.tween) {
    const tw = gv.tween, k = Math.min(1, (now - tw.t0) / tw.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    gv.lat = tw.lat0 + (tw.lat1 - tw.lat0) * e; gv.lon = tw.lon0 + tw.dlon * e; gv.dist = tw.d0 + (tw.d1 - tw.d0) * e;
    if (k >= 1) { gv.tween = null; tw.done(); }
  } else {
    if (!gv.dragging) { gv.lon += gv.vlon * dt; gv.lat = clamp(gv.lat + gv.vlat * dt, -70, 70); }   // (while held, the drag alone moves it)
    gv.vlon *= Math.exp(-dt * 4.5); gv.vlat *= Math.exp(-dt * 4.5);
    if (now - gv.lastUser > 5000 && !reduceMotion) gv.lon += dt * 2.2;
  }
  {
    gcam.position.copy(ll2v(gv.lat, gv.lon, gv.dist));
    gcam.up.set(0, 1, 0);
    gcam.lookAt(0, 0, 0);
    earthMat.uniforms.uCam.value.copy(gcam.position);
  }
  const ss = subsolar(ms);
  earthMat.uniforms.uLight.value.copy(ll2v(ss.lat, ss.lon));
}

export function tweenGlobe(lat: number, lon: number, dist: number, dur: number): Promise<void> {
  return new Promise((done) => {
    const dlon = ((lon - gv.lon) % 360 + 540) % 360 - 180;
    gv.tween = { t0: performance.now(), dur, lat0: gv.lat, lat1: lat, lon0: gv.lon, dlon, d0: gv.dist, d1: dist, done };
  });
}
