// The view at the waterline, half in the sea and half in the air, as a camera riding the surface sees it.
// Near the surface the scene is drawn twice — as seen from the water, and as seen from the air — and the
// two are put together pixel by pixel: each pixel's ray, a hand's breadth out from the lens (where a
// housing's dome would be), is either under the swell there or above it. The line between them moves
// with the waves, a little wavier for the small chop the swell model leaves out; along it the water
// clings to the dome: a thin dark meniscus with a bright rim of light just under it, the image bending a
// little where the curve of the water lenses it.
import * as THREE from 'three';
import { mat, U } from './common';
import { SWELL } from '../ocean/air';

export class SplitView {
  air = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  water = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private m = mat(
    `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    SWELL + `uniform sampler2D tA; uniform sampler2D tW; uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uEye; varying vec2 vUv;
     float surfH(vec2 p){
       return swell(p, uTime, 0.0).x
         + 0.016 * sin(dot(p, vec2(6.1, 2.3)) - uTime * 2.7) + 0.011 * sin(dot(p, vec2(-3.7, 8.9)) + uTime * 3.6)
         + 0.006 * sin(dot(p, vec2(13.0, -9.0)) - uTime * 5.3);
     }
     void main(){
       vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0); v /= v.w;
       vec3 dir = normalize((uCamWorld * vec4(v.xyz, 0.0)).xyz);
       vec3 p = uEye + dir * 0.3;
       float s = p.y - surfH(p.xz);                       // above the water (+) or under it (-), at the dome
       float edge = 1.0 - smoothstep(0.0, 0.02, abs(s));
       vec2 off = vec2(0.0, edge * edge * 0.012 * sign(s));    // (the meniscus lenses the image beside it)
       vec3 a = texture2D(tA, vUv + off).rgb, w = texture2D(tW, vUv - off * 1.4).rgb;
       vec3 col = mix(w, a, smoothstep(-0.0025, 0.0025, s));
       col *= 1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.0045, abs(s - 0.0012)));               // the waterline itself
       col += vec3(0.85, 1.0, 1.0) * 0.35 * (1.0 - smoothstep(0.0, 0.0035, abs(s + 0.006))) * clamp(uAmb + uSunI * 0.3, 0.1, 1.0);   // light caught in its curve
       // just above it, the dome still wet: a faint film that runs and beads
       float wet = (1.0 - smoothstep(0.0, 0.05, s)) * step(0.0, s);
       col = mix(col, col * vec3(0.92, 0.98, 1.0) + 0.03, wet * 0.5);
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { tA: { value: null }, tW: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uEye: { value: new THREE.Vector3() } }, opts: { depthTest: false, depthWrite: false } });
  constructor() { const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.m); q.frustumCulled = false; this.scene.add(q); }
  setSize(w: number, h: number) { if (this.air.width !== w || this.air.height !== h) { this.air.setSize(w, h); this.water.setSize(w, h); } }
  compose(r: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    const u = this.m.uniforms;
    u.tA.value = this.air.texture; u.tW.value = this.water.texture;
    u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld); u.uEye.value.copy(camera.position);
    r.setRenderTarget(null); r.render(this.scene, this.cam);
  }
}
// how near the surface the camera must be for it (m): the dome is a hand's breadth out, the swell can be a metre
export const SPLIT_BAND = 0.5;
