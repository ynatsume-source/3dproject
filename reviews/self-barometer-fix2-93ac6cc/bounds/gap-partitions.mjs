// Public-entry diagnostics: a real sealed pot -> assembly params -> m03x, with weather values masked.
// Run from target cwd: node --import tsx --import ./scripts/node-assets.mjs /abs/repro.mjs /tmp/self-barometer-7f4d1e3 > /abs/result.json
import path from 'node:path';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const target=path.resolve(process.argv[2]??process.cwd());
const {scienceStep}=await import(pathToFileURL(path.join(target,'src/science/step/index.ts')));
const {TAR_SEAL_PROCESS,potToEquipmentParams}=await import(pathToFileURL(path.join(target,'src/science/step/vessel.ts')));
const {BAROMETER_POT_PROCESS}=await import(pathToFileURL(path.join(target,'src/science/step/barometer-pot.ts')));
const {rise}=await import(pathToFileURL(path.join(target,'src/science/step/barometer.ts')));
const {validateResult}=await import(pathToFileURL(path.join(target,'src/science/step/validate.ts')));
const {pv}=await import(pathToFileURL(path.join(target,'src/science/params.ts')));
const H=3600000,M=60000,W={worldId:'w',worldEpoch:'e',worldVersion:1};
let calls=0;const violations=[];
function step(q){calls++;const r=scienceStep(q);violations.push(...validateResult(q,r).map(v=>`${q.requestId}: ${v}`));if(r.status==='failed')throw Error(r.evidence.notes);return r;}
function assembly(joint=60,tar=90000,length=600){
 const q={contract:'0.2.0',requestId:`seal:${joint}:${length}`,runId:'run:seal',world:W,...TAR_SEAL_PROCESS,catalogVersion:'civ-sci-test-2',interval:{from:0,to:H},state:null,
  environment:{sampleId:'env:seal',source:'record',effectiveAt:0,airTempC:28},
  lots:[{lotId:'lot:pot',materialId:'fired_pot_test',amount:{value:600000,unit:'mg'},location:'site:shelf',quality:{capacity_ml:500,absorption_ppm:120000}},
   {lotId:'lot:tar',materialId:'wood_tar',amount:{value:tar,unit:'mg'},location:'eq:retort',quality:{x_wood_tar_ppm:1000000}},
   {lotId:'lot:tube',materialId:'gauge_tube_test',amount:{value:40000,unit:'mg'},location:'site:shelf',quality:{bore_mm:8,length_mm:length}},
   {lotId:'lot:wood',materialId:'firewood',amount:{value:2000000,unit:'mg'},location:'site:woodpile',quality:{water_ppm:150000}}],
  equipment:[{equipmentId:'eq:brush',kind:'fixture_tar_brush',catalogEntry:'fixture_tar_brush',catalogVersion:'civ-sci-test-2',condition:1},{equipmentId:'eq:pit',kind:'open_fire_pit',catalogEntry:'open_fire_pit',catalogVersion:'civ-sci-test-2',condition:1,params:{maxBurnKgPerH:3}}],
  energy:[{sourceId:'src:hands',kind:'mechanical',maxJ:72000}],actions:[{at:M,residentId:'res:lantern',action:'seal',params:{jointTarG:joint}}],seed:1};
 const r=step(q),p=r.produced.find(p=>p.materialId==='fired_pot_test');
 const lot={lotId:'lot:sealed',materialId:p.materialId,amount:p.amount,location:p.into??'site:shelf',quality:p.quality};
 return {sealRequest:q,sealResult:r,lot,equipment:{equipmentId:'eq:bulb',kind:'assembled_pot',catalogEntry:'assembled_pot',catalogVersion:'civ-sci-test-2',condition:1,params:{...potToEquipmentParams(lot),markMm:5}}};
}
const fixtures=[assembly(0,30000),assembly(6,30000),assembly(60,90000)];
function req(from,to,state,env,eq,reads=[],stop){return {contract:'0.2.0',requestId:`g:${from}:${to}`,runId:'run:g',world:W,...BAROMETER_POT_PROCESS,catalogVersion:'civ-sci-test-2',interval:{from,to},state,
 environment:{sampleId:`env:${from}`,source:'record',effectiveAt:from,...env},lots:[{lotId:'lot:water',materialId:'process_water',amount:{value:20000,unit:'mg'},location:'site:jar'}],equipment:[eq],energy:[],seed:1,actions:reads.map(at=>({at,residentId:'res:lantern',action:'read_gauge'})),...(stop?{stop}:{})};}
// Project the saved cell anchor to its reported end using the public state. This is needed because running states hold the cell head.
function physical(r,t=r.simulated.to){const d=r.state.data,s=d.s,c=d.ctl,sec=(t-s.tMs)/1000,f=Math.exp(-sec/d.g.tauS);return {tMs:t,bLo:c.tKnown?c.Ta+(s.bLo-c.Ta)*f:Math.min(213.15+(s.bLo-213.15)*f,s.bLo),bHi:c.tKnown?c.Ta+(s.bHi-c.Ta)*f:Math.max(343.15+(s.bHi-343.15)*f,s.bHi),sLo:Math.max(1e-12,s.sLo+c.dsLo*sec),sHi:Math.max(1e-12,s.sHi+c.dsHi*sec)};}
const contains=(lo,hi,v)=>v>=lo-1e-12&&v<=hi+1e-12;

const cases=[], failures=[];
const stable=r=>JSON.stringify({data:r.last.state.data,produced:r.last.produced,released:r.last.released,observations:r.observations});
function run(fixture,offset,gapMs,mask,chunk){
 const eq=fixture.equipment,from=60000+offset,to=from+gapMs,recoverTo=to+61000;
 let st=null,all=[],r;
 const call=(a,b,env,reads=[],stop)=>{const q=req(a,b,st,env,eq,reads,stop);r=step(q);all.push(r);st=structuredClone(r.state);};
 call(0,from,{airTempC:28,pressureHPa:1010});
 const gapEnv={airTempC:30,pressureHPa:1010};
 if(mask==='temperature'||mask==='both')delete gapEnv.airTempC;
 if(mask==='pressure'||mask==='both')delete gapEnv.pressureHPa;
 for(let t=from;t<to;t+=chunk)call(t,Math.min(to,t+chunk),gapEnv);
 // Repeat same known recovery interval rather than deciding on arbitrary extra reads.
 call(to,recoverTo,{airTempC:30,pressureHPa:1010},[to,to+60000]);
 call(recoverTo,recoverTo+1000,{airTempC:30,pressureHPa:1010},[recoverTo],'operator');
 return {last:r,observations:all.flatMap(r=>r.observations)};
}
for(const [f,fixture]of fixtures.entries())for(const offset of[0,1,1007,29999])for(const gapMs of[1000,28000,31000,61000,130000])for(const mask of['pressure','temperature','both']){
 const base=run(fixture,offset,gapMs,mask,gapMs),one=run(fixture,offset,gapMs,mask,1000),odd=run(fixture,offset,gapMs,mask,737),control=run(fixture,offset,gapMs,'none',gapMs);
 const a=base.last.state.data.s,c=control.last.state.data.s;
 const partitionEqual=stable(base)===stable(one)&&stable(base)===stable(odd);
 const temperatureContains=a.bLo<=c.bLo+1e-12&&a.bHi>=c.bHi-1e-12;
 const airContains=a.sLo<=c.sLo+1e-12&&a.sHi>=c.sHi-1e-12;
 const controlObs=new Map(control.observations.map(o=>[o.at,o.value]));
 const numbersMatch=base.observations.every(o=>o.value===undefined||controlObs.get(o.at)===o.value);
 const entry={fixture:f,offset,gapMs,mask,partitionEqual,temperatureContains,airContains,numbersMatch,condition:base.last.diagnostics.condition,observations:base.observations};
 cases.push(entry);if(!partitionEqual||!temperatureContains||!airContains||!numbersMatch)failures.push({...entry,base,one,odd,control});
}
const summary={target,process:BAROMETER_POT_PROCESS,cases:cases.length,calls,failures:failures.length,partitionFailures:failures.filter(c=>!c.partitionEqual).length,boundsFailures:failures.filter(c=>!c.temperatureContains||!c.airContains).length,numericFailures:failures.filter(c=>!c.numbersMatch).length,validatorViolations:violations};
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname),'gap-partitions-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({summary,cases,failures},null,2));
