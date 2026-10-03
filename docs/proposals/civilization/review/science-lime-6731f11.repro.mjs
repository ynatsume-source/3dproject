import { pathToFileURL } from 'node:url';
// Read-only diagnostic for the science checkout passed explicitly by the reviewer.
// Outputs counterexamples; exit code 0 is not a declaration of correctness.
const root = process.argv[2];
if (!root || !root.startsWith('/')) throw new Error('Pass the absolute path to a science checkout.');
const { scienceStep } = await import(pathToFileURL(`${root}/src/science/step/index.ts`));
const { validateResult } = await import(pathToFileURL(`${root}/src/science/step/validate.ts`));
const { lotComp } = await import(pathToFileURL(`${root}/src/science/step/common.ts`));
const base = {
  contract: '0.1.0', requestId: 'r0', world: {worldId:'w',worldEpoch:'e',worldVersion:1},
  runId: 'run:review', processId:'p20x_lime_calcine_test', processVersion:'0.1.0',
  catalogVersion:'civ-sci-test-1', interval:{from:0,to:30000}, state:null,
  environment:{sampleId:'env:review',source:'simulation',effectiveAt:0,airTempC:25},
  lots:[{lotId:'lot:feed',materialId:'calcium_carbonate_feed',amount:{value:100000,unit:'mg'},location:'site:review',quality:{x_calcite_ppm:950000}}],
  equipment:[{equipmentId:'eq:calciner',kind:'fixture_calciner',catalogEntry:'fixture_calciner',catalogVersion:'civ-sci-test-1',condition:1,
    params:{setpointC:900,holdS:7200,heatCapJPerK:15000,uaWPerK:2,maxPowerW:4000}}],
  energy:[{sourceId:'src:heater',kind:'heat',maxJ:120000}],actions:[],seed:1,
};
const results = {};
function calc(bounds) {
  let state=null, used=0, violations=[];
  for (let i=1;i<bounds.length;i++) {
    const req={...base,state,interval:{from:bounds[i-1],to:bounds[i]},requestId:`r${i}`,
      energy:[{...base.energy[0],maxJ:4000*(bounds[i]-bounds[i-1])/1000}]};
    const res=scienceStep(req);
    used+=res.energy.reduce((s,e)=>s+e.usedJ,0);state=res.state;violations.push(...validateResult(req,res));
  }
  return {usedJ:used,chamberC:state.data.chamberC,violations};
}
results.chunking={one30s:calc([0,30000]),thirty1s:calc(Array.from({length:31},(_,i)=>i*1000)),split29plus1:calc([0,29000,30000])};
const normal=scienceStep(base);
results.nanInterval=validateResult(base,{...normal,simulated:{from:0,to:NaN}});
results.negativeEnergy=validateResult(base,{...normal,energy:[
  {sourceId:'src:heater',kind:'heat',usedJ:120001,lostJ:120001,storedJ:0},
  {sourceId:'src:heater',kind:'heat',usedJ:-1,lostJ:-1,storedJ:0},
]});
const zeroCap={...base,equipment:[{...base.equipment[0],params:{...base.equipment[0].params,heatCapJPerK:0}}]};
const z=scienceStep(zeroCap);
results.zeroCapacity={status:z.status,chamberC:z.state.data ? String(z.state.data.chamberC) : null,violations:validateResult(zeroCap,z)};
function hydrateReq(waterMg) {
  return {...base, processId:'p21x_lime_hydrate_test',interval:{from:0,to:12*3600000},energy:[],
    lots:[{lotId:'lot:lime',materialId:'quicklime',amount:{value:56080,unit:'mg'},location:'site:review',quality:{x_lime_ppm:1000000}},
      {lotId:'lot:water',materialId:'process_water',amount:{value:waterMg,unit:'mg'},location:'site:review'}],
    equipment:[{equipmentId:'eq:tub',kind:'fixture_slaking_tub',catalogEntry:'fixture_slaking_tub',catalogVersion:'civ-sci-test-1',condition:1,params:{heatCapJPerK:400,uaWPerK:1.5}}]};
}
results.waterLimited=[];
const unknownHistory=hydrateReq(60000);
unknownHistory.lots[0].quality.history_complete=0;
const historyResult=scienceStep(unknownHistory);
results.history={input:0,output:historyResult.produced[0].quality.history_complete,status:historyResult.status,violations:validateResult(unknownHistory,historyResult)};
for (const waterMg of [9000,10000,12000,15000,18015,20000,60000]) {
  try { const req=hydrateReq(waterMg),r=scienceStep(req);results.waterLimited.push({waterMg,status:r.status,conversion:r.diagnostics.conversion,violations:validateResult(req,r)}); }
  catch(e) { results.waterLimited.push({waterMg,error:e.message}); }
}
results.rounding=[];
for(let w=1000;w<=50000;w+=101) {
  try {
    const r=scienceStep(hydrateReq(w));
    if(r.produced.length) lotComp({...r.produced[0],lotId:'lot:out',location:'site:review'});
  }catch(e) {results.rounding.push({waterMg:w,error:e.message}); if(results.rounding.length===3)break;}
}
console.log(JSON.stringify(results,null,2));
