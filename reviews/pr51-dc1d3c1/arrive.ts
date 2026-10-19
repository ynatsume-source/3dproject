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
import { SAIL_RAFT_ISLAND_ID } from '../src/science/prototypes/sail-raft-rules';
// the host's rule (robots/sail-voyage-host.ts): heading toward the goal each cell, "there" within 50 m; paddling cells (no measured wind)
const NEAR = 50_000, ISL = 390_000;   // (one 30 s world cell = 390 s of the island's clock)
const stuck: string[] = []; let ok = 0;
for (let km10 = 10; km10 <= 40; km10++) for (const bearing of [0, 45, 90, 200, 237]) {
  const km = km10 / 10, b = bearing * Math.PI / 180, mm = Math.round(km * 1e6), target = { e: Math.round(mm * Math.sin(b)), n: Math.round(mm * Math.cos(b)) };
  const m = createCheckpointVoyage(rig(), SAIL_RAFT_ISLAND_ID, vc); let s = m.start(), phase = 'out', i = 0, done = false;
  for (; i < 2000 && !done; i++) {
    const p: any = m.project(s), goal = phase === 'out' ? target : { e: 0, n: 0 };
    const de = goal.e - p.distance.eastMm, dn = goal.n - p.distance.northMm;
    const heading = ((Math.round(Math.atan2(dn, de) * 180 / Math.PI) % 360) + 360) % 360;
    s = m.step(s, { ...cell(i), fromIslandMs: vc.openedAtIslandMs + i * ISL, toIslandMs: vc.openedAtIslandMs + (i + 1) * ISL, windMmS: null, windToDeg: null, gustMmS: null, rain: null, headingDeg: heading, sailUp: false } as any);
    const q: any = m.project(s), g2 = phase === 'out' ? target : { e: 0, n: 0 }, d = Math.hypot(g2.e - q.distance.eastMm, g2.n - q.distance.northMm);
    if (d <= NEAR) { if (phase === 'out') phase = 'back'; else done = true; }
  }
  if (done) ok++; else stuck.push(`${km}km@${bearing}°(${phase})`);
}
console.log(`paddle-only crossings home within 2000 cells: ${ok}; never home: ${stuck.length}`);
console.log('examples:', stuck.slice(0, 12).join(' '));
