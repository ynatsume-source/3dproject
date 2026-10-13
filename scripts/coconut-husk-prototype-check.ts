import assert from 'node:assert/strict';
import { createHuskPrototype, HUSK_PROTOTYPE, readHuskPrototypeLot, type HuskAssumptions } from '../src/science/prototypes/coconut-husk';
import type { ScienceStepRequest as Request, ScienceState } from '../src/world/science-contract';
import { validateResult } from '../src/science/step/validate';
import { EXECUTABLE_PROCESSES } from '../src/science/step';
import { coconutMilkStep, COCONUT_MILK_PROCESS } from '../src/science/step/coconut';
import { emptyLedger, addLot, startRun, commit, toClock } from '../src/world/process-runner';

const assumptions: HuskAssumptions = { eligibleMs: 3_600_000, minTempC: 10, maxTempC: 40,
  fiberPpm: 333333, minWaterPpm: 1_000_000, capacityMg: 10_000_000,
  waterPolicy: 'unclassified-test-water', recovery: 'unmodelled-fixture-separation', loss: 'return-husk-spill-water' };
const step = createHuskPrototype(assumptions);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
function request(from = 0, to = 3_600_000, state: ScienceState | null = null): Request {
  return { contract: '0.2.1', requestId: `req:${from}`, runId: 'run:test', world: { worldId:'test',worldEpoch:'e1',worldVersion:0 },
    processId: HUSK_PROTOTYPE, processVersion: '0.0.1', catalogVersion: 'civ-sci-test-2', interval: { from, to }, state,
    environment: { sampleId:'env:test',source:'simulation',effectiveAt:0,airTempC:25 },
    lots: [{lotId:'husk',materialId:'coconut_husk',amount:{value:1_000_003,unit:'mg'},quality:{water_ppm:400000},location:'test'},
      {lotId:'water',materialId:'process_water',amount:{value:2_000_007,unit:'mg'},location:'test'}],
    equipment: [{equipmentId:'basin',kind:'fixture_coir_basin',catalogEntry:'test',catalogVersion:'test',condition:1,params:{capacityMg:assumptions.capacityMg}}],
    energy:[],actions:[],seed:1 };
}
let checks = 0;
function run(req: Request) { const r = step(req); assert.deepEqual(validateResult(req,r),[]); checks++; return r; }
const original=request(),before=clone(original);const whole = run(original);assert.deepEqual(original,before);
let state: ScienceState | null = null;
for (let t=0;t<3_600_000;t+=420_000) state = run(request(t,Math.min(t+420_000,3_600_000),state)).state;
assert.deepEqual(state,whole.state);
const mid = run(request(0,12_345));
assert.deepEqual(run(request(12_345,3_600_000,clone(mid.state))).state,whole.state);
const looked = request(); looked.actions=[{at:12_345,residentId:'test',action:'look'}];
const observed = run(looked); assert.deepEqual(observed.state,whole.state); assert.equal(observed.observations.length,1);
assert.ok(observed.observations.every(x => x.value === undefined && x.quantity === undefined));
const gap = request(12_345,30_000,clone(mid.state)); gap.environment={sampleId:'missing',source:'unknown',effectiveAt:12_345};
const held = run(gap); assert.equal((held.state.data as any).eligible,30_000);
gap.interval={from:30_000,to:60_000}; gap.state=held.state;
const missing = run(gap); assert.equal((missing.state.data as any).eligible,30_000); assert.equal((missing.state.data as any).completeHistory,false);
const resumed = run(request(60_000,90_000,missing.state)); assert.equal((resumed.state.data as any).eligible,60_000); assert.equal((resumed.state.data as any).completeHistory,false);
for(const stop of ['world-pause','shutdown','operator','equipment-lost'] as const) {
  const req=request(12_345,3_600_000,mid.state);req.stop=stop;if(stop==='equipment-lost')req.equipment=[];
  const r=run(req);const terminal=stop==='operator'||stop==='equipment-lost';
  assert.equal(r.status,terminal?'stopped':'running');assert.equal(r.consumed.length,terminal?2:0);
  if(terminal)assert.equal(r.produced.find(x=>x.materialId==='coconut_husk')?.amount.value,1_000_003);
  if(stop==='equipment-lost')assert.equal(r.released[0].amount.value,2_000_007);
}
const recover=request(3_600_000,3_630_000,whole.state); recover.actions=[{at:3_600_000,residentId:'test',action:'recover_fixture'}];
const recovered=run(recover);assert.equal(recovered.status,'completed');assert.equal(recovered.produced.length,3);
for(const [i,p] of recovered.produced.entries()) assert.ok(readHuskPrototypeLot({...p,lotId:`output:${i}`,location:'test'}));
assert.equal(run(request(3_600_000,3_630_000,recovered.state)).status,'failed');
const early=request(0,30_000);early.stop='operator';const stopped=run(early);
const newRun=request();newRun.runId='run:new';newRun.lots=stopped.produced.map((p,i)=>({...p,lotId:`returned:${i}`,location:'test'}));
assert.equal(run(newRun).status,'running');
assert.equal((run({...newRun,interval:{from:0,to:1}}).state.data as any).eligible,1);
for(const mutate of [
  (d:any)=>{delete d.cell.known;},(d:any)=>{d.cell.eligible={nested:true};},(d:any)=>{d.cell.start=-1;},
  (d:any)=>{d.cell=null;},(d:any)=>{d.eligible=Infinity;},(d:any)=>{d.binding='forged';},
  (d:any)=>{d.lastTo=0;},(d:any)=>{d.completeHistory=1;},(d:any)=>{d.terminal=true;},
  (d:any)=>{d.eligible=3_600_000;},(d:any)=>{d.equipmentId=null;},
]) { const s=clone(mid.state);mutate(s.data);assert.equal(run(request(12_345,60_000,s)).status,'failed'); }
for(const key of ['processVersion','catalogVersion','contract'] as const) {const q=request();q[key]='unknown';assert.equal(run(q).status,'failed');}
const incompatible=request(12_345,60_000,mid.state); incompatible.lots[0].amount.value++;
assert.equal(run(incompatible).status,'failed');
assert.equal(createHuskPrototype({...assumptions,fiberPpm:-1})(request()).status,'failed');
assert.equal(createHuskPrototype({...assumptions,eligibleMs:4_000_000})(request(12_345,60_000,mid.state)).status,'failed');
assert.ok(!EXECUTABLE_PROCESSES.includes(HUSK_PROTOTYPE));
const milk=request(0,1_200_000);Object.assign(milk,COCONUT_MILK_PROCESS);
milk.lots=[{lotId:'nut',materialId:'coconut',amount:{value:2_000_000,unit:'mg'},location:'test',quality:{count:1}}];
milk.equipment=[{...milk.equipment[0],kind:'fixture_coconut_tools'}];
milk.energy=[{sourceId:'hands',kind:'mechanical',maxJ:36_000}];
const extracted=coconutMilkStep(milk);assert.equal(extracted.status,'completed');assert.deepEqual(validateResult(milk,extracted),[]);
const actualHusk=extracted.produced.find(x=>x.materialId==='coconut_husk')!;
const downstream=request();downstream.lots[0]={...actualHusk,lotId:'real-milk-husk',location:'test'};
assert.equal(run(downstream).status,'running');
const swap=request(12_345,60_000,mid.state);swap.equipment[0].equipmentId='replacement';assert.equal(run(swap).status,'failed');
for(const source of ['stale','unknown'] as const) {const q=request();q.environment.source=source;const r=run(q);assert.equal((r.state.data as any).eligible,0);assert.equal((r.state.data as any).completeHistory,false);}
for(const temperature of [undefined,NaN,Infinity]) {const q=request();q.environment.airTempC=temperature;assert.equal((run(q).state.data as any).eligible,0);}
const cold=request();cold.environment.airTempC=0;const frozen=run(cold);assert.equal((frozen.state.data as any).eligible,0);assert.equal((frozen.state.data as any).completeHistory,true);
const future=request();future.environment.effectiveAt=3_600_001;assert.equal((run(future).state.data as any).eligible,0);
const small=request();small.lots[1].amount.value=1;assert.equal(run(small).status,'failed');
const invalidLot={...newRun.lots[0],quality:{prototype_water_mg:2_000_000}};assert.equal(readHuskPrototypeLot(invalidLot),null);

// The existing ledger supplies reservation, island-clock identity, JSON persistence and exactly-once settlement.
let ledger=emptyLedger('test','e1');const template=request();
for(const l of template.lots)addLot(ledger,l);
ledger.equipment.basin=template.equipment[0];
const started=startRun(ledger,{processId:HUSK_PROTOTYPE,processVersion:'0.0.1',catalogVersion:'civ-sci-test-2',contract:'0.2.1',clock:'island',lotIds:['husk','water'],equipmentIds:['basin'],operator:'test'},Date.UTC(2026,9,13));
assert.ok(started.run);const rr=started.run!;assert.equal(rr.clock,'island');assert.ok(Math.abs(rr.lastTo-toClock('island',Date.UTC(2026,9,13)))<=30_000);
const q={...template,runId:rr.runId,world:ledger.world,requestId:'ledger:1',interval:{from:rr.lastTo,to:rr.lastTo+3_600_000}};
const partial=run(q);assert.ok(commit(ledger,q,partial).ok);ledger=clone(ledger);
const final={...q,requestId:'ledger:2',state:ledger.runs[rr.runId].state,interval:{from:q.interval.to,to:q.interval.to+30_000},actions:[{at:q.interval.to,residentId:'test',action:'recover_fixture'}]};
assert.ok(commit(ledger,final,run(final)).ok);const settled=JSON.stringify(ledger);
assert.equal(commit(ledger,final,run(final)).ok,false);assert.equal(JSON.stringify(ledger),settled);
assert.equal(Object.values(ledger.lots).reduce((n,l)=>n+l.amount.value,0),3_000_010);
assert.ok(Object.values(ledger.lots).every(l=>!l.reservedBy));assert.ok(!ledger.equipment.basin.reservedBy);
console.log(`PASS coconut husk isolated prototype: ${checks} contract-checked steps; partition/save/observation/gap/stop/recovery/corruption/ledger assertions`);
