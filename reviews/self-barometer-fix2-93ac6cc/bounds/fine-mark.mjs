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
// Short, ordinary pressure gap, entirely between two 30s cell decisions. A 20 hPa/h valley and a 0.5K warming
// can pass the tube's top although the recovered pressure is back at its starting value.
const shortFixture=assembly(60,90000,100);
const shortEq={...shortFixture.equipment,params:{...shortFixture.equipment.params,markMm:0.5}};
let base=step(req(0,30000,null,{airTempC:28,pressureHPa:1010},shortEq,[]));
const g=base.state.data.g,T0=301.15,k2=2*pv('waterDensity')*pv('gravity');
const xInitial=.049999;
const preload=[];
for(let n=1;n<=120;n++){
 const from=n*30000,to=from+30000,p=physical(base,from),x=xInitial*n/120;
 const pressure=(p.sLo*T0/(g.V0+g.A*x)-k2*x)/100;
 const q=req(from,to,base.state,{airTempC:28,pressureHPa:pressure},shortEq,[from]);
 base=step(q);preload.push({from,to,pressureHPa:pressure,actualState:physical(base)});
}
const sealed=physical(base).sLo;
const baseline=(sealed*T0/(g.V0+g.A*xInitial)-k2*xInitial)/100;
const prepReq=req(3630000,3660000,base.state,{airTempC:28,pressureHPa:baseline},shortEq,[]);
const prepared=step(prepReq);
let shortControl=structuredClone(prepared.state),shortMasked=structuredClone(prepared.state);
const shortHistory=[];const head=3660000;
for(let dt=0;dt<28000;dt+=1000){
 const p=baseline-(20/3600000)*Math.min(dt,28000-dt);
 const rc=step(req(head+dt,head+dt+1000,shortControl,{airTempC:28,pressureHPa:p},shortEq,[head+dt]));
 const rm=step(req(head+dt,head+dt+1000,shortMasked,{airTempC:28},shortEq,[head+dt]));
 shortHistory.push({from:head+dt,to:head+dt+1000,pressureHPa:p,control:physical(rc),masked:physical(rm),controlObservations:rc.observations,maskedObservations:rm.observations,controlCondition:rc.diagnostics.condition,maskedCondition:rm.diagnostics.condition});
 shortControl=structuredClone(rc.state);shortMasked=structuredClone(rm.state);
}
const recoverControlQ=req(head+28000,head+29000,shortControl,{airTempC:28,pressureHPa:baseline},shortEq,[head+28000]);
const recoverMaskedQ=req(head+28000,head+29000,shortMasked,{airTempC:28,pressureHPa:baseline},shortEq,[head+28000]);
const recoverControl=step(recoverControlQ),recoverMasked=step(recoverMaskedQ);
const pressureChanges=preload.map((r,i)=>Math.abs(r.pressureHPa-(i?preload[i-1].pressureHPa:1010))*120);
const dm=shortMasked.data,pm=physical(recoverMasked,head+28000),pMin=(baseline-20*28000/3600000/2)*100;
const shortGap={fixture:shortFixture,baselinePressureHPa:baseline,xInitialM:xInitial,preload,maxPreloadPressureChangeHPaPerH:Math.max(...pressureChanges),prepRequest:prepReq,prepared:prepared.state,history:shortHistory,recoverControlRequest:recoverControlQ,recoverMaskedRequest:recoverMaskedQ,recoverControl,recoverMasked,cachedGapHiK:dm.gapHiMaxK,actualGapEndHiK:pm.bHi,storedAnchorMs:dm.s.tMs,gapEndMs:head+28000,cachedGapTestRiseM:rise(g,dm.s.sHi,pMin,dm.gapHiMaxK),projectedGapEndTestRiseM:rise(g,pm.sHi,pMin,pm.bHi),controlEverReportsOverflow:shortHistory.some(r=>r.controlObservations.some(o=>/あふれた/.test(o.text??''))),maskedRecoversNumeric:recoverMasked.observations.some(o=>o.value!==undefined)};

// Re-play known weather with exact projected state at each read, and keep input/result of violation.
let st=structuredClone(prepared.state);const trace=[];
for(let dt=0;dt<30000;dt+=1000){
 const p=baseline-(20/3600000)*Math.min(dt,Math.max(0,28000-dt));
 const q=req(head+dt,head+dt+1000,st,{airTempC:28,pressureHPa:p},shortEq,[head+dt]);
 const r=step(q),snap=physical(r,head+dt);
 trace.push({q,r,snap,actualPressureRiseM:rise(g,snap.sLo,p*100,snap.bLo),cellPressureRiseM:rise(g,snap.sLo,r.state.data.ctl.Pa,snap.bLo)});
 st=structuredClone(r.state);
}
const backQ=req(head+30000,head+31000,st,{airTempC:28,pressureHPa:baseline},shortEq,[head+30000],'operator');
const back=step(backQ);
const bad=trace.filter(x=>x.actualPressureRiseM>g.halfLengthM&&x.r.observations.some(o=>o.value!==undefined));
const summary={target,process:BAROMETER_POT_PROCESS,halfLengthM:g.halfLengthM,markM:g.markM,maxPressureRateHPaPerH:20,
 baselinePressureHPa:baseline,knownOutsideTubeNumeric:bad.length,firstBad:bad[0]?{at:bad[0].q.interval.from,currentRiseM:bad[0].actualPressureRiseM,heldRiseM:bad[0].cellPressureRiseM,observations:bad[0].r.observations}:null,
 maxKnownRiseM:Math.max(...trace.map(x=>x.actualPressureRiseM)),backObservations:back.observations,backCondition:back.diagnostics.condition,backReleased:back.released,backProduced:back.produced,
 maskedRecoveryCondition:recoverMasked.diagnostics.condition,maskedRecoveryObservations:recoverMasked.observations,validatorViolations:violations};
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname),'fine-mark-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({summary,shortFixture,preload,prepReq,prepared,trace,backQ,back,shortGap},null,2));
