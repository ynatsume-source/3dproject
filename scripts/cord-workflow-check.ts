import assert from 'node:assert/strict';
import { newCordSession,applyCordCommand,restoreCordSession,projectCordWorkflow,cordResidentMemory,type CordCommand,type CordSession } from '../src/world/prototypes/cord-workflow';
import { addLot,emptyLedger,toClock,toReal } from '../src/world/process-runner';
import type { HuskAssumptions } from '../src/science/prototypes/coconut-husk';
import { readFileSync,writeFileSync } from 'node:fs';
const T=Date.UTC(2026,9,14);
const A:HuskAssumptions={eligibleMs:60_000,minTempC:10,maxTempC:40,fiberPpm:333333,minWaterPpm:1_000_000,capacityMg:10_000_000,waterPolicy:'unclassified-test-water',recovery:'unmodelled-fixture-separation',loss:'return-husk-spill-water'};
const plan={inspectionAfterIslandMs:60_000,recoveryWorkWorldMs:12_000,maxBoutWorldMs:5_000};
const weather=(at:number)=>({sampleId:'fixture',source:'simulation' as const,effectiveAt:at,airTempC:25});
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
function fixture() {
 const L=emptyLedger('workflow-test','e1');
 for(const id of ['a','b']) {
  addLot(L,{lotId:`h:${id}`,materialId:'coconut_husk',amount:{value:1_000_003,unit:'mg'},quality:{water_ppm:400000},location:'test'});
  addLot(L,{lotId:`w:${id}`,materialId:'process_water',amount:{value:2_000_007,unit:'mg'},location:'test'});
  L.equipment[`basin:${id}`]={equipmentId:`basin:${id}`,kind:'fixture_coir_basin',catalogEntry:'test',catalogVersion:'test',condition:1,params:{capacityMg:A.capacityMg}};
 }
 return newCordSession(L,T);
}
let count=0;
function act(s:CordSession,cmd:Omit<CordCommand,'sequence'>|any) {const before=JSON.stringify(s);const r=applyCordCommand(s,{...cmd,sequence:s.sequence+1},weather);assert.equal(JSON.stringify(s),before);count++;return r;}
const start=(s:CordSession,id:string,actor='dot',p=plan)=>act(s,{type:'start',job:id,actor,lots:[`h:${id}`,`w:${id}`],equipment:`basin:${id}`,plan:p,assumptions:A});
const tick=(s:CordSession,atWorld:number)=>act(s,{type:'tick',atWorld});
const begin=(s:CordSession,job='a',actor='dot')=>act(s,{type:'begin',job,actor});
const total=(s:CordSession)=>Object.values(s.ledger.lots).reduce((n,l)=>n+l.amount.value,0)+(s.ledger.released??[]).reduce((n,l)=>n+l.mg,0);
let s=start(fixture(),'a');const snapshots:any[]=[projectCordWorkflow(s)];
assert.equal(projectCordWorkflow(s)[0].actor,null);assert.equal(s.ledger.lots['h:a'].reservedBy,s.jobs.a.runId);
assert.throws(()=>start(s,'a'));assert.throws(()=>applyCordCommand(s,{type:'tick',atWorld:T,sequence:s.sequence},weather));
const ready=toReal('island',s.jobs.a.startIsland+120_000)+1;
s=start(s,'b','lantern');s=tick(s,ready);assert.equal(s.jobs.a.phase,'checking');
// One resident is free during another batch's passive wait; two residents can work on separate batches.
s=begin(s);assert.throws(()=>begin(s,'b','dot'));s=begin(s,'b','lantern');
s=tick(s,s.nowWorld+2_000);assert.equal(s.jobs.a.workedWorldMs,2_000);assert.equal(s.jobs.b.workedWorldMs,2_000);
s=act(s,{type:'interrupt',job:'a',actor:'dot'});assert.equal(projectCordWorkflow(s)[0].actor,null);
const saved=JSON.stringify(s);const restored=restoreCordSession(saved,s.nowWorld+100_000);
assert.equal(restored.jobs.a.workedWorldMs,2_000);assert.equal(restored.jobs.b.workedWorldMs,2_000);assert.equal(restored.jobs.b.lease,null);
assert.equal(JSON.stringify(s),saved);assert.equal((restored.ledger.runs[restored.jobs.a.runId].state!.data as any).completeHistory,false);
s=restored;snapshots.push(projectCordWorkflow(s));
for(let i=0;i<2;i++){s=begin(s);s=tick(s,s.nowWorld+5_000);assert.equal(s.jobs.a.lease,null);}
assert.equal(s.jobs.a.workedWorldMs,12_000);
if(s.jobs.a.phase==='settling')assert.throws(()=>act(s,{type:'cancel',job:'a',actor:'dot'}));
s=tick(s,s.nowWorld+10_000);assert.equal(s.jobs.a.phase,'recovered');assert.equal(total(s),6_000_020);
assert.ok(s.jobs.a.outputLotIds.every(id=>!s.ledger.lots[id].reservedBy));assert.ok(!s.ledger.equipment['basin:a'].reservedBy);
assert.equal(s.ledger.lots['h:b'].reservedBy,s.jobs.b.runId);assert.throws(()=>begin(s));
const receipts=s.ledger.committed.length;s=tick(s,s.nowWorld+1_000);
assert.equal(s.jobs.a.outputLotIds.length,3);assert.equal(total(s),6_000_020);assert.ok(s.ledger.committed.length>=receipts);
assert.ok(Object.values(s.ledger.lots).every(l=>l.materialId!=='rope'&&l.materialId!=='cord'));snapshots.push(projectCordWorkflow(s));
// A cancelled unfinished batch settles via PR12 and returns its reserved materials once.
s=act(s,{type:'cancel',job:'b',actor:'lantern'});assert.equal(s.jobs.b.phase,'stopped');assert.equal(total(s),6_000_020);
assert.throws(()=>act(s,{type:'cancel',job:'b',actor:'lantern'}));assert.ok(Object.values(s.ledger.lots).every(l=>!l.reservedBy));
// Observation is commanded once; polling cannot create senses, memories or advance physics.
let observed=start(fixture(),'a');observed=act(observed,{type:'look',job:'a',actor:'dot'});observed=tick(observed,ready);
assert.ok(cordResidentMemory(observed,'dot').some(x=>x.text==='殻が水に浸かっている。'));
assert.deepEqual(cordResidentMemory(observed,'stranger'),[]);
const frozen=JSON.stringify(observed);for(let i=0;i<1000;i++)projectCordWorkflow(observed);assert.equal(JSON.stringify(observed),frozen);
const hidden=clone(observed);(hidden.ledger.runs[hidden.jobs.a.runId].state!.data as any).eligible=0;
(hidden.ledger.runs[hidden.jobs.a.runId].state!.data as any).completeHistory=false;
assert.deepEqual(projectCordWorkflow(hidden),projectCordWorkflow(observed));assert.deepEqual(cordResidentMemory(hidden,'dot'),cordResidentMemory(observed,'dot'));
const exposed=JSON.stringify(projectCordWorkflow(s));assert.ok(!/eligible|fiberPpm|TempC|completeHistory|binding/.test(exposed));
// Same continuous work, different tick partitions: exact credit, output and memory (no observation requests).
function finish(parts:number[]) {let x=start(fixture(),'a');x=tick(x,ready);for(let bout=0;bout<3;bout++){x=begin(x);const at=x.nowWorld;for(const delta of parts)x=tick(x,at+delta);}return tick(x,x.nowWorld+10_000);}
const lump=finish([5000]),split=finish([1234,5000]);
assert.deepEqual(Object.values(lump.ledger.lots),Object.values(split.ledger.lots));assert.equal(lump.jobs.a.workedWorldMs,split.jobs.a.workedWorldMs);assert.deepEqual(lump.memory,split.memory);
// A planned reminder and an animation cannot force missing physical processing to complete.
let gap=start(fixture(),'a');gap=restoreCordSession(JSON.stringify(gap),ready+100_000);
assert.equal(gap.jobs.a.phase,'checking');assert.equal((gap.ledger.runs[gap.jobs.a.runId].state!.data as any).eligible,0);
for(let i=0;i<3;i++){gap=begin(gap);gap=applyCordCommand(gap,{type:'tick',atWorld:gap.nowWorld+5_000,sequence:gap.sequence+1},at=>({sampleId:'missing',source:'unknown',effectiveAt:at}));}
gap=applyCordCommand(gap,{type:'tick',atWorld:gap.nowWorld+10_000,sequence:gap.sequence+1},at=>({sampleId:'missing',source:'unknown',effectiveAt:at}));
assert.equal(gap.jobs.a.phase,'recovered');assert.ok(gap.jobs.a.outputLotIds.some(id=>gap.ledger.lots[id].materialId==='coconut_husk'));
assert.ok(!gap.jobs.a.outputLotIds.some(id=>gap.ledger.lots[id].materialId==='plant_fiber'));
// Long waits catch up beyond the host's 400-cell per-call cap without inventing hand work.
let long=start(fixture(),'a');long=tick(long,long.nowWorld+3_600_000);assert.equal(long.jobs.a.workedWorldMs,0);
assert.ok(toClock('island',long.nowWorld)-long.ledger.runs[long.jobs.a.runId].lastTo<30_000);
for(const mutate of [(x:any)=>x.jobs.a.plan=null,(x:any)=>x.jobs.a.workedWorldMs=-1,(x:any)=>x.jobs.a.runId='missing']) {const corrupt=clone(observed);mutate(corrupt);assert.throws(()=>restoreCordSession(JSON.stringify(corrupt),corrupt.nowWorld));}
const source=readFileSync(new URL('../src/world/prototypes/cord-workflow.ts',import.meta.url),'utf8');assert.ok(!/optionsFor\(|sense\(/.test(source));
let observers=start(fixture(),'a');observers=act(observers,{type:'look',job:'a',actor:'dot'});
const offline=restoreCordSession(JSON.stringify(observers),ready);
assert.ok(!cordResidentMemory(offline,'dot').some(x=>x.text==='殻が水に浸かっている。'));
observers=act(observers,{type:'look',job:'a',actor:'lantern'});observers=tick(observers,ready);
for(const actor of ['dot','lantern'])assert.equal(cordResidentMemory(observers,actor).filter(x=>x.text==='殻が水に浸かっている。').length,1);
assert.throws(()=>act(observers,{type:'not-a-command',job:'a',actor:'dot'}));
assert.match(projectCordWorkflow(gap)[0].next,/未分離/);
assert.match(projectCordWorkflow(gap)[0].stopReason!,/環境記録/);
assert.ok(!cordResidentMemory(gap,'dot').some(m=>m.text.includes('環境記録')));
if(process.env.CORD_SNAPSHOT_OUT)writeFileSync(process.env.CORD_SNAPSHOT_OUT,JSON.stringify(snapshots,null,2));
console.log(`PASS cord workflow: ${count} immutable command checks; passive release, parallel work, interruption, JSON restore, conservation, retries, read-only projection and hidden-state isolation`);
