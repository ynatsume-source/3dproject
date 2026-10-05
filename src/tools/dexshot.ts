// Pictures for the setting book (設定資料集): each creature's own model through the field guide's studio, and the
// island's things (driftwood, stones, shells, what washes up) under plain light. Run in a browser; the pictures
// are left in window.__shots for a headless browser to collect.
import * as THREE from 'three';
import { LOCATIONS } from '../data/locations';
import { studio } from '../ui/thumbs';
import { U } from '../render/common';
import { driftwoodGeo, shellGeo, stoneGeo } from '../robots/items';

const loc: any = LOCATIONS.find((l) => l.id === 'kayama');
const out: Record<string, string> = {};
const views: Record<string, [number, number, number]> = { turtle: [0.9, 0.75, 0.9], octopus: [0.8, 0.9, 1] };
for (const s of loc.species) out[s.id] = studio(loc, s.id, s.shape === 'hammer' ? [0.35, 1, 0.12] : [1, 0.22, 0.55], 0.78, null, {}, 520, 320, null);
for (const b of loc.birds) out[b.id] = studio(loc, b.id, [0.55, 0.9, 0.75], 0.9, null, {}, 520, 320, null);
for (const id of ['turtle', 'octopus']) out[id] = studio(loc, id, views[id], 0.8, null, {}, 520, 320, null);
U.uLodR.value = -1;   // (the light coral forms give way to the detailed ones near the camera: here, never)
for (const k of ['branch:1', 'table', 'brain:1', 'mushroom', 'anemone', 'clam']) out['coral:' + k.split(':')[0]] = studio(loc, 'coral:' + k, [0.2, 0.55, 1], 0.85, null, {}, 520, 320, null);

// the island's things
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
r.setSize(520, 320, false); r.outputColorSpace = THREE.SRGBColorSpace;
const std = (c: number, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
const things: Record<string, [THREE.BufferGeometry, THREE.Material]> = {
  wood: [driftwoodGeo(), std(0x9b8467)], stone: [stoneGeo(), std(0x8a8378, 0.9)], shell: [shellGeo(), std(0xe9dcc6, 0.6)],
  coconut: [new THREE.SphereGeometry(0.12, 18, 14), std(0x6b4a2b)], pumice: [new THREE.DodecahedronGeometry(0.1, 0), std(0xd9d4c7)],
  bone: [new THREE.CylinderGeometry(0.035, 0.05, 0.3, 12), std(0xeee6d4)], seabean: [new THREE.SphereGeometry(0.08, 18, 10).scale(1, 0.45, 0.85), std(0x4a2c1c, 0.5)],
  // what Dot brings home (as the island draws them: residents.ts STORE_LOOK)
  raw_clay: [new THREE.SphereGeometry(0.22, 18, 12).scale(1, 0.55, 1), std(0x8a6a4c, 1)],
  reed: [new THREE.CylinderGeometry(0.09, 0.09, 1.3, 14), std(0xc8b878, 1)], limestone: [new THREE.DodecahedronGeometry(0.18), std(0xe8e4d8, 0.9)],
};
{ const g = new THREE.Group(); for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 10), std(0xa8b060, 0.7)); m.rotation.z = Math.PI / 2; m.position.set(0, (k % 2) * 0.06, -0.08 + k * 0.05); g.add(m); } (things as any).bamboo = [null, null, g]; }
for (const [id, [g, m, obj]] of Object.entries(things) as any) {
  const scene = new THREE.Scene(); const mesh = obj ?? new THREE.Mesh(g, m); if (id === 'wood') mesh.rotation.z = Math.PI / 2.2; if (id === 'bone' || id === 'reed') mesh.rotation.z = 1.2; scene.add(mesh);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a888, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1, 2, 1.5); scene.add(sun);
  const box = new THREE.Box3().setFromObject(mesh), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  const cam = new THREE.PerspectiveCamera(28, 520 / 320, 0.001, 50); cam.position.copy(c).add(new THREE.Vector3(0.5, 0.55, 1).normalize().multiplyScalar(size * 2.1)); cam.lookAt(c);
  r.setClearColor(0, 0); r.clear(); r.render(scene, cam); out[id] = r.domElement.toDataURL('image/png');
}
(window as any).__shots = out;
document.body.innerHTML = Object.entries(out).map(([k, v]) => `<figure style="display:inline-block;margin:4px"><img src="${v}" width="260"><figcaption>${k}</figcaption></figure>`).join('');
