// The guide's own drone, seen from behind when the view is set to follow it: a compact underwater
// camera drone — a smooth white upper shell over a graphite belly, a glass dome over the camera at the
// front with the lens inside, two ducted side thrusters whose props spin with the speed, a pair of
// small vertical thrusters on top, and two lamps either side of the dome that glow when the light is on.
// Length 0.46 m, nose at +z (the frame of the drone itself; main.ts places and tilts it).
import * as THREE from 'three';
import { mat } from '../render/common';

type Part = 0 | 1 | 2 | 3 | 4 | 5;   // 0 upper shell, 1 belly, 2 glass dome, 3 thruster duct / frame, 4 lens, 5 lamp
function build(parts: [THREE.BufferGeometry, Part][]) {
  const P: number[] = [], N: number[] = [], A: number[] = [];
  for (const [g0, part] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); A.push(part); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  return out;
}

function hullGeo() {
  // a rounded, slightly wedge-shaped hull: fuller at the front, tapering and lifting at the back
  const g = new THREE.SphereGeometry(0.5, 48, 28), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = z + 0.5;                                                       // 0 tail .. 1 nose
    const box = (v: number, k: number) => Math.sign(v) * Math.pow(Math.abs(v) * 2, k) * 0.5;   // squarer section
    x = box(x, 0.8) * 0.3 * (0.8 + 0.25 * f);
    y = box(y, 0.85) * (y > 0 ? 0.17 : 0.13) * (0.75 + 0.3 * f) + 0.012 * (1 - f);
    z = z * 0.46;
    p.setXYZ(i, x, y, z);
  }
  return g;
}

export function makeDrone() {
  const hull = hullGeo();
  // split the hull into its white top and graphite belly by the shader (aPart 0 for both; y decides)
  const dome = new THREE.SphereGeometry(0.056, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5); dome.rotateX(Math.PI / 2); dome.scale(1.25, 1, 0.7); dome.translate(0, 0.0, 0.215);
  const lens = new THREE.CylinderGeometry(0.022, 0.026, 0.02, 20); lens.rotateX(Math.PI / 2); lens.translate(0, 0.0, 0.228);
  const parts: [THREE.BufferGeometry, Part][] = [[hull, 0], [dome, 2], [lens, 4]];
  for (const sx of [-1, 1]) {
    // side thruster pods: long, slim, faired into the flanks, open at both ends with the prop inside
    const pod = new THREE.CylinderGeometry(0.034, 0.03, 0.16, 24, 1, true); pod.rotateX(Math.PI / 2); pod.translate(sx * 0.155, -0.022, -0.06);
    const podIn = new THREE.CylinderGeometry(0.029, 0.026, 0.16, 24, 1, true); podIn.rotateX(Math.PI / 2); podIn.translate(sx * 0.155, -0.022, -0.06);
    podIn.index!.array.reverse?.call(podIn.index!.array);
    const lipF = new THREE.TorusGeometry(0.0315, 0.0028, 6, 24); lipF.translate(sx * 0.155, -0.022, 0.02);
    const lipB = new THREE.TorusGeometry(0.028, 0.0028, 6, 24); lipB.translate(sx * 0.155, -0.022, -0.14);
    const fair = new THREE.BoxGeometry(0.04, 0.026, 0.13); fair.translate(sx * 0.125, -0.022, -0.06);
    const hub = new THREE.ConeGeometry(0.01, 0.04, 12); hub.rotateX(-Math.PI / 2); hub.translate(sx * 0.155, -0.022, -0.1);
    parts.push([pod, 1], [podIn, 3], [lipF, 3], [lipB, 3], [fair, 1], [hub, 3]);
    // the lamps, either side of the dome
    const lampG = new THREE.CylinderGeometry(0.014, 0.016, 0.03, 16); lampG.rotateX(Math.PI / 2); lampG.translate(sx * 0.1, 0.035, 0.165);
    const rim = new THREE.TorusGeometry(0.0155, 0.003, 6, 16); rim.translate(sx * 0.1, 0.035, 0.18);
    parts.push([lampG, 5], [rim, 3]);
  }
  // a thin fin along the tail
  const fin = new THREE.BoxGeometry(0.005, 0.022, 0.08); fin.translate(0, 0.066, -0.17); parts.push([fin, 3]);
  const geo = build(parts);

  const material = mat(
    `attribute float aPart; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart;
     void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vL = position; vPart = aPart; gl_Position = projectionMatrix * viewMatrix * w; }`,
    `uniform float uGlow; varying vec3 vWp; varying vec3 vN; varying vec3 vL; varying float vPart;
     void main(){
       vec3 n = normalize(vN); vec3 V = normalize(uCamPos - vWp); if (dot(n, V) < 0.0) n = -n;
       vec3 alb; float spec = 0.35, sharp = 40.0; vec3 emit = vec3(0.0);
       if (vPart < 0.5) {
         // white upper shell over a graphite belly, a fine amber line where they meet, a seam and a few panel lines
         float belly = smoothstep(0.012, 0.004, vL.y + 0.012 * vL.z);
         alb = mix(vec3(0.66, 0.68, 0.69), vec3(0.09, 0.1, 0.11), belly);
         alb = mix(alb, vec3(0.95, 0.55, 0.15), (1.0 - smoothstep(0.0015, 0.003, abs(vL.y + 0.012 * vL.z - 0.008))) * step(-0.18, vL.z));
         alb *= 1.0 - 0.25 * (1.0 - smoothstep(0.0008, 0.002, abs(vL.z + 0.06))) * (1.0 - belly);
         alb *= 1.0 - 0.2 * (1.0 - smoothstep(0.0008, 0.002, abs(abs(vL.x) - 0.06))) * step(0.02, vL.y) * step(vL.z, 0.12);
         // the two vertical thrusters, let into the top of the shell behind grilles
         float port = length(vec2(abs(vL.x) - 0.07, vL.z + 0.1));
         float grille = step(0.5, fract(vL.x * 160.0));
         alb = mix(alb, mix(vec3(0.06), vec3(0.16), grille), (1.0 - smoothstep(0.021, 0.023, port)) * step(0.03, vL.y));
         alb = mix(alb, vec3(0.3, 0.31, 0.32), (1.0 - smoothstep(0.0015, 0.003, abs(port - 0.023))) * step(0.03, vL.y));
         spec = mix(0.35, 0.18, belly); sharp = mix(50.0, 20.0, belly);
       } else if (vPart < 1.5) {
         // the thruster pods and fairings: graphite with a satin sheen, a thin amber ring near the intake
         alb = vec3(0.12, 0.13, 0.14) * (1.0 + 2.5 * (1.0 - smoothstep(0.002, 0.004, abs(vL.z - 0.012))) * vec3(0.9, 0.4, 0.05) * step(0.1, abs(vL.x)));
         spec = 0.35; sharp = 30.0;
       } else if (vPart < 2.5) {
         // the glass dome: dark, with the lens behind it, and a bright glassy sheen
         alb = vec3(0.02, 0.03, 0.04); spec = 1.4; sharp = 120.0;
         vec3 rf = reflect(-V, n);
         emit = mix(uHor, uUp, clamp(rf.y * 0.5 + 0.5, 0.0, 1.0)) * uAmb * 0.35 * (0.3 + 0.7 * pow(1.0 - max(dot(n, V), 0.0), 2.0));   // (the water and the light, mirrored in the dome)
       } else if (vPart < 3.5) {
         alb = vec3(0.13, 0.14, 0.15); spec = 0.25; sharp = 18.0;
       } else if (vPart < 4.5) {
         // the lens: black glass with a blue coating glint and a thin bright ring
         float r = length(vL.xy - vec2(0.0, -0.005));
         alb = mix(vec3(0.01, 0.02, 0.05), vec3(0.3, 0.32, 0.34), smoothstep(0.024, 0.027, r));
         spec = 1.2; sharp = 90.0;
       } else {
         alb = vec3(0.9, 0.9, 0.85); spec = 0.8; sharp = 60.0;
         emit = vec3(1.0, 0.94, 0.82) * uGlow * 2.2;
       }
       vec3 col = shade(alb, vWp, n, 0.3);
       col += absorb(vec3(0.95, 0.98, 1.0), vWp.y) * (pow(max(dot(reflect(-SUN, n), V), 0.0), sharp) * spec * uSunI + pow(1.0 - max(dot(n, V), 0.0), 4.0) * 0.18 * uAmb * spec);
       gl_FragColor = vec4(col + emit, 1.0);
     }`,
    { uniforms: { uGlow: { value: 0 } } });

  const group = new THREE.Group();
  const body = new THREE.Mesh(geo, material); group.add(body);
  // the props, inside the side ducts: three blades each, turning with the thrust
  const bladeGeo = (() => {
    const parts2: [THREE.BufferGeometry, Part][] = [];
    for (let k = 0; k < 3; k++) { const b = new THREE.BoxGeometry(0.004, 0.044, 0.014); b.translate(0, 0.024, 0); b.rotateY(0.5); b.rotateZ((k / 3) * Math.PI * 2); parts2.push([b, 3]); }
    return build(parts2);
  })();
  const props: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) { const pr = new THREE.Mesh(bladeGeo, material); pr.position.set(sx * 0.155, -0.022, -0.1); pr.scale.setScalar(0.58); group.add(pr); props.push(pr); }
  // a soft halo in front of each lamp when it is on
  const haloMat = new THREE.SpriteMaterial({ color: 0xfff1d6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const halos: THREE.Sprite[] = [];
  for (const sx of [-1, 1]) { const h = new THREE.Sprite(haloMat); h.position.set(sx * 0.1, 0.035, 0.19); h.scale.setScalar(0.09); group.add(h); halos.push(h); }
  // Doron's number on its forehead (Dot's world, ADR 0007): painted on the shell just behind the dome, read from in
  // front; none on the Earth's seas, where the drone is the visitor's own
  const tagMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.05), tagMat);
  tag.rotation.x = -Math.PI / 2 + 0.11; tag.position.set(0, 0.0805, 0.105); tag.visible = false; group.add(tag);
  let tagN: number | null = null;
  group.traverse((o) => { o.frustumCulled = false; });
  group.visible = false;

  let spin = 0;
  return {
    group,
    // thrust: 0..1 (how hard it is driving), glow: the lamp 0..1
    animate(dt: number, thrust: number, glow: number) {
      spin += dt * (8 + thrust * 55);
      props[0].rotation.z = spin; props[1].rotation.z = -spin;
      (material.uniforms.uGlow as { value: number }).value = glow;
      haloMat.opacity = glow * 0.55;
    },
    /** The number on its forehead (null: none). */
    setNumber(n: number | null) {
      if (n === tagN) return; tagN = n; tag.visible = n !== null;
      if (n === null || typeof document === 'undefined') return;
      const c = document.createElement('canvas'); c.width = 256; c.height = 148; const g = c.getContext('2d')!;
      g.clearRect(0, 0, 256, 148); g.fillStyle = '#11171a'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 124px "Helvetica Neue", Arial, sans-serif'; g.fillText(String(n).padStart(2, '0'), 128, 80);
      tagMat.map?.dispose(); tagMat.map = new THREE.CanvasTexture(c); tagMat.needsUpdate = true;
    },
  };
}
