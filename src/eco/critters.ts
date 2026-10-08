// Creatures with bodies of their own, beyond fish: morays in the reef walls, sea snakes hunting over the
// reef and rising to breathe, and jellyfish drifting on the current.
//
// Morays (ウツボ) live in holes in the reef. By day each shows just its head and a little of its body at
// the mouth of its hole, turning slowly to look about and opening and shutting its jaws — which is how a
// moray breathes (it pumps water over its gills), not a threat. At night it reaches much further out, and
// the hunt begins. The rest of the body runs back into the rock, hidden.
// Sea snakes (ウミヘビ) swim with sideways waves of the whole body and a flattened paddle of a tail; they
// hunt small fish and eels by poking into crevices near the bottom, and every few minutes rise straight to
// the surface for a breath and come back down.
// Jellyfish (クラゲ) pulse their bells to keep up in the water but go where the current takes them.
import * as THREE from 'three';
import { mat } from '../render/common';
import { R, rr, clamp, smooth, hyp } from '../core/math';
import { LIMIT } from '../ocean/scenery';
import { zx, zz, outZone } from '../ocean/zone';
import type { Subject } from './env';

export interface CritterSpec {
  id: string; ja: string; sci: string; note: string;
  kind: 'moray' | 'snake' | 'jelly';
  n: number; size: [number, number];
  pat: number;                              // moray: 0 giant, 1 white-mouth, 2 zebra, 3 fine-spotted; snake: 0 banded krait, 1 olive; jelly: 0 moon, 1 mauve stinger
  c1: number[]; c2: number[]; c3?: number[];
  depth?: [number, number];                 // jellies: how deep they drift
}

/* ---------- geometry ---------- */
// a lofted tube along -z from the snout at z = 0, length 1; aS = 0 at the snout .. 1 at the tail tip
function tube(rings: number, rad: number, prof: (s: number) => [number, number, number], s0 = 0) {
  const P: number[] = [], S: number[] = [], A: number[] = [], idx: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const s = s0 + (1 - s0) * Math.pow(r / rings, 1.1), [hh, ww, yc] = prof(s);
    for (let k = 0; k < rad; k++) { const a = (k / rad) * Math.PI * 2; P.push(Math.cos(a) * ww, yc + Math.sin(a) * hh, -s); S.push(s); A.push(a); }
  }
  for (let r = 0; r < rings; r++) for (let k = 0; k < rad; k++) { const a = r * rad + k, b = r * rad + (k + 1) % rad; idx.push(a, a + rad, b, b, a + rad, b + rad); }
  // close the snout
  const tip = P.length / 3; const [, , y0] = prof(s0); P.push(0, y0, -s0 + 0.004); S.push(s0); A.push(0);
  for (let k = 0; k < rad; k++) idx.push(tip, k, (k + 1) % rad);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 1)); g.setAttribute('aA', new THREE.Float32BufferAttribute(A, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// moray: deep, laterally flattened body, a big head with the gape running back past the eye, a long low
// dorsal fin from behind the head to the tail, the tail flattened like a blade
export const MORAY_GEO = (() => {
  // (the snout tapers to a point, narrow and a little down-turned; behind the eyes the head swells with the jaw
  // muscles before the neck)
  const g = tube(90, 20, (s) => {
    const head = Math.pow(smooth(-0.004, 0.11, s), 0.75), tail = 1 - smooth(0.62, 1.0, s);
    const hh = 0.0035 + 0.0405 * head * (0.4 + 0.6 * tail) + 0.005 * Math.exp(-(((s - 0.1) / 0.035) ** 2));
    const ww = hh * (0.5 + 0.28 * smooth(0.0, 0.06, s) * (1 - smooth(0.06, 0.2, s))) * (0.4 + 0.6 * tail);
    return [hh, ww, -0.003 * (1 - smooth(0.0, 0.07, s))];
  });
  // the fins: a ribbon along the back and (from the vent) along the belly
  const P = Array.from(g.attributes.position.array), S = Array.from(g.attributes.aS.array), A = Array.from(g.attributes.aA.array), idx = Array.from(g.index!.array);
  const fin = (s0: number, s1: number, up: number) => {
    const base = P.length / 3, n = 60;
    for (let i = 0; i <= n; i++) {
      const s = s0 + (s1 - s0) * i / n, head = smooth(0.0, 0.07, s), tail = 1 - smooth(0.62, 1.0, s);
      const hh = 0.009 + 0.037 * head * (0.4 + 0.6 * tail);
      const h = 0.012 * smooth(s0, s0 + 0.05, s) * (0.6 + 0.4 * tail);
      P.push(0, up * hh * 0.95, -s, 0, up * (hh + h), -s); S.push(s, s); A.push(up > 0 ? 7 : 8, up > 0 ? 7 : 8);
    }
    for (let i = 0; i < n; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  };
  fin(0.12, 1, 1); fin(0.48, 1, -1);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('aS', new THREE.Float32BufferAttribute(S, 1)); out.setAttribute('aA', new THREE.Float32BufferAttribute(A, 1));
  out.setIndex(idx); out.computeVertexNormals();
  return out;
})();
// sea snake: slim and round, a small head, a vertically flattened paddle of a tail
export const SNAKE_GEO = tube(120, 10, (s) => {
  const head = 0.0085 + 0.004 * smooth(0.0, 0.03, s) - 0.0025 * smooth(0.03, 0.06, s) * (1 - smooth(0.06, 0.12, s));
  const body = 0.011 + 0.006 * Math.sin(Math.PI * clamp((s - 0.05) / 0.85, 0, 1));
  const r = s < 0.1 ? head + (body - head) * smooth(0.04, 0.1, s) : body;
  const pad = smooth(0.85, 0.93, s);
  return [r * (1 + pad * 1.4) * (s > 0.97 ? (1 - s) / 0.03 : 1), r * (1 - pad * 0.65), 0];
});
// jellyfish: a bell (aK 0) with a frill of marginal tentacles (aK 1) and four oral arms (aK 2)
export function jellyGeo(pat: number) {
  const P: number[] = [], K: number[] = [], T: number[] = [], idx: number[] = [];
  const bell = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const bp = bell.attributes.position;
  for (let i = 0; i < bp.count; i++) { P.push(bp.getX(i), bp.getY(i) * (pat === 1 ? 0.75 : 0.45), bp.getZ(i)); K.push(0); T.push(1 - bp.getY(i)); }
  for (const i of bell.index!.array) idx.push(i);
  const strip = (x0: number, z0: number, len: number, w: number, kind: number, n: number, twist: number) => {
    const base = P.length / 3;
    for (let i = 0; i <= n; i++) { const t = i / n, ww = w * (1 - t * 0.7), a = twist * t; P.push(x0 - Math.sin(a) * ww, -t * len, z0 + Math.cos(a) * ww * 0.3, x0 + Math.sin(a) * ww, -t * len, z0 - Math.cos(a) * ww * 0.3); K.push(kind, kind); T.push(t, t); }
    for (let i = 0; i < n; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  };
  const nt = pat === 1 ? 8 : 48, tl = pat === 1 ? 2.6 : 0.3;
  for (let k = 0; k < nt; k++) { const a = (k / nt) * Math.PI * 2; strip(Math.cos(a) * 0.98, Math.sin(a) * 0.98, tl, pat === 1 ? 0.012 : 0.008, 1, pat === 1 ? 24 : 6, 0.5); }
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; strip(Math.cos(a) * 0.15, Math.sin(a) * 0.15, pat === 1 ? 1.8 : 0.7, pat === 1 ? 0.14 : 0.1, 2, 16, 5 + k); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aK', new THREE.Float32BufferAttribute(K, 1)); g.setAttribute('aT', new THREE.Float32BufferAttribute(T, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ---------- materials ---------- */
export function morayMaterial(sp: CritterSpec) {
  const c = (a: number[] | undefined, d: number[]) => new THREE.Color(...((a ?? d) as [number, number, number]));
  return mat(
    `attribute float aS; attribute float aA; attribute vec4 aM; varying vec3 vWp; varying vec3 vN; varying float vS; varying float vA; varying vec3 vL; varying float vSeed;
     // aM: phase, how far out of its hole (fraction of its length), gape rhythm, seed
     void main(){
       vec3 p = position; float s = aS;
       float reach = aM.y, free = clamp(1.0 - s / max(reach, 0.05), 0.0, 1.0);
       // the part out of the hole sways, the head most; the hidden part stays put
       float sw = sin(uTime * 0.45 + aM.x) * 0.9 + sin(uTime * 0.21 + aM.x * 2.0) * 0.6;
       p.x += sw * 0.05 * free * free; p.y += sin(uTime * 0.33 + aM.x * 3.0) * 0.025 * free * free;
       // breathing: the lower jaw drops and closes again, pumping water over the gills
       float gape = 0.08 + 0.32 * pow(max(0.0, sin(uTime * aM.z + aM.x)), 3.0);
       float jaw = step(s, 0.085) * step(position.y, -0.004 + s * 0.08) * step(aA, 6.5);
       if (jaw > 0.5) { float hz = -0.085; vec2 q = vec2(position.z - hz, position.y + 0.004); float cg = cos(gape), sg = sin(gape); p.z = hz + q.x * cg + q.y * sg; p.y = -0.004 - q.x * sg + q.y * cg + (p.y - position.y); }
       vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vS = s; vA = aA; vL = position; vSeed = aM.w;
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    `uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uPat;
     varying vec3 vWp; varying vec3 vN; varying float vS; varying float vA; varying vec3 vL; varying float vSeed;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       vec2 q = vec2(vS * 40.0, vA * 1.2 + vSeed);
       vec3 alb = uC1;
       if (uPat < 0.5) {
         // giant moray: brown-yellow, leopard-spotted with dark blotches that grow finer on the head
         float k = mix(2.2, 1.0, smoothstep(0.03, 0.12, vS));
         vec2 g = q * k; vec2 f = fract(g) - 0.5;
         alb = mix(uC1, uC2, (1.0 - smoothstep(0.18, 0.34, length(f + (hash2(floor(g)) - 0.5) * 0.3))) * 0.9);
         alb = mix(alb, uC2 * 0.7, smoothstep(0.6, 0.8, vn2(q * 0.4)) * 0.5);
       } else if (uPat < 1.5) {
         // white-mouth moray: brown with crowded white spots, the jaws edged pale
         vec2 g = q * 2.4; vec2 f = fract(g) - 0.5;
         alb = mix(uC1, uC2, (1.0 - smoothstep(0.12, 0.22, length(f))) * step(0.25, hash2(floor(g))));
       } else if (uPat < 2.5) {
         // zebra moray: dark chocolate with narrow pale rings
         float ring = abs(fract(vS * 34.0 + 0.2 * sin(vA * 2.0 + vS * 20.0)) - 0.5);
         alb = mix(uC2, uC1, smoothstep(0.08, 0.14, ring));
       } else {
         // fine-spotted moray: grey-brown peppered with fine pale dots
         vec2 g = q * 4.0; vec2 f = fract(g) - 0.5;
         alb = mix(uC1, uC2, (1.0 - smoothstep(0.1, 0.2, length(f))) * step(0.3, hash2(floor(g))));
       }
       if (vA > 6.5) alb = mix(alb, uC3, 0.35);                                              // the fins, a little translucent-looking
       // the eye: small, pale-ringed, set above the corner of the mouth
       float e = length(vec2(vL.z + 0.045, vL.y - 0.016)) + step(abs(vL.x), 0.004);
       alb = mix(alb, vec3(0.85, 0.75, 0.3), 1.0 - smoothstep(0.0055, 0.0075, e));
       alb = mix(alb, vec3(0.02), 1.0 - smoothstep(0.0028, 0.004, e));
       // the gape line, and the gill opening behind the head
       alb *= 1.0 - 0.6 * (1.0 - smoothstep(0.0015, 0.004, abs(vL.y + 0.004 - vS * 0.08))) * step(vS, 0.085) * step(vA, 6.5);
       alb *= 1.0 - 0.4 * (1.0 - smoothstep(0.003, 0.006, length(vec2(vL.z + 0.11, vL.y + 0.012)))) * step(vA, 6.5);
       // inside the mouth (seen when the jaws part): pale for the white-mouth, fleshy for the others
       if (!gl_FrontFacing) alb = uPat > 0.5 && uPat < 1.5 ? vec3(0.9, 0.88, 0.8) : vec3(0.55, 0.3, 0.25);
       vec3 col = shade(alb, vWp, n, 0.5);
       col += absorb(vec3(0.9, 0.95, 1.0), vWp.y) * pow(max(dot(reflect(-SUN, n), V), 0.0), 30.0) * 0.35 * uSunI;   // (slick, mucus-coated skin)
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { uC1: { value: c(sp.c1, [0.5, 0.45, 0.2]) }, uC2: { value: c(sp.c2, [0.1, 0.08, 0.05]) }, uC3: { value: c(sp.c3, [0.5, 0.45, 0.3]) }, uPat: { value: sp.pat } }, opts: { side: THREE.DoubleSide } });
}
export function snakeMaterial(sp: CritterSpec) {
  const c = (a: number[] | undefined, d: number[]) => new THREE.Color(...((a ?? d) as [number, number, number]));
  return mat(
    `attribute float aS; attribute float aA; attribute vec4 aM; varying vec3 vWp; varying vec3 vN; varying float vS; varying float vA; varying float vUp;
     // aM: phase, swimming speed (wave rate), 0, 0
     void main(){
       vec3 p = position; float s = aS;
       // sideways waves travelling down the body, bigger toward the tail
       float amp = 0.035 + 0.05 * s;
       float w = sin(s * 11.0 - uTime * aM.y + aM.x);
       p.x += w * amp;
       vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vS = s; vA = aA; vUp = sin(aA);
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    `uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uPat;
     varying vec3 vWp; varying vec3 vN; varying float vS; varying float vA; varying float vUp;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       vec3 alb;
       if (uPat < 0.5) {
         // banded sea krait: blue-grey with black rings all the way round, a yellow snout and belly
         float ring = abs(fract(vS * 38.0) - 0.5);
         alb = mix(uC2, uC1, smoothstep(0.16, 0.22, ring));
         alb = mix(alb, uC3, smoothstep(-0.2, -0.7, vUp) * 0.6 * smoothstep(0.16, 0.22, ring));
         alb = mix(alb, uC3, (1.0 - smoothstep(0.006, 0.012, vS)) * step(-0.2, vUp));   // (the yellow snout, on top)
       } else {
         // olive sea snake: olive-brown, paler below, a few scattered darker scales
         alb = mix(uC2, uC1, smoothstep(-0.4, 0.3, vUp));
         alb *= 0.9 + 0.2 * hash2(floor(vec2(vS * 300.0, vA * 6.0)));
       }
       alb *= 0.93 + 0.07 * step(0.5, fract(vS * 400.0 + step(0.5, fract(vA * 3.0)) * 0.5));   // (scales)
       // the eyes
       alb = mix(alb, vec3(0.02), (1.0 - smoothstep(0.003, 0.005, abs(vS - 0.012))) * (1.0 - smoothstep(0.35, 0.6, abs(abs(vA - 3.14159) - 1.57))));
       vec3 col = shade(alb, vWp, n, 0.6);
       col += absorb(vec3(0.9, 0.95, 1.0), vWp.y) * pow(max(dot(reflect(-SUN, n), V), 0.0), 40.0) * 0.4 * uSunI;
       gl_FragColor = vec4(col, 1.0);
     }`,
    { uniforms: { uC1: { value: c(sp.c1, [0.5, 0.55, 0.65]) }, uC2: { value: c(sp.c2, [0.04, 0.04, 0.05]) }, uC3: { value: c(sp.c3, [0.95, 0.85, 0.3]) }, uPat: { value: sp.pat } } });
}
export function jellyMaterial(sp: CritterSpec) {
  const c = (a: number[] | undefined, d: number[]) => new THREE.Color(...((a ?? d) as [number, number, number]));
  return mat(
    `attribute float aK; attribute float aT; attribute vec2 aJ; varying vec3 vWp; varying vec3 vN; varying float vK; varying float vT; varying vec3 vL;
     // aJ: phase, pulse rate
     void main(){
       vec3 p = position;
       float ph = uTime * aJ.y + aJ.x, pulse = pow(max(0.0, sin(ph)), 2.0);
       if (aK < 0.5) { float rim = smoothstep(0.2, 1.0, 1.0 - position.y / 0.75); p.xz *= 1.0 - 0.16 * pulse * rim; p.y *= 1.0 + 0.1 * pulse; }
       else {
         // tentacles and arms trail and sway, lagging the bell's beat
         float t = aT;
         p.xz *= 1.0 - 0.14 * pulse;
         p.x += sin(uTime * 0.7 + aJ.x + t * 3.0 + position.z * 4.0) * 0.12 * t * (aK > 1.5 ? 1.0 : 0.6);
         p.z += cos(uTime * 0.6 + aJ.x * 1.3 + t * 2.5 + position.x * 4.0) * 0.12 * t * (aK > 1.5 ? 1.0 : 0.6);
         p.y += 0.08 * t * pulse;
       }
       vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
       vWp = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vK = aK; vT = aT; vL = position;
       gl_Position = projectionMatrix * viewMatrix * wp;
     }`,
    `uniform vec3 uC1; uniform vec3 uC2; uniform float uPat; uniform float uGlowJ;
     varying vec3 vWp; varying vec3 vN; varying float vK; varying float vT; varying vec3 vL;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       float fres = pow(1.0 - abs(dot(n, V)), 2.0);
       vec3 alb = uC1; float a = 0.1 + 0.55 * fres;
       if (vK < 0.5) {
         if (uPat < 0.5) {
           // moon jelly: four horseshoe-shaped gonads seen through the clear bell, and a fine radial canal pattern
           float ang = atan(vL.z, vL.x), r = length(vL.xz);
           float horse = 1.0 - smoothstep(0.035, 0.06, abs(length(vec2(r * cos(mod(ang, 1.5708) - 0.785) - 0.3, r * sin(mod(ang, 1.5708) - 0.785))) - 0.13));
           alb = mix(alb, uC2, horse); a += horse * 0.45 * step(0.3, vL.y);
           a += 0.08 * (1.0 - smoothstep(0.0, 0.03, abs(fract(ang * 2.54) - 0.5) - 0.46));
         } else {
           // mauve stinger: warty, mauve-pink bell
           float wart = 1.0 - smoothstep(0.1, 0.25, length(fract(vec2(atan(vL.z, vL.x) * 3.0, vL.y * 9.0)) - 0.5));
           alb = mix(alb, uC2, wart * 0.8); a += wart * 0.3;
         }
       } else if (vK < 1.5) { alb = mix(uC1, uC2, 0.3); a = 0.35; }
       else { alb = mix(uC1, uC2, 0.6); a = 0.3 + 0.2 * fres; }
       vec3 col = alb * (lightAt(n) * 0.9 + uAmb * 0.25);
       col = absorb(col, vWp.y) + fres * 0.25 * absorb(vec3(0.8, 0.95, 1.0), vWp.y) * uAmb;
       col += uC2 * uGlowJ * uNight * (0.6 + 0.4 * sin(uTime * 2.0 + vL.x * 20.0)) * 0.6;   // (the mauve stinger glows at night)
       col += lamp(alb, vWp, n) * 0.6;
       gl_FragColor = vec4(fogIt(col, vWp), clamp(a, 0.0, 0.85));
     }`,
    { uniforms: { uC1: { value: c(sp.c1, [0.75, 0.82, 0.9]) }, uC2: { value: c(sp.c2, [0.8, 0.55, 0.75]) }, uPat: { value: sp.pat }, uGlowJ: { value: sp.pat === 1 ? 1 : 0 } },
      opts: { side: THREE.DoubleSide, transparent: true, depthWrite: false } });
}

/* ---------- the animals ---------- */
interface Moray { sp: CritterSpec; i: number; pos: THREE.Vector3; dir: THREE.Vector3; nrm: THREE.Vector3; len: number; out: number; outDay: number; head: THREE.Vector3; buried?: boolean }
interface Snake { sp: CritterSpec; i: number; pos: THREE.Vector3; head: number; pitch: number; len: number; state: 'forage' | 'up' | 'breathe' | 'down'; t: number; next: number; placed: boolean; alt: number }
interface Jelly { sp: CritterSpec; i: number; pos: THREE.Vector3; s: number; placed: boolean; bob: number }

export function makeCritters(oc: any) {
  const specs: CritterSpec[] = oc.loc.critters || [];
  if (!specs.length) return null;
  const loc = oc.loc, T = oc.T, group = new THREE.Group();
  const morays: Moray[] = [], snakes: Snake[] = [], jellies: Jelly[] = [];
  const meshes: { mesh: THREE.InstancedMesh; kind: string; list: any[] }[] = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _z = new THREE.Vector3(0, 0, 1), _v = new THREE.Vector3();

  // a moray's hole: a spot on a steep reef face; the body runs level into the rock, the head out into the water.
  // On the face as drawn (T.drawn: the seabed mesh's flat triangles, which on a steep, curved face stand tens of
  // centimetres off the smooth ground loc.f), with no boulder or coral head sitting on it; n: the face's normal there
  const ground = (x: number, z: number) => (T.drawn ? T.drawn(x, z) : loc.f(x, z));
  const _hq = new THREE.Vector3(), _hx = new THREE.Vector3(), _hy = new THREE.Vector3();
  const holeAt = (len: number): { p: THREE.Vector3; d: THREE.Vector3; n: THREE.Vector3 } | null => {
    for (let k = 0; k < 3000; k++) {   // (most of the sea is no steep face: many tries, each cheap until one is)
      const x = rr(-LIMIT, LIMIT), z = rr(-LIMIT, LIMIT), h = ground(x, z);
      if (h > -2.5 || h < -32 || T.slope(x, z) < 1.1 || T.reef(x, z) < 0.25) continue;
      const gx = (ground(x + 0.3, z) - ground(x - 0.3, z)) / 0.6, gz = (ground(x, z + 0.3) - ground(x, z - 0.3)) / 0.6, gl = hyp(gx, gz);
      if (gl < 0.9) continue;   // (steep where it is drawn, too)
      if (T.obst && T.obst.get(x, z) > h + 0.15) continue;   // (a rock or coral head over it)
      const d = new THREE.Vector3(-gx / gl, rr(-0.1, 0.2), -gz / gl).normalize();   // downhill: out of the rock
      const n = new THREE.Vector3(-gx, 1, -gz).normalize();
      const p = new THREE.Vector3(x, h, z);
      // the opening lies flat on the face (a face curving away under it would leave its rim in the water)
      _hx.set(-n.z, 0, n.x).normalize(); _hy.crossVectors(n, _hx);
      const r = len * 0.075, sl = Math.min(1.8, 1 / Math.max(0.35, Math.abs(n.dot(d))));
      let flat = true;
      for (let j = 0; j < 12 && flat; j++) { const a = (j / 12) * Math.PI * 2; _hq.copy(p).addScaledVector(_hx, Math.cos(a) * r).addScaledVector(_hy, Math.sin(a) * r * sl); if (Math.abs(_hq.y - ground(_hq.x, _hq.z)) > 0.025) flat = false; }
      if (!flat) continue;
      // the body runs into the rock behind it, and the head, out by day and further at night, is clear of the rock
      // and any coral head
      let ok = true;
      for (const f of [0.1, 0.3, 0.55]) { _hq.copy(p).addScaledVector(d, -len * f); if (_hq.y > ground(_hq.x, _hq.z) - 0.03) ok = false; }
      for (const f of [0.2, 0.34, 0.47]) { _hq.copy(p).addScaledVector(d, len * f); if (_hq.y < T.top(_hq.x, _hq.z) + 0.08) ok = false; }
      if (!ok) continue;
      return { p, d, n };
    }
    return null;
  };
  for (const sp of specs) {
    const n = sp.n;
    if (sp.kind === 'moray') {
      const list: Moray[] = [];
      for (let i = 0; i < n; i++) {
        const len = rr(sp.size[0], sp.size[1]), hole = holeAt(len); if (!hole) break;
        list.push({ sp, i, pos: hole.p, dir: hole.d, nrm: hole.n, len, out: 0.25, outDay: rr(0.24, 0.34), head: new THREE.Vector3() });
      }
      if (!list.length) continue;
      const g = MORAY_GEO.clone();
      const aM = new Float32Array(list.length * 4); list.forEach((m, i) => aM.set([R() * 100, m.out, rr(0.9, 1.4), R() * 10], i * 4));
      g.setAttribute('aM', new THREE.InstancedBufferAttribute(aM, 4));
      const mesh = new THREE.InstancedMesh(g, morayMaterial(sp), list.length); mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(mesh); meshes.push({ mesh, kind: 'moray', list }); morays.push(...list);
      // the mouth of each hole: a ragged dark opening in the rock around the body
      // (a shadowed opening that fades into the rock round it: dark in the middle, its ragged edge only a darkening)
      const hole = new THREE.CircleGeometry(1.5, 32), hp = hole.attributes.position, hr = new Float32Array(hp.count);
      for (let k = 1; k < hp.count; k++) { const a = Math.atan2(hp.getY(k), hp.getX(k)); const r = 1 + 0.12 * Math.sin(a * 3 + 1.7) + 0.07 * Math.sin(a * 7 + 0.4); hp.setXY(k, hp.getX(k) * r * 1.2, hp.getY(k) * r); hr[k] = 1.5; }
      hole.setAttribute('aR', new THREE.Float32BufferAttribute(hr, 1));
      const holes = new THREE.InstancedMesh(hole, mat(
        `attribute float aR; varying vec3 vWp; varying float vR; void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vWp = w.xyz; vR = aR; gl_Position = projectionMatrix * viewMatrix * w; }`,
        `varying vec3 vWp; varying float vR; void main(){ vec3 col = vec3(0.004, 0.005, 0.006); float a = 1.0 - smoothstep(0.55, 1.45, vR); gl_FragColor = vec4(fogIt(col, vWp), a * 0.92); }`,
        { opts: { side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 } }), list.length);
      // (lying on the face, where the body comes out of it: the opening is the body's slanting cut through the face, longer
      // across the slope's fall the steeper the body meets it)
      const ax = new THREE.Vector3(), ay = new THREE.Vector3(), rot = new THREE.Matrix4();
      list.forEach((m, k) => {
        ax.set(-m.nrm.z, 0, m.nrm.x).normalize(); ay.crossVectors(m.nrm, ax);   // (across the face, and up it)
        _q.setFromRotationMatrix(rot.makeBasis(ax, ay, m.nrm));
        const sl = Math.min(1.8, 1 / Math.max(0.35, Math.abs(m.nrm.dot(m.dir))));
        holes.setMatrixAt(k, _m.compose(m.pos.clone().addScaledVector(m.nrm, 0.012), _q, _s.set(m.len * 0.075, m.len * 0.075 * sl, 1)));
      });
      holes.frustumCulled = false; group.add(holes);
    } else if (sp.kind === 'snake') {
      const list: Snake[] = [];
      for (let i = 0; i < n; i++) list.push({ sp, i, pos: new THREE.Vector3(), head: R() * 6.28, pitch: 0, len: rr(sp.size[0], sp.size[1]), state: 'forage', t: 0, next: rr(60, 200), placed: false, alt: rr(0.3, 1.0) });
      const g = SNAKE_GEO.clone();
      const aM = new Float32Array(list.length * 4); list.forEach((_, i) => aM.set([R() * 100, 4.5, 0, 0], i * 4));
      g.setAttribute('aM', new THREE.InstancedBufferAttribute(aM, 4));
      const mesh = new THREE.InstancedMesh(g, snakeMaterial(sp), list.length); mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(mesh); meshes.push({ mesh, kind: 'snake', list }); snakes.push(...list);
    } else {
      const list: Jelly[] = [];
      for (let i = 0; i < n; i++) list.push({ sp, i, pos: new THREE.Vector3(), s: rr(sp.size[0], sp.size[1]), placed: false, bob: R() * 10 });
      const g = jellyGeo(sp.pat);
      const aJ = new Float32Array(list.length * 2); list.forEach((_, i) => aJ.set([R() * 100, rr(1.4, 2.2)], i * 2));
      g.setAttribute('aJ', new THREE.InstancedBufferAttribute(aJ, 2));
      const mesh = new THREE.InstancedMesh(g, jellyMaterial(sp), list.length); mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.renderOrder = 2;
      group.add(mesh); meshes.push({ mesh, kind: 'jelly', list }); jellies.push(...list);
    }
  }

  // somewhere near the camera, ahead of it (for the ones that come and go)
  const near = (cam: THREE.Vector3, fx: number, fz: number, dmin: number, dmax: number) => {
    const d = rr(dmin, dmax), a = Math.atan2(fz, fx) + rr(-1, 1);
    return [zx(cam.x + Math.cos(a) * d), zz(cam.z + Math.sin(a) * d)];
  };
  return {
    group, morays,   // (morays: for checks)
    update(dt: number, env: any, cam: THREE.Vector3, fx: number, fz: number) {
      const night = env.night, dusk = env.twilight;
      for (const mm of meshes) {
        const aM = mm.kind !== 'jelly' ? (mm.mesh.geometry.attributes.aM as THREE.InstancedBufferAttribute) : null;
        mm.list.forEach((c: any, i: number) => {
          if (mm.kind === 'moray') {
            // out further at night (hunting), tucked in by day; reaching out and pulling back now and then
            const want = c.outDay + (0.45 - c.outDay) * Math.max(night, dusk * 0.5) + 0.04 * Math.sin(env.t * 0.05 + i * 3);
            c.out += (want - c.out) * Math.min(1, dt * 0.2);
            aM!.setY(i, c.out);
            // the head is c.out of its length out of the hole, along its line
            _v.copy(c.dir).multiplyScalar(c.len * c.out);
            c.head.copy(c.pos).add(_v);
            _q.setFromUnitVectors(_z, c.dir);
            _s.setScalar(c.len);
            mm.mesh.setMatrixAt(i, _m.compose(c.head, _q, _s));
            // (its head inside rock or a coral head grown up round the hole since: nothing of it to be seen there)
            c.buried = T.top(c.head.x, c.head.z) > c.head.y + 0.02 || T.top(c.head.x + c.dir.x * 0.3, c.head.z + c.dir.z * 0.3) > c.head.y + 0.1;
          } else if (mm.kind === 'snake') {
            const s: Snake = c;
            if (!s.placed || hyp(s.pos.x - cam.x, s.pos.z - cam.z) > 75) {
              // (somewhere with water enough over the bottom: try a few spots, and if there is none just now,
              // wait out of sight rather than hopping about every frame)
              s.placed = false;
              if ((s.t -= dt) < -1e9 || s.t < 0) for (let k = 0; k < 12; k++) {
                const [x, z] = near(cam, fx, fz, 12, 35);
                if (T.wet(x, z, 2)) { s.pos.set(x, T.top(x, z) + s.alt, z); s.placed = true; s.state = 'forage'; s.t = 0; break; }
              }
              if (!s.placed) { s.t = 3; mm.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); return; }
            }
            s.t += dt;
            const fl = T.top(s.pos.x, s.pos.z);
            let speed = 0.35, ty = fl + s.alt;
            if (s.state === 'forage') {
              // meander along the bottom, nosing into the reef
              s.head += (Math.sin(env.t * 0.3 + i * 2) * 0.6 + Math.sin(env.t * 0.11 + i) * 0.4) * dt + T.shore(s.pos.x, s.pos.z, s.head, 3, 1.4) * Math.min(1, dt * 2);
              if (outZone(s.pos.x, s.pos.z, 0.95)) s.head += dt;
              ty = fl + s.alt + Math.sin(env.t * 0.4 + i) * 0.2;
              if (s.t > s.next) { s.state = 'up'; s.t = 0; }
            } else if (s.state === 'up') { speed = 0.45; ty = -0.25; if (s.pos.y > -0.45) { s.state = 'breathe'; s.t = 0; } }
            else if (s.state === 'breathe') { speed = 0.05; ty = -0.2; if (s.t > 4) { s.state = 'down'; s.t = 0; } }
            else { speed = 0.45; ty = fl + s.alt; if (s.pos.y < fl + s.alt + 0.3) { s.state = 'forage'; s.t = 0; s.next = rr(120, 260); } }
            const vy = clamp((ty - s.pos.y) * 0.8, -0.5, 0.5);
            const vh = s.state === 'up' || s.state === 'down' ? speed * 0.35 : speed;
            s.pos.x += Math.cos(s.head) * vh * dt; s.pos.z += Math.sin(s.head) * vh * dt; s.pos.y += vy * dt;
            s.pos.y = Math.max(s.pos.y, fl + 0.15);
            s.pitch += (Math.atan2(vy, vh) - s.pitch) * Math.min(1, dt * 2);
            _e.set(-s.pitch, Math.PI / 2 - s.head, 0, 'YXZ'); _q.setFromEuler(_e);
            _s.setScalar(s.len);
            // (the model's snout is at its origin: put it half a length ahead of the middle)
            _v.set(0, 0, s.len * 0.5).applyQuaternion(_q);
            mm.mesh.setMatrixAt(i, _m.compose(_v.add(s.pos), _q, _s));
          } else {
            const j: Jelly = c;
            const [d0, d1] = j.sp.depth ?? [2, 15];
            if (!j.placed || hyp(j.pos.x - cam.x, j.pos.z - cam.z) > 45) {
              const [x, z] = near(cam, fx, fz, 6, 32);
              const floorY = loc.pelagic ? -80 : T.top(x, z);
              j.pos.set(x, Math.max(-rr(d0, d1), floorY + 1.5), z); j.placed = true;
              if (j.pos.y > -0.8) j.pos.y = -0.8;
            }
            // carried by the current, bobbing up with each beat of the bell
            j.pos.x += env.cur.x * 0.12 * dt; j.pos.z += env.cur.z * 0.12 * dt;
            j.pos.y += Math.sin(env.t * 0.5 + j.bob) * 0.03 * dt;
            _q.setFromEuler(_e.set(Math.sin(env.t * 0.2 + j.bob) * 0.15, j.bob, Math.cos(env.t * 0.17 + j.bob) * 0.15));
            _s.setScalar(j.s);
            mm.mesh.setMatrixAt(i, _m.compose(j.pos, _q, _s));
          }
        });
        mm.mesh.instanceMatrix.needsUpdate = true;
        if (aM) aM.needsUpdate = true;
      }
    },
    subjects(out: Subject[]) {
      for (const m of morays) out.push({ key: `moray:${m.sp.id}:${m.i}`, label: m.sp.ja, kind: 'critter', prio: 1.8, size: 0.6, len: m.len, adult: m.sp.size[1], lenWhat: '全長',
        pos: () => m.head, front: () => m.dir, status: () => (m.out > 0.38 ? '穴から体を乗り出して、獲物を探している' : '穴から顔を出し、口を開け閉めして呼吸している'), live: () => !m.buried });
      for (const s of snakes) out.push({ key: `snake:${s.sp.id}:${s.i}`, label: s.sp.ja, kind: 'critter', prio: s.state === 'up' || s.state === 'breathe' ? 3 : 2.1, size: 0.65, len: s.len, adult: s.sp.size[1], lenWhat: '全長',
        pos: () => s.pos, status: () => (s.state === 'forage' ? '岩のすき間をのぞいて、獲物を探している' : s.state === 'breathe' ? '水面で息継ぎをしている' : s.state === 'up' ? '息継ぎに浮上している' : '海底へ戻っていく'), live: () => s.placed });
      for (const j of jellies) out.push({ key: `jelly:${j.sp.id}:${j.i}`, label: j.sp.ja, kind: 'critter', prio: 1.5, size: 0.3, pos: () => j.pos, status: () => (j.sp.pat === 1 ? '長い触手を引いて、流れに乗って漂っている' : '傘を脈打たせながら漂っている'), live: () => j.placed });
    },
  };
}

// one of them on its own (for the field guide's picture): laid out straight, jaws a little open
export function critterModel(sp: CritterSpec): { obj: THREE.Object3D; view: [number, number, number] } {
  if (sp.kind === 'jelly') {
    const g = jellyGeo(sp.pat); g.setAttribute('aJ', new THREE.InstancedBufferAttribute(new Float32Array([1.5, 0]), 2));
    const m = new THREE.InstancedMesh(g, jellyMaterial(sp), 1); m.setMatrixAt(0, new THREE.Matrix4());
    return { obj: m, view: [1, 0.25, 0.3] };
  }
  const g = (sp.kind === 'moray' ? MORAY_GEO : SNAKE_GEO).clone();
  g.setAttribute('aM', new THREE.InstancedBufferAttribute(new Float32Array(sp.kind === 'moray' ? [1.2, 0.35, 0, 3] : [0, 0, 0, 0]), 4));
  const m = new THREE.InstancedMesh(g, sp.kind === 'moray' ? morayMaterial(sp) : snakeMaterial(sp), 1);
  // (show the front half: the head is what tells them apart)
  m.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, sp.kind === 'moray' ? 0.25 : 0.5));
  return { obj: m, view: [1, 0.35, 0.6] };
}
