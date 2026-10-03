import { pathToFileURL } from 'node:url';
// Read-only diagnostic. Exit code 0 does not mean the reviewed implementation is correct.
const root=process.argv[2];
if(!root || !root.startsWith('/')) throw new Error('Pass the absolute path to a science checkout.');
const {scienceStep}=await import(pathToFileURL(`${root}/src/science/step/index.ts`));
const {validateResult}=await import(pathToFileURL(`${root}/src/science/step/validate.ts`));
const {tileComp,tileQuality}=await import(pathToFileURL(`${root}/src/science/step/common.ts`));
const base={contract:'0.1.0',requestId:'r',world:{worldId:'w',worldEpoch:'e',worldVersion:1},runId:'run:fire',
  processId:'p13x_test_tile_fire',processVersion:'0.1.0',catalogVersion:'civ-sci-test-1',state:null,interval:{from:0,to:30000},
  environment:{sampleId:'env:fixture',source:'simulation',effectiveAt:0,airTempC:28,humidity:0.72,windMs:3},
  lots:[{lotId:'lot:dry',materialId:'test_tile_dry',amount:{value:37047,unit:'mg'},location:'site:review',
    quality:{water_ppm:20434,thickness_mm:10,xd_kaolinite_ppm:450000,xd_quartz_ppm:300000,xd_calcite_ppm:20000,crack:0,history_complete:1}}],
  equipment:[{equipmentId:'eq:kiln',kind:'fixture_kiln',catalogEntry:'fixture_kiln',catalogVersion:'civ-sci-test-1',condition:1,
    params:{heatCapJPerK:40000,uaWPerK:8,maxPowerW:15000,forcedCoolingUaFactor:5}}],
  energy:[{sourceId:'src:heat',kind:'heat',maxJ:450000}],actions:[{at:0,residentId:'res:review',action:'fire_plan',params:{pace:1,targetGlow:2,holdMin:90,forcedCooling:0}}],seed:7};
const results={};
function fire(bounds) {
  let state=null,usedJ=0,last,violations=[];
  for(let i=1;i<bounds.length;i++) {
    const req={...base,state,interval:{from:bounds[i-1],to:bounds[i]},actions:i===1?base.actions:[],energy:[{...base.energy[0],maxJ:15000*(bounds[i]-bounds[i-1])/1000}]};
    last=scienceStep(req);state=last.state;usedJ+=last.energy.reduce((s,e)=>s+e.usedJ,0);violations.push(...validateResult(req,last));
  }
  return {usedJ,kilnC:last.state.data.kilnC,violations};
}
results.firingChunking={one30s:fire([0,30000]),thirty1s:fire(Array.from({length:31},(_,i)=>i*1000))};
const zero={...base,equipment:[{...base.equipment[0],params:{...base.equipment[0].params,heatCapJPerK:0}}]};
const zr=scienceStep(zero);results.zeroCapacity={status:zr.status,kilnC:zr.state.data ? String(zr.state.data.kilnC) : null,violations:validateResult(zero,zr)};
const cracked={...base,interval:{from:0,to:24*3600000},energy:[{...base.energy[0],maxJ:15000*24*3600}],
  lots:[{...base.lots[0],quality:{...base.lots[0].quality,crack:2}}]};
const cr=scienceStep(cracked);results.priorCrack={status:cr.status,qualityCrack:cr.produced[0].quality.crack,observations:cr.observations,violations:validateResult(cracked,cr)};
const asLot=(r,id)=>({...r.produced[0],lotId:id,location:'site:review'});
const dryFired={lotId:'lot:fired',materialId:'test_tile_fired',amount:{value:100000,unit:'mg'},location:'site:review',quality:{water_ppm:0,xd_metakaolin_ppm:1000000,sinter_ppm:0,crack:0}};
function soak(tile,hours,runId,startMs=0) {
  const req={...base,processId:'m01x_tile_soak_test',runId,interval:{from:startMs,to:startMs+hours*3600000},actions:[],stop:'operator',energy:[],
    lots:[tile,{lotId:'lot:water',materialId:'process_water',amount:{value:500000,unit:'mg'},location:'site:review'}],
    equipment:[{equipmentId:'eq:basin',kind:'fixture_soak_basin',catalogEntry:'fixture_soak_basin',catalogVersion:'civ-sci-test-1',condition:1}]};
  const r=scienceStep(req);return {r,violations:validateResult(req,r)};
}
const h1=soak(dryFired,1,'run:one'),h1plus1=soak(asLot(h1.r,'lot:partly-wet'),1,'run:two',3600000),h2=soak(dryFired,2,'run:continuous');
results.reimmersion={after1h:tileComp(asLot(h1.r,'a')).water,after1plus1h:tileComp(asLot(h1plus1.r,'b')).water,after2h:tileComp(asLot(h2.r,'c')).water,
  violations:[...h1.violations,...h1plus1.violations,...h2.violations]};
const slurry=soak({...base.lots[0],quality:{...base.lots[0].quality,history_complete:0}},1,'run:slurry');
results.slurryHistory={input:0,output:slurry.r.produced[0].quality.history_complete??'missing',material:slurry.r.produced[0].materialId};
results.basisRoundtrip={comp:tileComp(base.lots[0]),quality:tileQuality(tileComp(base.lots[0]))};
console.log(JSON.stringify(results,null,2));
