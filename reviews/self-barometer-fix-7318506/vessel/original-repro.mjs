import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const target=process.argv[2]??'/tmp/self-barometer-7f4d1e3';
const parent=process.argv[3]??'/tmp/self-barometer-parent';
const dest=process.argv[4]??path.join(path.dirname(new URL(import.meta.url).pathname),'result.json');
const imp=(b,p)=>import(pathToFileURL(path.join(b,p)).href);
const {scienceStep}=await imp(target,'src/science/step/index.ts');
const v=await imp(target,'src/science/step/vessel.ts');
const old=await imp(parent,'src/science/step/vessel.ts');
const {validateResult}=await imp(target,'src/science/step/validate.ts');
const {pv}=await imp(target,'src/science/params.ts');
const H=3_600_000,D=24*H;
const lot=(id,materialId,mg,quality={})=>({lotId:id,materialId,amount:{value:mg,unit:'mg'},location:'shelf',quality});
const eq=(id,kind,params={})=>({equipmentId:id,kind,catalogEntry:kind,catalogVersion:'civ-sci-test-2',condition:1,params});
const act=(at,jointTarG)=>({at,action:'seal',residentId:'res:lantern',params:{jointTarG}});
const pot=()=>lot('pot','fired_pot_test',600000,{capacity_ml:500,absorption_ppm:120000});
const tar=()=>lot('tar','wood_tar',41000,{x_wood_tar_ppm:1000000});
const tube=()=>lot('tube','gauge_tube_test',30000,{bore_mm:8,length_mm:600});
const wood=()=>lot('wood','firewood',2000000,{water_ppm:150000});
const base=(process,from,to,lots,state,actions=[],extra={})=>({contract:'0.2.0',requestId:'r:'+from,runId:'run:'+process.processId,world:{worldId:'w',worldEpoch:'e',worldVersion:1},...process,catalogVersion:'civ-sci-test-2',interval:{from,to},state,environment:{sampleId:'env:'+from,source:'record',effectiveAt:from,airTempC:28,humidity:.75,windMs:2,rainMmH:0},lots,equipment:[],energy:[],seed:1,actions,...extra});
let calls=0;const violations=[];
const step=q=>{calls++;const r=scienceStep(q);violations.push(...validateResult(q,r).map(x=>({process:q.processId,request:q.requestId,violation:x})));return r};
function sealRun(boundaries,actions,{warm=false,tarMg=41000}={}){
  const lots=[pot(),lot('tar','wood_tar',tarMg,{x_wood_tar_ppm:1000000}),tube(),...(warm?[wood()]:[])];
  let state=null;const trace=[];let r;
  for(let i=1;i<boundaries.length;i++){
    const from=boundaries[i-1],to=boundaries[i];
    const q=base(v.TAR_SEAL_PROCESS,from,to,lots,state,actions.filter(a=>a.at>=from&&a.at<to),{equipment:[eq('brush','fixture_tar_brush'),...(warm?[eq('pit','open_fire_pit')]:[])],energy:[{sourceId:'hands',kind:'mechanical',maxJ:(to-from)/1000*20}]});
    r=step(q);trace.push({from,to,status:r.status,notes:r.evidence.notes,state:r.state,produced:r.produced});state=structuredClone(r.state);
    if(r.status!=='running'&&r.status!=='needs-input')break;
  }
  const out=r.produced.find(p=>p.materialId==='fired_pot_test');
  return {trace,last:r,quality:out?.quality??null,assembly:out?v.potToEquipmentParams({...out,lotId:'made',location:'shelf'}):null};
}
const result={target:'7f4d1e3c50e29f1ecde7382219f13f19c32777d4',parent:path.basename(parent),findings:{},passed:{}};
for(const warm of [false,true]){
  const action=[act(60000,6)];
  const long=sealRun([0,H],action,{warm});
  const split=sealRun([0,600000,H],action,{warm});
  const earlyChunks=sealRun([0,30000,600000,H],action,{warm});
  result.findings['jointActionState'+(warm?'Warm':'Cold')]={long,split,earlyChunks,producedIdentical:JSON.stringify(long.last.produced)===JSON.stringify(split.last.produced)};
}
result.findings.unreachedAction={chronological:sealRun([0,H],[act(60000,6),act(1800000,60)]),reverseInput:sealRun([0,H],[act(1800000,60),act(60000,6)])};

// 140 distinct tube-less 500 mL fixture conditions x four environment-source values.
// Metadata evaluatorVersion alone is normalized: no physical state or quality key is hidden.
const defs=[
 {name:'raw500',mg:600000,q:{capacity_ml:500,absorption_ppm:120000}},
 {name:'lowAbsorb500',mg:150000,q:{capacity_ml:500,absorption_ppm:60000}},
 {name:'highAbsorb500',mg:1200000,q:{capacity_ml:500,absorption_ppm:200000}},
 {name:'noabsorb500',mg:600000,q:{capacity_ml:500,absorption_ppm:0}},
 {name:'tarred-wet500',mg:645000,q:{capacity_ml:500,absorption_ppm:120000,coverage_ppm:500000,x_wood_tar_ppm:30000,x_water_ppm:40000,sealed:0}},
 {name:'cracked500',mg:600000,q:{capacity_ml:500,absorption_ppm:120000,coverage_ppm:700000,crack_ppm:100000,sealed:0}},
 {name:'sealed-unknown500',mg:630000,q:{capacity_ml:500,absorption_ppm:120000,coverage_ppm:800000,x_wood_tar_ppm:50000,sealed:1,airtight_known:0}},
];
const climates=[{t:-5,rh:.95,wind:0,sun:0},{t:15,rh:.9,wind:5,sun:0},{t:28,rh:.75,wind:2,sun:0},{t:38,rh:.2,wind:12,sun:1},{t:70,rh:0,wind:80,sun:1}];
const modes=[{name:'normal-water',chunk:H,water:true,wood:true,seal:true,origin:0},{name:'empty-short',chunk:30000,water:false,wood:false,seal:false,origin:1007},{name:'operator-stop',chunk:3*H,water:true,wood:false,seal:true,stop:'operator',origin:0},{name:'equipment-lost',chunk:1020000,water:false,wood:true,seal:false,stop:'equipment-lost',origin:1007}];
const sources=['record','live','simulation','unknown'];
const norm=r=>{const c=structuredClone(r);c.evidence.evaluatorVersion='EXPECTED_VERSION_METADATA';return JSON.stringify(c)};
const comp={conditions:140,environmentSources:sources,scenarios:0,pairedIntervals:0,metadataOnly:0,mismatchCount:0,mismatches:[],normalization:'evidence.evaluatorVersion only',helperChecks:[]};
const compare=(name,a,b)=>{comp.pairedIntervals++;if(norm(a)!==norm(b)){comp.mismatchCount++;if(comp.mismatches.length<3)comp.mismatches.push({name,parent:a,current:b})}else if(JSON.stringify(a)!==JSON.stringify(b))comp.metadataOnly++;};
for(const def of defs)for(const cl of climates)for(const mode of modes)for(const source of sources){
 comp.scenarios++;const l=lot('fixture','fired_pot_test',def.mg,def.q),origin=mode.origin;
 const env=from=>({sampleId:'env:'+from,source,effectiveAt:from,airTempC:cl.t,humidity:cl.rh,windMs:cl.wind});
 const sealUntil=origin+(mode.stop?300000:1200000);
 let os=null,ns=null;
 for(let from=origin;from<sealUntil;from+=mode.chunk){
  const to=Math.min(sealUntil,from+mode.chunk);const actions=mode.seal&&origin+60001>=from&&origin+60001<to?[{at:origin+60001,action:'seal',residentId:'res:lantern'}]:[];
  const lots=[l,lot('tar','wood_tar',15000,{x_wood_tar_ppm:1000000}),...(mode.wood?[wood()]:[])];
  const extra={environment:env(from),equipment:[eq('brush','fixture_tar_brush'),...(mode.wood?[eq('pit','open_fire_pit')]:[])],energy:[{sourceId:'hands',kind:'mechanical',maxJ:(to-from)/1000*20}],...(to===sealUntil&&mode.stop?{stop:mode.stop}:{})};
  const qo=base(old.TAR_SEAL_PROCESS,from,to,lots,os,actions,extra),qn=base(v.TAR_SEAL_PROCESS,from,to,lots,ns,actions,extra);
  const a=old.tarSealStep(qo),b=v.tarSealStep(qn);compare(`${def.name}/${cl.t}/${mode.name}/${source}/seal/${from}`,a,b);os=structuredClone(a.state);ns=structuredClone(b.state);
  if(a.status!=='running'&&a.status!=='needs-input')break;
 }
 os=null;ns=null;const until=origin+6*H+35000;
 const acts=[{at:origin+17013,action:'look',residentId:'res:lantern'},{at:origin+H+11001,action:'look',residentId:'res:lantern'},{at:origin+5*H+29001,action:'look',residentId:'res:lantern'},...(!mode.stop?[{at:origin+6*H+17007,action:'take_out',residentId:'res:lantern'}]:[])];
 for(let from=origin;from<until;from+=mode.chunk){
  const to=Math.min(until,from+mode.chunk);const lots=[l,...(mode.water?[lot('water','process_water',400000)]:[])];
  const extra={environment:env(from),equipment:[eq('stand','fixture_vessel_stand',{sunExposure:cl.sun})],...(to===until&&mode.stop?{stop:mode.stop}:{})};
  const actions=acts.filter(a=>a.at>=from&&a.at<to);
  const a=old.leakTestStep(base(old.LEAK_TEST_PROCESS,from,to,lots,os,actions,extra)),b=v.leakTestStep(base(v.LEAK_TEST_PROCESS,from,to,lots,ns,actions,extra));
  compare(`${def.name}/${cl.t}/${mode.name}/${source}/leak/${from}`,a,b);os=structuredClone(a.state);ns=structuredClone(b.state);if(a.status!=='running')break;
 }
}
for(const def of defs){const l=lot('fixture','fired_pot_test',def.mg,def.q);
 comp.helperChecks.push({name:def.name+' equipment params',passed:JSON.stringify(old.potToEquipmentParams(l))===JSON.stringify(v.potToEquipmentParams(l))});
 comp.helperChecks.push({name:def.name+' readPot',passed:JSON.stringify(old.readPot(l))===JSON.stringify(v.readPot(l))});
 for(const c of [1,.97,.5,0])comp.helperChecks.push({name:def.name+' return '+c,passed:JSON.stringify(old.potQualityOnReturn(l.quality,c))===JSON.stringify(v.potQualityOnReturn(l.quality,c))});
 comp.helperChecks.push({name:def.name+' sherds',passed:JSON.stringify(old.potSherdsQuality(l.quality))===JSON.stringify(v.potSherdsQuality(l.quality))});
}
result.passed.legacy500Ml=comp;
// Assembly/return behavior for a real normal tubed output, and the effect of standing in warm sun.
const made=result.findings.jointActionStateWarm.long.last.produced.find(x=>x.materialId==='fired_pot_test');
const madeLot={...made,lotId:'made:normal',location:'shelf'};
const madeRead=v.readPot(madeLot),madeParams=v.potToEquipmentParams(madeLot);
const worn=v.potQualityOnReturn(madeLot.quality,.9);
result.passed.assemblyReturn={read:madeRead,params:madeParams,bulbTauMatchesBodyMath:madeParams.bulbTauS===Math.round(madeRead.body/1000*pv('cpCeramic')/(pv('firedPotLossWPerM2K')*madeRead.areaM2)),wholeCopyUnchanged:JSON.stringify(v.potQualityOnReturn(madeLot.quality,1))===JSON.stringify(madeLot.quality),wornQuality:worn,wornParams:v.potToEquipmentParams({...madeLot,quality:worn})};
const hotReq=base(v.LEAK_TEST_PROCESS,0,30*D+1,[madeLot],null,[{at:30*D,action:'take_out',residentId:'res:lantern'}],{environment:{sampleId:'env:hot',source:'record',effectiveAt:0,airTempC:33,humidity:.75,windMs:2},equipment:[eq('stand','fixture_vessel_stand',{sunExposure:1})]});
const hot=step(hotReq);
result.passed.hotTarJoint={before:madeLot.quality,after:hot.produced.find(x=>x.materialId==='fired_pot_test')?.quality,observations:hot.observations,status:hot.status};


// Fresh returned-tube guards and a live run whose reserved joint is altered.
result.passed.tubeGuards=[];
for(const [name,delta] of [['missingJoint',{joint_cover_ppm:undefined}],['negativeJoint',{joint_cover_ppm:-1}],['jointOverOne',{joint_cover_ppm:1000001}],['negativeBore',{tube_bore_mm:-1}],['tooShort',{tube_length_mm:99}],['unsealedTube',{sealed:0}]]){
 const copy={...madeLot,quality:{...madeLot.quality,...delta}};
 let reason;try{v.readPot(copy)}catch(e){reason=e.message}
 result.passed.tubeGuards.push({name,refused:!!reason,reason});
}
const watch0=step(base(v.LEAK_TEST_PROCESS,0,H,[madeLot],null,[],{equipment:[eq('stand','fixture_vessel_stand',{sunExposure:0})]}));
const altered={...madeLot,quality:{...madeLot.quality,joint_cover_ppm:0}};
const watch1=step(base(v.LEAK_TEST_PROCESS,H,2*H,[altered],watch0.state,[],{equipment:[eq('stand','fixture_vessel_stand',{sunExposure:0})]}));
result.passed.reservedJointChange={status:watch1.status,reason:watch1.evidence.notes,consumed:watch1.consumed};

result.calls=calls;result.violations=violations;
fs.writeFileSync(dest,JSON.stringify(result,(_,x)=>typeof x==='number'&&!Number.isFinite(x)?String(x):x,2)+'\n');
console.log(JSON.stringify({calls,violations:violations.length,cold:{long:result.findings.jointActionStateCold.long.quality,split:result.findings.jointActionStateCold.split.quality,earlyStatus:result.findings.jointActionStateCold.earlyChunks.last.status},output:dest},null,2));
