// Build-time fixture runner. The browser receives only frozen read-only projections.
import assert from 'node:assert/strict';
import { newCordSession,applyCordCommand,projectCordWorkflow,type CordSession } from '../src/world/prototypes/cord-workflow';
import { emptyLedger,addLot,toReal } from '../src/world/process-runner';
const T=Date.UTC(2026,9,14);
const assumptions={eligibleMs:60_000,minTempC:10,maxTempC:40,fiberPpm:333333,minWaterPpm:1_000_000,capacityMg:10_000_000,waterPolicy:'unclassified-test-water',recovery:'unmodelled-fixture-separation',loss:'return-husk-spill-water'} as const;
const plan={inspectionAfterIslandMs:60_000,recoveryWorkWorldMs:12_000,maxBoutWorldMs:5_000};
const weather=(at:number)=>({sampleId:'fixture',source:'simulation' as const,effectiveAt:at,airTempC:25});
const act=(s:CordSession,c:any)=>applyCordCommand(s,{...c,sequence:s.sequence+1},weather);
function setup() {const l=emptyLedger('worksite-preview','fixture');for(const id of ['a','b']){
 addLot(l,{lotId:`h:${id}`,materialId:'coconut_husk',amount:{value:1_000_003,unit:'mg'},quality:{water_ppm:400000},location:'fixture'});
 addLot(l,{lotId:`w:${id}`,materialId:'process_water',amount:{value:2_000_007,unit:'mg'},location:'fixture'});
 l.equipment[`basin:${id}`]={equipmentId:`basin:${id}`,kind:'fixture_coir_basin',catalogEntry:'test',catalogVersion:'test',condition:1,params:{capacityMg:10_000_000}};
 }return newCordSession(l,T);}
const start=(s:CordSession,id:string,wait=60_000)=>act(s,{type:'start',job:id,actor:'dot',lots:[`h:${id}`,`w:${id}`],equipment:`basin:${id}`,plan:{...plan,inspectionAfterIslandMs:wait},assumptions});
const tick=(s:CordSession,atWorld:number)=>act(s,{type:'tick',atWorld});
const begin=(s:CordSession,id='a')=>act(s,{type:'begin',job:id,actor:'dot'});
export function worksiteFrames() {
 const frames:any[]=[];
 const capture=(id:string,label:string,s:CordSession,error:string|null=null)=>{
   const before=JSON.stringify(s);const jobs=projectCordWorkflow(s);
   for(let i=0;i<1000;i++)projectCordWorkflow(s);
   assert.equal(JSON.stringify(s),before);
   // ETA and uncalibrated work seconds intentionally do not reach this viewer.
   frames.push({id,label,error,jobs:jobs.map(({estimate,...publicJob})=>publicJob)});
 };
 let passive=start(start(setup(),'a',600_000),'b');
 passive=tick(passive,toReal('island',passive.jobs.b.startIsland+120_000)+1);passive=begin(passive,'b');
 capture('parallel','浸漬・別の作業',passive);
 let s=start(setup(),'a');s=tick(s,toReal('island',s.jobs.a.startIsland+120_000)+1);capture('check','取り出して確認',s);
 s=begin(s);s=tick(s,s.nowWorld+2_000);capture('working','手作業中',s);
 s=act(s,{type:'interrupt',job:'a',actor:'dot'});capture('paused','中断・続きあり',s);
 for(let i=0;i<2;i++){s=begin(s);s=tick(s,s.nowWorld+5_000);}s=tick(s,s.nowWorld+10_000);capture('recovered','回収済み・縄は未完成',s);
 const missing=setup();delete missing.ledger.lots['w:a'];const before=JSON.stringify(missing);
 assert.throws(()=>act(missing,{type:'start',job:'a',actor:'dot',lots:['h:a'],equipment:'basin:a',plan,assumptions}),/invalid start/);
 assert.equal(JSON.stringify(missing),before);assert.equal(missing.memory.length,0);
 capture('missing','水不足・開始前',missing,'水が揃わず開始できない');
 assert.equal(frames[0].jobs[0].phase,'soaking');assert.equal(frames[0].jobs[1].actor,'dot');
 return frames;
}
