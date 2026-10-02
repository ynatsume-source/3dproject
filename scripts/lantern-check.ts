// Lantern's legs: a planted foot stays put while the body walks over it (no sliding, no sinking), the
// footing check reaches a fore foot out, and the box turns to what it looks at.
// npx tsx --import ./scripts/node-assets.mjs scripts/lantern-check.ts [speed m/s]
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { robotKit } from '../src/robots/models';
const m = () => new THREE.MeshStandardMaterial();
const C: any = new Proxy({}, { get: (o: any, k) => (o[k] ??= m()) });
const kit: any = robotKit(C);
const r = kit.makeLantern();
const toes: THREE.Object3D[] = [];
r.root.traverse((o: any) => { if (o.isMesh && o.geometry.type === 'SphereGeometry' && Math.abs(o.geometry.parameters.radius - 0.042) < 1e-6) toes.push(o); });
const v = new THREE.Vector3(), dt = 1 / 60, speed = Number(process.argv[2] ?? 0.8);
let s = 0, worst = 0, maxLift = 0, minY = 1, maxY = -1;
const planted: (THREE.Vector3 | null)[] = [null, null, null, null];
for (let i = 0; i < 600; i++) {
  s += speed * dt; r.root.position.z = s;
  r.update(i * dt, dt, { act: 'walk', walk: 1, stride: s });
  r.root.updateMatrixWorld(true);
  toes.forEach((t, k) => {
    t.getWorldPosition(v);
    if (i > 60) { minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
    const down = v.y < 0.001;   // (bearing weight: the toe ball's radius above the ground)
    if (down) { if (planted[k]) worst = Math.max(worst, Math.hypot(v.x - planted[k]!.x, v.z - planted[k]!.z)); else planted[k] = v.clone(); }
    else planted[k] = null;
  });
}
console.log({ speed, toes: toes.length, slideWhilePlanted_mm: +(worst * 1000).toFixed(1), toeY_range: [+minY.toFixed(3), +maxY.toFixed(3)] });
assert.equal(toes.length, 4); assert.ok(worst < 0.003, 'a planted foot slides'); assert.ok(minY > -0.01, 'a foot sinks'); assert.ok(maxY > 0.05, 'feet are lifted to step');
// a footing check: the fore foot out and back
let pmax = 0; for (let i = 0; i <= 90; i++) { r.update(10 + i * dt, dt, { act: 'walk', walk: 0, stride: s, probe: i / 90 }); r.root.updateMatrixWorld(true); toes[1].getWorldPosition(v); pmax = Math.max(pmax, v.z - s); }
console.log({ probeReach: +pmax.toFixed(3) });
assert.ok(pmax > 0.5, 'the fore foot reaches out to try the footing');
for (let i = 0; i < 120; i++) r.update(20 + i * dt, dt, { act: 'look', walk: 0, look: [-3, 0.3, 5] });
let topG: any = null; r.root.traverse((o: any) => { if (o.isGroup && Math.abs(o.position.y - 0.48) < 0.05 && o.children.length >= 5) topG = o; });
console.log({ topYaw: topG?.rotation.y });
assert.ok(Math.abs(topG.rotation.y + 0.54) < 0.05, 'the box turns to look'); console.log('lantern-check: PASS');
