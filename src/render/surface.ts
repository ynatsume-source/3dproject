// Photographic reef surfaces. Three CC0 photo-scanned materials from Poly Haven (sand ripples, pitted
// coral limestone, coral rubble) are projected triplanar in world space, blended by reef cover, slope
// and noise, and overgrown with the colours of living reef (coralline algae, turf, sponges).
import * as THREE from 'three';
import sandC from '../assets/tex/sand_col.jpg';
import sandN from '../assets/tex/sand_nrm.jpg';
import rockC from '../assets/tex/reefrock_col.jpg';
import rockN from '../assets/tex/reefrock_nrm.jpg';
import rubC from '../assets/tex/rubble_col.jpg';
import rubN from '../assets/tex/rubble_nrm.jpg';

const loader = new THREE.TextureLoader();
function tex(url: string) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
export const SURF_UNIFORMS = {
  tSandC: { value: tex(sandC) }, tSandN: { value: tex(sandN) },
  tRockC: { value: tex(rockC) }, tRockN: { value: tex(rockN) },
  tRubC: { value: tex(rubC) }, tRubN: { value: tex(rubN) },
};
export function setAnisotropy(n: number) { for (const k in SURF_UNIFORMS) (SURF_UNIFORMS as any)[k].value.anisotropy = n; }

export const SURFACE = /* glsl */ `
uniform sampler2D tSandC; uniform sampler2D tSandN; uniform sampler2D tRockC; uniform sampler2D tRockN; uniform sampler2D tRubC; uniform sampler2D tRubN;
uniform vec3 uSand; uniform vec3 uRock;
// triplanar colour and normal (UDN blend), skipping projections that barely contribute
void triSample(sampler2D tc, sampler2D tn, vec3 p, vec3 w, float s, float bump, inout vec3 col, inout vec3 dn, float amt){
  if (w.x > 0.03) { vec2 uv = p.zy * s; col += texture2D(tc, uv).rgb * w.x * amt; vec2 t = (texture2D(tn, uv).xy * 2.0 - 1.0) * bump; dn += vec3(0.0, t.y, t.x) * w.x * amt; }
  if (w.y > 0.03) { vec2 uv = p.xz * s; col += texture2D(tc, uv).rgb * w.y * amt; vec2 t = (texture2D(tn, uv).xy * 2.0 - 1.0) * bump; dn += vec3(t.x, 0.0, t.y) * w.y * amt; }
  if (w.z > 0.03) { vec2 uv = p.xy * s; col += texture2D(tc, uv).rgb * w.z * amt; vec2 t = (texture2D(tn, uv).xy * 2.0 - 1.0) * bump; dn += vec3(t.x, t.y, 0.0) * w.z * amt; }
}
// living cover on reef rock: coralline pinks, turf and sponge colours in patches
vec3 overgrow(vec3 base, vec3 p, vec3 n){
  vec2 q = p.xz + vec2(p.y * 0.7, -p.y * 0.5);
  float a = smoothstep(0.55, 0.78, vn2(q * 0.55 + 3.0));
  float b = smoothstep(0.6, 0.8, vn2(q * 0.9 + 21.0));
  float c = smoothstep(0.7, 0.86, vn2(q * 1.4 - 11.0));
  float d = smoothstep(0.72, 0.9, vn2(q * 0.4 + 40.0));
  vec3 col = base;
  col = mix(col, col * vec3(1.35, 0.9, 1.25), a * 0.6);          // coralline algae
  col = mix(col, col * vec3(0.95, 1.2, 0.7), b * 0.55 * smoothstep(0.2, 0.8, n.y));   // turf on tops
  col = mix(col, col * vec3(1.5, 1.05, 0.7), c * 0.45);          // orange sponge
  col = mix(col, col * vec3(0.8, 0.95, 1.3), d * 0.35);          // blue-grey encrusting coral
  return col;
}
// the seabed and reef rock at world point p with geometric normal n.
// reef: 0 = open sand .. 1 = solid reef. Returns albedo (display space); writes the bumped normal.
vec3 reefSurface(vec3 p, vec3 n, float reef, out vec3 nOut){
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  float nz = vn2(p.xz * 0.3), nz2 = vn2(p.xz * 1.1 + 5.0);
  float rockM = smoothstep(0.32, 0.62, reef + (nz - 0.5) * 0.35 + (1.0 - n.y) * 0.45);
  float rubM = (1.0 - rockM) * smoothstep(0.06, 0.3, reef + (nz2 - 0.5) * 0.3);
  float sandM = max(0.0, 1.0 - rockM - rubM);
  vec3 col = vec3(0.0), dn = vec3(0.0);
  if (sandM > 0.01) { vec3 c = vec3(0.0); triSample(tSandC, tSandN, p, w, 0.3, 0.8, c, dn, sandM); col += c * uSand * 1.4; }
  if (rubM > 0.01) { vec3 c = vec3(0.0); triSample(tRubC, tRubN, p, w, 0.42, 1.0, c, dn, rubM); col += c * mix(vec3(1.0), uRock * 2.0, 0.5) * 1.1; }
  if (rockM > 0.01) { vec3 c = vec3(0.0); triSample(tRockC, tRockN, p, w, 0.55, 1.2, c, dn, rockM);
    vec3 c2 = vec3(0.0), dn2 = vec3(0.0); triSample(tRockC, tRockN, p * 0.23 + 7.0, w, 0.55, 0.6, c2, dn2, rockM);   // a second, larger scale breaks the repeat
    dn += dn2 * 0.6;
    col += overgrow(mix(c, c2, 0.35) * uRock * 2.3, p, n); }
  col *= 0.82 + 0.36 * vn2(p.xz * 0.07 + 11.0);                  // broad variation across the seabed
  nOut = normalize(n + dn);
  return col;
}
`;
