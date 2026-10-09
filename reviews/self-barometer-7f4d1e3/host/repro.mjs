// Read-only full review of m03x host entry, versions, normal saved state and corrupt-state guards.
import {pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
const [base,out]=process.argv.slice(2),imp=p=>import(pathToFileURL(`${base}/${p}`).href);
const {scienceStep,EXECUTABLE_PROCESSES}=await imp('src/science/step/index.ts');
const {validateResult}=await imp('src/science/step/validate.ts');
const {BAROMETER_POT_PROCESS}=await imp('src/science/step/barometer-pot.ts');
const {TAR_SEAL_PROCESS,LEAK_TEST_PROCESS,POT_ASSEMBLY_TABLE,potToEquipmentParams,potQualityOnReturn}=await imp('src/science/step/vessel.ts');
const {POT_SHAPE_PROCESS,POT_DRY_PROCESS}=await imp('src/science/step/pottery.ts');
const {PIT_FIRE_PROCESS}=await imp('src/science/step/pit-fire.ts');
const {OIL_LAMP_PROCESS}=await imp('src/science/step/oil-lamp.ts');
const catalog=JSON.parse(readFileSync(`${base}/data/science/catalog-test-2.json`,'utf8'));
const world={worldId:'w',worldEpoch:'e',worldVersion:1},H=3600000,D=24*H,checks=[],violations=[],malformed=[],guardCases=[];
let executions=0;
const ck=(name,c,detail=null)=>checks.push({name,passed:!!c,detail});
function finiteAll(v){return typeof v==='number'?Number.isFinite(v):Array.isArray(v)?v.every(finiteAll):v&&typeof v==='object'?Object.values(v).every(finiteAll):true;}
function step(q){executions++;const r=scienceStep(q);violations.push(...validateResult(q,r).map(x=>`${q.requestId}: ${x}`));if(!finiteAll(r))violations.push(`${q.requestId}: nonfinite before serialization`);return r;}
const act=(at,action,params)=>({at,action,residentId:'res:lantern',...(params?{params}:{})});
const asLot=(p,id)=>({lotId:id,materialId:p.materialId,amount:p.amount,quality:p.quality,location:p.into??'site:shelf'});
const env=(from,o={})=>({sampleId:`env:${from}`,source:'record',effectiveAt:from,airTempC:28,humidity:.75,windMs:2,rainMmH:0,pressureHPa:1010,...o});
function req(process,runId,from,to,lots,equipment,actions=[],o={}){return{contract:'0.2.0',requestId:`${runId}@${from}`,world,runId,...process,catalogVersion:'civ-sci-test-2',interval:{from,to},state:null,environment:env(from),lots,equipment,actions,energy:[],seed:1,...o};}
// Generate a real500mL jar, then use p16x and its actual tubed output for the gauge equipment.
const clay={lotId:'lot:clay',materialId:'prepared_clay',amount:{value:5000000,unit:'mg'},location:'site:clay',quality:{water_ppm:200000,xd_kaolinite_ppm:600000,xd_quartz_ppm:380000}};
const shaped=step(req(POT_SHAPE_PROCESS,'run:shape',0,4*H,[clay],[],[act(0,'plan',{form:2,capacityMl:500})],{energy:[{sourceId:'src:hands',kind:'mechanical',maxJ:4*3600*20}]}));
const green=asLot(shaped.produced[0],'lot:green');let state=null,dried;
for(let from=0;from<8*D;from+=6*H){dried=step(req(POT_DRY_PROCESS,'run:dry',from,from+6*H,[green],[{equipmentId:'eq:rack',kind:'drying_rack',catalogEntry:'drying_rack',catalogVersion:'civ-sci-test-2',condition:1,params:{sunExposure:0}}],from+6*H>=8*D?[act(from+6*H-30000,'take_off')]:[],{state}));state=structuredClone(dried.state);if(dried.status!=='running')break;}
const dry=asLot(dried.produced[0],'lot:dry'),wood={lotId:'lot:wood',materialId:'firewood',amount:{value:40000000,unit:'mg'},location:'site:wood',quality:{water_ppm:150000}};
let fired,pot,winningSeed;
for(let seed=1;seed<50;seed++){state=null;for(let from=0;from<2*D;from+=3*H){fired=step(req(PIT_FIRE_PROCESS,'run:fire',from,from+3*H,[dry,wood],[{equipmentId:'eq:pit',kind:'open_fire_pit',catalogEntry:'open_fire_pit',catalogVersion:'civ-sci-test-2',condition:1,params:{}}],from===0?[act(0,'fire_plan',{preheatMin:60,pace:0,targetGlow:1,holdMin:30,forcedCooling:0})]:[],{state,seed,environment:env(from,{windMs:1})}));state=structuredClone(fired.state);if(fired.status!=='running')break;}const p=fired.produced.find(p=>p.materialId==='fired_pot');if(p&&(p.quality?.crack??0)===0){pot=asLot(p,'lot:pot');winningSeed=seed;break;}}
if(!pot)throw Error('no intact real500mL jar');
const tube={lotId:'lot:tube',materialId:'gauge_tube_test',amount:{value:40000,unit:'mg'},location:'site:tube',quality:{bore_mm:8,length_mm:600}};
const tar={lotId:'lot:tar',materialId:'wood_tar',amount:{value:30000,unit:'mg'},location:'site:tar',quality:{x_wood_tar_ppm:1000000}};
const brush={equipmentId:'eq:brush',kind:'fixture_tar_brush',catalogEntry:'fixture_tar_brush',catalogVersion:'civ-sci-test-2',condition:1};
const pit={equipmentId:'eq:pit',kind:'open_fire_pit',catalogEntry:'open_fire_pit',catalogVersion:'civ-sci-test-2',condition:1,params:{maxBurnKgPerH:3}};
const sealed=step(req(TAR_SEAL_PROCESS,'run:seal',0,H,[pot,tar,tube,wood],[brush,pit],[act(60000,'seal',{jointTarG:6})],{energy:[{sourceId:'src:hands',kind:'mechanical',maxJ:3600*20}]}));
const bulbLot=asLot(sealed.produced.find(p=>p.materialId==='fired_pot'),'lot:bulb');
const params={...potToEquipmentParams(bulbLot),markMm:5};
const equipment={equipmentId:'eq:bulb',kind:'assembled_pot',catalogEntry:'assembled_pot',catalogVersion:'civ-sci-test-2',condition:1,params};
const water={lotId:'lot:water',materialId:'process_water',amount:{value:20000,unit:'mg'},location:'site:jar',quality:{history_complete:1}};
const gauge=(from,to,actions=[],o={})=>req(BAROMETER_POT_PROCESS,'run:gauge',from,to,[water],[equipment],actions,o);
ck('actual shaped/dried/fired jar accepts tube sealing and table4',sealed.status==='completed'&&bulbLot.quality.tube_bore_mm===8&&POT_ASSEMBLY_TABLE==='civ-sci.pot-assembly/4'&&params.sealed===1&&params.airtightKnown===1&&params.airLeakTauMin>0&&params.bulbTauS>0,{winningSeed,pot,bulbLot,params});
for(const p of [TAR_SEAL_PROCESS,LEAK_TEST_PROCESS,BAROMETER_POT_PROCESS]){const e=catalog.processes.find(x=>x.id===p.processId);ck(`${p.processId}: one entry, current version, declared clock`,EXECUTABLE_PROCESSES.filter(x=>x===p.processId).length===1&&e?.version===p.processVersion&&e.clock===(p===TAR_SEAL_PROCESS?'world':'island'),e);}
let first=step(gauge(1007,61007,[act(1007,'read_gauge'),act(17119,'read_gauge')]));
ck('fresh actual gauge has recognized new state',first.status==='running'&&first.state.schema==='civ-sci.air-barometer-pot/1');
const common=gauge(61007,121007,[act(110007,'read_gauge')],{environment:env(61007,{pressureHPa:1008}),state:first.state});
const restored=step({...common,state:JSON.parse(JSON.stringify(first.state))});
const direct=step(common);ck('ordinary JSON save/restore gives exactly same response',JSON.stringify(restored)===JSON.stringify(direct));
for(const schema of ['civ-sci.air-barometer-pot/0','civ-sci.air-barometer-pot/2','civ-sci.air-barometer/3','civ-sci.oil-lamp/2']){const r=step({...common,state:{schema,data:structuredClone(first.state.data)}});ck(`foreign/old/future schema ${schema} refuses without settlement`,r.status==='failed'&&r.consumed.length===0&&(/unsupported-state-schema|unknown state schema/.test(r.evidence.notes)),r.evidence.notes);}
for(const contract of ['0.1.0','0.1.7','0.2.0','0.2.1','0.3.0']){const r=step(gauge(0,60000,[act(17119,'read_gauge')],{contract}));ck(`${contract}: current supported contract and drawn shape`,/^0\.[12]\./.test(contract)?r.status==='running'&&(contract.startsWith('0.2.')?Array.isArray(r.drawn):!Object.hasOwn(r,'drawn')):r.status==='failed');}
const oldSealing=step(req({...TAR_SEAL_PROCESS,processVersion:'0.1.2'},'run:old-seal',0,H,[pot,tar],[brush],[],{energy:[{sourceId:'src:hands',kind:'mechanical',maxJ:3600*20}]}));
const oldLeak=step(req({...LEAK_TEST_PROCESS,processVersion:'0.1.3'},'run:old-leak',0,H,[pot],[{equipmentId:'eq:stand',kind:'fixture_vessel_stand',catalogEntry:'fixture_vessel_stand',catalogVersion:'civ-sci-test-2',condition:1}],[]));
ck('old p16x/p17x versions fail before settlement; host can release reservations',[oldSealing,oldLeak].every(r=>r.status==='failed'&&/processVersion/.test(r.evidence.notes)&&r.consumed.length===0));
const wornLot={...bulbLot,quality:potQualityOnReturn(bulbLot.quality,.9)};
const wornParams={...potToEquipmentParams(wornLot),markMm:5};
const worn=step(gauge(0,H,[],{equipment:[{...equipment,params:wornParams}]}));
ck('actually returned worn sealed bulb refuses gauge until airtightness known',wornLot.quality.sealed===1&&wornParams.airtightKnown===0&&worn.status==='failed'&&/air-holding known/.test(worn.evidence.notes),{wornParams,reason:worn.evidence.notes});
// Known data survive equipment-lost through interval.to; a new run with no equipment fails plainly, without exceptions.
const wholeLost=step(gauge(1007,121007,[act(61007,'read_gauge'),act(110007,'read_gauge')],{stop:'equipment-lost'}));
const splitA=step(gauge(1007,61007));
const splitB=step(gauge(61007,121007,[act(61007,'read_gauge'),act(110007,'read_gauge')],{state:JSON.parse(JSON.stringify(splitA.state)),stop:'equipment-lost',equipment:[]}));
ck('equipment lost at end retains earlier reads, settlement and final state',[wholeLost,splitB].every(r=>r.status==='stopped'&&r.simulated.to===121007)&&JSON.stringify([wholeLost.state,wholeLost.produced,wholeLost.released,wholeLost.observations])===JSON.stringify([splitB.state,splitB.produced,splitB.released,splitB.observations]));
for(const contract of ['0.1.0','0.2.0']){const r=step(gauge(0,H,[],{contract,stop:'equipment-lost',equipment:[]}));ck(`initial equipment-lost ${contract} plain refusal without consumption`,r.status==='failed'&&r.consumed.length===0&&/lost before/.test(r.evidence.notes)&&(contract==='0.1.0'?!Object.hasOwn(r,'drawn'):Array.isArray(r.drawn)));}
const reversed=step({...common,equipment:[{...equipment,params:Object.fromEntries(Object.entries(params).reverse())}]});ck('equipment parameter key order is irrelevant',JSON.stringify(reversed)===JSON.stringify(direct));
for(const change of [{kind:'water-mass',lots:[{...water,amount:{value:20001,unit:'mg'}}]},{kind:'water-location',lots:[{...water,location:'site:elsewhere'}]},{kind:'equipment-param',equipment:[{...equipment,params:{...params,markMm:10}}]}]){const {kind,...o}=change;const r=step({...common,...o});ck(`${kind} mutation during reservation plainly refused`,r.status==='failed'&&/changed-input/.test(r.evidence.notes)&&r.consumed.length===0);}
const gapReq=gauge(61007,3661007,[act(71007,'read_gauge')],{state:JSON.parse(JSON.stringify(first.state)),environment:env(61007,{source:'unknown'})});
const gap=step(gapReq),taken=step(gauge(3661007,3721007,[act(3691007,'take_out')],{state:gap.state,environment:env(3661007,{source:'unknown'})}));
ck('unknown current interval provides no numeric reads and marks returned water incomplete',gap.observations.length===0&&taken.produced[0].quality.history_complete===0);
const returnedWater=asLot(taken.produced[0],'lot:returned-water');
const reset=step(gauge(4000000,4060000,[act(4030000,'read_gauge'),act(4059999,'take_out')],{runId:'run:new-gauge',lots:[returnedWater]}));
ck('returned incomplete water permits freshly set known gauge; provenance stays incomplete',reset.status==='completed'&&reset.observations.some(o=>o.value===0&&o.unit==='mark')&&reset.produced[0].quality.history_complete===0,{water:returnedWater,observations:reset.observations});
// Accepted normal environment sources plus field-level unknown and nonfinite input checks.
const environments=[...['record','live','simulation','unknown','stale'].map(source=>({label:source,e:env(61007,{source})})),{label:'temperature missing',e:env(61007,{airTempC:undefined})},{label:'pressure missing',e:env(61007,{pressureHPa:undefined})},{label:'temperature NaN',e:env(61007,{airTempC:NaN})},{label:'pressure Infinity',e:env(61007,{pressureHPa:Infinity})}];
for(const {label,e}of environments){const r=step(gauge(61007,121007,[act(71007,'read_gauge')],{state:JSON.parse(JSON.stringify(first.state)),environment:e}));guardCases.push({label,status:r.status,observations:r.observations,diagnostics:r.diagnostics});ck(`${label}: continued data stays finite and valid`,r.status==='running'&&finiteAll(r));const initial=step(gauge(0,60000,[],{environment:{...e,effectiveAt:0}}));ck(`${label}: first request only sets known temperature and pressure`,['record','live','simulation'].includes(label)?initial.status==='running':initial.status==='failed');}
const observations=[...first.observations,...direct.observations,...wholeLost.observations,...reset.observations,...guardCases.flatMap(c=>c.observations)];
ck('numbers given to residents are integer marks only',observations.every(o=>o.value===undefined||(Number.isSafeInteger(o.value)&&o.unit==='mark'&&o.precision===1&&o.quantity==='level')));
ck('observation text never gives hidden pressure, temperature, gas or leak time',observations.every(o=>!o.text||!/hPa|Pa|°C|τ|tau|分|時間|気圧が[0-9]|漏れ.*[0-9]/.test(o.text)));
// Corrupt save handling is the carried C2 scope; do not pretend a hand-edited state is a normal returned state.
const malformedValues=[{label:'null data',data:null},{label:'array data',data:[]},{label:'empty object',data:{}},{label:'missing g from a valid state',data:(()=>{const x=structuredClone(first.state.data);delete x.g;return x;})()},{label:'missing s from a valid state',data:(()=>{const x=structuredClone(first.state.data);delete x.s;return x;})()},{label:'missing ctl from a valid state',data:(()=>{const x=structuredClone(first.state.data);delete x.ctl;return x;})()}];
for(const {label,data}of malformedValues){let answer;try{const r=scienceStep({...common,state:{schema:first.state.schema,data}});answer={status:r.status,reason:r.evidence.notes,finite:finiteAll(r)};}catch(e){answer={exception:`${e.name}: ${e.message}`};}malformed.push({label,...answer});}
ck('carried malformed-save C2 is reproduced separately from normal state',malformed.some(x=>x.exception)&&JSON.stringify(restored)===JSON.stringify(direct),malformed);
const oil= {lotId:'lot:oil',materialId:'coconut_oil',amount:{value:60000,unit:'mg'},location:'site:oil',quality:{x_coconut_fat_ppm:1000000}};
const wick={lotId:'lot:wick',materialId:'lamp_wick',amount:{value:2000,unit:'mg'},location:'site:hands',quality:{fiber:1,diameter_mm:4,char_ppm:0}};
const lampEq={equipmentId:'eq:dish',kind:'lamp_dish',catalogEntry:'lamp_dish',catalogVersion:'civ-sci-test-2',condition:1,params:{capacityMl:80,massG:120,absorptionPpm:130000,shelter:.8,roofed:1}};
let lampCorrupt;try{const r=scienceStep(req(OIL_LAMP_PROCESS,'run:corrupt-lamp',0,H,[oil,wick],[lampEq],[],{state:{schema:'civ-sci.oil-lamp/2',data:null}}));lampCorrupt={status:r.status,reason:r.evidence.notes};}catch(e){lampCorrupt={exception:`${e.name}: ${e.message}`};}
ck('old oil-lamp malformed-save C2 still behaves as a corrupt-state corner',!!lampCorrupt.exception,lampCorrupt);
ck('all ordinary accepted/rejected host results validate',violations.length===0,violations);
const result={target:'7f4d1e3c50e29f1ecde7382219f13f19c32777d4',scope:'host guards, versions, world/island entry, actual assembled vessel, saved state, resident observations',assertions:checks.length,failed:checks.filter(x=>!x.passed).length,executions,checks,violations,actual:{winningSeed,pot,bulbLot,params},malformed,lampCorrupt,guardCases,waterHistory:{taken,reset},findings:[{id:'HOST-C2',classification:'C',summary:'Current-schema null/missing state members can throw; normal returned JSON states are exact and finite. This includes the carried lamp C2 and new m03x.'}],hostConditions:['Every run uses one island clock for interval/actions/effectiveAt; sealing hand work is on world time.','Unknown environmental state must be sent as field missing/source unknown, never re-use a live weather sample that did not cover the interval.','Old version/schema failure is a cancellation: release reserved lots; no partial consumption was committed by this request.','Fresh setup with returned water history0 is physically re-set at known weather; its ledger provenance remains0.']};
writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({assertions:result.assertions,failed:result.failed,executions,violations:violations.length,malformed}));
