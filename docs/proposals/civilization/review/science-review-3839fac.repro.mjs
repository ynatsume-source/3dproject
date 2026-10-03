// Read-only science review diagnostics for 3839fac (fixture-2, drying 0.3.0, wood fire).
// Usage: node --import tsx <this file> /absolute/3839fac /absolute/7da1db7
// The optional second checkout enables full-output electric-kiln before/after comparisons.
// No source files or world state are written. Exit 0 means the diagnostics ran, not that all cases passed.
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=process.argv[2], prev=process.argv[3];
if(!root?.startsWith('/') || (prev && !prev.startsWith('/'))) throw new Error('Pass absolute science checkout paths.');
const get=(p,r=root)=>import(pathToFileURL(`${r}/${p}`));
const {scienceStep}=await get('src/science/step/index.ts');
const {validateResult}=await get('src/science/step/validate.ts');
const {fuelComp}=await get('src/science/step/wood-fire.ts');
const {tileComp}=await get('src/science/step/common.ts');
const {addComp,elementMoles,totalMg,splitComp}=await get('src/science/chem.ts');
const H=3600000, W={worldId:'w',worldEpoch:'e',worldVersion:1};
const TILE={lotId:'lot:tile',materialId:'test_tile_dry',amount:{value:37037,unit:'mg'},location:'site:hearth',quality:{water_ppm:20169,thickness_mm:10,width_mm:50,length_mm:50,xd_kaolinite_ppm:450000,xd_quartz_ppm:300000,xd_calcite_ppm:20000,crack:0,history_complete:1}};
const wood=(kg=60,water=150000,ash=10000)=>({lotId:'lot:wood',materialId:'firewood',amount:{value:Math.round(kg*1e6),unit:'mg'},location:'site:woodpile',quality:{water_ppm:water,ash_dry_ppm:ash}});
const KILN={equipmentId:'eq:wk',kind:'fixture_wood_kiln',catalogEntry:'fixture_wood_kiln',catalogVersion:'civ-sci-test-2',condition:1,params:{heatCapJPerK:40000,uaWPerK:8,chamberFraction:.3,maxBurnKgPerH:15,forcedCoolingUaFactor:5}};
const ENV={sampleId:'env:probe',source:'live',effectiveAt:0,airTempC:28,humidity:.7,windMs:3};
const PLAN=[{at:0,residentId:'res:dot',action:'fire_plan',params:{pace:1,targetGlow:2,holdMin:90,forcedCooling:0}}];
const base=(o={})=>({contract:'0.2.0',requestId:'r0',world:W,runId:'run:wf',processId:'p13w_test_tile_wood_fire',processVersion:'0.1.0',catalogVersion:'civ-sci-test-2',interval:{from:0,to:H},state:null,environment:ENV,lots:[TILE,wood()],equipment:[KILN],energy:[],actions:PLAN,seed:3,...o});
function safe(req,step=scienceStep){try{const r=step(req);return {r,violations:validateResult(req,r)}}catch(e){return {exception:String(e)}}}
function run(chunkMs,o={},stopAt=48*H,step=scienceStep,reqFn=(q)=>q){
 let state=null,usedJ=0,storedJ=0,lostJ=0,last,checks=[],n=0;
 const hash=createHash('sha256');
 for(let from=0;from<stopAt;from+=chunkMs){
  const to=Math.min(stopAt,from+chunkMs);
  let req=base({...o,requestId:`r:${from}`,state,interval:{from,to},actions:from===0?(o.actions??PLAN):[],stop:to===stopAt?'operator':undefined});
  req=reqFn(req);
  const out=safe(req,step); if(out.exception)return {exception:out.exception,from,n};
  last=out.r; state=JSON.parse(JSON.stringify(last.state));n++;checks.push(...out.violations);hash.update(JSON.stringify(last));
  for(const e of last.energy){usedJ+=e.usedJ;storedJ+=e.storedJ??0;lostJ+=e.lostJ;}
  if(last.status!=='running')break;
 }
 return {last,usedJ,storedJ,lostJ,n,violations:checks,sha256:hash.digest('hex')};
}
function brief(x){return x.exception?x:{status:x.last.status,usedJ:x.usedJ,storedJ:x.storedJ,lostJ:x.lostJ,at:x.last.simulated.to,diagnostics:x.last.diagnostics,produced:x.last.produced,released:x.last.released,drawn:x.last.drawn,violations:x.violations,n:x.n,sha256:x.sha256};}
function balance(result,lots){
 if(result.exception)return {exception:result.exception};
 const r=result.last; let cin={},cout={};
 for(const l of lots)cin=addComp(cin,l.materialId==='firewood'?fuelComp(l):tileComp(l));
 for(const f of r.drawn??[])cin=addComp(cin,{[f.materialId]:f.amount.value});
 for(const f of r.produced){if(f.materialId==='firewood')cout=addComp(cout,fuelComp({...f,lotId:'lot:rest'}));else if(f.materialId==='wood_ash')cout=addComp(cout,{ash:f.amount.value});else cout=addComp(cout,tileComp({...f,lotId:'lot:out'}));}
 for(const f of r.released)cout=addComp(cout,{[{water_vapour:'water',process_co2:'co2'}[f.materialId]]:f.amount.value});
 const ei=elementMoles(cin),eo=elementMoles(cout);
 return {massInMg:totalMg(cin),massOutMg:totalMg(cout),elementDifferenceMol:Object.fromEntries(Object.keys(ei).map(k=>[k,eo[k]-ei[k]])),consumed:r.consumed,produced:r.produced};
}
const report={};
report.partitions=[H,30000,7*H,7300,1000,737].map(chunk=>({chunk,...brief(run(chunk))}));
report.massSweep=[];
for(const [kg,water,ash] of [[60,0,0],[60,150000,10000],[60,600000,200000],[.000001,0,0],[.000003,333333,200000],[8,150000,10000],[60,300000,10000]]){
 const lots=[TILE,wood(kg,water,ash)],r=run(H,{lots});report.massSweep.push({kg,water,ash,...brief(r),balance:balance(r,lots)});
}
const first=scienceStep(base());
report.endings={};
for(const stop of ['operator','equipment-lost','world-pause','shutdown'])report.endings[stop]=safe(base({state:first.state,interval:{from:H,to:2*H},actions:[],stop,...(stop==='equipment-lost'?{equipment:[]}: {})}));
report.endings.freshEquipmentLost=safe(base({stop:'equipment-lost',equipment:[]}));
report.endings.unknown=safe(base({state:first.state,interval:{from:H,to:2*H},actions:[],environment:{...ENV,source:'unknown'}}));
report.incompleteFuel=brief(run(H,{lots:[TILE,{...wood(),quality:{...wood().quality,history_complete:0}}]}));
report.tinyStops=[0,1,2,10,1000].map(ms=>({ms,...safe(base({interval:{from:0,to:ms},stop:'operator'}))}));
report.refusals02=['p12x_test_tile_dry','fixture_mass_measure','p20x_lime_calcine_test','p13x_test_tile_fire','m01x_tile_soak_test','not-implemented'].map(processId=>({processId,...safe(base({processId}))}));
// A well-formed, mass-balanced 0.2 result with forbidden double accounting of the same internal source.
const sample=scienceStep(base());
const forged={...sample,energy:[{sourceId:'src:combustion:run:wf',kind:'heat',usedJ:10,storedJ:0,lostJ:10}]};
report.validatorMutations={};
for(const [name,changed] of [
 ['missingDrawn',Object.fromEntries(Object.entries(sample).filter(([k])=>k!=='drawn'))],
 ['invalidOrigin',{...sample,drawn:[{materialId:'o2',amount:{value:0,unit:'mg'},from:'nowhere'}]}],
 ['negativeDrawn',{...sample,drawn:[{materialId:'o2',amount:{value:-1,unit:'mg'},from:'air'}]}],
 ['fractionalDrawn',{...sample,drawn:[{materialId:'o2',amount:{value:.5,unit:'mg'},from:'air'}]}],
 ['wrongUnit',{...sample,drawn:[{materialId:'o2',amount:{value:0,unit:'kg'},from:'air'}]}],
 ['extraO2',{...sample,drawn:[{materialId:'o2',amount:{value:1,unit:'mg'},from:'air'}]}],
 ['negativeUsedJ',{...sample,energy:[{sourceId:'src:combustion:run:wf',kind:'heat',usedJ:-1,storedJ:0,lostJ:-1}]}],
 ['failedWithFlows',{...sample,status:'failed'}]
])report.validatorMutations[name]=validateResult(base(),changed);
report.validatorMutations.extraDrawn01=validateResult(base({contract:'0.1.0'}),{...sample,contract:'0.1.0'});
report.validatorInternalOffer=validateResult(base({energy:[{sourceId:'src:combustion:run:wf',kind:'heat',maxJ:10}]}),forged);
if(prev){
 const {scienceStep:before}=await get('src/science/step/index.ts',prev);
 const eq={...KILN,kind:'fixture_kiln',catalogEntry:'fixture_kiln',params:{heatCapJPerK:40000,uaWPerK:8,maxPowerW:15000,forcedCoolingUaFactor:5}};
 const electric={contract:'0.1.0',processId:'p13x_test_tile_fire',processVersion:'0.2.0',lots:[TILE],equipment:[eq]};
 const supply=q=>({...q,energy:[{sourceId:'src:heater',kind:'heat',maxJ:15*(q.interval.to-q.interval.from)}]});
 report.electricBeforeAfter=[];
 for(const [name,chunk,over,end] of [['normal',H,{},48*H],['off-grid',7300,{},48*H],['stop',H,{},3*H],['forced',H,{actions:[{...PLAN[0],params:{...PLAN[0].params,forcedCooling:1}}]},48*H],['crack2',H,{lots:[{...TILE,quality:{...TILE.quality,crack:2}}]},48*H]]){
  const now=run(chunk,{...electric,...over},end,scienceStep,supply),old=run(chunk,{...electric,...over},end,before,supply);
  report.electricBeforeAfter.push({name,equal:now.sha256===old.sha256,before:old.sha256,after:now.sha256,usedJ:now.usedJ,violations:now.violations});
 }
}
const SHAPE = base({contract:'0.1.0',processId:'p11x_test_tile_shape',processVersion:'fixture-2',interval:{from:0,to:60000},environment:{...ENV,source:'simulation'},
  lots:[{...TILE,materialId:'prepared_clay',amount:{value:45000,unit:'mg'},quality:{water_ppm:193548,xd_kaolinite_ppm:450000,xd_quartz_ppm:300000,xd_calcite_ppm:20000,history_complete:0}}],
  equipment:[{equipmentId:'eq:bench',kind:'fixture_bench',catalogEntry:'fixture_bench',catalogVersion:'civ-sci-test-2',condition:1,params:{widthMm:50,lengthMm:50,thicknessMm:10}}],
  energy:[{sourceId:'src:work',kind:'mechanical',maxJ:120}],actions:[]});
report.shaping = {};
for(const mg of [37499,37500,45000,57500,57501])report.shaping[`mass${mg}`]=safe({...SHAPE,lots:[{...SHAPE.lots[0],amount:{value:mg,unit:'mg'}}]});
for(const j of [0,40])for(const stop of ['operator','equipment-lost','shutdown','world-pause'])report.shaping[`${stop}${j}`]=safe({...SHAPE,stop,energy:[{...SHAPE.energy[0],maxJ:j}]});
for(const [name,q] of [['negative',{xd_quartz_ppm:-1}],['overfull',{xd_quartz_ppm:900000}],['unknown',{xd_unknown_ppm:1}]])report.shaping[name]=safe({...SHAPE,lots:[{...SHAPE.lots[0],quality:{...SHAPE.lots[0].quality,...q}}]});
report.shapingDownstream = ['overfull','unknown','negative'].map(name => {
 const shapedResult=report.shaping[name].r;
 const product=shapedResult?.produced?.[0];
 if(!product)return {name,shapeStatus:shapedResult?.status,notes:'Shaping refused this input; downstream check skipped.'};
 return {name,...safe(base({lots:[{...product,lotId:'lot:shaped',location:product.into},wood()]}))};
});
const shaped=scienceStep(SHAPE).produced[0];
const DRY=base({contract:'0.1.0',processId:'p12x_test_tile_dry',processVersion:'0.3.0',interval:{from:0,to:30000},actions:[],energy:[],
 lots:[{...shaped,lotId:'lot:green',location:'site:rack'}],equipment:[{equipmentId:'eq:rack',kind:'drying_rack',catalogEntry:'drying_rack',catalogVersion:'civ-sci-test-2',condition:1,params:{sunExposure:0}}]});
const {dryPhysics}=await get('src/science/physics.ts');
report.wind=[];
for(const wind of [0,3,10]){
 const out=scienceStep({...DRY,environment:{...ENV,windMs:wind}}),d=out.state.data,water0=Math.round(45000*193548/1e6);
 const expected=dryPhysics({waterMg:water0,dryMg:45000-water0,shapedWaterRatio:shaped.quality.shaped_water_ratio_ppm/1e6,linearShrink:0,dimsMm:{w:50,l:50,t:10},airTempC:28,rh:.7,windMs:wind*.6,sun:0,dtS:30});
 report.wind.push({wind10m:wind,wind1m:wind*.6,actualEvapMg:d.evaporatedMg,expectedEvapMg:expected.evapExactMg,match:d.evaporatedMg===expected.evapExactMg,violations:validateResult({...DRY,environment:{...ENV,windMs:wind}},out)});
}
console.log(JSON.stringify(report,null,2));
