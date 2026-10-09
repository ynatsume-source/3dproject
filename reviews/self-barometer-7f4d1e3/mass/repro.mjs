import path from 'node:path';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs';
const target=process.argv[2]??'/tmp/self-barometer-7f4d1e3';
const imp=p=>import(pathToFileURL(path.join(target,p)).href);
const {scienceStep}=await imp('src/science/step/index.ts');
const {TAR_SEAL_PROCESS,LEAK_TEST_PROCESS,readPot,potToEquipmentParams,potQualityOnReturn,potSherdsQuality}=await imp('src/science/step/vessel.ts');
const {BAROMETER_POT_PROCESS}=await imp('src/science/step/barometer-pot.ts');
const {POT_SHAPE_PROCESS,POT_DRY_PROCESS}=await imp('src/science/step/pottery.ts');
const {PIT_FIRE_PROCESS}=await imp('src/science/step/pit-fire.ts');
const {validateResult}=await imp('src/science/step/validate.ts');
const H=3600000,D=24*H;
const lot=(id,materialId,mg,quality={},location='shelf')=>({lotId:id,materialId,amount:{value:mg,unit:'mg'},location,quality});
const eq=(id,kind,params={})=>({equipmentId:id,kind,condition:1,catalogEntry:kind,catalogVersion:'civ-sci-test-2',params});
const act=(at,action,params)=>({at,residentId:'res:lantern',action,...(params?{params}:{})});
const q=(process,from,to,lots,state=null,actions=[],o={})=>({contract:'0.2.0',requestId:'r:'+from,runId:'run:'+process.processId,world:{worldId:'w',worldEpoch:'e',worldVersion:1},...process,catalogVersion:'civ-sci-test-2',interval:{from,to},state,environment:{sampleId:'env:'+from,source:'record',effectiveAt:from,airTempC:28,humidity:.75,windMs:2,rainMmH:0,pressureHPa:1010},lots,equipment:[],energy:[],seed:1,actions,...o});
const sum=xs=>xs.reduce((n,x)=>n+x.amount.value,0);
const bal=r=>({in:sum(r.consumed)+sum(r.drawn??[]),out:sum(r.produced)+sum(r.released)});
const violations=[];let calls=0;const step=q=>{const r=scienceStep(q);calls++;violations.push(...validateResult(q,r).map(v=>`${q.processId}:${v}`));return r};
const back=(p,id='back')=>lot(id,p.materialId,p.amount.value,p.quality,p.into??'shelf');
const potOf=r=>back(r.produced.find(p=>['fired_pot','fired_pot_test'].includes(p.materialId)));
const fixture=()=>lot('pot','fired_pot_test',600000,{capacity_ml:500,absorption_ppm:120000,history_complete:1});
const seal=(pot,lengthMm=600,tarMg=95000,jointG=60)=>step(q(TAR_SEAL_PROCESS,0,H,[pot,lot('tar','wood_tar',tarMg,{x_wood_tar_ppm:1000000,history_complete:1}),lot('tube','gauge_tube_test',40000,{bore_mm:8,length_mm:lengthMm,history_complete:1}),lot('wood','firewood',2000000,{water_ppm:150000,history_complete:1})],null,[act(60000,'seal',{jointTarG:jointG})],{equipment:[eq('brush','fixture_tar_brush'),eq('fire','open_fire_pit')],energy:[{sourceId:'hands',kind:'mechanical',maxJ:20*3600}]}));
const leak=(pot)=>step(q(LEAK_TEST_PROCESS,0,6*H,[pot],null,[act(6*H-30000,'take_out')],{equipment:[eq('stand','fixture_vessel_stand',{sunExposure:0})]}));
const fixtureSealedR=seal(fixture()),fixtureSealed=potOf(fixtureSealedR), fixtureLeakR=leak(fixtureSealed), fixtureLeak=potOf(fixtureLeakR);
const bulb=pot=>eq('bulb','assembled_pot',{...potToEquipmentParams(pot),markMm:5});
const water=(mg=20000,hist=1)=>lot('water','process_water',mg,{history_complete:hist},'jar');
const gaugeReq=(from,to,st=null,actions=[],params={})=>q(BAROMETER_POT_PROCESS,from,to,[params.water??water()],st,actions,{equipment:[params.bulb??bulb(fixtureSealed)],...params,...(params.pressureHPa!==undefined?{environment:{sampleId:'env:'+from,source:'record',effectiveAt:from,airTempC:28,pressureHPa:params.pressureHPa}}:{})});
const result={target:path.basename(target),processes:{seal:TAR_SEAL_PROCESS,gauge:BAROMETER_POT_PROCESS},passed:{},findings:{},consultations:{}};
result.passed.fixtureTubeChain={sealStatus:fixtureSealedR.status,sealBalance:bal(fixtureSealedR),sealPot:fixtureSealed,sealRead:readPot(fixtureSealed),leakStatus:fixtureLeakR.status,leakBalance:bal(fixtureLeakR),leakRead:readPot(fixtureLeak),assembledParams:potToEquipmentParams(fixtureLeak),worn:potQualityOnReturn(fixtureLeak.quality,.9),sherdsQuality:potSherdsQuality(fixtureLeak.quality),sameMassForSherds:fixtureLeak.amount.value};
// Generate an actual resident-made jar, with no manually fabricated fired-potted quality.
const clay=lot('clay','prepared_clay',5000000,{water_ppm:200000,xd_kaolinite_ppm:600000,xd_quartz_ppm:380000,history_complete:1});
const shape=step(q(POT_SHAPE_PROCESS,0,4*H,[clay],null,[act(0,'plan',{form:2,capacityMl:500})],{energy:[{sourceId:'hands',kind:'mechanical',maxJ:20*4*3600}]}));
const green=back(shape.produced[0],'green');let st=null,dryR;
for(let t=0;t<8*D;t+=6*H){dryR=step(q(POT_DRY_PROCESS,t,t+6*H,[green],st,t+6*H>=8*D?[act(t+6*H-30000,'take_off')]:[],{equipment:[eq('rack','drying_rack',{sunExposure:0})]}));st=dryR.state;if(dryR.status!=='running')break;}
const dry=back(dryR.produced[0],'dry');let realPot=null;
for(let seed=1;seed<100&&!realPot;seed++){let state=null,firedR;for(let t=0;t<2*D;t+=3*H){firedR=step(q(PIT_FIRE_PROCESS,t,t+3*H,[dry,lot('fuel','firewood',40000000,{water_ppm:150000,history_complete:1})],state,t===0?[act(0,'fire_plan',{preheatMin:60,pace:0,targetGlow:1,holdMin:30,forcedCooling:0})]:[],{seed,equipment:[eq('pit','open_fire_pit')]}));state=firedR.state;if(firedR.status!=='running')break;}const p=firedR.produced[0];if(p.materialId==='fired_pot'&&p.quality.crack===0)realPot=back(p,'real-fired');}
if(!realPot)throw Error('no intact real fired pot');
const realSealedR=seal(realPot),realSealed=potOf(realSealedR),realLeakR=leak(realSealed),realLeak=potOf(realLeakR);
const realGaugeR=step(gaugeReq(0,H+1,null,[act(60000,'read_gauge'),act(H,'take_out')],{bulb:bulb(realLeak)}));
const realWater=back(realGaugeR.produced[0],'real-water-returned');
const realGaugeAgainR=step(q(BAROMETER_POT_PROCESS,0,H+1,[realWater],null,[act(60000,'read_gauge'),act(H,'take_out')],{equipment:[bulb(realLeak)]}));
result.passed.realPotChain={input:realPot,sealed:realSealed,leakReturned:realLeak,sealBalance:bal(realSealedR),leakBalance:bal(realLeakR),gaugeStatus:realGaugeR.status,gaugeBalance:bal(realGaugeR),waterReturned:realGaugeR.produced,gaugeAgainStatus:realGaugeAgainR.status,gaugeAgainBalance:bal(realGaugeAgainR),historyKept:realGaugeAgainR.produced[0]?.quality?.history_complete};
const shortSealedR=seal(fixture(),200),short=potOf(shortSealedR),shortBulb=bulb(short);
const shortSetup=step(gaugeReq(0,30000,null,[],{bulb:shortBulb}));
const finish=(withRead)=>step(gaugeReq(30000,30002,shortSetup.state,[...(withRead?[act(30000,'read_gauge')]:[]),act(30001,'take_out')],{bulb:shortBulb,pressureHPa:950}));
const noRead=finish(false),withRead=finish(true);
result.passed.boundaryReadKeepsMass={setupStatus:shortSetup.status,noRead:{condition:noRead.diagnostics.condition,produced:noRead.produced,released:noRead.released,spilledMg:noRead.diagnostics.spilledMg,balance:bal(noRead)},withRead:{condition:withRead.diagnostics.condition,produced:withRead.produced,released:withRead.released,spilledMg:withRead.diagnostics.spilledMg,balance:bal(withRead),observations:withRead.observations}};
// More than the geometrical fill volume is not allowed to change the initial setting. Track what happens to the spare.
const tubeNeedMg=Math.ceil(Math.PI*(8/2000)**2*(200/2000)*1e9);
const overfill=[];
for(const mg of [tubeNeedMg,tubeNeedMg+1,20000,100000]){
 const set=step(gaugeReq(0,30000,null,[],{bulb:shortBulb,water:water(mg)}));
 const spill=step(gaugeReq(30000,60002,set.state,[act(60000,'read_gauge'),act(60001,'take_out')],{bulb:shortBulb,water:water(mg),pressureHPa:910}));
 overfill.push({waterMg:mg,needMg:tubeNeedMg,status:spill.status,condition:spill.diagnostics.condition,spilledMg:spill.diagnostics.spilledMg,produced:spill.produced,released:spill.released,balance:bal(spill),observations:spill.observations});
}
result.findings.extraWaterStock={classification:'C',ordinaryImpactConfirmed:false,tubeNeedMg,runs:overfill};
const below=step(gaugeReq(0,30000,null,[],{bulb:shortBulb,water:water(tubeNeedMg-1)}));
const atMinimum=step(gaugeReq(0,30000,null,[],{bulb:shortBulb,water:water(tubeNeedMg)}));
result.passed.minimumFillCheck={needMg:tubeNeedMg,belowStatus:below.status,belowReason:below.evidence.notes,belowConsumed:below.consumed,minimumStatus:atMinimum.status};
// Stable or bubbled-out water can be returned/reused; incompleteness must not be healed by setting again.
const returnChecks=[];
for(const p of [1010,1100])for(const hist of [0,1]){
 const w=water(20000,hist),initial=step(gaugeReq(0,30000,null,[],{bulb:shortBulb,water:w}));
 const end=step(gaugeReq(30000,60002,initial.state,[act(60000,'read_gauge'),act(60001,'take_out')],{bulb:shortBulb,water:w,pressureHPa:p}));
 const returned=end.produced[0];const again=returned?step(q(BAROMETER_POT_PROCESS,0,30001,[back(returned,'water-return')],null,[act(30000,'take_out')],{equipment:[shortBulb]})):null;
 returnChecks.push({p,hist,condition:end.diagnostics.condition,balance:bal(end),returned,endAgainStatus:again?.status,reusedBalance:again?bal(again):null,reusedHistory:again?.produced[0]?.quality?.history_complete});
}
result.passed.waterReturnChains=returnChecks;
// Ordinary integer tube mass changes are ppm resolution; retain the cumulative values without calling them a large physical failure.
let pot=fixtureSealed;const tubeRounds=[];
for(let i=0;i<20;i++){const before=readPot(pot),r=leak(pot),out=potOf(r),after=readPot(out);tubeRounds.push({i,totalBefore:pot.amount.value,totalAfter:out.amount.value,tubeBeforeMg:before.tube.mg,tubeAfterMg:after.tube.mg,balance:bal(r),history:out.quality.history_complete});pot=out;}
result.consultations.tubePpmResolution=tubeRounds;
// An accepted sub-ppm tube is an artificial boundary, distinct from the normal 40g hardware above.
const smallTube=step(q(TAR_SEAL_PROCESS,0,H,[fixture(),lot('tar-small','wood_tar',30000,{x_wood_tar_ppm:1000000}),lot('tiny-tube','gauge_tube_test',1,{bore_mm:8,length_mm:600})],null,[act(60000,'seal',{jointTarG:6})],{equipment:[eq('brush','fixture_tar_brush')],energy:[{sourceId:'hands',kind:'mechanical',maxJ:20*3600}]}));
const heavySmallTube=step(q(TAR_SEAL_PROCESS,0,H,[lot('heavy-pot','fired_pot_test',2000000,{capacity_ml:2000,absorption_ppm:120000}),lot('tar-small','wood_tar',30000,{x_wood_tar_ppm:1000000}),lot('tiny-tube','gauge_tube_test',1,{bore_mm:8,length_mm:600})],null,[act(60000,'seal',{jointTarG:6})],{equipment:[eq('brush','fixture_tar_brush')],energy:[{sourceId:'hands',kind:'mechanical',maxJ:20*3600}]}));
const readBack=r=>{try{return {accepted:true,read:readPot(potOf(r))}}catch(e){return {accepted:false,error:String(e.message)}}};
result.consultations.subPpmTube={small:{status:smallTube.status,produced:smallTube.produced,balance:bal(smallTube),read:readBack(smallTube)},heavy:{status:heavySmallTube.status,produced:heavySmallTube.produced,balance:bal(heavySmallTube),read:readBack(heavySmallTube)}};
result.summary={calls,violations};
const dest=process.argv[3]??path.join(path.dirname(new URL(import.meta.url).pathname),'result.json');fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({calls,violations:violations.length,lookNoRead:noRead.diagnostics.spilledMg,lookWithRead:withRead.diagnostics.spilledMg,needMg:tubeNeedMg,overfill:overfill.map(r=>({in:r.waterMg,spilled:r.spilledMg,back:r.produced[0]?.amount.value})),output:dest},null,2));
