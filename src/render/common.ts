// Shared uniforms and the GLSL lighting model every underwater material uses.
import * as THREE from 'three';
import milkyUrl from '../milkyway.jpg';   // the Milky Way on the celestial sphere (RA/Dec): NASA SVS Deep Star Maps 2020, from Gaia DR2

// Materials here are hand-written ShaderMaterials authored in display space; keep three from
// converting colours or output so the look matches the prototype.
THREE.ColorManagement.enabled = false;

const milkyTex = typeof document !== 'undefined' ? new THREE.TextureLoader().load(milkyUrl) : new THREE.Texture();   // (headless checks have no DOM)
milkyTex.wrapS = THREE.RepeatWrapping;
// (the cave's light volume is kept as its z-slices laid out side by side in one flat texture: some
// Windows GPUs reset when a shader samples both flat and 3D textures)
const EMPTY_CAVE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); EMPTY_CAVE.needsUpdate = true;

export const U = {
  uTime: { value: 0 },
  uCamPos: { value: new THREE.Vector3() },
  uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
  uUp: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uDown: { value: new THREE.Color() },
  uFogDen: { value: 0.025 }, uLamp: { value: 0 }, uLampPos: { value: new THREE.Vector3() }, uLampDir: { value: new THREE.Vector3(0, 0, -1) },   // (the lamp is on the drone: where the camera is, or ahead of it when the view follows the drone)
  uSpot: { value: new THREE.Vector4(0, 0, 0, 0) }, uFire: { value: new THREE.Vector4(0, -100, 0, 0) }, uCut: { value: new THREE.Vector4(0, 0, 0, 0) },
  // the residents' own lights after dark: where each pool of light falls (xyz, strength), its size, its colour
  uLights: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -100, 0, 0)) }, uLightR: { value: new THREE.Vector4(2.5, 2.5, 2.5, 2.5) }, uLightC: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(1, 1, 1)) },
  uAbs: { value: new THREE.Vector3(0.1, 0.04, 0.03) },
  uSand: { value: new THREE.Color() }, uRock: { value: new THREE.Color() },
  // sky, driven by the clock
  uSunDir: { value: new THREE.Vector3(0.3162, 0.9035, 0.2891) },
  uSunI: { value: 1 }, uAmb: { value: 1 }, uNight: { value: 0 },
  uTint: { value: new THREE.Color(1, 1, 1) },
  uShaftCol: { value: new THREE.Color(0.55, 0.9, 0.95) }, uShaftI: { value: 1 }, uGolden: { value: 0 },
  // the real weather at the site: wave state, rain on the surface, lightning
  uWave: { value: 1 }, uRain: { value: 0 }, uFlash: { value: 0 }, uCloud: { value: 0 },
  uSkyLo: { value: new THREE.Color(0.62, 0.86, 0.92) }, uSkyHi: { value: new THREE.Color(0.86, 0.96, 1.0) },
  uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonI: { value: 0 },
  // above the water: the real sky over the site
  uAirSun: { value: new THREE.Vector3(0, 1, 0) }, uAirMoon: { value: new THREE.Vector3(0, -1, 0) }, uMoonIllum: { value: 0 },
  uStarM: { value: new THREE.Matrix3() }, uMilky: { value: milkyTex }, uAurora: { value: 0 },
  uBolt: { value: new THREE.Vector4(0, 0, -1, 0) },
  uSeaWorld: { value: 260 },   // how far the modelled seabed reaches (beyond it, seen from the air, the reef drops into the blue)
  uVolOff: { value: 0 },   // 1 when the volumetric light pass is off (light tier): fogIt stands in for its glow
  uSwell: { value: 0.4 },
  uBoil: { value: new THREE.Vector4(0, 0, 1, 0) },   // a bait ball churning the surface: x, z, radius, strength  // amplitude scale of the swell (m); significant wave height ≈ 2.4×   // direction of the last lightning strike, and its seed
  uCurrent: { value: new THREE.Vector2(0.9, 0.35) },
  uLodR: { value: 20 },          // detailed coral within this distance
  uSandRot: { value: 0 },        // ripple crests run across the tidal current
  // the sea cave's light volume (see ocean/cave.ts); off in seas without one
  uCaveTex: { value: EMPTY_CAVE }, uCaveAtlas: { value: new THREE.Vector2(1, 1) }, uCaveOn: { value: 0 }, uCamCave: { value: 1 },
  uCaveXf: { value: new THREE.Vector4(0, 0, 1, 0) }, uCaveMin: { value: new THREE.Vector3() }, uCaveExt: { value: new THREE.Vector3(1, 1, 1) }, uCaveN: { value: new THREE.Vector3(1, 1, 1) },
};

// Light reaching a point inside the cave volume: x = sun, y = open sky. vec2(1) outside it.
export const CAVE_GLSL = /* glsl */ `
uniform sampler2D uCaveTex; uniform vec2 uCaveAtlas; uniform float uCaveOn; uniform float uCamCave;
uniform vec4 uCaveXf; uniform vec3 uCaveMin; uniform vec3 uCaveExt; uniform vec3 uCaveN;
vec2 caveLight(vec3 wp){
  #ifdef NO_CAVE_LIGHT
  return vec2(1.0);
  #endif
  if (uCaveOn < 0.5) return vec2(1.0);
  vec2 d = wp.xz - uCaveXf.xy;
  vec3 f = (vec3(d.x * uCaveXf.z + d.y * uCaveXf.w, wp.y, -d.x * uCaveXf.w + d.y * uCaveXf.z) - uCaveMin) / uCaveExt;
  if (min(f.x, min(f.y, f.z)) < 0.0 || max(f.x, max(f.y, f.z)) > 1.0) return vec2(1.0);
  // two neighbouring z-slices from the atlas, blended (explicit level: this is called from loops and branches)
  vec3 v = f * (uCaveN - 1.0);
  float k0 = floor(v.z), k1 = min(k0 + 1.0, uCaveN.z - 1.0), t = v.z - k0;
  vec2 size = uCaveAtlas * uCaveN.xy;
  vec2 a = (vec2(mod(k0, uCaveAtlas.x) * uCaveN.x, floor(k0 / uCaveAtlas.x) * uCaveN.y) + v.xy + 0.5) / size;
  vec2 b = (vec2(mod(k1, uCaveAtlas.x) * uCaveN.x, floor(k1 / uCaveAtlas.x) * uCaveN.y) + v.xy + 0.5) / size;
  return mix(textureLod(uCaveTex, a, 0.0).rg, textureLod(uCaveTex, b, 0.0).rg, t);
}
`;

export const COMMON = /* glsl */ `
uniform float uTime; uniform vec3 uCamPos; uniform vec3 uCamFwd;
uniform vec3 uUp; uniform vec3 uHor; uniform vec3 uDown; uniform float uFogDen; uniform float uLamp; uniform vec3 uLampPos; uniform vec3 uLampDir; uniform vec4 uSpot; uniform vec4 uFire; uniform vec4 uCut; uniform vec4 uLights[4]; uniform vec4 uLightR; uniform vec3 uLightC[4]; uniform vec3 uAbs;
uniform vec3 uSunDir; uniform float uSunI; uniform float uAmb; uniform float uNight; uniform vec3 uTint;
uniform vec3 uShaftCol; uniform float uShaftI; uniform float uGolden;
uniform float uWave; uniform float uRain; uniform float uFlash; uniform float uCloud;
uniform vec3 uSkyLo; uniform vec3 uSkyHi; uniform vec3 uMoonDir; uniform float uMoonI; uniform vec2 uCurrent; uniform float uLodR;
uniform float uSeaWorld; uniform float uVolOff; uniform float uSwell; uniform vec4 uBoil; uniform vec3 uAirSun; uniform vec3 uAirMoon; uniform float uMoonIllum; uniform mat3 uStarM; uniform sampler2D uMilky; uniform float uAurora; uniform vec4 uBolt;
#define SUN uSunDir
${CAVE_GLSL}
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
  return (caustic(xz * 0.075, uTime * 0.45) * 0.65 + caustic(xz * 0.13 + vec2(3.1, 1.7), uTime * 0.35) * 0.45) * uSunI * smoothstep(0.55, 0.9, SUN.y) * caveLight(wp).x;
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
  c *= mix(vec3(1.0), uTint, 0.6 - 0.35 * uGolden);   // at golden hour the water stays blue; the warmth is in the direct light
  c = mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))) * vec3(0.62, 0.9, 1.05), uNight * 0.55);   // moonlit water: silvery teal, not royal blue
  return c * mix(0.32, 1.0, exp(min(uCamPos.y, 0.0) * 0.035)) * uAmb;
}
vec3 absorb(vec3 col, float y){ return col * exp(-max(-y, 0.0) * uAbs); }
// a soft, gently edged pool of light on the ground ahead of each resident that carries one (after dark)
vec3 residentLights(vec3 wp, vec3 n){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 d = wp - uLights[i].xyz; float r = uLightR[i];
    float pool = exp(-dot(d.xz, d.xz) / (r * r)) * (1.0 - smoothstep(1.5, 4.5, abs(d.y)));
    acc += uLightC[i] * uLights[i].w * pool * (0.45 + 0.55 * max(n.y, 0.0));
  }
  return acc;
}
vec3 lamp(vec3 alb, vec3 wp, vec3 n){
  vec3 L = wp - uLampPos; float d = length(L); vec3 dir = L / max(d, 1e-3);
  float cone = smoothstep(0.80, 0.96, dot(dir, uLampDir));
  // (and while watching a resident after dark: a soft pool of light the drone casts down around it)
  vec3 sd = wp - uSpot.xyz; float pool = exp(-dot(sd.xz, sd.xz) * 0.014) * (1.0 - smoothstep(4.0, 14.0, abs(sd.y)));
  return alb * vec3(1.0, 0.93, 0.8) * uLamp * cone * max(dot(n, -dir), 0.0) * 5.0 / (1.0 + d * d * 0.07)
       + alb * vec3(0.92, 0.95, 1.0) * uSpot.w * pool * (0.35 + 0.65 * max(n.y, 0.0))
       // (and the island's evening fire, warm on everything near it)
       + alb * vec3(1.0, 0.52, 0.22) * uFire.w * (0.3 + 0.7 * max(dot(n, normalize(uFire.xyz - wp)), 0.0)) / (1.0 + dot(wp - uFire.xyz, wp - uFire.xyz) * 0.3)
       + alb * residentLights(wp, n);
}
// Water between the eye and a surface: each colour is extinguished at its own rate (red first, blue
// carries furthest), and the lost light is replaced by the colour of the water in that direction.
// The glow of the water itself in a direction: brighter toward the sun and overhead, where daylight
// scatters forward into the view. Shared by distant objects and the open-water backdrop so they meet.
vec3 hazeCol(vec3 dir){
  float mu = max(dot(dir, SUN), 0.0);
  vec3 h = waterCol(dir) * (1.0 + (0.28 * pow(mu, 5.0) + 0.1 * max(dir.y, 0.0)) * uSunI) * (1.0 + uFlash * 2.0);
  // without the volumetric pass (light tier), its glow still has to be there: sunlight scattered forward
  // out of the water toward the eye, strongest toward the sun and at golden hour, when it carries the colour
  if (uVolOff > 0.5 && uCamPos.y < 0.0) {
    float m2 = dot(dir, SUN), hg = (1.0 - 0.5184) / pow(1.5184 - 1.44 * m2, 1.5);
    h += uShaftCol * uShaftI * (hg + 0.6) * (0.05 + 0.2 * uGolden) * exp(uAbs * uCamPos.y * 0.6) * uCamCave;
  }
  return h;
}

// ---------- above the water ----------
#define SEA_WORLD uSeaWorld
float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
// sunlight after the air it has crossed: white overhead, orange to red at the horizon, gone below it
vec3 sunAirCol(){ float y = uAirSun.y; return mix(vec3(1.0, 0.36, 0.1), vec3(1.0, 0.96, 0.9), smoothstep(-0.02, 0.3, y)) * smoothstep(-0.06, 0.01, y); }
float dayAir(){ return smoothstep(-0.12, 0.12, uAirSun.y); }
// cumulus over the sea; thicker and greyer with today's cloud cover
float cloudAt(vec3 d){
  if (d.y <= 0.0) return 0.0;
  vec2 p = d.xz / (d.y + 0.06) * 0.9 + vec2(uTime * 0.004, uTime * 0.0017);
  float n = fbm2(p * 1.3) + 0.35 * fbm2(p * 4.1 + 3.1) - 0.2;
  float cov = mix(0.26, 1.02, uCloud);
  return smoothstep(1.0 - cov, 1.2 - cov, n) * smoothstep(0.0, 0.07, d.y);
}
vec3 skyAir(vec3 d, float disks){
  float sy = uAirSun.y, day = dayAir(), h = max(d.y, 0.0);
  float twi = smoothstep(-0.28, -0.02, sy) * (1.0 - smoothstep(0.02, 0.35, sy));   // dawn and dusk
  vec3 zen = mix(vec3(0.006, 0.011, 0.028), vec3(0.13, 0.33, 0.7), day);
  vec3 hor = mix(vec3(0.018, 0.028, 0.06), vec3(0.66, 0.8, 0.93), day);
  zen = mix(zen, vec3(0.14, 0.18, 0.36), twi * 0.6);
  float mu = dot(d, uAirSun), sideS = pow(max(mu, 0.0) * 0.5 + 0.5, 4.0);
  hor = mix(hor, vec3(1.0, 0.5, 0.25), twi * (0.35 + 0.65 * sideS));
  vec3 c = mix(hor, zen, pow(h, 0.42));
  c += vec3(1.0, 0.42, 0.28) * twi * sideS * exp(-h * 9.0) * 0.6;                       // the glow over where the sun sets
  c += vec3(0.045, 0.075, 0.15) * uMoonI * (1.0 - day) * (1.3 - h);                      // moonlit sky
  vec3 sc = sunAirCol();
  c += sc * pow(max(mu, 0.0), 14.0) * 0.35 * day;                                        // bright haze round the sun
  if (disks < 0.0) return c * mix(1.0, 0.6, uCloud) * (1.0 + uFlash * 0.35);               // cheap: just the light of the sky
  float cloudy = 1.0 - 0.75 * uCloud;
  // the Milky Way and a faint airglow, only in real darkness and away from the moon
  float dark = (1.0 - smoothstep(-0.3, -0.12, sy)) * (1.0 - 0.75 * uMoonI) * cloudy;
  if (dark > 0.0) {
    vec3 q = transpose(uStarM) * d;
    // the map runs east to the left with RA 0h in the middle, as the sky is seen from inside
    vec2 uv = vec2(fract(0.5 - atan(q.y, q.x) / 6.28318), 0.5 + asin(clamp(q.z, -1.0, 1.0)) / 3.14159);
    vec3 mw = pow(textureLod(uMilky, uv, 0.0).rgb, vec3(1.5));   // no mip lookup: atan jumps at RA 0h
    c += mw * 0.22 * dark * smoothstep(-0.02, 0.2, d.y);   // dimmed low down by the thicker air
    c += vec3(0.02, 0.03, 0.02) * dark * exp(-h * 5.0) * 0.5;
  }
  // aurora: curtains toward the magnetic pole, green below and red-violet at the top
  if (uAurora > 0.0) {
    vec2 p = d.xz / (d.y + 0.12);
    float band = exp(-pow((p.y + 1.6 + 0.5 * sin(p.x * 0.7 + uTime * 0.05) + 0.25 * sin(p.x * 1.9 - uTime * 0.09)) * 1.4, 2.0));
    float az = atan(d.x, -d.z);                                   // rays hang straight down the curtain
    float rays = 0.45 + 0.55 * smoothstep(0.3, 0.9, fbm2(vec2(az * 26.0, uTime * 0.12)) + 0.25 * sin(az * 90.0 + uTime * 0.3));
    float hgt = smoothstep(0.02, 0.1, d.y) * (1.0 - smoothstep(0.25, 0.7, d.y));
    vec3 ac = mix(vec3(0.15, 1.0, 0.45), vec3(0.6, 0.3, 0.65), smoothstep(0.2, 0.55, d.y) * 0.7);
    c += ac * band * (0.35 + 0.65 * rays) * hgt * uAurora * 0.5 * (1.0 - day) * cloudy;
  }
  if (disks > 0.5) {
    // sun, a touch larger than life, with limb darkening
    float sa = acos(clamp(mu, -1.0, 1.0));
    c += sc * smoothstep(0.0075, 0.0062, sa) * (0.75 + 0.25 * sqrt(max(1.0 - pow(sa / 0.0075, 2.0), 0.0))) * 30.0;
    // moon: lit on the side facing the sun, with its seas
    vec3 w = uAirMoon, mu1 = normalize(cross(w, abs(w.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), mv1 = cross(mu1, w);
    vec2 mp = vec2(dot(d, mu1), dot(d, mv1)) / 0.0085;
    float mr = dot(mp, mp);
    if (mr < 1.0 && dot(d, w) > 0.0) {
      vec3 n = mu1 * mp.x + mv1 * mp.y - w * sqrt(1.0 - mr);
      float lit = smoothstep(-0.05, 0.12, dot(n, uAirSun));
      float mare = 0.72 + 0.28 * smoothstep(0.35, 0.6, vn2(mp * 2.3 + 5.0) * 0.6 + vn2(mp * 5.0) * 0.4);
      vec3 mc = vec3(1.0, 0.97, 0.9) * mare * (lit * 2.4 + 0.035) * smoothstep(1.0, 0.9, mr);
      c = mix(c, c * 0.3 + mc, smoothstep(1.0, 0.92, mr) * smoothstep(-0.02, 0.02, w.y));
    }
    c += vec3(0.55, 0.62, 0.78) * pow(max(dot(d, w), 0.0), 900.0) * 0.5 * uMoonIllum * (1.0 - day) * smoothstep(-0.02, 0.02, w.y);
  }
  // clouds: lit by the sun (warm at dusk), by the moon at night, lightning from inside
  float cl = cloudAt(d);
  if (cl > 0.0) {
    float thick = 0.55 + 0.45 * fbm2(d.xz / (d.y + 0.06) * 2.7);
    vec3 lit = sc * (0.55 + 0.6 * pow(max(mu, 0.0), 3.0)) * mix(1.0, 0.45, uCloud) + hor * 0.45;
    // at night: silver where the moon lights them (brightest toward it), dark shapes against the stars without it
    vec3 night = vec3(0.025, 0.03, 0.045) + vec3(0.1, 0.11, 0.13) * uMoonI * (0.6 + 0.8 * pow(max(dot(d, uAirMoon), 0.0), 4.0));
    vec3 cc = mix(night, lit, smoothstep(-0.15, 0.1, sy)) * mix(1.0, 0.55, thick * uCloud);
    cc += vec3(0.8, 0.85, 1.0) * uFlash * 0.6 * exp(-pow(acos(clamp(dot(d, uBolt.xyz), -1.0, 1.0)) / 0.45, 2.0));
    c = mix(c, cc, cl * 0.95);
  }
  // a lightning bolt from the cloud base to the sea
  if (uFlash > 0.3 && disks > 0.5) {
    vec3 bd = normalize(vec3(uBolt.x, 0.0, uBolt.z)), bs = vec3(-bd.z, 0.0, bd.x);
    float el = d.y, az = dot(normalize(vec3(d.x, 0.0, d.z)), bs);
    if (el > 0.0 && el < 0.14 && dot(d, bd) > 0.0) {
      float x = 0.012 * sin(el * 90.0 + uBolt.w) + 0.006 * sin(el * 260.0 + uBolt.w * 3.0) + 0.003 * sin(el * 700.0);
      c += vec3(0.85, 0.9, 1.0) * smoothstep(0.003, 0.0, abs(az - x)) * uFlash * 10.0;
    }
  }
  c *= 1.0 + uFlash * 0.35;
  return c;
}
// Seen from the air: water between the surface and something below it (the view ray bends steeply
// down at the surface), then air between the surface and the eye.
vec3 fogAir(vec3 col, vec3 wp){
  vec3 v = wp - uCamPos; float d = length(v); vec3 dir = v / max(d, 1e-3);
  if (wp.y < 0.0) {
    float ca = max(-dir.y, 0.02), sa = sqrt(1.0 - ca * ca), sw = sa / 1.333, cw = sqrt(1.0 - sw * sw);
    float edge = max(abs(wp.x), abs(wp.z));
    float dw = -wp.y / cw + smoothstep(SEA_WORLD * 0.45, SEA_WORLD * 0.9, edge) * 160.0;   // past the modelled seabed, the reef drops into the blue
    dw += d * 0.08;   // the moving surface scrambles what lies far off below it
    vec3 dirW = normalize(vec3(dir.x * sw / max(sa, 1e-4), -cw, dir.z * sw / max(sa, 1e-4)));
    vec3 T = exp(-uFogDen * vec3(1.4, 1.0, 0.78) * dw);
    col = col * T + hazeCol(dirW) * vec3(0.4, 0.5, 0.62) * (1.0 - T);   // light scattered back up out of the deep: dark ultramarine
  }
  return col;
}
vec3 fogWater(vec3 col, vec3 wp){
  vec3 v = wp - uCamPos; float d = length(v); vec3 dir = v / max(d, 1e-3);
  float den = uFogDen * mix(1.0, 1.15, uNight);
  vec3 T = exp(-den * vec3(1.4, 1.0, 0.78) * d);
  vec3 h = hazeCol(dir);
  if (uCaveOn > 0.5) h *= mix(0.1, 1.0, mix(uCamCave, caveLight(wp).y, 0.5));   // water inside the cave is dark
  col = col * T + h * (1.0 - T);
  // a light milky veil that settles in over the first dozen metres and then holds, so shapes soften
  // with distance without the view closing in
  return mix(col, h, 0.11 * (1.0 - exp(-d * 0.09)));
}
// Seen from the water or from the air. Both are worked out and one is kept, rather than returning early
// from a branch: Direct3D (Windows) on some GPUs cannot compile an early return here in a shader that
// also reads textures, and the GPU resets.
vec3 fogIt(vec3 col, vec3 wp){
  return mix(fogWater(col, wp), fogAir(col, wp), step(0.0, uCamPos.y));
}
// light reaching a surface with normal n; cl = caveLight() where the surface is (sun, sky)
vec3 lightAt(vec3 n, vec2 cl){ return mix(vec3(1.0), uTint, 1.0 - 0.6 * uGolden) * uAmb * 0.42 * mix(0.16, 1.0, sqrt(cl.y)) * (1.0 + uFlash * 3.0) + uTint * uSunI * 0.8 * max(dot(n, SUN), 0.0) * cl.x; }
vec3 lightAt(vec3 n){ return lightAt(n, vec2(1.0)); }
vec3 shade(vec3 alb, vec3 wp, vec3 n, float causAmt){
  vec3 col = absorb(alb * lightAt(n, caveLight(wp + n * 0.25)) * 1.6, wp.y);
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
