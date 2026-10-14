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
// Behavioral probe uses the unmodified fresh world, not the synthetic display state.
const cam = new THREE.Vector3(61, 10, -145), trace = [];
for (let n = 0; n < 120; n++) {
  sim += 500;
  R.update(0.5, sim, cam);
  await Promise.resolve(); await Promise.resolve();
  trace.push(R.list.map((r: any) => ({ id: r.id, pos: r.pos.toArray(), act: r.act, task: r.task?.kind, holding: r.holding, hunger: r.hunger, sleepy: r.sleepy, stats: { ...r.stats } })));
}
R.save();
const sha = (v: any) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fingerprint: any = {worldSha256:sha(worldBefore), buildRandom, after60Seconds: { draws, hash }, behaviorSha256: sha(trace), saveSha256: sha(JSON.parse(store.get(key)!)), fixtureSha256: sha(save), fixtureState: readFirewoodState(save) };
const dot=R.list.find((r:any)=>r.id==='dot');
const target=R.T.forest.standingNear(61,-145,25)[0];
O.shore.forest.update(new THREE.Vector3(target.x,target.y,target.z),85);
const look=R.T.forest.look?.(target.x,target.z);let disposed=false;
if(look){
 let matched=false;O.group.traverse((o:any)=>{if(o.isInstancedMesh&&o.geometry===look.geo){for(let i=0;i<o.count;i++){const a=o.instanceMatrix.array.slice(i*16,i*16+16);if(Math.abs(a[12]-target.x)<.001&&Math.abs(a[14]-target.z)<.001){if(!a.every((x:number,k:number)=>x===look.matrix[k]))throw Error('Standing/falling transform mismatch');matched=true;}}}});
 if(!matched)throw Error('Standing tree geometry not found');look.geo.addEventListener('dispose',()=>disposed=true);
}
const n0=draws;dot.pos.set(target.x+1,target.y,target.z+1);dot.task={kind:'fell',x:dot.pos.x,z:dot.pos.z,act:'work',dur:0,t:1,arrived:true,data:{x:target.x,z:target.z}};dot.act='work';
sim+=100;R.update(0.1,sim,cam);await Promise.resolve();
R.save();fingerprint.felling={target,draws:draws-n0,random:{draws,hash},felled:R.village.felled,saveSha256:sha(JSON.parse(store.get(key)!))};
if(!R.village.felled.length)throw Error('Felling probe did not complete task');
for(let k=0;k<50;k++){sim+=100;R.update(0.1,sim,cam);await Promise.resolve();}
if(disposed)throw Error('Shared forest geometry disposed by falling cleanup');
R.save();fingerprint.afterFelling={random:{draws,hash},saveSha256:sha(JSON.parse(store.get(key)!))};
// Exercise the actual young-tree action and its original standing/falling/stump pivot.
// Action-only probe requires the precondition of a finished hut; NOT the screenshot fixture.
dot.stats.built=24;dot.task=null;dot.holding='';dot.battery=1;dot.wear=0;
dot.pos.set(62.8,loc.f(62.8,-139.7),-139.7);
R.setBrain(async (input:any)=>input.who==='dot'?{goal:{text:'fixture chop',why:'validation'},plan:['chop:tree#0']}:null);
const mind=R.mind(dot);mind.lastCall=-1e12;mind.why='fixture chop';
let young:any=null;
for(let i=0;i<30&&!young;i++){sim+=500;R.update(.5,sim,dot.pos);await Promise.resolve();await Promise.resolve();if(dot.task?.kind==='chop')young=dot.task.data;}
if(!young)throw Error('Young tree action unavailable');
const geometry=young.pivot.children[1].children.map((m:any)=>m.geometry);
dot.pos.set(dot.task.x,loc.f(dot.task.x,dot.task.z),dot.task.z);dot.task.arrived=true;dot.task.dur=0;dot.task.t=1;
sim+=100;R.update(.1,sim,dot.pos);await Promise.resolve();R.setBrain(null);
if(!young.down||!young.pivot.visible||young.stump.visible)throw Error('Young tree did not enter falling state');
if(!young.pivot.children[1].children.every((m:any,i:number)=>m.geometry===geometry[i]))throw Error('Young tree changed geometry on fall');
for(let i=0;i<40;i++){sim+=100;R.update(.1,sim,dot.pos);await Promise.resolve();}
if(young.pivot.visible||!young.stump.visible)throw Error('Young tree stump transition failed');
R.save();const chopped=JSON.parse(store.get(key)!);if(chopped.trees[0]!==1)throw Error('Young stump missing from save');
fingerprint.youngChop={random:{draws,hash},saveSha256:sha(chopped),trees:chopped.trees,pivot:young.pivot.visible,stump:young.stump.visible};
fs.writeFileSync(path.join(out, 'fingerprint.json'), JSON.stringify(fingerprint, null, 2) + '\n');
console.log(JSON.stringify(fingerprint));
