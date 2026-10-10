import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const target = process.argv[2] ?? '/workspace/3dproject-self-barometer-fix-7318506';
const dest = process.argv[3] ?? path.join(path.dirname(new URL(import.meta.url).pathname), 'fix-check.json');
const load = p => import(pathToFileURL(path.join(target,p)).href);
const { scienceStep } = await load('src/science/step/index.ts');
const { TAR_SEAL_PROCESS, potToEquipmentParams, readPot } = await load('src/science/step/vessel.ts');
const { validateResult } = await load('src/science/step/validate.ts');
const lot = (lotId,materialId,value,quality={}) => ({lotId,materialId,amount:{value,unit:'mg'},location:'shelf',quality});
const eq = (equipmentId,kind) => ({equipmentId,kind,catalogEntry:kind,catalogVersion:'civ-sci-test-2',condition:1,params:{}});
const seal = (at,jointTarG) => ({at,action:'seal',residentId:'res:lantern',params:{jointTarG}});
const baseLots = (warm=false,tarMg=41000) => [
  lot('pot','fired_pot_test',600000,{capacity_ml:500,absorption_ppm:120000}),
  lot('tar','wood_tar',tarMg,{x_wood_tar_ppm:1000000}),
  lot('tube','gauge_tube_test',30000,{bore_mm:8,length_mm:600,history_complete:0,fixture_marker:17}),
  ...(warm?[lot('wood','firewood',2000000,{water_ppm:150000})]:[]),
];
let calls = 0;
const violations = [], checks = [];
const check = (name,fn) => { try { fn();checks.push({name,pass:true}); } catch(e) { checks.push({name,pass:false,error:e.message}); } };
const req = (from,to,state,actions,{warm=false,tarMg=41000,power=20,stop,lots=baseLots(warm,tarMg)}={}) => ({
  contract:'0.2.0',requestId:`r:${from}`,runId:'run:seal-fix',world:{worldId:'w',worldEpoch:'e',worldVersion:1},
  ...TAR_SEAL_PROCESS,catalogVersion:'civ-sci-test-2',interval:{from,to},state,actions,lots,
  environment:{sampleId:`env:${from}`,source:'record',effectiveAt:from,airTempC:28,humidity:.75,windMs:2,rainMmH:0},
  equipment:[eq('brush','fixture_tar_brush'),...(warm?[eq('pit','open_fire_pit')]:[])],
  energy:[{sourceId:'hands',kind:'mechanical',maxJ:Math.ceil((to-from)*power/1000)}],seed:1,...(stop?{stop}:{}),
});
const step = q => { calls++;const r = scienceStep(q);violations.push(...validateResult(q,r).map(v=>({request:q.requestId,violation:v})));return r; };
const run = (boundaries,actions,extra={}) => {
  let state=null,r;const trace=[];
  for(let i=1;i<boundaries.length;i++){
    const from=boundaries[i-1],to=boundaries[i];
    r=step(req(from,to,state,actions.filter(a=>a.at>=from&&a.at<to),extra));
    trace.push({interval:{from,to},status:r.status,simulated:r.simulated,state:r.state});
    state=JSON.parse(JSON.stringify(r.state));
    if(!['running','needs-input'].includes(r.status))break;
  }
  const pot=r.produced.find(p=>p.materialId==='fired_pot_test');
  return {trace,last:r,quality:pot?.quality,params:pot?potToEquipmentParams({...pot,lotId:'made',location:'shelf'}):null};
};
const result = {target:'7318506',process:TAR_SEAL_PROCESS,scope:'SB-A1/SB-A2 plus local state migration and returned tube',cases:{}};
for(const warm of [false,true]){
  const name=warm?'warm':'cold';
  const action=[seal(60000,6),seal(1800000,60)];
  const variants={
    long:run([0,3600000],action,{warm}),
    split:run([0,600000,3600000],action,{warm}),
    wait:run([0,30000,600000,3600000],action,{warm}),
    reverse:run([0,3600000],[...action].reverse(),{warm}),
    odd:run([0,13001,60000,60001,70019,900001,3600000],action,{warm}),
  };
  result.cases[name]=variants;
  for(const [variant,r] of Object.entries(variants))check(`${name}/${variant}: first seal restored, products equal`,()=>{
    assert.equal(r.last.status,'completed');assert.deepEqual(r.last.produced,variants.long.last.produced);
    assert.deepEqual(r.last.state,variants.long.last.state);assert.equal(r.last.state.data.sealAt,60000);assert.equal(r.last.state.data.jointTarG,6);
    assert.equal(r.last.state.schema,'civ-sci.vessel-seal/3');
  });
}
const saved=step(req(0,600000,null,[seal(60000,6)]));
const savedJson=JSON.parse(JSON.stringify(saved.state));
const resumed=step(req(600000,3600000,savedJson,[]));
check('JSON /3 restore preserves the executed joint',()=>assert.deepEqual(resumed.produced,result.cases.cold.long.last.produced));
const savedNoSeal=step(req(0,30000,null,[]));
check('waiting tube in initial unsealed /3 state',()=>{assert.equal(savedNoSeal.status,'running');assert.equal(savedNoSeal.state.data.sealAt,-1);assert.equal(savedNoSeal.state.data.jointTarG,0);assert.deepEqual(savedNoSeal.consumed,[]);});
for(const source of [saved,savedNoSeal]){
  const old=JSON.parse(JSON.stringify(source.state));old.schema='civ-sci.vessel-seal/2';delete old.data.sealAt;delete old.data.jointTarG;
  const r=step(req(source.simulated.to,3600000,old,[]));
  result.cases[`rejectOldFrom${source.simulated.to}`]=r;
  check(`/2 from ${source.simulated.to} explicitly rejected without consumption`,()=>{assert.equal(r.status,'failed');assert.match(r.evidence.notes,/unsupported-state-schema/);assert.deepEqual(r.consumed,[]);assert.deepEqual(r.produced,[]);});
}
const ignoredAfterFirst=run([0,600000,3600000],[seal(60000,6),seal(600000,37)]);
check('later reached seal does not rewrite persisted joint',()=>assert.deepEqual(ignoredAfterFirst.last.produced,result.cases.cold.long.last.produced));
for(const actions of [[seal(120000,6),seal(60000,2)],[seal(60000,2),seal(120000,6)]]){
  const r=run([0,3600000],actions);check('two reached actions select earlier timestamp despite array order',()=>{assert.equal(r.last.state.data.jointTarG,2);assert.equal(r.last.state.data.sealAt,60000);});
}
for(const [name,actions,extra] of [
  ['never seal',[],{}],['seal at completion is not reached',[seal(900000,6)],{}],['tar below plug',[seal(60000,6)],{tarMg:4999}],
]){
  const r=run([0,30000,600000,3600000],actions,extra);result.cases[name]=r;
  check(`${name}: tube returned exactly and no fabricated assembly`,()=>{
    assert.equal(r.last.status,'completed');const original=baseLots(false,extra.tarMg??41000).find(l=>l.materialId==='gauge_tube_test');
    assert.deepEqual(r.last.produced.find(p=>p.materialId==='gauge_tube_test'),{materialId:original.materialId,amount:original.amount,into:original.location,quality:original.quality});
    assert.equal(r.quality.sealed,0);assert.equal(r.quality.has_tube??0,0);
    const allIn=baseLots(false,extra.tarMg??41000).reduce((s,l)=>s+l.amount.value,0);
    assert.equal(r.last.produced.reduce((s,l)=>s+l.amount.value,0),allIn);
    assert.equal(readPot({...r.last.produced.find(p=>p.materialId==='fired_pot_test'),lotId:'returned',location:'shelf'}).sealed,false);
  });
}
const first=run([0,3600000],[]);const returnedTube=first.last.produced.find(p=>p.materialId==='gauge_tube_test');
const retryLots=[baseLots()[0],baseLots()[1],{...returnedTube,lotId:'returned-tube',location:returnedTube.into}];
const retry=run([0,30000,600000,3600000],[seal(60000,6)],{lots:retryLots});
check('unsealed returned tube can be reused in fresh sealed run',()=>{assert.equal(retry.last.status,'completed');assert.equal(retry.quality.sealed,1);assert.equal(retry.quality.tube_bore_mm,8);assert.equal(retry.quality.history_complete,0);});
check('all results pass validator',()=>assert.deepEqual(violations,[]));
result.calls=calls;result.checks=checks;result.violations=violations;result.failures=checks.filter(c=>!c.pass);
fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({target:result.target,process:TAR_SEAL_PROCESS,calls,checks:checks.length,failures:result.failures,violations:violations.length,output:dest},null,2));
if(result.failures.length)process.exitCode=1;
