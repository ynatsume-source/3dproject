// Shared, one-mesh manta. +z is forward, an undeformed disc spans x=-1..1.
// All parts share one material. The mouth boundary is also the disc's leading edge;
// opening it therefore moves skin, lips and oral lining together (no overlay hole).
import * as THREE from 'three';
import { mat } from '../render/common';
import { smooth } from '../core/math';

const FRONT = (x: number) => 0.325 - 0.06 * smooth(0, 0.2, Math.abs(x)) - 0.46 * Math.pow(Math.max(0, (Math.abs(x) - 0.2) / 0.8), 1.28);
const BACK = (x: number) => -0.405 + 0.21 * Math.pow(Math.abs(x), 0.62);
const gape = (x: number) => Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(x) / 0.14, 4)));
function disc(x: number, v: number, side: number) {
  const ax = Math.abs(x), h = Math.pow(Math.max(0, Math.sin(Math.PI * v)), 0.7);
  const core = Math.exp(-Math.pow(x / 0.21, 2));
  const foil = Math.pow(Math.max(0, 1 - ax), 1.2) * h;
  const front = (0.005 * (1 - smooth(0.14, 0.24, ax)) + side * 0.004 * gape(x)) * (1 - smooth(0, 0.32, v));
  const y = front + (side > 0 ? 0.087 * core * h + 0.025 * foil : -0.044 * core * h - 0.015 * foil);
  return [x, y, FRONT(x) * (1 - v) + BACK(x) * v];
}

export const MANTA_GEO = (() => {
  const pos: number[] = [], side: number[] = [], uu: number[] = [], vv: number[] = [], part: number[] = [], ceph: number[] = [], idx: number[] = [];
  const vertex = (p: number[], s: number, u: number, v: number, pt: number, c = [0, 0, 0]) => {
    const n = pos.length / 3; pos.push(...p); side.push(s); uu.push(u); vv.push(v); part.push(pt); ceph.push(...c); return n;
  };
  // Skip collapsed cap/tip triangles instead of sending zero-area primitives to the GPU.
  const tri = (a: number, b: number, c: number) => {
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) > 1e-11) idx.push(a, b, c);
  };
  const patch = (us: number[], vs: number[], s: number, pt: number, sample: (u: number, v: number) => number[], params?: (u: number, v: number) => number[]) => {
    const start = pos.length / 3;
    for (const u of us) for (const v of vs) vertex(sample(u, v), s, u, v, pt, params?.(u, v));
    for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < vs.length - 1; j++) {
      const a = start + i * vs.length + j, b = a + vs.length;
      if (s > 0) { tri(a, b, a + 1); tri(a + 1, b, b + 1); }
      else { tri(a, a + 1, b); tri(a + 1, b + 1, b); }
    }
  };
  const range = (n: number, lo = 0, hi = 1) => Array.from({ length: n + 1 }, (_, i) => lo + (hi - lo) * i / n);
  // Extra head samples are shared with the oral lining. Cosine chord spacing resolves
  // the round leading edge without increasing the whole model's tessellation.
  const headX = range(20, -0.14, 0.14);
  const span = [...range(25, -1, -0.14).slice(0, -1), ...headX, ...range(25, 0.14, 1).slice(1)];
  const chord = range(26).map(t => (1 - Math.cos(t * Math.PI)) * 0.5);
  for (const s of [1, -1]) patch(span, chord, s, 0, (u, v) => disc(u, v, s));

  // The interior narrows into a closed, dark throat. Its first row is exactly the
  // skin boundary, even at a closed mouth. It is geometry, not a painted black oval.
  for (const s of [1, -1]) patch(headX, range(8), -s, 3, (x, d) => {
    const p = disc(x, 0, s); return [x * (1 - d * 0.4), 0.005 + (p[1] - 0.005) * (1 - d * 0.65), FRONT(x) - 0.205 * d];
  }, (x, d) => [x / 0.14, d, s]);
  // Rear wall is slightly forward of the enclosed body core; never see through it.
  patch(headX, range(2), 1, 9, (x, t) => [x * 0.6, 0.005 + (t * 2 - 1) * 0.004 * gape(x) * 0.35, FRONT(x) - 0.205], (x, t) => [x / 0.14, t, 0]);

  // A soft lip rim follows the exact same upper/lower opening.
  for (const s of [1, -1]) patch(headX, range(6), 1, 4, (x, t) => {
    const p = disc(x, 0, s), a = t * Math.PI * 2, r = 0.0011 * (0.45 + 0.55 * gape(x));
    return [x, p[1] + Math.cos(a) * r, p[2] + Math.sin(a) * r];
  }, (x, t) => [x / 0.14, t, s]);

  // Broad-based cephalic fins are real ribbons, not detached cones. Both sides
  // and their narrow edge are included, so an unrolled funnel has a pale lining.
  const cephPoint = (l: number, c: number, sx: number, sheet: number) => {
    const width = (0.052 + 0.075 * Math.sin(Math.PI * l * 0.72)) * (1 - 0.12 * l);
    const curl = 0.55 + 4.7 * smooth(0, 0.55, l), angle = (c - 0.5) * curl, r = width / curl;
    // Thickness follows the curled cross-section normal. A fixed y offset
    // makes the inner/outer sheets intersect where the ribbon turns sideways.
    return [sx * (0.145 + Math.sin(angle) * (r - sheet * 0.0013)), 0.011 + (1 - Math.cos(angle)) * r - l * l * 0.011 + sheet * 0.0013 * Math.cos(angle), 0.272 + 0.195 * l];
  };
  for (const sx of [-1, 1]) {
    for (const sheet of [1, -1]) patch(range(16), range(12), sheet, 2, (l, c) => cephPoint(l, c, sx, sheet), (l, c) => [l, c, sx]);
    for (const edge of [0, 1]) patch(range(16), range(1, -1, 1), 1, 8, (l, sheet) => cephPoint(l, edge, sx, sheet), (l, sheet) => [l, edge, sx * (sheet > 0 ? 1 : 2)]);
  }

  // Lateral eyes sit in low skin mounds. The globe is kept small: the reference
  // photographs show side-facing eyes, not large forward-facing cartoon pupils.
  const ellipsoid = (center: number[], r: number[], pt: number, sx: number) => {
    patch(range(16, 0, Math.PI * 2), range(10, 0, Math.PI), 1, pt, (a, b) => [center[0] + Math.cos(a) * Math.sin(b) * r[0], center[1] + Math.cos(b) * r[1], center[2] + Math.sin(a) * Math.sin(b) * r[2]], (a, b) => [a, b, sx]);
  };
  for (const sx of [-1, 1]) {
    ellipsoid([sx * 0.174, 0.007, 0.239], [0.022, 0.018, 0.028], 6, sx);
    ellipsoid([sx * 0.195, 0.012, 0.252], [0.008, 0.007, 0.010], 5, sx);
  }

  // Tapering tail, a small dorsal fin and paired pelvic lobes behind the disc.
  patch(range(22), range(8, 0, Math.PI * 2), 1, 1, (t, a) => {
    const r = 0.012 * Math.pow(1 - t, 1.4) + 0.0011;
    return [Math.cos(a) * r, 0.003 + Math.sin(a) * r, -0.38 - 0.77 * t];
  });
  for (const sx of [-1, 1]) {
    const f = vertex([sx * 0.006, 0.025, -0.315], sx, 0, 0, 1);
    const a = vertex([0, 0.08, -0.385], sx, 0, 0, 1), b = vertex([sx * 0.004, 0.011, -0.423], sx, 0, 0, 1); tri(f, a, b);
    patch(range(7), range(6), sx, 7, (u, v) => {
      const x = sx * (0.055 + 0.092 * u), z = -0.322 - 0.122 * v * Math.sin(Math.PI * u);
      return [x, -0.011 - 0.013 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v), z];
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(uu, 1));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(vv, 1));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute('aCeph', new THREE.Float32BufferAttribute(ceph, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // Include shader poses in culling bounds, also for the field-guide thumbnail.
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-1.05, -0.69, -1.22), new THREE.Vector3(1.05, 0.69, 0.51));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -0.32), 1.42);
  return g;
})();

export function mantaMaterial(oceanic = false) {
  return mat(/* glsl */ `
    attribute float aSide, aU, aV, aPart; attribute vec3 aCeph;
    uniform float uPhase, uFeed, uBeat, uAmp, uMouth, uBank, uAir;
    varying vec3 vWp, vL, vN; varying float vSide, vPart; varying vec2 vUV;
    float opening(){ return uMouth < 0.0 ? clamp(uFeed, 0.0, 1.0) : clamp(uMouth, 0.0, 1.0); }
    float front(float x){ float a = abs(x); return 0.325 - 0.06 * smoothstep(0.0, 0.2, a) - 0.46 * pow(max(0.0, (a - 0.2) / 0.8), 1.28); }
    float gape(float x){ return sqrt(max(0.0, 1.0 - pow(abs(x) / 0.14, 4.0))); }
    vec3 lip(float x, float s){
      float y = 0.005 + gape(x) * (s > 0.0 ? 0.004 + opening() * 0.016 : -0.004 - opening() * 0.084);
      return vec3(x, y, front(x));
    }
    vec3 discPoint(float x, float v, float s){
      float a = abs(x), h = pow(max(0.0, sin(3.14159265 * v)), 0.7);
      float core = exp(-pow(x / 0.21, 2.0)), foil = pow(max(0.0, 1.0 - a), 1.2) * h;
      float jaw = gape(x) * (s > 0.0 ? 0.004 + opening() * 0.016 : -0.004 - opening() * 0.084);
      float y = (0.005 * (1.0 - smoothstep(0.14, 0.24, a)) + jaw) * (1.0 - smoothstep(0.0, 0.32, v));
      y += s > 0.0 ? 0.087 * core * h + 0.025 * foil : -0.044 * core * h - 0.015 * foil;
      float z = mix(front(x), -0.405 + 0.21 * pow(a, 0.62), v);
      // A rigid head/shoulder zone keeps the eye sockets and all mouth seams
      // attached while the pectoral fins flex farther out on the disc.
      float wing = max(0.0, (a - 0.22) / 0.78), cycle = uTime * uBeat + uPhase;
      float ph = cycle - wing * 1.55 - v * 0.6 * (1.0 - wing);
      float flex = sin(ph) * 0.37 * uAmp * pow(wing, 1.55);
      float bank = clamp(uBank, -1.0, 1.0) * sign(x) * 0.10 * pow(wing, 1.5);
      // Air pose comes from the breach controller. Freeze the powered beat and
      // retain a restrained swept/cambered disc rather than paddling in air.
      y += mix(flex + bank, -0.09 * wing * wing + bank * 0.3, clamp(uAir, 0.0, 1.0));
      x *= 1.0 - 0.065 * wing * wing * abs(sin(ph)) * (1.0 - clamp(uAir, 0.0, 1.0));
      z += cos(ph) * 0.016 * wing * (1.0 - clamp(uAir, 0.0, 1.0));
      return vec3(x, y, z);
    }
    vec3 cephPoint(float l, float c, float sx, float sheet){
      float feed = clamp(uFeed, 0.0, 1.0), width = (0.052 + 0.075 * sin(3.14159265 * l * 0.72)) * (1.0 - 0.12 * l);
      float curl = 0.55 + mix(4.7, 0.7, feed) * smoothstep(0.0, 0.55, l), angle = (c - 0.5) * curl, r = width / curl;
      return vec3(sx * (0.145 + 0.023 * l * feed + sin(angle) * (r - sheet * 0.0013)),
        0.011 + (1.0 - cos(angle)) * r - l * l * (0.011 + feed * 0.04) + sheet * 0.0013 * cos(angle),
        0.272 + 0.195 * l);
    }
    vec3 oralPoint(float x, float d, float s){ vec3 p = lip(x, s); return vec3(x * (1.0 - 0.4 * d), 0.005 + (p.y - 0.005) * (1.0 - d * 0.65), p.z - 0.205 * d); }
    void main(){
      vec3 p = position, n = normal; float part = floor(aPart + 0.5);
      if (part < 0.5) {
        p = discPoint(aU, aV, aSide);
        // Normals follow the deformed surface continuously, including mouth
        // movement. Finite differences are in the vertex shader, not per pixel.
        float nx = clamp(aU, -0.9995, 0.9995);
        float x0 = nx - 0.0004, x1 = nx + 0.0004;
        float v0 = max(0.00001, aV - 0.0005), v1 = min(0.99999, aV + 0.0005);
        n = normalize(cross(discPoint(x1, aV, aSide) - discPoint(x0, aV, aSide), discPoint(nx, v1, aSide) - discPoint(nx, v0, aSide))) * aSide;
      } else if (part < 1.5) {
        float t = clamp((-0.38 - p.z) / 0.77, 0.0, 1.0), cycle = uTime * uBeat + uPhase;
        p.x += sin(cycle * 0.65 - t * 2.2) * 0.037 * t * t * (1.0 - uAir * 0.7);
        p.y += sin(cycle - t * 1.6) * 0.024 * t * (1.0 - uAir * 0.7);
      } else if (part < 2.5 || (part > 7.5 && part < 8.5)) {
        float sx = sign(aCeph.z), sheet = part > 7.5 ? (abs(aCeph.z) < 1.5 ? 1.0 : -1.0) : aSide;
        p = cephPoint(aCeph.x, aCeph.y, sx, sheet);
        vec3 dx = cephPoint(aCeph.x + 0.001, aCeph.y, sx, sheet) - p;
        vec3 dy = cephPoint(aCeph.x, aCeph.y + 0.001, sx, sheet) - p;
        n = normalize(cross(dx, dy)) * sx * sheet;
      } else if (part < 3.5) {
        float x = aCeph.x * 0.14, d = aCeph.y, s = aCeph.z;
        p = oralPoint(x, d, s);
        float x0 = max(-0.139999, x - 0.0001), x1 = min(0.139999, x + 0.0001);
        n = normalize(cross(oralPoint(x1, d, s) - oralPoint(x0, d, s), oralPoint(x, d + 0.001, s) - p)) * -s;
      } else if (part < 4.5) {
        float x = aCeph.x * 0.14, a = aCeph.y * 6.2831853, r = 0.0011 * (0.45 + 0.55 * gape(x));
        p = lip(x, aCeph.z) + vec3(0.0, cos(a) * r, sin(a) * r); n = vec3(0.0, cos(a), sin(a));
      } else if (part > 8.5) {
        float x = aCeph.x * 0.14; vec3 top = oralPoint(x, 1.0, 1.0), bottom = oralPoint(x, 1.0, -1.0);
        p = mix(bottom, top, aCeph.y); n = vec3(0.0, 0.0, 1.0);
      }
      vec4 w = modelMatrix * vec4(p, 1.0); vWp = w.xyz;
      // Pigment belongs to the skin, so wing beats never slide its pattern.
      vL = part < 0.5 ? position : p;
      vN = normalize(mat3(modelMatrix) * n); vSide = aSide; vPart = part;
      vUV = (part > 2.5 && part < 4.5) ? aCeph.xy : vec2(aU, aV);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`, /* glsl */ `
    uniform float uSeed, uFeed, uOceanic;
    varying vec3 vWp, vL, vN; varying float vSide, vPart; varying vec2 vUV;
    void main(){
      vec3 V = normalize(uCamPos - vWp), n = normalize(vN); if (dot(n, V) < 0.0) n = -n;
      float au = abs(vL.x), rough = vn2(vL.xz * 45.0 + uSeed);
      vec3 dark = vec3(0.028, 0.039, 0.048), pale = vec3(0.81, 0.83, 0.8), alb = dark;
      float gloss = 0.10;
      if (vPart < 0.5) {
        if (vSide > 0.0) {
          alb = dark * (0.88 + rough * 0.18 + vn2(vL.xz * 9.0 + uSeed) * 0.20);
          // Soft shoulder fields, with a slightly clearer head boundary for the
          // oceanic material. Individual pattern is a visual variant, not an ID.
          float sweep = 0.21 - (au - 0.16) * 0.53;
          float shoulderMark = 1.0 - smoothstep(0.037, mix(0.09, 0.067, uOceanic), abs(vL.z - sweep) + (vn2(vL.xz * 17.0 + uSeed) - 0.5) * 0.025);
          shoulderMark *= smoothstep(mix(0.13, 0.19, uOceanic), 0.24, au) * (1.0 - smoothstep(0.47, 0.66, au));
          shoulderMark *= 0.55 + 0.25 * vn2(vL.xz * 8.0 - uSeed);
          alb = mix(alb, vec3(0.48, 0.53, 0.54), shoulderMark);
          float spine = exp(-pow(vL.x / 0.047, 2.0)) * (1.0 - smoothstep(-0.1, 0.2, vL.z));
          alb += vec3(0.012, 0.018, 0.022) * spine;
        } else {
          alb = pale * (0.92 + 0.09 * rough);
          float edge = max(smoothstep(0.85, 0.99, abs(vUV.x)), smoothstep(0.80, 0.99, vUV.y) * smoothstep(0.24, 0.65, au));
          alb = mix(alb, dark * 1.8, edge * 0.9);
          // Sparse irregular belly spots; no repeated, aligned grid of dots.
          vec2 q = vL.xz * 17.0 + vec2(uSeed, uSeed * 0.37), cell = floor(q), f = fract(q);
          vec2 center = vec2(hash2(cell + 3.1), hash2(cell + 17.7)) * 0.45 + 0.275;
          float spot = 1.0 - smoothstep(0.09, 0.21, length((f - center) * vec2(1.0, 1.35)));
          spot *= step(0.62, hash2(cell)) * (1.0 - smoothstep(0.22, 0.36, au)) * (1.0 - smoothstep(0.1, 0.2, abs(vL.z + 0.04)));
          alb = mix(alb, dark * 1.3, spot * 0.92);
          // Five paired, curved slits. The pale rim and narrow shadow suggest
          // recessed openings without adding tiny disconnected black objects.
          for (int k = 0; k < 5; k++) {
            float fk = float(k), x0 = 0.075 + fk * 0.002, x1 = 0.176 + fk * 0.005;
            float span = smoothstep(x0, x0 + 0.014, au) * (1.0 - smoothstep(x1 - 0.012, x1, au));
            float zz = 0.142 - fk * 0.037 - 0.025 * pow((au - 0.12) / 0.10, 2.0), dy = vL.z - zz;
            float slit = (1.0 - smoothstep(0.0018, 0.0047, abs(dy))) * span;
            alb = mix(alb, vec3(0.065, 0.09, 0.10), slit * 0.92);
            alb += vec3(0.045) * exp(-pow((dy - 0.006) / 0.003, 2.0)) * span;
          }
        }
        alb = mix(alb, alb * 0.6 + vec3(0.21), scarMarks(vL.xz * 8.0, uSeed) * 0.13);
      } else if (vPart < 1.5) { alb = dark * 0.85; }
      else if (vPart < 2.5 || (vPart > 7.5 && vPart < 8.5)) {
        float lining = vPart > 7.5 ? 0.15 : (vSide < 0.0 ? 0.55 : 0.15);
        alb = mix(dark * 1.3, pale * 0.83, lining);
        alb *= 0.92 + rough * 0.13;
      } else if (vPart < 3.5) {
        float d = vUV.y, rib = pow(0.5 + 0.5 * cos(vUV.x * 88.0 + d * 6.0), 8.0);
        alb = mix(vec3(0.085, 0.082, 0.09), vec3(0.006, 0.01, 0.013), smoothstep(0.02, 0.9, d));
        alb += vec3(0.026, 0.030, 0.028) * rib * smoothstep(0.2, 0.4, d) * (1.0 - smoothstep(0.65, 1.0, d));
        gloss = 0.025;
      } else if (vPart < 4.5) { alb = mix(dark * 1.7, pale * 0.28, step(vL.y, 0.0)); gloss = 0.10; }
      else if (vPart < 5.5) {
        // The cornea looks laterally. A subdued ring, round black pupil and a
        // real light reflection replace the old black dots painted on the back.
        float r = length(vec2((vL.y - 0.012) / 0.007, (vL.z - 0.252) / 0.010));
        alb = mix(vec3(0.10, 0.12, 0.11), vec3(0.007, 0.013, 0.017), 1.0 - smoothstep(0.34, 0.61, r));
        gloss = 0.8;
      } else if (vPart < 6.5) { alb = dark * (1.0 + 0.2 * rough); gloss = 0.20; }
      else if (vPart < 7.5) { alb = gl_FrontFacing ? dark : pale * 0.75; }
      else if (vPart > 8.5) { alb = vec3(0.004, 0.006, 0.008); gloss = 0.0; }
      vec3 col = shade(alb, vWp, n, 0.32);
      // Broad, subtle wet-skin sheen; the eye carries the sharper highlight.
      float spec = pow(max(dot(reflect(-SUN, n), V), 0.0), vPart > 4.5 && vPart < 5.5 ? 75.0 : 32.0);
      vec3 sheen = absorb(vec3(0.66, 0.78, 0.82), vWp.y) * spec * gloss * uSunI;
      float visibility = exp(-length(uCamPos - vWp) * uFogDen);
      gl_FragColor = vec4(col + sheen * visibility, 1.0);
    }`, { uniforms: {
      uPhase: { value: Math.random() * Math.PI * 2 }, uFeed: { value: 0 }, uBeat: { value: 1.05 }, uAmp: { value: 1 },
      uSeed: { value: Math.random() * 50 }, uMouth: { value: -1 }, uBank: { value: 0 }, uAir: { value: 0 }, uOceanic: { value: oceanic ? 1 : 0 },
    }, opts: { side: THREE.DoubleSide } });
}
