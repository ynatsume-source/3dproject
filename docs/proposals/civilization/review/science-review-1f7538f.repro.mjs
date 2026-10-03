// Read-only diagnostics for the follow-up review of 1f7538f.
// Run from a checkout with tsx installed; pass current and optionally pre-fix science checkout paths.
// An exit code of 0 means the diagnostics ran, not that the science implementation passed.
import { pathToFileURL } from 'node:url';
const root=process.argv[2], previousRoot=process.argv[3];
if(!root || !root.startsWith('/')) throw new Error('Pass an absolute science checkout path.');
const {scienceStep}=await import(pathToFileURL(`${root}/src/science/step/index.ts`));
const {validateResult}=await import(pathToFileURL(`${root}/src/science/step/validate.ts`));
const W = { worldId: 'w', worldEpoch: 'e', worldVersion: 1 };
const CALC = {
  contract: '0.1.0', requestId: 'r0', world: W, runId: 'run:review', processId: 'p20x_lime_calcine_test', processVersion: '0.1.0',
  catalogVersion: 'civ-sci-test-1', interval: { from: 0, to: 30000 }, state: null,
  environment: { sampleId: 'env:review', source: 'simulation', effectiveAt: 0, airTempC: 25 },
  lots: [{ lotId: 'lot:feed', materialId: 'calcium_carbonate_feed', amount: { value: 100000, unit: 'mg' }, location: 'site:review', quality: { x_calcite_ppm: 950000 } }],
  equipment: [{ equipmentId: 'eq:calciner', kind: 'fixture_calciner', catalogEntry: 'fixture_calciner', catalogVersion: 'civ-sci-test-1', condition: 1,
    params: { setpointC: 900, holdS: 7200, heatCapJPerK: 15000, uaWPerK: 2, maxPowerW: 4000 } }],
  energy: [{ sourceId: 'src:heater', kind: 'heat', maxJ: 120000 }], actions: [], seed: 1,
};
const FIRE = {
  contract: '0.1.0', requestId: 'r', world: W, runId: 'run:fire', processId: 'p13x_test_tile_fire', processVersion: '0.1.0', catalogVersion: 'civ-sci-test-1',
  state: null, interval: { from: 0, to: 30000 }, environment: { sampleId: 'env:fixture', source: 'simulation', effectiveAt: 0, airTempC: 28, humidity: 0.72, windMs: 3 },
  lots: [{ lotId: 'lot:dry', materialId: 'test_tile_dry', amount: { value: 37047, unit: 'mg' }, location: 'site:review',
    quality: { water_ppm: 20434, thickness_mm: 10, xd_kaolinite_ppm: 450000, xd_quartz_ppm: 300000, xd_calcite_ppm: 20000, crack: 0, history_complete: 1 } }],
  equipment: [{ equipmentId: 'eq:kiln', kind: 'fixture_kiln', catalogEntry: 'fixture_kiln', catalogVersion: 'civ-sci-test-1', condition: 1,
    params: { heatCapJPerK: 40000, uaWPerK: 8, maxPowerW: 15000, forcedCoolingUaFactor: 5 } }],
  energy: [{ sourceId: 'src:heat', kind: 'heat', maxJ: 450000 }], actions: [{ at: 0, residentId: 'res:review', action: 'fire_plan', params: { pace: 1, targetGlow: 2, holdMin: 90, forcedCooling: 0 } }], seed: 7,
};
function run(base, totalMs, chunkMs, powerW, stop=false) {
  let state=null,last,used=0,checks=[];
  for(let from=0;from<totalMs;from+=chunkMs){
    const to=Math.min(totalMs,from+chunkMs);
    const req={...base,state,requestId:`req:${from}`,interval:{from,to},actions:from===0?base.actions:[],
      energy:[{...base.energy[0],maxJ:Math.floor(powerW*(to-from)/1000)}],stop:stop&&to===totalMs?'operator':undefined};
    last=scienceStep(req); state=last.state;used+=last.energy.reduce((s,e)=>s+e.usedJ,0);
    checks.push(...validateResult(req,last));
    if(last.status!=='running')break;
  }
  return {status:last.status,usedJ:used,endAt:last.simulated.to,phase:last.state.data?.phase,
    tempC:last.state.data?.chamberC??last.state.data?.kilnC,conversion:last.state.data?.ext,
    produced:last.produced,released:last.released,violations:checks};
}
const report={};
report.weakCalcine24h={one24h:run(CALC,86400000,86400000,600,true),hourly:run(CALC,86400000,3600000,600,true),per30s:run(CALC,86400000,30000,600,true)};
report.weakFiring24h={one24h:run(FIRE,86400000,86400000,1000,true),hourly:run(FIRE,86400000,3600000,1000,true),per30s:run(FIRE,86400000,30000,1000,true)};

const HYD={...CALC,processId:'p21x_lime_hydrate_test',energy:[],
  lots:[{lotId:'lot:lime',materialId:'quicklime',amount:{value:56080,unit:'mg'},location:'site:review',quality:{x_lime_ppm:1000000}},
    {lotId:'lot:water',materialId:'process_water',amount:{value:15000,unit:'mg'},location:'site:review'}],
  equipment:[{equipmentId:'eq:tub',kind:'fixture_slaking_tub',catalogEntry:'fixture_slaking_tub',catalogVersion:'civ-sci-test-1',condition:1,params:{heatCapJPerK:400,uaWPerK:1.5}}]};
function hydRun(chunkMs) {
  let state=null,last,used=0,violations=[];
  for(let from=0;from<43200000;from+=chunkMs){
    const req={...HYD,state,requestId:`h${from}`,interval:{from,to:Math.min(43200000,from+chunkMs)}};
    last=scienceStep(req);state=last.state;used+=last.energy.reduce((s,e)=>s+e.usedJ,0);violations.push(...validateResult(req,last));
    if(last.status!=='running')break;
  }
  return {status:last.status,usedJ:used,endAt:last.simulated.to,conversion:last.diagnostics?.conversion,produced:last.produced,released:last.released,violations};
}
report.hydration5svs1s={five:hydRun(5000),one:hydRun(1000)};

if(previousRoot) {
  if(!previousRoot.startsWith('/')) throw new Error('The pre-fix science checkout path must be absolute.');
  const {scienceStep:previousStep}=await import(pathToFileURL(`${previousRoot}/src/science/step/index.ts`));
  const saved=previousStep({...FIRE,interval:{from:0,to:60000}});
  const req={...FIRE,requestId:'restore',interval:{from:60000,to:90000},actions:[],state:JSON.parse(JSON.stringify(saved.state))};
  const restored=scienceStep(req);
  report.savedState={oldStatus:saved.status,oldSchema:saved.state.schema,processVersion:FIRE.processVersion,
    newStatus:restored.status,newSchema:restored.state.schema,notes:restored.evidence.notes,violations:validateResult(req,restored)};
}
console.log(JSON.stringify(report,null,2));
