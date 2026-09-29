// The way in: from where you are, across the real Earth, down onto the real reef, and into the water.
// The flight starts over your home (its location if you allow it, otherwise a guess from your time
// zone), climbs along the great circle to the sea you chose, and descends over true-colour satellite
// imagery of that reef (Sentinel-2 cloudless 2016, EOX, CC BY 4.0) until it touches the surface.
import * as THREE from 'three';
import { globeScene, gcam, ll2v, earthMat } from './globe';

/* ---------------- home ---------------- */
export interface Home { lat: number; lon: number; label: string; exact: boolean }
const ZONES: Record<string, [number, number, string]> = {
  'Asia/Tokyo': [35.68, 139.77, '東京'], 'Asia/Seoul': [37.57, 126.98, 'ソウル'], 'Asia/Shanghai': [31.23, 121.47, '上海'], 'Asia/Taipei': [25.03, 121.57, '台北'],
  'Asia/Hong_Kong': [22.32, 114.17, '香港'], 'Asia/Singapore': [1.35, 103.82, 'シンガポール'], 'Asia/Bangkok': [13.75, 100.5, 'バンコク'], 'Asia/Kolkata': [28.61, 77.21, 'デリー'],
  'Australia/Sydney': [-33.87, 151.21, 'シドニー'], 'Australia/Brisbane': [-27.47, 153.03, 'ブリスベン'], 'Europe/London': [51.51, -0.13, 'ロンドン'], 'Europe/Paris': [48.86, 2.35, 'パリ'],
  'Europe/Berlin': [52.52, 13.4, 'ベルリン'], 'America/New_York': [40.71, -74.0, 'ニューヨーク'], 'America/Los_Angeles': [34.05, -118.24, 'ロサンゼルス'], 'America/Chicago': [41.88, -87.63, 'シカゴ'],
  'Pacific/Honolulu': [21.31, -157.86, 'ホノルル'],
};
export function loadHome(): Home {
  try { const h = JSON.parse(localStorage.getItem('seaglass.home') || 'null'); if (h && typeof h.lat === 'number') return h; } catch (e) { /* ignore */ }
  let tz = 'Asia/Tokyo';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) { /* ignore */ }
  const z = ZONES[tz] || ZONES['Asia/Tokyo'];
  return { lat: z[0], lon: z[1], label: z[2], exact: false };
}
export function locateHome(): Promise<Home | null> {
  return new Promise((done) => {
    if (!navigator.geolocation) return done(null);
    navigator.geolocation.getCurrentPosition((p) => {
      // rounded to ~1 km: enough to start above your neighbourhood, and nothing more is kept
      const h: Home = { lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100, label: '現在地', exact: true };
      try { localStorage.setItem('seaglass.home', JSON.stringify(h)); } catch (e) { /* ignore */ }
      done(h);
    }, () => done(null), { enableHighAccuracy: false, timeout: 12000, maximumAge: 3600000 });
  });
}
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  return Math.acos(Math.min(1, ll2v(a.lat, a.lon).dot(ll2v(b.lat, b.lon)))) * 6371;
}

/* ---------------- satellite imagery near each sea ---------------- */
interface SatLevel { file: string; z: number; north: number; south: number; west: number; east: number }
let SAT: Record<string, SatLevel[]> | null = null;
const loader = new THREE.TextureLoader();
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const patches = new Map<string, { mesh: THREE.Mesh; z: number }[]>();
const glint = { value: 0 }, deep = { value: 0 };

async function satMeta() {
  if (!SAT) { try { SAT = await (await fetch(`${import.meta.env.BASE_URL}sat/sat.json`)).json(); } catch (e) { SAT = {}; } }
  return SAT!;
}
const satMat = (tex: THREE.Texture, L: SatLevel) => new THREE.ShaderMaterial({
  uniforms: { uTex: { value: tex }, uB: { value: new THREE.Vector4(L.west, L.east, merc(L.north), merc(L.south)) }, uLight: earthMat.uniforms.uLight, uFade: { value: 0 },
    uCam: earthMat.uniforms.uCam, uGlint: glint, uTime: earthMat.uniforms.uTime, uNightTex: earthMat.uniforms.uNightTex, uMarble: earthMat.uniforms.uMarble, uDeep: deep },
  vertexShader: `varying vec2 vLL; varying vec3 vN; varying vec3 vWp;
    void main(){ vN = normalize(position); vLL = vec2(degrees(atan(vN.x, vN.z)), degrees(asin(clamp(vN.y, -1.0, 1.0)))); vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform sampler2D uTex; uniform vec4 uB; uniform vec3 uLight; uniform float uFade; uniform vec3 uCam; uniform float uGlint; uniform float uTime; uniform sampler2D uNightTex; uniform sampler2D uMarble; uniform float uDeep;
    varying vec2 vLL; varying vec3 vN; varying vec3 vWp;
    float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
    void main(){
      float u = (vLL.x - uB.x) / (uB.y - uB.x);
      float m = log(tan(0.785398 + radians(vLL.y) * 0.5)), v = (m - uB.w) / (uB.z - uB.w);
      if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) discard;
      vec3 col = texture2D(uTex, vec2(u, v)).rgb;
      // open ocean takes the globe's own colour until we are low, so the patch never shows as a grey disc; reefs and land stand out
      vec2 guv = vec2(radians(vLL.x) / 6.28318 + 0.5, radians(vLL.y) / 3.14159 + 0.5);
      vec3 base = pow(texture2D(uMarble, guv).rgb, vec3(2.0)) * 1.15;
      float feat = max(smoothstep(0.02, 0.08, max(col.r, col.g) - col.b), smoothstep(0.55, 0.75, dot(col, vec3(0.33))));   // grey open-sea fill in the mosaic isn't a feature
      col = pow(col, vec3(1.35)) * 1.1;
      col = mix(base, col, max(feat, uDeep));
      float ld = dot(vN, uLight), day = smoothstep(-0.12, 0.12, ld);
      col *= mix(0.3, 0.35 + 0.85 * max(ld, 0.0), day);
      vec3 nl = texture2D(uNightTex, vec2(radians(vLL.x) / 6.28318 + 0.5, radians(vLL.y) / 3.14159 + 0.5)).rgb;
      col += vec3(1.0, 0.76, 0.42) * smoothstep(0.08, 0.5, (nl.r + nl.g) * 0.5 - nl.b * 0.45) * (1.0 - day) * 0.9;
      // close to the water: waves and sun glitter on the sea
      vec3 V = normalize(uCam - vWp);
      float water = 1.0 - smoothstep(0.1, 0.25, max(col.r, col.g) - col.b * 0.4);
      vec2 q = vec2(u, v) * 2600.0;
      // irregular wind sea: rotated octaves of value noise drifting at different speeds, glitter only on the steepest facets
      vec2 q1 = mat2(0.8, -0.6, 0.6, 0.8) * q * 0.9 + vec2(uTime * 0.35, uTime * 0.12);
      vec2 q2 = mat2(0.5, 0.87, -0.87, 0.5) * q * 2.3 - vec2(uTime * 0.2, uTime * 0.5);
      float wx = vn(q1) - vn(q1 + 3.7) + (vn(q2) - vn(q2 + 5.1)) * 0.5;
      float wz = vn(q1 + 9.2) - vn(q1 + 1.3) + (vn(q2 + 7.7) - vn(q2 + 2.9)) * 0.5;
      vec3 nn = normalize(vN + vec3(wx, 0.0, wz) * 0.05 * uGlint);
      float g = pow(max(dot(reflect(-uLight, nn), V), 0.0), 90.0) * smoothstep(0.7, 0.95, vn(q * 3.1 + uTime * 0.8));
      col += vec3(1.0, 0.95, 0.85) * g * uGlint * uGlint * water * day * 1.6;
      vec2 e2 = abs(vec2(u, v) - 0.5) * 2.0; float a = (1.0 - smoothstep(0.45, 0.98, length(pow(e2, vec2(3.0))) * 0.5 + max(e2.x, e2.y) * 0.5)) * uFade;   // soft, rounded edges
      gl_FragColor = vec4(col, a);
    }`,
  transparent: true, depthWrite: false,
});
function buildPatch(L: SatLevel, order: number) {
  const n = 48, pos: number[] = [], idx: number[] = [], r = 1 + 0.000002 * order;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const lon = L.west + (L.east - L.west) * i / n, lat = L.south + (L.north - L.south) * j / n;
    pos.push(...ll2v(lat, lon, r).toArray());
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + n + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}
// start loading a sea's imagery (called ahead of the flight)
export async function satPrepare(id: string) {
  if (patches.has(id)) return;
  patches.set(id, []);
  const meta = (await satMeta())[id] || [];
  meta.sort((a, b) => a.z - b.z).forEach((L, i) => {
    const tex = loader.load(`${import.meta.env.BASE_URL}sat/${L.file}`);
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(buildPatch(L, i + 1), satMat(tex, L));
    mesh.renderOrder = 2 + i; mesh.frustumCulled = false; mesh.visible = false;
    globeScene.add(mesh);
    patches.get(id)!.push({ mesh, z: L.z });
  });
}
// fade the imagery in by altitude (alt = distance from the globe's surface, in Earth radii)
export function satShow(id: string | null, alt: number) {
  for (const [k, list] of patches) for (const p of list) {
    const on = k === id;
    const fade = !on ? 0 : p.z <= 9 ? 1 - smooth(0.08, 0.2, alt) : p.z <= 12 ? 1 - smooth(0.015, 0.04, alt) : 1 - smooth(0.004, 0.012, alt);
    (p.mesh.material as THREE.ShaderMaterial).uniforms.uFade.value = fade;
    p.mesh.visible = fade > 0.001;
  }
  glint.value = 1 - smooth(0.0004, 0.003, alt);
  deep.value = 1 - smooth(0.003, 0.012, alt);
}
function smooth(a: number, b: number, x: number) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/* ---------------- the flight ---------------- */
export interface FlightState { done: boolean; phase: 'home' | 'cruise' | 'descent' | 'plunge'; alt: number; s: number }
// Returns a function that places the globe camera for time t (seconds since the start).
export function makeFlight(home: Home, site: { lat: number; lon: number }, from: THREE.Vector3) {
  const A = ll2v(home.lat, home.lon), B = ll2v(site.lat, site.lon);
  const om = Math.acos(Math.min(1, A.dot(B)));
  const slerp = (s: number, out: THREE.Vector3) => {
    if (om < 1e-4) return out.copy(A).lerp(B, s).normalize();
    return out.copy(A).multiplyScalar(Math.sin((1 - s) * om) / Math.sin(om)).addScaledVector(B, Math.sin(s * om) / Math.sin(om));
  };
  const T0 = 2.2, T1 = T0 + Math.min(9, Math.max(4.5, 4 + om * 6)), T2 = T1 + 4, T3 = T2 + 1.6;
  const H = Math.min(1.1, 0.12 + om * 1.1);
  const logI = (a: number, b: number, e: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * e);
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const p = new THREE.Vector3(), q = new THREE.Vector3(), look = new THREE.Vector3(), up = new THREE.Vector3(), start = from.clone();
  const tangent = (s: number) => { slerp(Math.min(1, s + 0.01), q); slerp(Math.max(0, s - 0.01), p); return q.sub(p).normalize(); };
  const st: FlightState = { done: false, phase: 'home', alt: 0, s: 0 };
  return {
    total: T3, st,
    at(t: number) {
      let dist: number;
      if (t < T0) {
        // swoop down to hang above home
        const e = ease(Math.min(1, t / T0));
        p.copy(start).normalize().lerp(A, e).normalize();
        dist = logI(start.length(), 1.12, e);
        gcam.position.copy(p).multiplyScalar(dist);
        look.set(0, 0, 0); up.set(0, 1, 0);
        st.phase = 'home'; st.s = 0;
      } else if (t < T1) {
        // along the great circle, climbing and coming back down
        const s = ease((t - T0) / (T1 - T0));
        slerp(s, p);
        dist = 1.12 + H * Math.sin(Math.PI * s);
        gcam.position.copy(p).multiplyScalar(dist);
        slerp(Math.min(1, s + 0.12 + 0.2 * Math.sin(Math.PI * s)), look);             // gaze ahead along the way
        look.multiplyScalar(0.55 + 0.45 * Math.sin(Math.PI * s) * 0.5);
        up.copy(p);
        st.phase = 'cruise'; st.s = s;
      } else if (t < T3) {
        // down onto the reef, then the last few hundred metres to the water
        const k = t < T2 ? ease((t - T1) / (T2 - T1)) : 1;
        const k2 = t < T2 ? 0 : Math.min(1, (t - T2) / (T3 - T2));
        dist = t < T2 ? 1 + logI(0.12, 0.0012, k) : 1 + logI(0.0012, 0.00002, k2 * k2);
        gcam.position.copy(B).multiplyScalar(dist);
        look.copy(B).multiplyScalar(1 - Math.min(0.3, dist - 1) * (1 - k));
        up.copy(tangent(1));
        st.phase = t < T2 ? 'descent' : 'plunge'; st.s = 1;
      } else { dist = 1.00002; st.done = true; }
      st.alt = dist - 1;
      gcam.near = Math.max(0.000004, st.alt * 0.25); gcam.far = dist + 2; gcam.updateProjectionMatrix();
      gcam.up.copy(up); gcam.lookAt(look);
      earthMat.uniforms.uCam.value.copy(gcam.position);
      return st;
    },
  };
}
export function resetGlobeCamera() { gcam.near = 0.05; gcam.far = 200; gcam.up.set(0, 1, 0); gcam.updateProjectionMatrix(); }
