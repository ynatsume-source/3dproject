// Post-processing for the underwater view:
//  1. the scene renders into a half-float target with a depth texture;
//  2. volumetric light: each pixel marches its view ray through the water and gathers sunlight that
//     the wavy surface focuses into shafts (projected along the refracted sun), fading with depth and
//     distance and brightest looking toward the sun;
//  3. bloom from a dual-Kawase mip chain;
//  4. composite: exposure, ACES filmic tone mapping, slight chromatic fringing, vignette and grain.
import * as THREE from 'three';
import { U } from './common';
import type { TierSettings } from '../quality';

const VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const NOISE = /* glsl */ `
float h12(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y); }
`;

function rt(w: number, h: number, depth = false) {
  const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: THREE.HalfFloatType, depthBuffer: depth, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
  if (depth) { t.depthTexture = new THREE.DepthTexture(Math.max(1, w), Math.max(1, h)); t.depthTexture.type = THREE.UnsignedIntType; }
  return t;
}

export class Post {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private main = rt(1, 1, true);
  private vol = rt(1, 1);
  private mips: THREE.WebGLRenderTarget[] = [];
  private w = 1; private h = 1;
  private frame = 0;
  private tier: TierSettings;

  private volMat = new THREE.ShaderMaterial({
    vertexShader: VS,
    defines: { STEPS: 16 },
    uniforms: {
      tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: U.uCamPos, uSunDir: U.uSunDir, uSunI: U.uSunI, uTime: U.uTime, uFogDen: U.uFogDen, uTint: U.uTint, uAbs: U.uAbs,
      uFrame: { value: 0 }, uStrength: { value: 0.4 },
    },
    fragmentShader: /* glsl */ `
      uniform sampler2D tDepth; uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos;
      uniform vec3 uSunDir; uniform float uSunI; uniform float uTime; uniform float uFogDen; uniform vec3 uTint; uniform vec3 uAbs;
      uniform float uFrame; uniform float uStrength;
      varying vec2 vUv;
      ${NOISE}
      // sunlight focused by the moving surface: soft streaks that drift with the waves
      float beams(vec2 q){
        float a = vn(q * 0.16 + vec2(uTime * 0.045, uTime * 0.02));
        float b = vn(q * 0.43 - vec2(uTime * 0.03, -uTime * 0.05));
        float s = a * 0.65 + b * 0.35;
        return pow(smoothstep(0.42, 0.95, s), 2.2) * 2.6;
      }
      void main(){
        float d = texture2D(tDepth, vUv).r;
        vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vp /= vp.w;
        vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
        vec3 ray = wp - uCamPos; float len = length(ray); vec3 dir = ray / len;
        float dist = min(d >= 0.9999 ? 60.0 : len, 60.0);
        float jit = h12(gl_FragCoord.xy + uFrame * 7.13);
        vec3 acc = vec3(0.0);
        float stepLen = dist / float(STEPS);
        for (int i = 0; i < STEPS; i++) {
          float t = (float(i) + jit) * stepLen;
          vec3 p = uCamPos + dir * t;
          if (p.y > -0.05) continue;
          vec2 q = p.xz - uSunDir.xz / max(uSunDir.y, 0.25) * p.y;
          float light = beams(q) + 0.12;
          vec3 down = exp(uAbs * p.y * 1.4);                 // sunlight loses red first on the way down
          vec3 back = exp(-uFogDen * vec3(1.35, 1.0, 0.8) * t); // and again on the way to the eye
          acc += light * down * back * stepLen;
        }
        float mu = dot(dir, uSunDir);
        float g = 0.72;
        float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.08;
        vec3 col = acc * phase * uSunI * uTint * vec3(0.55, 0.9, 0.95) * uStrength;
        gl_FragColor = vec4(col, 1.0);
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
      tScene: { value: null }, tVol: { value: null }, tBloom: { value: null },
      uBloom: { value: 0.12 }, uUseVol: { value: 1 }, uUseBloom: { value: 1 }, uExposure: { value: 1.4 },
      uTime: U.uTime, uAspect: { value: 1 }, uNight: U.uNight, uWB: { value: new THREE.Vector3(1, 1, 1) },
    },
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene; uniform sampler2D tVol; uniform sampler2D tBloom;
      uniform float uBloom; uniform float uUseVol; uniform float uUseBloom; uniform float uExposure; uniform float uTime; uniform float uAspect; uniform float uNight; uniform vec3 uWB;
      varying vec2 vUv;
      ${NOISE}
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      vec3 lin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
      void main(){
        vec2 c = vUv - 0.5;
        float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
        // a little colour fringing toward the frame edge, as through a dome port
        vec2 ca = c * r2 * 0.004;
        vec3 col = vec3(lin(texture2D(tScene, vUv + ca).rgb).r, lin(texture2D(tScene, vUv).rgb).g, lin(texture2D(tScene, vUv - ca).rgb).b);
        if (uUseVol > 0.5) col += texture2D(tVol, vUv).rgb;
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
    if (t.vol) { this.volMat.defines.STEPS = t.vol; this.volMat.needsUpdate = true; }
    this.setSize(this.w, this.h);
  }

  setSize(w: number, h: number) {
    this.w = w; this.h = h;
    this.main.setSize(w, h);
    this.main.depthTexture!.image.width = w; this.main.depthTexture!.image.height = h;
    const vs = this.tier.volScale;
    this.vol.setSize(Math.ceil(w * vs), Math.ceil(h * vs));
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
  whiteBalance(depth: number, abs: THREE.Vector3, night: number) {
    const path = Math.max(depth, 0) + 3;
    const g = Math.exp(-abs.y * path);
    const wb = this.compMat.uniforms.uWB.value as THREE.Vector3;
    const k = 0.5 * (1 - night * 0.8);
    wb.set(1 + (Math.min(3, g / Math.exp(-abs.x * path)) - 1) * k, 1, 1 + (Math.min(3, g / Math.exp(-abs.z * path)) - 1) * k);
  }

  render(r: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.frame++;
    r.setRenderTarget(this.main);
    r.clear();
    r.render(scene, camera);
    const t = this.tier;
    if (t.vol) {
      const u = this.volMat.uniforms;
      u.tDepth.value = this.main.depthTexture;
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uCamWorld.value.copy(camera.matrixWorld);
      u.uFrame.value = this.frame % 64;
      this.pass(r, this.volMat, this.vol);
    }
    if (t.bloom) {
      const d = this.downMat.uniforms, up = this.upMat.uniforms;
      let src: THREE.Texture = this.main.texture;
      this.mips.forEach((m, i) => {
        d.tSrc.value = src; d.uFirst.value = i === 0 ? 1 : 0; d.tVol.value = this.vol.texture;
        d.uTexel.value.set(1 / (i === 0 ? this.w : this.mips[i - 1].width), 1 / (i === 0 ? this.h : this.mips[i - 1].height));
        this.pass(r, this.downMat, m);
        src = m.texture;
      });
      for (let i = this.mips.length - 1; i > 0; i--) {
        up.tSrc.value = this.mips[i].texture; up.uTexel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
        this.pass(r, this.upMat, this.mips[i - 1], false);
      }
    }
    const c = this.compMat.uniforms;
    c.tScene.value = this.main.texture;
    c.tVol.value = this.vol.texture; c.uUseVol.value = t.vol ? 1 : 0;
    c.tBloom.value = this.mips[0]?.texture ?? null; c.uUseBloom.value = t.bloom ? 1 : 0;
    this.pass(r, this.compMat, null);
  }
}
