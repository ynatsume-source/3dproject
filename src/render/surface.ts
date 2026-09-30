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
  const t = typeof document === 'undefined' ? new THREE.Texture() : loader.load(url);   // headless scripts have no images
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
uniform vec3 uSand; uniform vec3 uRock; uniform float uSandRot;
// distance to the nearest jittered feature point (for raised polyp dots)
float cellF1(vec2 p){
  vec2 i = floor(p), f = fract(p); float d1 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)); vec2 o = vec2(hash2(i + g), hash2(i + g + 17.3));
    vec2 r = g + o - f; d1 = min(d1, dot(r, r));
  }
  return sqrt(d1);
}
// bump a normal by a procedural height field using screen-space derivatives (no tangents needed)
vec3 bumpN(vec3 n, vec3 pos, float h){
  vec3 dpdx = dFdx(pos), dpdy = dFdy(pos);
  float dhdx = dFdx(h), dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - grad);
}
// triplanar colour and normal (UDN blend), skipping projections that barely contribute. The texture
// lookups sit inside branches, where GPUs cannot take their own derivatives for mip selection, so the
// screen-space gradients of p (px, py, taken outside any branch) are passed in explicitly — otherwise
// the textures sparkle and crawl as the camera moves.
// (A macro rather than a function taking the textures as arguments: Direct3D's shader compiler, which
// Windows browsers translate to, crashed on samplers passed into functions — and took the GPU with it.)
#define triSample(TC, TN, P_, PX_, PY_, W_, S_, BUMP_, COL_, DN_, AMT_) { vec3 tp_ = (P_), tx_ = (PX_), ty_ = (PY_), tw_ = (W_); float ts_ = (S_), tb_ = (BUMP_), ta_ = (AMT_); if (tw_.x > 0.03) { vec2 uv = tp_.zy * ts_, gx = tx_.zy * ts_, gy = ty_.zy * ts_; COL_ += textureGrad(TC, uv, gx, gy).rgb * tw_.x * ta_; vec2 t = (textureGrad(TN, uv, gx, gy).xy * 2.0 - 1.0) * tb_; DN_ += vec3(0.0, t.y, t.x) * tw_.x * ta_; } if (tw_.y > 0.03) { vec2 uv = tp_.xz * ts_, gx = tx_.xz * ts_, gy = ty_.xz * ts_; COL_ += textureGrad(TC, uv, gx, gy).rgb * tw_.y * ta_; vec2 t = (textureGrad(TN, uv, gx, gy).xy * 2.0 - 1.0) * tb_; DN_ += vec3(t.x, 0.0, t.y) * tw_.y * ta_; } if (tw_.z > 0.03) { vec2 uv = tp_.xy * ts_, gx = tx_.xy * ts_, gy = ty_.xy * ts_; COL_ += textureGrad(TC, uv, gx, gy).rgb * tw_.z * ta_; vec2 t = (textureGrad(TN, uv, gx, gy).xy * 2.0 - 1.0) * tb_; DN_ += vec3(t.x, t.y, 0.0) * tw_.z * ta_; } }
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
  vec3 px = dFdx(p), py = dFdy(p);
  float nz = vn2(p.xz * 0.3), nz2 = vn2(p.xz * 1.1 + 5.0);
  float rockM = smoothstep(0.32, 0.62, reef + (nz - 0.5) * 0.35 + (1.0 - n.y) * 0.45);
  float rubM = (1.0 - rockM) * smoothstep(0.06, 0.3, reef + (nz2 - 0.5) * 0.3);
  float sandM = max(0.0, 1.0 - rockM - rubM);
  vec3 col = vec3(0.0), dn = vec3(0.0);
  if (sandM > 0.01) {
    // turn the ripple field to face the current, wavering a little from place to place
    float ra = uSandRot + (vn2(p.xz * 0.04) - 0.5) * 0.5;
    mat2 rm = mat2(cos(ra), sin(ra), -sin(ra), cos(ra));
    vec2 rq = rm * p.xz, rx = rm * px.xz, ry = rm * py.xz;
    vec3 c = vec3(0.0), dn0 = vec3(0.0);
    triSample(tSandC, tSandN, vec3(rq.x, p.y, rq.y), vec3(rx.x, px.y, rx.y), vec3(ry.x, py.y, ry.y), w, 0.3, 0.8, c, dn0, sandM);
    dn += vec3(dot(dn0.xz, vec2(cos(ra), -sin(ra))), dn0.y, dot(dn0.xz, vec2(sin(ra), cos(ra))));
    col += c * uSand * 1.4;
  }
  #ifndef PROBE_SAND_ONLY
  if (rubM > 0.01) { vec3 c = vec3(0.0); triSample(tRubC, tRubN, p, px, py, w, 0.42, 1.0, c, dn, rubM); col += c * mix(vec3(1.0), uRock * 2.0, 0.5) * 1.1; }
  if (rockM > 0.01) { vec3 c = vec3(0.0); triSample(tRockC, tRockN, p, px, py, w, 0.55, 1.2, c, dn, rockM);
    vec3 c2 = c, dn2 = vec3(0.0);
    #ifndef PROBE_NO_ROCK2
    c2 = vec3(0.0); triSample(tRockC, tRockN, p * 0.23 + 7.0, px * 0.23, py * 0.23, w, 0.55, 0.6, c2, dn2, rockM);   // a second, larger scale breaks the repeat
    #endif
    dn += dn2 * 0.6;
    col += overgrow(mix(c, c2, 0.35) * uRock * 2.3, p, n); }
  #endif
  col *= 0.82 + 0.36 * vn2(p.xz * 0.07 + 11.0);                  // broad variation across the seabed
  nOut = normalize(n + dn);
  return col;
}
`;
