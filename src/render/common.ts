// Shared uniforms and the GLSL lighting model every underwater material uses.
import * as THREE from 'three';

// Materials here are hand-written ShaderMaterials authored in display space; keep three from
// converting colours or output so the look matches the prototype.
THREE.ColorManagement.enabled = false;

export const U = {
  uTime: { value: 0 },
  uCamPos: { value: new THREE.Vector3() },
  uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
  uUp: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uDown: { value: new THREE.Color() },
  uFogDen: { value: 0.025 }, uLamp: { value: 0 },
  uAbs: { value: new THREE.Vector3(0.1, 0.04, 0.03) },
  uSand: { value: new THREE.Color() }, uRock: { value: new THREE.Color() },
  // sky, driven by the clock
  uSunDir: { value: new THREE.Vector3(0.3162, 0.9035, 0.2891) },
  uSunI: { value: 1 }, uAmb: { value: 1 }, uNight: { value: 0 },
  uTint: { value: new THREE.Color(1, 1, 1) },
  uSkyLo: { value: new THREE.Color(0.62, 0.86, 0.92) }, uSkyHi: { value: new THREE.Color(0.86, 0.96, 1.0) },
  uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonI: { value: 0 },
  uCurrent: { value: new THREE.Vector2(0.9, 0.35) },
  uLodR: { value: 20 },          // detailed coral within this distance
  uSandRot: { value: 0 },        // ripple crests run across the tidal current
};

export const COMMON = /* glsl */ `
uniform float uTime; uniform vec3 uCamPos; uniform vec3 uCamFwd;
uniform vec3 uUp; uniform vec3 uHor; uniform vec3 uDown; uniform float uFogDen; uniform float uLamp; uniform vec3 uAbs;
uniform vec3 uSunDir; uniform float uSunI; uniform float uAmb; uniform float uNight; uniform vec3 uTint;
uniform vec3 uSkyLo; uniform vec3 uSkyHi; uniform vec3 uMoonDir; uniform float uMoonI; uniform vec2 uCurrent; uniform float uLodR;
#define SUN uSunDir
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float caustic(vec2 uv, float t){
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0; c = 1.17 - pow(c, 1.4);
  return min(pow(abs(c), 8.0), 2.0);
}
// caustics are projected along the (refracted) sun direction and fade as the sun gets low
float caus2(vec3 wp){
  vec2 xz = wp.xz - SUN.xz / max(SUN.y, 0.3) * wp.y;
  return (caustic(xz * 0.075, uTime * 0.45) * 0.65 + caustic(xz * 0.13 + vec2(3.1, 1.7), uTime * 0.35) * 0.45) * uSunI * smoothstep(0.55, 0.9, SUN.y);
}
float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y); }
float vor(vec2 p){
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)); vec2 o = vec2(hash2(i + g), hash2(i + g + 17.3));
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}
vec3 waterCol(vec3 dir){
  vec3 c = dir.y > 0.0 ? mix(uHor, uUp, pow(dir.y, 0.7)) : mix(uHor, uDown, pow(-dir.y, 0.55));
  c *= mix(vec3(1.0), uTint, 0.6);
  return c * mix(0.32, 1.0, exp(min(uCamPos.y, 0.0) * 0.035)) * uAmb;
}
vec3 absorb(vec3 col, float y){ return col * exp(-max(-y, 0.0) * uAbs); }
vec3 lamp(vec3 alb, vec3 wp, vec3 n){
  vec3 L = wp - uCamPos; float d = length(L); vec3 dir = L / max(d, 1e-3);
  float cone = smoothstep(0.80, 0.96, dot(dir, uCamFwd));
  return alb * vec3(1.0, 0.93, 0.8) * uLamp * cone * max(dot(n, -dir), 0.0) * 5.0 / (1.0 + d * d * 0.07);
}
// Water between the eye and a surface: each colour is extinguished at its own rate (red first, blue
// carries furthest), and the lost light is replaced by the colour of the water in that direction.
// The glow of the water itself in a direction: brighter toward the sun and overhead, where daylight
// scatters forward into the view. Shared by distant objects and the open-water backdrop so they meet.
vec3 hazeCol(vec3 dir){
  float mu = max(dot(dir, SUN), 0.0);
  return waterCol(dir) * (1.0 + (0.28 * pow(mu, 5.0) + 0.1 * max(dir.y, 0.0)) * uSunI);
}
vec3 fogIt(vec3 col, vec3 wp){
  vec3 v = wp - uCamPos; float d = length(v); vec3 dir = v / max(d, 1e-3);
  float den = uFogDen * mix(1.0, 1.6, uNight);
  vec3 T = exp(-den * vec3(1.4, 1.0, 0.78) * d);
  vec3 h = hazeCol(dir);
  col = col * T + h * (1.0 - T);
  // a light milky veil that settles in over the first dozen metres and then holds, so shapes soften
  // with distance without the view closing in
  return mix(col, h, 0.11 * (1.0 - exp(-d * 0.09)));
}
// light reaching a surface with normal n: sky ambient + direct sun (both coloured)
vec3 lightAt(vec3 n){ return uTint * (uAmb * 0.42 + uSunI * 0.8 * max(dot(n, SUN), 0.0)); }
vec3 shade(vec3 alb, vec3 wp, vec3 n, float causAmt){
  vec3 col = absorb(alb * lightAt(n) * 1.6, wp.y);
  col += absorb(vec3(0.95, 1.0, 0.95), wp.y) * caus2(wp) * max(n.y, 0.0) * causAmt * alb;
  col += lamp(alb, wp, n);
  return fogIt(col, wp);
}
`;

export const mat = (vs: string, fs: string, extra: { uniforms?: any; defines?: any; opts?: any } = {}) =>
  new THREE.ShaderMaterial(Object.assign({
    uniforms: Object.assign({}, U, extra.uniforms || {}),
    defines: extra.defines || {},
    vertexShader: COMMON + vs,
    fragmentShader: COMMON + fs,
  }, extra.opts || {}));

export const VS_WORLD = /* glsl */ `varying vec3 vWp; varying vec3 vN;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
