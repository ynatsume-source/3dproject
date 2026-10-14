// Synthetic fixture and behavior/random fingerprint. Never reads user browser storage.
// node --import tsx --import ./scripts/node-assets.mjs tools/lab/firewood-fixture.ts OUTPUT_DIR
import '../../scripts/node-land';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { readFirewoodState } from './firewood-state.mjs';

const out = process.argv[2];
if (!out) throw Error('Pass an output directory');
fs.mkdirSync(out, { recursive: true });
let sim = Date.parse('2026-10-10T03:00:00Z');
Date.now = () => sim;
Object.defineProperty(globalThis.performance, 'now', { value: () => (sim % 86400000), configurable: true });
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
// Only repository-owned local assets are available in this headless study.
const assetFetch = globalThis.fetch;
globalThis.fetch = ((u: any, i: any) => typeof u === 'string' && u.startsWith('/') ? assetFetch(u, i) : Promise.reject(Error('External request blocked by study'))) as any;
const { mulberry32 } = await import('../../src/core/math');
const random = mulberry32(11); let draws = 0, hash = 2166136261;
Math.random = () => { const v = random(); draws++; hash = Math.imul(hash ^ (v * 4294967296 >>> 0), 16777619) >>> 0; return v; };
const { loadLand } = await import('../../src/ocean/land');
const { DOTWORLD } = await import('../../src/data/locations');
const loc: any = DOTWORLD;
await loadLand('kayama', loc.land.half, loc.land.far);
const { buildOcean } = await import('../../src/ocean/build');
const fakeEl = () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {} });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: fakeEl, createElementNS: fakeEl, getElementById: () => null } });
const O: any = buildOcean(loc), R: any = O.residents;
R.setBrain(null);
const buildRandom = { draws, hash };
R.save();
const key = 'seaglass.residents.v1';
const save = JSON.parse(store.get(key)!);
// Clearly synthetic display fixture: roof + 24kg shelf lot + one real nearby tree marked felled.
save.lab.equipment['eq:firewood_stack'] = { equipmentId: 'eq:firewood_stack', kind: 'firewood_stack', catalogEntry: 'firewood_stack', catalogVersion: 'civ-sci-test-2', condition: 1, params: { covered: 1, sunExposure: 0, topAreaM2: 0.2 } };
save.lab.lots['lot:firewood-study'] = { lotId: 'lot:firewood-study', materialId: 'firewood', amount: { value: 24000000, unit: 'mg' }, location: 'shelf', quality: { water_ppm: 450000 } };
const tree = R.T.forest.standingNear(61, -145, 25).sort((a: any, b: any) => Math.hypot(a.x - 61, a.z + 145) - Math.hypot(b.x - 61, b.z + 145))[0];
if (!tree) throw Error('Fixture requires an actual forest tree within 25m');
save.village.felled = [{ x: tree.x, z: tree.z, kind: tree.kind, h: tree.h, at: sim }];
fs.writeFileSync(path.join(out, 'fixture.json'), JSON.stringify(save, null, 2) + '\n');
const worldBefore = {shore: O.shore.lists, trees: R.T.forest.standingNear(61,-145,100), solids: [] as any[]};
R.solids.each(61,-145,100,(s:any)=>worldBefore.solids.push({...s}));
fs.writeFileSync(path.join(out,'world.json'),JSON.stringify(worldBefore,null,2));
// Reconstruct the recorded camera on the CPU; do not change the renderer or its culling rules.
const capture=JSON.parse(fs.readFileSync(process.argv[3],'utf8')).measurements.find((m:any)=>m.id==='phone-home-near-day');
if(!capture)throw Error('Phone capture required');
const camera=new THREE.PerspectiveCamera();camera.position.fromArray(capture.camera);camera.rotation.fromArray(capture.rotation);camera.projectionMatrix.fromArray(capture.projection);camera.updateMatrixWorld(true);
const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
O.group.updateMatrixWorld(true);const crowns:any[]=[];
O.group.traverse((o:any)=>{if(o.position.y===2.3&&o.children.length===4&&o.children.every((m:any)=>m.isMesh&&m.geometry.type==='SphereGeometry'))crowns.push(o)});
if(crowns.length!==5)throw Error('Expected exactly five resident young crowns');
const meshes=crowns.flatMap((o:any,i:number)=>o.children.map((m:any,k:number)=>({tree:i,slot:k,world:m.getWorldPosition(new THREE.Vector3()).toArray(),triangles:m.geometry.index.count/3,inFrustum:frustum.intersectsObject(m)})));
const result={note:'CPU Three.Frustum test using the exact recorded phone camera. No production culling changes.',camera: capture.camera,projection:capture.projection,meshes,visible:meshes.filter((m:any)=>m.inFrustum).length,triangles:meshes.filter((m:any)=>m.inFrustum).reduce((n:number,m:any)=>n+m.triangles,0)};
fs.writeFileSync(path.join(out,'frustum.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
