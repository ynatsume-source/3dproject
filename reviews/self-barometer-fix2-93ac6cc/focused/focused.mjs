// Focused independent check for 93ac6cc: held-pressure reads, missing cells and current /2 restoration.
// Run in target: node --import tsx --import ./scripts/node-assets.mjs /absolute/focused.mjs TARGET RESULT.json
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const target = process.argv[2];
const mod = async p => import(pathToFileURL(`${target}/src/science/step/${p}.ts`).href);
const { scienceStep } = await mod('index');
const { BAROMETER_POT_PROCESS } = await mod('barometer-pot');
const { TAR_SEAL_PROCESS, potToEquipmentParams } = await mod('vessel');
const { validateResult } = await mod('validate');
const H = 3600000, world = { worldId:'w', worldEpoch:'e', worldVersion:1 };
const clone = x => JSON.parse(JSON.stringify(x));
const checks=[], violations=[], cases=[];
let requests = 0;
const check = (name, passed, detail) => checks.push({name,passed:!!passed,...(detail===undefined?{}:{detail})});
const step = q => { requests++; const r=scienceStep(q); violations.push(...validateResult(q,r).map(v=>`${q.requestId}: ${v}`)); return r; };
const seal = step({contract:'0.2.1',...TAR_SEAL_PROCESS,catalogVersion:'civ-sci-test-2',requestId:'fixture',runId:'seal',world,interval:{from:0,to:H},state:null,
 environment:{sampleId:'e',source:'simulation',effectiveAt:0,airTempC:28},lots:[
  {lotId:'pot',materialId:'fired_pot_test',amount:{value:600000,unit:'mg'},location:'shelf',quality:{capacity_ml:500,absorption_ppm:120000}},
  {lotId:'tar',materialId:'wood_tar',amount:{value:30000,unit:'mg'},location:'shelf',quality:{x_wood_tar_ppm:1000000}},
  {lotId:'tube',materialId:'gauge_tube_test',amount:{value:40000,unit:'mg'},location:'shelf',quality:{bore_mm:8,length_mm:600}},
  {lotId:'wood',materialId:'firewood',amount:{value:2000000,unit:'mg'},location:'shelf',quality:{water_ppm:150000}}],
 equipment:[{equipmentId:'brush',kind:'fixture_tar_brush',catalogEntry:'fixture_tar_brush',catalogVersion:'civ-sci-test-2',condition:1},
  {equipmentId:'fire',kind:'open_fire_pit',catalogEntry:'open_fire_pit',catalogVersion:'civ-sci-test-2',condition:1,params:{maxBurnKgPerH:3}}],
 energy:[{sourceId:'hands',kind:'mechanical',maxJ:72000}],seed:1,actions:[{at:60000,action:'seal',residentId:'lantern',params:{jointTarG:6}}]});
const p=seal.produced.find(x=>x.materialId==='fired_pot_test');
if(!p)throw new Error('fixture sealing failed');
const lot={lotId:'sealed',materialId:p.materialId,amount:p.amount,quality:p.quality,location:p.into};
const bulb={equipmentId:'bulb',kind:'assembled_pot',catalogEntry:'assembled_pot',catalogVersion:'civ-sci-test-2',condition:1,params:{...potToEquipmentParams(lot),markMm:5}};
const water={lotId:'water',materialId:'process_water',amount:{value:20000,unit:'mg'},location:'jar',quality:{history_complete:1}};
const physical=r=>({state:r.state,consumed:r.consumed,produced:r.produced,released:r.released,energy:r.energy,equipmentWear:r.equipmentWear});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const nums=r=>r.observations.filter(o=>o.value!==undefined);
const req=(from,to,state,contract,env={},reads=[],extra={})=>({contract,...BAROMETER_POT_PROCESS,catalogVersion:'civ-sci-test-2',requestId:`q:${contract}:${from}:${to}`,runId:'gauge',world,interval:{from,to},state,
 environment:{sampleId:'env',source:'record',effectiveAt:from,airTempC:28,pressureHPa:1010,...env},lots:[water],equipment:[bulb],energy:[],seed:1,
 actions:reads.map(at=>({at,action:'read_gauge',residentId:'lantern'})),...extra});
const origin=1007;
for(const contract of ['0.1.0','0.1.7','0.2.0','0.2.1']){
 const a=step(req(origin,origin+30000,null,contract));
 const missing=step(req(origin+30000,origin+45000,clone(a.state),contract,{pressureHPa:undefined},[origin+30000,origin+44999]));
 check(`${contract}: unknown cell starts and gives no numeric read`,missing.state.data.ctl.pKnown===false&&!nums(missing).length);
 const recovery=step(req(origin+45000,origin+60001,clone(missing.state),contract,{},[origin+45000,origin+59999,origin+60000]));
 check(`${contract}: known weather mid-unknown-cell gives no number until next cell`,!nums(recovery).some(o=>o.at<origin+60000)&&nums(recovery).some(o=>o.at===origin+60000),recovery.observations);
 const quiet=step(req(origin+45000,origin+60001,clone(missing.state),contract));
 check(`${contract}: recovery reads do not mutate held physics`,equal(physical(recovery),physical(quiet)));
 const splitA=step(req(origin+45000,origin+60000,clone(missing.state),contract,{},[origin+45000,origin+59999]));
 const splitB=step(req(origin+60000,origin+60001,clone(splitA.state),contract,{},[origin+60000]));
 check(`${contract}: recovery boundary partition yields exact float state and readings`,equal(physical(recovery),physical(splitB))&&equal(recovery.observations,[...splitA.observations,...splitB.observations]));
 const beforeMissing=step(req(origin+30000,origin+35000,clone(a.state),contract,{},[origin+30000]));
 const newGap=step(req(origin+35000,origin+40000,clone(beforeMissing.state),contract,{pressureHPa:undefined},[origin+35000,origin+39999]));
 check(`${contract}: current missing weather suppresses reads even with a known held cell`,newGap.state.data.ctl.pKnown&&!nums(newGap).length);
 const newGapQuiet=step(req(origin+35000,origin+40000,clone(beforeMissing.state),contract,{pressureHPa:undefined}));
 check(`${contract}: gap reads do not mutate known held physics`,equal(physical(newGap),physical(newGapQuiet)));
 const decoded=step(req(origin+60001,origin+120000,clone(recovery.state),contract,{pressureHPa:1009},[origin+60737,origin+90000],{stop:'operator'}));
 const direct=step(req(origin+60001,origin+120000,recovery.state,contract,{pressureHPa:1009},[origin+60737,origin+90000],{stop:'operator'}));
 check(`${contract}: fresh /2 restore survives JSON at an off-grid boundary`,recovery.state.schema==='civ-sci.air-barometer-pot/2'&&equal(decoded,direct));
 const quietTail=step(req(origin+60001,origin+120000,clone(recovery.state),contract,{pressureHPa:1009},[],{stop:'operator'}));
 check(`${contract}: reads inside and on cell edges do not change final physics`,equal(physical(decoded),physical(quietTail)));
 const old=step(req(origin+60001,origin+120000,clone(recovery.state),contract,{},[],{processVersion:'0.1.1',stop:'operator'}));
 check(`${contract}: old processVersion rejected without consumption despite schema /2`,old.status==='failed'&&/unknown processVersion 0.1.1/.test(old.evidence.notes)&&!old.consumed.length&&!old.produced.length&&!old.released.length&&equal(old.state,recovery.state));
 const legacy=step(req(origin+60001,origin+120000,{schema:'civ-sci.air-barometer-pot/1',data:clone(recovery.state.data)},contract));
 check(`${contract}: old /1 state still explicitly rejected`,legacy.status==='failed'&&/unsupported-state-schema/.test(legacy.evidence.notes)&&!legacy.consumed.length);
 for(const takeAt of [origin+60001,origin+60737,origin+90000]){
  const stop=step(req(origin+60001,takeAt,clone(recovery.state),contract,{},[],{stop:'operator'}));
  const take=step(req(origin+60001,takeAt+1,clone(recovery.state),contract,{},[takeAt],{actions:[{at:takeAt,action:'take_out',residentId:'lantern'}]}));
  check(`${contract}: take_out at ${takeAt-origin} agrees with stopping there`,equal(physical(stop),physical(take)));
 }
 check(`${contract}: drawn follows contract`,(/^0\.2\./.test(contract)?equal(decoded.drawn,[]):!Object.hasOwn(decoded,'drawn')));
 cases.push({contract,unknownCtl:missing.state.data.ctl,recoveryObservations:recovery.observations,currentGapObservations:newGap.observations,restoredStatus:decoded.status,oldVersionRefusal:old.evidence.notes});
}
check('all results pass current contract validator',violations.length===0,violations.slice(0,10));
const result={target:'93ac6cc',fixture:{process:TAR_SEAL_PROCESS,params:bulb.params},cases,checks,summary:{requests,checks:checks.length,failed:checks.filter(c=>!c.passed).length,validatorFailures:violations.length}};
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.summary,null,2));
if(result.summary.failed)process.exitCode=1;
