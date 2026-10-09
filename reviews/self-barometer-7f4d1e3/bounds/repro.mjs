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
function csv(name){const text=fs.readFileSync(path.join(target,'data/science/evidence',name),'utf8').trim().split('\n');const header=text.shift().split(',');return text.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[header[i],Number(v)])));}
const ishigaki=csv('jma-ishigaki-20160124-hourly.csv'),yonaguni=csv('jma-yonaguni-20150928-hourly.csv');
function weather(rows,t){const i=Math.min(rows.length-1,Math.floor(t/H)),f=(t-i*H)/H,a=rows[i],b=rows[Math.min(rows.length-1,i+1)];return {airTempC:a.air_temp_c+(b.air_temp_c-a.air_temp_c)*f,pressureHPa:a.station_pressure_hpa+(b.station_pressure_hpa-a.station_pressure_hpa)*f};}
const sweeps=[];let comparisonCount=0;const differences=[];
for(const [station,rows,hour] of [['ishigaki-20160124',ishigaki,17],['yonaguni-20150928',yonaguni,15]])for(const fixture of fixtures)for(const mask of ['temperature','pressure','both'])for(const offset of [0,1007]){
 let control=null,masked=null,numerical=0;const rowsOut=[];
 const until=24*H+offset;
 for(let t=offset;t<until;t+=M){const to=Math.min(until,t+M),env=weather(rows,t-offset),gap=t-offset>=hour*H&&t-offset<(hour+1)*H,hidden={...env};
  if(gap&&(mask==='temperature'||mask==='both'))delete hidden.airTempC;
  if(gap&&(mask==='pressure'||mask==='both'))delete hidden.pressureHPa;
  const readAt=to-1;
  const rc=step(req(t,to,control,env,fixture.equipment,[readAt])),rm=step(req(t,to,masked,hidden,fixture.equipment,[readAt]));
  const pc=physical(rc),pm=physical(rm);comparisonCount++;
  const tempContained=contains(pm.bLo,pm.bHi,pc.bLo),airContained=contains(pm.sLo,pm.sHi,pc.sLo);
  const co=rc.observations.find(o=>o.value!==undefined),mo=rm.observations.find(o=>o.value!==undefined);
  if(mo)numerical++;
  const numbersMatch=!mo||!!co&&mo.value===co.value;
  if(!tempContained||!airContained||!numbersMatch){const diff={station,mask,offset,jointTau:fixture.equipment.params.airLeakTauMin,from:t,to,gap,control:pc,masked:pm,controlCondition:rc.diagnostics.condition,maskedCondition:rm.diagnostics.condition,controlObservation:co,maskedObservation:mo,tempContained,airContained,numbersMatch};differences.push(diff);}
  if(gap||t-offset===(hour+1)*H||t-offset===23*H)rowsOut.push({from:t,to,gap,control:pc,masked:pm,controlCondition:rc.diagnostics.condition,maskedCondition:rm.diagnostics.condition,controlObservation:co,maskedObservation:mo,tempContained,airContained,numbersMatch});
  control=JSON.parse(JSON.stringify(rc.state));masked=JSON.parse(JSON.stringify(rm.state));
 }
 sweeps.push({station,mask,offset,fixtureTau:fixture.equipment.params.airLeakTauMin,maskedHourStart:hour+1,numerical,rows:rowsOut});
}
// Short, ordinary pressure gap, entirely between two 30s cell decisions. A 20 hPa/h valley and a 0.5K warming
// can pass the tube's top although the recovered pressure is back at its starting value.
const shortFixture=assembly(60,90000,100),shortEq=shortFixture.equipment;
let base=step(req(0,30000,null,{airTempC:28,pressureHPa:1010},shortEq,[]));
const g=base.state.data.g,T0=301.15,k2=2*pv('waterDensity')*pv('gravity');
const xInitial=.0497;
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
 const rc=step(req(head+dt,head+dt+1000,shortControl,{airTempC:28.5,pressureHPa:p},shortEq,[head+dt]));
 const rm=step(req(head+dt,head+dt+1000,shortMasked,{airTempC:28.5},shortEq,[head+dt]));
 shortHistory.push({from:head+dt,to:head+dt+1000,pressureHPa:p,control:physical(rc),masked:physical(rm),controlObservations:rc.observations,maskedObservations:rm.observations,controlCondition:rc.diagnostics.condition,maskedCondition:rm.diagnostics.condition});
 shortControl=structuredClone(rc.state);shortMasked=structuredClone(rm.state);
}
const recoverControlQ=req(head+28000,head+29000,shortControl,{airTempC:28.5,pressureHPa:baseline},shortEq,[head+28000]);
const recoverMaskedQ=req(head+28000,head+29000,shortMasked,{airTempC:28.5,pressureHPa:baseline},shortEq,[head+28000]);
const recoverControl=step(recoverControlQ),recoverMasked=step(recoverMaskedQ);
const pressureChanges=preload.map((r,i)=>Math.abs(r.pressureHPa-(i?preload[i-1].pressureHPa:1010))*120);
const dm=shortMasked.data,pm=physical(recoverMasked,head+28000),pMin=(baseline-20*28000/3600000/2)*100;
const shortGap={fixture:shortFixture,baselinePressureHPa:baseline,xInitialM:xInitial,preload,maxPreloadPressureChangeHPaPerH:Math.max(...pressureChanges),prepRequest:prepReq,prepared:prepared.state,history:shortHistory,recoverControlRequest:recoverControlQ,recoverMaskedRequest:recoverMaskedQ,recoverControl,recoverMasked,cachedGapHiK:dm.gapHiMaxK,actualGapEndHiK:pm.bHi,storedAnchorMs:dm.s.tMs,gapEndMs:head+28000,cachedGapTestRiseM:rise(g,dm.s.sHi,pMin,dm.gapHiMaxK),projectedGapEndTestRiseM:rise(g,pm.sHi,pMin,pm.bHi),controlEverReportsOverflow:shortHistory.some(r=>r.controlObservations.some(o=>/あふれた/.test(o.text??''))),maskedRecoversNumeric:recoverMasked.observations.some(o=>o.value!==undefined)};
const summary={calls,comparisonCount,differences:differences.length,validatorViolations:violations,shortGapControlOverflow:shortGap.controlEverReportsOverflow,shortGapMaskedNumeric:shortGap.maskedRecoversNumeric,fixtureTaus:fixtures.map(f=>f.equipment.params.airLeakTauMin),weatherSweeps:sweeps.length};
// Compact index next to the detailed artifact so reviewers need not read 36 long weather traces.
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname),'summary.json'),JSON.stringify({target,process:BAROMETER_POT_PROCESS,...summary,shortGap:{baselinePressureHPa:baseline,maskedFrom:head,maskedTo:head+28000,cachedGapHiK:shortGap.cachedGapHiK,actualGapEndHiK:shortGap.actualGapEndHiK,cachedGapTestRiseM:shortGap.cachedGapTestRiseM,projectedGapEndTestRiseM:shortGap.projectedGapEndTestRiseM,recoveredObservations:recoverMasked.observations,maxPreloadPressureChangeHPaPerH:shortGap.maxPreloadPressureChangeHPaPerH}},null,2)+'\n');
console.log(JSON.stringify({target,process:BAROMETER_POT_PROCESS,fixtures,sweeps,differences,shortGap,summary},null,2));
