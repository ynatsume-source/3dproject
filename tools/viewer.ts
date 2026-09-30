// Dev-only model viewer: renders one creature from four angles in plain daylight a few metres down.
// Open /tools/viewer.html?sp=whaleshark (a species id) or ?turtle=green|hawksbill, with the dev server.
import * as THREE from 'three';
import { U } from '../src/render/common';
import { LOCATIONS } from '../src/data/locations';
import { SHAPES, fishGeometry, fishMaterial, makeTurtle } from '../src/ocean/models';

const q = new URLSearchParams(location.search);
const cv = document.getElementById('c') as HTMLCanvasElement;
const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
const scene = new THREE.Scene();
U.uUp.value.setRGB(0.3, 0.68, 0.95); U.uHor.value.setRGB(0.02, 0.26, 0.58); U.uDown.value.setRGB(0, 0.07, 0.25);
U.uAbs.value.set(0.08, 0.03, 0.02); U.uFogDen.value = 0.004; U.uSunI.value = 1; U.uAmb.value = 1;
let obj: THREE.Object3D, len = 1;
const sp = LOCATIONS.flatMap((l) => l.species).find((s) => s.id === q.get('sp'));
if (sp) {
  const g = fishGeometry(SHAPES[sp.shape]);
  g.setAttribute('aSwim', new THREE.InstancedBufferAttribute(new Float32Array([+(q.get('seed') || 3.7), 0, 1]), 3));
  const m = new THREE.InstancedMesh(g, fishMaterial(sp), 1); m.setMatrixAt(0, new THREE.Matrix4());
  obj = m; len = 1.3;
} else { obj = makeTurtle(q.get('turtle') || 'green').group; len = 1.4; }
obj.position.y = -1.6; scene.add(obj);
scene.background = new THREE.Color(0.05, 0.3, 0.55);
const cam = new THREE.PerspectiveCamera(35, 1.5, 0.01, 100);
const views = q.has('head') ? [[1, 0.1, 0.25], [0.35, 0.15, 1], [0.05, 1, 0.3], [0.4, -0.6, 0.7]] : [[0.9, 0.15, 0.6], [0, 0.05, 1], [0.05, 1, 0.1], [0.3, -0.7, 0.5]];
const look = new THREE.Vector3(0, 0, q.has('head') ? 0.6 : 0);
const W = 600, H = 400;
r.setScissorTest(true);
function draw(t: number) {
  U.uTime.value = t / 1000;
  views.forEach((v, i) => {
    const d = new THREE.Vector3(...v).normalize().multiplyScalar(len * (q.has('head') ? 0.45 : q.has('close') ? 1.1 : 2.2));
    cam.position.copy(obj.position).add(look).add(d); cam.lookAt(obj.position.clone().add(look)); cam.aspect = W / H; cam.updateProjectionMatrix();
    U.uCamPos.value.copy(cam.position); cam.getWorldDirection(U.uCamFwd.value);
    const x = (i % 2) * W, y = (1 - Math.floor(i / 2)) * H;
    r.setViewport(x, y, W, H); r.setScissor(x, y, W, H); r.render(scene, cam);
  });
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
(window as any).ready = true;
