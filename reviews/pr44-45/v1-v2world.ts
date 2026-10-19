import assert from 'node:assert/strict';
import {draw,drawUint32} from '../src/science/rng';
import {integerSqrt,integerDecayStrength} from '../src/science/prototypes/integer-half-life';
import {SAIL_RAFT_ID as ID,SAIL_RULES as R,equilibriumSpeedMmS,sailForceGf,sailStrength,cosDeg,qualityPpm,
 type PlantMass,type SailMat,type BambooMast} from '../src/science/prototypes/sail-raft-rules';
import {createSailManufacturingModel,type SailManufactureInput,type SailRig} from '../src/science/prototypes/sail-raft-manufacturing';
import {createSailRaftVoyage,createSailWearModel,cordVoyageContext,type SailCell,type VoyageContext} from '../src/science/prototypes/sail-raft-voyage';
import {COIR_CORD_ASSUMPTION_ID as CORD_ID,type CoirPiece} from '../src/science/prototypes/coir-cord-types';
import {createCordDamageModel,createIntegerCordDamageModel,currentIntegerCordStrength} from '../src/science/prototypes/coir-cord-damage';
import type {CoirContext,CoirInterval} from '../src/science/prototypes/coir-cord';

let groups=0;
const test=(s:string,f:()=>void)=>{f();groups++;console.log('PASS '+s);};
const json=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const reject=(f:()=>unknown)=>assert.throws(f);
const leaves=(material:PlantMass['material']='pandanus_standing_leaves',dryMg=1000000,waterMg=2000000):PlantMass=>({lotId:'leaves',material,dryMg,waterMg});
const ctx=(operation:SailManufactureInput['operation'],runId='make',seed=12345):CoirContext=>({worldId:'fixture',worldEpoch:'1',runId,seed,clock:operation==='dry'?'island':'world',openedAtMs:1000});
function receipt(c:CoirContext,a:number,b:number,confirmationId='work'):CoirInterval{
 return {confirmationId,worldId:c.worldId,worldEpoch:c.worldEpoch,runId:c.runId,clock:c.clock,fromMs:a,toMs:b,confirmedAtMs:b,
 ...(c.clock==='island'?{kind:'host-confirmed-roofed-wait' as const}:{kind:'host-confirmed-manual-work' as const,actorId:'worker',attendance:'present' as const})};
}
function make(input:SailManufactureInput,runId='make',seed=12345){
 const c=ctx(input.operation,runId,seed),m=createSailManufacturingModel(input,ID,c);
 return {c,m,at:(t:number)=>m.project(t?m.commit(m.start(),receipt(c,1000,1000+t)):m.start())};
}
const mass=(v:{dryMg:number;waterMg:number})=>BigInt(v.dryMg)+BigInt(v.waterMg);
const mat=():SailMat=>({lotId:'mat',material:'sail_mat',dryMg:900000,waterMg:180000,areaCm2:20000,baseStrengthGf:60000,torn:false,damage:{sunMs:0,shadeMs:0,rainMs:0}});
const mast=():BambooMast=>({lotId:'mast',material:'bamboo_mast',dryMg:2000000,waterMg:100000,lengthMm:2500,baseStrengthGf:40000,broken:false});
const cord=(lotId='cord',lengthMm=8000,baseStrengthGf=100000):CoirPiece=>({lotId,material:'coir_rope',fiberDryMg:lengthMm*17,pithDryMg:0,waterMg:0,lengthMm,baseStrengthGf,damage:{sunMs:0,shadeMs:0,abrasions:0}});
const rig=():SailRig=>({lotId:'rig',material:'sail_raft',hull:{lotId:'hull',material:'raft',dryMg:50000000,waterMg:1000000},mat:mat(),mast:mast(),cords:[cord()],cordUseRemainders:[{lotId:'cord',worldMs:0}]});
const vc:VoyageContext={worldId:'fixture',worldEpoch:'1',runId:'voyage',seed:12345,openedAtWorldMs:1000,openedAtIslandMs:10000};
function cell(i=0,patch:Partial<SailCell>={}):SailCell{
 return {cellId:'cell:'+i,worldId:vc.worldId,worldEpoch:vc.worldEpoch,runId:vc.runId,
 fromWorldMs:vc.openedAtWorldMs+i*30000,toWorldMs:vc.openedAtWorldMs+(i+1)*30000,confirmedAtWorldMs:vc.openedAtWorldMs+(i+1)*30000,
 fromIslandMs:vc.openedAtIslandMs+i*30000,toIslandMs:vc.openedAtIslandMs+(i+1)*30000,aboard:true,windMmS:5000,windToDeg:0,gustMmS:null,headingDeg:0,rain:false,sailUp:true,...patch};
}
import { createCheckpointVoyage } from '../src/science/prototypes/sail-raft-checkpoint';
import { SAIL_RAFT_WORLD_ID, SAIL_RAFT_ISLAND_ID } from '../src/science/prototypes/sail-raft-rules';
let sd = 4242; const rr = (n: number) => { sd = (sd * 1103515245 + 12345) >>> 0; return Math.floor((sd / 4294967296) * n); };
const norm = (x: any) => JSON.parse(JSON.stringify(x));
let voyages = 0, cellsCmp = 0, breaks = 0;
for (let v = 0; v < 120; v++) {
  const r = rig(); r.cords[0].baseStrengthGf = 20000 + rr(60000); r.mat.baseStrengthGf = 20000 + rr(60000); r.mast.baseStrengthGf = 20000 + rr(60000);
  const ctxv = { ...vc, runId: 'v' + v, seed: rr(1e9) };
  const m1 = createSailRaftVoyage(r, ID, ctxv), m2 = createCheckpointVoyage(r, SAIL_RAFT_WORLD_ID, ctxv);
  let s1 = m1.start(), s2 = m2.start(); const n = 10 + rr(50);
  for (let i = 0; i < n; i++) {
    const wind = 9000 + rr(11000), head = rr(61) - 30;
    const c: any = { ...cell(i), runId: ctxv.runId, cellId: 'c' + i, windMmS: wind, windToDeg: 0, headingDeg: (head + 360) % 360,
      gustMmS: rr(3) ? null : wind + rr(15000), rain: !!rr(2), sailUp: true,
      toIslandMs: vc.openedAtIslandMs + (i + 1) * 30000 * 13, fromIslandMs: vc.openedAtIslandMs + i * 30000 * 13 };
    s1 = m1.commit(s1, c); s2 = m2.step(s2, c);
    const p1: any = m1.project(s1), p2: any = m2.project(s2);
    assert.deepEqual(norm(p2.broken).map((b: any) => [b.part, b.lotId, b.cellId]), norm(p1.broken).map((b: any) => [b.part, b.lotId, b.cellId]), `broken v${v} c${i}`);
    assert.deepEqual(norm(p2.maxLoads), norm(p1.maxLoads), `maxLoads v${v} c${i}`);
    if (p1.broken.length) { assert.deepEqual(norm(p2.rig.mat.torn), norm(p1.rig.mat.torn)); assert.deepEqual(norm(p2.rig.mast.broken), norm(p1.rig.mast.broken)); breaks++; cellsCmp++; break; }   // (after a break v1 drifts, v2 paddles: by design)
    assert.equal(p2.distance.eastMm, p1.distance.eastMm, `east v${v} c${i}`);
    assert.equal(p2.distance.northMm, p1.distance.northMm, `north v${v} c${i}`);
    assert.equal(p2.distance.alongHeadingMm, p1.distance.alongHeadingMm, `along v${v} c${i}`);
    assert.equal(p2.sailingMs, p1.sailingMs, `sailingMs v${v} c${i}`);
    assert.deepEqual(norm(p2.maxLoads), norm(p1.maxLoads), `maxLoads v${v} c${i}`);
    assert.deepEqual(norm(p2.broken).map((b: any) => [b.part, b.lotId, b.cellId]), norm(p1.broken).map((b: any) => [b.part, b.lotId, b.cellId]), `broken v${v} c${i}`);
    assert.deepEqual(norm(p2.rig.mat), norm(p1.rig.mat), `mat v${v} c${i}`);
    assert.deepEqual(norm(p2.rig.mast), norm(p1.rig.mast), `mast v${v} c${i}`);
    assert.deepEqual(norm(p2.rig.cords), norm(p1.rig.cords), `cords v${v} c${i}`);
    cellsCmp++;
  }
  voyages++;
}
// the clock switch: the same world time, island interval doubled -> twice the distance under v2-island
{ const r = rig(), a = createCheckpointVoyage(r, SAIL_RAFT_ISLAND_ID, vc); let s1 = a.start(), s2 = a.start(); const b = createCheckpointVoyage(r, SAIL_RAFT_ISLAND_ID, { ...vc, runId: 'v2x' }); s2 = b.start();
  for (let i = 0; i < 10; i++) { const base: any = { ...cell(i), windMmS: null, windToDeg: null, gustMmS: null, rain: null, sailUp: false };
    s1 = a.step(s1, { ...base, toIslandMs: vc.openedAtIslandMs + (i + 1) * 60000, fromIslandMs: vc.openedAtIslandMs + i * 60000 });
    s2 = b.step(s2, { ...base, runId: 'v2x', toIslandMs: vc.openedAtIslandMs + (i + 1) * 120000, fromIslandMs: vc.openedAtIslandMs + i * 120000 }); }
  const d1 = (a.project(s1) as any).distance.alongHeadingMm, d2 = (b.project(s2) as any).distance.alongHeadingMm;
  console.log('paddle 10 cells, island 60s vs 120s per cell:', d1, d2); assert.equal(d2, 2 * d1); assert.equal(d1, 556 * 600); }
console.log(`PASS v1(world) == v2-world checkpoint: voyages ${voyages}, cells compared ${cellsCmp}, voyages ending in a break ${breaks}`);
