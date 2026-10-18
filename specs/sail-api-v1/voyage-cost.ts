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
const big=createSailRaftVoyage(rig(),ID,vc); let st=big.start(); const marks=[1,120,360,720];
for(let i=0;i<720;i++){const t=performance.now(); st=big.commit(st,cell(i)); const ms=performance.now()-t; if(marks.includes(i+1)) console.log(`cell ${i+1}: commit ${ms.toFixed(1)} ms, state ${JSON.stringify(st).length} chars`);}
const t2=performance.now(); big.project(st); big.observe(st); console.log(`project+observe at 720: ${(performance.now()-t2).toFixed(1)} ms`);
