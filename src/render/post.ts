// Post-processing for the underwater view:
//  1. the scene renders into a half-float target with a depth texture;
//  2. volumetric light: each pixel marches its view ray through the water and gathers sunlight that
//     the wavy surface focuses into shafts (projected along the refracted sun), fading with depth and
//     distance and brightest looking toward the sun;
//  3. bloom from a dual-Kawase mip chain;
//  4. composite: exposure, ACES filmic tone mapping, slight chromatic fringing, vignette and grain.
import * as THREE from 'three';
import { U, CAVE_GLSL } from './common';
import type { TierSettings } from '../quality';

const VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const NOISE = /* glsl */ `
float h12(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y); }
`;

// half-float targets where the GPU can render into them (nearly all); 8-bit ones otherwise, which clip
// highlights but still draw
let RT_TYPE: THREE.TextureDataType = THREE.HalfFloatType;
export function setRTSupport(half: boolean) { RT_TYPE = half ? THREE.HalfFloatType : THREE.UnsignedByteType; }
function rt(w: number, h: number, depth = false) {
  const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: RT_TYPE, depthBuffer: depth, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
  if (depth) { t.depthTexture = new THREE.DepthTexture(Math.max(1, w), Math.max(1, h)); t.depthTexture.type = THREE.UnsignedIntType; }
  return t;
}

export class Post {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private main = rt(1, 1, true);
  private vol = rt(1, 1);
  private volHist = [rt(1, 1), rt(1, 1)];   // the shafts averaged over recent frames
  private histIdx = 0;
  private ao = rt(1, 1);
  private aoSmooth = rt(1, 1);
  // seen from the air: a copy of everything under the surface (colour, and distance in km in alpha) for the
  // sea surface to refract
  private refr = rt(1, 1);
  private copyMat = new THREE.ShaderMaterial({
    vertexShader: VS,
    uniforms: { tScene: { value: null }, tDepth: { value: null }, uNear: { value: 0.08 }, uFar: { value: 460 } },
    fragmentShader: /* glsl */ `uniform sampler2D tScene; uniform sampler2D tDepth; uniform float uNear; uniform float uFar; varying vec2 vUv;
      void main(){ float d = texture2D(tDepth, vUv).r; float z = uNear * uFar / (uFar - d * (uFar - uNear)); gl_FragColor = vec4(texture2D(tScene, vUv).rgb, z * 0.001); }`,
  });
  private prevQ = new THREE.Quaternion(); private prevP = new THREE.Vector3(); private hasPrev = false;

  // blend this frame's shafts into the running average; less so while the camera turns or moves
  private blendMat = new THREE.ShaderMaterial({
    vertexShader: VS,
    uniforms: { tCur: { value: null }, tHist: { value: null }, uK: { value: 0 } },
    fragmentShader: `uniform sampler2D tCur; uniform sampler2D tHist; uniform float uK; varying vec2 vUv;
      void main(){ gl_FragColor = vec4(mix(texture2D(tCur, vUv).rgb, texture2D(tHist, vUv).rgb, uK), 1.0); }`,
  });
  // 4x4 depth-aware box blur of the AO: exactly cancels the 4x4 rotation pattern of its samples
  private aoBlurMat = new THREE.ShaderMaterial({
    vertexShader: VS,
    uniforms: { tAO: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uNear: { value: 0.08 }, uFar: { value: 460 } },
    fragmentShader: `uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 uTexel; uniform float uNear; uniform float uFar; varying vec2 vUv;
      float lin(float d){ return uNear * uFar / (uFar - d * (uFar - uNear)); }
      void main(){
        float z0 = lin(texture2D(tDepth, vUv).r), acc = 0.0, wsum = 0.0;
        for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
          vec2 uv = vUv + (vec2(float(x), float(y)) - 1.5) * uTexel;
          float w = exp(-abs(lin(texture2D(tDepth, uv).r) - z0) / (0.04 * z0 + 0.05));
          acc += texture2D(tAO, uv).r * w; wsum += w;
        }
        gl_FragColor = vec4(acc / max(wsum, 1e-4));
      }`,
  });
  private mips: THREE.WebGLRenderTarget[] = [];
  private w = 1; private h = 1;
  private frame = 0;
  private tier: TierSettings;

  private volMat = new THREE.ShaderMaterial({
    vertexShader: VS,
    defines: { STEPS: 16 },
    uniforms: {
      tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: U.uCamPos, uSunDir: U.uSunDir, uSunI: U.uSunI, uTime: U.uTime, uFogDen: U.uFogDen, uTint: U.uTint, uAbs: U.uAbs, uShaftCol: U.uShaftCol, uShaftI: U.uShaftI, uGolden: U.uGolden,
      uCaveTex: U.uCaveTex, uCaveAtlas: U.uCaveAtlas, uCaveOn: U.uCaveOn, uCamCave: U.uCamCave, uCaveXf: U.uCaveXf, uCaveMin: U.uCaveMin, uCaveExt: U.uCaveExt, uCaveN: U.uCaveN,
      uFrame: { value: 0 }, uStrength: { value: 0.72 },
    },
    fragmentShader: /* glsl */ `
      uniform sampler2D tDepth; uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos;
      uniform vec3 uSunDir; uniform float uSunI; uniform float uTime; uniform float uFogDen; uniform vec3 uTint; uniform vec3 uAbs;
      uniform vec3 uShaftCol; uniform float uShaftI; uniform float uGolden;
      uniform float uFrame; uniform float uStrength;
      varying vec2 vUv;
      ${NOISE}
      ${CAVE_GLSL}
      // sunlight focused by the moving surface: soft streaks that drift with the waves
      // lod: 1 near the eye, falling to 0 where one march step spans the streaks; there the pattern is
      // replaced by its average instead of being point-sampled into sparkling noise
      float beams(vec2 q, float lod){
        float a = vn(q * 0.11 + vec2(uTime * 0.035, uTime * 0.015));
        float b = mix(0.5, vn(q * 0.43 - vec2(uTime * 0.03, -uTime * 0.05)), smoothstep(0.35, 0.9, lod));
        float s = a * 0.65 + b * 0.35;
        float sharp = pow(smoothstep(mix(0.42, 0.56, uGolden), 0.95, s), 2.2 + uGolden) * 2.6;
        return mix(0.24 * (1.0 - 0.4 * uGolden), sharp, lod);
      }
      void main(){
        float d = texture2D(tDepth, vUv).r;
        vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vp /= vp.w;
        vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
        vec3 ray = wp - uCamPos; float len = length(ray); vec3 dir = ray / len;
        float dist = min(d >= 0.9999 ? 95.0 : len, 95.0);
        float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uFrame * 0.618034);   // interleaved gradient noise: even, and it averages out over frames
        vec3 acc = vec3(0.0);
        // steps packed near the eye and stretched with distance, so far-off shafts still show
        for (int i = 0; i < STEPS; i++) {
          float s0 = (float(i) + jit) / float(STEPS), s1 = (float(i) + 1.0 + jit) / float(STEPS);
          float t = dist * pow(s0, 1.6);
          float stepLen = dist * (pow(s1, 1.6) - pow(s0, 1.6));
          vec3 p = uCamPos + dir * t;
          float wet = step(p.y, -0.05);   // (above the surface: nothing; masked rather than skipped, for Direct3D)
          vec2 q = p.xz - uSunDir.xz / max(uSunDir.y, 0.25) * p.y;
          float light = beams(q, 1.0 - smoothstep(2.5, 11.0, stepLen)) * (1.0 + uGolden * 2.4) + 0.1 * (1.0 - 0.92 * uGolden);   // at sunset only the shafts carry colour
          vec3 down = exp(uAbs * p.y * mix(1.4, 0.55, uGolden)); // sunlight loses red first on the way down (less so for the art of a sunset)
          vec3 back = exp(-uFogDen * vec3(1.35, 1.0, 0.8) * t); // and again on the way to the eye
          acc += light * down * back * stepLen * caveLight(p).x * wet;   // rock shadows the water behind it; skylights let beams through
        }
        float mu = dot(dir, uSunDir);
        float g = 0.72;
        float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.08;
        vec3 col = acc * phase * uShaftI * uShaftCol * uStrength;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  // Ambient occlusion from the depth buffer: for each pixel, how much nearby geometry rises above its
  // surface within ~0.7 m. Brings back the contact shadows where coral meets rock and in crevices.
  private aoMat = new THREE.ShaderMaterial({
    vertexShader: VS,
    defines: { SAMPLES: 12 },
    uniforms: { tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uF: { value: 1 }, uAspect: { value: 1 }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.7 } },
    fragmentShader: /* glsl */ `
      uniform sampler2D tDepth; uniform mat4 uInvProj; uniform float uF; uniform float uAspect; uniform vec2 uTexel; uniform float uRadius;
      varying vec2 vUv;
      ${NOISE}
      vec3 viewPos(vec2 uv){ float d = texture2D(tDepth, uv).r; vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
      void main(){
        float d = texture2D(tDepth, vUv).r;
        if (d >= 0.9999) { gl_FragColor = vec4(1.0); return; }
        vec3 P = viewPos(vUv);
        vec3 N = normalize(cross(viewPos(vUv + vec2(uTexel.x, 0.0)) - P, viewPos(vUv + vec2(0.0, uTexel.y)) - P));
        if (dot(N, -P) < 0.0) N = -N;
        float rUv = uRadius * uF * 0.5 / max(-P.z, 0.1);
        vec2 cq = mod(floor(gl_FragCoord.xy), 4.0);
        float ang = (mod(cq.x * 5.0 + cq.y * 3.0 * 4.0, 16.0) + 0.5) / 16.0 * 6.2831;   // a 4x4 tile of rotations, removed by the blur
        float occ = 0.0;
        for (int i = 0; i < SAMPLES; i++) {
          float t = (float(i) + 0.5) / float(SAMPLES);
          float a = ang + float(i) * 2.39996;
          vec2 off = vec2(cos(a) / uAspect, sin(a)) * sqrt(t) * rUv;
          vec3 v = viewPos(vUv + off) - P;
          float dist = length(v);
          occ += max(0.0, dot(N, v) / (dist + 1e-3) - 0.1) * (1.0 - smoothstep(uRadius * 0.7, uRadius * 1.8, dist));
        }
        float ao = clamp(1.0 - occ / float(SAMPLES) * 1.9, 0.0, 1.0);
        ao = mix(1.0, ao, 1.0 - smoothstep(10.0, 28.0, -P.z));   // far away the water veil takes over
        gl_FragColor = vec4(ao);
      }`,
  });

  // bloom: bright-pass on the way down, tent-filtered on the way up
  private downMat = new THREE.ShaderMaterial({
    vertexShader: VS,
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 }, tVol: { value: null } },
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc; uniform sampler2D tVol; uniform vec2 uTexel; uniform float uFirst; varying vec2 vUv;
      vec3 src(vec2 uv){
        vec3 c = texture2D(tSrc, uv).rgb;
        if (uFirst > 0.5) { c = pow(max(c, 0.0), vec3(2.2)) + texture2D(tVol, uv).rgb; c = max(c - 1.1, 0.0); }
        return c;
      }
      void main(){
        vec2 o = uTexel * 0.5;
        vec3 c = src(vUv) * 4.0 + src(vUv + vec2(-o.x, -o.y)) + src(vUv + vec2(o.x, -o.y)) + src(vUv + vec2(-o.x, o.y)) + src(vUv + vec2(o.x, o.y));
        gl_FragColor = vec4(c / 8.0, 1.0);
      }`,
  });
  private upMat = new THREE.ShaderMaterial({
    vertexShader: VS,
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
    blending: THREE.AdditiveBlending, transparent: true, depthTest: false,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main(){
        vec2 o = uTexel;
        vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb
               + texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb
               + (texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb
               + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb) * 2.0;
        gl_FragColor = vec4(c / 12.0, 1.0);
      }`,
  });

  private compMat = new THREE.ShaderMaterial({
    vertexShader: VS,
    uniforms: {
      uAirK: { value: 0 },
      tScene: { value: null }, tVol: { value: null }, tBloom: { value: null }, tAO: { value: null }, uUseAO: { value: 0 }, uAOTexel: { value: new THREE.Vector2() }, uVolTexel: { value: new THREE.Vector2() },
      uBloom: { value: 0.12 }, uUseVol: { value: 1 }, uUseBloom: { value: 1 }, uExposure: { value: 1.4 },
      uTime: U.uTime, uAspect: { value: 1 }, uNight: U.uNight, uWB: { value: new THREE.Vector3(1, 1, 1) },
    },
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene; uniform sampler2D tVol; uniform sampler2D tBloom; uniform sampler2D tAO; uniform float uUseAO; uniform vec2 uAOTexel; uniform vec2 uVolTexel;
      uniform float uAirK; uniform float uBloom; uniform float uUseVol; uniform float uUseBloom; uniform float uExposure; uniform float uTime; uniform float uAspect; uniform float uNight; uniform vec3 uWB;
      varying vec2 vUv;
      ${NOISE}
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      vec3 lin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
      void main(){
        vec2 c = vUv - 0.5;
        float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
        // a little colour fringing toward the frame edge, as through a dome port
        vec2 ca = c * r2 * 0.004 * (1.0 - uAirK);   // no dome port in the air: it would split every star into three
        vec3 col = vec3(lin(texture2D(tScene, vUv + ca).rgb).r, lin(texture2D(tScene, vUv).rgb).g, lin(texture2D(tScene, vUv - ca).rgb).b);
        if (uUseAO > 0.5) {
          vec2 o = uAOTexel;
          float ao = (texture2D(tAO, vUv + vec2(-o.x, -o.y)).r + texture2D(tAO, vUv + vec2(o.x, -o.y)).r + texture2D(tAO, vUv + vec2(-o.x, o.y)).r + texture2D(tAO, vUv + vec2(o.x, o.y)).r) * 0.25;
          col *= ao;
        }
        if (uUseVol > 0.5) {   // a small tent blur hides the per-pixel jitter of the low-res march
          vec2 o = uVolTexel;
          col += (texture2D(tVol, vUv).rgb * 2.0 + texture2D(tVol, vUv + vec2(o.x, o.y)).rgb + texture2D(tVol, vUv + vec2(-o.x, o.y)).rgb
                + texture2D(tVol, vUv + vec2(o.x, -o.y)).rgb + texture2D(tVol, vUv + vec2(-o.x, -o.y)).rgb) / 6.0;
        }
        if (uUseBloom > 0.5) col += texture2D(tBloom, vUv).rgb * uBloom;
        col *= uWB * uExposure;
        col = aces(col);
        col = pow(col, vec3(1.0 / 2.2));
        col *= 1.0 - smoothstep(0.18, 0.75, r2) * 0.42;                 // vignette
        col += (h12(vUv * 1000.0 + fract(uTime) * 91.0) - 0.5) * 0.012;  // fine grain, hides banding
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  constructor(tier: TierSettings) {
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.tier = tier;
  }

  setTier(t: TierSettings) {
    this.tier = t;
    if (t.ao) { this.aoMat.defines.SAMPLES = t.ao; this.aoMat.needsUpdate = true; }
    if (t.vol) { this.volMat.defines.STEPS = t.vol; this.volMat.needsUpdate = true; }
    this.setSize(this.w, this.h);
  }

  setSize(w: number, h: number) {
    this.w = w; this.h = h;
    this.main.setSize(w, h);
    this.main.depthTexture!.image.width = w; this.main.depthTexture!.image.height = h;
    const vs = this.tier.volScale;
    this.vol.setSize(Math.ceil(w * vs), Math.ceil(h * vs));
    for (const v of this.volHist) v.setSize(Math.ceil(w * vs), Math.ceil(h * vs));
    this.hasPrev = false;
    this.ao.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
    this.aoSmooth.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
    this.refr.setSize(w, h);
    for (const m of this.mips) m.dispose();
    this.mips = [];
    let mw = w, mh = h;
    for (let i = 0; i < this.tier.bloom; i++) { mw = Math.ceil(mw / 2); mh = Math.ceil(mh / 2); this.mips.push(rt(mw, mh)); }
    this.compMat.uniforms.uAspect.value = w / h;
  }

  private pass(r: THREE.WebGLRenderer, m: THREE.Material, target: THREE.WebGLRenderTarget | null, clear = true) {
    this.quad.material = m;
    r.setRenderTarget(target);
    if (clear) r.clear();
    r.render(this.scene, this.cam);
  }

  // The drone camera white-balances like an underwater camcorder: it restores part of the red and
  // green the water column has absorbed at the current depth, so colours read the way divers see
  // them in footage rather than as a flat blue-green.
  setExposure(e: number) { this.compMat.uniforms.uExposure.value = e; }

  // above the water: no water column to correct for, and no shafts in the air
  private air = false; private volClear = false;
  setAir(on: boolean) { this.air = on; this.compMat.uniforms.uAirK.value = on ? 1 : 0; }

  whiteBalance(depth: number, abs: THREE.Vector3, night: number, air = false) {
    if (air) { (this.compMat.uniforms.uWB.value as THREE.Vector3).set(1, 1, 1); return; }
    const path = Math.max(depth, 0) + 3;
    const g = Math.exp(-abs.y * path);
    const wb = this.compMat.uniforms.uWB.value as THREE.Vector3;
    const k = 0.5 * (1 - night * 0.15);   // at night too: the moonlit reef keeps its colours
    wb.set(1 + (Math.min(3, g / Math.exp(-abs.x * path)) - 1) * k, 1, 1 + (Math.min(3, g / Math.exp(-abs.z * path)) - 1) * k);
  }

  // top: drawn over the scene after it, able to sample what lies beneath it through refrTex(); only in the air
  render(r: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, top: THREE.Scene | null = null, onRefr?: (t: THREE.Texture, w: number, h: number) => void) {
    this.frame++;
    r.setRenderTarget(this.main);
    r.clear();
    r.render(scene, camera);
    if (top) {
      const c = this.copyMat.uniforms;
      c.tScene.value = this.main.texture; c.tDepth.value = this.main.depthTexture; c.uNear.value = camera.near; c.uFar.value = camera.far;
      this.pass(r, this.copyMat, this.refr);
      onRefr?.(this.refr.texture, this.w, this.h);
      r.setRenderTarget(this.main);
      const ac = r.autoClear; r.autoClear = false;
      r.render(top, camera);
      r.autoClear = ac;
    }
    const t = this.tier;
    const vol = t.vol && !this.air;
    if (t.vol && !vol && !this.volClear) {   // leave no stale shafts behind for the bloom to pick up
      for (const h of this.volHist) { r.setRenderTarget(h); r.clear(); }
      this.volClear = true; this.hasPrev = false;
    }
    if (vol) {
      this.volClear = false;
      const u = this.volMat.uniforms;
      u.tDepth.value = this.main.depthTexture;
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uCamWorld.value.copy(camera.matrixWorld);
      u.uFrame.value = this.frame % 64;
      this.pass(r, this.volMat, this.vol);
      // temporal smoothing: how far the view moved since last frame decides how much history to keep
      const turn = this.hasPrev ? this.prevQ.angleTo(camera.quaternion) : 1, move = this.hasPrev ? this.prevP.distanceTo(camera.position) : 1;
      this.prevQ.copy(camera.quaternion); this.prevP.copy(camera.position); this.hasPrev = true;
      const b = this.blendMat.uniforms;
      b.tCur.value = this.vol.texture; b.tHist.value = this.volHist[this.histIdx].texture;
      b.uK.value = 0.82 * (1 - Math.min(1, turn * 30 + move * 2.5));
      this.histIdx = 1 - this.histIdx;
      this.pass(r, this.blendMat, this.volHist[this.histIdx]);
    }
    if (t.bloom) {
      const d = this.downMat.uniforms, up = this.upMat.uniforms;
      let src: THREE.Texture = this.main.texture;
      this.mips.forEach((m, i) => {
        d.tSrc.value = src; d.uFirst.value = i === 0 ? 1 : 0; d.tVol.value = this.volHist[this.histIdx].texture;
        d.uTexel.value.set(1 / (i === 0 ? this.w : this.mips[i - 1].width), 1 / (i === 0 ? this.h : this.mips[i - 1].height));
        this.pass(r, this.downMat, m);
        src = m.texture;
      });
      for (let i = this.mips.length - 1; i > 0; i--) {
        up.tSrc.value = this.mips[i].texture; up.uTexel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
        this.pass(r, this.upMat, this.mips[i - 1], false);
      }
    }
    const ao = t.ao && !this.air;   // with the far plane out at the horizon the depth buffer is too coarse for it
    if (ao) {
      const u = this.aoMat.uniforms;
      u.tDepth.value = this.main.depthTexture;
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uF.value = camera.projectionMatrix.elements[5];
      u.uAspect.value = camera.aspect;
      u.uTexel.value.set(1 / this.w, 1 / this.h);
      this.pass(r, this.aoMat, this.ao);
      const bu = this.aoBlurMat.uniforms;
      bu.tAO.value = this.ao.texture; bu.tDepth.value = this.main.depthTexture; bu.uTexel.value.set(1 / this.ao.width, 1 / this.ao.height);
      bu.uNear.value = camera.near; bu.uFar.value = camera.far;
      this.pass(r, this.aoBlurMat, this.aoSmooth);
    }
    const c = this.compMat.uniforms;
    c.tAO.value = this.aoSmooth.texture; c.uUseAO.value = ao ? 1 : 0; c.uAOTexel.value.set(0.5 / this.ao.width, 0.5 / this.ao.height);
    c.tScene.value = this.main.texture;
    c.tVol.value = this.volHist[this.histIdx].texture; c.uUseVol.value = vol ? 1 : 0; c.uVolTexel.value.set(0.9 / this.vol.width, 0.9 / this.vol.height);
    c.tBloom.value = this.mips[0]?.texture ?? null; c.uUseBloom.value = t.bloom ? 1 : 0;
    this.pass(r, this.compMat, null);
  }
}
